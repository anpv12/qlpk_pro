(function (window) {
	'use strict';

	function normalizeSearchText(value) {
		return String(value || '').toLowerCase().trim();
	}

	function rowMatchesSyncFilter(rowText, syncStatus, searchText, statusFilter) {
		const normalizedSearchText = normalizeSearchText(searchText);
		const normalizedRowText = normalizeSearchText(rowText);
		const statusMatch = (statusFilter === 'all') || (syncStatus === statusFilter);
		const searchMatch = !normalizedSearchText || normalizedRowText.includes(normalizedSearchText);
		return statusMatch && searchMatch;
	}

	function filterSyncTableRows(options) {
		const $ = options.$;
		const tableBodySelector = options.tableBodySelector;
		const searchText = options.searchText;
		const statusFilter = options.statusFilter;

		$(`${tableBodySelector} tr`).each(function () {
			const $row = $(this);

			if ($row.hasClass('sync-date-header')) {
				return;
			}

			const apptId = $row.data('appt-id');
			if (!apptId) return;

			if (rowMatchesSyncFilter($row.text(), $row.data('sync-status'), searchText, statusFilter)) {
				$row.show();
			} else {
				$row.hide();
			}
		});

		$(`${tableBodySelector} tr.sync-date-header`).each(function () {
			const $header = $(this);
			const dateKey = $header.data('date-key');
			if (!dateKey) return;

			const visibleCount = $(`${tableBodySelector} tr[data-date-key="${dateKey}"]:not(.sync-date-header):visible`).length;
			if (visibleCount > 0) {
				$header.show();
				$header.find('.appointment-sync-badge').text(`${visibleCount} lịch hẹn`);
			} else {
				$header.hide();
			}
		});
	}

	function toggleSyncDateGroup(options) {
		const $ = options.$;
		const tableBodySelector = options.tableBodySelector;
		const $header = $(options.header);
		const dateKey = $header.data('date-key');
		const $icon = $header.find('.collapse-icon');

		$(`${tableBodySelector} tr[data-date-key="${dateKey}"]:not(.sync-date-header)`).toggle();

		if ($icon.hasClass('bi-chevron-down')) {
			$icon.removeClass('bi-chevron-down').addClass('bi-chevron-right');
		} else {
			$icon.removeClass('bi-chevron-right').addClass('bi-chevron-down');
		}
	}

	window.AppointmentManagementCalendarSyncFilterUtils = {
		filterSyncTableRows,
		normalizeSearchText,
		rowMatchesSyncFilter,
		toggleSyncDateGroup
	};
})(window);
