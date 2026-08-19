(function (window, document) {
  'use strict';

  const REGISTRY = window.QLPKDoctorModuleRegistry;
  if (!REGISTRY) throw new Error('Thiếu Doctor module registry');

  function normalizeDefaultPayload(payload = {}) {
    const history = payload.medical_history || {};
    const historyPatient = history.patient || {};
    const historyExamination = history.examination || {};
    const previousExamination = history.previous_examination || {};
    return {
      patientId: historyPatient.id || null,
      physicalHistory: historyPatient.physical_history || [],
      familyHistory: historyPatient.family_history || [],
      allergies: Array.isArray(historyPatient.allergies) ? historyPatient.allergies : [],
      riskAssessment: historyExamination.risk_assessment || {},
      previousRiskAssessment: previousExamination.risk_assessment || {},
      substanceUseHistory: historyPatient.substance_use_history || {},
      safetyPlan: historyPatient.safety_plan || {}
    };
  }

  function create(options = {}) {
    const suppliedConfig = options.config || {};
    const component = options.component
      || REGISTRY.get('medicalHistoryForm')?.getOrCreate?.(suppliedConfig);
    if (!component) throw new Error('Thiếu medical history form component');
    const icd = component.getFeature('icd');
    if (!icd) throw new Error('Thiếu medical history ICD feature');

    function collectSubstanceUseHistory() {
      const fields = REGISTRY.get('medicalHistorySubstanceFields');
      if (!fields || typeof fields.collect !== 'function') return {};
      return fields.collect({
        document,
        substanceIds: component.config.substanceIds
      });
    }

    function bindHistoryFreeTextInputs() {
      component.config.historyModes.forEach(mode => {
        const modeConfig = component.config.modeConfig[mode];
        const input = component.getElement(modeConfig?.textInputId);
        if (!input || input.dataset.medicalHistoryFormBound === 'true') return;
        component.listen(input, 'input', () => {
          if (mode === 'physHistory') {
            component.callAction('serializeBanThan');
            component.callAction('emitBanThanChange');
          }
          if (mode === 'famHistory') {
            component.callAction('serializeGiaDinh');
            component.callAction('emitGiaDinhChange');
          }
        });
        input.dataset.medicalHistoryFormBound = 'true';
      });
    }

    function bindSubstanceUseFields() {
      const wrap = component.getElement('substanceTableWrap');
      if (!wrap || wrap.dataset.medicalHistoryFormBound === 'true') return;
      const fields = REGISTRY.get('medicalHistorySubstanceFields');
      if (fields && typeof fields.bind === 'function') {
        fields.bind({
          document,
          substanceIds: component.config.substanceIds
        });
      }
      component.listen(wrap, 'change', () => component.markDirty());
      component.listen(wrap, 'blur', event => {
        if (event.target instanceof window.HTMLInputElement
          && event.target.classList.contains('medical-history-sub-input')) {
          component.markDirty();
        }
      }, true);
      wrap.dataset.medicalHistoryFormBound = 'true';
    }

    function resetSubstanceUseFields() {
      const fields = REGISTRY.get('medicalHistorySubstanceFields');
      if (fields && typeof fields.reset === 'function') {
        fields.reset({
          document,
          substanceIds: component.config.substanceIds
        });
      }
    }

    function populateSubstanceUseFields(value) {
      const fields = REGISTRY.get('medicalHistorySubstanceFields');
      if (fields && typeof fields.populate === 'function') {
        fields.populate(value || {}, {
          document,
          substanceIds: component.config.substanceIds
        });
      }
    }

    function restoreSafetyPlanSupporters(plan = {}) {
      const supporters = Array.isArray(plan.nguoi_ho_tro) ? plan.nguoi_ho_tro : [];
      supporters.forEach(supporter => {
        const order = Number(supporter && supporter.order);
        const select = component.getElement(`safetyPlanSupport${order}`);
        if (select && supporter && supporter.member_id) select.value = String(supporter.member_id);
      });
    }

    component.registerActions({
      bindHistoryFreeTextInputs,
      bindSubstanceUseFields,
      collectSubstanceUseHistory,
      resetSubstanceUseFields,
      populateSubstanceUseFields,
      restoreSafetyPlanSupporters
    });

    component.init();

    return {
      init: () => component.init(),
      clear: () => component.clear(),
      populate: payload => {
        const normalize = component.config.normalizePayload || normalizeDefaultPayload;
        return component.populate(normalize(payload));
      },
      hasPendingChanges: () => component.hasPendingChanges(),
      getSavePayload: () => component.getSavePayload(),
      getSaveRevision: () => component.getSaveRevision(),
      markSaved: revision => component.markSaved(revision),
      getDraftSnapshot: () => component.getDraftSnapshot(),
      restoreDraftSnapshot: (snapshot, restoreOptions) => component.restoreDraftSnapshot(snapshot, restoreOptions),
      getContextToken: () => component.getContextToken(),
      getComponent: () => component,
      getConfig: () => component.getConfig()
    };
  }

	const doctorBridge = create({
		config: REGISTRY.get('doctorComponentConfig')?.history || {}
	});
	REGISTRY.register('medicalHistoryBridge', Object.assign(doctorBridge, { create }));
})(window, document);
