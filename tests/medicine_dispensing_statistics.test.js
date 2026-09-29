'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function setup() {
    const elements = new Map();
    function element() {
        return {
            textContent: '', value: '', rows: [], children: [], dataset: {}, events: {}, disabled: false,
            replaceChildren() { this.rows = []; this.children = []; },
            insertRow() { const row = element(); this.rows.push(row); return row; },
            insertCell() { const cell = element(); this.children.push(cell); return cell; },
            append(child) { this.children.push(child); },
            addEventListener(name, handler) { this.events[name] = handler; }
        };
    }
    const document = {
        getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
        createElement: element,
        addEventListener() {}, querySelectorAll() { return []; }
    };
    const requests = [];
    const context = vm.createContext({
        document, URLSearchParams, Date, console, setTimeout, clearTimeout,
        window: {}, localStorage: { getItem() { return null; } },
        sessionStorage: { setItem() {} },
        fetch(url) { return new Promise(resolve => requests.push({ url, resolve })); }
    });
    runScriptFile('app/static/js/medicine-statistics.js', context);
    return { document, requests, context, run: code => vm.runInContext(code, context) };
}

function report(overrides = {}) {
    return { page: 1, total_pages: 1, total: 1, medicines: [{
        medicine_id: 42, medicine_name: '<img src=x onerror=alert(1)>', unit: 'viên',
        dispensing_count: 1, visit_count: 1, exported_quantity: 30, returned_quantity: 0,
        net_quantity: 30, recorded_revenue: 120000, recorded_cost: 65000,
        gross_margin_complete_rows: 55000, incomplete_rows: 0, untracked_export_rows: 0,
        ...overrides
    }] };
}

function respond(request, data, ok = true) {
    request.resolve({ ok, json: async () => data });
}

test('renders per-medicine totals safely and drills down by exact id', async () => {
    const harness = setup();
    harness.document.getElementById('dateFrom').value = '01/09/2026';
    const pending = harness.run('loadDispensingMedicines()');
    assert.match(harness.requests[0].url, /from_date=2026-09-01/);
    assert.match(harness.requests[0].url, /view=medicines/);
    respond(harness.requests[0], report());
    await pending;
    const row = harness.document.getElementById('ledgerMedicineRows').rows[0];
    assert.equal(row.children[1].textContent, 1);
    assert.equal(row.children[6].textContent, '120.000 đ');
    assert.equal(row.children[8].textContent, '55.000 đ');
    const button = row.children[0].children[0];
    assert.equal(button.textContent, '<img src=x onerror=alert(1)> / viên');
    button.events.click();
    assert.match(harness.requests[1].url, /medicine_id=42/);
    assert.equal(harness.document.getElementById('ledgerAllMedicines').hidden, false);
});

test('unknown counts and incomplete margin are explicit; zero remains zero', async () => {
    const harness = setup();
    const pending = harness.run('loadDispensingMedicines()');
    respond(harness.requests[0], report({ untracked_export_rows: 2, incomplete_rows: 2, recorded_cost: null, recorded_revenue: 0 }));
    await pending;
    const cells = harness.document.getElementById('ledgerMedicineRows').rows[0].children;
    assert.match(cells[1].textContent, /2 dòng chưa rõ/);
    assert.equal(cells[6].textContent, '0 đ');
    assert.equal(cells[7].textContent, 'Chưa rõ');
    assert.equal(cells[8].textContent, 'Chưa đủ dữ liệu');
});

test('late previous response cannot overwrite new filters', async () => {
    const harness = setup();
    const first = harness.run('loadDispensingMedicines()');
    const second = harness.run('loadDispensingMedicines()');
    respond(harness.requests[1], report({ medicine_name: 'Mới' }));
    await second;
    respond(harness.requests[0], report({ medicine_name: 'Cũ' }));
    await first;
    assert.equal(harness.document.getElementById('ledgerMedicineRows').rows[0].children[0].children[0].textContent, 'Mới / viên');
});

test('empty or failed requests clear rows and disable pagination', async () => {
    const harness = setup();
    let pending = harness.run('loadDispensingMedicines()');
    respond(harness.requests[0], { ...report(), total: 0, total_pages: 0, medicines: [] });
    await pending;
    assert.match(harness.document.getElementById('ledgerMedicineStatus').textContent, /Không có thuốc/);
    assert.equal(harness.document.getElementById('ledgerMedicineNext').disabled, true);
    pending = harness.run('loadDispensingMedicines()');
    respond(harness.requests[1], {}, false);
    await pending;
    assert.match(harness.document.getElementById('ledgerMedicineStatus').textContent, /Không tải được/);
    assert.equal(harness.document.getElementById('ledgerMedicineRows').rows.length, 0);
    assert.equal(harness.document.getElementById('ledgerMedicinePrevious').disabled, true);
});

test('server pagination and filter reset do not retain selected medicine', async () => {
    const harness = setup();
    const pending = harness.run('loadDispensingMedicines(2)');
    respond(harness.requests[0], { ...report(), page: 2, total_pages: 3, total: 41 });
    await pending;
    assert.match(harness.requests[0].url, /page=2/);
    assert.equal(harness.document.getElementById('ledgerMedicineNext').disabled, false);
    assert.equal(harness.document.getElementById('ledgerMedicinePrevious').disabled, false);
    harness.run('currentTab = "ledger"; ledgerMedicineId = 42; applyFilters()');
    assert.equal(harness.run('ledgerMedicineId'), null);
    assert.equal(harness.document.getElementById('ledgerAllMedicines').hidden, true);
    assert.doesNotMatch(harness.requests.at(-1).url, /medicine_id/);
});

test('month shortcut updates both dates and reloads the report', () => {
    const harness = setup();
    harness.run('currentTab = "ledger"; setupEventListeners()');
    harness.document.getElementById('ledgerThisMonth').events.click();
    assert.match(harness.document.getElementById('dateFrom').value, /^01\//);
    assert.equal(harness.requests.length, 2);
});
