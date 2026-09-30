// shortcut-manager.js: phần 1/2 (nạp trước shortcut-manager.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['shortcut-manager'] || (window.QLPKModuleParts['shortcut-manager'] = { state: {} });
	const moduleState = moduleParts.state;

	function currentUser() {
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) {
			const current = owner.snapshot();
			return current.status === 'authenticated' ? current.session.user : {};
		}
		try { return JSON.parse(localStorage.getItem('qlpk_user') || '{}') || {}; }
		catch (_) { return {}; }
	}
	function captureIdentity() {
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) {
			const current = owner.snapshot();
			return () => window.QLPKApiTransport?.session?.owner === owner
				&& current.status === 'authenticated' && owner.snapshot().status === 'authenticated'
				&& owner.snapshot().revision === current.revision;
		}
		const identity = localStorage.getItem('qlpk_user');
		return () => !window.QLPKApiTransport?.session && localStorage.getItem('qlpk_user') === identity;
	}
	function clearSessionState() {
		moduleState.shortcutRevision += 1;
		moduleState.shortcuts = [];
		moduleState.shortcutsCurrent = () => false;
		moduleState.currentRows = [];
		moduleState.userNameById = {};
		window.clearTimeout(moduleState.realtimeRefreshTimer);
		if (moduleState.settingsCurrent && !moduleState.settingsCurrent()) {
			moduleState.settingsReloadTable = null;
			const form = document.getElementById('shortcutForm');
			if (form) form.inert = true;
			document.getElementById('shortcutTableBody')?.replaceChildren();
			showMessage(document.getElementById('shortcutAlert'), 'Phiên đã thay đổi. Vui lòng tải lại trang để cấu hình phím tắt.', 'warning');
		}
	}
	function bindSessionState() {
		if (moduleState.sessionBound) return;
		moduleState.sessionBound = true;
		window.QLPKApiTransport?.session?.owner.subscribe(clearSessionState);
		window.addEventListener('storage', event => {
			if (!event.key || ['qlpk_user', 'qlpk_token', 'token'].includes(event.key)) clearSessionState();
		});
		document.addEventListener('qlpk:logout:confirmed', clearSessionState);
	}
	async function apiCall(url, options = {}) {
		const hasBody = typeof options.body !== 'undefined' && options.body !== null;
		const headers = {
			...(hasBody ? { 'Content-Type': 'application/json' } : {}),
			...(options.headers || {})
		};
		return fetch(url, { ...options, headers });
	}
	function normalizeFromEvent(e) {
		const parts = [];
		if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
		if (e.altKey) parts.push('Alt');
		if (e.shiftKey) parts.push('Shift');

		let key = e.key || '';
		if (!key) return '';
		if (key === ' ') key = 'Space';
		if (key.length === 1) key = key.toUpperCase();
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return '';
		if (!parts.length) return '';
		parts.push(key.toUpperCase());
		return parts.join('+');
	}
	function normalizeComboText(text) {
		if (!text) return '';
		const arr = String(text).split('+').map(s => s.trim()).filter(Boolean);
		const modifiers = [];
		let key = '';
		arr.forEach(p => {
			const low = p.toLowerCase();
			if (['ctrl', 'control', 'meta', 'cmd', 'command', 'controlormeta'].includes(low)) {
				if (!modifiers.includes('Ctrl')) modifiers.push('Ctrl');
			} else if (low === 'alt') {
				if (!modifiers.includes('Alt')) modifiers.push('Alt');
			} else if (low === 'shift') {
				if (!modifiers.includes('Shift')) modifiers.push('Shift');
			} else {
				key = p.toUpperCase();
			}
		});
		if (!modifiers.length || !key) return '';
		return [...modifiers, key].join('+');
	}
	function isTypingContext(target) {
		if (!target) return false;
		const tag = (target.tagName || '').toLowerCase();
		if (target.isContentEditable) return true;
		return ['input', 'textarea', 'select'].includes(tag);
	}
	async function loadShortcuts() {
		const res = await apiCall('/api/user-shortcuts');
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? data : [];
	}
	async function refreshShortcuts() {
		bindSessionState();
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) await owner.ready();
		const revision = ++moduleState.shortcutRevision;
		const isCurrent = captureIdentity();
		const rows = await loadShortcuts();
		if (revision !== moduleState.shortcutRevision || !isCurrent()) return;
		moduleState.shortcuts = rows;
		moduleState.shortcutsCurrent = isCurrent;
	}
	function bindGlobalListener() {
		if (moduleState.isGlobalBound) return;
		moduleState.isGlobalBound = true;
		document.addEventListener('keydown', function (e) {
			if (!moduleState.shortcutsCurrent()) return;
			if (isTypingContext(e.target)) return;
			const combo = normalizeFromEvent(e);
			if (!combo) return;
			const match = moduleState.shortcuts.find(s => s.is_active && normalizeComboText(s.combo_key) === combo);
			if (!match || !match.target_url) return;
			if (!moduleState.ALLOWED_NAV_URLS.has(match.target_url)) return;
			e.preventDefault();
			if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
				window.QLPKWorkspaceShell.openHref(match.target_url, {
					label: moduleState.ROUTE_LABEL_BY_URL[match.target_url] || match.target_url,
					icon: 'bi bi-keyboard',
				});
				return;
			}
			window.location.href = match.target_url;
		});
	}
	async function initGlobal() {
		try {
			bindRealtimeRefreshListener();
			await refreshShortcuts();
			bindGlobalListener();
		} catch (e) {
			console.error('initGlobal error:', e);
		}
	}
	function bindRealtimeRefreshListener() {
		if (moduleState.isRealtimeBound) return;
		moduleState.isRealtimeBound = true;
		window.addEventListener('qlpk:realtime:event', function (event) {
			const realtimeEvent = event && event.detail ? event.detail : null;
			if (!realtimeEvent || realtimeEvent.type !== 'catalog.changed') return;
			if (realtimeEvent.payload?.entity !== 'user_shortcut') return;

			window.clearTimeout(moduleState.realtimeRefreshTimer);
			moduleState.realtimeRefreshTimer = window.setTimeout(async function () {
				moduleState.realtimeRefreshTimer = null;
				try {
					if (typeof moduleState.settingsReloadTable === 'function') {
						await moduleState.settingsReloadTable();
						return;
					}
					await refreshShortcuts();
				} catch (error) {
					console.error('shortcut realtime refresh error:', error);
				}
			}, 250);
		});
	}
	function showMessage(el, text, type = 'info') {
		if (!el) return;
		el.className = `alert alert-${type}`;
		el.textContent = text;
		el.style.display = 'block';
	}
	function hideMessage(el) {
		if (!el) return;
		el.style.display = 'none';
	}
	function createScopeBadge(scope, rowUserId, context = {}) {
		const span = document.createElement('span');
		if (scope === 'global') {
			span.className = 'badge bg-primary-subtle text-primary-emphasis';
			span.textContent = 'Global';
			return span;
		}
		if (!context.isAdmin && context.currentUserId && String(rowUserId) === String(context.currentUserId)) {
			span.className = 'badge bg-info-subtle text-info-emphasis';
			span.textContent = 'Của tôi';
			return span;
		}
		if (scope === 'user') {
			span.className = 'badge bg-success-subtle text-success-emphasis';
			span.textContent = 'User';
			return span;
		}
		span.className = 'badge bg-secondary-subtle text-secondary-emphasis';
		span.textContent = '-';
		return span;
	}
	function renderRows(rows, tbody, context = {}) {
		if (!tbody) return;
		tbody.innerHTML = '';
		if (!rows.length) {
			const tr = document.createElement('tr');
			const td = document.createElement('td');
			td.colSpan = 6;
			td.className = 'text-center text-muted py-3';
			td.textContent = 'Chưa có phím tắt';
			tr.appendChild(td);
			tbody.appendChild(tr);
			return;
		}

		const resolveUserText = (row) => {
			if (row.scope === 'global') return 'Tất cả';
			if (context.scope === 'mine') return 'Tôi';
			if (context.scope === 'user') return context.targetUserName || (row.user_id ? (moduleState.userNameById[row.user_id] || `User #${row.user_id}`) : 'Không xác định');
			if (row.user_id && moduleState.userNameById[row.user_id]) return moduleState.userNameById[row.user_id];
			return row.user_id ? `User #${row.user_id}` : 'Không xác định';
		};

		rows.forEach(r => {
			const tr = document.createElement('tr');
			tr.dataset.id = String(r.id);

			const tdCombo = document.createElement('td');
			const codeCombo = document.createElement('code');
			codeCombo.textContent = r.combo_key || '';
			tdCombo.appendChild(codeCombo);

			const tdUrl = document.createElement('td');
			const codeUrl = document.createElement('code');
			codeUrl.textContent = r.target_url || '';
			tdUrl.appendChild(codeUrl);

			const tdScreen = document.createElement('td');
			tdScreen.textContent = moduleState.ROUTE_LABEL_BY_URL[r.target_url] || 'Không xác định';

			const tdScope = document.createElement('td');
			tdScope.appendChild(createScopeBadge(r.scope, context.scope));

			const tdUser = document.createElement('td');
			tdUser.textContent = resolveUserText(r);

			const tdAction = document.createElement('td');
			const editBtn = document.createElement('button');
			editBtn.className = 'btn btn-sm';
			editBtn.dataset.qlpkButton = 'edit';
			editBtn.dataset.qlpkButtonVariant = 'soft';
			editBtn.dataset.action = 'edit';
			editBtn.textContent = 'Sửa';
			const delBtn = document.createElement('button');
			delBtn.className = 'btn btn-sm';
			delBtn.dataset.qlpkButton = 'danger';
			delBtn.dataset.qlpkButtonVariant = 'soft';
			delBtn.dataset.action = 'delete';
			delBtn.textContent = 'Xóa';
			tdAction.appendChild(editBtn);
			tdAction.appendChild(document.createTextNode(' '));
			tdAction.appendChild(delBtn);

			tr.appendChild(tdCombo);
			tr.appendChild(tdScreen);
			tr.appendChild(tdUrl);
			tr.appendChild(tdScope);
			tr.appendChild(tdUser);
			tr.appendChild(tdAction);
			tbody.appendChild(tr);
		});
	}
	function captureCombo(input, previewEl) {
		if (!input) return;
		input.addEventListener('keydown', function (e) {
			if (['Tab', 'Escape'].includes(e.key)) return;
			if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
				return;
			}
			e.preventDefault();
			const combo = normalizeFromEvent(e);
			if (!combo) return;
			input.value = combo;
			if (previewEl) previewEl.textContent = combo;
		});
	}
	function initRouteOptions(routeSelect) {
		if (!routeSelect) return;
		routeSelect.innerHTML = '<option value="">-- Chọn màn hình --</option>';
		routeSelect.innerHTML += moduleState.ROUTE_OPTIONS.map(r => `<option value="${window.QLPKHtml.escape(r.url)}">${window.QLPKHtml.escape(r.label)}</option>`).join('');
	}
	function isAdminUser() {
		const role = String(currentUser().role || '').toLowerCase();
		return role === 'admin' || role === 'userrole.admin';
	}
	// Waits for the session owner and claims the page once; false when it must not bind.
	async function claimSettingsPage() {
		if (!document.getElementById('shortcutSettingsPage') || moduleState.isSettingsBound) return false;
		bindSessionState();
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) {
			try { await owner.ready(); } catch (_) { return false; }
		}
		if (moduleState.isSettingsBound) return false;
		moduleState.settingsCurrent = captureIdentity();
		if (!moduleState.settingsCurrent()) return false;
		moduleState.isSettingsBound = true;
		return true;
	}
	// Target URL for saving a shortcut in the chosen scope, or a warning when the scope is incomplete.
	function resolveShortcutSaveRequest({ id, scope, userSelect, currentUserId, payload }) {
		if (scope === 'all-users') return { warning: 'Vui lòng chọn "Theo user cụ thể" hoặc "Global" để tạo mới.' };
		let url = scope === 'global' ? '/api/user-shortcuts/global' : '/api/user-shortcuts/mine';
		let selectedUserId = null;
		if (scope === 'user') {
			const uid = userSelect?.value;
			if (!uid) return { warning: 'Vui lòng chọn user cần áp dụng.' };
			selectedUserId = Number(uid);
			url = `/api/user-shortcuts/user/${uid}`;
		}
		if (id) {
			url = `/api/user-shortcuts/${id}`;
			payload.scope = scope === 'global' ? 'global' : 'user';
			payload.user_id = scope === 'global' ? null : (selectedUserId || currentUserId || null);
		}
		return { url };
	}
	async function readShortcutSaveError(res) {
		try {
			const d = await res.json();
			return d.detail || 'Không thể lưu phím tắt';
		} catch (_) {
			return 'Không thể lưu phím tắt';
		}
	}

	Object.assign(moduleParts, {
		currentUser,
		captureIdentity,
		clearSessionState,
		bindSessionState,
		apiCall,
		normalizeFromEvent,
		normalizeComboText,
		isTypingContext,
		loadShortcuts,
		refreshShortcuts,
		bindGlobalListener,
		initGlobal,
		bindRealtimeRefreshListener,
		showMessage,
		hideMessage,
		createScopeBadge,
		renderRows,
		captureCombo,
		initRouteOptions,
		isAdminUser,
		claimSettingsPage,
		resolveShortcutSaveRequest,
		readShortcutSaveError
	});
})();
