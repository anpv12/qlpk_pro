const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createWindow } = require('./helpers/fake-dom');
const { runScriptFile } = require('./helpers/module-source');

function harness(cookie = true) {
    const requests = [], responses = [], effects = [];
    const { document } = createWindow({ html: '<div id="relatives"></div>', url: 'https://clinic.test/' });
    const createNode = document.createElement.bind(document);
    // Download links are observed; every other element is a real fake-DOM node.
    document.createElement = tag => (tag === 'a' ? { click: () => effects.push('download'), remove() {} } : createNode(tag));
    document.body.appendChild = node => node;
    const window = {
        document, navigator: {}, FormData,
        location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: key => key === 'qlpk_token' ? 'legacy' : null, removeItem() {} },
        getAuthHeader: () => { throw new Error('private auth must not run'); },
        open: () => { effects.push('preview'); return {}; }, setTimeout: () => 1,
        URL: { createObjectURL: () => 'blob:qa', revokeObjectURL() {} },
        fetch: async (url, init) => {
            requests.push({ url, init });
            assert.ok(responses.length, 'unexpected request');
            return responses.shift();
        },
    };
    const context = vm.createContext({ window, document, Headers, URL, AbortController, FormData, console,
        fetch: (...args) => window.fetch(...args) });
    for (const file of ['shared/api-transport', 'shared/browser-session', 'shared/browser-session-actions', 'relative-table',
        'components/modal-patient-search-data', 'receptionist/document-attachment-utils', 'components/document-section-ui-utils']) {
        runScriptFile(`app/static/js/${file}.js`, context);
    }
    const binding = cookie ? window.QLPKApiTransport.useCookieSession() : null;
    if (binding) binding.owner.replace({ token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'b'.repeat(64),
        user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } }, 0);
    const options = { getAuthHeader: window.getAuthHeader, showToast: type => effects.push(type) };
    return { window, requests, responses, effects, options, binding };
}

for (const cookie of [true, false]) {
    test(`shared relatives and attachments ${cookie ? 'cookie' : 'legacy'}: no private headers, correct bodies`, async () => {
        const state = harness(cookie);
        state.responses.push(new Response('{"data":[{"id":2}]}'));
        const relatives = await state.window.ModalPatientSearchData.fetchAppointmentRelatives(7, {
            getToken: () => { throw new Error('private token must not run'); },
        });
        assert.equal(relatives.data[0].id, 2);
        const table = state.window.RelativeTableManager.init('#relatives');
        state.responses.push(new Response('{"success":true,"data":{"id":2}}'));
        assert.equal((await table.request('/api/family-members', { method: 'POST', body: '{"patient_id":7}' })).data.id, 2);
        const file = new Blob(['qa'], { type: 'application/pdf' });
        state.responses.push(new Response('{"id":4}'));
        assert.equal((await state.window.ReceptionistDocumentAttachmentUtils.uploadFile(file, 7, state.options)).id, 4);
        state.responses.push(new Response('{"id":5}'));
        assert.equal(await state.window.ClinicalDocumentSectionUiUtils.uploadFileToPatient(file, 7, state.options), true);
        state.responses.push(new Response('qa file'));
        await state.window.ReceptionistDocumentAttachmentUtils.openAttachmentPreviewInNewTab(4, 'qa.pdf', state.options);
        state.responses.push(new Response('qa file'));
        await state.window.ReceptionistDocumentAttachmentUtils.downloadAttachmentWithAuth(4, 'qa.pdf', state.options);
        assert.ok(state.effects.includes('preview'));
        assert.ok(state.effects.includes('download'));
        assert.equal(state.requests.length, 6);
        for (const request of state.requests) {
            const headers = new Headers(request.init?.headers);
            assert.equal(headers.get('Authorization'), cookie ? null : 'Bearer legacy');
            if (request.init?.method === 'POST') assert.equal(headers.get('X-CSRF-Token'), cookie ? 'b'.repeat(64) : null);
            if (request.init?.body instanceof FormData) assert.equal(headers.has('Content-Type'), false);
        }
    });
}

for (const action of ['openAttachmentPreviewInNewTab', 'downloadAttachmentWithAuth']) {
    test(`${action}: patient changes while blob pending suppresses side effects`, async () => {
        const state = harness();
        let current = true, finish;
        const body = new Promise(resolve => { finish = resolve; });
        state.responses.push({ ok: true, blob: () => body });
        const pending = state.window.ReceptionistDocumentAttachmentUtils[action](4, 'qa.pdf', {
            ...state.options, isCurrentContext: () => current,
        });
        await new Promise(resolve => setImmediate(resolve));
        current = false;
        finish(new Blob(['old patient']));
        await pending;
        assert.deepEqual(state.effects, []);
    });
}

test('upload JSON invalidated after HTTP200 cannot become successful upload', async () => {
    const state = harness();
    let finish;
    const body = new Promise(resolve => { finish = resolve; });
    state.responses.push({ ok: true, json: () => body });
    const pending = state.window.ReceptionistDocumentAttachmentUtils.uploadFile(new Blob(['qa'], { type: 'application/pdf' }), 7, state.options);
    await new Promise(resolve => setImmediate(resolve));
    state.binding.owner.invalidate('changed');
    finish({ id: 4 });
    assert.equal(await pending, false);
    assert.equal(state.effects.includes('success'), false);
});

test('patient modal does not reconstruct fallback patient on session error', async () => {
    const state = harness();
    state.binding.owner.invalidate('changed');
    await assert.rejects(state.window.ModalPatientSearchData.loadPatientForAppointment({ patient_id: 7 }, {
        apiCall: (...args) => state.window.fetch(...args),
    }), { code: 'session.required' });
});

test('preview422 fallback carries context guard and does not download after switch', async () => {
    const state = harness();
    let current = true, finish;
    state.responses.push(new Response('', { status: 422 }), new Promise(resolve => { finish = resolve; }));
    const pending = state.window.ReceptionistDocumentAttachmentUtils.openAttachmentPreviewInNewTab(4, 'qa.pdf', {
        ...state.options, isCurrentContext: () => current,
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.requests.length, 2);
    current = false;
    finish(new Response('old data'));
    await pending;
    assert.deepEqual(state.effects, []);
});
