const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function setup() {
    const requests = [], listeners = {};
    let current = { status: 'authenticated', revision: 1 };
    let subscriber;
    const window = {
        addEventListener: (name, callback) => { listeners[name] = callback; },
        QLPKApiTransport: { session: { owner: {
            snapshot: () => current, subscribe: callback => { subscriber = callback; }
        } } }
    };
    const document = { readyState: 'loading', addEventListener: (name, callback) => { listeners[name] = callback; } };
    const context = vm.createContext({ window, document, console: { warn() {}, error() {} },
        fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
    runScriptFile('app/static/js/text-expansion.js', context);
    return { window, context, requests, listeners,
        complete(index, data = { bt: 'bình thường' }) { requests[index].resolve({ ok: true, json: async () => ({ success: true, data }) }); },
        change(status = 'changed') { current = { status, revision: current.revision + 1 }; subscriber(current); }
    };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('expansion cache loads through shared fetch without credential gate', async () => {
    const state = setup();
    assert.equal(state.window.textExpansion.isLoaded(), false);
    assert.equal(state.window.textExpansion.getCount(), 0);
    state.complete(0);
    await settle();
    assert.equal(state.requests[0].url, '/api/text-expansions/active');
    assert.equal(state.requests[0].options.headers, undefined);
    assert.equal(state.window.textExpansion.getFullText('bt'), 'bình thường');
    state.change();
    assert.equal(state.window.textExpansion.getCount(), 0);
    assert.equal(state.window.textExpansion.isLoaded(), false);
});

test('pending initial bootstrap may finish but stale pending load cannot restore invalidated cache', async () => {
    const state = setup();
    state.change('loading');
    state.change('authenticated');
    state.complete(0);
    await settle();
    assert.equal(state.window.textExpansion.isLoaded(), true);
    const pending = state.window.textExpansion.refreshTextExpansions();
    state.change();
    state.complete(1, { old: 'old identity' });
    await pending;
    assert.equal(state.window.textExpansion.getCount(), 0);
});

test('management global loader cannot replace runtime cache loader', async () => {
    const state = setup();
    state.complete(0);
    await settle();
    vm.runInContext('function loadTextExpansions() { throw new Error("management loader invoked"); }', state.context);
    const pending = state.window.textExpansion.refreshTextExpansions();
    state.complete(1, { new: 'new text' });
    await pending;
    assert.equal(state.window.textExpansion.getFullText('new'), 'new text');
    assert.equal(state.window.textExpansion.getFullText('bt'), null);
});

test('logout and credential storage changes clear cache, unrelated storage does not', async () => {
    const state = setup();
    state.complete(0);
    await settle();
    state.listeners.storage({ key: 'workspace-tabs' });
    assert.equal(state.window.textExpansion.getCount(), 1);
    state.listeners.storage({ key: 'qlpk_token' });
    assert.equal(state.window.textExpansion.getCount(), 0);
    const pending = state.window.textExpansion.refreshTextExpansions();
    state.complete(1);
    await pending;
    state.listeners['qlpk:logout:confirmed']({});
    assert.equal(state.window.textExpansion.getCount(), 0);
});

test('management and PDF use shared auth and export fetch rather than direct navigation', () => {
    for (const file of ['text-expansion', 'text-expansion-management', 'shared/pdf-preview']) {
        const source = fs.readFileSync(`app/static/js/${file}.js`, 'utf8');
        assert.doesNotMatch(source, /Authorization|Bearer |localStorage\.getItem/);
    }
    const source = fs.readFileSync('app/static/js/text-expansion-management.js', 'utf8');
    assert.match(source, /import \{ requestJson \} from '\.\/shared\/http-json\.js'/);
    assert.doesNotMatch(source, /\$\(|\$\.ajax|jQuery/);
    assert.match(source, /await fetch\('\/api\/text-expansions\/export'\)/);
});
