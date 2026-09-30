'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runScriptFile } = require('./helpers/module-source');
const {loadSupportRuntime} = require('./helpers/doctor-registry');
const {createChangeTracker, createSectionChangeTracker} = loadSupportRuntime();
const modules = new Map();
const window = {QLPKDoctorModuleRegistry:{register:(name, value)=>modules.set(name,value)}};
for (const file of ['clinical-detail-persistence.js','workspace-save-controller.js']) {
  runScriptFile(path.join(__dirname,'../app/static/js/doctor-examination',file), vm.createContext({window,console}));
}
const normal = 'Không ghi nhận bất thường';

async function main() {
  const definitions = modules.get('clinicalDetails').fields;
  const controls = new Map(definitions.map(field=>[field.controlId,{id:field.controlId,value:''}]));
  const state = {contextToken:1,appointment:{id:101},examinationId:201,detailsLoaded:false,detailsLoading:false,detailDirtySections:new Set(),detailRevisions:{},revision:0};
  const writes = [];
  let fail = false;
  const details = modules.get('clinicalDetails').create({state,
    detailChanges:createSectionChangeTracker(state,{revisionsKey:'detailRevisions',dirtyKey:'detailDirtySections'}),
    getElement:(_,id)=>controls.get(id),getValue:(_,id)=>controls.get(id).value.trim(),
    setValue:(_,id,value)=>{controls.get(id).value=value;},textOf:value=>String(value||''),hasValue:value=>value!=null,
    syncDirtyState:()=>{},parseResponseError:async()=> 'QA failure',
    apiCall:async(url,options)=>{
      if (!options) return {ok:true,json:async()=>({examination_id:201,sections:{}})};
      writes.push({url,body:JSON.parse(options.body)});return {ok:!fail};
    }
  });
  assert.equal(details.prepareEmptyDefaults({}),false);
  await details.load({},101,1);
  assert.ok([...controls.values()].every(el=>el.value===''), 'opening patient must not fill defaults');
  controls.get('examGeneralCirculation').value = 'Tim đều, tiếng tim rõ';
  controls.get('examMentalThought').value = 'Nội dung đã nhập';
  controls.get('examGeneralENT').value = '   \n ';
  assert.equal(details.prepareEmptyDefaults({}),true);
  assert.equal([...controls.values()].filter(el=>el.value===normal).length,13);
  assert.equal(controls.get('examGeneralCirculation').value,'Tim đều, tiếng tim rõ');
  assert.equal(controls.get('examMentalThought').value,'Nội dung đã nhập');
  for (const id of ['doctorClinicalReason','examDetailMedicalHistory','examDetailGeneralExamination','examGeneralPresentation']) assert.equal(controls.get(id).value,'');
  fail=true;
  await assert.rejects(details.save({},101,1),/QA failure/);
  assert.equal(state.detailDirtySections.size,2,'failed save keeps defaults dirty');
  fail=false;writes.length=0;
  await details.save({},101,1);
  assert.equal(writes.length,2);
  assert.equal(writes[0].body.circulation,'Tim đều, tiếng tim rõ');
  assert.equal(writes[1].body.orientation,normal);
  assert.equal(state.detailDirtySections.size,0);
  assert.equal(details.prepareEmptyDefaults({}),false,'repeat save must stay clean');
  controls.get('examMentalMemory').value='';state.detailsLoading=true;
  assert.equal(details.prepareEmptyDefaults({}),false,'never default while loading patient');

  let prepared=0;
  const controllerState={appointment:{id:101},contextToken:1};
  const controller=modules.get('workspaceSaveController').create({state:controllerState,
    mainChanges:createChangeTracker(controllerState,{revisionKey:'mainRevision',dirtyKey:'mainDirty'}),getDocument:()=>({}),
    textOf:String,valueOf:a=>a,apiCall:async()=>({ok:true}),isLoading:()=>false,
    getClinicalForm:()=>({prepareEmptyDetailDefaults:()=>prepared++,getSaveState:()=>({mainDirty:false,detailDirtySections:new Set(),detailsLoaded:true})})
  });
  await controller.saveNow({}); assert.equal(prepared,0,'background save must not default');
  await controller.saveNow({applyDetailDefaults:true}); assert.equal(prepared,1);
  controllerState.loadFailed=true;
  await assert.rejects(controller.saveNow({applyDetailDefaults:true})); assert.equal(prepared,1);
  console.log('doctor detail defaults: scope, blanks/whitespace, existing text, explicit save, load/error guards, clean retry OK');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
