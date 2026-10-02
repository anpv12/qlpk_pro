import { el, replace } from '../shared/dom.js';
import {
  callAction as medicalHistoryCallAction,
  getComponent as medicalHistoryGetComponent,
  getJsonHeaders as medicalHistoryGetJsonHeaders
} from './medical-history-context.js';

/* ══════════════════════════════════════════════════════════════════
   DỊ ỨNG THUỐC
   ══════════════════════════════════════════════════════════════════ */

let _allergyRowCounter = 0;
let _allergyActiveTab = 'all';

function normalizeAllergySearchText(value) {
  return window.QLPKSearchNormalization?.normalizeSearchText(value)
    || String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
}

function medicalHistoryGetAllergyRowLevel(row) {
  const levelRadio = row?.querySelector?.('.allergy-level:checked');
  return levelRadio ? levelRadio.value : '';
}

function medicalHistoryApplyAllergyFilter() {
  const filter = _allergyActiveTab || 'all';
  medicalHistoryGetComponent().queryAll('#drugAllergyBody .allergy-row').forEach(row => {
    const shouldHide = filter !== 'all' && medicalHistoryGetAllergyRowLevel(row) !== filter;
    row.classList.toggle('medical-history-allergy-row--filtered', shouldHide);
  });
}

function medicalHistorySwitchAllergyTab(filter, btn) {
  _allergyActiveTab = filter || 'all';
  const tabs = btn?.closest?.('.medical-history-tabs') || medicalHistoryGetComponent().getElement('drugAllergyTabs');
  if (tabs) {
    tabs.querySelectorAll('.medical-history-tab-btn').forEach(tab => {
      const isActive = tab === btn || tab.dataset.allergyTab === _allergyActiveTab;
      tab.classList.toggle('active', isActive);
    });
  }
  medicalHistoryApplyAllergyFilter();
}

function medicalHistoryAddAllergyRow(name, level, symptom) {
  const tbody = medicalHistoryGetComponent().getElement('drugAllergyBody');
  if (!tbody) return null;
  const idx = _allergyRowCounter++;
  const tr = document.createElement('tr');
  tr.className = 'allergy-row';
  tr.dataset.idx = idx;
  const levelCell = value => el('td', { class: 'text-center' },
    el('label', { class: 'medical-history-radio-wrap' },
      el('input', { type: 'radio', class: 'allergy-level', name: `allergy_level_${idx}`, value, checked: level === value }),
      el('span', { class: 'medical-history-radio-dot' })));
  replace(tr,
    el('td', null, el('div', { class: 'allergen-ac-wrap' },
      el('input', { type: 'text', class: 'medical-history-allergy-input allergy-name allergen-ac-input', placeholder: 'Tên thuốc / dị nguyên...', defaultValue: name || '', autocomplete: 'off' }),
      el('div', { class: 'allergen-ac-dropdown' }))),
    levelCell('nghi_ngo'),
    levelCell('chac_chan'),
    el('td', null, el('input', { type: 'text', class: 'medical-history-allergy-input allergy-symptom', placeholder: 'Biểu hiện...', defaultValue: symptom || '' })),
    el('td', { class: 'text-center' }, el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'medical-history-row-remove', title: 'Xóa dòng' }, '×')));
  tbody.appendChild(tr);
  const removeButton = tr.querySelector('.medical-history-row-remove');
  if (removeButton) removeButton.dataset.medicalHistoryAction = 'remove-allergy-row';
  if(typeof bindAllergyAutocomplete === 'function') {
      bindAllergyAutocomplete(tr.querySelector('.allergen-ac-input'));
  }
  medicalHistoryApplyAllergyFilter();
  return tr;
}

function medicalHistoryRemoveAllergyRow(btn) {
  const row = btn.closest('tr');
  if (row) row.remove();
  medicalHistoryAllergyRebuildChips();
  medicalHistoryAllergySync();
}

function medicalHistoryAllergyChipKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const input = e.target;
    const name = (input.value || '').trim();
    if (!name) return;
    medicalHistoryAddAllergyRow(name, '', '');
    input.value = '';
    medicalHistoryAllergyRebuildChips();
    medicalHistoryAllergySync();
  }
}

function medicalHistoryAllergyRebuildChips() {
  const chipArea = medicalHistoryGetComponent().getElement('drugAllergyChips');
  const input = medicalHistoryGetComponent().getElement('drugAllergyInput');
  if (!chipArea || !input) return;

  chipArea.querySelectorAll('.medical-history-chip-row').forEach(c => c.remove());
  chipArea.querySelectorAll('.medical-history-chip--allergy').forEach(c => c.remove());

  const nghi = [], chac = [], other = [];
  medicalHistoryGetComponent().queryAll('#drugAllergyBody .allergy-row').forEach(row => {
    const name = row.querySelector('.allergy-name')?.value?.trim() || '';
    if (!name) return;
    const levelRadio = row.querySelector('.allergy-level:checked');
    const level = levelRadio ? levelRadio.value : '';
    if (level === 'nghi_ngo') nghi.push(name);
    else if (level === 'chac_chan') chac.push(name);
    else other.push(name);
  });

  function makeRow(label, items, cssClass) {
    if (!items.length) return;
    const row = document.createElement('div');
    row.className = 'medical-history-chip-row';
    const lbl = document.createElement('span');
    lbl.className = 'medical-history-chip-row-label ' + cssClass;
    lbl.textContent = label + ':';
    row.appendChild(lbl);
    items.forEach(name => {
      const chip = document.createElement('span');
      chip.className = 'medical-history-chip--allergy ' + cssClass;
      chip.textContent = name;
      row.appendChild(chip);
    });
    chipArea.insertBefore(row, input);
  }

  makeRow('Nghi ngờ', nghi, 'allergy-nghi');
  makeRow('Chắc chắn', chac, 'allergy-chac');
  other.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'medical-history-chip--allergy';
    chip.textContent = name;
    chipArea.insertBefore(chip, input);
  });
  medicalHistoryApplyAllergyFilter();
}

function medicalHistoryGetAllergyValue() {
	const entries = [];
	medicalHistoryGetComponent().queryAll('#drugAllergyBody .allergy-row').forEach(row => {
		const name = row.querySelector('.allergy-name')?.value?.trim() || '';
		if (!name) return;
		const levelRadio = row.querySelector('.allergy-level:checked');
		const level = levelRadio ? levelRadio.value : '';
		const symptom = row.querySelector('.allergy-symptom')?.value?.trim() || '';
		entries.push({ name, level, symptom });
	});
	return entries;
}

let _allergySyncTimer = null;
function medicalHistoryClearMedicalHistoryTimers() {
  clearTimeout(_allergySyncTimer);
  _allergySyncTimer = null;
  medicalHistoryCallAction('clearRiskSyncTimer');
}

function medicalHistoryHasPendingMedicalHistoryChanges() {
  return Boolean(_allergySyncTimer || medicalHistoryCallAction('hasPendingRiskSync'));
}

function medicalHistoryAllergySync() {
  const val = medicalHistoryGetAllergyValue();
  medicalHistoryCallAction('updateWorkbenchSummary');
  clearTimeout(_allergySyncTimer);
  _allergySyncTimer = setTimeout(() => {
		medicalHistoryGetComponent().emitChange('drugAllergyBody', 'allergies', val);
  }, 500);
}

function medicalHistoryRestoreAllergy(entries) {
  const tbody = medicalHistoryGetComponent().getElement('drugAllergyBody');
  if (!tbody) return;
  tbody.replaceChildren();
  _allergyRowCounter = 0;
  const chipArea = medicalHistoryGetComponent().getElement('drugAllergyChips');
  if (chipArea) chipArea.querySelectorAll('.medical-history-chip, .medical-history-chip-row').forEach(c => c.remove());
  const drugInput = medicalHistoryGetComponent().getElement('drugAllergyInput');
  if (drugInput) drugInput.value = '';

	if (!Array.isArray(entries)) return;

	entries.forEach(entry => {
		const name = String(entry?.name || '').trim();
		if (name) medicalHistoryAddAllergyRow(name, entry?.level || '', entry?.symptom || '');
	});

  medicalHistoryAllergyRebuildChips();
  medicalHistoryApplyAllergyFilter();
}
/* ══════════════════════════════════════════════════════════════════
   ALLERGEN AUTOCOMPLETE — Doctor medical-history owner
   ══════════════════════════════════════════════════════════════════ */

function bindAllergyAutocomplete(input) {
  if (!input) return;
  const wrap = input.closest('.allergen-ac-wrap');
  const dropdown = wrap.querySelector('.allergen-ac-dropdown');
  let timer;

  function positionDropdown() {
    const rect = input.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = (rect.bottom + 2) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
  }

  input.addEventListener('focus', function () {
    positionDropdown();
    fetchAllergenSuggestions(this.value.trim(), input, dropdown, positionDropdown);
  });

  input.addEventListener('input', function () {
    clearTimeout(timer);
    positionDropdown();
    timer = setTimeout(() => fetchAllergenSuggestions(this.value.trim(), input, dropdown, positionDropdown), 280);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') dropdown.style.display = 'none';
  });

  input.addEventListener('blur', function () {
    setTimeout(() => { dropdown.style.display = 'none'; }, 180);
  });
}

async function fetchAllergenSuggestions(q, input, dropdown, positionDropdown) {
  try {
    const url = q
      ? `/api/allergen?search=${encodeURIComponent(q)}&page=1&limit=10`
      : `/api/allergen?page=1&limit=10`;
    const res = await fetch(url, { method: 'GET', headers: medicalHistoryGetJsonHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    dropdown.replaceChildren();
    const items = data.data || [];
    const exactMatch = q && items.some(i => normalizeAllergySearchText(i.ten_di_nguyen) === normalizeAllergySearchText(q));

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'allergen-ac-item';
      div.textContent = item.ten_di_nguyen;
      div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        input.value = item.ten_di_nguyen;
        dropdown.style.display = 'none';
        medicalHistoryAllergyRebuildChips();
        medicalHistoryAllergySync();
      });
      dropdown.appendChild(div);
    });

    if (q && !exactMatch) {
      const createDiv = document.createElement('div');
      createDiv.className = 'allergen-ac-item allergen-ac-create';
      replace(createDiv, el('i', { class: 'fas fa-plus allergen-ac-create-icon' }), 'Thêm "', el('b', null, q), '" vào danh mục');
      createDiv.addEventListener('mousedown', async function (e) {
        e.preventDefault();
        await createAndSelectAllergen(q, input, dropdown);
      });
      dropdown.appendChild(createDiv);
    }

    if (positionDropdown) positionDropdown();
    dropdown.style.display = (items.length > 0 || (q && !exactMatch)) ? 'block' : 'none';
  } catch (err) {
    console.error('[Allergen AC] fetch error:', err);
  }
}

async function createAndSelectAllergen(name, input, dropdown) {
  try {
    const res = await fetch('/api/allergen', {
      method: 'POST',
      headers: medicalHistoryGetJsonHeaders(),
      body: JSON.stringify({ ten_di_nguyen: name, mo_ta: '' })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success || data.data) {
      input.value = name;
      dropdown.style.display = 'none';
      medicalHistoryAllergyRebuildChips();
      medicalHistoryAllergySync();
    }
  } catch (err) {
    console.error('[Allergen AC] create error:', err);
  }
}

medicalHistoryGetComponent().registerActions({
  getAllergyRowLevel: medicalHistoryGetAllergyRowLevel,
  applyAllergyFilter: medicalHistoryApplyAllergyFilter,
  switchAllergyTab: medicalHistorySwitchAllergyTab,
  addAllergyRow: medicalHistoryAddAllergyRow,
  removeAllergyRow: medicalHistoryRemoveAllergyRow,
  allergyChipKeydown: medicalHistoryAllergyChipKeydown,
  rebuildAllergyChips: medicalHistoryAllergyRebuildChips,
  getAllergyValue: medicalHistoryGetAllergyValue,
  clearMedicalHistoryTimers: medicalHistoryClearMedicalHistoryTimers,
  hasPendingMedicalHistoryChanges: medicalHistoryHasPendingMedicalHistoryChanges,
  allergySync: medicalHistoryAllergySync,
  restoreAllergy: medicalHistoryRestoreAllergy,
  bindAllergyAutocomplete,
  fetchAllergenSuggestions,
  createAndSelectAllergen
});
