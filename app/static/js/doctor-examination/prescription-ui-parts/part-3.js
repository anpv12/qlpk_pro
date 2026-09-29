// doctor-examination/prescription-ui.js: phần 3/3 các hàm của create() (nạp trước prescription-ui.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/prescription-ui#create'] || (window.QLPKModuleParts['doctor-examination/prescription-ui#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
	function handlePrescriptionInput(doc, target) {
		const rowUid = inst.getRowUidFromTarget(target, '[data-prescription-row-id]', 'data-prescription-row-id');
		const row = inst.findPrescriptionRow(rowUid);
		if (!row) return false;
		const field = target.dataset.prescriptionField;
		if (!field) return false;
		if (!inst.applyPrescriptionFieldInput(doc, row, target, field)) return false;
		inst.syncAfterPrescriptionInput(doc, field);
		inst.markPrescriptionDirty();
		inst.updatePrescriptionFooter(doc);
		return true;
	}
	function bind(options = {}) {
		const doc = inst.getDocument(options);
		inst.STATE.document = doc;
		inst.STATE.isLoading = options.isLoading || inst.STATE.isLoading;
		inst.RUNTIME.configure(options);
		const workspace = inst.getElement(doc, 'doctorClinicalWorkspace');
		if (!workspace || inst.STATE.bound) return Boolean(workspace);

		doc.addEventListener('click', event => {
			const prescriptionNavigation = event.target.closest('[data-prescription-navigation]');
			if (prescriptionNavigation) {
				event.preventDefault();
				if (prescriptionNavigation.dataset.prescriptionNavigation === 'jump') inst.jumpToPrescriptionWorkspace(doc);
				return;
			}

			const prescriptionAction = event.target.closest('[data-prescription-action]');
			if (prescriptionAction) {
				event.preventDefault();
				const action = prescriptionAction.dataset.prescriptionAction;
				if (action === 're-examination-calendar') inst.openReExaminationCalendar(doc);
				if (action === 'add-stock-row') inst.addPrescriptionRow(doc, false);
				if (action === 'print') inst.printPrescription().catch(() => inst.showToast('error', 'Không thể in đơn thuốc. Vui lòng thử lại.'));
				return;
			}

			const prescriptionRowAction = event.target.closest('[data-prescription-row-action]');
			if (prescriptionRowAction) {
				event.preventDefault();
				const rowUid = inst.getRowUidFromTarget(prescriptionRowAction, '[data-prescription-row-id]', 'data-prescription-row-id');
				const rowAction = prescriptionRowAction.dataset.prescriptionRowAction;
				if (rowAction === 'remove') inst.removePrescriptionRow(doc, rowUid);
				return;
			}

			const prescriptionHistoryAction = event.target.closest('[data-prescription-history-action]');
			if (prescriptionHistoryAction) {
				event.preventDefault();
				const action = prescriptionHistoryAction.dataset.prescriptionHistoryAction;
				if (action === 'toggle') {
					const shouldOpen = !inst.STATE.prescriptionHistoryPanelOpen;
					if (shouldOpen) inst.STATE.prescriptionHistorySelectedIndex = 0;
					inst.setPrescriptionHistoryPanel(doc, shouldOpen);
					inst.renderPrescriptionHistory(doc);
					return;
				}
				if (action === 'close') {
					inst.setPrescriptionHistoryPanel(doc, false);
					inst.renderPrescriptionHistory(doc);
					return;
				}
				const visits = inst.HISTORY.getVisits(inst.STATE.prescriptionHistory);
				const index = Number(prescriptionHistoryAction.dataset.prescriptionHistoryIndex);
				if (!Number.isInteger(index) || !visits[index]) return;
				if (action === 'select') {
					inst.STATE.prescriptionHistorySelectedIndex = index;
					inst.renderPrescriptionHistory(doc);
					return;
				}
				if (action === 'reuse') {
					const visit = visits[index];
					inst.STATE.prescriptionRows = visit.prescriptions
						.flatMap(prescription => prescription.medicines || [])
						.map(item => inst.normalizePrescriptionRow(item));
					inst.syncPrescriptionRowQuantities(doc);
					inst.markPrescriptionDirty();
					inst.renderPrescriptionRows(doc);
					inst.setPrescriptionHistoryPanel(doc, false);
					inst.renderPrescriptionHistory(doc);
					inst.showToast('info', 'Đã đưa đơn cũ vào đơn hiện tại. Vui lòng kiểm tra trước khi lưu.');
				}
			}
		});

		doc.addEventListener('keydown', event => {
			if (event.key !== 'Escape' || !inst.STATE.prescriptionHistoryPanelOpen) return;
			event.preventDefault();
			inst.setPrescriptionHistoryPanel(doc, false);
			inst.renderPrescriptionHistory(doc);
		});

		doc.addEventListener('input', event => {
			const target = event.target;
			if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

			if (target.dataset.prescriptionField && handlePrescriptionInput(doc, target)) return;
			if (target.id === inst.dom.medicineDays) {
				if (target.id === inst.dom.medicineDays) {
					inst.syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
					inst.updatePrescriptionFooter(doc);
				}
				inst.markPrescriptionDirty();

			}
		});

		workspace.addEventListener('focusin', event => {
			const target = event.target;
			if (!target || target.tagName !== 'INPUT' || target.dataset.prescriptionField !== 'name') return;
			const rowUid = inst.getRowUidFromTarget(target, '[data-prescription-row-id]', 'data-prescription-row-id');
			const row = inst.findPrescriptionRow(rowUid);
			if (row && !row.isExternal) inst.SEARCH.search(target, row);
		});

		workspace.addEventListener('keydown', event => {
			const target = event.target;
			if (!(target instanceof window.HTMLInputElement) || target.dataset.prescriptionField !== 'name') return;
			const optionKey = inst.SEARCH.handleKeydown(doc, event);
			if (optionKey) inst.applyMedicineSelection(doc, optionKey);
		});

		doc.addEventListener('input', event => {
			if (event.target && event.target.id === inst.dom.diagnosis) inst.updatePrescriptionFooter(doc);
		});
		doc.addEventListener('change', event => {
			if (event.target && event.target.id === inst.dom.diagnosis) inst.updatePrescriptionFooter(doc);
		});

		doc.addEventListener('change', event => {
			const target = event.target;
			if (target?.tagName === 'SELECT') {
				if (target.dataset.prescriptionField && handlePrescriptionInput(doc, target)) return;
				if (target.id === inst.dom.usageMode) {
					inst.setPrescriptionUsageMode(doc, target.value);
					inst.syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
					inst.renderPrescriptionRows(doc);
					inst.markPrescriptionDirty();
				}
			}
		});

		doc.addEventListener('click', event => {
			const medicineSelect = event.target.closest('[data-medicine-select]');
			if (medicineSelect) {
				event.preventDefault();
				inst.applyMedicineSelection(doc, medicineSelect.dataset.medicineSelect);
				return;
			}
			if (!event.target.closest('.doctor-prescription-cell__input--search')
				&& !event.target.closest('[data-prescription-dropdown]')) inst.SEARCH.hide(doc);
		});

		doc.addEventListener('scroll', () => inst.SEARCH.position(doc), true);
		(doc.defaultView || window).addEventListener('resize', () => inst.SEARCH.position(doc));

		inst.STATE.bound = true;
		return true;
	}
	function load(context = {}) {
		const doc = inst.getDocument(context);
		const appointment = context.payload || context.appointment || {};
		const appointmentId = inst.normalizeId(context.appointmentId || appointment.id || (appointment.appointment && appointment.appointment.id));
		const patient = appointment.patient_info || appointment.patient || {};
		const patientId = inst.normalizeId(context.patientId || patient.id || appointment.patient_id);
		if (!appointmentId) return Promise.resolve(false);

		inst.STATE.contextToken += 1;
		const token = inst.STATE.contextToken;
		inst.STATE.appointmentId = appointmentId;
		inst.STATE.patientId = patientId;
		inst.resetContextData(doc);
		inst.STATE.appointmentDate = inst.textOf(appointment.appointment_date || (appointment.appointment && appointment.appointment.appointment_date));

		return Promise.allSettled([
			inst.loadPrescription({ doc, token, appointmentId, patientId }),
			inst.loadPrescriptionHistory({ doc, token, appointmentId, patientId })
		]).then(results => results.every(result => result.status === 'fulfilled' && result.value === true));
	}
	function hasUnsavedChanges() {
		return Boolean(inst.STATE.prescriptionDirty);
	}

		Object.assign(inst, {
			handlePrescriptionInput,
			bind,
			load,
			hasUnsavedChanges
		});
	});
})(window, document);
