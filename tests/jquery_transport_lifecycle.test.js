const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
    let token = 'qa', factory;
    const requests = [];
    const window = { location: { origin: 'https://qa.test', href: 'https://qa.test/' },
        localStorage: { getItem: () => token, removeItem() {} },
        fetch(input, init) { return new Promise((resolve, reject) => requests.push({ input, init, resolve, reject })); } };
    vm.runInNewContext(fs.readFileSync('app/static/js/shared/api-transport.js', 'utf8'), {
        window, document: { baseURI: window.location.href }, Headers, URL, AbortController,
    });
    window.QLPKApiTransport.installJQuery({ ajaxTransport(kind, callback) { factory = callback; } });
    function send(extra = {}, headers = {}) {
        const transport = factory({ url: '/api/qa', type: 'POST', dataTypes: ['json'], hasContent: true, data: 'body', ...extra });
        const calls = [];
        const done = new Promise(resolve => transport.send(headers, (...args) => { calls.push(args); resolve(args); }));
        return { transport, done, calls };
    }
    return { requests, send, changeToken() { token = 'other'; } };
}

test('jQuery preserves body, explicit auth, HTTP status and headers for conversion', async () => {
    const state = harness();
    const pending = state.send({}, { Authorization: 'Bearer caller', 'X-Custom': 'value' });
    const request = state.requests[0];
    assert.equal(request.init.headers.get('Authorization'), 'Bearer caller');
    assert.equal(request.init.headers.get('X-Requested-With'), 'XMLHttpRequest');
    assert.equal(request.init.body, 'body');
    request.resolve(new Response('{"detail":"denied"}', { status: 403, headers: { 'Content-Type': 'application/json' } }));
    const result = await pending.done;
    assert.equal(result[0], 403);
    assert.equal(result[2].text, '{"detail":"denied"}');
    assert.match(result[3], /content-type: application\/json/);
    assert.equal(state.requests.length, 1);
});

test('late jQuery payload fails before completion exposes clinical data', async () => {
    const state = harness();
    const pending = state.send();
    state.changeToken();
    state.requests[0].resolve(new Response('{"patient":"previous"}'));
    const result = await pending.done;
    assert.equal(result[0], 0);
    assert.equal(result[1], 'session.changed');
    assert.equal(result[2], undefined);
});

test('jQuery abort cancels fetch and suppresses later completion', async () => {
    const state = harness();
    const pending = state.send();
    pending.transport.abort();
    assert.equal(state.requests[0].init.signal.aborted, true);
    state.requests[0].reject(new Error('aborted'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.calls.length, 0);
});

for (const responseType of ['blob', 'arraybuffer', 'json', 'text']) {
    test(`jQuery responseType ${responseType} retains binary/text contract`, async () => {
        const state = harness();
        const pending = state.send({ xhrFields: { responseType } });
        state.requests[0].resolve(new Response('{"value":1}'));
        const result = await pending.done;
        const value = result[2][responseType === 'text' ? 'text' : 'binary'];
        if (responseType === 'blob') assert.equal(await value.text(), '{"value":1}');
        if (responseType === 'arraybuffer') assert.equal(new TextDecoder().decode(value), '{"value":1}');
        if (responseType === 'json') assert.deepEqual(value, { value: 1 });
        if (responseType === 'text') assert.equal(value, '{"value":1}');
    });
}

test('synchronous jQuery is rejected before any request, not left hanging', async () => {
    const state = harness();
    const result = await state.send({ async: false }).done;
    assert.equal(result[1], 'session.sync_unsupported');
    assert.equal(state.requests.length, 0);
});
