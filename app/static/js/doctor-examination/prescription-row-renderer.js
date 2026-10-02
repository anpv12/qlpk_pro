import { el, replace } from '../shared/dom.js';
import { PrescriptionTypeContract } from '../prescriptions/shared/prescription-type-contract.js';

(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const RUNTIME = REGISTRY.get('supportRuntime');
	const MODEL = REGISTRY.get('prescriptionModel');
	if (!RUNTIME || !MODEL) throw new Error('Thiếu Doctor prescription dependencies');

	const TYPE_CONTRACT = PrescriptionTypeContract;
	if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');

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
		return [
			el('tr', { class: 'doctor-prescription-table__header-row doctor-prescription-table__header-row--group' },
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__stt' }, 'STT'),
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__medicine-heading' }, 'Thuốc / hoạt chất'),
				el('th', { colspan: scheduleHeaders.length, scope: 'colgroup', class: 'doctor-prescription-table__schedule-heading' }, 'Lịch uống'),
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__route-heading' }, 'Đường dùng'),
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__quantity-heading' }, 'Số lượng'),
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__total-heading' }, 'Thành tiền'),
				el('th', { rowspan: '2', scope: 'col', class: 'doctor-prescription-table__actions-heading' }, el('span', { class: 'visually-hidden' }, 'Thao tác'))
			),
			el('tr', { class: 'doctor-prescription-table__header-row doctor-prescription-table__header-row--slots' },
				scheduleHeaders.map(label => el('th', { scope: 'col' }, label))
			)
		];
	}

	function buildDoseInput(row, field, label, value, placeholder = '-') {
		return el('input', { type: 'text', inputmode: 'decimal', defaultValue: formatDoseValue(value) ?? '', 'data-prescription-field': field, 'aria-label': label, placeholder });
	}

	function doseCell(input) {
		return el('td', { class: 'doctor-prescription-table__dose-cell' }, input);
	}

	function buildScheduleCells(row, mode) {
		if (mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY) {
			const schedule = row.schedule && row.schedule.times_per_day ? row.schedule.times_per_day : {};
			return [
				doseCell(buildDoseInput(row, 'qtyPerTime', 'Liều mỗi lần', schedule.qty_per_time, '0')),
				doseCell(buildDoseInput(row, 'timesPerDay', 'Số lần mỗi ngày', schedule.times_per_day, '1'))
			];
		}

		const schedule = row.schedule && row.schedule.time_slots ? row.schedule.time_slots : {};
		return PRESCRIPTION_SLOT_DEFS.map(slot => doseCell(buildDoseInput(row, slot.field, slot.label, schedule[slot.field])));
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

	function buildCurrentStock(row) {
		if (row.isExternal || !row.medicineId) return null;
		const stock = getCurrentStockQuantity(row);
		if (stock === null) return null;
		return el('span', { class: 'doctor-prescription-table__stock' },
			'Tồn tổng hiện tại: ', el('strong', null, formatAllocationQuantity(stock)), ' ', row.unit || 'đơn vị');
	}

	function buildBatchAllocation(row, showAllocation) {
		if (!showAllocation || row.isExternal) return null;
		const state = row.batchAllocation;
		const status = state?.batch_allocation_status || '';
		if (row.batchAllocationStale) {
			return el('div', { class: 'doctor-prescription-batches', 'data-status': 'pending' },
				el('span', null, el('i', { class: 'bi bi-hourglass-split', 'aria-hidden': 'true' }), 'Cần lưu để cập nhật lô'));
		}
		if (!state) return null;

		const allocations = Array.isArray(state.batch_allocations) ? state.batch_allocations : [];
		if (status !== 'allocated' || !allocations.length) return null;
		const unit = row.unit || state.unit || 'đơn vị';
		return el('div', { class: 'doctor-prescription-batches', 'data-status': status, 'aria-label': 'Phân bổ thuốc theo lô' },
			allocations.map(allocation => el('div', { class: 'doctor-prescription-batch' },
				el('strong', null, `Lô ${allocation.batch_number || allocation.batch_id || ''}`),
				' ',
				el('span', null, `Đã cấp ${formatAllocationQuantity(allocation.quantity)} ${unit}`)
			))
		);
	}

	function buildMedicineCell(row, showAllocation) {
		const activeIngredient = row.genericName || row.name || 'Chưa rõ';
		return el('td', { rowspan: '2', class: 'doctor-prescription-table__medicine-cell' },
			el('div', { class: 'doctor-prescription-table__medicine-copy' },
				el('div', { class: 'doctor-prescription-cell__input doctor-prescription-cell__input--search' },
					el('input', { type: 'text', defaultValue: row.name ?? '', 'data-prescription-field': 'name', autocomplete: 'off', placeholder: row.isExternal ? 'Nhập thuốc ngoài' : 'Tìm thuốc trong kho', 'aria-label': 'Tên thuốc', role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'doctorMedicineDropdown', 'aria-expanded': 'false' })
				),
				' ',
				el('div', { class: 'doctor-prescription-table__medicine-meta' },
					el('span', null, `Hoạt chất: ${activeIngredient}`),
					row.strength ? [' ', el('span', null, row.strength)] : null,
					row.isExternal ? [' ', el('span', { class: 'doctor-prescription-table__source' }, 'Thuốc ngoài')] : null
				),
				buildCurrentStock(row),
				buildBatchAllocation(row, showAllocation)
			)
		);
	}

	function buildQuantityCell(row) {
		const quantityUnit = row.isExternal
			? el('input', { type: 'text', class: 'doctor-prescription-table__quantity-unit-input', defaultValue: row.unit ?? '', 'data-prescription-field': 'unit', 'aria-label': 'Đơn vị cấp phát thuốc ngoài', placeholder: 'đơn vị' })
			: el('small', { 'data-prescription-row-unit': true }, row.unit || 'đơn vị');
		return el('td', { class: 'doctor-prescription-table__quantity-cell' },
			el('div', { class: 'doctor-prescription-table__quantity-control doctor-prescription-table__quantity-control--calculated' },
				el('input', { type: 'text', class: 'doctor-prescription-table__quantity-value', defaultValue: formatDoseValue(row.quantity) || '0', 'data-prescription-field': 'quantity', 'aria-label': 'Tổng số lượng tự tính', 'aria-readonly': 'true', title: 'Tự tính từ lịch uống và số ngày điều trị', readonly: true }),
				' ',
				quantityUnit
			)
		);
	}

	function buildPrescriptionRows(row, index, mode, getRowTotal, showAllocation) {
		const scheduleCellCount = mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? 2
			: PRESCRIPTION_SLOT_DEFS.length;
		const noteColspan = scheduleCellCount + 3;
		const documentType = TYPE_CONTRACT.toDocumentType(row.prescriptionType);
		const external = row.isExternal ? ' is-external' : '';

		return [
			el('tr', { class: `doctor-prescription-table__body-row${external}`, 'data-prescription-row-id': row.uid, 'data-prescription-type': documentType, 'data-prescription-source': row.isExternal ? 'external' : 'stock' },
				el('td', { rowspan: '2', class: 'doctor-prescription-table__stt-cell' }, index + 1),
				buildMedicineCell(row, showAllocation),
				buildScheduleCells(row, mode),
				el('td', { class: 'doctor-prescription-table__route-cell' },
					el('input', { type: 'text', defaultValue: row.route ?? '', 'data-prescription-field': 'route', 'aria-label': 'Đường dùng', placeholder: 'Uống' })
				),
				buildQuantityCell(row),
				el('td', { class: 'doctor-prescription-table__total-cell' }, el('strong', { 'data-prescription-row-total': true }, getRowTotal(row))),
				el('td', { rowspan: '2', class: 'doctor-prescription-table__actions-cell' },
					el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'doctor-prescription-table__remove', 'data-prescription-row-action': 'remove', 'aria-label': 'Xóa thuốc', title: 'Xóa thuốc' },
						el('i', { class: 'bi bi-trash3', 'aria-hidden': 'true' })
					)
				)
			),
			el('tr', { class: `doctor-prescription-table__note-row${external}`, 'data-prescription-row-id': row.uid, 'data-prescription-type': documentType },
				el('td', { colspan: noteColspan, class: 'doctor-prescription-table__note-cell' },
					el('div', { class: 'doctor-prescription-table__note-line' },
						el('i', { class: 'bi bi-card-text', 'aria-hidden': 'true' }),
						' ',
						el('span', null, 'Ghi chú'),
						' ',
						el('input', { type: 'text', defaultValue: row.usageNote ?? '', 'data-prescription-field': 'usageNote', 'aria-label': 'Ghi chú thuốc', placeholder: 'Thêm ghi chú cách dùng thuốc' })
					)
				)
			)
		];
	}

	function getTableColumnCount(mode) {
		const scheduleCellCount = mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? 2
			: PRESCRIPTION_SLOT_DEFS.length;
		return scheduleCellCount + 6;
	}

	function buildGroupHeader(type, code, colCount) {
		const modifier = String(type).toLowerCase();
		const codeText = code ? `Mã đơn thuốc: ${code}` : 'Chưa cấp mã đơn';
		return el('tr', { class: `doctor-prescription-table__group-row doctor-prescription-table__group-row--${modifier}`, 'data-prescription-group': type },
			el('td', { colspan: colCount, class: 'doctor-prescription-table__group-cell' },
				el('div', { class: 'doctor-prescription-table__group-inner' },
					el('span', { class: 'doctor-prescription-table__group-title' }, TYPE_CONTRACT.getLabel(type)),
					' ',
					el('span', { class: `doctor-prescription-table__group-code${code ? '' : ' is-empty'}` }, codeText)
				)
			)
		);
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
	function buildGroupedRows(rows, mode, options) {
		const renderedMedicineAllocations = new Set();
		const codesByType = options.codesByType || {};
		const colCount = getTableColumnCount(mode);
		const nodes = [];
		groupRowsByDocumentType(rows).forEach((groupRows, type) => {
			if (!groupRows.length) return;
			nodes.push(buildGroupHeader(type, codesByType[type], colCount));
			groupRows.forEach((row, groupIndex) => {
				const allocationKey = row && !row.isExternal && row.medicineId ? String(row.medicineId) : '';
				const showAllocation = Boolean(allocationKey) && !renderedMedicineAllocations.has(allocationKey);
				if (showAllocation) renderedMedicineAllocations.add(allocationKey);
				nodes.push(...buildPrescriptionRows(row, groupIndex, mode, options.getRowTotal, showAllocation));
			});
		});
		return nodes;
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
		if (head) replace(head, buildTableHeader(mode));
		replace(body, rows.length ? buildGroupedRows(rows, mode, options) : []);
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
		const stock = buildCurrentStock(row);
		if (stock) {
			if (currentStock) currentStock.replaceWith(stock);
			else copy.append(stock);
		} else {
			currentStock?.remove();
		}
		const current = copy.querySelector('.doctor-prescription-batches');
		const allocation = buildBatchAllocation(row, Boolean(options.showAllocation));
		if (!allocation) {
			current?.remove();
			return Boolean(current);
		}
		if (current) current.replaceWith(allocation);
		else copy.append(allocation);
		return true;
	}

	const api = { render, updateRowTotal, updateBatchAllocation };
	window.QLPKDoctorModuleRegistry.register('prescriptionRows', api);
})(window);
