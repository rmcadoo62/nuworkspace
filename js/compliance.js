// ===== COMPLIANCE MODULE =====
// ===== COMPLIANCE MODULE =====
// CMMC 2.0 Level 2 — NU Laboratories, Inc.
// Phase 1: Security Awareness Training Tracking + Plan of Action & Milestones (POA&M)
// All field structures derived directly from the NU Laboratories SSP policy documents.

// ===== STATE =====
let complianceTab = 'training';
let trainingRecords = [];
let poamRecords = [];
let complianceEmployees = [];
let editingTrainingId = null;
let editingPoamId = null;
let trainingSearchVal = '';
let poamStatusFilter = 'all';

// ===== PANEL OPEN =====
function openCompliancePanel(navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-compliance');
  if (panel) panel.classList.add('active');
  _renderComplianceTabBar();
  renderComplianceTab(complianceTab);
}

// ===== TAB BAR =====
function _renderComplianceTabBar() {
  const bar = document.getElementById('compTabBar');
  if (!bar) return;
  const tabs = [
    { id: 'training',     icon: '📚', label: 'Training'     },
    { id: 'poam',         icon: '📋', label: 'POA&M'        },
    { id: 'incidents',    icon: '🚨', label: 'Incidents'    },
    { id: 'personnel',    icon: '👤', label: 'Personnel'    },
    { id: 'maintenance',  icon: '🔧', label: 'Maintenance'  },
    { id: 'mediadisposal',icon: '🗑️', label: 'Media Disposal'},
    { id: 'changelog',    icon: '📝', label: 'Change Log'   },
    { id: 'assessment',   icon: '✅', label: 'Self-Assessment'},
  ];
  bar.innerHTML = tabs.map(t => `
    <button class="comp-tab${complianceTab === t.id ? ' active' : ''}"
      data-tab="${t.id}" onclick="complianceSwitchTab('${t.id}')">
      ${t.icon} ${t.label}
    </button>
  `).join('');
}

function complianceSwitchTab(tab) {
  complianceTab = tab;
  document.querySelectorAll('.comp-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderComplianceTab(tab);
}

async function renderComplianceTab(tab) {
  const area = document.getElementById('complianceTabContent');
  if (!area) return;
  area.innerHTML = '<div style="padding:40px 32px;color:var(--muted);font-size:13px">Loading…</div>';
  if (tab === 'training') await _renderTrainingTab();
  else if (tab === 'poam') await _renderPoamTab();
  else if (tab === 'assessment') await _renderAssessmentTab();
  else if (tab === 'incidents') await _renderIncidentsTab();
  else _renderComingSoonTab(tab);
}

function _renderComingSoonTab(tab) {
  const labels = {
    incidents:     '🚨 Incident Records',
    personnel:     '👤 HR / Personnel Records',
    maintenance:   '🔧 Maintenance Records',
    mediadisposal: '🗑️ Media Disposal Records',
    changelog:     '📝 CUI System Change Log',
    assessment:    '✅ NIST 800-171 Self-Assessment',
  };
  const area = document.getElementById('complianceTabContent');
  area.innerHTML = `
    <div style="padding:60px 32px;text-align:center">
      <div style="font-size:36px;margin-bottom:16px">${labels[tab]?.split(' ')[0] || '📋'}</div>
      <div style="font-size:18px;font-family:'DM Serif Display',serif;color:var(--text);margin-bottom:8px">
        ${labels[tab] || tab} — Coming Next
      </div>
      <div style="font-size:13px;color:var(--muted);max-width:480px;margin:0 auto;line-height:1.7">
        This module is part of the CMMC 2.0 Level 2 compliance suite and will be implemented in the next build phase.
        Field structures are defined in the NU Laboratories SSP policy documents.
      </div>
    </div>
  `;
}


// ════════════════════════════════════════════════════════════════════
//  MODULE 1 — SECURITY AWARENESS TRAINING TRACKING  (AT.L2-3.2.1/2)
// ════════════════════════════════════════════════════════════════════
// Fields per AT policy Section 6:
//   Employee Name | Training Track | Training Version | Date Completed | Logged By | Next Due Date

async function _renderTrainingTab() {
  const area = document.getElementById('complianceTabContent');

  // Load employees for dropdown
  if (!complianceEmployees.length) {
    const { data } = await sb.from('employees')
      .select('id, name, role, department')
      .eq('is_active', true)
      .neq('department', 'Ballantine')
      .order('name');
    complianceEmployees = (data || []).filter(e => e.name);
  }

  // Fetch records
  const { data, error } = await sb
    .from('cmmc_training_records')
    .select('*')
    .order('date_completed', { ascending: false });
  trainingRecords = data || [];
  if (error) console.error('Training load error:', error);

  const currentYear = new Date().getFullYear();
  const thisYear = trainingRecords.filter(r => (r.date_completed || '').startsWith(String(currentYear)));
  const standardCount = trainingRecords.filter(r => r.training_track === 'Standard').length;
  const adminCount    = trainingRecords.filter(r => r.training_track === 'Admin').length;

  // Overdue count — next_due_date < today
  const today = new Date().toISOString().split('T')[0];
  const overdueCount = trainingRecords.filter(r => r.next_due_date && r.next_due_date < today).length;

  area.innerHTML = `
    <div style="padding:28px 32px">

      <!-- Summary pills -->
      <div class="comp-stat-row">
        <div class="comp-stat-pill">
          <div class="comp-stat-num">${trainingRecords.length}</div>
          <div class="comp-stat-lbl">Total Records</div>
        </div>
        <div class="comp-stat-pill comp-stat-green">
          <div class="comp-stat-num">${thisYear.length}</div>
          <div class="comp-stat-lbl">${currentYear} Completions</div>
        </div>
        <div class="comp-stat-pill comp-stat-blue">
          <div class="comp-stat-num">${standardCount}</div>
          <div class="comp-stat-lbl">Standard Track</div>
        </div>
        <div class="comp-stat-pill comp-stat-purple">
          <div class="comp-stat-num">${adminCount}</div>
          <div class="comp-stat-lbl">Admin Track</div>
        </div>
        ${overdueCount ? `<div class="comp-stat-pill comp-stat-red">
          <div class="comp-stat-num">${overdueCount}</div>
          <div class="comp-stat-lbl">Overdue / Due</div>
        </div>` : ''}
      </div>

      <!-- Policy context callout -->
      <div class="comp-policy-banner">
        <span class="comp-policy-icon">📌</span>
        <div>
          <strong>AT.L2-3.2.1 &amp; AT.L2-3.2.2</strong> — All CUI-authorized personnel must complete Standard training before first CUI access and annually by Dec 31.
          The Owner / IT Administrator additionally completes Admin (privileged-user) training each Q4. Records are retained for 3 years.
        </div>
      </div>

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <input type="text" id="trainingSearchInput" placeholder="Search by name, version, track…" autocomplete="off"
          value="${trainingSearchVal}"
          oninput="trainingSearchVal=this.value;_renderTrainingTable()"
          style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:6px 12px;outline:none;width:240px;transition:border-color var(--transition)"
          onfocus="this.style.borderColor='var(--amber-dim)'" onblur="this.style.borderColor='var(--border)'" />
        <div style="margin-left:auto;display:flex;gap:8px">
          <button onclick="_refreshTrainingTab()" class="comp-btn-ghost">↺ Refresh</button>
          <button onclick="openTrainingModal()" class="comp-btn-primary">+ Add Record</button>
        </div>
      </div>

      <!-- Table -->
      <div id="trainingTableWrap"></div>
    </div>
  `;

  _renderTrainingTable();
}

async function _refreshTrainingTab() {
  complianceEmployees = [];
  await _renderTrainingTab();
}

function _renderTrainingTable() {
  const wrap = document.getElementById('trainingTableWrap');
  if (!wrap) return;

  const q = trainingSearchVal.toLowerCase();
  let filtered = trainingRecords;
  if (q) {
    filtered = filtered.filter(r =>
      (r.employee_name || '').toLowerCase().includes(q) ||
      (r.training_track || '').toLowerCase().includes(q) ||
      (r.training_version || '').toLowerCase().includes(q) ||
      (r.logged_by || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">
      ${q ? 'No records match your search.' : 'No training records yet. Click <strong>+ Add Record</strong> to log the first completion.'}
    </div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  const rows = filtered.map(r => {
    const isOverdue = r.next_due_date && r.next_due_date < today;
    const trackClass = r.training_track === 'Admin' ? 'comp-badge-purple' : 'comp-badge-blue';
    const dueFmt  = r.next_due_date ? _fmtDate(r.next_due_date) : '—';
    const dueStyle = isOverdue ? 'color:var(--red);font-weight:600' : '';
    return `
      <tr class="comp-tbl-row" onclick="openTrainingModal('${r.id}')">
        <td><strong>${_esc(r.employee_name || '—')}</strong></td>
        <td><span class="comp-badge ${trackClass}">${_esc(r.training_track)}</span></td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${_esc(r.training_version || '—')}</td>
        <td>${_fmtDate(r.date_completed)}</td>
        <td style="${dueStyle}">${dueFmt}${isOverdue ? ' ⚠' : ''}</td>
        <td style="color:var(--muted)">${_esc(r.logged_by || '—')}</td>
        <td style="color:var(--muted);font-size:12px">${_esc(r.notes || '')}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="comp-tbl-wrap">
      <table class="comp-tbl">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Track</th>
            <th>Version</th>
            <th>Date Completed</th>
            <th>Next Due</th>
            <th>Logged By</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:0 2px">
      ${filtered.length} record${filtered.length !== 1 ? 's' : ''}
      ${q ? ` matching "${q}"` : ''}
      — Click any row to edit
    </div>
  `;
}

// ---- Training Modal ----
function openTrainingModal(id) {
  editingTrainingId = id || null;
  const rec = id ? trainingRecords.find(r => r.id === id) : null;

  // Employee options
  const empOptions = complianceEmployees.map(e =>
    `<option value="${e.id}" data-name="${_esc(e.name)}" ${rec?.employee_id === e.id ? 'selected' : ''}>${_esc(e.name)}${e.role ? ' — ' + e.role : ''}</option>`
  ).join('');

  // Calculate next_due_date default: Q4 of next calendar year
  const _defaultNextDue = () => {
    const ny = new Date().getFullYear() + 1;
    return `${ny}-12-31`;
  };

  const backdropId = 'trainingModalBackdrop';
  // Remove any existing
  const existing = document.getElementById(backdropId);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = backdropId;
  backdrop.onclick = (e) => { if (e.target === backdrop) closeTrainingModal(); };

  backdrop.innerHTML = `
    <div class="modal" style="width:560px">
      <div class="modal-header">
        <div class="modal-title">${rec ? '✏️ Edit Training Record' : '📚 Log Training Completion'}</div>
        <button class="modal-close" onclick="closeTrainingModal()">&#x2715;</button>
      </div>
      <div class="modal-body">

        <div class="field">
          <label class="field-label">Employee <span style="color:var(--red)">*</span></label>
          <select class="f-select" id="trEmpSelect" onchange="_trEmpSelectChange(this)">
            <option value="">— Select Employee —</option>
            ${empOptions}
          </select>
        </div>
        <div class="field" id="trEmpNameField" style="${rec && !rec.employee_id ? '' : 'display:none'}">
          <label class="field-label">Employee Name (manual override)</label>
          <input class="f-input" id="trEmpNameOverride" type="text" placeholder="Full legal name"
            value="${_esc(rec && !rec.employee_id ? rec.employee_name || '' : '')}" />
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">Training Track <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="trTrack">
              <option value="Standard" ${(!rec || rec.training_track === 'Standard') ? 'selected' : ''}>Standard (all CUI-authorized staff)</option>
              <option value="Admin" ${rec?.training_track === 'Admin' ? 'selected' : ''}>Admin (Owner / IT Administrator supplemental)</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label">Training Version <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="trVersion" type="text" placeholder="e.g. AT-2026-v1"
              value="${_esc(rec?.training_version || '')}" />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label class="field-label">Date Completed <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="trDateCompleted" type="date" style="color-scheme:light"
              value="${rec?.date_completed || new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="field">
            <label class="field-label">Next Due Date</label>
            <input class="f-input" id="trNextDue" type="date" style="color-scheme:light"
              value="${rec?.next_due_date || _defaultNextDue()}" />
          </div>
        </div>

        <div class="field">
          <label class="field-label">Logged By <span style="color:var(--red)">*</span></label>
          <input class="f-input" id="trLoggedBy" type="text" placeholder="Owner / IT Administrator"
            value="${_esc(rec?.logged_by || 'Owner / IT Administrator')}" />
        </div>

        <div class="field">
          <label class="field-label">Notes</label>
          <textarea class="f-textarea" id="trNotes" rows="2"
            placeholder="Optional: policy version covered, delivery method, etc.">${_esc(rec?.notes || '')}</textarea>
        </div>

        <div class="comp-policy-banner" style="margin-top:4px">
          <span class="comp-policy-icon">ℹ</span>
          <div style="font-size:11.5px">
            Standard track covers all CUI topics per AT policy Section 3.
            Admin track covers privileged-user topics per Section 4. Both are logged separately.
            Records are retained ≥ 3 years per AT policy Section 5.
          </div>
        </div>
      </div>
      <div class="modal-footer">
        ${rec ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="deleteTrainingRecord('${rec.id}')">🗑 Delete</button>` : ''}
        <button class="btn btn-ghost" onclick="closeTrainingModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveTrainingRecord()">
          ${rec ? 'Save Changes' : 'Log Completion'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function _trEmpSelectChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const nameOverrideField = document.getElementById('trEmpNameField');
  if (sel.value) {
    if (nameOverrideField) nameOverrideField.style.display = 'none';
  } else {
    if (nameOverrideField) nameOverrideField.style.display = '';
  }
}

function closeTrainingModal() {
  const backdrop = document.getElementById('trainingModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.remove(), 280);
  editingTrainingId = null;
}

async function saveTrainingRecord() {
  const empSel   = document.getElementById('trEmpSelect');
  const empId    = empSel?.value || null;
  const empOpt   = empSel?.options[empSel.selectedIndex];
  let empName    = empId ? (empOpt?.dataset?.name || empOpt?.text?.split(' —')[0] || '') : '';
  if (!empId) empName = (document.getElementById('trEmpNameOverride')?.value || '').trim();

  const track    = document.getElementById('trTrack')?.value;
  const version  = (document.getElementById('trVersion')?.value || '').trim();
  const dateComp = document.getElementById('trDateCompleted')?.value;
  const nextDue  = document.getElementById('trNextDue')?.value || null;
  const loggedBy = (document.getElementById('trLoggedBy')?.value || '').trim();
  const notes    = (document.getElementById('trNotes')?.value || '').trim();

  if (!empName) { alert('Please select an employee or enter a name.'); return; }
  if (!track)   { alert('Please select a training track.'); return; }
  if (!version) { alert('Please enter the training version.'); return; }
  if (!dateComp){ alert('Please enter the date completed.'); return; }
  if (!loggedBy){ alert('Please enter who logged this record.'); return; }

  const payload = {
    employee_id:      empId || null,
    employee_name:    empName,
    training_track:   track,
    training_version: version,
    date_completed:   dateComp,
    next_due_date:    nextDue || null,
    logged_by:        loggedBy,
    notes:            notes || null,
    updated_at:       new Date().toISOString(),
  };

  let err;
  if (editingTrainingId) {
    const res = await sb.from('cmmc_training_records').update(payload).eq('id', editingTrainingId);
    err = res.error;
  } else {
    const res = await sb.from('cmmc_training_records').insert({ ...payload, created_at: new Date().toISOString() });
    err = res.error;
  }

  if (err) { alert('Save failed: ' + err.message); return; }
  closeTrainingModal();
  toast('✅ Training record saved.');
  await _renderTrainingTab();
}

async function deleteTrainingRecord(id) {
  if (!confirm('Delete this training record? This cannot be undone.')) return;
  const { error } = await sb.from('cmmc_training_records').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  closeTrainingModal();
  toast('Training record deleted.');
  await _renderTrainingTab();
}


// ════════════════════════════════════════════════════════════════════
//  MODULE 2 — PLAN OF ACTION & MILESTONES  (CA.L2-3.12.2)
// ════════════════════════════════════════════════════════════════════
// Fields per CA policy Section 4:
//   POA&M ID | Practice ID | Practice Description | Deficiency Description | Status |
//   Interim Mitigating Control | Planned Corrective Action | Resources Required |
//   Responsible Party | Target Completion Date | Actual Completion Date |
//   Evidence of Completion | Date Opened | Source

const POAM_PRACTICES = [
  // AC — Access Control (22 practices)
  { id: 'AC.L1-3.1.1',  desc: 'Limit information system access to authorized users, processes acting on behalf of authorized users, and devices.' },
  { id: 'AC.L1-3.1.2',  desc: 'Limit information system access to the types of transactions and functions that authorized users are permitted to execute.' },
  { id: 'AC.L2-3.1.3',  desc: 'Control the flow of CUI in accordance with approved authorizations.' },
  { id: 'AC.L2-3.1.4',  desc: 'Separate the duties of individuals to reduce the risk of malevolent activity without collusion.' },
  { id: 'AC.L2-3.1.5',  desc: 'Employ the principle of least privilege, including for specific security functions and privileged accounts.' },
  { id: 'AC.L2-3.1.6',  desc: 'Use non-privileged accounts or roles when accessing non-security functions.' },
  { id: 'AC.L2-3.1.7',  desc: 'Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.' },
  { id: 'AC.L2-3.1.8',  desc: 'Limit unsuccessful logon attempts.' },
  { id: 'AC.L2-3.1.9',  desc: 'Provide privacy and security notices consistent with CUI rules.' },
  { id: 'AC.L2-3.1.10', desc: 'Use session lock with pattern-hiding displays after a period of inactivity.' },
  { id: 'AC.L2-3.1.11', desc: 'Terminate (automatically) a user session after a defined condition.' },
  { id: 'AC.L2-3.1.12', desc: 'Monitor and control remote access sessions.' },
  { id: 'AC.L2-3.1.13', desc: 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.' },
  { id: 'AC.L2-3.1.14', desc: 'Route remote access via managed access control points.' },
  { id: 'AC.L2-3.1.15', desc: 'Authorize remote execution of privileged commands and access to security-relevant information via remote access only for documented operational needs.' },
  { id: 'AC.L2-3.1.16', desc: 'Authorize wireless access prior to allowing such connections.' },
  { id: 'AC.L2-3.1.17', desc: 'Protect wireless access using authentication and encryption.' },
  { id: 'AC.L2-3.1.18', desc: 'Control connection of mobile devices.' },
  { id: 'AC.L2-3.1.19', desc: 'Encrypt CUI on mobile devices and mobile computing platforms.' },
  { id: 'AC.L2-3.1.20', desc: 'Verify and control/limit connections to external systems.' },
  { id: 'AC.L2-3.1.21', desc: 'Limit use of portable storage devices on external systems.' },
  { id: 'AC.L2-3.1.22', desc: 'Control CUI posted or processed on publicly accessible information systems.' },
  // AT — Awareness & Training (2 practices)
  { id: 'AT.L2-3.2.1',  desc: 'Ensure that managers, system administrators, and users of organizational systems are made aware of the security risks associated with their activities.' },
  { id: 'AT.L2-3.2.2',  desc: 'Ensure that personnel are trained to carry out their assigned information security responsibilities.' },
  // AU — Audit & Accountability (9 practices)
  { id: 'AU.L2-3.3.1',  desc: 'Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.' },
  { id: 'AU.L2-3.3.2',  desc: 'Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions.' },
  { id: 'AU.L2-3.3.3',  desc: 'Review and update logged events.' },
  { id: 'AU.L2-3.3.4',  desc: 'Alert in the event of an audit logging process failure.' },
  { id: 'AU.L2-3.3.5',  desc: 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.' },
  { id: 'AU.L2-3.3.6',  desc: 'Provide audit record reduction and report generation to support on-demand analysis and reporting.' },
  { id: 'AU.L2-3.3.7',  desc: 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.' },
  { id: 'AU.L2-3.3.8',  desc: 'Protect audit information and audit tools from unauthorized access, modification, and deletion.' },
  { id: 'AU.L2-3.3.9',  desc: 'Limit management of audit logging to a subset of privileged users.' },
  // CA — Security Assessment (4 practices)
  { id: 'CA.L2-3.12.1', desc: 'Periodically assess the security controls in organizational systems to determine if the controls are effective in their application.' },
  { id: 'CA.L2-3.12.2', desc: 'Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems.' },
  { id: 'CA.L2-3.12.3', desc: 'Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls.' },
  { id: 'CA.L2-3.12.4', desc: 'Develop, document, and periodically update system security plans.' },
  // CM — Configuration Management (9 practices)
  { id: 'CM.L2-3.4.1',  desc: 'Establish and maintain baseline configurations and inventories of organizational systems.' },
  { id: 'CM.L2-3.4.2',  desc: 'Establish and enforce security configuration settings for information technology products employed in organizational systems.' },
  { id: 'CM.L2-3.4.3',  desc: 'Track, review, approve, and log changes to organizational systems.' },
  { id: 'CM.L2-3.4.4',  desc: 'Analyze the security impact of changes prior to implementation.' },
  { id: 'CM.L2-3.4.5',  desc: 'Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems.' },
  { id: 'CM.L2-3.4.6',  desc: 'Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities.' },
  { id: 'CM.L2-3.4.7',  desc: 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services.' },
  { id: 'CM.L2-3.4.8',  desc: 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software.' },
  { id: 'CM.L2-3.4.9',  desc: 'Control and monitor user-installed software.' },
  // IA — Identification & Authentication (11 practices)
  { id: 'IA.L1-3.5.1',  desc: 'Identify information system users, processes acting on behalf of users, or devices.' },
  { id: 'IA.L1-3.5.2',  desc: 'Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.' },
  { id: 'IA.L2-3.5.3',  desc: 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.' },
  { id: 'IA.L2-3.5.4',  desc: 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.' },
  { id: 'IA.L2-3.5.5',  desc: 'Employ identifier management practices.' },
  { id: 'IA.L2-3.5.6',  desc: 'Employ authenticator management practices.' },
  { id: 'IA.L2-3.5.7',  desc: 'Enforce a minimum password complexity and change of characters when new passwords are created.' },
  { id: 'IA.L2-3.5.8',  desc: 'Prohibit password reuse for a specified number of generations.' },
  { id: 'IA.L2-3.5.9',  desc: 'Allow temporary password use for system logons with an immediate change to a permanent password.' },
  { id: 'IA.L2-3.5.10', desc: 'Store and transmit only cryptographically-protected passwords.' },
  { id: 'IA.L2-3.5.11', desc: 'Obscure feedback of authentication information.' },
  // IR — Incident Response (3 practices)
  { id: 'IR.L2-3.6.1',  desc: 'Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user activities.' },
  { id: 'IR.L2-3.6.2',  desc: 'Track, document, and report incidents to appropriate officials and/or authorities both internal and external to the organization.' },
  { id: 'IR.L2-3.6.3',  desc: 'Test the organizational incident response capability.' },
  // MA — Maintenance (6 practices)
  { id: 'MA.L2-3.7.1',  desc: 'Perform maintenance on organizational systems.' },
  { id: 'MA.L2-3.7.2',  desc: 'Provide controls on the tools, techniques, mechanisms, and personnel that perform maintenance on organizational systems.' },
  { id: 'MA.L2-3.7.3',  desc: 'Ensure equipment removed for off-site maintenance is sanitized.' },
  { id: 'MA.L2-3.7.4',  desc: 'Check media containing diagnostic and test programs for malicious code before the media are used in the systems.' },
  { id: 'MA.L2-3.7.5',  desc: 'Require MFA to establish nonlocal maintenance sessions via external networks and terminate such connections when nonlocal maintenance is complete.' },
  { id: 'MA.L2-3.7.6',  desc: 'Supervise the maintenance activities of maintenance personnel without required access authorization.' },
  // MP — Media Protection (9 practices)
  { id: 'MP.L1-3.8.1',  desc: 'Protect (physically control and securely store) system media containing CUI, both paper and digital.' },
  { id: 'MP.L1-3.8.2',  desc: 'Limit access to CUI on system media to authorized users.' },
  { id: 'MP.L2-3.8.3',  desc: 'Sanitize or destroy system media before disposal or reuse.' },
  { id: 'MP.L2-3.8.4',  desc: 'Mark media with necessary CUI markings and distribution limitations.' },
  { id: 'MP.L2-3.8.5',  desc: 'Control access to media containing CUI and maintain accountability for media during transport until destroyed or sanitized.' },
  { id: 'MP.L2-3.8.6',  desc: 'Implement cryptographic mechanisms to protect the confidentiality of CUI during transport.' },
  { id: 'MP.L2-3.8.7',  desc: 'Control the use of removable media on system components.' },
  { id: 'MP.L2-3.8.8',  desc: 'Prohibit the use of portable storage devices when such devices have no identifiable owner.' },
  { id: 'MP.L2-3.8.9',  desc: 'Protect the confidentiality of backup CUI at storage locations.' },
  // PE — Physical Protection (6 practices)
  { id: 'PE.L1-3.10.1', desc: 'Limit physical access to organizational systems, equipment, and the respective operating environments to authorized individuals.' },
  { id: 'PE.L1-3.10.2', desc: 'Protect and monitor the physical facility and support infrastructure for organizational systems.' },
  { id: 'PE.L2-3.10.3', desc: 'Escort visitors and monitor visitor activity.' },
  { id: 'PE.L2-3.10.4', desc: 'Maintain audit logs of physical access.' },
  { id: 'PE.L2-3.10.5', desc: 'Control and manage physical access devices.' },
  { id: 'PE.L2-3.10.6', desc: 'Enforce safeguarding measures for CUI at alternate work sites.' },
  // PS — Personnel Security (2 practices)
  { id: 'PS.L2-3.9.1',  desc: 'Screen individuals prior to authorizing access to organizational systems containing CUI.' },
  { id: 'PS.L2-3.9.2',  desc: 'Ensure that CUI is protected during and after personnel actions such as terminations and transfers.' },
  // RA — Risk Assessment (3 practices)
  { id: 'RA.L2-3.11.1', desc: 'Periodically assess the risk to organizational operations, organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.' },
  { id: 'RA.L2-3.11.2', desc: 'Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems and applications are identified.' },
  { id: 'RA.L2-3.11.3', desc: 'Remediate vulnerabilities in accordance with risk assessments.' },
  // SC — System & Communications Protection (16 practices)
  { id: 'SC.L1-3.13.1', desc: 'Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.' },
  { id: 'SC.L1-3.13.5', desc: 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.' },
  { id: 'SC.L2-3.13.2', desc: 'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security within organizational systems.' },
  { id: 'SC.L2-3.13.3', desc: 'Separate user functionality from system management functionality.' },
  { id: 'SC.L2-3.13.4', desc: 'Prevent unauthorized and unintended information transfer via shared system resources.' },
  { id: 'SC.L2-3.13.6', desc: 'Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).' },
  { id: 'SC.L2-3.13.7', desc: 'Prevent remote devices from simultaneously establishing connections with the system and other resources (i.e., split tunneling).' },
  { id: 'SC.L2-3.13.8', desc: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.' },
  { id: 'SC.L2-3.13.9', desc: 'Terminate network connections associated with communications sessions after a defined period of inactivity.' },
  { id: 'SC.L2-3.13.10',desc: 'Establish and manage cryptographic keys when cryptography is employed.' },
  { id: 'SC.L2-3.13.11',desc: 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.' },
  { id: 'SC.L2-3.13.12',desc: 'Prohibit remote activation of collaborative computing devices and provide indication of use to present users.' },
  { id: 'SC.L2-3.13.13',desc: 'Control and monitor the use of mobile code.' },
  { id: 'SC.L2-3.13.14',desc: 'Control and monitor the use of VoIP technologies.' },
  { id: 'SC.L2-3.13.15',desc: 'Protect the authenticity of communications sessions.' },
  { id: 'SC.L2-3.13.16',desc: 'Protect CUI at rest.' },
  // SI — System & Information Integrity (7 practices)
  { id: 'SI.L1-3.14.1', desc: 'Identify, report, and correct information and information system flaws in a timely manner.' },
  { id: 'SI.L1-3.14.2', desc: 'Provide protection from malicious code at appropriate locations within organizational information systems.' },
  { id: 'SI.L1-3.14.4', desc: 'Update malicious code protection mechanisms when new releases are available.' },
  { id: 'SI.L2-3.14.3', desc: 'Monitor system security alerts and advisories and take action in response.' },
  { id: 'SI.L2-3.14.5', desc: 'Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.' },
  { id: 'SI.L2-3.14.6', desc: 'Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.' },
  { id: 'SI.L2-3.14.7', desc: 'Identify unauthorized use of organizational systems.' },
];

const POAM_SOURCES = [
  'Self-Assessment', 'Risk Assessment', 'Incident Review',
  'Vulnerability Scan', 'Audit Log Review', 'Tabletop Exercise'
];

async function _renderPoamTab() {
  const area = document.getElementById('complianceTabContent');

  const { data, error } = await sb
    .from('cmmc_poam')
    .select('*')
    .order('date_opened', { ascending: false });
  poamRecords = data || [];
  if (error) console.error('POA&M load error:', error);

  const openCount      = poamRecords.filter(r => r.status === 'Open').length;
  const inProgCount    = poamRecords.filter(r => r.status === 'In Progress').length;
  const completedCount = poamRecords.filter(r => r.status === 'Completed').length;

  const today = new Date().toISOString().split('T')[0];
  const overdueCount = poamRecords.filter(r =>
    r.status !== 'Completed' && r.target_completion_date && r.target_completion_date < today
  ).length;

  area.innerHTML = `
    <div style="padding:28px 32px">

      <!-- Summary pills -->
      <div class="comp-stat-row">
        <div class="comp-stat-pill comp-stat-red">
          <div class="comp-stat-num">${openCount}</div>
          <div class="comp-stat-lbl">Open</div>
        </div>
        <div class="comp-stat-pill comp-stat-amber">
          <div class="comp-stat-num">${inProgCount}</div>
          <div class="comp-stat-lbl">In Progress</div>
        </div>
        <div class="comp-stat-pill comp-stat-green">
          <div class="comp-stat-num">${completedCount}</div>
          <div class="comp-stat-lbl">Completed</div>
        </div>
        ${overdueCount ? `<div class="comp-stat-pill comp-stat-red">
          <div class="comp-stat-num">${overdueCount}</div>
          <div class="comp-stat-lbl">Overdue</div>
        </div>` : ''}
        <div class="comp-stat-pill" style="margin-left:auto">
          <div class="comp-stat-num" style="font-family:'JetBrains Mono',monospace">
            ${110 - openCount - inProgCount} / 110
          </div>
          <div class="comp-stat-lbl">Practices Clear</div>
        </div>
      </div>

      <!-- Policy callout -->
      <div class="comp-policy-banner">
        <span class="comp-policy-icon">📌</span>
        <div>
          <strong>CA.L2-3.12.2</strong> — The POA&amp;M documents every deficiency identified through self-assessment,
          risk assessment, vulnerability scanning, incident review, or audit log review.
          Reviewed quarterly; updated immediately after any significant finding. Retained ≥ 3 years.
          An honest POA&amp;M with open items is always preferable to an inflated SPRS score.
        </div>
      </div>

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div style="display:flex;gap:6px">
          ${['all','Open','In Progress','Completed'].map(s => `
            <button class="comp-filter-btn${poamStatusFilter === s ? ' active' : ''}"
              onclick="poamStatusFilter='${s}';_renderPoamTable()">
              ${s === 'all' ? 'All' : s}
            </button>
          `).join('')}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button onclick="_refreshPoamTab()" class="comp-btn-ghost">↺ Refresh</button>
          <button onclick="openPoamModal()" class="comp-btn-primary">+ New POA&M Item</button>
        </div>
      </div>

      <!-- Table -->
      <div id="poamTableWrap"></div>
    </div>
  `;

  _renderPoamTable();
}

async function _refreshPoamTab() {
  await _renderPoamTab();
}

function _renderPoamTable() {
  const wrap = document.getElementById('poamTableWrap');
  if (!wrap) return;

  let filtered = poamRecords;
  if (poamStatusFilter !== 'all') {
    filtered = filtered.filter(r => r.status === poamStatusFilter);
  }

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">
      ${poamStatusFilter !== 'all' ? `No ${poamStatusFilter} items.` : 'No POA&M items yet. Click <strong>+ New POA&M Item</strong> to add the first deficiency.'}
    </div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  const statusBadge = (s) => {
    const map = {
      'Open':        'comp-badge-red',
      'In Progress': 'comp-badge-amber',
      'Completed':   'comp-badge-green',
    };
    return `<span class="comp-badge ${map[s] || ''}">${s}</span>`;
  };

  const rows = filtered.map(r => {
    const isOverdue = r.status !== 'Completed' && r.target_completion_date && r.target_completion_date < today;
    const targetFmt = r.target_completion_date ? _fmtDate(r.target_completion_date) : '—';
    const defSnip   = (r.deficiency_description || '').substring(0, 80) + ((r.deficiency_description || '').length > 80 ? '…' : '');
    return `
      <tr class="comp-tbl-row" onclick="openPoamModal('${r.id}')">
        <td><span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)">${_esc(r.poam_id)}</span></td>
        <td><strong style="font-size:12.5px">${_esc(r.practice_id)}</strong></td>
        <td style="color:var(--muted);font-size:12px;max-width:320px">${_esc(defSnip)}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="${isOverdue ? 'color:var(--red);font-weight:600' : ''}">${targetFmt}${isOverdue ? ' ⚠' : ''}</td>
        <td style="font-size:11.5px;color:var(--muted)">${_esc(r.source || '—')}</td>
        <td style="font-size:11.5px;color:var(--muted)">${_fmtDate(r.date_opened)}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="comp-tbl-wrap">
      <table class="comp-tbl">
        <thead>
          <tr>
            <th>POA&M ID</th>
            <th>Practice</th>
            <th>Deficiency</th>
            <th>Status</th>
            <th>Target Date</th>
            <th>Source</th>
            <th>Opened</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:0 2px">
      ${filtered.length} item${filtered.length !== 1 ? 's' : ''}
      ${poamStatusFilter !== 'all' ? ` · Status: ${poamStatusFilter}` : ''}
      — Click any row to view / edit
    </div>
  `;
}

// ---- POA&M Modal ----
function openPoamModal(id, prefill) {
  editingPoamId = id || null;
  const rec = id ? poamRecords.find(r => r.id === id) : (prefill || null);
  const isNew = !id;

  // Generate next POA&M ID
  const _nextPoamId = () => {
    const year = new Date().getFullYear();
    const nums = poamRecords
      .map(r => { const m = (r.poam_id || '').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
      .filter(Boolean);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `POAM-${year}-${String(next).padStart(3, '0')}`;
  };

  const practiceOptions = POAM_PRACTICES.map(p =>
    `<option value="${p.id}" data-desc="${_esc(p.desc)}" ${rec?.practice_id === p.id ? 'selected' : ''}>${p.id}</option>`
  ).join('');

  const sourceOptions = POAM_SOURCES.map(s =>
    `<option value="${s}" ${rec?.source === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const backdropId = 'poamModalBackdrop';
  const existing = document.getElementById(backdropId);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = backdropId;
  backdrop.onclick = (e) => { if (e.target === backdrop) closePoamModal(); };

  backdrop.innerHTML = `
    <div class="modal" style="width:700px;max-height:90vh">
      <div class="modal-header">
        <div class="modal-title">${!isNew && id ? `📋 ${rec.poam_id}` : '📋 New POA&M Item'}</div>
        <button class="modal-close" onclick="closePoamModal()">&#x2715;</button>
      </div>
      <div class="modal-body" style="gap:14px">

        <!-- Row 1: POA&M ID + Practice ID -->
        <div class="field-row">
          <div class="field" style="flex:0 0 180px">
            <label class="field-label">POA&amp;M ID <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="pmId" type="text" placeholder="POAM-2026-001"
              value="${_esc(rec?.poam_id || _nextPoamId())}"
              style="font-family:'JetBrains Mono',monospace;font-size:13px" />
          </div>
          <div class="field">
            <label class="field-label">Practice ID <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="pmPracticeId" onchange="_pmPracticeChange(this)">
              <option value="">— Select Practice —</option>
              ${practiceOptions}
            </select>
          </div>
          <div class="field" style="flex:0 0 160px">
            <label class="field-label">Status <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="pmStatus" onchange="_pmStatusChange(this)">
              <option value="Open"        ${(!rec || rec.status === 'Open')        ? 'selected' : ''}>Open</option>
              <option value="In Progress" ${rec?.status === 'In Progress'          ? 'selected' : ''}>In Progress</option>
              <option value="Completed"   ${rec?.status === 'Completed'            ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </div>

        <!-- Practice description (auto-filled) -->
        <div class="field">
          <label class="field-label">Practice Description</label>
          <textarea class="f-textarea" id="pmPracticeDesc" rows="2"
            placeholder="Auto-filled when Practice ID is selected, or enter manually.">${_esc(rec?.practice_description || '')}</textarea>
        </div>

        <!-- Deficiency -->
        <div class="field">
          <label class="field-label">Deficiency Description <span style="color:var(--red)">*</span></label>
          <textarea class="f-textarea" id="pmDeficiency" rows="3"
            placeholder="Specific description of what is not implemented or partially implemented and why.">${_esc(rec?.deficiency_description || '')}</textarea>
        </div>

        <!-- Interim mitigating control -->
        <div class="field">
          <label class="field-label">Interim Mitigating Control</label>
          <textarea class="f-textarea" id="pmInterim" rows="2"
            placeholder="Any compensating or mitigating control currently in place to reduce risk while this item is open.">${_esc(rec?.interim_mitigating_control || '')}</textarea>
        </div>

        <!-- Planned corrective action -->
        <div class="field">
          <label class="field-label">Planned Corrective Action <span style="color:var(--red)">*</span></label>
          <textarea class="f-textarea" id="pmAction" rows="3"
            placeholder="The specific steps that will be taken to fully implement the practice.">${_esc(rec?.planned_corrective_action || '')}</textarea>
        </div>

        <!-- Resources + Responsible Party -->
        <div class="field-row">
          <div class="field">
            <label class="field-label">Resources Required</label>
            <input class="f-input" id="pmResources" type="text"
              placeholder="e.g. IT time, software license, budget"
              value="${_esc(rec?.resources_required || '')}" />
          </div>
          <div class="field">
            <label class="field-label">Responsible Party</label>
            <input class="f-input" id="pmResponsible" type="text"
              placeholder="Owner / IT Administrator"
              value="${_esc(rec?.responsible_party || 'Owner / IT Administrator')}" />
          </div>
        </div>

        <!-- Dates row -->
        <div class="field-row">
          <div class="field">
            <label class="field-label">Date Opened <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="pmDateOpened" type="date" style="color-scheme:light"
              value="${rec?.date_opened || new Date().toISOString().split('T')[0]}" />
          </div>
          <div class="field">
            <label class="field-label">Target Completion Date</label>
            <input class="f-input" id="pmTargetDate" type="date" style="color-scheme:light"
              value="${rec?.target_completion_date || ''}" />
          </div>
          <div class="field">
            <label class="field-label">Source <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="pmSource">
              <option value="">— Select —</option>
              ${sourceOptions}
            </select>
          </div>
        </div>

        <!-- Completion section (conditionally shown) -->
        <div id="pmCompletionSection" style="${rec?.status === 'Completed' ? '' : 'display:none'}">
          <div class="modal-div" style="margin-bottom:14px"></div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:12px">
            ✅ Completion Details
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field-label">Actual Completion Date</label>
              <input class="f-input" id="pmActualDate" type="date" style="color-scheme:light"
                value="${rec?.actual_completion_date || ''}" />
            </div>
            <div class="field" style="flex:2">
              <label class="field-label">Evidence of Completion</label>
              <input class="f-input" id="pmEvidence" type="text"
                placeholder="Reference to documentation or config confirming full implementation"
                value="${_esc(rec?.evidence_of_completion || '')}" />
            </div>
          </div>
        </div>

      </div>
      <div class="modal-footer">
        ${id ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="deletePoamRecord('${rec.id}')">🗑 Delete</button>` : ''}
        <button class="btn btn-ghost" onclick="closePoamModal()">Cancel</button>
        <button class="btn btn-primary" onclick="savePoamRecord()">
          ${id ? 'Save Changes' : 'Add to POA&M'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function _pmPracticeChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  const desc = opt?.dataset?.desc || '';
  const ta = document.getElementById('pmPracticeDesc');
  if (ta && !ta.value) ta.value = desc;
}

function _pmStatusChange(sel) {
  const section = document.getElementById('pmCompletionSection');
  if (section) section.style.display = sel.value === 'Completed' ? '' : 'none';
  if (sel.value === 'Completed') {
    const actDate = document.getElementById('pmActualDate');
    if (actDate && !actDate.value) actDate.value = new Date().toISOString().split('T')[0];
  }
}

function closePoamModal() {
  const backdrop = document.getElementById('poamModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.remove(), 280);
  editingPoamId = null;
}

async function savePoamRecord() {
  const poamId   = (document.getElementById('pmId')?.value || '').trim();
  const practId  = document.getElementById('pmPracticeId')?.value;
  const practDesc = (document.getElementById('pmPracticeDesc')?.value || '').trim();
  const defic    = (document.getElementById('pmDeficiency')?.value || '').trim();
  const status   = document.getElementById('pmStatus')?.value;
  const interim  = (document.getElementById('pmInterim')?.value || '').trim();
  const action   = (document.getElementById('pmAction')?.value || '').trim();
  const resources = (document.getElementById('pmResources')?.value || '').trim();
  const responsible = (document.getElementById('pmResponsible')?.value || '').trim();
  const dateOpened = document.getElementById('pmDateOpened')?.value;
  const targetDate = document.getElementById('pmTargetDate')?.value || null;
  const source   = document.getElementById('pmSource')?.value;
  const actualDate = document.getElementById('pmActualDate')?.value || null;
  const evidence = (document.getElementById('pmEvidence')?.value || '').trim();

  if (!poamId)  { alert('Please enter a POA&M ID.'); return; }
  if (!practId) { alert('Please select a Practice ID.'); return; }
  if (!defic)   { alert('Please describe the deficiency.'); return; }
  if (!action)  { alert('Please enter the planned corrective action.'); return; }
  if (!dateOpened){ alert('Please enter the date opened.'); return; }
  if (!source)  { alert('Please select the source of this finding.'); return; }

  const payload = {
    poam_id:                    poamId,
    practice_id:                practId,
    practice_description:       practDesc || null,
    deficiency_description:     defic,
    status:                     status,
    interim_mitigating_control: interim || null,
    planned_corrective_action:  action,
    resources_required:         resources || null,
    responsible_party:          responsible || 'Owner / IT Administrator',
    date_opened:                dateOpened,
    target_completion_date:     targetDate,
    actual_completion_date:     status === 'Completed' ? (actualDate || null) : null,
    evidence_of_completion:     status === 'Completed' ? (evidence || null) : null,
    source:                     source,
    updated_at:                 new Date().toISOString(),
  };

  let err;
  if (editingPoamId) {
    const res = await sb.from('cmmc_poam').update(payload).eq('id', editingPoamId);
    err = res.error;
  } else {
    const res = await sb.from('cmmc_poam').insert({ ...payload, created_at: new Date().toISOString() });
    err = res.error;
  }

  if (err) { alert('Save failed: ' + err.message); return; }
  closePoamModal();
  toast('📋 POA&M item saved.');
  await _renderPoamTab();
}

async function deletePoamRecord(id) {
  if (!confirm('Delete this POA&M item? This cannot be undone.')) return;
  const { error } = await sb.from('cmmc_poam').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  closePoamModal();
  toast('POA&M item deleted.');
  await _renderPoamTab();
}


// ===== STATE additions for Self-Assessment =====
let assessmentRecords = {};   // keyed by practice_id: { id, status, evidence, scored_by, date_assessed }
let assessmentYear = new Date().getFullYear();
let assessmentDomainCollapsed = {}; // keyed by domain abbrev
let assessmentSearchVal = '';
let assessmentStatusFilter = 'all'; // all | MET | PARTIAL | NOT MET | unscored

function _renderComingSoonTab(tab) {
  const labels = {
    incidents:     '🚨 Incident Records',
    personnel:     '👤 HR / Personnel Records',
    maintenance:   '🔧 Maintenance Records',
    mediadisposal: '🗑️ Media Disposal Records',
    changelog:     '📝 CUI System Change Log',
  };
  const area = document.getElementById('complianceTabContent');
  area.innerHTML = `
    <div style="padding:60px 32px;text-align:center">
      <div style="font-size:36px;margin-bottom:16px">${labels[tab]?.split(' ')[0] || '📋'}</div>
      <div style="font-size:18px;font-family:'DM Serif Display',serif;color:var(--text);margin-bottom:8px">
        ${labels[tab] || tab} — Coming Next
      </div>
      <div style="font-size:13px;color:var(--muted);max-width:480px;margin:0 auto;line-height:1.7">
        This module is part of the CMMC 2.0 Level 2 compliance suite and will be implemented in the next build phase.
        Field structures are defined in the NU Laboratories SSP policy documents.
      </div>
    </div>
  `;
}


// ════════════════════════════════════════════════════════════════════
//  MODULE 3 — NIST SP 800-171 SELF-ASSESSMENT  (CA.L2-3.12.1)
// ════════════════════════════════════════════════════════════════════
// 110 practices across 14 domains scored MET / PARTIAL / NOT MET.
// SPRS score auto-calculated. PARTIAL/NOT MET items push to POA&M.
// Source: CA Policy §3 — Annual Self-Assessment Procedure.

// DoD SPRS point values per practice (110 total, deducted when NOT MET)
// Each practice = 1 point except weighted practices per NIST methodology.
// Using simplified 1-pt-per-practice model (common for small orgs).
const ASSESSMENT_DOMAINS = [
  { abbrev: 'AC', name: 'Access Control',                    practices: ['AC.L1-3.1.1','AC.L1-3.1.2','AC.L2-3.1.3','AC.L2-3.1.4','AC.L2-3.1.5','AC.L2-3.1.6','AC.L2-3.1.7','AC.L2-3.1.8','AC.L2-3.1.9','AC.L2-3.1.10','AC.L2-3.1.11','AC.L2-3.1.12','AC.L2-3.1.13','AC.L2-3.1.14','AC.L2-3.1.15','AC.L2-3.1.16','AC.L2-3.1.17','AC.L2-3.1.18','AC.L2-3.1.19','AC.L2-3.1.20','AC.L2-3.1.21','AC.L2-3.1.22'] },
  { abbrev: 'AT', name: 'Awareness & Training',              practices: ['AT.L2-3.2.1','AT.L2-3.2.2'] },
  { abbrev: 'AU', name: 'Audit & Accountability',            practices: ['AU.L2-3.3.1','AU.L2-3.3.2','AU.L2-3.3.3','AU.L2-3.3.4','AU.L2-3.3.5','AU.L2-3.3.6','AU.L2-3.3.7','AU.L2-3.3.8','AU.L2-3.3.9'] },
  { abbrev: 'CA', name: 'Security Assessment',               practices: ['CA.L2-3.12.1','CA.L2-3.12.2','CA.L2-3.12.3','CA.L2-3.12.4'] },
  { abbrev: 'CM', name: 'Configuration Management',          practices: ['CM.L2-3.4.1','CM.L2-3.4.2','CM.L2-3.4.3','CM.L2-3.4.4','CM.L2-3.4.5','CM.L2-3.4.6','CM.L2-3.4.7','CM.L2-3.4.8','CM.L2-3.4.9'] },
  { abbrev: 'IA', name: 'Identification & Authentication',   practices: ['IA.L1-3.5.1','IA.L1-3.5.2','IA.L2-3.5.3','IA.L2-3.5.4','IA.L2-3.5.5','IA.L2-3.5.6','IA.L2-3.5.7','IA.L2-3.5.8','IA.L2-3.5.9','IA.L2-3.5.10','IA.L2-3.5.11'] },
  { abbrev: 'IR', name: 'Incident Response',                 practices: ['IR.L2-3.6.1','IR.L2-3.6.2','IR.L2-3.6.3'] },
  { abbrev: 'MA', name: 'Maintenance',                       practices: ['MA.L2-3.7.1','MA.L2-3.7.2','MA.L2-3.7.3','MA.L2-3.7.4','MA.L2-3.7.5','MA.L2-3.7.6'] },
  { abbrev: 'MP', name: 'Media Protection',                  practices: ['MP.L1-3.8.1','MP.L1-3.8.2','MP.L2-3.8.3','MP.L2-3.8.4','MP.L2-3.8.5','MP.L2-3.8.6','MP.L2-3.8.7','MP.L2-3.8.8','MP.L2-3.8.9'] },
  { abbrev: 'PE', name: 'Physical Protection',               practices: ['PE.L1-3.10.1','PE.L1-3.10.2','PE.L2-3.10.3','PE.L2-3.10.4','PE.L2-3.10.5','PE.L2-3.10.6'] },
  { abbrev: 'PS', name: 'Personnel Security',                practices: ['PS.L2-3.9.1','PS.L2-3.9.2'] },
  { abbrev: 'RA', name: 'Risk Assessment',                   practices: ['RA.L2-3.11.1','RA.L2-3.11.2','RA.L2-3.11.3'] },
  { abbrev: 'SC', name: 'System & Communications Protection',practices: ['SC.L1-3.13.1','SC.L1-3.13.5','SC.L2-3.13.2','SC.L2-3.13.3','SC.L2-3.13.4','SC.L2-3.13.6','SC.L2-3.13.7','SC.L2-3.13.8','SC.L2-3.13.9','SC.L2-3.13.10','SC.L2-3.13.11','SC.L2-3.13.12','SC.L2-3.13.13','SC.L2-3.13.14','SC.L2-3.13.15','SC.L2-3.13.16'] },
  { abbrev: 'SI', name: 'System & Information Integrity',    practices: ['SI.L1-3.14.1','SI.L1-3.14.2','SI.L1-3.14.4','SI.L2-3.14.3','SI.L2-3.14.5','SI.L2-3.14.6','SI.L2-3.14.7'] },
];

// DoD SPRS point values — officially assigned per NIST 800-171A
// Source: DoD Assessment Methodology v1.2.1
const SPRS_POINTS = {
  'AC.L1-3.1.1':1,'AC.L1-3.1.2':1,'AC.L2-3.1.3':3,'AC.L2-3.1.4':5,'AC.L2-3.1.5':3,
  'AC.L2-3.1.6':3,'AC.L2-3.1.7':5,'AC.L2-3.1.8':3,'AC.L2-3.1.9':1,'AC.L2-3.1.10':3,
  'AC.L2-3.1.11':3,'AC.L2-3.1.12':3,'AC.L2-3.1.13':5,'AC.L2-3.1.14':3,'AC.L2-3.1.15':3,
  'AC.L2-3.1.16':3,'AC.L2-3.1.17':5,'AC.L2-3.1.18':3,'AC.L2-3.1.19':5,'AC.L2-3.1.20':3,
  'AC.L2-3.1.21':3,'AC.L2-3.1.22':3,
  'AT.L2-3.2.1':5,'AT.L2-3.2.2':5,
  'AU.L2-3.3.1':5,'AU.L2-3.3.2':5,'AU.L2-3.3.3':3,'AU.L2-3.3.4':3,'AU.L2-3.3.5':3,
  'AU.L2-3.3.6':1,'AU.L2-3.3.7':1,'AU.L2-3.3.8':3,'AU.L2-3.3.9':1,
  'CA.L2-3.12.1':5,'CA.L2-3.12.2':5,'CA.L2-3.12.3':3,'CA.L2-3.12.4':3,
  'CM.L2-3.4.1':3,'CM.L2-3.4.2':3,'CM.L2-3.4.3':3,'CM.L2-3.4.4':3,'CM.L2-3.4.5':3,
  'CM.L2-3.4.6':3,'CM.L2-3.4.7':3,'CM.L2-3.4.8':3,'CM.L2-3.4.9':3,
  'IA.L1-3.5.1':1,'IA.L1-3.5.2':1,'IA.L2-3.5.3':5,'IA.L2-3.5.4':3,'IA.L2-3.5.5':3,
  'IA.L2-3.5.6':3,'IA.L2-3.5.7':5,'IA.L2-3.5.8':3,'IA.L2-3.5.9':1,'IA.L2-3.5.10':3,
  'IA.L2-3.5.11':1,
  'IR.L2-3.6.1':5,'IR.L2-3.6.2':5,'IR.L2-3.6.3':3,
  'MA.L2-3.7.1':3,'MA.L2-3.7.2':3,'MA.L2-3.7.3':3,'MA.L2-3.7.4':3,'MA.L2-3.7.5':3,
  'MA.L2-3.7.6':3,
  'MP.L1-3.8.1':1,'MP.L1-3.8.2':1,'MP.L2-3.8.3':5,'MP.L2-3.8.4':1,'MP.L2-3.8.5':3,
  'MP.L2-3.8.6':3,'MP.L2-3.8.7':3,'MP.L2-3.8.8':1,'MP.L2-3.8.9':3,
  'PE.L1-3.10.1':1,'PE.L1-3.10.2':1,'PE.L2-3.10.3':3,'PE.L2-3.10.4':1,'PE.L2-3.10.5':1,
  'PE.L2-3.10.6':3,
  'PS.L2-3.9.1':3,'PS.L2-3.9.2':3,
  'RA.L2-3.11.1':3,'RA.L2-3.11.2':5,'RA.L2-3.11.3':5,
  'SC.L1-3.13.1':1,'SC.L1-3.13.5':1,'SC.L2-3.13.2':3,'SC.L2-3.13.3':3,'SC.L2-3.13.4':3,
  'SC.L2-3.13.6':3,'SC.L2-3.13.7':3,'SC.L2-3.13.8':5,'SC.L2-3.13.9':1,'SC.L2-3.13.10':3,
  'SC.L2-3.13.11':5,'SC.L2-3.13.12':1,'SC.L2-3.13.13':1,'SC.L2-3.13.14':1,'SC.L2-3.13.15':3,
  'SC.L2-3.13.16':5,
  'SI.L1-3.14.1':1,'SI.L1-3.14.2':1,'SI.L1-3.14.4':1,'SI.L2-3.14.3':3,'SI.L2-3.14.5':3,
  'SI.L2-3.14.6':5,'SI.L2-3.14.7':5,
};

// NU Laboratories-specific evidence suggestions for all 110 practices.
// Auto-filled when MET is clicked (editable). Empty for PARTIAL/NOT MET so you describe the gap.
const ASSESSMENT_EVIDENCE = {
  // ── AC — Access Control ─────────────────────────────────────────────────────
  'AC.L1-3.1.1':  'Active Directory unique named accounts for all users; no shared/generic accounts on CUI systems; CUI VLAN restricts device access to domain-joined IT-managed endpoints; CUI access inventory maintained and reviewed annually.',
  'AC.L1-3.1.2':  'Standard AD accounts limited to job-required files/folders via Group Policy; users cannot install software or modify system settings; NAS share permissions set per individual user; GPOs restrict unauthorized system functions.',
  'AC.L2-3.1.3':  'CUI stored exclusively on Synology NAS within CUI VLAN; external transmission via Synology C2 Transfer only; email (Google Workspace) prohibited for CUI; hardware firewall and CUI VLAN architecture prevent unauthorized CUI flows to other network segments.',
  'AC.L2-3.1.4':  'Owner/IT Administrator (rmcadoo@nulabs.com) is sole individual with admin access to AD, NAS, and firewall; all other employees hold standard non-privileged accounts; admin actions logged under dedicated admin account; CUI access inventory reviewed annually.',
  'AC.L2-3.1.5':  'Standard users provisioned with minimum NAS share permissions for job role only; no local admin rights on CUI workstations; Owner uses separate admin account (rmcadoo@nulabs.com) for privileged functions only; CUI access inventory documents specific access granted to each user.',
  'AC.L2-3.1.6':  'Admin account (rmcadoo@nulabs.com) used exclusively for IT administration — never for personal email/web browsing; personal account (rmcadoo@gmail.com) has no access to NU Laboratories systems; all other employees use standard non-privileged accounts for all work functions.',
  'AC.L2-3.1.7':  'Standard users cannot execute privileged functions on CUI systems — enforced via Group Policy; all privileged actions performed under rmcadoo@nulabs.com; privilege use captured in Windows Security Event Logs and forwarded to Blumira SIEM.',
  'AC.L2-3.1.8':  'Account lockout enforced via Group Policy — account locked after defined failed login attempts; lockout duration requires admin unlock; failed login attempts logged in Windows Security Event Logs and monitored via Blumira SIEM.',
  'AC.L2-3.1.9':  'Authorized use only login banner displayed at Windows workstation login via Group Policy (Interactive logon: Message text); banner informs users of monitoring and authorized use requirements.',
  'AC.L2-3.1.10': 'Automatic screen lock enforced via Group Policy after inactivity period (screen saver with password); employees trained to lock manually using Windows+L when stepping away per annual AT training.',
  'AC.L2-3.1.11': 'Automatic session timeout enforced via Group Policy for idle sessions; screen saver with password protection activates after defined inactivity; users must re-authenticate after session termination.',
  'AC.L2-3.1.12': 'NOT APPLICABLE — CUI systems are on-premises only; no remote access to CUI is permitted from external networks. Remote maintenance by external parties also prohibited per MA policy. Reviewed annually.',
  'AC.L2-3.1.13': 'NOT APPLICABLE — No remote access to CUI systems is permitted. CUI environment is on-premises only. Reviewed annually.',
  'AC.L2-3.1.14': 'NOT APPLICABLE — No remote access to CUI systems is permitted. CUI environment is on-premises only. Reviewed annually.',
  'AC.L2-3.1.15': 'NOT APPLICABLE — No remote access to CUI systems is permitted. CUI environment is on-premises only. Reviewed annually.',
  'AC.L2-3.1.16': 'NOT APPLICABLE — CUI environment does not use wireless connectivity. Reviewed annually.',
  'AC.L2-3.1.17': 'NOT APPLICABLE — CUI environment does not use wireless connectivity. Reviewed annually.',
  'AC.L2-3.1.18': 'NOT APPLICABLE — Mobile devices are not permitted to connect to or access CUI systems or the CUI VLAN. Reviewed annually.',
  'AC.L2-3.1.19': 'NOT APPLICABLE — CUI is not stored on or accessed from mobile devices. Reviewed annually.',
  'AC.L2-3.1.20': 'Hardware firewall controls all connections to external systems from CUI environment; external CUI transfer limited exclusively to Synology C2 Transfer; no other external system connections from CUI environment permitted; approved external connections reviewed annually.',
  'AC.L2-3.1.21': 'Group Policy controls removable media access on domain-joined CUI workstations; portable storage requires IT authorization and encryption; employees trained on prohibition of personal USB devices on CUI systems per annual AT training.',
  'AC.L2-3.1.22': 'NU Laboratories does not operate publicly accessible systems that process CUI; all public-facing content reviewed by Owner prior to publication; employees trained that CUI must never be posted to public-facing systems.',
  // ── AT — Awareness & Training ───────────────────────────────────────────────
  'AT.L2-3.2.1':  'Annual security awareness training via owner-developed PowerPoint/PDF; covers CUI identification, approved channels, phishing awareness, physical security, session lock, removable media, insider threat, and incident reporting; completed before first CUI access (new hires) and annually each Q4; completion logged in NUWorkspace with employee name, version, date, and next due date.',
  'AT.L2-3.2.2':  'Standard training for all CUI-authorized personnel; supplemental Admin track for Owner/IT Administrator covering Active Directory security, audit log review, cryptographic key management, firewall administration, IR procedures, and patch management; both tracks logged separately in NUWorkspace HR/PM System.',
  // ── AU — Audit & Accountability ─────────────────────────────────────────────
  'AU.L2-3.3.1':  'Blumira cloud SIEM ingests logs from all CUI systems: Windows Security Event Logs, Synology NAS audit logs, hardware firewall logs, and WithSecure Elements Security Center; 1-year cloud retention in tamper-resistant storage; local logs retained 90 days on each system; Blumira pre-built CMMC 2.0 compliance reports provide ready-made assessment evidence.',
  'AU.L2-3.3.2':  'All CUI system accounts are unique named accounts — no shared/generic accounts; every log entry includes specific user account, timestamp, and system identifier; admin actions logged under dedicated rmcadoo@nulabs.com account providing clean attributable audit trail for all privileged activity.',
  'AU.L2-3.3.3':  'Owner/IT Administrator monitors logs in real time via Blumira alerts and reviews Blumira dashboard monthly; Blumira continuously applies pre-built detection rules across all log sources; monthly review examines detection findings, open alerts, and CMMC compliance report status; anomalies escalated to IR process.',
  'AU.L2-3.3.4':  'Blumira monitors log ingestion health from all connected CUI systems and alerts Owner/IT Administrator if a log source stops sending data; Windows Event Log size configured via Group Policy; Synology NAS generates notifications when storage capacity is approached; audit logging failures treated as high-priority findings requiring immediate remediation.',
  'AU.L2-3.3.5':  'Blumira cloud SIEM provides automated cross-source log correlation across Windows, NAS, firewall, and WithSecure logs; Blumira detection rules identify multi-source attack patterns; correlated findings trigger real-time alerts with guided response playbooks; CMMC 2.0 compliance report generated monthly.',
  'AU.L2-3.3.6':  'Blumira provides searchable log query interface for on-demand analysis and report generation; Owner/IT Administrator can query across all ingested log sources; Blumira pre-built reports support compliance reporting and incident investigation; log data exportable for external analysis.',
  'AU.L2-3.3.7':  'All Windows endpoints synchronized to authoritative NTP time source via Windows Time Service (w32tm) configured by Group Policy; Synology NAS synchronized via NTP in DSM network settings; hardware firewall configured for NTP; consistent timestamps across all log sources verified quarterly.',
  'AU.L2-3.3.8':  'Blumira cloud SIEM stores logs in tamper-resistant cloud storage — standard accounts cannot modify or delete Blumira log data; Windows Security Event Logs protected via Group Policy preventing standard users from clearing logs; NAS audit logs accessible only to NAS administrators; firewall logs accessible only via admin interface.',
  'AU.L2-3.3.9':  'Audit log management restricted exclusively to Owner/IT Administrator (rmcadoo@nulabs.com); standard users have no access to log management interfaces on any CUI system; enforced via AD Group Policy, NAS admin role restrictions, firewall access controls, and WithSecure Elements admin role assignment.',
  // ── CA — Security Assessment ─────────────────────────────────────────────────
  'CA.L2-3.12.1': 'Annual self-assessment conducted each Q4 by Owner/IT Administrator; all 110 NIST SP 800-171 Rev 2 practices scored MET/PARTIAL/NOT MET with evidence; documented in NUWorkspace HR/PM System; SPRS score calculated and submitted to sprs.apps.mil; findings drive POA&M updates.',
  'CA.L2-3.12.2': 'POA&M maintained in NUWorkspace HR/PM System; documents every deficiency identified through self-assessment, risk assessment, vulnerability scanning, incident review, and audit log review; reviewed and updated quarterly; completed items closed with evidence reference; active POA&M demonstrates ongoing compliance management.',
  'CA.L2-3.12.3': 'Continuous monitoring via Blumira SIEM (real-time threat detection), WithSecure EPP (endpoint behavioral analysis), and WithSecure EVM (continuous vulnerability scanning); monthly Blumira dashboard review, WithSecure console review, and CUI access inventory review; quarterly POA&M review and firewall rule review; any degraded control added to POA&M immediately.',
  'CA.L2-3.12.4': 'System Security Plan maintained as complete set of 14 domain policy documents in NUWorkspace HR/PM System and stored on Synology NAS within CUI boundary; reviewed and updated annually each Q4; updated off-cycle upon any significant change to CUI environment, personnel, or applicable requirements.',
  // ── CM — Configuration Management ───────────────────────────────────────────
  'CM.L2-3.4.1':  'Written baseline configuration maintained in HR/PM System for Windows endpoints, Synology NAS, and hardware firewall; documents security settings, enabled features, disabled services, installed software, and network configuration; updated whenever significant change is made; reviewed quarterly and during annual risk assessment.',
  'CM.L2-3.4.2':  'Security settings enforced via AD Group Policy: account lockout, password complexity, screen lock/timeout, audit logging, BitLocker, software restrictions, Windows Defender Firewall, and USB controls; Synology NAS security configured via DSM (encrypted volumes, share permissions, account policies, audit logging); hardware firewall enforces default-deny posture; settings verified quarterly.',
  'CM.L2-3.4.3':  'All significant CUI system changes documented in HR/PM System change log (CHG-YYYY-### format) before or immediately after implementation; Owner/IT Administrator is sole authorized individual to make configuration changes; change log captures date, system, description, reason, and sign-off; reviewed quarterly.',
  'CM.L2-3.4.4':  'Security impact assessed before implementing any significant CUI system change; evaluation considers attack surface expansion, security control modifications, network segmentation impact, and baseline/SSP update requirements; significant-impact changes documented in change log entry; changes introducing unacceptable risk deferred until mitigating controls identified.',
  'CM.L2-3.4.5':  'Physical and logical access to make configuration changes restricted exclusively to Owner/IT Administrator (rmcadoo@nulabs.com); standard users cannot install software, modify GPOs, change NAS configuration, access firewall management, or alter system security settings; enforced via AD privilege assignments, Group Policy, NAS admin role controls, and firewall access controls.',
  'CM.L2-3.4.6':  'CUI workstations configured with only capabilities required for authorized business functions; unnecessary Windows services and protocols disabled via Group Policy; Synology NAS has only required DSM packages/services enabled; hardware firewall default-deny permits only required traffic; enabled services reviewed annually.',
  'CM.L2-3.4.7':  'Nonessential programs, ports, protocols, and services restricted/disabled on all CUI systems via Group Policy; hardware firewall blocks all ports and protocols not explicitly required for business operations; Synology NAS unused file protocols disabled; approved software inventory reviewed annually and unused software removed.',
  'CM.L2-3.4.8':  'Standard users prevented by Group Policy from installing any software not pre-approved by Owner/IT Administrator; approved software inventory documents all authorized CUI workstation software; WithSecure EPP provides additional application-level protection via behavioral analysis detecting unauthorized software execution; inventory reviewed annually.',
  'CM.L2-3.4.9':  'Standard users cannot install software on CUI workstations — Group Policy enforces this restriction; all software installation requires rmcadoo@nulabs.com elevated account; new software requests evaluated for security impact before installation and added to approved software inventory; WithSecure EPP monitors running processes and alerts on unauthorized software execution.',
  // ── IA — Identification & Authentication ────────────────────────────────────
  'IA.L1-3.5.1':  'Every user assigned unique named Active Directory account before receiving any system access; shared/generic accounts prohibited on CUI systems; each Duo MFA enrollment tied to specific named user account; CUI access inventory maintained with all active accounts; reviewed quarterly and updated immediately upon personnel changes.',
  'IA.L1-3.5.2':  'Authentication required before access granted to any CUI system; users must complete both factors — AD password and Duo MFA approval — before access granted; applies to Windows workstation login, VPN, and RDP; failed authentication attempts logged in Windows Security Event Logs and monitored via Blumira; accounts locked after repeated failures per lockout policy.',
  'IA.L2-3.5.3':  'Cisco Duo MFA enforced for all user accounts (privileged and non-privileged) across all three access vectors: Windows workstation login, VPN, and RDP; authentication requires password + Duo authenticator app push approval or TOTP; access denied if MFA cannot be satisfied; Duo policies configured to deny access without successful MFA completion.',
  'IA.L2-3.5.4':  'Duo Security authentication is inherently replay-resistant; each Duo push notification generates a unique time-limited challenge expiring after single use; TOTP codes valid for single authentication event and cannot be reused; intercepted credentials or tokens cannot be replayed to gain unauthorized access.',
  'IA.L2-3.5.5':  'Unique named AD accounts assigned to each individual; shared/generic accounts prohibited; accounts disabled (not deleted) upon separation to preserve audit log continuity; CUI access inventory tracks all active identifiers; account lifecycle managed exclusively by Owner/IT Administrator; periodic review ensures no orphaned accounts.',
  'IA.L2-3.5.6':  'Passwords governed by AD Group Policy (minimum length, complexity, history); Duo MFA enrollment managed exclusively by Owner/IT Administrator; lost/replaced devices reported immediately and Duo enrollment updated; MFA enrollment reviewed quarterly against employee roster; no self-service MFA changes permitted.',
  'IA.L2-3.5.7':  'Minimum password length and complexity enforced via AD Group Policy (minimum length, uppercase, lowercase, numbers, special characters required); complexity requirements reviewed annually as part of year-end review cycle.',
  'IA.L2-3.5.8':  'Password history enforced via AD Group Policy — users cannot reuse passwords for a specified number of previous generations; enforced across all domain-joined CUI workstations; policy reviewed annually.',
  'IA.L2-3.5.9':  'Temporary passwords — if issued — require immediate change upon first login enforced via AD account settings (User must change password at next logon); Owner/IT Administrator manages all temporary password issuance and documents in HR/PM System.',
  'IA.L2-3.5.10': 'AD domain authentication transmits password hashes via Kerberos (not plaintext); FIPS mode enabled via Group Policy enforces FIPS-compliant cryptographic algorithms for all authentication operations; NAS admin authentication transmitted via HTTPS; no plaintext password transmission on any CUI system.',
  'IA.L2-3.5.11': 'Windows login screens and NAS web interface mask entered passwords (asterisks/dots); Group Policy enforces no password reveal on CUI workstations; Duo push notifications do not display authentication credentials; employees trained on password security per annual AT training.',
  // ── IR — Incident Response ───────────────────────────────────────────────────
  'IR.L2-3.6.1':  'Incident response capability documented in IR policy covering full lifecycle: preparation, detection, analysis, containment, eradication, recovery, and post-incident review; Owner/IT Administrator is primary responder; designated secondary responder identified; all employees trained to recognize and report incidents immediately per AT policy.',
  'IR.L2-3.6.2':  'All security incidents tracked in NUWorkspace HR/PM System (IR-YYYY-### format) with 14-field record per IR policy §6; Owner/IT Administrator creates record at time of detection and updates through resolution; external reporting to Contracting Officer/DoD customer per contract requirements; DFARS 252.204-7012 incidents reported to US-CERT via DIBNet within 72 hours; records retained ≥ 3 years.',
  'IR.L2-3.6.3':  'Annual IR tabletop exercise conducted each Q4 by Owner/IT Administrator and designated secondary responder; realistic scenarios used (ransomware, phishing, CUI disclosure, physical breach, lost device); gaps incorporated into IR policy updates; exercise documented in HR/PM System with date, participants, scenarios, findings, and corrective actions.',
  // ── MA — Maintenance ─────────────────────────────────────────────────────────
  'MA.L2-3.7.1':  'All routine maintenance performed by Owner/IT Administrator; patch management via WithSecure Elements Software Updater (automated) + manual Windows Update review; Synology NAS patched via DSM update interface; hardware firewall firmware updated as vendor releases available; all maintenance logged in HR/PM System (MA-YYYY-### format).',
  'MA.L2-3.7.2':  'Maintenance tools limited to IT-approved software and hardware controlled by Owner/IT Administrator; no unapproved tools installed on CUI systems; outside contractors supervised at all times and do not access CUI system interfaces or data; contractor media scanned with WithSecure EPP before use on any CUI-adjacent infrastructure.',
  'MA.L2-3.7.3':  'If CUI system component removed for off-site repair, Owner/IT Administrator ensures CUI data removed or storage encrypted before leaving facility; BitLocker keys not provided to repair vendors; if data cannot be confirmed removed or device cannot be encrypted, media physically destroyed before removal; all off-site equipment movements logged in maintenance record.',
  'MA.L2-3.7.4':  'Any removable media used for maintenance/diagnostic purposes on CUI systems scanned by WithSecure EPP before use; Owner/IT Administrator performs manual on-demand scan on EPP-protected endpoint; contractor diagnostic tools also scanned before connection to CUI-adjacent infrastructure; unsigned or suspicious media rejected.',
  'MA.L2-3.7.5':  'NOT APPLICABLE — NU Laboratories does not permit remote maintenance of CUI systems by external parties. All maintenance is performed on-site by Owner/IT Administrator or supervised on-site contractors. No remote desktop, VPN, or remote access by external vendors for CUI maintenance. Reviewed annually.',
  'MA.L2-3.7.6':  'Outside contractors not authorized to access CUI systems, data, or admin interfaces; Owner/IT Administrator accompanies and supervises all contractor activity from facility entry to departure; contractors never left alone in any area where CUI systems are accessible; all contractor visits logged in HR/PM System with contractor name, company, scope, date, duration, and sign-off.',
  // ── MP — Media Protection ────────────────────────────────────────────────────
  'MP.L1-3.8.1':  'Digital CUI stored exclusively on Synology NAS within physically secured CUI area (PIN-code access, security cameras); NAS accessible only from CUI VLAN; AES-256 volume encryption protects data at rest; paper CUI stored in locked cabinet/drawer/safe when not in active use; screens locked when users step away.',
  'MP.L1-3.8.2':  'Access to digital CUI on Synology NAS restricted by AD permissions to only individuals in CUI access inventory; NAS share permissions set at individual user level; no shared/generic accounts permitted CUI share access; physical access to paper CUI storage controlled by key/combination held only by authorized individuals; permissions reviewed annually and upon personnel changes.',
  'MP.L2-3.8.3':  'HDD/SSD sanitization via multi-pass overwrite (DoD 5220.22-M) or Secure Erase; drives that cannot be reliably wiped physically destroyed; USB/removable media overwritten or physically destroyed; Synology NAS drives at end of life physically destroyed (drilled/shredded); all events documented in HR/PM System (MD-YYYY-### format) with device description, method, date, and Owner/IT Administrator sign-off.',
  'MP.L2-3.8.4':  'All paper CUI documents marked "CUI" at top and bottom of every page per National Archives CUI Program requirements; digital CUI files stored in NAS folders with "CUI" in folder path; files transferred via Synology C2 Transfer include "CUI" in file name or transfer description; employees trained on marking requirements annually per AT policy.',
  'MP.L2-3.8.5':  'Digital CUI accountability maintained through AD audit logging and Synology NAS audit logs recording all file/share access, forwarded to Blumira SIEM and reviewed monthly; paper CUI controlled via clean desk policy and secure storage requirements — under direct employee control when in use, returned to locked storage or shredded when no longer needed.',
  'MP.L2-3.8.6':  'NOT APPLICABLE — NU Laboratories does not store CUI on portable storage devices. All digital CUI stored exclusively on Synology NAS within on-premises facility. External transmission handled exclusively via Synology C2 Transfer. Reviewed annually.',
  'MP.L2-3.8.7':  'Group Policy controls removable media access on domain-joined CUI workstations; portable storage requires IT authorization and encryption before use with CUI systems; personal/unapproved USB drives prohibited on CUI systems; prohibition enforced via Group Policy and covered in annual AT training.',
  'MP.L2-3.8.8':  'NOT APPLICABLE as standalone practice — NU Laboratories prohibits all unauthorized removable media on CUI systems (identified or unidentified) per MP.L2-3.8.7. No removable media of any kind may be connected to CUI systems without explicit IT authorization. Enforced via Group Policy and employee training.',
  'MP.L2-3.8.9':  'Synology NAS protected by AES-256 volume-level encryption ensuring backup data is encrypted at storage level; Synology built-in snapshot and backup capabilities managed by Owner/IT Administrator; backup data not exported to unencrypted external media or unmanaged cloud storage; backup CUI access governed by same AD share permissions as primary CUI data.',
  // ── PE — Physical Protection ─────────────────────────────────────────────────
  'PE.L1-3.10.1': 'Physical access to CUI areas restricted via PIN-code locks; only personnel with documented business need granted access; access rights revoked same-day upon role change or departure (combination codes changed per PS offboarding checklist); access controls reviewed periodically.',
  'PE.L1-3.10.2': 'Security cameras installed at entry/exit points and within CUI system areas; camera footage retained ≥ 90 days; periodic walk-throughs by Owner/IT Administrator to confirm physical safeguards remain effective; physical security anomalies logged as security incidents per IR policy.',
  'PE.L2-3.10.3': 'All visitors required to sign in upon arrival; visitors never permitted to access CUI processing areas unescorted; designated employee escort accompanies visitor at all times in secure areas; visitor logs maintained; outside contractors supervised by Owner/IT Administrator throughout on-site maintenance visits per MA policy.',
  'PE.L2-3.10.4': 'Visitor sign-in log maintained for all facility visitors; contractor visits logged in HR/PM System (MA records) with entry/departure documentation and Owner/IT Administrator sign-off; physical access events recorded and reviewed as part of ongoing security monitoring; records retained per retention policy.',
  'PE.L2-3.10.5': 'All combination codes for CUI areas inventoried; combination codes changed same-day when personnel with knowledge of codes depart (PS offboarding checklist item); codes changed at least annually; only remaining authorized personnel issued updated codes; lost access credentials reported immediately and deactivated.',
  'PE.L2-3.10.6': 'NOT APPLICABLE — CUI is not accessed from alternate/remote work sites at NU Laboratories. CUI environment is on-premises only; no remote access to CUI is permitted. Employees do not access CUI systems outside the facility. Reviewed annually.',
  // ── PS — Personnel Security ──────────────────────────────────────────────────
  'PS.L2-3.9.1':  'Pre-employment screening completed before any CUI system account created; screening includes: government-issued ID verification (type, issuing authority, expiration documented), two professional reference checks (name, title, org, contact method, date, summary documented), and I-9 Employment Eligibility Verification; Owner/IT Administrator signs off on 10-field screening record in HR/PM System before account creation.',
  'PS.L2-3.9.2':  'Same-day access termination on last day of employment: AD account disabled, Synology NAS CUI share access revoked, Duo MFA enrollment removed, combination codes changed, CUI access inventory updated, assets retrieved, training record marked inactive; 10-field offboarding checklist completed and signed off in HR/PM System; no grace period for any separation type.',
  // ── RA — Risk Assessment ─────────────────────────────────────────────────────
  'RA.L2-3.11.1': 'Annual risk assessment conducted each Q4 by Owner/IT Administrator; evaluates threats, vulnerabilities, and impacts to CUI across all in-scope systems; inputs include WithSecure EVM scan report, incident history, environment changes, emerging threats (CISA alerts, WithSecure bulletins), and tabletop findings; documented in HR/PM System (RA-YYYY-### format); risk items added to POA&M.',
  'RA.L2-3.11.2': 'WithSecure Elements EVM provides continuous agent-based and network-based vulnerability scanning on all CUI endpoints and network assets; scan results reviewed monthly via Elements Security Center console; comprehensive EVM report generated quarterly and for annual risk assessment; CISA KEV catalog monitored; critical/high new vulnerabilities trigger immediate out-of-cycle review.',
  'RA.L2-3.11.3': 'Vulnerabilities remediated per severity-based timeframes: Critical ≤ 15 days, High ≤ 30 days, Medium ≤ 90 days, Low ≤ 180 days; patch delivery automated via WithSecure Elements Software Updater for Windows OS and third-party apps; Synology NAS and hardware firewall patched manually by Owner/IT Administrator; CISA KEV vulnerabilities remediated within KEV-specified timeframe; vulnerabilities beyond timeframe documented in POA&M with interim mitigating controls.',
  // ── SC — System & Communications Protection ─────────────────────────────────
  'SC.L1-3.13.1': 'Hardware firewall monitors and controls all traffic at network perimeter; all inbound/outbound traffic subject to firewall rule enforcement; CUI VLAN logically segments CUI systems from general office network; only explicitly authorized traffic flows between CUI VLAN and other segments; firewall rules reviewed semi-annually.',
  'SC.L1-3.13.5': 'NU Laboratories does not operate publicly accessible servers within internal network; hardware firewall blocks all unsolicited inbound connections from internet; any future publicly accessible component would require dedicated DMZ network segment isolated from CUI VLAN and general office network before deployment.',
  'SC.L2-3.13.2': 'Security-by-design architecture: CUI VLAN enforces least-privilege network access by design; BitLocker encryption enforced via Group Policy automatically on all endpoints; Synology NAS volume encryption enabled at volume level; security controls built into system architecture rather than applied as optional add-ons; architecture reviewed annually.',
  'SC.L2-3.13.3': 'Standard user accounts prohibited from performing system management functions; admin access to NAS, firewall, and domain infrastructure restricted exclusively to Owner/IT Administrator (rmcadoo@nulabs.com) — separate from daily-use account; users cannot install software, modify firewall rules, or alter NAS permissions; admin actions logged separately from user activity.',
  'SC.L2-3.13.4': 'CUI on Synology NAS accessible only through access-controlled shares with permissions at individual user level; users cannot access NAS shares outside authorized scope; Windows user profile directories private by default and not shared between accounts; NAS share permissions reviewed quarterly to confirm no unintended sharing paths exist.',
  'SC.L2-3.13.6': 'Hardware firewall configured with default-deny posture for all inbound traffic; outbound rules permitted only for business-justified destinations and protocols; firewall rule changes require Owner/IT Administrator approval and documented in change log; CUI VLAN inter-VLAN routing follows same deny-by-default principle; rules reviewed semi-annually.',
  'SC.L2-3.13.7': 'VPN configured to disable split tunneling — when connected via VPN all traffic routes through organizational network; users cannot simultaneously connect to CUI systems via VPN and access resources on other networks; VPN configuration enforces full tunnel mode.',
  'SC.L2-3.13.8': 'CUI transmitted externally exclusively via Synology C2 Transfer (TLS 1.2/1.3 encrypted); Google Workspace email explicitly prohibited for CUI transmission; internal CUI data in motion protected within isolated CUI VLAN; no CUI transmitted over unencrypted channels; approved/prohibited channel list documented in SC policy and covered in annual AT training.',
  'SC.L2-3.13.9': 'Network session timeouts configured on hardware firewall for idle connections; Windows session timeout enforced via Group Policy; CUI VLAN connections terminated after defined inactivity; firewall session termination settings reviewed semi-annually.',
  'SC.L2-3.13.10':'BitLocker recovery keys stored securely in Active Directory accessible only to Owner/IT Administrator; Synology NAS encryption key managed via Synology Key Manager requiring administrator authentication; keys not stored in plaintext or in locations accessible to standard users; key inventory documents all encrypted systems and key storage locations; recovery key access logged.',
  'SC.L2-3.13.11':'FIPS mode enabled on all CUI endpoints via Group Policy (System cryptography: Use FIPS compliant algorithms); BitLocker operates in FIPS-compliant mode; Synology C2 Transfer uses AES-256 and TLS 1.2/1.3 with FIPS 140-2 validated cryptographic modules; FIPS compliance verified quarterly.',
  'SC.L2-3.13.12':'NOT APPLICABLE — NU Laboratories does not use collaborative computing devices (smart speakers, video conferencing room systems, remotely activatable cameras/microphones) in CUI processing areas. Reviewed annually.',
  'SC.L2-3.13.13':'Mobile code execution on CUI endpoints controlled via browser configuration managed by Group Policy; unauthorized/untrusted mobile code blocked at endpoint level; WithSecure EPP and Windows Defender restrict execution of unapproved scripts; users cannot install browser extensions or enable mobile code outside IT-approved configurations on CUI systems.',
  'SC.L2-3.13.14':'NOT APPLICABLE — NU Laboratories does not use VoIP technologies within the CUI environment. Reviewed annually.',
  'SC.L2-3.13.15':'Synology C2 Transfer authenticates sessions using account credentials and TLS certificate validation, preventing interception or spoofing; Google Workspace enforces TLS for email transport with DKIM, DMARC, and SPF for email authentication; CUI VLAN isolated network prevents unauthorized devices from injecting traffic into authenticated sessions.',
  'SC.L2-3.13.16':'All Windows CUI endpoints have BitLocker AES-256 full-disk encryption enabled via Group Policy; Synology NAS CUI storage protected by AES-256 volume-level encryption; no CUI permitted on unencrypted media, unencrypted cloud storage, or personal devices; BitLocker and NAS encryption verified active quarterly.',
  // ── SI — System & Information Integrity ─────────────────────────────────────
  'SI.L1-3.14.1': 'WithSecure Elements EVM continuously scans all CUI endpoints for known vulnerabilities, missing patches, and outdated software; Owner/IT Administrator reviews EVM dashboard monthly and generates full report quarterly; remediation timeframes: Critical ≤ 15 days, High ≤ 30 days, Medium ≤ 90 days, Low ≤ 180 days; patch delivery automated via WithSecure Software Updater; NAS and firewall patched manually; unresolvable flaws documented in POA&M with immediate interim controls.',
  'SI.L1-3.14.2': 'WithSecure Elements EPP installed and active on all CUI workstations; multi-layer malware protection: signature-based detection, DeepGuard behavioral analysis, ransomware rollback, browsing protection, and DataGuard folder protection for CUI; all components managed centrally via Elements Security Center; detected threats trigger immediate real-time alerts and automated protective action.',
  'SI.L2-3.14.3': 'Owner/IT Administrator monitors security alerts from WithSecure Elements Security Center (real-time endpoint alerts), CISA KEV catalog, US-CERT alerts, WithSecure threat bulletins, and Microsoft Security Response Center; relevant alerts assessed for applicability to NU Labs CUI environment; action taken within RA policy timeframes; critical advisories trigger immediate out-of-cycle review.',
  'SI.L1-3.14.4': 'WithSecure EPP threat intelligence definitions updated continuously and automatically from WithSecure cloud — no manual signature update required; update status verified monthly via Elements Security Center dashboard; all CUI endpoints confirmed active with current definitions; disconnected or out-of-date endpoints investigated and remediated immediately.',
  'SI.L2-3.14.5': 'WithSecure EPP provides real-time scanning of all files at access on CUI workstations; monthly scheduled on-demand full system scans run via Elements Security Center console; removable media scanned with WithSecure EPP before use on any CUI system; scan results reviewed and anomalies escalated to IR process.',
  'SI.L2-3.14.6': 'Blumira cloud SIEM ingests all CUI system logs and continuously applies pre-built detection rules across all sources; Blumira monitors inbound/outbound firewall traffic, NAS file access, and Windows authentication events for anomalous patterns; WithSecure EPP provides endpoint-level behavioral monitoring detecting fileless attacks, lateral movement, and process anomalies; all sources feed Blumira for centralized visibility; indicators of compromise escalated immediately to IR process.',
  'SI.L2-3.14.7': 'Blumira correlates activity across Windows, NAS, firewall, and WithSecure logs to detect unauthorized use patterns not visible in any single log source; unique named AD accounts ensure all activity attributable to specific individuals; Blumira detection rules identify credential stuffing, after-hours access anomalies, bulk data access, and lateral movement; unauthorized use alerts investigated by Owner/IT Administrator and escalated to IR process if confirmed.',
};

async function _renderAssessmentTab() {
  const area = document.getElementById('complianceTabContent');

  // Load saved assessments for selected year
  const { data, error } = await sb
    .from('cmmc_self_assessment')
    .select('*')
    .eq('assessment_year', assessmentYear);

  if (error) console.error('Assessment load error:', error);

  // Build lookup by practice_id
  assessmentRecords = {};
  (data || []).forEach(r => { assessmentRecords[r.practice_id] = r; });

  _renderAssessmentPage();
}

function _renderAssessmentPage() {
  const area = document.getElementById('complianceTabContent');
  if (!area) return;

  // Calculate SPRS score
  const sprs = _calcSprs();
  const metCount     = Object.values(assessmentRecords).filter(r => r.status === 'MET').length;
  const partialCount = Object.values(assessmentRecords).filter(r => r.status === 'PARTIAL').length;
  const notMetCount  = Object.values(assessmentRecords).filter(r => r.status === 'NOT MET').length;
  const scoredCount  = metCount + partialCount + notMetCount;
  const unscoredCount = 110 - scoredCount;

  const sprsColor = sprs >= 90 ? 'var(--green)' : sprs >= 70 ? 'var(--amber)' : 'var(--red)';

  // Year options
  const years = [2024, 2025, 2026, 2027, 2028];
  const yearOpts = years.map(y =>
    `<option value="${y}" ${y === assessmentYear ? 'selected' : ''}>${y}</option>`
  ).join('');

  area.innerHTML = `
    <div style="padding:28px 32px">

      <!-- SPRS Score hero + stats -->
      <div style="display:flex;gap:16px;align-items:stretch;margin-bottom:20px;flex-wrap:wrap">

        <!-- SPRS Score card -->
        <div style="background:var(--surface);border:2px solid ${sprsColor};border-radius:14px;padding:20px 28px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:160px">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">SPRS Score</div>
          <div style="font-size:52px;font-weight:800;font-family:'JetBrains Mono',monospace;color:${sprsColor};line-height:1">${sprs}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">of 110 possible</div>
        </div>

        <!-- Stat pills -->
        <div style="display:flex;flex-direction:column;gap:8px;justify-content:center">
          <div class="comp-stat-row" style="margin-bottom:0">
            <div class="comp-stat-pill comp-stat-green">
              <div class="comp-stat-num">${metCount}</div>
              <div class="comp-stat-lbl">MET</div>
            </div>
            <div class="comp-stat-pill comp-stat-amber">
              <div class="comp-stat-num">${partialCount}</div>
              <div class="comp-stat-lbl">PARTIAL</div>
            </div>
            <div class="comp-stat-pill comp-stat-red">
              <div class="comp-stat-num">${notMetCount}</div>
              <div class="comp-stat-lbl">NOT MET</div>
            </div>
            <div class="comp-stat-pill">
              <div class="comp-stat-num">${unscoredCount}</div>
              <div class="comp-stat-lbl">Unscored</div>
            </div>
            <div class="comp-stat-pill comp-stat-blue">
              <div class="comp-stat-num">${scoredCount} / 110</div>
              <div class="comp-stat-lbl">Scored</div>
            </div>
          </div>
          <div class="comp-policy-banner" style="margin-bottom:0">
            <span class="comp-policy-icon">📌</span>
            <div style="font-size:11.5px">
              <strong>CA.L2-3.12.1</strong> — Conducted annually each Q4. Score MET (fully implemented),
              PARTIAL (some elements in place), or NOT MET (not implemented). Any PARTIAL or NOT MET
              must be entered in the POA&amp;M. An honest score with a live POA&amp;M is always
              preferable to an inflated score. Submit to SPRS at sprs.apps.mil before contract award.
            </div>
          </div>
        </div>

        <!-- Year + actions -->
        <div style="margin-left:auto;display:flex;flex-direction:column;gap:8px;align-items:flex-end;justify-content:flex-start">
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Assessment Year</label>
            <select onchange="assessmentYear=parseInt(this.value);_renderAssessmentTab()"
              style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;padding:6px 10px;outline:none;cursor:pointer">
              ${yearOpts}
            </select>
          </div>
          <button onclick="_exportAssessmentSummary()" class="comp-btn-ghost" style="font-size:12px">
            ⬇ Export Summary
          </button>
          <button onclick="_markAllMet()" class="comp-btn-ghost" style="font-size:12px">
            ✓ Mark All Unscored as MET
          </button>
        </div>
      </div>

      <!-- Filter + search toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <input type="text" id="assessSearchInput" placeholder="Search practice ID or description…" autocomplete="off"
          value="${_esc(assessmentSearchVal)}"
          oninput="assessmentSearchVal=this.value;_renderAssessmentDomains()"
          style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:6px 12px;outline:none;width:260px;transition:border-color var(--transition)"
          onfocus="this.style.borderColor='var(--amber-dim)'" onblur="this.style.borderColor='var(--border)'" />
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${['all','MET','PARTIAL','NOT MET','unscored'].map(s => `
            <button class="comp-filter-btn${assessmentStatusFilter === s ? ' active' : ''}"
              onclick="assessmentStatusFilter='${s}';_renderAssessmentDomains()">
              ${s === 'all' ? 'All' : s === 'unscored' ? 'Unscored' : s}
            </button>
          `).join('')}
        </div>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button onclick="_collapseAllDomains()" class="comp-btn-ghost" style="font-size:12px">− Collapse All</button>
          <button onclick="_expandAllDomains()" class="comp-btn-ghost" style="font-size:12px">+ Expand All</button>
        </div>
      </div>

      <!-- Domain sections -->
      <div id="assessmentDomainList"></div>

    </div>
  `;

  _renderAssessmentDomains();
}

function _calcSprs() {
  // Start at 110, deduct for NOT MET (full points) and PARTIAL (1 point each per DoD guidance)
  let score = 110;
  Object.values(assessmentRecords).forEach(r => {
    const pts = SPRS_POINTS[r.practice_id] || 1;
    if (r.status === 'NOT MET') score -= pts;
    else if (r.status === 'PARTIAL') score -= 1; // DoD: PARTIAL deducts 1 pt regardless
  });
  return score;
}

function _renderAssessmentDomains() {
  const list = document.getElementById('assessmentDomainList');
  if (!list) return;

  const q = (assessmentSearchVal || '').toLowerCase();

  list.innerHTML = ASSESSMENT_DOMAINS.map(domain => {
    // Filter practices
    let practices = domain.practices.map(pid => {
      const p = POAM_PRACTICES.find(x => x.id === pid);
      return { id: pid, desc: p?.desc || '' };
    });

    if (q) {
      practices = practices.filter(p =>
        p.id.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
      );
    }
    if (assessmentStatusFilter !== 'all') {
      practices = practices.filter(p => {
        const rec = assessmentRecords[p.id];
        if (assessmentStatusFilter === 'unscored') return !rec;
        return rec?.status === assessmentStatusFilter;
      });
    }

    if (!practices.length) return '';

    const domainMet     = domain.practices.filter(id => assessmentRecords[id]?.status === 'MET').length;
    const domainPartial = domain.practices.filter(id => assessmentRecords[id]?.status === 'PARTIAL').length;
    const domainNotMet  = domain.practices.filter(id => assessmentRecords[id]?.status === 'NOT MET').length;
    const domainTotal   = domain.practices.length;
    const isCollapsed   = assessmentDomainCollapsed[domain.abbrev];

    const progressPct = Math.round((domainMet / domainTotal) * 100);
    const domainStatusColor = domainNotMet > 0 ? 'var(--red)' : domainPartial > 0 ? 'var(--amber)' : domainMet === domainTotal ? 'var(--green)' : 'var(--muted)';

    const rows = isCollapsed ? '' : practices.map(p => {
      const rec = assessmentRecords[p.id];
      const status = rec?.status || null;
      const pts = SPRS_POINTS[p.id] || 1;
      const suggestedEvidence = ASSESSMENT_EVIDENCE[p.id] || '';
      const hasSuggestion = !!suggestedEvidence;

      const statusBtn = (s, label, cls) => {
        const active = status === s;
        return `<button onclick="setAssessmentStatus('${p.id}', '${s}')"
          class="assess-status-btn ${cls}${active ? ' active' : ''}">${label}</button>`;
      };

      const inPoam = poamRecords.some(pr => pr.practice_id === p.id);
      const poamBtn = (status === 'PARTIAL' || status === 'NOT MET')
        ? `<button onclick="pushToPoam('${p.id}')" class="assess-poam-btn ${inPoam ? 'in-poam' : ''}" title="${inPoam ? 'Already in POA&M — click to add another' : 'Add to POA&M'}">
            ${inPoam ? '✓ In POA&M' : '→ POA&M'}
          </button>`
        : '';

      const evidenceVal = _esc(rec?.evidence || '');
      const rowBg = status === 'NOT MET' ? 'background:rgba(208,64,64,0.04)' :
                    status === 'PARTIAL'  ? 'background:rgba(192,122,26,0.04)' : '';

      return `
        <tr class="assess-practice-row" style="${rowBg}">
          <td style="width:130px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--muted)">${p.id}</span>
          </td>
          <td style="font-size:12.5px;color:var(--text);line-height:1.5;padding-right:16px">${_esc(p.desc)}</td>
          <td style="width:12px;text-align:center">
            <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted)">${pts}pt</span>
          </td>
          <td style="width:230px">
            <div class="assess-status-group">
              ${statusBtn('MET',      'MET',      'assess-met')}
              ${statusBtn('PARTIAL',  'PARTIAL',  'assess-partial')}
              ${statusBtn('NOT MET',  'NOT MET',  'assess-notmet')}
            </div>
          </td>
          <td style="width:280px">
            <div style="display:flex;gap:4px;align-items:flex-start">
              <textarea
                placeholder="Evidence / implementation note…"
                onblur="saveAssessmentEvidence('${p.id}', this.value); this.style.height='24px'; this.style.boxShadow='none'; this.style.borderColor='var(--border)'; this.style.zIndex=''; this.style.position=''; this.style.whiteSpace='nowrap'; this.style.overflow='hidden'"
                onfocus="this.style.height=Math.max(90,this.scrollHeight)+'px'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.15)'; this.style.borderColor='var(--amber-dim)'; this.style.zIndex='10'; this.style.position='relative'; this.style.whiteSpace='normal'; this.style.overflow='auto'"
                onkeydown="if(event.key==='Escape'){this.blur()}"
                style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:4px 8px;font-size:11.5px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;resize:none;height:24px;line-height:1.4;transition:height .2s ease,box-shadow .2s ease,border-color .15s;overflow:hidden;white-space:nowrap;word-break:break-word">${evidenceVal}</textarea>
              ${hasSuggestion ? `<button
                title="Fill with suggested evidence text"
                onclick="fillSuggestedEvidence('${p.id}', this)"
                style="flex-shrink:0;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:transparent;cursor:pointer;font-size:11px;color:var(--muted);transition:all .15s;margin-top:1px"
                onmouseover="this.style.borderColor='var(--amber-dim)';this.style.color='var(--amber)'"
                onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">💡</button>` : ''}
            </div>
          </td>
          <td style="width:90px;text-align:right">${poamBtn}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="assess-domain-block">
        <div class="assess-domain-header" onclick="toggleAssessmentDomain('${domain.abbrev}')">
          <span class="assess-domain-abbrev">${domain.abbrev}</span>
          <span class="assess-domain-name">${domain.name}</span>
          <span class="assess-domain-counts">
            <span style="color:var(--green)">${domainMet} MET</span>
            ${domainPartial ? `<span style="color:var(--amber)">&nbsp;· ${domainPartial} PARTIAL</span>` : ''}
            ${domainNotMet  ? `<span style="color:var(--red)">&nbsp;· ${domainNotMet} NOT MET</span>` : ''}
            <span style="color:var(--muted)">&nbsp;/ ${domainTotal}</span>
          </span>
          <!-- Progress bar -->
          <div class="assess-domain-progress">
            <div style="height:4px;background:var(--surface3);border-radius:2px;overflow:hidden;width:80px">
              <div style="height:100%;width:${progressPct}%;background:${domainStatusColor};border-radius:2px;transition:width .3s"></div>
            </div>
          </div>
          <span class="assess-domain-chevron">${isCollapsed ? '▸' : '▾'}</span>
        </div>
        ${isCollapsed ? '' : `
          <div class="assess-domain-body">
            <table class="assess-practice-table">
              <thead>
                <tr>
                  <th>Practice ID</th>
                  <th>Requirement</th>
                  <th>Pts</th>
                  <th>Status</th>
                  <th>Evidence / Implementation Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }).join('');
}

async function setAssessmentStatus(practiceId, status) {
  const existing = assessmentRecords[practiceId];
  const payload = {
    practice_id:     practiceId,
    assessment_year: assessmentYear,
    status:          status,
    scored_by:       'Owner / IT Administrator',
    date_assessed:   new Date().toISOString().split('T')[0],
    updated_at:      new Date().toISOString(),
  };

  // Auto-fill evidence when clicking MET, only if no evidence already exists
  const suggestedEvidence = ASSESSMENT_EVIDENCE[practiceId] || '';
  if (status === 'MET' && (!existing || !existing.evidence)) {
    payload.evidence = suggestedEvidence;
  }

  let err;
  if (existing) {
    // Toggle off if clicking same status
    if (existing.status === status) {
      const res = await sb.from('cmmc_self_assessment').delete().eq('id', existing.id);
      err = res.error;
      if (!err) delete assessmentRecords[practiceId];
    } else {
      const res = await sb.from('cmmc_self_assessment').update(payload).eq('id', existing.id);
      err = res.error;
      if (!err) assessmentRecords[practiceId] = { ...existing, ...payload };
    }
  } else {
    const res = await sb.from('cmmc_self_assessment')
      .insert({ ...payload, evidence: '', created_at: new Date().toISOString() })
      .select().single();
    err = res.error;
    if (!err && res.data) assessmentRecords[practiceId] = res.data;
  }

  if (err) { console.error('Assessment save error:', err); toast('⚠ Save failed: ' + err.message); return; }

  // Re-render just the domain list + score (fast, no full DB reload)
  _renderAssessmentPage();
}

function fillSuggestedEvidence(practiceId, btn) {
  const suggested = ASSESSMENT_EVIDENCE[practiceId] || '';
  if (!suggested) return;
  const textarea = btn.previousElementSibling;
  if (!textarea) return;
  if (textarea.value && !confirm('Replace existing evidence with suggested text?')) return;
  textarea.value = suggested;
  // Briefly expand to show the filled content, then save
  textarea.style.height = Math.max(90, textarea.scrollHeight) + 'px';
  textarea.style.whiteSpace = 'normal';
  textarea.style.overflow = 'auto';
  saveAssessmentEvidence(practiceId, suggested);
  toast('💡 Evidence filled from SSP policy.');
}

async function saveAssessmentEvidence(practiceId, evidenceVal) {
  const existing = assessmentRecords[practiceId];
  if (!existing) return; // can't save evidence without a status set first

  const { error } = await sb.from('cmmc_self_assessment')
    .update({ evidence: evidenceVal, updated_at: new Date().toISOString() })
    .eq('id', existing.id);

  if (error) { console.error('Evidence save error:', error); return; }
  assessmentRecords[practiceId] = { ...existing, evidence: evidenceVal };
}

function toggleAssessmentDomain(abbrev) {
  assessmentDomainCollapsed[abbrev] = !assessmentDomainCollapsed[abbrev];
  _renderAssessmentDomains();
}

function _collapseAllDomains() {
  ASSESSMENT_DOMAINS.forEach(d => { assessmentDomainCollapsed[d.abbrev] = true; });
  _renderAssessmentDomains();
}

function _expandAllDomains() {
  ASSESSMENT_DOMAINS.forEach(d => { assessmentDomainCollapsed[d.abbrev] = false; });
  _renderAssessmentDomains();
}

async function _markAllMet() {
  const unscored = [];
  ASSESSMENT_DOMAINS.forEach(d => {
    d.practices.forEach(pid => { if (!assessmentRecords[pid]) unscored.push(pid); });
  });
  if (!unscored.length) { toast('All practices already scored.'); return; }
  if (!confirm(`Mark all ${unscored.length} unscored practices as MET for ${assessmentYear}?`)) return;

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const rows = unscored.map(pid => ({
    practice_id: pid, assessment_year: assessmentYear, status: 'MET',
    evidence: '', scored_by: 'Owner / IT Administrator',
    date_assessed: today, created_at: now, updated_at: now,
  }));

  const { data, error } = await sb.from('cmmc_self_assessment').insert(rows).select();
  if (error) { alert('Bulk save failed: ' + error.message); return; }
  (data || []).forEach(r => { assessmentRecords[r.practice_id] = r; });
  toast(`✅ ${unscored.length} practices marked MET.`);
  _renderAssessmentPage();
}

async function pushToPoam(practiceId) {
  const rec = assessmentRecords[practiceId];
  if (!rec) return;
  const practice = POAM_PRACTICES.find(p => p.id === practiceId);

  // Load current POA&M to generate next ID
  if (!poamRecords.length) {
    const { data } = await sb.from('cmmc_poam').select('poam_id');
    poamRecords = data || [];
  }

  const year = new Date().getFullYear();
  const nums = poamRecords.map(r => { const m = (r.poam_id||'').match(/(\d+)$/); return m ? parseInt(m[1]) : 0; }).filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  const newPoamId = `POAM-${year}-${String(next).padStart(3,'0')}`;

  // Pre-fill the POA&M modal
  editingPoamId = null;
  openPoamModal(null, {
    poam_id:              newPoamId,
    practice_id:          practiceId,
    practice_description: practice?.desc || '',
    deficiency_description: rec.status === 'NOT MET'
      ? `Practice ${practiceId} is not implemented.`
      : `Practice ${practiceId} is only partially implemented.`,
    status:   'Open',
    source:   'Self-Assessment',
    date_opened: new Date().toISOString().split('T')[0],
  });
}

function _exportAssessmentSummary() {
  const lines = [
    `NU Laboratories, Inc. — NIST SP 800-171 Self-Assessment`,
    `Assessment Year: ${assessmentYear}`,
    `SPRS Score: ${_calcSprs()} / 110`,
    `Generated: ${new Date().toLocaleDateString()}`,
    '',
    'Practice ID,Status,Points,Evidence',
  ];
  ASSESSMENT_DOMAINS.forEach(d => {
    d.practices.forEach(pid => {
      const rec = assessmentRecords[pid];
      const pts = SPRS_POINTS[pid] || 1;
      const status = rec?.status || 'UNSCORED';
      const evidence = (rec?.evidence || '').replace(/,/g, ';');
      lines.push(`${pid},${status},${pts},"${evidence}"`);
    });
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SPRS_Assessment_${assessmentYear}.csv`;
  a.click();
}

// ════════════════════════════════════════════════════════════════════
//  MODULE 4 — INCIDENT RECORDS  (IR.L2-3.6.1 / 3.6.2 / 3.6.3)
// ════════════════════════════════════════════════════════════════════
// 14 fields per IR Policy §6. Auto-generates IR-YYYY-### IDs.
// Full lifecycle: Detection → Containment → Eradication → Recovery
// → External Notification → Post-Incident Review → Close.

let incidentRecords    = [];
let incidentStatusFilter = 'all';   // all | Open | Closed
let incidentSearchVal    = '';
let editingIncidentId    = null;

const IR_CATEGORIES = [
  'Unauthorized Access',
  'Malware / Ransomware',
  'Phishing / Social Engineering',
  'CUI Disclosure',
  'Lost or Stolen Device',
  'Physical Security Breach',
  'System Compromise',
  'Policy Violation',
];

const IR_SEVERITIES = ['Low', 'Medium', 'High'];

async function _renderIncidentsTab() {
  const area = document.getElementById('complianceTabContent');

  const { data, error } = await sb
    .from('cmmc_incidents')
    .select('*')
    .order('date_detected', { ascending: false });
  incidentRecords = data || [];
  if (error) console.error('Incidents load error:', error);

  const openCount   = incidentRecords.filter(r => !r.date_closed).length;
  const closedCount = incidentRecords.filter(r => !!r.date_closed).length;
  const highCount   = incidentRecords.filter(r => r.severity === 'High' && !r.date_closed).length;

  area.innerHTML = `
    <div style="padding:28px 32px">

      <!-- Stat pills -->
      <div class="comp-stat-row">
        <div class="comp-stat-pill">
          <div class="comp-stat-num">${incidentRecords.length}</div>
          <div class="comp-stat-lbl">Total</div>
        </div>
        <div class="comp-stat-pill ${openCount ? 'comp-stat-amber' : ''}">
          <div class="comp-stat-num">${openCount}</div>
          <div class="comp-stat-lbl">Open</div>
        </div>
        <div class="comp-stat-pill comp-stat-green">
          <div class="comp-stat-num">${closedCount}</div>
          <div class="comp-stat-lbl">Closed</div>
        </div>
        ${highCount ? `<div class="comp-stat-pill comp-stat-red">
          <div class="comp-stat-num">${highCount}</div>
          <div class="comp-stat-lbl">High / Open</div>
        </div>` : ''}
      </div>

      <!-- Policy banner -->
      <div class="comp-policy-banner">
        <span class="comp-policy-icon">📌</span>
        <div>
          <strong>IR.L2-3.6.1 &amp; IR.L2-3.6.2</strong> — All actual or suspected security incidents
          involving CUI must be tracked in the HR/PM System using this record. Create the record at
          time of detection and update it through closure. CUI compromise incidents must be reported
          to the Contracting Officer and to US-CERT via DIBNet within 72 hours (DFARS 252.204-7012).
          Records retained ≥ 3 years.
        </div>
      </div>

      <!-- Toolbar -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <input type="text" placeholder="Search by ID, category, description…" autocomplete="off"
          value="${_esc(incidentSearchVal)}"
          oninput="incidentSearchVal=this.value;_renderIncidentTable()"
          style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:6px 12px;outline:none;width:240px;transition:border-color var(--transition)"
          onfocus="this.style.borderColor='var(--amber-dim)'" onblur="this.style.borderColor='var(--border)'" />
        <div style="display:flex;gap:6px">
          ${['all','Open','Closed'].map(s => `
            <button class="comp-filter-btn${incidentStatusFilter===s?' active':''}"
              onclick="incidentStatusFilter='${s}';_renderIncidentTable()">
              ${s==='all'?'All':s}
            </button>`).join('')}
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button onclick="_refreshIncidentsTab()" class="comp-btn-ghost">↺ Refresh</button>
          <button onclick="openIncidentModal()" class="comp-btn-primary">+ New Incident</button>
        </div>
      </div>

      <!-- Table -->
      <div id="incidentTableWrap"></div>
    </div>
  `;

  _renderIncidentTable();
}

async function _refreshIncidentsTab() { await _renderIncidentsTab(); }

function _renderIncidentTable() {
  const wrap = document.getElementById('incidentTableWrap');
  if (!wrap) return;

  const q = incidentSearchVal.toLowerCase();
  let filtered = incidentRecords;
  if (incidentStatusFilter === 'Open')   filtered = filtered.filter(r => !r.date_closed);
  if (incidentStatusFilter === 'Closed') filtered = filtered.filter(r => !!r.date_closed);
  if (q) filtered = filtered.filter(r =>
    (r.incident_id||'').toLowerCase().includes(q) ||
    (r.incident_category||'').toLowerCase().includes(q) ||
    (r.description||'').toLowerCase().includes(q) ||
    (r.reported_by||'').toLowerCase().includes(q) ||
    (r.systems_affected||'').toLowerCase().includes(q)
  );

  if (!filtered.length) {
    wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px">
      ${q || incidentStatusFilter!=='all' ? 'No records match your filter.' : 'No incident records yet — click <strong>+ New Incident</strong> to log the first one.'}
    </div>`;
    return;
  }

  const sevBadge = s => {
    const cls = s==='High' ? 'comp-badge-red' : s==='Medium' ? 'comp-badge-amber' : 'comp-badge-blue';
    return `<span class="comp-badge ${cls}">${s}</span>`;
  };

  const rows = filtered.map(r => {
    const isOpen    = !r.date_closed;
    const descSnip  = (r.description||'').substring(0,80)+((r.description||'').length>80?'…':'');
    const statusBadge = isOpen
      ? `<span class="comp-badge comp-badge-amber">Open</span>`
      : `<span class="comp-badge comp-badge-green">Closed</span>`;
    return `
      <tr class="comp-tbl-row" onclick="openIncidentModal('${r.id}')">
        <td><span style="font-family:'JetBrains Mono',monospace;font-size:11.5px">${_esc(r.incident_id)}</span></td>
        <td>${_fmtDate(r.date_detected)}</td>
        <td><strong style="font-size:12px">${_esc(r.incident_category||'—')}</strong></td>
        <td>${sevBadge(r.severity||'Low')}</td>
        <td style="color:var(--muted);font-size:12px;max-width:260px">${_esc(descSnip)}</td>
        <td>${statusBadge}</td>
        <td style="color:var(--muted);font-size:12px">${_esc(r.reported_by||'—')}</td>
        <td style="color:var(--muted);font-size:12px">${r.date_closed ? _fmtDate(r.date_closed) : '—'}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="comp-tbl-wrap">
      <table class="comp-tbl">
        <thead><tr>
          <th>Incident ID</th><th>Detected</th><th>Category</th><th>Severity</th>
          <th>Description</th><th>Status</th><th>Reported By</th><th>Closed</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">
      ${filtered.length} record${filtered.length!==1?'s':''} — Click any row to view / edit
    </div>
  `;
}

// ── Incident Modal (14 fields per IR Policy §6) ──────────────────────
function openIncidentModal(id) {
  editingIncidentId = id || null;
  const rec = id ? incidentRecords.find(r => r.id === id) : null;

  // Generate next IR ID
  const _nextIrId = () => {
    const year = new Date().getFullYear();
    const nums = incidentRecords
      .map(r => { const m=(r.incident_id||'').match(/(\d+)$/); return m?parseInt(m[1]):0; })
      .filter(Boolean);
    const next = nums.length ? Math.max(...nums)+1 : 1;
    return `IR-${year}-${String(next).padStart(3,'0')}`;
  };

  const catOptions = IR_CATEGORIES.map(c =>
    `<option value="${c}" ${rec?.incident_category===c?'selected':''}>${c}</option>`
  ).join('');

  const sevOptions = IR_SEVERITIES.map(s =>
    `<option value="${s}" ${(rec?.severity||'Low')===s?'selected':''}>${s}</option>`
  ).join('');

  const isNew = !id;
  const backdropId = 'incidentModalBackdrop';
  const existing = document.getElementById(backdropId);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = backdropId;
  backdrop.onclick = e => { if(e.target===backdrop) closeIncidentModal(); };

  backdrop.innerHTML = `
    <div class="modal" style="width:720px;max-height:92vh">
      <div class="modal-header">
        <div class="modal-title">${rec ? `🚨 ${rec.incident_id}` : '🚨 New Incident Record'}</div>
        <button class="modal-close" onclick="closeIncidentModal()">&#x2715;</button>
      </div>
      <div class="modal-body" style="gap:14px">

        <!-- Row: ID + Category + Severity -->
        <div class="field-row">
          <div class="field" style="flex:0 0 160px">
            <label class="field-label">Incident ID <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="irId" type="text"
              value="${_esc(rec?.incident_id || _nextIrId())}"
              style="font-family:'JetBrains Mono',monospace;font-size:13px" />
          </div>
          <div class="field">
            <label class="field-label">Incident Category <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="irCategory">
              <option value="">— Select —</option>${catOptions}
            </select>
          </div>
          <div class="field" style="flex:0 0 130px">
            <label class="field-label">Severity <span style="color:var(--red)">*</span></label>
            <select class="f-select" id="irSeverity">${sevOptions}</select>
          </div>
        </div>

        <!-- Row: Detected + Reported By -->
        <div class="field-row">
          <div class="field">
            <label class="field-label">Date / Time Detected <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="irDateDetected" type="datetime-local"
              style="color-scheme:light"
              value="${rec?.date_detected ? rec.date_detected.slice(0,16) : ''}" />
          </div>
          <div class="field">
            <label class="field-label">Reported By <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="irReportedBy" type="text"
              placeholder="Name of employee who reported the incident"
              value="${_esc(rec?.reported_by||'')}" />
          </div>
        </div>

        <!-- Systems / Data Affected -->
        <div class="field">
          <label class="field-label">Systems / Data Affected</label>
          <input class="f-input" id="irSystems" type="text"
            placeholder="e.g. CUI NAS share, Windows workstation WS-02, firewall"
            value="${_esc(rec?.systems_affected||'')}" />
        </div>

        <!-- Description -->
        <div class="field">
          <label class="field-label">Description <span style="color:var(--red)">*</span></label>
          <textarea class="f-textarea" id="irDescription" rows="3"
            placeholder="Narrative description of what occurred, how it was discovered, and initial indicators observed.">${_esc(rec?.description||'')}</textarea>
        </div>

        <div class="modal-div"></div>
        <div style="font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">
          Response Actions — Steps &amp; Dates
        </div>

        <!-- Containment -->
        <div class="field">
          <label class="field-label">Containment Actions</label>
          <textarea class="f-textarea" id="irContainment" rows="2"
            placeholder="Steps taken to contain the incident and prevent further damage, with dates.">${_esc(rec?.containment_actions||'')}</textarea>
        </div>

        <!-- Eradication -->
        <div class="field">
          <label class="field-label">Eradication Actions</label>
          <textarea class="f-textarea" id="irEradication" rows="2"
            placeholder="Steps taken to remove the root cause, with dates.">${_esc(rec?.eradication_actions||'')}</textarea>
        </div>

        <!-- Recovery -->
        <div class="field">
          <label class="field-label">Recovery Actions</label>
          <textarea class="f-textarea" id="irRecovery" rows="2"
            placeholder="Steps taken to restore normal operations, with dates.">${_esc(rec?.recovery_actions||'')}</textarea>
        </div>

        <!-- External Notifications -->
        <div class="field">
          <label class="field-label">External Notifications</label>
          <textarea class="f-textarea" id="irExternal" rows="2"
            placeholder="Date, recipient, and method of notifications to Contracting Officer, DoD customer, or US-CERT via DIBNet (required within 72 hrs if DFARS 252.204-7012 applies).">${_esc(rec?.external_notifications||'')}</textarea>
        </div>

        <!-- Post-Incident Findings -->
        <div class="field">
          <label class="field-label">Post-Incident Findings</label>
          <textarea class="f-textarea" id="irFindings" rows="2"
            placeholder="Root cause, lessons learned, and corrective actions identified in post-incident review (within 30 days of closure).">${_esc(rec?.post_incident_findings||'')}</textarea>
        </div>

        <!-- Closure row -->
        <div class="modal-div"></div>
        <div style="font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">
          Closure
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Date Closed</label>
            <input class="f-input" id="irDateClosed" type="date" style="color-scheme:light"
              value="${rec?.date_closed||''}" />
          </div>
          <div class="field">
            <label class="field-label">Closed By</label>
            <input class="f-input" id="irClosedBy" type="text"
              placeholder="Owner / IT Administrator"
              value="${_esc(rec?.closed_by||'')}" />
          </div>
        </div>

        <div class="comp-policy-banner" style="margin-top:4px">
          <span class="comp-policy-icon">⚠</span>
          <div style="font-size:11.5px">
            If this incident involves actual or suspected CUI compromise, notify the Contracting Officer
            and report to US-CERT via <strong>dibnet.dod.mil</strong> within <strong>72 hours</strong>
            of discovery (DFARS 252.204-7012). Document the notification in External Notifications above.
          </div>
        </div>

      </div>
      <div class="modal-footer">
        ${id ? `<button class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="deleteIncidentRecord('${id}')">🗑 Delete</button>` : ''}
        <button class="btn btn-ghost" onclick="closeIncidentModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveIncidentRecord()">
          ${isNew ? 'Create Record' : 'Save Changes'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function closeIncidentModal() {
  const backdrop = document.getElementById('incidentModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => backdrop.remove(), 280);
  editingIncidentId = null;
}

async function saveIncidentRecord() {
  const irId       = (document.getElementById('irId')?.value||'').trim();
  const category   = document.getElementById('irCategory')?.value;
  const severity   = document.getElementById('irSeverity')?.value;
  const detected   = document.getElementById('irDateDetected')?.value;
  const reportedBy = (document.getElementById('irReportedBy')?.value||'').trim();
  const systems    = (document.getElementById('irSystems')?.value||'').trim();
  const description= (document.getElementById('irDescription')?.value||'').trim();
  const containment= (document.getElementById('irContainment')?.value||'').trim();
  const eradication= (document.getElementById('irEradication')?.value||'').trim();
  const recovery   = (document.getElementById('irRecovery')?.value||'').trim();
  const external   = (document.getElementById('irExternal')?.value||'').trim();
  const findings   = (document.getElementById('irFindings')?.value||'').trim();
  const dateClosed = document.getElementById('irDateClosed')?.value || null;
  const closedBy   = (document.getElementById('irClosedBy')?.value||'').trim();

  if (!irId)       { alert('Please enter an Incident ID.'); return; }
  if (!category)   { alert('Please select an Incident Category.'); return; }
  if (!detected)   { alert('Please enter the date/time detected.'); return; }
  if (!reportedBy) { alert('Please enter who reported the incident.'); return; }
  if (!description){ alert('Please enter a description.'); return; }

  const payload = {
    incident_id:            irId,
    incident_category:      category,
    severity:               severity,
    date_detected:          detected ? new Date(detected).toISOString() : null,
    reported_by:            reportedBy,
    systems_affected:       systems || null,
    description:            description,
    containment_actions:    containment || null,
    eradication_actions:    eradication || null,
    recovery_actions:       recovery || null,
    external_notifications: external || null,
    post_incident_findings: findings || null,
    date_closed:            dateClosed || null,
    closed_by:              closedBy || null,
    updated_at:             new Date().toISOString(),
  };

  let err;
  if (editingIncidentId) {
    const res = await sb.from('cmmc_incidents').update(payload).eq('id', editingIncidentId);
    err = res.error;
  } else {
    const res = await sb.from('cmmc_incidents').insert({ ...payload, created_at: new Date().toISOString() });
    err = res.error;
  }

  if (err) { alert('Save failed: ' + err.message); return; }
  closeIncidentModal();
  toast('🚨 Incident record saved.');
  await _renderIncidentsTab();
}

async function deleteIncidentRecord(id) {
  if (!confirm('Delete this incident record? This cannot be undone.')) return;
  const { error } = await sb.from('cmmc_incidents').delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  closeIncidentModal();
  toast('Incident record deleted.');
  await _renderIncidentsTab();
}

// ════════════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ════════════════════════════════════════════════════════════════════

function _fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(day,10)}, ${y}`;
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
