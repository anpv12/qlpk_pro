(function (window) {
	'use strict';

	const SYNC_VERIFY_BATCH_SIZE = 5;
	const SYNC_WRITE_BATCH_SIZE = 50;
	let syncVerifyRunId = 0;
	let activeSyncStatusRequest = null;
	let activeVerifyRequest = null;

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

		return options.$.ajax({
			url: '/api/calendar/validate-connections',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		}).then(function (data) {
			if (data.success && (data.invalidated_count > 0 || data.duplicate_count > 0)) {
				options.showCustomToast('warning', buildValidationWarningMessage(data));
			}
		}).catch(function (xhr) {
			console.error('Error validating connections:', xhr.responseText);
		});
	}

	function isCurrentSyncVerifyRun(runId) {
		return runId === syncVerifyRunId;
	}

	function abortCalendarSyncRequests() {
		if (activeSyncStatusRequest && activeSyncStatusRequest.readyState !== 4) {
			activeSyncStatusRequest.abort();
		}
		if (activeVerifyRequest && activeVerifyRequest.readyState !== 4) {
			activeVerifyRequest.abort();
		}
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

	function setSyncRowStatus(options, appointmentId, status) {
		const $row = options.$(`#syncCalendarTableBody tr[data-appt-id="${appointmentId}"]`);
		$row.attr('data-sync-status', status).data('sync-status', status);
		return $row;
	}

	function loadSyncData(options) {
		const runId = startNewSyncVerifyRun();
		if (!options.hasSession()) {
			options.showCustomToast('error', 'Vui lòng đăng nhập lại');
			return;
		}

		const fromDate = options.syncDateUtils.parseDisplayDateToApi(options.$('#syncDateFrom').val());
		const toDate = options.syncDateUtils.parseDisplayDateToApi(options.$('#syncDateTo').val());

		if (!fromDate || !toDate) {
			options.showCustomToast('warning', 'Vui lòng chọn khoảng thời gian');
			return;
		}

		options.$('#syncCalendarTableBody').html(options.controlsUtils.buildLoadingRowHtml());

		activeSyncStatusRequest = options.$.ajax({
			url: `/api/calendar/sync-status?from=${fromDate}&to=${toDate}`,
			method: 'GET',
			success: function (data) {
				if (!isCurrentSyncVerifyRun(runId)) return;

				options.renderSyncTable(data);
				options.$('#syncAllMissingBtn').prop('disabled', data.missing === 0);

				const syncedIds = options.controlsUtils.getSyncedAppointmentIds(data.appointments);
				if (syncedIds.length > 0) {
					verifyCalendarEvents(options, syncedIds, runId);
				}
			},
			error: function (xhr, textStatus) {
				if (textStatus === 'abort' || !isCurrentSyncVerifyRun(runId)) return;

				options.$('#syncCalendarTableBody').html(
					options.controlsUtils.buildErrorRowHtml('Không thể tải dữ liệu đồng bộ. Vui lòng thử lại.')
				);
			},
			complete: function () {
				if (isCurrentSyncVerifyRun(runId)) {
					activeSyncStatusRequest = null;
				}
			}
		});
	}

	function renderSyncTable(options, data) {
		const tbody = options.$('#syncCalendarTableBody');
		const tableView = options.tableUtils.buildSyncTableView(data);

		options.controlsUtils.renderSyncBadgeTexts(options.$, tableView.badgeTexts);
		tbody.html(tableView.bodyHtml);

		if (tableView.isEmpty) {
			return;
		}

		options.$('#syncCalendarTableBody').off('click.appointmentCalendarSync', '.sync-single-btn').on('click.appointmentCalendarSync', '.sync-single-btn', function () {
			const $button = options.$(this);
			if ($button.prop('disabled')) return;
			$button.prop('disabled', true);

			const appointmentId = $button.data('appt-id');
			options.syncAppointments([appointmentId]);
		});

		options.$('#syncCalendarTableBody').off('change.appointmentCalendarSync', '.sync-checkbox').on('change.appointmentCalendarSync', '.sync-checkbox', function () {
			options.updateSyncButtonStates();
		});
	}

	function updateSyncButtonStates(options) {
		options.controlsUtils.updateSelectedButtonState(options.$, '#syncCalendarTableBody', '#syncSelectedBtn');
	}

	function verifyCalendarEvents(options, appointmentIds, runId) {
		if (!options.hasSession() || !appointmentIds || appointmentIds.length === 0) return;

		const currentRunId = runId || syncVerifyRunId;
		const batches = chunkSyncVerifyIds(appointmentIds);
		verifyCalendarEventBatch(options, batches, 0, currentRunId);
	}

	function verifyCalendarEventBatch(options, batches, batchIndex, runId) {
		if (!isCurrentSyncVerifyRun(runId) || batchIndex >= batches.length) {
			activeVerifyRequest = null;
			return;
		}

		const batchIds = batches[batchIndex];
		activeVerifyRequest = options.$.ajax({
			url: '/api/calendar/verify-events',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			data: JSON.stringify({ appointment_ids: batchIds }),
			success: function (data) {
				if (!isCurrentSyncVerifyRun(runId)) return;

				if (data.success && data.results) {
					applyVerifyResults(options, data.results, runId);

					const missingResultIds = batchIds.filter(function (appointmentId) {
						return !Object.prototype.hasOwnProperty.call(data.results, String(appointmentId));
					});
					if (missingResultIds.length > 0) {
						markVerifyBatchError(options, missingResultIds, runId);
					}
				} else {
					markVerifyBatchError(options, batchIds, runId);
				}
			},
			error: function (xhr, textStatus) {
				if (textStatus === 'abort' || !isCurrentSyncVerifyRun(runId)) return;

				console.error('Error verifying events:', xhr.responseText);
				markVerifyBatchError(options, batchIds, runId);
			},
			complete: function (xhr, textStatus) {
				if (textStatus === 'abort' || !isCurrentSyncVerifyRun(runId)) return;

				activeVerifyRequest = null;
				verifyCalendarEventBatch(options, batches, batchIndex + 1, runId);
			}
		});
	}

	function applyVerifyResults(options, results, runId) {
		if (!isCurrentSyncVerifyRun(runId)) return;

		Object.keys(results).forEach(function (appointmentId) {
			const result = results[appointmentId];
			const $icons = options.$(`.verify-icons[data-appt-id="${appointmentId}"]`);

			if ($icons.length) {
				$icons.html(options.statusUtils.buildVerifyEventsIconsHtml(result));
				setSyncRowStatus(options, appointmentId, options.statusUtils.getVerifyRowStatus(result));

				const $actionButton = options.$(`.action-btn[data-appt-id="${appointmentId}"]`);
				if ($actionButton.length) {
					options.controlsUtils.applyActionButtonState($actionButton, options.statusUtils.getVerifyButtonState(result));
				}
			}
		});

		options.updateSyncBadgesAfterVerify();
	}

	function markVerifyBatchError(options, appointmentIds, runId) {
		if (!isCurrentSyncVerifyRun(runId)) return;

		(appointmentIds || []).forEach(function (appointmentId) {
			const $row = setSyncRowStatus(options, appointmentId, 'error');
			if (!$row.length) return;

			const $icons = options.$(`.verify-icons[data-appt-id="${appointmentId}"]`);
			$icons.html('<span class="qlpk-status appointment-sync-badge appointment-sync-badge--warning"><i class="bi bi-exclamation-triangle"></i> Lỗi kiểm tra</span>');

			const $actionButton = options.$(`.action-btn[data-appt-id="${appointmentId}"]`);
			if ($actionButton.length) {
				options.controlsUtils.applyActionButtonState($actionButton, {
					addClass: 'appointment-button--primary sync-single-btn',
					disabled: false,
					html: '<i class="bi bi-arrow-repeat"></i> Đồng bộ',
					removeClass: 'appointment-button--neutral appointment-button--success appointment-button--warning'
				});
			}
		});

		options.updateSyncBadgesAfterVerify();
	}

	function updateSyncBadgesAfterVerify(options) {
		options.controlsUtils.updateBadgesAfterRowStatusChange(options.$, {
			allMissingButtonSelector: '#syncAllMissingBtn',
			tableBodySelector: '#syncCalendarTableBody'
		});
	}

	function syncAppointments(options, appointmentIds) {
		if (!options.hasSession()) {
			options.showCustomToast('error', 'Vui lòng đăng nhập lại');
			return;
		}
		const ids = Array.from(new Set(appointmentIds || []));
		if (ids.length === 0) return;

		options.controlsUtils.setBulkButtonsDisabled(options.$, true);
		options.controlsUtils.setActionButtonsLoading(options.$, ids);
		options.showCustomToast('info', `Đang đồng bộ ${ids.length} lịch hẹn...`);
		const batches = [];
		for (let index = 0; index < ids.length; index += SYNC_WRITE_BATCH_SIZE) {
			batches.push(ids.slice(index, index + SYNC_WRITE_BATCH_SIZE));
		}
		syncAppointmentBatch(options, batches, 0, { failed: false, warned: false });
	}

	function applySyncResults(options, results, summary) {
		Object.keys(results || {}).forEach(appointmentId => {
			const result = results[appointmentId];
			const $row = options.$(`tr[data-appt-id="${appointmentId}"]`);
			const $button = options.$(`.action-btn[data-appt-id="${appointmentId}"]`);
			const $icons = options.$(`.verify-icons[data-appt-id="${appointmentId}"]`);
			$icons.html(options.statusUtils.buildSyncResultIconsHtml(result));

			const rowStatus = options.statusUtils.getSyncResultRowStatus(result);
			options.controlsUtils.applyActionButtonState($button, options.statusUtils.getSyncResultButtonState(result));
			$row.attr('data-sync-status', rowStatus).data('sync-status', rowStatus);
			if (rowStatus === 'error' && result.errors && result.errors.length > 0) summary.warned = true;
		});
	}

	function finishSyncAppointments(options, summary) {
		options.controlsUtils.setBulkButtonsDisabled(options.$, false);
		options.updateSyncCounters();
		if (summary.failed) {
			options.showCustomToast('error', 'Có nhóm lịch hẹn chưa đồng bộ được. Vui lòng thử lại.');
		} else if (summary.warned) {
			options.showCustomToast('warning', 'Có lịch hẹn chưa đồng bộ được. Vui lòng kiểm tra trạng thái trong danh sách.');
		} else {
			options.showCustomToast('success', 'Đã đồng bộ lịch hẹn.');
		}
	}

	function syncAppointmentBatch(options, batches, batchIndex, summary) {
		if (batchIndex >= batches.length) {
			finishSyncAppointments(options, summary);
			return;
		}
		const batchIds = batches[batchIndex];
		options.$.ajax({
			url: '/api/calendar/sync',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			data: JSON.stringify({ appointment_ids: batchIds }),
			success: function (data) {
				applySyncResults(options, data && data.results, summary);
				syncAppointmentBatch(options, batches, batchIndex + 1, summary);
			},
			error: function () {
				summary.failed = true;
				options.controlsUtils.resetActionButtonsToDefault(options.$, batchIds);
				syncAppointmentBatch(options, batches, batchIndex + 1, summary);
			}
		});
	}

	function updateSyncCounters(options) {
		options.updateSyncBadgesAfterVerify();
	}

	function filterSyncTable(options) {
		options.filterUtils.filterSyncTableRows({
			$: options.$,
			searchText: options.$('#syncSearchInput').val(),
			statusFilter: options.$('#syncStatusFilter').val(),
			tableBodySelector: '#syncCalendarTableBody'
		});
	}

	window.AppointmentManagementCalendarSyncRuntimeUtils = {
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
})(window);
