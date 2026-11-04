(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEYS = { docs: 'janscob_docs_v1', draft: 'janscob_draft_v1', settings: 'janscob_settings_v1', sequence: 'janscob_seq_v1' };
  const defaults = {
    business: 'JANSCOB GADGETS',
    line1: 'PHONES | LAPTOPS | BLUETOOTH SPEAKERS',
    line2: 'ACCESSORIES | EXCHANGE | SMART WATCHES',
    address: 'UMUDIKE, UMUAHIA, ABIA STATE & GREGORY UNIVERSITY, UTURU, ABIA STATE',
    phones: '09074910540, 09133549203',
    terms: 'PLEASE NOTE: NO REFUND AFTER PAYMENT',
    signature: ''
  };
  function read(key, fallback) { try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { notify('Storage is full. Please export your backup.'); return false; } }
  let docs = Array.isArray(read(KEYS.docs, [])) ? read(KEYS.docs, []) : [];
  let settings = { ...defaults, ...read(KEYS.settings, {}) };
  let seq = { receipt: 0, invoice: 0, ...read(KEYS.sequence, {}) };
  let editingId = null;
  let toastTimer;
  let installPrompt = null;

  function localISO() { const d=new Date(); const offset=d.getTimezoneOffset(); return new Date(d.getTime()-offset*60000).toISOString().slice(0,10); }
  function newNumber(kind='receipt') { return `JG-${kind==='invoice'?'I':'R'}-${new Date().getFullYear()}-${String((Number(seq[kind])||0)+1).padStart(4,'0')}`; }
  function blank(kind='receipt') { return {kind,number:newNumber(kind),date:localISO(),dueDate:localISO(),customerName:'',customerPhone:'',customerAddress:'',items:[{desc:'',qty:1,rate:''}],discount:0,delivery:0,paymentMethod:'Cash',amountPaid:'',note:''}; }
  let draft = { ...blank(), ...read(KEYS.draft, {}) };
  if (!Array.isArray(draft.items)||!draft.items.length) draft.items=[{desc:'',qty:1,rate:''}];

  function amount(value) { const n=Number(value); return Number.isFinite(n) ? Math.max(0,n) : 0; }
  const round = x => Math.round((x + Number.EPSILON)*100)/100;
  const fmt = (n, decimals=0) => '₦' + Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:decimals,maximumFractionDigits:2});
  const num = (n) => Number(n||0).toLocaleString('en-NG',{maximumFractionDigits:2});
  function totals() { const subtotal=round(draft.items.reduce((s,i)=>s+Math.max(1,Math.floor(amount(i.qty)||1))*amount(i.rate),0)); const discount=Math.min(subtotal,amount(draft.discount)); const delivery=amount(draft.delivery); const total=round(subtotal-discount+delivery); const paid=draft.amountPaid==='' || draft.amountPaid==null ? (draft.kind==='receipt'?total:0) : amount(draft.amountPaid); return {subtotal,discount,delivery,total,paid,balance:round(Math.max(0,total-paid))}; }

  const below20=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
  const tens=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
  function under1000(n) { let words=[]; if(n>=100){words.push(below20[Math.floor(n/100)],'HUNDRED');n%=100;} if(n>=20){words.push(tens[Math.floor(n/10)]);n%=10;} if(n>0)words.push(below20[n]);return words.join(' '); }
  function integerWords(value) { let n=Math.floor(value); if(n===0)return 'ZERO'; if(n>=1e12)return num(n); const chunks=[['BILLION',1e9],['MILLION',1e6],['THOUSAND',1e3],['',1]]; let out=[];for(const [label,size] of chunks){const chunk=Math.floor(n/size);if(chunk){out.push(under1000(chunk)+(label?' '+label:''));n%=size;}}return out.join(' '); }
  function nairaWords(value){const naira=Math.floor(value),kobo=Math.round((value-naira)*100);return `${integerWords(naira)} NAIRA${kobo?' AND '+integerWords(kobo)+' KOBO':''} ONLY`;}
  function longDate(iso){if(!iso)return '—';const [y,m,d]=iso.split('-').map(Number);if(!y||!m||!d)return iso;return new Date(y,m-1,d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}).toUpperCase();}
  function notify(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3100);}
  function persistDraft(){write(KEYS.draft,draft);}
  function mode(kind){if(draft.kind===kind)return;if(editingId){editingId=null;notify('Created an unsaved copy in the new format');}draft.kind=kind;draft.number=newNumber(kind);document.querySelectorAll('.mode-switch button').forEach(b=>b.classList.toggle('selected',b.dataset.kind===kind));$('invoiceFields').classList.toggle('visible',kind==='invoice');$('paperInvoiceExtra').classList.toggle('visible',kind==='invoice');$('docNo').value=draft.number;render();persistDraft();}
  function renderEditor(){
    const fieldMap={docNo:'number',docDate:'date',customerName:'customerName',customerPhone:'customerPhone',dueDate:'dueDate',customerAddress:'customerAddress',discount:'discount',delivery:'delivery',paymentMethod:'paymentMethod',amountPaid:'amountPaid',customNote:'note'};
    for(const [id,key] of Object.entries(fieldMap)) $(id).value=draft[key]??'';
    document.querySelectorAll('.mode-switch button').forEach(b=>b.classList.toggle('selected',b.dataset.kind===draft.kind));
    $('invoiceFields').classList.toggle('visible',draft.kind==='invoice');
    $('paperInvoiceExtra').classList.toggle('visible',draft.kind==='invoice');
    const list=$('itemsEditor'); list.replaceChildren();
    draft.items.forEach((item,index)=>{
      const fragment=$('itemTemplate').content.cloneNode(true);
      const el=fragment.querySelector('.item-editor');el.dataset.index=index;
      fragment.querySelector('.item-count').textContent='ITEM '+String(index+1).padStart(2,'0');
      fragment.querySelector('.item-desc').value=item.desc??'';
      fragment.querySelector('.item-qty').value=item.qty??1;
      fragment.querySelector('.item-rate').value=item.rate??'';
      fragment.querySelector('.delete-item').hidden=draft.items.length===1;
      list.append(fragment);
    });
    render();
  }
  function render(){
    const t=totals();
    $('editorTotal').textContent=fmt(t.total,2);$('editorBalance').textContent=fmt(t.balance,2);
    document.querySelectorAll('.item-editor').forEach((el,i)=>{const item=draft.items[i];if(item)el.querySelector('.item-amount strong').textContent=fmt(Math.max(1,Math.floor(amount(item.qty)||1))*amount(item.rate));});
    $('paperKind').textContent=draft.kind==='invoice'?'SALES INVOICE':'CASH RECEIPT';
    $('numberLabel').textContent=draft.kind==='invoice'?'Invoice No:':'Receipt No:';
    $('paperName').textContent=draft.customerName.trim()||'—';
    $('paperPhone').textContent=draft.customerPhone.trim()||'—';
    $('paperNumber').textContent=draft.number||'—';
    $('paperDate').textContent=longDate(draft.date);
    $('paperAddress').textContent=draft.customerAddress.trim()||'—';
    $('paperDue').textContent=longDate(draft.dueDate);
    const businessName=settings.business.toUpperCase();
    $('paperBusiness').textContent=businessName;
    $('paperBusiness').hidden=businessName==='JANSCOB GADGETS';
    $('paperLine1').textContent=settings.line1;
    $('paperLine2').textContent=settings.line2;
    $('paperLocations').textContent=settings.address;
    $('paperPhones').textContent=settings.phones;
    $('paperTerms').textContent=settings.terms;
    $('paperWords').textContent=nairaWords(t.total);
    $('paperGrandTotal').textContent=(draft.kind==='invoice'?'Grand total':'Total')+'   '+fmt(t.total);
    $('paperExtraNote').textContent='Payment: '+draft.paymentMethod+(draft.note?.trim()?'  •  '+draft.note.trim():'');
    const container=$('paperItems'); container.replaceChildren();
    draft.items.forEach(item=>{
      const row=document.createElement('tr');
      const values=[String(Math.max(1,Math.floor(amount(item.qty)||1))),item.desc||'',num(amount(item.rate)),num((Math.max(1,Math.floor(amount(item.qty)||1)))*amount(item.rate))];
      values.forEach((value,index)=>{const cell=document.createElement('td');cell.className=['qty-cell','desc-cell','rate-cell','amount-cell'][index];cell.textContent=value;row.append(cell);});
      container.append(row);
    });
    for(let i=draft.items.length;i<9;i++){const row=document.createElement('tr');row.className='blank';for(let j=0;j<4;j++)row.append(document.createElement('td'));container.append(row);}
    const lines=$('paperTotals');lines.replaceChildren();
    const addLine=(label,value,important=false)=>{const div=document.createElement('div');div.className='paper-total-line'+(important?' important':'');const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=fmt(value);div.append(a,b);lines.append(div);};
    if(t.discount>0 || t.delivery>0 || draft.kind==='invoice'){
      addLine('Subtotal',t.subtotal);
      if(t.discount) addLine('Discount',-t.discount);
      if(t.delivery) addLine('Other charges',t.delivery);
      if(draft.kind==='invoice'){addLine('Amount paid',t.paid);addLine('Balance due',t.balance,true);}
      else if(t.paid<t.total){addLine('Amount paid',t.paid);addLine('Balance',t.balance,true);}
    } else if(t.paid<t.total){addLine('Amount paid',t.paid);addLine('Balance',t.balance,true);}
    const sig=$('ceoSignature');sig.replaceChildren();if(settings.signature){const img=new Image();img.src=settings.signature;img.alt='CEO signature';sig.append(img);}
    resizePaper();
  }
  function resizePaper(){
    const stage=$('paperStage'), paper=$('receiptPaper'),wrap=paper.parentElement;
    if(!stage||!wrap||!wrap.classList.contains('paper-wrapper'))return;
    const scale=Math.min(1,Math.max(.25,(stage.clientWidth-28)/794));
    paper.style.transform=`scale(${scale})`;
    wrap.style.width=`${794*scale}px`;
    wrap.style.height=`${1123*scale}px`;
  }
  function updateItem(e){const editor=e.target.closest('.item-editor');if(!editor)return;const i=Number(editor.dataset.index);if(!draft.items[i])return;if(e.target.matches('.item-desc'))draft.items[i].desc=e.target.value;if(e.target.matches('.item-qty'))draft.items[i].qty=e.target.value;if(e.target.matches('.item-rate'))draft.items[i].rate=e.target.value;render();persistDraft();}
  function switchView(view){document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===view+'View'));document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('pageBreadcrumb').textContent=({create:'CREATE DOCUMENT',history:'SAVED DOCUMENTS',settings:'BRAND SETTINGS'})[view];if(view==='history')renderHistory();if(view==='settings')renderSettings();window.scrollTo({top:0,behavior:'smooth'});}
  function newDocument(ask=true){const edited=Boolean(draft.customerName||draft.items.some(i=>i.desc));if(ask&&edited&&!confirm('Start a new document? Save your current document first if you need it.'))return;editingId=null;draft=blank(draft.kind);renderEditor();persistDraft();switchView('create');notify('New document ready');}
  function saveDocument(){
    if(!draft.customerName.trim()){notify('Enter the customer name first.');$('customerName').focus();return;}
    if(!draft.items.some(i=>i.desc.trim()&&amount(i.rate)>0)){notify('Add at least one item with a price.');return;}
    if(!draft.number.trim()){notify('Enter a document number.');$('docNo').focus();return;}
    const conflict=docs.find(d=>d.number===draft.number && d.id!==editingId);
    if(conflict){notify('That document number is already in use.');return;}
    const now=new Date().toISOString(), item={...draft,id:editingId||('doc_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),updatedAt:now,createdAt:docs.find(d=>d.id===editingId)?.createdAt||now};
    const existingIndex=docs.findIndex(d=>d.id===item.id);
    if(existingIndex>=0)docs[existingIndex]=item;
    else {docs.unshift(item);seq[draft.kind]=(Number(seq[draft.kind])||0)+1;write(KEYS.sequence,seq);}
    if(write(KEYS.docs,docs)){editingId=item.id;notify(draft.kind==='invoice'?'Invoice saved successfully':'Receipt saved successfully');}
  }
  function actionButton(text,handler,className=''){const button=document.createElement('button');button.textContent=text;button.className=className;button.addEventListener('click',handler);return button;}
  function renderHistory(){const query=$('historySearch').value.toLowerCase().trim(),kind=$('historyFilter').value;const list=$('historyList');list.replaceChildren();const matches=docs.filter(d=>(kind==='all'||d.kind===kind)&&[d.customerName,d.customerPhone,d.number].some(v=>(v||'').toLowerCase().includes(query))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    if(!matches.length){const empty=document.createElement('div');empty.className='empty-state';empty.innerHTML='<div class="empty-icon">▤</div><h3>No documents found</h3><p>Create your first receipt or change the search.</p>';list.append(empty);return;}
    for(const d of matches){const row=document.createElement('div');row.className='history-row';const icon=document.createElement('div');icon.className='history-icon';icon.textContent=d.kind==='invoice'?'▤':'▥';const person=document.createElement('div');person.className='history-person';const name=document.createElement('strong');name.textContent=d.customerName;const detail=document.createElement('small');detail.textContent=`${d.number} · ${d.kind==='invoice'?'Invoice':'Receipt'}`;person.append(name,detail);const date=document.createElement('div');date.className='history-detail date-detail';const dateText=document.createElement('strong');dateText.textContent=longDate(d.date);date.append(dateText);const value=document.createElement('div');value.className='history-detail';const amountText=document.createElement('strong');const sub=d.items.reduce((n,i)=>n+amount(i.qty)*amount(i.rate),0);amountText.textContent=fmt(Math.max(0,sub-amount(d.discount))+amount(d.delivery));value.append(amountText);const actions=document.createElement('div');actions.className='history-actions';actions.append(actionButton('Open',()=>openDoc(d.id)),actionButton('Copy',()=>duplicateDoc(d.id)),actionButton('×',()=>deleteDoc(d.id),'delete'));row.append(icon,person,date,value,actions);list.append(row);}
  }
  function openDoc(id){const d=docs.find(x=>x.id===id);if(!d)return;editingId=id;draft=JSON.parse(JSON.stringify(d));renderEditor();persistDraft();switchView('create');notify('Document loaded');}
  function duplicateDoc(id){const d=docs.find(x=>x.id===id);if(!d)return;editingId=null;draft={...JSON.parse(JSON.stringify(d)),number:newNumber(d.kind),date:localISO()};delete draft.id;delete draft.createdAt;delete draft.updatedAt;renderEditor();persistDraft();switchView('create');notify('Copy created — save to keep it');}
  function deleteDoc(id){const d=docs.find(x=>x.id===id);if(!d||!confirm(`Delete ${d.number}? This cannot be undone.`))return;docs=docs.filter(x=>x.id!==id);write(KEYS.docs,docs);if(editingId===id){editingId=null;draft=blank();renderEditor();persistDraft();}renderHistory();notify('Document deleted');}
  function renderSettings(){const fields={settingBusiness:'business',settingLine1:'line1',settingLine2:'line2',settingAddress:'address',settingPhones:'phones',settingTerms:'terms'};for(const [id,key] of Object.entries(fields))$(id).value=settings[key]||'';const el=$('signaturePreview');el.replaceChildren();if(settings.signature){const img=new Image();img.src=settings.signature;el.append(img);}else el.textContent='No signature uploaded';}
  function saveSettings(){const fields={settingBusiness:'business',settingLine1:'line1',settingLine2:'line2',settingAddress:'address',settingPhones:'phones',settingTerms:'terms'};for(const [id,key] of Object.entries(fields))settings[key]=$(id).value.trim();write(KEYS.settings,settings);render();notify('Brand details saved');}
  function download(name,contents,mime){const blob=new Blob([contents],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function exportBackup(){download('janscob-gadgets-backup-'+localISO()+'.json',JSON.stringify({app:'Janscob Receipt Studio',version:1,exportedAt:new Date().toISOString(),docs,settings,sequence:seq},null,2),'application/json');notify('Backup downloaded');}
  async function importBackup(file){if(!file)return;if(file.size>5e6){notify('Backup file is too large.');return;}let data;try{data=JSON.parse(await file.text());}catch{notify('Not a valid JSON file.');return;}if(data.app!=='Janscob Receipt Studio'||!Array.isArray(data.docs)||typeof data.settings!=='object'){notify('This is not a Janscob backup.');return;}if(!confirm(`Import ${data.docs.length} documents? This will replace this device’s saved documents and brand settings.`))return;docs=data.docs.filter(d=>d&&typeof d.id==='string'&&Array.isArray(d.items)&&typeof d.number==='string');settings={...defaults,...data.settings};seq={receipt:0,invoice:0,...data.sequence};write(KEYS.docs,docs);write(KEYS.settings,settings);write(KEYS.sequence,seq);newDocument(false);renderSettings();notify('Backup imported successfully');}
  async function printDoc(){if(!draft.items.some(i=>i.desc.trim())){notify('Add at least one item before printing.');return;}if(draft.items.length>8)notify('For best A4 printing, use 8 items or fewer.');window.print();}
  function summaryText(){const t=totals();return `${settings.business.toUpperCase()}\n${draft.kind==='invoice'?'SALES INVOICE':'CASH RECEIPT'} · ${draft.number}\nDate: ${longDate(draft.date)}\nCustomer: ${draft.customerName||'—'}\n${draft.items.map(i=>`${i.qty||1} × ${i.desc.replaceAll('\n',' — ')}: ${fmt(amount(i.qty)*amount(i.rate))}`).join('\n')}\nTOTAL: ${fmt(t.total,2)}\n${draft.kind==='invoice'?'BALANCE DUE: '+fmt(t.balance,2)+'\n':''}${settings.phones}`;}
  async function shareDoc(){const text=summaryText();if(navigator.share){try{await navigator.share({title:`Janscob ${draft.kind} ${draft.number}`,text});return;}catch(err){if(err.name==='AbortError')return;}}try{await navigator.clipboard.writeText(text);notify('Details copied — paste into WhatsApp');}catch{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();notify('Details copied to clipboard');}}
  function setup(){
    const wrapper=document.createElement('div');wrapper.className='paper-wrapper';const paper=$('receiptPaper');paper.parentNode.insertBefore(wrapper,paper);wrapper.append(paper);
    const wm=$('watermark');for(let i=0;i<45;i++){const row=document.createElement('span');row.textContent=('JANSCOB GADGETS  ').repeat(10);wm.append(row);}
    document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>mode(b.dataset.kind)));
    const fields={docNo:'number',docDate:'date',customerName:'customerName',customerPhone:'customerPhone',dueDate:'dueDate',customerAddress:'customerAddress',discount:'discount',delivery:'delivery',paymentMethod:'paymentMethod',amountPaid:'amountPaid',customNote:'note'};
    for(const [id,key] of Object.entries(fields))$(id).addEventListener('input',e=>{draft[key]=e.target.value;render();persistDraft();});
    $('itemsEditor').addEventListener('input',updateItem);
    $('itemsEditor').addEventListener('click',e=>{if(!e.target.classList.contains('delete-item'))return;const i=Number(e.target.closest('.item-editor').dataset.index);if(draft.items.length<2)return;draft.items.splice(i,1);renderEditor();persistDraft();});
    $('addItem').addEventListener('click',()=>{if(draft.items.length>=8){notify('Maximum 8 items per A4 document.');return;}draft.items.push({desc:'',qty:1,rate:''});renderEditor();persistDraft();$('itemsEditor').lastElementChild.querySelector('.item-desc').focus();});
    $('saveDoc').addEventListener('click',saveDocument);$('clearDoc').addEventListener('click',()=>newDocument(true));$('topNew').addEventListener('click',()=>newDocument(true));
    $('printDoc').addEventListener('click',printDoc);$('shareDoc').addEventListener('click',shareDoc);
    $('expandPreview').addEventListener('click',()=>{const expanded=$('previewPanel').classList.toggle('expanded');$('expandPreview').innerHTML=expanded?'× <span>Close</span>':'⛶ <span>Expand</span>';document.body.style.overflow=expanded?'hidden':'';resizePaper();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('previewPanel').classList.contains('expanded'))$('expandPreview').click();});
    $('historySearch').addEventListener('input',renderHistory);$('historyFilter').addEventListener('change',renderHistory);
    $('saveSettings').addEventListener('click',saveSettings);
    $('signatureUpload').addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>7e6){notify('Please choose an image below 7 MB.');return;}const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');const factor=Math.min(1,500/img.width,160/img.height);canvas.width=Math.round(img.width*factor);canvas.height=Math.round(img.height*factor);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);settings.signature=canvas.toDataURL('image/png');renderSettings();render();notify('Signature ready — tap Save brand settings');};img.src=URL.createObjectURL(file);});
    $('removeSignature').addEventListener('click',()=>{settings.signature='';renderSettings();render();notify('Signature removed — save settings to keep change');});
    $('exportBackup').addEventListener('click',exportBackup);$('importBackup').addEventListener('change',e=>{importBackup(e.target.files?.[0]);e.target.value='';});
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
    $('installApp').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notify('Android: Chrome menu → Add to Home screen. iPhone: Share → Add to Home Screen.');});
    $('todayLabel').textContent=new Date().toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    window.addEventListener('resize',resizePaper);
    renderEditor();renderSettings();resizePaper();
    if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
  setup();
})();
