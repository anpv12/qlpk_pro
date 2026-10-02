import { moduleState } from './state.js';
import { apiCall, captureCombo, claimSettingsPage, clearSessionState, currentUser, hideMessage, initRouteOptions, isAdminUser, normalizeComboText, readShortcutSaveError, refreshShortcuts, renderRows, resolveShortcutSaveRequest, showMessage } from './session-and-keys.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';

function installShortcutSettings1(ctx) {
	const getCurrentScope = () => {
		if (!ctx.isAdmin || !ctx.scopeSelect) return 'mine';
		return ctx.scopeSelect.value || 'mine';
	};

	const loadUsersForAdmin = async () => {
		if (!moduleState.settingsCurrent() || !ctx.isAdmin || !ctx.userSelect) return;
		const res = await apiCall('/users/');
		if (!res.ok) throw new Error('Không tải được danh sách user');
		const users = await res.json();
		if (!moduleState.settingsCurrent()) return;
		moduleState.userNameById = {};
		(users || []).forEach(u => {
			const name = u.full_name || u.username || ('User #' + u.id);
			moduleState.userNameById[u.id] = name;
		});
		ctx.userSelect.replaceChildren(new Option('-- Chọn user --', ''), ...(users || [])
			.map(u => new Option(u.full_name || u.username || ('User #' + u.id), String(u.id))));
	};

	const fetchRowsForDisplay = async () => {
		if (ctx.isAdmin) {
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
		if (!moduleState.settingsCurrent()) return;
		const rows = await fetchRowsForDisplay();
		if (!moduleState.settingsCurrent()) return;
		moduleState.currentRows = Array.isArray(rows) ? rows : [];
		renderRows(moduleState.currentRows, ctx.tbody, {
			isAdmin: ctx.isAdmin,
			currentUserId: ctx.currentUserId,
			targetUserName: (ctx.userSelect?.options?.[ctx.userSelect.selectedIndex]?.text || '')
		});
		await refreshShortcuts();
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

function installShortcutSettings2(ctx) {
	async function deleteShortcut(id) {
		if (!await QLPKConfirmationDialog.confirmDelete('Bạn có chắc muốn xóa phím tắt này?')) return;
		if (!moduleState.settingsCurrent()) return;
		try {
			const res = await apiCall(`/api/user-shortcuts/${id}`, { method: 'DELETE' });
			if (!moduleState.settingsCurrent()) return;
			if (!res.ok) {
				showMessage(ctx.alertBox, 'Không thể xóa phím tắt.', 'danger');
				return;
			}
			showMessage(ctx.alertBox, 'Đã xóa phím tắt.', 'success');
			await ctx.reloadTable();
		} catch (err) {
			showMessage(ctx.alertBox, 'Lỗi kết nối khi xóa phím tắt.', 'danger');
		}
	}

	Object.assign(ctx, { deleteShortcut });
}

function runShortcutSettings1(ctx) {
	ctx.form = document.getElementById('shortcutForm');
	ctx.idInput = document.getElementById('shortcutId');
	ctx.comboInput = document.getElementById('shortcutCombo');
	ctx.routeSelect = document.getElementById('shortcutRoute');
	ctx.urlInput = document.getElementById('shortcutUrl');
	ctx.comboPreview = document.getElementById('shortcutComboPreview');
	ctx.tbody = document.getElementById('shortcutTableBody');
	ctx.alertBox = document.getElementById('shortcutAlert');
	const clearBtn = document.getElementById('shortcutClearBtn');
	ctx.scopeSelect = document.getElementById('shortcutScope');
	ctx.userSelect = document.getElementById('shortcutTargetUser');
	ctx.isAdmin = isAdminUser();
	ctx.currentUserId = currentUser().id || null;
	const scopeWrap = document.getElementById('shortcutScopeInlineWrap');
	const targetUserWrap = document.getElementById('shortcutTargetUserWrap');
	if (ctx.isAdmin && scopeWrap) scopeWrap.style.display = '';
	if (targetUserWrap) targetUserWrap.style.display = 'none';
	initRouteOptions(ctx.routeSelect);
	captureCombo(ctx.comboInput, ctx.comboPreview);
	if (ctx.routeSelect) {
		ctx.routeSelect.addEventListener('change', () => {
			ctx.urlInput.value = ctx.routeSelect.value || '';
		});
	}
	moduleState.settingsReloadTable = ctx.reloadTable;
	if (ctx.isAdmin && ctx.scopeSelect) {
		ctx.scopeSelect.value = 'all-users';
		ctx.scopeSelect.addEventListener('change', async () => {
			if (targetUserWrap) targetUserWrap.style.display = ctx.scopeSelect.value === 'user' ? '' : 'none';
			hideMessage(ctx.alertBox);
			try { await ctx.reloadTable(); } catch (e) { showMessage(ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
		});
	}
	if (ctx.isAdmin && ctx.userSelect) {
		ctx.userSelect.addEventListener('change', async () => {
			if (ctx.getCurrentScope() === 'user') {
				try { await ctx.reloadTable(); } catch (e) { showMessage(ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger'); }
			}
		});
	}
	clearBtn.addEventListener('click', function () {
		ctx.resetForm();
		hideMessage(ctx.alertBox);
	});
}

async function runShortcutSettings2(ctx) {
	ctx.form.addEventListener('submit', async function (e) {
		e.preventDefault();
		if (!moduleState.settingsCurrent()) { clearSessionState(); return; }
		hideMessage(ctx.alertBox);
		const combo = normalizeComboText(ctx.comboInput.value);
		if (!combo) {
			showMessage(ctx.alertBox, 'Tổ hợp phím không hợp lệ. Cần có phím bổ trợ (Ctrl/Alt/Shift) + phím chính.', 'warning');
			return;
		}
		const payload = {
			combo_key: combo,
			target_url: (ctx.urlInput.value || '').trim(),
			is_active: true
		};
		if (!payload.target_url || !moduleState.ALLOWED_NAV_URLS.has(payload.target_url)) {
			showMessage(ctx.alertBox, 'URL đích không hợp lệ.', 'warning');
			return;
		}

		const id = ctx.idInput.value;
		const target = resolveShortcutSaveRequest({ id, scope: ctx.getCurrentScope(), userSelect: ctx.userSelect, currentUserId: ctx.currentUserId, payload });
		if (target.warning) {
			showMessage(ctx.alertBox, target.warning, 'warning');
			return;
		}

		try {
			const method = id ? 'PUT' : 'POST';
			const res = await apiCall(target.url, { method, body: JSON.stringify(payload) });
			if (!moduleState.settingsCurrent()) return;
			if (!res.ok) {
				showMessage(ctx.alertBox, await readShortcutSaveError(res), 'danger');
				return;
			}
			showMessage(ctx.alertBox, 'Lưu phím tắt thành công.', 'success');
			ctx.resetForm();
			await ctx.reloadTable();
		} catch (err) {
			showMessage(ctx.alertBox, 'Lỗi kết nối khi lưu phím tắt.', 'danger');
		}
	});
	ctx.tbody.addEventListener('click', async function (e) {
		if (!moduleState.settingsCurrent()) { clearSessionState(); return; }
		const btn = e.target.closest('button[data-action]');
		if (!btn) return;
		const tr = e.target.closest('tr[data-id]');
		if (!tr) return;
		const id = tr.getAttribute('data-id');
		const action = btn.getAttribute('data-action');
		const row = moduleState.currentRows.find(r => String(r.id) === String(id));
		if (!row) return;

		if (action === 'edit') {
			ctx.fillShortcutForm(row);
			return;
		}

		if (action === 'delete') await ctx.deleteShortcut(id);
	});
	try {
		if (ctx.isAdmin && ctx.scopeSelect) {
			await ctx.loadUsersForAdmin();
		}
		await ctx.reloadTable();
	} catch (e) {
		showMessage(ctx.alertBox, 'Không thể tải phím tắt. Vui lòng thử lại.', 'danger');
	}
}

async function attachSettingsPage() {
	const ctx = {};
	installShortcutSettings1(ctx);
	installShortcutSettings2(ctx);
	if (!await claimSettingsPage()) return;
	runShortcutSettings1(ctx);
	await runShortcutSettings2(ctx);
}

export { attachSettingsPage };
