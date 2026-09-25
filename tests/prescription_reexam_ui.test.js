'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { REEXAM_FILES, loadDoctorRegistry } = require('./helpers/doctor-registry');

const NOW = new Date('2026-09-25T09:00:00+07:00');
const FUTURE = '2026-10-02 09:00';
const PAST = '2026-09-20 09:00';
const REEXAM = loadDoctorRegistry(REEXAM_FILES).require('prescriptionReExam');
const view = state => ({ ...REEXAM.describe(state, NOW) });
const persisted = (overrides = {}) => ({
    reExaminationAppointmentId: 5,
    reExaminationDateTime: FUTURE,
    reExaminationStatus: 'SCHEDULED',
    reExaminationDraftDateTime: FUTURE,
    reExaminationDraftSelection: { doctor_id: 2 },
    reExaminationSnapshot: { selection: { doctor_id: 2 } },
    ...overrides
});

test('registry graph accepts the re-examination owner', () => {
    const registry = loadDoctorRegistry(REEXAM_FILES);
    assert.equal(registry.validateGraph(), true);
    assert.equal(registry.describe('prescriptionReExam').owner, 'doctor/prescription');
});

test('idle and pending states follow the draft', () => {
    assert.deepEqual(view({}), { locked: false, status: 'idle', label: 'Chưa hẹn', title: '', hint: '', hintStatus: '' });
    assert.equal(view({ reExaminationDraftDateTime: FUTURE }).label, 'Chưa lưu');
    assert.equal(view(persisted({ reExaminationDraftDateTime: '2026-10-03 09:00' })).status, 'pending');
    assert.equal(view(persisted({ reExaminationDraftSelection: { doctor_id: 3 } })).status, 'pending');
    assert.equal(view(persisted({ reExaminationDraftDateTime: '' })).label, 'Chưa lưu');
});

test('saved schedule reads as scheduled when draft matches', () => {
    assert.equal(view(persisted()).label, 'Đã tạo lịch');
    assert.equal(view(persisted({ reExaminationDraftDateTime: '2026-10-02' })).status, 'scheduled');
});

test('locked labels come from backend status or elapsed time', () => {
    assert.equal(view(persisted({ reExaminationStatus: 'confirmed' })).label, 'Đã xác nhận');
    assert.equal(view(persisted({ reExaminationStatus: 'NO_SHOW' })).label, 'Không đến');
    assert.equal(view(persisted({ reExaminationStatus: 'CANCELLED' })).label, 'Đã hủy');
    const elapsed = view(persisted({ reExaminationDateTime: PAST }));
    assert.equal(elapsed.status, 'locked');
    assert.equal(elapsed.label, 'Đã quá giờ hẹn');
    assert.match(elapsed.title, /không thể sửa hoặc hủy/);
    const backendLock = view(persisted({ reExaminationSnapshot: { editable: false, lock_reason: 'Đã khóa bởi lễ tân.' } }));
    assert.equal(backendLock.title, 'Đã khóa bởi lễ tân.');
    assert.equal(REEXAM.isLocked(persisted({ reExaminationDateTime: 'không hợp lệ' }), NOW), true);
    assert.equal(REEXAM.isLocked({ reExaminationDateTime: PAST }, NOW), false);
});

test('schedule errors surface in label and hint', () => {
    const error = view({ reExaminationDraftDateTime: FUTURE, reExaminationError: 'Lịch không còn trống.' });
    assert.equal(error.status, 'error');
    assert.equal(error.label, 'Cần kiểm tra lịch');
    assert.equal(error.hint, 'Lịch không còn trống.');
    assert.equal(error.hintStatus, 'error');
    assert.equal(view({ reExaminationError: 'Lỗi mạng.' }).hint, 'Lỗi mạng.');
});

test('change detection normalizes date input and selection keys', () => {
    assert.equal(REEXAM.normalizeDateTime('2026-10-02'), '2026-10-02 09:00');
    assert.equal(REEXAM.normalizeDateTime('2026-10-02T14:30'), '2026-10-02 14:30');
    assert.equal(REEXAM.normalizeDateTime(''), '');
    assert.equal(REEXAM.sameSelection({ doctor_id: 1 }, { doctor_id: 1, service_id: null }), true);
    assert.equal(REEXAM.sameSelection({ doctor_id: 1 }, { doctor_id: 2 }), false);
    assert.equal(REEXAM.sameSelection(undefined, undefined), true);
    assert.equal(REEXAM.hasChanges(persisted({ reExaminationDraftDateTime: '2026-10-02' })), false);
    assert.equal(REEXAM.hasChanges({ reExaminationDraftDateTime: FUTURE }), true);
    assert.equal(REEXAM.hasChanges({}), false);
});

test('renderStatus and renderButton write the DOM contract', () => {
    const status = { dataset: {} };
    const hint = { dataset: {} };
    REEXAM.renderStatus({ state: { reExaminationError: 'Lỗi mạng.' }, statusElement: status, hintElement: hint, now: NOW });
    assert.deepEqual({ ...status.dataset }, { status: 'idle' });
    assert.equal(status.textContent, 'Chưa hẹn');
    assert.equal(hint.hidden, false);
    assert.equal(hint.dataset.status, 'error');
    REEXAM.renderStatus({ state: {}, statusElement: status, hintElement: null, now: NOW });
    REEXAM.renderStatus({ state: {}, statusElement: null, hintElement: hint, now: NOW });
    assert.equal(hint.hidden, false);

    const button = {};
    REEXAM.renderButton({ state: { prescriptionLoaded: true, prescriptionSaving: false }, buttonElement: button, now: NOW });
    assert.deepEqual({ ...button }, { disabled: false, title: '', textContent: 'Đặt lịch' });
    REEXAM.renderButton({ state: { prescriptionLoaded: true, reExaminationDraftDateTime: FUTURE }, buttonElement: button, now: NOW });
    assert.equal(button.textContent, 'Đổi lịch');
    REEXAM.renderButton({ state: { prescriptionLoaded: true, prescriptionSaving: true }, buttonElement: button, now: NOW });
    assert.equal(button.disabled, true);
    REEXAM.renderButton({ state: { prescriptionLoaded: false }, buttonElement: button, now: NOW });
    assert.equal(button.disabled, true);
    REEXAM.renderButton({ state: persisted({ prescriptionLoaded: true, reExaminationDateTime: PAST }), buttonElement: button, now: NOW });
    assert.equal(button.disabled, true);
    assert.match(button.title, /không thể sửa hoặc hủy/);
    assert.doesNotThrow(() => REEXAM.renderButton({ state: {}, buttonElement: null, now: NOW }));
});
