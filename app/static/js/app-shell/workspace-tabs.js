import { moduleState } from './workspace-tabs-parts/state.js';
import { activatePane, init, openHref, openTab, renderLauncher, renderTabs } from './workspace-tabs-parts/panes-and-tabs.js';
import { readTabs } from './workspace-tabs-parts/access-and-launcher.js';

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
	init: init,
	openTab: openTab,
	openHref: openHref,
	renderTabs: renderTabs,
	renderLauncher: renderLauncher,
	activatePane: activatePane,
	getTabs: readTabs,
};
