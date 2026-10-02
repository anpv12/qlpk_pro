(function (window, document) {
	'use strict';

	const SIDEBAR_CONTAINER_ID = 'sidebar-container';
	// ES module entries (their parts are imports).
	const APP_HEADER_LOADER_PATH = '/static/js/app-header-loader.js';
	const APP_HEADER_STYLESHEET_PATH = '/static/css/components/app-header.css';
	const APP_HEADER_STYLESHEET_ID = 'qlpk-app-header-style';
	const SHORTCUT_MANAGER_PATH = '/static/js/shortcut-manager.js';

	function getAppVersion() {
		return window.APP_VERSION || localStorage.getItem('APP_VERSION') || Date.now();
	}

	function isEmbeddedWorkspacePage() {
		try {
			return window.self !== window.top || new URLSearchParams(window.location.search).get('embed') === '1';
		} catch (error) {
			return new URLSearchParams(window.location.search).get('embed') === '1';
		}
	}

	// Same URL as a page's own module tag, so a module the page already loaded is not evaluated twice.
	function ensureModuleLoaded(path, isReady) {
		if (typeof isReady === 'function' && isReady()) return Promise.resolve();
		return import(`${path}?v=${getAppVersion()}`).catch(() => {});
	}

	function ensureShellStylesheet() {
		let link = document.getElementById(APP_HEADER_STYLESHEET_ID);
		if (!link) {
			link = document.createElement('link');
			link.id = APP_HEADER_STYLESHEET_ID;
			link.rel = 'stylesheet';
			document.head.appendChild(link);
		}
		link.href = `${APP_HEADER_STYLESHEET_PATH}?v=${getAppVersion()}`;
	}

	function applyWorkspaceShellLayout() {
		document.body.classList.add(isEmbeddedWorkspacePage() ? 'qlpk-embedded-page' : 'qlpk-workspace-shell');

		const sidebarContainer = document.getElementById(SIDEBAR_CONTAINER_ID);
		if (sidebarContainer) {
			sidebarContainer.replaceChildren();
			sidebarContainer.classList.add('qlpk-shell-sidebar-disabled');
			sidebarContainer.classList.remove('col-md-2', 'col-md-3', 'col-lg-2', 'col-lg-3');
		}

		const mainContent = document.querySelector('.main-content');
		if (mainContent) {
			mainContent.classList.add('qlpk-workspace-main', 'expanded');
			mainContent.classList.remove('col-md-9', 'col-md-10', 'col-lg-10');
		}
	}

	function applyEmbeddedPageLayout() {
		applyWorkspaceShellLayout();
		if (typeof window.checkPermissions === 'function') {
			window.checkPermissions();
		}
	}

	function ensureAppHeaderLoader() {
		if (window.QLPKAppHeader && typeof window.QLPKAppHeader.reload === 'function') {
			window.QLPKAppHeader.reload();
			return Promise.resolve();
		}

		return ensureModuleLoaded(
			APP_HEADER_LOADER_PATH,
			() => !!(window.QLPKAppHeader && typeof window.QLPKAppHeader.reload === 'function')
		);
	}

	function ensureShortcutManagerLoaded() {
		return ensureModuleLoaded(SHORTCUT_MANAGER_PATH, () => !!window.ShortcutManager);
	}

	async function initializeWorkspaceShell() {
		await ensureShortcutManagerLoaded();
		if (window.ShortcutManager && typeof window.ShortcutManager.initGlobal === 'function') {
			window.ShortcutManager.initGlobal();
		}

		if (typeof window.checkPermissions === 'function') {
			window.checkPermissions();
		}
	}

	function loadSidebar() {
		ensureShellStylesheet();

		if (isEmbeddedWorkspacePage()) {
			applyEmbeddedPageLayout();
			return;
		}

		applyWorkspaceShellLayout();
		ensureAppHeaderLoader()
			.then(initializeWorkspaceShell)
			// A header/shortcut load failure leaves the page itself usable.
			.catch(() => {});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadSidebar);
	} else {
		loadSidebar();
	}

})(window, document);
