'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');

function setup() {
    const env = require('./helpers/autocomplete-dom').createEnvironment();
    const {window, document, context, Element} = env;
    const nodes = {}, requests = [], modal = {};
    let now = 1000, token = 'test', realtime;
    const field = env.createField('davSearchField');
    for (const [part, id] of Object.entries({root:'davSearchField', input:'davSearchInput', tags:'davSearchTags', list:'davSearchResults', dropdown:'davDropdown'})) {
        field[part].id = id; nodes[id] = field[part];
    }
    const get = id => {
        if (!nodes[id]) { const node = new Element(); node.id = id; document.body.append(node); nodes[id] = node; }
        return nodes[id];
    };
    document.getElementById = get;
    get('davSearchControls').append(field.root);
    get('medicineForm').querySelector = selector => get(selector.match(/name="([^"]+)"/)[1]);
    // Simulate bubbling for the public input interactions in this fixture.
    const fire = field.input.fire.bind(field.input);
    field.input.select = () => {};
    field.input.fire = (type, event = {}) => {
        if (type === 'blur') { document.activeElement = null; return field.root.fire('focusout', {relatedTarget:null}); }
        if (type === 'click') return field.control.fire('click', {target:field.input});
        return fire(type, event);
    };
    Object.assign(window, {
        showCustomToast() {},
        updatePackagingInfo: () => {window.packagingUpdated = true;},
        jQuery: () => ({modal: () => {window.closed = true;}, on: (event, fn) => {modal[event] = fn;}}),
        editMedicine: id => {window.edited = id;},
        QLPKRealtimePageHooks: {register: options => {realtime = options.handler;}},
        QLPKApiTransport: {hasSession: () => Boolean(token), sessionRevision: () => `legacy:${token}`}
    });
    Object.assign(context, {Date:{now:()=>now}, localStorage:{getItem:()=>token},
        fetch:(url, options)=>new Promise(resolve=>requests.push({url, options, resolve}))});
    env.load('app/static/js/components/autocomplete-field.js');
    env.load('app/static/js/medicines/clinic-catalog.js');
    document.fire('DOMContentLoaded');
    const input = text => {field.input.value = text; field.input.fire('input');};
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const tick = async () => {env.tick(); await flush();};
    const respond = async (index, data, totalPages = 1, ok = true) => {
        const requestedPage = Number(new URLSearchParams(requests[index].url.split('?')[1]).get('page'));
        requests[index].resolve({ok, json:async()=>({success:ok, data, has_more:requestedPage < totalPages})});
        await flush();
    };
    return {get, input, tick, flush, respond, requests, modal, api:window.ClinicMedicineCatalog, window,
        advance:ms=>{now += ms;}, token:value=>{token = value;}, inventoryChanged:()=>realtime()};
}
const item = (id, extra = {}) => ({id, name:`Thuốc ${id}`, active_ingredient:`Hoạt chất ${id}`, strength:'10mg', registration_number:`VD-${id}`, updated_at:'v1', ...extra});

test('selected DAV summary titles the modal guide and shows labeled identity rows without duplicates', async () => {
    const h = setup();
    h.input('nhãn'); await h.tick();
    await h.respond(0, [item(31, {dosage_form:'Viên nén bao phim', packaging:'Hộp 05 vỉ x 10 viên',
        manufacturer_name:'Nhà máy Stada Việt Nam', manufacturer_country:'Việt Nam'})]);
    h.get('davSearchResults').children[0].fire('click');
    assert.equal(h.get('medicineFlowGuide').textContent, 'Thông tin đăng ký thuốc (Cục Quản lý Dược)');
    const rowText = node => node.children.map(part => part.textContent).join('');
    assert.deepEqual(h.get('davSelection').children.map(rowText), [
        'Tên thuốc: Thuốc 31',
        'Hàm lượng: 10mg',
        'Hoạt chất: Hoạt chất 31',
        'Dạng bào chế: Viên nén bao phim',
        'Đóng gói: Hộp 05 vỉ x 10 viên',
        'Nhà sản xuất: Nhà máy Stada Việt Nam',
        'Nước sản xuất: Việt Nam',
        'SĐK: VD-31'
    ]);
    assert.equal(h.get('davSelection').children[0].className, 'mm-dav-name');
    h.get('davChangeButton').fire('click');
    assert.equal(h.get('medicineFlowGuide').textContent, 'Chọn thuốc trong danh mục DAV, sau đó kiểm tra thông tin phòng khám.');
    h.api.setExisting({id:5, name:'Thuốc cũ 5mg', generic_name:'Thuốc cũ 5mg', strength:'5mg', origin:'Việt Nam'});
    assert.equal(h.get('medicineFlowGuide').textContent, 'Thông tin thuốc gốc (chưa liên kết Cục Quản lý Dược)');
    assert.deepEqual(h.get('davSelection').children.map(rowText), [
        'Tên thuốc: Thuốc cũ 5mg',
        'Nhà sản xuất: Chưa ghi nhận',
        'Nước sản xuất: Việt Nam'
    ]);
    const template = fs.readFileSync(path.join(__dirname, '../app/templates/medicine-management.html'), 'utf8');
    for (const field of ['id="medicine-name" name="name"', 'id="genericNameInput"',
        'id="medicine-origin" name="origin"', 'id="medicine-strength" name="strength"']) {
        assert.match(template, new RegExp(`<input ${field} type="hidden"/>`));
    }
    assert.doesNotMatch(template, /for="medicine-origin"|for="medicine-strength"|for="medicine-name"|for="genericNameInput"/);
    assert.doesNotMatch(template, /id="davSelectionTitle"/);
});

test('expiry action is available only for existing batches and clears when switching medicines', () => {
    const h = setup();
    assert.equal(h.get('medicine-expiry_date').disabled, true);
    h.api.setExisting({id:1, name:'Thuốc', batch_count:2});
    assert.equal(h.get('medicine-expiry_date').disabled, false);
    assert.equal(h.get('medicineExpiryLabel').textContent, 'Xem hạn dùng');
    assert.equal(h.get('medicineExpiryIcon').hidden, false);
    h.api.setExisting({id:2, name:'Thuốc khác', batch_count:0});
    assert.equal(h.get('medicine-expiry_date').disabled, true);
    assert.equal(h.get('medicineExpiryLabel').textContent, 'Chưa có lô');
    assert.equal(h.get('medicineExpiryIcon').hidden, true);
    h.api.reset();
    assert.equal(h.get('medicine-expiry_date').disabled, true);
});

test('edit displays readonly latest receipt cost and sale price and resets both', () => {
    const h = setup();
    h.api.setExisting({id:1, name:'Thuốc', unit_price:9000,
        latest_batch_pricing:{batch_id:2, import_price:0, sale_price:null}});
    assert.equal(h.get('medicine-import_price').value, 0);
    assert.equal(h.get('medicine-unit_price').value, 9000);
    assert.equal(h.get('medicine-unit_price').disabled, true);
    assert.equal(h.get('medicine-unit_price').readOnly, true);
    assert.equal(h.get('medicine-import_price').disabled, true);
    assert.equal(h.get('medicine-import_price').readOnly, true);
    h.api.reset();
    assert.equal(h.get('medicine-import_price').value, '');
    assert.equal(h.get('medicine-import_price').placeholder, 'Chưa có');
    assert.equal(h.get('medicine-unit_price').value, '');
    h.api.setExisting({id:3, name:'Chưa nhập', unit_price:5000});
    assert.equal(h.get('medicine-unit_price').value, 5000);
    h.api.setExisting({id:4, name:'Giá 0', unit_price:0});
    assert.equal(h.get('medicine-unit_price').value, 0);
});

test('liquid suggestions fill partial defaults, preserve DAV range and clear on change', async () => {
    const h = setup();
    h.input('FDG'); await h.tick();
    await h.respond(0, [item(31940, {name:'(18)F-FDG (FDG)', packaging:'Lọ 15,8-16ml',
        clinic_defaults:{administration_method:'', suggested_administration_method:'Tiêm',
            unit:'ml', packaging_unit:'lọ', units_per_box:null, is_imported:false}})]);
    h.get('davSearchResults').children[0].fire('click');
    assert.equal(h.get('administrationMethod').value, 'Tiêm');
    assert.equal(h.get('administrationMethodValue').value, 'Tiêm');
    assert.equal(h.get('administrationMethod').disabled, false);
    assert.equal(h.get('saleUnit').value, 'ml');
    assert.equal(h.get('saleUnitValue').value, 'ml');
    assert.equal(h.get('packagingUnit').value, 'lọ');
    assert.equal(h.get('unitsPerBox').value, '');
    assert.equal(h.get('davPackagingText').textContent, 'Lọ 15,8-16ml · ');
    assert.equal(h.api.payload({is_imported:false}), null);
    h.get('davChangeButton').fire('click');
    assert.equal(h.get('davPackagingText').textContent, '');
    assert.equal(h.get('davPackagingText').hidden, true);
    assert.equal(h.get('saleUnit').value, '');
    assert.equal(h.get('administrationMethodValue').value, '');
    h.api.setExisting({id:9,reference_catalog_id:20,reference_identity:{packaging:'Hộp 30 viên'},catalog_locked_fields:[]});
    assert.equal(h.get('davPackagingText').textContent, 'Hộp 30 viên · ');
});

test('original form stays visible; DAV selection unlocks settings and source values stay locked', async () => {
    const h = setup();
    assert.equal(h.get('medicineEditFields').hidden, false);
    assert.equal(h.get('medicineEditFields').disabled, true);
    assert.equal(h.get('medicineSaveButton').disabled, true);
    h.input('drug'); await h.tick();
    await h.respond(0, [item(3, {clinic_defaults:{administration_method:'Uống', is_imported:false}})]);
    h.get('davSearchResults').children[0].fire('click');
    assert.equal(h.get('medicineEditFields').disabled, false);
    assert.equal(h.get('medicineSaveButton').disabled, false);
    assert.equal(h.get('administrationMethod').disabled, true);
    assert.equal(h.get('importedType').disabled, true);
    h.get('davChangeButton').fire('click');
    assert.equal(h.get('medicineEditFields').disabled, true);
    assert.equal(h.get('medicineSaveButton').disabled, true);
    assert.equal(h.get('administrationMethodValue').value, '');
    h.api.setExisting({id:9, reference_catalog_id:3, catalog_locked_fields:['administration_method','is_imported'], conversion_locked:true});
    const data = {unit:'hộp', units_per_box:99, administration_method:'Tiêm', is_imported:true, unit_price:2000};
    assert.equal(h.api.payload(data), null);
    assert.deepEqual(data, {});
    assert.equal(h.get('saleUnit').disabled, true);
});



test('editing waits for the latest medicine load and ignores stale responses', () => {
    const source = readMedicineManagementSource();
    const code = source.slice(source.indexOf('let medicineEditRevision ='), source.indexOf('// Populate medicine form with data'));
    const requests = [], calls = [];
    const context = vm.createContext({localStorage:{getItem:()=> 'test'}, resetForm(){}, showCustomToast(){},
        $:{ajax: request=>requests.push(request)}, populateMedicineForm:(data,id)=>calls.push(['populate',id]),
        window:{QLPKApiTransport:{hasSession:()=>true}}});
    vm.runInContext(code, context);
    context.editMedicine(1);
    assert.deepEqual(calls, []);
    context.editMedicine(2);
    requests[0].success({id:1});
    assert.deepEqual(calls, []);
    requests[1].success({id:2});
    assert.deepEqual(calls, [['populate',2]]);
    context.editMedicine(3);
    requests[2].success({id:3});
    assert.deepEqual(calls.at(-1), ['populate',3]);
});

test('DAV defaults fill paired inputs; saving is not blocked by manual confirmation and changing drug clears all suggestions', async () => {
    const h = setup();
    h.input('mapped'); await h.tick();
    await h.respond(0, [item(20, {dosage_form:'Viên nén', packaging:'Hộp 3 vỉ x 10 viên', clinic_defaults:{
        unit:'viên', packaging_unit:'hộp', units_per_box:30, administration_method:'Uống', is_imported:false
    }})]);
    h.get('davSearchResults').children[0].fire('click');
    assert.equal(h.get('saleUnit').value, 'viên');
    assert.equal(h.get('saleUnitValue').value, 'viên');
    assert.equal(h.get('unitsPerBox').value, 30);
    assert.equal(h.get('administrationMethodValue').value, 'Uống');
    assert.equal(h.get('importedType').value, 'Nội');
    assert.equal(h.get('importedTypeValue').value, 'false');
    assert.equal(h.api.payload({}), null);
    h.get('saleUnit').value = 'ml'; // Custom dropdowns may set value without input/change.
    assert.equal(h.api.payload({}), null);
    h.get('davChangeButton').fire('click');
    for (const field of ['saleUnit','saleUnitValue','packagingUnit','unitsPerBox','administrationMethod','administrationMethodValue','importedType','importedTypeValue']) {
        assert.equal(h.get(field).value, '', field);
    }
});


test('debounce and stale responses cannot replace the current query or reopen a closed modal', async () => {
    const h = setup();
    h.input('ab'); h.input('abc'); await h.tick();
    assert.equal(h.requests.length, 1);
    assert.match(h.requests[0].url, /search=abc/);
    h.input('new'); await h.tick();
    assert.equal(h.requests[0].options.signal.aborted, true);
    await h.respond(1, [item(2)]);
    await h.respond(0, [item(1)]);
    assert.equal(h.get('davSearchResults').children[0].children[0].textContent, 'Thuốc 2 · 10mg');
    h.input('later'); await h.tick();
    h.modal['hide.bs.modal']();
    await h.respond(2, [item(3)]);
    assert.equal(h.get('davDropdown').hidden, true);
    assert.equal(h.get('davSearchResults').children.length, 0);
});

test('empty focus immediately loads choices; typing filters and clearing restores the full list', async () => {
    const h = setup();
    h.get('davSearchInput').focus();
    assert.equal(h.requests.length, 1);
    assert.equal(h.get('davDropdown').hidden, false);
    assert.equal(new URLSearchParams(h.requests[0].url.split('?')[1]).get('search'), '');
    await h.respond(0, [item(1)], 2);
    h.get('davSearchResults').scrollTop = 300;
    h.get('davSearchResults').fire('scroll');
    assert.match(h.requests[1].url, /page=2/);
    await h.respond(1, [item(2)], 2);
    h.input('a'); await h.tick();
    assert.equal(new URLSearchParams(h.requests[2].url.split('?')[1]).get('search'), 'a');
    await h.respond(2, [item(3)]);
    h.input(''); await h.tick();
    assert.equal(h.requests.length, 3);
    assert.match(h.get('davSearchResults').children[0].children[0].textContent, /Thuốc 1/);
    h.get('davSearchInput').fire('keydown', {key:'Escape'});
    h.get('davSearchInput').fire('click');
    assert.equal(h.requests.length, 3);
    assert.equal(h.get('davDropdown').hidden, false);
});

test('keyboard selection fills identity and changing selection prevents saving an old DAV id', async () => {
    const h = setup();
    h.input('thuoc'); await h.tick(); await h.respond(0, [item(10), item(11)]);
    h.get('davSearchInput').fire('keydown', {key:'ArrowDown'});
    h.get('davSearchInput').fire('keydown', {key:'Enter'});
    const data = {};
    assert.equal(h.api.payload(data), null);
    assert.equal(data.reference_catalog_id, 10);
    assert.equal(data.reference_version, 'v1');
    assert.equal(h.get('name').value, 'Thuốc 10');
    assert.equal(h.get('davDropdown').hidden, true);
    assert.equal(h.get('davSearchControls').hidden, true);
    h.get('davChangeButton').fire('click');
    assert.equal(h.get('name').value, '');
    assert.match(h.api.payload({}), /chọn thuốc/);
});

test('scroll appends pages once, keeps existing results, and stops at the last page', async () => {
    const h = setup();
    h.input('thuoc'); await h.tick(); await h.respond(0, [item(1)], 2);
    h.get('davSearchResults').scrollTop = 300;
    h.get('davSearchResults').fire('scroll'); h.get('davSearchResults').fire('scroll');
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].url, /page=2/);
    await h.respond(1, [item(2)], 2);
    assert.equal(h.get('davSearchResults').children.length, 2);
    h.get('davSearchResults').fire('scroll');
    assert.equal(h.requests.length, 2);
});



test('Escape/blur cancel pending searches; Enter without an option cannot submit; errors stay readable', async () => {
    const h = setup();
    h.input('thuoc');
    h.get('davSearchInput').fire('keydown', {key:'Escape'}); await h.tick();
    assert.equal(h.requests.length, 0);
    h.input('thuoc'); await h.tick(); h.get('davSearchInput').fire('blur');
    await h.respond(0, [item(1)]);
    assert.equal(h.get('davDropdown').hidden, true);
    let prevented = false;
    h.get('davSearchInput').fire('keydown', {key:'Enter', preventDefault:() => {prevented = true;}});
    assert.equal(prevented, true);
    h.input('thuoc'); await h.tick(); await h.respond(1, [], 0, false);
    assert.match(h.get('davSearchResults').querySelector('[data-autocomplete-status]').textContent, /Thử lại/);
});

test('cached pages reopen without requests, expire, and clear on form/auth/inventory changes', async () => {
    const h = setup();
    h.get('davSearchInput').focus();
    assert.match(h.requests[0].url, /mode=autocomplete/);
    await h.respond(0, [item(1)]);
    h.get('davSearchInput').fire('blur'); h.get('davSearchInput').focus(); await h.flush();
    assert.equal(h.requests.length, 1);
    assert.equal(h.get('davSearchResults').children.length, 1);
    h.advance(30001);
    h.get('davSearchInput').fire('blur'); h.get('davSearchInput').focus();
    assert.equal(h.requests.length, 2);
    await h.respond(1, [item(2)]);
    h.token('different');
    h.get('davSearchInput').fire('blur'); h.get('davSearchInput').focus();
    assert.equal(h.requests.length, 3);
    await h.respond(2, [item(3)]);
    h.inventoryChanged(); h.get('davSearchInput').fire('click');
    assert.equal(h.requests.length, 4);
    await h.respond(3, [item(4)]);
    h.api.reset(); h.get('davSearchInput').fire('blur'); h.get('davSearchInput').focus();
    assert.equal(h.requests.length, 5);
});

for (const referenceId of [null, 3]) {
    test(`editing ${referenceId ? 'linked' : 'legacy'} medicine cannot select DAV or write identity`, async () => {
        const h = setup();
        h.api.setExisting({id:9, reference_catalog_id:referenceId, name:'Thuốc đang quản lý', conversion_locked:true});
        h.get('name').value = 'Thuốc đang quản lý';
        h.input('Diropam'); await h.tick();
        h.get('davChangeButton').fire('click');
        assert.equal(h.requests.length, 0);
        assert.equal(h.get('davSearchControls').hidden, true);
        assert.equal(h.get('davChangeButton').hidden, true);
        assert.equal(h.get('name').value, 'Thuốc đang quản lý');
        assert.equal(h.api.startSupplement, undefined);
        const payload = {name:'Tên khác', strength:'20mg', unit_price:4000, unit:'hộp', units_per_box:99};
        assert.equal(h.api.payload(payload), null);
        assert.deepEqual(payload, {});
    });
}

test('selecting a DAV medicine already in stock opens it instead of creating a duplicate', async () => {
    const h = setup();
    h.input('drug'); await h.tick();
    await h.respond(0, [item(3, {clinic_medicine_id:9})]);
    h.get('davSearchResults').children[0].fire('click');
    assert.equal(h.window.edited, 9);
    assert.match(h.api.payload({}), /chọn thuốc/);
});
