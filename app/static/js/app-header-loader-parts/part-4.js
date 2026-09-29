// app-header-loader.js: phần 4/4 (nạp trước app-header-loader.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-header-loader'] || (window.QLPKModuleParts['app-header-loader'] = { state: {} });
	const moduleState = moduleParts.state;

	function hideNotificationDropdown() {
		const { button } = moduleParts.notificationElements();
		if (!button || !window.bootstrap || !window.bootstrap.Dropdown) return;
		const instance = window.bootstrap.Dropdown.getInstance(button);
		if (instance) instance.hide();
	}
	function closeNotificationCenterPanel() {
		const { centerPanel } = moduleParts.notificationElements();
		if (!centerPanel) return;
		centerPanel.classList.remove('is-open');
		centerPanel.setAttribute('aria-hidden', 'true');
	}
	function openNotificationCenter(event) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		const { centerPanel } = moduleParts.notificationElements();
		hideNotificationDropdown();
		moduleParts.setNotificationCenterFilter('all');
		if (centerPanel) {
			centerPanel.classList.add('is-open');
			centerPanel.setAttribute('aria-hidden', 'false');
		}
		moduleParts.loadNotificationCenter();
	}
	async function openNotification(notification) {
		let currentNotification = notification;
		try {
			const updated = await moduleParts.markNotificationRead(notification);
			if (updated) currentNotification = { ...notification, ...updated };
		} catch (error) {
			console.warn('Không thể đánh dấu thông báo đã đọc:', error);
		}

		const href = currentNotification && currentNotification.action_url;
		if (!href) return;
		hideNotificationDropdown();
		closeNotificationCenterPanel();
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
			window.QLPKWorkspaceShell.openHref(href, {
				label: currentNotification.title || 'Thông báo',
				icon: moduleParts.notificationIconClass(currentNotification),
			});
			return;
		}
		window.location.href = href;
	}
	function bindNotificationDropdown() {
		const { button, readAllBtn, viewAllBtn, centerReadAllBtn, centerPanel, centerSurface, centerCloseBtn, centerCloseFooterBtn } = moduleParts.notificationElements();
		if (button) {
			button.addEventListener('click', () => moduleParts.loadNotifications({ silent: moduleState.notificationLoaded }));
			button.addEventListener('shown.bs.dropdown', () => moduleParts.loadNotifications({ silent: true }));
		}
		if (centerPanel) {
			document.addEventListener('keydown', (event) => {
				if (event.key === 'Escape' && centerPanel.classList.contains('is-open')) closeNotificationCenterPanel();
			});
			document.addEventListener('click', (event) => {
				if (!centerPanel.classList.contains('is-open')) return;
				if (centerSurface && centerSurface.contains(event.target)) return;
				if (viewAllBtn && viewAllBtn.contains(event.target)) return;
				closeNotificationCenterPanel();
			});
		}
		if (readAllBtn) readAllBtn.addEventListener('click', moduleParts.markAllNotificationsRead);
		if (viewAllBtn) viewAllBtn.addEventListener('click', openNotificationCenter);
		if (centerReadAllBtn) centerReadAllBtn.addEventListener('click', moduleParts.markAllNotificationsRead);
		if (centerCloseBtn) centerCloseBtn.addEventListener('click', closeNotificationCenterPanel);
		if (centerCloseFooterBtn) centerCloseFooterBtn.addEventListener('click', closeNotificationCenterPanel);
		document.querySelectorAll('[data-qlpk-notification-filter]').forEach(buttonEl => {
			buttonEl.addEventListener('click', () => moduleParts.setNotificationCenterFilter(buttonEl.dataset.qlpkNotificationFilter));
		});
		moduleParts.renderNotifications();
		moduleParts.renderNotificationCenter();
	}
	function bindNotificationRealtime() {
		if (moduleState.notificationRealtimeBound) return;
		moduleState.notificationRealtimeBound = true;
		window.addEventListener('qlpk:realtime:event', function (event) {
			const realtimeEvent = event && event.detail ? event.detail : null;
			if (realtimeEvent?.type === 'realtime.resynced') {
				moduleParts.loadNotifications({ silent: true });
				return;
			}
			if (!realtimeEvent || realtimeEvent.type !== 'notification.changed') return;
			const payload = realtimeEvent.payload || {};
			if (Number.isFinite(Number(payload.unread_count))) {
				moduleParts.setNotificationBadge(Number(payload.unread_count));
			} else {
				moduleParts.incrementNotificationBadge(payload.count || 1);
			}
			if (payload.notification) {
				if (payload.action === 'created') {
					moduleParts.upsertRealtimeNotification(payload.notification);
				} else {
					moduleParts.updateNotificationFromPayload(payload.notification);
				}
			} else if (moduleState.notificationLoaded) {
				moduleParts.loadNotifications({ silent: true });
			}
		});
	}
	function initializeHeader() {
		moduleParts.bindSearchShell();
		moduleParts.bindLogout();
		moduleParts.bindPasswordModal();
		moduleParts.bindCalendarButton();
		moduleParts.bindFullscreenButton();
		bindNotificationDropdown();
		bindNotificationRealtime();
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.init === 'function') {
			window.QLPKWorkspaceShell.init();
		}
		if (window.QLPKRealtimeClient && typeof window.QLPKRealtimeClient.start === 'function') {
			const session = window.QLPKApiTransport?.session;
			if (session) window.QLPKRealtimeClient.bindSession(session.owner);
			else window.QLPKRealtimeClient.start();
		}
		moduleParts.hydrateUser();
		moduleParts.loadNotifications({ silent: true });
	}
	async function mountHeader() {
		if (moduleParts.isEmbeddedWorkspacePage()) return;

		const target = moduleParts.resolveMountTarget();
		if (!target || target.querySelector('[data-component="qlpk-app-header"]')) return;

		moduleParts.ensureStylesheet();

		try {
			const response = await fetch(`${moduleState.HEADER_TEMPLATE_PATH}?v=${moduleParts.getAppVersion()}`);
			if (!response.ok) throw new Error(`Failed to load app header: ${response.statusText}`);
			const html = await response.text();
			const host = document.createElement('div');
			host.className = moduleState.HEADER_CONTAINER_CLASS;
			host.innerHTML = html;
			target.insertBefore(host, target.firstChild);
			document.body.classList.add('qlpk-has-app-header');
			await moduleParts.ensureWorkspaceRuntime();
			initializeHeader();
		} catch (error) {
			console.error('Error loading app header:', error);
		}
	}

	Object.assign(moduleParts, {
		hideNotificationDropdown,
		closeNotificationCenterPanel,
		openNotificationCenter,
		openNotification,
		bindNotificationDropdown,
		bindNotificationRealtime,
		initializeHeader,
		mountHeader
	});
})(window, document);
