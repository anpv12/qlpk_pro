'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness() {
  const list = { innerHTML: '' };
  const hint = { textContent: 'old' };
  const document = { getElementById: id => id === 'documentsList' ? list : id === 'prevWeight' ? hint : null };
  const window = { document };
  const context = vm.createContext({ window, document, console });
  for (const name of ['receptionist/document-attachment-controls.js', 'components/document-section-ui-utils.js', 'receptionist/patient-vitals-history.js']) {
    runScriptFile(`app/static/js/${name}`, context);
  }
  const requests = [];
  const state = { patientId: 1, token: 1, attachments: [{ id: 'old' }], drafts: [] };
  const options = {
    document, apiCall: () => { const request = deferred(); requests.push(request); return request.promise; },
    getCurrentPatientId: () => state.patientId, getContextToken: () => state.token,
    setAttachments: value => { state.attachments = value; },
    getUploadedDocuments: () => state.drafts, setUploadedDocuments: value => { state.drafts = value; },
    renderDocumentsList: () => { list.innerHTML = JSON.stringify(state.attachments); },
    sessionStorage: { getItem: () => JSON.stringify([{ id: 1, name: 'draft.pdf' }]) }, documentDraftKey: 'draft'
  };
  return { window, state, options, requests, list, hint };
}

for (const owner of ['ReceptionistDocumentAttachmentControls', 'ClinicalDocumentSectionUiUtils']) {
  test(`${owner}: phản hồi A cũ không thay danh sách A mới sau A→B→A`, async () => {
    const ctx = harness();
    const load = () => ctx.window[owner].loadAttachmentsForCurrentPatient(ctx.options);
    const old = load();
    assert.equal(ctx.state.attachments.length, 0);
    ctx.state.token += 2;
    const latest = load();
    ctx.requests[1].resolve({ ok: true, json: async () => [{ id: 'latest' }] });
    await latest;
    ctx.requests[0].resolve({ ok: true, json: async () => [{ id: 'old' }] });
    await old;
    assert.equal(ctx.state.attachments[0].id, 'latest');
  });
  for (const failure of ['http', 'network']) {
    test(`${owner}: lỗi ${failure} cũ không xóa hiển thị mới`, async () => {
      const ctx = harness();
      const load = () => ctx.window[owner].loadAttachmentsForCurrentPatient(ctx.options);
      const old = load();
      const latest = load();
      ctx.requests[1].resolve({ ok: true, json: async () => [{ id: 'latest' }] });
      await latest;
      const html = ctx.list.innerHTML;
      if (failure === 'http') ctx.requests[0].resolve({ ok: false });
      else ctx.requests[0].reject(new Error('old failure'));
      await old;
      assert.equal(ctx.list.innerHTML, html);
    });
  }
  test(`${owner}: refresh chưa có patient không mất File trong nháp`, async () => {
    const ctx = harness();
    ctx.state.patientId = null;
    const file = {};
    ctx.state.drafts = [{ id: 1, file }];
    await ctx.window[owner].loadAttachmentsForCurrentPatient(ctx.options);
    assert.equal(ctx.state.drafts[0].file, file);
  });
}

test('Sinh hiệu chỉ nhận request mới nhất; reset vô hiệu hóa request đang chờ', async () => {
  const ctx = harness();
  const api = ctx.window.ReceptionistPatientVitalsHistory;
  const old = api.loadPreviousVitals(1, ctx.options);
  const latest = api.loadPreviousVitals(1, ctx.options);
  ctx.requests[1].resolve({ ok: true, json: async () => ({ examinations: [{ weight: 60 }] }) });
  await latest;
  ctx.requests[0].resolve({ ok: true, json: async () => ({ examinations: [{ weight: 20 }] }) });
  await old;
  assert.match(ctx.hint.textContent, /60/);
  const pending = api.loadPreviousVitals(1, ctx.options);
  api.resetVitalsHints(ctx.options);
  ctx.requests[2].resolve({ ok: true, json: async () => ({ examinations: [{ weight: 30 }] }) });
  await pending;
  assert.equal(ctx.hint.textContent, '');
});
