'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createEnvironment} = require('./helpers/autocomplete-dom');
const sample = {id: 1, name: 'Tên dài, có dấu phẩy'};
function setup(options = {}) {
  const env = createEnvironment();
  env.load('app/static/js/components/autocomplete-field.js');
  const fixture = env.createField();
  const field = new env.window.QLPKAutocompleteField(fixture.root, {
    loadOptions: async () => ({data: [sample]}), ...options
  });
  return {...env, ...fixture, field};
}
test('popup uses viewport coordinates, flips above, closes when control leaves scroll panel', async () => {
  const h = setup();
  await h.field.open();
  assert.equal(h.dropdown.popoverOpen, true);
  assert.equal(h.dropdown.dataset.placement, 'bottom');
  assert.equal(h.dropdown.styles['--autocomplete-top'], '244px');
  assert.equal(h.dropdown.styles['--autocomplete-width'], '300px');
  h.control.rect = {...h.control.rect, top: 700, bottom: 740};
  h.field.position();
  assert.equal(h.dropdown.dataset.placement, 'top');
  assert.equal(h.dropdown.styles['--autocomplete-top'], '696px');
  h.root.overflowY = 'auto'; h.root.rect = {...h.root.rect, top: 100, bottom: 500};
  await h.document.fire('scroll', {target: h.root});
  assert.equal(h.field.isOpen, false);
  assert.equal(h.dropdown.popoverOpen, false);
});
test('opening sibling closes first; destroy and invisible controls cannot fetch', async () => {
  let count = 0;
  const h = setup({loadOptions: async () => {count++; return {data: [sample]};}});
  await h.field.open();
  const sibling = h.createField('second');
  const field2 = new h.window.QLPKAutocompleteField(sibling.root);
  await field2.open();
  assert.equal(h.field.isOpen, false);
  h.control.hidden = true;
  await h.field.open(); assert.equal(count, 1);
  h.control.hidden = false; h.field.destroy();
  await h.input.fire('focus'); await h.input.fire('input'); h.tick();
  assert.equal(count, 1);
});
test('selection is distinct from keyboard focus, duplicates are ignored, clear emits once', async () => {
  const changes = [];
  const h = setup({onChange: (_items, meta) => changes.push(meta.action)});
  h.field.setSelected([sample, sample]);
  assert.equal(h.field.getSelected().length, 1);
  await h.field.open();
  assert.equal(h.field.getOptionElements()[0].getAttribute('aria-selected'), 'true');
  await h.input.fire('keydown', {key: 'ArrowDown'});
  assert.equal(h.input.getAttribute('aria-activedescendant'), h.list.id + '-option-0');
  await h.input.fire('keydown', {key: 'Enter'});
  assert.equal(h.field.getSelected().length, 1);
  assert.equal(changes.length, 0);
  h.field.clear({silent: false}); h.field.clear({silent: false});
  assert.deepEqual(changes, ['clear']);
});
test('single selection displays label, hydration keeps one item, clear removes value', async () => {
  const h = setup({multiple: false});
  h.field.select(sample);
  assert.equal(h.input.value, sample.name);
  assert.equal(h.tags.children.length, 0);
  h.field.setSelected([sample, {id: 2, name: 'Khác'}]);
  assert.equal(h.field.getSelected().length, 1);
  h.field.clear();
  assert.equal(h.input.value, '');
});

test('IME composition preserves text and cannot select or query until committed', async () => {
  let requests = 0;
  const h = setup({loadOptions: async () => {requests += 1; return {data: [sample]};}});
  await h.field.open();
  await h.input.fire('keydown', {key: 'ArrowDown'});
  await h.input.fire('keydown', {key: 'Enter', isComposing: true});
  assert.equal(h.field.getSelected().length, 0);
  h.input.value = 'thuố';
  await h.input.fire('input', {isComposing: true}); h.tick();
  assert.equal(h.input.value, 'thuố');
  assert.equal(requests, 1);
  h.input.value = 'thuốc';
  await h.input.fire('compositionend'); h.tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 2);
  assert.equal(h.field.currentQuery, 'thuốc');
});
