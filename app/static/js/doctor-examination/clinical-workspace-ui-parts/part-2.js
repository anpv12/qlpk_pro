// doctor-examination/clinical-workspace-ui.js: phần 2/2 các hàm của create() (nạp trước clinical-workspace-ui.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/clinical-workspace-ui#create'] || (window.QLPKModuleParts['doctor-examination/clinical-workspace-ui#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
	function bind(options = {}) {
		inst.STATE.context = options.context || inst.STATE.context;
		const doc = outer.getDocument(options);
		inst.STATE.apiCall = options.apiCall || inst.STATE.apiCall;
		inst.STATE.getAppointmentId = options.getAppointmentId || inst.STATE.getAppointmentId;
		inst.STATE.isLoading = options.isLoading || inst.STATE.isLoading;
		inst.STATE.showToast = options.showToast || inst.STATE.showToast;
		inst.STATE.afterSave = options.afterSave || inst.STATE.afterSave;
		inst.STATE.afterComplete = options.afterComplete || inst.STATE.afterComplete;
		inst.STATE.onTransfer = options.onTransfer || inst.STATE.onTransfer;
		inst.STATE.canTransfer = options.canTransfer || inst.STATE.canTransfer;

		const workspace = inst.getElement(doc, 'doctorClinicalWorkspace');
		if (!workspace) return false;
		if (inst.STATE.bound) return true;
		const patientIntakeForm = inst.getPatientIntakeForm();
		if (!patientIntakeForm || typeof patientIntakeForm.bind !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}
		patientIntakeForm.bind({ document: doc, context: inst.STATE.context, apiCall: inst.STATE.apiCall });
		inst.clinicalForm.bind({ document: doc, context: inst.STATE.context, isLoading: inst.STATE.isLoading });

		const form = inst.getElement(doc, 'doctorClinicalForm');
		if (form) {
			form.addEventListener('submit', event => event.preventDefault());
			const handleFieldMutation = event => {
				if (event.target?.hasAttribute?.('data-clinical-transient')) return;
				const view = event.target?.ownerDocument?.defaultView;
				if (!view || !(event.target instanceof view.HTMLInputElement || event.target instanceof view.HTMLTextAreaElement)) return;
				if (inst.clinicalForm.ownsField(event.target)) return;
				if (!inst.isWorkspaceOwnedField(event.target)) return;
				if (event.target.id === 'weight' || event.target.id === 'height') inst.updateBmiFromVitals(doc);
				inst.MAIN_CHANGES.mark();
				inst.syncClinicalDirtyState();
			};
			form.addEventListener('input', handleFieldMutation);
			form.addEventListener('change', event => {
				const view = event.target?.ownerDocument?.defaultView;
				if (view && (event.target instanceof view.HTMLInputElement || event.target instanceof view.HTMLTextAreaElement)) {
					handleFieldMutation(event);
					return;
				}
				if (view && event.target instanceof view.HTMLSelectElement && inst.isWorkspaceOwnedField(event.target)) {
					inst.MAIN_CHANGES.mark();
					inst.syncClinicalDirtyState();
				}
			});
		}

		workspace.addEventListener('click', event => {
			const sectionNavLink = event.target.closest(inst.COMPONENT_CONFIG.navItemSelector || '.doctor-section-edge-nav__item, [data-doctor-section-target]');
			if (sectionNavLink) {
				event.preventDefault();
				inst.activateWorkspaceSection(doc, inst.getSectionTargetId(sectionNavLink), {
					trigger: sectionNavLink
				});
				return;
			}

			const actionButton = event.target.closest('[data-doctor-workspace-action]');
			if (!actionButton || actionButton.disabled) return;
			const action = actionButton.dataset.doctorWorkspaceAction;
			if (action === 'transfer') inst.STATE.onTransfer?.();
			if (action === 'save') inst.saveWorkspace({ document: doc, applyDetailDefaults: true }).catch(() => {});
			if (action === 'complete') inst.completeNow({ document: doc }).catch(() => {});
		});
		doc.addEventListener(inst.COMPONENT_CONFIG.historyEventName || 'qlpk:doctor-prescription-history-loaded', event => {
			const detail = event.detail || {};
			if (!inst.STATE.currentData || String(detail.patientId || '') !== String(inst.STATE.patientId || '')) return;
			inst.renderPreviousVisitSummary(doc);
		});

		inst.STATE.bound = true;
		return true;
	}

		Object.assign(inst, {
			bind
		});
	});
})(window, document);
