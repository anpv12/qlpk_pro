(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const ORDER_STATE_UTILS = REGISTRY.get('orderSelectionStateUtils') || window.ClinicalOrderSelectionStateUtils || {};
	const STATUS_UTILS = REGISTRY.get('orderStatusUtils') || window.ClinicalOrderStatusUtils || {};
	const AUTOCOMPLETE_UTILS = window.ClinicalOrderAutocompleteUtils || {};

	const DEFAULT_DOM = {
		root: 'doctorIndicationsPanel',
		catalog: 'doctorIndicationCatalog',
		catalogId: 'doctorIndicationCatalogId',
		catalogDropdown: 'doctorIndicationCatalogDropdown',
		sourceFieldset: 'doctorIndicationSourceFieldset',
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
		list: 'doctorIndicationsList',
		historyToggle: 'doctorIndicationsHistoryToggle',
		historyPanel: 'doctorIndicationsHistory',
		historyCount: 'doctorIndicationsHistoryCount',
		historyList: 'doctorIndicationsHistoryList'
	};

	const DEFAULT_ENDPOINTS = {
		appointment: ({ appointmentId }) => `/api/chi-dinh/appointment/${appointmentId}`,
		catalog: '/api/order-items?include_inactive=true',
		surveyTemplates: '/api/survey-templates-for-orders',
		performers: '/users/doctors',
		history: ({ patientId, appointmentId }) => `/api/chi-dinh/patient/${patientId}?exclude_appointment_id=${appointmentId || ''}`
	};
	const MAX_ORDER_NAME_LENGTH = 255;

	const DEFAULT_CONFIG = {
		rootId: DEFAULT_DOM.root,
		strictRoot: true,
		dom: DEFAULT_DOM,
		endpoints: DEFAULT_ENDPOINTS
	};

	function mergeConfig(config = {}) {
		return {
			...DEFAULT_CONFIG,
			...config,
			dom: { ...DEFAULT_DOM, ...(config.dom || {}) },
			endpoints: { ...DEFAULT_ENDPOINTS, ...(config.endpoints || {}) }
		};
	}

	function create(options = {}) {
		const config = mergeConfig(options.config);
		const {
			getDocument: getRuntimeDocument,
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
			source: 'catalog',
			isLoading: null,
			rows: [],
			catalog: [],
			catalogIndex: new Map(),
			selectedCatalog: null,
			surveyTemplates: [],
			surveyIndex: new Map(),
			selectedSurvey: null,
			surveyLoaded: false,
			autocomplete: null,
			syncCatalogDropdownGeometry: null,
			performers: [],
			performersLoaded: false,
			catalogLoaded: false,
			ordersLoaded: false,
			ordersDirty: false,
			ordersRevision: 0,
			saving: false,
			editingTempId: null,
			history: [],
			historyLoaded: false,
			historyLoading: false,
			historyRequestToken: 0
		};

		function getDocument(context = {}) {
			const sourceDocument = getRuntimeDocument(context);
			const scope = REGISTRY.get('componentDomScope');
			if (!scope || typeof scope.create !== 'function') return sourceDocument;
			return scope.create({ document: sourceDocument, rootId: config.rootId, strictRoot: config.strictRoot });
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
			return ['catalog', 'custom', 'survey'].includes(String(value || '').toLowerCase())
				? String(value).toLowerCase()
				: 'catalog';
		}

		function sourceForRow(row = {}) {
			if (normalizeId(row.survey_template_id)) return 'survey';
			if (normalizeId(row.order_id || row.order_item_id)) return 'catalog';
			return 'custom';
		}

		function getSelectedSource(doc) {
			const selected = doc.querySelector('input[name="doctorIndicationSource"]:checked');
			return normalizeSource(selected?.value || STATE.source);
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

		function getStatusConfig(status) {
			return typeof STATUS_UTILS.getOrderStatusConfig === 'function'
				? STATUS_UTILS.getOrderStatusConfig(status)
				: { label: status || 'Chuyển thực hiện', className: 'status-sent' };
		}

		function getPerformerName(row) {
			return row.location_type === 'in'
				? (row.in_house_unit || '')
				: (row.out_facility || '');
		}

		function getSourceConfig(row = {}) {
			const source = normalizeSource(row.source || sourceForRow(row));
			if (source === 'survey') return { label: 'Khảo sát', className: 'doctor-indications-source-badge--survey' };
			if (source === 'custom') return { label: 'Nhập text', className: 'doctor-indications-source-badge--custom' };
			return { label: 'Danh mục', className: 'doctor-indications-source-badge--catalog' };
		}

		function renderSourceBadge(row) {
			const config = getSourceConfig(row);
			return `<span class="doctor-indications-source-badge ${config.className}">${config.label}</span>`;
		}

		function buildCatalogIndex(items = []) {
			const index = new Map();
			items.forEach(item => {
				const id = normalizeId(item.id);
				const name = textOf(item.name);
				if (!id || !name || item.is_active === false) return;
				index.set(Number(id), {
					...item,
					id: Number(id),
					name,
					breadcrumb: textOf(item.group_path || item.category_name)
				});
			});
			return index;
		}

		function clearCatalogSelection(doc, options = {}) {
			STATE.selectedCatalog = null;
			STATE.selectedSurvey = null;
			const input = el(doc, 'catalog');
			const hidden = el(doc, 'catalogId');
			if (hidden) hidden.value = '';
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
				clearCatalogSelection(doc);
				return false;
			}
			STATE.selectedCatalog = null;
			STATE.selectedSurvey = { ...item, id: Number(id), name };
			const input = el(doc, 'catalog');
			const hidden = el(doc, 'catalogId');
			if (hidden) hidden.value = '';
			if (input) {
				input.value = name;
				input.removeAttribute('aria-invalid');
			}
			return true;
		}

		function setSource(doc, source, options = {}) {
			const nextSource = normalizeSource(source);
			STATE.source = nextSource;
			const input = el(doc, 'catalog');
			const hidden = el(doc, 'catalogId');
			const selectedControls = doc.querySelectorAll('input[name="doctorIndicationSource"]');
			selectedControls.forEach(control => {
				control.checked = control.value === nextSource;
			});
			STATE.selectedCatalog = null;
			STATE.selectedSurvey = null;
			if (hidden) hidden.value = '';
			if (input) {
				if (!options.preserveText) input.value = '';
				input.removeAttribute('aria-invalid');
			}
			if (STATE.autocomplete?.hide) STATE.autocomplete.hide();
			renderCatalog(doc);
		}

		function setCatalogSelection(doc, item = {}) {
			const id = normalizeId(item.id || item.order_id || item.order_item_id);
			const name = textOf(item.name || item.order_name);
			if (!id || !name) {
				clearCatalogSelection(doc);
				return false;
			}
			STATE.selectedCatalog = {
				id,
				name,
				group_path: textOf(item.group_path || item.breadcrumb || item.category_name)
			};
			STATE.selectedSurvey = null;
			const input = el(doc, 'catalog');
			const hidden = el(doc, 'catalogId');
			if (input) {
				input.value = name;
				input.removeAttribute('aria-invalid');
			}
			if (hidden) hidden.value = String(id);
			return true;
		}

		function syncCatalogDropdownGeometry(doc) {
			const input = el(doc, 'catalog');
			const dropdown = STATE.autocomplete?.dropdown || el(doc, 'catalogDropdown');
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

		function bindCatalogDropdownGeometry(doc, input, dropdown) {
			const sync = () => syncCatalogDropdownGeometry(doc);
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

		function setupCatalogAutocomplete(doc) {
			if (STATE.autocomplete) return true;
			if (typeof AUTOCOMPLETE_UTILS.setupOrderFormAutocomplete !== 'function') return false;
			const input = el(doc, 'catalog');
			const dropdown = el(doc, 'catalogDropdown');
			if (!input || !dropdown) return false;

			STATE.autocomplete = AUTOCOMPLETE_UTILS.setupOrderFormAutocomplete({
				document: doc,
				nameInput: input,
				dropdown,
				getOrderIndex: () => STATE.source === 'catalog' ? STATE.catalogIndex : new Map(),
				getSurveyTemplates: () => STATE.source === 'survey' ? STATE.surveyTemplates : [],
				isEnabled: () => STATE.source !== 'custom',
				includeCatalogWhenEmpty: true,
				emptyCatalogLimit: 30,
				normalizeSearch: true,
				includeMetadataSearch: true,
				selectFirstOnEnter: true,
				showSurveyDescription: false,
				emptyText: 'Không tìm thấy chỉ định phù hợp.',
				escapeHtml,
				onInput: () => clearCatalogSelection(doc, { clearText: false, hide: false }),
				onOrderSelect: (orderId, context) => {
					const item = STATE.catalogIndex.get(Number(orderId));
					if (!item || !setCatalogSelection(doc, item)) return;
					context.hide();
					setMessage(doc);
				},
				onSurveySelect: (surveyId, context) => {
					const item = STATE.surveyIndex.get(Number(surveyId));
					if (!item || !setSurveySelection(doc, item)) return;
					context.hide();
					setMessage(doc);
				}
			});
			STATE.syncCatalogDropdownGeometry = bindCatalogDropdownGeometry(doc, input, dropdown);
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
			return `<button type="button" class="doctor-indications-table__action" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"${Object.entries(attrs).map(([key, value]) => ` ${escapeAttr(key)}="${escapeAttr(value)}"`).join('')}><i class="bi bi-${icon}" aria-hidden="true"></i></button>`;
		}

		function normalizeRow(item = {}) {
			const id = normalizeId(item.id);
			const orderId = normalizeId(item.order_id || item.order_item_id);
			const tempId = item.tempId || id || `ind-${STATE.rows.length + 1}`;
			return {
				uid: item.uid || String(tempId),
				id,
				tempId,
				order_id: orderId,
				source: normalizeSource(item.source || sourceForRow(item)),
				order_name: textOf(item.order_name || item.name),
				location_type: normalizeLocation(item.location_type),
				in_house_unit_id: normalizeId(item.in_house_unit_id),
				in_house_unit: textOf(item.in_house_unit),
				out_facility: textOf(item.out_facility),
				scheduled_for: textOf(item.scheduled_for),
				status: item.status || 'sent',
				is_completed: Boolean(item.is_completed),
				group_path: textOf(item.group_path),
				survey_template_id: normalizeId(item.survey_template_id)
			};
		}

		function mapServerRows(items = []) {
			return (items || []).map(item => normalizeRow(item));
		}

		function buildSavePayload() {
			if (typeof ORDER_STATE_UTILS.buildOrdersSavePayload === 'function') {
				return ORDER_STATE_UTILS.buildOrdersSavePayload(STATE.rows, {
					nullEmptyInHouseUnitId: true,
					emptyStringInHouseUnit: true,
					includeSurveyTemplate: true
				});
			}
			return STATE.rows.map(row => ({
				id: row.id || undefined,
				order_id: row.order_id,
				survey_template_id: row.survey_template_id || null,
				order_name: row.order_name,
				location_type: row.location_type,
				in_house_unit_id: row.in_house_unit_id || null,
				in_house_unit: row.in_house_unit || '',
				out_facility: row.out_facility || '',
				scheduled_for: row.scheduled_for,
				status: row.status,
				is_completed: row.is_completed,
				group_path: row.group_path || ''
			}));
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
				&& STATE.catalogLoaded
				&& STATE.performersLoaded
				&& !STATE.saving
			);
			['catalog', 'performer', 'outFacility', 'date', 'submit'].forEach(name => {
				const control = el(doc, name);
				if (control) control.disabled = !ready;
			});
			const sourceFieldset = el(doc, 'sourceFieldset');
			if (sourceFieldset) sourceFieldset.disabled = !ready;
			const fieldset = el(doc, 'locationFieldset');
			if (fieldset) fieldset.disabled = !ready;
			const historyToggle = el(doc, 'historyToggle');
			if (historyToggle) historyToggle.disabled = !STATE.appointmentId || STATE.historyLoading;
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

		function renderCatalog(doc) {
			const input = el(doc, 'catalog');
			if (!input) return;
			if (!STATE.appointmentId) input.placeholder = 'Chưa chọn lượt khám';
			else if (STATE.source === 'custom') input.placeholder = 'Nhập tên chỉ định';
			else if (STATE.source === 'survey' && !STATE.surveyLoaded) input.placeholder = 'Đang tải mẫu khảo sát...';
			else if (STATE.source === 'survey' && STATE.surveyIndex.size === 0) input.placeholder = 'Chưa có mẫu khảo sát';
			else if (STATE.source === 'catalog' && !STATE.catalogLoaded) input.placeholder = 'Đang tải danh mục chỉ định...';
			else if (STATE.source === 'catalog' && STATE.catalogIndex.size === 0) input.placeholder = 'Chưa có danh mục chỉ định';
			else if (STATE.source === 'survey') input.placeholder = 'Tìm tên mẫu khảo sát';
			else input.placeholder = 'Tìm tên chỉ định';
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
				const locked = row.location_type === 'in' && row.status === 'completed';
				const performer = getPerformerName(row) || '—';
				const group = row.group_path ? `<small class="doctor-indications-table__group">${escapeHtml(row.group_path)}</small>` : '';
				return `<tr data-doctor-indication-row="${escapeAttr(row.tempId)}">
					<td>${index + 1}</td>
					<td><strong>${escapeHtml(row.order_name || 'Chưa có tên')}</strong> ${renderSourceBadge(row)}${group}</td>
					<td>${escapeHtml(row.location_type === 'in' ? `Trong cơ sở · ${performer}` : `Ngoài cơ sở · ${performer}`)}</td>
					<td>${formatDate(row.scheduled_for)}</td>
					<td><span class="doctor-indications-status ${escapeAttr(status.className || '')}">${escapeHtml(status.label || row.status || 'Chuyển thực hiện')}</span></td>
					<td>${renderActionButton('edit', locked ? 'Không thể sửa chỉ định đã hoàn thành' : 'Sửa chỉ định', { 'data-doctor-indication-action': 'edit', 'data-doctor-indication-id': row.tempId, disabled: locked })}${renderActionButton('delete', 'Xóa chỉ định', { 'data-doctor-indication-action': 'delete', 'data-doctor-indication-id': row.tempId })}</td>
				</tr>`;
			}).join('');
		}

		function renderHistory(doc) {
			const list = el(doc, 'historyList');
			const count = el(doc, 'historyCount');
			if (count) count.textContent = `${STATE.history.length} chỉ định`;
			if (!list) return;
			if (STATE.historyLoading) {
				list.innerHTML = '<tr class="doctor-indications-table__empty"><td colspan="6">Đang tải lịch sử chỉ định...</td></tr>';
				return;
			}
			if (!STATE.history.length) {
				list.innerHTML = '<tr class="doctor-indications-table__empty"><td colspan="6">Chưa có lịch sử chỉ định.</td></tr>';
				return;
			}
			list.innerHTML = STATE.history.map((row, index) => {
				const status = getStatusConfig(row.status);
				const appointment = row.appointment || {};
				const performer = getPerformerName(row) || '—';
				return `<tr>
					<td>${index + 1}</td>
					<td><strong>${escapeHtml(row.order_name || 'Chưa có tên')}</strong> ${renderSourceBadge(row)}${row.group_path ? `<small class="doctor-indications-table__group">${escapeHtml(row.group_path)}</small>` : ''}</td>
					<td>${escapeHtml(appointment.appointment_code || `Lượt khám #${row.appointment_id || '—'}`)}</td>
					<td>${escapeHtml(row.location_type === 'in' ? `Trong cơ sở · ${performer}` : `Ngoài cơ sở · ${performer}`)}</td>
					<td>${formatDate(appointment.appointment_date || row.scheduled_for)}</td>
					<td><span class="doctor-indications-status ${escapeAttr(status.className || '')}">${escapeHtml(status.label || row.status || 'Chuyển thực hiện')}</span></td>
				</tr>`;
			}).join('');
		}

		function render(doc) {
			if (!el(doc, 'root')) return false;
			renderCatalog(doc);
			renderPerformers(doc);
			renderCurrentRows(doc);
			renderHistory(doc);
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
			setSource(doc, 'catalog');
			clearCatalogSelection(doc);
			if (performer) performer.value = '';
			if (outFacility) outFacility.value = '';
			if (date) date.value = STATE.defaultDate || '';
			if (inLocation) inLocation.checked = true;
			STATE.editingTempId = null;
			setSubmitMode(doc, false);
			const cancel = el(doc, 'cancelEdit');
			if (cancel) cancel.hidden = true;
			updateLocationFields(doc);
		}

		function startEdit(doc, tempId) {
			const row = STATE.rows.find(item => String(item.tempId) === String(tempId));
			if (!row) return false;
			if (row.location_type === 'in' && row.status === 'completed') {
				showToast('warning', 'Không thể sửa chỉ định đã hoàn thành trong cơ sở.');
				return false;
			}
			const catalog = el(doc, 'catalog');
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			const date = el(doc, 'date');
			const catalogItem = STATE.catalog.find(item => String(item.id) === String(row.order_id));
			const source = normalizeSource(row.source || sourceForRow(row));
			setSource(doc, source, { preserveText: true });
			if (source === 'catalog') setCatalogSelection(doc, catalogItem || row);
			else if (source === 'survey') setSurveySelection(doc, STATE.surveyIndex.get(Number(row.survey_template_id)) || row);
			else {
				const input = el(doc, 'catalog');
				if (input) input.value = row.order_name || '';
			}
			if (performer) performer.value = row.in_house_unit_id ? String(row.in_house_unit_id) : '';
			if (outFacility) outFacility.value = row.out_facility || '';
			if (date) date.value = row.scheduled_for || '';
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
			if (catalog) catalog.focus();
			return true;
		}

		function readForm(doc) {
			const catalog = el(doc, 'catalog');
			const catalogId = el(doc, 'catalogId');
			const performer = el(doc, 'performer');
			const outFacility = el(doc, 'outFacility');
			const date = el(doc, 'date');
			const selectedLocation = doc.querySelector('input[name="doctorIndicationLocation"]:checked');
			const locationType = normalizeLocation(selectedLocation && selectedLocation.value);
			const source = getSelectedSource(doc);
			const selectedCatalog = STATE.selectedCatalog;
			const selectedSurvey = STATE.selectedSurvey;
			const orderId = normalizeId(catalogId && catalogId.value);
			const typedName = textOf(catalog && catalog.value);
			const orderName = source === 'catalog'
				? textOf(selectedCatalog && selectedCatalog.name)
				: source === 'survey'
					? textOf(selectedSurvey && selectedSurvey.name)
					: typedName;
			const surveyTemplateId = source === 'survey' ? normalizeId(selectedSurvey && selectedSurvey.id) : null;
			if (orderName.length > MAX_ORDER_NAME_LENGTH) {
				if (catalog) catalog.setAttribute('aria-invalid', 'true');
				return { valid: false, message: `Tên chỉ định tối đa ${MAX_ORDER_NAME_LENGTH} ký tự.`, focus: catalog };
			}
			const scheduledFor = textOf(date && date.value);
			const outFacilityName = textOf(outFacility && outFacility.value);
			const performerId = normalizeId(performer && performer.value);
			const performerOption = performer && performer.selectedOptions ? performer.selectedOptions[0] : null;
			const performerName = textOf(performerOption && (performerOption.dataset.userName || performerOption.textContent));
			if (source === 'catalog' && (!orderId || !orderName || String(orderId) !== String(selectedCatalog?.id) || typedName !== orderName)) {
				if (catalog) catalog.setAttribute('aria-invalid', 'true');
				return { valid: false, message: 'Chọn một chỉ định từ danh mục.', focus: catalog };
			}
			if (source === 'survey' && (!surveyTemplateId || !orderName || typedName !== orderName)) {
				if (catalog) catalog.setAttribute('aria-invalid', 'true');
				return { valid: false, message: 'Chọn một mẫu khảo sát.', focus: catalog };
			}
			if (source === 'custom' && !typedName) {
				if (catalog) catalog.setAttribute('aria-invalid', 'true');
				return { valid: false, message: 'Nhập tên chỉ định.', focus: catalog };
			}
			if (!scheduledFor) return { valid: false, message: 'Chọn ngày chỉ định.', focus: date };
			if (locationType === 'in' && !performerId) return { valid: false, message: 'Chọn người thực hiện trong cơ sở.', focus: performer };
			if (locationType === 'out' && !outFacilityName) return { valid: false, message: 'Nhập cơ sở thực hiện bên ngoài.', focus: outFacility };
			return {
				valid: true,
				data: {
					order_id: source === 'catalog' ? orderId : null,
					survey_template_id: surveyTemplateId,
					order_name: orderName,
					location_type: locationType,
					in_house_unit_id: locationType === 'in' ? performerId : null,
					in_house_unit: locationType === 'in' ? performerName : '',
					out_facility: locationType === 'out' ? outFacilityName : '',
					scheduled_for: scheduledFor,
					group_path: source === 'catalog'
						? textOf(selectedCatalog.group_path)
						: source === 'survey' ? 'Khảo sát Tâm lý' : '',
					source,
					status: 'sent',
					is_completed: false
				}
			};
		}

		function markDirty() {
			STATE.ordersRevision += 1;
			STATE.ordersDirty = true;
		}

		function handleSubmit(doc) {
			if (!STATE.ordersLoaded || !STATE.catalogLoaded) return;
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
			const confirm = REGISTRY.get('confirmationDialog')?.confirm;
			if (typeof confirm !== 'function') {
				showToast('error', 'Không thể mở hộp thoại xác nhận. Vui lòng tải lại trang.');
				return false;
			}
			const confirmed = await confirm({
				title: 'Xóa chỉ định?',
				text: `Chỉ định "${row.order_name}" sẽ được xóa khi bạn nhấn Lưu.`,
				icon: 'warning',
				variant: 'danger',
				confirmText: 'Xóa chỉ định',
				cancelText: 'Hủy'
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
				STATE.ordersDirty = false;
				STATE.ordersRevision = 0;
				renderCurrentRows(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) setMessage(doc, 'Không thể tải chỉ định của lượt khám. Vui lòng thử lại.', 'error');
				return false;
			}
		}

		async function loadCatalog(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await requestJson(endpoint('catalog'), { method: 'GET' });
				if (!currentToken(token, appointmentId)) return false;
				STATE.catalog = Array.isArray(data?.data) ? data.data : [];
				STATE.catalogIndex = buildCatalogIndex(STATE.catalog);
				STATE.catalogLoaded = true;
				renderCatalog(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) setMessage(doc, 'Không thể tải danh mục chỉ định. Vui lòng thử lại.', 'error');
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
				renderCatalog(doc);
				return true;
			} catch (error) {
				if (currentToken(token, appointmentId)) {
					STATE.surveyTemplates = [];
					STATE.surveyIndex = new Map();
					STATE.surveyLoaded = true;
					renderCatalog(doc);
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

		async function loadHistory(doc) {
			if (!STATE.patientId || STATE.historyLoading) return false;
			const token = STATE.contextToken;
			const historyToken = ++STATE.historyRequestToken;
			STATE.historyLoading = true;
			renderHistory(doc);
			try {
				const data = await requestJson(endpoint('history', {
					patientId: STATE.patientId,
					appointmentId: STATE.appointmentId
				}), { method: 'GET' });
				if (!currentToken(token) || historyToken !== STATE.historyRequestToken) return false;
				STATE.history = Array.isArray(data?.chi_dinh) ? data.chi_dinh : [];
				STATE.historyLoaded = true;
				return true;
			} catch (error) {
				if (currentToken(token) && historyToken === STATE.historyRequestToken) {
					STATE.history = [];
					setMessage(doc, 'Không thể tải lịch sử chỉ định. Vui lòng thử lại.', 'error');
				}
				return false;
			} finally {
				if (currentToken(token) && historyToken === STATE.historyRequestToken) {
					STATE.historyLoading = false;
					renderHistory(doc);
				}
			}
		}

		function toggleHistory(doc) {
			const panel = el(doc, 'historyPanel');
			const toggle = el(doc, 'historyToggle');
			if (!panel || !toggle) return;
			const shouldOpen = panel.hidden;
			panel.hidden = !shouldOpen;
			toggle.setAttribute('aria-expanded', String(shouldOpen));
			if (shouldOpen && !STATE.historyLoaded) loadHistory(doc);
		}

		function resetContextData(doc) {
			STATE.rows = [];
			STATE.catalog = [];
			STATE.catalogIndex = new Map();
			STATE.selectedCatalog = null;
			STATE.surveyTemplates = [];
			STATE.surveyIndex = new Map();
			STATE.selectedSurvey = null;
			STATE.surveyLoaded = false;
			STATE.source = 'catalog';
			STATE.performers = [];
			STATE.catalogLoaded = false;
			STATE.performersLoaded = false;
			STATE.ordersLoaded = false;
			STATE.ordersDirty = false;
			STATE.ordersRevision = 0;
			STATE.saving = false;
			STATE.editingTempId = null;
			STATE.history = [];
			STATE.historyLoaded = false;
			STATE.historyLoading = false;
			STATE.historyRequestToken += 1;
			renderCatalog(doc);
			renderPerformers(doc);
			resetForm(doc);
			renderCurrentRows(doc);
			renderHistory(doc);
			const panel = el(doc, 'historyPanel');
			const toggle = el(doc, 'historyToggle');
			if (panel) panel.hidden = true;
			if (toggle) toggle.setAttribute('aria-expanded', 'false');
			setFormReady(doc);
		}

		async function save(options = {}) {
			const doc = getDocument(options);
			const appointmentId = RUNTIME.getCurrentAppointmentId(STATE);
			if (!appointmentId) return { skipped: true, reason: 'missing-appointment', module: 'indications' };
			if (STATE.isLoading && STATE.isLoading()) return { skipped: true, reason: 'loading', module: 'indications' };
			if (!STATE.ordersLoaded) throw new Error('Chưa tải xong chỉ định của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			if (STATE.saving) return { skipped: true, reason: 'saving', module: 'indications' };
			const revision = STATE.ordersRevision;
			STATE.saving = true;
			setFormReady(doc);
			try {
				if (typeof ORDER_STATE_UTILS.refreshSelectedOrderStatusesBeforeSave === 'function') {
					const refreshed = await ORDER_STATE_UTILS.refreshSelectedOrderStatusesBeforeSave({
						apiCall: (url, requestOptions) => STATE.apiCall(url, requestOptions),
						appointmentId,
						getSelectedOrders: () => STATE.rows,
						setSelectedOrders: value => { STATE.rows = value.map(normalizeRow); },
						console,
						getCurrentAppointmentId: () => RUNTIME.getCurrentAppointmentId(STATE)
					});
					if (refreshed.canceled) return { skipped: true, reason: 'stale-context', module: 'indications' };
				}
				const data = await requestJson(endpoint('appointment', { appointmentId }), {
					method: 'POST',
					body: { chi_dinh: buildSavePayload() }
				});
				if (revision === STATE.ordersRevision) {
					STATE.rows = mapServerRows(data?.chi_dinh || []);
					STATE.ordersDirty = false;
					renderCurrentRows(doc);
				}
				showToast(revision === STATE.ordersRevision ? 'success' : 'info', revision === STATE.ordersRevision ? 'Đã lưu chỉ định.' : 'Đã lưu chỉ định trước đó; thay đổi mới vẫn chưa lưu.', options);
				return { status: 'success', module: 'indications', data, hasNewChanges: revision !== STATE.ordersRevision };
			} finally {
				STATE.saving = false;
				setFormReady(doc);
			}
		}

		function getDraftSnapshot() {
			return { rows: draftRowsWithoutRuntimeIds(STATE.rows) };
		}

		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			const doc = getDocument(restoreOptions);
			STATE.rows = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map(row => normalizeRow(cloneDraftValue(row)));
			STATE.ordersDirty = Boolean(restoreOptions.dirty);
			if (STATE.ordersDirty) STATE.ordersRevision += 1;
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
			if (!setupCatalogAutocomplete(doc)) {
				throw new Error('Không khởi tạo được autocomplete danh mục chỉ định');
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
				if (event.target.closest(`#${domId('historyToggle')}`)) toggleHistory(doc);
			});
			root.querySelectorAll('input[name="doctorIndicationLocation"]').forEach(input => {
				input.addEventListener('change', () => updateLocationFields(doc));
			});
			root.querySelectorAll('input[name="doctorIndicationSource"]').forEach(input => {
				input.addEventListener('change', () => {
					setSource(doc, input.value);
					setFormReady(doc);
				});
			});
			STATE.bound = true;
			render(doc);
			return true;
		}

		function clear(options = {}) {
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
			STATE.defaultDate = textOf(context.appointmentDate || appointment.appointment_date || appointment.appointment?.appointment_date);
			resetContextData(doc);
			return Promise.allSettled([
				loadCurrent({ doc, token, appointmentId }),
				loadCatalog({ doc, token, appointmentId }),
				loadSurveyTemplates({ doc, token, appointmentId }),
				loadPerformers({ doc, token, appointmentId })
			]).then(results => {
				if (currentToken(token, appointmentId)) setFormReady(doc);
				return results.every(result => result.status === 'fulfilled' && result.value === true);
			});
		}

		return {
			bind,
			clear,
			load,
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
		dependencies: ['supportRuntime', 'componentDomScope', 'iconSystem', 'confirmationDialog'],
		owner: 'doctor/indications'
	});
})(window, document);
