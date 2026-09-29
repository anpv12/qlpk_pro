// shortcut-manager.js: phần 2/2 (nạp trước shortcut-manager.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['shortcut-manager'] || (window.QLPKModuleParts['shortcut-manager'] = { state: {} });
	const moduleState = moduleParts.state;

	async function attachSettingsPage() {
		if (!await moduleParts.claimSettingsPage()) return;

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
		const isAdmin = moduleParts.isAdminUser();
		const currentUserId = moduleParts.currentUser().id || null;
		const scopeWrap = document.getElementById('shortcutScopeInlineWrap');
		const targetUserWrap = document.getElementById('shortcutTargetUserWrap');

		if (isAdmin && scopeWrap) scopeWrap.style.display = '';
		if (targetUserWrap) targetUserWrap.style.display = 'none';

		moduleParts.initRouteOptions(routeSelect);
		moduleParts.captureCombo(comboInput, comboPreview);

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
			if (!moduleState.settingsCurrent() || !isAdmin || !userSelect) return;
			const res = await moduleParts.apiCall('/users/');
			if (!res.ok) throw new Error('Không tải được danh sách user');
			const users = await res.json();
			if (!moduleState.settingsCurrent()) return;
			moduleState.userNameById = {};
			(users || []).forEach(u => {
				const name = u.full_name || u.username || ('User #' + u.id);
				moduleState.userNameById[u.id] = name;
			});
			userSelect.innerHTML = '<option value="">-- Chọn user --</option>' + (users || [])
				.map(u => `<option value="${u.id}">${u.full_name || u.username || ('User #' + u.id)}</option>`).join('');
		};

		const fetchRowsForDisplay = async () => {
			if (isAdmin) {
				const [resUser, resGlobal] = await Promise.all([
					moduleParts.apiCall('/api/user-shortcuts/all-users'),
					moduleParts.apiCall('/api/user-shortcuts/global')
				]);
				if (!resUser.ok) throw new Error('Không tải được danh sách shortcut user');
				if (!resGlobal.ok) throw new Error('Không tải được danh sách shortcut global');
				const userRows = await resUser.json();
				const globalRows = await resGlobal.json();
				return [...(userRows || []), ...(globalRows || [])];
			}

			const res = await moduleParts.apiCall('/api/user-shortcuts/mine');
			if (!res.ok) throw new Error('Không tải được shortcut của bạn');
			return await res.json();
		};

		const reloadTable = async () => {
			if (!moduleState.settingsCurrent()) return;
			const rows = await fetchRowsForDisplay();
			if (!moduleState.settingsCurrent()) return;
			moduleState.currentRows = Array.isArray(rows) ? rows : [];
			moduleParts.renderRows(moduleState.currentRows, tbody, {
				isAdmin,
				currentUserId,
				targetUserName: (userSelect?.options?.[userSelect.selectedIndex]?.text || '')
			});
			await moduleParts.refreshShortcuts();
		};
		moduleState.settingsReloadTable = reloadTable;

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
				moduleParts.hideMessage(alertBox);
				try { await reloadTable(); } catch (e) { moduleParts.showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
			});
		}

		if (isAdmin && userSelect) {
			userSelect.addEventListener('change', async () => {
				if (getCurrentScope() === 'user') {
					try { await reloadTable(); } catch (e) { moduleParts.showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
				}
			});
		}

		clearBtn.addEventListener('click', function () {
			resetForm();
			moduleParts.hideMessage(alertBox);
		});

		form.addEventListener('submit', async function (e) {
			e.preventDefault();
			if (!moduleState.settingsCurrent()) { moduleParts.clearSessionState(); return; }
			moduleParts.hideMessage(alertBox);
			const combo = moduleParts.normalizeComboText(comboInput.value);
			if (!combo) {
				moduleParts.showMessage(alertBox, 'Tổ hợp phím không hợp lệ. Cần có phím bổ trợ (Ctrl/Alt/Shift) + phím chính.', 'warning');
				return;
			}
			const payload = {
				combo_key: combo,
				target_url: (urlInput.value || '').trim(),
				is_active: true
			};
			if (!payload.target_url || !moduleState.ALLOWED_NAV_URLS.has(payload.target_url)) {
				moduleParts.showMessage(alertBox, 'URL đích không hợp lệ.', 'warning');
				return;
			}

			const id = idInput.value;
			const target = moduleParts.resolveShortcutSaveRequest({ id, scope: getCurrentScope(), userSelect, currentUserId, payload });
			if (target.warning) {
				moduleParts.showMessage(alertBox, target.warning, 'warning');
				return;
			}

			try {
				const method = id ? 'PUT' : 'POST';
				const res = await moduleParts.apiCall(target.url, { method, body: JSON.stringify(payload) });
				if (!moduleState.settingsCurrent()) return;
				if (!res.ok) {
					moduleParts.showMessage(alertBox, await moduleParts.readShortcutSaveError(res), 'danger');
					return;
				}
				moduleParts.showMessage(alertBox, 'Lưu phím tắt thành công.', 'success');
				resetForm();
				await reloadTable();
			} catch (err) {
				moduleParts.showMessage(alertBox, 'Lỗi kết nối khi lưu phím tắt.', 'danger');
			}
		});

		tbody.addEventListener('click', async function (e) {
			if (!moduleState.settingsCurrent()) { moduleParts.clearSessionState(); return; }
			const btn = e.target.closest('button[data-action]');
			if (!btn) return;
			const tr = e.target.closest('tr[data-id]');
			if (!tr) return;
			const id = tr.getAttribute('data-id');
			const action = btn.getAttribute('data-action');
			const row = moduleState.currentRows.find(r => String(r.id) === String(id));
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
				if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc muốn xóa phím tắt này?')) return;
				if (!moduleState.settingsCurrent()) return;
				try {
					const res = await moduleParts.apiCall(`/api/user-shortcuts/${id}`, { method: 'DELETE' });
					if (!moduleState.settingsCurrent()) return;
					if (!res.ok) {
						moduleParts.showMessage(alertBox, 'Không thể xóa phím tắt.', 'danger');
						return;
					}
					moduleParts.showMessage(alertBox, 'Đã xóa phím tắt.', 'success');
					await reloadTable();
				} catch (err) {
					moduleParts.showMessage(alertBox, 'Lỗi kết nối khi xóa phím tắt.', 'danger');
				}
			}
		});

		try {
			if (isAdmin && scopeSelect) {
				await loadUsersForAdmin();
			}
			await reloadTable();
		} catch (e) {
			moduleParts.showMessage(alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger');
		}
	}

	Object.assign(moduleParts, {
		attachSettingsPage
	});
})();
