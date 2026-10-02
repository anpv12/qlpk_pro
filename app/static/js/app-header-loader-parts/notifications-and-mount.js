import { moduleState } from './state.js';
import { bindCalendarButton, bindFullscreenButton, incrementNotificationBadge, loadNotificationCenter, loadNotifications, markAllNotificationsRead, markNotificationRead, notificationElements, notificationIconClass, renderNotificationCenter, renderNotifications, setNotificationBadge, setNotificationCenterFilter, updateNotificationFromPayload, upsertRealtimeNotification } from './header-buttons.js';
import { bindLogout, bindPasswordModal, bindSearchShell } from './global-search.js';
import { ensureStylesheet, ensureWorkspaceRuntime, getAppVersion, hydrateUser, isEmbeddedWorkspacePage, resolveMountTarget } from './assets-and-session.js';

function hideNotificationDropdown() {
	const { button } = notificationElements();
	if (!button || !window.bootstrap || !window.bootstrap.Dropdown) return;
	const instance = window.bootstrap.Dropdown.getInstance(button);
	if (instance) instance.hide();
}
function closeNotificationCenterPanel() {
	const { centerPanel } = notificationElements();
	if (!centerPanel) return;
	centerPanel.classList.remove('is-open');
	centerPanel.setAttribute('aria-hidden', 'true');
}
function openNotificationCenter(event) {
	if (event) {
		event.preventDefault();
		event.stopPropagation();
	}
	const { centerPanel } = notificationElements();
	hideNotificationDropdown();
	setNotificationCenterFilter('all');
	if (centerPanel) {
		centerPanel.classList.add('is-open');
		centerPanel.setAttribute('aria-hidden', 'false');
	}
	loadNotificationCenter();
}
async function openNotification(notification) {
	let currentNotification = notification;
	try {
		const updated = await markNotificationRead(notification);
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
			icon: notificationIconClass(currentNotification),
		});
		return;
	}
	window.location.href = href;
}
function bindNotificationDropdown() {
	const { button, readAllBtn, viewAllBtn, centerReadAllBtn, centerPanel, centerSurface, centerCloseBtn, centerCloseFooterBtn } = notificationElements();
	if (button) {
		button.addEventListener('click', () => loadNotifications({ silent: moduleState.notificationLoaded }));
		button.addEventListener('shown.bs.dropdown', () => loadNotifications({ silent: true }));
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
	if (readAllBtn) readAllBtn.addEventListener('click', markAllNotificationsRead);
	if (viewAllBtn) viewAllBtn.addEventListener('click', openNotificationCenter);
	if (centerReadAllBtn) centerReadAllBtn.addEventListener('click', markAllNotificationsRead);
	if (centerCloseBtn) centerCloseBtn.addEventListener('click', closeNotificationCenterPanel);
	if (centerCloseFooterBtn) centerCloseFooterBtn.addEventListener('click', closeNotificationCenterPanel);
	document.querySelectorAll('[data-qlpk-notification-filter]').forEach(buttonEl => {
		buttonEl.addEventListener('click', () => setNotificationCenterFilter(buttonEl.dataset.qlpkNotificationFilter));
	});
	renderNotifications();
	renderNotificationCenter();
}
function bindNotificationRealtime() {
	if (moduleState.notificationRealtimeBound) return;
	moduleState.notificationRealtimeBound = true;
	window.addEventListener('qlpk:realtime:event', function (event) {
		const realtimeEvent = event && event.detail ? event.detail : null;
		if (realtimeEvent?.type === 'realtime.resynced') {
			loadNotifications({ silent: true });
			return;
		}
		if (!realtimeEvent || realtimeEvent.type !== 'notification.changed') return;
		const payload = realtimeEvent.payload || {};
		if (Number.isFinite(Number(payload.unread_count))) {
			setNotificationBadge(Number(payload.unread_count));
		} else {
			incrementNotificationBadge(payload.count || 1);
		}
		if (payload.notification) {
			if (payload.action === 'created') {
				upsertRealtimeNotification(payload.notification);
			} else {
				updateNotificationFromPayload(payload.notification);
			}
		} else if (moduleState.notificationLoaded) {
			loadNotifications({ silent: true });
		}
	});
}
function initializeHeader() {
	bindSearchShell();
	bindLogout();
	bindPasswordModal();
	bindCalendarButton();
	bindFullscreenButton();
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
	hydrateUser();
	loadNotifications({ silent: true });
}
async function mountHeader() {
	if (isEmbeddedWorkspacePage()) return;

	const target = resolveMountTarget();
	if (!target || target.querySelector('[data-component="qlpk-app-header"]')) return;

	ensureStylesheet();

	try {
		const response = await fetch(`${moduleState.HEADER_TEMPLATE_PATH}?v=${getAppVersion()}`);
		if (!response.ok) throw new Error(`Failed to load app header: ${response.statusText}`);
		const html = await response.text();
		const host = document.createElement('div');
		host.className = moduleState.HEADER_CONTAINER_CLASS;
		host.innerHTML = html;
		target.insertBefore(host, target.firstChild);
		document.body.classList.add('qlpk-has-app-header');
		await ensureWorkspaceRuntime();
		initializeHeader();
	} catch (error) {
		console.error('Error loading app header:', error);
	}
}

export { bindNotificationDropdown, bindNotificationRealtime, closeNotificationCenterPanel, hideNotificationDropdown, initializeHeader, mountHeader, openNotification, openNotificationCenter };
