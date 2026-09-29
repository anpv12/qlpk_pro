const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function harness(baseURI = 'https://clinic.test/page') {
    const requests = [], hooks = {}, startup = [];
    const stored = new Map([['qlpk_token', 'qa-token'], ['qlpk_password', 'old-qa-password'], ['qlpk_username', 'qa']]);
    const document = { baseURI };
    const window = { location: { href: 'https://clinic.test/page', origin: 'https://clinic.test' },
        fetch: async (input, init) => { requests.push({ input, init }); return { status: 401 }; } };
    const jquery = target => {
        if (typeof target === 'function') startup.push(target);
        return { ajaxSend(handler) { hooks.send = handler; }, ajaxError(handler) { hooks.error = handler; } };
    };
    jquery.ajax = () => { throw new Error('Unexpected automatic retry'); };
    $.ajaxTransport = (kind, handler) => { hooks.transport = handler; };
    const context = vm.createContext({ window, document, URL, Request, Headers, AbortController, $, localStorage: {
        getItem: key => stored.get(key), removeItem: key => stored.delete(key),
    } });
    function $(target) { return jquery(target); }
    window.localStorage = context.localStorage;
    runScriptFile('app/static/js/shared/api-transport.js', context);
    runScriptFile('app/static/js/utils.js', context);
    return { window, document, hooks, startup, stored, requests, context };
}

for (const target of ['https://outside.test/api', '//outside.test/api', 'http://clinic.test/api',
    'https://clinic.test:444/api', 'https://clinic.test.outside.test/api', 'data:text/plain,hello',
    new URL('https://outside.test/api'), new Request('https://outside.test/api')]) {
    test(`does not attach clinic credentials to ${String(target)}`, async () => {
        const state = harness();
        const init = { headers: { 'X-QA': 'external' } };
        const result = await state.window.fetch(target, init);
        assert.equal(result.status, 401);
        assert.equal(state.requests.length, 1);
        assert.equal(state.requests[0].init, init);
        assert.equal(new Headers(state.requests[0].init.headers).has('Authorization'), false);
    });
}

for (const target of ['/api/save', 'api/save', 'https://clinic.test/api/save', new URL('https://clinic.test/api/save')]) {
    test(`same origin receives token without mutating options: ${target}`, async () => {
        const state = harness();
        const init = Object.freeze({ method: 'POST', body: 'qa', headers: Object.freeze({ 'X-QA': 'one' }) });
        await state.window.fetch(target, init);
        assert.equal(state.requests.length, 1);
        assert.equal(state.requests[0].init.headers.get('Authorization'), 'Bearer qa-token');
        assert.equal(state.requests[0].init.headers.get('X-QA'), 'one');
        assert.equal(state.requests[0].init.body, 'qa');
        assert.equal(Object.hasOwn(init.headers, 'Authorization'), false);
    });
}

test('Request input headers, body and signal remain intact', async () => {
    const state = harness();
    const request = new Request('https://clinic.test/api/save', { method: 'POST', body: 'qa-body', headers: { 'X-QA': 'request' } });
    await state.window.fetch(request);
    assert.equal(state.requests[0].input, request);
    assert.equal(state.requests[0].init.headers.get('X-QA'), 'request');
    assert.equal(request.headers.has('Authorization'), false);
    assert.equal(await request.text(), 'qa-body');
});

test('explicit Authorization is never overwritten in Request or options', async () => {
    const state = harness();
    const request = new Request('https://clinic.test/api/save', { headers: { Authorization: 'Bearer caller-token' } });
    await state.window.fetch(request);
    assert.equal(state.requests[0].init, undefined);
    const init = { headers: { authorization: 'Bearer caller-token' } };
    await state.window.fetch('/api/save', init);
    assert.equal(state.requests[1].init, init);
});

test('external document base cannot redirect relative credentials', async () => {
    const state = harness('https://outside.test/');
    await state.window.fetch('api/save');
    assert.equal(state.requests[0].init, undefined);
});

test('jQuery transport handles only same origin and ordinary data types', () => {
    const state = harness();
    assert.equal(state.hooks.transport({ url: 'https://outside.test/api', dataTypes: ['json'] }), undefined);
    assert.equal(state.hooks.transport({ url: '/script', dataTypes: ['script'] }), undefined);
    assert.equal(state.hooks.transport({ url: '/script', dataTypes: ['jsonp'] }), undefined);
    assert.equal(typeof state.hooks.transport({ url: '/api/save', dataTypes: ['json'] }).send, 'function');
    assert.equal(state.hooks.send, undefined);
    assert.equal(state.hooks.error, undefined);
});

test('no automatic login, refresh, startup request or password retained', async () => {
    const state = harness();
    assert.equal(state.window.autoLogin, undefined);
    assert.equal(state.startup.length, 0);
    assert.equal(state.stored.has('qlpk_password'), false);
    assert.equal(state.stored.has('qlpk_username'), false);
    state.stored.delete('qlpk_token');
    await state.window.fetch('/api/save', { method: 'POST', body: 'qa' });
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].init.headers, undefined);
    assert.equal(state.window.location.href, 'https://clinic.test/page');
});

test('late 401 cannot retry under another account or overwrite its token', async () => {
    const state = harness();
    const response = state.window.fetch('/api/save', { method: 'POST', body: 'qa' });
    state.stored.set('qlpk_token', 'new-account');
    await assert.rejects(response, { code: 'session.changed' });
    assert.equal(state.requests.length, 1);
    assert.equal(state.stored.get('qlpk_token'), 'new-account');
});

test('appointment callers no longer attempt password-based background login', () => {
    const source = ['appointment-management.js', ...fs.readdirSync('app/static/js/appointment-management').filter(name => name.startsWith('page-') && !name.endsWith('-utils.js')).map(name => `appointment-management/${name}`)]
        .map(file => fs.readFileSync(`app/static/js/${file}`, 'utf8')).join('\n');
    assert.doesNotMatch(source, /autoLogin|token\/refresh/);
    assert.match(source, /deferred\.reject\('unauthorized'\)/);
});

test('loading shared transport twice preserves one fetch owner', async () => {
    const state = harness();
    const fetcher = state.window.fetch;
    vm.runInContext(fs.readFileSync('app/static/js/shared/api-transport.js', 'utf8'), state.context);
    assert.equal(state.window.fetch, fetcher);
    await state.window.fetch('/api/load');
    assert.equal(state.requests.length, 1);
});

test('jQuery installation is idempotent for each instance', () => {
    const state = harness();
    let installations = 0;
    const jquery = { ajaxTransport() { installations++; } };
    state.window.QLPKApiTransport.installJQuery(jquery);
    state.window.QLPKApiTransport.installJQuery(jquery);
    assert.equal(installations, 1);
});

test('document management no longer captures a token once at startup', () => {
    for (const name of ['document-management', 'allergen', 'active-ingredient', 'drug-interaction']) {
        assert.doesNotMatch(fs.readFileSync(`app/static/js/${name}.js`, 'utf8'), /qlpk_token|Bearer |Authorization/);
    }
});

test('token changes are applied to the next request, never to an old response', async () => {
    const state = harness();
    await state.window.fetch('/api/first');
    state.stored.set('qlpk_token', 'rotated-token');
    await state.window.fetch('/api/second');
    assert.equal(state.requests[0].init.headers.get('Authorization'), 'Bearer qa-token');
    assert.equal(state.requests[1].init.headers.get('Authorization'), 'Bearer rotated-token');
});

test('late JSON and cloned blob responses cannot cross account switches', async () => {
    const stored = new Map([['qlpk_token', 'first']]);
    let finish;
    const window = { location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: key => stored.get(key), removeItem: key => stored.delete(key) },
        fetch: async () => ({ status: 200, ok: true,
            json: () => new Promise(resolve => { finish = resolve; }),
            clone: () => new Response('protected document') }) };
    const context = vm.createContext({ window, document: { baseURI: window.location.href }, Headers, URL });
    runScriptFile('app/static/js/shared/api-transport.js', context);
    const response = await window.fetch('/api/document');
    const clone = response.clone();
    const json = response.json();
    stored.set('qlpk_token', 'second');
    finish({ patient: 'previous account' });
    await assert.rejects(json, { code: 'session.changed' });
    await assert.rejects(clone.blob(), { code: 'session.changed' });
});

test('native response accessors and body consumption retain their brand', async () => {
    const window = { location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: () => 'token', removeItem() {} },
        fetch: async () => new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }) };
    const context = vm.createContext({ window, document: { baseURI: window.location.href }, Headers, URL });
    runScriptFile('app/static/js/shared/api-transport.js', context);
    const response = await window.fetch('/api/test');
    assert.equal(response.ok, true);
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.clone().text(), '{"ok":true}');
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.bodyUsed, true);
});

test('every template loading utils first loads the canonical transport partial', () => {
    const partial = fs.readFileSync('app/templates/partials/user-feedback-runtime.html', 'utf8');
    assert.match(partial, /shared\/api-transport\.js/);
    for (const filename of fs.readdirSync('app/templates').filter(name => name.endsWith('.html'))) {
        const source = fs.readFileSync(`app/templates/${filename}`, 'utf8');
        if (!source.includes('/static/js/utils.js')) continue;
        assert.ok(source.indexOf("include 'partials/user-feedback-runtime.html'") >= 0, filename);
        assert.ok(source.indexOf("include 'partials/user-feedback-runtime.html'") < source.indexOf('/static/js/utils.js'), filename);
    }
    assert.doesNotMatch(fs.readFileSync('app/static/js/utils.js', 'utf8'), /window\.fetch\s*=|ajaxSend\(/);
});
