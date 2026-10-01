// Medicine statistics tables built as DOM nodes: prescriptions grouped by doctor (expandable), inventory,
// and prescription history (master list + per-doctor detail).
import { el, replace } from '../shared/dom.js';
import { formatMoney, formatNumber, state } from './shared.js';

const STATUS_MAP = {
	sufficient: { label: 'Đủ hàng', class: 'status-sufficient' }, low: { label: 'Sắp hết', class: 'status-low' }, restock: { label: 'Cần nhập', class: 'status-restock' },
	'Đủ hàng': { label: 'Đủ hàng', class: 'status-sufficient' }, 'Sắp hết': { label: 'Sắp hết', class: 'status-low' }, 'Cần nhập': { label: 'Cần nhập', class: 'status-restock' },
};
const td = (...children) => el('td', {}, ...children);
const strongTd = text => td(el('strong', {}, text));
const emptyRow = (colspan, text) => el('tr', {}, el('td', { colspan, class: 'text-center text-muted py-4' }, text));
const caret = (open, spacing) => `bi bi-caret-${open ? 'down' : 'right'}-fill ${spacing}`;

function statusBadge(status) {
	const mapped = STATUS_MAP[status] || { label: status, class: 'bg-secondary' };
	return el('span', { class: `qlpk-status ${mapped.class}` }, mapped.label);
}

function medicineSummary({ total, types, qty }) {
	return [el('div', { class: 'd-flex align-items-center justify-content-between' },
		el('span', {}, el('strong', { class: 'summary-qty' }, total), ' ', el('small', { class: 'fw-semibold' }, 'Thuốc')), el('span', { class: 'badge badge-type' }, `${types} Loại`)),
	el('div', { class: 'medicine-summary' }, el('strong', { class: 'summary-qty' }, formatNumber(qty)), ' ', el('small', { class: 'fw-semibold' }, 'Viên'))];
}

function medicineDetailTable(medicines) {
	if (!medicines || !medicines.length) return el('em', {}, 'Không có dữ liệu thuốc');
	return el('table', { class: 'detail-table' },
		el('thead', {}, el('tr', {}, ['STT', 'Tên thuốc', 'Mua tại', 'Loại thuốc', 'Số lượng', 'Đơn giá', 'Thành tiền'].map(label => el('th', {}, label)))),
		el('tbody', {}, medicines.map(med => el('tr', {}, td(med.stt), td(med.name), td(med.purchase_location), td(med.medicine_type),
			td(`${med.quantity} ${med.unit || ''}`), td(formatMoney(med.unit_price)), td(formatMoney(med.total_price))))));
}

function totalsCells(group, label, countLabel) {
	return [td(...label), td(countLabel(group.examination_count)), td(), td(`${group.service_count} dịch vụ`),
		td(medicineSummary({ total: group.total_medicine_items, types: group.medicine_count, qty: group.total_dispensed_qty })),
		strongTd(formatMoney(group.medicine_amount)), strongTd(formatMoney(group.service_amount)), strongTd(formatMoney(group.medicine_amount + group.service_amount)), td()];
}

function grandTotalRow(total) {
	const cells = totalsCells(total, [el('strong', {}, 'Tổng cộng')], count => el('strong', {}, `${count} Lượt`));
	cells[3] = strongTd(`${total.service_count} dịch vụ`);
	return el('tr', { class: 'row-grand-total' }, cells);
}

function toggleDoctorGroup(doctorId) {
	const expanded = state.expandedDoctors.has(doctorId);
	if (expanded) state.expandedDoctors.delete(doctorId);
	else state.expandedDoctors.add(doctorId);
	const marker = document.getElementById(`doctorIcon${doctorId}`);
	if (marker) marker.className = caret(!expanded, 'me-2');
	document.querySelectorAll(`.doctor-${doctorId}`).forEach(row => {
		row.classList.toggle('medicine-stats-hidden', expanded);
		const presId = row.dataset.prescription;
		if (!expanded || !presId) return;
		document.getElementById(`medicine-detail-${presId}`)?.classList.add('medicine-stats-hidden');
		const medIcon = document.getElementById(`medIcon${presId}`);
		if (medIcon) medIcon.className = 'bi bi-caret-right-fill me-1';
	});
}

function toggleMedicineDetail(presId) {
	const detailRow = document.getElementById(`medicine-detail-${presId}`);
	if (!detailRow) return;
	const visible = !detailRow.classList.contains('medicine-stats-hidden');
	detailRow.classList.toggle('medicine-stats-hidden', visible);
	const marker = document.getElementById(`medIcon${presId}`);
	if (marker) marker.className = caret(!visible, 'me-1');
}

function doctorHeaderRow(doctor, expanded) {
	const row = el('tr', { class: 'group-header row-doctor-header' }, totalsCells(doctor,
		[el('div', { class: 'd-flex align-items-center' }, el('i', { class: caret(expanded, 'me-2'), id: `doctorIcon${doctor.doctor_id}` }), el('strong', {}, doctor.doctor_name))],
		count => `${count} Lượt`));
	row.addEventListener('click', () => toggleDoctorGroup(doctor.doctor_id));
	return row;
}

function medicineCell(pres) {
	const toggle = el('span', { class: 'medicine-toggle' },
		el('span', {}, el('i', { class: 'bi bi-caret-right-fill me-1', id: `medIcon${pres.id}` }), el('strong', { class: 'summary-qty' }, pres.total_medicine_items), ' ', el('small', { class: 'fw-semibold' }, 'Thuốc')),
		el('span', { class: 'badge badge-type' }, `${pres.medicine_count} Loại`));
	toggle.addEventListener('click', () => toggleMedicineDetail(pres.id));
	return td(toggle, el('div', { class: 'medicine-summary medicine-summary-nested' }, el('strong', { class: 'summary-qty' }, formatNumber(pres.total_dispensed_qty)), ' ', el('small', { class: 'fw-semibold' }, 'viên')));
}

function examinationRow(doctor, exam, pres, expanded) {
	const service = exam.service_amount || 0;
	const money = pres
		? [medicineCell(pres), td(formatMoney(pres.total_amount || 0)), td(formatMoney(service)), strongTd(formatMoney((pres.total_amount || 0) + service)), td(pres.recheck_date || '-')]
		: [td('-'), td('-'), td(service ? formatMoney(service) : '-'), td(service ? formatMoney(service) : '-'), td('-')];
	const row = el('tr', { class: `prescription-row doctor-${doctor.doctor_id}${expanded ? '' : ' medicine-stats-hidden'}` },
		td(exam.patient_name), td(exam.appointment_date), td(exam.appointment_time), td(exam.services || '-'), money);
	if (pres) row.dataset.prescription = pres.id;
	return row;
}

export function renderPrescriptionsTable(data) {
	const tbody = document.getElementById('prescriptionsTableBody');
	if (!tbody) return;
	tbody.closest('table')?.classList.add('medicine-stats-fixed-table');
	if (!data.doctors || !data.doctors.length) {
		replace(tbody, emptyRow(8, 'Không có dữ liệu'));
		return;
	}
	const selectedDoctorId = document.getElementById('doctorFilter')?.value;
	const rows = data.grand_total ? [grandTotalRow(data.grand_total)] : [];
	data.doctors.forEach(doctor => {
		if (selectedDoctorId && String(doctor.doctor_id) !== selectedDoctorId) return;
		const expanded = state.expandedDoctors.has(doctor.doctor_id);
		rows.push(doctorHeaderRow(doctor, expanded));
		const byAppointment = Object.fromEntries((doctor.prescriptions || []).map(pres => [pres.appointment_id, pres]));
		(doctor.examinations || []).forEach(exam => {
			const pres = byAppointment[exam.appointment_id];
			rows.push(examinationRow(doctor, exam, pres, expanded));
			if (pres) rows.push(el('tr', { class: 'medicine-detail-row medicine-stats-hidden', id: `medicine-detail-${pres.id}` }, el('td', { colspan: 9 }, medicineDetailTable(pres.medicines))));
		});
	});
	replace(tbody, rows);
}

export function renderInventoryTable(data) {
	const tbody = document.getElementById('inventoryTableBody');
	if (!tbody) return;
	if (!data.medicines || !data.medicines.length) {
		replace(tbody, emptyRow(11, 'Không có dữ liệu'));
		return;
	}
	const medicines = document.getElementById('doctorFilter')?.value ? data.medicines.filter(med => med.export_quantity > 0) : data.medicines;
	if (!medicines.length) {
		replace(tbody, emptyRow(11, 'Không có thuốc đã bốc trong khoảng thời gian này'));
		return;
	}
	replace(tbody, medicines.map((med, index) => el('tr', {}, td(index + 1), td(med.name), td(med.medicine_type), td(formatMoney(med.import_price)), td(formatMoney(med.unit_price)),
		td(med.export_quantity), el('td', { class: 'fw-bold' }, med.stock_quantity), td(med.expiry_date), td(statusBadge(med.status)))));
	const counts = { sufficient: 0, low: 0, restock: 0 };
	medicines.forEach(med => {
		const key = { 'Đủ hàng': 'sufficient', 'Sắp hết': 'low', 'Cần nhập': 'restock' }[med.status] || med.status;
		if (key in counts) counts[key]++;
	});
	[['badgeSufficient', 'Đủ hàng', counts.sufficient], ['badgeLow', 'Sắp hết', counts.low], ['badgeRestock', 'Cần nhập', counts.restock]].forEach(([id, label, count]) => {
		const badge = document.getElementById(id);
		if (badge) badge.textContent = `${label}: ${count}`;
	});
}

function historyDoctorRows(doc, body) {
	const key = `hist-detail-doc-${doc.doctor_id}`;
	const header = el('tr', { class: 'row-doctor-header medicine-stats-clickable-row' },
		td(el('div', { class: 'd-flex align-items-center' }, el('i', { class: 'bi bi-caret-down-fill me-2' }), el('strong', {}, doc.doctor_name))),
		td(), td(), td(), el('td', { class: 'text-end' }, el('strong', {}, formatNumber(doc.total_quantity))), td(), el('td', { class: 'text-end' }, el('strong', {}, formatMoney(doc.total_amount))));
	header.addEventListener('click', () => {
		const rows = body.querySelectorAll(`.${key}`);
		const visible = rows.length > 0 && !rows[0].classList.contains('medicine-stats-hidden');
		rows.forEach(row => row.classList.toggle('medicine-stats-hidden', visible));
		const marker = header.querySelector('i');
		if (marker) marker.className = caret(!visible, 'me-2');
	});
	return [header, doc.items.map(item => el('tr', { class: key }, td(), td(item.date), td(item.patient_name), td(item.prescription_code),
		el('td', { class: 'text-end' }, item.quantity), td(item.source), el('td', { class: 'text-end' }, formatMoney(item.amount))))];
}

function selectMedicineHistory(index) {
	const med = state.historyMedicines[index];
	if (!med) return;
	const master = document.getElementById('historyMasterTableBody');
	if (master) [...master.children].forEach((row, i) => row.classList.toggle('table-active', i === index + 1));
	document.getElementById('historyDetailCard')?.classList.remove('medicine-stats-hidden');
	document.getElementById('historyDetailTitle').textContent = med.medicine_name;
	document.getElementById('historyDetailQty').textContent = `${formatNumber(med.total_quantity)} ${med.unit}`;
	document.getElementById('historyDetailAmount').textContent = formatMoney(med.total_amount);
	const body = document.getElementById('historyDetailTableBody');
	if (body) replace(body, med.doctors.map(doc => historyDoctorRows(doc, body)));
}

export function renderPrescriptionHistoryTable(medicines) {
	state.historyMedicines = medicines;
	const tbody = document.getElementById('historyMasterTableBody');
	if (!tbody) return;
	document.getElementById('historyDetailCard')?.classList.add('medicine-stats-hidden');
	const count = document.getElementById('historyMedicineCount');
	if (!medicines || !medicines.length) {
		replace(tbody, emptyRow(6, 'Không có dữ liệu'));
		if (count) count.textContent = '';
		return;
	}
	if (count) count.textContent = `${medicines.length} thuốc`;
	const total = medicines.reduce((acc, med) => ({ quantity: acc.quantity + med.total_quantity, amount: acc.amount + med.total_amount, prescriptions: acc.prescriptions + med.total_prescriptions }), { quantity: 0, amount: 0, prescriptions: 0 });
	const end = text => el('td', { class: 'text-end' }, el('strong', {}, text));
	replace(tbody, el('tr', { class: 'row-grand-total' }, el('td', { colspan: 3 }, el('strong', {}, 'TỔNG CỘNG')), el('td', { class: 'text-center' }, el('strong', {}, formatNumber(total.prescriptions))),
		end(formatNumber(total.quantity)), end(formatMoney(total.amount))),
	medicines.map((med, index) => {
		const row = el('tr', { class: 'medicine-stats-clickable-row' }, strongTd(med.medicine_name), el('td', { class: 'text-muted' }, med.generic_name || ''), td(med.medicine_type),
			el('td', { class: 'text-center' }, formatNumber(med.total_prescriptions)), end(formatNumber(med.total_quantity)), end(formatMoney(med.total_amount)));
		row.addEventListener('click', () => selectMedicineHistory(index));
		return row;
	}));
	selectMedicineHistory(0);
}
