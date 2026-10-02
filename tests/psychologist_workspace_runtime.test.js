'use strict';

const assert = require('node:assert/strict');
const { pageScripts } = require('./helpers/module-graph');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const runtimeSource = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/psychologist-examination/workspace-runtime.js'),
  'utf8'
);

test('Trang TLG dùng form hành chính inline, không nạp modal cũ', () => {
  const template = fs.readFileSync(path.join(__dirname, '../app/templates/psychologist-examination.html'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../app/static/js/psychologist-examination.js'), 'utf8');
  const patientForm = fs.readFileSync(path.join(__dirname, '../app/static/js/components/patient-info-form.js'), 'utf8');
  const patientTemplate = fs.readFileSync(path.join(__dirname, '../app/templates/partials/patient-info-form.html'), 'utf8');
  const scripts = pageScripts('psychologist-examination.html');
  assert.equal(scripts.includes('personal-detail-modal-dry.js'), false);
  assert.ok(scripts.includes('components/patient-info-form.js'));
  assert.equal(template.includes('personal-detail-modal-dry'), false);
  assert.ok(page.includes('personalDetailOptions: { bindings: {} }'));
  assert.ok(patientForm.includes('bindInlineDetailPanels(options)'));
  for (const panel of ['genderInlineDetailPanel', 'identityInlineDetailPanel', 'occupationInlineDetailPanel']) {
    assert.ok(patientTemplate.includes(`data-receptionist-inline-toggle="${panel}"`));
  }
});

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
  const toasts = [];

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
      showCustomToast: (type, message) => toasts.push({ type, message })
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

  return { runtime, document, calls, loadingStates, workspaceStates, componentStats, responses, window, toasts, clinical, services, indications, intake, history };
}

function queueLoad(harness, id = 101) {
  harness.responses.push({ promise: Promise.resolve({ ok: true, json: async () => payload(id, id + 1) }) });
  return harness.runtime.loadAppointment(id);
}

test('Chờ hành chính và tiền sử trước khi mở lưu', async () => {
  const harness = createHarness();
  const intake = deferred();
  const history = deferred();
  harness.intake.populate = () => intake.promise;
  harness.history.populate = () => history.promise;
  const pending = queueLoad(harness);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtime.getState().isLoadingExaminationData, true);
  assert.equal((await harness.runtime.save()).reason, 'not-ready');
  intake.resolve(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtime.getState().isLoadingExaminationData, true);
  history.resolve(true);
  assert.equal((await pending).status, 'loaded');
  assert.equal(harness.runtime.getState().loadFailed, false);
});

for (const owner of ['clinical', 'services', 'indications', 'history']) {
  test(`Tải ${owner} trả false chặn lưu/hoàn thành, thử lại được`, async () => {
    const harness = createHarness();
    const method = owner === 'clinical' ? 'render' : owner === 'history' ? 'populate' : 'load';
    harness[owner][method] = async () => false;
    assert.equal((await queueLoad(harness)).status, 'error');
    assert.equal(harness.runtime.getState().loadFailed, true);
    assert.equal((await harness.runtime.save()).reason, 'not-ready');
    assert.equal((await harness.runtime.complete()).reason, 'not-ready');
    assert.equal(harness.calls.length, 1);
    harness[owner][method] = async () => true;
    assert.equal((await queueLoad(harness)).status, 'loaded');
    assert.equal(harness.runtime.getState().loadFailed, false);
  });
}

test('Một phần throw vẫn đợi các phần khác kết thúc trước khi thoát loading', async () => {
  const harness = createHarness();
  const intake = deferred();
  harness.intake.populate = () => intake.promise;
  harness.clinical.render = () => { throw new Error('load-failed'); };
  const pending = queueLoad(harness);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtime.getState().isLoadingExaminationData, true);
  intake.resolve(true);
  assert.equal((await pending).status, 'error');
  assert.equal(harness.runtime.getState().loadFailed, true);
});

test('Lỗi tải ca cũ không báo lỗi hoặc khóa ca mới', async () => {
  const harness = createHarness();
  const oldResponse = deferred();
  harness.responses.push(oldResponse);
  const oldLoad = harness.runtime.loadAppointment(100);
  assert.equal((await queueLoad(harness)).status, 'loaded');
  oldResponse.resolve({ ok: false });
  assert.equal((await oldLoad).status, 'stale');
  assert.equal(harness.runtime.getState().loadFailed, false);
  assert.equal(harness.runtime.getState().isLoadingExaminationData, false);
  assert.deepEqual(harness.toasts, []);
});

test('Lỗi hydrate ca cũ không thay đổi trạng thái ca mới đang tải', async () => {
  const harness = createHarness();
  const oldIntake = deferred();
  const newIntake = deferred();
  harness.intake.populate = data => data.id === 100 ? oldIntake.promise : newIntake.promise;
  const oldLoad = queueLoad(harness, 100);
  await new Promise(resolve => setImmediate(resolve));
  const newLoad = queueLoad(harness, 101);
  await new Promise(resolve => setImmediate(resolve));
  oldIntake.resolve(false);
  assert.equal((await oldLoad).status, 'stale');
  assert.equal(harness.runtime.getState().isLoadingExaminationData, true);
  assert.equal(harness.runtime.getState().loadFailed, false);
  assert.deepEqual(harness.toasts, []);
  newIntake.resolve(true);
  assert.equal((await newLoad).status, 'loaded');
});

function readyHarness() {
  const harness = createHarness();
  harness.runtime.getState().currentAppointmentId = 101;
  harness.runtime.getState().currentPatientId = 1;
  harness.window.QLPKPsychologistSaveBase = async () => ({ status: 'saved' });
  return harness;
}

for (const status of ['patientError', 'appointmentError', 'skipped', 'stale', 'error']) {
  test(`Hoàn thành bị chặn nếu lưu trả ${status}`, async () => {
    const harness = readyHarness();
    harness.window.QLPKPsychologistSaveBase = async () => ({ status });
    assert.equal((await harness.runtime.complete()).status, status);
    assert.deepEqual(harness.calls, []);
    assert.equal(harness.toasts.some(toast => toast.type === 'success'), false);
  });
}

test('Base saved nhưng có thay đổi mới không cho Hoàn thành', async () => {
  const harness = readyHarness();
  harness.window.QLPKPsychologistSaveBase = async () => ({ status: 'saved', hasNewChanges: true });
  assert.equal((await harness.runtime.complete()).status, 'error');
  assert.deepEqual(harness.calls, []);
});

test('Hoàn thành lần hai bị chặn khi lần đầu chờ tra examination', async () => {
  const harness = readyHarness();
  const lookup = deferred();
  harness.responses.push(lookup, { promise: Promise.resolve({ ok: true }) });
  const first = harness.runtime.complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await harness.runtime.complete()).reason, 'completing');
  assert.equal(harness.calls.length, 1);
  lookup.resolve({ ok: true, json: async () => ({ examination_id: 1101 }) });
  assert.equal((await first).status, 'completed');
  assert.equal(harness.runtime.getState().completing, false);
});

test('Lookup lỗi hoặc thiếu examination id không gửi transition', async () => {
  for (const lookup of [{ ok: false }, { ok: true, json: async () => ({}) }]) {
    const harness = readyHarness();
    harness.responses.push({ promise: Promise.resolve(lookup) });
    assert.equal((await harness.runtime.complete()).status, 'error');
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.runtime.getState().completing, false);
  }
});

test('Lưu giữ khóa đến khi mọi request con đã kết thúc dù một request lỗi', async () => {
  const harness = readyHarness();
  const delayed = deferred();
  harness.clinical.hasUnsavedChanges = () => true;
  harness.clinical.getSaveState = () => ({ detailDirtySections: new Set(['section']) });
  harness.clinical.saveDetails = async () => { throw new Error('failed'); };
  harness.services.hasUnsavedChanges = () => true;
  harness.services.save = () => delayed.promise;
  const saving = harness.runtime.save();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.runtime.getState().saving, true);
  assert.equal((await harness.runtime.save()).reason, 'saving');
  delayed.resolve({ status: 'success' });
  assert.equal((await saving).status, 'error');
  assert.equal(harness.runtime.getState().saving, false);
});

test('Hoàn thành bị chặn khi chưa chọn ca, loading hoặc đang lưu', async () => {
  for (const changedState of [{ currentAppointmentId: null }, { isLoadingExaminationData: true }, { saving: true }]) {
    const harness = readyHarness();
    Object.assign(harness.runtime.getState(), changedState);
    assert.equal((await harness.runtime.complete()).status, 'skipped');
    assert.deepEqual(harness.calls, []);
  }
});

test('Không có owner lưu hành chính thì không báo lưu thành công', async () => {
  const harness = readyHarness();
  delete harness.window.QLPKPsychologistSaveBase;
  assert.equal((await harness.runtime.save()).status, 'error');
  assert.equal(harness.toasts.some(toast => toast.type === 'success'), false);
});

test('Kết quả lưu hành chính không rõ trạng thái không cho Hoàn thành', async () => {
  const harness = readyHarness();
  harness.window.QLPKPsychologistSaveBase = async () => undefined;
  assert.equal((await harness.runtime.complete()).status, 'error');
  assert.deepEqual(harness.calls, []);
});

for (const outcome of [{ status: 'error' }, { skipped: true, reason: 'saving' }, { status: 'success', hasNewChanges: true }]) {
  test(`Dịch vụ dirty chưa lưu đủ không cho Hoàn thành: ${JSON.stringify(outcome)}`, async () => {
    const harness = readyHarness();
    harness.services.hasUnsavedChanges = () => true;
    harness.services.save = async () => outcome;
    assert.notEqual((await harness.runtime.complete()).status, 'completed');
    assert.deepEqual(harness.calls, []);
    assert.equal(harness.toasts.some(toast => toast.type === 'success'), false);
  });
}

test('Lâm sàng trả error không bị báo thành công', async () => {
  const harness = readyHarness();
  harness.clinical.hasUnsavedChanges = () => true;
  harness.clinical.getSaveState = () => ({ detailDirtySections: new Set(['section']) });
  harness.clinical.saveDetails = async () => ({ status: 'error' });
  assert.equal((await harness.runtime.save()).status, 'error');
  assert.equal(harness.toasts.some(toast => toast.type === 'success'), false);
});

test('Lâm sàng dirty nhưng không có section không bị bỏ qua khi hoàn thành', async () => {
  const harness = readyHarness();
  harness.clinical.hasUnsavedChanges = () => true;
  assert.equal((await harness.runtime.complete()).status, 'error');
  assert.deepEqual(harness.calls, []);
});

test('Lâm sàng dirty lưu sạch vẫn hoàn thành được', async () => {
  const harness = readyHarness();
  let dirty = true;
  harness.clinical.hasUnsavedChanges = () => dirty;
  harness.clinical.getSaveState = () => ({ detailDirtySections: new Set(['section']) });
  harness.clinical.saveDetails = async () => { dirty = false; return { status: 'success' }; };
  harness.responses.push(
    { promise: Promise.resolve({ ok: true, json: async () => ({ examination_id: 1101 }) }) },
    { promise: Promise.resolve({ ok: true }) }
  );
  assert.equal((await harness.runtime.complete()).status, 'completed');
  assert.equal(harness.calls.length, 2);
});

test('Đổi ca trong lúc lưu hành chính không lưu tiếp lâm sàng và không Hoàn thành', async () => {
  const harness = readyHarness();
  const saving = deferred();
  harness.window.QLPKPsychologistSaveBase = () => saving.promise;
  let clinicalSaves = 0;
  harness.clinical.hasUnsavedChanges = () => true;
  harness.clinical.getSaveState = () => ({ detailDirtySections: new Set(['section']) });
  harness.clinical.saveDetails = async () => { clinicalSaves += 1; return { status: 'success' }; };
  const completion = harness.runtime.complete();
  harness.runtime.getState().currentAppointmentId = 202;
  harness.runtime.getState().contextToken += 1;
  saving.resolve({ status: 'saved' });
  assert.equal((await completion).status, 'stale');
  assert.equal(clinicalSaves, 0);
  assert.deepEqual(harness.calls, []);
  assert.equal(harness.toasts.some(toast => toast.type === 'success'), false);
});

test('Đổi ca khi đang lấy examination id không gửi lệnh hoàn thành', async () => {
  const harness = readyHarness();
  const lookup = deferred();
  harness.responses.push(lookup);
  const completion = harness.runtime.complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(harness.calls, ['/api/examination-id/101']);
  harness.runtime.getState().contextToken += 2;
  lookup.resolve({ ok: true, json: async () => ({ examination_id: 1101 }) });
  assert.equal((await completion).status, 'stale');
  assert.equal(harness.calls.length, 1);
});

test('Hoàn thành chỉ gọi transition sau lưu thành công', async () => {
  const harness = readyHarness();
  harness.responses.push(
    { promise: Promise.resolve({ ok: true, json: async () => ({ examination_id: 1101 }) }) },
    { promise: Promise.resolve({ ok: true }) }
  );
  assert.equal((await harness.runtime.complete()).status, 'completed');
  assert.deepEqual(harness.calls, ['/api/examination-id/101', '/examinations/1101/complete-psychologist-exam']);
});

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
