const DOWNLOAD_DESTINATIONS={DL_PDF_HALF:'DL PDF ½ Sheet',DL_PDF_QUARTER:'DL PDF ¼ Sheet'};
function isPdfDestination(key){return Object.hasOwn(DOWNLOAD_DESTINATIONS,key)}
function pdfBatchStorageKey(){return 'passkiosk-pdf-batch:'+state.session.username}
function loadPdfBatch(){try{const data=JSON.parse(localStorage.getItem(pdfBatchStorageKey())||'[]');state.pdfBatch=Array.isArray(data)?data.filter(x=>x&&typeof x.id==='string').slice(0,400):[]}catch(_){state.pdfBatch=[]}}
function savePdfBatch(){try{localStorage.setItem(pdfBatchStorageKey(),JSON.stringify(state.pdfBatch||[]))}catch(_){toast('PDF batch is available in this session; this browser could not save it.',true)}}
function newOutputRequestId(){return crypto.randomUUID()}
function pdfAddRequest(request){
  const fingerprint=JSON.stringify(request);
  if(state.pendingPdfAdd&&state.pendingPdfAdd.fingerprint!==fingerprint)throw new Error('The previous PDF Add is unconfirmed. Retry its original settings or check Transactions before starting another.');
  if(state.pendingPdfAdd?.fingerprint!==fingerprint)state.pendingPdfAdd={fingerprint,id:newOutputRequestId()};
  return {...request,outputRequestId:state.pendingPdfAdd.id};
}
function acceptPdfAdd(result,workflow){
  const created=result.transactionId?[{transactionId:result.transactionId,studentName:result.studentName}]:result.created||[];
  state.pdfBatch||=[];
  for(const row of created){
    for(const id of [row.transactionId,row.pickupTransactionId].filter(Boolean)){
      if(!state.pdfBatch.some(x=>x.id===id))state.pdfBatch.push({id,name:row.studentName||id,workflow:id===row.pickupTransactionId?'RQST':workflow});
    }
  }
  state.pendingPdfAdd=null;savePdfBatch();refreshPdfBatchStatus();
}
function pdfBatchStatusHtml(){const count=state.pdfBatch?.length||0;return '<div id="pdfBatchStatus" class="small muted" role="status">'+count+' pass'+(count===1?'':'es')+' in PDF batch'+(count?' · <button type="button" class="secondary" onclick="showPdfBatch()">Review batch</button>':'')+'</div>'}
function refreshPdfBatchStatus(){const box=document.getElementById('pdfBatchStatus');if(box)box.outerHTML=pdfBatchStatusHtml()}
function showPdfBatch(){
  const box=document.getElementById('pdfBatchReview');if(!box)return;
  box.classList.remove('hidden');
  box.innerHTML='<h3>PDF batch</h3><div class="small muted">Removing a pass here only removes it from the download; its recorded transaction remains.</div>'+(state.pdfBatch||[]).map(x=>'<div class="pdf-batch-item"><span>'+esc(workflowLabel(x.workflow))+' · '+esc(x.name)+'</span><button type="button" class="secondary" onclick="removePdfBatchItem(\''+attr(x.id)+'\')">Remove</button></div>').join('')+'<button type="button" class="secondary" onclick="hidePdfBatch()">Close</button>';
}
function hidePdfBatch(){document.getElementById('pdfBatchReview')?.classList.add('hidden')}
function removePdfBatchItem(id){if(state.pdfDownloadBusy||state.submitting)return;state.pdfBatch=(state.pdfBatch||[]).filter(x=>x.id!==id);savePdfBatch();showPdfBatch();refreshPdfBatchStatus()}

/** Assemble approved page streams as isolated Form XObjects on US Letter. */
async function buildBatchPdf(transactions,key,{filing=false}={}){
  if(!isPdfDestination(key))throw new Error('Choose a PDF download size.');
  if(!transactions.length)throw new Error('There are no saved passes to download.');
  const quarter=key==='DL_PDF_QUARTER',slots=quarter?4:2,width=quarter?306:612,height=396;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const add=x=>{objects.push(x);return objects.length},pages=[],signatureCache=new Map();
  let forms=[],lastWorkflow='';
  function finishPage(){
    if(!forms.length)return;
    let stream='',resources='';
    forms.forEach((id,i)=>{
      const x=quarter?(i%2)*width:0,y=792-(Math.floor(i/(quarter?2:1))+1)*height;
      resources+='/P'+i+' '+id+' 0 R ';
      stream+='q 1 0 0 1 '+x+' '+y+' cm /P'+i+' Do Q\n';
    });
    const content=add('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
    pages.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << '+resources+'>> >> /Contents '+content+' 0 R >>'));
    forms=[];
  }
  for(const original of transactions){
    if(forms.length===slots||(!filing&&lastWorkflow&&lastWorkflow!==original.Workflow))finishPage();
    lastWorkflow=original.Workflow;const tx={...original};
    if(tx['Signature File']&&signatureCache.has(tx['Signature File']))tx['Signature Raster']=signatureCache.get(tx['Signature File']);
    else if(tx['Signature Payload']){
      const cacheKey=tx['Signature File']||tx['Signature Payload'].base64;
      if(!signatureCache.has(cacheKey))signatureCache.set(cacheKey,await PKPassPdf.rasterizeSignature(tx['Signature Payload']));
      tx['Signature Raster']=signatureCache.get(cacheKey);
    }else if(tx['Signature File'])throw new Error('Stored signature image is missing for '+tx['Student Name']+'.');
    let page;
    try{page=PKPassPdf.buildPassKioskPdf(tx,quarter?'PDF_QUARTER':'PDF_HALF')}
    catch(err){throw new Error((tx['Student Name']||'Pass')+': '+err.message+(quarter?' Choose DL PDF ½ Sheet for more space.':''))}
    let imageResource='';
    if(page.signatureRaster){
      const image=page.signatureRaster,encoded=image.grayHex+'>';
      const imageId=add('<< /Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length '+(encoded.length+1)+' >>\nstream\n'+encoded+'\nendstream');
      imageResource='/XObject << /Sig '+imageId+' 0 R >>';
    }
    const content=page.pageContent;
    forms.push(add('<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 '+width+' '+height+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> '+imageResource+' >> /Length '+content.length+' >>\nstream\n'+content+'endstream'));
  }
  finishPage();objects[1]='<< /Type /Pages /Kids ['+pages.map(x=>x+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n'});
  const xref=pdf.length;pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  offsets.slice(1).forEach(x=>pdf+=String(x).padStart(10,'0')+' 00000 n \n');
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return {bytes:new TextEncoder().encode(pdf),pageCount:pages.length,count:transactions.length};
}
function offerPdfDownload(pdf,filename){
  if(state.pdfObjectUrl)URL.revokeObjectURL(state.pdfObjectUrl);
  state.pdfObjectUrl=URL.createObjectURL(new Blob([pdf.bytes],{type:'application/pdf'}));
  const box=document.getElementById('pdfDownloadResult');if(!box)throw new Error('Download area is unavailable.');
  box.classList.remove('hidden');box.innerHTML='<a class="primary" href="'+attr(state.pdfObjectUrl)+'" download="'+attr(filename)+'" target="_self">Download PDF · '+pdf.count+' passes · '+pdf.pageCount+' pages</a><div class="small muted">Your batch stays available until you remove its items.</div>';
  box.querySelector('a').click();
}
async function downloadPdfBatch(){
  if(state.pdfDownloadBusy||state.submitting||state.busWritePending)return;
  const ids=(state.pdfBatch||[]).map(x=>x.id),key=selectedLanePrinterKey();
  if(!ids.length)return toast('Add passes with + first.',true);
  const token=state.token;state.pdfDownloadBusy=true;
  try{toast('Preparing '+ids.length+' saved passes…');const result=await server('getPdfBatch',token,ids);
    if(state.token!==token)return;if(!result?.ok||!Array.isArray(result.transactions))throw new Error('PDF batch could not be verified.');
    const pdf=await buildBatchPdf(result.transactions,key);offerPdfDownload(pdf,'PassKiosk-'+(key==='DL_PDF_QUARTER'?'quarter':'half')+'.pdf');
  }catch(err){toast('PDF not downloaded. '+err.message,true,8000)}finally{state.pdfDownloadBusy=false}
}

function filingSettingsHtml(){
  const key=state.outputPreferences?.filingPrinterKey||'AP_COPIER';
  let choices=(state.bootstrap.printers||[]).map(p=>'<option value="'+attr(p.key)+'" '+(p.key===key?'selected':'')+'>'+esc(p.friendlyName)+'</option>').join('');
  choices+=Object.entries(DOWNLOAD_DESTINATIONS).map(([k,label])=>'<option value="'+k+'" '+(k===key?'selected':'')+'>'+label+'</option>').join('');
  if(!printerForKey(key))choices='<option value="" selected>Select a filing printer</option>'+choices;
  return '<div class="card"><h2>Detention filing</h2><p class="small muted">All lunch and after-school detention notices created today, sorted by grade, last name, then first name. Assigned dates do not affect this list.</p><label class="form-action-label">Filing printer <select class="field" id="filingPrinter" onchange="saveFilingPrinter(this.value)">'+choices+'</select></label><button type="button" class="primary" id="filingButton" onclick="downloadTodaysFiling()">Download Today’s Detentions for Filing</button><div id="filingResult" role="status" class="small muted">Physical destinations queue filing copies. PDF destinations download a file.</div></div>';
}
async function saveFilingPrinter(key){
  if(state.filingBusy)return;state.filingBusy=true;
  const button=document.getElementById('filingButton');if(button)button.disabled=true;
  try{const result=await server('saveOutputPreference',state.token,'FILING',{printerKey:key});state.outputPreferences=result.outputPreferences;state.filingRequest=null;toast('Filing printer saved.')}
  catch(err){toast(err.message,true);const selector=document.getElementById('filingPrinter');if(selector)selector.value=state.outputPreferences?.filingPrinterKey||'AP_COPIER'}
  finally{state.filingBusy=false;if(button)button.disabled=false}
}
async function downloadTodaysFiling(){
  if(state.filingBusy)return;const key=document.getElementById('filingPrinter').value;
  if(!printerForKey(key))return toast('Choose a filing destination.',true);
  const token=state.token;state.filingBusy=true;const button=document.getElementById('filingButton');button.disabled=true;
  try{
    if(isPdfDestination(key)){
      const result=await server('getTodaysDetentions',token);if(state.token!==token)return;
      if(!result.transactions.length)return toast('No detention notices were created today.');
      const pdf=await buildBatchPdf(result.transactions,key,{filing:true});offerPdfDownload(pdf,'Detentions-for-filing-'+result.date+'.pdf');
      document.getElementById('filingResult').textContent=result.transactions.length+' notices prepared in filing order.';
    }else{
      state.filingRequest||={key,id:newOutputRequestId()};
      const result=await server('printTodaysDetentions',token,key,state.filingRequest.id);if(state.token!==token)return;
      if(!result.ok)throw new Error('Filing queue could not be verified.');
      document.getElementById('filingResult').textContent=result.count+' filing copies queued to '+printerForKey(key).friendlyName+'.';
      toast(result.count+' filing copies queued.');state.filingRequest=null;
    }
  }catch(err){toast(err.message,true,8000)}finally{state.filingBusy=false;if(button.isConnected)button.disabled=false}
}
