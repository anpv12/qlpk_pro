import { ReceptionistDocumentAttachmentControls } from './document-attachment-controls.js';

function getWindow(options) {
	return options && options.window ? options.window : window;
}

function getDocument(options) {
	return options && options.document ? options.document : document;
}

function getURL(options) {
	return options && options.URL ? options.URL : window.URL;
}

function getFetch(options) {
	return options && options.fetch ? options.fetch : window.fetch.bind(window);
}

function showToast(options, type, message) {
	if (options && typeof options.showToast === 'function') {
		options.showToast(type, message);
	}
}

function getFormData(options) {
	const FormDataCtor = options && options.FormData ? options.FormData : window.FormData;
	return new FormDataCtor();
}

const ALLOWED_FILE_TYPES = [
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/jpeg',
	'image/jpg',
	'image/png'
];

// [kind, MIME substrings, extensions], checked in order.
const FILE_KIND_RULES = [
	['pdf', ['pdf'], ['pdf']],
	['word', ['word', 'document'], ['doc', 'docx']],
	['spreadsheet', ['sheet', 'excel'], ['xls', 'xlsx']],
	['image', ['image'], ['jpg', 'jpeg', 'png', 'gif', 'webp']],
	['text', ['text'], ['txt']]
];

function getFileKind(fileType, filename) {
	const type = String(fileType || '').toLowerCase();
	const ext = String(filename || '').split('.').pop().toLowerCase();
	const rule = FILE_KIND_RULES.find(([, mimeParts, extensions]) => mimeParts.some(part => type.includes(part)) || extensions.includes(ext));
	return rule ? rule[0] : 'file';
}

function getFileIcon(fileType, filename) {
	const kind = getFileKind(fileType, filename);
	if (window.QLPKIconSystem && typeof window.QLPKIconSystem.getFileIcon === 'function') {
		return window.QLPKIconSystem.getFileIcon(kind);
	}
	const iconMap = {
		pdf: 'bi-file-earmark-pdf-fill',
		word: 'bi-file-earmark-word-fill',
		spreadsheet: 'bi-file-earmark-excel-fill',
		image: 'bi-file-earmark-image-fill',
		text: 'bi-file-earmark-text-fill',
		file: 'bi-file-earmark-fill'
	};
	return iconMap[kind] || iconMap.file;
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getAttachmentUrl(attachmentId, mode = 'download') {
	if (mode === 'preview') {
		return `/attachments/${attachmentId}/preview`;
	}
	return `/attachments/${attachmentId}/download`;
}

function validateFile(file, options = {}) {
	const maxSizeBytes = options.maxSizeBytes || 50 * 1024 * 1024;
	const maxSizeMb = options.maxSizeMb || 50;

	if (file.size > maxSizeBytes) {
		showToast(options, 'error', `File ${file.name} quá lớn. Kích thước tối đa ${maxSizeMb}MB.`);
		return false;
	}

	if (!ALLOWED_FILE_TYPES.includes(file.type)) {
		showToast(options, 'error', `File ${file.name} không được hỗ trợ. Chỉ chấp nhận PDF, DOC, DOCX, JPG, PNG.`);
		return false;
	}

	return true;
}

async function readUploadedAttachment(response) {
	try {
		return await response.json();
	} catch (error) {
		if (String(error?.code || '').startsWith('session.')) throw error;
		return null;
	}
}

async function completeUpload(uploadedAttachment, options, flags) {
	if (!flags.isDraft && uploadedAttachment && typeof options.onUploadSuccess === 'function') {
		options.onUploadSuccess(uploadedAttachment);
	}
	if (flags.shouldShowToast) showToast(options, 'success', 'Tải lên tài liệu thành công');
	if (!flags.isDraft && !uploadedAttachment && typeof options.reloadAttachments === 'function') {
		await options.reloadAttachments();
	}
	return uploadedAttachment || true;
}

function showUploadFailure(response, options, shouldShowToast) {
	if (!shouldShowToast) return;
	const message = response.status === 413
		? `Tệp quá lớn. Vui lòng chọn tệp không quá ${options.maxSizeMb || 50} MB.`
		: 'Không thể tải tài liệu lên. Vui lòng thử lại.';
	showToast(options, 'error', message);
}

async function uploadFile(file, patientId, options = {}) {
	const isCurrentContext = () => options.isCurrentContext?.() !== false;
	if (!isCurrentContext()) return false;
	const flags = { isDraft: Boolean(options.isDraft), shouldShowToast: options.shouldShowToast !== false };

	if (!validateFile(file, options)) {
		return false;
	}

	try {
		const form = getFormData(options);
		form.append('file', file);
		const response = await getFetch(options)(`/attachments/patients/${patientId}/attachments`, {
			method: 'POST',
			body: form
		});
		if (!isCurrentContext()) return false;
		if (response.ok) {
			const uploadedAttachment = await readUploadedAttachment(response);
			if (!isCurrentContext()) return false;
			return completeUpload(uploadedAttachment, options, flags);
		}
		showUploadFailure(response, options, flags.shouldShowToast);
		return false;
	} catch (e) {
		if (isCurrentContext() && flags.shouldShowToast) {
			showToast(options, 'error', 'Không thể tải tài liệu lên. Vui lòng thử lại.');
		}
		return false;
	}
}

async function openAttachmentPreviewInNewTab(attachmentId, filename, options = {}) {
	const isCurrentContext = () => options.isCurrentContext?.() !== false;
	if (!isCurrentContext()) return;
	const ext = ((filename || '').split('.').pop() || '').toLowerCase();
	if (ext === 'doc' || ext === 'docx') {
		await downloadAttachmentWithAuth(attachmentId, filename, options);
		return;
	}

	try {
		const response = await getFetch(options)(getAttachmentUrl(attachmentId, 'preview'), {
			method: 'GET'
		});
		if (!isCurrentContext()) return;
		if (!response.ok) {
			if (response.status === 401) {
				showToast(options, 'error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
				return;
			}
			if (response.status === 422) {
				await downloadAttachmentWithAuth(attachmentId, filename, options);
				return;
			}
			showToast(options, 'error', 'Không thể mở preview tài liệu.');
			return;
		}

		const blob = await response.blob();
		if (!isCurrentContext()) return;
		const urlApi = getURL(options);
		const url = urlApi.createObjectURL(blob);
		const tab = getWindow(options).open(url, '_blank');
		if (!tab) {
			showToast(options, 'warning', 'Trình duyệt đang chặn popup. Hãy cho phép mở tab mới.');
		}
		getWindow(options).setTimeout(() => urlApi.revokeObjectURL(url), 30000);
	} catch (error) {
		if (!isCurrentContext()) return;
		console.error('openAttachmentPreviewInNewTab error:', error);
		showToast(options, 'error', 'Lỗi khi mở preview tài liệu.');
	}
}

async function downloadAttachmentWithAuth(attachmentId, filename, options = {}) {
	const isCurrentContext = () => options.isCurrentContext?.() !== false;
	if (!isCurrentContext()) return;
	try {
		const response = await getFetch(options)(getAttachmentUrl(attachmentId, 'download'), {
			method: 'GET'
		});
		if (!isCurrentContext()) return;

		if (!response.ok) {
			if (response.status === 401) {
				showToast(options, 'error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
			} else {
				showToast(options, 'error', 'Không thể tải tài liệu.');
			}
			return;
		}

		const blob = await response.blob();
		if (!isCurrentContext()) return;
		const doc = getDocument(options);
		const urlApi = getURL(options);
		const objectUrl = urlApi.createObjectURL(blob);
		const a = doc.createElement('a');
		a.href = objectUrl;
		a.download = filename || `attachment-${attachmentId}`;
		doc.body.appendChild(a);
		a.click();
		a.remove();
		urlApi.revokeObjectURL(objectUrl);
	} catch (error) {
		if (!isCurrentContext()) return;
		console.error('downloadAttachmentWithAuth error:', error);
		showToast(options, 'error', 'Lỗi khi tải tài liệu.');
	}
}

function downloadDraftDocument(docId, options = {}) {
	const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
	const docItem = documents.find(item => String(item.id) === String(docId));
	if (!docItem) return;

	const doc = getDocument(options);
	const urlApi = getURL(options);
	const url = urlApi.createObjectURL(docItem.file);
	const a = doc.createElement('a');
	a.href = url;
	a.download = docItem.name;
	doc.body.appendChild(a);
	a.click();
	doc.body.removeChild(a);
	urlApi.revokeObjectURL(url);
}

async function deleteDraftDocument(docId, options = {}) {
	const getDocuments = () => options.getUploadedDocuments?.() || [];
	const target = getDocuments().find(item => String(item.id) === String(docId));
	const isCurrentContext = ReceptionistDocumentAttachmentControls.createContextGuard(options);
	if (!target || !isCurrentContext()) return false;
	const showConfirmationDialog = options.showConfirmationDialog || options.confirmDelete;
	if (typeof showConfirmationDialog !== 'function') return false;
	const confirmed = await showConfirmationDialog({
		title: 'Xóa tài liệu',
		text: 'Bạn có chắc chắn muốn xóa tài liệu này?',
		confirmText: 'Xóa',
		cancelText: 'Hủy',
		variant: 'danger',
		showToast: options.showToast
	});
	if (!confirmed || !isCurrentContext() || !getDocuments().includes(target)) return false;

	const documents = typeof options.getUploadedDocuments === 'function' ? options.getUploadedDocuments() : [];
	if (typeof options.setUploadedDocuments === 'function') {
		options.setUploadedDocuments(documents.filter(item => item !== target));
	}
	if (typeof options.renderDocumentsList === 'function') {
		options.renderDocumentsList();
	}
	showToast(options, 'success', 'Đã xóa tài liệu');
	return true;
}

export const ReceptionistDocumentAttachmentUtils = {
	getFileKind,
	getFileIcon,
	formatFileSize,
	getAttachmentUrl,
	validateFile,
	uploadFile,
	openAttachmentPreviewInNewTab,
	downloadAttachmentWithAuth,
	downloadDraftDocument,
	deleteDraftDocument
};
