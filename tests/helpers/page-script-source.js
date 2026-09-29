'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// Scripts of a template whose path starts with one of the prefixes, in template load order.
function pageScripts(templateName, prefixes) {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates', templateName), 'utf8');
    return [...template.matchAll(/<script src="\/static\/js\/([^"?]+)/g)].map(match => match[1])
        .filter(file => prefixes.some(prefix => file.startsWith(prefix)));
}

function readPageScripts(templateName, prefixes) {
    return pageScripts(templateName, prefixes)
        .map(file => fs.readFileSync(path.join(ROOT, 'app/static/js', file), 'utf8'))
        .join('\n');
}

module.exports = { pageScripts, readPageScripts };
