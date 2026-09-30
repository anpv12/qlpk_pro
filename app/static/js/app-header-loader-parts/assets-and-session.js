// app-header-loader.js: phần 1/4 (nạp trước app-header-loader.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-header-loader'] || (window.QLPKModuleParts['app-header-loader'] = { state: {} });
	const moduleState = moduleParts.state;

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
		ensureLinkedStylesheet(moduleState.TYPOGRAPHY_STYLESHEET_ID, moduleState.TYPOGRAPHY_STYLESHEET_PATH);
		ensureLinkedStylesheet(moduleState.ICON_TOKENS_STYLESHEET_ID, moduleState.ICON_TOKENS_STYLESHEET_PATH);
		ensureLinkedStylesheet(moduleState.FEEDBACK_TOKENS_STYLESHEET_ID, moduleState.FEEDBACK_TOKENS_STYLESHEET_PATH);
		ensureLinkedStylesheet(moduleState.HEADER_STYLESHEET_ID, moduleState.HEADER_STYLESHEET_PATH);
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
			moduleState.ICON_SYSTEM_PATH,
			'qlpk-icon-system',
			() => !!window.QLPKIconSystem
		).then(() => ensureScriptLoaded(
			moduleState.NAVIGATION_CONFIG_PATH,
			'qlpk-navigation-config',
			() => !!window.QLPKNavigationConfig
		)).then(() => moduleState.WORKSPACE_TABS_PATHS.reduce((chain, path, index, paths) => chain.then(() => ensureScriptLoaded(
			path,
			index === paths.length - 1 ? 'qlpk-workspace-tabs' : `qlpk-workspace-tabs-part-${index + 1}`,
			() => !!window.QLPKWorkspaceShell
		)), Promise.resolve())).then(() => ensureScriptLoaded(
			moduleState.SOCKET_IO_CLIENT_PATH,
			'qlpk-socket-io-client',
			() => typeof window.io === 'function'
		)).then(() => ensureScriptLoaded(
			moduleState.REALTIME_CLIENT_PATH,
			'qlpk-realtime-client',
			() => !!window.QLPKRealtimeClient
		));
	}
	function resolveMountTarget() {
		return document.querySelector('.main-content') || document.querySelector('.appointment-fullscreen');
	}
	function readStoredUser() {
		const session = window.QLPKApiTransport?.session;
		if (session) return session.owner.snapshot().session?.user || {};
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
		return moduleState.ROLE_LABELS[role] || moduleState.ROLE_LABELS[normalized] || String(role);
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

		const input = readPasswordChangeInput();
		const { currentValue, newValue, submitBtn } = input;
		if (submitBtn?.disabled) return;
		const validationError = getPasswordChangeValidationError(input);
		if (validationError) {
			setPasswordMessage('error', validationError);
			return;
		}

		const session = window.QLPKApiTransport?.session;
		const token = session ? null : localStorage.getItem('qlpk_token');
		if (!session && !token) {
			setPasswordMessage('error', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
			return;
		}

		if (submitBtn) submitBtn.disabled = true;
		setPasswordMessage('', '');
		let passwordChanged = false;

		try {
			if (session) {
				await session.actions.changePassword(currentValue, newValue);
				finishPasswordChange('Đổi mật khẩu thành công.');
				return;
			}
			await changePasswordWithLegacyToken(token, currentValue, newValue, () => { passwordChanged = true; });
		} catch (error) {
			setPasswordMessage('error', passwordChanged
				? 'Mật khẩu đã đổi. Vui lòng đăng nhập lại bằng mật khẩu mới.'
				: 'Không thể xác nhận đổi mật khẩu. Vui lòng kiểm tra lại trước khi thử tiếp.');
		} finally {
			if (submitBtn) submitBtn.disabled = false;
		}
	}
	function readPasswordChangeInput() {
		const elements = getPasswordModalElements();
		const readValue = input => (input ? input.value.trim() : '');
		return {
			submitBtn: elements.submitBtn,
			currentValue: readValue(elements.currentPassword),
			newValue: readValue(elements.newPassword),
			confirmValue: readValue(elements.confirmPassword),
		};
	}
	function getPasswordChangeValidationError({ currentValue, newValue, confirmValue }) {
		if (!currentValue || !newValue || !confirmValue) return 'Vui lòng nhập đầy đủ thông tin.';
		if (newValue.length < 6) return 'Mật khẩu mới phải có ít nhất 6 ký tự.';
		if (newValue !== confirmValue) return 'Mật khẩu mới nhập lại không khớp.';
		return '';
	}
	function finishPasswordChange(message) {
		setPasswordMessage('success', message);
		getPasswordModalElements().form?.reset();
		closePasswordModalSoon();
	}
	// Legacy bearer-token path; returns true once the server accepted the new password.
	async function changePasswordWithLegacyToken(token, currentValue, newValue, markChanged) {
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
		markChanged();
		if (localStorage.getItem('qlpk_token') !== token) {
			setPasswordMessage('error', 'Mật khẩu đã đổi; phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại nếu cần.');
			return;
		}
		if (typeof payload.access_token !== 'string' || !payload.access_token) {
			throw new Error('Missing replacement session');
		}
		localStorage.setItem('qlpk_token', payload.access_token);
		localStorage.removeItem('token');
		window.QLPKRealtimeClient?.stop();
		window.QLPKRealtimeClient?.start();
		finishPasswordChange(payload.detail || 'Đổi mật khẩu thành công.');
	}
	async function fetchCurrentUser() {
		if (!moduleParts.hasHeaderSession()) return null;
		const response = await fetch('/users/me');
		if (!response.ok) throw new Error('Failed to load current user');
		return response.json();
	}
	function applyUserPermissions(permissions) {
		if (!window.QLPKApiTransport?.session) localStorage.setItem('qlpk_permissions', JSON.stringify(permissions));
		if (typeof window.checkPermissions === 'function') {
			window.checkPermissions();
		}
		const shell = window.QLPKWorkspaceShell;
		if (shell && typeof shell.renderLauncher === 'function') shell.renderLauncher();
		if (shell && typeof shell.renderTabs === 'function') shell.renderTabs();
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
			if (!window.QLPKApiTransport?.session) localStorage.setItem('qlpk_user', JSON.stringify(user));
			if (user.permissions) applyUserPermissions(user.permissions);
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
		moduleState.globalSearchGroups = [];
		moduleState.globalSearchFlatItems = [];
		moduleState.globalSearchActiveIndex = -1;
		if (options.resetSelection !== false) moduleState.globalSearchSelectedPatientId = null;
	}
	function closeGlobalSearchPanel() {
		setGlobalSearchPanelOpen(false);
		moduleState.globalSearchActiveIndex = -1;
	}
	function globalSearchApiHeaders() {
		return { Accept: 'application/json' };
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

	Object.assign(moduleParts, {
		getAppVersion,
		isEmbeddedWorkspacePage,
		ensureLinkedStylesheet,
		ensureStylesheet,
		ensureScriptLoaded,
		ensureWorkspaceRuntime,
		resolveMountTarget,
		readStoredUser,
		normalizeRole,
		roleLabel,
		initialsFromName,
		setText,
		updateSearchScope,
		updateUserUi,
		getPasswordModalElements,
		setPasswordMessage,
		resetPasswordModal,
		openPasswordModal,
		closePasswordModalSoon,
		submitPasswordChange,
		readPasswordChangeInput,
		getPasswordChangeValidationError,
		finishPasswordChange,
		changePasswordWithLegacyToken,
		fetchCurrentUser,
		hydrateUser,
		globalSearchElements,
		setGlobalSearchPanelOpen,
		setGlobalSearchStatus,
		clearGlobalSearchResults,
		closeGlobalSearchPanel,
		globalSearchApiHeaders,
		itemActions,
		itemAction,
		globalSearchPatientId,
		isGlobalSearchPatientItem
	});
})(window, document);
