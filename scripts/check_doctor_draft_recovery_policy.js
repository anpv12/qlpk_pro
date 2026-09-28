#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'app/static/js/doctor-examination/draft-recovery-policy.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const modules = {};
const windowStub = {
	QLPKDoctorModuleRegistry: { register(name, value) { modules[name] = value; }, get: name => modules[name] || null }
};
vm.runInNewContext(source, { window: windowStub, console }, { filename: sourcePath });
const policy = modules.draftRecoveryPolicy;
if (!policy) throw new Error('Không tìm thấy owner draftRecoveryPolicy');

const classify = policy.classifyDraftRecord;
if (typeof classify !== 'function') throw new Error('Không lấy được policy phân loại bản nháp');
const mergeFailedSave = policy.mergeFailedSaveDraft;
if (typeof mergeFailedSave !== 'function') throw new Error('Không lấy được policy phục hồi save một phần');
const resolveDraft = policy.resolveDraftRecord;
if (typeof resolveDraft !== 'function') throw new Error('Không lấy được policy quyết định vòng đời bản nháp');

const now = 1_000_000;
const context = { userId: 7, appointmentId: 1101, patientId: 267 };
const base = {
	clinical: { controls: { lyDoKham: 'Dữ liệu DB gốc' } },
	support: { prescription: { medicineDays: 5 } },
	history: {}
};
const draft = {
	clinical: { controls: { lyDoKham: 'Dữ liệu chưa lưu' } },
	support: { prescription: { medicineDays: 7 } },
	history: {}
};
const newerDatabase = {
	clinical: { controls: { lyDoKham: 'Dữ liệu đã được lưu ở nơi khác' } },
	support: { prescription: { medicineDays: 9 } },
	history: {}
};
const validRecord = {
	key: 'doctor-clinical:7:1101',
	captureId: 'capture-1',
	schemaVersion: 1,
	...context,
	baseSnapshot: base,
	snapshot: draft,
	savedAt: now - 100,
	expiresAt: now + 1000
};
const legacyGeneralUsageBase = {
	...base,
	support: { prescription: { ...base.support.prescription, usageInstructions: 'Uống sau ăn' } }
};
const legacyGeneralUsageDraft = {
	...draft,
	support: { prescription: { ...draft.support.prescription, usageInstructions: 'Uống đủ nước' } }
};
const retiredGeneralUsageOnlyDraft = {
	...base,
	support: { prescription: { ...base.support.prescription, usageInstructions: 'Nội dung nháp cũ' } }
};

const cases = [
	['DB chưa đổi, nháp khác DB', validRecord, base, 'recoverable'],
	['DB đã đúng bằng nội dung nháp', validRecord, draft, 'redundant'],
	['DB đã được lưu mới hơn nội dung gốc', validRecord, newerDatabase, 'superseded'],
	['Nháp hết hạn', { ...validRecord, expiresAt: now }, base, 'invalid'],
	['Sai người dùng', { ...validRecord, userId: 8 }, base, 'invalid'],
	['Sai ca khám', { ...validRecord, appointmentId: 1102 }, base, 'invalid'],
	['Sai bệnh nhân', { ...validRecord, patientId: 268 }, base, 'invalid'],
	['Thiếu dữ liệu gốc', { ...validRecord, baseSnapshot: undefined }, base, 'invalid'],
	['Nháp cũ có general usage và còn thay đổi khác', {
		...validRecord,
		baseSnapshot: legacyGeneralUsageBase,
		snapshot: legacyGeneralUsageDraft
	}, base, 'recoverable'],
	['Nháp chỉ khác general usage đã nghỉ', {
		...validRecord,
		baseSnapshot: legacyGeneralUsageBase,
		snapshot: retiredGeneralUsageOnlyDraft
	}, base, 'redundant']
];

const failures = cases.flatMap(([name, record, baseline, expected]) => {
	const actual = classify(record, context, baseline, now);
	return actual === expected ? [] : [`${name}: expected ${expected}, got ${actual}`];
});

const partialSaveBase = {
	clinical: { controls: { mainReason: 'Khám cũ', examCirculation: 'Tim cũ' } },
	support: { prescription: { rows: ['Thuốc cũ'] }, services: { rows: ['Dịch vụ cũ'] } },
	history: { personal: 'Tiền sử cũ' }
};
const partialSaveDraft = {
	clinical: { controls: { mainReason: 'Khám mới', examCirculation: 'Tim mới' } },
	support: { prescription: { rows: ['Thuốc mới'] }, services: { rows: ['Dịch vụ mới'] } },
	history: { personal: 'Tiền sử mới' }
};
const partialDatabase = {
	clinical: { controls: { mainReason: 'Khám mới', examCirculation: 'Tim cũ' } },
	support: { prescription: { rows: ['Thuốc mới'] }, services: { rows: ['Dịch vụ cũ'] } },
	history: { personal: 'Tiền sử mới' }
};
const expectedRebasedDraft = {
	clinical: { controls: { mainReason: 'Khám mới', examCirculation: 'Tim mới' } },
	support: { prescription: { rows: ['Thuốc mới'] }, services: { rows: ['Dịch vụ mới'] } },
	history: { personal: 'Tiền sử mới' }
};
const rebasedDraft = mergeFailedSave(partialSaveBase, partialSaveDraft, partialDatabase);
if (JSON.stringify(rebasedDraft) !== JSON.stringify(expectedRebasedDraft)) {
	failures.push(`Save một phần: expected ${JSON.stringify(expectedRebasedDraft)}, got ${JSON.stringify(rebasedDraft)}`);
}

const conflictingDatabase = {
	...partialDatabase,
	clinical: { controls: { mainReason: 'Khám từ nơi khác', examCirculation: 'Tim cũ' } }
};
const conflictMerged = mergeFailedSave(partialSaveBase, partialSaveDraft, conflictingDatabase);
if (conflictMerged.clinical.controls.mainReason !== 'Khám từ nơi khác'
	|| conflictMerged.clinical.controls.examCirculation !== 'Tim mới') {
	failures.push('Save một phần: DB mới phải thắng field xung đột, field chưa lưu vẫn phải được giữ');
}

const standardSuperseded = resolveDraft(validRecord, context, newerDatabase, now);
if (standardSuperseded.action !== 'delete') {
	failures.push('Nháp thường dựa trên DB cũ phải bị xóa, không được khôi phục');
}

const failedSaveRecord = { ...validRecord, baseSnapshot: partialSaveBase, snapshot: partialSaveDraft, recoveryMode: 'failed-save' };
const failedSaveResolution = resolveDraft(failedSaveRecord, context, partialDatabase, now);
if (failedSaveResolution.action !== 'replace'
	|| failedSaveResolution.record.recoveryMode !== 'standard'
	|| JSON.stringify(failedSaveResolution.record.baseSnapshot) !== JSON.stringify(partialDatabase)
	|| JSON.stringify(failedSaveResolution.record.snapshot) !== JSON.stringify(expectedRebasedDraft)) {
	failures.push('Nháp do save một phần phải được rebase đúng một lần trên DB hiện tại');
}

const failedSaveWithoutPartialWrite = resolveDraft(
	{ ...validRecord, recoveryMode: 'failed-save' },
	context,
	base,
	now
);
if (failedSaveWithoutPartialWrite.action !== 'replace'
	|| failedSaveWithoutPartialWrite.record.recoveryMode !== 'standard') {
	failures.push('Nháp do save lỗi trước khi ghi DB phải trở thành nháp thường sau lần load kế tiếp');
}

if (failures.length) {
	console.error('Doctor draft recovery policy failed:');
	failures.forEach(failure => console.error(`- ${failure}`));
	process.exit(1);
}

console.log(`[OK] Doctor draft recovery policy: ${cases.length + 5} cases`);
