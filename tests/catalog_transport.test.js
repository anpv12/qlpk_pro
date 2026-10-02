const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

const files = ['occupation-autocomplete', 'components/icd-data-loader'];

function harness(cookie) {
    const requests = [];
    const window = { location: { href: 'https://clinic.test/', origin: 'https://clinic.test' }, navigator: {},
        localStorage: { getItem: () => 'legacy-token' },
        fetch: async (url, options) => {
            requests.push({ url, options });
            const created = options?.method === 'POST';
            return Response.json({ success: true, data: created ? { id: 2, name: 'New occupation' }
                : [{ id: 1, code: '01', name: 'Catalog name', icd_code: 'A00', disease_name: 'Disease' }] });
        } };
    const document = { baseURI: window.location.href, getElementById: () => null, addEventListener() {} };
    window.document = document;
    const context = vm.createContext({ window, document, Headers, URL, Event, console: { error() {} } });
    for (const file of ['shared/api-transport', 'shared/browser-session', 'shared/browser-session-actions']) {
        runScriptFile(`app/static/js/${file}.js`, context);
    }
    if (cookie) {
        const session = window.QLPKApiTransport.useCookieSession();
        session.owner.replace({ token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'a'.repeat(64),
            user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } }, 0);
    }
    context.fetch = window.fetch;
    for (const file of files) runScriptFile(`app/static/js/${file}.js`, context);
    return { window, requests };
}

for (const cookie of [false, true]) {
    test(`${cookie ? 'cookie' : 'legacy'} shared catalogs use canonical transport for reads and writes`, async () => {
        const { window, requests } = harness(cookie);
        const input = { value: '', dataset: {}, dispatchEvent() {} };
        const occupation = { occupations: [], input, hideDropdown() {} };
        await window.OccupationAutocomplete.prototype.loadOccupations.call(occupation);
        await window.OccupationAutocomplete.prototype.createNewOccupation.call(occupation, 'New occupation');
        assert.equal(occupation.occupations.length, 2);
        const page = await window.ClinicalIcdDataLoader.loadICDPage('disease', {
            getAuthHeader() { throw new Error('Legacy callback must not run'); }
        });
        assert.equal(page.data[0].icd_code, 'A00');
        assert.equal(requests.length, 3);
        for (const { options } of requests) {
            const headers = new Headers(options?.headers);
            assert.equal(headers.get('Authorization'), cookie ? null : 'Bearer legacy-token');
            if (cookie) assert.equal(headers.get('X-QLPK-Session-Id'), 'a'.repeat(32));
            if (cookie && options.method === 'POST') assert.equal(headers.get('X-CSRF-Token'), 'a'.repeat(64));
            if (options.method === 'POST') assert.deepEqual(JSON.parse(options.body), { name: 'New occupation' });
        }
    });
}

test('ICD does not convert changed-session errors into a successful empty list', async () => {
    const { window } = harness(true);
    window.QLPKApiTransport.session.owner.invalidate('changed');
    await assert.rejects(window.ClinicalIcdDataLoader.loadICDPage(''), { code: 'session.required' });
});

test('shared catalog callers do not own credentials', () => {
    for (const file of files) assert.doesNotMatch(fs.readFileSync(`app/static/js/${file}.js`, 'utf8'), /qlpk_token|Authorization|Bearer /);
});
