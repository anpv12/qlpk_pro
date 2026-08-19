// Psychologist Examination - New Layout

// Global variables
let currentPatientId = null;
let psychologistRelativeTableInstance = null;
const pageCoreAdapter = window.ClinicalPageCoreUtils.createPageCoreAdapter({
	document,
	window,
	localStorage,
	sessionStorage,
	setLocalPatientId: nextValue => { currentPatientId = nextValue; },
	updateNotesAttachmentCount: () => documentSectionAdapter.updateNotesAttachmentCount(),
	loadAttachmentsForCurrentPatient: () => documentSectionAdapter.loadAttachmentsForCurrentPatient(),
	getCurrentAppointmentId: () => currentAppointmentId,
	getCurrentPatientId: () => currentPatientId,
	setCurrentAppointmentId: nextValue => { currentAppointmentId = nextValue; },
	currentPage: () => currentPage,
	perPage: () => perPage,
	totalPages: () => totalPages,
	totalItems: () => allAppointments.length,
	autoSaveIndicatorOptions: { savingIconClass: 'bi-hourglass-split' }
});

// Debug function to track currentPatientId changes
const setCurrentPatientId = pageCoreAdapter.setCurrentPatientId;
let currentAppointmentId = null;
let allAppointments = [];
let currentPage = 1;
let perPage = 50;
let totalPages = 1;
let currentStatus = 'psychologist_exam';
let isFormLocked = false;
let patientSearchQuery = ''; // Từ khóa tìm kiếm bệnh nhân
let isLoadingExaminationData = false; // Flag để tạm tắt auto save khi đang load dữ liệu

let isLoadingAppointmentServices = false;
let isSyncingAppointmentServices = false;
let serviceSyncDebounceTimer = null;
const SERVICE_SYNC_DEBOUNCE_MS = 1000;
let ordersAutoSaveTimer = null;
const ORDERS_AUTO_SAVE_DEBOUNCE_MS = 1500;

const servicesTabCache = new Map();

// Cache cho prescription tab
const prescriptionTabCache = {
	patient: new Map(),
	examination: new Map(),
	prescription: new Map(),
	examinationDetails: new Map() // Cache cho examination details by section
};

const orderCatalogState = {
	items: [],
	treeRoots: [],
	surveyTemplates: [], // Danh sách mẫu khảo sát tâm lý
	isLoading: false,
	fetched: false,
	expandedNodes: new Set(),
	selectedOrders: [],
	orderIndex: new Map(),
	editingOrderId: null,
	nextOrderTempId: 1,
	formData: null
};

const psychologistOrderPageBridge = window.ClinicalOrderPageBridgeUtils.createOrderPageBridge('psychologist');

// Helpers
const psychologistCoreUtils = window.PsychologistExaminationCoreUtils;
if (!psychologistCoreUtils) {
	throw new Error('PsychologistExaminationCoreUtils is not loaded');
}

const escapeHtml = psychologistCoreUtils.escapeHtml;
const formatDateInput = psychologistCoreUtils.formatDateInput;
const formatDisplayDate = psychologistCoreUtils.formatDisplayDate;
const psychologistGetExaminationStatusText = psychologistCoreUtils.getExaminationStatusText;
const psychologistGetExaminationStatusBadgeClass = psychologistCoreUtils.getExaminationStatusBadgeClass;
const psychologistExaminationDataLoadFlowUtils = window.PsychologistExaminationDataLoadFlowUtils;

const orderSelectedTableAdapter = psychologistOrderPageBridge.getSelectedTableUiUtils().createSelectedOrdersTableAdapter({
	document,
	escapeHtml,
	formatDisplayDate,
	getOrderStatusConfig: value => psychologistOrderPageBridge.getOrderStatusConfig(value),
	showSurveyBadge: true,
	renderPrintPreview: () => orderPrintAdapter.renderOrderPrintPreview()
});

// buildSelectOptions() — di dời sang patient-search-modal-dry.js
// getClinicInfoConfig() — di dời sang patient-search-modal-dry.js
// formatVietnamDate() — di dời sang patient-search-modal-dry.js
// calculateDetailedAge() — di dời sang patient-search-modal-dry.js
// formatGenderDisplay() — di dời sang patient-search-modal-dry.js
// formatMaritalStatusDisplay() — di dời sang patient-search-modal-dry.js
// formatCurrency() — di dời sang patient-search-modal-dry.js

// updateServiceAmountDisplayFromValue() — di dời sang patient-search-modal-dry.js

// SessionStorage keys for data preservation (same as receptionist)
const PAGE_LOAD_ID_KEY = 'qlpk_page_load_id';
const ADDRESS_DRAFT_KEY = 'qlpk_address_draft';
const MEDICAL_DRAFT_KEY = 'qlpk_medical_draft';
const DOCUMENT_DRAFT_KEY = 'qlpk_document_draft';

const addressDraftAdapter = window.ClinicalAddressDraftUtils.createAddressDraftAdapter({
	document,
	sessionStorage,
	pageLoadIdKey: PAGE_LOAD_ID_KEY,
	addressDraftKey: ADDRESS_DRAFT_KEY
});

// Zone 1 & 4 variables
// Removed unused variables: searchResults, selectedPatient, recentPatients, currentQueueNumber, waitingCount

// Form handling variables
let currentEditId = null;
let isSubmitting = false;
let allDoctors = [];
let allServices = [];
let allPackages = [];
let systemServicesLoaded = false;
let systemServicesLoading = false;
let systemServicesSearchKeyword = '';
let systemServicesPage = 1;
const SYSTEM_SERVICES_PER_PAGE = 5;
let systemServicesTotal = 0;
let systemServicesTotalPages = 1;

const getAuthHeader = pageCoreAdapter.getAuthHeader;

const addressHierarchyAdapter = window.ClinicalAddressHierarchyUtils.createAddressHierarchyAdapter({
	document,
	apiCall,
	console,
	encodeURIComponent
});

// Save/load address data from sessionStorage
const saveAddressDraftToCache = () => addressDraftAdapter.saveAddressDraftToCache();
const loadAddressDraftFromCache = () => addressDraftAdapter.loadAddressDraftFromCache();

// API call wrapper với Authorization tự động
function apiCall(url, options = {}) {
	return pageCoreAdapter.apiCall(url, options);
}

// Toast notification
// showCustomToast() — di dời sang patient-search-modal-dry.js
// buildPrescriptionPreviewHTML() — di dời sang patient-search-modal-dry.js

// getToastIcon() — di dời sang patient-search-modal-dry.js

// showConfirmationDialog() — di dời sang patient-search-modal-dry.js

// Receptionist-related functions removed - not needed for psychologist examination page

// ================= AUTO-SAVE BLOCK 5: PATIENT FORM =================
// Auto-save patient form fields into database (via appointment API to keep mapping consistent)
async function autoSavePatientField(fieldName, value) {
	return pageCoreAdapter.autoSavePatientFormField(fieldName, value, {
		shouldSkip: () => isLoadingExaminationData
	});
}

// ================= END AUTO-SAVE BLOCK 5: PATIENT FORM =================
// ================= AUTO-SAVE BLOCK 1: ADDRESS DRAFT CACHE =================
// Address draft auto-save (cache) & edit auto-update
// Constants already declared at the top of the file
// buildFullAddressFromParts() — di dời sang patient-search-modal-dry.js
// Đồng bộ toàn bộ dữ liệu từ modal về form chính (địa chỉ + quốc tịch/tôn giáo/dân tộc/học vấn)
async function syncModalDataToMainForm(saveToDb = false) {
	return addressHierarchyAdapter.syncPersonalDetailModalToMainForm(saveToDb);
}
// saveModalAddressDraftToCache(), loadModalAddressDraftFromCache(), clearModalAddressDraftCache()
// đã được move sang DRY module (personal-detail-modal-dry.js)
// Sử dụng window.saveAddressDraftToCache, window.loadAddressDraftFromCache, window.clearAddressDraftCache từ DRY module

// Call when the address modal is closed (via X or Đóng)
async function handleAddressModalClose() {
	return addressHierarchyAdapter.handlePersonalDetailModalClose({
		buildFullAddressFromParts,
		fillMainAddressFieldFromModal: true,
		clearDraftOnNew: true
	});
}

// Attach modal events if modal exists (best-effort, no error if absent)
document.addEventListener('DOMContentLoaded', () => {
	// Mỗi lần tải trang mới, phát sinh PAGE_LOAD_ID mới và xóa nháp cũ
	try {
		sessionStorage.setItem(PAGE_LOAD_ID_KEY, String(Date.now()));
		sessionStorage.removeItem(ADDRESS_DRAFT_KEY);
		sessionStorage.removeItem(MEDICAL_DRAFT_KEY);
		sessionStorage.removeItem(DOCUMENT_DRAFT_KEY);
		// Xóa dữ liệu legacy để F5 không còn bám theo localStorage
		try { localStorage.removeItem('medicalHistoryData'); } catch (e) { }
	} catch (e) { }
	const modalEl = document.getElementById('personalDetailModal');
	if (modalEl) {
		// Bootstrap v5 event: dùng hide.bs.modal để lấy giá trị TRƯỚC KHI modal fields bị reset
		// Lưu ý: DRY module cũng bind event này, nhưng để đảm bảo logic nhất quán, vẫn giữ ở đây
		modalEl.addEventListener('hide.bs.modal', handleAddressModalClose);
		modalEl.addEventListener('shown.bs.modal', () => {
			if (!window.currentPatientId) {
				// Sử dụng hàm từ DRY module
				if (typeof window.loadAddressDraftFromCache === 'function') {
					window.loadAddressDraftFromCache();
				}
			} else {
				// Sử dụng hàm từ DRY module
				if (typeof window.clearAddressDraftCache === 'function') {
					window.clearAddressDraftCache();
				}
			}
		});
	}
});

// Expose for manual binding if needed
window.handleAddressModalClose = handleAddressModalClose;

// ================= END AUTO-SAVE BLOCK 1: ADDRESS DRAFT CACHE =================

const loadProvinces = addressHierarchyAdapter.loadProvinces;

const psychologistWaitingListAdapter = window.ClinicalExaminationWaitingListUi.createWaitingListAdapter({
	document,
	apiCall,
	statuses: ['psychologist_exam', 'conclusion'],
	roleQueryParam: 'psychologist=true',
	defaultStatus: 'psychologist_exam',
	getPerPage: () => perPage,
	getAppointments: () => allAppointments,
	getPatientSearchQuery: () => patientSearchQuery,
	getCurrentPage: () => currentPage,
	setAppointments: appointments => { allAppointments = appointments; },
	setCurrentPage: nextPage => { currentPage = nextPage; },
	setTotalPages: nextTotalPages => { totalPages = nextTotalPages; },
	updatePagination: () => pageCoreAdapter.updatePagination(),
	formatDateDisplay: date => window.formatDateDisplay ? window.formatDateDisplay(date) : formatDisplayDate(date),
	calculateAge: window.ClinicalVitalCalculationUtils.calculateAge,
	showError: () => showCustomToast('error', 'Lỗi khi tải danh sách lịch hẹn')
});

// Load appointments
async function loadAppointments(status = 'psychologist_exam', page = 1) {
	return psychologistWaitingListAdapter.loadAppointments(status, page);
}

// Render appointments table
function renderAppointmentsTable() {
	return psychologistWaitingListAdapter.renderAppointmentsTable();
}

// ===== ORDER CATALOG (CHỈ ĐỊNH) =====
const orderCatalogStateAdapter = psychologistOrderPageBridge.getCatalogStateUtils().createOrderCatalogStateAdapter({
	getState: () => orderCatalogState,
	renderSelectedOrders: () => orderSelectionActionsAdapter.renderSelectedOrders(),
	renderOrderCategoryTree: () => orderCatalogRenderAdapter.renderOrderCategoryTree()
});

const orderCatalogRenderAdapter = psychologistOrderPageBridge.getCatalogRenderUtils().createOrderCatalogRenderAdapter({
	document,
	getState: () => orderCatalogState,
	escapeHtml,
	formatPricing: formatCurrency,
	variant: 'psychologist',
	ensureDefaultExpansion: () => orderCatalogStateAdapter.ensureDefaultExpansion(),
	showOrderItemsHeaderWhenSurveys: true
});

const orderCatalogLoaderAdapter = psychologistOrderPageBridge.getCatalogLoaderUtils().createOrderCatalogLoaderAdapter({
	document,
	apiCall,
	console,
	getState: () => orderCatalogState,
	renderUtils: psychologistOrderPageBridge.getCatalogRenderUtils(),
	buildOrderTreeStructure: items => psychologistOrderPageBridge.buildOrderTreeStructure(items),
	rebuildOrderCatalogIndex: () => orderCatalogStateAdapter.rebuildIndex(),
	syncSelectedOrdersWithIndex: () => orderCatalogStateAdapter.syncSelectedOrdersWithIndex(),
	renderOrderCategoryTree: () => orderCatalogRenderAdapter.renderOrderCategoryTree(),
	showToast: showCustomToast
});

const orderPerformerLoaderAdapter = psychologistOrderPageBridge.getPerformerLoaderUtils().createOrderPerformerLoaderAdapter({
	document,
	getAuthHeader,
	apiCall,
	defaultSpecialization: 'Tâm lý gia',
	getUserValue: user => user.id || ''
});

const orderFormAdapter = psychologistOrderPageBridge.getFormUiUtils().createOrderFormWorkflowAdapter({
	document,
	autocompleteUtils: psychologistOrderPageBridge.getAutocompleteUtils(),
	selectionUtils: psychologistOrderPageBridge.getSelectionStateUtils(),
	getState: () => orderCatalogState,
	getOrderIndex: () => orderCatalogState.orderIndex,
	getSurveyTemplates: () => orderCatalogState.surveyTemplates,
	getDefaultDate: () => formatDateInput(new Date()),
	formatDateInput,
	escapeHtml,
	formatCurrency,
	showSurveyPricing: true,
	clearSurveyDataset: true,
	onInHouseSelected: () => orderPerformerLoaderAdapter.loadOrderPerformers(),
	includeSurveyTemplate: true,
	surveyGroupPath: 'Khảo sát Tâm lý',
	loadOrderPerformers: () => orderPerformerLoaderAdapter.loadOrderPerformers(),
	applyOrderOptions: {
		clearEmptyInHousePerformer: true
	},
	applySurveyOptions: {
		forceInHouseLocation: true,
		formatPricing: formatCurrency,
		setSurveyDataset: true,
		variant: 'psychologist'
	},
	applySelectedOrderOptions: {
		clearEmptyInHousePerformer: true
	},
	surveyNotFoundMessage: 'Không tìm thấy thông tin mẫu khảo sát',
	surveyAppliedMessage: 'Đã chọn mẫu khảo sát tâm lý. Vui lòng chọn người thực hiện và thêm vào danh sách.',
	renderSelectedOrders: () => orderSelectionActionsAdapter.renderSelectedOrders(),
	triggerAutoSave: () => orderAutoSaveAdapter.trigger(),
	showToast: showCustomToast,
	getSuccessMessage: ({ result, submission }) => {
		if (result.mode === 'update') return 'Đã cập nhật chỉ định thành công.';
		return submission.isSurvey ? 'Đã thêm khảo sát tâm lý vào danh sách.' : 'Đã thêm chỉ định vào danh sách.';
	}
});

const orderSelectionActionsAdapter = psychologistOrderPageBridge.getSelectionStateUtils().createSelectedOrderActionsAdapter({
	getState: () => orderCatalogState,
	tableAdapter: orderSelectedTableAdapter,
	triggerAutoSave: () => orderAutoSaveAdapter.trigger(),
	saveOrdersToServer,
	getAutoSaveTimer: () => ordersAutoSaveTimer,
	clearTimeout,
	setAutoSaveTimer: value => { ordersAutoSaveTimer = value; },
	showToast: showCustomToast
});

const orderAutoSaveAdapter = psychologistOrderPageBridge.getSelectionStateUtils().createOrderAutoSaveAdapter({
	debounceMs: ORDERS_AUTO_SAVE_DEBOUNCE_MS,
	getCurrentAppointmentId: () => currentAppointmentId,
	getAutoSaveTimer: () => ordersAutoSaveTimer,
	setAutoSaveTimer: value => { ordersAutoSaveTimer = value; },
	clearTimeout,
	setTimeout,
	saveOrdersToServer
});

/**
 * Save orders to server
 *
 * LƯU Ý QUAN TRỌNG:
 * - Một số trạng thái (đặc biệt là 'completed' cho chỉ định trong cơ sở)
 *   được cập nhật từ màn hình Quản lý chỉ định CLS (order-management.html).
 * - Để tránh việc auto-save từ màn hình bác sĩ ghi đè trạng thái mới này
 *   trở lại 'sent', ta cần đồng bộ lại trạng thái từ server TRƯỚC khi lưu.
 */
async function saveOrdersToServer() {
	// Skip nếu đang load data
	if (isLoadingExaminationData) {
		return;
	}
	if (!currentAppointmentId) {
		return;
	}

	// NOTE: Cho phép gửi mảng rỗng đến server khi xóa hết chỉ định
	// để server biết cần xóa tất cả records

	try {
		showAutoSaveIndicator('saving');

		// ✅ BƯỚC 1: Đồng bộ trạng thái mới nhất từ server cho các chỉ định đã có ID
		// Điều này giúp tránh việc auto-save ghi đè trạng thái đã được cập nhật
		// từ màn hình Quản lý chỉ định CLS.
		await psychologistOrderPageBridge.getSelectionStateUtils().refreshSelectedOrderStatusesBeforeSave({
			apiCall,
			console,
			appointmentId: currentAppointmentId,
			getSelectedOrders: () => orderCatalogState.selectedOrders,
			setSelectedOrders: value => { orderCatalogState.selectedOrders = value; }
		});

		// ✅ BƯỚC 2: Chuẩn bị dữ liệu orders để lưu (bao gồm id nếu có để backend biết cần update)
		const ordersData = psychologistOrderPageBridge.getSelectionStateUtils().buildOrdersSavePayload(orderCatalogState.selectedOrders, {
			includeSurveyTemplate: true
		});

		// BƯỚC 3: Lưu orders vào bảng chi_dinh
		const response = await apiCall(`/api/chi-dinh/appointment/${currentAppointmentId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chi_dinh: ordersData
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Error saving orders:', response.status, errorText);
			throw new Error(`Failed to save orders: ${errorText}`);
		}

		// BƯỚC 4: Cập nhật lại state local từ response để đảm bảo đồng bộ
		const responseData = await response.json();
		orderCatalogState.selectedOrders = psychologistOrderPageBridge.getSelectionStateUtils().applyOrderSaveResponse(
			orderCatalogState.selectedOrders,
			responseData.chi_dinh || []
		);

		showAutoSaveIndicator('success');

		// BƯỚC 5: Reload từ server sau khi save để đảm bảo sync với các thay đổi từ nơi khác
		// Chỉ reload nếu modal chỉ định đang mở
		const orderModalEl = document.getElementById('orderModal');
		if (orderModalEl && orderModalEl.classList.contains('show')) {
			// Debounce để tránh reload quá nhiều khi có nhiều thay đổi liên tiếp
			setTimeout(async () => {
				await loadChiDinhFromServer();
				orderSelectionActionsAdapter.renderSelectedOrders();
			}, 500);
		}

	} catch (error) {
		console.error('Error saving orders:', error);
		showAutoSaveIndicator('error');
		// Không hiển thị toast để tránh làm phiền user khi auto save
	}
}

/**
 * Load chi_dinh từ server cho appointment
 */
async function loadChiDinhFromServer() {
	return psychologistOrderPageBridge.getSelectionStateUtils().loadSelectedOrdersFromServer({
		apiCall,
		console,
		getCurrentAppointmentId: () => currentAppointmentId,
		setSelectedOrders: value => { orderCatalogState.selectedOrders = value; },
		mapOptions: {
			includeSurveyTemplate: true
		},
		renderSelectedOrders: () => orderSelectionActionsAdapter.renderSelectedOrders()
	});
}

const orderPrintAdapter = psychologistOrderPageBridge.getPrintUiUtils().createOrderPrintAdapter({
	document,
	window,
	bootstrap,
	apiCall,
	console,
	setTimeout,
	clinicalContext: 'psychologist',
	orderPageBridge: psychologistOrderPageBridge,
	escapeHtml,
	formatDisplayDate,
	formatVietnamDate,
	calculateDetailedAge,
	buildFullAddressFromParts,
	formatGenderDisplay,
	getClinicInfoConfig,
	getSelectedOrders: () => orderCatalogState.selectedOrders,
	getCurrentAppointmentId: () => currentAppointmentId,
	showToast: (type, message) => showCustomToast(type, message)
});
window.selectPerformerOption = orderPrintAdapter.selectPerformerOption;
window.updatePrintButtonState = orderPrintAdapter.updatePrintButtonState;

const clearOrdersSectionForPatientSwitch = () => orderSelectionActionsAdapter.clearForPatientSwitch();

// getPrescriptionPrintStyles() — di dời sang patient-search-modal-dry.js
// setupPrintWindow() — di dời sang patient-search-modal-dry.js
// triggerPrint() — di dời sang patient-search-modal-dry.js




// fetchPatientDetailForPrescription() — di dời sang patient-search-modal-dry.js
// buildMedicineUsageDescription() — di dời sang patient-search-modal-dry.js

// Setup service modal event listeners
let selectedServices = [];

const serviceSelectionAdapter = window.ClinicalServiceSelectionUtils.createServiceSelectionAdapter({
	document,
	modalUiUtils: window.ClinicalServiceModalUiUtils,
	getSelectedServices: () => selectedServices,
	setSelectedServices: value => { selectedServices = value; },
	isLocked: () => isFormLocked,
	showToast: showCustomToast,
	scheduleAppointmentServiceSync: () => appointmentServiceSyncAdapter.scheduleAppointmentServiceSync(),
	toNumber,
	formatCurrency: value => formatCurrency(value),
	syncServiceAmountToHeader: total => updateServiceAmountDisplayFromValue(total)
});

const appointmentServiceSyncAdapter = window.ClinicalServiceSelectionUtils.createAppointmentServiceSyncAdapter({
	apiCall,
	console,
	debounceMs: SERVICE_SYNC_DEBOUNCE_MS,
	getCurrentAppointmentId: () => currentAppointmentId,
	getIsLoading: () => isLoadingAppointmentServices,
	setIsLoading: value => { isLoadingAppointmentServices = value; },
	getIsSyncing: () => isSyncingAppointmentServices,
	setIsSyncing: value => { isSyncingAppointmentServices = value; },
	getDebounceTimer: () => serviceSyncDebounceTimer,
	setDebounceTimer: value => { serviceSyncDebounceTimer = value; },
	getSelectedServices: () => selectedServices,
	setSelectedServices: value => { selectedServices = value; },
	renderSelectedServices: () => serviceSelectionAdapter.renderSelectedServices(),
	getTotalServiceAmount: () => serviceSelectionAdapter.getTotalServiceAmount(),
	updateServiceAmountDisplayFromValue,
	updateTotalServiceAmountDisplay: () => serviceSelectionAdapter.updateTotalServiceAmountDisplay(),
	clearCache: () => servicesTabCache.delete(currentAppointmentId),
	showToast: showCustomToast
});

const systemServiceCatalogAdapter = window.ClinicalServiceModalUiUtils.createSystemServiceCatalogAdapter({
	document,
	apiCall,
	console,
	perPage: SYSTEM_SERVICES_PER_PAGE,
	showToast: showCustomToast,
	getServices: () => allServices,
	setServices: value => { allServices = value; },
	getLoaded: () => systemServicesLoaded,
	setLoaded: value => { systemServicesLoaded = value; },
	getLoading: () => systemServicesLoading,
	setLoading: value => { systemServicesLoading = value; },
	getKeyword: () => systemServicesSearchKeyword,
	getPage: () => systemServicesPage,
	setTotal: value => { systemServicesTotal = value; },
	setTotalPages: value => { systemServicesTotalPages = value; },
	setPage: value => { systemServicesPage = value; }
});
const ensureSystemServicesLoaded = systemServiceCatalogAdapter.ensureSystemServicesLoaded;
const renderSystemServices = systemServiceCatalogAdapter.renderSystemServices;

window.updateSelectedServiceField = serviceSelectionAdapter.updateSelectedServiceField;
window.removeServiceFromList = serviceSelectionAdapter.removeServiceFromList;

const textareaAdapter = window.ClinicalTextareaUiUtils.createTextareaAdapter({
	document,
	window,
	$: typeof $ !== 'undefined' ? $ : undefined,
	confirm: window.confirm.bind(window)
});

// Save patient data
// Global variables for duplicate patient handling
let pendingDuplicateData = null;
let selectedDuplicatePatient = null;

const duplicatePatientModalAdapter = window.ClinicalDuplicatePatientModalUi.createDuplicatePatientModalAdapter({
	document,
	bootstrap,
	$,
	setTimeout,
	apiCall,
	console,
	setCurrentPatientId,
	savePatientDataWithoutDuplicateCheck,
	getPendingDuplicateData: () => pendingDuplicateData,
	setPendingDuplicateData: value => { pendingDuplicateData = value; },
	getSelectedDuplicatePatient: () => selectedDuplicatePatient,
	setSelectedDuplicatePatient: value => { selectedDuplicatePatient = value; }
});

window.handleDuplicateChoice = duplicatePatientModalAdapter.handleDuplicateChoice;

// Helper function to sync modal data only when appropriate
function syncModalDataIfNeeded() {
	return addressHierarchyAdapter.syncPersonalDetailModalIfNeeded({
		getCurrentAppointmentId: () => currentAppointmentId,
		syncModalDataToMainForm
	});
}

// Save patient data without duplicate check (used after user makes choice)
async function savePatientDataWithoutDuplicateCheck() {
	await pageCoreAdapter.runPatientSaveWithoutDuplicateCheck({
		$,
		syncModalDataIfNeeded,
		collectFormData,
		savePatientDataInternal,
		saveExaminationFormData,
		showToast: showCustomToast
	});
}
// Internal function to save patient data (without duplicate check)
async function savePatientDataInternal(formData) {
	return pageCoreAdapter.runPatientDataInternalSave({
		formData,
		syncModalDataIfNeeded,
		getCurrentPatientId: () => currentPatientId,
		buildPatientPayload: data => window.ClinicalFormDomUtils.buildPatientSavePayload(data),
		uploadDraftDocumentsForPatient: patientId => documentSectionAdapter.uploadDraftDocumentsForPatient(patientId),
		getCurrentAppointmentId: () => currentAppointmentId,
		buildAppointmentPayload: data => window.ClinicalFormDomUtils.buildAppointmentClinicalUpdatePayload(data),
		setCurrentPatientId,
		showToast: showCustomToast,
		afterPatientSaved: (patientResult, patientData) => {
			const selectedModalPatient = window.modalSelectedPatient;
			if (selectedModalPatient) {
				Object.assign(selectedModalPatient, patientData);
				selectedModalPatient.id = patientResult.id;
				if (typeof window.updateMedicalRecordTab === 'function') {
					window.updateMedicalRecordTab();
				}
			}
		}
	});
}
async function savePatientData() {
	await pageCoreAdapter.runPatientSaveWithDuplicateCheck({
		syncModalDataIfNeeded,
		collectFormData,
		duplicatePatientModalAdapter,
		getCurrentPatientId: () => currentPatientId,
		getCurrentAppointmentId: () => currentAppointmentId,
		savePatientDataInternal,
		saveExaminationFormData,
		showToast: showCustomToast
	});
}

// ===== DOM UTILITY FUNCTIONS =====

const formDomAdapter = window.ClinicalFormDomUtils.createFormDomAdapter({
	document,
	getReferralSourceControl: () => window.ReferralSourceControl
});
const getElementValue = formDomAdapter.getElementValue;
const safeSetValue = formDomAdapter.safeSetValue;

const psychologistExaminationDataLoadAdapter = psychologistExaminationDataLoadFlowUtils.createPsychologistExaminationDataLoadAdapter({
	window,
	document,
	$,
	fetch,
	console,
	getAuthHeader,
	getRelativeTable: () => psychologistRelativeTableInstance,
	safeSetValue,
	setDatepickerValue: (...args) => {
		if (typeof setDatepickerValue === 'function') return setDatepickerValue(...args);
		if (typeof window.setDatepickerValue === 'function') return window.setDatepickerValue(...args);
		return undefined;
	},
	calculateAge: window.ClinicalVitalCalculationUtils.calculateAge,
	buildFullAddressFromParts,
	setCurrentPatientId,
	setCurrentPatientData(value) { window.currentPatientData = value; },
	setCurrentAppointmentId(value) { currentAppointmentId = value; },
	setIsLoadingExaminationData: value => { isLoadingExaminationData = value; },
	apiCall,
	formSection: 'tam_ly_gia_kham_form_kham',
	setTextareaValue: textareaAdapter.setTextareaValue,
	autoResizeTextarea: textareaAdapter.autoResizeTextarea,
	loadPreviousVitals,
	showToast: showCustomToast,
	clearMedicalHistoryTimers: () => medicalHistoryAutosaveAdapter.clearTimers(),
	clearSelectedServices: () => serviceSelectionAdapter.clearSelectedServices(),
	clearNewLayoutFields: () => examinationFormClearAdapter.clearNewLayoutFields(),
	clearDetailModalFields: () => examinationFormClearAdapter.clearDetailModalFields(),
	clearOrdersSectionForPatientSwitch
});

const medicalHistoryModalAdapter = window.MedicalHistoryModalControls.createPsychologistMedicalHistoryModalAdapter({
	$,
	document,
	sessionStorage,
	localStorage,
	pageLoadIdKey: PAGE_LOAD_ID_KEY,
	draftKey: MEDICAL_DRAFT_KEY,
	safeSetValue,
	autoSaveField: autoSaveMedicalHistoryField,
	getUploadedDocuments: () => uploadedDocuments,
	showToast: showCustomToast
});
const syncMedicalHistoryToHiddenFields = medicalHistoryModalAdapter.syncHiddenFields;
const medicalHistoryAutosaveAdapter = window.ClinicalMedicalHistoryAutosaveUtils.createMedicalHistoryAutosaveAdapter({
	window,
	console,
	setTimeout,
	clearTimeout,
	apiCall,
	getCurrentAppointmentId: () => currentAppointmentId,
	shouldSkipSave: () => isLoadingExaminationData,
	showAutoSaveIndicator: status => showAutoSaveIndicator(status),
	syncMedicalHistoryToHiddenFields
});

// Shared helper for fields that still keep hidden modal state.
const getMedicalHistoryValue = (hiddenFieldId, modalFieldId) => window.ClinicalFormDomUtils.getHiddenOrModalValue(hiddenFieldId, modalFieldId, { document });

// Collect form data using DOM helpers
function collectFormData() {
	syncMedicalHistoryToHiddenFields();

	return window.ClinicalFormDomUtils.collectClinicalAdministrativeFormData({
		document,
		getElementValue,
		getMedicalHistoryValue,
		getPhysicalHistory: ({ document: doc, getElementValue: getValue }) => {
			const hiddenEl = doc.getElementById('hiddenPhysicalHistory');
			if (hiddenEl && hiddenEl.value) return hiddenEl.value;
			if (window.physicalHistoryAutocomplete) return window.physicalHistoryAutocomplete.getValue() || '';
			return getValue('physicalHistory');
		}
	});
}

// Transfer/Cancel/Edit appointment functions removed - not needed for psychologist examination page

// Initialize form
function initializeForm() {
	window.ClinicalFormDomUtils.initializeWorkflowFormShell({
		$,
		document,
		window,
		console,
		setTimeout,
		loadProvinces,
		vitalUtils: window.ClinicalVitalCalculationUtils,
		autoSaveBMI: (bmi) => {
			if (typeof autoSavePatientField === 'function') {
				autoSavePatientField('bmi', bmi);
			}
		},
		setupMainAddressChangeHandlers: () => addressHierarchyAdapter.setupMainAddressChangeHandlers(),
		occupationOptions: { OccupationAutocomplete },
		documentSectionAdapter,
		getElementValue,
		autoSaveField: autoSavePatientField
	});
}

// Patient search sidebar functions removed - not needed for psychologist examination page

async function loadPatientIntoForm(patient, examination = null, appointment = null) {
	return psychologistExaminationDataLoadAdapter.loadPatientIntoForm(patient, examination, appointment);
}

const psychologistPreviousVitalsLoader = window.ClinicalVitalCalculationUtils.createPreviousVitalsLoader({
	document,
	apiCall,
	console,
	getCurrentAppointmentId: () => currentAppointmentId
});

/**
 * Load tất cả chỉ số sinh hiệu gần nhất từ lần khám trước
 * Hiển thị hint mờ bên dưới mỗi input (Last: X)
 */
async function loadPreviousVitals(patientId) {
	return psychologistPreviousVitalsLoader.loadPreviousVitals(patientId);
}

// Recent patients functions removed - not needed for psychologist examination page

// Queue management functions removed - not needed for psychologist examination page

// loadMedicalHistoryIntoModal() — di dời sang patient-search-modal-dry.js
function autoSaveMedicalHistoryField(fieldId, fieldName, value) {
	return medicalHistoryAutosaveAdapter.autoSaveField(fieldId, fieldName, value);
}


// ================= END AUTO-SAVE BLOCK 2: MODAL HỎI BỆNH =================

// Document upload functions
let uploadedDocuments = []; // nháp trong phiên (chưa upload)
let attachments = []; // tài liệu đã lưu trên server
let uploadInitialized = false;

let notesAttachmentChip = null;

const documentFileAdapter = window.ClinicalDocumentFileUtils.createDocumentFileAdapter({
	showError: message => showCustomToast('error', message)
});

const documentSectionAdapter = window.ClinicalDocumentSectionUiUtils.createExaminationDocumentSectionAdapter({
	document,
	sessionStorage,
	documentDraftKey: DOCUMENT_DRAFT_KEY,
	apiCall,
	fetch,
	getAuthHeader,
	validateFile: file => validateFile(file),
	getFileIcon: fileType => documentFileAdapter.getFileIcon(fileType),
	formatFileSize: bytes => documentFileAdapter.formatFileSize(bytes),
	formatDisplayDate,
	showToast: (type, message) => showCustomToast(type, message),
	showConfirmationDialog,
	console,
	getIsLocked: () => isFormLocked,
	getUploadInitialized: () => uploadInitialized,
	setUploadInitialized: value => { uploadInitialized = value; },
	getNotesAttachmentChip: () => notesAttachmentChip,
	setNotesAttachmentChip: value => { notesAttachmentChip = value; },
	getUploadedDocuments: () => uploadedDocuments,
	setUploadedDocuments: nextDocuments => { uploadedDocuments = nextDocuments; },
	getAttachments: () => attachments,
	setAttachments: nextAttachments => { attachments = nextAttachments; }
});

// ===== FILE UPLOAD UTILITY FUNCTIONS =====

const validateFile = documentFileAdapter.validateFile;
const uploadFile = documentSectionAdapter.uploadFile;

window.downloadDocument = documentSectionAdapter.downloadDocument;
window.deleteDocument = documentSectionAdapter.deleteDocument;

// Initialize page
function initializePage() {
	window.ClinicalFormDomUtils.initializeWorkflowPageShell({
		document,
		$,
		window,
		console,
		setTimeout,
		resetFormToDefault,
		loadAddressDraftFromCache,
		loadProvinces,
		loadAppointments,
		currentStatus,
		currentPage,
		occupationOptions: { OccupationAutocomplete },
		documentSectionAdapter,
		addressDraftAdapter,
		saveAddressDraftToCache,
		getElementValue,
		autoSaveField: autoSavePatientField
	});
}

// Reset form to default values
function resetFormToDefault() {
	window.ClinicalFormDomUtils.resetPsychologistWorkflowPageState({
		document,
		localStorage,
		relativeTable: psychologistRelativeTableInstance,
		setCurrentEditId: value => { currentEditId = value; },
		setUploadedDocuments: value => { uploadedDocuments = value; },
		setCurrentPatientId
	});
}
// Event listeners
document.addEventListener('DOMContentLoaded', function () {
	const bootstrapResult = window.ClinicalPageCoreUtils.initializeExaminationPageBootstrap({
		document,
		window,
		pageCoreAdapter,
		initializePage,
		initializeForm,
		printModalTabContent,
		setRelativeTableInstance: instance => { psychologistRelativeTableInstance = instance; },
		setCurrentStatus: nextStatus => { currentStatus = nextStatus; },
		setPatientSearchQuery: nextQuery => { patientSearchQuery = nextQuery; },
		renderAppointmentsTable,
		getCurrentStatus: () => currentStatus,
		getCurrentPage: () => currentPage,
		setPerPage: nextValue => { perPage = nextValue; },
		loadAppointments,
		medicalHistoryModalAdapter,
		isFormLocked: () => isFormLocked,
		loadMedicalHistoryIntoModal,
		savePatientData
	});
	if (bootstrapResult.status !== 'initialized') return;

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'order.changed', 'survey.changed', 'patient.changed', 'document.changed', 'catalog.changed', 'busy_schedule.changed'],
			debounceMs: 500,
			handler: function (event) {
				const payload = event && event.payload ? event.payload : {};
				const eventPatientId = payload.patient_id ? Number(payload.patient_id) : null;

				if (event.type === 'catalog.changed') {
					servicesTabCache.clear();
					allServices = [];
					systemServicesLoaded = false;
					orderCatalogState.items = [];
					orderCatalogState.treeRoots = [];
					orderCatalogState.surveyTemplates = [];
					orderCatalogState.fetched = false;
				}

				if (event.type === 'document.changed' && eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId)) {
					documentSectionAdapter.loadAttachmentsForCurrentPatient();
					documentSectionAdapter.updateNotesAttachmentCount();
				}

				if (event.type === 'patient.changed' && eventPatientId && currentPatientId && eventPatientId === Number(currentPatientId) && psychologistRelativeTableInstance && typeof psychologistRelativeTableInstance.reload === 'function') {
					psychologistRelativeTableInstance.reload();
				}

				loadAppointments(currentStatus, currentPage);
			}
		});
	}

	const patientModalContract = window.QLPKDoctorModuleRegistry.require('patientModalContract');
	const patientHistoryModal = patientModalContract.getOrCreate({
		document,
		apiCall,
		showToast: showCustomToast,
		dataRuntime: false,
		print: false,
		autoBind: false,
		contextOptions: {
			showConfirmationDialog,
			getAppointments: () => allAppointments,
			getCurrentPatientData: () => window.currentPatientData,
			getCurrentAppointmentId: () => currentAppointmentId,
			getFormatDateDisplay: () => window.formatDateDisplay || (typeof formatDisplayDate === 'function' ? formatDisplayDate : null),
			renderActiveTabLoading: options => window.ModalFunctionTabsUi.renderActiveTabLoading(options),
			loadVitalSigns: loadVitalSignsData,
			prepareFormForCopy,
			setLoadingState(value) {
				isLoadingExaminationData = value;
				isLoadingPrescription = value;
			},
			setCurrentAppointmentId(value) {
				currentAppointmentId = value;
			},
			setCurrentPatientId,
			loadPatient: loadPatientIntoForm,
			loadExaminationFormData,
			loadAppointmentServices: () => appointmentServiceSyncAdapter.loadAppointmentServices(),
			lockForm: () => copyViewLockController.lock(),
			activeStatuses: ['PSYCHOLOGIST_EXAM', 'WAITING_TRANSFER'],
			getHistoryDescription: exam => exam.psychologist_summary || '',
			formatHistoryDate: date => (window.formatDateDisplay ? window.formatDateDisplay(date) : formatDisplayDate(date)),
			getExaminationStatusBadgeClass: psychologistGetExaminationStatusBadgeClass,
			getExaminationStatusText: psychologistGetExaminationStatusText,
			fetchPatientDetail: fetchPatientDetailForPrescription,
			fetchExaminationDetail: fetchExaminationDetailForPrescription,
			fetchSectionDetails: fetchExaminationDetailsBySection,
			fetchPrescription: fetchPrescriptionDataForAppointment,
			getFormatDate: () => window.formatDateDisplay || formatDisplayDate,
			resetFormToDefault,
			loadAppointments,
			buildHistoryRendererOptions: () => ({
				fetchServicesForAppointment,
				buildServiceInvoiceHTML,
				buildMedicalRecordHTML,
				setupPrescriptionTabPagination,
				getClinicInfoConfig,
				createBarcodesInElement
			})
		}
	});
	const modalSearchContext = patientHistoryModal.context;
	const patientSearchModalEl = modalSearchContext.elements.modal;
	const modalSearchState = modalSearchContext.stateStore;
	const modalPatientSearchFlow = modalSearchContext.flow;
	function hasAppointmentInCurrentList(appointmentId) {
		return Array.isArray(allAppointments) && allAppointments.some(appointment => String(appointment.id) === String(appointmentId));
	}
	window.QLPKGlobalSearchActions = {
		handleAction(action = {}, item = {}) {
			if (action.kind === 'open_patient_history') {
				return this.openPatientHistory(action.payload || {}, item);
			}
			if (action.kind === 'open_appointment') {
				return this.openAppointment(action.payload || {}, item);
			}
			return false;
		},
		openPatientHistory(payload = {}) {
			const patientId = payload.patient_id;
			if (!patientId || !modalPatientSearchFlow || typeof modalPatientSearchFlow.openLinkedRelative !== 'function') {
				return false;
			}
			return modalPatientSearchFlow.openLinkedRelative(patientId);
		},
		openAppointment(payload = {}) {
			if (payload.appointment_id && hasAppointmentInCurrentList(payload.appointment_id) && typeof window.selectPatientCard === 'function') {
				return window.selectPatientCard(payload.appointment_id);
			}
			return this.openPatientHistory(payload);
		}
	};

	const medicalRecordRealtimeAdapter = window.PsychologistMedicalRecordRealtimeUtils.createMedicalRecordRealtimeAdapter({
		document,
		$,
		console,
		getSelectedPatient: () => modalSearchState.get('selectedPatient'),
		syncWindowState: () => modalPatientSearchFlow.syncWindowState(),
		getClinicInfoConfig,
		buildMedicalRecordHTML,
		createBarcodesInElement
	});
	window.updateMedicalRecordTab = medicalRecordRealtimeAdapter.updateMedicalRecordTab;

	$(document).ready(function () {
		medicalRecordRealtimeAdapter.bindRealtimeUpdates();
	});

	// createBarcodesInElement — di dời sang patient-search-modal-dry.js
	const appointmentCopyFormPreparer = window.ModalPatientSearchUi.createAppointmentCopyFormPreparer({
		clearExaminationLayout: () => examinationFormClearAdapter.clearNewLayoutFields(),
		clearSelectedServices: () => serviceSelectionAdapter.clearSelectedServices(),
		setCurrentAppointmentId: value => { currentAppointmentId = value; },
		modalElement: patientSearchModalEl
	});

	function prepareFormForCopy(closeModal = true) {
		return appointmentCopyFormPreparer(closeModal);
	}

	// ========================================
	// PRINT PREVIEW AND QUEUE MANAGEMENT
	// ========================================

	window.ClinicalPageCoreUtils.bindWorkflowInteractionShell({
		window,
		patientHistoryModal,
		modalSearchContext,
		orderPageBridge: psychologistOrderPageBridge,
		orderCatalogState,
		catalogStateAdapter: orderCatalogStateAdapter,
		catalogLoaderAdapter: orderCatalogLoaderAdapter,
		formAdapter: orderFormAdapter,
		selectionActionsAdapter: orderSelectionActionsAdapter,
		performerLoaderAdapter: orderPerformerLoaderAdapter,
		printAdapter: orderPrintAdapter,
		formatDateInput,
		showToast: showCustomToast,
		loadChiDinhFromServer,
		loadPatient: loadPatientIntoForm,
		isFormLocked: () => isFormLocked,
		unlockForm: () => copyViewLockController.unlock(),
		apiCall,
		getCurrentAppointmentId: () => currentAppointmentId,
		transitionPath: 'complete-psychologist-exam',
		loadDocumentModalData: loadMedicalHistoryIntoModal,
		setupDocumentAutoSave: medicalHistoryModalAdapter.bindAutosaveFields,
		saveMedicalHistory: medicalHistoryModalAdapter.saveFromModal
	});

	// Print preview and queue management removed - not needed for psychologist examination page
});
// Transfer modal event handlers removed - not needed for psychologist examination page
// ========================================
// MODAL SEARCH FUNCTIONS
// ========================================

// Modal search functions and variables removed - not needed for psychologist examination page

// ========================================
// PATIENT CARD FUNCTIONS
// ========================================

// Chọn bệnh nhân từ card
async function selectPatientCard(appointmentId) {
	return window.ModalPatientSearchUi.selectAppointmentPatientFlow(appointmentId, {
		apiCall,
		appointments: allAppointments,
		setCurrentAppointmentId: value => { currentAppointmentId = value; },
		setLoading: value => { isLoadingExaminationData = value; },
		clearBeforeLoad: () => psychologistExaminationDataLoadAdapter.clearPatientSwitchState(),
		loadPatient: loadPatientIntoForm,
		loadExaminationFormData,
		clearExaminationFormOnError: () => examinationFormClearAdapter.clearNewLayoutFields(),
		afterExaminationFormLoad: () => { isLoadingExaminationData = false; },
		unlockIfNeeded: () => {
			if (isFormLocked) copyViewLockController.unlock();
		},
		loadAppointmentServices: () => appointmentServiceSyncAdapter.loadAppointmentServices(),
		serviceErrorMessage: 'Không thể tải danh sách dịch vụ cho lịch hẹn:',
		examinationFormErrorMessage: 'Error loading examination form data:',
		clearErrorMessage: 'Error clearing examination fields:'
	});
}
// Make functions global
window.selectPatientCard = selectPatientCard;
window.showTransferMenu = window.ExaminationActionButtonsUi.createTransferMenuHandler({
	role: 'psychologist',
	showToast: showCustomToast,
	onSuccess: function () {
		loadAppointments(currentStatus, currentPage);
	}
});

// ========================================
// ICD DATA LOADING (for autocomplete components)
// ========================================

/**
 * Load ICD data from API with search query
 * Note: This function is available to shared ICD autocomplete consumers.
 */
async function loadICDData(query = '') {
	return window.ClinicalIcdDataLoader.loadICDData(query, {
		getAuthHeader,
		missingTokenMessage: 'No token found'
	});
}
// Initialize examination form handlers when document ready
$(document).ready(function () {
	initializeExaminationForm();
});
// ===== EXAMINATION FORM HANDLERS =====
// ================= AUTO-SAVE BLOCK 3: EXAMINATION FORM =================

/**
 * Initialize examination form event handlers
 */
function initializeExaminationForm() {
	return window.ExaminationActionButtonsUi.createExaminationFormInitializer({
		variant: 'psychologist',
		$,
		textareaAdapter,
		apiCall,
		getCurrentAppointmentId: () => currentAppointmentId,
		isFormLocked: () => isFormLocked,
		autoSaveOnClose: () => detailModalAutosaveAdapter.autoSaveAllFields(),
		afterDataReady: () => window.ClinicalExaminationDetailModalUtils.bindSubstanceTimeInputHandlers({ document }),
		showToast: showCustomToast,
		handlers: {
			saveBasicExaminationInfo: () => detailModalAutosaveAdapter.saveBasicInfo(),
			saveExaminationFormData
		},
	}).initialize();
}
// ================= END AUTO-SAVE BLOCK 3: EXAMINATION FORM =================

const examinationFormClearAdapter = window.ClinicalExaminationFormClearUtils.createPsychologistExaminationFormClearAdapter({
	$,
	document,
	localStorage,
	setTextareaValue: textareaAdapter.setTextareaValue,
	afterResetToDefault: () => {
		currentExaminationId = null;
	}
});

const copyViewLockController = window.ClinicalExaminationFormLockUtils.createWorkflowCopyViewLockController({
	document,
	applyServiceModalLockState: (options) => window.ClinicalServiceModalUiUtils.applyServiceModalLockState(options),
	afterApplyLockState: locked => documentSectionAdapter.setDocumentSectionLockState(locked),
	setLocked: locked => { isFormLocked = locked; }
});

// ================= AUTO-SAVE BLOCK 4: MODAL KHÁM CHI TIẾT =================
// Auto-save examination detail modal fields
const showAutoSaveIndicator = pageCoreAdapter.showAutoSaveIndicator;

const detailModalAutosaveAdapter = window.ClinicalExaminationDetailModalUtils.createDetailModalAutosaveAdapter({
	$,
	document,
	apiCall,
	console,
	variant: 'psychologist',
	shouldSkip: () => isLoadingExaminationData,
	getCurrentAppointmentId: () => currentAppointmentId,
	setCurrentAppointmentId: appointmentId => { currentAppointmentId = appointmentId; },
	getCurrentPatientId: () => currentPatientId,
	showAutoSaveIndicator,
	showToast: showCustomToast,
	clearDetailModalFields: () => examinationFormClearAdapter.clearDetailModalFields()
});

detailModalAutosaveAdapter.bindManualSaveButton();
detailModalAutosaveAdapter.initialize();
// ================= END AUTO-SAVE BLOCK 4: MODAL KHÁM CHI TIẾT =================

const examinationFormSaveAdapter = pageCoreAdapter.createExaminationFormSaveAdapter({
	variant: 'psychologist',
	shouldSkip: () => isLoadingExaminationData,
	$,
	showAutoSaveIndicator,
	showToast: showCustomToast
});

/**
 * Save examination form data to database
 */
async function saveExaminationFormData() {
	return examinationFormSaveAdapter.save();
}
/**
 * Load examination form data when appointment is selected
 */
async function loadExaminationFormData(appointmentId) {
	return psychologistExaminationDataLoadAdapter.loadExaminationFormData(appointmentId);
}
