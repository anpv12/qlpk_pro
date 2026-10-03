'use strict';
// Page templates compose partials with `{% include 'partials/x.html' %}`; markup checks read the composed text.
// Pages built from macros (page_head, app_shell, ...) are read as rendered HTML through scripts/template_source.py.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

const ROOT = path.join(__dirname, '..', '..');
const PYTHON = process.env.QLPK_PYTHON
    || (fs.existsSync(path.join(ROOT, '.venv', 'bin', 'python')) ? path.join(ROOT, '.venv', 'bin', 'python') : 'python3');
let renderedPages = null;

// The HTML a page template renders to (Jinja with the checkers' stub context), as the browser receives it.
function renderedTemplate(name) {
    if (!renderedPages) {
        const output = execFileSync(PYTHON, [path.join(ROOT, 'scripts', 'template_source.py')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        renderedPages = JSON.parse(output);
    }
    const page = renderedPages[path.basename(name)];
    if (page === undefined) throw new Error(`Không có template trang: ${name}`);
    return page;
}

function renderedTemplateNames() {
    renderedTemplate('index.html');
    return Object.keys(renderedPages);
}

module.exports = { readTemplateSource, renderedTemplate, renderedTemplateNames };
