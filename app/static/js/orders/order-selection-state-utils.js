(function () {
	'use strict';

	function removeOrderByEntryId(orders = [], entryId) {
		return (orders || []).filter(order => String(order.tempId) !== String(entryId));
	}

	function hasSelectedOrders(orders = []) {
		return Array.isArray(orders) && orders.length > 0;
	}

	function clearSelectedOrders() {
		return [];
	}

	function updateOrderStatus(orders = [], orderTempId, newStatus) {
		const orderIndex = (orders || []).findIndex(order => String(order.tempId) === String(orderTempId));
		if (orderIndex === -1) {
			return { found: false, locked: false, orders };
		}

		const order = orders[orderIndex];
		const currentStatus = order.status || 'sent';
		const isLocked = order.location_type === 'in' && currentStatus === 'completed';
		if (isLocked) {
			return { found: true, locked: true, orders, order };
		}

		const nextOrders = [...orders];
		nextOrders[orderIndex] = {
			...order,
			status: newStatus,
			is_completed: newStatus === 'completed'
		};

		return { found: true, locked: false, orders: nextOrders, order: nextOrders[orderIndex] };
	}

	function handleOrderStatusUpdate(orders = [], orderTempId, newStatus, options = {}) {
		const result = updateOrderStatus(orders, orderTempId, newStatus);
		if (!result.found) return result;

		if (result.locked) {
			if (typeof options.showToast === 'function') {
				options.showToast('warning', 'Không thể thay đổi trạng thái đã hoàn thành trong cơ sở. Trạng thái này được đồng bộ từ Quản lý chỉ định CLS.');
			}
			if (typeof options.renderSelectedOrders === 'function') {
				options.renderSelectedOrders();
			}
			return result;
		}

		if (typeof options.setSelectedOrders === 'function') {
			options.setSelectedOrders(result.orders);
		}
		if (typeof options.renderSelectedOrders === 'function') {
			options.renderSelectedOrders();
		}

		const shouldSave = typeof options.shouldSave === 'function' ? options.shouldSave(result) : true;
		if (shouldSave && typeof options.saveOrdersToServer === 'function') {
			options.saveOrdersToServer();
		}

		return result;
	}

	function upsertOrderFromSubmission(orders = [], orderData = {}, options = {}) {
		const editingOrderId = options.editingOrderId;
		const nextOrderTempId = Number.isFinite(options.nextOrderTempId) ? options.nextOrderTempId : 1;

		if (editingOrderId) {
			const orderIndex = (orders || []).findIndex(order => String(order.tempId) === String(editingOrderId));
			if (orderIndex === -1) {
				return { found: false, mode: 'update', orders, nextOrderTempId };
			}

			const existingOrder = orders[orderIndex];
			const nextOrder = {
				...existingOrder,
				...orderData,
				status: existingOrder.status || 'sent',
				is_completed: existingOrder.is_completed || false
			};
			const nextOrders = [...orders];
			nextOrders[orderIndex] = nextOrder;

			return { found: true, mode: 'update', orders: nextOrders, nextOrderTempId, order: nextOrder };
		}

		const newOrder = {
			tempId: `temp-${nextOrderTempId}`,
			...orderData,
			status: 'sent',
			is_completed: false
		};

		return {
			found: true,
			mode: 'create',
			orders: [...(orders || []), newOrder],
			nextOrderTempId: nextOrderTempId + 1,
			order: newOrder
		};
	}

	function buildOrdersSavePayload(orders = [], options = {}) {
		return (orders || []).map(order => {
			const payload = {
				id: order.id,
				tempId: order.tempId,
				order_name: order.order_name,
				location_type: order.location_type,
				in_house_unit_id: options.nullEmptyInHouseUnitId ? (order.in_house_unit_id || null) : order.in_house_unit_id,
				in_house_unit: options.emptyStringInHouseUnit ? (order.in_house_unit || '') : order.in_house_unit,
				out_facility: order.out_facility,
				scheduled_for: order.scheduled_for,
				status: order.status,
				is_completed: order.is_completed
			};

			if (options.includeSurveyTemplate) {
				payload.survey_template_id = order.survey_template_id;
			}

			return payload;
		});
	}

	function mergeServerCompletedStatuses(orders = [], serverOrders = []) {
		const serverOrdersMap = new Map();
		(serverOrders || []).forEach(item => {
			if (item.id) {
				serverOrdersMap.set(item.id, item);
			}
		});

		return (orders || []).map(localOrder => {
			if (!localOrder.id) return localOrder;
			const serverOrder = serverOrdersMap.get(localOrder.id);
			if (!serverOrder) return localOrder;

			if (serverOrder.status === 'completed') {
				return {
					...localOrder,
					status: 'completed',
					is_completed: true
				};
			}

			if (!localOrder.status) {
				return {
					...localOrder,
					status: serverOrder.status || 'sent',
					is_completed: !!serverOrder.is_completed
				};
			}

			return localOrder;
		});
	}

	async function refreshSelectedOrderStatusesBeforeSave(options = {}) {
		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		const getSelectedOrders = typeof options.getSelectedOrders === 'function'
			? options.getSelectedOrders
			: () => options.selectedOrders || [];
		const isCurrentSave = () => typeof options.isCurrentSave === 'function'
			? options.isCurrentSave(appointmentId)
			: true;

		if (!appointmentId) return { skipped: true, canceled: false, orders: getSelectedOrders() };

		const selectedOrders = getSelectedOrders();
		const hasExistingOrders = (selectedOrders || []).some(order => order.id);
		if (!hasExistingOrders) return { skipped: true, canceled: false, orders: selectedOrders };

		try {
			const refreshResponse = await options.apiCall(`/api/chi-dinh/appointment/${appointmentId}`, {
				method: 'GET'
			});
			if (!isCurrentSave()) return { skipped: false, canceled: true, orders: getSelectedOrders() };

			if (!refreshResponse.ok) {
				return { skipped: false, canceled: false, orders: getSelectedOrders() };
			}

			const refreshData = await refreshResponse.json();
			if (!isCurrentSave()) return { skipped: false, canceled: true, orders: getSelectedOrders() };

			const serverOrders = refreshData.chi_dinh || [];
			const mergedOrders = mergeServerCompletedStatuses(getSelectedOrders(), serverOrders);
			if (typeof options.setSelectedOrders === 'function') {
				options.setSelectedOrders(mergedOrders);
			}

			return { skipped: false, canceled: false, orders: mergedOrders };
		} catch (refreshError) {
			if (options.console?.warn) {
				options.console.warn(
					options.warningMessage || 'Could not refresh chi_dinh before save, continuing with local state:',
					refreshError
				);
			}
			return { skipped: false, canceled: false, orders: getSelectedOrders(), error: refreshError };
		}
	}

	function applyOrderSaveResponse(orders = [], serverOrders = []) {
		if (!serverOrders || serverOrders.length === 0) return orders;

		return (orders || []).map((localOrder, index) => {
			const serverItem = serverOrders[index];
			if (!serverItem) return localOrder;

			const nextOrder = { ...localOrder };
			if (!nextOrder.id && serverItem.id) {
				nextOrder.id = serverItem.id;
			}
			if (serverItem.status) {
				nextOrder.status = serverItem.status;
			}
			if (typeof serverItem.is_completed !== 'undefined') {
				nextOrder.is_completed = !!serverItem.is_completed;
			}

			return nextOrder;
		});
	}

	function mapServerOrdersToSelectedOrders(items = [], options = {}) {
		const createTempId = typeof options.createTempId === 'function'
			? options.createTempId
			: () => Date.now() + Math.random();

		return (items || []).map(item => {
			const order = {
				id: item.id,
				tempId: item.id || createTempId(item),
				order_name: item.order_name,
				location_type: item.location_type,
				in_house_unit_id: item.in_house_unit_id || null,
				in_house_unit: item.in_house_unit || '',
				performer: item.location_type === 'in' ? (item.in_house_unit || '') : (item.out_facility || ''),
				out_facility: item.out_facility,
				scheduled_for: item.scheduled_for,
				status: item.status || 'sent',
				is_completed: item.is_completed || false
			};

			if (options.includeSurveyTemplate) {
				order.survey_template_id = item.survey_template_id;
			}

			return order;
		});
	}

	function callOption(options, name, ...args) {
		if (typeof options[name] === 'function') return options[name](...args);
		return undefined;
	}

	function logOrderLoadError(options, detail) {
		if (options.console?.error) options.console.error('Error loading chi_dinh:', detail);
	}

	function applyLoadedServerOrders(chiDinhList, options) {
		const selectedOrders = mapServerOrdersToSelectedOrders(chiDinhList, options.mapOptions || {});
		callOption(options, 'setSelectedOrders', selectedOrders);
		if (typeof options.setLastOrdersPayload === 'function') {
			const ordersData = buildOrdersSavePayload(selectedOrders, options.savePayloadOptions || {});
			options.setLastOrdersPayload(JSON.stringify({ chi_dinh: ordersData }));
		}
		callOption(options, 'renderSelectedOrders');
	}

	async function loadSelectedOrdersFromServer(options = {}) {
		const appointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.appointmentId;
		if (!appointmentId) return false;

		const loadToken = typeof options.beginLoad === 'function' ? options.beginLoad(appointmentId) : null;
		const isCurrentLoad = () => typeof options.isCurrentLoad === 'function'
			? options.isCurrentLoad(loadToken, appointmentId)
			: true;

		callOption(options, 'setLoading', true);
		try {
			const response = await options.apiCall(`/api/chi-dinh/appointment/${appointmentId}`, { method: 'GET' });
			if (!isCurrentLoad()) return false;

			if (!response.ok) {
				logOrderLoadError(options, response.status);
				return false;
			}

			const data = await response.json();
			if (!isCurrentLoad()) return false;

			applyLoadedServerOrders(data.chi_dinh || [], options);
			return true;
		} catch (error) {
			logOrderLoadError(options, error);
			return false;
		} finally {
			if (typeof options.setLoading === 'function' && isCurrentLoad()) {
				options.setLoading(false);
			}
		}
	}

	function clearOrderSelectionForPatientSwitch(state, options = {}) {
		if (typeof options.bumpLoadSequence === 'function') {
			options.bumpLoadSequence();
		}

		if (options.autoSaveTimer && typeof options.clearTimeout === 'function') {
			options.clearTimeout(options.autoSaveTimer);
		}
		if (typeof options.setAutoSaveTimer === 'function') {
			options.setAutoSaveTimer(null);
		}

		if (typeof options.setLoading === 'function') {
			options.setLoading(false);
		}
		if (typeof options.setLastOrdersPayload === 'function') {
			options.setLastOrdersPayload(null);
		}

		if (state) {
			state.selectedOrders = [];
			state.editingOrderId = null;
		}

		if (typeof options.renderSelectedOrders === 'function') {
			options.renderSelectedOrders();
		}
	}

	function createSelectedOrderActionsAdapter(options = {}) {
		const getState = () => typeof options.getState === 'function'
			? options.getState()
			: options.state;
		const getSelectedOrders = () => {
			if (typeof options.getSelectedOrders === 'function') return options.getSelectedOrders();
			return getState()?.selectedOrders || [];
		};
		const setSelectedOrders = (orders) => {
			if (typeof options.setSelectedOrders === 'function') {
				options.setSelectedOrders(orders);
				return;
			}
			const state = getState();
			if (state) state.selectedOrders = orders;
		};
		const triggerAutoSave = () => {
			if (typeof options.triggerAutoSave === 'function') options.triggerAutoSave();
		};
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') options.showToast(type, message);
		};

		const adapter = {
			removeOrderFromSelection(entryId) {
				setSelectedOrders(removeOrderByEntryId(getSelectedOrders(), entryId));
				this.renderSelectedOrders();
				triggerAutoSave();
			},
			clearSelectedOrders() {
				if (!hasSelectedOrders(getSelectedOrders())) {
					showToast('info', options.emptyMessage || 'Chưa có chỉ định nào để xoá');
					return false;
				}

				setSelectedOrders(clearSelectedOrders());
				this.renderSelectedOrders();
				triggerAutoSave();
				showToast('success', options.clearSuccessMessage || 'Đã xoá danh sách chỉ định');
				return true;
			},
			renderSelectedOrders() {
				const orders = getSelectedOrders();
				if (options.tableAdapter && typeof options.tableAdapter.renderSelectedOrders === 'function') {
					return options.tableAdapter.renderSelectedOrders(orders);
				}
				if (typeof options.renderSelectedOrders === 'function') {
					return options.renderSelectedOrders(orders);
				}
				return null;
			},
			updateStatusDropdownClasses() {
				if (options.tableAdapter && typeof options.tableAdapter.updateStatusDropdownClasses === 'function') {
					return options.tableAdapter.updateStatusDropdownClasses();
				}
				if (typeof options.updateStatusDropdownClasses === 'function') {
					return options.updateStatusDropdownClasses();
				}
				return null;
			},
			updateOrderStatus(orderTempId, newStatus) {
				return handleOrderStatusUpdate(getSelectedOrders(), orderTempId, newStatus, {
					setSelectedOrders,
					renderSelectedOrders: () => adapter.renderSelectedOrders(),
					saveOrdersToServer: options.saveOrdersToServer,
					shouldSave: options.shouldSave,
					showToast: options.showToast
				});
			},
			clearForPatientSwitch() {
				return clearOrderSelectionForPatientSwitch(getState(), {
					bumpLoadSequence: options.bumpLoadSequence,
					autoSaveTimer: typeof options.getAutoSaveTimer === 'function' ? options.getAutoSaveTimer() : options.autoSaveTimer,
					clearTimeout: options.clearTimeout,
					setAutoSaveTimer: options.setAutoSaveTimer,
					setLoading: options.setLoading,
					setLastOrdersPayload: options.setLastOrdersPayload,
					renderSelectedOrders: () => adapter.renderSelectedOrders()
				});
			}
		};

		return adapter;
	}

	function createOrderAutoSaveAdapter(options = {}) {
		const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 1500;
		const getCurrentAppointmentId = () => typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		const getAutoSaveTimer = () => typeof options.getAutoSaveTimer === 'function'
			? options.getAutoSaveTimer()
			: options.autoSaveTimer;
		const setAutoSaveTimer = (timer) => {
			if (typeof options.setAutoSaveTimer === 'function') options.setAutoSaveTimer(timer);
		};
		const clearTimer = () => {
			const timer = getAutoSaveTimer();
			if (timer && typeof options.clearTimeout === 'function') options.clearTimeout(timer);
		};
		const shouldStart = (appointmentId) => typeof options.shouldStart === 'function'
			? options.shouldStart(appointmentId)
			: Boolean(appointmentId);
		const shouldRun = (appointmentId) => typeof options.shouldRun === 'function'
			? options.shouldRun(appointmentId)
			: true;
		const scheduleTimeout = options.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);

		return {
			trigger() {
				const appointmentId = getCurrentAppointmentId();
				if (!appointmentId || !shouldStart(appointmentId) || !scheduleTimeout) return false;

				clearTimer();
				const timer = scheduleTimeout(() => {
					if (!shouldRun(appointmentId)) return;
					if (typeof options.saveOrdersToServer === 'function') {
						options.saveOrdersToServer(appointmentId);
					}
				}, debounceMs);
				setAutoSaveTimer(timer);
				return true;
			},
			clearTimer
		};
	}

	const api = {
		removeOrderByEntryId,
		hasSelectedOrders,
		clearSelectedOrders,
		updateOrderStatus,
		handleOrderStatusUpdate,
		upsertOrderFromSubmission,
		buildOrdersSavePayload,
		mergeServerCompletedStatuses,
		refreshSelectedOrderStatusesBeforeSave,
		applyOrderSaveResponse,
		mapServerOrdersToSelectedOrders,
		loadSelectedOrdersFromServer,
		clearOrderSelectionForPatientSwitch,
		createSelectedOrderActionsAdapter,
		createOrderAutoSaveAdapter
	};

	window.ClinicalOrderSelectionStateUtils = api;
})();
