import { moduleState } from './state.js';
import { clearGlobalSearchResults, closeGlobalSearchPanel, getPasswordModalElements, globalSearchApiHeaders, globalSearchElements, globalSearchPatientId, isGlobalSearchPatientItem, itemAction, itemActions, openPasswordModal, resetPasswordModal, setGlobalSearchPanelOpen, setGlobalSearchStatus, submitPasswordChange } from './assets-and-session.js';
import { getActiveWorkspaceWindow } from './header-buttons.js';

function createGlobalSearchRow(item, action, flatIndex) {
	const itemType = item && item.type ? String(item.type).trim().toLowerCase() : '';
	const row = document.createElement('div');
	row.className = 'qlpk-app-header__global-search-item';
	if (itemType) row.classList.add(`qlpk-app-header__global-search-item--${itemType}`);
	row.classList.toggle('qlpk-app-header__global-search-item--latest', Boolean(item && item.is_latest));
	row.classList.toggle('qlpk-app-header__global-search-item--no-action', !action);
	row.classList.toggle('is-selected', Boolean(item && item.is_selected));
	if (flatIndex !== null && flatIndex !== undefined) {
		row.dataset.globalSearchIndex = String(flatIndex);
		row.setAttribute('role', 'button');
		row.tabIndex = 0;
	}
	return row;
}

function buildGlobalSearchTitle(item) {
	const title = document.createElement('strong');
	title.className = 'qlpk-app-header__global-search-title';
	const titleText = document.createElement('span');
	titleText.textContent = item.title || 'Kết quả';
	title.appendChild(titleText);
	[[item.badge, ''], [item.highlight_badge, ' qlpk-app-header__global-search-badge--highlight']].forEach(([text, modifier]) => {
		if (!text) return;
		const badge = document.createElement('span');
		badge.className = 'qlpk-app-header__global-search-badge' + modifier;
		badge.textContent = text;
		title.appendChild(badge);
	});
	return title;
}

function buildGlobalSearchActions(item, actions) {
	const actionWrap = document.createElement('span');
	actionWrap.className = 'qlpk-app-header__global-search-actions';
	actions.forEach((rowAction) => {
		const actionButton = document.createElement('button');
		actionButton.type = 'button';
		actionButton.className = 'qlpk-app-header__global-search-action';
		if (rowAction && rowAction.kind) {
			actionButton.classList.add(`qlpk-app-header__global-search-action--${String(rowAction.kind).trim().toLowerCase().replace(/_/g, '-')}`);
		}
		actionButton.textContent = rowAction.label || 'Mở';
		actionButton.addEventListener('click', (event) => {
			event.stopPropagation();
			executeGlobalSearchItem(item, rowAction);
		});
		actionWrap.appendChild(actionButton);
	});
	return actionWrap;
}

function renderGlobalSearchItem(item, flatIndex) {
	const actions = itemActions(item);
	const action = actions[0] || null;
	const isPatient = isGlobalSearchPatientItem(item);
	const row = createGlobalSearchRow(item, action, flatIndex);

	const iconWrap = document.createElement('span');
	iconWrap.className = 'qlpk-app-header__global-search-icon';
	const icon = document.createElement('i');
	icon.className = item.icon || 'bi bi-search';
	icon.setAttribute('aria-hidden', 'true');
	iconWrap.appendChild(icon);

	const copy = document.createElement('span');
	copy.className = 'qlpk-app-header__global-search-copy';

	const title = buildGlobalSearchTitle(item);

	const highlightMeta = document.createElement('span');
	highlightMeta.className = 'qlpk-app-header__global-search-highlight-meta';
	highlightMeta.textContent = item.highlight_text || '';

	const subtitle = document.createElement('span');
	subtitle.className = 'qlpk-app-header__global-search-subtitle';
	subtitle.textContent = item.subtitle || '';

	copy.appendChild(title);
	if (highlightMeta.textContent) copy.appendChild(highlightMeta);
	if (subtitle.textContent) copy.appendChild(subtitle);

	row.appendChild(iconWrap);
	row.appendChild(copy);

	if (actions.length) row.appendChild(buildGlobalSearchActions(item, actions));

	if (isPatient) {
		row.addEventListener('click', () => selectGlobalSearchPatient(item));
		row.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			selectGlobalSearchPatient(item);
		});
	}

	return row;
}
function renderGlobalSearchGroup(group) {
	const groupKey = group && group.key ? String(group.key).trim().toLowerCase() : '';
	const wrapper = document.createElement('section');
	wrapper.className = 'qlpk-app-header__global-search-group';
	if (groupKey) wrapper.classList.add(`qlpk-app-header__global-search-group--${groupKey}`);

	const label = document.createElement('div');
	label.className = 'qlpk-app-header__global-search-group-label';
	label.textContent = group.label || group.key || 'Nhóm';

	const body = document.createElement('div');
	body.className = 'qlpk-app-header__global-search-group-body';

	const items = Array.isArray(group.items) ? group.items : [];
	if (!items.length) {
		const empty = document.createElement('div');
		empty.className = 'qlpk-app-header__global-search-empty';
		empty.textContent = group.empty_message || 'Không tìm thấy dữ liệu phù hợp.';
		body.appendChild(empty);
	} else {
		items.forEach((item) => {
			const flatIndex = isGlobalSearchPatientItem(item) ? moduleState.globalSearchFlatItems.length : null;
			if (flatIndex !== null) moduleState.globalSearchFlatItems.push(item);
			body.appendChild(renderGlobalSearchItem(item, flatIndex));
		});
	}

	wrapper.appendChild(label);
	wrapper.appendChild(body);
	return wrapper;
}
function renderGlobalSearchResults(payload) {
	const { results } = globalSearchElements();
	if (!results) return;
	results.replaceChildren();
	const groups = payload && Array.isArray(payload.groups) ? payload.groups : [];
	if (payload && Object.prototype.hasOwnProperty.call(payload, 'selected_patient_id')) {
		moduleState.globalSearchSelectedPatientId = payload.selected_patient_id ? Number(payload.selected_patient_id) : null;
	}
	moduleState.globalSearchGroups = groups;
	moduleState.globalSearchFlatItems = [];
	moduleState.globalSearchActiveIndex = -1;
	moduleState.globalSearchGroups.forEach(group => results.appendChild(renderGlobalSearchGroup(group)));
	setGlobalSearchStatus('', false);
	setGlobalSearchPanelOpen(true);
}
function setGlobalSearchActiveIndex(nextIndex) {
	if (!moduleState.globalSearchFlatItems.length) return;
	const count = moduleState.globalSearchFlatItems.length;
	moduleState.globalSearchActiveIndex = ((nextIndex % count) + count) % count;
	document.querySelectorAll('.qlpk-app-header__global-search-item').forEach((element) => {
		const isActive = Number(element.dataset.globalSearchIndex) === moduleState.globalSearchActiveIndex;
		element.classList.toggle('is-active', isActive);
		if (isActive && typeof element.scrollIntoView === 'function') {
			element.scrollIntoView({ block: 'nearest' });
		}
	});
}
async function fetchGlobalSearch(query, options = {}) {
	const { scope } = globalSearchElements();
	if (moduleState.globalSearchAbortController) moduleState.globalSearchAbortController.abort();
	moduleState.globalSearchAbortController = new AbortController();
	const params = new URLSearchParams({
		q: query,
		scope: scope && scope.value ? scope.value : 'all',
		limit: '5',
	});
	const patientId = options.patientId || moduleState.globalSearchSelectedPatientId;
	if (patientId) params.set('patient_id', patientId);
	const response = await fetch(`/api/global-search?${params.toString()}`, {
		headers: globalSearchApiHeaders(),
		signal: moduleState.globalSearchAbortController.signal,
	});
	const payload = await response.json();
	if (!response.ok) throw new Error(payload.detail || 'Không thể tìm kiếm.');
	return payload;
}
async function selectGlobalSearchPatient(item) {
	const patientId = globalSearchPatientId(item);
	const { input } = globalSearchElements();
	const query = input ? input.value.trim() : moduleState.globalSearchLastQuery;
	if (!patientId || !query) return;
	moduleState.globalSearchSelectedPatientId = patientId;
	setGlobalSearchStatus('Đang tải lịch sử khám...', true);
	try {
		const payload = await fetchGlobalSearch(query, { patientId });
		renderGlobalSearchResults(payload);
	} catch (error) {
		if (error && error.name === 'AbortError') return;
		setGlobalSearchStatus('Không thể tải lịch sử khám. Vui lòng thử lại.', true);
	}
}
function queueGlobalSearch(query, options = {}) {
	const normalized = String(query || '').trim();
	if (moduleState.globalSearchTimer) clearTimeout(moduleState.globalSearchTimer);
	if (!normalized) {
		moduleState.globalSearchLastQuery = '';
		clearGlobalSearchResults();
		closeGlobalSearchPanel();
		return;
	}
	if (!options.preserveSelection && normalized !== moduleState.globalSearchLastQuery) {
		moduleState.globalSearchSelectedPatientId = null;
	}
	moduleState.globalSearchLastQuery = normalized;
	setGlobalSearchPanelOpen(true);
	if (normalized.length < moduleState.GLOBAL_SEARCH_MIN_LENGTH) {
		clearGlobalSearchResults();
		setGlobalSearchStatus(`Nhập ít nhất ${moduleState.GLOBAL_SEARCH_MIN_LENGTH} ký tự để tìm kiếm.`, true);
		return;
	}
	setGlobalSearchStatus('Đang tìm kiếm...', true);
	moduleState.globalSearchTimer = setTimeout(async () => {
		try {
			const payload = await fetchGlobalSearch(normalized, {
				patientId: options.preserveSelection ? moduleState.globalSearchSelectedPatientId : null
			});
			renderGlobalSearchResults(payload);
		} catch (error) {
			if (error && error.name === 'AbortError') return;
			clearGlobalSearchResults();
			setGlobalSearchPanelOpen(true);
			setGlobalSearchStatus('Không thể tìm kiếm. Vui lòng thử lại.', true);
		}
	}, moduleState.GLOBAL_SEARCH_DEBOUNCE_MS);
}
function targetPathFromAction(action, item) {
	const href = (action && action.target_page) || (item && item.target_url) || '';
	if (!href) return '';
	try {
		return new URL(href, window.location.origin).pathname;
	} catch (error) {
		return '';
	}
}
function actionHref(action, item) {
	if (!action || !action.target_page) return item && item.target_url ? item.target_url : '';
	const payload = action.payload || {};
	const params = new URLSearchParams();
	if (payload.appointment_id) params.set('appointment_id', payload.appointment_id);
	if (payload.patient_id) params.set('patient_id', payload.patient_id);
	const query = params.toString();
	return action.target_page + (query ? `?${query}` : '');
}
function windowMatchesActionTarget(targetWindow, targetPath) {
	if (!targetWindow) return false;
	if (!targetPath) return true;
	try {
		return targetWindow.location && targetWindow.location.pathname === targetPath;
	} catch (error) {
		return false;
	}
}
function isNativeWorkspacePaneActive() {
	const nativePane = document.getElementById('qlpkWorkspaceNativePane');
	return !nativePane || nativePane.classList.contains('is-active');
}
function workspaceWindowsForAction(action, item) {
	const targetPath = targetPathFromAction(action, item);
	const windows = [];
	const activeWorkspaceWindow = getActiveWorkspaceWindow();
	if (windowMatchesActionTarget(activeWorkspaceWindow, targetPath)) windows.push(activeWorkspaceWindow);
	if (isNativeWorkspacePaneActive() && windowMatchesActionTarget(window, targetPath) && !windows.includes(window)) windows.push(window);
	return windows;
}
function invokeGlobalSearchBridge(targetWindow, action, item) {
	if (!targetWindow || !action) return false;
	try {
		const bridge = targetWindow.QLPKGlobalSearchActions;
		if (!bridge) return false;
		if (typeof bridge.handleAction === 'function') {
			const handled = bridge.handleAction(action, item);
			return handled !== false;
		}
		const methodByKind = {
			copy_patient_to_receptionist_form: 'copyPatientToReceptionistForm',
			open_patient_history: 'openPatientHistory',
			open_appointment: 'openAppointment',
		};
		const methodName = methodByKind[action.kind];
		if (methodName && typeof bridge[methodName] === 'function') {
			bridge[methodName](action.payload || {}, item);
			return true;
		}
	} catch (error) {
		console.warn('Không thể chạy hành động tìm kiếm:', error);
	}
	return false;
}
function runGlobalSearchActionNow(action, item) {
	return workspaceWindowsForAction(action, item).some(targetWindow => invokeGlobalSearchBridge(targetWindow, action, item));
}
function schedulePendingGlobalSearchAction(action, item) {
	try {
		sessionStorage.setItem(moduleState.PENDING_GLOBAL_SEARCH_ACTION_KEY, JSON.stringify({ action, item }));
	} catch (error) {
		// Non-critical; fallback is just opening the target page.
	}
	let attempts = 0;
	const timer = setInterval(() => {
		attempts += 1;
		if (tryRunPendingGlobalSearchAction() || attempts >= 45) {
			clearInterval(timer);
		}
	}, 180);
}
function tryRunPendingGlobalSearchAction() {
	let pending = null;
	try {
		pending = JSON.parse(sessionStorage.getItem(moduleState.PENDING_GLOBAL_SEARCH_ACTION_KEY) || 'null');
	} catch (error) {
		pending = null;
	}
	if (!pending || !pending.action) return false;
	const handled = runGlobalSearchActionNow(pending.action, pending.item);
	if (handled) {
		sessionStorage.removeItem(moduleState.PENDING_GLOBAL_SEARCH_ACTION_KEY);
	}
	return handled;
}
function openGlobalSearchFallback(action, item) {
	const href = actionHref(action, item);
	if (!href) return;
	if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
		window.QLPKWorkspaceShell.openHref(href, {
			label: item && item.title ? item.title : 'Tìm kiếm',
			icon: item && item.icon ? item.icon : 'bi bi-search',
		});
		return;
	}
	window.location.href = href;
}
function executeGlobalSearchItem(item, explicitAction) {
	const action = explicitAction || itemAction(item);
	if (!action) return;
	closeGlobalSearchPanel();
	if (runGlobalSearchActionNow(action, item)) return;
	if (['copy_patient_to_receptionist_form', 'open_patient_history', 'open_appointment'].includes(action.kind)) {
		schedulePendingGlobalSearchAction(action, item);
	}
	openGlobalSearchFallback(action, item);
}
function bindSearchShell() {
	const { area, input, scope } = globalSearchElements();
	if (!input) return;
	input.addEventListener('input', () => queueGlobalSearch(input.value));
	input.addEventListener('focus', () => {
		if (input.value.trim()) queueGlobalSearch(input.value, { preserveSelection: true });
	});
	input.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') {
			closeGlobalSearchPanel();
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setGlobalSearchActiveIndex(moduleState.globalSearchActiveIndex + 1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setGlobalSearchActiveIndex(moduleState.globalSearchActiveIndex - 1);
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const targetIndex = moduleState.globalSearchActiveIndex >= 0 ? moduleState.globalSearchActiveIndex : 0;
			const item = moduleState.globalSearchFlatItems[targetIndex];
			if (item) selectGlobalSearchPatient(item);
		}
	});
	if (scope) scope.addEventListener('change', () => queueGlobalSearch(input.value));
	document.addEventListener('click', function (event) {
		if (!area || area.contains(event.target)) return;
		closeGlobalSearchPanel();
	});
	tryRunPendingGlobalSearchAction();
}
async function clearConfirmedLogout(confirmation, isCurrent) {
	if (!isCurrent()) return;
	window.QLPKRealtimeClient?.stop();
	const pendingCleanup = [];
	const notifyLogout = target => {
		target.document.dispatchEvent(new target.CustomEvent('qlpk:logout:confirmed', {
			detail: { pendingCleanup, ...confirmation }
		}));
	};
	notifyLogout(window);
	document.querySelectorAll('iframe.qlpk-workspace-iframe').forEach(frame => {
		try { if (frame.contentWindow) notifyLogout(frame.contentWindow); } catch (_) { /* iframe khác origin: bỏ qua */ }
	});
	const results = await Promise.allSettled(pendingCleanup);
	if (!isCurrent()) return;
	if (results.some(result => result.status === 'rejected' || result.value === false)) {
		throw new Error('Draft cleanup incomplete');
	}
	for (const key of ['qlpk_token', 'token', 'qlpk_user', 'qlpk_permissions', 'sidebarHidden']) localStorage.removeItem(key);
	for (const key of ['qlpk_token', 'token']) window.sessionStorage?.removeItem(key);
	localStorage.removeItem('qlpk_workspace_tabs');
	localStorage.removeItem('qlpk_workspace_active_tab');
	window.location.href = '/login.html';
}
async function logout() {
	if (moduleState.logoutPending) return;
	const session = window.QLPKApiTransport?.session;
	const token = session ? null : window.QLPKApiTransport.getAuthHeader();
	moduleState.logoutPending = true;
	try {
		if (session) {
			if (moduleState.confirmedLogoutCleanup) {
				const pending = moduleState.confirmedLogoutCleanup;
				await window.navigator.locks.request('qlpk:browser-session-mutation', { mode: 'exclusive' },
					() => clearConfirmedLogout(pending.confirmation, pending.isCurrent));
				moduleState.confirmedLogoutCleanup = null;
				return;
			}
			await session.actions.logout(async confirmation => {
				const revision = session.owner.snapshot().revision;
				const isCurrent = () => {
					const current = session.owner.snapshot();
					return current.status === 'anonymous' && current.revision === revision;
				};
				moduleState.confirmedLogoutCleanup = { confirmation, isCurrent };
				await clearConfirmedLogout(confirmation, isCurrent);
				moduleState.confirmedLogoutCleanup = null;
			});
			return;
		}
		if (token) {
			const response = await fetch('/auth/logout', {
				method: 'POST', headers: { Authorization: token },
				signal: AbortSignal.timeout(10000)
			});
			if (!response.ok && response.status !== 401) throw new Error('Session revocation unavailable');
		}
		await clearConfirmedLogout({}, () => window.QLPKApiTransport.getAuthHeader() === token);
	} catch (error) {
		window.QLPKUserFeedback?.show('error', moduleState.confirmedLogoutCleanup
			? 'Đã đăng xuất trên máy chủ nhưng chưa dọn xong nháp cục bộ. Vui lòng thử lại.'
			: 'Chưa thể xác nhận đăng xuất. Vui lòng thử lại.');
	} finally {
		moduleState.logoutPending = false;
	}
}
function bindLogout() {
	const logoutBtn = document.getElementById('qlpkHeaderLogoutBtn');
	if (logoutBtn) logoutBtn.addEventListener('click', logout);
}
function bindPasswordModal() {
	const changePasswordBtn = document.getElementById('qlpkHeaderChangePasswordBtn');
	const { form, modal } = getPasswordModalElements();

	if (changePasswordBtn) changePasswordBtn.addEventListener('click', openPasswordModal);
	if (form) form.addEventListener('submit', submitPasswordChange);
	if (modal) modal.addEventListener('hidden.bs.modal', resetPasswordModal);
}

export { actionHref, bindLogout, bindPasswordModal, bindSearchShell, clearConfirmedLogout, executeGlobalSearchItem, fetchGlobalSearch, invokeGlobalSearchBridge, isNativeWorkspacePaneActive, logout, openGlobalSearchFallback, queueGlobalSearch, renderGlobalSearchGroup, renderGlobalSearchItem, renderGlobalSearchResults, runGlobalSearchActionNow, schedulePendingGlobalSearchAction, selectGlobalSearchPatient, setGlobalSearchActiveIndex, targetPathFromAction, tryRunPendingGlobalSearchAction, windowMatchesActionTarget, workspaceWindowsForAction };
