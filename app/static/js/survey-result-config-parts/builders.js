import { el } from '../shared/dom.js';

const OPERATORS = [
	{ value: 'between', label: 'Trong khoảng' },
	{ value: '>', label: '>' },
	{ value: '>=', label: '>=' },
	{ value: '<', label: '<' },
	{ value: '<=', label: '<=' },
	{ value: '=', label: '=' }
];

const ALERT_OPERATORS = [
	{ value: '>', label: '>' },
	{ value: '>=', label: '>=' },
	{ value: '<', label: '<' },
	{ value: '<=', label: '<=' },
	{ value: '=', label: '=' }
];

function readNumber(input) {
	const value = input?.value?.trim();
	return value && Number.isFinite(Number(value)) ? Number(value) : null;
}

function genId(prefix) {
	return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

// ─── Extract criteria groups from Tab 1 questions ───
function extractCriteriaGroups() {
	const groups = new Set();
	document.querySelectorAll('#scQuestionsList .sc-q-card, #questionsList .sc-q-card').forEach(card => {
		// Multiple choice: single criteria input
		const ci = card.querySelector('.sc-q-criteria-input');
		if (ci && ci.value.trim() && card.querySelector('.sc-q-type').value === 'multiple_choice') {
			groups.add(ci.value.trim());
		}
		// Grid: per-row criteria
		if (card.querySelector('.sc-q-type').value === 'multiple_choice_grid') card.querySelectorAll('.sc-grid-criteria-input').forEach(gi => {
			if (gi.value.trim()) groups.add(gi.value.trim());
		});
	});
	return [...groups];
}

// ─── Extract questions list from Tab 1 ───
function extractQuestions() {
	const questions = [];
	document.querySelectorAll('#scQuestionsList .sc-q-card, #questionsList .sc-q-card').forEach((card, idx) => {
		const qid = card.dataset.qid;
		const text = card.querySelector('.sc-q-text')?.value?.trim() || '';
		if (text) {
			questions.push({ id: qid, text: text, label: `Câu ${idx + 1}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}` });
		}
		if (card.querySelector('.sc-q-type')?.value === 'multiple_choice_grid') {
			card.querySelectorAll('tr[data-row-id]').forEach((row, rowIndex) => {
				const rowText = row.querySelector('.sc-grid-row-input')?.value?.trim();
				if (rowText) questions.push({ id: row.dataset.rowId, text: rowText,
					label: `Câu ${idx + 1}, mục ${rowIndex + 1}: ${rowText}` });
			});
		}
	});
	return questions;
}

// ─── Build operator <option> list ───
function buildOperatorOptions(selected, operators) {
	return operators.map(op => el('option', { value: op.value, selected: selected === op.value }, op.label));
}

const numberInput = (className, value) => el('input', { type: 'number', class: className, defaultValue: value ?? '', step: 'any' });

// ─── Build score input based on operator ───
function buildScoreInputs(cond) {
	if (cond.operator === 'between') {
		return el('div', { class: 'sc-rc-score-range' },
			numberInput('sc-rc-cond-input sc-rc-min-score', cond.min_score),
			el('span', { class: 'sc-rc-score-sep' }, '-'),
			numberInput('sc-rc-cond-input sc-rc-max-score', cond.max_score)
		);
	}
	return numberInput('sc-rc-cond-input sc-rc-single-score', cond.min_score);
}

const textInput = (className, placeholder, value) => el('input', { type: 'text', class: className, placeholder, defaultValue: value || '' });

// ─── Build a single condition row ───
function buildConditionRow(cond) {
	return el('tr', { 'data-cond-id': cond.id },
		el('td', null, el('select', { class: 'sc-rc-cond-select sc-rc-cond-operator' }, buildOperatorOptions(cond.operator, OPERATORS))),
		el('td', { class: 'sc-rc-score-cell' }, buildScoreInputs(cond)),
		el('td', null, textInput('sc-rc-cond-input', 'Nhập kết luận...', cond.conclusion)),
		el('td', null, textInput('sc-rc-cond-input', 'Nhập lưu ý...', cond.note)),
		el('td', null, el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'sc-rc-del-btn sc-rc-del-cond', title: 'Xóa' }, el('i', { class: 'bi bi-trash' })))
	);
}

// ─── Build conditions table ───
function buildConditionsTable(conditions) {
	return [
		el('table', { class: 'sc-rc-cond-table' },
			el('thead', null, el('tr', null,
				el('th', { class: 'sc-rc-cond-col-operator' }, 'Điều kiện'),
				el('th', { class: 'sc-rc-cond-col-score' }, 'Điểm đánh giá'),
				el('th', null, 'Kết luận'),
				el('th', null, 'Lưu ý'),
				el('th', { class: 'sc-rc-cond-col-actions' })
			)),
			el('tbody', null, conditions.map(c => buildConditionRow(c)))
		),
		el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'sc-rc-add-btn sc-rc-add-cond' }, el('i', { class: 'bi bi-plus' }), ' Thêm điều kiện')
	];
}

const alertField = (label, ...control) => el('div', { class: 'sc-rc-alert-field' }, el('label', null, label), control);

// ─── Build alert card ───
function buildAlertCard(alert, questions) {
	const qOptions = questions.map(q => el('option', { value: q.id, selected: alert.question_id === q.id }, q.label));
	return el('div', { class: 'sc-rc-alert-card', 'data-alert-id': alert.id },
		el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'sc-rc-alert-del', title: 'Xóa' }, el('i', { class: 'bi bi-x-lg' })),
		el('div', { class: 'sc-rc-alert-grid' },
			alertField('Câu hỏi', el('select', { class: 'sc-rc-cond-select sc-rc-alert-question sc-rc-select-full' }, qOptions)),
			alertField('Kết luận', textInput('sc-rc-cond-input sc-rc-alert-conclusion', 'Nhập kết luận...', alert.conclusion)),
			alertField('Điều kiện', el('div', { class: 'sc-rc-alert-row' },
				el('select', { class: 'sc-rc-cond-select sc-rc-alert-operator' }, buildOperatorOptions(alert.operator || '>=', ALERT_OPERATORS)),
				el('label', { class: 'sc-rc-inline-label' }, 'Điểm'),
				numberInput('sc-rc-cond-input sc-rc-alert-threshold', alert.threshold)
			)),
			alertField('Lưu ý', textInput('sc-rc-cond-input sc-rc-alert-note', 'Nhập lưu ý...', alert.note))
		)
	);
}

export { ALERT_OPERATORS, OPERATORS, buildAlertCard, buildConditionRow, buildConditionsTable, buildOperatorOptions, buildScoreInputs, extractCriteriaGroups, extractQuestions, genId, readNumber };
