// Admin catalog page with an add modal (form submit), an edit modal (update button), client-side
// search and pagination, delete confirmation and realtime refresh. Pages describe their fields once;
// the same description drives validation, payload, edit prefill and the add-form reset.
//   field: { key, add: 'inputId', edit: 'editInputId', type: 'text'|'trim'|'checkbox',
//            checks: [{ invalid: value => bool, message }], error: { add: 'errId', edit: 'errId' },
//            toPayload: value => value, fromItem: item => value }
import { byId, delegate, el, icon, on, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { QLPKSearchNormalization } from '../shared/search-normalization.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';
import { QLPKPagination } from './clinic-pagination.js';
import { QLPKRealtimePageHooks } from '../realtime-page-hooks.js';

const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const normalize = value => QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
export const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

export function statusBadge(active, onText, offText) {
	return el('span', { class: `badge ${active ? 'qlpk-status--success' : 'qlpk-status--neutral'}` }, active ? onText : offText);
}

export function emptyNote(text) {
	return el('span', { class: 'text-muted' }, text);
}

function readValue(input, type) {
	if (type === 'checkbox') return input.checked;
	return type === 'trim' ? input.value.trim() : input.value;
}

// Validates and reads one form; returns the payload, or null after marking the first invalid field.
function readForm(fields, mode) {
	const values = {};
	for (const field of fields) {
		const input = byId(field[mode]);
		const value = readValue(input, field.type);
		const failed = (field.checks || []).find(check => check.invalid(value));
		if (failed) {
			input.classList.add('is-invalid');
			byId(field.error[mode]).textContent = failed.message;
			return null;
		}
		values[field.key] = value;
	}
	fields.filter(field => field.checks).forEach(field => byId(field[mode]).classList.remove('is-invalid'));
	return Object.fromEntries(fields.map(field => [field.key, field.toPayload ? field.toPayload(values[field.key]) : values[field.key]]));
}

function rowActions(config, id) {
	const button = (kind, label, iconName, extra) => el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft',
		class: `btn btn-sm${extra}`, dataset: { crudAction: kind, crudId: id }, 'aria-label': label, title: label }, icon(iconName));
	return [button('edit', config.labels.edit, 'bi-pencil', ' me-1'), ' ', button('danger', config.labels.remove, 'bi-trash', '')];
}

function createList(config, state) {
	const render = items => {
		const body = byId(config.tableBody);
		if (!items.length) {
			replace(body, el('tr', {}, el('td', { colspan: config.colspan, class: 'text-center text-muted py-4' }, icon('bi-inbox', 'fs-1 d-block mb-2'), config.emptyText)));
			return;
		}
		replace(body, items.map(item => el('tr', {}, config.cells(item).map(cell => el('td', {}, cell)), el('td', {}, rowActions(config, item.id)))));
	};
	const pagination = QLPKPagination.createClient({ render });
	return {
		show: items => pagination.setItems(items),
		async load() {
			try {
				state.items = await requestJson(config.listUrl);
				pagination.setItems(state.items);
				config.onLoaded?.(state.items);
			} catch (error) {
				console.error(`Error loading ${config.logName}:`, error);
				toast('error', config.text.loadFailed);
			}
		},
	};
}

async function send(list, { url, method, data, modalId, done, failed, log }) {
	try {
		await requestJson(url, { method, json: data });
		toast('success', done);
		if (modalId) modal(modalId).hide();
		list.load();
	} catch (error) {
		console.error(log, error);
		toast('error', failed);
	}
}

function bindEditor(config, state, list) {
	const { text, fields } = config;
	on(byId(config.add.form), 'submit', event => {
		event.preventDefault();
		const data = readForm(fields, 'add');
		if (data) send(list, { url: config.listUrl, method: 'POST', data, modalId: config.add.modal, done: text.added, failed: text.addFailed, log: `Error adding ${config.logName}:` });
	});
	on(byId(config.edit.button), 'click', () => {
		const data = readForm(fields, 'edit');
		if (data) send(list, { url: config.itemUrl(byId(config.edit.idInput).value), method: 'PUT', data, modalId: config.edit.modal, done: text.updated, failed: text.updateFailed, log: `Error updating ${config.logName}:` });
	});
	const openEdit = id => {
		const item = state.items.find(entry => entry.id === id);
		if (!item) return;
		byId(config.edit.idInput).value = item.id;
		fields.forEach(field => {
			const value = field.fromItem ? field.fromItem(item) : item[field.key];
			if (field.type === 'checkbox') byId(field.edit).checked = Boolean(value);
			else byId(field.edit).value = value ?? '';
		});
		modal(config.edit.modal).show();
	};
	const remove = async id => {
		if (!await QLPKConfirmationDialog.confirmDelete(text.deleteConfirm)) return;
		send(list, { url: config.itemUrl(id), method: 'DELETE', done: text.deleted, failed: text.deleteFailed, log: `Error deleting ${config.logName}:` });
	};
	delegate(byId(config.tableBody), 'click', '[data-crud-action]', (event, button) => {
		const id = Number(button.dataset.crudId);
		if (button.dataset.crudAction === 'edit') openEdit(id);
		else remove(id);
	});
	on(byId(config.add.modal), 'hidden.bs.modal', () => {
		byId(config.add.form).reset();
		document.querySelectorAll('.is-invalid').forEach(node => node.classList.remove('is-invalid'));
	});
}

export function mountModalCrudPage(config) {
	const state = { items: [] };
	const list = createList(config, state);
	bindEditor(config, state, list);
	on(byId(config.searchInput), 'input', event => {
		const term = normalize(event.target.value);
		list.show(state.items.filter(item => config.searchValues(item).some(value => value && normalize(value).includes(term))));
	});
	QLPKRealtimePageHooks?.register({ types: ['catalog.changed'], filter: config.realtimeFilter, debounceMs: 350, handler(event) {
		config.onRealtime?.(event);
		list.load();
	} });
	list.load();
	return list;
}

// Excel import modal + client-side template: buttons carry data-crud-action="export-template|open-import|import".
export function bindExcelImport({ modalId, fileInput, url, templateRows, templateFile, done, failed, onImported }) {
	const actions = {
		'export-template': () => {
			const workbook = window.XLSX.utils.book_new();
			window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(templateRows), 'Template');
			window.XLSX.writeFile(workbook, templateFile);
		},
		'open-import': () => modal(modalId).show(),
		async import() {
			const input = byId(fileInput);
			const file = input.files[0];
			if (!file) {
				toast('error', 'Vui lòng chọn file để import');
				return;
			}
			const formData = new FormData();
			formData.append('file', file);
			try {
				await requestJson(url, { method: 'POST', body: formData });
				toast('success', done);
				modal(modalId).hide();
				onImported();
				input.value = '';
			} catch (error) {
				console.error('Import error:', error);
				toast('error', failed);
			}
		},
	};
	delegate(document, 'click', '[data-crud-action]', (event, button) => actions[button.dataset.crudAction]?.());
}
