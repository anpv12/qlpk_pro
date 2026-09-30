// components/document-section-ui-utils.js: phần 1/2 (nạp trước document-section-ui-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/document-section-ui-utils'] || (window.QLPKModuleParts['components/document-section-ui-utils'] = { state: {} });

	function getDocument(options = {}) {
		return options.document || window.document;
	}
	function updateNotesAttachmentCount(options = {}) {
		const notesAttachmentChip = options.notesAttachmentChip;
		if (notesAttachmentChip && typeof notesAttachmentChip.update === 'function') {
			notesAttachmentChip.update();
			return;
		}
		const doc = getDocument(options);
		const countEl = doc.getElementById('notesAttachmentCount') || doc.getElementById('documentsCountBadge');
		if (!countEl) return;
		const total = typeof options.getTotalCount === 'function' ? options.getTotalCount() : 0;
		countEl.textContent = `${total}`;
		countEl.setAttribute('aria-label', `${total} tập tin đính kèm`);
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
				} catch (_) { console.warn('Không thể tải lại tệp đính kèm:', _); }
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
				const isDeleteButton = action === 'delete' || action === 'server-delete' || action === 'draft-delete' || role === 'draft-delete';
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
				const isCurrentContext = window.ReceptionistDocumentAttachmentControls.createContextGuard(options);
				if (hasCurrentPatient()) {
					for (const f of files) {
						if (!isCurrentContext()) break;
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
					} catch (e) { /* sessionStorage không khả dụng: bỏ qua */ }
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
	function resolveDraftUploadDeps(options) {
		const noop = function () {};
		const getUploadedDocuments = options.getUploadedDocuments || function () { return []; };
		return {
			getUploadedDocuments,
			addUploadedDocument: options.addUploadedDocument || function (documentItem) {
				getUploadedDocuments().push(documentItem);
			},
			validateFile: options.validateFile || function () { return true; },
			renderDocumentsList: options.renderDocumentsList || noop,
			showInfo: options.showInfo || noop,
			showSuccess: options.showSuccess || noop,
			now: options.now || function () { return Date.now(); },
			random: options.random || Math.random,
			createUploadDate: options.createUploadDate || function () { return new Date(); }
		};
	}

	function handleDraftFileUpload(files, options = {}) {
		const ensureEditingAllowed = options.ensureEditingAllowed || function () { return true; };
		if (!ensureEditingAllowed()) return [];

		const doc = getDocument(options);
		const { getUploadedDocuments, addUploadedDocument, validateFile, renderDocumentsList, showInfo, showSuccess, now, random, createUploadDate } = resolveDraftUploadDeps(options);
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

		const getDocuments = () => options.getUploadedDocuments?.() || [];
		const target = getDocuments().find(item => String(item.id) === String(docId));
		const isCurrentContext = window.ReceptionistDocumentAttachmentControls.createContextGuard(options);
		if (!target || !isCurrentContext()) return false;
		const confirmed = await confirmDocumentDelete(options);
		if (!confirmed || !isCurrentContext() || !ensureEditingAllowed() || !getDocuments().includes(target)) return false;

		const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
		const nextDocuments = documents.filter(item => item !== target);
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
		const isCurrentContext = window.ReceptionistDocumentAttachmentControls.createContextGuard(options);
		if (!isCurrentContext()) return false;
		return options.uploadFile(file, currentPatientId, { isDraft: false, showToast: true, isCurrentContext });
	}
	function logDocumentListError(options, message) {
		const logger = options.console || window.console;
		if (logger && typeof logger.error === 'function') logger.error(message);
	}
	function resolveAttachmentPreviewOpener(options, attachmentUtils, doc, showToast) {
		if (options.openAttachmentPreviewInNewTab) return options.openAttachmentPreviewInNewTab;
		if (typeof attachmentUtils.openAttachmentPreviewInNewTab !== 'function') return null;
		return (attachmentId, filename, actionOptions = {}) => attachmentUtils.openAttachmentPreviewInNewTab(attachmentId, filename, {
			...actionOptions,
			window,
			document: doc,
			URL: options.URL || window.URL,
			fetch: options.fetch || window.fetch.bind(window),
			showToast
		});
	}
	function renderSharedDocumentList(options = {}) {
		const renderer = window.ReceptionistDocumentAttachmentList;
		if (!renderer || typeof renderer.renderDocumentsList !== 'function') {
			logDocumentListError(options, 'Thiếu renderer tài liệu dùng chung');
			return false;
		}

		const doc = getDocument(options);
		const attachmentUtils = window.ReceptionistDocumentAttachmentUtils;
		if (!attachmentUtils) {
			logDocumentListError(options, 'Thiếu tiện ích tài liệu dùng chung');
			return false;
		}
		const showToast = typeof options.showToast === 'function' ? options.showToast : function () {};
		const openAttachmentPreviewInNewTab = resolveAttachmentPreviewOpener(options, attachmentUtils, doc, showToast);
		if (typeof openAttachmentPreviewInNewTab !== 'function') return false;

		renderer.renderDocumentsList({
			document: doc,
			utils: attachmentUtils,
			getAttachments: options.getAttachments,
			getCurrentPatientId: options.getCurrentPatientId,
			getContextToken: options.getContextToken,
			ensureEditingAllowed: options.ensureEditingAllowed,
			getUploadedDocuments: options.getUploadedDocuments,
			formatDateDisplay: options.formatDateDisplay || options.formatDraftDate,
			openAttachmentPreviewInNewTab,
			apiCall: options.apiCall,
			showToast,
			showConfirmationDialog: options.showConfirmationDialog,
			loadAttachmentsForCurrentPatient: options.loadAttachmentsForCurrentPatient || options.loadAttachments,
			downloadDraftDocument: options.downloadDraftDocument || options.downloadDocument,
			deleteDraftDocument: options.deleteDraftDocument || options.deleteDocument
		});

		if (typeof options.setLockState === 'function') {
			options.setLockState(options.isLocked);
		}
		return true;
	}
	async function loadAttachmentsForCurrentPatient(options = {}) {
		return window.ReceptionistDocumentAttachmentControls.loadAttachmentsForCurrentPatient({
			...options,
			renderDocumentsList: options.renderDocumentsList || options.renderAttachmentsList
		});
	}
	async function uploadFileToPatient(file, patientId, options = {}) {
		const isCurrentContext = () => options.isCurrentContext?.() !== false;
		if (!isCurrentContext()) return false;
		const isDraft = Boolean(options.isDraft);
		const showToast = options.showToast !== false;
		const validateFile = options.validateFile || function () { return true; };
		if (!validateFile(file)) {
			return false;
		}

		try {
			const form = new FormData();
			form.append('file', file);
			const fetchRequest = options.fetch || window.fetch.bind(window);
			const res = await fetchRequest(`/attachments/patients/${patientId}/attachments`, {
				method: 'POST',
				body: form
			});

			if (!isCurrentContext()) return false;
			if (res.ok) {
				notifyUpload(options, showToast, 'showSuccess', 'Tải lên tài liệu thành công');
				if (!isDraft && typeof options.loadAttachments === 'function') {
					await options.loadAttachments();
				}
				return true;
			}

			notifyUpload(options, showToast, 'showError', 'Không thể tải tài liệu lên. Vui lòng thử lại.');
			return false;
		} catch (e) {
			if (isCurrentContext()) notifyUpload(options, showToast, 'showError', 'Tải lên gặp lỗi');
			return false;
		}
	}

	function notifyUpload(options, enabled, method, message) {
		if (enabled && typeof options[method] === 'function') options[method](message);
	}
	function persistRemainingDocumentDrafts(documents, options) {
		try {
			if (!options.sessionStorage || !options.documentDraftKey) return;
			if (!documents.length) {
				options.sessionStorage.removeItem(options.documentDraftKey);
				return;
			}
			options.sessionStorage.setItem(options.documentDraftKey, JSON.stringify(documents.map(item => ({
				id: item.id, name: item.name, size: item.size, type: item.type, uploadDate: item.uploadDate
			}))));
		} catch (error) {
			console.warn('[DocumentSection] draft cache update failed', error);
		}
	}
	function assertDocumentUploadContext(options) {
		if (typeof options.isCurrentContext === 'function' && !options.isCurrentContext()) {
			throw new Error('document-upload-stale');
		}
	}
	async function uploadDraftDocumentsForPatient(patientId, options = {}) {
		const getDocuments = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments : () => [];
		const uploadedDocuments = getDocuments();
		if (!patientId || !Array.isArray(uploadedDocuments) || uploadedDocuments.length === 0) return false;
		for (const documentItem of [...uploadedDocuments]) {
			assertDocumentUploadContext(options);
			if (!documentItem?.file || typeof options.uploadFile !== 'function') throw new Error('document-upload-unavailable');
			const uploaded = await options.uploadFile(documentItem.file, patientId, { isDraft: true, showToast: false, isCurrentContext: options.isCurrentContext });
			assertDocumentUploadContext(options);
			if (uploaded !== true) throw new Error('document-upload-failed');
			const currentDocuments = getDocuments();
			const index = currentDocuments.indexOf(documentItem);
			if (index !== -1) currentDocuments.splice(index, 1);
			if (typeof options.setUploadedDocuments === 'function') options.setUploadedDocuments(currentDocuments);
			persistRemainingDocumentDrafts(currentDocuments, options);
		}
		if (getDocuments().length) throw new Error('document-upload-new-drafts');
		if (typeof options.loadAttachments === 'function') await options.loadAttachments();
		return true;
	}

	Object.assign(moduleParts, {
		getDocument,
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
		uploadAttachmentForCurrentPatient,
		logDocumentListError,
		resolveAttachmentPreviewOpener,
		renderSharedDocumentList,
		loadAttachmentsForCurrentPatient,
		uploadFileToPatient,
		persistRemainingDocumentDrafts,
		assertDocumentUploadContext,
		uploadDraftDocumentsForPatient
	});
})(window);
