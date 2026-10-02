import { setProp, setText } from '../shared/dom-query.js';
import { el, icon, replace } from '../shared/dom.js';

function buildLoadingRow() {
	return el('tr', {}, el('td', { colspan: 7, class: 'appointment-sync-loading-cell' },
		el('div', { class: 'spinner-border appointment-sync-spinner', role: 'status' }),
		el('div', { class: 'appointment-sync-loading-text' }, 'Đang tải dữ liệu...')));
}

function buildErrorRow() {
	return el('tr', {}, el('td', { colspan: 7, class: 'appointment-sync-error-cell' },
		icon('bi-exclamation-triangle', 'appointment-empty-icon appointment-sync-empty-icon'), ' Không thể tải dữ liệu đồng bộ. Vui lòng thử lại.'));
}

function getSyncedAppointmentIds(appointments) {
	return (appointments || [])
		.filter(appointment => appointment.sync_status === 'synced')
		.map(appointment => appointment.id);
}

const appointmentIdsOf = selector => [...document.querySelectorAll(selector)].map(node => parseInt(node.dataset.apptId));

function collectMissingAppointmentIds(tableBodySelector) {
	return appointmentIdsOf(`${tableBodySelector} tr[data-sync-status="missing"]`);
}

function collectSelectedAppointmentIds(tableBodySelector) {
	return appointmentIdsOf(`${tableBodySelector} input.sync-checkbox:checked`);
}

// Rows hidden by the filter or a collapsed date group are left untouched
function setVisibleCheckboxesChecked(tableBodySelector, isChecked) {
	document.querySelectorAll(`${tableBodySelector} input[type="checkbox"].sync-checkbox`).forEach(box => {
		if (!box.closest('tr')?.hidden) box.checked = isChecked;
	});
}

function updateSelectedButtonState(tableBodySelector, selectedButtonSelector) {
	const checkedCount = document.querySelectorAll(`${tableBodySelector} input.sync-checkbox:checked`).length;
	setProp(selectedButtonSelector, 'disabled', checkedCount === 0);
	return checkedCount;
}

function countSyncedRows(tableBodySelector) {
	return document.querySelectorAll(`${tableBodySelector} tr[data-sync-status="synced"]`).length;
}

function getSyncStatusCounts(tableBodySelector) {
	const counts = { total: 0, synced: 0, missing: 0, error: 0 };
	document.querySelectorAll(`${tableBodySelector} tr[data-appt-id]`).forEach(row => {
		const status = row.getAttribute('data-sync-status');
		counts.total += 1;
		if (status in counts && status !== 'total') counts[status] += 1;
	});
	return counts;
}

function getBadgeTextsFromCounts(counts) {
	return {
		total: 'Tổng: ' + counts.total,
		synced: 'Đã đồng bộ: ' + counts.synced,
		missing: 'Thiếu: ' + counts.missing,
		error: 'Lỗi: ' + counts.error
	};
}

function renderSyncBadgeTexts(badgeTexts, selectors = {}) {
	setText(selectors.total || '#syncBadgeTotal', badgeTexts.total);
	setText(selectors.synced || '#syncBadgeSynced', badgeTexts.synced);
	setText(selectors.missing || '#syncBadgeMissing', badgeTexts.missing);
	setText(selectors.error || '#syncBadgeError', badgeTexts.error);
}

function updateBadgesAfterRowStatusChange(options) {
	const counts = getSyncStatusCounts(options.tableBodySelector);
	renderSyncBadgeTexts(getBadgeTextsFromCounts(counts), options.badgeSelectors);
	setProp(options.allMissingButtonSelector, 'disabled', counts.missing === 0);
	return counts;
}

function setBulkButtonsDisabled(disabled) {
	setProp('#syncAllMissingBtn, #syncSelectedBtn', 'disabled', disabled);
}

const actionButtons = appointmentId => document.querySelectorAll(`.action-btn[data-appt-id="${appointmentId}"]`);

function setActionButtonsLoading(appointmentIds) {
	(appointmentIds || []).forEach(apptId => actionButtons(apptId).forEach(button => {
		button.disabled = true;
		replace(button, icon('bi-hourglass-split'), ' Đang sync...');
	}));
}

const DEFAULT_BUTTON_STATE = {
	addClass: 'appointment-button--primary sync-single-btn',
	disabled: false,
	content: () => [icon('bi-arrow-repeat'), ' Đồng bộ'],
	removeClass: 'appointment-button--success appointment-button--warning appointment-button--neutral'
};

function resetActionButtonsToDefault(appointmentIds) {
	(appointmentIds || []).forEach(apptId => actionButtons(apptId).forEach(button => applyActionButtonState(button, DEFAULT_BUTTON_STATE)));
}

// buttonState: { removeClass, addClass, disabled, content: () => nodes }
function applyActionButtonState(button, buttonState) {
	if (!button) return;
	button.classList.remove(...buttonState.removeClass.split(/\s+/).filter(Boolean));
	button.classList.add(...buttonState.addClass.split(/\s+/).filter(Boolean));
	button.disabled = buttonState.disabled;
	replace(button, buttonState.content());
}

const AppointmentManagementCalendarSyncControlsUtils = {
	DEFAULT_BUTTON_STATE,
	actionButtons,
	applyActionButtonState,
	buildErrorRow,
	buildLoadingRow,
	collectMissingAppointmentIds,
	collectSelectedAppointmentIds,
	countSyncedRows,
	getBadgeTextsFromCounts,
	getSyncedAppointmentIds,
	getSyncStatusCounts,
	renderSyncBadgeTexts,
	resetActionButtonsToDefault,
	setActionButtonsLoading,
	setBulkButtonsDisabled,
	setVisibleCheckboxesChecked,
	updateBadgesAfterRowStatusChange,
	updateSelectedButtonState
};

export { AppointmentManagementCalendarSyncControlsUtils };
