'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function setup(response = {ok: true, blob: async () => ({type: 'application/pdf'})}) {
    const calls = [];
    let cleanup;
    const tab = {closed: false, location: {replace: url => calls.push(['navigate', url])}, document: {
        open() {}, write: html => calls.push(['error', html]), close() {}
    }};
    const window = {
        location: {origin: 'http://localhost:8000'},
        localStorage: {getItem: key => key === 'qlpk_token' ? 'test-token' : null},
        sessionStorage: {getItem: () => null},
        fetch: async (url, options) => { calls.push(['request', url, options]); return response; },
        URL: {createObjectURL: () => 'blob:pdf', revokeObjectURL: url => calls.push(['revoke', url])},
        setTimeout: () => 1, clearTimeout() {},
        setInterval: callback => {cleanup = callback; return 2;}, clearInterval() {}
    };
    class DOMParser {
        parseFromString(html) { return {querySelectorAll: () => [], documentElement: {outerHTML: html}}; }
    }
    runScriptFile('app/static/js/shared/pdf-preview.js', (c => vm.isContext(c) ? c : vm.createContext(c))({window, DOMParser, URL, AbortController}));
    return {window, tab, calls, cleanup: () => cleanup()};
}

test('opens PDF in the existing tab without printing or closing it', async () => {
    const state = setup();
    await state.window.QLPKPdfPreview.render(state.tab, '<html>Preview</html>');
    assert.equal(state.calls[0][1], '/api/print/preview.pdf');
    assert.equal(state.calls[0][2].headers.Authorization, undefined);
    assert.equal(state.calls[0][2].headers['Content-Type'], 'text/html; charset=utf-8');
    assert.deepEqual(state.calls[1], ['navigate', 'blob:pdf']);
    assert.equal(state.tab.closed, false);
    state.tab.closed = true;
    state.cleanup();
    assert.deepEqual(state.calls[2], ['revoke', 'blob:pdf']);
});

test('PDF failure leaves a readable error and rejects', async () => {
    const state = setup({ok: false, json: async () => ({detail: 'PDF unavailable'})});
    await assert.rejects(state.window.QLPKPdfPreview.render(state.tab, '<html/>'), /PDF unavailable/);
    assert.equal(state.calls.at(-1)[0], 'error');
    assert.equal(state.tab.closed, false);
});

test('closed tab does not submit a print request', async () => {
    const state = setup();
    state.tab.closed = true;
    await assert.rejects(state.window.QLPKPdfPreview.render(state.tab, '<html/>'), /đã đóng/);
    assert.equal(state.calls.length, 0);
});

test('print controls bind inside the modal even with a scoped document', () => {
    let bound = false;
    const button = {dataset: {}, addEventListener: () => {bound = true;}};
    const root = {querySelectorAll: () => [button]};
    const document = {getElementById: () => root, querySelectorAll: () => []};
    const window = {};
    runScriptFile('app/static/js/components/modal-history-print-controller.js', (c => vm.isContext(c) ? c : vm.createContext(c))({window, document}));
    window.ModalHistoryPrintController.create({document, stateStore: {getState: () => ({})}}).bind();
    assert.equal(bound, true);
});
