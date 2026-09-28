(function (window, document) {
	const API_BASE = '/api/family-members';
	let instanceCounter = 0;

	const DEFAULT_RELATIONSHIP_OPTIONS = [
		'Cha', 'Mẹ', 'Cha dượng', 'Mẹ kế',
		'Vợ', 'Chồng', 'Vợ cũ', 'Chồng cũ',
		'Con trai', 'Con gái', 'Con trai riêng', 'Con gái riêng',
		'Con trai nuôi', 'Con gái nuôi',
		'Anh trai', 'Em trai', 'Chị gái', 'Em gái',
		'Anh trai cùng cha khác mẹ', 'Em trai cùng cha khác mẹ',
		'Anh trai cùng mẹ khác cha', 'Em trai cùng mẹ khác cha',
		'Chị gái cùng cha khác mẹ', 'Em gái cùng cha khác mẹ',
		'Chị gái cùng mẹ khác cha', 'Em gái cùng mẹ khác cha',
		'Ông nội', 'Bà nội', 'Ông ngoại', 'Bà ngoại',
		'Chú', 'Cậu', 'Cô', 'Dì',
		'Anh họ', 'Em họ', 'Chị họ', 'Em họ (nữ)',
		'Cháu trai', 'Cháu gái',
		'Cháu trai (con trai)', 'Cháu gái (con trai)',
		'Cháu trai (con gái)', 'Cháu gái (con gái)',
		'Bố vợ', 'Bố chồng', 'Mẹ vợ', 'Mẹ chồng',
		'Anh rể', 'Em rể', 'Chị dâu', 'Em dâu',
		'Cụ ông', 'Cụ bà', 'Chắt trai', 'Chắt gái',
		'Bạn', 'Bạn thân', 'Đồng nghiệp', 'Hàng xóm',
		'Người yêu',
		'Khác'
	];

	const notify = (type, message) => {
		window.QLPKUserFeedback.show(type, message);
	};

	const confirmDialog = async (message) => {
		if (!window.QLPKConfirmationDialog) {
			notify('error', 'Không thể mở hộp thoại xác nhận. Thao tác đã được hủy.');
			return false;
		}
		return window.QLPKConfirmationDialog.confirm({
			title: 'Xác nhận',
			text: message,
			confirmText: 'Đồng ý',
			variant: 'danger',
			showToast: notify
		});
	};

	const formatDateDisplay = (value) => {
		const pageRuntime = window.QLPKDoctorPageRuntime;
		if (pageRuntime && typeof pageRuntime.formatDateDisplay === 'function') {
			return pageRuntime.formatDateDisplay(value);
		}
		if (typeof window.formatDateDisplay === 'function') {
			return window.formatDateDisplay(value);
		}
		// Formatter nội bộ cho các trang chưa nạp formatter chung.
		if (!value) return '';

		try {
			let dateObj;
			if (typeof value === 'string' && value.includes('/')) {
				const parts = value.split('/');
				if (parts.length === 3) {
					dateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
				} else {
					return value;
				}
			} else if (typeof value === 'string') {
				dateObj = new Date(value);
			} else if (value instanceof Date) {
				dateObj = value;
			}

			if (!dateObj || Number.isNaN(dateObj.getTime())) return value;

			const day = String(dateObj.getDate()).padStart(2, '0');
			const month = String(dateObj.getMonth() + 1).padStart(2, '0');
			const year = dateObj.getFullYear();
			return `${day}/${month}/${year}`;
		} catch {
			return value || '';
		}
	};

	const toInputDate = (value) => {
		if (!value) return '';
		try {
			const [day, month, year] = value.split('/');
			if (year && month && day) {
				return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
			}
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return '';
			return date.toISOString().slice(0, 10);
		} catch {
			return '';
		}
	};

	const renderRelativeActionButton = (action, className, title) => {
		if (!window.QLPKIconSystem || typeof window.QLPKIconSystem.renderActionButton !== 'function') return '';
		return window.QLPKIconSystem.renderActionButton({ action, title, label: title, className });
	};

	const renderAddRelativeButton = () => {
		if (window.QLPKIconSystem && typeof window.QLPKIconSystem.renderIconTextButton === 'function') {
			return window.QLPKIconSystem.renderIconTextButton({
				action: 'add',
				label: 'Thêm người thân',
				className: 'btn-add-relative relative-table-add-btn'
			});
		}
		return `
			<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn-add-relative relative-table-add-btn">
				<i class="bi bi-plus-circle qlpk-button-icon" aria-hidden="true"></i><span>Thêm người thân</span>
			</button>
		`;
	};

	class RelativeTable {
		constructor(container, options = {}) {
			this.container = container;
			this.options = options;
			this.patientId = options.patientId || null;
			this.readOnly = !!options.readOnly;
			this.currentAppointmentDate = options.currentAppointmentDate || null; // Ngày khám của bệnh nhân hiện tại
			this.enablePatientLinks = options.enablePatientLinks !== false;
			this.relationshipOptions = Array.isArray(options.relationshipOptions) && options.relationshipOptions.length
				? options.relationshipOptions
				: DEFAULT_RELATIONSHIP_OPTIONS;
			this.instanceId = ++instanceCounter;
			this.pendingRow = null;
			this.contextToken = 0;
			this.loadRevision = 0;
			this.mutation = null;
			this.rowContexts = new WeakMap();
			this.data = [];
			this.render();
			this.updateActionState();
		}

		setCurrentAppointmentDate(date) {
			if (this.currentAppointmentDate === date) return;
			this.currentAppointmentDate = date;
			this.reload();
		}

		render() {
			const relationshipOptionsHtml = (this.relationshipOptions || DEFAULT_RELATIONSHIP_OPTIONS)
				.map((option) => `<option value="${this.escape(option)}"></option>`)
				.join('');

			this.container.innerHTML = `
                <div class="relative-table-card ${this.readOnly ? 'readonly' : ''}">
                    <div class="relative-table-header">
                        <h6><i class="bi bi-people-fill relative-table-title-icon qlpk-section-icon" aria-hidden="true"></i>Người thân liên kết</h6>
                        <div class="relative-table-actions">
                            ${renderAddRelativeButton()}
                        </div>
                    </div>
                    <div class="relative-table-body">
						<div class="relative-table-scroll">
							<table class="relative-table">
								<colgroup>
									<col class="receptionist-shared-col-index">
									<col class="receptionist-shared-col-name">
									<col class="receptionist-shared-col-relation">
									<col class="receptionist-shared-col-id-number">
									<col class="receptionist-shared-col-phone">
									<col class="receptionist-shared-col-emergency">
									<col class="receptionist-shared-col-date">
									<col class="receptionist-shared-col-actions">
								</colgroup>
								<thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Họ tên</th>
                                        <th>Quan hệ</th>
                                        <th>CCCD/CMND</th>
                                        <th>Số điện thoại</th>
                                        <th>Liên hệ khẩn cấp</th>
                                        <th>Ngày khám cùng</th>
										<th class="joint-exam-action-column">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                        </div>
                        <div class="relative-empty-state">
                            <p class="relative-empty-state__title">Chưa có người thân nào được liên kết</p>
                            <p class="relative-empty-state__subtitle">Thêm ít nhất một liên hệ để hỗ trợ bệnh nhân.</p>
                        </div>
                    </div>
                </div>
                <datalist id="relative-name-list-${this.instanceId}">
                    <option value="Đặng Thị Minh An"></option>
                    <option value="Trần Quốc Huy"></option>
                    <option value="Phạm Anh Thư"></option>
                    <option value="Nguyễn Văn An"></option>
                </datalist>
                <datalist id="relative-relationship-list-${this.instanceId}">
                    ${relationshipOptionsHtml}
                </datalist>
            `;

			this.tableBody = this.container.querySelector('tbody');
			this.emptyState = this.container.querySelector('.relative-empty-state');
			this.addBtn = this.container.querySelector('.btn-add-relative');


			// Use event delegation to ensure buttons work even if re-rendered
			const header = this.container.querySelector('.relative-table-header');
			if (header) {
				header.addEventListener('click', (e) => {
					const target = e.target.closest('.btn-add-relative');
					if (target) {
						e.preventDefault();
						e.stopPropagation();
						if (target.disabled) {
							return;
						}
						this.showCreateRow();
					}

				});
			}

			// Also attach direct listeners as backup
			if (this.addBtn) {
				this.addBtn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (this.addBtn.disabled) {
						return;
					}
					this.showCreateRow();
				});
			}
		}

		updateActionState() {
			// Button "Thêm người thân" chỉ disable khi readOnly (mặc định enable)
			if (this.addBtn) {
				this.addBtn.disabled = this.readOnly;
			}
		}

		setPatientId(id) {
			if (this.patientId === id) return;
			this.contextToken++;
			this.patientId = id;
			this.data = [];
			this.updateActionState();
			this.clearEditingRow();
			if (id) {
				return this.reload();
			} else {
				this.renderRows([]);
			}
		}

		clear() {
			this.contextToken++;
			this.loadRevision++;
			this.patientId = null;
			this.data = [];
			this.clearEditingRow();
			this.updateActionState();
			this.renderRows([]);
		}

		createContextGuard() {
			const patientId = this.patientId;
			const token = this.contextToken;
			return () => this.patientId === patientId && this.contextToken === token;
		}

		async reload(options = {}) {
			if (!options.afterSave && (this.pendingRow || this.mutation?.isCurrentContext())) return false;
			const revision = ++this.loadRevision;
			const contextGuard = this.createContextGuard();
			const isCurrentContext = () => contextGuard() && revision === this.loadRevision;
			this.data = [];
			if (!this.patientId) {
				this.renderRows([]);
				notify('info', 'Vui lòng chọn bệnh nhân để tải danh sách người thân');
				return;
			}
			this.showLoading();
			try {
				const data = await this.fetchData();
				if (!isCurrentContext()) return false;
				this.data = data;
				this.renderRows(this.data);
				return true;
			} catch (error) {
				if (!isCurrentContext()) return false;
				console.error(error);
				notify('error', 'Không thể tải danh sách người thân');
				this.renderRows([]);
				return false;
			}
		}

		lockRowControls(row) {
			const controls = Array.from(row?.querySelectorAll('input, button, select, textarea') || []);
			const disabled = controls.map(control => control.disabled);
			controls.forEach(control => { control.disabled = true; });
			return () => controls.forEach((control, index) => { control.disabled = disabled[index]; });
		}

		async commitMutation(options, isCurrentContext) {
			if (options.confirm && !await confirmDialog('Bạn có chắc chắn muốn xóa người thân này?')) return false;
			if (!isCurrentContext()) return false;
			const response = await this.request(options.url, options.request);
			if (!isCurrentContext()) return false;
			if (response?.success !== true || (options.validate && !options.validate(response.data))) {
				throw new Error('relative-write-unconfirmed');
			}
			return response;
		}

		async mutate(options) {
			if (this.readOnly || this.mutation) return false;
			const contextGuard = this.createContextGuard();
			const rowGuard = options.row && this.rowContexts.get(options.row);
			const isCurrentContext = () => contextGuard() && !this.readOnly && (!rowGuard || rowGuard());
			if (!isCurrentContext()) return false;
			const operation = { isCurrentContext: contextGuard };
			this.mutation = operation;
			this.loadRevision++;
			const restoreControls = this.lockRowControls(options.row);
			try {
				const response = await this.commitMutation(options, isCurrentContext);
				if (!response) return false;
				options.onSaved?.(response);
				notify('success', options.message);
				if (options.refresh) {
					this.clearEditingRow();
					await this.reload({ afterSave: true });
				}
				return true;
			} catch (error) {
				if (isCurrentContext()) {
					console.error(error);
					notify('error', 'Không thể lưu thay đổi người thân. Vui lòng thử lại.');
				}
				return false;
			} finally {
				restoreControls();
				if (this.mutation === operation) this.mutation = null;
			}
		}

		showLoading() {
			this.tableBody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="relative-loading">
                            <span class="relative-spinner"></span>
                            Đang tải dữ liệu...
                        </div>
                    </td>
                </tr>
            `;
			this.emptyState.classList.remove('active');
		}

		renderRows(rows) {
			const isCurrentContext = this.createContextGuard();
			this.tableBody.innerHTML = '';
			if (!rows || rows.length === 0) {
				this.emptyState.classList.add('active');
				return;
			}
			this.emptyState.classList.remove('active');
			rows.forEach((item, index) => {
				const tr = document.createElement('tr');
				tr.dataset.memberId = item.id || '';
				const nameContent = this.enablePatientLinks && item.relative_patient_id
					? `<a href="#" class="relative-name-link" data-relative-patient="${item.relative_patient_id}">${this.escape(item.name)}</a>`
					: `<span>${this.escape(item.name)}</span>`;
				tr.innerHTML = `
                    <td class="relative-table-index">${index + 1}.</td>
                    <td>
                        <div class="relative-name-cell">
                            ${nameContent}
                        </div>
                    </td>
                    <td>${this.escape(item.kinship)}</td>
                    <td>${this.escape(item.id_number || '')}</td>
                    <td>${this.escape(item.phone || '')}</td>
						<td class="relative-table-center">
							${item.emergency_contact ? '<i class="bi bi-check-circle-fill relative-table-emergency-icon" aria-hidden="true"></i>' : ''}
                    </td>
					<td>${item.joint_exam_date ? formatDateDisplay(item.joint_exam_date) : (this.currentAppointmentDate ? formatDateDisplay(this.currentAppointmentDate) : '')}</td>
					<td>
						<div class="relative-row-actions">
							${this.readOnly ? '' : `
								${renderRelativeActionButton('edit', 'edit', 'Chỉnh sửa')}
								${renderRelativeActionButton('delete', 'remove', 'Xóa dòng')}
							`}
						</div>
                    </td>
                `;
				if (!this.readOnly) {
					const editBtn = tr.querySelector('.edit');
					const removeBtn = tr.querySelector('.remove');

					if (editBtn) {
						editBtn.addEventListener('click', () => { if (isCurrentContext()) this.handleEdit(item); });
					}
					if (removeBtn) {
						removeBtn.addEventListener('click', () => { if (isCurrentContext()) this.handleDelete(item); });
					}
				}

				const link = tr.querySelector('.relative-name-link');
				if (link) {
					link.addEventListener('click', (event) => {
						event.preventDefault();
						const patientId = link.dataset.relativePatient;
						if (!patientId) return;
						window.dispatchEvent(new CustomEvent('open-relative-search', { detail: { patientId: Number(patientId) } }));
					});
				}

				this.tableBody.appendChild(tr);
			});
		}

		escape(value) {
			if (!value) return '';
			return value.toString()
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		}

		showCreateRow() {
			if (this.readOnly || this.mutation) return;
			if (this.pendingRow) return;

			const tr = document.createElement('tr');
			tr.classList.add('editing-row');
			tr.innerHTML = `
                <td class="relative-table-index">+</td>
				<td class="relative-cell-overlay">
					<div class="relative-input-wrap">
						<input aria-label="Họ tên người thân" class="relative-row-input relative-name-input" list="relative-name-list-${this.instanceId}" placeholder="Nhập họ tên" autocomplete="off">
						<div class="relative-search-dropdown" id="relative-search-dropdown-${this.instanceId}"></div>
					</div>
				</td>
                <td><input aria-label="Quan hệ" class="relative-row-input" list="relative-relationship-list-${this.instanceId}" placeholder="Quan hệ"></td>
                <td><input aria-label="CCCD/CMND" class="relative-row-input relative-id-number-input" placeholder="CCCD/CMND"></td>
                <td><input aria-label="Số điện thoại" class="relative-row-input relative-phone-input" placeholder="Số điện thoại"></td>
				<td class="relative-table-center">
					<input aria-label="Liên hệ khẩn cấp" type="checkbox" class="relative-emergency-contact-checkbox">
                </td>
                <td><input aria-label="Ngày đi khám cùng" class="relative-row-input relative-date-input js-datepicker" data-date-format="Y-m-d" data-alt-format="d/m/Y" placeholder="dd/mm/yyyy"></td>
				<td>
					<div class="relative-row-actions">
						${renderRelativeActionButton('save', 'btn-save', 'Lưu')}
						${renderRelativeActionButton('cancel', 'btn-cancel', 'Hủy')}
					</div>
				</td>
            `;
			this.tableBody.prepend(tr);
			this.pendingRow = tr;
			this.loadRevision++;
			const isCurrentContext = this.createContextGuard();
			this.rowContexts.set(tr, () => isCurrentContext() && this.pendingRow === tr);

			// Store selected patient ID for linking
			tr.dataset.relativePatientId = '';

			// Setup autocomplete for name input
			const cleanupRow = () => {
				if (this.mutation || !isCurrentContext()) return;
				this.clearEditingRow();
			};

			const dropdownHandlers = this.setupNameAutocomplete(tr) || {};
			const hideDropdown = dropdownHandlers.hideDropdown;
			const disposeDropdown = dropdownHandlers.dispose;
			tr._relativeDropdownDispose = disposeDropdown;

			tr.querySelector('.btn-save').addEventListener('click', () => {
				if (hideDropdown) hideDropdown();
				this.saveNewRelative(tr).then(saved => { if (saved && disposeDropdown) disposeDropdown(); });
			});

			tr.querySelector('.btn-cancel').addEventListener('click', () => {
				if (this.mutation || !isCurrentContext()) return;
				if (disposeDropdown) disposeDropdown();
				cleanupRow();
			});

			// Auto focus vào input name để tự động mở dropdown với 10 bệnh nhân gần nhất
			const nameInput = tr.querySelector('.relative-name-input');
			if (nameInput) {
				// Sử dụng setTimeout để đảm bảo DOM đã render xong
				setTimeout(() => {
					if (isCurrentContext() && this.pendingRow === tr) nameInput.focus();
				}, 100);
			}

			// Init Flatpickr for dynamic date input
			window.initDatepickerWithValue?.(tr.querySelector('.relative-date-input'), this.currentAppointmentDate);
		}

		setupNameAutocomplete(row) {
			const nameInput = row.querySelector('.relative-name-input');
			const dropdown = row.querySelector(`#relative-search-dropdown-${this.instanceId}`);

			if (!nameInput || !dropdown) {
				console.error('RelativeTable: Cannot find nameInput or dropdown', { nameInput, dropdown });
				return;
			}

			return window.QLPKPatientSearchDropdown.attach({
				row,
				nameInput,
				dropdown,
				floatingClass: 'relative-search-dropdown--floating',
				search: (...args) => this.searchPatients(...args),
				onSelect: patient => this.fillPatientData(row, patient),
				onQueryCleared: () => {
					row.dataset.relativePatientId = '';
					const phoneInput = row.querySelector('.relative-phone-input');
					if (phoneInput) phoneInput.disabled = false;
					const idNumberInput = row.querySelector('.relative-id-number-input');
					if (idNumberInput) idNumberInput.disabled = false;
				}
			});
		}

		async searchPatients(query, dropdown, onSelect, onShow, perPage = 10000, shouldRender) {
			if (typeof onShow !== 'function' || typeof shouldRender !== 'function') {
				throw new Error('RelativeTable.searchPatients requires autocomplete lifecycle callbacks');
			}

			const searchDropdown = window.QLPKPatientSearchDropdown;
			try {
				const response = await this.request(`${API_BASE}/search?search=${encodeURIComponent(query)}&per_page=${perPage}`, {
					method: 'GET'
				});

				if (!shouldRender()) return;

				searchDropdown.renderPatientResults(dropdown, response.success ? response.data : [], {
					escapeHtml: value => this.escape(value),
					formatDateDisplay,
					nameClass: 'relative-search-name',
					metaClass: 'relative-search-meta',
					onSelect,
					shouldRender
				});
				onShow();
			} catch (error) {
				if (!shouldRender()) return;
				console.error('RelativeTable: Error searching patients:', error);
				dropdown.innerHTML = searchDropdown.stateHtml('Không thể tìm kiếm. Vui lòng thử lại.');
				onShow();
			}
		}

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
		}

		async saveNewRelative(row) {
			if (this.readOnly || this.mutation || this.rowContexts.get(row)?.() === false) return false;
			const nameInput = row.querySelector('.relative-name-input');
			const kinshipInput = row.querySelector('input[list*="relative-relationship-list"]');
			const idNumberInput = row.querySelector('.relative-id-number-input');
			const phoneInput = row.querySelector('.relative-phone-input');
			const emergencyContactCheckbox = row.querySelector('.relative-emergency-contact-checkbox');
			const jointExamDateInput = row.querySelector('.relative-date-input');

			const name = nameInput ? nameInput.value.trim() : '';
			const kinship = kinshipInput ? kinshipInput.value.trim() : '';
			const idNumber = idNumberInput ? idNumberInput.value.trim() : '';
			const phone = phoneInput ? phoneInput.value.trim() : '';
			const emergencyContact = emergencyContactCheckbox ? emergencyContactCheckbox.checked : false;
			const jointExamDate = jointExamDateInput ? jointExamDateInput.value : null;
			const relativePatientId = row.dataset.relativePatientId ? parseInt(row.dataset.relativePatientId) : null;

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
		}

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
		}

		async handleDelete(item) {
			if (this.pendingRow) return false;
			return this.mutate({ url: `${API_BASE}/${item.id}`, request: { method: 'DELETE' },
				confirm: true, refresh: true, message: 'Đã xóa người thân' });
		}

		async fetchData() {
			const response = await this.request(`${API_BASE}/patient/${this.patientId}`, { method: 'GET' });
			if (response?.success !== true || !Array.isArray(response.data)) throw new Error('relative-list-unconfirmed');
			return response.data;
		}

		replaceMember(member, options = {}) {
			if (!member || !member.id) return false;
			const index = this.data.findIndex(item => Number(item.id) === Number(member.id));
			if (index === -1) return false;
			this.data.splice(index, 1, { ...this.data[index], ...member });
			if (options.afterSave || (!this.pendingRow && !this.mutation)) this.renderRows(this.data);
			return true;
		}

		applyPatientChanged(payload) {
			if (!payload || payload.action !== 'family_member_updated') return false;
			return this.replaceMember(payload.data);
		}

		async linkExistingPatient(relativePatientId, kinship, emergencyContact = false, jointExamDate = null, options = {}) {
			if (!this.patientId) return false;
			return this.mutate({
				...options, url: `${API_BASE}/link`, message: 'Đã liên kết 2 chiều với bệnh nhân được chọn',
				validate: data => Array.isArray(data) && data.length > 0 && data.every(member => member?.id),
				request: { method: 'POST', body: JSON.stringify({ patient_id: this.patientId,
					relative_ids: [relativePatientId], kinship: kinship || 'Khác',
					emergency_contact: emergencyContact, joint_exam_date: jointExamDate || null }) }
			});
		}

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
		}

		clearEditingRow() {
			if (this.pendingRow) {
				this.pendingRow._relativeDropdownDispose?.();
				this.pendingRow.remove();
				this.pendingRow = null;
			}
		}
	}

	const RelativeTableManager = {
		instances: new Map(),
		init(target, options = {}) {
			let element = null;
			if (typeof target === 'string') {
				element = document.querySelector(target);
			} else if (target instanceof HTMLElement) {
				element = target;
			}
			if (!element) return null;
			const instance = new RelativeTable(element, options);
			this.instances.set(element, instance);
			return instance;
		}
	};

	window.RelativeTableManager = RelativeTableManager;
})(window, document);
