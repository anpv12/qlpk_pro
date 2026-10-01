'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadMedicinePage } = require('./helpers/medicine-page');

// Medicine form filled as after choosing a DAV medicine, with the price/stock/cost/expiry inputs holding values.
async function setup() {
    const page = await loadMedicinePage();
    const form = await page.load('medicines/management-form.js');
    const { ClinicMedicineCatalog } = await page.load('medicines/clinic-catalog.js');
    ClinicMedicineCatalog.payload = () => null;
    const values = { importedTypeValue: 'false', prescriptionTypeValue: 'BASIC', unitsPerBox: '30', saleUnitValue: 'viên', saleUnit: 'viên',
        'medicine-name': 'Thuốc', 'medicine-unit_price': '1000', stockQuantityInput: '999' };
    Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
    document.getElementById('packagingUnit').value = 'hộp';
    page.state.editingMedicineId = 9;
    const saves = () => page.requests.filter(request => request.url === '/api/medicines/9');
    const error = () => document.getElementById('medicineFormError');
    return { ...page, form, saves, error };
}

test('ordinary save excludes price and stock/cost/expiry and blocks repeated submits', async () => {
    const h = await setup();
    h.form.saveMedicine(); h.form.saveMedicine();
    assert.equal(h.saves().length, 1);
    assert.equal(h.saves()[0].init.method, 'PUT');
    const data = h.saves()[0].body;
    assert.equal(data.name, 'Thuốc');
    assert.equal(data.unit, 'viên');
    assert.equal(data.units_per_box, 30);
    for (const field of ['unit_price', 'stock_quantity', 'import_price', 'expiry_date']) assert.equal(field in data, false, field);
    assert.equal(document.getElementById('medicineSaveButton').disabled, true);
    h.saves()[0].respond({ error: 'SQLAlchemy traceback', user_message: 'technical detail' }, 500);
    await h.flush();
    assert.equal(h.toasts.some(([, text]) => /SQLAlchemy|technical detail/.test(text)), false);
    assert.equal(h.toasts.at(-1)[1], 'Không lưu được thông tin thuốc. Hãy thử lại.');
    assert.equal(h.error().textContent, 'Không lưu được thông tin thuốc. Hãy thử lại.');
    assert.equal(document.getElementById('medicineSaveButton').disabled, false);
    h.form.saveMedicine();
    assert.equal(h.saves().length, 2);
    h.saves()[1].respond({ error: 'Trùng', user_message: 'Thuốc đã tồn tại' }, 409);
    await h.flush();
    assert.equal(h.error().textContent, 'Thuốc đã tồn tại');
});

test('a response for a previous form never closes or overwrites the current form', async () => {
    const h = await setup();
    const hidden = [];
    h.window.bootstrap.Modal.getOrCreateInstance = node => ({ show() {}, hide() { hidden.push(node.id); } });
    h.form.saveMedicine();
    h.form.resetForm();
    h.saves()[0].respond({ user_message: 'Sai thông tin' }, 400);
    await h.flush();
    assert.deepEqual(h.toasts, []);
    assert.deepEqual(hidden, []);
    assert.equal(h.error().classList.contains('d-none'), true);
});

test('typing over a prescription selection requires a valid choice again', async () => {
    const h = await setup();
    document.getElementById('prescriptionTypeValue').value = '';
    h.form.saveMedicine();
    assert.equal(h.saves().length, 0);
    assert.match(h.toasts[0][1], /Loại đơn thuốc/);
});
