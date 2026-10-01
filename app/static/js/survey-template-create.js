import { moduleState } from './survey-template-create-parts/state.js';
import { close, init, open, refreshCriteriaCache } from './survey-template-create-parts/page-state.js';

// Survey template create/edit modal: questions (choice/grid), criteria, results config; exports surveyCreateModal.

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

export const surveyCreateModal = { open, close, refreshCriteriaCache };
document.addEventListener('DOMContentLoaded', init);
