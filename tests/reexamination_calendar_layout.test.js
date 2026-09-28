'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('app/static/js/doctor-examination/re-examination-calendar.js', 'utf8');
const css = fs.readFileSync('app/static/css/components/re-examination-calendar.css', 'utf8');
const shared = fs.readFileSync('app/static/js/components/appointment-calendar.js', 'utf8');

test('empty months show only the calendar while retaining loading and error feedback', () => {
    assert.doesNotMatch(source, /Không có lịch hẹn trong khoảng đang xem/);
    assert.match(source, /Đang tải lịch/);
    assert.match(source, /Chưa tải được lịch hẹn/);
});

test('doctor scheduling exposes one monthly calendar without a duplicate date picker', () => {
    assert.match(shared, /initialView: 'dayGridMonth'/);
    assert.match(source, /monthOnly: true/);
    assert.doesNotMatch(source, /dayGridWeek|flatpickr|data-reexam="mini"/);
    assert.match(shared, /dayMaxEvents: true/);
    assert.match(shared, /fixedWeekCount: false/);
});

test('calendar resizes when async notices change available height and disconnects on close', () => {
    assert.match(source, /new ResizeObserver\(\(\) => calendar\?\.updateSize\(\)\)/);
    assert.match(source, /resizeObserver\.observe\(el\('calendar'\)\)/);
    assert.match(source, /resizeObserver\?\.disconnect\(\)/);
});

test('daily overflow list stays separate and appointment clicks cannot open details', () => {
    assert.match(source, /<dialog class="doctor-reexam-calendar__detail"/);
    assert.match(source, /el\('detail'\)\.showModal\(\)/);
    assert.match(source, /el\('detail'\)\.addEventListener\('cancel', event => event\.stopPropagation\(\)\)/);
    assert.match(source, /row\.textContent = /);
    assert.doesNotMatch(source, /showEventDetail|eventClick\(|Chi tiết lịch hẹn/);
});

test('layout fits available space rather than hiding scroll on calendar children', () => {
    assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\)/);
    assert.match(css, /\[data-reexam="calendar"\] \{ flex: 1; min-height: 0;/);
    assert.doesNotMatch(css, /overflow-y:\s*(auto|scroll)|\.fc-scroller[^}]*overflow/);
    assert.doesNotMatch(css, /font-size:\s*\d|!important/);
});

test('dense days use a bounded paginated list instead of a clipped calendar popover', () => {
    assert.match(source, /moreLinkClick\(info\).*showDayEvents.*return false/);
    assert.match(source, /const pageSize = 4/);
    assert.match(source, /events\.slice\(page \* pageSize, \(page \+ 1\) \* pageSize\)/);
    assert.match(source, /target < 0 \|\| target \* pageSize >= events\.length/);
});

test('service and doctor use shared single autocomplete and canonical IDs', () => {
    assert.match(source, /require\('autocompleteField'\)/);
    assert.match(source, /multiple: false/);
    assert.match(source, /choiceFields\.service\.getSelected\(\)\[0\]/);
    assert.match(source, /choiceFields\.doctor\.getSelected\(\)\[0\]\.id/);
    assert.doesNotMatch(source, /<select|new Option/);
    const html = fs.readFileSync('app/templates/doctor-examination.html', 'utf8');
    assert.match(html, /render_autocomplete_field\('reexamService'/);
    assert.match(html, /render_autocomplete_field\('reexamDoctor'/);
});

test('editing display text invalidates selection and close clears pending dropdowns', () => {
    assert.match(source, /field\.clear\(\{ silent: false \}\)/);
    assert.match(source, /!hasChoices\(\)/);
    assert.match(source, /Object\.values\(choiceFields\)\.forEach\(field => field\.clear\(\)\)/);
    assert.match(source, /!item\.disabled && normalize\(item\.name\)\.includes\(normalize\(query\)\)/);
    assert.match(source, /data\?\.schedule\?\.editable !== false/);
});
