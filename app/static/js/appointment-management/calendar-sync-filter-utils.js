import { QLPKSearchNormalization } from '../shared/search-normalization.js';

function normalizeSearchText(value) {
	return QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '')
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.trim();
}

function rowMatchesSyncFilter(rowText, syncStatus, searchText, statusFilter) {
	const normalizedSearchText = normalizeSearchText(searchText);
	const normalizedRowText = normalizeSearchText(rowText);
	const statusMatch = (statusFilter === 'all') || (syncStatus === statusFilter);
	const searchMatch = !normalizedSearchText || normalizedRowText.includes(normalizedSearchText);
	return statusMatch && searchMatch;
}

function filterSyncTableRows(options) {
	const { tableBodySelector, searchText, statusFilter } = options;
	document.querySelectorAll(`${tableBodySelector} tr`).forEach(row => {
		if (row.classList.contains('sync-date-header') || !row.dataset.apptId) return;
		row.hidden = !rowMatchesSyncFilter(row.textContent, row.dataset.syncStatus, searchText, statusFilter);
	});
	// Date headers show how many of their rows are still visible, and hide when none are
	document.querySelectorAll(`${tableBodySelector} tr.sync-date-header`).forEach(header => {
		const dateKey = header.dataset.dateKey;
		if (!dateKey) return;
		const visibleCount = [...document.querySelectorAll(`${tableBodySelector} tr[data-date-key="${CSS.escape(dateKey)}"]:not(.sync-date-header)`)]
			.filter(row => !row.hidden).length;
		header.hidden = visibleCount === 0;
		if (visibleCount > 0) header.querySelectorAll('.appointment-sync-badge').forEach(badge => { badge.textContent = `${visibleCount} lịch hẹn`; });
	});
}

// Collapses/expands one date group and flips its chevron
function toggleSyncDateGroup(options) {
	const header = options.header;
	const dateKey = header.dataset.dateKey;
	document.querySelectorAll(`${options.tableBodySelector} tr[data-date-key="${CSS.escape(dateKey)}"]:not(.sync-date-header)`)
		.forEach(row => { row.hidden = !row.hidden; });
	header.querySelectorAll('.collapse-icon').forEach(chevron => {
		const collapsed = chevron.classList.contains('bi-chevron-down');
		chevron.classList.toggle('bi-chevron-down', !collapsed);
		chevron.classList.toggle('bi-chevron-right', collapsed);
	});
}

const AppointmentManagementCalendarSyncFilterUtils = {
	filterSyncTableRows,
	normalizeSearchText,
	rowMatchesSyncFilter,
	toggleSyncDateGroup
};

export { AppointmentManagementCalendarSyncFilterUtils };
