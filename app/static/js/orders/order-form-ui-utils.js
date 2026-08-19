(function () {
	'use strict';

	function updateOrderFormLocationFields(options = {}) {
		const doc = options.document || document;
		const selected = doc.querySelector('input[name="orderFormNewLocation"]:checked');
		const location = selected ? selected.value : 'in';
		const inGroup = doc.getElementById('orderFormNewInHouseGroup');
		const outGroup = doc.getElementById('orderFormNewOutFacilityGroup');
		if (inGroup) {
			inGroup.classList.toggle('d-none', location !== 'in');
			if (location === 'in' && typeof options.onInHouseSelected === 'function') {
				options.onInHouseSelected();
			}
		}
		if (outGroup) {
			outGroup.classList.toggle('d-none', location !== 'out');
		}
	}

	function updateOrderFormSubmitButton(options = {}) {
		const doc = options.document || document;
		const submitBtn = doc.getElementById('orderFormNewSubmitBtn');
		if (!submitBtn) return;

		if (options.isEditing) {
			submitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Cập nhật';
			submitBtn.classList.remove('btn-success');
			submitBtn.classList.add('btn-primary');
		} else {
			submitBtn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Thêm vào danh sách';
			submitBtn.classList.remove('btn-primary');
			submitBtn.classList.add('btn-success');
		}
	}

	function resetOrderForm(options = {}) {
		const doc = options.document || document;
		const form = doc.getElementById('orderFormNew');
		if (form) {
			form.reset();
			if (options.clearSurveyDataset) {
				delete form.dataset.surveyTemplateId;
				delete form.dataset.isSurvey;
			}
		}

		const nameInput = doc.getElementById('orderFormNewName');
		const dateInput = doc.getElementById('orderFormNewDate');
		const pathHint = doc.getElementById('orderFormNewPathHint');
		const dropdown = doc.getElementById('orderFormNewNameDropdown');

		if (nameInput) nameInput.value = '';
		if (dateInput) dateInput.value = options.defaultDate || '';
		if (pathHint) pathHint.textContent = 'Chưa chọn chỉ định nào.';
		if (dropdown) dropdown.style.display = 'none';

		const inLocationInput = doc.getElementById('orderFormNewLocationIn');
		if (inLocationInput) inLocationInput.checked = true;

		const inHouseSelect = doc.getElementById('orderFormNewInHouseUnit');
		if (inHouseSelect) {
			inHouseSelect.value = '';
			while (inHouseSelect.options.length > 1) {
				inHouseSelect.remove(1);
			}
		}

		if (options.state) {
			options.state.editingOrderId = null;
		}

		if (typeof options.updateLocationFields === 'function') {
			options.updateLocationFields();
		}

		if (typeof options.updateSubmitButton === 'function') {
			options.updateSubmitButton();
		}
	}

	function applyOrderCatalogItemToForm(orderData, options = {}) {
		if (!orderData) return;

		const doc = options.document || document;
		const nameInput = options.nameInput || doc.getElementById('orderFormNewName');
		const pathHint = options.pathHint || doc.getElementById('orderFormNewPathHint');

		if (nameInput) nameInput.value = orderData.name || '';
		if (pathHint) {
			pathHint.textContent = orderData.breadcrumb ? `Nhóm: ${orderData.breadcrumb}` : 'Chưa chọn chỉ định nào.';
		}

		const locationType = orderData.is_in_house ? 'in' : 'out';
		const locationInput = doc.querySelector(`input[name="orderFormNewLocation"][value="${locationType}"]`);
		const inHouseInput = doc.getElementById('orderFormNewInHouseUnit');
		const outFacilityInput = doc.getElementById('orderFormNewOutFacility');
		const currentInHouseValue = inHouseInput?.value || '';
		const currentOutFacilityValue = outFacilityInput?.value || '';

		if (locationInput) {
			locationInput.checked = true;
			if (typeof options.updateLocationFields === 'function') {
				options.updateLocationFields();
			}
		}

		if (locationType === 'in' && inHouseInput) {
			if (orderData.performer && !currentInHouseValue) {
				const loaderResult = typeof options.loadOrderPerformers === 'function'
					? options.loadOrderPerformers()
					: null;
				if (loaderResult && typeof loaderResult.then === 'function') {
					loaderResult.then(() => {
						inHouseInput.value = orderData.performer || '';
					});
				} else {
					inHouseInput.value = orderData.performer || '';
				}
			} else if (!orderData.performer && currentInHouseValue) {
				inHouseInput.value = currentInHouseValue;
			}
		} else if (locationType === 'out' && outFacilityInput) {
			if (orderData.performer && !currentOutFacilityValue) {
				outFacilityInput.value = orderData.performer || '';
			} else if (!orderData.performer && currentOutFacilityValue) {
				outFacilityInput.value = currentOutFacilityValue;
			}
		}
	}

	function findPerformerOption(select, performerName) {
		return Array.from(select.options || []).find(opt =>
			opt.dataset?.userName === performerName || (opt.textContent || '').includes(performerName)
		);
	}

	function resolveInHousePerformer(select, locationType) {
		const value = (select?.value || '').trim();
		if (locationType !== 'in' || !select || !value) {
			return { inHouseUnitId: null, inHouseUnitName: '' };
		}

		const selectedOption = select.options[select.selectedIndex];
		if (selectedOption && !isNaN(value)) {
			return {
				inHouseUnitId: parseInt(value, 10),
				inHouseUnitName: selectedOption.dataset.userName || selectedOption.textContent.split(' (')[0] || ''
			};
		}

		return { inHouseUnitId: null, inHouseUnitName: value };
	}

	function findOrderCatalogMatch(orderIndex, orderName) {
		if (!orderIndex || typeof orderIndex.entries !== 'function') {
			return { orderItemId: null, groupPath: '' };
		}

		for (const [id, data] of orderIndex.entries()) {
			if (data.name === orderName) {
				return { orderItemId: id, groupPath: data.breadcrumb || '' };
			}
		}

		return { orderItemId: null, groupPath: '' };
	}

	function collectOrderFormSubmission(options = {}) {
		const doc = options.document || document;
		const nameInput = doc.getElementById('orderFormNewName');
		const dateInput = doc.getElementById('orderFormNewDate');
		const locationInput = doc.querySelector('input[name="orderFormNewLocation"]:checked');
		const inHouseInput = doc.getElementById('orderFormNewInHouseUnit');
		const outFacilityInput = doc.getElementById('orderFormNewOutFacility');
		const orderForm = doc.getElementById('orderFormNew');

		const orderName = (nameInput?.value || '').trim();
		const scheduledFor = dateInput?.value || '';
		const locationType = locationInput?.value || 'in';
		const outFacility = (outFacilityInput?.value || '').trim();
		const { inHouseUnitId, inHouseUnitName } = resolveInHousePerformer(inHouseInput, locationType);

		if (!orderName) {
			return {
				valid: false,
				message: 'Vui lòng nhập tên chỉ định.',
				focusElement: nameInput
			};
		}

		if (!scheduledFor) {
			return {
				valid: false,
				message: 'Vui lòng chọn ngày chỉ định.',
				focusElement: dateInput
			};
		}

		let surveyTemplateId = null;
		let orderItemId = null;
		let groupPath = '';

		if (options.includeSurveyTemplate && orderForm?.dataset.isSurvey === 'true' && orderForm.dataset.surveyTemplateId) {
			surveyTemplateId = Number(orderForm.dataset.surveyTemplateId);
			groupPath = options.surveyGroupPath || 'Khảo sát Tâm lý';
		} else {
			const match = findOrderCatalogMatch(options.orderIndex, orderName);
			orderItemId = match.orderItemId;
			groupPath = match.groupPath;
		}

		const orderData = {
			order_item_id: orderItemId,
			order_name: orderName,
			group_path: groupPath,
			performer: locationType === 'in' ? inHouseUnitName : outFacility,
			scheduled_for: scheduledFor,
			location_type: locationType,
			in_house_unit_id: locationType === 'in' ? inHouseUnitId : null,
			in_house_unit: locationType === 'in' ? inHouseUnitName : '',
			out_facility: locationType === 'out' ? outFacility : ''
		};

		if (options.includeSurveyTemplate) {
			orderData.survey_template_id = surveyTemplateId;
		}

		return {
			valid: true,
			orderData,
			isSurvey: Boolean(surveyTemplateId),
			elements: { nameInput, dateInput, inHouseInput, outFacilityInput, orderForm }
		};
	}

	function applyOrderCatalogTreeItemToForm(orderData, options = {}) {
		if (!orderData) return;

		const doc = options.document || document;
		const nameInput = doc.getElementById('orderFormNewName');
		const dateInput = doc.getElementById('orderFormNewDate');
		const pathHint = doc.getElementById('orderFormNewPathHint');

		if (nameInput) nameInput.value = orderData.name || '';
		if (dateInput && !dateInput.value) dateInput.value = options.defaultDate || '';

		const locationType = orderData.is_in_house ? 'in' : 'out';
		const locationInput = doc.querySelector(`input[name="orderFormNewLocation"][value="${locationType}"]`);
		if (locationInput) {
			locationInput.checked = true;
			if (typeof options.updateLocationFields === 'function') {
				options.updateLocationFields();
			}
		}

		const inHouseInput = doc.getElementById('orderFormNewInHouseUnit');
		const outFacilityInput = doc.getElementById('orderFormNewOutFacility');
		const performerName = orderData.performer || '';
		if (locationType === 'in' && inHouseInput) {
			if (options.matchInHousePerformerOption && performerName) {
				const matchingOption = findPerformerOption(inHouseInput, performerName);
				inHouseInput.value = matchingOption ? matchingOption.value : performerName;
			} else if (performerName || options.clearEmptyInHousePerformer) {
				inHouseInput.value = performerName;
			}
		} else if (locationType === 'out' && outFacilityInput) {
			outFacilityInput.value = performerName;
		}

		if (pathHint) {
			pathHint.textContent = orderData.breadcrumb ? `Nhóm: ${orderData.breadcrumb}` : 'Chưa chọn chỉ định nào.';
		}
	}

	function applyOrderCatalogTreeSelection(orderIndex, orderId, options = {}) {
		const numericId = Number(orderId);
		const orderData = orderIndex && typeof orderIndex.get === 'function'
			? orderIndex.get(numericId)
			: null;
		if (!orderData) {
			return { applied: false, orderData: null, orderId: numericId };
		}
		applyOrderCatalogTreeItemToForm(orderData, options);
		return { applied: true, orderData, orderId: numericId };
	}

	function getSurveyPricingText(template, options = {}) {
		if (template.pricing_type === 'time_based') {
			const formatPricing = typeof options.formatPricing === 'function'
				? options.formatPricing
				: value => String(value || 0);
			return `${formatPricing(template.price_per_minute || 0)}/phút`;
		}
		return template.service_name || 'Chưa liên kết dịch vụ';
	}

	function applySurveyTemplateToForm(template, options = {}) {
		if (!template) return {};

		const doc = options.document || document;
		const nameInput = doc.getElementById('orderFormNewName');
		const dateInput = doc.getElementById('orderFormNewDate');
		const pathHint = doc.getElementById('orderFormNewPathHint');
		const orderForm = doc.getElementById('orderFormNew');

		if (nameInput) nameInput.value = template.name || '';
		if (dateInput && !dateInput.value) dateInput.value = options.defaultDate || '';

		if (options.forceInHouseLocation) {
			const locationInput = doc.querySelector('input[name="orderFormNewLocation"][value="in"]');
			if (locationInput) {
				locationInput.checked = true;
				if (typeof options.updateLocationFields === 'function') {
					options.updateLocationFields();
				}
			}
		}

		if (options.setSurveyDataset && orderForm) {
			orderForm.dataset.surveyTemplateId = Number(template.id);
			orderForm.dataset.isSurvey = 'true';
		}

		if (pathHint) {
			const questionCount = template.question_count || 0;
			if (options.variant === 'psychologist') {
				const pricingInfo = getSurveyPricingText(template, options);
				pathHint.innerHTML = `<span class="badge bg-primary-subtle text-primary me-1"><i class="bi bi-clipboard-pulse"></i> Khảo sát Tâm lý</span> ${questionCount} câu hỏi • ${pricingInfo}`;
			} else {
				pathHint.textContent = `Khảo sát tâm lý · ${questionCount} câu hỏi`;
			}
		}

		return { nameInput, dateInput, pathHint, orderForm };
	}

	function applySelectedOrderToForm(order, options = {}) {
		if (!order) return {};

		const doc = options.document || document;
		const nameInput = doc.getElementById('orderFormNewName');
		const dateInput = doc.getElementById('orderFormNewDate');
		const inHouseInput = doc.getElementById('orderFormNewInHouseUnit');
		const outFacilityInput = doc.getElementById('orderFormNewOutFacility');
		const pathHint = doc.getElementById('orderFormNewPathHint');

		if (nameInput) nameInput.value = order.order_name || '';
		if (dateInput) {
			dateInput.value = typeof options.formatDateInput === 'function'
				? (options.formatDateInput(order.scheduled_for) || '')
				: (order.scheduled_for || '');
		}

		const locationInRadio = doc.getElementById('orderFormNewLocationIn');
		const locationOutRadio = doc.getElementById('orderFormNewLocationOut');
		const isOutLocation = order.location_type === 'out';

		if (locationOutRadio) locationOutRadio.checked = isOutLocation;
		if (locationInRadio) locationInRadio.checked = !isOutLocation;

		if (typeof options.updateLocationFields === 'function') {
			options.updateLocationFields();
		}

		if (isOutLocation) {
			if (outFacilityInput) outFacilityInput.value = order.out_facility || '';
		} else if (inHouseInput) {
			if (options.preferInHouseUnitId && order.in_house_unit_id) {
				inHouseInput.value = String(order.in_house_unit_id);
			} else if (options.matchInHousePerformerOption && order.in_house_unit) {
				const matchingOption = findPerformerOption(inHouseInput, order.in_house_unit);
				inHouseInput.value = matchingOption ? matchingOption.value : order.in_house_unit;
			} else if (order.in_house_unit || options.clearEmptyInHousePerformer) {
				inHouseInput.value = order.in_house_unit || '';
			}
		}

		if (pathHint) {
			pathHint.textContent = order.group_path || 'Chưa chọn chỉ định nào.';
		}

		return { nameInput, dateInput, inHouseInput, outFacilityInput, pathHint };
	}

	function bindOrderFormShell(options = {}) {
		const doc = options.document || document;
		const bound = {};

		const clearButton = options.clearButton || doc.getElementById('orderClearBtn');
		if (clearButton && typeof options.clearSelectedOrders === 'function') {
			clearButton.addEventListener('click', () => options.clearSelectedOrders());
			bound.clearButton = clearButton;
		}

		const addNewButton = options.addNewButton || doc.getElementById('orderAddNewBtn');
		if (addNewButton && typeof options.resetOrderFormNew === 'function') {
			addNewButton.addEventListener('click', () => {
				options.resetOrderFormNew();
				const nameInput = doc.getElementById('orderFormNewName');
				if (nameInput) nameInput.focus();
			});
			bound.addNewButton = addNewButton;
		}

		const printSelectedPerformerButton = options.printSelectedPerformerButton || doc.getElementById('btnPrintSelectedPerformer');
		if (printSelectedPerformerButton && typeof options.handlePrintSelectedPerformer === 'function') {
			printSelectedPerformerButton.addEventListener('click', () => options.handlePrintSelectedPerformer());
			bound.printSelectedPerformerButton = printSelectedPerformerButton;
		}

		const orderForm = options.form || doc.getElementById('orderFormNew');
		if (orderForm && typeof options.handleSubmit === 'function') {
			orderForm.addEventListener('submit', options.handleSubmit);
			bound.form = orderForm;
		}

		const resetButton = options.resetButton || doc.getElementById('orderFormNewResetBtn');
		if (resetButton && typeof options.resetOrderFormNew === 'function') {
			resetButton.addEventListener('click', () => {
				options.resetOrderFormNew();
				if (typeof options.showToast === 'function') options.showToast('info', 'Đã làm mới form.');
			});
			bound.resetButton = resetButton;
		}

		const cancelButton = options.cancelButton || doc.getElementById('orderFormNewCancelBtn');
		if (cancelButton && typeof options.resetOrderFormNew === 'function') {
			cancelButton.addEventListener('click', () => {
				options.resetOrderFormNew();
				if (typeof options.showToast === 'function') options.showToast('info', 'Đã hủy thao tác.');
			});
			bound.cancelButton = cancelButton;
		}

		doc.querySelectorAll('input[name="orderFormNewLocation"]').forEach(input => {
			if (typeof options.updateLocationFields === 'function') {
				input.addEventListener('change', options.updateLocationFields);
			}
		});

		const defaultLocation = doc.querySelector('input[name="orderFormNewLocation"]:checked');
		if (defaultLocation && defaultLocation.value === 'in' && typeof options.loadOrderPerformers === 'function') {
			options.loadOrderPerformers();
		}

		if (typeof options.setupAutocomplete === 'function') options.setupAutocomplete();

		const dateInput = doc.getElementById('orderFormNewDate');
		if (dateInput && !dateInput.value && typeof options.formatDateInput === 'function') {
			dateInput.value = options.formatDateInput(new Date());
		}

		const bindMockPrint = (button, message) => {
			if (!button) return;
			button.addEventListener('click', () => {
				const hasSelectedOrders = typeof options.hasSelectedOrders === 'function'
					? options.hasSelectedOrders()
					: false;
				if (!hasSelectedOrders) {
					if (typeof options.showToast === 'function') options.showToast('warning', 'Chưa có chỉ định để in.');
					return;
				}
				if (typeof options.showToast === 'function') options.showToast('info', message);
			});
		};

		bindMockPrint(options.printInternalButton || doc.getElementById('orderPrintInternalBtn'), 'Đang chuẩn bị phiếu nội bộ (mock).');
		bindMockPrint(options.printExternalButton || doc.getElementById('orderPrintExternalBtn'), 'Đang chuẩn bị phiếu gửi ngoài (mock).');

		if (typeof options.renderSelectedOrders === 'function') options.renderSelectedOrders();
		return bound;
	}

	function getBootstrapModalApi() {
		if (window.bootstrap && window.bootstrap.Modal) return window.bootstrap.Modal;
		if (typeof bootstrap !== 'undefined' && bootstrap.Modal) return bootstrap.Modal;
		return null;
	}

	function bindOrderModalOpenButton(buttonOrId, options = {}) {
		const doc = options.document || document;
		const button = typeof buttonOrId === 'string' ? doc.getElementById(buttonOrId) : buttonOrId;
		if (!button) return null;

		button.addEventListener('click', async function () {
			const orderModalEl = typeof options.modal === 'string'
				? doc.getElementById(options.modal)
				: (options.modal || doc.getElementById('orderModal'));
			if (!orderModalEl) return;

			if (typeof options.loadCatalog === 'function') await options.loadCatalog();
			if (typeof options.loadOrders === 'function') await options.loadOrders();
			if (typeof options.renderSelectedOrders === 'function') options.renderSelectedOrders();

			const Modal = options.Modal || getBootstrapModalApi();
			if (!Modal || typeof Modal.getOrCreateInstance !== 'function') return;
			const modalInstance = Modal.getOrCreateInstance(orderModalEl);

			const reloadOnShow = async () => {
				if (typeof options.loadOrders === 'function') await options.loadOrders();
				if (typeof options.renderSelectedOrders === 'function') options.renderSelectedOrders();
			};

			orderModalEl.removeEventListener('shown.bs.modal', reloadOnShow);
			orderModalEl.addEventListener('shown.bs.modal', reloadOnShow);
			modalInstance.show();
		});

		return button;
	}

	function editSelectedOrderInForm(entryId, options = {}) {
		const orders = typeof options.getSelectedOrders === 'function'
			? options.getSelectedOrders()
			: [];
		const order = (orders || []).find(item => String(item.tempId) === String(entryId));

		if (!order) {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không tìm thấy chỉ định để chỉnh sửa');
			}
			return { ok: false, reason: 'not_found' };
		}

		const isInHouse = order.location_type === 'in';
		const isCompleted = (order.status || 'draft') === 'completed';
		if (isInHouse && isCompleted) {
			if (typeof options.showToast === 'function') {
				options.showToast('warning', 'Không thể chỉnh sửa chỉ định đã hoàn thành trong cơ sở. Trạng thái này được đồng bộ từ Quản lý chỉ định CLS.');
			}
			return { ok: false, reason: 'locked', order };
		}

		if (typeof options.setEditingOrderId === 'function') {
			options.setEditingOrderId(entryId);
		}

		const { nameInput } = applySelectedOrderToForm(order, {
			document: options.document || document,
			formatDateInput: options.formatDateInput,
			updateLocationFields: options.updateLocationFields,
			...(options.applySelectedOrderOptions || {})
		});

		if (typeof options.updateSubmitButton === 'function') {
			options.updateSubmitButton();
		}

		if (typeof options.focusAutocompleteInput === 'function') {
			options.focusAutocompleteInput(nameInput);
		}

		if (typeof options.showToast === 'function') {
			options.showToast('info', 'Đã tải dữ liệu chỉ định vào form. Chỉnh sửa và nhấn "Cập nhật" để lưu.');
		}

		return { ok: true, order, nameInput };
	}

	function handleOrderFormSubmission(event, options = {}) {
		if (event && typeof event.preventDefault === 'function') {
			event.preventDefault();
		}

		const submission = collectOrderFormSubmission({
			document: options.document || document,
			orderIndex: typeof options.getOrderIndex === 'function' ? options.getOrderIndex() : options.orderIndex,
			includeSurveyTemplate: Boolean(options.includeSurveyTemplate),
			surveyGroupPath: options.surveyGroupPath
		});
		if (!submission.valid) {
			if (typeof options.showToast === 'function') {
				options.showToast('warning', submission.message);
			}
			submission.focusElement?.focus();
			return { ok: false, reason: 'invalid', submission };
		}

		const selectionUtils = options.selectionUtils;
		const result = selectionUtils.upsertOrderFromSubmission(
			typeof options.getSelectedOrders === 'function' ? options.getSelectedOrders() : [],
			submission.orderData,
			{
				editingOrderId: typeof options.getEditingOrderId === 'function' ? options.getEditingOrderId() : null,
				nextOrderTempId: typeof options.getNextOrderTempId === 'function' ? options.getNextOrderTempId() : 1
			}
		);

		if (!result.found) {
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không tìm thấy chỉ định để cập nhật');
			}
			if (typeof options.resetOrderFormNew === 'function') {
				options.resetOrderFormNew();
			}
			return { ok: false, reason: 'not_found', submission, result };
		}

		if (typeof options.setSelectedOrders === 'function') {
			options.setSelectedOrders(result.orders);
		}
		if (typeof options.setNextOrderTempId === 'function') {
			options.setNextOrderTempId(result.nextOrderTempId);
		}
		if (typeof options.renderSelectedOrders === 'function') {
			options.renderSelectedOrders();
		}
		if (typeof options.resetOrderFormNew === 'function') {
			options.resetOrderFormNew();
		}

		const message = typeof options.getSuccessMessage === 'function'
			? options.getSuccessMessage({ result, submission })
			: (result.mode === 'update' ? 'Đã cập nhật chỉ định thành công.' : 'Đã thêm chỉ định vào danh sách.');
		if (typeof options.showToast === 'function') {
			options.showToast('success', message);
		}
		if (typeof options.triggerAutoSave === 'function') {
			options.triggerAutoSave();
		}

		return { ok: true, submission, result };
	}

	function createOrderFormFillAdapter(options = {}) {
		const getDefaultDate = () => typeof options.getDefaultDate === 'function'
			? options.getDefaultDate()
			: (options.defaultDate || '');
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') options.showToast(type, message);
		};

		return {
			addOrderToSelection(orderId) {
				const result = applyOrderCatalogTreeSelection(
					typeof options.getOrderIndex === 'function' ? options.getOrderIndex() : options.orderIndex,
					orderId,
					{
						document: options.document,
						defaultDate: getDefaultDate(),
						updateLocationFields: options.updateLocationFields,
						...(options.applyOrderOptions || {})
					}
				);
				if (!result.applied) {
					showToast('warning', options.orderNotFoundMessage || 'Không tìm thấy thông tin chỉ định');
					return result;
				}

				showToast('info', options.orderAppliedMessage || 'Đã điền thông tin chỉ định vào form. Vui lòng kiểm tra và thêm vào danh sách.');
				return result;
			},

			addSurveyTemplateToSelection(templateId) {
				const numericId = Number(templateId);
				const templates = typeof options.getSurveyTemplates === 'function' ? options.getSurveyTemplates() : (options.surveyTemplates || []);
				const template = (templates || []).find(item => Number(item.id) === numericId);
				if (!template) {
					showToast('warning', options.surveyNotFoundMessage || 'Không tìm thấy bài khảo sát');
					return { applied: false, template: null, templateId: numericId };
				}

				applySurveyTemplateToForm(template, {
					document: options.document,
					defaultDate: getDefaultDate(),
					...(options.applySurveyOptions || {})
				});

				showToast('info', options.surveyAppliedMessage || 'Đã điền bài khảo sát vào form. Vui lòng kiểm tra và thêm vào danh sách.');
				return { applied: true, template, templateId: numericId };
			}
		};
	}

	function createOrderFormControlsAdapter(options = {}) {
		const getDefaultDate = () => typeof options.getDefaultDate === 'function'
			? options.getDefaultDate()
			: (options.defaultDate || '');

		return {
			updateLocationFields() {
				return updateOrderFormLocationFields({
					document: options.document,
					onInHouseSelected: options.onInHouseSelected
				});
			},
			resetForm() {
				return resetOrderForm({
					document: options.document,
					state: typeof options.getState === 'function' ? options.getState() : options.state,
					defaultDate: getDefaultDate(),
					clearSurveyDataset: !!options.clearSurveyDataset,
					updateLocationFields: options.updateLocationFields,
					updateSubmitButton: options.updateSubmitButton
				});
			},
			updateSubmitButton() {
				const state = typeof options.getState === 'function' ? options.getState() : options.state;
				return updateOrderFormSubmitButton({
					document: options.document,
					isEditing: Boolean(state?.editingOrderId)
				});
			}
		};
	}

	function createOrderFormWorkflowAdapter(options = {}) {
		const doc = options.document || document;
		const getState = () => typeof options.getState === 'function'
			? options.getState()
			: options.state;
		const getDefaultDate = () => typeof options.getDefaultDate === 'function'
			? options.getDefaultDate()
			: (options.defaultDate || '');
		const getSelectedOrders = () => {
			if (typeof options.getSelectedOrders === 'function') return options.getSelectedOrders();
			return getState()?.selectedOrders || [];
		};
		const setSelectedOrders = (value) => {
			if (typeof options.setSelectedOrders === 'function') {
				options.setSelectedOrders(value);
				return;
			}
			const state = getState();
			if (state) state.selectedOrders = value;
		};
		const getEditingOrderId = () => typeof options.getEditingOrderId === 'function'
			? options.getEditingOrderId()
			: getState()?.editingOrderId;
		const setEditingOrderId = (value) => {
			if (typeof options.setEditingOrderId === 'function') {
				options.setEditingOrderId(value);
				return;
			}
			const state = getState();
			if (state) state.editingOrderId = value;
		};
		const getNextOrderTempId = () => typeof options.getNextOrderTempId === 'function'
			? options.getNextOrderTempId()
			: getState()?.nextOrderTempId;
		const setNextOrderTempId = (value) => {
			if (typeof options.setNextOrderTempId === 'function') {
				options.setNextOrderTempId(value);
				return;
			}
			const state = getState();
			if (state) state.nextOrderTempId = value;
		};
		let adapter;
		const updateLocationFields = () => adapter.updateLocationFields();
		const updateSubmitButton = () => adapter.updateSubmitButton();
		const controlsAdapter = createOrderFormControlsAdapter({
			document: doc,
			getState,
			getDefaultDate,
			clearSurveyDataset: !!options.clearSurveyDataset,
			onInHouseSelected: options.onInHouseSelected,
			updateLocationFields,
			updateSubmitButton
		});
		const fillAdapter = createOrderFormFillAdapter({
			document: doc,
			getOrderIndex: options.getOrderIndex,
			orderIndex: options.orderIndex,
			getSurveyTemplates: options.getSurveyTemplates,
			surveyTemplates: options.surveyTemplates,
			getDefaultDate,
			updateLocationFields,
			applyOrderOptions: options.applyOrderOptions,
			applySurveyOptions: {
				...(options.applySurveyOptions || {}),
				updateLocationFields
			},
			orderNotFoundMessage: options.orderNotFoundMessage,
			orderAppliedMessage: options.orderAppliedMessage,
			surveyNotFoundMessage: options.surveyNotFoundMessage,
			surveyAppliedMessage: options.surveyAppliedMessage,
			showToast: options.showToast
		});

		adapter = {
			updateLocationFields() {
				return controlsAdapter.updateLocationFields();
			},
			updateSubmitButton() {
				return controlsAdapter.updateSubmitButton();
			},
			resetForm() {
				return controlsAdapter.resetForm();
			},
			addOrderToSelection(orderId) {
				return fillAdapter.addOrderToSelection(orderId);
			},
			addSurveyTemplateToSelection(templateId) {
				return fillAdapter.addSurveyTemplateToSelection(templateId);
			},
			handleSubmit(event) {
				return handleOrderFormSubmission(event, {
					document: doc,
					selectionUtils: options.selectionUtils,
					getOrderIndex: options.getOrderIndex,
					orderIndex: options.orderIndex,
					includeSurveyTemplate: Boolean(options.includeSurveyTemplate),
					surveyGroupPath: options.surveyGroupPath,
					getSelectedOrders,
					setSelectedOrders,
					getEditingOrderId,
					getNextOrderTempId,
					setNextOrderTempId,
					renderSelectedOrders: options.renderSelectedOrders,
					resetOrderFormNew: adapter.resetForm,
					triggerAutoSave: options.triggerAutoSave,
					showToast: options.showToast,
					getSuccessMessage: options.getSuccessMessage
				});
			},
			editOrder(entryId) {
				const focusAutocompleteInput = typeof options.focusAutocompleteInput === 'function'
					? options.focusAutocompleteInput
					: input => options.autocompleteUtils?.focusAutocompleteInput?.(input);
				return editSelectedOrderInForm(entryId, {
					document: doc,
					getSelectedOrders,
					setEditingOrderId,
					formatDateInput: options.formatDateInput,
					updateLocationFields: adapter.updateLocationFields,
					applySelectedOrderOptions: options.applySelectedOrderOptions,
					updateSubmitButton: adapter.updateSubmitButton,
					focusAutocompleteInput,
					showToast: options.showToast
				});
			},
			setupAutocomplete() {
				const autocompleteUtils = options.autocompleteUtils;
				if (!autocompleteUtils || typeof autocompleteUtils.setupOrderFormNewAutocompleteShell !== 'function') {
					return null;
				}

				return autocompleteUtils.setupOrderFormNewAutocompleteShell({
					document: doc,
					getOrderIndex: options.getOrderIndex,
					getSurveyTemplates: options.getSurveyTemplates,
					includeCatalogWhenEmpty: Boolean(options.includeCatalogWhenEmpty),
					emptyCatalogLimit: options.emptyCatalogLimit,
					escapeHtml: options.escapeHtml,
					formatCurrency: options.formatCurrency,
					showSurveyPricing: Boolean(options.showSurveyPricing),
					addSurveyTemplateToSelection: adapter.addSurveyTemplateToSelection,
					applyOrderCatalogItemToForm: (orderData, applyOptions) => applyOrderCatalogItemToForm(orderData, {
						document: doc,
						...(applyOptions || {})
					}),
					updateLocationFields: adapter.updateLocationFields,
					loadOrderPerformers: options.loadOrderPerformers
				});
			}
		};

		return adapter;
	}

	const api = {
		updateOrderFormLocationFields,
		updateOrderFormSubmitButton,
		resetOrderForm,
		collectOrderFormSubmission,
		applyOrderCatalogItemToForm,
		applyOrderCatalogTreeItemToForm,
		applyOrderCatalogTreeSelection,
		applySurveyTemplateToForm,
		applySelectedOrderToForm,
		editSelectedOrderInForm,
		handleOrderFormSubmission,
		createOrderFormFillAdapter,
		createOrderFormControlsAdapter,
		createOrderFormWorkflowAdapter,
		bindOrderFormShell,
		bindOrderModalOpenButton
	};

	window.ClinicalOrderFormUiUtils = api;
	window.DoctorExaminationOrderFormUiUtils = api;
	window.PsychologistExaminationOrderFormUiUtils = api;
})();
