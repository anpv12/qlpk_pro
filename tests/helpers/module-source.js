'use strict';
// Split browser modules keep a manifest on their entry file:
//   // Parts (nạp trước file này): state-and-quantities.js, rendering-and-load.js
// Parts live in <entry>-parts/ and must run before the entry, in that order.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_ROOT = path.join(__dirname, '..', '..', 'app', 'static', 'js');
const MANIFEST = /^\/\/ Parts \(nạp trước file này\): (.+)$/m;
// Classic page scripts split into continuation files that share the page scope.
const FACTORY_SPLIT = /moduleParts\.installers\.push\(function \(inst, outer\)/;
const CONTINUED = /^\/\/ Continued in \(nạp ngay sau file này, cùng scope trang\): (.+)$/m;

// Load order: the entry's parts, the entry, then its continuation files (each expanded the same way).
// An ES module whose parts live in <entry>-parts/: the parts it imports (each after its own parts), then the entry.
function esPartFiles(rel, seen = []) {
    if (seen.includes(rel)) return [];
    seen.push(rel);
    const source = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    const partDir = rel.replace(/\.js$/, '-parts');
    const parts = [...source.matchAll(/^import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)]
        .map(match => path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[1])))
        .filter(file => path.posix.dirname(file) === partDir);
    return [...parts.flatMap(part => esPartFiles(part, seen)), rel];
}

function moduleFiles(rel) {
    const entry = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    if (!MANIFEST.test(entry) && new RegExp(`from ['"]\\./${path.posix.basename(rel, '.js')}-parts/`).test(entry)) return esPartFiles(rel);
    const match = entry.match(MANIFEST);
    const partDir = rel.replace(/\.js$/, '-parts');
    const parts = match ? match[1].split(',').map(name => `${partDir}/${name.trim()}`) : [];
    const continued = entry.match(CONTINUED);
    const next = continued ? continued[1].split(',').flatMap(name => moduleFiles(name.trim())) : [];
    return [...parts, rel, ...next];
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

const ES_MODULE_SYNTAX = /^(?:import|export)\s/m;
const loadedModules = new WeakMap();
const RELATIVE_IMPORT = /^import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"];?\n?/gm;

// An ES module and the relative modules it imports, as one classic script for a vm context. Each module runs in its
// own function scope (dependencies first, each once per context, like a browser module map) and receives its imports
// from the modules it names; afterwards every top-level declaration is also copied onto the context's global object,
// so harnesses keep reading page functions as globals.
function topLevelNames(body) {
    const names = new Set();
    for (const match of body.matchAll(/^(?:async\s+)?function\*?\s+([\w$]+)|^class\s+([\w$]+)|^(?:const|let|var)\s+([\w$]+)/gm)) {
        names.add(match[1] || match[2] || match[3]);
    }
    for (const match of body.matchAll(/^(?:const|let|var)\s+\{([^}]*)\}\s*=/gm)) {
        for (const part of match[1].split(',')) {
            const name = part.split(':').pop().split('=')[0].trim();
            if (/^[\w$]+$/.test(name)) names.add(name);
        }
    }
    return [...names];
}

function esModuleScript(rel, seen = new Set()) {
    if (seen.has(rel)) return '';
    seen.add(rel);
    const source = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
    const resolve = spec => path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const imports = [...source.matchAll(RELATIVE_IMPORT)].map(match => ({ from: resolve(match[1]), clause: match[0] }));
    const dependencies = imports.map(item => esModuleScript(item.from, seen)).join('\n');
    const bindings = imports.map(({ from, clause }) => {
        const named = clause.match(/\{([^}]*)\}/);
        if (!named) return '';
        const key = JSON.stringify(from);
        // A module still being evaluated (import cycle) is reached lazily, like a live ESM binding of a hoisted function.
        return named[1].split(',').map(part => part.trim()).filter(Boolean).map(part => {
            const [imported, local = imported] = part.split(/\s+as\s+/);
            return `const ${local} = __qlpkEsModules[${key}] ? __qlpkEsModules[${key}].${imported} : (...args) => __qlpkEsModules[${key}].${imported}(...args);`;
        }).join('\n');
    }).join('\n');
    const exportLists = [...source.matchAll(/^export \{([^}]*)\};?$/gm)].flatMap(match => match[1].split(','))
        .map(part => part.trim()).filter(Boolean)
        .map(part => part.replace(/^([\w$]+)\s+as\s+([\w$]+)$/, '$2: $1'));
    const body = source.replace(RELATIVE_IMPORT, '').replace(/^export \{[^}]*\};?\n?/gm, '').replace(/^export (?=(?:async )?function|const|let|class)/gm, '');
    const top = topLevelNames(body);
    return `${dependencies}
globalThis.__qlpkEsModules = globalThis.__qlpkEsModules || {};
(function () {
${bindings}
${body}
const __exports = { ${[...new Set([...top, ...exportLists])].join(', ')} };
__qlpkEsModules[${JSON.stringify(rel)}] = __exports;
for (const [name, value] of Object.entries(__exports)) globalThis[name] = value;
})();
`;
}

// Runs a script file (any path form) in a context; split modules run their parts first, ES modules their imports.
function runScriptFile(filePath, context) {
    const rel = toModuleRel(filePath);
    if (!rel) return vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
    if (ES_MODULE_SYNTAX.test(fs.readFileSync(path.join(JS_ROOT, rel), 'utf8'))) {
        // Like a browser module map: a module already evaluated in this context is not evaluated again.
        if (!loadedModules.has(context)) loadedModules.set(context, new Set());
        return vm.runInContext(esModuleScript(rel, loadedModules.get(context)), context, { filename: rel });
    }
    return runModuleScript(rel, context);
}

// Source text of a file for assertions; split modules are joined and returned as plain source.
function readScriptSource(filePath) {
    const rel = toModuleRel(filePath);
    return rel ? readModuleSource(rel) : fs.readFileSync(filePath, 'utf8');
}

// Source of an ES module page group (the receptionist page files), with import/export lines removed, for
// harnesses that evaluate single functions in a vm context. Shared page state lives in `state`, so a harness
// sets context.state = context and keeps reading page variables off the context.
const RECEPTIONIST_PAGE_MODULES = ['receptionist-new-parts/address.js', 'receptionist-new.js', 'receptionist/save-flow-parts/copy-patient.js',
    'receptionist/save-flow.js', 'receptionist/medical-data-and-documents.js'];
function readPageModulesSource(rels = RECEPTIONIST_PAGE_MODULES) {
    return rels.map(rel => fs.readFileSync(path.join(JS_ROOT, rel), 'utf8'))
        .join('\n')
        .replace(/^import [^;]+;\n/gm, '')
        .replace(/^export \{[^}]*\};\n/gm, '');
}

module.exports = { esModuleScript, moduleFiles, readModuleSource, runModuleScript, runScriptFile, readScriptSource, readPageModulesSource, RECEPTIONIST_PAGE_MODULES };
