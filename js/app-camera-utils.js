async function openCamera(deviceId='',preserveCode=false){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    return toast(cameraFailureMessage(),true,6500);
  }
  const heldCode=preserveCode?state.camera.lastCode:'';
  closeCamera();
  state.camera.lastCode=heldCode;
  state.camera.lastSeenAt=heldCode?Date.now():0;
  const requestId=state.camera.requestId;
  const lane=state.lane;
  // Student resets do not cancel the rapid-scanning camera; lane changes do.
  const current=()=>state.camera.requestId===requestId&&state.lane===lane;
  state.camera.opening=true;
  document.getElementById('cameraModal').classList.remove('hidden');
  document.getElementById('cameraStatus').textContent=deviceId?'Switching camera…':'Opening back camera…';
  renderCameraChoices();
  try{
    let stream;
    if(deviceId){
      stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:deviceId}},audio:false});
    }else{
      try{
        // Require the outward-facing camera when the browser can identify it.
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'}},audio:false});
      }catch(err){
        if(!current())return;
        if(!['OverconstrainedError','ConstraintNotSatisfiedError','NotFoundError','DevicesNotFoundError'].includes(err.name))throw err;
        // Single-camera devices and browsers without facingMode still work.
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      }
    }
    if(!current()){stream.getTracks().forEach(track=>track.stop());return}
    state.camera.stream=stream;
    await refreshCameraDevices(requestId);
    if(!current())return;
    let track=stream.getVideoTracks?stream.getVideoTracks()[0]:null;
    let settings=track&&track.getSettings?track.getSettings():{};
    // Some browsers ignore facingMode. Use labels exposed after permission.
    if(!deviceId&&settings.facingMode!=='environment'){
      const rear=(state.camera.devices||[]).find(d=>/back|rear|environment|world/i.test(d.label||''));
      if(rear&&rear.deviceId!==settings.deviceId){
        stream.getTracks().forEach(t=>t.stop());
        state.camera.stream=null;
        stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:rear.deviceId}},audio:false});
        if(!current()){stream.getTracks().forEach(t=>t.stop());return}
        state.camera.stream=stream;
        track=stream.getVideoTracks?stream.getVideoTracks()[0]:null;
        settings=track&&track.getSettings?track.getSettings():{};
      }
    }
    state.camera.selectedDeviceId=settings.deviceId||deviceId||'';
    const video=document.getElementById('cameraVideo');
    video.srcObject=stream;
    await video.play();
    if(!current()||state.camera.stream!==stream)return;
    state.camera.opening=false;
    renderCameraChoices();
    document.getElementById('cameraStatus').textContent='Point the camera at the student QR code.';
    document.getElementById('cameraCount').textContent=state.bulk?`${state.basket.length} in basket`:'';
    scanCameraFrame();
  }catch(err){
    if(!current())return;
    closeCamera();
    if(deviceId){
      document.getElementById('cameraModal').classList.remove('hidden');
      document.getElementById('cameraStatus').textContent='That camera could not open. Choose another camera or close the scanner.';
      renderCameraChoices();
    }
    toast(cameraFailureMessage(err),true,6500);
  }
}

async function refreshCameraDevices(requestId){
  if(!navigator.mediaDevices.enumerateDevices)return;
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(state.camera.requestId!==requestId)return;
    state.camera.devices=devices.filter(d=>d.kind==='videoinput'&&d.deviceId);
  }catch(_){ /* Enumeration restrictions must not block a working camera. */ }
}

function renderCameraChoices(){
  const select=document.getElementById('cameraSelect');
  if(!select)return;
  const devices=state.camera.devices||[];
  const active=state.camera.selectedDeviceId||'';
  select.innerHTML=(active?'':'<option value="">Choose a camera</option>')+
    devices.map((d,i)=>`<option value="${attr(d.deviceId)}">${esc(d.label||'Camera '+(i+1))}</option>`).join('');
  select.value=active;
  select.disabled=Boolean(state.camera.opening)||devices.length<2;
  const note=document.getElementById('cameraChoiceNote');
  if(note)note.textContent=state.camera.opening?'Starting camera…':
    devices.length>1?'Choose a camera to switch.':
    devices.length===1?'One camera available.':'Camera selection is not available in this browser.';
}

async function switchCamera(deviceId){
  if(!deviceId||state.camera.opening||deviceId===state.camera.selectedDeviceId)return;
  if(!(state.camera.devices||[]).some(d=>d.deviceId===deviceId))return;
  // Preserve held-QR suppression: switching lenses is not a deliberate rescan.
  await openCamera(deviceId,true);
}

function cameraFailureMessage(err){
  const ua=String(navigator.userAgent||'');
  const ios=/iPhone|iPad|iPod/i.test(ua);
  const safari=/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const denied=err&&(/NotAllowedError|PermissionDeniedError/i.test(String(err.name||''))||/not allowed|permission|denied/i.test(String(err.message||'')));
  if(ios&&(!safari||denied)) return 'Camera is blocked in this browser view. Open PassKiosk directly in Safari, then allow Camera when prompted.';
  if(denied) return 'Camera permission is blocked. Allow Camera for this site in your browser settings, then try again.';
  return 'Camera could not open in this browser. Student search and student-number entry still work.';
}
function closeCamera(){state.camera.opening=false;state.camera.selectedDeviceId='';state.camera.requestId=(state.camera.requestId||0)+1;if(state.camera.raf)cancelAnimationFrame(state.camera.raf);state.camera.raf=null;if(state.camera.stream){state.camera.stream.getTracks().forEach(t=>t.stop());state.camera.stream=null}const v=document.getElementById('cameraVideo');if(v)v.srcObject=null;document.getElementById('cameraModal').classList.add('hidden');state.camera.lastCode='';state.camera.lastAt=0;state.camera.lastSeenAt=0}
function scanCameraFrame(){const video=document.getElementById('cameraVideo'),canvas=document.getElementById('cameraCanvas');if(!state.camera.stream||!video)return;if(video.readyState>=2&&video.videoWidth&&video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height);const code=window.jsQR?jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'}):null;const now=Date.now();if(code&&code.data){state.camera.lastSeenAt=now;handleScannedCode(code.data)}else if(state.camera.lastCode&&now-(state.camera.lastSeenAt||0)>250){state.camera.lastCode=''}}state.camera.raf=requestAnimationFrame(scanCameraFrame)}
async function handleScannedCode(raw){if(state.submitting){document.getElementById('cameraStatus').textContent='Submission in progress. Wait before scanning another student.';return}if(state.lane==='BUS'&&(state.busBusy||state.busWritePending||state.submitting)){document.getElementById('cameraStatus').textContent='Still processing the previous Activity Bus submission…';return}const id=String(raw||'').trim();if(!/^\d+$/.test(id)){document.getElementById('cameraStatus').textContent='QR read, but it was not a student number.';return}if(id===state.camera.lastCode)return;state.camera.lastCode=id;state.camera.lastAt=Date.now();const s=(state.bootstrap.studentIndex||[]).find(x=>x.studentId===id);if(!s){document.getElementById('cameraStatus').textContent='Student number not found: '+id;return}if(state.bulk){if(state.basket.some(x=>x.studentId===id)){document.getElementById('cameraStatus').textContent='Already in basket: '+s.firstName+' '+s.lastName}else{await addStudentSelection(s,true);document.getElementById('cameraStatus').textContent='Added: '+s.firstName+' '+s.lastName}document.getElementById('cameraCount').textContent=`${state.basket.length} in basket`;return}if(state.lane==='BUS'&&typeof handleBusCameraStudent==='function'){document.getElementById('cameraStatus').textContent='Checking '+s.firstName+' '+s.lastName+'…';await handleBusCameraStudent(s);return}await addStudentSelection(s,true);closeCamera()}

function adultOptions(selected){return(state.bootstrap.adults||[]).map(a=>`<option value="${attr(a.username)}" ${a.username===selected?'selected':''}>${esc(a.displayName)}</option>`).join('')}
function nextQuarterHour(){const d=new Date(),m=d.getMinutes(),add=(15-(m%15))%15||15;d.setMinutes(m+add,0,0);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function formatTime(iso){if(!iso)return'';const d=new Date(iso);return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
function workflowLabel(w){return({PASS:'Pass',RQST:'Rqst🧑‍🎓',DET:'Det',LUNCH_DET:'🥪Det',BUS:'🚌',ERROR_REPORT:'Error Report'})[w]||w}
function statusIcon(s){return s==='PRINTED'?'✓':s==='FAILED'?'!':'…'}
function markInvalid(el){if(el)el.classList.add('invalid')}function clearInvalid(el){if(el)el.classList.remove('invalid')}function clearAllInvalid(){document.querySelectorAll('.invalid').forEach(x=>x.classList.remove('invalid'))}function invalidStop(el,msg){markInvalid(el);if(el&&el.focus)el.focus();toast(msg,true)}
function toast(msg,isError=false,duration=3600){const t=document.getElementById('toast');t.textContent=msg;t.className='toast'+(isError?' error':'');t.classList.remove('hidden');clearTimeout(toast._timer);toast._timer=setTimeout(()=>t.classList.add('hidden'),duration)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}function attr(v){return esc(v)}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
