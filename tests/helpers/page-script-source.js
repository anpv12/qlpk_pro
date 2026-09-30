'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { moduleFiles } = require('./module-source');

const ROOT = path.join(__dirname, '..', '..');

// Scripts of a template whose path starts with one of the prefixes, in template load order.
function pageScripts(templateName, prefixes) {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates', templateName), 'utf8');
    return [...template.matchAll(/<script src="\/static\/js\/([^"?]+)/g)].map(match => match[1])
        .filter(file => prefixes.some(prefix => file.startsWith(prefix)));
}

// Split entries contribute their parts/continuations once, in load order.
function readPageScripts(templateName, prefixes) {
    const files = [...new Set(pageScripts(templateName, prefixes).flatMap(file => moduleFiles(file)))];
    return files
        .map(file => fs.readFileSync(path.join(ROOT, 'app/static/js', file), 'utf8'))
        .join('\n');
}

module.exports = { pageScripts, readPageScripts };
