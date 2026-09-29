// components/form-dom-utils.js: phần 1/2 (nạp trước form-dom-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/form-dom-utils'] || (window.QLPKModuleParts['components/form-dom-utils'] = { state: {} });
	const moduleState = moduleParts.state;

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

		const referralSourceControl = moduleParts.getReferralSourceControl(options);
		if (referralSourceControl && typeof referralSourceControl.bind === 'function') {
			referralSourceControl.bind({ document: getDocument(options) });
		}

		const fields = options.fields || moduleState.DEFAULT_PATIENT_AUTOSAVE_FIELDS;
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
	function scheduleWorkflowShellDeferredTasks(options, doc) {
		const schedule = options.setTimeout || window.setTimeout;
		if (typeof schedule !== 'function') return false;
		if (typeof options.loadAddressDraftFromCache === 'function') {
			schedule(() => options.loadAddressDraftFromCache(), options.addressDraftDelayMs || 100);
		}
		schedule(() => clearPageAgeField(doc), options.clearAgeDelayMs || 100);
		return true;
	}
	function runWorkflowShellLoaders(options, doc) {
		const sidebarUi = options.sidebarUserInfoUi || window.SidebarUserInfoUi;
		if (sidebarUi && typeof sidebarUi.loadSidebarUserInfo === 'function') {
			sidebarUi.loadSidebarUserInfo({ document: doc });
		}
		if (typeof options.loadProvinces === 'function') options.loadProvinces();
		if (typeof options.loadAppointments === 'function') {
			options.loadAppointments(options.currentStatus, options.currentPage);
		}
	}
	function bindWorkflowShellAdapters(options, doc) {
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
	}
	function initializeWorkflowPageShell(options = {}) {
		const doc = getDocument(options);
		if (typeof options.resetFormToDefault === 'function') options.resetFormToDefault();
		scheduleWorkflowShellDeferredTasks(options, doc);
		runWorkflowShellLoaders(options, doc);
		bindWorkflowShellAdapters(options, doc);
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

	Object.assign(moduleParts, {
		getDocument,
		getElementValue,
		safeSetValue,
		safeSetInnerHTML,
		updateElements,
		getHiddenOrModalValue,
		collectClinicalAdministrativeFormData,
		buildPatientSavePayload,
		buildAppointmentClinicalUpdatePayload,
		bindNumericInputGuard,
		bindAgeInputGuard,
		resolvePatientAutoSaveValue,
		bindPatientFormAutoSaveFields,
		initializeOccupationAutocomplete,
		bindPatientFormAutoSaveSafely,
		initializeDocumentSectionShell,
		initializeWorkflowFormShell,
		clearPageAgeField,
		scheduleWorkflowShellDeferredTasks,
		runWorkflowShellLoaders,
		bindWorkflowShellAdapters,
		initializeWorkflowPageShell,
		resetDomField,
		resetDomFields,
		setDomValue,
		clearAgeField,
		isPlaceholderValue,
		clearPlaceholderValues,
		resetAutocompleteValues
	});
})(window);
