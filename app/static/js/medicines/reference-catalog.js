(function () {
    'use strict';

    let currentPage = 1;
    const pageSize = 20;
    let totalItems = 0;
    let searchTimer = null;

    function getAuthHeader() {
        try {
            const raw = localStorage.getItem('qlpk_token') || localStorage.getItem('token') || sessionStorage.getItem('qlpk_token');
            if (!raw) return null;
            if (raw.trim().startsWith('{')) {
                const parsed = JSON.parse(raw);
                const token = parsed.access_token || parsed.token || parsed.Authorization || parsed.authorization;
                return token ? `Bearer ${token.replace(/^Bearer\s+/i, '')}` : null;
            }
            return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
        } catch (error) {
            return null;
        }
    }

    function ensureToken() {
        if (!getAuthHeader()) {
            window.location.href = '/login';
            return false;
        }
        return true;
    }

    async function apiFetch(url, options = {}) {
        const authHeader = getAuthHeader();
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(authHeader ? { Authorization: authHeader } : {}),
                ...(options.headers || {})
            }
        });
        if (response.status === 401) {
            window.location.href = '/login';
            throw new Error('Phiên đăng nhập đã hết hạn');
        }
        return response;
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('vi-VN');
    }

    function showToast(message, type = 'success') {
		return window.QLPKUserFeedback?.show(type, message);
    }

    function updateSummary(summary = {}) {
        document.getElementById('summary-total').textContent = summary.total || 0;
        document.getElementById('summary-active').textContent = summary.active || 0;
        document.getElementById('summary-expired').textContent = summary.expired || 0;
        document.getElementById('summary-withdrawn').textContent = summary.withdrawn || 0;
    }

    function renderTable(items) {
        const tbody = document.getElementById('referenceTableBody');
        tbody.innerHTML = '';

        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Không có dữ liệu</td></tr>';
            return;
        }

        items.forEach((item, index) => {
            const stt = (currentPage - 1) * pageSize + index + 1;
            const statusBadge = getStatusBadge(item);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${stt}</td>
                <td>
                    <div class="drug-name">${escapeHtml(item.name)}</div>
                    <div class="muted-line">SĐK: ${escapeHtml(item.registration_number || '')}</div>
                    ${item.old_registration_number ? `<div class="muted-line">SĐK cũ: ${escapeHtml(item.old_registration_number)}</div>` : ''}
                </td>
                <td>
                    <div>${escapeHtml(item.active_ingredient || '')}</div>
                    ${item.strength ? `<div class="muted-line">${escapeHtml(item.strength)}</div>` : ''}
                </td>
                <td>
                    <div>${escapeHtml(item.dosage_form || '')}</div>
                    <div class="muted-line">${escapeHtml(item.packaging || '')}</div>
                </td>
                <td>
                    <div>${escapeHtml(item.manufacturer_name || '')}</div>
                    <div class="muted-line">${escapeHtml(item.manufacturer_country || '')}</div>
                </td>
                <td>
                    ${statusBadge}
                    <div class="muted-line mt-1">Đến: ${escapeHtml(formatDate(item.registration_expiry_date))}</div>
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-primary reference-detail-btn" data-id="${item.id}" title="Xem chi tiết">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function detailRow(label, value) {
        return `
            <div class="detail-label">${escapeHtml(label)}</div>
            <div class="detail-value">${escapeHtml(value || '')}</div>
        `;
    }

    function getStatusText(item) {
        if (item.is_registration_withdrawn) return 'Đã rút số đăng ký';
        if (item.is_deleted) return 'Đã xóa trên nguồn DAV';
        if (item.is_expired) return 'Hết hạn';
        return 'Hiệu lực';
    }

    function getStatusBadge(item) {
        if (item.is_registration_withdrawn) return '<span class="badge text-bg-danger">Đã rút số</span>';
        if (item.is_deleted) return '<span class="badge text-bg-secondary">Đã xóa</span>';
        if (item.is_expired) return '<span class="badge text-bg-warning">Hết hạn</span>';
        return '<span class="badge text-bg-success">Hiệu lực</span>';
    }

    function renderDetail(item) {
        const content = document.getElementById('referenceDetailContent');
        content.innerHTML = [
            detailRow('Tên thuốc', item.name),
            detailRow('Số đăng ký', item.registration_number),
            detailRow('Số đăng ký cũ', item.old_registration_number),
            detailRow('Hoạt chất', item.active_ingredient),
            detailRow('Hàm lượng', item.strength),
            detailRow('Dạng bào chế', item.dosage_form),
            detailRow('Đóng gói', item.packaging),
            detailRow('Đường dùng', item.route),
            detailRow('Tiêu chuẩn', item.standard),
            detailRow('Tuổi thọ', item.shelf_life),
            detailRow('Nhà sản xuất', item.manufacturer_name),
            detailRow('Nước sản xuất', item.manufacturer_country),
            detailRow('Đơn vị đăng ký', item.registrant_name),
            detailRow('Nước đăng ký', item.registrant_country),
            detailRow('Ngày cấp SĐK', formatDate(item.registration_issue_date)),
            detailRow('Ngày hết hạn SĐK', formatDate(item.registration_expiry_date)),
            detailRow('Số quyết định', item.decision_number),
            detailRow('Đợt cấp', item.approval_batch),
            detailRow('Trạng thái', getStatusText(item)),
        ].join('');

        document.getElementById('referenceRawPayload').textContent = JSON.stringify(item.raw_payload || {}, null, 2);
    }

    async function openReferenceDetail(catalogId) {
        try {
            const content = document.getElementById('referenceDetailContent');
            content.innerHTML = '<div class="text-muted">Đang tải chi tiết...</div>';
            document.getElementById('referenceRawPayload').textContent = '{}';
            const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('referenceDetailModal'));
            modal.show();

            const response = await apiFetch(`/api/medicine-reference-catalog/${catalogId}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Không tải được chi tiết thuốc DAV');
            }
            renderDetail(result.data || {});
        } catch (error) {
            showToast('Không thể tải chi tiết thuốc. Vui lòng thử lại.', 'danger');
        }
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalItems);
        document.getElementById('pageStart').textContent = start;
        document.getElementById('pageEnd').textContent = end;
        document.getElementById('pageTotal').textContent = totalItems;
        document.getElementById('currentPageDisplay').textContent = currentPage;
        document.getElementById('prevPageBtn').disabled = currentPage <= 1;
        document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    }

    async function loadData() {
        const search = document.getElementById('referenceSearch').value.trim();
        const status = document.getElementById('referenceStatus').value;
        const params = new URLSearchParams({
            search,
            status,
            page: String(currentPage),
            per_page: String(pageSize)
        });

        try {
            const response = await apiFetch(`/api/medicine-reference-catalog?${params.toString()}`);
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Không tải được danh mục thuốc');
            }
            totalItems = result.total || 0;
            updateSummary(result.summary || {});
            renderTable(result.data || []);
            updatePagination();
        } catch (error) {
            renderTable([]);
            showToast('Không thể tải dữ liệu thuốc. Vui lòng thử lại.', 'danger');
        }
    }

    async function syncDavCatalog() {
        const button = document.getElementById('syncDavBtn');
        const resultEl = document.getElementById('syncResult');
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang đồng bộ...';
        resultEl.textContent = 'Đang kéo dữ liệu từ DAV, vui lòng chờ...';

        try {
            const syncScope = document.getElementById('syncScope').value;
            const payload = { page_size: 1000 };
            if (syncScope === 'sample') {
                payload.max_pages = 1;
            }
            const response = await apiFetch('/api/medicine-reference-catalog/sync', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Đồng bộ DAV thất bại');
            }

            const sync = result.result || {};
            resultEl.textContent = `Nguồn ${sync.total_source || 0} thuốc, đã lấy ${sync.fetched || 0}, thêm ${sync.inserted || 0}, cập nhật ${sync.updated || 0}, bỏ qua ${sync.skipped || 0}.`;
            showToast('Đồng bộ DAV thành công', 'success');
            currentPage = 1;
            await loadData();
        } catch (error) {
            resultEl.textContent = 'Không thể đồng bộ dữ liệu thuốc. Vui lòng thử lại.';
            showToast(resultEl.textContent, 'danger');
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-cloud-arrow-down me-1"></i>Đồng bộ DAV';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!ensureToken()) return;
        loadData();

        document.getElementById('referenceSearch').addEventListener('input', function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(function () {
                currentPage = 1;
                loadData();
            }, 350);
        });
        document.getElementById('referenceStatus').addEventListener('change', function () {
            currentPage = 1;
            loadData();
        });
        document.getElementById('prevPageBtn').addEventListener('click', function () {
            if (currentPage > 1) {
                currentPage -= 1;
                loadData();
            }
        });
        document.getElementById('nextPageBtn').addEventListener('click', function () {
            if (currentPage < Math.ceil(totalItems / pageSize)) {
                currentPage += 1;
                loadData();
            }
        });
        document.getElementById('referenceTableBody').addEventListener('click', function (event) {
            const button = event.target.closest('.reference-detail-btn');
            if (!button) return;
            openReferenceDetail(button.dataset.id);
        });
        document.getElementById('syncDavBtn').addEventListener('click', syncDavCatalog);

        if (window.QLPKRealtimePageHooks) {
            window.QLPKRealtimePageHooks.register({
                types: ['inventory.changed'],
                debounceMs: 500,
                handler: function (event) {
                    const entity = event && event.payload ? event.payload.entity : null;
                    if (!entity || entity === 'medicine_reference_catalog') {
                        loadData();
                    }
                }
            });
        }
    });
})();
