import {
    callAction as medicalHistoryCallAction,
    getComponent as medicalHistoryGetComponent,
    setVisible as medicalHistorySetVisible
} from './medical-history-context.js';

/* ══════════════════════════════════════════════════════════════════
   10 CHẤT — patient-level substance_use_history owner
   Không đồng bộ substance sang physical_history.
   ══════════════════════════════════════════════════════════════════ */

function medicalHistoryEmitSubstanceUseChange() {
    const helper = window.QLPKDoctorModuleRegistry.get('medicalHistorySubstanceFields');
    const substanceIds = medicalHistoryGetComponent().config.substanceIds || [];
    const value = helper && typeof helper.collectSubstanceUseData === 'function'
        ? helper.collect({
            document,
            substanceIds
        })
        : {};

    if (typeof medicalHistoryGetComponent().emitChange === 'function') {
        medicalHistoryGetComponent().emitChange('substanceTableWrap', 'substance_use_history', value);
    }
    medicalHistoryCallAction('updateWorkbenchSummary');
}

function medicalHistorySubstanceToggleChip(checkbox) {
    const noteId = checkbox.id.replace('_check', '_time');
    const noteEl = medicalHistoryGetComponent().getElement(noteId);

    if (checkbox.checked) {
        if (noteEl) noteEl.disabled = false;
    } else {
        if (noteEl) { noteEl.disabled = true; noteEl.value = ''; }
    }

    medicalHistoryEmitSubstanceUseChange();
}

/* ══════════════════════════════════════════════════════════════════
   TỰ SÁT / TỰ HẠI — UI + ICD CHIP
   Khi tick checkbox → add chip ICD vào banThanChips + enable ghi chú
   Bỏ tick → remove chip + clear + disable ghi chú
   ══════════════════════════════════════════════════════════════════ */

/**
 * PRIMITIVE: Đặt trạng thái "active" cho 1 suicide ICD.
 * Dùng cho cả user-tick (medicalHistorySuicideToggleChip) và program-restore (medicalHistoryRestoreSuicideAndRisk)
 * để đảm bảo behavior nhất quán giữa 2 luồng.
 *
 * Caller chịu trách nhiệm gọi updateSelectedICDTags('physHistory') sau khi xong.
 *
 * @param {string} icd     - ICD code (ví dụ: 'Z91.5')
 * @param {Object} icdObj  - ICD object {id, icd_code, disease_name} (tên sạch từ API)
 */
function medicalHistoryApplySuicideIcd(icd) {
    // Tự sát thuộc risk_assessment theo lượt khám; không thêm ICD vào patient history.
    medicalHistoryGetComponent().queryAll('#suicideTableWrap tbody tr').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox && String(checkbox.dataset.icd || '').toUpperCase() === String(icd || '').toUpperCase()) {
            checkbox.checked = true;
            const noteInput = row.querySelector('.medical-history-sub-input');
            if (noteInput) noteInput.disabled = false;
        }
    });
}

/**
 * Gọi từ onchange của mỗi checkbox trong bảng tự sát/tự hại.
 * id của note input theo quy ước: checkbox id thay _check → _note
 */
async function medicalHistorySuicideToggleChip(checkbox, icd, name) {
    if (checkbox.checked) {
        medicalHistoryApplySuicideIcd(icd);
    } else {
        const noteId = checkbox.id.replace('_check', '_note');
        const noteEl = medicalHistoryGetComponent().getElement(noteId);
        if (noteEl) { noteEl.disabled = true; noteEl.value = ''; }
    }
    medicalHistoryRiskSync();
}

/** Sync khi xóa ICD khỏi physicalHistory multiselect */
function medicalHistorySyncPhysHistoryRemove(icdCode) {
    // Bỏ selected ở suggestion list
    medicalHistoryGetComponent().queryAll('#banThanList .medical-history-suggestion-item').forEach(item => {
        const badge = item.querySelector('.medical-history-icd-badge');
        if (badge && badge.textContent.trim() === icdCode) {
            item.classList.remove('medical-history-selected');
        }
    });
}


/* ══════════════════════════════════════════════════════════════════
   ĐÁNH GIÁ NGUY CƠ TỰ SÁT — Serialize / Restore / Sync
   Dữ liệu lưu theo object JSONB có cấu trúc, không ghép chuỗi hiển thị.
   ══════════════════════════════════════════════════════════════════ */

const RISK_FIELD_CONFIG = [
    { key: 'ideation', radio: 'risk_ideation', note: 'risk_ideation_note', yes: 'risk_ideation_yes', no: 'risk_ideation_no' },
    { key: 'plan', radio: 'risk_plan', note: 'risk_plan_note', yes: 'risk_plan_yes', no: 'risk_plan_no' },
    { key: 'intent', radio: 'risk_intent', note: 'risk_intent_note', yes: 'risk_intent_yes', no: 'risk_intent_no' },
    { key: 'self_harm', radio: 'risk_sh', note: 'risk_sh_note', yes: 'risk_sh_yes', no: 'risk_sh_no' },
];

function medicalHistorySerializeRiskAssessment() {
    const assessment = {};
    RISK_FIELD_CONFIG.forEach(config => {
        const selected = medicalHistoryGetComponent().query(`input[name="${config.radio}"]:checked`);
        if (!selected) return;
        assessment[config.key] = {
            value: selected.value === 'co' ? 'co' : 'khong',
            note: (medicalHistoryGetComponent().getElement(config.note)?.value || '').trim(),
        };
    });
    const level = medicalHistoryGetComponent().query('input[name="risk_level"]:checked');
    if (level) assessment.level = level.value;

    const suicideHistory = [];
    medicalHistoryGetComponent().queryAll('#suicideTableWrap tbody tr').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (!checkbox?.checked) return;
        const code = String(checkbox.dataset.icd || '').trim();
        if (!code) return;
        suicideHistory.push({
            code,
            note: (row.querySelector('.medical-history-sub-input')?.value || '').trim(),
        });
    });

    if (!suicideHistory.length && !Object.keys(assessment).length) return {};
    return { schema_version: 1, suicide_history: suicideHistory, assessment };
}

function medicalHistoryRestoreRiskAssess(data = {}) {
    // Reset
    ['risk_ideation_no','risk_ideation_yes','risk_plan_no','risk_plan_yes',
     'risk_intent_no','risk_intent_yes','risk_sh_no','risk_sh_yes',
     'risk_level_low','risk_level_mid','risk_level_high'].forEach(id => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) el.checked = false;
    });
    ['risk_ideation_note','risk_plan_note','risk_intent_note','risk_sh_note'].forEach(id => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) { el.value = ''; el.disabled = true; }
    });

    const assessment = data && typeof data === 'object' ? data.assessment || {} : {};
    RISK_FIELD_CONFIG.forEach(config => {
        const item = assessment[config.key];
        if (!item?.value) return;
        const isYes = item.value === 'co';
        const radio = medicalHistoryGetComponent().getElement(isYes ? config.yes : config.no);
        const note = medicalHistoryGetComponent().getElement(config.note);
        if (radio) radio.checked = true;
        if (note) {
            note.disabled = !isYes;
            note.value = isYes ? String(item.note || '') : '';
        }
    });
    const levelId = { thap: 'risk_level_low', trung_binh: 'risk_level_mid', cao: 'risk_level_high' }[assessment.level];
    if (levelId) medicalHistoryGetComponent().getElement(levelId).checked = true;
}

function medicalHistoryRestoreSuicideNotes(data = {}) {
    const notes = new Map((data.suicide_history || []).map(item => [String(item.code || '').trim(), String(item.note || '')]));
    medicalHistoryGetComponent().queryAll('#suicideTableWrap tbody tr').forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const noteInput = row.querySelector('.medical-history-sub-input');
        const code = String(checkbox?.dataset.icd || '').trim();
        if (checkbox?.checked && noteInput) noteInput.value = notes.get(code) || '';
    });
}

/**
 * Bật/tắt input chi tiết khi chọn radio Không/Có.
 * enableNote=true khi chọn "Có", false khi chọn "Không".
 */
function medicalHistoryRiskToggle(radioName, noteId, enableNote) {
    const noteEl = medicalHistoryGetComponent().getElement(noteId);
    if (!noteEl) return;
    if (enableNote) {
        noteEl.disabled = false;
        noteEl.focus();
    } else {
        noteEl.disabled = true;
        noteEl.value = '';
    }
    medicalHistoryRiskSync();
}

function medicalHistoryUpdateRiskWarningBadge() {
    const riskData = medicalHistorySerializeRiskAssessment();
    const warningBadge = medicalHistoryGetComponent().query('.medical-history-tab-warn-icon');
    if (warningBadge) {
        warningBadge.style.display = Object.keys(riskData).length ? 'inline-flex' : 'none';
    }
}

let _riskSyncTimer = null;
function medicalHistoryClearRiskSyncTimer() {
    clearTimeout(_riskSyncTimer);
    _riskSyncTimer = null;
}

function medicalHistoryHasPendingRiskSync() {
    return Boolean(_riskSyncTimer);
}

function medicalHistoryRiskSync() {
    medicalHistoryCallAction('serializeBanThan');
    medicalHistoryUpdateRiskWarningBadge();
    medicalHistoryCallAction('updateWorkbenchSummary');
    clearTimeout(_riskSyncTimer);
    _riskSyncTimer = setTimeout(() => {
        medicalHistoryCallAction('emitBanThanChange');
    }, 400);
}


/* ══════════════════════════════════════════════════════════════════
   RESET KHI CHUYỂN BỆNH NHÂN
   ══════════════════════════════════════════════════════════════════ */

/** Reset toàn bộ bảng Tự sát/Tự hại về trạng thái ban đầu */
function medicalHistoryResetSuicideTable() {
    const suicideIds = [
        'suicide_ideation', 'suicide_poison',
        'suicide_hang', 'suicide_sharp', 'suicide_jump',
        'suicide_trauma', 'suicide_violence'
    ];
    suicideIds.forEach(id => {
        const check = medicalHistoryGetComponent().getElement(id + '_check');
        const note  = medicalHistoryGetComponent().getElement(id + '_note');
        if (check) check.checked = false;
        if (note)  { note.value = ''; note.disabled = true; }
    });
}

/** Reset toàn bộ bảng Đánh giá nguy cơ về trạng thái ban đầu */
function medicalHistoryResetRiskAssess() {
    ['risk_ideation_no','risk_ideation_yes','risk_plan_no','risk_plan_yes',
     'risk_intent_no','risk_intent_yes','risk_sh_no','risk_sh_yes',
     'risk_level_low','risk_level_mid','risk_level_high'].forEach(id => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) el.checked = false;
    });
    ['risk_ideation_note','risk_plan_note','risk_intent_note','risk_sh_note'].forEach(id => {
        const el = medicalHistoryGetComponent().getElement(id);
        if (el) { el.value = ''; el.disabled = true; }
    });
}

/**
 * Gọi 1 lần khi load bệnh nhân mới: restore theo risk_assessment của lượt khám.
 */
function medicalHistoryRestoreSuicideAndRisk(riskAssessment = {}) {
    // Reset trước, sau đó phục hồi đúng owner của dữ liệu nguy cơ.
    medicalHistoryResetSuicideTable();
    medicalHistoryResetRiskAssess();

    medicalHistoryRestoreRiskAssess(riskAssessment);

    const suicideHistory = Array.isArray(riskAssessment?.suicide_history)
        ? riskAssessment.suicide_history
        : [];
    suicideHistory.forEach(item => {
        const code = String(item?.code || '').trim();
        if (code) medicalHistoryApplySuicideIcd(code);
    });

    medicalHistoryRestoreSuicideNotes(riskAssessment);

    medicalHistoryUpdateRiskWarningBadge();


    // Đồng bộ trạng thái checked của các radio ĐGN
	if (typeof window.$ === 'function' && window.$.fn) {
		$('input[type="radio"][name^="risk_"]').each(function() {
			this.dataset.wasChecked = String(this.checked);
		});
	}
}

/**
 * Populate panel "Đánh giá nguy cơ lần trước" — full chi tiết.
 * Hiển thị structured risk assessment của lần khám trước.
 */
function medicalHistoryPopulatePrevRiskBadge(appointmentData) {
    const wrap    = medicalHistoryGetComponent().getElement('prevRiskBadgeWrap');
    const badge   = medicalHistoryGetComponent().getElement('prevRiskBadge');
    const details = medicalHistoryGetComponent().getElement('prevRiskDetails');
    if (!wrap || !badge || !details) return;

    const data = appointmentData.medical_history?.previous_examination?.risk_assessment || {};
    const assessment = data.assessment || {};
    const suicideHistory = Array.isArray(data.suicide_history) ? data.suicide_history : [];
    if (!suicideHistory.length && !Object.keys(assessment).length) {
        medicalHistorySetVisible(wrap, false);
        return;
    }

    const levelCfg = {
        'cao':        { label: '⚠ Cao',        cls: 'risk-high', detailCls: 'val-level-cao' },
        'trung bình': { label: '▲ Trung bình', cls: 'risk-mid',  detailCls: 'val-level-mid' },
        'trung_binh': { label: '▲ Trung bình', cls: 'risk-mid',  detailCls: 'val-level-mid' },
        'thấp':       { label: '✓ Thấp',        cls: 'risk-low', detailCls: 'val-level-low' },
        'thap':       { label: '✓ Thấp',        cls: 'risk-low', detailCls: 'val-level-low' },
    };

    const fields = [];
    if (suicideHistory.length) {
        fields.push({ label: 'Tiền sử tự sát', value: suicideHistory.map(item => item.code).filter(Boolean).join(', '), note: suicideHistory.map(item => item.note).filter(Boolean).join('; ') });
    }
    const labels = {
        ideation: 'Ý tưởng tự sát',
        plan: 'Kế hoạch tự sát',
        intent: 'Toàn tính tự sát',
        self_harm: 'Hành vi tự hại',
    };
    Object.keys(labels).forEach(key => {
        if (assessment[key]?.value) fields.push({ label: labels[key], value: assessment[key].value === 'co' ? 'Có' : 'Không', note: assessment[key].note || '' });
    });
    if (assessment.level) fields.push({ label: 'Mức độ nguy cơ', value: assessment.level, note: '' });

    let foundLevel = null;
    details.innerHTML = '';

    fields.forEach(field => {
        const label = field.label;
        const val = field.value === 'thap' ? 'Thấp' : field.value === 'trung_binh' ? 'Trung bình' : field.value === 'cao' ? 'Cao' : field.value;
        const note = field.note;
        if (label === 'Mức độ nguy cơ') foundLevel = levelCfg[field.value] || null;

        // Xác định class cho giá trị
        let valCls = 'prev-risk-detail-val';
        const valLower = val.toLowerCase();
        if (label.toLowerCase().includes('mức độ nguy cơ') && foundLevel) {
            valCls += ' ' + foundLevel.detailCls;
        } else if (valLower === 'có') {
            valCls += ' val-co';
        } else if (valLower === 'không') {
            valCls += ' val-khong';
        }

        const li = document.createElement('li');
        const labelEl = document.createElement('span');
        labelEl.className = 'prev-risk-detail-label';
        labelEl.textContent = `${label}:`;
        const valueEl = document.createElement('span');
        valueEl.className = valCls;
        valueEl.textContent = val;
        li.append(labelEl, valueEl);
        if (note) {
            const noteEl = document.createElement('span');
            noteEl.className = 'prev-risk-detail-note';
            noteEl.textContent = `– ${note}`;
            li.appendChild(noteEl);
        }
        details.appendChild(li);
    });

    // Cập nhật badge header
    badge.className = 'prev-risk-badge ' + (foundLevel ? foundLevel.cls : 'risk-unknown');
    badge.textContent = foundLevel ? foundLevel.label : 'Có dữ liệu';

    medicalHistorySetVisible(wrap, true);
}

medicalHistoryGetComponent().registerActions({
    substanceToggleChip: medicalHistorySubstanceToggleChip,
    applySuicideIcd: medicalHistoryApplySuicideIcd,
    suicideToggleChip: medicalHistorySuicideToggleChip,
    syncPhysHistoryRemove: medicalHistorySyncPhysHistoryRemove,
    serializeRiskAssessment: medicalHistorySerializeRiskAssessment,
    restoreRiskAssess: medicalHistoryRestoreRiskAssess,
    riskToggle: medicalHistoryRiskToggle,
    updateRiskWarningBadge: medicalHistoryUpdateRiskWarningBadge,
    riskSync: medicalHistoryRiskSync,
    clearRiskSyncTimer: medicalHistoryClearRiskSyncTimer,
    hasPendingRiskSync: medicalHistoryHasPendingRiskSync,
    resetSuicideTable: medicalHistoryResetSuicideTable,
    resetRiskAssess: medicalHistoryResetRiskAssess,
    restoreSuicideAndRisk: medicalHistoryRestoreSuicideAndRisk,
    populatePrevRiskBadge: medicalHistoryPopulatePrevRiskBadge,
    restoreSuicideNotes: medicalHistoryRestoreSuicideNotes
});
