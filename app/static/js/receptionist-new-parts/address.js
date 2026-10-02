import { apiCall } from '../receptionist-new.js';
// Main-form address helpers for the receptionist page (ES module).

function buildFullAddressFromParts(addressDetail, ward, district, province) {
	return window.ReceptionistAddressMainForm.buildFullAddressFromParts(addressDetail, ward, district, province);
}

// Load regions (main form) - replacing Provinces
async function loadProvinces() {
	return window.ReceptionistAddressMainForm.loadProvinces({
		document,
		apiCall,
		console
	});
}

// Load units (main form) - replacing Wards
async function loadWards(provinceName, districtNameIgnored) {
	return window.ReceptionistAddressMainForm.loadWards(provinceName, districtNameIgnored, {
		document,
		apiCall,
		console
	});
}

// Update address summary
function updateAddressSummary() {
	window.ReceptionistAddressMainForm.updateAddressSummary({ document });
}

function bindAddressFieldChanges() {
	window.ReceptionistAddressMainForm.bindAddressFieldChanges({
		document,
		apiCall,
		loadWards
	});
}

export { bindAddressFieldChanges, buildFullAddressFromParts, loadProvinces, loadWards, updateAddressSummary };
