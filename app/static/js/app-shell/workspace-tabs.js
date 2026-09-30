// Parts (nạp trước file này): access-and-launcher.js, panes-and-tabs.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-shell/workspace-tabs'] || (window.QLPKModuleParts['app-shell/workspace-tabs'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.TAB_STORAGE_KEY = 'qlpk_workspace_tabs';
	moduleState.ACTIVE_TAB_STORAGE_KEY = 'qlpk_workspace_active_tab';
	moduleState.WORKSPACE_STORAGE_VERSION = 2;
	moduleState.MAX_TABS = 10;
	moduleState.RETIRED_WORKSPACE_PATHS = new Set([
		'/order-catalog.html',
		'/package-management.html',
	]);
	moduleState.initialized = false;
	moduleState.nativeTabId = '';
	moduleState.resizeObserver = null;
	moduleState.activeLauncherGroup = '';
	moduleState.sessionBound = false;
	moduleState.mountedUserId = '';
	moduleState.sessionBlocked = false;

	window.QLPKWorkspaceShell = {
		init: moduleParts.init,
		openTab: moduleParts.openTab,
		openHref: moduleParts.openHref,
		renderTabs: moduleParts.renderTabs,
		renderLauncher: moduleParts.renderLauncher,
		activatePane: moduleParts.activatePane,
		getTabs: moduleParts.readTabs,
	};
})(window);
