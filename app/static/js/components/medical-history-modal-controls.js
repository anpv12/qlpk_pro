(function (window) {
	'use strict';

	const DEFAULT_PAGE_LOAD_ID_KEY = 'qlpk_page_load_id';
	const DEFAULT_MEDICAL_DRAFT_KEY = 'qlpk_medical_draft';
	const DEFAULT_DRAFT_FIELDS = [
		'mainReason',
		'problemStartTime',
		'symptomProgression',
		'physicalHistory',
		'substanceHistory',
		'familyHistory',
		'familyRelationship',
		'livingEnvironment',
		'mainSymptoms',
		'currentBehavior',
		'severityLevel'
	];
	const DOCTOR_DRAFT_FIELDS = [
		'mainReason', 'problemStartTime', 'symptomProgression', 'allergies', 'physHistory',
		'substanceHistory', 'familyHistory', 'familyRelationship', 'livingEnvironment',
		'mainSymptoms', 'currentBehavior', 'severityLevel'
	];
	const DEFAULT_SAVE_FIELDS = [
		{ id: 'mainReason', key: 'mainReason' },
		{ id: 'problemStartTime', key: 'problemStartTime' },
		{ id: 'symptomProgression', key: 'symptomProgression' },
		{ id: 'mainSymptoms', key: 'mainSymptoms' },
		{ id: 'currentBehavior', key: 'currentBehavior' },
		{ id: 'severityLevel', key: 'severityLevel' }
	];
	const DOCTOR_AUTOSAVE_FIELDS = [
		{ selector: '#mainReason', fieldId: 'mainReason', fieldName: 'main_reason' },
		{ selector: '#mainSymptoms', fieldId: 'mainSymptoms', fieldName: 'main_symptoms' },
		{ selector: '#problemStartTime', fieldId: 'problemStartTime', fieldName: 'problem_start_time' },
		{ selector: '#symptomProgression', fieldId: 'symptomProgression', fieldName: 'symptom_progression' },
		{ selector: '#allergies', fieldId: 'allergies', fieldName: 'allergies' },
		{ selector: '#familyHistory', fieldId: 'familyHistory', fieldName: 'family_history' },
		{ selector: '#currentBehavior', fieldId: 'currentBehavior', fieldName: 'current_behavior' },
		{ selector: '#severityLevel', fieldId: 'severityLevel', fieldName: 'severity_level', events: 'change.medicalHistoryAutoSave blur.medicalHistoryAutoSave' }
	];
	const PSYCHOLOGIST_AUTOSAVE_FIELDS = [
		{ selector: '#mainReason', fieldId: 'mainReason', fieldName: 'main_reason' },
		{ selector: '#mainSymptoms', fieldId: 'mainSymptoms', fieldName: 'main_symptoms' },
		{ selector: '#problemStartTime', fieldId: 'problemStartTime', fieldName: 'problem_start_time' },
		{ selector: '#symptomProgression', fieldId: 'symptomProgression', fieldName: 'symptom_progression' },
		{
			selector: '#physicalHistory',
			fieldId: 'physicalHistory',
			fieldName: 'physical_history',
			events: 'blur.medicalHistoryAutoSave change.medicalHistoryAutoSave',
			getValue: (_, options = {}) => {
				const win = options.window || window;
				if (win.physicalHistoryAutocomplete && typeof win.physicalHistoryAutocomplete.getValue === 'function') {
					return win.physicalHistoryAutocomplete.getValue() || '';
				}
				const jquery = options.$ || win.jQuery || win.$;
				return typeof jquery === 'function' ? jquery('#physicalHistory').val() || '' : getInputValue('physicalHistory', options);
			},
			extraBindings: [{
				events: 'focus.medicalHistoryAutoSave',
				handler: (_, options = {}) => {
					const win = options.window || window;
					if (win.physicalHistoryAutocomplete && typeof win.physicalHistoryAutocomplete.clearSuggestions === 'function') {
						win.physicalHistoryAutocomplete.clearSuggestions();
					}
				}
			}]
		},
		{ selector: '#currentBehavior', fieldId: 'currentBehavior', fieldName: 'current_behavior' },
		{ selector: '#severityLevel', fieldId: 'severityLevel', fieldName: 'severity_level', events: 'change.medicalHistoryAutoSave blur.medicalHistoryAutoSave' }
	];

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function getSessionStorage(options = {}) {
		return options.sessionStorage || window.sessionStorage;
	}

	function resolveElement(elementOrId, options = {}) {
		if (!elementOrId) return null;
		return typeof elementOrId === 'string' ? getDocument(options).getElementById(elementOrId) : elementOrId;
	}

	function getInputValue(id, options = {}) {
		const element = getDocument(options).getElementById(id);
		return element ? element.value || '' : '';
	}

	function getPageLoadId(options = {}) {
		const storage = getSessionStorage(options);
		const key = options.pageLoadIdKey || DEFAULT_PAGE_LOAD_ID_KEY;
		return storage.getItem(key) || String(Date.now());
	}

	function getPhysicalHistoryValue(options = {}) {
		if (typeof options.getPhysicalHistoryValue === 'function') {
			return options.getPhysicalHistoryValue({ document: getDocument(options) }) || '';
		}
		return getInputValue(options.physicalHistoryFieldId || 'physicalHistory', options);
	}

	function buildMedicalHistorySyncFields(options = {}) {
		const fields = [
			{ hiddenId: 'hiddenProblemStartTime', modalId: 'problemStartTime' },
			{ hiddenId: 'hiddenSymptomProgression', modalId: 'symptomProgression' }
		];

		if (options.includeAllergies) {
			fields.push({ hiddenId: 'hiddenAllergies', modalId: options.allergiesModalId || 'allergies' });
		}

		fields.push(
			{
				hiddenId: 'hiddenPhysicalHistory',
				always: true,
				getValue: typeof options.getPhysicalHistoryValue === 'function'
					? options.getPhysicalHistoryValue
					: ({ document: doc }) => doc.getElementById(options.physicalHistoryFieldId || 'physicalHistory')?.value || ''
			},
			{ hiddenId: 'hiddenSubstanceHistory', modalId: 'substanceHistory' },
			{ hiddenId: 'hiddenFamilyHistory', modalId: options.familyHistoryModalId || 'familyHistory' },
			{ hiddenId: 'hiddenFamilyRelationship', modalId: 'familyRelationship' },
			{ hiddenId: 'hiddenLivingEnvironment', modalId: 'livingEnvironment' },
			{ hiddenId: 'hiddenSocialSupport', modalId: 'socialSupport' },
			{ hiddenId: 'hiddenCurrentBehavior', modalId: 'currentBehavior' },
			{ hiddenId: 'hiddenSeverityLevel', modalId: 'severityLevel' }
		);

		return fields;
	}

	function syncMedicalHistoryHiddenFields(fields = [], options = {}) {
		const formDomUtils = options.formDomUtils || window.ClinicalFormDomUtils;
		try {
			formDomUtils.syncModalFieldsToHidden(fields, {
				document: getDocument(options),
				safeSetValue: options.safeSetValue
			});
			return true;
		} catch (error) {
			console.error(options.errorMessage || 'Error syncing medical history to hidden fields:', error);
			return false;
		}
	}

	function buildMedicalHistoryDraftData(options = {}) {
		const data = {
			mainReason: getInputValue('mainReason', options),
			problemStartTime: getInputValue('problemStartTime', options),
			symptomProgression: getInputValue('symptomProgression', options),
			physicalHistory: getPhysicalHistoryValue(options),
			substanceHistory: getInputValue('substanceHistory', options),
			familyHistory: getInputValue('familyHistory', options),
			familyRelationship: getInputValue('familyRelationship', options),
			livingEnvironment: getInputValue('livingEnvironment', options),
			mainSymptoms: getInputValue('mainSymptoms', options),
			currentBehavior: getInputValue('currentBehavior', options),
			severityLevel: getInputValue('severityLevel', options),
			loadId: getPageLoadId(options)
		};

		if (options.includeAllergies) {
			data.allergies = getInputValue('allergies', options);
		}

		return data;
	}

	function writeMedicalHistoryDraft(options = {}) {
		const storage = getSessionStorage(options);
		const key = options.draftKey || DEFAULT_MEDICAL_DRAFT_KEY;
		storage.setItem(key, JSON.stringify(buildMedicalHistoryDraftData(options)));
	}

	function buildMedicalHistorySaveData(options = {}) {
		const fields = options.saveFields || DEFAULT_SAVE_FIELDS;
		return fields.reduce((data, field) => {
			const id = typeof field === 'string' ? field : field.id;
			const key = typeof field === 'string' ? field : field.key || field.id;
			const getter = field && typeof field.getValue === 'function' ? field.getValue : null;
			data[key] = getter ? getter(options) || '' : getInputValue(id, options);
			return data;
		}, {});
	}

	function writeMedicalHistorySaveDraft(options = {}) {
		const data = buildMedicalHistorySaveData(options);
		const storage = getSessionStorage(options);
		const key = options.draftKey || DEFAULT_MEDICAL_DRAFT_KEY;
		storage.setItem(key, JSON.stringify({ ...data, loadId: getPageLoadId(options) }));
		return data;
	}

	function writeLegacyMedicalHistoryBackup(data, options = {}) {
		const storage = options.localStorage || window.localStorage;
		try {
			storage.setItem('medicalHistoryData', JSON.stringify(data));
		} catch (error) { }
	}

	function normalizeUploadedDocuments(documents = []) {
		return documents.map(doc => ({
			id: doc.id,
			name: doc.name,
			size: doc.size,
			type: doc.type,
			uploadDate: doc.uploadDate
		}));
	}

	function writeUploadedDocumentsDraft(options = {}) {
		const storage = options.localStorage || window.localStorage;
		const documents = typeof options.getUploadedDocuments === 'function'
			? options.getUploadedDocuments() || []
			: options.uploadedDocuments || [];
		storage.setItem('uploadedDocuments', JSON.stringify(normalizeUploadedDocuments(documents)));
	}

	function hideMedicalHistoryModal(options = {}) {
		const modalElement = resolveElement(options.modal || 'medicalHistoryModal', options);
		if (!modalElement || !window.bootstrap || !window.bootstrap.Modal) return null;
		const modal = window.bootstrap.Modal.getInstance(modalElement);
		if (modal) modal.hide();
		return modal;
	}

	function saveMedicalHistoryFromModalShell(options = {}) {
		if (typeof options.syncHiddenFields === 'function') options.syncHiddenFields();
		const data = writeMedicalHistorySaveDraft(options);
		writeLegacyMedicalHistoryBackup(data, options);
		writeUploadedDocumentsDraft(options);
		hideMedicalHistoryModal(options);
		if (typeof options.showToast === 'function') {
			options.showToast('success', options.successMessage || 'Đã lưu thông tin hỏi bệnh');
		}
		return data;
	}

	function bindDraftInputFields(options = {}) {
		const doc = getDocument(options);
		const fields = options.fields || DEFAULT_DRAFT_FIELDS;
		fields.forEach(id => {
			const element = doc.getElementById(id);
			if (!element || element._draftBound) return;
			element.addEventListener('input', () => {
				try {
					writeMedicalHistoryDraft(options);
				} catch (error) {
					if (options.logDraftError) console.warn('Không thể lưu nháp hỏi bệnh:', error);
				}
			});
			element._draftBound = true;
		});
	}

	function applyModalLockIfNeeded(options = {}) {
		const isLocked = typeof options.isFormLocked === 'function'
			? options.isFormLocked()
			: Boolean(options.isFormLocked);
		if (!isLocked) return false;

		window.setTimeout(() => {
			const modal = resolveElement(options.modal || 'medicalHistoryModal', options);
			const lockUtils = window.ClinicalExaminationFormLockUtils;
			if (lockUtils && typeof lockUtils.applyLockToModal === 'function') {
				lockUtils.applyLockToModal(modal, true);
			}
		}, options.lockDelayMs || 100);

		return true;
	}

	function showMedicalHistoryModal(options = {}) {
		const modalElement = resolveElement(options.modal || 'medicalHistoryModal', options);
		if (!modalElement || !window.bootstrap || !window.bootstrap.Modal) return null;
		const modal = new window.bootstrap.Modal(modalElement);
		modal.show();
		return modal;
	}

	function openMedicalHistoryModal(options = {}) {
		if (typeof options.loadIntoModal === 'function') options.loadIntoModal();
		applyModalLockIfNeeded(options);
		bindDraftInputFields(options);
		const modal = showMedicalHistoryModal(options);
		if (typeof options.setupAutoSave === 'function') options.setupAutoSave();
		return modal;
	}

	function bindOpenButton(options = {}) {
		const button = resolveElement(options.button || 'medicalHistoryBtn', options);
		if (!button || button._medicalHistoryModalBound) return button;
		button.addEventListener('click', () => openMedicalHistoryModal(options));
		button._medicalHistoryModalBound = true;
		return button;
	}

	function bindMedicalHistoryModalHiddenSync(options = {}) {
		const modalElement = resolveElement(options.modal || 'medicalHistoryModal', options);
		if (!modalElement || modalElement._medicalHistorySyncBound) return modalElement;
		modalElement._medicalHistorySyncBound = true;
		modalElement.addEventListener('hidden.bs.modal', () => {
			if (typeof options.syncHiddenFields === 'function') options.syncHiddenFields();
		});
		return modalElement;
	}

	function bindAutosaveField(config, options = {}) {
		const jquery = options.$ || window.jQuery || window.$;
		if (!jquery || !config || !config.selector || typeof options.autoSaveField !== 'function') return null;
		const field = jquery(config.selector);
		const events = config.events || 'blur.medicalHistoryAutoSave';
		field.off(events).on(events, function () {
			const value = typeof config.getValue === 'function'
				? config.getValue(this, options) || ''
				: jquery(this).val() || '';
			options.autoSaveField(config.fieldId, config.fieldName, value);
		});

		(config.extraBindings || []).forEach(binding => {
			if (!binding || !binding.events || typeof binding.handler !== 'function') return;
			field.off(binding.events).on(binding.events, function () {
				binding.handler(this, options);
			});
		});

		return field;
	}

	function bindMedicalHistoryAutosaveFields(options = {}) {
		(options.fields || []).forEach(field => bindAutosaveField(field, options));
		bindMedicalHistoryModalHiddenSync(options);
	}

	function createMedicalHistoryModalAdapter(options = {}) {
		const syncHiddenFields = () => syncMedicalHistoryHiddenFields(options.syncFields || [], {
			document: getDocument(options),
			safeSetValue: options.safeSetValue,
			formDomUtils: options.formDomUtils,
			errorMessage: options.syncErrorMessage
		});

		const saveFromModal = () => saveMedicalHistoryFromModalShell({
			document: getDocument(options),
			sessionStorage: options.sessionStorage,
			localStorage: options.localStorage,
			modal: options.modal || 'medicalHistoryModal',
			pageLoadIdKey: options.pageLoadIdKey,
			draftKey: options.draftKey,
			syncHiddenFields,
			getUploadedDocuments: options.getUploadedDocuments,
			showToast: options.showToast,
			successMessage: options.successMessage
		});

		const bindAutosaveFields = () => bindMedicalHistoryAutosaveFields({
			$: options.$,
			document: getDocument(options),
			window: options.window || window,
			modal: options.modal || 'medicalHistoryModal',
			autoSaveField: options.autoSaveField,
			syncHiddenFields,
			fields: options.autosaveFields || []
		});

		const bindOpen = (extraOptions = {}) => bindOpenButton({
			document: getDocument(options),
			sessionStorage: options.sessionStorage,
			button: options.openButton || 'medicalHistoryBtn',
			modal: options.modal || 'medicalHistoryModal',
			pageLoadIdKey: options.pageLoadIdKey,
			draftKey: options.draftKey,
			includeAllergies: options.includeAllergies,
			fields: options.openFields || DEFAULT_DRAFT_FIELDS,
			getPhysicalHistoryValue: options.getPhysicalHistoryValue,
			isFormLocked: extraOptions.isFormLocked || options.isFormLocked,
			loadIntoModal: extraOptions.loadIntoModal || options.loadIntoModal,
			setupAutoSave: extraOptions.setupAutoSave || bindAutosaveFields
		});

		return {
			syncHiddenFields,
			saveFromModal,
			bindAutosaveFields,
			bindOpenButton: bindOpen
		};
	}

	function createDoctorMedicalHistoryModalAdapter(options = {}) {
		return createMedicalHistoryModalAdapter({
			...options,
			includeAllergies: true,
			openFields: options.openFields || DOCTOR_DRAFT_FIELDS,
			getPhysicalHistoryValue: options.getPhysicalHistoryValue || (() => {
				const doc = getDocument(options);
				const physicalHistoryEl = doc.getElementById('patientPhysicalHistory');
				return physicalHistoryEl ? physicalHistoryEl.value : '';
			}),
			syncFields: options.syncFields || buildMedicalHistorySyncFields({
				includeAllergies: true,
				familyHistoryModalId: 'patientFamilyHistory',
				getPhysicalHistoryValue: options.getPhysicalHistoryValue || (({ document: doc }) => doc.getElementById('patientPhysicalHistory')?.value || '')
			}),
			autosaveFields: options.autosaveFields || DOCTOR_AUTOSAVE_FIELDS
		});
	}

	function createPsychologistMedicalHistoryModalAdapter(options = {}) {
		return createMedicalHistoryModalAdapter({
			...options,
			syncFields: options.syncFields || buildMedicalHistorySyncFields({
				getPhysicalHistoryValue: options.getPhysicalHistoryValue || (({ document: doc }) => {
					const win = options.window || window;
					return win.physicalHistoryAutocomplete
						? win.physicalHistoryAutocomplete.getValue() || ''
						: doc.getElementById('physicalHistory')?.value || '';
				})
			}),
			autosaveFields: options.autosaveFields || PSYCHOLOGIST_AUTOSAVE_FIELDS
		});
	}

	window.MedicalHistoryModalControls = {
		DOCTOR_AUTOSAVE_FIELDS,
		PSYCHOLOGIST_AUTOSAVE_FIELDS,
		getInputValue,
		getPageLoadId,
		getPhysicalHistoryValue,
		buildMedicalHistoryDraftData,
		buildMedicalHistorySyncFields,
		syncMedicalHistoryHiddenFields,
		writeMedicalHistoryDraft,
		buildMedicalHistorySaveData,
		writeMedicalHistorySaveDraft,
		writeUploadedDocumentsDraft,
		hideMedicalHistoryModal,
		saveMedicalHistoryFromModalShell,
		bindMedicalHistoryAutosaveFields,
		bindMedicalHistoryModalHiddenSync,
		bindDraftInputFields,
		applyModalLockIfNeeded,
		showMedicalHistoryModal,
		openMedicalHistoryModal,
		bindOpenButton,
		createMedicalHistoryModalAdapter,
		createDoctorMedicalHistoryModalAdapter,
		createPsychologistMedicalHistoryModalAdapter
	};
})(window);
