const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function fixture(lane='PASS'){
 const elements={};let focused='';
 for(const id of ['app','workspace','studentSearch','studentSuggestions','selectedStudentArea','passToArea','requestRouting','detDateArea'])elements[id]={value:'Ada',innerHTML:'',dataset:{},attributes:{},classList:{add(x){this[x]=true},remove(x){delete this[x]},toggle(){}},setAttribute(k,v){this.attributes[k]=v},focus(){focused=id},scrollIntoView(){}};
 const c={console,navigator:{},window:{},document:{addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},setTimeout,clearTimeout,setInterval,clearInterval};vm.createContext(c);
 c.setInterval=()=>0;
 for(const f of ['app-core','app-pass-request','app-class-routing','app-detention-settings','app-camera-utils'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+f+'.js'),'utf8'),c);
 const run=s=>vm.runInContext(s,c);run(`state.lane='${lane}';state.token='T';state.bootstrap={studentIndex:[{studentId:'1',firstName:'Ada',lastName:'Test',grade:'8'},{studentId:'2',firstName:'Ben',lastName:'Test',grade:'7'}]};`);
 c.toast=()=>{};c.closeCamera=()=>{};c.renderRequest=()=>{};c.renderPass=()=>{};
 return {c,run,e:elements,focus:()=>focused};
}
const details=name=>({ok:true,routing:{currentClass:{display:name},defaultClass:{display:name,period:'P1'},periods:[{display:name,period:'P1'}]}});
(async()=>{
 for(const lane of ['PASS','RQST']){
  const {c,run,e,focus}=fixture(lane),reply=deferred();c.server=()=>reply.promise;
  const task=c.chooseStudent('1');const target=lane==='PASS'?'passToArea':'requestRouting';
  assert.equal(e.studentSearch.value,'');assert.equal(e.studentSuggestions.classList.hidden,true);assert(e.selectedStudentArea.innerHTML.includes('Ada Test'));assert.equal(run('state.studentLoading'),true);assert(e[target].innerHTML.includes('loading-spinner'));assert.equal(e[target].attributes['aria-busy'],'true');assert.equal(focus(),target);
  reply.resolve(details('Room A'));await task;assert.equal(run('state.studentLoading'),false);assert.equal(e[target].attributes['aria-busy'],'false');assert(e[target].innerHTML.includes('Room A'));
 }
 // The last selection owns the schedule, even if the first request finishes last.
 {
  const {c,run,e}=fixture(),one=deferred(),two=deferred();c.server=(fn,t,id)=>id==='1'?one.promise:two.promise;
  const first=c.chooseStudent('1'),second=c.chooseStudent('2');two.resolve(details('Room B'));await second;one.resolve(details('Room A'));await first;assert.equal(run('state.student.studentId'),'2');assert(e.passToArea.innerHTML.includes('Room B'));assert(!e.passToArea.innerHTML.includes('Room A'));
 }
 for(const action of ['remove','lane','bulk']){
  const {c,run}=fixture(),reply=deferred();c.server=()=>reply.promise;const task=c.chooseStudent('1');if(action==='remove')c.removeStudent('1');if(action==='lane')c.selectLane('RQST');if(action==='bulk')c.toggleBulk();reply.resolve(details('Old room'));await task;assert.equal(run('state.student'),null);assert.equal(run('state.studentDetails'),null);assert.equal(run('state.studentLoading'),false);
 }
 // Failures stay visible beside the destination and can be retried without choosing again.
 {
  const {c,run,e}=fixture(),reply=deferred();c.server=()=>reply.promise;const task=c.chooseStudent('1');reply.reject(new Error('Network unavailable'));await task;assert.equal(run('state.student.studentId'),'1');assert.equal(run('state.studentLoading'),false);assert(e.passToArea.innerHTML.includes('Retry schedule lookup'));c.server=async()=>details('Recovered');await c.retryStudentLookup();assert(e.passToArea.innerHTML.includes('Recovered'));assert.equal(run('state.studentLookupError'),'');
 }
 // Availability updates immediately; an older date list cannot replace the chosen student's.
 {
  const {c,run,e}=fixture('DET'),one=deferred(),two=deferred();c.server=(fn,t,type,id)=>{assert.equal(fn,'getDetentionAvailability');return id==='1'?one.promise:two.promise};
  const first=c.chooseStudent('1'),second=c.chooseStudent('2');assert(e.detDateArea.innerHTML.includes('Checking detention dates'));assert.equal(run('state.detentionLoading'),true);two.resolve({suggestedDate:'new',dates:[{dateKey:'new',display:'New date',selectable:true}]});await second;one.resolve({suggestedDate:'old',dates:[]});await first;assert.equal(run('state.detentionDate'),'new');assert(e.detDateArea.innerHTML.includes('New date'));assert.equal(e.detDateArea.attributes['aria-busy'],'false');
 }
 console.log('Student feedback: immediate dismissal, selection, field focus and spinner; successful lookup, latest-selection ownership, remove/lane/bulk cancellation, retry and detention date races passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
