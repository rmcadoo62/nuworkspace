
// ===== JOB PACK =====
// ===== JOB PACK =====

const JOB_PACK_FORMS = [
  { id:'job-info',     group:'Job Prep',        icon:'📋', name:'Job Pack Information',          desc:'Job header — client, quote, test & article description, task lines' },
  { id:'receiving',    group:'Job Prep',        icon:'📦', name:'Receiving Checklist',            desc:'10-step receiving procedure with initials column' },
  { id:'test-log',     group:'Job Prep',        icon:'📝', name:'Test Log',                       desc:'Running log of test events with lab conditions' },
  { id:'shock-weight', group:'Shock Testing',   icon:'⚖️',  name:'Shock Test Weight Breakdown',   desc:'Fixture & hardware weights — MIL-S-901D fixtures pre-listed' },
  { id:'shock-mwst',   group:'Shock Testing',   icon:'💥', name:'Medium Weight Shock Test',       desc:'NU Form #21-2 — blow-by-blow shock test data log' },
  { id:'vib-axis1',    group:'Vibration',       icon:'〰️', name:'Vibration Data Sheet — Axis 1', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'vib-axis2',    group:'Vibration',       icon:'〰️', name:'Vibration Data Sheet — Axis 2', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'vib-axis3',    group:'Vibration',       icon:'〰️', name:'Vibration Data Sheet — Axis 3', desc:'Hz 4–50, exploratory & variable frequency + endurance' },
  { id:'photo-index',  group:'Documentation',   icon:'📷', name:'Digital Photograph Index Sheet', desc:'64-row photo log with index numbers and descriptions' },
  { id:'equip-list',   group:'Documentation',   icon:'🔧', name:'Test Equipment List',            desc:'NU Form #21-4 — calibrated instruments, asset IDs, cal dates' },
  { id:'acoustic',     group:'Acoustic',        icon:'🔊', name:'Acoustic Noise Requirements',      desc:'Frequency data sheet 25–10,000 Hz with job info, inputs, and recorded levels' },
  { id:'shock-lwst',   group:'Shock Testing',   icon:'💥', name:'Light Weight Shock Test',          desc:'NU Data Sheet — blow-by-blow light weight shock test log' },
  { id:'octal-log',    group:'Production (ESS)', icon:'🔁', name:'ESS Batch Test Log',              desc:'Production run log — serial # tracking, temp cycle + vibe checkboxes per unit' },
  { id:'octal-photo',  group:'Production (ESS)', icon:'📷', name:'ESS Photo Index (Batch)',         desc:'Photo log with serial number rows and Z/X/Y axis confirmation checkboxes' },
];

const JP_GROUPS = ['Job Prep', 'Shock Testing', 'Vibration', 'Acoustic', 'Production (ESS)', 'Documentation'];

// In-memory: { [projId]: Set of selected form IDs }
const jobPackSelected = {};

// ── Load state from Supabase ──
async function loadJobPackState(projId) {
  if (!sb || !projId) return;
  try {
    const { data } = await sb.from('project_job_pack')
      .select('selected_forms')
      .eq('project_id', projId)
      .single();
    jobPackSelected[projId] = new Set(data?.selected_forms || []);
  } catch(e) {
    jobPackSelected[projId] = new Set();
  }
}

// ── Save state to Supabase ──
async function saveJobPackState(projId) {
  if (!sb || !projId) return;
  const selected = Array.from(jobPackSelected[projId] || []);
  try {
    await sb.from('project_job_pack').upsert({
      project_id: projId,
      selected_forms: selected,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
  } catch(e) {
    console.error('Job pack save error', e);
  }
}

// ── Toggle a form's selected state ──
async function toggleJobPackForm(projId, formId, event) {
  if (event) event.stopPropagation();
  if (!jobPackSelected[projId]) jobPackSelected[projId] = new Set();
  if (jobPackSelected[projId].has(formId)) {
    jobPackSelected[projId].delete(formId);
  } else {
    jobPackSelected[projId].add(formId);
  }
  renderJobPackPanel(projId);
  await saveJobPackState(projId);
}

// ── Render the tab panel ──
async function renderJobPackPanel(projId) {
  const wrap = document.getElementById('jobPackWrap');
  if (!wrap) return;

  if (!jobPackSelected[projId]) {
    wrap.innerHTML = '<div style="padding:48px;text-align:center;color:var(--muted)">Loading…</div>';
    await loadJobPackState(projId);
  }

  const selected = jobPackSelected[projId] || new Set();
  const count = selected.size;

  let html = `<div class="jp-wrap">
    <div class="jp-top-bar">
      <h2>📋 Job Pack</h2>
      ${count > 0 ? `<span class="jp-count-badge">${count} form${count !== 1 ? 's' : ''} selected</span>` : ''}
      <button class="jp-gen-btn" onclick="generateJobPackPdf('${projId}')" ${count === 0 ? 'disabled' : ''}>
        🖨 Generate PDF${count > 0 ? ' ('+count+')' : ''}
      </button>
    </div>`;

  JP_GROUPS.forEach(group => {
    const forms = JOB_PACK_FORMS.filter(f => f.group === group);
    html += `<div class="jp-group"><div class="jp-group-label">${group}</div>`;
    forms.forEach(f => {
      const isSel = selected.has(f.id);
      html += `
      <div class="jp-card${isSel ? ' jp-selected' : ''}" onclick="toggleJobPackForm('${projId}','${f.id}',event)">
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
    html += `</div>`;
  });

  html += `</div>`;
  wrap.innerHTML = html;
}

// ── Preview a single form ──
function previewJobPackForm(projId, formId, event) {
  if (event) event.stopPropagation();
  const proj = projects.find(p => p.id === projId);
  const info = projectInfo[projId] || {};
  const form = JOB_PACK_FORMS.find(f => f.id === formId);
  if (!proj || !form) return;

  const formHtml = buildFormHtml(formId, proj, info);
  const backdrop = document.createElement('div');
  backdrop.className = 'jp-modal-backdrop';
  backdrop.id = 'jpModalBackdrop';
  backdrop.onclick = function(e) { if (e.target === backdrop) closeJpModal(); };
  backdrop.innerHTML = `
    <div class="jp-modal">
      <div class="jp-modal-header">
        <span class="jp-modal-title">${form.icon} ${form.name}</span>
        <button class="jp-modal-print-btn" onclick="printSingleJpForm('${projId}','${formId}')">🖨 Print This Form</button>
        <button class="jp-modal-close" onclick="closeJpModal()">✕</button>
      </div>
      <div class="jp-modal-body">${formHtml}</div>
    </div>`;
  document.body.appendChild(backdrop);
}

function closeJpModal() {
  const el = document.getElementById('jpModalBackdrop');
  if (el) el.remove();
}

function printSingleJpForm(projId, formId) {
  const proj = projects.find(p => p.id === projId);
  const info = projectInfo[projId] || {};
  openPrintWindow([{ id: formId, html: buildFormHtml(formId, proj, info) }]);
}

function generateJobPackPdf(projId) {
  const proj = projects.find(p => p.id === projId);
  const info = projectInfo[projId] || {};
  const selected = jobPackSelected[projId] || new Set();
  if (!selected.size) return;
  const pages = JOB_PACK_FORMS
    .filter(f => selected.has(f.id))
    .map(f => ({ id: f.id, html: buildFormHtml(f.id, proj, info) }));
  openPrintWindow(pages);
}

function openPrintWindow(pages) {
  const win = window.open('', '_blank', 'width=950,height=750');
  if (!win) { alert('Please allow pop-ups to generate the Job Pack PDF.'); return; }
  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>NU Laboratories — Job Pack</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#000;background:#fff}
    .jp-page{padding:12px 14px;page-break-after:always;break-after:page}
    .jp-page:last-child{page-break-after:avoid;break-after:avoid}
    table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #555;padding:3px 5px;vertical-align:top;font-size:10.5px}
    .jp-header-cell{background:#1a1a2e!important;color:#fff!important;font-weight:700;font-size:13px;text-align:center;padding:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .jp-col-header{background:#ddd!important;font-weight:700;text-align:center;font-size:9px;text-transform:uppercase;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .jp-auto{background:#d6eaf8!important;border-color:#7bb8e0!important;font-weight:600;color:#0a3d6b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .jp-auto .jp-field-value{color:#0a3d6b}
    .jp-field-label{font-size:7.5px;font-weight:700;text-transform:uppercase;color:#555;display:block;margin-bottom:1px}
    .jp-field-value{font-size:10.5px;font-weight:600;color:#000}
    .jp-blank-row td{height:17px}
    .jp-section-label{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#333;background:#efefef!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .jp-sidebar{background:#f7f7f7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{.jp-page{padding:8px 10px}@page{margin:.4in;size:letter}}
  </style></head><body>`);
  pages.forEach(p => win.document.write(`<div class="jp-page">${p.html}</div>`));
  win.document.write(`</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

// ─────────────────────────────────────────
// SPEC EXTRACTOR
// Scans project description for known standard patterns.
// Returns a comma-separated string of found specs, or '' if none.
// ─────────────────────────────────────────
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
  patterns.forEach(re => {
    const matches = text.match(re);
    if (matches) matches.forEach(m => found.add(m.trim().replace(/\s+/g, ' ')));
  });
  // Remove any match that is a pure prefix of a longer match in the set
  const arr = Array.from(found);
  const filtered = arr.filter(a =>
    !arr.some(b => b !== a && b.toLowerCase().startsWith(a.toLowerCase()))
  );
  return filtered.join(', ');
}

function buildFormHtml(formId, proj, info) {
  switch(formId) {
    case 'job-info':     return formJobInfo(proj, info);
    case 'receiving':    return formReceiving(proj, info);
    case 'test-log':     return formTestLog(proj, info);
    case 'shock-weight': return formShockWeight(proj, info);
    case 'shock-mwst':   return formShockMWST(proj, info);
    case 'vib-axis1':    return formVibration(proj, info, 1);
    case 'vib-axis2':    return formVibration(proj, info, 2);
    case 'vib-axis3':    return formVibration(proj, info, 3);
    case 'photo-index':  return formPhotoIndex(proj, info);
    case 'equip-list':   return formEquipList(proj, info);
    case 'acoustic':     return formAcoustic(proj, info);
    case 'shock-lwst':   return formShockLWST(proj, info);
    case 'octal-log':    return formOctalLog(proj, info);
    case 'octal-photo':  return formOctalPhoto(proj, info);
    default: return '<p>Unknown form</p>';
  }
}

// ─────────────────────────────────────────
// FORM 1: Job Pack Information
// Tasks pulled from taskStore; GSI = info.dcas
// ─────────────────────────────────────────
function formJobInfo(proj, info) {
  const projTasks = (typeof taskStore !== 'undefined')
    ? taskStore.filter(t => t.proj === proj.id).sort((a,b) => (a.taskNum||0)-(b.taskNum||0))
    : [];

  const minRows = 16;
  let taskRows = '';
  projTasks.forEach((t, i) => {
    const hrs = t.budgetHours ? t.budgetHours + ' hrs' : '';
    taskRows += `<tr>
      <td style="text-align:center;width:6%;font-weight:700">${i+1}</td>
      <td colspan="4" class="jp-auto"><span class="jp-field-value">${t.name || ''}</span></td>
      <td class="jp-auto" style="text-align:center;white-space:nowrap"><span class="jp-field-value">${hrs}</span></td>
    </tr>`;
  });
  const blankCount = Math.max(0, minRows - projTasks.length);
  for (let i = 0; i < blankCount; i++) {
    taskRows += `<tr class="jp-blank-row">
      <td style="text-align:center;color:#aaa">${projTasks.length+i+1}</td>
      <td colspan="4"></td><td></td>
    </tr>`;
  }

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="3" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="3" class="jp-header-cell" style="font-size:15px">JOB PACK INFORMATION</td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Client</span></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td><span class="jp-field-label">Job No.</span></td>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Quote</span></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.quoteNumber || ''}</span></td>
      <td><span class="jp-field-label">GSI</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.dcas || ''}</span></td>
    </tr>
    <tr>
      <td colspan="3" class="jp-col-header">Test Description</td>
      <td colspan="3" class="jp-col-header">Test Article Description</td>
    </tr>
    <tr>
      <td colspan="3" class="jp-auto" style="height:50px;vertical-align:top">
        <span class="jp-field-value">${info.desc || ''}</span>
      </td>
      <td colspan="3" class="jp-auto" style="height:50px;vertical-align:top">
        <span class="jp-field-value">${info.testArticleDesc || ''}</span>
      </td>
    </tr>
    <tr>
      <td class="jp-col-header" style="width:6%">Line</td>
      <td class="jp-col-header" colspan="4">Task</td>
      <td class="jp-col-header" style="width:11%">Time</td>
    </tr>
    ${taskRows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 2: Receiving Checklist
// ─────────────────────────────────────────
function formReceiving(proj, info) {
  const steps = [
    'Mark receipt in shipping log, place shipping documents in box next to log book',
    'Take photo of all packages, crates, pallets, etc.',
    'Mark all containers that will be disassembled so they can be reassembled as received',
    'Open all containers and photograph contents before removing',
    'Remove and photograph contents from all containers',
    'Make an inventory list, if not included with shipment',
    'Take photos of test item from all angles and closeup of any nameplates, labels, or markings',
    'Identify test item with job number and customer name using tape, marker, or tag',
    'Weigh test item, if applicable, and mark weight on item using tape, marker, or tag',
    'Store packing materials out of the way until testing is completed',
  ];
  const stepRows = steps.map((s,i) => `<tr>
    <td style="text-align:center;font-weight:700;width:6%">${i+1}</td>
    <td style="width:80%">${s}</td>
    <td style="width:14%"></td>
  </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="2" class="jp-header-cell" style="font-size:15px">RECEIVING CHECKLIST</td>
    </tr>
    <tr>
      <td style="width:15%"><span class="jp-field-label">Client</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td style="width:15%"><span class="jp-field-label">Job No.</span></td>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Test</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.testDesc || ''}</span></td>
      <td><span class="jp-field-label">Date</span></td><td></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Spec.</span></td>
      <td class="${extractSpecs(info.desc) ? 'jp-auto' : ''}">
        <span class="jp-field-value">${extractSpecs(info.desc)}</span>
      </td>
      <td><span class="jp-field-label">Initials</span></td><td></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Materials</span></td>
      <td colspan="3" class="jp-auto"><span class="jp-field-value">${info.testArticleDesc || ''}</span></td>
    </tr>
    <tr>
      <td class="jp-col-header">Step</td>
      <td class="jp-col-header">Description</td>
      <td colspan="2" class="jp-col-header">Init.</td>
    </tr>
    ${stepRows}
    <tr class="jp-blank-row"><td colspan="4"></td></tr>
    <tr class="jp-blank-row"><td colspan="4"></td></tr>
    <tr class="jp-blank-row"><td colspan="4"></td></tr>
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 3: Test Log
// ─────────────────────────────────────────
function formTestLog(proj, info) {
  const blankRows = Array.from({length:26}, () =>
    `<tr class="jp-blank-row"><td></td><td></td><td></td><td></td></tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="2" class="jp-header-cell" style="font-size:15px">TEST LOG</td>
    </tr>
    <tr>
      <td style="width:15%"><span class="jp-field-label">Client</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td style="width:15%"><span class="jp-field-label">Job No.</span></td>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Test</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.testDesc || ''}</span></td>
      <td><span class="jp-field-label">Date</span></td><td></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Spec.</span></td>
      <td class="${extractSpecs(info.desc) ? 'jp-auto' : ''}">
        <span class="jp-field-value">${extractSpecs(info.desc)}</span>
      </td>
      <td><span class="jp-field-label">Initials</span></td><td></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Materials</span></td>
      <td colspan="3" class="jp-auto"><span class="jp-field-value">${info.testArticleDesc || ''}</span></td>
    </tr>
    <tr><td colspan="4" class="jp-section-label" style="padding:3px 5px">Lab Conditions</td></tr>
    <tr>
      <td><span class="jp-field-label">Temp</span>&nbsp;</td>
      <td><span class="jp-field-label">RH</span>&nbsp;</td>
      <td colspan="2"><span class="jp-field-label">Atmospheric Pressure</span>&nbsp;</td>
    </tr>
    <tr><td colspan="4"><span class="jp-field-label">Notes</span></td></tr>
    <tr style="height:24px"><td colspan="4"></td></tr>
    <tr>
      <td class="jp-col-header" style="width:12%">Ref. Para.</td>
      <td class="jp-col-header" style="width:22%">Date / Time</td>
      <td class="jp-col-header" style="width:54%">Log Entry</td>
      <td class="jp-col-header" style="width:12%">Init.</td>
    </tr>
    ${blankRows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 4: Shock Test Weight Breakdown
// ─────────────────────────────────────────
function formShockWeight(proj, info) {
  // Each entry: [qty-content, description, weight, row-height-override]
  // height '24px' = normal handwriting row; '' = default compact
  const fixtures = [
    ['', 'Test Unit',                                    '',          ''],
    ['', 'Mounting Plate',                               '',          ''],
    ['', 'Mounting Hardware',                            '',          ''],
    ['', 'T-Blocks (w/ Hardware)',                       '',          ''],
    ['', 'Spacers',                                      '',          ''],
    // blank writable rows after Spacers
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', '', '', '24px'],
    ['', 'Load (Dummy Mass) — Suction',                  '',          ''],
    ['', 'Load (Dummy Mass) — Discharge',                '',          ''],
    ['', 'Shipbuilding Channels',                        '',          ''],
    ['', 'Standard Channels',                            '',          ''],
    ['', 'Shipbuilding Channel Shoes',                   '',          ''],
    ['', 'Standard Channel Shoes',                       '',          ''],
    ['', '',                                             '',          ''],
    ['', 'Fixture Figure 4A of MIL-S-901D',             '',          ''],
    ['', 'Fixture Figure 4C of MIL-S-901D',             '',          ''],
    ['', 'Fixture Figure 13 of MIL-S-901D',             '399 lbs.',  ''],
    ['', 'Fixture Figure 15 of MIL-S-901D',             '',          ''],
    ['', 'Fixture Figure 16 of MIL-S-901D',             '1542 lbs.', ''],
    ['', 'Fixture Figure 17 of MIL-S-901D',             '634 lbs.',  ''],
    ['', 'Fixture Figure 18 (Base) of MIL-S-901D',      '466 lbs.',  ''],
    ['', 'Clamps for Fixture Figure 18',                 '57 lbs.',   ''],
    ['', 'Fixture Figure 18 (30° Compound) of MIL-S-901D','1810 lbs.',''],
    ['', '',                                             '',          ''],
    ['', 'Total Weight — Fixture Figure 13',             '',          ''],
    ['', 'Total Weight — Fixture Figure 16',             '',          ''],
    ['', 'Total Weight — Fixture Figure 17',             '',          ''],
    ['', 'Total Weight — Fixture Figure 18',             '',          ''],
  ];

  // Simple 3-column table: Qty | Description | Weight
  // colgroup enforces widths so Weight always aligns under its header
  const rows = fixtures.map(([qty, desc, wt, h]) => {
    const heightStyle = h ? `height:${h};` : '';
    return `<tr style="${heightStyle}">
      <td style="text-align:center">${qty}</td>
      <td>${desc}</td>
      <td style="text-align:center">${wt ? `<strong>${wt}</strong>` : ''}</td>
    </tr>`;
  }).join('');

  return `<div class="jp-form">
  <table style="table-layout:fixed">
    <colgroup>
      <col style="width:8%">
      <col style="width:63%">
      <col style="width:29%">
    </colgroup>
    <tr>
      <td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td class="jp-header-cell" style="font-size:14px;letter-spacing:.5px">SHOCK TEST WEIGHT BREAKDOWN</td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Client</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td class="jp-auto"><span class="jp-field-label">Job No.</span> <span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Technician</span></td>
      <td></td>
      <td><span class="jp-field-label">Date</span></td>
    </tr>
    <tr>
      <td class="jp-col-header">Qty</td>
      <td class="jp-col-header">Description</td>
      <td class="jp-col-header">Weight</td>
    </tr>
    ${rows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 5: Medium Weight Shock Test (NU Form #21-2)
// ─────────────────────────────────────────
function formShockMWST(proj, info) {
  const blowRows = Array.from({length:13}, (_,i) => `<tr class="jp-blank-row">
    <td style="text-align:center;font-weight:700">${i+1}</td>
    <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
  </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="4" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="4" class="jp-header-cell" style="font-size:15px">MEDIUM WEIGHT SHOCK TEST</td>
    </tr>
    <tr>
      <td class="jp-col-header" style="width:12%">Job #</td>
      <td class="jp-col-header" style="width:14%">Date</td>
      <td class="jp-col-header" style="width:14%">Tech</td>
      <td class="jp-col-header" colspan="2">Client</td>
      <td class="jp-col-header" colspan="3">Spec.</td>
    </tr>
    <tr>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
      <td></td><td></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td colspan="3"></td>
    </tr>
    <tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">UUT Information</td></tr>
    <tr>
      <td><span class="jp-field-label">UUT</span></td><td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">A ______ B ______</span></td><td colspan="2"></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">M/N</span></td><td colspan="3"></td>
      <td colspan="4"><span class="jp-field-label">No. of Blows ______</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">S/N</span></td><td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">1st Axis</span></td>
      <td colspan="2"><span class="jp-field-label">Bolts</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">DIM.</span></td><td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">2nd Axis</span></td><td colspan="2"></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">FIX #</span></td><td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">3rd Axis</span></td><td colspan="2"></td>
    </tr>
    <tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Witness Name${info.customerWitness && info.customerWitness !== 'No' ? ' — Customer Witness: ' + info.customerWitness : ''}</td></tr>
    <tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
    <tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
    <tr>
      <td colspan="5" class="jp-col-header">Test Conditions</td>
      <td colspan="3" class="jp-col-header">Monitor Desc.</td>
    </tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td>
      <td><span class="jp-field-label">Input Power</span></td><td colspan="2"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Shock Blow Information</td></tr>
    <tr>
      <td class="jp-col-header" style="width:8%">Blow</td>
      <td class="jp-col-header" style="width:12%">Axis</td>
      <td class="jp-col-header" style="width:10%">HH</td>
      <td class="jp-col-header" style="width:10%">TT</td>
      <td class="jp-col-header" style="width:10%">GRP</td>
      <td class="jp-col-header" style="width:10%">CON</td>
      <td class="jp-col-header" style="width:8%">OK?</td>
      <td class="jp-col-header">Discrepancy</td>
    </tr>
    ${blowRows}
    <tr><td colspan="8" style="font-size:8px;color:#666;padding:2px 4px">NU Form #21-2</td></tr>
  </table></div>`;
}

// ─────────────────────────────────────────
// FORMS 6–8: Vibration Test Data Sheet
// Original layout: Hz data grid LEFT, info sidebar RIGHT (using rowspan)
// ─────────────────────────────────────────
function formVibration(proj, info, axis) {
  const hz = [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,
              24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,
              43,44,45,46,47,48,49,50];

  // The sidebar spans ALL Hz rows — we use rowspan on the first data row
  const totalHzRows = hz.length;

  // Build the right-side sidebar content (sits in a single tall cell via rowspan)
  const sidebar = `
    <div style="font-size:12px;font-weight:700;text-align:center;margin-bottom:5px;letter-spacing:.5px">VIBRATION TEST DATA SHEET</div>
    <table style="width:100%;border-collapse:collapse;border:none;margin-bottom:6px">
      <tr>
        <td style="border:none;padding:1px 2px;width:38%"><span class="jp-field-label">Job No.</span></td>
        <td style="border:none;padding:1px 2px" class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
      </tr>
      <tr>
        <td style="border:none;padding:1px 2px"><span class="jp-field-label">Date</span></td>
        <td style="border:none;padding:1px 2px;height:14px"></td>
      </tr>
      <tr>
        <td style="border:none;padding:1px 2px"><span class="jp-field-label">Axis</span></td>
        <td style="border:none;padding:1px 2px;font-weight:700;font-size:13px">${axis}</td>
      </tr>
    </table>
    <div style="text-align:center;border-top:1px solid #ccc;padding-top:5px;margin-bottom:6px">
      <img src="https://images.squarespace-cdn.com/content/v1/4ffd78c424accf259206d1dc/1473195765839-Z06GZYUXTVC8DBAGVE1V/logo-shadowed.png" style="max-height:36px;max-width:120px;object-fit:contain;display:block;margin:0 auto 4px" alt="NU Laboratories" />
      <span style="font-size:7px;color:#555;line-height:1.4">312 Old Allerton Rd., Annandale, NJ 08801<br>(908) 713-9300</span>
    </div>
    <div style="font-size:7.5px;font-style:italic;text-align:center;color:#555;margin-bottom:6px;border:1px solid #bbb;padding:2px">
      NOTE: RECORDED DATA IS DOUBLE AMPLITUDE
    </div>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">ENDURANCE</div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:6px">
      <tr>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:28%">Hz</td>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:36%">Input</td>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">Duration</td>
      </tr>
      ${Array.from({length:5}, () => `<tr>
        <td style="border:1px solid #888;padding:1px;height:13px"></td>
        <td style="border:1px solid #888;padding:1px"></td>
        <td style="border:1px solid #888;padding:1px"></td>
      </tr>`).join('')}
    </table>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TEST ARTICLE IDENTIFICATION</div>
    <div class="jp-auto" style="min-height:28px;padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.testArticleDesc || ''}</div>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TESTED FOR</div>
    <div class="jp-auto" style="padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.client || ''}</div>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">ACCELEROMETER LOCATIONS</div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:6px">
      <tr>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee;width:40%">INPUT (CH. 1)</td>
        <td style="border:1px solid #888;padding:2px;height:13px"></td>
      </tr>
      <tr>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">CH. 2</td>
        <td style="border:1px solid #888;padding:2px;height:13px"></td>
      </tr>
      <tr>
        <td style="border:1px solid #888;padding:2px;font-weight:700;background:#eee">CH. 3</td>
        <td style="border:1px solid #888;padding:2px;height:13px"></td>
      </tr>
    </table>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">REMARKS</div>
    <div style="min-height:42px;border:1px solid #bbb;padding:2px;margin-bottom:6px"></div>
    <div class="jp-section-label" style="padding:2px 3px;margin-bottom:2px">TEST ENGINEER</div>
    <div class="jp-auto" style="padding:2px 3px;margin-bottom:6px;font-size:8.5px;font-weight:600;color:#0a3d6b">${info.pm || ''}</div>
    <div style="font-size:8px;color:#666;border-top:1px solid #ccc;padding-top:3px">Sheet: ______________________</div>`;

  // Build hz rows — first row gets the rowspan sidebar cell
  const hzRows = hz.map((h, i) => `<tr>
    <td style="text-align:center;font-weight:700;background:#f9f9f9;width:5%">${h}</td>
    <td style="width:11%"></td>
    <td style="width:10%"></td>
    <td style="width:10%"></td>
    <td style="width:11%"></td>
    <td style="width:10%"></td>
    <td style="width:10%"></td>
    ${i === 0 ? `<td class="jp-sidebar" rowspan="${totalHzRows}" style="width:33%;vertical-align:top;padding:5px 6px">${sidebar}</td>` : ''}
  </tr>`).join('');

  return `<div class="jp-form">
  <table style="table-layout:fixed">
    <colgroup>
      <col style="width:5%"><col style="width:11%"><col style="width:10%"><col style="width:10%">
      <col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:33%">
    </colgroup>
    <tr>
      <td style="border:none;padding:0"></td>
      <td colspan="3" class="jp-col-header">Exploratory Frequency</td>
      <td colspan="3" class="jp-col-header">Variable Frequency</td>
      <td class="jp-header-cell" style="font-size:11px">VIBRATION TEST DATA SHEET</td>
    </tr>
    <tr>
      <td class="jp-col-header">Hz</td>
      <td class="jp-col-header">Input<br>(Ch.1)</td>
      <td class="jp-col-header">Ch. 2</td>
      <td class="jp-col-header">Ch. 3</td>
      <td class="jp-col-header">Input<br>(Ch.1)</td>
      <td class="jp-col-header">Ch. 2</td>
      <td class="jp-col-header">Ch. 3</td>
      <td class="jp-sidebar" style="padding:4px 6px;vertical-align:middle;text-align:center">
        <span style="font-size:10px;font-weight:700">JOB NO.</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;margin-left:4px;font-weight:700;color:#0a3d6b">${proj.name || ''}</span>
        &nbsp;&nbsp;
        <span style="font-size:10px;font-weight:700">AXIS ${axis}</span>
      </td>
    </tr>
    ${hzRows}
    <tr>
      <td colspan="7" style="font-size:7.5px;text-align:center;padding:2px;background:#f5f5f5;border:1px solid #ccc">
        Res. ____________ Hz
      </td>
      <td style="border:none;padding:0"></td>
    </tr>
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 9: Digital Photograph Index Sheet
// ─────────────────────────────────────────
function formPhotoIndex(proj, info) {
  const today = new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  const blankRows = Array.from({length:29}, (_,i) =>
    `<tr><td style="text-align:center;font-weight:700;width:15%">${i+1}</td><td></td></tr>`).join('');

  return `<div class="jp-form"><table>
    <tr><td colspan="2" class="jp-header-cell" style="font-size:15px">DIGITAL PHOTOGRAPH INDEX SHEET</td></tr>
    <tr>
      <td style="width:50%">
        <span class="jp-field-label">Job #</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${proj.name || ''}</span>
      </td>
      <td>
        <span class="jp-field-label">Customer</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${info.client || ''}</span>
        &nbsp;&nbsp;
        <span class="jp-field-label">Date</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${today}</span>
      </td>
    </tr>
    <tr>
      <td class="jp-col-header" style="width:15%">Index #</td>
      <td class="jp-col-header">Photo Description</td>
    </tr>
    ${blankRows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 10: Test Equipment List (NU Form #21-4)
// ─────────────────────────────────────────
function formEquipList(proj, info) {
  const today = new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  const blankRows = Array.from({length:22}, () =>
    `<tr class="jp-blank-row"><td colspan="2"></td><td></td><td></td><td></td></tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="3" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="2" class="jp-header-cell" style="font-size:15px">TEST EQUIPMENT LIST</td>
    </tr>
    <tr>
      <td style="width:14%"><span class="jp-field-label">Client</span></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td style="width:14%"><span class="jp-field-label">Job No.</span></td>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Date</span></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${today}</span></td>
      <td colspan="2"></td>
    </tr>
    <tr>
      <td class="jp-col-header" colspan="2">Description</td>
      <td class="jp-col-header" style="width:14%">Asset ID</td>
      <td class="jp-col-header" style="width:13%">Cal. Date</td>
      <td class="jp-col-header" style="width:13%">Cal. Due</td>
    </tr>
    ${blankRows}
    <tr><td colspan="5" style="font-size:8px;color:#666;padding:2px 4px">NU Form #21-4</td></tr>
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 11: Acoustic Noise Requirements
// ─────────────────────────────────────────
function formAcoustic(proj, info) {
  const freqs = [25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,
                 630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000];

  const freqRows = freqs.map(f => `<tr>
    <td style="text-align:center;font-weight:700;background:#f9f9f9">${f}</td>
    <td></td><td></td><td></td><td></td>
    <td></td><td></td><td></td><td></td><td></td>
  </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="5" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td colspan="5" class="jp-header-cell" style="font-size:15px">ACOUSTIC REQUIREMENTS</td>
    </tr>
    <tr>
      <td colspan="5" class="jp-section-label" style="padding:3px 5px">Job Information</td>
      <td colspan="5" class="jp-section-label" style="padding:3px 5px">Inputs</td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Job Number</span></td>
      <td colspan="3" class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
      <td colspan="2"><span class="jp-field-label">Plenum PSI</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Customer Name</span></td>
      <td colspan="3" class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td colspan="2"><span class="jp-field-label">Rotor 1</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Test Date</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Rotor 2</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Test Duration</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Rotor 3</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Required Overall SPL</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Rotor 4</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Chamber Size</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Overall Sound Pressure Levels</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Nozzle Size</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Control Mic.</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Compressor Size</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Mic 2</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="2"><span class="jp-field-label">Technician</span></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Mic 3</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="5" class="jp-section-label" style="padding:3px 5px">Specified Data</td>
      <td></td>
      <td colspan="4" class="jp-section-label" style="padding:3px 5px">Recorded Data</td>
    </tr>
    <tr>
      <td class="jp-col-header" style="width:9%">Freq. (Hz)</td>
      <td class="jp-col-header" style="width:8%">Min.</td>
      <td class="jp-col-header" style="width:8%">Max.</td>
      <td class="jp-col-header" style="width:10%">Required</td>
      <td class="jp-col-header" style="width:5%"></td>
      <td class="jp-col-header" style="width:12%">Proof</td>
      <td class="jp-col-header" style="width:12%">Start</td>
      <td class="jp-col-header" style="width:12%">Middle 1</td>
      <td class="jp-col-header" style="width:12%">Middle 2</td>
      <td class="jp-col-header" style="width:12%">End</td>
    </tr>
    ${freqRows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 12: Light Weight Shock Test
// ─────────────────────────────────────────
function formShockLWST(proj, info) {
  const blowRows = Array.from({length:17}, (_,i) => `<tr class="jp-blank-row">
    <td style="text-align:center;font-weight:700">${i+1}</td>
    <td></td><td></td><td></td><td></td><td></td><td></td>
  </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="4" style="font-weight:700;font-size:13px;border:2px solid #333;padding:7px">NU LABORATORIES / DATA SHEET</td>
      <td colspan="4" class="jp-header-cell" style="font-size:15px">LIGHT WEIGHT SHOCK TEST</td>
    </tr>
    <tr>
      <td class="jp-col-header" style="width:12%">Job #</td>
      <td class="jp-col-header" style="width:13%">Date</td>
      <td class="jp-col-header" style="width:13%">Tech</td>
      <td class="jp-col-header" colspan="2">Client</td>
      <td class="jp-col-header" colspan="3">Spec.</td>
    </tr>
    <tr>
      <td class="jp-auto"><span class="jp-field-value">${proj.name || ''}</span></td>
      <td></td><td></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td colspan="3"></td>
    </tr>
    <tr>
      <td colspan="8" class="jp-section-label" style="padding:3px 5px">UUT Information</td>
    </tr>
    <tr>
      <td><span class="jp-field-label">UUT</span></td><td colspan="2"></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">Classification</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">M/N</span></td><td colspan="2"></td>
      <td colspan="3"><span class="jp-field-label">UUT</span></td>
      <td colspan="2"></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">S/N</span></td><td colspan="2"></td>
      <td colspan="3"></td>
      <td colspan="2"><span class="jp-field-label">No. of Blows</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">DIM.</span></td><td colspan="2"></td>
      <td colspan="5"></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">FIX #</span></td><td colspan="2"></td>
      <td colspan="3"><span class="jp-field-label">Total</span></td>
      <td colspan="2"><span class="jp-field-label">Bolts</span></td>
    </tr>
    <tr>
      <td colspan="8" class="jp-section-label" style="padding:3px 5px">Witness Name${info.customerWitness && info.customerWitness !== 'No' ? ' — Customer Witness: ' + info.customerWitness : ''}</td>
    </tr>
    <tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
    <tr style="height:20px"><td colspan="5"></td><td colspan="3"></td></tr>
    <tr>
      <td colspan="5" class="jp-col-header">Test Conditions</td>
      <td colspan="3" class="jp-col-header">Monitor Desc.</td>
    </tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td>
      <td><span class="jp-field-label">Input Power</span></td><td colspan="2"></td></tr>
    <tr style="height:18px"><td colspan="2"></td><td colspan="3"></td><td colspan="3"></td></tr>
    <tr><td colspan="8" class="jp-section-label" style="padding:3px 5px">Shock Blow Information</td></tr>
    <tr>
      <td class="jp-col-header" style="width:8%">Blow</td>
      <td class="jp-col-header" style="width:14%">Axis</td>
      <td class="jp-col-header" style="width:10%">HH</td>
      <td class="jp-col-header" style="width:10%">GRP</td>
      <td class="jp-col-header" style="width:10%">Cond</td>
      <td class="jp-col-header" style="width:8%">OK?</td>
      <td class="jp-col-header" colspan="2">Discrepancy</td>
    </tr>
    ${blowRows}
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 13: ESS Batch Test Log (Octal-style)
// Serial # column, pre-filled ESS steps, checkbox grid per unit
// ─────────────────────────────────────────
function formOctalLog(proj, info) {
  // 12 blank serial number rows with Z/X/Y checkboxes
  const unitRows = Array.from({length:12}, () => `
    <tr>
      <td style="width:15%;font-weight:700"></td>
      <td style="width:55%">
        <table style="width:100%;border-collapse:collapse;border:none">
          <tr>
            <td style="border:none;padding:0;font-size:9px;width:25%">Vertical (Z)</td>
            <td style="border:none;padding:0;font-size:9px;width:25%">Long (X)</td>
            <td style="border:none;padding:0;font-size:9px;width:25%">Short (Y)</td>
            <td style="border:none;padding:0;font-size:9px;width:25%">Inspect</td>
          </tr>
          <tr>
            <td style="border:none;padding:1px 0">[ ] [ ]</td>
            <td style="border:none;padding:1px 0">[ ] [ ]</td>
            <td style="border:none;padding:1px 0">[ ] [ ]</td>
            <td style="border:none;padding:1px 0">[ ]</td>
          </tr>
        </table>
      </td>
      <td style="width:30%"></td>
    </tr>`).join('');

  const essSteps = [
    'Receive and unpack [&nbsp;&nbsp;&nbsp;] pcs',
    '',
    'Inspect all units for damage, scratches, uneven seams, rattling. Photograph and note any defects in test log.',
    '',
    'Load units into temperature chamber and start ESS test program',
    '',
    'Unload units from temperature chamber and save data to job folder',
    'Review data for correct temperature cycles',
    'Inspect units for damage, photograph any anomalies',
    '',
    'Vibrate each unit per ESS document, check for damage, photograph any anomalies. Record date in column to left, record time and run number in spaces below for each axis.',
  ];

  const stepRows = essSteps.map(s => `<tr>
    <td style="width:15%"></td>
    <td style="width:55%">${s}</td>
    <td style="width:30%"></td>
  </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="2" style="font-weight:700;font-size:14px;border:2px solid #333;padding:7px">NU LABORATORIES</td>
      <td class="jp-header-cell" style="font-size:15px">TEST LOG</td>
    </tr>
    <tr>
      <td style="width:15%"><span class="jp-field-label">Client</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.client || ''}</span></td>
      <td class="jp-auto"><span class="jp-field-label">Job No.</span> <span class="jp-field-value">${proj.name || ''}</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Test</span></td>
      <td class="jp-auto"><span class="jp-field-value">${info.testDesc || ''}</span></td>
      <td><span class="jp-field-label">Date</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Spec.</span></td><td></td>
      <td><span class="jp-field-label">Initials</span></td>
    </tr>
    <tr>
      <td><span class="jp-field-label">Materials</span></td>
      <td colspan="2" class="jp-auto"><span class="jp-field-value">${info.testArticleDesc || ''}</span></td>
    </tr>
    <tr><td colspan="3" class="jp-section-label" style="padding:3px 5px">Lab Conditions</td></tr>
    <tr>
      <td><span class="jp-field-label">Temp</span>&nbsp;</td>
      <td><span class="jp-field-label">RH</span>&nbsp;</td>
      <td><span class="jp-field-label">Atmospheric Pressure</span>&nbsp;</td>
    </tr>
    <tr>
      <td colspan="3"><span class="jp-field-label">Notes</span></td>
    </tr>
    <tr style="height:30px"><td colspan="3"></td></tr>
    <tr>
      <td class="jp-col-header" style="width:15%">Serial #</td>
      <td class="jp-col-header" style="width:55%">Log Entry</td>
      <td class="jp-col-header" style="width:30%">Init.</td>
    </tr>
    ${stepRows}
    <tr>
      <td colspan="3" class="jp-section-label" style="padding:3px 5px">
        Unit Test Tracking — Vertical (Z) &nbsp;|&nbsp; Long (X) &nbsp;|&nbsp; Short (Y) &nbsp;|&nbsp; Inspect
      </td>
    </tr>
    ${unitRows}
    <tr style="height:18px">
      <td colspan="3" style="font-size:9px;color:#555;padding:2px 5px">
        2nd Person verify that the correct vibration levels were applied. &nbsp;&nbsp; ESS completed, repack units for shipment.
      </td>
    </tr>
  </table></div>`;
}

// ─────────────────────────────────────────
// FORM 14: ESS Photo Index (Batch/Octal-style)
// Serial # rows with Z/X/Y axis photo checkboxes
// ─────────────────────────────────────────
function formOctalPhoto(proj, info) {
  const today = new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});

  const serialRows = Array.from({length:16}, () => `
    <tr>
      <td style="width:30%"></td>
      <td style="width:23%;text-align:center">[ ]</td>
      <td style="width:23%;text-align:center">[ ]</td>
      <td style="width:24%;text-align:center">[ ]</td>
    </tr>`).join('');

  return `<div class="jp-form"><table>
    <tr>
      <td colspan="4" class="jp-header-cell" style="font-size:15px">ESS PHOTO INDEX SHEET</td>
    </tr>
    <tr>
      <td style="width:40%">
        <span class="jp-field-label">Job #</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${proj.name || ''}</span>
      </td>
      <td colspan="2">
        <span class="jp-field-label">Customer</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${info.client || ''}</span>
      </td>
      <td>
        <span class="jp-field-label">Date</span>
        <span class="jp-auto" style="display:inline-block;padding:1px 6px;border-radius:3px;font-weight:700;color:#0a3d6b">${today}</span>
      </td>
    </tr>
    <tr>
      <td colspan="4" style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;padding:3px 5px;background:#f0f0f0">Pre-Test Photos</td>
    </tr>
    <tr><td colspan="4">Any incoming inspection damage</td></tr>
    <tr style="height:18px"><td colspan="4"></td></tr>
    <tr><td colspan="4">Units loaded into temperature chamber before test</td></tr>
    <tr style="height:18px"><td colspan="4"></td></tr>
    <tr><td colspan="4">Units loaded into temperature chamber after test, before removal</td></tr>
    <tr style="height:18px"><td colspan="4"></td></tr>
    <tr><td colspan="4">Units mounted for vibration:</td></tr>
    <tr style="height:18px"><td colspan="4"></td></tr>
    <tr>
      <td colspan="4" style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;padding:3px 5px;background:#f0f0f0">Unit Vibration Photos — check when photo taken</td>
    </tr>
    <tr>
      <td class="jp-col-header">Serial Number</td>
      <td class="jp-col-header">Vertical (Z)</td>
      <td class="jp-col-header">Long (X)</td>
      <td class="jp-col-header">Short (Y)</td>
    </tr>
    ${serialRows}
    <tr>
      <td colspan="4" style="font-size:9px;font-weight:700;text-transform:uppercase;color:#555;padding:3px 5px;background:#f0f0f0">Post-Test Photos</td>
    </tr>
    <tr><td colspan="4">Any post-test damage</td></tr>
    <tr style="height:18px"><td colspan="4"></td></tr>
    <tr>
      <td colspan="4"><span class="jp-field-label">Notes</span></td>
    </tr>
    <tr style="height:20px"><td colspan="4"></td></tr>
    <tr style="height:20px"><td colspan="4"></td></tr>
    <tr style="height:20px"><td colspan="4"></td></tr>
    <tr style="height:20px"><td colspan="4"></td></tr>
  </table></div>`;
}
