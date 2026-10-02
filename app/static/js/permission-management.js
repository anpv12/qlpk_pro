// Permission assignment: pick a user, tick the groups, save. Responses for a previously selected user
// are dropped (revision guard) and saving stays disabled until the chosen user's assignments load.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import { byId, delegate, el, on, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { QLPKSearchNormalization } from './shared/search-normalization.js';

const ROLE_LABELS = { admin: 'Quản trị viên', doctor: 'Bác sĩ', PSYCHOLOGIST: 'Tâm lý gia', staff: 'Nhân viên', cashier: 'Thu ngân' };
const state = { users: [], groups: [], selectedUserId: null, selectedGroupIds: [], userFilter: '', groupFilter: '', revision: 0, ready: false };

const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const normalize = value => QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const saveButton = () => byId('savePermissionBtn');
const heading = text => el('div', { class: 'fw-bold mt-2 mb-1 permission-tree-heading' }, text);

function renderUserList() {
	const keyword = normalize(state.userFilter);
	const users = state.users.filter(user => [user.full_name, user.username].some(value => normalize(value).includes(keyword)));
	if (!users.length) {
		replace(byId('userTree'), el('div', { class: 'text-muted' }, 'Không có người dùng'));
		return;
	}
	const grouped = new Map();
	users.forEach(user => {
		const role = user.role || 'other';
		if (!grouped.has(role)) grouped.set(role, []);
		grouped.get(role).push(user);
	});
	replace(byId('userTree'), [...grouped].map(([role, members]) => [heading(ROLE_LABELS[role] || role), members.map(user =>
		el('div', { class: `user-item mb-1 px-2 py-1 rounded${String(user.id) === String(state.selectedUserId) ? ' active' : ''}`, 'data-user-id': user.id },
			user.full_name || user.username))]));
}

function renderGroupList() {
	let groups = state.groups;
	if (state.groupFilter.trim() !== '') {
		const keyword = normalize(state.groupFilter);
		groups = groups.filter(group => normalize(group.name || group.desc).includes(keyword) || normalize(group.code).includes(keyword));
	}
	if (!groups.length) {
		replace(byId('groupTree'), el('div', { class: 'text-muted' }, 'Không có nhóm quyền'));
		return;
	}
	replace(byId('groupTree'), heading('Quyền'), groups.map(group => el('div', { class: 'form-check group-checkbox mb-2' },
		el('input', { class: 'form-check-input group-checkbox-input', type: 'checkbox', value: group.id, id: `group_${group.id}`,
			checked: state.selectedGroupIds.includes(String(group.id)), disabled: !state.ready }),
		el('label', { class: 'form-check-label', for: `group_${group.id}` }, `${group.name || group.desc || group.code} (${group.code})`))));
}

async function fetchUsers() {
	const data = await requestJson('/users/');
	state.users = data.items || data;
	renderUserList();
}

async function fetchGroups() {
	state.groups = await requestJson('/groups/');
	renderGroupList();
}

// The GET contract is an array of user-group assignments, not group_ids.
async function fetchUserGroups(userId) {
	const revision = ++state.revision;
	state.ready = false;
	state.selectedGroupIds = [];
	saveButton().disabled = true;
	renderGroupList();
	let data;
	try {
		data = await requestJson(`/user-groups/${userId}`);
	} catch {
		if (revision === state.revision) toast('error', 'Không tải được quyền của người dùng. Vui lòng chọn lại.');
		return;
	}
	if (revision !== state.revision || String(state.selectedUserId) !== String(userId)) return;
	if (!Array.isArray(data)) {
		toast('error', 'Dữ liệu nhóm quyền không hợp lệ');
		return;
	}
	state.selectedGroupIds = data.map(group => String(group.group_id));
	state.ready = true;
	saveButton().disabled = false;
	renderGroupList();
}

async function reloadPermissionData() {
	await fetchUsers();
	if (state.selectedUserId && !state.users.some(user => String(user.id) === String(state.selectedUserId))) {
		Object.assign(state, { selectedUserId: null, selectedGroupIds: [], ready: false, revision: state.revision + 1 });
		saveButton().disabled = true;
	}
	await fetchGroups();
	if (state.selectedUserId) fetchUserGroups(state.selectedUserId);
	else renderGroupList();
}

async function savePermissions() {
	if (!state.selectedUserId || !state.ready) {
		toast('warning', 'Vui lòng chọn người dùng!');
		return;
	}
	try {
		await requestJson(`/user-groups/${state.selectedUserId}`, { method: 'POST', json: { group_ids: state.selectedGroupIds } });
		toast('success', 'Lưu phân quyền thành công!');
	} catch {
		toast('error', 'Lưu phân quyền thất bại!');
	}
}

function bind() {
	delegate(byId('userTree'), 'click', '.user-item', (event, item) => {
		state.selectedUserId = item.getAttribute('data-user-id');
		byId('userTree').querySelectorAll('.user-item').forEach(row => row.classList.toggle('active', row === item));
		fetchUserGroups(state.selectedUserId);
	});
	delegate(byId('groupTree'), 'change', '.group-checkbox-input', (event, input) => {
		if (!state.ready) return;
		state.selectedGroupIds = state.selectedGroupIds.filter(id => id !== input.value);
		if (input.checked) state.selectedGroupIds.push(input.value);
	});
	on(saveButton(), 'click', savePermissions);
	on(byId('userSearchInput'), 'input', event => {
		state.userFilter = event.target.value;
		renderUserList();
	});
	on(byId('groupSearchInput'), 'input', event => {
		state.groupFilter = event.target.value;
		renderGroupList();
	});
	byId('logoutBtn')?.addEventListener('click', () => window.QLPKAppHeader?.logout());
}

bind();
saveButton().disabled = true;
window.QLPKRealtimePageHooks?.register({
	types: ['catalog.changed'],
	filter: event => ['user', 'group', 'user_group'].includes(event && event.payload ? event.payload.entity : ''),
	handler: () => reloadPermissionData().catch(() => {}),
	debounceMs: 350,
});
fetchUsers().then(fetchGroups).catch(() => {});
