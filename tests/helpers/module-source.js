'use strict';
// Split browser modules keep a manifest on their entry file:
//   // Parts (nạp trước file này): part-1.js, part-2.js
// Parts live in <entry>-parts/ and must run before the entry, in that order.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_ROOT = path.join(__dirname, '..', '..', 'app', 'static', 'js');
const MANIFEST = /^\/\/ Parts \(nạp trước file này\): (.+)$/m;
// Classic page scripts split into continuation files that share the page scope.
const FACTORY_SPLIT = /moduleParts\.installers\.push\(function \(inst, outer\)/;
const CONTINUED = /^\/\/ Continued in \(nạp ngay sau file này, cùng scope trang\): (.+)$/m;

function moduleFiles(rel) {
    const entry = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    const continued = entry.match(CONTINUED);
    if (continued) return [rel, ...continued[1].split(',').map(name => name.trim())];
    const match = entry.match(MANIFEST);
    if (!match) return [rel];
    const partDir = rel.replace(/\.js$/, '-parts');
    return [...match[1].split(',').map(name => `${partDir}/${name.trim()}`), rel];
}

// Plain source strips the moduleParts./moduleState. indirection so text checks see the original code.
function readModuleSource(rel, { plain = true } = {}) {
    const source = moduleFiles(rel).map(file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8')).join('\n');
    if (!plain) return source;
    // Factory splits (installer parts) route instance/module values through inst./outer.
    const prefixes = FACTORY_SPLIT.test(source) ? 'module(?:Parts|State)|inst|outer' : 'module(?:Parts|State)';
    return source
        .replace(new RegExp(`\\b(\\w+): (?:${prefixes})\\.\\1\\b`, 'g'), '$1')
        .replace(new RegExp(`\\b(?:${prefixes})\\.`, 'g'), '');
}

function runModuleScript(rel, context, run = vm.runInContext) {
    for (const file of moduleFiles(rel)) {
        run(fs.readFileSync(path.join(JS_ROOT, file), 'utf8'), context, { filename: file });
    }
    return context;
}

function toModuleRel(filePath) {
    const absolute = path.resolve(path.join(__dirname, '..', '..'), filePath);
    const rel = path.relative(JS_ROOT, absolute);
    return rel.startsWith('..') ? null : rel.split(path.sep).join('/');
}

// Runs a script file (any path form) in a context; split modules run their parts first.
function runScriptFile(filePath, context) {
    const rel = toModuleRel(filePath);
    if (!rel) return vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    return runModuleScript(rel, context);
}

// Source text of a file for assertions; split modules are joined and returned as plain source.
function readScriptSource(filePath) {
    const rel = toModuleRel(filePath);
    return rel ? readModuleSource(rel) : fs.readFileSync(filePath, 'utf8');
}

module.exports = { moduleFiles, readModuleSource, runModuleScript, runScriptFile, readScriptSource };
