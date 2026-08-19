(function (window) {
	'use strict';

	const DEFAULT_NORMAL_VALUE = 'Không ghi nhận bất thường';
	const DEFAULT_GENERAL_FIELDS = ['circulation', 'digestive', 'renal_urogenital', 'musculoskeletal', 'ent', 'endocrine_nutrition_others', 'neurological'];
	const DEFAULT_MENTAL_FIELDS = ['orientation', 'emotions', 'perception', 'thought', 'behavior', 'memory', 'attention', 'intelligence'];

	function hasValue(value) {
		return typeof value === 'string' ? value.trim() !== '' : Boolean(value);
	}

	function includesField(fields, fieldId) {
		return Array.isArray(fields) && fields.includes(fieldId);
	}

	function getDefaultValueForExaminationField(fieldId, section, currentValue, options = {}) {
		if (hasValue(currentValue)) {
			return currentValue;
		}

		const mapSection = typeof options.mapSection === 'function' ? options.mapSection : value => value;
		const mappedSection = mapSection(section);
		const defaultValue = options.defaultValue || DEFAULT_NORMAL_VALUE;
		const generalFields = options.generalFields || DEFAULT_GENERAL_FIELDS;
		const mentalFields = options.mentalFields || DEFAULT_MENTAL_FIELDS;

		if (mappedSection === options.generalSection && includesField(generalFields, fieldId)) {
			return defaultValue;
		}

		if (mappedSection === options.mentalSection && includesField(mentalFields, fieldId)) {
			return defaultValue;
		}

		return currentValue || '';
	}

	function createExaminationFieldDefaultsAdapter(options = {}) {
		return {
			getDefaultValue(fieldId, section, currentValue, overrideOptions = {}) {
				return getDefaultValueForExaminationField(fieldId, section, currentValue, {
					...options,
					...overrideOptions
				});
			}
		};
	}

	window.ClinicalExaminationFieldDefaultsUtils = {
		DEFAULT_NORMAL_VALUE,
		DEFAULT_GENERAL_FIELDS,
		DEFAULT_MENTAL_FIELDS,
		getDefaultValueForExaminationField,
		createExaminationFieldDefaultsAdapter
	};
})(window);
