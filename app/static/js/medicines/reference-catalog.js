(function () {
    'use strict';

    let currentPage = 1;
    let pageSize = 10;
    let listPagination;
    let listRevision = 0;
    let totalItems = 0;
    let searchTimer = null;
    let listController = null;
    let activeListKey = '';
    let summaryLoaded = false;
    let exportController = null;

    function cancelListRequest() {
        listRevision += 1;
        listController?.abort();
        listController = null;
        activeListKey = '';
    }

    function showListMessage(message) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 7;
        cell.className = 'text-start text-muted py-4';
        cell.textContent = message;
        row.append(cell);
        document.getElementById('referenceTableBody').replaceChildren(row);
    }

    function ensureToken() {
        if (!window.QLPKApiTransport.hasSession()) {
            window.location.href = '/login';
            return false;
        }
        return true;
    }

    async function apiFetch(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
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
            tbody.innerHTML = '<tr><td colspan="7" class="text-start text-muted py-4">Không có dữ liệu</td></tr>';
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
                    <button data-qlpk-button="view" data-qlpk-button-variant="soft" type="button" class="btn btn-sm reference-detail-btn" data-id="${item.id}" title="Xem chi tiết">
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
            detailRow(item.route || !item.suggested_route ? 'Đường dùng' : 'Đường dùng (gợi ý)',
                item.route || item.suggested_route),
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

    }

    async function openReferenceDetail(catalogId) {
        try {
            const content = document.getElementById('referenceDetailContent');
            content.innerHTML = '<div class="text-muted">Đang tải chi tiết...</div>';
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
        listPagination.update({ page: currentPage, pageSize, total: totalItems });
    }

    async function loadData() {
        window.clearTimeout(searchTimer);
        const search = document.getElementById('referenceSearch').value.trim();
        const status = document.getElementById('referenceStatus').value;
        const params = new URLSearchParams({
            search,
            status,
            page: String(currentPage),
            per_page: String(pageSize),
            include_summary: summaryLoaded ? '0' : '1'
        });
        const key = params.toString();
        if (listController && activeListKey === key) return;
        cancelListRequest();
        const revision = listRevision;
        const controller = new AbortController();
        listController = controller;
        activeListKey = key;
        const button = document.getElementById('referenceSearchButton');
        const tbody = document.getElementById('referenceTableBody');
        setSearchBusy(button, tbody, true);
        showListMessage('Đang tìm thuốc DAV…');
        document.getElementById('clinicPagination').classList.add('d-none');
        const deadline = window.setTimeout(() => controller.abort(), 15000);
        try {
            const response = await apiFetch(`/api/medicine-reference-catalog?${params.toString()}`, {signal: controller.signal});
            const result = await response.json();
            if (revision !== listRevision) return;
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Không tải được danh mục thuốc');
            }
            if (!applyReferencePage(result)) return loadData();
        } catch (error) {
            if (revision !== listRevision) return;
            showListMessage(error.name === 'AbortError'
                ? 'Tìm kiếm mất quá lâu. Nhấn Tìm kiếm để thử lại.'
                : 'Chưa tải được kết quả. Nhấn Tìm kiếm để thử lại.');
            showToast('Không thể tải dữ liệu thuốc. Vui lòng thử lại.', 'danger');
        } finally {
            window.clearTimeout(deadline);
            if (revision === listRevision) {
                listController = null;
                activeListKey = '';
                setSearchBusy(button, tbody, false);
            }
        }
    }

    function setSearchBusy(button, tbody, busy) {
        tbody.setAttribute('aria-busy', busy ? 'true' : 'false');
        button.disabled = busy;
        button.textContent = busy ? 'Đang tìm…' : 'Tìm kiếm';
    }

    // Render one result page; returns false when the current page is past the end (caller reloads).
    function applyReferencePage(result) {
        totalItems = result.total || 0;
        const lastPage = Math.max(1, Math.ceil(totalItems / pageSize));
        if (currentPage > lastPage) { currentPage = lastPage; return false; }
        if (result.summary) { updateSummary(result.summary); summaryLoaded = true; }
        renderTable(result.data || []);
        updatePagination();
        document.getElementById('clinicPagination').classList.remove('d-none');
        return true;
    }

    async function exportDavCatalog() {
        if (exportController) return;
        const button = document.getElementById('referenceExportButton');
        const originalLabel = button.innerHTML;
        const controller = new AbortController();
        exportController = controller;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Đang xuất…';
        const deadline = window.setTimeout(() => controller.abort(), 120000);
        try {
            const params = new URLSearchParams({
                search: document.getElementById('referenceSearch').value.trim(),
                status: document.getElementById('referenceStatus').value
            });
            const response = await apiFetch(`/api/medicine-reference-catalog/export/excel?${params}`, {signal: controller.signal});
            if (!response.ok || !(response.headers.get('Content-Type') || '').includes('spreadsheetml.sheet')) {
                throw new Error('Export failed');
            }
            const blob = await response.blob();
            if (controller.signal.aborted) return;
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'danh_muc_thuoc_DAV.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            showToast('Đã xuất danh mục thuốc DAV', 'success');
        } catch (error) {
            showToast(error.name === 'AbortError'
                ? 'Xuất Excel mất quá lâu. Vui lòng thử lại.'
                : 'Không thể xuất Excel. Vui lòng thử lại.', 'danger');
        } finally {
            window.clearTimeout(deadline);
            exportController = null;
            button.disabled = false;
            button.setAttribute('aria-busy', 'false');
            button.innerHTML = originalLabel;
        }
    }

    async function syncDavCatalog() {
        const button = document.getElementById('syncDavBtn');
        const resultEl = document.getElementById('syncResult');
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Đang đồng bộ...';
        resultEl.textContent = 'Đang kéo dữ liệu từ DAV, vui lòng chờ...';

        try {
            const payload = { page_size: 1000 };
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
            summaryLoaded = false;
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
        listPagination = window.QLPKPagination.create({ onChange(page, size) {
            currentPage = page;
            pageSize = size;
            loadData();
        } });
        loadData();

        document.getElementById('referenceSearchForm').addEventListener('submit', function (event) {
            event.preventDefault();
            currentPage = 1;
            loadData();
        });
        document.getElementById('referenceSearch').addEventListener('input', function () {
            window.clearTimeout(searchTimer);
            cancelListRequest();
            document.getElementById('referenceSearchButton').disabled = false;
            document.getElementById('referenceSearchButton').textContent = 'Tìm kiếm';
            showListMessage('Đang tìm thuốc DAV…');
            document.getElementById('clinicPagination').classList.add('d-none');
            searchTimer = window.setTimeout(function () {
                currentPage = 1;
                loadData();
            }, 350);
        });
        document.getElementById('referenceStatus').addEventListener('change', function () {
            currentPage = 1;
            loadData();
        });
        document.getElementById('referenceTableBody').addEventListener('click', function (event) {
            const button = event.target.closest('.reference-detail-btn');
            if (!button) return;
            openReferenceDetail(button.dataset.id);
        });
        document.getElementById('syncDavBtn').addEventListener('click', syncDavCatalog);
        document.getElementById('referenceExportButton').addEventListener('click', exportDavCatalog);

        if (window.QLPKRealtimePageHooks) {
            window.QLPKRealtimePageHooks.register({
                types: ['inventory.changed'],
                debounceMs: 500,
                handler: function (event) {
                    const entity = event && event.payload ? event.payload.entity : null;
                    if (!entity || entity === 'medicine_reference_catalog') {
                        summaryLoaded = false;
                        loadData();
                    }
                }
            });
        }
        window.addEventListener('pagehide', function () {
            cancelListRequest();
            exportController?.abort();
        });
    });
})();
