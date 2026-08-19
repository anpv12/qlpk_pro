/* Doctor medical-history event owner.
 * Markup declares intent with data-* attributes; this file owns dispatch.
 */
(function (window, document) {
  'use strict';

  const component = new Proxy({}, {
    get(_target, property) {
      const active = window.QLPKDoctorModuleRegistry.get('medicalHistoryForm')?.getActive?.();
      const value = active?.[property];
      return typeof value === 'function' ? value.bind(active) : value;
    }
  });

  function getAction(name) {
    return component.actions && component.actions[name];
  }

  function callAction(name, ...args) {
    const action = getAction(name);
    if (typeof action !== 'function') return undefined;
    try {
      const result = action(...args);
      if (result && typeof result.catch === 'function') result.catch(error => console.error(`[MedicalHistory] ${name}`, error));
      return result;
    } catch (error) {
      console.error(`[MedicalHistory] ${name}`, error);
      return undefined;
    }
  }

  function getActionTarget(event, allowLabelFallback = true) {
    const origin = event.target instanceof Element ? event.target : null;
    if (!origin) return null;
    const direct = origin.closest('[data-medical-history-action], [data-safety-plan-action]');
    if (direct) return direct;
    if (!allowLabelFallback) return null;
    const label = origin.closest('label');
    return label ? label.querySelector('[data-medical-history-action], [data-safety-plan-action]') : null;
  }

  function isMedicalHistoryTarget(target) {
    return Boolean(target && target.closest('.inline-tien-su'));
  }

  function handleRiskRadioClick(target) {
    if (!target.matches('input[type="radio"][name^="risk_"]')) return false;

    const wasChecked = target.dataset.wasChecked === 'true';
    if (wasChecked) {
      target.checked = false;
      target.dataset.wasChecked = 'false';
      if (target.name !== 'risk_level') {
        const noteId = target.dataset.riskNote || `${target.name}_note`;
        const note = component.getElement(noteId);
        if (note) {
          note.disabled = true;
          note.value = '';
        }
      }
      callAction('riskSync');
      // Native label activation can replay the click after delegation; keep the explicit uncheck authoritative.
      window.setTimeout(() => {
        target.checked = false;
        target.dataset.wasChecked = 'false';
      }, 0);
      return true;
    }

    component.queryAll('input[type="radio"][name^="risk_"]').forEach(radio => {
      if (radio.name === target.name) radio.dataset.wasChecked = 'false';
    });
    target.dataset.wasChecked = 'true';
    return false;
  }

  function onClick(event) {
    const target = getActionTarget(event, false);
    if (!isMedicalHistoryTarget(target)) return;
    if (handleRiskRadioClick(target)) {
      event.preventDefault();
      return;
    }

    const medicalHistoryAction = target.dataset.medicalHistoryAction;
    const safetyPlanAction = target.dataset.safetyPlanAction;
    if (safetyPlanAction === 'print') {
      event.preventDefault();
      callAction('printTemplate');
      return;
    }
    if (safetyPlanAction === 'open-file') {
      callAction('openFile', event);
      return;
    }

    switch (medicalHistoryAction) {
      case 'toggle-panel':
        callAction('toggleMedicalHistoryPanel');
        break;
      case 'switch-tab':
        callAction('switchTab', target.dataset.medicalHistoryTabGroup, target);
        break;
      case 'switch-family-tab':
        callAction('switchFamilyTab', target.dataset.medicalHistoryFamilyTab, target);
        break;
      case 'switch-allergy-tab':
        callAction('switchAllergyTab', target.dataset.allergyTab, target);
        break;
      case 'focus-allergy-input':
        component.getElement('drugAllergyInput')?.focus();
        break;
      case 'add-allergy-row':
        component.markDirty();
        callAction('addAllergyRow', '', '', '');
        break;
      case 'remove-allergy-row':
        component.markDirty();
        callAction('removeAllergyRow', target);
        break;
      case 'toggle-personal-history':
        component.markDirty();
        callAction('togglePersonalHistory', target, Number(target.dataset.id));
        break;
      case 'toggle-family-history':
        component.markDirty();
        callAction('toggleFamilyHistory', target, Number(target.dataset.id));
        break;
      default:
        break;
    }
  }

  function onChange(event) {
    const target = event.target;
    if (!(target instanceof Element) || !isMedicalHistoryTarget(target)) return;

    if (target.matches('#drugAllergyBody .allergy-level')) {
      callAction('rebuildAllergyChips');
      callAction('allergySync');
    }

    const medicalHistoryAction = target.dataset.medicalHistoryAction;
    const safetyPlanAction = target.dataset.safetyPlanAction;
    if (safetyPlanAction === 'upload') {
      callAction('handleUpload', target);
      return;
    }
    if (medicalHistoryAction === 'substance-toggle') {
      callAction('substanceToggleChip', target, target.dataset.icd || '', target.dataset.name || '');
    } else if (medicalHistoryAction === 'suicide-toggle') {
      callAction('suicideToggleChip', target, target.dataset.icd || '', target.dataset.name || '');
    } else if (medicalHistoryAction === 'risk-toggle') {
      callAction('riskToggle', target.name, target.dataset.riskNote, target.dataset.riskEnableNote === 'true');
    } else if (medicalHistoryAction === 'risk-sync') {
      callAction('riskSync');
    }
  }

  function onInput(event) {
    const target = event.target;
    if (!(target instanceof Element) || !isMedicalHistoryTarget(target)) return;
    if (target.dataset.medicalHistoryAction === 'risk-sync') callAction('riskSync');
  }

  function onKeydown(event) {
    const target = getActionTarget(event);
    if (!isMedicalHistoryTarget(target)) return;

    if (target.dataset.medicalHistoryAction === 'allergy-keydown') {
      callAction('allergyChipKeydown', event);
      return;
    }
  }

  function onBlur(event) {
    const target = event.target;
    if (!(target instanceof Element) || !isMedicalHistoryTarget(target)) return;

    if (target.matches('#drugAllergyBody .allergy-name, #drugAllergyBody .allergy-symptom')) {
      callAction('rebuildAllergyChips');
      callAction('allergySync');
    }

    const suicideNoteIds = new Set([
      'suicide_ideation_note', 'suicide_poison_note', 'suicide_hang_note',
      'suicide_sharp_note', 'suicide_jump_note', 'suicide_trauma_note',
      'suicide_violence_note'
    ]);
    if (suicideNoteIds.has(target.id)) {
      const checkbox = component.getElement(target.id.replace('_note', '_check'));
      if (checkbox?.checked) {
        callAction('serializeBanThan');
        callAction('emitBanThanChange');
      }
    }
  }

  function bind() {
    if (component.state.eventsBoundByFeature === true) return;
    component.state.eventsBoundByFeature = true;
    component.listen(component.root, 'click', onClick, true);
    component.listen(component.root, 'change', event => {
      component.markDirty();
      onChange(event);
    });
    component.listen(component.root, 'input', event => {
      component.markDirty();
      onInput(event);
    });
    component.listen(component.root, 'keydown', onKeydown);
    component.listen(component.root, 'blur', onBlur, true);
    callAction('initMedicalHistoryPanelToggle');
    callAction('initDoctorWorkbench');
    callAction('loadAllIcds');
  }

  component.registerActions({ bindEvents: bind });
})(window, document);
