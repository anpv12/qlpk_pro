(function (window) {
	'use strict';

	const DEFAULT_TEXTAREA_FIELDS = ['examDetailMedicalHistory', 'examMentalGeneralManifestations', 'examDetailGeneralExamination'];

	function clearValueFields($, fieldIds = []) {
		fieldIds.forEach(fieldId => {
			$(`#${fieldId}`).val('');
		});
	}

	function resetDomFields(document, fieldIds = []) {
		fieldIds.forEach(fieldId => {
			const element = document.getElementById(fieldId);
			if (!element) return;
			if (element.type === 'checkbox') {
				element.checked = false;
			} else if (element.tagName === 'SELECT') {
				element.selectedIndex = 0;
			} else {
				element.value = '';
			}
		});
	}

	function clearTextareaFields(textareaIds = [], setTextareaValue) {
		textareaIds.forEach(fieldId => {
			setTextareaValue(fieldId, '');
		});
	}

	function clearDiagnosisInput($, options = {}) {
		const selector = options.diagnosisSelector || '#diagnosis';
		const autocomplete = options.diagnosisAutocomplete;
		if (autocomplete && typeof autocomplete.clear === 'function') {
			try {
				autocomplete.clear();
				return;
			} catch (_) {
				$(selector).val('');
				return;
			}
		}
		$(selector).val('');
	}

	function clearIcdState($, options = {}) {
		const selectedICDs = options.selectedICDs;
		const modes = options.modes || [];
		if (selectedICDs) {
			modes.forEach(mode => {
				selectedICDs[mode] = [];
			});
		}

		try {
			if (typeof options.updateSelectedICDTags === 'function') {
				modes.forEach(mode => options.updateSelectedICDTags(mode));
			}
		} catch (_) {
			(options.fallbackEmptySelectors || []).forEach(selector => $(selector).empty());
			if (options.placeholderSelector) {
				$(options.placeholderSelector).show();
			}
		}
	}

	function clearExaminationNewLayoutFields(options = {}) {
		const $ = options.$ || window.jQuery || window.$;
		if (typeof $ !== 'function') return false;

		const setTextareaValue = typeof options.setTextareaValue === 'function'
			? options.setTextareaValue
			: (fieldId, value) => $(`#${fieldId}`).val(value);

		clearValueFields($, options.valueFields || []);
		clearTextareaFields(options.textareaFields || DEFAULT_TEXTAREA_FIELDS, setTextareaValue);

		if (options.clearDiagnosis !== false) {
			clearDiagnosisInput($, options);
		}

		if (options.icdState) {
			clearIcdState($, options.icdState);
		}

		(options.extraClearSelectors || []).forEach(selector => $(selector).val(''));
		return true;
	}

	function resetExaminationFormToDefault(options = {}) {
		const doc = options.document || window.document;
		resetDomFields(doc, options.resetFields || []);

		if (typeof options.afterResetFields === 'function') {
			options.afterResetFields();
		}

		if (typeof options.clearDetailModalFields === 'function') {
			options.clearDetailModalFields();
		}

		const storage = options.localStorage || window.localStorage;
		if (storage && typeof storage.removeItem === 'function') {
			storage.removeItem(options.storageKey || 'examinationData');
		}
		return true;
	}

	function resolveConfigOptions(config, key) {
		const getter = config[`get${key}`];
		if (typeof getter === 'function') {
			return getter() || {};
		}
		const lowerKey = key.charAt(0).toLowerCase() + key.slice(1);
		return config[key] || config[lowerKey] || {};
	}

	function createExaminationFormClearAdapter(config = {}) {
		function clearDetailModalFields(options = {}) {
			const detailUtils = options.detailModalUtils || config.detailModalUtils || window.ClinicalExaminationDetailModalUtils;
			if (!detailUtils || typeof detailUtils.clearFields !== 'function') return false;
			return detailUtils.clearFields({
				$: options.$ || config.$,
				setTextareaValue: options.setTextareaValue || config.setTextareaValue,
				...resolveConfigOptions(config, 'DetailModalOptions'),
				...(options.detailModalOptions || {})
			});
		}

		function clearNewLayoutFields(options = {}) {
			return clearExaminationNewLayoutFields({
				$: options.$ || config.$,
				setTextareaValue: options.setTextareaValue || config.setTextareaValue,
				...resolveConfigOptions(config, 'ClearNewLayoutOptions'),
				...(options.clearNewLayoutOptions || {})
			});
		}

		function resetToDefault(options = {}) {
			const result = resetExaminationFormToDefault({
				document: options.document || config.document,
				localStorage: options.localStorage || config.localStorage,
				...resolveConfigOptions(config, 'ResetOptions'),
				...(options.resetOptions || {}),
				clearDetailModalFields
			});

			if (typeof config.afterResetToDefault === 'function') {
				config.afterResetToDefault(result);
			}
			return result;
		}

		return {
			resetToDefault,
			clearNewLayoutFields,
			clearDetailModalFields
		};
	}

	function createPsychologistExaminationFormClearAdapter(config = {}) {
		return createExaminationFormClearAdapter({
			...config,
			resetOptions: {
				resetFields: ['examinationMainReason', 'treatmentPlan'],
				afterResetFields: () => {
					const jquery = config.$ || window.$ || window.jQuery;
					if (typeof jquery === 'function') {
						jquery('#diagnosis').val('');
						jquery('#benhKemTheo').val('');
					}
				}
			},
			clearNewLayoutOptions: {
				valueFields: ['examinationMainReason', 'treatmentPlan', 'benhKemTheo']
			}
		});
	}

	window.ClinicalExaminationFormClearUtils = {
		DEFAULT_TEXTAREA_FIELDS,
		clearExaminationNewLayoutFields,
		resetExaminationFormToDefault,
		createExaminationFormClearAdapter,
		createPsychologistExaminationFormClearAdapter
	};
})(window);
