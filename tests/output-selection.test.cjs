const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
function fixture(){
 const elements={};const doc={addEventListener(){},getElementById(id){return elements[id]??=( {innerHTML:'',textContent:'',classList:{add(){},remove(){},contains(){return false}}})},querySelectorAll(){return []}};
 const c=vm.createContext({document:doc,window:{},console,Map,esc:v=>String(v),attr:v=>String(v),localStorage:{getItem(){return 'AP_COPIER'},setItem(){}},crypto:{randomUUID:()=> 'a-valid-email-id-1234'}});
 for(const file of ['app-core.js','app-email.js','app-detention-settings.js'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+file,'utf8'),c);
 vm.runInContext("state.front={pdfEmail:{enabled:true},printers:[{key:'AP_COPIER',friendlyName:'AP Office Copier'},{key:'MAIN_COPIER',friendlyName:'Main Office Copier'},{key:'BACK_OFFICE',friendlyName:'Back Office'},{key:'AP_TARDY',friendlyName:'AP Office Tardy Printer'},{key:'RECEIPT1',friendlyName:'Receipt Printer 1'},{key:'RECEIPT2',friendlyName:'Back Ofc Aides'},{key:'CAFE_TARDY',friendlyName:'Cafe Tardy Printer'}]};state.identified={username:'SAL'};",c);
 return {c,elements,run:s=>vm.runInContext(s,c)};
}
test('all outputs start off even with a remembered printer; copiers left and receipts right',()=>{
 const f=fixture();f.c.renderFrontPrinters();const html=f.elements.frontPrinters.innerHTML;
 assert.equal((html.match(/aria-checked="false"/g)||[]).length,8);assert.doesNotMatch(html,/aria-checked="true"/);
 const columns=html.split('</section>');assert.match(columns[0],/AP Office Copier/);assert.doesNotMatch(columns[0],/Back Ofc Aides/);assert.match(columns[1],/Back Ofc Aides/);assert.match(columns[1],/Cafe Tardy Printer/);
 assert.ok(html.indexOf('output-email')>html.indexOf('receiptHeading'));
});
test('physical selection replaces the previous choice and can be cleared; PDF is independent',()=>{
 const f=fixture();f.c.toggleOutputPrinter('AP_COPIER');f.c.toggleOutputEmail();f.c.toggleOutputPrinter('RECEIPT2');
 assert.equal(f.run('outputSelection.printerKey'),'RECEIPT2');assert.equal(f.run('outputSelection.email'),true);
 f.c.toggleOutputPrinter('RECEIPT2');assert.equal(f.run('outputSelection.printerKey'),'');assert.equal(f.run('outputSelection.email'),true);
 f.c.toggleOutputEmail();assert.equal(f.run('outputSelection.email'),false);
 f.c.toggleOutputPrinter('FAKE');assert.equal(f.run('outputSelection.printerKey'),'');
});
test('empty continue validates; each allowed combination enters the correct session',async()=>{
 const f=fixture(),calls=[];f.c.enterPassKiosk=async(...args)=>calls.push(['print',...args]);f.c.enterEmailPassKiosk=async()=>calls.push(['email']);
 await f.c.continueOutputSelection();assert.equal(calls.length,0);assert.match(f.elements.outputValidation.textContent,/Choose a printer/);
 f.c.toggleOutputEmail();await f.c.continueOutputSelection();assert.deepEqual(calls.pop(),['email']);
 f.c.toggleOutputPrinter('AP_COPIER');await f.c.continueOutputSelection();assert.deepEqual(calls.pop(),['print','AP_COPIER',true]);
 f.c.toggleOutputEmail();await f.c.continueOutputSelection();assert.deepEqual(calls.pop(),['print','AP_COPIER',false]);
});
test('continue gives immediate busy feedback and blocks duplicate session starts',async()=>{
 const f=fixture();let done,count=0;f.c.enterPassKiosk=()=>{count++;return new Promise(r=>done=r)};f.c.toggleOutputPrinter('AP_COPIER');
 const pending=f.c.continueOutputSelection();assert.match(f.elements.frontPrinters.innerHTML,/Connecting…/);assert.match(f.elements.frontPrinters.innerHTML,/disabled/);
 await f.c.continueOutputSelection();f.c.toggleOutputPrinter('RECEIPT2');assert.equal(count,1);assert.equal(f.run('outputSelection.printerKey'),'AP_COPIER');done();await pending;
});
test('combined submission requests email and physical output together; email alone does not',()=>{
 const f=fixture();f.run("state.pdfEmail={enabled:true};state.outputMode='BOTH'");assert.equal(f.c.usePdfEmail(),true);assert.equal(f.c.emailSubmissionRequest({studentIds:['1']}).includePhysicalPrint,true);
 f.run("state.outputMode='EMAIL'");assert.equal(f.c.emailSubmissionRequest({studentIds:['1']}).includePhysicalPrint,false);
 f.run("state.outputMode='PRINT'");assert.equal(f.c.usePdfEmail(),false);
});
