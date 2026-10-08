const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(mode='staff'){
  const elements={},events={},calls=[];
  for(const id of ['identityLoadingPane','identifyPane','printerPane','changeUserButton','welcomeText','usernameInput'])elements[id]={innerHTML:'',textContent:'',classList:{add(c){this[c]=true},remove(c){this[c]=false},toggle(c,v){this[c]=v}},focus(){}};
  const context={console,setTimeout,clearTimeout,window:{addEventListener:(event,fn)=>events[event]=fn},document:{addEventListener(){},getElementById:id=>elements[id],querySelectorAll:()=>[]},PassKioskBridge:{mode:async()=>mode,signInUrl:async()=> 'https://script.google.com/macros/s/TEST/exec?bridge=1',ready:async()=>calls.push('ready'),reconnect:async()=>calls.push('reconnect')}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../js/app-core.js','utf8'),context);
  context.esc=context.attr=v=>String(v);context.toast=()=>{};context.getDeviceId=()=> 'TEST';context.loadingHtml=v=>v;
  context.renderFrontPrinters=()=>calls.push('printers');
  context.server=async fn=>{calls.push(fn);return fn==='getAuthenticatedProfile'?{ok:true,username:'AUTHENTICATED',displayName:'Signed-in adult'}:{printers:[]}};
  return {context,elements,calls,events,run:s=>vm.runInContext(s,context)};
}
test('staff sees Google sign-in before backend calls and no identity picker',async()=>{
  const f=fixture();await f.context.init();assert.deepEqual(f.calls,[]);
  assert.match(f.elements.identityLoadingPane.innerHTML,/Continue with Google/);
  assert.match(f.elements.identityLoadingPane.innerHTML,/0.3.18-visible-signin/);
  assert.equal(f.elements.identifyPane.classList.hidden,true);
  await f.context.completeStaffSignIn();
  assert.deepEqual(f.calls,['reconnect','getAuthenticatedProfile','getFrontDoorConfig','printers']);
  assert.equal(f.run('state.identified.username'),'AUTHENTICATED');
  assert.equal(f.elements.identifyPane.classList.hidden,true);
  assert.equal(f.elements.changeUserButton.classList.hidden,true);
});
test('denied account never reaches printer selection or username entry',async()=>{
  const f=fixture();await f.context.init();f.context.server=async()=>{throw new Error('Your CCSD account is not active in PassKiosk.')};
  await f.context.completeStaffSignIn();assert.match(f.elements.identityLoadingPane.innerHTML,/not active/);
  assert.equal(f.elements.printerPane.classList.hidden,true);assert.equal(f.elements.identifyPane.classList.hidden,true);
});
test('unreachable connection gives sign-in recovery, not an identity fallback',async()=>{
  const f=fixture();await f.context.init();f.context.PassKioskBridge.reconnect=async()=>{throw new Error('PassKiosk backend did not respond.')};
  await f.context.completeStaffSignIn();assert.match(f.elements.identityLoadingPane.innerHTML,/privacy settings or the school network/);
  assert.equal(f.elements.identifyPane.classList.hidden,true);
});
test('managed unattended kiosk retains its separate authorized identity path',async()=>{
  const f=fixture('kiosk');await f.context.init();assert.deepEqual(f.calls,['ready','getFrontDoorConfig']);
  assert.equal(f.elements.identifyPane.classList.hidden,false);
});
test('reconnect clears a failed bridge boot rather than reusing a rejected promise',async()=>{
  const listeners={},frames=[],timers=[];
  const storage={getItem:()=>null,removeItem(){},setItem(){}};
  const c={URL,URLSearchParams,Map,Date,console,navigator:{},localStorage:storage,history:{},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},document:{body:{appendChild:f=>frames.push(f)},createElement:()=>({style:{},setAttribute(){},addEventListener(){},remove(){this.removed=true}})},window:{location:{hash:''},PASSKIOSK_CONFIG:{bridgeUrl:'https://script.google.com/macros/s/TEST/exec'},addEventListener:(event,fn)=>listeners[event]=fn}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../bridge.js','utf8'),c);
  const b=c.window.PassKioskBridge;const first=b.ready();await new Promise(setImmediate);timers[0]();await assert.rejects(first,/did not respond/);
  const retry=b.reconnect();await new Promise(setImmediate);assert.equal(frames.length,2);assert.equal(frames[0].removed,true);
  listeners.message({origin:'https://example.com',source:{},data:{channel:'PASSKIOSK_RPC_V1',type:'ready'}});
  listeners.message({origin:'https://script.google.com',source:{},data:{channel:'PASSKIOSK_RPC_V1',type:'ready'}});assert.equal(await retry,true);
  assert.match(await b.signInUrl(),/^https:\/\/script.google.com\//);
});
