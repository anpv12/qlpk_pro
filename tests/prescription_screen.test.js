const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');
const content = { innerHTML: '' };
const context = vm.createContext({ window: {}, console, document: { getElementById: () => content } });
for (const file of ['shared/prescription-type-contract.js', 'shared/prescription-document-template.js', 'components/prescription-modal-preview.js', 'components/prescription-print-document.js']) {
  runScriptFile('app/static/js/prescriptions/' + file, context);
}
const data = {
  clinicInfo: { name: 'Clinic <script>', email: 'care@example.test' },
  patient: { full_name: 'Patient A', patient_code: 'HS00001', date_of_birth: '2000-01-01' },
  history: { examination_date: '2026-09-10', doctor: { full_name: 'Doctor A' } },
  examinationDetail: { diagnosis: [2659], diagnosis_text: 'F32.9 - Diagnosis', loi_dan: 'First line\nSecond <line>' },
  prescriptionData: { prescriptions: ['BASIC', 'H', 'N'].map(type => ({ type, prescription_code: 'CODE-' + type,
    medicines: [{ name: 'Medicine <name>', category_type: 'DRUG', quantity: 3, unit: 'viên', usage: 'Only when needed' }] })),
    re_examination_date: '2026-09-24', show_re_examination_date: true }
};
const initial = JSON.stringify(data);
let barcodeCalls = 0;
const preview = context.window.createPrescriptionModalPreview({
  buildPrescriptionScreenHTML: context.window.buildPrescriptionScreenHTML,
  buildPrescriptionPreviewHTML: () => { throw new Error('Web must not call paper renderer'); },
  createBarcodesInElement: () => barcodeCalls++
});
preview.setupPrescriptionTabPagination(data);
assert.equal((content.innerHTML.match(/<article class="rx-screen"/g) || []).length, 3);
for (const type of ['BASIC', 'H', 'N']) assert.ok(content.innerHTML.includes('CODE-' + type));
for (const text of ['F32.9 - Diagnosis', 'Only when needed', '24/09/2026', 'First line\nSecond &lt;line&gt;', 'Clinic &lt;script&gt;']) assert.ok(content.innerHTML.includes(text));
assert.ok(!content.innerHTML.includes('2659'));
assert.ok(!content.innerHTML.includes('moh-form'));
assert.equal(JSON.stringify(data), initial);
preview.setupPrescriptionTabPagination({ patient: { full_name: 'Patient B' }, prescriptionData: { medicines: [] } });
assert.equal(barcodeCalls, 2);
assert.ok(content.innerHTML.includes('Patient B'));
assert.ok(content.innerHTML.includes('Chưa có thuốc trong đơn.'));
for (const text of ['Patient A', 'Doctor A', 'Medicine', '24/09/2026', 'First line', '1 lần/ngày']) assert.ok(!content.innerHTML.includes(text));
const print = context.window.PrescriptionPrintDocument.create({ buildPrescriptionPreviewHTML: context.window.buildPrescriptionPreviewHTML });
const paper = print.buildPagesHtml(data);
assert.equal((paper.match(/class="moh-form"/g) || []).length, 3);
assert.ok(!paper.includes('rx-screen'));
assert.ok(!paper.includes('PRESCRIPTION'));
console.log('Web/paper renderer separation, grouped types, escaping, clinical data and patient clearing OK');
