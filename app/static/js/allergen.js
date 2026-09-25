let currentData = [];
let currentPage = 1;
let pageSize = 10;
let listPagination;
let listRevision = 0;
let totalItems = 0;
const escapeHtml = window.QLPKSharedUtils.escapeHtml;

function getAuthorizationHeaderValue() {
    const token = localStorage.getItem('qlpk_token') || localStorage.getItem('token') || sessionStorage.getItem('qlpk_token') || '';
    if (!token) return '';
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function downloadProtectedFile(url, filename) {
    const authHeader = getAuthorizationHeaderValue();
    fetch(url, { headers: authHeader ? { 'Authorization': authHeader } : {} })
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

$(document).ready(function () {
    listPagination = window.QLPKPagination.create({ onChange(page, size) {
        currentPage = page;
        pageSize = size;
        loadData();
    } });
    loadData();

    let searchTimeout;
    $('#al-search').on('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadData();
        }, 500);
    });

    $('#btn-add-allergen').on('click', function () {
        $('#al-form')[0].reset();
        $('#al-id').val('');
        $('#al-modal-title').html('<i class="bi bi-droplet-half"></i> Thêm dị nguyên mới');
        new bootstrap.Modal(document.getElementById('alModal')).show();
    });

    $('#al-form').on('submit', function (e) {
        e.preventDefault();
        saveAllergen();
    });

    $('#btn-download-template').on('click', function () {
        downloadProtectedFile('/api/allergen/template', 'mau_import_di_nguyen.xlsx');
    });

    $('#btn-import-excel').on('click', function () {
        $('#al-import-file').click();
    });

    $('#al-import-file').on('change', function (e) {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        showToast('Đang xử lý file...', 'success');

        $.ajax({
            url: '/api/allergen/import',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (res) {
                if (res.success) {
                    showToast('Đã nhập dữ liệu dị nguyên.', 'success');
                    loadData();
                } else {
                    showToast('Không thể nhập dữ liệu dị nguyên. Vui lòng kiểm tra tệp và thử lại.', 'danger');
                }
                $('#al-import-file').val('');
            },
            error: function (err) {
				showToast('Không thể nhập dữ liệu dị nguyên. Vui lòng kiểm tra tệp và thử lại.', 'danger');
                $('#al-import-file').val('');
            }
        });
    });

    if (window.QLPKRealtimePageHooks) {
        window.QLPKRealtimePageHooks.register({
            types: ['inventory.changed'],
            debounceMs: 500,
            handler: function (event) {
                const entity = event && event.payload ? event.payload.entity : null;
                if (!entity || entity === 'allergen') {
                    loadData();
                }
            }
        });
    }
});

function loadData() {
    const revision = ++listRevision;
    const search = $('#al-search').val().trim();
    $.ajax({
        url: `/api/allergen?search=${encodeURIComponent(search)}&page=${currentPage}&limit=${pageSize}`,
        method: 'GET',
        success: function (res) {
            if (revision !== listRevision) return;
            if (res.success) {
                currentData = res.data;
                totalItems = res.total;
                const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
                if (currentPage > lastPage) { currentPage = lastPage; loadData(); return; }
                $('#stat-total').text(res.total);
                renderTable(currentData);
                renderPagination();
            }
        },
        error: function () {
            showToast('Lỗi khi tải dữ liệu', 'danger');
        }
    });
}

function renderTable(data) {
    const tbody = $('#al-table-body');
    tbody.empty();

    if (data.length === 0) {
        tbody.append('<tr><td colspan="4" class="text-center text-muted py-4">Không có dữ liệu</td></tr>');
        return;
    }

    data.forEach((item, index) => {
        const stt = (currentPage - 1) * pageSize + index + 1;
        tbody.append(`
            <tr>
                <td>${stt}</td>
                <td class="catalog-dict-name-cell">${escapeHtml(item.ten_di_nguyen)}</td>
                <td class="text-muted catalog-dict-desc-cell">${item.mo_ta ? escapeHtml(item.mo_ta) : ''}</td>
                <td class="catalog-dict-action-cell">
                    <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm text-primary p-1" onclick="editItem(${item.id})" title="Sửa"><i class="bi bi-pencil-square"></i></button>
                    <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm text-danger p-1" onclick="deleteItem(${item.id})" title="Xóa"><i class="bi bi-trash3"></i></button>
                </td>
            </tr>
        `);
    });
}

function renderPagination() {
    listPagination.update({ page: currentPage, pageSize, total: totalItems });
}

function editItem(id) {
    const item = currentData.find(x => x.id === id);
    if (!item) return;

    $('#al-id').val(item.id);
    $('#al-name').val(item.ten_di_nguyen);
    $('#al-desc').val(item.mo_ta);
    $('#al-modal-title').html('<i class="bi bi-pencil-square"></i> Cập nhật dị nguyên');
    new bootstrap.Modal(document.getElementById('alModal')).show();
}

function saveAllergen() {
    const id = $('#al-id').val();
    const payload = {
        ten_di_nguyen: $('#al-name').val().trim(),
        mo_ta: $('#al-desc').val().trim()
    };

    if (!payload.ten_di_nguyen) {
        showToast('Tên dị nguyên không được để trống', 'danger');
        return;
    }

    $.ajax({
        url: id ? `/api/allergen/${id}` : '/api/allergen',
        method: id ? 'PUT' : 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload),
        success: function (res) {
            if (res.success) {
                bootstrap.Modal.getInstance(document.getElementById('alModal')).hide();
                showToast('Lưu thành công', 'success');
                loadData();
            } else {
                showToast('Không thể lưu dị nguyên. Vui lòng kiểm tra lại.', 'danger');
            }
        },
        error: function (err) {
			showToast('Không thể xử lý dị nguyên. Vui lòng thử lại.', 'danger');
        }
    });
}

function deleteItem(id) {
    if (confirm('Bạn có chắc chắn muốn xóa dị nguyên này?')) {
        $.ajax({
            url: `/api/allergen/${id}`,
            method: 'DELETE',
            success: function (res) {
                if (res.success) {
                    showToast('Đã xóa', 'success');
                    loadData();
                } else {
                    showToast('Không thể xóa dị nguyên. Vui lòng thử lại.', 'danger');
                }
            },
            error: function () {
                showToast('Không thể xóa dị nguyên. Vui lòng thử lại.', 'danger');
            }
        });
    }
}

function showToast(message, type = 'success') {
	return window.QLPKUserFeedback?.show(type, message);
}
