(function (window, document) {
  'use strict';

  const REGISTRY = window.QLPKDoctorModuleRegistry;
  if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
  const getHistoryForm = () => REGISTRY.get('medicalHistoryForm')?.getActive?.();
	if (!getHistoryForm()) throw new Error('Thiếu medical history form component');
	const getMedicalHistoryAction = name => getHistoryForm()?.getAction(name);
	const callMedicalHistoryAction = (name, ...args) => {
		const action = getMedicalHistoryAction(name);
		return typeof action === 'function' ? action(...args) : undefined;
	};

	const getPageRuntime = () => getHistoryForm()?.config.pageRuntime;
	const HISTORY_MODES = getHistoryForm().config.historyModes;
	const ALL_ICD_MODES = ['diagnosis', 'benhKemTheo', 'physHistory', 'famHistory'];
	const MODE_CONFIG = getHistoryForm().config.modeConfig;
	const SUBSTANCE_IDS = getHistoryForm().config.substanceIds;

	const getAuthHeader = () => getPageRuntime()?.getAuthHeader?.() || '';
	const apiCall = (...args) => getPageRuntime()?.apiCall?.(...args);

	function isLoading() {
		return Boolean(getHistoryForm()?.isLoading?.());
	}

	function textValue(value) {
		if (value === undefined || value === null) return '';
		return String(value).trim();
	}

	function getElement(id) {
		return getHistoryForm()?.getElement(id);
	}

	function setElementValue(id, value) {
		const element = getElement(id);
		if (element) element.value = value === undefined || value === null ? '' : String(value);
	}

	function getModeConfig(mode) {
		return getHistoryForm()?.config.modeConfig[mode] || null;
	}

	function getIcdComponent(mode) {
		return getHistoryForm()?.state.components[mode] || null;
	}

	function ensureSelectedICDs() {
		const selected = {
			diagnosis: [],
			benhKemTheo: [],
			physHistory: getIcdComponent('physHistory')?.getSelected() || [],
			famHistory: getIcdComponent('famHistory')?.getSelected() || []
		};
		return selected;
	}

	function syncHistoryMode(mode) {
		if (getHistoryForm()?.state.suppressHistoryEmit) return;
		if (mode === 'physHistory') {
			callMedicalHistoryAction('serializeBanThan');
			callMedicalHistoryAction('emitBanThanChange');
		}
		if (mode === 'famHistory') {
			callMedicalHistoryAction('serializeGiaDinh');
			callMedicalHistoryAction('emitGiaDinhChange');
		}
	}

	function getHistoryTagClass(mode, item) {
		const classes = ['medical-history-chip'];
		if (mode === 'famHistory') classes.push('medical-history-chip--gd');
		if (mode === 'physHistory' && callMedicalHistoryAction('isSuicideIcd', item?.icd_code)) {
			classes.push('medical-history-chip-suicide');
		}
		return classes.join(' ');
	}

	function getHistoryTagLabel(item) {
		const code = textValue(item?.icd_code) || (item?.id != null ? `ICD #${item.id}` : '');
		const name = item?.unresolved ? 'Chưa tải được thông tin ICD' : textValue(item?.disease_name);
		return `${code}${name ? ' – ' + name : ''}`;
	}

	function setupICDMultiSelect(fieldId, mode) {
		const config = getModeConfig(mode);
		const Component = REGISTRY.require('icdAutocomplete');
		if (!config) return false;
		if (getIcdComponent(mode)) return true;
		const container = getElement(config.containerId);
		const root = container?.closest('[data-icd-autocomplete]');
		if (!root) return false;

		getHistoryForm().state.components[mode] = new Component(root, {
			multiple: true,
			selectionKey: 'code',
			getAuthHeader,
			tagClassName: item => getHistoryTagClass(mode, item),
			tagLabel: getHistoryTagLabel,
			onChange: (_selected, context) => {
				if (context.action === 'remove') {
					if (mode === 'physHistory') callMedicalHistoryAction('syncPhysHistoryRemove', context.item?.icd_code);
					if (mode === 'famHistory') callMedicalHistoryAction('syncFamHistoryRemove', context.item?.icd_code);
				}
				syncHistoryMode(mode);
				callMedicalHistoryAction('updateWorkbenchSummary');
			}
		});
		return true;
	}

	function loadICDData(query = '') {
		return REGISTRY.require('icdDataLoader').loadICDData(query, {
			getAuthHeader,
			missingTokenMessage: 'Không tìm thấy token để tải danh mục ICD.'
		});
	}

	function renderICDOptions(container, mode, query = '') {
		const component = getIcdComponent(mode);
		return component ? component.refresh(query) : Promise.resolve();
	}

	function updateSelectedICDTags(mode) {
		const component = getIcdComponent(mode);
		if (!component) return false;
		component.renderSelected();
		callMedicalHistoryAction('updateWorkbenchSummary');
		return true;
	}

	function clearSelectedICD(mode) {
		const component = getIcdComponent(mode);
		if (!component) return false;
		component.clear();
		return true;
	}

	function parseCanonicalHistoryEntries(value) {
		if (Array.isArray(value)) return value;
		if (typeof value !== 'string') return [];
		const raw = value.trim();
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (error) {
			return [];
		}
	}

	function createUnresolvedIcd(id) {
		return {
			id,
			icd_code: '',
			disease_name: '',
			unresolved: true
		};
	}

	async function loadIcdsByIds(ids, isCurrentLoad) {
		const requestedIds = [...new Set(ids.filter(id => Number.isInteger(id) && id > 0))];
		if (!requestedIds.length) return [];
		const unresolved = () => requestedIds.map(createUnresolvedIcd);
		try {
			const response = await apiCall(`/api/icd/?ids=${encodeURIComponent(requestedIds.join(','))}&limit=1000`);
			if (!isCurrentLoad()) return [];
			if (!response || !response.ok) return unresolved();
			const payload = await response.json();
			if (!isCurrentLoad()) return [];
			const loaded = Array.isArray(payload.data) ? payload.data : [];
			const byId = new Map(loaded.map(item => [Number(item.id), item]));
			return requestedIds.map(id => byId.get(id) || createUnresolvedIcd(id));
		} catch (error) {
			return isCurrentLoad() ? unresolved() : [];
		}
	}

	async function restoreSelectedHistory(value, mode, options = {}) {
		const config = getModeConfig(mode);
		const component = getIcdComponent(mode);
		if (!config || !component) return false;
		const isCurrentLoad = typeof options.isCurrentLoad === 'function' ? options.isCurrentLoad : () => true;
		if (!isCurrentLoad()) return false;

		const entries = parseCanonicalHistoryEntries(value);
		const icdIds = [];
		const textEntries = [];
		entries.forEach(entry => {
			if (!entry) return;
			if (entry.type === 'icd' && entry.id !== undefined && entry.id !== null) {
				const id = Number(entry.id);
				if (Number.isInteger(id) && id > 0) icdIds.push(id);
			} else if (entry.type === 'text' && entry.value) {
				textEntries.push(entry.value);
			}
		});

		const loadedIcds = await loadIcdsByIds(icdIds, isCurrentLoad);
		if (!isCurrentLoad()) return false;
		component.setSelected(loadedIcds);
		setElementValue(config.textInputId, textEntries.join(', '));
		updateSelectedICDTags(mode);
		syncHistoryMode(mode);
		return true;
	}

	function toggleICDSelection(icd, mode) {
		const component = getIcdComponent(mode);
		return Boolean(component && component.toggle(icd));
	}

	const INTERNAL = {
		get PAGE_RUNTIME() { return getPageRuntime(); },
		HISTORY_MODES,
		ALL_ICD_MODES,
		MODE_CONFIG,
		SUBSTANCE_IDS,
		get state() { return getHistoryForm()?.state; },
		getSelectedICDs: ensureSelectedICDs,
		getAuthHeader,
		apiCall,
		isLoading,
		textValue,
		getElement,
		setElementValue,
		ensureSelectedICDs,
		getModeConfig,
		parseCanonicalHistoryEntries,
		loadICDData,
		setupICDMultiSelect,
		renderICDOptions,
		updateSelectedICDTags,
		clearSelectedICD,
		loadIcdsByIds,
		restoreSelectedHistory,
		toggleICDSelection
	};
	getHistoryForm().registerFeature('icd', INTERNAL);
	getHistoryForm().registerActions({
		ensureSelectedICDs,
		setupICDMultiSelect,
		renderICDOptions,
		updateSelectedICDTags,
		clearSelectedICD,
		restoreSelectedHistory,
		toggleICDSelection,
		getSelectedICDs: ensureSelectedICDs
	});
})(window, document);
