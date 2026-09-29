// app-shell/workspace-tabs.js: phần 2/2 (nạp trước workspace-tabs.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['app-shell/workspace-tabs'] || (window.QLPKModuleParts['app-shell/workspace-tabs'] = { state: {} });
	const moduleState = moduleParts.state;

	function ensureIframePane(tab) {
		const frameHost = document.getElementById('qlpkWorkspaceFrameHost') || moduleParts.createWorkspaceHost();
		if (!frameHost || !tab) return null;

		let pane = frameHost.querySelector(`[data-tab-id="${tab.id}"]`);
		const expectedSrc = moduleParts.toEmbedHref(tab.href);
		const appVersion = moduleParts.getWorkspaceAppVersion();
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
		const currentTabId = moduleParts.activeTabId();
		if (!currentTabId || currentTabId === nextTabId) return Promise.resolve(true);
		return requestWorkspaceLeave(currentTabId, { reason, nextTabId });
	}
	async function activatePane(tabId, options = {}) {
		const isCurrent = moduleParts.captureAccess();
		if (!isCurrent()) return false;
		const tabs = moduleParts.readTabs();
		const tab = tabs.find(item => item.id === tabId) || tabs[0];
		if (!tab) return false;
		if (!options.skipLeaveGuard) {
			const canLeave = await requestActiveWorkspaceLeave(tab.id, 'switch-workspace-tab');
			if (!canLeave || !isCurrent()) return false;
		}

		const frameHost = document.getElementById('qlpkWorkspaceFrameHost') || moduleParts.createWorkspaceHost();
		if (!frameHost) return false;
		if (tab.mode !== 'native') ensureIframePane(tab);

		frameHost.querySelectorAll('.qlpk-workspace-pane').forEach((pane) => {
			pane.classList.toggle('is-active', pane.dataset.tabId === tab.id);
		});

		const activePane = frameHost.querySelector('.qlpk-workspace-pane.is-active');
		if (!activePane && moduleState.nativeTabId) {
			frameHost.querySelectorAll('.qlpk-workspace-pane').forEach((pane) => {
				pane.classList.toggle('is-active', pane.dataset.tabId === moduleState.nativeTabId);
			});
			moduleParts.setActiveTabId(moduleState.nativeTabId);
			renderTabs();
			moduleParts.resubscribeRealtimeRooms();
			return true;
		}

		moduleParts.setActiveTabId(tab.id);
		renderTabs();
		moduleParts.resubscribeRealtimeRooms();
		return true;
	}
	async function openTab(item) {
		if (!item || !item.href) return false;
		const isCurrent = moduleParts.captureAccess();
		const configuredItem = moduleParts.configuredNavItem(item.href);
		if (!isCurrent() || (configuredItem && !moduleParts.hasPermission(configuredItem))) return false;

		const nextTab = moduleParts.tabFromItem(item);
		if (nextTab.id === moduleState.nativeTabId) {
			setLauncherOpen(false);
			return activatePane(moduleState.nativeTabId);
		}
		const canLeave = await requestActiveWorkspaceLeave(nextTab.id, 'open-workspace-tab');
		if (!canLeave || !isCurrent()) return false;

		const tabs = moduleParts.readTabs().filter(tab => moduleParts.normalizeHref(tab.href) !== nextTab.href);
		tabs.push(nextTab);
		moduleParts.saveTabs(tabs);
		setLauncherOpen(false);
		return activatePane(nextTab.id, { skipLeaveGuard: true });
	}
	async function openHref(href, options = {}) {
		if (!href) return false;
		const leaves = moduleParts.flattenLeaves(moduleParts.visibleItems());
		const matched = leaves.find(item => moduleParts.hrefMatchesItem(item, moduleParts.normalizeHref(href)));
		return openTab(matched ? { ...matched, href } : {
			label: options.label || href,
			href,
			icon: options.icon || 'bi bi-window',
		});
	}
	function pickNextTab(tabs, nextTabs, index, tabId, currentActive) {
		const keepActive = tabId === moduleState.nativeTabId && currentActive !== tabId
			? nextTabs.find(tab => tab.id === currentActive)
			: null;
		return keepActive || nextTabs[index - 1] || nextTabs[index] || nextTabs[nextTabs.length - 1];
	}
	async function confirmCloseTab(tabId, currentActive, next) {
		const nextTabId = next ? next.id : '';
		const canLeave = await requestWorkspaceLeave(tabId, {
			reason: tabId === moduleState.nativeTabId ? 'close-native-workspace-tab' : 'close-workspace-tab',
			nextTabId,
		});
		if (!canLeave) return false;
		if (tabId !== moduleState.nativeTabId || !currentActive || currentActive === tabId) return true;
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
		const isCurrent = moduleParts.captureAccess();
		if (!isCurrent()) return false;
		const tabs = moduleParts.readTabs();
		if (tabs.length <= 1) return false;
		const index = tabs.findIndex(tab => tab.id === tabId);
		if (index < 0) return false;

		const currentActive = moduleParts.activeTabId();
		const nextTabs = tabs.filter(tab => tab.id !== tabId);
		const next = pickNextTab(tabs, nextTabs, index, tabId, currentActive);
		if (!(await confirmCloseTab(tabId, currentActive, next)) || !isCurrent()) return false;

		moduleParts.saveTabs(nextTabs);
		if (tabId === moduleState.nativeTabId && next) {
			moduleParts.setActiveTabId(next.id);
			window.location.assign(moduleParts.normalizeHref(next.href));
			return true;
		}

		removeClosedPane(tabId);
		if (currentActive === tabId) {
			if (next) return activatePane(next.id, { skipLeaveGuard: true });
			moduleParts.clearActiveTabId();
			renderTabs();
			return true;
		}

		renderTabs();
		moduleParts.resubscribeRealtimeRooms();
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

		const tabs = moduleParts.readTabs();
		const activeId = moduleParts.activeTabId();
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
		return row && row.modifier ? row.modifier : moduleParts.normalizedLabel(row && row.title).replace(/[^a-z0-9]+/g, '-');
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
				moduleState.activeLauncherGroup = groupId;
				renderLauncherGrid();
			});
			tabs.appendChild(button);
		});
		return tabs;
	}
	function renderLauncherGrid() {
		const grid = document.getElementById('qlpkAppLauncherGrid');
		if (!grid) return;

		const query = moduleParts.normalizeLauncherSearchText(document.getElementById('qlpkAppLauncherSearch')?.value || '');
		grid.innerHTML = '';
		grid.classList.toggle('is-searching', Boolean(query));

		if (query) {
			moduleParts.flattenLeaves(moduleParts.visibleItems())
				.filter(item => moduleParts.normalizeLauncherSearchText(`${item.parentLabel} ${item.label}`).includes(query))
				.forEach((item) => grid.appendChild(createLauncherTile(item)));
			return;
		}

		const rows = moduleParts.buildLauncherRows(moduleParts.visibleItems());
		const rowIds = rows.map(launcherGroupId);
		if (!moduleState.activeLauncherGroup || !rowIds.includes(moduleState.activeLauncherGroup)) {
			moduleState.activeLauncherGroup = rowIds[0] || '';
		}

		if (rows.length > 1) grid.appendChild(createLauncherGroupTabs(rows, moduleState.activeLauncherGroup));
		rows.forEach((row) => grid.appendChild(createLauncherGroup(row, moduleState.activeLauncherGroup)));
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
		if (session && !moduleState.sessionBound) {
			moduleState.sessionBound = true;
			session.owner.subscribe(current => {
				if (moduleState.mountedUserId && current.status === 'authenticated'
					&& String(current.session.user.id) !== moduleState.mountedUserId) moduleState.sessionBlocked = true;
				if (moduleState.mountedUserId && ['changed', 'expired', 'anonymous', 'auth-changing'].includes(current.status)) moduleState.sessionBlocked = true;
				const permitted = !moduleState.sessionBlocked && current.status === 'authenticated';
				const host = document.getElementById('qlpkWorkspaceFrameHost');
				if (host) { host.hidden = !permitted; host.inert = !permitted; }
				if (permitted && !moduleState.initialized) init();
				else if (permitted) { renderTabs(); renderLauncher(); }
				else { renderTabs(); renderLauncher(); setLauncherOpen(false); }
				if (moduleState.sessionBlocked) window.QLPKUserFeedback?.show('error', 'Phiên đã thay đổi. Vui lòng tải lại trang trước khi tiếp tục.');
			});
			if (['unknown', 'loading'].includes(session.owner.snapshot().status)) {
				void session.owner.ready().catch(() => {});
			}
		}
		if (session) {
			const current = session.owner.snapshot();
			if (moduleState.sessionBlocked || current.status !== 'authenticated') return;
			moduleState.mountedUserId = String(current.session.user.id);
		}
		if (!moduleParts.ensureCurrentTab()) return;
		moduleParts.createWorkspaceHost();
		moduleParts.watchShellMetrics();

		if (moduleState.initialized) {
			renderTabs();
			renderLauncher();
			activatePane(moduleParts.activeTabId()).catch(() => {});
			return;
		}
		moduleState.initialized = true;
		bindLauncher();
		bindOpenTabAnchors();
		renderTabs();
		activatePane(moduleParts.activeTabId()).catch(() => {});
		moduleParts.resubscribeRealtimeRooms();
	}

	Object.assign(moduleParts, {
		ensureIframePane,
		getWorkspaceWindow,
		requestWorkspaceLeave,
		requestActiveWorkspaceLeave,
		activatePane,
		openTab,
		openHref,
		pickNextTab,
		confirmCloseTab,
		removeClosedPane,
		closeTab,
		createIcon,
		renderTabs,
		setLauncherOpen,
		createLauncherTile,
		launcherGroupId,
		createLauncherGroup,
		createLauncherGroupTabs,
		renderLauncherGrid,
		renderLauncher,
		bindLauncher,
		bindOpenTabAnchors,
		init
	});
})(window, document);
