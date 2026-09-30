'use strict';
// Loads an ES module page entry into a fresh fake DOM. Each call re-evaluates the entry (a unique
// query string defeats the ESM cache) so page-level state never leaks between tests; shared
// dependency modules stay cached but read window/document at call time.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installDom, Event } = require('./fake-dom');

const JS_ROOT = path.join(__dirname, '..', '..', 'app', 'static', 'js');
let sequence = 0;

// Deferred fake fetch: every call is recorded and answered by the test with respond()/fail().
function fetchRecorder(window) {
    const requests = [];
    window.fetch = (url, init = {}) => new Promise((resolve, reject) => {
        const headers = new Headers(init.headers);
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        requests.push({ url, init, headers, body, fail: reject,
            respond: (status, data, responseHeaders = {}) => resolve(new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: responseHeaders })) });
    });
    return requests;
}

async function loadPage(entry, { html = '', url, before } = {}) {
    const window = installDom({ html, url });
    const requests = fetchRecorder(window);
    if (before) before(window);
    const module = await import(`${pathToFileURL(path.join(JS_ROOT, entry)).href}?case=${++sequence}`);
    return { window, document: window.document, requests, module };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function submit(form) {
    form.dispatchEvent(new Event('submit'));
}

module.exports = { loadPage, flush, submit, Event };
