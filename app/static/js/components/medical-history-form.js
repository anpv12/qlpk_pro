(function (window, document) {
  'use strict';

  const DEFAULT_MODE_CONFIG = {
    physHistory: {
      containerId: 'physHistoryContainer',
      textInputId: 'physHistoryTextInput',
      hiddenId: 'patientPhysicalHistory',
      fieldName: 'physical_history'
    },
    famHistory: {
      containerId: 'famHistoryContainer',
      textInputId: 'famHistoryTextInput',
      hiddenId: 'patientFamilyHistory',
      fieldName: 'family_history'
    }
  };
  const DEFAULT_HISTORY_MODES = ['physHistory', 'famHistory'];
  const DEFAULT_SUBSTANCE_IDS = [
    'tobacco', 'alcohol', 'cannabis', 'cocaine', 'stimulants',
    'inhalants', 'sedatives', 'hallucinogens', 'opioids', 'other_substance'
  ];

	let activeInstance = null;
	const instances = new WeakMap();
	const actionBlueprint = Object.create(null);
	const featureBlueprint = Object.create(null);

	function resolveRoot(root, sourceDocument = document) {
		if (root instanceof window.Element) return root;
		if (typeof root === 'string') return sourceDocument.querySelector(root);
		return sourceDocument.querySelector('[data-medical-history-root]');
	}

	function create(options = {}) {
		const sourceDocument = options.document || document;
		const configuredRoot = options.root || (options.rootId ? `#${options.rootId}` : null);
		const root = resolveRoot(configuredRoot, sourceDocument);
		if (!root) return null;

    const state = {
      initialized: false,
      eventsBound: false,
      contextToken: 0,
      suppressHistoryEmit: false,
      isHydrating: false,
      recoveryDirty: false,
      manualDirty: false,
      manualRevision: 0,
      components: Object.create(null),
      features: Object.create(null),
      icdLookup: Object.create(null),
      safetyPlan: { familyMembers: [] },
      actions: Object.create(null),
      cleanups: []
    };

		const modeConfig = Object.keys({ ...DEFAULT_MODE_CONFIG, ...(options.modeConfig || {}) }).reduce((result, mode) => {
			result[mode] = { ...DEFAULT_MODE_CONFIG[mode], ...(options.modeConfig?.[mode] || {}) };
			return result;
		}, {});
		const config = {
			root,
			modeConfig,
			historyModes: Array.isArray(options.historyModes) ? options.historyModes.slice() : DEFAULT_HISTORY_MODES.slice(),
			substanceIds: Array.isArray(options.substanceIds) ? options.substanceIds.slice() : DEFAULT_SUBSTANCE_IDS.slice(),
				isLoading: typeof options.isLoading === 'function' ? options.isLoading : null,
				onDataChanged: typeof options.onDataChanged === 'function' ? options.onDataChanged : null,
				pageRuntime: options.pageRuntime || options.runtime || null,
				getPatientId: typeof options.getPatientId === 'function' ? options.getPatientId : null,
				normalizePayload: typeof options.normalizePayload === 'function' ? options.normalizePayload : null
		};

    const component = {
      root,
      state,
      config,
      actions: state.actions,

			registerActions(actions) {
				Object.assign(state.actions, actions || {});
				Object.assign(actionBlueprint, actions || {});
				return this;
			},

			registerFeature(name, feature) {
				if (name) state.features = state.features || Object.create(null);
				if (name) {
					state.features[name] = feature;
					featureBlueprint[name] = feature;
				}
				return this;
			},

      getFeature(name) {
        return state.features?.[name] || null;
      },

      getAction(name) {
        return state.actions[name];
      },

			callAction(name, ...args) {
				this.activate();
				const action = this.getAction(name);
				return typeof action === 'function' ? action(...args) : undefined;
			},

			activate() {
				activeInstance = this;
				return this;
			},

      getElement(id) {
        if (!id) return null;
        if (root.id === id) return root;
        return root.querySelector(`#${id}`);
      },

      query(selector) {
        if (!selector) return null;
        return root.matches(selector) ? root : root.querySelector(selector);
      },

      queryAll(selector) {
        return selector ? Array.from(root.querySelectorAll(selector)) : [];
      },

      setElementValue(id, value) {
        const element = this.getElement(id);
        if (element) element.value = value === undefined || value === null ? '' : String(value);
        return element;
      },

			listen(target, eventName, handler, options) {
				if (!target || typeof target.addEventListener !== 'function') return false;
				const scopedHandler = event => {
					this.activate();
					return handler(event);
				};
				target.addEventListener(eventName, scopedHandler, options);
				state.cleanups.push(() => target.removeEventListener(eventName, scopedHandler, options));
				return true;
			},

		isLoading() {
				return Boolean(config.isLoading?.() || state.isHydrating);
      },

      textValue(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
      },

      markDirty() {
        if (this.isLoading() || state.suppressHistoryEmit) return false;
        state.manualRevision += 1;
        state.manualDirty = true;
        return true;
      },

      emitChange(fieldId, apiFieldName, value) {
        this.markDirty();
        if (typeof config.onDataChanged === 'function') {
          config.onDataChanged({ fieldId, apiFieldName, value, component: this });
        }
      },

      init() {
        if (state.initialized) return true;
        this.bind();
        this.callAction('ensureSelectedICDs');
        this.callAction('setupICDMultiSelect', 'physHistory', 'physHistory');
        this.callAction('setupICDMultiSelect', 'famHistory', 'famHistory');
        this.callAction('bindHistoryFreeTextInputs');
        this.callAction('bindSubstanceUseFields');
        this.callAction('bindEvents');
        state.initialized = true;
        return true;
      },

      bind() {
        if (state.eventsBound) return true;
        state.eventsBound = true;
        return true;
      },

      clear() {
        state.contextToken += 1;
        state.isHydrating = false;
        state.recoveryDirty = false;
        state.manualDirty = false;
        state.manualRevision = 0;
        this.callAction('clearMedicalHistoryTimers');

        state.suppressHistoryEmit = true;
        config.historyModes.forEach(mode => {
          this.callAction('clearSelectedICD', mode);
          const modeConfig = config.modeConfig[mode];
          this.setElementValue(modeConfig?.textInputId, '');
          this.setElementValue(modeConfig?.hiddenId, '');
          this.callAction('updateSelectedICDTags', mode);
        });
        this.callAction('restoreAllergy', []);
        this.callAction('resetSuicideTable');
        this.callAction('resetRiskAssess');
        this.callAction('updateRiskWarningBadge');
        this.callAction('populatePrevRiskBadge', {});
        state.suppressHistoryEmit = false;
        this.callAction('resetPlan');
        state.safetyPlan.familyMembers = [];
        this.callAction('resetSubstanceUseFields');

        const allTab = this.getElement('drugAllergyTabs')?.querySelector('[data-allergy-tab="all"]');
        this.callAction('switchAllergyTab', 'all', allTab);
        this.callAction('activateWorkbenchTarget', 'personal');
        return true;
      },

      async populate(data = {}) {
        const token = state.contextToken + 1;
        state.contextToken = token;
        const isCurrentLoad = () => token === state.contextToken;
        state.isHydrating = true;
        state.recoveryDirty = false;
        state.manualDirty = false;
        state.manualRevision = 0;
        try {
          await this.callAction('restoreSelectedHistory', data.physicalHistory || [], 'physHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;
          await this.callAction('restoreSelectedHistory', data.familyHistory || [], 'famHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;

          this.callAction('restoreAllergy', data.allergies || []);
          this.callAction('restoreSuicideAndRisk', data.riskAssessment || {});
          this.callAction('populatePrevRiskBadge', {
            medical_history: {
              previous_examination: { risk_assessment: data.previousRiskAssessment || {} }
            }
          });
          this.callAction('populateSubstanceUseFields', data.substanceUseHistory || {});

          if (data.patientId) {
            const supporters = Array.isArray(data.safetyPlan?.nguoi_ho_tro)
              ? data.safetyPlan.nguoi_ho_tro
              : [];
            await this.callAction('loadFamilyMembers', data.patientId, supporters, { isCurrentLoad });
          }
          if (!isCurrentLoad()) return false;
          this.callAction('populatePlan', data.safetyPlan || {});
          this.callAction('verifyPopulate', {
            medical_history: {
              patient: {
                physical_history: data.physicalHistory || [],
                family_history: data.familyHistory || [],
                allergies: data.allergies || []
              },
              examination: { risk_assessment: data.riskAssessment || {} },
              previous_examination: { risk_assessment: data.previousRiskAssessment || {} }
            }
          });
          this.callAction('updateWorkbenchSummary');
          return true;
        } finally {
          if (isCurrentLoad()) state.isHydrating = false;
        }
      },

      collect() {
        this.callAction('serializeBanThan');
        this.callAction('serializeGiaDinh');
        const physicalConfig = config.modeConfig.physHistory;
        const familyConfig = config.modeConfig.famHistory;
        return {
          physicalHistory: this.parseHistoryEntries(this.getElement(physicalConfig.hiddenId)?.value),
          familyHistory: this.parseHistoryEntries(this.getElement(familyConfig.hiddenId)?.value),
          allergies: this.callAction('getAllergyValue') || [],
          riskAssessment: this.callAction('serializeRiskAssessment') || {},
          substanceUseHistory: this.callAction('collectSubstanceUseHistory') || {},
          safetyPlan: this.callAction('collectPlan') || {}
        };
      },

      getSavePayload() {
        const snapshot = this.collect();
        return {
          physical_history: snapshot.physicalHistory,
          family_history: snapshot.familyHistory,
          allergies: snapshot.allergies,
          risk_assessment: snapshot.riskAssessment,
          substance_use_history: snapshot.substanceUseHistory,
          safety_plan: snapshot.safetyPlan
        };
      },

      hasPendingChanges() {
        return Boolean(state.recoveryDirty || state.manualDirty);
      },

      markSaved(revision) {
        if (revision !== state.manualRevision) return false;
        this.callAction('clearMedicalHistoryTimers');
        state.manualDirty = false;
        state.recoveryDirty = false;
        return true;
      },

      getSaveRevision() {
        return state.manualRevision;
      },

      parseHistoryEntries(value) {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return [];
        try {
          const parsed = JSON.parse(value.trim() || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          return [];
        }
      },

      getDraftSnapshot() {
        return this.collect();
      },

      async restoreDraftSnapshot(snapshot = {}, options = {}) {
        const token = state.contextToken;
        const isCurrentLoad = () => token === state.contextToken;
        state.isHydrating = true;
        state.suppressHistoryEmit = true;
        this.callAction('clearMedicalHistoryTimers');
        try {
          await this.callAction('restoreSelectedHistory', snapshot.physicalHistory || [], 'physHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;
          await this.callAction('restoreSelectedHistory', snapshot.familyHistory || [], 'famHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;
          this.callAction('restoreAllergy', snapshot.allergies || []);
          this.callAction('restoreSuicideAndRisk', snapshot.riskAssessment || {});
          this.callAction('populateSubstanceUseFields', snapshot.substanceUseHistory || {});
          this.callAction('populatePlan', snapshot.safetyPlan || {});
          this.callAction('restoreSafetyPlanSupporters', snapshot.safetyPlan || {});
          state.recoveryDirty = Boolean(options.dirty);
          state.manualDirty = Boolean(options.dirty);
          if (options.dirty) state.manualRevision += 1;
          if (state.recoveryDirty) {
            root.classList.add('is-draft-restored');
            root.dataset.draftRestored = 'true';
            root.title = 'Tiền sử này được khôi phục từ bản nháp và chưa lưu.';
          }
          return true;
        } finally {
          if (isCurrentLoad()) {
            state.suppressHistoryEmit = false;
            state.isHydrating = false;
          }
        }
      },

      getContextToken() {
        return state.contextToken;
      },

			getConfig() {
        return {
          ...config,
          modeConfig: { ...config.modeConfig },
          historyModes: config.historyModes.slice(),
					substanceIds: config.substanceIds.slice()
				};
      },

      destroy() {
        this.callAction('clearMedicalHistoryTimers');
        Object.values(state.components).forEach(feature => feature?.destroy?.());
        state.cleanups.splice(0).forEach(cleanup => cleanup());
        state.actions = Object.create(null);
        this.actions = state.actions;
        state.components = Object.create(null);
        state.features = Object.create(null);
        state.eventsBoundByFeature = false;
        state.initialized = false;
        state.eventsBound = false;
			if (activeInstance === this) activeInstance = null;
				instances.delete(root);
			}
			};

		if (options.inheritBlueprint !== false) {
			Object.assign(state.actions, actionBlueprint);
			Object.assign(state.features, featureBlueprint);
		}

    return component;
  }

	function getActive(root) {
		if (root) {
			const resolvedRoot = resolveRoot(root);
			return resolvedRoot ? instances.get(resolvedRoot) || null : null;
		}
		return activeInstance;
	}

	function getOrCreate(options = {}) {
		const sourceDocument = options.document || document;
		const configuredRoot = options.root || (options.rootId ? `#${options.rootId}` : null);
		const root = resolveRoot(configuredRoot, sourceDocument);
		if (!root) return null;
		const existing = instances.get(root);
		if (existing) {
			activeInstance = existing;
			return existing;
		}
		const instance = create({ ...options, root, document: sourceDocument });
		if (!instance) return null;
		instances.set(root, instance);
		activeInstance = instance;
		return instance;
	}

	window.QLPKDoctorModuleRegistry.register('medicalHistoryForm', {
    create,
		getActive,
		getOrCreate,
		resolveRoot,
    modeConfig: DEFAULT_MODE_CONFIG,
    historyModes: DEFAULT_HISTORY_MODES,
    substanceIds: DEFAULT_SUBSTANCE_IDS
	});

	getOrCreate(
		window.QLPKMedicalHistoryBootstrapConfig
			|| window.QLPKDoctorModuleRegistry.get('doctorComponentConfig')?.history
			|| {}
	);
})(window, document);
