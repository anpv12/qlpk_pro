(function (window) {
	'use strict';

	const ACTION_ICONS = {
		add: 'bi-plus-circle',
		view: 'bi-eye-fill',
		edit: 'bi-pencil-square',
		delete: 'bi-trash3-fill',
		remove: 'bi-x-lg',
		transfer: 'bi-arrow-right-circle-fill',
		download: 'bi-download',
		upload: 'bi-cloud-arrow-up-fill',
		refresh: 'bi-arrow-clockwise',
		save: 'bi-check2-circle',
		cancel: 'bi-x-circle',
		search: 'bi-search',
		warning: 'bi-exclamation-triangle-fill',
		info: 'bi-info-circle-fill',
		success: 'bi-check-circle-fill',
		error: 'bi-x-circle-fill'
	};

	const FEEDBACK_ICONS = {
		success: 'bi-check-circle-fill',
		info: 'bi-info-circle-fill',
		warning: 'bi-exclamation-triangle-fill',
		error: 'bi-x-circle-fill',
		critical: 'bi-exclamation-octagon-fill'
	};

	const SOURCE_ICONS = {
		facebook: 'bi-facebook',
		website: 'bi-globe2',
		referral: 'bi-people-fill',
		medpro: 'bi-heart-pulse-fill',
		walk_in: 'bi-door-open-fill',
		other: 'bi-grid-3x3-gap-fill'
	};

	const FILE_ICONS = {
		pdf: 'bi-file-earmark-pdf-fill',
		word: 'bi-file-earmark-word-fill',
		spreadsheet: 'bi-file-earmark-excel-fill',
		image: 'bi-file-earmark-image-fill',
		text: 'bi-file-earmark-text-fill',
		file: 'bi-file-earmark-fill'
	};

	function escapeHtml(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function getActionIcon(action) {
		return ACTION_ICONS[action] || ACTION_ICONS.info;
	}

	function getFeedbackIcon(type) {
		return FEEDBACK_ICONS[type] || FEEDBACK_ICONS.info;
	}

	function getSourceIcon(source) {
		return SOURCE_ICONS[source] || SOURCE_ICONS.other;
	}

	function getFileIcon(kind) {
		return FILE_ICONS[kind] || FILE_ICONS.file;
	}

	function renderIcon(iconClass, options = {}) {
		const label = options.label ? ` aria-label="${escapeHtml(options.label)}"` : ' aria-hidden="true"';
		const extraClass = options.className ? ` ${escapeHtml(options.className)}` : '';
		return `<i class="bi ${escapeHtml(iconClass)}${extraClass}"${label}></i>`;
	}

	function renderActionIcon(action, options = {}) {
		return renderIcon(getActionIcon(action), options);
	}

	function renderAttributes(attrs = {}) {
		return Object.keys(attrs)
			.filter(key => attrs[key] !== false && attrs[key] != null)
			.map(key => attrs[key] === true
				? ` ${escapeHtml(key)}`
				: ` ${escapeHtml(key)}="${escapeHtml(attrs[key])}"`)
			.join('');
	}

	function renderActionButton(options = {}) {
		const action = options.action || 'view';
		const label = options.label || options.title || action;
		const title = options.title || label;
		const className = options.className ? ` ${escapeHtml(options.className)}` : '';
		const attrs = Object.assign({}, options.attrs || {}, {
			type: options.type || 'button',
			title,
			'aria-label': label
		});
		return `<button class="btn btn-sm qlpk-icon-action qlpk-icon-action--${escapeHtml(action)}${className}"${renderAttributes(attrs)}>${renderActionIcon(action)}</button>`;
	}

	function renderIconTextButton(options = {}) {
		const action = options.action || 'add';
		const label = options.label || options.title || action;
		const title = options.title || label;
		const className = options.className ? ` ${escapeHtml(options.className)}` : '';
		const attrs = Object.assign({}, options.attrs || {}, {
			type: options.type || 'button',
			title
		});
		return `<button class="qlpk-icon-text-button qlpk-icon-text-button--${escapeHtml(action)}${className}"${renderAttributes(attrs)}>${renderActionIcon(action, { className: 'qlpk-button-icon' })}<span>${escapeHtml(label)}</span></button>`;
	}

	function renderFeedbackIcon(type, options = {}) {
		return renderIcon(getFeedbackIcon(type), options);
	}

	function renderSourceIcon(source, options = {}) {
		return renderIcon(getSourceIcon(source), options);
	}

	function renderFileIcon(kind, options = {}) {
		return renderIcon(getFileIcon(kind), options);
	}

	window.QLPKIconSystem = {
		ACTION_ICONS,
		FEEDBACK_ICONS,
		SOURCE_ICONS,
		FILE_ICONS,
		getActionIcon,
		getFeedbackIcon,
		getSourceIcon,
		getFileIcon,
		renderIcon,
		renderActionIcon,
		renderActionButton,
		renderIconTextButton,
		renderFeedbackIcon,
		renderSourceIcon,
		renderFileIcon
	};
})(window);
