import { el, replace } from './shared/dom.js';
import { JointExamManager, confirmJointExamDelete, renderJointExamActionButton } from './joint-exam-manager.js';
import { QLPKPatientSearchDropdown } from './components/patient-search-dropdown.js';
import { initDatepickerWithValue } from './datepicker-init.js';
// Gắn vào prototype như method của class (non-enumerable, writable, configurable).
const methods = {
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
	},

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
	},

	/**
	 * Render danh sách tạm (khi chưa có appointment)
	 */
	renderPendingList() {
		if (!this.tableBody) return;

		if (this.pendingJointExamList.length === 0) {
			this.tableBody.replaceChildren();
			if (this.emptyState) this.emptyState.classList.add('active');
			return;
		}

		if (this.emptyState) this.emptyState.classList.remove('active');

		replace(this.tableBody, this.pendingJointExamList.map((relative, index) => {
			let jointDate = '';
			if (relative.joint_date) {
				jointDate = this.formatDateDisplay(relative.joint_date);
			}

                return el('tr', { 'data-temp-id': relative.temp_id },
	el('td', { class: 'joint-exam-row-index relative-table-center' }, index + 1, '.'),
	el('td', null, relative.name || ''),
	el('td', null, relative.kinship || ''),
	el('td', null, relative.id_number || ''),
	el('td', null, relative.phone || ''),
	el('td', { class: 'relative-table-center' }, jointDate),
	el('td', { class: 'relative-table-center' },
		el('div', { class: 'relative-row-actions' },
			renderJointExamActionButton('edit', 'edit', 'Chỉnh sửa', { 'data-joint-exam-action': 'edit-pending', 'data-joint-exam-temp-id': relative.temp_id }),
			' ',
			renderJointExamActionButton('delete', 'remove', 'Xóa', { 'data-joint-exam-action': 'delete-pending', 'data-joint-exam-temp-id': relative.temp_id })
		)
	)
);
		}));
	},

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
	},

	pendingSaveBlocker() {
		if (this.pendingSaving || this.mutation) return { status: 'skipped', reason: 'saving' };
		if (this.pendingJointExamRow) return { status: 'error', reason: 'unfinished-row' };
		return null;
	},

	// Save each pending row in order; false as soon as the context goes stale.
	async savePendingRows(appointmentId, isCurrentContext) {
		for (const item of [...this.pendingJointExamList]) {
			if (!isCurrentContext()) return false;
			if (!await this.savePendingRow(item, appointmentId, isCurrentContext)) return false;
		}
		return true;
	},

	async savePendingList(appointmentId, options = {}) {
		const blocked = this.pendingSaveBlocker();
		if (blocked) return blocked;
		const token = this.pendingSaveToken;
		const isCurrentContext = () => token === this.pendingSaveToken
			&& appointmentId === this.getAppointmentId() && options.isCurrentContext?.() !== false;
		if (!isCurrentContext()) return { status: 'stale' };
		if (!appointmentId) return { status: 'error', reason: 'missing-appointment' };
		if (!this.pendingJointExamList.length) return { status: 'saved' };
		this.pendingSaving = true;
		try {
			if (!await this.savePendingRows(appointmentId, isCurrentContext)) return { status: 'stale' };
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
	},

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

		replace(cells[1], el('div', { class: 'relative-input-wrap' },
			el('input', { 'aria-label': 'Họ tên người thân', class: 'relative-row-input', defaultValue: item.name || '', placeholder: 'Nhập/tìm họ tên', autocomplete: 'off' }),
			' ',
			el('div', { class: 'joint-exam-search-dropdown' })
		));
		replace(cells[2], el('input', { 'aria-label': 'Quan hệ', class: 'relative-row-input', defaultValue: item.kinship || '', list: 'joint-exam-kinship-list', autocomplete: 'off' }));
		replace(cells[3], el('input', { 'aria-label': 'CCCD/CMND', class: 'relative-row-input', defaultValue: item.id_number || '', maxlength: '12', title: lockedInputTitle, disabled: isFromSystem }));
		replace(cells[4], el('input', { 'aria-label': 'Số điện thoại', class: 'relative-row-input', defaultValue: item.phone || '', title: lockedInputTitle, disabled: isFromSystem }));
		replace(cells[5], el('input', { 'aria-label': 'Ngày đi khám cùng', class: 'relative-row-input js-datepicker joint-exam-date-input', 'data-date-format': 'Y-m-d', 'data-alt-format': 'd/m/Y', placeholder: 'dd/mm/yyyy' }));
		replace(cells[6], el('div', { class: 'relative-row-actions' },
			renderJointExamActionButton('save', 'btn-save', 'Lưu'),
			' ',
			renderJointExamActionButton('cancel', 'btn-cancel', 'Hủy')
		));

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
		initDatepickerWithValue?.(row.querySelector('td:nth-child(6) input'), jointDateValue);
	},

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
	},

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
	},

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
		const handlers = QLPKPatientSearchDropdown.attach({
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
	},

	/**
	 * Search patients cho joint exam
	 */
	async searchPatients(query, dropdown, { onSelect, onShow, perPage = 10000, shouldRender } = {}) {
		if (typeof onShow !== 'function' || typeof shouldRender !== 'function') {
			throw new Error('JointExamManager.searchPatients requires autocomplete lifecycle callbacks');
		}

		const searchDropdown = QLPKPatientSearchDropdown;
		try {
			const url = `/api/family-members/search?search=${encodeURIComponent(query)}&per_page=${perPage}`;
			const response = await this.apiCall(url, { method: 'GET' });

			if (!shouldRender()) return;

			if (!response.ok) {
				searchDropdown.renderState(dropdown, 'Lỗi tìm kiếm');
				onShow();
				return;
			}

			const data = await response.json();
			if (!shouldRender()) return;

			searchDropdown.renderPatientResults(dropdown, data.success ? data.data : [], {
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
			searchDropdown.renderState(dropdown, 'Không thể tìm kiếm. Vui lòng thử lại.');
			onShow();
		}
	},

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
	},

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
	},

	/**
	 * Clear pending list
	 */
	clearPendingList() {
		this.pendingSaveToken += 1;
		this.pendingJointExamList = [];
		this.pendingJointExamRow?.remove();
		this.pendingJointExamRow = null;
	},

	// Utility functions với default implementation
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
};
for (const name of Object.keys(methods)) {
	Object.defineProperty(JointExamManager.prototype, name, { value: methods[name], writable: true, configurable: true, enumerable: false });
}
