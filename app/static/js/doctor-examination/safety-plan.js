import {
    getComponent as medicalHistoryGetComponent,
    getPageRuntime as medicalHistoryGetPageRuntime
} from './medical-history-context.js';

/* ══════════════════════════════════════════════════════════════════
   KẾ HOẠCH AN TOÀN — owner: safetyPlan
   Lưu vào patients.safety_plan (JSONB)
   ══════════════════════════════════════════════════════════════════ */

/** Cache family members đã load cho patient hiện tại */
function safetyPlanGetState() {
    return medicalHistoryGetComponent().state.safetyPlan;
}

function safetyPlanGetPageRuntime() {
    const pageRuntime = medicalHistoryGetPageRuntime();
    if (!pageRuntime || typeof pageRuntime.apiCall !== 'function'
        || typeof pageRuntime.showCustomToast !== 'function') {
        throw new Error('Thiếu page runtime cho safety plan');
    }
    return pageRuntime;
}

function safetyPlanGetContextToken() {
    return medicalHistoryGetComponent().getContextToken();
}

function safetyPlanGetCurrentPatientId() {
    const component = medicalHistoryGetComponent();
    const rawPatientId = typeof component.config.getPatientId === 'function'
        ? component.config.getPatientId()
        : null;
    const patientId = Number(rawPatientId);
    return Number.isInteger(patientId) && patientId > 0 ? patientId : null;
}

function safetyPlanIsCurrent(patientId, contextToken) {
    const currentPatientId = safetyPlanGetCurrentPatientId();
    return String(currentPatientId || '') === String(patientId)
        && contextToken === safetyPlanGetContextToken();
}

/**
 * Load danh sách người thân → populate 3 select slots
 * @param {number} patientId
 * @param {Array}  savedSupporters  - Mảng {order, member_id, phone} từ safety_plan.nguoi_ho_tro
 *                                    Truyền vào để set selection ngay sau khi options được append,
 *                                    tránh race condition với setTimeout.
 * @param {Object} options          - Predicate xác nhận request vẫn thuộc patient hiện tại.
 */
function safetyPlanSetUploadLabel(labelEl, iconClass, text) {
    const icon = document.createElement('i');
    icon.className = `bi ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = text;
    labelEl.replaceChildren(icon, label);
}

async function safetyPlanLoadFamilyMembers(patientId, savedSupporters = [], options = {}) {
    const isCurrentLoad = typeof options.isCurrentLoad === 'function' ? options.isCurrentLoad : () => true;
    if (!patientId || !isCurrentLoad()) return false;

    let familyMembers = [];
    try {
        const res  = await fetch(`/api/family-members/patient/${patientId}`);
        const data = await res.json();
        if (!isCurrentLoad()) return false;
        // API trả { success: true, data: [...] }
        familyMembers = Array.isArray(data.data) ? data.data : [];
    } catch (e) {
        if (String(e?.code || '').startsWith('session.')) throw e;
        if (!isCurrentLoad()) return false;
    }

    // Không để response cũ ghi state hoặc DOM của bệnh nhân mới.
    if (!isCurrentLoad()) return false;
    safetyPlanGetState().familyMembers = familyMembers;

    if (!isCurrentLoad()) return false;

    // Build map: order → saved member_id để tra cứu nhanh
    const savedMap = {};
    savedSupporters.forEach(s => { if (s.order >= 1 && s.order <= 3) savedMap[s.order] = s; });

    [1, 2, 3].forEach(i => {
        if (!isCurrentLoad()) return;
        const sel = medicalHistoryGetComponent().getElement(`safetyPlanSupport${i}`);
        if (!sel) return;

        // Rebuild options — SĐT nhúng thẳng vào text option
        while (sel.options.length > 1) sel.remove(1);
        familyMembers.forEach(m => {
            const opt = document.createElement('option');
            opt.value         = m.id;
            opt.dataset.phone = m.phone || '';
            opt.dataset.name  = m.name  || '';
            const label = `${m.name || '—'}${m.kinship ? ' (' + m.kinship + ')' : ''}`;
            const phone = m.phone ? ' · ' + m.phone : '';
            opt.textContent = label + phone;
            sel.appendChild(opt);
        });

        // Restore selection ngay sau khi options đã được append
        const saved = savedMap[i];
        if (saved && saved.member_id) {
            sel.value = String(saved.member_id);
        }
    });

    return true;
}

/**
 * Populate 4 fields + file status từ safety_plan object
 */
function safetyPlanPopulatePlan(plan) {
    if (!plan || typeof plan !== 'object') { safetyPlanResetPlan(); return; }

    const setVal = (id, val) => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) el.value = val || '';
    };

    setVal('safetyPlanNhanDien',   plan.nhan_dien);
    setVal('safetyPlanCachUngPho', plan.cach_ung_pho);
    setVal('safetyPlanDongLuc',    plan.dong_luc_song);

    // Người hỗ trợ: đã được xử lý trong safetyPlanLoadFamilyMembers(patientId, savedSupporters)
    // → không set lại ở đây để tránh race condition

    safetyPlanUpdateFileStatus(plan.uploaded_file || '');
}

/** Reset form về trống */
function safetyPlanResetPlan() {
    ['safetyPlanNhanDien', 'safetyPlanCachUngPho', 'safetyPlanDongLuc'].forEach(id => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) el.value = '';
    });
    [1, 2, 3].forEach(i => {
        const sel = medicalHistoryGetComponent().getElement(`safetyPlanSupport${i}`);
        if (sel) sel.value = '';
    });
    safetyPlanUpdateFileStatus('');
}

/** Cập nhật hiển thị trạng thái file đã tải lên. */
function safetyPlanUpdateFileStatus(filePath) {
    const status = medicalHistoryGetComponent().getElement('safetyPlanFileStatus');
    const link   = medicalHistoryGetComponent().getElement('safetyPlanFileLink');
    if (!status || !link) return;
    const patientId = safetyPlanGetCurrentPatientId();
    if (filePath && patientId) {
        // href chỉ dùng để mở file, không dùng để save
        link.href = `/api/patients/${patientId}/safety-plan/file`;
        status.style.display = 'inline-flex';
    } else {
        link.href = '#';
        status.style.display = 'none';
    }
}

/** Thu thập dữ liệu form → object JSONB */
function safetyPlanCollectPlan() {
    const supporters = [];
    [1, 2, 3].forEach(i => {
        const sel = medicalHistoryGetComponent().getElement(`safetyPlanSupport${i}`);
        if (!sel || !sel.value) return;
        const opt = sel.options[sel.selectedIndex];
        supporters.push({
            order:     i,
            member_id: parseInt(sel.value),
            name:      opt?.dataset.name  || '',
            phone:     opt?.dataset.phone || ''
        });
    });

    return {
        nhan_dien:     (medicalHistoryGetComponent().getElement('safetyPlanNhanDien')?.value   || '').trim(),
        cach_ung_pho:  (medicalHistoryGetComponent().getElement('safetyPlanCachUngPho')?.value || '').trim(),
        dong_luc_song: (medicalHistoryGetComponent().getElement('safetyPlanDongLuc')?.value    || '').trim(),
        nguoi_ho_tro:  supporters
    };
}

/** Helper hiển thị toast thông báo theo style hệ thống */
function safetyPlanToast(type, message) {
    safetyPlanGetPageRuntime().showCustomToast(type, message);
}

/** In mẫu PDF gốc */
function safetyPlanPrintTemplate() {
    window.open('/static/assets/ke-hoach-an-toan.pdf', '_blank');
}

/**
 * Click “Xem file” → verify file tồn tại trước khi mở.
 * Nếu 404 → xóa dấu tích xanh và clear uploaded_file trong DB (explicit null).
 */
async function safetyPlanOpenFile(event) {
    event.preventDefault();
    const patientId = safetyPlanGetCurrentPatientId();
    if (!patientId) {
        safetyPlanToast('error', 'Vui lòng chọn bệnh nhân trước khi mở file.');
        return;
    }
    const contextToken = safetyPlanGetContextToken();
    const url = `/api/patients/${patientId}/safety-plan/file?t=${Date.now()}`;
    try {
        const res = await fetch(url);
        if (!safetyPlanIsCurrent(patientId, contextToken)) return;
        if (res.ok) {
            const blob = await res.blob();
            if (!safetyPlanIsCurrent(patientId, contextToken)) return;
            const blobUrl = URL.createObjectURL(blob);
            window.open(blobUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        } else if (res.status === 404) {
            // File không còn trên disk → xóa UI + clear uploaded_file trong DB
            if (!safetyPlanIsCurrent(patientId, contextToken)) return;
            safetyPlanUpdateFileStatus('');
            await safetyPlanClearUploadedFile(patientId, { contextToken });
            if (!safetyPlanIsCurrent(patientId, contextToken)) return;
            safetyPlanToast('error', 'File không còn tồn tại trên server. Vui lòng upload lại.');
        } else {
            safetyPlanToast('error', 'Không thể mở file kế hoạch an toàn.');
        }
    } catch (error) {
        if (safetyPlanIsCurrent(patientId, contextToken)) safetyPlanToast('error', 'Không thể mở tệp. Vui lòng thử lại.');
    }
}

/**
 * Xóa uploaded_file khỏi DB — chỉ được gọi khi file đã xác nhận không tồn tại.
 * Gửi explicit null vì đây là thao tác file riêng, ngoài global Save.
 */
async function safetyPlanClearUploadedFile(patientId, options = {}) {
    const contextToken = options.contextToken ?? safetyPlanGetContextToken();
    if (!safetyPlanIsCurrent(patientId, contextToken)) return false;
    const planData = safetyPlanCollectPlan(); // form fields hiện tại
    planData.uploaded_file = null;    // explicit clear — đây là 1 nguồn duy nhất
    const response = await fetch(`/api/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safety_plan: planData })
    });
    if (!response.ok) throw new Error('Không thể cập nhật trạng thái file kế hoạch an toàn.');
    return safetyPlanIsCurrent(patientId, contextToken);
}

/** Upload file đã ký */
async function safetyPlanHandleUpload(input) {
    const file = input.files?.[0];
    if (!file) return;

    const patientId = safetyPlanGetCurrentPatientId();
    if (!patientId) {
        safetyPlanToast('error', 'Vui lòng chọn bệnh nhân trước khi upload.');
        input.value = '';
        return;
    }
    const contextToken = safetyPlanGetContextToken();

    const formData = new FormData();
    formData.append('file', file);

    const labelEl = medicalHistoryGetComponent().query('label[for="safetyPlanFileInput"]');
    try {
        if (labelEl) safetyPlanSetUploadLabel(labelEl, 'bi-arrow-repeat', 'Đang upload...');

        const res  = await fetch(`/api/patients/${patientId}/safety-plan/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (!safetyPlanIsCurrent(patientId, contextToken)) return;
        if (res.ok && data.success) {
            safetyPlanUpdateFileStatus(data.file_path);
            safetyPlanToast('success', 'Upload thành công!');
        } else {
            safetyPlanToast('error', 'Không thể tải kế hoạch an toàn lên. Vui lòng thử lại.');
        }
    } catch (e) {
        if (safetyPlanIsCurrent(patientId, contextToken)) safetyPlanToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
        if (labelEl && safetyPlanIsCurrent(patientId, contextToken)) {
            safetyPlanSetUploadLabel(labelEl, 'bi-upload', 'Upload bản đã ký');
        }
        if (safetyPlanIsCurrent(patientId, contextToken)) input.value = '';
    }
}

medicalHistoryGetComponent().registerActions({
    getSafetyPlanState: safetyPlanGetState,
    getPageRuntime: safetyPlanGetPageRuntime,
    loadFamilyMembers: safetyPlanLoadFamilyMembers,
    populatePlan: safetyPlanPopulatePlan,
    resetPlan: safetyPlanResetPlan,
    updateFileStatus: safetyPlanUpdateFileStatus,
    collectPlan: safetyPlanCollectPlan,
    toast: safetyPlanToast,
    printTemplate: safetyPlanPrintTemplate,
    openFile: safetyPlanOpenFile,
    clearUploadedFile: safetyPlanClearUploadedFile,
    handleUpload: safetyPlanHandleUpload
});
