const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadSupportRuntime } = require('./helpers/doctor-registry');

function createController(overrides = {}) {
    const { createChangeTracker } = loadSupportRuntime();
    const modules = new Map();
    const window = { QLPKDoctorModuleRegistry: { register: (name, value) => modules.set(name, value), get: () => null } };
    vm.runInNewContext(fs.readFileSync('app/static/js/doctor-examination/workspace-save-controller.js', 'utf8'), { window, console });
    const state = { appointment: { id: 101 }, contextToken: 1, mainDirty: false, ...overrides.state };
    const log = { toasts: [], afterSave: 0, drafts: 0, requests: [], phases: [] };
    const support = overrides.support || { getSaveReadiness: () => ({ failures: [] }), saveAll: async () => ({ status: 'skipped', reason: 'clean' }) };
    const controller = modules.get('workspaceSaveController').create({
        state,
        mainChanges: createChangeTracker(state, { revisionKey: 'mainRevision', dirtyKey: 'mainDirty' }),
        getDocument: () => ({}),
        textOf: String,
        valueOf: value => value,
        apiCall: async (url, options) => { log.requests.push({ url, body: options?.body }); return { ok: overrides.apiOk !== false }; },
        isLoading: () => false,
        collect: () => ({ main_reason: 'x' }),
        hasUnsavedChanges: () => false,
        getSupportModules: () => support,
        getClinicalForm: () => ({ getExaminationId: () => overrides.examinationId || null, getSaveState: () => ({ mainDirty: Boolean(overrides.clinicalDirty), mainRevision: 1, detailDirtySections: new Set(), detailsLoaded: true }), markMainSaved() {} }),
        setWorkspaceSavePhase: (_, phase) => log.phases.push(phase),
        setBusy() {},
        showToast: (type, message) => log.toasts.push([type, message]),
        afterSave: () => { log.afterSave += 1; },
        afterComplete: () => { log.afterComplete = (log.afterComplete || 0) + 1; },
        readResponseError: async () => 'Lỗi QA',
        getDraftRecovery: () => ({ captureNow: async () => { log.drafts += 1; } })
    });
    return { controller, state, log };
}

test('clean workspace save reports no changes and still runs the after-save hook', async () => {
    const { controller, log } = createController();
    const result = await controller.saveWorkspace({});
    assert.equal(result.status, 'success');
    assert.equal(result.noChanges, true);
    assert.equal(log.afterSave, 1);
    assert.equal(log.requests.length, 0);
    assert.deepEqual(log.toasts, [['success', 'Không có thay đổi cần lưu.']]);
});

test('dirty workspace save writes the appointment, then runs the after-save hook once', async () => {
    const { controller, log } = createController({ clinicalDirty: true, support: { getSaveReadiness: () => ({ failures: [] }), saveAll: async () => ({ status: 'success', successMessages: ['Đã lưu đơn thuốc'] }) } });
    const result = await controller.saveWorkspace({});
    assert.equal(result.status, 'success');
    assert.equal(result.noChanges, undefined);
    assert.equal(result.mainResult.status, 'success');
    assert.deepEqual(log.requests.map(request => request.url), ['/api/appointments/101']);
    assert.equal(log.afterSave, 1);
    assert.deepEqual(log.toasts, [['success', 'Đã lưu đơn thuốc']]);
    assert.deepEqual(log.phases, ['main', 'main', 'support']);
});

test('support failures and thrown errors capture a local draft and never run the after-save hook', async () => {
    const failing = createController({ support: { getSaveReadiness: () => ({ failures: [] }), saveAll: async () => ({ status: 'error', failedModules: [{ key: 'prescription', label: 'Đơn thuốc', reason: 'Thiếu kho' }] }) } });
    const failed = await failing.controller.saveWorkspace({});
    assert.equal(failed.status, 'error');
    assert.equal(failed.failedModules[0].key, 'prescription');
    assert.equal(failing.log.drafts, 1);
    assert.equal(failing.log.afterSave, 0);
    assert.equal(failing.log.toasts[0][0], 'error');

    const throwing = createController({ clinicalDirty: true, apiOk: false });
    const thrown = await throwing.controller.saveWorkspace({ silent: true });
    assert.equal(thrown.status, 'error');
    assert.match(thrown.failedModules[0].reason, /Lỗi QA/);
    assert.equal(throwing.log.drafts, 1);
    assert.equal(throwing.log.toasts.length, 0, 'silent save shows no toast');
    assert.equal(throwing.state.workspaceSaving, false);
});

test('completeNow refuses to transfer while data is unsaved and transfers after a clean save', async () => {
    const missing = createController();
    assert.equal((await missing.controller.completeNow({})).reason, 'missing-examination');

    const unsaved = createController({ examinationId: 77, support: { getSaveReadiness: () => ({ failures: [{ key: 'prescription', label: 'Đơn thuốc', reason: 'Chưa chọn thuốc' }] }) } });
    const blocked = await unsaved.controller.completeNow({});
    assert.equal(blocked.reason, 'unsaved-changes');
    assert.equal(unsaved.log.requests.length, 0);
    assert.match(unsaved.log.toasts.at(-1)[1], /Chưa thể hoàn thành ca khám/);

    const { controller, log, state } = createController({ examinationId: 77 });
    const result = await controller.completeNow({});
    assert.equal(result.status, 'success');
    assert.deepEqual(log.requests.map(request => request.url), ['/examinations/77/transfer-to-payment']);
    assert.equal(log.afterSave, 1, 'silent save before completion still rebases drafts');
    assert.equal(log.afterComplete, 1);
    assert.deepEqual(log.toasts, [['success', 'Đã hoàn thành khám']]);
    assert.equal(state.completing, false);
});
