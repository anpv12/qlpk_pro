(function (window) {
	'use strict';

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function updateNotesAttachmentCount(options = {}) {
		const notesAttachmentChip = options.notesAttachmentChip;
		if (notesAttachmentChip && typeof notesAttachmentChip.update === 'function') {
			notesAttachmentChip.update();
			return;
		}
		const countEl = getDocument(options).getElementById('notesAttachmentCount');
		if (!countEl) return;
		const total = typeof options.getTotalCount === 'function' ? options.getTotalCount() : 0;
		countEl.textContent = `${total}`;
	}

	function bindNotesUploadButton(options = {}) {
		if (options.notesAttachmentChip) return options.notesAttachmentChip;
		const chipFactory = window.NotesAttachmentChip;
		if (!chipFactory || typeof chipFactory.init !== 'function') return options.notesAttachmentChip || null;
		return chipFactory.init({
			onBeforeOpen: async () => {
				try {
					if (typeof options.loadAttachments === 'function') {
						await options.loadAttachments();
					}
				} catch (_) { }
			},
			getTotalCount: () => typeof options.getTotalCount === 'function' ? options.getTotalCount() : 0
		});
	}

	function ensureDocumentEditingAllowed(options = {}) {
		if (!options.isLocked) return true;
		if (options.showToast !== false && typeof options.showWarning === 'function') {
			options.showWarning('Vui lòng nhấn "Chỉnh sửa lịch sử" để thao tác tài liệu');
		}
		return false;
	}

	function setDocumentSectionLockState(locked, options = {}) {
		const doc = getDocument(options);
		const uploadBtn = doc.getElementById('uploadDocumentBtn');
		if (uploadBtn) {
			uploadBtn.disabled = locked;
			uploadBtn.style.pointerEvents = locked ? 'none' : '';
			uploadBtn.style.opacity = locked ? '0.6' : '';
		}
		const uploadArea = doc.getElementById('uploadArea');
		if (uploadArea) {
			uploadArea.classList.toggle('disabled', locked);
			uploadArea.style.pointerEvents = locked ? 'none' : '';
			uploadArea.style.opacity = locked ? '0.6' : '';
		}
		const fileInput = doc.getElementById('documentFileInput');
		if (fileInput) {
			fileInput.disabled = locked;
		}
		const documentsList = doc.getElementById('documentsList');
		if (documentsList) {
			documentsList.querySelectorAll('button').forEach(btn => {
				const action = btn.getAttribute('data-action');
				const role = btn.getAttribute('data-role');
				const isDeleteButton = action === 'delete' || action === 'server-delete' || role === 'draft-delete' || btn.classList.contains('btn-outline-danger');
				if (isDeleteButton) {
					btn.disabled = locked;
					btn.style.pointerEvents = locked ? 'none' : '';
					btn.style.opacity = locked ? '0.6' : '';
				}
			});
		}
	}

	function bindDocumentUploadControls(options = {}) {
		const doc = getDocument(options);
		const uploadBtn = doc.getElementById('uploadDocumentBtn');
		const uploadArea = doc.getElementById('uploadArea');
		const fileInput = doc.getElementById('documentFileInput');
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		const handleFileUpload = options.handleFileUpload || function () {};
		const uploadAttachment = options.uploadAttachment || async function () {};
		const hasCurrentPatient = options.hasCurrentPatient || function () { return false; };
		const getUploadedDocuments = options.getUploadedDocuments || function () { return []; };

		if (uploadBtn) {
			uploadBtn.addEventListener('click', function () {
				if (!ensureEditingAllowed()) return;
				if (fileInput) {
					fileInput.click();
				} else if (uploadArea) {
					uploadArea.style.display = 'block';
				}
			});
		}

		if (uploadArea) {
			uploadArea.addEventListener('click', function () {
				if (!ensureEditingAllowed()) return;
				fileInput.click();
			});

			uploadArea.addEventListener('dragover', function (e) {
				e.preventDefault();
				uploadArea.classList.add('dragover');
			});

			uploadArea.addEventListener('dragleave', function (e) {
				e.preventDefault();
				uploadArea.classList.remove('dragover');
			});

			uploadArea.addEventListener('drop', function (e) {
				e.preventDefault();
				uploadArea.classList.remove('dragover');
				if (!ensureEditingAllowed()) return;
				const files = e.dataTransfer.files;
				handleFileUpload(files);
			});
		}

		if (fileInput) {
			fileInput.addEventListener('change', async function (e) {
				if (!ensureEditingAllowed()) {
					e.target.value = '';
					return;
				}
				const files = Array.from(e.target.files || []);
				if (hasCurrentPatient()) {
					for (const f of files) {
						await uploadAttachment(f);
					}
				} else {
					handleFileUpload(files);
					try {
						options.sessionStorage.setItem(options.documentDraftKey, JSON.stringify(getUploadedDocuments().map(d => ({
							id: d.id,
							name: d.name,
							size: d.size,
							type: d.type,
							uploadDate: d.uploadDate
						}))));
					} catch (e) { }
					if (typeof options.showInfo === 'function') {
						options.showInfo(`Đã lưu ${files.length} tài liệu vào nháp. Sẽ upload khi lưu bệnh nhân.`);
					}
				}
				e.target.value = '';
			});
		}

		if (typeof options.setLockState === 'function') {
			options.setLockState(options.isLocked);
		}
	}

	function handleDraftFileUpload(files, options = {}) {
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		if (!ensureEditingAllowed()) return [];

		const doc = getDocument(options);
		const getUploadedDocuments = options.getUploadedDocuments || function () { return []; };
		const addUploadedDocument = options.addUploadedDocument || function (documentItem) {
			getUploadedDocuments().push(documentItem);
		};
		const validateFile = options.validateFile || function () { return true; };
		const renderDocumentsList = options.renderDocumentsList || function () {};
		const showInfo = options.showInfo || function () {};
		const showSuccess = options.showSuccess || function () {};
		const now = options.now || function () { return Date.now(); };
		const random = options.random || Math.random;
		const createUploadDate = options.createUploadDate || function () { return new Date(); };
		const addedDocuments = [];

		Array.from(files || []).forEach(file => {
			if (!validateFile(file)) return;

			const draftDocument = {
				id: now() + random(),
				name: file.name,
				size: file.size,
				type: file.type,
				file: file,
				uploadDate: createUploadDate()
			};

			const dup = getUploadedDocuments().some(d => d.name === draftDocument.name && d.size === draftDocument.size);
			if (dup) {
				showInfo(`File ${file.name} đã có trong danh sách.`);
				return;
			}

			addUploadedDocument(draftDocument);
			addedDocuments.push(draftDocument);
			renderDocumentsList();
			showSuccess(`Đã thêm file ${file.name}`);
		});

		const uploadArea = doc.getElementById('uploadArea');
		if (uploadArea) {
			uploadArea.style.display = 'none';
		}

		const fileInput = doc.getElementById('documentFileInput');
		if (fileInput) fileInput.value = '';

		return addedDocuments;
	}

	function downloadDraftDocument(docId, options = {}) {
		const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const draftDocument = documents.find(d => d.id === docId);
		if (!draftDocument || !draftDocument.file) return false;

		const doc = getDocument(options);
		const urlApi = options.URL || window.URL;
		if (!urlApi || typeof urlApi.createObjectURL !== 'function') return false;

		const url = urlApi.createObjectURL(draftDocument.file);
		const link = doc.createElement('a');
		link.href = url;
		link.download = draftDocument.name;
		doc.body.appendChild(link);
		link.click();
		doc.body.removeChild(link);
		urlApi.revokeObjectURL(url);
		return true;
	}

	async function deleteDraftDocument(docId, options = {}) {
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		if (!ensureEditingAllowed()) return false;

		const confirmed = await confirmDocumentDelete(options);
		if (!confirmed) return false;

		const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const nextDocuments = documents.filter(d => d.id !== docId);
		if (typeof options.setUploadedDocuments === 'function') {
			options.setUploadedDocuments(nextDocuments);
		}
		if (typeof options.renderDocumentsList === 'function') {
			options.renderDocumentsList();
		}
		if (typeof options.showSuccess === 'function') {
			options.showSuccess('Đã xóa tài liệu');
		}
		return true;
	}

	function buildDocumentDeleteConfirmationOptions() {
		return {
			title: 'Xóa tài liệu',
			text: 'Bạn có chắc chắn muốn xóa tài liệu này?',
			confirmText: 'Xóa',
			cancelText: 'Hủy',
			confirmButtonClass: 'btn btn-danger',
			cancelButtonClass: 'btn btn-outline-secondary'
		};
	}

	async function confirmDocumentDelete(options = {}) {
		if (typeof options.confirmDelete === 'function') {
			return options.confirmDelete();
		}
		const showConfirmationDialog = options.showConfirmationDialog || window.QLPKConfirmationDialog?.confirm;
		if (typeof showConfirmationDialog !== 'function') return false;
		return showConfirmationDialog(buildDocumentDeleteConfirmationOptions());
	}

	async function deleteServerAttachment(attachmentId, options = {}) {
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		if (!attachmentId || !ensureEditingAllowed()) return false;

		const confirmed = await confirmDocumentDelete(options);
		if (!confirmed) return false;

		const apiCall = options.apiCall;
		const showSuccess = options.showSuccess || function () {};
		const showError = options.showError || function () {};
		const loadAttachments = options.loadAttachments || async function () {};
		const logger = options.console || window.console;
		if (typeof apiCall !== 'function') return false;

		try {
			const res = await apiCall(`/attachments/${attachmentId}`, { method: 'DELETE' });
			if (res.ok) {
				showSuccess('Đã xóa tài liệu');
				await loadAttachments();
				return true;
			}

			const errorData = await res.json().catch(() => ({}));
			showError(errorData.detail || 'Không thể xóa tài liệu');
			return false;
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error('Error deleting attachment:', error);
			}
			showError('Lỗi khi xóa tài liệu');
			return false;
		}
	}

	async function uploadAttachmentForCurrentPatient(file, options = {}) {
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		if (!ensureEditingAllowed()) return false;

		const currentPatientId = typeof options.getCurrentPatientId === 'function'
			? options.getCurrentPatientId()
			: null;
		if (!currentPatientId) {
			if (typeof options.showError === 'function') {
				options.showError('Vui lòng chọn bệnh nhân trước khi tải tệp');
			}
			return false;
		}

		if (typeof options.uploadFile !== 'function') return false;
		return options.uploadFile(file, currentPatientId, { isDraft: false, showToast: true });
	}

	function resolveAttachmentFilename(attachmentId, options = {}) {
		const numericId = Number(attachmentId);
		const attachments = typeof options.getAttachments === 'function' ? options.getAttachments() : [];
		if (Array.isArray(attachments)) {
			const meta = attachments.find(item => Number(item.id) === numericId);
			if (meta) {
				return meta.original_filename || meta.filename || null;
			}
		}

		const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		if (Array.isArray(documents)) {
			const meta = documents.find(item => Number(item?.id) === numericId);
			if (meta) {
				return meta.name || meta.original_filename || meta.filename || null;
			}
		}
		return null;
	}

	function getFilenameFromContentDisposition(response) {
		const contentDisposition = response.headers.get('Content-Disposition') || '';
		const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/);
		return match ? decodeURIComponent(match[1] || match[2]) : null;
	}

	async function fetchAndDownloadAttachment(attachmentId, options = {}) {
		if (!attachmentId) return false;
		let filename = resolveAttachmentFilename(attachmentId, options);
		const apiCall = options.apiCall;
		const showError = options.showError || function () {};
		const logger = options.console || window.console;
		if (typeof apiCall !== 'function') return false;

		try {
			const response = await apiCall(`/attachments/${attachmentId}/download`, { method: 'GET' });
			if (!response.ok) {
				showError('Không thể tải tài liệu');
				return false;
			}
			const blob = await response.blob();
			if (!filename) {
				filename = getFilenameFromContentDisposition(response);
			}
			if (!filename) {
				filename = `attachment_${attachmentId}`;
			}

			const doc = getDocument(options);
			const urlApi = options.URL || window.URL;
			const url = urlApi.createObjectURL(blob);
			const link = doc.createElement('a');
			link.href = url;
			link.download = filename;
			doc.body.appendChild(link);
			link.click();
			doc.body.removeChild(link);
			urlApi.revokeObjectURL(url);
			return true;
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error('Error downloading attachment:', error);
			}
			showError('Lỗi khi tải tài liệu');
			return false;
		}
	}

	function renderSavedAttachmentsList(options = {}) {
		const doc = getDocument(options);
		const list = doc.getElementById('documentsList');
		if (!list) return false;

		const attachments = typeof options.getAttachments === 'function' ? options.getAttachments() : [];
		const updateCount = options.updateNotesAttachmentCount || function () {};
		if (!attachments || attachments.length === 0) {
			list.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-file-earmark-text exam-document-empty-icon"></i>
                <p class="mt-2 mb-0">Chưa có tài liệu nào được tải lên</p>
            </div>
        `;
			updateCount();
			return true;
		}

		const getFileIcon = options.getFileIcon || function () { return 'bi-file-earmark-text'; };
		const formatFileSize = options.formatFileSize || function (value) { return `${value}`; };
		list.innerHTML = attachments.map(att => `
        <div class="document-item" data-doc-id="${att.id}">
            <div class="document-info">
                <div class="document-icon">
                    <i class="bi ${getFileIcon(att.file_type || '')}"></i>
                </div>
                <div class="document-details">
                    <div class="document-name">${att.original_filename || att.filename}</div>
                    <div class="document-size">${formatFileSize(Number(att.file_size || 0))}</div>
                </div>
                <div class="document-actions">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="download" data-id="${att.id}"><i class="bi bi-download"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${att.id}"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        </div>
    `).join('');
		updateCount();

		list.querySelectorAll('button[data-action="download"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = btn.getAttribute('data-id');
				if (!id) return;
				if (typeof options.fetchAndOpenAttachment === 'function') {
					options.fetchAndOpenAttachment(id);
				}
			});
		});
		list.querySelectorAll('button[data-action="delete"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = Number(btn.getAttribute('data-id'));
				if (!Number.isNaN(id) && typeof options.handleServerAttachmentDelete === 'function') {
					options.handleServerAttachmentDelete(id);
				}
			});
		});
		if (typeof options.setLockState === 'function') {
			options.setLockState(options.isLocked);
		}
		return true;
	}

	function renderDocumentList(options = {}) {
		const doc = getDocument(options);
		const documentsList = doc.getElementById('documentsList');
		if (!documentsList) return false;

		const uploadedDocuments = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const attachments = typeof options.getAttachments === 'function' ? options.getAttachments() : [];
		const updateCount = options.updateNotesAttachmentCount || function () {};
		if (uploadedDocuments.length === 0 && (!attachments || attachments.length === 0)) {
			documentsList.innerHTML = `
            <div class="text-center text-muted py-4">
                <i class="bi bi-file-earmark-text exam-document-empty-icon"></i>
                <p class="mt-2 mb-0">Chưa có tài liệu nào được tải lên</p>
            </div>
        `;
			updateCount();
			return true;
		}

		const getFileIcon = options.getFileIcon || function () { return 'bi-file-earmark-text'; };
		const formatFileSize = options.formatFileSize || function (value) { return `${value}`; };
		const formatDraftDate = options.formatDraftDate || function (documentItem) { return documentItem.uploadDate || ''; };
		const serverHtml = (attachments || []).map(att => `
        <div class="document-item" data-doc-id="${att.id}">
            <div class="document-info">
                <div class="document-icon">
                    <i class="bi ${getFileIcon(att.file_type || '')}"></i>
                </div>
                <div class="document-details">
                    <div class="document-name">${att.original_filename || att.filename}</div>
                    <div class="document-size">${formatFileSize(Number(att.file_size || 0))}</div>
                </div>
                <div class="document-actions">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="server-open" data-id="${att.id}">
                        <i class="bi bi-download"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="server-delete" data-id="${att.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

		const draftHtml = uploadedDocuments.map(documentItem => `
        <div class="document-item" data-doc-id="${documentItem.id}">
            <div class="document-info">
                <div class="document-icon">
                    <i class="bi ${getFileIcon(documentItem.type)}"></i>
                </div>
                <div class="document-details">
                    <div class="document-name">${documentItem.name}</div>
                    <div class="document-size">${formatFileSize(documentItem.size)} - ${formatDraftDate(documentItem)} <span class="badge bg-secondary ms-2">Nháp</span></div>
                </div>
                <div class="document-actions">
                    <button type="button" class="btn btn-sm btn-outline-primary" data-action="draft-download" data-id="${documentItem.id}">
                        <i class="bi bi-download"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-role="draft-delete" data-id="${documentItem.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

		documentsList.innerHTML = serverHtml + draftHtml;
		updateCount();
		documentsList.querySelectorAll('button[data-action="server-open"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = btn.getAttribute('data-id');
				if (!id) return;
				if (typeof options.fetchAndOpenAttachment === 'function') {
					options.fetchAndOpenAttachment(id);
				} else if (typeof window.fetchAndOpenAttachment === 'function') {
					window.fetchAndOpenAttachment(id);
				}
			});
		});
		documentsList.querySelectorAll('button[data-action="server-delete"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = Number(btn.getAttribute('data-id'));
				if (!Number.isNaN(id) && typeof options.handleServerAttachmentDelete === 'function') {
					options.handleServerAttachmentDelete(id);
				}
			});
		});
		documentsList.querySelectorAll('button[data-action="draft-download"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = Number(btn.getAttribute('data-id'));
				if (Number.isNaN(id)) return;
				if (typeof options.downloadDocument === 'function') {
					options.downloadDocument(id);
				} else if (typeof window.downloadDocument === 'function') {
					window.downloadDocument(id);
				}
			});
		});
		documentsList.querySelectorAll('button[data-role="draft-delete"]').forEach(btn => {
			btn.addEventListener('click', () => {
				const id = Number(btn.getAttribute('data-id'));
				if (Number.isNaN(id)) return;
				if (typeof options.deleteDocument === 'function') {
					options.deleteDocument(id);
				} else if (typeof window.deleteDocument === 'function') {
					window.deleteDocument(id);
				}
			});
		});
		if (typeof options.setLockState === 'function') {
			options.setLockState(options.isLocked);
		}
		return true;
	}

	async function loadAttachmentsForCurrentPatient(options = {}) {
		const doc = getDocument(options);
		const list = doc.getElementById('documentsList');
		if (!list) return false;

		const currentPatientId = typeof options.getCurrentPatientId === 'function' ? options.getCurrentPatientId() : null;
		if (!currentPatientId) {
			try {
				const raw = options.sessionStorage.getItem(options.documentDraftKey);
				if (raw) {
					const meta = JSON.parse(raw) || [];
					if (typeof options.setUploadedDocuments === 'function') {
						options.setUploadedDocuments(meta.map(m => ({ ...m })));
					}
				}
			} catch (e) { }
			if (typeof options.setAttachments === 'function') {
				options.setAttachments([]);
			}
			if (typeof options.renderDocumentsList === 'function') {
				options.renderDocumentsList();
			}
			return true;
		}

		try {
			const res = await options.apiCall(`/attachments/patients/${currentPatientId}/attachments`);
			if (res.ok) {
				const data = await res.json();
				if (typeof options.setAttachments === 'function') {
					options.setAttachments(Array.isArray(data) ? data : (data.attachments || []));
				}
				if (typeof options.renderAttachmentsList === 'function') {
					options.renderAttachmentsList();
				}
			} else {
				list.innerHTML = '<div class="text-danger py-3">Không tải được danh sách tài liệu.</div>';
			}
		} catch (e) {
			list.innerHTML = '<div class="text-danger py-3">Lỗi khi tải danh sách tài liệu.</div>';
		}
		return true;
	}

	async function uploadFileToPatient(file, patientId, options = {}) {
		const isDraft = Boolean(options.isDraft);
		const showToast = options.showToast !== false;
		const validateFile = options.validateFile || function () { return true; };
		if (!validateFile(file)) {
			return false;
		}

		try {
			const form = new FormData();
			form.append('file', file);
			const auth = typeof options.getAuthHeader === 'function' ? options.getAuthHeader() : null;
			const res = await options.fetch(`/attachments/patients/${patientId}/attachments`, {
				method: 'POST',
				body: form,
				headers: auth ? { 'Authorization': auth } : undefined
			});

			if (res.ok) {
				if (showToast && typeof options.showSuccess === 'function') {
					options.showSuccess('Tải lên tài liệu thành công');
				}
				if (!isDraft && typeof options.loadAttachments === 'function') {
					await options.loadAttachments();
				}
				return true;
			}

			const errorData = await res.json();
			if (showToast && typeof options.showError === 'function') {
				options.showError(`Tải lên thất bại: ${errorData.detail || 'Lỗi không xác định'}`);
			}
			return false;
		} catch (e) {
			if (showToast && typeof options.showError === 'function') {
				options.showError('Tải lên gặp lỗi');
			}
			return false;
		}
	}

	async function uploadDraftDocumentsForPatient(patientId, options = {}) {
		const uploadedDocuments = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		if (!patientId || !Array.isArray(uploadedDocuments) || uploadedDocuments.length === 0) return false;
		try {
			for (const documentItem of uploadedDocuments) {
				if (!documentItem || !documentItem.file) continue;
				if (typeof options.uploadFile === 'function') {
					await options.uploadFile(documentItem.file, patientId, { isDraft: true, showToast: false });
				}
			}
			if (typeof options.setUploadedDocuments === 'function') {
				options.setUploadedDocuments([]);
			}
			try {
				if (options.sessionStorage && options.documentDraftKey) {
					options.sessionStorage.removeItem(options.documentDraftKey);
				}
			} catch (e) { }
			try {
				if (typeof options.loadAttachments === 'function') await options.loadAttachments();
			} catch (e) { }
			return true;
		} catch (e) {
			return false;
		}
	}

	function createDocumentSectionAdapter(options = {}) {
		const doc = options.document || window.document;
		const getUploadedDocuments = () => typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const getAttachments = () => typeof options.getAttachments === 'function' ? options.getAttachments() : [];
		const getIsLocked = () => typeof options.getIsLocked === 'function' ? options.getIsLocked() : Boolean(options.isLocked);
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') options.showToast(type, message);
		};
		const adapter = {};

		adapter.updateNotesAttachmentCount = function () {
			return updateNotesAttachmentCount({
				document: doc,
				notesAttachmentChip: typeof options.getNotesAttachmentChip === 'function' ? options.getNotesAttachmentChip() : options.notesAttachmentChip,
				getTotalCount: () => (getAttachments()?.length || 0) + (getUploadedDocuments()?.length || 0)
			});
		};

		adapter.bindNotesUploadButton = function () {
			const chip = bindNotesUploadButton({
				notesAttachmentChip: typeof options.getNotesAttachmentChip === 'function' ? options.getNotesAttachmentChip() : options.notesAttachmentChip,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				getTotalCount: () => (getAttachments()?.length || 0) + (getUploadedDocuments()?.length || 0)
			});
			if (typeof options.setNotesAttachmentChip === 'function') options.setNotesAttachmentChip(chip);
			return chip;
		};

		adapter.ensureDocumentEditingAllowed = function (showToastOption = true) {
			return ensureDocumentEditingAllowed({
				isLocked: getIsLocked(),
				showToast: showToastOption,
				showWarning: message => showToast('warning', message)
			});
		};

		adapter.setDocumentSectionLockState = function (locked) {
			return setDocumentSectionLockState(locked, { document: doc });
		};

		adapter.handleServerAttachmentDelete = function (attachmentId) {
			return deleteServerAttachment(attachmentId, {
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				apiCall: options.apiCall,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => showToast('success', message),
				showError: message => showToast('error', message),
				console: options.console || window.console,
				showConfirmationDialog: options.showConfirmationDialog
			});
		};

		adapter.initializeDocumentUpload = function () {
			if (typeof options.getUploadInitialized === 'function' && options.getUploadInitialized()) return false;
			if (typeof options.setUploadInitialized === 'function') options.setUploadInitialized(true);
			return bindDocumentUploadControls({
				document: doc,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				handleFileUpload: adapter.handleFileUpload,
				uploadAttachment: adapter.uploadAttachmentForCurrentPatient,
				hasCurrentPatient: () => Boolean(typeof options.getCurrentPatientId === 'function' ? options.getCurrentPatientId() : null),
				getUploadedDocuments,
				showInfo: message => showToast('info', message),
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked()
			});
		};

		adapter.uploadFile = function (file, patientId, uploadOptions = {}) {
			return uploadFileToPatient(file, patientId, {
				...uploadOptions,
				fetch: options.fetch,
				validateFile: options.validateFile,
				getAuthHeader: options.getAuthHeader,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => showToast('success', message),
				showError: message => showToast('error', message)
			});
		};

		adapter.uploadDraftDocumentsForPatient = function (patientId) {
			return uploadDraftDocumentsForPatient(patientId, {
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				uploadFile: adapter.uploadFile,
				loadAttachments: adapter.loadAttachmentsForCurrentPatient
			});
		};

		adapter.handleFileUpload = function (files) {
			return handleDraftFileUpload(files, {
				document: doc,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				validateFile: options.validateFile,
				getUploadedDocuments,
				addUploadedDocument: documentItem => getUploadedDocuments().push(documentItem),
				renderDocumentsList: adapter.renderDocumentsList,
				showInfo: message => showToast('info', message),
				showSuccess: message => showToast('success', message)
			});
		};

		adapter.renderDocumentsList = function () {
			return renderDocumentList({
				document: doc,
				getUploadedDocuments,
				getAttachments,
				getFileIcon: options.getFileIcon,
				formatFileSize: options.formatFileSize,
				formatDraftDate: options.formatDraftDate,
				updateNotesAttachmentCount: adapter.updateNotesAttachmentCount,
				handleServerAttachmentDelete: adapter.handleServerAttachmentDelete,
				fetchAndOpenAttachment: adapter.fetchAndOpenAttachment,
				downloadDocument: adapter.downloadDocument,
				deleteDocument: adapter.deleteDocument,
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked()
			});
		};

		adapter.loadAttachmentsForCurrentPatient = function () {
			return loadAttachmentsForCurrentPatient({
				document: doc,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				apiCall: options.apiCall,
				getCurrentPatientId: options.getCurrentPatientId,
				setUploadedDocuments: options.setUploadedDocuments,
				setAttachments: options.setAttachments,
				renderDocumentsList: adapter.renderDocumentsList,
				renderAttachmentsList: adapter.renderAttachmentsList
			});
		};

		adapter.renderAttachmentsList = function () {
			return renderSavedAttachmentsList({
				document: doc,
				getAttachments,
				getFileIcon: options.getFileIcon,
				formatFileSize: options.formatFileSize,
				updateNotesAttachmentCount: adapter.updateNotesAttachmentCount,
				fetchAndOpenAttachment: adapter.fetchAndOpenAttachment,
				handleServerAttachmentDelete: adapter.handleServerAttachmentDelete,
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked()
			});
		};

		adapter.uploadAttachmentForCurrentPatient = function (file) {
			return uploadAttachmentForCurrentPatient(file, {
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getCurrentPatientId: options.getCurrentPatientId,
				uploadFile: adapter.uploadFile,
				showError: message => showToast('error', message)
			});
		};

		adapter.downloadDocument = function (docId) {
			return downloadDraftDocument(docId, {
				document: doc,
				URL: options.URL || window.URL,
				getUploadedDocuments
			});
		};

		adapter.fetchAndOpenAttachment = function (attachmentId) {
			return fetchAndDownloadAttachment(attachmentId, {
				document: doc,
				URL: options.URL || window.URL,
				apiCall: options.apiCall,
				getAttachments,
				getUploadedDocuments,
				showError: message => showToast('error', message),
				console: options.console || window.console
			});
		};

		adapter.deleteDocument = function (docId) {
			return deleteDraftDocument(docId, {
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				renderDocumentsList: adapter.renderDocumentsList,
				showSuccess: message => showToast('success', message),
				showConfirmationDialog: options.showConfirmationDialog
			});
		};

		return adapter;
	}

	function createExaminationDocumentSectionAdapter(options = {}) {
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') {
				options.showToast(type, message);
			}
		};
		const formatDraftDate = typeof options.formatDraftDate === 'function'
			? options.formatDraftDate
			: documentItem => {
				if (window.formatDateDisplay) return window.formatDateDisplay(documentItem.uploadDate);
				if (typeof options.formatDisplayDate === 'function') return options.formatDisplayDate(documentItem.uploadDate);
				return documentItem.uploadDate || '';
			};

		return createDocumentSectionAdapter({
			...options,
			URL: options.URL || window.URL,
			validateFile: options.validateFile,
			getFileIcon: options.getFileIcon,
			formatFileSize: options.formatFileSize,
			formatDraftDate,
			showToast,
			getCurrentPatientId: options.getCurrentPatientId || (() => window.currentPatientId),
			getIsLocked: options.getIsLocked,
			getUploadInitialized: options.getUploadInitialized,
			setUploadInitialized: options.setUploadInitialized,
			getNotesAttachmentChip: options.getNotesAttachmentChip,
			setNotesAttachmentChip: options.setNotesAttachmentChip,
			getUploadedDocuments: options.getUploadedDocuments,
			setUploadedDocuments: options.setUploadedDocuments,
			getAttachments: options.getAttachments,
			setAttachments: options.setAttachments
		});
	}

	window.ClinicalDocumentSectionUiUtils = {
		updateNotesAttachmentCount,
		bindNotesUploadButton,
		ensureDocumentEditingAllowed,
		setDocumentSectionLockState,
		bindDocumentUploadControls,
		handleDraftFileUpload,
		downloadDraftDocument,
		deleteDraftDocument,
		buildDocumentDeleteConfirmationOptions,
		confirmDocumentDelete,
		deleteServerAttachment,
		uploadAttachmentForCurrentPatient,
		fetchAndDownloadAttachment,
		renderDocumentList,
		renderSavedAttachmentsList,
		loadAttachmentsForCurrentPatient,
		uploadFileToPatient,
		uploadDraftDocumentsForPatient,
		createDocumentSectionAdapter,
		createExaminationDocumentSectionAdapter
	};
})(window);
