import {
  getComponent as medicalHistoryGetComponent,
  setVisible as medicalHistorySetVisible
} from './medical-history-context.js';

const MEDICAL_HISTORY_WORKBENCH_TARGETS = {
  personal: { pane: 'personal', title: 'Bản thân', personalGroup: 'noi-khoa' },
  family: { pane: 'family', title: 'Gia đình' },
  allergy: { pane: 'allergy', title: 'Dị ứng thuốc' },
  substance: { pane: 'personal', title: 'Tiền sử dùng chất', personalGroup: 'loi-song', advanced: true },
  suicide: { pane: 'personal', title: 'Tự sát / Tự hại', personalGroup: 'tu-sat', advanced: true },
  risk: { pane: 'personal', title: 'Đánh giá nguy cơ', personalGroup: 'nguy-co', advanced: true },
  safety: { pane: 'personal', title: 'Kế hoạch an toàn', personalGroup: 'ke-hoach-an-toan', advanced: true }
};

function medicalHistoryGetDoctorWorkbenchRoot() {
	const component = medicalHistoryGetComponent();
	return component.query(component.config.workbenchRootSelector || '.inline-tien-su');
}

function medicalHistoryGetWorkbenchSelectedICDs() {
  const historyIcd = medicalHistoryGetComponent().getFeature('icd');
  return historyIcd && typeof historyIcd.getSelectedICDs === 'function'
    ? historyIcd.getSelectedICDs()
    : {};
}

function medicalHistoryGetCountValue(target) {
  const selectedICDs = medicalHistoryGetWorkbenchSelectedICDs();
  if (target === 'personal') {
    const icdCount = Array.isArray(selectedICDs.physHistory) ? selectedICDs.physHistory.length : 0;
    const textCount = (medicalHistoryGetComponent().getElement('physHistoryTextInput')?.value || '').trim() ? 1 : 0;
    return icdCount + textCount;
  }
  if (target === 'family') {
    const icdCount = Array.isArray(selectedICDs.famHistory) ? selectedICDs.famHistory.length : 0;
    const textCount = (medicalHistoryGetComponent().getElement('famHistoryTextInput')?.value || '').trim() ? 1 : 0;
    return icdCount + textCount;
  }
  if (target === 'allergy') {
    return Array.from(medicalHistoryGetComponent().queryAll('#drugAllergyBody .allergy-row')).filter(row => {
      const name = row.querySelector('.allergy-name')?.value || '';
      const symptom = row.querySelector('.allergy-symptom')?.value || '';
      return name.trim() || symptom.trim();
    }).length;
  }
  if (target === 'substance') {
    return medicalHistoryGetComponent().queryAll('#substanceTableWrap input[type="checkbox"]:checked').length;
  }
  if (target === 'suicide') {
    return medicalHistoryGetComponent().queryAll('#suicideTableWrap input[type="checkbox"]:checked').length;
  }
  if (target === 'risk') {
    const checked = medicalHistoryGetComponent().queryAll('#riskAssessWrap input[type="radio"]:checked').length;
    const notes = Array.from(medicalHistoryGetComponent().queryAll('#riskAssessWrap .medical-history-sub-input')).filter(input => (input.value || '').trim()).length;
    return checked + notes;
  }
  if (target === 'safety') {
    return ['safetyPlanNhanDien', 'safetyPlanCachUngPho', 'safetyPlanDongLuc', 'safetyPlanSupport1', 'safetyPlanSupport2', 'safetyPlanSupport3']
      .filter(id => (medicalHistoryGetComponent().getElement(id)?.value || '').trim()).length;
  }
  return 0;
}

function medicalHistorySummaryText(value) {
  return value === undefined || value === null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function medicalHistorySummaryTruncate(value, maxLength = 80) {
  const text = medicalHistorySummaryText(value);
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function medicalHistorySummaryJoinLimited(items, limit = 3) {
  const cleanItems = items.map(medicalHistorySummaryText).filter(Boolean);
  if (!cleanItems.length) return '';
  const visible = cleanItems.slice(0, limit);
  const remaining = cleanItems.length - visible.length;
  return visible.join(', ') + (remaining > 0 ? `, +${remaining} mục khác` : '');
}

function medicalHistoryGetCheckedCodes(selector) {
  return new Set(
    Array.from(medicalHistoryGetComponent().queryAll(selector))
      .map(input => medicalHistorySummaryText(input.dataset.icd).toUpperCase())
      .filter(Boolean)
  );
}

function medicalHistoryGetIcdSummaryItems(mode, options = {}) {
  const selectedICDs = medicalHistoryGetWorkbenchSelectedICDs();
  const excludeCodes = options.excludeCodes || new Set();
  const seen = new Set();
  return (Array.isArray(selectedICDs[mode]) ? selectedICDs[mode] : [])
    .map(item => {
      const code = medicalHistorySummaryText(item.icd_code || item.code).toUpperCase();
      if (code && excludeCodes.has(code)) return '';
      const name = medicalHistorySummaryText(item.disease_name || item.name || item.label);
      const key = code || name;
      if (!key || seen.has(key)) return '';
      seen.add(key);
      return code ? `${code} - ${name || 'chưa rõ tên bệnh'}` : name;
    })
    .filter(Boolean);
}

function medicalHistoryGetHistoryTextItem(inputId, label = 'ghi chú') {
  const value = medicalHistorySummaryTruncate(medicalHistoryGetComponent().getElement(inputId)?.value || '', 90);
  return value ? `${label}: ${value}` : '';
}

function medicalHistoryGetAllergySummaryItems() {
  const levelLabels = { nghi_ngo: 'nghi ngờ', chac_chan: 'chắc chắn' };
  return Array.from(medicalHistoryGetComponent().queryAll('#drugAllergyBody .allergy-row'))
    .map(row => {
      const name = medicalHistorySummaryText(row.querySelector('.allergy-name')?.value || '');
      if (!name) return '';
      const level = medicalHistorySummaryText(row.querySelector('.allergy-level:checked')?.value || '');
      const symptom = medicalHistorySummaryTruncate(row.querySelector('.allergy-symptom')?.value || '', 45);
      const details = [levelLabels[level], symptom].filter(Boolean);
      return details.length ? `${name} (${details.join(', ')})` : name;
    })
    .filter(Boolean);
}

function medicalHistoryGetCheckedTableSummaryItems(wrapSelector, noteSuffix, noteLimit = 45) {
  return Array.from(medicalHistoryGetComponent().queryAll(`${wrapSelector} input[type="checkbox"]:checked`))
    .map(checkbox => {
      const name = medicalHistorySummaryText(checkbox.dataset.name || checkbox.closest('tr')?.textContent || '');
      if (!name) return '';
      const noteId = checkbox.id ? checkbox.id.replace('_check', noteSuffix) : '';
      const note = medicalHistorySummaryTruncate(medicalHistoryGetComponent().getElement(noteId)?.value || '', noteLimit);
      return note ? `${name} (${note})` : name;
    })
    .filter(Boolean);
}

function medicalHistoryGetRiskSummaryItems() {
  const items = [];
  const levelMap = { thap: 'thấp', trung_binh: 'trung bình', cao: 'cao' };
  const level = medicalHistoryGetComponent().query('input[name="risk_level"]:checked')?.value || '';
  if (level) items.push(`mức độ ${levelMap[level] || level}`);

  [
    { name: 'risk_ideation', label: 'ý tưởng tự sát', noteId: 'risk_ideation_note' },
    { name: 'risk_plan', label: 'kế hoạch tự sát', noteId: 'risk_plan_note' },
    { name: 'risk_intent', label: 'toàn tính tự sát', noteId: 'risk_intent_note' },
    { name: 'risk_sh', label: 'hành vi tự hại', noteId: 'risk_sh_note' }
  ].forEach(config => {
    const checked = medicalHistoryGetComponent().query(`input[name="${config.name}"]:checked`);
    if (!checked || checked.value !== 'co') return;
    const note = medicalHistorySummaryTruncate(medicalHistoryGetComponent().getElement(config.noteId)?.value || '', 45);
    items.push(note ? `${config.label}: có (${note})` : `${config.label}: có`);
  });

  if (!items.length && medicalHistoryGetComponent().query('#riskAssessWrap input[type="radio"]:checked')) {
    items.push('đã đánh giá, chưa ghi nhận nguy cơ nổi bật');
  }
  return items;
}

function medicalHistoryGetSafetySummaryItems() {
  const items = [];
  if (medicalHistorySummaryText(medicalHistoryGetComponent().getElement('safetyPlanNhanDien')?.value || '')) items.push('nhận diện');
  if (medicalHistorySummaryText(medicalHistoryGetComponent().getElement('safetyPlanCachUngPho')?.value || '')) items.push('ứng phó');
  if (medicalHistorySummaryText(medicalHistoryGetComponent().getElement('safetyPlanDongLuc')?.value || '')) items.push('động lực sống');
  const supporterCount = ['safetyPlanSupport1', 'safetyPlanSupport2', 'safetyPlanSupport3']
    .filter(id => medicalHistorySummaryText(medicalHistoryGetComponent().getElement(id)?.value || '')).length;
  if (supporterCount > 0) items.push(`${supporterCount} người hỗ trợ`);
  return items;
}

function medicalHistoryMakeSummarySegment(label, items, limit, tone = 'default') {
  const text = medicalHistorySummaryJoinLimited(items, limit);
  return text ? { label, text, tone } : null;
}

function medicalHistoryBuildWorkbenchSummary() {
  const substanceCodes = medicalHistoryGetCheckedCodes('#substanceTableWrap input[type="checkbox"]:checked');
  const suicideCodes = medicalHistoryGetCheckedCodes('#suicideTableWrap input[type="checkbox"]:checked');
  const personalExcludeCodes = new Set([...substanceCodes, ...suicideCodes]);
  const personalItems = medicalHistoryGetIcdSummaryItems('physHistory', { excludeCodes: personalExcludeCodes });
  const personalText = medicalHistoryGetHistoryTextItem('physHistoryTextInput');
  if (personalText) personalItems.push(personalText);

  const familyItems = medicalHistoryGetIcdSummaryItems('famHistory');
  const familyText = medicalHistoryGetHistoryTextItem('famHistoryTextInput');
  if (familyText) familyItems.push(familyText);

  const segments = [
    medicalHistoryMakeSummarySegment('Bản thân', personalItems, 4, 'personal'),
    medicalHistoryMakeSummarySegment('Gia đình', familyItems, 3, 'family'),
    medicalHistoryMakeSummarySegment('Dị ứng thuốc', medicalHistoryGetAllergySummaryItems(), 2, 'allergy'),
    medicalHistoryMakeSummarySegment('Dùng chất', medicalHistoryGetCheckedTableSummaryItems('#substanceTableWrap', '_time'), 2, 'substance'),
    medicalHistoryMakeSummarySegment('Tự hại', medicalHistoryGetCheckedTableSummaryItems('#suicideTableWrap', '_note'), 2, 'risk'),
    medicalHistoryMakeSummarySegment('Nguy cơ', medicalHistoryGetRiskSummaryItems(), 2, 'risk'),
    medicalHistoryMakeSummarySegment('Kế hoạch an toàn', medicalHistoryGetSafetySummaryItems(), 3, 'safety')
  ].filter(Boolean);

  if (!segments.length) {
    return { text: 'Chưa ghi nhận tiền sử đáng chú ý', segments: [], hiddenSegmentCount: 0 };
  }
  const visibleSegments = segments.slice(0, 4);
  const hiddenSegmentCount = segments.length - visibleSegments.length;
  const text = visibleSegments
    .map(segment => `${segment.label}: ${segment.text}`)
    .concat(hiddenSegmentCount > 0 ? [`+${hiddenSegmentCount} nhóm khác`] : [])
    .join('; ') + '.';
  return { text, segments: visibleSegments, hiddenSegmentCount };
}

function medicalHistoryRenderWorkbenchSummary(summaryTextEl, summary) {
  summaryTextEl.textContent = '';
  summaryTextEl.title = summary.text;

  if (!summary.segments.length) {
    const emptyRow = document.createElement('span');
    emptyRow.className = 'medical-history-workbench-summary__row medical-history-workbench-summary__row--default';

    const emptyLabel = document.createElement('span');
    emptyLabel.className = 'medical-history-workbench-summary__row-label';
    emptyLabel.textContent = 'Hiện trạng';

    const emptyContent = document.createElement('span');
    emptyContent.className = 'medical-history-workbench-summary__row-text';
    emptyContent.textContent = summary.text;

    emptyRow.append(emptyLabel, emptyContent);
    summaryTextEl.appendChild(emptyRow);
    return;
  }

  summary.segments.forEach(segment => {
    const row = document.createElement('span');
    row.className = `medical-history-workbench-summary__row medical-history-workbench-summary__row--${segment.tone || 'default'}`;

    const label = document.createElement('span');
    label.className = 'medical-history-workbench-summary__row-label';
    label.textContent = `${segment.label}:`;

    const content = document.createElement('span');
    content.className = 'medical-history-workbench-summary__row-text';
    content.textContent = segment.text;

    row.append(label, content);
    summaryTextEl.appendChild(row);
  });

  if (summary.hiddenSegmentCount > 0) {
    const more = document.createElement('span');
    more.className = 'medical-history-workbench-summary__row medical-history-workbench-summary__row--more';

    const moreLabel = document.createElement('span');
    moreLabel.className = 'medical-history-workbench-summary__row-label';
    moreLabel.textContent = 'Còn lại:';

    const moreContent = document.createElement('span');
    moreContent.className = 'medical-history-workbench-summary__row-text';
    moreContent.textContent = `+${summary.hiddenSegmentCount} nhóm khác`;

    more.append(moreLabel, moreContent);
    summaryTextEl.appendChild(more);
  }
}

function medicalHistoryUpdateWorkbenchSummary() {
  const root = medicalHistoryGetDoctorWorkbenchRoot();
  if (!root) return;
  const counts = Object.keys(MEDICAL_HISTORY_WORKBENCH_TARGETS).reduce((acc, target) => {
    acc[target] = medicalHistoryGetCountValue(target);
    return acc;
  }, {});
  Object.entries(counts).forEach(([target, count]) => {
    root.querySelectorAll(`[data-medical-history-workbench-count="${target}"]`).forEach(el => {
      el.textContent = String(count);
      el.classList.toggle('has-data', count > 0);
    });
  });
  const summaryTextEl = root.querySelector('[data-medical-history-workbench-summary-text]');
  if (summaryTextEl) {
    const summary = medicalHistoryBuildWorkbenchSummary();
    medicalHistoryRenderWorkbenchSummary(summaryTextEl, summary);
  }
}

function medicalHistorySetWorkbenchPersonalChrome(root, target, config) {
  const isAdvanced = Boolean(config.advanced);
  const title = root.querySelector('[data-medical-history-workbench-title="personal"]');
  if (title) title.textContent = config.title || 'Bản thân';
  root.classList.toggle('is-showing-advanced-history', isAdvanced);
  root.dataset.medicalHistoryWorkbenchActive = target;
}

function medicalHistoryActivateWorkbenchTarget(target) {
  const root = medicalHistoryGetDoctorWorkbenchRoot();
  const config = MEDICAL_HISTORY_WORKBENCH_TARGETS[target] || MEDICAL_HISTORY_WORKBENCH_TARGETS.personal;
  if (!root) return;

  root.querySelectorAll('[data-medical-history-workbench-target]').forEach(button => {
    const active = button.dataset.medicalHistoryWorkbenchTarget === target;
    button.classList.toggle('is-active', active);
    if (active) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  root.querySelectorAll('[data-medical-history-workbench-pane]').forEach(pane => {
    const active = pane.dataset.medicalHistoryWorkbenchPane === config.pane;
    pane.hidden = !active;
    pane.classList.toggle('is-active', active);
  });

  medicalHistorySetWorkbenchPersonalChrome(root, target, config);

  if (config.personalGroup) {
  const tab = medicalHistoryGetComponent().query(`#banThanTabs [data-medical-history-tab-group="${config.personalGroup}"]`);
    medicalHistorySwitchTab(config.personalGroup, tab || null);
  } else {
    medicalHistorySwitchTab('noi-khoa', medicalHistoryGetComponent().query('#banThanTabs [data-medical-history-tab-group="noi-khoa"]') || null);
  }

  medicalHistoryUpdateWorkbenchSummary();
}

function medicalHistoryInitDoctorWorkbench() {
  const root = medicalHistoryGetDoctorWorkbenchRoot();
  if (!root || root.dataset.medicalHistoryWorkbenchBound === 'true') return;
  root.dataset.medicalHistoryWorkbenchBound = 'true';

  const component = medicalHistoryGetComponent();
  component.listen(root, 'click', event => {
    const button = event.target.closest('[data-medical-history-workbench-target]');
    if (!button || !root.contains(button)) return;
    medicalHistoryActivateWorkbenchTarget(button.dataset.medicalHistoryWorkbenchTarget || 'personal');
  });
  component.listen(root, 'input', () => window.setTimeout(medicalHistoryUpdateWorkbenchSummary, 0));
  component.listen(root, 'change', () => window.setTimeout(medicalHistoryUpdateWorkbenchSummary, 0));

  medicalHistoryActivateWorkbenchTarget(root.dataset.medicalHistoryWorkbenchActive || 'personal');
}

function medicalHistorySwitchTab(group, btn) {
  const tabs = btn?.closest?.('.medical-history-tabs') || medicalHistoryGetComponent().getElement('banThanTabs');
  if (tabs) {
    tabs.querySelectorAll('.medical-history-tab-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = btn || tabs.querySelector(`[data-medical-history-tab-group="${group}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }

  medicalHistoryGetComponent().queryAll('#banThanList [data-bt-group]').forEach(el => {
    medicalHistorySetVisible(el, el.dataset.btGroup === group);
  });
  // Show/hide bảng sử dụng chất (nằm ngoài suggestion-box)
  const substanceWrap = medicalHistoryGetComponent().getElement('substanceTableWrap');
  medicalHistorySetVisible(substanceWrap, group === 'loi-song');
  // Show/hide bảng tự sát / tự hại
  const suicideWrap = medicalHistoryGetComponent().getElement('suicideTableWrap');
  medicalHistorySetVisible(suicideWrap, group === 'tu-sat');
  // Show/hide bảng đánh giá nguy cơ
  const riskWrap = medicalHistoryGetComponent().getElement('riskAssessWrap');
  medicalHistorySetVisible(riskWrap, group === 'nguy-co');
  // Show/hide Kế hoạch an toàn
  const safetyPlanVisible = group === 'ke-hoach-an-toan';
  medicalHistoryGetComponent().queryAll('.safety-plan-actions-bar, .safety-plan-fields').forEach(block => {
    medicalHistorySetVisible(block, safetyPlanVisible);
  });
  medicalHistoryUpdateWorkbenchSummary();
}

function medicalHistorySwitchTabGD(group, btn) {
  btn.closest('.medical-history-tabs').querySelectorAll('.medical-history-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  medicalHistoryGetComponent().queryAll('#giaDinhList [data-gd-group]').forEach(el => {
    medicalHistorySetVisible(el, el.dataset.gdGroup === group);
  });
}

function medicalHistoryBanThanFilter(query) {
  const q = query.trim().toLowerCase();
  medicalHistoryGetComponent().queryAll('#banThanList [data-bt-group]').forEach(grp => medicalHistorySetVisible(grp, true));
  if (!q) return;
  medicalHistoryGetComponent().queryAll('#banThanList .medical-history-suggestion-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// medicalHistoryBanThanKeydown đã được xóa — field BẢN THÂN không còn cho phép nhập text tự do

function medicalHistoryGiaDinhFilter(query) {
  const q = query.trim().toLowerCase();
  medicalHistoryGetComponent().queryAll('#giaDinhList [data-gd-group]').forEach(grp => medicalHistorySetVisible(grp, true));
  if (!q) return;
  medicalHistoryGetComponent().queryAll('#giaDinhList .medical-history-suggestion-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

medicalHistoryGetComponent().registerActions({
  getDoctorWorkbenchRoot: medicalHistoryGetDoctorWorkbenchRoot,
  getWorkbenchSelectedICDs: medicalHistoryGetWorkbenchSelectedICDs,
  updateWorkbenchSummary: medicalHistoryUpdateWorkbenchSummary,
  activateWorkbenchTarget: medicalHistoryActivateWorkbenchTarget,
  initDoctorWorkbench: medicalHistoryInitDoctorWorkbench,
  switchTab: medicalHistorySwitchTab,
  switchFamilyTab: medicalHistorySwitchTabGD,
  banThanFilter: medicalHistoryBanThanFilter,
  giaDinhFilter: medicalHistoryGiaDinhFilter
});
