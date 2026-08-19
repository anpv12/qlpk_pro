(function () {
	'use strict';

	let shortcuts = [];
	let currentRows = [];
	let isGlobalBound = false;
	let isSettingsBound = false;
	let isRealtimeBound = false;
	let realtimeRefreshTimer = null;
	let settingsReloadTable = null;
	let userNameById = {};

	const ROUTE_OPTIONS = [
		{ label: 'Trang chủ', url: '/index.html' },
		{ label: 'Lễ tân', url: '/receptionist-new.html' },
		{ label: 'Lịch hẹn', url: '/appointment-management.html' },
		{ label: 'Bác sĩ khám', url: '/doctor-examination.html' },
		{ label: 'Tâm lý gia khám', url: '/psychologist-examination.html' },
		{ label: 'Hóa đơn', url: '/payment-waiting.html' },
		{ label: 'Chỉ định CLS', url: '/order-management.html' },
		{ label: 'Quản lý thuốc', url: '/medicine-management.html' },
		{ label: 'Kho thuốc', url: '/medicine-statistics' },
		{ label: 'Phân quyền', url: '/permission-management.html' },
		{ label: 'Quản lý nhóm quyền', url: '/group-management.html' },
		{ label: 'Quản lý người dùng', url: '/user-management.html' },
		{ label: 'Dịch vụ', url: '/service-management.html' },
		{ label: 'Gói dịch vụ', url: '/package-management.html' },
		{ label: 'Cấu hình phím tắt', url: '/shortcut-settings.html' }
	];

	const ALLOWED_NAV_URLS = new Set(ROUTE_OPTIONS.map(r => r.url));
	const ROUTE_LABEL_BY_URL = ROUTE_OPTIONS.reduce((acc, cur) => {
		acc[cur.url] = cur.label;
		return acc;
	}, {});


	function getAuthHeader() {
		const raw = localStorage.getItem('qlpk_token') || localStorage.getItem('token');
		if (!raw) return null;
		try {
			if (raw.startsWith('{')) {
				const obj = JSON.parse(raw);
				const t = obj.access_token || obj.token || obj.Authorization || obj.authorization;
				return t ? `Bearer ${String(t).replace(/^Bearer\s+/i, '')}` : null;
			}
			return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
		} catch (e) {
			return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
		}
	}

	async function apiCall(url, options = {}) {
		const auth = getAuthHeader();
		const hasBody = typeof options.body !== 'undefined' && options.body !== null;
		const headers = {
			...(auth ? { 'Authorization': auth } : {}),
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
		shortcuts = await loadShortcuts();
	}

	function bindGlobalListener() {
		if (isGlobalBound) return;
		isGlobalBound = true;
		document.addEventListener('keydown', function (e) {
			if (isTypingContext(e.target)) return;
			const combo = normalizeFromEvent(e);
			if (!combo) return;
			const match = shortcuts.find(s => s.is_active && normalizeComboText(s.combo_key) === combo);
			if (!match || !match.target_url) return;
			if (!ALLOWED_NAV_URLS.has(match.target_url)) return;
			e.preventDefault();
			if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
				window.QLPKWorkspaceShell.openHref(match.target_url, {
					label: ROUTE_LABEL_BY_URL[match.target_url] || match.target_url,
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
		if (isRealtimeBound) return;
		isRealtimeBound = true;
		window.addEventListener('qlpk:realtime:event', function (event) {
			const realtimeEvent = event && event.detail ? event.detail : null;
			if (!realtimeEvent || realtimeEvent.type !== 'catalog.changed') return;
			if (realtimeEvent.payload?.entity !== 'user_shortcut') return;

			window.clearTimeout(realtimeRefreshTimer);
			realtimeRefreshTimer = window.setTimeout(async function () {
				realtimeRefreshTimer = null;
				try {
					if (typeof settingsReloadTable === 'function') {
						await settingsReloadTable();
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
			if (context.scope === 'user') return context.targetUserName || (row.user_id ? (userNameById[row.user_id] || `User #${row.user_id}`) : 'Không xác định');
			if (row.user_id && userNameById[row.user_id]) return userNameById[row.user_id];
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
			tdScreen.textContent = ROUTE_LABEL_BY_URL[r.target_url] || 'Không xác định';

			const tdScope = document.createElement('td');
			tdScope.appendChild(createScopeBadge(r.scope, context.scope));

			const tdUser = document.createElement('td');
			tdUser.textContent = resolveUserText(r);

			const tdAction = document.createElement('td');
			const editBtn = document.createElement('button');
			editBtn.className = 'btn btn-sm btn-outline-primary';
			editBtn.dataset.action = 'edit';
			editBtn.textContent = 'Sửa';
			const delBtn = document.createElement('button');
			delBtn.className = 'btn btn-sm btn-outline-danger';
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
		routeSelect.innerHTML += ROUTE_OPTIONS.map(r => `<option value="${r.url}">${r.label}</option>`).join('');
	}

	function isAdminUser() {
		try {
			const raw = localStorage.getItem('qlpk_user');
			if (!raw) return false;
			const u = JSON.parse(raw);
			const role = String(u?.role || '').toLowerCase();
			return role === 'admin' || role === 'userrole.admin';
		} catch (e) {
			return false;
		}
	}

	async function attachSettingsPage() {
		const page = document.getElementById('shortcutSettingsPage');
		if (!page) return;
		if (isSettingsBound) return;
		isSettingsBound = true;

		const form = document.getElementById('shortcutForm');
		const idInput = document.getElementById('shortcutId');
		const comboInput = document.getElementById('shortcutCombo');
		const routeSelect = document.getElementById('shortcutRoute');
		const urlInput = document.getElementById('shortcutUrl');
		const comboPreview = document.getElementById('shortcutComboPreview');
		const tbody = document.getElementById('shortcutTableBody');
		const alertBox = document.getElementById('shortcutAlert');
		const clearBtn = document.getElementById('shortcutClearBtn');
		const scopeSelect = document.getElementById('shortcutScope');
		const userSelect = document.getElementById('shortcutTargetUser');
		const isAdmin = isAdminUser();
		let currentUserId = null;
		try {
			const me = JSON.parse(localStorage.getItem('qlpk_user') || '{}');
			currentUserId = me.id || null;
		} catch (_) {}
		const scopeWrap = document.getElementById('shortcutScopeInlineWrap');
		const targetUserWrap = document.getElementById('shortcutTargetUserWrap');

		if (isAdmin && scopeWrap) scopeWrap.style.display = '';
		if (targetUserWrap) targetUserWrap.style.display = 'none';

		initRouteOptions(routeSelect);
		captureCombo(comboInput, comboPreview);

		if (routeSelect) {
			routeSelect.addEventListener('change', () => {
				urlInput.value = routeSelect.value || '';
			});
		}

		const getCurrentScope = () => {
			if (!isAdmin || !scopeSelect) return 'mine';
			return scopeSelect.value || 'mine';
		};

		const loadUsersForAdmin = async () => {
			if (!isAdmin || !userSelect) return;
			const res = await apiCall('/users/');
			if (!res.ok) throw new Error('Không tải được danh sách user');
			const users = await res.json();
			userNameById = {};
			(users || []).forEach(u => {
				const name = u.full_name || u.username || ('User #' + u.id);
				userNameById[u.id] = name;
			});
			userSelect.innerHTML = '<option value="">-- Chọn user --</option>' + (users || [])
				.map(u => `<option value="${u.id}">${u.full_name || u.username || ('User #' + u.id)}</option>`).join('');
		};

		const fetchRowsForDisplay = async () => {
			if (isAdmin) {
				const [resUser, resGlobal] = await Promise.all([
					apiCall('/api/user-shortcuts/all-users'),
					apiCall('/api/user-shortcuts/global')
				]);
				if (!resUser.ok) throw new Error('Không tải được danh sách shortcut user');
				if (!resGlobal.ok) throw new Error('Không tải được danh sách shortcut global');
				const userRows = await resUser.json();
				const globalRows = await resGlobal.json();
				return [...(userRows || []), ...(globalRows || [])];
			}

			const res = await apiCall('/api/user-shortcuts/mine');
			if (!res.ok) throw new Error('Không tải được shortcut của bạn');
			return await res.json();
		};

		const reloadTable = async () => {
			const rows = await fetchRowsForDisplay();
			currentRows = Array.isArray(rows) ? rows : [];
			renderRows(currentRows, tbody, {
				isAdmin,
				currentUserId,
				targetUserName: (userSelect?.options?.[userSelect.selectedIndex]?.text || '')
			});
			await refreshShortcuts();
		};
		settingsReloadTable = reloadTable;

		const resetForm = () => {
			idInput.value = '';
			if (routeSelect) routeSelect.value = '';
			comboInput.value = '';
			urlInput.value = '';
			comboPreview.textContent = 'Chưa chọn';
		};

		if (isAdmin && scopeSelect) {
			scopeSelect.value = 'all-users';
			scopeSelect.addEventListener('change', async () => {
				if (targetUserWrap) targetUserWrap.style.display = scopeSelect.value === 'user' ? '' : 'none';
				hideMessage(alertBox);
				try { await reloadTable(); } catch (e) { showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
			});
		}

		if (isAdmin && userSelect) {
			userSelect.addEventListener('change', async () => {
				if (getCurrentScope() === 'user') {
					try { await reloadTable(); } catch (e) { showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
				}
			});
		}

		clearBtn.addEventListener('click', function () {
			resetForm();
			hideMessage(alertBox);
		});

		form.addEventListener('submit', async function (e) {
			e.preventDefault();
			hideMessage(alertBox);
			const combo = normalizeComboText(comboInput.value);
			if (!combo) {
				showMessage(alertBox, 'Tổ hợp phím không hợp lệ. Cần có phím bổ trợ (Ctrl/Alt/Shift) + phím chính.', 'warning');
				return;
			}
			const payload = {
				combo_key: combo,
				target_url: (urlInput.value || '').trim(),
				is_active: true
			};
			if (!payload.target_url || !ALLOWED_NAV_URLS.has(payload.target_url)) {
				showMessage(alertBox, 'URL đích không hợp lệ.', 'warning');
				return;
			}

			const id = idInput.value;
			const scope = getCurrentScope();
			let url = '/api/user-shortcuts/mine';
			if (scope === 'global') url = '/api/user-shortcuts/global';
			if (scope === 'all-users') {
				showMessage(alertBox, 'Vui lòng chọn "Theo user cụ thể" hoặc "Global" để tạo mới.', 'warning');
				return;
			}
			let selectedUserId = null;
			if (scope === 'user') {
				const uid = userSelect?.value;
				if (!uid) {
					showMessage(alertBox, 'Vui lòng chọn user cần áp dụng.', 'warning');
					return;
				}
				selectedUserId = Number(uid);
				url = `/api/user-shortcuts/user/${uid}`;
			}
			if (id) {
				url = `/api/user-shortcuts/${id}`;
				if (scope === 'global') {
					payload.scope = 'global';
					payload.user_id = null;
				} else {
					payload.scope = 'user';
					payload.user_id = selectedUserId || currentUserId || null;
				}
			}

			try {
				const method = id ? 'PUT' : 'POST';
				const res = await apiCall(url, { method, body: JSON.stringify(payload) });
				if (!res.ok) {
					let err = 'Không thể lưu phím tắt';
					try {
						const d = await res.json();
						err = d.detail || err;
					} catch (_) {}
					showMessage(alertBox, err, 'danger');
					return;
				}
				showMessage(alertBox, 'Lưu phím tắt thành công.', 'success');
				resetForm();
				await reloadTable();
			} catch (err) {
				showMessage(alertBox, 'Lỗi kết nối khi lưu phím tắt.', 'danger');
			}
		});

		tbody.addEventListener('click', async function (e) {
			const btn = e.target.closest('button[data-action]');
			if (!btn) return;
			const tr = e.target.closest('tr[data-id]');
			if (!tr) return;
			const id = tr.getAttribute('data-id');
			const action = btn.getAttribute('data-action');
			const row = currentRows.find(r => String(r.id) === String(id));
			if (!row) return;

			if (action === 'edit') {
				idInput.value = row.id;
				comboInput.value = row.combo_key || '';
				urlInput.value = row.target_url || '';
				if (routeSelect) routeSelect.value = row.target_url || '';
				comboPreview.textContent = row.combo_key || 'Chưa chọn';
				return;
			}

			if (action === 'delete') {
				if (!window.confirm('Bạn có chắc muốn xóa phím tắt này?')) return;
				try {
					const res = await apiCall(`/api/user-shortcuts/${id}`, { method: 'DELETE' });
					if (!res.ok) {
						showMessage(alertBox, 'Không thể xóa phím tắt.', 'danger');
						return;
					}
					showMessage(alertBox, 'Đã xóa phím tắt.', 'success');
					await reloadTable();
				} catch (err) {
					showMessage(alertBox, 'Lỗi kết nối khi xóa phím tắt.', 'danger');
				}
			}
		});

		try {
			if (isAdmin && scopeSelect) {
				await loadUsersForAdmin();
			}
			await reloadTable();
		} catch (e) {
			showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger');
		}
	}

	window.ShortcutManager = {
		initGlobal,
		attachSettingsPage,
		refreshShortcuts
	};

	document.addEventListener('DOMContentLoaded', async function () {
		if (!document.getElementById('shortcutSettingsPage')) return;
		await initGlobal();
		await attachSettingsPage();
	});
})();
