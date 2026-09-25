'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/orders/order-autocomplete-utils.js'),
  'utf8'
);

function createClassList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    toggle(value, force) {
      const shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
    contains: value => values.has(value)
  };
}

function createDropdown() {
  const attributes = {};
  return {
    classList: createClassList(),
    ownerDocument: { getElementById() { return null; } },
    dataset: {},
    innerHTML: '',
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; },
    querySelectorAll() { return []; }
  };
}

function main() {
  const window = {};
  vm.runInNewContext(source, { window, console });
  const utils = window.ClinicalOrderAutocompleteUtils;
  const dropdown = createDropdown();

  const hasMatch = utils.renderAutocompleteDropdown(dropdown, [], {
    emptyText: 'Không có mẫu khảo sát phù hợp'
  });
  assert.equal(hasMatch, false);
  assert.equal(dropdown.classList.contains('is-empty'), true);
  assert.match(dropdown.innerHTML, /Không có mẫu khảo sát phù hợp/);

  utils.renderAutocompleteDropdown(dropdown, [{
    id: 1,
    name: 'HADS',
    surveyTemplateId: 1,
    question_count: 14
  }], { escapeHtml: value => String(value) });
  assert.equal(dropdown.classList.contains('is-empty'), false);
  assert.match(dropdown.innerHTML, /HADS/);

  utils.renderAutocompleteDropdown(dropdown, [], { emptyText: 'Không có kết quả' });
  utils.hideAutocompleteDropdown(dropdown);
  assert.equal(dropdown.classList.contains('is-empty'), false);
  console.log('order autocomplete empty-state pointer contract: ok');
}

main();
