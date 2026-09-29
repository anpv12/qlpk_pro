'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function medicineManagementScripts() {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates/medicine-management.html'), 'utf8');
    return [...template.matchAll(/<script src="\/static\/js\/((?:medicine-management|medicines\/management-[\w-]+)\.js)/g)].map(match => match[1]);
}

function readMedicineManagementSource() {
    return medicineManagementScripts()
        .map(file => fs.readFileSync(path.join(ROOT, 'app/static/js', file), 'utf8'))
        .join('\n');
}

module.exports = { medicineManagementScripts, readMedicineManagementSource };
