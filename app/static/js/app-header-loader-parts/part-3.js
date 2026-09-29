// app-header-loader.js: phần 3/4 (nạp trước app-header-loader.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-header-loader'] || (window.QLPKModuleParts['app-header-loader'] = { state: {} });
	const moduleState = moduleParts.state;

	function getActiveWorkspaceWindow() {
		const activePane = document.querySelector('#qlpkWorkspaceFrameHost .qlpk-workspace-pane.is-active');
		const iframe = activePane ? activePane.querySelector('iframe') : null;
		if (!iframe) return null;
		try {
			return iframe.contentWindow || null;
		} catch (error) {
			return null;
		}
	}
	function tryOpenAppointmentModal(targetWindow) {
		if (!targetWindow) return false;
		try {
			const path = targetWindow.location && targetWindow.location.pathname ? targetWindow.location.pathname : '';
			if (path.endsWith('/appointment-management.html') && targetWindow.QLPKAppointmentManagementReadyForHeaderModal === false) {
				return false;
			}
			const modal = targetWindow.document && targetWindow.document.getElementById('addAppointmentModal');
			if (modal && modal.classList.contains('show')) {
				sessionStorage.removeItem(moduleState.APPOINTMENT_MODAL_REQUEST_KEY);
				return true;
			}
			if (typeof targetWindow.openAddAppointmentWithDate !== 'function') return false;
			targetWindow.openAddAppointmentWithDate();
			if (modal && modal.classList.contains('show')) {
				sessionStorage.removeItem(moduleState.APPOINTMENT_MODAL_REQUEST_KEY);
				return true;
			}
			return false;
		} catch (error) {
			return false;
		}
	}
	function scheduleAppointmentModalOpen() {
		let attempts = 0;
		const maxAttempts = 40;
		const timer = setInterval(() => {
			attempts += 1;
			if (tryOpenAppointmentModal(window) || tryOpenAppointmentModal(getActiveWorkspaceWindow()) || attempts >= maxAttempts) {
				clearInterval(timer);
			}
		}, 150);
	}
	function openAppointmentModalFromHeader() {
		if (tryOpenAppointmentModal(window) || tryOpenAppointmentModal(getActiveWorkspaceWindow())) return;

		sessionStorage.setItem(moduleState.APPOINTMENT_MODAL_REQUEST_KEY, '1');
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.openHref === 'function') {
			window.QLPKWorkspaceShell.openHref(moduleState.APPOINTMENT_PAGE_HREF, {
				label: 'Lịch hẹn',
				icon: 'bi bi-calendar2-week',
			});
			scheduleAppointmentModalOpen();
			return;
		}

		window.location.href = `/${moduleState.APPOINTMENT_PAGE_HREF}`;
	}
	function bindCalendarButton() {
		const calendarBtn = document.getElementById('qlpkHeaderCalendarBtn');
		if (calendarBtn) calendarBtn.addEventListener('click', openAppointmentModalFromHeader);
	}
	function getFullscreenElement() {
		return document.fullscreenElement
			|| document.webkitFullscreenElement
			|| document.mozFullScreenElement
			|| document.msFullscreenElement
			|| null;
	}
	function isFullscreenSupported() {
		const root = document.documentElement;
		return Boolean(
			document.fullscreenEnabled
			|| document.webkitFullscreenEnabled
			|| root.requestFullscreen
			|| root.webkitRequestFullscreen
		);
	}
	function updateFullscreenButton() {
		const button = document.getElementById('qlpkHeaderFullscreenBtn');
		const icon = document.getElementById('qlpkHeaderFullscreenIcon');
		if (!button) return;

		if (!isFullscreenSupported()) {
			button.hidden = true;
			return;
		}

		const isFullscreen = Boolean(getFullscreenElement());
		const label = isFullscreen ? 'Thoát toàn màn hình' : 'Phóng to toàn màn hình';
		button.hidden = false;
		button.setAttribute('aria-label', label);
		button.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
		button.setAttribute('title', label);
		if (icon) {
			icon.className = isFullscreen ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen';
		}
	}
	async function toggleFullscreen() {
		if (!isFullscreenSupported()) return;
		try {
			if (getFullscreenElement()) {
				if (document.exitFullscreen) {
					await document.exitFullscreen();
				} else if (document.webkitExitFullscreen) {
					document.webkitExitFullscreen();
				}
				return;
			}

			const root = document.documentElement;
			if (root.requestFullscreen) {
				await root.requestFullscreen();
			} else if (root.webkitRequestFullscreen) {
				root.webkitRequestFullscreen();
			}
		} finally {
			updateFullscreenButton();
		}
	}
	function bindFullscreenButton() {
		const button = document.getElementById('qlpkHeaderFullscreenBtn');
		if (!button) return;
		button.addEventListener('click', toggleFullscreen);
		['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventName => {
			document.addEventListener(eventName, updateFullscreenButton);
		});
		updateFullscreenButton();
	}
	function hasHeaderSession() {
		const session = window.QLPKApiTransport?.session;
		if (session) return ['unknown', 'loading', 'authenticated'].includes(session.owner.snapshot().status);
		try {
			return Boolean(localStorage.getItem('qlpk_token') || localStorage.getItem('token'));
		} catch (error) {
			return false;
		}
	}
	async function notificationApi(path, options = {}) {
		if (!hasHeaderSession()) throw new Error('Session unavailable');

		const headers = {
			Accept: 'application/json',
			...(options.headers || {}),
		};

		if (options.body && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}

		const response = await fetch(path, {
			...options,
			headers,
		});
		const payload = await response.json();
		if (!response.ok) {
			throw new Error(payload.detail || 'Không thể tải thông báo.');
		}
		return payload;
	}
	function notificationElements() {
		return {
			button: document.getElementById('qlpkHeaderNotificationButton'),
			menu: document.getElementById('qlpkHeaderNotificationMenu'),
			list: document.getElementById('qlpkHeaderNotificationList'),
			empty: document.getElementById('qlpkHeaderNotificationEmpty'),
			readAllBtn: document.getElementById('qlpkHeaderNotificationReadAllBtn'),
			viewAllBtn: document.getElementById('qlpkHeaderNotificationViewAllBtn'),
			centerPanel: document.getElementById('qlpkNotificationCenterPanel'),
			centerSurface: document.querySelector('#qlpkNotificationCenterPanel .qlpk-notification-center-panel__surface'),
			centerCloseBtn: document.getElementById('qlpkNotificationCenterCloseBtn'),
			centerCloseFooterBtn: document.getElementById('qlpkNotificationCenterCloseFooterBtn'),
			centerList: document.getElementById('qlpkNotificationCenterList'),
			centerEmpty: document.getElementById('qlpkNotificationCenterEmpty'),
			centerStatus: document.getElementById('qlpkNotificationCenterStatus'),
			centerSummary: document.getElementById('qlpkNotificationCenterSummary'),
			centerReadAllBtn: document.getElementById('qlpkNotificationCenterReadAllBtn'),
		};
	}
	function setNotificationBadge(count) {
		const badge = document.getElementById('qlpkHeaderNotificationBadge');
		if (!badge) return;
		const safeCount = Math.max(0, Number(count) || 0);
		badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
		badge.classList.toggle('qlpk-app-header__badge--hidden', safeCount <= 0);
	}
	function incrementNotificationBadge(amount) {
		const badge = document.getElementById('qlpkHeaderNotificationBadge');
		const current = Number(badge && badge.textContent !== '99+' ? badge.textContent : 0) || 0;
		setNotificationBadge(current + (Number(amount) || 1));
	}
	function isUnreadNotification(notification) {
		return !!notification && !notification.is_read && notification.status !== 'read';
	}
	function notificationIconClass(notification) {
		const type = String(notification && notification.event_type ? notification.event_type : '');
		if (type.includes('receptionist')) return 'bi bi-arrow-return-left';
		if (type.includes('psychologist')) return 'bi bi-person-heart';
		if (type.includes('doctor')) return 'bi bi-clipboard2-pulse';
		return 'bi bi-bell';
	}
	function notificationFeedbackType(notification) {
		const type = String(notification && notification.event_type ? notification.event_type : '');
		if (type.includes('receptionist') || type.includes('returned')) return 'warning';
		if (type.includes('doctor') || type.includes('psychologist')) return 'info';
		return 'info';
	}
	function formatNotificationTime(value) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const now = new Date();
		const sameDay = date.getFullYear() === now.getFullYear()
			&& date.getMonth() === now.getMonth()
			&& date.getDate() === now.getDate();
		const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
		if (sameDay) return time;
		return `${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
	}
	function formatNotificationAppointmentTime(notification) {
		const value = notification && (notification.appointment_date || (notification.payload && notification.payload.appointment_date));
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		return `Ngày khám ${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
	}
	function getNotificationPatientInitials(notification) {
		const name = String(notification && notification.patient_name ? notification.patient_name : '').trim();
		if (!name) return '';
		const parts = name.split(/\s+/).filter(Boolean);
		const first = parts[0] || '';
		const last = parts.length > 1 ? parts[parts.length - 1] : '';
		return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
	}
	function renderNotificationItem(notification) {
		const item = document.createElement('button');
		item.type = 'button';
		item.className = 'qlpk-app-header__notification-item';
		if (isUnreadNotification(notification)) item.classList.add('is-unread');
		item.dataset.notificationId = String(notification.id || '');

		const iconWrap = document.createElement('span');
		const feedbackType = notificationFeedbackType(notification);
		iconWrap.className = `qlpk-app-header__notification-icon qlpk-app-header__notification-icon--${feedbackType}`;
		const patientInitials = getNotificationPatientInitials(notification);
		if (patientInitials) {
			iconWrap.classList.add('qlpk-app-header__notification-icon--avatar');
			iconWrap.textContent = patientInitials;
			iconWrap.setAttribute('aria-label', `Bệnh nhân ${notification.patient_name}`);
		} else {
			const icon = document.createElement('i');
			icon.className = notificationIconClass(notification);
			icon.setAttribute('aria-hidden', 'true');
			iconWrap.appendChild(icon);
		}

		const body = document.createElement('span');
		body.className = 'qlpk-app-header__notification-body';

		const title = document.createElement('strong');
		title.className = 'qlpk-app-header__notification-title';
		const titleText = document.createElement('span');
		titleText.textContent = notification.title || 'Thông báo';
		title.appendChild(titleText);
		if (isUnreadNotification(notification)) {
			const dot = document.createElement('span');
			dot.className = 'qlpk-app-header__notification-dot';
			dot.setAttribute('aria-label', 'Chưa đọc');
			title.appendChild(dot);
		}

		const message = document.createElement('p');
		message.className = 'qlpk-app-header__notification-message';
		message.textContent = notification.message || 'Có cập nhật mới trong hệ thống.';

		const meta = document.createElement('span');
		meta.className = 'qlpk-app-header__notification-meta';
		meta.textContent = [formatNotificationAppointmentTime(notification) || formatNotificationTime(notification.created_at)]
			.filter(Boolean)
			.join(' · ');

		body.appendChild(title);
		body.appendChild(message);
		if (meta.textContent) body.appendChild(meta);

		item.appendChild(iconWrap);
		item.appendChild(body);
		item.addEventListener('click', () => moduleParts.openNotification(notification));
		return item;
	}
	function renderNotifications() {
		const { list, empty, readAllBtn } = notificationElements();
		if (!list) return;

		list.innerHTML = '';
		const items = Array.isArray(moduleState.notificationItems) ? moduleState.notificationItems : [];
		items.forEach(notification => list.appendChild(renderNotificationItem(notification)));
		list.classList.toggle('is-empty', items.length === 0);
		if (empty) empty.classList.toggle('is-hidden', items.length > 0);
		if (readAllBtn) readAllBtn.disabled = !items.some(isUnreadNotification);
	}
	function getFilteredNotificationCenterItems() {
		const items = Array.isArray(moduleState.notificationCenterItems) ? moduleState.notificationCenterItems : [];
		if (moduleState.notificationCenterFilter === 'unread') return items.filter(isUnreadNotification);
		return items;
	}
	function renderNotificationCenter() {
		const { centerList, centerEmpty, centerStatus, centerSummary, centerReadAllBtn } = notificationElements();
		if (!centerList) return;

		const items = getFilteredNotificationCenterItems();
		centerList.innerHTML = '';
		items.forEach(notification => centerList.appendChild(renderNotificationItem(notification)));

		const hasItems = items.length > 0;
		centerList.classList.toggle('is-empty', !hasItems);
		if (centerEmpty) centerEmpty.classList.toggle('is-hidden', hasItems || moduleState.notificationCenterLoading);
		if (centerStatus) centerStatus.classList.toggle('is-hidden', !moduleState.notificationCenterLoading);
		if (centerReadAllBtn) centerReadAllBtn.disabled = !moduleState.notificationCenterItems.some(isUnreadNotification);
		if (centerSummary) {
			const total = moduleState.notificationCenterItems.length;
			const unread = moduleState.notificationCenterItems.filter(isUnreadNotification).length;
			centerSummary.textContent = `Đang hiển thị ${items.length}/${total} thông báo gần nhất${unread ? `, ${unread} chưa đọc` : ''}`;
		}
	}
	function setNotificationCenterFilter(filter) {
		moduleState.notificationCenterFilter = filter === 'unread' ? 'unread' : 'all';
		document.querySelectorAll('[data-qlpk-notification-filter]').forEach(button => {
			button.classList.toggle('is-active', button.dataset.qlpkNotificationFilter === moduleState.notificationCenterFilter);
		});
		renderNotificationCenter();
	}
	function applyNotificationResponse(payload) {
		const notifications = payload && Array.isArray(payload.notifications) ? payload.notifications : [];
		moduleState.notificationItems = notifications;
		moduleState.notificationLoaded = true;
		if (Number.isFinite(Number(payload && payload.unread_count))) {
			setNotificationBadge(Number(payload.unread_count));
		}
		renderNotifications();
	}
	async function loadNotifications(options = {}) {
		if (moduleState.notificationLoading) return;
		if (!hasHeaderSession()) {
			setNotificationBadge(0);
			moduleState.notificationItems = [];
			renderNotifications();
			return;
		}

		moduleState.notificationLoading = true;
		try {
			const payload = await notificationApi(`/api/notifications?limit=${moduleState.NOTIFICATION_LIMIT}`);
			applyNotificationResponse(payload || {});
		} catch (error) {
			if (!options.silent) console.warn('Không thể tải thông báo:', error);
		} finally {
			moduleState.notificationLoading = false;
		}
	}
	async function loadNotificationCenter() {
		if (moduleState.notificationCenterLoading) return;
		if (!hasHeaderSession()) {
			moduleState.notificationCenterItems = [];
			renderNotificationCenter();
			return;
		}

		moduleState.notificationCenterLoading = true;
		renderNotificationCenter();
		try {
			const payload = await notificationApi(`/api/notifications?limit=${moduleState.NOTIFICATION_CENTER_LIMIT}`);
			moduleState.notificationCenterItems = payload && Array.isArray(payload.notifications) ? payload.notifications : [];
			if (Number.isFinite(Number(payload && payload.unread_count))) {
				setNotificationBadge(Number(payload.unread_count));
			}
		} catch (error) {
			console.warn('Không thể tải toàn bộ thông báo:', error);
			moduleState.notificationCenterItems = [];
		} finally {
			moduleState.notificationCenterLoading = false;
			renderNotificationCenter();
		}
	}
	function upsertRealtimeNotification(notification) {
		if (!notification || !notification.id) return;
		moduleState.notificationItems = [
			notification,
			...moduleState.notificationItems.filter(item => String(item.id) !== String(notification.id)),
		].slice(0, moduleState.NOTIFICATION_LIMIT);
		moduleState.notificationCenterItems = [
			notification,
			...moduleState.notificationCenterItems.filter(item => String(item.id) !== String(notification.id)),
		].slice(0, moduleState.NOTIFICATION_CENTER_LIMIT);
		moduleState.notificationLoaded = true;
		renderNotifications();
		renderNotificationCenter();
	}
	function updateNotificationFromPayload(notification) {
		if (!notification || !notification.id) return;
		moduleState.notificationItems = moduleState.notificationItems.map(item => (
			String(item.id) === String(notification.id) ? { ...item, ...notification } : item
		));
		moduleState.notificationCenterItems = moduleState.notificationCenterItems.map(item => (
			String(item.id) === String(notification.id) ? { ...item, ...notification } : item
		));
		renderNotifications();
		renderNotificationCenter();
	}
	async function markNotificationRead(notification) {
		if (!notification || !notification.id || !isUnreadNotification(notification)) return null;
		const payload = await notificationApi(`/api/notifications/${notification.id}/read`, { method: 'POST' });
		if (Number.isFinite(Number(payload.unread_count))) {
			setNotificationBadge(Number(payload.unread_count));
		}
		updateNotificationFromPayload(payload.notification);
		return payload.notification || null;
	}
	async function markAllNotificationsRead(event) {
		if (event) {
			event.preventDefault();
			event.stopPropagation();
		}
		try {
			const payload = await notificationApi('/api/notifications/read-all', { method: 'POST' });
			const readAt = new Date().toISOString();
			moduleState.notificationItems = moduleState.notificationItems.map(item => ({
				...item,
				is_read: true,
				status: 'read',
				read_at: item.read_at || readAt,
			}));
			moduleState.notificationCenterItems = moduleState.notificationCenterItems.map(item => ({
				...item,
				is_read: true,
				status: 'read',
				read_at: item.read_at || readAt,
			}));
			setNotificationBadge(Number(payload.unread_count) || 0);
			renderNotifications();
			renderNotificationCenter();
		} catch (error) {
			console.warn('Không thể đánh dấu tất cả thông báo đã đọc:', error);
		}
	}

	Object.assign(moduleParts, {
		getActiveWorkspaceWindow,
		tryOpenAppointmentModal,
		scheduleAppointmentModalOpen,
		openAppointmentModalFromHeader,
		bindCalendarButton,
		getFullscreenElement,
		isFullscreenSupported,
		updateFullscreenButton,
		toggleFullscreen,
		bindFullscreenButton,
		hasHeaderSession,
		notificationApi,
		notificationElements,
		setNotificationBadge,
		incrementNotificationBadge,
		isUnreadNotification,
		notificationIconClass,
		notificationFeedbackType,
		formatNotificationTime,
		formatNotificationAppointmentTime,
		getNotificationPatientInitials,
		renderNotificationItem,
		renderNotifications,
		getFilteredNotificationCenterItems,
		renderNotificationCenter,
		setNotificationCenterFilter,
		applyNotificationResponse,
		loadNotifications,
		loadNotificationCenter,
		upsertRealtimeNotification,
		updateNotificationFromPayload,
		markNotificationRead,
		markAllNotificationsRead
	});
})(window, document);
