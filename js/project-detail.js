
// ===== PROJECT INFO DATA STORE =====
// ===== PROJECT INFO DATA STORE =====
const projectInfo = {}; // loaded from Supabase

// Default empty info for newly created projects
function defaultInfo(proj) {
  return {
    pm: '', po: '', contract: '', phase: 'Waiting on TP Approval', status: 'jobprep',
    startDate: '', endDate: '', tentativeTestDate: '', client: '', clientContact: '', clientEmail: '',
    clientPhone: '', billingType: 'Fixed Fee', invoiced: '', remaining: '',
    notes: '', desc: proj.desc || '',
    dcas: '', customerWitness: '', tpApproval: '', dpas: '', noforn: '',
    testDesc: '', testArticleDesc: '', quoteNumber: '',
    billedRevenue: 0, expectedRevenue: 0,
  };
}


// ===== RENDER INFO SHEET =====
// ===== RENDER INFO SHEET =====
function renderInfoSheet(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) {
    renderProjStickyHeader(projId);
  document.getElementById('infoWrap').innerHTML = `<div class="empty-state" style="margin:80px auto"><div class="empty-icon">&#x1F4CB;</div><div class="empty-msg">Select a project to view its info sheet</div></div>`;
    return;
  }
  if (!projectInfo[projId]) projectInfo[projId] = defaultInfo(proj);
  const info = projectInfo[projId];

  const statusMap = {
    'jobprep':{label:'Job Preparation',bg:'rgba(167,139,250,0.15)',color:'#a78bfa',dot:'#a78bfa'},
    'pending':{label:'Pending',bg:'rgba(232,162,52,0.25)',color:'#e8a234',dot:'#e8a234'},
    'pendretest':{label:'Pending - ReTest',bg:'rgba(251,146,60,0.15)',color:'#fb923c',dot:'#fb923c'},
    'active':{label:'Active',bg:'rgba(76,175,125,0.15)',color:'#4caf7d',dot:'#4caf7d'},
    'onhold':{label:'On Hold',bg:'rgba(122,122,133,0.15)',color:'#7a7a85',dot:'#7a7a85'},
    'complete':{label:'Complete',bg:'rgba(91,156,246,0.15)',color:'#5b9cf6',dot:'#5b9cf6'},
    'testcomplete':{label:'Testing Complete',bg:'rgba(76,175,125,0.15)',color:'#4caf7d',dot:'#4caf7d'},
    'closed':{label:'Closed',bg:'rgba(85,85,102,0.15)',color:'#555566',dot:'#555566'},
  };
  const phaseColors = {
    'Waiting on TP Approval': '#e05c5c',
    'Within 3 Months':        '#e8a234',
    '3 to 6 Months':          '#5b9cf6',
    'No Time Frame':          '#7a7a85',
  };
  const st = statusMap[info.status] || statusMap.active;
  const phColor = phaseColors[info.phase] || '#7a7a85';

  // Calc progress from tasks
  const projTasks = taskStore.filter(t => t.proj === projId);
  const pct = projTasks.length ? Math.round(projTasks.filter(t=>t.done).length / projTasks.length * 100) : 0;
  const circ = 2 * Math.PI * 20; // r=20
  const offset = circ - (pct / 100) * circ;

  const fmtDate = d => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
  };

  const field = (label, val, key, type='text') => `
    <div class="info-field" data-key="${key}">
      <div class="info-field-label">${label}</div>
      <div class="info-field-value" id="ifv-${key}">${val || '<span style="color:var(--border)">—</span>'}</div>
    </div>`;

  const dateField = (label, val, key) => `
    <div class="info-field" data-key="${key}">
      <div class="info-field-label">${label}</div>
      <div class="info-field-value info-click-edit" id="ifv-${key}"
        onclick="inlineEditInfoDate('${projId}','${key}',this)"
        title="Click to set date" style="cursor:text">
        ${val || '<span style="color:var(--border)">—</span>'}
      </div>
    </div>`;

  const clickField = (label, val, key, placeholder='') => `
    <div class="info-field" data-key="${key}">
      <div class="info-field-label">${label}</div>
      <div class="info-field-value info-click-edit" id="ifv-${key}"
        onclick="inlineEditInfoField('${projId}','${key}',this,'${placeholder}')"
        title="Click to edit" style="cursor:text">
        ${val || '<span style="color:var(--border)">—</span>'}
      </div>
    </div>`;


  document.getElementById('infoWrap').innerHTML = `
    <div class="info-hero">
      <div class="info-emoji" style="border-color:${proj.color}44;background:${proj.color}11">${proj.emoji}</div>
      <div class="info-hero-text">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
          <div class="info-proj-title" id="info-proj-title" style="margin:0">${proj.name}</div>
          <select class="proj-status-select" id="projStatusSelect"
            style="background:${st.bg};color:${st.color};border:1px solid ${st.color}44;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;outline:none;font-family:'DM Sans',sans-serif;flex-shrink:0;"
            onchange="changeProjectStatus('${projId}',this)">
            ${[
              ['jobprep','Job Preparation'],['pending','Pending'],['pendretest','Pending - ReTest'],
              ['active','Active'],['onhold','On Hold'],['complete','Complete'],
              ['testcomplete','Testing Complete'],['closed','Closed']
            ].map(([k,l]) => '<option value="'+k+'" '+(info.status===k?'selected':'')+'>'+l+'</option>').join('')}
          </select>
          ${(()=>{
            const inHouse = articleStore.filter(a => a.projId === projId && !a.shippedDate);
            if (!inHouse.length) return '';
            return `<div onclick="switchProjTab('sub-shipping')" title="${inHouse.length} test article${inHouse.length>1?'s':''} in house — click to view"
              style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;
              background:rgba(46,158,98,0.15);color:#2e9e62;border:1px solid rgba(46,158,98,0.35);flex-shrink:0;">
              📦 ${inHouse.length} In House
            </div>`;
          })()}
          <div class="phase-pill" style="background:${phColor}22;color:${phColor};flex-shrink:0;position:relative" onclick="openConditionDropdown('${projId}',this)" title="Click to change condition">
            ${info.phase||'Waiting on TP Approval'}
          </div>
          <div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-left:4px">${fmtDate(info.startDate)}${info.startDate||info.endDate?' &rarr; ':''} ${fmtDate(info.endDate)}</div>
        </div>
        <div class="desc-cards">
          <div class="desc-card">
            <div class="desc-card-header">Project Description</div>
            <div class="desc-card-body" id="info-proj-desc" onclick="inlineEditDesc('${projId}','desc',this)" title="Click to edit" style="cursor:text;min-height:40px">${(info.desc || proj.desc) || '<span style="color:var(--border)">Click to add project description…</span>'}</div>
          </div>
          <div class="desc-card">
            <div class="desc-card-header">Test Article Description</div>
            <div class="desc-card-body info-click-edit" id="info-test-article" onclick="inlineEditDesc('${projId}','testArticleDesc',this)" title="Click to edit" style="cursor:text;min-height:40px">${info.testArticleDesc || '<span style="color:var(--border)">Click to add test article description…</span>'}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
        <div class="info-progress-ring">
          <svg width="52" height="52" viewBox="0 0 52 52">
            <circle class="ring-bg" cx="26" cy="26" r="20"/>
            <circle class="ring-fill" cx="26" cy="26" r="20"
              stroke-dasharray="${circ}"
              stroke-dashoffset="${offset}"/>
          </svg>
          <div class="info-progress-pct">${pct}%</div>
        </div>
        <div style="font-size:10px;color:var(--muted);letter-spacing:.5px">COMPLETE</div>
      </div>

    </div>

    <div class="info-sections">
      <div class="info-section">
        <div class="info-section-title">Project Details</div>
        <div class="info-fields">
          <div class="info-field" data-key="pm">
            <div class="info-field-label">Project Manager</div>
            <div id="pmDropdownWrap" class="pm-dropdown-wrap">
              ${(()=>{
                const pm = employees.find(e => e.name === info.pm);
                const av  = pm ? pm.initials : (info.pm ? info.pm.slice(0,2).toUpperCase() : '?');
                const col = pm ? pm.color : '#7a7a85';
                const lbl = info.pm || '<span style="color:var(--border)">—</span>';
                return `<div class="pm-selected" id="pmSelected" onclick="openPmDropdown('${projId}')">
                  <div class="pm-selected-av" id="pmSelectedAv" style="background:${col}">${av}</div>
                  <div class="pm-selected-name" id="pmSelectedName">${lbl}</div>
                  <div class="pm-selected-caret">&#x25BE;</div>
                </div>
                <div class="pm-dropdown" id="pmDropdown">
                  <input class="pm-dropdown-search" id="pmSearch" placeholder="Search employees…" oninput="renderPmOptions(this.value)" />
                  <div class="pm-list" id="pmList"></div>
                  <div class="pm-clear" onclick="clearPm()">&#x2715; Clear selection</div>
                </div>`;
              })()}
            </div>
          </div>
          ${clickField('PO Number', info.po, 'po', 'PO Number…')}
          ${clickField('Quote Number', info.quoteNumber, 'quoteNumber', 'Quote Number…')}
          ${field('Billing Type', info.billingType, 'billingType')}
        </div>
      </div>
      <div class="info-section">
        <div class="info-section-title">Client & Contact</div>
        <div class="info-fields">
          <div class="info-field">
            <div class="info-field-label">Client / Company</div>
            <div class="client-picker-wrap" id="clientPickerWrap">
              ${(()=>{
                const cl = clientStore.find(c => c.id === info.clientId);
                const nm = cl ? cl.name : (info.client || '<span style="color:var(--border)">—</span>');
                return `<div class="client-picker-selected" id="clientPickerSelected" onclick="openClientPicker('${projId}')">
                  <div class="client-picker-name">${nm}</div>
                  <div style="margin-left:auto;font-size:10px;color:var(--muted)">&#x25BE;</div>
                </div>
                <div class="client-picker-dropdown" id="clientPickerDropdown" style="display:none">
                  <input class="client-picker-search" id="clientPickerSearch" placeholder="Search clients…" oninput="renderClientPickerList('${projId}',this.value)" />
                  <div class="client-picker-list" id="clientPickerList"></div>
                  <div class="client-picker-clear" onclick="clearClientPicker('${projId}')">&#x2715; Clear</div>
                </div>`;
              })()}
            </div>
          </div>
          <div class="info-field">
            <div class="info-field-label">Contact Person</div>
            <div class="client-picker-wrap" id="contactPickerWrap">
              ${(()=>{
                const ct = contactStore.find(c => c.id === info.contactId);
                const nm = ct ? ct.firstName+' '+ct.lastName : (info.clientContact || '<span style="color:var(--border)">—</span>');
                const em = ct ? ct.email : '';
                return `<div class="client-picker-selected" id="contactPickerSelected" onclick="openContactPicker('${projId}')">
                  <div>
                    <div class="client-picker-name">${nm}</div>
                    ${em ? `<div style="font-size:11px;color:var(--muted)">${em}</div>` : ''}
                  </div>
                  <div style="margin-left:auto;font-size:10px;color:var(--muted)">&#x25BE;</div>
                </div>
                <div class="client-picker-dropdown" id="contactPickerDropdown" style="display:none">
                  <input class="client-picker-search" id="contactPickerSearch" placeholder="Search contacts…" oninput="renderContactPickerList('${projId}',this.value)" />
                  <div class="client-picker-list" id="contactPickerList"></div>
                  <div class="client-picker-clear" onclick="clearContactPicker('${projId}')">&#x2715; Clear</div>
                </div>`;
              })()}
            </div>
          </div>
          ${dateField('Created Date', fmtDate(info.startDate), 'startDate')}
          ${dateField('Test Complete Date', fmtDate(info.testcompleteDate), 'testcompleteDate')}
          ${dateField('Closed Date', fmtDate(info.endDate), 'endDate')}
          ${dateField('Tentative Test Date', fmtDate(info.tentativeTestDate), 'tentativeTestDate')}
        </div>
      </div>
    </div>


    <div class="info-sections" style="margin-top:20px">
      <div class="info-section" style="grid-column:1/-1">
        <div class="info-section-title">Approvals &amp; Compliance</div>
        <div class="info-fields" style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
          ${pickField('DPAS', info.dpas, 'dpas', projId, [
            {value:'DO', label:'DO', color:'var(--purple)'},
            {value:'DX', label:'DX', color:'var(--amber)'}
          ])}
          ${pickField('NOFORN Dist C/D', info.noforn, 'noforn', projId, [
            {value:'No',  label:'No',  color:'var(--muted)'},
            {value:'Yes', label:'Yes', color:'var(--red)'}
          ])}
          ${pickField('DCAS', info.dcas, 'dcas', projId, [
            {value:'No',  label:'No',  color:'var(--muted)'},
            {value:'Yes', label:'Yes', color:'var(--green)'},
            {value:'CNF', label:'CNF', color:'var(--blue)'}
          ])}
          ${pickField('Customer Witness', info.customerWitness, 'customerWitness', projId, [
            {value:'Yes', label:'Yes', color:'var(--green)'},
            {value:'No',  label:'No',  color:'var(--muted)'},
            {value:'CNF', label:'CNF', color:'var(--blue)'}
          ])}
          ${pickField('TP Approval', info.tpApproval, 'tpApproval', projId, [
            {value:'Yes',          label:'Yes',          color:'var(--green)'},
            {value:'No',           label:'No',           color:'var(--red)'},
            {value:'Partial',      label:'Partial',      color:'var(--amber)'},
            {value:'Not Required', label:'Not Required', color:'var(--muted)'}
          ])}
        </div>
      </div>
    </div>

    <div class="proj-summary-panel" id="projSummaryPanel"></div>



    <div class="info-notes-section">
      <div class="info-section-title" style="margin-bottom:12px">Notes &amp; Context</div>
      <div class="info-notes-body" id="infoNotes" onclick="editNotes('${projId}')">${info.notes || ''}</div>
    </div>

<!-- tasks moved to Tasks tab -->


  `;

  renderProjSummary(projId);
  // Tasks are on the Tasks tab
}


// ===== INFO EDIT MODE =====
// ===== INFO EDIT MODE =====


async function inlineEditInfoDate(projId, key, el) {
  if (el.querySelector('input')) return;
  const info = projectInfo[projId] || {};
  const current = info[key] || '';
  el.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'info-input';
  input.value = current;
  input.style.cssText = 'width:100%;margin:0;color-scheme:dark';
  el.appendChild(input);
  input.focus();

  const colMap = { startDate: 'start_date', endDate: 'end_date', tentativeTestDate: 'tentative_test_date', testcompleteDate: 'testcomplete_date' };

  const save = async () => {
    const val = input.value;
    if (!projectInfo[projId]) projectInfo[projId] = {};
    projectInfo[projId][key] = val;
    const col = colMap[key] || key;
    if (sb) await sb.from('project_info').update({ [col]: val || null }).eq('project_id', projId);
    renderInfoSheet(projId);
    toast('Saved');
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') renderInfoSheet(projId);
  });
}

async function inlineEditInfoField(projId, key, el, placeholder) {
  if (el.querySelector('input')) return; // already editing
  const info = projectInfo[projId] || {};
  const current = info[key] || '';
  el.innerHTML = '';
  const input = document.createElement('input');
  input.className = 'info-input';
  input.value = current;
  input.placeholder = placeholder || '';
  input.style.cssText = 'width:100%;margin:0';
  el.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const val = input.value.trim();
    if (!projectInfo[projId]) projectInfo[projId] = {};
    projectInfo[projId][key] = val;
    // Map key to DB column
    const colMap = { po: 'po_number', quoteNumber: 'quote_number', pm: 'pm', contract: 'contract_value', billingType: 'billing_type' };
    const col = colMap[key] || key;
    if (sb) await sb.from('project_info').update({ [col]: val || null }).eq('project_id', projId);
    renderInfoSheet(projId);
    toast('Saved');
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { renderInfoSheet(projId); }
  });
}

async function inlineEditDesc(projId, key, el) {
  if (el.querySelector('textarea')) return; // already editing
  const info = projectInfo[projId] || {};
  const proj = projects.find(p => p.id === projId) || {};
  // Fall back to proj.desc for description field
  const current = info[key] || (key === 'desc' ? (proj.desc || '') : '');
  const orig = el.innerHTML;
  el.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'info-textarea';
  ta.value = current;
  ta.style.cssText = 'width:100%;min-height:80px;margin:0;resize:vertical';
  ta.placeholder = key === 'desc' ? 'Project description…' : 'Test article description…';
  el.appendChild(ta);
  ta.focus();
  ta.addEventListener('blur', async () => {
    const val = ta.value.trim();
    if (!projectInfo[projId]) projectInfo[projId] = {};
    projectInfo[projId][key] = val;
    // Save to Supabase
    if (sb) {
      if (key === 'desc') {
        // Project description lives on the projects table
        await sb.from('projects').update({ description: val }).eq('id', projId);
      } else {
        // Test article description on project_info
        await sb.from('project_info').update({ test_article_description: val }).eq('project_id', projId);
      }
    }
    renderInfoSheet(projId);
    toast('Saved');
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { el.innerHTML = orig; }
  });
}



function makeFieldsEditable(projId) {
  const info = projectInfo[projId];
  const editableKeys = ['pm','po','billingType','client','clientContact','clientEmail','clientPhone','quoteNumber'];
  const textareaKeys = [];
  const dateKeys = ['startDate','endDate','tentativeTestDate','testcompleteDate'];

  editableKeys.forEach(key => {
    const el = document.getElementById('ifv-' + key);
    if (!el) return;
    const val = info[key] || '';
    el.innerHTML = `<input class="info-input" data-key="${key}" value="${val.replace(/"/g,'&quot;')}" placeholder="Enter ${key}..." />`;
  });

  textareaKeys.forEach(key => {
    const el = document.getElementById('ifv-' + key);
    if (!el) return;
    const val = (info[key] || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    el.innerHTML = `<textarea class="info-textarea" data-key="${key}" style="min-height:100px;margin-top:4px">${val}</textarea>`;
  });

  dateKeys.forEach(key => {
    const el = document.getElementById('ifv-' + key);
    if (!el) return;
    const val = info[key] || '';
    el.innerHTML = `<input class="info-input" type="date" data-key="${key}" value="${val}" style="color-scheme:dark" />`;
  });

  // Make desc card editable
  const descEl = document.getElementById('info-proj-desc');
  if (descEl) {
    descEl.style.padding = '0';
    descEl.innerHTML = '<textarea style="width:100%;background:transparent;border:none;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;line-height:1.65;padding:12px 14px;outline:none;resize:vertical;min-height:80px;" id="edit-desc" placeholder="Project description...">' + (info.desc||proj.desc||'') + '</textarea>';
  }
  const testArticleEl = document.getElementById('info-test-article');
  if (testArticleEl) {
    testArticleEl.style.padding = '0';
    testArticleEl.innerHTML = '<textarea style="width:100%;background:transparent;border:none;color:var(--text);font-family:\'DM Sans\',sans-serif;font-size:13px;line-height:1.65;padding:12px 14px;outline:none;resize:vertical;min-height:80px;" data-key="testArticleDesc" placeholder="Test article description...">' + (info.testArticleDesc||'') + '</textarea>';
  }

  // Make notes editable
  const notesEl = document.getElementById('infoNotes');
  if (notesEl) {
    notesEl.innerHTML = `<textarea class="info-textarea" id="edit-notes" style="min-height:120px" placeholder="Add notes...">${info.notes || ''}</textarea>`;
    notesEl.onclick = null;
  }

  // Mark fields editable
  document.querySelectorAll('.info-field').forEach(f => f.classList.add('editable'));
}

async function collectAndSave(projId) {
  const info = projectInfo[projId];
  if (!info) return;

  // Collect form fields into local state
  document.querySelectorAll('.info-input[data-key], .info-textarea[data-key]').forEach(inp => {
    info[inp.dataset.key] = inp.value.trim();
  });
  const descTA = document.getElementById('edit-desc');
  if (descTA) info.desc = descTA.value.trim();
  const testArticleTA = document.getElementById('info-test-article')?.querySelector('textarea');
  if (testArticleTA) info.testArticleDesc = testArticleTA.value.trim();
  const notesTA = document.getElementById('edit-notes');
  if (notesTA) info.notes = notesTA.value.trim();

  // Sync desc to project store
  const proj = projects.find(p => p.id === projId);
  if (proj) proj.desc = info.desc;

  // Persist to Supabase
  if (!sb) return;
  const row = {
    pm: info.pm, po_number: info.po, contract_amount: info.contract,
    billing_type: info.billingType, remaining: info.remaining,
    client: info.client, client_contact: info.clientContact,
    client_email: info.clientEmail, client_phone: info.clientPhone,
    start_date: info.startDate||null, end_date: info.endDate||null, tentative_test_date: info.tentativeTestDate||null,
    phase: info.phase, status: info.status, notes: info.notes, description: info.desc,
    dcas: info.dcas||null, customer_witness: info.customerWitness||null, tp_approval: info.tpApproval||null,
    dpas: info.dpas||null, noforn: info.noforn||null,
    test_description: info.testDesc||null, test_article_description: info.testArticleDesc||null,
    quote_number: info.quoteNumber||null,
  };
  const { error } = await sb.from('project_info').upsert({ project_id: projId, ...row }, { onConflict: 'project_id' });
  if (error) console.error('upsert project_info', error);
  if (info.desc !== undefined) {
    await sb.from('projects').update({ description: info.desc }).eq('id', projId);
  }
}

function editNotes(projId) {
  const el = document.getElementById('infoNotes');
  if (!el || el.querySelector('textarea')) return;
  const info = projectInfo[projId];
  el.innerHTML = `<textarea class="info-textarea" id="quick-notes" style="min-height:120px">${info.notes || ''}</textarea>`;
  el.onclick = null;
  const ta = document.getElementById('quick-notes');
  ta.focus();
  ta.addEventListener('blur', () => {
    info.notes = ta.value.trim();
    el.textContent = info.notes;
    el.onclick = () => editNotes(projId);
    toast('Notes saved');
  });
}

const PHASE_CYCLE = ['Waiting on TP Approval','Within 3 Months','3 to 6 Months','No Time Frame'];

async function changeProjectStatus(projId, selectEl) {
  const info = projectInfo[projId];
  if (!info) return;
  const newStatus = selectEl.value;
  const currentStatus = info.status;

  // Any manager can set complete or closing
  const isManager_ = isManager() || can('mark_complete');
  // Only Jordan can approve closed
  const isJordan = currentEmployee && currentEmployee.name === 'Jordan McAdoo';

    const SM = {
    jobprep:     {bg:'rgba(167,139,250,0.15)',color:'#a78bfa'},
    pending:     {bg:'rgba(232,162,52,0.25)', color:'#e8a234'},
    pendretest:  {bg:'rgba(251,146,60,0.15)', color:'#fb923c'},
    active:      {bg:'rgba(76,175,125,0.15)', color:'#4caf7d'},
    onhold:      {bg:'rgba(122,122,133,0.15)',color:'#7a7a85'},
    complete:    {bg:'rgba(91,156,246,0.15)', color:'#5b9cf6'},
    testcomplete:{bg:'rgba(76,175,125,0.15)', color:'#4caf7d'},
    closing:     {bg:'rgba(232,162,52,0.25)', color:'#e8a234'},
    closed:      {bg:'rgba(85,85,102,0.15)',  color:'#555566'},
  };

  const resetSelect = () => {
    selectEl.value = currentStatus;
    const s = SM[currentStatus] || SM.active;
    selectEl.style.background = s.bg;
    selectEl.style.color = s.color;
    selectEl.style.borderColor = s.color + '44';
  };

  // Block: only Linda can mark complete
  if (newStatus === 'complete' && !can('mark_complete')) {
    toast('⚠ You do not have permission to mark a project Complete.', 'error');
    resetSelect(); return;
  }

  // Block: complete requires all tasks complete/billed/cancelled
  if (newStatus === 'complete') {
    const projTasks = taskStore.filter(t => t.proj === projId);
    const blocking = projTasks.filter(t => !['complete','billed','cancelled'].includes(t.status));
    if (blocking.length > 0) {
      toast(`⚠ Cannot mark Complete — ${blocking.length} task${blocking.length>1?'s':''} still open.`, 'error');
      resetSelect(); return;
    }
  }

  // Block: only Linda can mark closing, and only from complete
  if (newStatus === 'closing') {
    if (!can('mark_closing')) {
      toast('⚠ You do not have permission to mark a project as Closing.', 'error');
      resetSelect(); return;
    }
    if (currentStatus !== 'complete') {
      toast('⚠ Project must be Complete before marking as Closing.', 'error');
      resetSelect(); return;
    }
  }

  // Block: only Jordan can mark closed, and only from closing
  if (newStatus === 'closed') {
    if (!can('mark_closed') && !isJordan) {
      toast('⚠ You do not have permission to close a project.', 'error');
      resetSelect(); return;
    }
    if (currentStatus !== 'closing') {
      toast('⚠ Project must be in Closing status before it can be Closed.', 'error');
      resetSelect(); return;
    }
  }

  // All checks passed — save
  info.status = newStatus;
  const dbStatusPayload = { status: newStatus };
  // Record date when marked testcomplete
  if (newStatus === 'testcomplete') {
    const today = new Date().toISOString().slice(0,10);
    info.testcompleteDate = today;
    dbStatusPayload.testcomplete_date = today;
  }
  // Auto-set Closed Date when marked closed
  if (newStatus === 'closed' && !info.endDate) {
    const today = new Date().toISOString().slice(0,10);
    info.endDate = today;
    dbStatusPayload.end_date = today;
  }
  if (sb) dbUpdate('project_info', projId, dbStatusPayload);

  const s = SM[newStatus] || SM.active;
  selectEl.style.background = s.bg;
  selectEl.style.color = s.color;
  selectEl.style.borderColor = s.color + '44';

  // Notify Jordan when status goes to closing
  if (newStatus === 'closing') {
    toast('Project marked as Closing — Jordan has been notified for approval.');
    // TODO: create notification for Jordan (phase 2)
  } else if (newStatus === 'closed') {
    toast('Project closed successfully.');
  } else {
    toast('Status updated');
  }

  renderProjStickyHeader(projId);
}

async function openConditionDropdown(projId, el) {
  if (el.querySelector('select')) return; // already open
  const sel = document.createElement('select');
  sel.className = 'proj-status-select';
  sel.style.cssText = 'position:absolute;z-index:999;top:100%;left:0;margin-top:4px;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;background:var(--surface2);border:1px solid var(--border);color:var(--text);cursor:pointer;font-family:"DM Sans",sans-serif;min-width:180px;';
  const info = projectInfo[projId] || {};
  ['Waiting on TP Approval','Within 3 Months','3 to 6 Months','No Time Frame'].forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    if ((info.phase||'Waiting on TP Approval') === v) o.selected = true;
    sel.appendChild(o);
  });
  el.style.position = 'relative';
  el.appendChild(sel);
  sel.focus();
  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const val = sel.value;
    if (!projectInfo[projId]) projectInfo[projId] = {};
    projectInfo[projId].phase = val;
    if (sb) {
      const { error } = await sb.from('project_info').update({ phase: val }).eq('project_id', projId);
      if (error) { console.error('Condition save error:', error); toast('⚠ Could not save condition'); }
      else toast('Condition saved');
    }
    if (sel.parentNode) sel.remove();
    renderProjStickyHeader(projId);
    renderInfoSheet(projId);
  };
  sel.addEventListener('change', save);
  sel.addEventListener('blur', () => setTimeout(() => { if (!saved) save(); }, 200));
}

function cyclePhase(projId) {
  const info = projectInfo[projId];
  const i = PHASE_CYCLE.indexOf(info.phase);
  info.phase = PHASE_CYCLE[(i + 1) % PHASE_CYCLE.length];
  renderInfoSheet(projId);
}




// ===== PROJECT SUMMARY PANEL =====
// ===== PROJECT SUMMARY PANEL =====
function fmtShortDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
}
function fmt$(n){ return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtH(n){ return n > 0 ? n.toFixed(1)+'h' : '—'; }

function renderExpectedRevenue(projId){ renderProjSummary(projId); }

function renderProjSummary(projId) {
  const panel = document.getElementById('projSummaryPanel');
  if (!panel) return;

  // Revenue
  const tasks      = taskStore.filter(t => t.proj === projId);
  const expected   = tasks.reduce((s,t) => s + (t.fixedPrice||0), 0);
  // Billed = tasks with status 'billed'
  const billed     = tasks.filter(t => t.status === 'billed')
                          .reduce((s,t) => s + (t.fixedPrice||0), 0);
  const remaining  = expected - billed;

  // Hours — use stored value from project_info (covers all history including pre-2025)
  const totalHours = (projectInfo[projId] || {}).actualHours || 0;

  // Expenses
  const expenses     = expenseStore.filter(e => e.projId === projId);
  const plannedTotal = expenses.reduce((s,e) => s+(e.planned||0), 0);
  const actualTotal  = expenses.reduce((s,e) => s+(e.actual||0), 0);
  const expDiff      = plannedTotal - actualTotal;

  panel.innerHTML = `
    <div class="proj-sum-card">
      <div class="proj-sum-label">Expected Revenue</div>
      <div class="proj-sum-val" style="color:var(--green)">${expected > 0 ? fmt$(expected) : '—'}</div>
      <div class="proj-sum-sub">Total value of all task prices</div>
    </div>
    <div class="proj-sum-card">
      <div class="proj-sum-label">Billed Revenue</div>
      <div class="proj-sum-val" style="color:var(--blue)">${billed > 0 ? fmt$(billed) : '—'}</div>
      <div class="proj-sum-sub">From completed &amp; invoiced tasks</div>
    </div>
    <div class="proj-sum-card">
      <div class="proj-sum-label">Remaining Revenue</div>
      <div class="proj-sum-val" style="color:${remaining < 0 ? 'var(--red)' : 'var(--amber)'}">${expected > 0 ? fmt$(remaining) : '—'}</div>
      <div class="proj-sum-sub">Expected minus billed</div>
    </div>
    <div class="proj-sum-card">
      <div class="proj-sum-label">Total Hours Charged</div>
      <div class="proj-sum-val" style="color:var(--blue)">${fmtH(totalHours)}</div>
      <div class="proj-sum-sub">${totalHours > 0 ? 'Logged across all timesheet weeks' : 'No hours logged yet'}</div>
    </div>
    <div class="proj-sum-card">
      <div class="proj-sum-label">Total Expenses</div>
      <div class="proj-sum-val" style="color:${actualTotal > plannedTotal ? 'var(--red)' : 'var(--amber)'}">${actualTotal > 0 ? fmt$(actualTotal) : '—'}</div>
      <div class="proj-sum-sub">${plannedTotal > 0
        ? (expDiff >= 0
            ? fmt$(expDiff)+' under planned budget'
            : fmt$(Math.abs(expDiff))+' over planned budget')
        : 'No expenses logged yet'}</div>
    </div>
    ${(() => {
      const jobRate = (totalHours > 0 && billed > 0) ? (billed - actualTotal) / totalHours : null;
      const rateColor = jobRate === null ? 'var(--muted)' : jobRate >= 150 ? 'var(--green)' : jobRate >= 75 ? 'var(--amber)' : 'var(--red)';
      const rateStr = jobRate !== null ? '$' + Math.round(jobRate) + '/hr' : '—';
      return '<div class="proj-sum-card">'+
        '<div class="proj-sum-label">Job Rate</div>'+
        '<div class="proj-sum-val" style="color:'+rateColor+'">' + rateStr + '</div>'+
        '<div class="proj-sum-sub">(Billed − Expenses) ÷ Hours</div>'+
        '</div>';
    })()}
  `;

  // Update grid to 6 cols
  panel.style.gridTemplateColumns = 'repeat(6,1fr)';

  // Expenses are on their own tab
  if (document.getElementById('panel-expenses')?.classList.contains('active')) renderExpensesPanel(projId);
}


// ===== EXPENSES =====
// ===== EXPENSES =====
let expenseStore = []; // loaded from Supabase
let sectionStore = []; // task section headers, loaded from Supabase
let permissionRoles = []; // loaded from Supabase

// Historical expense data from import
const HIST_EXPENSES = [
['Metals USA','Materials',826.0,0.0,'Setup and Prepare for Test','13057','10/15/19'],
['PCB Piezotronics','General',0.0,1388.5,'Instrumentation 22 Channels - Shock','12485','10/17/19'],
['Mechanical Precision','Materials',0.0,150.0,'','12973','8/9/19'],
['UPS','General',0.0,16.38,'','13250','12/9/21'],
['Dat','General',0.0,240.0,'RE101','12864','4/1/19'],
['Dat','General',0.0,240.0,'CS114','12864','4/2/19'],
['Dat','General',0.0,240.0,'RS101','12864','4/8/19'],
['Dat','General',0.0,60.0,'CS106','12864','4/8/19'],
['Home Depot','General',0.0,22.5,'','12864','4/10/19'],
['Job Lot','General',0.0,10.31,'Setup','12864','4/1/19'],
['Job Lot','General',0.0,6.0,'Setup','12864','4/1/19'],
['Dat','General',0.0,240.0,'RE102','12864','4/1/19'],
['Materials','Materials',400.0,0.0,'Fabricate dummy mass per NU Labs drawing.','13217','12/1/22'],
['Fastenal','Materials',0.0,126.25,'','13131','5/13/20'],
['SkyGeek','Materials',1450.0,1563.3,'Misc. Testing Fluid Immersion','12951','4/2/19'],
['','Materials',10.0,0.0,'Misc. Testing Fluid Immersion','12951','4/2/19'],
['McMaster Carr','Materials',0.0,22.02,'Setup for MW Shock Test- Injection Unit','13198','5/3/21'],
['Eric Noon- travel to Nova','Travel',0.0,66.0,'Rental of power source required for the power quality test','12832','8/23/19'],
['Doug Gromek','Travel',0.0,51.0,'','12967','1/15/20'],
['Skylands','General',0.0,521.73,'','13078','1/15/20'],
['Alltest Instruments','General',0.0,750.0,'','13056','1/27/20'],
['Fox','Materials',0.0,116.41,'','12930','8/26/19'],
['McMaster Carr','Materials',0.0,24.46,'','12973','8/15/19'],
['Fox Lumber','Materials',0.0,27.91,'','12930','8/29/19'],
['Metals USA','Materials',0.0,116.91,'Fixture Fabrication Fabricate the test fixture.','12941','8/27/19'],
['Zoro','Materials',0.0,1178.41,'Setup and Prepare for Test','13019','8/15/19'],
['Lowes','Materials',0.0,5.52,'','12967','2/10/20'],
['Ferguson','Materials',0.0,13.32,'','12967','2/13/20'],
['Metals USA','Materials',0.0,1437.0,'Fixture Fabrication Fabricate the test fixture.','12941','8/20/19'],
['Flanges','General',110.0,0.0,'','13087','1/14/20'],
['McMaster Carr','Materials',0.0,48.53,'','13136','5/21/20'],
['Hesco','Materials',0.0,27.42,'Misc. Testing Proof of Station.','13021','8/26/19'],
['Alex Rothschild','Travel',0.0,66.5,'','13188','11/2/20'],
['Dat','General',0.0,240.0,'RE102','12930','9/17/19'],
['Metals USA','Materials',0.0,1391.23,'Fixture Fabrication Fabricate the test fixture.','12941','9/12/19'],
['Metals USA','Materials',0.0,867.39,'Fixture Fabrication Fabricate the test fixture.','12941','8/27/19'],
['Home Depot','General',0.0,46.08,'Noise Chamber','N2020- Lab Maintenance 2020','1/27/20'],
['Hunterdon Mill','Materials',0.0,47.17,'Setup and Prepare for Test','12934','1/21/20'],
['Dat','General',0.0,360.0,'Power Quality Testing 1.2 Set up and perform the referenced power quality tests','12863','9/24/19'],
['Rental','General',1000.0,0.0,'Power Source rental per week','13222','2/25/21'],
['McMaster Carr','Materials',0.0,88.96,'Setup and Prepare for Test','13009','8/1/19'],
['Drobach','General',2500.0,0.0,'Noise test','13222','2/25/21'],
['Wilson Products','Materials',800.0,0.0,'','13054','2/4/20'],
['McMaster Carr','Materials',0.0,55.38,'Setup and Prepare for Test','12967','9/23/19'],
['McMaster Carr','Materials',0.0,82.67,'Setup for MW shock','13152','5/14/21'],
['McMaster Carr','Materials',0.0,119.21,'','13258','12/13/21'],
['McMaster Carr','Materials',0.0,85.37,'','13197','4/30/21'],
['McMaster Carr','Materials',0.0,18.53,'','13197','4/30/21'],
['Metals USA','Materials',0.0,1104.9,'','13025','9/12/19'],
['Metals USA','Materials',0.0,143.91,'Fixture Fabrication Fabricate the test fixture.','12941','9/12/19'],
['McMaster Carr','General',0.0,48.96,'Misc. Testing Setup a circulating system for the tests','12918','8/8/19'],
['Home Depot','Materials',0.0,38.26,'','12957','9/27/19'],
['Home Depot','Materials',0.0,9.05,'','12863','9/20/19'],
['Cooper Electric','Materials',0.0,7.07,'','12863','9/20/19'],
['Walmart','General',0.0,10.64,'','12930','9/12/19'],
['McMaster Carr','Materials',0.0,40.78,'Misc. Testing Travel to DC Fabricators facility, setup for the test and return to NU Laboratories.','12967','10/15/19'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility','13038','10/15/19'],
['Dat','General',0.0,240.0,'RE102','12930','9/24/19'],
['Dat','General',0.0,330.0,'','12863','9/30/19'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility','13028','9/26/19'],
['Ebay purchase- Jordan','Materials',0.0,51.92,'','12890','5/22/20'],
['McMaster Carr','Materials',0.0,48.76,'','13136','5/22/20'],
['Marvic','General',0.0,421.28,'','12890','10/17/19'],
['Fastenal','Materials',0.0,136.62,'Noise Susceptibility','13028','9/25/19'],
['McMaster Carr','Materials',0.0,16.92,'Setup and Prepare for Test','12914','3/8/21'],
['UPS','General',0.0,11.94,'','12943','2/20/20'],
['McMaster Carr','Materials',0.0,42.86,'','12890','10/23/19'],
['Dat','General',0.0,210.0,'A/E Additional CS114 and CS116 testing.','12930','9/30/19'],
['Adam Gano','Travel',0.0,53.0,'Misc. Testing Travel to DC Fabricators facility, setup for the test and return to NU Laboratories.','12967','9/27/19'],
['Home Depot','Materials',0.0,17.5,'','12971','11/11/19'],
['Petroleum Service','Materials',0.0,294.17,'','13410','7/10/24'],
['Job Lot','General',0.0,31.97,'Noise Chamber','N2020- Lab Maintenance 2020','1/27/20'],
['Drobach','General',0.0,2457.7,'Noise Susceptibility','13026','11/13/19'],
['Hercules Sealing','Materials',0.0,105.87,'','13547','7/10/24'],
['Wilson Products','Materials',1200.0,711.51,'','13586','10/25/24'],
['Hunterdon Mill','Materials',0.0,24.75,'','13332','1/20/22'],
['McMaster Carr','Materials',0.0,9.7,'','13109','5/13/20'],
['Drobach','General',0.0,1266.0,'','13078','1/29/20'],
['Springfield Metal Production','Travel',0.0,36.0,'','13509','3/26/24'],
['Travel','Travel',0.0,28.0,'','13180','3/21/24'],
['Disposal of fluids','General',250.0,0.0,'','12951','4/2/19'],
['Hesco','Materials',0.0,6.43,'','12856','12/5/19'],
['Hunterdon Mill','Materials',0.0,14.82,'','12937','4/4/19'],
['','Materials',180.0,0.0,'Misc. Testing Fluid Immersion','12951','4/2/19'],
['','Materials',1025.0,0.0,'Misc. Testing Compression','12951','4/2/19'],
['Test Equipment Depot','Materials',1425.0,156.25,'Misc. Testing Durometer, Class A','12951','4/2/19'],
['PA Steel','Materials',3000.0,0.0,'','13718','2/26/26'],
['PA steel- deliver','Materials',1300.0,0.0,'','13718','2/26/26'],
['McMaster Carr','Materials',0.0,-56.7,'','13552','9/27/24'],
['Wilson Products','Materials',400.0,0.0,'','13425','11/16/22'],
['Metals USA','Materials',2690.0,0.0,'Setup and Prepare for Test','13080','12/18/19'],
['Metals Depot','Materials',3500.0,0.0,'Setup and Prepare for Test','13080','12/18/19'],
['Flat Bar','Materials',410.0,0.0,'Setup and Prepare for Test','13080','12/18/19'],
['Additional budgeted items','Materials',3000.0,0.0,'','13080','12/18/19'],
['McMaster Carr','General',750.0,740.14,'','12957','12/16/19'],
['','Materials',580.0,0.0,'Setup for MW shock- price includes fabrication','13112','3/11/20'],
['Metals USA','Materials',6600.0,0.0,'Setup and Prepare for Test','13080','12/18/19'],
['Angle','Materials',700.0,0.0,'Setup and Prepare for Test','13080','12/18/19'],
['Skylands','General',1000.0,0.0,'Noise Susceptibility','13080','12/18/19'],
['TRSRentelco','General',0.0,3260.0,'','13400','10/2/23'],
['Skylands','General',0.0,27.89,'','12943','2/13/20'],
['Travel Exp','Travel',0.0,20.5,'','12943','2/18/20'],
['Flow meter','General',1300.0,0.0,'','12957','12/16/19'],
['Trinity Recycling Center','Materials',0.0,100.0,'','12943','2/18/20'],
['Materials','Materials',600.0,329.75,'','13130','4/21/20'],
['Metals USA','Materials',0.0,2245.0,'','13214','9/14/21'],
['PA steel','Materials',0.0,639.44,'','13180','3/21/24'],
['PA Steel','Materials',0.0,250.53,'','13509','3/21/24'],
['Lowes','Materials',0.0,24.07,'','13124','4/28/20'],
['','Materials',550.0,329.75,'Setup for LW Shock','13244','5/12/21'],
['Hesco','Materials',0.0,124.85,'','13095','2/5/20'],
['Dat','General',0.0,150.0,'CS114','12864','4/8/19'],
['UPS shipping','General',0.0,12.6,'Subcontract Test','12911','4/4/19'],
['Technology Dynamics','General',0.0,5000.0,'Misc. Testing Power source rental','12868','4/4/19'],
['McMaster Carr','Materials',0.0,88.6,'','12970','5/19/21'],
['Mteals USA','Materials',450.0,0.0,'Setup for Medium Weight Shock Price includes bookend fabrication. Partial billing. 1/2','13114','3/11/20'],
['Fastenal','General',0.0,11.2,'','13013','12/23/19'],
['McMaster Carr','Materials',0.0,74.34,'','12967','2/7/20'],
['','Materials',580.0,0.0,'Setup for Medium Weight Shock Price includes bookend fabrication.','13113','3/11/20'],
['Mechanical Precision','General',0.0,0.0,'Fixture Fabrication Fabricate the test fixture.','13104','2/17/20'],
['','Materials',0.0,0.0,'Fixture Fabrication Fabricate the test fixture.','13104','2/17/20'],
['Metals USA','Materials',675.0,0.0,'Setup for MW shock- price includes fabrication','13112','3/11/20'],
['Dat','General',0.0,30.0,'CS101','12864','4/8/19'],
['McMaster Carr','Materials',0.0,66.97,'','13570','9/17/24'],
['Mechanical Precision','Materials',0.0,1120.0,'Provide (8) 5/8" T Clamps for the test','13191','3/4/21'],
['Drobach','General',0.0,1266.0,'','13123','4/21/20'],
['Metals USA','Materials',1010.0,0.0,'Setup for Medium Weight Shock Price includes bookend fabrication.','13113','3/11/20'],
['Drobach','General',3500.0,0.0,'','13313','10/19/21'],
['','Materials',531.0,0.0,'Setup for Medium Weight Shock Price includes bookend fixture fabrication. Partial Billing 1/2','13111','3/11/20'],
['Probe','Materials',200.0,0.0,'Setup for Lightweight Shock Setup a circulating system for the tests','13108','2/27/20'],
['Walmart','Materials',0.0,27.43,'','13104','3/4/20'],
['Miscellaneous','Materials',1070.0,0.0,'Setup for LW Shock. Price includes bookend fabrication','13444','2/13/23'],
['Skylands Fuel','General',0.0,448.95,'Noise Susceptibility','13038','10/4/19'],
['Steel','Materials',700.0,0.0,'Setup for MW Shock Test','13273','6/30/21'],
['Alltest Instruments','General',500.0,225.0,'2 week power supply rental','13569','8/28/24'],
['Drobach','General',2500.0,0.0,'','13660','5/28/25'],
['McMaster Carr','Materials',0.0,90.44,'Setup and Prepare for Test','12973','8/13/19'],
['McMaster Carr','General',0.0,203.28,'','12932','3/18/20'],
['','Materials',50.0,0.0,'Setup for Medium Weight Shock Price includes bookend fixture fabrication. Partial Billing 1/2','13111','3/11/20'],
['Metals USA','Materials',0.0,1240.0,'','13115','3/27/20'],
['Metals USA','Materials',450.0,0.0,'Set up for Vibration Test','13115','3/11/20'],
['','Materials',492.0,0.0,'Set up for Vibration Test','13115','3/11/20'],
['Metals USA','Materials',500.0,0.0,'','13110','3/10/20'],
['Sean Maher','General',0.0,200.0,'','13151','11/15/21'],
['','Materials',50.0,0.0,'Setup for MW shock- price includes fabrication','13112','3/11/20'],
['McMaster Carr','General',0.0,472.43,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/30/15'],
['Metals USA','Materials',890.0,475.0,'Fixture Fabrication Fabricate the test plate.','12938','3/1/19'],
['McMaster Carr','Materials',0.0,29.24,'Misc. Testing Setup a circulating system for the tests','12918','8/12/19'],
['Metals USA','Materials',1000.0,0.0,'Fabricate the test fixture','12890','8/14/20'],
['McMaster Carr','Materials',0.0,82.17,'','13015','4/6/20'],
['Materials','Materials',115.0,0.0,'Setup for Medium Weight Shock Price includes dummy weights.','13118','3/23/20'],
['Materials','Materials',60.0,0.0,'','13121','3/24/20'],
['McMaster Carr','Materials',0.0,33.95,'','13111','3/26/20'],
['McMaster Carr','Materials',0.0,256.18,'Setup and Prepare for Test','13133','6/1/20'],
['Flanges and shipping','Materials',550.0,0.0,'Setup for MW Shock Test- partial billing due to hydro failure','13275','6/30/21'],
['Drobach','General',3500.0,0.0,'Noise Susceptibility Perform all 3 noise tests.','13125','4/2/20'],
['Power Source','General',1000.0,200.0,'Noise Test','13188','10/29/20'],
['','Materials',351.0,0.0,'Setup for Medium Weight Shock Price includes bookend fabrication. Partial billing. 1/2','13114','3/11/20'],
['UPS','General',0.0,117.45,'','13247','12/2/21'],
['Lowe\'s','Materials',0.0,150.12,'','13359','5/31/22'],
['Lowe\'s','Materials',0.0,5.25,'','13359','5/31/22'],
['McMaster Carr','General',0.0,71.19,'Receive and prepare for Medium Weight Shock Test','12268','7/30/15'],
['Fixture Build','Materials',37500.0,0.0,'Fixture Fabrication','13723','2/26/26'],
['Jordan purchase (Visa)','Materials',0.0,104.49,'','13152','5/17/21'],
['Dat 11/04/18','General',0.0,320.0,'','12680','11/12/18'],
['Metals USA','Materials',0.0,2256.1,'','13080','5/11/20'],
['Technology Dynamics','General',0.0,2500.0,'','13172','3/26/21'],
['Shipping of material','Materials',289.0,0.0,'Setup for MW Shock Test','13274','6/30/21'],
['Bookend material','Materials',2407.16,0.0,'Setup for MW Shock Test','13274','6/30/21'],
['Flanges','Materials',550.0,0.0,'Setup for MW Shock Test','13274','6/30/21'],
['Walmart','Materials',0.0,11.25,'','12955','5/15/19'],
['Metals USA','Materials',500.0,0.0,'Setup for shock test','13173','9/10/20'],
['Jordan McAdoo','General',0.0,309.05,'','13124','4/7/20'],
['Metals USA','Materials',0.0,870.0,'','13274','9/14/21'],
['Metal Plate and shipping','Materials',1700.0,1380.6,'Setup for MW Shock Test','13268','6/22/21'],
['Materials','Materials',190.0,0.0,'Setup for Medium Weight Shock Price includes dummy weights.','13120','3/24/20'],
['Materials','Materials',720.0,0.0,'Setup for Medium Weight Shock Price includes dummy weights.','13119','3/23/20'],
['Metals Depot','Materials',230.0,0.0,'','13242','5/10/21'],
['Metals USA','General',425.0,329.75,'','13087','1/14/20'],
['Miscellaneous materials and shipping','Materials',1300.0,0.0,'Setup for MW Shock. Price includes bookend fabrication','13442','2/7/23'],
['Skylands','General',0.0,853.54,'','13587','11/21/24'],
['','Materials',240.0,0.0,'Setup for LW Shock','13244','5/12/21'],
['','Materials',75.0,0.0,'Setup for LW Shock','13244','5/12/21'],
['McMaster Carr','Materials',0.0,27.77,'','13060','6/18/20'],
['Mechanical Precision','General',0.0,1300.0,'A/E drill and tap 2" steel plate','12932','5/11/20'],
['McMaster Carr','Materials',0.0,113.51,'Setup for vibration','13203','2/17/21'],
['Travel- Doug Gromek','Travel',0.0,49.0,'Travel to DC Fabricators facility, setup for test and return to NU Labs','12967','7/13/20'],
['Drobach','General',0.0,2688.0,'','13080','6/30/20'],
['McMaster Carr','General',0.0,228.3,'','13015','4/7/20'],
['Bookend material','Materials',1568.16,0.0,'Setup for MW Shock Test- Partial billing due to failure','13276','6/30/21'],
['Metals USA','Materials',800.0,0.0,'Fabricate the test fixture','12949','7/17/20'],
['Shipping','Materials',289.0,0.0,'Setup for MW Shock Test- Partial billing due to failure','13276','6/30/21'],
['Flanges','Materials',400.0,0.0,'Setup for MW Shock Test- Partial billing due to failure','13276','6/30/21'],
['McMaster Carr','Materials',0.0,70.73,'','13152','5/13/21'],
['Ferguson','Materials',0.0,2.62,'','13145','4/5/21'],
['McMaster Carr','Materials',0.0,753.48,'','13303','9/22/21'],
['Miscellaneous materials','Materials',2850.0,1881.69,'Fabricate the test fixture','13218','1/30/23'],
['McMaster Carr','Materials',0.0,35.73,'Setup for LW Shock','13373','2/2/23'],
['Wilson Products','General',0.0,579.3,'','12932','4/18/22'],
['Steel materials','Materials',2394.0,0.0,'Setup for MW Shock Test','13247','5/20/21'],
['McMaster Carr','Materials',0.0,345.45,'','13302','9/22/21'],
['EBay purchase- Jordan','General',0.0,730.0,'Misc. Testing Setup a circulating system for the tests','12918','3/6/19'],
['Job Lot','Materials',0.0,15.98,'','13406','3/29/24'],
['','Materials',250.0,0.0,'Setup for shock test','13173','9/10/20'],
['Travel for testing','Travel',0.0,50.5,'','12967','5/21/20'],
['McMaster Carr','General',0.0,20.38,'','12932','7/7/20'],
['Lowes','General',170.0,185.53,'','12955','4/11/19'],
['McMaster Carr','Materials',0.0,12.2,'A/E Provide dummy loads and modify the foundations to mount the locker.','13101','7/8/20'],
['Home Depot','Materials',150.0,0.0,'Tear down and prepare to ship SEE NOTE','12938','3/1/19'],
['McMaster Carr','Materials',0.0,19.7,'','13124','4/29/20'],
['Materials','Materials',450.0,0.0,'Setup for Medium Weight Shock Price includes dummy weights.','13122','3/24/20'],
['Ferguson','Materials',0.0,444.52,'','13080','3/24/20'],
['Dat','General',0.0,240.0,'Set up and perform the referenced EMI tests (repriced)','12823','3/13/19'],
['','General',400.0,0.0,'','12955','4/11/19'],
['Fixture Materials, delivered','Materials',600.0,0.0,'Setup for MW Shock Test','13331','12/2/21'],
['McMaster Carr','General',0.0,35.25,'','13217','12/5/22'],
['Lowes','General',0.0,48.51,'','13124','4/23/20'],
['PA Steel','Materials',0.0,1519.8,'','13277','2/8/23'],
['McMaster Carr','Materials',0.0,137.08,'Flow Testing Setup and perform the tests','12247','2/13/15'],
['Metals USA','Materials',0.0,325.25,'','13112','9/30/20'],
['Metals USA','Materials',0.0,652.85,'','13112','9/30/20'],
['McMaster Carr','Materials',0.0,167.69,'','12949','6/2/21'],
['Wilson Products','General',0.0,40.0,'','13179','12/3/20'],
['McMaster Carr','General',0.0,27.48,'','13119','12/3/20'],
['Jim Vannatta- Travel exp','Travel',0.0,19.0,'Assemble the system, fill with water, and bleed the air.','12686','7/16/20'],
['McMaster Carr','Materials',0.0,39.07,'','13124','4/23/20'],
['','Materials',200.0,0.0,'Setup for MW Shock Test. Price includes bookend fabrication','13261','6/14/21'],
['McMaster Carr','General',0.0,114.46,'A/E drill and tap 2" steel plate','12932','6/24/20'],
['Dat','General',0.0,240.0,'','12880','2/19/19'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility','12316','7/31/15'],
['Defluxer','General',250.0,0.0,'Resistance to solvents test.','12944','3/12/19'],
['McMaster Carr','Materials',0.0,773.57,'','13015','4/6/20'],
['Fastenal','Materials',0.0,97.9,'Noise Susceptibility','12915','3/14/19'],
['Sunbelt Rental','General',258.75,275.9,'A/E drill and tap 2" steel plate','12932','7/2/20'],
['Jordan McAdoo- accelerometer','Materials',0.0,170.56,'','12890','8/19/20'],
['Metals Depot','Materials',961.11,0.0,'Setup for MW Shock Test','13206','2/1/23'],
['Steel','Materials',1100.0,0.0,'Fabricate additional fixturing/test stands.','13277','1/31/23'],
['Piping Supplies','General',0.0,1119.0,'','13364','11/10/22'],
['Miscellaneous materials for repairs','Materials',200.0,0.0,'Repairs per customer instruction','13076','10/2/24'],
['PA Steel','Materials',0.0,4521.28,'','13454','8/12/24'],
['Walmart','Materials',0.0,34.85,'','13124','4/24/20'],
['McMaster Carr','Materials',0.0,19.83,'','13391','1/31/23'],
['Miscellaneous materials budget','Materials',400.0,0.0,'','13423','11/9/22'],
['Steel Supply LLC','Materials',530.0,0.0,'Setup and Prepare for Test 6" x 4" Control Valve.','13015','8/2/19'],
['IHS Markit','General',0.0,106.63,'','13169','8/24/20'],
['IPM','General',0.0,185.0,'','13277','11/10/22'],
['Drobach','General',3500.0,0.0,'Perform Noise tests','13141','6/9/20'],
['M8 fasteners bolts and nuts (In house - do not purchase)','General',300.0,0.0,'Receive, weigh and fixture for test','12395','1/12/16'],
['McMaster Carr','Materials',0.0,40.54,'','12249','2/13/15'],
['Steel Purchase','Materials',2353.0,0.0,'Setup for MW Shock Test. Partial billing 75%','13250','5/24/21'],
['McMaster Carr','Materials',0.0,35.81,'','13446','3/20/23'],
['Steel for angle brackets- see quote','Materials',400.0,0.0,'Fabricate mounting brackets','13456','8/4/23'],
['McMaster Carr','Materials',0.0,249.08,'Flow Testing Setup and perform the tests','12247','4/16/15'],
['UPS','General',0.0,18.89,'','13180','5/28/24'],
['McMaster Carr','Materials',0.0,159.8,'Flow Testing Setup and perform the tests','12247','2/17/15'],
['Metals USA','Materials',0.0,977.5,'Setup for MW Shock- Partial Billing','13105','2/4/21'],
['Metals USA','Materials',0.0,240.0,'Fabricate the test fixture','12949','2/4/21'],
['Metals USA','Materials',0.0,1843.25,'Fabricate the test fixture','12949','2/4/21'],
['Metals USA','Materials',0.0,1180.0,'Fabricate the test fixture','12949','2/4/21'],
['Drobach','General',0.0,1728.0,'Noise test. Reflects work performed prior to the latest failure','13201','6/29/21'],
['Drobach','General',0.0,-684.0,'Noise test. Reflects work performed prior to the latest failure','13201','6/29/21'],
['McMaster Carr','General',0.0,150.3,'Flow Testing Setup and perform the tests','12247','3/4/15'],
['Tektronix testing','General',850.0,850.0,'(Subcontract Test- Tektronix) Loose cargo per paragraph 5.5','12281','4/27/15'],
['1750 CFM Compressor','General',2375.0,2184.0,'Noise Susceptibility Set up and perform the test','12244','1/30/15'],
['Mike Travel- Kearny- Sunbelt rental','Travel',0.0,47.0,'A/E drill and tap 2" steel plate','12932','7/13/20'],
['ebay- Jordan','General',0.0,30.87,'','13151','7/14/20'],
['ebay- Jordan','General',0.0,48.51,'','13143','7/14/20'],
['McMaster Carr','Materials',0.0,81.17,'','12686','8/7/20'],
['McMaster Carr','Materials',0.0,107.82,'A/E drill and tap 2" steel plate','12932','6/29/20'],
['Mechanical Precision','General',0.0,750.0,'','12932','4/14/20'],
['Drobach','General',3300.0,2688.0,'','13131','4/21/20'],
['UPS','General',0.0,6.21,'','13112','9/10/20'],
['McMaster Carr','General',0.0,62.01,'Flow Testing Setup and perform the tests','12247','3/4/15'],
['Mechanical Precision','General',0.0,320.0,'','13029','5/18/20'],
['Metals USA','Materials',0.0,745.0,'Assemble the system, fill with water, and bleed the air.','12686','7/16/20'],
['Hunterdon Mill','Materials',0.0,17.57,'','13152','6/2/21'],
['Lowes','Materials',0.0,32.99,'','12864','4/9/19'],
['UPS','General',0.0,26.76,'','13112','9/10/20'],
['Metals USA','Materials',0.0,2574.6,'','13080','5/11/20'],
['McMaster Carr','Materials',0.0,71.22,'','12855','10/6/20'],
['Mechanical Precision','General',0.0,1050.0,'A/E- Machine the fixture plate in accordance with Marotta drawing 285139-0001','12555','10/13/17'],
['Flanges and bookend materials','General',210.0,0.0,'Receive, weigh, fixture for test and tear down 11/24/15','12357','10/21/15'],
['McMaster Carr','General',0.0,356.45,'','13293','6/22/23'],
['FedEx','General',0.0,6.88,'','13209','6/22/23'],
['Valworx','General',0.0,136.73,'','12290','10/26/15'],
['Radiant shipping','General',0.0,1209.5,'','12256','10/16/15'],
['Home Depot','Materials',0.0,78.5,'Receive, weigh and fixture for test','12576','6/26/17'],
['Bolts','Materials',200.0,0.0,'Receive, weigh and fixture for test','12359','10/21/15'],
['Home Depot','Materials',0.0,32.21,'Receive, weigh and fixture for test','12576','6/26/17'],
['Technology Dynamics','General',1250.0,1250.0,'Rental of power source','12423','6/26/17'],
['Fabricate 1 1/4" clamps','General',300.0,0.0,'Receive, weigh and fixture for test','12353','10/6/15'],
['McMaster Carr','General',0.0,46.07,'Receive, weigh, fixture for test and tear down 11/24/15','12357','10/29/15'],
['McMaster Carr','General',0.0,16.94,'Resistance to Solvents','12235','2/5/15'],
['Cardmember Services- Russ\' CC','General',0.0,160.0,'Resistance to Solvents','12235','2/12/15'],
['McMaster Carr','Materials',0.0,417.86,'Flow Testing Setup and perform the tests','12247','2/12/15'],
['Materials and positioner','General',910.0,0.0,'Flow Testing Setup and perform the tests','12247','2/4/15'],
['Cardmember Services- Russ\' CC','General',0.0,277.73,'Resistance to Solvents','12235','2/12/15'],
['Bolts and locknuts','Materials',100.0,0.0,'','12361','10/27/15'],
['Radiant','General',0.0,649.5,'','13485','5/16/24'],
['McMaster Carr','Materials',0.0,60.43,'Flow Testing Setup and perform the tests','12247','2/25/15'],
['Grainger','Materials',0.0,462.57,'Flow Testing Setup and perform the tests','12247','2/25/15'],
['UPS','General',0.0,30.24,'Test Report .1 Electronic format and on CD','12243','2/26/15'],
['NTS','General',0.0,1525.0,'Subcontract Test Set up and perform the referenced EMI tests at NTS Tinton Falls, NJ','12883','1/31/19'],
['The Hose Shop- On Ragen\'s CC','Materials',0.0,149.15,'','13354','10/19/22'],
['Compressor rental and fuel','Materials',3395.0,2503.04,'Noise Susceptibility','12292','5/15/15'],
['Mechanical Precision','Materials',0.0,970.0,'','13277','2/9/23'],
['McMaster Carr','Materials',0.0,25.9,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','10/22/15'],
['McMaster Carr','Materials',0.0,35.49,'Receive, weigh and fixture for test','12343','10/8/15'],
['FedEx','Materials',0.0,44.06,'Resistance to Solvents','12235','2/5/15'],
['Fuel for compressor','General',500.0,0.0,'Noise Susceptibility Set up and perform the test','12244','1/30/15'],
['Fedbid charge','General',0.0,214.2,'Fedbid charge','12246','1/30/15'],
['McMaster Carr','Materials',0.0,768.21,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','3/18/15'],
['Wilson Products','General',0.0,254.75,'Receive and prepare for Medium Weight Shock Test Set up and pressurize the unit','12280','8/3/15'],
['Progressive hydraulics inc','General',0.0,279.25,'','N234  Lab Maintenance 2015','10/1/15'],
['McMaster Carr','Materials',0.0,36.54,'Flow Testing Setup and perform the tests','12247','3/12/15'],
['McMaster Carr','General',0.0,24.27,'Flow Testing Setup and perform the tests','12247','3/4/15'],
['Hotel & Food','Travel',500.0,0.0,'Airborne/Structureborne Noise Test','12285','4/28/15'],
['McMaster Carr','Materials',0.0,63.82,'Flow Testing Setup and perform the tests','12247','3/2/15'],
['','Materials',500.0,0.0,'Receive and prepare for Medium Weight Shock Test Modify the 90° fixture.','12268','3/20/15'],
['Steel plate','Materials',1000.0,0.0,'Receive and prepare for Medium Weight Shock Test','12271','4/6/15'],
['Mechanical Precision','Materials',0.0,90.0,'','13488','10/9/23'],
['Hunterdon Mill','Materials',0.0,13.95,'Receive and prepare for Medium Weight Shock Test','12268','8/5/15'],
['McMaster Carr','General',0.0,112.04,'Flow Testing Setup and perform the tests','12247','3/6/15'],
['McMaster Carr','General',0.0,21.6,'','12286','10/1/15'],
['McMaster Carr','General',0.0,184.5,'Receive, weigh and fixture for test Receive and drill mounting holes','12344','10/1/15'],
['McMaster Carr','General',0.0,19.41,'Flow Testing Setup and perform the tests','12247','3/4/15'],
['Grainger','Materials',0.0,68.03,'Flow Testing Setup and perform the tests','12247','3/20/15'],
['McMaster Carr','Materials',0.0,196.23,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','4/9/15'],
['McMaster Carr','Materials',0.0,53.84,'Receive and prepare for Lightweight Shock','12263','3/19/15'],
['Metals USA','Materials',0.0,405.0,'Receive and prepare for Medium Weight Shock Test','12271','4/14/15'],
['Fixture time and materials','General',200.0,0.0,'EMI Testing Fixturing','12290','5/14/15'],
['Tom Miller expenses','Travel',0.0,116.82,'Airborne/Structureborne Noise Test','12285','5/13/15'],
['Dat Vu Travel','Travel',0.0,62.0,'Subcontract Test','12252','5/1/15'],
['McMaster Carr','Materials',0.0,34.61,'','13632','2/18/26'],
['McMaster Carr','General',0.0,207.66,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','5/13/15'],
['McMaster Carr','General',0.0,48.39,'','12276','4/30/15'],
['Cable fabrication time and material','Materials',149.0,0.0,'EMI Testing Purchase material','12290','5/14/15'],
['Mechanical Precision','General',800.0,1100.0,'Receive and prepare for Medium Weight Shock Test 1x3','12286','4/28/15'],
['Material purchases','General',1350.0,1200.0,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','5/18/15'],
['Petty cash','General',0.0,10.68,'','12379','12/1/15'],
['McMaster Carr','General',0.0,27.02,'','12272','4/23/15'],
['UPS','General',0.0,33.84,'Tear down and prepare to ship','12263','4/14/15'],
['Passaic County Welders','General',0.0,2046.0,'Fabrication in support of medium weight shock testing.','12286','5/14/15'],
['Steel Plate','Materials',1125.0,1705.22,'','13420','5/26/23'],
['Mechanical Precision','General',0.0,150.0,'','12276','5/5/15'],
['Mechanical Precision','General',0.0,290.0,'Cost for materials and fixture fabrication. SEE NOTE','12394','2/22/16'],
['Grainger','Materials',0.0,263.5,'','12276','4/30/15'],
['NTS','General',2220.0,0.0,'A/E #2150 RE102 retest at NTS','12252','5/21/15'],
['McMaster Carr','General',0.0,91.24,'','12276','4/30/15'],
['Grainger','Materials',0.0,-251.45,'Flow Testing Purchase additional material','12276','5/4/15'],
['Grainger','Materials',0.0,342.68,'Flow Testing Purchase additional material','12276','5/4/15'],
['McMaster Carr','General',0.0,244.24,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','8/3/15'],
['Materials','General',509.5,0.0,'Flow Testing Purchase additional material','12276','5/1/15'],
['McMaster Carr','General',0.0,2002.41,'Visual and FPI inspection of the divider. Partial Billing for materials purchased in preparation for required inspections.','13201','3/2/21'],
['McMaster Carr','Materials',0.0,247.95,'Fixture Fabrication Fabricate a Test Fixture','12895','1/10/19'],
['Compressor rental- 1 full week','General',3500.0,919.6,'Perform the Noise test','13369','5/12/22'],
['Doug\'s travel','Travel',0.0,29.0,'Misc. Testing Travel to the Leistriz facility,setup for test, and return to NU Labs','12892','12/3/18'],
['Drobach','General',3400.0,3456.0,'Noise Susceptibility','12316','7/9/15'],
['misc.','Materials',2450.0,1253.02,'Receive and prepare for Medium Weight Shock Test','12302','6/3/15'],
['Lowe\'s','General',0.0,31.88,'','12895','1/22/19'],
['Mcmaster Carr','Materials',0.0,361.0,'A/E drill and tap 2" steel plate','12932','7/9/20'],
['Techstreet Store- Ragen purchase','General',0.0,10.66,'','13151','7/9/20'],
['Skylands','Materials',250.0,515.13,'Provide 200 gallons of diesel fuel. SEE NOTE','12943','3/8/19'],
['Mechanical Precision','General',0.0,260.0,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','6/5/15'],
['NTS','General',0.0,1480.0,'A/E #2150 RE102 retest at NTS','12252','6/4/15'],
['Drobach','General',2000.0,2004.0,'Noise Susceptibility','12298','6/4/15'],
['NTS','General',0.0,23150.0,'Subcontract Test','12252','6/4/15'],
['FedEx','General',0.0,41.64,'FedEx charges billed to NU Labs for shipping 06/03/15','12262','6/22/15'],
['Additional plate for Shock test','Materials',675.0,0.0,'Additional plate','12283','6/22/15'],
['Power Source Rental','General',2900.0,0.0,'2 week power source rental','13254','5/28/21'],
['Compressor and fuel','General',3015.0,4008.0,'Noise Susceptibility','12311','6/23/15'],
['FedEx','General',0.0,26.13,'EMI Report .2','12319','8/27/15'],
['McMaster Carr','Materials',0.0,123.96,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','6/24/15'],
['FedEx','General',41.64,0.0,'FedEx charges billed to NU Labs for shipping 06/03/15','12262','6/22/15'],
['Face flanges, flow meter 2", sea salt','Materials',2401.32,0.0,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','5/19/15'],
['McMaster Carr','Materials',0.0,125.01,'','12265','7/2/15'],
['NTS','General',0.0,740.0,'A/E #2150 RE102 retest at NTS','12252','6/4/15'],
['Compressor','General',0.0,0.0,'Flow Testing Rent a 750 CFM compressor. Cancelled','12265','5/19/15'],
['Mechanical Precision','Materials',0.0,1100.0,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/1/15'],
['Motion Industries','Materials',0.0,18.16,'Tooling (bits, blades, etc.)','N236  Lab Maintenance 2017','4/26/17'],
['Tektronix','General',1700.0,0.0,'Subcontract Test Shock and report. Tektronix','12315','7/8/15'],
['McMaster Carr','General',0.0,192.75,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/15/15'],
['Grainger credit','Materials',0.0,-96.94,'','12265','7/2/15'],
['Metals USA','Materials',0.0,245.5,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','7/1/15'],
['Grainger','Materials',0.0,80.44,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/1/15'],
['Mcmaster Carr','Materials',0.0,47.52,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','7/1/15'],
['McMaster Carr','General',0.0,-74.0,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/23/15'],
['McMaster Carr','Materials',0.0,111.07,'','12265','7/2/15'],
['Grainger','Materials',0.0,3.28,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','6/25/15'],
['McMaster Carr','Materials',0.0,44.94,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','7/8/15'],
['McMaster Carr','Materials',0.0,13.39,'','12286','8/27/15'],
['Hunterdon Mill','General',0.0,2.41,'Noise Susceptibility','12316','7/23/15'],
['Mcmaster Carr','General',0.0,129.85,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/23/15'],
['Mcmaster Carr','Materials',0.0,11.54,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/15/15'],
['BF travel','Travel',0.0,47.0,'','12288','7/15/15'],
['UPS- Element Materials','Materials',0.0,36.1,'DWV Testing- sent to Element Materials Technology','12387','2/18/16'],
['Grainger','Materials',0.0,107.82,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','7/1/15'],
['McMaster Carr','Materials',0.0,32.99,'','12286','8/27/15'],
['McMaster Carr','Materials',0.0,-21.6,'','12286','8/27/15'],
['Metals USA','Materials',0.0,245.5,'Receive and prepare for Medium Weight Shock Test Test set up drawings included','12293','7/1/15'],
['4" steel channels , Flanges','Materials',250.0,0.0,'Set up for Vibration Test','12323','8/11/15'],
['Wilson Products','General',0.0,238.08,'Receive and prepare for Medium Weight Shock Test Set up and pressurize the unit','12280','7/24/15'],
['Flemington Supply-Petty cash','Materials',0.0,14.92,'','12290','8/11/15'],
['Grainger','Materials',0.0,14.17,'','12265','7/2/15'],
['McMaster Carr','Materials',0.0,40.3,'','13277','9/3/24'],
['Tektronix','General',1700.0,0.0,'Subcontract Test Shock and report. Tektronix','12314','7/8/15'],
['Mcmaster Carr','Materials',0.0,153.0,'Receive and prepare for Medium Weight Shock Test','12302','9/3/15'],
['Mcmaster Carr','Materials',0.0,-10.11,'','12286','8/27/15'],
['4" channel and 3/8" bolts','Materials',125.0,0.0,'Receive, weigh and fixture for test','12343','9/25/15'],
['Hunterdon Mill','Materials',0.0,18.45,'','12254','9/3/15'],
['Miscellaneous items for test','General',400.0,0.0,'','12331','8/31/15'],
['Mcmaster Carr','Materials',0.0,18.68,'Receive and prepare for Medium Weight Shock Test','12302','9/3/15'],
['Drobach','General',3875.0,2184.0,'Noise Susceptibility','12479','8/3/16'],
['McMaster Carr','General',0.0,42.69,'Receive and prepare for Medium Weight Shock Test','12302','8/28/15'],
['Finkles','Materials',0.0,27.56,'','12377','12/9/15'],
['Home Depot','Materials',0.0,153.2,'Parachute Drop','12331','9/3/15'],
['McMaster Carr','Materials',0.0,49.41,'','12336','12/9/15'],
['Bolts with locknut washers','General',100.0,0.0,'Receive and prepare for Medium Weight Shock Test','12328','8/26/15'],
['McMaster Carr','Materials',0.0,29.99,'','12336','12/9/15'],
['UPS','General',0.0,63.99,'EMI Testing','12277','10/29/15'],
['Grainger','Materials',0.0,60.52,'','12286','9/10/15'],
['Amazon','Materials',0.0,42.99,'Parachute Drop','12331','9/10/15'],
['2 flanges flat faced for 1 1/2" pipe','Materials',125.0,0.0,'Receive, weigh and fixture for test','12348','9/29/15'],
['Mechanical Precision','Materials',0.0,225.0,'Flow Testing Set up and perform the tests referenced in the Test Procedure','12265','9/11/15'],
['Bolts, nuts, washers','General',200.0,0.0,'Receive, weigh and fixture for test Receive and drill mounting holes','12345','9/28/15'],
['Bolts, nuts, washers','General',200.0,0.0,'Receive, weigh and fixture for test Receive and drill mounting holes','12344','9/28/15'],
['Bolts, nuts and washers','General',200.0,0.0,'Receive, weigh and fixture for test Receive and drill mounting holes','12346','9/28/15'],
['Bolts, nut,s washers','General',200.0,0.0,'Receive, weigh and fixture for test Receive and drill mounting holes','12347','9/28/15'],
['Myles Transporation','General',0.0,420.0,'Shipping Charges SEE NOTE 1x3','12286','9/24/15'],
['Bolts','Materials',50.0,0.0,'Receive, weigh and fixture for test','12336','9/17/15'],
['transition plate and bolts','Materials',1100.0,0.0,'Receive, weigh and fixture for test','12337','9/17/15'],
['pipe fittings','General',0.0,97.99,'','N234  Lab Maintenance 2015','9/24/15'],
['Base plate 44" x 49"','Materials',750.0,0.0,'Receive, weigh and fixture for test','12342','9/23/15'],
['McMaster Carr','Materials',0.0,64.4,'','12315','9/10/15'],
['Raritan Supply','General',0.0,149.06,'Receive and prepare for Medium Weight Shock Test','12302','9/10/15'],
['Hotels and food','General',525.0,178.38,'Airborne/Structureborne Noise Test','12333','9/14/15'],
['UPS- Advanced Test Equipment','General',0.0,36.56,'','12277','11/19/15'],
['McMaster Carr','General',0.0,151.17,'EMI Testing Fixturing','12290','9/17/15'],
['Wilson Products','Materials',800.0,0.0,'Setup for LW Shock','13279','7/6/21'],
['McMaster Carr','Materials',0.0,18.29,'Receive, weigh and fixture for test','12335','10/15/15'],
['McMaster Carr','Materials',0.0,122.38,'','12337','12/9/15'],
['3/8" C beams 10\'','Materials',100.0,0.0,'Receive, weigh and fixture for test','12335','9/16/15'],
['McMaster Carr','General',0.0,41.68,'Receive, weigh and fixture for test','12356','10/29/15'],
['McMaster Carr','General',0.0,-129.64,'','12356','10/30/15'],
['McMaster Carr','General',0.0,81.82,'Receive, weigh, fixture for test and tear down 11/24/15','12357','10/29/15'],
['McMaster Carr','General',0.0,99.9,'','12361','10/30/15'],
['McMaster Carr','General',0.0,129.64,'Receive, weigh and fixture for test','12356','10/29/15'],
['McMaster Carr','General',0.0,-46.07,'','12357','10/30/15'],
['3/4" flat stock','Materials',300.0,0.0,'Receive, weigh and fixture for test','12362','10/29/15'],
['Advanced Test Equipment','General',0.0,546.0,'EMI Testing','12277','10/29/15'],
['Materials- Metals USA ,','Materials',2139.69,0.0,'','12360','10/26/15'],
['McMaster Carr','General',0.0,35.77,'','12354','10/29/15'],
['System 22','General',0.0,24.96,'Receive, weigh, fixture for test and tear down 11/24/15','12357','11/12/15'],
['System 22','General',0.0,255.68,'Receive, weigh and fixture for test','12356','11/12/15'],
['Misc materials','Materials',500.0,0.0,'Setup for leakage, pressure and flow tests','13449','3/10/23'],
['Hunterdon Mill','Materials',0.0,14.77,'Receive, weigh and fixture for test','12398','2/5/16'],
['Lowes','General',0.0,12.43,'','13145','3/4/21'],
['Hunterdon Mill','Materials',0.0,20.92,'Setup a circulating system','13120','3/4/21'],
['Mechanical Precision','Materials',0.0,6840.0,'Vibration Testing SEE NOTE','12376','11/23/15'],
['Wilson Products','General',0.0,254.08,'','12280','11/24/15'],
['McMaster Carr','General',0.0,22.94,'','12367','11/18/15'],
['Metals USA','Materials',0.0,856.98,'Fabricate fixture Figure 16 of 901D-cancelled-materials and time spent to date charged to customer','12360','11/17/15'],
['Metals USA','Materials',0.0,202.1,'Fabricate fixture Figure 16 of 901D-cancelled-materials and time spent to date charged to customer','12360','11/17/15'],
['Petty Cash','General',0.0,22.82,'','12330','12/1/15'],
['Metals USA','Materials',0.0,516.46,'Fabricate fixture Figure 16 of 901D-cancelled-materials and time spent to date charged to customer','12360','11/17/15'],
['Napa','Materials',0.0,11.99,'','12313','12/3/15'],
['McMaster Carr','Materials',0.0,44.79,'Receive, weigh and fixture for test','12348','12/3/15'],
['Tektronix','General',0.0,2900.0,'Subcontract Test Shock and report. Tektronix','12315','11/24/15'],
['McMaster Carr','Materials',0.0,51.3,'','12327','11/24/15'],
['Russ Amex','General',0.0,132.09,'','12330','11/24/15'],
['Tektronix','General',1620.0,1620.0,'Vibration Testing Long life','12398','2/8/16'],
['Miscellaneous','General',0.0,1350.0,'','12374','11/23/15'],
['5/8-11 grade 5 bolts(12) and nuts(12). , Flange 5" flat faced blank','Materials',250.0,0.0,'Receive, weigh and fixture for test','12383','12/8/15'],
['Hunterdon Mill','General',0.0,13.9,'Receive and fixture for test','12320','12/4/15'],
['Mcmaster Carr','Materials',0.0,280.31,'','12337','12/9/15'],
['Metals USA','Materials',0.0,857.5,'Receive and prepare for Medium Weight Shock Test 485','12405','2/12/16'],
['McMaster Carr','Materials',0.0,11.23,'','13275','5/13/22'],
['McMaster Carr','Materials',0.0,149.9,'','13214','3/15/22'],
['Welding- Sean Maher','General',0.0,100.0,'','13278','5/23/22'],
['McMaster Carr','Materials',0.0,49.37,'','13378','12/15/22'],
['Hose Shop','Materials',0.0,138.4,'','13453','6/23/23'],
['McMaster Carr','Materials',0.0,19.4,'','13289','9/23/21'],
['McMaster Carr','Materials',0.0,21.03,'','13175','9/23/21'],
['McMaster Carr','Materials',0.0,102.37,'','13115','4/19/22'],
['Pump for achieving pressure and flow','General',2000.0,2298.99,'','13267','6/21/21'],
['Chesapeake Bay Rubber Gasket','General',0.0,80.78,'','13113','3/17/22'],
['McMaster Carr','Materials',0.0,247.44,'Setup for LW Shock- Orifice Assembly','13267','10/19/21'],
['(2) 150# 12" weldneck flanges','Materials',800.0,0.0,'','13475','7/24/23'],
['Shipping for flanges','General',200.0,0.0,'','13475','7/24/23'],
['Misc steel','Materials',500.0,0.0,'','13475','7/24/23'],
['UPS shipping- Piping Supplies','General',0.0,20.97,'','13176','11/24/25'],
['Lowe\'s','Materials',0.0,-5.04,'','13359','6/1/22'],
['Lowe\'s','Materials',0.0,5.48,'','13359','6/1/22'],
['Automation Direct','Materials',0.0,778.36,'','13267','12/8/21'],
['HYVac','Materials',0.0,49.4,'','13151','12/8/21'],
['Hardware- McMaster Carr','Materials',2150.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['McMaster Carr','Materials',0.0,67.68,'','13350','3/17/22'],
['Steel delivery','Materials',500.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['Mechanical Precision','Materials',860.0,860.0,'A/E for sending fixture out to Mechanical Precision to have holes drilled.','13258','11/9/21'],
['Hesco','Materials',0.0,99.6,'Setup and prepare for test','13177','5/13/21'],
['Fastenal','Materials',0.0,135.95,'','13201','6/25/21'],
['Compressor','General',2500.0,3008.0,'','13458','4/21/23'],
['Tester for Ives jobs','General',0.0,159.95,'','13248','9/21/21'],
['Fox Lumber','Materials',0.0,31.05,'','13175','9/21/21'],
['Piping Supplies','Materials',0.0,1577.0,'','13250','12/21/21'],
['Epoxy','Materials',1100.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['Purchase on JDM credit card','Materials',0.0,663.52,'','13400','9/12/23'],
['Purchase on JDM credit card','Materials',0.0,700.07,'','13485','9/12/23'],
['Mechanical Precision Inc.','Materials',0.0,3200.0,'Fabricate the test fixture','13218','5/18/21'],
['McMaster Carr','Materials',0.0,80.72,'','13218','5/18/21'],
['McMaster Carr','Materials',0.0,-59.36,'','13359','6/2/22'],
['Wilson Products','General',0.0,86.0,'','12932','6/2/22'],
['Neoprene strips','Materials',200.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['Back curved steel','Materials',1000.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['Gaskets','Materials',250.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['McMaster Carr','Materials',0.0,368.23,'','13277','12/14/22'],
['McMaster Carr','Materials',0.0,39.03,'','13277','1/4/23'],
['Fastenal','Materials',0.0,10.66,'','13218','5/25/21'],
['McMaster Carr','Materials',0.0,163.74,'','13488','10/3/23'],
['Target','General',0.0,3.2,'','13350','3/17/22'],
['Lehigh Fluid Power','General',0.0,982.0,'','13152','5/26/21'],
['Wilson Products','Materials',0.0,69.26,'','13267','11/16/21'],
['Radiant Global Logistics','General',0.0,275.0,'','13267','11/18/21'],
['UPS','General',0.0,12.61,'','13151','11/18/21'],
['amplifier rental','General',4500.0,0.0,'Setup and 1 month amplifier rental','13366','4/20/22'],
['Shipping- amplifier','General',1250.0,0.0,'Setup and 1 month amplifier rental','13366','4/20/22'],
['Steel Plate','Materials',1325.0,0.0,'Setup for MW Shock Test','13259','6/9/21'],
['Freight cost','General',500.0,0.0,'Setup for MW Shock Test','13259','6/9/21'],
['Add\'l material cost','General',1000.0,0.0,'Setup for MW Shock Test','13259','6/9/21'],
['Mcmaster Carr','Materials',0.0,140.26,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/15/16'],
['Mcmaster Carr','Materials',0.0,44.59,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/15/16'],
['McMaster Carr','Materials',0.0,8.63,'Cost for materials and fixture fabrication. SEE NOTE','12394','2/15/16'],
['MECHANICAL PRECISION','Materials',360.0,360.0,'A/E to send valve out to local shop to have caps welded to stubs.','13151','10/8/21'],
['Mechanical Precision','Materials',0.0,1120.0,'Setup and prepare for test. Price includes fabricating bookends','13151','10/25/21'],
['McMaster Carr','Materials',0.0,113.34,'','13359','5/27/22'],
['McMaster Carr','Materials',0.0,30.59,'','13278','5/25/22'],
['Mcmaster Carr','Materials',0.0,35.27,'','12932','5/25/22'],
['Wilson Products','Materials',386.1,403.83,'Lightweight Shock Testing','12392','1/7/16'],
['Steel bar for belly band','Materials',1000.0,0.0,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['Wilson Products','Materials',300.0,0.0,'Medium Weight Shock Testing Set up the system and pressurize the unit','12393','1/8/16'],
['Alltest Instrument rental','General',0.0,500.0,'','13574','11/18/24'],
['Tektronix','General',0.0,550.0,'Shock Testing','12621','6/26/17'],
['Home Depot','Materials',0.0,21.97,'Receive, weigh and fixture for test','12576','6/26/17'],
['Wilson Products','General',0.0,286.85,'Receive and prepare for test. Pressurize the unit.','12280','1/6/16'],
['Travel to Alltest- equipment return','Travel',0.0,74.0,'','13574','11/18/24'],
['Metals USA','Materials',2600.0,0.0,'Setup for MW Shock Test- Includes dummy loads','13296','8/12/21'],
['McMaster Carr','Materials',175.0,0.0,'Setup for MW Shock Test- Includes dummy loads','13296','8/12/21'],
['Materials','Materials',300.0,0.0,'Setup for LW Shock','13248','5/20/21'],
['Newark Element14','Materials',0.0,56.15,'New Controller for 10 x 10 Chamber','N235 Lab Maintenance 2016','6/8/16'],
['Tom Woodruff','Materials',0.0,20.61,'','12414','6/9/16'],
['McMaster Carr','General',0.0,28.68,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','2/15/16'],
['McMaster Carr','Materials',0.0,17.25,'Receive and prepare for Medium Weight Shock Test Billed to LMCO .486','12405','2/15/16'],
['Hunterdon Mill','General',0.0,83.89,'','12302','12/15/15'],
['Mcmaster Carr','Materials',0.0,5.96,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/15/16'],
['McMaster Carr','Materials',0.0,15.61,'Receive, weigh and fixture for test','12398','1/28/16'],
['UPS','General',0.0,46.01,'DWV Testing- sent to Element Materials Technology','12387','1/28/16'],
['McMaster Carr','Materials',0.0,72.62,'Receive and prepare for Medium Weight Shock Test 485','12405','2/12/16'],
['Miscellaneous-nuts bolts washers','Materials',125.0,0.0,'Receive and prepare for Medium Weight Shock Test 494','12405','2/12/16'],
['Travel to Tektronix','Travel',0.0,50.5,'','12603','5/15/17'],
['McMaster Carr','General',0.0,-49.41,'','12336','12/15/15'],
['McMaster Carr','Materials',0.0,46.03,'','12579','3/28/17'],
['McMaster Carr','General',0.0,-13.93,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','2/15/16'],
['McMaster Carr','Materials',0.0,34.31,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','2/15/16'],
['Mcmaster Carr','Materials',0.0,26.88,'Fixture Maintenance','N235 Lab Maintenance 2016','2/15/16'],
['USA Metals, Quote #PHI W-493214','Materials',2349.06,765.0,'Fabricate two 15 degree ramps for CDRL D026.219 and CDRL #D026.528','12467','7/5/16'],
['Tektronix','General',0.0,1100.0,'Crash Safety Shock','12617','7/28/17'],
['Metals Depot','Materials',1763.84,0.0,'Fabricate the test fixture','12643','7/13/17'],
['Misc','Materials',300.0,0.0,'Receive, weigh and fixture for test 658','12405','2/12/16'],
['McMaster Carr','Materials',0.0,65.18,'Receive and prepare for Medium Weight Shock Test Billed to LMCO .486','12405','2/17/16'],
['Metals USA','Materials',375.0,0.0,'Fabricate a fixture for the acceleration test','12606','5/1/17'],
['McMaster Carr','Materials',0.0,-8.63,'Cost for materials and fixture fabrication. SEE NOTE','12394','2/5/16'],
['Metals USA','Materials',750.0,465.0,'Receive, weigh and fixture for test','12576','3/15/17'],
['Fastenal','Materials',0.0,184.23,'','13126','8/25/21'],
['Radiant','General',0.0,694.53,'A/E #2169','12330','1/11/16'],
['Wilson Products','Materials',0.0,298.82,'','12505','7/27/17'],
['Fastenal','Materials',0.0,9.05,'Medium Weight Shock Testing','12566','4/11/17'],
['Russ\' Amex','General',0.0,386.66,'','N235 Lab Maintenance 2016','3/31/16'],
['McMaster Carr','Materials',0.0,31.29,'Receive and prepare for Lightweight Shock .480','12405','2/12/16'],
['Technology Dynamics','General',5000.0,5000.0,'Rental of power source','12576','3/15/17'],
['Carver Pump','Materials',0.0,2784.0,'','13267','11/22/21'],
['Metals USA','Materials',0.0,901.05,'Vibration Testing SEE NOTE','12376','12/18/15'],
['Metals USA','Materials',0.0,275.0,'Receive and prepare for Medium Weight Shock Test 485','12405','2/12/16'],
['McMaster Carr','General',0.0,32.34,'','13531','8/27/24'],
['EBay','General',0.0,2263.76,'','13180','5/20/24'],
['Metals USA','Materials',0.0,1161.8,'','12569','3/9/17'],
['Wilson Products','Materials',0.0,289.65,'','13478','2/14/24'],
['McMaster Carr','Materials',0.0,521.3,'','13180','2/14/24'],
['Jordan\'s CC- Chespeake Bay Rubber','Materials',0.0,75.36,'','13180','2/14/24'],
['McMaster Carr','Materials',0.0,47.81,'Receive, weigh and fixture for test','12390','1/11/16'],
['UPS','General',0.0,205.14,'Shipping charges for 2 units via UPS Ground prepaid. SEE NOTE','12525','4/19/17'],
['Metals USA','Materials',0.0,560.0,'Setup and Prepare for Test','12601','7/27/17'],
['UPS Shipping to Montreal Bronze per customer request','General',0.0,39.82,'Contingency Funds for out of scope work $1512- Charge for UPS shipping to Montreal Bronze','12591','6/2/17'],
['McMaster Carr','Materials',0.0,216.09,'Vibration Testing SEE NOTE','12375','1/12/16'],
['Travel to Tektronix','Travel',0.0,46.5,'Vibration Testing Twelve hours total.','12603','5/10/17'],
['McMaster Carr','General',0.0,10.71,'Constant Pressure Pump','N235 Lab Maintenance 2016','1/22/16'],
['McMaster Carr','General',0.0,55.97,'Constant Pressure Pump','N235 Lab Maintenance 2016','1/22/16'],
['McMaster Carr','General',0.0,49.52,'Noise Susceptibility','12582','4/20/17'],
['McMaster Carr','General',0.0,54.8,'Noise Susceptibility','12580','4/20/17'],
['McMaster Carr','General',0.0,57.8,'Constant Pressure Pump','N235 Lab Maintenance 2016','1/22/16'],
['Grainger','General',0.0,322.77,'Constant Pressure Pump','N235 Lab Maintenance 2016','1/22/16'],
['Travel to Tektronix- Doug Gromek','Travel',0.0,47.1,'Shock Testing Tested separately','12636','8/9/17'],
['Grainger','General',0.0,16.45,'Constant Pressure Pump','N235 Lab Maintenance 2016','1/27/16'],
['Walmart','General',0.0,16.8,'','13200','4/27/21'],
['McMaster Carr','Materials',0.0,15.1,'Receive, weigh and fixture for test','12363','1/27/16'],
['Hunterdon Mill','General',0.0,-17.1,'','12480','6/21/17'],
['Element Materials Technology','General',1500.0,1500.0,'DWV Testing- sent to Element Materials Technology','12387','1/28/16'],
['Miscelaaneous','Materials',200.0,0.0,'Receive cooling system and setup','12576','6/23/17'],
['Rental','General',915.0,816.26,'Rental charge 2nd month. $1,100','12576','6/22/17'],
['UPS','General',0.0,58.43,'','13376','5/20/24'],
['Hunterdon Mill','General',0.0,100.46,'','12480','6/21/17'],
['Sunbelt Rentals','General',1125.0,1110.16,'Misc. Testing Rent an Air-Cooled Portable Air Conditioner. Price first month SEE NOTE','12576','6/22/17'],
['McMaster Carr','Materials',0.0,19.19,'Receive, weigh and fixture for test','12363','1/27/16'],
['Tektronix','General',0.0,550.0,'Shock Testing','12631','7/27/17'],
['McMaster Carr','Materials',0.0,48.5,'','13521','8/16/24'],
['McMaster Carr','Materials',0.0,47.65,'','13137','1/5/23'],
['Tektronix','General',0.0,550.0,'Shock Testing','12610','5/12/17'],
['McMaster Carr','Materials',0.0,129.18,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','1/28/16'],
['Materials','Materials',550.0,0.0,'Receive and prepare for Medium Weight Shock Test 485','12405','2/12/16'],
['Advanced Test Equipment','General',0.0,2433.46,'EMI Testing','12330','1/29/16'],
['Grainger','Materials',0.0,-17.55,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/3/16'],
['Wilson Products','Materials',0.0,309.71,'Vibration Testing','12288','2/4/16'],
['Bookend materials','General',2500.0,0.0,'','13433','12/22/22'],
['Metals USA','Materials',0.0,773.53,'Figure 15 Build','N235 Lab Maintenance 2016','2/4/16'],
['Metal','General',1118.0,0.0,'Medium Weight Shock Testing Set up the system and pressurize the unit','12393','2/3/16'],
['Frenchtown Hardware','Materials',0.0,2.75,'Lab supplies','N236  Lab Maintenance 2017','5/10/17'],
['Metals USA','Materials',0.0,327.0,'Rail fabrication','N235 Lab Maintenance 2016','2/4/16'],
['McMaster Carr','Materials',0.0,78.47,'Cost for materials and fixture fabrication. SEE NOTE','12394','2/3/16'],
['McMaster Carr','Materials',0.0,32.71,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','2/4/16'],
['McMaster Carr','Materials',1320.0,0.0,'','12686','8/27/18'],
['McMaster Carr','Materials',0.0,143.48,'Cost for materials and fixture fabrication. SEE NOTE','12394','2/3/16'],
['travers','General',0.0,54.05,'Tooling (bits, blades, etc.)','N236  Lab Maintenance 2017','3/23/17'],
['Tektronix','General',0.0,550.0,'Shock Testing Tested simultaneously','12603','5/12/17'],
['Mcmaster Carr','Materials',0.0,259.0,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/15/16'],
['Mechanical Precision','General',1415.0,0.0,'','12686','8/27/18'],
['McMaster Carr','Materials',160.0,0.0,'','12686','8/27/18'],
['Metals USA','Materials',1900.0,0.0,'','12686','8/27/18'],
['Mechanical Precision','General',500.0,2220.0,'A/E  Drill and tap the subplate transition plate for 1.5"-12 bolts','12439','10/11/17'],
['Fastenal','Materials',688.98,463.71,'A/E Purchase six (6) 1.5"-12 x 10"L ASTM A574 bolts','12439','10/11/17'],
['McMaster Carr','General',40.86,0.0,'','12439','10/11/17'],
['Tektronix','General',550.0,550.0,'Shock Testing Tested simultaneously','12692','10/11/17'],
['(2) 150# weldneck steel 10" flanges','Materials',500.0,0.0,'','13476','7/24/23'],
['shipping','General',200.0,0.0,'','13476','7/24/23'],
['McMaster Carr','Materials',0.0,58.69,'','12661','8/29/17'],
['Metals USA','Materials',150.0,0.0,'Setup and Prepare for Test','12666','8/29/17'],
['McMaster Carr','Materials',100.0,0.0,'','12668','8/30/17'],
['Steel','Materials',500.0,0.0,'','13476','7/24/23'],
['Metals USA','Materials',0.0,790.93,'','13261','6/28/22'],
['Droback','General',0.0,0.0,'Noise Susceptibility','12633','7/7/17'],
['Metals USA','Materials',0.0,404.75,'Purchase the materials and modify the tank. Partial billing for Engineering Services performed and materials purchased. Charges incurred to date.','12625','7/6/17'],
['FedEx','General',0.0,306.74,'EMI Testing','12468','7/6/17'],
['UPS','General',0.0,23.81,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/11/16'],
['Metals USA','Materials',0.0,265.0,'Purchase the materials and modify the tank. Partial billing for Engineering Services performed and materials purchased. Charges incurred to date.','12625','7/6/17'],
['Materials','Materials',375.0,0.0,'Setup and Prepare for Test','12632','7/6/17'],
['McMaster Carr','Materials',0.0,29.82,'Receive, weigh and fixture for test','12395','2/17/16'],
['Dat','General',0.0,360.0,'','12812','8/27/18'],
['FedEx','General',0.0,306.73,'Rental of power source','12576','7/6/17'],
['United Rentals','General',7100.0,3337.53,'Misc. Testing Provide power. SEE NOTE','12856','9/12/18'],
['Skylands','General',500.0,814.4,'Misc. Testing Provide power. SEE NOTE','12856','9/12/18'],
['Grainger and McMaster Carr','Materials',417.0,0.0,'Fixture Fabrication','12700','10/25/17'],
['HyVac Products','General',0.0,161.15,'','13151','11/22/21'],
['','Materials',845.0,825.0,'Fixture Fabrication','12705','10/27/17'],
['Misc','Materials',960.0,0.0,'Setup for Light Weight Shock. Price includes bookends','13443','2/13/23'],
['Mechanical Precision','General',0.0,75.0,'Equipment Repair & Maintenance','N238 Lab Maintenance 2018','9/13/18'],
['Akon','General',0.0,62.5,'Welding Curtain','N235 Lab Maintenance 2016','2/24/16'],
['Home Depot','Materials',0.0,19.85,'','12576','6/8/17'],
['Tektronix','Travel',0.0,50.0,'Shock Testing','12621','6/12/17'],
['FedEx','General',0.0,42.6,'Test Report .1','12335','2/25/16'],
['Akon','Materials',0.0,600.0,'Welding Curtain','N235 Lab Maintenance 2016','2/22/16'],
['Akon','Materials',0.0,300.0,'Welding Curtain','N235 Lab Maintenance 2016','2/22/16'],
['Home Depot','General',0.0,31.89,'','12576','6/12/17'],
['Travel to Tektronix','Travel',0.0,50.5,'','12610','5/15/17'],
['Metals USA','Materials',1000.0,0.0,'Fabricate a cable support system','12413','3/7/16'],
['Fuel for compressor','General',500.0,602.28,'Noise Susceptibility','12412','3/2/16'],
['McMaster Carr','Materials',0.0,38.42,'Receive, weigh and fixture for test 658','12405','2/26/16'],
['McMaster Carr','General',0.0,50.07,'Lab supplies','N236  Lab Maintenance 2017','3/30/17'],
['McMaster Carr','Materials',0.0,45.78,'Setup for Light Weight Shock test- DN50, 2"','13433','3/13/23'],
['Misc.','General',500.0,0.0,'Receive, weigh and fixture for test','12411','3/2/16'],
['Tool Fetch','General',0.0,177.67,'Miscellaneous Repair','N235 Lab Maintenance 2016','2/24/16'],
['McMaster Carr','Materials',0.0,77.09,'Rail fabrication','N235 Lab Maintenance 2016','2/24/16'],
['McMaster Carr','Materials',0.0,97.09,'Miscellaneous Repair','N235 Lab Maintenance 2016','2/24/16'],
['Mcmaster Carr','Materials',0.0,12.77,'Cost for materials and fixture fabrication. SEE NOTE','12394','3/7/16'],
['Drobach compressor rental','General',2950.0,1272.0,'Noise Susceptibility','12412','3/2/16'],
['McMaster Carr','Materials',0.0,33.96,'Receive, weigh and fixture for test','12336','2/26/16'],
['McMaster Carr','Materials',0.0,17.27,'','12382','3/7/16'],
['McMaster Carr','Materials',0.0,-22.66,'Constant Pressure Pump','N235 Lab Maintenance 2016','2/24/16'],
['Metals USA','Materials',0.0,160.0,'Figure 15 Build','N235 Lab Maintenance 2016','3/3/16'],
['Mechanical Precision','Materials',0.0,6600.0,'Fabricate the four (4) mounting brackets shown in drawing numbers 95-23400-6 and 95-23400-5','12337','3/10/16'],
['McMaster Carr','General',0.0,88.22,'Additional Effort #1 R/W/F, test failure, teardown and insulation and dielectric testing','12317','5/26/16'],
['McMaster Carr','Materials',0.0,49.69,'Miscellaneous Repair','N235 Lab Maintenance 2016','2/26/16'],
['Mechanical Precision','General',0.0,75.0,'Medium Weight Shock Testing, 5 blows, failed, then blow 6, failed','12386','3/10/16'],
['Drobach','General',2500.0,0.0,'','13461','5/23/23'],
['Walmart','General',0.0,11.98,'','12389','3/29/16'],
['Drobach compressor','General',0.0,2184.0,'Noise Susceptibility','12412','3/23/16'],
['McMaster Carr','Materials',0.0,101.93,'Figure 15 Build','N235 Lab Maintenance 2016','3/23/16'],
['McMaster Carr','Materials',0.0,93.58,'Receive, weigh and fixture for test','12358','3/16/16'],
['3\' x 3\' x 1" plate','Materials',400.0,0.0,'Receive, weigh and fixture for test','12428','4/11/16'],
['Compressor and fuel','Materials',3500.0,0.0,'Noise testing','13297','8/17/21'],
['Home Depot','Materials',0.0,11.68,'Cost for materials and fixture fabrication. SEE NOTE','12394','3/23/16'],
['McMaster Carr','Materials',0.0,12.78,'Receive, weigh and fixture for test','12415','3/23/16'],
['Metals USA','Materials',0.0,416.66,'LWS Anvil','N235 Lab Maintenance 2016','4/1/16'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility Model 285155-0001','12434','5/26/16'],
['McMaster Carr','General',0.0,62.15,'Miscellaneous Repair','N235 Lab Maintenance 2016','5/11/16'],
['Home Depot','General',0.0,195.87,'Tooling (bits, blades, etc.)','N236  Lab Maintenance 2017','8/25/17'],
['Instrumart','Materials',0.0,1645.0,'Tenneystrat Altitude, New Controller','N236  Lab Maintenance 2017','8/28/17'],
['Wilson Products','Materials',0.0,76.52,'','13584','7/11/25'],
['McMaster Carr','General',50.0,105.99,'Setup and Prepare for Test Includes 2 foundation fabrications','12662','8/21/17'],
['Drobach','General',3450.0,2184.0,'Noise Susceptibility Setup, test, and prepare to ship','12432','4/19/16'],
['Tektronix','General',550.0,550.0,'Shock Testing','12657','8/10/17'],
['Travel to Hunterdon Mill','Travel',0.0,8.0,'','12569','8/9/17'],
['Drobach compressor rental and fuel','General',4550.0,0.0,'Noise Susceptibility Setup and perform the test','12664','8/23/17'],
['McMaster Carr','Materials',0.0,291.33,'Constant Pressure Pump','N235 Lab Maintenance 2016','4/21/16'],
['Mike Gibson expense','Materials',0.0,34.61,'Constant Pressure Pump','N235 Lab Maintenance 2016','4/21/16'],
['Mcmaster Carr','General',0.0,104.65,'Miscellaneous Repair','N235 Lab Maintenance 2016','4/21/16'],
['Gas for wind machine','General',0.0,34.09,'Wind/Rain','12682','9/27/17'],
['Home Depot','Materials',0.0,5.54,'Constant Pressure Pump','N235 Lab Maintenance 2016','4/21/16'],
['Mcmaster Carr','Materials',0.0,35.46,'Fabricate a cable support system','12413','4/21/16'],
['McMaster Carr','Materials',50.0,0.0,'Setup and Prepare for Test','12683','9/25/17'],
['Travel- Doug Gromek','Travel',0.0,47.0,'Shock Testing','12657','8/24/17'],
['Napa','Materials',0.0,6.69,'Fabricate the test fixture','12643','10/5/17'],
['McMaster Carr','Materials',0.0,97.08,'','N235 Lab Maintenance 2016','4/14/16'],
['Miscellaneous hoses, fitting, etc.','Materials',500.0,0.0,'Build a manifold to supply all units with 2190 Oil.','13403','12/27/22'],
['Mcmaster Carr','Materials',0.0,10.98,'','12382','4/14/16'],
['System 22','Materials',0.0,799.0,'Purchase and pickup mounting bolts','12427','4/15/16'],
['Ihling\'s Appliances','General',0.0,40.0,'A/E Disposal cost of refrigerator and freezer','12662','9/28/18'],
['Dat','General',0.0,320.0,'','12812','9/17/18'],
['Dat','General',0.0,410.0,'','12812','10/1/18'],
['Dat','General',0.0,520.0,'','12634','10/1/18'],
['Tractor Supply','Materials',0.0,98.94,'Receive, weigh and fixture for test','12337','4/14/16'],
['Tektronix','General',3600.0,4430.0,'Subcontract Test Subcontracted Budgetary Sand and Dust. Possibly Dust only','12431','4/13/16'],
['Bolts','General',100.0,0.0,'Receive, weigh and fixture for test','12430','4/12/16'],
['McMaster Carr','Materials',0.0,46.16,'Vibration Testing Setup and perform the vibration test. Tested simultaneously','12736','1/12/18'],
['Flanges','Materials',60.0,0.0,'Setup and prepare for test','13153','7/7/20'],
['Vacuum Gauges- Jordan paid by CC','Materials',0.0,81.43,'','13151','10/18/21'],
['Dat 11/10/18','General',0.0,320.0,'','12680','11/12/18'],
['Metals USA','Materials',210.0,0.0,'Setup and Prepare for Test SEE NOTE','12349','1/23/18'],
['Doug Gromek- travel to Tektronix','Travel',0.0,44.6,'Shock Testing Tested simultaneously','12692','11/1/17'],
['Discount hydraulic hose','Materials',0.0,84.31,'A/E Hose and adapters','12439','10/27/17'],
['Finkle','Materials',412.75,330.46,'Setup and Prepare for Test Includes 2 foundation fabrications','12662','8/21/17'],
['McMaster Carr','Materials',100.0,0.0,'Setup and Prepare for Test','12656','8/3/17'],
['Tektronix','General',1100.0,1100.0,'Shock Testing Tested separately','12647','8/3/17'],
['AeroNav','General',1100.0,1100.0,'Shock Testing Perform the shock test. Boards tested separately','12655','8/3/17'],
['Tektronix','General',1100.0,1100.0,'Shock Testing Tested separately','12641','8/3/17'],
['Tektronix','General',1100.0,0.0,'Shock Testing Perform the shock test. Boards tested separately','12653','8/3/17'],
['Tektronix','General',1100.0,0.0,'Shock Testing Perform the shock test. Boards tested separately','12654','8/3/17'],
['Tektronix','General',1100.0,1100.0,'Shock Testing Tested separately','12637','8/3/17'],
['AeroNav','General',1100.0,1100.0,'Shock Testing Perform the shock test. Boards tested separately','12650','8/3/17'],
['Tektronix','General',1100.0,0.0,'Shock Testing Perform the shock test. Boards tested separately','12651','8/3/17'],
['Tektronix','General',550.0,550.0,'Shock Testing Boards tested simultaneously.','12638','8/3/17'],
['Tektronix','General',1100.0,1100.0,'Shock Testing Tested separately','12636','8/3/17'],
['Tektronix','General',1100.0,1100.0,'Shock Testing Tested separately','12640','8/3/17'],
['McMaster Carr','Materials',0.0,75.11,'Setup for LW Shock- price includes bookend fabrication','13292','10/11/21'],
['Drobach','General',3015.0,0.0,'','12434','4/26/16'],
['Metals USA','Materials',0.0,1605.0,'Fabricate the test fixture','12643','9/6/17'],
['Metals USA','Materials',0.0,326.5,'Fabricate the test fixture','12643','9/6/17'],
['Thermal Product Solutions','General',0.0,2809.53,'Equipment Repair & Maintenance','N236  Lab Maintenance 2017','9/5/17'],
['Miscellaneous','Materials',1375.0,0.0,'Setup for LW Shock','13451','3/22/23'],
['Mcmaster Carr','Materials',0.0,104.04,'Noise Susceptibility Model 285154-0001','12434','5/10/16'],
['Tektronix','General',3300.0,3300.0,'Subcontract Test','12668','9/12/17'],
['W&O Supply','Materials',526.66,0.0,'Setup and Prepare for Test','12635','7/11/17'],
['McMaster Carr','Materials',0.0,163.86,'Siren Rebuild','N235 Lab Maintenance 2016','4/28/16'],
['Home Depot','Materials',0.0,-29.79,'','12576','7/11/17'],
['Mechanical Precision','Materials',680.0,600.0,'Fixture Fabrication Fabricate the 36" x 36" x 2" spacer plate','12505','7/12/17'],
['McMaster Carr','Materials',0.0,49.36,'Fabricate the four (4) mounting brackets shown in drawing numbers 95-23400-6 and 95-23400-5','12337','4/28/16'],
['EBay','General',0.0,39.0,'Fabricate the four (4) mounting brackets shown in drawing numbers 95-23400-6 and 95-23400-5','12337','4/28/16'],
['Oil','General',569.0,0.0,'Medium Weight Shock Testing Fuel filter','12639','7/12/17'],
['Cap screws','Materials',75.0,0.0,'Setup and Prepare for Test','12639','7/12/17'],
['Walmart','General',0.0,10.41,'','13262','11/3/21'],
['Home Depot','Materials',0.0,-32.21,'','12576','7/11/17'],
['Home Depot','Materials',0.0,-65.57,'','12576','7/11/17'],
['Home Depot','Materials',0.0,-66.12,'','12576','7/11/17'],
['Bolts','Materials',100.0,0.0,'Receive, weigh and fixture for Vibration test SEE NOTE','12395','4/27/16'],
['Home Depot','Materials',0.0,23.91,'','12895','1/18/19'],
['Lowes','Materials',0.0,72.29,'Engineering Services Perform the cycling test, failed','12429','4/28/16'],
['Industrial Control & Automation','General',0.0,87.39,'Miscellaneous Repair','N235 Lab Maintenance 2016','5/10/16'],
['','Materials',100.0,0.0,'Receive, weigh and fixture for test E - 3, T - 11','12440','5/11/16'],
['Metals USA','General',500.0,0.0,'Receive, weigh and fixture for test','12439','5/11/16'],
['UPS Shipping','General',0.0,124.32,'','13332','6/9/22'],
['Home Depot','Materials',0.0,22.22,'Miscellaneous Repair','N235 Lab Maintenance 2016','5/13/16'],
['Jordan\'s Credit card- Metals Depot','Materials',0.0,432.11,'','13361','6/9/22'],
['Zoro','General',0.0,184.75,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','4/28/16'],
['Shipping of material','Materials',250.0,0.0,'','13484','9/13/23'],
['Finkles','Materials',0.0,23.7,'Fixture Fabrication Fabricate adapter fixture','12687','10/3/17'],
['Job Lot','General',0.0,14.66,'','13151','11/3/21'],
['Mechanical Precision','General',0.0,112.5,'Siren Rebuild','N235 Lab Maintenance 2016','5/18/16'],
['McMaster Carr','General',0.0,65.52,'Fabricate the test fixture','12643','9/28/17'],
['F&L','General',0.0,188.64,'Fabricate the four (4) mounting brackets shown in drawing numbers 95-23400-6 and 95-23400-5','12337','4/28/16'],
['McMaster Carr','Materials',0.0,208.81,'','13250','12/1/21'],
['Ace industries','General',0.0,126.27,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','4/28/16'],
['McMaster Carr','Materials',100.0,0.0,'Fixture Fabrication','12701','10/25/17'],
['Bookend material, delivered','Materials',1225.0,0.0,'Setup for MW Shock Test','13302','9/9/21'],
['2  5" 300# ansi flanges','Materials',550.0,0.0,'Setup for MW Shock Test','13302','9/9/21'],
['Material shipping','Materials',500.0,0.0,'Setup for MW Shock Test','13302','9/9/21'],
['Mcmaster Carr','Materials',0.0,104.05,'Noise Susceptibility Setup, test, and prepare to ship','12432','5/10/16'],
['Home Depot','General',0.0,48.97,'Receive, weigh and fixture for test Receive and fixture for vibration','12414','4/28/16'],
['McMaster Carr','General',0.0,80.55,'LWS Anvil','N235 Lab Maintenance 2016','5/13/16'],
['Materials','Materials',215.0,0.0,'Setup and Prepare for Test','12679','9/11/17'],
['Napa','General',0.0,29.65,'Equipment Repair & Maintenance','N236  Lab Maintenance 2017','9/7/17'],
['McMaster Carr','Materials',0.0,60.93,'','13469','11/6/23'],
['Metals USA','Materials',0.0,372.0,'Fabricate a cable support system','12413','4/28/16'],
['Metals USA','Materials',2328.0,1669.06,'Setup and Prepare for Test','12855','9/12/18'],
['Metals USA','Materials',1500.0,551.55,'Receive, weigh and fixture for test','12442','5/19/16'],
['Metals USA','General',200.0,0.0,'Setup and Prepare for Test','12715','11/28/17'],
['Metals USA','Materials',200.0,0.0,'Setup and Prepare for Test','12716','11/28/17'],
['McMaster Carr','General',0.0,62.7,'Structureborne Noise Test SEE NOTE','12734','1/25/18'],
['McMaster Carr','General',0.0,23.44,'','N235 Lab Maintenance 2016','6/6/16'],
['Fastenal','Materials',0.0,48.05,'','12439','11/30/17'],
['Metals USA','Materials',0.0,439.25,'Assemble the system, fill with water, and bleed the air.','12686','7/16/20'],
['1/2 plate plus 4" tube','Materials',75.0,0.0,'A/E quote #16-140...fixturing for motor support, spocket shaft laoding and control box mounting at 15 degree angle. For CDRL #D026.485 and CDRL #D026.494','12405','5/24/16'],
['Metals USA','Materials',0.0,350.0,'Miscellaneous Repair','N235 Lab Maintenance 2016','5/20/16'],
['Material Bolts','Materials',100.0,0.0,'Receive, weigh and fixture for test 8" 360','12443','5/20/16'],
['Drobach','General',2900.0,2184.0,'Noise Susceptibility Paragraphs 4.2.2.1.1.14 and 3.2.5.14. SEE NOTE','12465','7/5/16'],
['Metals USA','Materials',0.0,280.0,'Miscellaneous Repair','N235 Lab Maintenance 2016','5/20/16'],
['Metals USA','Materials',0.0,95.0,'Rail fabrication','N235 Lab Maintenance 2016','5/20/16'],
['Mike Gibson','Travel',0.0,8.0,'Setup and Prepare for Test','12632','10/5/17'],
['Materials','Materials',0.0,72.5,'Purchase the materials requested.','12643','10/5/17'],
['Joseph Finkle','Materials',0.0,54.8,'Setup and Prepare for Test','12632','10/5/17'],
['Bookend material, delivered','Materials',1225.0,0.0,'Setup for MW Shock Test. Price includes bookend fabrication','13303','9/9/21'],
['2   10" 300# ansi flanges','Materials',1596.0,0.0,'Setup for MW Shock Test. Price includes bookend fabrication','13303','9/9/21'],
['Materials shipping cost','Materials',750.0,0.0,'Setup for MW Shock Test. Price includes bookend fabrication','13303','9/9/21'],
['Metals USA','Materials',200.0,272.5,'Setup and Prepare for Test','12724','12/6/17'],
['McMaster Carr','Materials',0.0,9.65,'Setup and Prepare for Test','13133','6/11/20'],
['Alltest Instruments, Inc.','General',0.0,495.0,'Misc. Testing Power Source','13029','6/18/20'],
['Ragen purchases','Materials',0.0,3438.77,'EMI Testing','13175','12/1/21'],
['Dat','General',0.0,240.0,'','12823','3/4/19'],
['Drobach-credit','General',0.0,-1190.0,'','12895','2/26/19'],
['Mechanical Precision','General',0.0,560.0,'','12932','11/23/21'],
['Dat','General',0.0,180.0,'','12634','9/24/18'],
['gas for wind machine','General',0.0,31.0,'','12682','10/12/17'],
['Walmart','Materials',0.0,80.12,'','12682','10/12/17'],
['Fastenal','Materials',20.52,0.0,'A/E Purchase six (6) 1.5" washers','12439','10/11/17'],
['Wilson Products','General',0.0,298.1,'Lightweight Shock Testing','12516','11/9/16'],
['Drobach','General',2350.0,1728.0,'Noise Susceptibility','12691','10/10/17'],
['McMaster Carr','General',0.0,4.63,'Setup and Prepare for Test Includes 2 foundation fabrications','12662','11/10/17'],
['Travel to Mechanical Precision','Travel',0.0,9.0,'Fixture Fabrication','12705','11/13/17'],
['Purchase materials','Materials',350.0,0.0,'Fixture fabrication','12707','11/9/17'],
['Skylands','General',500.0,730.9,'','12706','11/8/17'],
['Materials','Materials',25.0,0.0,'A/E fabricate 8 new strap staples and install. NU Labs quote #17-475A. Need updated PO.','12662','11/10/17'],
['Drobach','General',3150.0,0.0,'','12706','11/8/17'],
['McMaster Carr','Materials',0.0,217.48,'','12706','11/8/17'],
['Ereplacement parts','General',0.0,72.91,'Miscellaneous Repair','N235 Lab Maintenance 2016','7/7/16'],
['AeroNav','General',1100.0,1200.0,'Subcontract Test Perform the shock test. Boards tested separately','12710','11/17/17'],
['Foley','Materials',0.0,28.58,'','12639','3/14/18'],
['Mechanical Precision','Materials',1200.0,1200.0,'Fixture Fabrication Fabricate a ring for the motor flange step.','12615','2/6/18'],
['Fastenal','Materials',0.0,86.62,'Noise test','13156','10/26/20'],
['McMaster Carr','Materials',0.0,271.76,'','12686','8/10/20'],
['McMaster Carr','Materials',0.0,156.65,'Sexton Refurb','N2021- Lab Maintenance 2021','10/27/21'],
['Metals USA','Materials',0.0,425.0,'Fixture Fabrication Fabricate a ring for the motor flange step.','12615','2/21/18'],
['McMaster Carr','General',0.0,92.52,'','N235 Lab Maintenance 2016','7/11/16'],
['McMaster Carr','Materials',0.0,32.04,'A/E  Drill and tap the subplate transition plate for 1.5"-12 bolts','12439','10/13/17'],
['Myles transportation','General',0.0,192.0,'','12286','8/10/16'],
['Mike Gibson','Travel',0.0,8.0,'Setup and Prepare for Test Includes 2 foundation fabrications','12662','10/16/17'],
['Drobach','General',4065.0,2184.0,'Noise Susceptibility','12739','1/17/18'],
['Mcmaster Carr','Materials',0.0,11.87,'Setup and Prepare for Test SEE NOTE','12349','3/15/18'],
['Technology Dynamics,','General',2800.0,5300.0,'Power Source rental- 2 weeks','13172','9/2/20'],
['Supplies','Materials',250.0,0.0,'Setup and perform the solderability test','12837','7/13/18'],
['McMaster Carr','Materials',0.0,27.2,'','12701','12/20/17'],
['Metals USA','Materials',200.0,272.5,'Setup and Prepare for Test','12722','12/5/17'],
['UPS','General',0.0,14.29,'','12858','6/25/20'],
['','General',250.0,0.0,'Misc. Testing Setup and perform the resistance to solvents test','12760','2/28/18'],
['Skylands','Materials',0.0,749.1,'Receive, setup and perform the noise susceptibility test','12706','12/27/17'],
['Mechanical Precision','Materials',0.0,750.0,'A/E  Drill and tap the subplate transition plate for 1.5"-12 bolts','12439','12/6/17'],
['McMaster Carr','General',0.0,34.69,'','N235 Lab Maintenance 2016','6/23/16'],
['Metals USA','Materials',1657.0,993.0,'','13281','11/10/21'],
['Metals USA','Materials',1985.0,1744.63,'','13341','1/12/22'],
['McMaster Carr','General',0.0,7.45,'','12372','6/23/16'],
['Metals USA','Materials',200.0,0.0,'Setup and Prepare for Test','12725','12/6/17'],
['Metals USA','Materials',1700.0,0.0,'Setup for MW shock','13152','7/2/20'],
['McMaster Carr','General',0.0,12.75,'','12371','6/23/16'],
['Metals USA','Materials',600.0,535.0,'Setup for Medium Weight Shock Price includes bookend fixture fabrication. Partial Billing 1/2','13111','3/11/20'],
['Mechanical Precision','General',0.0,570.0,'','13509','4/4/24'],
['Dat','General',0.0,240.0,'','12880','2/19/19'],
['Walmart','Materials',0.0,7.29,'','13137','1/25/23'],
['UPS','General',0.0,14.92,'','12890','6/18/20'],
['Radiant Global Logistics','General',0.0,155.06,'Shipping Charges Estimated freight to Philadelphia','12352','6/24/16'],
['Metals USA','Materials',620.0,0.0,'Setup and Prepare for Test','12615','2/6/18'],
['Harbor Freight','General',0.0,4.25,'','12895','1/14/19'],
['Mcmaster Carr','General',0.0,85.98,'Solderability','12437','6/23/16'],
['Bio Clinical Labs','Materials',0.0,130.76,'Resistance to Solvents','12437','6/23/16'],
['Mechanical Precision','Materials',550.0,850.0,'Setup and Prepare for Test','12793','4/24/18'],
['McMaster Carr','General',0.0,6.57,'','N235 Lab Maintenance 2016','6/23/16'],
['Harbor Freight','Materials',150.0,84.79,'Misc. Testing Provide a circulating system','12728','12/18/17'],
['NTS','General',0.0,600.0,'Subcontract Test Set up and perform the referenced EMI tests at NTS Tinton Falls, NJ','12883','1/30/19'],
['NTS','General',0.0,6100.0,'Subcontract Test Set up and perform the referenced EMI tests at NTS Tinton Falls, NJ','12883','1/30/19'],
['Hunterdon Mill','Materials',0.0,9.21,'A/E Provide the parts and flanges requested','12639','3/16/18'],
['Wilson Products','General',520.0,607.34,'','12954','4/9/19'],
['Compressor Rental and fuel','General',3500.0,3008.0,'','13405','9/29/22'],
['Metals USA','Materials',150.0,0.0,'Setup and Prepare for Test','12615','2/6/18'],
['McMaster Carr','General',0.0,6.16,'Additional Effort #1 R/W/F, test failure, teardown and insulation and dielectric testing','12317','7/7/16'],
['McMaster Carr','General',0.0,23.34,'LWS Anvil','N235 Lab Maintenance 2016','7/7/16'],
['Durometer and cert','General',276.0,0.0,'Test Procedure .1','12749','1/30/18'],
['McMaster Carr','Materials',0.0,40.55,'Vibration Testing Setup and perform the vibration test. Tested simultaneously','12736','1/17/18'],
['McMaster Carr','Materials',0.0,16.1,'','12639','1/17/18'],
['McMaster Carr','Materials',0.0,35.76,'Equipment Repair & Maintenance','N238 Lab Maintenance 2018','1/17/18'],
['Mike- travel- Kearny','Travel',0.0,47.0,'A/E drill and tap 2" steel plate','12932','7/14/20'],
['Tektronix','General',875.0,0.0,'Subcontract Test Shock testing - Tested simultaneously','12740','1/17/18'],
['McMaster Carr','Materials',0.0,10.22,'','13112','9/25/20'],
['McMaster Carr','Materials',125.0,0.0,'Setup and Prepare for Test','12733','12/26/17'],
['Fastenal','Materials',0.0,10.97,'','12439','11/30/17'],
['Drobach','General',0.0,2184.0,'Receive, setup and perform the noise susceptibility test','12706','11/30/17'],
['Travel to Tektronix','Travel',0.0,50.0,'Subcontract Test Setup and perform the Unrestrained Vibration test','12752','2/16/18'],
['Drobach','General',2500.0,0.0,'Perform 3 acoustic noise tests','13150','6/29/20'],
['Dat','General',0.0,240.0,'','12880','2/15/19'],
['Metals USA','Materials',250.0,0.0,'Setup and Prepare for Test','12763','3/5/18'],
['McMaster Carr','Materials',0.0,36.86,'','12949','1/8/22'],
['McMaster Carr','General',0.0,107.38,'A/E drill and tap 2" steel plate','12932','7/2/20'],
['Walmart','Materials',0.0,13.57,'','12847','2/14/19'],
['Travel to Linde Welding','Travel',0.0,10.0,'','13387','11/27/23'],
['Tektronix','General',600.0,600.0,'Subcontract Test Setup and perform the Unrestrained Vibration test','12752','2/2/18'],
['Hunterdon Mill','Materials',100.0,0.0,'Setup and Prepare for Test','12759','2/28/18'],
['Drobach','General',2500.0,818.5,'Noise testing','13182','10/2/20'],
['FedEx','General',0.0,6.4,'Tear down and prepare to ship','12895','2/21/19'],
['McMaster Carr','Materials',0.0,57.44,'','12639','3/1/18'],
['Fastenal','Materials',0.0,86.93,'Noise Susceptibility Setup and perform the test on the second unit','12588','1/11/18'],
['Metals USA','Materials',200.0,0.0,'Setup and Prepare for Test','12723','12/6/17'],
['Metals USA','Materials',826.0,954.77,'Setup and Prepare for Test','12735','1/9/18'],
['Drobach','General',4000.0,1728.0,'Noise test','13156','7/13/20'],
['Fox Lumber and travel exp','Materials',0.0,34.53,'Misc. Testing','12669','2/21/18'],
['Technology Dynamics','General',5000.0,5000.0,'Rental of programmable power source','12681','12/1/17'],
['ebay- Jordan','General',0.0,24.42,'','13151','7/14/20'],
['Mating Flanges','Materials',1350.0,0.0,'Setup for MW Shock- price includes bookends','13447','3/6/23'],
['Bookend material, includes shipping','Materials',3300.0,0.0,'Setup for MW Shock- price includes bookends','13447','3/6/23'],
['Parts and steel','Materials',282.6,0.0,'A/E Provide the parts and flanges requested','12639','2/8/18'],
['McMaster Carr','Materials',0.0,85.9,'','12702','3/1/18'],
['Hunterdon Mill','Materials',0.0,3.42,'Receive, weigh and fixture for test','12579','3/29/17'],
['McMaster Carr','Materials',0.0,243.59,'Siren Rebuild','N235 Lab Maintenance 2016','7/18/16'],
['Bookend material','Materials',1725.0,0.0,'Setup for MW Shock','13448','3/6/23'],
['Mechanical Precision','General',0.0,370.0,'Receive, weigh and fixture for test','12519','11/17/16'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility Setup and perform the test on the second unit','12588','1/11/18'],
['Metals USA','Materials',250.0,0.0,'Setup and Prepare for Test Receive and fixture the ICS Dual Cabinet for test','12890','11/21/18'],
['McMaster Carr','Materials',0.0,20.87,'A/E Provide the parts and flanges requested','12639','3/15/18'],
['Metals USA','Materials',2095.0,1347.5,'Fabricate test fixture','12470','7/20/16'],
['Miscellaneous','Materials',425.0,0.0,'Setup and Prepare for Test','12799','5/9/18'],
['Drobach','General',3300.0,0.0,'','13343','1/19/22'],
['270 vdc power supply','General',500.0,0.0,'','13343','1/19/22'],
['Hoses','Materials',685.0,414.3,'Provide 2", 1.5 " 200 psig hoses, flanges, and loads.','12943','3/8/19'],
['Home Depot','Materials',0.0,24.32,'','12460','2/14/18'],
['Home Depot','Materials',0.0,-11.12,'','12460','2/14/18'],
['McMaster Carr','General',0.0,59.76,'','12950','11/13/20'],
['McMaster Carr','Materials',0.0,12.22,'','12841','10/5/18'],
['Hunterdon Mill','Materials',0.0,7.73,'','12841','10/5/18'],
['Miscellaneous','Materials',1273.5,0.0,'Receive, weigh and fixture for test  24"','12469','7/20/16'],
['McMaster Carr','General',0.0,45.06,'','12951','4/12/19'],
['Pump','Materials',150.0,0.0,'Medium Weight Shock Testing','12787','4/10/18'],
['Metals USA','Materials',0.0,750.0,'Fixture Fabrication Fabricate the cylinder holding fixture','12877','1/30/19'],
['Drobach','Materials',3500.0,0.0,'Noise test','13344','1/25/22'],
['Metals USA','Materials',3775.6,2156.0,'Receive, weigh and fixture for test 30"','12469','7/20/16'],
['Dat Vu','General',0.0,320.0,'','12674','8/14/18'],
['Fastenal','General',0.0,11.62,'','12639','3/28/18'],
['McMaster Carr','Materials',0.0,15.45,'','12371','7/27/16'],
['Mcmaster Carr','Materials',0.0,155.23,'','N235 Lab Maintenance 2016','7/20/16'],
['Metals USA','Materials',0.0,367.85,'Setup and Prepare for Test','12709','4/12/18'],
['Metals USA','Materials',0.0,641.34,'Setup and Prepare for Test','12709','4/12/18'],
['Metals USA','Materials',225.0,0.0,'','13160','7/24/20'],
['Dat','General',0.0,240.0,'EMI Testing Additional charges for CS116 Testing','12880','2/25/19'],
['Metals USA','Materials',630.0,650.39,'Receive, weigh and fixture for test','12473','7/25/16'],
['Walmart','Materials',0.0,12.41,'','12895','1/18/19'],
['Ragen McAdoo purchase','Materials',0.0,316.67,'','12895','1/3/19'],
['Gasket material','Materials',140.0,0.0,'Setup and Prepare for Test Replace gasket on tank.','12447','7/26/16'],
['Nova','General',5000.0,0.0,'Misc. Testing 1.4 Rental of power source','12780','4/3/18'],
['Home Depot','General',0.0,32.88,'','12895','1/30/19'],
['Metals USA','Materials',1756.0,1625.5,'Setup and Prepare for Test','12709','4/19/18'],
['Travel exp','Travel',0.0,37.0,'','13288','1/25/22'],
['Mechanical Precision','General',0.0,0.0,'Fixture Fabrication Fabricate the Vertical Pump fixture per the Circor drawing provided.','12943','3/8/19'],
['Drobach','Materials',3500.0,598.5,'Noise Susceptibility Test','13174','9/16/20'],
['McMaster Carr','General',0.0,16.83,'Setup and Prepare for Test','12737','5/21/18'],
['Jim Vannatta- Travel exp','Travel',0.0,19.0,'','12686','7/28/20'],
['McMaster Carr','Materials',0.0,23.15,'Repair the unit as directed by customer','13073','7/24/20'],
['Dat','General',0.0,210.0,'','12812','10/9/18'],
['Dat','General',0.0,320.0,'','12747','10/9/18'],
['Metals USA','Materials',1850.0,300.0,'Setup for LW Shock','13364','4/11/22'],
['McMaster Carr','Materials',0.0,24.69,'Repair the unit as directed by customer','13073','7/22/20'],
['Bookend material- delivered','Materials',3400.0,0.0,'Setup for MW Shock','13455','4/3/23'],
['Miscellaneous hardware','Materials',500.0,0.0,'Setup for MW Shock','13455','4/3/23'],
['Walmart','Materials',0.0,3.96,'Setup and Prepare for Test','13073','7/21/20'],
['Flanges, see quote @ $750/each','Materials',1500.0,0.0,'Setup for MW Shock','13455','4/3/23'],
['ereplacement parts','General',0.0,71.08,'Miscellaneous Repair','N235 Lab Maintenance 2016','7/27/16'],
['Bookend material and shipping','Materials',3400.0,0.0,'Setup for MW Shock test','13454','4/3/23'],
['Miscellaneous hardware','Materials',500.0,0.0,'Setup for MW Shock test','13454','4/3/23'],
['Flanges, se quote @ $750/each','Materials',1500.0,0.0,'Setup for MW Shock test','13454','4/3/23'],
['Alex Rothschild','Travel',0.0,73.5,'','13188','11/6/20'],
['Steel plate','Materials',825.0,0.0,'','12840','8/1/18'],
['Caltest','General',0.0,430.0,'Misc. Testing 1.4 Rental of power source','12780','7/13/18'],
['McMaster Carr','Materials',0.0,32.39,'','12639','3/28/18'],
['GJ Chemical','General',0.0,1279.98,'Vibration Testing SEE NOTE','12375','7/27/16'],
['Zoro','Materials',0.0,103.84,'Tooling (Bits, Blades, etc.)','N235 Lab Maintenance 2016','7/27/16'],
['Metals Depot','Materials',0.0,35.98,'LWS Anvil','N235 Lab Maintenance 2016','7/27/16'],
['Dat','General',0.0,240.0,'RS101','12864','4/15/19'],
['Drobach','General',3874.0,2184.0,'Noise Susceptibility','12582','3/30/17'],
['McMaster Carr','General',0.0,7.84,'Receive, weigh and fixture for test','12579','3/30/17'],
['Hunterdon Mill','Materials',0.0,9.14,'','12569','7/27/17'],
['PA Steel','Materials',0.0,574.37,'','13433','3/24/23'],
['Home Depot','Materials',0.0,159.92,'','12576','6/12/17'],
['Materials','Materials',755.0,0.0,'Purchase the materials and modify the tank. Partial billing for Engineering Services performed and materials purchased. Charges incurred to date.','12625','6/14/17'],
['McMaster Carr','General',0.0,40.55,'','13293','6/28/23'],
['Clamps','Materials',0.0,0.0,'','12820','6/15/18'],
['Sunbelt rental','General',1430.0,1186.48,'Misc. Testing Rent the air flow system first month. See Note','12780','4/3/18'],
['Warren Pumps','General',5000.0,0.0,'DDAM of the test fixture .3','12775','5/21/18'],
['Home Depot','Materials',0.0,10.82,'','12822','6/25/18'],
['Finkle & Son','Materials',0.0,116.67,'Fixture Fabrication Fabricate a Test Fixture','12895','1/10/19'],
['The Hose Shop','Materials',0.0,317.13,'','12639','3/28/18'],
['Metals USA','Materials',0.0,544.55,'','N238 Lab Maintenance 2018','9/18/18'],
['Home Depot','Materials',0.0,87.73,'New Drip Test Rack','N2021- Lab Maintenance 2021','9/13/21'],
['Home Depot','Materials',0.0,48.72,'EMI Testing','13175','9/13/21'],
['Hunterdon Mill','Materials',0.0,21.67,'','12733','5/18/18'],
['Steel for frame','Materials',200.0,0.0,'','13563','8/16/24'],
['Dat','General',0.0,380.0,'','12812','8/20/18'],
['Dat','General',0.0,180.0,'','12812','8/20/18'],
['Hesco','Materials',0.0,165.63,'','13288','2/4/22'],
['','General',100.0,0.0,'Enclosure Effectiveness Test','12489','8/22/16'],
['Miscellaneous','Materials',510.0,0.0,'Setup and Prepare for Test','12827','7/2/18'],
['Zoro','Materials',0.0,118.42,'','12635','5/24/18'],
['Bookend material, freight, flanges','Materials',1100.0,0.0,'Setup for LW Shock-1','13411','10/13/22'],
['Springfield Metal Products','Materials',0.0,213.25,'','13180','5/1/24'],
['Mechanical Precision','General',14000.0,14000.0,'Fixture Fabrication','12775','5/22/18'],
['Fastenal','Materials',31.0,0.0,'Setup and Prepare for Test','12835','7/12/18'],
['Parts Express','Materials',0.0,294.37,'Siren Rebuild','N238 Lab Maintenance 2018','7/27/18'],
['McMaster Carr','General',0.0,45.44,'Receive and Set up for Test Re-set up for test','12358','8/18/16'],
['Advanced Test Equipment rental- January 2022','General',0.0,2398.0,'','13175','2/4/22'],
['Advanced test equipment- Dec 2021','General',0.0,2398.0,'EMI Testing','13175','1/11/22'],
['Fastenal','Materials',31.0,0.0,'Setup and Prepare for Test','12813','5/25/18'],
['McMaster Carr','Materials',0.0,77.08,'Setup and Prepare for Test','12797','7/5/18'],
['FedBid','General',0.0,135.45,'Misc. Testing FedBid processing charge','12488','8/18/16'],
['Metals USA','Materials',2200.0,1764.0,'Setup for MW Shock Test','13347','2/3/22'],
['Lowes','General',0.0,2.96,'Setup and Prepare for Test','12737','5/21/18'],
['','Materials',1750.0,232.25,'Setup for MW Shock Test. Price includes bookend fabrication','13261','6/14/21'],
['Lowes','Materials',0.0,68.47,'','13485','4/5/24'],
['Sunbelt','General',0.0,887.93,'Misc. Testing Rental of airflow system June 2018','12780','7/27/18'],
['McMaster Carr','General',0.0,247.36,'','N235 Lab Maintenance 2016','8/15/16'],
['Chesapeake Bay Rubber Co','Materials',0.0,60.21,'','13111','9/14/22'],
['Metals USA','Materials',0.0,818.76,'Fixture Repair & Maintenance','N238 Lab Maintenance 2018','7/26/18'],
['Sunbelt rentals','General',0.0,887.93,'','12780','6/27/18'],
['McMaster Carr','General',0.0,36.59,'Miscellaneous','N2020- Lab Maintenance 2020','10/2/20'],
['','General',500.0,0.0,'','12955','4/11/19'],
['Metals USA','Materials',0.0,1120.65,'','13288','2/3/22'],
['Harbor Freight','General',0.0,24.34,'','12895','1/21/19'],
['Dat','General',0.0,120.0,'','12838','1/21/19'],
['Lowes','Materials',0.0,38.45,'','13175','2/15/22'],
['Ace Hardware','General',0.0,3.49,'','12372','8/19/16'],
['Steel plate 60" x 76" x 1.5"','Materials',2650.0,0.0,'','13477','7/25/23'],
['Shipping for steel','General',350.0,0.0,'','13477','7/25/23'],
['Max Wolstein','Travel',0.0,254.23,'Misc. Testing Travel to the Leistriz facility,setup for test, and return to NU Labs','12898','3/15/19'],
['Job Lot','General',0.0,15.98,'','13406','5/16/23'],
['Home Depot','General',0.0,27.15,'EMI Testing 4.2  Set up and perform the referenced EMI tests','12680','10/25/18'],
['Home Depot','General',0.0,-78.88,'','12864','4/17/19'],
['Dat','General',0.0,140.0,'','12812','9/24/18'],
['Doug Gromek- travel exp','Travel',0.0,24.0,'Subcontract Test Subcontracted Budgetary Sand and Dust. Possibly Dust only','12431','8/29/16'],
['Miscellaneous supplies','Materials',747.0,0.0,'Setup and Prepare for Test','12847','8/10/18'],
['Miscellaneous','General',900.0,0.0,'Setup and Prepare for Test','12847','8/10/18'],
['Blackman','Materials',0.0,0.97,'Humidity Testing','12372','8/24/16'],
['Materials','Materials',400.0,0.0,'Setup and Prepare for Test','12904','12/18/18'],
['Home Depot','General',0.0,150.0,'','12864','4/17/19'],
['Hunterdon Mill','Materials',0.0,23.83,'','12627','9/11/18'],
['Hunterdon Mill','Materials',0.0,28.1,'Setup and Prepare for Test','12709','9/11/18'],
['Dat','General',0.0,320.0,'','12812','9/24/18'],
['Hunterdon Mill','Materials',0.0,31.99,'','12937','3/18/19'],
['Dat 11/11/18','General',0.0,320.0,'','12680','11/19/18'],
['Home Depot','General',0.0,8.49,'Purchase the materials and modify the tank. Remainder of partial billing.','12625','6/25/18'],
['Dat','General',0.0,400.0,'','12674','8/20/18'],
['Dat','General',0.0,300.0,'','12838','1/2/19'],
['Dat 11/03/18','General',0.0,320.0,'','12680','11/6/18'],
['Hunterdon Mill','General',0.0,74.9,'Receive, weigh and fixture for test','12472','8/24/16'],
['Dat','General',0.0,240.0,'','12747','2/11/19'],
['UPS- data to customer','General',0.0,11.51,'','13277','6/29/23'],
['Drobach compressor rental and fuel','General',3470.0,2231.6,'A/E charges for costs incurred due to postponing testing','12946','3/15/19'],
['Blackman','Materials',0.0,11.77,'Humidity Testing','12372','8/24/16'],
['Travel exp','Travel',1000.0,0.0,'Subcontract Test Subcontract Dust Test, See 3.7.2 in Procedure','12868','10/9/18'],
['Russ Amex- Pennsylvania Steel','Materials',0.0,152.64,'Fabricate test fixture','12470','9/1/16'],
['Russ Amex- Pennsylvania Steel','Materials',0.0,212.45,'Fabricate test fixture','12470','9/1/16'],
['Dat Vu','General',0.0,320.0,'','12674','8/14/18'],
['R&L Shipping','General',0.0,361.16,'Tear down and prepare to ship. Return shipping responsibility of NU Labs. XPO Logistics quote','12891','12/6/18'],
['McMaster Carr','Materials',100.0,70.58,'Provide a circulating system to perform the pre/post test inspections and perform the additional performance checks.','12494','9/12/16'],
['UPS','General',0.0,16.79,'EMI Power Quality Report .2','12449','9/1/16'],
['Pasternack','Materials',0.0,1251.14,'','12841','10/12/18'],
['McMaster Carr','Materials',0.0,138.64,'','12797','7/26/18'],
['UPS Freight','General',0.0,1536.64,'','12525','9/26/18'],
['Miscellaneous hardware','Materials',51.27,0.0,'Setup and Prepare for Test','12841','8/6/18'],
['1" Load plate','Materials',960.0,0.0,'','12840','8/1/18'],
['Tektronix','General',3450.0,0.0,'Subcontract Test Subcontract Dust Test, See 3.7.2 in Procedure','12868','10/9/18'],
['Dat','General',0.0,480.0,'','12674','8/27/18'],
['McMaster Carr','Materials',0.0,12.46,'Setup and Prepare for Test','12841','9/26/18'],
['UPS','General',0.0,88.31,'Misc. Testing 1.4 Rental of power source','12780','7/31/18'],
['NTS','General',8225.0,0.0,'Subcontract Test Set up and perform the referenced EMI tests at NTS Tinton Falls, NJ','12883','11/9/18'],
['Dat','General',0.0,105.0,'','12838','2/4/19'],
['Ragen Purchase- Hottinger Baldwin Measurements','Materials',0.0,128.05,'','12895','1/15/19'],
['Travers','Materials',0.0,147.99,'Receive, weigh and fixture for test','12566','3/23/17'],
['McMaster Carr','General',0.0,143.0,'Receive, weigh and fixture for test','12566','3/28/17'],
['Materials','Materials',100.0,0.0,'Receive, weigh and fixture for test','12494','9/12/16'],
['Home Depot','Materials',0.0,27.81,'','12489','9/9/16'],
['Metals USA','Materials',0.0,793.69,'','13277','4/22/22'],
['Ken Patton ($5K) cancelled','General',0.0,0.0,'Provide FEA for the cabinet. SEE NOTE','12905','12/21/18'],
['Drobach','General',2875.0,0.0,'Noise Susceptibility','12493','9/8/16'],
['Dat','General',0.0,240.0,'','12838','1/8/19'],
['2 Flanges @ $275 each','Materials',550.0,0.0,'','13545','6/3/24'],
['Dat','General',0.0,135.0,'','12747','2/4/19'],
['Compressor rental','General',0.0,2266.0,'Noise Susceptibility','12915','2/4/19'],
['Miscellaneous','Materials',200.0,0.0,'Setup cabling and drill cabinets','12489','9/7/16'],
['Materials','Materials',3450.0,0.0,'Setup and Prepare for Test Bulkhead Assembly.','12941','5/9/19'],
['Metals USA','Materials',1250.0,0.0,'Setup and Prepare for Test','13000','7/10/19'],
['Steel Plate for Extended Fig 15, 52" x 85" x .5"','Materials',1475.0,0.0,'Setup and Prepare for Test','12992','7/1/19'],
['Cole-Parmer','General',0.0,414.26,'Misc. Testing Durometer, Class A','12951','4/25/19'],
['Mechanical Precision','General',0.0,300.0,'Fabricate test fixture','12470','9/8/16'],
['Mechanical Precision','General',0.0,1980.0,'Fabricate test fixture','12470','9/8/16'],
['Misc','Materials',100.0,0.0,'','12808','5/3/19'],
['McMaster Carr','Materials',0.0,190.1,'Fixture Fabrication Fabricate a Test Fixture','12895','1/10/19'],
['Dat','General',0.0,320.0,'','12838','1/2/19'],
['Home Depot','Materials',0.0,66.03,'','12879','12/12/18'],
['UPS','General',0.0,61.05,'Subcontract Test','12911','5/8/19'],
['Fastenal','Materials',0.0,123.06,'','12895','1/30/19'],
['XPO Logistics quoted 491830514407 dated 08/06/18','General',669.8,0.0,'Tear down and prepare to ship. Return shipping responsibility of NU Labs. XPO Logistics quote','12891','11/21/18'],
['PCB Piezotronics','General',0.0,682.32,'Instrumentation Provide three additional Triaxial accelerometers','12901','2/4/19'],
['Lowe\'s','Materials',0.0,16.15,'','13366','9/16/22'],
['Drobach','General',795.0,0.0,'','12918','1/18/19'],
['Misc pipe fittings','Materials',235.0,0.0,'','12918','1/18/19'],
['McMaster Carr','Materials',0.0,15.16,'Receive, weigh and fixture for test','12549','3/17/17'],
['Compressor and fuel','General',2500.0,0.0,'Setup for Noise test','13360','3/21/22'],
['Drobach','General',4550.0,2184.0,'Noise Susceptibility','12580','3/28/17'],
['Mechanical Precision','General',0.0,450.0,'Receive, weigh and fixture for test','12465','9/16/16'],
['Dat','General',0.0,340.0,'','12838','1/2/19'],
['Dat','General',0.0,400.0,'','12838','1/2/19'],
['McMaster Carr','Materials',0.0,50.94,'','12895','1/21/19'],
['Dat','General',0.0,240.0,'','12838','1/21/19'],
['Dat 10/27/18','General',0.0,200.0,'','12680','10/29/18'],
['FedEx','General',0.0,6.24,'Tear down and prepare to ship','12358','9/16/16'],
['Sand Bags','General',500.0,0.0,'','13190','11/4/20'],
['Home Depot','Materials',0.0,-2.88,'Setup cabling and drill cabinets','12489','9/16/16'],
['Metals USA','Materials',795.0,0.0,'Setup and Prepare for Test','12877','1/11/19'],
['Dat','General',0.0,240.0,'','12838','2/4/19'],
['McMaster Carr','Materials',0.0,73.82,'Setup and Prepare for Test Includes fabricating dummy loads.','12984','6/28/19'],
['Joseph Finkle','Materials',0.0,39.04,'Fixture Fabrication','12775','5/9/19'],
['Travel','Travel',0.0,22.0,'Deliver extra bookends to Warren Controls.','13420','6/29/23'],
['Fuel','General',1000.0,0.0,'Noise testing','13182','10/2/20'],
['Travel exp','Travel',0.0,88.0,'Airborne/Structureborne Noise Test Airborne and Structureborne Noise tests at Hydro-Mechanical.','12996','7/1/19'],
['skylands','General',0.0,566.37,'','12895','4/26/19'],
['skylands','General',0.0,550.83,'','12895','4/26/19'],
['McMaster Carr','Materials',0.0,38.67,'Lightweight Shock Testing Perform the preliminary Low Impact Shock proof on the OM Cab. Best Effort','12890','3/28/19'],
['Fox Lumber','Materials',0.0,353.77,'A/E Build a crate to ship the unit in.','12848','3/29/19'],
['Mechanical Precision','General',500.0,0.0,'Set up and perform the pressure pulsation test','12496','9/20/16'],
['Joseph Finkle & Son','Materials',0.0,376.2,'','12848','10/25/18'],
['Mike Gibson- Travel to Finkles','Travel',0.0,8.0,'Fabrication/Fixture Modification','12849','10/29/18'],
['McMaster Carr','Materials',0.0,13.74,'Setup and Prepare for Test Setup for shock','12775','7/11/19'],
['McMaster Carr','Materials',0.0,58.96,'','12969','10/6/20'],
['Dat 10/20/18','General',0.0,420.0,'','12680','10/23/18'],
['Metals USA','Materials',0.0,545.0,'','12775','3/29/19'],
['Dat','General',0.0,240.0,'','12838','1/29/19'],
['UPS','General',0.0,19.72,'','12906','4/25/19'],
['Mouser','General',0.0,296.16,'','12958','5/30/19'],
['Home Depot','Materials',0.0,138.9,'Setup cabling and drill cabinets','12489','9/16/16'],
['Mechanical Precision','Materials',1500.0,0.0,'Fabricate the parts and complete the installation.','12405','9/16/16'],
['Compressor Rental','General',4000.0,4300.0,'','12895','11/29/18'],
['Fuel for compressor','General',1000.0,1479.91,'','12895','11/29/18'],
['DROBACK','General',3470.0,1266.0,'Noise Susceptibility','12946','4/30/19'],
['www.gohz.com','General',1580.0,0.0,'Setup and Prepare for Test','13000','7/10/19'],
['Ragen purchase','Materials',0.0,331.7,'','12895','1/2/19'],
['Walmart- Scott','Materials',0.0,24.46,'','12890','10/19/20'],
['Home Depot','General',0.0,11.0,'','12895','1/28/19'],
['Travel to Finkles','Travel',0.0,9.0,'','12775','5/9/19'],
['Todd Marine Electrical','General',0.0,51.81,'','13112','9/24/20'],
['Home Depot','Materials',0.0,47.98,'','13376','11/27/24'],
['McMaster Carr','Materials',0.0,19.76,'Setup and Prepare for Test Setup Monitor/Keyboard for MWS testing.','12969','10/13/20'],
['NTS','General',3690.0,3690.0,'Subcontract Test','12911','1/4/19'],
['Mechanical Precision','Materials',0.0,120.0,'','12982','6/12/19'],
['Drobach','General',0.0,1266.0,'Noise Susceptibility','12997','7/22/19'],
['Technology Dynamics','General',5000.0,5000.0,'Rental of power source required for the power quality test','12832','7/29/19'],
['Wilson Products','Materials',0.0,607.34,'','12954','7/10/19'],
['Skylands','General',0.0,362.71,'','12895','4/26/19'],
['Zoro','General',0.0,78.24,'','12680','4/25/19'],
['Fastenal','Materials',306.96,0.0,'','12975','5/14/19'],
['Home Depot','General',0.0,6.91,'','12832','7/29/19'],
['Drobach','General',0.0,0.0,'Misc. Testing Drop test, $10,910, cancelled per customer request.','12500','9/29/16'],
['McMaster Carr','Materials',0.0,10.45,'Receive, weigh and fixture for test','12484','9/30/16'],
['McMaster Carr','General',0.0,20.47,'','12969','10/14/20'],
['McMaster Carr','Materials',0.0,88.19,'A/E (1) Anti-Seize Compound.','12635','6/24/19'],
['Pool, light fixtures, controller','General',450.0,0.0,'','12485','5/9/19'],
['Metals USA','Materials',200.0,0.0,'','12987','6/25/19'],
['3 containers of salt','Materials',525.0,0.0,'','12485','5/9/19'],
['McMaster Carr','General',0.0,17.3,'','13173','11/13/20'],
['Insulating panels, metal tape, marine plywood sheets PVC 90 degree elbows','General',1200.0,0.0,'','12485','5/9/19'],
['Materials','Materials',4450.0,0.0,'Setup and Prepare for Test Deck Assembly.','12941','5/9/19'],
['McMaster Carr','Materials',200.0,0.0,'Receive, weigh and fixture for test Shock test','12395','9/29/16'],
['McMaster Carr','Materials',0.0,16.95,'','12969','10/7/20'],
['Drobach','General',0.0,0.0,'Misc. Testing Drop test, $10,910, cancelled per customer request.','12500','9/29/16'],
['McMaster Carr','Materials',0.0,109.03,'','13218','5/10/23'],
['Mileage- Ragen/Scott','Travel',0.0,50.0,'','13462','6/8/23'],
['GoHz','General',0.0,1638.36,'Misc. Testing Weekly power source rental. Not required per Scott','13000','7/15/19'],
['UPS','General',0.0,28.0,'','12958','5/23/19'],
['UPS','General',0.0,13.58,'Subcontract Test','12911','5/23/19'],
['McMaster Carr','General',0.0,77.0,'Miscellaneous Repair','N235 Lab Maintenance 2016','9/29/16'],
['Fox Lumber','Materials',0.0,29.31,'','12958','5/22/19'],
['Mike Gibson','Travel',0.0,3.0,'','12958','5/22/19'],
['McMaster Carr','Materials',0.0,45.49,'Receive, weigh and fixture for test','12484','9/29/16'],
['Fischer Custom Communications','General',0.0,5500.0,'','13040','10/19/20'],
['Wilson Products','Materials',0.0,278.51,'','13179','11/25/20'],
['McMaster Carr','Materials',0.0,40.01,'','13182','10/13/20'],
['Fastenal','Materials',0.0,30.64,'','13156','11/11/20'],
['Travel to Alltest Instrument to pick up rental unit- Mike McCormack','Travel',0.0,74.0,'','13569','9/24/24'],
['Home Depot','Materials',0.0,46.83,'EMI Workbench','N235 Lab Maintenance 2016','10/20/16'],
['UPS','General',0.0,16.67,'','12449','10/20/16'],
['Bookend material and flanges. Includes shipping','Materials',3150.0,0.0,'Setup MW Shock','13457','4/20/23'],
['Miscellaneous Materials','Materials',1500.0,0.0,'','13462','5/25/23'],
['Home Depot','Materials',0.0,11.48,'','13366','9/19/22'],
['Drobach','General',0.0,220.0,'','13174','10/19/20'],
['Hunterdon Mill','Materials',0.0,21.27,'','13120','12/22/20'],
['IPM','General',0.0,140.0,'Set up and perform the pressure pulsation test','12496','10/26/16'],
['Skylands','General',0.0,573.04,'Noise Susceptibility','12479','10/26/16'],
['Mechanical Precision','General',0.0,675.0,'Fabricate the parts and complete the installation.','12405','10/26/16'],
['Mechanical Precision','General',0.0,825.0,'Fabricate the parts and complete the installation.','12405','10/26/16'],
['McMaster Carr','Materials',0.0,404.8,'Fabricate two 15 degree ramps for CDRL D026.219 and CDRL #D026.528','12467','10/26/16'],
['Metals USA','Materials',0.0,975.0,'Fabricate two 15 degree ramps for CDRL D026.219 and CDRL #D026.528','12467','10/26/16'],
['Metals USA','Materials',200.0,330.47,'Receive, weigh and fixture for test','12519','10/27/16'],
['Home Depot','General',0.0,52.13,'Set up and perform the pressure pulsation test','12496','11/3/16'],
['Metals USA','Materials',155.0,0.0,'Receive, weigh and fixture for test','12520','10/31/16'],
['UPS','General',0.0,25.89,'Contingency Funds for out of scope work $1512- Charge for UPS shipping to Montreal Bronze','12591','6/8/17'],
['Wilson Products','General',300.0,0.0,'Shock evaluation.','12393','11/8/16'],
['McMaster Carr','General',0.0,108.7,'Receive, weigh and fixture for test Fabricate the test fixture- bill with eval testing per BF','12393','11/11/16'],
['Mcmaster Carr','General',0.0,67.02,'','N235 Lab Maintenance 2016','11/11/16'],
['Hunterdon Mill','Materials',0.0,32.57,'Receive, weigh and fixture for test Fabricate the test fixture- bill with eval testing per BF','12393','11/11/16'],
['Home Depot','Materials',0.0,14.0,'','12576','6/9/17'],
['Wilson Products','General',380.0,0.0,'Receive, weigh and fixture for test- shock','12529','11/28/16'],
['Mechanical Precision','Materials',0.0,680.0,'Receive, weigh and fixture for test Fabricate the test fixture- bill with eval testing per BF','12393','11/30/16'],
['Wilson Products','General',470.0,0.0,'Receive, weigh and fixture for test','12516','11/30/16'],
['Drobach','General',0.0,2184.0,'Noise Susceptibility **','12465','11/30/16'],
['McMaster Carr','Materials',0.0,47.58,'Receive, weigh and fixture for test','12525','12/1/16'],
['Metals USA','Materials',100.0,0.0,'Receive, weigh and fixture for test','12519','12/6/16'],
['Metals USA','Materials',0.0,765.0,'Receive, weigh and fixture for test  24"','12469','12/7/16'],
['Mcmaster Carr','Materials',0.0,105.16,'','13310','9/20/22'],
['McMaster Carr','Materials',0.0,433.69,'','13310','9/21/22'],
['Fastenal','Materials',0.0,309.05,'Receive, weigh and fixture for test  24"','12469','12/9/16'],
['Wilson Products','General',200.0,0.0,'Receive, weigh and fixture for shock test','12504','12/12/16'],
['McMaster Carr','Materials',0.0,13.98,'Receive, weigh and fixture for test','12541','1/18/17'],
['Wilson Products','Materials',0.0,30.24,'Receive, weigh and fixture for shock test','12504','12/19/16'],
['Misc','Materials',346.0,0.0,'Receive, weigh and fixture for test','12543','12/21/16'],
['Sand','Materials',100.0,0.0,'Receive, weigh and fixture for test Setup and add loads','12543','12/21/16'],
['Finkles','Materials',0.0,440.35,'Receive, weigh and fixture for test','12543','12/22/16'],
['Travel-Adam','Travel',0.0,18.0,'','12393','12/29/16'],
['Metals USA','Materials',460.0,0.0,'Receive, weigh and fixture for test','12545','1/4/17'],
['Metals USA','Materials',0.0,60.0,'Fixture Fabrication','N236  Lab Maintenance 2017','2/8/17'],
['McMaster Carr','General',0.0,65.15,'','13632','2/20/26'],
['Metals USA','Materials',750.0,0.0,'Receive, weigh and fixture for test','12549','1/10/17'],
['McMaster Carr','Materials',0.0,-64.95,'','N236  Lab Maintenance 2017','1/11/17'],
['McMaster Carr','Materials',0.0,54.66,'Receive, weigh and fixture for test','12545','1/11/17'],
['Pipe brazing and shipping','General',475.0,0.0,'','13565','8/27/24'],
['McMaster Carr','General',0.0,101.95,'','N236  Lab Maintenance 2017','1/5/17'],
['McMaster Carr','General',0.0,177.78,'','N236  Lab Maintenance 2017','1/5/17'],
['Wilson Products','General',200.0,0.0,'Vibration Testing','12516','1/5/17'],
['McMaster Carr','General',0.0,68.0,'Airborne/Structureborne Noise Test','12544','1/5/17'],
['Mcmaster Carr','Materials',140.0,0.0,'Receive, weigh and fixture for test','12554','1/11/17'],
['Travel- TM 01/10/17','Travel',0.0,85.05,'Airborne/Structureborne Noise Test','12544','1/13/17'],
['McMaster Carr','Materials',300.0,0.0,'Receive, weigh and fixture for test','12555','1/17/17'],
['Wilson Products','Materials',600.0,563.45,'Receive, weigh and fixture for test','12555','1/17/17'],
['Hunterdon Mill','Materials',0.0,35.54,'Receive, weigh and fixture for test Setup and add loads','12543','1/18/17'],
['Metals USA','Materials',195.0,0.0,'Receive, weigh and fixture for test','12558','1/23/17'],
['Ace Industries','General',0.0,154.09,'','N236  Lab Maintenance 2017','1/26/17'],
['Ace','Materials',0.0,20.89,'','N236  Lab Maintenance 2017','1/26/17'],
['All Air','General',0.0,3484.84,'Purchase isolators. SEE NOTE','12543','1/26/17'],
['USA Tool Warehouse','Materials',0.0,120.37,'','N236  Lab Maintenance 2017','1/26/17'],
['Tinsman Bros','General',0.0,28.51,'Receive, weigh and fixture for test','12501','1/25/17'],
['Metals USA','Materials',735.0,0.0,'Receive, weigh and fixture for test','12558','1/23/17'],
['All Air','General',0.0,164.58,'Purchase isolators. SEE NOTE','12543','1/26/17'],
['Metals USA','Materials',200.0,331.5,'Receive, weigh and fixture for test','12558','1/23/17'],
['Transient Specialists','General',0.0,1950.0,'EMI Testing','12468','7/27/17'],
['Mechanical Precision','Materials',4640.0,2880.0,'','13315','5/26/22'],
['Mechanical Precision','Materials',0.0,1680.0,'','13315','9/22/22'],
['Technology Dynamics','General',0.0,5000.0,'Rental power source','12423','2/2/17'],
['Home Depot','General',0.0,116.9,'Build a crate to ship the unit in.','12508','2/2/17'],
['Mcmaster Carr','General',0.0,9.44,'Receive, weigh and fixture for test','12558','2/3/17'],
['Wilson Products','General',0.0,323.07,'Vibration Testing','12516','2/3/17'],
['Metals USA','Materials',0.0,663.0,'Fixture Fabrication','N236  Lab Maintenance 2017','2/8/17'],
['Mcmaster Carr','General',0.0,177.66,'Constant Pressure Pump','N236  Lab Maintenance 2017','2/8/17'],
['McMaster Carr','General',0.0,14.76,'Tooling (bits, blades, etc.)','N236  Lab Maintenance 2017','2/8/17'],
['Mcmaster Carr','General',0.0,118.04,'Lab supplies','N236  Lab Maintenance 2017','2/8/17'],
['Tom Woodruff spreadsheet','Materials',835.0,0.0,'Receive, weigh and fixture for test','12566','2/15/17'],
['Steel Plate for bookends','Materials',1500.0,0.0,'Setup for MW Shock','13421','11/7/22'],
['Metals USA','Materials',500.0,0.0,'Provide the loads referenced in the test procedure.','12566','2/15/17'],
['McMaster Carr','Materials',0.0,45.41,'Receive, weigh and fixture for test','12566','2/24/17'],
['Metals USA','Materials',590.0,0.0,'Perform the evaluation','12569','2/22/17'],
['Metals USA','Materials',1176.0,0.0,'Receive, weigh and fixture for test- sub base','12569','2/22/17'],
['W/O Supply','Materials',0.0,298.52,'Receive, weigh and fixture for test','12550','2/23/17'],
['Metals USA','Materials',1176.0,0.0,'Receive, weigh and fixture for test','12569','2/22/17'],
['Mechanical Precision','Materials',0.0,716.0,'','N2020- Lab Maintenance 2020','12/14/20'],
['Mechanical Precision','Materials',0.0,150.0,'','N2020- Lab Maintenance 2020','12/14/20'],
['Mechanical Precision','Materials',0.0,240.0,'','N2020- Lab Maintenance 2020','12/14/20'],
['Hunterdon Mill','Materials',0.0,24.52,'','13183','12/4/20'],
['Louis Canuso','Materials',0.0,125.0,'','12686','11/16/20'],
['Lehigh Fluid Power','General',0.0,260.0,'','12686','11/16/20'],
['Lehigh Fluid Power','General',0.0,375.0,'','12686','11/16/20'],
['Lehigh Fluid Power','General',0.0,660.0,'','12686','11/16/20'],
['Mechanical Precision','Materials',0.0,3900.0,'','13036','11/17/20'],
['Drobach','General',3300.0,619.0,'Noise Test','13188','10/29/20'],
['Hunterdon Mill','Materials',0.0,22.5,'','13193','12/7/20'],
['Technology Dynamics','General',0.0,2500.0,'','13172','12/10/20'],
['Steel plate for bookends','Materials',1000.0,1428.0,'','13418','11/7/22'],
['McMaster Carr','Materials',0.0,97.25,'','13203','12/15/20'],
['Metals USA','Materials',150.0,0.0,'Setup and Prepare for Test','12949','3/25/19'],
['Metals USA','Materials',1000.0,0.0,'','13214','1/14/21'],
['','Materials',650.0,0.0,'','13214','1/14/21'],
['','Materials',1500.0,0.0,'','13214','1/14/21'],
['','General',250.0,0.0,'','13214','1/14/21'],
['Metals USA','Materials',1400.0,0.0,'','13214','1/14/21'],
['McMaster Carr','Materials',0.0,16.25,'','12913','1/13/21'],
['McMaster Carr','Materials',0.0,12.77,'','12913','1/13/21'],
['McMaster Carr','Materials',0.0,10.93,'','12913','1/13/21'],
['McMaster Carr','Materials',0.0,45.43,'','12913','1/13/21'],
['McMaster Carr','Materials',0.0,113.09,'','12913','1/13/21'],
['McMaster Carr','Materials',0.0,80.69,'','12913','1/13/21'],
['Home Depot','Materials',0.0,67.85,'Prepare the operator for shipment to the manufacturer','13112','1/18/21'],
['Metals USA','Materials',1650.0,0.0,'Setup for Vibration','13215','1/18/21'],
['McMaster Carr','Materials',0.0,29.63,'Setup for Noise test','13201','1/20/21'],
['Home Depot','Materials',0.0,73.89,'EMI Testing','13175','9/15/21'],
['Piping Supplies','Materials',0.0,398.0,'','13474','8/11/23'],
['Wilson Products','Materials',1000.0,0.0,'Setup for MW Shock','13413','10/19/22'],
['UPS','General',0.0,25.44,'','13364','10/27/22'],
['Piping Supplies','Materials',0.0,1906.0,'Setup and prepare for test. Price includes fabrication and steel navy mating flanges','13214','3/2/22'],
['Walmart','General',0.0,21.55,'','13350','3/4/22'],
['McMaster Carr','Materials',0.0,60.07,'MW Shock test','13465','7/10/23'],
['Springfield Metal Products','Materials',0.0,784.76,'','13180','6/4/24'],
['Radiant Global shipping','General',0.0,240.0,'','13214','3/10/22'],
['24"x24"x5" steel plate (bookend material)','Materials',300.0,0.0,'Setup for Vibe','13358','3/10/22'],
['2 150# flat faced flanges @ $75 per','Materials',150.0,0.0,'Setup for Vibe','13358','3/10/22'],
['Travel Exp- Mark Ruoff','Travel',0.0,83.6,'Perform AB and SB Noise tests at Hydro-Mechanical facility','13388','7/28/22'],
['Doug Gromek- Travel exp','Travel',0.0,75.9,'Airborne and Structureborne Noise test at Hydro-Mechanical','13352','3/24/22'],
['Home Depot','Materials',0.0,146.36,'','13175','3/31/22'],
['Frame building materials, delivered','Materials',750.0,0.0,'Setup for MW Shock Test','13361','3/23/22'],
['Steel plate for bookends','Materials',2000.0,3426.51,'Setup for MW Shock','13420','11/7/22'],
['Wilson Products','General',580.0,0.0,'','13518','2/15/24'],
['Advanced Test Equipment','General',0.0,2249.0,'','13175','5/5/22'],
['Metals USA','Materials',3400.0,0.0,'','13363','3/31/22'],
['Freight for steel','Materials',200.0,0.0,'','13509','11/30/23'],
['UPS','General',0.0,19.74,'','13359','4/7/22'],
['UPS','General',0.0,16.3,'','13112','4/7/22'],
['Wilson products','Materials',0.0,86.0,'','12932','5/4/22'],
['Chesapeake Bay Rubber Co.','Materials',0.0,84.8,'','13113','4/12/22'],
['Chesapeake Bay Rubber Co.','Materials',0.0,84.8,'','13112','4/12/22'],
['Drobach','General',4950.0,0.0,'Perform Noise test- both units','13498','10/10/23'],
['McMaster Carr','General',0.0,71.81,'','13332','4/4/22'],
['Drobach','General',0.0,3336.0,'','13680','2/17/26'],
['Metals Depot','Materials',387.1,0.0,'Setup for LW Shock. Includes bookends or pipe clamps','13483','8/14/23'],
['Travel to Boonton Electronics','Travel',0.0,34.5,'','13293','8/14/23'],
['Bookend Steel','Materials',550.0,0.0,'','13509','11/30/23'],
['McMaster Carr','Materials',0.0,55.46,'','13394','11/8/23'],
['Bookend Material delivered','Materials',1225.0,0.0,'Setup for MW Shock Test','13309','10/6/21'],
['(2) 8" 300# ansi flanges @ $550 each','Materials',1100.0,0.0,'Setup for MW Shock Test','13309','10/6/21'],
['Shipping charges','General',500.0,0.0,'Setup for MW Shock Test','13309','10/6/21'],
['(2) 700# mating flanges','Materials',796.0,0.0,'','13509','11/30/23'],
['Alltest Instruments','General',0.0,500.0,'','13293','7/20/23'],
['AMAZON POWER SUPPLIES','Materials',200.0,0.0,'Additional charges to include monitoring and recording the output from 9 transducers and 1 switch, per customer\'s request.','13403','10/5/23'],
['Bookend material, delivered','Materials',1225.0,0.0,'Setup for MW Shock Test','13310','10/6/21'],
['(2) 12" 300# ansi flanges @ $890 each','Materials',1780.0,1280.76,'Setup for MW Shock Test','13310','10/6/21'],
['Shipping on materials','General',1000.0,0.0,'Setup for MW Shock Test','13310','10/6/21'],
['Travel Exp- Mark Ruoff','Travel',0.0,83.6,'','13388','8/3/22'],
['Bookend material','Materials',650.0,0.0,'Setup for MW Shock test. Price includes bookend fabrication.','13484','8/18/23'],
['MIL-F-20042 flanges','Materials',900.0,0.0,'Setup for MW Shock test. Price includes bookend fabrication.','13484','8/18/23'],
['McMaster Carr','Materials',0.0,78.33,'','13488','9/21/23'],
['McMaster Carr','Materials',0.0,80.68,'','13403','9/21/23'],
['FedEx','General',0.0,1602.6,'','13293','7/31/23'],
['Marvic Supply Company','Materials',0.0,338.96,'','13175','9/10/21'],
['Jordan\'s CC Amazon','Materials',0.0,79.96,'','13403','10/11/23'],
['McMaster Carr','Materials',0.0,33.1,'','13477','9/8/23'],
['Home Depot','General',0.0,7.08,'','13332','8/22/22'],
['Drobach','Materials',3300.0,4464.0,'Acoustic Noise test','13280','7/7/21'],
['UPS- Shipping- Piping Supplies','General',0.0,60.8,'','13474','8/3/23'],
['Flanges and estimated shipping','Materials',600.0,0.0,'','13482','8/3/23'],
['UPS shipping','General',0.0,11.59,'','13277','8/17/23'],
['Pipe brazing and shipping','Materials',475.0,0.0,'','13643','3/25/25'],
['Drobach','General',2500.0,0.0,'Noise Test','13506','11/1/23'],
['Travel to PA Steel to pick up order','Travel',0.0,37.85,'Build a manifold to supply all units with 2190 Oil.','13403','9/25/23'],
['McMaster Carr','Materials',0.0,20.86,'','13535','7/23/24'],
['PA Steel','Materials',0.0,-30.58,'','13403','9/26/23'],
['PA Steel Co.','Materials',0.0,540.28,'Build a manifold to supply all units with 2190 Oil.','13403','9/25/23'],
['The Hose Shop','Materials',0.0,424.03,'','13488','9/29/23'],
['Wilson Products','Materials',1000.0,0.0,'','13494','9/27/23'],
['Wilson Products','Materials',0.0,308.84,'','13488','9/29/23'],
['McMaster Carr','Materials',0.0,155.36,'','13488','9/29/23'],
['Wilson Products','Materials',750.0,0.0,'','13495','9/27/23'],
['Mechanical Precision','Materials',0.0,2275.0,'','13403','9/26/23'],
['McMaster carr','Materials',0.0,36.27,'','13628','3/14/25'],
['Element subcontract testing- RS103, TP and TR.','General',10775.0,0.0,'','13499','11/17/23'],
['2 x McMaster Quote','Materials',300.0,0.0,'','13570','8/29/24'],
['McMaster Carr- Credit','Materials',0.0,-73.76,'','13403','10/13/23'],
['McMaster Carr','Materials',0.0,17.92,'','13486','3/5/24'],
['McMaster Carr','Materials',0.0,126.83,'','13545','7/16/24'],
['Flight, Hotel ( 2 nights), rental car (3 days), travel fee','Travel',1475.0,0.0,'Travel to and from the FEC facility in OH','13501','10/16/23'],
['PA Steel','Materials',0.0,307.56,'','13180','2/21/24'],
['McMaster Carr','Materials',0.0,318.5,'','13467','10/17/23'],
['Jordan\'s credit card','General',0.0,191.85,'','13403','11/13/23'],
['FedEx','General',0.0,3.48,'','13483','11/2/23'],
['Wilson Products','General',1250.0,0.0,'','13517','1/8/24'],
['Steel','Materials',4000.0,1346.08,'Fabricate the test fixtures and purchase additional required items.','13180','1/16/24'],
['McMaster Carr','Materials',0.0,312.76,'','13180','5/8/24'],
['McMaster Carr','Materials',0.0,71.39,'','13467','11/13/23'],
['Miscellaneous additional budget','Materials',500.0,0.0,'Power Quality test- Primary power input only','13277','9/3/24'],
['','Materials',1200.0,0.0,'','13622','2/12/25'],
['Radiant Global Logistics','General',0.0,670.3,'Amplifier Rental- 3 month max','13531','11/7/24'],
['Aluminum material, delivered    Cancelled','Materials',0.0,0.0,'Fabricate (1) aluminum mounting frame. See notes','13249','12/21/23'],
['Mechanical Precision     Cancelled','General',0.0,0.0,'Fabricate (1) aluminum mounting frame. See notes','13249','12/21/23'],
['If they want to keep fixtures','General',2500.0,0.0,'Fabricate (1) aluminum mounting frame. See notes','13249','12/21/23'],
['McMaster Carr','Materials',0.0,100.41,'','13180','3/8/24'],
['2 amplifier rental, 3 months max','General',40000.0,0.0,'Amplifier Rental- 3 month max','13531','5/15/24'],
['Shipping and insurance on rentals','General',3800.0,0.0,'','13531','5/15/24'],
['Power Source rental 3 months max','General',31500.0,0.0,'Power Source rental 3 months max','13531','5/15/24'],
['Crystal Instruments','General',3500.0,0.0,'','13531','5/15/24'],
['McMaster Carr','General',0.0,100.36,'','13545','6/25/24'],
['McMaster Carr','Materials',0.0,67.5,'','13277','8/29/24'],
['JCP&L electricity usage','General',0.0,4000.0,'','13277','5/21/24'],
['McMaster Carr','Materials',0.0,132.11,'','13180','5/21/24'],
['Lowes','Materials',200.0,0.0,'','13570','8/29/24'],
['Hunterdon Mill','Materials',0.0,37.36,'','13547','10/15/24'],
['McMaster Carr','Materials',0.0,78.35,'','13675','9/3/25'],
['TRS RenTelco','General',0.0,451.5,'','13499','12/10/24'],
['Trenton Sheet Metal','Materials',0.0,295.0,'','13180','3/12/24'],
['Radiant','General',0.0,649.5,'','13485','6/3/24'],
['McMaster Carr','Materials',0.0,52.14,'','13521','9/16/24'],
['Wilson Products','Materials',0.0,352.46,'','13180','6/11/24'],
['Gaskets and shipping','Materials',95.0,0.0,'Gaskets purchased for the 611 mm test.','13180','5/30/24'],
['Materials','Materials',1200.0,0.0,'','13516','12/20/23'],
['Freight for steel','General',500.0,0.0,'','13516','12/20/23'],
['McMaster Carr','Materials',0.0,77.8,'','13180','6/5/24'],
['UPS','General',0.0,21.21,'','13387','12/18/23'],
['Advanced Test Equipment','General',0.0,2069.0,'','13293','7/24/23'],
['Hytorc','Materials',1500.0,681.87,'','13180','6/6/24'],
['CHESAPEAKE BAY RUBBER','Materials',0.0,85.13,'','13180','6/11/24'],
['E-Bay Purchase','General',0.0,2263.76,'','13180','6/11/24'],
['Metal Depot','Materials',0.0,130.94,'','13456','6/11/24'],
['Gordon Electric Supply','Materials',0.0,147.96,'','13531','6/11/24'],
['McMaster Carr','Materials',0.0,211.41,'','13552','9/18/24'],
['Piping Supplies','Materials',0.0,919.85,'','13176','11/18/25'],
['Travel to Trenton Sheet Metal- Mark Ruoff','Travel',0.0,32.0,'','13180','2/8/24'],
['UPS','General',0.0,20.53,'','13180','6/10/24'],
['Home Depot','Materials',0.0,40.24,'','13531','6/14/24'],
['Jordan\'s CC','Materials',0.0,1772.11,'','13531','9/10/24'],
['Jordan\'s CC','Materials',0.0,43.24,'','13531','9/10/24'],
['Amazon- Antrader 10 pcs RG58 6\'','Materials',0.0,122.55,'','13687','11/12/25'],
['Metals USA','Materials',0.0,244.04,'','13531','9/16/24'],
['Metals USA','Materials',0.0,1960.3,'','13531','9/16/24'],
['UPS','General',0.0,39.93,'','13377','12/27/23'],
['UPS','General',0.0,21.84,'','13387','12/27/23'],
['Drobach','General',3500.0,0.0,'Perform Acoustic Noise test- Units tested together','13572','9/10/24'],
['Shipping- bookend material and flanges. Mike McCormack picked up.','General',250.0,95.0,'','13545','6/3/24'],
['IPM','General',0.0,195.0,'','13376','6/18/24'],
['Mechanical Precision','Materials',0.0,3520.0,'','13277','8/27/24'],
['McMaster Carr','Materials',0.0,25.21,'','13456','6/18/24'],
['McMaster Carr','Materials',0.0,44.19,'','13456','6/18/24'],
['PA Steel','Materials',0.0,508.0,'','13545','6/18/24'],
['Alltest','Travel',0.0,74.0,'','13574','11/22/24'],
['Compressor','General',2000.0,0.0,'','13549','6/17/24'],
['PA Steel','Materials',0.0,4015.13,'','13180','2/9/24'],
['Miscellaneous supplies','Materials',8000.0,0.0,'','13582','10/22/24'],
['Piping Supplies-Bookend Material','Materials',1700.0,1008.0,'','13545','6/3/24'],
['Element','General',0.0,1000.0,'','13499','1/10/24'],
['Miscellaneous','Materials',500.0,0.0,'','13704','11/19/25'],
['McMaster Carr','Materials',0.0,86.9,'','13588','12/4/24'],
['Wilson Products','Materials',1250.0,89.0,'','13493','9/27/23'],
['McMaster Carr','Materials',0.0,123.64,'','13180','1/18/24'],
['Travel- Hunterdon Mill','Travel',0.0,5.5,'','13508','2/27/24'],
['Travel- Trenton Sheet Metal','Travel',0.0,32.0,'','13180','2/27/24'],
['Hunterdon Mill','Materials',0.0,15.4,'','13508','2/27/24'],
['Lowes','Materials',0.0,44.14,'','13531','7/29/24'],
['McMaster Carr','Materials',0.0,170.86,'','13545','7/9/24'],
['Job Lot','General',0.0,23.01,'','13277','7/22/24'],
['Wharton','General',3500.0,0.0,'Perform Noise test','13573','9/12/24'],
['McMaster Carr','Materials',0.0,64.31,'Repairs per customer instruction','13076','10/3/24'],
['Hytorc','General',0.0,681.87,'','13180','7/10/24'],
['Radiant Logistics','General',0.0,2156.34,'','13531','10/7/24'],
['Digikey','General',0.0,319.01,'','13636','4/11/25'],
['Mechanical Precision','Materials',0.0,425.0,'','13538','10/8/24'],
['Mechanical Precision','Materials',0.0,1280.0,'','13573','10/8/24'],
['Lowes','Materials',0.0,383.84,'','13376','11/27/24'],
['Drobach','General',0.0,1968.0,'','13587','11/21/24'],
['TRS Rentelco','General',0.0,2709.0,'','13531','12/3/24'],
['Radiant Global Logistics','General',0.0,665.3,'','13531','12/3/24'],
['Wilson Products','General',250.0,0.0,'','13589','11/27/24'],
['Walmart','Materials',0.0,16.55,'','13277','7/24/24'],
['Wilson Products','General',350.0,0.0,'','13591','11/27/24'],
['Drobach','General',2000.0,0.0,'','13555','7/29/24'],
['Alltest','General',0.0,225.0,'2 week power supply rental','13569','10/11/24'],
['Drobach','General',2500.0,1001.6,'','13546','6/5/24'],
['Drobach','General',1526.0,998.0,'','13541','5/6/24'],
['Active A/C','General',0.0,106.63,'Dispose of UUT per customer request','13456','11/4/24'],
['Flanges','Materials',90.0,0.0,'','13560','8/7/24'],
['McMaster Carr','Materials',0.0,74.84,'','13557','8/1/24'],
['Bookend steel','Materials',700.0,0.0,'','13560','8/7/24'],
['Travel to Alltest- equipment rental','Travel',0.0,74.0,'','13574','10/30/24'],
['Travel to Alltest to drop off equipment','Travel',0.0,74.0,'','13569','10/23/24'],
['Drobach','General',0.0,4704.0,'','13564','10/29/24'],
['Wharton','General',0.0,1177.14,'','13564','11/14/24'],
['Rudy requested purchase','General',0.0,790.13,'','13531','11/14/24'],
['Rudy Requested purchase','General',0.0,325.8,'','13531','11/14/24'],
['McMaster Carr','Materials',0.0,188.54,'','13560','11/21/24'],
['Walmart','General',0.0,18.94,'','13587','11/25/24'],
['Lowes','Materials',0.0,23.23,'','13376','12/4/24'],
['McMaster Carr','Materials',0.0,77.42,'','13499','12/6/24'],
['Wilson Products','General',250.0,0.0,'','13597','12/17/24'],
['Wilson Products','General',0.0,27.0,'','13402','2/25/25'],
['Drobach','General',0.0,3108.0,'','13590','12/16/24'],
['Home Depot','Materials',0.0,23.2,'','13663','8/18/25'],
['Wilson Products','Materials',1000.0,661.39,'LW Shock test','13402','9/19/22'],
['TRS Rentelco','General',0.0,2709.0,'','13376','3/18/25'],
['Pa Steel','Materials',600.0,0.0,'','13639','3/17/25'],
['TRS Rentelco','General',0.0,1709.0,'','13542','12/27/24'],
['TRS Rentelco','General',0.0,1000.0,'','13542','12/27/24'],
['Bookend Material, delivered','Materials',750.0,0.0,'','13640','3/17/25'],
['Pa Steel','Materials',600.0,0.0,'','13641','3/17/25'],
['Home Depot','Materials',0.0,97.14,'','13397','3/21/25'],
['FedEx','General',0.0,14.2,'','13611','3/25/25'],
['TRS Rentelco','General',0.0,2709.0,'','13531','4/14/25'],
['Mcmaster Carr','General',0.0,73.24,'','13634','4/14/25'],
['McMaster Carr','Materials',0.0,53.58,'','13397','4/10/25'],
['12" flanges plus shipping','Materials',1200.0,0.0,'','13649','4/15/25'],
['Hunterdon Mill','Materials',0.0,5.76,'','13628','3/17/25'],
['Compressor rental','General',3000.0,0.0,'','13623','2/13/25'],
['Radiant','General',0.0,670.3,'','13376','2/14/25'],
['Purchase Spider','General',12000.0,0.0,'','13624','2/14/25'],
['Miscellaneous additional budget items','General',5000.0,0.0,'','13624','2/14/25'],
['PA Steel','Materials',2500.0,2398.71,'Fabricate the test fixture, stand off brackets and dummy masses','13625','2/14/25'],
['McMaster Carr','Materials',0.0,40.8,'','13625','2/20/25'],
['PA steel- misc steel','Materials',2500.0,0.0,'','13626','2/20/25'],
['Pipe brazing/supply pipes','Materials',600.0,0.0,'','13583','3/17/25'],
['Ragen\'s Amex','Materials',0.0,7894.49,'','13624','2/20/25'],
['Extreme Bolt and Fasteners','Materials',0.0,1597.44,'','13037','5/20/25'],
['Lowe\'s','Materials',0.0,49.61,'','13397','3/7/25'],
['Home Depot','Materials',0.0,12.99,'','13397','5/19/25'],
['Home Depot','Materials',0.0,42.37,'','13685','1/20/26'],
['TRS Rentelco','General',0.0,2709.0,'','13397','5/19/25'],
['Drobach','General',0.0,1968.0,'','13615','3/13/25'],
['Travel to Lowes- Mark Ruoff','Travel',0.0,8.5,'','13397','3/10/25'],
['Sway bracing material','Materials',1000.0,0.0,'','13687','9/26/25'],
['Crystal instruments quote','Materials',29000.0,0.0,'','13687','9/26/25'],
['Miscellaneous cable exp','Materials',1200.0,0.0,'','13687','9/26/25'],
['Extra Material cost','Materials',2000.0,0.0,'','13687','9/26/25'],
['Shipping','General',500.0,0.0,'','13687','9/26/25'],
['McMaster carr','General',0.0,30.78,'','13528','4/2/25'],
['Springfield Metal Products','Materials',0.0,178.06,'','13659','6/16/25'],
['TRS Rentelco','General',0.0,2709.0,'','13397','6/16/25'],
['Travel to Lowes','Travel',0.0,8.5,'','13399','3/31/25'],
['Travel- mark Ruoff','Travel',0.0,36.0,'','13625','3/31/25'],
['Travel- Mark Ruoff','Travel',0.0,37.0,'','13625','3/31/25'],
['Mcmaster Carr','Materials',0.0,223.59,'','13645','6/13/25'],
['G. Cotter Ent','Materials',0.0,678.0,'','13618','11/20/25'],
['Angle iron for 21.3" display frame','Materials',500.0,0.0,'','13701','11/10/25'],
['Harbor Freight','General',0.0,121.53,'','13037','4/16/25'],
['Tyrus travel','Travel',0.0,101.0,'Travel to and from Bogue facility, no more than 3 separate, consecutive business days','13636','7/30/25'],
['Home Depot','Materials',0.0,153.18,'','13673','8/15/25'],
['UPS','General',0.0,38.42,'','13037','4/21/25'],
['Keysight calibration','General',0.0,1081.0,'','13376','4/25/25'],
['Advanced test Equipment Calibration','General',0.0,589.0,'','13376','4/25/25'],
['IPM calibration','General',0.0,597.0,'','13376','4/25/25'],
['traCal','General',0.0,1145.25,'','13376','4/25/25'],
['Drobach','General',3500.0,3108.0,'','13629','2/28/25'],
['Wilson products','Materials',0.0,602.48,'','13336','1/23/26'],
['Steel Plate','Materials',1800.0,0.0,'Provide and modify a steel mounting plate','13268','5/7/25'],
['Wilson Products','Materials',0.0,89.0,'','13565','6/3/25'],
['Mcmaster Carr','Materials',0.0,123.51,'','13618','6/3/25'],
['Harbor Freight','Materials',0.0,18.0,'','13397','5/22/25'],
['Home Depot','Materials',0.0,9.96,'','13397','5/22/25'],
['Compressor and fuel','General',3500.0,0.0,'','13681','9/5/25'],
['Steel material for new door','Materials',1100.0,0.0,'','13681','9/5/25'],
['McMaster Carr','Materials',0.0,101.36,'','13565','5/30/25'],
['G. Cotter','Materials',0.0,1560.0,'','13625','5/30/25'],
['Metals USA','Materials',0.0,664.0,'','13281','7/1/25'],
['Metals USA','Materials',0.0,400.0,'','13423','7/1/25'],
['Metals USA','Materials',0.0,285.0,'','13565','7/1/25'],
['Valve','Materials',0.0,282.62,'','13673','9/10/25'],
['Metals USA','Materials',0.0,240.0,'','13341','7/1/25'],
['Metals USA','Materials',0.0,1694.45,'','13448','7/1/25'],
['Metals USA','Materials',0.0,227.54,'','13639','7/1/25'],
['Metals USA','Materials',0.0,1100.0,'','13411','7/1/25'],
['Metals USA','Materials',0.0,239.76,'','13563','7/1/25'],
['Mcmaster Carr','Materials',0.0,74.3,'','13618','6/4/25'],
['McMaster Carr','Materials',0.0,329.36,'','13661','6/6/25'],
['McMaster Carr','Materials',0.0,201.32,'','13561','6/6/25'],
['Mechanical Precision','Materials',0.0,850.0,'','13626','9/30/25'],
['McMaster Carr','Materials',0.0,31.9,'','13583','7/1/25'],
['TRS RentTelco','General',0.0,1264.2,'','13396','7/1/25'],
['PA Steel','Materials',6500.0,4189.17,'','13673','7/30/25'],
['McMaster Carr','Materials',0.0,30.89,'','13583','7/9/25'],
['McMaster Carr','Materials',0.0,64.78,'','13583','7/3/25'],
['Home Depot','Materials',0.0,10.09,'','13583','7/9/25'],
['McMaster Carr','Materials',0.0,147.94,'','13584','7/17/25'],
['Compressor Rental','General',3500.0,3108.0,'Perform Acoustic Noise test','13562','8/15/24'],
['Travel to pick up supplies','Travel',0.0,102.9,'','13649','8/11/25'],
['Mechanical Precision','Materials',0.0,1350.0,'','13662','8/11/25'],
['Mcmaster Carr','Materials',0.0,39.78,'','13673','8/20/25'],
['McMaster Carr','General',0.0,112.49,'','13673','8/15/25'],
['Alltest equipment','General',0.0,7047.0,'','13396','8/22/25'],
['Alltest service eval','General',0.0,300.0,'','13396','8/22/25'],
['Compressor','General',3500.0,0.0,'','13702','11/17/25'],
['Lowes','Materials',0.0,83.0,'','13673','8/21/25'],
['McMaster Carr','Materials',0.0,32.96,'','13504','9/29/25'],
['Mechanical Precision','Materials',0.0,1940.0,'','13649','8/25/25'],
['McMaster Carr','Materials',0.0,40.92,'','13575','9/9/25'],
['Miscellaneous Materials','Materials',4950.0,0.0,'','13176','9/24/20'],
['McMaster Carr','Materials',0.0,112.39,'','13649','10/2/25'],
['compressor','General',3200.0,3108.0,'','13626','2/20/25'],
['The Hose Shop','Materials',0.0,168.12,'','13586','10/17/25'],
['McMaster Carr','Materials',0.0,112.93,'','13586','10/17/25'],
['Mcmaster Carr','Materials',0.0,138.21,'','13649','10/15/25'],
['Wilson Products','General',0.0,602.48,'','13336','12/22/25'],
['Mcmaster Carr','Materials',0.0,122.63,'','13643','10/30/25'],
['Wilson Products','Materials',0.0,92.0,'','13586','11/4/25'],
['Wilson Pruducts','General',0.0,92.0,'','13336','1/5/26'],
['McMaster Carr','Materials',0.0,188.65,'','13176','11/13/25'],
['PA Steel- Misc steel for mounting frame','Materials',550.0,0.0,'','13705','12/3/25'],
['UPS shipping- Fastener Solutions','General',0.0,25.76,'','13176','12/1/25'],
['Drobach','General',0.0,3108.0,'','13677','11/24/25'],
['Fastener Solutions','Materials',0.0,515.2,'','13176','12/12/25'],
['Mechanical Precision','Materials',20000.0,0.0,'Fabricate a test fixture','13497','12/9/25'],
['Harware and estimated freight','General',4536.0,0.0,'Fabricate a test fixture','13497','12/9/25'],
['Drobach','General',0.0,3108.0,'','13702','12/17/25'],
['PA Steel','Materials',7400.0,3631.99,'','13318','7/10/25'],
['Flowmeter rental $175/day for 2 weeks','General',0.0,0.0,'Flowmeter Rental- Bi-weekly','13622','2/4/26'],
['Piping Supplies','Materials',0.0,2144.8,'','13318','1/28/26'],
['Mechanical Precision','Materials',0.0,2400.0,'','13622','1/29/26'],
['Travel- Mike McCormack- to pick up equipment','Travel',0.0,106.0,'','13318','1/29/26']
];
async function importHistoricalExpenses() {
  if (!sb) { toast("⚠ Not connected to Supabase"); return; }
  const nameMap = {};
  projects.forEach(p => { if (p.name) nameMap[p.name.trim()] = p.id; });

  const toInsert = HIST_EXPENSES.filter(r => nameMap[r[5]]);
  const noMatch  = HIST_EXPENSES.filter(r => !nameMap[r[5]] && r[5]);
  const uniqNoMatch = [...new Set(noMatch.map(r => r[5]))];

  if (!toInsert.length) {
    const msg = uniqNoMatch.length
      ? "No matching projects found.\nUnmatched project names (first 10):\n" + uniqNoMatch.slice(0,10).join("\n")
      : "No data to import.";
    alert(msg); return;
  }

  const confirmed = confirm(
    `Import ${toInsert.length} historical expense rows?\n` +
    `(${uniqNoMatch.length} rows skipped — project not found)\n\n` +
    `This will add expenses to the matching projects.`
  );
  if (!confirmed) return;

  const btn = document.getElementById("histImportBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Importing…"; }

  const CHUNK = 100;
  let inserted = 0, errors = 0;
  const rows = toInsert.map(r => ({
    proj_id:        nameMap[r[5]],
    name:           r[0] || "",
    planned_amount: r[2] || null,
    actual_cost:    r[3] || null,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await sb.from("expenses").insert(chunk).select();
    if (error) { console.error("Import chunk error:", error); errors += chunk.length; }
    else {
      (data || []).forEach(r => {
        expenseStore.push({
          _id: r.id, projId: r.proj_id, taskId: null,
          name: r.name || "",
          planned: r.planned_amount ? parseFloat(r.planned_amount) : 0,
          actual:  r.actual_cost    ? parseFloat(r.actual_cost)    : 0,
        });
      });
      inserted += (data || []).length;
    }
    if (btn) btn.textContent = `Importing… ${Math.min(i+CHUNK, rows.length)} / ${rows.length}`;
  }

  if (btn) { btn.disabled = false; btn.textContent = "📥 Import Historical"; }
  const uniqProjs = [...new Set(toInsert.map(r=>r[5]))].length;
  const msg = errors
    ? `✅ Imported ${inserted} rows (${errors} failed — check console).`
    : `✅ Imported ${inserted} expense rows across ${uniqProjs} projects!`;
  toast(msg);
  if (activeProjectId) renderExpensesPanel(activeProjectId);
}
let clientStore  = []; // loaded from Supabase
let contactStore = []; // loaded from Supabase

function renderExpensesSection(projId) {
  const el = document.getElementById('expensesSection');
  if (!el) return;
  const expenses = expenseStore.filter(e => e.projId === projId);
  const plannedTotal = expenses.reduce((s,e)=>s+(e.planned||0),0);
  const actualTotal  = expenses.reduce((s,e)=>s+(e.actual||0),0);
  const over = actualTotal > plannedTotal;

  const rows = expenses.map((e,i) => `
    <div class="expense-row">
      <div class="expense-cell">
        <input class="expense-name-input" value="${(e.name||'').replace(/"/g,'&quot;')}" placeholder="Expense description…"
          onblur="saveExpenseField('${e._id}','${projId}',\'name\',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()" />
      </div>
      <div class="expense-cell" style="justify-content:flex-end">
        <input class="expense-amt-input" type="text" inputmode="decimal" value="${e.planned||''}" placeholder="0.00"
          onfocus="this.select()"
          onblur="saveExpenseField('${e._id}','${projId}',\'planned\',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"
          oninput="this.value=this.value.replace(/[^0-9.]/g,'')" />
      </div>
      <div class="expense-cell" style="justify-content:flex-end">
        <input class="expense-amt-input" type="text" inputmode="decimal" value="${e.actual||''}" placeholder="0.00"
          style="${(e.actual||0) > (e.planned||0) && (e.planned||0) > 0 ? 'color:var(--red)' : ''}"
          onfocus="this.select()"
          onblur="saveExpenseField('${e._id}','${projId}',\'actual\',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"
          oninput="this.value=this.value.replace(/[^0-9.]/g,'')" />
      </div>
      <div class="expense-cell" style="padding:0">
        <button class="expense-del-btn" onclick="deleteExpense('${e._id}','${projId}')">&#x2715;</button>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="expenses-header">
      <div class="expenses-title">Expenses</div>
    </div>
    <div class="expense-grid">
      <div class="expense-grid-head">
        <div class="expense-head-cell">Description</div>
        <div class="expense-head-cell">Task</div>
        <div class="expense-head-cell" style="text-align:right">Planned ($)</div>
        <div class="expense-head-cell" style="text-align:right">Actual ($)</div>
        <div class="expense-head-cell"></div>
      </div>
      ${rows || '<div class="expense-cell" style="grid-column:1/-1;color:var(--muted);font-size:12.5px">No expenses yet — add one below.</div>'}
      ${expenses.length > 0 ? `
      <div class="expense-footer">
        <div class="expense-footer-cell" style="color:var(--muted);font-size:10px;letter-spacing:1px;text-transform:uppercase;font-family:'DM Sans',sans-serif">Total</div>
        <div class="expense-footer-cell"></div>
        <div class="expense-footer-cell" style="text-align:right;color:var(--text)">${plannedTotal > 0 ? fmt$(plannedTotal) : '—'}</div>
        <div class="expense-footer-cell ${over?'exp-over':'exp-under'}" style="text-align:right">${actualTotal > 0 ? fmt$(actualTotal) : '—'}</div>
        <div class="expense-footer-cell"></div>
      </div>` : ''}
    </div>
    <button class="expense-add-btn" onclick="addExpense('${projId}',true)">+ Add Expense</button>
    <button id="histImportBtn" onclick="importHistoricalExpenses()" style="display:flex;align-items:center;gap:6px;background:transparent;border:1px dashed var(--border);border-radius:7px;color:var(--muted);font-size:12px;padding:7px 14px;cursor:pointer;margin-top:6px;transition:all var(--transition);font-family:'DM Sans',sans-serif;width:100%;justify-content:center;" onmouseover="this.style.borderColor='var(--amber-dim)';this.style.color='var(--amber)';this.style.background='var(--amber-glow)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)';this.style.background='transparent'">📥 Import Historical Expenses</button>
  `;
}

async function addExpense(projId, fromPanel=false) {
  let newId = 'local-' + Date.now();
  if (sb) {
    try {
      const { data, error } = await sb.from('expenses')
        .insert({ proj_id: projId, name: '', planned_amount: null, actual_cost: null })
        .select().single();
      if (error) {
        console.error('addExpense:', error);
        toast('⚠ Could not save expense: ' + (error.message || 'check Supabase'));
        // Still add locally so UI works
      } else {
        newId = data.id;
      }
    } catch(e) {
      console.error('addExpense exception:', e);
    }
  }
  expenseStore.push({ _id: newId, projId, taskId: null, name: '', planned: 0, actual: 0, category: '' });
  if (fromPanel) renderExpensesPanel(projId); else renderProjSummary(projId);
  setTimeout(() => {
    const inputs = document.querySelectorAll('.expense-name-input');
    if (inputs.length) inputs[inputs.length-1].focus();
  }, 80);
}

async function saveExpenseField(expId, projId, field, value) {
  const e = expenseStore.find(x => x._id === expId);
  if (!e) return;
  const numFields = ['planned','actual'];
  e[field] = numFields.includes(field) ? (parseFloat(value)||0) : value;
  if (sb && !expId.startsWith('local-')) {
    const col = field === 'planned' ? 'planned_amount' : field === 'actual' ? 'actual_cost' : 'name';
    const { error } = await sb.from('expenses').update({ [col]: e[field]||null }).eq('id', expId);
    if (error) console.error('expense save', error);
  }
  // Update summary cards and totals without re-rendering the whole table
  updateExpenseSummary(projId);
}

function updateExpenseSummary(projId) {
  const expenses = expenseStore.filter(e => e.projId === projId);
  const plannedTotal = expenses.reduce((s,e) => s+(parseFloat(e.planned)||0), 0);
  const actualTotal  = expenses.reduce((s,e) => s+(parseFloat(e.actual)||0), 0);
  const over = actualTotal > plannedTotal && plannedTotal > 0;

  // Update summary cards
  const summaryEl = document.getElementById('expensesPanelSummary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="proj-sum-card">'+
        '<div class="proj-sum-label">Planned Budget</div>'+
        '<div class="proj-sum-val" style="color:var(--amber)">'+(plannedTotal > 0 ? fmt$(plannedTotal) : '—')+'</div>'+
        '<div class="proj-sum-sub">'+expenses.length+' expense'+(expenses.length!==1?'s':'')+' total</div>'+
      '</div>'+
      '<div class="proj-sum-card">'+
        '<div class="proj-sum-label">Actual Spend</div>'+
        '<div class="proj-sum-val" style="color:'+(over?'var(--red)':'var(--green)')+'">'+
          (actualTotal > 0 ? fmt$(actualTotal) : '—')+
        '</div>'+
        '<div class="proj-sum-sub">'+(plannedTotal > 0 ? (over ? fmt$(Math.abs(plannedTotal-actualTotal))+' over budget' : fmt$(Math.abs(plannedTotal-actualTotal))+' under budget') : 'No actuals yet')+'</div>'+
      '</div>';
  }

  // Update totals row in table footer
  const tfoot = document.querySelector('#expensesPanelList tfoot');
  if (tfoot) {
    const cells = tfoot.querySelectorAll('td');
    if (cells[2]) cells[2].textContent = plannedTotal > 0 ? fmt$(plannedTotal) : '—';
    if (cells[3]) {
      cells[3].textContent = actualTotal > 0 ? fmt$(actualTotal) : '—';
      cells[3].style.color = over ? 'var(--red)' : '#4caf7d';
    }
  } else if (expenses.length > 0) {
    // No footer yet - re-render to add it
    renderExpensesPanel(projId);
  }

  renderProjSummary(projId);
}

async function deleteExpense(expId, projId) {
  if (!confirm('Remove this expense?')) return;
  if (sb && !expId.startsWith('local-')) {
    const { error } = await sb.from('expenses').delete().eq('id', expId);
    if (error) { toast('⚠ Could not delete expense'); return; }
  }
  expenseStore = expenseStore.filter(e => e._id !== expId);
  renderProjSummary(projId);
}



// ===== INLINE TASK LIST FOR INFO SHEET =====
// ===== INLINE TASK LIST FOR INFO SHEET =====
let currentTaskFilter = 'all';

function renderInfoTasks(projId, filter) {
  currentTaskFilter = filter;
  const container = document.getElementById('infoTaskList');
  const countEl = document.getElementById('infoTaskCount');
  if (!container) return;

  let tasks = taskStore.filter(t => t.proj === projId);
  if (filter === 'active')  tasks = tasks.filter(t => !t.done);
  if (filter === 'done')    tasks = tasks.filter(t => t.done);
  if (filter === 'overdue') tasks = tasks.filter(t => t.overdue && !t.done);

  if (countEl) countEl.textContent = tasks.length + ' task' + (tasks.length !== 1 ? 's' : '');

  if (tasks.length === 0) {
    container.innerHTML = `<div class="info-tasks-empty"><div class="eico">&#x2705;</div>${filter === 'done' ? 'No completed tasks yet' : filter === 'overdue' ? 'No overdue tasks — great work!' : 'No tasks yet for this project'}</div>`;
    return;
  }

  const statusStyles = {
    new: {dot:'#7a7a85', label:'New'},
    inprogress: {dot:'#4caf7d', label:'In Progress'},
    prohold: {dot:'#e8a234', label:'Production Hold'},
    accthold: {dot:'#e05c5c', label:'Accounting Hold'},
    complete: {dot:'#888899', label:'Complete'},
    cancelled: {dot:'#5b7fa6', label:'Cancelled'},
    billed:    {dot:'#c084fc', label:'Billed'},
  };

  container.innerHTML = `
    <div class="itt-head" id="ittHead">
      <div class="itt-head-cell"></div><div class="itt-head-cell" style="color:var(--muted);font-size:10px">#<span class="itt-resizer" data-col="num"></span></div>
      <div class="itt-head-cell"><span class="itt-resizer" data-col="pri"></span></div>
      <div class="itt-head-cell">Cat.<span class="itt-resizer" data-col="cat"></span></div>
      <div class="itt-head-cell">Task<span class="itt-resizer" data-col="task"></span></div>
      <div class="itt-head-cell">Status<span class="itt-resizer" data-col="status"></span></div>
      <div class="itt-head-cell">Quote #<span class="itt-resizer" data-col="quote"></span></div>
      <div class="itt-head-cell">PO #<span class="itt-resizer" data-col="po"></span></div>
      <div class="itt-head-cell">Price<span class="itt-resizer" data-col="price"></span></div>
      <div class="itt-head-cell">Created<span class="itt-resizer" data-col="created"></span></div>
      <div class="itt-head-cell">Hrs Logged<span class="itt-resizer" data-col="hrs"></span></div>
      <div class="itt-head-cell">Budget Hrs<span class="itt-resizer" data-col="bhrs"></span></div>
      <div class="itt-head-cell">Assignee<span class="itt-resizer" data-col="assign"></span></div>
      <div class="itt-head-cell">Start Date<span class="itt-resizer" data-col="start"></span></div>
      <div class="itt-head-cell">Done/Billed<span class="itt-resizer" data-col="comp"></span></div>
      <div class="itt-head-cell"></div>
    </div>
    ${tasks.map((t, i) => {
      const m = employees.find(x => x.initials === t.assign) || {color:'#555'};
      const st = statusStyles[t.status || (t.done ? 'done' : 'inprogress')] || statusStyles.inprogress;
      const pMap = {urgent:'p-high', high:'p-med', medium:'p-low', low:'p-low'};
      const pLabel = {urgent:'Urgent', high:'High', medium:'Medium', low:'Low'};
      const pri = t.priority || 'medium';
      const empM = employees.find(e => e.initials === t.assign) || {color:'#555'};
      const statusOpts = ['new','inprogress','prohold','accthold','complete','cancelled','billed'].map(s => {
        const labels = {'new':'New','inprogress':'In Progress','prohold':'Production Hold','accthold':'Accounting Hold','complete':'Complete','cancelled':'Cancelled','billed':'Billed'};
        return `<option value="${s}" ${t.status===s?'selected':''}>${labels[s]}</option>`;
      }).join('');
      const priOpts = ['urgent','high','medium','low'].map(p =>
        `<option value="${p}" ${(t.priority||'medium')===p?'selected':''}>${{urgent:'Urgent',high:'High',medium:'Medium',low:'Low'}[p]}</option>`).join('');
      const salesOpts = ['','11','12','13','33','41','42','43','44','51','52','53','54','55','56','57','58','59','67','91','92','93','94','95','96','98','99'].map(v =>
        `<option value="${v}" ${(t.salesCat||'')===v?'selected':''}>${v||'—'}</option>`).join('');
      return `
        <div class="itt-row" data-task-id="${t._id}" draggable="true" style="animation:fadeUp 0.2s ease ${i*0.03}s both;${t.status==='billed'?'background:rgba(192,132,252,0.25);border-color:rgba(192,132,252,0.55);':t.status==='complete'||t.done?'background:rgba(120,120,130,0.25);border-color:rgba(120,120,130,0.45);':t.status==='inprogress'?'background:rgba(46,158,98,0.25);border-color:rgba(46,158,98,0.45);':''}"
          ondragstart="taskDragStart(event,'${t._id}')"
          ondragover="taskDragOver(event)"
          ondragleave="taskDragLeave(event)"
          ondrop="taskDrop(event,'${projId}')">
          <div class="itt-drag-handle" onclick="event.stopPropagation()" title="Drag to reorder">⠿</div>
          <div class="itt-check ${t.done?'done':''}" onclick="toggleInfoTask(${taskStore.indexOf(t)}, '${projId}');event.stopPropagation()" title="Mark task complete">${t.done?'&#x2713;':''}</div>
          <div class="itt-name ${t.done?'done':''} itt-cell-edit" onclick="inlineEditName('${t._id}','${projId}');event.stopPropagation()" title="Click to edit">${t.name}${t.revenueType==='nocharge'?'<span style="margin-left:6px;font-size:9px;font-weight:700;letter-spacing:0.6px;padding:1px 5px;border-radius:3px;background:rgba(208,64,64,0.12);color:var(--red);vertical-align:middle;flex-shrink:0">NC</span>':''}</div>
          <div onclick="event.stopPropagation()">
            <select class="status-pill-select" style="color:${statusColor(t.status||'new')};background:${statusColor(t.status||'new')}18;border-color:${statusColor(t.status||'new')}55"
              onchange="inlineSave('${t._id}','${projId}','status',this.value);this.style.color=statusColor(this.value);this.style.background=statusColor(this.value)+'18';this.style.borderColor=statusColor(this.value)+'55'">
              ${statusOpts}
            </select>
          </div>
          <div onclick="event.stopPropagation()">
            <select class="inline-edit-select" onchange="inlineSave('${t._id}','${projId}','salesCat',this.value)" style="color:var(--amber);font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 2px;width:100%">
              ${salesOpts}
            </select>
          </div>
          <div class="itt-cell-edit" onclick="inlineEditPrice('${t._id}','${projId}');event.stopPropagation()" title="Click to edit price" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green);cursor:text">
            ${t.fixedPrice ? '$' + t.fixedPrice.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${getHoursForTask(t.name,t.proj) > 0 ? 'var(--blue)' : 'var(--muted)'}">
            ${getHoursForTask(t.name,t.proj) > 0 ? getHoursForTask(t.name,t.proj).toFixed(1) + 'h' : '—'}
          </div>
          <div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:4px">
            <div class="itt-av" style="background:${empM.color}">${t.assign||'?'}</div>
            <select class="inline-edit-select" style="font-size:10px;padding:2px 2px;border:none;background:transparent;color:var(--muted);width:auto;max-width:70px" onchange="inlineSave('${t._id}','${projId}','assign',this.value)">
              <option value="">—</option>
              ${employees.filter(e=>e.isActive!==false).map(e => `<option value="${e.initials}" ${t.assign===e.initials?'selected':''}>${e.name.split(' ')[0]}</option>`).join('')}
            </select>
          </div>
          <div class="itt-due ${t.overdue?'overdue':''} itt-cell-edit" onclick="inlineEditDue('${t._id}','${projId}');event.stopPropagation()" title="Click to edit date">${t.due || '—'}</div>
          <div onclick="event.stopPropagation()">
            <select class="inline-edit-select" onchange="inlineSave('${t._id}','${projId}','priority',this.value)">
              ${priOpts}
            </select>
          </div>
          <div class="itt-row-actions">
            <button class="itt-row-action-btn" onclick="openEditTaskModal('${t._id}');event.stopPropagation()" title="Open full editor">&#x270E;</button>
          </div>
        </div>`;
    }).join('')}
  `;
}

// ── Task column resize ──
const ITT_DEFAULTS={num:'36px',pri:'28px',cat:'50px',task:'1fr',status:'130px',quote:'80px',price:'90px',created:'75px',hrs:'60px',bhrs:'60px',assign:'70px',start:'80px',comp:'80px'};
const ITT_MINS={num:28,pri:20,cat:36,task:80,status:80,quote:60,price:60,created:60,hrs:50,bhrs:50,assign:50,start:60,comp:60};
function ittGetW(){try{return Object.assign({},ITT_DEFAULTS,JSON.parse(localStorage.getItem('ittCols')||'{}'));}catch{return Object.assign({},ITT_DEFAULTS);}}
function ittSetW(w){Object.entries(w).forEach(([k,v])=>document.documentElement.style.setProperty('--itc-'+k,v));}
function ittSaveW(w){try{const s={};Object.entries(w).forEach(([k,v])=>{if(v!==ITT_DEFAULTS[k])s[k]=v;});localStorage.setItem('ittCols',JSON.stringify(s));}catch{}}
function ittInitResizers(){
  const head=document.getElementById('ittHead');
  if(!head||head._ri) return;
  head._ri=true;
  const w=ittGetW();ittSetW(w);
  head.querySelectorAll('.itt-resizer').forEach(r=>{
    r.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      const col=r.dataset.col;
      const startX=e.clientX;
      const cell=r.closest('.itt-head-cell');
      const startW=cell?cell.offsetWidth:parseInt(w[col]||80);
      r.classList.add('active');
      const mv=m=>{const px=Math.max(ITT_MINS[col]||40,startW+(m.clientX-startX));w[col]=px+'px';ittSetW(w);};
      const up=()=>{r.classList.remove('active');ittSaveW(w);document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
      document.addEventListener('mousemove',mv);
      document.addEventListener('mouseup',up);
    });
  });
}

const PTBL_MINS = {name:80,status:80,client:80,po:50,quote:50,desc:80,article:80,pm:60,tenttest:80,testcomp:80,dcas:50,witness:80,tpappr:60,dpas:50,noforn:50,credit:60,needpo:60,contact:80,exp:70,billed:70,hours:60,remain:70};
const PTBL_DEFAULTS = {name:'220px',status:'130px',client:'160px',po:'90px',quote:'90px',desc:'180px',article:'180px',exp:'100px',billed:'100px',hours:'90px',remain:'110px'};
function ptblGetW() { try { return Object.assign({}, PTBL_DEFAULTS, JSON.parse(localStorage.getItem('ptblCols')||'{}')); } catch { return Object.assign({}, PTBL_DEFAULTS); } }
function ptblSetW(w) { Object.entries(w).forEach(([k,v]) => document.documentElement.style.setProperty('--ptc-'+k, v)); }
function ptblSaveW(w) { try { const s={}; Object.entries(w).forEach(([k,v])=>{ if(v!==PTBL_DEFAULTS[k]) s[k]=v; }); localStorage.setItem('ptblCols', JSON.stringify(s)); } catch {} }

function ptblInitResizers() {
  const table = document.getElementById('projtblTable');
  if (!table) return;
  const w = ptblGetW();
  ptblSetW(w);
  table.querySelectorAll('th .itt-resizer').forEach(r => {
    r.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const col = r.dataset.ptc;
      const startX = e.clientX;
      const th = r.closest('th');
      const startW = th ? th.offsetWidth : parseInt(w[col]||100);
      let dragged = false;
      r.classList.add('active');
      const mv = m => {
        dragged = true;
        const px = Math.max(PTBL_MINS[col]||50, startW + (m.clientX - startX));
        w[col] = px+'px'; ptblSetW(w);
      };
      const up = () => {
        r.classList.remove('active');
        ptblSaveW(w);
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        // Block the th click (sort) that fires right after mouseup
        if (dragged && th) {
          const block = e2 => { e2.stopPropagation(); th.removeEventListener('click', block, true); };
          th.addEventListener('click', block, true);
        }
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  });
}

window.toggleInfoTask = async function toggleInfoTask(idx, projId) {
  if (idx < 0 || idx >= taskStore.length) return;
  const t = taskStore[idx];
  const today = new Date().toISOString().split('T')[0];
  t.done = !t.done;
  t.status = t.done ? 'complete' : 'inprogress';
  const updates = { status: t.status };
  if (t.done && !t.completedDate) {
    t.completedDate = today;
    updates.completed_date = today;
  }
  if (t.done && !t.taskStartDate) {
    t.taskStartDate = today;
    updates.task_start_date = today;
  }
  if (sb) {
    const { error } = await sb.from('tasks').update(updates).eq('id', t._id);
    if (error) console.error('toggleInfoTask', error);
  }
  renderInfoTasks(projId, currentTaskFilter);
  renderTasksPanel(projId);
  renderProjSummary(projId);
  updateStatsBar();
  // Update progress ring
  const projTasks = taskStore.filter(t => t.proj === projId);
  const pct = projTasks.length ? Math.round(projTasks.filter(t=>t.done).length / projTasks.length * 100) : 0;
  const ring = document.querySelector('.ring-fill');
  const pctEl = document.querySelector('.info-progress-pct');
  if (ring) {
    const circ = 2 * Math.PI * 20;
    ring.setAttribute('stroke-dashoffset', circ - (pct/100)*circ);
  }
  if (pctEl) pctEl.textContent = pct + '%';
}

function setTaskFilter(filter, btn, projId) {
  document.querySelectorAll('.itf').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderInfoTasks(projId, filter);
}


function openTaskModalForProject(projId) {
  openTaskModal();
  // After modal opens, lock project to the current one
  setTimeout(() => {
    const sel = document.getElementById('taskProject');
    if (sel) {
      sel.value = projId;
      syncProjChip(sel);
      // Hide the project row — user doesn't need to pick
      const projField = sel.closest('.field');
      if (projField) projField.style.display = 'none';
      // Store locked project so saveTask uses it
      lockedProjectId = projId;
    }
    // Populate section dropdown for this project
    if (typeof populateTaskSectionDropdown === 'function') {
      populateTaskSectionDropdown(projId);
    }
  }, 10);
}


// ===== PROJECT STICKY HEADER =====
// ===== PROJECT STICKY HEADER =====
function switchProjTab(subId) {
  document.querySelectorAll('.proj-sub').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.proj-tab').forEach(t => t.classList.remove('active'));
  const sub = document.getElementById(subId);
  if (sub) sub.classList.add('active');
  document.querySelectorAll('.proj-tab').forEach(t => {
    if (t.dataset.sub === subId) t.classList.add('active');
  });
  // Re-render bar if it's empty (data may have loaded after initial render)
  const bar = document.getElementById('projStickyBar');
  if (bar && !bar.innerHTML.trim() && activeProjectId) renderProjStickyHeader(activeProjectId);
  // Trigger renders
  if (subId === 'sub-info' && activeProjectId) renderInfoSheet(activeProjectId);
  if (subId === 'sub-tasks' && activeProjectId) renderTasksPanel(activeProjectId);
  if (subId === 'sub-hours' && activeProjectId) {
    if (typeof loadFullProjectTimesheets === 'function') {
      loadFullProjectTimesheets(activeProjectId).then(() => renderHoursPanel(activeProjectId));
    } else {
      renderHoursPanel(activeProjectId);
    }
  }
  if (subId === 'sub-expenses' && activeProjectId) renderExpensesPanel(activeProjectId);
  if (subId === 'sub-chatter' && activeProjectId) loadChatter(activeProjectId);
  if (subId === 'sub-activity' && activeProjectId) renderActivityPanel(activeProjectId);
  if (subId === 'sub-invoicing' && activeProjectId) renderInvoicingPanel(activeProjectId);
  if (subId === 'sub-shipping' && activeProjectId) renderShippingProjTab(activeProjectId);
}

function renderProjStickyHeader(projId) {
  const hdr = document.getElementById('projStickyHeader');
  const bar = document.getElementById('projStickyBar');
  if (!hdr || !bar) return;
  const fmtDate = d => {
    if (!d) return '';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}); }
    catch(e) { return ''; }
  };
  const proj = projects.find(p => p.id === projId);
  if (!proj) {
    // Show header/tabs immediately, poll until project data is loaded
    hdr.style.display = '';
    bar.innerHTML = '<span style="color:var(--muted);font-size:12px;padding:0 8px">Loading…</span>';
    let _retries = 0;
    const _poll = setInterval(() => {
      _retries++;
      const _p = projects.find(p => p.id === projId);
      if (_p || _retries > 20) {
        clearInterval(_poll);
        if (_p) renderProjStickyHeader(projId);
      }
    }, 200);
    return;
  }
  const info = projectInfo[projId] || {};
  const statusMap = {
    jobprep:{label:'Job Preparation',bg:'rgba(167,139,250,0.15)',color:'#a78bfa'},
    pending:{label:'Pending',bg:'rgba(232,162,52,0.25)',color:'#e8a234'},
    pendretest:{label:'Pending - ReTest',bg:'rgba(251,146,60,0.15)',color:'#fb923c'},
    active:{label:'Active',bg:'rgba(76,175,125,0.15)',color:'#4caf7d'},
    onhold:{label:'On Hold',bg:'rgba(122,122,133,0.15)',color:'#7a7a85'},
    complete:{label:'Complete',bg:'rgba(91,156,246,0.15)',color:'#5b9cf6'},
    testcomplete:{label:'Testing Complete',bg:'rgba(76,175,125,0.15)',color:'#4caf7d'},
    closing:{label:'Closing (Pending)',bg:'rgba(232,162,52,0.25)',color:'#e8a234'},
    closed:{label:'Closed',bg:'rgba(50,50,60,0.15)',color:'#555566'},
  };
  const st = statusMap[info.status] || statusMap.active;
  const phaseColors = {'Waiting on TP Approval':'#e05c5c','Within 3 Months':'#e8a234','3 to 6 Months':'#5b9cf6','No Time Frame':'#7a7a85'};
  const phColor = phaseColors[info.phase] || '#7a7a85';

  hdr.style.display = '';
  bar.innerHTML =
    '<span style="font-size:22px">'+(proj.emoji||'📁')+'</span>'+
    '<span class="proj-sticky-name" onclick="editProjectName(\''+projId+'\')" title="Click to edit name" style="cursor:pointer">'+proj.name+'</span>'+
    '<select class="proj-status-select" style="background:'+st.bg+';color:'+st.color+';border:1px solid '+st.color+'44;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;outline:none;font-family:\"DM Sans\",sans-serif;" onchange="changeProjectStatus(\x27'+projId+'\x27,this)">'+
      [['jobprep','Job Preparation'],['pending','Pending'],['pendretest','Pending - ReTest'],
       ['active','Active'],['onhold','On Hold'],['complete','Complete'],
       ['testcomplete','Testing Complete'],['closing','Closing (Pending)'],['closed','Closed']]
      .map(([k,l]) => '<option value="'+k+'" '+(info.status===k?'selected':'')+'>'+l+'</option>').join('')+
    '</select>'+
    '<div class="phase-pill" style="background:'+phColor+'22;color:'+phColor+';cursor:pointer;flex-shrink:0;position:relative" onclick="openConditionDropdown(\x27'+projId+'\x27,this)" title="Click to change condition">'+( info.phase||'Waiting on TP Approval')+'</div>'+
    (info.startDate||info.endDate ? '<span style="font-size:11px;color:var(--muted);font-family:\"JetBrains Mono\",monospace">'+fmtDate(info.startDate)+(info.startDate&&info.endDate?' → ':'')+fmtDate(info.endDate)+'</span>' : '')+
    (info.creditHold ? '<div class="credit-hold-checkbox-wrap active" onclick="toggleCreditHold(\''+projId+'\')"><span>⚠ CREDIT HOLD</span></div>' :
      '<div class="credit-hold-checkbox-wrap" onclick="toggleCreditHold(\''+projId+'\')"><span>Credit Hold</span></div>')+
    (info.needUpdatedPo ? '<div class="need-po-checkbox-wrap active" onclick="toggleNeedUpdatedPo(\''+projId+'\')" ><span>⚠ Need Updated PO</span></div>' :
      '<div class="need-po-checkbox-wrap" onclick="toggleNeedUpdatedPo(\''+projId+'\')" ><span>Need Updated PO</span></div>')+
    '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'+
    
    '<button class="info-edit-btn" onclick="confirmDeleteProject(\x27'+projId+'\x27)" style="color:var(--red);border-color:rgba(208,64,64,0.3)">&#x1F5D1; Delete</button>'+
    '</div>';

  // Show/hide credit hold banner
  const banner = document.getElementById('creditHoldBanner');
  if (banner) banner.style.display = info.creditHold ? '' : 'none';
  // Show/hide need PO banner
  const poBanner = document.getElementById('needPoBanner');
  if (poBanner) poBanner.style.display = info.needUpdatedPo ? '' : 'none';
  hdr.style.display = '';
}

// Add delegated click for proj tabs
document.addEventListener('DOMContentLoaded', function() {
  const tabsEl = document.getElementById('projStickyTabs');
  if (tabsEl) {
    tabsEl.addEventListener('click', function(e) {
      const tab = e.target.closest('.proj-tab');
      if (!tab || !tab.dataset.sub) return;
      switchProjTab(tab.dataset.sub);
    });
  }
});



// ===== INVOICING PANEL =====
// ===== INVOICING PANEL =====
function renderInvoicingPanel(projId) {
  const wrap = document.getElementById('invoicingWrap');
  if (!wrap || !projId) return;

  const allTasks = taskStore.filter(t => t.proj === projId);
  const readyTasks  = allTasks.filter(t => t.status === 'complete');
  const billedTasks = allTasks.filter(t => t.status === 'billed');

  const fmt$ = n => n > 0 ? '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';

  const readyTotal  = readyTasks.reduce((s,t) => s + (t.fixedPrice||0), 0);
  const billedTotal = billedTasks.reduce((s,t) => s + (t.fixedPrice||0), 0);
  const allTotal    = allTasks.reduce((s,t) => s + (t.fixedPrice||0), 0);

  function taskRow(t, showMarkBtn) {
    const empM = employees.find(e => e.initials === t.assign) || {color:'#555'};
    const ptCell = showMarkBtn ? '' : `
      <td onclick="event.stopPropagation()" style="padding:4px 8px">
        <input type="text" value="${t.peachtreeInv||''}"
          placeholder="INV-"
          style="width:100px;background:${t.peachtreeInv?'var(--surface2)':'rgba(251,191,36,0.08)'};border:1px solid ${t.peachtreeInv?'var(--border)':'#f59e0b'};border-radius:5px;padding:4px 7px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text);outline:none"
          onchange="savePeachtreeInv('${t._id}', this.value);this.style.background='var(--surface2)';this.style.borderColor='var(--border)'"
          onfocus="this.style.borderColor='var(--blue)'"
          onblur="this.style.borderColor=this.value?'var(--border)':'#f59e0b'">
      </td>`;
    return `<tr>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.taskNum ? '<span style="font-size:10px;color:var(--muted);font-family:JetBrains Mono,monospace;margin-right:6px">#'+t.taskNum+'</span>' : ''}${t.name}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div class="itt-av" style="background:${empM.color};width:20px;height:20px;font-size:9px">${t.assign||'?'}</div><span style="font-size:12px">${t.assign||'—'}</span></div></td>
      <td class="inv-amount" style="color:var(--green)">${fmt$(t.fixedPrice||0)}</td>
      <td style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${t.due||'—'}</td>
      ${ptCell}
      <td>
        ${showMarkBtn
          ? `<button class="inv-mark-btn" onclick="markTaskBilled('${t._id}','${projId}')">Mark Billed</button>`
          : `<button class="inv-mark-btn" style="color:var(--red);border-color:rgba(224,92,92,0.3)" onclick="confirmUnbillTask('${t._id}','${projId}')">&#x21A9; Undo Bill</button>`}
      </td>
    </tr>`;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">&#x1F4C4; Invoicing</div>
    </div>

    <div class="inv-summary-row">
      <div class="inv-summary-card">
        <div class="inv-summary-label">Ready to Bill</div>
        <div class="inv-summary-val" style="color:var(--green)">${fmt$(readyTotal)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${readyTasks.length} task${readyTasks.length!==1?'s':''}</div>
      </div>
      <div class="inv-summary-card">
        <div class="inv-summary-label">Billed</div>
        <div class="inv-summary-val" style="color:#c084fc">${fmt$(billedTotal)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${billedTasks.length} task${billedTasks.length!==1?'s':''}</div>
      </div>
      <div class="inv-summary-card">
        <div class="inv-summary-label">Total Contract</div>
        <div class="inv-summary-val" style="color:var(--text)">${fmt$(allTotal)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${allTasks.length} task${allTasks.length!==1?'s':''} total</div>
      </div>
    </div>

    ${readyTasks.length > 0 ? `
      <div class="inv-section-title">&#x1F7E2; Complete — Ready to Bill</div>
      <table class="inv-table">
        <thead><tr>
          <th>Task</th><th>Assignee</th><th>Price</th><th>Completed Date</th><th></th>
        </tr></thead>
        <tbody>${readyTasks.map(t => taskRow(t, true)).join('')}</tbody>
      </table>
    ` : `<div class="inv-empty">&#x2714; No completed tasks waiting to be billed.</div>`}

    ${billedTasks.length > 0 ? (() => {
      const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
      // Group by Peachtree Inv # (blank = "No Invoice #")
      const groups = {};
      billedTasks.forEach(t => {
        const key = t.peachtreeInv || '';
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
      });
      // Sort: numbered invoices first (numerically), then blank
      const sortedKeys = Object.keys(groups).sort((a,b) => {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        const na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
      const grandTotal = billedTasks.reduce((s,t) => s+(t.fixedPrice||0), 0);
      return `
        <div class="inv-section-title" style="margin-top:28px">&#x1F7E3; Already Billed</div>
        ${sortedKeys.map(invNum => {
          const grpTasks = groups[invNum];
          const grpTotal = grpTasks.reduce((s,t) => s+(t.fixedPrice||0), 0);
          return `
            <div style="margin-bottom:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px 8px 0 0;border-bottom:none;">
                <div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);">
                  ${invNum ? '&#x1F4CB; Peachtree Inv # <span style="color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;text-transform:none;letter-spacing:0">'+invNum+'</span>' : '<span style="color:var(--muted);font-style:italic">No Invoice # Assigned</span>'}
                </div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--green);">${fmt$(grpTotal)}</div>
              </div>
              <table class="inv-table" style="opacity:.85;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
                <thead><tr>
                  <th>Task</th><th>Assignee</th><th>Price</th><th>Billed Date</th><th>Peachtree Inv #</th><th></th>
                </tr></thead>
                <tbody>${grpTasks.map(t => taskRow(t, false)).join('')}</tbody>
              </table>
            </div>`;
        }).join('')}
        <div style="display:flex;justify-content:flex-end;padding:10px 12px;border-top:2px solid var(--border);margin-top:4px;">
          <span style="font-size:13px;font-weight:700;color:var(--muted);margin-right:16px;">Grand Total Billed</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:var(--green);">${fmt$(grandTotal)}</span>
        </div>`;
    })() : ''}
  `;
}

async function showBilledAuditModal(monthKey, monthLabel) {
  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Show modal immediately with loading state
  let auditOv = document.getElementById('billedAuditOverlay');
  if (!auditOv) {
    auditOv = document.createElement('div');
    auditOv.id = 'billedAuditOverlay';
    auditOv.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);z-index:1000;align-items:flex-start;justify-content:center;padding-top:60px';
    auditOv.onclick = e => { if (e.target === auditOv) auditOv.style.display='none'; };
    document.body.appendChild(auditOv);
  }
  auditOv.innerHTML = `<div class="modal" style="width:700px;max-height:80vh;transform:none;opacity:1">
    <div class="modal-header">
      <div class="modal-title">📋 Billed Items — ${monthLabel}</div>
      <button class="modal-close" onclick="document.getElementById('billedAuditOverlay').style.display='none'">&#x2715;</button>
    </div>
    <div class="modal-body" style="padding:20px;text-align:center;color:var(--muted)">Loading...</div>
  </div>`;
  auditOv.style.display = 'flex';

  // Fetch ALL billed tasks for this month directly from Supabase (includes closed projects)
  const monthStart = monthKey + '-01';
  const nextMonth = new Date(monthStart + 'T00:00:00');
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = nextMonth.toISOString().slice(0,10);

  let tasks = [];
  if (sb) {
    const { data } = await sb.from('tasks')
      .select('id, name, task_num, project_id, status, fixed_price, billed_date, completed_date, peachtree_inv')
      .eq('status', 'billed')
      .or(`billed_date.gte.${monthStart},completed_date.gte.${monthStart}`)
      .or(`billed_date.lt.${monthEnd},completed_date.lt.${monthEnd}`)
      .order('billed_date', { ascending: true });
    // Filter precisely by month since OR logic above is broad
    tasks = (data || []).filter(r => {
      const d = r.billed_date || r.completed_date;
      return d && d.slice(0,7) === monthKey;
    }).map(r => ({
      _id: r.id, taskNum: r.task_num, proj: r.project_id,
      name: r.name, fixedPrice: parseFloat(r.fixed_price)||0,
      billedDate: r.billed_date, completedDate: r.completed_date,
      peachtreeInv: r.peachtree_inv||''
    }));
  } else {
    // Fallback to taskStore if no Supabase
    const _todayStr = new Date().toISOString().split('T')[0];
    tasks = taskStore.filter(t => {
      if (t.status !== 'billed') return false;
      const d = t.billedDate || t.completedDate || _todayStr;
      return d.slice(0,7) === monthKey;
    });
  }

  const total = tasks.reduce((s,t) => s + (t.fixedPrice||0), 0);

  // Group by Peachtree Inv #
  const groups = {};
  tasks.forEach(t => {
    const key = t.peachtreeInv || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const sortedKeys = Object.keys(groups).sort((a,b) => {
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const rows = tasks.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No billed items found for this month.</td></tr>`
    : sortedKeys.map(invNum => {
        const grpTasks = groups[invNum];
        const grpTotal = grpTasks.reduce((s,t) => s+(t.fixedPrice||0), 0);
        return `
          <tr style="background:var(--surface2)">
            <td colspan="4" style="padding:7px 12px;font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--muted);">
              ${invNum ? '📋 Inv # <span style="color:var(--text);font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:600;letter-spacing:0">'+invNum+'</span>' : '<em style="font-weight:400">No Invoice # Assigned</em>'}
            </td>
            <td style="padding:7px 12px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--green);text-align:right;">${fmt$(grpTotal)}</td>
          </tr>
          ${grpTasks.map(t => {
            const proj = projects.find(p => p.id === t.proj);
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px 12px;font-size:13px">${proj ? proj.emoji+' '+proj.name : '—'}</td>
              <td style="padding:8px 12px;font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.taskNum?'<span style="font-size:10px;color:var(--muted);margin-right:4px">#'+t.taskNum+'</span>':''}${t.name}</td>
              <td style="padding:8px 12px;font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace">${t.peachtreeInv||'—'}</td>
              <td style="padding:8px 12px;font-size:12px;color:var(--muted)">${t.billedDate||t.completedDate||t.due_raw||'—'}</td>
              <td style="padding:8px 12px;font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--green);text-align:right">${fmt$(t.fixedPrice)}</td>
            </tr>`;
          }).join('')}`;
      }).join('');

  auditOv.innerHTML = `
    <div class="modal" style="width:700px;max-height:80vh;transform:none;opacity:1">
      <div class="modal-header">
        <div class="modal-title">📋 Billed Items — ${monthLabel}</div>
        <button class="modal-close" onclick="document.getElementById('billedAuditOverlay').style.display='none'">&#x2715;</button>
      </div>
      <div class="modal-body" style="padding:0;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border);background:var(--surface2)">
              <th style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600">Project</th>
              <th style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600">Task</th>
              <th style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600">Peachtree Inv #</th>
              <th style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:left;font-weight:600">Date</th>
              <th style="padding:8px 12px;font-size:11px;color:var(--muted);text-align:right;font-weight:600">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--border);background:var(--surface2)">
              <td colspan="4" style="padding:10px 12px;font-size:13px;font-weight:700;color:var(--text)">Total</td>
              <td style="padding:10px 12px;font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--green);text-align:right">${fmt$(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  auditOv.style.display = 'flex';
}

function confirmUnbillTask(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  showConfirmModal(
    'Remove billing from "' + t.name + '"? It will move back to Complete and be ready to re-bill.',
    () => unBillTask(taskId, projId),
    { title: 'Undo Billing', btnTxt: 'Yes, Remove Billing', color: 'var(--amber)', icon: '&#x21A9;' }
  );
}

async function unBillTask(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  t.status = 'complete';
  t.billedDate = '';
  t.peachtreeInv = '';
  if (sb) {
    const { error } = await sb.from('tasks').update({
      status: 'complete',
      billed_date: null,
      peachtree_inv: null,
    }).eq('id', taskId);
    if (error) console.error('unBillTask', error);
  }
  renderInvoicingPanel(projId);
  renderTasksPanel(projId);
  renderProjSummary(projId);
  renderBillingQueue();
}

async function markTaskBilled(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const today = new Date().toISOString().split('T')[0];
  t.status = 'billed';
  if (!t.billedDate)    { t.billedDate    = today; }
  if (!t.completedDate) { t.completedDate = today; }
  if (sb) {
    const { error } = await sb.from('tasks').update({ status: 'billed' }).eq('id', taskId);
    if (error) console.error('markTaskBilled status', error);
    const { error: e2 } = await sb.from('tasks').update({
      billed_date:    t.billedDate,
      completed_date: t.completedDate,
    }).eq('id', taskId);
    if (e2) console.error('markTaskBilled dates (run SQL migration):', e2.message);
  }
  renderInvoicingPanel(projId);
  renderTasksPanel(projId);
  renderProjSummary(projId);
}



// ===== HOURS CHARGED PER TASK =====
// ===== HOURS CHARGED PER TASK =====
function getHoursForTask(taskName, projId) {
  if (!taskName) return 0;
  let total = 0;
  Object.entries(tsData).forEach(([k, rows]) => {
    if (k.startsWith('oh_') || !Array.isArray(rows)) return;
    rows.forEach(row => {
      // If looking for a specific project, only count rows that explicitly belong to it
      if (projId && row.projId !== projId) return;
      if (row.taskName && row.taskName.trim().toLowerCase() === taskName.trim().toLowerCase()) {
        total += Object.values(row.hours).reduce((a, b) => a + b, 0);
      }
    });
  });
  return total;
}




// ===== EXPENSES PANEL =====
// ===== EXPENSES PANEL =====
function renderExpensesPanel(projId) {
  if (!projId) return;
  const body = document.getElementById('expensesPanelList');
  const summaryEl = document.getElementById('expensesPanelSummary');
  if (!body) return;

  const expenses = expenseStore.filter(e => e.projId === projId);
  const projTasks = taskStore.filter(t => t.proj === projId).sort((a,b)=>(a.taskNum||0)-(b.taskNum||0));
  const plannedTotal = expenses.reduce((s,e) => s+(parseFloat(e.planned)||0), 0);
  const actualTotal  = expenses.reduce((s,e) => s+(parseFloat(e.actual)||0), 0);
  const over = actualTotal > plannedTotal && plannedTotal > 0;

  // Summary cards
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="proj-sum-card">'+
        '<div class="proj-sum-label">Planned Budget</div>'+
        '<div class="proj-sum-val" style="color:var(--amber)">'+(plannedTotal > 0 ? fmt$(plannedTotal) : '—')+'</div>'+
        '<div class="proj-sum-sub">'+expenses.length+' expense'+(expenses.length!==1?'s':'')+' total</div>'+
      '</div>'+
      '<div class="proj-sum-card">'+
        '<div class="proj-sum-label">Actual Spend</div>'+
        '<div class="proj-sum-val" style="color:'+(over?'var(--red)':'var(--green)')+'">'+
          (actualTotal > 0 ? fmt$(actualTotal) : '—')+
        '</div>'+
        '<div class="proj-sum-sub">'+(plannedTotal > 0 ? (over ? fmt$(Math.abs(plannedTotal-actualTotal))+' over budget' : fmt$(Math.abs(plannedTotal-actualTotal))+' under budget') : 'No actuals yet')+'</div>'+
      '</div>';
  }

  const taskOpts = (selId) => '<option value="">— No task —</option>' +
    projTasks.map(t => '<option value="'+t._id+'" '+(selId===t._id?'selected':'')+'>'+
      '#'+(t.taskNum||'?')+' '+t.name+'</option>').join('');

  const rows = expenses.map((e,i) => {
    const ovr = (parseFloat(e.actual)||0) > (parseFloat(e.planned)||0) && (parseFloat(e.planned)||0) > 0;
    const bg = i%2===0 ? '' : 'background:var(--surface2)';
    return `<tr style="border-bottom:1px solid var(--border);${bg}">
      <td style="padding:8px 12px">
        <input class="expense-name-input" style="width:100%" value="${(e.name||'').replace(/"/g,'&quot;')}" placeholder="Description…"
          onblur="saveExpenseField('${e._id}','${projId}','name',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()" />
      </td>
      <td style="padding:8px 12px">
        <select class="inline-edit-select" style="font-size:11px;width:100%" onchange="saveExpenseTask('${e._id}','${projId}',this.value)">
          ${taskOpts(e.taskId)}
        </select>
      </td>
      <td style="padding:8px 12px;text-align:right;white-space:nowrap">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:2px">
          <span style="font-size:11px;color:var(--muted)">$</span>
          <input class="expense-amt-input" type="number" min="0" step="0.01" value="${e.planned||''}" placeholder="0.00"
            style="text-align:right;width:90px"
            onfocus="this.select()"
            onblur="saveExpenseField('${e._id}','${projId}','planned',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()" />
        </div>
      </td>
      <td style="padding:8px 12px;text-align:right;white-space:nowrap">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:2px">
          <span style="font-size:11px;color:${ovr?'var(--red)':'var(--muted)'}">$</span>
          <input class="expense-amt-input" type="number" min="0" step="0.01" value="${e.actual||''}" placeholder="0.00"
            style="text-align:right;width:90px;${ovr?'color:var(--red)':''}"
            onfocus="this.select()"
            onblur="saveExpenseField('${e._id}','${projId}','actual',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()" />
        </div>
      </td>
      <td style="padding:8px 6px;text-align:center;width:36px">
        <button class="expense-del-btn" onclick="deleteExpenseFromPanel('${e._id}','${projId}')">&#x2715;</button>
      </td>
    </tr>`;
  }).join('');

  body.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:9px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Description</th>
            <th style="text-align:left;padding:9px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);width:180px">Task</th>
            <th style="text-align:right;padding:9px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);width:120px">Planned</th>
            <th style="text-align:right;padding:9px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);width:120px">Actual</th>
            <th style="width:36px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);font-size:13px">No expenses yet — click Add Expense below</td></tr>'}
        </tbody>
        ${expenses.length > 0 ? `
        <tfoot>
          <tr style="background:var(--surface2);border-top:2px solid var(--border)">
            <td style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted)">Total</td>
            <td></td>
            <td style="text-align:right;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--text)">${plannedTotal > 0 ? fmt$(plannedTotal) : '—'}</td>
            <td style="text-align:right;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:${over?'var(--red)':'#4caf7d'}">${actualTotal > 0 ? fmt$(actualTotal) : '—'}</td>
            <td></td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
    <button class="expense-add-btn" onclick="addExpense('${projId}',true)">+ Add Expense</button>
  `;
}

async function saveExpenseTask(expId, projId, taskId) {
  const e = expenseStore.find(x => x._id === expId);
  if (!e) return;
  e.taskId = taskId || null;
  if (sb && !expId.startsWith('local-')) {
    await sb.from('expenses').update({ task_id: e.taskId }).eq('id', expId);
  }
  renderExpensesPanel(projId);
}

async function deleteExpenseFromPanel(expId, projId) {
  if (!confirm('Remove this expense?')) return;
  if (sb && !expId.startsWith('local-')) {
    const { error } = await sb.from('expenses').delete().eq('id', expId);
    if (error) { toast('⚠ Could not delete expense'); return; }
  }
  expenseStore = expenseStore.filter(e => e._id !== expId);
  renderExpensesPanel(projId);
  renderProjSummary(projId);
}


// ===== BILLED REVENUE SYNC =====
// ===== BILLED REVENUE SYNC =====
async function syncProjBilledRevenue(projId) {
  if (!sb || !projId) return;
  const tasks = taskStore.filter(t => t.proj === projId);
  const billedRevenue = tasks.filter(t => t.status === 'billed').reduce((s,t) => s+(t.fixedPrice||0), 0);
  const expectedRevenue = tasks.reduce((s,t) => s+(t.fixedPrice||0), 0);
  if (projectInfo[projId]) {
    projectInfo[projId].billedRevenue = billedRevenue;
    projectInfo[projId].expectedRevenue = expectedRevenue;
  }
  try {
    await sb.from('project_info').update({ billed_revenue: billedRevenue, expected_revenue: expectedRevenue })
      .eq('project_id', projId);
    // Update billed_revenue_monthly for each billed task in this project
    const billedByMonth = {};
    const todayStr = new Date().toISOString().split('T')[0];
    tasks.filter(t => t.status === 'billed').forEach(t => {
      const dateStr = t.billedDate || t.completedDate || todayStr;
      const key = dateStr.slice(0, 7); // YYYY-MM
      billedByMonth[key] = (billedByMonth[key] || 0) + (t.fixedPrice || 0);
    });
    for (const [ym, amount] of Object.entries(billedByMonth)) {
      await sb.from('billed_revenue_monthly')
        .upsert({ year_month: ym, project_id: projId, amount }, { onConflict: 'year_month,project_id' });
      if (window.billedMonthlyData !== undefined) {
        const { data: _mrows } = await sb.from('billed_revenue_monthly').select('amount').eq('year_month', ym);
        if (_mrows) window.billedMonthlyData[ym] = _mrows.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
      }
    }
    // Update billed_revenue_by_category
    const billedByCat = {};
    tasks.filter(t => t.status === 'billed').forEach(t => {
      const dateStr = t.billedDate || t.completedDate || todayStr;
      const ym = dateStr.slice(0, 7);
      const cat = (t.salesCat||'').trim() || 'Uncategorized';
      if (!billedByCat[ym]) billedByCat[ym] = {};
      billedByCat[ym][cat] = (billedByCat[ym][cat]||0) + (t.fixedPrice||0);
    });
    for (const [ym, cats] of Object.entries(billedByCat)) {
      for (const [cat, amount] of Object.entries(cats)) {
        await sb.from('billed_revenue_by_category')
          .upsert({ year_month: ym, sales_category: cat, amount }, { onConflict: 'year_month,sales_category' });
      }
    }
  } catch(e) { console.warn('syncProjBilledRevenue error:', e); }
}
async function syncProjActualHours(projId) {
  if (!sb || !projId) return;
  let total = 0;
  Object.entries(tsData).forEach(([k, rows]) => {
    if (k.startsWith('oh_') || !Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.projId === projId) {
        total += Object.values(row.hours).reduce((a, b) => a + b, 0);
      }
    });
  });
  if (projectInfo[projId]) projectInfo[projId].actualHours = total;
  try {
    await sb.from('project_info').update({ actual_hours: total }).eq('project_id', projId);
  } catch(e) { console.warn('syncProjActualHours error:', e); }
}



