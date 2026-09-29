const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function harness(cookie = true) {
    const requests = [], responses = [], opened = [], messages = [];
    let patientId = 7, contextToken = 1;
    const actions = {};
    const component = {
        state: { safetyPlan: { familyMembers: [] }, icdLookup: {} },
        config: { getPatientId: () => patientId },
        getContextToken: () => contextToken,
        registerActions: values => Object.assign(actions, values),
        getAction: name => actions[name],
        getElement: () => null,
        getFeature: () => null,
        query: () => null,
        queryAll: () => [],
    };
    const window = {
        navigator: {},
        document: { baseURI: 'https://clinic.test/' },
        location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: key => key === 'qlpk_token' ? 'legacy-token' : null, removeItem() {} },
        fetch: async (url, init) => {
            requests.push({ url, init });
            assert.ok(responses.length, 'unexpected request');
            return responses.shift();
        },
        open: (...args) => opened.push(args),
        QLPKUserFeedback: { show: (...args) => messages.push(args) },
        QLPKDoctorModuleRegistry: { get: () => ({ getActive: () => component }), require: () => ({ escapeHtml: value => value, escapeAttr: value => value }), register() {} },
    };
    const context = vm.createContext({ window, document: window.document, console, Headers, URL, AbortController, FormData,
        setTimeout: () => 1, fetch: (...args) => window.fetch(...args) });
    for (const file of ['shared/api-transport', 'shared/browser-session', 'shared/browser-session-actions', 'doctor-examination/page-runtime']) {
        runScriptFile(`app/static/js/${file}.js`, context);
    }
    component.config.pageRuntime = window.QLPKDoctorPageRuntime;
    const binding = cookie ? window.QLPKApiTransport.useCookieSession() : null;
    if (binding) binding.owner.replace({ token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'b'.repeat(64),
        user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } }, 0);
    const base = 'app/static/js/doctor-examination/';
    const shared = fs.readFileSync(base + 'medical-history-context.js', 'utf8')
        .replace(/export \{([\s\S]*?)\};/, 'window.historyContext = {$1};');
    vm.runInContext(`{ ${shared} }`, context);
    for (const file of ['medical-history-core', 'medical-history-suggestions', 'medical-history-allergy', 'safety-plan']) {
        const source = fs.readFileSync(base + file + '.js', 'utf8').replace(
            /import \{([\s\S]*?)\} from '\.\/medical-history-context.js';/,
            (_, imports) => `const {${imports.replace(/\bas\b/g, ':')}} = window.historyContext;`);
        vm.runInContext(`{ ${source} }`, context);
    }
    return { requests, responses, opened, messages, actions, component, binding,
        switchPatient() { patientId = 8; contextToken++; } };
}

for (const cookie of [true, false]) {
    test(`history ICD/supporters/upload dùng canonical ${cookie ? 'cookie' : 'legacy'} transport`, async () => {
        const state = harness(cookie);
        const row = { id: 10, icd_code: 'I10', disease_name: 'Tăng huyết áp' };
        state.responses.push(new Response(JSON.stringify({ data: [row] })));
        const found = await state.actions.getIcdObject('i10');
        assert.deepEqual({ ...found }, row);
        state.responses.push(new Response(JSON.stringify({ data: [row] })));
        await state.actions.loadAllIcds();
        assert.equal(state.component.state.icdLookup.I10.id, 10);
        state.responses.push(new Response(JSON.stringify({ data: [{ id: 2, name: 'QA' }] })));
        assert.equal(await state.actions.loadFamilyMembers(7), true);
        assert.equal(state.component.state.safetyPlan.familyMembers[0].id, 2);
        const dropdown = { innerHTML: '', style: {} };
        state.responses.push(new Response(JSON.stringify({ success: true, data: [] })));
        await state.actions.fetchAllergenSuggestions('', {}, dropdown);
        assert.equal(dropdown.style.display, 'none');
        state.responses.push(new Response('{}', { status: 500 }));
        await state.actions.createAndSelectAllergen('QA', {}, dropdown);
        const allergenRequest = state.requests.at(-1);
        assert.equal(new Headers(allergenRequest.init.headers).get('Content-Type'), 'application/json');
        assert.deepEqual(JSON.parse(allergenRequest.init.body), { ten_di_nguyen: 'QA', mo_ta: '' });
        state.responses.push(new Response(JSON.stringify({ success: true, file_path: 'qa.pdf' })));
        await state.actions.handleUpload({ files: [new Blob(['qa'])], value: 'file' });
        const upload = state.requests.at(-1);
        assert.equal(upload.init.body instanceof FormData, true);
        assert.equal(new Headers(upload.init.headers).has('Content-Type'), false);
        for (const request of state.requests) {
            const headers = new Headers(request.init?.headers);
            assert.equal(headers.get('Authorization'), cookie ? null : 'Bearer legacy-token');
            assert.equal(headers.get('X-QLPK-Session-Id'), cookie ? 'a'.repeat(32) : null);
        }
        assert.equal(new Headers(upload.init.headers).get('X-CSRF-Token'), cookie ? 'b'.repeat(64) : null);
    });
}

for (const action of ['getIcdObject', 'loadAllIcds', 'loadFamilyMembers']) {
    test(`${action}: session invalidation không bị hiểu nhầm là dữ liệu rỗng`, async () => {
        const state = harness();
        state.binding.owner.invalidate('changed');
        await assert.rejects(state.actions[action](action === 'getIcdObject' ? 'I10' : 7), { code: 'session.required' });
        assert.equal(state.requests.length, 0);
    });
}

for (const switchKind of ['patient', 'session']) {
    test(`file body trả muộn sau đổi ${switchKind} không mở tệp cũ`, async () => {
        const state = harness();
        let resolveBlob;
        const blob = new Promise(resolve => { resolveBlob = resolve; });
        state.responses.push({ ok: true, status: 200, blob: () => blob });
        const pending = state.actions.openFile({ preventDefault() {} });
        await new Promise(resolve => setImmediate(resolve));
        if (switchKind === 'patient') state.switchPatient();
        else state.binding.owner.invalidate('changed');
        resolveBlob(new Blob(['old-data']));
        await pending;
        assert.equal(state.opened.length, 0);
        if (switchKind === 'patient') assert.equal(state.messages.length, 0);
    });
}

test('upload thất bại của bệnh nhân cũ không báo lỗi hoặc xóa input bệnh nhân mới', async () => {
    const state = harness();
    let finish;
    state.responses.push(new Promise(resolve => { finish = resolve; }));
    const input = { files: [new Blob(['qa'])], value: 'old-file' };
    const pending = state.actions.handleUpload(input);
    await new Promise(resolve => setImmediate(resolve));
    state.switchPatient();
    input.value = 'new-file';
    finish(new Response('{}', { status: 500 }));
    await pending;
    assert.equal(input.value, 'new-file');
    assert.equal(state.messages.length, 0);
});
