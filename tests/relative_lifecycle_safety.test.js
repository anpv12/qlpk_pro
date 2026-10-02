'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createWindow } = require('./helpers/fake-dom');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  const messages = [];
  const confirmation = deferred();
  const { document } = createWindow({ html: '<div id="relatives"></div>' });
  const window = { QLPKUserFeedback: { show: (...args) => messages.push(args) }, QLPKConfirmationDialog: { confirm: () => confirmation.promise } };
  runScriptFile('app/static/js/relative-table.js', vm.createContext({ window, document, console }));
  const table = window.RelativeTableManager.init('#relatives', { patientId: 10 });
  const requests = [];
  const rendered = [];
  table.renderRows = rows => { rendered.push(Array.from(rows)); };
  table.showLoading = () => {};
  table.request = (url, options) => { const pending = deferred(); requests.push({ url, options, ...pending }); return pending.promise; };
  const inputs = {
    '.relative-name-input': { value: 'QA name' }, 'input[list*="relative-relationship-list"]': { value: 'Cha' },
    '.relative-id-number-input': { value: '123' }, '.relative-phone-input': { value: '090' },
    '.relative-date-input': { value: '2026-09-27' }, '.relative-emergency-contact-checkbox': { checked: false }
  };
  Object.values(inputs).forEach(input => { input.disabled = false; });
  const row = { dataset: {}, querySelector: selector => inputs[selector], querySelectorAll: () => Object.values(inputs), remove() {} };
  return { table, requests, rendered, messages, confirmation, row, inputs };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Reload trả promise, clear data trước GET và bỏ phản hồi A cũ sau A→B→A', async () => {
  const ctx = harness();
  ctx.table.data = [{ id: 1 }];
  const old = ctx.table.reload();
  assert.equal(typeof old?.then, 'function');
  assert.equal(ctx.table.data.length, 0);
  ctx.table.setPatientId(11);
  ctx.table.setPatientId(10);
  ctx.requests[2].resolve({ success: true, data: [{ id: 3 }] });
  await tick();
  ctx.requests[0].resolve({ success: true, data: [{ id: 1 }] });
  ctx.requests[1].reject(new Error('old failure'));
  await old;
  await tick();
  assert.equal(ctx.table.data[0].id, 3);
  assert.equal(ctx.messages.length, 0);
});

test('Clear vô hiệu hóa GET, xóa cả cache và dòng nhập', async () => {
  const ctx = harness();
  const pending = ctx.table.reload();
  ctx.table.data = [{ id: 1 }];
  ctx.table.pendingRow = ctx.row;
  ctx.table.clear();
  ctx.requests[0].resolve({ success: true, data: [{ id: 2 }] });
  await pending;
  await tick();
  assert.equal(ctx.table.data.length, 0);
  assert.equal(ctx.table.pendingRow, null);
});

for (const action of ['create', 'link', 'delete']) {
  function invoke(ctx) {
    if (action === 'create') return ctx.table.saveNewRelative(ctx.row);
    if (action === 'link') return ctx.table.linkExistingPatient(20, 'Cha');
    return ctx.table.handleDelete({ id: 30 });
  }
  test(`${action}: phản hồi cũ không toast hoặc xóa dòng mới`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const pending = invoke(ctx);
    await tick();
    ctx.table.clear();
    const newRow = {};
    ctx.table.pendingRow = newRow;
    ctx.requests[0].resolve({ success: true, data: { id: 30 } });
    await pending;
    assert.equal(ctx.messages.length, 0);
    assert.equal(ctx.table.pendingRow, newRow);
  });
  test(`${action}: bấm đôi chỉ gửi một request`, async () => {
    const ctx = harness();
    ctx.table.reload = async () => true;
    ctx.confirmation.resolve(true);
    const first = invoke(ctx);
    const second = invoke(ctx);
    await tick();
    const count = ctx.requests.length;
    ctx.requests.forEach(request => request.resolve({ success: true, data: action === 'link' ? [{ id: 30 }] : { id: 30 } }));
    await Promise.all([first, second]);
    assert.equal(count, 1);
    assert.equal(ctx.messages.filter(args => args[0] === 'success').length, 1);
  });
  test(`${action}: lỗi mạng cũ không báo trên ca mới`, async () => {
    const ctx = harness();
    ctx.confirmation.resolve(true);
    const pending = invoke(ctx);
    await tick();
    ctx.table.clear();
    ctx.requests[0].reject(new Error('old failure'));
    await pending;
    assert.equal(ctx.messages.length, 0);
  });
}

test('Xóa: đổi bệnh nhân trong confirmation không gửi DELETE', async () => {
  const ctx = harness();
  const pending = ctx.table.handleDelete({ id: 30 });
  ctx.table.clear();
  ctx.confirmation.resolve(true);
  await tick();
  ctx.requests.forEach(request => request.resolve({ success: true }));
  await pending;
  assert.equal(ctx.requests.length, 0);
});

test('Xóa: success:false không báo thành công', async () => {
  const ctx = harness();
  ctx.table.reload = async () => true;
  ctx.confirmation.resolve(true);
  const pending = ctx.table.handleDelete({ id: 30 });
  await tick();
  ctx.requests[0].resolve({ success: false });
  await pending;
  assert.equal(ctx.messages.some(args => args[0] === 'success'), false);
});

test('Chế độ chỉ đọc chặn create/link/delete gọi trực tiếp', async () => {
  const ctx = harness();
  ctx.table.readOnly = true;
  ctx.confirmation.resolve(true);
  const pending = [ctx.table.saveNewRelative(ctx.row), ctx.table.linkExistingPatient(20, 'Cha'), ctx.table.handleDelete({ id: 30 })];
  await tick();
  ctx.requests.forEach(request => request.resolve({ success: false }));
  await Promise.all(pending);
  assert.equal(ctx.requests.length, 0);
});

test('Đang nhập: reload hoặc realtime không ghi đè dòng', async () => {
  const ctx = harness();
  ctx.table.pendingRow = ctx.row;
  ctx.table.data = [{ id: 30 }];
  ctx.table.reload();
  ctx.table.replaceMember({ id: 30, name: 'server' });
  assert.equal(ctx.requests.length, 0);
  assert.equal(ctx.rendered.length, 0);
});

test('Lưu lỗi giữ row, mở lại input và retry thành công mới xóa row', async () => {
  const ctx = harness();
  ctx.table.pendingRow = ctx.row;
  ctx.inputs['.relative-id-number-input'].disabled = true;
  ctx.table.reload = async () => true;
  const first = ctx.table.saveNewRelative(ctx.row);
  assert.equal(Object.values(ctx.inputs).every(input => input.disabled), true);
  ctx.requests[0].reject(new Error('current failure'));
  await first;
  assert.equal(ctx.table.pendingRow, ctx.row);
  assert.equal(ctx.inputs['.relative-name-input'].disabled, false);
  assert.equal(ctx.inputs['.relative-id-number-input'].disabled, true);
  const retry = ctx.table.saveNewRelative(ctx.row);
  ctx.requests[1].resolve({ success: true, data: { id: 30 } });
  assert.equal(await retry, true);
  assert.equal(ctx.table.pendingRow, null);
});

test('Row cũ không được POST vào bệnh nhân mới', async () => {
  const ctx = harness();
  ctx.table.rowContexts.set(ctx.row, ctx.table.createContextGuard());
  ctx.table.clear();
  ctx.table.patientId = 11;
  await ctx.table.saveNewRelative(ctx.row);
  assert.equal(ctx.requests.length, 0);
});

test('Link success:true thiếu dữ liệu xác nhận không coi là đã liên kết', async () => {
  const ctx = harness();
  const pending = ctx.table.linkExistingPatient(20, 'Cha');
  ctx.requests[0].resolve({ success: true, data: [] });
  assert.equal(await pending, false);
  assert.equal(ctx.messages.some(args => args[0] === 'success'), false);
});

test('Đổi bệnh nhân trong lúc ghi vẫn tải được danh sách mới', async () => {
  const ctx = harness();
  const pending = ctx.table.saveNewRelative(ctx.row);
  const loading = ctx.table.setPatientId(11);
  assert.equal(ctx.requests.length, 2);
  ctx.requests[1].resolve({ success: true, data: [] });
  await loading;
  ctx.requests[0].resolve({ success: true, data: { id: 30 } });
  await pending;
  assert.equal(ctx.messages.length, 0);
});

test('Reload cùng bệnh nhân: request mới nhất thắng kể cả lỗi cũ', async () => {
  const ctx = harness();
  const old = ctx.table.reload();
  const latest = ctx.table.reload();
  ctx.requests[1].resolve({ success: true, data: [{ id: 31 }] });
  await latest;
  ctx.requests[0].reject(new Error('old error'));
  await old;
  assert.equal(ctx.table.data[0].id, 31);
  assert.equal(ctx.messages.length, 0);
});

test('Chọn autocomplete trong lúc lưu không thay nội dung snapshot', async () => {
  const ctx = harness();
  const pending = ctx.table.saveNewRelative(ctx.row);
  ctx.table.fillPatientData(ctx.row, { id: 90, full_name: 'Changed while saving' });
  assert.equal(ctx.inputs['.relative-name-input'].value, 'QA name');
  ctx.requests[0].resolve({ success: false });
  await pending;
});

test('Clear phải dispose dropdown của dòng cũ', () => {
  const ctx = harness();
  let disposed = false;
  ctx.row._relativeDropdownDispose = () => { disposed = true; };
  ctx.table.pendingRow = ctx.row;
  ctx.table.clear();
  assert.equal(disposed, true);
});

test('Khởi tạo không có bệnh nhân hiện trạng thái rỗng giống clear()', () => {
  const { document } = createWindow({ html: '<div id="relatives"></div>' });
  const window = { QLPKUserFeedback: { show() {} } };
  runScriptFile('app/static/js/relative-table.js', vm.createContext({ window, document, console }));
  const table = window.RelativeTableManager.init('#relatives', {});
  const emptyState = document.querySelector('.relative-empty-state');
  assert.equal(emptyState.classList.contains('active'), true);
  assert.equal(document.querySelector('#relatives tbody').innerHTML, '');
  table.clear();
  assert.equal(emptyState.classList.contains('active'), true);
});
