// Placeholder block of the patient history modal (search results, history list, function tabs):
//   emptyState({ modifiers: ['search', 'error'], icon: 'bi-search', title, description })
//   emptyState({ modifiers: ['loading'], spinner: true, title })
import { el } from './dom.js';

export function emptyState({ modifiers = [], icon, iconClass = 'patient-search-modal__empty-icon', spinner = false, title, description }) {
	const classes = ['patient-search-modal__empty-state', ...modifiers.map(name => `patient-search-modal__empty-state--${name}`)];
	return el('div', { class: classes.join(' ') },
		el('span', { class: 'patient-search-modal__empty-icon-wrap', 'aria-hidden': 'true' },
			spinner
				? el('div', { class: 'spinner-border patient-search-modal__spinner', role: 'status' })
				: el('i', { class: `bi ${icon} ${iconClass}` })),
		el('p', { class: 'patient-search-modal__empty-title' }, title),
		description ? el('small', { class: 'patient-search-modal__empty-description' }, description) : null
	);
}
