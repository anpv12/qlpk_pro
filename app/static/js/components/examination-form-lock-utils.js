(function (window) {
	'use strict';

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function setFieldLocked(element, locked, options = {}) {
		if (!element) return;
		const skipIds = options.skipIds || [];
		if (skipIds.includes(element.id)) return;

		if (element.type === 'checkbox' || element.type === 'radio') {
			element.disabled = locked;
			element.style.pointerEvents = locked ? 'none' : '';
			element.style.opacity = locked ? '0.6' : '';
			return;
		}

		if (locked) {
			element.setAttribute('readonly', 'readonly');
			element.style.pointerEvents = 'none';
		} else {
			element.removeAttribute('readonly');
			element.style.pointerEvents = '';
		}
	}

	function applyLockToSelectors(options = {}) {
		const doc = getDocument(options);
		(options.selectors || []).forEach(selector => {
			doc.querySelectorAll(selector).forEach(element => {
				setFieldLocked(element, Boolean(options.locked), options);
			});
		});
	}

	function getWorkflowFormSelectors(options = {}) {
		const locked = Boolean(options.locked);
		const selectors = locked
			? [
				'#patientForm input:not([type="checkbox"]):not([type="radio"])',
				'#patientForm textarea',
				'#patientForm select',
				'#patientForm input[type="checkbox"]',
				'#patientForm input[type="radio"]',
				'[data-patient-visit-form] input:not([type="checkbox"]):not([type="radio"])',
				'[data-patient-visit-form] textarea',
				'[data-patient-visit-form] select',
				'[data-patient-visit-form] input[type="checkbox"]',
				'[data-patient-visit-form] input[type="radio"]',
				'.examination-new-layout input:not([type="checkbox"]):not([type="radio"])',
				'.examination-new-layout textarea',
				'.examination-new-layout select',
				'.examination-new-layout input[type="checkbox"]',
				'.examination-new-layout input[type="radio"]'
			]
			: [
				'#patientForm input',
				'#patientForm textarea',
				'#patientForm select',
				'[data-patient-visit-form] input',
				'[data-patient-visit-form] textarea',
				'[data-patient-visit-form] select',
				'.examination-new-layout input',
				'.examination-new-layout textarea',
				'.examination-new-layout select'
			];

		if (options.includePrescription) {
			selectors.push(...(locked
				? [
					'#prescriptionSection input:not([type="checkbox"]):not([type="radio"])',
					'#prescriptionSection select',
					'#prescriptionSection textarea',
					'#prescriptionSection input[type="checkbox"]'
				]
				: [
					'#prescriptionSection input',
					'#prescriptionSection select',
					'#prescriptionSection textarea',
					'#prescriptionTableBody input',
					'#prescriptionTableBody select',
					'#prescriptionTableBody textarea'
				]
			));
		}

		return selectors;
	}

	function applyWorkflowFormLock(options = {}) {
		applyLockToSelectors({
			document: getDocument(options),
			locked: Boolean(options.locked),
			skipIds: options.skipIds,
			selectors: options.selectors || getWorkflowFormSelectors(options)
		});
	}

	function applyLockToModal(modal, locked) {
		if (!modal) return;
		modal.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), textarea, select').forEach(element => {
			setFieldLocked(element, locked);
		});
		modal.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(element => {
			setFieldLocked(element, locked);
		});
	}

	function applyLockToModals(options = {}) {
		const doc = getDocument(options);
		(options.modalIds || []).forEach(modalId => {
			applyLockToModal(doc.getElementById(modalId), Boolean(options.locked));
		});
	}

	function disableHeaderButtonsExcept(options = {}) {
		const doc = getDocument(options);
		const allowedIds = options.allowedIds || [];
		doc.querySelectorAll(options.selector || '.patient-header-actions button').forEach(button => {
			if (!allowedIds.includes(button.id)) {
				button.disabled = true;
			}
		});
	}

	function getCopyViewAllowedButtonIds() {
		return [
			'medicalHistoryBtn',
			'detailedExaminationBtn',
			'prescriptionServiceBtn',
			'prescriptionHistoryBtn',
			'historyBtn',
			'orderBtn',
			'documentBtn',
			'editHistoryBtn'
		];
	}

	function disableCopyViewHeaderButtons(options = {}) {
		disableHeaderButtonsExcept({
			document: getDocument(options),
			selector: options.selector,
			allowedIds: options.allowedIds || getCopyViewAllowedButtonIds()
		});
	}

	function enableAllButtons(options = {}) {
		getDocument(options).querySelectorAll(options.selector || 'button').forEach(button => {
			button.disabled = false;
		});
	}

	function setEditHistoryButtonVisible(options = {}) {
		const button = getDocument(options).getElementById(options.buttonId || 'editHistoryBtn');
		if (button) {
			button.style.display = options.visible ? 'inline-flex' : 'none';
		}
	}

	function normalizeCallbacks(callbacks) {
		if (Array.isArray(callbacks)) {
			return callbacks.filter(callback => typeof callback === 'function');
		}
		return typeof callbacks === 'function' ? [callbacks] : [];
	}

	function runLockStateCallbacks(callbacks, locked) {
		normalizeCallbacks(callbacks).forEach(callback => callback(locked));
	}

	function applyCopyViewLockState(options = {}) {
		const doc = getDocument(options);
		const locked = Boolean(options.locked);
		applyWorkflowFormLock({
			document: doc,
			locked,
			skipIds: locked ? (options.skipIds || ['patientSearch']) : options.skipIds,
			includePrescription: options.includePrescription
		});
		applyLockToModals({
			document: doc,
			locked,
			modalIds: options.modalIds || ['medicalHistoryModal', 'examinationDetailModal']
		});

		if (typeof options.applyServiceModalLockState === 'function') {
			options.applyServiceModalLockState({ document: doc, locked });
		}

		if (locked) {
			disableCopyViewHeaderButtons({
				document: doc,
				selector: options.headerButtonSelector,
				allowedIds: options.allowedIds
			});
			if (options.includePrescription && options.lockPrescriptionControls !== false) {
				lockPrescriptionControls({ document: doc });
			}
		} else {
			enableAllButtons({
				document: doc,
				selector: options.enableButtonSelector
			});
		}

		setEditHistoryButtonVisible({
			document: doc,
			buttonId: options.editHistoryButtonId,
			visible: locked
		});

		runLockStateCallbacks(options.afterApplyLockState, locked);
	}

	function createCopyViewLockStateAdapter(config = {}) {
		return {
			apply(locked, options = {}) {
				return applyCopyViewLockState({
					...config,
					...options,
					locked,
					afterApplyLockState: Object.prototype.hasOwnProperty.call(options, 'afterApplyLockState')
						? options.afterApplyLockState
						: config.afterApplyLockState
				});
			}
		};
	}

	function createCopyViewLockController(config = {}) {
		const adapter = config.adapter || createCopyViewLockStateAdapter(config.adapterOptions || config);

		function apply(locked, options = {}) {
			const nextLocked = Boolean(locked);
			if (typeof config.setLocked === 'function') {
				config.setLocked(nextLocked);
			}
			return adapter.apply(nextLocked, options);
		}

		return {
			apply,
			lock(options = {}) {
				return apply(true, options);
			},
			unlock(options = {}) {
				return apply(false, options);
			}
		};
	}

	function createWorkflowCopyViewLockController(config = {}) {
		const adapter = createCopyViewLockStateAdapter({
			document: config.document,
			includePrescription: Boolean(config.includePrescription),
			applyServiceModalLockState: config.applyServiceModalLockState,
			afterApplyLockState: config.afterApplyLockState
		});
		return createCopyViewLockController({
			adapter,
			setLocked: config.setLocked
		});
	}

	function lockPrescriptionControls(options = {}) {
		const doc = getDocument(options);
		const allowedButtonIds = options.allowedButtonIds || [options.serviceButtonId || 'prescriptionServiceBtn', 'prescriptionHistoryBtn'];
		const sectionButtonSelector = options.sectionButtonSelector || '#prescriptionSection .prescription-header button, #prescriptionSection .prescription-control-bar button, .prescription-section button';
		const tableButtonSelector = options.tableButtonSelector || '#prescriptionTableBody button';
		const tableFieldSelector = options.tableFieldSelector || '#prescriptionTableBody input, #prescriptionTableBody select, #prescriptionTableBody textarea';

		doc.querySelectorAll(sectionButtonSelector).forEach(button => {
			if (!allowedButtonIds.includes(button.id)) {
				button.disabled = true;
			}
		});

		doc.querySelectorAll(tableButtonSelector).forEach(button => {
			button.disabled = true;
		});

		doc.querySelectorAll(tableFieldSelector).forEach(element => {
			setFieldLocked(element, true);
		});
	}

	function setPrescriptionControlBarState(options = {}) {
		const doc = getDocument(options);
		const locked = Boolean(options.locked);
		const controlBar = doc.querySelector(options.selector || '.prescription-control-bar');
		if (!controlBar) return;

		controlBar.querySelectorAll('input, select').forEach(element => {
			if (!element) return;
			if (element.tagName?.toLowerCase() === 'select') {
				element.disabled = locked;
				element.style.pointerEvents = locked ? 'none' : '';
			} else if (element.type === 'checkbox' || element.type === 'radio') {
				element.disabled = locked;
				element.style.pointerEvents = locked ? 'none' : '';
				element.style.opacity = locked ? '0.6' : '';
			} else {
				if (locked) {
					element.setAttribute('readonly', 'readonly');
					element.style.pointerEvents = 'none';
				} else {
					element.removeAttribute('readonly');
					element.style.pointerEvents = '';
				}
				element.disabled = locked;
			}
		});
	}

	window.ClinicalExaminationFormLockUtils = {
		setFieldLocked,
		applyLockToSelectors,
		getWorkflowFormSelectors,
		applyWorkflowFormLock,
		applyLockToModal,
		applyLockToModals,
		disableHeaderButtonsExcept,
		getCopyViewAllowedButtonIds,
		disableCopyViewHeaderButtons,
		enableAllButtons,
		setEditHistoryButtonVisible,
		applyCopyViewLockState,
		createCopyViewLockStateAdapter,
		createCopyViewLockController,
		createWorkflowCopyViewLockController,
		lockPrescriptionControls,
		setPrescriptionControlBarState
	};
})(window);
