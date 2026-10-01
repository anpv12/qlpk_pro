'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JS_ROOT, pageModuleScripts } = require('./module-graph');

// Order page modules: the template's ES module entry, then every relative import it reaches (depth-first).
function orderManagementScripts() {
    return pageModuleScripts('order-management.html', 'order-management.js');
}

function readOrderManagementSource() {
    return orderManagementScripts()
        .map(file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8'))
        .join('\n');
}

module.exports = { orderManagementScripts, readOrderManagementSource };
