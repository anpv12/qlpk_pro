'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  const requests = [];
  const confirmation = deferred();
  const state = { appointment: 10, token: 1, toasts: [], reloads: 0, familyLoads: 0, removed: false };
  const inputs = ['Người đi cùng', 'Cha', '123456789', '0900000000', '2026-09-27'].map(value => ({ value, disabled: false }));
  const selectors = ['#jointExamNameInput', '#jointExamKinshipInput', '#jointExamIdNumberInput', '#jointExamPhoneInput', '#jointExamDateInput'];
  const row = {
    dataset: {}, classList: { add() {} },
    querySelector: selector => inputs[selectors.indexOf(selector)],
    querySelectorAll: () => inputs,
    remove: () => { state.removed = true; }
  };
  const document = { querySelector: () => row };
  const window = { QLPKConfirmationDialog: { confirm: () => confirmation.promise } };
  runScriptFile('app/static/js/joint-exam-manager.js', vm.createContext({ window, document, console }));
  const manager = new window.JointExamManager({
    getAppointmentId: () => state.appointment, getContextToken: () => state.token,
    showToast: (...args) => state.toasts.push(args),
    onReloadFamilyMembers: () => { state.familyLoads++; },
    apiCall: (url, options) => { const pending = deferred(); requests.push({ url, options, ...pending }); return pending.promise; }
  });
  manager.tableBody = { innerHTML: 'old', replaceChildren() { this.innerHTML = ''; }, contains: () => !state.removed, querySelector: () => row };
  manager.load = async () => { state.reloads++; };
  const invoke = action => action === 'create' ? manager.saveNew(row) : action === 'update' ? manager.update(row, 20) : manager.delete(20);
  return { manager, requests, confirmation, state, row, inputs, invoke, originalLoad: window.JointExamManager.prototype.load };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const success = () => ({ ok: true, json: async () => ({ success: true, data: { id: 20 } }) });

for (const action of ['create', 'update', 'delete']) {
  test(`${action}: phản hồi sau A→B→A không tác động ca mới`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const pending = ctx.invoke(action);
    await tick();
    assert.equal(ctx.requests.length, 1);
    ctx.state.token += 2;
    const newRow = { name: 'new row' };
    ctx.manager.pendingJointExamRow = newRow;
    ctx.requests[0].resolve(success());
    await pending;
    assert.equal(ctx.state.toasts.length, 0);
    assert.equal(ctx.state.reloads, 0);
    assert.equal(ctx.state.familyLoads, 0);
    assert.equal(ctx.manager.pendingJointExamRow, newRow);
  });

  test(`${action}: lỗi mạng cũ không toast`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const pending = ctx.invoke(action);
    await tick();
    ctx.state.token++;
    ctx.requests[0].reject(new Error('old error'));
    await pending;
    assert.equal(ctx.state.toasts.length, 0);
  });

  test(`${action}: bấm đôi một request, thành công reload một lần`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const first = ctx.invoke(action);
    const second = ctx.invoke(action);
    await tick();
    const count = ctx.requests.length;
    ctx.requests.forEach(request => request.resolve(success()));
    await Promise.all([first, second]);
    assert.equal(count, 1);
    assert.equal(ctx.state.reloads, 1);
    assert.equal(ctx.state.familyLoads, 1);
  });

  test(`${action}: HTTP200 success:false không báo đã lưu`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const pending = ctx.invoke(action);
    await tick();
    ctx.requests[0].resolve({ ok: true, json: async () => ({ success: false }) });
    await pending;
    assert.equal(ctx.state.reloads, 0);
    assert.equal(ctx.state.toasts.some(args => args[0] === 'success'), false);
    assert.equal(ctx.state.removed, false);
  });

  test(`${action}: đổi ca khi reload không reload người thân ca mới`, async () => {
    const ctx = harness();
    const reload = deferred();
    ctx.manager.load = () => reload.promise;
    ctx.confirmation.resolve(true);
    const pending = ctx.invoke(action);
    await tick();
    ctx.requests[0].resolve(success());
    await tick();
    ctx.state.token++;
    reload.resolve(true);
    await pending;
    assert.equal(ctx.state.familyLoads, 0);
  });
}

test('Xóa: đổi ca khi xác nhận không gửi DELETE', async () => {
  const ctx = harness();
  const pending = ctx.invoke('delete');
  ctx.state.token++;
  ctx.confirmation.resolve(true);
  await tick();
  ctx.requests.forEach(request => request.resolve(success()));
  await pending;
  assert.equal(ctx.requests.length, 0);
});

test('Sửa: khóa input lúc đang PUT, lỗi mở lại đúng trạng thái ban đầu', async () => {
  const ctx = harness();
  ctx.inputs[2].disabled = true;
  const pending = ctx.invoke('update');
  const locked = ctx.inputs.every(input => input.disabled);
  ctx.requests[0].resolve({ ok: false });
  await pending;
  assert.equal(locked, true);
  assert.deepEqual(ctx.inputs.map(input => input.disabled), [false, false, true, false, false]);
});

test('Load: danh sách cũ bị clear, request mới nhất thắng', async () => {
  const ctx = harness();
  ctx.manager.load = ctx.originalLoad;
  const rendered = [];
  ctx.manager.renderTable = rows => rendered.push(rows[0].id);
  const old = ctx.manager.load();
  assert.equal(ctx.manager.tableBody.innerHTML, '');
  const latest = ctx.manager.load();
  ctx.requests[1].resolve({ ok: true, json: async () => ({ success: true, data: [{ id: 'latest' }] }) });
  await latest;
  ctx.requests[0].resolve({ ok: true, json: async () => ({ success: true, data: [{ id: 'old' }] }) });
  await old;
  assert.deepEqual(rendered, ['latest']);
});

test('Edit GET lỗi sau đổi ca không báo lỗi trên ca mới', async () => {
  const ctx = harness();
  const pending = ctx.manager.edit(20);
  ctx.state.token++;
  ctx.requests[0].resolve({ ok: false });
  await pending;
  assert.equal(ctx.state.toasts.length, 0);
});

test('Update lỗi giữ nội dung để retry và không để refresh xóa dòng đang sửa', async () => {
  const ctx = harness();
  ctx.manager.rowContexts.set(ctx.row, () => true);
  ctx.manager.pendingJointExamRow = ctx.row;
  ctx.manager.load = ctx.originalLoad;
  assert.equal(await ctx.manager.load(), false);
  assert.equal(ctx.requests.length, 0);
  const first = ctx.invoke('update');
  ctx.requests[0].resolve({ ok: false });
  await first;
  assert.equal(ctx.state.removed, false);
  assert.equal(ctx.manager.pendingJointExamRow, ctx.row);
  ctx.manager.load = async () => { ctx.state.reloads++; };
  const retry = ctx.invoke('update');
  ctx.requests[1].resolve(success());
  assert.equal(await retry, true);
  assert.equal(ctx.state.reloads, 1);
});

test('Response JSON hoàn tất sau đổi ca không báo thành công', async () => {
  const ctx = harness();
  const json = deferred();
  const pending = ctx.invoke('update');
  ctx.requests[0].resolve({ ok: true, json: () => json.promise });
  await tick();
  ctx.state.token++;
  json.resolve({ success: true, data: { id: 20 } });
  await pending;
  assert.equal(ctx.state.toasts.length, 0);
});

test('Dòng từ ca cũ không được PUT vào appointment mới', async () => {
  const ctx = harness();
  ctx.manager.rowContexts.set(ctx.row, ctx.manager.createContextGuard());
  ctx.state.appointment = 11;
  await ctx.invoke('update');
  assert.equal(ctx.requests.length, 0);
});

test('Đổi ca lúc đang ghi vẫn cho tải danh sách ca mới', async () => {
  const ctx = harness();
  ctx.manager.load = ctx.originalLoad;
  const mutation = ctx.invoke('update');
  ctx.state.token++;
  const loading = ctx.manager.load();
  assert.equal(ctx.requests.length, 2);
  ctx.requests[1].resolve({ ok: true, json: async () => ({ success: true, data: [] }) });
  await loading;
  ctx.requests[0].resolve(success());
  await mutation;
  assert.equal(ctx.state.toasts.length, 0);
});

test('Edit GET cũ không biến dòng thành form khi DELETE đã bắt đầu', async () => {
  const ctx = harness();
  const editing = ctx.manager.edit(20);
  const deleting = ctx.manager.delete(20);
  ctx.requests[0].resolve({ ok: true, json: async () => ({ success: true, data: { id: 20, appointment_id: 10 } }) });
  await editing;
  assert.equal(ctx.state.toasts.length, 0);
  assert.equal(ctx.manager.pendingJointExamRow, null);
  ctx.confirmation.resolve(false);
  await deleting;
});

test('Load success:false không được render dữ liệu như thành công', async () => {
  const ctx = harness();
  ctx.manager.load = ctx.originalLoad;
  const rendered = [];
  ctx.manager.renderTable = data => rendered.push(data);
  const loading = ctx.manager.load();
  ctx.requests[0].resolve({ ok: true, json: async () => ({ success: false, data: [{ id: 20 }] }) });
  await loading;
  assert.equal(rendered.length, 0);
});
