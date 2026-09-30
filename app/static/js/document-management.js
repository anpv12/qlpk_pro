// Parts (nạp trước file này): page-installers.js
(function () {
	const { installDocumentPage1, installDocumentPage2, installDocumentPage3, installDocumentPage4, installDocumentPage5, installDocumentPage6 } = window.QLPKModuleParts["document-management"];

function runDocumentPage1(ctx) {
	window.QLPKApiTransport.installJQuery($);
	ctx.currentFolderId = null;
	ctx.isUserAdmin = false;
	$('.admin-only-btn, .admin-only-col').addClass('doc-admin-hidden');
	window.QLPKApiTransport.currentUser().then(user => {
	    ctx.isUserAdmin = user.role === 'admin';
	    $('.admin-only-btn, .admin-only-col').toggleClass('doc-admin-hidden', !ctx.isUserAdmin);
	});
	window.closeDocModal = ctx.closeDocModal;
	// --- EVENT LISTENERS ---

	// Create Root Folder
	$('#btnCreateFolder').on('click', function() {
	    $('#parentFolderId').val('');
	    $('#folderId').val('');
	    $('#folderName').val('');
	    $('#folderModalTitle').html('<i class="bi bi-folder-plus me-2"></i>Thêm Thư Mục Gốc');
	    ctx.openDocModal('#folderModal');
	});
	// Save Folder Form
	$('#btnSaveFolder').on('click', function() {
	    const id = $('#folderId').val();
	    const parentId = $('#parentFolderId').val();
	    const name = $('#folderName').val().trim();
	    
	    if (!name) {
	        ctx.showAlert('Lỗi', 'Vui lòng nhập tên thư mục', 'warning');
	        return;
	    }

	    const method = id ? 'PUT' : 'POST';
	    const url = id ? `/api/document-folders/${id}` : '/api/document-folders';
	    const payload = { name: name };
	    if (!id && parentId) payload.parent_id = parseInt(parentId);

	    $(this).html('<i class="spinner-border spinner-border-sm"></i> Đang lưu...');
	    $(this).prop('disabled', true);

	    $.ajax({
	        url: url,
	        method: method,
	        contentType: 'application/json',
	        data: JSON.stringify(payload),
	        success: function() {
	            ctx.closeDocModal('#folderModal');
	            ctx.loadFolderTree();
	        },
	        error: function() {
	            const msg = 'Không thể lưu thư mục. Vui lòng kiểm tra lại.';
	            ctx.showAlert('Lỗi', msg, 'error');
	        },
	        complete: () => {
	            $('#btnSaveFolder').html('Lưu thư mục').prop('disabled', false);
	        }
	    });
	});
	// Add Link
	$('#btnAddLink').on('click', function() {
	    if (!ctx.currentFolderId) {
	        ctx.showAlert('Lỗi', 'Vui lòng chọn một thư mục trước', 'warning');
	        return;
	    }
	    $('#linkId').val('');
	    $('#linkName').val('');
	    $('#linkUrl').val('');
	    ctx.openDocModal('#linkModal');
	});
}

function runDocumentPage2(ctx) {
	// Save Link Form
	$('#btnSaveLink').on('click', function() {
	    const name = $('#linkName').val().trim();
	    const url = $('#linkUrl').val().trim();
	    
	    if (!name || !url) {
	        ctx.showAlert('Lỗi', 'Vui lòng nhập đầy đủ tên và đường dẫn', 'warning');
	        return;
	    }

	    $(this).html('<i class="spinner-border spinner-border-sm"></i> Đang lưu...');
	    $(this).prop('disabled', true);

	    $.ajax({
	        url: '/api/documents/link',
	        method: 'POST',
	        contentType: 'application/json',
	        data: JSON.stringify({
	            folder_id: ctx.currentFolderId,
	            name: name,
	            url: url
	        }),
	        success: function() {
	            ctx.closeDocModal('#linkModal');
	            ctx.loadDocuments(ctx.currentFolderId);
	        },
	        error: function() {
	            const msg = 'Không thể lưu liên kết. Vui lòng kiểm tra lại.';
	            ctx.showAlert('Lỗi', msg, 'error');
	        },
	        complete: () => {
	            $('#btnSaveLink').html('Lưu liên kết').prop('disabled', false);
	        }
	    });
	});
	// Upload File (Button Click)
	$('#btnUploadFile').on('click', function() {
	    if (!ctx.currentFolderId) {
	        ctx.showAlert('Lỗi', 'Vui lòng chọn một thư mục trước khi upload', 'warning');
	        return;
	    }
	    $('#fileInputHidden').click();
	});
	// Handle File Selection
	$('#fileInputHidden').on('change', function() {
	    if (this.files && this.files.length > 0) {
	        ctx.uploadFiles(this.files);
	    }
	});
	// Dropzone Drag & Drop Events
	ctx.dropzone = document.getElementById('uploadDropzone');
	// Ngăn chặn hành vi mặc định
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
	    if (ctx.dropzone) ctx.dropzone.addEventListener(eventName, ctx.preventDefaults, false);
	});
	// Thêm class khi drag over
	['dragenter', 'dragover'].forEach(eventName => {
	    if (ctx.dropzone) ctx.dropzone.addEventListener(eventName, () => {
	        ctx.dropzone.classList.add('bg-light');
	        ctx.dropzone.classList.add('doc-dropzone-dragover');
	    }, false);
	});
	// Xóa class khi drag leave hoặc drop
	['dragleave', 'drop'].forEach(eventName => {
	    if (ctx.dropzone) ctx.dropzone.addEventListener(eventName, () => {
	        ctx.dropzone.classList.remove('bg-light');
	        ctx.dropzone.classList.remove('doc-dropzone-dragover');
	    }, false);
	});
}

function runDocumentPage3(ctx) {
	// Xử lý drop
	if (ctx.dropzone) {
	    ctx.dropzone.addEventListener('drop', (e) => {
	        if (!ctx.currentFolderId) {
	            ctx.showAlert('Lỗi', 'Vui lòng chọn một thư mục trước khi upload', 'warning');
	            return;
	        }
	        const dt = e.dataTransfer;
	        const files = dt.files;
	        if (files.length > 0) {
	            ctx.uploadFiles(files);
	        }
	    }, false);
	}
	if (window.QLPKRealtimePageHooks) {
	    window.QLPKRealtimePageHooks.register({
	        types: ['document.changed'],
	        debounceMs: 500,
	        handler: function (event) {
	            ctx.loadFolderTree();
	            const folderId = event && event.payload ? event.payload.folder_id : null;
	            if (ctx.currentFolderId && (!folderId || Number(folderId) === Number(ctx.currentFolderId))) {
	                ctx.loadDocuments(ctx.currentFolderId);
	            }
	        }
	    });
	}
	// INITIAL LOAD
	ctx.loadFolderTree();
}

$(document).ready(function() {
    const ctx = {};
    installDocumentPage1(ctx);
    installDocumentPage2(ctx);
    installDocumentPage3(ctx);
    installDocumentPage4(ctx);
    installDocumentPage5(ctx);
    installDocumentPage6(ctx);
    runDocumentPage1(ctx);
    runDocumentPage2(ctx);
    runDocumentPage3(ctx);
});
})();
