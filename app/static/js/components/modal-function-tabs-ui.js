import { emptyState } from '../shared/empty-state.js';
import { MedicalRecordHistoryTabUi } from './medical-record-history-tab-ui.js';
import { PrescriptionHistoryTabUi } from './prescription-history-tab-ui.js';
import { ServiceHistoryTabUi } from './service-history-tab-ui.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const TAB_CONFIG = {
	prescription: {
		tabId: 'prescription-tab',
		contentId: 'modalContentArea',
		loadingText: 'Đang tải toa thuốc...'
	},
	services: {
		tabId: 'services-tab',
		contentId: 'servicesContentArea',
		loadingText: 'Đang tải dữ liệu dịch vụ...'
	},
	medicalRecord: {
		tabId: 'medical-record-tab',
		contentId: 'medicalRecordContentArea',
		loadingText: 'Đang tải dữ liệu bệnh án...'
	},
	medicalRecordTlg: {
		tabId: 'medical-record-tlg-tab',
		contentId: 'medicalRecordTLGContentArea',
		loadingText: 'Đang tải dữ liệu bệnh án TLG...'
	},
	vitalSigns: {
		tabId: 'vital-signs-tab'
	}
};

const TAB_ID_TO_KEY = Object.keys(TAB_CONFIG).reduce((acc, key) => {
	acc[TAB_CONFIG[key].tabId] = key;
	return acc;
}, {});

function getTabId(tab) {
	if (!tab) return '';
	return typeof tab === 'string' ? tab : tab.id || '';
}

function resolveElement(elementOrId) {
	if (!elementOrId) return null;
	return typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
}

function getTabKey(tab) {
	return TAB_ID_TO_KEY[getTabId(tab)] || null;
}

function getTabContentElement(key) {
	const config = TAB_CONFIG[key];
	return config && config.contentId ? document.getElementById(config.contentId) : null;
}

function getActiveTab(selector = '#modalFunctionTabs .nav-link.active') {
	return document.querySelector(selector);
}

function buildLoading(text) {
	return emptyState({ modifiers: ['loading'], spinner: true, title: text });
}

function buildTabError(message) {
	return emptyState({ modifiers: ['error'], icon: 'bi-exclamation-triangle', title: 'Không tải được dữ liệu tab', description: message ?? '' });
}

function renderTabError(tabKey, message) {
	const container = getTabContentElement(tabKey);
	if (container) container.replaceChildren(buildTabError(message));
	console.error(`[ModalFunctionTabsUi] ${tabKey}: ${message}`);
	return { state: 'dependencyError', key: tabKey, error: message };
}

function clearHistoryTabContent(options = {}) {
	const state = options.state || 'noPatient';
	Object.keys(TAB_CONFIG).forEach(key => {
		if (key === 'vitalSigns') return;
		const container = getTabContentElement(key);
		if (!container) return;
		container.replaceChildren(state === 'loading'
			? buildLoading(TAB_CONFIG[key].loadingText)
			: emptyState({ icon: 'bi-person', title: 'Chọn bệnh nhân để xem dữ liệu' }));
	});
	if (typeof options.onVitalSigns === 'function') options.onVitalSigns();
	return { handled: true, state };
}

function renderTabLoading(tab, options = {}) {
	const key = getTabKey(tab);
	if (!key) return { handled: false, key: null };

	if (key === 'vitalSigns') {
		if (typeof options.onVitalSigns === 'function') {
			options.onVitalSigns();
		}
		return { handled: true, key };
	}

	const config = TAB_CONFIG[key];
	const container = getTabContentElement(key);
	if (!container) return { handled: false, key };

	container.replaceChildren(buildLoading(config.loadingText));
	return { handled: true, key };
}

function renderActiveTabLoading(options = {}) {
	return renderTabLoading(options.activeTab || getActiveTab(options.selector), options);
}

function dispatchTabRender(tab, renderers = {}) {
	const key = getTabKey(tab);
	const renderer = key ? renderers[key] : null;
	if (typeof renderer !== 'function') {
		return { handled: false, key };
	}

	try {
		const result = renderer();
		if (result && typeof result.catch === 'function') {
			result.catch(error => console.error(`[ModalFunctionTabsUi] render ${key} failed:`, error));
		}
	} catch (error) {
		console.error(`[ModalFunctionTabsUi] render ${key} failed:`, error);
	}
	return { handled: true, key };
}

function dispatchActiveTabRender(options = {}) {
	return dispatchTabRender(
		options.activeTab || getActiveTab(options.selector),
		options.renderers || {}
	);
}

function dispatchPatientTabContent(options = {}) {
	if (!options.patient) {
		return { handled: false, key: null, skipped: true };
	}
	return dispatchActiveTabRender(options);
}

function createHistoryTabRenderers(options = {}) {
	return {
		prescription: options.prescription,
		services: options.services,
		medicalRecord: options.medicalRecord,
		medicalRecordTlg: options.medicalRecordTlg
	};
}

function buildHistoryTabState(options = {}) {
	return {
		patient: options.patient || null,
		isHistoryLoading: Boolean(options.isHistoryLoading),
		histories: Array.isArray(options.histories) ? options.histories : [],
		selectedIndex: options.selectedIndex,
		contextRevision: options.contextRevision || 0
	};
}

function buildHistoryTabBaseOptions(options = {}) {
	const container = options.container || getTabContentElement(options.tabKey);
	if (!container) return null;
	return {
		container,
		...(options.state || {}),
		...(options.dataFetchers || {})
	};
}

function buildHistoryTabDataFetchers(options = {}) {
	return {
		fetchPatientDetail: options.fetchPatientDetail,
		fetchExaminationDetail: options.fetchExaminationDetail,
		fetchSectionDetails: options.fetchSectionDetails,
		fetchPrescription: options.fetchPrescription,
		fetchPrescriptionForAppointment: options.fetchPrescriptionForAppointment || options.fetchPrescription,
		fetchAppointment: options.fetchAppointment,
		fetchRelatives: options.fetchRelatives
	};
}

function createConsoleErrorHandler(message) {
	return function handleConsoleError(error) {
		console.error(message, error);
	};
}

function buildHistoryTabErrorHandlers(messages = {}) {
	const defaults = {
		services: 'Error loading services tab:',
		medicalRecord: 'Error loading medical record tab:',
		medicalRecordTlg: 'Error loading medical record TLG tab:',
		prescription: 'Error loading prescription tab:'
	};

	return Object.keys(defaults).reduce((handlers, key) => {
		handlers[key] = createConsoleErrorHandler(messages[key] || defaults[key]);
		return handlers;
	}, {});
}

function createHistoryTabContext(options = {}) {
	const getStateOptions = typeof options.getState === 'function'
		? options.getState
		: () => options.state || {};
	const dataFetchers = options.dataFetchers || buildHistoryTabDataFetchers(options);
	const errorHandlers = options.errorHandlers || buildHistoryTabErrorHandlers(options.errorMessages);

	function getState() {
		return buildHistoryTabState(getStateOptions() || {});
	}

	function getBaseOptions(tabKey) {
		const state = getState();
		const selectedHistory = state.histories[state.selectedIndex] || null;
		return buildHistoryTabBaseOptions({
			tabKey,
			state,
			dataFetchers: {
				...dataFetchers,
				isContextCurrent: () => {
					const current = getState();
					const currentHistory = current.histories[current.selectedIndex] || null;
					return current.contextRevision === state.contextRevision
						&& Number(current.patient?.id) === Number(state.patient?.id)
						&& Number(currentHistory?.id || 0) === Number(selectedHistory?.id || 0)
						&& current.selectedIndex === state.selectedIndex;
				}
			}
		});
	}

	return {
		getState,
		getBaseOptions,
		dataFetchers,
		errorHandlers
	};
}

async function renderServiceHistoryTab(options = {}) {
	const tabOptions = options.context && options.context.getBaseOptions
		? options.context.getBaseOptions('services')
		: null;
	if (!tabOptions) return renderTabError('services', 'Thiếu context dữ liệu lịch sử dịch vụ.');
	if (!ServiceHistoryTabUi) return renderTabError('services', 'Không thể hiển thị dịch vụ. Vui lòng tải lại trang.');

	return ServiceHistoryTabUi.renderTab({
		...tabOptions,
		fetchServicesForAppointment: options.fetchServicesForAppointment,
		buildServiceInvoiceHTML: options.buildServiceInvoiceHTML,
		getClinicInfoConfig: options.getClinicInfoConfig,
		createBarcodesInElement: options.createBarcodesInElement,
		onError: options.onError || options.context.errorHandlers.services
	});
}

async function renderMedicalRecordHistoryTab(options = {}) {
	const tabKey = options.tabKey || 'medicalRecord';
	const tabOptions = options.context && options.context.getBaseOptions
		? options.context.getBaseOptions(tabKey)
		: null;
	if (!tabOptions) return renderTabError(tabKey, 'Thiếu context dữ liệu bệnh án.');
	if (!MedicalRecordHistoryTabUi) return renderTabError(tabKey, 'Không thể hiển thị bệnh án. Vui lòng tải lại trang.');

	return MedicalRecordHistoryTabUi.renderTab({
		...tabOptions,
		recordLabel: options.recordLabel,
		...(options.appointmentFetchers || {}),
		buildMedicalRecordHTML: options.buildMedicalRecordHTML,
		getClinicInfoConfig: options.getClinicInfoConfig,
		role: options.role,
		createBarcodesInElement: options.createBarcodesInElement,
		onError: options.onError || options.context.errorHandlers[tabKey]
	});
}

async function renderPrescriptionHistoryTab(options = {}) {
	const tabOptions = options.context && options.context.getBaseOptions
		? options.context.getBaseOptions('prescription')
		: null;
	if (!tabOptions) return renderTabError('prescription', 'Thiếu context dữ liệu toa thuốc.');
	if (!PrescriptionHistoryTabUi) return renderTabError('prescription', 'Không thể hiển thị đơn thuốc. Vui lòng tải lại trang.');

	return PrescriptionHistoryTabUi.renderTab({
		...tabOptions,
		...(options.appointmentFetchers || {}),
		setupPrescriptionTabPagination: options.setupPrescriptionTabPagination,
		getClinicInfoConfig: options.getClinicInfoConfig,
		onError: options.onError || options.context.errorHandlers.prescription
	});
}

function createHistoryTabRendererSet(options = {}) {
	const context = options.context;
	const appointmentFetchers = options.appointmentFetchers || {};
	const prescriptionAppointmentFetchers = options.prescriptionAppointmentFetchers || appointmentFetchers;

	return createHistoryTabRenderers({
		services: () => renderServiceHistoryTab({
			context,
			fetchServicesForAppointment: options.fetchServicesForAppointment,
			buildServiceInvoiceHTML: options.buildServiceInvoiceHTML,
			getClinicInfoConfig: options.getClinicInfoConfig,
			createBarcodesInElement: options.createBarcodesInElement
		}),
		medicalRecord: () => renderMedicalRecordHistoryTab({
			context,
			tabKey: 'medicalRecord',
			recordLabel: options.medicalRecordLabel || 'bệnh án',
			appointmentFetchers,
			buildMedicalRecordHTML: options.buildMedicalRecordHTML,
			getClinicInfoConfig: options.getClinicInfoConfig,
			role: options.medicalRecordRole || 'doctor',
			createBarcodesInElement: options.createBarcodesInElement
		}),
		medicalRecordTlg: () => renderMedicalRecordHistoryTab({
			context,
			tabKey: 'medicalRecordTlg',
			recordLabel: options.medicalRecordTlgLabel || 'bệnh án TLG',
			appointmentFetchers,
			buildMedicalRecordHTML: options.buildMedicalRecordHTML,
			getClinicInfoConfig: options.getClinicInfoConfig,
			role: options.medicalRecordTlgRole || 'psychologist',
			createBarcodesInElement: options.createBarcodesInElement
		}),
		prescription: () => renderPrescriptionHistoryTab({
			context,
			appointmentFetchers: prescriptionAppointmentFetchers,
			setupPrescriptionTabPagination: options.setupPrescriptionTabPagination,
			getClinicInfoConfig: options.getClinicInfoConfig
		})
	});
}

function bindShownTabEvents(containerOrId, onShown, options = {}) {
	const container = resolveElement(containerOrId || 'modalFunctionTabs');
	if (!container || typeof onShown !== 'function') return null;
	container.querySelectorAll(options.linkSelector || '.nav-link').forEach(link => {
		link.addEventListener('shown.bs.tab', event => onShown(event, link));
	});
	return container;
}

const api = {
	TAB_CONFIG,
	getTabId,
	resolveElement,
	getTabKey,
	getTabContentElement,
	getActiveTab,
	buildLoading,
	buildTabError,
	renderTabError,
	clearHistoryTabContent,
	renderTabLoading,
	renderActiveTabLoading,
	dispatchTabRender,
	dispatchActiveTabRender,
	dispatchPatientTabContent,
	createHistoryTabRenderers,
	buildHistoryTabState,
	buildHistoryTabBaseOptions,
	buildHistoryTabDataFetchers,
	createConsoleErrorHandler,
	buildHistoryTabErrorHandlers,
	createHistoryTabContext,
	renderServiceHistoryTab,
	renderMedicalRecordHistoryTab,
	renderPrescriptionHistoryTab,
	createHistoryTabRendererSet,
	bindShownTabEvents
};
export const ModalFunctionTabsUi = Object.freeze(api);
QLPKDoctorModuleRegistry.register('modalFunctionTabsUi', ModalFunctionTabsUi);
