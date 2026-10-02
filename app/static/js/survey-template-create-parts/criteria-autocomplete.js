import { moduleState } from './state.js';
import { el, replace } from '../shared/dom.js';
import { markDirty, normalizeSearchText, setScVisible } from './page-state.js';

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
		const createItem = () => el('div', { class: 'sc-criteria-item sc-criteria-create', 'data-name': query },
			el('i', { class: 'bi bi-plus-circle' }), ` Tạo mới: "${query}"`);
		const nodes = [];
		if (items.length === 0 && query) {
			nodes.push(createItem());
		} else {
			items.forEach(c => nodes.push(el('div', { class: 'sc-criteria-item', 'data-name': c.name ?? '' }, c.name ?? '')));
			if (query && !items.find(c => normalizeSearchText(c.name) === normalizeSearchText(query))) nodes.push(createItem());
		}
		replace(dropdown, nodes);
		setScVisible(dropdown, nodes.length > 0);
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

export { bindCriteriaAutocomplete, createCriteria, fetchCriteria };
