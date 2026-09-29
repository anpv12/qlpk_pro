// relative-table.js: method của RelativeTable tách từ relative-table.js (nạp ngay sau file đó).
// Gắn vào prototype như method của class (non-enumerable, writable, configurable).
(function (window) {
	'use strict';
	const parts = window.QLPKModuleParts['relative-table'];
	const { notify, toInputDate, API_BASE, renderRelativeActionButton } = parts;
	function trimmedValue(row, selector) {
		const input = row.querySelector(selector);
		return input ? input.value.trim() : '';
	}

	function readNewRelativeRow(row) {
		const emergencyContactCheckbox = row.querySelector('.relative-emergency-contact-checkbox');
		const jointExamDateInput = row.querySelector('.relative-date-input');
		return {
			name: trimmedValue(row, '.relative-name-input'),
			kinship: trimmedValue(row, 'input[list*="relative-relationship-list"]'),
			idNumber: trimmedValue(row, '.relative-id-number-input'),
			phone: trimmedValue(row, '.relative-phone-input'),
			emergencyContact: emergencyContactCheckbox ? emergencyContactCheckbox.checked : false,
			jointExamDate: jointExamDateInput ? jointExamDateInput.value : null,
			relativePatientId: row.dataset.relativePatientId ? parseInt(row.dataset.relativePatientId) : null
		};
	}

	const methods = {
		fillPatientData(row, patient) {
			if (this.readOnly || this.mutation || this.rowContexts.get(row)?.() === false) return;
			// Fill name
			const nameInput = row.querySelector('.relative-name-input');
			nameInput.value = patient.full_name || '';

			// Fill id_number (cột CCCD/CMND)
			const idNumberInput = row.querySelector('.relative-id-number-input');
			if (idNumberInput) {
				idNumberInput.value = patient.id_number || '';
				// Disable id_number input khi chọn từ hệ thống
				idNumberInput.disabled = true;
			}

			// Fill phone (cột Số điện thoại)
			const phoneInput = row.querySelector('.relative-phone-input');
			if (phoneInput) {
				phoneInput.value = patient.phone || '';
				// Disable phone input khi chọn từ hệ thống
				phoneInput.disabled = true;
			}

			// Fill emergency contact (cột Liên hệ khẩn cấp) - checkbox
			const emergencyCheckbox = row.querySelector('.relative-emergency-contact-checkbox');
			if (emergencyCheckbox) {
				// Không tự động check, để user tự chọn
				emergencyCheckbox.checked = false;
			}

			// Fill ngày khám cùng (auto fill từ appointment date hiện tại)
			const dateInput = row.querySelector('.relative-date-input');
			if (dateInput && this.currentAppointmentDate) {
				dateInput.value = toInputDate(this.currentAppointmentDate);
			}

			// Store relative_patient_id for linking
			row.dataset.relativePatientId = patient.id;

			// Show notification
			notify('success', `Đã chọn bệnh nhân: ${patient.full_name}`);
		},

		async saveNewRelative(row) {
			if (this.readOnly || this.mutation || this.rowContexts.get(row)?.() === false) return false;
			const { name, kinship, idNumber, phone, emergencyContact, jointExamDate, relativePatientId } = readNewRelativeRow(row);

			if (!name || !kinship) {
				notify('warning', 'Vui lòng nhập đầy đủ họ tên và quan hệ');
				return;
			}

			// Kiểm tra patientId khi lưu
			if (!this.patientId) {
				notify('warning', 'Vui lòng chọn bệnh nhân trước khi lưu người thân');
				return;
			}

			if (relativePatientId) {
				return this.linkExistingPatient(relativePatientId, kinship, emergencyContact, jointExamDate, { row, refresh: true });
			}
			return this.mutate({
				row, url: API_BASE, refresh: true, message: 'Đã thêm người thân',
				validate: data => Boolean(data?.id),
				request: { method: 'POST', body: JSON.stringify({
					patient_id: this.patientId, relative_patient_id: null, name, kinship,
					id_number: idNumber, phone, emergency_contact: emergencyContact, joint_exam_date: jointExamDate || null
				}) }
			});
		},

		async handleEdit(item) {
			if (this.readOnly || this.pendingRow || this.mutation) return;

			const targetRow = this.tableBody.querySelector(`tr[data-member-id="${item.id}"]`);
			if (!targetRow) return;
			this.pendingRow = targetRow;
			this.loadRevision++;
			const isCurrentContext = this.createContextGuard();
			this.rowContexts.set(targetRow, () => isCurrentContext() && this.pendingRow === targetRow);
			const originalRelativePatientId = item.relative_patient_id || null;

			// Disable phone và id_number input nếu có relativePatientId (chọn từ hệ thống)
			const isFromSystem = originalRelativePatientId && originalRelativePatientId > 0;
			const phoneDisabled = isFromSystem ? 'disabled' : '';
			const idNumberDisabled = isFromSystem ? 'disabled' : '';

			targetRow.classList.add('editing-row');
			// Preserve current linked patient id (if any) so we can update it when saving
			targetRow.dataset.relativePatientId = item.relative_patient_id || '';

			targetRow.innerHTML = `
                <td class="relative-table-index">#</td>
				<td class="relative-cell-overlay">
					<div class="relative-input-wrap">
                        <input aria-label="Họ tên người thân" class="relative-row-input relative-name-input"
                               list="relative-name-list-${this.instanceId}"
                               placeholder="Nhập họ tên"
                               autocomplete="off"
                               value="${this.escape(item.name)}">
						<div class="relative-search-dropdown"
							 id="relative-search-dropdown-${this.instanceId}"></div>
                    </div>
                </td>
                <td><input aria-label="Quan hệ" class="relative-row-input" list="relative-relationship-list-${this.instanceId}" value="${this.escape(item.kinship)}"></td>
                <td><input aria-label="CCCD/CMND" class="relative-row-input relative-id-number-input" value="${this.escape(item.id_number || '')}" ${idNumberDisabled}></td>
                <td><input aria-label="Số điện thoại" class="relative-row-input relative-phone-input" value="${this.escape(item.phone || '')}" ${phoneDisabled}></td>
				<td class="relative-table-center">
					<input aria-label="Liên hệ khẩn cấp" type="checkbox" class="relative-emergency-contact-checkbox" ${item.emergency_contact ? 'checked' : ''}>
                </td>
                <td><input aria-label="Ngày đi khám cùng" class="relative-row-input relative-date-input js-datepicker" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy"></td>
                <td>
                    <div class="relative-row-actions">
                        ${renderRelativeActionButton('save', 'btn-save', 'Lưu')}
                        ${renderRelativeActionButton('cancel', 'btn-cancel', 'Hủy')}
                    </div>
                </td>
            `;

			const nameInput = targetRow.querySelector('.relative-name-input');
			const kinshipInput = targetRow.querySelector('input[list*="relative-relationship-list"]');
			const phoneInput = targetRow.querySelector('.relative-phone-input');

			// Enable autocomplete + patient search for edit row as well
			const dropdownHandlers = this.setupNameAutocomplete(targetRow) || {};
			const hideDropdown = dropdownHandlers.hideDropdown;
			const disposeDropdown = dropdownHandlers.dispose;
			targetRow._relativeDropdownDispose = disposeDropdown;

			targetRow.querySelector('.btn-save').addEventListener('click', async () => {
				if (this.mutation || this.readOnly || !isCurrentContext() || this.pendingRow !== targetRow) return;
				if (hideDropdown) hideDropdown();
				const name = nameInput.value.trim();
				const kinship = kinshipInput.value.trim();
				const idNumberInput = targetRow.querySelector('.relative-id-number-input');
				const idNumber = idNumberInput ? idNumberInput.value.trim() : '';
				const phone = phoneInput.value.trim();
				const emergencyContactCheckbox = targetRow.querySelector('.relative-emergency-contact-checkbox');
				const jointExamDateInput = targetRow.querySelector('.relative-date-input');
				const emergencyContact = emergencyContactCheckbox ? emergencyContactCheckbox.checked : false;
				const jointExamDate = jointExamDateInput ? jointExamDateInput.value : null;
				const relativePatientId = targetRow.dataset.relativePatientId
					? parseInt(targetRow.dataset.relativePatientId, 10)
					: null;

				if (!name || !kinship) {
					notify('warning', 'Vui lòng nhập đầy đủ họ tên và quan hệ');
					return;
				}

				if (relativePatientId && relativePatientId !== originalRelativePatientId) {
					const linked = await this.linkExistingPatient(relativePatientId, kinship, emergencyContact, jointExamDate, { row: targetRow, refresh: true });
					if (linked && disposeDropdown) disposeDropdown();
					return;
				}
				await this.mutate({
					row: targetRow, url: `${API_BASE}/${item.id}`, message: 'Đã cập nhật người thân',
					validate: data => String(data?.id) === String(item.id),
					request: { method: 'PUT', body: JSON.stringify({ name, kinship, id_number: idNumber,
						phone, emergency_contact: emergencyContact, joint_exam_date: jointExamDate || null,
						relative_patient_id: relativePatientId }) },
					onSaved: response => {
						if (disposeDropdown) disposeDropdown();
						this.pendingRow = null;
						this.replaceMember(response.data, { afterSave: true });
					}
				});
			});

			targetRow.querySelector('.btn-cancel').addEventListener('click', () => {
				if (this.mutation || !isCurrentContext()) return;
				if (disposeDropdown) disposeDropdown();
				this.pendingRow = null;
				this.renderRows(this.data);
			});

			// Init Flatpickr for dynamic date input in edit row
			window.initDatepickerWithValue?.(targetRow.querySelector('.relative-date-input'), item.joint_exam_date || this.currentAppointmentDate);
		},

		async handleDelete(item) {
			if (this.pendingRow) return false;
			return this.mutate({ url: `${API_BASE}/${item.id}`, request: { method: 'DELETE' },
				confirm: true, refresh: true, message: 'Đã xóa người thân' });
		},

		async fetchData() {
			const response = await this.request(`${API_BASE}/patient/${this.patientId}`, { method: 'GET' });
			if (response?.success !== true || !Array.isArray(response.data)) throw new Error('relative-list-unconfirmed');
			return response.data;
		},

		replaceMember(member, options = {}) {
			if (!member || !member.id) return false;
			const index = this.data.findIndex(item => Number(item.id) === Number(member.id));
			if (index === -1) return false;
			this.data.splice(index, 1, { ...this.data[index], ...member });
			if (options.afterSave || (!this.pendingRow && !this.mutation)) this.renderRows(this.data);
			return true;
		},

		applyPatientChanged(payload) {
			if (!payload || payload.action !== 'family_member_updated') return false;
			return this.replaceMember(payload.data);
		},

		async linkExistingPatient(relativePatientId, kinship, emergencyContact = false, jointExamDate = null, options = {}) {
			if (!this.patientId) return false;
			return this.mutate({
				...options, url: `${API_BASE}/link`, message: 'Đã liên kết 2 chiều với bệnh nhân được chọn',
				validate: data => Array.isArray(data) && data.length > 0 && data.every(member => member?.id),
				request: { method: 'POST', body: JSON.stringify({ patient_id: this.patientId,
					relative_ids: [relativePatientId], kinship: kinship || 'Khác',
					emergency_contact: emergencyContact, joint_exam_date: jointExamDate || null }) }
			});
		},

		async request(url, options = {}) {
			const headers = {
				'Content-Type': 'application/json',
				...options.headers
			};
			const response = await fetch(url, { ...options, headers });
			if (!response.ok) {
				throw new Error('relative_request_failed');
			}
			return response.json();
		},

		clearEditingRow() {
			if (this.pendingRow) {
				this.pendingRow._relativeDropdownDispose?.();
				this.pendingRow.remove();
				this.pendingRow = null;
			}
		}
	};
	for (const name of Object.keys(methods)) {
		Object.defineProperty(parts.RelativeTable.prototype, name, { value: methods[name], writable: true, configurable: true, enumerable: false });
	}
})(window);
