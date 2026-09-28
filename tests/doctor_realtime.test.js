'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '../app/static/js', file), 'utf8');
class Surface extends EventTarget {}
class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } }
const delay = () => new Promise(resolve => setTimeout(resolve, 15));
const response = (ids, next = null) => ({ ok: true, json: async () => ({ appointments: ids.map(id => ({id})), pagination: {has_next: !!next, next_page: next} }) });

async function main() {
  const window = new Surface(), document = new Surface();
  Object.assign(window, {document, setTimeout, clearTimeout, location: {pathname: '/doctor-examination.html', origin: 'http://localhost', search: ''}});
  window.self = window; window.top = window;
  document.readyState = 'loading'; document.querySelectorAll = () => [];
  const callbacks = {}, sent = [], received = [];
  const socket = {connected: true, on: (name, fn) => callbacks[name] = fn, emit: (...args) => sent.push(args), disconnect() {}};
  let ioOptions, token = 'first-token';
  window.io = options => {ioOptions = options; return socket;};
  const context = {window, document, CustomEvent, URL, URLSearchParams, localStorage: {getItem: () => token}, console};
  vm.runInNewContext(source('realtime-client.js'), context);
  window.addEventListener('qlpk:realtime:event', event => received.push(event.detail));
  window.QLPKRealtimeClient.start(); callbacks.connect(); callbacks['qlpk:subscribed'](); callbacks['qlpk:subscribed']();
  assert.equal(received.filter(e => e.type === 'realtime.resynced').length, 1);
  const packet = {event_id:'shared-room-event', type:'appointment.changed', payload:{appointment_id:1}};
  callbacks['qlpk:event'](packet); callbacks['qlpk:event'](packet);
  assert.equal(received.filter(e => e.type === 'appointment.changed').length, 1);
  token = 'renewed-token'; ioOptions.auth(auth => assert.equal(auth.token, undefined));
  window.QLPKRealtimeClient.stop(); window.QLPKRealtimeClient.start();
  ioOptions.auth(auth => assert.equal(auth.token, token));
  callbacks.connect(); callbacks['qlpk:subscribed']();
  assert.equal(received.filter(e => e.type === 'realtime.resynced').length, 2);
  assert.equal(sent.length, 2);

  vm.runInNewContext(source('realtime-page-hooks.js'), context);
  let batch;
  const unregister = window.QLPKRealtimePageHooks.register({types:['appointment.changed','document.changed'], batch:true, debounceMs:1, handler: events => batch = events});
  for (const type of ['appointment.changed','document.changed']) {
    const event = {type, payload:{appointment_id:1}};
    window.dispatchEvent(new CustomEvent('qlpk:realtime:event', {detail:event}));
    document.dispatchEvent(new CustomEvent('qlpk:realtime:event', {detail:event}));
  }
  await delay(); assert.deepEqual(Array.from(batch, e => e.type), ['appointment.changed','document.changed']); unregister();

  document.getElementById = () => null;
  vm.runInNewContext(source('components/examination-waiting-list-ui.js'), context);
  let rows = [], urls = [];
  const ui = window.ClinicalExaminationWaitingListUi;
  const adapter = ui.createWaitingListAdapter({document, statuses:['doctor_queue'], loadAllPages:true, preserveServerOrder:true,
    apiCall: async url => {urls.push(url); return urls.length === 1 ? response([2,9],2) : response([1]);}, setAppointments: value => rows = value});
  await adapter.loadAppointments();
  assert.deepEqual(Array.from(rows, a => a.id), [2,9,1]); assert.equal(urls.length, 2);
  let resolveOld, calls = 0;
  const racing = ui.createWaitingListAdapter({document, statuses:['doctor_queue'], preserveServerOrder:true,
    apiCall: () => ++calls === 1 ? new Promise(resolve => resolveOld = resolve) : Promise.resolve(response([7])), setAppointments: value => rows = value});
  const oldRequest = racing.loadAppointments(); await racing.loadAppointments(); resolveOld(response([99]));
  assert.equal((await oldRequest).status, 'stale'); assert.equal(rows[0].id, 7);
  const failing = ui.createWaitingListAdapter({document, statuses:['doctor_queue'], apiCall: async () => ({ok:false}), setAppointments: value => rows = value});
  assert.equal((await failing.loadAppointments()).status, 'error'); assert.equal(rows[0].id, 7);
  console.log('doctor realtime: reconnect, fresh auth, dedup, batch, pagination, ordering, stale/error guards OK');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
