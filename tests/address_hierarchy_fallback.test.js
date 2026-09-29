'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

const SOURCE_FILE = path.join(__dirname, '../app/static/js/components/address-hierarchy-utils.js');
const province = 'Thành phố Hồ Chí Minh';
const district = 'Quận 1';
const ward = 'Phường Bến Nghé';

function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function createHarness(routeResponse) {
  const calls = [];
  const errors = [];
  const elements = new Map(['district', 'ward', 'modalDistrict', 'modalWard'].map(id => [id, {
    options: [],
    set innerHTML(value) { this.placeholder = value; this.options = []; },
    appendChild(option) { this.options.push(option); }
  }]));
  const document = {
    getElementById: id => elements.get(id),
    createElement: () => ({ value: '', textContent: '', dataset: {} })
  };
  const options = {
    document,
    console: { error: (...args) => errors.push(args) },
    apiCall: async rawUrl => {
      const url = new URL(rawUrl, 'http://localhost');
      calls.push(url);
      return routeResponse(url);
    }
  };
  const window = { document, URLSearchParams, encodeURIComponent, console: options.console };
  runScriptFile(SOURCE_FILE, vm.createContext({ window }));
  return { api: window.ClinicalAddressHierarchyUtils, options, calls, errors, elements };
}

for (const modal of [false, true]) {
  const label = modal ? 'modal' : 'form chính';
  const field = modal ? 'modalWard' : 'ward';
  const method = modal ? 'loadWardsModal' : 'loadWards';

  test(`${label}: wards 404 dùng mã quận từ query 200`, async () => {
    const harness = createHarness(url => {
      if (url.pathname === '/api/vietnam-address/wards') {
        assert.equal(url.searchParams.get('province'), province);
        assert.equal(url.searchParams.get('district'), district);
        return response(404, { success: false });
      }
      if (url.pathname === '/api/vietnam-address/districts') {
        assert.equal(url.searchParams.get('province'), province);
        return response(200, { success: true, data: [{ name: district, code: '760' }] });
      }
      assert.equal(url.pathname, '/api/vietnam-address/wards/760');
      return response(200, { success: true, data: [{ name: ward }] });
    });
    await harness.api[method](province, district, harness.options);
    assert.equal(harness.calls.length, 3);
    assert.equal(harness.elements.get(field).options[0]?.value, ward);
    assert.deepEqual(harness.errors, []);
  });

  test(`${label}: wards và districts 404 dùng mã tỉnh rồi mã quận`, async () => {
    const routes = {
      '/api/vietnam-address/wards': response(404, { success: false }),
      '/api/vietnam-address/districts': response(404, { success: false }),
      '/api/vietnam-address/provinces': response(200, { data: [{ name: province.normalize('NFD'), id: '79' }] }),
      '/api/vietnam-address/districts/79': response(200, [{ district_name: district, id: '760' }]),
      '/api/vietnam-address/wards/760': response(200, [{ ward_name: ward }])
    };
    const harness = createHarness(url => {
      assert.ok(routes[url.pathname], url.pathname);
      return routes[url.pathname];
    });
    await harness.api[method](province, district, harness.options);
    assert.equal(harness.calls.length, 5);
    assert.equal(harness.elements.get(field).options[0]?.textContent, ward);
    assert.deepEqual(harness.errors, []);
  });

  test(`${label}: wards thành công không gọi dự phòng`, async () => {
    const harness = createHarness(() => response(200, { success: true, data: [{ name: ward }] }));
    await harness.api[method](province, district, harness.options);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.elements.get(field).options[0]?.value, ward);
    assert.deepEqual(harness.errors, []);
  });

  test(`${label}: wards 500 không chạy dự phòng`, async () => {
    const harness = createHarness(() => response(500, { success: false }));
    await harness.api[method](province, district, harness.options);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.elements.get(field).options.length, 0);
  });
}

test('fallback không đoán mã khi tên quận không khớp', async () => {
  const initial = response(404, { success: false });
  const harness = createHarness(url => url.pathname === '/api/vietnam-address/wards'
    ? initial : response(200, { data: [{ name: 'Quận 2', code: '761' }] }));
  const result = await harness.api.callVietnamAddressAPI('/api/vietnam-address/wards', { province, district }, harness.options);
  assert.equal(result, initial);
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.errors, []);
});

test('fallback lỗi mạng trả lại response gốc và ghi log', async () => {
  const initial = response(404, { success: false });
  const harness = createHarness(url => {
    if (url.pathname === '/api/vietnam-address/wards') return initial;
    throw new Error('network unavailable');
  });
  assert.equal(await harness.api.callVietnamAddressAPI('/api/vietnam-address/wards', { province, district }, harness.options), initial);
  assert.equal(harness.errors.length, 1);
});

test('fallback dừng khi không tìm thấy tỉnh, không gọi URL có mã rỗng', async () => {
  const initial = response(404, { success: false });
  const harness = createHarness(url => url.pathname === '/api/vietnam-address/provinces'
    ? response(200, { data: [] }) : initial);
  assert.equal(await harness.api.callVietnamAddressAPI('/api/vietnam-address/wards', { province, district }, harness.options), initial);
  assert.equal(harness.calls.length, 3);
  assert.deepEqual(harness.errors, []);
});

test('callVietnamAddressAPI không che lỗi mạng của request chính', async () => {
  const error = new Error('primary request failed');
  const harness = createHarness(() => { throw error; });
  await assert.rejects(harness.api.callVietnamAddressAPI('/api/vietnam-address/wards', { province, district }, harness.options), error);
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.errors.length, 1);
});

test('fallback endpoint không hỗ trợ không gọi API', async () => {
  const harness = createHarness(() => { throw new Error('unexpected request'); });
  assert.equal(await harness.api.tryFallbackAPI('/api/other', {}, harness.options), null);
  assert.equal(harness.calls.length, 0);
});

test('adapter giữ đường gọi chung cho form chính và modal', async () => {
  const harness = createHarness(url => url.pathname === '/api/vietnam-address/wards'
    ? response(200, { success: true, data: [{ name: ward }] })
    : response(200, { success: true, data: [{ name: district, code: '760' }] }));
  const adapter = harness.api.createAddressHierarchyAdapter(harness.options);
  await adapter.loadDistricts(province);
  await adapter.loadDistrictsModal(province);
  await adapter.loadWards(province, district);
  await adapter.loadWardsModal(province, district);
  assert.equal(harness.calls.length, 4);
  assert.equal(harness.elements.get('ward').options[0].value, ward);
  assert.equal(harness.elements.get('modalWard').options[0].value, ward);
  assert.equal(harness.elements.get('district').options[0].value, district);
  assert.equal(harness.elements.get('modalDistrict').options[0].value, district);
  assert.deepEqual(harness.errors, []);
});

for (const method of ['loadDistricts', 'loadDistrictsModal']) {
  test(`${method}: districts 404 dùng mã tỉnh, giữ mã trên option`, async () => {
    const harness = createHarness(url => {
      if (url.pathname === '/api/vietnam-address/districts') return response(404, { success: false });
      if (url.pathname === '/api/vietnam-address/provinces') return response(200, { data: [{ name: province, code: '79' }] });
      assert.equal(url.pathname, '/api/vietnam-address/districts/79');
      return response(200, { success: true, data: [{ district_name: district, code: '760' }] });
    });
    await harness.api[method](province, harness.options);
    const element = harness.elements.get(method === 'loadDistricts' ? 'district' : 'modalDistrict');
    assert.equal(element.options[0]?.value, district);
    assert.equal(element.options[0]?.dataset.code, '760');
    assert.deepEqual(harness.errors, []);
  });
}
