import { moduleState } from './shortcut-manager-parts/state.js';
import { initGlobal, refreshShortcuts } from './shortcut-manager-parts/session-and-keys.js';
import { attachSettingsPage } from './shortcut-manager-parts/settings-page.js';

moduleState.shortcuts = [];
moduleState.currentRows = [];
moduleState.isGlobalBound = false;
moduleState.isSettingsBound = false;
moduleState.isRealtimeBound = false;
moduleState.realtimeRefreshTimer = null;
moduleState.settingsReloadTable = null;
moduleState.userNameById = {};
moduleState.sessionBound = false;
moduleState.shortcutRevision = 0;
moduleState.shortcutsCurrent = () => false;
moduleState.settingsCurrent = null;

moduleState.ROUTE_OPTIONS = [
	{ label: 'Trang chủ', url: '/index.html' },
	{ label: 'Lễ tân', url: '/receptionist-new.html' },
	{ label: 'Lịch hẹn', url: '/appointment-management.html' },
	{ label: 'Bác sĩ khám', url: '/doctor-examination.html' },
	{ label: 'Tâm lý gia khám', url: '/psychologist-examination.html' },
	{ label: 'Hóa đơn', url: '/payment-waiting.html' },
	{ label: 'Chỉ định CLS', url: '/order-management.html' },
	{ label: 'Quản lý thuốc', url: '/medicine-management.html' },
	{ label: 'Kho thuốc', url: '/medicine-statistics' },
	{ label: 'Phân quyền', url: '/permission-management.html' },
	{ label: 'Quản lý nhóm quyền', url: '/group-management.html' },
	{ label: 'Quản lý người dùng', url: '/user-management.html' },
	{ label: 'Dịch vụ', url: '/service-management.html' },
	{ label: 'Cấu hình phím tắt', url: '/shortcut-settings.html' }
];

moduleState.ALLOWED_NAV_URLS = new Set(moduleState.ROUTE_OPTIONS.map(r => r.url));
moduleState.ROUTE_LABEL_BY_URL = moduleState.ROUTE_OPTIONS.reduce((acc, cur) => {
	acc[cur.url] = cur.label;
	return acc;
}, {});

window.ShortcutManager = {
	initGlobal: initGlobal,
	attachSettingsPage: attachSettingsPage,
	refreshShortcuts: refreshShortcuts
};

document.addEventListener('DOMContentLoaded', async function () {
	if (!document.getElementById('shortcutSettingsPage')) return;
	await initGlobal();
	await attachSettingsPage();
});
