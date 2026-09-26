/**
 * Joint Exam Manager - Module quản lý "Người đi khám cùng"
 * DRY: Dùng chung cho receptionist, doctor, psychologist
 */

(function (window) {
	'use strict';

	function buildJointExamDeleteConfirmOptions() {
		return {
			icon: 'warning',
			title: 'Xác nhận xóa',
			text: 'Bạn có chắc chắn muốn xóa người đi khám cùng này?',
			showCancelButton: true,
			confirmButtonText: 'Xóa',
			cancelButtonText: 'Hủy',
			buttonsStyling: false,
			reverseButtons: true,
			focusCancel: true,
			customClass: {
				container: 'qlpk-confirm-container',
				popup: 'qlpk-confirm-dialog qlpk-confirm-dialog--danger',
				icon: 'qlpk-confirm-dialog__icon',
				title: 'qlpk-confirm-dialog__title',
				htmlContainer: 'qlpk-confirm-dialog__text',
				actions: 'qlpk-confirm-dialog__actions',
				confirmButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--danger',
				cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
			}
		};
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
		async load() {
			const appointmentId = this.getAppointmentId();

			// Nếu chưa có appointment, hiển thị danh sách tạm
			if (!appointmentId) {
				this.renderPendingList();
				return;
			}

			try {
				const response = await this.apiCall(`/api/appointment-relatives/appointment/${appointmentId}`);
				if (response.ok) {
					const data = await response.json();
					const relatives = data.data || [];

					if (relatives.length === 0) {
						if (this.tableBody) this.tableBody.innerHTML = '';
						if (this.emptyState) this.emptyState.classList.add('active');
					} else {
						if (this.emptyState) this.emptyState.classList.remove('active');
						if (this.tableBody) this.renderTable(relatives);
					}
				} else {
					if (this.tableBody) this.tableBody.innerHTML = '';
					if (this.emptyState) this.emptyState.classList.add('active');
				}
			} catch (error) {
				console.error('Error loading joint exam list:', error);
				if (this.tableBody) this.tableBody.innerHTML = '';
				if (this.emptyState) this.emptyState.classList.add('active');
			}
		}

		/**
		 * Render table người đi khám cùng
		 */
		renderTable(relatives) {
			if (!this.tableBody) return;

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
                        <input class="relative-row-input" id="jointExamNameInput" placeholder="Nhập/tìm họ tên" autocomplete="off">
                        <div class="joint-exam-search-dropdown" id="jointExamSearchDropdown"></div>
                    </div>
                </td>
                <td>
                    <input class="relative-row-input" id="jointExamKinshipInput" placeholder="Quan hệ" list="joint-exam-kinship-list" autocomplete="off">
                </td>
                <td>
                    <input class="relative-row-input" id="jointExamIdNumberInput" placeholder="CCCD/CMND" maxlength="12">
                </td>
                <td>
                    <input class="relative-row-input" id="jointExamPhoneInput" placeholder="Số điện thoại">
                </td>
                <td class="relative-table-center">
                    <input class="relative-row-input js-datepicker joint-exam-date-input" id="jointExamDateInput" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">
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
				tr.remove();
				this.pendingJointExamRow = null;
			});

			// Init Flatpickr for dynamic date input
			const dateInput = tr.querySelector('#jointExamDateInput');
			if (dateInput && window.initDatepickers) {
				// Set value TRƯỚC khi init để tránh race condition
				if (defaultDate) {
					// Parse datetime → date only
					const dateOnly = typeof defaultDate === 'string' && defaultDate.includes('T')
						? defaultDate.split('T')[0]
						: defaultDate;

					// Set value vào HTML
					dateInput.value = dateOnly;
				}

				// SAU ĐÓ mới init Flatpickr
				window.initDatepickers(dateInput);
			}
		}

		/**
		 * Lưu row mới
		 */
		async saveNew(tr) {
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

			try {
				const response = await this.apiCall('/api/appointment-relatives', {
					method: 'POST',
					body: JSON.stringify(data)
				});

				if (response.ok) {
					this.showToast('success', 'Đã thêm người đi khám cùng thành công');
					tr.remove();
					this.pendingJointExamRow = null;
					await this.load();

					// Reload "Người thân liên kết" nếu có callback
					if (this.onReloadFamilyMembers) {
						this.onReloadFamilyMembers();
					}
				} else {
					this.showToast('error', 'Không thể thêm người đi khám cùng. Vui lòng kiểm tra lại.');
				}
			} catch (error) {
				console.error('Error saving joint exam:', error);
				this.showToast('error', 'Không thể thêm người đi khám cùng. Vui lòng thử lại.');
			}
		}

		/**
		 * Sửa inline (chuyển row sang edit mode)
		 */
		async edit(relativeId) {
			if (this.pendingJointExamRow) {
				this.showToast('error', 'Vui lòng hoàn thành thao tác hiện tại');
				return;
			}

			const row = document.querySelector(`tr[data-id="${relativeId}"]`);
			if (!row) return;

			try {
				const response = await this.apiCall(`/api/appointment-relatives/${relativeId}`);
				if (!response.ok) {
					this.showToast('error', 'Không tìm thấy thông tin');
					return;
				}

				const data = await response.json();
				const relative = data.data;

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
                        <input class="relative-row-input" value="${this.escapeHtml(relative.name || '')}" placeholder="Nhập/tìm họ tên" autocomplete="off">
                        <div class="joint-exam-search-dropdown"></div>
                    </div>
                `;
				cells[2].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(relative.kinship || '')}" list="joint-exam-kinship-list" autocomplete="off">`;
				cells[3].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(relative.id_number || '')}" maxlength="12" title="${lockedInputTitle}" ${idNumberDisabled}>`;
				cells[4].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(relative.phone || '')}" title="${lockedInputTitle}" ${phoneDisabled}>`;
				cells[5].innerHTML = `<input class="relative-row-input js-datepicker joint-exam-date-input" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">`;
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
					// Cleanup autocomplete
					if (row._jointExamAutocompleteCleanup) {
						row._jointExamAutocompleteCleanup();
					}
					this.load(); // Reload để restore row
				});

				// Focus vào input đầu tiên
				cells[1].querySelector('input').focus();

				// Init Flatpickr for dynamic date input in edit row
				const dateInput = row.querySelector('td:nth-child(6) input');
				if (dateInput && window.initDatepickers) {
					// Set value TRƯỚC khi init
					if (jointDateValue) {
						// Parse datetime → date only
						const dateOnly = typeof jointDateValue === 'string' && jointDateValue.includes('T')
							? jointDateValue.split('T')[0]
							: jointDateValue;

						// Set value vào HTML
						dateInput.value = dateOnly;
					}

					// SAU ĐÓ mới init Flatpickr
					window.initDatepickers(dateInput);
				}
			} catch (error) {
				console.error('Error loading joint exam:', error);
				this.showToast('error', 'Không thể tải thông tin người đi khám cùng. Vui lòng thử lại.');
			}
		}

		/**
		 * Cập nhật inline
		 */
		async update(row, relativeId) {
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

			try {
				const response = await this.apiCall(`/api/appointment-relatives/${relativeId}`, {
					method: 'PUT',
					body: JSON.stringify(data)
				});

				if (response.ok) {
					this.showToast('success', 'Đã cập nhật thành công');
					await this.load();

					// Reload "Người thân liên kết" nếu có callback
					if (this.onReloadFamilyMembers) {
						this.onReloadFamilyMembers();
					}
				} else {
					this.showToast('error', 'Không thể cập nhật người đi khám cùng. Vui lòng kiểm tra lại.');
				}
			} catch (error) {
				console.error('Error updating joint exam:', error);
				this.showToast('error', 'Không thể cập nhật người đi khám cùng. Vui lòng thử lại.');
			}
		}

		/**
		 * Xóa người đi khám cùng
		 */
		async delete(relativeId) {
			if (!window.Swal) {
				if (!confirm('Bạn có chắc chắn muốn xóa người đi khám cùng này?')) {
					return;
				}
			} else {
				const result = await window.Swal.fire(buildJointExamDeleteConfirmOptions());

				if (!result.isConfirmed) {
					return;
				}
			}

			try {
				const response = await this.apiCall(`/api/appointment-relatives/${relativeId}`, {
					method: 'DELETE'
				});

				if (response.ok) {
					this.showToast('success', 'Đã xóa thành công');
					await this.load();

					// Reload "Người thân liên kết" nếu có callback
					if (this.onReloadFamilyMembers) {
						this.onReloadFamilyMembers();
					}
				} else {
					this.showToast('error', 'Không thể xóa người đi khám cùng. Vui lòng thử lại.');
				}
			} catch (error) {
				console.error('Error deleting joint exam:', error);
				this.showToast('error', 'Không thể xóa người đi khám cùng. Vui lòng thử lại.');
			}
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
		async savePendingList(appointmentId) {
			if (!appointmentId || this.pendingJointExamList.length === 0) {
				return;
			}

			try {
				for (const item of this.pendingJointExamList) {
					const data = {
						appointment_id: appointmentId,
						name: item.name,
						id_number: item.id_number,
						kinship: item.kinship,
						phone: item.phone,
						joint_date: item.joint_date,
						relative_patient_id: item.relative_patient_id || null
					};

					const response = await this.apiCall('/api/appointment-relatives', {
						method: 'POST',
						body: JSON.stringify(data)
					});

					if (!response.ok) {
						console.error('Error saving pending joint exam:', await response.json());
					}
				}

				// Xóa pending list sau khi lưu thành công
				this.pendingJointExamList = [];

				// Reload danh sách từ database
				await this.load();
			} catch (error) {
				console.error('Error saving pending joint exam list:', error);
			}
		}

		/**
		 * Sửa pending joint exam
		 */
		editPending(tempId) {
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
                    <input class="relative-row-input" value="${this.escapeHtml(item.name || '')}" placeholder="Nhập/tìm họ tên" autocomplete="off">
                    <div class="joint-exam-search-dropdown"></div>
                </div>
            `;
			cells[2].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(item.kinship || '')}" list="joint-exam-kinship-list" autocomplete="off">`;
			cells[3].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(item.id_number || '')}" maxlength="12" title="${lockedInputTitle}" ${isFromSystem ? 'disabled' : ''}>`;
			cells[4].innerHTML = `<input class="relative-row-input" value="${this.escapeHtml(item.phone || '')}" title="${lockedInputTitle}" ${isFromSystem ? 'disabled' : ''}>`;
			cells[5].innerHTML = `<input class="relative-row-input js-datepicker joint-exam-date-input" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy">`;
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
			const dateInput = row.querySelector('td:nth-child(6) input');
			if (dateInput && window.initDatepickers) {
				// Set value TRƯỚC khi init
				if (jointDateValue) {
					// Parse datetime → date only
					const dateOnly = typeof jointDateValue === 'string' && jointDateValue.includes('T')
						? jointDateValue.split('T')[0]
						: jointDateValue;

					// Set value vào HTML
					dateInput.value = dateOnly;
				}

				// SAU ĐÓ mới init Flatpickr
				window.initDatepickers(dateInput);
			}
		}

		/**
		 * Cập nhật pending joint exam
		 */
		updatePending(row, tempId) {
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
			if (!window.Swal) {
				if (!confirm('Bạn có chắc chắn muốn xóa người đi khám cùng này?')) {
					return;
				}
			} else {
				const result = await window.Swal.fire(buildJointExamDeleteConfirmOptions());

				if (!result.isConfirmed) {
					return;
				}
			}

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

			let searchTimeout = null;
			let selectedPatient = null;
			let activeSearchToken = 0;
			let autocompleteDisposed = false;

			const createSearchToken = () => {
				activeSearchToken += 1;
				return activeSearchToken;
			};

			const clearSearchTimeout = () => {
				if (searchTimeout) {
					clearTimeout(searchTimeout);
					searchTimeout = null;
				}
			};

			const invalidateSearch = () => {
				activeSearchToken += 1;
				clearSearchTimeout();
			};

			const canRenderSearch = (searchToken) => {
				return !autocompleteDisposed && searchToken === activeSearchToken && document.activeElement === nameInput;
			};

			const repositionDropdown = () => {
				if (dropdown.dataset.visible !== 'true') return;
				const rect = nameInput.getBoundingClientRect();
				const width = Math.max(320, Math.min(520, rect.width * 1.3));
				dropdown.style.width = `${width}px`;
				dropdown.style.top = `${rect.bottom + 8}px`;
				dropdown.style.left = `${rect.left}px`;
				dropdown.classList.add('joint-exam-search-dropdown--floating');
			};

			const handleViewportChange = () => repositionDropdown();

			const showDropdown = (searchToken) => {
				if (!canRenderSearch(searchToken)) return false;
				if (dropdown.dataset.visible === 'true') return;
				dropdown.dataset.visible = 'true';
				dropdown.classList.add('is-open');
				repositionDropdown();
				window.addEventListener('scroll', handleViewportChange, true);
				window.addEventListener('resize', handleViewportChange);
				return true;
			};

			const closeDropdown = () => {
				if (dropdown.dataset.visible !== 'true') return;
				dropdown.dataset.visible = 'false';
				dropdown.classList.remove('is-open');
				window.removeEventListener('scroll', handleViewportChange, true);
				window.removeEventListener('resize', handleViewportChange);
			};

			const hideDropdown = () => {
				invalidateSearch();
				closeDropdown();
			};

			const renderDropdownState = (searchToken, html) => {
				if (!canRenderSearch(searchToken)) return false;
				dropdown.innerHTML = html;
				showDropdown(searchToken);
				return true;
			};

			const outsideClickHandler = (e) => {
				if (!row.contains(e.target) && !dropdown.contains(e.target)) {
					hideDropdown();
				}
			};

			const focusInHandler = (e) => {
				if (e.target === nameInput || dropdown.contains(e.target)) return;
				hideDropdown();
			};

			document.addEventListener('click', outsideClickHandler);
			row.addEventListener('focusin', focusInHandler);

			// Show dropdown on focus
			nameInput.addEventListener('focus', (e) => {
				const query = e.target.value.trim();
				const searchToken = createSearchToken();

				if (query && query.length >= 2) {
					clearSearchTimeout();
					searchTimeout = setTimeout(() => {
						this.searchPatients(query, dropdown, (patient) => {
							if (!canRenderSearch(searchToken)) return;
							selectedPatient = patient;
							this.fillPatientData(row, patient);
							hideDropdown();
						}, () => showDropdown(searchToken), 10000, () => canRenderSearch(searchToken));
					}, 100);
				} else {
					renderDropdownState(searchToken, '<div class="relative-search-item no-results">Đang tải...</div>');
					this.searchPatients('', dropdown, (patient) => {
						if (!canRenderSearch(searchToken)) return;
						selectedPatient = patient;
						this.fillPatientData(row, patient);
						hideDropdown();
					}, () => showDropdown(searchToken), 10000, () => canRenderSearch(searchToken));
				}
			});

			// Search on input with debounce
			nameInput.addEventListener('input', (e) => {
				const query = e.target.value.trim();

				invalidateSearch();
				const searchToken = createSearchToken();

				if (!query || query.length < 2) {
					renderDropdownState(searchToken, '<div class="relative-search-item no-results">Nhập tên để tìm kiếm...</div>');
					// Reset selected patient khi xóa text và enable lại các input
					row.dataset.relativePatientId = '';
					selectedPatient = null;
					this.applyLinkedPatientState(row, false);

					// Enable lại các input field khi xóa text
					const idNumberInput = row.querySelector('#jointExamIdNumberInput') || row.querySelector('td:nth-child(4) input');
					const phoneInput = row.querySelector('#jointExamPhoneInput') || row.querySelector('td:nth-child(5) input');
					if (idNumberInput) {
						idNumberInput.disabled = false;
					}
					if (phoneInput) {
						phoneInput.disabled = false;
					}
					return;
				}

				if (row.dataset.relativePatientId) {
					row.dataset.relativePatientId = '';
					selectedPatient = null;
					this.applyLinkedPatientState(row, false);
				}

				searchTimeout = setTimeout(() => {
					this.searchPatients(query, dropdown, (patient) => {
						if (!canRenderSearch(searchToken)) return;
						selectedPatient = patient;
						this.fillPatientData(row, patient);
						hideDropdown();
					}, () => showDropdown(searchToken), 10000, () => canRenderSearch(searchToken));
				}, 300);
			});

			// Cleanup function
			row._jointExamAutocompleteCleanup = () => {
				autocompleteDisposed = true;
				invalidateSearch();
				closeDropdown();
				document.removeEventListener('click', outsideClickHandler);
				row.removeEventListener('focusin', focusInHandler);
				window.removeEventListener('scroll', handleViewportChange, true);
				window.removeEventListener('resize', handleViewportChange);
			};
		}

		/**
		 * Search patients cho joint exam
		 */
		async searchPatients(query, dropdown, onSelect, onShow, perPage = 10000, shouldRender) {
			if (typeof onShow !== 'function' || typeof shouldRender !== 'function') {
				throw new Error('JointExamManager.searchPatients requires autocomplete lifecycle callbacks');
			}

			try {
				const url = `/api/family-members/search?search=${encodeURIComponent(query)}&per_page=${perPage}`;
				const response = await this.apiCall(url, { method: 'GET' });

				if (!shouldRender()) return;

				if (!response.ok) {
					dropdown.innerHTML = '<div class="relative-search-item no-results">Lỗi tìm kiếm</div>';
					onShow();
					return;
				}

				const data = await response.json();
				if (!shouldRender()) return;

				if (!data.success || !data.data || data.data.length === 0) {
					dropdown.innerHTML = '<div class="relative-search-item no-results">Không tìm thấy bệnh nhân</div>';
					onShow();
					return;
				}

				dropdown.innerHTML = data.data.map(patient => {
					const phone = patient.phone || 'Chưa có';
					const lastExam = patient.latest_appointment_date ? this.formatDateDisplay(patient.latest_appointment_date) : 'Chưa khám';
					const diagnosis = patient.latest_diagnosis || 'Chưa có';
					return `
                        <div class="relative-search-item" data-patient-id="${patient.id}">
                            <div class="joint-exam-search-name">${this.escapeHtml(patient.full_name)}</div>
                            <div class="joint-exam-search-meta">
                                <span><strong>SĐT:</strong> ${this.escapeHtml(phone)}</span>
                                ${patient.date_of_birth ? `<span><strong>Sinh:</strong> ${this.formatDateDisplay(patient.date_of_birth)}</span>` : ''}
                            </div>
                            <div class="joint-exam-search-meta">
                                <span><strong>Khám gần nhất:</strong> ${lastExam}</span>
                                ${diagnosis !== 'Chưa có' ? `<span><strong>Chẩn đoán:</strong> ${this.escapeHtml(diagnosis)}</span>` : ''}
                            </div>
                        </div>
                    `;
				}).join('');

				// Add click handlers
				dropdown.querySelectorAll('.relative-search-item').forEach(item => {
					if (item.classList.contains('no-results')) return;

					item.addEventListener('click', () => {
						if (!shouldRender()) return;
						const patientId = parseInt(item.dataset.patientId);
						const patient = data.data.find(p => p.id === patientId);
						if (patient) {
							onSelect(patient);
						}
					});

					item.addEventListener('mouseenter', () => {
						dropdown.querySelectorAll('.relative-search-item').forEach(i => i.classList.remove('active'));
						item.classList.add('active');
					});
				});

				onShow();
			} catch (error) {
				if (!shouldRender()) return;
				console.error('Error searching patients for joint exam:', error);
				dropdown.innerHTML = '<div class="relative-search-item no-results">Không thể tìm kiếm. Vui lòng thử lại.</div>';
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
			[idNumberInput, phoneInput].forEach((input) => {
				if (!input) return;
				input.disabled = Boolean(isLinked);
				if (isLinked) {
					input.setAttribute('title', lockedTitle);
					input.setAttribute('aria-label', `${input.getAttribute('placeholder') || input.name || 'Thông tin'} - ${lockedTitle}`);
				} else {
					input.removeAttribute('title');
					input.removeAttribute('aria-label');
				}
			});
		}

		/**
		 * Clear pending list
		 */
		clearPendingList() {
			this.pendingJointExamList = [];
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
