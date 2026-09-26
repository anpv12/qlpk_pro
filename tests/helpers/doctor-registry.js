'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

const RUNTIME_FILES = Object.freeze([
  'app/static/js/doctor-examination/module-registry.js',
  'app/static/js/doctor-examination/support-runtime.js'
]);

const REEXAM_FILES = Object.freeze([
  ...RUNTIME_FILES,
  'app/static/js/prescriptions/shared/prescription-type-contract.js',
  'app/static/js/prescriptions/shared/prescription-dose-utils.js',
  'app/static/js/doctor-examination/prescription-model.js',
  'app/static/js/doctor-examination/prescription-reexam-ui.js'
]);

const MEDICINE_SEARCH_FILES = Object.freeze([
  ...REEXAM_FILES.slice(0, -1),
  'app/static/js/doctor-examination/prescription-medicine-search-ui.js'
]);

function loadDoctorRegistry(files, windowProps = {}) {
  const window = { ...windowProps };
  const context = vm.createContext({ window, document: {}, console });
  for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return window.QLPKDoctorModuleRegistry;
}

function loadSupportRuntime() {
  return loadDoctorRegistry(RUNTIME_FILES).require('supportRuntime');
}

module.exports = { RUNTIME_FILES, REEXAM_FILES, MEDICINE_SEARCH_FILES, loadDoctorRegistry, loadSupportRuntime };
