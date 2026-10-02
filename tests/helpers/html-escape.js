'use strict';
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile } = require('./module-source');

// The real shared escaper module (its QLPKHtml export).
function loadHtmlEscape() {
    const context = vm.createContext({});
    runScriptFile(path.join(__dirname, '../../app/static/js/shared/html-escape.js'), context);
    return context.QLPKHtml;
}

module.exports = { QLPKHtml: loadHtmlEscape() };
