(function (window) {
	'use strict';

	function create(options) {
		const owner = options.owner;
		const send = options.fetch || window.fetch.bind(window);
		const locks = options.locks || window.navigator.locks;
		const origin = options.origin || window.location.origin;
		let pending = false;

		function failure(code, message) {
			const error = new Error(message);
			error.code = code;
			return error;
		}

		async function exclusive(action) {
			if (pending) throw failure('session.busy', 'Một thao tác phiên đang được xử lý.');
			if (!locks || typeof locks.request !== 'function') {
				throw failure('session.lock_unavailable', 'Trình duyệt chưa hỗ trợ khóa phiên an toàn giữa các tab.');
			}
			pending = true;
			try {
				return await locks.request('qlpk:browser-session-mutation', { mode: 'exclusive' }, action);
			} finally {
				pending = false;
			}
		}

		async function sameSession(expected, allowAnonymous = false) {
			if (!expected.session || expected.status !== 'authenticated') {
				throw failure('session.required', 'Cần đăng nhập trước khi thao tác.');
			}
			const current = await owner.bootstrap();
			if (allowAnonymous && current.status === 'anonymous') return current;
			if (!current.session || current.session.id !== expected.session.id) {
				owner.invalidate('changed');
				throw failure('session.changed', 'Phiên đã thay đổi trong lúc chờ; thao tác chưa được gửi.');
			}
			return current;
		}

		async function parseResponse(response) {
			const payload = await response.json();
			if (!response.ok) {
				const error = failure(payload.code || 'session.http_error', payload.detail || 'Không thể hoàn tất thao tác phiên.');
				error.status = response.status;
				if (response.status === 429) {
					const seconds = Number(response.headers.get('Retry-After'));
					if (Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 3600) error.retryAfter = seconds;
				}
				throw error;
			}
			return payload;
		}

		function login(username, password) {
			if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
				return Promise.reject(failure('session.invalid_input', 'Vui lòng nhập tài khoản và mật khẩu.'));
			}
			return exclusive(async () => {
				owner.invalidate('auth-changing');
				const expected = owner.snapshot().revision;
				try {
					const response = await send(new URL('/auth/login', origin).href, {
						method: 'POST', credentials: 'same-origin', cache: 'no-store',
						headers: { 'Content-Type': 'application/json', 'X-QLPK-Session': 'cookie' },
						body: JSON.stringify({ username, password }),
					});
					return owner.replace(await parseResponse(response), expected, true);
				} catch (error) {
					owner.invalidate('unavailable', true);
					throw error;
				}
			});
		}

		function changePassword(currentPassword, newPassword) {
			if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
				return Promise.reject(failure('session.invalid_input', 'Mật khẩu hiện tại và mật khẩu mới chưa hợp lệ.'));
			}
			const expected = owner.snapshot();
			return exclusive(async () => {
				const current = await sameSession(expected);
				try {
					const result = await owner.request('/users/me/password', {
						method: 'PUT', headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
					});
					return owner.replace(await parseResponse(result.response), current.revision, true);
				} catch (error) {
					if (!error.status || error.status >= 500) owner.invalidate('unavailable', true);
					throw error;
				}
			});
		}

		function logout(onConfirmed) {
			const expected = owner.snapshot();
			return exclusive(async () => {
				const current = await sameSession(expected, true);
				if (current.status !== 'anonymous') {
					const result = await owner.request('/auth/logout', { method: 'POST' });
					const payload = await parseResponse(result.response);
					if (payload.success !== true) throw failure('session.invalid_response', 'Máy chủ chưa xác nhận đăng xuất.');
					if (owner.snapshot().revision !== result.revision) {
						throw failure('session.changed', 'Phiên đã thay đổi; không dọn dữ liệu của phiên mới.');
					}
				}
				owner.invalidate('anonymous', true);
				const confirmation = Object.freeze({ confirmed: true, previousSessionId: expected.session.id, userId: expected.session.user.id });
				if (typeof onConfirmed === 'function') await onConfirmed(confirmation);
				return confirmation;
			});
		}

		return Object.freeze({ login, changePassword, logout, isPending: () => pending });
	}

	window.QLPKBrowserSessionActions = Object.freeze({ create });
})(window);
