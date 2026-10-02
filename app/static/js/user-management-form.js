// Account modal of the user management page: add/edit prefill, payload, avatar and licence uploads,
// calendar colour swatches. The page module owns the list and passes the shared state in.
import { byId } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';

const DEFAULT_AVATAR = '/static/assets/images_doctor.jpg';
const toast = (type, message) => QLPKUserFeedback?.show(type, message);
const field = name => byId('userForm').querySelector(`[name='${name}']`);
// Mirrors jQuery show()/hide(): the stylesheet hides the licence link by default, so showing sets its inline display.
const setShown = (node, shown, display = '') => { node.style.display = shown ? display : 'none'; };

function normalizeGender(gender) {
	if (!gender) return '';
	const value = String(gender).toLowerCase();
	if (['nam', 'male', 'm'].includes(value)) return 'male';
	if (['nữ', 'nu', 'female', 'f'].includes(value)) return 'female';
	return 'other';
}

function selectColor(state, color) {
	document.querySelectorAll('.color-swatch').forEach(swatch => swatch.classList.toggle('selected', Boolean(color) && swatch.dataset.color === color));
	byId('calendarColorPicker').value = color || '';
	state.colorCleared = !color;
}

function showLicenseFile(url, name) {
	const link = byId('licenseCertificateFileName');
	link.textContent = name;
	link.setAttribute('href', url);
	setShown(link, true, 'inline');
}

function setPasswordMode(editing) {
	const password = field('password');
	password.value = editing ? '********' : '';
	password.required = !editing;
	password.setAttribute('placeholder', editing ? 'Nhập mật khẩu mới nếu muốn đổi' : 'Nhập mật khẩu');
	setShown(byId('passwordRequired'), !editing);
}

function formError(message) {
	const box = byId('userFormError');
	box.classList.toggle('d-none', !message);
	box.textContent = message;
}

export function openAddUser(state) {
	Object.assign(state, { editingUserId: null, currentAvatarUrl: '', currentLicenseCertificateUrl: '', currentLicenseCertificateFileName: '' });
	byId('userModalLabel').textContent = 'THÊM TÀI KHOẢN';
	byId('userForm').reset();
	byId('isActiveSwitch').checked = true;
	byId('canViewAllPatientsSwitch').checked = false;
	formError('');
	setShown(byId('licenseCertificateFileName'), false);
	byId('avatarPreview').setAttribute('src', DEFAULT_AVATAR);
	field('username').readOnly = false;
	setPasswordMode(false);
	selectColor(state, '#2196f3');
}

function prefill(state, user) {
	['full_name', 'address', 'phone', 'email'].forEach(name => { field(name).value = user[name] ?? ''; });
	field('role').value = user.role;
	field('gender').value = normalizeGender(user.gender);
	field('username').value = user.username ?? '';
	field('username').readOnly = true;
	field('license_number').value = user.license_number || '';
	field('license_issue_date').value = user.license_issue_date ? user.license_issue_date.split('T')[0] : '';
	state.currentLicenseCertificateUrl = user.license_certificate_file || '';
	state.currentLicenseCertificateFileName = user.license_certificate_original_filename || '';
	if (state.currentLicenseCertificateUrl) {
		showLicenseFile(state.currentLicenseCertificateUrl, state.currentLicenseCertificateFileName || state.currentLicenseCertificateUrl.split('/').pop() || 'File chứng nhận');
	} else {
		setShown(byId('licenseCertificateFileName'), false);
	}
	state.currentAvatarUrl = user.avatar || '';
	byId('avatarPreview')?.setAttribute('src', state.currentAvatarUrl || DEFAULT_AVATAR);
	setPasswordMode(true);
	byId('isActiveSwitch').checked = Boolean(user.is_active);
	byId('canViewAllPatientsSwitch').checked = user.can_view_all_patients || false;
	selectColor(state, user.calendar_color || '');
}

export async function openEditUser(state, id) {
	state.editingUserId = id;
	byId('userModalLabel').textContent = 'CẬP NHẬT TÀI KHOẢN';
	byId('userForm').reset();
	formError('');
	try {
		prefill(state, await requestJson(`/users/${id}`));
		window.bootstrap.Modal.getOrCreateInstance(byId('userModal')).show();
	} catch {
		toast('error', 'Không thể tải dữ liệu tài khoản. Vui lòng thử lại.');
	}
}

function payload(state) {
	const data = { full_name: field('full_name').value, role: field('role').value, gender: field('gender').value, address: field('address').value,
		phone: field('phone').value, username: field('username').value, email: field('email').value,
		is_active: field('is_active').checked, can_view_all_patients: field('can_view_all_patients').checked,
		calendar_color: state.colorCleared ? null : byId('calendarColorPicker').value };
	if (field('license_number').value) data.license_number = field('license_number').value;
	if (field('license_issue_date').value) data.license_issue_date = field('license_issue_date').value;
	if (state.currentAvatarUrl) data.avatar = state.currentAvatarUrl;
	const password = field('password').value;
	if (password && password.trim() !== '' && !/^\*+$/.test(password)) data.password = password;
	return data;
}

export async function saveUser(state, reload) {
	const data = payload(state);
	const editing = state.editingUserId;
	formError('');
	try {
		await requestJson(editing ? `/users/${editing}` : '/users/', { method: editing ? 'PUT' : 'POST', json: data });
		window.bootstrap.Modal.getInstance(byId('userModal')).hide();
		reload();
	} catch {
		formError(editing ? 'Không thể cập nhật tài khoản. Vui lòng kiểm tra lại.' : 'Không thể tạo tài khoản. Vui lòng kiểm tra lại.');
	}
}

async function upload(url, file) {
	const formData = new FormData();
	formData.append('file', file);
	return requestJson(url, { method: 'POST', body: formData });
}

export async function uploadAvatar(state, input) {
	const file = input.files && input.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = event => byId('avatarPreview').setAttribute('src', event.target.result);
	reader.readAsDataURL(file);
	if (!state.editingUserId) {
		toast('warning', 'Hãy lưu tài khoản trước khi upload avatar');
		return;
	}
	try {
		state.currentAvatarUrl = (await upload(`/users/${state.editingUserId}/avatar`, file)).avatar;
		toast('success', 'Tải avatar thành công');
	} catch {
		toast('error', 'Không thể tải ảnh đại diện lên. Vui lòng thử lại.');
	}
}

export async function uploadLicense(state, input) {
	const file = input.files && input.files[0];
	if (!file) return;
	if (!['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'].includes(file.name.split('.').pop().toLowerCase())) {
		toast('error', 'Định dạng không hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX');
		input.value = '';
		return;
	}
	if (!state.editingUserId) {
		toast('warning', 'Hãy lưu tài khoản trước khi upload file chứng nhận');
		input.value = '';
		return;
	}
	try {
		const res = await upload(`/users/${state.editingUserId}/license-certificate`, file);
		state.currentLicenseCertificateUrl = res.license_certificate_file;
		state.currentLicenseCertificateFileName = res.license_certificate_original_filename || file.name;
		showLicenseFile(state.currentLicenseCertificateUrl, state.currentLicenseCertificateFileName);
		toast('success', 'Tải file chứng nhận thành công');
	} catch {
		toast('error', 'Không thể tải chứng nhận lên. Vui lòng thử lại.');
		input.value = '';
	}
}

export function bindColorSwatches(state) {
	byId('clearCalendarColor').addEventListener('click', () => selectColor(state, ''));
	document.addEventListener('click', event => {
		const swatch = event.target instanceof Element ? event.target.closest('.color-swatch') : null;
		if (swatch) selectColor(state, swatch.dataset.color);
	});
}
