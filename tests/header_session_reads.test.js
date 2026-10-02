const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

const source = readScriptSource('app/static/js/app-header-loader.js');
function segment(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }

function harness() {
    const requests = [], writes = [], updates = [];
    let status = 'authenticated';
    const user = { id: 7, username: 'cookie-user', role: 'doctor', permissions: ['qlkham-bs'] };
    const window = { QLPKApiTransport: { session: { owner: { snapshot: () => ({ status,
        session: status === 'authenticated' ? { user } : null }) } } } };
    const context = vm.createContext({ window, URLSearchParams, AbortController,
        localStorage: { getItem: () => '{"username":"stale-stored-user"}', setItem: (...args) => writes.push(args) },
        updateUserUi: value => updates.push(value),
        globalSearchElements: () => ({ scope: { value: 'all' } }),
        globalSearchAbortController: null, globalSearchSelectedPatientId: null,
        fetch: async (url, init) => {
            requests.push({ url, init });
            return { ok: true, json: async () => user };
        },
    });
    for (const [start, end] of [
        ['\nfunction readStoredUser()', '\nfunction normalizeRole'],
        ['\nasync function fetchCurrentUser()', '\nfunction globalSearchElements'],
        ['\nfunction globalSearchApiHeaders()', '\nfunction itemActions'],
        ['\nasync function fetchGlobalSearch(', '\nasync function selectGlobalSearchPatient'],
        ['\nfunction hasHeaderSession()', '\nfunction notificationElements'],
    ]) vm.runInContext(segment(start, end), context);
    return { context, requests, writes, updates, user, setStatus(value) { status = value; } };
}

test('header cookie reads never restore stored user or emit bearer headers', async () => {
    const state = harness();
    assert.equal(state.context.readStoredUser(), state.user);
    await state.context.hydrateUser();
    await state.context.notificationApi('/api/notifications');
    await state.context.fetchGlobalSearch('patient');
    assert.equal(state.requests.length, 3);
    for (const request of state.requests) assert.equal(new Headers(request.init?.headers).has('Authorization'), false);
    assert.equal(state.writes.length, 0);
    assert.ok(state.updates.every(value => value.username === 'cookie-user'));
});

test('header anonymous session ignores stale storage and does not request private data', async () => {
    const state = harness();
    state.setStatus('anonymous');
    assert.equal(Object.keys(state.context.readStoredUser()).length, 0);
    assert.equal(await state.context.fetchCurrentUser(), null);
    await assert.rejects(state.context.notificationApi('/api/notifications'), /Session unavailable/);
    assert.equal(state.requests.length, 0);
});

test('header bootstrap may start from unknown but blocked states never fall back to token', () => {
    const state = harness();
    for (const status of ['unknown', 'loading', 'authenticated']) {
        state.setStatus(status);
        assert.equal(state.context.hasHeaderSession(), true);
    }
    for (const status of ['changed', 'unavailable', 'expired', 'anonymous']) {
        state.setStatus(status);
        assert.equal(state.context.hasHeaderSession(), false);
    }
});

test('notification and search reject stale body instead of returning empty success', async () => {
    const state = harness();
    state.context.fetch = async () => ({ ok: true, json: async () => { throw new Error('session.changed'); } });
    await assert.rejects(state.context.notificationApi('/api/notifications'), /session.changed/);
    await assert.rejects(state.context.fetchGlobalSearch('old-patient'), /session.changed/);
});
