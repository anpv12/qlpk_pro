import { el, replace } from './shared/dom.js';
import { QLPKConfirmationDialog } from './shared/confirmation-dialog.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';
import { initDatepickerWithValue } from './datepicker-init.js';
/**
 * Joint Exam Manager - Module quản lý "Người đi khám cùng"
 * DRY: Dùng chung cho receptionist, doctor, psychologist
 */


async function confirmJointExamDelete(showToast) {
	return QLPKConfirmationDialog.confirm({
		title: 'Xác nhận xóa',
		text: 'Bạn có chắc chắn muốn xóa người đi khám cùng này?',
		confirmText: 'Xóa',
		variant: 'danger',
		showToast
	});
}

function getJointExamActionIcon(action) {
	switch (action) {
		case 'edit':
			return 'bi-pencil-fill';
		case 'delete':
			return 'bi-x-lg';
		case 'save':
			return 'bi-check-lg';
		case 'cancel':
			return 'bi-x-lg';
		default:
			return 'bi-info-circle-fill';
	}
}

function renderJointExamActionButton(action, className, title, attrs = {}) {
	const buttonRole = { edit: 'edit', delete: 'danger', save: 'execute', cancel: 'neutral' }[action] || 'neutral';
	return el('button', { 'data-qlpk-button': buttonRole, 'data-qlpk-button-variant': 'soft', type: 'button', class: className, title, 'aria-label': title, ...attrs },
		el('i', { class: `bi ${getJointExamActionIcon(action)}`, 'aria-hidden': 'true' }));
}

/**
 * JointExamManager - Class quản lý người đi khám cùng
 * @param {Object} options - Cấu hình
 * @param {Function} options.getAppointmentId - Hàm lấy appointment ID hiện tại
 * @param {Function} options.onReloadFamilyMembers - Callback khi cần reload "Người thân liên kết"
 * @param {Function} options.showToast - Hàm hiển thị toast (default: showCustomToast)
 * @param {Function} options.apiCall - Hàm gọi API (default: fetch)
 * @param {Function} options.formatDateDisplay - Hàm format date (default: the page date formatter)
 */
class JointExamManager {
	constructor(options = {}) {
		// Required options
		this.getAppointmentId = options.getAppointmentId || (() => null);

		// Optional callbacks
		this.onReloadFamilyMembers = options.onReloadFamilyMembers || null;
		this.getContextToken = options.getContextToken || (() => null);

		// Utility dependencies
		this.showToast = options.showToast
			|| ((type, msg) => QLPKUserFeedback?.show(type, msg));
		this.apiCall = options.apiCall || fetch;
		this.formatDateDisplay = options.formatDateDisplay || this._defaultFormatDateDisplay;

		// State
		this.pendingJointExamRow = null;
		this.pendingJointExamList = [];
		this.pendingSaveToken = 0;
		this.pendingSaving = false;
		this.mutation = null;
		this.loadRevision = 0;
		this.editRevision = 0;
		this.rowContexts = new WeakMap();
		this.tableActionBound = false;

		// DOM elements (sẽ được set khi init)
		this.tableBody = null;
		this.emptyState = null;
		this.addButton = null;
	}

	/**
	 * Khởi tạo manager với DOM elements
	 * @param {string} tableBodyId - ID của tbody element
	 * @param {string} emptyStateSelector - Selector của empty state element
	 * @param {string} addButtonSelector - Selector của button thêm mới
	 */
	init(tableBodyId = 'jointExamTableBody', emptyStateSelector = '.joint-exam-empty-state', addButtonSelector = '.btn-add-joint-exam') {
		this.tableBody = document.getElementById(tableBodyId);
		this.emptyState = document.querySelector(emptyStateSelector);
		this.addButton = document.querySelector(addButtonSelector);

		// Setup event listeners
		if (this.addButton) {
			this.addButton.addEventListener('click', () => {
				this.showCreateRow();
			});
		}

		this.bindTableActions();
	}

	bindTableActions() {
		if (!this.tableBody || this.tableActionBound) return;
		this.tableBody.addEventListener('click', (event) => {
			const actionButton = event.target.closest('[data-joint-exam-action]');
			if (!actionButton || !this.tableBody.contains(actionButton)) return;

			const action = actionButton.dataset.jointExamAction;
			const rowId = actionButton.dataset.jointExamId;
			const tempId = actionButton.dataset.jointExamTempId;

			if (action === 'edit' && rowId) {
				this.edit(Number(rowId));
			} else if (action === 'delete' && rowId) {
				this.delete(Number(rowId));
			} else if (action === 'edit-pending' && tempId) {
				this.editPending(tempId);
			} else if (action === 'delete-pending' && tempId) {
				this.deletePending(tempId);
			}
		});
		this.tableActionBound = true;
	}

	/**
	 * Load danh sách người đi khám cùng
	 */
	createContextGuard(options = {}) {
		const appointmentId = this.getAppointmentId();
		const token = this.pendingSaveToken;
		const contextToken = this.getContextToken();
		return () => token === this.pendingSaveToken && contextToken === this.getContextToken()
			&& appointmentId === this.getAppointmentId() && options.isCurrentContext?.() !== false;
	}

	isLoadBlocked(options) {
		if (options.allowWhileSaving) return false;
		if (this.mutation?.isCurrentContext()) return true;
		return Boolean(this.pendingJointExamRow && this.rowContexts.get(this.pendingJointExamRow)?.()
			&& !options.discardEditing);
	}

	showJointExamRows(relatives) {
		if (this.tableBody) this.tableBody.replaceChildren();
		const empty = !relatives || relatives.length === 0;
		this.emptyState?.classList.toggle('active', empty);
		if (!empty && this.tableBody) this.renderTable(relatives);
	}

	async fetchJointExamRows(appointmentId, isCurrentContext) {
		const response = await this.apiCall(`/api/appointment-relatives/appointment/${appointmentId}`);
		if (!isCurrentContext()) return null;
		if (!response.ok) return [];
		const data = await response.json();
		if (!isCurrentContext()) return null;
		if (data.success !== true || !Array.isArray(data.data)) throw new Error('joint-exam-list-unconfirmed');
		return data.data;
	}

	async load(options = {}) {
		if (this.isLoadBlocked(options)) return false;
		const appointmentId = this.getAppointmentId();
		const revision = ++this.loadRevision;
		this.editRevision++;
		const contextGuard = this.createContextGuard(options);
		const isCurrentContext = () => contextGuard() && revision === this.loadRevision;
		if (!isCurrentContext()) return false;
		this.pendingJointExamRow?.remove();
		this.pendingJointExamRow = null;
		if (this.tableBody) this.tableBody.replaceChildren();

		// Nếu chưa có appointment, hiển thị danh sách tạm
		if (!appointmentId) {
			this.renderPendingList();
			return;
		}

		try {
			const relatives = await this.fetchJointExamRows(appointmentId, isCurrentContext);
			if (relatives === null) return false;
			this.showJointExamRows(relatives);
		} catch (error) {
			if (!isCurrentContext()) return false;
			console.error('Error loading joint exam list:', error);
			this.showJointExamRows([]);
		}
	}

	lockRowControls(row) {
		const controls = Array.from(row?.querySelectorAll('input, button, select, textarea') || []);
		const disabledStates = controls.map(control => control.disabled);
		controls.forEach(control => { control.disabled = true; });
		return () => controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
	}

	async sendRelativeMutation(options, isCurrentContext) {
		const response = await this.apiCall(options.url, options.request);
		if (!isCurrentContext()) return false;
		if (!response.ok) throw new Error('joint-exam-write-failed');
		const result = await response.json();
		if (!isCurrentContext()) return false;
		if (result.success !== true || (options.request.method !== 'DELETE' && !result.data?.id)) {
			throw new Error('joint-exam-write-unconfirmed');
		}
		return true;
	}

	async mutateRelative(options) {
		if (this.pendingSaving || this.mutation) return false;
		const row = options.row;
		const contextGuard = this.createContextGuard();
		const rowGuard = row && this.rowContexts.get(row);
		const isCurrentContext = () => contextGuard() && (!rowGuard || rowGuard());
		if (!isCurrentContext()) return false;
		const operation = { isCurrentContext: contextGuard };
		this.mutation = operation;
		this.loadRevision++;
		const restoreControls = this.lockRowControls(row);
		try {
			if (options.confirm && !await confirmJointExamDelete(this.showToast)) return false;
			if (!isCurrentContext()) return false;
			if (!await this.sendRelativeMutation(options, isCurrentContext)) return false;
			options.onSaved?.();
			this.showToast('success', options.successMessage);
			await this.load({ isCurrentContext: contextGuard, allowWhileSaving: true });
			if (contextGuard()) await this.onReloadFamilyMembers?.();
			return true;
		} catch (error) {
			if (isCurrentContext()) {
				console.error('Error saving joint exam action:', error);
				this.showToast('error', 'Không thể lưu thay đổi người đi khám cùng. Vui lòng thử lại.');
			}
			return false;
		} finally {
			restoreControls();
			if (this.mutation === operation) this.mutation = null;
		}
	}

	/**
	 * Render table người đi khám cùng
	 */
	renderTable(relatives) {
		if (!this.tableBody) return;
		this.renderedContextGuard = this.createContextGuard();

		replace(this.tableBody, relatives.map((relative, index) => {
			// Format ngày đi cùng từ joint_date (ưu tiên), sau đó appointment_date hoặc created_at
			let jointDate = '';
			if (relative.joint_date) {
				jointDate = this.formatDateDisplay(relative.joint_date);
			} else if (relative.appointment_date) {
				jointDate = this.formatDateDisplay(relative.appointment_date);
			} else if (relative.created_at) {
				const date = new Date(relative.created_at);
				jointDate = date.toLocaleDateString('vi-VN');
			}

			return el('tr', { 'data-id': relative.id },
				el('td', { class: 'joint-exam-row-index relative-table-center' }, index + 1, '.'),
				el('td', null, relative.name || ''),
				el('td', null, relative.kinship || ''),
				el('td', null, relative.id_number || ''),
				el('td', null, relative.phone || ''),
				el('td', { class: 'relative-table-center' }, jointDate),
				el('td', { class: 'relative-table-center' },
					el('div', { class: 'relative-row-actions' },
						renderJointExamActionButton('edit', 'edit', 'Chỉnh sửa', { 'data-joint-exam-action': 'edit', 'data-joint-exam-id': relative.id }),
						' ',
						renderJointExamActionButton('delete', 'remove', 'Xóa', { 'data-joint-exam-action': 'delete', 'data-joint-exam-id': relative.id })
					)
				)
			);
		}));
	}

	/**
	 * Hiển thị row mới để thêm
	 */
	showCreateRow() {
		if (this.pendingSaving || this.mutation) return;
		if (!this.tableBody) return;
		if (this.pendingJointExamRow) {
			this.showToast('error', 'Vui lòng hoàn thành thao tác hiện tại');
			return;
		}

		// Lấy ngày hôm nay để set default
		const today = new Date();
		const defaultDate = today.toISOString().split('T')[0];

		const tr = document.createElement('tr');
		tr.classList.add('editing-row');
		replace(tr, [
			el('td', { class: 'joint-exam-row-index relative-table-center' }, '+'),
			el('td', { class: 'relative-cell-overlay' },
				el('div', { class: 'relative-input-wrap' },
					el('input', { 'aria-label': 'Họ tên người thân', class: 'relative-row-input', id: 'jointExamNameInput', placeholder: 'Nhập/tìm họ tên', autocomplete: 'off' }),
					' ',
					el('div', { class: 'joint-exam-search-dropdown', id: 'jointExamSearchDropdown' })
				)
			),
			el('td', null,
				el('input', { 'aria-label': 'Quan hệ', class: 'relative-row-input', id: 'jointExamKinshipInput', placeholder: 'Quan hệ', list: 'joint-exam-kinship-list', autocomplete: 'off' })
			),
			el('td', null,
				el('input', { 'aria-label': 'CCCD/CMND', class: 'relative-row-input', id: 'jointExamIdNumberInput', placeholder: 'CCCD/CMND', maxlength: '12' })
			),
			el('td', null,
				el('input', { 'aria-label': 'Số điện thoại', class: 'relative-row-input', id: 'jointExamPhoneInput', placeholder: 'Số điện thoại' })
			),
			el('td', { class: 'relative-table-center' },
				el('input', { 'aria-label': 'Ngày đi khám cùng', class: 'relative-row-input js-datepicker joint-exam-date-input', id: 'jointExamDateInput', 'data-date-format': 'Y-m-d', 'data-alt-format': 'd/m/Y', placeholder: 'dd/mm/yyyy' })
			),
			el('td', { class: 'relative-table-center' },
				el('div', { class: 'relative-row-actions' },
					renderJointExamActionButton('save', 'btn-save', 'Lưu'),
					' ',
					renderJointExamActionButton('cancel', 'btn-cancel', 'Hủy')
				)
			)
		]);

		this.tableBody.prepend(tr);
		this.pendingJointExamRow = tr;
		this.editRevision++;
		this.loadRevision++;
		const isCurrentContext = this.createContextGuard();
		this.rowContexts.set(tr, () => isCurrentContext() && this.tableBody.contains(tr));

		// Lưu patient_id khi chọn từ hệ thống
		tr.dataset.relativePatientId = '';

		// Setup autocomplete cho name input
		this.setupNameAutocomplete(tr);

		// Focus vào input đầu tiên
		tr.querySelector('#jointExamNameInput').focus();

		// Event listeners
		tr.querySelector('.btn-save').addEventListener('click', () => {
			this.saveNew(tr);
		});

		tr.querySelector('.btn-cancel').addEventListener('click', () => {
			if (this.mutation || !isCurrentContext()) return;
			tr.remove();
			this.pendingJointExamRow = null;
		});

		// Init Flatpickr for dynamic date input
		initDatepickerWithValue?.(tr.querySelector('#jointExamDateInput'), defaultDate);
	}

	/**
	 * Lưu row mới
	 */
	async saveNew(tr) {
		if (this.pendingSaving || this.mutation || this.rowContexts.get(tr)?.() === false) return;
		const appointmentId = this.getAppointmentId();

		const name = tr.querySelector('#jointExamNameInput').value.trim();
		const idNumber = tr.querySelector('#jointExamIdNumberInput').value.trim();

		// Lấy relative_patient_id nếu có (khi chọn từ hệ thống)
		const relativePatientId = tr.dataset.relativePatientId ? parseInt(tr.dataset.relativePatientId) : null;

		// Validation: Nếu chọn từ hệ thống thì không require CCCD/CMND
		if (!name) {
			this.showToast('error', 'Vui lòng nhập Họ tên');
			return;
		}

		// Chỉ require CCCD/CMND nếu KHÔNG chọn từ hệ thống
		if (!relativePatientId && !idNumber) {
			this.showToast('error', 'Vui lòng nhập CCCD/CMND');
			return;
		}

		// Validation: Quan hệ là bắt buộc
		const kinship = tr.querySelector('#jointExamKinshipInput').value.trim();
		if (!kinship) {
			this.showToast('error', 'Vui lòng nhập Quan hệ');
			return;
		}

		const jointDate = tr.querySelector('#jointExamDateInput').value;

		const data = {
			name: name,
			id_number: idNumber,
			kinship: kinship,
			phone: tr.querySelector('#jointExamPhoneInput').value.trim() || null,
			joint_date: jointDate || null,
			relative_patient_id: relativePatientId
		};

		// Nếu chưa có appointment, lưu tạm vào pendingJointExamList
		if (!appointmentId) {
			const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
			data.temp_id = tempId;
			data.relative_patient_id = relativePatientId;
			this.pendingJointExamList.push(data);

			this.showToast('success', 'Đã thêm người đi khám cùng (sẽ lưu khi tạo lịch hẹn)');
			tr.remove();
			this.pendingJointExamRow = null;
			this.renderPendingList();
			return;
		}

		// Nếu đã có appointment, lưu vào database
		data.appointment_id = appointmentId;

		return this.mutateRelative({
			row: tr,
			url: '/api/appointment-relatives',
			request: { method: 'POST', body: JSON.stringify(data) },
			successMessage: 'Đã thêm người đi khám cùng thành công',
			onSaved: () => {
				tr.remove();
				if (this.pendingJointExamRow === tr) this.pendingJointExamRow = null;
			}
		});
	}

}

export { JointExamManager, renderJointExamActionButton, confirmJointExamDelete };
