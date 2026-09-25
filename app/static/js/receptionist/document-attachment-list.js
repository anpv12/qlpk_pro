(function (window, document) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function getUtils(options) {
		return options && options.utils ? options.utils : window.ReceptionistDocumentAttachmentUtils;
	}

	function getAttachments(options) {
		return typeof options.getAttachments === 'function' ? options.getAttachments() : [];
	}

	function getUploadedDocuments(options) {
		return typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
	}

	function escapeAttr(value) {
		return String(value || '').replace(/"/g, '&quot;');
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function formatDate(value, options) {
		const formatDateDisplay = options.formatDateDisplay || window.formatDateDisplay || (date => date || '');
		return formatDateDisplay(value) || '--';
	}

	function renderActionButton(action, title, attrs) {
		if (!window.QLPKIconSystem || typeof window.QLPKIconSystem.renderActionButton !== 'function') return '';
		return window.QLPKIconSystem.renderActionButton({ action, title, label: title, attrs });
	}

	function renderEmptyState() {
		return `
            <div class="receptionist-documents-empty">
				<i class="bi bi-file-earmark-text receptionist-empty-file-icon qlpk-file-icon"></i>
                <p class="receptionist-documents-empty__text">Chưa có tài liệu nào được tải lên</p>
            </div>
		`;
	}

	function buildDocumentsTable(rowsHtml) {
		return `
			<div class="receptionist-documents-table-wrap">
				<table class="receptionist-documents-table">
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
							<th colspan="4">Tập tin</th>
							<th>Dung lượng</th>
							<th>Ngày tải</th>
							<th>Trạng thái</th>
							<th>Thao tác</th>
						</tr>
					</thead>
					<tbody>${rowsHtml}</tbody>
				</table>
			</div>
		`;
	}

	function buildServerDocumentHtml(att, options) {
		const utils = getUtils(options);
		const filename = att.original_filename || att.filename || '';
		const fileKind = typeof utils.getFileKind === 'function' ? utils.getFileKind(att.file_type || '', filename) : 'file';
		const fileIcon = utils.getFileIcon(att.file_type || '', filename);
		const viewButton = renderActionButton('view', 'Xem tài liệu', {
			'data-action': 'download',
			'data-id': att.id,
			'data-filename': filename,
			'data-filetype': att.file_type || ''
		});
		const deleteButton = renderActionButton('delete', 'Xóa tài liệu', {
			'data-action': 'delete',
			'data-id': att.id
		});
		return `
		<tr class="document-row" data-doc-id="${att.id}">
			<td class="document-file-cell" colspan="4">
				<div class="document-file-main">
					<span class="document-icon document-icon--${escapeHtml(fileKind)}"><i class="bi ${escapeHtml(fileIcon)} qlpk-file-icon"></i></span>
					<span class="document-name" title="${escapeAttr(filename)}">${escapeHtml(filename)}</span>
				</div>
			</td>
			<td>${utils.formatFileSize(Number(att.file_size || 0))}</td>
			<td>${escapeHtml(formatDate(att.upload_date, options))}</td>
			<td><span class="qlpk-status qlpk-status--success document-status-badge">Đã lưu</span></td>
			<td class="document-actions-cell">
				<div class="document-actions">
					${viewButton}
					${deleteButton}
				</div>
			</td>
		</tr>
	`;
	}

	function buildDraftDocumentHtml(docItem, options) {
		const utils = getUtils(options);
		const fileKind = typeof utils.getFileKind === 'function' ? utils.getFileKind(docItem.type, docItem.name) : 'file';
		const fileIcon = utils.getFileIcon(docItem.type, docItem.name);
		const downloadButton = renderActionButton('download', 'Tải tài liệu', {
			'data-action': 'draft-download',
			'data-id': docItem.id
		});
		const deleteButton = renderActionButton('delete', 'Xóa tài liệu', {
			'data-action': 'draft-delete',
			'data-id': docItem.id
		});
		return `
		<tr class="document-row" data-doc-id="${docItem.id}">
			<td class="document-file-cell" colspan="4">
				<div class="document-file-main">
					<span class="document-icon document-icon--${escapeHtml(fileKind)}"><i class="bi ${escapeHtml(fileIcon)} qlpk-file-icon"></i></span>
					<span class="document-name" title="${escapeAttr(docItem.name)}">${escapeHtml(docItem.name)}</span>
				</div>
			</td>
			<td>${utils.formatFileSize(docItem.size)}</td>
			<td>${escapeHtml(formatDate(docItem.uploadDate, options))}</td>
			<td><span class="qlpk-status qlpk-status--warning document-status-badge">Nháp</span></td>
			<td class="document-actions-cell">
				<div class="document-actions">
					${downloadButton}
					${deleteButton}
				</div>
			</td>
		</tr>
	`;
	}

	function bindDocumentActions(list, options) {
		if (list._documentAttachmentActionsBound) return;

		list.addEventListener('click', async event => {
			const btn = event.target.closest('button[data-action]');
			if (!btn || !list.contains(btn)) return;

			const action = btn.getAttribute('data-action');
			const id = btn.getAttribute('data-id');
			if (!id) return;

			if (action === 'download') {
				const filename = btn.getAttribute('data-filename') || `attachment-${id}`;
				if (typeof options.openAttachmentPreviewInNewTab === 'function') {
					await options.openAttachmentPreviewInNewTab(id, filename);
				}
				return;
			}

			if (action === 'delete') {
				if (typeof options.showConfirmationDialog !== 'function') return;
				const confirmed = await options.showConfirmationDialog({
					title: 'Xóa tài liệu',
					text: 'Bạn có chắc chắn muốn xóa tài liệu này?',
					confirmText: 'Xóa',
					cancelText: 'Hủy',
					variant: 'danger',
					showToast: options.showToast
				});
				if (!confirmed) return;
				try {
					const res = await options.apiCall(`/attachments/${id}`, { method: 'DELETE' });
					if (res.ok) {
						if (typeof options.showToast === 'function') {
							options.showToast('success', 'Đã xoá tài liệu');
						}
						if (typeof options.loadAttachmentsForCurrentPatient === 'function') {
							await options.loadAttachmentsForCurrentPatient();
						}
					} else if (typeof options.showToast === 'function') {
						options.showToast('error', 'Xoá tài liệu thất bại');
					}
				} catch (e) {
					if (typeof options.showToast === 'function') {
						options.showToast('error', 'Xoá tài liệu gặp lỗi');
					}
				}
				return;
			}

			if (action === 'draft-download' && typeof options.downloadDraftDocument === 'function') {
				options.downloadDraftDocument(id);
				return;
			}

			if (action === 'draft-delete' && typeof options.deleteDraftDocument === 'function') {
				await options.deleteDraftDocument(id);
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

		const attachments = getAttachments(options);
		const uploadedDocuments = getUploadedDocuments(options);
		const totalDocuments = (attachments || []).length + uploadedDocuments.length;
		updateDocumentsCountBadge(totalDocuments, options);
		if (totalDocuments === 0) {
			documentsList.innerHTML = renderEmptyState();
			return;
		}

		const serverHtml = (attachments || []).map(att => buildServerDocumentHtml(att, options)).join('');
		const draftHtml = uploadedDocuments.map(docItem => buildDraftDocumentHtml(docItem, options)).join('');
		documentsList.innerHTML = buildDocumentsTable(serverHtml + draftHtml);
		bindDocumentActions(documentsList, options);
	}

	window.ReceptionistDocumentAttachmentList = {
		renderDocumentsList
	};
})(window, document);
