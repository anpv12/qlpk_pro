// app-shell/workspace-tabs.js: phần 1/2 (nạp trước workspace-tabs.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-shell/workspace-tabs'] || (window.QLPKModuleParts['app-shell/workspace-tabs'] = { state: {} });
	const moduleState = moduleParts.state;

	function captureAccess() {
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) {
			const current = owner.snapshot();
			return () => !moduleState.sessionBlocked && current.status === 'authenticated'
				&& owner.snapshot().status === 'authenticated'
				&& owner.snapshot().revision === current.revision;
		}
		const token = localStorage.getItem('qlpk_token');
		const user = localStorage.getItem('qlpk_user');
		return () => !window.QLPKApiTransport?.session && token === localStorage.getItem('qlpk_token')
			&& user === localStorage.getItem('qlpk_user');
	}
	function normalizeLauncherSearchText(value) {
		return window.QLPKSearchNormalization?.normalizeSearchText(value)
			|| String(value || '')
				.normalize('NFKD')
				.toLowerCase()
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/đ/g, 'd')
				.trim();
	}
	function getConfigItems() {
		return (window.QLPKNavigationConfig && Array.isArray(window.QLPKNavigationConfig.items))
			? window.QLPKNavigationConfig.items
			: [];
	}
	function readPermissions() {
		if (window.QLPKApiTransport?.session) return readStoredUser().permissions || [];
		try {
			const raw = localStorage.getItem('qlpk_permissions');
			const permissions = raw ? JSON.parse(raw) : [];
			return Array.isArray(permissions) ? permissions : [];
		} catch (error) {
			return [];
		}
	}
	function readStoredUser() {
		const session = window.QLPKApiTransport?.session;
		if (session) {
			const current = session.owner.snapshot();
			return !moduleState.sessionBlocked && current.status === 'authenticated' ? current.session.user : {};
		}
		try {
			return JSON.parse(localStorage.getItem('qlpk_user') || '{}') || {};
		} catch (error) {
			return {};
		}
	}
	function normalizeRole(role) {
		return String(role || '').replace(/^UserRole\./, '').trim().toLowerCase();
	}
	function workspaceOwnerId() {
		const user = readStoredUser();
		const userId = String(user.id ?? '').trim();
		if (userId) return `user-id:${userId}`;
		const username = String(user.username || '').trim().toLowerCase();
		return username ? `username:${username}` : '';
	}
	function readOwnerValues(storageKey) {
		try {
			const payload = JSON.parse(localStorage.getItem(storageKey) || 'null');
			if (!payload
				|| payload.version !== moduleState.WORKSPACE_STORAGE_VERSION
				|| !payload.owners
				|| typeof payload.owners !== 'object'
				|| Array.isArray(payload.owners)) {
				return {};
			}
			return { ...payload.owners };
		} catch (error) {
			return {};
		}
	}
	function readOwnerValue(storageKey, fallbackValue) {
		const ownerId = workspaceOwnerId();
		if (!ownerId) return fallbackValue;
		const owners = readOwnerValues(storageKey);
		return Object.prototype.hasOwnProperty.call(owners, ownerId) ? owners[ownerId] : fallbackValue;
	}
	function writeOwnerValue(storageKey, value) {
		const ownerId = workspaceOwnerId();
		if (!ownerId) return;
		const owners = readOwnerValues(storageKey);
		owners[ownerId] = value;
		localStorage.setItem(storageKey, JSON.stringify({
			version: moduleState.WORKSPACE_STORAGE_VERSION,
			owners,
		}));
	}
	function removeOwnerValue(storageKey) {
		const ownerId = workspaceOwnerId();
		if (!ownerId) return;
		const owners = readOwnerValues(storageKey);
		if (!Object.prototype.hasOwnProperty.call(owners, ownerId)) return;
		delete owners[ownerId];
		if (Object.keys(owners).length) {
			localStorage.setItem(storageKey, JSON.stringify({
				version: moduleState.WORKSPACE_STORAGE_VERSION,
				owners,
			}));
		} else {
			localStorage.removeItem(storageKey);
		}
	}
	function isAdminUser() {
		return normalizeRole(readStoredUser().role) === 'admin';
	}
	function hasPermission(item) {
		if (window.QLPKApiTransport?.session && !readStoredUser().id) return false;
		if (!item || (!item.permission && !item.permissionAlt)) return true;
		const permissions = readPermissions();
		if (!permissions.length) return isAdminUser();
		return permissions.includes('*')
			|| permissions.includes(item.permission)
			|| (item.permissionAlt && permissions.includes(item.permissionAlt));
	}
	function cloneVisibleItem(item) {
		if (!item) return null;
		if (Array.isArray(item.children) && item.children.length) {
			const children = item.children.map(cloneVisibleItem).filter(Boolean);
			if (!children.length) return null;
			return { ...item, children };
		}
		return hasPermission(item) ? { ...item } : null;
	}
	function visibleItems() {
		return getConfigItems().map(cloneVisibleItem).filter(Boolean);
	}
	function flattenLeaves(items, parent) {
		const leaves = [];
		(items || []).forEach((item) => {
			if (Array.isArray(item.children) && item.children.length) {
				leaves.push(...flattenLeaves(item.children, item));
			} else if (item.href) {
				leaves.push({ ...item, parentLabel: parent && parent.label ? parent.label : '' });
			}
		});
		return leaves;
	}
	function normalizedLabel(value) {
		return String(value || '').trim().toLowerCase();
	}
	function labelMatches(item, label) {
		const itemLabel = normalizedLabel(item && item.label);
		const target = normalizedLabel(label);
		return itemLabel === target || itemLabel.startsWith(target);
	}
	function findItemByLabel(items, label) {
		return (items || []).find(item => labelMatches(item, label));
	}
	function findItemById(items, id) {
		return (items || []).find(item => item && item.id === id);
	}
	function findChildByLabel(parent, label) {
		return findItemByLabel(parent && parent.children ? parent.children : [], label);
	}
	function compactItems(items) {
		return (items || []).filter(Boolean);
	}
	function itemUsageKey(item) {
		if (!item) return '';
		if (item.href) return `href:${normalizeHref(item.href)}`;
		return `group:${item.id || item.label || ''}`;
	}
	function markLauncherItemUsed(item, usedKeys) {
		if (!item || !usedKeys) return;
		usedKeys.add(itemUsageKey(item));
		if (Array.isArray(item.children)) {
			item.children.forEach(child => markLauncherItemUsed(child, usedKeys));
		}
	}
	function buildLauncherRows(items) {
		const clinicalGroup = findItemById(items, 'submenu-quanly-kham');
		const inventoryGroup = findItemById(items, 'submenu-kho-thuoc');
		const adminGroup = findItemById(items, 'submenu-quanly');
		const usedKeys = new Set();

		const rows = [
			{
				modifier: 'operations',
				title: 'Vận hành & khám',
				items: compactItems([
					findItemByLabel(items, 'Trang chủ'),
					findItemByLabel(items, 'Lịch hẹn'),
					findChildByLabel(clinicalGroup, 'Lễ tân'),
					findChildByLabel(clinicalGroup, 'Bác sĩ'),
					findChildByLabel(clinicalGroup, 'Tâm lý gia'),
					findChildByLabel(clinicalGroup, 'Chỉ định'),
					findItemByLabel(items, 'Hóa đơn'),
					findItemByLabel(items, 'Thu chi'),
				]),
			},
			{
				modifier: 'inventory',
				title: 'Cá nhân & kho thuốc',
				items: compactItems([
					findItemByLabel(items, 'Cá nhân'),
					findItemByLabel(items, 'Thống kê thuốc'),
					findItemByLabel(items, 'Quản lý tài liệu'),
					...(inventoryGroup && Array.isArray(inventoryGroup.children) ? inventoryGroup.children : []),
				]),
			},
			{
				modifier: 'admin',
				title: 'Quản trị hệ thống',
				items: adminGroup && Array.isArray(adminGroup.children) ? adminGroup.children : [],
			},
		];

		rows.forEach(row => row.items.forEach(item => markLauncherItemUsed(item, usedKeys)));
		const unplacedItems = flattenLeaves(items).filter(item => !usedKeys.has(itemUsageKey(item)));
		if (unplacedItems.length) {
			const adminRow = rows.find(row => row.modifier === 'admin');
			if (adminRow) {
				adminRow.items = adminRow.items.concat(unplacedItems);
			} else {
				rows.push({ modifier: 'admin', title: 'Quản trị hệ thống', items: unplacedItems });
			}
		}

		return rows.filter(row => row.items.length);
	}
	function normalizeHref(href) {
		if (!href) return '';
		try {
			const url = new URL(href, window.location.origin);
			let path = url.pathname || '/';
			if (path === '/') path = '/index.html';
			url.searchParams.delete('embed');
			const search = url.searchParams.toString();
			return path + (search ? `?${search}` : '');
		} catch (error) {
			return String(href);
		}
	}
	function normalizedPathname(href) {
		const normalized = normalizeHref(href);
		return normalized.split('?')[0] || '/index.html';
	}
	function currentHref() {
		let path = window.location.pathname || '/';
		if (path === '/') path = '/index.html';
		const params = new URLSearchParams(window.location.search || '');
		params.delete('embed');
		const query = params.toString();
		return path + (query ? `?${query}` : '');
	}
	function isHomeHref(href) {
		return normalizedPathname(href || currentHref()) === '/index.html';
	}
	function getWorkspaceAppVersion() {
		return localStorage.getItem('APP_VERSION') || window.APP_VERSION || '';
	}
	function toEmbedHref(href) {
		const url = new URL(normalizeHref(href), window.location.origin);
		url.searchParams.set('embed', '1');
		return url.pathname + url.search;
	}
	function hrefMatchesItem(item, href) {
		if (!item) return false;
		const itemHref = normalizeHref(item.href);
		const normalizedHref = normalizeHref(href);
		if (itemHref === normalizedHref) return true;
		if (!itemHref.includes('?') && normalizedPathname(itemHref) === normalizedPathname(normalizedHref)) return true;
		if (Array.isArray(item.activeMatches)) {
			return item.activeMatches.some((match) => {
				const normalizedMatch = normalizeHref(match);
				return normalizedMatch === normalizedHref
					|| (!normalizedMatch.includes('?') && normalizedPathname(normalizedMatch) === normalizedPathname(normalizedHref));
			});
		}
		return false;
	}
	function currentNavItem() {
		const href = currentHref();
		return flattenLeaves(visibleItems()).find(item => hrefMatchesItem(item, href));
	}
	function configuredNavItem(href) {
		return flattenLeaves(getConfigItems()).find(item => hrefMatchesItem(item, href));
	}
	function preferredLandingItem() {
		const leaves = flattenLeaves(visibleItems());
		const role = normalizeRole(readStoredUser().role);
		const preferredPathByRole = {
			doctor: '/doctor-examination.html',
			psychologist: '/psychologist-examination.html',
			staff: '/receptionist-new.html',
		};
		const preferredPath = preferredPathByRole[role];
		return (preferredPath && leaves.find(item => normalizedPathname(item.href) === preferredPath))
			|| leaves[0]
			|| null;
	}
	function redirectUnauthorizedConfiguredPage() {
		const href = currentHref();
		if (!configuredNavItem(href) || currentNavItem()) return false;
		const landingItem = preferredLandingItem();
		if (!landingItem || normalizeHref(landingItem.href) === normalizeHref(href)) return false;
		window.location.replace(normalizeHref(landingItem.href));
		return true;
	}
	function tabIdForHref(href) {
		return normalizeHref(href).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
	}
	function isRetiredWorkspaceTab(tab) {
		return moduleState.RETIRED_WORKSPACE_PATHS.has(normalizedPathname(tab && tab.href));
	}
	function readTabs() {
		const tabs = readOwnerValue(moduleState.TAB_STORAGE_KEY, []);
		if (!Array.isArray(tabs)) return [];
		return tabs.filter((tab) => {
			if (!tab || !tab.href || !tab.label) return false;
			if (isRetiredWorkspaceTab(tab)) return false;
			const configuredItem = configuredNavItem(tab.href);
			return !configuredItem || hasPermission(configuredItem);
		});
	}
	function saveTabs(tabs) {
		let nextTabs = tabs.filter(tab => tab && tab.href && tab.label && !isRetiredWorkspaceTab(tab));
		if (moduleState.nativeTabId) {
			const nativeTab = nextTabs.find(tab => tab.id === moduleState.nativeTabId);
			const rest = nextTabs.filter(tab => tab.id !== moduleState.nativeTabId).slice(-(moduleState.MAX_TABS - 1));
			nextTabs = nativeTab ? [nativeTab, ...rest] : nextTabs.slice(-moduleState.MAX_TABS);
		} else {
			nextTabs = nextTabs.slice(-moduleState.MAX_TABS);
		}
		writeOwnerValue(moduleState.TAB_STORAGE_KEY, nextTabs);
	}
	function activeTabId() {
		return readOwnerValue(moduleState.ACTIVE_TAB_STORAGE_KEY, '') || moduleState.nativeTabId;
	}
	function setActiveTabId(tabId) {
		if (!tabId) return;
		writeOwnerValue(moduleState.ACTIVE_TAB_STORAGE_KEY, tabId);
	}
	function clearActiveTabId() {
		removeOwnerValue(moduleState.ACTIVE_TAB_STORAGE_KEY);
	}
	function tabFromItem(item, options = {}) {
		return {
			id: tabIdForHref(item.href),
			label: item.label || 'Tab',
			href: normalizeHref(item.href),
			icon: item.icon || 'bi bi-circle',
			parentLabel: item.parentLabel || '',
			mode: options.mode || 'iframe',
		};
	}
	function ensureCurrentTab() {
		if (redirectUnauthorizedConfiguredPage()) return false;
		const item = currentNavItem() || {
			label: document.title || 'Trang hiện tại',
			href: currentHref(),
			icon: 'bi bi-window',
		};
		const previousActiveTabId = activeTabId();
		const nativeTab = tabFromItem(item, { mode: 'native' });
		moduleState.nativeTabId = nativeTab.id;

		const tabs = readTabs().filter(tab => tab.id !== nativeTab.id);
		tabs.unshift(nativeTab);
		saveTabs(tabs);

		const nextTabs = readTabs();
		const shouldRestoreWorkspaceTab = isHomeHref(nativeTab.href)
			&& previousActiveTabId
			&& previousActiveTabId !== nativeTab.id
			&& nextTabs.some(tab => tab.id === previousActiveTabId);

		setActiveTabId(shouldRestoreWorkspaceTab ? previousActiveTabId : nativeTab.id);
		return true;
	}
	function createWorkspaceHost() {
		const headerHost = document.querySelector('.qlpk-app-header-host');
		const mainContent = document.querySelector('.main-content') || document.querySelector('.appointment-fullscreen');
		if (!headerHost || !mainContent) return null;

		let frameHost = document.getElementById('qlpkWorkspaceFrameHost');
		if (!frameHost) {
			frameHost = document.createElement('section');
			frameHost.id = 'qlpkWorkspaceFrameHost';
			frameHost.className = 'qlpk-workspace-frame-host';
			headerHost.insertAdjacentElement('afterend', frameHost);
		}

		let nativePane = document.getElementById('qlpkWorkspaceNativePane');
		if (!nativePane) {
			nativePane = document.createElement('div');
			nativePane.id = 'qlpkWorkspaceNativePane';
			nativePane.className = 'qlpk-workspace-pane qlpk-workspace-pane--native';
			nativePane.dataset.tabId = moduleState.nativeTabId;
			frameHost.appendChild(nativePane);
		}

		Array.from(mainContent.childNodes).forEach((node) => {
			if (node === headerHost || node === frameHost || node === nativePane) return;
			nativePane.appendChild(node);
		});

		nativePane.dataset.tabId = moduleState.nativeTabId;
		return frameHost;
	}
	function updateShellMetrics() {
		const headerHost = document.querySelector('.qlpk-app-header-host');
		if (!headerHost) return;
		document.documentElement.style.setProperty('--qlpk-shell-header-height', `${Math.ceil(headerHost.getBoundingClientRect().height)}px`);
	}
	function watchShellMetrics() {
		updateShellMetrics();
		const headerHost = document.querySelector('.qlpk-app-header-host');
		if (!headerHost || moduleState.resizeObserver || typeof ResizeObserver === 'undefined') return;
		moduleState.resizeObserver = new ResizeObserver(updateShellMetrics);
		moduleState.resizeObserver.observe(headerHost);
	}
	function resubscribeRealtimeRooms() {
		if (!window.QLPKRealtimeClient || typeof window.QLPKRealtimeClient.subscribe !== 'function') return;
		window.setTimeout(() => window.QLPKRealtimeClient.subscribe(), 0);
	}

	Object.assign(moduleParts, {
		captureAccess,
		normalizeLauncherSearchText,
		getConfigItems,
		readPermissions,
		readStoredUser,
		normalizeRole,
		workspaceOwnerId,
		readOwnerValues,
		readOwnerValue,
		writeOwnerValue,
		removeOwnerValue,
		isAdminUser,
		hasPermission,
		cloneVisibleItem,
		visibleItems,
		flattenLeaves,
		normalizedLabel,
		labelMatches,
		findItemByLabel,
		findItemById,
		findChildByLabel,
		compactItems,
		itemUsageKey,
		markLauncherItemUsed,
		buildLauncherRows,
		normalizeHref,
		normalizedPathname,
		currentHref,
		isHomeHref,
		getWorkspaceAppVersion,
		toEmbedHref,
		hrefMatchesItem,
		currentNavItem,
		configuredNavItem,
		preferredLandingItem,
		redirectUnauthorizedConfiguredPage,
		tabIdForHref,
		isRetiredWorkspaceTab,
		readTabs,
		saveTabs,
		activeTabId,
		setActiveTabId,
		clearActiveTabId,
		tabFromItem,
		ensureCurrentTab,
		createWorkspaceHost,
		updateShellMetrics,
		watchShellMetrics,
		resubscribeRealtimeRooms
	});
})(window, document);
