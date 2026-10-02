import { el, replace } from '../shared/dom.js';
import { state } from './order-management-state.js';
import { FILTER_INPUT_DEBOUNCE_MS, apiCall, filterState, formatDisplayDate, getStatusBadge, loadOrders, selectedOrderIds, showConfirmDialog, showCustomToast } from '../order-management.js';

// Render timeline
function surveyClosureText(order) {
    const reason = ({ expired: 'Hết thời hạn khảo sát', doctor: 'Bác sĩ kết thúc khảo sát' })[order.completion_reason] || 'Khảo sát đã kết thúc';
    return `${reason}${order.completed_at ? ` · ${formatDisplayDate(order.completed_at)}` : ''}`;
}

function timelineStepDetail(order, value, timestamps) {
    if (value === 'completed' && order.status === 'completed') return surveyClosureText(order);
    if (timestamps[value]) return formatDisplayDate(timestamps[value]);
    if (order.status === 'completed' && value === 'has_result') return 'Chưa ghi nhận bài nộp hợp lệ';
    return '';
}

function renderTimeline(order) {
    const statusBadge = document.getElementById('orderSurveyStatus');
    if (statusBadge) replace(statusBadge, getStatusBadge(order.status));
    const target = document.querySelector('#orderDetailModal .timeline');
    if (!target) return;
    const states = order.survey_template_id ? ['sent', 'survey_sent', 'has_result', 'completed'] : ['sent', 'completed'];
    const current = states.indexOf(order.status);
    const timestamps = {sent: order.created_at, survey_sent: order.survey_sent_at, has_result: order.result_at, completed: order.completed_at};
    replace(target, states.map((value, index) => {
        const label = window.ClinicalOrderStatusUtils.getOrderStatusConfig(value).label;
        const reached = index === current && value !== 'completed' ? 'active' : 'done';
        const step = timestamps[value] ? reached : 'pending';
        const detail = timelineStepDetail(order, value, timestamps);
        return el('div', { class: `timeline-item ${step}` },
            el('div', { class: 'fw-semibold om-timeline-step-title' }, label),
            detail ? el('div', { class: 'om-timeline-step-sub' }, detail) : null);
    }));
}

async function refreshCurrentOrderStatus() {
    const id = state.currentOrderDetail?.id;
    if (!id) return;
    const response = await apiCall(`/api/chi-dinh/${id}`);
    if (!response.ok) throw new Error('Không tải được trạng thái chỉ định');
    const order = await response.json();
    if (state.currentOrderDetail?.id !== id) return;
    const data = order.data || order;
    Object.assign(state.currentOrderDetail, data);
    const select = document.getElementById('orderStatusSelect');
    if (select) select.value = data.status;
    renderTimeline(state.currentOrderDetail);
}

// Update order note
async function updateOrderNote(orderId, noteType, noteValue) {
	try {
		const updateData = {};
		updateData[noteType] = noteValue;


		const response = await apiCall(`/api/chi-dinh/${orderId}`, {
			method: 'PUT',
			body: JSON.stringify(updateData)
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi cập nhật');
		}

		const result = await response.json();

		// Hiển thị message phù hợp với từng loại update
		if (noteType === 'status') {
			showCustomToast('success', 'Cập nhật trạng thái thành công');
		} else {
			showCustomToast('success', 'Cập nhật thành công');
		}

		return result;

	} catch (error) {
		console.error(`❌ Error updating ${noteType}:`, error);
		showCustomToast('error', 'Không thể cập nhật chỉ định. Vui lòng thử lại.');
		throw error; // Re-throw để caller có thể handle
	}
}

// Delete order
async function deleteOrder(orderId) {
	const confirmed = await showConfirmDialog({
		title: 'Xóa chỉ định',
		text: 'Bạn có chắc muốn xóa chỉ định này?',
		confirmText: 'Xóa',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall(`/api/chi-dinh/${orderId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa chỉ định');
		}

		showCustomToast('success', 'Xóa chỉ định thành công');
		selectedOrderIds.delete(orderId);
		await loadOrders();

	} catch (error) {
		console.error('Error deleting order:', error);
		showCustomToast('error', 'Không thể xóa chỉ định. Vui lòng thử lại.');
	}
}

// Batch delete
async function batchDeleteOrders() {
	if (selectedOrderIds.size === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một chỉ định để xóa');
		return;
	}

	const confirmed = await showConfirmDialog({
		title: 'Xóa nhiều chỉ định',
		text: `Bạn có chắc muốn xóa ${selectedOrderIds.size} chỉ định đã chọn?`,
		confirmText: 'Xóa tất cả',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall('/api/chi-dinh/batch-delete', {
			method: 'POST',
			body: JSON.stringify({
				ids: Array.from(selectedOrderIds)
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa chỉ định');
		}

		showCustomToast('success', `Đã xóa ${selectedOrderIds.size} chỉ định thành công`);
		selectedOrderIds.clear();
		await loadOrders();

	} catch (error) {
		console.error('Error batch deleting:', error);
		showCustomToast('error', 'Không thể xóa chỉ định. Vui lòng thử lại.');
	}
}

// Apply filters
function applyFilters() {
	const patientNameValue = document.getElementById('filterPatientName')?.value || '';
	filterState.patient_name = patientNameValue;
	filterState.from_date = document.getElementById('filterFromDate')?.value || '';
	filterState.to_date = document.getElementById('filterToDate')?.value || '';
	filterState.location_type = ''; // Thay đổi từ 'in' thành '' để không filter mặc định

	state.currentPage = 1;
	loadOrders();
}

function scheduleFilterApply() {
	if (state.filterInputTimer) {
		clearTimeout(state.filterInputTimer);
	}
	state.filterInputTimer = setTimeout(() => {
		applyFilters();
	}, FILTER_INPUT_DEBOUNCE_MS);
}

// Handle Enter key để search ngay lập tức (không cần chờ debounce)
function handlePatientInputKeydown(event) {
	if (event.key === 'Enter') {
		// Cancel debounce timer
		if (state.filterInputTimer) {
			clearTimeout(state.filterInputTimer);
			state.filterInputTimer = null;
		}
		// Search ngay lập tức
		applyFilters();
		// Prevent form submission nếu có
		event.preventDefault();
	}
}

function setupAutoFilterListeners() {
	const patientInput = document.getElementById('filterPatientName');
	const fromDateInput = document.getElementById('filterFromDate');
	const toDateInput = document.getElementById('filterToDate');


	if (patientInput) {
		// Remove existing listener if any
		if (state.patientInputHandler) {
			patientInput.removeEventListener('input', state.patientInputHandler);
		}
		if (state.patientInputKeydownHandler) {
			patientInput.removeEventListener('keydown', state.patientInputKeydownHandler);
		}
		// Create new handlers
		state.patientInputHandler = scheduleFilterApply;
		state.patientInputKeydownHandler = handlePatientInputKeydown;
		patientInput.addEventListener('input', state.patientInputHandler);
		// Thêm Enter key để search ngay lập tức
		patientInput.addEventListener('keydown', state.patientInputKeydownHandler);
	} else {
		console.error('[Filter Setup] filterPatientName element not found!');
	}
	if (fromDateInput) {
		fromDateInput.addEventListener('change', applyFilters);
	}
	if (toDateInput) {
		toDateInput.addEventListener('change', applyFilters);
	}
}

function selectOrderGroup(group) {
	filterState.status_group = group;
	document.querySelectorAll('[data-status-group]').forEach(button => {
		const selected = button.dataset.statusGroup === group;
		button.classList.toggle('active', selected);
		button.setAttribute('aria-selected', String(selected));
		button.tabIndex = selected ? 0 : -1;
		if (selected) document.getElementById('ordersListPanel').setAttribute('aria-labelledby', button.id);
	});
	selectedOrderIds.clear();
	applyFilters();
}

export { applyFilters, batchDeleteOrders, deleteOrder, refreshCurrentOrderStatus, renderTimeline, selectOrderGroup, setupAutoFilterListeners, updateOrderNote };
