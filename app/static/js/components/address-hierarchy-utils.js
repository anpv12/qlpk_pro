import { callVietnamAddressAPI, clearSelectOptions, collectPersonalDetailModalValues, fillMainAddressFieldFromModal, getModalAddressFormValues, loadAddressHierarchy, loadDistricts, loadDistrictsModal, loadProvinces, loadProvincesForModal, loadProvincesModal, loadWards, loadWardsModal, normalizeAddressName, setSelectByApprox, setSelectValueWithFallback, tryFallbackAPI, updateAddressSummary } from './address-hierarchy-utils-parts/address-api.js';
import { createAddressHierarchyAdapter, handleDistrictChange, handlePersonalDetailModalClose, handleProvinceChange, hasPersonalDetailModalAddressData, savePersonalDetailAddressToServerIfEditing, setupMainAddressChangeHandlers, syncPersonalDetailModalIfNeeded, syncPersonalDetailModalToMainForm } from './address-hierarchy-utils-parts/address-modal-sync.js';

export const ClinicalAddressHierarchyUtils = {
	callVietnamAddressAPI: callVietnamAddressAPI,
	tryFallbackAPI: tryFallbackAPI,
	normalizeAddressName: normalizeAddressName,
	setSelectValueWithFallback: setSelectValueWithFallback,
	setSelectByApprox: setSelectByApprox,
	loadProvinces: loadProvinces,
	loadDistricts: loadDistricts,
	loadWards: loadWards,
	loadProvincesModal: loadProvincesModal,
	loadProvincesForModal: loadProvincesForModal,
	loadDistrictsModal: loadDistrictsModal,
	loadWardsModal: loadWardsModal,
	loadAddressHierarchy: loadAddressHierarchy,
	clearSelectOptions: clearSelectOptions,
	getModalAddressFormValues: getModalAddressFormValues,
	updateAddressSummary: updateAddressSummary,
	fillMainAddressFieldFromModal: fillMainAddressFieldFromModal,
	collectPersonalDetailModalValues: collectPersonalDetailModalValues,
	savePersonalDetailAddressToServerIfEditing: savePersonalDetailAddressToServerIfEditing,
	handlePersonalDetailModalClose: handlePersonalDetailModalClose,
	syncPersonalDetailModalToMainForm: syncPersonalDetailModalToMainForm,
	hasPersonalDetailModalAddressData: hasPersonalDetailModalAddressData,
	syncPersonalDetailModalIfNeeded: syncPersonalDetailModalIfNeeded,
	handleProvinceChange: handleProvinceChange,
	handleDistrictChange: handleDistrictChange,
	setupMainAddressChangeHandlers: setupMainAddressChangeHandlers,
	createAddressHierarchyAdapter: createAddressHierarchyAdapter
};
