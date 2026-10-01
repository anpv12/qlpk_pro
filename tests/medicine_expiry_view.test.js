'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMedicinePage } = require('./helpers/medicine-page');

// Medicine form open over the page, with an unsaved value and focus on the expiry button.
async function setup() {
    const page = await loadMedicinePage();
    const stock = await page.load('medicines/management-stock.js');
    const overlay = await page.load('medicines/inventory-overlay.js');
    page.state.editingMedicineId = 7;
    page.state.medicines = [{ id: 7, name: 'Thuốc' }];
    page.state.allMedicines = [];
    const get = id => document.getElementById(id);
    const edit = get('medicineModal'), imp = get('importBatchModal');
    edit.classList.add('show'); edit.setAttribute('aria-modal', 'true');
    const trigger = get('medicine-expiry_date');
    trigger.disabled = false;
    trigger.focus();
    const input = get('medicine-unit_price'); input.value = '9500';
    document.body.classList.add('modal-open'); document.body.style.overflow = 'hidden'; document.body.style.paddingRight = '15px';
    const ledgerRequests = () => page.requests.filter(request => request.url.startsWith('/api/medicine-batches/?'));
    const importRows = () => document.querySelectorAll('#batchImportTableBody tr').length;
    return { ...page, stock, overlay, get, edit, imp, trigger, input, ledgerRequests, importRows, instance: page.modals.instance };
}

test('expiry reuses the merged Nhập kho dialog and expands its ledger without hiding or resetting the medicine form', async () => {
    const h = await setup();
    h.stock.showMedicineExpiry(); h.stock.showMedicineExpiry();
    assert.deepEqual(h.modals.shown, ['importBatchModal']);
    assert.equal(h.importRows(), 1);
    assert.equal(h.ledgerRequests().length, 1);
    assert.equal(h.ledgerRequests()[0].params.get('medicine_id'), '7');
    assert.equal(h.ledgerRequests()[0].params.get('search'), 'Thuốc');
    assert.equal(h.get('importLedgerPane').hidden, false);
    assert.equal(h.edit.classList.contains('show'), true);
    assert.equal(h.edit.inert, true);
    assert.equal(h.instance(h.edit)._focustrap.active, false);
    assert.equal(h.imp.dataset.inventoryModalLayer, '1');
    h.instance(h.imp).hide();
    assert.equal(h.edit.inert, false);
    assert.equal(h.edit.getAttribute('aria-modal'), 'true');
    assert.equal(h.instance(h.edit)._focustrap.active, true);
    assert.equal(document.activeElement, h.trigger);
    assert.equal(h.input.value, '9500');
    assert.equal(document.body.classList.contains('modal-open'), true);
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(document.body.style.paddingRight, '15px');
});

test('no batches or ongoing save cannot open the merged Nhập kho dialog', async () => {
    const h = await setup();
    h.trigger.disabled = true;
    h.stock.showMedicineExpiry(); assert.equal(h.ledgerRequests().length, 0);
    h.trigger.disabled = false;
    h.state.editingMedicineId = undefined;
    h.stock.showMedicineExpiry(); assert.equal(h.ledgerRequests().length, 0);
    h.state.editingMedicineId = 7;
    h.stock.showMedicineExpiry();
    assert.equal(h.ledgerRequests().length, 1);
});

test('opening stock directly from the inventory list opens importBatchModal standalone and filters its ledger', async () => {
    const h = await setup(); h.edit.classList.remove('show');
    h.stock.showStockDetail(7);
    assert.equal(h.imp.dataset.inventoryModalLayer, undefined);
    assert.deepEqual(h.modals.shown, ['importBatchModal']);
    assert.equal(h.ledgerRequests().length, 1);
    assert.equal(h.ledgerRequests()[0].params.get('medicine_id'), '7');
    assert.equal(h.ledgerRequests()[0].params.get('search'), 'Thuốc');
});

test('opening stock while the merged dialog is already shown does not reset the in-progress import form', async () => {
    const h = await setup();
    h.imp.classList.add('show');
    h.stock.showStockDetail(7);
    assert.equal(h.importRows(), 0);
    assert.deepEqual(h.modals.shown, []);
    assert.equal(h.ledgerRequests().length, 1);
    assert.equal(h.ledgerRequests()[0].params.get('medicine_id'), '7');
    assert.equal(h.ledgerRequests()[0].params.get('search'), 'Thuốc');
});

for (const [name, id] of [['price dialog overlays medicine form without stretching it or clearing unsaved values', 'medicinePricePanel'],
    ['supplier dialog returns to the underlying medicine form without losing input or scroll', 'supplierManagementModal']]) {
    test(name, async () => {
        const h = await setup(), dialog = h.get(id);
        h.edit.scrollTop = 215;
        h.overlay.showInventoryOverlay(dialog);
        assert.equal(h.edit.inert, true);
        assert.equal(h.edit.scrollTop, 215);
        assert.equal(dialog.dataset.inventoryModalLayer, '1');
        h.instance(dialog).hide();
        assert.equal(h.edit.inert, false);
        assert.equal(h.edit.scrollTop, 215);
        assert.equal(h.input.value, '9500');
        assert.equal(document.activeElement, h.trigger);
    });
}
