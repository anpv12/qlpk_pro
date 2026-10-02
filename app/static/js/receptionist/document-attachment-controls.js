import { el } from '../shared/dom.js';

const attachmentLoads = new WeakMap();

function getDocument(options) {
	return options && options.document ? options.document : document;
}

function getSessionStorage(options) {
	return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
}

function getCurrentPatientId(options) {
	return typeof options.getCurrentPatientId === 'function' ? options.getCurrentPatientId() : null;
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

// A button's own content while it shows the loading state.
const originalButtonContent = new WeakMap();

function setButtonLoading(button, isLoading, loadingLabel) {
	if (!button) return;

	if (isLoading) {
		if (!originalButtonContent.has(button)) {
			originalButtonContent.set(button, [...button.childNodes]);
		}
		button.classList.add('is-loading');
		button.disabled = true;
		button.setAttribute('aria-busy', 'true');
		const spinner = document.createElement('span');
		spinner.className = 'qlpk-button-spinner';
		spinner.setAttribute('aria-hidden', 'true');
		const label = document.createElement('span');
		label.textContent = loadingLabel || 'Đang tải...';
		button.replaceChildren(spinner, label);
		return;
	}

	button.classList.remove('is-loading');
	button.disabled = false;
	button.removeAttribute('aria-busy');
	if (originalButtonContent.has(button)) {
		button.replaceChildren(...originalButtonContent.get(button));
		originalButtonContent.delete(button);
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
	} catch (e) { /* sessionStorage không khả dụng: bỏ qua */ }
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

function restoreAttachmentDrafts(options) {
	if (getUploadedDocuments(options).length) return;
	try {
		const raw = getSessionStorage(options).getItem(options.documentDraftKey);
		const metadata = raw ? JSON.parse(raw) : [];
		if (Array.isArray(metadata)) setUploadedDocuments(options, metadata.map(item => ({ ...item })));
	} catch (error) {
		console.warn('[Attachments] draft cache unavailable', error);
	}
}

function attachmentContextGuard(options, loadOwner, requestToken, patientId) {
	const contextToken = options.getContextToken?.();
	return () => attachmentLoads.get(loadOwner) === requestToken
		&& patientId === getCurrentPatientId(options) && contextToken === options.getContextToken?.();
}

async function loadAttachmentsForCurrentPatient(options = {}) {
	const doc = getDocument(options);
	const list = doc.getElementById('documentsList');
	const patientId = getCurrentPatientId(options);
	const loadOwner = list || doc;
	const requestToken = {};
	attachmentLoads.set(loadOwner, requestToken);
	const isCurrentContext = attachmentContextGuard(options, loadOwner, requestToken, patientId);
	setAttachments(options, []);
	options.renderDocumentsList?.();

	if (!patientId) {
		restoreAttachmentDrafts(options);
		options.renderDocumentsList?.();
		return;
	}

	try {
		const res = await options.apiCall(`/attachments/patients/${patientId}/attachments`);
		if (!isCurrentContext()) return false;
		if (!res.ok) {
			showAttachmentListError(list, 'Không tải được danh sách tài liệu.');
			return undefined;
		}
		const data = await res.json();
		if (!isCurrentContext()) return false;
		setAttachments(options, Array.isArray(data) ? data : (data.attachments || []));
		options.renderDocumentsList?.();
	} catch (e) {
		if (!isCurrentContext()) return false;
		showAttachmentListError(list, 'Lỗi khi tải danh sách tài liệu.');
	}
	return undefined;
}

function showAttachmentListError(list, message) {
	if (list) list.replaceChildren(el('div', { class: 'text-danger py-3' }, message));
}

function createContextGuard(options = {}) {
	const patientId = getCurrentPatientId(options);
	const contextToken = options.getContextToken?.();
	return () => getCurrentPatientId(options) === patientId
		&& options.getContextToken?.() === contextToken
		&& options.isCurrentContext?.() !== false;
}

async function uploadAttachmentForCurrentPatient(file, options = {}) {
	const isCurrentContext = createContextGuard(options);
	if (!isCurrentContext()) return false;
	const patientId = getCurrentPatientId(options);
	if (!patientId) {
		showToast(options, 'error', 'Vui lòng chọn bệnh nhân trước khi tải tệp');
		return;
	}
	if (typeof options.uploadFile === 'function') {
		return options.uploadFile(file, patientId, { isDraft: false, showToast: true, isCurrentContext });
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
			const isCurrentContext = createContextGuard(options);
			setButtonLoading(uploadBtn, true, hasPatient ? 'Đang tải...' : 'Đang thêm...');
			try {
				if (hasPatient) {
					for (const f of files) {
						if (!isCurrentContext()) break;
						await uploadAttachmentForCurrentPatient(f, { ...options, isCurrentContext });
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

export const ReceptionistDocumentAttachmentControls = {
	createContextGuard,
	updateAttachmentSizeHint,
	loadAttachmentConfig,
	initializeDocumentUpload,
	handleFileUpload,
	loadAttachmentsForCurrentPatient,
	uploadAttachmentForCurrentPatient
};
