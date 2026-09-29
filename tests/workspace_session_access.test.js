const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function harness(cookie = true) {
    const data = new Map([
        ['qlpk_token', 'old-token'], ['qlpk_user', JSON.stringify({ id: 99, role: 'admin' })],
        ['qlpk_permissions', '["*"]'],
        ['qlpk_workspace_tabs', JSON.stringify({ version: 2, owners: {
            'user-id:7': [{ id: 'allowed', label: 'Allowed', href: '/allowed.html' }, { id: 'admin', label: 'Admin', href: '/admin.html' }],
            'user-id:99': [{ id: 'admin', label: 'Admin', href: '/admin.html' }]
        } })]
    ]);
    let current = { revision: 1, status: 'authenticated', session: { user: { id: 7, role: 'doctor', permissions: ['read'] } } };
    let leave;
    const window = {
        location: { href: 'https://clinic.test/index.html', origin: 'https://clinic.test', pathname: '/index.html', search: '' },
        QLPKNavigationConfig: { items: [{ label: 'Allowed', href: '/allowed.html', permission: 'read' }, { label: 'Admin', href: '/admin.html', permission: 'admin' }] },
        QLPKDoctorWorkspaceLeaveGuard: { requestLeave: () => new Promise(resolve => { leave = resolve; }) }
    };
    const panes = ['allowed', 'admin'].map(tabId => ({ dataset: { tabId }, classList: { contains: () => true } }));
    const document = { getElementById: id => id === 'qlpkWorkspaceFrameHost' ? { querySelectorAll: () => panes } : null,
        querySelector: () => null, title: 'QA' };
    if (cookie) window.QLPKApiTransport = { session: { owner: { snapshot: () => current } } };
    const context = vm.createContext({ window, document, URL, localStorage: {
        getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)
    } });
    runScriptFile('app/static/js/app-shell/workspace-tabs.js', context);
    return { shell: window.QLPKWorkspaceShell, data, window,
        change(status = 'authenticated', id = 8) { current = { revision: current.revision + 1, status, session: status === 'authenticated' ? { user: { id, role: 'doctor', permissions: [] } } : null }; },
        finishLeave: () => leave(true)
    };
}

test('cookie workspace uses RAM owner and permissions, never stale admin storage', () => {
    const state = harness();
    assert.deepEqual(Array.from(state.shell.getTabs(), tab => tab.id), ['allowed']);
    state.change('anonymous');
    assert.equal(state.shell.getTabs().length, 0);
});

test('openHref cannot bypass configured permissions', async () => {
    const state = harness();
    const before = state.data.get('qlpk_workspace_tabs');
    assert.equal(await state.shell.openHref('/admin.html'), false);
    assert.equal(state.data.get('qlpk_workspace_tabs'), before);
});

for (const cookie of [false, true]) {
    test(`${cookie ? 'cookie' : 'legacy'} queued tab open does not write under a new owner`, async () => {
        const state = harness(cookie);
        const before = state.data.get('qlpk_workspace_tabs');
        state.data.set('qlpk_workspace_active_tab', JSON.stringify({ version: 2, owners: { 'user-id:7': 'allowed', 'user-id:99': 'admin' } }));
        const pending = state.shell.openTab({ href: '/other.html', label: 'Other' });
        if (cookie) state.change();
        else state.data.set('qlpk_user', '{"id":100,"role":"doctor"}');
        state.finishLeave();
        assert.equal(await pending, false);
        assert.equal(state.data.get('qlpk_workspace_tabs'), before);
    });
}
