'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    const env = require('./helpers/autocomplete-dom').createEnvironment();
    const {document, context, Element} = env;
    const nodes = new Map(), instances = new Map(), requests = [], shown = [], ledgerCalls = [], importCalls = [];
    const get = id => {
        if (!nodes.has(id)) { const element = new Element(); element.id = id; document.body.append(element); nodes.set(id, element); }
        return nodes.get(id);
    };
    document.getElementById = get;
    const queryAll = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => selector === '.modal.show'
        ? [...nodes.values()].filter(node => node.classList.contains('modal') && node.classList.contains('show'))
        : queryAll(selector);
    const events = new Map();
    const $ = target => {
        const node = typeof target === 'string' ? get(target.replace(/^#/, '')) : target;
        return {
            data:()=>7, val:()=> 'Thuốc đang sửa', text(value) {node.textContent = value; return this;},
            html(value) {node.html = value; return this;},
            off(event) {events.set(node, (events.get(node)||[]).filter(h=>h.event !== event)); return this;},
            on(event, fn) {events.set(node,[...(events.get(node)||[]),{event,fn}]); return this;},
            one(event, fn) {events.set(node,[...(events.get(node)||[]),{event,fn,once:true}]); return this;}
        };
    };
    const fire = (node, event) => {
        for (const handler of [...(events.get(node)||[])]) {
            if (!handler.event.startsWith(event)) continue;
            if (handler.once) events.set(node,events.get(node).filter(h=>h!==handler));
            handler.fn();
        }
    };
    const instance = node => {
        if (!instances.has(node)) {
            const trap = {active:true, activate() {this.active=true;}, deactivate() {this.active=false;}};
            let backdrop;
            instances.set(node, {_focustrap:trap,
                show() {
                    shown.push(node.id); node.classList.add('show');
                    backdrop = new Element(); backdrop.classList.add('modal-backdrop'); document.body.append(backdrop);
                    document.activeElement = node;
                    fire(node,'shown.bs.modal');
                },
                hide() {
                    node.classList.remove('show'); backdrop?.remove(); trap.active=false;
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow=''; document.body.style.paddingRight='';
                    fire(node,'hidden.bs.modal');
                }});
        }
        return instances.get(node);
    };
    $.ajax = request => requests.push(request);
    Object.assign(context, {$, bootstrap:{Modal:{getOrCreateInstance:instance}},
        medicineSaving:false, medicines:[{id:7,name:'Thuốc'}], allMedicines:[],
        localStorage:{getItem:()=> 'test'},
        // Nhập kho theo đơn hàng thật (form reset/autocomplete) đã có smoke test
        // riêng (medicine_import_layout/medicine_import_ledger); ở đây chỉ cần
        // effect duy nhất mà showStockDetail phụ thuộc: mở overlay importBatchModal.
        showImportBatchModal(preselectMedicineId) {
            importCalls.push(preselectMedicineId ?? null);
            context.showInventoryOverlay(document.getElementById('importBatchModal'));
        },
        openImportLedger: options => ledgerCalls.push(options)});
    const edit = get('medicineModal'), imp = get('importBatchModal');
    [edit,imp].forEach(node=>node.classList.add('modal'));
    edit.classList.add('show'); edit.setAttribute('aria-modal','true');
    const trigger = get('medicine-expiry_date'); edit.append(trigger); trigger.isConnected=true; trigger.focus();
    const input = get('unsaved-price'); input.value='9500'; edit.append(input);
    document.body.classList.add('modal-open'); document.body.style.overflow='hidden'; document.body.style.paddingRight='15px';
    const source = fs.readFileSync('app/static/js/medicine-management.js','utf8');
    vm.runInContext(source.slice(source.indexOf('function showInventoryOverlay'),source.indexOf('function showImportFromMedicineForm')),context);
    return {context,get,edit,imp,trigger,input,instance,requests,shown,ledgerCalls,importCalls,document};
}

test('expiry reuses the merged Nhập kho dialog and expands its ledger without hiding or resetting the medicine form', () => {
    const h=setup();
    h.context.showMedicineExpiry(); h.context.showMedicineExpiry();
    assert.deepEqual(h.importCalls,[null]);
    assert.deepEqual(h.shown,['importBatchModal']);
    assert.equal(h.ledgerCalls.length,1);
    assert.equal(h.ledgerCalls[0].medicineId,7);
    assert.equal(h.ledgerCalls[0].search,'Thuốc');
    assert.equal(h.edit.classList.contains('show'),true);
    assert.equal(h.edit.inert,true);
    assert.equal(h.instance(h.edit)._focustrap.active,false);
    assert.equal(h.imp.dataset.inventoryModalLayer,'1');
    h.instance(h.imp).hide();
    assert.equal(h.edit.inert,false);
    assert.equal(h.edit.getAttribute('aria-modal'),'true');
    assert.equal(h.instance(h.edit)._focustrap.active,true);
    assert.equal(h.document.activeElement,h.trigger);
    assert.equal(h.input.value,'9500');
    assert.equal(h.document.body.classList.contains('modal-open'),true);
    assert.equal(h.document.body.style.overflow,'hidden');
    assert.equal(h.document.body.style.paddingRight,'15px');
});

test('no batches or ongoing save cannot open the merged Nhập kho dialog', () => {
    const h=setup(); h.trigger.disabled=true;
    h.context.showMedicineExpiry(); assert.equal(h.ledgerCalls.length,0);
    h.trigger.disabled=false; h.context.medicineSaving=true;
    h.context.showMedicineExpiry(); assert.equal(h.ledgerCalls.length,0);
    h.context.medicineSaving=false; h.context.showMedicineExpiry();
    assert.equal(h.ledgerCalls.length,1);
});

test('opening stock directly from the inventory list opens importBatchModal standalone and filters its ledger', () => {
    const h=setup(); h.edit.classList.remove('show');
    h.context.showStockDetail(7);
    assert.equal(h.imp.dataset.inventoryModalLayer,undefined);
    assert.deepEqual(h.shown,['importBatchModal']);
    assert.equal(h.ledgerCalls.length,1);
    assert.equal(h.ledgerCalls[0].medicineId,7);
    assert.equal(h.ledgerCalls[0].search,'Thuốc');
});

test('opening stock while the merged dialog is already shown does not reset the in-progress import form', () => {
    const h=setup();
    h.imp.classList.add('show');
    h.context.showStockDetail(7);
    assert.deepEqual(h.importCalls,[]);
    assert.equal(h.ledgerCalls.length,1);
    assert.equal(h.ledgerCalls[0].medicineId,7);
    assert.equal(h.ledgerCalls[0].search,'Thuốc');
});

test('price dialog overlays medicine form without stretching it or clearing unsaved values', () => {
    const h=setup(), price=h.get('medicinePricePanel');
    price.classList.add('modal');
    h.edit.scrollTop=215;
    h.context.showInventoryOverlay(price);
    assert.equal(h.edit.inert,true);
    assert.equal(h.edit.scrollTop,215);
    assert.equal(price.dataset.inventoryModalLayer,'1');
    h.instance(price).hide();
    assert.equal(h.edit.inert,false);
    assert.equal(h.edit.scrollTop,215);
    assert.equal(h.input.value,'9500');
    assert.equal(h.document.activeElement,h.trigger);
});

test('supplier dialog returns to the underlying medicine form without losing input or scroll', () => {
    const harness=setup(), supplier=harness.get('supplierManagementModal');
    supplier.classList.add('modal');
    harness.edit.scrollTop=215;
    harness.context.showInventoryOverlay(supplier);
    assert.equal(supplier.dataset.inventoryModalLayer,'1');
    assert.equal(harness.edit.inert,true);
    harness.instance(supplier).hide();
    assert.equal(harness.edit.inert,false);
    assert.equal(harness.edit.scrollTop,215);
    assert.equal(harness.input.value,'9500');
    assert.equal(harness.document.activeElement,harness.trigger);
});
