(function (window, document) {
	'use strict';

	const TAB_STORAGE_KEY = 'qlpk_workspace_tabs';
	const ACTIVE_TAB_STORAGE_KEY = 'qlpk_workspace_active_tab';
	const WORKSPACE_STORAGE_VERSION = 2;
	const MAX_TABS = 10;
	const RETIRED_WORKSPACE_PATHS = new Set([
		'/order-catalog.html',
		'/package-management.html',
	]);
	let initialized = false;
	let nativeTabId = '';
	let resizeObserver = null;
	let activeLauncherGroup = '';
	let sessionBound = false;
	let mountedUserId = '';
	let sessionBlocked = false;

	function captureAccess() {
		const owner = window.QLPKApiTransport?.session?.owner;
		if (owner) {
			const current = owner.snapshot();
			return () => !sessionBlocked && current.status === 'authenticated'
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
			return !sessionBlocked && current.status === 'authenticated' ? current.session.user : {};
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
				|| payload.version !== WORKSPACE_STORAGE_VERSION
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
			version: WORKSPACE_STORAGE_VERSION,
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
				version: WORKSPACE_STORAGE_VERSION,
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
		return RETIRED_WORKSPACE_PATHS.has(normalizedPathname(tab && tab.href));
	}

	function readTabs() {
		const tabs = readOwnerValue(TAB_STORAGE_KEY, []);
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
		if (nativeTabId) {
			const nativeTab = nextTabs.find(tab => tab.id === nativeTabId);
			const rest = nextTabs.filter(tab => tab.id !== nativeTabId).slice(-(MAX_TABS - 1));
			nextTabs = nativeTab ? [nativeTab, ...rest] : nextTabs.slice(-MAX_TABS);
		} else {
			nextTabs = nextTabs.slice(-MAX_TABS);
		}
		writeOwnerValue(TAB_STORAGE_KEY, nextTabs);
	}

	function activeTabId() {
		return readOwnerValue(ACTIVE_TAB_STORAGE_KEY, '') || nativeTabId;
	}

	function setActiveTabId(tabId) {
		if (!tabId) return;
		writeOwnerValue(ACTIVE_TAB_STORAGE_KEY, tabId);
	}

	function clearActiveTabId() {
		removeOwnerValue(ACTIVE_TAB_STORAGE_KEY);
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
		nativeTabId = nativeTab.id;

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
			nativePane.dataset.tabId = nativeTabId;
			frameHost.appendChild(nativePane);
		}

		Array.from(mainContent.childNodes).forEach((node) => {
			if (node === headerHost || node === frameHost || node === nativePane) return;
			nativePane.appendChild(node);
		});

		nativePane.dataset.tabId = nativeTabId;
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
		if (!headerHost || resizeObserver || typeof ResizeObserver === 'undefined') return;
		resizeObserver = new ResizeObserver(updateShellMetrics);
		resizeObserver.observe(headerHost);
	}

	function resubscribeRealtimeRooms() {
		if (!window.QLPKRealtimeClient || typeof window.QLPKRealtimeClient.subscribe !== 'function') return;
		window.setTimeout(() => window.QLPKRealtimeClient.subscribe(), 0);
	}

	function ensureIframePane(tab) {
		const frameHost = document.getElementById('qlpkWorkspaceFrameHost') || createWorkspaceHost();
		if (!frameHost || !tab) return null;

		let pane = frameHost.querySelector(`[data-tab-id="${tab.id}"]`);
		const expectedSrc = toEmbedHref(tab.href);
		const appVersion = getWorkspaceAppVersion();
		if (pane) {
			const iframe = pane.querySelector('iframe');
			if (iframe) {
				const currentSrc = iframe.getAttribute('src') || '';
				if (iframe.dataset.appVersion !== appVersion || currentSrc !== expectedSrc) {
					iframe.dataset.appVersion = appVersion;
					iframe.src = expectedSrc;
				}
			}
			return pane;
		}

		pane = document.createElement('div');
		pane.className = 'qlpk-workspace-pane qlpk-workspace-pane--iframe';
		pane.dataset.tabId = tab.id;

		const iframe = document.createElement('iframe');
		iframe.className = 'qlpk-workspace-iframe';
		iframe.src = expectedSrc;
		iframe.title = tab.label || 'Workspace';
		iframe.loading = 'eager';
		iframe.dataset.appVersion = appVersion;
		iframe.setAttribute('data-tab-id', tab.id);
		pane.appendChild(iframe);
		frameHost.appendChild(pane);
		return pane;
	}

	function getWorkspaceWindow(tabId) {
		const frameHost = document.getElementById('qlpkWorkspaceFrameHost');
		const pane = frameHost
			? Array.from(frameHost.querySelectorAll('.qlpk-workspace-pane')).find(item => item.dataset.tabId === tabId)
			: null;
		if (!pane || pane.classList.contains('qlpk-workspace-pane--native')) return pane ? window : null;
		const iframe = pane.querySelector('iframe');
		try {
			return iframe ? iframe.contentWindow : null;
		} catch (error) {
			return null;
		}
	}

	async function requestWorkspaceLeave(tabId, options = {}) {
		const paneWindow = getWorkspaceWindow(tabId);
		const leaveGuard = paneWindow && paneWindow.QLPKDoctorWorkspaceLeaveGuard;
		if (!leaveGuard || typeof leaveGuard.requestLeave !== 'function') return true;
		try {
			return (await leaveGuard.requestLeave({
				reason: options.reason || 'workspace-tab',
				currentTabId: tabId,
				nextTabId: options.nextTabId || ''
			})) !== false;
		} catch (error) {
			return false;
		}
	}

	function requestActiveWorkspaceLeave(nextTabId, reason) {
		const currentTabId = activeTabId();
		if (!currentTabId || currentTabId === nextTabId) return Promise.resolve(true);
		return requestWorkspaceLeave(currentTabId, { reason, nextTabId });
	}

	async function activatePane(tabId, options = {}) {
		const isCurrent = captureAccess();
		if (!isCurrent()) return false;
		const tabs = readTabs();
		const tab = tabs.find(item => item.id === tabId) || tabs[0];
		if (!tab) return false;
		if (!options.skipLeaveGuard) {
			const canLeave = await requestActiveWorkspaceLeave(tab.id, 'switch-workspace-tab');
			if (!canLeave || !isCurrent()) return false;
		}

		const frameHost = document.getElementById('qlpkWorkspaceFrameHost') || createWorkspaceHost();
		if (!frameHost) return false;
		if (tab.mode !== 'native') ensureIframePane(tab);

		frameHost.querySelectorAll('.qlpk-workspace-pane').forEach((pane) => {
			pane.classList.toggle('is-active', pane.dataset.tabId === tab.id);
		});

		const activePane = frameHost.querySelector('.qlpk-workspace-pane.is-active');
		if (!activePane && nativeTabId) {
			frameHost.querySelectorAll('.qlpk-workspace-pane').forEach((pane) => {
				pane.classList.toggle('is-active', pane.dataset.tabId === nativeTabId);
			});
			setActiveTabId(nativeTabId);
			renderTabs();
			resubscribeRealtimeRooms();
			return true;
		}

		setActiveTabId(tab.id);
		renderTabs();
		resubscribeRealtimeRooms();
		return true;
	}

	async function openTab(item) {
		if (!item || !item.href) return false;
		const isCurrent = captureAccess();
		const configuredItem = configuredNavItem(item.href);
		if (!isCurrent() || (configuredItem && !hasPermission(configuredItem))) return false;

		const nextTab = tabFromItem(item);
		if (nextTab.id === nativeTabId) {
			setLauncherOpen(false);
			return activatePane(nativeTabId);
		}
		const canLeave = await requestActiveWorkspaceLeave(nextTab.id, 'open-workspace-tab');
		if (!canLeave || !isCurrent()) return false;

		const tabs = readTabs().filter(tab => normalizeHref(tab.href) !== nextTab.href);
		tabs.push(nextTab);
		saveTabs(tabs);
		setLauncherOpen(false);
		return activatePane(nextTab.id, { skipLeaveGuard: true });
	}

	async function openHref(href, options = {}) {
		if (!href) return false;
		const leaves = flattenLeaves(visibleItems());
		const matched = leaves.find(item => hrefMatchesItem(item, normalizeHref(href)));
		return openTab(matched ? { ...matched, href } : {
			label: options.label || href,
			href,
			icon: options.icon || 'bi bi-window',
		});
	}

	function pickNextTab(tabs, nextTabs, index, tabId, currentActive) {
		const keepActive = tabId === nativeTabId && currentActive !== tabId
			? nextTabs.find(tab => tab.id === currentActive)
			: null;
		return keepActive || nextTabs[index - 1] || nextTabs[index] || nextTabs[nextTabs.length - 1];
	}

	async function confirmCloseTab(tabId, currentActive, next) {
		const nextTabId = next ? next.id : '';
		const canLeave = await requestWorkspaceLeave(tabId, {
			reason: tabId === nativeTabId ? 'close-native-workspace-tab' : 'close-workspace-tab',
			nextTabId,
		});
		if (!canLeave) return false;
		if (tabId !== nativeTabId || !currentActive || currentActive === tabId) return true;
		return requestWorkspaceLeave(currentActive, {
			reason: 'navigate-after-close-native-workspace-tab',
			nextTabId,
		});
	}

	function removeClosedPane(tabId) {
		const pane = document.querySelector(`#qlpkWorkspaceFrameHost [data-tab-id="${tabId}"]`);
		if (pane && pane.id !== 'qlpkWorkspaceNativePane') pane.remove();
	}

	async function closeTab(tabId) {
		const isCurrent = captureAccess();
		if (!isCurrent()) return false;
		const tabs = readTabs();
		if (tabs.length <= 1) return false;
		const index = tabs.findIndex(tab => tab.id === tabId);
		if (index < 0) return false;

		const currentActive = activeTabId();
		const nextTabs = tabs.filter(tab => tab.id !== tabId);
		const next = pickNextTab(tabs, nextTabs, index, tabId, currentActive);
		if (!(await confirmCloseTab(tabId, currentActive, next)) || !isCurrent()) return false;

		saveTabs(nextTabs);
		if (tabId === nativeTabId && next) {
			setActiveTabId(next.id);
			window.location.assign(normalizeHref(next.href));
			return true;
		}

		removeClosedPane(tabId);
		if (currentActive === tabId) {
			if (next) return activatePane(next.id, { skipLeaveGuard: true });
			clearActiveTabId();
			renderTabs();
			return true;
		}

		renderTabs();
		resubscribeRealtimeRooms();
		return true;
	}

	function createIcon(iconClass) {
		const icon = document.createElement('i');
		icon.className = iconClass || 'bi bi-circle';
		icon.setAttribute('aria-hidden', 'true');
		return icon;
	}

	function renderTabs() {
		const container = document.getElementById('qlpkWorkspaceTabs');
		if (!container) return;

		const tabs = readTabs();
		const activeId = activeTabId();
		container.innerHTML = '';

		if (!tabs.length) {
			container.classList.add('qlpk-workspace-tabs--empty');
			return;
		}

		container.classList.remove('qlpk-workspace-tabs--empty');
		tabs.forEach((tab) => {
			const tabButton = document.createElement('button');
			tabButton.type = 'button';
			tabButton.className = 'qlpk-workspace-tab';
			if (tab.id === activeId) tabButton.classList.add('is-active');
			tabButton.dataset.tabHref = tab.href;

			tabButton.appendChild(createIcon(tab.icon));
			const label = document.createElement('span');
			label.textContent = tab.label;
			tabButton.appendChild(label);

			if (tabs.length > 1) {
				const close = document.createElement('span');
				close.className = 'qlpk-workspace-tab__close';
				close.innerHTML = '&times;';
				close.setAttribute('aria-label', `Đóng ${tab.label}`);
				close.addEventListener('click', (event) => {
					event.stopPropagation();
					closeTab(tab.id).catch(() => {});
				});
				tabButton.appendChild(close);
			}

			tabButton.addEventListener('click', () => activatePane(tab.id).catch(() => {}));
			container.appendChild(tabButton);
		});
	}

	function setLauncherOpen(open) {
		const panel = document.getElementById('qlpkAppLauncherPanel');
		const button = document.getElementById('qlpkAppLauncherButton');
		if (!panel || !button) return;

		panel.classList.toggle('is-open', open);
		panel.setAttribute('aria-hidden', open ? 'false' : 'true');
		button.setAttribute('aria-expanded', open ? 'true' : 'false');

		if (open) {
			renderLauncher();
			const search = document.getElementById('qlpkAppLauncherSearch');
			setTimeout(() => search && search.focus(), 30);
		}
	}

	function createLauncherTile(item) {
		const tile = document.createElement('button');
		tile.type = 'button';
		tile.className = 'qlpk-app-launcher__tile';
		tile.appendChild(createIcon(item.icon));

		const label = document.createElement('strong');
		label.textContent = item.label || 'Ứng dụng';
		tile.appendChild(label);

		tile.addEventListener('click', () => {
			if (item.children && item.children.length) {
				const firstChild = item.children[0];
				if (firstChild) openTab({ ...firstChild, parentLabel: item.label }).catch(() => {});
			} else {
				openTab(item).catch(() => {});
			}
		});

		return tile;
	}

	function launcherGroupId(row) {
		return row && row.modifier ? row.modifier : normalizedLabel(row && row.title).replace(/[^a-z0-9]+/g, '-');
	}

	function createLauncherGroup(row, activeId) {
		const groupId = launcherGroupId(row);
		const group = document.createElement('section');
		group.className = `qlpk-app-launcher__group qlpk-app-launcher__group--${row.modifier}`;
		if (groupId === activeId) group.classList.add('is-active');
		group.dataset.launcherGroup = groupId;
		group.setAttribute('aria-label', row.title || 'Nhóm chức năng');

		const title = document.createElement('div');
		title.className = 'qlpk-app-launcher__group-title';
		title.textContent = row.title || 'Nhóm chức năng';
		group.appendChild(title);

		const rowNode = document.createElement('div');
		rowNode.className = `qlpk-app-launcher__row qlpk-app-launcher__row--${row.modifier}`;
		row.items.forEach((item) => rowNode.appendChild(createLauncherTile(item)));
		group.appendChild(rowNode);
		return group;
	}

	function createLauncherGroupTabs(rows, activeId) {
		const tabs = document.createElement('div');
		tabs.className = 'qlpk-app-launcher__tabs';
		tabs.setAttribute('role', 'tablist');
		rows.forEach((row) => {
			const groupId = launcherGroupId(row);
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `qlpk-app-launcher__tab qlpk-app-launcher__tab--${row.modifier}`;
			if (groupId === activeId) button.classList.add('is-active');
			button.setAttribute('role', 'tab');
			button.setAttribute('aria-selected', groupId === activeId ? 'true' : 'false');
			button.dataset.launcherGroupTab = groupId;
			button.textContent = row.title || 'Nhóm';
			button.addEventListener('click', () => {
				activeLauncherGroup = groupId;
				renderLauncherGrid();
			});
			tabs.appendChild(button);
		});
		return tabs;
	}

	function renderLauncherGrid() {
		const grid = document.getElementById('qlpkAppLauncherGrid');
		if (!grid) return;

		const query = normalizeLauncherSearchText(document.getElementById('qlpkAppLauncherSearch')?.value || '');
		grid.innerHTML = '';
		grid.classList.toggle('is-searching', Boolean(query));

		if (query) {
			flattenLeaves(visibleItems())
				.filter(item => normalizeLauncherSearchText(`${item.parentLabel} ${item.label}`).includes(query))
				.forEach((item) => grid.appendChild(createLauncherTile(item)));
			return;
		}

		const rows = buildLauncherRows(visibleItems());
		const rowIds = rows.map(launcherGroupId);
		if (!activeLauncherGroup || !rowIds.includes(activeLauncherGroup)) {
			activeLauncherGroup = rowIds[0] || '';
		}

		if (rows.length > 1) grid.appendChild(createLauncherGroupTabs(rows, activeLauncherGroup));
		rows.forEach((row) => grid.appendChild(createLauncherGroup(row, activeLauncherGroup)));
	}

	function renderLauncher() {
		renderLauncherGrid();
	}

	function bindLauncher() {
		const button = document.getElementById('qlpkAppLauncherButton');
		const panel = document.getElementById('qlpkAppLauncherPanel');
		const search = document.getElementById('qlpkAppLauncherSearch');
		if (!button || !panel) return;

		button.addEventListener('click', () => setLauncherOpen(!panel.classList.contains('is-open')));
		panel.querySelectorAll('[data-qlpk-launcher-close="1"]').forEach((node) => {
			node.addEventListener('click', () => setLauncherOpen(false));
		});
		if (search) search.addEventListener('input', () => {
			renderLauncherGrid();
		});

		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') setLauncherOpen(false);
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setLauncherOpen(true);
			}
		});
	}

	function bindOpenTabAnchors() {
		document.querySelectorAll('[data-qlpk-open-tab="1"]').forEach((anchor) => {
			anchor.addEventListener('click', (event) => {
				const href = anchor.getAttribute('href');
				if (!href) return;
				event.preventDefault();
				openTab({
					label: anchor.dataset.tabLabel || anchor.textContent.trim() || 'Tab',
					href,
					icon: anchor.dataset.tabIcon || 'bi bi-house-door',
				}).catch(() => {});
			});
		});
	}

	function init() {
		const session = window.QLPKApiTransport?.session;
		if (session && !sessionBound) {
			sessionBound = true;
			session.owner.subscribe(current => {
				if (mountedUserId && current.status === 'authenticated'
					&& String(current.session.user.id) !== mountedUserId) sessionBlocked = true;
				if (mountedUserId && ['changed', 'expired', 'anonymous', 'auth-changing'].includes(current.status)) sessionBlocked = true;
				const permitted = !sessionBlocked && current.status === 'authenticated';
				const host = document.getElementById('qlpkWorkspaceFrameHost');
				if (host) { host.hidden = !permitted; host.inert = !permitted; }
				if (permitted && !initialized) init();
				else if (permitted) { renderTabs(); renderLauncher(); }
				else { renderTabs(); renderLauncher(); setLauncherOpen(false); }
				if (sessionBlocked) window.QLPKUserFeedback?.show('error', 'Phiên đã thay đổi. Vui lòng tải lại trang trước khi tiếp tục.');
			});
			if (['unknown', 'loading'].includes(session.owner.snapshot().status)) {
				void session.owner.ready().catch(() => {});
			}
		}
		if (session) {
			const current = session.owner.snapshot();
			if (sessionBlocked || current.status !== 'authenticated') return;
			mountedUserId = String(current.session.user.id);
		}
		if (!ensureCurrentTab()) return;
		createWorkspaceHost();
		watchShellMetrics();

		if (initialized) {
			renderTabs();
			renderLauncher();
			activatePane(activeTabId()).catch(() => {});
			return;
		}
		initialized = true;
		bindLauncher();
		bindOpenTabAnchors();
		renderTabs();
		activatePane(activeTabId()).catch(() => {});
		resubscribeRealtimeRooms();
	}

	window.QLPKWorkspaceShell = {
		init,
		openTab,
		openHref,
		renderTabs,
		renderLauncher,
		activatePane,
		getTabs: readTabs,
	};
})(window, document);
