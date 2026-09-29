'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function orderManagementScripts() {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates/order-management.html'), 'utf8');
    return [...template.matchAll(/<script src="\/static\/js\/((?:order-management|orders\/order-management-[\w-]+)\.js)/g)].map(match => match[1]);
}

function readOrderManagementSource() {
    return orderManagementScripts()
        .map(file => fs.readFileSync(path.join(ROOT, 'app/static/js', file), 'utf8'))
        .join('\n');
}

module.exports = { orderManagementScripts, readOrderManagementSource };
