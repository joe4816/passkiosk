// One class chooser for corridor TO and request delivery FROM.
function classChoiceState(lane){
  const key=state.bulk?'BULK':String(state.student?.studentId||'');
  state.classChoices=state.classChoices||{};
  if(state.classChoices[lane]?.key!==key)state.classChoices[lane]={key,mode:'AUTO',period:'',override:''};
  return state.classChoices[lane];
}
function timedDefaultPeriod(routing,now=Date.now()){
  const t=routing?.timing;
  if(!t)return routing?.defaultClass?.period||'';
  if(!t.todayActive)return 'P1';
  // Start the elapsed clock on receipt so local computer clock skew is irrelevant.
  if(!routing.receivedAt)routing.receivedAt=now;
  const minutes=t.nowMinutes+(now-routing.receivedAt)/60000;
  const windows=t.windows||[],current=windows.find(w=>minutes>=w.start&&minutes<w.end);
  if(current&&minutes<current.end-5)return current.period;
  const next=windows.find(w=>w.start>(current?current.start:minutes));
  return next?.period||'P1';
}
function chosenClass(lane){
  const choice=classChoiceState(lane),routing=state.studentDetails?.routing;
  const period=choice.mode==='PERIOD'?choice.period:timedDefaultPeriod(routing);
  const route=(routing?.periods||[]).find(p=>p.period===period);
  return {choice,period,route,display:route?.display?period+' · '+route.display:''};
}
function classChooserHtml(lane){
  const {choice,period,display}=chosenClass(lane),pass=lane==='PASS';
  if(!state.bulk&&!state.studentDetails)return '<div class="small muted">Choose a student to look up their class.</div>';
  const value=choice.mode==='CUSTOM'?choice.override:display;
  const heading=pass?'TO CLASS':'FROM CLASS / DELIVER REQUEST TO';
  const main=state.bulk?`<div class="route-main">${choice.mode==='PERIOD'?esc(choice.period):'Current / next period'} · resolved for each student</div>${pass?`<input id="passToOverride" class="field" value="${attr(choice.override)}" placeholder="Override destination for everyone (optional)" oninput="setClassOverride(this.value)">`:''}`:
    pass?`<input id="passToOverride" class="field" value="${attr(value)}" placeholder="Destination" aria-label="To class" oninput="setClassOverride(this.value)">`:
    `<div class="route-main">${display?esc(display):'<span class="muted">No class found for '+esc(period||'this period')+'</span>'}</div>`;
  const buttons=['P1','P2','P3','P4','P5','P6'].filter(p=>state.bulk||choice.mode==='CUSTOM'||p!==period);
  return `<div class="route-box"><div class="section-title">${heading}</div>${main}</div><div class="section-title" style="margin-top:10px">CHOOSE ANOTHER PERIOD</div><div class="period-row">${buttons.map(p=>`<button type="button" class="period-btn ${choice.period===p&&choice.mode==='PERIOD'?'selected':''}" aria-pressed="${choice.period===p&&choice.mode==='PERIOD'}" onclick="selectClassPeriod('${lane}','${p}')">${p}</button>`).join('')}</div>${choice.mode!=='AUTO'?`<button type="button" class="secondary" style="margin-top:8px" onclick="selectClassAuto('${lane}')">Use current / next period</button>`:''}`;
}
function setClassOverride(value){const c=classChoiceState('PASS');c.mode='CUSTOM';c.override=value}
function selectClassPeriod(lane,p){if(state.submitting)return;const c=classChoiceState(lane);c.mode='PERIOD';c.period=p;c.override='';if(lane==='RQST'){state.requestDeliveryMode='PERIOD';state.requestDeliveryPeriod=p}renderClassChooser(lane)}
function selectClassAuto(lane){if(state.submitting)return;const c=classChoiceState(lane);c.mode='AUTO';c.period='';c.override='';if(lane==='RQST'){state.requestDeliveryMode='AUTO';state.requestDeliveryPeriod=''}renderClassChooser(lane)}
function renderClassChooser(lane){
  const box=document.getElementById(lane==='PASS'?'passToArea':'requestRouting');if(!box)return;
  box.setAttribute('aria-busy',String(state.studentLoading));
  if(!state.bulk&&(state.studentLoading||state.studentLookupError)){box.innerHTML=studentLookupMessage();return}
  box.innerHTML=classChooserHtml(lane);
}
function syncPassCurrentClass(){renderClassChooser('PASS')}
function renderRequestRouting(){renderClassChooser('RQST')}
function selectAutoRoute(){selectClassAuto('RQST')}
function selectDeliveryPeriod(p){selectClassPeriod('RQST',p)}
function passClassSubmission(){const c=classChoiceState('PASS');return {deliveryMode:c.mode==='PERIOD'?'PERIOD':'AUTO',deliveryPeriod:c.mode==='PERIOD'?c.period:'',toOverride:c.mode==='CUSTOM'?c.override.trim():''}}
setInterval(()=>{
  if(!['PASS','RQST'].includes(state.lane)||state.bulk||state.submitting||state.studentLoading)return;
  const c=classChoiceState(state.lane);if(c.mode!=='AUTO')return;
  const {period}=chosenClass(state.lane);
  if(c.lastPeriod&&c.lastPeriod!==period&&document.activeElement?.id!=='passToOverride')renderClassChooser(state.lane);
  c.lastPeriod=period;
},1000);

function detentionExtrasHtml(lane){
  const v=state.laneValues[lane];
  if(v.pickupDestination===undefined)v.pickupDestination=state.session.defaultLocation||'';
  return `<div class="detention-extras"><label class="output-check"><input id="detPickupRequest" type="checkbox" ${v.createPickupRequest?'checked':''} onchange="toggleDetentionPickup(this.checked)"><span>Also create a Request for Student</span></label><div id="detPickupDestinationRow" class="form-row ${v.createPickupRequest?'':'hidden'}"><label for="detPickupDestination">Send student to <span class="required-star">*</span></label><input id="detPickupDestination" class="field" value="${attr(v.pickupDestination)}" oninput="state.laneValues[state.lane].pickupDestination=this.value"><div class="small muted">Deliver to each student’s P6 class · send 10 minutes before the final bell · pick up detention notice.</div></div><label class="output-check"><input id="detBothBack" type="checkbox" ${v.detentionOffice==='BACK'?'checked':''} onchange="selectDetentionOffice('BACK',this.checked)"><span>Print to both Back Office printers</span></label><label class="output-check"><input id="detBothAP" type="checkbox" ${v.detentionOffice==='AP'?'checked':''} onchange="selectDetentionOffice('AP',this.checked)"><span>Print to both AP Office printers</span></label><div id="detOutputSummary" class="small muted" aria-live="polite">${detentionOutputSummary(v)}</div></div>`;
}
function detentionOutputSummary(v){return v.detentionOffice?'Detention: receipt for student + copier for filing. '+(v.createPickupRequest?'Request for Student: copier only.':''):'Uses your selected output destination.'}
function toggleDetentionPickup(checked){const v=state.laneValues[state.lane];v.createPickupRequest=checked;document.getElementById('detPickupDestinationRow').classList.toggle('hidden',!checked);document.getElementById('detOutputSummary').textContent=detentionOutputSummary(v);if(checked)document.getElementById('detPickupDestination').focus()}
function selectDetentionOffice(office,checked){const v=state.laneValues[state.lane];v.detentionOffice=checked?office:'';document.getElementById('detBothBack').checked=v.detentionOffice==='BACK';document.getElementById('detBothAP').checked=v.detentionOffice==='AP';document.getElementById('detOutputSummary').textContent=detentionOutputSummary(v)}
function detentionExtraSubmission(){const v=state.laneValues[state.lane];return {createPickupRequest:Boolean(v.createPickupRequest),pickupDestination:v.pickupDestination||state.session.defaultLocation||'',detentionOffice:v.detentionOffice||''}}
