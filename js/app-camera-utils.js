async function openCamera(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    return toast(cameraFailureMessage(),true,6500);
  }
  closeCamera();
  const requestId=state.camera.requestId;
  const lane=state.lane;
  const epoch=state.busEpoch;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(state.camera.requestId!==requestId||state.lane!==lane||state.busEpoch!==epoch){
      stream.getTracks().forEach(track=>track.stop());
      return;
    }
    state.camera.stream=stream;
    const video=document.getElementById('cameraVideo');
    video.srcObject=stream;
    await video.play();
    if(state.camera.requestId!==requestId||state.camera.stream!==stream)return;
    document.getElementById('cameraModal').classList.remove('hidden');
    document.getElementById('cameraStatus').textContent='Point the camera at the student QR code.';
    document.getElementById('cameraCount').textContent=state.bulk?`${state.basket.length} in basket`:'';
    scanCameraFrame();
  }catch(err){
    if(state.camera.requestId!==requestId)return;
    closeCamera();
    toast(cameraFailureMessage(err),true,6500);
  }
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
function closeCamera(){state.camera.requestId=(state.camera.requestId||0)+1;if(state.camera.raf)cancelAnimationFrame(state.camera.raf);state.camera.raf=null;if(state.camera.stream){state.camera.stream.getTracks().forEach(t=>t.stop());state.camera.stream=null}const v=document.getElementById('cameraVideo');if(v)v.srcObject=null;document.getElementById('cameraModal').classList.add('hidden');state.camera.lastCode='';state.camera.lastAt=0;state.camera.lastSeenAt=0}
function scanCameraFrame(){const video=document.getElementById('cameraVideo'),canvas=document.getElementById('cameraCanvas');if(!state.camera.stream||!video)return;if(video.readyState>=2&&video.videoWidth&&video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height);const code=window.jsQR?jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'}):null;const now=Date.now();if(code&&code.data){state.camera.lastSeenAt=now;handleScannedCode(code.data)}else if(state.camera.lastCode&&now-(state.camera.lastSeenAt||0)>250){state.camera.lastCode=''}}state.camera.raf=requestAnimationFrame(scanCameraFrame)}
async function handleScannedCode(raw){if(state.lane==='BUS'&&(state.busBusy||state.busWritePending||state.submitting)){document.getElementById('cameraStatus').textContent='Still processing the previous Activity Bus submission…';return}const id=String(raw||'').trim();if(!/^\d+$/.test(id)){document.getElementById('cameraStatus').textContent='QR read, but it was not a student number.';return}if(id===state.camera.lastCode)return;state.camera.lastCode=id;state.camera.lastAt=Date.now();const s=(state.bootstrap.studentIndex||[]).find(x=>x.studentId===id);if(!s){document.getElementById('cameraStatus').textContent='Student number not found: '+id;return}if(state.bulk){if(state.basket.some(x=>x.studentId===id)){document.getElementById('cameraStatus').textContent='Already in basket: '+s.firstName+' '+s.lastName}else{await addStudentSelection(s,true);document.getElementById('cameraStatus').textContent='Added: '+s.firstName+' '+s.lastName}document.getElementById('cameraCount').textContent=`${state.basket.length} in basket`;return}if(state.lane==='BUS'&&typeof handleBusCameraStudent==='function'){document.getElementById('cameraStatus').textContent='Checking '+s.firstName+' '+s.lastName+'…';await handleBusCameraStudent(s);return}await addStudentSelection(s,true);closeCamera()}

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
