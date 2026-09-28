/* ══════════════════════════════════════════════════════════════════
   MEDICAL HISTORY CORE (EVENT-DRIVEN)
   Shared markup, feature actions registered into the base component.
   ══════════════════════════════════════════════════════════════════ */

import {
  callAction as medicalHistoryCallAction,
  debugLog as medicalHistoryDebugLog,
  getComponent as medicalHistoryGetComponent,
  getIcdLookup as medicalHistoryGetIcdLookup,
  getJsonHeaders as medicalHistoryGetJsonHeaders,
  getPageRuntime as medicalHistoryGetPageRuntime,
  getSelectedICDs as medicalHistoryGetSelectedICDs,
  setVisible as medicalHistorySetVisible
} from './medical-history-context.js';

/* ══════════════════════════════════════════════════════════════════
   INLINE TIỀN SỬ BỆNH — medical-history module
   ══════════════════════════════════════════════════════════════════ */

function medicalHistorySetMedicalHistoryPanelCollapsed(collapsed) {
  const component = medicalHistoryGetComponent();
  const panel = component.getElement('medicalHistoryMedicalHistoryPanel');
  const body = component.getElement('medicalHistoryMedicalHistoryBody');
  const toggle = component.getElement('medicalHistoryMedicalHistoryToggle');
  if (!panel || !body || !toggle) return;

  panel.classList.toggle('is-collapsed', collapsed);
  body.hidden = collapsed;
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('title', collapsed ? 'Mở rộng tiền sử bệnh' : 'Thu gọn tiền sử bệnh');
}

function medicalHistoryToggleMedicalHistoryPanel() {
  const panel = medicalHistoryGetComponent().getElement('medicalHistoryMedicalHistoryPanel');
  medicalHistorySetMedicalHistoryPanelCollapsed(!panel?.classList.contains('is-collapsed'));
}

function medicalHistoryInitMedicalHistoryPanelToggle() {
  const component = medicalHistoryGetComponent();
  const toggle = component.getElement('medicalHistoryMedicalHistoryToggle');
  const body = component.getElement('medicalHistoryMedicalHistoryBody');
  if (!toggle || !body || toggle.dataset.bound === 'true') return;

  toggle.dataset.bound = 'true';
  medicalHistorySetMedicalHistoryPanelCollapsed(false);
}

function medicalHistorySerializeBanThan() {
  const selectedICDs = medicalHistoryGetSelectedICDs();
  const jsonbArray = (selectedICDs.physHistory || [])
    .filter(x => x.id != null)
    .map(x => ({ type: 'icd', id: x.id }));

  const textVal = (medicalHistoryGetComponent().getElement('physHistoryTextInput')?.value || '').trim();
  if (textVal) {
    jsonbArray.push({ type: 'text', value: textVal });
  }

  const hidden = medicalHistoryGetComponent().getElement('patientPhysicalHistory');
  if (hidden) {
    hidden.value = JSON.stringify(jsonbArray);
  }

  medicalHistoryCallAction('syncCheckboxesState');
}

async function medicalHistoryGetIcdObject(icdCode) {
  if (!icdCode) return null;
  try {
    // Dùng ?codes= (exact match theo mã ICD) — không dùng ?search= vì search trả về nhiều kết quả
    // Nhất quán với restore path (/api/icd/?ids=...)
    const runtime = medicalHistoryGetPageRuntime();
    const response = await runtime.apiCall(`/api/icd/?codes=${encodeURIComponent(icdCode.trim())}`, {
        method: 'GET',
        headers: medicalHistoryGetJsonHeaders()
      });
    if (response.ok) {
      const result = await response.json();
      const data = result.data || [];
      const found = data.find(x => x.icd_code.trim().toUpperCase() === icdCode.trim().toUpperCase());
      if (found) return { id: found.id, icd_code: found.icd_code, disease_name: found.disease_name };
    }
  } catch (e) {
    if (String(e?.code || '').startsWith('session.')) throw e;
    console.error('[medicalHistoryGetIcdObject] Lỗi khi tra mã ICD ' + icdCode, e);
  }
  return null;
}


function medicalHistoryEmitBanThanChange() {
  const component = medicalHistoryGetComponent();
  const selectedICDs = medicalHistoryGetSelectedICDs();
  const jsonbArray = (selectedICDs.physHistory || [])
    .filter(x => x.id != null)
    .map(x => ({ type: 'icd', id: x.id }));

  const textVal = (component.getElement('physHistoryTextInput')?.value || '').trim();
  if (textVal) {
    jsonbArray.push({ type: 'text', value: textVal });
  }
  component.emitChange('patientPhysicalHistory', 'physical_history', jsonbArray);

  const riskAssessment = medicalHistoryCallAction('serializeRiskAssessment') || {};
  component.emitChange('riskAssessWrap', 'risk_assessment', riskAssessment);
}

function countMedicalHistoryNodes(selector) {
  return medicalHistoryGetComponent().queryAll(selector).length;
}

function verifyPhysHistoryPopulate(patientHistory) {
  const physHistory = patientHistory.physical_history || [];
  if (!(physHistory.length > 0)) return [];
  if (countMedicalHistoryNodes('#physHistoryTags .medical-history-chip') > 0) return [];
  return [['[POPULATE ⚠] physHistory: DB có', physHistory.length, 'IDs nhưng chips = 0']];
}

function verifySuicideNotePopulate(item) {
  const icd = String(item?.code || '').trim();
  const note = String(item?.note || '').trim();
  if (!icd || !note) return null;
  const row = [...medicalHistoryGetComponent().queryAll('#suicideTableWrap tbody tr')]
    .find(r => r.querySelector(`[data-icd="${icd}"]`));
  const input = row?.querySelector('.medical-history-sub-input');
  if (!input || input.value === note) return null;
  return [`[POPULATE ⚠] Ghi chú nguy cơ ${icd}: DB="${note}" nhưng UI="${input.value}"`];
}

function verifySuicideHistoryPopulate(riskAssessment) {
  const suicideHistory = Array.isArray(riskAssessment.suicide_history)
    ? riskAssessment.suicide_history
    : [];
  if (suicideHistory.length === 0) return [];
  const warnings = [];
  if (countMedicalHistoryNodes('#suicideTableWrap input[type="checkbox"]:checked') === 0) {
    warnings.push(['[POPULATE ⚠] Tự sát: risk_assessment có dữ liệu nhưng không có checkbox nào được tick']);
  }
  suicideHistory.forEach(item => {
    const warning = verifySuicideNotePopulate(item);
    if (warning) warnings.push(warning);
  });
  return warnings;
}

function verifyRiskAssessmentPopulate(riskAssessment) {
  if (Object.keys(riskAssessment.assessment || {}).length === 0) return [];
  if (countMedicalHistoryNodes('input[name^="risk_"]:checked') > 0) return [];
  return [['[POPULATE ⚠] Đánh giá nguy cơ: risk_assessment có dữ liệu nhưng không có radio nào được chọn']];
}

function verifyFamilyHistoryPopulate(patientHistory) {
  const familyHist = patientHistory.family_history || [];
  if (!Array.isArray(familyHist) || familyHist.length === 0) return [];
  if (countMedicalHistoryNodes('#famHistoryTags .medical-history-chip') > 0) return [];
  return [['[POPULATE ⚠] Gia đình: DB có', familyHist.length, 'entries nhưng chips = 0']];
}

function verifyAllergyPopulate(patientHistory) {
  const allergies = Array.isArray(patientHistory.allergies) ? patientHistory.allergies : [];
  if (allergies.length === 0) return [];
  if (countMedicalHistoryNodes('#drugAllergyBody .allergy-row') > 0) return [];
  return [['[POPULATE ⚠] Dị ứng: DB có data nhưng UI không có hàng nào']];
}

/**
 * [GIAI ĐOẠN 2] VERIFY layer: Kiểm tra sau populate — log cảnh báo nếu DB có data nhưng UI không hiển thị.
 * Chỉ đọc DOM, không ghi, không gây side effect.
 *
 * Cách đọc log:
 *   [POPULATE ⚠] → bug populate cần xem xét
 *   [POPULATE ✓] → tất cả kiểm tra pass
 */
function _verifyMedicalHistoryPopulate(appointmentData) {
  if (!window.QLPK_DEBUG_MEDICAL_HISTORY) return;

  const history = appointmentData.medical_history || {};
  const patientHistory = history.patient || {};
  const riskAssessment = history.examination?.risk_assessment || {};
  const warnings = [
    ...verifyPhysHistoryPopulate(patientHistory),
    ...verifySuicideHistoryPopulate(riskAssessment),
    ...verifyRiskAssessmentPopulate(riskAssessment),
    ...verifyFamilyHistoryPopulate(patientHistory),
    ...verifyAllergyPopulate(patientHistory)
  ];
  warnings.forEach(args => console.warn(...args));
  if (warnings.length === 0) {
    medicalHistoryDebugLog('[POPULATE ✓] Tất cả kiểm tra pass');
  }
}

function medicalHistorySerializeGiaDinh() {
  const selectedICDs = medicalHistoryGetSelectedICDs();
  const jsonbArray = (selectedICDs.famHistory || [])
    .filter(x => x.id != null)
    .map(x => ({ type: 'icd', id: x.id }));

  const textVal = (medicalHistoryGetComponent().getElement('famHistoryTextInput')?.value || '').trim();
  if (textVal) {
    jsonbArray.push({ type: 'text', value: textVal });
  }

  const hidden = medicalHistoryGetComponent().getElement('patientFamilyHistory');
  if (hidden) {
    hidden.value = JSON.stringify(jsonbArray);
  }

  medicalHistoryCallAction('syncCheckboxesState');
}

function medicalHistoryEmitGiaDinhChange() {
  const component = medicalHistoryGetComponent();
  const selectedICDs = medicalHistoryGetSelectedICDs();
  const jsonbArray = (selectedICDs.famHistory || [])
    .filter(x => x.id != null)
    .map(x => ({ type: 'icd', id: x.id }));

  const textVal = (component.getElement('famHistoryTextInput')?.value || '').trim();
  if (textVal) {
    jsonbArray.push({ type: 'text', value: textVal });
  }
  component.emitChange('patientFamilyHistory', 'family_history', jsonbArray);
}

function medicalHistoryIsSuicideIcd(icd) {
  if (!icd) return false;
  const clean = icd.trim().toUpperCase();
  if (['Z91.5', 'Z65.5', 'Z61'].includes(clean)) return true;
  if (clean.startsWith('X6') || clean.startsWith('X7') || clean.startsWith('X8')) return true;
  return false;
}

function medicalHistoryToggleIcdById(icdId, target, missingLabel) {
  const icd = medicalHistoryGetComponent().getFeature('icd');
  if (!icd || typeof icd.toggleICDSelection !== 'function') return;
  const lookup = medicalHistoryGetIcdLookup() || {};
  const icdObj = Object.values(lookup).find(entry => entry.id === icdId) || null;
  if (!icdObj) {
    console.error(`[MedicalHistory] ICD ID not found in lookup map${missingLabel}:`, icdId);
    return;
  }
  icd.toggleICDSelection(icdObj, target);
}

function medicalHistoryToggleBanThan(el, icdId) {
  medicalHistoryToggleIcdById(icdId, 'physHistory', '');
}

function medicalHistoryToggleGiaDinh(el, icdId) {
  medicalHistoryToggleIcdById(icdId, 'famHistory', ' for Family');
}

function medicalHistorySyncFamHistoryRemove(icdCode) {
  medicalHistoryGetComponent().queryAll('#giaDinhList .medical-history-suggestion-item').forEach(item => {
    const badge = item.querySelector('.medical-history-icd-badge');
    if (badge && badge.textContent.trim() === icdCode) {
      item.classList.remove('medical-history-selected');
    }
  });
}

medicalHistoryGetComponent().registerActions({
  getPageRuntime: medicalHistoryGetPageRuntime,
  getJsonHeaders: medicalHistoryGetJsonHeaders,
  getSelectedICDs: medicalHistoryGetSelectedICDs,
  getIcdLookup: medicalHistoryGetIcdLookup,
  toggleMedicalHistoryPanel: medicalHistoryToggleMedicalHistoryPanel,
  initMedicalHistoryPanelToggle: medicalHistoryInitMedicalHistoryPanelToggle,
  serializeBanThan: medicalHistorySerializeBanThan,
  emitBanThanChange: medicalHistoryEmitBanThanChange,
  serializeGiaDinh: medicalHistorySerializeGiaDinh,
  emitGiaDinhChange: medicalHistoryEmitGiaDinhChange,
  getIcdObject: medicalHistoryGetIcdObject,
  isSuicideIcd: medicalHistoryIsSuicideIcd,
  togglePersonalHistory: medicalHistoryToggleBanThan,
  toggleFamilyHistory: medicalHistoryToggleGiaDinh,
  syncFamHistoryRemove: medicalHistorySyncFamHistoryRemove,
  setVisible: medicalHistorySetVisible,
  verifyPopulate: _verifyMedicalHistoryPopulate
});
