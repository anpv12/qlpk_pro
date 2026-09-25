'use strict';
const assert = require('node:assert/strict');
const {createEnvironment} = require('./helpers/autocomplete-dom');
async function main() {
  const env = createEnvironment(), {window} = env, calls = [];
  window.fetch = async (url, options) => {
    calls.push({url, options});
    return {ok: true, json: async () => ({
      data: [{id: 1, icd_code: 'A00', disease_name: 'Bệnh tả'}],
      pagination: {current_page: 2, per_page: 100, total_count: 201, total_pages: 3, has_next: true, has_prev: true}
    })};
  };
  env.load('app/static/js/components/icd-data-loader.js');
  const loader = window.ClinicalIcdDataLoader;
  assert.equal(loader.buildIcdUrl('bệnh', {skip: 100, limit: 50}), '/api/icd/?skip=100&limit=50&search=b%E1%BB%87nh');
  const controller = new AbortController();
  const page = await loader.loadICDPage('bệnh', {skip: 100, limit: 50, signal: controller.signal, getAuthHeader: () => 'Bearer test'});
  assert.equal(page.data.length, 1);
  assert.equal(page.pagination.has_next, true);
  assert.equal(calls[0].options.signal, controller.signal);
  const array = await loader.loadICDData('bệnh', {getAuthHeader: () => 'Bearer test'});
  assert.ok(Array.isArray(array));
  assert.equal(array.pagination.total_count, 201);
  const skips = [];
  loader.loadICDPage = async (_query, options) => {
    skips.push(options.skip);
    return {data: options.skip === 0 ? [
      {id: 1, icd_code: 'A00', disease_name: 'Bệnh tả'},
      {id: 2, icd_code: 'A01', disease_name: 'Thương hàn'}
    ] : [{id: 3, icd_code: 'I25.5', disease_name: 'Bệnh cơ tim'}],
    pagination: {per_page: 2, has_next: options.skip === 0}};
  };
  env.load('app/static/js/components/autocomplete-field.js');
  env.load('app/static/js/components/icd-autocomplete.js');
  const fixture = env.createField();
  const field = new window.QLPKIcdAutocomplete(fixture.root);
  await field.refresh('bệnh');
  assert.deepEqual(skips, [0]);
  assert.equal(field.getOptionElements().length, 2);
  fixture.list.scrollTop = 240;
  await fixture.list.fire('scroll');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(skips, [0, 2]);
  assert.equal(field.getOptionElements().length, 3);
  assert.equal(field.getOptionElements()[2].children[0].textContent, 'I25.5 - Bệnh cơ tim');
  field.select(field.currentItems[2]);
  assert.equal(field.getSelected()[0].id, 3);
  assert.equal(fixture.dropdown.hidden, true);
  assert.equal(fixture.input.value, '');
  console.log('ICD pagination loader/shared autocomplete: ok');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
