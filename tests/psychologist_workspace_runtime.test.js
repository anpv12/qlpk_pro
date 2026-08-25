'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtimeSource = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/psychologist-examination/workspace-runtime.js'),
  'utf8'
);

function deferred() {
  let resolve;
  const promise = new Promise(nextResolve => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createHarness() {
  const calls = [];
  const loadingStates = [];
  const workspaceStates = [];
  const componentStats = {
    intake: { bind: 0, clear: 0, populate: 0 },
    clinical: { bind: 0, clear: 0, render: 0 },
    services: { bind: 0, clear: 0, load: 0 },
    indications: { bind: 0, clear: 0, load: 0 },
    history: { init: 0, clear: 0, populate: 0 }
  };
  const responses = [];

  const intake = {
    bind() { componentStats.intake.bind += 1; },
    clear() { componentStats.intake.clear += 1; },
    populate() { componentStats.intake.populate += 1; }
  };
  const clinical = {
    bind() { componentStats.clinical.bind += 1; },
    clear() { componentStats.clinical.clear += 1; },
    render() {
      componentStats.clinical.render += 1;
      return Promise.resolve(true);
    },
    hasUnsavedChanges: () => false,
    getSaveState: () => ({ detailDirtySections: new Set() }),
    getContextToken: () => 1,
    saveDetails: () => Promise.resolve({ status: 'success' })
  };
  const services = {
    bind() { componentStats.services.bind += 1; },
    clear() { componentStats.services.clear += 1; },
    load() { componentStats.services.load += 1; return Promise.resolve({ status: 'loaded' }); },
    hasUnsavedChanges: () => false
  };
  const indications = {
    bind() { componentStats.indications.bind += 1; },
    clear() { componentStats.indications.clear += 1; },
    load() { componentStats.indications.load += 1; return Promise.resolve({ status: 'loaded' }); },
    hasUnsavedChanges: () => false
  };
  const history = {
    config: { normalizePayload: payload => payload },
    init() { componentStats.history.init += 1; },
    clear() { componentStats.history.clear += 1; },
    populate() { componentStats.history.populate += 1; },
    hasPendingChanges: () => false
  };

  const registry = {
    get(name) {
      if (name === 'clinicalExaminationForm') return { create: () => clinical };
      if (name === 'servicesForm') return { create: () => services };
      if (name === 'indicationsForm') return { create: () => indications };
      if (name === 'medicalHistoryForm') return { getActive: () => history };
      if (name === 'supportRuntime') return { configure() {} };
      return null;
    }
  };

  const root = { addEventListener() {} };
  const document = {
    getElementById(id) {
      return id === 'psychologistClinicalWorkspace' ? root : null;
    }
  };

  const window = {
    QLPKDoctorModuleRegistry: registry,
    QLPKDoctorPageRuntime: {
      apiCall(url) {
        calls.push(url);
        const next = responses.shift();
        if (!next) return Promise.reject(new Error(`Unexpected API call: ${url}`));
        return next.promise;
      },
      showCustomToast() {}
    },
    QLPKPsychologistComponentConfig: {
      clinicalFields: [],
      intake: {},
      clinical: { rootId: 'psychologistClinicalDecisionPanel' },
      services: {},
      indications: {}
    },
    QLPKPatientIntakeForm: { create: () => intake },
    QLPKPsychologistSetLoading: value => loadingStates.push(Boolean(value)),
    QLPKPsychologistSetCurrentPatientId() {},
    QLPKPsychologistSetCurrentAppointmentId() {},
    PsychologistWorkspaceUi: {
      showWorkspace(options) { workspaceStates.push(options); }
    }
  };

  vm.runInNewContext(runtimeSource, { window, document, console });
  const runtime = window.QLPKPsychologistWorkspaceRuntime;
  runtime.bind({ document });

  return { runtime, document, calls, loadingStates, workspaceStates, componentStats, responses };
}

function payload(id, patientId) {
  return {
    id,
    patient_info: { id: patientId, full_name: `Patient ${patientId}` },
    examination_info: { id: id + 1000 },
    sections: {}
  };
}

async function main() {
  const harness = createHarness();
  const first = deferred();
  harness.responses.push(first);
  const firstLoad = harness.runtime.loadAppointment(101);
  first.resolve({ ok: true, json: async () => payload(101, 1) });
  const firstResult = await firstLoad;

  assert.equal(firstResult.status, 'loaded');
  assert.equal(harness.runtime.getState().currentAppointmentId, 101);
  assert.equal(harness.runtime.getState().currentPatientId, 1);
  assert.deepEqual(harness.calls, ['/api/appointments/101/edit']);
  assert.equal(harness.componentStats.clinical.render, 1);
  assert.equal(harness.componentStats.services.load, 1);
  assert.equal(harness.componentStats.indications.load, 1);
  assert.equal(harness.workspaceStates.length, 1);
  assert.equal(harness.loadingStates.at(-1), false);

  const staleA = deferred();
  const freshB = deferred();
  harness.responses.push(staleA, freshB);
  const staleLoad = harness.runtime.loadAppointment(201);
  const freshLoad = harness.runtime.loadAppointment(202);
  freshB.resolve({ ok: true, json: async () => payload(202, 2) });
  const freshResult = await freshLoad;
  staleA.resolve({ ok: true, json: async () => payload(201, 1) });
  const staleResult = await staleLoad;

  assert.equal(freshResult.status, 'loaded');
  assert.equal(staleResult.status, 'stale');
  assert.equal(harness.runtime.getState().currentAppointmentId, 202);
  assert.equal(harness.runtime.getState().currentPatientId, 2);
  assert.equal(harness.workspaceStates.at(-1).appointmentId, 202);

  harness.runtime.clear({ document: harness.document });
  assert.equal(harness.runtime.getState().currentAppointmentId, null);
  assert.equal(harness.runtime.getState().currentPatientId, null);
  assert.ok(harness.componentStats.clinical.clear >= 3);
  assert.ok(harness.componentStats.services.clear >= 3);
  assert.ok(harness.componentStats.indications.clear >= 3);
  assert.ok(harness.componentStats.history.clear >= 3);
  console.log('psychologist workspace runtime lifecycle: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
