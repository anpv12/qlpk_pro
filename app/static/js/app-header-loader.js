// Parts (nạp trước file này): assets-and-session.js, global-search.js, header-buttons.js, notifications-and-mount.js
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-header-loader'] || (window.QLPKModuleParts['app-header-loader'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.HEADER_CONTAINER_CLASS = 'qlpk-app-header-host';
	moduleState.HEADER_TEMPLATE_PATH = '/static/templates/app-header/header.html';
	moduleState.TYPOGRAPHY_STYLESHEET_PATH = '/static/css/shared/typography.css';
	moduleState.TYPOGRAPHY_STYLESHEET_ID = 'qlpk-typography-style';
	moduleState.ICON_TOKENS_STYLESHEET_PATH = '/static/css/shared/icon-tokens.css';
	moduleState.ICON_TOKENS_STYLESHEET_ID = 'qlpk-icon-tokens-style';
	moduleState.FEEDBACK_TOKENS_STYLESHEET_PATH = '/static/css/shared/feedback-tokens.css';
	moduleState.FEEDBACK_TOKENS_STYLESHEET_ID = 'qlpk-feedback-tokens-style';
	moduleState.HEADER_STYLESHEET_PATH = '/static/css/components/app-header.css';
	moduleState.HEADER_STYLESHEET_ID = 'qlpk-app-header-style';
	moduleState.ICON_SYSTEM_PATH = '/static/js/shared/icon-system.js';
	moduleState.NAVIGATION_CONFIG_PATH = '/static/js/app-shell/navigation.config.js';
	// Workspace tabs is split: parts first, entry last.
	moduleState.WORKSPACE_TABS_PATHS = ['/static/js/app-shell/workspace-tabs-parts/access-and-launcher.js', '/static/js/app-shell/workspace-tabs-parts/panes-and-tabs.js', '/static/js/app-shell/workspace-tabs.js'];
	moduleState.SOCKET_IO_CLIENT_PATH = '/static/vendor/socket.io/socket.io.min.js';
	moduleState.REALTIME_CLIENT_PATH = '/static/js/realtime-client.js';
	moduleState.APPOINTMENT_PAGE_HREF = 'appointment-management.html';
	moduleState.APPOINTMENT_MODAL_REQUEST_KEY = 'qlpk_open_add_appointment_modal';
	moduleState.NOTIFICATION_LIMIT = 20;
	moduleState.NOTIFICATION_CENTER_LIMIT = 100;
	moduleState.GLOBAL_SEARCH_MIN_LENGTH = 2;
	moduleState.GLOBAL_SEARCH_DEBOUNCE_MS = 220;
	moduleState.PENDING_GLOBAL_SEARCH_ACTION_KEY = 'qlpk_pending_global_search_action';
	moduleState.notificationRealtimeBound = false;
	moduleState.notificationItems = [];
	moduleState.notificationCenterItems = [];
	moduleState.notificationCenterFilter = 'all';
	moduleState.notificationCenterLoading = false;
	moduleState.notificationLoading = false;
	moduleState.notificationLoaded = false;
	moduleState.globalSearchTimer = null;
	moduleState.globalSearchAbortController = null;
	moduleState.globalSearchGroups = [];
	moduleState.globalSearchFlatItems = [];
	moduleState.globalSearchActiveIndex = -1;
	moduleState.globalSearchSelectedPatientId = null;
	moduleState.globalSearchLastQuery = '';

	moduleState.ROLE_LABELS = {
		admin: 'Quản trị viên',
		doctor: 'Bác sĩ',
		staff: 'Lễ tân',
		cashier: 'Thu ngân',
		psychologist: 'Tâm lý gia',
		PSYCHOLOGIST: 'Tâm lý gia',
	};

	moduleState.logoutPending = false;
	moduleState.confirmedLogoutCleanup = null;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', moduleParts.mountHeader);
	} else {
		moduleParts.mountHeader();
	}

	window.QLPKAppHeader = {
		reload: moduleParts.mountHeader,
		logout: moduleParts.logout,
		updateUserUi: moduleParts.updateUserUi,
	};
})(window, document);
