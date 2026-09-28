const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadContext(files) {
    const window = {};
    const context = vm.createContext({ window, document: {}, console });
    for (const file of files) vm.runInContext(fs.readFileSync(`app/static/js/components/${file}`, 'utf8'), context, { filename: file });
    return { window };
}

test('history tab UIs share one context/history resolver', () => {
    const { window } = loadContext(['history-tab-core.js', 'prescription-history-tab-ui.js', 'service-history-tab-ui.js', 'medical-record-history-tab-ui.js']);
    const core = window.QLPKHistoryTabCore;
    for (const ui of [window.PrescriptionHistoryTabUi, window.ServiceHistoryTabUi, window.MedicalRecordHistoryTabUi]) {
        assert.equal(ui.resolveHistoryState, core.resolveHistoryState);
    }
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(core.resolveHistoryState({})), { state: 'noPatient', history: null, index: null });
    assert.deepEqual(plain(core.resolveHistoryState({ patient: { id: 1 }, isHistoryLoading: true })), { state: 'historyLoading', history: null, index: null });
    assert.deepEqual(plain(core.resolveHistoryState({ patient: { id: 1 }, histories: [] })), { state: 'emptyHistory', history: null, index: null });
    assert.deepEqual(plain(core.resolveHistoryState({ patient: { id: 1 }, histories: [{ id: 9 }], selectedIndex: 5 })), { state: 'ready', history: { id: 9 }, index: 0 });
    assert.equal(core.isContextCurrent({ isContextCurrent: () => false }), false);
    assert.equal(core.isContextCurrent({}), true);
    const container = { innerHTML: '' };
    assert.match(window.ServiceHistoryTabUi.renderState(container, 'noPatient'), /Chọn bệnh nhân/);
    assert.equal(container.innerHTML, window.ServiceHistoryTabUi.buildStateHtml('noPatient'));
});

test('renderTab resolves container, stale context and pending states through the shared core before fetching', async () => {
    const { window } = loadContext(['history-tab-core.js', 'service-history-tab-ui.js']);
    const ui = window.ServiceHistoryTabUi;
    assert.deepEqual(JSON.parse(JSON.stringify(await ui.renderTab({}))), { state: 'missingContainer' });
    const container = { innerHTML: '' };
    assert.deepEqual(JSON.parse(JSON.stringify(await ui.renderTab({ container, isContextCurrent: () => false }))), { state: 'stale' });
    assert.equal(container.innerHTML, '');
    const pending = await ui.renderTab({ container, patient: { id: 1 }, histories: [] });
    assert.equal(pending.state, 'emptyHistory');
    assert.match(container.innerHTML, /Chưa có lượt khám/);
    const fetched = [];
    const ready = await ui.renderTab({
        container, patient: { id: 1 }, histories: [{ id: 5, appointment_id: 9 }],
        fetchPatientDetail: async id => { fetched.push(['patient', id]); return { id, full_name: 'BN' }; },
        fetchExaminationDetail: async id => { fetched.push(['exam', id]); return { note: 'x' }; },
        fetchServicesForAppointment: async id => { fetched.push(['services', id]); return []; },
        fetchPrescriptionForAppointment: async id => { fetched.push(['rx', id]); return null; },
        buildServiceInvoiceHTML: payload => `<p>${payload.patient.full_name}</p>`
    });
    assert.equal(ready.state, 'ready');
    assert.equal(container.innerHTML, '<p>BN</p>');
    assert.deepEqual(fetched, [['patient', 1], ['exam', 5], ['services', 9], ['rx', 9]]);
});
