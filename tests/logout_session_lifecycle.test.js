'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

const source = readScriptSource(path.join(__dirname, '../app/static/js/app-header-loader.js'));
// Logout state lives in the split entry; the functions come from its parts.
const logoutSource = 'let logoutPending = false;\nlet confirmedLogoutCleanup = null;\n'
    + source.slice(source.indexOf('\tasync function clearConfirmedLogout('), source.indexOf('\n\tfunction bindLogout()'));

function harness() {
    const storage = new Map([['qlpk_token', 'qa-token'], ['token', 'old-alias'], ['qlpk_user', 'qa-user']]);
    const sessionStorage = new Map([['qlpk_token', 'old-session'], ['token', 'old-session-alias']]);
    const log = [];
    let resolveResponse;
    let requestCount = 0;
    const pending = new Promise(resolve => { resolveResponse = resolve; });
    const document = { querySelectorAll: () => [], dispatchEvent(event) { log.push(event.type); } };
    const window = {
        sessionStorage: { getItem: key => sessionStorage.get(key), removeItem: key => sessionStorage.delete(key) },
        QLPKApiTransport: { getAuthHeader: () => {
            const token = storage.get('qlpk_token') || storage.get('token') || sessionStorage.get('qlpk_token') || sessionStorage.get('token');
            return token ? `Bearer ${token}` : null;
        } },
        document, location: { href: '/doctor-examination.html' },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        QLPKRealtimeClient: { stop() { log.push('stop'); } },
        QLPKUserFeedback: { show(type, message) { log.push({ type, message }); } }
    };
    const context = vm.createContext({ window, document, Promise,
        AbortSignal: { timeout: () => ({}) },
        localStorage: { getItem: key => storage.get(key) || null, removeItem(key) { storage.delete(key); log.push(`remove:${key}`); } },
        fetch(url, options) { assert.equal(url, '/auth/logout'); assert.equal(options.method, 'POST'); requestCount++; return pending; }
    });
    vm.runInContext(logoutSource, context);
    return { context, storage, sessionStorage, log, window, document, get requestCount() { return requestCount; },
        logout: () => context.logout(), resolve(status = 200) { resolveResponse({ ok: status === 200, status }); }
    };
}

test('logout only clears credentials and drafts after server confirmation', async () => {
    const current = harness();
    const pending = current.logout();
    assert.equal(current.storage.get('qlpk_token'), 'qa-token');
    assert.deepEqual(current.log, []);
    current.resolve();
    await pending;
    assert.equal(current.storage.has('qlpk_token'), false);
    assert.equal(current.storage.has('token'), false);
    assert.equal(current.sessionStorage.size, 0);
    assert.equal(current.window.location.href, '/login.html');
    assert.equal(current.log.indexOf('qlpk:logout:confirmed') < current.log.indexOf('remove:qlpk_user'), true);
});

test('logout failure retains session and drafts and allows retry', async () => {
    const current = harness();
    const pending = current.logout();
    current.resolve(503);
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'qa-token');
    assert.equal(current.sessionStorage.get('qlpk_token'), 'old-session');
    assert.equal(current.log.includes('qlpk:logout:confirmed'), false);
    assert.equal(current.window.location.href, '/doctor-examination.html');
    await current.logout();
    assert.equal(current.requestCount, 2);
});

test('logout revokes sessionStorage-only legacy token before clearing aliases', async () => {
    const current = harness();
    current.storage.delete('qlpk_token');
    current.storage.delete('token');
    const pending = current.logout();
    assert.equal(current.requestCount, 1);
    assert.equal(current.sessionStorage.get('qlpk_token'), 'old-session');
    current.resolve();
    await pending;
    assert.equal(current.sessionStorage.size, 0);
    assert.equal(current.window.location.href, '/login.html');
});

test('logout does not clear a replacement sessionStorage-only credential', async () => {
    const current = harness();
    current.storage.delete('qlpk_token');
    current.storage.delete('token');
    const pending = current.logout();
    current.sessionStorage.set('qlpk_token', 'new-session');
    current.resolve();
    await pending;
    assert.equal(current.sessionStorage.get('qlpk_token'), 'new-session');
    assert.deepEqual(current.log, []);
});

test('duplicate logout shares one mutation', async () => {
    const current = harness();
    const pending = current.logout();
    await current.logout();
    assert.equal(current.requestCount, 1);
    current.resolve();
    await pending;
});

test('stale logout response cannot clear another account session', async () => {
    const current = harness();
    const pending = current.logout();
    current.storage.set('qlpk_token', 'another-token');
    current.resolve();
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'another-token');
    assert.deepEqual(current.log, []);
});

test('already invalid token permits safe local logout', async () => {
    const current = harness();
    const pending = current.logout();
    current.resolve(401);
    await pending;
    assert.equal(current.window.location.href, '/login.html');
});

test('logout awaits asynchronous draft cleanup while user identity still exists', async () => {
    const current = harness();
    let finishCleanup;
    current.document.dispatchEvent = event => event.detail.pendingCleanup.push(new Promise(resolve => { finishCleanup = resolve; }));
    const pending = current.logout();
    current.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.storage.get('qlpk_user'), 'qa-user');
    assert.equal(current.window.location.href, '/doctor-examination.html');
    finishCleanup();
    await pending;
    assert.equal(current.storage.has('qlpk_user'), false);
});

test('legacy logout callers all delegate to shared session owner', () => {
    for (const file of ['group-management.js', 'user-management.js', 'permission-management.js',
        'medicine-management.js', 'doctor-busy-schedule.js', 'text-expansion-management.js']) {
        const content = readScriptSource(path.join(__dirname, '../app/static/js', file));
        assert.match(content, /QLPKAppHeader\?\.logout\(\)/, file);
    }
    const draft = readScriptSource(path.join(__dirname, '../app/static/js/doctor-examination/draft-recovery.js'));
    assert.match(draft, /addEventListener\('qlpk:logout:confirmed'/);
    assert.doesNotMatch(draft, /closest\('#logoutBtn/);
});

test('cookie logout with unavailable actions never silently clears the workspace', async () => {
    const current = harness();
    current.window.QLPKApiTransport = { session: {} };
    await current.logout();
    assert.equal(current.requestCount, 0);
    assert.equal(current.storage.get('qlpk_token'), 'qa-token');
    assert.equal(current.log.includes('qlpk:logout:confirmed'), false);
    assert.equal(current.window.location.href, '/doctor-examination.html');
});

function cookieHarness() {
    const current = harness();
    let revision = 1, status = 'authenticated', finish, mutations = 0;
    const pending = new Promise(resolve => { finish = resolve; });
    current.window.navigator = { locks: { request: async (name, options, callback) => callback() } };
    current.window.QLPKApiTransport = { session: {
        owner: { snapshot: () => ({ revision, status }) },
        actions: { async logout(callback) {
            mutations++;
            await pending;
            revision++;
            status = 'anonymous';
            await callback({ confirmed: true, userId: 7, previousSessionId: 'qa' });
        } }
    } };
    return { ...current, finish, mutations: () => mutations,
        switchAccount() { revision++; status = 'authenticated'; } };
}

test('cookie logout sends confirmed user ID and awaits cleanup before navigation', async () => {
    const current = cookieHarness();
    let release, detail;
    current.document.dispatchEvent = event => {
        detail = event.detail;
        detail.pendingCleanup.push(new Promise(resolve => { release = resolve; }));
    };
    const pending = current.logout();
    assert.equal(current.requestCount, 0);
    assert.equal(detail, undefined);
    current.finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(detail.userId, 7);
    assert.equal(detail.confirmed, true);
    assert.equal(current.window.location.href, '/doctor-examination.html');
    release(true);
    await pending;
    assert.equal(current.window.location.href, '/login.html');
});

test('account switch during cookie cleanup prevents clearing or navigating new session', async () => {
    const current = cookieHarness();
    let release;
    current.document.dispatchEvent = event => event.detail.pendingCleanup.push(new Promise(resolve => { release = resolve; }));
    const pending = current.logout();
    current.finish();
    await new Promise(resolve => setImmediate(resolve));
    current.switchAccount();
    current.storage.set('qlpk_user', 'new-user');
    release(true);
    await pending;
    assert.equal(current.storage.get('qlpk_user'), 'new-user');
    assert.equal(current.window.location.href, '/doctor-examination.html');
});

test('failed cookie draft cleanup can retry without a second server logout', async () => {
    const current = cookieHarness();
    let attempts = 0;
    current.document.dispatchEvent = event => event.detail.pendingCleanup.push(Promise.resolve(++attempts > 1));
    const pending = current.logout();
    current.finish();
    await pending;
    assert.match(current.log.at(-1).message, /Đã đăng xuất trên máy chủ/);
    assert.equal(current.window.location.href, '/doctor-examination.html');
    await current.logout();
    assert.equal(current.mutations(), 1);
    assert.equal(current.window.location.href, '/login.html');
});
