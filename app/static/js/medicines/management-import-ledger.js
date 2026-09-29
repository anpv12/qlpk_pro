/* global currentPage: writable, formatCurrency, formatDate, formatStockQuantity, getUserFacingResponseMessage, loadAllMedicines, loadMedicines, showCustomToast, showInventoryOverlay */
/* exported currentPage, openImportLedger */

// ========== LỊCH SỬ NHẬP & LÔ (gộp vào modal Nhập kho) ==========
let importLedgerRequestVersion = 0;
let importLedgerPage = 1;
let importLedgerTotalPages = 1;
let importLedgerSort = '';

function switchImportTab(tab) {
    const isLedger = tab === 'ledger';
    document.getElementById('importOrderPane').hidden = isLedger;
    document.getElementById('importLedgerPane').hidden = !isLedger;
    document.getElementById('importTabOrder').classList.toggle('is-active', !isLedger);
    document.getElementById('importTabOrder').setAttribute('aria-selected', String(!isLedger));
    document.getElementById('importTabLedger').classList.toggle('is-active', isLedger);
    document.getElementById('importTabLedger').setAttribute('aria-selected', String(isLedger));
    if (isLedger) loadImportLedger(1);
}

// Chuyển sang tab Lịch sử nhập và lọc theo thuốc. Dùng khi xem tồn của một thuốc cụ thể
// (từ bảng danh mục hoặc nút "Xem hạn dùng" trong form thuốc) hoặc sau khi
// vừa nhập kho xong (sort=recent để thấy ngay lần nhập mới nhất).
function openImportLedger({medicineId = null, search = '', sort = ''} = {}) {
    importLedgerMedicineId = medicineId;
    importLedgerSort = sort;
    document.getElementById('importLedgerSearch').value = search;
    document.getElementById('importLedgerStatus').value = '';
    switchImportTab('ledger');
}

let importLedgerMedicineId = null;

async function loadImportLedger(page = 1) {
    const version = ++importLedgerRequestVersion;
    importLedgerPage = page;
    const tbody = $('#importLedgerTableBody').empty();
    tbody.html('<tr><td colspan="9" class="text-center py-3">Đang tải dữ liệu...</td></tr>');
    $('#importLedgerPrev, #importLedgerNext').prop('disabled', true);
    try {
        const params = new URLSearchParams({page, per_page: 10});
        const search = document.getElementById('importLedgerSearch').value.trim();
        const status = document.getElementById('importLedgerStatus').value;
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (importLedgerMedicineId) params.set('medicine_id', importLedgerMedicineId);
        if (importLedgerSort) params.set('sort', importLedgerSort);
        const response = await $.ajax({
            url: `/api/medicine-batches/?${params}`,
        });
        if (version !== importLedgerRequestVersion) return;
        importLedgerTotalPages = Math.max(1, response.total_pages || 1);
        renderImportLedgerRows(response.batches || []);
        $('#importLedgerPageInfo').text(`${response.total} lô · Trang ${response.page}/${importLedgerTotalPages}`);
        $('#importLedgerPrev').prop('disabled', response.page <= 1).off('click').on('click', () => loadImportLedger(response.page - 1));
        $('#importLedgerNext').prop('disabled', response.page >= importLedgerTotalPages).off('click').on('click', () => loadImportLedger(response.page + 1));
    } catch (_) {
        if (version === importLedgerRequestVersion) tbody.html('<tr><td colspan="9" class="text-center text-danger py-3">Không tải được lịch sử nhập &amp; lô. Hãy đổi bộ lọc hoặc mở lại để thử.</td></tr>');
    }
}

function renderImportLedgerRows(batches) {
    const tbody = document.getElementById('importLedgerTableBody');
    tbody.replaceChildren();
    if (!batches.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 9;
        cell.className = 'text-center py-3';
        cell.textContent = 'Chưa có lần nhập / tồn đầu phù hợp.';
        row.append(cell);
        tbody.append(row);
        return;
    }
    batches.forEach(batch => tbody.append(buildImportLedgerRow(batch)));
}

function buildImportLedgerRow(batch) {
    const row = document.createElement('tr');
    row.dataset.batchId = batch.id;

    const textCell = (text, className) => {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = text;
        return cell;
    };

    row.append(
        textCell(batch.medicine_name || '—', 'text-start'),
        textCell(batch.batch_number, 'text-start'),
        textCell(formatDate(batch.expiry_date), 'text-center text-nowrap'),
        textCell(formatStockQuantity(batch.quantity, batch.unit), 'text-center text-nowrap'),
        textCell(formatStockQuantity(batch.remaining_quantity, batch.unit), 'text-center text-nowrap'),
        textCell(batch.import_price == null ? 'Thiếu giá' : formatCurrency(batch.import_price), 'text-center text-nowrap'),
        textCell(batch.invoice_number?.trim() || '—', 'text-center'),
        textCell(formatDate(batch.import_date), 'text-center text-nowrap')
    );
    if (batch.import_price == null && batch.can_supply_import_price === true) {
        const priceCell = row.children[5];
        const supplement = document.createElement('button');
        supplement.type = 'button';
        supplement.className = 'badge mm-missing-price-badge';
        supplement.dataset.qlpkButton = 'edit';
        supplement.dataset.qlpkButtonVariant = 'solid';
        supplement.textContent = 'Bổ sung giá';
        supplement.addEventListener('click', () => showMissingImportPriceForm(batch, priceCell));
        priceCell.replaceChildren(supplement);
    }
    const actionCell = textCell('', 'text-center');
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-sm btn-outline-primary mm-receipt-history-button';
    action.dataset.qlpkButton = 'view';
    action.dataset.qlpkButtonVariant = 'soft';
    action.textContent = 'Lịch sử kê đơn';
    action.addEventListener('click', () => openReceiptDispensing(batch));
    actionCell.append(action);
    row.append(actionCell);
    return row;
}

function showMissingImportPriceForm(batch, cell) {
    const form = document.createElement('form');
    form.className = 'mm-missing-price-form';
    const label = document.createElement('label');
    label.textContent = 'Giá nhập (đ)';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '99999999.99';
    input.step = '0.01';
    input.required = true;
    input.className = 'form-control form-control-sm';
    label.append(input);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-sm btn-primary';
    save.dataset.qlpkButton = 'execute';
    save.textContent = 'Lưu giá';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-sm btn-outline-secondary';
    cancel.dataset.qlpkButton = 'neutral';
    cancel.dataset.qlpkButtonVariant = 'soft';
    cancel.textContent = 'Hủy';
    cancel.onclick = () => cell.closest('tr').replaceWith(buildImportLedgerRow(batch));
    const error = document.createElement('small');
    error.className = 'text-danger';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-1';
    actions.append(save, cancel);
    form.append(label, actions, error);
    let saving = false;
    form.onsubmit = async event => {
        event.preventDefault();
        if (saving || !form.reportValidity()) return;
        saving = true;
        input.disabled = save.disabled = cancel.disabled = true;
        error.textContent = '';
        try {
            await $.ajax({url: `/api/medicine-batches/${batch.id}/import-price`, method: 'POST',
                contentType: 'application/json', data: JSON.stringify({import_price: input.value})});
            showCustomToast('success', 'Đã bổ sung giá nhập. Tồn và giá vốn giao dịch cũ giữ nguyên.');
            currentPage = 1;
            loadMedicines();
            loadAllMedicines();
            if (cell.isConnected) loadImportLedger(importLedgerPage);
        } catch (failure) {
            error.textContent = getUserFacingResponseMessage(failure, [403, 404, 409], 'Không lưu được. Hãy tải lại lịch sử nhập để kiểm tra.', 'detail');
            input.disabled = save.disabled = cancel.disabled = false;
        } finally {
            saving = false;
        }
    };
    cell.replaceChildren(form);
    input.focus();
}

let receiptDispensingBatch = null;
let receiptDispensingVersion = 0;
let receiptDispensingFilters = {};

function openReceiptDispensing(batch) {
    receiptDispensingBatch = batch;
    const search = document.getElementById('receiptDispensingSearch');
    const type = document.getElementById('receiptDispensingType');
    search.value = type.value = '';
    receiptDispensingFilters = {};
    const applyFilters = () => {
        receiptDispensingFilters = {patient_search: search.value.trim(), movement_type: type.value};
        loadReceiptDispensing(1);
    };
    document.getElementById('receiptDispensingFilters').onsubmit = event => {
        event.preventDefault();
        applyFilters();
    };
    type.onchange = applyFilters;
    document.getElementById('receiptDispensingReset').onclick = () => {
        search.value = type.value = '';
        applyFilters();
    };
    const modal = document.getElementById('receiptDispensingModal');
    $(modal).off('hide.bs.modal.receiptDispensing').on('hide.bs.modal.receiptDispensing', () => {
        receiptDispensingBatch = null;
        receiptDispensingVersion++;
        document.getElementById('receiptDispensingRows').replaceChildren();
    });
    loadReceiptDispensing(1);
    showInventoryOverlay(modal);
}

function receiptDispensingMessage(message) {
    const body = document.getElementById('receiptDispensingRows');
    body.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'text-center py-3';
    cell.textContent = message;
    row.append(cell);
    body.append(row);
}

function formatDispensingTime(value) {
    if (!value) return 'Chưa ghi nhận';
    const stamp = new Date(value);
    if (!Number.isFinite(stamp.getTime())) return 'Chưa ghi nhận';
    return stamp.toLocaleString('vi-VN', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function renderReceiptDispensingRows(rows) {
    if (!rows.length) {
        receiptDispensingMessage(receiptDispensingFilters.patient_search || receiptDispensingFilters.movement_type
            ? 'Không có giao dịch phù hợp với bộ lọc.' : 'Chưa có lịch sử kê đơn / cấp hoàn cho lần nhập này.');
        return;
    }
    const body = document.getElementById('receiptDispensingRows');
    body.replaceChildren();
    const labels = {export: 'Cấp thuốc', return: 'Hoàn thuốc', import: 'Hoàn thuốc (cũ)', price_adjustment: 'Điều chỉnh giá'};
    rows.forEach(item => {
        const row = document.createElement('tr');
        const quantity = value => value == null ? 'Chưa ghi nhận' : formatStockQuantity(value, item.unit);
        const change = item.quantity == null ? 'Chưa ghi nhận'
            : item.quantity === 0 ? 'Không đổi'
                : `${item.quantity > 0 ? '+' : '−'}${quantity(Math.abs(item.quantity))}`;
        const values = [
            [formatDispensingTime(item.created_at)],
            [labels[item.type] || 'Loại chưa xác định'],
            [item.patient_name || (item.appointment_id ? 'Chưa ghi nhận bệnh nhân' : 'Chưa liên kết lượt khám'),
                item.appointment_id ? `Ngày khám: ${formatDispensingTime(item.appointment_date)}` : 'Giao dịch cũ thiếu liên kết'],
            [change],
            [quantity(item.balance_after)],
            [quantity(item.stock_balance_after), item.stock_balance_inconsistent ? 'Cần đối soát: tồn lô lớn hơn tồn tổng' : ''],
            [item.created_by_name || 'Chưa ghi nhận']
        ];
        values.forEach((value, index) => {
            const cell = document.createElement('td');
            const primary = document.createElement('span');
            primary.className = 'mm-dispensing-value';
            primary.textContent = value[0];
            if (index === 1) {
                primary.className = 'mm-dispensing-type';
                if (['export', 'return', 'import', 'price_adjustment'].includes(item.type)) primary.classList.add(`mm-dispensing-type--${item.type}`);
            }
            cell.append(primary);
            if (value[1]) {
                const secondary = document.createElement('span');
                secondary.className = index === 5 ? 'mm-dispensing-warning' : 'mm-dispensing-secondary';
                secondary.textContent = value[1];
                cell.append(secondary);
            }
            row.append(cell);
        });
        body.append(row);
    });
}

async function loadReceiptDispensing(page = 1) {
    if (!receiptDispensingBatch) return;
    const version = ++receiptDispensingVersion;
    const batchId = receiptDispensingBatch.id;
    receiptDispensingMessage('Đang tải lịch sử kê đơn...');
    const info = document.getElementById('receiptDispensingPage');
    const previous = document.getElementById('receiptDispensingPrev');
    const next = document.getElementById('receiptDispensingNext');
    info.textContent = '';
    const pagination = document.getElementById('receiptDispensingPagination');
    pagination.hidden = true;
    previous.disabled = next.disabled = true;
    try {
        const params = new URLSearchParams({batch_id: batchId, page, per_page: 20});
        Object.entries(receiptDispensingFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
        const response = await $.ajax({url: `/api/medicine/statistics/ledger?${params}`});
        if (version !== receiptDispensingVersion) return;
        renderReceiptDispensingRows(response.transactions || []);
        info.textContent = `${response.total} giao dịch${response.total_pages > 1 ? ` · Trang ${response.page}/${response.total_pages}` : ''}`;
        pagination.hidden = response.total_pages <= 1;
        previous.disabled = response.page <= 1;
        next.disabled = response.page >= response.total_pages;
        previous.onclick = () => loadReceiptDispensing(response.page - 1);
        next.onclick = () => loadReceiptDispensing(response.page + 1);
    } catch (_) {
        if (version === receiptDispensingVersion) receiptDispensingMessage('Không tải được lịch sử. Đóng và mở lại để thử.');
    }
}
