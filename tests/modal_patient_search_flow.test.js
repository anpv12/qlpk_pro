const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadUi() {
    const window = { QLPKModalHistoryListUi: { resolveAppointmentById: (list, id) => list.find(item => item.id === id) || null } };
    const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
    const context = { window, document, console, setTimeout, clearTimeout, URLSearchParams };
    vm.runInNewContext(fs.readFileSync('app/static/js/components/modal-patient-search-data.js', 'utf8'), context);
    vm.runInNewContext(fs.readFileSync('app/static/js/components/modal-patient-search-dom.js', 'utf8'), context);
    vm.runInNewContext(fs.readFileSync('app/static/js/components/modal-patient-search-state.js', 'utf8'), context);
    vm.runInNewContext(fs.readFileSync('app/static/js/components/modal-patient-search-ui.js', 'utf8'), context);
    return window.ModalPatientSearchUi;
}

function scenario(overrides = {}) {
    const log = [];
    const options = {
        appointments: [{ id: 9, patient_id: 3, examination: { id: 21 } }, { id: 10, patient_id: 4 }],
        historyListUi: { resolveAppointmentById: (list, id) => list.find(item => item.id === id) || null },
        apiCall: async url => { log.push(['api', url]); return { ok: true, json: async () => ({ data: { id: 3, full_name: 'BN' } }) }; },
        setLoading: value => log.push(['loading', value]),
        setSecondaryLoading: value => log.push(['secondary', value]),
        setCurrentAppointmentId: id => log.push(['current', id]),
        clearBeforeLoad: () => log.push(['clear']),
        showHistoryButton: () => log.push(['history-button']),
        loadPatient: async (patient, examination, appointment, context) => log.push(['patient', patient.id, examination?.id || null, appointment.id, context]),
        getLoadContext: (id, appointment) => ({ token: id * 10, patientId: appointment.patient_id }),
        loadExaminationFormData: async (id, context) => log.push(['form', id, context.token]),
        afterExaminationFormLoad: () => log.push(['after-form']),
        unlockIfNeeded: () => log.push(['unlock']),
        loadAppointmentServices: async () => log.push(['services']),
        loadPrescriptionData: async () => log.push(['prescription']),
        loadExaminationFallback: async id => { log.push(['fallback', id]); return { id: 99 }; },
        cardOptions: { document: { querySelectorAll: () => [] } },
        ...overrides
    };
    return { log, options };
}

test('selected appointment loads patient, form, services and prescription in order', async () => {
    const ui = loadUi();
    const { log, options } = scenario();
    const result = await ui.selectAppointmentPatientFlow(9, options);
    assert.equal(result.status, 'loaded');
    assert.equal(result.examination.id, 21);
    assert.deepEqual(log.map(entry => entry[0]), ['loading', 'secondary', 'clear', 'history-button', 'current', 'api', 'patient', 'form', 'after-form', 'unlock', 'services', 'prescription', 'loading', 'secondary']);
    assert.deepEqual(log.find(entry => entry[0] === 'patient'), ['patient', 3, 21, 9, { token: 90, patientId: 3 }]);
    assert.deepEqual(log.filter(entry => entry[0] === 'loading').map(entry => entry[1]), [true, false]);
});

test('missing examination uses the fallback loader and appointment id can be set before loading', async () => {
    const ui = loadUi();
    const { log, options } = scenario({ setAppointmentIdOnStart: true });
    const result = await ui.selectAppointmentPatientFlow(10, options);
    assert.equal(result.status, 'loaded');
    assert.equal(result.examination.id, 99);
    assert.equal(log.findIndex(entry => entry[0] === 'current'), 2, 'appointment id is set before clearing when requested');
    assert.ok(log.some(entry => entry[0] === 'fallback' && entry[1] === 10));
});

test('stale loads stop before later steps and unknown appointments report missing', async () => {
    const ui = loadUi();
    let current = true;
    const { log, options } = scenario({ isCurrentLoad: () => current, loadPatient: async () => { current = false; log.push(['patient']); } });
    const stale = await ui.selectAppointmentPatientFlow(9, options);
    assert.equal(stale.status, 'stale');
    assert.ok(!log.some(entry => entry[0] === 'form'), 'form load must not run after the patient changed');
    assert.ok(!log.some(entry => entry[0] === 'services'));

    const missingLog = [];
    const missing = await ui.selectAppointmentPatientFlow(404, { ...scenario().options, onMissingAppointment: id => missingLog.push(id), setLoading: value => missingLog.push(['loading', value]) });
    assert.equal(missing.status, 'missingAppointment');
    assert.deepEqual(missingLog, [['loading', true], 404, ['loading', false]]);
});

test('form load errors clear the form but keep the flow going, and shouldFinalize can keep loading state', async () => {
    const ui = loadUi();
    const { log, options } = scenario({
        loadExaminationFormData: async () => { throw new Error('boom'); },
        clearExaminationFormOnError: () => log.push(['form-cleared']),
        shouldFinalize: () => false
    });
    const original = console.error; console.error = () => {};
    try {
        const result = await ui.selectAppointmentPatientFlow(9, options);
        assert.equal(result.status, 'loaded');
    } finally { console.error = original; }
    assert.ok(log.some(entry => entry[0] === 'form-cleared'));
    assert.ok(log.some(entry => entry[0] === 'prescription'));
    assert.deepEqual(log.filter(entry => entry[0] === 'loading').map(entry => entry[1]), [true], 'loading state stays on when finalize is refused');
});
