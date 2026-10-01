'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/medicine-statistics.html', 'utf8');
const BODY = template.slice(template.indexOf('<body'), template.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '');

async function setup() {
    const page = await loadPage('medicine-statistics.js', { html: BODY, before(window) {
        window.sessionStorage.setItem('medicineStatsActiveTab', 'ledger');
        window.QLPKUserFeedback = { show() {} };
    } });
    const $ = id => page.document.getElementById(id);
    const shared = await import('../app/static/js/medicine-statistics/shared.js');
    const entry = page.module;
    page.requests.length = 0;
    const ledgerRows = () => [...$('ledgerMedicineRows').querySelectorAll('tr')];
    return { ...page, $, state: shared.state, entry, ledgerRows };
}

function report(overrides = {}) {
    return { page: 1, total_pages: 1, total: 1, medicines: [{
        medicine_id: 42, medicine_name: '<img src=x onerror=alert(1)>', unit: 'viên',
        dispensing_count: 1, visit_count: 1, exported_quantity: 30, returned_quantity: 0,
        net_quantity: 30, recorded_revenue: 120000, recorded_cost: 65000,
        gross_margin_complete_rows: 55000, incomplete_rows: 0, untracked_export_rows: 0,
        ...overrides,
    }] };
}

test('renders per-medicine totals safely and drills down by exact id', async () => {
    const h = await setup();
    h.$('dateFrom').value = '01/09/2026';
    const pending = h.entry.loadDispensingMedicines();
    assert.match(h.requests[0].url, /from_date=2026-09-01/);
    assert.match(h.requests[0].url, /view=medicines/);
    h.requests[0].respond(200, report());
    await pending;
    const cells = h.ledgerRows()[0].children;
    assert.equal(cells[1].textContent, '1');
    assert.equal(cells[6].textContent, '120.000 đ');
    assert.equal(cells[8].textContent, '55.000 đ');
    const button = cells[0].querySelector('button');
    assert.equal(button.textContent, '<img src=x onerror=alert(1)> / viên');
    assert.equal(h.$('ledgerMedicineRows').querySelector('img'), null);
    button.click();
    assert.match(h.requests.at(-1).url, /medicine_id=42/);
    assert.equal(h.$('ledgerAllMedicines').hidden, false);
});

test('unknown counts and incomplete margin are explicit; zero remains zero', async () => {
    const h = await setup();
    const pending = h.entry.loadDispensingMedicines();
    h.requests[0].respond(200, report({ untracked_export_rows: 2, incomplete_rows: 2, recorded_cost: null, recorded_revenue: 0 }));
    await pending;
    const cells = h.ledgerRows()[0].children;
    assert.match(cells[1].textContent, /2 dòng chưa rõ/);
    assert.equal(cells[6].textContent, '0 đ');
    assert.equal(cells[7].textContent, 'Chưa rõ');
    assert.equal(cells[8].textContent, 'Chưa đủ dữ liệu');
});

test('late previous response cannot overwrite new filters', async () => {
    const h = await setup();
    const first = h.entry.loadDispensingMedicines();
    const second = h.entry.loadDispensingMedicines();
    h.requests[1].respond(200, report({ medicine_name: 'Mới' }));
    await second;
    h.requests[0].respond(200, report({ medicine_name: 'Cũ' }));
    await first;
    assert.equal(h.ledgerRows()[0].querySelector('button').textContent, 'Mới / viên');
});

test('empty or failed requests clear rows and disable pagination', async () => {
    const h = await setup();
    let pending = h.entry.loadDispensingMedicines();
    h.requests[0].respond(200, { ...report(), total: 0, total_pages: 0, medicines: [] });
    await pending;
    assert.match(h.$('ledgerMedicineStatus').textContent, /Không có thuốc/);
    assert.equal(h.$('ledgerMedicineNext').disabled, true);
    pending = h.entry.loadDispensingMedicines();
    h.requests[1].respond(500, {});
    await pending;
    assert.match(h.$('ledgerMedicineStatus').textContent, /Không tải được/);
    assert.equal(h.ledgerRows().length, 0);
    assert.equal(h.$('ledgerMedicinePrevious').disabled, true);
});

test('server pagination and filter reset do not retain selected medicine', async () => {
    const h = await setup();
    const pending = h.entry.loadDispensingMedicines(2);
    h.requests[0].respond(200, { ...report(), page: 2, total_pages: 3, total: 41 });
    await pending;
    assert.match(h.requests[0].url, /page=2/);
    assert.equal(h.$('ledgerMedicineNext').disabled, false);
    assert.equal(h.$('ledgerMedicinePrevious').disabled, false);
    h.state.currentTab = 'ledger';
    h.state.ledgerMedicineId = 42;
    h.entry.applyFilters();
    assert.equal(h.state.ledgerMedicineId, null);
    assert.equal(h.$('ledgerAllMedicines').hidden, true);
    assert.doesNotMatch(h.requests.at(-1).url, /medicine_id/);
});

test('month shortcut updates both dates and reloads the report', async () => {
    const h = await setup();
    h.state.currentTab = 'ledger';
    h.$('ledgerThisMonth').click();
    assert.match(h.$('dateFrom').value, /^01\//);
    assert.equal(h.requests.filter(request => request.url.includes('/ledger')).length, 2);
    await flush();
});
