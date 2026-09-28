const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { RUNTIME_FILES } = require('./helpers/doctor-registry');

// In-memory replacement for the IndexedDB owner: the orchestrator only sees the
// draftRecoveryStore contract, so its state machine is exercised without a browser.
function memoryStore() {
    const records = new Map();
    const matches = (record, current) => Boolean(current && (record.captureId ? current.captureId === record.captureId : current.schemaVersion === record.schemaVersion && current.savedAt === record.savedAt));
    return {
        records,
        failWrites: false,
        DRAFT_TTL_MS: 24 * 60 * 60 * 1000,
        draftKey: context => `doctor-clinical:${context.userId}:${context.appointmentId}`,
        readRecord: async key => records.get(key) || null,
        writeRecord: async record => { if (records.failWrites) throw new Error('quota'); records.set(record.key, record); },
        deleteRecord: async key => { records.delete(key); },
        deleteRecordIfMatches: async record => { const current = records.get(record.key); if (matches(record, current)) records.delete(record.key); return matches(record, current); },
        replaceRecordIfMatches: async (record, replacement) => { const current = records.get(record.key); if (!matches(record, current)) return false; records.set(record.key, replacement); return true; },
        purgeExpiredRecords: async () => { const now = Date.now(); for (const [key, record] of records) if (record.expiresAt <= now) records.delete(key); },
        deleteUserRecords: async userId => { for (const [key, record] of records) if (record.userId === userId) records.delete(key); }
    };
}

function fakeDocument() {
    const banner = { hidden: true, dataset: {}, listeners: {}, querySelector: () => null, addEventListener(type, fn) { this.listeners[type] = fn; } };
    const workspace = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
    const doc = {
        listeners: {},
        getElementById: id => ({ doctorDraftRecoveryBanner: banner, doctorClinicalWorkspace: workspace }[id] || null),
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener(type, fn) { this.listeners[type] = fn; }
    };
    return { doc, banner, workspace };
}

function setup({ store = memoryStore(), initial } = {}) {
    const timers = [];
    const window = {
        localStorage: { getItem: key => (key === 'qlpk_user' ? JSON.stringify({ id: 7 }) : null) },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        clearTimeout() {},
        requestAnimationFrame: fn => fn()
    };
    const { doc, banner, workspace } = fakeDocument();
    const context = vm.createContext({ window, document: doc, console, IDBKeyRange: {} });
    for (const file of RUNTIME_FILES) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    const registry = window.QLPKDoctorModuleRegistry;
    const owners = {
        workspace: { snapshot: initial?.clinical || { controls: { doctorClinicalReason: 'DB' } }, dirty: false, restored: [], hasUnsavedChanges() { return this.dirty; }, getDraftSnapshot() { return JSON.parse(JSON.stringify(this.snapshot)); }, async restoreDraftSnapshot(data) { this.restored.push(data); this.snapshot = data; } },
        support: { snapshot: { prescription: { medicineDays: 5, rows: [] }, services: [], indications: {} }, restored: [], getDraftSnapshot() { return JSON.parse(JSON.stringify(this.snapshot)); }, async restoreDraftSnapshot(data, options) { this.restored.push([data, options.dirty]); }, isReExaminationLocked: () => false },
        history: { snapshot: { allergies: [] }, restored: [], getDraftSnapshot() { return JSON.parse(JSON.stringify(this.snapshot)); }, async restoreDraftSnapshot(data, options) { this.restored.push([data, options.dirty]); } }
    };
    registry.register('clinicalWorkspace', owners.workspace);
    registry.register('supportModulesUi', owners.support);
    registry.register('medicalHistoryBridge', owners.history);
    vm.runInContext(fs.readFileSync('app/static/js/doctor-examination/draft-recovery-policy.js', 'utf8'), context);
    registry.register('draftRecoveryStore', store);
    vm.runInContext(fs.readFileSync('app/static/js/doctor-examination/draft-recovery.js', 'utf8'), context);
    const draft = registry.get('draftRecovery');
    const toasts = [];
    let reloads = 0;
    draft.bind({ document: doc, showToast: (type, message) => toasts.push([type, message]), reloadContext: async () => { reloads += 1; return 'reloaded'; } });
    return { draft, store, owners, doc, banner, workspace, toasts, timers, window, reloads: () => reloads, flushTimers: () => { const pending = timers.splice(0); return Promise.all(pending.map(fn => fn())); } };
}

const CONTEXT = { appointmentId: 1101, patientId: 267, userId: 7 };
const plain = value => JSON.parse(JSON.stringify(value));

test('confirmed logout clears old owner only and waits for in-flight draft write', async () => {
    const store = memoryStore();
    let finish;
    const write = store.writeRecord;
    store.writeRecord = record => new Promise(resolve => { finish = async () => { await write(record); resolve(); }; });
    const state = setup({ store });
    await state.draft.setContext(CONTEXT);
    state.owners.workspace.dirty = true;
    state.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'pending' } };
    const capture = state.draft.captureNow();
    store.records.set('other', { userId: 8 });
    const cleanups = [];
    state.doc.listeners['qlpk:logout:confirmed']({ detail: { confirmed: true, userId: 7, pendingCleanup: cleanups } });
    assert.equal(cleanups.length, 1);
    await finish();
    await capture;
    assert.equal(await cleanups[0], true);
    assert.equal(store.records.size, 1);
    assert.equal(store.records.has('other'), true);
    assert.equal(await state.draft.captureNow(), false);
});

for (const nextIdentity of [null, { id: 8 }, { id: 7 }]) {
    test(`cookie draft finishing after session changes to ${nextIdentity?.id ?? 'anonymous'} is removed`, async () => {
        const store = memoryStore();
        const write = store.writeRecord;
        let finish;
        store.writeRecord = record => new Promise(resolve => { finish = async () => { await write(record); resolve(); }; });
        const state = setup({ store });
        let identity = { id: 7 };
        let revision = 1;
        state.window.QLPKApiTransport = { session: { owner: { snapshot: () => ({ revision, session: identity ? { user: identity } : null }) } } };
        await state.draft.setContext(CONTEXT);
        state.owners.workspace.dirty = true;
        state.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'pending old session' } };
        const capture = state.draft.captureNow();
        identity = nextIdentity;
        revision += 1;
        store.records.set('other', { userId: 8 });
        await finish();
        assert.equal(await capture, false);
        assert.equal(store.records.size, 1);
        assert.equal(store.records.has('other'), true);
    });
}

test('cookie draft identity ignores stale storage and explicit old context user', async () => {
    const state = setup();
    let identity = { id: 8 };
    state.window.QLPKApiTransport = { session: { owner: { snapshot: () => ({ session: identity ? { user: identity } : null }) } } };
    await state.draft.setContext(CONTEXT);
    state.owners.workspace.dirty = true;
    state.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'cookie draft' } };
    assert.equal(await state.draft.captureNow(), true);
    assert.equal(Array.from(state.store.records.values())[0].userId, 8);
    identity = null;
    assert.equal(await state.draft.captureNow(), false);
    assert.equal(await state.draft.clearCurrentUserDrafts({ confirmed: true, userId: 7 }), true);
    assert.equal(state.store.records.size, 1);
    assert.equal(await state.draft.clearCurrentUserDrafts({ confirmed: true, userId: 8 }), true);
    assert.equal(state.store.records.size, 0);
});

test('setContext with no stored draft keeps the banner hidden and captures a draft only when dirty', async () => {
    const s = setup();
    assert.equal(await s.draft.setContext({ ...CONTEXT, document: s.doc }), false);
    assert.equal(s.banner.hidden, true);
    assert.equal(await s.draft.captureNow(), false, 'clean workspace never writes a draft');
    s.owners.workspace.dirty = true;
    s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Đã sửa' } };
    assert.equal(await s.draft.captureNow(), true);
    const record = [...s.store.records.values()][0];
    assert.equal(record.key, 'doctor-clinical:7:1101');
    assert.equal(record.recoveryMode, 'standard');
    assert.deepEqual(plain(record.baseSnapshot.clinical), { controls: { doctorClinicalReason: 'DB' } });
    assert.deepEqual(plain(record.snapshot.clinical), { controls: { doctorClinicalReason: 'Đã sửa' } });
    assert.ok(record.expiresAt - record.savedAt === s.store.DRAFT_TTL_MS);
});

test('a stored draft for the same context shows the banner, restore applies it to every owner and discard reloads DB data', async () => {
    const first = setup();
    await first.draft.setContext({ ...CONTEXT, document: first.doc });
    first.owners.workspace.dirty = true;
    first.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Nháp' } };
    first.owners.history.snapshot = { allergies: ['Penicillin'] };
    await first.draft.captureNow();

    const second = setup({ store: first.store });
    assert.equal(await second.draft.setContext({ ...CONTEXT, document: second.doc }), true);
    assert.equal(second.banner.hidden, false);
    assert.equal(second.banner.dataset.state, 'available');
    second.banner.listeners.click({ target: { closest: () => ({ dataset: { doctorDraftAction: 'restore' } }) }, preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(plain(second.owners.workspace.restored), [{ controls: { doctorClinicalReason: 'Nháp' } }]);
    assert.deepEqual(plain(second.owners.history.restored), [[{ allergies: ['Penicillin'] }, true]], 'history restore is flagged dirty because it differs from DB');
    assert.deepEqual(plain(second.owners.support.restored[0][1]), { prescription: false, services: false, indications: false }, 'support owners get a per-module dirty map');
    assert.equal(second.banner.dataset.state, 'restored');
    assert.equal(await second.draft.discardCurrent({ document: second.doc }), 'reloaded', 'discarding a restored draft reloads the DB-first view');
    assert.equal(second.store.records.size, 0);
    assert.equal(second.banner.hidden, true);
});

test('drafts from another user, patient or appointment are deleted instead of offered', async () => {
    const s = setup();
    await s.draft.setContext({ ...CONTEXT, document: s.doc });
    s.owners.workspace.dirty = true; s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'X' } };
    await s.draft.captureNow();
    const stale = setup({ store: s.store });
    assert.equal(await stale.draft.setContext({ ...CONTEXT, patientId: 999, document: stale.doc }), false);
    assert.equal(stale.banner.hidden, true);
    assert.equal(stale.store.records.size, 0, 'a draft whose patient no longer matches is purged');
    const other = setup();
    assert.equal(await other.draft.setContext({ ...CONTEXT, userId: 8, document: other.doc }), false);
});

test('a draft equal to the current DB data is redundant, and rebaseAfterSave clears everything', async () => {
    const s = setup();
    await s.draft.setContext({ ...CONTEXT, document: s.doc });
    s.owners.workspace.dirty = true; s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Mới' } };
    await s.draft.captureNow();
    assert.equal(s.store.records.size, 1);
    assert.equal(await s.draft.rebaseAfterSave(), true);
    assert.equal(s.store.records.size, 0);
    s.owners.workspace.dirty = true;
    assert.equal(await s.draft.captureNow(), true, 'unchanged data after rebase resolves as a clean rebase');
    assert.equal(s.store.records.size, 0, 'and still writes nothing');
});

test('failed-save drafts survive a newer DB baseline by merging, and write failures report once', async () => {
    const s = setup();
    await s.draft.setContext({ ...CONTEXT, document: s.doc });
    s.owners.workspace.dirty = true; s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Lý do nháp' } };
    await s.draft.captureNow({ recoveryMode: 'failed-save' });
    assert.equal([...s.store.records.values()][0].recoveryMode, 'failed-save');

    const later = setup({ store: s.store, initial: { clinical: { controls: { doctorClinicalReason: 'DB', otherField: 'đã đổi ở DB' } } } });
    assert.equal(await later.draft.setContext({ ...CONTEXT, document: later.doc }), true, 'superseded failed-save draft is rebased instead of dropped');
    const record = [...later.store.records.values()][0];
    assert.equal(record.recoveryMode, 'standard');
    assert.deepEqual(plain(record.snapshot.clinical.controls), { doctorClinicalReason: 'Lý do nháp', otherField: 'đã đổi ở DB' });

    const failing = setup();
    await failing.draft.setContext({ ...CONTEXT, document: failing.doc });
    failing.store.records.failWrites = true;
    failing.owners.workspace.dirty = true; failing.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Y' } };
    assert.equal(await failing.draft.captureNow(), false);
    assert.deepEqual(failing.toasts, [['error', 'Không thể lưu bản nháp phục hồi trên thiết bị này']]);
});

test('queued captures are debounced per context and a context switch cancels the pending write', async () => {
    const s = setup();
    await s.draft.setContext({ ...CONTEXT, document: s.doc });
    s.owners.workspace.dirty = true; s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Z' } };
    s.workspace.listeners.input();
    s.workspace.listeners.input();
    assert.equal(s.timers.length, 2, 'each input schedules a timer; older ones are invalidated by generation');
    await s.draft.clearContext({ document: s.doc });
    await s.flushTimers();
    assert.equal(s.store.records.size, 0, 'no draft is written for a context that was left');
    assert.equal(await s.draft.setContext({ ...CONTEXT, document: s.doc }), false);
    s.owners.workspace.snapshot = { controls: { doctorClinicalReason: 'Z2' } };
    s.workspace.listeners.input();
    await s.flushTimers();
    assert.equal(s.store.records.size, 1);
    assert.equal(await s.draft.clearCurrentUserDrafts(), true);
    assert.equal(s.store.records.size, 0, 'logout removes every draft of the current user');
});
