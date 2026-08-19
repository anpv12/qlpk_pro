(function (window) {
	'use strict';

	function bindCalendarSearch(options) {
		const documentRef = options.document;
		const searchInput = documentRef.getElementById(options.searchInputId || 'calendarSearchInput');
		const clearButton = documentRef.getElementById(options.clearButtonId || 'calendarSearchClear');
		if (!searchInput || !clearButton) return;

		let searchTimeout;
		const debounceMs = options.debounceMs || 200;

			options.$(searchInput).off('input.appointmentManagementSearch').on('input.appointmentManagementSearch', function () {
				const query = this.value.trim();
				clearButton.style.display = query ? 'block' : 'none';

			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(function () {
				options.setSearchKeyword(query);
				options.refreshView();
			}, debounceMs);
		});

			options.$(clearButton).off('click.appointmentManagementSearch').on('click.appointmentManagementSearch', function () {
				searchInput.value = '';
				clearButton.style.display = 'none';
				options.setSearchKeyword('');
			options.refreshView();
			searchInput.focus();
		});
	}

	function bindEscapeClose(options) {
		const documentRef = options.document;
		options.$(documentRef).off('keydown.appointmentManagement').on('keydown.appointmentManagement', function (event) {
			if (event.key !== 'Escape') return;

			const openModals = documentRef.querySelectorAll('.modal.show');
			if (openModals.length > 0) return;

			const searchInput = documentRef.getElementById(options.searchInputId || 'calendarSearchInput');
			if (searchInput && searchInput.value.trim()) {
				const clearButton = documentRef.getElementById(options.clearButtonId || 'calendarSearchClear');
				if (clearButton) clearButton.click();
				return;
			}

			const closeButton = documentRef.querySelector(options.closeButtonSelector || '.appt-close-btn');
			if (closeButton) closeButton.click();
		});
	}

	function bindSyncDateHeaderCollapse(options) {
		options.$(options.document)
			.off('click.appointmentManagementSyncCollapse', options.headerSelector || '.sync-date-header')
			.on('click.appointmentManagementSyncCollapse', options.headerSelector || '.sync-date-header', function () {
			window.AppointmentManagementCalendarSyncFilterUtils.toggleSyncDateGroup({
				$: options.$,
				header: this,
				tableBodySelector: options.tableBodySelector || '#syncCalendarTableBody'
			});
		});
	}

	function initializePageInteractions(options) {
		bindCalendarSearch(options);
		bindEscapeClose(options);
		bindSyncDateHeaderCollapse(options);
	}

	window.AppointmentManagementPageInteractionsUtils = {
		bindCalendarSearch,
		bindEscapeClose,
		bindSyncDateHeaderCollapse,
		initializePageInteractions
	};
})(window);
