'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');
const { readCssSource } = require('./helpers/css-source');
const root = path.join(__dirname, '..');
const read = filename => readCssSource(path.join(root, filename));
const SOURCE_FILE = path.join(root, 'app/static/js/components/modal-medical-history-list-ui.js');

test('only explicit clicks mark one history row, not the default preview', async () => {
    const marker = 'modal-history-item-user-selected';
    const { document } = require('./helpers/fake-dom').createWindow({ html: '<div id="historyList"></div>' });
    const context = { window: { document, QLPKHtml: require('./helpers/html-escape').QLPKHtml }, document, console };
    runScriptFile(SOURCE_FILE, vm.createContext(context));
    const api = context.window.ModalMedicalHistoryListUi;
    const container = document.getElementById('historyList');
    const result = api.renderHistoryListWithActiveRow({ container, histories: [
        { id: 1, appointment_id: 11, status: 'EXAMINING' },
        { id: 2, appointment_id: 12, status: 'WAITING_PAYMENT' }
    ], currentAppointmentId: 11 });
    assert.equal(result.selectedIndex, 0);
    const rows = [...container.querySelectorAll('.modal-history-item')];
    assert.equal(rows.length, 2);
    assert.ok(!container.innerHTML.includes(marker));
    const selected = [];
    api.bindHistoryListClick(container, { onSelect(index) { selected.push(index); } });
    for (const row of [rows[0], rows[1], rows[1]]) {
        row.click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(container.querySelectorAll('.' + marker).length, 1);
        assert.ok(row.classList.contains(marker));
    }
    assert.deepEqual(selected, [0, 1, 1]);
    api.renderHistoryList({ container, histories: [{ id: 3, appointment_id: 13 }] });
    assert.ok(!container.innerHTML.includes(marker));
});

test('current and examining state do not add a default left rail', () => {
    const css = read('app/static/css/patient-search-modal.css');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/current-exam-highlight|modal-history-item--examining/.test(selector)) {
            assert.doesNotMatch(body, /border-(?:left|inline-start)|box-shadow/);
        }
    }
    assert.match(css, /modal-history-item-user-selected[^{}]*\{[^}]*box-shadow: inset 0\.2rem 0 0 var\(--patient-modal-coral\)/);
});

test('indications remove the private history UI and code, not global history', () => {
    for (const filename of [
        'app/templates/partials/doctor-indications-panel.html',
        'app/static/js/components/doctor-indications-form.js',
        'app/static/css/pages/doctor-indications.css'
    ]) {
        assert.doesNotMatch(read(filename), /doctorIndicationsHistory|doctor-indications-history|loadHistory|toggleHistory|STATE\.history/);
    }
    assert.ok(read('app/static/js/components/patient-history-modal.js').includes('QLPKPatientHistoryModal'));
});
