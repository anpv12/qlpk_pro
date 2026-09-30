// Parts (nạp trước file này): address-api.js, address-modal-sync.js
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/address-hierarchy-utils'] || (window.QLPKModuleParts['components/address-hierarchy-utils'] = { state: {} });

	window.ClinicalAddressHierarchyUtils = {
		callVietnamAddressAPI: moduleParts.callVietnamAddressAPI,
		tryFallbackAPI: moduleParts.tryFallbackAPI,
		normalizeAddressName: moduleParts.normalizeAddressName,
		setSelectValueWithFallback: moduleParts.setSelectValueWithFallback,
		setSelectByApprox: moduleParts.setSelectByApprox,
		loadProvinces: moduleParts.loadProvinces,
		loadDistricts: moduleParts.loadDistricts,
		loadWards: moduleParts.loadWards,
		loadProvincesModal: moduleParts.loadProvincesModal,
		loadProvincesForModal: moduleParts.loadProvincesForModal,
		loadDistrictsModal: moduleParts.loadDistrictsModal,
		loadWardsModal: moduleParts.loadWardsModal,
		loadAddressHierarchy: moduleParts.loadAddressHierarchy,
		clearSelectOptions: moduleParts.clearSelectOptions,
		getModalAddressFormValues: moduleParts.getModalAddressFormValues,
		updateAddressSummary: moduleParts.updateAddressSummary,
		fillMainAddressFieldFromModal: moduleParts.fillMainAddressFieldFromModal,
		collectPersonalDetailModalValues: moduleParts.collectPersonalDetailModalValues,
		savePersonalDetailAddressToServerIfEditing: moduleParts.savePersonalDetailAddressToServerIfEditing,
		handlePersonalDetailModalClose: moduleParts.handlePersonalDetailModalClose,
		syncPersonalDetailModalToMainForm: moduleParts.syncPersonalDetailModalToMainForm,
		hasPersonalDetailModalAddressData: moduleParts.hasPersonalDetailModalAddressData,
		syncPersonalDetailModalIfNeeded: moduleParts.syncPersonalDetailModalIfNeeded,
		handleProvinceChange: moduleParts.handleProvinceChange,
		handleDistrictChange: moduleParts.handleDistrictChange,
		setupMainAddressChangeHandlers: moduleParts.setupMainAddressChangeHandlers,
		createAddressHierarchyAdapter: moduleParts.createAddressHierarchyAdapter
	};
})();
