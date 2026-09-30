'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { moduleFiles } = require('./module-source');

const ROOT = path.join(__dirname, '..', '..');

function medicineManagementScripts() {
    const template = fs.readFileSync(path.join(ROOT, 'app/templates/medicine-management.html'), 'utf8');
    return [...template.matchAll(/<script src="\/static\/js\/((?:medicine-management|medicines\/management-[\w-]+)\.js)/g)].map(match => match[1]);
}

// Split slices (``<slice>-parts/``) contribute their parts, in load order, before the slice itself.
function readMedicineManagementSource() {
    return medicineManagementScripts()
        .flatMap(file => moduleFiles(file))
        .map(file => fs.readFileSync(path.join(ROOT, 'app/static/js', file), 'utf8'))
        .join('\n');
}

module.exports = { medicineManagementScripts, readMedicineManagementSource };
