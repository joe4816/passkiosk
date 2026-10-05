const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../apps-script/patches');
let errorHeader=true;
const c={console,Date,PK:{TRANSACTIONS_SHEET:'Transactions',TIME_ZONE_FALLBACK:'America/Los_Angeles',WORKFLOWS:{PASS:'PASS',REQUEST:'RQST',LUNCH:'LUNCH_DET',AFTER_SCHOOL:'DET'}},
  Utilities:{formatDate:()=> '2030-01-01'},prettyDate_:x=>x,
  getDetentionState_:()=>({counts:{},studentDates:{}}),
  processingError_:(code,message)=>Object.assign(new Error(message),{code}),
  resolveRouting_:()=>({currentClass:{display:'Rm 101'}}),
  passSheet_:()=>({getSheetByName:()=>({getLastColumn:()=>2,getRange:()=>({getDisplayValues:()=>[errorHeader?['Transaction ID','Excused']:['Transaction ID','Notes']]})})}),
  buildRequestTx_:tx=>tx,buildDetentionTx_:tx=>tx};
vm.createContext(c);
for(const file of ['DetentionAvailability.gs','PassExcused.gs'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const dates=['2030-01-02','2030-01-03','2030-01-04','2030-01-05','2030-01-06','2030-01-07'];
function config(windowDays=0,maxPerDay=0){const d={windowDays,maxPerDay,defaultLocation:'Room',directions:['Report']};return {sources:{timeZone:'America/Los_Angeles'},detention:{afterSchool:{...d},lunch:{...d}},calendar:[{dateKey:'2029-12-31',status:'ACTIVE'},{dateKey:'2030-01-01',status:'ACTIVE'},...dates.map(dateKey=>({dateKey,status:'ACTIVE'}))]}}
const student={studentId:'1',firstName:'Test',lastName:'Student',grade:'7'};
const available=(cfg,counts,studentDates={},type='AFTER_SCHOOL')=>c.buildDetentionAvailability_(type,student,cfg,{counts,studentDates});
// Lowest among three eligible days, not only the first or a later fourth date.
let result=available(config(),{[dates[0]]:9,[dates[1]]:2,[dates[2]]:5,[dates[3]]:0});assert.equal(result.suggestedDate,dates[1]);assert.equal(result.windowDays,0);
// Earliest date breaks a tie.
result=available(config(),{[dates[0]]:3,[dates[1]]:1,[dates[2]]:1});assert.equal(result.suggestedDate,dates[1]);
// Full/duplicate dates do not consume one of the three eligible places.
result=available(config(0,10),{[dates[0]]:10,[dates[1]]:0,[dates[2]]:5,[dates[3]]:4,[dates[4]]:2,[dates[5]]:0},{['1|'+dates[1]]:true});assert.equal(result.suggestedDate,dates[4]);assert.equal(result.dates[0].full,true);assert.equal(result.dates[1].duplicate,true);assert.equal(result.dates[1].selectable,false);
// Positive windows retain the configured lookahead; inactive days are excluded.
result=available(config(1),{[dates[0]]:8,[dates[1]]:0});assert.equal(result.suggestedDate,dates[0]);
result=available(config(2),{[dates[0]]:8,[dates[1]]:4,[dates[2]]:0});assert.equal(result.suggestedDate,dates[1]);
const inactive=config();inactive.calendar[2].status='INACTIVE';assert.equal(available(inactive,{}).suggestedDate,dates[1]);
// Fewer than three remaining days and no eligible dates are handled without errors.
const short=config();short.calendar=short.calendar.slice(0,4);assert.equal(available(short,{[dates[0]]:3,[dates[1]]:1}).suggestedDate,dates[1]);
assert.equal(available(config(0,1),Object.fromEntries(dates.map(x=>[x,1]))).suggestedDate,'');
// Lunch and after-school use their own configuration; in-memory bulk counts rebalance.
const mixed=config(0);mixed.detention.lunch.windowDays=1;assert.equal(available(mixed,{[dates[0]]:9,[dates[1]]:0},{},'LUNCH').suggestedDate,dates[0]);
const state={counts:{},studentDates:{}};const first=c.buildDetentionAvailability_('AFTER_SCHOOL',null,config(),state).suggestedDate;state.counts[first]=1;assert.equal(c.buildDetentionAvailability_('AFTER_SCHOOL',null,config(),state).suggestedDate,dates[1]);
const session={username:'operator',displayName:'Operator',deviceId:'D'};
const pass=(data,id='PK-TEST',bulk=false)=>c.buildTransaction_(id,new Date(),session,'PASS',student,{from:'Office',toOverride:'Class',...data},config(),null,bulk);
assert.equal(pass({excused:true,reason:'Unrelated'}).Excused,true);
assert.equal(pass({excused:false,reason:'Excused'}).Excused,false);
for(const value of [undefined,null,'true','false',1,0])assert.throws(()=>pass({excused:value,reason:'Excused'}),err=>err.code==='MISSING_EXCUSED');
assert.equal(pass({excused:true,reason:'Other',otherReason:'Explanation'})['Reason(s)'],'Explanation');
const tx=pass({excused:true,toOverride:''});assert.equal(tx.To,'Rm 101');assert.equal(tx['Session Username'],'operator');
const bulkRows=[pass({excused:true},'PK-B-01',true),pass({excused:true},'PK-B-02',true)];assert(bulkRows.every(x=>x.Excused===true));
const other=c.buildTransaction_('PK-OTHER',new Date(),session,'RQST',student,{},config(),null,false);assert.equal(other.Excused,false);
assert.throws(()=>pass({from:''}),/FROM is required/);assert.throws(()=>pass({reason:'Other',otherReason:''}),/Other reason/);
// Mapped writes must preserve actual booleans, and missing schema rejects creation.
const headers=['Transaction ID','Excused','Reason(s)'];assert.equal(headers.map(h=>tx[h])[1],true);
errorHeader=false;assert.throws(()=>pass({excused:true}),err=>err.code==='MISSING_EXCUSED_HEADER');
console.log('Backend replacement patches: zero/positive windows, eligible-day filtering, ties, capacity/duplicate exclusions, lunch/bulk balancing, strict Excused booleans and schema guard passed.');
