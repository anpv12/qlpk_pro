const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../app/static/js');
const owners = new Set([
    'shared/api-transport.js', 'shared/browser-session.js', 'shared/session-bootstrap.js', 'login.js', 'app-header-loader.js',
    'realtime-client.js', 'app-shell/workspace-tabs.js', 'shortcut-manager.js', 'text-expansion.js',
    'app-version-check.js',
]);

function scripts(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const relative = prefix + entry.name;
        if (entry.isDirectory()) return entry.name === 'vendor' ? [] : scripts(path.join(directory, entry.name), relative + '/');
        return entry.name.endsWith('.js') ? [relative] : [];
    });
}

test('only session owners read stored credentials or build Authorization headers', () => {
    const pattern = /qlpk_token|localStorage\.getItem\(\s*['"](?:token|access_token)['"]|Authorization|Bearer/;
    const offenders = scripts(root).filter(file => !owners.has(file) && !owners.has(file.replace(/-parts\/[^/]+\.js$/, '.js'))
        && pattern.test(fs.readFileSync(path.join(root, file), 'utf8')));
    assert.deepEqual(offenders, []);
});

function loadTransport(window) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/api-transport.js'), 'utf8'), {
        window, document: { baseURI: window.location.href }, Headers, URL, AbortController,
    });
    return window.QLPKApiTransport;
}

function fakeJQuery(installs) {
    return { ajaxTransport(kind, factory) { installs.push({ kind, factory }); } };
}

function legacyWindow(storage) {
    return { location: { origin: 'https://qa.test', href: 'https://qa.test/' },
        localStorage: { getItem: key => storage[key] ?? null, removeItem() {} },
        fetch: () => Promise.resolve(new Response('{}')) };
}

test('jQuery loaded after the transport is routed through it exactly once', () => {
    const installs = [];
    const window = legacyWindow({});
    loadTransport(window);
    const jquery = fakeJQuery(installs);
    window.jQuery = jquery;
    window.jQuery = jquery;
    assert.equal(window.jQuery, jquery);
    assert.equal(installs.length, 1);
    assert.equal(installs[0].kind, '+*');
    window.QLPKApiTransport.installJQuery(jquery);
    assert.equal(installs.length, 1);
    window.jQuery = fakeJQuery(installs);
    assert.equal(installs.length, 2);
});

test('jQuery loaded before the transport is installed immediately', () => {
    const installs = [];
    const window = legacyWindow({});
    window.jQuery = fakeJQuery(installs);
    loadTransport(window);
    assert.equal(installs.length, 1);
});

test('legacy session presence and revision follow the stored credential without exposing it', () => {
    const storage = { qlpk_token: 'first' };
    const transport = loadTransport(legacyWindow(storage));
    assert.equal(transport.hasSession(), true);
    const first = transport.sessionRevision();
    assert.equal(transport.sessionRevision(), first);
    assert.doesNotMatch(first, /first/);
    storage.qlpk_token = 'second';
    assert.notEqual(transport.sessionRevision(), first);
    delete storage.qlpk_token;
    assert.equal(transport.hasSession(), false);
});

test('page requests receive the credential from the transport, not from callers', async () => {
    const sent = [];
    const window = legacyWindow({ qlpk_token: 'owner' });
    window.fetch = (input, init) => {
        sent.push(new Headers(init && init.headers).get('Authorization'));
        return Promise.resolve(new Response('{}'));
    };
    const transport = loadTransport(window);
    await transport.fetch('/api/qa', { headers: { 'Content-Type': 'application/json' } });
    await transport.fetch('https://external.test/api', {});
    assert.deepEqual(sent, ['Bearer owner', null]);
});
