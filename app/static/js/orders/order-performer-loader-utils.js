(function () {
	'use strict';

	function resolveUserName(user) {
		return user.name || user.full_name || '';
	}

	function resolveUserSpecialization(user, options = {}) {
		if (typeof options.getUserSpecialization === 'function') {
			return options.getUserSpecialization(user) || '';
		}

		const roleSpecializations = options.roleSpecializations || {};
		return user.specialization || roleSpecializations[user.role] || options.defaultSpecialization || '';
	}

	function resolveUserValue(user, options = {}) {
		if (typeof options.getUserValue === 'function') {
			return options.getUserValue(user) || '';
		}
		return user.id || user.user_id || '';
	}

	function resetSelectOptions(select) {
		while (select.options.length > 1) {
			select.remove(1);
		}
	}

	function appendUserOption(select, user, options = {}) {
		const doc = options.document || document;
		const option = doc.createElement('option');
		const userName = resolveUserName(user);
		const userSpecialization = resolveUserSpecialization(user, options);

		option.value = resolveUserValue(user, options);
		option.textContent = `${userName} (${userSpecialization})`;
		option.dataset.userName = userName;
		select.appendChild(option);
	}

	async function loadOrderPerformers(options = {}) {
		const doc = options.document || document;
		const select = doc.getElementById(options.selectId || 'orderFormNewInHouseUnit');
		if (!select) return false;

		if (!options.forceReload && select.options.length > 1) return true;

		try {
			const getAuthHeader = options.getAuthHeader || window.getAuthHeader;
			if (typeof getAuthHeader === 'function' && !getAuthHeader()) {
				return false;
			}

			const apiCall = options.apiCall || window.apiCall;
			if (typeof apiCall !== 'function') {
				throw new Error('apiCall is not available');
			}

			const response = await apiCall(options.endpoint || '/users/doctors', {
				method: 'GET'
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const users = await response.json();
			resetSelectOptions(select);
			(Array.isArray(users) ? users : []).forEach(user => appendUserOption(select, user, options));
			return true;
		} catch (error) {
			console.error('Error loading order performers:', error);
			return false;
		}
	}

	function createOrderPerformerLoaderAdapter(options = {}) {
		return {
			loadOrderPerformers(overrideOptions = {}) {
				return loadOrderPerformers({
					...options,
					...overrideOptions
				});
			}
		};
	}

	const api = {
		loadOrderPerformers,
		appendUserOption,
		createOrderPerformerLoaderAdapter
	};

	window.ClinicalOrderPerformerLoaderUtils = api;
	window.DoctorExaminationOrderPerformerLoaderUtils = api;
	window.PsychologistExaminationOrderPerformerLoaderUtils = api;
})();
