// joint-exam-manager.js: method sửa dòng của JointExamManager (nạp sau joint-exam-manager-methods.js).
// Gắn vào prototype như method của class (non-enumerable, writable, configurable).
(function (window) {
	'use strict';
	const parts = window.QLPKModuleParts['joint-exam-manager'];
	const { renderJointExamActionButton } = parts;
	const methods = {
		/**
		 * Sửa inline (chuyển row sang edit mode)
		 */
		canStartEdit() {
			if (this.pendingSaving || this.mutation || this.renderedContextGuard?.() === false) return false;
			if (!this.pendingJointExamRow) return true;
			this.showToast('error', 'Vui lòng hoàn thành thao tác hiện tại');
			return false;
		},

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
		},

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
		},

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
		},

	};
	for (const name of Object.keys(methods)) {
		Object.defineProperty(parts.JointExamManager.prototype, name, { value: methods[name], writable: true, configurable: true, enumerable: false });
	}
})(window);
