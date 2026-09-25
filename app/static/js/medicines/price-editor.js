(function (window) {
    'use strict';
    const el = id => document.getElementById(id);
    let medicine = null, snapshot = null, revision = 0, saving = false, loading = false, next = null, opened = false;
    const money = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', {maximumFractionDigits: 2}) + ' đ';
    const time = value => value ? new Date(value).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }) : 'Đang áp dụng';
    function period(row = null) {
        el('medicinePriceFrom').textContent = row?.effective_from ? time(row.effective_from)
            : medicine ? 'Khi xác nhận giá mới' : 'Khi lưu thuốc thành công';
        el('medicinePriceTo').textContent = row?.effective_from ? time(row.effective_to)
            : 'Chưa xác định — đến lần đổi giá tiếp theo';
    }
    function cents(value) {
        const raw = String(value ?? '').trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
        const number = Number(raw);
        return number <= 99999999.99 ? Math.round(number * 100) : null;
    }
    function message(text, error = false) {
        el('medicinePriceMessage').textContent = text;
        el('medicinePriceMessage').classList.toggle('text-danger', error);
    }
    function controls() {
        const closed = !opened;
        const value = cents(el('medicinePriceNew').value);
        const old = snapshot ? cents(snapshot.current_price) : null;
        const diff = value == null || old == null ? null : value - old;
        const difference = el('medicinePriceDifference');
        difference.textContent = diff == null ? '—' : (diff > 0 ? '+' : '') + money(diff / 100);
        difference.classList.toggle('mm-price-delta-up', diff != null && diff > 0);
        difference.classList.toggle('mm-price-delta-down', diff != null && diff < 0);
        el('medicinePriceConfirm').disabled = closed || saving || loading || !snapshot || value == null || value === old;
        el('medicinePriceNew').disabled = closed || saving || loading || !snapshot;
        el('medicinePriceCancel').disabled = saving;
        el('medicinePriceClose').disabled = saving;
        el('medicinePriceOpen').disabled = saving;
        el('medicinePriceMore').disabled = saving || loading;
        el('medicinePriceConfirm').textContent = saving ? 'Đang lưu…' : 'Xác nhận giá mới';
        el('medicineSaveButton').disabled = opened || el('medicineEditFields').disabled;
    }
    function close() {
        if (saving) return;
        if (opened) window.bootstrap.Modal.getOrCreateInstance(el('medicinePricePanel')).hide();
    }
    function dismissed() {
        revision++;
        loading = false;
        opened = false;
        controls();
    }
    function reset() {
        close();
        medicine = null; snapshot = null; next = null;
        el('medicinePriceHistoryRows').replaceChildren();
        el('medicinePriceNew').value = '';
        el('medicinePriceHistory').open = false;
        el('medicinePriceMedicine').textContent = '';
    }
    function history(data, append = false) {
        const body = el('medicinePriceHistoryRows');
        if (!append) body.replaceChildren();
        for (const row of data.history) {
            const tr = document.createElement('tr');
            const delta = row.difference == null ? 0 : Number(row.difference);
            for (const [value, name] of [[money(row.old_price)], [money(row.new_price)],
                [row.difference == null ? '—' : (delta > 0 ? '+' : '') + money(row.difference),
                    delta > 0 ? 'mm-price-delta-up' : delta < 0 ? 'mm-price-delta-down' : ''],
                [time(row.effective_from)]]) {
                const td = document.createElement('td');
                if (name) td.className = name;
                td.textContent = value; tr.append(td);
            }
            const until = document.createElement('td');
            if (row.effective_to == null) {
                const badge = document.createElement('span');
                badge.className = 'mm-price-active-badge'; badge.textContent = 'Đang áp dụng';
                until.append(badge);
            } else until.textContent = time(row.effective_to);
            const actor = document.createElement('td'); actor.textContent = row.changed_by;
            tr.append(until, actor);
            body.append(tr);
        }
        if (!append && !data.history.length) {
            const tr = document.createElement('tr'), td = document.createElement('td');
            td.colSpan = 6; td.className = 'mm-price-history-empty';
            td.textContent = 'Chưa ghi nhận lịch sử giá.'; tr.append(td); body.append(tr);
        }
        next = data.next_before_id;
        el('medicinePriceMore').hidden = !next;
    }
    async function request(suffix = '', body) {
        const response = await fetch(`/api/medicines/${medicine.id}/price${suffix}`, {
            method: body ? 'POST' : 'GET', headers: {Authorization: 'Bearer ' + localStorage.getItem('qlpk_token'),
                'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})
        });
        let data;
        try { data = await response.json(); } catch (_) { throw new Error('Không tải được thông tin giá. Hãy mở lại để kiểm tra.'); }
        if (!response.ok) throw new Error([400, 403, 409].includes(response.status)
            ? data.user_message || data.error : 'Không thể tải hoặc cập nhật giá. Hãy mở lại để kiểm tra.');
        return data;
    }
    async function open() {
        if (saving || el('medicineEditFields').disabled) return;
        const current = ++revision;
        snapshot = null; loading = true;
        opened = true;
        try {
            el('medicinePriceNew').value = '';
            el('medicinePriceOld').textContent = '—';
            el('medicinePriceMedicine').textContent = medicine?.name || el('medicine-name').value || 'Thuốc mới';
            el('medicinePriceCancel').textContent = 'Hủy';
            el('medicinePriceHistoryRows').replaceChildren();
            el('medicinePriceHistory').hidden = !medicine;
            el('medicinePriceMore').hidden = true;
            period();
            message('Đang tải giá hiện tại…'); controls();
            window.showInventoryOverlay(el('medicinePricePanel'));
            if (medicine) {
                const data = await request();
                if (current !== revision) return;
                snapshot = data;
                history(snapshot);
                el('medicine-unit_price').value = snapshot.current_price;
                message('Nhập giá mới và kiểm tra chênh lệch trước khi xác nhận.');
            } else {
                snapshot = {current_price: el('medicine-unit_price').value || '0'};
                message('Giá khởi tạo và thời điểm áp dụng được ghi khi bạn lưu thuốc thành công.');
            }
            el('medicinePriceOld').textContent = money(snapshot.current_price);
        } catch (error) {
            if (current === revision) {
                snapshot = null;
                if (!el('medicinePricePanel').classList.contains('show')) {
                    dismissed();
                    el('medicineFormError').textContent = 'Không mở được bảng cập nhật giá. Hãy thử lại.';
                    el('medicineFormError').classList.remove('d-none');
                } else message(error.message, true);
            }
        }
        if (current === revision) { loading = false; controls(); el('medicinePriceNew').focus(); }
    }
    async function confirm() {
        controls();
        if (el('medicinePriceConfirm').disabled) return;
        const price = (cents(el('medicinePriceNew').value) / 100).toFixed(2);
        if (!medicine) { el('medicine-unit_price').value = price; close(); return; }
        saving = true; controls();
        try {
            const data = await request('', {new_price: price, expected_price: snapshot.current_price, expected_revision: snapshot.revision});
            snapshot = data;
            el('medicine-unit_price').value = data.current_price;
            el('medicinePriceOld').textContent = money(data.current_price);
            el('medicinePriceNew').value = '';
            history(data); el('medicinePriceHistory').open = true;
            period(data.history[0]);
            el('medicinePriceCancel').textContent = 'Đóng';
            message('Đã cập nhật giá và ghi lịch sử.');
            window.loadMedicines?.(); window.loadAllMedicines?.();
        } catch (error) { snapshot = null; message(error.message, true); }
        finally { saving = false; controls(); }
    }
    async function more() {
        if (!next || loading || saving) return;
        const current = revision; loading = true; controls();
        try {
            const data = await request('?before_id=' + next);
            if (current === revision) history(data, true);
        } catch (error) { if (current === revision) message(error.message, true); }
        finally { if (current === revision) { loading = false; controls(); } }
    }
    window.MedicinePriceEditor = {reset, setExisting: value => { medicine = value; },
        isOpen: () => opened, isSaving: () => saving};
    document.addEventListener('DOMContentLoaded', () => {
        el('medicinePriceOpen').addEventListener('click', open);
        el('medicinePriceCancel').addEventListener('click', close);
        el('medicinePriceClose').addEventListener('click', close);
        el('medicinePricePanel').addEventListener('hide.bs.modal', event => {
            if (saving) event.preventDefault(); else dismissed();
        });
        el('medicinePriceConfirm').addEventListener('click', confirm);
        el('medicinePriceMore').addEventListener('click', more);
        el('medicinePriceNew').addEventListener('input', () => { period(); controls(); });
        el('medicinePriceNew').addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); confirm(); }
        });
        el('medicineModal').addEventListener('hide.bs.modal', event => {
            if (saving) event.preventDefault(); else close();
        });
        reset(); controls();
    });
})(window);
