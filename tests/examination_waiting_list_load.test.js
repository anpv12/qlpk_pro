const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadUi(path = 'app/static/js/components/examination-waiting-list-ui.js') {
    const window = {};
    const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    vm.runInNewContext(fs.readFileSync(path, 'utf8'), { window, document, console, setTimeout, clearTimeout, URLSearchParams, Array, Set, Math, Error });
    return window.ClinicalExaminationWaitingListUi;
}

function fakeApi(pages) {
    const calls = [];
    return { calls, apiCall: async url => { calls.push(url); const u = new URL('http://x' + url); const key = `${u.searchParams.get('examination_status')}:${u.searchParams.get('page')}`; const body = pages[key]; if (!body) return { ok: false }; return { ok: true, json: async () => body }; } };
}

test('merges statuses, de-duplicates ids, sorts by id desc and publishes through setters', async () => {
    const ui = loadUi();
    const { calls, apiCall } = fakeApi({ 'doctor_exam:1': { appointments: [{ id: 5 }, { id: 9 }] }, 'conclusion:1': { appointments: [{ id: 9 }, { id: 7 }] } });
    const seen = {};
    const result = await ui.loadCombinedAppointments({ apiCall, perPage: 20, setAppointments: a => { seen.appointments = a; }, setCurrentPage: p => { seen.page = p; }, setTotalPages: t => { seen.total = t; }, render: () => { seen.rendered = true; }, updatePagination: () => { seen.paginated = true; } });
    assert.equal(result.status, 'loaded');
    assert.deepEqual(JSON.parse(JSON.stringify(result.appointments.map(a => a.id))), [9, 7, 5]);
    assert.equal(seen.appointments, result.appointments); assert.deepEqual({ page: seen.page, total: seen.total, rendered: seen.rendered, paginated: seen.paginated }, { page: 1, total: 1, rendered: true, paginated: true });
    assert.equal(calls.length, 2);
    assert.match(calls[0], /examination_status=doctor_exam&page=1&per_page=20&doctor=true/);
});

test('loadAllPages follows pagination and preserveServerOrder keeps API order', async () => {
    const ui = loadUi();
    const { apiCall } = fakeApi({ 'a:1': { appointments: [{ id: 1 }], pagination: { has_next: true, next_page: 2 } }, 'a:2': { appointments: [{ id: 3 }], pagination: { has_next: false } } });
    const result = await ui.loadCombinedAppointments({ apiCall, statuses: ['a'], loadAllPages: true, preserveServerOrder: true, roleQueryParam: 'psychologist=true' });
    assert.deepEqual(JSON.parse(JSON.stringify(result.appointments.map(a => a.id))), [1, 3]);
});

test('empty, stale and failed loads report their status without throwing', async () => {
    const ui = loadUi();
    const holder = {}; const empty = await ui.loadCombinedAppointments({ apiCall: fakeApi({ 'doctor_exam:1': { appointments: [] }, 'conclusion:1': { appointments: [] } }).apiCall, setAppointments: a => { holder.set = a; } }); assert.equal(holder.set.length, 0);
    assert.equal(empty.status, 'empty');
    let current = true;
    const stale = await ui.loadCombinedAppointments({ apiCall: async () => { current = false; return { ok: true, json: async () => ({ appointments: [{ id: 1 }] }) }; }, isCurrentRequest: () => current });
    assert.deepEqual(JSON.parse(JSON.stringify(stale)), { status: 'stale' });
    const errors = [];
    const failed = await ui.loadCombinedAppointments({ apiCall: async () => ({ ok: false }), showError: e => errors.push(e.message) });
    assert.equal(failed.status, 'error');
    assert.deepEqual(JSON.parse(JSON.stringify(errors)), ['Không thể tải danh sách chờ khám']);
    const invalid = await ui.loadCombinedAppointments({ apiCall: async () => ({ ok: true, json: async () => ({ nope: 1 }) }), showError: e => errors.push(e.message) });
    assert.equal(invalid.status, 'error');
    assert.equal(errors[1], 'Danh sách chờ khám không hợp lệ');
});
