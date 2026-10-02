import { el, replace } from '../shared/dom.js';
import { moduleState } from './state.js';
import { close, genId, isChoiceType, isGridType, markDirty, normalizeQuestionType, overlayEl, retainedId, saveButton, setSaveButtonIdle, setScVisible, showToast, surveyDescInput, surveyNameInput, surveyPerformerInput, switchTab } from './page-state.js';
import { bindCriteriaAutocomplete } from './criteria-autocomplete.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';
import { QLPKUserFeedback } from '../shared/user-feedback.js';

const removeIcon = () => el('i', { class: 'bi bi-x-lg' });

function buildAnswerRow(a) {
	return el('div', { class: 'sc-answer-row', 'data-answer-id': retainedId(a.id) },
		el('div', { class: 'sc-answer-radio' }),
		el('input', { type: 'text', class: 'sc-answer-text', placeholder: 'Nhập đáp án...', defaultValue: a.text || '' }),
		el('span', { class: 'sc-answer-score-label' }, 'Điểm:'),
		el('input', { type: 'number', class: 'sc-answer-score', defaultValue: a.score ?? a.value ?? '', step: 'any', placeholder: '—', title: 'Chưa cấu hình điểm' }),
		el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'sc-answer-remove', title: 'Xóa' }, removeIcon())
	);
}
function buildColumnHeaderContent(label, score, scoreTitle) {
	return [
		el('div', { class: 'sc-grid-col-top' },
			el('input', { type: 'text', class: 'sc-grid-col-label', defaultValue: label, placeholder: 'Nhập tên cột...' }),
			el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'sc-del-col-btn', title: 'Xóa cột' }, removeIcon())
		),
		el('div', { class: 'sc-grid-col-score' },
			el('span', null, 'Điểm mặc định'),
			el('input', { type: 'number', class: 'sc-grid-score-input', defaultValue: score, step: 'any', placeholder: '—', title: scoreTitle }),
			el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', type: 'button', class: 'sc-q-action-btn sc-apply-col-btn', title: 'Áp điểm cho cả cột', 'aria-label': 'Áp điểm cho cả cột' },
				el('i', { class: 'bi bi-check2-all' }))
		)
	];
}
function buildScoreCell(value) {
	return el('td', { class: 'sc-col-cell' },
		el('input', { type: 'number', class: 'sc-grid-score-input', defaultValue: value, step: 'any', placeholder: '—', title: 'Chưa cấu hình điểm' }));
}
function buildGridRowCells({ text, criteria, scoreEnabled, scores, criteriaHidden }) {
	return [
		el('td', { class: 'sc-row-handle', title: 'Kéo để sắp xếp' }, '⋮⋮'),
		el('td', null, el('input', { type: 'text', class: 'sc-grid-row-input', placeholder: 'Nội dung hàng...', defaultValue: text })),
		el('td', null, el('div', { class: 'sc-criteria-wrap' },
			el('input', { type: 'text', class: 'sc-grid-criteria-input sc-q-criteria-input', placeholder: 'Tiêu chí', defaultValue: criteria, autocomplete: 'off' }),
			el('div', { class: criteriaHidden ? 'sc-criteria-dropdown sc-hidden' : 'sc-criteria-dropdown' })
		)),
		el('td', { class: 'sc-grid-score-toggle-cell' },
			el('input', { type: 'checkbox', class: 'sc-grid-score-enabled', checked: scoreEnabled, title: 'Cho phép tính điểm' })),
		scores.map(buildScoreCell),
		el('td', null, el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'sc-del-row-btn', title: 'Xóa hàng' }, removeIcon()))
	];
}
function buildGrid(qObj) {
	const rows = qObj.grid?.rows || [];
	const cols = qObj.grid?.columns || [];
	const colHeaders = cols.map((c, ci) => el('th', { class: 'sc-col-header', 'data-column-id': retainedId(c.id) },
		buildColumnHeaderContent(c.label ?? c.text ?? `Cột ${ci + 1}`, c.score ?? c.value ?? '', 'Chưa cấu hình điểm')));
	const bodyRows = rows.map((r, ri) => el('tr', { 'data-row': ri, 'data-row-id': retainedId(r.question_id ?? r.id) },
		buildGridRowCells({
			text: r.text || '',
			criteria: r.criteria ?? r.scoring_criteria ?? qObj.criteria ?? '',
			scoreEnabled: r.score_enabled !== false,
			scores: cols.map(c => r.scores?.[c.id] ?? c.score ?? c.value ?? ''),
			criteriaHidden: true
		})));
	return [
		el('div', { class: 'sc-grid-wrap' },
			el('table', { class: 'sc-grid-table' },
				el('thead', null, el('tr', null,
					el('th', { class: 'sc-grid-handle-col' }),
					el('th', { class: 'sc-grid-row-col' }, 'Hàng'),
					el('th', { class: 'sc-grid-criteria-col' }, 'Tiêu chí'),
					el('th', { class: 'sc-grid-score-enabled-col' }, 'Tính điểm'),
					colHeaders,
					el('th', { class: 'sc-grid-add-col' },
						el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'sc-add-col-btn' }, el('i', { class: 'bi bi-plus-lg' })))
				)),
				el('tbody', null, bodyRows)
			)
		),
		el('div', { class: 'sc-grid-actions' },
			el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'sc-add-row-btn' }, el('i', { class: 'bi bi-plus' }), ' Thêm hàng'))
	];
}
function bindCardEvents(card, qObj) {
	card.querySelector('.sc-q-collapse-btn').addEventListener('click', function () {
		const body = card.querySelector('.sc-q-body');
		const icon = this.querySelector('i');
		const collapsed = body.classList.contains('collapsed');
		body.classList.toggle('collapsed', !collapsed);
		icon.className = collapsed ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
	});

	card.querySelector('.sc-q-type').addEventListener('change', function () {
		qObj.type = normalizeQuestionType(this.value);
		if (isChoiceType(qObj.type) && (!Array.isArray(qObj.answers) || qObj.answers.length < 2)) {
			qObj.answers = [{ text: '', score: 0 }, { text: '', score: 1 }];
		}
		if (isGridType(qObj.type) && (!qObj.grid || !Array.isArray(qObj.grid.rows) || !Array.isArray(qObj.grid.columns))) {
			qObj.grid = { rows: [{ text: '', criteria: '', score_enabled: true }], columns: [{ label: 'Cột 1', score: 0 }] };
		}
		const tn = card.querySelector('.sc-trac-nghiem-section');
		const gr = card.querySelector('.sc-grid-section');
		setScVisible(tn, false);
		setScVisible(gr, false);
		if (isChoiceType(qObj.type)) {
			setScVisible(tn, true);
		} else if (isGridType(qObj.type)) {
			setScVisible(gr, true);
		}
		const cw = card.querySelector('.sc-criteria-wrap');
		setScVisible(cw, !isGridType(qObj.type));
		markDirty();
	});

	card.querySelector('.sc-q-text').addEventListener('input', e => { qObj.text = e.target.value; });
	const criteriaInput = card.querySelector('.sc-q-criteria-input');
	criteriaInput.addEventListener('input', e => { qObj.criteria = e.target.value; });
	bindCriteriaAutocomplete(criteriaInput);
	card.querySelector('.sc-required-check').addEventListener('change', e => { qObj.required = e.target.checked; markDirty(); });

	const addAnswerBtn = card.querySelector('.sc-add-answer-btn');
	if (addAnswerBtn) {
		addAnswerBtn.addEventListener('click', () => {
			const list = card.querySelector('.sc-answers-list');
			const row = buildAnswerRow({ text: '', score: 0 });
			list.appendChild(row);
			bindAnswerRemove(row);
			row.querySelector('.sc-answer-text').focus();
			markDirty();
		});
	}

	card.querySelectorAll('.sc-answer-row').forEach(row => bindAnswerRemove(row));
	card.querySelector('.sc-q-delete-btn').addEventListener('click', () => {
		const all = document.querySelectorAll('#scQuestionsList .sc-q-card, #questionsList .sc-q-card');
		if (all.length <= 1) return showToast('error', 'Phải có ít nhất một câu hỏi');
		card.remove();
		markDirty();
		reindexBadges();
	});

	bindGridEvents(card);
}
function bindAnswerRemove(row) {
	row.querySelector('.sc-answer-remove').addEventListener('click', () => {
		const list = row.closest('.sc-answers-list');
		if (list.querySelectorAll('.sc-answer-row').length <= 2) return showToast('error', 'Cần ít nhất 2 phương án');
		row.remove();
		markDirty();
	});
}
function bindGridEvents(card) {
	if (card.dataset.gridBound) return;
	card.dataset.gridBound = '1';
	const addCol = card.querySelector('.sc-add-col-btn');
	if (addCol) addCol.addEventListener('click', () => addGridCol(card));
	const addRow = card.querySelector('.sc-add-row-btn');
	if (addRow) addRow.addEventListener('click', () => addGridRow(card));
	const table = card.querySelector('.sc-grid-table');
	if (!table) return;

	table.querySelector('thead').addEventListener('click', async e => {
		const button = e.target.closest('.sc-apply-col-btn');
		if (!button || button.disabled || moduleState.state.saving) return;
		const th = button.closest('th.sc-col-header');
		const input = th.querySelector('.sc-grid-score-input');
		const value = input.value;
		if (value === '' || !Number.isFinite(Number(value))) return showToast('error', 'Vui lòng nhập điểm mặc định trước khi áp dụng.');
		const revision = moduleState.state.loadRevision;
		button.disabled = true;
		try {
			const message = `Thay điểm của tất cả các hàng trong cột bằng ${Number(value)}? Điểm đã nhập sẽ bị thay thế.`;
			const confirmed = await QLPKConfirmationDialog.confirm({
				text: message,
				confirmText: 'Thay điểm',
				variant: 'warning',
				showToast: (type, msg) => QLPKUserFeedback?.show(type, msg)
			});
			if (!confirmed || revision !== moduleState.state.loadRevision || moduleState.state.saving || !th.isConnected || input.value !== value) return;
			const colIdx = [...table.querySelectorAll('thead th.sc-col-header')].indexOf(th);
			table.querySelectorAll('tbody tr').forEach(tr => {
				tr.querySelectorAll('.sc-col-cell .sc-grid-score-input')[colIdx].value = value;
			});
			markDirty();
		} finally { button.disabled = false; }
	});

	table.querySelector('thead').addEventListener('click', e => {
		const btn = e.target.closest('.sc-del-col-btn');
		if (!btn) return;
		const th = btn.closest('th.sc-col-header');
		const allTh = [...table.querySelectorAll('thead th.sc-col-header')];
		if (allTh.length <= 1) return showToast('error', 'Không thể xóa! Cần duy trì ít nhất 1 cột.');
		const colIdx = allTh.indexOf(th);
		th.remove();
		table.querySelectorAll('tbody tr').forEach(tr => tr.querySelectorAll('td.sc-col-cell')[colIdx]?.remove());
		markDirty();
	});

	table.querySelector('tbody').addEventListener('click', e => {
		const btn = e.target.closest('.sc-del-row-btn');
		if (!btn) return;
		const allTr = [...table.querySelectorAll('tbody tr')];
		if (allTr.length <= 1) return showToast('error', 'Không thể xóa! Cần duy trì ít nhất 1 hàng.');
		btn.closest('tr').remove();
		markDirty();
	});

	const tbody = table.querySelector('tbody');
	if (tbody && typeof Sortable !== 'undefined') {
		Sortable.create(tbody, { handle: '.sc-row-handle', animation: 150, ghostClass: 'sc-row-drag-ghost', onEnd: markDirty });
	}
	// Bind criteria autocomplete for grid rows
	card.querySelectorAll('.sc-grid-section .sc-q-criteria-input').forEach(inp => bindCriteriaAutocomplete(inp));
}
function addGridCol(card) {
	const table = card.querySelector('.sc-grid-table'); if (!table) return;
	const colCount = table.querySelectorAll('thead th.sc-col-header').length;
	const addTh = table.querySelector('thead tr th:last-child');
	const newTh = document.createElement('th');
	newTh.className = 'sc-col-header';
	newTh.dataset.columnId = genId();
	replace(newTh, buildColumnHeaderContent(`Cột ${colCount + 1}`, '', null));
	table.querySelector('thead tr').insertBefore(newTh, addTh);
	table.querySelectorAll('tbody tr').forEach(tr => {
		const td = document.createElement('td');
		td.className = 'sc-col-cell';
		td.append(el('input', { type: 'number', class: 'sc-grid-score-input', defaultValue: '', step: 'any', placeholder: '—' }));
		tr.insertBefore(td, tr.lastElementChild);
	});
	markDirty();
}
function addGridRow(card) {
	const tbody = card.querySelector('tbody'); if (!tbody) return;
	const table = card.querySelector('.sc-grid-table');
	const headerScoreInputs = table ? [...table.querySelectorAll('thead th.sc-col-header .sc-grid-score-input')] : [];
	const tr = document.createElement('tr');
	tr.dataset.rowId = genId();
	replace(tr, buildGridRowCells({
		text: null, criteria: null, scoreEnabled: true, criteriaHidden: false,
		scores: headerScoreInputs.map(input => input.value)
	}));
	tbody.appendChild(tr);
	const newCriteriaInput = tr.querySelector('.sc-q-criteria-input');
	if (newCriteriaInput) bindCriteriaAutocomplete(newCriteriaInput);
	markDirty();
}
function reindexBadges() {
	document.querySelectorAll('#scQuestionsList .sc-q-card, #questionsList .sc-q-card').forEach((card, i) => {
		const badge = card.querySelector('.sc-q-badge');
		if (badge) badge.textContent = `Câu ${i + 1}`;
	});
	markDirty();
}
function validateQuestions(questions) {
	const fail = message => {
		showToast('error', message);
		return false;
	};
	if (!questions.length) return fail('Phải có ít nhất một câu hỏi');
	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		const idx = i + 1;
		if (!q.text) return fail(`Vui lòng nhập nội dung cho câu ${idx}`);
		if (isChoiceType(q.type) && !q.criteria) return fail(`Vui lòng nhập tiêu chí cho câu ${idx}`);
		if (isChoiceType(q.type)) {
			if (!q.answers || q.answers.length < 2) return fail(`Câu ${idx} cần ít nhất 2 đáp án`);
			if (q.answers.some(a => !a.text)) return fail(`Vui lòng nhập đầy đủ đáp án của câu ${idx}`);
		}
		if (isGridType(q.type)) {
			if (!q.grid.columns.length || !q.grid.rows.length) return fail(`Câu ${idx} phải có ít nhất 1 hàng và 1 cột`);
			if (q.grid.columns.some(c => !c.label)) return fail(`Vui lòng nhập đầy đủ tên cột cho câu ${idx}`);
			if (q.grid.rows.some(r => !r.text || (r.score_enabled && (!r.criteria || Object.values(r.scores).some(s => s === null))))) return fail(`Vui lòng nhập nội dung, tiêu chí và điểm các hàng tính điểm ở câu ${idx}`);
		}
	}
	return true;
}
function collectData() {
	const nameEl = surveyNameInput();
	const descEl = surveyDescInput();
	const name = nameEl ? nameEl.value.trim() : '';
	const desc = descEl ? descEl.value.trim() : '';
	const performerEl = surveyPerformerInput();
	const defaultPerformerId = Number(performerEl?.value) || null;
	if (!name) {
		showToast('error', 'Vui lòng nhập tên mẫu khảo sát');
		return null;
	}

	const questions = [];
	document.querySelectorAll('#scQuestionsList .sc-q-card, #questionsList .sc-q-card').forEach((card, i) => {
		const type = normalizeQuestionType(card.querySelector('.sc-q-type').value);
		const qObj = {
			id: card.dataset.qid,
			order: i + 1,
			type,
			text: card.querySelector('.sc-q-text').value.trim(),
			criteria: card.querySelector('.sc-q-criteria-input').value.trim(),
			required: card.querySelector('.sc-required-check').checked,
		};
		if (isChoiceType(type)) {
			qObj.answers = Array.from(card.querySelectorAll('.sc-answer-row')).map(row => ({
				id: row.dataset.answerId,
				text: row.querySelector('.sc-answer-text').value.trim(),
				score: row.querySelector('.sc-answer-score').value === '' ? null : Number(row.querySelector('.sc-answer-score').value),
			}));
		} else if (isGridType(type)) {
			qObj.grid = {
				columns: Array.from(card.querySelectorAll('thead th.sc-col-header')).map((th, ci) => ({
					id: th.dataset.columnId,
					label: th.querySelector('.sc-grid-col-label')?.value.trim() || `Cột ${ci + 1}`,
					score: th.querySelector('.sc-grid-score-input')?.value === '' ? null : Number(th.querySelector('.sc-grid-score-input')?.value),
				})),
				rows: Array.from(card.querySelectorAll('tbody tr')).map(tr => ({
					id: tr.dataset.rowId,
					text: tr.querySelector('.sc-grid-row-input')?.value.trim() || '',
					criteria: tr.querySelector('.sc-grid-criteria-input')?.value.trim() || '',
					score_enabled: tr.querySelector('.sc-grid-score-enabled')?.checked ?? true,
					scores: Object.fromEntries(Array.from(card.querySelectorAll('thead th.sc-col-header')).map((th, ci) => {
						const input = tr.querySelectorAll('.sc-col-cell .sc-grid-score-input')[ci];
						return [th.dataset.columnId, input.value === '' ? null : Number(input.value)];
					})),
				})),
			};
		}
		questions.push(qObj);
	});

	if (!validateQuestions(questions)) return null;
	const content = { ...moduleState.state.content, questions };
	// Include Tab 2 result config
	if (moduleState.resultConfig) {
		content.result_config = moduleState.resultConfig.collectConfig();
		const message = moduleState.resultConfig.validateConfig();
		if (message) {
			switchTab('results');
			showToast('error', message);
			return null;
		}
	}
	return { name, description: desc, content, default_performer_id: defaultPerformerId };
}
async function save() {
	if (moduleState.state.saving || moduleState.state.loading) return;
	const saveBtn = saveButton();
	if (!saveBtn) return;
	moduleState.state.saving = true;
	saveBtn.disabled = true;

	const data = collectData();
	if (!data) { moduleState.state.saving = false; saveBtn.disabled = false; return; }

	replace(saveBtn, el('i', { class: 'bi bi-arrow-repeat sc-saving-icon' }), ' Đang lưu...');

	function resetBtn() {
		moduleState.state.saving = false;
		setSaveButtonIdle(saveBtn);
	}

	const isEdit = !!moduleState.state.templateId;
	const url = isEdit ? `/api/survey-templates/${moduleState.state.templateId}` : '/api/survey-templates';
	let json;
	try {
		const res = await fetch(url, {
			method: isEdit ? 'PUT' : 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
		});
		json = await res.json();
	} catch (e) {
		showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		resetBtn();
		return;
	}

	if (json.success) {
		moduleState.state.dirty = false;
		showToast('success', isEdit ? 'Đã cập nhật mẫu khảo sát' : 'Đã tạo mẫu khảo sát mới');
		setTimeout(() => {
			if (overlayEl()) close(true);
			const saved = new CustomEvent('qlpk:survey-template-saved', { detail: { handled: false } });
			document.dispatchEvent(saved);
			if (!saved.detail.handled) window.location.href = '/survey-template-management.html';
		}, 800);
	} else {
		showToast('error', json.code === 'SURVEY_TEMPLATE_IDENTITY_CONFLICT'
			? 'Mẫu đã có kết quả cần giữ nguyên câu hỏi và đáp án. Vui lòng tạo mẫu mới nếu cần thay đổi cấu trúc.'
			: json.message || 'Không thể lưu mẫu khảo sát. Vui lòng kiểm tra lại.');
		resetBtn();
	}
}

export { addGridCol, addGridRow, bindAnswerRemove, bindCardEvents, bindGridEvents, buildAnswerRow, buildGrid, collectData, reindexBadges, save, validateQuestions };
