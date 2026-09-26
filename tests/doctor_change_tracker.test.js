'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSupportRuntime } = require('./helpers/doctor-registry');

const { createChangeTracker, createSectionChangeTracker } = loadSupportRuntime();
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

test('section tracker keeps one dirty set and one revision map per owner', () => {
    const state = { detailDirtySections: new Set(), detailRevisions: {} };
    const changes = createSectionChangeTracker(state, { revisionsKey: 'detailRevisions', dirtyKey: 'detailDirtySections' });
    assert.equal(changes.capture('a'), 0);
    changes.mark('a');
    changes.mark('a');
    changes.mark('b');
    assert.deepEqual([...state.detailDirtySections], ['a', 'b']);
    assert.deepEqual({ ...state.detailRevisions }, { a: 2, b: 1 });

    const saving = changes.capture('a');
    changes.mark('a');
    assert.equal(changes.settle('a', saving), false, 'a changed during save stays dirty');
    assert.equal(changes.settle('b', changes.capture('b')), true);
    assert.deepEqual([...state.detailDirtySections], ['a']);

    changes.reset();
    assert.equal(state.detailDirtySections.size, 0);
    assert.deepEqual(Object.keys(state.detailRevisions), []);
    assert.equal(Object.isFrozen(changes), true);
});
