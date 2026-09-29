/* exported deleteItem, editItem */
let currentData = [];
let currentPage = 1;
let pageSize = 10;
let listPagination;
let listRevision = 0;
let totalItems = 0;
const escapeHtml = window.QLPKSharedUtils.escapeHtml;

function downloadProtectedFile(url, filename) {
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(response.status);
            return response.blob();
        })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        })
        .catch(() => showToast('Có lỗi xảy ra khi tải file mẫu', 'danger'));
}

$(document).ready(function() {
    listPagination = window.QLPKPagination.create({ onChange(page, size) {
        currentPage = page;
        pageSize = size;
        loadData();
    } });
    loadData();

    // Search input debounce
    let searchTimeout;
    $('#ai-search').on('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 500);
    });

    // Pagination
    // Add button
    $('#btn-add-ingredient').on('click', function() {
        $('#ai-form')[0].reset();
        $('#ai-id').val('');
        $('#ai-modal-title').html('<i class="bi bi-capsule"></i> Thêm hoạt chất mới');
        const modal = new bootstrap.Modal(document.getElementById('aiModal'));
        modal.show();
    });

    // Form submit
    $('#ai-form').on('submit', function(e) {
        e.preventDefault();
        saveIngredient();
    });

    // Template download
    $('#btn-download-template').on('click', function() {
        downloadProtectedFile('/api/active-ingredient/template', 'mau_import_hoat_chat.xlsx');
    });

    // Import Excel
    $('#btn-import-excel').on('click', function() {
        $('#ai-import-file').click();
    });

    $('#ai-import-file').on('change', function(e) {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        showToast('Đang xử lý file...', 'success');
        
        $.ajax({
            url: '/api/active-ingredient/import',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(res) {
                if(res.success) {
                    showToast('Đã nhập dữ liệu hoạt chất.', 'success');
                    loadData();
                } else {
                    showToast('Không thể nhập dữ liệu hoạt chất. Vui lòng kiểm tra tệp và thử lại.', 'danger');
                }
                // Reset file input
                $('#ai-import-file').val('');
            },
            error: function() {
                const msg = 'Không thể nhập dữ liệu hoạt chất. Vui lòng kiểm tra tệp và thử lại.';
                showToast(msg, 'danger');
                $('#ai-import-file').val('');
            }
        });
    });

    if (window.QLPKRealtimePageHooks) {
        window.QLPKRealtimePageHooks.register({
            types: ['inventory.changed'],
            debounceMs: 500,
            handler: function (event) {
                const entity = event && event.payload ? event.payload.entity : null;
                if (!entity || entity === 'active_ingredient') {
                    loadData();
                }
            }
        });
    }
});

function loadData() {
    const revision = ++listRevision;
    const search = $('#ai-search').val().trim();
    
    $.ajax({
        url: `/api/active-ingredient?search=${encodeURIComponent(search)}&page=${currentPage}&limit=${pageSize}`,
        method: 'GET',
        success: function(res) {
            if (revision !== listRevision) return;
            if(res.success) {
                currentData = res.data;
                totalItems = res.total;
                const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
                if (currentPage > lastPage) { currentPage = lastPage; loadData(); return; }
                $('#stat-total').text(res.total);
                renderTable(currentData);
                renderPagination();
            }
        },
        error: function() {
            showToast('Lỗi khi tải dữ liệu', 'danger');
        }
    });
}

function renderTable(data) {
    const tbody = $('#ai-table-body');
    tbody.empty();

    if(data.length === 0) {
        tbody.append('<tr><td colspan="4" class="text-center text-muted py-4">Không có dữ liệu</td></tr>');
        return;
    }

    data.forEach((item, index) => {
        const stt = (currentPage - 1) * pageSize + index + 1;
        const tr = `
            <tr>
                <td>${stt}</td>
                <td class="catalog-dict-name-cell">${escapeHtml(item.ten_hoat_chat)}</td>
                <td class="text-muted catalog-dict-desc-cell">${item.mo_ta ? escapeHtml(item.mo_ta) : ''}</td>
                <td class="catalog-dict-action-cell">
                    <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm text-primary p-1" data-qlpk-call="editItem" data-qlpk-args='[${item.id}]' title="Sửa"><i class="bi bi-pencil-square"></i></button>
                    <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm text-danger p-1" data-qlpk-call="deleteItem" data-qlpk-args='[${item.id}]' title="Xóa"><i class="bi bi-trash3"></i></button>
                </td>
            </tr>
        `;
        tbody.append(tr);
    });
}

function renderPagination() {
    listPagination.update({ page: currentPage, pageSize, total: totalItems });
}

function editItem(id) {
    const item = currentData.find(x => x.id === id);
    if(!item) return;

    $('#ai-id').val(item.id);
    $('#ai-name').val(item.ten_hoat_chat);
    $('#ai-desc').val(item.mo_ta);
    
    $('#ai-modal-title').html('<i class="bi bi-pencil-square"></i> Cập nhật hoạt chất');
    const modal = new bootstrap.Modal(document.getElementById('aiModal'));
    modal.show();
}

function saveIngredient() {
    const id = $('#ai-id').val();
    const payload = {
        ten_hoat_chat: $('#ai-name').val().trim(),
        mo_ta: $('#ai-desc').val().trim()
    };

    if(!payload.ten_hoat_chat) {
        showToast('Tên hoạt chất không được để trống', 'danger');
        return;
    }

    const url = id ? `/api/active-ingredient/${id}` : '/api/active-ingredient';
    const method = id ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function(res) {
            if(res.success) {
                bootstrap.Modal.getInstance(document.getElementById('aiModal')).hide();
                showToast('Lưu thành công', 'success');
                loadData();
            } else {
                showToast('Không thể lưu hoạt chất. Vui lòng kiểm tra lại.', 'danger');
            }
        },
        error: function() {
            const msg = 'Không thể lưu hoạt chất. Vui lòng kiểm tra lại.';
            showToast(msg, 'danger');
        }
    });
}

async function deleteItem(id) {
    if (await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa hoạt chất này?')) {
        $.ajax({
            url: `/api/active-ingredient/${id}`,
            method: 'DELETE',
            success: function(res) {
                if(res.success) {
                    showToast('Đã xóa', 'success');
                    loadData();
                } else {
                    showToast('Không thể xóa hoạt chất. Vui lòng thử lại.', 'danger');
                }
            },
            error: function() {
                showToast('Không thể xóa hoạt chất. Vui lòng thử lại.', 'danger');
            }
        });
    }
}

function showToast(message, type = 'success') {
	return window.QLPKUserFeedback?.show(type, message);
}
