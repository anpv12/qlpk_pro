import { el } from '../shared/dom.js';
import { ReceptionistDocumentAttachmentUtils } from './document-attachment-utils.js';
import { ReceptionistDocumentAttachmentControls } from './document-attachment-controls.js';

const actionStates = new WeakMap();

async function deleteServerDocument(id, options, isCurrentContext) {
	if (typeof options.showConfirmationDialog !== 'function') return;
	try {
		const confirmed = await options.showConfirmationDialog({
			title: 'Xóa tài liệu', text: 'Bạn có chắc chắn muốn xóa tài liệu này?',
			confirmText: 'Xóa', cancelText: 'Hủy', variant: 'danger', showToast: options.showToast
		});
		if (!confirmed || !isCurrentContext()) return;
		const response = await options.apiCall(`/attachments/${id}`, { method: 'DELETE' });
		if (!isCurrentContext()) return;
		if (!response.ok) {
			options.showToast?.('error', 'Xoá tài liệu thất bại');
			return;
		}
		options.showToast?.('success', 'Đã xoá tài liệu');
		await options.loadAttachmentsForCurrentPatient?.();
	} catch (error) {
		if (isCurrentContext()) options.showToast?.('error', 'Xoá tài liệu gặp lỗi');
	}
}

function getDocument(options) {
	return options && options.document ? options.document : document;
}

function getUtils(options) {
	return options && options.utils ? options.utils : ReceptionistDocumentAttachmentUtils;
}

function getAttachments(options) {
	return typeof options.getAttachments === 'function' ? options.getAttachments() : [];
}

function getUploadedDocuments(options) {
	return typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
}

function formatDate(value, options) {
	const formatDateDisplay = options.formatDateDisplay || window.formatDateDisplay || (date => date || '');
	return formatDateDisplay(value) || '--';
}

function buildActionButton(action, title, attrs) {
	if (!window.QLPKIconSystem || typeof window.QLPKIconSystem.createActionButton !== 'function') return null;
	return window.QLPKIconSystem.createActionButton({ action, title, label: title, attrs });
}

function buildEmptyState() {
	return el('div', { class: 'receptionist-documents-empty' },
		el('i', { class: 'bi bi-file-earmark-text receptionist-empty-file-icon qlpk-file-icon' }),
		el('p', { class: 'receptionist-documents-empty__text' }, 'Chưa có tài liệu nào được tải lên'));
}

const TABLE_COLUMNS = ['index', 'name', 'relation', 'id-number', 'phone', 'emergency', 'date', 'actions'];

function buildDocumentsTable(rows) {
	return el('div', { class: 'receptionist-documents-table-wrap' },
		el('table', { class: 'receptionist-documents-table' },
			el('colgroup', {}, TABLE_COLUMNS.map(name => el('col', { class: `receptionist-shared-col-${name}` }))),
			el('thead', {}, el('tr', {},
				el('th', { colspan: '4' }, 'Tập tin'),
				el('th', {}, 'Dung lượng'),
				el('th', {}, 'Ngày tải'),
				el('th', {}, 'Trạng thái'),
				el('th', {}, 'Thao tác'))),
			el('tbody', {}, rows)));
}

function buildDocumentRow({ id, fileKind, fileIcon, filename, sizeText, dateText, status, buttons }) {
	return el('tr', { class: 'document-row', 'data-doc-id': String(id) },
		el('td', { class: 'document-file-cell', colspan: '4' },
			el('div', { class: 'document-file-main' },
				el('span', { class: `document-icon document-icon--${fileKind || ''}` }, el('i', { class: `bi ${fileIcon || ''} qlpk-file-icon` })),
				el('span', { class: 'document-name', title: filename || '' }, filename || ''))),
		el('td', {}, String(sizeText)),
		el('td', {}, dateText || ''),
		el('td', {}, el('span', { class: `qlpk-status ${status.className} document-status-badge` }, status.text)),
		el('td', { class: 'document-actions-cell' }, el('div', { class: 'document-actions' }, buttons)));
}

function buildServerDocumentRow(att, options) {
	const utils = getUtils(options);
	const filename = att.original_filename || att.filename || '';
	const fileKind = typeof utils.getFileKind === 'function' ? utils.getFileKind(att.file_type || '', filename) : 'file';
	return buildDocumentRow({
		id: att.id,
		fileKind,
		fileIcon: utils.getFileIcon(att.file_type || '', filename),
		filename,
		sizeText: utils.formatFileSize(Number(att.file_size || 0)),
		dateText: formatDate(att.upload_date, options),
		status: { className: 'qlpk-status--success', text: 'Đã lưu' },
		buttons: [
			buildActionButton('view', 'Xem tài liệu', { 'data-action': 'download', 'data-id': att.id, 'data-filename': filename, 'data-filetype': att.file_type || '' }),
			buildActionButton('delete', 'Xóa tài liệu', { 'data-action': 'delete', 'data-id': att.id })
		]
	});
}

function buildDraftDocumentRow(docItem, options) {
	const utils = getUtils(options);
	const fileKind = typeof utils.getFileKind === 'function' ? utils.getFileKind(docItem.type, docItem.name) : 'file';
	return buildDocumentRow({
		id: docItem.id,
		fileKind,
		fileIcon: utils.getFileIcon(docItem.type, docItem.name),
		filename: docItem.name,
		sizeText: utils.formatFileSize(docItem.size),
		dateText: formatDate(docItem.uploadDate, options),
		status: { className: 'qlpk-status--warning', text: 'Nháp' },
		buttons: [
			buildActionButton('download', 'Tải tài liệu', { 'data-action': 'draft-download', 'data-id': docItem.id }),
			buildActionButton('delete', 'Xóa tài liệu', { 'data-action': 'draft-delete', 'data-id': docItem.id })
		]
	});
}

async function runAttachmentDelete(state, action, id, isCurrentContext) {
	const options = state.options;
	const key = `${action}:${id}`;
	if (state.pending.has(key)) return;
	state.pending.add(key);
	try {
		if (action === 'delete') {
			await deleteServerDocument(id, options, isCurrentContext);
		} else {
			await options.deleteDraftDocument?.(id, { isCurrentContext });
		}
	} catch (error) {
		if (isCurrentContext()) options.showToast?.('error', 'Xoá tài liệu gặp lỗi');
	} finally {
		state.pending.delete(key);
	}
}

function bindDocumentActions(list) {
	if (list._documentAttachmentActionsBound) return;

	list.addEventListener('click', async event => {
		const btn = event.target.closest('button[data-action]');
		if (!btn || !list.contains(btn)) return;

		const action = btn.getAttribute('data-action');
		const id = btn.getAttribute('data-id');
		if (!id) return;
		const state = actionStates.get(list);
		const options = state.options;
		const isDelete = action === 'delete' || action === 'draft-delete';
		const isCurrentContext = () => actionStates.get(list) === state && state.isCurrentContext()
			&& (!isDelete || options.ensureEditingAllowed?.(false) !== false);
		if (!isCurrentContext() || btn.disabled) return;

		if (action === 'download') {
			const filename = btn.getAttribute('data-filename') || `attachment-${id}`;
			if (typeof options.openAttachmentPreviewInNewTab === 'function') {
				await options.openAttachmentPreviewInNewTab(id, filename, { isCurrentContext });
			}
			return;
		}

		if (isDelete) {
			await runAttachmentDelete(state, action, id, isCurrentContext);
			return;
		}

		if (action === 'draft-download' && typeof options.downloadDraftDocument === 'function') {
			options.downloadDraftDocument(id);
		}
	});

	list._documentAttachmentActionsBound = true;
}

function updateDocumentsCountBadge(total, options) {
	const doc = getDocument(options);
	const badge = doc.getElementById('documentsCountBadge');
	if (!badge) return;
	badge.textContent = String(total || 0);
	badge.setAttribute('aria-label', `${total || 0} tập tin đính kèm`);
}

function renderDocumentsList(options = {}) {
	const doc = getDocument(options);
	const documentsList = doc.getElementById('documentsList');
	if (!documentsList) return;
	actionStates.set(documentsList, {
		options,
		isCurrentContext: ReceptionistDocumentAttachmentControls.createContextGuard(options),
		pending: actionStates.get(documentsList)?.pending || new Set()
	});
	bindDocumentActions(documentsList);

	const attachments = getAttachments(options);
	const uploadedDocuments = getUploadedDocuments(options);
	const totalDocuments = (attachments || []).length + uploadedDocuments.length;
	updateDocumentsCountBadge(totalDocuments, options);
	if (totalDocuments === 0) {
		documentsList.replaceChildren(buildEmptyState());
		return;
	}

	documentsList.replaceChildren(buildDocumentsTable([
		...(attachments || []).map(att => buildServerDocumentRow(att, options)),
		...uploadedDocuments.map(docItem => buildDraftDocumentRow(docItem, options))
	]));
}

export const ReceptionistDocumentAttachmentList = {
	renderDocumentsList
};
