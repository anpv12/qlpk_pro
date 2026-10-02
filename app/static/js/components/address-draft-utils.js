const DEFAULT_PAGE_LOAD_ID_KEY = 'qlpk_page_load_id';
const DEFAULT_ADDRESS_DRAFT_KEY = 'qlpk_address_draft';

function getDocument(options = {}) {
	return options.document || window.document;
}

function getSessionStorage(options = {}) {
	return options.sessionStorage || window.sessionStorage;
}

function getPageLoadIdKey(options = {}) {
	return options.pageLoadIdKey || DEFAULT_PAGE_LOAD_ID_KEY;
}

function getAddressDraftKey(options = {}) {
	return options.addressDraftKey || DEFAULT_ADDRESS_DRAFT_KEY;
}

function getCurrentLoadId(options = {}) {
	try {
		const storage = getSessionStorage(options);
		const pageLoadIdKey = getPageLoadIdKey(options);
		let id = storage.getItem(pageLoadIdKey);
		if (!id) {
			id = String(Date.now());
			storage.setItem(pageLoadIdKey, id);
		}
		return id;
	} catch (e) {
		return String(Date.now());
	}
}

function getAddressFormValues(options = {}) {
	const doc = getDocument(options);
	return {
		addressDetail: doc.getElementById('addressDetail')?.value || '',
		province: doc.getElementById('province')?.value || '',
		district: doc.getElementById('district')?.value || '',
		ward: doc.getElementById('ward')?.value || '',
		address: doc.getElementById('address')?.value || ''
	};
}

async function saveAddressDraftToCache(options = {}) {
	try {
		const storage = getSessionStorage(options);
		const values = getAddressFormValues(options);
		const payload = { ...values, loadId: getCurrentLoadId(options) };
		storage.setItem(getAddressDraftKey(options), JSON.stringify(payload));
	} catch (e) {
		// Preserve legacy no-op on storage errors.
	}
}

async function loadAddressDraftFromCache(options = {}) {
	try {
		const storage = getSessionStorage(options);
		const raw = storage.getItem(getAddressDraftKey(options));
		if (!raw) return;
		const data = JSON.parse(raw);
		const currentLoadId = getCurrentLoadId(options);
		if (data.loadId && data.loadId === currentLoadId) {
			const doc = getDocument(options);
			if (data.addressDetail) doc.getElementById('addressDetail').value = data.addressDetail;
			if (data.province) doc.getElementById('province').value = data.province;
			if (data.district) doc.getElementById('district').value = data.district;
			if (data.ward) doc.getElementById('ward').value = data.ward;
			if (data.address) doc.getElementById('address').value = data.address;
		}
	} catch (e) {
		// Preserve legacy no-op on storage/JSON errors.
	}
}

function clearAddressDraftCache(options = {}) {
	try {
		getSessionStorage(options).removeItem(getAddressDraftKey(options));
	} catch (e) { /* sessionStorage không khả dụng: bỏ qua */ }
}

function bindAddressDraftListeners(options = {}) {
	const doc = getDocument(options);
	const handler = options.onChange || options.handler;
	if (typeof handler !== 'function') return;
	const fieldIds = options.fieldIds || ['addressDetail', 'province', 'district', 'ward', 'address'];
	fieldIds.forEach(fieldId => {
		const element = doc.getElementById(fieldId);
		if (element) {
			element.addEventListener('input', handler);
			element.addEventListener('change', handler);
		}
	});
}

function createAddressDraftAdapter(options = {}) {
	return {
		getCurrentLoadId() {
			return getCurrentLoadId(options);
		},
		getAddressFormValues() {
			return getAddressFormValues(options);
		},
		saveAddressDraftToCache() {
			return saveAddressDraftToCache(options);
		},
		loadAddressDraftFromCache() {
			return loadAddressDraftFromCache(options);
		},
		clearAddressDraftCache() {
			return clearAddressDraftCache(options);
		},
		bindAddressDraftListeners(bindOptions = {}) {
			return bindAddressDraftListeners({ ...options, ...bindOptions });
		}
	};
}

export const ClinicalAddressDraftUtils = {
	getCurrentLoadId,
	getAddressFormValues,
	saveAddressDraftToCache,
	loadAddressDraftFromCache,
	clearAddressDraftCache,
	bindAddressDraftListeners,
	createAddressDraftAdapter
};
