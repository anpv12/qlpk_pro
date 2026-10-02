import { el, icon } from '../shared/dom.js';

// Status chip in the sync table: variant success|warning|danger|neutral|info
function syncBadge(variant, iconName, label, title) {
	return el('span', { class: `qlpk-status appointment-sync-badge appointment-sync-badge--${variant}`, title }, icon(iconName), ` ${label}`);
}

const FULL_BADGE = () => syncBadge('success', 'bi-check-circle-fill', 'Đã đồng bộ');
const PARTIAL_BADGE = () => syncBadge('warning', 'bi-exclamation-triangle', 'Thiếu');

function buildVerifySyncStatusBadge(result) {
	if (result.sync_status === 'full') return FULL_BADGE();
	if (result.sync_status === 'partial') return PARTIAL_BADGE();
	return null;
}

// Verified on Google Calendar (true), not found (false) or no event yet (other)
function verifyBadge(verified, label, name) {
	if (verified === true) return syncBadge('success', 'bi-check-circle-fill', label, `${name || label}: Đã xác nhận trên GCal`);
	if (verified === false) return syncBadge('danger', 'bi-x-circle-fill', label, `${name || label}: Không tìm thấy event trên GCal`);
	return syncBadge('neutral', 'bi-dash-circle', label, `${label}: Chưa có event`);
}

function buildVerifyEventsIcons(result) {
	return [
		buildVerifySyncStatusBadge(result),
		verifyBadge(result.doctor_verified, result.doctor_role || 'Bác sĩ', result.doctor_name),
		verifyBadge(result.receptionist_verified, 'Lễ tân', result.receptionist_name),
	];
}

function getVerifyRowStatus(result) {
	return result.sync_status === 'full' ? 'synced' : 'missing';
}

const buttonContent = (iconName, label) => [icon(iconName), ` ${label}`];

function getVerifyButtonState(result) {
	if (result.sync_status === 'full') {
		return {
			addClass: 'appointment-button--success',
			disabled: true,
			content: () => buttonContent('bi-check-circle', 'Đã đồng bộ'),
			removeClass: 'appointment-button--neutral appointment-button--primary appointment-button--warning sync-single-btn'
		};
	}
	return {
		addClass: 'appointment-button--primary sync-single-btn',
		disabled: false,
		content: () => buttonContent('bi-arrow-repeat', 'Đồng bộ'),
		removeClass: 'appointment-button--neutral appointment-button--success appointment-button--warning'
	};
}

// Result of a sync run: true = synced, false = failed, null = account not connected
function syncResultBadge(verified, label) {
	if (verified === true) return syncBadge('success', 'bi-check-circle-fill', label, label);
	if (verified === false) return syncBadge('danger', 'bi-x-circle-fill', label, `${label} - Lỗi`);
	if (verified === null) return syncBadge('neutral', 'bi-dash-circle', label, `${label} chưa kết nối`);
	return null;
}

function buildSyncResultIcons(result) {
	return [
		buildVerifySyncStatusBadge(result),
		syncResultBadge(result.doctor_verified, result.doctor_role || 'Bác sĩ'),
		syncResultBadge(result.receptionist_verified, 'Lễ tân'),
	];
}

function getSyncResultRowStatus(result) {
	if (result.sync_status === 'full') return 'synced';
	if (result.sync_status === 'partial') return 'partial';
	return 'error';
}

function getSyncResultButtonState(result) {
	if (result.sync_status === 'full') {
		return {
			addClass: 'appointment-button--success',
			disabled: true,
			content: () => buttonContent('bi-check-circle', 'Đã đồng bộ'),
			removeClass: 'appointment-button--primary appointment-button--warning sync-single-btn'
		};
	}
	if (result.sync_status === 'partial') {
		return {
			addClass: 'appointment-button--warning',
			disabled: true,
			content: () => buttonContent('bi-exclamation-circle', 'Một phần'),
			removeClass: 'appointment-button--primary appointment-button--success sync-single-btn'
		};
	}
	return {
		addClass: 'appointment-button--primary sync-single-btn',
		disabled: false,
		content: () => buttonContent('bi-arrow-repeat', 'Đồng bộ'),
		removeClass: 'appointment-button--success appointment-button--warning'
	};
}

const AppointmentManagementCalendarSyncStatusUtils = {
	buildSyncResultIcons,
	buildVerifyEventsIcons,
	getSyncResultButtonState,
	getSyncResultRowStatus,
	getVerifyButtonState,
	getVerifyRowStatus,
	syncBadge
};

export { AppointmentManagementCalendarSyncStatusUtils };
