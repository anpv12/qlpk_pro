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

// Canonical entries shown in a textarea; submit sends them back unchanged unless the text was edited.
const fieldEntries = new WeakMap();

function setFieldValue(field, rawValue) {
	if (!field) return;
	const canonicalAllergies = normalizeAllergyEntries(rawValue);
	const formattedAllergies = formatAllergiesForTextarea(canonicalAllergies);
	field.value = formattedAllergies;
	fieldEntries.set(field, { canonicalAllergies, formattedAllergies });
}

function clearFieldValue(field) {
	if (!field) return;
	field.value = '';
	fieldEntries.delete(field);
}

function getSubmitValue(field) {
	if (!field) return '';
	const currentValue = normalizeText(field.value);
	const stored = fieldEntries.get(field);
	if (stored && currentValue === normalizeText(stored.formattedAllergies)) return stored.canonicalAllergies;
	return normalizeAllergyEntries(currentValue);
}

const AppointmentManagementAllergyFormatUtils = {
	normalizeAllergyEntries,
	formatAllergiesForTextarea,
	formatAllergyEntry,
	setFieldValue,
	clearFieldValue,
	getSubmitValue
};

export { AppointmentManagementAllergyFormatUtils };
