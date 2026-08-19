(function (window) {
	'use strict';

	const RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const MODEL = window.QLPKDoctorModuleRegistry.get('prescriptionModel');
	if (!MODEL) throw new Error('Thiếu prescription model');
	const { escapeHtml, formatCurrency, textOf, toNumber } = RUNTIME;
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
			.filter(visit => visit.prescriptions.length);
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
		return {
			BASIC: 'Đơn cơ bản',
			H: 'Đơn hướng thần (H)',
			N: 'Đơn gây nghiện (N)',
			TOXIC: 'Đơn thuốc độc'
		}[String(type || 'BASIC').toUpperCase()] || 'Đơn thuốc';
	}

	function buildVisitListItem(visit, index, selectedIndex) {
		const record = visit.record || {};
		const medicines = getVisitMedicines(visit);
		const prescriptionCount = visit.prescriptions.length;
		const diagnosis = record.diagnosis || record.main_reason || 'Chưa có chẩn đoán';
		return `
			<button type="button" class="doctor-prescription-history-modal__visit${index === selectedIndex ? ' is-selected' : ''}" data-prescription-history-action="select" data-prescription-history-index="${index}">
				<span class="doctor-prescription-history-modal__visit-date"><i class="bi bi-calendar3" aria-hidden="true"></i>${escapeHtml(record.appointment_date || 'Không rõ ngày')}</span>
				<span class="doctor-prescription-history-modal__visit-doctor"><i class="bi bi-person" aria-hidden="true"></i>${escapeHtml(record.doctor_name || 'Chưa rõ bác sĩ')}</span>
				<span class="doctor-prescription-history-modal__visit-badges"><strong>${medicines.length} thuốc</strong><strong>${prescriptionCount} đơn</strong></span>
				<span class="doctor-prescription-history-modal__visit-diagnosis"><i class="bi bi-activity" aria-hidden="true"></i>${escapeHtml(diagnosis)}</span>
			</button>`;
	}

	function buildMedicineRow(medicine, index) {
		const quantity = toNumber(medicine.quantity, 0);
		const unitPrice = toNumber(medicine.unit_price, 0);
		const source = medicine.is_external ? 'Ngoài phòng khám' : 'Trong kho';
		return `
			<tr>
				<td>${index + 1}</td>
				<td>
					<strong>${escapeHtml(medicine.name || 'Thuốc chưa có tên')}</strong>
					<span class="doctor-prescription-history-modal__medicine-meta">${escapeHtml(medicine.generic_name || 'Chưa có hoạt chất')}</span>
				</td>
				<td>${formatQuantity(quantity)}</td>
				<td>${escapeHtml(medicine.unit || 'đơn vị')}</td>
				<td>${escapeHtml(getUsageNote(medicine.usage, medicine))}</td>
				<td>${formatCurrency(unitPrice)}</td>
				<td>${formatCurrency(quantity * unitPrice)}</td>
				<td><span class="doctor-prescription-history-modal__source">${escapeHtml(source)}</span></td>
			</tr>`;
	}

	function buildPrescriptionTable(prescription) {
		const medicines = Array.isArray(prescription.medicines) ? prescription.medicines : [];
		return `
			<section class="doctor-prescription-history-modal__prescription" aria-labelledby="doctorPrescriptionHistoryType-${escapeHtml(prescription.prescription_code || 'basic')}">
				<header class="doctor-prescription-history-modal__prescription-header">
					<strong id="doctorPrescriptionHistoryType-${escapeHtml(prescription.prescription_code || 'basic')}">${escapeHtml(getPrescriptionTypeLabel(prescription.prescription_type))}</strong>
					<span>Mã đơn thuốc: <strong>${escapeHtml(prescription.prescription_code || 'Chưa cấp mã')}</strong></span>
				</header>
				<div class="doctor-prescription-history-modal__table-wrap" role="region" aria-label="Chi tiết thuốc lịch sử" tabindex="0">
					<table class="doctor-prescription-history-modal__table">
						<thead>
							<tr><th>STT</th><th>Tên thuốc / hoạt chất</th><th>Số lượng</th><th>Đơn vị</th><th>Cách dùng</th><th>Đơn giá</th><th>Thành tiền</th><th>Nguồn</th></tr>
						</thead>
						<tbody>${medicines.map(buildMedicineRow).join('')}</tbody>
					</table>
				</div>
				<div class="doctor-prescription-history-modal__prescription-total">Tổng đơn <strong>${formatCurrency(toNumber(prescription.total_amount, 0))}</strong></div>
			</section>`;
	}

	function buildDetail(visit, selectedIndex) {
		const record = visit.record || {};
		const medicalHistory = textOf(record.medical_history);
		const diagnosis = record.diagnosis || record.main_reason || 'Chưa có chẩn đoán';
		return `
			<header class="doctor-prescription-history-modal__detail-header">
				<div>
					<span class="doctor-prescription-history-modal__detail-kicker"><i class="bi bi-calendar3" aria-hidden="true"></i>Ngày kê: ${escapeHtml(record.appointment_date || 'Không rõ ngày')}</span>
					<h4 id="doctorPrescriptionHistoryDetailHeading">${escapeHtml(record.doctor_name || 'Chưa rõ bác sĩ')}</h4>
					<p><i class="bi bi-activity" aria-hidden="true"></i>${escapeHtml(diagnosis)}</p>
				</div>
				<button type="button" class="doctor-workspace-button doctor-workspace-button--primary" data-prescription-history-action="reuse" data-prescription-history-index="${selectedIndex}">
					<i class="bi bi-copy" aria-hidden="true"></i><span>Áp dụng tất cả</span>
				</button>
			</header>
			${medicalHistory ? `<div class="doctor-prescription-history-modal__context"><strong><i class="bi bi-journal-text" aria-hidden="true"></i>Bệnh sử</strong><p>${escapeHtml(medicalHistory)}</p></div>` : ''}
			<div class="doctor-prescription-history-modal__prescriptions">${visit.prescriptions.map(buildPrescriptionTable).join('')}</div>`;
	}

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
		const doc = options.document || document;
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
		if (list) list.innerHTML = visits.length
			? visits.map((visit, index) => buildVisitListItem(visit, index, selectedIndex)).join('')
			: `<div class="doctor-prescription-history-modal__empty doctor-prescription-history-modal__empty--list"><i class="bi bi-journal-medical" aria-hidden="true"></i><strong>Chưa có đơn trước</strong><span>Đơn đang kê nằm ở khu vực đơn thuốc.</span></div>`;
		if (detail) detail.innerHTML = visits.length
			? buildDetail(visits[selectedIndex], selectedIndex)
			: `<div class="doctor-prescription-history-modal__empty"><i class="bi bi-journal-medical" aria-hidden="true"></i><strong>Chưa có đơn trước</strong><span>Đơn đang kê nằm ở khu vực đơn thuốc.</span></div>`;
		return { visits, selectedIndex };
	}

	const api = { getVisits, getEntries, getVisitMedicines, setPanel, render };
	window.QLPKDoctorModuleRegistry.register('prescriptionHistory', api);
})(window);
