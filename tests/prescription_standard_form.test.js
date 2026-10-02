const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');
const context = vm.createContext({window:{}, document:{}, console});
runScriptFile('app/static/js/prescriptions/shared/prescription-type-contract.js', (c => vm.isContext(c) ? c : vm.createContext(c))(context));
runScriptFile('app/static/js/prescriptions/shared/prescription-document-template.js', context);
runScriptFile('app/static/js/prescriptions/components/prescription-print-document.js', (c => vm.isContext(c) ? c : vm.createContext(c))(context));
const render = (type, overrides={}) => context.buildPrescriptionPreviewHTML({
  patient:{full_name:'QA <patient>',date_of_birth:'2020-09-10',gender:'Nữ'},
  history:{examination_date:'2026-09-09',doctor:{full_name:'QA Doctor'}},
  examinationDetail:{weight:18,diagnosis:'QA diagnosis'}, relatives:[{name:'QA Companion',id_number:'COMPANION-ID'}],
  prescriptionData:{prescription_type:type,medicines:[{name:'QA medicine',unit:'viên',quantity:5,route:'Uống',usage:'Theo hướng dẫn đã lưu'}]},
  ...overrides,
});
for (const type of ['BASIC','H','N']) {
  const html=render(type);
  assert.ok(html.includes('QA &lt;patient&gt;'));
  assert.ok(html.includes('71 tháng tuổi'));
  assert.ok(html.includes('QA Companion'));
  assert.ok(html.includes('05 viên'));
  assert.ok(html.includes('Theo hướng dẫn đã lưu'));
  assert.ok(!html.includes('1 lần/ngày'));
  assert.ok(!html.includes('COMPANION-ID'), 'A companion is not necessarily the medicine recipient');
  assert.equal(html.includes('của người nhận thuốc'),type!=='BASIC');
  assert.equal((html.match(/Đợt [123]:/g)||[]).length,type==='N'?3:0);
  assert.equal(html.includes('Đợt.......(từ ngày...../...../20.... đến hết ngày ...../...../ 20....)'),type==='H');
  assert.equal(html.includes('(năm)'),type==='N');
  assert.ok(!html.includes('PRESCRIPTION'));
}
for (const dob of ['2020-09-09','2000-01-01',null]) {
  const html=render('H',{patient:{date_of_birth:dob}});
  assert.ok(!html.includes('QA Companion'));
  assert.ok(!html.includes('tháng tuổi'));
  assert.ok(html.includes('của người nhận thuốc'));
}
for (const [amount,words] of [[1,'một'],[15,'mười lăm'],[21,'hai mươi mốt'],[105,'một trăm lẻ năm'],[1005,'một nghìn không trăm lẻ năm'],[1000001,'một triệu không trăm lẻ một'],[1.5,'một phẩy năm']]) {
  assert.equal(context.prescriptionQuantityWords(amount),words);
}
assert.equal(context.prescriptionFormUsage({usage:''},{}),'');
assert.equal(context.prescriptionMedicineTitle({name:'Escitalopram 10mg (Exidamin 10)',strength:'10 mg'}),'Escitalopram 10mg (Exidamin 10)');
assert.equal(context.prescriptionMedicineTitle({name:'Mirtazapine 30',generic_name:'Mirtazapine',strength:'30 mg'}),'Mirtazapine 30 mg');
assert.equal(context.prescriptionMedicineTitle({name:'Brand 30',strength:'30 mg'}),'Brand 30 30 mg');
assert.equal(context.prescriptionMedicineTitle({name:'Medicine 110 mg',strength:'10 mg'}),'Medicine 110 mg 10 mg');
assert.equal(context.prescriptionMedicineTitle({name:'Medicine 10 mg/ml',strength:'10 mg'}),'Medicine 10 mg/ml 10 mg');
assert.equal(context.prescriptionFormUsage({usage:'Chỉ dùng khi cần'},{}),'Chỉ dùng khi cần');
const usage=context.prescriptionFormUsage({route:'Uống',unit:'viên',usage:JSON.stringify({schedule:{mode:'time_slots',time_slots:{morning:0.5,evening:1}}})},{medicine_days:7});
assert.equal(usage,'');
for (const noteMode of ['generated','manual']) {
  const note='Uống 2 viên buổi sáng, trong 30 ngày.';
  const medicine={name:'Diazepam 5mg',route:'Uống',unit:'viên',quantity:60,
    usage:{note,note_mode:noteMode,schedule:{mode:'time_slots',time_slots:{morning:2}},medicine_days:30}};
  assert.equal(context.prescriptionFormUsage(medicine),note);
  for (const type of ['BASIC','H','N']) {
    const options={prescriptionData:{prescription_type:type,medicines:[medicine]}};
    for (const html of [render(type,options),context.window.buildPrescriptionScreenHTML(options)]) {
      assert.equal(html.split(note).length-1,1);
      assert.ok(!html.includes('Sáng 2 viên; trong 30 ngày'));
    }
  }
}
assert.equal(context.prescriptionFormUsage({route:'Uống',usage:{note:'Sau ăn <nếu cần>',schedule:{mode:'times_per_day',times_per_day:{qty_per_time:2,times_per_day:3}}}}),'Sau ăn &lt;nếu cần&gt;');
assert.equal(context.prescriptionFormUsage({usage:'"Ghi chú cũ"'}),'Ghi chú cũ');
assert.ok(render('H',{prescriptionData:{medicines:[{name:'QA',usage:{schedule:{mode:'time_slots',time_slots:{morning:2}}}}]}}).includes('Cách dùng: ................................'));
const options={prescriptionData:{prescriptions:['BASIC','H','N'].map(type=>({type,prescription_code:'QA-'+type,medicines:[{name:'QA',category_type:'DRUG',quantity:5,unit:'viên'}]}))}};
const before=JSON.stringify(options);
const pages=context.window.PrescriptionPrintDocument.buildPageModels(options);
assert.equal(pages.length,3);
assert.equal(pages.map(page=>page.prescriptionData.prescription_code).join(','),'QA-BASIC,QA-H,QA-N');
assert.equal(JSON.stringify(options),before);
assert.equal((context.window.PrescriptionPrintDocument.create().buildPagesHtml({...options,buildPrescriptionPreviewHTML:context.buildPrescriptionPreviewHTML}).match(/data-prescription-type=/g)||[]).length,3);
console.log('Standard prescription forms: labels, 72-month boundary, quantities, dosage preservation, page grouping OK');
