'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadSupportRuntime } = require('./helpers/doctor-registry');
const { runScriptFile } = require('./helpers/module-source');

const SOURCE_FILE = path.join(__dirname, '..', 'app/static/js/components/doctor-indications-form.js');

function createElement(id) {
  return {
    id,
    value: '',
    disabled: false,
    hidden: false,
    textContent: '',
    innerHTML: '',
    options: [],
    selectedOptions: [],
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {}
  };
}

function createHarness() {
  const elements = new Map();
  [
    'doctorIndicationsPanel',
    'doctorIndicationName',
    'doctorIndicationNameDropdown',
    'doctorIndicationLocationFieldset',
    'doctorIndicationPerformerGroup',
    'doctorIndicationPerformer',
    'doctorIndicationOutFacilityGroup',
    'doctorIndicationOutFacility',
    'doctorIndicationDate',
    'doctorIndicationSubmit',
    'doctorIndicationCancelEdit',
    'doctorIndicationsMessage',
    'doctorIndicationsCount',
    'doctorIndicationsList',
    'doctorIndicationLocationIn',
    'doctorIndicationLocationOut'
  ].forEach(id => elements.set(id, createElement(id)));

  const inRadio = elements.get('doctorIndicationLocationIn');
  inRadio.checked = true;
  const document = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) {
      return selector === 'input[name="doctorIndicationLocation"]:checked' ? inRadio : null;
    }
  };
  const runtime = {
    getDocument() { return document; },
    getScopedDocument() { return document; },
    mergeConfig(defaults, config, nestedKeys = []) {
      const source = config || {};
      const nested = nestedKeys.map(key => [key, { ...(defaults[key] || {}), ...(source[key] || {}) }]);
      return { ...defaults, ...source, ...Object.fromEntries(nested) };
    },
    getElement(doc, id) { return doc.getElementById(id); },
    textOf(value) { return value == null ? '' : String(value); },
    normalizeId(value) {
      const next = Number(value);
      return Number.isInteger(next) && next > 0 ? next : null;
    },
    escapeHtml(value) { return String(value); },
    escapeAttr(value) { return String(value); },
    requestJson(url) {
      if (runtime.requestOverride) return runtime.requestOverride(url);
      if (url.startsWith('/api/chi-dinh/appointment/')) return Promise.resolve({ chi_dinh: [] });
      if (url === '/users/doctors') return Promise.resolve([]);
      return Promise.resolve({ data: [] });
    },
    showToast() {},
    isCurrentToken(state, token, appointmentId) {
      return state.contextToken === token && state.appointmentId === appointmentId;
    },
    cloneDraftValue(value) { return value; },
    draftRowsWithoutRuntimeIds(value) { return value; },
    markRestoredRows() {},
    changedRowIndexes() { return []; },
    configure() {},
    getCurrentAppointmentId(state) { return state.appointmentId; },
    createChangeTracker: loadSupportRuntime().createChangeTracker
  };
  const registration = {};
  const orderAutocompleteUtils = {
    setupOrderFormAutocomplete() {
      return { hide() {} };
    }
  };
  const registry = {
    get(name) {
      if (name === 'supportRuntime') return runtime;
      if (name === 'componentDomScope') return { create() { return document; } };
      if (name === 'orderSelectionStateUtils') return window.ClinicalOrderSelectionStateUtils;
      if (name === 'orderStatusUtils') return window.ClinicalOrderStatusUtils;
      if (name === 'orderAutocompleteUtils') return orderAutocompleteUtils;
      if (name === 'confirmationDialog') return { confirm: async () => false };
      return null;
    },
    require(name) {
      const value = this.get(name);
      if (!value) throw new Error(`Thiếu Doctor module: ${name}`);
      return value;
    },
    register(name, value) {
      registration[name] = value;
    }
  };
  const window = { QLPKDoctorModuleRegistry: registry };
  for (const file of ['order-status-utils.js', 'order-selection-state-utils.js']) {
    const utilsPath = path.join(__dirname, '..', 'app/static/js/orders', file);
    vm.runInNewContext(fs.readFileSync(utilsPath, 'utf8'), { window, console });
  }
  runScriptFile(SOURCE_FILE, vm.createContext({ window, document, console }));
  return {
    document,
    runtime,
    instance: registration.indicationsForm.create()
  };
}

async function main() {
  const harness = createHarness();
  const loaded = await harness.instance.load({
    appointmentId: 101,
    patientId: 202,
    appointment: { appointment_date: '2026-09-01T08:30:00+07:00' }
  });

  assert.equal(loaded, true);
  assert.equal(harness.document.getElementById('doctorIndicationDate').value, '2026-09-01');
  console.log('doctor indications date normalization: ok');
  const state = harness.instance.getState();
  harness.runtime.requestOverride = async () => ({chi_dinh:[{id:301, order_name:'Kết quả mới', status:'completed'}]});
  harness.document.getElementById('doctorIndicationName').value = 'Nội dung đang nhập';
  assert.equal(await harness.instance.refreshCurrent(), true);
  assert.equal(state.rows[0].id, 301);
  assert.equal(harness.document.getElementById('doctorIndicationName').value, 'Nội dung đang nhập');
  state.ordersDirty = true;
  assert.equal(await harness.instance.refreshCurrent(), false);
  assert.equal(state.realtimePending, true);
  state.ordersDirty = false; state.editingTempId = state.rows[0].tempId;
  assert.equal(await harness.instance.refreshCurrent(), false);
  state.editingTempId = null;
  let resolve;
  harness.runtime.requestOverride = () => new Promise(done => resolve = done);
  const pending = harness.instance.refreshCurrent();
  harness.instance.clear(); resolve({chi_dinh:[{id:999, order_name:'Ca cũ'}]});
  assert.equal(await pending, false);
  assert.equal(state.rows.length, 0);
  console.log('doctor indications realtime: preserves input/dirty/editing state and rejects stale patient response: ok');

  const form = createHarness();
  await form.instance.load({ appointmentId: 1, patientId: 2, appointment: { appointment_date: '2026-09-01T08:30:00+07:00' } });
  const field = id => form.document.getElementById(id);
  let result = form.instance.readForm(form.document);
  assert.equal(result.valid, false); assert.equal(result.message, 'Nhập tên chỉ định hoặc chọn một mẫu khảo sát.'); assert.equal(result.focus, field('doctorIndicationName'));
  field('doctorIndicationName').value = 'x'.repeat(300);
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, false); assert.match(result.message, /tối đa/);
  field('doctorIndicationName').value = 'Xét nghiệm máu';
  field('doctorIndicationDate').value = '';
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, false); assert.equal(result.message, 'Chọn ngày chỉ định.'); assert.equal(result.focus, field('doctorIndicationDate'));
  field('doctorIndicationDate').value = '2026-09-02';
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, false); assert.equal(result.message, 'Chọn người thực hiện trong cơ sở.'); assert.equal(result.focus, field('doctorIndicationPerformer'));
  const performer = field('doctorIndicationPerformer'); performer.value = '7'; performer.selectedOptions = [{ dataset: { userName: 'BS. An' }, textContent: 'BS. An' }];
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), { survey_template_id: null, order_name: 'Xét nghiệm máu', location_type: 'in', in_house_unit_id: 7, in_house_unit: 'BS. An', out_facility: '', scheduled_for: '2026-09-02', source: 'custom', status: 'sent', is_completed: false });
  form.instance.getState().selectedSurvey = { id: 5, name: 'Xét nghiệm máu' };
  result = form.instance.readForm(form.document);
  assert.equal(result.data.source, 'survey'); assert.equal(result.data.survey_template_id, 5);
  field('doctorIndicationName').value = 'Tên đã sửa';
  result = form.instance.readForm(form.document);
  assert.equal(result.data.source, 'custom');
  assert.equal(result.data.survey_template_id, null);
  field('doctorIndicationLocationIn').value = 'out';
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, false);
  assert.equal(result.focus, field('doctorIndicationOutFacility'));
  field('doctorIndicationOutFacility').value = 'Cơ sở ngoài';
  result = form.instance.readForm(form.document);
  assert.equal(result.valid, true);
  assert.equal(result.data.location_type, 'out');
  assert.equal(result.data.in_house_unit_id, null);
  assert.equal(result.data.in_house_unit, '');
  assert.equal(result.data.out_facility, 'Cơ sở ngoài');
  console.log('doctor indications readForm validation + payload: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
