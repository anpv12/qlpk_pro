'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/static/js/receptionist-new.js'), 'utf8');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const requests = [];
  const populated = [];
  const notices = [];
  const fields = {};
  const context = vm.createContext({
    console, document: { getElementById: () => null },
    receptionistLoadState: { token: 0, loading: false, failed: false },
    currentPatientId: null, currentAppointmentId: null, currentEditId: null,
    allAppointments: [{ id: 11, patient_id: 1 }, { id: 22, patient_id: 2 }],
    allServices: [], relativeTableInstance: null, jointExamManagerInstance: null,
    localStorage: { removeItem() {} }, $: () => ({}),
    apiCall: url => { const item = deferred(); requests.push({ url, ...item }); return item.promise; },
    setCurrentPatientId: value => { context.currentPatientId = value; },
    safeSetValue: (field, value) => { fields[field] = value; },
    getPatientPopulateOptions: () => ({}),
    loadPreviousVitals() {}, loadAttachmentsForCurrentPatient: async () => {},
    setupAgeCalculation() {}, showCustomToast: (...args) => notices.push(args),
    window: {
      QLPKPatientIntakeForm: {
        populate: async payload => { populated.push(payload); return payload; },
        updatePregnancyControls() {}
      },
      ReceptionistFormResetUtils: { clearSharedFields() {}, clearFormForCopy() {}, resetFormToDefault() {} },
      ReceptionistServicePackage: { setServiceSelection() {} },
      ReceptionistAppointmentPrefill: { applyEditReExamState() {} },
      ReceptionistJointExamOrchestration: { clearPendingList() {} },
      ReceptionistPatientRelativesTable: { syncPatient() {} }
    }
  });
  for (const name of ['beginReceptionistLoad', 'buildSharedFormPayload', 'populateSharedForms', 'applyLoadedAppointment', 'editAppointment', 'copyPatientToReceptionistFormFromGlobalSearch', 'loadPatientMedicalData', 'savePatientDataInternal', 'saveAddressToServerIfEditing', 'resetFormToDefault']) {
    const ending = name === 'resetFormToDefault' ? '\\n\\t\\}' : '\\n\\}';
    const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?${ending}`));
    if (match) vm.runInContext(match[0], context);
  }
  const answer = (request, id) => request.resolve({ ok: true, json: async () => ({ id, full_name: `patient-${id}` }) });
  return { context, requests, populated, notices, fields, answer };
}

test('Edit A trả sau B không đổi lại bệnh nhân/lịch hẹn', async () => {
  const state = harness();
  const first = state.context.editAppointment(11);
  const second = state.context.editAppointment(22);
  state.answer(state.requests[1], 2);
  await second;
  state.answer(state.requests[0], 1);
  await first;
  assert.equal(state.context.currentPatientId, 2);
  assert.equal(state.context.currentAppointmentId, 22);
  assert.equal(state.populated.length, 1);
  assert.equal(state.notices.length, 1);
});

test('Copy cũ không clear hoặc ghi đè edit mới', async () => {
  const state = harness();
  const first = state.context.copyPatientToReceptionistFormFromGlobalSearch({ patient_id: 1 });
  const second = state.context.editAppointment(22);
  state.answer(state.requests[1], 2);
  await second;
  state.answer(state.requests[0], 1);
  assert.equal(await first, false);
  assert.equal(state.context.currentAppointmentId, 22);
  assert.equal(state.context.currentPatientId, 2);
});

test('Populate false chặn thông báo thành công và gán appointment', async () => {
  const state = harness();
  state.context.window.QLPKPatientIntakeForm.populate = async () => false;
  const pending = state.context.editAppointment(11);
  state.answer(state.requests[0], 1);
  assert.equal(await pending, false);
  assert.equal(state.context.currentAppointmentId, null);
  assert.equal(state.context.receptionistLoadState.failed, true);
  assert.equal(state.notices.some(item => item[0] === 'info'), false);
});

test('Tải lỗi hiện tại chặn lưu hành chính và tự lưu địa chỉ', async () => {
  const state = harness();
  state.context.receptionistLoadState.failed = true;
  state.context.window.currentPatientId = 1;
  assert.equal((await state.context.savePatientDataInternal({})).reason, 'not-ready');
  assert.equal((await state.context.saveAddressToServerIfEditing()).reason, 'not-ready');
  assert.equal(state.requests.length, 0);
});

test('Lỗi request cũ không hiện toast trên ca mới', async () => {
  const state = harness();
  const old = state.context.editAppointment(11);
  const latest = state.context.editAppointment(22);
  state.answer(state.requests[1], 2);
  await latest;
  state.requests[0].resolve({ ok: false, text: async () => 'error' });
  await old;
  assert.equal(state.notices.some(item => item[0] === 'error'), false);
  assert.equal(state.context.receptionistLoadState.failed, false);
});

test('Reset trong khi GET đang chờ không điền lại bệnh nhân', async () => {
  const state = harness();
  state.context.uploadedDocuments = [];
  const pending = state.context.editAppointment(11);
  state.context.resetFormToDefault();
  state.answer(state.requests[0], 1);
  assert.equal(await pending, false);
  assert.equal(state.populated.length, 0);
  assert.equal(state.context.currentAppointmentId, null);
  assert.equal(state.context.receptionistLoadState.loading, false);
  assert.equal(state.context.receptionistLoadState.failed, false);
});

test('Không mở lưu trước khi hành chính hydrate xong', async () => {
  const state = harness();
  const hydrate = deferred();
  state.context.window.QLPKPatientIntakeForm.populate = () => hydrate.promise;
  const pending = state.context.editAppointment(11);
  state.answer(state.requests[0], 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.context.receptionistLoadState.loading, true);
  assert.equal((await state.context.savePatientDataInternal({})).reason, 'not-ready');
  hydrate.resolve(true);
  await pending;
  assert.equal(state.context.receptionistLoadState.loading, false);
  assert.equal(state.context.receptionistLoadState.failed, false);
});

test('Response medical data nền cũ không populate sau chọn ca mới', async () => {
  const state = harness();
  state.context.currentPatientId = 1;
  const oldLoad = state.context.loadPatientMedicalData(1);
  const latest = state.context.editAppointment(22);
  state.answer(state.requests[1], 2);
  await latest;
  state.answer(state.requests[0], 1);
  assert.equal(await oldLoad, false);
  assert.equal(state.populated.length, 1);
  assert.equal(state.context.currentPatientId, 2);
});

test('Tải lại thành công sau lỗi mở lưu; lỗi prefill không mở lưu', async () => {
  const state = harness();
  state.context.window.ReceptionistServicePackage.setServiceSelection = () => { throw new Error('prefill failed'); };
  const failed = state.context.editAppointment(11);
  state.answer(state.requests[0], 1);
  assert.equal(await failed, false);
  assert.equal(state.context.receptionistLoadState.failed, true);
  assert.equal(state.context.receptionistLoadState.loading, false);
  state.context.window.ReceptionistServicePackage.setServiceSelection = () => {};
  const retry = state.context.editAppointment(11);
  state.answer(state.requests[1], 1);
  assert.equal(await retry, true);
  assert.equal(state.context.receptionistLoadState.failed, false);
});
