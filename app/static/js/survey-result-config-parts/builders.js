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

function escHtml(str) {
	if (!str) return '';
	return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
	return operators.map(op =>
		`<option value="${op.value}" ${selected === op.value ? 'selected' : ''}>${escHtml(op.label)}</option>`
	).join('');
}

// ─── Build score input based on operator ───
function buildScoreInputs(cond) {
	if (cond.operator === 'between') {
		return `<div class="sc-rc-score-range">
				<input type="number" class="sc-rc-cond-input sc-rc-min-score" value="${cond.min_score ?? ''}" step="any">
				<span class="sc-rc-score-sep">-</span>
				<input type="number" class="sc-rc-cond-input sc-rc-max-score" value="${cond.max_score ?? ''}" step="any">
			</div>`;
	}
	return `<input type="number" class="sc-rc-cond-input sc-rc-single-score" value="${cond.min_score ?? ''}" step="any">`;
}

// ─── Build a single condition row ───
function buildConditionRow(cond) {
	return `<tr data-cond-id="${cond.id}">
			<td><select class="sc-rc-cond-select sc-rc-cond-operator">${buildOperatorOptions(cond.operator, OPERATORS)}</select></td>
			<td class="sc-rc-score-cell">${buildScoreInputs(cond)}</td>
			<td><input type="text" class="sc-rc-cond-input" placeholder="Nhập kết luận..." value="${escHtml(cond.conclusion || '')}"></td>
			<td><input type="text" class="sc-rc-cond-input" placeholder="Nhập lưu ý..." value="${escHtml(cond.note || '')}"></td>
			<td><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-rc-del-btn sc-rc-del-cond" title="Xóa"><i class="bi bi-trash"></i></button></td>
		</tr>`;
}

// ─── Build conditions table ───
function buildConditionsTable(conditions) {
	const rows = conditions.map(c => buildConditionRow(c)).join('');
	return `<table class="sc-rc-cond-table">
			<thead><tr>
				<th class="sc-rc-cond-col-operator">Điều kiện</th>
				<th class="sc-rc-cond-col-score">Điểm đánh giá</th>
				<th>Kết luận</th>
				<th>Lưu ý</th>
				<th class="sc-rc-cond-col-actions"></th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>
		<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="sc-rc-add-btn sc-rc-add-cond"><i class="bi bi-plus"></i> Thêm điều kiện</button>`;
}

// ─── Build alert card ───
function buildAlertCard(alert, questions) {
	const qOptions = questions.map(q =>
		`<option value="${q.id}" ${alert.question_id === q.id ? 'selected' : ''}>${escHtml(q.label)}</option>`
	).join('');

	return `<div class="sc-rc-alert-card" data-alert-id="${alert.id}">
			<button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-rc-alert-del" title="Xóa"><i class="bi bi-x-lg"></i></button>
			<div class="sc-rc-alert-grid">
				<div class="sc-rc-alert-field">
					<label>Câu hỏi</label>
					<select class="sc-rc-cond-select sc-rc-alert-question sc-rc-select-full">${qOptions}</select>
				</div>
				<div class="sc-rc-alert-field">
					<label>Kết luận</label>
					<input type="text" class="sc-rc-cond-input sc-rc-alert-conclusion" placeholder="Nhập kết luận..." value="${escHtml(alert.conclusion || '')}">
				</div>
				<div class="sc-rc-alert-field">
					<label>Điều kiện</label>
					<div class="sc-rc-alert-row">
						<select class="sc-rc-cond-select sc-rc-alert-operator">${buildOperatorOptions(alert.operator || '>=', ALERT_OPERATORS)}</select>
						<label class="sc-rc-inline-label">Điểm</label>
						<input type="number" class="sc-rc-cond-input sc-rc-alert-threshold" value="${alert.threshold ?? ''}" step="any">
					</div>
				</div>
				<div class="sc-rc-alert-field">
					<label>Lưu ý</label>
					<input type="text" class="sc-rc-cond-input sc-rc-alert-note" placeholder="Nhập lưu ý..." value="${escHtml(alert.note || '')}">
				</div>
			</div>
		</div>`;
}

export { ALERT_OPERATORS, OPERATORS, buildAlertCard, buildConditionRow, buildConditionsTable, buildOperatorOptions, buildScoreInputs, escHtml, extractCriteriaGroups, extractQuestions, genId, readNumber };
