/* PDF delivery is advertised by the installed backend, never enabled locally. */
async function enterEmailPassKiosk(){
  if(state.submitting)return;
  state.submitting=true;
  try{
    const res=await server('startEmailSession',state.identified.username,state.deviceId);
    if(!res||res.ok!==true||!res.token||!res.pdfEmail?.enabled||!res.pdfEmail.recipient)throw new Error('Email session could not be verified.');
    const bootstrap=await server('getBootstrapData',res.token);
    state.token=res.token;state.bootstrap=bootstrap;state.session=bootstrap.session;
    state.currentPrinter=res.printer;state.pdfEmail=res.pdfEmail;state.outputMode='EMAIL';
    initializeLaneValues();
    document.getElementById('front').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    updateContext();selectLane(null);
    toast('PDFs will be emailed to '+res.pdfEmail.recipient);
  }catch(err){toast(err.message||'Email sign-in failed.',true)}
  finally{state.submitting=false}
}

function emailSubmissionRequest(request){
  const count=request.studentIds?.length||(request.studentId?1:0);
  if(count>(state.pdfEmail?.maxStudents||100))throw new Error('Email supports up to '+(state.pdfEmail?.maxStudents||100)+' students per submission. Split this basket into smaller batches. Nothing has been submitted.');
  const id=crypto.randomUUID();
  return {...request,emailRequestId:id};
}

function emailStatusText(delivery){
  const status=delivery?.status||'UNKNOWN';
  const labels={SENT:'PDF submitted for email delivery',FAILED:'Recorded — PDF email needs attention',
    SEND_UNCONFIRMED:'Recorded — email delivery not confirmed',RECORDING:'Recording in progress',
    RECORDING_UNCONFIRMED:'Recording not confirmed',PREPARING:'Recorded — creating PDF',
    READY:'Recorded — PDF delivery pending',SENDING:'Recorded — submitting email',NOT_CREATED:'No authorization recorded'};
  return labels[status]||'Check email delivery status';
}

function showPdfEmailOutcome(delivery){
  const box=document.getElementById('emailDeliveryNotice');
  if(!box)return;
  const warning=!delivery||['FAILED','SEND_UNCONFIRMED','RECORDING_UNCONFIRMED'].includes(delivery.status);
  box.className='email-notice'+(warning?' warning':'');
  box.innerHTML=`<strong>${esc(emailStatusText(delivery))}</strong><div class="small">${esc(delivery?.recipient||state.pdfEmail?.recipient||'')}</div><div class="small">${esc(delivery?.message||'Open Settings → Email Delivery to check the original submission before retrying.')}</div>${delivery?.deliveryId?`<div class="small muted">${esc(delivery.deliveryId)}</div>`:''}<button class="secondary" onclick="selectLane('SETTINGS')">Email Delivery</button>`;
}

function emailSettingsHtml(){
  if(!state.pdfEmail?.enabled)return '';
  return `<div class="card"><h2>PDF Email</h2><div class="small muted">Letter-size PDFs go to your session email: <strong>${esc(state.pdfEmail.recipient)}</strong>. Bulk PDFs include each student and an error report when needed. Up to ${esc(state.pdfEmail.maxStudents||100)} students per email.</div><div class="submit-row"><button class="${state.outputMode==='EMAIL'?'primary':'secondary'}" onclick="selectEmailOutput()">${state.outputMode==='EMAIL'?'PDF email selected':'Use PDF email'}</button></div></div><div class="card"><h2>Email Delivery — Last Hour</h2><p class="small muted">Delivery retries reuse saved transactions. Google Mail acceptance does not confirm arrival in your inbox. Unconfirmed sends are never automatically resent.</p><button class="secondary" onclick="loadRecentPdfEmails()">Refresh status</button><div id="recentPdfEmails"><div class="small muted">Loading…</div></div></div>`;
}

async function selectEmailOutput(){
  if(state.submitting||state.busWritePending)return toast('Wait for the current submission.',true);
  const token=state.token;
  try{
    const config=await server('getPdfEmailConfig',token);
    if(state.token!==token)return;
    if(!config?.enabled||!config.recipient)throw new Error(config?.message||'PDF email is unavailable.');
    state.pdfEmail=config;state.outputMode='EMAIL';updateContext();await renderSettings();
    toast('PDF email selected');
  }catch(err){toast(err.message,true)}
}

async function loadRecentPdfEmails(){
  const box=document.getElementById('recentPdfEmails'),token=state.token;
  if(!box||!state.pdfEmail?.enabled)return;
  try{
    const rows=await server('getRecentPdfEmails',token,state.deviceId);
    if(!box.isConnected||state.token!==token)return;
    if(!Array.isArray(rows))throw new Error('Email delivery response could not be verified.');
    box.innerHTML=rows.length?rows.map(d=>`<div class="email-job"><strong>${esc(emailStatusText(d))}</strong><div class="small">${esc(d.recipient)} · ${esc(d.deliveryId)}</div><div class="small">${esc(d.message||'')}</div>${d.canRetry&&['READY','FAILED'].includes(d.status)?`<button class="secondary" onclick="retrySavedPdfEmail('${attr(d.deliveryId)}',this)">Retry email only</button>`:''}</div>`).join(''):'<p class="small muted">No email submissions from this user and device in the last hour.</p>';
  }catch(err){if(box.isConnected)box.innerHTML=`<p class="small" style="color:var(--danger)">${esc(err.message)}</p>`}
}

async function retrySavedPdfEmail(id,button){
  const token=state.token;
  if(button){button.disabled=true;button.textContent='Retrying email…'}
  try{
    const delivery=await server('retryPdfEmail',token,state.deviceId,id);
    if(state.token!==token)return;
    showPdfEmailOutcome(delivery);await loadRecentPdfEmails();
  }catch(err){toast((err.message||'Email retry was interrupted.')+' Refresh email status before retrying.',true,7000)}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Retry email only'}}
}
