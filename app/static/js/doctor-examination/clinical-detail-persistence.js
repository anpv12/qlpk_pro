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

	function installDetailPersistenceFns1(ctx) {
		function resolveEndpoint(name, args) {
			const endpoint = ctx.endpoints[name];
			return typeof endpoint === 'function'
				? endpoint(args)
				: String(endpoint || '').replace('{appointmentId}', args.appointmentId || '').replace('{examinationId}', args.examinationId || '').replace('{section}', args.section || '');
		}

		function getConfig(control) {
			const controlId = control && control.id;
			return ctx.fields.find(config => config.controlId === controlId) || null;
		}

		function collect(doc) {
			return ctx.fields
				.filter(config => ctx.getElement(doc, config.controlId))
				.map(config => ({
					section: config.section,
					value: ctx.getValue(doc, config.controlId),
					field: config.field
				}));
		}

		function prepareEmptyDefaults(doc) {
			if (!ctx.state.detailsLoaded || ctx.state.detailsLoading) return false;
			const changedSections = new Set();
			ctx.fields.forEach(config => {
				if (!NORMAL_DETAIL_FIELDS[config.section]?.has(config.field)) return;
				if (!ctx.getElement(doc, config.controlId) || ctx.textOf(ctx.getValue(doc, config.controlId)).trim()) return;
				ctx.setValue(doc, config.controlId, NORMAL_DETAIL_VALUE);
				changedSections.add(config.section);
			});
			changedSections.forEach(section => ctx.detailChanges.mark(section));
			if (changedSections.size) ctx.syncDirtyState();
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
			return token === ctx.state.contextToken
				&& ctx.textOf(ctx.state.appointment && ctx.state.appointment.id) === ctx.textOf(appointmentId);
		}

		Object.assign(ctx, {
			resolveEndpoint, getConfig, collect, prepareEmptyDefaults, groupBySection, getValueFromSections,
			isCurrentLoad
		});
	}

	function installDetailPersistenceFns2(ctx) {
		async function load(doc, appointmentId, token) {
			if (!appointmentId || typeof ctx.apiCall !== 'function') return false;
			ctx.state.detailsLoading = true;
			ctx.state.detailsLoaded = false;
			ctx.state.detailsLoadError = null;
			try {
				const response = await ctx.apiCall(ctx.resolveEndpoint('load', { appointmentId }));
				if (!ctx.isCurrentLoad(token, appointmentId)) return false;
				if (!response || !response.ok) {
					ctx.state.detailsLoadError = new Error('Không tải được chi tiết khám');
					return false;
				}
				const payload = await response.json();
				if (!ctx.isCurrentLoad(token, appointmentId)) return false;
				if (ctx.hasValue(payload.examination_id)) ctx.state.examinationId = ctx.textOf(payload.examination_id);
				ctx.fields.forEach(config => {
					ctx.setValue(doc, config.controlId, ctx.getValueFromSections(payload.sections, config));
				});
				ctx.state.detailsLoaded = true;
				return true;
			} catch (error) {
				if (ctx.isCurrentLoad(token, appointmentId)) ctx.state.detailsLoadError = error;
				return false;
			} finally {
				if (ctx.isCurrentLoad(token, appointmentId)) {
					ctx.state.detailsLoading = false;
					ctx.state.detailsLoadPromise = null;
				}
			}
		}

		async function save(doc, appointmentId, token, dirtySections) {
			if (!ctx.state.detailsLoaded) {
				const error = new Error('Chưa tải xong chi tiết khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
				error.module = 'clinical';
				error.moduleLabel = 'Khám chi tiết';
				throw error;
			}
			const sections = dirtySections || new Set(ctx.state.detailDirtySections);
			const details = ctx.collect(doc).filter(detail => sections.has(detail.section));
			if (!details.length) return { skipped: true, reason: 'missing-detail-controls' };
			const examinationId = ctx.textOf(ctx.state.examinationId);
			if (!examinationId) throw new Error('Không xác định được lượt khám để lưu chi tiết khám');

			const detailsBySection = ctx.groupBySection(details);
			const sectionRevisions = Object.keys(detailsBySection).reduce((revisions, section) => {
				revisions[section] = ctx.detailChanges.capture(section);
				return revisions;
			}, {});
			for (const [section, fields] of Object.entries(detailsBySection)) {
				const revision = sectionRevisions[section];
				const response = await ctx.apiCall(ctx.resolveEndpoint('save', { examinationId, section }), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(fields)
				});
				if (token !== ctx.state.contextToken) return { skipped: true, reason: 'stale' };
				if (!response || !response.ok) {
					throw new Error(await ctx.parseResponseError(response, 'Không lưu được chi tiết khám'));
				}
				ctx.detailChanges.settle(section, revision);
			}
			ctx.syncDirtyState();
			return { status: 'success', appointmentId, sections: Object.keys(detailsBySection) };
		}

		Object.assign(ctx, { load, save });
	}

	function create(options = {}) {
		const ctx = {};
		installDetailPersistenceFns1(ctx);
		installDetailPersistenceFns2(ctx);

		ctx.state = options.state;
		ctx.detailChanges = options.detailChanges;
		if (!ctx.detailChanges) throw new Error('Thiếu tracker thay đổi của chi tiết khám');
		ctx.getElement = options.getElement;
		ctx.getValue = options.getValue;
		ctx.setValue = options.setValue;
		ctx.textOf = options.textOf;
		ctx.hasValue = options.hasValue;
		ctx.parseResponseError = options.parseResponseError;
		ctx.syncDirtyState = options.syncDirtyState;
		ctx.apiCall = options.apiCall;
		ctx.fields = Array.isArray(options.fields) ? options.fields : DEFAULT_FIELDS;
		ctx.endpoints = { ...DEFAULT_ENDPOINTS, ...(options.endpoints || {}) };

		return { collect: ctx.collect, getConfig: ctx.getConfig, load: ctx.load, save: ctx.save, prepareEmptyDefaults: ctx.prepareEmptyDefaults, fields: ctx.fields.slice(), endpoints: { ...ctx.endpoints } };
	}

	window.QLPKDoctorModuleRegistry.register('clinicalDetails', { fields: DEFAULT_FIELDS, endpoints: DEFAULT_ENDPOINTS, create });
})(window);
