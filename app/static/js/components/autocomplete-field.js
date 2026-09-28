(function (window, document) {
	'use strict';
	if (window.QLPKAutocompleteField) return;
	const instances = new Set();
	let sequence = 0;
	const text = value => value == null ? '' : String(value).trim();

	class QLPKAutocompleteField {
		constructor(root, options = {}) {
			this.root = root;
			this.doc = root.ownerDocument || document;
			this.view = this.doc.defaultView || window;
			this.options = {
				multiple: true, limit: 30, emptyQueryLimit: 30, searchDebounceMs: 180,
				getKey: item => text(item?.id), getLabel: item => text(item?.name),
				getDescription: () => '', isEnabled: () => true,
				loadOptions: async () => ({ data: [], pagination: null }), ...options
			};
			this.input = root.querySelector('[data-autocomplete-input]');
			this.tags = root.querySelector('[data-autocomplete-tags]');
			this.control = root.querySelector('[data-autocomplete-control]');
			this.dropdown = root.querySelector('[data-autocomplete-dropdown]');
			this.list = root.querySelector('[data-autocomplete-list]');
			this.selected = [];
			this.currentItems = [];
			this.currentQuery = '';
			this.currentSkip = 0;
			this.pagination = null;
			this.activeIndex = -1;
			this.isOpen = false;
			this.requestRevision = 0;
			this.loading = false;
			this.loadingMore = false;
			this.refreshTimer = null;
			this.controller = null;
			this.cleanups = [];
			this.initialized = Boolean(this.input && this.tags && this.control && this.dropdown && this.list);
			if (!this.initialized) return;
			this.list.id ||= `autocomplete-list-${++sequence}`;
			this.input.setAttribute('role', 'combobox');
			this.input.setAttribute('aria-autocomplete', 'list');
			this.input.setAttribute('aria-controls', this.list.id);
			this.input.setAttribute('aria-expanded', 'false');
			this.list.setAttribute('role', 'listbox');
			this.list.setAttribute('aria-multiselectable', String(this.options.multiple));
			this.dropdown.setAttribute('popover', 'manual');
			this.dropdown.hidden = true;
			this.listen(this.input, 'focus', () => this.open());
			this.listen(this.input, 'input', event => {
				if (event.isComposing) this.close({ clearQuery: false });
				else this.scheduleRefresh(this.input.value);
			});
			this.listen(this.input, 'compositionend', () => this.scheduleRefresh(this.input.value));
			this.listen(this.input, 'keydown', event => this.handleKeydown(event));
			this.listen(this.control, 'click', event => {
				if (event.target.closest('[data-autocomplete-remove]') || !this.enabled()) return;
				if (this.doc.activeElement !== this.input) this.input.focus();
				else if (!this.isOpen) this.open();
			});
			this.listen(this.dropdown, 'mousedown', event => event.preventDefault());
			this.listen(this.root, 'focusout', event => {
				if (!this.root.contains(event.relatedTarget)) this.close();
			});
			this.listen(this.doc, 'pointerdown', event => {
				if (!this.root.contains(event.target)) this.close();
			});
			this.listen(this.list, 'scroll', () => {
				if (this.list.scrollHeight - this.list.clientHeight - this.list.scrollTop < 48) this.loadMore();
			});
			this.listen(this.doc, 'scroll', event => {
				if (this.isOpen && !this.dropdown.contains(event.target)) this.position();
			}, true);
			this.listen(this.view, 'resize', () => this.position());
			if (this.view.visualViewport) {
				this.listen(this.view.visualViewport, 'resize', () => this.position());
				this.listen(this.view.visualViewport, 'scroll', () => this.position());
			}
			instances.add(this);
			this.renderSelected();
		}

		listen(target, type, callback, options) {
			target.addEventListener(type, callback, options);
			this.cleanups.push(() => target.removeEventListener(type, callback, options));
		}

		enabled() {
			return this.initialized && !this.input.disabled && !this.input.readOnly
				&& !this.root.closest('[data-history-view="true"], [aria-readonly="true"], fieldset:disabled')
				&& this.options.isEnabled();
		}

		viewportBox() {
			const viewport = this.view.visualViewport;
			return {
				top: viewport?.offsetTop || 0,
				left: viewport?.offsetLeft || 0,
				width: viewport?.width || this.view.innerWidth,
				height: viewport?.height || this.view.innerHeight
			};
		}

		// The control belongs to its scroll panel; only the popup occupies the top layer.
		isClippedByScrollParent(rect) {
			for (let parent = this.control.parentElement; parent; parent = parent.parentElement) {
				const style = this.view.getComputedStyle(parent);
				if (!/(auto|scroll|hidden|clip)/.test(style.overflowY)) continue;
				const bounds = parent.getBoundingClientRect();
				if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return true;
			}
			return false;
		}

		position() {
			if (!this.isOpen) return;
			if (!this.enabled() || !this.control.getClientRects().length) { this.close(); return; }
			const rect = this.control.getBoundingClientRect();
			const { top, left, width, height } = this.viewportBox();
			if (this.isClippedByScrollParent(rect) || rect.bottom <= top || rect.top >= top + height) { this.close(); return; }
			const rem = parseFloat(this.view.getComputedStyle(this.doc.documentElement).fontSize);
			const gap = rem * 0.25, margin = rem * 0.5;
			const below = Math.max(0, top + height - rect.bottom - gap - margin);
			const above = Math.max(0, rect.top - top - gap - margin);
			const desired = Math.min(rem * 18, height * 0.5);
			const upwards = below < desired && above > below;
			const available = Math.min(desired, upwards ? above : below);
			const popupWidth = Math.min(rect.width, width - margin * 2);
			this.dropdown.dataset.placement = upwards ? 'top' : 'bottom';
			// Viewport coordinates are confined to popup positioning; form sizing stays in CSS.
			this.dropdown.style.setProperty('--autocomplete-left', `${Math.max(left + margin, Math.min(rect.left, left + width - popupWidth - margin))}px`);
			this.dropdown.style.setProperty('--autocomplete-top', `${upwards ? rect.top - gap : rect.bottom + gap}px`);
			this.dropdown.style.setProperty('--autocomplete-width', `${popupWidth}px`);
			this.dropdown.style.setProperty('--autocomplete-height', `${available}px`);
		}

		show() {
			if (!this.enabled() || !this.control.getClientRects().length) return false;
			instances.forEach(instance => { if (instance !== this) instance.close(); });
			if (!this.isOpen) {
				this.isOpen = true;
				this.dropdown.hidden = false;
				this.dropdown.showPopover();
			}
			this.input.setAttribute('aria-expanded', 'true');
			this.position();
			return this.isOpen;
		}

		invalidate() {
			this.requestRevision += 1;
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
			this.controller?.abort();
			this.controller = null;
			this.loading = false;
			this.loadingMore = false;
		}

		close({ clearQuery = true } = {}) {
			this.invalidate();
			if (!this.initialized) return;
			if (this.isOpen) this.dropdown.hidePopover();
			this.isOpen = false;
			this.dropdown.hidden = true;
			this.currentItems = [];
			this.currentQuery = '';
			this.currentSkip = 0;
			this.pagination = null;
			this.activeIndex = -1;
			this.list.replaceChildren();
			this.list.setAttribute('aria-busy', 'false');
			this.input.setAttribute('aria-expanded', 'false');
			this.input.removeAttribute('aria-activedescendant');
			if (clearQuery && this.options.multiple) this.input.value = '';
		}

		open() { return this.isOpen ? Promise.resolve() : this.refresh(this.input.value); }

		scheduleRefresh(query) {
			this.invalidate();
			this.currentItems = [];
			this.pagination = null;
			this.activeIndex = -1;
			this.input.removeAttribute('aria-activedescendant');
			if (!this.show()) return;
			this.renderMessage('Đang tìm…');
			this.refreshTimer = setTimeout(() => this.refresh(query), this.options.searchDebounceMs);
		}

		async refresh(query = '') {
			this.invalidate();
			if (!this.show()) return;
			this.currentQuery = text(query);
			this.currentSkip = 0;
			this.currentItems = [];
			this.pagination = null;
			this.activeIndex = -1;
			this.input.removeAttribute('aria-activedescendant');
			this.list.scrollTop = 0;
			this.renderMessage('Đang tìm…');
			return this.fetchPage(0, false);
		}

		async fetchPage(skip, append) {
			if (!this.enabled() || !this.isOpen || this.loading) return false;
			const revision = this.requestRevision;
			const isCurrent = () => revision === this.requestRevision && this.isOpen && this.enabled();
			this.controller = new AbortController();
			this.loading = true;
			this.loadingMore = append;
			this.list.setAttribute('aria-busy', 'true');
			if (append) this.renderFooter('Đang tải thêm…');
			try {
				const limit = this.currentQuery ? this.options.limit : this.options.emptyQueryLimit;
				const page = await this.options.loadOptions(this.currentQuery, { skip, limit, signal: this.controller.signal });
				if (!isCurrent()) return false;
				const items = Array.isArray(page?.data) ? page.data : [];
				this.currentItems = append ? this.currentItems.concat(items) : items;
				this.currentSkip = skip;
				this.pagination = page?.pagination || null;
				if (!items.length && this.pagination) this.pagination.has_next = false;
				this.renderOptions();
				return true;
			} catch (error) {
				if (!isCurrent() || error.name === 'AbortError') return false;
				if (!append) this.list.replaceChildren();
				this.renderFooter('Chưa tải được gợi ý. Thử lại', () => this.fetchPage(skip, append));
				return false;
			} finally {
				if (revision === this.requestRevision) {
					this.loading = false;
					this.loadingMore = false;
					this.list.setAttribute('aria-busy', 'false');
				}
			}
		}

		loadMore() {
			if (!this.pagination?.has_next) return Promise.resolve(false);
			return this.fetchPage(this.currentSkip + Number(this.pagination.per_page || this.options.limit), true);
		}

		renderMessage(message) { this.list.replaceChildren(); this.renderFooter(message); }

		renderFooter(message, retry) {
			this.list.querySelector('[data-autocomplete-status]')?.remove();
			const element = this.doc.createElement(retry ? 'button' : 'div');
			element.className = 'qlpk-autocomplete__status';
			element.setAttribute('data-autocomplete-status', '');
			if (retry) {
				element.type = 'button';
				element.addEventListener('click', retry);
			} else element.setAttribute('role', 'status');
			element.textContent = message;
			this.list.append(element);
		}

		renderOptions() {
			const scrollTop = this.list.scrollTop;
			this.list.replaceChildren();
			this.currentItems.forEach((item, index) => {
				const option = this.doc.createElement('button');
				option.type = 'button';
				option.tabIndex = -1;
				option.id = `${this.list.id}-option-${index}`;
				option.className = 'qlpk-autocomplete__option';
				option.setAttribute('data-autocomplete-option', '');
				option.setAttribute('role', 'option');
				option.classList.toggle('is-selected', this.isSelected(item));
				const label = text(this.options.getLabel(item));
				const description = text(this.options.getDescription(item));
				option.title = [label, description].filter(Boolean).join('\n');
				const title = this.doc.createElement('div');
				title.className = 'qlpk-autocomplete__option-title';
				title.textContent = label;
				option.append(title);
				if (description) {
					const detail = this.doc.createElement('div');
					detail.className = 'qlpk-autocomplete__option-detail';
					detail.textContent = description;
					option.append(detail);
				}
				option.addEventListener('click', event => { event.preventDefault(); this.select(item); });
				this.list.append(option);
			});
			if (!this.currentItems.length) this.renderFooter(this.options.emptyText || 'Không tìm thấy kết quả. Thử từ khóa khác.');
			else if (this.pagination?.has_next) this.renderFooter('Cuộn để xem thêm');
			this.list.scrollTop = scrollTop;
			this.updateActiveOption();
			this.position();
		}

		getOptionElements() { return Array.from(this.list.querySelectorAll('[data-autocomplete-option]')); }

		updateActiveOption() {
			this.getOptionElements().forEach((option, index) => {
				option.classList.toggle('is-active', index === this.activeIndex);
				option.setAttribute('aria-selected', String(this.isSelected(this.currentItems[index])));
				if (index === this.activeIndex) this.input.setAttribute('aria-activedescendant', option.id);
			});
		}

		handleDismissKey(event) {
			if (event.key === 'Escape' && this.isOpen) { event.preventDefault(); event.stopPropagation(); }
			this.close();
		}

		scrollActiveOptionIntoView() {
			const active = this.getOptionElements()[this.activeIndex];
			if (!active) return;
			if (active.offsetTop < this.list.scrollTop) this.list.scrollTop = active.offsetTop;
			else if (active.offsetTop + active.offsetHeight > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = active.offsetTop + active.offsetHeight - this.list.clientHeight;
		}

		async moveActiveOption(direction) {
			if (!this.isOpen) { await this.open(); return; }
			if (direction > 0 && this.activeIndex === this.currentItems.length - 1 && this.pagination?.has_next) await this.loadMore();
			if (!this.isOpen || !this.currentItems.length) return;
			this.activeIndex = Math.max(0, Math.min(this.currentItems.length - 1, this.activeIndex + direction));
			this.updateActiveOption();
			this.scrollActiveOptionIntoView();
		}

		async handleKeydown(event) {
			if (event.isComposing) return;
			if (event.key === 'Escape' || event.key === 'Tab') { this.handleDismissKey(event); return; }
			if (!this.enabled()) return;
			if (event.key === 'Enter') {
				event.preventDefault();
				if (this.isOpen && this.activeIndex >= 0) this.select(this.currentItems[this.activeIndex]);
				return;
			}
			if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
			event.preventDefault();
			await this.moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
		}

		isSelected(item) { return this.selected.some(value => this.options.getKey(value) === this.options.getKey(item)); }

		select(item) {
			if (!item || !this.enabled() || !this.options.getKey(item)) return false;
			if (!this.isSelected(item)) {
				this.selected = this.options.multiple ? this.selected.concat(item) : [item];
				this.renderSelected();
				this.emitChange('select', item);
			}
			this.close();
			if (!this.options.multiple) this.input.value = this.options.getLabel(item);
			return true;
		}

		toggle(item) { return this.options.multiple && this.isSelected(item) ? this.remove(item) : this.select(item); }

		remove(item) {
			if (!this.enabled()) return false;
			const next = this.selected.filter(value => this.options.getKey(value) !== this.options.getKey(item));
			if (next.length === this.selected.length) return false;
			this.selected = next;
			this.renderSelected();
			this.emitChange('remove', item);
			this.close();
			return true;
		}

		renderSelected() {
			this.tags.replaceChildren();
			if (!this.options.multiple) return;
			this.selected.forEach(item => {
				const tag = this.doc.createElement('div');
				tag.className = ['qlpk-autocomplete__tag', this.options.tagClassName?.(item)].filter(Boolean).join(' ');
				const label = this.doc.createElement('div');
				label.className = 'qlpk-autocomplete__tag-label';
				label.textContent = (this.options.tagLabel || this.options.getLabel)(item);
				const remove = this.doc.createElement('button');
				remove.type = 'button';
				remove.className = 'qlpk-autocomplete__remove';
				remove.setAttribute('data-autocomplete-remove', '');
				remove.setAttribute('aria-label', `Bỏ ${this.options.getLabel(item)}`);
				remove.textContent = '×';
				remove.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); this.remove(item); });
				tag.append(label, remove);
				this.tags.append(tag);
			});
		}

		setSelected(items, { silent = true } = {}) {
			this.close();
			const seen = new Set();
			this.selected = (Array.isArray(items) ? items : []).filter(item => {
				const key = this.options.getKey(item);
				if (!key || seen.has(key)) return false;
				seen.add(key); return true;
			});
			if (!this.options.multiple) this.selected = this.selected.slice(0, 1);
			this.renderSelected();
			this.input.value = !this.options.multiple && this.selected.length ? this.options.getLabel(this.selected[0]) : '';
			if (!silent) this.emitChange('set', null);
			return this.getSelected();
		}

		clear({ silent = true } = {}) {
			const hadValues = this.selected.length > 0;
			this.setSelected([], { silent: true });
			if (hadValues && !silent) this.emitChange('clear', null);
		}
		getSelected() { return this.selected.slice(); }
		focus() { this.input.focus(); }
		emitChange(action, item) { this.options.onChange?.(this.getSelected(), { action, item, instance: this }); }
		destroy() { this.close(); this.cleanups.forEach(cleanup => cleanup()); instances.delete(this); this.initialized = false; }
	}
	window.QLPKAutocompleteField = QLPKAutocompleteField;
})(window, document);
