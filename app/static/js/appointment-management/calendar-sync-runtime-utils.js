import { fieldValue, rebindDelegate, setProp } from '../shared/dom-query.js';
import { replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
const SYNC_VERIFY_BATCH_SIZE = 5;
const SYNC_WRITE_BATCH_SIZE = 50;
let syncVerifyRunId = 0;
let activeSyncStatusRequest = null;
let activeVerifyRequest = null;

const TABLE_BODY = '#syncCalendarTableBody';
const tableBody = () => document.querySelector(TABLE_BODY);
const isAbort = error => error?.name === 'AbortError';

function buildValidationWarningMessage(data) {
	let message = '';
	if (data.invalidated_count > 0) {
		message += `${data.invalidated_count} kết nối không hợp lệ đã bị vô hiệu hóa. `;
	}
	if (data.duplicate_count > 0) {
		message += `${data.duplicate_count} kết nối trùng email đã bị vô hiệu hóa.`;
	}
	return message;
}

function validateCalendarConnections(options) {
	if (!options.hasSession()) return Promise.resolve();
	return requestJson('/api/calendar/validate-connections', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(data => {
		if (data.success && (data.invalidated_count > 0 || data.duplicate_count > 0)) {
			options.showCustomToast('warning', buildValidationWarningMessage(data));
		}
	}).catch(error => {
		console.error('Error validating connections:', error?.data);
	});
}

function isCurrentSyncVerifyRun(runId) {
	return runId === syncVerifyRunId;
}

function abortCalendarSyncRequests() {
	activeSyncStatusRequest?.abort();
	activeVerifyRequest?.abort();
	activeSyncStatusRequest = null;
	activeVerifyRequest = null;
}

function startNewSyncVerifyRun() {
	syncVerifyRunId += 1;
	abortCalendarSyncRequests();
	return syncVerifyRunId;
}

function chunkSyncVerifyIds(appointmentIds) {
	const batches = [];
	for (let i = 0; i < appointmentIds.length; i += SYNC_VERIFY_BATCH_SIZE) {
		batches.push(appointmentIds.slice(i, i + SYNC_VERIFY_BATCH_SIZE));
	}
	return batches;
}

function setSyncRowStatus(appointmentId, status) {
	const rows = [...document.querySelectorAll(`${TABLE_BODY} tr[data-appt-id="${appointmentId}"]`)];
	rows.forEach(row => row.setAttribute('data-sync-status', status));
	return rows;
}

async function loadSyncData(options) {
	const runId = startNewSyncVerifyRun();
	if (!options.hasSession()) {
		options.showCustomToast('error', 'Vui lòng đăng nhập lại');
		return;
	}
	const fromDate = options.syncDateUtils.parseDisplayDateToApi(fieldValue('#syncDateFrom'));
	const toDate = options.syncDateUtils.parseDisplayDateToApi(fieldValue('#syncDateTo'));
	if (!fromDate || !toDate) {
		options.showCustomToast('warning', 'Vui lòng chọn khoảng thời gian');
		return;
	}
	replace(tableBody(), options.controlsUtils.buildLoadingRow());

	const controller = new AbortController();
	activeSyncStatusRequest = controller;
	let data;
	try {
		data = await requestJson(`/api/calendar/sync-status?from=${fromDate}&to=${toDate}`, { signal: controller.signal });
	} catch (error) {
		if (isAbort(error) || !isCurrentSyncVerifyRun(runId)) return;
		replace(tableBody(), options.controlsUtils.buildErrorRow());
		activeSyncStatusRequest = null;
		return;
	}
	if (!isCurrentSyncVerifyRun(runId)) return;
	activeSyncStatusRequest = null;
	options.renderSyncTable(data);
	setProp('#syncAllMissingBtn', 'disabled', data.missing === 0);
	const syncedIds = options.controlsUtils.getSyncedAppointmentIds(data.appointments);
	if (syncedIds.length > 0) verifyCalendarEvents(options, syncedIds, runId);
}

function renderSyncTable(options, data) {
	const tableView = options.tableUtils.buildSyncTableView(data);
	options.controlsUtils.renderSyncBadgeTexts(tableView.badgeTexts);
	replace(tableBody(), tableView.rows);
	if (tableView.isEmpty) return;
	rebindDelegate(tableBody(), 'click', '.sync-single-btn', 'appointmentCalendarSync', function () {
		if (this.disabled) return;
		this.disabled = true;
		options.syncAppointments([Number(this.dataset.apptId) || this.dataset.apptId]);
	});
	rebindDelegate(tableBody(), 'change', '.sync-checkbox', 'appointmentCalendarSync', () => options.updateSyncButtonStates());
}

function updateSyncButtonStates(options) {
	options.controlsUtils.updateSelectedButtonState(TABLE_BODY, '#syncSelectedBtn');
}

function verifyCalendarEvents(options, appointmentIds, runId) {
	if (!options.hasSession() || !appointmentIds || appointmentIds.length === 0) return;
	verifyCalendarEventBatch(options, chunkSyncVerifyIds(appointmentIds), 0, runId || syncVerifyRunId);
}

// Verifies one batch, then the next; a newer run (or abort) stops the chain
async function verifyCalendarEventBatch(options, batches, batchIndex, runId) {
	if (!isCurrentSyncVerifyRun(runId) || batchIndex >= batches.length) {
		activeVerifyRequest = null;
		return;
	}
	const batchIds = batches[batchIndex];
	const controller = new AbortController();
	activeVerifyRequest = controller;
	try {
		const data = await requestJson('/api/calendar/verify-events', { method: 'POST', json: { appointment_ids: batchIds }, signal: controller.signal });
		if (!isCurrentSyncVerifyRun(runId)) return;
		if (data.success && data.results) {
			applyVerifyResults(options, data.results, runId);
			const missingResultIds = batchIds.filter(appointmentId => !Object.prototype.hasOwnProperty.call(data.results, String(appointmentId)));
			if (missingResultIds.length > 0) markVerifyBatchError(options, missingResultIds, runId);
		} else {
			markVerifyBatchError(options, batchIds, runId);
		}
	} catch (error) {
		if (isAbort(error) || !isCurrentSyncVerifyRun(runId)) return;
		console.error('Error verifying events:', error?.data);
		markVerifyBatchError(options, batchIds, runId);
	}
	activeVerifyRequest = null;
	verifyCalendarEventBatch(options, batches, batchIndex + 1, runId);
}

const verifyIcons = appointmentId => [...document.querySelectorAll(`.verify-icons[data-appt-id="${appointmentId}"]`)];

function applyVerifyResults(options, results, runId) {
	if (!isCurrentSyncVerifyRun(runId)) return;
	Object.keys(results).forEach(appointmentId => {
		const result = results[appointmentId];
		const icons = verifyIcons(appointmentId);
		if (!icons.length) return;
		icons.forEach(node => replace(node, options.statusUtils.buildVerifyEventsIcons(result)));
		setSyncRowStatus(appointmentId, options.statusUtils.getVerifyRowStatus(result));
		options.controlsUtils.actionButtons(appointmentId).forEach(button => options.controlsUtils.applyActionButtonState(button, options.statusUtils.getVerifyButtonState(result)));
	});
	options.updateSyncBadgesAfterVerify();
}

function markVerifyBatchError(options, appointmentIds, runId) {
	if (!isCurrentSyncVerifyRun(runId)) return;
	(appointmentIds || []).forEach(appointmentId => {
		if (!setSyncRowStatus(appointmentId, 'error').length) return;
		verifyIcons(appointmentId).forEach(node => replace(node, options.statusUtils.syncBadge('warning', 'bi-exclamation-triangle', 'Lỗi kiểm tra')));
		options.controlsUtils.actionButtons(appointmentId).forEach(button => options.controlsUtils.applyActionButtonState(button, {
			...options.controlsUtils.DEFAULT_BUTTON_STATE,
			removeClass: 'appointment-button--neutral appointment-button--success appointment-button--warning'
		}));
	});
	options.updateSyncBadgesAfterVerify();
}

function updateSyncBadgesAfterVerify(options) {
	options.controlsUtils.updateBadgesAfterRowStatusChange({
		allMissingButtonSelector: '#syncAllMissingBtn',
		tableBodySelector: TABLE_BODY
	});
}

function syncAppointments(options, appointmentIds) {
	if (!options.hasSession()) {
		options.showCustomToast('error', 'Vui lòng đăng nhập lại');
		return;
	}
	const ids = Array.from(new Set(appointmentIds || []));
	if (ids.length === 0) return;
	options.controlsUtils.setBulkButtonsDisabled(true);
	options.controlsUtils.setActionButtonsLoading(ids);
	options.showCustomToast('info', `Đang đồng bộ ${ids.length} lịch hẹn...`);
	const batches = [];
	for (let index = 0; index < ids.length; index += SYNC_WRITE_BATCH_SIZE) {
		batches.push(ids.slice(index, index + SYNC_WRITE_BATCH_SIZE));
	}
	syncAppointmentBatches(options, batches);
}

function applySyncResults(options, results, summary) {
	Object.keys(results || {}).forEach(appointmentId => {
		const result = results[appointmentId];
		verifyIcons(appointmentId).forEach(node => replace(node, options.statusUtils.buildSyncResultIcons(result)));
		const rowStatus = options.statusUtils.getSyncResultRowStatus(result);
		options.controlsUtils.actionButtons(appointmentId).forEach(button => options.controlsUtils.applyActionButtonState(button, options.statusUtils.getSyncResultButtonState(result)));
		document.querySelectorAll(`tr[data-appt-id="${appointmentId}"]`).forEach(row => row.setAttribute('data-sync-status', rowStatus));
		if (rowStatus === 'error' && result.errors && result.errors.length > 0) summary.warned = true;
	});
}

function finishSyncAppointments(options, summary) {
	options.controlsUtils.setBulkButtonsDisabled(false);
	options.updateSyncCounters();
	if (summary.failed) {
		options.showCustomToast('error', 'Có nhóm lịch hẹn chưa đồng bộ được. Vui lòng thử lại.');
	} else if (summary.warned) {
		options.showCustomToast('warning', 'Có lịch hẹn chưa đồng bộ được. Vui lòng kiểm tra trạng thái trong danh sách.');
	} else {
		options.showCustomToast('success', 'Đã đồng bộ lịch hẹn.');
	}
}

// Batches are written one after another; a failed batch resets its buttons and the run continues
async function syncAppointmentBatches(options, batches) {
	const summary = { failed: false, warned: false };
	for (const batchIds of batches) {
		try {
			const data = await requestJson('/api/calendar/sync', { method: 'POST', json: { appointment_ids: batchIds } });
			applySyncResults(options, data && data.results, summary);
		} catch {
			summary.failed = true;
			options.controlsUtils.resetActionButtonsToDefault(batchIds);
		}
	}
	finishSyncAppointments(options, summary);
}

function updateSyncCounters(options) {
	options.updateSyncBadgesAfterVerify();
}

function filterSyncTable(options) {
	options.filterUtils.filterSyncTableRows({
		searchText: fieldValue('#syncSearchInput'),
		statusFilter: fieldValue('#syncStatusFilter'),
		tableBodySelector: TABLE_BODY
	});
}

const AppointmentManagementCalendarSyncRuntimeUtils = {
	abortCalendarSyncRequests,
	buildValidationWarningMessage,
	chunkSyncVerifyIds,
	filterSyncTable,
	isCurrentSyncVerifyRun,
	loadSyncData,
	markVerifyBatchError,
	renderSyncTable,
	syncAppointments,
	updateSyncBadgesAfterVerify,
	updateSyncButtonStates,
	updateSyncCounters,
	validateCalendarConnections,
	verifyCalendarEvents
};

export { AppointmentManagementCalendarSyncRuntimeUtils };
