// Document library: folder tree (admin add/rename/delete), documents of the selected folder, link and
// file upload (button or drag & drop), realtime refresh. Admin-only controls stay hidden for others.
// Shared page runtime (formerly classic script tags), in page order.
import './shared/confirmation-dialog.js';
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './custom-modal.js';
import './realtime-page-hooks.js';
import { byId, delegate, el, icon, on, replace } from './shared/dom.js';
import { HttpError, requestJson } from './shared/http-json.js';

const state = { currentFolderId: null, isUserAdmin: false };
const alertError = (message, type = 'error') => window.QLPKUserFeedback?.show(type, message);
const openDocModal = selector => document.querySelector(selector).classList.add('doc-modal-open');
const closeDocModal = selector => document.querySelector(selector).classList.remove('doc-modal-open');
const spinner = () => el('i', { class: 'spinner-border spinner-border-sm' });

function formatBytes(bytes, decimals = 2) {
	if (!+bytes) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals))} ${sizes[i]}`;
}

const FILE_ICONS = [
	[mime => mime.includes('pdf'), 'bi-file-earmark-pdf-fill', 'icon-pdf'],
	[mime => mime.includes('word') || mime.includes('document'), 'bi-file-earmark-word-fill', 'icon-word'],
	[mime => mime.includes('excel') || mime.includes('sheet'), 'bi-file-earmark-excel-fill', 'icon-excel'],
	[mime => mime.includes('image'), 'bi-file-earmark-image-fill', 'icon-img'],
];

function fileIcon(mimeType, type) {
	if (type === 'link') return icon('bi-link-45deg', 'file-icon icon-link');
	const [, name, tone] = FILE_ICONS.find(([matches]) => matches(mimeType)) || [null, 'bi-file-earmark-fill', 'icon-default'];
	return icon(name, `file-icon ${tone}`);
}

const hasActiveChild = (folder, activeId) => Boolean(folder.children) && folder.children.some(child => child.id === activeId || hasActiveChild(child, activeId));

function folderActions(folder) {
	const button = ([kind, variant, className, title, iconName], extra = {}) => el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': variant,
		class: `tree-action-btn ${className}`, title, 'data-id': folder.id, ...extra }, icon(iconName));
	return el('div', { class: 'tree-actions' }, button(['execute', 'solid', 'add-subfolder', 'Thêm mục con', 'bi-plus']), ' ',
		button(['edit', 'soft', 'edit-folder', 'Sửa tên', 'bi-pencil'], { 'data-name': folder.name }), ' ',
		button(['danger', 'soft', 'delete-folder text-danger border-danger', 'Xóa', 'bi-trash']));
}

function treeNode(folder) {
	const hasChildren = folder.children && folder.children.length > 0;
	const active = folder.id === state.currentFolderId;
	return el('li', { class: 'tree-item', 'data-id': folder.id },
		el('div', { class: `tree-node ${active ? 'active expanded' : ''}` },
			icon('bi-chevron-right', `tree-icon-toggle ${hasChildren ? '' : 'tree-icon-toggle-placeholder'}`), ' ', icon('bi-folder-fill', 'tree-icon-folder'), ' ',
			el('span', { class: 'folder-name' }, folder.name), state.isUserAdmin ? [' ', folderActions(folder)] : null),
		hasChildren ? el('ul', { class: `tree-list ${active || hasActiveChild(folder, state.currentFolderId) ? 'expanded' : ''}` }, folder.children.map(treeNode)) : null);
}

async function loadFolderTree() {
	try {
		replace(byId('folderTree'), (await requestJson('/api/document-folders')).map(treeNode));
	} catch (error) {
		console.error('Error loading folders', error);
		alertError('Không thể tải cấu trúc thư mục');
	}
}

function documentRow(doc) {
	const link = extra => ({ href: doc.url, target: '_blank', ...extra });
	return el('tr', {},
		el('td', {}, fileIcon(doc.mime_type, doc.type), ' ', el('a', link({ class: 'doc-file-link' }), doc.name)),
		el('td', {}, doc.type === 'link' ? el('span', { class: 'badge doc-link-badge' }, 'Link liên kết') : formatBytes(doc.size_bytes)),
		el('td', { class: 'doc-muted-cell' }, doc.updated_at),
		state.isUserAdmin ? el('td', { class: 'text-center' }, el('div', { class: 'd-flex justify-content-center gap-2' },
			el('a', link({ class: 'action-icon', title: 'Truy cập/Tải xuống' }), icon(doc.type === 'link' ? 'bi-box-arrow-up-right' : 'bi-download')),
			el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'action-icon action-icon-danger delete-doc', 'data-id': doc.id, title: 'Xóa' }, icon('bi-trash')))) : null);
}

async function loadDocuments(folderId) {
	try {
		const docs = await requestJson(`/api/documents?folder_id=${folderId}`);
		const body = byId('documentTableBody');
		if (!docs.length) {
			replace(body, el('tr', {}, el('td', { colspan: state.isUserAdmin ? 4 : 3, class: 'text-center doc-empty-cell' }, 'Chưa có tài liệu nào trong thư mục này')));
			return;
		}
		replace(body, docs.map(documentRow));
	} catch (error) {
		console.error('Error loading documents', error);
		alertError('Không thể tải danh sách tài liệu');
	}
}

function openFolderModal({ parentId = '', id = '', name = '', iconName, title }) {
	byId('parentFolderId').value = parentId;
	byId('folderId').value = id;
	byId('folderName').value = name;
	replace(byId('folderModalTitle'), icon(iconName, 'me-2'), title);
	openDocModal('#folderModal');
}

async function deleteFolder(id) {
	if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa thư mục này? Thư mục phải trống (không có file hay thư mục con) mới có thể xóa.')) return;
	try {
		await requestJson(`/api/document-folders/${id}`, { method: 'DELETE' });
		if (state.currentFolderId === id) {
			state.currentFolderId = null;
			replace(byId('folderBreadcrumb'), el('span', {}, 'Chưa chọn thư mục'));
			replace(byId('documentTableBody'), el('tr', {}, el('td', { colspan: 4, class: 'text-center doc-empty-cell' }, 'Vui lòng chọn thư mục')));
		}
		loadFolderTree();
	} catch (error) {
		const reason = error instanceof HttpError && error.status === 400 ? error.data?.error : '';
		alertError(reason || 'Không thể xóa thư mục. Vui lòng thử lại.');
	}
}

function selectNode(node) {
	node.classList.toggle('expanded');
	const children = node.parentElement.querySelector(':scope > .tree-list');
	children?.classList.toggle('expanded');
	byId('folderTree').querySelectorAll('.tree-node').forEach(other => other.classList.remove('active'));
	node.classList.add('active');
	state.currentFolderId = Number(node.closest('.tree-item').getAttribute('data-id'));
	replace(byId('folderBreadcrumb'), el('span', {}, node.querySelector('.folder-name').textContent));
	loadDocuments(state.currentFolderId);
}

function bindTree() {
	delegate(byId('folderTree'), 'click', '.tree-node, .tree-action-btn', (event, target) => {
		const id = Number(target.getAttribute('data-id'));
		if (target.classList.contains('add-subfolder')) openFolderModal({ parentId: id, iconName: 'bi-folder-plus', title: 'Thêm Thư Mục Con' });
		else if (target.classList.contains('edit-folder')) openFolderModal({ id, name: target.getAttribute('data-name'), iconName: 'bi-pencil', title: 'Đổi Tên Thư Mục' });
		else if (target.classList.contains('delete-folder')) deleteFolder(id);
		else if (!event.target.closest('.tree-actions')) selectNode(target);
	});
}

// Saves through a busy button whose label is restored afterwards.
async function busySave(button, label, request, done, failed) {
	replace(button, spinner(), ' Đang lưu...');
	button.disabled = true;
	try {
		await request();
		done();
	} catch {
		alertError(failed);
	} finally {
		replace(button, label);
		button.disabled = false;
	}
}

function saveFolder() {
	const id = byId('folderId').value;
	const parentId = byId('parentFolderId').value;
	const name = byId('folderName').value.trim();
	if (!name) {
		alertError('Vui lòng nhập tên thư mục', 'warning');
		return;
	}
	const payload = { name };
	if (!id && parentId) payload.parent_id = parseInt(parentId, 10);
	busySave(byId('btnSaveFolder'), 'Lưu thư mục', () => requestJson(id ? `/api/document-folders/${id}` : '/api/document-folders', { method: id ? 'PUT' : 'POST', json: payload }), () => {
		closeDocModal('#folderModal');
		loadFolderTree();
	}, 'Không thể lưu thư mục. Vui lòng kiểm tra lại.');
}

function saveLink() {
	const name = byId('linkName').value.trim();
	const url = byId('linkUrl').value.trim();
	if (!name || !url) {
		alertError('Vui lòng nhập đầy đủ tên và đường dẫn', 'warning');
		return;
	}
	busySave(byId('btnSaveLink'), 'Lưu liên kết', () => requestJson('/api/documents/link', { method: 'POST', json: { folder_id: state.currentFolderId, name, url } }), () => {
		closeDocModal('#linkModal');
		loadDocuments(state.currentFolderId);
	}, 'Không thể lưu liên kết. Vui lòng kiểm tra lại.');
}

function uploadFiles(files) {
	Array.from(files).forEach(async file => {
		const formData = new FormData();
		formData.append('file', file);
		formData.append('folder_id', state.currentFolderId);
		const statusRow = el('tr', { class: 'uploading-row' },
			el('td', {}, el('i', { class: 'spinner-border spinner-border-sm me-2 text-primary' }), ' ', el('span', { class: 'doc-uploading-name' }, `Đang tải lên: ${file.name}...`)),
			el('td', { colspan: state.isUserAdmin ? 3 : 2 }));
		byId('documentTableBody').prepend(statusRow);
		try {
			await requestJson('/api/documents/upload', { method: 'POST', body: formData });
			statusRow.remove();
			loadDocuments(state.currentFolderId);
		} catch {
			statusRow.remove();
			alertError('Không thể tải tệp lên. Vui lòng thử lại.');
		}
	});
	byId('fileInputHidden').value = '';
}

async function deleteDocument(button) {
	if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa tài liệu này? Hành động này sẽ xóa cả file trên Google Drive.')) return;
	replace(button, spinner());
	try {
		await requestJson(`/api/documents/${button.getAttribute('data-id')}`, { method: 'DELETE' });
	} catch {
		alertError('Không thể xóa tài liệu. Vui lòng thử lại.');
	}
	loadDocuments(state.currentFolderId);
}

function requireFolder(message) {
	if (state.currentFolderId) return true;
	alertError(message, 'warning');
	return false;
}

function bindDropzone() {
	const zone = byId('uploadDropzone');
	if (!zone) return;
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type => on(zone, type, event => { event.preventDefault(); event.stopPropagation(); }));
	['dragenter', 'dragover'].forEach(type => on(zone, type, () => zone.classList.add('bg-light', 'doc-dropzone-dragover')));
	['dragleave', 'drop'].forEach(type => on(zone, type, () => zone.classList.remove('bg-light', 'doc-dropzone-dragover')));
	on(zone, 'drop', event => {
		if (requireFolder('Vui lòng chọn một thư mục trước khi upload') && event.dataTransfer.files.length > 0) uploadFiles(event.dataTransfer.files);
	});
}

function bind() {
	const adminOnly = () => document.querySelectorAll('.admin-only-btn, .admin-only-col');
	adminOnly().forEach(node => node.classList.add('doc-admin-hidden'));
	window.QLPKApiTransport.currentUser().then(user => {
		state.isUserAdmin = user.role === 'admin';
		adminOnly().forEach(node => node.classList.toggle('doc-admin-hidden', !state.isUserAdmin));
	});
	delegate(document, 'click', '[data-doc-close]', (event, button) => closeDocModal(button.dataset.docClose));
	on(byId('btnCreateFolder'), 'click', () => openFolderModal({ iconName: 'bi-folder-plus', title: 'Thêm Thư Mục Gốc' }));
	on(byId('btnSaveFolder'), 'click', saveFolder);
	on(byId('btnAddLink'), 'click', () => {
		if (!requireFolder('Vui lòng chọn một thư mục trước')) return;
		['linkId', 'linkName', 'linkUrl'].forEach(id => { byId(id).value = ''; });
		openDocModal('#linkModal');
	});
	on(byId('btnSaveLink'), 'click', saveLink);
	on(byId('btnUploadFile'), 'click', () => { if (requireFolder('Vui lòng chọn một thư mục trước khi upload')) byId('fileInputHidden').click(); });
	on(byId('fileInputHidden'), 'change', event => { if (event.target.files && event.target.files.length > 0) uploadFiles(event.target.files); });
	delegate(byId('documentTableBody'), 'click', '.delete-doc', (event, button) => deleteDocument(button));
	bindTree();
	bindDropzone();
}

bind();
window.QLPKRealtimePageHooks?.register({
	types: ['document.changed'], debounceMs: 500,
	handler(event) {
		loadFolderTree();
		const folderId = event && event.payload ? event.payload.folder_id : null;
		if (state.currentFolderId && (!folderId || Number(folderId) === Number(state.currentFolderId))) loadDocuments(state.currentFolderId);
	},
});
loadFolderTree();
