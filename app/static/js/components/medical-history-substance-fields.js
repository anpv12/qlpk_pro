import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const DEFAULT_SUBSTANCE_IDS = [
	'tobacco', 'alcohol', 'cannabis', 'cocaine', 'stimulants',
	'inhalants', 'sedatives', 'hallucinogens', 'opioids', 'other_substance'
];

const getDocument = QLPKDoctorModuleRegistry.require('supportRuntime').getDocument;

function getIds(options = {}) {
	return Array.isArray(options.substanceIds) ? options.substanceIds : DEFAULT_SUBSTANCE_IDS;
}

function reset(options = {}) {
	const doc = getDocument(options);
	getIds(options).forEach(id => {
		const check = doc.getElementById(`${id}_check`);
		const time = doc.getElementById(`${id}_time`);
		if (check) check.checked = false;
		if (time) {
			time.value = '';
			time.disabled = true;
		}
	});
	return true;
}

function bind(options = {}) {
	const doc = getDocument(options);
	getIds(options).forEach(id => {
		const check = doc.getElementById(`${id}_check`);
		const time = doc.getElementById(`${id}_time`);
		if (!check || !time || check.dataset.medicalHistorySubstanceBound === 'true') return;
		check.addEventListener('change', () => {
			if (check.checked) {
				time.disabled = false;
				time.focus();
			} else {
				time.value = '';
				time.disabled = true;
			}
		});
		check.dataset.medicalHistorySubstanceBound = 'true';
	});
	return true;
}

function collect(options = {}) {
	const doc = getDocument(options);
	const value = {};
	getIds(options).forEach(id => {
		const check = doc.getElementById(`${id}_check`);
		const time = doc.getElementById(`${id}_time`);
		const used = Boolean(check?.checked);
		value[`${id}_used`] = used;
		if (used) value[`${id}_duration`] = time?.value || '';
	});
	return value;
}

function populate(value = {}, options = {}) {
	const doc = getDocument(options);
	getIds(options).forEach(id => {
		const check = doc.getElementById(`${id}_check`);
		const time = doc.getElementById(`${id}_time`);
		if (!check || !time) return;
		const used = value[`${id}_used`] === true || value[`${id}_used`] === 'true';
		check.checked = used;
		time.disabled = !used;
		time.value = used ? (value[`${id}_duration`] || '') : '';
	});
	return true;
}

QLPKDoctorModuleRegistry.register('medicalHistorySubstanceFields', { bind, collect, populate, reset });
