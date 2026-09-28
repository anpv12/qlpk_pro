/**
 * Joint Exam Manager - Module quản lý "Người đi khám cùng"
 * DRY: Dùng chung cho receptionist, doctor, psychologist
 */

(function (window) {
	'use strict';

	async function confirmJointExamDelete(showToast) {
		if (!window.QLPKConfirmationDialog) {
			showToast('error', 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.');
			return false;
		}
		return window.QLPKConfirmationDialog.confirm({
			title: 'Xác nhận xóa',
			text: 'Bạn có chắc chắn muốn xóa người đi khám cùng này?',
			confirmText: 'Xóa',
			variant: 'danger',
			showToast
		});
	}

	function escapeAttribute(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
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
		const attrHtml = Object.keys(attrs)
			.filter(key => attrs[key] !== undefined && attrs[key] !== null)
			.map(key => ` ${escapeAttribute(key)}="${escapeAttribute(attrs[key])}"`)
			.join('');
		return `<button data-qlpk-button="${buttonRole}" data-qlpk-button-variant="soft" type="button" class="${escapeAttribute(className)}" title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}"${attrHtml}><i class="bi ${getJointExamActionIcon(action)}" aria-hidden="true"></i></button>`;
	}

	/**
	 * JointExamManager - Class quản lý người đi khám cùng
	 * @param {Object} options - Cấu hình
	 * @param {Function} options.getAppointmentId - Hàm lấy appointment ID hiện tại
	 * @param {Function} options.onReloadFamilyMembers - Callback khi cần reload "Người thân liên kết"
	 * @param {Function} options.showToast - Hàm hiển thị toast (default: showCustomToast)
	 * @param {Function} options.apiCall - Hàm gọi API (default: window.apiCall)
	 * @param {Function} options.escapeHtml - Hàm escape HTML (default: window.escapeHtml)
	 * @param {Function} options.formatDateDisplay - Hàm format date (default: window.formatDateDisplay)
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
				|| window.showCustomToast
				|| ((type, msg) => window.QLPKUserFeedback?.show(type, msg));
			this.apiCall = options.apiCall || window.apiCall || fetch;
			this.escapeHtml = options.escapeHtml || this._defaultEscapeHtml;
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
			if (this.tableBody) this.tableBody.innerHTML = '';
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
			if (this.tableBody) this.tableBody.innerHTML = '';

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

			this.tableBody.innerHTML = relatives.map((relative, index) => {
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

				return `
                <tr data-id="${relative.id}">
                    <td class="joint-exam-row-index relative-table-center">${index + 1}.</td>
                    <td>${this.escapeHtml(relative.name || '')}</td>
                    <td>${this.escapeHtml(relative.kinship || '')}</td>
                    <td>${this.escapeHtml(relative.id_number || '')}</td>
                    <td>${this.escapeHtml(relative.phone || '')}</td>
                    <td class="relative-table-center">${jointDate}</td>
					<td class="relative-table-center">
                        <div class="relative-row-actions">
							${renderJointExamActionButton('edit', 'edit', 'Chỉnh sửa', { 'data-joint-exam-action': 'edit', 'data-joint-exam-id': relative.id })}
							${renderJointExamActionButton('delete', 'remove', 'Xóa', { 'data-joint-exam-action': 'delete', 'data-joint-exam-id': relative.id })}
                        </div>
                    </td>
                </tr>
            `;
			}).join('');
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
			tr.innerHTML = `
                <td class="joint-exam-row-index relative-table-center">+</td>
                <td class="relative-cell-overlay">
                    <div class="relative-input-wrap">
                        <input aria-label="Họ tên người thân" class="relative-row-input" id="jointExamNameInput" placeholder="Nhập/tìm họ tên" autocomplete="off">
                        <div class="joint-exam-search-dropdown" id="jointExamSearchDropdown"></div>
                    </div>
                </td>
                <td>
                    <input aria-label="Quan hệ" class="relative-row-input" id="jointExamKinshipInput" placeholder="Quan hệ" list="joint-exam-kinship-list" autocomplete="off">
                </td>
                <td>
                    <input aria-label="CCCD/CMND" class="relative-row-input" id="jointExamIdNumberInput" placeholder="CCCD/CMND" maxlength="12">
                </td>
                <td>
                    <input aria-label="Số điện thoại" class="relative-row-input" id="jointExamPhoneInput" placeholder="Số điện thoại">
                </td>
                <td class="relative-table-center">
                    <input aria-label="Ngày đi khám cùng" class="relative-row-input js-datepicker joint-exam-date-input" id="jointExamDateInput" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">
                </td>
                <td class="relative-table-center">
                    <div class="relative-row-actions">
                        ${renderJointExamActionButton('save', 'btn-save', 'Lưu')}
                        ${renderJointExamActionButton('cancel', 'btn-cancel', 'Hủy')}
                    </div>
                </td>
            `;

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
			window.initDatepickerWithValue?.(tr.querySelector('#jointExamDateInput'), defaultDate);
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

		/**
		 * Sửa inline (chuyển row sang edit mode)
		 */
		canStartEdit() {
			if (this.pendingSaving || this.mutation || this.renderedContextGuard?.() === false) return false;
			if (!this.pendingJointExamRow) return true;
			this.showToast('error', 'Vui lòng hoàn thành thao tác hiện tại');
			return false;
		}

		async fetchRelativeForEdit(relativeId, isCurrentContext) {
			const response = await this.apiCall(`/api/appointment-relatives/${relativeId}`);
			if (!isCurrentContext() || this.mutation) return null;
			if (!response.ok) {
				this.showToast('error', 'Không tìm thấy thông tin');
				return null;
			}
			const data = await response.json();
			if (!isCurrentContext() || this.mutation) return null;
			const relative = data.data;
			if (data.success !== true || !relative || String(relative.appointment_id) !== String(this.getAppointmentId())) {
				throw new Error('joint-exam-read-unconfirmed');
			}
			return relative;
		}

		async edit(relativeId) {
			if (!this.canStartEdit()) return;
			const row = this.tableBody?.querySelector(`tr[data-id="${relativeId}"]`);
			if (!row) return;
			const revision = ++this.editRevision;
			const contextGuard = this.createContextGuard();
			const isCurrentContext = () => contextGuard() && revision === this.editRevision && this.tableBody.contains(row);

			try {
				const relative = await this.fetchRelativeForEdit(relativeId, isCurrentContext);
				if (!relative) return;
				this.rowContexts.set(row, isCurrentContext);
				this.pendingJointExamRow = row;
				this.renderEditRow(row, relative, relativeId, isCurrentContext);
			} catch (error) {
				if (!isCurrentContext()) return;
				console.error('Error loading joint exam:', error);
				this.showToast('error', 'Không thể tải thông tin người đi khám cùng. Vui lòng thử lại.');
			}
		}

		renderEditRow(row, relative, relativeId, isCurrentContext) {
			// Chuyển row sang edit mode
			row.classList.add('editing-row');
			const cells = row.querySelectorAll('td');

			// Format date cho input - lấy từ joint_date hoặc dùng hôm nay
			let jointDateValue = '';
			if (relative.joint_date) {
				const date = new Date(relative.joint_date);
				jointDateValue = date.toISOString().split('T')[0];
			} else {
				const today = new Date();
				jointDateValue = today.toISOString().split('T')[0];
			}

			// Lưu relative_patient_id nếu có (từ API response)
			const relativePatientId = relative.relative_patient_id || null;
			row.dataset.relativePatientId = relativePatientId || '';

			// Disable CCCD/CMND và Số điện thoại nếu có relativePatientId (chọn từ hệ thống)
			const isFromSystem = relativePatientId && relativePatientId > 0;
			const idNumberDisabled = isFromSystem ? 'disabled' : '';
			const phoneDisabled = isFromSystem ? 'disabled' : '';
			const lockedInputTitle = isFromSystem ? 'Dữ liệu lấy từ hồ sơ bệnh nhân đã có' : '';

			cells[1].innerHTML = `
                    <div class="relative-input-wrap">
                        <input aria-label="Họ tên người thân" class="relative-row-input" value="${this.escapeHtml(relative.name || '')}" placeholder="Nhập/tìm họ tên" autocomplete="off">
                        <div class="joint-exam-search-dropdown"></div>
                    </div>
                `;
			cells[2].innerHTML = `<input aria-label="Quan hệ" class="relative-row-input" value="${this.escapeHtml(relative.kinship || '')}" list="joint-exam-kinship-list" autocomplete="off">`;
			cells[3].innerHTML = `<input aria-label="CCCD/CMND" class="relative-row-input" value="${this.escapeHtml(relative.id_number || '')}" maxlength="12" title="${lockedInputTitle}" ${idNumberDisabled}>`;
			cells[4].innerHTML = `<input aria-label="Số điện thoại" class="relative-row-input" value="${this.escapeHtml(relative.phone || '')}" title="${lockedInputTitle}" ${phoneDisabled}>`;
			cells[5].innerHTML = `<input aria-label="Ngày đi khám cùng" class="relative-row-input js-datepicker joint-exam-date-input" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">`;
			cells[6].innerHTML = `
                    <div class="relative-row-actions">
                        ${renderJointExamActionButton('save', 'btn-save', 'Lưu')}
                        ${renderJointExamActionButton('cancel', 'btn-cancel', 'Hủy')}
                    </div>
                `;

			// Setup autocomplete cho name input
			this.setupNameAutocomplete(row);
			this.applyLinkedPatientState(row, Boolean(isFromSystem));

			// Event listeners
			cells[6].querySelector('.btn-save').addEventListener('click', async () => {
				await this.update(row, relativeId);
			});

			cells[6].querySelector('.btn-cancel').addEventListener('click', () => {
				if (this.mutation || !isCurrentContext()) return;
				// Cleanup autocomplete
				if (row._jointExamAutocompleteCleanup) {
					row._jointExamAutocompleteCleanup();
				}
				this.load({ discardEditing: true });
			});

			// Focus vào input đầu tiên
			cells[1].querySelector('input').focus();

			// Init Flatpickr for dynamic date input in edit row
			window.initDatepickerWithValue?.(row.querySelector('td:nth-child(6) input'), jointDateValue);
		}

		/**
		 * Cập nhật inline
		 */
		async update(row, relativeId) {
			if (this.pendingSaving || this.mutation || this.rowContexts.get(row)?.() === false) return;
			const appointmentId = this.getAppointmentId();
			if (!appointmentId) {
				this.showToast('error', 'Vui lòng tạo lịch hẹn trước');
				return;
			}

			const inputs = row.querySelectorAll('input');
			const name = inputs[0].value.trim();
			const kinship = inputs[1].value.trim();
			const idNumber = inputs[2].value.trim();
			const phone = inputs[3].value.trim();
			const jointDate = inputs[4].value;

			// Lấy relative_patient_id nếu có
			const relativePatientId = row.dataset.relativePatientId ? parseInt(row.dataset.relativePatientId) : null;

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
			if (!kinship) {
				this.showToast('error', 'Vui lòng nhập Quan hệ');
				return;
			}

			const data = {
				appointment_id: appointmentId,
				name: name,
				id_number: idNumber,
				kinship: kinship,
				phone: phone || null,
				joint_date: jointDate || null,
				relative_patient_id: relativePatientId
			};

			return this.mutateRelative({
				row, url: `/api/appointment-relatives/${relativeId}`,
				request: { method: 'PUT', body: JSON.stringify(data) },
				successMessage: 'Đã cập nhật thành công'
			});
		}

		/**
		 * Xóa người đi khám cùng
		 */
		async delete(relativeId) {
			if (this.renderedContextGuard?.() === false || this.pendingJointExamRow) return false;
			return this.mutateRelative({
				url: `/api/appointment-relatives/${relativeId}`,
				request: { method: 'DELETE' }, confirm: true,
				successMessage: 'Đã xóa thành công'
			});
		}

		/**
		 * Render danh sách tạm (khi chưa có appointment)
		 */
		renderPendingList() {
			if (!this.tableBody) return;

			if (this.pendingJointExamList.length === 0) {
				this.tableBody.innerHTML = '';
				if (this.emptyState) this.emptyState.classList.add('active');
				return;
			}

			if (this.emptyState) this.emptyState.classList.remove('active');

			this.tableBody.innerHTML = this.pendingJointExamList.map((relative, index) => {
				let jointDate = '';
				if (relative.joint_date) {
					jointDate = this.formatDateDisplay(relative.joint_date);
				}

                return `
                <tr data-temp-id="${relative.temp_id}">
                    <td class="joint-exam-row-index relative-table-center">${index + 1}.</td>
                    <td>${this.escapeHtml(relative.name || '')}</td>
                    <td>${this.escapeHtml(relative.kinship || '')}</td>
                    <td>${this.escapeHtml(relative.id_number || '')}</td>
                    <td>${this.escapeHtml(relative.phone || '')}</td>
                    <td class="relative-table-center">${jointDate}</td>
                    <td class="relative-table-center">
                        <div class="relative-row-actions">
							${renderJointExamActionButton('edit', 'edit', 'Chỉnh sửa', { 'data-joint-exam-action': 'edit-pending', 'data-joint-exam-temp-id': relative.temp_id })}
							${renderJointExamActionButton('delete', 'remove', 'Xóa', { 'data-joint-exam-action': 'delete-pending', 'data-joint-exam-temp-id': relative.temp_id })}
                        </div>
                    </td>
                </tr>
            `;
			}).join('');
		}

		/**
		 * Lưu tất cả pending joint exam list vào database khi có appointmentId
		 */
		async savePendingRow(item, appointmentId, isCurrentContext) {
			if (!this.pendingJointExamList.includes(item)) throw new Error('joint-exam-draft-changed');
			const response = await this.apiCall('/api/appointment-relatives', {
				method: 'POST',
				body: JSON.stringify({
					appointment_id: appointmentId, name: item.name, id_number: item.id_number,
					kinship: item.kinship, phone: item.phone, joint_date: item.joint_date,
					relative_patient_id: item.relative_patient_id || null
				})
			});
			if (!isCurrentContext()) return false;
			if (!response.ok) throw new Error('joint-exam-save-failed');
			const result = await response.json();
			if (!isCurrentContext()) return false;
			if (result.success !== true || !result.data?.id) throw new Error('joint-exam-save-unconfirmed');
			const index = this.pendingJointExamList.indexOf(item);
			if (index === -1) throw new Error('joint-exam-draft-changed');
			this.pendingJointExamList.splice(index, 1);
			return true;
		}

		async savePendingList(appointmentId, options = {}) {
			if (this.pendingSaving || this.mutation) return { status: 'skipped', reason: 'saving' };
			if (this.pendingJointExamRow) return { status: 'error', reason: 'unfinished-row' };
			const token = this.pendingSaveToken;
			const isCurrentContext = () => token === this.pendingSaveToken
				&& appointmentId === this.getAppointmentId() && options.isCurrentContext?.() !== false;
			if (!isCurrentContext()) return { status: 'stale' };
			if (!appointmentId) return { status: 'error', reason: 'missing-appointment' };
			if (!this.pendingJointExamList.length) return { status: 'saved' };
			this.pendingSaving = true;
			try {
				for (const item of [...this.pendingJointExamList]) {
					if (!isCurrentContext()) return { status: 'stale' };
					if (!await this.savePendingRow(item, appointmentId, isCurrentContext)) return { status: 'stale' };
				}
				if (this.pendingJointExamList.length) throw new Error('joint-exam-new-drafts');
				await this.load({ isCurrentContext });
				if (this.pendingJointExamList.length && isCurrentContext()) throw new Error('joint-exam-new-drafts');
				return { status: isCurrentContext() ? 'saved' : 'stale' };
			} catch (error) {
				if (!isCurrentContext()) return { status: 'stale' };
				console.error('Error saving pending joint exam list:', error);
				this.renderPendingList();
				return { status: 'error' };
			} finally {
				this.pendingSaving = false;
			}
		}

		/**
		 * Sửa pending joint exam
		 */
		editPending(tempId) {
			if (this.pendingSaving) return;
			if (this.pendingJointExamRow) {
				this.showToast('error', 'Vui lòng hoàn thành thao tác hiện tại');
				return;
			}

			const item = this.pendingJointExamList.find(r => r.temp_id === tempId);
			if (!item) return;

			const row = document.querySelector(`tr[data-temp-id="${tempId}"]`);
			if (!row) return;

			// Chuyển row sang edit mode
			row.classList.add('editing-row');
			const cells = row.querySelectorAll('td');

			// Format date cho input
			let jointDateValue = '';
			if (item.joint_date) {
				const date = new Date(item.joint_date);
				jointDateValue = date.toISOString().split('T')[0];
			}

			// Lưu relative_patient_id nếu có
			row.dataset.relativePatientId = item.relative_patient_id || '';
			const isFromSystem = Boolean(item.relative_patient_id);
			const lockedInputTitle = isFromSystem ? 'Dữ liệu lấy từ hồ sơ bệnh nhân đã có' : '';

			cells[1].innerHTML = `
                <div class="relative-input-wrap">
                    <input aria-label="Họ tên người thân" class="relative-row-input" value="${this.escapeHtml(item.name || '')}" placeholder="Nhập/tìm họ tên" autocomplete="off">
                    <div class="joint-exam-search-dropdown"></div>
                </div>
            `;
			cells[2].innerHTML = `<input aria-label="Quan hệ" class="relative-row-input" value="${this.escapeHtml(item.kinship || '')}" list="joint-exam-kinship-list" autocomplete="off">`;
			cells[3].innerHTML = `<input aria-label="CCCD/CMND" class="relative-row-input" value="${this.escapeHtml(item.id_number || '')}" maxlength="12" title="${lockedInputTitle}" ${isFromSystem ? 'disabled' : ''}>`;
			cells[4].innerHTML = `<input aria-label="Số điện thoại" class="relative-row-input" value="${this.escapeHtml(item.phone || '')}" title="${lockedInputTitle}" ${isFromSystem ? 'disabled' : ''}>`;
			cells[5].innerHTML = `<input aria-label="Ngày đi khám cùng" class="relative-row-input js-datepicker joint-exam-date-input" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">`;
			cells[6].innerHTML = `
                <div class="relative-row-actions">
                    ${renderJointExamActionButton('save', 'btn-save', 'Lưu')}
                    ${renderJointExamActionButton('cancel', 'btn-cancel', 'Hủy')}
                </div>
            `;

			// Setup autocomplete cho name input
			this.setupNameAutocomplete(row);
			this.applyLinkedPatientState(row, isFromSystem);

			// Event listeners
			cells[6].querySelector('.btn-save').addEventListener('click', () => {
				this.updatePending(row, tempId);
			});

			cells[6].querySelector('.btn-cancel').addEventListener('click', () => {
				if (row._jointExamAutocompleteCleanup) {
					row._jointExamAutocompleteCleanup();
				}
				this.renderPendingList();
			});

			cells[1].querySelector('input').focus();

			// Init Flatpickr for dynamic date input in editPending row
			window.initDatepickerWithValue?.(row.querySelector('td:nth-child(6) input'), jointDateValue);
		}

		/**
		 * Cập nhật pending joint exam
		 */
		updatePending(row, tempId) {
			if (this.pendingSaving) return;
			const inputs = row.querySelectorAll('input');
			const name = inputs[0].value.trim();
			const kinship = inputs[1].value.trim();
			const idNumber = inputs[2].value.trim();
			const phone = inputs[3].value.trim();
			const jointDate = inputs[4].value;

			// Validation
			if (!name) {
				this.showToast('error', 'Vui lòng nhập Họ tên');
				return;
			}

			const relativePatientId = row.dataset.relativePatientId ? parseInt(row.dataset.relativePatientId) : null;
			if (!relativePatientId && !idNumber) {
				this.showToast('error', 'Vui lòng nhập CCCD/CMND');
				return;
			}

			// Tìm và cập nhật item trong pending list
			const itemIndex = this.pendingJointExamList.findIndex(r => r.temp_id === tempId);
			if (itemIndex !== -1) {
				this.pendingJointExamList[itemIndex] = {
					...this.pendingJointExamList[itemIndex],
					name: name,
					kinship: kinship || null,
					id_number: idNumber,
					phone: phone || null,
					joint_date: jointDate || null,
					relative_patient_id: relativePatientId
				};

				this.showToast('success', 'Đã cập nhật thành công');
				this.renderPendingList();
			}
		}

		/**
		 * Xóa pending joint exam
		 */
		async deletePending(tempId) {
			if (this.pendingSaving) return;
			const token = this.pendingSaveToken;
			if (!await confirmJointExamDelete(this.showToast)) return;
			if (this.pendingSaving || token !== this.pendingSaveToken) return;

			this.pendingJointExamList = this.pendingJointExamList.filter(r => r.temp_id !== tempId);
			this.showToast('success', 'Đã xóa thành công');
			this.renderPendingList();
		}

		/**
		 * Setup autocomplete cho name input
		 */
		setupNameAutocomplete(row) {
			const nameInput = row.querySelector('#jointExamNameInput') || row.querySelector('td:nth-child(2) input');
			const dropdown = row.querySelector('#jointExamSearchDropdown') || row.querySelector('.joint-exam-search-dropdown');

			if (!nameInput || !dropdown) {
				console.error('Cannot find nameInput or dropdown for joint exam', { nameInput, dropdown });
				return;
			}

			const unlinkPatient = () => {
				row.dataset.relativePatientId = '';
				this.applyLinkedPatientState(row, false);
			};
			const handlers = window.QLPKPatientSearchDropdown.attach({
				row,
				nameInput,
				dropdown,
				floatingClass: 'joint-exam-search-dropdown--floating',
				search: (...args) => this.searchPatients(...args),
				onSelect: patient => this.fillPatientData(row, patient),
				onQueryCleared: unlinkPatient,
				onQueryChanged: () => {
					if (row.dataset.relativePatientId) unlinkPatient();
				}
			});
			row._jointExamAutocompleteCleanup = handlers.dispose;
		}

		/**
		 * Search patients cho joint exam
		 */
		async searchPatients(query, dropdown, onSelect, onShow, perPage = 10000, shouldRender) {
			if (typeof onShow !== 'function' || typeof shouldRender !== 'function') {
				throw new Error('JointExamManager.searchPatients requires autocomplete lifecycle callbacks');
			}

			const searchDropdown = window.QLPKPatientSearchDropdown;
			try {
				const url = `/api/family-members/search?search=${encodeURIComponent(query)}&per_page=${perPage}`;
				const response = await this.apiCall(url, { method: 'GET' });

				if (!shouldRender()) return;

				if (!response.ok) {
					dropdown.innerHTML = searchDropdown.stateHtml('Lỗi tìm kiếm');
					onShow();
					return;
				}

				const data = await response.json();
				if (!shouldRender()) return;

				searchDropdown.renderPatientResults(dropdown, data.success ? data.data : [], {
					escapeHtml: value => this.escapeHtml(value),
					formatDateDisplay: value => this.formatDateDisplay(value),
					nameClass: 'joint-exam-search-name',
					metaClass: 'joint-exam-search-meta',
					onSelect,
					shouldRender
				});
				onShow();
			} catch (error) {
				if (!shouldRender()) return;
				console.error('Error searching patients for joint exam:', error);
				dropdown.innerHTML = searchDropdown.stateHtml('Không thể tìm kiếm. Vui lòng thử lại.');
				onShow();
			}
		}

		/**
		 * Fill patient data vào joint exam row
		 */
		fillPatientData(row, patient) {
			const nameInput = row.querySelector('#jointExamNameInput') || row.querySelector('td:nth-child(2) input');
			if (nameInput) {
				nameInput.value = patient.full_name || '';
			}

			const phoneInput = row.querySelector('#jointExamPhoneInput') || row.querySelector('td:nth-child(5) input');
			if (phoneInput) {
				phoneInput.value = patient.phone || '';
			}

			const idNumberInput = row.querySelector('#jointExamIdNumberInput') || row.querySelector('td:nth-child(4) input');
			if (idNumberInput) {
				idNumberInput.value = patient.id_number || '';
			}

			row.dataset.relativePatientId = patient.id || '';
			this.applyLinkedPatientState(row, true);
		}

		applyLinkedPatientState(row, isLinked) {
			if (!row) return;
			const lockedTitle = 'Dữ liệu lấy từ hồ sơ bệnh nhân đã có';
			row.classList.toggle('joint-exam-row--linked-patient', Boolean(isLinked));

			const nameInput = row.querySelector('#jointExamNameInput') || row.querySelector('td:nth-child(2) input');
			if (nameInput) {
				if (isLinked) {
					nameInput.setAttribute('title', lockedTitle);
				} else {
					nameInput.removeAttribute('title');
				}
			}

			const idNumberInput = row.querySelector('#jointExamIdNumberInput') || row.querySelector('td:nth-child(4) input');
			const phoneInput = row.querySelector('#jointExamPhoneInput') || row.querySelector('td:nth-child(5) input');
			[[idNumberInput, 'CCCD/CMND'], [phoneInput, 'Số điện thoại']].forEach(([input, label]) => {
				if (!input) return;
				input.disabled = Boolean(isLinked);
				if (isLinked) {
					input.setAttribute('title', lockedTitle);
					input.setAttribute('aria-label', `${label} - ${lockedTitle}`);
				} else {
					input.removeAttribute('title');
					input.setAttribute('aria-label', label);
				}
			});
		}

		/**
		 * Clear pending list
		 */
		clearPendingList() {
			this.pendingSaveToken += 1;
			this.pendingJointExamList = [];
			this.pendingJointExamRow?.remove();
			this.pendingJointExamRow = null;
		}

		// Utility functions với default implementation
		_defaultEscapeHtml(text) {
			if (!text) return '';
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		_defaultFormatDateDisplay(value) {
			if (!value) return '';
			if (value.includes('/')) return value;
			try {
				const date = new Date(value);
				if (Number.isNaN(date.getTime())) return '';
				return date.toLocaleDateString('vi-VN');
			} catch {
				return '';
			}
		}
	}

	// Export
	window.JointExamManager = JointExamManager;

})(window);
