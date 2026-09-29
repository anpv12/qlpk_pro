(function (window, document) {
	'use strict';

	const transport = window.QLPKApiTransport;
	if (!transport || transport.session) return;
	const script = document.currentScript;
	const publicPage = Boolean(script && script.dataset.qlpkSession === 'public');
	let channel = null;
	try {
		if (typeof window.BroadcastChannel === 'function') channel = new window.BroadcastChannel('qlpk:browser-session');
	} catch { /* BroadcastChannel/storage/top khác origin: bỏ qua */ }
	const binding = transport.useCookieSession({ channel, allowAnonymous: publicPage });

	for (const storage of [window.localStorage, window.sessionStorage]) {
		try {
			storage?.removeItem('qlpk_token');
			storage?.removeItem('token');
		} catch { /* BroadcastChannel/storage/top khác origin: bỏ qua */ }
	}

	function redirectToLogin() {
		let target = window;
		try {
			if (window.top && window.top.location.origin === window.location.origin) target = window.top;
		} catch { /* BroadcastChannel/storage/top khác origin: bỏ qua */ }
		if (!['/login', '/login.html'].includes(target.location.pathname)) target.location.href = '/login';
	}

	binding.owner.subscribe(current => {
		if (!publicPage && ['anonymous', 'expired'].includes(current.status)) redirectToLogin();
	});
	binding.owner.bootstrap().catch(() => {});
})(window, document);
