const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(page) {
  const html = fs.readFileSync('app/templates/' + page + '.html', 'utf8');
  const nodes = new Map(), requests = [], pages = [];
  function $(selector) {
    if (typeof selector === 'function') return selector();
    if (!nodes.has(selector)) nodes.set(selector, {
      events: {}, value: '',
      ready(callback) { callback(); },
      on(event, delegated, handler) {
        if (['#filterForm', '#groupFilterForm', '#resetBtn'].includes(selector)) {
          assert.ok(html.includes('id="' + selector.slice(1) + '"'), 'Missing event target: ' + selector);
        }
        this.events[event] = handler || delegated; return this;
      },
      off() { return this; },
      val(value) { if (value === undefined) return this.value; this.value = value; return this; }
    });
    return nodes.get(selector);
  }
  $.get = (url, params, callback) => requests.push({url, params, resolve: callback || params});
  $.ajax = () => {};
  const context = vm.createContext({$, document: {}, localStorage: {getItem: () => 'session'},
    window: {QLPKPagination: {createClient: () => ({setItems: rows => pages.push(rows)})}}
  });
  vm.runInContext(fs.readFileSync('app/static/js/' + page + '.js', 'utf8'), context);
  return {$, requests, pages};
}

test('group search and reset update the paginated dataset using real group fields', () => {
  const h = setup('group-management');
  h.requests[0].resolve([{id: 1, code: 'A', name: 'Nhóm A', desc: 'điều dưỡng'},
    {id: 2, code: 'B', name: 'Nhóm B', desc: 'khác'}]);
  h.$('#searchInput').val('điều dưỡng');
  h.$('#groupFilterForm').events.submit({preventDefault() {}});
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [1]);
  h.$('#resetBtn').events.click();
  assert.equal(h.pages.at(-1).length, 2);
});

test('account search filters the loaded dataset and ignores stale requests', () => {
  const h = setup('user-management');
  h.$('#searchInput').val('0902');
  h.$('#filterForm').events.submit({preventDefault() {}});
  const rows = [{id: 1, full_name: 'An', username: 'an', phone: '0901', is_active: true},
    {id: 2, full_name: 'Bình', username: 'binh', phone: '0902', is_active: true}];
  h.requests[1].resolve(rows);
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [2]);
  h.requests[0].resolve(rows);
  assert.deepEqual(Array.from(h.pages.at(-1), row => row.id), [2]);
});
