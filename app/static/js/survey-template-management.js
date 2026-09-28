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
		this.documentTemplateId = null;
		this.canManage = false;
		this.mutating = false;
		this.init();
	}

	init() {
		if (!this.hasToken()) {
			this.showLoginRequired();
			return;
		}

        this.pagination = window.QLPKPagination.create({ onChange: (page, size) => {
            this.state.currentPage = page;
            this.state.perPage = size;
            this.loadTemplates();
        } });
		this.bindEvents();
		this.registerRealtimeHooks();
		this.loadPerformers();
		this.loadTemplates();
	}

	hasToken() {
		return window.QLPKApiTransport.hasSession();
	}

	async loadPerformers() {
		try {
			const response = await fetch('/users/doctors');
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
						<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-primary js-go-login">
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
			if (this.canManage && window.surveyCreateModal) {
				window.surveyCreateModal.open('create');
			}
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
			if (!this.canManage) return;
			const template = this.state.templates.find(item => item.id === id);
			if (template?.template_kind === 'document') return this.showUploadModal(template);
			if (id && window.surveyCreateModal) {
				window.surveyCreateModal.open('edit', id);
			}
		});

		$(document).on('click', '.js-template-delete', (e) => {
			const id = Number($(e.currentTarget).data('template-id'));
			const name = String($(e.currentTarget).data('template-name') || '');
			if (id) this.showDeleteModal(id, name);
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
		const revision = (this.loadRevision || 0) + 1;
		this.loadRevision = revision;
		try {
			this.showLoading(true);

			const params = new URLSearchParams({
				page: String(this.state.currentPage),
				per_page: String(this.state.perPage)
			});

			if (this.state.searchTerm) {
				params.append('search', this.state.searchTerm);
			}

			const response = await fetch(`/api/survey-templates?${params}`);

			const result = await response.json();
			if (revision !== this.loadRevision) return;

			if (result.success) {
				this.canManage = result.can_manage === true;
				$('#addNewBtn, #uploadNewBtn').toggleClass('d-none', !this.canManage);
				$('#addNewBtn, #uploadNewBtn').prop('disabled', !this.canManage);
				this.state.currentPage = Number(result.pagination?.page) || 1;
				this.state.totalItems = Number(result.pagination?.total) || 0;
				this.state.templates = Array.isArray(result.data) ? result.data : [];
				this.renderTemplates(this.state.templates);
				this.renderPagination(result.pagination || {});
			} else {
				this.showToast('error', 'Không thể tải mẫu khảo sát. Vui lòng thử lại.');
			}
		} catch (error) {
			if (revision !== this.loadRevision) return;
			this.showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		} finally {
			if (revision === this.loadRevision) this.showLoading(false);
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
                            <p>${this.state.searchTerm ? 'Không tìm thấy mẫu khảo sát phù hợp' : 'Chưa có mẫu khảo sát nào được tạo'}</p>
                            ${this.canManage && !this.state.searchTerm ? `
                            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="stm-btn stm-btn--primary mt-3" id="emptyAddNewBtn">
                                <i class="bi bi-plus-circle"></i>Thêm mẫu khảo sát đầu tiên
                            </button>` : ''}
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

	}

	createTemplateRow(template, index) {
		const id = Number(template.id) || 0;
		const name = this.escapeHtml(template.name || 'Không tên');
		const nameAttr = this.escapeAttr(template.name || 'Không tên');
		const fileName = this.escapeHtml(template.file_name || '');
		const description = this.escapeHtml(template.description || 'Không có mô tả');
		const performer = this.escapeHtml(template.default_performer_name || 'Chưa gán');
		const createdDate = this.formatDate(template.created_at);
		const documentOnly = template.template_kind === 'document';
		const badgeClass = template.readiness === 'needs_configuration' ? 'warning' : template.readiness === 'ready' ? 'active' : 'neutral';
		const statusBadge = `<span class="qlpk-status stm-badge stm-badge--${badgeClass}" title="${this.escapeAttr(template.readiness_message || '')}">${this.escapeHtml(template.readiness_label || 'Cần cấu hình')}</span>`;

		return `
            <tr>
                <td>${(this.state.currentPage - 1) * this.state.perPage + index + 1}</td>
                <td>
                    <strong>${this.highlightSearch(name)}</strong>
                    ${fileName ? `<br><span class="text-muted"><i class="bi bi-file-earmark"></i> ${fileName}</span>` : ''}
                </td>
	                <td><span class="stm-desc-cell">${this.highlightSearch(description)}</span></td>
	                <td>${performer}</td>
	                <td>${createdDate}</td>
                <td class="stm-table-center-cell">${statusBadge}</td>
                <td class="stm-table-center-cell">
                    <div class="stm-row-actions">
                        <button data-qlpk-button="view" data-qlpk-button-variant="soft" class="stm-action-btn stm-action-btn--preview js-template-preview" data-template-id="${id}" title="${documentOnly ? 'Tải tài liệu' : 'Xem trước khảo sát'}">
                            <i class="bi ${documentOnly ? 'bi-download' : 'bi-eye'}"></i>
                        </button>
                        ${this.canManage ? `
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="stm-action-btn stm-action-btn--edit js-template-edit" data-template-id="${id}" title="Chỉnh sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="stm-action-btn stm-action-btn--danger js-template-delete" data-template-id="${id}" data-template-name="${nameAttr}" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>` : ''}
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
        this.pagination.update({ page: pagination.page, pageSize: this.state.perPage, total: pagination.total });
    }

	handleSearch() {
		this.state.searchTerm = $('#searchInput').val().trim();
		this.state.currentPage = 1;
		this.loadTemplates();
	}

	showUploadModal(template = null) {
		if (!this.canManage || this.mutating) return;
		this.resetUploadForm();
		this.documentTemplateId = template?.id || null;
		$('#uploadModalTitle').text(template ? 'Chỉnh sửa tài liệu khảo sát' : 'Tải tài liệu khảo sát');
		$('#uploadBtn').text(template ? 'Lưu' : 'Tải lên');
		$('#uploadFileGroup').toggleClass('d-none', !!template);
		$('#uploadFile').prop('required', !template);
		if (template) {
			$('#uploadName').val(template.name);
			$('#uploadDescription').val(template.description || '');
			$('#uploadPerformer').val(String(template.default_performer_id || ''));
		}
		$('#uploadModal').modal('show');
	}

	async uploadFile() {
		if (!this.canManage || this.mutating) return;
		const formData = this.getUploadFormData();
		if (!formData) return;
		this.mutating = true;
		const editing = this.documentTemplateId;

		try {
			this.showLoading(true);
			const response = await fetch(editing ? `/api/survey-templates/${editing}` : '/api/survey-templates/upload', {
				method: editing ? 'PUT' : 'POST',
				headers: editing ? { 'Content-Type': 'application/json' } : {},
				body: editing ? JSON.stringify(Object.fromEntries(formData)) : formData
			});

			const result = await response.json();
			if (result.success) {
				this.showToast('success', editing ? 'Đã cập nhật tài liệu khảo sát.' : 'Đã tải tài liệu khảo sát lên.');
				$('#uploadModal').modal('hide');
				this.loadTemplates();
			} else {
				this.showToast('error', result.code === 'SURVEY_MANAGEMENT_FORBIDDEN'
					? 'Bạn không có quyền quản lý mẫu khảo sát.'
					: editing ? 'Không thể cập nhật tài liệu. Vui lòng kiểm tra thông tin và thử lại.' : 'Không thể tải tài liệu lên. Vui lòng kiểm tra tên và tệp.');
			}
		} catch (error) {
			this.showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		} finally {
			this.mutating = false;
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
		if (!this.documentTemplateId && !file) {
			this.showToast('error', 'Vui lòng chọn file');
			return null;
		}

		const formData = new FormData();
		formData.append('name', name);
		formData.append('description', description);
		formData.append('default_performer_id', $('#uploadPerformer').val() || '');
		if (!this.documentTemplateId) formData.append('file', file);
		return formData;
	}

	showDeleteModal(id, name) {
		if (!this.canManage || this.mutating) return;
		this.currentTemplateId = Number(id) || null;
		$('#deleteTemplateName').text(name || '');
		$('#deleteModal').modal('show');
	}

	async deleteTemplate() {
		if (!this.canManage || this.mutating || !this.currentTemplateId) return;
		this.mutating = true;

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
			this.mutating = false;
			this.showLoading(false);
		}
	}

	resetUploadForm() {
		this.documentTemplateId = null;
		const form = $('#uploadForm')[0];
		if (form) form.reset();
	}

	viewTemplate(templateId) {
		const safeId = Number(templateId);
		if (!safeId) return;
		const template = this.state.templates.find(item => item.id === safeId);
		if (template?.template_kind === 'document') return this.downloadTemplate(template);
		const surveyUrl = `${window.location.origin}/patient-survey.html?template_id=${safeId}&preview=true`;
		window.open(surveyUrl, '_blank', 'noopener,noreferrer');
	}

	async downloadTemplate(template) {
		try {
			const response = await fetch(`/api/survey-templates/download/${template.id}`);
			if (!response.ok) throw new Error('download');
			const url = URL.createObjectURL(await response.blob());
			const link = document.createElement('a');
			link.href = url;
			link.download = template.file_name || template.name;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (_) { this.showToast('error', 'Không thể tải tài liệu. Vui lòng thử lại.'); }
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
