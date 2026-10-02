// Survey template list: server search/pagination, preview/download, document upload/edit, delete.
// Questionnaire templates open in the shared create/edit modal (survey-template-create.js).
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import './utils.js';
import { byId, debounce, delegate, el, icon, on, replace } from './shared/dom.js';
import { surveyCreateModal } from './survey-template-create.js';
import './survey-result-config.js';
import { AppointmentUtils } from './utils.js';
import { QLPKPagination } from './components/clinic-pagination.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';

const state = { currentPage: 1, perPage: 10, searchTerm: '', templates: [], performers: [], currentTemplateId: null, documentTemplateId: null, canManage: false, mutating: false, revision: 0 };
const toast = (type, message) => AppointmentUtils?.showToast(type, message);
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const createModal = () => surveyCreateModal;

function highlight(text) {
	if (!state.searchTerm) return text;
	const parts = String(text).split(new RegExp(`(${escapeRegExp(state.searchTerm)})`, 'gi'));
	return parts.map((part, index) => (index % 2 ? el('span', { class: 'highlight' }, part) : part));
}

function formatDate(value) {
	const date = value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : 'N/A';
}

function renderPerformerOptions(select) {
	if (!select) return;
	const current = select.value;
	replace(select, new Option('Chưa gán (chọn sau khi chỉ định)', ''), state.performers.map(user => {
		const id = Number(user.id || user.user_id);
		const name = String(user.full_name || user.name || user.username || '').trim();
		return id && name ? new Option(name, String(id)) : null;
	}));
	if (current && [...select.options].some(option => option.value === String(current))) select.value = String(current);
}

async function loadPerformers() {
	try {
		const response = await fetch('/users/doctors');
		if (!response.ok) return;
		const data = await response.json();
		state.performers = Array.isArray(data) ? data : [];
		renderPerformerOptions(byId('uploadPerformer'));
	} catch {
		state.performers = [];
	}
}

function showLoginRequired() {
	const container = document.querySelector('.stm-card-body') || document.querySelector('.stm-main');
	if (!container) return;
	replace(container, el('div', { class: 'd-flex justify-content-center align-items-center stm-login-required' }, el('div', { class: 'text-center' },
		icon('bi-lock', 'stm-login-required-icon'), el('h3', { class: 'text-muted mb-3' }, 'Yêu cầu đăng nhập'),
		el('p', { class: 'text-muted mb-4' }, 'Vui lòng đăng nhập để truy cập tính năng này'),
		el('div', { class: 'd-flex gap-2 justify-content-center' }, el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'btn btn-primary js-go-login' },
			icon('bi-box-arrow-in-right', 'me-2'), 'Đăng nhập')))));
}

function rowButton([kind, className, title, iconName], template, extra = {}) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: `stm-action-btn ${className}`, 'data-template-id': Number(template.id) || 0, title, ...extra }, icon(iconName));
}

function templateRow(template, index) {
	const documentOnly = template.template_kind === 'document';
	const tone = ({ needs_configuration: 'warning', ready: 'active' })[template.readiness] || 'neutral';
	return el('tr', {},
		el('td', {}, (state.currentPage - 1) * state.perPage + index + 1),
		el('td', {}, el('strong', {}, highlight(template.name || 'Không tên')),
			template.file_name ? [el('br'), el('span', { class: 'text-muted' }, icon('bi-file-earmark'), ` ${template.file_name}`)] : null),
		el('td', {}, el('span', { class: 'stm-desc-cell' }, highlight(template.description || 'Không có mô tả'))),
		el('td', {}, template.default_performer_name || 'Chưa gán'),
		el('td', {}, formatDate(template.created_at)),
		el('td', { class: 'stm-table-center-cell' }, el('span', { class: `qlpk-status stm-badge stm-badge--${tone}`, title: template.readiness_message || '' }, template.readiness_label || 'Cần cấu hình')),
		el('td', { class: 'stm-table-center-cell' }, el('div', { class: 'stm-row-actions' },
			rowButton(['view', 'stm-action-btn--preview js-template-preview', documentOnly ? 'Tải tài liệu' : 'Xem trước khảo sát', documentOnly ? 'bi-download' : 'bi-eye'], template),
			state.canManage ? [rowButton(['edit', 'stm-action-btn--edit js-template-edit', 'Chỉnh sửa', 'bi-pencil'], template),
				rowButton(['danger', 'stm-action-btn--danger js-template-delete', 'Xóa', 'bi-trash'], template, { 'data-template-name': template.name || 'Không tên' })] : null)));
}

function renderTemplates(templates) {
	const body = byId('surveyTemplatesTableBody');
	if (templates.length) {
		replace(body, templates.map(templateRow));
		return;
	}
	const addFirst = state.canManage && !state.searchTerm
		? el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'stm-btn stm-btn--primary mt-3', id: 'emptyAddNewBtn' }, icon('bi-plus-circle'), 'Thêm mẫu khảo sát đầu tiên')
		: null;
	addFirst?.addEventListener('click', () => createModal()?.open('create'));
	replace(body, el('tr', {}, el('td', { colspan: 7, class: 'text-center py-5' }, el('div', { class: 'stm-empty' }, icon('bi-clipboard2-check'),
		el('p', {}, state.searchTerm ? 'Không tìm thấy mẫu khảo sát phù hợp' : 'Chưa có mẫu khảo sát nào được tạo'), addFirst))));
}

function showLoading(show) {
	document.querySelectorAll('.stm-card').forEach(card => card.classList.toggle('loading', Boolean(show)));
	['uploadBtn', 'confirmDeleteBtn'].forEach(id => { if (byId(id)) byId(id).disabled = Boolean(show); });
}

async function loadTemplates() {
	const revision = ++state.revision;
	try {
		showLoading(true);
		const params = new URLSearchParams({ page: String(state.currentPage), per_page: String(state.perPage) });
		if (state.searchTerm) params.append('search', state.searchTerm);
		const result = await (await fetch(`/api/survey-templates?${params}`)).json();
		if (revision !== state.revision) return;
		if (!result.success) {
			toast('error', 'Không thể tải mẫu khảo sát. Vui lòng thử lại.');
			return;
		}
		state.canManage = result.can_manage === true;
		['addNewBtn', 'uploadNewBtn'].forEach(id => {
			byId(id)?.classList.toggle('d-none', !state.canManage);
			if (byId(id)) byId(id).disabled = !state.canManage;
		});
		state.currentPage = Number(result.pagination?.page) || 1;
		state.templates = Array.isArray(result.data) ? result.data : [];
		renderTemplates(state.templates);
		state.pagination.update({ page: result.pagination?.page, pageSize: state.perPage, total: result.pagination?.total });
	} catch {
		if (revision === state.revision) toast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
	} finally {
		if (revision === state.revision) showLoading(false);
	}
}

function handleSearch() {
	state.searchTerm = byId('searchInput').value.trim();
	state.currentPage = 1;
	loadTemplates();
}

function resetUploadForm() {
	state.documentTemplateId = null;
	byId('uploadForm')?.reset();
}

function showUploadModal(template = null) {
	if (!state.canManage || state.mutating) return;
	resetUploadForm();
	state.documentTemplateId = template?.id || null;
	byId('uploadModalTitle').textContent = template ? 'Chỉnh sửa tài liệu khảo sát' : 'Tải tài liệu khảo sát';
	byId('uploadBtn').textContent = template ? 'Lưu' : 'Tải lên';
	byId('uploadFileGroup').classList.toggle('d-none', Boolean(template));
	byId('uploadFile').required = !template;
	if (template) {
		byId('uploadName').value = template.name ?? '';
		byId('uploadDescription').value = template.description || '';
		byId('uploadPerformer').value = String(template.default_performer_id || '');
	}
	modal('uploadModal').show();
}

function uploadFormData() {
	const name = byId('uploadName').value.trim();
	const file = byId('uploadFile')?.files ? byId('uploadFile').files[0] : null;
	if (!name) {
		toast('error', 'Tên mẫu khảo sát là bắt buộc');
		return null;
	}
	if (!state.documentTemplateId && !file) {
		toast('error', 'Vui lòng chọn file');
		return null;
	}
	const formData = new FormData();
	formData.append('name', name);
	formData.append('description', byId('uploadDescription').value.trim());
	formData.append('default_performer_id', byId('uploadPerformer').value || '');
	if (!state.documentTemplateId) formData.append('file', file);
	return formData;
}

// Runs one mutating request with the shared loading/lock state.
async function mutate(run) {
	state.mutating = true;
	try {
		showLoading(true);
		await run();
	} catch {
		toast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
	} finally {
		state.mutating = false;
		showLoading(false);
	}
}

function uploadFile() {
	if (!state.canManage || state.mutating) return;
	const formData = uploadFormData();
	if (!formData) return;
	const editing = state.documentTemplateId;
	mutate(async () => {
		const response = await fetch(editing ? `/api/survey-templates/${editing}` : '/api/survey-templates/upload', {
			method: editing ? 'PUT' : 'POST', headers: editing ? { 'Content-Type': 'application/json' } : {}, body: editing ? JSON.stringify(Object.fromEntries(formData)) : formData });
		const result = await response.json();
		if (result.success) {
			toast('success', editing ? 'Đã cập nhật tài liệu khảo sát.' : 'Đã tải tài liệu khảo sát lên.');
			modal('uploadModal').hide();
			loadTemplates();
			return;
		}
		const failure = editing ? 'Không thể cập nhật tài liệu. Vui lòng kiểm tra thông tin và thử lại.' : 'Không thể tải tài liệu lên. Vui lòng kiểm tra tên và tệp.';
		toast('error', result.code === 'SURVEY_MANAGEMENT_FORBIDDEN' ? 'Bạn không có quyền quản lý mẫu khảo sát.' : failure);
	});
}

function deleteTemplate() {
	if (!state.canManage || state.mutating || !state.currentTemplateId) return;
	mutate(async () => {
		const result = await (await fetch(`/api/survey-templates/${state.currentTemplateId}`, { method: 'DELETE' })).json();
		if (!result.success) {
			toast('error', 'Không thể xóa mẫu khảo sát. Vui lòng thử lại.');
			return;
		}
		toast('success', 'Xóa thành công');
		modal('deleteModal').hide();
		state.currentTemplateId = null;
		loadTemplates();
	});
}

async function downloadTemplate(template) {
	try {
		const response = await fetch(`/api/survey-templates/download/${template.id}`);
		if (!response.ok) throw new Error('download');
		const url = URL.createObjectURL(await response.blob());
		const link = el('a', { href: url, download: template.file_name || template.name });
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	} catch {
		toast('error', 'Không thể tải tài liệu. Vui lòng thử lại.');
	}
}

function viewTemplate(id) {
	const template = state.templates.find(item => item.id === id);
	if (template?.template_kind === 'document') {
		downloadTemplate(template);
		return;
	}
	window.open(`${window.location.origin}/patient-survey.html?template_id=${id}&preview=true`, '_blank', 'noopener,noreferrer');
}

function bindEvents() {
	on(byId('searchInput'), 'keypress', event => { if (event.key === 'Enter') handleSearch(); });
	on(byId('searchInput'), 'input', debounce(handleSearch, 350));
	on(byId('uploadNewBtn'), 'click', () => showUploadModal());
	on(byId('addNewBtn'), 'click', () => { if (state.canManage) createModal()?.open('create'); });
	on(byId('uploadForm'), 'submit', event => {
		event.preventDefault();
		uploadFile();
	});
	on(byId('uploadBtn'), 'click', event => {
		event.preventDefault();
		uploadFile();
	});
	on(byId('confirmDeleteBtn'), 'click', deleteTemplate);
	on(byId('uploadModal'), 'hidden.bs.modal', resetUploadForm);
	const id = button => Number(button.getAttribute('data-template-id'));
	delegate(document, 'click', '.js-template-preview', (event, button) => { if (id(button)) viewTemplate(id(button)); });
	delegate(document, 'click', '.js-template-edit', (event, button) => {
		if (!state.canManage) return;
		const template = state.templates.find(item => item.id === id(button));
		if (template?.template_kind === 'document') showUploadModal(template);
		else if (id(button)) createModal()?.open('edit', id(button));
	});
	delegate(document, 'click', '.js-template-delete', (event, button) => {
		if (!id(button) || !state.canManage || state.mutating) return;
		state.currentTemplateId = id(button);
		byId('deleteTemplateName').textContent = button.getAttribute('data-template-name') || '';
		modal('deleteModal').show();
	});
	delegate(document, 'click', '.js-go-login', () => { window.location.href = '/login.html'; });
	on(document, 'qlpk:survey-template-saved', event => {
		event.detail.handled = true;
		loadTemplates();
	});
}

function init() {
	if (!window.QLPKApiTransport.hasSession()) {
		showLoginRequired();
		return;
	}
	state.pagination = QLPKPagination.create({ onChange(page, size) {
		state.currentPage = page;
		state.perPage = size;
		loadTemplates();
	} });
	bindEvents();
	QLPKRealtimePageHooks?.register({
		types: ['catalog.changed'],
		filter: event => ['survey_template', 'survey_criteria'].includes(event?.payload?.entity),
		handler(event) {
			if (event?.payload?.entity === 'survey_template') loadTemplates();
			if (event?.payload?.entity === 'survey_criteria') createModal()?.refreshCriteriaCache?.();
		},
		debounceMs: 350,
	});
	loadPerformers();
	loadTemplates();
}

// The create modal also initialises on DOMContentLoaded; keep the same start point.
document.addEventListener('DOMContentLoaded', init);
