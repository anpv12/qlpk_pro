(function (window, document) {
	'use strict';

	const PAGE_ROOM_BY_PATH = {
		'/index.html': 'page:dashboard',
		'/appointment-management.html': 'page:appointment-management',
		'/receptionist-new.html': 'page:receptionist-new',
		'/doctor-examination.html': 'page:doctor-examination',
		'/psychologist-examination.html': 'page:psychologist-examination',
		'/order-management.html': 'page:order-management',
		'/payment-waiting.html': 'page:payment-waiting',
		'/medicine-management.html': 'page:medicine-management',
		'/medicine-statistics': 'page:medicine-statistics',
		'/medicine-statistics.html': 'page:medicine-statistics',
		'/medicine-reference-catalog.html': 'page:medicine-reference-catalog',
		'/document-management.html': 'page:document-management',
		'/active-ingredient.html': 'page:active-ingredient',
		'/allergen.html': 'page:allergen',
		'/drug-interaction.html': 'page:drug-interaction',
		'/user-management.html': 'page:user-management',
		'/group-management.html': 'page:group-management',
		'/permission-management.html': 'page:permission-management',
		'/service-management.html': 'page:service-management',
		'/service-category.html': 'page:service-category',
		'/package-management.html': 'page:package-management',
		'/order-catalog.html': 'page:order-catalog',
		'/icd-management.html': 'page:icd-management',
		'/survey-template-management.html': 'page:survey-template-management',
		'/survey-template-create.html': 'page:survey-template-create',
		'/text-expansion-management.html': 'page:text-expansion-management',
		'/holiday-management.html': 'page:holiday-management',
		'/shortcut-settings.html': 'page:shortcut-settings',
		'/doctor-busy-schedule.html': 'page:doctor-busy-schedule',
		'/chi-tieu': 'page:chi-tieu',
		'/chi-tieu.html': 'page:chi-tieu',
	};

	const WORKFLOW_BY_PATH = {
		'/index.html': 'workflow:operations',
		'/appointment-management.html': 'workflow:operations',
		'/receptionist-new.html': 'workflow:operations',
		'/doctor-examination.html': 'workflow:operations',
		'/psychologist-examination.html': 'workflow:operations',
		'/order-management.html': 'workflow:operations',
		'/payment-waiting.html': 'workflow:operations',
		'/medicine-management.html': 'workflow:inventory',
		'/medicine-statistics': 'workflow:inventory',
		'/medicine-statistics.html': 'workflow:inventory',
		'/medicine-reference-catalog.html': 'workflow:inventory',
		'/document-management.html': 'workflow:inventory',
		'/active-ingredient.html': 'workflow:inventory',
		'/allergen.html': 'workflow:inventory',
		'/drug-interaction.html': 'workflow:inventory',
		'/user-management.html': 'workflow:admin',
		'/group-management.html': 'workflow:admin',
		'/permission-management.html': 'workflow:admin',
		'/service-management.html': 'workflow:admin',
		'/service-category.html': 'workflow:admin',
		'/package-management.html': 'workflow:admin',
		'/order-catalog.html': 'workflow:admin',
		'/icd-management.html': 'workflow:admin',
		'/survey-template-management.html': 'workflow:admin',
		'/survey-template-create.html': 'workflow:admin',
		'/text-expansion-management.html': 'workflow:admin',
		'/holiday-management.html': 'workflow:admin',
		'/shortcut-settings.html': 'workflow:personal',
		'/doctor-busy-schedule.html': 'workflow:operations',
		'/chi-tieu': 'workflow:finance',
		'/chi-tieu.html': 'workflow:finance',
	};

	let socket = null;
	let started = false;

	function normalizePath(pathname) {
		let path = pathname || '/index.html';
		if (path === '/') path = '/index.html';
		return path;
	}

	function pathFromHref(href) {
		if (!href) return '';
		try {
			return normalizePath(new URL(href, window.location.origin).pathname);
		} catch (error) {
			return '';
		}
	}

	function roomsForPath(path) {
		const normalized = normalizePath(path);
		return [PAGE_ROOM_BY_PATH[normalized], WORKFLOW_BY_PATH[normalized]].filter(Boolean);
	}

	function getToken() {
		try {
			return localStorage.getItem('qlpk_token') || localStorage.getItem('token') || '';
		} catch (error) {
			return '';
		}
	}

	function currentRooms() {
		const paths = new Set([normalizePath(window.location.pathname)]);

		document.querySelectorAll('iframe.qlpk-workspace-iframe').forEach((iframe) => {
			const iframePath = pathFromHref(iframe.getAttribute('src') || iframe.src || '');
			if (iframePath) paths.add(iframePath);
		});

		const workspaceTabs = window.QLPKWorkspaceShell
			&& typeof window.QLPKWorkspaceShell.getTabs === 'function'
			? window.QLPKWorkspaceShell.getTabs()
			: [];
		workspaceTabs.forEach((tab) => {
			const tabPath = pathFromHref(tab && tab.href);
			if (tabPath) paths.add(tabPath);
		});

		return Array.from(new Set(Array.from(paths).flatMap(roomsForPath)));
	}

	function dispatchToWindow(targetWindow, event) {
		if (!targetWindow) return;
		try {
			targetWindow.dispatchEvent(new CustomEvent('qlpk:realtime:event', { detail: event }));
			if (targetWindow.document) {
				targetWindow.document.dispatchEvent(new CustomEvent('qlpk:realtime:event', { detail: event }));
			}
		} catch (error) {
			// Cross-origin or unloaded iframe; ignore.
		}
	}

	function dispatchEvent(event) {
		dispatchToWindow(window, event);
		document.querySelectorAll('iframe.qlpk-workspace-iframe').forEach((iframe) => {
			dispatchToWindow(iframe.contentWindow, event);
		});
	}

	function subscribe() {
		if (!socket || !socket.connected) return;
		socket.emit('qlpk:subscribe', { rooms: currentRooms() });
	}

	function start() {
		if (started || socket) return socket;

		const token = getToken();
		if (!token || typeof window.io !== 'function') return null;
		started = true;

		socket = window.io({
			path: '/socket.io',
			transports: ['websocket'],
			upgrade: false,
			auth: { token },
			reconnection: true,
			reconnectionAttempts: Infinity,
			reconnectionDelay: 700,
			reconnectionDelayMax: 5000,
			timeout: 10000,
		});

		socket.on('connect', subscribe);
		socket.on('qlpk:connected', subscribe);
		socket.on('qlpk:event', dispatchEvent);
		socket.on('connect_error', function () {
			dispatchEvent({ type: 'realtime.connection_error', payload: {} });
		});

		return socket;
	}

	function stop() {
		started = false;
		if (socket) {
			socket.disconnect();
			socket = null;
		}
	}

	function emitPageSubscription() {
		subscribe();
	}

	function isEmbeddedWorkspacePage() {
		try {
			return window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1';
		} catch (error) {
			return true;
		}
	}

	function autoStart() {
		if (isEmbeddedWorkspacePage()) return;
		const startWhenReady = () => start();
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
		} else {
			startWhenReady();
		}
	}

	window.QLPKRealtimeClient = {
		start,
		stop,
		subscribe: emitPageSubscription,
		dispatchEvent,
		get socket() {
			return socket;
		},
	};

	autoStart();
})(window, document);
