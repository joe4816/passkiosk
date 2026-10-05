const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(){
  const elements=Object.fromEntries(['workspace','busStudentStatus','busApprovedBy','studentSearch','selectedStudentArea','cameraStatus','cameraCount','cameraModal','cameraVideo'].map(id=>[id,{innerHTML:'',textContent:'',value:'approver',classList:{add(){},remove(){}}}]));
  const button={disabled:false,textContent:'Send',isConnected:true};
  const timers=new Map();let nextTimer=1;
  const notices=[];
  const c={console,Date,window:{PASSKIOSK_CONFIG:{features:{activityBusData:true}}},navigator:{},document:{addEventListener(){},getElementById:id=>elements[id]||null,querySelector:()=>button,querySelectorAll:()=>[]},
    setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),setInterval:()=>nextTimer++,clearInterval(){},cancelAnimationFrame(){}};
  vm.createContext(c);
  for(const file of ['js/app-core.js','js/app-detention-settings.js','js/app-camera-utils.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
  const run=code=>vm.runInContext(code,c);
  run("state.lane='BUS';state.token='TOKEN';state.deviceId='D';state.student={studentId:'1',firstName:'Test',lastName:'One'};state.studentDetails={};state.laneValues.BUS={approvedByUsername:'approver'};state.bootstrap={studentIndex:[state.student,{studentId:'2',firstName:'Test',lastName:'Two'}]};");
  c.toast=(...args)=>notices.push(args);c.playBusAlertTone=()=>{};c.updateSelectedStudentArea=()=>{};c.afterStudentSelected=()=>{};c.adultOptions=()=>'';c.renderPass=()=>{};c.selectedIds=()=>run('state.basket.map(s=>s.studentId)');
  return {c,run,e:elements,button,timers,notices};
}
const assignment={route:'R1',dropoffAddress:'Test stop'};
async function main(){
  // A late lookup must not authorize a different student or repaint a new lane.
  {
    const {c,run,e}=fixture(),reply=deferred();let writes=0;
    c.server=async fn=>{if(fn==='getBusInfo')return reply.promise;writes++;};
    const task=c.renderBusStudentStatus();c.selectLane('PASS');
    reply.resolve({ok:true,studentId:'1',assignments:[assignment]});await task;
    assert.equal(writes,0);assert.equal(run('state.lane'),'PASS');assert.equal(run('state.busInfo'),null);assert.equal(run('state.busBusy'),false);
    assert(!e.busStudentStatus.innerHTML.includes('RECORDED'));
  }
  // Rejecting an obsolete lookup cannot clear the newer lookup's busy flag.
  {
    const {c,run}=fixture(),reply=deferred();c.server=()=>reply.promise;
    const task=c.renderBusStudentStatus();c.selectLane('BUS');run("state.student={studentId:'2'};state.busBusy=true;");
    reply.reject(new Error('late failure'));await task;assert.equal(run('state.busBusy'),true);assert.equal(run('state.student.studentId'),'2');
  }
  // A stale submit cannot clear/reset a new BUS view, even after leaving and returning.
  {
    const {c,run,e,timers}=fixture(),reply=deferred();c.server=()=>reply.promise;
    const task=c.submitBusPass(false);assert.equal(run('state.busWritePending'),true);
    c.selectLane('PASS');c.selectLane('BUS');run("state.student={studentId:'2'};");
    reply.resolve({ok:true,studentId:'1',transactionId:'PK-1',assignments:[assignment]});await task;
    assert.equal(run('state.student.studentId'),'2');assert.equal(run('state.busInfo'),null);assert.equal(run('state.busWritePending'),false);assert.equal(timers.size,0);
    assert(!e.busStudentStatus.innerHTML.includes('PASS RECORDED'));
  }
  // Student removal cancels local lookup ownership without canceling a pending backend write.
  {
    const {c,run}=fixture(),reply=deferred();c.server=()=>reply.promise;
    const task=c.submitBusPass(false);c.removeStudent('1');
    assert.equal(run('state.busBusy'),false);assert.equal(run('state.busWritePending'),true);
    await c.chooseStudent('2');assert.equal(run('state.student'),null);
    reply.resolve({ok:true,studentId:'1',transactionId:'PK-1',assignments:[assignment]});await task;
    assert.equal(run('state.busWritePending'),false);assert.equal(run('state.student'),null);
  }
  // Transport failure has an unknown outcome, not a false claim of NOT RECORDED.
  {
    const {c,run,e}=fixture();c.server=async()=>{throw new Error('Connection lost')};await c.submitBusPass(true);
    assert(e.busStudentStatus.innerHTML.includes('RECORDING NOT CONFIRMED'));assert(e.busStudentStatus.innerHTML.includes('Check Transactions before retrying'));assert.equal(run('state.busWritePending'),false);assert.equal(run('state.busBusy'),false);assert.equal(run('state.busOverride'),null);
  }
  // Invalid lookup payload cannot silently become a no-bus decision or authorize anyone.
  {
    const {c,e}=fixture();let calls=0;c.server=async()=>{calls++;return {ok:true,studentId:'2',assignments:[assignment]}};
    await c.renderBusStudentStatus();assert.equal(calls,1);assert(e.busStudentStatus.innerHTML.includes('BUS LOOKUP FAILED'));
  }
  // An already-queued timer for student one cannot erase student two.
  {
    const {c,run,timers}=fixture();c.scheduleBusReset(2500);const stale=[...timers.values()][0];
    c.selectLane('BUS');run("state.student={studentId:'2'};");stale();assert.equal(run('state.student.studentId'),'2');
    c.startBusCountdown(3,c.resetBusLaneStudent,'No bus');const countdown=[...timers.values()][0];
    c.selectLane('PASS');countdown();assert.equal(run('state.lane'),'PASS');
  }
  // Busy QR frames must not consume the next QR; a held QR still fires only once.
  {
    const {c,run}=fixture();let processed=0;c.handleBusCameraStudent=async()=>{processed++};
    run('state.busBusy=true');await c.handleScannedCode('2');assert.equal(run('state.camera.lastCode'),'');assert.equal(processed,0);
    run('state.busBusy=false');await c.handleScannedCode('2');await c.handleScannedCode('2');assert.equal(processed,1);
    run("state.camera.lastCode=''");await c.handleScannedCode('2');assert.equal(processed,2);
  }
  // Bulk response ownership must survive leaving/reentering BUS without wiping a new basket.
  {
    const {c,run,e}=fixture(),permission=deferred();let stopped=0;
    c.navigator.mediaDevices={getUserMedia:()=>permission.promise};
    e.cameraVideo.play=async()=>{};
    const task=c.openCamera();c.selectLane('PASS');
    permission.resolve({getTracks:()=>[{stop:()=>stopped++}]});await task;
    assert.equal(stopped,1);assert.equal(run('state.camera.stream'),null);
  }
  // Bulk response ownership must survive leaving/reentering BUS without wiping a new basket.
  {
    const {c,run}=fixture(),reply=deferred();run("state.bulk=true;state.student=null;state.basket=[{studentId:'1'}];");c.server=()=>reply.promise;
    const task=c.submitBusBulk();c.selectLane('PASS');c.selectLane('BUS');run("state.bulk=true;state.basket=[{studentId:'2'}];");
    reply.resolve({ok:true,bulk:true,batchRoot:'PK-B',createdCount:1,errorCount:0,created:[{studentId:'1'}],errors:[]});await task;
    assert.equal(run('state.basket[0].studentId'),'2');assert.equal(run('state.submitting'),false);assert.equal(run('state.busWritePending'),false);
  }
  // Malformed/partial bulk response keeps the basket and warns against blind replay.
  {
    const {c,run,notices}=fixture();run("state.bulk=true;state.student=null;state.basket=[{studentId:'1'},{studentId:'2'}];");
    c.server=async()=>({ok:true,bulk:true,batchRoot:'PK-B',createdCount:1,errorCount:0,created:[{studentId:'1'}],errors:[]});await c.submitBusBulk();
    assert.equal(run('state.basket.length'),2);assert(notices.some(n=>n[0].includes('Recording is not confirmed')));assert.equal(run('state.submitting'),false);
  }
  console.log('Activity Bus reliability: stale lookups/submits, lane reentry, student removal, ambiguous failures, malformed responses, stale timers, busy/held QR frames and bulk ownership passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
