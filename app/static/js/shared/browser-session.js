(function (window) {
	'use strict';

	function validIdentity(user) {
		return user && Number.isSafeInteger(user.id) && user.id > 0
			&& typeof user.username === 'string' && typeof user.role === 'string'
			&& Array.isArray(user.permissions) && user.permissions.every(value => typeof value === 'string');
	}

	function validSession(payload) {
		return payload && payload.token_type === 'cookie'
			&& typeof payload.session_id === 'string' && /^[a-f0-9]{32}$/.test(payload.session_id)
			&& typeof payload.csrf_token === 'string' && /^[a-f0-9]{64}$/.test(payload.csrf_token)
			&& validIdentity(payload.user);
	}

	function create(options = {}) {
		const send = options.fetch || window.fetch.bind(window);
		const origin = options.origin || window.location.origin;
		const baseURI = options.baseURI || window.document.baseURI;
		const listeners = new Set();
		const channel = options.channel || null;
		let revision = 0;
		let session = null;
		let status = 'unknown';
		let pending = null;
		let disposed = false;

		function failure(code, message) {
			const error = new Error(message);
			error.code = code;
			return error;
		}

		function snapshot() {
			return Object.freeze({ revision, status, session });
		}

		function publish() {
			const value = snapshot();
			listeners.forEach(listener => {
				try { listener(value); } catch (error) { window.console.error('Session listener failed', error); }
			});
		}

		function assertCurrent(expected) {
			if (disposed || expected !== revision) {
				throw failure('session.changed', 'Phiên đã thay đổi; không dùng kết quả yêu cầu cũ.');
			}
		}

		function invalidate(reason = 'changed', broadcast = false) {
			if (disposed) return;
			revision += 1;
			session = null;
			status = reason;
			pending = null;
			publish();
			if (broadcast && channel) channel.postMessage({ type: 'session.changed' });
		}

		function replace(payload, expected, broadcast = false) {
			assertCurrent(expected);
			if (!validSession(payload)) {
				throw failure('session.invalid_response', 'Máy chủ trả thông tin phiên không hợp lệ.');
			}
			const user = { id: payload.user.id, username: payload.user.username, role: payload.user.role,
				full_name: typeof payload.user.full_name === 'string' ? payload.user.full_name : '',
				email: typeof payload.user.email === 'string' ? payload.user.email : '',
				permissions: Object.freeze([...new Set(payload.user.permissions)]),
			};
			session = Object.freeze({ id: payload.session_id, csrf: payload.csrf_token, user: Object.freeze(user) });
			revision += 1;
			status = 'authenticated';
			pending = null;
			publish();
			if (broadcast && channel) channel.postMessage({ type: 'session.changed' });
			return snapshot();
		}

		function bootstrap() {
			if (disposed) return Promise.reject(failure('session.disposed', 'Bộ quản lý phiên đã đóng.'));
			if (pending) return pending;
			const expected = revision;
			status = 'loading';
			publish();
			const operation = (async () => {
				try {
					const response = await Promise.resolve().then(() => send(new URL('/auth/session', origin).href, {
						credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
					}));
					assertCurrent(expected);
					if (response.status === 401) {
						invalidate('anonymous');
						return snapshot();
					}
					if (!response.ok) throw failure('session.unavailable', 'Chưa thể xác minh phiên đăng nhập.');
					const payload = await response.json();
					return replace(payload, expected);
				} catch (error) {
					if (!disposed && expected === revision) {
						status = 'unavailable';
						publish();
					}
					throw error;
				} finally {
					if (pending === operation) pending = null;
				}
			})();
			pending = operation;
			return operation;
		}

		async function ready() {
			if (status === 'unknown' || status === 'loading') await bootstrap();
			if (disposed || status !== 'authenticated' || !session) {
				throw failure('session.required', 'Cần xác minh lại phiên trước khi tiếp tục.');
			}
			return snapshot();
		}

		async function request(input, init = {}) {
			const target = new URL(typeof input === 'string' ? input : input.url || String(input), baseURI);
			if (!['http:', 'https:'].includes(target.protocol) || target.origin !== origin || target.username || target.password) {
				throw failure('session.external_request', 'Không gửi yêu cầu phiên tới địa chỉ ngoài hệ thống.');
			}
			const current = await ready();
			assertCurrent(current.revision);
			const headers = new Headers(init.headers !== undefined ? init.headers : input && input.headers);
			if (headers.has('Authorization')) throw failure('session.legacy_auth', 'Yêu cầu phiên cookie không dùng Bearer.');
			headers.set('X-QLPK-Session-Id', current.session.id);
			const method = String(init.method || input.method || 'GET').toUpperCase();
			if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', current.session.csrf);
			const response = await send(input, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
			assertCurrent(current.revision);
			if (response.status === 401) invalidate('expired');
			return { response, revision: current.revision };
		}

		async function requestJSON(input, init) {
			const result = await request(input, init);
			if (!result.response.ok) throw failure('session.http_error', `Yêu cầu thất bại (${result.response.status}).`);
			const data = await result.response.json();
			assertCurrent(result.revision);
			return data;
		}

		function onChannelMessage(event) {
			if (event.data && event.data.type === 'session.changed') invalidate('changed');
		}

		if (channel) channel.addEventListener('message', onChannelMessage);
		return Object.freeze({
			bootstrap, ready, request, requestJSON, snapshot, replace, invalidate,
			subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
			dispose() {
				invalidate('disposed');
				disposed = true;
				listeners.clear();
				if (channel) channel.removeEventListener('message', onChannelMessage);
			},
		});
	}

	window.QLPKBrowserSession = Object.freeze({ create });
})(window);
