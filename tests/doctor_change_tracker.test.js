'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSupportRuntime } = require('./helpers/doctor-registry');

const { createChangeTracker } = loadSupportRuntime();
const setup = () => {
    const state = { rowsRevision: 0, rowsDirty: false };
    return { state, changes: createChangeTracker(state, { revisionKey: 'rowsRevision', dirtyKey: 'rowsDirty' }) };
};

test('mark, reset and restore keep the owner state fields as source of truth', () => {
    const { state, changes } = setup();
    changes.mark();
    changes.mark();
    assert.deepEqual({ ...state }, { rowsRevision: 2, rowsDirty: true });
    changes.reset();
    assert.deepEqual({ ...state }, { rowsRevision: 0, rowsDirty: false });
    changes.restore(false);
    assert.deepEqual({ ...state }, { rowsRevision: 0, rowsDirty: false });
    changes.restore(true);
    assert.deepEqual({ ...state }, { rowsRevision: 1, rowsDirty: true });
});

test('settle clears dirty only when nothing changed during save', () => {
    const { state, changes } = setup();
    changes.mark();
    const saving = changes.capture();
    assert.equal(changes.changedSince(saving), false);
    assert.equal(changes.settle(saving), true);
    assert.equal(state.rowsDirty, false);

    changes.mark();
    const racing = changes.capture();
    changes.mark();
    assert.equal(changes.changedSince(racing), true);
    assert.equal(changes.settle(racing), false);
    assert.deepEqual({ ...state }, { rowsRevision: 3, rowsDirty: true });
});

test('tracker is a frozen stateless view over the given state', () => {
    const { state, changes } = setup();
    assert.equal(Object.isFrozen(changes), true);
    state.rowsDirty = true;
    state.rowsRevision = 7;
    assert.equal(changes.capture(), 7);
    assert.equal(changes.settle(7), true);
    assert.equal(state.rowsDirty, false);
});
