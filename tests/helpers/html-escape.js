'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The real shared escaper, loaded the same way the browser does (window.QLPKHtml).
function loadHtmlEscape() {
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../app/static/js/shared/html-escape.js'), 'utf8'), { window });
    return window.QLPKHtml;
}

module.exports = { QLPKHtml: loadHtmlEscape() };
