import { state } from '../state.js';
import { el } from '../../shared/dom.js';

// Answer controls for one question; every renderer returns a DOM node (inputs disabled when the survey is closed).
const closed = () => state.isSurveyClosed;

// Render Linear Scale Question
function renderLinearScaleQuestion(question, questionId) {
    const scale = question.linear_scale || { min: 1, max: 5 };
    const options = [];
    for (let i = scale.min; i <= scale.max; i++) {
        const id = `${questionId}_scale_${i}`;
        options.push(el('div', { class: 'scale-option' },
            el('input', { type: 'radio', name: questionId, id, value: i, disabled: closed() }), ' ',
            el('label', { for: id }, i)));
    }
    return el('div', { class: 'linear-scale-container' },
        el('div', { class: 'scale-labels' },
            el('span', { class: 'scale-label-text' }, scale.low_label || ''), ' ',
            el('span', { class: 'scale-label-text' }, scale.high_label || '')),
        el('div', { class: 'scale-options' }, options));
}

// Render Grid Question
function renderGridQuestion(question, questionId) {
    const grid = question.grid || { rows: [], columns: [] };
    const inputType = question.type === 'checkbox_grid' ? 'checkbox' : 'radio';
    const header = el('tr', {}, el('th', { class: 'grid-row-header' }),
        grid.columns.map(col => el('th', { class: 'grid-column-header' }, col.text || col.label || col)));
    const rows = grid.rows.map((row, rowIndex) => el('tr', {},
        el('td', { class: 'grid-row-label' }, row.text || row),
        grid.columns.map((col, colIndex) => el('td', { class: 'grid-answer-cell' }, el('input', {
            type: inputType,
            name: `${questionId}_row_${rowIndex}`,
            id: `${questionId}_row_${rowIndex}_col_${colIndex}`,
            value: surveyOptionId(col, colIndex),
            'data-question-id': question.id,
            'data-row-id': row.id || rowIndex.toString(),
            'data-row-index': rowIndex,
            disabled: closed(),
        })))));
    return el('div', { class: 'grid-container' }, el('table', { class: 'grid-table' }, el('thead', {}, header), el('tbody', {}, rows)));
}

// Render Date Question
function renderDateQuestion(question, questionId) {
    const includeTime = question.include_time || false;
    return el('div', { class: 'form-group' }, el('input', {
        type: includeTime ? 'datetime-local' : 'date', name: questionId, id: `${questionId}_date`, class: 'form-control',
        placeholder: includeTime ? 'Chọn ngày và giờ' : 'Chọn ngày', disabled: closed(),
    }));
}

// Render Time Question
function renderTimeQuestion(question, questionId) {
    return el('div', { class: 'form-group' }, el('input', {
        type: 'time', name: questionId, id: `${questionId}_time`, class: 'form-control', placeholder: 'Chọn giờ', disabled: closed(),
    }));
}

function surveyOptionId(answer, index) {
    return answer.id === undefined || answer.id === null || answer.id === '' ? index : answer.id;
}

// One radio/checkbox option card (Multiple Choice / Checkboxes)
function renderChoiceOption(type, name, answer, questionId, index) {
    const answerId = surveyOptionId(answer, index);
    const optionId = `${questionId}_${answerId}`;
    return el('div', { class: 'opt' },
        el('input', { type, name, id: optionId, value: answerId, 'data-score': answer.score || answer.value || 0, disabled: closed() }), ' ',
        el('label', { for: optionId }, el('span', { class: 'bullet' }, el('i')), ' ', answer.text || ''));
}

function renderRadioOption(answer, questionId, index) {
    return renderChoiceOption('radio', questionId, answer, questionId, index);
}

function renderCheckboxOption(answer, questionId, index) {
    return renderChoiceOption('checkbox', `${questionId}[]`, answer, questionId, index);
}

export { renderCheckboxOption, renderDateQuestion, renderGridQuestion, renderLinearScaleQuestion, renderRadioOption, renderTimeQuestion, surveyOptionId };
