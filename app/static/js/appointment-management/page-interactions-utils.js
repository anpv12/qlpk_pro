import { rebind, rebindDelegate } from '../shared/dom-query.js';
import { AppointmentManagementCalendarSyncFilterUtils } from './calendar-sync-filter-utils.js';
function bindCalendarSearch(options) {
	const documentRef = options.document;
	const searchInput = documentRef.getElementById(options.searchInputId || 'calendarSearchInput');
	const clearButton = documentRef.getElementById(options.clearButtonId || 'calendarSearchClear');
	if (!searchInput || !clearButton) return;

	let searchTimeout;
	const debounceMs = options.debounceMs || 200;

	rebind(searchInput, 'input', 'appointmentManagementSearch', function () {
		const query = this.value.trim();
		clearButton.style.display = query ? 'block' : 'none';

		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(function () {
			options.setSearchKeyword(query);
			options.refreshView();
		}, debounceMs);
	});

	rebind(clearButton, 'click', 'appointmentManagementSearch', () => {
		searchInput.value = '';
		clearButton.style.display = 'none';
		options.setSearchKeyword('');
		options.refreshView();
		searchInput.focus();
	});
}

function bindEscapeClose(options) {
	const documentRef = options.document;
	rebind(documentRef, 'keydown', 'appointmentManagement', event => {
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
	rebindDelegate(options.document, 'click', options.headerSelector || '.sync-date-header', 'appointmentManagementSyncCollapse', function () {
		AppointmentManagementCalendarSyncFilterUtils.toggleSyncDateGroup({
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

const AppointmentManagementPageInteractionsUtils = {
	bindCalendarSearch,
	bindEscapeClose,
	bindSyncDateHeaderCollapse,
	initializePageInteractions
};

export { AppointmentManagementPageInteractionsUtils };
