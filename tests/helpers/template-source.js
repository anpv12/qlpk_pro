'use strict';
// Page templates compose partials with `{% include 'partials/x.html' %}`; markup checks read the composed text.
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATES = path.join(__dirname, '..', '..', 'app', 'templates');
const INCLUDE = /\{%-?\s*include\s+['"]([^'"]+)['"]\s*-?%\}/g;

function readTemplateSource(name, seen = new Set()) {
    const rel = name.replace(/^.*app\/templates\//, '');
    if (seen.has(rel)) return '';
    seen.add(rel);
    const text = fs.readFileSync(path.join(TEMPLATES, rel), 'utf8');
    return text.replace(INCLUDE, (tag, include) => (
        fs.existsSync(path.join(TEMPLATES, include)) ? readTemplateSource(include, seen) : tag
    ));
}

module.exports = { readTemplateSource };
