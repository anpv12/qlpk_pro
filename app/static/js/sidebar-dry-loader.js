(function (window, document) {
	'use strict';

	const SIDEBAR_CONTAINER_ID = 'sidebar-container';
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

	function ensureScriptLoaded(path, dataAttribute, isReady) {
		return new Promise((resolve) => {
			if (typeof isReady === 'function' && isReady()) {
				resolve();
				return;
			}

			const existing = document.querySelector(`script[data-${dataAttribute}="1"]`);
			if (existing) {
				let resolved = false;
				const finish = () => {
					if (resolved) return;
					resolved = true;
					resolve();
				};
				existing.addEventListener('load', finish, { once: true });
				existing.addEventListener('error', finish, { once: true });
				let attempts = 0;
				const timer = setInterval(() => {
					attempts += 1;
					if ((typeof isReady === 'function' && isReady()) || attempts >= 20) {
						clearInterval(timer);
						finish();
					}
				}, 50);
				return;
			}

			const script = document.createElement('script');
			script.src = `${path}?v=${getAppVersion()}`;
			script.async = true;
			script.setAttribute(`data-${dataAttribute}`, '1');
			script.onload = () => resolve();
			script.onerror = () => resolve();
			document.head.appendChild(script);
		});
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
			sidebarContainer.innerHTML = '';
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
		triggerCompatibilityEvents();
	}

	function ensureAppHeaderLoader() {
		if (window.QLPKAppHeader && typeof window.QLPKAppHeader.reload === 'function') {
			window.QLPKAppHeader.reload();
			return Promise.resolve();
		}

		return ensureScriptLoaded(
			APP_HEADER_LOADER_PATH,
			'app-header-loader',
			() => !!(window.QLPKAppHeader && typeof window.QLPKAppHeader.reload === 'function')
		);
	}

	function ensureShortcutManagerLoaded() {
		return ensureScriptLoaded(
			SHORTCUT_MANAGER_PATH,
			'shortcut-manager',
			() => !!window.ShortcutManager
		);
	}

	function triggerCompatibilityEvents() {
		if (!window.jQuery) return;
		window.jQuery(document).trigger('sidebarLoaded');
		window.jQuery(document).trigger('workspaceShellLoaded');
	}

	async function initializeWorkspaceShell() {
		await ensureShortcutManagerLoaded();
		if (window.ShortcutManager && typeof window.ShortcutManager.initGlobal === 'function') {
			window.ShortcutManager.initGlobal();
		}

		if (typeof window.checkPermissions === 'function') {
			window.checkPermissions();
		}
		triggerCompatibilityEvents();
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
			.catch(() => triggerCompatibilityEvents());
	}

	function refreshActiveState() {
		if (window.QLPKWorkspaceShell && typeof window.QLPKWorkspaceShell.renderTabs === 'function') {
			window.QLPKWorkspaceShell.renderTabs();
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadSidebar);
	} else {
		loadSidebar();
	}

	window.SidebarDryLoader = {
		reload: loadSidebar,
		setActiveMenu: refreshActiveState,
	};
})(window, document);
