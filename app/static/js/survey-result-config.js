import { moduleState } from './survey-template-create-parts/state.js';
import { buildAlertCard, buildConditionsTable, buildScoreInputs, escHtml, extractCriteriaGroups, extractQuestions, genId, readNumber } from './survey-result-config-parts/builders.js';

// Survey results configuration tab of the template modal; registers itself as moduleState.resultConfig
// so the modal (survey-template-create) can initialise, collect and validate it when this module is loaded.

let currentConfig = {
	scoring_method: 'total',
	calculation_type: 'sum',
	conditions: [],
	group_configs: {},
	special_alerts: []
};
let activeGroupTab = null;

// ─── Render entire Tab 2 ───
function render() {
	const root = document.getElementById('scResultConfigRoot');
	if (!root) return;

	const questions = extractQuestions();
	const groups = extractCriteriaGroups();

	if (questions.length === 0) {
		root.innerHTML = `<div class="sc-rc-no-questions">
				<i class="bi bi-list-check"></i>
				<p>Vui lòng cấu hình câu hỏi ở Tab 1 trước.</p>
			</div>`;
		return;
	}

	const isTotal = currentConfig.scoring_method === 'total';
	const isByGroup = currentConfig.scoring_method === 'by_group';

	let html = buildScoringMethodSection(isTotal, isByGroup);
	// ── Section: Calculation Type (only for total) ──
	if (isTotal) html += buildCalculationTypeSection();
	// ── Section: Group Tabs (only for by_group) ──
	if (isByGroup) html += buildGroupSection(groups);
	// ── Section: Conditions (for total mode) ──
	if (isTotal) {
		html += `<div class="sc-rc-section" id="scTotalConditions">
				${buildConditionsTable(currentConfig.conditions)}
			</div>`;
	}
	html += buildSpecialAlertsSection(questions);

	root.innerHTML = html;
	bindEvents();
}

// ── Section: Scoring Method ──
function buildScoringMethodSection(isTotal, isByGroup) {
	return `<div class="sc-rc-section">
			<h3 class="sc-rc-title">Cấu hình kết quả hiển thị khảo sát</h3>
			<p class="sc-rc-subtitle">Thiết lập cách thức trả kết quả sau khi bệnh nhân hoàn thành khảo sát</p>
			<div class="sc-rc-methods">
				<label class="sc-rc-method-card ${isTotal ? 'active' : ''}" data-method="total">
					<input type="radio" name="scScoringMethod" value="total" ${isTotal ? 'checked' : ''}>
					<i class="bi bi-list-ol sc-rc-method-icon"></i>
					<div>
						<div class="sc-rc-method-label">Theo khoảng điểm tổng</div>
						<div class="sc-rc-method-desc">Tính điểm khảo sát dựa trên cơ chế tính tổng điểm các câu hỏi bệnh nhân trả lời</div>
					</div>
				</label>
				<label class="sc-rc-method-card ${isByGroup ? 'active' : ''}" data-method="by_group">
					<input type="radio" name="scScoringMethod" value="by_group" ${isByGroup ? 'checked' : ''}>
					<i class="bi bi-grid-3x3-gap sc-rc-method-icon"></i>
					<div>
						<div class="sc-rc-method-label">Theo khoảng điểm từng nhóm</div>
						<div class="sc-rc-method-desc">Tính điểm khảo sát dựa trên cơ chế tính điểm theo nhóm tiêu chí câu hỏi</div>
					</div>
				</label>
			</div>
		</div>`;
}

function buildCalculationTypeSection() {
	const ct = currentConfig.calculation_type || 'sum';
	let html = `<div class="sc-rc-section" id="scCalcTypeSection">
			<div class="sc-rc-calc-wrap">
				<div class="sc-rc-calc-title">Chọn phương thức tính</div>
				<div class="sc-rc-calc-options">
					<label class="sc-rc-calc-option ${ct === 'sum' ? 'active' : ''}">
						<input type="radio" name="scCalcType" value="sum" ${ct === 'sum' ? 'checked' : ''}> Tính tổng
					</label>
					<label class="sc-rc-calc-option ${ct === 'average' ? 'active' : ''}">
						<input type="radio" name="scCalcType" value="average" ${ct === 'average' ? 'checked' : ''}> Tính trung bình
					</label>
					<label class="sc-rc-calc-option ${ct === 'scale_conversion' ? 'active' : ''}">
						<input type="radio" name="scCalcType" value="scale_conversion" ${ct === 'scale_conversion' ? 'checked' : ''}> Quy đổi điểm
					</label>
				</div>
			</div>
		</div>`;
	if (ct === 'scale_conversion') html += `<div class="sc-rc-section">
			<p>Điểm quy đổi = Tổng điểm × Hệ số + Số cộng</p>
			<label>Hệ số <input type="number" step="any" class="sc-rc-conversion-factor" value="${currentConfig.conversion?.factor ?? ''}" required></label>
			<label>Số cộng <input type="number" step="any" class="sc-rc-conversion-offset" value="${currentConfig.conversion?.offset ?? ''}" required></label>
		</div>`;
	return html;
}

function buildGroupSection(groups) {
	if (groups.length === 0) {
		return `<div class="sc-rc-section"><div class="sc-rc-calc-wrap">
				<p class="sc-rc-empty-message"><i class="bi bi-info-circle me-1"></i>Không tìm thấy nhóm tiêu chí nào. Vui lòng nhập tiêu chí cho câu hỏi ở Tab 1.</p>
			</div></div>`;
	}
	// Initialize group_configs for new groups
	groups.forEach(g => {
		if (!currentConfig.group_configs[g]) {
			currentConfig.group_configs[g] = { conditions: [] };
		}
	});
	// Remove stale groups
	Object.keys(currentConfig.group_configs).forEach(key => {
		if (!groups.includes(key)) delete currentConfig.group_configs[key];
	});
	if (!activeGroupTab || !groups.includes(activeGroupTab)) {
		activeGroupTab = groups[0];
	}

	const tabsHtml = groups.map(g =>
		`<button class="sc-rc-group-tab ${g === activeGroupTab ? 'active' : ''}" data-group="${escHtml(g)}">${escHtml(g)}</button>`
	).join('');

	const activeConditions = currentConfig.group_configs[activeGroupTab]?.conditions || [];

	return `<div class="sc-rc-section" id="scGroupSection">
			<div class="sc-rc-group-wrap">
				<div class="sc-rc-calc-title">Chọn nhóm cấu hình</div>
				<div class="sc-rc-group-tabs">${tabsHtml}</div>
				<div class="sc-rc-group-label">Cấu hình thang điểm cho nhóm: <strong>${escHtml(activeGroupTab)}</strong></div>
			</div>
			<div id="scGroupConditions">${buildConditionsTable(activeConditions)}</div>
		</div>`;
}

// ── Section: Special Alerts ──
function buildSpecialAlertsSection(questions) {
	return `<div class="sc-rc-section" id="scAlertSection">
			<div class="sc-rc-alerts-header">
				<div class="sc-rc-alerts-title"><i class="bi bi-exclamation-circle-fill"></i> Lưu ý đặc biệt</div>
				<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="sc-rc-add-btn sc-rc-add-alert"><i class="bi bi-plus"></i> Thêm lưu ý</button>
			</div>
			<div id="scAlertsList">
				${currentConfig.special_alerts.map(a => buildAlertCard(a, questions)).join('')}
			</div>
		</div>`;
}

function createDefaultCondition() {
	return { id: genId('cond'), operator: 'between', min_score: null, max_score: null, conclusion: '', note: '' };
}

// ─── Bind all events ───
// Save the conditions being edited, apply `update`, then re-render.
function rerenderAfter(update) {
	saveCurrentConditions();
	update();
	render();
}

function bindConfigSwitches(root) {
	// Scoring method change
	root.querySelectorAll('input[name="scScoringMethod"]').forEach(radio => {
		radio.addEventListener('change', () => rerenderAfter(() => { currentConfig.scoring_method = radio.value; }));
	});
	// Calculation type change
	root.querySelectorAll('input[name="scCalcType"]').forEach(radio => {
		radio.addEventListener('change', () => rerenderAfter(() => { currentConfig.calculation_type = radio.value; }));
	});
	// Group tab click
	root.querySelectorAll('.sc-rc-group-tab').forEach(btn => {
		btn.addEventListener('click', () => rerenderAfter(() => { activeGroupTab = btn.dataset.group; }));
	});
}

function changeConditionOperator(select) {
	const tr = select.closest('tr');
	const cell = tr.querySelector('.sc-rc-score-cell');
	const cond = findCondition(tr.dataset.condId);
	if (!cond) return;
	// Capture the inputs for the previous operator before replacing them.
	cond.min_score = readNumber(cell.querySelector(cond.operator === 'between'
		? '.sc-rc-min-score' : '.sc-rc-single-score'));
	cond.max_score = cond.operator === 'between' ? readNumber(cell.querySelector('.sc-rc-max-score')) : null;
	cond.operator = select.value;
	cell.innerHTML = buildScoreInputs(cond);
}

function addCondition() {
	const newCond = createDefaultCondition();
	if (currentConfig.scoring_method === 'total') {
		currentConfig.conditions.push(newCond);
	} else if (activeGroupTab && currentConfig.group_configs[activeGroupTab]) {
		currentConfig.group_configs[activeGroupTab].conditions.push(newCond);
	}
}

function addAlert() {
	saveCurrentConditions();
	const questions = extractQuestions();
	const newAlert = {
		id: genId('alert'),
		question_id: questions[0]?.id || '',
		operator: '>=',
		threshold: null,
		conclusion: '',
		note: ''
	};
	currentConfig.special_alerts.push(newAlert);
	const list = document.getElementById('scAlertsList');
	if (list) {
		list.insertAdjacentHTML('beforeend', buildAlertCard(newAlert, questions));
		bindAlertDel(list.lastElementChild);
	}
}

function bindEvents() {
	const root = document.getElementById('scResultConfigRoot');
	if (!root) return;

	bindConfigSwitches(root);

	// Condition operator change
	root.querySelectorAll('.sc-rc-cond-operator').forEach(select => {
		select.addEventListener('change', () => changeConditionOperator(select));
	});

	// Add condition
	root.querySelectorAll('.sc-rc-add-cond').forEach(btn => {
		btn.addEventListener('click', () => rerenderAfter(addCondition));
	});

	// Delete condition
	root.querySelectorAll('.sc-rc-del-cond').forEach(btn => {
		btn.addEventListener('click', () => {
			const tr = btn.closest('tr');
			const condId = tr.dataset.condId;
			removeCondition(condId);
			tr.remove();
		});
	});

	// Add alert
	const addAlertBtn = root.querySelector('.sc-rc-add-alert');
	if (addAlertBtn) addAlertBtn.addEventListener('click', addAlert);

	// Delete alert
	root.querySelectorAll('.sc-rc-alert-card').forEach(card => bindAlertDel(card));
}

function bindAlertDel(card) {
	const del = card.querySelector('.sc-rc-alert-del');
	if (del) {
		del.addEventListener('click', () => {
			const alertId = card.dataset.alertId;
			currentConfig.special_alerts = currentConfig.special_alerts.filter(a => a.id !== alertId);
			card.remove();
		});
	}
}

function findCondition(condId) {
	if (currentConfig.scoring_method === 'total') {
		return currentConfig.conditions.find(c => c.id === condId);
	}
	if (activeGroupTab && currentConfig.group_configs[activeGroupTab]) {
		return currentConfig.group_configs[activeGroupTab].conditions.find(c => c.id === condId);
	}
	return null;
}

function removeCondition(condId) {
	if (currentConfig.scoring_method === 'total') {
		currentConfig.conditions = currentConfig.conditions.filter(c => c.id !== condId);
	} else if (activeGroupTab && currentConfig.group_configs[activeGroupTab]) {
		currentConfig.group_configs[activeGroupTab].conditions =
			currentConfig.group_configs[activeGroupTab].conditions.filter(c => c.id !== condId);
	}
}

// ─── Save DOM state back to currentConfig ───
function saveCurrentConditions() {
	const root = document.getElementById('scResultConfigRoot');
	if (!root) return;

	// Save conditions from table
	const condTarget = currentConfig.scoring_method === 'total'
		? currentConfig.conditions
		: (activeGroupTab && currentConfig.group_configs[activeGroupTab]?.conditions);

	if (condTarget) {
		root.querySelectorAll('.sc-rc-cond-table tbody tr').forEach(tr => {
			const condId = tr.dataset.condId;
			const cond = condTarget.find(c => c.id === condId);
			if (!cond) return;
			cond.operator = tr.querySelector('.sc-rc-cond-operator')?.value || 'between';
			if (cond.operator === 'between') {
				cond.min_score = readNumber(tr.querySelector('.sc-rc-min-score'));
				cond.max_score = readNumber(tr.querySelector('.sc-rc-max-score'));
			} else {
				cond.min_score = readNumber(tr.querySelector('.sc-rc-single-score'));
				cond.max_score = null;
			}
			const inputs = tr.querySelectorAll('.sc-rc-cond-input[type="text"]');
			cond.conclusion = inputs[0]?.value?.trim() || '';
			cond.note = inputs[1]?.value?.trim() || '';
		});
	}

	// Save calculation type
	const calcRadio = root.querySelector('input[name="scCalcType"]:checked');
	if (calcRadio) currentConfig.calculation_type = calcRadio.value;
	const factor = root.querySelector('.sc-rc-conversion-factor');
	const offset = root.querySelector('.sc-rc-conversion-offset');
	if (factor && offset) currentConfig.conversion = {
		factor: factor.value === '' ? null : Number(factor.value),
		offset: offset.value === '' ? null : Number(offset.value)
	};

	// Save alerts
	saveAlerts();
}

function saveAlerts() {
	const root = document.getElementById('scResultConfigRoot');
	if (!root) return;
	if (!root.querySelector('#scAlertsList')) return;
	currentConfig.special_alerts = [];
	root.querySelectorAll('.sc-rc-alert-card').forEach(card => {
		currentConfig.special_alerts.push({
			id: card.dataset.alertId,
			question_id: card.querySelector('.sc-rc-alert-question')?.value || '',
			operator: card.querySelector('.sc-rc-alert-operator')?.value || '>=',
			threshold: readNumber(card.querySelector('.sc-rc-alert-threshold')),
			conclusion: card.querySelector('.sc-rc-alert-conclusion')?.value?.trim() || '',
			note: card.querySelector('.sc-rc-alert-note')?.value?.trim() || ''
		});
	});
}

// ─── Public API ───
function initTab(savedConfig) {
	if (savedConfig && typeof savedConfig === 'object') {
		const saved = structuredClone(savedConfig);
		currentConfig = {
			...saved,
			scoring_method: saved.scoring_method || 'total',
			calculation_type: saved.calculation_type || 'sum',
			conditions: Array.isArray(saved.conditions) ? saved.conditions : [],
			group_configs: saved.group_configs || {},
			special_alerts: Array.isArray(saved.special_alerts) ? saved.special_alerts : []
		};
	} else {
		currentConfig = {
			scoring_method: 'total',
			calculation_type: 'sum',
			conditions: [],
			group_configs: {},
			special_alerts: []
		};
	}
	// Seeded/API configurations may omit editor-only IDs. Give each row an
	// identity so editing and collecting it cannot silently keep old values.
	const usedIds = new Set();
	const rows = [...currentConfig.conditions,
		...Object.values(currentConfig.group_configs).flatMap(group => group.conditions || []),
		...currentConfig.special_alerts];
	rows.forEach(row => {
		if (!row.id || usedIds.has(String(row.id))) row.id = genId('config');
		row.id = String(row.id);
		usedIds.add(row.id);
	});
	activeGroupTab = null;
	render();
}

function collectConfig() {
	saveCurrentConditions();
	return JSON.parse(JSON.stringify(currentConfig));
}

function resetConfig() {
	currentConfig = { scoring_method: 'total', calculation_type: 'sum', conditions: [], group_configs: {}, special_alerts: [] };
	activeGroupTab = null;
	const root = document.getElementById('scResultConfigRoot');
	if (root) root.innerHTML = '';
}

function validateConditionGroup(name, conditions) {
	for (const [index, condition] of conditions.entries()) {
		const between = condition.operator === 'between';
		if (!Number.isFinite(condition.min_score) || (between && !Number.isFinite(condition.max_score)))
			return `Vui lòng nhập đủ ngưỡng điểm cho điều kiện ${index + 1} (${name}).`;
		if (between && condition.min_score > condition.max_score)
			return `Ngưỡng từ phải nhỏ hơn hoặc bằng ngưỡng đến ở điều kiện ${index + 1} (${name}).`;
	}
	return null;
}

function needsConversionValues(config) {
	return config.scoring_method === 'total' && config.calculation_type === 'scale_conversion'
		&& (!Number.isFinite(config.conversion?.factor) || !Number.isFinite(config.conversion?.offset));
}

function validateConfig() {
	const config = currentConfig;
	const groups = [['điểm tổng', config.conditions], ...Object.entries(config.group_configs).map(([name, group]) => [name, group.conditions || []])];
	for (const [name, conditions] of groups) {
		const error = validateConditionGroup(name, conditions);
		if (error) return error;
	}
	if (needsConversionValues(config)) return 'Vui lòng nhập hệ số và số cộng để quy đổi điểm.';
	for (const [index, alert] of config.special_alerts.entries()) {
		if (!alert.question_id || !Number.isFinite(alert.threshold))
			return `Vui lòng chọn câu hỏi và nhập ngưỡng điểm cho lưu ý ${index + 1}.`;
	}
	return null;
}

moduleState.resultConfig = { initTab, collectConfig, resetConfig, render, validateConfig };
