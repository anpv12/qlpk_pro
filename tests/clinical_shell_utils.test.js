'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FORM_DOM_UTILS = path.join(ROOT, 'app/static/js/components/form-dom-utils.js');
const PAGE_CORE_UTILS = path.join(ROOT, 'app/static/js/components/page-core-utils.js');
const PSYCHOLOGIST_PAGE = path.join(ROOT, 'app/static/js/psychologist-examination.js');

function createPageAutoSaveHarness() {
  const win = loadScript(PAGE_CORE_UTILS);
  const context = vm.createContext({
    currentAppointmentId: 7,
    currentPatientId: 70,
    isLoadingExaminationData: false,
    psychologistWorkspaceRuntime: { getState: () => context.workspaceState },
    workspaceState: { contextToken: 1 },
    writes: [],
    indicators: [],
    pendingResponse: null,
    pageCoreAdapter: {
      autoSavePatientFormField(field, value, options) {
        return win.ClinicalPageCoreUtils.autoSavePatientFormFieldShell(field, value, {
          ensureCurrentAppointmentIdForAutoSave: async () => true,
          getCurrentAppointmentId: () => context.currentAppointmentId,
          showAutoSaveIndicator: type => context.indicators.push(type),
          apiCall: async (url, request) => {
            context.writes.push({ url, body: JSON.parse(request.body) });
            return context.pendingResponse || { ok: true };
          },
          ...options
        });
      }
    }
  });
  const pageSource = fs.readFileSync(PSYCHOLOGIST_PAGE, 'utf8');
  const wrapper = pageSource.match(/async function autoSavePatientField\([\s\S]*?\n\}/);
  assert.ok(wrapper, 'page auto-save wrapper phải tồn tại');
  vm.runInContext(wrapper[0], context);
  return context;
}

test('page TLG không gửi giá trị ca cũ sau khi đổi ca trong lúc auto-save chờ', async () => {
  const context = createPageAutoSaveHarness();
  const pending = context.autoSavePatientField('notes', 'old value');
  context.currentAppointmentId = 8;
  context.currentPatientId = 80;
  context.workspaceState.contextToken += 1;
  const result = await pending;
  assert.equal(result.status, 'skipped');
  assert.deepEqual(context.writes, []);
});

test('page TLG không auto-save khi chưa chọn ca hoặc đang loading', async () => {
  const context = createPageAutoSaveHarness();
  context.currentAppointmentId = null;
  assert.equal((await context.autoSavePatientField('notes', 'draft')).status, 'skipped');
  context.currentAppointmentId = 7;
  context.isLoadingExaminationData = true;
  assert.equal((await context.autoSavePatientField('notes', 'loaded')).status, 'skipped');
  assert.deepEqual(context.writes, []);
});

test('page TLG bỏ response cũ kể cả đổi A → B → A', async () => {
  const context = createPageAutoSaveHarness();
  let finishResponse;
  context.pendingResponse = new Promise(resolve => { finishResponse = resolve; });
  const pending = context.autoSavePatientField('notes', 'old value');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.writes.length, 1);
  context.workspaceState.contextToken += 2;
  finishResponse({ ok: true });
  assert.equal((await pending).status, 'stale');
  assert.deepEqual(context.indicators, ['saving']);
});

test('page TLG giữ URL và payload khi lưu đúng ca', async () => {
  const context = createPageAutoSaveHarness();
  assert.equal((await context.autoSavePatientField('notes', 'valid')).status, 'saved');
  assert.deepEqual(context.writes, [{ url: '/api/appointments/7', body: { notes: 'valid' } }]);
  assert.deepEqual(context.indicators, ['saving', 'success']);
});

test('page TLG không auto-save khi tải hồ sơ lỗi', async () => {
  const context = createPageAutoSaveHarness();
  context.workspaceState.loadFailed = true;
  assert.equal((await context.autoSavePatientField('notes', 'incomplete')).status, 'skipped');
  assert.deepEqual(context.writes, []);
});

test('page TLG không báo lỗi lưu ca cũ trên ca mới', async () => {
  const context = createPageAutoSaveHarness();
  let rejectResponse;
  context.pendingResponse = new Promise((_resolve, reject) => { rejectResponse = reject; });
  const pending = context.autoSavePatientField('notes', 'old value');
  await new Promise(resolve => setImmediate(resolve));
  context.currentAppointmentId = 8;
  context.workspaceState.contextToken += 1;
  rejectResponse(new Error('network failed'));
  assert.equal((await pending).status, 'stale');
  assert.deepEqual(context.indicators, ['saving']);
});

function loadScript(file) {
  const win = { console, setTimeout: () => null, localStorage: null };
  win.window = win;
  const context = vm.createContext(win);
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
  return win;
}

function createElement(id) {
  return { id, value: '', textContent: '', innerHTML: '', disabled: false, checked: false, classList: { add() {}, remove() {} } };
}

function createDocument(ids) {
  const elements = new Map(ids.map(id => [id, createElement(id)]));
  return {
    elements,
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

for (const failure of ['http', 'network', 'missing']) {
  test(`Lưu hành chính không báo saved khi lịch hẹn lỗi ${failure}`, async () => {
    const win = loadScript(PAGE_CORE_UTILS);
    const callbacks = [];
    const toasts = [];
    const result = await win.ClinicalPageCoreUtils.runPatientDataInternalSave({
      currentPatientId: 70,
      currentAppointmentId: failure === 'missing' ? null : 7,
      console: { error() {}, warn() {} },
      apiCall: async url => {
        if (url === '/api/patients/70') return { ok: true, json: async () => ({ id: 70 }) };
        if (failure === 'network') throw new Error('network unavailable');
        if (failure === 'missing') return { ok: true, json: async () => ({ appointments: [] }) };
        return { ok: false, status: 500, text: async () => 'failed' };
      },
      setCurrentPatientId: id => callbacks.push(id),
      afterPatientSaved: () => callbacks.push('after'),
      showToast: (type, message) => toasts.push({ type, message })
    });
    assert.equal(result.status, 'appointmentError');
    assert.equal(result.patient.id, 70);
    assert.notEqual(result.appointmentSaveResult.status, 'saved');
    assert.deepEqual(callbacks, []);
    assert.equal(toasts[0]?.type, 'error');
  });
}

test('Lưu hành chính không ghi lịch hẹn hoặc callback sau khi đổi context', async () => {
  const win = loadScript(PAGE_CORE_UTILS);
  let current = true;
  let finishPatient;
  const response = new Promise(resolve => { finishPatient = resolve; });
  const calls = [];
  const callbacks = [];
  const saving = win.ClinicalPageCoreUtils.runPatientDataInternalSave({
    currentPatientId: 70,
    currentAppointmentId: 7,
    isCurrentContext: () => current,
    apiCall: url => { calls.push(url); return response; },
    setCurrentPatientId: id => callbacks.push(id),
    afterPatientSaved: () => callbacks.push('after')
  });
  current = false;
  finishPatient({ ok: true, json: async () => ({ id: 70 }) });
  assert.equal((await saving).status, 'stale');
  assert.deepEqual(calls, ['/api/patients/70']);
  assert.deepEqual(callbacks, []);
});

test('Lưu hành chính thành công gọi đủ callbacks sau cả hai request', async () => {
  const win = loadScript(PAGE_CORE_UTILS);
  const calls = [];
  const result = await win.ClinicalPageCoreUtils.runPatientDataInternalSave({
    currentPatientId: 70,
    currentAppointmentId: 7,
    apiCall: async url => { calls.push(url); return { ok: true, json: async () => ({ id: 70 }) }; },
    setCurrentPatientId: id => calls.push(id),
    afterPatientSaved: () => calls.push('after')
  });
  assert.equal(result.status, 'saved');
  assert.deepEqual(calls, ['/api/patients/70', '/api/appointments/7', 70, 'after']);
});

test('Upload draft lỗi phải dừng trước lưu lịch hẹn và báo lỗi', async () => {
  const win = loadScript(PAGE_CORE_UTILS);
  const calls = [];
  const toasts = [];
  const result = await win.ClinicalPageCoreUtils.runPatientDataInternalSave({
    currentPatientId: 70,
    currentAppointmentId: 7,
    console: { error() {} },
    apiCall: async url => { calls.push(url); return { ok: true, json: async () => ({ id: 70 }) }; },
    uploadDraftDocumentsForPatient: async () => { throw new Error('upload failed'); },
    showToast: (type, message) => toasts.push({ type, message })
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(calls, ['/api/patients/70']);
  assert.equal(toasts[0]?.type, 'error');
});

test('ClinicalFormDomUtils và ClinicalPageCoreUtils vẫn expose mọi API trang TLG đang gọi', () => {
  const pageSource = fs.readFileSync(PSYCHOLOGIST_PAGE, 'utf8');
  const formApi = loadScript(FORM_DOM_UTILS).ClinicalFormDomUtils;
  const coreApi = loadScript(PAGE_CORE_UTILS).ClinicalPageCoreUtils;
  const adapter = coreApi.createPageCoreAdapter({ document: createDocument([]), window: {} });

  const collect = pattern => Array.from(new Set(Array.from(pageSource.matchAll(pattern), match => match[1])));
  const formNames = collect(/ClinicalFormDomUtils\.(\w+)/g);
  const coreNames = collect(/ClinicalPageCoreUtils\.(\w+)/g);
  const adapterNames = collect(/pageCoreAdapter\.(\w+)/g);

  assert.ok(formNames.length >= 5, 'trang TLG phải dùng ClinicalFormDomUtils');
  assert.ok(adapterNames.length >= 5, 'trang TLG phải dùng pageCoreAdapter');
  formNames.forEach(name => assert.equal(typeof formApi[name], 'function', `ClinicalFormDomUtils.${name}`));
  coreNames.forEach(name => assert.equal(typeof coreApi[name], 'function', `ClinicalPageCoreUtils.${name}`));
  adapterNames.forEach(name => assert.equal(typeof adapter[name], 'function', `pageCoreAdapter.${name}`));
});

test('initializeWorkflowPageShell giữ thứ tự reset → sidebar → loaders → adapters → tác vụ hoãn', () => {
  const win = loadScript(FORM_DOM_UTILS);
  const doc = createDocument(['age', 'occupation', 'occupationDropdown']);
  doc.elements.get('age').value = '33';
  const log = [];
  const timers = [];
  function OccupationAutocomplete(inputId, dropdownId) { log.push(`occupation:${inputId}/${dropdownId}`); }
  const jquery = selector => ({
    off() { return this; },
    on(events) { log.push(`bind:${selector}:${events}`); return this; },
    val() { return ''; }
  });

  const result = win.ClinicalFormDomUtils.initializeWorkflowPageShell({
    document: doc,
    $: jquery,
    window: win,
    setTimeout: (fn, delay) => timers.push([fn, delay]),
    resetFormToDefault: () => log.push('resetFormToDefault'),
    loadAddressDraftFromCache: () => log.push('loadAddressDraftFromCache'),
    loadProvinces: () => log.push('loadProvinces'),
    loadAppointments: (status, page) => log.push(`loadAppointments:${status}:${page}`),
    currentStatus: 'waiting',
    currentPage: 2,
    sidebarUserInfoUi: { loadSidebarUserInfo: options => log.push(`sidebar:${options.document === doc}`) },
    occupationOptions: { OccupationAutocomplete },
    documentSectionAdapter: { initializeDocumentUpload: () => log.push('initializeDocumentUpload') },
    addressDraftAdapter: { bindAddressDraftListeners: options => log.push(`addressDraft:${typeof options.onChange}`) },
    saveAddressDraftToCache: () => {},
    getElementValue: () => '',
    autoSaveField: () => {}
  });

  assert.equal(result, true);
  assert.deepEqual(log.slice(0, 7), [
    'resetFormToDefault',
    'sidebar:true',
    'loadProvinces',
    'loadAppointments:waiting:2',
    'occupation:occupation/occupationDropdown',
    'bind:#occupation:blur.patientAutoSave change.patientAutoSave',
    'initializeDocumentUpload'
  ]);
  assert.equal(log[7], 'addressDraft:function');
  assert.ok(log.includes('bind:#fullName:blur.patientAutoSave'), 'auto-save form bệnh nhân phải được bind');
  assert.deepEqual(timers.map(timer => timer[1]), [100, 100]);

  timers.forEach(([fn]) => fn());
  assert.equal(log.at(-1), 'loadAddressDraftFromCache');
  assert.equal(doc.elements.get('age').value, '');
  assert.equal(typeof win.occupationAutocomplete, 'object');
});

test('initializeWorkflowPageShell không lỗi khi thiếu setTimeout/jQuery/adapter tùy chọn', () => {
  const win = loadScript(FORM_DOM_UTILS);
  delete win.setTimeout;
  const doc = createDocument(['age']);
  const result = win.ClinicalFormDomUtils.initializeWorkflowPageShell({
    document: doc,
    setTimeout: null,
    loadProvinces: () => {}
  });
  assert.equal(result, true);
});

async function createBootstrapHarness(overrides = {}) {
  const win = loadScript(PAGE_CORE_UTILS);
  const doc = createDocument([]);
  const log = [];
  const relativeTable = { name: 'relative' };
  const adapter = {
    ensureSession: async () => { log.push('ensureSession'); return overrides.token !== false; },
    addButtonAnimationCSS: () => log.push('addButtonAnimationCSS'),
    bindPaginationControls: options => log.push(`bindPaginationControls:${Object.keys(options).sort().join(',')}`),
    bindRefreshButtons: options => log.push(`bindRefreshButtons:${Object.keys(options).sort().join(',')}`)
  };
  const actionButtonsUi = {
    initRelativeTable: options => { log.push(`initRelativeTable:${options.document === doc}:${options.extra}`); return relativeTable; },
    bindTabPrintButtons: options => log.push(`bindTabPrintButtons:${options.printModalTabContent}`),
    bindPersonalDetailEditButtons: options => log.push(`bindPersonalDetailEditButtons:${JSON.stringify(options)}`),
    bindSaveInfoButton: (id, options) => log.push(`bindSaveInfoButton:${id}:${typeof options.save}`),
    bindReExaminationSourceReset: (id, options) => log.push(`bindReExaminationSourceReset:${id}:${options.originalAppointmentInput}`)
  };
  const waitingListUi = {
    bindStatusTabs: options => log.push(`bindStatusTabs:${typeof options.setCurrentStatus}`),
    bindPatientSearchInput: options => log.push(`bindPatientSearchInput:${typeof options.renderAppointmentsTable}`)
  };
  const result = await win.ClinicalPageCoreUtils.initializeExaminationPageBootstrap({
    document: doc,
    window: win,
    pageCoreAdapter: adapter,
    actionButtonsUi,
    waitingListUi,
    formDomUtils: { bindAgeInputGuard: id => log.push(`bindAgeInputGuard:${id}`) },
    initializePage: () => log.push('initializePage'),
    initializeForm: () => log.push('initializeForm'),
    relativeTableOptions: { extra: 'x' },
    printModalTabContent: 'print',
    setRelativeTableInstance: instance => log.push(`setRelativeTableInstance:${instance === relativeTable}`),
    setCurrentStatus: () => {},
    loadAppointments: () => {},
    setPatientSearchQuery: () => {},
    renderAppointmentsTable: () => {},
    getCurrentStatus: () => 'waiting',
    getCurrentPage: () => 1,
    setPerPage: () => {},
    personalDetailOptions: { bindings: {} },
    medicalHistoryModalAdapter: { bindOpenButton: options => log.push(`bindOpenButton:${typeof options.isFormLocked}`) },
    isFormLocked: () => false,
    savePatientData: () => {},
    ...overrides.options
  });
  return { result, log, relativeTable };
}

test('initializeExaminationPageBootstrap giữ đúng thứ tự bind của trang khám', async () => {
  const { result, log, relativeTable } = await createBootstrapHarness();
  assert.equal(result.status, 'initialized');
  assert.equal(result.relativeTableInstance, relativeTable);
  assert.deepEqual(log, [
    'ensureSession',
    'addButtonAnimationCSS',
    'initializePage',
    'initRelativeTable:true:x',
    'setRelativeTableInstance:true',
    'bindTabPrintButtons:print',
    'bindStatusTabs:function',
    'bindPatientSearchInput:function',
    'bindPaginationControls:getCurrentStatus,loadAppointments,setPerPage',
    'bindRefreshButtons:getCurrentPage,getCurrentStatus,loadAppointments',
    'initializeForm',
    'bindAgeInputGuard:age',
    'bindPersonalDetailEditButtons:{"bindings":{}}',
    'bindOpenButton:function',
    'bindSaveInfoButton:saveInfoBtn:function',
    'bindReExaminationSourceReset:reExaminationCheck:originalAppointmentId'
  ]);
});

test('initializeExaminationPageBootstrap dừng khi phiên bị chặn và bỏ kiểm tra khi được yêu cầu', async () => {
  const missing = await createBootstrapHarness({ token: false });
  assert.deepEqual({ ...missing.result }, { status: 'sessionBlocked', relativeTableInstance: null });
  assert.deepEqual(missing.log, ['ensureSession']);

  const skipped = await createBootstrapHarness({ token: false, options: { ensureSession: false } });
  assert.equal(skipped.result.status, 'initialized');
  assert.equal(skipped.log[0], 'addButtonAnimationCSS');
});

async function runAutoSave(caseOptions) {
  const win = loadScript(PAGE_CORE_UTILS);
  const log = [];
  const result = await win.ClinicalPageCoreUtils.autoSavePatientFormFieldShell('main_reason', caseOptions.value, {
    shouldSkip: caseOptions.shouldSkip,
    ensureCurrentAppointmentIdForAutoSave: caseOptions.ensure,
    getCurrentAppointmentId: caseOptions.getId,
    recheckSkipBeforeSave: caseOptions.recheck,
    isCurrentAppointment: caseOptions.isCurrent,
    showAutoSaveIndicator: type => log.push(`indicator:${type}`),
    apiCall: async (url, request) => {
      log.push(`api:${request.method}:${url}:${request.body}`);
      if (caseOptions.throws) throw new Error('boom');
      return { ok: caseOptions.ok };
    }
  });
  return { result, log };
}

test('autoSavePatientFormFieldShell trả đúng trạng thái theo từng nhánh', async () => {
  const skipped = await runAutoSave({ shouldSkip: () => true, getId: () => 5 });
  assert.deepEqual({ ...skipped.result }, { status: 'skipped' });
  assert.deepEqual(skipped.log, []);

  const missing = await runAutoSave({ ensure: async () => false, getId: () => 5 });
  assert.deepEqual({ ...missing.result }, { status: 'missingAppointment' });

  const noId = await runAutoSave({ ensure: async () => true, getId: () => null });
  assert.deepEqual({ ...noId.result }, { status: 'missingAppointment' });

  let skipCalls = 0;
  const recheck = await runAutoSave({ shouldSkip: () => skipCalls++ > 0, ensure: async () => true, getId: () => 5, recheck: true });
  assert.deepEqual({ ...recheck.result }, { status: 'skipped', appointmentId: 5 });
  assert.deepEqual(recheck.log, []);

  const saved = await runAutoSave({ ensure: async () => true, getId: () => 7, ok: true, value: 'abc' });
  assert.equal(saved.result.status, 'saved');
  assert.deepEqual({ ...saved.result.payload }, { main_reason: 'abc' });
  assert.deepEqual(saved.log, ['indicator:saving', 'api:PUT:/api/appointments/7:{"main_reason":"abc"}', 'indicator:success']);

  const emptyValue = await runAutoSave({ ensure: async () => true, getId: () => 7, ok: true, value: undefined });
  assert.deepEqual({ ...emptyValue.result.payload }, { main_reason: '' });

  const notOk = await runAutoSave({ ensure: async () => true, getId: () => 7, ok: false, value: 'abc' });
  assert.equal(notOk.result.status, 'responseNotOk');
  assert.equal(notOk.log.at(-1), 'indicator:error');

  const stale = await runAutoSave({ ensure: async () => true, getId: () => 7, ok: true, value: 'abc', isCurrent: () => false });
  assert.equal(stale.result.status, 'stale');
  assert.deepEqual(stale.log, ['indicator:saving', 'api:PUT:/api/appointments/7:{"main_reason":"abc"}']);

  const failed = await runAutoSave({ ensure: async () => true, getId: () => 7, throws: true, value: 'abc' });
  assert.equal(failed.result.status, 'error');
  assert.equal(failed.result.appointmentId, 7);
  assert.equal(failed.log.at(-1), 'indicator:error');
});

test('auto-save kiểm tra lại trạng thái loading sau khi chờ lấy lịch hẹn', async () => {
  const win = loadScript(PAGE_CORE_UTILS);
  let loading = false;
  let finishLookup;
  const lookup = new Promise(resolve => { finishLookup = resolve; });
  const writes = [];
  const saving = win.ClinicalPageCoreUtils.autoSavePatientFormFieldShell('main_reason', 'abc', {
    shouldSkip: () => loading,
    ensureCurrentAppointmentIdForAutoSave: () => lookup,
    getCurrentAppointmentId: () => 7,
    recheckSkipBeforeSave: true,
    apiCall: async (...args) => { writes.push(args); return { ok: true }; }
  });

  loading = true;
  finishLookup(true);
  const result = await saving;
  assert.deepEqual({ ...result }, { status: 'skipped', appointmentId: 7 });
  assert.deepEqual(writes, []);
});

test('auto-save không báo thành công cho bệnh nhân mới khi request cũ trả về', async () => {
  const win = loadScript(PAGE_CORE_UTILS);
  let appointmentId = 7;
  let finishRequest;
  let requestStarted;
  const started = new Promise(resolve => { requestStarted = resolve; });
  const response = new Promise(resolve => { finishRequest = resolve; });
  const indicators = [];
  const saving = win.ClinicalPageCoreUtils.autoSavePatientFormFieldShell('main_reason', 'abc', {
    getCurrentAppointmentId: () => appointmentId,
    isCurrentAppointment: savedId => savedId === appointmentId,
    showAutoSaveIndicator: type => indicators.push(type),
    apiCall: (url, options) => {
      assert.equal(url, '/api/appointments/7');
      assert.equal(options.body, '{"main_reason":"abc"}');
      requestStarted();
      return response;
    }
  });

  await started;
  appointmentId = 8;
  finishRequest({ ok: true });
  const result = await saving;
  assert.equal(result.status, 'stale');
  assert.equal(result.appointmentId, 7);
  assert.deepEqual(indicators, ['saving']);
});
