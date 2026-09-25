'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/components/doctor-indications-form.js'),
  'utf8'
);

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
    getCurrentAppointmentId(state) { return state.appointmentId; }
  };
  const registration = {};
  const registry = {
    get(name) {
      if (name === 'supportRuntime') return runtime;
      if (name === 'componentDomScope') return { create() { return document; } };
      if (name === 'orderSelectionStateUtils') return {};
      if (name === 'orderStatusUtils') return {};
      if (name === 'confirmationDialog') return { confirm: async () => false };
      return null;
    },
    register(name, value) {
      registration[name] = value;
    }
  };
  const window = {
    QLPKDoctorModuleRegistry: registry,
    ClinicalOrderAutocompleteUtils: {
      setupOrderFormAutocomplete() {
        return { hide() {} };
      }
    }
  };
  vm.runInNewContext(source, { window, document, console });
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
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
