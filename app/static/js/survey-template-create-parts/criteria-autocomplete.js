// survey-template-create.js: autocomplete tiêu chí (nạp sau page-state.js, trước question-editor.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['survey-template-create'] || (window.QLPKModuleParts['survey-template-create'] = { state: {} });
	const moduleState = moduleParts.state;
	const { escHtml, markDirty, normalizeSearchText, setScVisible } = moduleParts;

	async function fetchCriteria() {
		if (moduleState.criteriaCache) return moduleState.criteriaCache;
		try {
			const res = await fetch('/api/survey-criteria/', {
			});
			const json = await res.json();
			moduleState.criteriaCache = json.success ? json.data : [];
		} catch (_) {
			moduleState.criteriaCache = [];
		}
		return moduleState.criteriaCache;
	}
	async function createCriteria(name) {
		try {
			const res = await fetch('/api/survey-criteria/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name })
			});
			const json = await res.json();
			if (json.success && json.data) {
				if (moduleState.criteriaCache && !moduleState.criteriaCache.find(c => c.id === json.data.id)) {
					moduleState.criteriaCache.push(json.data);
				}
				return json.data;
			}
		} catch (_) { console.warn('Không thể tạo tiêu chí khảo sát:', _); }
		return null;
	}
	function bindCriteriaAutocomplete(input) {
		if (input.dataset.criteriaBound) return;
		input.dataset.criteriaBound = '1';
		const wrapper = input.closest('.sc-criteria-wrap');
		if (!wrapper) return;
		const dropdown = wrapper.querySelector('.sc-criteria-dropdown');
		if (!dropdown) return;

		function renderDropdown(items, query) {
			let html = '';
			if (items.length === 0 && query) {
				html = `<div class="sc-criteria-item sc-criteria-create" data-name="${escHtml(query)}"><i class="bi bi-plus-circle"></i> Tạo mới: "${escHtml(query)}"</div>`;
			} else {
				items.forEach(c => {
					html += `<div class="sc-criteria-item" data-name="${escHtml(c.name)}">${escHtml(c.name)}</div>`;
				});
				if (query && !items.find(c => normalizeSearchText(c.name) === normalizeSearchText(query))) {
					html += `<div class="sc-criteria-item sc-criteria-create" data-name="${escHtml(query)}"><i class="bi bi-plus-circle"></i> Tạo mới: "${escHtml(query)}"</div>`;
				}
			}
			dropdown.innerHTML = html;
			setScVisible(dropdown, !!html);
			dropdown.querySelectorAll('.sc-criteria-item').forEach(item => {
				item.addEventListener('mousedown', async (e) => {
					e.preventDefault();
					const name = item.dataset.name;
					if (item.classList.contains('sc-criteria-create')) {
						await createCriteria(name);
					}
					input.value = name;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					setScVisible(dropdown, false);
					markDirty();
				});
			});
		}

		input.addEventListener('focus', async () => {
			const list = await fetchCriteria();
			const q = normalizeSearchText(input.value);
			const filtered = q ? list.filter(c => normalizeSearchText(c.name).includes(q)) : list;
			renderDropdown(filtered, input.value.trim());
		});

		input.addEventListener('input', async () => {
			const list = await fetchCriteria();
			const q = normalizeSearchText(input.value);
			const filtered = q ? list.filter(c => normalizeSearchText(c.name).includes(q)) : list;
			renderDropdown(filtered, input.value.trim());
		});

		input.addEventListener('blur', () => {
			setTimeout(() => { setScVisible(dropdown, false); }, 200);
		});
	}

	Object.assign(moduleParts, { fetchCriteria, createCriteria, bindCriteriaAutocomplete });
})();
