/* global activePreset: writable, columns, computeRow, filterDateFrom: writable, filterDateTo: writable, fmtNum, fpFrom, fpTo, getCat, normalizeSearchText, render, rows, setCtVisible */
/* exported clearActivePreset, downloadTemplate, exportExcel, getFilteredRows, isInDateRange, parseDateStr, renderGrid, selectPresetItem, setPreset, togglePresetDD */

function setPreset(preset) {
	activePreset = preset;
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
			filterDateFrom = null; filterDateTo = null;
			if (fpFrom) fpFrom.clear();
			if (fpTo) fpTo.clear();
			updatePresetBtns();
			render();
			return;
	}
	filterDateFrom = from; filterDateTo = to;
	if (fpFrom) fpFrom.setDate(from, false);
	if (fpTo) fpTo.setDate(to, false);
	updatePresetBtns();
	render();
}

function clearActivePreset() { activePreset = ''; updatePresetBtns(); }

function updatePresetBtns() {
	document.querySelectorAll('.preset-btn').forEach(btn => {
		let p = '';
		try { p = JSON.parse(btn.getAttribute('data-qlpk-args') || '[]')[0] || ''; } catch { p = ''; }
		btn.classList.toggle('active', p === activePreset);
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

	const now = new Date();
	const curYear = now.getFullYear();
	let html = '';

	if (type === 'month') {
		for (let m = 0; m < 12; m++) {
			const isCur = (selectedMonth === m);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["month", ${m}, ${selectedYear}]'>T${m + 1}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.remove('cols-2');
	} else if (type === 'quarter') {
		for (let q = 0; q < 4; q++) {
			const isCur = (selectedQuarter === q);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["quarter", ${q}, ${selectedYear}]'>Q${q + 1}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	} else if (type === 'year') {
		for (let y = curYear; y >= curYear - 4; y--) {
			const isCur = (y === selectedYear);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["year", 0, ${y}]'>${y}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	} else if (type === 'week') {
		const labels = ['Tuần này', '1 tuần trước', '2 tuần trước', '3 tuần trước'];
		for (let w = 0; w < 4; w++) {
			const isCur = (w === 0);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["week", ${w}, ${curYear}]'>${labels[w]}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	}
	menu.classList.add('show');
}

function selectPresetItem(type, index, year) {
	let from, to;
	if (type === 'month') {
		selectedMonth = index;
		selectedQuarter = null;
		from = new Date(year, index, 1);
		to = new Date(year, index + 1, 0);
		activePreset = 'month';
	} else if (type === 'quarter') {
		selectedQuarter = index;
		selectedMonth = null;
		from = new Date(year, index * 3, 1);
		to = new Date(year, index * 3 + 3, 0);
		activePreset = 'quarter';
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
		activePreset = 'year';
	} else if (type === 'week') {
		selectedMonth = null;
		selectedQuarter = null;
		const now = new Date();
		const dayOfWeek = now.getDay() || 7;
		from = new Date(now);
		from.setDate(now.getDate() - dayOfWeek + 1 - (index * 7));
		to = new Date(from);
		to.setDate(from.getDate() + 6);
		activePreset = 'week';
	}
	filterDateFrom = from; filterDateTo = to;
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
	if (!filterDateFrom && !filterDateTo) return true;
	const rowDate = parseDateStr(row.date);
	if (!rowDate) return false;
	if (filterDateFrom) { const s = new Date(filterDateFrom); s.setHours(0, 0, 0, 0); if (rowDate < s) return false; }
	if (filterDateTo) { const e = new Date(filterDateTo); e.setHours(23, 59, 59, 999); if (rowDate > e) return false; }
	return true;
}

// ==================== FILTER (chi tiết tab) ====================
let sortColId = 'date';
let sortOrder = 'desc';
let selectedFilterTypes = [];
const expandedGroups = new Set();

window.setSort = function(colId) {
	if (sortColId === colId) {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	} else {
		sortColId = colId;
		sortOrder = 'desc';
	}
	render();
};

window.toggleMultiSelect = function(e, menuId) {
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

window.handleTypeChange = function(checkbox) {
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
function getFilteredRows() {
	const search = normalizeSearchText(document.getElementById('filterSearch')?.value || '');
	const filterPayment = document.getElementById('filterPayment')?.value || '';

	return rows.map((row, idx) => ({ row, idx })).filter(({ row }) => {
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
		const monthKeyA = mA ? `${mA.getFullYear()}-${String(mA.getMonth() + 1).padStart(2,'0')}` : 'z';
		const monthKeyB = mB ? `${mB.getFullYear()}-${String(mB.getMonth() + 1).padStart(2,'0')}` : 'z';

		if (monthKeyA !== monthKeyB) {
			return monthKeyB.localeCompare(monthKeyA);
		}

		// Step 2: Within the same month, sort by chosen column
		const valA = a.row[sortColId] ?? '';
		const valB = b.row[sortColId] ?? '';
		let cmp = 0;
		if (sortColId === 'date') {
			const tA = mA?.getTime() || 0;
			const tB = mB?.getTime() || 0;
			cmp = tB - tA;
		} else {
			const numA = parseFloat(String(valA).replace(/,/g, ''));
			const numB = parseFloat(String(valB).replace(/,/g, ''));
			const isNumA = !isNaN(numA) && isFinite(numA);
			const isNumB = !isNaN(numB) && isFinite(numB);
			if (isNumA && isNumB) {
				cmp = numB - numA;
			} else {
				cmp = String(valB).localeCompare(String(valA));
			}
		}
		return sortOrder === 'asc' ? -cmp : cmp;
	});
}

function populateFilterOptions() {
	const menu = document.getElementById('filterTypeMenu');
	if (menu) {
		const types = [...new Set(rows.map(r => r.type).filter(Boolean))];
		let html = '';
		types.forEach(t => {
			const checked = selectedFilterTypes.includes(t) ? 'checked' : '';
			html += `<label class="multi-sel-item">
				<input type="checkbox" value="${t}" ${checked} data-qlpk-call="handleTypeChange" data-qlpk-args='["$this"]' data-qlpk-on="change">
				${t}
			</label>`;
		});
		if (types.length === 0) html = '<div class="multi-sel-item multi-sel-item--empty">Không có dữ liệu</div>';
		menu.innerHTML = html;
	}

	const paySel = document.getElementById('filterPayment');
	if (paySel) {
		const currentVal = paySel.value;
		const payments = [...new Set(rows.map(r => r.payment).filter(Boolean))];
		paySel.innerHTML = '<option value="">Tất cả hình thức</option>' +
			payments.map(p => `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`).join('');
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
	const collapseState = isExpanded ? 'false' : 'true';
	const iconCollapsedClass = isExpanded ? '' : 'ct-toggle-icon-collapsed';

	let b = `<tr class="month-group-row" data-collapsed="${collapseState}" data-qlpk-call="toggleMonthGroup" data-qlpk-args='["${safeId}", "$this"]'>`;
	b += `<td class="row-num ct-month-toggle-cell"><i class="bi bi-chevron-down text-primary toggle-icon ${iconCollapsedClass}"></i></td>`;

	for (const col of columns) {
		if (col.id === 'date') {
			b += `<td class="ct-month-label-cell"><i class="bi bi-calendar3 text-primary me-2"></i>${monthGroup}</td>`;
		} else if (col.id === 'desc') {
			b += `<td class="ct-month-stat-cell">${stats.count > 0 ? stats.count + ' khoản' : ''}</td>`;
		} else if (col.id === 'amount') {
			b += `<td class="ct-month-stat-cell ct-month-amount-cell">${fmtNum(stats.sum)}</td>`;
		} else {
			b += `<td></td>`;
		}
	}
	b += `<td></td></tr>`;
	return b;
}

function buildChiCell(col, val, ri) {
	if (col.type === 'formula') {
		return `<td><input class="cell-input readonly num" value="${fmtNum(val)}" readonly tabindex="-1"></td>`;
	} else if (col.type === 'autocomplete') {
		const isType = col.id === 'type';
		const cat = isType ? getCat(val) : null;
		const typeStyle = isType ? `style="--ct-type-bg:${cat.bg};--ct-type-color:${cat.color};"` : '';
		return `<td class="${isType ? 'ct-type-cell' : ''}" ${typeStyle}><div class="ac-wrap">
			<input class="cell-input ${isType ? 'ct-type-input' : ''}" value="${val}" data-ri="${ri}" data-col="${col.id}"
				data-qlpk-on-focusin="openAcList" data-qlpk-on-focusin-args='[${ri}, "${col.id}", "$this"]'
				data-qlpk-on-input="openAcList" data-qlpk-on-input-args='[${ri}, "${col.id}", "$this"]'
				data-qlpk-on-focusout="scheduleCloseAc"
				data-qlpk-on-change="updateCell" data-qlpk-on-change-args='[${ri}, "${col.id}", "$value"]'>
			<div class="ac-list"></div>
		</div></td>`;
	} else if (col.type === 'number') {
		const raw = val || '';
		const display = raw !== '' ? fmtNum(parseFloat(raw)) : '';
		return `<td><input class="cell-input num" value="${display}" data-raw="${raw}"
			data-qlpk-on-focusin="showRawNumberCell" data-qlpk-on-focusin-args='["$this"]'
			data-qlpk-on-focusout="formatNumberCell" data-qlpk-on-focusout-args='["$this"]'
			data-qlpk-on-change="updateCell" data-qlpk-on-change-args='[${ri}, "${col.id}", "$value"]' placeholder=""></td>`;
	} else {
		return `<td><input class="cell-input" value="${val}" data-qlpk-call="updateCell" data-qlpk-args='[${ri}, "${col.id}", "$value"]' data-qlpk-on="change" placeholder=""></td>`;
	}
}

function renderGrid() {
	populateFilterOptions();
	const filtered = getFilteredRows();

	// Filter count
	const countEl = document.getElementById('filterCount');
	if (countEl) {
		if (filtered.length < rows.length) {
			countEl.textContent = `Hiển thị ${filtered.length}/${rows.length} khoản`;
		} else {
			countEl.textContent = `${rows.length} khoản`;
		}
	}

	let h = '<tr><th class="row-num">#</th>';
	for (const col of columns) {
		const widthAttr = col.width ? ` style="width:${col.width}px;"` : '';
		let sortIcon = '';
		if (sortColId === col.id) {
			const activeIcon = sortOrder === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
			sortIcon = ` <i class="bi ${activeIcon} ms-1 ct-sort-icon-active"></i>`;
		} else {
			sortIcon = ` <i class="bi bi-chevron-bar-expand ms-1 ct-sort-icon-muted"></i>`;
		}
		h += `<th class="ct-sortable-th"${widthAttr} data-qlpk-call="setSort" data-qlpk-args='["${col.id}"]' title="Sắp xếp theo ${col.name}">
			<div class="ct-th-content">${col.name}${sortIcon}</div>
		</th>`;
	}
	h += '<th class="ct-action-th"></th></tr>';
	document.getElementById('chiHead').innerHTML = h;

	let b = '';
	let currentMonthGroup = null;
	let currentGroupId = '';

	// Global toggle function
	window.toggleMonthGroup = function(groupId, el) {
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
	};

	// Pre-calculate stats per group
	const groupStats = {};
	filtered.forEach(({ row }) => {
		const { safeId } = getMonthGroupInfo(row.date || '');
		if (!groupStats[safeId]) groupStats[safeId] = { count: 0, sum: 0 };
		const c = computeRow(row);
		const amount = parseFloat(c.amount) || 0;
		if (amount > 0) groupStats[safeId].count++;
		groupStats[safeId].sum += amount;
	});

	filtered.forEach(({ row, idx: ri }, vi) => {
		const { monthGroup, safeId } = getMonthGroupInfo(row.date || '');
		if (monthGroup !== currentMonthGroup) {
			currentMonthGroup = monthGroup;
			currentGroupId = safeId;
			b += buildMonthGroupRow(monthGroup, safeId, groupStats[safeId] || { count: 0, sum: 0 });
		}

		const c = computeRow(row);
		const isLarge = (parseFloat(c.amount) || 0) >= 2000;
		const isHidden = !expandedGroups.has(currentGroupId);
		b += `<tr class="${currentGroupId} ${isLarge ? 'highlight' : ''} ${isHidden ? 'ct-hidden' : ''}"><td class="row-num">${vi + 1}</td>`;
		for (const col of columns) b += buildChiCell(col, c[col.id] ?? '', ri);
		b += `<td class="row-actions"><button data-qlpk-button="danger" data-qlpk-button-variant="soft" data-qlpk-call="deleteRow" data-qlpk-args='[${ri}]' title="Xóa"><i class="bi bi-trash"></i></button></td></tr>`;
	});
	document.getElementById('chiBody').innerHTML = b;

	// Totals - render right after header row in thead
	const filteredRows = filtered.map(f => f.row);
	const sumFiltered = (colId) => filteredRows.reduce((s, r) => s + (parseFloat(computeRow(r)[colId]) || 0), 0);

	let f = '<tr class="total-row"><td class="row-num">Σ</td>';
	for (const col of columns) {
		if (col.type === 'number' || col.type === 'formula') {
			f += `<td><input class="cell-input readonly num" value="${fmtNum(sumFiltered(col.id))}" readonly tabindex="-1"></td>`;
		} else if (col.id === 'desc') {
			const validCount = filteredRows.filter(r => parseFloat(r.amount) > 0).length;
			f += `<td><input class="cell-input readonly" value="${validCount > 0 ? validCount + ' khoản' : ''}" readonly tabindex="-1"></td>`;
		} else { f += '<td></td>'; }
	}
	f += '<td></td></tr>';
	document.getElementById('chiHead').innerHTML = h + f;
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
