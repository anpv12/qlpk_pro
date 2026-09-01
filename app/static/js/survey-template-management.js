// Survey Template Management - list-only manager

class SurveyTemplateManager {
	constructor() {
		this.state = {
			currentPage: 1,
			perPage: 10,
			searchTerm: '',
			totalItems: 0,
			templates: [],
			performers: []
		};
		this.currentTemplateId = null;
		this.init();
	}

	init() {
		if (!this.hasToken()) {
			this.showLoginRequired();
			return;
		}

		this.bindEvents();
		this.registerRealtimeHooks();
		this.loadPerformers();
		this.loadTemplates();
	}

	hasToken() {
		return Boolean(this.getToken());
	}

	getToken() {
		return localStorage.getItem('qlpk_token') || localStorage.getItem('access_token') || '';
	}

	getAuthHeaders(extra = {}) {
		const token = this.getToken();
		return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
	}

	async loadPerformers() {
		try {
			const response = await fetch('/users/doctors', {
				headers: this.getAuthHeaders()
			});
			if (!response.ok) return;
			const data = await response.json();
			this.state.performers = Array.isArray(data) ? data : [];
			this.renderPerformerOptions($('#uploadPerformer')[0]);
		} catch (_) {
			this.state.performers = [];
		}
	}

	renderPerformerOptions(select) {
		if (!select) return;
		const currentValue = select.value;
		select.innerHTML = '<option value="">Chưa gán (chọn sau khi chỉ định)</option>' + this.state.performers.map(user => {
			const id = Number(user.id || user.user_id);
			const name = String(user.full_name || user.name || user.username || '').trim();
			return id && name ? `<option value="${id}">${this.escapeHtml(name)}</option>` : '';
		}).join('');
		if (currentValue && Array.from(select.options).some(option => option.value === String(currentValue))) {
			select.value = String(currentValue);
		}
	}



	showLoginRequired() {
		const container = document.querySelector('.stm-card-body') || document.querySelector('.stm-main');
		if (!container) return;

		container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center stm-login-required">
                <div class="text-center">
                    <i class="bi bi-lock stm-login-required-icon"></i>
                    <h3 class="text-muted mb-3">Yêu cầu đăng nhập</h3>
                    <p class="text-muted mb-4">Vui lòng đăng nhập để truy cập tính năng này</p>
					<div class="d-flex gap-2 justify-content-center">
						<button class="btn btn-primary js-go-login">
							<i class="bi bi-box-arrow-in-right me-2"></i>Đăng nhập
						</button>
					</div>
				</div>
			</div>
        `;
	}

	bindEvents() {
		$('#searchInput').on('keypress', (e) => {
			if (e.which === 13) this.handleSearch();
		});

		$('#searchInput').on('input', this.debounce(() => {
			this.handleSearch();
		}, 350));

		$('#uploadNewBtn').on('click', () => this.showUploadModal());

		$('#addNewBtn').on('click', () => {
			if (window.surveyCreateModal) {
				window.surveyCreateModal.open('create');
			}
		});

		$('#perPageSelect').on('change', (e) => {
			this.state.perPage = parseInt($(e.target).val(), 10) || 10;
			this.state.currentPage = 1;
			this.loadTemplates();
		});

		$('#uploadForm').on('submit', (e) => {
			e.preventDefault();
			this.uploadFile();
		});

		$('#uploadBtn').on('click', (e) => {
			e.preventDefault();
			this.uploadFile();
		});

		$('#confirmDeleteBtn').on('click', () => this.deleteTemplate());
		$('#uploadModal').on('hidden.bs.modal', () => this.resetUploadForm());

		$(document).on('click', '.js-template-preview', (e) => {
			const id = Number($(e.currentTarget).data('template-id'));
			if (id) this.viewTemplate(id);
		});

		$(document).on('click', '.js-template-edit', (e) => {
			const id = Number($(e.currentTarget).data('template-id'));
			if (id && window.surveyCreateModal) {
				window.surveyCreateModal.open('edit', id);
			}
		});

		$(document).on('click', '.js-template-delete', (e) => {
			const id = Number($(e.currentTarget).data('template-id'));
			const name = String($(e.currentTarget).data('template-name') || '');
			if (id) this.showDeleteModal(id, name);
		});

		$(document).on('click', '.js-stm-page', (e) => {
			e.preventDefault();
			const page = Number($(e.currentTarget).data('page'));
			if (page) this.goToPage(page);
		});

		$(document).on('click', '.js-go-login', () => {
			window.location.href = '/login.html';
		});
	}

	registerRealtimeHooks() {
		if (!window.QLPKRealtimePageHooks) return;
		window.QLPKRealtimePageHooks.register({
			types: ['catalog.changed'],
			filter: (event) => ['survey_template', 'survey_criteria'].includes(event?.payload?.entity),
			handler: (event) => {
				if (event?.payload?.entity === 'survey_template') {
					this.loadTemplates();
				}
				if (event?.payload?.entity === 'survey_criteria' && window.surveyCreateModal?.refreshCriteriaCache) {
					window.surveyCreateModal.refreshCriteriaCache();
				}
			},
			debounceMs: 350,
		});
	}

	async loadTemplates() {
		try {
			this.showLoading(true);

			const params = new URLSearchParams({
				page: String(this.state.currentPage),
				per_page: String(this.state.perPage)
			});

			if (this.state.searchTerm) {
				params.append('search', this.state.searchTerm);
			}

			const response = await fetch(`/api/public/survey-templates?${params}`);

			const result = await response.json();

			if (result.success) {
				this.state.templates = Array.isArray(result.data) ? result.data : [];
				this.renderTemplates(this.state.templates);
				this.renderPagination(result.pagination || {});
			} else {
				this.showToast('error', 'Không thể tải mẫu khảo sát. Vui lòng thử lại.');
			}
		} catch (error) {
			this.showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		} finally {
			this.showLoading(false);
		}
	}



	renderTemplates(templates) {
		const tbody = $('#surveyTemplatesTableBody');
		tbody.empty();

		if (!templates.length) {
			tbody.html(`
                <tr>
					<td colspan="7" class="text-center py-5">
                        <div class="stm-empty">
                            <i class="bi bi-clipboard2-check"></i>
                            <p>Chưa có mẫu khảo sát nào được tạo</p>
                            <button class="stm-btn stm-btn--primary mt-3" id="emptyAddNewBtn">
                                <i class="bi bi-plus-circle"></i>Thêm mẫu khảo sát đầu tiên
                            </button>
                        </div>
                    </td>
                </tr>
            `);
			$('#emptyAddNewBtn').on('click', () => {
				if (window.surveyCreateModal) window.surveyCreateModal.open('create');
			});
			return;
		}

		templates.forEach((template, index) => {
			tbody.append(this.createTemplateRow(template, index));
		});

		const emptyRowsCount = Math.max(0, this.state.perPage - templates.length);
		for (let i = 0; i < emptyRowsCount; i++) {
			tbody.append(`
                <tr class="empty-row stm-empty-row">
	                    <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
            `);
		}
	}

	createTemplateRow(template, index) {
		const id = Number(template.id) || 0;
		const name = this.escapeHtml(template.name || 'Không tên');
		const nameAttr = this.escapeAttr(template.name || 'Không tên');
		const fileName = this.escapeHtml(template.file_name || '');
		const description = this.escapeHtml(template.description || 'Không có mô tả');
		const performer = this.escapeHtml(template.default_performer_name || 'Chưa gán');
		const createdDate = this.formatDate(template.created_at);
		const isPublic = template.is_public !== false;
		const statusBadge = isPublic
			? '<span class="stm-badge stm-badge--active">Công khai</span>'
			: '<span class="stm-badge stm-badge--inactive">Riêng tư</span>';

		return `
            <tr>
                <td>${(this.state.currentPage - 1) * this.state.perPage + index + 1}</td>
                <td>
                    <strong>${this.highlightSearch(name)}</strong>
                    ${fileName ? `<br><small class="text-muted"><i class="bi bi-file-earmark"></i> ${fileName}</small>` : ''}
                </td>
	                <td><span class="stm-desc-cell">${this.highlightSearch(description)}</span></td>
	                <td>${performer}</td>
	                <td>${createdDate}</td>
                <td class="stm-table-center-cell">${statusBadge}</td>
                <td class="stm-table-center-cell">
                    <div class="stm-row-actions">
                        <button class="stm-action-btn stm-action-btn--preview js-template-preview" data-template-id="${id}" title="Xem chi tiết">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="stm-action-btn stm-action-btn--edit js-template-edit" data-template-id="${id}" title="Chỉnh sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="stm-action-btn stm-action-btn--danger js-template-delete" data-template-id="${id}" data-template-name="${nameAttr}" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
	}

	highlightSearch(text) {
		if (!this.state.searchTerm) return text;
		const escapedTerm = this.escapeRegExp(this.escapeHtml(this.state.searchTerm));
		const regex = new RegExp(`(${escapedTerm})`, 'gi');
		return text.replace(regex, '<span class="highlight">$1</span>');
	}

	renderPagination(pagination) {
		const paginationEl = $('#stm-pagination');
		paginationEl.empty();

		const total = Number(pagination.total) || 0;
		const page = Number(pagination.page) || this.state.currentPage;
		const pages = Number(pagination.pages) || 1;
		$('#totalItems').text(total);

		if (pages <= 1) return;

		const prevDisabled = page === 1 ? 'disabled' : '';
		paginationEl.append(`
            <li class="page-item ${prevDisabled}">
                <a class="page-link js-stm-page" href="#" data-page="${page - 1}">
                    <i class="bi bi-chevron-left"></i>
                </a>
            </li>
        `);

		const startPage = Math.max(1, page - 2);
		const endPage = Math.min(pages, page + 2);
		for (let i = startPage; i <= endPage; i++) {
			const active = i === page ? 'active' : '';
			paginationEl.append(`
                <li class="page-item ${active}">
                    <a class="page-link js-stm-page" href="#" data-page="${i}">${i}</a>
                </li>
            `);
		}

		const nextDisabled = page === pages ? 'disabled' : '';
		paginationEl.append(`
            <li class="page-item ${nextDisabled}">
                <a class="page-link js-stm-page" href="#" data-page="${page + 1}">
                    <i class="bi bi-chevron-right"></i>
                </a>
            </li>
        `);
	}

	goToPage(page) {
		const safePage = Number(page);
		if (!safePage || safePage < 1) return;
		this.state.currentPage = safePage;
		this.loadTemplates();
	}

	handleSearch() {
		this.state.searchTerm = $('#searchInput').val().trim();
		this.state.currentPage = 1;
		this.loadTemplates();
	}

	showUploadModal() {
		$('#uploadModal').modal('show');
	}

	async uploadFile() {
		const formData = this.getUploadFormData();
		if (!formData) return;

		try {
			this.showLoading(true);
			const response = await fetch('/api/survey-templates/upload', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.success) {
				this.showToast('success', 'Đã tải mẫu khảo sát lên.');
				$('#uploadModal').modal('hide');
				this.loadTemplates();
			} else {
				this.showToast('error', 'Không thể tải mẫu khảo sát lên. Vui lòng kiểm tra tệp và thử lại.');
			}
		} catch (error) {
			this.showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		} finally {
			this.showLoading(false);
		}
	}

	getUploadFormData() {
		const name = $('#uploadName').val().trim();
		const description = $('#uploadDescription').val().trim();
		const fileInput = $('#uploadFile')[0];
		const file = fileInput && fileInput.files ? fileInput.files[0] : null;

		if (!name) {
			this.showToast('error', 'Tên mẫu khảo sát là bắt buộc');
			return null;
		}
		if (!file) {
			this.showToast('error', 'Vui lòng chọn file');
			return null;
		}

		const formData = new FormData();
		formData.append('name', name);
		formData.append('description', description);
		formData.append('default_performer_id', $('#uploadPerformer').val() || '');
		formData.append('file', file);
		return formData;
	}

	showDeleteModal(id, name) {
		this.currentTemplateId = Number(id) || null;
		$('#deleteTemplateName').text(name || '');
		$('#deleteModal').modal('show');
	}

	async deleteTemplate() {
		if (!this.currentTemplateId) return;

		try {
			this.showLoading(true);
			const response = await fetch(`/api/survey-templates/${this.currentTemplateId}`, {
				method: 'DELETE'
			});

			const result = await response.json();
			if (result.success) {
				this.showToast('success', 'Xóa thành công');
				$('#deleteModal').modal('hide');
				this.currentTemplateId = null;
				this.loadTemplates();
			} else {
				this.showToast('error', 'Không thể xóa mẫu khảo sát. Vui lòng thử lại.');
			}
		} catch (error) {
			this.showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		} finally {
			this.showLoading(false);
		}
	}

	resetUploadForm() {
		const form = $('#uploadForm')[0];
		if (form) form.reset();
	}

	viewTemplate(templateId) {
		const safeId = Number(templateId);
		if (!safeId) return;
		const surveyUrl = `${window.location.origin}/patient-survey.html?template_id=${safeId}&preview=true`;
		window.open(surveyUrl, '_blank', 'noopener,noreferrer');
	}

	showLoading(show) {
		$('.stm-card').toggleClass('loading', Boolean(show));
		$('#uploadBtn, #confirmDeleteBtn').prop('disabled', Boolean(show));
	}

	showToast(type, message) {
		if (window.AppointmentUtils) {
			window.AppointmentUtils.showToast(type, message);
		}
	}

	formatDate(value) {
		if (!value) return 'N/A';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'N/A';
		return date.toLocaleDateString('vi-VN');
	}

	escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	escapeAttr(value) {
		return this.escapeHtml(value).replace(/`/g, '&#96;');
	}

	escapeRegExp(value) {
		return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	debounce(fn, delay) {
		let timer = null;
		return (...args) => {
			clearTimeout(timer);
			timer = setTimeout(() => fn.apply(this, args), delay);
		};
	}
}

$(document).ready(function () {
	window.surveyTemplateManager = new SurveyTemplateManager();
});
