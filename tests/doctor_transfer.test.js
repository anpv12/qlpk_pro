'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runScriptFile } = require('./helpers/module-source');

function harness() {
  const nodes = new Map(), requests = [], messages = [];
  const document = {};
  function $(selector) {
    if (selector === document) return {ready() {}};
    if (nodes.has(selector)) return nodes.get(selector);
    const node = {length:1, handlers:new Map(), attrs:{}, content:'',
      attr(key,value) {this.attrs[key]=value;return this;},
      prop(key,value) {this.attrs[key]=value;return this;},
      text(value) {this.content=value;return this;}, html(value) {this.content=value;return this;},
      removeClass() {return this;}, addClass() {return this;}, show() {return this;}, closest() {return this;},
      off(event) {this.handlers.delete(event);return this;},
      on(event, ...args) {this.handlers.set(event,args.at(-1));return this;},
      one(event,handler) {this.handlers.set(event,handler);return this;},
      modal(action) {
        if (action==='hide') {
          let prevented=false;
          this.handlers.get('hide.bs.modal.transfer')?.({preventDefault:()=>prevented=true});
          if (!prevented) this.handlers.get('hidden.bs.modal.transfer')?.();
        }
        return this;
      }
    };
    nodes.set(selector,node);return node;
  }
  $.ajax = options => {
    let resolve, reject;
    const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
    requests.push({options, resolve(value) {options.success?.(value);resolve(value);},
      reject() {const error={status:500};options.error?.(error);reject(error);}});
    return promise;
  };
  let credential = 'qa';
  const window = {QLPKUserFeedback:{show:(...args)=>messages.push(args)}, QLPKApiTransport: {
    installJQuery() {}, getAuthHeader: () => credential, session: null
  }};
  runScriptFile(path.join(__dirname,'../app/static/js/transfer-modal-dry.js'),
    vm.createContext({window,document,$,localStorage:{getItem:()=>''},console:{error() {},warn() {}},setTimeout}));
  return {modal:window.TransferModal,$,requests,messages, window, changeSession() { credential = 'changed'; }};
}

async function main() {
  let h=harness(), saved=0;
  h.modal.open([1149],'doctor',null,{beforeTransfer:async()=>{saved++;return false;}});
  assert.equal(saved,0,'opening/canceling must not save');
  await h.modal.transfer([1149],'psychologist',8);
  assert.equal(saved,1);assert.equal(h.requests.length,0,'failed save must prevent transfer POST');

  h=harness();let finishSave, callback=0;
  h.modal.open([1149],'doctor',()=>callback++,{beforeTransfer:()=>new Promise(resolve=>finishSave=resolve)});
  const first=h.modal.transfer([1149],'psychologist',8);
  await h.modal.transfer([1149],'psychologist',8);
  assert.equal(h.requests.length,0,'wait for save and reject duplicate clicks');
  h.$('#transferModal').modal('hide');
  finishSave(true);await new Promise(setImmediate);
  assert.equal(h.requests.length,1,'in-flight save keeps modal open');
  assert.deepEqual(JSON.parse(h.requests[0].options.data),{appointment_ids:[1149],to_role:'PSYCHOLOGIST',to_person_id:8});
  h.requests[0].resolve({success:true,updated_count:1});await first;
  assert.equal(callback,1,'callback survives synchronous hidden/reset');

  h=harness();let current=true;
  h.modal.open([1149],'doctor',null,{isCurrent:()=>current,beforeTransfer:async()=>{current=false;return true;}});
  await h.modal.transfer([1149],'doctor',7);
  assert.equal(h.requests.length,0,'patient changed while saving must prevent transfer');

  h=harness();h.modal.open([1],'doctor');
  h.modal.loadPersonList('doctor');h.modal.loadPersonList('psychologist');
  h.requests[1].resolve([{id:8,full_name:'Tâm lý gia'}]);
  h.requests[0].resolve([{id:7,full_name:'Bác sĩ cũ'}]);
  assert.match(h.$('#personSelector').content,/Tâm lý gia/);
  assert.doesNotMatch(h.$('#personSelector').content,/Bác sĩ cũ/,'late recipient response must not replace selected role');
  h.modal.loadPersonList('doctor');h.$('#transferModal').modal('hide');
  h.modal.open([2],'doctor');
  h.requests[2].resolve([{id:7,full_name:'Người nhận lượt cũ'}]);
  assert.doesNotMatch(h.$('#personSelector').content,/Người nhận lượt cũ/);

  h=harness();h.modal.open([1],'receptionist',()=>callback++);
  const legacy=h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,1,'existing callers need no pre-transfer hook');
  h.requests[0].resolve({success:true,updated_count:1});await legacy;
  assert.equal(callback,2);

  h=harness();h.modal.open([1],'doctor',()=>assert.fail('failed transfer must not clear workspace'));
  const failed=h.modal.transfer([1],'psychologist',8);
  h.requests[0].reject();await failed;
  assert.equal(h.messages.length,1,'one error message per failed request');
  assert.equal(h.$('#transferModal').attrs['aria-busy'],'false','failure releases controls for retry');
  const retry=h.modal.transfer([1],'psychologist',8);
  assert.equal(h.requests.length,2);h.requests[1].reject();await retry;

  for (const change of ['patient', 'session']) {
    h=harness();let current=true;
    h.modal.open([1],'doctor',()=>assert.fail('stale transfer callback'),{isCurrent:()=>current});
    const pending=h.modal.transfer([1],'psychologist',8);
    if(change==='patient') current=false;else h.changeSession();
    h.requests[0].resolve({success:true,updated_count:1});await pending;
    assert.equal(h.messages.length,0,'stale result must not toast or reset new workspace');
  }
  h=harness();h.modal.open([1],'doctor');h.changeSession();
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0,'modal captured old credentials must not write with new session');

  for(const result of [{success:false,updated_count:1},{success:true,updated_count:0},{success:true},null]) {
    h=harness();h.modal.open([1],'doctor',()=>assert.fail('unconfirmed transfer callback'));
    const pending=h.modal.transfer([1],'psychologist',8);
    h.requests[0].resolve(result);await pending;
    assert.equal(h.messages[0][0],result?.success===true && result.updated_count===0 ? 'warning':'error');
  }
  h=harness();let revision=1;
  h.window.QLPKApiTransport.session={owner:{snapshot:()=>({status:'authenticated',revision})}};
  h.modal.open([1],'doctor');revision++;
  h.modal.loadPersonList('doctor');
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0,'cookie revision switch blocks both recipient loads and writes');
  h=harness();h.window.QLPKApiTransport.session={owner:{snapshot:()=>({status:'anonymous',revision:1})}};
  h.modal.open([1],'doctor');
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0);
  assert.equal(h.messages[0][0],'error');
  console.log('Doctor transfer: cancel/save failure, save-before-POST, duplicate/close guard, stale patient/recipients, success cleanup, legacy callers OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
