// doctor-examination/clinical-workspace-ui.js: phần 1/2 các hàm của create() (nạp trước clinical-workspace-ui.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/clinical-workspace-ui#create'] || (window.QLPKModuleParts['doctor-examination/clinical-workspace-ui#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
		function resolveDomId(id) {
			return inst.dom[id] || id;
		}
	function getWorkspaceRoot(doc) {
		return doc.getElementById(resolveDomId('doctorClinicalWorkspace')) || doc;
	}
	function resetWorkspaceScrollPositions(doc) {
		const root = getWorkspaceRoot(doc);
		const elements = [root, ...root.querySelectorAll('*')];
		elements.forEach(element => {
			const styles = getComputedStyle(element);
			const scrollable = ['auto', 'scroll'].includes(styles.overflowY)
				|| ['auto', 'scroll'].includes(styles.overflowX);
			if (!scrollable) return;
			element.scrollTop = 0;
			element.scrollLeft = 0;
		});
	}
		function getElement(doc, id) {
			const physicalId = resolveDomId(id);
			const root = getWorkspaceRoot(doc);
			if (root.id === physicalId) return root;
			const scoped = root.querySelector(`#${physicalId}`);
			return scoped || (root === doc ? doc.getElementById(physicalId) : null);
		}
		function valueOf(...values) {
			for (const value of values) {
				if (outer.hasValue(value)) return value;
			}
			return '';
		}
		function setText(doc, id, value, options = {}) {
			return outer.runtimeSetText(doc, id, value, { ...options, resolveElement: getElement });
		}
		function setValue(doc, id, value) {
			return outer.runtimeSetValue(doc, id, value, { resolveElement: getElement });
		}
		function getValue(doc, id) {
			return outer.runtimeGetValue(doc, id, { resolveElement: getElement });
		}
		function updateBmiFromVitals(doc) {
			const weight = Number(getValue(doc, 'weight').replace(',', '.'));
			const heightCm = Number(getValue(doc, 'height').replace(',', '.'));
			if (!weight || !heightCm) return;
			const heightM = heightCm / 100;
			if (heightM) setValue(doc, 'bmi', (weight / (heightM * heightM)).toFixed(2));
		}
	function normalizePayload(payload = {}) {
		const examination = {
			...(payload.examination_info || {})
		};
		return {
			appointment: payload || {},
			patient: payload.patient_info || {},
			examination
		};
	}
	function getPatientIntakeForm() {
		return inst.patientIntakeForm || null;
	}
	function buildSharedPatientFormPayload(data) {
		return {
			appointment: data.appointment,
			patient_info: data.patient,
			examination_info: data.examination
		};
	}
	function getWorkspaceSaveStatusText(phase) {
		const phaseLabels = {
			main: 'Đang lưu dữ liệu khám',
			details: 'Đang lưu khám chi tiết',
			support: 'Đang lưu đơn thuốc và dịch vụ',
			complete: 'Đang hoàn thành khám'
		};
		return phaseLabels[phase] || '';
	}
	function syncTransferActionState(options = {}) {
		const button = getWorkspaceRoot(outer.getDocument(options)).querySelector('[data-doctor-workspace-action="transfer"]');
		if (!button) return;
		button.disabled = inst.STATE.workspaceSaving || inst.STATE.completing || !inst.STATE.canTransfer?.();
		button.setAttribute('aria-disabled', String(button.disabled));
	}
	function setBusy(doc, isBusy, phase = 'idle') {
		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		const scope = getWorkspaceRoot(doc);
		if (workspace) workspace.setAttribute('aria-busy', String(Boolean(isBusy)));

		['save', 'complete'].forEach(action => {
			const button = scope.querySelector(`[data-doctor-workspace-action="${action}"]`);
			if (!button) return;
			button.disabled = Boolean(isBusy);
			button.setAttribute('aria-disabled', String(Boolean(isBusy)));
			if (action === 'save') button.setAttribute('aria-busy', String(Boolean(isBusy)));
		});

		const saveButton = scope.querySelector('[data-doctor-workspace-action="save"]');
		const saveIcon = saveButton && saveButton.querySelector('[data-doctor-workspace-save-icon]');
		const saveLabel = saveButton && saveButton.querySelector('[data-doctor-workspace-save-label]');
		if (saveButton) saveButton.classList.toggle('is-saving', Boolean(isBusy));
		if (saveIcon) saveIcon.className = isBusy ? 'bi bi-arrow-repeat doctor-workspace-button__spinner' : 'bi bi-floppy';
		if (saveLabel) saveLabel.textContent = isBusy ? (phase === 'complete' ? 'Đang hoàn tất...' : 'Đang lưu...') : 'Lưu';

		const status = getElement(doc, 'doctorWorkspaceSaveStatus');
		if (status) status.textContent = isBusy ? getWorkspaceSaveStatusText(phase) : '';
		syncTransferActionState({ document: doc });
	}
	function setWorkspaceSavePhase(doc, phase) {
		inst.STATE.workspacePhase = phase;
		setBusy(doc, true, phase);
	}
	function getSectionTargetId(link) {
		if (!link) return '';
		const explicitTarget = link.dataset ? link.dataset.doctorSectionTarget : '';
		if (explicitTarget) return explicitTarget;
		const href = link.getAttribute('href') || '';
		return href.charAt(0) === '#' ? href.slice(1) : '';
	}
	function activateWorkspaceSection(doc, targetId = inst.DEFAULT_SECTION_ID, options = {}) {
		const scope = getWorkspaceRoot(doc);
		const sections = Array.from(scope.querySelectorAll(inst.COMPONENT_CONFIG.sectionSelector));
		if (!sections.length) return '';

		let nextSection = targetId ? getElement(doc, targetId) : null;
			if (!nextSection || !nextSection.classList.contains('doctor-workspace-section')) {
				nextSection = getElement(doc, inst.DEFAULT_SECTION_ID) || sections[0];
			}
			const nextId = nextSection.id;

			sections.forEach(section => {
			const isActive = section.id === nextId;
			section.hidden = !isActive;
			section.classList.toggle('is-active', isActive);
			if (isActive) {
				section.removeAttribute('aria-hidden');
			} else {
				section.setAttribute('aria-hidden', 'true');
			}
		});

		scope.querySelectorAll(inst.COMPONENT_CONFIG.navSelector || '.doctor-section-edge-nav__item').forEach(link => {
			const isActive = options.trigger
				? link === options.trigger
				: getSectionTargetId(link) === nextId;
			link.classList.toggle('is-active', isActive);
			if (isActive) {
				link.setAttribute('aria-current', 'true');
			} else {
				link.removeAttribute('aria-current');
			}
		});

		return nextId;
	}
	function syncClinicalDirtyState() {
		inst.STATE.dirty = Boolean(inst.STATE.mainDirty || inst.clinicalForm?.hasUnsavedChanges?.());
	}
	function isWorkspaceOwnedField(target) {
		return Boolean(target) && !target.closest(inst.COMPONENT_CONFIG.externalFieldSelector || '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel');
	}
	function getSupportModulesUi() {
		return typeof inst.getSupportModulesInstance === 'function'
			? inst.getSupportModulesInstance() || null
			: inst.getSupportModulesInstance || null;
	}
	function getMedicalHistoryBridge() {
		return typeof inst.getMedicalHistoryInstance === 'function'
			? inst.getMedicalHistoryInstance() || null
			: inst.getMedicalHistoryInstance || null;
	}
	function hasUnsavedChanges() {
		const supportModules = getSupportModulesUi();
		const medicalHistory = getMedicalHistoryBridge();
		return Boolean(
			inst.STATE.dirty
			|| (supportModules && typeof supportModules.hasUnsavedChanges === 'function' && supportModules.hasUnsavedChanges())
			|| (medicalHistory && typeof medicalHistory.hasPendingChanges === 'function' && medicalHistory.hasPendingChanges())
		);
	}
	function resetClinicalSaveState() {
		inst.STATE.dirty = false;
		inst.MAIN_CHANGES.reset();
		inst.STATE.saving = false;
		inst.STATE.workspaceSaving = false;
		inst.STATE.workspacePhase = 'idle';
	}
	function clear(options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		inst.STATE.contextToken += 1;
		inst.STATE.appointment = null;
		inst.STATE.patientId = null;
		inst.STATE.currentData = null;
		inst.STATE.loadFailed = false;
		inst.STATE.loadFailure = null;
		resetClinicalSaveState();
		inst.STATE.completing = false;
		resetWorkspaceScrollPositions(doc);

		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (workspace) workspace.hidden = true;
		setBusy(doc, false);

		inst.clinicalForm.clear({ document: doc, context: inst.STATE.context });
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.clear !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		patientIntakeForm.clear({ document: doc, context: inst.STATE.context });
		setText(doc, 'doctorClinicalHeading', 'Chưa chọn bệnh nhân');
		setText(doc, 'doctorPatientCode', '', { hideWhenEmpty: true });
		setText(doc, 'doctorPatientLatestVisit', '');
		setText(doc, 'doctorPatientLastDiagnosis', '');
		setText(doc, 'doctorPatientLastPrescription', '');
		const history = getElement(doc, 'doctorPatientHistory');
		if (history) history.hidden = true;
		activateWorkspaceSection(doc, inst.DEFAULT_SECTION_ID);
	}
	function getPreviousVisitSnapshot() {
		const prescriptionUi = typeof inst.getPrescriptionUiInstance === 'function'
			? inst.getPrescriptionUiInstance() || null
			: inst.getPrescriptionUiInstance;
		if (!prescriptionUi || typeof prescriptionUi.getLatestPreviousVisitSnapshot !== 'function') {
			return { status: 'unavailable' };
		}
		return prescriptionUi.getLatestPreviousVisitSnapshot();
	}
	function renderPreviousVisitSummary(doc) {
		const snapshot = getPreviousVisitSnapshot();
		const history = getElement(doc, 'doctorPatientHistory');
		setText(doc, 'doctorPatientLastDiagnosis', '');
		setText(doc, 'doctorPatientLastPrescription', '');
		if (history) history.hidden = true;

		if (snapshot.status === 'loading') {
			setText(doc, 'doctorPatientLatestVisit', 'Đang tải lịch sử...');
			return;
		}
		if (snapshot.status === 'empty') {
			setText(doc, 'doctorPatientLatestVisit', 'Chưa có lần khám trước');
			return;
		}
		if (snapshot.status !== 'ready') {
			setText(doc, 'doctorPatientLatestVisit', 'Không tải được lịch sử trước');
			return;
		}

		setText(doc, 'doctorPatientLatestVisit', `Lần khám gần nhất: ${snapshot.appointmentDate || 'Không rõ ngày'}`);
		setText(doc, 'doctorPatientLastDiagnosis', snapshot.diagnosis || 'Chưa có chẩn đoán');
		setText(doc, 'doctorPatientLastPrescription', snapshot.medicineSummary || 'Chưa kê thuốc');
		if (history) history.hidden = false;
	}
	function renderPatientHeader(doc, data) {
		const patientName = outer.textOf(valueOf(data.patient.full_name, data.appointment.patient_full_name, 'Bệnh nhân chưa có tên'));
		const patientCode = outer.textOf(valueOf(data.patient.patient_code, data.appointment.patient_code));
		setText(doc, 'doctorClinicalHeading', patientName);
		setText(doc, 'doctorPatientCode', patientCode, { hideWhenEmpty: true });
		renderPreviousVisitSummary(doc);
	}
	async function saveClinicalDetails(doc, appointmentId, _token, sections, context = inst.STATE.context) {
		return inst.clinicalForm.saveDetails(doc, appointmentId, inst.clinicalForm.getContextToken(), sections, context);
	}
	function render(payload = {}, options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		const data = normalizePayload(payload);
		inst.STATE.contextToken += 1;
		inst.STATE.appointment = data.appointment;
		inst.STATE.patientId = outer.textOf(valueOf(data.patient.id, data.appointment.patient_id));
		inst.STATE.currentData = data;
		inst.STATE.loadFailed = false;
		inst.STATE.loadFailure = null;
		resetClinicalSaveState();
		setBusy(doc, false);

		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (workspace) workspace.hidden = false;

		renderPatientHeader(doc, data);
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.populate !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		const sharedPayload = buildSharedPatientFormPayload(data);
		patientIntakeForm.populate(sharedPayload, { document: doc, context: inst.STATE.context });
		inst.clinicalForm.render(payload, { document: doc, context: inst.STATE.context });
		activateWorkspaceSection(doc, inst.DEFAULT_SECTION_ID);

		return true;
	}
	function collect(options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		const patientIntakeForm = getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.collect !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		const payload = {
			...patientIntakeForm.collect({ document: doc, context: inst.STATE.context }),
			...inst.clinicalForm.collect({ document: doc, context: inst.STATE.context })
		};
		return payload;
	}
	function getDraftControlValue(control) {
		const Input = control?.ownerDocument?.defaultView?.HTMLInputElement;
		if (Input && control instanceof Input && (control.type === 'checkbox' || control.type === 'radio')) {
			return Boolean(control.checked);
		}
		return outer.textOf(control.value);
	}
	function setDraftControlValue(control, value) {
		const Input = control?.ownerDocument?.defaultView?.HTMLInputElement;
		if (Input && control instanceof Input && (control.type === 'checkbox' || control.type === 'radio')) {
			control.checked = Boolean(value);
			return;
		}
		control.value = outer.textOf(value);
	}
	function isClinicalDraftControl(control) {
		if (control.hasAttribute?.('data-clinical-transient')) return false;
		const view = control?.ownerDocument?.defaultView;
		if (!view || !(control instanceof view.HTMLInputElement || control instanceof view.HTMLTextAreaElement || control instanceof view.HTMLSelectElement)) return false;
		if (!control.id || control.disabled && control.type === 'hidden') return false;
		if (['button', 'submit', 'reset', 'file'].includes(control.type)) return false;
		return !control.closest(inst.COMPONENT_CONFIG.draftExcludedSelector || '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel');
	}
	function getDraftSnapshot(options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		const form = getElement(doc, 'doctorClinicalForm');
		const controls = { ...(inst.clinicalForm.getDraftSnapshot({ document: doc, context: inst.STATE.context }).controls || {}) };
		if (!form) return { controls };
		form.querySelectorAll('input, textarea, select').forEach(control => {
			if (!isClinicalDraftControl(control)) return;
			if (inst.clinicalForm.ownsField(control)) return;
			controls[control.id] = getDraftControlValue(control);
		});
		return { controls };
	}
	async function restoreDraftSnapshot(snapshot = {}, options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
		if (!isCurrent()) return { restored: 0 };
		const controls = snapshot && snapshot.controls && typeof snapshot.controls === 'object' ? snapshot.controls : {};
		const clinicalResult = await inst.clinicalForm.restoreDraftSnapshot(snapshot, {
			document: doc,
			context: inst.STATE.context,
			isCurrent
		});
		if (!isCurrent()) return { restored: 0 };
		let restored = 0;
		let restoredMainControl = false;
		Object.entries(controls).forEach(([id, value]) => {
			if (!isCurrent()) return;
			const control = getElement(doc, id);
			if (!control || !isClinicalDraftControl(control)) return;
			if (inst.clinicalForm.ownsField(control)) return;
			setDraftControlValue(control, value);
			restoredMainControl = true;
			restored += 1;
		});
		if (restored) {
			if (restoredMainControl) inst.MAIN_CHANGES.mark();
				syncClinicalDirtyState();
		}
		if (!isCurrent()) return { restored: 0 };
		return { restored: restored + (clinicalResult.restored || 0) };
	}
	function whenInitialLoadSettled() {
		return inst.clinicalForm.whenInitialLoadSettled();
	}
	function setLoadFailed(loadFailed, reason = null) {
		inst.STATE.loadFailed = Boolean(loadFailed);
		inst.STATE.loadFailure = inst.STATE.loadFailed ? (reason || 'Không tải đủ dữ liệu ca khám') : null;
		return inst.STATE.loadFailed;
	}
	function saveNow(options = {}) {
		return inst.workspaceSaveController.saveNow(options);
	}
	function saveWorkspace(options = {}) {
		return inst.workspaceSaveController.saveWorkspace(options);
	}
	function resolveUnsavedChanges(options = {}) {
		return inst.workspaceSaveController.resolveUnsavedChanges(options);
	}
	function completeNow(options = {}) {
		return inst.workspaceSaveController.completeNow(options);
	}

		Object.assign(inst, {
			resolveDomId,
			getWorkspaceRoot,
			resetWorkspaceScrollPositions,
			getElement,
			valueOf,
			setText,
			setValue,
			getValue,
			updateBmiFromVitals,
			normalizePayload,
			getPatientIntakeForm,
			buildSharedPatientFormPayload,
			getWorkspaceSaveStatusText,
			syncTransferActionState,
			setBusy,
			setWorkspaceSavePhase,
			getSectionTargetId,
			activateWorkspaceSection,
			syncClinicalDirtyState,
			isWorkspaceOwnedField,
			getSupportModulesUi,
			getMedicalHistoryBridge,
			hasUnsavedChanges,
			resetClinicalSaveState,
			clear,
			getPreviousVisitSnapshot,
			renderPreviousVisitSummary,
			renderPatientHeader,
			saveClinicalDetails,
			render,
			collect,
			getDraftControlValue,
			setDraftControlValue,
			isClinicalDraftControl,
			getDraftSnapshot,
			restoreDraftSnapshot,
			whenInitialLoadSettled,
			setLoadFailed,
			saveNow,
			saveWorkspace,
			resolveUnsavedChanges,
			completeNow
		});
	});
})(window, document);
