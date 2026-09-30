const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function setup() {
  const nodes = new Map(), requests = [], saves = [], messages = [];
  function node() {
    return {
      events: {}, props: {}, attrs: {}, children: [], value: '',
      on(event, selector, handler) { this.events[event] = handler || selector; return this; },
      off() { return this; }, addClass() { return this; }, removeClass() { return this; },
      toggleClass() { return this; },
      empty() { this.children = []; return this; },
      append(value) { this.children.push(value); return this; },
      text(value) { this.label = value; return this; },
      attr(key, value) { if (value === undefined) return this.attrs[key]; this.attrs[key] = value; return this; },
      prop(key, value) { if (value === undefined) return this.props[key]; this.props[key] = value; return this; },
      val(value) { if (value === undefined) return this.value; this.value = value; return this; }
    };
  }
  function $(value) {
    if (typeof value === 'function') { value(); return; }
    if (value && value.events) return value;
    if (typeof value === 'string' && value.startsWith('<')) return node();
    if (!nodes.has(value)) nodes.set(value, node());
    return nodes.get(value);
  }
  $.get = (url, success) => {
    const request = {url, success};
    requests.push(request);
    return {fail(handler) { request.fail = handler; }};
  };
  $.ajax = options => saves.push(options);
  const document = {};
  const context = vm.createContext({$, document, window: {
    QLPKHtml: require('./helpers/html-escape').QLPKHtml,
    QLPKUserFeedback: {show: (...args) => messages.push(args)}
  }});
  runScriptFile('app/static/js/permission-management.js', context);
  requests.shift().success([{id: 1, full_name: 'Tên trùng', username: 'one'},
    {id: 2, full_name: 'Tên trùng', username: 'two'}]);
  requests.shift().success([{id: 7, name: 'Nhóm 7', code: 'G7'}, {id: 8, name: 'Nhóm 8', code: 'G8'}]);
  function select(id) {
    const row = node().attr('data-user-id', String(id));
    $('#userTree .user-item').events.click.call(row);
    return requests.shift();
  }
  return {$, requests, saves, select, messages};
}

test('permission selection uses stable IDs and reads assignment arrays before save', () => {
  const h = setup();
  const request = h.select(2);
  assert.equal(request.url, '/user-groups/2');
  assert.equal(h.$('#savePermissionBtn').prop('disabled'), true);
  h.$('#savePermissionBtn').events.click();
  assert.equal(h.saves.length, 0);
  request.success([{group_id: 7}]);
  assert.equal(h.$('#savePermissionBtn').prop('disabled'), false);
  assert.match(h.$('#groupTree').children.join(''), /id="group_7" checked/);
  h.$('#savePermissionBtn').events.click();
  assert.equal(h.saves[0].url, '/user-groups/2');
  assert.deepEqual(JSON.parse(h.saves[0].data), {group_ids: ['7']});
});

test('old permission responses cannot replace a newer user or enable a failed load', () => {
  const h = setup();
  const old = h.select(1), latest = h.select(2);
  old.success([{group_id: 7}]);
  assert.equal(h.$('#savePermissionBtn').prop('disabled'), true);
  latest.fail();
  h.$('#savePermissionBtn').events.click();
  assert.equal(h.saves.length, 0);
  assert.ok(h.messages.some(message => message[0] === 'error'));
  const retry = h.select(2);
  retry.success([{group_id: 8}]);
  old.success([{group_id: 7}]);
  assert.match(h.$('#groupTree').children.join(''), /id="group_8" checked/);
});

test('permission user search filters by username without confusing identical names', () => {
  const h = setup();
  const input = h.$('#userSearchInput').val('two');
  input.events.input.call(input);
  const rows = h.$('#userTree').children.filter(child => typeof child === 'object');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].attr('data-user-id'), 2);
});
