'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');

const { runScriptFile } = require('./helpers/module-source');
const { createWindow } = require('./helpers/fake-dom');

function main() {
  const { document } = createWindow({ html: '<div id="dropdown"></div>' });
  const window = { document };
  runScriptFile(path.join(__dirname, '..', 'app/static/js/orders/order-autocomplete-utils.js'), vm.createContext({ window, document, console }));
  const utils = window.ClinicalOrderAutocompleteUtils;
  const dropdown = document.getElementById('dropdown');

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
  }]);
  assert.equal(dropdown.classList.contains('is-empty'), false);
  assert.match(dropdown.innerHTML, /HADS/);

  utils.renderAutocompleteDropdown(dropdown, [], { emptyText: 'Không có kết quả' });
  utils.hideAutocompleteDropdown(dropdown);
  assert.equal(dropdown.classList.contains('is-empty'), false);
  console.log('order autocomplete empty-state pointer contract: ok');
}

main();
