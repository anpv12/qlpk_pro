'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const handlers = new Map();
    const emitted = [];
    const dispatched = [];
    let reconnects = 0;
    let token = 'qa-token';
    const connections = [];
    const socket = {
        connected: true,
        on(name, handler) { handlers.set(name, handler); },
        emit(name, payload) { emitted.push({ name, payload }); },
        connect() { reconnects += 1; },
        disconnect() { handlers.get('disconnect')('io client disconnect'); }
    };
    const document = { readyState: 'complete', querySelectorAll: () => [], dispatchEvent() {} };
    const window = {
        location: { pathname: '/doctor-examination.html', origin: 'http://qa.invalid', search: '' },
        io(options) {
            if (!connections.length) {
                connections.push({ socket, handlers, options });
                return socket;
            }
            const listeners = new Map();
            const connection = {
                connected: true,
                on(name, handler) { listeners.set(name, handler); },
                emit(name, payload) { emitted.push({ name, payload }); },
                connect() { reconnects += 1; },
                disconnect() { this.connected = false; listeners.get('disconnect')('io client disconnect'); }
            };
            connections.push({ socket: connection, handlers: listeners, options });
            return connection;
        },
        dispatchEvent(event) { dispatched.push(event.detail); },
        document
    };
    window.self = window;
    window.top = window;
    const context = vm.createContext({ window, document, URL, URLSearchParams,
        localStorage: { getItem: () => token },
        CustomEvent: class { constructor(name, options) { this.detail = options.detail; } }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/static/js/realtime-client.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/static/js/shared/browser-session.js'), 'utf8'), context);
    const owner = window.QLPKBrowserSession.create({ fetch: async () => { throw new Error('Unexpected fetch'); },
        origin: 'http://qa.invalid', baseURI: 'http://qa.invalid/' });
    return { handlers, emitted, dispatched, window, owner, connections,
        get reconnects() { return reconnects; }, clearToken() { token = ''; } };
}

function authenticate(owner, userId = 7) {
    owner.replace({ token_type: 'cookie', session_id: String(userId).repeat(32), csrf_token: 'a'.repeat(64),
        user: { id: userId, username: 'qa', role: 'doctor', permissions: [] } }, owner.snapshot().revision);
}

test('server permission revocation reconnects once and resyncs after authorized subscription', () => {
    const current = harness();
    current.handlers.get('disconnect')('io server disconnect');
    assert.equal(current.reconnects, 1);
    current.handlers.get('connect')();
    assert.equal(current.emitted[0].name, 'qlpk:subscribe');
    assert.equal(current.dispatched.length, 0);
    current.handlers.get('qlpk:subscribed')({ rooms: ['page:doctor-examination'] });
    assert.equal(current.dispatched[0].type, 'realtime.resynced');
});

test('network disconnect remains owned by Socket.IO built-in reconnect', () => {
    const current = harness();
    current.handlers.get('disconnect')('transport close');
    assert.equal(current.reconnects, 0);
});

test('logout and explicit stop never reconnect the old session', () => {
    const current = harness();
    current.clearToken();
    current.handlers.get('disconnect')('io server disconnect');
    current.window.QLPKRealtimeClient.stop();
    current.handlers.get('disconnect')('io server disconnect');
    assert.equal(current.reconnects, 0);
});

test('rejected reauthentication reports error without starting a retry loop', () => {
    const current = harness();
    current.handlers.get('disconnect')('io server disconnect');
    current.handlers.get('connect_error')();
    assert.equal(current.reconnects, 1);
    assert.equal(current.dispatched[0].type, 'realtime.connection_error');
});

test('cookie binding never falls back to an existing storage token', () => {
    const current = harness();
    current.window.QLPKRealtimeClient.bindSession(current.owner);
    assert.equal(current.window.QLPKRealtimeClient.socket, null);
    assert.equal(current.connections.length, 1);
    authenticate(current.owner);
    const connection = current.connections[1];
    connection.options.auth(payload => {
        assert.deepEqual(Object.keys(payload), ['csrf_token']);
        assert.equal(payload.csrf_token, 'a'.repeat(64));
    });
    connection.handlers.get('connect')();
    connection.handlers.get('qlpk:subscribed')();
    assert.equal(current.dispatched[0].type, 'realtime.resynced');
});

test('session invalidation disconnects immediately and drops every late callback', () => {
    const current = harness();
    authenticate(current.owner);
    current.window.QLPKRealtimeClient.bindSession(current.owner);
    const old = current.connections[1];
    old.handlers.get('connect')();
    current.owner.invalidate('changed');
    assert.equal(old.socket.connected, false);
    authenticate(current.owner, 8);
    const active = current.connections[2];
    old.handlers.get('connect')();
    old.handlers.get('qlpk:subscribed')();
    old.handlers.get('qlpk:event')({ type: 'old.patient', event_id: 'same-id' });
    old.handlers.get('connect_error')();
    old.handlers.get('disconnect')('io server disconnect');
    old.options.auth(payload => assert.equal(Object.keys(payload).length, 0));
    assert.equal(current.reconnects, 0);
    assert.equal(current.dispatched.length, 0);
    active.handlers.get('qlpk:event')({ type: 'new.patient', event_id: 'same-id' });
    assert.equal(current.dispatched[0].type, 'new.patient');
});

test('explicit stop stays stopped across cookie identity updates until start', () => {
    const current = harness();
    authenticate(current.owner);
    current.window.QLPKRealtimeClient.bindSession(current.owner);
    current.window.QLPKRealtimeClient.stop();
    authenticate(current.owner, 8);
    assert.equal(current.connections.length, 2);
    assert.equal(current.window.QLPKRealtimeClient.socket, null);
    current.window.QLPKRealtimeClient.start();
    assert.equal(current.connections.length, 3);
});

test('rebinding removes the old owner listener and ignores its later changes', () => {
    const current = harness();
    const other = harness().owner;
    authenticate(current.owner);
    authenticate(other, 8);
    current.window.QLPKRealtimeClient.bindSession(current.owner);
    current.window.QLPKRealtimeClient.bindSession(other);
    const active = current.window.QLPKRealtimeClient.socket;
    current.owner.invalidate('changed');
    assert.equal(current.window.QLPKRealtimeClient.socket, active);
    assert.equal(active.connected, true);
});

test('legacy socket drops events after the stored account token disappears', () => {
    const current = harness();
    current.clearToken();
    current.handlers.get('qlpk:event')({ type: 'stale.patient' });
    current.handlers.get('connect_error')();
    current.handlers.get('connect')();
    current.handlers.get('qlpk:subscribed')();
    assert.equal(current.dispatched.length, 0);
    assert.equal(current.emitted.length, 0);
});
