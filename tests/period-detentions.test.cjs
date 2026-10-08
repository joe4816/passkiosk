const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server={console,PK:{TIME_ZONE_FALLBACK:'America/Los_Angeles'},Utilities:{formatDate:(d,tz,f)=>({ 'yyyy-MM-dd':d.day||'2026-10-08',H:Math.floor(d.minutes/60),m:Math.floor(d.minutes%60),s:0})[f]},nextActiveSchoolDate_:()=> '2026-10-09',bellForStudentPeriod_:(p,s,b)=>b.find(w=>w.period===p),routeClass_:(p,c,d)=>({period:p,display:c.display,dateKey:d}),classDisplay_:c=>c.display,processingError_:(c,m)=>Object.assign(new Error(m),{code:c}),assertPassExcusedHeader_:()=>{},getPrinterForSession_:(s,c)=>c.printers.find(p=>p.key===s.printerKey),makePrintJobRow_:(tid,now,s,c)=>({'Transaction ID':tid,'Printer Key':s.printerKey}),buildTransaction_:(tid,now,s,w,student,data)=>({'Transaction ID':tid,Workflow:w,data}),Date};
vm.createContext(server);vm.runInContext(read('apps-script/WorkflowOptions.gs'),server);
const student={schedule:Object.fromEntries([1,2,3,4,5,6].map(p=>['P'+p,{display:'Rm '+p+' · Teacher '+p}]))};
const cfg={sources:{},calendar:[{dateKey:'2026-10-08',status:'ACTIVE'}],bells:[1,2,3,4,5,6].map(p=>({period:'P'+p,startMin:480+(p-1)*60,endMin:536+(p-1)*60})),printers:['AP_COPIER','AP_TARDY','BACK_OFFICE','RECEIPT2','RECEIPT1'].map(key=>({key}))};
const at=m=>({minutes:m,getTime:()=>m*60000});
for(const [minutes,period] of [[475,'P1'],[480,'P1'],[530,'P1'],[531,'P2'],[535,'P2'],[536,'P2'],[540,'P2'],[651,'P4'],[831,'P1'],[900,'P1']])assert.equal(server.resolvePeriodRouting_(student,cfg,at(minutes)).defaultPeriod,period,'minute '+minutes);
assert.equal(server.resolvePeriodRouting_(student,cfg,at(831)).defaultClass.dateKey,'2026-10-09');
const noSchool={...cfg,calendar:[]};assert.equal(server.resolvePeriodRouting_(student,noSchool,at(600)).defaultPeriod,'P1');
server.resolveRouting_=(s,c)=>server.resolvePeriodRouting_(s,c,at(651));
assert.equal(server.buildPeriodPassTx_({},student,{from:'Office',excused:true},cfg).To,'P4 · Rm 4 · Teacher 4');
assert.equal(server.buildPeriodPassTx_({},student,{from:'Office',excused:false,deliveryMode:'PERIOD',deliveryPeriod:'P2'},cfg).To,'P2 · Rm 2 · Teacher 2');
const session={username:'TEST',defaultLocation:'Office',printerKey:'RECEIPT1'};
for(const workflow of ['DET','LUNCH_DET'])for(const office of ['AP','BACK',''])for(const pickup of [false,true])for(const email of [false,true]){
 const data={detentionOffice:office,createPickupRequest:pickup};const bundle=server.prepareWorkflowBundle_('TEST',at(600),session,workflow,student,data,cfg,{},false,email);
 assert.equal(bundle.transactions.length,pickup?2:1);assert.equal(bundle.jobs.length,office?(pickup?3:2):(email?0:pickup?2:1));
 if(pickup){const request=bundle.transactions[1];assert.equal(request.data.deliveryPeriod,'P6');assert.equal(request.data.destination,'Office');assert.equal(request.data.atTime,'13:46');if(office)assert.deepEqual(Array.from(bundle.jobs.filter(j=>j['Transaction ID']==='TEST-RQST').map(j=>j['Printer Key'])),[office==='AP'?'AP_COPIER':'BACK_OFFICE']);}
}
assert.throws(()=>server.detentionOfficePair_({detentionOffice:'AP,BACK'},cfg));
assert.throws(()=>server.prepareWorkflowBundle_('X',at(600),session,'DET',{schedule:{}},{createPickupRequest:true},cfg,{},false,false),/P6/);
assert.throws(()=>server.prepareWorkflowBundle_('X',at(600),session,'DET',student,{detentionOffice:'AP'}, {...cfg,printers:[]},{},false,false),/Both printers/);
const nodes={detBothBack:{},detBothAP:{},detOutputSummary:{},detPickupDestinationRow:{classList:{toggle(){}}},detPickupDestination:{focus(){}}};
const client={state:{lane:'DET',session:{defaultLocation:'Office'},laneValues:{DET:{}}},document:{getElementById:id=>nodes[id]},setInterval:()=>{},Date,esc:s=>s,attr:s=>s};
vm.createContext(client);vm.runInContext(read('js/app-class-routing.js'),client);
client.selectDetentionOffice('BACK',true);assert.equal(nodes.detBothBack.checked,true);assert.equal(nodes.detBothAP.checked,false);
client.selectDetentionOffice('AP',true);assert.equal(nodes.detBothBack.checked,false);assert.equal(nodes.detBothAP.checked,true);
client.selectDetentionOffice('AP',false);assert.equal(nodes.detBothBack.checked,false);assert.equal(nodes.detBothAP.checked,false);
client.toggleDetentionPickup(true);assert.equal(client.state.laneValues.DET.createPickupRequest,true);
const routing=server.resolvePeriodRouting_(student,cfg,at(530));routing.receivedAt=100000;
assert.equal(client.timedDefaultPeriod(routing,100000),'P1');assert.equal(client.timedDefaultPeriod(routing,160000),'P2');
console.log('Period defaults, boundaries, manual routing, office exclusivity, pickup times and 24 output combinations passed.');
