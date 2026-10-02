// Account management: filtered list (server role filter, client text/status filter, stale responses
// dropped), delete confirmation, sidebar identity; the account modal lives in user-management-form.js.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './flatpickr-vn.js';
import './datepicker-init.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import { byId, delegate, el, on, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { bindColorSwatches, openAddUser, openEditUser, saveUser, uploadAvatar, uploadLicense } from './user-management-form.js';
import { QLPKSearchNormalization } from './shared/search-normalization.js';

const ROLE_LABELS = { admin: 'Admin', doctor: 'Bác sĩ', staff: 'Nhân viên', cashier: 'Thu ngân', PSYCHOLOGIST: 'Tâm lý gia' };
const ROLE_DISPLAY = { admin: 'Quản trị viên', doctor: 'Bác sĩ', staff: 'Nhân viên', cashier: 'Thu ngân', PSYCHOLOGIST: 'Tâm lý gia' };
const state = { users: [], editingUserId: null, userIdToDelete: null, revision: 0, currentAvatarUrl: '', currentLicenseCertificateUrl: '', currentLicenseCertificateFileName: '' };
const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const normalize = value => QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const roleLabel = role => (!role ? 'Chưa phân quyền' : ROLE_LABELS[role] || role);

function actionButton(kind, className, title, iconName, id) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: `action-btn ${className}`, 'data-id': id, title }, el('i', { class: `bi ${iconName}` }));
}

function renderPage(users, offset) {
	const body = byId('userTable').querySelector('tbody');
	if (!users.length) {
		replace(body, el('tr', {}, el('td', { colspan: 8, class: 'text-center text-muted' }, 'Không có dữ liệu')));
		return;
	}
	replace(body, users.map((user, index) => el('tr', {},
		el('td', {}, offset + index + 1), el('td', {}, user.full_name || ''), el('td', {}, user.username || ''), el('td', {}, roleLabel(user.role)),
		el('td', {}, user.address || ''), el('td', {}, user.phone || ''),
		el('td', {}, el('span', { class: `badge ${user.is_active ? 'qlpk-status--success' : 'qlpk-status--neutral'}` }, user.is_active ? 'Hoạt động' : 'Không hoạt động')),
		el('td', {}, actionButton('edit', 'edit-btn', 'Sửa', 'bi-pencil-square', user.id), ' ', actionButton('danger', 'delete-btn', 'Xoá', 'bi-trash', user.id)))));
}

const pagination = window.QLPKPagination.createClient({ render: renderPage });
const filters = () => ({ search: byId('searchInput').value, role: byId('roleFilter').value, status: byId('statusFilter').value });

async function fetchUsers(params = filters()) {
	const revision = ++state.revision;
	const data = await requestJson(`/users/?${new URLSearchParams(params)}`);
	if (revision !== state.revision) return;
	state.users = data.items || data;
	const keyword = normalize(params.search);
	pagination.setItems(state.users.filter(user => [user.full_name, user.username, user.phone].some(value => normalize(value).includes(keyword))
		&& (!params.status || user.is_active === (params.status === 'active'))));
}
const reload = () => fetchUsers().catch(() => {});

async function loadCurrentUserInfo() {
	const name = byId('sidebarUserName');
	const role = byId('sidebarUserRole');
	try {
		const response = await requestJson('/users/me');
		const userRole = response.role || 'Không xác định';
		if (name) replace(name, userRole.toUpperCase(), el('br'), response.full_name || 'Không xác định');
		if (role) role.textContent = ROLE_DISPLAY[userRole] || userRole;
	} catch {
		if (name) replace(name, 'ADMIN', el('br'), 'QLPK');
		if (role) role.textContent = 'Quản trị viên';
	}
}

async function confirmDelete() {
	const id = state.userIdToDelete;
	if (!id) return;
	state.userIdToDelete = null;
	const dialog = window.bootstrap.Modal.getInstance(byId('confirmDeleteModal'));
	try {
		await requestJson(`/users/${id}`, { method: 'DELETE' });
		dialog.hide();
		reload();
	} catch {
		dialog.hide();
		toast('error', 'Không thể xóa tài khoản. Vui lòng thử lại.');
	}
}

function bind() {
	byId('logoutBtn')?.addEventListener('click', () => window.QLPKAppHeader?.logout());
	on(byId('addUserBtn'), 'click', () => window.bootstrap.Modal.getOrCreateInstance(byId('userModal')).show());
	on(byId('filterForm'), 'submit', event => {
		event.preventDefault();
		fetchUsers(filters()).catch(() => {});
	});
	on(byId('resetBtn'), 'click', () => {
		byId('filterForm').reset();
		reload();
	});
	document.querySelectorAll('[data-bs-target="#userModal"]').forEach(button => on(button, 'click', () => openAddUser(state)));
	const table = byId('userTable');
	delegate(table, 'click', '.edit-btn', (event, button) => openEditUser(state, Number(button.getAttribute('data-id'))));
	delegate(table, 'click', '.delete-btn', (event, button) => {
		state.userIdToDelete = Number(button.getAttribute('data-id'));
		window.bootstrap.Modal.getOrCreateInstance(byId('confirmDeleteModal')).show();
	});
	on(byId('confirmDeleteBtn'), 'click', confirmDelete);
	on(byId('userForm'), 'submit', event => {
		event.preventDefault();
		saveUser(state, reload);
	});
	delegate(document, 'change', '#avatarFile', (event, input) => uploadAvatar(state, input));
	delegate(document, 'change', '#licenseCertificateFile', (event, input) => uploadLicense(state, input));
	delegate(document, 'focusin', '#passwordInput', (event, input) => { if (input.value === '********') input.value = ''; });
	bindColorSwatches(state);
}

if (!window.QLPKApiTransport.hasSession()) {
	window.location.href = '/login.html';
} else {
	bind();
	window.QLPKRealtimePageHooks?.register({
		types: ['catalog.changed'],
		filter: event => ['user', 'group', 'user_group'].includes(event && event.payload ? event.payload.entity : ''),
		handler: reload,
		debounceMs: 350,
	});
	if (window.QLPKApiTransport.hasSession()) loadCurrentUserInfo();
	reload();
}
