/* global acBlurTimer: writable, activeTab, apiRequest, closeAllAc, columns, computeRow, fmtNum, getFilteredRows, initGlobalDateFilter, loadExpenses, normalizeSearchText, render, rows: writable, saveColumnsToServer, setCtVisible, switchTab */
/* exported acBlurTimer, addRow, appendFormulaToken, deleteCol, deleteRow, editCol, formatNumberCell, importCSV, saveCol, scheduleCloseAc, showAddCol, showRawNumberCell, toggleConfig, updateCell */

function importCSV(input) {
	const file = input.files[0];
	if (!file) return;
	const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

	if (isExcel) {
		const reader = new FileReader();
		reader.onload = function (e) {
			const wb = XLSX.read(e.target.result, { type: 'array' });
			const ws = wb.Sheets[wb.SheetNames[0]];
			const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
			if (raw.length < 2) { window.CustomModal.alert('File không có dữ liệu'); return; }
			processImportRows(raw, file.name);
		};
		reader.readAsArrayBuffer(file);
	} else {
		const reader = new FileReader();
		reader.onload = function (e) {
			const text = e.target.result;
			const lines = text.split(/\r?\n/).filter(l => l.trim());
			if (lines.length < 2) { window.CustomModal.alert('File không có dữ liệu'); return; }
			const raw = lines.map(l => parseCSVLine(l));
			processImportRows(raw, file.name);
		};
		reader.readAsText(file, 'UTF-8');
	}
	input.value = '';
}

function cleanDate(val) {
	if (!val) return '';
	let s = String(val).trim();
	// Excel serial date number
	if (/^\d{5}$/.test(s)) {
		const d = new Date((parseInt(s) - 25569) * 86400000);
		return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
	}
	// Normalize separators: dots, dashes → slashes
	s = s.replace(/[.-]/g, '/');
	const parts = s.split('/');
	if (parts.length >= 2) {
		const day = parts[0].padStart(2, '0');
		const month = parts[1].padStart(2, '0');
		const year = parts.length === 3 ? parts[2] : new Date().getFullYear();
		return `${day}/${month}/${year}`;
	}
	return s;
}

function cleanAmount(val) {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	// Remove everything except digits, dots, commas, minus
	const s = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
	return parseFloat(s) || 0;
}

function processImportRows(raw, fileName) {
	const headers = raw[0].map(h => String(h || '').trim());
	const colMap = {};
	headers.forEach((h, i) => {
		const col = columns.find(c => normalizeSearchText(c.name) === normalizeSearchText(h));
		if (col) colMap[i] = col.id;
	});

	const items = [];
	for (let i = 1; i < raw.length; i++) {
		const vals = raw[i];
		if (!vals || vals.every(v => !v)) continue; // skip empty rows
		const row = {};
		columns.forEach(c => row[c.id] = '');
		vals.forEach((v, idx) => {
			if (colMap[idx]) {
				const colDef = columns.find(c => c.id === colMap[idx]);
				if (colDef && colDef.type === 'date') {
					row[colMap[idx]] = cleanDate(v);
				} else if (colDef && colDef.type === 'number') {
					row[colMap[idx]] = cleanAmount(v);
				} else {
					row[colMap[idx]] = String(v || '').trim();
				}
			}
		});
		items.push(row);
	}

	if (!items.length) { window.CustomModal.alert('File không có dữ liệu hợp lệ'); return; }

	apiRequest('/api/expenses/bulk', 'POST', { items }).then(res => {
		rows = res.items.concat(rows);
		render();
		window.CustomModal.alert(`Đã import <b>${res.items.length}</b> khoản chi từ file <b>${window.QLPKHtml.escape(fileName)}</b>`);
	}).catch(e => {
		console.error('Import error:', e);
		window.CustomModal.alert('Lỗi import dữ liệu');
	});
}

function parseCSVLine(line) {
	const result = [];
	let current = '', inQuote = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuote) {
			if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
			else if (ch === '"') inQuote = false;
			else current += ch;
		} else {
			if (ch === '"') inQuote = true;
			else if (ch === ',') { result.push(current); current = ''; }
			else current += ch;
		}
	}
	result.push(current);
	return result;
}

// ===== CELL & ROW =====
// Debounce map cho updateCell
const updateTimers = {};
function updateCell(ri, colId, value) {
	const col = columns.find(c => c.id === colId);
	if (col && col.type === 'number') value = parseFloat(value) || 0;
	rows[ri][colId] = value;
	// Update totals row without full re-render
	updateTotals();
	// Debounce API call 500ms
	const row = rows[ri];
	if (row.id) {
		const key = row.id + '_' + colId;
		clearTimeout(updateTimers[key]);
		updateTimers[key] = setTimeout(() => {
			apiRequest('/api/expenses/' + row.id, 'PUT', { [colId]: value }).catch(e => console.error('Update error:', e));
		}, 500);
	}
}
function updateTotals() {
	const thead = document.getElementById('chiHead');
	if (!thead) return;
	const totalRow = thead.querySelector('.total-row');
	if (!totalRow) return;
	const filtered = getFilteredRows();
	const filteredRows = filtered.map(f => f.row);
	const cells = totalRow.querySelectorAll('td');
	let cellIdx = 1; // skip # column
	for (const col of columns) {
		if (col.type === 'number' || col.type === 'formula') {
			const sum = filteredRows.reduce((s, r) => s + (parseFloat(computeRow(r)[col.id]) || 0), 0);
			const input = cells[cellIdx]?.querySelector('input');
			if (input) input.value = fmtNum(sum);
		} else if (col.id === 'desc') {
			const validCount = filteredRows.filter(r => parseFloat(r.amount) > 0).length;
			const input = cells[cellIdx]?.querySelector('input');
			if (input) input.value = validCount > 0 ? validCount + ' khoản' : '';
		}
		cellIdx++;
	}
}
async function addRow() {
	const today = new Date();
	const dateStr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
	try {
		const newRow = await apiRequest('/api/expenses', 'POST', { date: dateStr });
		rows.unshift(newRow);
		render();
		setTimeout(() => { const tb = document.getElementById('chiBody'); const fr = tb.firstElementChild; if (fr) { const inp = fr.querySelector('.cell-input'); if (inp) inp.focus(); } }, 50);
	} catch (e) {
		console.error('Add row error:', e);
		window.CustomModal.alert('Lỗi thêm khoản chi');
	}
}
function deleteRow(ri) {
	window.CustomModal.confirm('Xóa khoản chi này?', 'Xác nhận xóa', 'warning', 'danger').then(async confirmed => {
		if (!confirmed) return;
		const row = rows[ri];
		try {
			if (row.id) await apiRequest('/api/expenses/' + row.id, 'DELETE');
			rows.splice(ri, 1);
			render();
		} catch (e) {
			console.error('Delete error:', e);
			window.CustomModal.alert('Lỗi xóa khoản chi');
		}
	});
}

// ===== CONFIG =====
let editingColId = null;
function toggleConfig() {
	const o = document.getElementById('configOverlay');
	const isHidden = o ? window.getComputedStyle(o).display === 'none' : true;
	setCtVisible(o, isHidden);
	hideAddCol(); renderColList();
}
function renderColList() {
	const typeLabels = { number: 'Số', text: 'Văn bản', date: 'Ngày', time: 'Giờ', select: 'Dropdown', formula: 'Công thức', autocomplete: 'Tự động' };
	document.getElementById('colList').innerHTML = columns.map(col => {
		const fTag = col.type === 'formula' ? `<span class="ct-formula-summary">= ${col.formula}</span>` : '';
		return `<li class="col-list-item"><i class="bi bi-grip-vertical ct-grip-icon"></i><span class="col-name">${window.QLPKHtml.escape(col.name)}${fTag}</span><span class="col-type">${typeLabels[col.type]}</span><div class="col-actions"><button data-qlpk-button="edit" data-qlpk-button-variant="soft" data-qlpk-call="editCol" data-qlpk-args='["${col.id}"]'><i class="bi bi-pencil"></i></button><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="del-btn" data-qlpk-call="deleteCol" data-qlpk-args='["${col.id}"]'><i class="bi bi-trash"></i></button></div></li>`;
	}).join('');
}
function showAddCol() {
	editingColId = null;
	setCtVisible('colFormSection', true);
	setCtVisible('configOverlay', true);
	document.getElementById('colFormTitle').textContent = 'Thêm cột mới';
	document.getElementById('colName').value = '';
	document.getElementById('colType').value = 'number';
	document.getElementById('colFormula').value = '';
	onTypeChange(); renderFormulaPicker();
}
function hideAddCol() { setCtVisible('colFormSection', false); editingColId = null; }
function editCol(colId) {
	const col = columns.find(c => c.id === colId);
	if (!col) return;
	editingColId = colId;
	setCtVisible('colFormSection', true);
	setCtVisible('configOverlay', true);
	document.getElementById('colFormTitle').textContent = `Sửa cột: ${col.name}`;
	document.getElementById('colName').value = col.name;
	document.getElementById('colType').value = col.type;
	if (col.formula) document.getElementById('colFormula').value = col.formula;
	if (col.options) document.getElementById('colOptions').value = col.options.join('\n');
	onTypeChange(); renderFormulaPicker();
}
function onTypeChange() {
	const t = document.getElementById('colType').value;
	setCtVisible('formulaGroup', t === 'formula');
	setCtVisible('optionsGroup', t === 'select' || t === 'autocomplete');
}
function scheduleCloseAc() {
	acBlurTimer = setTimeout(closeAllAc, 200);
}

function showRawNumberCell(input) {
	input.value = input.dataset.raw || '';
}

function formatNumberCell(input) {
	if (input.value !== '') {
		input.dataset.raw = input.value;
		input.value = fmtNum(parseFloat(input.value) || 0);
	} else {
		input.dataset.raw = '';
	}
}

function attrJson(values) {
	return JSON.stringify(values).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function appendFormulaToken(token) {
	const field = document.getElementById('colFormula');
	if (field) field.value += token;
}

window.triggerImportFile = function () {
	const input = document.getElementById('importFile');
	if (input) input.click();
};

function renderFormulaPicker() {
	const nc = columns.filter(c => c.type === 'number' || c.type === 'formula');
	document.getElementById('formulaPicker').innerHTML = nc.map(c => `<span class="formula-tag" data-qlpk-call="appendFormulaToken" data-qlpk-args="${attrJson(['[' + c.name + ']'])}">${window.QLPKHtml.escape(c.name)}</span>`).join('') +
		['+', '-', '*'].map((op, index) => `<span class="formula-op" data-qlpk-call="appendFormulaToken" data-qlpk-args="${attrJson([' ' + op + ' '])}">${['+', '−', '×'][index]}</span>`).join('');
}
function saveCol() {
	const name = document.getElementById('colName').value.trim();
	if (!name) { window.CustomModal.alert('Vui lòng nhập tên cột', 'Thiếu thông tin', 'warning'); return; }
	const type = document.getElementById('colType').value;
	const formula = type === 'formula' ? document.getElementById('colFormula').value : undefined;
	const options = type === 'select' ? document.getElementById('colOptions').value.split('\n').map(s => s.trim()).filter(Boolean) : undefined;
	if (editingColId) {
		const col = columns.find(c => c.id === editingColId);
		if (col) { col.name = name; col.type = type; col.formula = formula; col.options = options; }
	} else {
		const id = 'col_' + Date.now();
		columns.push({ id, name, type, formula, options, width: 90 });
		rows.forEach(r => { r[id] = type === 'number' ? 0 : ''; });
	}
	hideAddCol(); render(); renderColList();
	saveColumnsToServer();
}
function deleteCol(colId) {
	window.CustomModal.confirm('Xóa cột này?', 'Xác nhận xóa cột', 'warning', 'danger').then(confirmed => {
		if (!confirmed) return;
		const idx = columns.findIndex(c => c.id === colId);
		if (idx > -1) columns.splice(idx, 1);
		rows.forEach(r => delete r[colId]);
		render(); renderColList();
		saveColumnsToServer();
	});
}

function registerFinanceRealtime() {
	if (window.QLPKRealtimeClient && typeof window.QLPKRealtimeClient.start === 'function') {
		window.QLPKRealtimeClient.start();
	}
	if (!window.QLPKRealtimePageHooks) return;

	let pendingReload = false;
	function reloadWhenIdle() {
		const active = document.activeElement;
		if (active && active.classList && active.classList.contains('cell-input')) {
			if (pendingReload) return;
			pendingReload = true;
			active.addEventListener('blur', function () {
				pendingReload = false;
				loadExpenses();
			}, { once: true });
			return;
		}

		loadExpenses();
	}

	window.QLPKRealtimePageHooks.register({
		types: ['finance.changed'],
		debounceMs: 500,
		handler: reloadWhenIdle,
	});
}

initGlobalDateFilter();
registerFinanceRealtime();
switchTab(activeTab);
