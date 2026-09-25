/* survey-template-create.js
 * Modal module: Tạo mới / Chỉnh sửa Mẫu khảo sát
 * Expose: window.surveyCreateModal.open(mode, templateId)
 */

(function () {
	'use strict';

	function normalizeSearchText(value) {
		return window.QLPKSearchNormalization?.normalizeSearchText(value)
			|| String(value || '').toLowerCase().trim();
	}

	const Q_TYPE = Object.freeze({
		MULTIPLE_CHOICE: 'multiple_choice',
		MULTIPLE_CHOICE_GRID: 'multiple_choice_grid'
	});

	const QUESTION_TYPE_ALIASES = Object.freeze({
		multiple_choice: Q_TYPE.MULTIPLE_CHOICE,
		trac_nghiem: Q_TYPE.MULTIPLE_CHOICE,
		scale: Q_TYPE.MULTIPLE_CHOICE,
		multiple_choice_grid: Q_TYPE.MULTIPLE_CHOICE_GRID,
		luoi_trac_nghiem: Q_TYPE.MULTIPLE_CHOICE_GRID,
		checkbox_grid: Q_TYPE.MULTIPLE_CHOICE_GRID
	});

	const state = {
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

	let criteriaCache = null;
	let performersPromise = null;

	function byId(...ids) {
		for (const id of ids) {
			const el = document.getElementById(id);
			if (el) return el;
		}
		return null;
	}

	function surveyNameInput() { return byId('scSurveyName', 'surveyName'); }
	function surveyDescInput() { return byId('scSurveyDesc', 'surveyDesc'); }
	function surveyPerformerInput() { return byId('scSurveyPerformer', 'surveyPerformer'); }
	function questionsListEl() { return byId('scQuestionsList', 'questionsList'); }
	function saveButton() { return byId('scSaveBtn', 'saveBtn'); }
	function addQuestionButton() { return byId('scAddQuestionBtn', 'addQuestionBtn'); }
	function pageTitleEl() { return byId('scPageTitle', 'pageTitle'); }
	function overlayEl() { return byId('surveyCreateOverlay'); }

	function setScVisible(element, isVisible) {
		if (!element) return;
		element.classList.toggle('sc-hidden', !isVisible);
	}

	function setSaveButtonIdle(btn = saveButton()) {
		if (!btn) return;
		btn.disabled = false;
		btn.innerHTML = '<i class="bi bi-check2 sc-save-icon"></i> Lưu';
	}

	function showToast(type, message) {
		return window.QLPKUserFeedback?.show(type, message);
	}

	function authHeaders(extra = {}) {
		const token = localStorage.getItem('qlpk_token') || localStorage.getItem('access_token') || '';
		return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
	}

	function renderPerformerOptions(selectedId = state.defaultPerformerId) {
		const select = surveyPerformerInput();
		if (!select) return;
		select.innerHTML = '<option value="">Chưa gán (chọn sau khi chỉ định)</option>' + state.performers.map(user => {
			const id = Number(user.id || user.user_id);
			const name = String(user.full_name || user.name || user.username || '').trim();
			return id && name ? `<option value="${id}">${escHtml(name)}</option>` : '';
		}).join('');
		const normalizedId = Number(selectedId) || 0;
		select.value = normalizedId && Array.from(select.options).some(option => option.value === String(normalizedId))
			? String(normalizedId)
			: '';
	}

	async function loadPerformers() {
		const select = surveyPerformerInput();
		if (!select) return [];
		if (!performersPromise) {
			performersPromise = fetch('/users/doctors', { headers: authHeaders() })
				.then(response => response.ok ? response.json() : [])
				.then(data => Array.isArray(data) ? data : [])
				.catch(() => []);
		}
		state.performers = await performersPromise;
		renderPerformerOptions();
		return state.performers;
	}

	async function fetchCriteria() {
		if (criteriaCache) return criteriaCache;
		try {
			const res = await fetch('/api/survey-criteria/', {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			const json = await res.json();
			criteriaCache = json.success ? json.data : [];
		} catch (_) {
			criteriaCache = [];
		}
		return criteriaCache;
	}

	async function createCriteria(name) {
		try {
			const res = await fetch('/api/survey-criteria/', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name })
			});
			const json = await res.json();
			if (json.success && json.data) {
				if (criteriaCache && !criteriaCache.find(c => c.id === json.data.id)) {
					criteriaCache.push(json.data);
				}
				return json.data;
			}
		} catch (_) {}
		return null;
	}

	function bindCriteriaAutocomplete(input) {
		if (input.dataset.criteriaBound) return;
		input.dataset.criteriaBound = '1';
		const wrapper = input.closest('.sc-criteria-wrap');
		if (!wrapper) return;
		const dropdown = wrapper.querySelector('.sc-criteria-dropdown');
		if (!dropdown) return;

		function renderDropdown(items, query) {
			let html = '';
			if (items.length === 0 && query) {
				html = `<div class="sc-criteria-item sc-criteria-create" data-name="${escHtml(query)}"><i class="bi bi-plus-circle"></i> Tạo mới: "${escHtml(query)}"</div>`;
			} else {
				items.forEach(c => {
					html += `<div class="sc-criteria-item" data-name="${escHtml(c.name)}">${escHtml(c.name)}</div>`;
				});
				if (query && !items.find(c => normalizeSearchText(c.name) === normalizeSearchText(query))) {
					html += `<div class="sc-criteria-item sc-criteria-create" data-name="${escHtml(query)}"><i class="bi bi-plus-circle"></i> Tạo mới: "${escHtml(query)}"</div>`;
				}
			}
			dropdown.innerHTML = html;
			setScVisible(dropdown, !!html);
			dropdown.querySelectorAll('.sc-criteria-item').forEach(item => {
				item.addEventListener('mousedown', async (e) => {
					e.preventDefault();
					const name = item.dataset.name;
					if (item.classList.contains('sc-criteria-create')) {
						await createCriteria(name);
					}
					input.value = name;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					setScVisible(dropdown, false);
					markDirty();
				});
			});
		}

		input.addEventListener('focus', async () => {
			const list = await fetchCriteria();
			const q = normalizeSearchText(input.value);
			const filtered = q ? list.filter(c => normalizeSearchText(c.name).includes(q)) : list;
			renderDropdown(filtered, input.value.trim());
		});

		input.addEventListener('input', async () => {
			const list = await fetchCriteria();
			const q = normalizeSearchText(input.value);
			const filtered = q ? list.filter(c => normalizeSearchText(c.name).includes(q)) : list;
			renderDropdown(filtered, input.value.trim());
		});

		input.addEventListener('blur', () => {
			setTimeout(() => { setScVisible(dropdown, false); }, 200);
		});
	}

	function normalizeQuestionType(type) {
		return QUESTION_TYPE_ALIASES[String(type || '').trim()] || Q_TYPE.MULTIPLE_CHOICE;
	}

	function isChoiceType(type) {
		return normalizeQuestionType(type) === Q_TYPE.MULTIPLE_CHOICE;
	}

	function isGridType(type) {
		return normalizeQuestionType(type) === Q_TYPE.MULTIPLE_CHOICE_GRID;
	}


	function genId() {
		return 'q_' + Math.random().toString(36).slice(2, 9);
	}

	function retainedId(id) {
		return id === undefined || id === null || id === '' ? genId() : id;
	}

	function escHtml(str) {
		if (str === undefined || str === null) return '';
		return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function hasUnsavedChanges() {
		return state.dirty && !state.saving;
	}

	function markDirty() {
		if (!state.loading) state.dirty = true;
	}

	function resetState() {
		state.loadRevision += 1;
		state.content = {};
		state.templateId = null;
		state.questionCounter = 0;
		state.dirty = false;
		state.loading = false;
		state.saving = false;
		state.defaultPerformerId = null;
		const nameEl = surveyNameInput();
		const descEl = surveyDescInput();
		const list = questionsListEl();
		if (nameEl) nameEl.value = '';
		byId('scValidationMessage')?.remove();
		if (descEl) descEl.value = '';
		if (list) list.innerHTML = '';
		renderPerformerOptions();
		setSaveButtonIdle();
		criteriaCache = null;
		if (window._scResultConfig) window._scResultConfig.resetConfig();
	}

	async function open(mode, templateId) {
		if (state.saving) return;
		resetState();
		const revision = state.loadRevision;
		state.loading = true;
		saveButton().disabled = true;
		try {
			const response = await fetch('/api/survey-templates/access', { headers: authHeaders() });
			const access = await response.json();
			if (revision !== state.loadRevision) return;
			if (!response.ok || !access.can_manage) {
				showToast('error', 'Bạn không có quyền quản lý mẫu khảo sát.');
				return;
			}
		} catch (_) {
			if (revision === state.loadRevision) showToast('error', 'Không thể kiểm tra quyền. Vui lòng thử lại.');
			return;
		}
		state.loading = false;
		setSaveButtonIdle();
		const overlay = overlayEl();
		const title = pageTitleEl();
		if (mode === 'edit' && templateId) {
			state.templateId = templateId;
			if (title) title.textContent = 'Chỉnh sửa khảo sát';
			loadTemplate(templateId);
		} else {
			if (title) title.textContent = 'Tạo mới khảo sát';
		}
		loadPerformers();
		switchTab('questions');
		if (overlay) {
			overlay.classList.add('sc-open');
			document.body.classList.add('sc-body-lock');
		}
	}

	async function close(force = false) {
		if (state.saving && force !== true) return;
		if (!force && hasUnsavedChanges()) {
			const confirmed = await (window.CustomModal ? window.CustomModal.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?') : Promise.resolve(window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?')));
			if (!confirmed) return;
		}
		const overlay = overlayEl();
		if (overlay) {
			overlay.classList.remove('sc-open');
			document.body.classList.remove('sc-body-lock');
		}
		resetState();
	}

	function init() {
		const closeBtn = byId('scCloseBtn');
		const saveBtn = saveButton();
		const addBtn = addQuestionButton();
		const overlay = overlayEl();
		const dirtyRoot = overlay || document.querySelector('.sc-main') || document;
		const list = questionsListEl();
		if (closeBtn) closeBtn.addEventListener('click', () => close());
		if (saveBtn) saveBtn.addEventListener('click', () => save());
		if (addBtn) addBtn.addEventListener('click', addQuestion);
		dirtyRoot.addEventListener('input', markDirty);
		dirtyRoot.addEventListener('change', markDirty);
		document.querySelectorAll('[data-sc-tab], [data-tab]').forEach(btn => {
			btn.addEventListener('click', () => switchTab(btn.dataset.scTab || btn.dataset.tab));
		});
		if (list && typeof Sortable !== 'undefined') {
			new Sortable(list, {
				animation: 150,
				handle: '.sc-q-drag-handle',
				ghostClass: 'sortable-ghost',
				chosenClass: 'sortable-chosen',
				onEnd: reindexBadges,
			});
		}
		document.addEventListener('keydown', e => {
			const overlay = overlayEl();
			if (e.key === 'Escape' && overlay && overlay.classList.contains('sc-open')) close();
		});
		registerRealtimeHooks();
		if (!overlay) {
			open('create');
		}
	}

	function refreshCriteriaCache() {
		criteriaCache = null;
	}

	function registerRealtimeHooks() {
		if (!window.QLPKRealtimePageHooks) return;
		window.QLPKRealtimePageHooks.register({
			types: ['catalog.changed'],
			filter: event => event?.payload?.entity === 'survey_criteria',
			handler: refreshCriteriaCache,
			debounceMs: 350,
		});
	}

	function switchTab(tab) {
		if (document.querySelector('#sc-tab-results.active, #tab-results.active')) window._scResultConfig?.collectConfig();
		document.querySelectorAll('[data-sc-tab], [data-tab]').forEach(b => b.classList.remove('active'));
		document.querySelectorAll('.sc-tab-pane').forEach(p => p.classList.remove('active'));
		const tabBtn = document.querySelector(`[data-sc-tab="${tab}"], [data-tab="${tab}"]`);
		const tabPane = byId(`sc-tab-${tab}`, `tab-${tab}`);
		if (tabBtn) tabBtn.classList.add('active');
		if (tabPane) tabPane.classList.add('active');
		// Render Tab 2 when switching to it
		if (tab === 'results' && window._scResultConfig) {
			window._scResultConfig.render();
		}
	}

	async function loadTemplate(id) {
		const revision = state.loadRevision;
		state.loading = true;
		saveButton().disabled = true;
		try {
			const res = await fetch(`/api/survey-templates/${id}`, { headers: authHeaders() });
			const json = await res.json();
			if (revision !== state.loadRevision) return;
			if (!json.success) return showToast('error', 'Không tải được dữ liệu');

			const t = json.data;
			if (t.validation_message) {
				const notice = document.createElement('p');
				notice.id = 'scValidationMessage';
				notice.className = 'text-danger mt-2';
				notice.textContent = `Cần cập nhật trước khi tạo link: ${t.validation_message}`;
				surveyNameInput().insertAdjacentElement('afterend', notice);
			}
			const nameEl = surveyNameInput();
			const descEl = surveyDescInput();
			if (nameEl) nameEl.value = t.name || '';
			if (descEl) descEl.value = t.description || '';
			state.defaultPerformerId = Number(t.default_performer_id) || null;
			await loadPerformers();
			if (revision !== state.loadRevision) return;
			renderPerformerOptions();

			let content = t.content;
			if (typeof content === 'string') {
				try { content = JSON.parse(content || '{}'); } catch (_) { content = {}; }
			}
			const rawQuestions = Array.isArray(content) ? content : (content.questions || []);
			state.content = Array.isArray(content) ? {} : structuredClone(content);
			if (rawQuestions.some(q => !QUESTION_TYPE_ALIASES[q.type || 'multiple_choice'] || q.type === 'checkbox_grid')) {
				showToast('error', 'Mẫu có loại câu hỏi chưa hỗ trợ chỉnh sửa tại đây.');
				return;
			}
			rawQuestions.forEach(q => {
				state.questionCounter += 1;
				const qType = normalizeQuestionType(q.type);
				const qObj = buildQuestionObject({
					id: retainedId(q.id),
					type: qType,
					text: q.text || q.question || '',
					criteria: q.scoring_criteria || q.criteria || '',
					required: q.required,
					answers: Array.isArray(q.answers) ? q.answers : (Array.isArray(q.options) ? q.options : []),
					grid: q.grid,
				});
				renderQuestionCard(qObj);
			});
			// Load Tab 2 result config
			if (window._scResultConfig && content.result_config) {
				window._scResultConfig.initTab(content.result_config);
			}
		} catch (err) {
			if (revision !== state.loadRevision) return;
			questionsListEl().innerHTML = '';
			showToast('error', 'Không thể tải mẫu khảo sát. Vui lòng thử lại.');
		} finally {
			if (revision === state.loadRevision) {
				state.loading = false;
				state.dirty = false;
				saveButton().disabled = !questionsListEl().children.length;
			}
		}
	}

	function buildQuestionObject(raw) {
		return {
			id: retainedId(raw.id),
			type: normalizeQuestionType(raw.type),
			text: raw.text || '',
			criteria: raw.criteria || '',
			required: !!raw.required,
			answers: Array.isArray(raw.answers) && raw.answers.length ? raw.answers : [{ text: '', score: 0 }, { text: '', score: 1 }],
			grid: raw.grid || { rows: [{ text: '', criteria: '', score_enabled: true }], columns: [{ label: 'Cột 1', score: 0 }] }
		};
	}

	function addQuestion() {
		state.questionCounter += 1;
		const qObj = buildQuestionObject({ id: genId(), type: Q_TYPE.MULTIPLE_CHOICE, text: '', criteria: '', required: false });
		renderQuestionCard(qObj);
		const card = document.getElementById(`qcard-${qObj.id}`);
		if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
		markDirty();
	}

	function renderQuestionCard(qObj) {
		const list = questionsListEl();
		if (!list) return;
		const card = document.createElement('div');
		card.className = 'sc-q-card';
		card.id = `qcard-${qObj.id}`;
		card.dataset.qid = qObj.id;
		card.innerHTML = buildCardHTML(qObj, state.questionCounter);
		list.appendChild(card);
		bindCardEvents(card, qObj);
	}

	function buildCardHTML(qObj, idx) {
		const reqChecked = qObj.required ? 'checked' : '';
		return `
			<div class="sc-q-header">
				<div class="sc-q-header-left">
					<div class="sc-q-drag-handle" title="Kéo để sắp xếp">⠿</div>
					<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="sc-q-collapse-btn" title="Thu gọn"><i class="bi bi-chevron-down"></i></button>
					<span class="sc-q-badge">Câu ${idx}</span>
					<select class="sc-q-type">
						<option value="${Q_TYPE.MULTIPLE_CHOICE}" ${qObj.type === Q_TYPE.MULTIPLE_CHOICE ? 'selected' : ''}>Trắc nghiệm</option>
						<option value="${Q_TYPE.MULTIPLE_CHOICE_GRID}" ${qObj.type === Q_TYPE.MULTIPLE_CHOICE_GRID ? 'selected' : ''}>Lưới trắc nghiệm</option>
					</select>
				</div>
			</div>
			<div class="sc-q-body">
				<div class="sc-q-content-row">
					<input type="text" class="sc-q-text" placeholder="Nhập nội dung câu hỏi..." value="${escHtml(qObj.text)}">
					<div class="sc-criteria-wrap ${isGridType(qObj.type) ? 'sc-hidden' : ''}">
						<input type="text" class="sc-q-criteria-input" placeholder="Tiêu chí" value="${escHtml(qObj.criteria)}" autocomplete="off">
						<div class="sc-criteria-dropdown sc-hidden"></div>
					</div>
				</div>
				<div class="sc-trac-nghiem-section ${isChoiceType(qObj.type) ? '' : 'sc-hidden'}">
					<div class="sc-score-hint">Nhập điểm cho từng phương án</div>
					<div class="sc-answers-list">
						${qObj.answers.map(a => buildAnswerRowHTML(a)).join('')}
					</div>
					<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="sc-add-answer-btn"><i class="bi bi-plus"></i> Thêm đáp án</button>
				</div>
				<div class="sc-grid-section ${isGridType(qObj.type) ? '' : 'sc-hidden'}">
					${buildGridHTML(qObj)}
				</div>
			</div>
			<div class="sc-q-footer">
				<div class="sc-required-wrap">
					<label class="sc-required-toggle"><input type="checkbox" class="sc-required-check" ${reqChecked}><span class="sc-toggle-track"></span></label>
					<span class="sc-required-label">Bắt buộc</span>
				</div>
				<div class="sc-q-action-btns"><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-q-action-btn sc-q-delete-btn" title="Xóa câu hỏi"><i class="bi bi-trash"></i></button></div>
			</div>
		`;
	}

	function buildAnswerRowHTML(a) {
		return `
			<div class="sc-answer-row" data-answer-id="${escHtml(retainedId(a.id))}">
				<div class="sc-answer-radio"></div>
				<input type="text" class="sc-answer-text" placeholder="Nhập đáp án..." value="${escHtml(a.text || '')}">
				<span class="sc-answer-score-label">Điểm:</span>
				<input type="number" class="sc-answer-score" value="${a.score ?? a.value ?? ''}" step="any" placeholder="—" title="Chưa cấu hình điểm">
				<button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-answer-remove" title="Xóa"><i class="bi bi-x-lg"></i></button>
			</div>
		`;
	}

	function buildGridHTML(qObj) {
		const rows = qObj.grid?.rows || [];
		const cols = qObj.grid?.columns || [];
		const colHeaders = cols.map((c, ci) => `
			<th class="sc-col-header" data-column-id="${escHtml(retainedId(c.id))}">
				<div class="sc-grid-col-top">
					<input type="text" class="sc-grid-col-label" value="${escHtml(c.label ?? c.text ?? `Cột ${ci + 1}`)}" placeholder="Nhập tên cột...">
					<button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-del-col-btn" title="Xóa cột"><i class="bi bi-x-lg"></i></button>
				</div>
				<div class="sc-grid-col-score">
					<span>Điểm mặc định</span>
					<input type="number" class="sc-grid-score-input" value="${c.score ?? c.value ?? ''}" step="any" placeholder="—" title="Chưa cấu hình điểm">
					<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="sc-q-action-btn sc-apply-col-btn" title="Áp điểm cho cả cột" aria-label="Áp điểm cho cả cột"><i class="bi bi-check2-all"></i></button>
				</div>
			</th>
		`).join('');

		const bodyRows = rows.map((r, ri) => `
			<tr data-row="${ri}" data-row-id="${escHtml(retainedId(r.question_id ?? r.id))}">
				<td class="sc-row-handle" title="Kéo để sắp xếp">⋮⋮</td>
				<td><input type="text" class="sc-grid-row-input" placeholder="Nội dung hàng..." value="${escHtml(r.text || '')}"></td>
				<td><div class="sc-criteria-wrap"><input type="text" class="sc-grid-criteria-input sc-q-criteria-input" placeholder="Tiêu chí" value="${escHtml(r.criteria ?? r.scoring_criteria ?? qObj.criteria)}" autocomplete="off"><div class="sc-criteria-dropdown sc-hidden"></div></div></td>
				<td class="sc-grid-score-toggle-cell"><input type="checkbox" class="sc-grid-score-enabled" ${r.score_enabled !== false ? 'checked' : ''} title="Cho phép tính điểm"></td>
				${cols.map(c => `<td class="sc-col-cell"><input type="number" class="sc-grid-score-input" value="${r.scores?.[c.id] ?? c.score ?? c.value ?? ''}" step="any" placeholder="—" title="Chưa cấu hình điểm"></td>`).join('')}
				<td><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-del-row-btn" title="Xóa hàng"><i class="bi bi-x-lg"></i></button></td>
			</tr>
		`).join('');

		return `
			<div class="sc-grid-wrap">
				<table class="sc-grid-table">
					<thead>
						<tr>
							<th class="sc-grid-handle-col"></th>
							<th class="sc-grid-row-col">Hàng</th>
							<th class="sc-grid-criteria-col">Tiêu chí</th>
							<th class="sc-grid-score-enabled-col">Tính điểm</th>
							${colHeaders}
							<th class="sc-grid-add-col"><button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="sc-add-col-btn"><i class="bi bi-plus-lg"></i></button></th>
						</tr>
					</thead>
					<tbody>${bodyRows}</tbody>
				</table>
			</div>
			<div class="sc-grid-actions"><button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="sc-add-row-btn"><i class="bi bi-plus"></i> Thêm hàng</button></div>
		`;
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
				const div = document.createElement('div');
				div.innerHTML = buildAnswerRowHTML({ text: '', score: 0 });
				const row = div.firstElementChild;
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
			if (!button || button.disabled || state.saving) return;
			const th = button.closest('th.sc-col-header');
			const input = th.querySelector('.sc-grid-score-input');
			const value = input.value;
			if (value === '' || !Number.isFinite(Number(value))) return showToast('error', 'Vui lòng nhập điểm mặc định trước khi áp dụng.');
			const revision = state.loadRevision;
			button.disabled = true;
			try {
				const message = `Thay điểm của tất cả các hàng trong cột bằng ${Number(value)}? Điểm đã nhập sẽ bị thay thế.`;
				const confirmed = await (window.CustomModal ? window.CustomModal.confirm(message) : Promise.resolve(window.confirm(message)));
				if (!confirmed || revision !== state.loadRevision || state.saving || !th.isConnected || input.value !== value) return;
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
		newTh.innerHTML = `
			<div class="sc-grid-col-top">
				<input type="text" class="sc-grid-col-label" value="Cột ${colCount + 1}" placeholder="Nhập tên cột...">
				<button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-del-col-btn" title="Xóa cột"><i class="bi bi-x-lg"></i></button>
			</div>
			<div class="sc-grid-col-score">
				<span>Điểm mặc định</span>
				<input type="number" class="sc-grid-score-input" value="" step="any" placeholder="—">
				<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="sc-q-action-btn sc-apply-col-btn" title="Áp điểm cho cả cột" aria-label="Áp điểm cho cả cột"><i class="bi bi-check2-all"></i></button>
			</div>
		`;
		table.querySelector('thead tr').insertBefore(newTh, addTh);
		table.querySelectorAll('tbody tr').forEach(tr => {
			const td = document.createElement('td');
			td.className = 'sc-col-cell';
			td.innerHTML = `<input type="number" class="sc-grid-score-input" value="" step="any" placeholder="—">`;
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
		tr.innerHTML = `
			<td class="sc-row-handle" title="Kéo để sắp xếp">⋮⋮</td>
			<td><input type="text" class="sc-grid-row-input" placeholder="Nội dung hàng..."></td>
			<td><div class="sc-criteria-wrap"><input type="text" class="sc-grid-criteria-input sc-q-criteria-input" placeholder="Tiêu chí" autocomplete="off"><div class="sc-criteria-dropdown"></div></div></td>
			<td class="sc-grid-score-toggle-cell"><input type="checkbox" class="sc-grid-score-enabled" checked title="Cho phép tính điểm"></td>
			${headerScoreInputs.map(input => `<td class="sc-col-cell"><input type="number" class="sc-grid-score-input" value="${input.value}" step="any" placeholder="—" title="Chưa cấu hình điểm"></td>`).join('')}
			<td><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="sc-del-row-btn" title="Xóa hàng"><i class="bi bi-x-lg"></i></button></td>
		`;
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
		if (!questions.length) return showToast('error', 'Phải có ít nhất một câu hỏi'), false;
		for (let i = 0; i < questions.length; i++) {
			const q = questions[i];
			const idx = i + 1;
			if (!q.text) return showToast('error', `Vui lòng nhập nội dung cho câu ${idx}`), false;
			if (isChoiceType(q.type) && !q.criteria) return showToast('error', `Vui lòng nhập tiêu chí cho câu ${idx}`), false;
			if (isChoiceType(q.type)) {
				if (!q.answers || q.answers.length < 2) return showToast('error', `Câu ${idx} cần ít nhất 2 đáp án`), false;
				if (q.answers.some(a => !a.text)) return showToast('error', `Vui lòng nhập đầy đủ đáp án của câu ${idx}`), false;
			}
			if (isGridType(q.type)) {
				if (!q.grid.columns.length || !q.grid.rows.length) return showToast('error', `Câu ${idx} phải có ít nhất 1 hàng và 1 cột`), false;
				if (q.grid.columns.some(c => !c.label)) return showToast('error', `Vui lòng nhập đầy đủ tên cột cho câu ${idx}`), false;
				if (q.grid.rows.some(r => !r.text || (r.score_enabled && (!r.criteria || Object.values(r.scores).some(s => s === null))))) return showToast('error', `Vui lòng nhập nội dung, tiêu chí và điểm các hàng tính điểm ở câu ${idx}`), false;
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
		if (!name) return showToast('error', 'Vui lòng nhập tên mẫu khảo sát'), null;

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
		const content = { ...state.content, questions };
		// Include Tab 2 result config
		if (window._scResultConfig) {
			content.result_config = window._scResultConfig.collectConfig();
			const message = window._scResultConfig.validateConfig();
			if (message) {
				switchTab('results');
				showToast('error', message);
				return null;
			}
		}
		return { name, description: desc, content, default_performer_id: defaultPerformerId };
	}

	async function save() {
		if (state.saving || state.loading) return;
		const saveBtn = saveButton();
		if (!saveBtn) return;
		state.saving = true;
		saveBtn.disabled = true;

		const data = collectData();
		if (!data) { state.saving = false; saveBtn.disabled = false; return; }

		saveBtn.innerHTML = '<i class="bi bi-arrow-repeat sc-saving-icon"></i> Đang lưu...';

		function resetBtn() {
			state.saving = false;
			setSaveButtonIdle(saveBtn);
		}

		const isEdit = !!state.templateId;
		const url = isEdit ? `/api/survey-templates/${state.templateId}` : '/api/survey-templates';
		let json;
		try {
			const res = await fetch(url, {
				method: isEdit ? 'PUT' : 'POST',
				headers: authHeaders({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(data),
			});
			json = await res.json();
		} catch (e) {
			showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
			resetBtn();
			return;
		}

		if (json.success) {
			state.dirty = false;
			showToast('success', isEdit ? 'Đã cập nhật mẫu khảo sát' : 'Đã tạo mẫu khảo sát mới');
			setTimeout(() => {
				if (overlayEl()) close(true);
				if (typeof surveyTemplateManager !== 'undefined') surveyTemplateManager.loadTemplates();
				else window.location.href = '/survey-template-management.html';
			}, 800);
		} else {
			showToast('error', json.code === 'SURVEY_TEMPLATE_IDENTITY_CONFLICT'
				? 'Mẫu đã có kết quả cần giữ nguyên câu hỏi và đáp án. Vui lòng tạo mẫu mới nếu cần thay đổi cấu trúc.'
				: json.message || 'Không thể lưu mẫu khảo sát. Vui lòng kiểm tra lại.');
			resetBtn();
		}
	}

	window.surveyCreateModal = { open, close, refreshCriteriaCache };
	document.addEventListener('DOMContentLoaded', init);
})();
