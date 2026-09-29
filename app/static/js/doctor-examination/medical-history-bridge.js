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

  function installHistoryBridgeFns1(ctx) {
  	function collectSubstanceUseHistory() {
  	  const fields = REGISTRY.get('medicalHistorySubstanceFields');
  	  if (!fields || typeof fields.collect !== 'function') return {};
  	  return fields.collect({
  	    document,
  	    substanceIds: ctx.component.config.substanceIds
  	  });
  	}

  	function bindHistoryFreeTextInputs() {
  	  ctx.component.config.historyModes.forEach(mode => {
  	    const modeConfig = ctx.component.config.modeConfig[mode];
  	    const input = ctx.component.getElement(modeConfig?.textInputId);
  	    if (!input || input.dataset.medicalHistoryFormBound === 'true') return;
  	    ctx.component.listen(input, 'input', () => {
  	      if (mode === 'physHistory') {
  	        ctx.component.callAction('serializeBanThan');
  	        ctx.component.callAction('emitBanThanChange');
  	      }
  	      if (mode === 'famHistory') {
  	        ctx.component.callAction('serializeGiaDinh');
  	        ctx.component.callAction('emitGiaDinhChange');
  	      }
  	    });
  	    input.dataset.medicalHistoryFormBound = 'true';
  	  });
  	}

  	function bindSubstanceUseFields() {
  	  const wrap = ctx.component.getElement('substanceTableWrap');
  	  if (!wrap || wrap.dataset.medicalHistoryFormBound === 'true') return;
  	  const fields = REGISTRY.get('medicalHistorySubstanceFields');
  	  if (fields && typeof fields.bind === 'function') {
  	    fields.bind({
  	      document,
  	      substanceIds: ctx.component.config.substanceIds
  	    });
  	  }
  	  ctx.component.listen(wrap, 'change', () => ctx.component.markDirty());
  	  ctx.component.listen(wrap, 'blur', event => {
  	    if (event.target instanceof window.HTMLInputElement
  	      && event.target.classList.contains('medical-history-sub-input')) {
  	      ctx.component.markDirty();
  	    }
  	  }, true);
  	  wrap.dataset.medicalHistoryFormBound = 'true';
  	}

  	function resetSubstanceUseFields() {
  	  const fields = REGISTRY.get('medicalHistorySubstanceFields');
  	  if (fields && typeof fields.reset === 'function') {
  	    fields.reset({
  	      document,
  	      substanceIds: ctx.component.config.substanceIds
  	    });
  	  }
  	}

  	Object.assign(ctx, { collectSubstanceUseHistory, bindHistoryFreeTextInputs, bindSubstanceUseFields, resetSubstanceUseFields });
  }

  function installHistoryBridgeFns2(ctx) {
  	function populateSubstanceUseFields(value) {
  	  const fields = REGISTRY.get('medicalHistorySubstanceFields');
  	  if (fields && typeof fields.populate === 'function') {
  	    fields.populate(value || {}, {
  	      document,
  	      substanceIds: ctx.component.config.substanceIds
  	    });
  	  }
  	}

  	function restoreSafetyPlanSupporters(plan = {}) {
  	  const supporters = Array.isArray(plan.nguoi_ho_tro) ? plan.nguoi_ho_tro : [];
  	  supporters.forEach(supporter => {
  	    const order = Number(supporter && supporter.order);
  	    const select = ctx.component.getElement(`safetyPlanSupport${order}`);
  	    if (select && supporter && supporter.member_id) select.value = String(supporter.member_id);
  	  });
  	}

  	Object.assign(ctx, { populateSubstanceUseFields, restoreSafetyPlanSupporters });
  }

  function create(options = {}) {
    const ctx = {};
    installHistoryBridgeFns1(ctx);
    installHistoryBridgeFns2(ctx);

    const suppliedConfig = options.config || {};
    ctx.component = options.component
      || REGISTRY.get('medicalHistoryForm')?.getOrCreate?.(suppliedConfig);
    if (!ctx.component) throw new Error('Thiếu medical history form component');
    const icd = ctx.component.getFeature('icd');
    if (!icd) throw new Error('Thiếu medical history ICD feature');

    ctx.component.registerActions({
      bindHistoryFreeTextInputs: ctx.bindHistoryFreeTextInputs,
      bindSubstanceUseFields: ctx.bindSubstanceUseFields,
      collectSubstanceUseHistory: ctx.collectSubstanceUseHistory,
      resetSubstanceUseFields: ctx.resetSubstanceUseFields,
      populateSubstanceUseFields: ctx.populateSubstanceUseFields,
      restoreSafetyPlanSupporters: ctx.restoreSafetyPlanSupporters
    });

    ctx.component.init();

    return {
      init: () => ctx.component.init(),
      clear: () => ctx.component.clear(),
      populate: payload => {
        const normalize = ctx.component.config.normalizePayload || normalizeDefaultPayload;
        return ctx.component.populate(normalize(payload));
      },
      hasPendingChanges: () => ctx.component.hasPendingChanges(),
      getSavePayload: () => ctx.component.getSavePayload(),
      getSaveRevision: () => ctx.component.getSaveRevision(),
      markSaved: revision => ctx.component.markSaved(revision),
      getDraftSnapshot: () => ctx.component.getDraftSnapshot(),
      restoreDraftSnapshot: (snapshot, restoreOptions) => ctx.component.restoreDraftSnapshot(snapshot, restoreOptions),
      getContextToken: () => ctx.component.getContextToken(),
      getComponent: () => ctx.component,
      getConfig: () => ctx.component.getConfig()
    };
  }

	const doctorBridge = create({
		config: REGISTRY.require('doctorComponentConfig').history || {}
	});
	REGISTRY.register('medicalHistoryBridge', Object.assign(doctorBridge, { create }));
})(window, document);
