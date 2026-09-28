(function (window, document) {
	'use strict';

	if (window.QLPKApiTransport) return;
	const nativeFetch = window.fetch.bind(window);
	const installedJQuery = new WeakSet();
	let cookieSession = null;
	let legacyToken = null;
	let legacyRevision = 0;

	function storedToken() {
		try {
			const raw = window.localStorage.getItem('qlpk_token') || window.localStorage.getItem('token')
				|| window.sessionStorage?.getItem('qlpk_token') || window.sessionStorage?.getItem('token');
			if (!raw) return '';
			let token = String(raw).trim();
			if (token.startsWith('{')) {
				const payload = JSON.parse(token);
				token = payload.access_token || payload.token || payload.Authorization || payload.authorization;
			}
			return typeof token === 'string' ? token.replace(/^Bearer\s+/i, '').trim() : '';
		} catch { return ''; }
	}

	function getAuthHeader() {
		if (cookieSession) return null;
		const token = storedToken();
		return token ? `Bearer ${token}` : null;
	}

	function hasSession() {
		if (!cookieSession) return Boolean(storedToken());
		return ['unknown', 'loading', 'authenticated'].includes(cookieSession.owner.snapshot().status);
	}

	function sessionRevision() {
		if (cookieSession) return `cookie:${cookieSession.owner.snapshot().revision}`;
		const token = storedToken();
		if (token !== legacyToken) {
			legacyToken = token;
			legacyRevision += 1;
		}
		return `legacy:${legacyRevision}`;
	}

	function storedUser() {
		try {
			const user = JSON.parse(window.localStorage.getItem('qlpk_user') || '{}');
			return user && typeof user === 'object' && !Array.isArray(user) ? user : {};
		} catch { return {}; }
	}

	function userSnapshot() {
		if (!cookieSession) return storedUser();
		const current = cookieSession.owner.snapshot();
		return current.status === 'authenticated' && current.session ? current.session.user : {};
	}

	async function currentUser() {
		if (!cookieSession) return storedUser();
		try {
			return (await cookieSession.owner.ready()).session.user;
		} catch { return {}; }
	}

	async function ensureSession() {
		const binding = cookieSession;
		if (!binding) {
			if (storedToken()) return true;
			window.location.href = '/login';
			return false;
		}
		try {
			const ready = await binding.owner.ready();
			const current = binding.owner.snapshot();
			if (cookieSession !== binding || current.revision !== ready.revision
				|| current.status !== 'authenticated') throw sessionChanged();
			return true;
		} catch {
			const current = binding.owner.snapshot();
			if (['anonymous', 'expired'].includes(current.status)) window.location.href = '/login';
			else window.QLPKUserFeedback?.show('error', 'Chưa thể xác minh phiên đăng nhập. Vui lòng tải lại trang.');
			return false;
		}
	}

	function isSameOrigin(input) {
		try {
			const address = typeof input === 'string' ? input : input.url || String(input);
			const target = new URL(address, document.baseURI || window.location.href);
			return ['http:', 'https:'].includes(target.protocol) && target.origin === window.location.origin
				&& !target.username && !target.password;
		} catch {
			return false;
		}
	}

	function fetch(input, init) {
		if (!isSameOrigin(input)) return nativeFetch(input, init);
		if (cookieSession) return cookieRequest(input, init);
		const requestHeaders = init && init.headers !== undefined ? init.headers : input && input.headers;
		const headers = new Headers(requestHeaders);
		const token = storedToken();
		let requestOptions = init;
		if (token && !headers.has('Authorization')) {
			headers.set('Authorization', 'Bearer ' + token);
			requestOptions = { ...init, headers };
		}
		const verify = () => {
			if (cookieSession) throw sessionChanged();
			assertCurrent(token);
		};
		return nativeFetch(input, requestOptions).then(response => protectResponse(response, verify));
	}

	function sessionChanged() {
		const error = new Error('Phiên đã thay đổi; không sử dụng phản hồi cũ.');
		error.code = 'session.changed';
		return error;
	}

	function assertCurrent(token) {
		if (storedToken() !== token) throw sessionChanged();
	}

	function useCookieSession(options = {}) {
		if (cookieSession) return cookieSession;
		if (!window.QLPKBrowserSession || !window.QLPKBrowserSessionActions) {
			throw new Error('Chưa nạp bộ quản lý phiên trình duyệt.');
		}
		const owner = window.QLPKBrowserSession.create({ fetch: nativeFetch, channel: options.channel });
		const actions = window.QLPKBrowserSessionActions.create({ owner, fetch: nativeFetch, locks: options.locks });
		cookieSession = Object.freeze({ owner, actions });
		return cookieSession;
	}

	async function cookieRequest(input, init = {}) {
		const target = new URL(typeof input === 'string' ? input : input.url || String(input), document.baseURI);
		const method = String(init.method || input.method || 'GET').toUpperCase();
		if (['/auth/login', '/auth/logout'].includes(target.pathname)
			|| (target.pathname === '/users/me/password' && method !== 'GET')) {
			const error = new Error('Thao tác phiên phải đi qua bộ quản lý đăng nhập dùng chung.');
			error.code = 'session.action_required';
			throw error;
		}
		if (['GET', 'HEAD'].includes(method) && target.pathname.startsWith('/static/')) {
			return nativeFetch(input, init);
		}
		const { owner } = cookieSession;
		const result = await owner.request(input, init);
		return protectResponse(result.response, () => {
			const current = owner.snapshot();
			if (current.revision !== result.revision || current.status !== 'authenticated') throw sessionChanged();
		});
	}

	function protectResponse(response, verify) {
		verify();
		let body;
		return new Proxy(response, {
			get(target, name) {
				const value = Reflect.get(target, name, target);
				if (name === 'body') {
					verify();
					if (!value) return value;
					if (!body) body = protectStream(value, verify);
					return body;
				}
				if (name === 'clone') return () => { verify(); return protectResponse(target.clone(), verify); };
				if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(name) && typeof value === 'function') {
					return async (...args) => {
						verify();
						const payload = await value.apply(target, args);
						verify();
						return payload;
					};
				}
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
	}

	function protectReader(reader, verify) {
		return new Proxy(reader, {
			get(target, name) {
				if (name === 'read') return async (...args) => {
					try {
						verify();
						const result = await target.read(...args);
						verify();
						return result;
					} catch (error) {
						void target.cancel(error).catch(() => {});
						throw error;
					}
				};
				const value = Reflect.get(target, name, target);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});
	}

	function protectStream(source, verify, byteStream = true) {
		let sourceReader;
		const stream = new window.ReadableStream({
			type: byteStream ? 'bytes' : undefined,
			async pull(controller) {
				try {
					verify();
					if (!sourceReader) sourceReader = protectReader(source.getReader(), verify);
					const result = await sourceReader.read();
					if (result.done) {
						controller.close();
						if (controller.byobRequest) controller.byobRequest.respond(0);
						sourceReader.releaseLock();
					} else controller.enqueue(result.value);
				} catch (error) {
					controller.error(error);
					if (sourceReader) sourceReader.releaseLock();
					else void source.cancel(error).catch(() => {});
				}
			},
			async cancel(reason) {
				if (!sourceReader) return source.cancel(reason);
				try { await sourceReader.cancel(reason); } finally { sourceReader.releaseLock(); }
			}
		}, { highWaterMark: 0 });
		const getReader = stream.getReader.bind(stream);
		const tee = stream.tee.bind(stream);
		const pipeThrough = stream.pipeThrough.bind(stream);
		const values = async function* (options = {}) {
			const reader = protectReader(getReader(), verify);
			let completed = false;
			try {
				while (true) {
					const result = await reader.read();
					if (result.done) { completed = true; return; }
					yield result.value;
				}
			} finally {
				try { if (!completed && !options.preventCancel) await reader.cancel(); }
				finally { reader.releaseLock(); }
			}
		};
		Object.defineProperties(stream, {
			getReader: { value: options => protectReader(getReader(options), verify) },
			values: { value: values },
			[Symbol.asyncIterator]: { value: values },
			tee: { value: () => { verify(); return tee().map(branch => protectStream(branch, verify, byteStream)); } },
			pipeThrough: { value: (...args) => protectStream(pipeThrough(...args), verify, false) }
		});
		return stream;
	}

	function installJQuery(jquery) {
		if (!jquery || typeof jquery.ajaxTransport !== 'function' || installedJQuery.has(jquery)) return;
		jquery.ajaxTransport('+*', function (settings) {
			if (!isSameOrigin(settings.url) || settings.dataTypes.some(type => ['script', 'jsonp'].includes(type))) return;
			return jqueryTransport(settings);
		});
		installedJQuery.add(jquery);
	}

	function watchGlobalJQuery() {
		if (window.jQuery) {
			installJQuery(window.jQuery);
			return;
		}
		let current;
		try {
			Object.defineProperty(window, 'jQuery', {
				configurable: true,
				enumerable: true,
				get() { return current; },
				set(value) {
					current = value;
					installJQuery(value);
				},
			});
		} catch {}
	}

	function jqueryTransport(settings) {
		const controller = new AbortController();
		let aborted = false;
		return {
			send(headers, complete) {
				if (settings.async === false) {
					complete(0, 'session.sync_unsupported');
					return;
				}
				const requestHeaders = new Headers(headers);
				if (!requestHeaders.has('X-Requested-With')) requestHeaders.set('X-Requested-With', 'XMLHttpRequest');
				const result = fetch(settings.url, {
					method: settings.type, headers: requestHeaders, signal: controller.signal,
					body: settings.hasContent && settings.data != null ? settings.data : undefined,
					credentials: settings.xhrFields?.withCredentials ? 'include' : 'same-origin',
				}).then(async response => {
					const binary = settings.xhrFields?.responseType;
					const payload = binary === 'blob' ? await response.blob()
						: binary === 'arraybuffer' ? await response.arrayBuffer()
							: binary === 'json' ? await response.json() : await response.text();
					const responseHeaders = new Headers(response.headers);
					if (settings.mimeType) responseHeaders.set('Content-Type', settings.mimeType);
					const rawHeaders = Array.from(responseHeaders, ([name, value]) => `${name}: ${value}`).join('\r\n');
					return [response.status, response.statusText, { [binary && binary !== 'text' ? 'binary' : 'text']: payload }, rawHeaders];
				});
				result.then(args => {
					if (!aborted) complete(...args);
				}, error => {
					if (!aborted) complete(0, error.code || 'error');
				});
			},
			abort() {
				aborted = true;
				controller.abort();
			},
		};
	}

	try {
		window.localStorage.removeItem('qlpk_password');
		window.localStorage.removeItem('qlpk_username');
	} catch {}

	window.fetch = fetch;
	watchGlobalJQuery();
	window.QLPKApiTransport = Object.freeze({ fetch, installJQuery, useCookieSession, ensureSession, getAuthHeader, hasSession,
		sessionRevision, userSnapshot, currentUser,
		get session() { return cookieSession; },
	});
})(window, document);
