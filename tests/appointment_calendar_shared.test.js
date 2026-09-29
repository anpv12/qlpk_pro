'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/js/components/appointment-calendar.js', 'utf8');

function setup() {
    const document = { createElement(tag) { return { tag, children: [], style: {}, appendChild(child) { this.children.push(child); } }; } };
    const window = { document, FullCalendar: { Calendar: function (host, options) { this.options = options; this.host = host; } } };
    vm.runInNewContext(source, { window });
    return { api: window.QLPKAppointmentCalendar, document };
}

test('both consumers instantiate the same calendar presentation with Monday start', () => {
    const { api } = setup();
    const host = { classList: { add() {} } };
    const doctor = api.create(host, {}, { monthOnly: true }).options;
    const appointments = api.create(host).options;
    assert.equal(doctor.firstDay, 1);
    assert.equal(doctor.headerToolbar.right, '');
    assert.equal(appointments.headerToolbar.right, 'timeGridWeek,dayGridMonth');
    assert.equal(doctor.headerToolbar.left, appointments.headerToolbar.left);
    assert.equal(doctor.fixedWeekCount, false);
    assert.equal(doctor.eventTimeFormat.hour12, false);
});

test('doctor color uses backend identity regardless of list ordering or numeric/string IDs', () => {
    const { api } = setup();
    assert.equal(api.resolveDoctorDotColor(24, [{ id: '24', calendar_color: '#ff5722' }]), '#ff5722');
    assert.equal(api.resolveDoctorDotColor(24, []), 'var(--qlpk-feedback-neutral)');
    const content = api.buildAppointmentEventContent({ timeText: '09:00', event: { title: '<img>', extendedProps: { doctorId: 24, doctorName: 'Bác sĩ', doctorColor: '#ff5722' } } });
    const children = content.domNodes[0].children;
    assert.equal(children[0].style.backgroundColor, '#ff5722');
    assert.equal(children[2].textContent, '<img>');
});

test('shared lifecycle preserves workflow callbacks and standardizes toolbar', () => {
    const { api } = setup();
    let calls = 0;
    const title = {}, button = { dataset: {}, classList: { remove() {} } };
    const host = { classList: { add() {} }, querySelector: () => title, querySelectorAll: () => [button] };
    const calendar = api.create(host, { datesSet() { calls++; }, dateClick() { return 'selection'; } });
    calendar.options.datesSet({ view: { currentStart: new Date(2026, 9, 1) } });
    assert.equal(title.textContent, 'Tháng 10, 2026');
    assert.equal(button.dataset.qlpkButton, 'neutral');
    assert.equal(calls, 1);
    assert.equal(calendar.options.dateClick(), 'selection');
});

test('both templates load one shared stylesheet and retire the old event renderer', () => {
    for (const name of ['doctor-examination', 'appointment-management']) {
        const html = fs.readFileSync(`app/templates/${name}.html`, 'utf8');
        assert.match(html, /components\/appointment-calendar\.css\?v=/);
        assert.doesNotMatch(html, /calendar-event-content-utils/);
    }
    assert.equal(fs.existsSync('app/static/js/appointment-management/calendar-event-content-utils.js'), false);
    const doctor = fs.readFileSync('app/static/js/doctor-examination/re-examination-calendar.js', 'utf8');
    const appointments = ['appointment-management.js', ...fs.readdirSync('app/static/js/appointment-management').filter(name => name.startsWith('page-') && !name.endsWith('-utils.js')).map(name => `appointment-management/${name}`)]
        .map(file => fs.readFileSync(`app/static/js/${file}`, 'utf8')).join('\n');
    assert.doesNotMatch(doctor, /new window.FullCalendar.Calendar|backgroundColor: statuses/);
    assert.doesNotMatch(appointments, /new FullCalendar.Calendar/);
});
