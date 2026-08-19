(function (window, document) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function getSessionStorage(options) {
		return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
	}

	function getCurrentPatientId(options) {
		return typeof options.getCurrentPatientId === 'function' ? options.getCurrentPatientId() : window.currentPatientId;
	}

	function getUploadedDocuments(options) {
		return typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
	}

	function setUploadedDocuments(options, value) {
		if (typeof options.setUploadedDocuments === 'function') {
			options.setUploadedDocuments(value);
		}
	}

	function setAttachments(options, value) {
		if (typeof options.setAttachments === 'function') {
			options.setAttachments(value);
		}
	}

	function showToast(options, type, message) {
		if (options && typeof options.showToast === 'function') {
			options.showToast(type, message);
		}
	}

	function setButtonLoading(button, isLoading, loadingLabel) {
		if (!button) return;

		if (isLoading) {
			if (!button.dataset.originalHtml) {
				button.dataset.originalHtml = button.innerHTML;
			}
			button.classList.add('is-loading');
			button.disabled = true;
			button.setAttribute('aria-busy', 'true');
			button.innerHTML = '<span class="qlpk-button-spinner" aria-hidden="true"></span><span>' + (loadingLabel || 'Đang tải...') + '</span>';
			return;
		}

		button.classList.remove('is-loading');
		button.disabled = false;
		button.removeAttribute('aria-busy');
		if (button.dataset.originalHtml) {
			button.innerHTML = button.dataset.originalHtml;
			delete button.dataset.originalHtml;
		}
	}

	function getAttachmentMaxSizeMb(options) {
		return typeof options.getAttachmentMaxSizeMb === 'function' ? options.getAttachmentMaxSizeMb() : 50;
	}

	function updateAttachmentSizeHint(options = {}) {
		const doc = getDocument(options);
		const hintEl = doc.getElementById('attachmentSizeHint');
		if (hintEl) {
			hintEl.textContent = `Hỗ trợ: PDF, DOC, DOCX, JPG, PNG (Tối đa ${getAttachmentMaxSizeMb(options)}MB)`;
		}
	}

	async function loadAttachmentConfig(options = {}) {
		try {
			const res = await options.apiCall('/attachments/config');
			if (!res.ok) return;
			const data = await res.json();
			const maxMb = Number(data?.attachment_max_size_mb || 50);
			const maxBytes = Number(data?.attachment_max_size_bytes || (maxMb * 1024 * 1024));
			if (maxMb > 0 && typeof options.setAttachmentMaxSizeMb === 'function') {
				options.setAttachmentMaxSizeMb(maxMb);
			}
			if (maxBytes > 0 && typeof options.setAttachmentMaxSizeBytes === 'function') {
				options.setAttachmentMaxSizeBytes(maxBytes);
			}
		} catch (e) {
			// Keep default values.
		} finally {
			updateAttachmentSizeHint(options);
		}
	}

	function persistDraftDocuments(options) {
		try {
			getSessionStorage(options).setItem(options.documentDraftKey, JSON.stringify(getUploadedDocuments(options).map(d => ({
				id: d.id,
				name: d.name,
				size: d.size,
				type: d.type,
				uploadDate: d.uploadDate
			}))));
		} catch (e) { }
	}

	function handleFileUpload(files, options = {}) {
		Array.from(files || []).forEach(file => {
			if (typeof options.validateFile === 'function' && !options.validateFile(file)) {
				return;
			}

			const documentId = Date.now() + Math.random();
			const documentItem = {
				id: documentId,
				name: file.name,
				size: file.size,
				type: file.type,
				file: file,
				uploadDate: new Date()
			};

			const uploadedDocuments = getUploadedDocuments(options);
			const dup = uploadedDocuments.some(d => d.name === documentItem.name && d.size === documentItem.size);
			if (dup) {
				showToast(options, 'info', `File ${file.name} đã có trong danh sách.`);
				return;
			}

			uploadedDocuments.push(documentItem);
			setUploadedDocuments(options, uploadedDocuments);
			if (typeof options.renderDocumentsList === 'function') {
				options.renderDocumentsList();
			}
			showToast(options, 'success', `Đã thêm file ${file.name}`);
		});

		const doc = getDocument(options);
		const fileInput = doc.getElementById('documentFileInput');
		if (fileInput) fileInput.value = '';
	}

	async function loadAttachmentsForCurrentPatient(options = {}) {
		const doc = getDocument(options);
		const list = doc.getElementById('documentsList');
		const patientId = getCurrentPatientId(options);

		if (!patientId) {
			try {
				const raw = getSessionStorage(options).getItem(options.documentDraftKey);
				if (raw) {
					const meta = JSON.parse(raw) || [];
					setUploadedDocuments(options, meta.map(m => ({ ...m })));
				}
			} catch (e) { }
			setAttachments(options, []);
			if (typeof options.renderDocumentsList === 'function') {
				options.renderDocumentsList();
			}
			return;
		}

		try {
			const res = await options.apiCall(`/attachments/patients/${patientId}/attachments`);
			if (res.ok) {
				const data = await res.json();
				if (Number(getCurrentPatientId(options)) !== Number(patientId)) {
					return;
				}
				setAttachments(options, Array.isArray(data) ? data : (data.attachments || []));
				if (typeof options.renderDocumentsList === 'function') {
					options.renderDocumentsList();
				}
			} else {
				if (list) list.innerHTML = '<div class="text-danger py-3">Không tải được danh sách tài liệu.</div>';
			}
		} catch (e) {
			if (list) list.innerHTML = '<div class="text-danger py-3">Lỗi khi tải danh sách tài liệu.</div>';
		}
	}

	async function uploadAttachmentForCurrentPatient(file, options = {}) {
		const patientId = getCurrentPatientId(options);
		if (!patientId) {
			showToast(options, 'error', 'Vui lòng chọn bệnh nhân trước khi tải tệp');
			return;
		}
		if (typeof options.uploadFile === 'function') {
			await options.uploadFile(file, patientId, { isDraft: false, showToast: true });
		}
	}

	async function initializeDocumentUpload(options = {}) {
		if (typeof options.getUploadInitialized === 'function' && options.getUploadInitialized()) return;
		if (typeof options.setUploadInitialized === 'function') {
			options.setUploadInitialized(true);
		}

		await loadAttachmentConfig(options);

		const doc = getDocument(options);
		const uploadBtn = doc.getElementById('uploadDocumentBtn');
		const fileInput = doc.getElementById('documentFileInput');

		if (uploadBtn) {
			uploadBtn.addEventListener('click', function () {
				if (!uploadBtn.disabled && fileInput) {
					fileInput.click();
				}
			});
		}

		if (fileInput) {
			fileInput.addEventListener('change', async function (e) {
				const files = Array.from(e.target.files || []);
				if (!files.length) {
					e.target.value = '';
					return;
				}

				const hasPatient = Boolean(getCurrentPatientId(options));
				setButtonLoading(uploadBtn, true, hasPatient ? 'Đang tải...' : 'Đang thêm...');
				try {
					if (hasPatient) {
						for (const f of files) {
							await uploadAttachmentForCurrentPatient(f, options);
						}
					} else {
						handleFileUpload(files, options);
						persistDraftDocuments(options);
						showToast(options, 'info', `Đã lưu ${files.length} tài liệu vào nháp. Sẽ upload khi lưu bệnh nhân.`);
					}
				} finally {
					setButtonLoading(uploadBtn, false);
					e.target.value = '';
				}
			});
		}
	}

	window.ReceptionistDocumentAttachmentControls = {
		updateAttachmentSizeHint,
		loadAttachmentConfig,
		initializeDocumentUpload,
		handleFileUpload,
		loadAttachmentsForCurrentPatient,
		uploadAttachmentForCurrentPatient
	};
})(window, document);
