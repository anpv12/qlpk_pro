'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/doctor-examination/patient-history-bridge.js'),
  'utf8'
);

async function main() {
  const registrations = new Map();
  const calls = [];
  const openedPatients = [];
  const modalInstance = {
    reset() {},
    getState() { return {}; },
    openPatient(patientId) {
      openedPatients.push(patientId);
      return { status: 'opened', patientId };
    }
  };
  const modalContract = {
    getOrCreate(options) {
      calls.push(options);
      return modalInstance;
    }
  };
  const registry = {
    require(name) {
      assert.equal(name, 'patientModalContract');
      return modalContract;
    },
    register(name, value, metadata) {
      registrations.set(name, { value, metadata });
    }
  };
  const window = { QLPKDoctorModuleRegistry: registry };
  const document = { getElementById() { return null; } };

  vm.runInNewContext(source, { window, document });
  const registration = registrations.get('patientHistoryBridge');
  assert.ok(registration);
  assert.deepEqual([...registration.metadata.dependencies], ['patientModalContract']);

  let patientId = 42;
  let appointmentId = 1051;
  let appointments = [{ id: 1051 }];
  const selectedAppointments = [];
  let loading = false;
  const copyHistory = () => true;
  const formatDateDisplay = value => `date:${value}`;
  const instance = registration.value.create({
    document,
    context: { name: 'doctor-context' },
    apiCall() {},
    showToast() {},
    formatDateDisplay,
    getCurrentPatientData: () => ({ id: patientId }),
    getCurrentAppointmentId: () => appointmentId,
    setCurrentPatientId(next) { patientId = next; },
    getAppointments: () => appointments,
    selectPatientCard(next) {
      selectedAppointments.push(next);
      return { status: 'selected', appointmentId: next };
    },
    getExaminationStatusBadgeClass: () => 'status',
    getExaminationStatusText: () => 'Đang khám',
    copyHistory,
    beforeOpen: () => Boolean(patientId && !loading)
  });

  assert.equal(instance, modalInstance);
  assert.equal(calls.length, 1);
  const options = calls[0];
  assert.equal(options.context.name, 'doctor-context');
  assert.equal(options.document, document);
  assert.equal(options.controlOptions.copyHistory, copyHistory);
  assert.equal(options.triggers.length, 1);
  assert.equal(options.triggers[0].id, 'doctorClinicalHistoryButton');
  assert.equal(options.triggers[0].prefillCurrent, true);
  assert.equal(options.triggers[0].beforeOpen(), true);
  loading = true;
  assert.equal(options.triggers[0].beforeOpen(), false);
  loading = false;
  patientId = null;
  assert.equal(options.triggers[0].beforeOpen(), false);

  const context = options.buildContextOptions();
  assert.equal(context.getCurrentPatientData().id, null);
  assert.equal(context.getCurrentAppointmentId(), appointmentId);
  assert.equal(context.getFormatDateDisplay(), formatDateDisplay);
  assert.deepEqual([...context.activeStatuses], ['doctor_exam', 'conclusion']);
  assert.equal(context.showCopyAction, true);
  assert.equal(context.showDeleteAction, false);

  const globalActions = window.QLPKGlobalSearchActions;
  assert.ok(globalActions);
  assert.deepEqual(globalActions.handleAction({
    kind: 'open_patient_history',
    payload: { patient_id: 42 }
  }), { status: 'opened', patientId: 42 });
  assert.deepEqual(openedPatients, [42]);

  assert.deepEqual(globalActions.handleAction({
    kind: 'open_appointment',
    payload: { appointment_id: 1051, patient_id: 42 }
  }), { status: 'selected', appointmentId: 1051 });
  assert.deepEqual(selectedAppointments, [1051]);

  appointments = [];
  assert.deepEqual(globalActions.handleAction({
    kind: 'open_appointment',
    payload: { appointment_id: 990, patient_id: 42 }
  }), { status: 'opened', patientId: 42 });
  assert.deepEqual(openedPatients, [42, 42]);
  assert.equal(globalActions.handleAction({ kind: 'unsupported' }), false);
  console.log('doctor patient history bridge lifecycle: ok');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
