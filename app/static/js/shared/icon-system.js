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

const BUTTON_ROLES = {
	add: 'execute', save: 'execute', transfer: 'execute', upload: 'execute',
	view: 'view', search: 'view', info: 'view', edit: 'edit',
	delete: 'danger', remove: 'danger', download: 'neutral',
	refresh: 'neutral', cancel: 'neutral'
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

const SECTION_ICONS = {
	medicine: 'bi-capsule', basic: 'bi-pencil-square', packaging: 'bi-box-seam',
	pricing: 'bi-currency-dollar', warnings: 'bi-exclamation-triangle'
};

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

// Node builders: icons and action buttons are built as elements (data never parsed as HTML).
function createNode(tag, className, attrs = {}) {
	const node = document.createElement(tag);
	node.className = className;
	Object.keys(attrs).forEach(key => {
		if (attrs[key] === false || attrs[key] == null) return;
		node.setAttribute(key, attrs[key] === true ? '' : String(attrs[key]));
	});
	return node;
}

function createIcon(iconClass, options = {}) {
	const extraClass = options.className ? ` ${options.className}` : '';
	return createNode('i', `bi ${iconClass}${extraClass}`, options.label ? { 'aria-label': options.label } : { 'aria-hidden': 'true' });
}

function createActionIcon(action, options = {}) {
	return createIcon(getActionIcon(action), options);
}

function createActionButton(options = {}) {
	const action = options.action || 'view';
	const label = options.label || options.title || action;
	const title = options.title || label;
	const className = options.className ? ` ${options.className}` : '';
	const attrs = Object.assign({}, options.attrs || {}, {
		type: options.type || 'button',
		'data-qlpk-button': options.buttonRole || BUTTON_ROLES[action] || 'neutral',
		'data-qlpk-button-variant': 'soft',
		title,
		'aria-label': label
	});
	const button = createNode('button', `btn btn-sm qlpk-icon-action qlpk-icon-action--${action}${className}`, attrs);
	button.append(createActionIcon(action));
	return button;
}

function createIconTextButton(options = {}) {
	const action = options.action || 'add';
	const label = options.label || options.title || action;
	const title = options.title || label;
	const className = options.className ? ` ${options.className}` : '';
	const attrs = Object.assign({}, options.attrs || {}, {
		type: options.type || 'button',
		'data-qlpk-button': options.buttonRole || BUTTON_ROLES[action] || 'neutral',
		'data-qlpk-button-variant': options.buttonVariant || 'soft',
		title
	});
	const button = createNode('button', `qlpk-icon-text-button qlpk-icon-text-button--${action}${className}`, attrs);
	const text = document.createElement('span');
	text.textContent = label;
	button.append(createActionIcon(action, { className: 'qlpk-button-icon' }), text);
	return button;
}

export const QLPKIconSystem = {
	ACTION_ICONS,
	FEEDBACK_ICONS,
	SOURCE_ICONS,
	FILE_ICONS,
	SECTION_ICONS,
	getActionIcon,
	getFeedbackIcon,
	getSourceIcon,
	getFileIcon,
	createIcon,
	createActionIcon,
	createActionButton,
	createIconTextButton
};
