(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const { escapeHtml, escapeAttr, formatCurrency } = REGISTRY.require('supportRuntime');
	const { normalizePrescriptionType } = REGISTRY.require('prescriptionModel');

	const DROPDOWN_ID = 'doctorMedicineDropdown';
	const OPTION_SELECTOR = '[data-medicine-select]';

	function create(options = {}) {
		const { requestJson, getEndpoint, getDocument, isRowCurrent } = options;
		if (typeof requestJson !== 'function' || typeof getEndpoint !== 'function'
			|| typeof getDocument !== 'function' || typeof isRowCurrent !== 'function') {
			throw new Error('Thiếu dependency cho ô tìm thuốc');
		}
		const state = { timer: null, token: 0, options: new Map(), input: null, activeIndex: -1 };

		function getDropdown(doc) {
			let dropdown = doc.getElementById(DROPDOWN_ID);
			if (dropdown) return dropdown;
			dropdown = doc.createElement('div');
			dropdown.id = DROPDOWN_ID;
			dropdown.className = 'doctor-support-dropdown doctor-support-dropdown--floating';
			dropdown.dataset.prescriptionDropdown = 'true';
			dropdown.setAttribute('role', 'listbox');
			dropdown.hidden = true;
			(doc.body || doc.documentElement).appendChild(dropdown);
			return dropdown;
		}

		function setInputState(input, expanded) {
			if (!input) return;
			input.setAttribute('aria-expanded', String(Boolean(expanded)));
			if (expanded) input.setAttribute('aria-controls', DROPDOWN_ID);
			else input.removeAttribute('aria-activedescendant');
		}

		function position(doc) {
			const dropdown = getDropdown(doc);
			const input = state.input;
			if (!input || dropdown.hidden || !input.isConnected) return;
			const view = doc.defaultView || window;
			const rect = input.getBoundingClientRect();
			const edge = 8;
			const gap = 4;
			const availableBelow = Math.max(0, view.innerHeight - rect.bottom - edge - gap);
			const availableAbove = Math.max(0, rect.top - edge - gap);
			const openAbove = availableBelow < 240 && availableAbove > availableBelow;
			const maxWidth = Math.max(260, view.innerWidth - (edge * 2));
			const width = Math.min(Math.max(rect.width, 320), maxWidth);
			const maxHeight = Math.max(96, Math.min(320, openAbove ? availableAbove : availableBelow));

			dropdown.style.width = `${width}px`;
			dropdown.style.maxHeight = `${maxHeight}px`;
			dropdown.style.left = `${Math.min(Math.max(edge, rect.left), Math.max(edge, view.innerWidth - width - edge))}px`;
			dropdown.style.top = openAbove
				? `${Math.max(edge, rect.top - Math.min(dropdown.offsetHeight || maxHeight, maxHeight) - gap)}px`
				: `${Math.min(view.innerHeight - edge - Math.min(dropdown.offsetHeight || maxHeight, maxHeight), rect.bottom + gap)}px`;
			dropdown.dataset.placement = openAbove ? 'above' : 'below';
		}

		function hide(doc) {
			const dropdown = getDropdown(doc);
			if (state.timer) window.clearTimeout(state.timer);
			state.timer = null;
			state.token += 1;
			dropdown.hidden = true;
			dropdown.innerHTML = '';
			state.input?.removeAttribute('aria-busy');
			setInputState(state.input, false);
			state.input = null;
			state.activeIndex = -1;
		}

		function reset(doc) {
			state.options.clear();
			hide(doc);
		}

		function setActive(doc, index) {
			const dropdown = getDropdown(doc);
			const optionElements = Array.from(dropdown.querySelectorAll(OPTION_SELECTOR));
			if (!optionElements.length) return;
			state.activeIndex = Math.max(0, Math.min(index, optionElements.length - 1));
			optionElements.forEach((option, optionIndex) => {
				const active = optionIndex === state.activeIndex;
				option.classList.toggle('is-active', active);
				option.setAttribute('aria-selected', String(active));
			});
			const activeOption = optionElements[state.activeIndex];
			if (activeOption) {
				setInputState(state.input, true);
				state.input?.setAttribute('aria-activedescendant', activeOption.id);
				activeOption.scrollIntoView({ block: 'nearest' });
			}
		}

		function buildOption(row, medicine, index) {
			const optionKey = `${row.uid}:${medicine.id}`;
			state.options.set(optionKey, medicine);
			const rxType = normalizePrescriptionType(medicine.prescription_type);
			const rxLabel = ({ H: 'Đơn hướng thần (H)', N: 'Đơn gây nghiện (N)' })[rxType] || '';
			const rxClass = rxLabel ? ` doctor-support-dropdown__item--rx-${rxType.toLowerCase()}` : '';
			const rxFlag = rxLabel
				? `<span class="doctor-support-dropdown__flag" title="${escapeAttr(rxLabel)}" aria-label="${escapeAttr(rxLabel)}">${escapeHtml(rxType)}</span>`
				: '';
			return `
				<button type="button" id="doctorMedicineOption-${escapeAttr(row.uid)}-${index}" class="doctor-support-dropdown__item${rxClass}" data-medicine-select="${escapeAttr(optionKey)}" role="option" aria-selected="false">
					<span class="doctor-support-dropdown__title">${rxFlag}${escapeHtml(medicine.name)}</span>
					<span class="doctor-support-dropdown__meta">${escapeHtml([medicine.strength, medicine.unit, `Tồn kho ${medicine.stock_quantity ?? 0}`, formatCurrency(medicine.unit_price)].filter(Boolean).join(' · '))}</span>
				</button>
			`;
		}

		function render(doc, input, row, medicines) {
			const dropdown = getDropdown(doc);
			state.options.clear();
			state.input = input;
			state.activeIndex = -1;
			input?.removeAttribute('aria-busy');
			setInputState(input, true);
			if (!Array.isArray(medicines) || !medicines.length) {
				dropdown.innerHTML = '<div class="doctor-support-dropdown__empty">Không tìm thấy thuốc trong kho</div>';
				dropdown.hidden = false;
				position(doc);
				return;
			}
			dropdown.innerHTML = medicines.map((medicine, index) => buildOption(row, medicine, index)).join('');
			dropdown.hidden = false;
			position(doc);
		}

		function search(input, row) {
			if (row.isExternal) return;
			const doc = getDocument();
			const query = input.value.trim();
			hide(doc);
			const token = ++state.token;
			const dropdown = getDropdown(doc);
			state.input = input;
			state.activeIndex = -1;
			input.setAttribute('aria-busy', 'true');
			setInputState(input, true);
			dropdown.innerHTML = '<div class="doctor-support-dropdown__empty">Đang tải danh sách thuốc...</div>';
			dropdown.hidden = false;
			position(doc);
			state.timer = window.setTimeout(async () => {
				try {
					const data = await requestJson(getEndpoint(query));
					if (token !== state.token || !input.isConnected || !isRowCurrent(row)) return;
					render(doc, input, row, data && data.medicines ? data.medicines : []);
				} catch (error) {
					if (token === state.token) hide(doc);
				} finally {
					if (token === state.token) state.timer = null;
				}
			}, query ? 250 : 0);
		}

		function handleKeydown(doc, event) {
			const dropdown = getDropdown(doc);
			if (event.key === 'Escape') {
				hide(doc);
				return null;
			}
			if (dropdown.hidden || event.target !== state.input) return null;
			const optionElements = Array.from(dropdown.querySelectorAll(OPTION_SELECTOR));
			if (!optionElements.length) return null;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				const current = state.activeIndex;
				const firstIndex = direction > 0 ? 0 : optionElements.length - 1;
				setActive(doc, current < 0 ? firstIndex : current + direction);
				return null;
			}
			if (event.key === 'Enter' && state.activeIndex >= 0) {
				event.preventDefault();
				return optionElements[state.activeIndex].dataset.medicineSelect;
			}
			return null;
		}

		return Object.freeze({
			search,
			hide,
			reset,
			position,
			handleKeydown,
			getOption: optionKey => state.options.get(optionKey) || null
		});
	}

	REGISTRY.register('prescriptionMedicineSearch', Object.freeze({ create }), {
		dependencies: ['supportRuntime', 'prescriptionModel'],
		owner: 'doctor/prescription'
	});
})(window);
