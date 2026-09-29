$(document).ready(function() {
    window.QLPKApiTransport.installJQuery($);
    let currentFolderId = null;
    let isUserAdmin = false;
    $('.admin-only-btn, .admin-only-col').addClass('doc-admin-hidden');
    window.QLPKApiTransport.currentUser().then(user => {
        isUserAdmin = user.role === 'admin';
        $('.admin-only-btn, .admin-only-col').toggleClass('doc-admin-hidden', !isUserAdmin);
    });

    // --- UTILS ---
    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function getFileIcon(mimeType, type) {
        if (type === 'link') {
            return '<i class="bi bi-link-45deg file-icon icon-link"></i>';
        }
        if (mimeType.includes('pdf')) {
            return '<i class="bi bi-file-earmark-pdf-fill file-icon icon-pdf"></i>';
        } else if (mimeType.includes('word') || mimeType.includes('document')) {
            return '<i class="bi bi-file-earmark-word-fill file-icon icon-word"></i>';
        } else if (mimeType.includes('excel') || mimeType.includes('sheet')) {
            return '<i class="bi bi-file-earmark-excel-fill file-icon icon-excel"></i>';
        } else if (mimeType.includes('image')) {
            return '<i class="bi bi-file-earmark-image-fill file-icon icon-img"></i>';
        } else {
            return '<i class="bi bi-file-earmark-fill file-icon icon-default"></i>';
        }
    }

    function openDocModal(selector) {
        $(selector).addClass('doc-modal-open');
    }

    function closeDocModal(selector) {
        $(selector).removeClass('doc-modal-open');
    }
    window.closeDocModal = closeDocModal;

    // --- FOLDER TREE ---
    function loadFolderTree() {
        $.ajax({
            url: '/api/document-folders',
            method: 'GET',
            success: function(data) {
                renderFolderTree(data);
            },
            error: function(err) {
                console.error("Error loading folders", err);
                showAlert('Lỗi', 'Không thể tải cấu trúc thư mục', 'error');
            }
        });
    }

    function renderFolderTree(folders) {
        const $tree = $('#folderTree');
        $tree.empty();
        
        folders.forEach(folder => {
            $tree.append(createTreeNode(folder));
        });

        // Re-attach click events
        bindTreeEvents();
    }

    function createTreeNode(folder) {
        const hasChildren = folder.children && folder.children.length > 0;
        const toggleIconClass = hasChildren ? '' : 'tree-icon-toggle-placeholder';
        
        let html = `
            <li class="tree-item" data-id="${folder.id}">
                <div class="tree-node ${folder.id === currentFolderId ? 'active expanded' : ''}">
                    <i class="bi bi-chevron-right tree-icon-toggle ${toggleIconClass}"></i>
                    <i class="bi bi-folder-fill tree-icon-folder"></i>
                    <span class="folder-name">${folder.name}</span>
        `;
        
        if (isUserAdmin) {
            html += `
                    <div class="tree-actions">
                        <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="tree-action-btn add-subfolder" title="Thêm mục con" data-id="${folder.id}"><i class="bi bi-plus"></i></button>
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="tree-action-btn edit-folder" title="Sửa tên" data-id="${folder.id}" data-name="${folder.name}"><i class="bi bi-pencil"></i></button>
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="tree-action-btn delete-folder text-danger border-danger" title="Xóa" data-id="${folder.id}"><i class="bi bi-trash"></i></button>
                    </div>
            `;
        }
        
        html += `</div>`;
        
        if (hasChildren) {
            html += `<ul class="tree-list ${folder.id === currentFolderId || hasActiveChild(folder, currentFolderId) ? 'expanded' : ''}">`;
            folder.children.forEach(child => {
                html += createTreeNode(child);
            });
            html += `</ul>`;
        }
        
        html += `</li>`;
        return html;
    }

    function hasActiveChild(folder, activeId) {
        if (!folder.children) return false;
        return folder.children.some(child => child.id === activeId || hasActiveChild(child, activeId));
    }

    function bindTreeEvents() {
        // Toggle collapse/expand and select folder
        $('.tree-node').off('click').on('click', function(e) {
            if ($(e.target).closest('.tree-actions').length > 0) return;
            
            const $li = $(this).closest('.tree-item');
            const folderId = $li.data('id');
            const folderName = $(this).find('.folder-name').text();
            
            // Toggle
            $(this).toggleClass('expanded');
            const $childList = $(this).siblings('.tree-list');
            if ($childList.length) {
                $childList.toggleClass('expanded');
            }
            
            // Select
            $('.tree-node').removeClass('active');
            $(this).addClass('active');
            
            selectFolder(folderId, folderName);
        });

        // Add subfolder
        $('.add-subfolder').off('click').on('click', function(e) {
            e.stopPropagation();
            const parentId = $(this).data('id');
            $('#parentFolderId').val(parentId);
            $('#folderId').val('');
            $('#folderName').val('');
            $('#folderModalTitle').html('<i class="bi bi-folder-plus me-2"></i>Thêm Thư Mục Con');
            openDocModal('#folderModal');
        });

        // Edit folder
        $('.edit-folder').off('click').on('click', function(e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const name = $(this).data('name');
            $('#parentFolderId').val('');
            $('#folderId').val(id);
            $('#folderName').val(name);
            $('#folderModalTitle').html('<i class="bi bi-pencil me-2"></i>Đổi Tên Thư Mục');
            openDocModal('#folderModal');
        });

        // Delete folder
        $('.delete-folder').off('click').on('click', async function(e) {
            e.stopPropagation();
            const id = $(this).data('id');
            if (await window.QLPKConfirmationDialog.confirmDelete("Bạn có chắc chắn muốn xóa thư mục này? Thư mục phải trống (không có file hay thư mục con) mới có thể xóa.")) {
                $.ajax({
                    url: `/api/document-folders/${id}`,
                    method: 'DELETE',
                    success: function() {
                        if (currentFolderId === id) {
                            currentFolderId = null;
                            $('#folderBreadcrumb').html('<span>Chưa chọn thư mục</span>');
                            $('#documentTableBody').html('<tr><td colspan="4" class="text-center doc-empty-cell">Vui lòng chọn thư mục</td></tr>');
                        }
                        loadFolderTree();
                    },
                    error: function() {
                        const msg = 'Không thể xóa thư mục. Vui lòng thử lại.';
                        showAlert('Lỗi', msg, 'error');
                    }
                });
            }
        });
    }

    // --- DOCUMENTS ---
    function selectFolder(folderId, folderName) {
        currentFolderId = folderId;
        $('#folderBreadcrumb').html(`<span>${folderName}</span>`);
        loadDocuments(folderId);
    }

    function loadDocuments(folderId) {
        $.ajax({
            url: `/api/documents?folder_id=${folderId}`,
            method: 'GET',
            success: function(data) {
                renderDocuments(data);
            },
            error: function(err) {
                console.error("Error loading documents", err);
                showAlert('Lỗi', 'Không thể tải danh sách tài liệu', 'error');
            }
        });
    }

    function renderDocuments(docs) {
        const $tbody = $('#documentTableBody');
        $tbody.empty();
        
        if (docs.length === 0) {
            $tbody.html(`<tr><td colspan="${isUserAdmin ? 4 : 3}" class="text-center doc-empty-cell">Chưa có tài liệu nào trong thư mục này</td></tr>`);
            return;
        }

        docs.forEach(doc => {
            let badge = '';
            if (doc.type === 'link') {
                badge = `<span class="badge doc-link-badge">Link liên kết</span>`;
            } else {
                badge = formatBytes(doc.size_bytes);
            }

            const link_target = doc.type === 'link' ? `href="${doc.url}" target="_blank"` : `href="${doc.url}" target="_blank"`;

            let html = `
                <tr>
                    <td>
                        ${getFileIcon(doc.mime_type, doc.type)}
                        <a ${link_target} class="doc-file-link">${doc.name}</a>
                    </td>
                    <td>${badge}</td>
                    <td class="doc-muted-cell">${doc.updated_at}</td>
            `;

            if (isUserAdmin) {
                html += `
                    <td class="text-center">
                        <div class="d-flex justify-content-center gap-2">
                            <a ${link_target} class="action-icon" title="Truy cập/Tải xuống"><i class="bi ${doc.type === 'link' ? 'bi-box-arrow-up-right' : 'bi-download'}"></i></a>
                            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="action-icon action-icon-danger delete-doc" data-id="${doc.id}" title="Xóa"><i class="bi bi-trash"></i></button>
                        </div>
                    </td>
                `;
            }
            
            html += `</tr>`;
            $tbody.append(html);
        });

        // Bind delete document event
        $('.delete-doc').on('click', async function() {
            const id = $(this).data('id');
            if (await window.QLPKConfirmationDialog.confirmDelete("Bạn có chắc chắn muốn xóa tài liệu này? Hành động này sẽ xóa cả file trên Google Drive.")) {
                $(this).html('<i class="spinner-border spinner-border-sm"></i>');
                $.ajax({
                    url: `/api/documents/${id}`,
                    method: 'DELETE',
                    success: function() {
                        loadDocuments(currentFolderId);
                    },
                    error: function() {
                        const msg = 'Không thể xóa tài liệu. Vui lòng thử lại.';
                        showAlert('Lỗi', msg, 'error');
                        loadDocuments(currentFolderId);
                    }
                });
            }
        });
    }

    // --- EVENT LISTENERS ---

    // Create Root Folder
    $('#btnCreateFolder').on('click', function() {
        $('#parentFolderId').val('');
        $('#folderId').val('');
        $('#folderName').val('');
        $('#folderModalTitle').html('<i class="bi bi-folder-plus me-2"></i>Thêm Thư Mục Gốc');
        openDocModal('#folderModal');
    });

    // Save Folder Form
    $('#btnSaveFolder').on('click', function() {
        const id = $('#folderId').val();
        const parentId = $('#parentFolderId').val();
        const name = $('#folderName').val().trim();
        
        if (!name) {
            showAlert('Lỗi', 'Vui lòng nhập tên thư mục', 'warning');
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
                closeDocModal('#folderModal');
                loadFolderTree();
            },
            error: function() {
                const msg = 'Không thể lưu thư mục. Vui lòng kiểm tra lại.';
                showAlert('Lỗi', msg, 'error');
            },
            complete: () => {
                $('#btnSaveFolder').html('Lưu thư mục').prop('disabled', false);
            }
        });
    });

    // Add Link
    $('#btnAddLink').on('click', function() {
        if (!currentFolderId) {
            showAlert('Lỗi', 'Vui lòng chọn một thư mục trước', 'warning');
            return;
        }
        $('#linkId').val('');
        $('#linkName').val('');
        $('#linkUrl').val('');
        openDocModal('#linkModal');
    });

    // Save Link Form
    $('#btnSaveLink').on('click', function() {
        const name = $('#linkName').val().trim();
        const url = $('#linkUrl').val().trim();
        
        if (!name || !url) {
            showAlert('Lỗi', 'Vui lòng nhập đầy đủ tên và đường dẫn', 'warning');
            return;
        }

        $(this).html('<i class="spinner-border spinner-border-sm"></i> Đang lưu...');
        $(this).prop('disabled', true);

        $.ajax({
            url: '/api/documents/link',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                folder_id: currentFolderId,
                name: name,
                url: url
            }),
            success: function() {
                closeDocModal('#linkModal');
                loadDocuments(currentFolderId);
            },
            error: function() {
                const msg = 'Không thể lưu liên kết. Vui lòng kiểm tra lại.';
                showAlert('Lỗi', msg, 'error');
            },
            complete: () => {
                $('#btnSaveLink').html('Lưu liên kết').prop('disabled', false);
            }
        });
    });

    // Upload File (Button Click)
    $('#btnUploadFile').on('click', function() {
        if (!currentFolderId) {
            showAlert('Lỗi', 'Vui lòng chọn một thư mục trước khi upload', 'warning');
            return;
        }
        $('#fileInputHidden').click();
    });

    // Handle File Selection
    $('#fileInputHidden').on('change', function() {
        if (this.files && this.files.length > 0) {
            uploadFiles(this.files);
        }
    });

    // Dropzone Drag & Drop Events
    const dropzone = document.getElementById('uploadDropzone');
    
    // Ngăn chặn hành vi mặc định
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        if (dropzone) dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Thêm class khi drag over
    ['dragenter', 'dragover'].forEach(eventName => {
        if (dropzone) dropzone.addEventListener(eventName, () => {
            dropzone.classList.add('bg-light');
            dropzone.classList.add('doc-dropzone-dragover');
        }, false);
    });

    // Xóa class khi drag leave hoặc drop
    ['dragleave', 'drop'].forEach(eventName => {
        if (dropzone) dropzone.addEventListener(eventName, () => {
            dropzone.classList.remove('bg-light');
            dropzone.classList.remove('doc-dropzone-dragover');
        }, false);
    });

    // Xử lý drop
    if (dropzone) {
        dropzone.addEventListener('drop', (e) => {
            if (!currentFolderId) {
                showAlert('Lỗi', 'Vui lòng chọn một thư mục trước khi upload', 'warning');
                return;
            }
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                uploadFiles(files);
            }
        }, false);
    }

    function uploadFiles(files) {
        // Upload từng file một
        Array.from(files).forEach(file => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder_id', currentFolderId);

            // Có thể thêm UI progress bar ở đây
            const $statusRow = $(`
                <tr class="uploading-row">
                    <td>
                        <i class="spinner-border spinner-border-sm me-2 text-primary"></i> 
                        <span class="doc-uploading-name">Đang tải lên: ${file.name}...</span>
                    </td>
                    <td colspan="${isUserAdmin ? 3 : 2}"></td>
                </tr>
            `);
            $('#documentTableBody').prepend($statusRow);

            $.ajax({
                url: '/api/documents/upload',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function() {
                    $statusRow.remove();
                    loadDocuments(currentFolderId);
                },
                error: function() {
                    $statusRow.remove();
                    const msg = 'Không thể tải tệp lên. Vui lòng thử lại.';
                    showAlert('Lỗi', msg, 'error');
                }
            });
        });
        
        // Reset file input
        $('#fileInputHidden').val('');
    }

    if (window.QLPKRealtimePageHooks) {
        window.QLPKRealtimePageHooks.register({
            types: ['document.changed'],
            debounceMs: 500,
            handler: function (event) {
                loadFolderTree();
                const folderId = event && event.payload ? event.payload.folder_id : null;
                if (currentFolderId && (!folderId || Number(folderId) === Number(currentFolderId))) {
                    loadDocuments(currentFolderId);
                }
            }
        });
    }

    // INITIAL LOAD
    loadFolderTree();

    // Thông báo qua hệ thống phản hồi dùng chung.
    function showAlert(title, message, type) {
        window.QLPKUserFeedback?.show(type || 'error', message);
    }
});
