// Shared "Chuyển khám" modal for receptionist, doctor and psychologist pages
// (markup: templates/partials/transfer-modal.html, included by each page).
import { el, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';

let currentTransferData = emptyTransferData();
// Called after a successful transfer (reloads the caller's list)
let reloadCallback = null;
let transferOptions = {};
let sessionToken = 0;
let personRequestToken = 0;
let transferring = false;
let authContext = null;

function emptyTransferData() {
	return { appointmentIds: [], fromRole: null, toRole: null, toPersonId: null, toPersonName: null };
}

// Snapshot of the signed-in session; the returned check fails once the account or cookie revision changes.
function captureAuthContext() {
	const binding = window.QLPKApiTransport.session;
	if (binding) {
		const snapshot = binding.owner.snapshot();
		return () => window.QLPKApiTransport.session === binding
			&& snapshot.status === 'authenticated'
			&& binding.owner.snapshot().status === 'authenticated'
			&& binding.owner.snapshot().revision === snapshot.revision;
	}
	const credential = window.QLPKApiTransport.getAuthHeader();
	return () => !window.QLPKApiTransport.session && Boolean(credential)
		&& window.QLPKApiTransport.getAuthHeader() === credential;
}

// Frontend role -> database role (lễ tân = staff)
function mapRoleToDatabase(role) {
	const roleMap = { doctor: 'doctor', psychologist: 'PSYCHOLOGIST', receptionist: 'staff' };
	return roleMap[role.toLowerCase()] || role;
}

const byId = id => document.getElementById(id);
const modalNode = () => byId('transferModal');
const roleButtons = () => [...document.querySelectorAll('.transfer-role-btn')];
const roleWrappers = () => roleButtons().map(button => button.closest('.transfer-role-option, .col-4, .col-6') || button);
const bootstrapModal = () => window.bootstrap.Modal.getOrCreateInstance(modalNode());

function isCurrentSession(token) {
	return token === sessionToken && authContext?.()
		&& (!transferOptions.isCurrent || transferOptions.isCurrent());
}

function setConfirmDisabled(disabled) {
	const confirm = byId('confirmTransferBtn');
	if (confirm) confirm.disabled = disabled;
}

function setTransferring(busy) {
	transferring = busy;
	const modal = modalNode();
	if (!modal) return;
	modal.setAttribute('aria-busy', String(busy));
	modal.querySelectorAll('button').forEach(button => { button.disabled = busy; });
	setConfirmDisabled(busy || !currentTransferData.toPersonId);
	const label = modal.querySelector('#confirmTransferBtn span');
	if (label) label.textContent = busy ? 'Đang chuyển...' : 'Chuyển khám';
}

function setActive(nodes, active, className) {
	nodes.forEach(node => {
		node.classList.toggle(className, node === active);
		node.setAttribute('aria-pressed', String(node === active));
	});
}

function showRoleButtons() {
	[...roleWrappers(), ...roleButtons()].forEach(node => { node.hidden = false; });
	roleButtons().forEach(button => button.setAttribute('aria-pressed', 'false'));
}

function renderPersonState(className, iconName, text) {
	const node = el('div', { class: className }, el('i', { class: `bi ${iconName}`, 'aria-hidden': 'true' }), el('span', {}, text));
	replace(byId('personSelector'), node);
}

/**
 * Mở modal chuyển khám
 * @param {Array|Number} appointmentIds - Mảng ID hoặc một ID đơn
 * @param {String} fromRole - 'receptionist', 'doctor', 'psychologist'
 * @param {Function} onSuccess - Callback khi chuyển thành công (để reload danh sách)
 */
function openTransferModal(appointmentIds, fromRole, onSuccess, options = {}) {
	if (transferring) return;
	authContext = captureAuthContext();
	if (!authContext()) {
		QLPKUserFeedback.show('error', 'Phiên đăng nhập chưa sẵn sàng. Vui lòng tải lại trang.');
		return;
	}
	if (!modalNode()) {
		QLPKUserFeedback.show('error', 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
		return;
	}
	sessionToken += 1;
	transferOptions = options;
	openTransferModalInternal(appointmentIds, fromRole, onSuccess);
}

function openTransferModalInternal(appointmentIds, fromRole, onSuccess) {
	const token = sessionToken;
	const ids = Array.isArray(appointmentIds) ? appointmentIds : [appointmentIds];
	reloadCallback = onSuccess || null;
	currentTransferData = { ...emptyTransferData(), appointmentIds: ids, fromRole: fromRole || 'receptionist' };
	setTransferring(false);

	// Reset modal UI (mọi nhóm đều hiển thị, kể cả nhóm hiện tại)
	setActive(roleButtons(), null, 'active');
	showRoleButtons();
	renderPersonState('transfer-empty-state', 'bi-arrow-up-circle', 'Chọn nhóm tiếp nhận trước');
	setConfirmDisabled(true);
	bindTransferModalEvents();

	// Sau khi modal hiển thị: chọn sẵn nhóm và người phụ trách theo lịch khám
	modalNode().addEventListener('shown.bs.modal', () => preselectRecipient(ids[0], token), { once: true });
	bootstrapModal().show();
}

// Psychologist (own field or a PSYCHOLOGIST stored as doctor) wins over doctor
function recipientFromAppointment(appointment) {
	if (appointment.psychologist_id) return { role: 'psychologist', personId: appointment.psychologist_id };
	if (appointment.doctor_id) {
		return { role: appointment.doctor?.role === 'PSYCHOLOGIST' ? 'psychologist' : 'doctor', personId: appointment.doctor_id };
	}
	return null;
}

async function preselectRecipient(firstAppointmentId, token) {
	if (!firstAppointmentId) {
		selectFirstVisibleRole();
		return;
	}
	let appointment;
	try {
		appointment = await requestJson(`/api/appointments/${firstAppointmentId}`);
	} catch (error) {
		if (!isCurrentSession(token) || currentTransferData.toRole) return;
		console.error('Lỗi khi fetch appointment data:', error);
		selectFirstVisibleRole();
		return;
	}
	if (!isCurrentSession(token) || currentTransferData.toRole) return;
	const target = recipientFromAppointment(appointment);
	const roleButton = target && document.querySelector(`.transfer-role-btn[data-role="${target.role}"]`);
	if (!target || !roleButton) {
		if (target) console.error('Không tìm thấy role button cho role:', target.role);
		selectFirstVisibleRole();
		return;
	}
	setActive(roleButtons(), roleButton, 'active');
	currentTransferData.toRole = target.role;
	await loadPersonList(target.role);
	const personBadge = document.querySelector(`.person-badge[data-person-id="${target.personId}"]`);
	if (personBadge) personBadge.click();
	else console.warn('Không tìm thấy person badge với ID:', target.personId);
}

// Chọn nhóm tiếp nhận đầu tiên khi chưa xác định được người nhận từ lịch khám
function selectFirstVisibleRole() {
	const isShown = node => node.getClientRects().length > 0;
	const firstVisible = roleButtons().find(button => isShown(button.closest('.transfer-role-option, .col-4, .col-6') || button));
	if (!firstVisible) return;
	setActive(roleButtons(), firstVisible, 'active');
	currentTransferData.toRole = firstVisible.dataset.role;
	currentTransferData.toPersonId = null;
	currentTransferData.toPersonName = null;
	loadPersonList(firstVisible.dataset.role);
	setConfirmDisabled(true);
}

function personBadge(user) {
	const name = user.full_name || 'Chưa có tên';
	return el('button', { type: 'button', class: 'person-badge', 'aria-pressed': 'false', 'data-person-id': user.id, 'data-person-name': name, title: name },
		el('i', { class: 'bi bi-person-fill', 'aria-hidden': 'true' }), ' ', el('span', { class: 'person-badge__name' }, name));
}

/**
 * Load danh sách người theo role; resolves once the list (or its empty/error state) is shown.
 * A newer load or a closed modal makes an older response a no-op.
 */
async function loadPersonList(role, callback) {
	const token = sessionToken;
	if (!isCurrentSession(token)) return;
	const requestToken = ++personRequestToken;
	const isCurrent = () => isCurrentSession(token) && requestToken === personRequestToken;
	replace(byId('personSelector'), el('div', { class: 'transfer-loading-state' },
		el('span', { class: 'spinner-border spinner-border-sm', role: 'status', 'aria-hidden': 'true' }), ' ', el('span', {}, 'Đang tải danh sách người nhận...')));
	try {
		const response = await requestJson(`/users/transfer-recipients?${new URLSearchParams({ role: mapRoleToDatabase(role).toLowerCase() })}`);
		if (!isCurrent()) return;
		if (response && response.length > 0) replace(byId('personSelector'), response.map(personBadge));
		else renderPersonState('transfer-empty-state', 'bi-person-x', 'Không có người nhận trong nhóm này');
	} catch (error) {
		if (!isCurrent()) return;
		console.error('API error for role', role, ':', error?.data);
		renderPersonState('transfer-error-state', 'bi-exclamation-triangle', 'Lỗi khi tải danh sách, vui lòng thử lại');
	}
	if (typeof callback === 'function') callback();
}

function finishTransfer(onSuccess) {
	setTransferring(false);
	bootstrapModal().hide();
	QLPKUserFeedback.show('success', 'Đã chuyển khám.');
	const examinationModal = byId('addExaminationModal');
	if (examinationModal) window.bootstrap.Modal.getInstance(examinationModal)?.hide();
	if (typeof onSuccess === 'function') onSuccess();
}

/**
 * Chuyển appointments sang người nhận (sau beforeTransfer, nếu có; false = không chuyển).
 */
async function transferAppointments(appointmentIds, toRole, toPersonId) {
	const token = sessionToken;
	if (transferring || !isCurrentSession(token)) return;
	const onSuccess = reloadCallback;
	const beforeTransfer = transferOptions.beforeTransfer;
	setTransferring(true);
	try {
		if (beforeTransfer && await beforeTransfer() !== true) return;
		if (!isCurrentSession(token)) return;
		const result = await requestJson('/api/appointments/transfer', { method: 'POST', json: {
			appointment_ids: appointmentIds,
			to_role: mapRoleToDatabase(toRole),
			to_person_id: toPersonId
		} });
		if (!isCurrentSession(token)) return;
		if (result?.success !== true || !Number.isInteger(result.updated_count)) throw new Error('transfer_unconfirmed');
		if (result.updated_count !== new Set(appointmentIds.map(Number)).size) {
			QLPKUserFeedback.show('warning', 'Máy chủ chưa xác nhận chuyển đủ các lượt đã chọn. Vui lòng kiểm tra lại danh sách trước khi thử tiếp.');
			return;
		}
		finishTransfer(onSuccess);
	} catch (error) {
		if (!isCurrentSession(token)) return;
		console.error('Transfer failed:', error);
		QLPKUserFeedback.show('error', 'Không thể chuyển khám. Vui lòng kiểm tra lại.');
	} finally {
		if (token === sessionToken) setTransferring(false);
	}
}

function onRoleClick(event, button) {
	event.preventDefault();
	event.stopPropagation();
	if (transferring || !isCurrentSession(sessionToken)) return;
	setActive(roleButtons(), button, 'active');
	currentTransferData.toRole = button.dataset.role;
	currentTransferData.toPersonId = null;
	currentTransferData.toPersonName = null;
	loadPersonList(button.dataset.role);
	setConfirmDisabled(true);
}

function onPersonClick(button) {
	if (transferring || !isCurrentSession(sessionToken)) return;
	setActive([...document.querySelectorAll('.person-badge')], button, 'selected');
	currentTransferData.toPersonId = Number(button.dataset.personId) || button.dataset.personId;
	currentTransferData.toPersonName = button.dataset.personName;
	setConfirmDisabled(false);
}

function onConfirmClick(event) {
	event.preventDefault();
	event.stopPropagation();
	if (!currentTransferData.toRole) {
		QLPKUserFeedback.show('error', 'Vui lòng chọn role chuyển đến');
		return;
	}
	// Yêu cầu chọn người nhận cho tất cả các role (kể cả lễ tân)
	if (!currentTransferData.toPersonId) {
		QLPKUserFeedback.show('error', 'Vui lòng chọn người nhận');
		return;
	}
	transferAppointments(currentTransferData.appointmentIds, currentTransferData.toRole, currentTransferData.toPersonId);
}

function resetAfterClose() {
	sessionToken += 1;
	personRequestToken += 1;
	transferOptions = {};
	currentTransferData = emptyTransferData();
	reloadCallback = null;
	showRoleButtons();
}

// Listeners are attached once per modal element
function bindTransferModalEvents() {
	const modal = modalNode();
	if (!modal || modal.dataset.transferBound) return;
	modal.dataset.transferBound = 'true';
	modal.addEventListener('click', event => {
		const target = event.target instanceof Element ? event.target : null;
		const role = target?.closest('.transfer-role-btn');
		if (role) return onRoleClick(event, role);
		const person = target?.closest('.person-badge');
		if (person) return onPersonClick(person);
		if (target?.closest('#confirmTransferBtn')) onConfirmClick(event);
	});
	modal.addEventListener('hide.bs.modal', event => { if (transferring) event.preventDefault(); });
	modal.addEventListener('hidden.bs.modal', resetAfterClose);
}

// Kept for callers written against the classic module (always available once this module loaded)
function openWithErrorHandling(appointmentIds, fromRole, onSuccess) {
	openTransferModal(appointmentIds, fromRole, onSuccess);
	return true;
}

document.addEventListener('DOMContentLoaded', bindTransferModalEvents);

const TransferModal = {
	open: openTransferModal,
	loadPersonList,
	transfer: transferAppointments,
	openWithErrorHandling
};

// Classic page scripts (receptionist/psychologist workspaces) reach the modal through window.TransferModal.
window.TransferModal = TransferModal;

export { TransferModal, captureAuthContext, mapRoleToDatabase };
