(function (window, document) {
	'use strict';

	const instances = new Set();
	let documentBound = false;

	function textValue(value) {
		return value === undefined || value === null ? '' : String(value).trim();
	}

	function getDisplayText(item) {
		const code = textValue(item?.icd_code);
		const name = textValue(item?.disease_name);
		return [code, name].filter(Boolean).join(' - ');
	}

	function getSelectionKey(item, options) {
		if (typeof options.getKey === 'function') return options.getKey(item);
		if (options.selectionKey === 'code') {
			const code = textValue(item?.icd_code).toUpperCase();
			return code || (item?.id == null ? '' : `id:${item.id}`);
		}
		return item?.id == null ? '' : String(item.id);
	}

	function bindDocumentClose() {
		if (documentBound) return;
		document.addEventListener('click', event => {
			instances.forEach(instance => {
				if (!instance.root.contains(event.target)) instance.close({ clearQuery: true });
			});
		});
		documentBound = true;
	}

	class QLPKIcdAutocomplete {
		constructor(root, options = {}) {
			this.root = root;
			this.options = {
				multiple: true,
				selectionKey: 'id',
				limit: 100,
				emptyQueryLimit: 30,
				searchDebounceMs: 180,
				getAuthHeader: null,
				tagClassName: null,
				tagLabel: getDisplayText,
				onChange: null,
				...options
			};
			this.input = root?.querySelector('[data-icd-autocomplete-input]') || root?.querySelector('input[type="text"]');
			this.tags = root?.querySelector('[data-icd-autocomplete-tags]') || root?.querySelector('.selected-icd-tags');
			this.dropdown = root?.querySelector('[data-icd-autocomplete-dropdown]') || root?.querySelector('.dropdown-menu');
			this.list = root?.querySelector('[data-icd-autocomplete-list]') || root?.querySelector('[id$="List"]');
			this.selected = [];
			this.requestRevision = 0;
			this.activeIndex = -1;
			this.isOpen = false;
			this.currentQuery = '';
			this.currentSkip = 0;
			this.currentItems = [];
			this.pagination = null;
			this.loadingMore = false;
			this.refreshTimer = null;
			this.initialized = false;
			this.init();
		}

		init() {
			if (this.initialized || !this.root || !this.input || !this.dropdown || !this.list) return false;
			this.root.classList.add('icd-autocomplete');
			this.input.setAttribute('autocomplete', 'off');
			this.dropdown.hidden = true;
			this.dropdown.classList.remove('appointment-hidden');
			this.input.addEventListener('focus', () => this.open());
			this.input.addEventListener('input', () => this.scheduleRefresh(this.input.value));
			this.input.addEventListener('keydown', event => this.handleKeydown(event));
			this.root.addEventListener('click', event => {
				if (event.target.closest('.icd-autocomplete__remove, [data-icd-option]')) return;
				this.open();
				this.input.focus();
			});
			instances.add(this);
			bindDocumentClose();
			this.initialized = true;
			this.renderSelected();
			return true;
		}

		async loadOptions(query, skip = 0) {
			const loader = window.ClinicalIcdDataLoader?.loadICDPage;
			if (typeof loader !== 'function') return { data: [], pagination: null };
			const trimmedQuery = textValue(query);
			const limit = trimmedQuery || this.options.emptyQueryLimit === undefined
				? this.options.limit
				: this.options.emptyQueryLimit;
			return loader(trimmedQuery, {
				getAuthHeader: this.options.getAuthHeader,
				limit,
				skip,
				missingTokenMessage: this.options.missingTokenMessage || 'Không tìm thấy token để tải danh mục ICD.'
			});
		}

		closeSiblings() {
			instances.forEach(instance => {
				if (instance !== this) instance.close({ clearQuery: false });
			});
		}

		async open() {
			if (!this.initialized) return;
			this.closeSiblings();
			this.isOpen = true;
			this.dropdown.hidden = false;
			this.dropdown.classList.add('show');
			await this.refresh(this.input.value);
		}

		scheduleRefresh(query = '') {
			if (this.refreshTimer) clearTimeout(this.refreshTimer);
			const delay = Math.max(0, Number(this.options.searchDebounceMs) || 0);
			if (!delay) {
				this.refresh(query);
				return;
			}
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null;
				this.refresh(query);
			}, delay);
		}

		close({ clearQuery = true } = {}) {
			if (this.refreshTimer) {
				clearTimeout(this.refreshTimer);
				this.refreshTimer = null;
			}
			this.requestRevision += 1;
			this.isOpen = false;
			this.loadingMore = false;
			this.currentQuery = '';
			this.currentSkip = 0;
			this.currentItems = [];
			this.pagination = null;
			this.activeIndex = -1;
			this.dropdown.hidden = true;
			this.dropdown.classList.remove('show');
			if (clearQuery && this.input) this.input.value = '';
		}

		async refresh(query = '') {
			if (!this.initialized) return;
			if (this.refreshTimer) {
				clearTimeout(this.refreshTimer);
				this.refreshTimer = null;
			}
			this.closeSiblings();
			this.isOpen = true;
			this.dropdown.hidden = false;
			this.dropdown.classList.add('show');
			const revision = ++this.requestRevision;
			this.currentQuery = textValue(query);
			this.currentSkip = 0;
			this.currentItems = [];
			this.pagination = null;
			this.loadingMore = false;
			this.activeIndex = -1;
			this.renderMessage('Đang tải...', 'loading');
			const page = await this.loadOptions(this.currentQuery, 0);
			if (revision !== this.requestRevision || !this.isOpen) return;
			const items = Array.isArray(page?.data) ? page.data : [];
			this.currentItems = items.slice();
			this.pagination = page?.pagination || null;
			this.renderOptions(items);
		}

		async loadMore() {
			if (!this.isOpen || this.loadingMore || !this.pagination?.has_next) return false;

			const revision = this.requestRevision;
			const pageSize = Math.max(
				1,
				Number(this.pagination.per_page) || Number(this.options.limit) || 100
			);
			const nextSkip = this.currentSkip + pageSize;
			this.loadingMore = true;
			this.renderLoadMoreControl();
			try {
				const page = await this.loadOptions(this.currentQuery, nextSkip);
				if (revision !== this.requestRevision || !this.isOpen) return false;

				const items = Array.isArray(page?.data) ? page.data : [];
				this.currentItems.push(...items);
				this.currentSkip = nextSkip;
				this.pagination = page?.pagination || {
					...this.pagination,
					has_next: false
				};
				if (!items.length) this.pagination.has_next = false;
				this.renderOptions(items, { append: true });
				return true;
			} finally {
				if (revision === this.requestRevision) {
					this.loadingMore = false;
					this.renderLoadMoreControl();
				}
			}
		}

		renderMessage(message, type) {
			this.list.replaceChildren();
			const element = document.createElement('div');
			element.className = `icd-autocomplete__message icd-autocomplete__message--${type}`;
			element.setAttribute('role', 'status');
			element.textContent = message;
			this.list.appendChild(element);
		}

		createOption(item) {
			const option = document.createElement('button');
			option.type = 'button';
			option.className = 'dropdown-item icd-autocomplete__option';
			option.dataset.icdOption = 'true';
			option.dataset.icdId = item.id == null ? '' : String(item.id);
			option.title = getDisplayText(item);
			option.setAttribute('aria-label', getDisplayText(item));
			if (this.isSelected(item)) option.classList.add('selected');
			const code = document.createElement('span');
			code.className = 'icd-autocomplete__code icd-code';
			code.textContent = textValue(item.icd_code);
			const name = document.createElement('span');
			name.className = 'icd-autocomplete__name icd-name';
			name.textContent = textValue(item.disease_name);
			option.append(code, name);
			option.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				this.select(item);
			});
			return option;
		}

		renderOptions(items, { append = false } = {}) {
			if (!append) this.list.replaceChildren();
			if (!items.length && !append) {
				this.renderMessage(this.input.value.trim() ? 'Không tìm thấy kết quả' : 'Nhập mã ICD hoặc tên bệnh để tìm kiếm', 'empty');
				return;
			}
			items.forEach(item => this.list.appendChild(this.createOption(item)));
			this.renderLoadMoreControl();
		}

		renderLoadMoreControl() {
			this.list.querySelector('.icd-autocomplete__load-more')?.remove();
			if (!this.pagination?.has_next) return;
			const remaining = Math.max(
				0,
				Number(this.pagination.total_count || 0) - this.currentItems.length
			);
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'icd-autocomplete__load-more';
			button.disabled = this.loadingMore;
			button.textContent = this.loadingMore
				? 'Đang tải thêm...'
				: remaining > 0 ? `Tải thêm (${remaining})` : 'Tải thêm';
			button.setAttribute('aria-label', button.textContent);
			button.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				this.loadMore();
			});
			this.list.appendChild(button);
		}

	getOptionElements() {
		return [...this.list.querySelectorAll('[data-icd-option]')];
	}

	updateActiveOption() {
		this.getOptionElements().forEach((option, index) => {
			option.classList.toggle('is-active', index === this.activeIndex);
			option.setAttribute('aria-selected', index === this.activeIndex ? 'true' : 'false');
		});
	}

	handleKeydown(event) {
		const options = this.getOptionElements();
		if (event.key === 'Escape') {
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!options.length) return;
			const delta = event.key === 'ArrowDown' ? 1 : -1;
			this.activeIndex = (this.activeIndex + delta + options.length) % options.length;
			this.updateActiveOption();
			options[this.activeIndex]?.scrollIntoView({ block: 'nearest' });
			return;
		}
		if (event.key === 'Enter' && this.activeIndex >= 0 && options[this.activeIndex]) {
			event.preventDefault();
			options[this.activeIndex].click();
		}
	}

	isSelected(item) {
		const key = getSelectionKey(item, this.options);
		return Boolean(key) && this.selected.some(selected => getSelectionKey(selected, this.options) === key);
	}

		toggle(item) {
			if (!item) return false;
			if (!this.options.multiple) {
				this.selected = [item];
				this.renderSelected();
				this.emitChange('select', item);
				this.input.value = getDisplayText(item);
				this.close({ clearQuery: false });
				return true;
			}
			const key = getSelectionKey(item, this.options);
			if (!key) return false;
			const index = this.selected.findIndex(selected => getSelectionKey(selected, this.options) === key);
			if (index >= 0) {
				this.selected.splice(index, 1);
				this.emitChange('remove', item);
			} else {
				this.selected.push(item);
				this.emitChange('select', item);
			}
			this.input.value = '';
			this.renderSelected();
			this.close();
			this.input.blur();
			return true;
		}

		select(item) {
			if (!item) return false;
			if (!this.options.multiple) return this.toggle(item);

			if (!this.isSelected(item)) {
				this.selected.push(item);
				this.emitChange('select', item);
				this.renderSelected();
			}
			this.input.value = '';
			this.close();
			this.input.blur();
			return true;
		}

	remove(item) {
		const key = getSelectionKey(item, this.options);
		const previous = this.selected.length;
		this.selected = this.selected.filter(selected => getSelectionKey(selected, this.options) !== key);
		if (this.selected.length === previous) return false;
		this.renderSelected();
		this.emitChange('remove', item);
		if (this.isOpen) this.refresh(this.input.value);
		return true;
	}

	renderSelected() {
		if (!this.tags) return;
		this.tags.replaceChildren();
		this.selected.forEach(item => {
			const tag = document.createElement('span');
			const customClass = typeof this.options.tagClassName === 'function' ? this.options.tagClassName(item) : '';
			tag.className = ['icd-autocomplete__tag', customClass].filter(Boolean).join(' ');
			tag.title = getDisplayText(item);
			const label = document.createElement('span');
			label.className = 'icd-autocomplete__tag-label';
			label.textContent = this.options.tagLabel(item);
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'icd-autocomplete__remove remove-tag';
			remove.setAttribute('aria-label', `Xóa ${getDisplayText(item)}`);
			remove.textContent = '×';
			remove.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				this.remove(item);
			});
			tag.append(label, remove);
			this.tags.appendChild(tag);
		});
		this.root.dataset.icdSelectedCount = String(this.selected.length);
	}

	setSelected(items, { silent = true } = {}) {
		const values = Array.isArray(items) ? items : [];
		const seen = new Set();
		this.selected = values.filter(item => {
			const key = getSelectionKey(item, this.options);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		this.renderSelected();
		if (this.input) {
			this.input.value = this.options.multiple
				? ''
				: this.selected[0] ? getDisplayText(this.selected[0]) : '';
		}
		if (!silent) this.emitChange('set', null);
		return this.getSelected();
	}

	clear({ silent = true } = {}) {
		const hadValues = this.selected.length > 0;
		this.selected = [];
		this.renderSelected();
		this.close();
		if (hadValues && !silent) this.emitChange('clear', null);
	}

	getSelected() {
		return this.selected.slice();
	}

	focus() {
		this.input?.focus();
	}

	emitChange(action, item) {
		if (typeof this.options.onChange !== 'function') return;
		this.options.onChange(this.getSelected(), { action, item, instance: this });
	}

	destroy() {
		this.close();
		instances.delete(this);
	}
	}

	window.QLPKIcdAutocomplete = QLPKIcdAutocomplete;
})(window, document);
