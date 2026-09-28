'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app/static/js/components/document-section-ui-utils.js'), 'utf8');

function createHarness(items, uploadFile) {
  const window = {};
  vm.runInNewContext(source, { window, console });
  let documents = items;
  const cache = new Map([['draft', JSON.stringify(items.map(({ file, ...metadata }) => metadata))]]);
  let refreshes = 0;
  const options = {
    getUploadedDocuments: () => documents,
    setUploadedDocuments: value => { documents = value; },
    sessionStorage: { setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) },
    documentDraftKey: 'draft',
    uploadFile,
    loadAttachments: async () => { refreshes += 1; }
  };
  return {
    options, cache,
    getDocuments: () => documents,
    setDocuments: value => { documents = value; },
    getRefreshes: () => refreshes,
    upload: () => window.ClinicalDocumentSectionUiUtils.uploadDraftDocumentsForPatient(7, options)
  };
}

function item(id) { return { id, name: `${id}.txt`, size: 2, type: 'text/plain', file: { name: `${id}.txt` } }; }

test('Không có draft thì không gọi upload', async () => {
  const harness = createHarness([], () => { throw new Error('unexpected'); });
  assert.equal(await harness.upload(), false);
});

test('Upload false giữ tệp và cache, không báo thành công', async () => {
  const document = item(1);
  const harness = createHarness([document], async () => false);
  await assert.rejects(harness.upload());
  assert.deepEqual(harness.getDocuments(), [document]);
  assert.equal(JSON.parse(harness.cache.get('draft'))[0].id, 1);
});

test('Thành công một phần chỉ giữ tệp lỗi, retry không upload trùng tệp đã thành công', async () => {
  const first = item(1), second = item(2);
  const calls = [];
  let fail = true;
  const harness = createHarness([first, second], async file => {
    calls.push(file.name);
    return !(file === second.file && fail);
  });
  await assert.rejects(harness.upload());
  assert.deepEqual(Array.from(harness.getDocuments()), [second]);
  assert.deepEqual(JSON.parse(harness.cache.get('draft')).map(row => row.id), [2]);
  fail = false;
  assert.equal(await harness.upload(), true);
  assert.deepEqual(calls, ['1.txt', '2.txt', '2.txt']);
  assert.equal(harness.getDocuments().length, 0);
  assert.equal(harness.cache.has('draft'), false);
});

test('Draft chỉ có metadata hoặc thiếu uploader không được xóa', async () => {
  for (const [document, uploader] of [[{ id: 1, name: 'missing-file.txt' }, async () => true], [item(1), undefined]]) {
    const harness = createHarness([document], uploader);
    await assert.rejects(harness.upload());
    assert.equal(harness.getDocuments()[0], document);
  }
});

test('Lỗi mạng giữ draft để thử lại', async () => {
  const document = item(1);
  const harness = createHarness([document], async () => { throw new Error('network'); });
  await assert.rejects(harness.upload(), /network/);
  assert.equal(harness.getDocuments()[0], document);
});

test('File thêm trong lúc upload không bị xóa theo snapshot cũ', async () => {
  const first = item(1), added = item(2);
  const harness = createHarness([first], async file => {
    if (file === first.file) harness.getDocuments().push(added);
    return true;
  });
  await assert.rejects(harness.upload());
  assert.deepEqual(Array.from(harness.getDocuments()), [added]);
});

test('Đổi context khi upload pending không xóa draft của ca mới', async () => {
  let finish;
  let current = true;
  const first = item(1), next = item(2);
  const harness = createHarness([first], () => new Promise(resolve => { finish = resolve; }));
  harness.options.isCurrentContext = () => current;
  const pending = harness.upload();
  current = false;
  harness.setDocuments([next]);
  finish(true);
  await assert.rejects(pending);
  assert.equal(harness.getDocuments()[0], next);
  assert.equal(harness.getRefreshes(), 0);
});
