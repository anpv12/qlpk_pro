(function (window) {
	'use strict';
	const loads = new WeakMap();

	async function loadCatalog(kind, url, apply, options) {
		const pageWindow = options.window || window;
		const doc = options.document || pageWindow.document;
		let state = loads.get(doc);
		if (!state) {
			state = {};
			loads.set(doc, state);
		}
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
			const message = kind === 'doctors'
				? 'Không thể tải danh sách người khám. Vui lòng tải lại trang.'
				: 'Không thể tải danh sách dịch vụ. Vui lòng tải lại trang.';
			const showToast = options.showCustomToast || pageWindow.QLPKUserFeedback?.show;
			showToast?.('error', message);
			return false;
		}
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
		const servicePackage = options.servicePackage || window.ReceptionistServicePackage;
		return loadCatalog('services', '/services', services => {
			servicePackage.initServiceAutocomplete('serviceType', 'serviceTypeDropdown', 'serviceTypeId', services, options.$ || window.$);
			options.setServices?.(services);
		}, options);
	}

	window.ReceptionistCatalogLoaders = { loadDoctorsForForm, loadServicesForForm };
})(window);
