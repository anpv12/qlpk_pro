'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');

function setup() {
    const source = readMedicineManagementSource();
    const requests = [], messages = [], changes = [];
    const values = {'#importedTypeValue':'false', '#prescriptionTypeValue':'BASIC', '#unitsPerBox':'30',
        '#packagingUnit':'hộp', '#saleUnitValue':'viên', '#saleUnit':'viên'};
    const $ = selector => ({0:{}, val:()=>values[selector] || '', data:()=>9,
        prop:(...args)=>changes.push([selector,...args]), removeClass(){return this;},
        text:value=>messages.push(value), focus(){}, modal:()=>changes.push(['closed'])});
    $.ajax = request => requests.push(request);
    const context = vm.createContext({$, FormData:class {entries(){return Object.entries({name:'Thuốc', unit:'viên', unit_price:'1000', stock_quantity:'999', import_price:'12', expiry_date:'2028-01-01'});}},
        localStorage:{getItem:()=> 'test'}, showCustomToast:(type,text)=>messages.push(text),
        loadMedicines:()=>changes.push(['reload']), window:{ClinicMedicineCatalog:{payload:()=>null},
            QLPKApiTransport:{hasSession:()=>true}}});
    const helper = source.slice(source.indexOf('function getUserFacingResponseMessage('), source.indexOf('function debounce('));
    vm.runInContext('let medicineSaving = false; let medicineEditRevision = 1;\n' + helper + source.slice(source.indexOf('function saveMedicine()'),source.indexOf('// Confirm delete')),context);
    return {context, requests, messages, changes, values};
}

test('ordinary save excludes price and stock/cost/expiry and blocks repeated submits', () => {
    const h = setup();
    h.context.saveMedicine(); h.context.saveMedicine();
    assert.equal(h.requests.length,1);
    const data = JSON.parse(h.requests[0].data);
    for (const field of ['unit_price','stock_quantity','import_price','expiry_date']) assert.equal(field in data,false);
    h.requests[0].error({status:500,responseJSON:{error:'SQLAlchemy traceback',user_message:'technical detail'}});
    h.requests[0].complete();
    assert.equal(h.messages.includes('SQLAlchemy traceback'),false);
    assert.equal(h.messages.at(-1),'Không lưu được thông tin thuốc. Hãy thử lại.');
    h.context.saveMedicine();
    assert.equal(h.requests.length,2);
});

test('a response for a previous form never closes or overwrites the current form', () => {
    const h = setup();
    h.context.saveMedicine();
    vm.runInContext('medicineEditRevision += 1',h.context);
    h.requests[0].success({});
    h.requests[0].error({status:400,responseJSON:{user_message:'Sai thông tin'}});
    h.requests[0].complete();
    assert.equal(h.messages.length,0);
    assert.equal(h.changes.some(change=>change[0]==='closed'),false);
});

test('typing over a prescription selection requires a valid choice again', () => {
    const h = setup(); h.values['#prescriptionTypeValue']='';
    h.context.saveMedicine();
    assert.equal(h.requests.length,0);
    assert.match(h.messages[0],/Loại đơn thuốc/);
});
