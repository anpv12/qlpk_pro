/* survey-result-config.js
 * Tab 2: Cấu hình kết quả khảo sát
 * Depends on: survey-template-create.js (exposes window._scResultConfig)
 */
(function () {
	'use strict';

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

	let currentConfig = {
		scoring_method: 'total',
		calculation_type: 'sum',
		conditions: [],
		group_configs: {},
		special_alerts: []
	};
	let activeGroupTab = null;

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
		document.querySelectorAll('#scQuestionsList .sc-q-card').forEach(card => {
			// Multiple choice: single criteria input
			const ci = card.querySelector('.sc-q-criteria-input');
			if (ci && ci.value.trim() && ci.style.display !== 'none') {
				groups.add(ci.value.trim());
			}
			// Grid: per-row criteria
			card.querySelectorAll('.sc-grid-criteria-input').forEach(gi => {
				if (gi.value.trim()) groups.add(gi.value.trim());
			});
		});
		return [...groups];
	}

	// ─── Extract questions list from Tab 1 ───
	function extractQuestions() {
		const questions = [];
		document.querySelectorAll('#scQuestionsList .sc-q-card').forEach((card, idx) => {
			const qid = card.dataset.qid;
			const text = card.querySelector('.sc-q-text')?.value?.trim() || '';
			if (text) {
				questions.push({ id: qid, text: text, label: `Câu ${idx + 1}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}` });
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
				<input type="number" class="sc-rc-cond-input sc-rc-min-score" value="${cond.min_score ?? 0}" min="0">
				<span class="sc-rc-score-sep">-</span>
				<input type="number" class="sc-rc-cond-input sc-rc-max-score" value="${cond.max_score ?? 0}" min="0">
			</div>`;
		}
		return `<input type="number" class="sc-rc-cond-input sc-rc-single-score" value="${cond.min_score ?? 0}" min="0">`;
	}

	// ─── Build a single condition row ───
	function buildConditionRow(cond) {
		return `<tr data-cond-id="${cond.id}">
			<td><select class="sc-rc-cond-select sc-rc-cond-operator">${buildOperatorOptions(cond.operator, OPERATORS)}</select></td>
			<td class="sc-rc-score-cell">${buildScoreInputs(cond)}</td>
			<td><input type="text" class="sc-rc-cond-input" placeholder="Nhập kết luận..." value="${escHtml(cond.conclusion || '')}"></td>
			<td><input type="text" class="sc-rc-cond-input" placeholder="Nhập lưu ý..." value="${escHtml(cond.note || '')}"></td>
			<td><button class="sc-rc-del-btn sc-rc-del-cond" title="Xóa"><i class="bi bi-trash"></i></button></td>
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
		<button class="sc-rc-add-btn sc-rc-add-cond"><i class="bi bi-plus"></i> Thêm điều kiện</button>`;
	}

	// ─── Build alert card ───
	function buildAlertCard(alert, questions) {
		const qOptions = questions.map(q =>
			`<option value="${q.id}" ${alert.question_id === q.id ? 'selected' : ''}>${escHtml(q.label)}</option>`
		).join('');

		return `<div class="sc-rc-alert-card" data-alert-id="${alert.id}">
			<button class="sc-rc-alert-del" title="Xóa"><i class="bi bi-x-lg"></i></button>
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
						<input type="number" class="sc-rc-cond-input sc-rc-alert-threshold" value="${alert.threshold ?? 0}" min="0">
					</div>
				</div>
				<div class="sc-rc-alert-field">
					<label>Lưu ý</label>
					<input type="text" class="sc-rc-cond-input sc-rc-alert-note" placeholder="Nhập lưu ý..." value="${escHtml(alert.note || '')}">
				</div>
			</div>
		</div>`;
	}

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

		// ── Section: Scoring Method ──
		let html = `<div class="sc-rc-section">
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

		// ── Section: Calculation Type (only for total) ──
		if (isTotal) {
			const ct = currentConfig.calculation_type || 'sum';
			html += `<div class="sc-rc-section" id="scCalcTypeSection">
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
							<input type="radio" name="scCalcType" value="scale_conversion" ${ct === 'scale_conversion' ? 'checked' : ''}> Quy đổi thang chuẩn
						</label>
					</div>
				</div>
			</div>`;
		}

		// ── Section: Group Tabs (only for by_group) ──
		if (isByGroup) {
			if (groups.length === 0) {
				html += `<div class="sc-rc-section"><div class="sc-rc-calc-wrap">
					<p class="sc-rc-empty-message"><i class="bi bi-info-circle me-1"></i>Không tìm thấy nhóm tiêu chí nào. Vui lòng nhập tiêu chí cho câu hỏi ở Tab 1.</p>
				</div></div>`;
			} else {
				// Initialize group_configs for new groups
				groups.forEach(g => {
					if (!currentConfig.group_configs[g]) {
						currentConfig.group_configs[g] = { conditions: [createDefaultCondition()] };
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

				html += `<div class="sc-rc-section" id="scGroupSection">
					<div class="sc-rc-group-wrap">
						<div class="sc-rc-calc-title">Chọn nhóm cấu hình</div>
						<div class="sc-rc-group-tabs">${tabsHtml}</div>
						<div class="sc-rc-group-label">Cấu hình thang điểm cho nhóm: <strong>${escHtml(activeGroupTab)}</strong></div>
					</div>
					<div id="scGroupConditions">${buildConditionsTable(activeConditions)}</div>
				</div>`;
			}
		}

		// ── Section: Conditions (for total mode) ──
		if (isTotal) {
			if (currentConfig.conditions.length === 0) {
				currentConfig.conditions.push(createDefaultCondition());
			}
			html += `<div class="sc-rc-section" id="scTotalConditions">
				${buildConditionsTable(currentConfig.conditions)}
			</div>`;
		}

		// ── Section: Special Alerts ──
		html += `<div class="sc-rc-section" id="scAlertSection">
			<div class="sc-rc-alerts-header">
				<div class="sc-rc-alerts-title"><i class="bi bi-exclamation-circle-fill"></i> Lưu ý đặc biệt</div>
				<button class="sc-rc-add-btn sc-rc-add-alert"><i class="bi bi-plus"></i> Thêm lưu ý</button>
			</div>
			<div id="scAlertsList">
				${currentConfig.special_alerts.map(a => buildAlertCard(a, questions)).join('')}
			</div>
		</div>`;

		root.innerHTML = html;
		bindEvents();
	}

	function createDefaultCondition() {
		return { id: genId('cond'), operator: 'between', min_score: 0, max_score: 0, conclusion: '', note: '' };
	}

	// ─── Bind all events ───
	function bindEvents() {
		const root = document.getElementById('scResultConfigRoot');
		if (!root) return;

		// Scoring method change
		root.querySelectorAll('input[name="scScoringMethod"]').forEach(radio => {
			radio.addEventListener('change', () => {
				saveCurrentConditions();
				currentConfig.scoring_method = radio.value;
				render();
			});
		});

		// Calculation type change
		root.querySelectorAll('input[name="scCalcType"]').forEach(radio => {
			radio.addEventListener('change', () => {
				currentConfig.calculation_type = radio.value;
				root.querySelectorAll('.sc-rc-calc-option').forEach(lbl => lbl.classList.remove('active'));
				radio.closest('.sc-rc-calc-option').classList.add('active');
			});
		});

		// Group tab click
		root.querySelectorAll('.sc-rc-group-tab').forEach(btn => {
			btn.addEventListener('click', () => {
				saveCurrentConditions();
				activeGroupTab = btn.dataset.group;
				render();
			});
		});

		// Condition operator change
		root.querySelectorAll('.sc-rc-cond-operator').forEach(select => {
			select.addEventListener('change', () => {
				const tr = select.closest('tr');
				const cell = tr.querySelector('.sc-rc-score-cell');
				const condId = tr.dataset.condId;
				const cond = findCondition(condId);
				if (cond) {
					cond.operator = select.value;
					cell.innerHTML = buildScoreInputs(cond);
				}
			});
		});

		// Add condition
		root.querySelectorAll('.sc-rc-add-cond').forEach(btn => {
			btn.addEventListener('click', () => {
				saveCurrentConditions();
				const newCond = createDefaultCondition();
				if (currentConfig.scoring_method === 'total') {
					currentConfig.conditions.push(newCond);
				} else if (activeGroupTab && currentConfig.group_configs[activeGroupTab]) {
					currentConfig.group_configs[activeGroupTab].conditions.push(newCond);
				}
				render();
			});
		});

		// Delete condition
		root.querySelectorAll('.sc-rc-del-cond').forEach(btn => {
			btn.addEventListener('click', () => {
				const tr = btn.closest('tr');
				const condId = tr.dataset.condId;
				removeCondition(condId);
				tr.remove();
				// Ensure at least 1 row
				const tbody = root.querySelector('.sc-rc-cond-table tbody');
				if (tbody && tbody.children.length === 0) {
					saveCurrentConditions();
					if (currentConfig.scoring_method === 'total') {
						currentConfig.conditions.push(createDefaultCondition());
					} else if (activeGroupTab && currentConfig.group_configs[activeGroupTab]) {
						currentConfig.group_configs[activeGroupTab].conditions.push(createDefaultCondition());
					}
					render();
				}
			});
		});

		// Add alert
		const addAlertBtn = root.querySelector('.sc-rc-add-alert');
		if (addAlertBtn) {
			addAlertBtn.addEventListener('click', () => {
				saveCurrentConditions();
				const questions = extractQuestions();
				const newAlert = {
					id: genId('alert'),
					question_id: questions[0]?.id || '',
					operator: '>=',
					threshold: 0,
					conclusion: '',
					note: ''
				};
				currentConfig.special_alerts.push(newAlert);
				const list = document.getElementById('scAlertsList');
				if (list) {
					list.insertAdjacentHTML('beforeend', buildAlertCard(newAlert, questions));
					bindAlertDel(list.lastElementChild);
				}
			});
		}

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
					cond.min_score = parseInt(tr.querySelector('.sc-rc-min-score')?.value, 10) || 0;
					cond.max_score = parseInt(tr.querySelector('.sc-rc-max-score')?.value, 10) || 0;
				} else {
					cond.min_score = parseInt(tr.querySelector('.sc-rc-single-score')?.value, 10) || 0;
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

		// Save alerts
		saveAlerts();
	}

	function saveAlerts() {
		const root = document.getElementById('scResultConfigRoot');
		if (!root) return;
		currentConfig.special_alerts = [];
		root.querySelectorAll('.sc-rc-alert-card').forEach(card => {
			currentConfig.special_alerts.push({
				id: card.dataset.alertId,
				question_id: card.querySelector('.sc-rc-alert-question')?.value || '',
				operator: card.querySelector('.sc-rc-alert-operator')?.value || '>=',
				threshold: parseInt(card.querySelector('.sc-rc-alert-threshold')?.value, 10) || 0,
				conclusion: card.querySelector('.sc-rc-alert-conclusion')?.value?.trim() || '',
				note: card.querySelector('.sc-rc-alert-note')?.value?.trim() || ''
			});
		});
	}

	// ─── Public API ───
	function initTab(savedConfig) {
		if (savedConfig && typeof savedConfig === 'object') {
			currentConfig = {
				scoring_method: savedConfig.scoring_method || 'total',
				calculation_type: savedConfig.calculation_type || 'sum',
				conditions: Array.isArray(savedConfig.conditions) ? savedConfig.conditions : [],
				group_configs: savedConfig.group_configs || {},
				special_alerts: Array.isArray(savedConfig.special_alerts) ? savedConfig.special_alerts : []
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

	window._scResultConfig = { initTab, collectConfig, resetConfig, render };
})();
