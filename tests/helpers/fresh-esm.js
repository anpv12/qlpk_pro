'use strict';
// Real ES module loading for page tests. importFresh() evaluates a module and everything it imports
// as a new instance, so module-level page state never leaks between tests. Page code reads browser
// globals (window, document, setTimeout, fetch, ...) at call time; useGlobals() points those names
// at a fake environment (an object or a vm context) for the current test.
const path = require('node:path');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

const JS_ROOT = path.join(__dirname, '..', '..', 'app', 'static', 'js');
register(pathToFileURL(path.join(__dirname, 'fresh-esm-hooks.mjs')));
let graph = 0;

// One new module graph; every module imported through the returned function shares it.
function freshGraph() {
    const id = ++graph;
    return rel => import(`${pathToFileURL(path.join(JS_ROOT, rel)).href}?graph=${id}`);
}

function importFresh(rel) {
    return freshGraph()(rel);
}

const DEFAULT_GLOBALS = ['window', 'document', 'setTimeout', 'clearTimeout', 'fetch', 'localStorage', 'sessionStorage', 'Option', 'Event', 'CustomEvent', 'Node', 'Element'];

// Names the source does not define keep their current global (Node's Event, URL, ... stay intact).
function useGlobals(source, names = DEFAULT_GLOBALS) {
    for (const name of names.filter(key => source[key] !== undefined)) {
        Object.defineProperty(globalThis, name, { configurable: true, enumerable: false, get: () => source[name], set: value => { source[name] = value; } });
    }
    return source;
}

module.exports = { JS_ROOT, freshGraph, importFresh, useGlobals };
