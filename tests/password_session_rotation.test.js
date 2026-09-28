'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app/static/js/app-header-loader.js'), 'utf8');
const submitSource = source.slice(source.indexOf('\tasync function submitPasswordChange('), source.indexOf('\n\tasync function fetchCurrentUser('));

function harness() {
    const log = [];
    const storage = new Map([['qlpk_token', 'old-token'], ['token', 'legacy-token']]);
    const elements = {
        currentPassword: { value: 'current-password' }, newPassword: { value: 'next-password' },
        confirmPassword: { value: 'next-password' }, submitBtn: { disabled: false },
        form: { reset() { log.push('reset'); } }
    };
    let resolveResponse;
    let fetchCount = 0;
    const pending = new Promise(resolve => { resolveResponse = resolve; });
    const context = vm.createContext({
        getPasswordModalElements: () => elements,
        setPasswordMessage: (type, message) => log.push({ type, message }),
        closePasswordModalSoon: () => log.push('close'),
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem(key, value) { storage.set(key, value); log.push('store'); },
            removeItem: key => storage.delete(key)
        },
        fetch() { fetchCount += 1; return pending; },
        window: { QLPKRealtimeClient: { stop() { log.push('stop'); }, start() { log.push('start'); } } }
    });
    vm.runInContext(submitSource, context);
    return { log, storage, elements, context, get fetchCount() { return fetchCount; },
        submit: () => context.submitPasswordChange({ preventDefault() {} }),
        finish(body = { access_token: 'new-token' }, ok = true) { resolveResponse({ ok, json: async () => body }); }
    };
}

test('successful password rotation stores token before socket restart without reloading workspace', async () => {
    const current = harness();
    const pending = current.submit();
    current.finish();
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'new-token');
    assert.equal(current.storage.has('token'), false);
    assert.deepEqual(current.log.filter(value => typeof value === 'string'), ['store', 'stop', 'start', 'reset', 'close']);
    assert.equal(current.elements.submitBtn.disabled, false);
});

test('pending duplicate submit sends only one password request', async () => {
    const current = harness();
    const pending = current.submit();
    await current.submit();
    current.finish();
    await pending;
    assert.equal(current.fetchCount, 1);
});

test('response from old session cannot replace a different logged-in account', async () => {
    const current = harness();
    const pending = current.submit();
    current.storage.set('qlpk_token', 'other-account-token');
    current.finish();
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'other-account-token');
    assert.equal(current.log.includes('start'), false);
    assert.equal(current.log.includes('reset'), false);
});

test('response after logout cannot silently log old user back in', async () => {
    const current = harness();
    const pending = current.submit();
    current.storage.delete('qlpk_token');
    current.finish();
    await pending;
    assert.equal(current.storage.has('qlpk_token'), false);
    assert.equal(current.log.includes('start'), false);
});

test('missing replacement token reports committed change honestly', async () => {
    const current = harness();
    const pending = current.submit();
    current.finish({ success: true });
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'old-token');
    assert.match(current.log.at(-1).message, /Mật khẩu đã đổi/);
    assert.equal(current.log.includes('reset'), false);
});

test('failed password request leaves session and form unchanged', async () => {
    const current = harness();
    const pending = current.submit();
    current.finish({}, false);
    await pending;
    assert.equal(current.storage.get('qlpk_token'), 'old-token');
    assert.equal(current.log.includes('reset'), false);
    assert.equal(current.log.includes('stop'), false);
    assert.equal(current.elements.submitBtn.disabled, false);
});

test('cookie password form uses locked actions without storing bearer or restarting old socket', async () => {
    const current = harness();
    const calls = [];
    current.context.window.QLPKApiTransport = { session: { actions: {
        async changePassword(...args) { calls.push(args); }
    } } };
    await current.submit();
    assert.deepEqual(calls, [['current-password', 'next-password']]);
    assert.equal(current.fetchCount, 0);
    assert.equal(current.storage.get('qlpk_token'), 'old-token');
    assert.deepEqual(current.log.filter(value => typeof value === 'string'), ['reset', 'close']);
    assert.equal(current.elements.submitBtn.disabled, false);
});

test('cookie action failure leaves password form intact and never uses legacy fallback', async () => {
    const current = harness();
    current.context.window.QLPKApiTransport = { session: { actions: {
        async changePassword() { throw new Error('session.changed'); }
    } } };
    await current.submit();
    assert.equal(current.fetchCount, 0);
    assert.equal(current.log.includes('reset'), false);
    assert.equal(current.log.includes('start'), false);
    assert.equal(current.elements.submitBtn.disabled, false);
});
