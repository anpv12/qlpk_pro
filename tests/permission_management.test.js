const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, flush, Event } = require('./helpers/esm-page');
const { renderedTemplate } = require('./helpers/template-source');

const template = renderedTemplate('permission-management.html');
const MAIN = template.slice(template.indexOf('<main'), template.indexOf('</main>') + 7);

async function setup() {
  const messages = [];
  const page = await loadPage('permission-management.js', { html: MAIN, before(window) {
    window.QLPKUserFeedback = { show: (...args) => messages.push(args) };
  } });
  const $ = selector => page.document.querySelector(selector);
  const next = () => page.requests.shift();
  next().respond(200, [{ id: 1, full_name: 'Tên trùng', username: 'one' }, { id: 2, full_name: 'Tên trùng', username: 'two' }]);
  await flush();
  next().respond(200, [{ id: 7, name: 'Nhóm 7', code: 'G7' }, { id: 8, name: 'Nhóm 8', code: 'G8' }]);
  await flush();
  const select = id => {
    $(`#userTree .user-item[data-user-id="${id}"]`).click();
    return next();
  };
  const save = async () => { $('#savePermissionBtn').click(); await flush(); };
  return { ...page, $, select, save, messages, saves: () => page.requests.filter(r => r.init.method === 'POST') };
}

test('permission selection uses stable IDs and reads assignment arrays before save', async () => {
  const h = await setup();
  const request = h.select(2);
  assert.equal(request.url, '/user-groups/2');
  assert.equal(h.$('#savePermissionBtn').disabled, true);
  await h.save();
  assert.equal(h.saves().length, 0);
  request.respond(200, [{ group_id: 7 }]);
  await flush();
  assert.equal(h.$('#savePermissionBtn').disabled, false);
  assert.equal(h.$('#group_7').checked, true);
  assert.equal(h.$('#group_8').checked, false);
  await h.save();
  assert.equal(h.saves()[0].url, '/user-groups/2');
  assert.deepEqual(h.saves()[0].body, { group_ids: ['7'] });
});

test('ticking and unticking groups edits the saved assignment', async () => {
  const h = await setup();
  const request = h.select(1);
  request.respond(200, [{ group_id: 7 }]);
  await flush();
  h.$('#group_8').checked = true;
  h.$('#group_8').dispatchEvent(new Event('change'));
  h.$('#group_7').checked = false;
  h.$('#group_7').dispatchEvent(new Event('change'));
  await h.save();
  assert.deepEqual(h.saves()[0].body, { group_ids: ['8'] });
  h.saves()[0].respond(200, {});
  await flush();
  assert.deepEqual(h.messages.at(-1), ['success', 'Lưu phân quyền thành công!']);
});

test('old permission responses cannot replace a newer user or enable a failed load', async () => {
  const h = await setup();
  const old = h.select(1);
  const latest = h.select(2);
  old.respond(200, [{ group_id: 7 }]);
  await flush();
  assert.equal(h.$('#savePermissionBtn').disabled, true);
  latest.respond(500, {});
  await flush();
  await h.save();
  assert.equal(h.saves().length, 0);
  assert.ok(h.messages.some(message => message[0] === 'error'));
  const retry = h.select(2);
  retry.respond(200, [{ group_id: 8 }]);
  await flush();
  assert.equal(h.$('#group_8').checked, true);
  assert.equal(h.$('#group_7').checked, false);
});

test('permission user search filters by username without confusing identical names', async () => {
  const h = await setup();
  h.$('#userSearchInput').value = 'two';
  h.$('#userSearchInput').dispatchEvent(new Event('input'));
  const rows = [...h.document.querySelectorAll('#userTree .user-item')];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].getAttribute('data-user-id'), '2');
});

test('user and group names render as text, never markup', async () => {
  const h = await setup();
  h.window.QLPKRealtimePageHooks = undefined;
  h.$('#groupSearchInput').value = 'G7';
  h.$('#groupSearchInput').dispatchEvent(new Event('input'));
  assert.equal(h.document.querySelectorAll('#groupTree .group-checkbox').length, 1);
  assert.equal(h.$('#groupTree label').textContent, 'Nhóm 7 (G7)');
});
