/**
 * Medicine Statistics JavaScript
 * Xử lý logic cho trang thống kê thuốc
 */

// ==================== CONSTANTS ====================

const STATUS_MAP = {
	'sufficient': { label: 'Đủ hàng', class: 'status-sufficient' },
	'low': { label: 'Sắp hết', class: 'status-low' },
	'restock': { label: 'Cần nhập', class: 'status-restock' },
	// Fallback cho backend trả text tiếng Việt
	'Đủ hàng': { label: 'Đủ hàng', class: 'status-sufficient' },
	'Sắp hết': { label: 'Sắp hết', class: 'status-low' },
	'Cần nhập': { label: 'Cần nhập', class: 'status-restock' }
};

// ==================== GLOBAL STATE ====================

let currentTab = 'prescriptions'; // 'prescriptions' | 'inventory' | 'prescription-history'
let expandedDoctors = new Set();

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function () {
	initDatePickers();
	loadDoctorsFilter();

	const savedTab = sessionStorage.getItem('medicineStatsActiveTab') || 'prescriptions';
	switchTab(savedTab);

	setupEventListeners();
	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['inventory.changed'],
			debounceMs: 500,
			handler: function () {
				applyFilters();
			}
		});
	}
});

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

	if (typeof flatpickr !== 'undefined') {
		flatpickr('#dateFrom', { ...baseConfig, defaultDate: oneWeekAgo });
		flatpickr('#dateTo', { ...baseConfig, defaultDate: today });
	}
}

function setupEventListeners() {
	// Tab switching - Hook into Bootstrap tabs
	document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
		tab.addEventListener('shown.bs.tab', function (e) {
			const targetId = e.target.getAttribute('href');
			if (targetId === '#tab-medicine') {
				currentTab = 'inventory';
				loadInventory();
			} else if (targetId === '#tab-prescription') {
				currentTab = 'prescriptions';
				loadPrescriptions();
			} else if (targetId === '#tab-prescription-history') {
				currentTab = 'prescription-history';
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
			headers: getAuthHeaders()
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
			headers: getAuthHeaders()
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
			headers: getAuthHeaders()
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
			headers: getAuthHeaders()
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
	const params = getFilterParams();

	try {
		showToast('Đang xuất Excel...', 'info');

		const response = await fetch(`/api/medicine/statistics/export?${params}`, {
			headers: getAuthHeaders()
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

// ==================== RENDER HELPERS ====================

function renderMedicineSummary({ total, types, qty, variant = 'primary' }) {
	const badgeClass = variant === 'danger'
		? 'bg-danger bg-opacity-10 text-danger'
		: 'bg-primary bg-opacity-10 text-primary';
	const textClass = variant === 'danger' ? 'text-danger' : '';

	return `
		<div class="d-flex align-items-center justify-content-between">
			<span><strong class="summary-qty ${textClass}">${total}</strong> <small class="fw-semibold">Thuốc</small></span>
			<span class="badge ${badgeClass} badge-type">${types} Loại</span>
		</div>
		<div class="medicine-summary"><strong class="summary-qty ${textClass}">${formatNumber(qty)}</strong> <small class="fw-semibold">Viên</small></div>
	`;
}

function renderMedicineDetailTable(medicines) {
	if (!medicines || medicines.length === 0) return '<em>Không có dữ liệu thuốc</em>';

	const rows = medicines.map(med => `
		<tr>
			<td>${med.stt}</td>
			<td>${med.name}</td>
			<td>${med.purchase_location}</td>
			<td>${med.medicine_type}</td>
			<td>${med.quantity} ${med.unit || ''}</td>
			<td>${formatMoney(med.unit_price)}</td>
			<td>${formatMoney(med.total_price)}</td>
		</tr>
	`).join('');

	return `
		<table class="detail-table">
			<thead>
				<tr>
					<th>STT</th>
					<th>Tên thuốc</th>
					<th>Mua tại</th>
					<th>Loại thuốc</th>
					<th>Số lượng</th>
					<th>Đơn giá</th>
					<th>Thành tiền</th>
				</tr>
			</thead>
			<tbody>${rows}</tbody>
		</table>
	`;
}

function renderStatusBadge(status) {
	const mapped = STATUS_MAP[status] || { label: status, class: 'bg-secondary' };
	return `<span class="badge ${mapped.class}">${mapped.label}</span>`;
}

// ==================== SUMMARY CARDS (nguồn duy nhất: /summary API) ====================

function updateSummaryCards(data) {
	const el = (id) => document.getElementById(id);

	el('totalPrescriptions').textContent = formatNumber(data.total_examinations);
	
	const svcRevEl = el('totalServiceRevenue');
	if (svcRevEl) svcRevEl.textContent = formatMoney(data.total_service_revenue || 0);
	
	el('totalRevenue').textContent = formatMoney(data.total_revenue);

	// Lượt bốc thuốc: big number = total_dispensed, label = tổng viên
	const dispensedEl = el('totalDispensed');
	if (dispensedEl) dispensedEl.textContent = formatNumber(data.total_dispensed);

	const qtyEl = el('totalDispensedQty');
	if (qtyEl) qtyEl.textContent = formatNumber(data.total_dispensed_qty || 0);
}

// ==================== RENDER FUNCTIONS ====================

function renderPrescriptionsTable(data) {
	const tbody = document.getElementById('prescriptionsTableBody');
	if (!tbody) return;

	const table = tbody.closest('table');
	if (table) table.classList.add('medicine-stats-fixed-table');

	tbody.innerHTML = '';

	if (!data.doctors || data.doctors.length === 0) {
		tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
		return;
	}

	// Grand Total Row
	if (data.grand_total) {
		const totalRow = document.createElement('tr');
		totalRow.className = 'row-grand-total';
		totalRow.innerHTML = `
			<td><strong class="text-danger">Tổng cộng</strong></td>
			<td><strong class="text-danger">${data.grand_total.examination_count} Lượt</strong></td>
			<td></td>
			<td><strong class="text-danger">${data.grand_total.service_count} dịch vụ</strong></td>
			<td>${renderMedicineSummary({
			total: data.grand_total.total_medicine_items,
			types: data.grand_total.medicine_count,
			qty: data.grand_total.total_dispensed_qty,
			variant: 'danger'
		})}</td>
			<td><strong class="text-danger">${formatMoney(data.grand_total.medicine_amount)}</strong></td>
			<td><strong class="text-danger">${formatMoney(data.grand_total.service_amount)}</strong></td>
			<td><strong class="text-danger">${formatMoney(data.grand_total.medicine_amount + data.grand_total.service_amount)}</strong></td>
			<td></td>
		`;
		tbody.appendChild(totalRow);
	}

	// Filter BS hiện tại
	const selectedDoctorId = document.getElementById('doctorFilter')?.value;

	data.doctors.forEach(doctor => {
		if (selectedDoctorId && String(doctor.doctor_id) !== selectedDoctorId) return;
		const isExpanded = expandedDoctors.has(doctor.doctor_id);

		// Doctor Header Row
		const headerRow = document.createElement('tr');
		headerRow.className = 'group-header row-doctor-header';
		headerRow.onclick = function () { toggleDoctorGroup(doctor.doctor_id); };
		headerRow.innerHTML = `
			<td>
				<div class="d-flex align-items-center">
					<i class="bi bi-caret-${isExpanded ? 'down' : 'right'}-fill me-2" id="doctorIcon${doctor.doctor_id}"></i>
					<strong>${doctor.doctor_name}</strong>
				</div>
			</td>
			<td>${doctor.examination_count} Lượt</td>
			<td></td>
			<td>${doctor.service_count} dịch vụ</td>
			<td>${renderMedicineSummary({
			total: doctor.total_medicine_items,
			types: doctor.medicine_count,
			qty: doctor.total_dispensed_qty
		})}</td>
			<td><strong>${formatMoney(doctor.medicine_amount)}</strong></td>
			<td><strong>${formatMoney(doctor.service_amount)}</strong></td>
			<td><strong>${formatMoney(doctor.medicine_amount + doctor.service_amount)}</strong></td>
			<td></td>
		`;
		tbody.appendChild(headerRow);

		// Build prescription map keyed by appointment_id for this doctor
		const presMap = {};
		(doctor.prescriptions || []).forEach(pres => {
			presMap[pres.appointment_id] = pres;
		});

		// Examination rows (lượt khám thật — bao gồm cả có và không có đơn thuốc)
		(doctor.examinations || []).forEach(exam => {
			const row = document.createElement('tr');
			row.className = `prescription-row doctor-${doctor.doctor_id}`;
			row.classList.toggle('medicine-stats-hidden', !isExpanded);

			// Tìm prescription tương ứng (nếu có)
			const pres = presMap[exam.appointment_id];

			let medicineTd = '<td>-</td>';
			let medicineAmtTd = '<td>-</td>';
			let svcAmtTd = exam.service_amount ? `<td>${formatMoney(exam.service_amount)}</td>` : '<td>-</td>';
			let totalAmtTd = exam.service_amount ? `<td>${formatMoney(exam.service_amount)}</td>` : '<td>-</td>';
			let recheckTd = '<td>-</td>';

			if (pres) {
				row.dataset.prescription = pres.id;
				medicineTd = `<td>
					<span class="medicine-toggle" onclick="toggleMedicineDetail(${pres.id})">
						<span><i class="bi bi-caret-right-fill me-1" id="medIcon${pres.id}"></i><strong class="summary-qty">${pres.total_medicine_items}</strong> <small class="fw-semibold">Thuốc</small></span>
						<span class="badge bg-primary bg-opacity-10 text-primary badge-type">${pres.medicine_count} Loại</span>
					</span>
					<div class="medicine-summary medicine-summary-nested"><strong class="summary-qty">${formatNumber(pres.total_dispensed_qty)}</strong> <small class="fw-semibold">viên</small></div>
				</td>`;
				const medAmt = pres.total_amount || 0;
				const svcAmt = exam.service_amount || 0;
				medicineAmtTd = `<td>${formatMoney(medAmt)}</td>`;
				svcAmtTd = `<td>${formatMoney(svcAmt)}</td>`;
				totalAmtTd = `<td><strong>${formatMoney(medAmt + svcAmt)}</strong></td>`;
				recheckTd = `<td>${pres.recheck_date || '-'}</td>`;
			}

			row.innerHTML = `
				<td>${exam.patient_name}</td>
				<td>${exam.appointment_date}</td>
				<td>${exam.appointment_time}</td>
				<td>${exam.services || '-'}</td>
				${medicineTd}
				${medicineAmtTd}
				${svcAmtTd}
				${totalAmtTd}
				${recheckTd}
			`;
			tbody.appendChild(row);

			// Medicine detail row (chỉ nếu có prescription)
			if (pres) {
				const detailRow = document.createElement('tr');
				detailRow.className = 'medicine-detail-row medicine-stats-hidden';
				detailRow.id = `medicine-detail-${pres.id}`;
				detailRow.innerHTML = `<td colspan="9">${renderMedicineDetailTable(pres.medicines)}</td>`;
				tbody.appendChild(detailRow);
			}
		});
	});
}

function renderInventoryTable(data) {
	const tbody = document.getElementById('inventoryTableBody');
	if (!tbody) return;

	tbody.innerHTML = '';

	if (!data.medicines || data.medicines.length === 0) {
		tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
		return;
	}

	// Filter theo BS nếu có
	const selectedDoctorId = document.getElementById('doctorFilter')?.value;
	const filteredMeds = selectedDoctorId
		? data.medicines.filter(med => med.export_quantity > 0)
		: data.medicines;

	if (filteredMeds.length === 0) {
		tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Không có thuốc đã bốc trong khoảng thời gian này</td></tr>';
		return;
	}

	filteredMeds.forEach((med, index) => {
		const row = document.createElement('tr');
		row.innerHTML = `
			<td>${index + 1}</td>
			<td>${med.name}</td>
			<td>${med.medicine_type}</td>
			<td>${formatMoney(med.import_price)}</td>
			<td>${formatMoney(med.unit_price)}</td>
			<td>${med.export_quantity}</td>
			<td class="fw-bold">${med.stock_quantity}</td>
			<td>${med.expiry_date}</td>
			<td>${renderStatusBadge(med.status)}</td>
		`;
		tbody.appendChild(row);
	});

	// Update status badges
	const statusCounts = { sufficient: 0, low: 0, restock: 0 };
	filteredMeds.forEach(med => {
		const s = med.status;
		if (s === 'Đủ hàng' || s === 'sufficient') statusCounts.sufficient++;
		else if (s === 'Sắp hết' || s === 'low') statusCounts.low++;
		else if (s === 'Cần nhập' || s === 'restock') statusCounts.restock++;
	});

	const el = (id) => document.getElementById(id);
	const badgeSufficient = el('badgeSufficient');
	const badgeLow = el('badgeLow');
	const badgeRestock = el('badgeRestock');
	if (badgeSufficient) badgeSufficient.textContent = `Đủ hàng: ${statusCounts.sufficient}`;
	if (badgeLow) badgeLow.textContent = `Sắp hết: ${statusCounts.low}`;
	if (badgeRestock) badgeRestock.textContent = `Cần nhập: ${statusCounts.restock}`;
}

// ==================== UI INTERACTIONS ====================

function switchTab(tabName) {
	currentTab = tabName;
	sessionStorage.setItem('medicineStatsActiveTab', tabName);

	// Update tab UI
	document.querySelectorAll('[data-tab]').forEach(tab => {
		tab.classList.toggle('active', tab.dataset.tab === tabName);
	});

	// Show/hide panels
	const panes = {
		'prescriptions': document.getElementById('tab-prescription'),
		'inventory': document.getElementById('tab-medicine'),
		'prescription-history': document.getElementById('tab-prescription-history')
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

function toggleDoctorGroup(doctorId) {
	const isExpanded = expandedDoctors.has(doctorId);

	if (isExpanded) {
		expandedDoctors.delete(doctorId);
	} else {
		expandedDoctors.add(doctorId);
	}

	// Update icon
	const icon = document.getElementById(`doctorIcon${doctorId}`);
	if (icon) {
		icon.className = `bi bi-caret-${!isExpanded ? 'down' : 'right'}-fill me-2`;
	}

	// Toggle visibility of prescription rows
	document.querySelectorAll(`.doctor-${doctorId}`).forEach(row => {
		row.classList.toggle('medicine-stats-hidden', isExpanded);
	});

	// Also hide medicine detail rows when collapsing
	if (isExpanded) {
		document.querySelectorAll(`.doctor-${doctorId}`).forEach(row => {
			const presId = row.dataset.prescription;
			if (presId) {
				const detailRow = document.getElementById(`medicine-detail-${presId}`);
				if (detailRow) detailRow.classList.add('medicine-stats-hidden');
				const medIcon = document.getElementById(`medIcon${presId}`);
				if (medIcon) medIcon.className = 'bi bi-caret-right-fill me-1';
			}
		});
	}
}

function toggleMedicineDetail(presId) {
	const detailRow = document.getElementById(`medicine-detail-${presId}`);
	const icon = document.getElementById(`medIcon${presId}`);

	if (!detailRow) return;

	const isVisible = !detailRow.classList.contains('medicine-stats-hidden');
	detailRow.classList.toggle('medicine-stats-hidden', isVisible);

	if (icon) {
		icon.className = `bi bi-caret-${isVisible ? 'right' : 'down'}-fill me-1`;
	}
}

// ==================== PRESCRIPTION HISTORY (Tab 3) ====================

async function loadPrescriptionHistory() {
	const params = getFilterParams();
	try {
		showLoading('historyMasterTableBody');
		const response = await fetch(`/api/medicine/statistics/prescription-history?${params}`, {
			headers: getAuthHeaders()
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

let _historyMedicinesData = []; // Store for click handling

function renderPrescriptionHistoryTable(medicines) {
	_historyMedicinesData = medicines;
	const tbody = document.getElementById('historyMasterTableBody');
	if (!tbody) return;
	tbody.innerHTML = '';

	// Hide detail card on fresh load
	const detailCard = document.getElementById('historyDetailCard');
	if (detailCard) detailCard.classList.add('medicine-stats-hidden');

	const countEl = document.getElementById('historyMedicineCount');

	if (!medicines || medicines.length === 0) {
		tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
		if (countEl) countEl.textContent = '';
		return;
	}

	if (countEl) countEl.textContent = `${medicines.length} thuốc`;

	// Grand total row
	const grandTotal = medicines.reduce((acc, m) => {
		acc.quantity += m.total_quantity;
		acc.amount += m.total_amount;
		return acc;
	}, { quantity: 0, amount: 0 });

	const totalRow = document.createElement('tr');
	totalRow.className = 'row-grand-total';
	totalRow.innerHTML = `
		<td colspan="3"><strong class="text-danger">TỔNG CỘNG</strong></td>
		<td class="text-center"><strong class="text-danger">${formatNumber(medicines.reduce((s, m) => s + m.total_prescriptions, 0))}</strong></td>
		<td class="text-end"><strong class="text-danger">${formatNumber(grandTotal.quantity)}</strong></td>
		<td class="text-end"><strong class="text-danger">${formatMoney(grandTotal.amount)}</strong></td>
	`;
	tbody.appendChild(totalRow);

	// Medicine rows
	medicines.forEach((med, idx) => {
		const row = document.createElement('tr');
		row.classList.add('medicine-stats-clickable-row');
		row.onclick = function () { selectMedicineHistory(idx); };
		row.innerHTML = `
			<td><strong>${med.medicine_name}</strong></td>
			<td class="text-muted">${med.generic_name || ''}</td>
			<td>${med.medicine_type}</td>
			<td class="text-center">${formatNumber(med.total_prescriptions)}</td>
			<td class="text-end"><strong>${formatNumber(med.total_quantity)}</strong></td>
			<td class="text-end"><strong>${formatMoney(med.total_amount)}</strong></td>
		`;
		tbody.appendChild(row);
	});

	// Auto-select first medicine
	if (medicines.length > 0) {
		selectMedicineHistory(0);
	}
}

function selectMedicineHistory(idx) {
	const med = _historyMedicinesData[idx];
	if (!med) return;

	// Highlight selected row in master table
	const masterTbody = document.getElementById('historyMasterTableBody');
	if (masterTbody) {
		// +1 to skip grand total row
		Array.from(masterTbody.rows).forEach((row, i) => {
			row.classList.toggle('table-active', i === idx + 1);
		});
	}

	// Show detail card
	const detailCard = document.getElementById('historyDetailCard');
	if (detailCard) detailCard.classList.remove('medicine-stats-hidden');

	// Update header
	document.getElementById('historyDetailTitle').textContent = med.medicine_name;
	document.getElementById('historyDetailQty').textContent = `${formatNumber(med.total_quantity)} ${med.unit}`;
	document.getElementById('historyDetailAmount').textContent = formatMoney(med.total_amount);

	// Render detail table (doctor → items)
	const detailTbody = document.getElementById('historyDetailTableBody');
	if (!detailTbody) return;
	detailTbody.innerHTML = '';

	med.doctors.forEach(doc => {
		// Doctor header row
		const docRow = document.createElement('tr');
		docRow.className = 'row-doctor-header medicine-stats-clickable-row';
		const docKey = `hist-detail-doc-${doc.doctor_id}`;
		docRow.onclick = function () {
			const rows = detailTbody.querySelectorAll(`.${docKey}`);
			const icon = this.querySelector('i');
			const visible = rows.length > 0 && !rows[0].classList.contains('medicine-stats-hidden');
			rows.forEach(r => r.classList.toggle('medicine-stats-hidden', visible));
			if (icon) icon.className = `bi bi-caret-${visible ? 'right' : 'down'}-fill me-2`;
		};
		docRow.innerHTML = `
			<td>
				<div class="d-flex align-items-center">
					<i class="bi bi-caret-down-fill me-2"></i>
					<strong>${doc.doctor_name}</strong>
				</div>
			</td>
			<td></td>
			<td></td>
			<td></td>
			<td class="text-end"><strong>${formatNumber(doc.total_quantity)}</strong></td>
			<td></td>
			<td class="text-end"><strong>${formatMoney(doc.total_amount)}</strong></td>
		`;
		detailTbody.appendChild(docRow);

		// Item rows (visible by default)
		doc.items.forEach(item => {
			const itemRow = document.createElement('tr');
			itemRow.className = docKey;
			itemRow.innerHTML = `
				<td></td>
				<td>${item.date}</td>
				<td>${item.patient_name}</td>
				<td>${item.prescription_code}</td>
				<td class="text-end">${item.quantity}</td>
				<td>${item.source}</td>
				<td class="text-end">${formatMoney(item.amount)}</td>
			`;
			detailTbody.appendChild(itemRow);
		});
	});
}



function getFilterParams() {
	const params = new URLSearchParams();

	const fromDate = document.getElementById('dateFrom')?.value;
	const toDate = document.getElementById('dateTo')?.value;
	const doctorId = document.getElementById('doctorFilter')?.value;
	const medicineType = document.getElementById('medicineTypeFilter')?.value;
	const search = document.getElementById('searchInput')?.value;

	if (fromDate) params.set('from_date', convertDateFormat(fromDate));
	if (toDate) params.set('to_date', convertDateFormat(toDate));
	if (doctorId) params.set('doctor_id', doctorId);
	if (medicineType) params.set('medicine_type', medicineType);
	if (search) params.set('search', search);

	return params.toString();
}

function convertDateFormat(dateStr) {
	if (!dateStr) return '';
	const parts = dateStr.split('/');
	if (parts.length === 3) {
		return `${parts[2]}-${parts[1]}-${parts[0]}`;
	}
	return dateStr;
}

function applyFilters() {
	// Summary cards luôn lấy từ /summary (nguồn duy nhất)
	loadStatistics();

	// Chỉ load data cho tab đang active
	if (currentTab === 'prescriptions') {
		loadPrescriptions();
	} else if (currentTab === 'inventory') {
		loadInventory();
	} else if (currentTab === 'prescription-history') {
		loadPrescriptionHistory();
	}
}

function formatNumber(num) {
	return (num || 0).toLocaleString('vi-VN');
}

function formatMoney(amount) {
	return (amount || 0).toLocaleString('vi-VN') + ' đ';
}

function getAuthHeaders() {
	const token = localStorage.getItem('qlpk_token') || localStorage.getItem('token');
	return {
		'Content-Type': 'application/json',
		'Authorization': token ? `Bearer ${token}` : ''
	};
}

function showToast(message, type = 'info') {
	return window.QLPKUserFeedback?.show(type, message);
}

function showLoading(containerId) {
	const container = document.getElementById(containerId);
	if (container) {
		container.classList.add('medicine-stats-loading');
	}
}

function hideLoading(containerId) {
	const container = document.getElementById(containerId);
	if (container) {
		container.classList.remove('medicine-stats-loading');
	}
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}
