'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { readTemplateSource } = require('./helpers/template-source');
const { installDom, Event } = require('./helpers/fake-dom');
const { freshGraph } = require('./helpers/fresh-esm');

// Real module on the fake DOM with the page partial; show() does not fire shown.bs.modal, so no preselect request.
async function harness() {
  const window = installDom({ html: readTemplateSource('partials/transfer-modal.html').replace(/\{#[\s\S]*?#\}/g, '') });
  const requests = [], messages = [];
  const modals = new Map();
  window.bootstrap = { Modal: {
    getInstance: node => modals.get(node) || null,
    getOrCreateInstance: node => {
      if (!modals.has(node)) modals.set(node, { show() {}, hide() {
        const hide = new Event('hide.bs.modal');
        node.dispatchEvent(hide);
        if (!hide.defaultPrevented) node.dispatchEvent(new Event('hidden.bs.modal'));
      } });
      return modals.get(node);
    } } };
  window.fetch = (url, init = {}) => new Promise((resolve, reject) => requests.push({ url, options: { ...init, data: init.body },
    resolve: value => resolve(new Response(JSON.stringify(value), { status: 200 })),
    reject: () => resolve(new Response('{}', { status: 500 })) }));
  let credential = 'qa';
  window.QLPKUserFeedback = { show: (...args) => messages.push(args) };
  window.QLPKApiTransport = { getAuthHeader: () => credential, session: null };
  globalThis.console = { ...console, error() {}, warn() {} };
  const { TransferModal } = await freshGraph()('transfer-modal-dry.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const modalNode = document.getElementById('transferModal');
  const $ = selector => {
    const node = document.querySelector(selector);
    return { get content() { return node.textContent; }, attrs: new Proxy({}, { get: (_, key) => node.getAttribute(key) }),
      modal: action => { if (action === 'hide') window.bootstrap.Modal.getOrCreateInstance(modalNode).hide(); } };
  };
  return { modal: TransferModal, $, requests, messages, window, changeSession() { credential = 'changed'; } };
}

async function main() {
  let h=await harness(), saved=0;
  h.modal.open([1149],'doctor',null,{beforeTransfer:async()=>{saved++;return false;}});
  assert.equal(saved,0,'opening/canceling must not save');
  await h.modal.transfer([1149],'psychologist',8);
  assert.equal(saved,1);assert.equal(h.requests.length,0,'failed save must prevent transfer POST');

  h=await harness();let finishSave, callback=0;
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

  h=await harness();let current=true;
  h.modal.open([1149],'doctor',null,{isCurrent:()=>current,beforeTransfer:async()=>{current=false;return true;}});
  await h.modal.transfer([1149],'doctor',7);
  assert.equal(h.requests.length,0,'patient changed while saving must prevent transfer');

  h=await harness();h.modal.open([1],'doctor');
  h.modal.loadPersonList('doctor');h.modal.loadPersonList('psychologist');
  h.requests[1].resolve([{id:8,full_name:'Tâm lý gia'}]);
  h.requests[0].resolve([{id:7,full_name:'Bác sĩ cũ'}]);await new Promise(setImmediate);
  assert.match(h.$('#personSelector').content,/Tâm lý gia/);
  assert.doesNotMatch(h.$('#personSelector').content,/Bác sĩ cũ/,'late recipient response must not replace selected role');
  h.modal.loadPersonList('doctor');h.$('#transferModal').modal('hide');
  h.modal.open([2],'doctor');
  h.requests[2].resolve([{id:7,full_name:'Người nhận lượt cũ'}]);await new Promise(setImmediate);
  assert.doesNotMatch(h.$('#personSelector').content,/Người nhận lượt cũ/);

  h=await harness();h.modal.open([1],'receptionist',()=>callback++);
  const legacy=h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,1,'existing callers need no pre-transfer hook');
  h.requests[0].resolve({success:true,updated_count:1});await legacy;
  assert.equal(callback,2);

  h=await harness();h.modal.open([1],'doctor',()=>assert.fail('failed transfer must not clear workspace'));
  const failed=h.modal.transfer([1],'psychologist',8);
  h.requests[0].reject();await failed;
  assert.equal(h.messages.length,1,'one error message per failed request');
  assert.equal(h.$('#transferModal').attrs['aria-busy'],'false','failure releases controls for retry');
  const retry=h.modal.transfer([1],'psychologist',8);
  assert.equal(h.requests.length,2);h.requests[1].reject();await retry;

  for (const change of ['patient', 'session']) {
    h=await harness();let current=true;
    h.modal.open([1],'doctor',()=>assert.fail('stale transfer callback'),{isCurrent:()=>current});
    const pending=h.modal.transfer([1],'psychologist',8);
    if(change==='patient') current=false;else h.changeSession();
    h.requests[0].resolve({success:true,updated_count:1});await pending;
    assert.equal(h.messages.length,0,'stale result must not toast or reset new workspace');
  }
  h=await harness();h.modal.open([1],'doctor');h.changeSession();
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0,'modal captured old credentials must not write with new session');

  for(const result of [{success:false,updated_count:1},{success:true,updated_count:0},{success:true},null]) {
    h=await harness();h.modal.open([1],'doctor',()=>assert.fail('unconfirmed transfer callback'));
    const pending=h.modal.transfer([1],'psychologist',8);
    h.requests[0].resolve(result);await pending;
    assert.equal(h.messages[0][0],result?.success===true && result.updated_count===0 ? 'warning':'error');
  }
  h=await harness();let revision=1;
  h.window.QLPKApiTransport.session={owner:{snapshot:()=>({status:'authenticated',revision})}};
  h.modal.open([1],'doctor');revision++;
  h.modal.loadPersonList('doctor');
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0,'cookie revision switch blocks both recipient loads and writes');
  h=await harness();h.window.QLPKApiTransport.session={owner:{snapshot:()=>({status:'anonymous',revision:1})}};
  h.modal.open([1],'doctor');
  await h.modal.transfer([1],'doctor',7);
  assert.equal(h.requests.length,0);
  assert.equal(h.messages[0][0],'error');
  console.log('Doctor transfer: cancel/save failure, save-before-POST, duplicate/close guard, stale patient/recipients, success cleanup, legacy callers OK');
}
main().catch(error=>{process.stderr.write(String(error && error.stack || error) + "\n");process.exitCode=1;});
