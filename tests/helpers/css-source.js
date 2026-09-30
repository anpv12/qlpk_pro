'use strict';
// Large stylesheets are split by topic: the entry keeps `@import url('./<stem>/<topic>.css');`
// lines in cascade order and the rules live in <stem>/. Source checks read the inlined text.
const fs = require('node:fs');
const path = require('node:path');

const PART_IMPORT = /^@import url\(['"]?\.\/([\w-]+)\/([\w-]+\.css)['"]?\);$/gm;

function readCssSource(file) {
    const text = fs.readFileSync(file, 'utf8');
    if (!file.endsWith('.css')) return text;
    const stem = path.basename(file, '.css');
    return text.replace(PART_IMPORT, (line, folder, name) => (
        folder === stem ? fs.readFileSync(path.join(path.dirname(file), folder, name), 'utf8') : line
    ));
}

// A topic part belongs to the stylesheet that imports it (e.g. shared/color-tokens/x.css -> shared/color-tokens.css).
function stylesheetOwner(root, relative) {
    const parts = relative.split(/[\\/]/);
    if (parts.length < 2) return relative;
    const owner = `${parts.slice(0, -1).join('/')}.css`;
    const ownerPath = path.join(root, owner);
    if (!fs.existsSync(ownerPath)) return relative;
    const folder = parts[parts.length - 2];
    const imports = [...fs.readFileSync(ownerPath, 'utf8').matchAll(PART_IMPORT)];
    return imports.some(match => match[1] === folder && match[2] === parts[parts.length - 1]) ? owner : relative;
}

module.exports = { readCssSource, stylesheetOwner };
