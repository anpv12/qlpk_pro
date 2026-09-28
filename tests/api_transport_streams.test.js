const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(cookie = false) {
    let controller;
    const cancellations = [];
    const source = new ReadableStream({
        type: 'bytes',
        start(value) { controller = value; },
        cancel(reason) { cancellations.push(reason); }
    });
    const storage = new Map([['qlpk_token', 'first']]);
    const window = {
        document: { baseURI: 'https://clinic.test/' },
        navigator: {},
        ReadableStream,
        location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: key => storage.get(key) },
        fetch: async () => new Response(source)
    };
    const context = vm.createContext({ window, document: { baseURI: window.location.href },
        Headers, URL, ReadableStream, AbortController });
    for (const name of ['api-transport', 'browser-session', 'browser-session-actions']) {
        vm.runInContext(fs.readFileSync(`app/static/js/shared/${name}.js`, 'utf8'), context);
    }
    let session;
    if (cookie) {
        session = window.QLPKApiTransport.useCookieSession();
        session.owner.replace({ token_type: 'cookie', session_id: 'a'.repeat(32), csrf_token: 'a'.repeat(64),
            user: { id: 7, username: 'qa', role: 'doctor', permissions: [] } }, 0);
    }
    return {
        window, source, cancellations,
        enqueue: value => controller.enqueue(new TextEncoder().encode(value)),
        close: () => controller.close(),
        change: () => cookie ? session.owner.invalidate('changed') : storage.set('qlpk_token', 'second')
    };
}

for (const cookie of [false, true]) {
    const mode = cookie ? 'cookie' : 'legacy';
    test(`${mode}: body and native Response consumption stay usable`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        assert.equal(response.body, response.body);
        assert.equal(response.bodyUsed, false);
        assert.equal(response.body.locked, false);
        const text = new Response(response.body).text();
        state.enqueue('clinical document');
        state.close();
        assert.equal(await text, 'clinical document');
        assert.equal(response.bodyUsed, true);
    });

    for (const byob of [false, true]) {
        test(`${mode}: pending ${byob ? 'BYOB' : 'default'} read rejects late account data`, async () => {
            const state = harness(cookie);
            const response = await state.window.fetch('/download');
            const reader = response.body.getReader(byob ? { mode: 'byob' } : undefined);
            const pending = byob ? reader.read(new Uint8Array(64)) : reader.read();
            state.change();
            const rejected = assert.rejects(pending, { code: 'session.changed' });
            state.enqueue('must not reach caller');
            await rejected;
            assert.equal(state.cancellations.length, 1);
            reader.releaseLock();
        });
    }

    test(`${mode}: a retained reader cannot read already buffered bytes after switch`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const reader = response.body.getReader();
        state.enqueue('private bytes');
        state.change();
        await assert.rejects(reader.read(), { code: 'session.changed' });
        assert.throws(() => response.body, { code: 'session.changed' });
        assert.throws(() => response.clone(), { code: 'session.changed' });
        reader.releaseLock();
    });

    test(`${mode}: Response constructed from guarded body rejects delayed data`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const text = new Response(response.body).text();
        await new Promise(resolve => setImmediate(resolve));
        state.change();
        const rejected = assert.rejects(text, { code: 'session.changed' });
        state.enqueue('late response');
        await rejected;
    });

    test(`${mode}: tee branches both reject buffered data after switch`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const branches = response.body.tee();
        state.enqueue('old');
        state.change();
        await Promise.all(branches.map(async branch => {
            const reader = branch.getReader();
            await assert.rejects(reader.read(), { code: 'session.changed' });
            reader.releaseLock();
        }));
    });

    test(`${mode}: async iterator preserves early cancel and late-read guard`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const iterator = response.body.values();
        const first = iterator.next();
        state.enqueue('one');
        assert.equal(new TextDecoder().decode((await first).value), 'one');
        state.change();
        await assert.rejects(iterator.next(), { code: 'session.changed' });
        assert.equal(state.source.locked, false);
    });

    test(`${mode}: pipeTo blocks late chunks and aborts destination`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const chunks = [];
        let abort;
        const piped = response.body.pipeTo(new WritableStream({
            write(chunk) { chunks.push(new TextDecoder().decode(chunk)); },
            abort(reason) { abort = reason; }
        }));
        await new Promise(resolve => setImmediate(resolve));
        state.change();
        const rejected = assert.rejects(piped, { code: 'session.changed' });
        state.enqueue('late');
        await rejected;
        assert.deepEqual(chunks, []);
        assert.equal(abort.code, 'session.changed');
        assert.equal(state.source.locked, false);
    });

    test(`${mode}: transformed streams guard subsequent consumption`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const transformed = response.body.pipeThrough(new TransformStream());
        const reader = transformed.getReader();
        const first = reader.read();
        state.enqueue('one');
        assert.equal(new TextDecoder().decode((await first).value), 'one');
        state.change();
        await assert.rejects(reader.read(), { code: 'session.changed' });
        reader.releaseLock();
    });

    test(`${mode}: BYOB reaches EOF and explicit cancel releases source`, async () => {
        const state = harness(cookie);
        const response = await state.window.fetch('/download');
        const reader = response.body.getReader({ mode: 'byob' });
        const pending = reader.read(new Uint8Array(10));
        state.close();
        assert.equal((await pending).done, true);
        reader.releaseLock();
        assert.equal(state.source.locked, false);
        const cancelState = harness(cookie);
        const cancelResponse = await cancelState.window.fetch('/download');
        await cancelResponse.body.cancel('user cancelled');
        assert.deepEqual(cancelState.cancellations, ['user cancelled']);
    });
}

test('HEAD/null body remains null', async () => {
    const window = { location: { origin: 'https://clinic.test', href: 'https://clinic.test/' },
        localStorage: { getItem: () => null }, fetch: async () => new Response(null, { status: 204 }) };
    vm.runInNewContext(fs.readFileSync('app/static/js/shared/api-transport.js', 'utf8'),
        { window, document: { baseURI: window.location.href }, Headers, URL });
    assert.equal((await window.fetch('/empty')).body, null);
});
