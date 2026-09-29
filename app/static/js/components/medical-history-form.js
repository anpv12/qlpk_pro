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

  // Defaults for every history section so populate() can hydrate a partial payload.
  function normalizeHistoryPopulateData(data) {
    return {
      physicalHistory: data.physicalHistory || [],
      familyHistory: data.familyHistory || [],
      allergies: data.allergies || [],
      riskAssessment: data.riskAssessment || {},
      previousRiskAssessment: data.previousRiskAssessment || {},
      substanceUseHistory: data.substanceUseHistory || {},
      safetyPlan: data.safetyPlan || {},
      supporters: Array.isArray(data.safetyPlan?.nguoi_ho_tro) ? data.safetyPlan.nguoi_ho_tro : [],
      patientId: data.patientId
    };
  }
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

	function functionOrNull(value) {
		return typeof value === 'function' ? value : null;
	}

	function buildMedicalHistoryConfig(options, root) {
		const modeConfig = Object.keys({ ...DEFAULT_MODE_CONFIG, ...(options.modeConfig || {}) }).reduce((result, mode) => {
			result[mode] = { ...DEFAULT_MODE_CONFIG[mode], ...(options.modeConfig?.[mode] || {}) };
			return result;
		}, {});
		return {
			root,
			modeConfig,
			historyModes: (Array.isArray(options.historyModes) ? options.historyModes : DEFAULT_HISTORY_MODES).slice(),
			substanceIds: (Array.isArray(options.substanceIds) ? options.substanceIds : DEFAULT_SUBSTANCE_IDS).slice(),
			isLoading: functionOrNull(options.isLoading),
			onDataChanged: functionOrNull(options.onDataChanged),
			pageRuntime: options.pageRuntime || options.runtime || null,
			getPatientId: functionOrNull(options.getPatientId),
			normalizePayload: functionOrNull(options.normalizePayload)
		};
	}

	function buildMedicalHistoryComponentMethods1(scope) {
		return {
			registerActions(actions) {
				Object.assign(scope.state.actions, actions || {});
				Object.assign(actionBlueprint, actions || {});
				return this;
			},

			registerFeature(name, feature) {
				if (name) scope.state.features = scope.state.features || Object.create(null);
				if (name) {
					scope.state.features[name] = feature;
					featureBlueprint[name] = feature;
				}
				return this;
			},

      getFeature(name) {
        return scope.state.features?.[name] || null;
      },

      getAction(name) {
        return scope.state.actions[name];
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
        if (scope.root.id === id) return scope.root;
        return scope.root.querySelector(`#${id}`);
      },

      query(selector) {
        if (!selector) return null;
        return scope.root.matches(selector) ? scope.root : scope.root.querySelector(selector);
      },

      queryAll(selector) {
        return selector ? Array.from(scope.root.querySelectorAll(selector)) : [];
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
				scope.state.cleanups.push(() => target.removeEventListener(eventName, scopedHandler, options));
				return true;
			}
		};
	}

	function buildMedicalHistoryComponentMethods2(scope) {
		return {
			isLoading() {
				return Boolean(scope.config.isLoading?.() || scope.state.isHydrating);
      },

      textValue(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
      },

      markDirty() {
        if (this.isLoading() || scope.state.suppressHistoryEmit) return false;
        scope.MANUAL_CHANGES.mark();
        return true;
      },

      emitChange(fieldId, apiFieldName, value) {
        this.markDirty();
        if (typeof scope.config.onDataChanged === 'function') {
          scope.config.onDataChanged({ fieldId, apiFieldName, value, component: this });
        }
      },

      init() {
        if (scope.state.initialized) return true;
        this.bind();
        this.callAction('ensureSelectedICDs');
        this.callAction('setupICDMultiSelect', 'physHistory', 'physHistory');
        this.callAction('setupICDMultiSelect', 'famHistory', 'famHistory');
        this.callAction('bindHistoryFreeTextInputs');
        this.callAction('bindSubstanceUseFields');
        this.callAction('bindEvents');
        scope.state.initialized = true;
        return true;
      },

      bind() {
        if (scope.state.eventsBound) return true;
        scope.state.eventsBound = true;
        return true;
      }
		};
	}

	function buildMedicalHistoryComponentMethods3(scope) {
		return {
			clear() {
        scope.state.contextToken += 1;
        scope.state.isHydrating = false;
        scope.state.recoveryDirty = false;
        scope.MANUAL_CHANGES.reset();
        this.callAction('clearMedicalHistoryTimers');

        scope.state.suppressHistoryEmit = true;
        scope.config.historyModes.forEach(mode => {
          this.callAction('clearSelectedICD', mode);
          const modeConfig = scope.config.modeConfig[mode];
          this.setElementValue(modeConfig?.textInputId, '');
          this.setElementValue(modeConfig?.hiddenId, '');
          this.callAction('updateSelectedICDTags', mode);
        });
        this.callAction('restoreAllergy', []);
        this.callAction('resetSuicideTable');
        this.callAction('resetRiskAssess');
        this.callAction('updateRiskWarningBadge');
        this.callAction('populatePrevRiskBadge', {});
        scope.state.suppressHistoryEmit = false;
        this.callAction('resetPlan');
        scope.state.safetyPlan.familyMembers = [];
        this.callAction('resetSubstanceUseFields');

        const allTab = this.getElement('drugAllergyTabs')?.querySelector('[data-allergy-tab="all"]');
        this.callAction('switchAllergyTab', 'all', allTab);
        this.callAction('activateWorkbenchTarget', 'personal');
        return true;
      }
		};
	}

	function buildMedicalHistoryComponentMethods4(scope) {
		return {
			async populate(data = {}) {
        const token = scope.state.contextToken + 1;
        scope.state.contextToken = token;
        const isCurrentLoad = () => token === scope.state.contextToken;
        scope.state.isHydrating = true;
        scope.state.recoveryDirty = false;
        scope.MANUAL_CHANGES.reset();
        const values = normalizeHistoryPopulateData(data);
        try {
          await this.callAction('restoreSelectedHistory', values.physicalHistory, 'physHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;
          await this.callAction('restoreSelectedHistory', values.familyHistory, 'famHistory', { isCurrentLoad });
          if (!isCurrentLoad()) return false;

          this.callAction('restoreAllergy', values.allergies);
          this.callAction('restoreSuicideAndRisk', values.riskAssessment);
          this.callAction('populatePrevRiskBadge', {
            medical_history: {
              previous_examination: { risk_assessment: values.previousRiskAssessment }
            }
          });
          this.callAction('populateSubstanceUseFields', values.substanceUseHistory);

          if (values.patientId) {
            await this.callAction('loadFamilyMembers', values.patientId, values.supporters, { isCurrentLoad });
          }
          if (!isCurrentLoad()) return false;
          this.callAction('populatePlan', values.safetyPlan);
          this.callAction('verifyPopulate', {
            medical_history: {
              patient: {
                physical_history: values.physicalHistory,
                family_history: values.familyHistory,
                allergies: values.allergies
              },
              examination: { risk_assessment: values.riskAssessment },
              previous_examination: { risk_assessment: values.previousRiskAssessment }
            }
          });
          this.callAction('updateWorkbenchSummary');
          return true;
        } finally {
          if (isCurrentLoad()) scope.state.isHydrating = false;
        }
      },

      collect() {
        this.callAction('serializeBanThan');
        this.callAction('serializeGiaDinh');
        const physicalConfig = scope.config.modeConfig.physHistory;
        const familyConfig = scope.config.modeConfig.famHistory;
        return {
          physicalHistory: this.parseHistoryEntries(this.getElement(physicalConfig.hiddenId)?.value),
          familyHistory: this.parseHistoryEntries(this.getElement(familyConfig.hiddenId)?.value),
          allergies: this.callAction('getAllergyValue') || [],
          riskAssessment: this.callAction('serializeRiskAssessment') || {},
          substanceUseHistory: this.callAction('collectSubstanceUseHistory') || {},
          safetyPlan: this.callAction('collectPlan') || {}
        };
      }
		};
	}

	function buildMedicalHistoryComponentMethods5(scope) {
		return {
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
        return Boolean(scope.state.recoveryDirty || scope.state.manualDirty);
      },

      markSaved(revision) {
        if (!scope.MANUAL_CHANGES.settle(revision)) return false;
        this.callAction('clearMedicalHistoryTimers');
        scope.state.recoveryDirty = false;
        return true;
      },

      getSaveRevision() {
        return scope.MANUAL_CHANGES.capture();
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
      }
		};
	}

	function buildMedicalHistoryComponentMethods6(scope) {
		return {
			async restoreDraftSnapshot(snapshot = {}, options = {}) {
        const token = scope.state.contextToken;
        const isCurrentLoad = () => token === scope.state.contextToken;
        scope.state.isHydrating = true;
        scope.state.suppressHistoryEmit = true;
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
          scope.state.recoveryDirty = Boolean(options.dirty);
          scope.MANUAL_CHANGES.restore(options.dirty);
          if (scope.state.recoveryDirty) {
            scope.root.classList.add('is-draft-restored');
            scope.root.dataset.draftRestored = 'true';
            scope.root.title = 'Tiền sử này được khôi phục từ bản nháp và chưa lưu.';
          }
          return true;
        } finally {
          if (isCurrentLoad()) {
            scope.state.suppressHistoryEmit = false;
            scope.state.isHydrating = false;
          }
        }
      },

      getContextToken() {
        return scope.state.contextToken;
      },

			getConfig() {
        return {
          ...scope.config,
          modeConfig: { ...scope.config.modeConfig },
          historyModes: scope.config.historyModes.slice(),
					substanceIds: scope.config.substanceIds.slice()
				};
      },

      destroy() {
        this.callAction('clearMedicalHistoryTimers');
        Object.values(scope.state.components).forEach(feature => feature?.destroy?.());
        scope.state.cleanups.splice(0).forEach(cleanup => cleanup());
        scope.state.actions = Object.create(null);
        this.actions = scope.state.actions;
        scope.state.components = Object.create(null);
        scope.state.features = Object.create(null);
        scope.state.eventsBoundByFeature = false;
        scope.state.initialized = false;
        scope.state.eventsBound = false;
			if (activeInstance === this) activeInstance = null;
				instances.delete(scope.root);
			}
		};
	}

	function create(options = {}) {
		const RUNTIME = window.QLPKDoctorModuleRegistry.require('supportRuntime');
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
    const MANUAL_CHANGES = RUNTIME.createChangeTracker(state, { revisionKey: 'manualRevision', dirtyKey: 'manualDirty' });

		const config = buildMedicalHistoryConfig(options, root);

    const componentScope = { root, state, MANUAL_CHANGES, config };
    const component = {
      root,
      state,
      config,
      actions: state.actions,

			...buildMedicalHistoryComponentMethods1(componentScope),
			...buildMedicalHistoryComponentMethods2(componentScope),
			...buildMedicalHistoryComponentMethods3(componentScope),
			...buildMedicalHistoryComponentMethods4(componentScope),
			...buildMedicalHistoryComponentMethods5(componentScope),
			...buildMedicalHistoryComponentMethods6(componentScope)
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

		// Consumers register workflow-specific actions (notably the ICD bridge)
		// after this shared form is loaded.  Create the instance here, but let the
		// owning bridge call init() once all actions/features are available.
		const bootstrapConfig = window.QLPKMedicalHistoryBootstrapConfig
			|| window.QLPKDoctorModuleRegistry.get('doctorComponentConfig')?.history
			|| {};
		getOrCreate(bootstrapConfig);
	})(window, document);
