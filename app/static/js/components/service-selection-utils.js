(function () {
	'use strict';

	function fallbackToNumber(value, fallback = 0) {
		const num = Number(value);
		return Number.isFinite(num) ? num : fallback;
	}

	function fallbackNormalizeKey(value) {
		return (value || '')
			.toString()
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function getCoreUtils() {
		return window.ClinicalCoreUtils || window.DoctorExaminationCoreUtils || {
			toNumber: fallbackToNumber,
			normalizeKey: fallbackNormalizeKey
		};
	}

	function applySelectValueWithMapping(selectEl, rawValue, mapping = {}, context = {}) {
		if (!selectEl) return;
		const doc = context.document || document;
		const core = getCoreUtils();
		const raw = (rawValue ?? '').toString().trim();
		if (!raw) {
			selectEl.value = '';
			return;
		}

		const key = core.normalizeKey(raw);
		const mappedValue = mapping[key];
		const finalValue = mappedValue || raw;
		const finalKey = core.normalizeKey(finalValue);

		const existingOption = Array.from(selectEl.options || []).find(option => core.normalizeKey(option.value) === finalKey);
		if (!existingOption) {
			const option = doc.createElement('option');
			option.value = finalValue;
			option.textContent = finalValue;
			selectEl.appendChild(option);
		}
		selectEl.value = finalValue;
	}

	function mapServiceResponseToLocal(item, context = {}) {
		const core = getCoreUtils();
		const now = context.now || Date.now();
		const random = typeof context.random === 'number' ? context.random : Math.random();
		return {
			id: item.id || now + Math.floor(random * 1000),
			appointmentServiceId: item.id || null,
			serviceId: item.service_id || null,
			name: item.service_name || '',
			quantity: core.toNumber(item.quantity, 1) || 1,
			duration: core.toNumber(item.duration ?? item.duration_minutes ?? item.durationMinutes, 0),
			amount: core.toNumber(item.unit_price ?? item.price, 0),
			note: item.note || '',
			discountPercent: core.toNumber(item.discount_percent, 0),
			taxPercent: core.toNumber(item.tax_percent, 0)
		};
	}

	function normalizeSelectedService(serviceData = {}, context = {}) {
		const core = getCoreUtils();
		const now = context.now || Date.now();
		const random = typeof context.random === 'number' ? context.random : Math.random();
		return {
			id: serviceData.id || now + Math.floor(random * 1000),
			appointmentServiceId: serviceData.appointmentServiceId || null,
			serviceId: serviceData.serviceId || null,
			name: serviceData.name || '',
			quantity: core.toNumber(serviceData.quantity, 1) || 1,
			duration: core.toNumber(serviceData.duration, 0),
			amount: core.toNumber(serviceData.amount, 0),
			note: serviceData.note || '',
			discountPercent: core.toNumber(serviceData.discountPercent, 0),
			taxPercent: core.toNumber(serviceData.taxPercent, 0)
		};
	}

	function upsertSelectedService(services = [], serviceData = {}, context = {}) {
		const list = Array.isArray(services) ? services : [];
		const normalized = normalizeSelectedService(serviceData, context);
		const existing = list.find(service =>
			service.name === normalized.name &&
			service.serviceId === normalized.serviceId &&
			service.appointmentServiceId === normalized.appointmentServiceId
		);

		if (existing) {
			existing.quantity = normalized.quantity;
			existing.duration = normalized.duration;
			existing.amount = normalized.amount;
			existing.note = normalized.note;
			existing.discountPercent = normalized.discountPercent;
			existing.taxPercent = normalized.taxPercent;
		} else {
			list.push(normalized);
		}

		return list;
	}

	function updateSelectedServiceField(services = [], serviceId, field, value) {
		const list = Array.isArray(services) ? services : [];
		const service = list.find(item => item.id === serviceId);
		if (!service) return false;

		if (field === 'quantity' || field === 'duration') {
			const parsed = parseInt(value, 10);
			service[field] = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
			if (field === 'quantity' && service[field] < 1) {
				service[field] = 1;
			}
		} else if (field === 'amount') {
			const parsedAmount = parseFloat(value);
			service.amount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
		} else if (field === 'note') {
			service.note = value || '';
		}

		return true;
	}

	function removeSelectedService(services = [], serviceId) {
		return Array.isArray(services)
			? services.filter(service => service.id !== serviceId)
			: [];
	}

	function buildAppointmentServiceSyncPayload(services = []) {
		const core = getCoreUtils();
		return (Array.isArray(services) ? services : []).map(service => ({
			id: service.appointmentServiceId || undefined,
			service_id: service.serviceId || undefined,
			service_name: service.name,
			quantity: core.toNumber(service.quantity, 1) || 1,
			unit_price: core.toNumber(service.amount, 0),
			duration_minutes: core.toNumber(service.duration, 0),
			note: service.note || '',
			discount_percent: service.discountPercent || undefined,
			tax_percent: service.taxPercent || undefined
		}));
	}

	function addCustomServiceFromInput(inputElement, context = {}) {
		if (!inputElement) return false;
		const addOrUpdateSelectedService = context.addOrUpdateSelectedService;
		const serviceName = inputElement.value.trim();
		if (!serviceName) {
			return false;
		}

		if (typeof addOrUpdateSelectedService === 'function') {
			addOrUpdateSelectedService({
				name: serviceName,
				quantity: 1,
				duration: 0,
				amount: 0
			});
		}

		inputElement.value = '';
		if (typeof inputElement.focus === 'function') {
			inputElement.focus();
		}
		return true;
	}

	async function loadAppointmentServices(options = {}) {
		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		const isLoading = typeof options.getIsLoading === 'function'
			? options.getIsLoading()
			: Boolean(options.isLoading);

		if (isLoading || !appointmentId) return false;

		const loadToken = typeof options.beginLoad === 'function' ? options.beginLoad(appointmentId) : null;
		const isCurrentLoad = () => typeof options.isCurrentLoad === 'function'
			? options.isCurrentLoad(loadToken, appointmentId)
			: true;

		if (typeof options.setIsLoading === 'function') options.setIsLoading(true);
		try {
			const response = await options.apiCall(`/services/appointment/${appointmentId}`);
			if (!isCurrentLoad()) return false;

			if (!response.ok) {
				let message = 'Không tải được dịch vụ đã lưu.';
				try {
					const errorData = await response.json();
					message = errorData?.detail || message;
				} catch (parseError) {
					if (options.console?.warn) {
						options.console.warn('Không parse được lỗi dịch vụ:', parseError);
					}
				}
				if (typeof options.showToast === 'function') {
					options.showToast('error', message);
				}
				return false;
			}

			const data = await response.json();
			if (!isCurrentLoad()) return false;

			const services = Array.isArray(data?.services)
				? data.services.map(item => mapServiceResponseToLocal(item))
				: [];
			if (typeof options.setSelectedServices === 'function') {
				options.setSelectedServices(services);
			}
			if (typeof options.renderSelectedServices === 'function') {
				options.renderSelectedServices();
			}
			if (typeof options.updateTotalServiceAmountDisplay === 'function') {
				options.updateTotalServiceAmountDisplay();
			}
			if (typeof data?.total_amount !== 'undefined' && typeof options.updateServiceAmountDisplayFromValue === 'function') {
				options.updateServiceAmountDisplayFromValue(data.total_amount);
			}
			return true;
		} catch (error) {
			if (options.console?.error) {
				options.console.error('loadAppointmentServices error:', error);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không thể tải danh sách dịch vụ. Vui lòng thử lại.');
			}
			return false;
		} finally {
			if (typeof options.setIsLoading === 'function' && isCurrentLoad()) {
				options.setIsLoading(false);
			}
		}
	}

	function clearServiceSyncDebounce(options = {}) {
		const timer = typeof options.getDebounceTimer === 'function'
			? options.getDebounceTimer()
			: options.debounceTimer;
		if (timer) {
			clearTimeout(timer);
			if (typeof options.setDebounceTimer === 'function') options.setDebounceTimer(null);
		}
	}

	function scheduleAppointmentServiceSync(options = {}) {
		const shouldSkip = typeof options.shouldSkip === 'function' ? Boolean(options.shouldSkip()) : false;
		if (shouldSkip) return false;

		const currentAppointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (!currentAppointmentId) return false;

		clearServiceSyncDebounce(options);
		const debounceMs = Number(options.debounceMs) || 0;
		const appointmentId = currentAppointmentId;
		const timer = setTimeout(() => {
			if (typeof options.setDebounceTimer === 'function') options.setDebounceTimer(null);
			if (options.captureAppointmentId && typeof options.getCurrentAppointmentId === 'function') {
				if (options.getCurrentAppointmentId() !== appointmentId) return;
			}
			if (typeof options.syncAppointmentServices === 'function') {
				options.syncAppointmentServices(options.captureAppointmentId ? appointmentId : undefined);
			}
		}, debounceMs);
		if (typeof options.setDebounceTimer === 'function') options.setDebounceTimer(timer);
		return true;
	}

	function parseServiceSyncErrorMessage(response, fallbackMessage, consoleRef) {
		return response.json()
			.then(errorData => errorData?.detail || fallbackMessage)
			.catch(parseError => {
				if (consoleRef?.warn) {
					consoleRef.warn('Không parse được lỗi khi lưu dịch vụ:', parseError);
				}
				return fallbackMessage;
			});
	}

	async function syncAppointmentServices(options = {}) {
		const shouldSkip = typeof options.shouldSkip === 'function' ? Boolean(options.shouldSkip()) : false;
		if (shouldSkip) return false;

		const isSyncing = typeof options.getIsSyncing === 'function'
			? Boolean(options.getIsSyncing())
			: Boolean(options.isSyncing);
		if (isSyncing) return false;

		clearServiceSyncDebounce(options);

		const currentAppointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		const appointmentId = options.expectedAppointmentId || currentAppointmentId;
		const isCurrentAppointment = () => {
			if (typeof options.isCurrentAppointment === 'function') {
				return Boolean(options.isCurrentAppointment(appointmentId));
			}
			return true;
		};

		if (!appointmentId || (options.requireCurrentAppointmentMatch && currentAppointmentId !== appointmentId)) {
			if (typeof options.updateServiceAmountDisplayFromValue === 'function') {
				options.updateServiceAmountDisplayFromValue(options.getTotalServiceAmount ? options.getTotalServiceAmount() : 0);
			}
			return false;
		}

		if (typeof options.setIsSyncing === 'function') options.setIsSyncing(true);
		try {
			const selectedServices = typeof options.getSelectedServices === 'function'
				? options.getSelectedServices()
				: options.selectedServices;
			const servicesPayload = buildAppointmentServiceSyncPayload(selectedServices);
			const response = await options.apiCall(`/services/appointment/${appointmentId}/sync`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ services: servicesPayload })
			});
			if (!isCurrentAppointment()) return false;

			if (!response.ok) {
				const message = await parseServiceSyncErrorMessage(
					response,
					options.errorMessage || 'Không lưu được danh sách dịch vụ.',
					options.console
				);
				if (typeof options.showToast === 'function') options.showToast('error', message);
				return false;
			}

			const data = await response.json();
			if (!isCurrentAppointment()) return false;
			if (Array.isArray(data?.services)) {
				const nextServices = data.services.map(item => mapServiceResponseToLocal(item));
				if (typeof options.setSelectedServices === 'function') options.setSelectedServices(nextServices);
				if (typeof options.renderSelectedServices === 'function') options.renderSelectedServices();
			}
			if (typeof options.clearCache === 'function') {
				try {
					options.clearCache(appointmentId);
				} catch (cacheError) {
					if (options.console?.warn) {
						options.console.warn('Không thể làm mới cache dịch vụ:', cacheError);
					}
				}
			}
			const totalFromServer = typeof data?.total_amount !== 'undefined'
				? data.total_amount
				: (options.getTotalServiceAmount ? options.getTotalServiceAmount() : 0);
			if (typeof options.updateServiceAmountDisplayFromValue === 'function') {
				options.updateServiceAmountDisplayFromValue(totalFromServer);
			}
			if (typeof options.updateTotalServiceAmountDisplay === 'function') {
				options.updateTotalServiceAmountDisplay();
			}
			return true;
		} catch (error) {
			if (options.console?.error) {
				options.console.error('syncAppointmentServices error:', error);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', options.connectionErrorMessage || 'Không thể lưu dịch vụ. Vui lòng thử lại.');
			}
			return false;
		} finally {
			if (typeof options.setIsSyncing === 'function') options.setIsSyncing(false);
		}
	}

	function createAppointmentServiceSyncAdapter(options = {}) {
		return {
			scheduleAppointmentServiceSync() {
				return scheduleAppointmentServiceSync({
					...options,
					syncAppointmentServices: expectedAppointmentId => this.syncAppointmentServices(expectedAppointmentId)
				});
			},
			loadAppointmentServices() {
				return loadAppointmentServices(options);
			},
			syncAppointmentServices(expectedAppointmentId) {
				return syncAppointmentServices({
					...options,
					expectedAppointmentId
				});
			},
			clearServiceSyncDebounce() {
				return clearServiceSyncDebounce(options);
			}
		};
	}

	function createServiceSelectionAdapter(options = {}) {
		const doc = options.document || document;
		const modalUiUtils = options.modalUiUtils || window.ClinicalServiceModalUiUtils || window.DoctorExaminationServiceModalUiUtils;
		const toNumberFn = options.toNumber || getCoreUtils().toNumber || fallbackToNumber;
		const updateField = updateSelectedServiceField;
		const removeService = removeSelectedService;

		const getSelectedServices = () => {
			const services = typeof options.getSelectedServices === 'function'
				? options.getSelectedServices()
				: options.selectedServices;
			return Array.isArray(services) ? services : [];
		};

		const setSelectedServices = services => {
			if (typeof options.setSelectedServices === 'function') {
				options.setSelectedServices(Array.isArray(services) ? services : []);
			}
		};

		const isLocked = () => typeof options.isLocked === 'function'
			? Boolean(options.isLocked())
			: Boolean(options.isLocked);

		const showLockedWarning = message => {
			if (typeof options.showToast === 'function') {
				options.showToast('warning', message);
			}
		};

		function renderSelectedServices() {
			if (!modalUiUtils || typeof modalUiUtils.renderSelectedServices !== 'function') return false;
			modalUiUtils.renderSelectedServices({
				document: doc,
				selectedServices: getSelectedServices(),
				updateSelectedServiceField: updateSelectedServiceFieldAdapter,
				removeServiceFromList
			});
			return true;
		}

		function getTotalServiceAmount() {
			if (!modalUiUtils || typeof modalUiUtils.calculateTotalServiceAmount !== 'function') return 0;
			return modalUiUtils.calculateTotalServiceAmount(getSelectedServices(), toNumberFn);
		}

		function syncServiceAmountToHeader(total = getTotalServiceAmount()) {
			if (typeof options.syncServiceAmountToHeader === 'function') {
				options.syncServiceAmountToHeader(total);
			} else if (typeof options.updateServiceAmountDisplayFromValue === 'function') {
				options.updateServiceAmountDisplayFromValue(total);
			}
			return total;
		}

		function updateTotalServiceAmountDisplay() {
			const total = getTotalServiceAmount();
			if (modalUiUtils && typeof modalUiUtils.updateTotalServiceAmountDisplay === 'function') {
				modalUiUtils.updateTotalServiceAmountDisplay({
					document: doc,
					total,
					formatCurrency: options.formatCurrency
				});
			}
			syncServiceAmountToHeader(total);
			return total;
		}

		function scheduleSync() {
			if (typeof options.scheduleAppointmentServiceSync === 'function') {
				return options.scheduleAppointmentServiceSync();
			}
			return false;
		}

		function addOrUpdateSelectedService(serviceData) {
			setSelectedServices(upsertSelectedService(getSelectedServices(), serviceData));
			renderSelectedServices();
			updateTotalServiceAmountDisplay();
			scheduleSync();
		}

		function addCustomService(inputElement) {
			return addCustomServiceFromInput(inputElement, {
				addOrUpdateSelectedService
			});
		}

		function updateSelectedServiceFieldAdapter(serviceId, field, value) {
			const services = getSelectedServices();
			if (isLocked()) {
				showLockedWarning(options.editLockedMessage || 'Vui lòng nhấn "Chỉnh sửa lịch sử" để chỉnh sửa dịch vụ');
				const service = services.find(item => item.id === serviceId);
				if (service) renderSelectedServices();
				return false;
			}

			const didUpdate = updateField(services, serviceId, field, value);
			if (!didUpdate) return false;
			updateTotalServiceAmountDisplay();
			return true;
		}

		function removeServiceFromList(serviceId) {
			if (isLocked()) {
				showLockedWarning(options.removeLockedMessage || 'Vui lòng nhấn "Chỉnh sửa lịch sử" để xóa dịch vụ');
				return false;
			}

			setSelectedServices(removeService(getSelectedServices(), serviceId));
			renderSelectedServices();
			updateTotalServiceAmountDisplay();
			scheduleSync();
			return true;
		}

		function clearSelectedServices() {
			setSelectedServices([]);
			renderSelectedServices();
			updateTotalServiceAmountDisplay();
			return true;
		}

		return {
			addCustomService,
			addOrUpdateSelectedService,
			renderSelectedServices,
			updateSelectedServiceField: updateSelectedServiceFieldAdapter,
			removeServiceFromList,
			getTotalServiceAmount,
			updateTotalServiceAmountDisplay,
			syncServiceAmountToHeader,
			clearSelectedServices
		};
	}

	const api = {
		applySelectValueWithMapping,
		mapServiceResponseToLocal,
		normalizeSelectedService,
		upsertSelectedService,
		updateSelectedServiceField,
		removeSelectedService,
		buildAppointmentServiceSyncPayload,
		addCustomServiceFromInput,
		loadAppointmentServices,
		clearServiceSyncDebounce,
		scheduleAppointmentServiceSync,
		syncAppointmentServices,
		createAppointmentServiceSyncAdapter,
		createServiceSelectionAdapter
	};

	window.ClinicalServiceSelectionUtils = api;
	window.DoctorExaminationServiceSelectionUtils = api;
})();
