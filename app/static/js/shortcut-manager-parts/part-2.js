// shortcut-manager.js: phần 2/2 (nạp trước shortcut-manager.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['shortcut-manager'] || (window.QLPKModuleParts['shortcut-manager'] = { state: {} });
	const moduleState = moduleParts.state;

	function installShortcutSettingsFns1(ctx) {
		const getCurrentScope = () => {
			if (!ctx.isAdmin || !ctx.scopeSelect) return 'mine';
			return ctx.scopeSelect.value || 'mine';
		};

		const loadUsersForAdmin = async () => {
			if (!moduleState.settingsCurrent() || !ctx.isAdmin || !ctx.userSelect) return;
			const res = await moduleParts.apiCall('/users/');
			if (!res.ok) throw new Error('Không tải được danh sách user');
			const users = await res.json();
			if (!moduleState.settingsCurrent()) return;
			moduleState.userNameById = {};
			(users || []).forEach(u => {
				const name = u.full_name || u.username || ('User #' + u.id);
				moduleState.userNameById[u.id] = name;
			});
			ctx.userSelect.innerHTML = '<option value="">-- Chọn user --</option>' + (users || [])
				.map(u => `<option value="${u.id}">${u.full_name || u.username || ('User #' + u.id)}</option>`).join('');
		};

		const fetchRowsForDisplay = async () => {
			if (ctx.isAdmin) {
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
			moduleParts.renderRows(moduleState.currentRows, ctx.tbody, {
				isAdmin: ctx.isAdmin,
				currentUserId: ctx.currentUserId,
				targetUserName: (ctx.userSelect?.options?.[ctx.userSelect.selectedIndex]?.text || '')
			});
			await moduleParts.refreshShortcuts();
		};

		const resetForm = () => {
			ctx.idInput.value = '';
			if (ctx.routeSelect) ctx.routeSelect.value = '';
			ctx.comboInput.value = '';
			ctx.urlInput.value = '';
			ctx.comboPreview.textContent = 'Chưa chọn';
		};

		function fillShortcutForm(row) {
			ctx.idInput.value = row.id;
			ctx.comboInput.value = row.combo_key || '';
			ctx.urlInput.value = row.target_url || '';
			if (ctx.routeSelect) ctx.routeSelect.value = row.target_url || '';
			ctx.comboPreview.textContent = row.combo_key || 'Chưa chọn';
		}

		Object.assign(ctx, { getCurrentScope, loadUsersForAdmin, reloadTable, resetForm, fillShortcutForm });
	}

	function installShortcutSettingsFns2(ctx) {
		async function deleteShortcut(id) {
			if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc muốn xóa phím tắt này?')) return;
			if (!moduleState.settingsCurrent()) return;
			try {
				const res = await moduleParts.apiCall(`/api/user-shortcuts/${id}`, { method: 'DELETE' });
				if (!moduleState.settingsCurrent()) return;
				if (!res.ok) {
					moduleParts.showMessage(ctx.alertBox, 'Không thể xóa phím tắt.', 'danger');
					return;
				}
				moduleParts.showMessage(ctx.alertBox, 'Đã xóa phím tắt.', 'success');
				await ctx.reloadTable();
			} catch (err) {
				moduleParts.showMessage(ctx.alertBox, 'Lỗi kết nối khi xóa phím tắt.', 'danger');
			}
		}

		Object.assign(ctx, { deleteShortcut });
	}

	function runShortcutSettingsSetup1(closureCtx) {
		closureCtx.ctx = {};
		installShortcutSettingsFns1(closureCtx.ctx);
		installShortcutSettingsFns2(closureCtx.ctx);
	}

	function runShortcutSettingsSetup2(closureCtx) {
		closureCtx.form = document.getElementById('shortcutForm');
		closureCtx.ctx.idInput = document.getElementById('shortcutId');
		closureCtx.ctx.comboInput = document.getElementById('shortcutCombo');
		closureCtx.ctx.routeSelect = document.getElementById('shortcutRoute');
		closureCtx.ctx.urlInput = document.getElementById('shortcutUrl');
		closureCtx.ctx.comboPreview = document.getElementById('shortcutComboPreview');
		closureCtx.ctx.tbody = document.getElementById('shortcutTableBody');
		closureCtx.ctx.alertBox = document.getElementById('shortcutAlert');
		const clearBtn = document.getElementById('shortcutClearBtn');
		closureCtx.ctx.scopeSelect = document.getElementById('shortcutScope');
		closureCtx.ctx.userSelect = document.getElementById('shortcutTargetUser');
		closureCtx.ctx.isAdmin = moduleParts.isAdminUser();
		closureCtx.ctx.currentUserId = moduleParts.currentUser().id || null;
		const scopeWrap = document.getElementById('shortcutScopeInlineWrap');
		const targetUserWrap = document.getElementById('shortcutTargetUserWrap');
		if (closureCtx.ctx.isAdmin && scopeWrap) scopeWrap.style.display = '';
		if (targetUserWrap) targetUserWrap.style.display = 'none';
		moduleParts.initRouteOptions(closureCtx.ctx.routeSelect);
		moduleParts.captureCombo(closureCtx.ctx.comboInput, closureCtx.ctx.comboPreview);
		if (closureCtx.ctx.routeSelect) {
			closureCtx.ctx.routeSelect.addEventListener('change', () => {
				closureCtx.ctx.urlInput.value = closureCtx.ctx.routeSelect.value || '';
			});
		}
		moduleState.settingsReloadTable = closureCtx.ctx.reloadTable;
		if (closureCtx.ctx.isAdmin && closureCtx.ctx.scopeSelect) {
			closureCtx.ctx.scopeSelect.value = 'all-users';
			closureCtx.ctx.scopeSelect.addEventListener('change', async () => {
				if (targetUserWrap) targetUserWrap.style.display = closureCtx.ctx.scopeSelect.value === 'user' ? '' : 'none';
				moduleParts.hideMessage(closureCtx.ctx.alertBox);
				try { await closureCtx.ctx.reloadTable(); } catch (e) { moduleParts.showMessage(closureCtx.ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
			});
		}
		if (closureCtx.ctx.isAdmin && closureCtx.ctx.userSelect) {
			closureCtx.ctx.userSelect.addEventListener('change', async () => {
				if (closureCtx.ctx.getCurrentScope() === 'user') {
					try { await closureCtx.ctx.reloadTable(); } catch (e) { moduleParts.showMessage(closureCtx.ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
				}
			});
		}
		clearBtn.addEventListener('click', function () {
			closureCtx.ctx.resetForm();
			moduleParts.hideMessage(closureCtx.ctx.alertBox);
		});
	}

	async function runShortcutSettingsSetup3(closureCtx) {
		closureCtx.form.addEventListener('submit', async function (e) {
			e.preventDefault();
			if (!moduleState.settingsCurrent()) { moduleParts.clearSessionState(); return; }
			moduleParts.hideMessage(closureCtx.ctx.alertBox);
			const combo = moduleParts.normalizeComboText(closureCtx.ctx.comboInput.value);
			if (!combo) {
				moduleParts.showMessage(closureCtx.ctx.alertBox, 'Tổ hợp phím không hợp lệ. Cần có phím bổ trợ (Ctrl/Alt/Shift) + phím chính.', 'warning');
				return;
			}
			const payload = {
				combo_key: combo,
				target_url: (closureCtx.ctx.urlInput.value || '').trim(),
				is_active: true
			};
			if (!payload.target_url || !moduleState.ALLOWED_NAV_URLS.has(payload.target_url)) {
				moduleParts.showMessage(closureCtx.ctx.alertBox, 'URL đích không hợp lệ.', 'warning');
				return;
			}

			const id = closureCtx.ctx.idInput.value;
			const target = moduleParts.resolveShortcutSaveRequest({ id, scope: closureCtx.ctx.getCurrentScope(), userSelect: closureCtx.ctx.userSelect, currentUserId: closureCtx.ctx.currentUserId, payload });
			if (target.warning) {
				moduleParts.showMessage(closureCtx.ctx.alertBox, target.warning, 'warning');
				return;
			}

			try {
				const method = id ? 'PUT' : 'POST';
				const res = await moduleParts.apiCall(target.url, { method, body: JSON.stringify(payload) });
				if (!moduleState.settingsCurrent()) return;
				if (!res.ok) {
					moduleParts.showMessage(closureCtx.ctx.alertBox, await moduleParts.readShortcutSaveError(res), 'danger');
					return;
				}
				moduleParts.showMessage(closureCtx.ctx.alertBox, 'Lưu phím tắt thành công.', 'success');
				closureCtx.ctx.resetForm();
				await closureCtx.ctx.reloadTable();
			} catch (err) {
				moduleParts.showMessage(closureCtx.ctx.alertBox, 'Lỗi kết nối khi lưu phím tắt.', 'danger');
			}
		});
		closureCtx.ctx.tbody.addEventListener('click', async function (e) {
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
				closureCtx.ctx.fillShortcutForm(row);
				return;
			}

			if (action === 'delete') await closureCtx.ctx.deleteShortcut(id);
		});
		try {
			if (closureCtx.ctx.isAdmin && closureCtx.ctx.scopeSelect) {
				await closureCtx.ctx.loadUsersForAdmin();
			}
			await closureCtx.ctx.reloadTable();
		} catch (e) {
			moduleParts.showMessage(closureCtx.ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger');
		}
	}

	async function attachSettingsPage() {
		const closureCtx = {};
		runShortcutSettingsSetup1(closureCtx);
		if (!await moduleParts.claimSettingsPage()) return;
		runShortcutSettingsSetup2(closureCtx);
		await runShortcutSettingsSetup3(closureCtx);
	}

	Object.assign(moduleParts, {
		attachSettingsPage
	});
})();
