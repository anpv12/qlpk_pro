import { el, replace } from '../shared/dom.js';

(function (window) {
	'use strict';

	const RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const MODEL = window.QLPKDoctorModuleRegistry.get('prescriptionModel');
	const TYPE_CONTRACT = window.PrescriptionTypeContract;
	if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');
	if (!MODEL) throw new Error('Thiếu prescription model');
	const { formatCurrency, textOf, toNumber } = RUNTIME;
	const DEFAULT_DOM = {
		panel: 'doctorPrescriptionHistoryPanel',
		list: 'doctorPrescriptionHistoryList',
		detail: 'doctorPrescriptionHistoryDetail',
		count: 'doctorPrescriptionHistoryCount',
		patient: 'doctorPrescriptionHistoryPatient',
		toggleSelector: '[data-prescription-history-action="toggle"]'
	};

	function getScope(options = {}) {
		return options.root || options.document || document;
	}

	function getVisits(history) {
		return (Array.isArray(history) ? history : [])
			.map(record => ({
				record,
				prescriptions: Array.isArray(record && record.prescriptions)
					? record.prescriptions.filter(prescription => Array.isArray(prescription.medicines) && prescription.medicines.length)
					: []
			}))
			.filter(visit => visit.prescriptions.length || visit.record.medicine_transactions?.length);
	}

	function getEntries(history) {
		return getVisits(history).flatMap(visit => visit.prescriptions.map(prescription => ({
			record: visit.record,
			prescription
		})));
	}

	function getVisitMedicines(visit) {
		return visit.prescriptions.flatMap(prescription => prescription.medicines || []);
	}

	function formatQuantity(value) {
		const quantity = toNumber(value, 0);
		return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(quantity);
	}

	function getUsageNote(rawUsage, medicine = {}) {
		const parsed = MODEL.parseMedicineUsage(rawUsage, MODEL.PRESCRIPTION_USAGE_MODES.TIME_SLOTS);
		if (parsed.note) return parsed.note;

		const schedule = parsed.schedule || {};
		const unit = textOf(medicine.unit) || 'đơn vị';
		const route = textOf(medicine.route || medicine.administration_method) || 'Dùng';
		if (schedule.mode === MODEL.PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY) {
			const qty = MODEL.formatDoseValue(schedule.times_per_day?.qty_per_time);
			const times = toNumber(schedule.times_per_day?.times_per_day, 0);
			return qty && times > 0
				? `${route} ${qty} ${unit}/lần, ${times} lần/ngày`
				: 'Chưa có cách dùng';
		}

		const slotParts = MODEL.PRESCRIPTION_SLOT_DEFS
			.filter(slot => toNumber(schedule.time_slots?.[slot.field], 0) > 0)
			.map(slot => `${MODEL.formatDoseValue(schedule.time_slots[slot.field])} ${unit} buổi ${slot.label.toLowerCase()}`);
		return slotParts.length ? `${route} ${slotParts.join(', ')}` : 'Chưa có cách dùng';
	}

	function getPrescriptionTypeLabel(type) {
		return TYPE_CONTRACT.getLabel(type);
	}

	const icon = name => el('i', { class: `bi ${name}`, 'aria-hidden': 'true' });

	function buildVisitListItem(visit, index, selectedIndex) {
		const record = visit.record || {};
		const medicines = getVisitMedicines(visit);
		const prescriptionCount = visit.prescriptions.length;
		const diagnosis = record.diagnosis || record.main_reason || 'Chưa có chẩn đoán';
		return el('button', { type: 'button', class: `doctor-prescription-history-modal__visit${index === selectedIndex ? ' is-selected' : ''}`, 'data-prescription-history-action': 'select', 'data-prescription-history-index': index },
			el('span', { class: 'doctor-prescription-history-modal__visit-date' }, icon('bi-calendar3'), record.appointment_date || 'Không rõ ngày'),
			' ',
			el('span', { class: 'doctor-prescription-history-modal__visit-doctor' }, icon('bi-person'), record.doctor_name || 'Chưa rõ bác sĩ'),
			' ',
			el('span', { class: 'doctor-prescription-history-modal__visit-badges' }, el('strong', null, `${medicines.length} thuốc`), el('strong', null, `${prescriptionCount} đơn`)),
			' ',
			el('span', { class: 'doctor-prescription-history-modal__visit-diagnosis' }, icon('bi-activity'), diagnosis)
		);
	}

	function buildMedicineRow(medicine, index) {
		const quantity = toNumber(medicine.quantity, 0);
		const unitPrice = toNumber(medicine.unit_price, 0);
		const source = medicine.is_external ? 'Ngoài phòng khám' : 'Trong kho';
		return el('tr', null,
			el('td', null, index + 1),
			el('td', null,
				el('strong', null, medicine.name || 'Thuốc chưa có tên'),
				' ',
				el('span', { class: 'doctor-prescription-history-modal__medicine-meta' }, medicine.generic_name || 'Chưa có hoạt chất')
			),
			el('td', null, formatQuantity(quantity)),
			el('td', null, medicine.unit || 'đơn vị'),
			el('td', null, getUsageNote(medicine.usage, medicine)),
			el('td', null, formatCurrency(unitPrice)),
			el('td', null, formatCurrency(quantity * unitPrice)),
			el('td', null, el('span', { class: 'doctor-prescription-history-modal__source' }, source))
		);
	}

	const headerRow = labels => el('tr', null, labels.map(label => el('th', null, label)));

	function buildPrescriptionTable(prescription) {
		const medicines = Array.isArray(prescription.medicines) ? prescription.medicines : [];
		const headingId = `doctorPrescriptionHistoryType-${prescription.prescription_code || 'basic'}`;
		return el('section', { class: 'doctor-prescription-history-modal__prescription', 'aria-labelledby': headingId },
			el('header', { class: 'doctor-prescription-history-modal__prescription-header' },
				el('strong', { id: headingId }, getPrescriptionTypeLabel(prescription.prescription_type)),
				' ',
				el('span', null, 'Mã đơn thuốc: ', el('strong', null, prescription.prescription_code || 'Chưa cấp mã'))
			),
			el('div', { class: 'doctor-prescription-history-modal__table-wrap', role: 'region', 'aria-label': 'Chi tiết thuốc lịch sử', tabindex: '0' },
				el('table', { class: 'doctor-prescription-history-modal__table' },
					el('thead', null, headerRow(['STT', 'Tên thuốc / hoạt chất', 'Số lượng', 'Đơn vị', 'Cách dùng', 'Đơn giá', 'Thành tiền', 'Nguồn'])),
					el('tbody', null, medicines.map(buildMedicineRow))
				)
			),
			el('div', { class: 'doctor-prescription-history-modal__prescription-total' }, 'Tổng đơn ', el('strong', null, formatCurrency(toNumber(prescription.total_amount, 0))))
		);
	}

	function buildDetail(visit, selectedIndex) {
		const record = visit.record || {};
		const medicalHistory = textOf(record.medical_history);
		const diagnosis = record.diagnosis || record.main_reason || 'Chưa có chẩn đoán';
		return [
			el('header', { class: 'doctor-prescription-history-modal__detail-header' },
				el('div', null,
					el('span', { class: 'doctor-prescription-history-modal__detail-kicker' }, icon('bi-calendar3'), `Ngày kê: ${record.appointment_date || 'Không rõ ngày'}`),
					el('h4', { id: 'doctorPrescriptionHistoryDetailHeading' }, record.doctor_name || 'Chưa rõ bác sĩ'),
					el('p', null, icon('bi-activity'), diagnosis)
				),
				el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', type: 'button', disabled: !visit.prescriptions.length, class: 'doctor-workspace-button doctor-workspace-button--primary', 'data-prescription-history-action': 'reuse', 'data-prescription-history-index': selectedIndex },
					icon('bi-copy'), el('span', null, 'Áp dụng tất cả'))
			),
			medicalHistory ? el('div', { class: 'doctor-prescription-history-modal__context' },
				el('strong', null, icon('bi-journal-text'), 'Bệnh sử'), el('p', null, medicalHistory)) : null,
			el('div', { class: 'doctor-prescription-history-modal__prescriptions' },
				visit.prescriptions.map(buildPrescriptionTable), buildLedgerTable(record.medicine_transactions))
		];
	}

	function buildLedgerRow(row, labels) {
		const money = value => value == null ? 'Chưa rõ' : formatCurrency(value);
		const balance = (value, unit) => value == null ? 'Chưa rõ' : `${value} ${unit || ''}`;
		const original = row.original_transaction_id ? ` ← #${row.original_transaction_id}` : '';
		return el('tr', null,
			el('td', null, row.created_at || '', el('br'), `${labels[row.type] || row.type} #${row.id}${original}`),
			el('td', null, row.medicine_name || '', row.financial_trace_complete ? null : [el('br'), 'Thiếu truy vết']),
			el('td', null, `${row.receipt_reference || 'Chưa rõ'} / ${row.batch_number || 'Chưa rõ'}`),
			el('td', null, String(row.quantity)),
			el('td', null, balance(row.balance_after, row.unit)),
			el('td', null, balance(row.stock_balance_after, row.unit)),
			el('td', null, money(row.unit_cost_snapshot)),
			el('td', null, money(row.sale_unit_price)),
			el('td', null, money(row.sale_amount_delta))
		);
	}

	function buildLedgerTable(transactions) {
		if (!transactions?.length) return el('p', null, 'Chưa có chứng từ cấp/hoàn thuốc; không suy lô hoặc giá từ danh mục.');
		const labels = { export: 'Cấp', return: 'Hoàn', import: 'Hoàn (cũ)', price_adjustment: 'Đổi giá' };
		return el('section', null,
			el('h5', null, 'Giao dịch thuốc đã ghi nhận'),
			el('p', null, 'Giá nhập/bán chốt theo giao dịch; không phải tiền thực thu. Dòng đổi giá không đổi tồn kho.'),
			el('div', { class: 'doctor-prescription-history-modal__table-wrap', role: 'region', 'aria-label': 'Giao dịch thuốc theo lô', tabindex: '0' },
				el('table', { class: 'table table-sm' },
					el('thead', null, headerRow(['Thời điểm / loại', 'Thuốc', 'Lần nhập / lô', 'SL kho (+ hoàn / − cấp)', 'Tồn lô sau giao dịch', 'Tồn tổng sau giao dịch', 'Giá nhập', 'Giá bán', 'Tiền tăng/giảm'])),
					el('tbody', null, transactions.map(row => buildLedgerRow(row, labels)))
				)
			)
		);
	}

	const emptyState = modifier => el('div', { class: `doctor-prescription-history-modal__empty${modifier}` },
		icon('bi-journal-medical'), el('strong', null, 'Chưa có đơn trước'), el('span', null, 'Đơn đang kê nằm ở khu vực đơn thuốc.'));

	function setPanel(options = {}) {
		const doc = options.document || document;
		const dom = { ...DEFAULT_DOM, ...(options.dom || {}) };
		const scope = getScope(options);
		const panel = scope.querySelector(`#${dom.panel}`);
		if (!panel) return false;

		const open = Boolean(options.isOpen);
		panel.hidden = !open;
		panel.setAttribute('aria-hidden', String(!open));
		doc.body?.classList.toggle('doctor-prescription-history-modal-open', open);
		scope.querySelectorAll(dom.toggleSelector).forEach(toggle => {
			toggle.setAttribute('aria-expanded', String(open));
		});
		if (open) panel.querySelector('[data-prescription-history-action="close"]')?.focus();
		return true;
	}

	function render(options = {}) {
		const dom = { ...DEFAULT_DOM, ...(options.dom || {}) };
		const scope = getScope(options);
		const list = scope.querySelector(`#${dom.list}`);
		const detail = scope.querySelector(`#${dom.detail}`);
		const count = scope.querySelector(`#${dom.count}`);
		const patient = scope.querySelector(`#${dom.patient}`);
		const visits = getVisits(options.history);
		const selectedIndex = visits.length
			? Math.max(0, Math.min(Number(options.selectedIndex) || 0, visits.length - 1))
			: 0;
		const hasHistory = visits.length > 0;

		scope.querySelectorAll(dom.toggleSelector).forEach(toggle => {
			toggle.hidden = !hasHistory;
			toggle.setAttribute('aria-expanded', hasHistory ? String(Boolean(options.isOpen)) : 'false');
		});

		if (count) count.textContent = `${visits.length} đơn`;
		if (patient && options.patientName) patient.textContent = `Các đơn thuốc trước của ${options.patientName}`;
		if (list) replace(list, visits.length
			? visits.map((visit, index) => buildVisitListItem(visit, index, selectedIndex))
			: emptyState(' doctor-prescription-history-modal__empty--list'));
		if (detail) replace(detail, visits.length
			? buildDetail(visits[selectedIndex], selectedIndex)
			: emptyState(''));
		return { visits, selectedIndex };
	}

	const api = { getVisits, getEntries, getVisitMedicines, setPanel, render };
	window.QLPKDoctorModuleRegistry.register('prescriptionHistory', api);
})(window);
