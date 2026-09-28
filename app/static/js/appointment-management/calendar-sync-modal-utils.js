(function (window) {
	'use strict';

	function setDateRangeInputs($, displayRange) {
		$('#syncDateFrom').val(displayRange.fromDate);
		$('#syncDateTo').val(displayRange.toDate);
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
		options.$('.sync-date-preset').off('click.appointmentCalendarSync').on('click.appointmentCalendarSync', function () {
			const preset = options.$(this).data('preset');
			const displayRange = options.syncDateUtils.formatDateRangeForDisplay(
				options.syncDateUtils.getPresetDateRange(preset)
			);

			setDateRangeInputs(options.$, displayRange);
			options.$('.sync-date-preset').removeClass('active');
			options.$(this).addClass('active');
			options.loadSyncData();
		});
	}

	function bindSearchAndStatusFilters(options) {
		let syncSearchTimeout;
		options.$('#syncSearchInput').off('input.appointmentCalendarSync').on('input.appointmentCalendarSync', function () {
			clearTimeout(syncSearchTimeout);
			syncSearchTimeout = setTimeout(function () {
				options.filterSyncTable();
			}, 300);
		});

		options.$('#syncStatusFilter').off('change.appointmentCalendarSync').on('change.appointmentCalendarSync', function () {
			options.filterSyncTable();
		});
	}

	function bindRefreshButton(options) {
		options.$('#syncRefreshBtn').off('click.appointmentCalendarSync').on('click.appointmentCalendarSync', function () {
			options.$('#syncSearchInput').val('');
			options.$('#syncStatusFilter').val('all');
			const displayRange = options.syncDateUtils.formatDateRangeForDisplay(options.syncDateUtils.getCurrentWeekRange());
			setDateRangeInputs(options.$, displayRange);
			options.loadSyncData();
		});
	}

	function bindSelectionButtons(options) {
		options.$('#syncSelectAll').off('change.appointmentCalendarSync').on('change.appointmentCalendarSync', function () {
			const isChecked = options.$(this).prop('checked');
			options.syncControlsUtils.setVisibleCheckboxesChecked(options.$, '#syncCalendarTableBody', isChecked);
			options.updateSyncButtonStates();
		});

		options.$('#syncAllMissingBtn').off('click.appointmentCalendarSync').on('click.appointmentCalendarSync', function () {
			const missingIds = options.syncControlsUtils.collectMissingAppointmentIds(options.$, '#syncCalendarTableBody');
			if (missingIds.length > 0) {
				options.syncAppointments(missingIds);
			}
		});

		options.$('#syncSelectedBtn').off('click.appointmentCalendarSync').on('click.appointmentCalendarSync', function () {
			const selectedIds = options.syncControlsUtils.collectSelectedAppointmentIds(options.$, '#syncCalendarTableBody');
			if (selectedIds.length > 0) {
				options.syncAppointments(selectedIds);
			}
		});
	}

	function bindDeleteAllButton(options) {
		options.$('#deleteAllCalendarEventsBtn').off('click.appointmentCalendarSync').on('click.appointmentCalendarSync', function (event) {
			event.preventDefault();
			event.stopImmediatePropagation();

			const $button = options.$('#deleteAllCalendarEventsBtn');
			const fromDate = options.$('#syncDateFrom').val();
			const toDate = options.$('#syncDateTo').val();
			const syncedCount = options.syncControlsUtils.countSyncedRows(options.$, '#syncCalendarTableBody');

			if (syncedCount === 0) {
				options.showCustomToast('warning', 'Không có sự kiện nào để xóa');
				return false;
			}

			const confirmMsg = `Bạn có chắc chắn muốn xóa ${syncedCount} sự kiện Google Calendar? Hành động này sẽ không thể hoàn tác ?`;
			options.customModal.confirm(confirmMsg, 'Xác nhận').then((confirmed) => {
				if (!confirmed) return;

				$button.prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Đang xóa...');

				options.$.ajax({
					url: '/api/calendar/delete-all',
					method: 'DELETE',
					contentType: 'application/json',
					data: JSON.stringify({
						from_date: options.syncDateUtils.parseDisplayDateToApi(fromDate),
						to_date: options.syncDateUtils.parseDisplayDateToApi(toDate)
					}),
					success: function (response) {
						options.showCustomToast('success', `Đã xóa ${response.deleted_count || 0} sự kiện đã đồng bộ.`);
						options.loadSyncData();
					},
					error: function (xhr) {
						options.showCustomToast('error', 'Không thể xóa sự kiện đã đồng bộ. Vui lòng thử lại.');
					},
					complete: function () {
						options.$('#deleteAllCalendarEventsBtn').prop('disabled', false).html('<i class="bi bi-trash"></i> Xóa tất cả');
					}
				});
			});

			return false;
		});
	}

	function bindModalShown(options) {
		options.$('#syncCalendarModal').off('shown.bs.modal.calendarSync').on('shown.bs.modal.calendarSync', function () {
			options.validateCalendarConnections().then(() => {
				options.loadSyncData();
			});
		});
	}

	function bindModalHidden(options) {
		options.$('#syncCalendarModal').off('hidden.bs.modal.calendarSync').on('hidden.bs.modal.calendarSync', function () {
			if (typeof options.abortCalendarSyncRequests === 'function') {
				options.abortCalendarSyncRequests();
			}
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

	window.AppointmentManagementCalendarSyncModalUtils = {
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
})(window);
