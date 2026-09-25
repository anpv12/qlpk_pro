'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

const REEXAM_FILES = Object.freeze([
  'app/static/js/doctor-examination/module-registry.js',
  'app/static/js/doctor-examination/support-runtime.js',
  'app/static/js/prescriptions/shared/prescription-type-contract.js',
  'app/static/js/prescriptions/shared/prescription-dose-utils.js',
  'app/static/js/doctor-examination/prescription-model.js',
  'app/static/js/doctor-examination/prescription-reexam-ui.js'
]);

function loadDoctorRegistry(files) {
  const window = {};
  const context = vm.createContext({ window, document: {}, console });
  for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return window.QLPKDoctorModuleRegistry;
}

module.exports = { REEXAM_FILES, loadDoctorRegistry };
