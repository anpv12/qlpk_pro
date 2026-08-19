(function () {
	'use strict';

	function getPerformerName(order) {
		return order.location_type === 'in'
			? (order.in_house_unit || order.performer || '')
			: (order.out_facility || order.performer || '');
	}

	function renderOrderRow(order, index, options = {}) {
		const escapeHtml = options.escapeHtml || ((value = '') => String(value));
		const formatDisplayDate = options.formatDisplayDate || ((value) => value || '');
		const getOrderStatusConfig = options.getOrderStatusConfig || (() => ({ className: 'status-sent' }));
		const performerName = getPerformerName(order);
		const currentStatus = order.status || 'draft';
		const statusCfg = getOrderStatusConfig(currentStatus);
		const statusClass = statusCfg.className;
		const displayDate = formatDisplayDate(order.scheduled_for) || '—';
		const isInHouse = order.location_type === 'in';
		const isCompleted = currentStatus === 'completed';
		const isStatusLocked = isInHouse && isCompleted;
		const isSurvey = options.showSurveyBadge && !!order.survey_template_id;
		const surveyBadge = isSurvey
			? '<span class="badge bg-primary-subtle text-primary ms-1" title="Khảo sát Tâm lý"><i class="bi bi-clipboard-pulse"></i></span>'
			: '';
		const nameClass = options.showSurveyBadge ? 'fw-semibold d-flex align-items-center' : 'fw-semibold';

		return `
            <tr data-order-entry="${order.tempId}" ${isSurvey ? 'class="survey-order-row"' : ''}>
                <td>${index + 1}</td>
                <td>
                    <div class="${nameClass}">${escapeHtml(order.order_name || '')}${surveyBadge}</div>
                </td>
                <td>
                    <div>${escapeHtml(performerName || '—')}</div>
                </td>
                <td>${displayDate}</td>
                <td>
                    <div class="order-status-dropdown">
                        <select class="${statusClass}" 
                                data-order-status="${order.tempId}" 
                                data-current-status="${currentStatus}"
                                data-location-type="${order.location_type || ''}"
                                ${isStatusLocked ? 'disabled' : ''}
                                title="${isStatusLocked ? 'Trạng thái này đã được đồng bộ từ Quản lý chỉ định CLS và không thể chỉnh sửa' : ''}">
                            <option value="draft" ${currentStatus === 'draft' ? 'selected' : ''}>Dự thảo</option>
                            <option value="sent" ${currentStatus === 'sent' ? 'selected' : ''}>Chuyển thực hiện</option>
                            <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Hoàn thành</option>
                        </select>
                    </div>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" 
                            data-edit-order="${order.tempId}"
                            ${isStatusLocked ? 'disabled title="Không thể chỉnh sửa chỉ định đã hoàn thành trong cơ sở"' : ''}>
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-delete-order="${order.tempId}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
	}

	function renderSelectedOrdersTable(orders = [], options = {}) {
		const doc = options.document || document;
		const tableBody = doc.getElementById('orderSelectionsTableBody');
		const emptyEl = doc.getElementById('orderSelectionsEmptyState');
		if (!tableBody || !emptyEl) return false;

		if (!orders.length) {
			tableBody.innerHTML = '';
			emptyEl.classList.remove('d-none');
			return false;
		}

		emptyEl.classList.add('d-none');
		tableBody.innerHTML = orders.map((order, index) => renderOrderRow(order, index, options)).join('');
		return true;
	}

	function updateOrderStatusDropdownClasses(options = {}) {
		const doc = options.document || document;
		const getOrderStatusConfig = options.getOrderStatusConfig || (() => ({ className: 'status-sent' }));
		const statusSelects = doc.querySelectorAll('[data-order-status]');
		statusSelects.forEach((select) => {
			const selectedValue = select.value;
			const statusCfg = getOrderStatusConfig(selectedValue);
			select.classList.remove('status-draft', 'status-sent', 'status-completed');
			select.classList.add(statusCfg.className);
		});
	}

	function renderSelectedOrdersSection(orders = [], options = {}) {
		const hasRenderedRows = renderSelectedOrdersTable(orders, options);
		if (typeof options.renderPrintPreview === 'function') {
			options.renderPrintPreview();
		}

		if (hasRenderedRows) {
			if (typeof options.updateStatusDropdownClasses === 'function') {
				options.updateStatusDropdownClasses();
			} else {
				updateOrderStatusDropdownClasses(options);
			}
		}

		return hasRenderedRows;
	}

	function restoreLockedStatus(select, currentStatus) {
		select.value = currentStatus;
	}

	function bindSelectedOrdersTableEvents(tableBody, options = {}) {
		if (!tableBody) return null;
		const getOrderStatusConfig = options.getOrderStatusConfig || (() => ({ className: 'status-sent' }));

		const clickHandler = (event) => {
			const deleteBtn = event.target.closest('[data-delete-order]');
			if (deleteBtn) {
				if (typeof options.onDelete === 'function') {
					options.onDelete(deleteBtn.getAttribute('data-delete-order'), deleteBtn, event);
				}
				return;
			}

			const editBtn = event.target.closest('[data-edit-order]');
			if (editBtn && typeof options.onEdit === 'function') {
				options.onEdit(editBtn.getAttribute('data-edit-order'), editBtn, event);
			}
		};

		const changeHandler = (event) => {
			const statusSelect = event.target.closest('[data-order-status]');
			if (!statusSelect) return;

			const orderTempId = statusSelect.getAttribute('data-order-status');
			const locationType = statusSelect.getAttribute('data-location-type');
			const currentStatus = statusSelect.getAttribute('data-current-status');
			const newStatus = statusSelect.value;
			const isLocked = statusSelect.disabled || (locationType === 'in' && currentStatus === 'completed');

			if (isLocked) {
				restoreLockedStatus(statusSelect, currentStatus);
				if (typeof options.onLockedStatusChange === 'function') {
					options.onLockedStatusChange({ orderTempId, currentStatus, newStatus, statusSelect, event });
				}
				return;
			}

			const statusCfg = getOrderStatusConfig(newStatus);
			statusSelect.classList.remove('status-draft', 'status-sent', 'status-completed');
			statusSelect.classList.add(statusCfg.className);
			statusSelect.setAttribute('data-current-status', newStatus);

			if (typeof options.onStatusChange === 'function') {
				options.onStatusChange({ orderTempId, newStatus, currentStatus, statusSelect, event });
			}
		};

		tableBody.addEventListener('click', clickHandler);
		tableBody.addEventListener('change', changeHandler);

		return function cleanupSelectedOrdersTableEvents() {
			tableBody.removeEventListener('click', clickHandler);
			tableBody.removeEventListener('change', changeHandler);
		};
	}

	function createSelectedOrdersTableAdapter(options = {}) {
		const adapter = {};
		const buildOptions = () => ({
			document: options.document,
			escapeHtml: options.escapeHtml,
			formatDisplayDate: options.formatDisplayDate,
			getOrderStatusConfig: options.getOrderStatusConfig,
			showSurveyBadge: !!options.showSurveyBadge,
			renderPrintPreview: options.renderPrintPreview,
			updateStatusDropdownClasses: adapter.updateStatusDropdownClasses
		});

		adapter.renderSelectedOrders = function (orders = []) {
			return renderSelectedOrdersSection(orders, buildOptions());
		};

		adapter.updateStatusDropdownClasses = function () {
			return updateOrderStatusDropdownClasses(buildOptions());
		};

		return adapter;
	}

	const api = {
		renderSelectedOrdersTable,
		renderSelectedOrdersSection,
		bindSelectedOrdersTableEvents,
		updateOrderStatusDropdownClasses,
		createSelectedOrdersTableAdapter
	};

	window.ClinicalOrderSelectedTableUiUtils = api;
	window.DoctorExaminationOrderSelectedTableUiUtils = api;
	window.PsychologistExaminationOrderSelectedTableUiUtils = api;
})();
