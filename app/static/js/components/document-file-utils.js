const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_SIZE_MB = 10;
const ALLOWED_FILE_TYPES = [
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/jpeg',
	'image/jpg',
	'image/png'
];

function getFileIcon(fileType) {
	if (fileType.includes('pdf')) return 'bi-file-earmark-pdf';
	if (fileType.includes('word') || fileType.includes('document')) return 'bi-file-earmark-word';
	if (fileType.includes('image')) return 'bi-file-earmark-image';
	return 'bi-file-earmark-text';
}

function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function validateFile(file, options = {}) {
	const maxSizeBytes = options.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;
	const maxSizeMb = options.maxSizeMb || DEFAULT_MAX_SIZE_MB;
	const showError = typeof options.showError === 'function' ? options.showError : function () {};

	if (file.size > maxSizeBytes) {
		showError(`File ${file.name} quá lớn. Kích thước tối đa ${maxSizeMb}MB.`);
			return false;
	}

	if (!ALLOWED_FILE_TYPES.includes(file.type)) {
		showError(`File ${file.name} không được hỗ trợ. Chỉ chấp nhận PDF, DOC, DOCX, JPG, PNG.`);
			return false;
	}

	return true;
}

function createDocumentFileAdapter(options = {}) {
	return {
		getFileIcon,
		formatFileSize,
		validateFile(file) {
			return validateFile(file, options);
		}
	};
}

export const ClinicalDocumentFileUtils = {
	getFileIcon,
	formatFileSize,
	validateFile,
	createDocumentFileAdapter
};
