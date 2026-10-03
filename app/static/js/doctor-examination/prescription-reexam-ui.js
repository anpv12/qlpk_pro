import { QLPKDoctorModuleRegistry } from './module-registry.js';

const REGISTRY = QLPKDoctorModuleRegistry;
if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
const { textOf } = REGISTRY.require('supportRuntime');
const MODEL = REGISTRY.require('prescriptionModel');

const LOCKED_LABELS = Object.freeze({ CONFIRMED: 'Đã xác nhận', NO_SHOW: 'Không đến', CANCELLED: 'Đã hủy' });
const DEFAULT_LOCK_REASON = 'Lịch tái khám đã đến hoặc quá giờ hẹn; không thể sửa hoặc hủy tại màn này.';
const SELECTION_KEYS = Object.freeze(['doctor_id', 'service_id', 'package_id']);

function getStatus(state) {
	return textOf(state.reExaminationStatus).toUpperCase();
}

function isLocked(state, now = new Date()) {
	if (!state.reExaminationAppointmentId) return false;
	const when = new Date(String(state.reExaminationDateTime || '').replace(' ', 'T'));
	return state.reExaminationSnapshot?.editable === false
		|| getStatus(state) !== 'SCHEDULED'
		|| !Number.isFinite(when.getTime()) || when <= now;
}

function lockReason(state) {
	return state.reExaminationSnapshot?.lock_reason || DEFAULT_LOCK_REASON;
}

function normalizeDateTime(value) {
	const parsed = MODEL.parseDateTimeInputValue(value);
	return parsed.date ? `${parsed.date} ${parsed.time || '09:00'}` : '';
}

function sameSelection(first, second) {
	return SELECTION_KEYS.every(key => (first?.[key] || null) === (second?.[key] || null));
}

function hasChanges(state) {
	const enabled = Boolean(state.reExaminationDraftDateTime);
	const persistedEnabled = Boolean(state.reExaminationAppointmentId || state.reExaminationDateTime);
	if (enabled !== persistedEnabled) return true;
	return normalizeDateTime(state.reExaminationDraftDateTime) !== normalizeDateTime(state.reExaminationDateTime)
		|| (enabled && !sameSelection(state.reExaminationDraftSelection, state.reExaminationSnapshot?.selection));
}

function describe(state, now = new Date()) {
	const locked = isLocked(state, now);
	const persisted = Boolean(state.reExaminationAppointmentId);
	const enabled = Boolean(state.reExaminationDraftDateTime);
	let status = 'idle';
	let label = 'Chưa hẹn';
	if (locked) {
		status = 'locked';
		label = LOCKED_LABELS[getStatus(state)] || 'Đã quá giờ hẹn';
	} else if (enabled && Boolean(state.reExaminationError)) {
		status = 'error';
		label = 'Cần kiểm tra lịch';
	} else if (persisted && enabled && !hasChanges(state)) {
		status = 'scheduled';
		label = 'Đã tạo lịch';
	} else if (enabled || (persisted && hasChanges(state))) {
		status = 'pending';
		label = 'Chưa lưu';
	}
	return {
		locked,
		status,
		label,
		title: locked ? lockReason(state) : '',
		hint: state.reExaminationError || '',
		hintStatus: state.reExaminationError ? 'error' : ''
	};
}

function renderStatus({ state, statusElement, hintElement, now }) {
	if (!statusElement) return;
	const view = describe(state, now);
	statusElement.dataset.status = view.status;
	statusElement.textContent = view.label;
	statusElement.title = view.title;
	if (!hintElement) return;
	hintElement.dataset.status = view.hintStatus;
	hintElement.hidden = !view.hint;
	hintElement.textContent = view.hint;
}

function renderButton({ state, buttonElement, now }) {
	if (!buttonElement) return;
	const locked = isLocked(state, now);
	buttonElement.disabled = locked || !state.prescriptionLoaded || state.prescriptionSaving;
	buttonElement.title = locked ? lockReason(state) : '';
	buttonElement.textContent = state.reExaminationDraftDateTime ? 'Đổi lịch' : 'Đặt lịch';
}

REGISTRY.register('prescriptionReExam', Object.freeze({
	getStatus,
	isLocked,
	lockReason,
	normalizeDateTime,
	sameSelection,
	hasChanges,
	describe,
	renderStatus,
	renderButton
}), {
	dependencies: ['supportRuntime', 'prescriptionModel'],
	owner: 'doctor/prescription'
});
