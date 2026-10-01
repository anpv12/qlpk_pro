'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { JS_ROOT, pageModuleScripts } = require('./module-graph');

// Medicine page modules: the template's ES module entry, then every relative import it reaches.
function medicineManagementScripts() {
    return pageModuleScripts('medicine-management.html', 'medicine-management.js')
        .filter(file => file === 'medicine-management.js' || file.startsWith('medicines/'));
}

function readMedicineManagementSource() {
    return medicineManagementScripts()
        .map(file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8'))
        .join('\n');
}

module.exports = { medicineManagementScripts, readMedicineManagementSource };
