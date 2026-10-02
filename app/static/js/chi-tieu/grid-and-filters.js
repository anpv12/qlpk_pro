import { state } from './state.js';
import { el, icon, replace } from '../shared/dom.js';
import { fpFrom, fpTo } from './revenue-charts.js';
import { columns, computeRow, fmtNum, getCat, normalizeSearchText, render, setCtVisible } from '../chi-tieu.js';
import { QLPKInlineActions } from '../shared/inline-actions.js';

function setPreset(preset) {
	state.activePreset = preset;
	const now = new Date();
	let from, to;
	switch (preset) {
		case 'week':
			from = new Date(now); from.setDate(now.getDate() - now.getDay() + 1);
			to = new Date(from); to.setDate(from.getDate() + 6);
			break;
		case 'month':
			from = new Date(now.getFullYear(), now.getMonth(), 1);
			to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			break;
		case 'quarter':
			const q = Math.floor(now.getMonth() / 3);
			from = new Date(now.getFullYear(), q * 3, 1);
			to = new Date(now.getFullYear(), q * 3 + 3, 0);
			break;
		case 'year':
			from = new Date(now.getFullYear(), 0, 1);
			to = new Date(now.getFullYear(), 11, 31);
			break;
		case 'all':
			state.filterDateFrom = null; state.filterDateTo = null;
			if (fpFrom) fpFrom.clear();
			if (fpTo) fpTo.clear();
			updatePresetBtns();
			render();
			return;
	}
	state.filterDateFrom = from; state.filterDateTo = to;
	if (fpFrom) fpFrom.setDate(from, false);
	if (fpTo) fpTo.setDate(to, false);
	updatePresetBtns();
	render();
}

function clearActivePreset() { state.activePreset = ''; updatePresetBtns(); }

function updatePresetBtns() {
	document.querySelectorAll('.preset-btn').forEach(btn => {
		let p = '';
		try { p = JSON.parse(btn.getAttribute('data-qlpk-args') || '[]')[0] || ''; } catch { p = ''; }
		btn.classList.toggle('active', p === state.activePreset);
	});
}

function closeAllPresetDD() {
	document.querySelectorAll('.preset-dd-menu').forEach(m => m.classList.remove('show', 'cols-2'));
}

let selectedYear = new Date().getFullYear();
let selectedMonth = null;
let selectedQuarter = null;

function togglePresetDD(type) {
	const menu = document.getElementById('dd-' + type);
	const wasOpen = menu.classList.contains('show');
	closeAllPresetDD();
	if (wasOpen) return;

	const curYear = new Date().getFullYear();
	const item = (current, args, label) => el('div', { class: `preset-dd-item${current ? ' current' : ''}`, 'data-qlpk-call': 'selectPresetItem', 'data-qlpk-args': JSON.stringify(args) }, label);
	const builders = {
		month: () => Array.from({ length: 12 }, (_, m) => item(selectedMonth === m, ['month', m, selectedYear], `T${m + 1}`)),
		quarter: () => Array.from({ length: 4 }, (_, q) => item(selectedQuarter === q, ['quarter', q, selectedYear], `Q${q + 1}`)),
		year: () => Array.from({ length: 5 }, (_, i) => item(curYear - i === selectedYear, ['year', 0, curYear - i], curYear - i)),
		week: () => ['Tuần này', '1 tuần trước', '2 tuần trước', '3 tuần trước'].map((label, w) => item(w === 0, ['week', w, curYear], label)),
	};
	if (!builders[type]) return;
	replace(menu, builders[type]());
	menu.classList.toggle('cols-2', type !== 'month');
	menu.classList.add('show');
}

function selectPresetItem(type, index, year) {
	let from, to;
	if (type === 'month') {
		selectedMonth = index;
		selectedQuarter = null;
		from = new Date(year, index, 1);
		to = new Date(year, index + 1, 0);
		state.activePreset = 'month';
	} else if (type === 'quarter') {
		selectedQuarter = index;
		selectedMonth = null;
		from = new Date(year, index * 3, 1);
		to = new Date(year, index * 3 + 3, 0);
		state.activePreset = 'quarter';
	} else if (type === 'year') {
		selectedYear = year;
		// Re-apply month/quarter with new year
		if (selectedMonth !== null) {
			selectPresetItem('month', selectedMonth, year);
			return;
		} else if (selectedQuarter !== null) {
			selectPresetItem('quarter', selectedQuarter, year);
			return;
		}
		from = new Date(year, 0, 1);
		to = new Date(year, 11, 31);
		state.activePreset = 'year';
	} else if (type === 'week') {
		selectedMonth = null;
		selectedQuarter = null;
		const now = new Date();
		const dayOfWeek = now.getDay() || 7;
		from = new Date(now);
		from.setDate(now.getDate() - dayOfWeek + 1 - (index * 7));
		to = new Date(from);
		to.setDate(from.getDate() + 6);
		state.activePreset = 'week';
	}
	state.filterDateFrom = from; state.filterDateTo = to;
	if (fpFrom) fpFrom.setDate(from, false);
	if (fpTo) fpTo.setDate(to, false);
	updatePresetBtns();
	closeAllPresetDD();
	render();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
	if (!e.target.closest('.preset-dd')) closeAllPresetDD();
});

function parseDateStr(dateStr) {
	if (!dateStr) return null;
	const parts = dateStr.split('/');
	if (parts.length === 2) return new Date(new Date().getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[0]));
	if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
	return null;
}

function isInDateRange(row) {
	if (!state.filterDateFrom && !state.filterDateTo) return true;
	const rowDate = parseDateStr(row.date);
	if (!rowDate) return false;
	if (state.filterDateFrom) { const s = new Date(state.filterDateFrom); s.setHours(0, 0, 0, 0); if (rowDate < s) return false; }
	if (state.filterDateTo) { const e = new Date(state.filterDateTo); e.setHours(23, 59, 59, 999); if (rowDate > e) return false; }
	return true;
}

// ==================== FILTER (chi tiết tab) ====================
let sortColId = 'date';
let sortOrder = 'desc';
let selectedFilterTypes = [];
const expandedGroups = new Set();

function setSort(colId) {
	if (sortColId === colId) {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	} else {
		sortColId = colId;
		sortOrder = 'desc';
	}
	render();
};

function toggleMultiSelect(e, menuId) {
	e.stopPropagation();
	document.querySelectorAll('.multi-sel-menu').forEach(m => {
		if (m.id !== menuId) m.classList.remove('show');
	});
	const menu = document.getElementById(menuId);
	if (menu) menu.classList.toggle('show');
};

document.addEventListener('click', function(e) {
	if (!e.target.closest('.faux-select-wrap')) {
		document.querySelectorAll('.multi-sel-menu').forEach(m => m.classList.remove('show'));
	}
});

function handleTypeChange(checkbox) {
	if (checkbox.checked) {
		if (!selectedFilterTypes.includes(checkbox.value)) selectedFilterTypes.push(checkbox.value);
	} else {
		selectedFilterTypes = selectedFilterTypes.filter(v => v !== checkbox.value);
	}
	updateFilterTypeLabel();
	render();
};

function updateFilterTypeLabel() {
	const lbl = document.getElementById('filterTypeLabel');
	if (!lbl) return;
	if (selectedFilterTypes.length === 0) {
		lbl.textContent = 'Tất cả loại chi';
	} else if (selectedFilterTypes.length === 1) {
		lbl.textContent = selectedFilterTypes[0];
	} else {
		lbl.textContent = `Loại chi (${selectedFilterTypes.length})`;
	}
}
function expenseMonthKey(date) {
	return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}` : 'z';
}

// Descending: numbers numerically when both parse, otherwise by text.
function compareExpenseValues(valA, valB) {
	const numA = parseFloat(String(valA).replace(/,/g, ''));
	const numB = parseFloat(String(valB).replace(/,/g, ''));
	if (Number.isFinite(numA) && Number.isFinite(numB)) return numB - numA;
	return String(valB).localeCompare(String(valA));
}

function getFilteredRows() {
	const search = normalizeSearchText(document.getElementById('filterSearch')?.value || '');
	const filterPayment = document.getElementById('filterPayment')?.value || '';

	return state.rows.map((row, idx) => ({ row, idx })).filter(({ row }) => {
		if (!isInDateRange(row)) return false;
		if (selectedFilterTypes.length > 0 && !selectedFilterTypes.includes(row.type)) return false;
		if (filterPayment && row.payment !== filterPayment) return false;
		if (search) {
			const haystack = normalizeSearchText(columns.map(c => String(row[c.id] || '')).join(' '));
			if (!haystack.includes(search)) return false;
		}
		return true;
	}).sort((a, b) => {
		// Step 1: Always group by month (newest month first)
		const mA = parseDateStr(a.row.date);
		const mB = parseDateStr(b.row.date);
		const monthKeyA = expenseMonthKey(mA);
		const monthKeyB = expenseMonthKey(mB);

		if (monthKeyA !== monthKeyB) {
			return monthKeyB.localeCompare(monthKeyA);
		}

		// Step 2: Within the same month, sort by chosen column
		const cmp = sortColId === 'date'
			? (mB?.getTime() || 0) - (mA?.getTime() || 0)
			: compareExpenseValues(a.row[sortColId] ?? '', b.row[sortColId] ?? '');
		return sortOrder === 'asc' ? -cmp : cmp;
	});
}

function populateFilterOptions() {
	const menu = document.getElementById('filterTypeMenu');
	if (menu) {
		const types = [...new Set(state.rows.map(r => r.type).filter(Boolean))];
		replace(menu, types.length ? types.map(t => el('label', { class: 'multi-sel-item' },
			el('input', { type: 'checkbox', value: t, checked: selectedFilterTypes.includes(t), 'data-qlpk-call': 'handleTypeChange', 'data-qlpk-args': '["$this"]', 'data-qlpk-on': 'change' }), ` ${t}`))
			: el('div', { class: 'multi-sel-item multi-sel-item--empty' }, 'Không có dữ liệu'));
	}

	const paySel = document.getElementById('filterPayment');
	if (paySel) {
		const currentVal = paySel.value;
		const payments = [...new Set(state.rows.map(r => r.payment).filter(Boolean))];
		replace(paySel, new Option('Tất cả hình thức', ''), payments.map(p => new Option(p, p, false, p === currentVal)));
	}
}

// ==================== TABLE ====================
// Nhóm theo tháng của ngày chi; ngày không đọc được giữ nguyên chuỗi làm nhóm.
function getMonthGroupInfo(rowDateStr) {
	const parsed = parseDateStr(rowDateStr);
	if (parsed) {
		const m = String(parsed.getMonth() + 1).padStart(2, '0');
		const y = parsed.getFullYear();
		return { monthGroup: `Tháng ${m}/${y}`, safeId: `grp-${m}-${y}` };
	}
	if (rowDateStr) return { monthGroup: rowDateStr, safeId: 'grp-' + rowDateStr.replace(/[^a-zA-Z0-9]/g, '') };
	return { monthGroup: 'Chưa xác định', safeId: 'grp-unknown' };
}

function buildMonthGroupRow(monthGroup, safeId, stats) {
	const isExpanded = expandedGroups.has(safeId);
	const cells = columns.map(col => {
		if (col.id === 'date') return el('td', { class: 'ct-month-label-cell' }, icon('bi-calendar3', 'text-primary me-2'), monthGroup);
		if (col.id === 'desc') return el('td', { class: 'ct-month-stat-cell' }, stats.count > 0 ? stats.count + ' khoản' : '');
		if (col.id === 'amount') return el('td', { class: 'ct-month-stat-cell ct-month-amount-cell' }, fmtNum(stats.sum));
		return el('td');
	});
	return el('tr', { class: 'month-group-row', 'data-collapsed': String(!isExpanded), 'data-qlpk-call': 'toggleMonthGroup', 'data-qlpk-args': JSON.stringify([safeId, '$this']) },
		el('td', { class: 'row-num ct-month-toggle-cell' }, icon('bi-chevron-down', `text-primary toggle-icon ${isExpanded ? '' : 'ct-toggle-icon-collapsed'}`)), cells, el('td'));
}

const cellArgs = (ri, colId) => JSON.stringify([ri, colId, '$value']);

function buildChiCell(col, val, ri) {
	if (col.type === 'formula') return el('td', {}, el('input', { class: 'cell-input readonly num', value: fmtNum(val), readonly: true, tabindex: '-1' }));
	if (col.type === 'autocomplete') {
		const isType = col.id === 'type';
		const acArgs = JSON.stringify([ri, col.id, '$this']);
		const cell = el('td', { class: isType ? 'ct-type-cell' : '' }, el('div', { class: 'ac-wrap' },
			el('input', { class: `cell-input ${isType ? 'ct-type-input' : ''}`, value: val, 'data-ri': ri, 'data-col': col.id,
				'data-qlpk-on-focusin': 'openAcList', 'data-qlpk-on-focusin-args': acArgs, 'data-qlpk-on-input': 'openAcList', 'data-qlpk-on-input-args': acArgs,
				'data-qlpk-on-focusout': 'scheduleCloseAc', 'data-qlpk-on-change': 'updateCell', 'data-qlpk-on-change-args': cellArgs(ri, col.id) }),
			el('div', { class: 'ac-list' })));
		if (isType) {
			const cat = getCat(val);
			cell.style.setProperty('--ct-type-bg', cat.bg);
			cell.style.setProperty('--ct-type-color', cat.color);
		}
		return cell;
	}
	if (col.type === 'number') {
		const raw = val || '';
		return el('td', {}, el('input', { class: 'cell-input num', value: raw !== '' ? fmtNum(parseFloat(raw)) : '', 'data-raw': raw,
			'data-qlpk-on-focusin': 'showRawNumberCell', 'data-qlpk-on-focusin-args': '["$this"]', 'data-qlpk-on-focusout': 'formatNumberCell', 'data-qlpk-on-focusout-args': '["$this"]',
			'data-qlpk-on-change': 'updateCell', 'data-qlpk-on-change-args': cellArgs(ri, col.id), placeholder: '' }));
	}
	return el('td', {}, el('input', { class: 'cell-input', value: val, 'data-qlpk-call': 'updateCell', 'data-qlpk-args': cellArgs(ri, col.id), 'data-qlpk-on': 'change', placeholder: '' }));
}

function renderCtFilterCount(filtered) {
	const countEl = document.getElementById('filterCount');
	if (!countEl) return;
	countEl.textContent = filtered.length < state.rows.length
		? `Hiển thị ${filtered.length}/${state.rows.length} khoản`
		: `${state.rows.length} khoản`;
}

function buildCtHeaderRow() {
	return el('tr', {}, el('th', { class: 'row-num' }, '#'), columns.map(col => {
		const sortIcon = sortColId === col.id
			? icon(sortOrder === 'asc' ? 'bi-sort-up' : 'bi-sort-down', 'ms-1 ct-sort-icon-active')
			: icon('bi-chevron-bar-expand', 'ms-1 ct-sort-icon-muted');
		const th = el('th', { class: 'ct-sortable-th', 'data-qlpk-call': 'setSort', 'data-qlpk-args': JSON.stringify([col.id]), title: `Sắp xếp theo ${col.name}` },
			el('div', { class: 'ct-th-content' }, col.name, ' ', sortIcon));
		if (col.width) th.style.setProperty('width', `${col.width}px`);
		return th;
	}), el('th', { class: 'ct-action-th' }));
}

function toggleCtMonthGroup(groupId, el) {
	const isCollapsed = !expandedGroups.has(groupId);
	const icon = el.querySelector('.toggle-icon');
	const rows = document.querySelectorAll('.' + groupId);

	if (isCollapsed) {
		expandedGroups.add(groupId);
		rows.forEach(r => setCtVisible(r, true));
		if (icon) icon.classList.remove('ct-toggle-icon-collapsed');
		el.dataset.collapsed = 'false';
	} else {
		expandedGroups.delete(groupId);
		rows.forEach(r => setCtVisible(r, false));
		if (icon) icon.classList.add('ct-toggle-icon-collapsed');
		el.dataset.collapsed = 'true';
	}
}

function buildCtGroupStats(filtered) {
	const groupStats = {};
	filtered.forEach(({ row }) => {
		const { safeId } = getMonthGroupInfo(row.date || '');
		if (!groupStats[safeId]) groupStats[safeId] = { count: 0, sum: 0 };
		const c = computeRow(row);
		const amount = parseFloat(c.amount) || 0;
		if (amount > 0) groupStats[safeId].count++;
		groupStats[safeId].sum += amount;
	});
	return groupStats;
}

function buildCtBodyRows(filtered) {
	const groupStats = buildCtGroupStats(filtered);
	const out = [];
	let currentMonthGroup = null;
	let currentGroupId = '';
	filtered.forEach(({ row, idx: ri }, vi) => {
		const { monthGroup, safeId } = getMonthGroupInfo(row.date || '');
		if (monthGroup !== currentMonthGroup) {
			currentMonthGroup = monthGroup;
			currentGroupId = safeId;
			out.push(buildMonthGroupRow(monthGroup, safeId, groupStats[safeId] || { count: 0, sum: 0 }));
		}
		const c = computeRow(row);
		const classes = [currentGroupId, (parseFloat(c.amount) || 0) >= 2000 ? 'highlight' : '', expandedGroups.has(currentGroupId) ? '' : 'ct-hidden'].filter(Boolean).join(' ');
		out.push(el('tr', { class: classes }, el('td', { class: 'row-num' }, vi + 1), columns.map(col => buildChiCell(col, c[col.id] ?? '', ri)),
			el('td', { class: 'row-actions' }, el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', 'data-qlpk-call': 'deleteRow', 'data-qlpk-args': JSON.stringify([ri]), title: 'Xóa' }, icon('bi-trash')))));
	});
	return out;
}

function buildCtTotalsRow(filtered) {
	const filteredRows = filtered.map(f => f.row);
	const sumFiltered = colId => filteredRows.reduce((sum, row) => sum + (parseFloat(computeRow(row)[colId]) || 0), 0);
	const readonlyInput = (className, value) => el('td', {}, el('input', { class: className, value, readonly: true, tabindex: '-1' }));
	return el('tr', { class: 'total-row' }, el('td', { class: 'row-num' }, 'Σ'), columns.map(col => {
		if (col.type === 'number' || col.type === 'formula') return readonlyInput('cell-input readonly num', fmtNum(sumFiltered(col.id)));
		if (col.id === 'desc') {
			const validCount = filteredRows.filter(r => parseFloat(r.amount) > 0).length;
			return readonlyInput('cell-input readonly', validCount > 0 ? validCount + ' khoản' : '');
		}
		return el('td');
	}), el('td'));
}

function renderGrid() {
	populateFilterOptions();
	const filtered = getFilteredRows();
	renderCtFilterCount(filtered);
	replace(document.getElementById('chiHead'), buildCtHeaderRow(), buildCtTotalsRow(filtered));
	replace(document.getElementById('chiBody'), buildCtBodyRows(filtered));
}

// ==================== EXPORT EXCEL ====================
function exportExcel() {
	const from = document.getElementById('dateFrom')?.value || '';
	const to = document.getElementById('dateTo')?.value || '';
	const params = new URLSearchParams();
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	const url = '/api/expenses/export' + (params.toString() ? '?' + params : '');
	fetch(url)
		.then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
		.then(blob => {
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `chi-tieu-${new Date().toISOString().slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		}).catch(e => console.error('Export error:', e));
}

function downloadTemplate() {
	fetch('/api/expenses/template')
		.then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
		.then(blob => {
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = 'mau-import-chi-tieu.xlsx';
			a.click();
			URL.revokeObjectURL(blobUrl);
		}).catch(e => console.error('Template download error:', e));
}

QLPKInlineActions.register({ downloadTemplate, exportExcel, handleTypeChange, selectPresetItem, setPreset, setSort, toggleMultiSelect, togglePresetDD, toggleMonthGroup: toggleCtMonthGroup });

export { clearActivePreset, getFilteredRows, isInDateRange, parseDateStr, renderGrid, setPreset };
