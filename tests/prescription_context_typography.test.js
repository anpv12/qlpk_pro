'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('app/static/css/pages/doctor-prescription.css', 'utf8');
const template = fs.readFileSync('app/templates/partials/doctor-clinical-workspace.html', 'utf8');
const rule = selector => css.slice(css.indexOf(`${selector} {`)).split('}')[0];

test('treatment days and unit form a centered group inside the control', () => {
    assert.match(rule('.doctor-prescription-summary-field__input-line'), /justify-content: center/);
    assert.match(rule('.doctor-prescription-summary-field__input-line input'), /text-align: center/);
    assert.match(rule('.doctor-prescription-summary-field__input-line input'), /flex: 0 1 3ch/);
    assert.match(rule('.doctor-prescription-summary-field__input-line small'), /padding-inline-end: 0/);
});

test('context labels keep intrinsic width and controls share a height owner', () => {
    assert.match(rule('.doctor-prescription-overview'), /grid-template-columns: max-content max-content minmax\(0, 1fr\)/);
    assert.match(rule('.doctor-prescription-summary-field'), /grid-template-columns: max-content minmax\(0, 1fr\)/);
    assert.match(rule('.doctor-prescription-summary-field--mode'), /max-content 9rem/);
    assert.match(rule('.doctor-prescription-summary-field--days'), /max-content 6rem/);
    for (const selector of [
        '.doctor-prescription-summary-field--editable select',
        '.doctor-prescription-summary-field__input-line',
        '.doctor-prescription-reexam-date .form-control',
        '.doctor-prescription-overview .doctor-workspace-button'
    ]) assert.match(rule(selector), /min-block-size: var\(--prescription-context-control-height\)/);
    assert.match(rule('.doctor-prescription-summary-field__input-line input'), /min-block-size: 0/);
});

test('re-examination wraps by editor width without viewport overrides', () => {
    assert.match(rule('.doctor-prescription-reexam-line'), /display: flex;\s*flex-wrap: wrap/);
    assert.match(css, /@container doctor-prescription-main \(max-width: 66rem\)/);
    assert.match(css, /@container doctor-prescription-main \(max-width: 38rem\)/);
    assert.match(css, /@container doctor-prescription-main \(max-width: 26rem\)/);
    assert.match(css, /\.doctor-prescription-overview > \.doctor-prescription-summary-field--reexam\s*\{\s*grid-column: 1 \/ -1/);
    assert.equal((css.match(/\.doctor-prescription-reexam-line\s*\{/g) || []).length, 1);
});

test('prescription context uses standard system typography rather than small variants', () => {
    for (const selector of [
        '.doctor-prescription-summary-field > span',
        '.doctor-prescription-summary-field__input-line small',
        '.doctor-prescription-editor__reexam-hint',
        '.doctor-prescription-overview .doctor-prescription-editor__reexam-status'
    ]) assert.match(rule(selector), /font-size: var\(--qlpk-font-size-base\)/);
    for (const selector of [
        '.doctor-prescription-summary-field--editable select',
        '.doctor-prescription-reexam-date .form-control'
    ]) {
        assert.match(rule(selector), /font-size: var\(--qlpk-control-font-size\)/);
        assert.match(rule(selector), /font-weight: var\(--qlpk-control-font-weight\)/);
        assert.match(rule(selector), /line-height: var\(--qlpk-control-line-height\)/);
    }
});

test('actionable re-examination errors retain a separate live region', () => {
    assert.match(template, /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<p id="doctorPrescriptionReExamHint"[^>]*aria-live="polite" hidden><\/p>\s*<\/section>/);
    assert.equal((template.match(/id="doctorPrescriptionReExamHint"/g) || []).length, 1);
});

test('locked explanation uses status tooltip, clears on patient change and preserves errors', () => {
    const vm = require('node:vm');
    const { REEXAM_FILES, loadDoctorRegistry } = require('./helpers/doctor-registry');
    const script = fs.readFileSync('app/static/js/doctor-examination/prescription-ui.js', 'utf8');
    const source = script.slice(script.indexOf('function syncPrescriptionReExamStatus(doc)'), script.indexOf('function syncPrescriptionReExamControls(doc)'));
    const status = { dataset: {} };
    const hint = { dataset: {} };
    const state = { reExaminationAppointmentId: 1, reExaminationStatus: 'NO_SHOW', reExaminationDraftDateTime: '2026-07-06', reExaminationError: '' };
    const context = vm.createContext({
        STATE: state,
        REEXAM: loadDoctorRegistry(REEXAM_FILES).require('prescriptionReExam'),
        getElement: (_, id) => id === 'doctorPrescriptionReExamStatus' ? status : hint
    });
    vm.runInContext(source, context);
    context.syncPrescriptionReExamStatus({});
    assert.equal(status.textContent, 'Không đến');
    assert.match(status.title, /không thể sửa hoặc hủy/);
    assert.equal(hint.hidden, true);
    assert.equal(hint.textContent, '');
    state.reExaminationError = 'Lịch không còn trống.';
    context.syncPrescriptionReExamStatus({});
    assert.equal(hint.hidden, false);
    assert.equal(hint.textContent, state.reExaminationError);
    assert.equal(hint.dataset.status, 'error');
    state.reExaminationError = '';
    state.reExaminationAppointmentId = null;
    state.reExaminationDraftDateTime = '';
    context.syncPrescriptionReExamStatus({});
    assert.equal(status.title, '');
    assert.equal(status.textContent, 'Chưa hẹn');
    assert.equal(hint.hidden, true);
});
