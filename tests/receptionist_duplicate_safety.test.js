'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/js/receptionist-new.js', 'utf8');
function harness() {
  const data = { full_name: 'QA', gender: 'Nam', doctor_id: 1, service_id: 2, appointment_date: '2026-09-27', appointment_time: '10:00' };
  const state = { calls: 0, saves: 0, notices: [], modals: 0 };
  let resolve;
  let reject;
  const response = new Promise((done, fail) => { resolve = done; reject = fail; });
  const context = vm.createContext({
    console, receptionistLoadState: { token: 1, loading: false, failed: false }, currentPatientId: null,
    isSubmitting: false, isCheckingDuplicate: false, collectFormData: () => ({ ...data }),
    apiCall: () => { state.calls++; return response; }, validateReceptionistFormData: () => null,
    showCustomToast: (...args) => state.notices.push(args), showDuplicatePatientModal: () => { state.modals++; },
    savePatientDataInternal: async () => { state.saves++; return { status: 'saved' }; }
  });
  for (const name of ['checkDuplicatePatient', 'savePatientData']) {
    vm.runInContext(source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0], context);
  }
  return { data, state, context, resolve, reject };
}

for (const error of ['http', 'network', 'invalid']) {
  test(`Duplicate ${error} không cho tạo bệnh nhân`, async () => {
    const ctx = harness();
    const pending = ctx.context.savePatientData();
    if (error === 'network') ctx.reject(new Error('unavailable'));
    else ctx.resolve({ ok: error !== 'http', json: async () => error === 'invalid' ? {} : { is_duplicate: false } });
    await pending;
    assert.equal(ctx.state.saves, 0);
    assert.equal(ctx.state.notices.length, 1);
  });
}
test('Nhập khác trong khi kiểm tra trùng không lưu snapshot cũ hoặc mở modal sai', async () => {
  const ctx = harness();
  const pending = ctx.context.savePatientData();
  ctx.data.full_name = 'New input';
  ctx.resolve({ ok: true, json: async () => ({ is_duplicate: true, duplicate_patients: [], count: 0 }) });
  await pending;
  assert.equal(ctx.state.saves, 0);
  assert.equal(ctx.state.modals, 0);
});
test('Bấm đôi chỉ kiểm tra trùng một lần; mở khóa sau hoàn tất', async () => {
  const ctx = harness();
  const first = ctx.context.savePatientData();
  const second = ctx.context.savePatientData();
  ctx.resolve({ ok: true, json: async () => ({ is_duplicate: false }) });
  await Promise.all([first, second]);
  assert.equal(ctx.state.calls, 1);
  assert.equal(ctx.state.saves, 1);
  assert.equal(ctx.context.isCheckingDuplicate, false);
});
test('Lỗi kiểm tra trùng sau đổi ca không toast', async () => {
  const ctx = harness();
  const pending = ctx.context.savePatientData();
  ctx.context.receptionistLoadState.token++;
  ctx.reject(new Error('old failure'));
  await pending;
  assert.equal(ctx.state.saves, 0);
  assert.equal(ctx.state.notices.length, 0);
});
