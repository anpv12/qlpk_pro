(function (window) {
	'use strict';

	function getDocument(context = {}) {
		return context.document || window.document;
	}

	function getElementValue(elementId, defaultValue = '', context = {}) {
		const element = getDocument(context).getElementById(elementId);
		if (!element || element.value === null || element.value === undefined) return defaultValue;
		return String(element.value).trim() || defaultValue;
	}

	function safeSetValue(elementId, value, context = {}) {
		const element = getDocument(context).getElementById(elementId);
		if (!element) return false;

		if (value === null || value === undefined) {
			element.value = '';
		} else {
			element.value = value;
		}
		return true;
	}

	function safeSetInnerHTML(elementId, html, context = {}) {
		const element = getDocument(context).getElementById(elementId);
		if (!element) return false;
		element.innerHTML = html;
		return true;
	}

	function updateElements(elements, context = {}) {
		const results = {};
		for (const [elementId, value] of Object.entries(elements || {})) {
			results[elementId] = safeSetValue(elementId, value, context);
		}
		return results;
	}

	function getHiddenOrModalValue(hiddenFieldId, modalFieldId, context = {}) {
		const doc = getDocument(context);
		const hiddenEl = doc.getElementById(hiddenFieldId);
		const modalEl = doc.getElementById(modalFieldId);

		if (hiddenEl && hiddenEl.value) {
			return hiddenEl.value;
		}
		if (modalEl && modalEl.value) {
			return modalEl.value;
		}
		return '';
	}

	function syncModalFieldsToHidden(fields = [], context = {}) {
		const doc = getDocument(context);
		const setValue = typeof context.safeSetValue === 'function'
			? context.safeSetValue
			: (elementId, value) => safeSetValue(elementId, value, context);

		fields.forEach(field => {
			if (!field || !field.hiddenId) return;
			if (typeof field.getValue === 'function') {
				setValue(field.hiddenId, field.getValue({ document: doc }) || '');
				return;
			}

			const modalEl = doc.getElementById(field.modalId);
			if (modalEl || field.always === true) {
				setValue(field.hiddenId, modalEl?.value || '');
			}
		});
	}

	function collectClinicalAdministrativeFormData(options = {}) {
		const doc = getDocument(options);
		const getValue = typeof options.getElementValue === 'function'
			? options.getElementValue
			: (elementId, defaultValue = '') => getElementValue(elementId, defaultValue, options);
		const getHistoryValue = typeof options.getMedicalHistoryValue === 'function'
			? options.getMedicalHistoryValue
			: (hiddenFieldId, modalFieldId) => getHiddenOrModalValue(hiddenFieldId, modalFieldId, options);
		const resolve = (callback, fallback = '') => typeof callback === 'function'
			? callback({ document: doc, getElementValue: getValue, getMedicalHistoryValue: getHistoryValue })
			: fallback;
		const parseNumericValue = (elementId) => {
			const raw = getValue(elementId);
			return raw ? parseFloat(raw) : 0;
		};

		const data = {
			full_name: getValue('fullName'),
			nickname: getValue('nickname'),
			date_of_birth: getValue('dateOfBirth'),
			gender: getValue('gender'),
			id_number: getValue('idCard'),
			phone: getValue('phoneNumber'),
			occupation: getValue('occupation'),
			marital_status: getValue('maritalStatus'),
			sexual_orientation: resolve(options.getSexualOrientation, getValue('sexualOrientation')),

			address_detail: getValue('addressDetail'),
			province: getValue('province'),
			district: getValue('district'),
			ward: getValue('ward'),
			address: getValue('address'),

			nationality: getValue('nationality'),
			religion: getValue('religion'),
			ethnicity: getValue('ethnicity'),
			education_level: getValue('educationLevel'),

			main_reason: getValue('mainReason'),
			referral_source: getValue('referralSource'),
			problem_start_time: getHistoryValue('hiddenProblemStartTime', 'problemStartTime'),
			symptom_progression: getHistoryValue('hiddenSymptomProgression', 'symptomProgression'),
			family_history: resolve(options.getFamilyHistory, getHistoryValue('hiddenFamilyHistory', 'familyHistory')),
			main_symptoms: getValue('mainSymptoms'),
			current_behavior: getHistoryValue('hiddenCurrentBehavior', 'currentBehavior'),

			reminder: doc.getElementById('reminderCheck')?.checked || false,
			reminder_time: doc.getElementById('reminderTime')?.value || '',

			breathing: getValue('breathing'),
			notes: getValue('notes'),
			physical_history: resolve(options.getPhysicalHistory, getHistoryValue('hiddenPhysicalHistory', 'physicalHistory')),
			severity_level: getHistoryValue('hiddenSeverityLevel', 'severityLevel'),

			weight: parseNumericValue('weight'),
			height: parseNumericValue('height'),
			bmi: parseNumericValue('bmi'),
			pulse: parseNumericValue('pulse'),
			blood_pressure: getValue('bloodPressure'),
			temperature: parseNumericValue('temperature'),

			appointment_type: getValue('appointmentType', 'SERVICE'),
			is_re_exam: doc.getElementById('reExaminationCheck')?.checked || false,
			original_appointment_id: doc.getElementById('originalAppointmentId')?.value || null
		};

		if (typeof options.extendData === 'function') {
			Object.assign(data, options.extendData({ document: doc, getElementValue: getValue, getMedicalHistoryValue: getHistoryValue }) || {});
		}
		return data;
	}

	function buildPatientSavePayload(formData = {}, options = {}) {
		return {
			full_name: formData.full_name,
			nickname: formData.nickname,
			date_of_birth: formData.date_of_birth,
			gender: formData.gender,
			id_number: formData.id_number,
			phone: formData.phone,
			occupation: formData.occupation,
			marital_status: formData.marital_status,
			sexual_orientation: formData.sexual_orientation,
			address_detail: formData.address_detail,
			...(formData.province && { province: formData.province }),
			...(formData.district && { district: formData.district }),
			...(formData.ward && { ward: formData.ward }),
			address: formData.address,
			nationality: formData.nationality,
			religion: formData.religion,
			ethnicity: formData.ethnicity,
			education_level: formData.education_level,
			referral_source: formData.referral_source,
			problem_start_time: formData.problem_start_time,
			symptom_progression: formData.symptom_progression,
			psychiatric_history: formData.psychiatric_history,
			family_history: formData.family_history,
			current_behavior: formData.current_behavior,
			medical_history: formData.medical_history,
			reminder: formData.reminder,
			reminder_time: formData.reminder_time,
			...(options.includeAllergies ? { allergies: formData.allergies } : {}),
			physical_history: formData.physical_history,
			severity_level: formData.severity_level,
			weight: formData.weight,
			height: formData.height,
			bmi: formData.bmi,
			pulse: formData.pulse,
			blood_pressure: formData.blood_pressure,
			temperature: formData.temperature,
			breathing: formData.breathing
		};
	}

	function buildAppointmentClinicalUpdatePayload(formData = {}, options = {}) {
		return {
			notes: formData.notes,
			weight: formData.weight,
			height: formData.height,
			bmi: formData.bmi,
			pulse: formData.pulse,
			blood_pressure: formData.blood_pressure,
			temperature: formData.temperature,
			main_reason: formData.main_reason,
			main_symptoms: formData.main_symptoms,
			...(options.includeRiskAssessment ? { risk_assessment: formData.risk_assessment } : {})
		};
	}

	function getRawFormValue(selector, context = {}) {
		const $ = context.$ || window.jQuery || window.$;
		if (typeof $ === 'function') {
			const value = $(selector).val();
			return value || '';
		}
		const doc = getDocument(context);
		const element = doc.querySelector(selector);
		return element && element.value ? element.value : '';
	}

	function collectSelectedIcdIds(fieldName, context = {}) {
		const selectedICDs = context.selectedICDs || window.selectedICDs || {};
		return (selectedICDs[fieldName] || [])
			.filter(icd => icd && icd.id != null)
			.map(icd => icd.id);
	}

	function collectPsychologistExaminationFormData(context = {}) {
		return {
			main_reason: getRawFormValue('#examinationMainReason', context),
			trieu_chung_va_hanh_vi_hien_tai: getRawFormValue('#diagnosis', context),
			nhan_dinh_chung: getRawFormValue('#benhKemTheo', context),
			ke_hoach_can_thiep: getRawFormValue('#treatmentPlan', context)
		};
	}

	function buildPsychologistExaminationUpdatePayload(formData = {}) {
		return {
			trieu_chung_va_hanh_vi_hien_tai: formData.trieu_chung_va_hanh_vi_hien_tai,
			nhan_dinh_chung: formData.nhan_dinh_chung,
			ke_hoach_can_thiep: formData.ke_hoach_can_thiep
		};
	}

	function bindNumericInputGuard(elementOrId, options = {}) {
		const doc = getDocument(options);
		const element = typeof elementOrId === 'string' ? doc.getElementById(elementOrId) : elementOrId;
		if (!element) return null;

		const boundFlag = options.boundFlag || '_bound';
		if (element[boundFlag]) return element;

		const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : null;
		element.addEventListener('input', function () {
			let value = this.value.replace(/[^0-9]/g, '');
			if (maxLength !== null) value = value.slice(0, maxLength);
			this.value = value;
		});
		element[boundFlag] = true;
		return element;
	}

	function bindAgeInputGuard(elementOrId = 'age', options = {}) {
		return bindNumericInputGuard(elementOrId, {
			...options,
			maxLength: Object.prototype.hasOwnProperty.call(options, 'maxLength') ? options.maxLength : 3
		});
	}

	const DEFAULT_PATIENT_AUTOSAVE_FIELDS = [
		{ selector: '#fullName', fieldName: 'full_name' },
		{ selector: '#nickname', fieldName: 'nickname' },
		{ selector: '#dateOfBirth', fieldName: 'date_of_birth', events: 'change.patientAutoSave' },
		{ selector: '#gender', fieldName: 'gender', events: 'change.patientAutoSave' },
		{ selector: '#idCard', fieldName: 'id_number' },
		{ selector: '#phoneNumber', fieldName: 'phone' },
		{ selector: '#occupation', fieldName: 'occupation', events: 'blur.patientAutoSave change.patientAutoSave', valueResolver: 'occupation' },
		{ selector: '#maritalStatus', fieldName: 'marital_status', events: 'change.patientAutoSave' },
		{ selector: '#referralSource', fieldName: 'referral_source', events: 'change.patientAutoSave', valueResolver: 'referralSource' },
		{ selector: '#breathing', fieldName: 'breathing' },
		{ selector: '#pulse', fieldName: 'pulse' },
		{ selector: '#bloodPressure', fieldName: 'blood_pressure' },
		{ selector: '#temperature', fieldName: 'temperature' },
		{ selector: '#weight', fieldName: 'weight' },
		{ selector: '#height', fieldName: 'height' },
		{ selector: '#bmi', fieldName: 'bmi', events: 'blur.patientAutoSave input.patientAutoSave', skipEmpty: true },
		{ selector: '#notes', fieldName: 'notes' }
	];

	function resolvePatientAutoSaveValue(element, field, context = {}) {
		const jquery = context.$ || window.jQuery || window.$;
		if (typeof field.getValue === 'function') {
			return field.getValue(element, context);
		}
		if (field.valueResolver === 'occupation') {
			const autocomplete = context.occupationAutocomplete || window.occupationAutocomplete;
			if (autocomplete && typeof autocomplete.getValue === 'function') {
				return autocomplete.getValue();
			}
		}
		if (field.valueResolver === 'referralSource') {
			const getter = context.getElementValue || ((elementId) => getElementValue(elementId, '', context));
			return getter('referralSource');
		}
		return jquery ? jquery(element).val() : element?.value;
	}

	function bindPatientFormAutoSaveFields(options = {}) {
		const jquery = options.$ || window.jQuery || window.$;
		if (!jquery || typeof options.autoSaveField !== 'function') return false;

		const referralSourceControl = getReferralSourceControl(options);
		if (referralSourceControl && typeof referralSourceControl.bind === 'function') {
			referralSourceControl.bind({ document: getDocument(options) });
		}

		const fields = options.fields || DEFAULT_PATIENT_AUTOSAVE_FIELDS;
		fields.forEach(field => {
			if (!field || !field.selector || !field.fieldName) return;
			const events = field.events || 'blur.patientAutoSave';
			jquery(field.selector).off(events).on(events, function () {
				if (field.valueResolver === 'referralSource' && referralSourceControl && typeof referralSourceControl.syncVisibility === 'function') {
					referralSourceControl.syncVisibility({ document: getDocument(options) });
				}
				const value = resolvePatientAutoSaveValue(this, field, options);
				if (field.skipEmpty && !value) return;
				options.autoSaveField(field.fieldName, value);
			});
		});

		return true;
	}

	function initializeOccupationAutocomplete(options = {}) {
		const doc = getDocument(options);
		const win = options.window || window;
		const jquery = options.$ || win.jQuery || win.$;
		const AutocompleteCtor = options.OccupationAutocomplete || win.OccupationAutocomplete;
		const inputId = options.inputId || 'occupation';
		const dropdownId = options.dropdownId || 'occupationDropdown';
		const occupationInput = doc.getElementById(inputId);
		const occupationDropdown = doc.getElementById(dropdownId);

		if (!occupationInput || !occupationDropdown || typeof AutocompleteCtor !== 'function') {
			if (options.console && typeof options.console.error === 'function') {
				options.console.error(options.missingMessage || 'Occupation elements not found!');
			}
			return false;
		}

		win.occupationAutocomplete = null;
		win.occupationAutocomplete = new AutocompleteCtor(inputId, dropdownId);

		if (jquery && typeof options.autoSaveField === 'function') {
			jquery(`#${inputId}`).off('blur.patientAutoSave change.patientAutoSave').on('blur.patientAutoSave change.patientAutoSave', function () {
				const value = (win.occupationAutocomplete && win.occupationAutocomplete.getValue)
					? win.occupationAutocomplete.getValue()
					: jquery(this).val();
				options.autoSaveField('occupation', value);
			});
		}

		return true;
	}

	function bindPatientFormAutoSaveSafely(options = {}) {
		try {
			return bindPatientFormAutoSaveFields(options);
		} catch (error) {
			if (options.console && typeof options.console.warn === 'function') {
				options.console.warn(options.autoSaveBindErrorMessage || 'Không thể bind auto-save form bệnh nhân:', error);
			}
			return false;
		}
	}

	function initializeDocumentSectionShell(documentSectionAdapter) {
		if (!documentSectionAdapter) return false;
		if (typeof documentSectionAdapter.initializeDocumentUpload === 'function') {
			documentSectionAdapter.initializeDocumentUpload();
		}
		if (typeof documentSectionAdapter.bindNotesUploadButton === 'function') {
			documentSectionAdapter.bindNotesUploadButton();
		}
		if (typeof documentSectionAdapter.updateNotesAttachmentCount === 'function') {
			documentSectionAdapter.updateNotesAttachmentCount();
		}
		return true;
	}

	function initializeWorkflowFormShell(options = {}) {
		if (typeof options.loadProvinces === 'function') options.loadProvinces();

		const vitalUtils = options.vitalUtils || window.ClinicalVitalCalculationUtils;
		if (vitalUtils && typeof vitalUtils.setupAgeCalculation === 'function') {
			vitalUtils.setupAgeCalculation({ $: options.$ });
		}
		if (vitalUtils && typeof vitalUtils.setupBMICalculation === 'function') {
			vitalUtils.setupBMICalculation({
				$: options.$,
				document: getDocument(options),
				getLastBMIValue: options.getLastBMIValue,
				autoSaveBMI: options.autoSaveBMI
			});
		}

		const schedule = options.setTimeout || window.setTimeout;
		if (typeof schedule === 'function' && typeof options.setupMainAddressChangeHandlers === 'function') {
			schedule(() => options.setupMainAddressChangeHandlers(), options.addressHandlerDelayMs || 100);
		}

		if (options.occupationOptions) {
			initializeOccupationAutocomplete({
				document: getDocument(options),
				window: options.window || window,
				$: options.$,
				console: options.console,
				autoSaveField: options.autoSaveField,
				...options.occupationOptions
			});
		}

		initializeDocumentSectionShell(options.documentSectionAdapter);
		bindPatientFormAutoSaveSafely({
			$: options.$,
			document: getDocument(options),
			getElementValue: options.getElementValue,
			autoSaveField: options.autoSaveField,
			console: options.console
		});

		return true;
	}

	function clearPageAgeField(doc) {
		const ageField = doc.getElementById('age');
		if (!ageField) return false;
		ageField.value = '';
		ageField.textContent = '';
		ageField.innerHTML = '';
		return true;
	}

	function initializeWorkflowPageShell(options = {}) {
		const doc = getDocument(options);
		const schedule = options.setTimeout || window.setTimeout;

		if (typeof options.resetFormToDefault === 'function') options.resetFormToDefault();
		if (typeof schedule === 'function' && typeof options.loadAddressDraftFromCache === 'function') {
			schedule(() => options.loadAddressDraftFromCache(), options.addressDraftDelayMs || 100);
		}
		if (typeof schedule === 'function') {
			schedule(() => clearPageAgeField(doc), options.clearAgeDelayMs || 100);
		}

		const sidebarUi = options.sidebarUserInfoUi || window.SidebarUserInfoUi;
		if (sidebarUi && typeof sidebarUi.loadSidebarUserInfo === 'function') {
			sidebarUi.loadSidebarUserInfo({ document: doc });
		}

		if (typeof options.loadProvinces === 'function') options.loadProvinces();
		if (typeof options.loadAppointments === 'function') {
			options.loadAppointments(options.currentStatus, options.currentPage);
		}

		if (options.occupationOptions) {
			initializeOccupationAutocomplete({
				document: doc,
				window: options.window || window,
				$: options.$,
				console: options.console,
				autoSaveField: options.autoSaveField,
				...options.occupationOptions
			});
		}

		if (options.documentSectionAdapter && typeof options.documentSectionAdapter.initializeDocumentUpload === 'function') {
			options.documentSectionAdapter.initializeDocumentUpload();
		}
		if (options.addressDraftAdapter && typeof options.addressDraftAdapter.bindAddressDraftListeners === 'function') {
			options.addressDraftAdapter.bindAddressDraftListeners({ onChange: options.saveAddressDraftToCache });
		}

		bindPatientFormAutoSaveSafely({
			$: options.$,
			document: doc,
			getElementValue: options.getElementValue,
			autoSaveField: options.autoSaveField,
			console: options.console
		});

		return true;
	}

	function resetDomField(element) {
		if (!element) return false;
		if (element.type === 'checkbox') {
			element.checked = false;
		} else if (element.tagName === 'SELECT') {
			element.selectedIndex = 0;
		} else {
			element.value = '';
		}
		return true;
	}

	function resetDomFields(fieldIds = [], context = {}) {
		const doc = getDocument(context);
		fieldIds.forEach(fieldId => resetDomField(doc.getElementById(fieldId)));
	}

	function setDomValue(elementId, value, context = {}) {
		const element = getDocument(context).getElementById(elementId);
		if (!element) return false;
		element.value = value || '';
		return true;
	}

	function clearAgeField(elementId = 'age', context = {}) {
		const element = getDocument(context).getElementById(elementId);
		if (!element) return false;
		element.value = '';
		element.textContent = '';
		element.innerHTML = '';
		return true;
	}

	function isPlaceholderValue(element) {
		if (!element || !element.value) return false;
		const placeholder = element.placeholder || '';
		return element.value === placeholder
			|| element.value.includes('Nhập')
			|| element.value.includes('Chọn')
			|| element.value.includes('dd/mm/yyyy')
			|| element.value.includes('Số tuổi');
	}

	function clearPlaceholderValues(fieldIds = [], context = {}) {
		const doc = getDocument(context);
		fieldIds.forEach(fieldId => {
			const element = doc.getElementById(fieldId);
			if (isPlaceholderValue(element)) element.value = '';
		});
	}

	function resetAutocompleteValues(names = []) {
		names.forEach(name => {
			const autocomplete = window[name];
			if (autocomplete && typeof autocomplete.setValue === 'function') {
				autocomplete.setValue('');
			}
		});
	}

	function resetWorkflowFormDomState(options = {}) {
		const doc = getDocument(options);
		resetDomFields(options.fieldsToReset || [], { document: doc });

		const referralSourceControl = getReferralSourceControl(options);
		if (referralSourceControl && typeof referralSourceControl.setValue === 'function') {
			referralSourceControl.setValue('', { document: doc });
		}

		resetDomFields(options.vitalFields || ['pulse', 'bloodPressure', 'temperature', 'weight', 'height', 'bmi', 'breathing'], { document: doc });
		setDomValue(options.respiratoryRateField || 'respiratoryRate', '', { document: doc });
		setDomValue(options.notesField || 'notes', '', { document: doc });
		clearAgeField(options.ageField || 'age', { document: doc });
		setDomValue(options.appointmentTypeField || 'appointmentType', options.defaultAppointmentType || 'SERVICE', { document: doc });
		setDomValue(options.serviceTypeField || 'serviceType', '', { document: doc });
		setDomValue(options.packageField || 'packageId', '', { document: doc });
		resetDomField(doc.getElementById(options.reExaminationField || 'reExaminationCheck'));
		setDomValue(options.addressSummaryField || 'addressSummary', '', { document: doc });
		clearPlaceholderValues(options.placeholderFields || [], { document: doc });

		const storage = options.localStorage || window.localStorage;
		(options.storageKeys || ['currentEditId', 'medicalHistoryData', 'uploadedDocuments']).forEach(key => {
			if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
		});

		resetAutocompleteValues(options.autocompleteNames || []);
		return true;
	}

	const DOCTOR_WORKFLOW_RESET_FIELDS = [
		'fullName', 'nickname', 'dateOfBirth', 'gender', 'idCard', 'phoneNumber',
		'occupation', 'donViCongTac', 'diaChiCongTy', 'maritalStatus', 'address', 'addressDetail',
		'province', 'provinceHidden', 'district', 'ward', 'nationality', 'religion', 'ethnicity',
		'educationLevel', 'sexualOrientation', 'mainReason', 'referralSource', 'problemStartTime',
		'symptomProgression', 'psychiatricHistory', 'substanceHistory', 'familyHistory',
		'familyRelationship', 'livingEnvironment', 'socialSupport', 'mainSymptoms',
		'currentBehavior', 'notes', 'age', 'allergies', 'physHistory', 'severityLevel',
		'examinationMainReason', 'examDetailMedicalHistory', 'diagnosis', 'treatmentPlan',
		'examinationNotes', 'reminderCheck', 'reminderTime'
	];
	const PSYCHOLOGIST_WORKFLOW_RESET_FIELDS = [
		'fullName', 'nickname', 'dateOfBirth', 'gender', 'idCard', 'phoneNumber',
		'occupation', 'donViCongTac', 'diaChiCongTy', 'maritalStatus', 'sexualOrientation', 'address', 'addressDetail',
		'province', 'provinceHidden', 'district', 'ward', 'nationality', 'religion', 'ethnicity',
		'educationLevel', 'mainReason', 'referralSource', 'problemStartTime',
		'symptomProgression', 'psychiatricHistory', 'substanceHistory', 'familyHistory',
		'familyRelationship', 'livingEnvironment', 'socialSupport', 'mainSymptoms',
		'currentBehavior', 'notes', 'age', 'physicalHistory', 'severityLevel',
		'examinationMainReason', 'examDetailMedicalHistory', 'diagnosis', 'treatmentPlan', 'benhKemTheo',
		'reminderCheck', 'reminderTime'
	];
	const DOCTOR_WORKFLOW_PLACEHOLDER_FIELDS = [
		'dateOfBirth', 'occupation', 'address', 'phoneNumber',
		'maritalStatus', 'nationality', 'religion', 'ethnicity', 'educationLevel'
	];
	const PSYCHOLOGIST_WORKFLOW_PLACEHOLDER_FIELDS = [
		'dateOfBirth', 'occupation', 'address', 'phoneNumber', 'sexualOrientation',
		'maritalStatus', 'nationality', 'religion', 'ethnicity', 'educationLevel'
	];

	function resetDoctorWorkflowFormDomState(options = {}) {
		return resetWorkflowFormDomState({
			...options,
			fieldsToReset: options.fieldsToReset || DOCTOR_WORKFLOW_RESET_FIELDS,
			placeholderFields: options.placeholderFields || DOCTOR_WORKFLOW_PLACEHOLDER_FIELDS,
			autocompleteNames: options.autocompleteNames || ['modalOccupationAutocomplete', 'sexualOrientationAutocomplete']
		});
	}

	function resetPsychologistWorkflowFormDomState(options = {}) {
		return resetWorkflowFormDomState({
			...options,
			fieldsToReset: options.fieldsToReset || PSYCHOLOGIST_WORKFLOW_RESET_FIELDS,
			placeholderFields: options.placeholderFields || PSYCHOLOGIST_WORKFLOW_PLACEHOLDER_FIELDS,
			autocompleteNames: options.autocompleteNames || ['occupationAutocomplete', 'sexualOrientationAutocomplete']
		});
	}

	function resetWorkflowPageState(options = {}) {
		const relativeTable = typeof options.getRelativeTable === 'function'
			? options.getRelativeTable()
			: options.relativeTable;
		if (relativeTable && typeof relativeTable.clear === 'function') {
			relativeTable.clear();
		}

		if (typeof options.resetDomState === 'function') {
			options.resetDomState();
		}

		if (typeof options.setCurrentEditId === 'function') {
			options.setCurrentEditId(null);
		}
		if (typeof options.setUploadedDocuments === 'function') {
			options.setUploadedDocuments([]);
		}
		if (typeof options.setCurrentPatientId === 'function') {
			options.setCurrentPatientId(null);
		}

		return true;
	}

	function resetDoctorWorkflowPageState(options = {}) {
		return resetWorkflowPageState({
			...options,
			resetDomState: () => resetDoctorWorkflowFormDomState(options)
		});
	}

	function resetPsychologistWorkflowPageState(options = {}) {
		return resetWorkflowPageState({
			...options,
			resetDomState: () => resetPsychologistWorkflowFormDomState(options)
		});
	}

	function populatePatientAdministrativeFields(patient, options = {}) {
		if (!patient) return false;
		const doc = getDocument(options);
		const setValue = typeof options.safeSetValue === 'function'
			? options.safeSetValue
			: (elementId, value) => safeSetValue(elementId, value, { document: doc });
		const setDatepicker = typeof options.setDatepickerValue === 'function'
			? options.setDatepickerValue
			: (elementId, value) => setValue(elementId, value || '');
		const calculateAge = typeof options.calculateAge === 'function'
			? options.calculateAge
			: () => '';
		const buildFullAddress = typeof options.buildFullAddressFromParts === 'function'
			? options.buildFullAddressFromParts
			: (...parts) => parts.filter(Boolean).join(', ');
		const jquery = options.$ || window.jQuery || window.$;

		setValue('patientId', patient.id);
		setValue('fullName', patient.full_name || '');
		setValue('nickname', patient.nickname || '');
		setDatepicker('dateOfBirth', patient.date_of_birth);

		if (patient.date_of_birth) {
			const age = calculateAge(patient.date_of_birth);
			setValue('age', age ? age : '');
			if (jquery && options.triggerDateOfBirthChange !== false) jquery('#dateOfBirth').trigger('change');
		} else {
			setValue('age', '');
		}

		if (typeof options.setCurrentPatientId === 'function') options.setCurrentPatientId(patient.id);
		if (typeof options.setCurrentPatientData === 'function') options.setCurrentPatientData(patient);

		setValue('gender', patient.gender || '');
		setValue('idCard', patient.id_number || '');
		setValue('phoneNumber', patient.phone || '');
		setValue('occupation', patient.occupation || '');
		setValue('donViCongTac', patient.don_vi_cong_tac || '');
		setValue('diaChiCongTy', patient.dia_chi_cong_ty || '');
		setValue('maritalStatus', patient.marital_status || '');
		setValue('sexualOrientation', patient.sexual_orientation || '');
		setValue('mangThai', patient.mang_thai ? '1' : '');
		setValue('ngayDuSinh', patient.expected_delivery_date || '');
		setValue('soTuanThai', patient.so_tuan_thai || '');

		setValue('addressDetail', patient.address_detail || '');
		setValue('province', patient.province || '');
		setValue('provinceHidden', patient.province || '');
		setValue('district', patient.district || '');
		setValue('ward', patient.ward || '');
		setValue('addressSummary', patient.address || '');
		setValue('address', buildFullAddress(patient.address_detail, patient.ward, patient.district, patient.province));

		setValue('nationality', patient.nationality || '');
		setValue('religion', patient.religion || '');
		setValue('ethnicity', patient.ethnicity || '');
		setValue('educationLevel', patient.education_level || '');
		setValue('referralSource', patient.referral_source);

		return true;
	}

	function isReExaminationAppointment(appointment, options = {}) {
		if (!appointment) return false;
		if (typeof options.isReExamination === 'function') return Boolean(options.isReExamination(appointment));
		return appointment.appointment_category === 'RE_EXAMINATION';
	}

	function populateAppointmentAdministrativeFields(appointment, options = {}) {
		if (!appointment) return false;
		const doc = getDocument(options);
		const setValue = typeof options.safeSetValue === 'function'
			? options.safeSetValue
			: (elementId, value) => safeSetValue(elementId, value, { document: doc });
		const jquery = options.$ || window.jQuery || window.$;

		setValue(options.notesField || 'notes', appointment.notes);

		const reExaminationCheck = doc.getElementById(options.reExaminationField || 'reExaminationCheck');
		if (reExaminationCheck) {
			reExaminationCheck.checked = isReExaminationAppointment(appointment, options);
		}

		if (options.includeReminder) {
			const reminderCheck = doc.getElementById(options.reminderField || 'reminderCheck');
			if (reminderCheck) reminderCheck.checked = appointment.reminder || false;
			setValue(options.reminderTimeField || 'reminderTime', appointment.reminder_time);
		}

		if (appointment.service_id) {
			setValue(options.serviceTypeField || 'serviceType', appointment.service_id);
			if (jquery && options.triggerServiceChange !== false) jquery(`#${options.serviceTypeField || 'serviceType'}`).trigger('change');
		} else if (appointment.package_id) {
			setValue(options.packageField || 'packageId', appointment.package_id);
			if (jquery && options.triggerPackageChange !== false) jquery(`#${options.packageField || 'packageId'}`).trigger('change');
		}

		return true;
	}

	function populateExaminationVitalFields(examination, options = {}) {
		if (!examination) return false;
		const doc = getDocument(options);
		const setValue = typeof options.safeSetValue === 'function'
			? options.safeSetValue
			: (elementId, value) => safeSetValue(elementId, value, { document: doc });

		setValue('weight', examination.weight);
		setValue('height', examination.height);
		setValue('bmi', examination.bmi);
		if (typeof options.updateBMIClassification === 'function') options.updateBMIClassification();
		setValue('pulse', examination.pulse);
		setValue('bloodPressure', examination.blood_pressure);
		setValue('temperature', examination.temperature);

		if (typeof examination.breathing !== 'undefined' && examination.breathing !== null) {
			setValue('breathing', examination.breathing);
			setValue(options.respiratoryRateField || 'respiratoryRate', examination.breathing);
		} else if (options.clearMissingBreathing || Object.prototype.hasOwnProperty.call(examination, 'breathing')) {
			setValue('breathing', '');
			setValue(options.respiratoryRateField || 'respiratoryRate', '');
		}

		return true;
	}

	function hydratePatientAppointmentShell(patient, examination = null, appointment = null, options = {}) {
		if (!patient && !examination && !appointment) return false;
		const includePatient = options.includePatient !== false && Boolean(patient);
		const includeAppointment = options.includeAppointment !== false && Boolean(appointment);
		const includeVitals = options.includeVitals !== false && Boolean(examination);

		const relativeTable = typeof options.getRelativeTable === 'function'
			? options.getRelativeTable()
			: options.relativeTable;
		if (patient && relativeTable) {
			if (typeof relativeTable.setPatientId === 'function') relativeTable.setPatientId(patient.id);
			if (typeof relativeTable.setCurrentAppointmentDate === 'function') {
				relativeTable.setCurrentAppointmentDate(appointment && appointment.appointment_date ? appointment.appointment_date : null);
			}
		}

		if (includePatient) {
			populatePatientAdministrativeFields(patient, options.patientOptions || options);
		}
		if (includeAppointment) {
			populateAppointmentAdministrativeFields(appointment, options.appointmentOptions || options);
		}
		if (includeVitals) {
			populateExaminationVitalFields(examination, options.vitalOptions || options);
		}

		return true;
	}

	function clearPatientSwitchClinicalDomFields(options = {}) {
		const doc = getDocument(options);
		const setValue = typeof options.safeSetValue === 'function'
			? options.safeSetValue
			: (elementId, value) => safeSetValue(elementId, value, { document: doc });
		const jquery = options.$ || window.jQuery || window.$;

		if (jquery) {
			jquery('#mainReason').val('');
			jquery('#mainSymptoms').val('');
			if (Object.prototype.hasOwnProperty.call(options, 'defaultTreatmentMethod')) {
				jquery('#treatmentMethod').val(options.defaultTreatmentMethod);
			}
		} else {
			setValue('mainReason', '');
			setValue('mainSymptoms', '');
			if (Object.prototype.hasOwnProperty.call(options, 'defaultTreatmentMethod')) {
				setValue('treatmentMethod', options.defaultTreatmentMethod);
			}
		}

		['breathing', 'respiratoryRate', 'weight', 'height', 'bmi', 'pulse', 'bloodPressure', 'temperature', 'notes', 'socialSupport', 'hiddenSocialSupport'].forEach(fieldId => {
			setValue(fieldId, '');
		});

		const reExamCheck = doc.getElementById(options.reExaminationField || 'reExaminationCheck');
		if (reExamCheck) reExamCheck.checked = false;

		if (options.hidePreviousVitals) {
			(options.previousVitalHintIds || ['prevWeight', 'prevHeight']).forEach(fieldId => {
				const element = doc.getElementById(fieldId);
				if (element) {
					element.style.display = 'none';
					element.textContent = '';
				}
			});
		}

		return true;
	}

	function getReferralSourceControl(context = {}) {
		if (typeof context.getReferralSourceControl === 'function') {
			return context.getReferralSourceControl();
		}
		return context.referralSourceControl || window.ReferralSourceControl;
	}

	function createFormDomAdapter(context = {}) {
		function isReferralSourceField(elementId) {
			return elementId === (context.referralSourceFieldId || 'referralSource');
		}

		return {
			getElementValue(elementId, defaultValue = '') {
				const referralSourceControl = getReferralSourceControl(context);
				if (isReferralSourceField(elementId) && referralSourceControl) {
					return referralSourceControl.getValue({ document: getDocument(context) }) || defaultValue;
				}
				return getElementValue(elementId, defaultValue, context);
			},
			safeSetValue(elementId, value) {
				const referralSourceControl = getReferralSourceControl(context);
				if (isReferralSourceField(elementId) && referralSourceControl) {
					return referralSourceControl.setValue(value, { document: getDocument(context) });
				}
				return safeSetValue(elementId, value, context);
			},
			safeSetInnerHTML(elementId, html) {
				return safeSetInnerHTML(elementId, html, context);
			},
			updateElements(elements) {
				return updateElements(elements, context);
			}
		};
	}

	const api = {
		getElementValue,
		safeSetValue,
		safeSetInnerHTML,
		updateElements,
		getHiddenOrModalValue,
		syncModalFieldsToHidden,
		collectClinicalAdministrativeFormData,
		buildPatientSavePayload,
		buildAppointmentClinicalUpdatePayload,
		getRawFormValue,
		collectSelectedIcdIds,
		collectPsychologistExaminationFormData,
		buildPsychologistExaminationUpdatePayload,
		bindNumericInputGuard,
		bindAgeInputGuard,
		bindPatientFormAutoSaveFields,
		bindPatientFormAutoSaveSafely,
		initializeOccupationAutocomplete,
		initializeDocumentSectionShell,
		initializeWorkflowFormShell,
		initializeWorkflowPageShell,
		resetDomField,
		resetDomFields,
		clearPlaceholderValues,
		resetWorkflowFormDomState,
		resetDoctorWorkflowFormDomState,
		resetPsychologistWorkflowFormDomState,
		resetWorkflowPageState,
		resetDoctorWorkflowPageState,
		resetPsychologistWorkflowPageState,
		populatePatientAdministrativeFields,
		populateAppointmentAdministrativeFields,
		populateExaminationVitalFields,
		hydratePatientAppointmentShell,
		clearPatientSwitchClinicalDomFields,
		createFormDomAdapter
	};

	window.ClinicalFormDomUtils = api;
	window.DoctorExaminationFormDomUtils = api;
})(window);
