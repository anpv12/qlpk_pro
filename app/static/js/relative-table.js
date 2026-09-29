// Continued in (nạp ngay sau file này, cùng scope trang): relative-table-methods.js
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

	// Methods of RelativeTable after fillPatientData live in relative-table-methods.js (loaded right after this file).
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['relative-table'] || (window.QLPKModuleParts['relative-table'] = {});
	Object.assign(moduleParts, { RelativeTable, notify, toInputDate, API_BASE, renderRelativeActionButton });
})(window, document);
