// One CRUD list page for simple name/description catalogs (allergen, active ingredient):
// debounced search, server pagination, add/edit modal, delete confirmation, Excel template/import,
// realtime refresh. The page entry passes its API, field and wording config; markup comes from
// templates/partials/catalog-dictionary-page.html with the same id prefix.
// Shared page runtime (formerly classic script tags), in page order.
import '../shared/confirmation-dialog.js';
import '../app-version-check.js';
import '../sidebar-dry-loader.js';
import './clinic-pagination.js';
import '../realtime-page-hooks.js';
import { byId, debounce, delegate, el, icon, on, replace } from '../shared/dom.js';
import { downloadFile, requestJson } from '../shared/http-json.js';

function toast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

function actionButton(action, id) {
	const edit = action === 'edit';
	return el('button', {
		'data-qlpk-button': edit ? 'edit' : 'danger', 'data-qlpk-button-variant': 'soft',
		class: `btn btn-sm ${edit ? 'text-primary' : 'text-danger'} p-1`,
		dataset: { catalogAction: action, catalogId: id }, title: edit ? 'Sửa' : 'Xóa',
	}, icon(edit ? 'bi-pencil-square' : 'bi-trash3'));
}

function createView(config) {
	const ids = name => byId(`${config.prefix}-${name}`);
	const view = {
		search: ids('search'), body: ids('table-body'), form: ids('form'), id: ids('id'), name: ids('name'),
		desc: ids('desc'), title: ids('modal-title'), importFile: ids('import-file'), total: byId('stat-total'),
		modal: byId(config.modalId),
	};
	view.setTitle = (iconName, text) => replace(view.title, icon(iconName), ` ${text}`);
	view.showModal = () => window.bootstrap.Modal.getOrCreateInstance(view.modal).show();
	view.hideModal = () => window.bootstrap.Modal.getInstance(view.modal)?.hide();
	return view;
}

function renderRows(view, state, config) {
	if (!state.items.length) {
		replace(view.body, el('tr', {}, el('td', { colspan: 4, class: 'text-center text-muted py-4' }, 'Không có dữ liệu')));
		return;
	}
	replace(view.body, state.items.map((item, index) => el('tr', {},
		el('td', {}, (state.page - 1) * state.pageSize + index + 1),
		el('td', { class: 'catalog-dict-name-cell' }, item[config.nameField]),
		el('td', { class: 'text-muted catalog-dict-desc-cell' }, item.mo_ta || ''),
		el('td', { class: 'catalog-dict-action-cell' }, actionButton('edit', item.id), actionButton('delete', item.id)))));
}

function createList(view, state, config, pagination) {
	async function load() {
		const revision = ++state.revision;
		const query = `search=${encodeURIComponent(view.search.value.trim())}&page=${state.page}&limit=${state.pageSize}`;
		try {
			const res = await requestJson(`${config.api}?${query}`);
			if (revision !== state.revision || !res.success) return;
			state.items = res.data;
			state.total = res.total;
			const lastPage = Math.max(1, Math.ceil(state.total / state.pageSize));
			if (state.page > lastPage) {
				state.page = lastPage;
				load();
				return;
			}
			view.total.textContent = String(res.total);
			renderRows(view, state, config);
			pagination.current.update({ page: state.page, pageSize: state.pageSize, total: state.total });
		} catch {
			toast('danger', 'Lỗi khi tải dữ liệu');
		}
	}
	return load;
}

function createEditor(view, state, config, load) {
	const text = config.text;
	function openNew() {
		view.form.reset();
		view.id.value = '';
		view.setTitle(config.addIcon, text.addTitle);
		view.showModal();
	}
	function openEdit(id) {
		const item = state.items.find(entry => entry.id === id);
		if (!item) return;
		view.id.value = item.id;
		view.name.value = item[config.nameField];
		view.desc.value = item.mo_ta ?? '';
		view.setTitle('bi-pencil-square', text.editTitle);
		view.showModal();
	}
	async function save() {
		const id = view.id.value;
		const payload = { [config.nameField]: view.name.value.trim(), mo_ta: view.desc.value.trim() };
		if (!payload[config.nameField]) {
			toast('danger', text.nameRequired);
			return;
		}
		try {
			const res = await requestJson(id ? `${config.api}/${id}` : config.api, { method: id ? 'PUT' : 'POST', json: payload });
			if (!res.success) {
				toast('danger', text.saveRejected);
				return;
			}
			view.hideModal();
			toast('success', 'Lưu thành công');
			load();
		} catch {
			toast('danger', text.saveFailed);
		}
	}
	async function remove(id) {
		if (!await window.QLPKConfirmationDialog.confirmDelete(text.deleteConfirm)) return;
		try {
			const res = await requestJson(`${config.api}/${id}`, { method: 'DELETE' });
			if (res.success) {
				toast('success', 'Đã xóa');
				load();
			} else {
				toast('danger', text.deleteFailed);
			}
		} catch {
			toast('danger', text.deleteFailed);
		}
	}
	return { openNew, openEdit, save, remove };
}

function bindImport(view, config, load) {
	on(byId('btn-download-template'), 'click', () => {
		downloadFile(`${config.api}/template`, config.templateFile).catch(() => toast('danger', 'Có lỗi xảy ra khi tải file mẫu'));
	});
	on(byId('btn-import-excel'), 'click', () => view.importFile.click());
	on(view.importFile, 'change', async () => {
		const file = view.importFile.files && view.importFile.files[0];
		if (!file) return;
		const formData = new FormData();
		formData.append('file', file);
		toast('success', 'Đang xử lý file...');
		try {
			const res = await requestJson(`${config.api}/import`, { method: 'POST', body: formData });
			if (res.success) {
				toast('success', config.text.importDone);
				load();
			} else {
				toast('danger', config.text.importFailed);
			}
		} catch {
			toast('danger', config.text.importFailed);
		}
		view.importFile.value = '';
	});
}

export function mountCatalogDictionaryPage(config) {
	const view = createView(config);
	const state = { items: [], page: 1, pageSize: 10, total: 0, revision: 0 };
	const pagination = { current: null };
	const load = createList(view, state, config, pagination);
	const editor = createEditor(view, state, config, load);
	pagination.current = window.QLPKPagination.create({ onChange(page, size) {
		state.page = page;
		state.pageSize = size;
		load();
	} });
	load();
	on(view.search, 'input', debounce(() => {
		state.page = 1;
		load();
	}, 500));
	on(byId(config.addButtonId), 'click', editor.openNew);
	on(view.form, 'submit', event => {
		event.preventDefault();
		editor.save();
	});
	delegate(view.body, 'click', '[data-catalog-action]', (event, button) => {
		const id = Number(button.dataset.catalogId);
		if (button.dataset.catalogAction === 'edit') editor.openEdit(id);
		else editor.remove(id);
	});
	bindImport(view, config, load);
	window.QLPKRealtimePageHooks?.register({
		types: ['inventory.changed'], debounceMs: 500,
		handler(event) {
			const entity = event && event.payload ? event.payload.entity : null;
			if (!entity || entity === config.entity) load();
		},
	});
}
