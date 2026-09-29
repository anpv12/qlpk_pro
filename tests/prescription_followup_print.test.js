const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: { location: { origin: 'http://localhost' } }, console });
runScriptFile(path.join(root,
    'app/static/js/prescriptions/shared/prescription-document-template.js'), context);
runScriptFile(path.join(root,
    'app/static/js/prescriptions/pages/doctor-prescription-print.js'), context);

function render(data, renderContext = 'print') {
    return context.buildPrescriptionPreviewHTML({
        patient: {}, history: {}, examinationDetail: {},
        prescriptionData: data, renderContext,
    });
}

for (const renderContext of ['print', 'verify', 'modal']) {
    for (const visible of [false, true, undefined]) {
        const data = { medicines: [], re_examination_date: '2026-09-20', show_re_examination_date: visible };
        const html = render(data, renderContext);
        assert.equal(html.includes('Tái khám ngày'), visible !== false);
        assert.equal(html.includes('20/09/2026'), visible !== false);
        assert.equal(data.re_examination_date, '2026-09-20');
    }
    assert.equal(render({ show_re_examination_date: true }, renderContext).includes('Tái khám ngày'), false);
}

async function main() {
    let rendered;
    context.window.getClinicInfoConfig = () => ({});
    const controller = context.window.createDoctorPrescriptionPrint({
        getCurrentAppointmentId: () => 1,
        getCurrentAppointmentData: async () => ({}),
        fetchPrescriptionDataForPrint: async () => ({
            prescriptionData: { show_re_examination_date: false, re_examination_date: '2026-09-20' },
        }),
        collectPrescriptionFormData: () => ({ medicines: [], re_examination_date: '2026-09-20' }),
        printDocument: { open: () => ({}), render: (_popup, data) => { rendered = data; } },
    });
    await controller.printMainPrescription();
    assert.equal(rendered.prescriptionData.show_re_examination_date, false);
    assert.equal(render(rendered.prescriptionData).includes('Tái khám ngày'), false);

    const content = { innerHTML: '' };
    context.document = { getElementById: () => content };
    runScriptFile(path.join(root,
        'app/static/js/prescriptions/components/prescription-modal-preview.js'), context);
    const preview = context.window.createPrescriptionModalPreview({
        buildPrescriptionScreenHTML: context.buildPrescriptionScreenHTML,
        createBarcodesInElement: () => {},
    });
    for (const visible of [false, true, false]) {
        preview.setupPrescriptionTabPagination({ prescriptionData: {
            ...rendered.prescriptionData, show_re_examination_date: visible,
            prescriptions: [{ type: 'BASIC', medicines: [] }, { type: 'H', medicines: [] }],
        } });
        assert.equal((content.innerHTML.match(/Tái khám ngày/g) || []).length, visible ? 2 : 0);
    }
    console.log('Prescription follow-up rendering and Doctor print merge OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
