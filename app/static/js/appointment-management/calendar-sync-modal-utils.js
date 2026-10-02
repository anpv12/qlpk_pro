import { fieldValue, rebind, removeClass, setFieldValue } from '../shared/dom-query.js';
import { icon, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';

const NS = 'appointmentCalendarSync';
const TABLE_BODY = '#syncCalendarTableBody';

function setDateRangeInputs(displayRange) {
	setFieldValue('#syncDateFrom', displayRange.fromDate);
	setFieldValue('#syncDateTo', displayRange.toDate);
}

function initializeDatePickers(options) {
	if (!options.flatpickrInstance) return;

	const currentWeek = options.syncDateUtils.getCurrentWeekRange();
	options.flatpickrInstance('#syncDateFrom', {
		dateFormat: 'd/m/Y',
		defaultDate: currentWeek.fromDate,
		locale: 'vn',
		onChange: function () {
			options.loadSyncData();
		}
	});

	options.flatpickrInstance('#syncDateTo', {
		dateFormat: 'd/m/Y',
		defaultDate: currentWeek.toDate,
		locale: 'vn',
		onChange: function () {
			options.loadSyncData();
		}
	});
}

function bindDatePresetButtons(options) {
	rebind('.sync-date-preset', 'click', NS, function () {
		const displayRange = options.syncDateUtils.formatDateRangeForDisplay(options.syncDateUtils.getPresetDateRange(this.dataset.preset));
		setDateRangeInputs(displayRange);
		removeClass('.sync-date-preset', 'active');
		this.classList.add('active');
		options.loadSyncData();
	});
}

function bindSearchAndStatusFilters(options) {
	let syncSearchTimeout;
	rebind('#syncSearchInput', 'input', NS, () => {
		clearTimeout(syncSearchTimeout);
		syncSearchTimeout = setTimeout(() => options.filterSyncTable(), 300);
	});
	rebind('#syncStatusFilter', 'change', NS, () => options.filterSyncTable());
}

function bindRefreshButton(options) {
	rebind('#syncRefreshBtn', 'click', NS, () => {
		setFieldValue('#syncSearchInput', '');
		setFieldValue('#syncStatusFilter', 'all');
		setDateRangeInputs(options.syncDateUtils.formatDateRangeForDisplay(options.syncDateUtils.getCurrentWeekRange()));
		options.loadSyncData();
	});
}

function bindSelectionButtons(options) {
	rebind('#syncSelectAll', 'change', NS, function () {
		options.syncControlsUtils.setVisibleCheckboxesChecked(TABLE_BODY, this.checked);
		options.updateSyncButtonStates();
	});
	rebind('#syncAllMissingBtn', 'click', NS, () => {
		const missingIds = options.syncControlsUtils.collectMissingAppointmentIds(TABLE_BODY);
		if (missingIds.length > 0) options.syncAppointments(missingIds);
	});
	rebind('#syncSelectedBtn', 'click', NS, () => {
		const selectedIds = options.syncControlsUtils.collectSelectedAppointmentIds(TABLE_BODY);
		if (selectedIds.length > 0) options.syncAppointments(selectedIds);
	});
}

function setDeleteAllButton(deleting) {
	const button = document.getElementById('deleteAllCalendarEventsBtn');
	if (!button) return;
	button.disabled = deleting;
	replace(button, deleting ? [icon('bi-hourglass-split'), ' Đang xóa...'] : [icon('bi-trash'), ' Xóa tất cả']);
}

function bindDeleteAllButton(options) {
	rebind('#deleteAllCalendarEventsBtn', 'click', NS, async event => {
		event.preventDefault();
		event.stopImmediatePropagation();
		const fromDate = fieldValue('#syncDateFrom');
		const toDate = fieldValue('#syncDateTo');
		const syncedCount = options.syncControlsUtils.countSyncedRows(TABLE_BODY);
		if (syncedCount === 0) {
			options.showCustomToast('warning', 'Không có sự kiện nào để xóa');
			return;
		}
		const confirmMsg = `Bạn có chắc chắn muốn xóa ${syncedCount} sự kiện Google Calendar? Hành động này sẽ không thể hoàn tác ?`;
		if (!await options.customModal.confirm(confirmMsg, 'Xác nhận')) return;
		setDeleteAllButton(true);
		try {
			const response = await requestJson('/api/calendar/delete-all', { method: 'DELETE', json: {
				from_date: options.syncDateUtils.parseDisplayDateToApi(fromDate),
				to_date: options.syncDateUtils.parseDisplayDateToApi(toDate)
			} });
			options.showCustomToast('success', `Đã xóa ${response.deleted_count || 0} sự kiện đã đồng bộ.`);
			options.loadSyncData();
		} catch {
			options.showCustomToast('error', 'Không thể xóa sự kiện đã đồng bộ. Vui lòng thử lại.');
		} finally {
			setDeleteAllButton(false);
		}
	});
}

function bindModalShown(options) {
	rebind('#syncCalendarModal', 'shown.bs.modal', 'calendarSync', () => {
		options.validateCalendarConnections().then(() => options.loadSyncData());
	});
}

function bindModalHidden(options) {
	rebind('#syncCalendarModal', 'hidden.bs.modal', 'calendarSync', () => {
		if (typeof options.abortCalendarSyncRequests === 'function') options.abortCalendarSyncRequests();
	});
}

function initializeSyncCalendarModal(options) {
	initializeDatePickers(options);
	bindDatePresetButtons(options);
	bindSearchAndStatusFilters(options);
	bindRefreshButton(options);
	bindSelectionButtons(options);
	bindDeleteAllButton(options);
	bindModalShown(options);
	bindModalHidden(options);
}

const AppointmentManagementCalendarSyncModalUtils = {
	bindDatePresetButtons,
	bindDeleteAllButton,
	bindModalHidden,
	bindModalShown,
	bindRefreshButton,
	bindSearchAndStatusFilters,
	bindSelectionButtons,
	initializeDatePickers,
	initializeSyncCalendarModal,
	setDateRangeInputs
};

export { AppointmentManagementCalendarSyncModalUtils };
