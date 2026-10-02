'use strict';
// Registers the ES module stub hooks once per test process (see esm-stub-hooks.mjs).
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
if (!globalThis.__qlpkEsmStubHooks) {
    globalThis.__qlpkEsmStubHooks = true;
    register(pathToFileURL(path.join(__dirname, 'esm-stub-hooks.mjs')));
}
