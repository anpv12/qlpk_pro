// Login page: cookie session through the shared session owner (QLPKApiTransport.session), with the
// legacy bearer-token flow kept for transports without a session owner. Mounts on import.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import { requestJson } from './shared/http-json.js';

function normalizeRole(role) {
	return String(role || '').replace(/^UserRole\./, '').trim().toLowerCase();
}

export function loginLandingPath(user) {
	const role = normalizeRole(user && user.role);
	const permissions = user && Array.isArray(user.permissions) ? user.permissions : [];
	const landingByRole = {
		doctor: { permission: 'qlkham-bs', href: '/doctor-examination.html' },
		psychologist: { permission: 'qlkham-tamly', href: '/psychologist-examination.html' },
		staff: { permission: 'qlkham-letan', href: '/receptionist-new.html' },
	};
	const landing = landingByRole[role];
	return landing && (permissions.includes('*') || permissions.includes(landing.permission)) ? landing.href : '/';
}

export function loginErrorMessage(error) {
	let message = error.status === 401 ? 'Tên đăng nhập hoặc mật khẩu không đúng.' : 'Không thể đăng nhập. Vui lòng thử lại.';
	if (error.status === 429) {
		const seconds = Number(error.retryAfter ?? error.headers?.get?.('Retry-After'));
		message = Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 3600
			? `Đăng nhập quá nhiều lần. Vui lòng thử lại sau ${seconds} giây.`
			: 'Đăng nhập quá nhiều lần. Vui lòng chờ một chút rồi thử lại.';
	}
	if (error.code === 'session.lock_unavailable') message = 'Trình duyệt chưa hỗ trợ đăng nhập an toàn. Vui lòng dùng trình duyệt mới qua HTTPS hoặc localhost.';
	if (error.code === 'session.changed') message = 'Phiên đã thay đổi ở cửa sổ khác. Vui lòng đăng nhập lại.';
	return message;
}

function createView(form) {
	const submit = form.querySelector('button[type="submit"]');
	const errorBox = document.getElementById('loginError');
	return {
		submit,
		field: name => form.querySelector(`[name="${name}"]`).value,
		setPending(pending) {
			submit.disabled = pending;
			submit.setAttribute('aria-busy', String(pending));
			submit.querySelector('.login-submit-label').textContent = pending ? 'Đang đăng nhập...' : 'Đăng nhập';
			const icon = submit.querySelector('.login-icon');
			icon.classList.toggle('bi-arrow-repeat', pending);
			icon.classList.toggle('bi-arrow-right', !pending);
		},
		setError(message) {
			errorBox.hidden = !message;
			errorBox.textContent = message;
		},
	};
}

function completeLogin(user) {
	const nextUser = user || {};
	localStorage.setItem('qlpk_user', JSON.stringify(nextUser));
	if (Array.isArray(nextUser.permissions)) localStorage.setItem('qlpk_permissions', JSON.stringify(nextUser.permissions));
	window.location.href = loginLandingPath(nextUser);
}

async function loginWithCookie(session, username, password) {
	const result = await session.actions.login(username, password);
	const current = session.owner.snapshot();
	if (current.status !== 'authenticated' || current.revision !== result.revision) {
		throw Object.assign(new Error('Session changed'), { code: 'session.changed' });
	}
	for (const key of ['qlpk_token', 'token', 'qlpk_user', 'qlpk_permissions']) localStorage.removeItem(key);
	for (const key of ['qlpk_token', 'token']) window.sessionStorage?.removeItem(key);
	window.location.href = loginLandingPath(current.session.user);
}

async function loginWithToken(username, password) {
	const res = await requestJson('/auth/login', { method: 'POST', json: { username, password } });
	for (const key of ['qlpk_token', 'token']) window.sessionStorage?.removeItem(key);
	localStorage.setItem('qlpk_token', res.access_token);
	localStorage.setItem('qlpk_permissions', JSON.stringify(res.user.permissions || []));
	localStorage.setItem('qlpk_user', JSON.stringify(res.user || {}));
	let user;
	try {
		user = await requestJson('/check/me', { headers: { Authorization: 'Bearer ' + res.access_token } });
	} catch {
		user = res.user;
	}
	completeLogin(user);
}

function bindPasswordToggle() {
	const toggle = document.getElementById('togglePassword');
	toggle.addEventListener('click', () => {
		const input = document.getElementById('passwordInput');
		const icon = toggle.querySelector('i');
		const reveal = input.getAttribute('type') === 'password';
		input.setAttribute('type', reveal ? 'text' : 'password');
		icon.classList.toggle('bi-eye', reveal);
		icon.classList.toggle('bi-eye-slash', !reveal);
		toggle.setAttribute('aria-pressed', String(reveal));
	});
}

export function mountLoginPage() {
	const form = document.getElementById('loginForm');
	if (!form) return;
	const view = createView(form);
	bindPasswordToggle();
	form.addEventListener('submit', async event => {
		event.preventDefault();
		if (view.submit.disabled) return;
		const username = view.field('username');
		const password = view.field('password');
		view.setError('');
		view.setPending(true);
		const session = window.QLPKApiTransport?.session;
		try {
			await (session ? loginWithCookie(session, username, password) : loginWithToken(username, password));
		} catch (error) {
			view.setError(loginErrorMessage(error));
			view.setPending(false);
		}
	});
}

mountLoginPage();
