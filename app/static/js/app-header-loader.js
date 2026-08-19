(function (window, document) {
	'use strict';

	const HEADER_CONTAINER_CLASS = 'qlpk-app-header-host';
	const HEADER_TEMPLATE_PATH = '/static/templates/app-header/header.html';
	const TYPOGRAPHY_STYLESHEET_PATH = '/static/css/shared/typography.css';
	const TYPOGRAPHY_STYLESHEET_ID = 'qlpk-typography-style';
	const ICON_TOKENS_STYLESHEET_PATH = '/static/css/shared/icon-tokens.css';
	const ICON_TOKENS_STYLESHEET_ID = 'qlpk-icon-tokens-style';
	const FEEDBACK_TOKENS_STYLESHEET_PATH = '/static/css/shared/feedback-tokens.css';
	const FEEDBACK_TOKENS_STYLESHEET_ID = 'qlpk-feedback-tokens-style';
	const HEADER_STYLESHEET_PATH = '/static/css/components/app-header.css';
	const HEADER_STYLESHEET_ID = 'qlpk-app-header-style';
	const ICON_SYSTEM_PATH = '/static/js/shared/icon-system.js';
	const NAVIGATION_CONFIG_PATH = '/static/js/app-shell/navigation.config.js';
	const WORKSPACE_TABS_PATH = '/static/js/app-shell/workspace-tabs.js';
	const SOCKET_IO_CLIENT_PATH = '/static/vendor/socket.io/socket.io.min.js';
	const REALTIME_CLIENT_PATH = '/static/js/realtime-client.js';
	const APPOINTMENT_PAGE_HREF = 'appointment-management.html';
	const APPOINTMENT_MODAL_REQUEST_KEY = 'qlpk_open_add_appointment_modal';
	const NOTIFICATION_LIMIT = 20;
	const NOTIFICATION_CENTER_LIMIT = 100;
	const GLOBAL_SEARCH_MIN_LENGTH = 2;
	const GLOBAL_SEARCH_DEBOUNCE_MS = 220;
	const PENDING_GLOBAL_SEARCH_ACTION_KEY = 'qlpk_pending_global_search_action';
	let notificationRealtimeBound = false;
	let notificationItems = [];
	let notificationCenterItems = [];
	let notificationCenterFilter = 'all';
	let notificationCenterLoading = false;
	let notificationLoading = false;
	let notificationLoaded = false;
	let globalSearchTimer = null;
	let globalSearchAbortController = null;
	let globalSearchGroups = [];
	let globalSearchFlatItems = [];
	let globalSearchActiveIndex = -1;
	let globalSearchSelectedPatientId = null;
	let globalSearchLastQuery = '';

	const ROLE_LABELS = {
		admin: 'Quản trị viên',
		doctor: 'Bác sĩ',
		staff: 'Lễ tân',
		cashier: 'Thu ngân',
		psychologist: 'Tâm lý gia',
		PSYCHOLOGIST: 'Tâm lý gia',
	};

	function getAppVersion() {
		return window.APP_VERSION || localStorage.getItem('APP_VERSION') || Date.now();
	}

	function isEmbeddedWorkspacePage() {
		try {
			return window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1';
		} catch (error) {
			return new URLSearchParams(window.location.search).get('embed') === '1';
		}
	}

	function ensureLinkedStylesheet(id, path) {
		let link = document.getElementById(id);
		if (!link) {
			link = document.createElement('link');
			link.id = id;
			link.rel = 'stylesheet';
			document.head.appendChild(link);
		}
		link.href = `${path}?v=${getAppVersion()}`;
	}

	function ensureStylesheet() {
		ensureLinkedStylesheet(TYPOGRAPHY_STYLESHEET_ID, TYPOGRAPHY_STYLESHEET_PATH);
		ensureLinkedStylesheet(ICON_TOKENS_STYLESHEET_ID, ICON_TOKENS_STYLESHEET_PATH);
		ensureLinkedStylesheet(FEEDBACK_TOKENS_STYLESHEET_ID, FEEDBACK_TOKENS_STYLESHEET_PATH);
		ensureLinkedStylesheet(HEADER_STYLESHEET_ID, HEADER_STYLESHEET_PATH);
	}

	function ensureScriptLoaded(path, dataAttribute, isReady) {
		return new Promise((resolve) => {
			if (typeof isReady === 'function' && isReady()) {
				resolve();
				return;
			}

			const existing = document.querySelector(`script[data-${dataAttribute}="1"]`);
			if (existing) {
				let resolved = false;
				const finish = () => {
					if (resolved) return;
					resolved = true;
					resolve();
				};
				existing.addEventListener('load', finish, { once: true });
				existing.addEventListener('error', finish, { once: true });
				let attempts = 0;
				const timer = setInterval(() => {
					attempts += 1;
					if ((typeof isReady === 'function' && isReady()) || attempts >= 20) {
						clearInterval(timer);
						finish();
					}
				}, 50);
				return;
			}

			const script = document.createElement('script');
			script.src = `${path}?v=${getAppVersion()}`;
			script.async = true;
			script.setAttribute(`data-${dataAttribute}`, '1');
			script.onload = () => resolve();
			script.onerror = () => resolve();
			document.head.appendChild(script);
		});
	}

	function ensureWorkspaceRuntime() {
		return ensureScriptLoaded(
			ICON_SYSTEM_PATH,
			'qlpk-icon-system',
			() => !!window.QLPKIconSystem
		).then(() => ensureScriptLoaded(
			NAVIGATION_CONFIG_PATH,
			'qlpk-navigation-config',
			() => !!window.QLPKNavigationConfig
		)).then(() => ensureScriptLoaded(
			WORKSPACE_TABS_PATH,
			'qlpk-workspace-tabs',
			() => !!window.QLPKWorkspaceShell
		)).then(() => ensureScriptLoaded(
			SOCKET_IO_CLIENT_PATH,
			'qlpk-socket-io-client',
			() => typeof window.io === 'function'
		)).then(() => ensureScriptLoaded(
			REALTIME_CLIENT_PATH,
			'qlpk-realtime-client',
			() => !!window.QLPKRealtimeClient
		));
	}

	function resolveMountTarget() {
		return document.querySelector('.main-content') || document.querySelector('.appointment-fullscreen');
	}

	function readStoredUser() {
		try {
			return JSON.parse(localStorage.getItem('qlpk_user') || '{}') || {};
		} catch (error) {
			return {};
		}
	}

	function normalizeRole(role) {
		if (!role) return '';
		return String(role).replace(/^UserRole\./, '').toLowerCase();
	}

	function roleLabel(role) {
		if (!role) return 'Người dùng';
		const normalized = normalizeRole(role);
		return ROLE_LABELS[role] || ROLE_LABELS[normalized] || String(role);
	}

	function initialsFromName(name) {
		const clean = String(name || '').trim();
		if (!clean) return 'ST';
		const parts = clean.split(/\s+/).filter(Boolean);
		const chars = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0][0], parts[0][1] || ''];
		return chars.join('').toUpperCase();
	}

	function setText(id, value) {
		const element = document.getElementById(id);
		if (element) element.textContent = value;
	}

	function updateSearchScope(user) {
		const scope = document.getElementById('qlpkGlobalSearchScope');
		if (!scope) return;

		const label = roleLabel(user.role);
		const normalized = normalizeRole(user.role) || 'role';
		const currentValue = scope.value;

		scope.innerHTML = '';
		const allOption = document.createElement('option');
		allOption.value = 'all';
		allOption.textContent = 'Toàn bộ';
		scope.appendChild(allOption);

		if (label && label !== 'Người dùng') {
			const roleOption = document.createElement('option');
			roleOption.value = normalized;
			roleOption.textContent = label;
			scope.appendChild(roleOption);
		}

		if ([...scope.options].some(option => option.value === currentValue)) {
			scope.value = currentValue;
		}
	}

	function updateUserUi(user) {
		const fullName = user.full_name || user.name || user.username || 'Người dùng';
		const displayRole = roleLabel(user.role);

		setText('qlpkHeaderUserName', fullName);
		setText('qlpkHeaderUserRole', displayRole);
		setText('qlpkHeaderMenuUserRole', displayRole);
		setText('qlpkHeaderAvatar', initialsFromName(fullName));
		updateSearchScope(user);
	}

	function getPasswordModalElements() {
		return {
			modal: document.getElementById('qlpkChangePasswordModal'),
			form: document.getElementById('qlpkChangePasswordForm'),
			currentPassword: document.getElementById('qlpkCurrentPassword'),
			newPassword: document.getElementById('qlpkNewPassword'),
			confirmPassword: document.getElementById('qlpkConfirmPassword'),
			message: document.getElementById('qlpkChangePasswordMessage'),
			submitBtn: document.getElementById('qlpkChangePasswordSubmitBtn'),
		};
	}

	function setPasswordMessage(type, text) {
		const { message } = getPasswordModalElements();
		if (!message) return;
		message.textContent = text || '';
		message.classList.remove('qlpk-password-modal__message--hidden', 'is-error', 'is-success');
		if (type) message.classList.add(`is-${type}`);
		if (!text) message.classList.add('qlpk-password-modal__message--hidden');
	}

	function resetPasswordModal() {
		const { form, submitBtn } = getPasswordModalElements();
		if (form) form.reset();
		if (submitBtn) submitBtn.disabled = false;
		setPasswordMessage('', '');
	}

	function openPasswordModal() {
		const { modal, currentPassword } = getPasswordModalElements();
		if (!modal) return;

		resetPasswordModal();
		if (window.bootstrap && window.bootstrap.Modal) {
			window.bootstrap.Modal.getOrCreateInstance(modal).show();
			modal.addEventListener('shown.bs.modal', () => currentPassword && currentPassword.focus(), { once: true });
			return;
		}

		modal.classList.add('show');
		modal.removeAttribute('aria-hidden');
		currentPassword && currentPassword.focus();
	}

	function closePasswordModalSoon() {
		const { modal } = getPasswordModalElements();
		if (!modal || !window.bootstrap || !window.bootstrap.Modal) return;

		setTimeout(() => {
			const instance = window.bootstrap.Modal.getInstance(modal);
			if (instance) instance.hide();
		}, 900);
	}

	async function submitPasswordChange(event) {
		event.preventDefault();

		const { currentPassword, newPassword, confirmPassword, submitBtn } = getPasswordModalElements();
		const currentValue = currentPassword ? currentPassword.value.trim() : '';
		const newValue = newPassword ? newPassword.value.trim() : '';
		const confirmValue = confirmPassword ? confirmPassword.value.trim() : '';

		if (!currentValue || !newValue || !confirmValue) {
			setPasswordMessage('error', 'Vui lòng nhập đầy đủ thông tin.');
			return;
		}

		if (newValue.length < 6) {
			setPasswordMessage('error', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
			return;
		}

		if (newValue !== confirmValue) {
			setPasswordMessage('error', 'Mật khẩu mới nhập lại không khớp.');
			return;
		}

		const token = localStorage.getItem('qlpk_token');
		if (!token) {
			setPasswordMessage('error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
			return;
		}

		if (submitBtn) submitBtn.disabled = true;
		setPasswordMessage('', '');

		try {
			const response = await fetch('/users/me/password', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					current_password: currentValue,
					new_password: newValue,
				}),
			});

			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload.detail || 'Không thể đổi mật khẩu.');
			}

			setPasswordMessage('success', payload.detail || 'Đổi mật khẩu thành công.');
			const { form } = getPasswordModalElements();
			if (form) form.reset();
			closePasswordModalSoon();
		} catch (error) {
			setPasswordMessage('error', 'Không thể đổi mật khẩu. Vui lòng thử lại.');
		} finally {
			if (submitBtn) submitBtn.disabled = false;
		}
	}

	async function fetchCurrentUser() {
		const token = localStorage.getItem('qlpk_token');
		if (!token) return null;

		const response = await fetch('/users/me', {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!response.ok) throw new Error('Failed to load current user');
		return response.json();
	}

	async function hydrateUser() {
		const storedUser = readStoredUser();
		if (storedUser && Object.keys(storedUser).length > 0) {
			updateUserUi(storedUser);
		}

		try {
			const user = await fetchCurrentUser();
			if (!user) return;
			updateUserUi(user);
			localStorage.setItem('qlpk_user', JSON.stringify(user));
			if (user.permissions) {
				localStorage.setItem('qlpk_permissions', JSON.stringify(user.permissions));
				if (typeof window.checkPermissions === 'function') {
					window.checkPermissions();
				}
				if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.renderLauncher === 'function') {
					window.QLPKWorkspaceShell.renderLauncher();
				}
				if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.renderTabs === 'function') {
					window.QLPKWorkspaceShell.renderTabs();
				}
			}
		} catch (error) {
			if (!storedUser || Object.keys(storedUser).length === 0) {
				updateUserUi({ full_name: 'Son Tam Clinic', role: 'Người dùng' });
			}
		}
	}

	function globalSearchElements() {
		return {
			area: document.querySelector('.qlpk-app-header__search-area'),
			input: document.getElementById('qlpkGlobalSearchInput'),
			scope: document.getElementById('qlpkGlobalSearchScope'),
			panel: document.getElementById('qlpkGlobalSearchPanel'),
			status: document.getElementById('qlpkGlobalSearchStatus'),
			results: document.getElementById('qlpkGlobalSearchResults'),
		};
	}

	function setGlobalSearchPanelOpen(open) {
		const { panel } = globalSearchElements();
		if (!panel) return;
		panel.classList.toggle('is-open', !!open);
		panel.setAttribute('aria-hidden', open ? 'false' : 'true');
	}

	function setGlobalSearchStatus(text, visible = true) {
		const { status } = globalSearchElements();
		if (!status) return;
		status.textContent = text || '';
		status.classList.toggle('is-hidden', !visible);
	}

	function clearGlobalSearchResults(options = {}) {
		const { results } = globalSearchElements();
		if (results) results.innerHTML = '';
		globalSearchGroups = [];
		globalSearchFlatItems = [];
		globalSearchActiveIndex = -1;
		if (options.resetSelection !== false) globalSearchSelectedPatientId = null;
	}

	function closeGlobalSearchPanel() {
		setGlobalSearchPanelOpen(false);
		globalSearchActiveIndex = -1;
	}

	function globalSearchApiHeaders() {
		const token = getAuthToken();
		return token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' };
	}

	function itemActions(item) {
		if (!item) return [];
		if (Array.isArray(item.actions) && item.actions.length) return item.actions.filter(Boolean);
		return item.primary_action ? [item.primary_action] : [];
	}

	function itemAction(item) {
		const actions = itemActions(item);
		return actions.length ? actions[0] : null;
	}

	function globalSearchPatientId(item) {
		return item && item.payload && item.payload.patient_id ? Number(item.payload.patient_id) : null;
	}

	function isGlobalSearchPatientItem(item) {
		return item && item.type === 'patient' && globalSearchPatientId(item);
	}

	function renderGlobalSearchItem(item, flatIndex) {
		const actions = itemActions(item);
		const action = actions[0] || null;
		const isPatient = isGlobalSearchPatientItem(item);
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

		const iconWrap = document.createElement('span');
		iconWrap.className = 'qlpk-app-header__global-search-icon';
		const icon = document.createElement('i');
		icon.className = item.icon || 'bi bi-search';
		icon.setAttribute('aria-hidden', 'true');
		iconWrap.appendChild(icon);

		const copy = document.createElement('span');
		copy.className = 'qlpk-app-header__global-search-copy';

		const title = document.createElement('strong');
		title.className = 'qlpk-app-header__global-search-title';
		const titleText = document.createElement('span');
		titleText.textContent = item.title || 'Kết quả';
		title.appendChild(titleText);
		if (item.badge) {
			const badge = document.createElement('span');
			badge.className = 'qlpk-app-header__global-search-badge';
			badge.textContent = item.badge;
			title.appendChild(badge);
		}
		if (item.highlight_badge) {
			const highlightBadge = document.createElement('span');
			highlightBadge.className = 'qlpk-app-header__global-search-badge qlpk-app-header__global-search-badge--highlight';
			highlightBadge.textContent = item.highlight_badge;
			title.appendChild(highlightBadge);
		}

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

		if (actions.length) {
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
			row.appendChild(actionWrap);
		}

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
				const flatIndex = isGlobalSearchPatientItem(item) ? globalSearchFlatItems.length : null;
				if (flatIndex !== null) globalSearchFlatItems.push(item);
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
		results.innerHTML = '';
		const groups = payload && Array.isArray(payload.groups) ? payload.groups : [];
		if (payload && Object.prototype.hasOwnProperty.call(payload, 'selected_patient_id')) {
			globalSearchSelectedPatientId = payload.selected_patient_id ? Number(payload.selected_patient_id) : null;
		}
		globalSearchGroups = groups;
		globalSearchFlatItems = [];
		globalSearchActiveIndex = -1;
		globalSearchGroups.forEach(group => results.appendChild(renderGlobalSearchGroup(group)));
		setGlobalSearchStatus('', false);
		setGlobalSearchPanelOpen(true);
	}

	function setGlobalSearchActiveIndex(nextIndex) {
		if (!globalSearchFlatItems.length) return;
		const count = globalSearchFlatItems.length;
		globalSearchActiveIndex = ((nextIndex % count) + count) % count;
		document.querySelectorAll('.qlpk-app-header__global-search-item').forEach((element) => {
			const isActive = Number(element.dataset.globalSearchIndex) === globalSearchActiveIndex;
			element.classList.toggle('is-active', isActive);
			if (isActive && typeof element.scrollIntoView === 'function') {
				element.scrollIntoView({ block: 'nearest' });
			}
		});
	}

	async function fetchGlobalSearch(query, options = {}) {
		const { scope } = globalSearchElements();
		if (globalSearchAbortController) globalSearchAbortController.abort();
		globalSearchAbortController = new AbortController();
		const params = new URLSearchParams({
			q: query,
			scope: scope && scope.value ? scope.value : 'all',
			limit: '5',
		});
		const patientId = options.patientId || globalSearchSelectedPatientId;
		if (patientId) params.set('patient_id', patientId);
		const response = await fetch(`/api/global-search?${params.toString()}`, {
			headers: globalSearchApiHeaders(),
			signal: globalSearchAbortController.signal,
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(payload.detail || 'Không thể tìm kiếm.');
		return payload;
	}

	async function selectGlobalSearchPatient(item) {
		const patientId = globalSearchPatientId(item);
		const { input } = globalSearchElements();
		const query = input ? input.value.trim() : globalSearchLastQuery;
		if (!patientId || !query) return;
		globalSearchSelectedPatientId = patientId;
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
		if (globalSearchTimer) clearTimeout(globalSearchTimer);
		if (!normalized) {
			globalSearchLastQuery = '';
			clearGlobalSearchResults();
			closeGlobalSearchPanel();
			return;
		}
		if (!options.preserveSelection && normalized !== globalSearchLastQuery) {
			globalSearchSelectedPatientId = null;
		}
		globalSearchLastQuery = normalized;
		setGlobalSearchPanelOpen(true);
		if (normalized.length < GLOBAL_SEARCH_MIN_LENGTH) {
			clearGlobalSearchResults();
			setGlobalSearchStatus(`Nhập ít nhất ${GLOBAL_SEARCH_MIN_LENGTH} ký tự để tìm kiếm.`, true);
			return;
		}
		setGlobalSearchStatus('Đang tìm kiếm...', true);
		globalSearchTimer = setTimeout(async () => {
			try {
				const payload = await fetchGlobalSearch(normalized, {
					patientId: options.preserveSelection ? globalSearchSelectedPatientId : null
				});
				renderGlobalSearchResults(payload);
			} catch (error) {
				if (error && error.name === 'AbortError') return;
				clearGlobalSearchResults();
				setGlobalSearchPanelOpen(true);
				setGlobalSearchStatus('Không thể tìm kiếm. Vui lòng thử lại.', true);
			}
		}, GLOBAL_SEARCH_DEBOUNCE_MS);
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
			sessionStorage.setItem(PENDING_GLOBAL_SEARCH_ACTION_KEY, JSON.stringify({ action, item }));
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
			pending = JSON.parse(sessionStorage.getItem(PENDING_GLOBAL_SEARCH_ACTION_KEY) || 'null');
		} catch (error) {
			pending = null;
		}
		if (!pending || !pending.action) return false;
		const handled = runGlobalSearchActionNow(pending.action, pending.item);
		if (handled) {
			sessionStorage.removeItem(PENDING_GLOBAL_SEARCH_ACTION_KEY);
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
				setGlobalSearchActiveIndex(globalSearchActiveIndex + 1);
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setGlobalSearchActiveIndex(globalSearchActiveIndex - 1);
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				const targetIndex = globalSearchActiveIndex >= 0 ? globalSearchActiveIndex : 0;
				const item = globalSearchFlatItems[targetIndex];
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

	function logout() {
		try {
			localStorage.removeItem('qlpk_token');
			localStorage.removeItem('qlpk_user');
			localStorage.removeItem('qlpk_permissions');
			localStorage.removeItem('sidebarHidden');
			localStorage.removeItem('qlpk_workspace_tabs');
			localStorage.removeItem('qlpk_workspace_active_tab');
		} catch (error) {
			console.error('Error clearing localStorage:', error);
		}
		window.location.href = '/login.html';
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

	function getActiveWorkspaceWindow() {
		const activePane = document.querySelector('#qlpkWorkspaceFrameHost .qlpk-workspace-pane.is-active');
		const iframe = activePane ? activePane.querySelector('iframe') : null;
		if (!iframe) return null;
		try {
			return iframe.contentWindow || null;
		} catch (error) {
			return null;
		}
	}

	function tryOpenAppointmentModal(targetWindow) {
		if (!targetWindow) return false;
		try {
			const path = targetWindow.location && targetWindow.location.pathname ? targetWindow.location.pathname : '';
			if (path.endsWith('/appointment-management.html') && targetWindow.QLPKAppointmentManagementReadyForHeaderModal === false) {
				return false;
			}
			const modal = targetWindow.document && targetWindow.document.getElementById('addAppointmentModal');
			if (modal && modal.classList.contains('show')) {
				sessionStorage.removeItem(APPOINTMENT_MODAL_REQUEST_KEY);
				return true;
			}
			if (typeof targetWindow.openAddAppointmentWithDate !== 'function') return false;
			targetWindow.openAddAppointmentWithDate();
			if (modal && modal.classList.contains('show')) {
				sessionStorage.removeItem(APPOINTMENT_MODAL_REQUEST_KEY);
				return true;
			}
			return false;
		} catch (error) {
			return false;
		}
	}

	function scheduleAppointmentModalOpen() {
		let attempts = 0;
		const maxAttempts = 40;
		const timer = setInterval(() => {
			attempts += 1;
			if (tryOpenAppointmentModal(window) || tryOpenAppointmentModal(getActiveWorkspaceWindow()) || attempts >= maxAttempts) {
				clearInterval(timer);
			}
		}, 150);
	}

	function openAppointmentModalFromHeader() {
		if (tryOpenAppointmentModal(window) || tryOpenAppointmentModal(getActiveWorkspaceWindow())) return;

		sessionStorage.setItem(APPOINTMENT_MODAL_REQUEST_KEY, '1');
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
			window.QLPKWorkspaceShell.openHref(APPOINTMENT_PAGE_HREF, {
				label: 'Lịch hẹn',
				icon: 'bi bi-calendar2-week',
			});
			scheduleAppointmentModalOpen();
			return;
		}

		window.location.href = `/${APPOINTMENT_PAGE_HREF}`;
	}

	function bindCalendarButton() {
		const calendarBtn = document.getElementById('qlpkHeaderCalendarBtn');
		if (calendarBtn) calendarBtn.addEventListener('click', openAppointmentModalFromHeader);
	}

	function getFullscreenElement() {
		return document.fullscreenElement
			|| document.webkitFullscreenElement
			|| document.mozFullScreenElement
			|| document.msFullscreenElement
			|| null;
	}

	function isFullscreenSupported() {
		const root = document.documentElement;
		return Boolean(
			document.fullscreenEnabled
			|| document.webkitFullscreenEnabled
			|| root.requestFullscreen
			|| root.webkitRequestFullscreen
		);
	}

	function updateFullscreenButton() {
		const button = document.getElementById('qlpkHeaderFullscreenBtn');
		const icon = document.getElementById('qlpkHeaderFullscreenIcon');
		if (!button) return;

		if (!isFullscreenSupported()) {
			button.hidden = true;
			return;
		}

		const isFullscreen = Boolean(getFullscreenElement());
		const label = isFullscreen ? 'Thoát toàn màn hình' : 'Phóng to toàn màn hình';
		button.hidden = false;
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
		button.setAttribute('title', label);
		if (icon) {
			icon.className = isFullscreen ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen';
		}
	}

	async function toggleFullscreen() {
		if (!isFullscreenSupported()) return;
		try {
			if (getFullscreenElement()) {
				if (document.exitFullscreen) {
					await document.exitFullscreen();
				} else if (document.webkitExitFullscreen) {
					document.webkitExitFullscreen();
				}
				return;
			}

			const root = document.documentElement;
			if (root.requestFullscreen) {
				await root.requestFullscreen();
			} else if (root.webkitRequestFullscreen) {
				root.webkitRequestFullscreen();
			}
		} finally {
			updateFullscreenButton();
		}
	}

	function bindFullscreenButton() {
		const button = document.getElementById('qlpkHeaderFullscreenBtn');
		if (!button) return;
		button.addEventListener('click', toggleFullscreen);
		['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventName => {
			document.addEventListener(eventName, updateFullscreenButton);
		});
		updateFullscreenButton();
	}

	function getAuthToken() {
		try {
			return localStorage.getItem('qlpk_token') || localStorage.getItem('token') || '';
		} catch (error) {
			return '';
		}
	}

	async function notificationApi(path, options = {}) {
		const token = getAuthToken();
		if (!token) throw new Error('Missing token');

		const headers = {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
			...(options.headers || {}),
		};

		if (options.body && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}

		const response = await fetch(path, {
			...options,
			headers,
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(payload.detail || 'Không thể tải thông báo.');
		}
		return payload;
	}

	function notificationElements() {
		return {
			button: document.getElementById('qlpkHeaderNotificationButton'),
			menu: document.getElementById('qlpkHeaderNotificationMenu'),
			list: document.getElementById('qlpkHeaderNotificationList'),
			empty: document.getElementById('qlpkHeaderNotificationEmpty'),
			readAllBtn: document.getElementById('qlpkHeaderNotificationReadAllBtn'),
			viewAllBtn: document.getElementById('qlpkHeaderNotificationViewAllBtn'),
			centerPanel: document.getElementById('qlpkNotificationCenterPanel'),
			centerSurface: document.querySelector('#qlpkNotificationCenterPanel .qlpk-notification-center-panel__surface'),
			centerCloseBtn: document.getElementById('qlpkNotificationCenterCloseBtn'),
			centerCloseFooterBtn: document.getElementById('qlpkNotificationCenterCloseFooterBtn'),
			centerList: document.getElementById('qlpkNotificationCenterList'),
			centerEmpty: document.getElementById('qlpkNotificationCenterEmpty'),
			centerStatus: document.getElementById('qlpkNotificationCenterStatus'),
			centerSummary: document.getElementById('qlpkNotificationCenterSummary'),
			centerReadAllBtn: document.getElementById('qlpkNotificationCenterReadAllBtn'),
		};
	}

	function setNotificationBadge(count) {
		const badge = document.getElementById('qlpkHeaderNotificationBadge');
		if (!badge) return;
		const safeCount = Math.max(0, Number(count) || 0);
		badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
		badge.classList.toggle('qlpk-app-header__badge--hidden', safeCount <= 0);
	}

	function incrementNotificationBadge(amount) {
		const badge = document.getElementById('qlpkHeaderNotificationBadge');
		const current = Number(badge && badge.textContent !== '99+' ? badge.textContent : 0) || 0;
		setNotificationBadge(current + (Number(amount) || 1));
	}

	function isUnreadNotification(notification) {
		return !!notification && !notification.is_read && notification.status !== 'read';
	}

	function notificationIconClass(notification) {
		const type = String(notification && notification.event_type ? notification.event_type : '');
		if (type.includes('receptionist')) return 'bi bi-arrow-return-left';
		if (type.includes('psychologist')) return 'bi bi-person-heart';
		if (type.includes('doctor')) return 'bi bi-clipboard2-pulse';
		return 'bi bi-bell';
	}

	function notificationFeedbackType(notification) {
		const type = String(notification && notification.event_type ? notification.event_type : '');
		if (type.includes('receptionist') || type.includes('returned')) return 'warning';
		if (type.includes('doctor') || type.includes('psychologist')) return 'info';
		return 'info';
	}

	function formatNotificationTime(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const now = new Date();
		const sameDay = date.getFullYear() === now.getFullYear()
			&& date.getMonth() === now.getMonth()
			&& date.getDate() === now.getDate();
		const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
		if (sameDay) return time;
		return `${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
	}

	function formatNotificationAppointmentTime(notification) {
		const value = notification && (notification.appointment_date || (notification.payload && notification.payload.appointment_date));
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return `Ngày khám ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
	}

	function getNotificationPatientInitials(notification) {
		const name = String(notification && notification.patient_name ? notification.patient_name : '').trim();
		if (!name) return '';
		const parts = name.split(/\s+/).filter(Boolean);
		const first = parts[0] || '';
		const last = parts.length > 1 ? parts[parts.length - 1] : '';
		return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
	}

	function renderNotificationItem(notification) {
		const item = document.createElement('button');
		item.type = 'button';
		item.className = 'qlpk-app-header__notification-item';
		if (isUnreadNotification(notification)) item.classList.add('is-unread');
		item.dataset.notificationId = String(notification.id || '');

		const iconWrap = document.createElement('span');
		const feedbackType = notificationFeedbackType(notification);
		iconWrap.className = `qlpk-app-header__notification-icon qlpk-app-header__notification-icon--${feedbackType}`;
		const patientInitials = getNotificationPatientInitials(notification);
		if (patientInitials) {
			iconWrap.classList.add('qlpk-app-header__notification-icon--avatar');
			iconWrap.textContent = patientInitials;
			iconWrap.setAttribute('aria-label', `Bệnh nhân ${notification.patient_name}`);
		} else {
			const icon = document.createElement('i');
			icon.className = notificationIconClass(notification);
			icon.setAttribute('aria-hidden', 'true');
			iconWrap.appendChild(icon);
		}

		const body = document.createElement('span');
		body.className = 'qlpk-app-header__notification-body';

		const title = document.createElement('strong');
		title.className = 'qlpk-app-header__notification-title';
		const titleText = document.createElement('span');
		titleText.textContent = notification.title || 'Thông báo';
		title.appendChild(titleText);
		if (isUnreadNotification(notification)) {
			const dot = document.createElement('span');
			dot.className = 'qlpk-app-header__notification-dot';
			dot.setAttribute('aria-label', 'Chưa đọc');
			title.appendChild(dot);
		}

		const message = document.createElement('p');
		message.className = 'qlpk-app-header__notification-message';
		message.textContent = notification.message || 'Có cập nhật mới trong hệ thống.';

		const meta = document.createElement('span');
		meta.className = 'qlpk-app-header__notification-meta';
		meta.textContent = [formatNotificationAppointmentTime(notification) || formatNotificationTime(notification.created_at)]
			.filter(Boolean)
			.join(' · ');

		body.appendChild(title);
		body.appendChild(message);
		if (meta.textContent) body.appendChild(meta);

		item.appendChild(iconWrap);
		item.appendChild(body);
		item.addEventListener('click', () => openNotification(notification));
		return item;
	}

	function renderNotifications() {
		const { list, empty, readAllBtn } = notificationElements();
		if (!list) return;

		list.innerHTML = '';
		const items = Array.isArray(notificationItems) ? notificationItems : [];
		items.forEach(notification => list.appendChild(renderNotificationItem(notification)));
		list.classList.toggle('is-empty', items.length === 0);
		if (empty) empty.classList.toggle('is-hidden', items.length > 0);
		if (readAllBtn) readAllBtn.disabled = !items.some(isUnreadNotification);
	}

	function getFilteredNotificationCenterItems() {
		const items = Array.isArray(notificationCenterItems) ? notificationCenterItems : [];
		if (notificationCenterFilter === 'unread') return items.filter(isUnreadNotification);
		return items;
	}

	function renderNotificationCenter() {
		const { centerList, centerEmpty, centerStatus, centerSummary, centerReadAllBtn } = notificationElements();
		if (!centerList) return;

		const items = getFilteredNotificationCenterItems();
		centerList.innerHTML = '';
		items.forEach(notification => centerList.appendChild(renderNotificationItem(notification)));

		const hasItems = items.length > 0;
		centerList.classList.toggle('is-empty', !hasItems);
		if (centerEmpty) centerEmpty.classList.toggle('is-hidden', hasItems || notificationCenterLoading);
		if (centerStatus) centerStatus.classList.toggle('is-hidden', !notificationCenterLoading);
		if (centerReadAllBtn) centerReadAllBtn.disabled = !notificationCenterItems.some(isUnreadNotification);
		if (centerSummary) {
			const total = notificationCenterItems.length;
			const unread = notificationCenterItems.filter(isUnreadNotification).length;
			centerSummary.textContent = `Đang hiển thị ${items.length}/${total} thông báo gần nhất${unread ? `, ${unread} chưa đọc` : ''}`;
		}
	}

	function setNotificationCenterFilter(filter) {
		notificationCenterFilter = filter === 'unread' ? 'unread' : 'all';
		document.querySelectorAll('[data-qlpk-notification-filter]').forEach(button => {
			button.classList.toggle('is-active', button.dataset.qlpkNotificationFilter === notificationCenterFilter);
		});
		renderNotificationCenter();
	}

	function applyNotificationResponse(payload) {
		const notifications = payload && Array.isArray(payload.notifications) ? payload.notifications : [];
		notificationItems = notifications;
		notificationLoaded = true;
		if (Number.isFinite(Number(payload && payload.unread_count))) {
			setNotificationBadge(Number(payload.unread_count));
		}
		renderNotifications();
	}

	async function loadNotifications(options = {}) {
		if (notificationLoading) return;
		const token = getAuthToken();
		if (!token) {
			setNotificationBadge(0);
			notificationItems = [];
			renderNotifications();
			return;
		}

		notificationLoading = true;
		try {
			const payload = await notificationApi(`/api/notifications?limit=${NOTIFICATION_LIMIT}`);
			applyNotificationResponse(payload || {});
		} catch (error) {
			if (!options.silent) console.warn('Không thể tải thông báo:', error);
		} finally {
			notificationLoading = false;
		}
	}

	async function loadNotificationCenter() {
		if (notificationCenterLoading) return;
		const token = getAuthToken();
		if (!token) {
			notificationCenterItems = [];
			renderNotificationCenter();
			return;
		}

		notificationCenterLoading = true;
		renderNotificationCenter();
		try {
			const payload = await notificationApi(`/api/notifications?limit=${NOTIFICATION_CENTER_LIMIT}`);
			notificationCenterItems = payload && Array.isArray(payload.notifications) ? payload.notifications : [];
			if (Number.isFinite(Number(payload && payload.unread_count))) {
				setNotificationBadge(Number(payload.unread_count));
			}
		} catch (error) {
			console.warn('Không thể tải toàn bộ thông báo:', error);
			notificationCenterItems = [];
		} finally {
			notificationCenterLoading = false;
			renderNotificationCenter();
		}
	}

	function upsertRealtimeNotification(notification) {
		if (!notification || !notification.id) return;
		notificationItems = [
			notification,
			...notificationItems.filter(item => String(item.id) !== String(notification.id)),
		].slice(0, NOTIFICATION_LIMIT);
		notificationCenterItems = [
			notification,
			...notificationCenterItems.filter(item => String(item.id) !== String(notification.id)),
		].slice(0, NOTIFICATION_CENTER_LIMIT);
		notificationLoaded = true;
		renderNotifications();
		renderNotificationCenter();
	}

	function updateNotificationFromPayload(notification) {
		if (!notification || !notification.id) return;
		notificationItems = notificationItems.map(item => (
			String(item.id) === String(notification.id) ? { ...item, ...notification } : item
		));
		notificationCenterItems = notificationCenterItems.map(item => (
			String(item.id) === String(notification.id) ? { ...item, ...notification } : item
		));
		renderNotifications();
		renderNotificationCenter();
	}

	async function markNotificationRead(notification) {
		if (!notification || !notification.id || !isUnreadNotification(notification)) return null;
		const payload = await notificationApi(`/api/notifications/${notification.id}/read`, { method: 'POST' });
		if (Number.isFinite(Number(payload.unread_count))) {
			setNotificationBadge(Number(payload.unread_count));
		}
		updateNotificationFromPayload(payload.notification);
		return payload.notification || null;
	}

	async function markAllNotificationsRead(event) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		try {
			const payload = await notificationApi('/api/notifications/read-all', { method: 'POST' });
			const readAt = new Date().toISOString();
			notificationItems = notificationItems.map(item => ({
				...item,
				is_read: true,
				status: 'read',
				read_at: item.read_at || readAt,
			}));
			notificationCenterItems = notificationCenterItems.map(item => ({
				...item,
				is_read: true,
				status: 'read',
				read_at: item.read_at || readAt,
			}));
			setNotificationBadge(Number(payload.unread_count) || 0);
			renderNotifications();
			renderNotificationCenter();
		} catch (error) {
			console.warn('Không thể đánh dấu tất cả thông báo đã đọc:', error);
		}
	}

	function hideNotificationDropdown() {
		const { button } = notificationElements();
		if (!button || !window.bootstrap || !window.bootstrap.Dropdown) return;
		const instance = window.bootstrap.Dropdown.getInstance(button);
		if (instance) instance.hide();
	}

	function closeNotificationCenterPanel() {
		const { centerPanel } = notificationElements();
		if (!centerPanel) return;
		centerPanel.classList.remove('is-open');
		centerPanel.setAttribute('aria-hidden', 'true');
	}

	function openNotificationCenter(event) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		const { centerPanel } = notificationElements();
		hideNotificationDropdown();
		setNotificationCenterFilter('all');
		if (centerPanel) {
			centerPanel.classList.add('is-open');
			centerPanel.setAttribute('aria-hidden', 'false');
		}
		loadNotificationCenter();
	}

	async function openNotification(notification) {
		let currentNotification = notification;
		try {
			const updated = await markNotificationRead(notification);
			if (updated) currentNotification = { ...notification, ...updated };
		} catch (error) {
			console.warn('Không thể đánh dấu thông báo đã đọc:', error);
		}

		const href = currentNotification && currentNotification.action_url;
		if (!href) return;
		hideNotificationDropdown();
		closeNotificationCenterPanel();
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
			window.QLPKWorkspaceShell.openHref(href, {
				label: currentNotification.title || 'Thông báo',
				icon: notificationIconClass(currentNotification),
			});
			return;
		}
		window.location.href = href;
	}

	function bindNotificationDropdown() {
		const { button, readAllBtn, viewAllBtn, centerReadAllBtn, centerPanel, centerSurface, centerCloseBtn, centerCloseFooterBtn } = notificationElements();
		if (button) {
			button.addEventListener('click', () => loadNotifications({ silent: notificationLoaded }));
			button.addEventListener('shown.bs.dropdown', () => loadNotifications({ silent: true }));
		}
		if (centerPanel) {
			document.addEventListener('keydown', (event) => {
				if (event.key === 'Escape' && centerPanel.classList.contains('is-open')) closeNotificationCenterPanel();
			});
			document.addEventListener('click', (event) => {
				if (!centerPanel.classList.contains('is-open')) return;
				if (centerSurface && centerSurface.contains(event.target)) return;
				if (viewAllBtn && viewAllBtn.contains(event.target)) return;
				closeNotificationCenterPanel();
			});
		}
		if (readAllBtn) readAllBtn.addEventListener('click', markAllNotificationsRead);
		if (viewAllBtn) viewAllBtn.addEventListener('click', openNotificationCenter);
		if (centerReadAllBtn) centerReadAllBtn.addEventListener('click', markAllNotificationsRead);
		if (centerCloseBtn) centerCloseBtn.addEventListener('click', closeNotificationCenterPanel);
		if (centerCloseFooterBtn) centerCloseFooterBtn.addEventListener('click', closeNotificationCenterPanel);
		document.querySelectorAll('[data-qlpk-notification-filter]').forEach(buttonEl => {
			buttonEl.addEventListener('click', () => setNotificationCenterFilter(buttonEl.dataset.qlpkNotificationFilter));
		});
		renderNotifications();
		renderNotificationCenter();
	}

	function bindNotificationRealtime() {
		if (notificationRealtimeBound) return;
		notificationRealtimeBound = true;
		window.addEventListener('qlpk:realtime:event', function (event) {
			const realtimeEvent = event && event.detail ? event.detail : null;
			if (!realtimeEvent || realtimeEvent.type !== 'notification.changed') return;
			const payload = realtimeEvent.payload || {};
			if (Number.isFinite(Number(payload.unread_count))) {
				setNotificationBadge(Number(payload.unread_count));
			} else {
				incrementNotificationBadge(payload.count || 1);
			}
			if (payload.notification) {
				if (payload.action === 'created') {
					upsertRealtimeNotification(payload.notification);
				} else {
					updateNotificationFromPayload(payload.notification);
				}
			} else if (notificationLoaded) {
				loadNotifications({ silent: true });
			}
		});
	}

	function initializeHeader() {
		bindSearchShell();
		bindLogout();
		bindPasswordModal();
		bindCalendarButton();
		bindFullscreenButton();
		bindNotificationDropdown();
		bindNotificationRealtime();
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.init === 'function') {
			window.QLPKWorkspaceShell.init();
		}
		if (window.QLPKRealtimeClient && typeof window.QLPKRealtimeClient.start === 'function') {
			window.QLPKRealtimeClient.start();
		}
		hydrateUser();
		loadNotifications({ silent: true });
	}

	async function mountHeader() {
		if (isEmbeddedWorkspacePage()) return;

		const target = resolveMountTarget();
		if (!target || target.querySelector('[data-component="qlpk-app-header"]')) return;

		ensureStylesheet();

		try {
			const response = await fetch(`${HEADER_TEMPLATE_PATH}?v=${getAppVersion()}`);
			if (!response.ok) throw new Error(`Failed to load app header: ${response.statusText}`);
			const html = await response.text();
			const host = document.createElement('div');
			host.className = HEADER_CONTAINER_CLASS;
			host.innerHTML = html;
			target.insertBefore(host, target.firstChild);
			document.body.classList.add('qlpk-has-app-header');
			await ensureWorkspaceRuntime();
			initializeHeader();
		} catch (error) {
			console.error('Error loading app header:', error);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mountHeader);
	} else {
		mountHeader();
	}

	window.QLPKAppHeader = {
		reload: mountHeader,
		updateUserUi,
	};
})(window, document);
