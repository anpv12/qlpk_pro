'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const JS_ROOT = path.join(ROOT, 'app/static/js');

// A page's ES module entry (from its template), then every relative import it reaches (depth-first).
function pageModuleScripts(templateName, entryFile) {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates', templateName), 'utf8');
    const escaped = entryFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entry = template.match(new RegExp(`<script type="module" src="/static/js/(${escaped})`))[1];
    const seen = [];
    const walk = rel => {
        if (seen.includes(rel)) return;
        seen.push(rel);
        const source = fs.readFileSync(path.join(JS_ROOT, rel), 'utf8');
        for (const match of source.matchAll(/^import\s+(?:[^'"]*?from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
            walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), match[1])));
        }
    };
    walk(entry);
    return seen;
}

// Every app script a page runs, in order: classic <script> tags, and each module tag expanded to its import graph.
function pageScripts(templateName) {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates', templateName), 'utf8');
    const scripts = [];
    for (const match of template.matchAll(/<script(?<module> type="module")? src="\/static\/js\/(?<file>[^"?]+)/g)) {
        const files = match.groups.module ? pageModuleScripts(templateName, match.groups.file) : [match.groups.file];
        for (const file of files) if (!scripts.includes(file)) scripts.push(file);
    }
    return scripts;
}

module.exports = { JS_ROOT, pageModuleScripts, pageScripts };
