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
				const isDeleteButton = action === 'delete' || action === 'server-delete' || action === 'draft-delete' || role === 'draft-delete' || btn.classList.contains('btn-outline-danger');
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

	function renderSharedDocumentList(options = {}) {
		const renderer = window.ReceptionistDocumentAttachmentList;
		if (!renderer || typeof renderer.renderDocumentsList !== 'function') {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error('Thiếu renderer tài liệu dùng chung');
			}
			return false;
		}

		const doc = getDocument(options);
		const attachmentUtils = window.ReceptionistDocumentAttachmentUtils;
		if (!attachmentUtils) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') logger.error('Thiếu tiện ích tài liệu dùng chung');
			return false;
		}
		const showToast = typeof options.showToast === 'function' ? options.showToast : function () {};
		const openAttachmentPreviewInNewTab = options.openAttachmentPreviewInNewTab || (
			typeof attachmentUtils.openAttachmentPreviewInNewTab === 'function'
				? (attachmentId, filename, actionOptions = {}) => attachmentUtils.openAttachmentPreviewInNewTab(attachmentId, filename, {
					...actionOptions,
					window,
					document: doc,
					URL: options.URL || window.URL,
					fetch: options.fetch || window.fetch.bind(window),
					showToast
				})
				: null
		);
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
				if (showToast && typeof options.showSuccess === 'function') {
					options.showSuccess('Tải lên tài liệu thành công');
				}
				if (!isDraft && typeof options.loadAttachments === 'function') {
					await options.loadAttachments();
				}
				return true;
			}

			if (showToast && typeof options.showError === 'function') {
				options.showError('Không thể tải tài liệu lên. Vui lòng thử lại.');
			}
			return false;
		} catch (e) {
			if (isCurrentContext() && showToast && typeof options.showError === 'function') {
				options.showError('Tải lên gặp lỗi');
			}
			return false;
		}
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
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
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
				loadAttachments: adapter.loadAttachmentsForCurrentPatient,
				showSuccess: message => showToast('success', message),
				showError: message => showToast('error', message)
			});
		};

		adapter.uploadDraftDocumentsForPatient = function (patientId, uploadOptions = {}) {
			return uploadDraftDocumentsForPatient(patientId, {
				isCurrentContext: uploadOptions.isCurrentContext,
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
			return renderSharedDocumentList({
				document: doc,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getUploadedDocuments,
				getAttachments,
				formatDateDisplay: options.formatDisplayDate,
				formatDraftDate: options.formatDraftDate,
				apiCall: options.apiCall,
				fetch: options.fetch,
				showToast,
				showConfirmationDialog: options.showConfirmationDialog,
				loadAttachmentsForCurrentPatient: adapter.loadAttachmentsForCurrentPatient,
				downloadDraftDocument: adapter.downloadDocument,
				deleteDraftDocument: adapter.deleteDocument,
				setLockState: adapter.setDocumentSectionLockState,
				isLocked: getIsLocked(),
				console: options.console || window.console
			});
		};

		adapter.loadAttachmentsForCurrentPatient = function () {
			return loadAttachmentsForCurrentPatient({
				document: doc,
				sessionStorage: options.sessionStorage,
				documentDraftKey: options.documentDraftKey,
				apiCall: options.apiCall,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
				getUploadedDocuments,
				setUploadedDocuments: options.setUploadedDocuments,
				setAttachments: options.setAttachments,
				renderDocumentsList: adapter.renderDocumentsList,
				renderAttachmentsList: adapter.renderAttachmentsList
			});
		};

		adapter.renderAttachmentsList = function () {
			return adapter.renderDocumentsList();
		};

		adapter.uploadAttachmentForCurrentPatient = function (file) {
			return uploadAttachmentForCurrentPatient(file, {
				ensureEditingAllowed: adapter.ensureDocumentEditingAllowed,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
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

		adapter.deleteDocument = function (docId, actionOptions = {}) {
			return deleteDraftDocument(docId, {
				...actionOptions,
				getCurrentPatientId: options.getCurrentPatientId,
				getContextToken: options.getContextToken,
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
		uploadAttachmentForCurrentPatient,
		loadAttachmentsForCurrentPatient,
		uploadFileToPatient,
		uploadDraftDocumentsForPatient,
		createDocumentSectionAdapter,
		createExaminationDocumentSectionAdapter
	};
})(window);
