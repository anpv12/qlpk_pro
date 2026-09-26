(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const ORDER_STATE_UTILS = REGISTRY.require('orderSelectionStateUtils');
	const STATUS_UTILS = REGISTRY.require('orderStatusUtils');
	const AUTOCOMPLETE_UTILS = REGISTRY.require('orderAutocompleteUtils');
	const CONFIRMATION_DIALOG = REGISTRY.require('confirmationDialog');

	const DEFAULT_DOM = {
		root: 'doctorIndicationsPanel',
		name: 'doctorIndicationName',
		nameDropdown: 'doctorIndicationNameDropdown',
		locationFieldset: 'doctorIndicationLocationFieldset',
		performerGroup: 'doctorIndicationPerformerGroup',
		performer: 'doctorIndicationPerformer',
		outFacilityGroup: 'doctorIndicationOutFacilityGroup',
		outFacility: 'doctorIndicationOutFacility',
		date: 'doctorIndicationDate',
		submit: 'doctorIndicationSubmit',
		cancelEdit: 'doctorIndicationCancelEdit',
		message: 'doctorIndicationsMessage',
		count: 'doctorIndicationsCount',
		list: 'doctorIndicationsList'
	};

	const DEFAULT_ENDPOINTS = {
		appointment: ({ appointmentId }) => `/api/chi-dinh/appointment/${appointmentId}`,
		surveyTemplates: '/api/survey-templates-for-orders',
		performers: '/users/doctors'
	};
	const MAX_ORDER_NAME_LENGTH = 255;
	const VALID_SOURCES = Object.freeze(['custom', 'survey']);

	const DEFAULT_CONFIG = {
		rootId: DEFAULT_DOM.root,
		strictRoot: true,
		dom: DEFAULT_DOM,
		endpoints: DEFAULT_ENDPOINTS
	};

	const mergeConfig = config => RUNTIME.mergeConfig(DEFAULT_CONFIG, config, ['dom', 'endpoints']);

	function create(options = {}) {
		const config = mergeConfig(options.config);
		const {
			getElement,
			textOf,
			normalizeId,
			escapeHtml,
			escapeAttr,
			requestJson,
			showToast,
			isCurrentToken,
			cloneDraftValue,
			draftRowsWithoutRuntimeIds,
			markRestoredRows,
			changedRowIndexes
		} = RUNTIME;

		const STATE = {
			bound: false,
			apiCall: null,
			contextToken: 0,
			appointmentId: null,
			patientId: null,
			defaultDate: '',
			isLoading: null,
			rows: [],
			surveyTemplates: [],
			surveyIndex: new Map(),
			selectedSurvey: null,
			surveyLoaded: false,
			autocomplete: null,
			performers: [],
			performersLoaded: false,
			ordersLoaded: false,
			ordersDirty: false,
			ordersRevision: 0,
			realtimePending: false,
			realtimeRequest: 0,
			saving: false,
			editingTempId: null
		};
		const CHANGES = RUNTIME.createChangeTracker(STATE, { revisionKey: 'ordersRevision', dirtyKey: 'ordersDirty' });

		function getDocument(context = {}) {
			return RUNTIME.getScopedDocument(context, config);
		}

		function domId(name) {
			return config.dom[name] || name;
		}

		function el(doc, name) {
			return getElement(doc, domId(name));
		}

		function endpoint(name, args = {}) {
			const value = config.endpoints[name];
			return typeof value === 'function' ? value(args) : String(value || '');
		}

		function currentToken(token, appointmentId = STATE.appointmentId) {
			return isCurrentToken(STATE, token, appointmentId);
		}

		function normalizeLocation(value) {
			return value === 'out' || value === 'external' ? 'out' : 'in';
		}

		function normalizeSource(value) {
			const source = String(value || '').toLowerCase();
			return VALID_SOURCES.includes(source) ? source : 'custom';
		}

		function sourceForRow(row = {}) {
			if (normalizeId(row.survey_template_id)) return 'survey';
			return 'custom';
		}

		function buildSurveyIndex(items = []) {
			const index = new Map();
			items.forEach(item => {
				const id = normalizeId(item.id);
				const name = textOf(item.name);
				if (!id || !name) return;
				index.set(Number(id), { ...item, id: Number(id), name });
			});
			return index;
		}

		function formatDate(value) {
			if (!value) return '—';
			const raw = String(value).slice(0, 10);
			const parts = raw.split('-');
			return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw;
		}

		function normalizeDateInputValue(value) {
			const raw = textOf(value);
			const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
			if (!match) return '';

			const [year, month, day] = match[1].split('-').map(Number);
			const parsed = new Date(Date.UTC(year, month - 1, day));
			if (
				Number.isNaN(parsed.getTime())
				|| parsed.getUTCFullYear() !== year
				|| parsed.getUTCMonth() !== month - 1
				|| parsed.getUTCDate() !== day
			) return '';

			return match[1];
		}

		function getStatusConfig(status) {
			return STATUS_UTILS.getOrderStatusConfig(status);
		}

		function getPerformerName(row) {
			return row.location_type === 'in'
				? (row.in_house_unit || '')
				: (row.out_facility || '');
		}

		function clearNameSelection(doc, options = {}) {
			STATE.selectedSurvey = null;
			const input = el(doc, 'name');
			if (input) {
				if (options.clearText !== false) input.value = '';
				input.removeAttribute('aria-invalid');
			}
			if (options.hide !== false && STATE.autocomplete?.hide) STATE.autocomplete.hide();
		}

		function setSurveySelection(doc, item = {}) {
			const id = normalizeId(item.id || item.survey_template_id);
			const name = textOf(item.name || item.order_name);
			if (!id || !name) {
				clearNameSelection(doc);
				return false;
			}
			STATE.selectedSurvey = { ...item, id: Number(id), name };
			const input = el(doc, 'name');
			if (input) {
				input.value = name;
				input.removeAttribute('aria-invalid');
			}
			const performer = el(doc, 'performer');
			const defaultPerformerId = normalizeId(item.default_performer_id);
			if (performer) {
				const matchingOption = defaultPerformerId
					? Array.from(performer.options || []).find(option => String(option.value) === String(defaultPerformerId))
					: null;
				performer.value = matchingOption ? String(defaultPerformerId) : '';
			}
			return true;
		}

		function syncNameDropdownGeometry(doc) {
			const input = el(doc, 'name');
			const dropdown = STATE.autocomplete?.dropdown || el(doc, 'nameDropdown');
			if (!input || !dropdown) return;
			const ownerDocument = input.ownerDocument;
			const view = ownerDocument && ownerDocument.defaultView;
			if (!view || typeof input.getBoundingClientRect !== 'function') return;

			const inputRect = input.getBoundingClientRect();
			const rootFontSize = Number.parseFloat(view.getComputedStyle(ownerDocument.documentElement).fontSize) || 16;
			const menuGap = rootFontSize * 0.2;
			const viewportPadding = rootFontSize * 0.5;
			const availableBelow = Math.max(0, view.innerHeight - inputRect.bottom - menuGap - viewportPadding);
			const availableAbove = Math.max(0, inputRect.top - menuGap - viewportPadding);
			const opensUpward = availableBelow < rootFontSize * 12 && availableAbove > availableBelow;
			const availableBlockSize = opensUpward ? availableAbove : availableBelow;

			dropdown.classList.toggle('doctor-indications-autocomplete__dropdown--upward', opensUpward);
			dropdown.style.setProperty('--doctor-indication-dropdown-inline-start', `${Math.round(inputRect.left)}px`);
			dropdown.style.setProperty('--doctor-indication-dropdown-inline-size', `${Math.round(inputRect.width)}px`);
			dropdown.style.setProperty('--doctor-indication-dropdown-max-block-size', `${Math.floor(availableBlockSize)}px`);
			dropdown.style.setProperty(
				'--doctor-indication-dropdown-block-start',
				opensUpward ? 'auto' : `${Math.round(inputRect.bottom + menuGap)}px`
			);
			dropdown.style.setProperty(
				'--doctor-indication-dropdown-block-end',
				opensUpward ? `${Math.round(view.innerHeight - inputRect.top + menuGap)}px` : 'auto'
			);
		}

		function bindNameDropdownGeometry(doc, input, dropdown) {
			const sync = () => syncNameDropdownGeometry(doc);
			const syncIfOpen = () => {
				if (dropdown.classList.contains('is-open')) sync();
			};
			input.addEventListener('focus', sync);
			input.addEventListener('input', sync);
			const ownerDocument = input.ownerDocument;
			const view = ownerDocument && ownerDocument.defaultView;
			if (ownerDocument) ownerDocument.addEventListener('scroll', syncIfOpen, true);
			if (view) {
				view.addEventListener('resize', syncIfOpen);
				if (typeof view.MutationObserver === 'function') {
					const observer = new view.MutationObserver(syncIfOpen);
					observer.observe(dropdown, { attributes: true, attributeFilter: ['class'] });
				}
			}
			return sync;
		}

		function setupNameAutocomplete(doc) {
			if (STATE.autocomplete) return true;
			const input = el(doc, 'name');
			const dropdown = el(doc, 'nameDropdown');
			if (!input || !dropdown) return false;

			STATE.autocomplete = AUTOCOMPLETE_UTILS.setupOrderFormAutocomplete({
				document: doc,
				nameInput: input,
				dropdown,
				getSurveyTemplates: () => STATE.surveyTemplates,
				isEnabled: () => Boolean(STATE.appointmentId && STATE.ordersLoaded && STATE.surveyLoaded && !STATE.saving),
				normalizeSearch: true,
				selectFirstOnEnter: true,
				showSurveyDescription: false,
				emptyText: 'Không có mẫu khảo sát phù hợp; bạn vẫn có thể nhập tên tự do.',
				escapeHtml,
				onInput: () => clearNameSelection(doc, { clearText: false, hide: false }),
				onSurveySelect: (surveyId, context) => {
					const item = STATE.surveyIndex.get(Number(surveyId));
					if (!item || !setSurveySelection(doc, item)) return;
					context.hide();
					setMessage(doc);
				}
			});
			STATE.syncNameDropdownGeometry = bindNameDropdownGeometry(doc, input, dropdown);
			return Boolean(STATE.autocomplete);
		}

		function renderActionButton(action, title, attrs = {}) {
			const iconSystem = REGISTRY.get('iconSystem');
			if (iconSystem && typeof iconSystem.renderActionButton === 'function') {
				return iconSystem.renderActionButton({
					action,
					title,
					label: title,
					attrs,
					className: 'doctor-indications-table__action'
				});
			}
			const icon = action === 'delete' ? 'trash3' : 'pencil';
			return `<button data-qlpk-button="${action === 'delete' ? 'danger' : 'edit'}" data-qlpk-button-variant="soft" type="button" class="doctor-indications-table__action" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"${Object.entries(attrs).map(([key, value]) => ` ${escapeAttr(key)}="${escapeAttr(value)}"`).join('')}><i class="bi bi-${icon}" aria-hidden="true"></i></button>`;
		}

		function normalizeRow(item = {}) {
			const id = normalizeId(item.id);
			const tempId = item.tempId || id || `ind-${STATE.rows.length + 1}`;
			return {
				uid: item.uid || String(tempId),
				id,
				tempId,
				source: normalizeSource(item.source || sourceForRow(item)),
				order_name: textOf(item.order_name || item.name),
				location_type: normalizeLocation(item.location_type),
				in_house_unit_id: normalizeId(item.in_house_unit_id),
				in_house_unit: textOf(item.in_house_unit),
				out_facility: textOf(item.out_facility),
				scheduled_for: textOf(item.scheduled_for),
				status: item.status || 'sent',
				is_completed: Boolean(item.is_completed),
				survey_template_id: normalizeId(item.survey_template_id)
			};
		}

		function mapServerRows(items = []) {
			return (items || []).map(item => normalizeRow(item));
		}

		function buildSavePayload() {
			return ORDER_STATE_UTILS.buildOrdersSavePayload(STATE.rows, {
				nullEmptyInHouseUnitId: true,
				emptyStringInHouseUnit: true,
				includeSurveyTemplate: true
			});
		}

		function setMessage(doc, message = '', type = 'info') {
			const messageEl = el(doc, 'message');
			if (!messageEl) return;
			messageEl.textContent = message;
			messageEl.dataset.type = message ? type : '';
			messageEl.hidden = !message;
		}

		function setFormReady(doc) {
			const ready = Boolean(
				STATE.appointmentId
				&& STATE.ordersLoaded
				&& STATE.surveyLoaded
				&& STATE.performersLoaded
				&& !STATE.saving
			);
			['name', 'performer', 'outFacility', 'date', 'submit'].forEach(name => {
				const control = el(doc, name);
				if (control) control.disabled = !ready;
			});
			const fieldset = el(doc, 'locationFieldset');
			if (fieldset) fieldset.disabled = !ready;
			const cancel = el(doc, 'cancelEdit');
			if (cancel) cancel.disabled = !ready;
			updateLocationFields(doc);
		}

		function updateLocationFields(doc) {
			const selected = doc.querySelector('input[name="doctorIndicationLocation"]:checked');
			const location = normalizeLocation(selected && selected.value);
			const performerGroup = el(doc, 'performerGroup');
			const outGroup = el(doc, 'outFacilityGroup');
			if (performerGroup) performerGroup.hidden = location !== 'in';
			if (outGroup) outGroup.hidden = location !== 'out';
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			if (performer) performer.required = location === 'in';
			if (outFacility) outFacility.required = location === 'out';
		}

		function renderNameField(doc) {
			const input = el(doc, 'name');
			if (!input) return;
			if (!STATE.appointmentId) input.placeholder = 'Chưa chọn lượt khám';
			else if (!STATE.surveyLoaded) input.placeholder = 'Đang tải mẫu khảo sát...';
			else input.placeholder = 'Tìm khảo sát hoặc nhập tên';
		}

		function renderPerformers(doc) {
			const select = el(doc, 'performer');
			if (!select) return;
			const currentValue = select.value;
			select.innerHTML = '<option value="">Chọn người thực hiện</option>' + STATE.performers.map(user => {
				const id = normalizeId(user.id || user.user_id);
				const name = textOf(user.full_name || user.name || user.username);
				return id && name ? `<option value="${escapeAttr(id)}" data-user-name="${escapeAttr(name)}">${escapeHtml(name)}</option>` : '';
			}).join('');
			if (currentValue && select.querySelector(`option[value="${CSS.escape(currentValue)}"]`)) select.value = currentValue;
		}

		function renderCurrentRows(doc) {
			const list = el(doc, 'list');
			const count = el(doc, 'count');
			if (count) count.textContent = `${STATE.rows.length} chỉ định`;
			if (!list) return;
			if (!STATE.rows.length) {
				list.innerHTML = '<tr class="doctor-indications-table__empty"><td colspan="6"><i class="bi bi-clipboard2-x qlpk-section-icon" aria-hidden="true"></i><span>Chưa có chỉ định trong lượt khám này.</span></td></tr>';
				return;
			}
			list.innerHTML = STATE.rows.map((row, index) => {
				const status = getStatusConfig(row.status);
				const locked = (row.status === 'completed' || (row.survey_template_id && ['survey_sent', 'has_result'].includes(row.status)));
				const performer = getPerformerName(row) || '—';
				return `<tr data-doctor-indication-row="${escapeAttr(row.tempId)}">
					<td>${index + 1}</td>
					<td><strong>${escapeHtml(row.order_name || 'Chưa có tên')}</strong> <span class="qlpk-feedback-token doctor-indications-location-badge">${row.location_type === 'in' ? 'Trong cơ sở' : 'Ngoài cơ sở'}</span></td>
					<td>${escapeHtml(performer)}</td>
					<td>${formatDate(row.scheduled_for)}</td>
					<td><span class="qlpk-status doctor-indications-status ${escapeAttr(status.className || '')}">${escapeHtml(status.label || row.status || 'Chuyển thực hiện')}</span></td>
					<td>${renderActionButton('edit', locked ? 'Không thể sửa chỉ định đã hoàn thành' : 'Sửa chỉ định', { 'data-doctor-indication-action': 'edit', 'data-doctor-indication-id': row.tempId, disabled: locked })}${renderActionButton('delete', 'Xóa chỉ định', { 'data-doctor-indication-action': 'delete', 'data-doctor-indication-id': row.tempId })}</td>
				</tr>`;
			}).join('');
		}

		function render(doc) {
			if (!el(doc, 'root')) return false;
			renderNameField(doc);
			renderPerformers(doc);
			renderCurrentRows(doc);
			setFormReady(doc);
			return true;
		}

		function setSubmitMode(doc, editing) {
			const submit = el(doc, 'submit');
			if (!submit) return;
			submit.innerHTML = editing
				? '<i class="bi bi-check-circle qlpk-button-icon" aria-hidden="true"></i><span>Cập nhật</span>'
				: '<i class="bi bi-plus-circle qlpk-button-icon" aria-hidden="true"></i><span>Thêm chỉ định</span>';
		}

		function resetForm(doc) {
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			const date = el(doc, 'date');
			const inLocation = doc.getElementById('doctorIndicationLocationIn');
			clearNameSelection(doc);
			if (performer) performer.value = '';
			if (outFacility) outFacility.value = '';
			if (date) date.value = normalizeDateInputValue(STATE.defaultDate);
			if (inLocation) inLocation.checked = true;
			STATE.editingTempId = null;
			setSubmitMode(doc, false);
			const cancel = el(doc, 'cancelEdit');
			if (cancel) cancel.hidden = true;
			updateLocationFields(doc);
			if (STATE.realtimePending && !STATE.ordersDirty) refreshCurrent({ document: doc });
		}

		function startEdit(doc, tempId) {
			const row = STATE.rows.find(item => String(item.tempId) === String(tempId));
			if (!row) return false;
			if ((row.status === 'completed' || (row.survey_template_id && ['survey_sent', 'has_result'].includes(row.status)))) {
				showToast('warning', 'Không thể sửa chỉ định đã hoàn thành trong cơ sở.');
				return false;
			}
			const nameInput = el(doc, 'name');
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			const date = el(doc, 'date');
			const source = sourceForRow(row);
			clearNameSelection(doc);
			if (source === 'survey') setSurveySelection(doc, STATE.surveyIndex.get(Number(row.survey_template_id)) || row);
			else {
				const input = el(doc, 'name');
				if (input) input.value = row.order_name || '';
			}
			if (performer) performer.value = row.in_house_unit_id ? String(row.in_house_unit_id) : '';
			if (outFacility) outFacility.value = row.out_facility || '';
			if (date) date.value = normalizeDateInputValue(row.scheduled_for);
			const outLocation = doc.getElementById('doctorIndicationLocationOut');
			const inLocation = doc.getElementById('doctorIndicationLocationIn');
			const isOut = row.location_type === 'out';
			if (outLocation) outLocation.checked = isOut;
			if (inLocation) inLocation.checked = !isOut;
			STATE.editingTempId = row.tempId;
			setSubmitMode(doc, true);
			const cancel = el(doc, 'cancelEdit');
			if (cancel) cancel.hidden = false;
			updateLocationFields(doc);
			if (nameInput) nameInput.focus();
			return true;
		}

		function readForm(doc) {
			const nameInput = el(doc, 'name');
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			const date = el(doc, 'date');
			const selectedLocation = doc.querySelector('input[name="doctorIndicationLocation"]:checked');
			const locationType = normalizeLocation(selectedLocation && selectedLocation.value);
			const selectedSurvey = STATE.selectedSurvey;
			const typedName = textOf(nameInput && nameInput.value);
			const selectedSurveyId = normalizeId(selectedSurvey && selectedSurvey.id);
			const selectedSurveyName = textOf(selectedSurvey && selectedSurvey.name);
			const hasSelectedSurvey = Boolean(selectedSurveyId && selectedSurveyName && typedName === selectedSurveyName);
			const source = hasSelectedSurvey ? 'survey' : 'custom';
			const orderName = typedName;
			const surveyTemplateId = hasSelectedSurvey ? selectedSurveyId : null;
			if (orderName.length > MAX_ORDER_NAME_LENGTH) {
				if (nameInput) nameInput.setAttribute('aria-invalid', 'true');
				return { valid: false, message: `Tên chỉ định tối đa ${MAX_ORDER_NAME_LENGTH} ký tự.`, focus: nameInput };
			}
			const scheduledFor = textOf(date && date.value);
			const outFacilityName = textOf(outFacility && outFacility.value);
			const performerId = normalizeId(performer && performer.value);
			const performerOption = performer && performer.selectedOptions ? performer.selectedOptions[0] : null;
			const performerName = textOf(performerOption && (performerOption.dataset.userName || performerOption.textContent));
			if (!typedName) {
				if (nameInput) nameInput.setAttribute('aria-invalid', 'true');
				return { valid: false, message: 'Nhập tên chỉ định hoặc chọn một mẫu khảo sát.', focus: nameInput };
			}
			if (!scheduledFor) return { valid: false, message: 'Chọn ngày chỉ định.', focus: date };
			if (locationType === 'in' && !performerId) return { valid: false, message: 'Chọn người thực hiện trong cơ sở.', focus: performer };
			if (locationType === 'out' && !outFacilityName) return { valid: false, message: 'Nhập cơ sở thực hiện bên ngoài.', focus: outFacility };
			return {
				valid: true,
				data: {
					survey_template_id: surveyTemplateId,
					order_name: orderName,
					location_type: locationType,
					in_house_unit_id: locationType === 'in' ? performerId : null,
					in_house_unit: locationType === 'in' ? performerName : '',
					out_facility: locationType === 'out' ? outFacilityName : '',
					scheduled_for: scheduledFor,
					source,
					status: 'sent',
					is_completed: false
				}
			};
		}

		function markDirty() {
			CHANGES.mark();
		}

		function handleSubmit(doc) {
			if (!STATE.ordersLoaded) return;
			const validation = readForm(doc);
			if (!validation.valid) {
				setMessage(doc, validation.message, 'warning');
				if (validation.focus && typeof validation.focus.focus === 'function') validation.focus.focus();
				return;
			}
			const existingIndex = STATE.rows.findIndex(row => String(row.tempId) === String(STATE.editingTempId));
			if (existingIndex >= 0) {
				const existing = STATE.rows[existingIndex];
				STATE.rows[existingIndex] = normalizeRow({ ...existing, ...validation.data, tempId: existing.tempId, uid: existing.uid, status: existing.status, is_completed: existing.is_completed });
			} else {
				STATE.rows.push(normalizeRow({ ...validation.data, tempId: `ind-${Date.now()}-${STATE.rows.length + 1}` }));
			}
			markDirty();
			resetForm(doc);
			renderCurrentRows(doc);
			setFormReady(doc);
			setMessage(doc, existingIndex >= 0 ? 'Đã cập nhật chỉ định trong lượt khám. Nhấn Lưu để ghi nhận.' : 'Đã thêm chỉ định vào lượt khám. Nhấn Lưu để ghi nhận.', 'success');
		}

		async function handleDelete(doc, tempId) {
			const row = STATE.rows.find(item => String(item.tempId) === String(tempId));
			if (!row) return false;
			const confirmed = await CONFIRMATION_DIALOG.confirm({
				title: 'Xóa chỉ định?',
				text: `Chỉ định "${row.order_name}" sẽ được xóa khi bạn nhấn Lưu.`,
				icon: 'warning',
				variant: 'danger',
				confirmText: 'Xóa chỉ định',
				cancelText: 'Hủy',
				showToast,
				failureMessage: 'Không thể mở hộp thoại xác nhận. Vui lòng tải lại trang.'
			});
			if (!confirmed) return false;
			STATE.rows = STATE.rows.filter(item => String(item.tempId) !== String(tempId));
			if (String(STATE.editingTempId) === String(tempId)) resetForm(doc);
			markDirty();
			renderCurrentRows(doc);
			setMessage(doc, 'Đã xóa khỏi danh sách. Nhấn Lưu để ghi nhận.', 'success');
			return true;
		}

		async function loadCurrent(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await requestJson(endpoint('appointment', { appointmentId }), { method: 'GET' });
				if (!currentToken(token, appointmentId)) return false;
				STATE.rows = mapServerRows(data?.chi_dinh || []);
				STATE.ordersLoaded = true;
				CHANGES.reset();
				renderCurrentRows(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) setMessage(doc, 'Không thể tải chỉ định của lượt khám. Vui lòng thử lại.', 'error');
				return false;
			}
		}

		async function refreshCurrent(options = {}) {
			const doc = getDocument(options);
			if (!STATE.appointmentId) return false;
			STATE.realtimePending = true;
			if (!STATE.ordersLoaded || STATE.saving) return false;
			if (STATE.ordersDirty || STATE.editingTempId) {
				setMessage(doc, 'Có cập nhật chỉ định. Lưu hoặc kết thúc chỉnh sửa để xem dữ liệu mới.', 'info');
				return false;
			}
			const appointmentId = STATE.appointmentId;
			const token = STATE.contextToken;
			const revision = CHANGES.capture();
			const request = ++STATE.realtimeRequest;
			try {
				const data = await requestJson(endpoint('appointment', { appointmentId }), { method: 'GET' });
				if (!currentToken(token, appointmentId) || request !== STATE.realtimeRequest) return false;
				if (STATE.saving || STATE.ordersDirty || STATE.editingTempId || CHANGES.changedSince(revision)) return false;
				STATE.rows = mapServerRows(data?.chi_dinh || []);
				STATE.realtimePending = false;
				renderCurrentRows(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) setMessage(doc, 'Chưa cập nhật được chỉ định. Vui lòng thử lại.', 'error');
				return false;
			}
		}

		async function loadSurveyTemplates(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await requestJson(endpoint('surveyTemplates'), { method: 'GET' });
				if (!currentToken(token, appointmentId)) return false;
				STATE.surveyTemplates = Array.isArray(data?.data) ? data.data : [];
				STATE.surveyIndex = buildSurveyIndex(STATE.surveyTemplates);
				STATE.surveyLoaded = true;
				renderNameField(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) {
					STATE.surveyTemplates = [];
					STATE.surveyIndex = new Map();
					STATE.surveyLoaded = true;
					renderNameField(doc);
				}
				return true;
			}
		}

		async function loadPerformers(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await requestJson(endpoint('performers'), { method: 'GET' });
				if (!currentToken(token, appointmentId)) return false;
				STATE.performers = Array.isArray(data) ? data : [];
				STATE.performersLoaded = true;
				renderPerformers(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) setMessage(doc, 'Không thể tải người thực hiện. Vui lòng thử lại.', 'error');
				return false;
			}
		}

		function resetContextData(doc) {
			STATE.realtimePending = false;
			STATE.realtimeRequest += 1;
			STATE.rows = [];
			STATE.surveyTemplates = [];
			STATE.surveyIndex = new Map();
			STATE.selectedSurvey = null;
			STATE.surveyLoaded = false;
			STATE.performers = [];
			STATE.performersLoaded = false;
			STATE.ordersLoaded = false;
			CHANGES.reset();
			STATE.saving = false;
			STATE.editingTempId = null;
			renderNameField(doc);
			renderPerformers(doc);
			resetForm(doc);
			renderCurrentRows(doc);
			setFormReady(doc);
		}

		async function save(options = {}) {
			const doc = getDocument(options);
			const appointmentId = RUNTIME.getCurrentAppointmentId(STATE);
			if (!appointmentId) return { skipped: true, reason: 'missing-appointment', module: 'indications' };
			if (STATE.isLoading && STATE.isLoading()) return { skipped: true, reason: 'loading', module: 'indications' };
			if (!STATE.ordersLoaded) throw new Error('Chưa tải xong chỉ định của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			if (STATE.saving) return { skipped: true, reason: 'saving', module: 'indications' };
			const revision = CHANGES.capture();
			STATE.saving = true;
			setFormReady(doc);
			try {
				const refreshed = await ORDER_STATE_UTILS.refreshSelectedOrderStatusesBeforeSave({
					apiCall: (url, requestOptions) => STATE.apiCall(url, requestOptions),
					appointmentId,
					getSelectedOrders: () => STATE.rows,
					setSelectedOrders: value => { STATE.rows = value.map(normalizeRow); },
					console,
					getCurrentAppointmentId: () => RUNTIME.getCurrentAppointmentId(STATE)
				});
				if (refreshed.canceled) return { skipped: true, reason: 'stale-context', module: 'indications' };
				const data = await requestJson(endpoint('appointment', { appointmentId }), {
					method: 'POST',
					body: { chi_dinh: buildSavePayload() }
				});
				const saved = CHANGES.settle(revision);
				if (saved) {
					STATE.rows = mapServerRows(data?.chi_dinh || []);
					renderCurrentRows(doc);
				}
				showToast(saved ? 'success' : 'info', saved ? 'Đã lưu chỉ định.' : 'Đã lưu chỉ định trước đó; thay đổi mới vẫn chưa lưu.', options);
				return { status: 'success', module: 'indications', data, hasNewChanges: !saved };
			} finally {
				STATE.saving = false;
				setFormReady(doc);
				if (STATE.realtimePending && !STATE.ordersDirty) refreshCurrent(options);
			}
		}

		function getDraftSnapshot() {
			return { rows: draftRowsWithoutRuntimeIds(STATE.rows) };
		}

		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			const doc = getDocument(restoreOptions);
			STATE.rows = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map(row => normalizeRow(cloneDraftValue(row)));
			CHANGES.restore(restoreOptions.dirty);
			renderCurrentRows(doc);
			setFormReady(doc);
			return true;
		}

		function bind(bindOptions = {}) {
			const doc = getDocument(bindOptions);
			const root = el(doc, 'root');
			if (!root || STATE.bound) return Boolean(root);
			STATE.isLoading = bindOptions.isLoading || STATE.isLoading;
			STATE.apiCall = bindOptions.apiCall || STATE.apiCall;
			RUNTIME.configure(bindOptions);
			if (!setupNameAutocomplete(doc)) {
				throw new Error('Không khởi tạo được ô tên chỉ định');
			}
			root.addEventListener('click', event => {
				const action = event.target.closest('[data-doctor-indication-action]');
				if (action) {
					const rowId = action.dataset.doctorIndicationId;
					if (action.dataset.doctorIndicationAction === 'edit') startEdit(doc, rowId);
					if (action.dataset.doctorIndicationAction === 'delete') handleDelete(doc, rowId);
					return;
				}
				if (event.target.closest(`#${domId('submit')}`)) handleSubmit(doc);
				if (event.target.closest(`#${domId('cancelEdit')}`)) resetForm(doc);
			});
			root.querySelectorAll('input[name="doctorIndicationLocation"]').forEach(input => {
				input.addEventListener('change', () => updateLocationFields(doc));
			});
			STATE.bound = true;
			render(doc);
			return true;
		}

		function clear(options = {}) {
			STATE.realtimePending = false;
			STATE.realtimeRequest += 1;
			const doc = getDocument(options);
			STATE.contextToken += 1;
			STATE.appointmentId = null;
			STATE.patientId = null;
			STATE.defaultDate = '';
			resetContextData(doc);
		}

		function load(context = {}) {
			const doc = getDocument(context);
			const appointment = context.payload || context.appointment || {};
			const appointmentId = normalizeId(context.appointmentId || appointment.id || appointment.appointment?.id);
			const patient = context.patientId || appointment.patient_id || appointment.patient_info?.id || appointment.patient?.id;
			if (!appointmentId) return Promise.resolve(false);
			STATE.contextToken += 1;
			const token = STATE.contextToken;
			STATE.appointmentId = appointmentId;
			STATE.patientId = normalizeId(patient);
			STATE.defaultDate = normalizeDateInputValue(context.appointmentDate || appointment.appointment_date || appointment.appointment?.appointment_date);
			resetContextData(doc);
			const loadTasks = [
				loadCurrent({ doc, token, appointmentId }),
				loadPerformers({ doc, token, appointmentId }),
				loadSurveyTemplates({ doc, token, appointmentId })
			];
			return Promise.allSettled(loadTasks).then(results => {
				if (currentToken(token, appointmentId)) setFormReady(doc);
				if (currentToken(token, appointmentId) && STATE.realtimePending) refreshCurrent(context);
				return results.every(result => result.status === 'fulfilled' && result.value === true);
			});
		}

		return {
			bind,
			clear,
			load,
			refreshCurrent,
			populate: load,
			render,
			collect: buildSavePayload,
			save,
			hasUnsavedChanges: () => Boolean(STATE.ordersDirty),
			getDraftSnapshot,
			restoreDraftSnapshot,
			markRestoredRows: (doc, baseRows, draftRows) => markRestoredRows(getDocument({ document: doc }), '[data-doctor-indication-row]', changedRowIndexes(baseRows, draftRows)),
			getState: () => STATE,
			getConfig: () => ({ ...config, dom: { ...config.dom }, endpoints: { ...config.endpoints } })
		};
	}

	REGISTRY.register('indicationsForm', { create, defaults: mergeConfig() }, {
		dependencies: ['supportRuntime', 'componentDomScope', 'iconSystem', 'confirmationDialog', 'orderSelectionStateUtils', 'orderStatusUtils', 'orderAutocompleteUtils'],
		owner: 'doctor/indications'
	});
})(window, document);
