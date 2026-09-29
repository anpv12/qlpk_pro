const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function harness(cookie = true) {
    const requests = [], responses = [], messages = [], applied = [];
    const select = { value: '2', children: [], replaceChildren(...children) { this.children = children; }, appendChild(child) { this.children.push(child); } };
    const document = { baseURI: 'https://clinic.test/', getElementById: () => select, createElement: () => ({}) };
    const window = {
        document, navigator: {}, AbortSignal,
        location: { origin: 'https://clinic.test', href: 'https://clinic.test/receptionist-new.html' },
        localStorage: { getItem: key => key === 'qlpk_token' ? 'legacy' : null, removeItem() {} },
        QLPKUserFeedback: { show: (...args) => messages.push(args) },
        ReceptionistServicePackage: { initServiceAutocomplete: (...args) => applied.push(args[3]) },
        fetch: async (url, init) => {
            requests.push({ url, init });
            assert.ok(responses.length, 'unexpected retry');
            return responses.shift();
        },
    };
    const context = vm.createContext({ window, document, Headers, URL, AbortController, console });
    for (const file of ['shared/api-transport', 'shared/browser-session', 'shared/browser-session-actions', 'receptionist/catalog-loaders']) {
        runScriptFile(`app/static/js/${file}.js`, context);
    }
    const binding = cookie ? window.QLPKApiTransport.useCookieSession() : null;
    if (binding) binding.owner.replace({ token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'b'.repeat(64),
        user: { id: 7, username: 'qa', role: 'receptionist', permissions: [] } }, 0);
    return { window, select, binding, requests, responses, messages, applied, loaders: window.ReceptionistCatalogLoaders };
}

for (const cookie of [true, false]) {
    test(`catalogs ${cookie ? 'cookie' : 'legacy'} preserve routes and selection, literal doctor name`, async () => {
        const state = harness(cookie);
        const doctors = [{ id: 2, name: '<img src=x onerror=alert(1)>' }];
        state.responses.push(new Response(JSON.stringify(doctors)), new Response('[]'));
        let saved;
        assert.equal(await state.loaders.loadDoctorsForForm({ setDoctors: data => { saved = data; } }), true);
        assert.equal(saved[0].id, 2);
        assert.equal(state.select.children[1].textContent, doctors[0].name);
        assert.equal(state.select.children[1].innerHTML, undefined);
        assert.equal(state.select.value, '2');
        assert.equal(await state.loaders.loadServicesForForm(), true);
        assert.deepEqual(state.requests.map(item => item.url), ['/users/doctors', '/services']);
        for (const request of state.requests) {
            const headers = new Headers(request.init.headers);
            assert.equal(headers.get('Authorization'), cookie ? null : 'Bearer legacy');
            assert.equal(headers.get('X-QLPK-Session-Id'), cookie ? 'a'.repeat(32) : null);
            assert.ok(request.init.signal);
        }
    });
}

for (const method of ['loadDoctorsForForm', 'loadServicesForForm']) {
    test(`${method}: latest response wins`, async () => {
        const state = harness();
        let finish;
        state.responses.push(new Promise(resolve => { finish = resolve; }), new Response('[{"id":2,"name":"new"}]'));
        const values = [];
        const options = { setDoctors: data => values.push(data), setServices: data => values.push(data) };
        const old = state.loaders[method](options);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(await state.loaders[method](options), true);
        finish(new Response('[{"id":1,"name":"old"}]'));
        assert.equal(await old, false);
        assert.equal(values.length, 1);
        assert.equal(values[0][0].name, 'new');
        assert.equal(state.messages.length, 0);
    });
    test(`${method}: session changes during JSON never updates cache/DOM`, async () => {
        const state = harness();
        let finish;
        const body = new Promise(resolve => { finish = resolve; });
        state.responses.push({ ok: true, json: () => body });
        let updates = 0;
        const pending = state.loaders[method]({ setDoctors: () => updates++, setServices: () => updates++ });
        await new Promise(resolve => setImmediate(resolve));
        state.binding.owner.invalidate('changed');
        finish([{ id: 1, name: 'old' }]);
        assert.equal(await pending, false);
        assert.equal(updates, 0);
        assert.equal(state.applied.length, 0);
        assert.equal(state.select.children.length, 0);
    });
    for (const failure of ['401', '503', 'network', 'invalid']) {
        test(`${method}: ${failure} returns failure without retry or redirect`, async () => {
            const state = harness();
            state.responses.push(failure === 'network' ? Promise.reject(new Error('network'))
                : new Response(failure === 'invalid' ? '{}' : '[]', { status: Number(failure) || 200 }));
            assert.equal(await state.loaders[method](), false);
            assert.equal(state.requests.length, 1);
            assert.equal(state.messages.length, 1);
            assert.ok(state.window.location.href.endsWith('/receptionist-new.html'));
        });
    }
}

test('missing doctor selector does not schedule endless retry', async () => {
    const state = harness();
    state.window.document.getElementById = () => null;
    assert.equal(await state.loaders.loadDoctorsForForm(), false);
    assert.equal(state.requests.length, 0);
});
