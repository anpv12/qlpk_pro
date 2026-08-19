// Text Expansion Management JavaScript

let currentPage = 1;
let totalPages = 1;
let searchTimeout;

// Initialize page
$(document).ready(function() {
    registerRealtimeHooks();
    loadTextExpansions();
    loadStats();
});

function registerRealtimeHooks() {
    if (!window.QLPKRealtimePageHooks) return;
    window.QLPKRealtimePageHooks.register({
        types: ['catalog.changed'],
        filter: function(event) {
            return event && event.payload && event.payload.entity === 'text_expansion';
        },
        handler: function() {
            loadTextExpansions(currentPage);
            loadStats();
            if (window.textExpansion && window.textExpansion.refreshTextExpansions) {
                window.textExpansion.refreshTextExpansions();
            }
        },
        debounceMs: 350,
    });
}

// Load text expansions with filters
function loadTextExpansions(page = 1) {
    const category = $('#categoryFilter').val();
    const status = $('#statusFilter').val();
    const search = $('#searchInput').val();
    
    const params = new URLSearchParams({
        page: page,
        per_page: 20,
        ...(category && category !== 'all' && { category }),
        ...(status && { is_active: status }),
        ...(search && { search })
    });
    
    $.ajax({
        url: `/api/text-expansions/?${params}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        success: function(response) {
            if (response.success) {
                displayTextExpansions(response.data);
                updatePagination(response.pagination);
                currentPage = response.pagination.page;
                totalPages = response.pagination.pages;
            } else {
				showToast('error', 'Không thể tải danh sách từ viết tắt. Vui lòng thử lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể tải danh sách từ viết tắt. Vui lòng thử lại.');
        }
    });
}

// Display text expansions in table
function displayTextExpansions(data) {
    const tbody = $('#textExpansionsTableBody');
    tbody.empty();
    
    if (data.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="6" class="text-center py-4">
                    <i class="bi bi-inbox text-muted text-expansion-empty-icon"></i>
                    <div class="text-muted mt-2">Không có dữ liệu</div>
                </td>
            </tr>
        `);
        return;
    }
    
    data.forEach(item => {
        const statusBadge = item.is_active 
            ? '<span class="status-badge status-active">Đang hoạt động</span>'
            : '<span class="status-badge status-inactive">Không hoạt động</span>';
        
        const categoryBadge = getCategoryBadge(item.category);
        
        const row = `
            <tr>
                <td><strong>${item.abbreviation}</strong></td>
                <td>${item.full_text}</td>
                <td>${categoryBadge}</td>
                <td>${item.description || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline-primary" onclick="editTextExpansion(${item.id})" title="Sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteTextExpansion(${item.id})" title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// Get category badge HTML
function getCategoryBadge(category) {
    const badges = {
        'medical': '<span class="category-badge category-medical">Y tế</span>',
        'psychological': '<span class="category-badge category-psychological">Tâm lý</span>',
        'general': '<span class="category-badge category-general">Chung</span>'
    };
    return badges[category] || `<span class="category-badge category-general">${category}</span>`;
}

// Update pagination
function updatePagination(pagination) {
    const paginationEl = $('#pagination');
    paginationEl.empty();
    
    if (pagination.pages <= 1) return;
    
    // Previous button
    paginationEl.append(`
        <li class="page-item ${pagination.page === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadTextExpansions(${pagination.page - 1})">Trước</a>
        </li>
    `);
    
    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        paginationEl.append(`
            <li class="page-item ${i === pagination.page ? 'active' : ''}">
                <a class="page-link" href="#" onclick="loadTextExpansions(${i})">${i}</a>
            </li>
        `);
    }
    
    // Next button
    paginationEl.append(`
        <li class="page-item ${pagination.page === pagination.pages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="loadTextExpansions(${pagination.page + 1})">Sau</a>
        </li>
    `);
}

// Load statistics
function loadStats() {
    $.ajax({
        url: '/api/text-expansions/',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        success: function(response) {
            if (response.success) {
                const total = response.pagination.total;
                const active = response.data.filter(item => item.is_active).length;
                const inactive = total - active;
                const categories = [...new Set(response.data.map(item => item.category))].length;
                
                $('#totalCount').text(total);
                $('#activeCount').text(active);
                $('#inactiveCount').text(inactive);
                $('#categoryCount').text(categories);
            }
        }
    });
}

// Show add modal
function showAddModal() {
    $('#modalTitle').text('Thêm từ viết tắt');
    $('#textExpansionForm')[0].reset();
    $('#expansionId').val('');
    $('#isActive').prop('checked', true);
    $('#textExpansionModal').modal('show');
}

// Edit text expansion
function editTextExpansion(id) {
    $.ajax({
        url: `/api/text-expansions/${id}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        success: function(response) {
            if (response.success) {
                const data = response.data;
                $('#modalTitle').text('Sửa từ viết tắt');
                $('#expansionId').val(data.id);
                $('#abbreviation').val(data.abbreviation);
                $('#fullText').val(data.full_text);
                $('#category').val(data.category);
                $('#description').val(data.description || '');
                $('#isActive').prop('checked', data.is_active);
                $('#textExpansionModal').modal('show');
            } else {
				showToast('error', 'Không thể tải từ viết tắt. Vui lòng thử lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể tải từ viết tắt. Vui lòng thử lại.');
        }
    });
}

// Save text expansion
function saveTextExpansion() {
    const form = $('#textExpansionForm')[0];
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const data = {
        abbreviation: $('#abbreviation').val().trim(),
        full_text: $('#fullText').val().trim(),
        category: $('#category').val(),
        description: $('#description').val().trim(),
        is_active: $('#isActive').is(':checked')
    };
    
    const id = $('#expansionId').val();
    const url = id ? `/api/text-expansions/${id}` : '/api/text-expansions/';
    const method = id ? 'PUT' : 'POST';
    
    $.ajax({
        url: url,
        method: method,
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(data),
        success: function(response) {
            if (response.success) {
                showToast('success', id ? 'Cập nhật thành công' : 'Thêm mới thành công');
                $('#textExpansionModal').modal('hide');
                loadTextExpansions(currentPage);
                loadStats();
                // Refresh text expansions for active use
                if (window.textExpansion && window.textExpansion.refreshTextExpansions) {
                    window.textExpansion.refreshTextExpansions();
                }
            } else {
				showToast('error', 'Không thể lưu từ viết tắt. Vui lòng kiểm tra lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể lưu từ viết tắt. Vui lòng kiểm tra lại.');
        }
    });
}

// Delete text expansion
function deleteTextExpansion(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa từ viết tắt này?')) {
        return;
    }
    
    $.ajax({
        url: `/api/text-expansions/${id}`,
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        success: function(response) {
            if (response.success) {
                showToast('success', 'Xóa thành công');
                loadTextExpansions(currentPage);
                loadStats();
                // Refresh text expansions for active use
                if (window.textExpansion && window.textExpansion.refreshTextExpansions) {
                    window.textExpansion.refreshTextExpansions();
                }
            } else {
				showToast('error', 'Không thể xóa từ viết tắt. Vui lòng thử lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể xóa từ viết tắt. Vui lòng thử lại.');
        }
    });
}

// Show import modal
function showImportModal() {
    $('#importFile').val('');
    $('#importModal').modal('show');
}

// Import from Excel
function importFromExcel() {
    const fileInput = $('#importFile')[0];
    if (!fileInput.files.length) {
        showToast('error', 'Vui lòng chọn file Excel');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    $.ajax({
        url: '/api/text-expansions/import',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.success) {
                showToast('success', 'Đã nhập từ viết tắt.');
                if (response.errors && response.errors.length > 0) {
                }
                $('#importModal').modal('hide');
                loadTextExpansions(currentPage);
                loadStats();
                // Refresh text expansions for active use
                if (window.textExpansion && window.textExpansion.refreshTextExpansions) {
                    window.textExpansion.refreshTextExpansions();
                }
            } else {
				showToast('error', 'Không thể nhập từ viết tắt. Vui lòng kiểm tra tệp và thử lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể nhập từ viết tắt. Vui lòng kiểm tra tệp và thử lại.');
        }
    });
}

// Export to Excel
function exportToExcel() {
    window.open('/api/text-expansions/export', '_blank');
}

// Download template
function downloadTemplate() {
    const templateData = [
        {
            abbreviation: 'bt',
            full_text: 'bình thường',
            category: 'general',
            description: 'Từ viết tắt cho bình thường',
            is_active: true
        },
        {
            abbreviation: 'tt',
            full_text: 'tình trạng',
            category: 'general',
            description: 'Từ viết tắt cho tình trạng',
            is_active: true
        }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'text_expansions_template.xlsx');
}

// Reset all
function resetAll() {
    if (!confirm('Bạn có chắc chắn muốn xóa TẤT CẢ từ viết tắt? Hành động này không thể hoàn tác!')) {
        return;
    }
    
    $.ajax({
        url: '/api/text-expansions/reset',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
        },
        success: function(response) {
            if (response.success) {
                showToast('success', 'Reset thành công');
                loadTextExpansions(1);
                loadStats();
                // Refresh text expansions for active use
                if (window.textExpansion && window.textExpansion.refreshTextExpansions) {
                    window.textExpansion.refreshTextExpansions();
                }
            } else {
				showToast('error', 'Không thể khôi phục dữ liệu mặc định. Vui lòng thử lại.');
            }
        },
        error: function(xhr) {
			showToast('error', 'Không thể khôi phục dữ liệu mặc định. Vui lòng thử lại.');
        }
    });
}

// Handle search with debounce
function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadTextExpansions(1);
    }, 500);
}

// Show toast notification
function showToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

// Logout function
function logout() {
    localStorage.removeItem('qlpk_token');
    window.location.href = 'login.html';
}
