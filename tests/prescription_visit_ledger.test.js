'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function setup() {
    const modules = {
        supportRuntime: {
            escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
            formatCurrency: value => `${value} đ`, textOf: value => value || '', toNumber: value => Number(value) || 0
        },
        prescriptionModel: {}
    };
    const window = { QLPKDoctorModuleRegistry: {get: name => modules[name], register: (name, api) => { modules[name] = api; }},
        PrescriptionTypeContract: {getLabel: value => value} };
    vm.runInNewContext(fs.readFileSync('app/static/js/doctor-examination/prescription-history-ui.js', 'utf8'), {window});
    return modules.prescriptionHistory;
}

test('fully refunded visit stays visible and cannot become a reusable prescription', () => {
    const api = setup();
    const history = [{prescriptions: [], medicine_transactions: [{id: 1}]}];
    assert.equal(api.getVisits(history).length, 1);
    assert.equal(api.getEntries(history).length, 0);
    assert.equal(api.getVisitMedicines(api.getVisits(history)[0]).length, 0);
});

test('history renders unknown prices without silently converting them to zero and escapes data', () => {
    const api = setup();
    const nodes = new Map();
    const root = {querySelector: selector => {
        if (!nodes.has(selector)) nodes.set(selector, {});
        return nodes.get(selector);
    }, querySelectorAll: () => []};
    api.render({root, document: root, history: [{prescriptions: [], medicine_transactions: [
        {id: 2, type: 'return', quantity: 3, medicine_name: '<script>bad</script>', batch_number: 'N',
            price: 1000, sale_unit_price: null, sale_amount_delta: null, original_transaction_id: 1,
            balance_after: 0, stock_balance_after: null, unit: 'viên'}
    ]}]});
    const html = nodes.get('#doctorPrescriptionHistoryDetail').innerHTML;
    assert.match(html, /Chưa rõ/);
    assert.match(html, /Thiếu truy vết/);
    assert.match(html, /&lt;script>/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /disabled/);
    assert.match(html, /← #1/);
    assert.match(html, /Tồn lô sau giao dịch/);
    assert.match(html, /Tồn tổng sau giao dịch/);
    assert.match(html, /<td>0 viên<\/td><td>Chưa rõ<\/td>/);
});

test('editor keeps current stock and allocations without showing movement history', () => {
    const modules = {
        supportRuntime: {
            escapeHtml: value => String(value).replaceAll('<', '&lt;'),
            escapeAttr: value => String(value).replaceAll('"', '&quot;')
        },
        prescriptionModel: {formatDoseValue: value => value || '', PRESCRIPTION_SLOT_DEFS: [],
            PRESCRIPTION_USAGE_MODES: {TIME_SLOTS: 'time_slots', TIMES_PER_DAY: 'times_per_day'}}
    };
    const window = {QLPKHtml: require('./helpers/html-escape').QLPKHtml, QLPKDoctorModuleRegistry: {get: name => modules[name], register: (name, api) => {modules[name] = api;}},
        PrescriptionTypeContract: {DOCUMENT_TYPES: ['BASIC'], toDocumentType: () => 'BASIC', getLabel: () => 'Cơ bản'}};
    const { createWindow } = require('./helpers/fake-dom');
    const { document } = createWindow({ html: '<table id="doctorPrescriptionTable"><thead id="doctorPrescriptionTableHead"></thead><tbody id="doctorPrescriptionList"></tbody></table><div id="doctorPrescriptionEmptyState"></div>' });
    runScriptFile('app/static/js/doctor-examination/prescription-row-renderer.js', vm.createContext({window, document, Intl}));
    const root = document;
    const nodes = new Map([['#doctorPrescriptionList', document.getElementById('doctorPrescriptionList')]]);
    const row = {uid: 'qa', medicineId: 1, name: 'Thuốc', unit: 'viên', quantity: 2, currentStockQuantity: 20,
        batchAllocation: {batch_allocation_status: 'allocated', batch_allocations: [{batch_id: 1, batch_number: '<lô>', quantity: 2}],
            stock_movements: [{id: 10, type: 'export', quantity: -2, batch_number: '<lô>', balance_after: 0,
                stock_balance_after: null}, {id: 11, type: 'return', quantity: 1, balance_after: 1, stock_balance_after: 21}]}};
    const render = () => {
        modules.prescriptionRows.render({root, document: root, rows: [row], getRowTotal: () => '0 đ'});
        return nodes.get('#doctorPrescriptionList').innerHTML;
    };
    const html = render();
    assert.match(html, /Tồn tổng hiện tại: <strong>20<\/strong>/);
    assert.doesNotMatch(html, /Tồn sau từng giao dịch|Tồn lô sau giao dịch|Tồn tổng sau giao dịch|<details/);
    assert.match(html, /Đã cấp 2 viên/);
    assert.match(html, /&lt;lô&gt;/);
    row.batchAllocation.batch_allocation_status = 'partially_tracked';
    assert.doesNotMatch(render(), /doctor-prescription-batches|Tồn sau từng giao dịch/);
    row.isExternal = true;
    assert.doesNotMatch(render(), /Tồn tổng hiện tại|Tồn sau từng giao dịch/);
    row.isExternal = false;
    row.batchAllocation = null;
    row.currentStockQuantity = null;
    assert.doesNotMatch(render(), /Tồn tổng hiện tại|Tồn sau từng giao dịch/);
});
