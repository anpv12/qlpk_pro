const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    const listeners = {}, requests = [], navigations = [];
    let current = { status: 'authenticated', revision: 1, session: { user: { id: 7, role: 'doctor' } } };
    let subscriber;
    let resolve;
    const window = {
        QLPKApiTransport: { session: { owner: {
            snapshot: () => current, ready: async () => current, subscribe: callback => { subscriber = callback; }
        } } },
        QLPKWorkspaceShell: { openHref: path => navigations.push(path) },
        addEventListener: (name, callback) => { listeners[name] = callback; }, clearTimeout() {},
        location: {}
    };
    const document = { addEventListener: (name, callback) => { listeners[name] = callback; }, getElementById: () => null };
    const context = vm.createContext({ window, document, console,
        localStorage: { getItem: () => '{"id":99,"role":"admin"}' },
        fetch: (url, options) => { requests.push({ url, options }); return new Promise(accept => { resolve = accept; }); }
    });
    vm.runInContext(fs.readFileSync('app/static/js/shortcut-manager.js', 'utf8'), context);
    return { window, listeners, requests, navigations,
        respond: () => resolve({ ok: true, json: async () => [{ combo_key: 'Ctrl+K', target_url: '/doctor-examination.html', is_active: true }] }),
        change: () => { current = { status: 'changed', revision: 2, session: null }; subscriber(current); },
        key: () => listeners.keydown({ key: 'k', ctrlKey: true, target: { tagName: 'DIV' }, preventDefault() {} })
    };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('shortcut fetch delegates auth and cached keyboard actions stop on session change', async () => {
    const state = setup();
    const pending = state.window.ShortcutManager.initGlobal();
    await settle();
    state.respond();
    await pending;
    assert.equal(state.requests[0].url, '/api/user-shortcuts');
    assert.equal(state.requests[0].options.headers.Authorization, undefined);
    state.key();
    assert.deepEqual(state.navigations, ['/doctor-examination.html']);
    state.change();
    state.key();
    assert.equal(state.navigations.length, 1);
});

test('late shortcut response after invalidation cannot repopulate keyboard actions', async () => {
    const state = setup();
    const pending = state.window.ShortcutManager.initGlobal();
    await settle();
    state.change();
    state.respond();
    await pending;
    state.key();
    assert.equal(state.navigations.length, 0);
});

test('logout clears keyboard shortcuts even before server owner invalidation', async () => {
    const state = setup();
    const pending = state.window.ShortcutManager.initGlobal();
    await settle(); state.respond(); await pending;
    state.listeners['qlpk:logout:confirmed']({});
    state.key();
    assert.equal(state.navigations.length, 0);
});

test('shortcut owner no longer parses or attaches bearer credentials', () => {
    const source = fs.readFileSync('app/static/js/shortcut-manager.js', 'utf8');
    assert.doesNotMatch(source, /getAuthHeader|Authorization|Bearer |localStorage\.getItem\('(?:qlpk_token|token)'\)/);
});
