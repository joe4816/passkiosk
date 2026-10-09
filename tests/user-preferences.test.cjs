const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const read=p=>fs.readFileSync(__dirname+'/../'+p,'utf8');
function backend(){
  const cells=new Map([['3:9','Printer Preferences'],['4:9',''],['5:9','']]);
  const rows=[['OPERATOR','','','','','YES'],['OTHER','','','','','YES']];
  const sheet={getLastRow:()=>5,getRange:(row,col,n,m)=>({
    getDisplayValue:()=>cells.get(row+':'+col)||'',
    getDisplayValues:()=>rows.slice(row-4,row-4+n),
    setValue:v=>cells.set(row+':'+col,v)
  })};
  const session={username:'OPERATOR',displayName:'Operator',printerKey:'MAIN',deviceId:'D'};
  const cfg={printers:[{key:'MAIN'},{key:'AIDES'},{key:'AP'}]};
  const c=vm.createContext({PK:{HELPER_SHEET:'Helper'},passSheet_:()=>({getSheetByName:()=>sheet}),
    normalizeUsername_:x=>String(x||'').split('@')[0].toUpperCase(),requireSession_:()=>session,
    readHelperConfig_:()=>cfg,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},pdfEmailEnabled_:()=>true,
    getActiveAdultByUsername_:u=>u==='HELPER'?{username:u,displayName:'H. Person',sig:''}:null,
    processingError_:(code,message)=>Object.assign(new Error(message),{code})});
  vm.runInContext(read('apps-script/UserPreferences.gs'),c);
  return {c,cells,session,cfg};
}
test('first-time default initializes six slots; isolated changes survive new sessions and preserve other users',()=>{
  const f=backend();assert.equal(f.c.userPrinterPreferences_('OPERATOR').initialized,false);
  f.c.savePrinterPreference_('T','DEFAULT','MAIN');assert.equal(f.cells.get('4:9'),'MAIN|MAIN|MAIN|MAIN|MAIN|MAIN');
  f.c.savePrinterPreference_('T','RQST','AIDES');f.c.savePrinterPreference_('T','DET','AP');
  assert.equal(f.cells.get('4:9'),'MAIN|MAIN|AIDES|AP|MAIN|MAIN');assert.equal(f.cells.get('5:9'),'');
  f.session.username='OTHER';f.c.savePrinterPreference_('T2','DEFAULT','AP');assert.equal(f.cells.get('5:9'),'AP|AP|AP|AP|AP|AP');
  f.session.username='OPERATOR';assert.equal(f.c.userPrinterPreferences_('OPERATOR').workflows.RQST,'AIDES');
  f.c.savePrinterPreference_('NEW-TOKEN','DEFAULT','AP');assert.equal(f.cells.get('4:9'),'AP|MAIN|AIDES|AP|MAIN|MAIN');
});
test('partial values fall back to default; PDF-only persists; invalid keys and unknown slots never write',()=>{
  const f=backend();assert.equal(f.c.parsePrinterPreferences_('MAIN|||||').workflows.BUS,'MAIN');
  f.c.savePrinterPreference_('T','DEFAULT','EMAIL_PDF');assert.equal(f.cells.get('4:9'),'EMAIL_PDF|EMAIL_PDF|EMAIL_PDF|EMAIL_PDF|EMAIL_PDF|EMAIL_PDF');
  for(const [lane,key] of [['RQST','FAKE'],['FAKE','MAIN'],['PASS','MAIN|AP']])assert.throws(()=>f.c.savePrinterPreference_('T',lane,key));
  assert.equal(f.c.userPrinterPreferences_('OPERATOR').workflows.PASS,'EMAIL_PDF');
});
test('submission printer is request-local; audit operator remains separate from Help out adult with a blank signature',()=>{
  const f=backend(),before=JSON.stringify(f.session);
  const one=f.c.sessionForPrinterRequest_(f.session,{printerKey:'AIDES'},f.cfg);
  const two=f.c.sessionForPrinterRequest_(f.session,{printerKey:'AP'},f.cfg);
  assert.equal(one.printerKey,'AIDES');assert.equal(two.printerKey,'AP');assert.equal(JSON.stringify(f.session),before);
  const tx={'Session Username':'OPERATOR','Session User':'Operator'};
  f.c.helpOutPassTransaction_(tx,{requestedByUsername:'HELPER'});
  assert.equal(tx['Issued By'],'H. Person');assert.equal(tx['Signature File'],'');assert.equal(tx['Session Username'],'OPERATOR');
  assert.throws(()=>f.c.sessionForPrinterRequest_(f.session,{printerKey:'FAKE'},f.cfg));
});
function client(){
  const nodes={};
  const c=vm.createContext({window:{},navigator:{},document:{addEventListener(){},getElementById:id=>nodes[id]||null,querySelectorAll:()=>[]},console,setTimeout,clearTimeout,setInterval,clearInterval,Map});
  for(const p of ['js/app-core.js','js/app-detention-settings.js','js/app-camera-utils.js'])vm.runInContext(read(p),c);
  const run=s=>vm.runInContext(s,c);
  run("state.token='T';state.session={username:'ME',displayName:'Me',defaultLocation:'Office'};state.currentPrinter={key:'MAIN'};state.bootstrap={adults:[{username:'ME',displayName:'Me',sourceName:'Me Zebra',defaultLocation:'Office'},{username:'HELPER',displayName:'J. Alpha',sourceName:'Joseph Alpha',defaultLocation:'Room 2'}],printers:[{key:'MAIN',friendlyName:'Main Office'},{key:'AIDES',friendlyName:'Aides'}],detention:{afterSchool:{defaultLocation:'Detention'},lunch:{defaultLocation:'Lunch'}},printerPreferences:{defaultPrinterKey:'MAIN',workflows:{PASS:'MAIN',RQST:'AIDES',DET:'MAIN',LUNCH_DET:'MAIN',BUS:'MAIN'}}};initializeLaneValues();");
  c.toast=()=>{};c.syncLanePrinter=()=>{};
  return {c,run,nodes};
}
test('Help out is isolated by tab, updates adult/location, stays within the session and resets next session',()=>{
  const f=client();f.nodes.rqRequestedBy={value:'Me'};f.nodes.rqDestination={value:'Office'};
  f.c.setHelpOut('RQST','HELPER');assert.equal(f.nodes.rqRequestedBy.value,'J. Alpha');assert.equal(f.nodes.rqDestination.value,'Room 2');
  assert.equal(f.run('state.laneValues.RQST.helpUsername'),'HELPER');assert.equal(f.run('state.laneValues.PASS.helpUsername'),'ME');
  f.run("state.lane='PASS';state.lane='RQST'");assert.equal(f.run('state.laneValues.RQST.helpUsername'),'HELPER');
  assert.equal(f.c.withLaneChoices({workflow:'RQST'}).printerKey,'AIDES');
  assert.equal(f.c.withLaneChoices({workflow:'RQST'}).data.requestedByUsername,'HELPER');
  f.c.initializeLaneValues();assert.equal(f.run('state.laneValues.RQST.helpUsername'),'ME');assert.equal(f.run('state.laneValues.RQST.printerKey'),'AIDES');
  assert.ok(f.c.adultOptions('ME').indexOf('J. Alpha')<f.c.adultOptions('ME').indexOf('>Me<'));
});
test('printer save changes one tab; submissions wait for persistence and handle rejection without switching routes',async()=>{
  const f=client();let complete;
  f.c.server=()=>new Promise(resolve=>complete=resolve);
  const pending=f.c.setLanePrinter('PASS','AIDES');
  assert.throws(()=>f.c.withLaneChoices({workflow:'PASS'}),/finish saving/);
  complete({ok:true,printerPreferences:{defaultPrinterKey:'MAIN',workflows:{PASS:'AIDES',RQST:'AIDES'}}});await pending;
  assert.equal(f.run('state.laneValues.PASS.printerKey'),'AIDES');assert.equal(f.run('state.laneValues.DET.printerKey'),'MAIN');
  f.c.server=async()=>{throw new Error('Cannot save')};await f.c.setLanePrinter('PASS','MAIN');assert.equal(f.run('state.laneValues.PASS.printerKey'),'AIDES');
});
test('returning users bypass chooser; first-time users see it; missing defaults request replacement',async()=>{
  const f=client(),calls=[];f.c.showPrinterSelection=()=>calls.push('chooser');f.c.enterPassKiosk=async key=>calls.push(key);f.c.enterEmailPassKiosk=async()=>calls.push('email');
  f.run("state.front={printers:[{key:'MAIN'}],pdfEmail:{enabled:true}};state.identified={printerPreferences:{initialized:true,defaultPrinterKey:'MAIN'}}");
  await f.c.restorePrinterChoice(false);assert.deepEqual(calls,['MAIN']);
  f.run("state.identified.printerPreferences={initialized:false}");await f.c.restorePrinterChoice(false);assert.equal(calls.pop(),'chooser');
  f.run("state.identified.printerPreferences={initialized:true,defaultPrinterKey:'GONE'}");await f.c.restorePrinterChoice(false);assert.equal(calls.pop(),'chooser');assert.equal(f.run('state.repairDefaultPrinter'),true);
});
