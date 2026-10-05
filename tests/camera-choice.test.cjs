const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function fixture(){
  const elements=Object.fromEntries(['cameraModal','cameraStatus','cameraCount','cameraVideo','cameraSelect','cameraChoiceNote'].map(id=>[id,{innerHTML:'',textContent:'',value:'',disabled:false,classList:{add(){},remove(){}},play:async()=>{}}]));
  const calls=[],notices=[],streams=[];
  const devices=[{kind:'videoinput',deviceId:'front',label:'Front camera'},{kind:'videoinput',deviceId:'back',label:'Back camera'},{kind:'audioinput',deviceId:'mic',label:'Microphone'}];
  const c={console,Date,navigator:{userAgent:'Test',mediaDevices:{enumerateDevices:async()=>devices}},window:{},document:{getElementById:id=>elements[id]||null},state:{lane:'BUS',busEpoch:0,bulk:false,camera:{devices:[],requestId:0,stream:null,lastCode:'',lastSeenAt:0}},cancelAnimationFrame(){}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/app-camera-utils.js'),'utf8'),c);
  c.toast=(...args)=>notices.push(args);c.scanCameraFrame=()=>{};
  function stream(id,facingMode){const track={stopped:false,stop(){this.stopped=true},getSettings:()=>({deviceId:id,facingMode})};const s={getTracks:()=>[track],getVideoTracks:()=>[track],track};streams.push(s);return s}
  c.navigator.mediaDevices.getUserMedia=async constraints=>{calls.push(constraints);const id=constraints.video.deviceId?.exact||'back';return stream(id,id==='back'?'environment':'user')};
  return {c,e:elements,calls,notices,streams,devices,stream};
}
async function main(){
  {
    const {c,e,calls,streams}=fixture();await c.openCamera();
    assert.equal(calls[0].video.facingMode.exact,'environment');assert.equal(calls[0].audio,false);
    assert.equal(c.state.camera.selectedDeviceId,'back');assert.equal(e.cameraSelect.disabled,false);assert(e.cameraSelect.innerHTML.includes('Front camera'));assert(e.cameraSelect.innerHTML.includes('Back camera'));assert(!e.cameraSelect.innerHTML.includes('Microphone'));
    c.state.camera.lastCode='123';await c.switchCamera('front');
    assert.equal(streams[0].track.stopped,true);assert.equal(calls[1].video.deviceId.exact,'front');assert.equal(c.state.camera.selectedDeviceId,'front');assert.equal(c.state.camera.lastCode,'123');
    c.closeCamera();assert.equal(streams[1].track.stopped,true);assert.equal(c.state.camera.lastCode,'');await c.openCamera();assert.equal(calls[2].video.facingMode.exact,'environment');
    const count=calls.length;await c.switchCamera('missing');assert.equal(calls.length,count);
  }
  // Single-camera devices fall back cleanly instead of failing rear-only constraints.
  {
    const {c,e,calls,devices,stream}=fixture();devices.splice(1,1);
    c.navigator.mediaDevices.getUserMedia=async constraints=>{calls.push(constraints);if(constraints.video.facingMode.exact){const err=new Error('No back camera');err.name='OverconstrainedError';throw err}return stream('front','user')};
    await c.openCamera();assert.equal(calls.length,2);assert.equal(calls[1].video.facingMode.ideal,'environment');assert.equal(c.state.camera.selectedDeviceId,'front');assert.equal(e.cameraSelect.disabled,true);assert.equal(e.cameraChoiceNote.textContent,'One camera available.');
  }
  // Label discovery corrects browsers that ignore facingMode.
  {
    const {c,calls,stream}=fixture();c.navigator.mediaDevices.getUserMedia=async constraints=>{calls.push(constraints);return constraints.video.deviceId?stream('back','environment'):stream('front','user')};
    await c.openCamera();assert.equal(calls.length,2);assert.equal(calls[1].video.deviceId.exact,'back');assert.equal(c.state.camera.selectedDeviceId,'back');
  }
  // Permission denial must not repeatedly prompt or silently bypass the denial.
  {
    const {c,calls,notices}=fixture();c.navigator.mediaDevices.getUserMedia=async constraints=>{calls.push(constraints);const err=new Error('Permission denied');err.name='NotAllowedError';throw err};
    await c.openCamera();assert.equal(calls.length,1);assert.equal(c.state.camera.stream,null);assert.equal(notices.length,1);
  }
  // Enumeration restrictions do not break a successfully opened camera.
  {
    const {c,e}=fixture();c.navigator.mediaDevices.enumerateDevices=async()=>{throw new Error('Blocked')};await c.openCamera();assert(c.state.camera.stream);assert.equal(e.cameraSelect.disabled,true);
  }
  // Switch failure stops the old stream and keeps the selector available for recovery.
  {
    const {c,e,streams}=fixture();await c.openCamera();c.navigator.mediaDevices.getUserMedia=async()=>{throw new Error('Disconnected')};await c.switchCamera('front');assert.equal(streams[0].track.stopped,true);assert.equal(c.state.camera.stream,null);assert.equal(c.state.camera.opening,false);assert.equal(e.cameraSelect.disabled,false);assert(e.cameraStatus.textContent.includes('Choose another camera'));
  }
  // Closing while permission is pending stops late-arriving streams.
  {
    const {c,stream}=fixture();let resolve;c.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
    const pending=c.openCamera();c.state.busEpoch++;const next=stream('back','environment');resolve(next);await pending;assert.equal(next.track.stopped,false);assert.equal(c.state.camera.stream,next);assert.equal(c.state.camera.opening,false);
  }
  // Closing while permission is pending stops late-arriving streams.
  {
    const {c,stream}=fixture();let resolve;c.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
    const pending=c.openCamera();c.closeCamera();const late=stream('back','environment');resolve(late);await pending;assert.equal(late.track.stopped,true);assert.equal(c.state.camera.stream,null);
  }
  console.log('Camera choice: rear default, device selector, exact switching, single-camera fallback, label correction, permission denial, recovery and held-QR preservation passed.');
}
main().catch(err=>{console.error(err);process.exitCode=1});
