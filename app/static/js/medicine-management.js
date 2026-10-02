// Shared page runtime (formerly classic script tags), in page order.
import './shared/confirmation-dialog.js';
import './app-version-check.js';
import './shared/icon-system.js';
import './sidebar-dry-loader.js';
import './flatpickr-vn.js';
import './utils.js';
import './datepicker-init.js';
import './realtime-page-hooks.js';
import './components/autocomplete-field.js';
import { state } from './medicines/management-state.js';
import { byId, debounce, delegate, el, replace } from './shared/dom.js';
import { bindMedicineSelection, changePage, confirmBulkDelete, deleteSelectedMedicines, filterMedicines, loadAllMedicines, loadMedicines, resetFilters, toggleMissingImportPriceFilter } from './medicines/management-list.js';
import { exportMedicineListExcel, updateDashboard } from './medicines/management-overview.js';
import { ClinicMedicineCatalog } from './medicines/clinic-catalog.js';
import { MedicinePriceEditor } from './medicines/price-editor.js';
import { configureReferenceReview } from './medicines/reference-review.js';
import { deleteMedicine, editMedicine, initializeAdministrationMethodAutocomplete, initializeImportedTypeAutocomplete, initializePrescriptionTypeAutocomplete, medicineSaving, resetForm, saveMedicine } from './medicines/management-form.js';
import { showMedicineExpiry, updatePackagingInfo, updateStockQuantityLabels } from './medicines/management-stock.js';
import { addBatchImportRow, confirmBatchImport, showImportBatchModal, showImportFromMedicineForm } from './medicines/management-batch-import.js';
import { showSupplierManagement } from './medicines/management-suppliers.js';
import { loadImportLedger, switchImportTab } from './medicines/management-import-ledger.js';
import { QLPKSearchNormalization } from './shared/search-normalization.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';

// Medicine Management JavaScript

// Helper functions
function normalizeSearchText(value) {
	return QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

function escapeHtml(text) {
	if (!text) return '';
	const map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}

// Backend user_message for the given HTTP statuses (HttpError from requestJson), otherwise the fallback.
function getUserFacingResponseMessage(error, statuses, fallback, field = 'user_message') {
	const candidate = error?.data?.[field];
	if (!statuses.includes(error?.status) || typeof candidate !== 'string' || !candidate.trim()) return fallback;
	return candidate;
}

state.currentPage = 1;
let medicinePageSize = 10;
state.medicineListRequest = 0;
state.totalPages = 1;
state.totalItems = 0;
state.medicines = [];
state.canReviewMedicineReference = false;
state.allMedicines = []; // Danh sách tất cả thuốc cho dropdown (không phân trang)

function setElementVisible(element, isVisible) {
	if (!element) return;
	element.classList.toggle('mm-hidden', !isVisible);
}

function setPackagingInfoActive(element, isActive) {
	if (!element) return;
	element.classList.toggle('text-muted', !isActive);
	element.classList.toggle('mm-packaging-info-text--active', isActive);
}

const decorativeIcon = className => el('i', { class: `bi ${className}`, 'aria-hidden': 'true' });

// Initialize when document is ready (module scripts run before DOMContentLoaded)
// Shared medicine components call back into this page instead of importing its list/form modules.
function configureMedicineComponents() {
	const refreshLists = () => {
		loadMedicines();
		loadAllMedicines();
	};
	ClinicMedicineCatalog.configure({ openExisting: id => editMedicine(id), packagingChanged: () => updatePackagingInfo() });
	MedicinePriceEditor.configure({ onSaved: refreshLists });
	configureReferenceReview({ onLinked: refreshLists });
}

document.addEventListener('DOMContentLoaded', () => {
	configureMedicineComponents();
	const icons = window.QLPKIconSystem;
	document.querySelectorAll('[data-medicine-icon]').forEach(element => {
		replace(element, decorativeIcon(`${icons.SECTION_ICONS[element.dataset.medicineIcon] || icons.ACTION_ICONS.info} qlpk-section-icon`));
	});
	document.querySelectorAll('[data-medicine-action-icon]').forEach(element => {
		replace(element, decorativeIcon(icons.getActionIcon(element.dataset.medicineActionIcon)));
	});
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = '/login.html';
		return;
	}
	byId('logoutBtn')?.addEventListener('click', () => window.QLPKAppHeader?.logout());

	loadMedicines();
	loadAllMedicines(); // Load tất cả thuốc cho dropdown
	updateDashboard(); // Load dashboard data
	bindEvents();
	initializeAutocompleteComponents();
	initializeSaleUnitAutocomplete();

	QLPKRealtimePageHooks?.register({
		types: ['inventory.changed'],
		debounceMs: 500,
		handler: () => {
			loadMedicines();
			loadAllMedicines();
			updateDashboard();
		}
	});
});

// Initialize autocomplete components
function initializeAutocompleteComponents() {
	// Khởi tạo autocomplete components cho 4 field mới

	// Khởi tạo autocomplete cho các field mới chuyển từ select
	initializePrescriptionTypeAutocomplete();
	initializeAdministrationMethodAutocomplete();
	initializeImportedTypeAutocomplete();
}

// Autocomplete for sale unit (đơn vị tính)
function initializeSaleUnitAutocomplete() {
	const input = document.getElementById('saleUnit');
	const dropdown = document.getElementById('saleUnitDropdown');
	if (!input || !dropdown) return;

	const units = [
		{ value: 'viên', label: 'viên' },
		{ value: 'gói', label: 'gói' },
		{ value: 'tuýp', label: 'tuýp' },
		{ value: 'chai', label: 'chai' },
		{ value: 'ống', label: 'ống' },
		{ value: 'ml', label: 'ml' },
		{ value: 'g', label: 'g' },
		{ value: 'giọt', label: 'giọt' },
		{ value: 'bơm tiêm', label: 'bơm tiêm' },
		{ value: 'liều', label: 'liều' },
		{ value: 'túi', label: 'túi' },
		{ value: 'vỉ', label: 'vỉ' },
				{ value: 'lít', label: 'lít' },
		{ value: 'miếng', label: 'miếng' },
		{ value: 'bút tiêm', label: 'bút tiêm' },
		{ value: 'viên nang', label: 'viên nang' },
		{ value: 'lọ', label: 'lọ' },
		{ value: 'miếng dán', label: 'miếng dán' }
	];

	function render(list) {
		replace(dropdown, list.map(item => {
			const option = el('div', { class: 'occupation-item' }, item.label);
			option.addEventListener('click', () => {
				input.value = item.label;
				// Lưu trực tiếp tiếng Việt vào hidden input
				byId('saleUnitValue').value = item.value;
				setElementVisible(dropdown, false);
				// Cập nhật quy cách và label khi thay đổi đơn vị dùng
				updatePackagingInfo();
				updateStockQuantityLabels();
			});
			return option;
		}));
		setElementVisible(dropdown, list.length > 0);
	}

	function filter(keyword) {
		const kw = normalizeSearchText(keyword);
		if (!kw) return units;
		return units.filter(u => normalizeSearchText(u.label).includes(kw) || normalizeSearchText(u.value).includes(kw));
	}

	input.addEventListener('focus', () => render(filter(input.value)));
	input.addEventListener('input', () => {
		document.getElementById('saleUnitValue').value = input.value;
		render(filter(input.value));
		// Cập nhật quy cách khi thay đổi đơn vị dùng
		updatePackagingInfo();
	});
	input.addEventListener('change', () => {
		// Cập nhật quy cách khi thay đổi đơn vị dùng
		updatePackagingInfo();
		// Đồng bộ giá trị hidden input khi người dùng nhập trực tiếp
		// Lưu trực tiếp giá trị tiếng Việt (không cần convert)
		const displayValue = input.value;
		document.getElementById('saleUnitValue').value = displayValue;
	});
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target) && e.target !== input) {
			setElementVisible(dropdown, false);
		}
	});
}

const bindClick = (id, handler) => byId(id)?.addEventListener('click', handler);

// Bind all events
function bindEvents() {
	byId('medicinePageSize').addEventListener('change', event => {
		const size = Number(event.target.value);
		if (![10, 20, 50, 100].includes(size)) return;
		medicinePageSize = size;
		state.currentPage = 1;
		loadMedicines();
	});
	delegate(byId('pagination'), 'click', 'button[data-page]', (event, button) => changePage(Number(button.dataset.page)));

	// Search functionality
	bindClick('searchBtn', () => {
		state.currentPage = 1;
		filterMedicines();
	});
	byId('searchInput').addEventListener('keypress', event => {
		if (event.key === 'Enter') {
			state.currentPage = 1;
			filterMedicines();
		}
	});
	bindClick('resetBtn', () => resetFilters());
	byId('medicineForm').addEventListener('submit', event => {
		event.preventDefault();
		saveMedicine();
	});
	bindClick('confirmDeleteBtn', () => deleteMedicine());
	bindClick('deleteSelectedBtn', () => deleteSelectedMedicines());
	bindClick('confirmBulkDeleteBtn', () => confirmBulkDelete());
	bindMedicineSelection();
	bindClick('importWarehouseBtn', () => showImportBatchModal());
	bindClick('missingImportPriceFilter', () => toggleMissingImportPriceFilter());

	// Tab "Lịch sử nhập" gộp trong modal Nhập kho theo đơn hàng
	bindClick('importTabOrder', () => switchImportTab('order'));
	bindClick('importTabLedger', () => switchImportTab('ledger'));
	byId('importLedgerSearch').addEventListener('input', debounce(() => {
		if (!byId('importLedgerPane').hidden) loadImportLedger(1);
	}, 400));
	byId('importLedgerStatus').addEventListener('change', () => {
		if (!byId('importLedgerPane').hidden) loadImportLedger(1);
	});

	bindClick('addBatchRowBtn', () => addBatchImportRow());
	bindClick('medicineImportOpen', () => showImportFromMedicineForm());
	bindClick('medicine-expiry_date', () => showMedicineExpiry());
	bindClick('batchSupplierPickBtn', () => showSupplierManagement());
	byId('packagingUnit').addEventListener('change', () => updatePackagingInfo());
	byId('unitsPerBox').addEventListener('input', () => updatePackagingInfo());
	bindClick('confirmImportBatchBtn', () => confirmBatchImport());
	bindClick('exportDataBtn', () => exportMedicineListExcel());

	// Modal events
	const medicineModal = byId('medicineModal');
	medicineModal.addEventListener('hide.bs.modal', event => {
		if (medicineSaving) event.preventDefault();
	});
	medicineModal.addEventListener('hidden.bs.modal', () => resetForm());

	// Khi mở modal thêm mới, reset form
	bindClick('addMedicineBtn', () => {
		resetForm();
		window.bootstrap.Modal.getOrCreateInstance(medicineModal).show();
	});
}

// Show toast notification
function showCustomToast(type, message) {
	return QLPKUserFeedback?.show(type, message, { duration: 5000 });
}

export { debounce, escapeHtml, getUserFacingResponseMessage, medicinePageSize, normalizeSearchText, setElementVisible, setPackagingInfoActive, showCustomToast };
