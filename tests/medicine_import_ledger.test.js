'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
const { loadMedicinePage } = require('./helpers/medicine-page');
const { readCssSource } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');

async function setup() {
    const page = await loadMedicinePage();
    const ledger = await page.load('medicines/management-import-ledger.js');
    const get = id => document.getElementById(id);
    const batch = (id, extra = {}) => ({id, medicine_name: 'Diazepam 5mg', batch_number: 'DZ' + id,
        expiry_date: '2027-08-01', quantity: 300, remaining_quantity: 260.5, import_price: 2500,
        receipt_reference: 'NK-' + id, invoice_number: 'HD00291', import_date: '2026-09-17', unit: 'viên', ...extra});
    return {...page, ledger, get, batch};
}

// Currency/number output from Intl uses a no-break space before the symbol.
const text = node => node.textContent.replace(/\u00a0/g, ' ');

test('opening the ledger switches to the Lịch sử nhập tab, loads page 1 with filters and renders rows', async () => {
    const h = await setup();
    h.ledger.openImportLedger({medicineId: 7, search: 'Diazepam'});
    assert.equal(h.get('importLedgerPane').hidden, false);
    assert.equal(h.get('importOrderPane').hidden, true);
    assert.equal(h.get('importTabLedger').classList.contains('is-active'), true);
    assert.equal(h.get('importTabLedger').getAttribute('aria-selected'), 'true');
    assert.equal(Boolean(h.get('importTabOrder').classList.contains('is-active')), false);
    assert.equal(h.get('importTabOrder').getAttribute('aria-selected'), 'false');
    assert.equal(h.get('importLedgerSearch').value, 'Diazepam');
    assert.equal(h.requests.length, 1);
    const params = new URLSearchParams(h.requests[0].url.split('?')[1]);
    assert.equal(params.get('medicine_id'), '7');
    assert.equal(params.get('search'), 'Diazepam');
    assert.equal(params.get('page'), '1');
    h.requests[0].respond({total: 1, total_pages: 1, page: 1, batches: [h.batch(1)]});
    await h.flush();
    const rows = h.get('importLedgerTableBody').children;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.mm-ledger-expander'), null);
    assert.equal(rows[0].children.length, 9);
    assert.deepEqual(Array.from(rows[0].children).slice(0, 8).map(text), [
        'Diazepam 5mg', 'DZ1', '01/08/2027', '300 viên', '260,5 viên', '2.500 ₫',
        'HD00291', '17/09/2026'
    ]);
    assert.equal(h.get('importLedgerPageInfo').textContent, '1 lô · Trang 1/1');
});

test('only a missing price with menu permission offers supplementation; zero is known', async () => {
    const h = await setup();
    const missing = h.ledger.buildImportLedgerRow(h.batch(1, {import_price: null, can_supply_import_price: true}));
    assert.equal(missing.children[5].children[0].textContent, 'Bổ sung giá');
    assert.equal(missing.children[5].children[0].className, 'badge mm-missing-price-badge');
    assert.equal(missing.children[5].children[0].type, 'button');
    const denied = h.ledger.buildImportLedgerRow(h.batch(2, {import_price: null, can_supply_import_price: false}));
    assert.equal(denied.children[5].textContent, 'Thiếu giá');
    const zero = h.ledger.buildImportLedgerRow(h.batch(3, {import_price: 0, can_supply_import_price: true}));
    assert.equal(text(zero.children[5]), '0 ₫');
});

test('missing-price filter clears stale search, resets page and can be removed', async () => {
    const h = await setup();
    const list = await h.load('medicines/management-list.js');
    h.get('searchInput').value = 'Zopinox';
    h.state.currentPage = 3;
    list.toggleMissingImportPriceFilter();
    assert.equal(h.get('searchInput').value, '');
    assert.equal(h.get('missingImportPriceFilter').getAttribute('aria-pressed'), 'true');
    assert.equal(h.get('missingImportPriceFilterState').hidden, false);
    assert.equal(h.state.currentPage, 1);
    const listRequest = h.requests.at(-1);
    assert.equal(listRequest.params.get('missing_import_price'), 'true');
    assert.equal(listRequest.params.get('search'), null);
    list.toggleMissingImportPriceFilter();
    assert.equal(h.get('missingImportPriceFilterState').hidden, true);
    assert.equal(h.requests.at(-1).params.get('missing_import_price'), null);
});

test('switching to the Lịch sử nhập tab directly (no medicine filter) also loads the ledger', async () => {
    const h = await setup();
    h.ledger.switchImportTab('ledger');
    assert.equal(h.get('importLedgerPane').hidden, false);
    assert.equal(h.requests.length, 1);
    h.requests[0].respond({total: 0, total_pages: 1, page: 1, batches: []});
    await h.flush();
    const emptyRows = h.get('importLedgerTableBody').children;
    assert.equal(emptyRows.length, 1);
    assert.equal(emptyRows[0].children[0].textContent, 'Chưa có lần nhập / tồn đầu phù hợp.');
    assert.equal(emptyRows[0].children[0].getAttribute('colspan'), '9');
    h.ledger.switchImportTab('order');
    assert.equal(h.get('importOrderPane').hidden, false);
    assert.equal(h.get('importLedgerPane').hidden, true);
    assert.equal(h.requests.length, 1);
});

test('changing filters and paging fetch again', async () => {
    const h = await setup();
    h.ledger.switchImportTab('ledger');
    h.requests[0].respond({total: 0, total_pages: 1, page: 1, batches: []});
    await h.flush();
    h.get('importLedgerStatus').value = 'Sắp hết hạn';
    h.ledger.loadImportLedger(2);
    assert.equal(h.requests.length, 2);
    const params = new URLSearchParams(h.requests[1].url.split('?')[1]);
    assert.equal(params.get('status'), 'Sắp hết hạn');
    assert.equal(params.get('page'), '2');
});

test('a stale first response cannot overwrite a newer filtered response', async () => {
    const h = await setup();
    h.ledger.switchImportTab('ledger');
    h.ledger.loadImportLedger(1);
    assert.equal(h.requests.length, 2);
    h.requests[1].respond({total: 1, total_pages: 1, page: 1, batches: [h.batch(9)]});
    await h.flush();
    h.requests[0].respond({total: 1, total_pages: 1, page: 1, batches: [h.batch(1)]});
    await h.flush();
    assert.equal(h.get('importLedgerTableBody').children[0].dataset.batchId, '9');
});

test('lot rows remain flat and do not request transactions when clicked', async () => {
    const harness = await setup();
    harness.ledger.switchImportTab('ledger');
    harness.requests[0].respond({total: 2, total_pages: 1, page: 1,
        batches: [harness.batch(1), harness.batch(2)]});
    await harness.flush();
    const rows = harness.get('importLedgerTableBody').children;
    for (const row of rows) {
        assert.equal(row.children.length, 9);
        assert.equal(row.querySelector('button').textContent, 'Lịch sử kê đơn');
        row.click();
    }
    await harness.flush();
    assert.equal(rows.length, 2);
    assert.equal(harness.requests.length, 1);
    harness.ledger.switchImportTab('order');
    assert.equal(harness.get('importLedgerPane').hidden, true);
    harness.ledger.switchImportTab('ledger');
    assert.equal(harness.requests.length, 2);
    assert.ok(harness.requests.every(request => request.url.startsWith('/api/medicine-batches/?')));
});

test('loading and failure states span the nine receipt columns', async () => {
    const harness = await setup();
    harness.ledger.switchImportTab('ledger');
    const cell = () => harness.get('importLedgerTableBody').querySelector('td');
    assert.equal(cell().getAttribute('colspan'), '9');
    assert.equal(cell().textContent, 'Đang tải dữ liệu...');
    harness.requests[0].fail();
    await harness.flush();
    assert.equal(cell().getAttribute('colspan'), '9');
    assert.match(cell().textContent, /Không tải được lịch sử nhập & lô/);
});

test('receipt history uses a separate modal, not an inline expander', () => {
    const source = readMedicineManagementSource();
    const template = readTemplateSource('medicine-management.html');
    const css = readCssSource('app/static/css/pages/medicine-management.css');
    for (const content of [source, template, css]) {
        assert.doesNotMatch(content, /mm-ledger-(?:expander|history)|medicine-transactions|toggleLedgerBatchHistory|loadLedgerBatchHistory|collapseLedgerHistoryRow|importLedgerOpenBatchRow/);
    }
    const header = template.match(/class="table table-sm mm-import-ledger-table"[\s\S]*?<thead>([\s\S]*?)<\/thead>/)[1];
    assert.equal((header.match(/<th\s/g) || []).length, 9);
    assert.match(template, /id="receiptDispensingModal"/);
    assert.match(source, /bindClick\('medicine-expiry_date', \(\) => showMedicineExpiry\(\)\)/);
    assert.match(source, /\(\) => showStockDetail\(medicine\.id\)/);
    assert.match(source, /function showStockDetail\(medicineId\)[\s\S]*?openImportLedger\(\{medicineId, search: medicineName\}\)/);
    assert.match(source, /function showMedicineExpiry\(\)[\s\S]*?showStockDetail\(medicineId\)/);
});

test('missing invoices never fall back to generated NK references', async () => {
    const harness = await setup();
    for (const invoice of [undefined, null, '', '   ']) {
        const row = harness.ledger.buildImportLedgerRow(harness.batch(49, {invoice_number: invoice}));
        assert.equal(row.children[6].textContent, '—');
        assert.equal(row.children[7].textContent, '17/09/2026');
        assert.ok(Array.from(row.children).every(cell => !String(cell.textContent).includes('NK-49')));
    }
    const row = harness.ledger.buildImportLedgerRow(harness.batch(49, {invoice_number: '  HD-49  '}));
    assert.equal(row.children[6].textContent, 'HD-49');
});

test('receipt headings are centered and only medicine and lot values stay left-aligned', async () => {
    const harness = await setup();
    const template = readTemplateSource('medicine-management.html');
    const header = template.match(/mm-import-ledger-table[\s\S]*?<thead>([\s\S]*?)<\/thead>/)[1];
    const headings = Array.from(header.matchAll(/<th\b[^>]*class="([^"]+)"[^>]*>([^<]+)<\/th>/g));
    assert.deepEqual(headings.map(heading => heading[2]), [
        'Thuốc', 'Số lô', 'Hạn dùng', 'SL nhập', 'Còn lại', 'Đơn giá', 'Số hóa đơn', 'Ngày nhập', 'Lịch sử'
    ]);
    const row = harness.ledger.buildImportLedgerRow(harness.batch(1));
    headings.forEach((heading, index) => {
        assert.equal(heading[1], 'text-center', heading[2]);
        assert.ok(row.children[index].className.split(/\s+/).includes(index < 2 ? 'text-start' : 'text-center'), heading[2]);
    });
});

test('history opens for exact receipt, keeps filter, renders zero and unknown separately', async () => {
    const harness = await setup();
    harness.get('importLedgerSearch').value = 'Diazepam';
    const row = harness.ledger.buildImportLedgerRow(harness.batch(49));
    assert.ok(row.querySelector('button').className.includes('mm-receipt-history-button'));
    row.querySelector('button').click();
    assert.match(harness.requests[0].url, /batch_id=49/);
    assert.equal(harness.get('importLedgerSearch').value, 'Diazepam');
    assert.equal(harness.get('receiptDispensingModal').classList.contains('show'), true);
    harness.requests[0].respond({total: 1, page: 1, total_pages: 1, transactions: [{type: 'export',
        quantity: -60, unit: 'viên', patient_name: '<script>bad</script>', appointment_id: 12,
        created_at: '2026-09-21T10:30:00', balance_after: 0, stock_balance_after: null}]});
    await harness.flush();
    const cells = harness.get('receiptDispensingRows').children[0].children;
    assert.match(cells[2].children[1].textContent, /Ngày khám:/);
    assert.doesNotMatch(cells[2].children[1].textContent, /#12/);
    const template = readTemplateSource('medicine-management.html');
    assert.doesNotMatch(template, /receiptDispensingContext|receiptDispensingMedicine|mm-dispensing-context/);
    assert.equal(cells[3].children[0].textContent, '−60 viên');
    assert.equal(cells[4].children[0].textContent, '0 viên');
    assert.equal(cells[5].children[0].textContent, 'Chưa ghi nhận');
    assert.equal(cells[2].children[0].textContent, '<script>bad</script>');
    assert.equal(cells[2].children[0].children.length, 0);
    assert.equal(cells[1].children[0].textContent, 'Cấp thuốc');
    assert.equal(harness.get('receiptDispensingPagination').hidden, true);
    assert.equal(harness.get('receiptDispensingPage').textContent, '1 giao dịch');
});

test('multiple history pages show paging controls and return label', async () => {
    const harness = await setup();
    harness.ledger.openReceiptDispensing(harness.batch(1));
    harness.requests[0].respond({total: 21, page: 1, total_pages: 2, transactions: [{type: 'return', quantity: 1}]});
    await harness.flush();
    assert.equal(harness.get('receiptDispensingPagination').hidden, false);
    assert.equal(harness.get('receiptDispensingPage').textContent, '21 giao dịch · Trang 1/2');
    assert.equal(harness.get('receiptDispensingNext').disabled, false);
    const cells = harness.get('receiptDispensingRows').children[0].children;
    const label = cells[1].children[0];
    assert.equal(label.textContent, 'Hoàn thuốc');
    assert.ok(label.classList.contains('mm-dispensing-type--return'));
    assert.equal(cells[3].children[0].textContent, '+1 viên');
});

test('filters query all receipt history, survive paging, reset and reject stale responses', async () => {
    const harness = await setup();
    harness.ledger.openReceiptDispensing(harness.batch(1));
    harness.get('receiptDispensingSearch').value = '  Phạm Khôi  ';
    harness.get('receiptDispensingType').value = 'export';
    harness.get('receiptDispensingFilters').onsubmit({preventDefault() {}});
    let params = new URLSearchParams(harness.requests[1].url.split('?')[1]);
    assert.equal(params.get('patient_search'), 'Phạm Khôi');
    assert.equal(params.get('movement_type'), 'export');
    assert.equal(params.get('page'), '1');
    harness.requests[1].respond({total: 21, page: 1, total_pages: 2, transactions: []});
    await harness.flush();
    assert.match(harness.get('receiptDispensingRows').children[0].children[0].textContent, /bộ lọc/);
    harness.get('receiptDispensingNext').onclick();
    params = new URLSearchParams(harness.requests[2].url.split('?')[1]);
    assert.equal(params.get('patient_search'), 'Phạm Khôi');
    assert.equal(params.get('page'), '2');
    harness.get('receiptDispensingReset').onclick();
    assert.doesNotMatch(harness.requests[3].url, /patient_search|movement_type/);
    harness.requests[3].respond({total: 0, page: 1, total_pages: 0, transactions: []});
    harness.requests[2].respond({total: 21, page: 2, total_pages: 2, transactions: [{type: 'export'}]});
    await harness.flush();
    assert.equal(harness.get('receiptDispensingPage').textContent, '0 giao dịch');
    harness.ledger.openReceiptDispensing(harness.batch(2));
    assert.equal(harness.get('receiptDispensingSearch').value, '');
    assert.equal(harness.get('receiptDispensingType').value, '');
});

test('missing linkage, unchanged stock and backend reconciliation warning are explicit', async () => {
    const harness = await setup();
    harness.ledger.renderReceiptDispensingRows([{type: 'price_adjustment', quantity: 0,
        balance_after: 478, stock_balance_after: 140.5, stock_balance_inconsistent: true}]);
    const cells = harness.get('receiptDispensingRows').children[0].children;
    assert.equal(cells.length, 7);
    assert.equal(cells[1].children[0].textContent, 'Điều chỉnh giá');
    assert.equal(cells[2].children[0].textContent, 'Chưa liên kết lượt khám');
    assert.equal(cells[3].children[0].textContent, 'Không đổi');
    assert.equal(cells[4].children[0].textContent, '478 viên');
    assert.equal(cells[5].children[0].textContent, '140,5 viên');
    assert.match(cells[5].children[1].textContent, /Cần đối soát/);
});

test('switching receipts or closing ignores stale responses and preserves parent state', async () => {
    const harness = await setup();
    harness.ledger.openReceiptDispensing(harness.batch(1));
    harness.ledger.openReceiptDispensing(harness.batch(2));
    harness.requests[1].respond({total: 0, page: 1, total_pages: 0, transactions: []});
    await harness.flush();
    harness.requests[0].respond({total: 99, page: 1, total_pages: 5, transactions: [{type: 'export'}]});
    await harness.flush();
    assert.match(harness.get('receiptDispensingRows').children[0].children[0].textContent, /Chưa có lịch sử/);
    harness.ledger.loadReceiptDispensing(2);
    assert.match(harness.requests[2].url, /batch_id=2&page=2/);
    harness.get('receiptDispensingModal').dispatchEvent(new Event('hide.bs.modal'));
    harness.requests[2].respond({total: 99, page: 2, total_pages: 5, transactions: [{type: 'export'}]});
    await harness.flush();
    assert.equal(harness.get('receiptDispensingRows').children.length, 0);
});

test('history errors clear previous rows and keep paging disabled', async () => {
    const harness = await setup();
    harness.ledger.openReceiptDispensing(harness.batch(1));
    harness.requests[0].fail();
    await harness.flush();
    assert.match(harness.get('receiptDispensingRows').children[0].children[0].textContent, /Không tải được/);
    assert.equal(harness.get('receiptDispensingNext').disabled, true);
});
