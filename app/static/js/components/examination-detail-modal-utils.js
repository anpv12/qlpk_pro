(function (window) {
	'use strict';

	const DEFAULT_SUBSTANCE_IDS = ['tobacco', 'alcohol', 'cannabis', 'cocaine', 'stimulants', 'inhalants', 'sedatives', 'hallucinogens', 'opioids', 'other_substance'];
	const DEFAULT_HISTORY_FIELDS = [];
	const DEFAULT_GENERAL_TEXTAREAS = ['examDetailGeneralExamination'];
	const DEFAULT_MENTAL_TEXTAREAS = ['examMentalGeneralManifestations'];
	const DEFAULT_MENTAL_FIELDS = ['examMentalOrientation', 'examMentalEmotions', 'examMentalPerception', 'examMentalThought', 'examMentalBehavior', 'examMentalMemory', 'examMentalAttention', 'examMentalIntelligence', 'examMentalNotes'];
	const DOCTOR_AUTOSAVE_FIELDS = [
		{ selector: '#examDetailMedicalHistory', fieldName: 'medical_history', section: 'bac_si_kham_tien_su' },
		{ selector: '#examDetailGeneralExamination', fieldName: 'general_examination', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralPresentation', fieldName: 'bieu_hien_chung', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralCirculation', fieldName: 'circulation', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralDigestive', fieldName: 'digestive', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralRenalUroGenital', fieldName: 'renal_urogenital', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralMusculoskeletal', fieldName: 'musculoskeletal', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralENT', fieldName: 'ent', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralEndocrineNutritionOthers', fieldName: 'endocrine_nutrition_others', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examGeneralMental', fieldName: 'neurological', section: 'bac_si_kham_kham_tong_quat' },
		{ selector: '#examMentalOrientation', fieldName: 'orientation', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalEmotions', fieldName: 'emotions', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalPerception', fieldName: 'perception', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalThought', fieldName: 'thought', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalBehavior', fieldName: 'behavior', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalMemory', fieldName: 'memory', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalAttention', fieldName: 'attention', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examMentalIntelligence', fieldName: 'intelligence', section: 'bac_si_kham_kham_tam_than' },
		{ selector: '#examDetailLabTests', fieldName: 'required_tests', section: 'bac_si_kham_xet_nghiem' }
	];
	const PSYCHOLOGIST_AUTOSAVE_FIELDS = [
		{ selector: '#examDetailMedicalHistory', fieldName: 'medical_history', section: 'tam_ly_gia_kham_tien_su' }
	];
	const DOCTOR_MODAL_SECTION_MAPPINGS = {
		bac_si_kham_kham_tong_quat: [
				{ key: 'general_examination', target: 'examDetailGeneralExamination', type: 'textarea' },
				{ key: 'bieu_hien_chung', target: 'examGeneralPresentation', type: 'textarea' },
				{ key: 'circulation', target: 'examGeneralCirculation' },
			{ key: 'digestive', target: 'examGeneralDigestive' },
			{ key: 'renal_urogenital', target: 'examGeneralRenalUroGenital' },
			{ key: 'musculoskeletal', target: 'examGeneralMusculoskeletal' },
			{ key: 'ent', target: 'examGeneralENT' },
			{ key: 'endocrine_nutrition_others', target: 'examGeneralEndocrineNutritionOthers' },
			{ key: 'neurological', target: 'examGeneralMental' }
		],
		bac_si_kham_kham_tam_than: [
			{ key: 'orientation', target: 'examMentalOrientation' },
			{ key: 'emotions', target: 'examMentalEmotions' },
			{ key: 'perception', target: 'examMentalPerception' },
			{ key: 'thought', target: 'examMentalThought' },
			{ key: 'behavior', target: 'examMentalBehavior' },
			{ key: 'memory', target: 'examMentalMemory' },
			{ key: 'attention', target: 'examMentalAttention' },
			{ key: 'intelligence', target: 'examMentalIntelligence' }
		],
		bac_si_kham_xet_nghiem: [
			{ key: 'required_tests', target: 'examDetailLabTests' }
		]
	};
	const PSYCHOLOGIST_MODAL_SECTION_MAPPINGS = {
		tam_ly_gia_kham_kham_tam_than: [
			{ key: 'dien_tien_trong_phien_kham', target: 'examDetailGeneralExamination', type: 'textarea' },
			{ key: 'danh_gia_ban_dau', target: 'examMentalGeneralManifestations', type: 'textarea' },
			{ key: 'orientation', target: 'examMentalOrientation' },
			{ key: 'emotions', target: 'examMentalEmotions' },
			{ key: 'perception', target: 'examMentalPerception' },
			{ key: 'thought', target: 'examMentalThought' },
			{ key: 'behavior', target: 'examMentalBehavior' },
			{ key: 'memory', target: 'examMentalMemory' },
			{ key: 'attention', target: 'examMentalAttention' },
			{ key: 'intelligence', target: 'examMentalIntelligence' },
			{ key: 'notes', target: 'examMentalNotes' }
		]
	};
	const DOCTOR_FORM_MODAL_LOAD_MAPPINGS = {
		bac_si_kham_tien_su: [
			{ key: 'medical_history', target: 'examDetailMedicalHistory', requireElement: true, autoResize: true }
		],
		bac_si_kham_kham_tong_quat: [
			{ key: 'general_examination', target: 'examDetailGeneralExamination', type: 'textarea', requireElement: true },
			{ key: 'bieu_hien_chung', target: 'examGeneralPresentation', type: 'textarea', requireElement: true }
		],
		bac_si_kham_kham_tam_than: []
	};
	const PSYCHOLOGIST_FORM_MODAL_LOAD_MAPPINGS = {
		tam_ly_gia_kham_tien_su: [
			{ key: 'medical_history', target: 'examDetailMedicalHistory', requireElement: true, autoResize: true }
		],
		tam_ly_gia_kham_kham_tam_than: [
			{ key: 'dien_tien_trong_phien_kham', target: 'examDetailGeneralExamination', type: 'textarea', requireElement: true },
			{ key: 'danh_gia_ban_dau', target: 'examMentalGeneralManifestations', type: 'textarea', requireElement: true }
		],
		tam_ly_gia_kham_form_kham: [
			{ key: 'nhan_dinh_chung', target: 'benhKemTheo', type: 'textarea' },
			{ key: 'ke_hoach_can_thiep', target: 'treatmentPlan' },
			{ key: 'trieu_chung_va_hanh_vi_hien_tai', target: 'diagnosis', type: 'textarea' }
		]
	};
	const DOCTOR_MODAL_SAVE_SECTIONS = {
		bac_si_kham_tien_su: [
			{ key: 'medical_history', selector: '#examDetailMedicalHistory' }
		],
		bac_si_kham_kham_tong_quat: [
			{ key: 'general_examination', selector: '#examDetailGeneralExamination' },
			{ key: 'bieu_hien_chung', selector: '#examGeneralPresentation' },
			{ key: 'circulation', selector: '#examGeneralCirculation', defaultValue: true },
			{ key: 'digestive', selector: '#examGeneralDigestive', defaultValue: true },
			{ key: 'renal_urogenital', selector: '#examGeneralRenalUroGenital', defaultValue: true },
			{ key: 'musculoskeletal', selector: '#examGeneralMusculoskeletal', defaultValue: true },
			{ key: 'ent', selector: '#examGeneralENT', defaultValue: true },
			{ key: 'endocrine_nutrition_others', selector: '#examGeneralEndocrineNutritionOthers', defaultValue: true },
			{ key: 'neurological', selector: '#examGeneralMental', defaultValue: true }
		],
		bac_si_kham_kham_tam_than: [
			{ key: 'orientation', selector: '#examMentalOrientation', defaultValue: true },
			{ key: 'emotions', selector: '#examMentalEmotions', defaultValue: true },
			{ key: 'perception', selector: '#examMentalPerception', defaultValue: true },
			{ key: 'thought', selector: '#examMentalThought', defaultValue: true },
			{ key: 'behavior', selector: '#examMentalBehavior', defaultValue: true },
			{ key: 'memory', selector: '#examMentalMemory', defaultValue: true },
			{ key: 'attention', selector: '#examMentalAttention', defaultValue: true },
			{ key: 'intelligence', selector: '#examMentalIntelligence', defaultValue: true }
		],
		bac_si_kham_xet_nghiem: [
			{ key: 'required_tests', selector: '#examDetailLabTests' }
		]
	};
	const PSYCHOLOGIST_MODAL_SAVE_SECTIONS = {
		tam_ly_gia_kham_tien_su: [
			{ key: 'medical_history', selector: '#examDetailMedicalHistory' }
		],
		tam_ly_gia_kham_kham_tam_than: [
			{ key: 'danh_gia_ban_dau', selector: '#examMentalGeneralManifestations' },
			{ key: 'dien_tien_trong_phien_kham', selector: '#examDetailGeneralExamination' },
			{ key: 'orientation', selector: '#examMentalOrientation', defaultValue: true },
			{ key: 'emotions', selector: '#examMentalEmotions', defaultValue: true },
			{ key: 'perception', selector: '#examMentalPerception', defaultValue: true },
			{ key: 'thought', selector: '#examMentalThought', defaultValue: true },
			{ key: 'behavior', selector: '#examMentalBehavior', defaultValue: true },
			{ key: 'memory', selector: '#examMentalMemory', defaultValue: true },
			{ key: 'attention', selector: '#examMentalAttention', defaultValue: true },
			{ key: 'intelligence', selector: '#examMentalIntelligence', defaultValue: true },
			{ key: 'notes', selector: '#examMentalNotes' }
		]
	};

	function clearValueFields($, fieldIds = []) {
		fieldIds.forEach(fieldId => {
			$(`#${fieldId}`).val('');
		});
	}

	function clearTextareaFields(textareaIds = [], setTextareaValue) {
		textareaIds.forEach(fieldId => {
			setTextareaValue(fieldId, '');
		});
	}

	function clearSubstanceUseFields($, substanceIds = DEFAULT_SUBSTANCE_IDS) {
		substanceIds.forEach(id => {
			$(`#${id}_check`).prop('checked', false);
			$(`#${id}_time`).prop('disabled', true).val('');
		});
	}

	function resetSubstanceUseFields(options = {}) {
		const doc = options.document || window.document;
		(options.substanceIds || DEFAULT_SUBSTANCE_IDS).forEach(id => {
			const check = doc.getElementById(`${id}_check`);
			const time = doc.getElementById(`${id}_time`);
			if (check) check.checked = false;
			if (time) {
				time.value = '';
				time.disabled = true;
			}
		});
		return true;
	}

	function bindSubstanceTimeInputHandlers(options = {}) {
		const doc = options.document || window.document;
		(options.substanceIds || DEFAULT_SUBSTANCE_IDS).forEach(id => {
			const check = doc.getElementById(`${id}_check`);
			const time = doc.getElementById(`${id}_time`);
			if (!check || !time || check._clinicalSubstanceTimeBound) return;
			check.addEventListener('change', () => {
				if (check.checked) {
					time.removeAttribute('disabled');
					time.focus();
				} else {
					time.value = '';
					time.setAttribute('disabled', 'disabled');
				}
			});
			check._clinicalSubstanceTimeBound = true;
		});
		return true;
	}

	function collectSubstanceUseData(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return {};
		const substanceData = {};
		(options.substanceIds || DEFAULT_SUBSTANCE_IDS).forEach(id => {
			const checked = $(`#${id}_check`).is(':checked');
			const time = $(`#${id}_time`).val() || '';
			substanceData[`${id}_used`] = checked;
			if (checked) {
				substanceData[`${id}_duration`] = time;
			}
		});
		return substanceData;
	}

	function bindSubstanceUseSaveFields(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function' || typeof options.onSave !== 'function') return false;
		(options.substanceIds || DEFAULT_SUBSTANCE_IDS).forEach(id => {
			$(`#${id}_check`).on('change', function () {
				options.onSave();
			});

			$(`#${id}_time`).on('blur', function () {
				if ($(`#${id}_check`).is(':checked')) {
					options.onSave();
				}
			});
		});
		return true;
	}

	function populateSubstanceUseFields(substance, options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function' || !substance) return false;
		(options.substanceIds || DEFAULT_SUBSTANCE_IDS).forEach(id => {
			const used = substance[`${id}_used`];
			const duration = substance[`${id}_duration`];
			if (used === true || used === 'true') {
				$(`#${id}_check`).prop('checked', true);
				$(`#${id}_time`).prop('disabled', false).val(duration || '');
			} else {
				$(`#${id}_check`).prop('checked', false);
				$(`#${id}_time`).prop('disabled', true).val('');
			}
		});
		return true;
	}

	function clearFields(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return false;

		const setTextareaValue = typeof options.setTextareaValue === 'function'
			? options.setTextareaValue
			: (fieldId, value) => $(`#${fieldId}`).val(value);

		clearValueFields($, options.historyFields || DEFAULT_HISTORY_FIELDS);
		clearSubstanceUseFields($, options.substanceIds || DEFAULT_SUBSTANCE_IDS);
		clearTextareaFields(options.generalTextareas || DEFAULT_GENERAL_TEXTAREAS, setTextareaValue);
		clearValueFields($, options.generalFields || []);
		clearTextareaFields(options.mentalTextareas || DEFAULT_MENTAL_TEXTAREAS, setTextareaValue);
		clearValueFields($, options.mentalFields || DEFAULT_MENTAL_FIELDS);
		clearValueFields($, options.extraFields || []);
		return true;
	}

	function bindAutoSaveFields(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function' || typeof options.autoSaveField !== 'function') return false;
		(options.fields || []).forEach(field => {
			if (!field || !field.selector || !field.fieldName || !field.section) return;
			$(field.selector).on(field.events || 'blur', function () {
				options.autoSaveField(field.fieldName, $(this).val(), field.section);
			});
		});
		return true;
	}

	function bindDoctorAutoSaveFields(options = {}) {
		return bindAutoSaveFields({ ...options, fields: options.fields || DOCTOR_AUTOSAVE_FIELDS });
	}

	function bindPsychologistAutoSaveFields(options = {}) {
		return bindAutoSaveFields({ ...options, fields: options.fields || PSYCHOLOGIST_AUTOSAVE_FIELDS });
	}

	async function resolveCurrentAppointmentId(options = {}) {
		let appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (appointmentId) return appointmentId;

		const patientId = typeof options.getCurrentPatientId === 'function'
			? options.getCurrentPatientId()
			: options.currentPatientId;
		if (patientId && typeof options.apiCall === 'function') {
			try {
				const response = await options.apiCall(`/api/appointments/?patient_id=${patientId}&per_page=1`);
				if (response && response.ok) {
					const data = await response.json();
					appointmentId = data.appointments && data.appointments.length > 0 ? data.appointments[0].id : null;
					if (appointmentId && typeof options.setCurrentAppointmentId === 'function') {
						options.setCurrentAppointmentId(appointmentId);
					}
				}
			} catch (error) {
				console.error('Error finding appointment:', error);
			}
		}

		return appointmentId;
	}

	function syncDetailHistoryToMainForm(options = {}) {
		return false;
	}

	function hideDetailModal(options = {}) {
		const doc = options.document || window.document;
		const modalId = options.modalId || 'examinationDetailModal';
		try {
			const modal = window.bootstrap?.Modal?.getInstance(doc.getElementById(modalId));
			if (modal) modal.hide();
		} catch (error) { }
	}

	function prefillDetailModalFromMainForm(options = {}) {
		return false;
	}

	function setMappedField(mapping, sectionData, options = {}) {
		if (!mapping || !sectionData || !mapping.key || !mapping.target || !sectionData[mapping.key]) return false;
		const doc = options.document || window.document;
		if (mapping.requireElement && !doc.getElementById(mapping.target)) return false;
		const value = sectionData[mapping.key];
		if (mapping.type === 'textarea' && typeof options.setTextareaValue === 'function') {
			options.setTextareaValue(mapping.target, value);
			if (mapping.autoResize && typeof options.autoResizeTextarea === 'function') {
				setTimeout(() => options.autoResizeTextarea(doc.getElementById(mapping.target)), mapping.autoResizeDelay || 50);
			}
			return true;
		}
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return false;
		$(`#${mapping.target}`).val(value);
		if (mapping.autoResize && typeof options.autoResizeTextarea === 'function') {
			setTimeout(() => options.autoResizeTextarea(doc.getElementById(mapping.target)), mapping.autoResizeDelay || 50);
		}
		return true;
	}

	function populateDetailModalSections(sections, mappings, options = {}) {
		if (!sections || !mappings) return 0;
		let populatedCount = 0;
		Object.entries(mappings).forEach(([sectionName, sectionMappings]) => {
			const sectionData = sections[sectionName];
			if (!sectionData || !Array.isArray(sectionMappings)) return;
			sectionMappings.forEach(mapping => {
				if (setMappedField(mapping, sectionData, options)) populatedCount += 1;
			});
		});
		return populatedCount;
	}

	function getInputValue($, selector) {
		return $(selector).val() || '';
	}

	function buildModalSavePayload(appointmentId, sectionConfigs, options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		const sections = {};
		Object.entries(sectionConfigs || {}).forEach(([sectionName, fields]) => {
			sections[sectionName] = {};
			(fields || []).forEach(field => {
				let value = getInputValue($, field.selector);
				if (field.defaultValue && typeof options.getDefaultValue === 'function') {
					value = options.getDefaultValue(field.key, sectionName, value);
				}
				sections[sectionName][field.key] = value;
			});
		});
		return { appointment_id: appointmentId, sections };
	}

	function applyModalDefaultAutofill(modalData, sectionConfigs, options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function' || !modalData || !modalData.sections) return 0;
		const defaultNormalValue = options.defaultNormalValue || 'Không ghi nhận bất thường';
		let updateCount = 0;
		Object.entries(sectionConfigs || {}).forEach(([sectionName, fields]) => {
			(fields || []).forEach(field => {
				if (!field.defaultValue) return;
				const currentValue = getInputValue($, field.selector);
				const autoFilledValue = modalData.sections[sectionName]?.[field.key];
				if (autoFilledValue && autoFilledValue === defaultNormalValue && (!currentValue || currentValue.trim() === '')) {
					$(field.selector).val(autoFilledValue);
					updateCount += 1;
				}
			});
		});
		return updateCount;
	}

	function findDefaultAutofillField(fieldId, sectionConfigs) {
		for (const fields of Object.values(sectionConfigs || {})) {
			const field = (fields || []).find(item => item.defaultValue && item.key === fieldId && item.selector);
			if (field) return field;
		}
		return null;
	}

	function applyFieldDefaultAutofill(fieldId, finalValue, originalValue, sectionConfigs, options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		const defaultNormalValue = options.defaultNormalValue || 'Không ghi nhận bất thường';
		if (typeof $ !== 'function' || finalValue === originalValue || finalValue !== defaultNormalValue) return false;
		const field = findDefaultAutofillField(fieldId, sectionConfigs);
		if (!field) return false;
		$(field.selector).val(finalValue);
		return true;
	}

	function buildDoctorModalSavePayload(appointmentId, options = {}) {
		return buildModalSavePayload(appointmentId, options.sections || DOCTOR_MODAL_SAVE_SECTIONS, options);
	}

	function buildPsychologistModalSavePayload(appointmentId, options = {}) {
		return buildModalSavePayload(appointmentId, options.sections || PSYCHOLOGIST_MODAL_SAVE_SECTIONS, options);
	}

	function applyDoctorModalDefaultAutofill(modalData, options = {}) {
		return applyModalDefaultAutofill(modalData, options.sections || DOCTOR_MODAL_SAVE_SECTIONS, options);
	}

	function applyPsychologistModalDefaultAutofill(modalData, options = {}) {
		return applyModalDefaultAutofill(modalData, options.sections || PSYCHOLOGIST_MODAL_SAVE_SECTIONS, options);
	}

	function applyDoctorFieldDefaultAutofill(fieldId, finalValue, originalValue, options = {}) {
		return applyFieldDefaultAutofill(fieldId, finalValue, originalValue, options.sections || DOCTOR_MODAL_SAVE_SECTIONS, options);
	}

	function applyPsychologistFieldDefaultAutofill(fieldId, finalValue, originalValue, options = {}) {
		return applyFieldDefaultAutofill(fieldId, finalValue, originalValue, options.sections || PSYCHOLOGIST_MODAL_SAVE_SECTIONS, options);
	}

	async function loadDetailModalSections(options = {}) {
		if (!options.appointmentId || typeof options.apiCall !== 'function') return false;
		try {
			const response = await options.apiCall(`/api/examination-details/modal-load/${options.appointmentId}`);
			if (response.ok) {
				const data = await response.json();
				if (data.sections) {
					populateDetailModalSections(data.sections, options.mappings, options);
				}
				return true;
			}
			console.error(options.failedMessage || 'Failed to load examination modal data');
		} catch (error) {
			console.error(options.errorMessage || 'Error loading examination modal data:', error);
		}
		if (options.prefillFallback !== false) {
			prefillDetailModalFromMainForm(options);
		}
		return false;
	}

	function loadDoctorDetailModalSections(options = {}) {
		return loadDetailModalSections({ ...options, mappings: options.mappings || DOCTOR_MODAL_SECTION_MAPPINGS });
	}

	function loadPsychologistDetailModalSections(options = {}) {
		return loadDetailModalSections({ ...options, mappings: options.mappings || PSYCHOLOGIST_MODAL_SECTION_MAPPINGS });
	}

	async function loadFormDetailSectionsFromModal(options = {}) {
		if (!options.appointmentId || typeof options.apiCall !== 'function') return { ok: false, stale: false, count: 0 };
		const isCurrentLoad = typeof options.isCurrentLoad === 'function' ? options.isCurrentLoad : () => true;
		try {
			const response = await options.apiCall(`/api/examination-details/modal-load/${options.appointmentId}`);
			if (!isCurrentLoad()) return { ok: false, stale: true, count: 0 };
			if (response.ok) {
				const data = await response.json();
				if (!isCurrentLoad()) return { ok: false, stale: true, count: 0 };
				const count = data && data.sections
					? populateDetailModalSections(data.sections, options.mappings, options)
					: 0;
				return { ok: true, stale: false, count };
			}
		} catch (error) {
			if (options.logError) {
				console.error(options.errorMessage || 'Error loading modal data for form population:', error);
			}
		}
		return { ok: false, stale: false, count: 0 };
	}

	function loadDoctorFormDetailSectionsFromModal(options = {}) {
		return loadFormDetailSectionsFromModal({ ...options, mappings: options.mappings || DOCTOR_FORM_MODAL_LOAD_MAPPINGS });
	}

	function loadPsychologistFormDetailSectionsFromModal(options = {}) {
		return loadFormDetailSectionsFromModal({ ...options, mappings: options.mappings || PSYCHOLOGIST_FORM_MODAL_LOAD_MAPPINGS });
	}

	async function loadMainReasonFromSection(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		const examination = options.examination;
		if (!examination || !examination.id || typeof options.apiCall !== 'function') return false;
		const isCurrentLoad = typeof options.isCurrentLoad === 'function' ? options.isCurrentLoad : () => true;
		try {
			const detailResp = await options.apiCall(`/api/examination-details/${examination.id}/section/${options.section}`);
			if (!isCurrentLoad()) return false;
			if (detailResp.ok) {
				const detailData = await detailResp.json();
				if (!isCurrentLoad()) return false;
				const fields = detailData.data || detailData;
				if (Array.isArray(fields)) {
					const mrField = fields.find(field => field.field_name === (options.fieldName || 'main_reason'));
					if (mrField && mrField.field_value && typeof $ === 'function') {
						$(options.targetSelector || '#examinationMainReason').val(mrField.field_value);
						return true;
					}
				}
			}
		} catch (error) {
			console.warn(options.warningMessage || 'Error loading main_reason from examination_details:', error);
		}
		return false;
	}

	async function populateMainReasonFromExamination(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		const examination = options.examination;
		if (!examination) return false;
		if (examination.main_reason && typeof $ === 'function') {
			$(options.targetSelector || '#examinationMainReason').val(examination.main_reason);
		}
		return loadMainReasonFromSection(options);
	}

	async function saveMainReasonToSection(options = {}) {
		const appointmentId = options.appointmentId;
		const apiCall = options.apiCall;
		const section = options.section;
		if (!appointmentId || typeof apiCall !== 'function' || !section) {
			return { status: 'missingInput', examinationId: null, response: null };
		}

		const fieldName = options.fieldName || 'main_reason';
		const value = options.value || '';
		const examResp = await apiCall(`/api/examination-id/${appointmentId}`);
		if (!examResp || !examResp.ok) {
			return { status: 'missingExamination', examinationId: null, response: examResp || null };
		}

		const examData = await examResp.json();
		const examinationId = examData && examData.examination_id ? examData.examination_id : null;
		if (!examinationId) {
			return { status: 'missingExaminationId', examinationId: null, response: examResp };
		}

		const saveResponse = await apiCall(`/api/examination-details/${examinationId}/section/${section}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ [fieldName]: value })
		});

		return { status: 'saved', examinationId, response: saveResponse };
	}

	async function saveBasicExaminationInfoShell(options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		if (!appointmentId) return { status: 'missingAppointment' };

		const $ = options.$ || window.jQuery || window.$;
		const mainReasonValue = typeof options.getMainReasonValue === 'function'
			? options.getMainReasonValue()
			: (typeof $ === 'function' ? $('#examinationMainReason').val() || '' : '');

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const mainReasonResult = await saveMainReasonToSection({
				appointmentId,
				apiCall: options.apiCall,
				section: options.section,
				value: mainReasonValue
			});

			if (typeof options.afterSaveMainReason === 'function') {
				await options.afterSaveMainReason({ appointmentId, mainReasonValue, mainReasonResult });
			}

			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('success');
			}
			return { status: 'saved', appointmentId, mainReasonResult };
		} catch (error) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error(options.errorLogMessage || 'Error saving basic examination info:', error);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'error', appointmentId, error };
		}
	}

	async function autoSaveDetailFieldShell(fieldId, value, section, options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		if (!appointmentId) return { status: 'missingAppointment' };

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const mappedSection = typeof options.mapSection === 'function' ? options.mapSection(section) : section;
			const finalValue = typeof options.getDefaultValue === 'function'
				? options.getDefaultValue(fieldId, mappedSection, value)
				: value;
			if (typeof options.applyAutofill === 'function') {
				options.applyAutofill(fieldId, finalValue, value, mappedSection);
			}

			const response = await options.apiCall('/api/examination-details', {
				method: 'POST',
				body: JSON.stringify({
					appointment_id: appointmentId,
					section: mappedSection,
					field_name: fieldId,
					field_value: finalValue
				})
			});

			if (typeof options.isCurrentAppointment === 'function' && !options.isCurrentAppointment(appointmentId)) {
				return { status: 'stale', appointmentId, response };
			}

			if (response.ok) {
				if (typeof options.showAutoSaveIndicator === 'function') {
					options.showAutoSaveIndicator('success');
				}
				return { status: 'saved', appointmentId, response, mappedSection, finalValue };
			}

			const errorText = await response.text();
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error(`Failed to auto-save field ${fieldId}:`, errorText);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'error', appointmentId, response, errorText };
		} catch (error) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error(`Error auto-saving field ${fieldId}:`, error);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'exception', appointmentId, error };
		}
	}

	async function autoSaveAllDetailModalFieldsShell(options = {}) {
		if (typeof options.shouldSkip === 'function' && options.shouldSkip()) {
			return { status: 'skipped' };
		}

		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		if (!appointmentId) return { status: 'missingAppointment' };

		try {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('saving');
			}

			const modalData = typeof options.buildModalData === 'function'
				? options.buildModalData(appointmentId)
				: (options.modalData || {});
			if (typeof options.applyDefaultAutofill === 'function') {
				options.applyDefaultAutofill(modalData, appointmentId);
			}

			const response = await options.apiCall('/api/examination-details/modal-save', {
				method: 'POST',
				body: JSON.stringify(modalData)
			});

			if (typeof options.isCurrentAppointment === 'function' && !options.isCurrentAppointment(appointmentId)) {
				return { status: 'stale', appointmentId, response, modalData };
			}

			if (response.ok) {
				if (typeof options.showAutoSaveIndicator === 'function') {
					options.showAutoSaveIndicator('success');
				}
				return { status: 'saved', appointmentId, response, modalData };
			}

			const errorText = await response.text();
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error('Failed to auto-save all modal fields:', errorText);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'error', appointmentId, response, errorText, modalData };
		} catch (error) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error('Error auto-saving all modal fields:', error);
			}
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator('error');
			}
			return { status: 'exception', appointmentId, error };
		}
	}

	function createDetailModalAutosaveAdapter(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		const logger = options.console || window.console;
		const variant = options.variant || 'doctor';
		const fieldDefaultsUtils = options.fieldDefaultsUtils || window.ClinicalExaminationFieldDefaultsUtils;
		const fieldDefaultsAdapter = fieldDefaultsUtils && typeof fieldDefaultsUtils.createExaminationFieldDefaultsAdapter === 'function'
			? fieldDefaultsUtils.createExaminationFieldDefaultsAdapter({
				mapSection: options.mapSection,
				generalSection: variant === 'doctor' ? 'bac_si_kham_kham_tong_quat' : options.generalSection,
				mentalSection: variant === 'psychologist' ? 'tam_ly_gia_kham_kham_tam_than' : 'bac_si_kham_kham_tam_than',
				...(options.fieldDefaultsOptions || {})
			})
			: null;

		function shouldSkipField() {
			const skip = options.shouldSkipField || options.shouldSkip;
			return typeof skip === 'function' && skip();
		}

		function shouldSkipAll() {
			const skip = options.shouldSkipAll || options.shouldSkip;
			return typeof skip === 'function' && skip();
		}

		function applyFieldAutofill(fieldId, finalValue, originalValue, mappedSection) {
			if (typeof options.applyAutofill === 'function') {
				return options.applyAutofill(fieldId, finalValue, originalValue, mappedSection);
			}
			if (variant === 'psychologist') {
				return applyPsychologistFieldDefaultAutofill(fieldId, finalValue, originalValue, { $, ...(options.fieldAutofillOptions || {}) });
			}
			return applyDoctorFieldDefaultAutofill(fieldId, finalValue, originalValue, { $, ...(options.fieldAutofillOptions || {}) });
		}

		function resolveDefaultValue(fieldId, section, currentValue) {
			if (typeof options.getDefaultValue === 'function') {
				return options.getDefaultValue(fieldId, section, currentValue);
			}
			if (fieldDefaultsAdapter && typeof fieldDefaultsAdapter.getDefaultValue === 'function') {
				return fieldDefaultsAdapter.getDefaultValue(fieldId, section, currentValue);
			}
			return currentValue || '';
		}

		function buildModalData(appointmentId) {
			if (typeof options.buildModalData === 'function') {
				return options.buildModalData(appointmentId);
			}
			const payloadOptions = { $, ...(options.modalPayloadOptions || {}) };
			if (typeof options.getModalDefaultValue === 'function') {
				payloadOptions.getDefaultValue = options.getModalDefaultValue;
			} else {
				payloadOptions.getDefaultValue = resolveDefaultValue;
			}
			if (variant === 'psychologist') {
				return buildPsychologistModalSavePayload(appointmentId, payloadOptions);
			}
			return buildDoctorModalSavePayload(appointmentId, payloadOptions);
		}

		function applyDefaultAutofill(modalData, appointmentId) {
			if (typeof options.applyDefaultAutofill === 'function') {
				return options.applyDefaultAutofill(modalData, appointmentId);
			}
			if (variant === 'psychologist') {
				return applyPsychologistModalDefaultAutofill(modalData, { $, ...(options.modalAutofillOptions || {}) });
			}
			return applyDoctorModalDefaultAutofill(modalData, { $, ...(options.modalAutofillOptions || {}) });
		}

		function autoSaveField(fieldId, value, section) {
			return autoSaveDetailFieldShell(fieldId, value, section, {
				apiCall: options.apiCall,
				console: logger,
				shouldSkip: shouldSkipField,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				appointmentId: options.appointmentId,
				mapSection: options.mapSection,
				getDefaultValue: resolveDefaultValue,
				applyAutofill: applyFieldAutofill,
				isCurrentAppointment: options.isCurrentAppointment,
				showAutoSaveIndicator: options.showAutoSaveIndicator
			});
		}

		function autoSaveAllFields() {
			return autoSaveAllDetailModalFieldsShell({
				$,
				apiCall: options.apiCall,
				console: logger,
				shouldSkip: shouldSkipAll,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				appointmentId: options.appointmentId,
				buildModalData,
				applyDefaultAutofill,
				isCurrentAppointment: options.isCurrentAppointment,
				showAutoSaveIndicator: options.showAutoSaveIndicator
			});
		}

		function bindConfiguredAutoSaveFields() {
			if (typeof options.bindAutoSaveFields === 'function') {
				return options.bindAutoSaveFields({ $, autoSaveField, variant });
			}
			if (variant === 'psychologist') {
				return bindPsychologistAutoSaveFields({ $, autoSaveField, fields: options.fields });
			}
			return bindDoctorAutoSaveFields({ $, autoSaveField, fields: options.fields });
		}

		function createSubstanceUseSaveHandler(substanceOptions = {}) {
			return async function savePatientSubstanceHistory() {
				const skip = substanceOptions.shouldSkip || options.shouldSkipSubstanceUse;
				if (typeof skip === 'function' && skip()) return { status: 'skipped' };
				if (typeof options.apiCall !== 'function') return { status: 'missingApi' };

				const patientId = typeof substanceOptions.getCurrentPatientId === 'function'
					? substanceOptions.getCurrentPatientId()
					: substanceOptions.currentPatientId;
				if (!patientId) return { status: 'missingPatient' };

				const substanceData = collectSubstanceUseData({ $, substanceIds: substanceOptions.substanceIds });
				try {
					const response = await options.apiCall(`/api/patients/${patientId}`, {
						method: 'PUT',
						body: JSON.stringify({
							substance_use_history: substanceData
						})
					});
					return { status: 'saved', patientId, response };
				} catch (error) {
					if (logger && typeof logger.error === 'function') {
						logger.error(substanceOptions.errorMessage || 'Error saving substance history:', error);
					}
					return { status: 'exception', patientId, error };
				}
			};
		}

		function bindSubstanceUseAutosaveFields() {
			const substanceOptions = options.substanceUse || {};
			if (!substanceOptions.enabled) return false;
			const onSave = typeof substanceOptions.onSave === 'function'
				? substanceOptions.onSave
				: createSubstanceUseSaveHandler(substanceOptions);
			return bindSubstanceUseSaveFields({
				$,
				substanceIds: substanceOptions.substanceIds,
				onSave
			});
		}

		function setupAutoSaveFields() {
			bindConfiguredAutoSaveFields();
			bindSubstanceUseAutosaveFields();
			if (typeof options.setupExtraAutoSaveFields === 'function') {
				options.setupExtraAutoSaveFields({ $, autoSaveField, autoSaveAllFields });
			}
			return true;
		}

		function bindManualSave(manualOptions = {}) {
			return bindManualSaveButton({
				$,
				document: options.document,
				apiCall: options.apiCall,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				setCurrentAppointmentId: options.setCurrentAppointmentId,
				getCurrentPatientId: options.getCurrentPatientId,
				autoSaveAllModalFields: autoSaveAllFields,
				showToast: options.showToast,
				...(options.manualSaveOptions || {}),
				...(manualOptions || {})
			});
		}

		function getBasicInfoSection() {
			if (options.basicInfoSection) return options.basicInfoSection;
			return variant === 'psychologist' ? 'tam_ly_gia_kham_form_kham' : 'bac_si_kham_form_kham';
		}

		function saveBasicInfo(saveOptions = {}) {
			return saveBasicExaminationInfoShell({
				$,
				document: options.document,
				apiCall: options.apiCall,
				console: logger,
				shouldSkip: saveOptions.shouldSkip || options.shouldSkipBasicInfo || options.shouldSkip,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				section: saveOptions.section || getBasicInfoSection(),
				showAutoSaveIndicator: options.showAutoSaveIndicator,
				afterSaveMainReason: saveOptions.afterSaveMainReason || options.afterSaveBasicMainReason,
				...(options.basicInfoOptions || {}),
				...(saveOptions || {})
			});
		}

		function initialize() {
			return initializeDetailModalAutosaveShell({
				$,
				document: options.document,
				readyTarget: options.readyTarget,
				clearDetailModalFields: options.clearDetailModalFields,
				setupAutoSaveFields,
				afterSetup: options.afterSetup
			});
		}

		return {
			autoSaveField,
			autoSaveAllFields,
			setupAutoSaveFields,
			bindManualSaveButton: bindManualSave,
			saveBasicInfo,
			initialize
		};
	}

	function bindManualSaveButton(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function' || typeof options.autoSaveAllModalFields !== 'function') return false;
		$(options.buttonSelector || '#examinationDetailSaveBtn').on('click', async function () {
			const appointmentId = await resolveCurrentAppointmentId(options);
			if (!appointmentId) {
				if (typeof options.showToast === 'function') {
					options.showToast('error', options.missingAppointmentMessage || 'Chưa chọn lượt khám. Vui lòng chọn bệnh nhân từ danh sách.');
				}
				return;
			}

			await options.autoSaveAllModalFields();
			syncDetailHistoryToMainForm({ $, ...options });
			hideDetailModal(options);
			if (typeof options.showToast === 'function') {
				options.showToast('success', options.successMessage || 'Đã lưu dữ liệu khám chi tiết.');
			}
		});
		return true;
	}

	function initializeDetailModalAutosaveShell(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return false;
		$(options.readyTarget || window.document).ready(function () {
			if (typeof options.clearDetailModalFields === 'function') {
				options.clearDetailModalFields();
			}
			if (typeof options.setupAutoSaveFields === 'function') {
				options.setupAutoSaveFields();
			}
			if (typeof options.afterSetup === 'function') {
				options.afterSetup();
			}
		});
		return true;
	}

	window.ClinicalExaminationDetailModalUtils = {
		DEFAULT_SUBSTANCE_IDS,
		DEFAULT_HISTORY_FIELDS,
		DEFAULT_GENERAL_TEXTAREAS,
		DEFAULT_MENTAL_TEXTAREAS,
		DEFAULT_MENTAL_FIELDS,
		DOCTOR_AUTOSAVE_FIELDS,
		PSYCHOLOGIST_AUTOSAVE_FIELDS,
		DOCTOR_MODAL_SECTION_MAPPINGS,
		PSYCHOLOGIST_MODAL_SECTION_MAPPINGS,
		DOCTOR_FORM_MODAL_LOAD_MAPPINGS,
		PSYCHOLOGIST_FORM_MODAL_LOAD_MAPPINGS,
		DOCTOR_MODAL_SAVE_SECTIONS,
		PSYCHOLOGIST_MODAL_SAVE_SECTIONS,
		clearFields,
		resetSubstanceUseFields,
		bindSubstanceTimeInputHandlers,
		collectSubstanceUseData,
		bindSubstanceUseSaveFields,
		populateSubstanceUseFields,
		bindAutoSaveFields,
		bindDoctorAutoSaveFields,
		bindPsychologistAutoSaveFields,
		resolveCurrentAppointmentId,
		syncDetailHistoryToMainForm,
		hideDetailModal,
		prefillDetailModalFromMainForm,
		populateDetailModalSections,
		buildModalSavePayload,
		applyModalDefaultAutofill,
		applyFieldDefaultAutofill,
		buildDoctorModalSavePayload,
		buildPsychologistModalSavePayload,
		applyDoctorModalDefaultAutofill,
		applyPsychologistModalDefaultAutofill,
		applyDoctorFieldDefaultAutofill,
		applyPsychologistFieldDefaultAutofill,
		loadDetailModalSections,
		loadDoctorDetailModalSections,
		loadPsychologistDetailModalSections,
		loadFormDetailSectionsFromModal,
		loadDoctorFormDetailSectionsFromModal,
		loadPsychologistFormDetailSectionsFromModal,
		loadMainReasonFromSection,
		populateMainReasonFromExamination,
		saveMainReasonToSection,
		saveBasicExaminationInfoShell,
		autoSaveDetailFieldShell,
		autoSaveAllDetailModalFieldsShell,
		createDetailModalAutosaveAdapter,
		bindManualSaveButton,
		initializeDetailModalAutosaveShell
	};
})(window);
