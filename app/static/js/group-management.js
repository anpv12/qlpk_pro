// Permission groups: searchable list with permission badges, add/edit modal with a parent/child
// permission tree, read-only view, delete confirmation modal, realtime refresh.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './flatpickr-vn.js';
import './datepicker-init.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import { byId, delegate, el, on, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { PERMISSIONS } from './group-permissions.js';

const state = { groups: [], editingId: null, deletingId: null };
const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

function permissionBadges(perms) {
	return PERMISSIONS.flatMap(permission => {
		const children = (permission.children || []).filter(child => perms.includes(child.id));
		if (!perms.includes(permission.id) && !children.length) return [];
		return [el('div', { class: 'gm-perm-badge-wrap' },
			el('span', { class: `badge badge-role ${permission.color}` }, el('i', { class: permission.icon }), ` ${permission.label}`),
			children.map(child => el('span', { class: 'badge badge-child' }, child.label))), ' '];
	});
}

function actionButton(kind, className, title, iconName, id) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: `action-btn ${className}`, 'data-id': id, title }, el('i', { class: `bi ${iconName}` }));
}

function renderPage(groups) {
	replace(byId('groupTable').querySelector('tbody'), groups.map(group => el('tr', {},
		el('td', {}, el('input', { type: 'checkbox', class: 'row-check' })),
		el('td', {}, group.code), el('td', {}, group.name), el('td', {}, permissionBadges(group.permissions)),
		el('td', {}, actionButton('view', 'view-btn', 'Xem', 'bi-eye', group.id), ' ', actionButton('edit', 'edit-btn', 'Sửa', 'bi-pencil-square', group.id), ' ',
			actionButton('danger', 'delete-btn', 'Xoá', 'bi-trash', group.id)))));
}

const pagination = window.QLPKPagination.createClient({ render: renderPage });

function renderTable() {
	const keyword = normalize(byId('searchInput').value);
	pagination.setItems(state.groups.filter(group => [group.code, group.name, group.desc].some(value => normalize(value).includes(keyword))));
}

async function fetchGroups() {
	state.groups = await requestJson('/groups/');
	renderTable();
}

function permissionCheck(permission, className, checked, readonly, extraClass) {
	return el('div', { class: extraClass },
		el('input', { class: `form-check-input ${className}`, type: 'checkbox', value: permission.id, id: `perm_${permission.id}`, checked: checked.includes(permission.id), disabled: readonly }),
		el('label', { class: 'form-check-label', for: `perm_${permission.id}` }, permission.label));
}

function renderPermTree(container, checked = [], readonly = false) {
	replace(container, PERMISSIONS.map(permission => {
		const children = permission.children || [];
		const parent = permissionCheck(permission, 'perm-parent', checked, readonly, 'form-check tree-group mb-1');
		if (!children.length) return parent;
		const collapseId = `collapse_${permission.id}`;
		parent.append(' ', el('span', { class: 'collapse-toggle', 'data-bs-toggle': 'collapse', 'data-bs-target': `#${collapseId}` }, el('i', { class: 'bi bi-chevron-down' })));
		return [parent, el('div', { class: 'collapse show tree-children mb-2', id: collapseId },
			children.map(child => permissionCheck(child, 'perm-child', checked, readonly, 'form-check ms-2')))];
	}));
}

function formError(message) {
	const box = byId('groupFormError');
	box.classList.toggle('d-none', !message);
	box.textContent = message;
}

function openEditor(group) {
	state.editingId = group ? group.id : null;
	byId('groupModalLabel').textContent = group ? 'Cập nhật nhóm quyền' : 'Thêm mới nhóm quyền';
	const form = byId('groupForm');
	form.reset();
	if (group) ['code', 'name', 'desc'].forEach(name => { form.querySelector(`[name="${name}"]`).value = group[name] ?? ''; });
	renderPermTree(byId('permTreeEdit'), group ? group.permissions : [], false);
	formError('');
	modal('groupModal').show();
}

function openView(group) {
	const view = byId('viewGroupModal');
	['code', 'name', 'desc'].forEach(name => { view.querySelector(`[name="${name}"]`).value = group[name] ?? ''; });
	renderPermTree(byId('permTreeView'), group.permissions, true);
	modal('viewGroupModal').show();
}

async function saveGroup(event) {
	event.preventDefault();
	const form = event.currentTarget;
	const [code, name, desc] = ['code', 'name', 'desc'].map(field => form.querySelector(`[name="${field}"]`).value.trim());
	const permissions = [...byId('permTreeEdit').querySelectorAll('input[type=checkbox]')].filter(input => input.checked).map(input => input.value);
	if (!code || !name || permissions.length === 0) {
		formError('Vui lòng nhập đầy đủ thông tin bắt buộc và chọn ít nhất 1 quyền.');
		return;
	}
	const editing = state.editingId;
	try {
		await requestJson(editing ? `/groups/${editing}` : '/groups/', { method: editing ? 'PUT' : 'POST', json: { code, name, desc, permissions } });
		modal('groupModal').hide();
		fetchGroups().catch(() => {});
	} catch {
		formError(editing ? 'Không thể cập nhật nhóm quyền. Vui lòng kiểm tra lại.' : 'Không thể tạo nhóm quyền. Vui lòng kiểm tra lại.');
	}
}

async function confirmDelete() {
	if (!state.deletingId) return;
	try {
		await requestJson(`/groups/${state.deletingId}`, { method: 'DELETE' });
		modal('confirmDeleteGroupModal').hide();
		fetchGroups().catch(() => {});
		state.deletingId = null;
	} catch {
		window.QLPKUserFeedback?.show('error', 'Không thể xóa nhóm quyền. Vui lòng thử lại.');
	}
}

function bindTree() {
	delegate(document, 'change', '.perm-parent', (event, input) => {
		const children = input.closest('.tree-group').nextElementSibling;
		if (children && children.classList.contains('tree-children')) children.querySelectorAll('.perm-child').forEach(child => { child.checked = input.checked; });
	});
	delegate(document, 'change', '.perm-child', (event, input) => {
		const group = input.closest('.tree-children');
		const boxes = [...group.querySelectorAll('.perm-child')];
		const parent = group.previousElementSibling?.querySelector('.perm-parent');
		if (parent) parent.checked = boxes.every(box => box.checked);
	});
}

function bindTable() {
	const find = button => state.groups.find(group => group.id === Number(button.getAttribute('data-id')));
	const table = byId('groupTable');
	delegate(table, 'click', '.edit-btn', (event, button) => { const group = find(button); if (group) openEditor(group); });
	delegate(table, 'click', '.view-btn', (event, button) => { const group = find(button); if (group) openView(group); });
	delegate(table, 'click', '.delete-btn', (event, button) => {
		state.deletingId = Number(button.getAttribute('data-id'));
		modal('confirmDeleteGroupModal').show();
	});
}

on(byId('groupFilterForm'), 'submit', event => {
	event.preventDefault();
	renderTable();
});
on(byId('resetBtn'), 'click', () => {
	byId('searchInput').value = '';
	renderTable();
});
bindTree();
bindTable();
on(byId('addGroupBtn'), 'click', () => openEditor(null));
on(byId('confirmDeleteGroupBtn'), 'click', confirmDelete);
on(byId('groupForm'), 'submit', saveGroup);
byId('logoutBtn')?.addEventListener('click', () => window.QLPKAppHeader?.logout());
window.QLPKRealtimePageHooks?.register({
	types: ['catalog.changed'],
	filter: event => ['group', 'user_group'].includes(event && event.payload ? event.payload.entity : ''),
	handler: () => fetchGroups().catch(() => {}),
	debounceMs: 350,
});
fetchGroups().catch(() => {});
