'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function load(window, filename) {
  const source = fs.readFileSync(path.join(__dirname, '../app/static/js', filename), 'utf8');
  vm.runInNewContext(source, { window, document: window.document, console });
}

function createHarness() {
  const fields = Object.fromEntries(['province', 'provinceHidden', 'ward', 'district', 'address', 'addressSummary', 'addressDetail'].map(id => [id, { value: '', dataset: {}, tagName: 'INPUT' }]));
  const document = {
    getElementById: id => fields[id] || null,
    querySelector: selector => selector.startsWith('select') ? null : fields[selector.split('#')[1]] || null
  };
  const window = { document, console };
  load(window, 'receptionist/address-main-form.js');
  load(window, 'receptionist/patient-address-populate.js');
  load(window, 'components/patient-intake-form.js');
  const visits = [];
  const intake = window.QLPKPatientIntakeForm.create({
    patientInfo: {
      populate: () => true,
      clear() {},
      collect: () => ({})
    },
    patientVisit: {
      populate: data => { visits.push(data); return true; },
      clear: () => { visits.length = 0; },
      collect: () => ({})
    }
  });
  return { window, document, fields, visits, intake };
}

function createDeferredIntake(harness) {
  const pending = [];
  const options = [];
  const intake = harness.window.QLPKPatientIntakeForm.create({
    patientInfo: {
      populate(data, context) { const item = deferred(); pending.push(item); options.push(context); return item.promise; },
      clear() {}, collect: () => ({})
    },
    patientVisit: {
      populate: data => { harness.visits.push(data); return true; },
      clear: () => { harness.visits.length = 0; }, collect: () => ({})
    }
  });
  return { intake, pending, options };
}

test('Đổi A → B → A bỏ hydrate cũ, không so riêng patient ID', async () => {
  const harness = createHarness();
  const { intake, pending, options } = createDeferredIntake(harness);
  const first = intake.populate({ id: 1 });
  const second = intake.populate({ id: 2 });
  const third = intake.populate({ id: 1 });
  pending[2].resolve(true);
  await third;
  pending[0].resolve(true);
  pending[1].resolve(true);
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.deepEqual(harness.visits, [{ id: 1 }]);
  assert.equal(options[0].isCurrentLoad(), false);
  assert.equal(options[2].isCurrentLoad(), true);
});

test('Clear khi đang tải không điền lại hỏi bệnh', async () => {
  const harness = createHarness();
  const { intake, pending } = createDeferredIntake(harness);
  const loading = intake.populate({ id: 1 });
  intake.clear();
  pending[0].resolve(true);
  assert.equal(await loading, false);
  assert.deepEqual(harness.visits, []);
});

test('Patient populate false không bị đổi thành thành công', async () => {
  const harness = createHarness();
  const { intake, pending } = createDeferredIntake(harness);
  const loading = intake.populate({ id: 1 });
  pending[0].resolve(false);
  assert.equal(await loading, false);
  assert.deepEqual(harness.visits, []);
});

test('Luồng đồng bộ vẫn trả payload và điền hỏi bệnh ngay', () => {
  const harness = createHarness();
  const data = { id: 1 };
  assert.equal(harness.intake.populate(data), data);
  assert.deepEqual(harness.visits, [data]);
});

test('Lỗi ca cũ bị bỏ; lỗi ca hiện tại vẫn truyền cho caller', async () => {
  const harness = createHarness();
  const { intake, pending } = createDeferredIntake(harness);
  const oldLoad = intake.populate({ id: 1 });
  const currentLoad = intake.populate({ id: 2 });
  pending[0].reject(new Error('old failure'));
  assert.equal(await oldLoad, false);
  pending[1].reject(new Error('current failure'));
  await assert.rejects(currentLoad, /current failure/);
  assert.deepEqual(harness.visits, []);
});

test('Hai instance intake không vô hiệu hóa lẫn nhau', async () => {
  const harness = createHarness();
  const first = createDeferredIntake(harness);
  const second = createDeferredIntake(harness);
  const firstLoad = first.intake.populate({ id: 1 });
  const secondLoad = second.intake.populate({ id: 2 });
  second.intake.clear();
  first.pending[0].resolve(true);
  second.pending[0].resolve(true);
  assert.equal((await firstLoad).id, 1);
  assert.equal(await secondLoad, false);
});

test('Tỉnh tải chậm không gán code/hidden/ward của ca cũ', async () => {
  const harness = createHarness();
  const pending = deferred();
  let current = true;
  const loading = harness.window.ReceptionistPatientAddressPopulate.applyAddressWithHierarchy(
    { province: 'Old province', ward: 'Old ward' },
    { document: harness.document, isCurrentLoad: () => current, apiCall: () => pending.promise,
      safeSetValue: (id, value) => { if (harness.fields[id]) harness.fields[id].value = value || ''; } }
  );
  current = false;
  for (const id of ['province', 'provinceHidden', 'ward']) {
    harness.fields[id].value = 'New value';
    harness.fields[id].dataset.code = 'new-code';
  }
  pending.resolve({ ok: true, json: async () => ({ data: [{ code: 'old-code', name: 'Old province' }] }) });
  assert.equal(await loading, false);
  for (const id of ['province', 'provinceHidden', 'ward']) {
    assert.equal(harness.fields[id].value, 'New value');
    assert.equal(harness.fields[id].dataset.code, 'new-code');
  }
});

test('Phường tải chậm không gán code của ca cũ', async () => {
  const harness = createHarness();
  const pending = deferred();
  let current = true;
  harness.fields.province.dataset.code = 'province-code';
  const loading = harness.window.ReceptionistAddressMainForm.setMainAddressWardValue('Old ward', {
    document: harness.document, isCurrentLoad: () => current, apiCall: () => pending.promise
  });
  current = false;
  harness.fields.ward.value = 'New ward';
  harness.fields.ward.dataset.code = 'new-code';
  pending.resolve({ ok: true, json: async () => ({ data: [{ code: 'old-code', name: 'Old ward' }] }) });
  await loading;
  assert.equal(harness.fields.ward.value, 'New ward');
  assert.equal(harness.fields.ward.dataset.code, 'new-code');
});
