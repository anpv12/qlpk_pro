const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function deferred() {
    let resolve, reject;
    const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
    return { promise, resolve, reject };
}

function payload(id = 'a') {
    return { token_type: 'cookie', session_id: id.repeat(32), csrf_token: id.repeat(64), user: { id: 7, username: 'qa', role: 'doctor', permissions: ['qlkham-bs'] } };
}

function response(data = payload(), status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function harness() {
    const requests = [], handlers = new Set(), messages = [];
    const channel = { addEventListener(type, handler) { handlers.add(handler); },
        removeEventListener(type, handler) { handlers.delete(handler); }, postMessage(value) { messages.push(value); } };
    const window = { console, location: { origin: 'https://clinic.test' }, document: { baseURI: 'https://clinic.test/page' },
        fetch(input, init) { const result = deferred(); requests.push({ input, init, ...result }); return result.promise; } };
    const context = vm.createContext({ window, URL, Headers, Promise, console });
    runScriptFile('app/static/js/shared/browser-session.js', context);
    const client = window.QLPKBrowserSession.create({ channel });
    return { client, requests, messages, handlers, window };
}

test('loading the owner does not issue requests or access storage', () => {
    const state = harness();
    assert.equal(state.requests.length, 0);
    assert.equal(state.client.snapshot().status, 'unknown');
});

test('parallel bootstrap is single-flight and retains only allowed identity fields', async () => {
    const state = harness();
    const first = state.client.bootstrap(), second = state.client.bootstrap();
    assert.equal(first, second);
    await Promise.resolve();
    assert.equal(state.requests.length, 1);
    state.requests[0].resolve(response({ ...payload(), access_token: 'must-not-retain' }));
    await first;
    assert.equal(state.client.snapshot().session.id, 'a'.repeat(32));
    assert.equal(JSON.stringify(state.client.snapshot()).includes('must-not-retain'), false);
    assert.equal(state.requests[0].init.credentials, 'same-origin');
});

test('late bootstrap cannot overwrite a newer session', async () => {
    const state = harness();
    const old = state.client.bootstrap();
    await Promise.resolve();
    state.client.replace(payload('b'), 0);
    state.requests[0].resolve(response());
    await assert.rejects(old, { code: 'session.changed' });
    assert.equal(state.client.snapshot().session.id, 'b'.repeat(32));
});

test('network failure blocks writes without erasing existing session identity', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const refresh = state.client.bootstrap();
    await Promise.resolve();
    state.requests[0].reject(new Error('offline'));
    await assert.rejects(refresh, /offline/);
    assert.equal(state.client.snapshot().status, 'unavailable');
    assert.equal(state.client.snapshot().session.id, 'a'.repeat(32));
    await assert.rejects(state.client.request('/save', { method: 'POST' }), { code: 'session.required' });
    assert.equal(state.requests.length, 1);
});

test('bootstrap401 marks anonymous without retry', async () => {
    const state = harness();
    const pending = state.client.bootstrap();
    await Promise.resolve();
    state.requests[0].resolve(response({}, 401));
    await pending;
    assert.equal(state.client.snapshot().status, 'anonymous');
    assert.equal(state.requests.length, 1);
});

test('POST sends session-bound CSRF and does not mutate Request options', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const input = new Request('https://clinic.test/save', { method: 'POST', body: 'draft', headers: { 'X-QA': 'yes' } });
    const init = Object.freeze({ cache: 'force-cache' });
    const pending = state.client.request(input, init);
    await Promise.resolve();
    const sent = state.requests[0];
    assert.equal(sent.input, input);
    assert.equal(sent.init.headers.get('X-CSRF-Token'), 'a'.repeat(64));
    assert.equal(sent.init.headers.get('X-QLPK-Session-Id'), 'a'.repeat(32));
    assert.equal(sent.init.headers.get('X-QA'), 'yes');
    assert.equal(sent.init.headers.has('Authorization'), false);
    assert.equal(sent.init.cache, 'no-store');
    assert.equal(init.cache, 'force-cache');
    assert.equal(await input.text(), 'draft');
    sent.resolve(response({ ok: true }));
    await pending;
});

test('GET sends session identity but not CSRF', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const pending = state.client.request('/read');
    await Promise.resolve();
    assert.equal(state.requests[0].init.headers.has('X-CSRF-Token'), false);
    assert.equal(state.requests[0].init.headers.get('X-QLPK-Session-Id'), 'a'.repeat(32));
    state.requests[0].resolve(response());
    await pending;
});

for (const target of ['https://outside.test/api', '//outside.test/api', 'http://clinic.test/api', 'https://user:pass@clinic.test/api']) {
    test(`external or credential URL is refused: ${target}`, async () => {
        const state = harness();
        await assert.rejects(state.client.request(target), { code: 'session.external_request' });
        assert.equal(state.requests.length, 0);
    });
}

test('Bearer caller cannot silently mix with cookie transport', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    await assert.rejects(state.client.request('/read', { headers: { Authorization: 'Bearer old' } }), { code: 'session.legacy_auth' });
    assert.equal(state.requests.length, 0);
});

test('late successful response is rejected after cross-tab invalidation', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const pending = state.client.requestJSON('/read');
    await Promise.resolve();
    state.handlers.forEach(handler => handler({ data: { type: 'session.changed', session_id: 'untrusted' } }));
    state.requests[0].resolve(response({ patient: 'old' }));
    await assert.rejects(pending, { code: 'session.changed' });
    assert.equal(state.client.snapshot().session, null);
    await assert.rejects(state.client.request('/save', { method: 'POST' }), { code: 'session.required' });
});

test('JSON parsing delay cannot deliver stale data after a session switch', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const pending = state.client.requestJSON('/read');
    await Promise.resolve();
    const body = deferred(), parsing = deferred();
    state.requests[0].resolve({ ok: true, status: 200, json() { parsing.resolve(); return body.promise; } });
    await parsing.promise;
    state.client.replace(payload('b'), state.client.snapshot().revision);
    body.resolve({ privateData: 'old' });
    await assert.rejects(pending, { code: 'session.changed' });
});

test('401 expires current session, never replays the write', async () => {
    const state = harness();
    state.client.replace(payload(), 0);
    const pending = state.client.request('/save', { method: 'POST' });
    await Promise.resolve();
    state.requests[0].resolve(response({}, 401));
    assert.equal((await pending).response.status, 401);
    assert.equal(state.client.snapshot().status, 'expired');
    assert.equal(state.requests.length, 1);
});

test('broadcast carries only invalidation, not identity or CSRF', () => {
    const state = harness();
    state.client.replace(payload(), 0, true);
    assert.equal(JSON.stringify(state.messages), '[{"type":"session.changed"}]');
    state.client.dispose();
    assert.equal(state.handlers.size, 0);
});

test('synchronous fetch exception is recoverable without orphan pending state', async () => {
    const state = harness();
    const client = state.window.QLPKBrowserSession.create({ fetch() { throw new Error('sync failure'); } });
    await assert.rejects(client.bootstrap(), /sync failure/);
    await assert.rejects(client.bootstrap(), /sync failure/);
});

for (const changed of [{ session_id: ['a'.repeat(32)] }, { csrf_token: ['a'.repeat(64)] },
    { user: { id: '7', username: 'qa', role: 'doctor' } }, { user: { id: 7, username: {}, role: 'doctor' } }]) {
    test(`invalid session payload never becomes authenticated: ${JSON.stringify(changed)}`, () => {
        const state = harness();
        assert.throws(() => state.client.replace({ ...payload(), ...changed }, 0), { code: 'session.invalid_response' });
        assert.equal(state.client.snapshot().session, null);
        assert.equal(state.client.snapshot().status, 'unknown');
    });
}
