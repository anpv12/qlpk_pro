import { el, replace } from '../shared/dom.js';
import { state } from './order-management-state.js';
import { RESULT_FILE_EXTENSIONS, RESULT_FILE_MAX_BYTES, apiCall, formatDateOnly, showConfirmDialog, showCustomToast } from '../order-management.js';
import { loadOrderDetail } from './order-management-detail.js';

// Render result files
function renderResultFiles(files) {
	const listContainer = document.getElementById('resultFilesListContainer');
	const fileCountBadge = document.getElementById('fileCountBadge');

	if (fileCountBadge) {
		fileCountBadge.textContent = files.length;
	}

	if (!listContainer) return;

	if (files.length === 0) {
		replace(listContainer, el('div', { class: 'om-file-empty' }, 'Chưa có file đính kèm'));
	} else {
		const icons = window.QLPKIconSystem;
		const filesList = files.map(file => {
            const ext = (file.original_filename || file.filename || '').split('.').pop().toUpperCase();
            let badgeClass = 'qlpk-status--neutral';
            if (ext === 'PDF') badgeClass = 'qlpk-status--error';
            if (ext === 'DOC' || ext === 'DOCX') badgeClass = 'bg-primary bg-opacity-25 text-dark';
            if (ext === 'JPG' || ext === 'PNG') badgeClass = 'qlpk-status--success';
            return el('li', { class: 'om-file-row' },
                el('span', { class: 'fw-semibold text-dark om-file-name' }, file.original_filename || file.filename || ''),
                ' ',
                el('div', { class: 'om-file-meta' },
                    el('span', { class: `badge ${badgeClass} border om-file-type-badge` }, ext),
                    ' ',
                    el('span', null, `Ngày tải: ${formatDateOnly(file.created_at)}`),
                    ' ',
                    el('div', { class: 'om-actions' },
                        icons.createActionButton({ action: 'download', label: 'Tải xuống', className: 'result-file-download', attrs: { 'data-file-id': file.id } }),
                        ' ',
                        icons.createActionButton({ action: 'delete', label: 'Xóa file', className: 'result-file-delete', attrs: { 'data-file-id': file.id } })
                    )
                )
            );
        });
        replace(listContainer, el('ul', { class: 'om-file-list', 'aria-label': 'File kết quả đính kèm' }, filesList));
	}

    // Attach event listeners for the static upload area
	const fileInput = document.getElementById('fileInput');
	const selectBtn = document.getElementById('selectFileBtn');
	const uploadArea = document.getElementById('resultFilesUploadArea');

	if (selectBtn && fileInput && !selectBtn._hasListener) {
		selectBtn.addEventListener('click', () => fileInput.click());
		fileInput.addEventListener('change', handleFileSelect);
        selectBtn._hasListener = true;
	}

	// Attach drag & drop handlers
	if (uploadArea && !uploadArea._hasListener) {
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			uploadArea.addEventListener(eventName, preventDefaults, false);
		});
		['dragenter', 'dragover'].forEach(eventName => {
			uploadArea.addEventListener(eventName, highlight, false);
		});
		['dragleave', 'drop'].forEach(eventName => {
			uploadArea.addEventListener(eventName, unhighlight, false);
		});
		uploadArea.addEventListener('drop', handleDrop, false);
		uploadArea.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        uploadArea._hasListener = true;
	}

	// Attach file action listeners
	document.querySelectorAll('.result-file-download').forEach(btn => {
		btn.addEventListener('click', async function () {
			const fileId = this.dataset.fileId;
			await downloadResultFile(state.currentOrderDetail.id, fileId);
		});
	});

	document.querySelectorAll('.result-file-delete').forEach(btn => {
		btn.addEventListener('click', async function () {
			const fileId = this.dataset.fileId;
			await deleteResultFile(state.currentOrderDetail.id, fileId);
		});
	});
}

// Drag & drop helper functions
function preventDefaults(e) {
	e.preventDefault();
	e.stopPropagation();
}

function highlight() {
	const uploadArea = document.getElementById('resultFilesUploadArea');
	if (uploadArea) {
		uploadArea.classList.add('drag-over');
	}
}

function unhighlight() {
	const uploadArea = document.getElementById('resultFilesUploadArea');
	if (uploadArea) {
		uploadArea.classList.remove('drag-over');
	}
}

async function handleDrop(e) {
	const dt = e.dataTransfer;
	const files = dt.files;

	if (files.length === 0) return;

	if (!state.currentOrderDetail || !state.currentOrderDetail.id) {
		showCustomToast('error', 'Vui lòng chọn chỉ định trước');
		return;
	}

	// Process first file only
	const file = files[0];

	if (!validateResultFile(file)) return;

	await uploadResultFile(state.currentOrderDetail.id, file);
}

// Format file size

function validateResultFile(file) {
	const extension = String(file?.name || '').split('.').pop().toLowerCase();
	if (!RESULT_FILE_EXTENSIONS.has(extension)) {
		showCustomToast('error', 'Loại file không được hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX');
		return false;
	}
	if (Number(file?.size || 0) > RESULT_FILE_MAX_BYTES) {
		showCustomToast('error', 'File không được vượt quá 25MB');
		return false;
	}
	return true;
}

// Handle file select
async function handleFileSelect(event) {
	const file = event.target.files[0];
	if (!file) return;

	if (!state.currentOrderDetail || !state.currentOrderDetail.id) {
		showCustomToast('error', 'Vui lòng chọn chỉ định trước');
		return;
	}
	if (!validateResultFile(file)) return;

	await uploadResultFile(state.currentOrderDetail.id, file);
	event.target.value = ''; // Reset input
}

async function refreshResultFiles(orderId) {
	try {
		const refreshResponse = await apiCall(`/api/chi-dinh/${orderId}`);
		if (!refreshResponse.ok) return;
		const order = await refreshResponse.json();
		if (state.currentOrderDetail) {
			state.currentOrderDetail.result_files = order.result_files || [];
		}
		renderResultFiles(order.result_files || []);
	} catch (error) {
		console.error('Error refreshing result files:', error);
	}
}

// Upload result file
async function uploadResultFile(orderId, file) {
	try {
		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch(`/api/chi-dinh/${orderId}/upload-result`, {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi upload file');
		}

		const data = await response.json();
		showCustomToast('success', 'Upload file thành công');

		// Update danh sách file ngay từ response
		if (data.chi_dinh && data.chi_dinh.result_files) {
			// Cập nhật currentOrderDetail
			if (state.currentOrderDetail) {
				state.currentOrderDetail.result_files = data.chi_dinh.result_files;
			}
			// Render lại danh sách file từ dữ liệu mới
			renderResultFiles(data.chi_dinh.result_files);
		} else {
			// Fallback: refresh lại file list từ API nếu response không có đủ dữ liệu
			await refreshResultFiles(orderId);
		}

	} catch (error) {
		console.error('Error uploading file:', error);
		showCustomToast('error', 'Không thể tải tệp lên. Vui lòng thử lại.');
	}
}

// Delete result file
async function deleteResultFile(orderId, fileId) {
	const confirmed = await showConfirmDialog({
		title: 'Xóa file kết quả',
		text: 'Bạn có chắc muốn xóa file này?',
		confirmText: 'Xóa',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall(`/api/chi-dinh/${orderId}/result-files/${fileId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa file');
		}

		showCustomToast('success', 'Xóa file thành công');

		// Update result files list without reloading entire modal
		if (state.currentOrderDetail && state.currentOrderDetail.result_files) {
			state.currentOrderDetail.result_files = state.currentOrderDetail.result_files.filter(f => f.id !== fileId);
			renderResultFiles(state.currentOrderDetail.result_files);
		} else {
			// Fallback: reload order detail if currentOrderDetail is not available
			await loadOrderDetail(orderId);
		}

	} catch (error) {
		console.error('Error deleting file:', error);
		showCustomToast('error', 'Không thể xóa tệp. Vui lòng thử lại.');
	}
}

// Download result file
async function downloadResultFile(orderId, fileId) {
	try {
		const response = await fetch(`/api/chi-dinh/${orderId}/result-files/${fileId}/download`);

		if (!response.ok) {
			throw new Error('Lỗi khi tải file');
		}

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		// Get filename from response headers
		const contentDisposition = response.headers.get('Content-Disposition');
		let filename = 'download';
		if (contentDisposition) {
			const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
			if (filenameMatch) {
				filename = filenameMatch[1];
			}
		}

		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

	} catch (error) {
		console.error('Error downloading file:', error);
		showCustomToast('error', 'Lỗi khi tải file');
	}
}

export { renderResultFiles };
