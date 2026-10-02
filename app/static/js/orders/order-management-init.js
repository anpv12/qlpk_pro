import { state } from './order-management-state.js';
import { applyFilters, batchDeleteOrders, selectOrderGroup, setupAutoFilterListeners } from './order-management-actions.js';
import { filterState, loadOrders, selectedOrderIds, showCustomToast, updateSelectedCount } from '../order-management.js';
import { checkSurveyStatusUpdate } from './order-management-survey-level.js';
import { QLPKRealtimePageHooks } from '../realtime-page-hooks.js';

// Initialize page
function runOrderPageInit1(ctx) {
	const groupTabs = [...document.querySelectorAll('[data-status-group]')];
	groupTabs.forEach((button, index) => {
		button.addEventListener('click', () => selectOrderGroup(button.dataset.statusGroup));
		button.addEventListener('keydown', event => {
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			const keyTargets = { Home: 0, End: groupTabs.length - 1 };
		const next = event.key in keyTargets ? keyTargets[event.key] : (index + 1) % groupTabs.length;
			groupTabs[next].focus();
			selectOrderGroup(groupTabs[next].dataset.statusGroup);
		});
	});
	setupAutoFilterListeners();
	// Set giá trị mặc định: đầu năm - cuối năm hiện tại
	const today = new Date();
	const currentYear = today.getFullYear();
	const startDateDefault = `${currentYear}-01-01`;
	const endDateDefault = `${currentYear}-12-31`;
	const fromDateInput = document.getElementById('filterFromDate');
	const toDateInput = document.getElementById('filterToDate');
	// Đợi Flatpickr init xong rồi mới set giá trị
	setTimeout(function () {
		// Clear Tên bệnh nhân
		const patientNameInput = document.getElementById('filterPatientName');
		if (patientNameInput) {
			patientNameInput.value = '';
		}

		// Set giá trị mặc định cho From Date
		if (fromDateInput) {
			fromDateInput.value = startDateDefault;
			// Trigger Flatpickr to update display
			if (fromDateInput._flatpickr) {
				fromDateInput._flatpickr.setDate(startDateDefault, true);
			}
		}

		// Set giá trị mặc định cho To Date
		if (toDateInput) {
			toDateInput.value = endDateDefault;
			// Trigger Flatpickr to update display
			if (toDateInput._flatpickr) {
				toDateInput._flatpickr.setDate(endDateDefault, true);
			}
		}

		// Update filterState
		filterState.patient_name = '';
		filterState.from_date = startDateDefault;
		filterState.to_date = endDateDefault;
		applyFilters();
	}, 200);
	// Select all checkbox
	const selectAll = document.getElementById('selectAllOrders');
	if (selectAll) {
		selectAll.addEventListener('change', function () {
			const checkboxes = document.querySelectorAll('.order-select');
			checkboxes.forEach(cb => {
				cb.checked = this.checked;
				const orderId = parseInt(cb.dataset.orderId);
				if (this.checked) {
					selectedOrderIds.add(orderId);
				} else {
					selectedOrderIds.delete(orderId);
				}
			});
			updateSelectedCount();
		});
	}
	// Refresh button - reset tất cả filter và reload
	ctx.refreshBtn = document.getElementById('refreshBtn');
}

function runOrderPageInit2(ctx) {
	if (ctx.refreshBtn) {
		ctx.refreshBtn.addEventListener('click', () => {
			// Reset filter fields
			const patientNameInput = document.getElementById('filterPatientName');
			const fromDateInput = document.getElementById('filterFromDate');
			const toDateInput = document.getElementById('filterToDate');

			// Clear Tên bệnh nhân
			if (patientNameInput) {
				patientNameInput.value = '';
			}

			// Reset Từ ngày về đầu năm hiện tại
			const currentYear = new Date().getFullYear();
			const startDateDefault = `${currentYear}-01-01`;
			const endDateDefault = `${currentYear}-12-31`;

			if (fromDateInput) {
				fromDateInput.value = startDateDefault;
				if (fromDateInput._flatpickr) {
					fromDateInput._flatpickr.setDate(startDateDefault, true);
				}
			}

			// Reset Đến ngày về cuối năm hiện tại
			if (toDateInput) {
				toDateInput.value = endDateDefault;
				if (toDateInput._flatpickr) {
					toDateInput._flatpickr.setDate(endDateDefault, true);
				}
			}

			// Reset filter state
			filterState.patient_name = '';
			filterState.from_date = startDateDefault;
			filterState.to_date = endDateDefault;
			filterState.location_type = '';

			// Reload danh sách
			state.currentPage = 1;
			loadOrders();
			showCustomToast('success', 'Đã làm mới bộ lọc và danh sách');
		});
	}
	// Batch delete button
	const batchDeleteBtn = document.getElementById('batchDeleteBtn');
	if (batchDeleteBtn) {
		batchDeleteBtn.addEventListener('click', batchDeleteOrders);
	}
	// Modal event listeners - chỉ setup một lần khi page load
	// để đảm bảo luôn có currentOrderDetail và tránh duplicate listeners

	// Load initial data
	loadOrders();
	if (QLPKRealtimePageHooks) {
		QLPKRealtimePageHooks.register({
			types: ['order.changed', 'examination.changed', 'survey.changed', 'catalog.changed'],
			debounceMs: 500,
			handler: async function (event) {
				loadOrders();
				if (event.type === 'catalog.changed' && state.currentExaminationId) {
					await checkSurveyStatusUpdate(state.currentExaminationId);
					return;
				}
				if (state.currentExaminationId && (!event.payload || !event.payload.examination_id || Number(event.payload.examination_id) === Number(state.currentExaminationId))) {
					await checkSurveyStatusUpdate(state.currentExaminationId);
				}
			}
		});
	}
	// ✅ Reload khi tab được focus lại để đồng bộ dữ liệu với các trang khác
	ctx.lastReloadTime = 0;
	ctx.MIN_RELOAD_INTERVAL_MS = 2000;
	// Tối thiểu 2 giây giữa các lần reload

	// Reload khi tab được focus lại
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			// Tab được focus lại
			const now = Date.now();
			if (now - ctx.lastReloadTime > ctx.MIN_RELOAD_INTERVAL_MS) {
				ctx.lastReloadTime = now;
				loadOrders();
			}
		}
	});
}

function runOrderPageInit3(ctx) {
	// Reload khi window được focus lại (khi chuyển tab trình duyệt)
	window.addEventListener('focus', () => {
		const now = Date.now();
		if (now - ctx.lastReloadTime > ctx.MIN_RELOAD_INTERVAL_MS) {
			ctx.lastReloadTime = now;
			loadOrders();
		}
	});
}

function initializePage() {
	const ctx = {};
	runOrderPageInit1(ctx);
	runOrderPageInit2(ctx);
	runOrderPageInit3(ctx);
}

export { initializePage };
