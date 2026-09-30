/* global currentTab: writable, expandedDoctors, formatMoney, formatNumber, getFilterParams, hideLoading, ledgerMedicineId: writable, loadDispensingLedger, loadDispensingMedicines, loadInventory, loadPrescriptions, loadStatistics, renderMedicineDetailTable, renderMedicineSummary, renderStatusBadge, toggleDoctorGroup */
/* exported applyFilters, getAuthHeaders, ledgerMedicineId, loadPrescriptionHistory, renderInventoryTable, renderPrescriptionsTable, showLoading, showToast, switchTab */
// Parts (nạp trước file này): detail-rows.js

function buildGrandTotalRow(grandTotal) {
	const totalRow = document.createElement('tr');
	totalRow.className = 'row-grand-total';
	totalRow.innerHTML = `
		<td><strong>Tổng cộng</strong></td>
		<td><strong>${grandTotal.examination_count} Lượt</strong></td>
		<td></td>
		<td><strong>${grandTotal.service_count} dịch vụ</strong></td>
		<td>${renderMedicineSummary({
		total: grandTotal.total_medicine_items,
		types: grandTotal.medicine_count,
			qty: grandTotal.total_dispensed_qty
	})}</td>
		<td><strong>${formatMoney(grandTotal.medicine_amount)}</strong></td>
		<td><strong>${formatMoney(grandTotal.service_amount)}</strong></td>
		<td><strong>${formatMoney(grandTotal.medicine_amount + grandTotal.service_amount)}</strong></td>
		<td></td>
	`;
	return totalRow;
}

function buildDoctorHeaderRow(doctor, isExpanded) {
	const headerRow = document.createElement('tr');
	headerRow.className = 'group-header row-doctor-header';
	headerRow.onclick = function () { toggleDoctorGroup(doctor.doctor_id); };
	headerRow.innerHTML = `
		<td>
			<div class="d-flex align-items-center">
				<i class="bi bi-caret-${isExpanded ? 'down' : 'right'}-fill me-2" id="doctorIcon${doctor.doctor_id}"></i>
				<strong>${window.QLPKHtml.escape(doctor.doctor_name)}</strong>
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
	return headerRow;
}

function buildExaminationRow(doctor, exam, pres, isExpanded) {
	const row = document.createElement('tr');
	row.className = `prescription-row doctor-${doctor.doctor_id}`;
	row.classList.toggle('medicine-stats-hidden', !isExpanded);

	let medicineTd = '<td>-</td>';
	let medicineAmtTd = '<td>-</td>';
	let svcAmtTd = exam.service_amount ? `<td>${formatMoney(exam.service_amount)}</td>` : '<td>-</td>';
	let totalAmtTd = exam.service_amount ? `<td>${formatMoney(exam.service_amount)}</td>` : '<td>-</td>';
	let recheckTd = '<td>-</td>';

	if (pres) {
		row.dataset.prescription = pres.id;
		medicineTd = `<td>
			<span class="medicine-toggle" data-qlpk-call="toggleMedicineDetail" data-qlpk-args='[${pres.id}]'>
				<span><i class="bi bi-caret-right-fill me-1" id="medIcon${pres.id}"></i><strong class="summary-qty">${pres.total_medicine_items}</strong> <small class="fw-semibold">Thuốc</small></span>
				<span class="badge badge-type">${pres.medicine_count} Loại</span>
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
		<td>${window.QLPKHtml.escape(exam.patient_name)}</td>
		<td>${exam.appointment_date}</td>
		<td>${exam.appointment_time}</td>
		<td>${window.QLPKHtml.escape(exam.services || '-')}</td>
		${medicineTd}
		${medicineAmtTd}
		${svcAmtTd}
		${totalAmtTd}
		${recheckTd}
	`;
	return row;
}

function buildMedicineDetailRow(pres) {
	const detailRow = document.createElement('tr');
	detailRow.className = 'medicine-detail-row medicine-stats-hidden';
	detailRow.id = `medicine-detail-${pres.id}`;
	detailRow.innerHTML = `<td colspan="9">${renderMedicineDetailTable(pres.medicines)}</td>`;
	return detailRow;
}

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
	if (data.grand_total) tbody.appendChild(buildGrandTotalRow(data.grand_total));

	// Filter BS hiện tại
	const selectedDoctorId = document.getElementById('doctorFilter')?.value;

	data.doctors.forEach(doctor => {
		if (selectedDoctorId && String(doctor.doctor_id) !== selectedDoctorId) return;
		const isExpanded = expandedDoctors.has(doctor.doctor_id);
		tbody.appendChild(buildDoctorHeaderRow(doctor, isExpanded));

		// Build prescription map keyed by appointment_id for this doctor
		const presMap = {};
		(doctor.prescriptions || []).forEach(pres => {
			presMap[pres.appointment_id] = pres;
		});

		// Examination rows (lượt khám thật — bao gồm cả có và không có đơn thuốc)
		(doctor.examinations || []).forEach(exam => {
			// Tìm prescription tương ứng (nếu có)
			const pres = presMap[exam.appointment_id];
			tbody.appendChild(buildExaminationRow(doctor, exam, pres, isExpanded));
			// Medicine detail row (chỉ nếu có prescription)
			if (pres) tbody.appendChild(buildMedicineDetailRow(pres));
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
			<td>${window.QLPKHtml.escape(med.name)}</td>
			<td>${window.QLPKHtml.escape(med.medicine_type)}</td>
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
		<td colspan="3"><strong>TỔNG CỘNG</strong></td>
		<td class="text-center"><strong>${formatNumber(medicines.reduce((s, m) => s + m.total_prescriptions, 0))}</strong></td>
		<td class="text-end"><strong>${formatNumber(grandTotal.quantity)}</strong></td>
		<td class="text-end"><strong>${formatMoney(grandTotal.amount)}</strong></td>
	`;
	tbody.appendChild(totalRow);

	// Medicine rows
	medicines.forEach((med, idx) => {
		const row = document.createElement('tr');
		row.classList.add('medicine-stats-clickable-row');
		row.onclick = function () { selectMedicineHistory(idx); };
		row.innerHTML = `
			<td><strong>${window.QLPKHtml.escape(med.medicine_name)}</strong></td>
			<td class="text-muted">${window.QLPKHtml.escape(med.generic_name || '')}</td>
			<td>${window.QLPKHtml.escape(med.medicine_type)}</td>
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
					<strong>${window.QLPKHtml.escape(doc.doctor_name)}</strong>
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
				<td>${window.QLPKHtml.escape(item.patient_name)}</td>
				<td>${window.QLPKHtml.escape(item.prescription_code)}</td>
				<td class="text-end">${item.quantity}</td>
				<td>${item.source}</td>
				<td class="text-end">${formatMoney(item.amount)}</td>
			`;
			detailTbody.appendChild(itemRow);
		});
	});
}

function applyFilters() {
	if (currentTab === 'ledger') {
		ledgerMedicineId = null;
		document.getElementById('ledgerAllMedicines').hidden = true;
		loadDispensingMedicines();
		loadDispensingLedger();
		return;
	}
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

function getAuthHeaders() {
	return {
		'Content-Type': 'application/json'
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
