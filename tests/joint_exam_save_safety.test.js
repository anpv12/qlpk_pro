'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const window = {};
  runScriptFile('app/static/js/joint-exam-manager.js', vm.createContext({ window, console, document: {} }));
  let appointmentId = 70;
  const calls = [];
  const manager = new window.JointExamManager({
    getAppointmentId: () => appointmentId,
    apiCall: async (url, request) => {
      calls.push({ url, data: JSON.parse(request.body) });
      return { ok: true, json: async () => ({ success: true, data: { id: calls.length } }) };
    }, showToast() {}
  });
  manager.load = async () => true;
  manager.renderPendingList = () => {};
  manager.pendingJointExamList = [{ temp_id: 'a', name: 'A' }, { temp_id: 'b', name: 'B' }];
  return { manager, calls, switchTo: value => { appointmentId = value; } };
}

test('Lỗi dòng thứ hai giữ đúng dòng lỗi, retry không POST lại dòng đầu', async () => {
  const state = harness();
  const api = state.manager.apiCall;
  let fail = true;
  state.manager.apiCall = async (url, request) => {
    if (JSON.parse(request.body).name === 'B' && fail) return { ok: false };
    return api(url, request);
  };
  assert.equal((await state.manager.savePendingList(70)).status, 'error');
  assert.deepEqual(Array.from(state.manager.pendingJointExamList, item => item.name), ['B']);
  fail = false;
  assert.equal((await state.manager.savePendingList(70)).status, 'saved');
  assert.deepEqual(state.calls.map(call => call.data.name), ['A', 'B']);
});

test('HTTP200 nhưng success false không xóa dòng', async () => {
  const state = harness();
  state.manager.apiCall = async () => ({ ok: true, json: async () => ({ success: false }) });
  assert.equal((await state.manager.savePendingList(70)).status, 'error');
  assert.equal(state.manager.pendingJointExamList.length, 2);
});

test('Clear/đổi ca trong POST không xóa queue mới hoặc POST dòng tiếp', async () => {
  const state = harness();
  const pending = deferred();
  state.manager.apiCall = async (...args) => { state.calls.push(args); return pending.promise; };
  const saving = state.manager.savePendingList(70);
  state.manager.clearPendingList();
  state.switchTo(80);
  state.manager.pendingJointExamList.push({ temp_id: 'c', name: 'C' });
  pending.resolve({ ok: true, json: async () => ({ success: true, data: { id: 1 } }) });
  assert.equal((await saving).status, 'stale');
  assert.equal(state.calls.length, 1);
  assert.equal(state.manager.pendingJointExamList[0].name, 'C');
});

test('Bấm lưu hai lần chỉ có một chuỗi POST', async () => {
  const state = harness();
  const pending = deferred();
  state.manager.apiCall = () => pending.promise;
  const saving = state.manager.savePendingList(70);
  assert.equal((await state.manager.savePendingList(70)).reason, 'saving');
  pending.resolve({ ok: false });
  assert.equal((await saving).status, 'error');
});

test('Guard page hết hạn không gửi request dù appointment ID giống nhau', async () => {
  const state = harness();
  assert.equal((await state.manager.savePendingList(70, { isCurrentContext: () => false })).status, 'stale');
  assert.equal(state.calls.length, 0);
});

test('Dòng nhập chưa xác nhận chặn save thay vì reset mất dòng', async () => {
  const state = harness();
  state.manager.pendingJointExamRow = {};
  assert.equal((await state.manager.savePendingList(70)).reason, 'unfinished-row');
  assert.equal(state.calls.length, 0);
});

test('Dòng mới thêm lúc reload không được báo saved', async () => {
  const state = harness();
  state.manager.load = async () => { state.manager.pendingJointExamList.push({ name: 'C' }); };
  assert.equal((await state.manager.savePendingList(70)).status, 'error');
  assert.equal(state.manager.pendingJointExamList[0].name, 'C');
});

test('Clear khi reload đang chờ không render danh sách ca cũ', async () => {
  const state = harness();
  const pending = deferred();
  delete state.manager.load;
  const rendered = [];
  state.manager.tableBody = { innerHTML: 'new', replaceChildren() { this.innerHTML = ''; } };
  state.manager.renderTable = rows => rendered.push(rows);
  state.manager.apiCall = () => pending.promise;
  const loading = state.manager.load();
  state.manager.clearPendingList();
  state.manager.tableBody.innerHTML = 'new';
  pending.resolve({ ok: true, json: async () => ({ data: [{ id: 1 }] }) });
  assert.equal(await loading, false);
  assert.equal(rendered.length, 0);
  assert.equal(state.manager.tableBody.innerHTML, 'new');
});
