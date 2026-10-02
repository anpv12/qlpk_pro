const instances = {
	add: null,
	edit: null
};

function getRoot(fieldId) {
	const tags = document.getElementById(`${fieldId}Tags`);
	return tags?.closest('[data-icd-autocomplete]') || null;
}

function resolveIcdLimit(limit, query) {
	if (Number.isFinite(limit)) return limit;
	return query ? 100 : 30;
}

function loadICDData(query = '', options = {}) {
	const loader = window.ClinicalIcdDataLoader?.loadICDData;
	if (typeof loader !== 'function') return Promise.resolve([]);
	return loader(query, {
			limit: resolveIcdLimit(options.limit, query),
	});
}

function getInstance(mode) {
	return instances[mode] || null;
}

function setupICDMultiSelect(fieldId, mode) {
	if (getInstance(mode)) return getInstance(mode);
	const root = getRoot(fieldId);
	const Component = window.QLPKIcdAutocomplete;
	if (!root || typeof Component !== 'function') return null;

	instances[mode] = new Component(root, {
		multiple: true,
		selectionKey: 'id',
		limit: 100,
		emptyQueryLimit: 30
	});
	return instances[mode];
}

function initializeICDMultiSelect() {
	setupICDMultiSelect('addMedicalHistory', 'add');
	setupICDMultiSelect('editMedicalHistory', 'edit');
}

function renderICDOptions(container, mode, searchTerm = '') {
	const instance = getInstance(mode);
	if (!instance) return Promise.resolve();
	return instance.refresh(searchTerm);
}

function toggleICDSelection(icd, mode) {
	return Boolean(getInstance(mode)?.toggle(icd));
}

function updateSelectedICDTags(mode) {
	getInstance(mode)?.renderSelected();
}

function updateICDDropdown(mode) {
	const instance = getInstance(mode);
	if (instance) return instance.refresh(instance.input?.value || '');
	return Promise.resolve();
}

function getSelectedICDsString(mode) {
	return (getInstance(mode)?.getSelected() || [])
		.map(icd => `${icd.icd_code || ''} - ${icd.disease_name || ''}`.trim())
		.join('; ');
}

async function setSelectedICDsFromString(icdString, mode) {
	const instance = getInstance(mode);
	if (!instance) return;
	instance.setSelected([]);
	if (!icdString) return;

	let entries = [];
	if (Array.isArray(icdString)) {
		entries = icdString.map(entry => String(entry).trim()).filter(Boolean);
	} else if (typeof icdString === 'string') {
		entries = icdString.split(';').map(entry => entry.trim()).filter(Boolean);
	} else {
		entries = [String(icdString).trim()];
	}

	const selected = [];
	for (const entry of entries) {
		const [code, ...nameParts] = entry.split(' - ');
		if (!code || !nameParts.length) continue;
		const name = nameParts.join(' - ');
		const results = await loadICDData(code, { limit: 100 });
		const icd = results.find(item => item.icd_code === code && item.disease_name === name);
		if (icd) selected.push(icd);
	}
	instance.setSelected(selected);
}

function clearSelectedICDs(mode) {
	getInstance(mode)?.clear();
}

function getSelectedICDs(mode) {
	return getInstance(mode)?.getSelected() || [];
}

const AppointmentManagementIcdMultiselectUtils = {
	clearSelectedICDs,
	getInstance,
	getSelectedICDs,
	getSelectedICDsString,
	initializeICDMultiSelect,
	loadICDData,
	renderICDOptions,
	setSelectedICDsFromString,
	setupICDMultiSelect,
	toggleICDSelection,
	updateICDDropdown,
	updateSelectedICDTags
};

export { AppointmentManagementIcdMultiselectUtils };
