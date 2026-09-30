const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush, Event } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/doctor-busy-schedule.html', 'utf8');
const BODY = template.slice(template.indexOf('<body'), template.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '');

async function setup() {
    const page = await loadPage('doctor-busy-schedule.js', { html: BODY, before(window) {
        window.QLPKApiTransport = { hasSession: () => true };
        window.QLPKUserFeedback = { show() {} };
        window.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {} }), getInstance: () => ({ hide() {} }) } };
    } });
    page.requests.find(request => request.url === '/check/me').respond(200, { id: 3, full_name: 'BS', role: 'doctor' });
    await flush();
    await new Promise(resolve => setTimeout(resolve, 520));
    return page;
}

for (const reason of ['<img src=x onerror="window.qaInjected=true">', '<svg onload=alert(1)>', 'Hội họp & nghỉ "riêng"']) {
    test(`all busy reason renderers display text safely: ${reason}`, async () => {
        const page = await setup();
        const $ = selector => page.document.querySelector(selector);
        const schedule = { id: 7, reason, status: 'active', start_datetime: '2030-10-01T08:00:00', end_datetime: '2030-10-01T10:00:00', created_at: '2026-09-28T08:00:00' };
        page.requests.find(request => request.url.startsWith('/api/doctor-busy-schedules/my-busy-schedules')).respond(200, { success: true, data: [schedule] });
        await flush();
        $('input[name="reason"]').dispatchEvent(new Event('focus', { bubbles: false }));
        page.requests.find(request => request.url.endsWith('/busy-reasons')).respond(200, { success: true, reasons: [reason] });
        await flush();
        $('#busySchedulesTableBody [data-busy-action="delete"]').click();
        const views = [$('#reasonSuggestionsContainer .suggestion-badge'), $('#busySchedulesTableBody .reason-badge'), $('#deleteConfirmModal .alert-warning')];
        for (const view of views) {
            assert.ok(view.textContent.includes(reason));
            assert.equal(view.querySelector('img, svg'), null);
        }
        $('#reasonSuggestionsContainer .suggestion-badge').click();
        assert.equal($('input[name="reason"]').value, reason);
        assert.equal(schedule.reason, reason);
    });
}
