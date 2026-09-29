'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');
const root = path.join(__dirname, '../app/static/js');
const page = readScriptSource(path.join(root, 'receptionist-new.js'));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const calls = [];
  const toasts = [];
  const cache = new Map();
  const window = {};
  const data = { full_name: 'QA', doctor_id: 1, service_id: 2, appointment_date: '2026-09-27', appointment_time: '10:00' };
  const context = vm.createContext({
    window, console, currentPatientId: 7, currentAppointmentId: 70, isSubmitting: false,
    collectFormData: () => ({ ...data }),
    receptionistLoadState: { token: 1, loading: false, failed: false },
    uploadedDocuments: [], DOCUMENT_DRAFT_KEY: 'draft',
    document: { getElementById: () => null },
    sessionStorage: { setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) },
    apiCall: async (url, request) => { calls.push({ url, request }); return { ok: true, json: async () => ({ id: url.includes('appointments') ? 70 : 7 }) }; },
    uploadFile: async () => true,
    loadAttachmentsForCurrentPatient: async () => {},
    setCurrentPatientId: value => { context.currentPatientId = value; },
    renderDocumentsList() {}, highlightAppointmentDateTimeFields() {},
    showCustomToast: (...args) => toasts.push(args),
    refreshReceptionistAfterSuccessfulSave: async () => { context.resets += 1; },
    savePendingJointExamList: async () => ({ status: 'saved' }), resets: 0,
    $: () => ({ focus() {} })
  });
  for (const filename of ['receptionist/appointment-submit.js', 'components/document-section-ui-utils.js']) {
    runScriptFile(path.join(root, filename), context);
  }
  for (const name of ['saveReceptionistAppointment', 'savePatientDataInternal', 'buildReceptionistSubmission', 'saveReceptionistPatient', 'uploadReceptionistDraftDocuments']) {
    const match = page.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    if (match) vm.runInContext(match[0], context);
  }
  return { context, calls, toasts, cache, data, save: () => context.savePatientDataInternal({ ...data }) };
}

for (const stage of ['patients', 'appointments']) {
  test(`Nhập thêm khi ${stage} đang lưu không reset form; retry dùng ID cũ`, async () => {
    const state = harness();
    state.context.currentPatientId = null;
    state.context.currentAppointmentId = null;
    const pending = deferred();
    const original = state.context.apiCall;
    let held = false;
    state.context.apiCall = async (url, request) => {
      const result = await original(url, request);
      if (!held && url.includes(stage)) { held = true; await pending.promise; }
      return result;
    };
    const saving = state.save();
    await new Promise(resolve => setImmediate(resolve));
    state.data.full_name = 'QA changed';
    pending.resolve();
    assert.equal((await saving).status, 'dirty');
    assert.equal(state.context.resets, 0);
    assert.equal(state.context.currentPatientId, 7);
    assert.equal(state.context.currentAppointmentId, 70);
    assert.equal((await state.save()).status, 'saved');
    assert.equal(state.calls.filter(call => call.request.method === 'POST' && call.url.includes('patients')).length, 1);
    assert.equal(state.calls.filter(call => call.request.method === 'POST' && call.url.includes('appointments')).length, 1);
    const lastPatient = state.calls.filter(call => call.url.includes('patients')).at(-1);
    assert.equal(JSON.parse(lastPatient.request.body).full_name, 'QA changed');
  });
}

test('Thêm file nháp khi appointment đang lưu không reset mất file', async () => {
  const state = harness();
  const pending = deferred();
  const original = state.context.apiCall;
  state.context.apiCall = async (url, request) => {
    const result = await original(url, request);
    if (url.includes('appointments')) await pending.promise;
    return result;
  };
  const saving = state.save();
  await new Promise(resolve => setImmediate(resolve));
  const file = { id: 'new', file: {} };
  state.context.uploadedDocuments.push(file);
  pending.resolve();
  assert.equal((await saving).status, 'dirty');
  assert.equal(state.context.resets, 0);
  assert.equal(state.context.uploadedDocuments[0], file);
});

test('Appointment response sai ID không lưu người đi cùng hoặc reset', async () => {
  const state = harness();
  const original = state.context.apiCall;
  let companionsSaved = false;
  state.context.savePendingJointExamList = async () => { companionsSaved = true; return { status: 'saved' }; };
  state.context.apiCall = async (url, request) => url.includes('appointments')
    ? { ok: true, json: async () => ({ id: 71 }) } : original(url, request);
  assert.equal((await state.save()).status, 'error');
  assert.equal(companionsSaved, false);
  assert.equal(state.context.resets, 0);
});

test('Nhập thêm khi đang lưu người đi cùng cũng phải giữ form', async () => {
  const state = harness();
  const pending = deferred();
  state.context.savePendingJointExamList = () => pending.promise;
  const saving = state.save();
  await new Promise(resolve => setImmediate(resolve));
  state.data.notes = 'Ghi chú nhập sau';
  pending.resolve({ status: 'saved' });
  assert.equal((await saving).status, 'dirty');
  assert.equal(state.context.resets, 0);
  assert.equal(state.toasts.some(args => args[0] === 'success'), false);
});

test('Đổi ca trong patient PUT không ghi appointment ca mới', async () => {
  const state = harness();
  const pending = deferred();
  state.context.apiCall = async (url, request) => { state.calls.push({ url, request }); return pending.promise; };
  const saving = state.save();
  state.context.currentPatientId = 8;
  state.context.currentAppointmentId = 80;
  state.context.receptionistLoadState.token += 1;
  pending.resolve({ ok: true, json: async () => ({ id: 7 }) });
  assert.equal((await saving).status, 'stale');
  assert.equal(state.calls.length, 1);
  assert.equal(state.context.resets, 0);
  assert.deepEqual(state.toasts, []);
});

test('Bấm lưu hai lần chỉ gửi một patient request', async () => {
  const state = harness();
  const pending = deferred();
  state.context.apiCall = async (url, request) => { state.calls.push({ url, request }); return pending.promise; };
  const first = state.save();
  assert.equal((await state.save()).reason, 'saving');
  pending.resolve({ ok: false, text: async () => 'failure' });
  await first;
  assert.equal(state.calls.length, 1);
  assert.equal(state.context.isSubmitting, false);
});

test('Upload thất bại giữ draft, không gửi appointment, retry không lặp file thành công', async () => {
  const state = harness();
  const first = { id: 1, name: 'first.pdf', file: { name: 'first.pdf' } };
  const second = { id: 2, name: 'second.pdf', file: { name: 'second.pdf' } };
  state.context.uploadedDocuments = [first, second];
  const uploaded = [];
  let fail = true;
  state.context.uploadFile = async file => { uploaded.push(file.name); return file !== second.file || !fail; };
  assert.equal((await state.save()).status, 'error');
  assert.deepEqual(Array.from(state.context.uploadedDocuments), [second]);
  assert.equal(state.calls.some(call => call.url.includes('appointments')), false);
  fail = false;
  assert.equal((await state.save()).status, 'saved');
  assert.deepEqual(uploaded, ['first.pdf', 'second.pdf', 'second.pdf']);
  assert.equal(state.context.resets, 1);
});

test('Response appointment cũ không reset form mới', async () => {
  const state = harness();
  const pending = deferred();
  state.context.apiCall = async url => url.includes('appointments') ? pending.promise : { ok: true, json: async () => ({ id: 7 }) };
  const saving = state.save();
  await new Promise(resolve => setImmediate(resolve));
  state.context.receptionistLoadState.token += 1;
  pending.resolve({ ok: true, json: async () => ({ id: 70 }) });
  assert.equal((await saving).status, 'stale');
  assert.equal(state.context.resets, 0);
  assert.deepEqual(state.toasts, []);
});

test('Patient mới đã tạo được giữ ID khi appointment lỗi để retry không tạo trùng', async () => {
  const state = harness();
  state.context.currentPatientId = null;
  state.context.currentAppointmentId = null;
  state.context.apiCall = async (url, request) => {
    state.calls.push({ url, request });
    return url.includes('appointments') ? { ok: false, text: async () => 'failed' } : { ok: true, json: async () => ({ id: 7 }) };
  };
  await state.save();
  await state.save();
  assert.equal(state.context.currentPatientId, 7);
  assert.equal(state.calls.filter(call => call.url === '/api/patients/' && call.request.method === 'POST').length, 1);
});

test('Thiếu File gốc không xóa metadata hoặc gửi appointment', async () => {
  const state = harness();
  state.context.uploadedDocuments = [{ id: 3, name: 'missing.pdf' }];
  assert.equal((await state.save()).status, 'error');
  assert.equal(state.context.uploadedDocuments.length, 1);
  assert.equal(state.calls.some(call => call.url.includes('appointments')), false);
});

test('Đổi ca lúc upload không xóa draft mới hoặc ghi appointment', async () => {
  const state = harness();
  const upload = deferred();
  state.context.uploadedDocuments = [{ id: 1, file: {} }];
  state.context.uploadFile = () => upload.promise;
  const saving = state.save();
  await new Promise(resolve => setImmediate(resolve));
  const newDraft = { id: 2, file: {} };
  state.context.uploadedDocuments = [newDraft];
  state.context.receptionistLoadState.token += 1;
  upload.resolve(true);
  assert.equal((await saving).status, 'stale');
  assert.deepEqual(Array.from(state.context.uploadedDocuments), [newDraft]);
  assert.equal(state.calls.some(call => call.url.includes('appointments')), false);
});

test('Patient response thiếu ID không gửi appointment', async () => {
  const state = harness();
  state.context.apiCall = async (url, request) => { state.calls.push({ url, request }); return { ok: true, json: async () => ({}) }; };
  assert.equal((await state.save()).status, 'error');
  assert.equal(state.calls.length, 1);
});

test('Retry người đi cùng với appointment đã tạo, không báo saved/reset khi còn lỗi', async () => {
  const state = harness();
  state.context.currentAppointmentId = null;
  let attempts = 0;
  state.context.savePendingJointExamList = async () => (++attempts === 1 ? { status: 'error' } : { status: 'saved' });
  assert.equal((await state.save()).status, 'jointExamError');
  assert.equal(state.context.resets, 0);
  assert.equal(state.context.currentAppointmentId, 70);
  assert.equal((await state.save()).status, 'saved');
  assert.equal(attempts, 2);
  assert.equal(state.calls.filter(call => call.url.includes('appointments') && call.request.method === 'POST').length, 1);
});
