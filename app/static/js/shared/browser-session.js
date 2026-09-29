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

	function installSessionFns1(ctx) {
		function failure(code, message) {
			const error = new Error(message);
			error.code = code;
			return error;
		}

		function snapshot() {
			return Object.freeze({ revision: ctx.revision, status: ctx.status, session: ctx.session });
		}

		function publish() {
			const value = snapshot();
			ctx.listeners.forEach(listener => {
				try { listener(value); } catch (error) { window.console.error('Session listener failed', error); }
			});
		}

		function assertCurrent(expected) {
			if (ctx.disposed || expected !== ctx.revision) {
				throw failure('session.changed', 'Phiên đã thay đổi; không dùng kết quả yêu cầu cũ.');
			}
		}

		function invalidate(reason = 'changed', broadcast = false) {
			if (ctx.disposed) return;
			ctx.revision += 1;
			ctx.session = null;
			ctx.status = reason;
			ctx.pending = null;
			publish();
			if (broadcast && ctx.channel) ctx.channel.postMessage({ type: 'session.changed' });
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
			ctx.session = Object.freeze({ id: payload.session_id, csrf: payload.csrf_token, user: Object.freeze(user) });
			ctx.revision += 1;
			ctx.status = 'authenticated';
			ctx.pending = null;
			publish();
			if (broadcast && ctx.channel) ctx.channel.postMessage({ type: 'session.changed' });
			return snapshot();
		}

		Object.assign(ctx, { failure, snapshot, publish, assertCurrent, invalidate, replace });
	}

	function installSessionFns2(ctx) {
		function bootstrap() {
			if (ctx.disposed) return Promise.reject(ctx.failure('session.disposed', 'Bộ quản lý phiên đã đóng.'));
			if (ctx.pending) return ctx.pending;
			const expected = ctx.revision;
			ctx.status = 'loading';
			ctx.publish();
			const operation = (async () => {
				try {
					const response = await Promise.resolve().then(() => ctx.send(new URL('/auth/session', ctx.origin).href, {
						credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
					}));
					ctx.assertCurrent(expected);
					if (response.status === 401) {
						ctx.invalidate('anonymous');
						return ctx.snapshot();
					}
					if (!response.ok) throw ctx.failure('session.unavailable', 'Chưa thể xác minh phiên đăng nhập.');
					const payload = await response.json();
					return ctx.replace(payload, expected);
				} catch (error) {
					if (!ctx.disposed && expected === ctx.revision) {
						ctx.status = 'unavailable';
						ctx.publish();
					}
					throw error;
				} finally {
					if (ctx.pending === operation) ctx.pending = null;
				}
			})();
			ctx.pending = operation;
			return operation;
		}

		async function ready() {
			if (ctx.status === 'unknown' || ctx.status === 'loading') await bootstrap();
			if (ctx.disposed || ctx.status !== 'authenticated' || !ctx.session) {
				throw ctx.failure('session.required', 'Cần xác minh lại phiên trước khi tiếp tục.');
			}
			return ctx.snapshot();
		}

		async function request(input, init = {}) {
			const target = new URL(typeof input === 'string' ? input : input.url || String(input), ctx.baseURI);
			if (!['http:', 'https:'].includes(target.protocol) || target.origin !== ctx.origin || target.username || target.password) {
				throw ctx.failure('session.external_request', 'Không gửi yêu cầu phiên tới địa chỉ ngoài hệ thống.');
			}
			const current = await ready();
			ctx.assertCurrent(current.revision);
			const headers = new Headers(init.headers !== undefined ? init.headers : input && input.headers);
			if (headers.has('Authorization')) throw ctx.failure('session.legacy_auth', 'Yêu cầu phiên cookie không dùng Bearer.');
			headers.set('X-QLPK-Session-Id', current.session.id);
			const method = String(init.method || input.method || 'GET').toUpperCase();
			if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', current.session.csrf);
			const response = await ctx.send(input, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
			ctx.assertCurrent(current.revision);
			if (response.status === 401) ctx.invalidate('expired');
			return { response, revision: current.revision };
		}

		async function requestJSON(input, init) {
			const result = await request(input, init);
			if (!result.response.ok) throw ctx.failure('session.http_error', `Yêu cầu thất bại (${result.response.status}).`);
			const data = await result.response.json();
			ctx.assertCurrent(result.revision);
			return data;
		}

		Object.assign(ctx, { bootstrap, ready, request, requestJSON });
	}

	function installSessionFns3(ctx) {
		function onChannelMessage(event) {
			if (event.data && event.data.type === 'session.changed') ctx.invalidate('changed');
		}

		Object.assign(ctx, { onChannelMessage });
	}

	function create(options = {}) {
		const ctx = {};
		installSessionFns1(ctx);
		installSessionFns2(ctx);
		installSessionFns3(ctx);

		ctx.send = options.fetch || window.fetch.bind(window);
		ctx.origin = options.origin || window.location.origin;
		ctx.baseURI = options.baseURI || window.document.baseURI;
		ctx.listeners = new Set();
		ctx.channel = options.channel || null;
		ctx.revision = 0;
		ctx.session = null;
		ctx.status = 'unknown';
		ctx.pending = null;
		ctx.disposed = false;

		if (ctx.channel) ctx.channel.addEventListener('message', ctx.onChannelMessage);
		return Object.freeze({
			bootstrap: ctx.bootstrap, ready: ctx.ready, request: ctx.request, requestJSON: ctx.requestJSON, snapshot: ctx.snapshot, replace: ctx.replace, invalidate: ctx.invalidate,
			subscribe(listener) { ctx.listeners.add(listener); return () => ctx.listeners.delete(listener); },
			dispose() {
				ctx.invalidate('disposed');
				ctx.disposed = true;
				ctx.listeners.clear();
				if (ctx.channel) ctx.channel.removeEventListener('message', ctx.onChannelMessage);
			},
		});
	}

	window.QLPKBrowserSession = Object.freeze({ create });
})(window);
