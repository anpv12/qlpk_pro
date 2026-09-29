'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

test('download action forwards context guard across patient switch', async () => {
  const ctx = harness();
  let guard;
  ctx.options.openAttachmentPreviewInNewTab = async (id, filename, options) => { guard = options.isCurrentContext; };
  ctx.render();
  await ctx.click('download');
  assert.equal(guard(), true);
  ctx.state.patient = 2;
  assert.equal(guard(), false);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  const listeners = {};
  const list = { innerHTML: '', contains: () => true, addEventListener: (event, handler) => { listeners[event] = handler; } };
  const document = { getElementById: id => id === 'documentsList' ? list : null };
  const window = { document };
  const context = vm.createContext({ window, document, console, FormData: class { append() {} } });
  for (const name of ['receptionist/document-attachment-utils.js', 'receptionist/document-attachment-controls.js', 'receptionist/document-attachment-list.js', 'components/document-section-ui-utils.js']) {
    runScriptFile(`app/static/js/${name}`, context);
  }
  const state = { patient: 1, token: 1, documents: [], attachments: [{ id: 10 }], toasts: [], calls: 0, loads: 0 };
  const confirmation = deferred();
  const response = deferred();
  const options = {
    document, getCurrentPatientId: () => state.patient, getContextToken: () => state.token,
    getAttachments: () => state.attachments, getUploadedDocuments: () => state.documents,
    setUploadedDocuments: documents => { state.documents = documents; },
    showConfirmationDialog: () => confirmation.promise,
    apiCall: () => { state.calls++; return response.promise; },
    showToast: (...args) => state.toasts.push(args), showSuccess: message => state.toasts.push(message),
    loadAttachmentsForCurrentPatient: () => { state.loads++; },
    renderDocumentsList: () => window.ReceptionistDocumentAttachmentList.renderDocumentsList(options)
  };
  const render = () => options.renderDocumentsList();
  const click = (action = 'delete', id = '10') => {
    const button = { getAttribute: key => key === 'data-action' ? action : id };
    return listeners.click({ target: { closest: () => button } });
  };
  return { window, state, options, confirmation, response, render, click, document, list };
}

for (const change of ['patient', 'roundtrip', 'empty']) {
  test(`Xóa tệp: đổi ${change} trong xác nhận không gửi DELETE`, async () => {
    const ctx = harness();
    ctx.render();
    const pending = ctx.click();
    if (change === 'patient') ctx.state.patient = 2;
    if (change === 'roundtrip') ctx.state.token += 2;
    if (change === 'empty') { ctx.state.attachments = []; ctx.render(); }
    ctx.confirmation.resolve(true);
    ctx.response.resolve({ ok: true });
    await pending;
    assert.equal(ctx.state.calls, 0);
    assert.equal(ctx.state.toasts.length, 0);
  });
}

for (const outcome of ['success', 'http', 'network']) {
  test(`Xóa tệp: ${outcome} đến sau đổi ca không toast/reload`, async () => {
    const ctx = harness();
    ctx.render();
    ctx.confirmation.resolve(true);
    const pending = ctx.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ctx.state.calls, 1);
    ctx.state.token++;
    if (outcome === 'network') ctx.response.reject(new Error('network'));
    else ctx.response.resolve({ ok: outcome === 'success' });
    await pending;
    assert.equal(ctx.state.toasts.length, 0);
    assert.equal(ctx.state.loads, 0);
  });
}

for (const owner of ['ReceptionistDocumentAttachmentControls', 'ClinicalDocumentSectionUiUtils']) {
  test(`${owner}: chuỗi nhiều file dừng sau đổi ca`, async () => {
    const ctx = harness();
    const events = {};
    const input = { addEventListener: (name, handler) => { events[name] = handler; } };
    const options = {
      ...ctx.options,
      document: { getElementById: id => id === 'documentFileInput' ? input : null },
      apiCall: async () => ({ ok: true, json: async () => ({}) }),
      hasCurrentPatient: () => true,
      uploadAttachment: () => { ctx.state.calls++; return ctx.response.promise; },
      uploadFile: () => { ctx.state.calls++; return ctx.response.promise; }
    };
    if (owner === 'ReceptionistDocumentAttachmentControls') await ctx.window[owner].initializeDocumentUpload(options);
    else ctx.window[owner].bindDocumentUploadControls(options);
    const pending = events.change({ target: { files: [{ name: 'first.pdf' }, { name: 'second.pdf' }], value: '' } });
    assert.equal(ctx.state.calls, 1);
    ctx.state.token += 2;
    ctx.response.resolve(true);
    await pending;
    assert.equal(ctx.state.calls, 1);
  });
}

for (const confirmation of ['cancel', 'missing', 'reject']) {
  test(`Xóa tệp: ${confirmation} không gửi request`, async () => {
    const ctx = harness();
    if (confirmation === 'missing') ctx.options.showConfirmationDialog = null;
    ctx.render();
    const pending = ctx.click();
    if (confirmation === 'reject') ctx.confirmation.reject(new Error('dialog failed'));
    else ctx.confirmation.resolve(false);
    await pending;
    assert.equal(ctx.state.calls, 0);
  });
}

test('Xóa tệp: bấm đôi chỉ gửi một request, lần render mới dùng callback mới', async () => {
  const ctx = harness();
  ctx.render();
  const nextOptions = { ...ctx.options, apiCall: () => { ctx.state.calls += 10; return ctx.response.promise; } };
  ctx.window.ReceptionistDocumentAttachmentList.renderDocumentsList(nextOptions);
  const first = ctx.click();
  const second = ctx.click();
  ctx.confirmation.resolve(true);
  ctx.response.resolve({ ok: true });
  await Promise.all([first, second]);
  assert.equal(ctx.state.calls, 10);
  assert.equal(ctx.state.loads, 1);
});

test('Khóa hồ sơ trong hộp xác nhận chặn xóa, vẫn cho xem tệp', async () => {
  const ctx = harness();
  let locked = false;
  let previews = 0;
  ctx.options.ensureEditingAllowed = () => !locked;
  ctx.options.openAttachmentPreviewInNewTab = () => { previews++; };
  ctx.render();
  const pending = ctx.click();
  locked = true;
  ctx.confirmation.resolve(true);
  await pending;
  assert.equal(ctx.state.calls, 0);
  await ctx.click('download');
  assert.equal(previews, 1);
});

test('TLG upload: cùng context vẫn thông báo và reload sau thành công', async () => {
  const ctx = harness();
  const result = await ctx.window.ClinicalDocumentSectionUiUtils.uploadFileToPatient({}, 1, {
    fetch: async () => ({ ok: true }), isCurrentContext: () => true,
    showSuccess: message => ctx.state.toasts.push(message), loadAttachments: () => { ctx.state.loads++; }
  });
  assert.equal(result, true);
  assert.equal(ctx.state.toasts.length, 1);
  assert.equal(ctx.state.loads, 1);
});

test('TLG upload: fetch không bị gọi với options làm this', async () => {
  const ctx = harness();
  const result = await ctx.window.ClinicalDocumentSectionUiUtils.uploadFileToPatient({}, 1, {
    fetch: async function () {
      assert.equal(this, undefined);
      return { ok: true };
    }
  });
  assert.equal(result, true);
});

for (const owner of ['ReceptionistDocumentAttachmentUtils', 'ClinicalDocumentSectionUiUtils']) {
  test(`${owner}: xác nhận cũ không xóa nháp mới trùng ID`, async () => {
    const ctx = harness();
    ctx.state.documents = [{ id: 10, name: 'old' }];
    const pending = ctx.window[owner].deleteDraftDocument('10', ctx.options);
    const replacement = { id: 10, name: 'new' };
    ctx.state.documents = [replacement];
    ctx.confirmation.resolve(true);
    await pending;
    assert.equal(ctx.state.documents[0], replacement);
    assert.equal(ctx.state.toasts.length, 0);
  });
  test(`${owner}: ID DOM dạng chuỗi xóa đúng nháp hiện tại`, async () => {
    const ctx = harness();
    ctx.state.documents = [{ id: 10 }];
    ctx.confirmation.resolve(true);
    assert.equal(await ctx.window[owner].deleteDraftDocument('10', ctx.options), true);
    assert.equal(ctx.state.documents.length, 0);
  });
}

for (const owner of ['ReceptionistDocumentAttachmentControls', 'ClinicalDocumentSectionUiUtils']) {
  test(`${owner}: upload trực tiếp truyền guard cả A→B→A`, async () => {
    const ctx = harness();
    let guard;
    ctx.options.uploadFile = async (file, patient, options) => { guard = options.isCurrentContext; return true; };
    await ctx.window[owner].uploadAttachmentForCurrentPatient({}, ctx.options);
    assert.equal(typeof guard, 'function');
    assert.equal(guard(), true);
    ctx.state.token += 2;
    assert.equal(guard(), false);
  });
}

for (const outcome of ['success', 'http', 'network']) {
  test(`TLG upload: ${outcome} stale không toast/reload`, async () => {
    const ctx = harness();
    const pending = ctx.window.ClinicalDocumentSectionUiUtils.uploadFileToPatient({}, 1, {
      fetch: () => ctx.response.promise, isCurrentContext: () => ctx.state.token === 1,
      showSuccess: message => ctx.state.toasts.push(message), showError: message => ctx.state.toasts.push(message),
      loadAttachments: () => { ctx.state.loads++; }
    });
    ctx.state.token++;
    if (outcome === 'network') ctx.response.reject(new Error('network'));
    else ctx.response.resolve({ ok: outcome === 'success', json: async () => ({}) });
    assert.equal(await pending, false);
    assert.equal(ctx.state.toasts.length, 0);
    assert.equal(ctx.state.loads, 0);
  });
}
