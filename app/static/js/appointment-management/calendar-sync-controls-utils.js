(function (window) {
	'use strict';

	function buildLoadingRowHtml() {
		return `
			<tr>
				<td colspan="7" class="appointment-sync-loading-cell">
					<div class="spinner-border appointment-sync-spinner" role="status"></div>
					<div class="appointment-sync-loading-text">Đang tải dữ liệu...</div>
				</td>
			</tr>
		`;
	}

	function buildErrorRowHtml() {
		return `
			<tr>
				<td colspan="7" class="appointment-sync-error-cell">
					<i class="bi bi-exclamation-triangle appointment-empty-icon appointment-sync-empty-icon"></i>
					Không thể tải dữ liệu đồng bộ. Vui lòng thử lại.
				</td>
			</tr>
		`;
	}

	function getSyncedAppointmentIds(appointments) {
		return (appointments || [])
			.filter(appointment => appointment.sync_status === 'synced')
			.map(appointment => appointment.id);
	}

	function collectAppointmentIds($, selector) {
		const appointmentIds = [];
		$(selector).each(function () {
			appointmentIds.push(parseInt($(this).data('appt-id')));
		});
		return appointmentIds;
	}

	function collectMissingAppointmentIds($, tableBodySelector) {
		return collectAppointmentIds($, `${tableBodySelector} tr[data-sync-status="missing"]`);
	}

	function collectSelectedAppointmentIds($, tableBodySelector) {
		return collectAppointmentIds($, `${tableBodySelector} input.sync-checkbox:checked`);
	}

	function setVisibleCheckboxesChecked($, tableBodySelector, isChecked) {
		$(`${tableBodySelector} input[type="checkbox"].sync-checkbox:visible`).prop('checked', isChecked);
	}

	function updateSelectedButtonState($, tableBodySelector, selectedButtonSelector) {
		const checkedCount = $(`${tableBodySelector} input.sync-checkbox:checked`).length;
		$(selectedButtonSelector).prop('disabled', checkedCount === 0);
		return checkedCount;
	}

	function countSyncedRows($, tableBodySelector) {
		return $(`${tableBodySelector} tr[data-sync-status="synced"]`).length;
	}

	function getSyncStatusCounts($, tableBodySelector) {
		const counts = {
			total: 0,
			synced: 0,
			missing: 0,
			error: 0
		};

		$(`${tableBodySelector} tr[data-appt-id]`).each(function () {
			const status = $(this).attr('data-sync-status');
			counts.total += 1;
			if (status === 'synced') counts.synced += 1;
			else if (status === 'missing') counts.missing += 1;
			else if (status === 'error') counts.error += 1;
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

	function renderSyncBadgeTexts($, badgeTexts, selectors) {
		const badgeSelectors = selectors || {};
		$(badgeSelectors.total || '#syncBadgeTotal').text(badgeTexts.total);
		$(badgeSelectors.synced || '#syncBadgeSynced').text(badgeTexts.synced);
		$(badgeSelectors.missing || '#syncBadgeMissing').text(badgeTexts.missing);
		$(badgeSelectors.error || '#syncBadgeError').text(badgeTexts.error);
	}

	function updateBadgesAfterRowStatusChange($, options) {
		const counts = getSyncStatusCounts($, options.tableBodySelector);
		renderSyncBadgeTexts($, getBadgeTextsFromCounts(counts), options.badgeSelectors);
		$(options.allMissingButtonSelector).prop('disabled', counts.missing === 0);
		return counts;
	}

	function setBulkButtonsDisabled($, disabled) {
		$('#syncAllMissingBtn, #syncSelectedBtn').prop('disabled', disabled);
	}

	function setActionButtonsLoading($, appointmentIds) {
		(appointmentIds || []).forEach(apptId => {
			const $button = $(`.action-btn[data-appt-id="${apptId}"]`);
			$button.prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Đang sync...');
		});
	}

	function resetActionButtonsToDefault($, appointmentIds) {
		(appointmentIds || []).forEach(apptId => {
			const $button = $(`.action-btn[data-appt-id="${apptId}"]`);
			$button.removeClass('appointment-button--success appointment-button--warning appointment-button--neutral')
				.addClass('appointment-button--primary sync-single-btn')
				.prop('disabled', false)
				.html('<i class="bi bi-arrow-repeat"></i> Đồng bộ');
		});
	}

	function applyActionButtonState($button, state) {
		$button.removeClass(state.removeClass)
			.addClass(state.addClass)
			.prop('disabled', state.disabled)
			.html(state.html);
	}

	window.AppointmentManagementCalendarSyncControlsUtils = {
		applyActionButtonState,
		buildErrorRowHtml,
		buildLoadingRowHtml,
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
})(window);
