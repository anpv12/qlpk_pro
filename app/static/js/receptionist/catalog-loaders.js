import { QLPKUserFeedback } from '../shared/user-feedback.js';
import { ReceptionistServicePackage } from './service-package-selection.js';

const loads = new WeakMap();

async function loadCatalog(kind, url, apply, options) {
	const pageWindow = options.window || window;
	const doc = options.document || pageWindow.document;
	const state = catalogLoadState(doc);
	const revision = (state[kind] || 0) + 1;
	state[kind] = revision;
	try {
		const fetchRequest = options.fetch || pageWindow.fetch.bind(pageWindow);
		const response = await fetchRequest(url, { signal: pageWindow.AbortSignal.timeout(10000) });
		if (state[kind] !== revision) return false;
		if (!response.ok) throw new Error('catalog_unavailable');
		const data = await response.json();
		if (state[kind] !== revision) return false;
		if (!Array.isArray(data)) throw new Error('catalog_invalid_response');
		apply(data);
		return true;
	} catch (error) {
		if (state[kind] !== revision) return false;
		reportCatalogFailure(kind, options);
		return false;
	}
}

function catalogLoadState(doc) {
	if (!loads.has(doc)) loads.set(doc, {});
	return loads.get(doc);
}

function reportCatalogFailure(kind, options) {
	const message = kind === 'doctors'
		? 'Không thể tải danh sách người khám. Vui lòng tải lại trang.'
		: 'Không thể tải danh sách dịch vụ. Vui lòng tải lại trang.';
	const showToast = options.showCustomToast || QLPKUserFeedback?.show;
	showToast?.('error', message);
}

function loadDoctorsForForm(options = {}) {
	const doc = options.document || (options.window || window).document;
	const select = doc.getElementById('doctorId');
	if (!select) return Promise.resolve(false);
	return loadCatalog('doctors', '/users/doctors', doctors => {
		const selected = select.value;
		const placeholder = doc.createElement('option');
		placeholder.value = '';
		placeholder.textContent = 'Chọn người khám';
		select.replaceChildren(placeholder);
		doctors.forEach(doctor => {
			const option = doc.createElement('option');
			option.value = doctor.id;
			option.textContent = doctor.name || '';
			select.appendChild(option);
		});
		select.value = doctors.some(doctor => String(doctor.id) === selected) ? selected : '';
		options.setDoctors?.(doctors);
	}, options);
}

function loadServicesForForm(options = {}) {
	const servicePackage = options.servicePackage || ReceptionistServicePackage;
	return loadCatalog('services', '/services', services => {
		servicePackage.initServiceAutocomplete('serviceType', 'serviceTypeDropdown', 'serviceTypeId', services);
		options.setServices?.(services);
	}, options);
}

export const ReceptionistCatalogLoaders = { loadDoctorsForForm, loadServicesForForm };
