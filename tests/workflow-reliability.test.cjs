const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(){
  const button={disabled:false,textContent:'Send',dataset:{},isConnected:true};
  const notices=[];let resets=0;
  const c={console,document:{addEventListener(){},querySelectorAll:selector=>selector.includes('submit-row')?[button]:[],getElementById:()=>({classList:{add(){},remove(){}},innerHTML:''})},window:{},setTimeout,clearTimeout,setInterval,clearInterval};
  vm.createContext(c);
  for(const file of ['js/app-core.js','js/app-detention-settings.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
  const run=code=>vm.runInContext(code,c);
  run("state.lane='PASS';state.token='TOKEN';state.deviceId='D';state.bulk=true;state.basket=[{studentId:'1'}];state.bootstrap={studentIndex:[{studentId:'1'},{studentId:'2'}]};");
  c.toast=(...args)=>notices.push(args);c.resetAfterSend=()=>resets++;c.renderRequest=()=>{};c.renderPass=()=>{};c.renderBus=()=>{};c.closeCamera=()=>{};c.updateSelectedStudentArea=()=>{};
  return {c,run,button,notices,resets:()=>resets};
}
const request=()=>({workflow:'PASS',bulk:true,studentIds:['1'],data:{from:'Office',excused:false}});
const result={ok:true,createdCount:1,errorCount:0,created:[{studentId:'1',transactionId:'PK-1'}],errors:[]};
async function main(){
  {
    const {c,run,button,resets}=fixture(),reply=deferred();let calls=0;
    c.server=async(fn,token,r)=>{calls++;assert.equal(fn,'submitWorkflow');assert.equal(token,'TOKEN');assert.equal(r.deviceId,'D');return reply.promise};
    const task=c.submitLane(request());assert.equal(button.disabled,true);await c.submitLane(request());assert.equal(calls,1);
    await c.addStudentSelection({studentId:'2'},true);await c.chooseStudent('2');c.addManyIds('1 2');assert.equal(run('state.basket.length'),1);
    reply.resolve(result);await task;assert.equal(resets(),1);assert.equal(button.disabled,false);assert.equal(button.textContent,'Send');assert.equal(run('state.submitting'),false);
  }
  // Leaving/reentering a lane cannot give an old response ownership of the new form.
  {
    const {c,run,resets}=fixture(),reply=deferred();c.server=()=>reply.promise;
    const task=c.submitLane(request());c.selectLane('RQST');c.selectLane('PASS');run("state.basket=[{studentId:'2'}];");
    reply.resolve(result);await task;assert.equal(resets(),0);assert.equal(run('state.basket[0].studentId'),'2');assert.equal(run('state.submitting'),false);
  }
  // An interrupted or structurally invalid reply retains the request for review without replay.
  for(const failure of [true,false]){
    const {c,run,notices,resets,button}=fixture();let calls=0;
    c.server=async()=>{calls++;if(failure)throw new Error('Network lost');return {ok:true,createdCount:1,errorCount:0,created:[],errors:[]}};
    await c.submitLane(request());assert.equal(calls,1);assert.equal(resets(),0);assert.equal(run('state.basket.length'),1);assert.equal(run('state.submitting'),false);assert.equal(button.disabled,false);assert(notices.some(x=>x[0].includes('Recording is not confirmed; check Transactions before retrying.')));
  }
  // Successful partial processing remains a visible outcome and resets only its original form.
  {
    const {c,notices,resets}=fixture();c.server=async()=>({ok:true,createdCount:0,errorCount:1,created:[],errors:[{studentId:'1',message:'Missing destination'}]});await c.submitLane(request());assert.equal(resets(),1);assert(notices.some(x=>x[0].includes('require attention')));
  }
  // Explicit Excused is enabled in the deployed app; Activity Bus data remains staged.
  const config={window:{}};vm.createContext(config);vm.runInContext(fs.readFileSync(path.join(root,'config.js'),'utf8'),config);assert.equal(config.window.PASSKIOSK_CONFIG.features.explicitExcused,true);assert.equal(config.window.PASSKIOSK_CONFIG.features.activityBusData,false);
  console.log('Workflow recovery: double-tap guard, immutable basket while sending, stale lane ownership, uncertain/malformed replies, partial outcomes and configured feature gates passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
