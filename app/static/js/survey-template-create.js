/* survey-template-create.js
 * Modal module: Tạo mới / Chỉnh sửa Mẫu khảo sát
 * Expose: window.surveyCreateModal.open(mode, templateId)
 */

// Parts (nạp trước file này): part-1.js, part-2.js
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['survey-template-create'] || (window.QLPKModuleParts['survey-template-create'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.Q_TYPE = Object.freeze({
		MULTIPLE_CHOICE: 'multiple_choice',
		MULTIPLE_CHOICE_GRID: 'multiple_choice_grid'
	});

	moduleState.QUESTION_TYPE_ALIASES = Object.freeze({
		multiple_choice: moduleState.Q_TYPE.MULTIPLE_CHOICE,
		trac_nghiem: moduleState.Q_TYPE.MULTIPLE_CHOICE,
		scale: moduleState.Q_TYPE.MULTIPLE_CHOICE,
		multiple_choice_grid: moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID,
		luoi_trac_nghiem: moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID,
		checkbox_grid: moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID
	});

	moduleState.state = {
		templateId: null,
		questionCounter: 0,
		dirty: false,
		loading: false,
		saving: false,
		defaultPerformerId: null,
		performers: [],
		loadRevision: 0,
		content: {},
	};

	moduleState.criteriaCache = null;
	moduleState.performersPromise = null;

	window.surveyCreateModal = { open: moduleParts.open, close: moduleParts.close, refreshCriteriaCache: moduleParts.refreshCriteriaCache };
	document.addEventListener('DOMContentLoaded', moduleParts.init);
})();
