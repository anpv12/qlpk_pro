function installSessionActionFns1(ctx) {
	function failure(code, message) {
		const error = new Error(message);
		error.code = code;
		return error;
	}

	async function exclusive(action) {
		if (ctx.pending) throw failure('session.busy', 'Một thao tác phiên đang được xử lý.');
		if (!ctx.locks || typeof ctx.locks.request !== 'function') {
			throw failure('session.lock_unavailable', 'Trình duyệt chưa hỗ trợ khóa phiên an toàn giữa các tab.');
		}
		ctx.pending = true;
		try {
			return await ctx.locks.request('qlpk:browser-session-mutation', { mode: 'exclusive' }, action);
		} finally {
			ctx.pending = false;
		}
	}

	async function sameSession(expected, allowAnonymous = false) {
		if (!expected.session || expected.status !== 'authenticated') {
			throw failure('session.required', 'Cần đăng nhập trước khi thao tác.');
		}
		const current = await ctx.owner.bootstrap();
		if (allowAnonymous && current.status === 'anonymous') return current;
		if (!current.session || current.session.id !== expected.session.id) {
			ctx.owner.invalidate('changed');
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
			ctx.owner.invalidate('auth-changing');
			const expected = ctx.owner.snapshot().revision;
			try {
				const response = await ctx.send(new URL('/auth/login', ctx.origin).href, {
					method: 'POST', credentials: 'same-origin', cache: 'no-store',
					headers: { 'Content-Type': 'application/json', 'X-QLPK-Session': 'cookie' },
					body: JSON.stringify({ username, password }),
				});
				return ctx.owner.replace(await parseResponse(response), expected, true);
			} catch (error) {
				ctx.owner.invalidate('unavailable', true);
				throw error;
			}
		});
	}

	Object.assign(ctx, { failure, exclusive, sameSession, parseResponse, login });
}

function installSessionActionFns2(ctx) {
	function changePassword(currentPassword, newPassword) {
		if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
			return Promise.reject(ctx.failure('session.invalid_input', 'Mật khẩu hiện tại và mật khẩu mới chưa hợp lệ.'));
		}
		const expected = ctx.owner.snapshot();
		return ctx.exclusive(async () => {
			const current = await ctx.sameSession(expected);
			try {
				const result = await ctx.owner.request('/users/me/password', {
					method: 'PUT', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
				});
				return ctx.owner.replace(await ctx.parseResponse(result.response), current.revision, true);
			} catch (error) {
				if (!error.status || error.status >= 500) ctx.owner.invalidate('unavailable', true);
				throw error;
			}
		});
	}

	function logout(onConfirmed) {
		const expected = ctx.owner.snapshot();
		return ctx.exclusive(async () => {
			const current = await ctx.sameSession(expected, true);
			if (current.status !== 'anonymous') {
				const result = await ctx.owner.request('/auth/logout', { method: 'POST' });
				const payload = await ctx.parseResponse(result.response);
				if (payload.success !== true) throw ctx.failure('session.invalid_response', 'Máy chủ chưa xác nhận đăng xuất.');
				if (ctx.owner.snapshot().revision !== result.revision) {
					throw ctx.failure('session.changed', 'Phiên đã thay đổi; không dọn dữ liệu của phiên mới.');
				}
			}
			ctx.owner.invalidate('anonymous', true);
			const confirmation = Object.freeze({ confirmed: true, previousSessionId: expected.session.id, userId: expected.session.user.id });
			if (typeof onConfirmed === 'function') await onConfirmed(confirmation);
			return confirmation;
		});
	}

	Object.assign(ctx, { changePassword, logout });
}

function create(options) {
	const ctx = {};
	installSessionActionFns1(ctx);
	installSessionActionFns2(ctx);

	ctx.owner = options.owner;
	ctx.send = options.fetch || window.fetch.bind(window);
	ctx.locks = options.locks || window.navigator.locks;
	ctx.origin = options.origin || window.location.origin;
	ctx.pending = false;

	return Object.freeze({ login: ctx.login, changePassword: ctx.changePassword, logout: ctx.logout, isPending: () => ctx.pending });
}

export const QLPKBrowserSessionActions = Object.freeze({ create });
