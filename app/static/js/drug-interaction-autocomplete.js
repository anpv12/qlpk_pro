// Creatable active-ingredient picker for the drug interaction form: the typed text is always the value;
// an exact catalog match is offered as a choice, otherwise a "+ Thêm hoạt chất mới" entry leads the list.
import { el, icon, on } from './shared/dom.js';

function suggestions(query, ingredients, normalize) {
	if (!query) return ingredients.slice(0, 15).map(label => ({ label }));
	const needle = normalize(query);
	const matches = ingredients.filter(name => normalize(name).includes(needle)).slice(0, 15).map(label => ({ label }));
	if (!ingredients.some(name => normalize(name) === needle)) {
		matches.unshift({ label: query, displayLabel: `+ Thêm hoạt chất mới: "${query}"`, isNew: true });
	}
	return matches;
}

function option(match, choose) {
	const node = match.isNew
		? el('div', { class: 'ac-item ac-item-new' }, el('span', { class: 'ac-new-label' }, icon('bi-plus-circle', 'me-1'), ` ${match.displayLabel}`))
		: el('div', { class: 'ac-item' }, el('strong', {}, match.label));
	on(node, 'click', () => choose(match.label));
	return node;
}

export function setupIngredientAutocomplete(input, hidden, ingredients, normalize) {
	let dropdown = null;
	const close = () => {
		dropdown?.remove();
		dropdown = null;
	};
	const choose = label => {
		input.value = label;
		hidden.value = label;
		close();
	};
	function show() {
		close();
		const query = input.value.trim();
		hidden.value = query;
		const matches = suggestions(query, ingredients(), normalize);
		if (!matches.length) return;
		dropdown = el('div', { class: 'ac-dropdown' }, matches.map(match => option(match, choose)));
		input.parentElement.classList.add('di-autocomplete-wrap');
		input.parentElement.appendChild(dropdown);
	}
	on(input, 'focus', show);
	on(input, 'input', show);
	on(document, 'click', event => {
		if (dropdown && !input.contains(event.target) && !dropdown.contains(event.target)) close();
	});
}
