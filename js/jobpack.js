
// ===== JOB PACK =====
const JOB_PACK_FORMS = [
  { id:'job-info',     group:'Job Prep',         icon:'📋', name:'Job Pack Information',          desc:'Job header — client, quote, test & article description, task lines' },
  { id:'receiving',    group:'Job Prep',         icon:'📦', name:'Receiving Checklist',            desc:'10-step receiving procedure with initials column' },
  { id:'test-log',     group:'Job Prep',         icon:'📝', name:'Test Log',                       desc:'Running log of test events with lab conditions' },
  { id:'shock-weight', group:'Shock Testing',    icon:'⚖️',  name:'Shock Test Weight Breakdown',   desc:'Fixture & hardware weights — MIL-S-901D fixtures pre-listed' },
  { id:'shock-mwst',   group:'Shock Testing',    icon:'💥', name:'Medium Weight Shock Test',       desc:'NU Form #21-2 — blow-by-blow shock test data log' },
  { id:'shock-lwst',   group:'Shock Testing',    icon:'💥', name:'Light Weight Shock Test',        desc:'NU Data Sheet — blow-by-blow light weight shock test log' },
  { id:'vib-axis1',    group:'Vibration',        icon:'〰️', name:'Vibration Data Sheet — Axis 1', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'vib-axis2',    group:'Vibration',        icon:'〰️', name:'Vibration Data Sheet — Axis 2', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'vib-axis3',    group:'Vibration',        icon:'〰️', name:'Vibration Data Sheet — Axis 3', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'acoustic',     group:'Acoustic',         icon:'🔊', name:'Acoustic Noise Requirements',    desc:'Frequency data sheet 25–10,000 Hz with job info, inputs, and recorded levels' },
  { id:'photo-index',  group:'Documentation',    icon:'📷', name:'Digital Photograph Index Sheet', desc:'64-row photo log with index numbers and descriptions' },
  { id:'equip-list',   group:'Documentation',    icon:'🔧', name:'Test Equipment List',            desc:'NU Form #21-4 — calibrated instruments, asset IDs, cal dates' },
];
const JP_GROUPS = ['Job Prep','Shock Testing','Vibration','Acoustic','Documentation'];
const jobPackSelected = {};

async function loadJobPackState(projId) {
  if (!sb || !projId) return;
  try {
    const { data } = await sb.from('project_job_pack').select('selected_forms').eq('project_id', projId).single();
    jobPackSelected[projId] = new Set(data?.selected_forms || []);
  } catch(e) { jobPackSelected[projId] = new Set(); }
}

async function saveJobPackState(projId) {
  if (!sb || !projId) return;
  try {
    await sb.from('project_job_pack').upsert({
      project_id: projId,
      selected_forms: Array.from(jobPackSelected[projId] || []),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
  } catch(e) { console.error('Job pack save error', e); }
}

async function toggleJobPackForm(projId, formId, event) {
  if (event) event.stopPropagation();
  if (!jobPackSelected[projId]) jobPackSelected[projId] = new Set();
  if (jobPackSelected[projId].has(formId)) jobPackSelected[projId].delete(formId);
  else jobPackSelected[projId].add(formId);
  renderJobPackPanel(projId);
  await saveJobPackState(projId);
}

async function renderJobPackPanel(projId) {
  const wrap = document.getElementById('jobPackWrap');
  if (!wrap) return;
  if (!jobPackSelected[projId]) {
    wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted)">Loading…</div>';
    await loadJobPackState(projId);
  }
  const selected = jobPackSelected[projId] || new Set();
  const count = selected.size;
  const dis = count === 0 ? 'disabled' : '';
  let html = `<div class="jp-wrap">
    <div class="jp-top-bar">
      <h2>📋 Job Pack</h2>
      ${count > 0 ? `<span class="jp-count-badge">${count} form${count !== 1 ? 's' : ''} selected</span>` : ''}
      <button class="jp-gen-btn" onclick="generateJobPackPdf('${projId}')" ${dis}>🖨 PDF${count > 0 ? ' ('+count+')' : ''}</button>
      <button class="jp-word-btn" onclick="generateJobPackWord('${projId}')" ${dis}>📄 Word${count > 0 ? ' ('+count+')' : ''}</button>
    </div>`;
  JP_GROUPS.forEach(group => {
    const forms = JOB_PACK_FORMS.filter(f => f.group === group);
    html += `<div class="jp-group"><div class="jp-group-label">${group}</div>`;
    forms.forEach(f => {
      const isSel = selected.has(f.id);
      html += `<div class="jp-card${isSel ? ' jp-selected' : ''}" onclick="toggleJobPackForm('${projId}','${f.id}',event)">
        <div class="jp-card-check"></div>
        <div class="jp-card-icon">${f.icon}</div>
        <div class="jp-card-body">
          <div class="jp-card-name">${f.name}</div>
          <div class="jp-card-desc">${f.desc}</div>
        </div>
        <div class="jp-card-actions">
          <button class="jp-preview-btn" onclick="previewJobPackForm('${projId}','${f.id}',event)">👁 Preview</button>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  wrap.innerHTML = html + '</div>';
}

function previewJobPackForm(projId, formId, event) {
  if (event) event.stopPropagation();
  const proj = projects.find(p => p.id === projId);
  const info = projectInfo[projId] || {};
  const form = JOB_PACK_FORMS.find(f => f.id === formId);
  if (!proj || !form) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'jp-modal-backdrop';
  backdrop.id = 'jpModalBackdrop';
  backdrop.onclick = e => { if (e.target === backdrop) closeJpModal(); };
  backdrop.innerHTML = `<div class="jp-modal">
    <div class="jp-modal-header">
      <span class="jp-modal-title">${form.icon} ${form.name}</span>
      <button class="jp-modal-print-btn" onclick="printSingleJpForm('${projId}','${formId}')">🖨 Print</button>
      <button class="jp-modal-word-btn" onclick="wordSingleJpForm('${projId}','${formId}')">📄 Word</button>
      <button class="jp-modal-close" onclick="closeJpModal()">✕</button>
    </div>
    <div class="jp-modal-body">${buildFormHtml(formId, proj, info)}</div>
  </div>`;
  document.body.appendChild(backdrop);
}

function closeJpModal() { const el = document.getElementById('jpModalBackdrop'); if (el) el.remove(); }

function printSingleJpForm(projId, formId) {
  openPrintWindow([{ html: buildFormHtml(formId, projects.find(p=>p.id===projId), projectInfo[projId]||{}) }]);
}
function wordSingleJpForm(projId, formId) {
  const proj = projects.find(p=>p.id===projId);
  const info = projectInfo[projId]||{};
  const form = JOB_PACK_FORMS.find(f=>f.id===formId);
  downloadWordDoc([{ html: buildFormHtml(formId,proj,info) }], `${proj.name||'JobPack'}_${(form?.name||formId).replace(/\s+/g,'_')}.doc`);
}
function generateJobPackPdf(projId) {
  const proj=projects.find(p=>p.id===projId), info=projectInfo[projId]||{}, selected=jobPackSelected[projId]||new Set();
  if (!selected.size) return;
  openPrintWindow(JOB_PACK_FORMS.filter(f=>selected.has(f.id)).map(f=>({ html:buildFormHtml(f.id,proj,info) })));
}
function generateJobPackWord(projId) {
  const proj=projects.find(p=>p.id===projId), info=projectInfo[projId]||{}, selected=jobPackSelected[projId]||new Set();
  if (!selected.size) return;
  downloadWordDoc(JOB_PACK_FORMS.filter(f=>selected.has(f.id)).map(f=>({ html:buildFormHtml(f.id,proj,info) })), `${proj.name||'JobPack'}_JobPack.doc`);
}

function downloadWordDoc(pages, filename) {
  const pb = '<br clear="all" style="mso-page-break-before:always;page-break-before:always">';
  const body = pages.map((p,i)=>(i>0?pb:'')+p.html).join('\n');
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>NU Laboratories Job Pack</title>
<style>
@page{size:8.5in 11in;margin:.5in}*{box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:10.5pt;color:#000}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #555;padding:3pt 5pt;vertical-align:top;font-size:10.5pt}
.jp-header-cell{background:#1a1a2e;color:#fff;font-weight:bold;font-size:13pt;text-align:center;padding:6pt}
.jp-col-header{background:#ddd;font-weight:bold;text-align:center;font-size:9pt;text-transform:uppercase}
.jp-auto{background:#d6eaf8;font-weight:bold;color:#0a3d6b}
.jp-auto .jp-field-value{color:#0a3d6b}
.jp-field-label{font-size:7.5pt;font-weight:bold;text-transform:uppercase;color:#555;display:block;margin-bottom:1pt}
.jp-field-value{font-size:10.5pt;font-weight:bold;color:#000}
.jp-blank-row td{height:17pt}
.jp-section-label{font-size:8pt;font-weight:bold;text-transform:uppercase;color:#333;background:#efefef}
.jp-sidebar{background:#f7f7f7}
</style></head><body>${body}</body></html>`;
  const blob = new Blob([html], { type:'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function openPrintWindow(pages) {
  const win = window.open('','_blank','width=950,height=750');
  if (!win) { alert('Please allow pop-ups.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NU Laboratories Job Pack</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:10.5px;color:#000;background:#fff}
.jp-page{padding:12px 14px;page-break-after:always;break-after:page}.jp-page:last-child{page-break-after:avoid;break-after:avoid}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #555;padding:3px 5px;vertical-align:top;font-size:10.5px}
.jp-header-cell{background:#1a1a2e!important;color:#fff!important;font-weight:700;font-size:13px;text-align:center;padding:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.jp-col-header{background:#ddd!important;font-weight:700;text-align:center;font-size:9px;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.jp-auto{background:#d6eaf8!important;font-weight:600;color:#0a3d6b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.jp-auto .jp-field-value{color:#0a3d6b}
.jp-field-label{font-size:7.5px;font-weight:700;text-transform:uppercase;color:#555;display:block;margin-bottom:1px}
.jp-field-value{font-size:10.5px;font-weight:600;color:#000}.jp-blank-row td{height:17px}
.jp-section-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#333;background:#efefef!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.jp-sidebar{background:#f7f7f7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.jp-page{padding:8px 10px}@page{margin:.4in;size:letter}}
</style></head><body>`);
  pages.forEach(p=>win.document.write(`<div class="jp-page">${p.html}</div>`));
  win.document.write('</body></html>');
  win.document.close();
  setTimeout(()=>win.print(), 600);
}

function extractSpecs(text) {
  if (!text) return '';
  const patterns = [
    /MIL[-\s]STD[-\s]\d+[A-Z]?(?:[-\s]\d+[A-Z]?)*/gi,
    /MIL[-\s][A-Z]+[-\s]\d+[A-Z]?(?:[-\s]\d+[A-Z]?)*/gi,
    /MIL[-\s]HDBK[-\s]\d+[A-Z]?/gi,
    /MIL[-\s]DTL[-\s]\d+[A-Z]?/gi,
    /MIL[-\s]PRF[-\s]\d+[A-Z]?/gi,
    /DO[-\s]\d+[A-Z]?/gi,
    /RTCA\s+DO[-\s]\d+[A-Z]?/gi,
    /ASTM\s+[A-Z]\d+/gi,
    /IEC\s+\d+[-\s]?\d*/gi,
    /ISO\s+\d+[-\s]?\d*/gi,
    /IEEE\s+\d+[.\d]*/gi,
    /SAE\s+[A-Z]?\d+[A-Z]?/gi,
    /NEMA\s+[A-Z]+[-\s]\d+/gi,
    /UL\s+\d+[A-Z]?/gi,
    /IPC[-\s]\d+[A-Z]?/gi,
    /ANSI(?:\/[A-Z]+)?\s+[A-Z]?\d+[.\-\d]*/gi,
    /FED[-\s]STD[-\s]\d+[A-Z]?/gi,
    /NAVSEA\s+\d+[-\s]\d+/gi,
    /MRL\s+\w+\s+\w+\s+\d+[-\s]\d*/gi,
  ];
  const found = new Set();
  patterns.forEach(re => { const m=text.match(re); if(m) m.forEach(s=>found.add(s.trim().replace(/\s+/g,' '))); });
  const arr = Array.from(found);
  return arr.filter(a=>!arr.some(b=>b!==a&&b.toLowerCase().startsWith(a.toLowerCase()))).join(', ');
}

function buildFormHtml(formId, proj, info) {
  switch(formId) {
    case 'job-info':     return formJobInfo(proj, info);
    case 'receiving':    return formReceiving(proj, info);
    case 'test-log':     return formTestLog(proj, info);
    case 'shock-weight': return formShockWeight(proj, info);
    case 'shock-mwst':   return formShockMWST(proj, info);
    case 'shock-lwst':   return formShockLWST(proj, info);
    case 'vib-axis1':    return formVibration(proj, info, 1);
    case 'vib-axis2':    return formVibration(proj, info, 2);
    case 'vib-axis3':    return formVibration(proj, info, 3);
    case 'acoustic':     return formAcoustic(proj, info);
    case 'photo-index':  return formPhotoIndex(proj, info);
    case 'equip-list':   return formEquipList(proj, info);
    default: return '<p>Unknown form</p>';
  }
}

// FORM 1: Job Pack Information
function formJobInfo(proj, info) {
  const tasks = (typeof taskStore!=='undefined') ? taskStore.filter(t=>t.proj===proj.id).sort((a,b)=>(a.taskNum||0)-(b.taskNum||0)) : [];
  let rows='';
  tasks.forEach((t,i)=>{ const h=t.budgetHours?t.budgetHours+' hrs':''; rows+=`<tr><td style="text-align:center;width:6%;font-weight:700">${i+1}</td><td colspan="4" class="jp-auto"><span class="jp-field-value">${t.name||''}</span></td><td class="jp-auto" style="text-align:center;white-space:nowrap"><span class="jp-field-value">${h}</span></td></tr>`; });
  for(let i=0;i<Math.max(0,16-tasks.length);i++) rows+=`<tr class="jp-blank-row"><td style="text-align:center;color:#aaa">${tasks.length+i+1}</td><td colspan="4"></td><td></td></tr>`;
  return `<div class="jp-form"><table>
<tr><td colspan="3" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="3" class="jp-header-cell" style="font-size:15px">JOB PACK INFORMATION</td></tr>
<tr><td colspan="2"><span class="jp-field-label">Client</span></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td><span class="jp-field-label">Job No.</span></td><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Quote</span></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${info.quoteNumber||''}</span></td><td><span class="jp-field-label">GSI</span></td><td class="jp-auto"><span class="jp-field-value">${info.dcas||''}</span></td></tr>
<tr><td colspan="3" class="jp-col-header">Test Description</td><td colspan="3" class="jp-col-header">Test Article Description</td></tr>
<tr><td colspan="3" class="jp-auto" style="height:50px;vertical-align:top"><span class="jp-field-value">${info.desc||''}</span></td><td colspan="3" class="jp-auto" style="height:50px;vertical-align:top"><span class="jp-field-value">${info.testArticleDesc||''}</span></td></tr>
<tr><td class="jp-col-header" style="width:6%">Line</td><td class="jp-col-header" colspan="4">Task</td><td class="jp-col-header" style="width:11%">Time</td></tr>
${rows}</table></div>`;
}

// FORM 2: Receiving Checklist
function formReceiving(proj, info) {
  const specs=extractSpecs(info.desc);
  const steps=['Mark receipt in shipping log, place shipping documents in box next to log book','Take photo of all packages, crates, pallets, etc.','Mark all containers that will be disassembled so they can be reassembled as received','Open all containers and photograph contents before removing','Remove and photograph contents from all containers','Make an inventory list, if not included with shipment','Take photos of test item from all angles and closeup of any nameplates, labels, or markings','Identify test item with job number and customer name using tape, marker, or tag','Weigh test item, if applicable, and mark weight on item using tape, marker, or tag','Store packing materials out of the way until testing is completed'];
  return `<div class="jp-form"><table>
<tr><td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="2" class="jp-header-cell" style="font-size:15px">RECEIVING CHECKLIST</td></tr>
<tr><td style="width:15%"><span class="jp-field-label">Client</span></td><td class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td style="width:15%"><span class="jp-field-label">Job No.</span></td><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td><span class="jp-field-label">Test</span></td><td class="jp-auto"><span class="jp-field-value">${info.testDesc||''}</span></td><td><span class="jp-field-label">Date</span></td><td></td></tr>
<tr><td><span class="jp-field-label">Spec.</span></td><td class="${specs?'jp-auto':''}"><span class="jp-field-value">${specs}</span></td><td><span class="jp-field-label">Initials</span></td><td></td></tr>
<tr><td><span class="jp-field-label">Materials</span></td><td colspan="3" class="jp-auto"><span class="jp-field-value">${info.testArticleDesc||''}</span></td></tr>
<tr><td class="jp-col-header">Step</td><td class="jp-col-header">Description</td><td colspan="2" class="jp-col-header">Init.</td></tr>
${steps.map((s,i)=>`<tr><td style="text-align:center;font-weight:700;width:6%">${i+1}</td><td style="width:80%">${s}</td><td style="width:14%"></td></tr>`).join('')}
<tr class="jp-blank-row"><td colspan="4"></td></tr><tr class="jp-blank-row"><td colspan="4"></td></tr><tr class="jp-blank-row"><td colspan="4"></td></tr>
</table></div>`;
}

// FORM 3: Test Log
function formTestLog(proj, info) {
  const specs=extractSpecs(info.desc);
  const blanks=Array.from({length:26},()=>`<tr class="jp-blank-row"><td></td><td></td><td></td><td></td></tr>`).join('');
  return `<div class="jp-form"><table>
<tr><td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="2" class="jp-header-cell" style="font-size:15px">TEST LOG</td></tr>
<tr><td style="width:15%"><span class="jp-field-label">Client</span></td><td class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td style="width:15%"><span class="jp-field-label">Job No.</span></td><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td><span class="jp-field-label">Test</span></td><td class="jp-auto"><span class="jp-field-value">${info.testDesc||''}</span></td><td><span class="jp-field-label">Date</span></td><td></td></tr>
<tr><td><span class="jp-field-label">Spec.</span></td><td class="${specs?'jp-auto':''}"><span class="jp-field-value">${specs}</span></td><td><span class="jp-field-label">Initials</span></td><td></td></tr>
<tr><td><span class="jp-field-label">Materials</span></td><td colspan="3" class="jp-auto"><span class="jp-field-value">${info.testArticleDesc||''}</span></td></tr>
<tr><td colspan="4" class="jp-section-label" style="padding:3px 5px">Lab Conditions</td></tr>
<tr><td><span class="jp-field-label">Temp</span>&nbsp;</td><td><span class="jp-field-label">RH</span>&nbsp;</td><td colspan="2"><span class="jp-field-label">Atmospheric Pressure</span>&nbsp;</td></tr>
<tr><td colspan="4"><span class="jp-field-label">Notes</span></td></tr>
<tr style="height:24px"><td colspan="4"></td></tr>
<tr><td class="jp-col-header" style="width:12%">Ref. Para.</td><td class="jp-col-header" style="width:22%">Date / Time</td><td class="jp-col-header" style="width:54%">Log Entry</td><td class="jp-col-header" style="width:12%">Init.</td></tr>
${blanks}</table></div>`;
}

// FORM 4: Shock Test Weight Breakdown
function formShockWeight(proj, info) {
  const fx=[['','Test Unit','',''],['','Mounting Plate','',''],['','Mounting Hardware','',''],['','T-Blocks (w/ Hardware)','',''],['','Spacers','',''],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','','','24px'],['','Load (Dummy Mass) — Suction','',''],['','Load (Dummy Mass) — Discharge','',''],['','Shipbuilding Channels','',''],['','Standard Channels','',''],['','Shipbuilding Channel Shoes','',''],['','Standard Channel Shoes','',''],['','','',''],['','Fixture Figure 4A of MIL-S-901D','',''],['','Fixture Figure 4C of MIL-S-901D','',''],['','Fixture Figure 13 of MIL-S-901D','399 lbs.',''],['','Fixture Figure 15 of MIL-S-901D','',''],['','Fixture Figure 16 of MIL-S-901D','1542 lbs.',''],['','Fixture Figure 17 of MIL-S-901D','634 lbs.',''],['','Fixture Figure 18 (Base) of MIL-S-901D','466 lbs.',''],['','Clamps for Fixture Figure 18','57 lbs.',''],['','Fixture Figure 18 (30 Deg Compound) of MIL-S-901D','1810 lbs.',''],['','','',''],['','Total Weight — Fixture Figure 13','',''],['','Total Weight — Fixture Figure 16','',''],['','Total Weight — Fixture Figure 17','',''],['','Total Weight — Fixture Figure 18','','']];
  return `<div class="jp-form"><table style="table-layout:fixed">
<colgroup><col style="width:8%"><col style="width:63%"><col style="width:29%"></colgroup>
<tr><td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td class="jp-header-cell" style="font-size:14px">SHOCK TEST WEIGHT BREAKDOWN</td></tr>
<tr><td><span class="jp-field-label">Client</span></td><td class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td class="jp-auto"><span class="jp-field-label">Job No.</span> <span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td><span class="jp-field-label">Technician</span></td><td></td><td><span class="jp-field-label">Date</span></td></tr>
<tr><td class="jp-col-header">Qty</td><td class="jp-col-header">Description</td><td class="jp-col-header">Weight</td></tr>
${fx.map(([q,d,w,h])=>`<tr style="${h?'height:'+h:''}"><td style="text-align:center">${q}</td><td>${d}</td><td style="text-align:center">${w?'<strong>'+w+'</strong>':''}</td></tr>`).join('')}
</table></div>`;
}

// FORM 5: Medium Weight Shock Test
function formShockMWST(proj, info) {
  const blows=Array.from({length:13},(_,i)=>`<tr class="jp-blank-row"><td style="text-align:center;font-weight:700">${i+1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  return `<div class="jp-form"><table>
<tr><td colspan="4" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="4" class="jp-header-cell" style="font-size:15px">MEDIUM WEIGHT SHOCK TEST</td></tr>
<tr><td class="jp-col-header" style="width:12%">Job #</td><td class="jp-col-header" style="width:14%">Date</td><td class="jp-col-header" style="width:14%">Tech</td><td class="jp-col-header" colspan="2">Client</td><td class="jp-col-header" colspan="3">Spec.</td></tr>
<tr><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td><td></td><td></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td colspan="3"></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">UUT Information</td></tr>
<tr><td><span class="jp-field-label">UUT</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">A ______ B ______</span></td><td colspan="2"></td></tr>
<tr><td><span class="jp-field-label">M/N</span></td><td colspan="3"></td><td colspan="4"><span class="jp-field-label">No. of Blows ______</span></td></tr>
<tr><td><span class="jp-field-label">S/N</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">1st Axis</span></td><td colspan="2"><span class="jp-field-label">Bolts</span></td></tr>
<tr><td><span class="jp-field-label">DIM.</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">2nd Axis</span></td><td colspan="2"></td></tr>
<tr><td><span class="jp-field-label">FIX #</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">3rd Axis</span></td><td colspan="2"></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Witness Name${info.customerWitness&&info.customerWitness!=='No'?' — '+info.customerWitness:''}</td></tr>
<tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
<tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
<tr><td colspan="5" class="jp-col-header">Test Conditions</td><td colspan="3" class="jp-col-header">Monitor Desc.</td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td><span class="jp-field-label">Input Power</span></td><td colspan="2"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Shock Blow Information</td></tr>
<tr><td class="jp-col-header" style="width:8%">Blow</td><td class="jp-col-header" style="width:12%">Axis</td><td class="jp-col-header" style="width:10%">HH</td><td class="jp-col-header" style="width:10%">TT</td><td class="jp-col-header" style="width:10%">GRP</td><td class="jp-col-header" style="width:10%">CON</td><td class="jp-col-header" style="width:8%">OK?</td><td class="jp-col-header">Discrepancy</td></tr>
${blows}
<tr><td colspan="8" style="font-size:8px;color:#666;padding:2px 4px">NU Form #21-2</td></tr>
</table></div>`;
}

// FORM 6: Light Weight Shock Test
function formShockLWST(proj, info) {
  const blows=Array.from({length:17},(_,i)=>`<tr class="jp-blank-row"><td style="text-align:center;font-weight:700">${i+1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  const wit=info.customerWitness&&info.customerWitness!=='No'?' — '+info.customerWitness:'';
  return `<div class="jp-form"><table>
<tr><td colspan="4" style="font-weight:700;font-size:13px;border:2px solid #333;padding:7px">NU LABORATORIES / DATA SHEET</td><td colspan="4" class="jp-header-cell" style="font-size:15px">LIGHT WEIGHT SHOCK TEST</td></tr>
<tr><td class="jp-col-header" style="width:12%">Job #</td><td class="jp-col-header" style="width:13%">Date</td><td class="jp-col-header" style="width:13%">Tech</td><td class="jp-col-header" colspan="2">Client</td><td class="jp-col-header" colspan="3">Spec.</td></tr>
<tr><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td><td></td><td></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td colspan="3"></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">UUT Information</td></tr>
<tr><td><span class="jp-field-label">UUT</span></td><td colspan="3"></td><td colspan="3"></td><td><span class="jp-field-label">Classification</span></td></tr>
<tr><td><span class="jp-field-label">M/N</span></td><td colspan="3"></td><td colspan="3"><span class="jp-field-label">UUT</span></td><td></td></tr>
<tr><td><span class="jp-field-label">S/N</span></td><td colspan="3"></td><td colspan="3"></td><td><span class="jp-field-label">No. of Blows</span></td></tr>
<tr><td><span class="jp-field-label">DIM.</span></td><td colspan="7"></td></tr>
<tr><td><span class="jp-field-label">FIX #</span></td><td colspan="3"></td><td colspan="3"><span class="jp-field-label">Total</span></td><td><span class="jp-field-label">Bolts</span></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Witness Name${wit}</td></tr>
<tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
<tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
<tr><td colspan="5" class="jp-col-header">Test Conditions</td><td colspan="3" class="jp-col-header">Monitor Desc.</td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td><span class="jp-field-label">Input Power</span></td><td colspan="2"></td></tr>
<tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
<tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Shock Blow Information</td></tr>
<tr><td class="jp-col-header" style="width:8%">Blow</td><td class="jp-col-header" style="width:14%">Axis</td><td class="jp-col-header" style="width:10%">HH</td><td class="jp-col-header" style="width:10%">GRP</td><td class="jp-col-header" style="width:10%">Cond</td><td class="jp-col-header" style="width:8%">OK?</td><td class="jp-col-header" colspan="2">Discrepancy</td></tr>
${blows}
</table></div>`;
}

// FORMS 7-9: Vibration Data Sheet
function formVibration(proj, info, axis) {
  const hz=[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50];
  const nuLogo='https://images.squarespace-cdn.com/content/v1/4ffd78c424accf259206d1dc/1473195765839-Z06GZYUXTVC8DBAGVE1V/logo-shadowed.png';
  const endRows=Array.from({length:5},()=>`<tr><td style="border:1px solid #888;padding:1px;height:13px"></td><td style="border:1px solid #888;padding:1px"></td><td style="border:1px solid #888;padding:1px"></td></tr>`).join('');
  const sidebar=`<div style="font-size:12px;font-weight:700;text-align:center;margin-bottom:5px">VIBRATION TEST DATA SHEET</div>
<table style="width:100%;border-collapse:collapse;border:none;margin-bottom:6px">
<tr><td style="border:none;padding:1px 2px;width:38%"><span class="jp-field-label">Job No.</span></td><td style="border:none;padding:1px 2px" class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td style="border:none;padding:1px 2px"><span class="jp-field-label">Date</span></td><td style="border:none;padding:1px 2px;height:14px"></td></tr>
<tr><td style="border:none;padding:1px 2px"><span class="jp-field-label">Axis</span></td><td style="border:none;padding:1px 2px;font-weight:700;font-size:13px">${axis}</td></tr>
</table>
<div style="text-align:center;border-top:1px solid #ccc;padding-top:5px;margin-bottom:6px">
<img src="${nuLogo}" style="max-height:36px;max-width:120px;object-fit:contain;display:block;margin:0 auto 4px" alt="NU Laboratories"/>
<span style="font-size:7px;color:#555;line-height:1.4">312 Old Allerton Rd., Annandale, NJ 08801<br>(908) 713-9300</span>
</div>
<div style="font-size:7.5px;font-style:italic;text-align:center;color:#555;margin-bottom:6px;border:1px solid #bbb;padding:2px">NOTE: RECORDED DATA IS DOUBLE AMPLITUDE</div>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">ENDURANCE</div>
<table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:6px">
<tr><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:28%">Hz</td><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:36%">Input</td><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">Duration</td></tr>
${endRows}</table>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TEST ARTICLE IDENTIFICATION</div>
<div class="jp-auto" style="min-height:28px;padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.testArticleDesc||''}</div>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TESTED FOR</div>
<div class="jp-auto" style="padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.client||''}</div>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">ACCELEROMETER LOCATIONS</div>
<table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:6px">
<tr><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:40%">INPUT (CH. 1)</td><td style="border:1px solid #888;padding:2px;height:13px"></td></tr>
<tr><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">CH. 2</td><td style="border:1px solid #888;padding:2px;height:13px"></td></tr>
<tr><td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">CH. 3</td><td style="border:1px solid #888;padding:2px;height:13px"></td></tr>
</table>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">REMARKS</div>
<div style="min-height:42px;border:1px solid #bbb;padding:2px;margin-bottom:6px"></div>
<div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TEST ENGINEER</div>
<div class="jp-auto" style="padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.pm||''}</div>
<div style="font-size:8px;color:#666;border-top:1px solid #ccc;padding-top:3px">Sheet: ______________________</div>`;
  return `<div class="jp-form"><table style="table-layout:fixed">
<colgroup><col style="width:5%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:33%"></colgroup>
<tr><td style="border:none;padding:0"></td><td colspan="3" class="jp-col-header">Exploratory Frequency</td><td colspan="3" class="jp-col-header">Variable Frequency</td><td class="jp-header-cell" style="font-size:11px">VIBRATION TEST DATA SHEET</td></tr>
<tr><td class="jp-col-header">Hz</td><td class="jp-col-header">Input<br>(Ch.1)</td><td class="jp-col-header">Ch. 2</td><td class="jp-col-header">Ch. 3</td><td class="jp-col-header">Input<br>(Ch.1)</td><td class="jp-col-header">Ch. 2</td><td class="jp-col-header">Ch. 3</td>
<td class="jp-sidebar" style="padding:4px 6px;vertical-align:middle;text-align:center"><span style="font-size:10px;font-weight:700">JOB NO.</span> <span class="jp-auto" style="display:inline-block;padding:1px 6px;margin-left:4px;font-weight:700;color:#0a3d6b">${proj.name||''}</span> &nbsp;&nbsp;<span style="font-size:10px;font-weight:700">AXIS ${axis}</span></td></tr>
${hz.map((h,i)=>`<tr><td style="text-align:center;font-weight:700;background:#f9f9f9">${h}</td><td></td><td></td><td></td><td></td><td></td><td></td>${i===0?`<td class="jp-sidebar" rowspan="${hz.length}" style="width:33%;vertical-align:top;padding:5px 6px">${sidebar}</td>`:''}</tr>`).join('')}
<tr><td colspan="7" style="font-size:7.5px;text-align:center;padding:2px;background:#f5f5f5;border:1px solid #ccc">Res. ____________ Hz</td><td style="border:none;padding:0"></td></tr>
</table></div>`;
}

// FORM 10: Acoustic Noise Requirements
function formAcoustic(proj, info) {
  const freqs=[25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000];
  const fRows=freqs.map(f=>`<tr><td style="text-align:center;font-weight:700;background:#f9f9f9">${f}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  return `<div class="jp-form"><table>
<tr><td colspan="5" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="5" class="jp-header-cell" style="font-size:15px">ACOUSTIC REQUIREMENTS</td></tr>
<tr><td colspan="5" class="jp-section-label" style="padding:3px 5px">Job Information</td><td colspan="5" class="jp-section-label" style="padding:3px 5px">Inputs</td></tr>
<tr><td colspan="2"><span class="jp-field-label">Job Number</span></td><td colspan="3" class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td><td colspan="2"><span class="jp-field-label">Plenum PSI</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Customer Name</span></td><td colspan="3" class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td colspan="2"><span class="jp-field-label">Rotor 1</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Test Date</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Rotor 2</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Test Duration</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Rotor 3</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Required Overall SPL</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Rotor 4</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Chamber Size</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Overall Sound Pressure Levels</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Nozzle Size</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Control Mic.</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Compressor Size</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Mic 2</span></td><td colspan="3"></td></tr>
<tr><td colspan="2"><span class="jp-field-label">Technician</span></td><td colspan="3"></td><td colspan="2"><span class="jp-field-label">Mic 3</span></td><td colspan="3"></td></tr>
<tr><td colspan="5" class="jp-section-label" style="padding:3px 5px">Specified Data</td><td></td><td colspan="4" class="jp-section-label" style="padding:3px 5px">Recorded Data</td></tr>
<tr><td class="jp-col-header" style="width:9%">Freq. (Hz)</td><td class="jp-col-header" style="width:8%">Min.</td><td class="jp-col-header" style="width:8%">Max.</td><td class="jp-col-header" style="width:10%">Required</td><td class="jp-col-header" style="width:5%"></td><td class="jp-col-header" style="width:12%">Proof</td><td class="jp-col-header" style="width:12%">Start</td><td class="jp-col-header" style="width:12%">Middle 1</td><td class="jp-col-header" style="width:12%">Middle 2</td><td class="jp-col-header" style="width:12%">End</td></tr>
${fRows}
</table></div>`;
}

// FORM 11: Digital Photograph Index Sheet
function formPhotoIndex(proj, info) {
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const rows=Array.from({length:29},(_,i)=>`<tr><td style="text-align:center;font-weight:700;width:15%">${i+1}</td><td></td></tr>`).join('');
  return `<div class="jp-form"><table>
<tr><td colspan="2" class="jp-header-cell" style="font-size:15px">DIGITAL PHOTOGRAPH INDEX SHEET</td></tr>
<tr><td style="width:50%"><span class="jp-field-label">Job #</span> <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${proj.name||''}</span></td>
<td><span class="jp-field-label">Customer</span> <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${info.client||''}</span> &nbsp;&nbsp; <span class="jp-field-label">Date</span> <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${today}</span></td></tr>
<tr><td class="jp-col-header" style="width:15%">Index #</td><td class="jp-col-header">Photo Description</td></tr>
${rows}</table></div>`;
}

// FORM 12: Test Equipment List
function formEquipList(proj, info) {
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const rows=Array.from({length:22},()=>`<tr class="jp-blank-row"><td colspan="2"></td><td></td><td></td><td></td></tr>`).join('');
  return `<div class="jp-form"><table>
<tr><td colspan="3" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td><td colspan="2" class="jp-header-cell" style="font-size:15px">TEST EQUIPMENT LIST</td></tr>
<tr><td style="width:14%"><span class="jp-field-label">Client</span></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client||''}</span></td><td style="width:14%"><span class="jp-field-label">Job No.</span></td><td class="jp-auto"><span class="jp-field-value">${proj.name||''}</span></td></tr>
<tr><td><span class="jp-field-label">Date</span></td><td colspan="2" class="jp-auto"><span class="jp-field-value">${today}</span></td><td colspan="2"></td></tr>
<tr><td class="jp-col-header" colspan="2">Description</td><td class="jp-col-header" style="width:14%">Asset ID</td><td class="jp-col-header" style="width:13%">Cal. Date</td><td class="jp-col-header" style="width:13%">Cal. Due</td></tr>
${rows}
<tr><td colspan="5" style="font-size:8px;color:#666;padding:2px 4px">NU Form #21-4</td></tr>
</table></div>`;
}

