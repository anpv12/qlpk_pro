(function (window) {
	'use strict';

	const ALLERGY_LEVEL_LABELS = {
		nghi_ngo: 'Nghi ngờ',
		chac_chan: 'Chắc chắn'
	};

	function normalizeText(value) {
		return String(value || '').trim();
	}

	function normalizeAllergyEntries(value) {
		if (Array.isArray(value)) {
			return value.map(entry => ({
				name: normalizeText(entry?.name),
				level: normalizeText(entry?.level).toLowerCase(),
				symptom: normalizeText(entry?.symptom)
			})).filter(entry => entry.name);
		}

		return normalizeText(value)
			.split(/\s*;\s*|\r?\n/)
			.map(entry => {
				const parts = entry.split('|').map(part => part.trim());
				return {
					name: parts[0] || '',
					level: (parts[1] || '').toLowerCase(),
					symptom: parts.slice(2).join(' - ').trim()
				};
			})
			.filter(entry => entry.name);
	}

	function formatAllergyEntry(entry) {
		const allergen = normalizeText(entry?.name);
		const level = normalizeText(entry?.level).toLowerCase();
		const symptom = normalizeText(entry?.symptom);
		const levelLabel = ALLERGY_LEVEL_LABELS[level] || '';

		if (!allergen) return '';

		const display = levelLabel ? `${levelLabel}: ${allergen}` : allergen;
		return symptom ? `${display} - ${symptom}` : display;
	}

	function formatAllergiesForTextarea(value) {
		return normalizeAllergyEntries(value)
			.map(formatAllergyEntry)
			.filter(Boolean)
			.join('\n');
	}

	function setFieldValue($field, rawValue) {
		if (!$field || !$field.length) return;

		const canonicalAllergies = normalizeAllergyEntries(rawValue);
		const formattedAllergies = formatAllergiesForTextarea(canonicalAllergies);
		$field
			.val(formattedAllergies)
			.data('canonicalAllergies', canonicalAllergies)
			.data('formattedAllergies', formattedAllergies);
	}

	function clearFieldValue($field) {
		if (!$field || !$field.length) return;
		$field
			.val('')
			.removeData('canonicalAllergies')
			.removeData('formattedAllergies');
	}

	function getSubmitValue($field) {
		if (!$field || !$field.length) return '';

		const currentValue = normalizeText($field.val());
		const canonicalAllergies = $field.data('canonicalAllergies');
		const formattedAllergies = normalizeText($field.data('formattedAllergies'));

		if (Array.isArray(canonicalAllergies) && currentValue === formattedAllergies) {
			return canonicalAllergies;
		}

		return normalizeAllergyEntries(currentValue);
	}

	window.AppointmentManagementAllergyFormatUtils = {
		normalizeAllergyEntries,
		formatAllergiesForTextarea,
		formatAllergyEntry,
		setFieldValue,
		clearFieldValue,
		getSubmitValue
	};
})(window);
