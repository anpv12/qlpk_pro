(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const RUNTIME = REGISTRY.get('supportRuntime');
	const MODEL = REGISTRY.get('prescriptionModel');
	if (!RUNTIME || !MODEL) throw new Error('Thiếu Doctor prescription dependencies');

	const TYPE_CONTRACT = window.PrescriptionTypeContract;
	if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');

	const { escapeHtml, escapeAttr } = RUNTIME;
	const { formatDoseValue, PRESCRIPTION_SLOT_DEFS, PRESCRIPTION_USAGE_MODES } = MODEL;
	const DEFAULT_DOM = {
		list: 'doctorPrescriptionList',
		tableHead: 'doctorPrescriptionTableHead',
		table: 'doctorPrescriptionTable',
		empty: 'doctorPrescriptionEmptyState'
	};

	function buildTableHeader(mode) {
		const scheduleHeaders = mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? ['Liều/lần', 'Lần/ngày']
			: PRESCRIPTION_SLOT_DEFS.map(slot => slot.label);
		return `
			<tr class="doctor-prescription-table__header-row doctor-prescription-table__header-row--group">
				<th rowspan="2" scope="col" class="doctor-prescription-table__stt">STT</th>
				<th rowspan="2" scope="col" class="doctor-prescription-table__medicine-heading">Thuốc / hoạt chất</th>
				<th colspan="${scheduleHeaders.length}" scope="colgroup" class="doctor-prescription-table__schedule-heading">Lịch uống</th>
				<th rowspan="2" scope="col" class="doctor-prescription-table__route-heading">Đường dùng</th>
				<th rowspan="2" scope="col" class="doctor-prescription-table__quantity-heading">Số lượng</th>
				<th rowspan="2" scope="col" class="doctor-prescription-table__total-heading">Thành tiền</th>
				<th rowspan="2" scope="col" class="doctor-prescription-table__actions-heading"><span class="visually-hidden">Thao tác</span></th>
			</tr>
			<tr class="doctor-prescription-table__header-row doctor-prescription-table__header-row--slots">
				${scheduleHeaders.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join('')}
			</tr>`;
	}

	function buildDoseInput(row, field, label, value, placeholder = '-') {
		return `<input type="text" inputmode="decimal" value="${escapeAttr(formatDoseValue(value))}" data-prescription-field="${escapeAttr(field)}" aria-label="${escapeAttr(label)}" placeholder="${escapeAttr(placeholder)}">`;
	}

	function buildScheduleCells(row, mode) {
		if (mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY) {
			const schedule = row.schedule && row.schedule.times_per_day ? row.schedule.times_per_day : {};
			return [
				`<td class="doctor-prescription-table__dose-cell">${buildDoseInput(row, 'qtyPerTime', 'Liều mỗi lần', schedule.qty_per_time, '0')}</td>`,
				`<td class="doctor-prescription-table__dose-cell">${buildDoseInput(row, 'timesPerDay', 'Số lần mỗi ngày', schedule.times_per_day, '1')}</td>`
			];
		}

		const schedule = row.schedule && row.schedule.time_slots ? row.schedule.time_slots : {};
		return PRESCRIPTION_SLOT_DEFS.map(slot => `
			<td class="doctor-prescription-table__dose-cell">${buildDoseInput(row, slot.field, slot.label, schedule[slot.field])}</td>`);
	}

	function formatAllocationQuantity(value) {
		const parsed = Number(value || 0);
		if (!Number.isFinite(parsed)) return '0';
		return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(parsed);
	}

	function getCurrentStockQuantity(row) {
		const value = row.currentStockQuantity ?? row.batchAllocation?.aggregate_stock;
		if (value == null) return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function buildCurrentStockHtml(row) {
		if (row.isExternal || !row.medicineId) return '';
		const stock = getCurrentStockQuantity(row);
		if (stock === null) return '';
		return `<span class="doctor-prescription-table__stock">Tồn tổng hiện tại: <strong>${escapeHtml(formatAllocationQuantity(stock))}</strong> ${escapeHtml(row.unit || 'đơn vị')}</span>`;
	}

	function buildBatchAllocationHtml(row, showAllocation) {
		if (!showAllocation || row.isExternal) return '';
		const state = row.batchAllocation;
		const status = state?.batch_allocation_status || '';
		if (row.batchAllocationStale) {
			return '<div class="doctor-prescription-batches" data-status="pending"><span><i class="bi bi-hourglass-split" aria-hidden="true"></i>Cần lưu để cập nhật lô</span></div>';
		}
		if (!state) return '';

		const allocations = Array.isArray(state.batch_allocations) ? state.batch_allocations : [];
		if (status !== 'allocated' || !allocations.length) return '';
		const unit = row.unit || state.unit || 'đơn vị';
		return `
			<div class="doctor-prescription-batches" data-status="${escapeAttr(status)}" aria-label="Phân bổ thuốc theo lô">
				${allocations.map(allocation => `
					<div class="doctor-prescription-batch">
						<strong>Lô ${escapeHtml(allocation.batch_number || allocation.batch_id || '')}</strong>
						<span>Đã cấp ${escapeHtml(formatAllocationQuantity(allocation.quantity))} ${escapeHtml(unit)}</span>
					</div>`).join('')}
			</div>`;
	}

	function buildPrescriptionRowHtml(row, index, mode, getRowTotal, showAllocation) {
		const activeIngredient = row.genericName || row.name || 'Chưa rõ';
		const strength = row.strength ? `<span>${escapeHtml(row.strength)}</span>` : '';
		const source = row.isExternal
			? '<span class="doctor-prescription-table__source">Thuốc ngoài</span>'
			: '';
		const quantityUnit = row.isExternal
			? `<input type="text" class="doctor-prescription-table__quantity-unit-input" value="${escapeAttr(row.unit)}" data-prescription-field="unit" aria-label="Đơn vị cấp phát thuốc ngoài" placeholder="đơn vị">`
			: `<small data-prescription-row-unit>${escapeHtml(row.unit || 'đơn vị')}</small>`;
		const scheduleCellCount = mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? 2
			: PRESCRIPTION_SLOT_DEFS.length;
		const noteColspan = scheduleCellCount + 3;

		return `
			<tr class="doctor-prescription-table__body-row${row.isExternal ? ' is-external' : ''}" data-prescription-row-id="${escapeAttr(row.uid)}" data-prescription-type="${escapeAttr(TYPE_CONTRACT.toDocumentType(row.prescriptionType))}" data-prescription-source="${row.isExternal ? 'external' : 'stock'}">
				<td rowspan="2" class="doctor-prescription-table__stt-cell">${index + 1}</td>
				<td rowspan="2" class="doctor-prescription-table__medicine-cell">
					<div class="doctor-prescription-table__medicine-copy">
						<div class="doctor-prescription-cell__input doctor-prescription-cell__input--search">
							<input type="text" value="${escapeAttr(row.name)}" data-prescription-field="name" autocomplete="off" placeholder="${row.isExternal ? 'Nhập thuốc ngoài' : 'Tìm thuốc trong kho'}" aria-label="Tên thuốc" role="combobox" aria-autocomplete="list" aria-controls="doctorMedicineDropdown" aria-expanded="false">
						</div>
						<div class="doctor-prescription-table__medicine-meta">
							<span>Hoạt chất: ${escapeHtml(activeIngredient)}</span>
							${strength}
							${source}
						</div>
						${buildCurrentStockHtml(row)}
						${buildBatchAllocationHtml(row, showAllocation)}
					</div>
				</td>
				${buildScheduleCells(row, mode).join('')}
				<td class="doctor-prescription-table__route-cell">
					<input type="text" value="${escapeAttr(row.route)}" data-prescription-field="route" aria-label="Đường dùng" placeholder="Uống">
				</td>
				<td class="doctor-prescription-table__quantity-cell">
					<div class="doctor-prescription-table__quantity-control doctor-prescription-table__quantity-control--calculated">
						<input type="text" class="doctor-prescription-table__quantity-value" value="${escapeAttr(formatDoseValue(row.quantity) || '0')}" data-prescription-field="quantity" aria-label="Tổng số lượng tự tính" aria-readonly="true" title="Tự tính từ lịch uống và số ngày điều trị" readonly>
						${quantityUnit}
					</div>
				</td>
				<td class="doctor-prescription-table__total-cell"><strong data-prescription-row-total>${getRowTotal(row)}</strong></td>
				<td rowspan="2" class="doctor-prescription-table__actions-cell">
					<button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" class="doctor-prescription-table__remove" data-prescription-row-action="remove" aria-label="Xóa thuốc" title="Xóa thuốc">
						<i class="bi bi-trash3" aria-hidden="true"></i>
					</button>
				</td>
			</tr>
			<tr class="doctor-prescription-table__note-row${row.isExternal ? ' is-external' : ''}" data-prescription-row-id="${escapeAttr(row.uid)}" data-prescription-type="${escapeAttr(TYPE_CONTRACT.toDocumentType(row.prescriptionType))}">
				<td colspan="${noteColspan}" class="doctor-prescription-table__note-cell">
					<div class="doctor-prescription-table__note-line">
						<i class="bi bi-card-text" aria-hidden="true"></i>
						<span>Ghi chú</span>
						<input type="text" value="${escapeAttr(row.usageNote)}" data-prescription-field="usageNote" aria-label="Ghi chú thuốc" placeholder="Thêm ghi chú cách dùng thuốc">
					</div>
				</td>
			</tr>`;
	}

	function getTableColumnCount(mode) {
		const scheduleCellCount = mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? 2
			: PRESCRIPTION_SLOT_DEFS.length;
		return scheduleCellCount + 6;
	}

	function buildGroupHeaderHtml(type, code, colCount) {
		const modifier = String(type).toLowerCase();
		const codeText = code ? `Mã đơn thuốc: ${escapeHtml(code)}` : 'Chưa cấp mã đơn';
		return `
			<tr class="doctor-prescription-table__group-row doctor-prescription-table__group-row--${escapeAttr(modifier)}" data-prescription-group="${escapeAttr(type)}">
				<td colspan="${colCount}" class="doctor-prescription-table__group-cell">
					<div class="doctor-prescription-table__group-inner">
						<span class="doctor-prescription-table__group-title">${escapeHtml(TYPE_CONTRACT.getLabel(type))}</span>
						<span class="doctor-prescription-table__group-code${code ? '' : ' is-empty'}">${codeText}</span>
					</div>
				</td>
			</tr>`;
	}

	function groupRowsByDocumentType(rows) {
		const groups = new Map(TYPE_CONTRACT.DOCUMENT_TYPES.map(type => [type, []]));
		rows.forEach(row => {
			const type = TYPE_CONTRACT.toDocumentType(row && row.prescriptionType);
			(groups.get(type) || groups.get('BASIC')).push(row);
		});
		return groups;
	}

	// Each stocked medicine shows its batch allocation once, on its first row.
	function buildGroupedRowsHtml(rows, mode, options) {
		const renderedMedicineAllocations = new Set();
		const codesByType = options.codesByType || {};
		const colCount = getTableColumnCount(mode);
		const html = [];
		groupRowsByDocumentType(rows).forEach((groupRows, type) => {
			if (!groupRows.length) return;
			html.push(buildGroupHeaderHtml(type, codesByType[type], colCount));
			groupRows.forEach((row, groupIndex) => {
				const allocationKey = row && !row.isExternal && row.medicineId ? String(row.medicineId) : '';
				const showAllocation = Boolean(allocationKey) && !renderedMedicineAllocations.has(allocationKey);
				if (showAllocation) renderedMedicineAllocations.add(allocationKey);
				html.push(buildPrescriptionRowHtml(row, groupIndex, mode, options.getRowTotal, showAllocation));
			});
		});
		return html.join('');
	}

	function render(options = {}) {
		const doc = options.document || document;
		const dom = { ...DEFAULT_DOM, ...(options.dom || {}) };
		const scope = options.root || doc;
		const body = scope.querySelector(`#${dom.list}`);
		const head = scope.querySelector(`#${dom.tableHead}`);
		const table = scope.querySelector(`#${dom.table}`);
		const empty = scope.querySelector(`#${dom.empty}`);
		if (!body) return false;

		const rows = Array.isArray(options.rows) ? options.rows : [];
		const mode = options.mode || PRESCRIPTION_USAGE_MODES.TIME_SLOTS;
		body.dataset.prescriptionMode = mode;
		if (head) head.innerHTML = buildTableHeader(mode);
		body.innerHTML = rows.length ? buildGroupedRowsHtml(rows, mode, options) : '';
		if (table) table.hidden = !rows.length;
		if (empty) empty.hidden = Boolean(rows.length);
		if (typeof options.afterRender === 'function') options.afterRender(doc);
		return true;
	}

	function updateRowTotal(options = {}) {
		const doc = options.document || document;
		const scope = options.root || doc;
		const row = options.row;
		if (!row || typeof options.getRowTotal !== 'function') return false;
		const rowElement = scope.querySelector(`[data-prescription-row-id="${row.uid}"]`);
		const totalElement = rowElement ? rowElement.querySelector('[data-prescription-row-total]') : null;
		if (totalElement) totalElement.textContent = options.getRowTotal(row);
		return Boolean(totalElement);
	}

	function updateBatchAllocation(options = {}) {
		const doc = options.document || document;
		const scope = options.root || doc;
		const row = options.row;
		if (!row) return false;
		const rowElement = scope.querySelector(
			`.doctor-prescription-table__body-row[data-prescription-row-id="${row.uid}"]`
		);
		const copy = rowElement?.querySelector('.doctor-prescription-table__medicine-copy');
		if (!copy) return false;
		const currentStock = copy.querySelector('.doctor-prescription-table__stock');
		const stockHtml = buildCurrentStockHtml(row);
		if (stockHtml) {
			if (currentStock) currentStock.outerHTML = stockHtml;
			else copy.insertAdjacentHTML('beforeend', stockHtml);
		} else {
			currentStock?.remove();
		}
		const current = copy.querySelector('.doctor-prescription-batches');
		const html = buildBatchAllocationHtml(row, Boolean(options.showAllocation));
		if (!html) {
			current?.remove();
			return Boolean(current);
		}
		if (current) current.outerHTML = html;
		else copy.insertAdjacentHTML('beforeend', html);
		return true;
	}

	const api = { render, updateRowTotal, updateBatchAllocation };
	window.QLPKDoctorModuleRegistry.register('prescriptionRows', api);
})(window);
