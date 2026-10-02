const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function payload(letter = 'a') {
    return { token_type: 'cookie', session_id: letter.repeat(32), csrf_token: letter.repeat(64),
        user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } };
}

function harness(options = {}) {
    const requests = [], queue = [];
    const storage = new Map([['qlpk_token', 'legacy-token']]);
    const window = { console, document: { baseURI: 'https://qa.test/' }, location: { origin: 'https://qa.test', href: 'https://qa.test/' },
        navigator: { locks: { request: async (name, options, action) => action() } },
        localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
        fetch: async (input, init) => {
            requests.push({ input, init });
            const response = queue.shift();
            if (!response) throw new Error('Unexpected network request');
            return response;
        } };
    const context = vm.createContext({ window, document: window.document, Headers, URL, AbortController });
    for (const file of ['api-transport', 'browser-session', 'browser-session-actions']) {
        runScriptFile(`app/static/js/shared/${file}.js`, context);
    }
    const session = window.QLPKApiTransport.useCookieSession(options);
    const authenticate = (letter = 'a') => session.owner.replace(payload(letter), session.owner.snapshot().revision);
    return { window, requests, queue, storage, session, authenticate };
}

test('cookie transport binds exactly one owner without startup requests or recursion', async () => {
    const state = harness();
    assert.equal(state.window.QLPKApiTransport.useCookieSession(), state.session);
    assert.equal(state.requests.length, 0);
    state.queue.push(Response.json(payload()), Response.json({ saved: true }));
    const response = await state.window.fetch('/write', { method: 'POST', body: 'data' });
    assert.deepEqual(await response.json(), { saved: true });
    assert.equal(state.requests.length, 2);
    assert.equal(new URL(state.requests[0].input).pathname, '/auth/session');
    const request = state.requests[1];
    assert.equal(request.init.headers.has('Authorization'), false);
    assert.equal(request.init.headers.get('X-QLPK-Session-Id'), 'a'.repeat(32));
    assert.equal(request.init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
    assert.equal(request.init.credentials, 'same-origin');
    assert.equal(request.init.body, 'data');
});

test('old storage token cannot bypass an anonymous cookie session', async () => {
    const state = harness();
    state.queue.push(new Response('', { status: 401 }));
    await assert.rejects(state.window.fetch('/write', { method: 'POST' }), { code: 'session.required' });
    assert.equal(state.requests.length, 1);
    assert.equal(state.session.owner.snapshot().status, 'anonymous');
});

test('explicit bearer and direct auth mutations fail before network', async () => {
    const state = harness();
    state.authenticate();
    await assert.rejects(state.window.fetch('/api/data', { headers: { Authorization: 'Bearer old' } }), { code: 'session.legacy_auth' });
    for (const [path, method] of [['/auth/login', 'POST'], ['/auth/logout', 'POST'], ['/users/me/password', 'PUT']]) {
        await assert.rejects(state.window.fetch(path, { method }), { code: 'session.action_required' });
    }
    assert.equal(state.requests.length, 0);
});

test('actions bypass API wrapper safely and login uses cookie rather than stored bearer', async () => {
    const state = harness();
    state.queue.push(Response.json(payload()));
    await state.session.actions.login('qa', 'password');
    assert.equal(state.requests.length, 1);
    assert.equal(new Headers(state.requests[0].init.headers).get('X-QLPK-Session'), 'cookie');
    assert.equal(new Headers(state.requests[0].init.headers).has('Authorization'), false);
    assert.equal(state.session.owner.snapshot().status, 'authenticated');
});

test('cookie revision protects delayed body and clone independent of storage', async () => {
    const state = harness();
    state.authenticate();
    state.queue.push(Response.json({ patient: 'old' }));
    const response = await state.window.fetch('/api/patient');
    const clone = response.clone();
    state.authenticate('b');
    await assert.rejects(response.json(), { code: 'session.changed' });
    await assert.rejects(clone.blob(), { code: 'session.changed' });
});

test('static assets and external requests do not bootstrap identity or attach session headers', async () => {
    const state = harness();
    state.queue.push(new Response('asset'), new Response('outside'));
    assert.equal(await (await state.window.fetch('/static/header.html')).text(), 'asset');
    assert.equal(await (await state.window.fetch('https://outside.test/data')).text(), 'outside');
    assert.equal(state.requests.length, 2);
    for (const request of state.requests) assert.equal(new Headers(request.init?.headers).has('X-CSRF-Token'), false);
    assert.equal(state.session.owner.snapshot().status, 'unknown');
});

test('cookie401 expires the owner and never replays the write', async () => {
    const state = harness();
    state.authenticate();
    state.queue.push(new Response('', { status: 401 }));
    await assert.rejects(state.window.fetch('/write', { method: 'POST' }), { code: 'session.changed' });
    assert.equal(state.session.owner.snapshot().status, 'expired');
    assert.equal(state.requests.length, 1);
});

test('logout and password rotation use locked actions with native fetch, not recursive wrapper', async () => {
    const state = harness();
    state.authenticate();
    state.queue.push(Response.json(payload()), Response.json(payload('b')));
    await state.session.actions.changePassword('old-password', 'new-password');
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].input, '/users/me/password');
    assert.equal(state.requests[1].init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
    assert.equal(state.session.owner.snapshot().session.id, 'b'.repeat(32));
    state.queue.push(Response.json(payload('b')), Response.json({ success: true }));
    const loggedOut = await state.session.actions.logout();
    assert.equal(loggedOut.confirmed, true);
    assert.equal(state.session.owner.snapshot().status, 'anonymous');
    assert.equal(state.requests.length, 4);
    assert.equal(state.requests[3].init.headers.get('X-CSRF-Token'), 'b'.repeat(64));
});

test('public page sends anonymous requests without session headers when nobody is signed in', async () => {
    const state = harness({ allowAnonymous: true });
    state.queue.push(new Response('{}', { status: 401 }), Response.json({ success: true }));
    const response = await state.window.fetch('/api/public/prescription/RX-1');
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(state.requests.length, 2);
    const sent = new Headers(state.requests[1].init.headers);
    assert.equal(sent.has('X-QLPK-Session-Id'), false);
    assert.equal(sent.has('Authorization'), false);
    assert.equal(state.requests[1].init.credentials, 'same-origin');
});

test('public page still attaches the session when a user is signed in', async () => {
    const state = harness({ allowAnonymous: true });
    state.queue.push(Response.json(payload()), Response.json({ ok: 1 }));
    await state.window.fetch('/api/survey-responses/public', { method: 'POST', body: '{}' });
    const sent = new Headers(state.requests[1].init.headers);
    assert.equal(sent.get('X-QLPK-Session-Id'), 'a'.repeat(32));
    assert.equal(sent.get('X-CSRF-Token'), 'a'.repeat(64));
});

test('non-public pages keep failing closed without a session', async () => {
    const state = harness();
    state.queue.push(new Response('{}', { status: 401 }));
    await assert.rejects(state.window.fetch('/api/public/prescription/RX-1'), error => error.code === 'session.required');
    assert.equal(state.requests.length, 1);
});
