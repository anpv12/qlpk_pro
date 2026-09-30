/* global apiCall, receptionistLoadState */
/* exported bindAddressFieldChanges, buildFullAddressFromParts, loadProvinces, saveAddressToServerIfEditing, updateAddressSummary */
// receptionist-new.js: buildFullAddressFromParts, getMainAddressFormValues, saveAddressToServerIfEditing, loadProvinces, loadWards, updateAddressSummary, bindAddressFieldChanges (nạp trước receptionist-new.js, cùng scope trang).

function buildFullAddressFromParts(addressDetail, ward, district, province) {
	return window.ReceptionistAddressMainForm.buildFullAddressFromParts(addressDetail, ward, district, province);
}

function getMainAddressFormValues() {
	return window.ReceptionistAddressMainForm.getMainAddressFormValues({ document });
}

async function saveAddressToServerIfEditing() {
	if (receptionistLoadState.loading || receptionistLoadState.failed) return { status: 'skipped', reason: 'not-ready' };
	try {
		if (!window.currentPatientId) return;
		const pid = window.currentPatientId;
		const { address_detail, province, district, ward, address } = getMainAddressFormValues();
		const body = {
			address_detail,
			province,
			district,
			ward,
			address
		};
		await apiCall(`/api/patients/${pid}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch (e) {
		console.warn('Không thể lưu địa chỉ bệnh nhân:', e);
	}
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
		loadWards
	});
}
