const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const DOSE_UTILS = 'app/static/js/prescriptions/shared/prescription-dose-utils.js';
const TEMPLATE = 'app/static/js/prescriptions/shared/prescription-document-template.js';
const MODEL = 'app/static/js/doctor-examination/prescription-model.js';
const read = file => fs.readFileSync(file, 'utf8');

function loadDoseUtils() {
    const context = vm.createContext({ window: {}, console });
    vm.runInContext(read(DOSE_UTILS), context);
    return context.window.PrescriptionDoseUtils;
}

function loadModel() {
    const modules = new Map();
    const window = {
        QLPKDoctorModuleRegistry: {
            get: name => name === 'supportRuntime' ? {
                textOf: value => value === null || value === undefined ? '' : String(value).trim(),
                toNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
            } : modules.get(name) || null,
            register: (name, value) => modules.set(name, value)
        }
    };
    const context = vm.createContext({ window, console, Date });
    for (const file of ['app/static/js/prescriptions/shared/prescription-type-contract.js', DOSE_UTILS, MODEL]) {
        vm.runInContext(read(file), context);
    }
    return modules.get('prescriptionModel');
}

test('dose utils keep the Doctor editor parsing and fraction display', () => {
    const dose = loadDoseUtils();
    assert.equal(dose.parseDose('1/2'), 0.5);
    assert.equal(dose.parseDose('0,5'), 0.5);
    assert.equal(dose.parseDose('1,5/2'), 0.75);
    assert.equal(dose.parseDose('2 viên'), 0);
    assert.equal(dose.parseDose('1 1/2'), 0);
    assert.equal(dose.parseDose('', null), null);
    assert.equal(dose.parseDose('-', 7), 7);
    assert.equal(dose.formatDose(0.5), '1/2');
    assert.equal(dose.formatDose(0.25), '1/4');
    assert.equal(dose.formatDose(1.5), '1,5');
    assert.equal(dose.formatDose(2), '2');
    assert.equal(dose.formatDose(0), '0');
});

test('Doctor model computes quantities through the shared dose owner', () => {
    const model = loadModel();
    const slots = { schedule: { mode: 'time_slots', time_slots: { morning: '1/2', evening: '1/2' } } };
    const perDay = { schedule: { mode: 'times_per_day', times_per_day: { qty_per_time: '1/2', times_per_day: 2 } } };
    assert.equal(model.calculatePrescriptionQuantity(slots, 30, 'time_slots'), 30);
    assert.equal(model.calculatePrescriptionQuantity(perDay, 30, 'times_per_day'), 30);
    assert.equal(model.formatDoseValue(0.5), '1/2');
    assert.equal(model.formatDoseValue(0), '');
    assert.equal(model.parseMedicineUsage('tối 1v').schedule.mode, 'time_slots');
});

test('only one dose implementation is wired into every prescription surface', () => {
    const model = read(MODEL);
    const template = read(TEMPLATE);
    assert.doesNotMatch(model, /typeof window\.(parseFractionalQuantity|formatDoseAsFraction|normalizeScheduleData|parseMedicineUsagePayload)/);
    assert.doesNotMatch(template, /decimalToFraction|function gcd|parseFloat\(parts/);
    const entry = read('app/static/js/doctor-examination-entry.js');
    const doseImport = entry.indexOf("import './prescriptions/shared/prescription-dose-utils.js';");
    assert.ok(doseImport > 0 && doseImport < entry.indexOf("import './prescriptions/shared/prescription-document-template.js';"));
    assert.ok(doseImport < entry.indexOf("import './doctor-examination/prescription-model.js';"));
    for (const page of ['app/templates/psychologist-examination.html', 'app/templates/verify-prescription.html']) {
        const html = read(page);
        const doseScript = html.indexOf('/static/js/prescriptions/shared/prescription-dose-utils.js');
        assert.ok(doseScript > 0 && doseScript < html.indexOf('/static/js/prescriptions/shared/prescription-document-template.js'), page);
    }
});
