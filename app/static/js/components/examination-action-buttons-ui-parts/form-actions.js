import { RelativeTableManager } from '../../relative-table.js';

function resolveElement(elementOrId, fallbackId) {
	const target = elementOrId || fallbackId;
	if (!target) return null;
	return typeof target === 'string' ? document.getElementById(target) : target;
}
function getDocument(options = {}) {
	return options.document || window.document;
}
function getBootstrapApi() {
	if (window.bootstrap) return window.bootstrap;
	if (typeof bootstrap !== 'undefined') return bootstrap;
	return null;
}
function bindSaveInfoButton(buttonOrId, options = {}) {
	const button = resolveElement(buttonOrId, 'saveInfoBtn');
	if (!button || typeof options.save !== 'function') return null;
	button.addEventListener('click', function () {
		if (button.disabled) return;
		button.disabled = true;

		const reenableDelayMs = Number.isFinite(options.reenableDelayMs) ? options.reenableDelayMs : 2000;
		Promise.resolve(options.save()).finally(() => {
			setTimeout(() => {
				button.disabled = false;
			}, reenableDelayMs);
		});
	});
	return button;
}
function bindReExaminationSourceReset(checkboxOrId, options = {}) {
	const checkbox = resolveElement(checkboxOrId, 'reExaminationCheck');
	if (!checkbox) return null;
	checkbox.addEventListener('change', function () {
		if (this.checked) return;
		const originalAppointmentInput = resolveElement(options.originalAppointmentInput, 'originalAppointmentId');
		if (originalAppointmentInput) originalAppointmentInput.value = '';
	});
	return checkbox;
}
function openPersonalDetailSection(section, options = {}) {
	const openPersonalDetailModal = options.openPersonalDetailModal;
	if (typeof openPersonalDetailModal === 'function') {
		openPersonalDetailModal(section);
		return { status: 'opened', section, method: 'openPersonalDetailModal' };
	}

	if (section !== 'address') {
		return { status: 'missingOpener', section };
	}

	const loadAddressDataIntoModal = options.loadAddressDataIntoModal;
	if (typeof loadAddressDataIntoModal === 'function') {
		loadAddressDataIntoModal();
	}

	const modalEl = resolveElement(options.personalDetailModal, 'personalDetailModal');
	const bootstrapApi = options.bootstrapApi || getBootstrapApi();
	if (modalEl && bootstrapApi && bootstrapApi.Modal) {
		const modal = new bootstrapApi.Modal(modalEl);
		modal.show();
		return { status: 'opened', section, method: 'addressFallback' };
	}

	return { status: 'missingModal', section };
}
function bindPersonalDetailEditButtons(options = {}) {
	const bindings = options.bindings || {
		addressEditBtn: 'address',
		occupationEditBtn: 'occupation',
		genderEditBtn: 'gender',
		idCardEditBtn: 'identity'
	};
	return Object.keys(bindings).reduce((result, buttonId) => {
		const button = resolveElement(buttonId);
		if (!button || button._personalDetailEditBound) {
			result[buttonId] = button || null;
			return result;
		}
		const section = bindings[buttonId];
		button.addEventListener('click', () => openPersonalDetailSection(section, options));
		button._personalDetailEditBound = true;
		result[buttonId] = button;
		return result;
	}, {});
}
function initRelativeTable(options = {}) {
	const doc = getDocument(options);
	const container = resolveElement(options.container, null) || doc.querySelector(options.selector || '.relative-table-component');
	const manager = options.relativeTableManager || RelativeTableManager;
	if (!container || !manager || typeof manager.init !== 'function') return null;

	const instance = manager.init(container, {
		readOnly: false,
		...(options.tableOptions || {})
	});

	if (options.exposeGlobal !== false) {
		(options.window || window).relativeTableInstance = instance;
	}
	return instance;
}
function bindTabPrintButtons(options = {}) {
	const doc = getDocument(options);
	const printModalTab = options.printModalTabContent;
	if (typeof printModalTab !== 'function') return [];

	const buttons = Array.from(doc.querySelectorAll(options.selector || '.tab-print-btn'));
	buttons.forEach(button => {
		const boundFlag = options.boundFlag || '_tabPrintBound';
		if (button[boundFlag]) return;
		button.addEventListener('click', () => {
			const targetId = button.getAttribute(options.targetAttribute || 'data-print-target');
			if (targetId) printModalTab(targetId);
		});
		button[boundFlag] = true;
	});
	return buttons;
}
export { bindPersonalDetailEditButtons, bindReExaminationSourceReset, bindSaveInfoButton, bindTabPrintButtons, getBootstrapApi, getDocument, initRelativeTable, openPersonalDetailSection, resolveElement };
