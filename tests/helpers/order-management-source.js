'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const JS_ROOT = path.join(ROOT, 'app/static/js');

// Order page modules: the template's ES module entry, then every relative import it reaches (depth-first).
function orderManagementScripts() {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates/order-management.html'), 'utf8');
    const entry = template.match(/<script type="module" src="\/static\/js\/(order-management\.js)/)[1];
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

function readOrderManagementSource() {
    return orderManagementScripts()
        .map(file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8'))
        .join('\n');
}

module.exports = { orderManagementScripts, readOrderManagementSource };
