const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush, submit } = require('./helpers/esm-page');

function markup(page) {
  const html = fs.readFileSync(`app/templates/${page}.html`, 'utf8');
  return html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '');
}

async function setup(page) {
  const pages = [];
  const loaded = await loadPage(`${page}.js`, { html: markup(page), before(window) {
    window.QLPKPagination = { createClient: ({ render }) => ({ setItems: rows => { pages.push(rows); render(rows, 0); } }) };
    window.QLPKApiTransport = { hasSession: () => true };
    window.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }), getInstance: () => ({ hide() {} }) } };
  } });
  return { ...loaded, pages, $: selector => loaded.document.querySelector(selector) };
}

test('group search and reset update the paginated dataset using real group fields', async () => {
  const h = await setup('group-management');
  h.requests[0].respond(200, [{ id: 1, code: 'A', name: 'Nhóm A', desc: 'điều dưỡng', permissions: ['dashboard'] },
    { id: 2, code: 'B', name: 'Nhóm B', desc: 'khác', permissions: ['ql-thuoc'] }]);
  await flush();
  h.$('#searchInput').value = 'điều dưỡng';
  submit(h.$('#groupFilterForm'));
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [1]);
  h.$('#resetBtn').click();
  assert.equal(h.pages.at(-1).length, 2);
  assert.equal(h.document.querySelectorAll('#groupTable tbody tr').length, 2);
  assert.match(h.$('#groupTable tbody tr:last-child').textContent, /Kho thuốc\s*Tủ thuốc/);
});

test('group permission tree keeps parent and children in step', async () => {
  const h = await setup('group-management');
  h.requests[0].respond(200, [{ id: 3, code: 'C', name: 'Nhóm C', desc: '', permissions: ['qlkham-bs'] }]);
  await flush();
  h.$('#groupTable .edit-btn').click();
  const parent = h.$('#permTreeEdit #perm_qlkham');
  const children = [...h.document.querySelectorAll('#permTreeEdit #collapse_qlkham .perm-child')];
  assert.equal(parent.checked, false);
  assert.deepEqual(children.map(child => child.checked), [false, true, false, false]);
  parent.checked = true;
  parent.dispatchEvent(new h.window.Event('change'));
  assert.ok(children.every(child => child.checked));
  children[0].checked = false;
  children[0].dispatchEvent(new h.window.Event('change'));
  assert.equal(parent.checked, false);
});

test('account search filters the loaded dataset and ignores stale requests', async () => {
  const h = await setup('user-management');
  const initial = h.requests.find(request => request.url.startsWith('/users/?'));
  h.$('#searchInput').value = '0902';
  submit(h.$('#filterForm'));
  const latest = h.requests.filter(request => request.url.startsWith('/users/?')).at(-1);
  assert.match(latest.url, /search=0902/);
  const rows = [{ id: 1, full_name: 'An', username: 'an', phone: '0901', is_active: true },
    { id: 2, full_name: 'Bình', username: 'binh', phone: '0902', is_active: true }];
  latest.respond(200, rows);
  await flush();
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [2]);
  initial.respond(200, rows);
  await flush();
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [2]);
  assert.equal(h.$('#userTable tbody tr').children[2].textContent, 'binh');
});
