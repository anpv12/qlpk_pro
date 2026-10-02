const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function payload(letter = 'a') {
    return { token_type: 'cookie', session_id: letter.repeat(32), csrf_token: letter.repeat(64),
        user: { id: 7, username: 'qa', role: 'doctor', full_name: 'QA', permissions: ['qlkham-bs'] } };
}

function response(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
}

function lockManager() {
    let tail = Promise.resolve();
    return { names: [], request(name, options, handler) {
        this.names.push(name);
        assert.equal(options.mode, 'exclusive');
        const operation = tail.then(handler);
        tail = operation.catch(() => {});
        return operation;
    } };
}

function harness(locks = lockManager()) {
    const requests = [], queue = [], messages = [];
    const window = { console, document: { baseURI: 'https://clinic.test/page' }, location: { origin: 'https://clinic.test' },
        navigator: { locks }, fetch: async (input, init) => {
            requests.push({ input, init });
            const next = queue.shift();
            if (!next) throw new Error('Unexpected request');
            return typeof next === 'function' ? next() : next;
        } };
    const context = vm.createContext({ window, URL, Headers, Promise, console });
    for (const file of ['browser-session.js', 'browser-session-actions.js']) {
        runScriptFile('app/static/js/shared/' + file, (c => vm.isContext(c) ? c : vm.createContext(c))(context));
    }
    const owner = window.QLPKBrowserSession.create({ channel: { addEventListener() {}, removeEventListener() {},
        postMessage(message) { messages.push(message); } } });
    const actions = window.QLPKBrowserSessionActions.create({ owner });
    return { actions, owner, requests, queue, messages, locks };
}

for (const retry of ['35', '-1', '99999', 'invalid']) {
    test(`login throttle carries only safe server delay: ${retry}`, async () => {
        const state = harness();
        state.queue.push(new Response(JSON.stringify({ detail: 'Too many attempts' }), { status: 429, headers: { 'Retry-After': retry } }));
        await assert.rejects(state.actions.login('qa', 'password'), error => {
            assert.equal(error.status, 429);
            assert.equal(error.retryAfter, retry === '35' ? 35 : undefined);
            return true;
        });
        assert.equal(state.actions.isPending(), false);
    });
}

test('login chooses cookie transport and keeps permissions in RAM only', async () => {
    const state = harness();
    state.queue.push(response(payload()));
    const result = await state.actions.login('qa', 'password');
    assert.equal(state.requests[0].init.headers['X-QLPK-Session'], 'cookie');
    assert.equal(state.requests[0].init.credentials, 'same-origin');
    assert.equal(JSON.parse(state.requests[0].init.body).password, 'password');
    assert.equal(result.session.user.permissions[0], 'qlkham-bs');
    assert.equal(JSON.stringify(state.owner.snapshot()).includes('password'), false);
    assert.equal(state.actions.isPending(), false);
    assert.equal(state.messages.length, 1);
});

test('duplicate login is rejected while the first request remains pending', async () => {
    const state = harness();
    const pending = deferred();
    state.queue.push(pending.promise);
    const first = state.actions.login('qa', 'password');
    await assert.rejects(state.actions.login('qa', 'password'), { code: 'session.busy' });
    pending.resolve(response(payload()));
    await first;
    assert.equal(state.requests.length, 1);
});

test('password rotation revalidates identity then updates csrf and permissions', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), response(payload('b')));
    const result = await state.actions.changePassword('old-password', 'new-password');
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
    assert.equal(result.session.csrf, 'b'.repeat(64));
});

test('wrong password keeps existing session and propagates status400', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), response({ detail: 'Wrong password' }, 400));
    await assert.rejects(state.actions.changePassword('old-password', 'new-password'), { status: 400 });
    assert.equal(state.owner.snapshot().status, 'authenticated');
    assert.equal(state.owner.snapshot().session.id, 'a'.repeat(32));
});

test('ambiguous password transport failure blocks further writes until verification', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), () => { throw new Error('lost response'); });
    await assert.rejects(state.actions.changePassword('old-password', 'new-password'), /lost response/);
    assert.equal(state.owner.snapshot().status, 'unavailable');
    await assert.rejects(state.owner.request('/save', { method: 'POST' }), { code: 'session.required' });
});

test('logout succeeds only after server confirmation and reports the former owner', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), response({ success: true }));
    const result = await state.actions.logout();
    assert.equal(result.confirmed, true);
    assert.equal(result.userId, 7);
    assert.equal(state.owner.snapshot().status, 'anonymous');
});

test('logout retains cross-tab mutation lock until confirmed cleanup completes', async () => {
    const state = harness();
    state.owner.replace(payload(), state.owner.snapshot().revision);
    state.queue.push(response(payload()), response({ success: true }));
    const cleanup = deferred();
    let confirmation;
    const logout = state.actions.logout(value => { confirmation = value; return cleanup.promise; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirmation.userId, 7);
    assert.equal(state.owner.snapshot().status, 'anonymous');
    assert.equal(state.actions.isPending(), true);
    let nextEntered = false;
    const next = state.locks.request('qlpk:browser-session-mutation', { mode: 'exclusive' }, () => { nextEntered = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nextEntered, false);
    cleanup.resolve();
    await logout;
    await next;
    assert.equal(nextEntered, true);
});

test('logout503 keeps session and never returns cleanup confirmation', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), response({ detail: 'outage' }, 503));
    await assert.rejects(state.actions.logout(), { status: 503 });
    assert.equal(state.owner.snapshot().status, 'authenticated');
    assert.equal(state.messages.length, 0);
});

test('lost logout response can be resolved by explicit server401 bootstrap', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response({}, 401));
    assert.equal((await state.actions.logout()).confirmed, true);
    assert.equal(state.requests.length, 1);
});

test('queued logout never revokes another session established by another tab', async () => {
    const locks = lockManager(), wait = deferred();
    const blocker = locks.request('qlpk:browser-session-mutation', { mode: 'exclusive' }, () => wait.promise);
    const state = harness(locks);
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload('b')));
    const logout = state.actions.logout();
    wait.resolve();
    await blocker;
    await assert.rejects(logout, { code: 'session.changed' });
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].input.endsWith('/auth/session'), true);
});

test('cross-tab mutations share one Web Lock and do not overlap responses', async () => {
    const locks = lockManager(), first = harness(locks), second = harness(locks), wait = deferred();
    first.queue.push(wait.promise);
    second.queue.push(response(payload('b')));
    const login1 = first.actions.login('qa', 'password');
    const login2 = second.actions.login('qa', 'password');
    await Promise.resolve();
    assert.equal(first.requests.length, 1);
    assert.equal(second.requests.length, 0);
    wait.resolve(response(payload()));
    await Promise.all([login1, login2]);
    assert.equal(second.requests.length, 1);
    assert.equal(new Set(locks.names).size, 1);
});

test('no Web Locks fails closed instead of using unsafe memory fallback', async () => {
    const state = harness(null);
    await assert.rejects(state.actions.login('qa', 'password'), { code: 'session.lock_unavailable' });
    assert.equal(state.requests.length, 0);
});

test('invalid input fails before lock or request', async () => {
    const state = harness();
    await assert.rejects(state.actions.login('', 'password'), { code: 'session.invalid_input' });
    await assert.rejects(state.actions.changePassword('old', 'short'), { code: 'session.invalid_input' });
    assert.equal(state.locks.names.length, 0);
});

test('logout200 without explicit success does not authorize draft cleanup', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    state.queue.push(response(payload()), response({ detail: 'not confirmed' }));
    await assert.rejects(state.actions.logout(), { code: 'session.invalid_response' });
    assert.equal(state.owner.snapshot().status, 'authenticated');
    assert.equal(state.messages.length, 0);
});

test('logout JSON arriving after an identity change cannot clear the new session', async () => {
    const state = harness();
    state.owner.replace(payload(), 0);
    const body = deferred(), parsing = deferred();
    state.queue.push(response(payload()), { ok: true, status: 200, json() { parsing.resolve(); return body.promise; } });
    const logout = state.actions.logout();
    await parsing.promise;
    state.owner.replace(payload('b'), state.owner.snapshot().revision);
    body.resolve({ success: true });
    await assert.rejects(logout, { code: 'session.changed' });
    assert.equal(state.owner.snapshot().session.id, 'b'.repeat(32));
});
