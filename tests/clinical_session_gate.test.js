const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource, readPageModulesSource } = require('./helpers/module-source');

const runtimeFiles = [
    ['components/page-core-utils.js', 'ClinicalPageCoreUtils'],
    ['receptionist/page-core-utils.js', 'ReceptionistPageCoreUtils'],
    ['doctor-examination/page-runtime.js', 'QLPKDoctorPageRuntime'],
];

function harness({ cookie = true, token = 'stale-token' } = {}) {
    const requests = [], responses = [], messages = [];
    const local = new Map(token ? [['qlpk_token', token]] : []);
    const sessionStorage = new Map();
    const window = {
        navigator: {},
        document: { baseURI: 'https://clinic.test/' },
        location: { origin: 'https://clinic.test', href: 'https://clinic.test/doctor-examination' },
        localStorage: { getItem: key => local.get(key), removeItem: key => local.delete(key) },
        sessionStorage: { getItem: key => sessionStorage.get(key) },
        QLPKUserFeedback: { show: (...args) => messages.push(args) },
        fetch: async (url, init) => {
            requests.push({ url, init });
            assert.ok(responses.length, 'unexpected fetch');
            return responses.shift();
        },
    };
    const context = vm.createContext({ window, document: window.document, Headers, URL, AbortController, console });
    for (const file of ['shared/api-transport.js', 'shared/browser-session.js', 'shared/browser-session-actions.js', ...runtimeFiles.map(item => item[0])]) {
        runScriptFile(`app/static/js/${file}`, context);
    }
    const transport = window.QLPKApiTransport;
    const binding = cookie ? transport.useCookieSession() : null;
    return { window, transport, binding, local, sessionStorage, requests, responses, messages };
}

function payload() {
    return { token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'b'.repeat(64),
        user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } };
}

for (const [file, name] of runtimeFiles) {
    test(`${file}: chờ bootstrap cookie, bỏ token cũ, API dùng session/CSRF`, async () => {
        const state = harness();
        let resolveBootstrap;
        state.responses.push(new Promise(resolve => { resolveBootstrap = resolve; }));
        const runtime = state.window[name];
        let settled = false;
        const checking = runtime.ensureSession().then(result => { settled = true; return result; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false);
        assert.notEqual(state.window.location.href, '/login');
        assert.equal(runtime.getAuthHeader(), null);
        resolveBootstrap(new Response(JSON.stringify(payload())));
        assert.equal(await checking, true);
        state.responses.push(new Response('{}'));
        await runtime.apiCall('/api/example', { method: 'POST', body: '{}' });
        const headers = new Headers(state.requests[1].init.headers);
        assert.equal(headers.has('Authorization'), false);
        assert.equal(headers.get('X-CSRF-Token'), 'b'.repeat(64));
        assert.equal(headers.get('X-QLPK-Session-Id'), 'a'.repeat(32));
        assert.equal(state.requests[1].init.body, '{}');
    });

    test(`${file}: phản hồi API cũ bị chặn sau đổi phiên`, async () => {
        const state = harness();
        state.binding.owner.replace(payload(), 0);
        let finish;
        state.responses.push(new Promise(resolve => { finish = resolve; }));
        const pending = state.window[name].apiCall('/api/example');
        await new Promise(resolve => setImmediate(resolve));
        state.binding.owner.invalidate('changed');
        finish(new Response('{}'));
        await assert.rejects(pending, { code: 'session.changed' });
    });
}

for (const status of [401, 503]) {
    test(`bootstrap ${status}: không dùng token cũ, không khởi tạo trang`, async () => {
        const state = harness();
        state.responses.push(new Response('{}', { status }));
        let initialized = false;
        const result = await state.window.ClinicalPageCoreUtils.initializeExaminationPageBootstrap({
            initializePage: () => { initialized = true; },
        });
        assert.equal(result.status, 'sessionBlocked');
        assert.equal(initialized, false);
        assert.equal(state.requests.length, 1);
        assert.equal(state.window.location.href === '/login', status === 401);
        assert.equal(state.messages.length, status === 503 ? 1 : 0);
    });
}

test('đổi phiên trong bootstrap không mở trang hoặc tự bootstrap lại', async () => {
    const state = harness();
    let finish;
    state.responses.push(new Promise(resolve => { finish = resolve; }));
    const pending = state.transport.ensureSession();
    await new Promise(resolve => setImmediate(resolve));
    state.binding.owner.invalidate('changed');
    finish(new Response(JSON.stringify(payload())));
    assert.equal(await pending, false);
    assert.equal(await state.transport.ensureSession(), false);
    assert.equal(state.requests.length, 1);
    assert.notEqual(state.window.location.href, '/login');
});

for (const raw of ['qa-token', 'Bearer qa-token', '{"access_token":"qa-token"}', '{"Authorization":"Bearer qa-token"}']) {
    test(`legacy chuẩn hóa định dạng token: ${raw}`, async () => {
        const state = harness({ cookie: false, token: raw });
        assert.equal(await state.transport.ensureSession(), true);
        for (const [, name] of runtimeFiles) assert.equal(state.window[name].getAuthHeader(), 'Bearer qa-token');
        state.responses.push(new Response('{}'));
        await state.window.QLPKDoctorPageRuntime.apiCall('/api/example');
        assert.equal(new Headers(state.requests[0].init.headers).get('Authorization'), 'Bearer qa-token');
    });
}

test('legacy alias/storage fallback và thiếu credential dùng cùng một owner', async () => {
    const state = harness({ cookie: false, token: null });
    state.sessionStorage.set('token', 'session-token');
    assert.equal(await state.transport.ensureSession(), true);
    assert.equal(state.transport.getAuthHeader(), 'Bearer session-token');
    state.local.set('token', 'local-alias');
    assert.equal(state.transport.getAuthHeader(), 'Bearer local-alias');
    state.local.clear();
    state.sessionStorage.clear();
    assert.equal(await state.transport.ensureSession(), false);
    assert.equal(state.window.location.href, '/login');
});

test('các entry page await gate, không dùng Promise như boolean', () => {
    const doctor = readScriptSource('app/static/js/doctor-examination.js');
    const receptionist = readPageModulesSource();
    const psychologist = fs.readFileSync('app/static/js/psychologist-examination.js', 'utf8');
    assert.match(doctor, /DOMContentLoaded', async \(\) => \{\s*if \(!await ensureSession\(\)\) return;/);
    assert.match(doctor, /async function loadAppointments[\s\S]*?if \(!await ensureSession\(\)\) return null;/);
    assert.match(receptionist, /DOMContentLoaded', async function \(\) \{\s*if \(!await ensureSession\(\)\) return;/);
    assert.match(psychologist, /const bootstrapResult = await window.ClinicalPageCoreUtils.initializeExaminationPageBootstrap/);
});
