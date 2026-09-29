const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

function harness() {
    const html = new Map();
    const document = {};
    const context = vm.createContext({ document, window: { QLPKApiTransport: { installJQuery() {} } }, console, Date,
        $: target => ({
            ready() {}, on() {}, remove() {}, modal() {}, val() {}, ajaxSend() {}, ajaxError() {},
            html(value) { html.set(target, value); },
            append(value) { html.set(target, value); },
        }),
    });
    runScriptFile('app/static/js/utils.js', context);
    runScriptFile('app/static/js/doctor-busy-schedule.js', context);
    return { context, html };
}

for (const reason of ['<img src=x onerror="window.qaInjected=true">', '<svg onload=alert(1)>', 'Hội họp & nghỉ "riêng"']) {
    test(`all busy reason renderers display text safely: ${reason}`, () => {
        const { context, html } = harness();
        const schedule = { id: 7, reason, status: 'active', start_datetime: '2026-10-01T08:00:00',
            end_datetime: '2026-10-01T10:00:00', created_at: '2026-09-28T08:00:00' };
        context.displayReasonSuggestions([reason]);
        context.renderBusySchedulesTable([schedule]);
        context.confirmDeleteBusySchedule(7);
        for (const target of ['#reasonSuggestionsContainer', '#busySchedulesTableBody', 'body']) {
            const rendered = html.get(target);
            assert.ok(rendered.includes(context.window.QLPKSharedUtils.escapeHtml(reason)));
            assert.ok(!rendered.includes(reason));
            assert.doesNotMatch(rendered, /<(img|svg)\b/);
        }
        assert.equal(schedule.reason, reason);
    });
}
