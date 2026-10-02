#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile } = require('../tests/helpers/module-source');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'app/static/js/doctor-examination/prescription-model.js');
const typeContractPath = path.join(root, 'app/static/js/prescriptions/shared/prescription-type-contract.js');
const doseUtilsPath = path.join(root, 'app/static/js/prescriptions/shared/prescription-dose-utils.js');
const modules = new Map();
const windowStub = {
	QLPKDoctorModuleRegistry: {
		get(name) {
			if (name === 'supportRuntime') {
				return {
					textOf: value => value === null || value === undefined ? '' : String(value).trim(),
					toNumber: (value, fallback = 0) => {
						const parsed = Number(value);
						return Number.isFinite(parsed) ? parsed : fallback;
					}
				};
			}
			return modules.get(name) || null;
		},
		register(name, value) {
			modules.set(name, value);
		}
	}
};

const context = vm.createContext({ window: windowStub, console, Date });
for (const file of [typeContractPath, doseUtilsPath, sourcePath]) runScriptFile(file, context);

const model = modules.get('prescriptionModel');
if (!model) throw new Error('Không lấy được prescriptionModel');

const timeSlotRow = {
	schedule: {
		mode: model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS,
		time_slots: { morning: 0, noon: 5, afternoon: 0, evening: 1 }
	}
};
const halfDoseRow = {
	schedule: {
		mode: model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS,
		time_slots: { morning: '1/2', noon: 0, afternoon: 0, evening: 0 }
	}
};
const timesPerDayRow = {
	schedule: {
		mode: model.PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY,
		times_per_day: { qty_per_time: '1/2', times_per_day: 2 }
	}
};

const cases = [
	['Ngày trống tính đúng liều một ngày', timeSlotRow, '', model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 6],
	['Ngày chưa có tính đúng liều một ngày', timeSlotRow, undefined, model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 6],
	['Nhập số ngày nhân đúng tổng liều', timeSlotRow, '7', model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 42],
	['Ngày bằng 0 vẫn cho kết quả 0', timeSlotRow, '0', model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 0],
	['Liều lẻ một ngày được làm tròn lúc cấp', halfDoseRow, '', model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 1],
	['Liều lẻ nhiều ngày chỉ làm tròn sau tổng', halfDoseRow, '15', model.PRESCRIPTION_USAGE_MODES.TIME_SLOTS, 8],
	['Theo lần/ngày hoạt động khi ngày trống', timesPerDayRow, '', model.PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY, 1],
	['Theo lần/ngày nhân lại khi nhập số ngày', timesPerDayRow, '10', model.PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY, 10]
];

for (const [name, row, days, mode, expected] of cases) {
	assert.equal(model.calculatePrescriptionQuantity(row, days, mode), expected, name);
}

console.log(`[OK] Doctor prescription quantity policy: ${cases.length} cases`);
