(function (window, document) {
	'use strict';

	function createIcon(iconClass) {
		const icon = document.createElement('i');
		icon.className = iconClass || 'bi bi-circle';
		icon.setAttribute('aria-hidden', 'true');
		return icon;
	}

	function applyPermissionAttributes(link, item) {
		if (item.permission) {
			link.dataset.permission = item.permission;
		}
		if (item.permissionAlt) {
			link.dataset.permissionAlt = item.permissionAlt;
		}
	}

	function applyActiveMatch(link, item) {
		if (!Array.isArray(item.activeMatches) || item.activeMatches.length === 0) return;
		link.dataset.activeMatch = item.activeMatches.join('|');
	}

	function appendLinkContent(link, item, options) {
		link.appendChild(createIcon(item.icon));
		link.appendChild(document.createTextNode(item.label || ''));

		if (options && options.hasChevron) {
			const chevron = document.createElement('i');
			chevron.className = 'bi bi-chevron-down float-end';
			chevron.setAttribute('aria-hidden', 'true');
			link.appendChild(chevron);
		}
	}

	function createLeafLink(item, className) {
		const link = document.createElement('a');
		link.className = className || 'nav-link';
		link.href = item.href || '#';
		applyPermissionAttributes(link, item);
		applyActiveMatch(link, item);
		appendLinkContent(link, item);
		return link;
	}

	function createParentItem(item) {
		const listItem = document.createElement('li');
		listItem.className = 'nav-item';

		const link = document.createElement('a');
		link.className = 'nav-link';
		link.dataset.bsToggle = 'collapse';
		link.href = `#${item.id}`;
		link.setAttribute('role', 'button');
		link.setAttribute('aria-expanded', 'false');
		link.setAttribute('aria-controls', item.id);
		appendLinkContent(link, item, { hasChevron: true });

		const submenu = document.createElement('div');
		submenu.className = 'collapse submenu';
		submenu.id = item.id;

		(item.children || []).forEach((child) => {
			submenu.appendChild(createLeafLink(child, 'nav-link ps-4'));
		});

		listItem.appendChild(link);
		listItem.appendChild(submenu);
		return listItem;
	}

	function createItem(item) {
		const listItem = document.createElement('li');
		listItem.className = 'nav-item';
		listItem.appendChild(createLeafLink(item));
		return listItem;
	}

	function render(container, items) {
		if (!container) return;

		container.innerHTML = '';
		(items || []).forEach((item) => {
			if (item.children && item.children.length) {
				container.appendChild(createParentItem(item));
			} else {
				container.appendChild(createItem(item));
			}
		});
	}

	window.QLPKSidebarRenderer = {
		render,
	};
})(window, document);
