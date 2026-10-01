'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

async function setup() {
    const env = require('./helpers/autocomplete-dom').createEnvironment();
    const {window, document, context, Element} = env;
    const nodes = {}, requests = [];
    const markup = require('./helpers/template-source').readTemplateSource('medicine-management.html');
    const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const get = id => ids.has(id) ? (nodes[id] ||= new Element()) : null;
    document.getElementById = get;
    const modal = {hide() {
        let prevented=false;
        get('medicinePricePanel').fire('hide.bs.modal', {preventDefault:()=>{prevented=true;}});
        if (!prevented) get('medicinePricePanel').classList.remove('show');
    }};
    Object.assign(window, {bootstrap:{Modal:{getOrCreateInstance:node=>(node===get('medicinePricePanel') ? {...modal, show(){node.classList.add('show');}} : modal)}}});
    document.querySelectorAll = () => [];
    Object.assign(context, {localStorage:{getItem:()=> 'QA'},
        fetch:(url, options)=>new Promise(resolve=>requests.push({url,options,resolve}))});
    const { MedicinePriceEditor } = await env.loadModule('medicines/price-editor.js');
    window.MedicinePriceEditor = MedicinePriceEditor;
    document.fire('DOMContentLoaded');
    const respond = async (index, data, status=200) => {
        requests[index].resolve({ok:status===200,status,json:async()=>data});
        await new Promise(resolve=>setImmediate(resolve));
    };
    const open = id => {window.MedicinePriceEditor.reset(); window.MedicinePriceEditor.setExisting({id,name:'Thuốc '+id}); get('medicinePriceOpen').fire('click');};
    const input = value => {get('medicinePriceNew').value=value; get('medicinePriceNew').fire('input');};
    return {window,get,requests,respond,open,input};
}
const snapshot = (price='2000.00', revision=null) => ({current_price:price,revision,history:[],next_before_id:null});

test('old/new/difference, zero price and one in-flight write with server revision', async()=>{
    const h = await setup(); h.open(1); await h.respond(0,snapshot());
    assert.equal(h.get('medicinePriceConfirm').disabled,true);
    assert.equal(h.get('medicinePriceFrom').textContent,'Khi xác nhận giá mới');
    h.input('2000'); assert.equal(h.get('medicinePriceConfirm').disabled,true);
    for(const value of ['-1','1.001','','NaN']) {h.input(value); assert.equal(h.get('medicinePriceConfirm').disabled,true);}
    h.input('3000'); assert.equal(h.get('medicinePriceDifference').textContent,'+1.000 đ');
    h.input('0'); assert.equal(h.get('medicinePriceDifference').textContent,'-2.000 đ');
    h.get('medicinePriceConfirm').fire('click'); h.get('medicinePriceConfirm').fire('click');
    assert.equal(h.requests.length,2);
    assert.deepEqual(JSON.parse(h.requests[1].options.body),{new_price:'0.00',expected_price:'2000.00',expected_revision:null});
    let prevented=false;
    h.get('medicinePricePanel').fire('hide.bs.modal',{preventDefault:()=>{prevented=true;}});
    assert.equal(prevented,true);
    await h.respond(1,{...snapshot('0.00',9),history:[{old_price:'2000.00',new_price:'0.00',difference:'-2000.00',
        effective_from:'2026-09-15T05:30:45+00:00',effective_to:null,changed_by:'Người cập nhật'}]});
    assert.match(h.get('medicinePriceFrom').textContent,/12:30:45/);
    assert.match(h.get('medicinePriceFrom').textContent,/15\/09\/2026/);
    assert.equal(h.get('medicinePriceTo').textContent,'Đang áp dụng');
    h.input('1000');
    assert.equal(h.get('medicinePriceFrom').textContent,'Khi xác nhận giá mới');
    assert.equal(h.get('medicine-unit_price').value,'0.00');
    assert.equal(h.get('medicinePriceHistory').open,true);
    h.get('medicinePriceCancel').fire('click');
    assert.equal(h.get('medicinePriceNew').disabled,true);
    assert.equal(h.get('medicineSaveButton').disabled,false);
});

test('switching medicines and closing ignore stale responses',async()=>{
    const h = await setup(); h.open(1); h.open(2);
    await h.respond(1,snapshot('4000.00',4));
    await h.respond(0,snapshot('1000.00',1));
    assert.equal(h.get('medicinePriceOld').textContent,'4.000 đ');
    assert.equal(h.get('medicinePriceMedicine').textContent,'Thuốc 2');
    h.input('5000'); h.get('medicinePriceConfirm').fire('click');
    assert.match(h.requests[2].url,/medicines\/2\/price/);
    assert.equal(JSON.parse(h.requests[2].options.body).expected_revision,4);
    await h.respond(2,snapshot('5000.00',5));
    h.open(3); h.get('medicinePriceCancel').fire('click'); await h.respond(3,snapshot('9000.00',9));
    assert.equal(h.window.MedicinePriceEditor.isOpen(),false);
    assert.equal(Boolean(h.get('medicinePricePanel').classList.contains('show')),false);
    assert.equal(h.get('medicinePriceConfirm').disabled,true);
});

test('new medicine stages price without a premature request',async()=>{
    const h = await setup(); h.get('medicine-name').value='Thuốc DAV vừa chọn';
    assert.equal(h.get('name'),null);
    await h.get('medicinePriceOpen').fire('click');
    assert.equal(h.get('medicinePriceMedicine').textContent,'Thuốc DAV vừa chọn');
    assert.equal(h.window.MedicinePriceEditor.isOpen(),true);
    assert.equal(h.get('medicineSaveButton').disabled,true);
    h.input('1234.50'); await h.get('medicinePriceConfirm').fire('click');
    assert.equal(h.requests.length,0);
    assert.equal(h.get('medicine-unit_price').value,'1234.50');
    assert.equal(h.window.MedicinePriceEditor.isOpen(),false);
    assert.equal(h.get('medicineSaveButton').disabled,false);
});

for (const failure of ['name lookup', 'overlay opening']) {
    test(`failed ${failure} releases the medicine save guard and allows retry`,async()=>{
        const h = await setup();
        h.get('medicine-unit_price').value='500';
        h.get('medicineFormError').classList.add('d-none');
        const modals=h.window.bootstrap.Modal, openModal=modals.getOrCreateInstance;
        if (failure === 'name lookup') {
            Object.defineProperty(h.get('medicine-name'),'value',{
                configurable:true,get(){throw new Error('internal detail');}
            });
        } else {
            modals.getOrCreateInstance=()=>{throw new Error('internal detail');};
        }
        await h.get('medicinePriceOpen').fire('click');
        assert.equal(h.window.MedicinePriceEditor.isOpen(),false);
        assert.equal(h.get('medicineSaveButton').disabled,false);
        assert.equal(h.get('medicinePriceConfirm').disabled,true);
        assert.equal(Boolean(h.get('medicinePricePanel').classList.contains('show')),false);
        assert.equal(Boolean(h.get('medicineFormError').classList.contains('d-none')),false);
        assert.match(h.get('medicineFormError').textContent,/Không mở được/);
        assert.doesNotMatch(h.get('medicineFormError').textContent,/internal detail/);
        assert.equal(h.get('medicine-unit_price').value,'500');
        assert.equal(h.requests.length,0);
        Object.defineProperty(h.get('medicine-name'),'value',{configurable:true,writable:true,value:'Thuốc mới'});
        modals.getOrCreateInstance=openModal;
        await h.get('medicinePriceOpen').fire('click');
        assert.equal(h.window.MedicinePriceEditor.isOpen(),true);
        h.input('750'); await h.get('medicinePriceConfirm').fire('click');
        assert.equal(h.get('medicine-unit_price').value,'750.00');
        assert.equal(h.window.MedicinePriceEditor.isOpen(),false);
        assert.equal(h.get('medicineSaveButton').disabled,false);
    });
}

test('stale-price rejection requires reload and hides technical errors',async()=>{
    const h = await setup(); h.open(1); await h.respond(0,snapshot());
    h.input('3000'); h.get('medicinePriceConfirm').fire('click');
    await h.respond(1,{error:'Giá đã được thay đổi.'},409);
    assert.equal(h.get('medicinePriceConfirm').disabled,true);
    assert.equal(h.get('medicine-unit_price').value,'2000.00');
    h.get('medicinePriceOpen').fire('click');
    await h.respond(2,{error:'SQL traceback'},500);
    assert.doesNotMatch(h.get('medicinePriceMessage').textContent,/SQL/);
});
