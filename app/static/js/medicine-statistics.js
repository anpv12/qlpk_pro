// Medicine statistics page: summary cards, prescriptions by doctor, inventory, prescription history and the
// dispensing ledger (per-medicine totals + transactions), with date/doctor/type/search filters and Excel export.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import { delegate } from './shared/dom.js';
import { authHeaders, formatMoney, formatNumber, getFilterParams, hideLoading, showLoading, showToast, state } from './medicine-statistics/shared.js';
import { renderInventoryTable, renderPrescriptionHistoryTable, renderPrescriptionsTable } from './medicine-statistics/tables.js';

function debounce(fn, wait) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), wait);
	};
}

export async function loadDispensingMedicines(page = 1) {
	const requestId = ++state.ledgerMedicineRequest;
	const params = new URLSearchParams(getFilterParams());
	params.set('view', 'medicines');
	params.set('page', page);
	params.set('per_page', 20);
	const rows = document.getElementById('ledgerMedicineRows');
	const status = document.getElementById('ledgerMedicineStatus');
	rows.replaceChildren();
	status.textContent = 'Đang tải thống kê...';
	document.getElementById('ledgerMedicinePage').textContent = '';
	document.getElementById('ledgerMedicinePrevious').disabled = true;
	document.getElementById('ledgerMedicineNext').disabled = true;
	try {
		const response = await fetch(`/api/medicine/statistics/ledger?${params}`, { headers: authHeaders() });
		if (!response.ok) throw new Error('Không tải được thống kê');
		const data = await response.json();
		if (requestId !== state.ledgerMedicineRequest) return;
		state.ledgerMedicinePage = data.page;
		status.textContent = data.medicines.length ? 'Chọn tên thuốc để xem từng lần bốc, giá và lô. Số tiền chỉ cộng phần có dữ liệu; thiếu dữ liệu không có nghĩa là 0đ.' : 'Không có thuốc trong khoảng ngày này.';
		const money = value => value == null ? 'Chưa rõ' : formatMoney(value);
		data.medicines.forEach(item => {
			const row = rows.insertRow();
			const button = document.createElement('button');
			button.type = 'button';
			button.dataset.qlpkButton = 'view';
			button.className = 'btn btn-sm';
			button.textContent = `${item.medicine_name} / ${item.unit || 'Chưa rõ đơn vị'}`;
			button.addEventListener('click', () => {
				state.ledgerMedicineId = item.medicine_id;
				document.getElementById('ledgerAllMedicines').hidden = false;
				loadDispensingLedger();
			});
			row.insertCell().append(button);
			const count = item.untracked_export_rows ? `${item.dispensing_count} đã xác định; ${item.untracked_export_rows} dòng chưa rõ` : item.dispensing_count;
			[count, item.visit_count, item.exported_quantity, item.returned_quantity, item.net_quantity,
				money(item.recorded_revenue), money(item.recorded_cost), item.incomplete_rows ? 'Chưa đủ dữ liệu' : money(item.gross_margin_complete_rows),
				`${item.incomplete_rows} dòng`].forEach(value => { row.insertCell().textContent = value; });
		});
		document.getElementById('ledgerMedicinePage').textContent = `Trang ${data.page}/${Math.max(1, data.total_pages)} · ${data.total} thuốc`;
		document.getElementById('ledgerMedicinePrevious').disabled = data.page <= 1;
		document.getElementById('ledgerMedicineNext').disabled = data.page >= data.total_pages;
	} catch (error) {
		if (requestId === state.ledgerMedicineRequest) status.textContent = 'Không tải được thống kê; kiểm tra khoảng ngày và thử lại.';
	}
}

async function loadDispensingLedger(page = 1) {
	const requestId = ++state.ledgerRequest;
	const params = new URLSearchParams(getFilterParams());
	params.set('page', page);
	const summary = document.getElementById('ledgerSummary');
	if (state.ledgerMedicineId !== null) params.set('medicine_id', state.ledgerMedicineId);
	const rows = document.getElementById('ledgerRows');
	rows.replaceChildren();
	summary.textContent = 'Đang tải giao dịch...';
	document.getElementById('ledgerPage').textContent = '';
	document.getElementById('ledgerPrevious').disabled = true;
	document.getElementById('ledgerNext').disabled = true;
	try {
		const response = await fetch(`/api/medicine/statistics/ledger?${params}`, { headers: authHeaders() });
		if (!response.ok) throw new Error('Không tải được giao dịch');
		const data = await response.json();
		if (requestId !== state.ledgerRequest) return;
		state.ledgerPage = data.page;
		const money = value => value == null ? 'Chưa rõ' : formatMoney(value);
		const balance = (value, unit) => value == null ? 'Chưa rõ' : `${value} ${unit || ''}`;
		const totals = data.summary;
		summary.textContent = `Tiền thuốc ghi nhận (phần có dữ liệu): ${money(totals.recorded_revenue)} · Giá vốn có dữ liệu: ${money(totals.recorded_cost)} · Lãi gộp các dòng đủ truy vết: ${money(totals.gross_margin_complete_rows)} · ${totals.incomplete_rows} dòng thiếu truy vết. ${totals.warning}`;
		const labels = { export: 'Cấp', return: 'Hoàn', import: 'Hoàn (cũ)', price_adjustment: 'Đổi giá' };
		data.transactions.forEach(item => {
			const row = rows.insertRow();
			const values = [`${item.created_at} · ${labels[item.type] || item.type} #${item.id}${item.original_transaction_id ? ` ← #${item.original_transaction_id}` : ''}`, `${item.patient_name || 'Chưa rõ'} / #${item.appointment_id || '?'} (${item.appointment_date || 'Chưa rõ ngày khám'})`, `${item.medicine_name}${item.financial_trace_complete ? '' : ' — Thiếu truy vết'}`, `${item.receipt_reference || '?'} / ${item.batch_number || '?'}`, item.quantity, money(item.unit_cost_snapshot), money(item.sale_unit_price), money(item.sale_amount_delta)];
			values.splice(5, 0, balance(item.balance_after, item.unit), balance(item.stock_balance_after, item.unit));
			values[0] += ` · Lần lưu: ${item.operation_id ? item.operation_id.slice(0, 8) : 'Chưa rõ'}`;
			row.title = item.operation_id ? `Mã lần lưu đầy đủ: ${item.operation_id}` : 'Chưa rõ lần lưu';
			values.forEach(value => { row.insertCell().textContent = value; });
		});
		if (!data.transactions.length) rows.insertRow().insertCell().textContent = 'Không có giao dịch trong bộ lọc này.';
		document.getElementById('ledgerPage').textContent = `Trang ${data.page}/${Math.max(1, data.total_pages)} · ${data.total} giao dịch`;
		document.getElementById('ledgerPrevious').disabled = data.page <= 1;
		document.getElementById('ledgerNext').disabled = data.page >= data.total_pages;
	} catch (error) {
		if (requestId === state.ledgerRequest) summary.textContent = 'Không tải được giao dịch; vui lòng thử lại.';
	}
}

function initDatePickers() {
	const today = new Date();
	const oneWeekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

	const baseConfig = {
		dateFormat: 'd/m/Y',
		locale: 'vn',
		onChange: function () {
			applyFilters();
		}
	};

	if (typeof window.flatpickr !== 'undefined') {
		window.flatpickr('#dateFrom', { ...baseConfig, defaultDate: oneWeekAgo });
		window.flatpickr('#dateTo', { ...baseConfig, defaultDate: today });
	}
}

export function setupEventListeners() {
	document.getElementById('ledgerMedicinePrevious')?.addEventListener('click', () => loadDispensingMedicines(state.ledgerMedicinePage - 1));
	document.getElementById('ledgerMedicineNext')?.addEventListener('click', () => loadDispensingMedicines(state.ledgerMedicinePage + 1));
	document.getElementById('ledgerAllMedicines')?.addEventListener('click', () => {
		state.ledgerMedicineId = null;
		document.getElementById('ledgerAllMedicines').hidden = true;
		loadDispensingLedger();
	});
	document.getElementById('ledgerThisMonth')?.addEventListener('click', () => {
		const today = new Date();
		const dates = { dateFrom: new Date(today.getFullYear(), today.getMonth(), 1), dateTo: today };
		Object.entries(dates).forEach(([id, date]) => {
			const input = document.getElementById(id);
			if (input._flatpickr) input._flatpickr.setDate(date, false);
			else input.value = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
		});
		applyFilters();
	});
	document.getElementById('ledgerPrevious')?.addEventListener('click', () => loadDispensingLedger(state.ledgerPage - 1));
	document.getElementById('ledgerNext')?.addEventListener('click', () => loadDispensingLedger(state.ledgerPage + 1));
	// Tab switching - Hook into Bootstrap tabs
	document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
		tab.addEventListener('shown.bs.tab', function (e) {
			const targetId = e.target.getAttribute('href');
			if (targetId === '#tab-medicine') {
				state.currentTab = 'inventory';
				loadInventory();
			} else if (targetId === '#tab-prescription') {
				state.currentTab = 'prescriptions';
				loadPrescriptions();
			} else if (targetId === '#tab-prescription-history') {
				state.currentTab = 'prescription-history';
				loadPrescriptionHistory();
			}
		});
	});

	// Filter changes
	document.getElementById('dateFrom')?.addEventListener('change', applyFilters);
	document.getElementById('dateTo')?.addEventListener('change', applyFilters);
	document.getElementById('doctorFilter')?.addEventListener('change', applyFilters);
	document.getElementById('medicineTypeFilter')?.addEventListener('change', applyFilters);
	document.getElementById('searchInput')?.addEventListener('input', debounce(applyFilters, 300));

	// Export button
	document.getElementById('btnExport')?.addEventListener('click', exportExcel);
}

// ==================== API CALLS ====================

async function loadStatistics() {
	const params = getFilterParams();

	try {
		const response = await fetch(`/api/medicine/statistics/summary?${params}`, {
			headers: authHeaders()
		});

		if (!response.ok) throw new Error('Failed to load statistics');

		const data = await response.json();
		if (data.success) {
			updateSummaryCards(data);
		}
	} catch (error) {
		console.error('Error loading statistics:', error);
		showToast('Lỗi khi tải thống kê', 'error');
	}
}

async function loadPrescriptions() {
	const params = getFilterParams();

	try {
		showLoading('prescriptionsTable');

		const response = await fetch(`/api/medicine/statistics/prescriptions?${params}`, {
			headers: authHeaders()
		});

		if (!response.ok) throw new Error('Failed to load prescriptions');

		const data = await response.json();
		if (data.success) {
			renderPrescriptionsTable(data);
		}
	} catch (error) {
		console.error('Error loading prescriptions:', error);
		showToast('Lỗi khi tải danh sách đơn thuốc', 'error');
	} finally {
		hideLoading('prescriptionsTable');
	}
}

async function loadInventory() {
	const params = getFilterParams();

	try {
		showLoading('inventoryTable');

		const response = await fetch(`/api/medicine/statistics/inventory?${params}`, {
			headers: authHeaders()
		});

		if (!response.ok) throw new Error('Failed to load inventory');

		const data = await response.json();
		if (data.success) {
			renderInventoryTable(data);
		}
	} catch (error) {
		console.error('Error loading inventory:', error);
		showToast('Lỗi khi tải danh sách tồn kho', 'error');
	} finally {
		hideLoading('inventoryTable');
	}
}

async function loadDoctorsFilter() {
	try {
		const response = await fetch('/api/medicine/statistics/doctors', {
			headers: authHeaders()
		});

		if (!response.ok) return;

		const data = await response.json();
		if (data.success && data.doctors) {
			const select = document.getElementById('doctorFilter');
			if (select) {
				data.doctors.forEach(doc => {
					const option = document.createElement('option');
					option.value = doc.id;
					option.textContent = doc.name;
					select.appendChild(option);
				});
			}
		}
	} catch (error) {
		console.error('Error loading doctors:', error);
	}
}

async function exportExcel() {
	if (state.currentTab === 'ledger') {
		showToast('Sổ giao dịch chưa hỗ trợ xuất Excel; không xuất thay bằng số liệu đơn hiện tại.', 'info');
		return;
	}
	const params = getFilterParams();

	try {
		showToast('Đang xuất Excel...', 'info');

		const response = await fetch(`/api/medicine/statistics/export?${params}`, {
			headers: authHeaders()
		});

		if (!response.ok) throw new Error('Export failed');

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `thong_ke_thuoc_${new Date().toISOString().split('T')[0]}.xlsx`;
		a.click();
		window.URL.revokeObjectURL(url);

		showToast('Xuất Excel thành công!', 'success');
	} catch (error) {
		console.error('Error exporting:', error);
		showToast('Lỗi khi xuất Excel', 'error');
	}
}

function updateSummaryCards(data) {
	const el = (id) => document.getElementById(id);

	el('totalPrescriptions').textContent = formatNumber(data.total_examinations);
	
	const svcRevEl = el('totalServiceRevenue');
	if (svcRevEl) svcRevEl.textContent = formatMoney(data.total_service_revenue || 0);
	
	el('totalRevenue').textContent = formatMoney(data.total_revenue);

	const dispensedEl = el('totalDispensed');
	if (dispensedEl) dispensedEl.textContent = formatNumber(data.total_dispensed);

	const qtyEl = el('totalDispensedQty');
	if (qtyEl) qtyEl.textContent = formatNumber(data.total_dispensed_qty || 0);
}

function switchTab(tabName) {
	state.currentTab = tabName;
	const currentSummary = document.getElementById('currentPrescriptionSummary');
	if (currentSummary) currentSummary.classList.toggle('d-none', tabName === 'ledger');
	sessionStorage.setItem('medicineStatsActiveTab', tabName);

	// Update tab UI
	document.querySelectorAll('[data-tab]').forEach(tab => {
		tab.classList.toggle('active', tab.dataset.tab === tabName);
	});

	// Show/hide panels
	const panes = {
		'prescriptions': document.getElementById('tab-prescription'),
		'inventory': document.getElementById('tab-medicine'),
		'prescription-history': document.getElementById('tab-prescription-history'),
		'ledger': document.getElementById('tab-ledger')
	};
	Object.entries(panes).forEach(([key, pane]) => {
		if (pane) {
			pane.classList.toggle('show', tabName === key);
			pane.classList.toggle('active', tabName === key);
		}
	});

	// Load data for active tab
	applyFilters();
}

async function loadPrescriptionHistory() {
	const params = getFilterParams();
	try {
		showLoading('historyMasterTableBody');
		const response = await fetch(`/api/medicine/statistics/prescription-history?${params}`, {
			headers: authHeaders()
		});
		if (!response.ok) throw new Error('Failed to load prescription history');
		const data = await response.json();
		if (data.success) {
			renderPrescriptionHistoryTable(data.medicines);
		}
	} catch (error) {
		console.error('Error loading prescription history:', error);
		showToast('Lỗi khi tải lịch sử kê thuốc', 'error');
	} finally {
		hideLoading('historyMasterTableBody');
	}
}

export function applyFilters() {
	if (state.currentTab === 'ledger') {
		state.ledgerMedicineId = null;
		document.getElementById('ledgerAllMedicines').hidden = true;
		loadDispensingMedicines();
		loadDispensingLedger();
		return;
	}
	// Summary cards luôn lấy từ /summary (nguồn duy nhất)
	loadStatistics();

	// Chỉ load data cho tab đang active
	if (state.currentTab === 'prescriptions') {
		loadPrescriptions();
	} else if (state.currentTab === 'inventory') {
		loadInventory();
	} else if (state.currentTab === 'prescription-history') {
		loadPrescriptionHistory();
	}
}


initDatePickers();
loadDoctorsFilter();
switchTab(sessionStorage.getItem('medicineStatsActiveTab') || 'prescriptions');
setupEventListeners();
delegate(document, 'click', '[data-stats-tab]', (event, link) => switchTab(link.dataset.statsTab));
window.QLPKRealtimePageHooks?.register({ types: ['inventory.changed'], debounceMs: 500, handler: () => applyFilters() });
