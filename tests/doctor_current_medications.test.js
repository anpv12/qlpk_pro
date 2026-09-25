'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createEnvironment} = require('./helpers/autocomplete-dom');
const {loadSupportRuntime} = require('./helpers/doctor-registry');
const {createChangeTracker} = loadSupportRuntime();

function setup() {
  const env = createEnvironment(), requests = [];
  const {document: doc, window, Element} = env;
  let loading = false;
  const fixture = env.createField('currentMedicationField');
  const {root, input, list: results, tags: selected, dropdown} = fixture;
  input.id = 'currentMedicationSearch'; results.id = 'currentMedicationResults';
  selected.id = 'currentMedicationSelected'; dropdown.id = 'currentMedicationDropdown';
  const get = id => {
    let element = doc.getElementById(id);
    if (!element) {element = new Element('input'); element.id = id; doc.body.append(element);}
    return element;
  };
  get('currentMedications').type = 'hidden';
  env.load('app/static/js/components/autocomplete-field.js');
  const modules = new Map([
    ['clinicalDetails', {fields: [], create: () => ({getConfig: () => null, load: async () => true})}],
    ['supportRuntime', {createChangeTracker}], ['autocompleteField', window.QLPKAutocompleteField]
  ]);
  window.QLPKDoctorModuleRegistry = {get: key => modules.get(key), require: key => modules.get(key),
    register: (key, value) => modules.set(key, value)};
  env.load('app/static/js/components/clinical-examination-form.js');
  const form = modules.get('clinicalExaminationForm').create({config: {medicationSearchEndpoint: '/dav'},
    getElement: (_doc, id) => id.endsWith('IcdField') ? null : get(id), isLoading: () => loading,
    apiCall: (url, options) => new Promise(resolve => requests.push({url, options, resolve}))});
  form.bind();
  const render = (id, value = '') => form.render({id, patient_info: {id}, examination_info: {current_medications: value}});
  render(1);
  return {form, get, input, results, dropdown, selected, requests, render,
    loading: value => {loading = value;},
    search: query => {input.value = query; input.fire('input'); env.tick();},
    respond: async (index, data, hasMore = false, ok = true) => {
      requests[index].resolve({ok, json: async () => ({success: ok, data, has_more: hasMore})});
      await new Promise(resolve => setImmediate(resolve));
    }
  };
}
const medicine = {id: 10, name: 'Thuốc A, B', strength: '5mg', registration_number: '00123', manufacturer_name: '<img onerror=bad>'};

test('DAV selection preserves comma in medicine name, old text, multiple selection, remove and draft round trip', async () => {
  const h = setup();
  await h.render(1, 'Thuốc cũ; thuốc ngoài danh mục');
  h.search('A');
  assert.equal(h.form.hasUnsavedChanges(), false, 'search alone must not dirty chart');
  await h.respond(0, [medicine]);
  assert.equal(h.results.children[0].children[1].textContent, 'SĐK: 00123 · <img onerror=bad>');
  h.results.children[0].fire('click');
  assert.deepEqual(JSON.parse(h.form.collect().current_medications), ['Thuốc cũ', 'thuốc ngoài danh mục', 'Thuốc A, B · 5mg']);
  assert.equal(h.form.hasUnsavedChanges(), true);
  const snapshot = h.form.getDraftSnapshot();
  assert.equal('currentMedicationSearch' in snapshot.controls, false);
  h.form.clear(); await h.render(2); await h.form.restoreDraftSnapshot(snapshot);
  assert.equal(h.selected.children.length, 3);
  h.selected.children[1].children[1].fire('click');
  assert.deepEqual(JSON.parse(h.form.collect().current_medications), ['Thuốc cũ', 'Thuốc A, B · 5mg']);
});

test('patient clear and A to B to A invalidates late DAV responses and queued queries', async () => {
  const h = setup(); h.search('A');
  h.form.clear(); await h.render(2, '["Thuốc B"]');
  assert.equal(h.requests[0].options.signal.aborted, true);
  await h.respond(0, [medicine]);
  assert.equal(h.dropdown.hidden, true); assert.equal(h.results.children.length, 0);
  assert.equal(h.input.value, '');
  assert.deepEqual(JSON.parse(h.form.collect().current_medications), ['Thuốc B']);
  h.form.clear(); await h.render(1, '["Thuốc A"]');
  assert.deepEqual(JSON.parse(h.form.collect().current_medications), ['Thuốc A']);
});

test('latest query wins, keyboard selection, Escape/Tab/blur prevent reopening', async () => {
  const h = setup(); h.search('old'); h.search('new');
  await h.respond(1, [medicine]); await h.respond(0, [{name: 'Sai'}]);
  assert.equal(h.results.children[0].children[0].textContent, 'Thuốc A, B · 5mg');
  h.input.fire('keydown', {key: 'ArrowDown'}); h.input.fire('keydown', {key: 'Enter'});
  assert.deepEqual(JSON.parse(h.form.collect().current_medications), ['Thuốc A, B · 5mg']);
  for (const key of ['Escape', 'Tab']) {
    h.search('close'); const index = h.requests.length - 1;
    h.input.fire('keydown', {key}); await h.respond(index, [medicine]); assert.equal(h.dropdown.hidden, true);
  }
  h.search('blur'); const index = h.requests.length - 1;
  h.get('currentMedicationField').fire('focusout', {relatedTarget: null});
  await h.respond(index, [medicine]); assert.equal(h.dropdown.hidden, true);
});

test('pagination, failed-page retry, empty results and loading/read-only guards', async () => {
  const h = setup(); h.loading(true); h.search('blocked'); assert.equal(h.requests.length, 0);
  h.loading(false); h.search('ok'); await h.respond(0, [medicine], true);
  h.input.fire('keydown', {key: 'ArrowDown'}); h.input.fire('keydown', {key: 'ArrowDown'});
  assert.match(h.requests[1].url, /page=2/, 'keyboard can reach results after page one');
  await h.respond(1, [], false, false); h.results.querySelector('[data-autocomplete-status]').fire('click'); assert.match(h.requests[2].url, /page=2/);
  await h.respond(2, [{id: 11, name: 'Thuốc 2'}]); assert.equal(h.results.children.length, 2);
  h.input.disabled = true; h.results.children[0].fire('click'); assert.equal(h.form.collect().current_medications, '');
  h.input.disabled = false; h.get('currentMedicationField').setAttribute('data-history-view', 'true'); h.search('history'); assert.equal(h.requests.length, 3);
  h.get('currentMedicationField').removeAttribute('data-history-view'); h.search('empty'); await h.respond(3, []);
  assert.match(h.results.querySelector('[data-autocomplete-status]').textContent, /Không tìm thấy/);
});
