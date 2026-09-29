// components/doctor-indications-form.js: phần 1/2 các hàm của create() (nạp trước doctor-indications-form.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/doctor-indications-form#create'] || (window.QLPKModuleParts['components/doctor-indications-form#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
	function getDocument(context = {}) {
			return outer.RUNTIME.getScopedDocument(context, inst.config);
		}
		function domId(name) {
			return inst.config.dom[name] || name;
		}
		function el(doc, name) {
			return inst.getElement(doc, domId(name));
		}
		function endpoint(name, args = {}) {
			const value = inst.config.endpoints[name];
			return typeof value === 'function' ? value(args) : String(value || '');
		}
		function currentToken(token, appointmentId = inst.STATE.appointmentId) {
			return inst.isCurrentToken(inst.STATE, token, appointmentId);
		}
		function normalizeLocation(value) {
			return value === 'out' || value === 'external' ? 'out' : 'in';
		}
		function normalizeSource(value) {
			const source = String(value || '').toLowerCase();
			return outer.VALID_SOURCES.includes(source) ? source : 'custom';
		}
		function sourceForRow(row = {}) {
			if (inst.normalizeId(row.survey_template_id)) return 'survey';
			return 'custom';
		}
		function buildSurveyIndex(items = []) {
			const index = new Map();
			items.forEach(item => {
				const id = inst.normalizeId(item.id);
				const name = inst.textOf(item.name);
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
			const raw = inst.textOf(value);
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

		Object.assign(inst, {
			getDocument, domId, el, endpoint, currentToken, normalizeLocation, normalizeSource, sourceForRow,
			buildSurveyIndex, formatDate, normalizeDateInputValue
		});
	});
	moduleParts.installers.push(function (inst, outer) {
	function getStatusConfig(status) {
			return outer.STATUS_UTILS.getOrderStatusConfig(status);
		}
		function getPerformerName(row) {
			return row.location_type === 'in'
				? (row.in_house_unit || '')
				: (row.out_facility || '');
		}
		function clearNameSelection(doc, options = {}) {
			inst.STATE.selectedSurvey = null;
			const input = inst.el(doc, 'name');
			if (input) {
				if (options.clearText !== false) input.value = '';
				input.removeAttribute('aria-invalid');
			}
			if (options.hide !== false && inst.STATE.autocomplete?.hide) inst.STATE.autocomplete.hide();
		}
		function setSurveySelection(doc, item = {}) {
			const id = inst.normalizeId(item.id || item.survey_template_id);
			const name = inst.textOf(item.name || item.order_name);
			if (!id || !name) {
				clearNameSelection(doc);
				return false;
			}
			inst.STATE.selectedSurvey = { ...item, id: Number(id), name };
			const input = inst.el(doc, 'name');
			if (input) {
				input.value = name;
				input.removeAttribute('aria-invalid');
			}
			const performer = inst.el(doc, 'performer');
			const defaultPerformerId = inst.normalizeId(item.default_performer_id);
			if (performer) {
				const matchingOption = defaultPerformerId
					? Array.from(performer.options || []).find(option => String(option.value) === String(defaultPerformerId))
					: null;
				performer.value = matchingOption ? String(defaultPerformerId) : '';
			}
			return true;
		}

		Object.assign(inst, { getStatusConfig, getPerformerName, clearNameSelection, setSurveySelection });
	});
	moduleParts.installers.push(function (inst) {
	function syncNameDropdownGeometry(doc) {
			const input = inst.el(doc, 'name');
			const dropdown = inst.STATE.autocomplete?.dropdown || inst.el(doc, 'nameDropdown');
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

		Object.assign(inst, { syncNameDropdownGeometry, bindNameDropdownGeometry });
	});
	moduleParts.installers.push(function (inst, outer) {
	function setupNameAutocomplete(doc) {
			if (inst.STATE.autocomplete) return true;
			const input = inst.el(doc, 'name');
			const dropdown = inst.el(doc, 'nameDropdown');
			if (!input || !dropdown) return false;

			inst.STATE.autocomplete = outer.AUTOCOMPLETE_UTILS.setupOrderFormAutocomplete({
				document: doc,
				nameInput: input,
				dropdown,
				getSurveyTemplates: () => inst.STATE.surveyTemplates,
				isEnabled: () => Boolean(inst.STATE.appointmentId && inst.STATE.ordersLoaded && inst.STATE.surveyLoaded && !inst.STATE.saving),
				normalizeSearch: true,
				selectFirstOnEnter: true,
				showSurveyDescription: false,
				emptyText: 'Không có mẫu khảo sát phù hợp; bạn vẫn có thể nhập tên tự do.',
				escapeHtml: inst.escapeHtml,
				onInput: () => inst.clearNameSelection(doc, { clearText: false, hide: false }),
				onSurveySelect: (surveyId, context) => {
					const item = inst.STATE.surveyIndex.get(Number(surveyId));
					if (!item || !inst.setSurveySelection(doc, item)) return;
					context.hide();
					inst.setMessage(doc);
				}
			});
			inst.STATE.syncNameDropdownGeometry = inst.bindNameDropdownGeometry(doc, input, dropdown);
			return Boolean(inst.STATE.autocomplete);
		}
		function renderActionButton(action, title, attrs = {}) {
			const iconSystem = outer.REGISTRY.get('iconSystem');
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
			return `<button data-qlpk-button="${action === 'delete' ? 'danger' : 'edit'}" data-qlpk-button-variant="soft" type="button" class="doctor-indications-table__action" title="${inst.escapeAttr(title)}" aria-label="${inst.escapeAttr(title)}"${Object.entries(attrs).map(([key, value]) => ` ${inst.escapeAttr(key)}="${inst.escapeAttr(value)}"`).join('')}><i class="bi bi-${icon}" aria-hidden="true"></i></button>`;
		}
		function normalizeRow(item = {}) {
			const id = inst.normalizeId(item.id);
			const tempId = item.tempId || id || `ind-${inst.STATE.rows.length + 1}`;
			return {
				uid: item.uid || String(tempId),
				id,
				tempId,
				source: inst.normalizeSource(item.source || inst.sourceForRow(item)),
				order_name: inst.textOf(item.order_name || item.name),
				location_type: inst.normalizeLocation(item.location_type),
				in_house_unit_id: inst.normalizeId(item.in_house_unit_id),
				in_house_unit: inst.textOf(item.in_house_unit),
				out_facility: inst.textOf(item.out_facility),
				scheduled_for: inst.textOf(item.scheduled_for),
				status: item.status || 'sent',
				is_completed: Boolean(item.is_completed),
				survey_template_id: inst.normalizeId(item.survey_template_id)
			};
		}
		function mapServerRows(items = []) {
			return (items || []).map(item => normalizeRow(item));
		}

		Object.assign(inst, { setupNameAutocomplete, renderActionButton, normalizeRow, mapServerRows });
	});
	moduleParts.installers.push(function (inst, outer) {
	function buildSavePayload() {
			return outer.ORDER_STATE_UTILS.buildOrdersSavePayload(inst.STATE.rows, {
				nullEmptyInHouseUnitId: true,
				emptyStringInHouseUnit: true,
				includeSurveyTemplate: true
			});
		}
		function setMessage(doc, message = '', type = 'info') {
			const messageEl = inst.el(doc, 'message');
			if (!messageEl) return;
			messageEl.textContent = message;
			messageEl.dataset.type = message ? type : '';
			messageEl.hidden = !message;
		}
		function setFormReady(doc) {
			const ready = Boolean(
				inst.STATE.appointmentId
				&& inst.STATE.ordersLoaded
				&& inst.STATE.surveyLoaded
				&& inst.STATE.performersLoaded
				&& !inst.STATE.saving
			);
			['name', 'performer', 'outFacility', 'date', 'submit'].forEach(name => {
				const control = inst.el(doc, name);
				if (control) control.disabled = !ready;
			});
			const fieldset = inst.el(doc, 'locationFieldset');
			if (fieldset) fieldset.disabled = !ready;
			const cancel = inst.el(doc, 'cancelEdit');
			if (cancel) cancel.disabled = !ready;
			updateLocationFields(doc);
		}
		function updateLocationFields(doc) {
			const selected = doc.querySelector('input[name="doctorIndicationLocation"]:checked');
			const location = inst.normalizeLocation(selected && selected.value);
			const performerGroup = inst.el(doc, 'performerGroup');
			const outGroup = inst.el(doc, 'outFacilityGroup');
			if (performerGroup) performerGroup.hidden = location !== 'in';
			if (outGroup) outGroup.hidden = location !== 'out';
			const performer = inst.el(doc, 'performer');
			const outFacility = inst.el(doc, 'outFacility');
			if (performer) performer.required = location === 'in';
			if (outFacility) outFacility.required = location === 'out';
		}
		function renderNameField(doc) {
			const input = inst.el(doc, 'name');
			if (!input) return;
			if (!inst.STATE.appointmentId) input.placeholder = 'Chưa chọn lượt khám';
			else if (!inst.STATE.surveyLoaded) input.placeholder = 'Đang tải mẫu khảo sát...';
			else input.placeholder = 'Tìm khảo sát hoặc nhập tên';
		}
		function renderPerformers(doc) {
			const select = inst.el(doc, 'performer');
			if (!select) return;
			const currentValue = select.value;
			select.innerHTML = '<option value="">Chọn người thực hiện</option>' + inst.STATE.performers.map(user => {
				const id = inst.normalizeId(user.id || user.user_id);
				const name = inst.textOf(user.full_name || user.name || user.username);
				return id && name ? `<option value="${inst.escapeAttr(id)}" data-user-name="${inst.escapeAttr(name)}">${inst.escapeHtml(name)}</option>` : '';
			}).join('');
			if (currentValue && select.querySelector(`option[value="${CSS.escape(currentValue)}"]`)) select.value = currentValue;
		}

		Object.assign(inst, { buildSavePayload, setMessage, setFormReady, updateLocationFields, renderNameField, renderPerformers });
	});
	moduleParts.installers.push(function (inst) {
	function renderCurrentRows(doc) {
			const list = inst.el(doc, 'list');
			const count = inst.el(doc, 'count');
			if (count) count.textContent = `${inst.STATE.rows.length} chỉ định`;
			if (!list) return;
			if (!inst.STATE.rows.length) {
				list.innerHTML = '<tr class="doctor-indications-table__empty"><td colspan="6"><i class="bi bi-clipboard2-x qlpk-section-icon" aria-hidden="true"></i><span>Chưa có chỉ định trong lượt khám này.</span></td></tr>';
				return;
			}
			list.innerHTML = inst.STATE.rows.map((row, index) => {
				const status = inst.getStatusConfig(row.status);
				const locked = (row.status === 'completed' || (row.survey_template_id && ['survey_sent', 'has_result'].includes(row.status)));
				const performer = inst.getPerformerName(row) || '—';
				return `<tr data-doctor-indication-row="${inst.escapeAttr(row.tempId)}">
					<td>${index + 1}</td>
					<td><strong>${inst.escapeHtml(row.order_name || 'Chưa có tên')}</strong> <span class="qlpk-feedback-token doctor-indications-location-badge">${row.location_type === 'in' ? 'Trong cơ sở' : 'Ngoài cơ sở'}</span></td>
					<td>${inst.escapeHtml(performer)}</td>
					<td>${inst.formatDate(row.scheduled_for)}</td>
					<td><span class="qlpk-status doctor-indications-status ${inst.escapeAttr(status.className || '')}">${inst.escapeHtml(status.label || row.status || 'Chuyển thực hiện')}</span></td>
					<td>${inst.renderActionButton('edit', locked ? 'Không thể sửa chỉ định đã hoàn thành' : 'Sửa chỉ định', { 'data-doctor-indication-action': 'edit', 'data-doctor-indication-id': row.tempId, disabled: locked })}${inst.renderActionButton('delete', 'Xóa chỉ định', { 'data-doctor-indication-action': 'delete', 'data-doctor-indication-id': row.tempId })}</td>
				</tr>`;
			}).join('');
		}
		function render(doc) {
			if (!inst.el(doc, 'root')) return false;
			inst.renderNameField(doc);
			inst.renderPerformers(doc);
			renderCurrentRows(doc);
			inst.setFormReady(doc);
			return true;
		}
		function setSubmitMode(doc, editing) {
			const submit = inst.el(doc, 'submit');
			if (!submit) return;
			submit.innerHTML = editing
				? '<i class="bi bi-check-circle qlpk-button-icon" aria-hidden="true"></i><span>Cập nhật</span>'
				: '<i class="bi bi-plus-circle qlpk-button-icon" aria-hidden="true"></i><span>Thêm chỉ định</span>';
		}
		function resetForm(doc) {
			const performer = inst.el(doc, 'performer');
			const outFacility = inst.el(doc, 'outFacility');
			const date = inst.el(doc, 'date');
			const inLocation = doc.getElementById('doctorIndicationLocationIn');
			inst.clearNameSelection(doc);
			if (performer) performer.value = '';
			if (outFacility) outFacility.value = '';
			if (date) date.value = inst.normalizeDateInputValue(inst.STATE.defaultDate);
			if (inLocation) inLocation.checked = true;
			inst.STATE.editingTempId = null;
			setSubmitMode(doc, false);
			const cancel = inst.el(doc, 'cancelEdit');
			if (cancel) cancel.hidden = true;
			inst.updateLocationFields(doc);
			if (inst.STATE.realtimePending && !inst.STATE.ordersDirty) inst.refreshCurrent({ document: doc });
		}
		function isLockedIndicationRow(row) {
			return row.status === 'completed' || Boolean(row.survey_template_id && ['survey_sent', 'has_result'].includes(row.status));
		}

		Object.assign(inst, { renderCurrentRows, render, setSubmitMode, resetForm, isLockedIndicationRow });
	});
	moduleParts.installers.push(function (inst) {
	function fillIndicationEditFields(doc, row) {
			const performer = inst.el(doc, 'performer');
			const outFacility = inst.el(doc, 'outFacility');
			const date = inst.el(doc, 'date');
			if (performer) performer.value = row.in_house_unit_id ? String(row.in_house_unit_id) : '';
			if (outFacility) outFacility.value = row.out_facility || '';
			if (date) date.value = inst.normalizeDateInputValue(row.scheduled_for);
			const outLocation = doc.getElementById('doctorIndicationLocationOut');
			const inLocation = doc.getElementById('doctorIndicationLocationIn');
			const isOut = row.location_type === 'out';
			if (outLocation) outLocation.checked = isOut;
			if (inLocation) inLocation.checked = !isOut;
		}

		function startEdit(doc, tempId) {
			const row = inst.STATE.rows.find(item => String(item.tempId) === String(tempId));
			if (!row) return false;
			if (inst.isLockedIndicationRow(row)) {
				inst.showToast('warning', 'Không thể sửa chỉ định đã hoàn thành trong cơ sở.');
				return false;
			}
			const nameInput = inst.el(doc, 'name');
			inst.clearNameSelection(doc);
			if (inst.sourceForRow(row) === 'survey') inst.setSurveySelection(doc, inst.STATE.surveyIndex.get(Number(row.survey_template_id)) || row);
			else if (nameInput) nameInput.value = row.order_name || '';
			fillIndicationEditFields(doc, row);
			inst.STATE.editingTempId = row.tempId;
			inst.setSubmitMode(doc, true);
			const cancel = inst.el(doc, 'cancelEdit');
			if (cancel) cancel.hidden = false;
			inst.updateLocationFields(doc);
			if (nameInput) nameInput.focus();
			return true;
		}
		function readFormInputs(doc) {
			const performer = inst.el(doc, 'performer');
			const performerOption = performer && performer.selectedOptions ? performer.selectedOptions[0] : null;
			const selectedLocation = doc.querySelector('input[name="doctorIndicationLocation"]:checked');
			return {
				nameInput: inst.el(doc, 'name'),
				performer,
				outFacility: inst.el(doc, 'outFacility'),
				date: inst.el(doc, 'date'),
				locationType: inst.normalizeLocation(selectedLocation && selectedLocation.value),
				typedName: inst.textOf(inst.el(doc, 'name') && inst.el(doc, 'name').value),
				scheduledFor: inst.textOf(inst.el(doc, 'date') && inst.el(doc, 'date').value),
				outFacilityName: inst.textOf(inst.el(doc, 'outFacility') && inst.el(doc, 'outFacility').value),
				performerId: inst.normalizeId(performer && performer.value),
				performerName: inst.textOf(performerOption && (performerOption.dataset.userName || performerOption.textContent))
			};
		}
		function resolveSelectedSurvey(typedName) {
			const selectedSurvey = inst.STATE.selectedSurvey;
			const selectedSurveyId = inst.normalizeId(selectedSurvey && selectedSurvey.id);
			const selectedSurveyName = inst.textOf(selectedSurvey && selectedSurvey.name);
			const hasSelectedSurvey = Boolean(selectedSurveyId && selectedSurveyName && typedName === selectedSurveyName);
			return { source: hasSelectedSurvey ? 'survey' : 'custom', surveyTemplateId: hasSelectedSurvey ? selectedSurveyId : null };
		}
		function invalidName(inputs, message) {
			if (inputs.nameInput) inputs.nameInput.setAttribute('aria-invalid', 'true');
			return { valid: false, message, focus: inputs.nameInput };
		}

		Object.assign(inst, { startEdit, readFormInputs, resolveSelectedSurvey, invalidName });
	});
	moduleParts.installers.push(function (inst, outer) {
	function validateFormInputs(inputs) {
			if (inputs.typedName.length > outer.MAX_ORDER_NAME_LENGTH) return inst.invalidName(inputs, `Tên chỉ định tối đa ${outer.MAX_ORDER_NAME_LENGTH} ký tự.`);
			if (!inputs.typedName) return inst.invalidName(inputs, 'Nhập tên chỉ định hoặc chọn một mẫu khảo sát.');
			if (!inputs.scheduledFor) return { valid: false, message: 'Chọn ngày chỉ định.', focus: inputs.date };
			if (inputs.locationType === 'in' && !inputs.performerId) return { valid: false, message: 'Chọn người thực hiện trong cơ sở.', focus: inputs.performer };
			if (inputs.locationType === 'out' && !inputs.outFacilityName) return { valid: false, message: 'Nhập cơ sở thực hiện bên ngoài.', focus: inputs.outFacility };
			return null;
		}

		Object.assign(inst, { validateFormInputs });
	});
})(window);
