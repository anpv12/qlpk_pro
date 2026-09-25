(function (window) {
	'use strict';

	const NORMAL_DETAIL_FIELDS = {
		bac_si_kham_kham_tong_quat: new Set(['circulation', 'digestive', 'renal_urogenital', 'musculoskeletal', 'ent', 'endocrine_nutrition_others', 'neurological']),
		bac_si_kham_kham_tam_than: new Set(['orientation', 'emotions', 'perception', 'thought', 'behavior', 'memory', 'intelligence', 'attention'])
	};
	const NORMAL_DETAIL_VALUE = 'Không ghi nhận bất thường';

	const DEFAULT_FIELDS = [
		{
			section: 'bac_si_kham_form_kham',
			field: 'main_reason',
			controlId: 'doctorClinicalReason'
		},
		{
			section: 'bac_si_kham_tien_su',
			field: 'medical_history',
			controlId: 'examDetailMedicalHistory'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'general_examination',
			controlId: 'examDetailGeneralExamination'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'bieu_hien_chung',
			controlId: 'examGeneralPresentation'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'circulation',
			controlId: 'examGeneralCirculation'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'digestive',
			controlId: 'examGeneralDigestive'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'renal_urogenital',
			controlId: 'examGeneralRenalUroGenital'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'musculoskeletal',
			controlId: 'examGeneralMusculoskeletal'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'ent',
			controlId: 'examGeneralENT'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'endocrine_nutrition_others',
			controlId: 'examGeneralEndocrineNutritionOthers'
		},
		{
			section: 'bac_si_kham_kham_tong_quat',
			field: 'neurological',
			controlId: 'examGeneralMental'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'orientation',
			controlId: 'examMentalOrientation'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'emotions',
			controlId: 'examMentalEmotions'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'perception',
			controlId: 'examMentalPerception'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'thought',
			controlId: 'examMentalThought'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'behavior',
			controlId: 'examMentalBehavior'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'memory',
			controlId: 'examMentalMemory'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'intelligence',
			controlId: 'examMentalIntelligence'
		},
		{
			section: 'bac_si_kham_kham_tam_than',
			field: 'attention',
			controlId: 'examMentalAttention'
		}
	];

	const DEFAULT_ENDPOINTS = {
		load: ({ appointmentId }) => `/api/examination-details/modal-load/${appointmentId}`,
		save: ({ examinationId, section }) => `/api/examination-details/${examinationId}/section/${section}`
	};

	function create(options = {}) {
		const state = options.state;
		const getElement = options.getElement;
		const getValue = options.getValue;
		const setValue = options.setValue;
		const textOf = options.textOf;
		const hasValue = options.hasValue;
		const parseResponseError = options.parseResponseError;
		const syncDirtyState = options.syncDirtyState;
		const apiCall = options.apiCall;
		const fields = Array.isArray(options.fields) ? options.fields : DEFAULT_FIELDS;
		const endpoints = { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) };

		function resolveEndpoint(name, args) {
			const endpoint = endpoints[name];
			return typeof endpoint === 'function'
				? endpoint(args)
				: String(endpoint || '').replace('{appointmentId}', args.appointmentId || '').replace('{examinationId}', args.examinationId || '').replace('{section}', args.section || '');
		}

		function getConfig(control) {
			const controlId = control && control.id;
			return fields.find(config => config.controlId === controlId) || null;
		}

		function collect(doc) {
			return fields
				.filter(config => getElement(doc, config.controlId))
				.map(config => ({
					section: config.section,
					value: getValue(doc, config.controlId),
					field: config.field
				}));
		}

		function prepareEmptyDefaults(doc) {
			if (!state.detailsLoaded || state.detailsLoading) return false;
			const changedSections = new Set();
			fields.forEach(config => {
				if (!NORMAL_DETAIL_FIELDS[config.section]?.has(config.field)) return;
				if (!getElement(doc, config.controlId) || textOf(getValue(doc, config.controlId)).trim()) return;
				setValue(doc, config.controlId, NORMAL_DETAIL_VALUE);
				changedSections.add(config.section);
			});
			changedSections.forEach(section => {
				state.detailDirtySections.add(section);
				state.detailRevisions[section] = (state.detailRevisions[section] || 0) + 1;
			});
			if (changedSections.size) {
				state.revision += 1;
				syncDirtyState();
			}
			return changedSections.size > 0;
		}

		function groupBySection(details) {
			return details.reduce((groups, detail) => {
				if (!groups[detail.section]) groups[detail.section] = {};
				groups[detail.section][detail.field] = detail.value;
				return groups;
			}, {});
		}

		function getValueFromSections(sections, config) {
			const section = sections && sections[config.section];
			if (section && Object.prototype.hasOwnProperty.call(section, config.field)) {
				return section[config.field];
			}
			return '';
		}

		function isCurrentLoad(token, appointmentId) {
			return token === state.contextToken
				&& textOf(state.appointment && state.appointment.id) === textOf(appointmentId);
		}

		async function load(doc, appointmentId, token) {
			if (!appointmentId || typeof apiCall !== 'function') return false;
			state.detailsLoading = true;
			state.detailsLoaded = false;
			state.detailsLoadError = null;
			try {
				const response = await apiCall(resolveEndpoint('load', { appointmentId }));
				if (!isCurrentLoad(token, appointmentId)) return false;
				if (!response || !response.ok) {
					state.detailsLoadError = new Error('Không tải được chi tiết khám');
					return false;
				}
				const payload = await response.json();
				if (!isCurrentLoad(token, appointmentId)) return false;
				if (hasValue(payload.examination_id)) state.examinationId = textOf(payload.examination_id);
				fields.forEach(config => {
					setValue(doc, config.controlId, getValueFromSections(payload.sections, config));
				});
				state.detailsLoaded = true;
				return true;
			} catch (error) {
				if (isCurrentLoad(token, appointmentId)) state.detailsLoadError = error;
				return false;
			} finally {
				if (isCurrentLoad(token, appointmentId)) {
					state.detailsLoading = false;
					state.detailsLoadPromise = null;
				}
			}
		}

		async function save(doc, appointmentId, token, dirtySections) {
			if (!state.detailsLoaded) {
				const error = new Error('Chưa tải xong chi tiết khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
				error.module = 'clinical';
				error.moduleLabel = 'Khám chi tiết';
				throw error;
			}
			const sections = dirtySections || new Set(state.detailDirtySections);
			const details = collect(doc).filter(detail => sections.has(detail.section));
			if (!details.length) return { skipped: true, reason: 'missing-detail-controls' };
			const examinationId = textOf(state.examinationId);
			if (!examinationId) throw new Error('Không xác định được lượt khám để lưu chi tiết khám');

			const detailsBySection = groupBySection(details);
			const sectionRevisions = Object.keys(detailsBySection).reduce((revisions, section) => {
				revisions[section] = state.detailRevisions[section] || 0;
				return revisions;
			}, {});
			for (const [section, fields] of Object.entries(detailsBySection)) {
				const revision = sectionRevisions[section];
				const response = await apiCall(resolveEndpoint('save', { examinationId, section }), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(fields)
				});
				if (token !== state.contextToken) return { skipped: true, reason: 'stale' };
				if (!response || !response.ok) {
					throw new Error(await parseResponseError(response, 'Không lưu được chi tiết khám'));
				}
				if (revision === (state.detailRevisions[section] || 0)) {
					state.detailDirtySections.delete(section);
				}
			}
			syncDirtyState();
			return { status: 'success', appointmentId, sections: Object.keys(detailsBySection) };
		}

		return { collect, getConfig, load, save, prepareEmptyDefaults, fields: fields.slice(), endpoints: { ...endpoints } };
	}

	window.QLPKDoctorModuleRegistry.register('clinicalDetails', { fields: DEFAULT_FIELDS, endpoints: DEFAULT_ENDPOINTS, create });
})(window);
