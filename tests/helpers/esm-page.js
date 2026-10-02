'use strict';
// Loads an ES module page entry into a fresh fake DOM. Each call re-evaluates the entry (a unique
// query string defeats the ESM cache) so page-level state never leaks between tests; shared
// dependency modules stay cached but read window/document at call time.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installDom, Event } = require('./fake-dom');
require('./esm-stubs');

const JS_ROOT = path.join(__dirname, '..', '..', 'app', 'static', 'js');
let sequence = 0;

// Deferred fake fetch: every call is recorded and answered by the test with respond()/fail().
function fetchRecorder(window) {
    const requests = [];
    window.fetch = (url, init = {}) => new Promise((resolve, reject) => {
        const headers = new Headers(init.headers);
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        requests.push({ url, init, headers, body, fail: reject, signal: init.signal,
            respond: (status, data, responseHeaders = {}) => resolve(new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: responseHeaders })) });
    });
    globalThis.fetch = window.fetch;
    return requests;
}

// The entry's leading side-effect imports (shared page runtime: sidebar, pagination, dialogs…), evaluated before a
// test installs its stubs so a stub is not overwritten when such a module first runs.
async function importSharedRuntime(entry) {
    const source = fs.readFileSync(path.join(JS_ROOT, entry), 'utf8');
    for (const [, spec] of source.matchAll(/^import '(\.{1,2}\/[^']+)';$/gm)) {
        await import(pathToFileURL(path.join(JS_ROOT, path.dirname(entry), spec)).href);
    }
}

async function loadPage(entry, { html = '', url, before } = {}) {
    const window = installDom({ html, url });
    const requests = fetchRecorder(window);
    await importSharedRuntime(entry);
    if (before) before(window);
    const module = await import(`${pathToFileURL(path.join(JS_ROOT, entry)).href}?case=${++sequence}`);
    return { window, document: window.document, requests, module };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Manual timers for window.setTimeout/clearTimeout: tick(delay) fires every pending timer with that delay.
function manualTimers(window) {
    const timers = new Map();
    let next = 0;
    window.setTimeout = (fn, delay) => { timers.set(++next, { fn, delay }); return next; };
    window.clearTimeout = id => timers.delete(id);
    return async delay => {
        for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
        await flush();
    };
}

function submit(form) {
    form.dispatchEvent(new Event('submit'));
}

module.exports = { loadPage, flush, submit, manualTimers, Event };
