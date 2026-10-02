import { moduleState } from './state.js';
import { bindCardEvents, buildAnswerRowHTML, buildGridHTML, reindexBadges, save } from './question-editor.js';

function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}
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
function renderPerformerOptions(selectedId = moduleState.state.defaultPerformerId) {
	const select = surveyPerformerInput();
	if (!select) return;
	select.innerHTML = '<option value="">Chưa gán (chọn sau khi chỉ định)</option>' + moduleState.state.performers.map(user => {
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
	if (!moduleState.performersPromise) {
		moduleState.performersPromise = fetch('/users/doctors')
			.then(response => response.ok ? response.json() : [])
			.then(data => Array.isArray(data) ? data : [])
			.catch(() => []);
	}
	moduleState.state.performers = await moduleState.performersPromise;
	renderPerformerOptions();
	return moduleState.state.performers;
}
function normalizeQuestionType(type) {
	return moduleState.QUESTION_TYPE_ALIASES[String(type || '').trim()] || moduleState.Q_TYPE.MULTIPLE_CHOICE;
}
function isChoiceType(type) {
	return normalizeQuestionType(type) === moduleState.Q_TYPE.MULTIPLE_CHOICE;
}
function isGridType(type) {
	return normalizeQuestionType(type) === moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID;
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
	return moduleState.state.dirty && !moduleState.state.saving;
}
function markDirty() {
	if (!moduleState.state.loading) moduleState.state.dirty = true;
}
function resetState() {
	moduleState.state.loadRevision += 1;
	moduleState.state.content = {};
	moduleState.state.templateId = null;
	moduleState.state.questionCounter = 0;
	moduleState.state.dirty = false;
	moduleState.state.loading = false;
	moduleState.state.saving = false;
	moduleState.state.defaultPerformerId = null;
	const nameEl = surveyNameInput();
	const descEl = surveyDescInput();
	const list = questionsListEl();
	if (nameEl) nameEl.value = '';
	byId('scValidationMessage')?.remove();
	if (descEl) descEl.value = '';
	if (list) list.replaceChildren();
	renderPerformerOptions();
	setSaveButtonIdle();
	moduleState.criteriaCache = null;
	if (moduleState.resultConfig) moduleState.resultConfig.resetConfig();
}
async function open(mode, templateId) {
	if (moduleState.state.saving) return;
	resetState();
	const revision = moduleState.state.loadRevision;
	moduleState.state.loading = true;
	saveButton().disabled = true;
	try {
		const response = await fetch('/api/survey-templates/access');
		const access = await response.json();
		if (revision !== moduleState.state.loadRevision) return;
		if (!response.ok || !access.can_manage) {
			showToast('error', 'Bạn không có quyền quản lý mẫu khảo sát.');
			return;
		}
	} catch (_) {
		if (revision === moduleState.state.loadRevision) showToast('error', 'Không thể kiểm tra quyền. Vui lòng thử lại.');
		return;
	}
	moduleState.state.loading = false;
	setSaveButtonIdle();
	const overlay = overlayEl();
	const title = pageTitleEl();
	if (mode === 'edit' && templateId) {
		moduleState.state.templateId = templateId;
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
	if (moduleState.state.saving && force !== true) return;
	if (!force && hasUnsavedChanges()) {
		const confirmed = await window.QLPKConfirmationDialog.confirm({
			text: 'Bạn có thay đổi chưa lưu. Bạn có chắc muốn đóng?',
			confirmText: 'Đóng',
			variant: 'warning',
			showToast: (type, message) => window.QLPKUserFeedback?.show(type, message)
		});
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
	moduleState.criteriaCache = null;
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
	if (document.querySelector('#sc-tab-results.active, #tab-results.active')) moduleState.resultConfig?.collectConfig();
	document.querySelectorAll('[data-sc-tab], [data-tab]').forEach(b => b.classList.remove('active'));
	document.querySelectorAll('.sc-tab-pane').forEach(p => p.classList.remove('active'));
	const tabBtn = document.querySelector(`[data-sc-tab="${tab}"], [data-tab="${tab}"]`);
	const tabPane = byId(`sc-tab-${tab}`, `tab-${tab}`);
	if (tabBtn) tabBtn.classList.add('active');
	if (tabPane) tabPane.classList.add('active');
	// Render Tab 2 when switching to it
	if (tab === 'results' && moduleState.resultConfig) {
		moduleState.resultConfig.render();
	}
}
async function loadTemplate(id) {
	const revision = moduleState.state.loadRevision;
	moduleState.state.loading = true;
	saveButton().disabled = true;
	try {
		const res = await fetch(`/api/survey-templates/${id}`);
		const json = await res.json();
		if (revision !== moduleState.state.loadRevision) return;
		if (!json.success) return showToast('error', 'Không tải được dữ liệu');

		const t = json.data;
		fillTemplateHeader(t);
		moduleState.state.defaultPerformerId = Number(t.default_performer_id) || null;
		await loadPerformers();
		if (revision !== moduleState.state.loadRevision) return;
		renderPerformerOptions();

		const content = parseTemplateContent(t.content);
		const rawQuestions = Array.isArray(content) ? content : (content.questions || []);
		moduleState.state.content = Array.isArray(content) ? {} : structuredClone(content);
		if (rawQuestions.some(q => !moduleState.QUESTION_TYPE_ALIASES[q.type || 'multiple_choice'] || q.type === 'checkbox_grid')) {
			showToast('error', 'Mẫu có loại câu hỏi chưa hỗ trợ chỉnh sửa tại đây.');
			return;
		}
		rawQuestions.forEach(q => {
			moduleState.state.questionCounter += 1;
			renderQuestionCard(buildQuestionObject(rawTemplateQuestion(q)));
		});
		// Load Tab 2 result config
		if (moduleState.resultConfig && content.result_config) {
			moduleState.resultConfig.initTab(content.result_config);
		}
	} catch (err) {
		if (revision !== moduleState.state.loadRevision) return;
		questionsListEl().replaceChildren();
		showToast('error', 'Không thể tải mẫu khảo sát. Vui lòng thử lại.');
	} finally {
		if (revision === moduleState.state.loadRevision) {
			moduleState.state.loading = false;
			moduleState.state.dirty = false;
			saveButton().disabled = !questionsListEl().children.length;
		}
	}
}
function fillTemplateHeader(t) {
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
}
function parseTemplateContent(content) {
	if (typeof content !== 'string') return content;
	try { return JSON.parse(content || '{}'); } catch (_) { return {}; }
}
function rawTemplateAnswers(q) {
	if (Array.isArray(q.answers)) return q.answers;
	return Array.isArray(q.options) ? q.options : [];
}
function rawTemplateQuestion(q) {
	return {
		id: retainedId(q.id),
		type: normalizeQuestionType(q.type),
		text: q.text || q.question || '',
		criteria: q.scoring_criteria || q.criteria || '',
		required: q.required,
		answers: rawTemplateAnswers(q),
		grid: q.grid,
	};
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
	moduleState.state.questionCounter += 1;
	const qObj = buildQuestionObject({ id: genId(), type: moduleState.Q_TYPE.MULTIPLE_CHOICE, text: '', criteria: '', required: false });
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
	card.innerHTML = buildCardHTML(qObj, moduleState.state.questionCounter);
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
						<option value="${moduleState.Q_TYPE.MULTIPLE_CHOICE}" ${qObj.type === moduleState.Q_TYPE.MULTIPLE_CHOICE ? 'selected' : ''}>Trắc nghiệm</option>
						<option value="${moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID}" ${qObj.type === moduleState.Q_TYPE.MULTIPLE_CHOICE_GRID ? 'selected' : ''}>Lưới trắc nghiệm</option>
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

export { addQuestion, addQuestionButton, buildCardHTML, buildQuestionObject, byId, close, escHtml, fillTemplateHeader, genId, hasUnsavedChanges, init, isChoiceType, isGridType, loadPerformers, loadTemplate, markDirty, normalizeQuestionType, normalizeSearchText, open, overlayEl, pageTitleEl, parseTemplateContent, questionsListEl, rawTemplateAnswers, rawTemplateQuestion, refreshCriteriaCache, registerRealtimeHooks, renderPerformerOptions, renderQuestionCard, resetState, retainedId, saveButton, setSaveButtonIdle, setScVisible, showToast, surveyDescInput, surveyNameInput, surveyPerformerInput, switchTab };
