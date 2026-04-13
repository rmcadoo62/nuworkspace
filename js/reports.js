
// ===== REPORTS PANEL =====
// ===== REPORTS PANEL =====

// ===== BILLING QUEUE REPORT =====
// ===== BILLING QUEUE REPORT =====
let bqSelected = new Set();

async function renderBillingQueue() {
  const el = document.getElementById('tab-billing');
  if (!el) return;

  // Refresh revenue_type from DB for complete tasks
  if (sb) {
    const { data: rtRows } = await sb.from('tasks').select('id, revenue_type').eq('status', 'complete');
    if (rtRows) rtRows.forEach(r => {
      const t = taskStore.find(x => x._id === r.id);
      if (t) t.revenueType = r.revenue_type || 'fixed';
    });
  }

  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Complete tasks from non-closed projects only
  const closedProjIds = new Set(projects.filter(p => (projectInfo[p.id]||{}).status === 'closed').map(p => p.id));
  const tasks = taskStore.filter(t => t.status === 'complete' && !closedProjIds.has(t.proj) && t.revenueType !== 'nocharge').map(t => {
    const proj = projects.find(p => p.id === t.proj) || {};
    const info = projectInfo[t.proj] || {};
    const emp  = employees.find(e => e.initials === t.assign) || {};
    return { ...t, projName: proj.name || '—', projId: t.proj, empName: emp.name || t.assign || '—', clientName: info.clientName || '—' };
  }).sort((a,b) => (a.projName||'').localeCompare(b.projName||''));

  const totalVal  = tasks.reduce((s,t) => s + (t.fixedPrice||0), 0);
  const selVal    = tasks.filter(t => bqSelected.has(t._id)).reduce((s,t) => s + (t.fixedPrice||0), 0);
  const allChecked = tasks.length > 0 && tasks.every(t => bqSelected.has(t._id));

  el.innerHTML = `
    <div style="max-width:1000px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">&#x1F4B3; Billing Queue</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">All completed tasks ready to be billed — select and mark billed in bulk</div>
        </div>
        <button class="btn btn-ghost" style="font-size:12px" onclick="renderBillingQueue()">&#x21BB; Refresh</button>
        <button class="btn btn-ghost" style="font-size:12px;color:var(--red)" onclick="bulkMarkNoCharge()">🚫 Remove No Charge</button>
      </div>

      <div class="bq-summary">
        <div class="bq-sum-card">
          <div class="bq-sum-label">Ready to Bill</div>
          <div class="bq-sum-val" style="color:var(--green)">${fmt$(totalVal)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${tasks.length} task${tasks.length!==1?'s':''}</div>
        </div>
        <div class="bq-sum-card">
          <div class="bq-sum-label">Selected</div>
          <div class="bq-sum-val" style="color:#c084fc" id="bqSelVal">${fmt$(selVal)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px" id="bqSelCount">${bqSelected.size} task${bqSelected.size!==1?'s':''}</div>
        </div>
        <div class="bq-sum-card">
          <div class="bq-sum-label">Projects</div>
          <div class="bq-sum-val" style="color:var(--blue)">${new Set(tasks.map(t=>t.projId)).size}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">with complete tasks</div>
        </div>
      </div>

      ${tasks.length === 0 ? `
        <div style="text-align:center;padding:48px;color:var(--muted)">
          <div style="font-size:40px;margin-bottom:12px">&#x2705;</div>
          <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">All caught up!</div>
          <div style="font-size:13px">No completed tasks waiting to be billed.</div>
        </div>
      ` : `
        <div class="bq-toolbar">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;color:var(--muted)">
            <input type="checkbox" class="bq-cb" ${allChecked?'checked':''} onchange="bqToggleAll(this)" title="Select all">
            <span>${allChecked ? 'Deselect all' : 'Select all'} (${tasks.length})</span>
          </label>
          <div class="bq-sel-info" id="bqSelInfo">${bqSelected.size > 0 ? bqSelected.size+' selected — '+fmt$(selVal) : 'No tasks selected'}</div>
          <button class="btn" style="background:#c084fc;color:#fff;border-color:#c084fc;font-size:12px;padding:7px 18px;opacity:${bqSelected.size>0?1:0.4};pointer-events:${bqSelected.size>0?'auto':'none'}"
            onclick="confirmBulkBill()">&#x2714; Mark Selected as Billed</button>
        </div>

        <table class="bq-table">
          <thead><tr>
            <th class="check-col"></th>
            <th>Task</th>
            <th>Project</th>
            <th>Client</th>
            <th>Assignee</th>
            <th style="text-align:right">Price</th>
            <th>Completed Date</th>
            <th>PeachTree Inv #</th>
          </tr></thead>
          <tbody>
            ${tasks.map(t => `
              <tr class="${bqSelected.has(t._id)?'bq-selected':''}" onclick="bqToggleRow('${t._id}')" style="cursor:pointer">
                <td onclick="event.stopPropagation()">
                  <input type="checkbox" class="bq-cb" ${bqSelected.has(t._id)?'checked':''} onchange="bqToggleRow('${t._id}')">
                </td>
                <td>
                  ${t.taskNum?`<span style="font-size:10px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin-right:5px">#${t.taskNum}</span>`:''}
                  ${t.name}
                </td>
                <td><span class="bq-proj-badge">${t.projName}</span></td>
                <td style="font-size:12px;color:var(--muted)">${t.clientName}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px">
                    <div class="itt-av" style="background:${(employees.find(e=>e.initials===t.assign)||{color:'#555'}).color};width:20px;height:20px;font-size:9px">${t.assign||'?'}</div>
                    <span style="font-size:12px">${t.empName}</span>
                  </div>
                </td>
                <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green);font-weight:600">${t.fixedPrice ? fmt$(t.fixedPrice) : '—'}</td>
                <td style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${t.completedDate ? new Date(t.completedDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : (t.due||'—')}</td>
                <td onclick="event.stopPropagation()" style="padding:4px 8px">
                  <input type="text" value="${t.peachtreeInv||''}"
                    placeholder="INV-"
                    style="width:90px;background:${t.peachtreeInv?'var(--surface2)':'rgba(251,191,36,0.08)'};border:1px solid ${t.peachtreeInv?'var(--border)':'#f59e0b'};border-radius:5px;padding:4px 7px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text);outline:none"
                    onchange="savePeachtreeInv('${t._id}', this.value)"
                    onfocus="this.style.borderColor='var(--blue)'"
                    onblur="this.style.borderColor=this.value?'var(--border)':'#f59e0b'">
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="font-size:11px;color:var(--muted);padding:10px 12px;font-weight:600">TOTAL</td>
              <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--green);padding:10px 12px">${fmt$(totalVal)}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      `}
    </div>
  `;
}

function bqToggleRow(taskId) {
  if (bqSelected.has(taskId)) bqSelected.delete(taskId);
  else bqSelected.add(taskId);
  renderBillingQueue();
}

async function bulkNoChargeByProject(...namePatterns) {
  const patterns = namePatterns.map(n => n.toLowerCase());
  const matched = taskStore.filter(t => {
    const proj = projects.find(p => p.id === t.proj);
    if (!proj) return false;
    return patterns.some(pat => proj.name.toLowerCase().includes(pat));
  });
  if (!matched.length) { alert('No tasks found for: ' + namePatterns.join(', ')); return; }
  const already = matched.filter(t => t.revenueType === 'nocharge').length;
  const toUpdate = matched.filter(t => t.revenueType !== 'nocharge');
  if (!confirm(`Found ${matched.length} tasks across matched projects (${already} already No Charge).\nMark ${toUpdate.length} tasks as No Charge?`)) return;
  let done = 0;
  for (const t of toUpdate) {
    if (sb) await sb.from('tasks').update({ revenue_type: 'nocharge' }).eq('id', t._id);
    const i = taskStore.findIndex(x => x._id === t._id);
    if (i > -1) taskStore[i].revenueType = 'nocharge';
    done++;
  }
  alert('✓ ' + done + ' tasks marked as No Charge.');
  renderAllViews();
  if (activeProjectId) { renderTasksPanel(activeProjectId); renderInfoTasks(activeProjectId, currentTaskFilter); }
}
window.bulkNoChargeByProject = bulkNoChargeByProject;

async function bulkMarkNoCharge() {
  const noCh = taskStore.filter(t =>
    t.status === 'complete' && t.revenueType !== 'nocharge' &&
    (t.name.toLowerCase().includes('no charge') || t.name.toLowerCase().includes('(no charge)') || t.name.toLowerCase().includes('no-charge'))
  );
  if (!noCh.length) { toast('No "No Charge" tasks found in billing queue'); return; }
  if (!confirm('Mark ' + noCh.length + ' tasks as No Charge and remove from billing queue?')) return;
  let done = 0;
  for (const t of noCh) {
    if (sb) await sb.from('tasks').update({ revenue_type: 'nocharge' }).eq('id', t._id);
    const i = taskStore.findIndex(x => x._id === t._id);
    if (i > -1) taskStore[i].revenueType = 'nocharge';
    done++;
  }
  toast('✓ ' + done + ' tasks marked as No Charge');
  renderBillingQueue();
}

function bqToggleAll(cb) {
  const tasks = taskStore.filter(t => t.status === 'complete');
  if (cb.checked) tasks.forEach(t => bqSelected.add(t._id));
  else bqSelected.clear();
  renderBillingQueue();
}

async function savePeachtreeInv(taskId, val) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  t.peachtreeInv = val.trim();
  if (sb) sb.from('tasks').update({ peachtree_inv: t.peachtreeInv || null }).eq('id', taskId)
    .then(({error}) => { if (error) console.error('savePeachtreeInv', error); });
}

function confirmBulkBill() {
  if (bqSelected.size === 0) return;
  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const selTasks = taskStore.filter(t => bqSelected.has(t._id));
  const missing = selTasks.filter(t => !t.peachtreeInv);
  if (missing.length > 0) {
    toast(`⚠ ${missing.length} task${missing.length>1?'s':''} missing PeachTree Inv # — required before billing`, 'error');
    return;
  }
  const selVal = selTasks.reduce((s,t) => s + (t.fixedPrice||0), 0);
  showConfirmModal(
    `Mark ${bqSelected.size} task${bqSelected.size!==1?'s':''} (${fmt$(selVal)}) as Billed? This will update their status across all projects.`,
    bulkMarkBilled,
    { title: 'Confirm Billing', btnTxt: 'Yes, Mark Billed', color: '#c084fc', icon: '&#x1F4B3;' }
  );
}

async function bulkMarkBilled() {
  const ids = [...bqSelected];
  const today = new Date().toISOString().split('T')[0];
  ids.forEach(id => {
    const t = taskStore.find(x => x._id === id);
    if (!t) return;
    t.status = 'billed';
    if (!t.billedDate)    t.billedDate    = today;
    if (!t.completedDate) t.completedDate = today;
  });
  if (sb) {
    for (const id of ids) {
      const t = taskStore.find(x => x._id === id);
      const { error } = await sb.from('tasks').update({
        status:         'billed',
        billed_date:    t.billedDate,
        completed_date: t.completedDate,
      }).eq('id', id);
      if (error) console.error('bulkMarkBilled', error);
    }
  }
  bqSelected.clear();
  renderBillingQueue();
  renderReportsOverview();
  renderDashboard();
}

function openReportsPanel(navEl) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-reports').classList.add('active');
  if (navEl) navEl.classList.add('active');
  // Default to billing queue tab
  document.querySelectorAll('.reports-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.reports-tab-panel').forEach(t => t.classList.remove('active'));
  const billingTab = document.querySelector('[data-tab="tab-billing"]');
  const billingPanel = document.getElementById('tab-billing');
  if (billingTab) billingTab.classList.add('active');
  if (billingPanel) billingPanel.classList.add('active');
  renderBillingQueue();
}

function switchReportsTab(el) {
  document.querySelectorAll('.reports-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.reports-tab-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(el.dataset.tab).classList.add('active');
  if (el.dataset.tab === 'tab-billing') renderBillingQueue();
  if (el.dataset.tab === 'tab-timesheets') renderTimesheetsReport();
  if (el.dataset.tab === 'tab-employees') renderReportsEmployees();
  if (el.dataset.tab === 'tab-stale') renderStaleProjects();
}

function renderTimesheetsReport(filterEmp, filterStatus) {
  const el = document.getElementById('tab-timesheets');
  if (!el) return;

  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

  // Build list of all week statuses
  let entries = Object.values(tsWeekStatuses).map(ws => {
    const emp = employees.find(e => e.id === ws.employeeId) || {};
    // Calculate total hours for this week
    const storeKey = ws.employeeId + '|' + ws.weekKey;
    let totalHrs = 0;
    (tsData[storeKey] || []).forEach(r => Object.values(r.hours||{}).forEach(h => totalHrs += (parseFloat(h)||0)));
    const ohStore = tsData['oh_' + storeKey] || {};
    OVERHEAD_CATS.forEach(cat => Object.values(ohStore[cat]||{}).forEach(h => totalHrs += (parseFloat(h)||0)));
    return { ...ws, empName: emp.name||'—', empColor: emp.color||'#555', empInitials: emp.initials||'?', totalHrs };
  });

  // Excluded employees by name or department
  const EXCLUDED_EMP_NAMES = ['Russ McAdoo', 'Jordan McAdoo'];
  const EXCLUDED_EMP_DEPT  = 'Ballantine';

  // Eligible active employees for timesheet audit (strip exclusions)
  const eligibleEmps = employees.filter(e =>
    !EXCLUDED_EMP_NAMES.includes(e.name) &&
    (e.dept || '').toLowerCase() !== EXCLUDED_EMP_DEPT.toLowerCase() &&
    e.isActive !== false
  );
  const eligibleEmpIds = new Set(eligibleEmps.map(e => e.id));

  // Remove excluded employees from existing entries
  entries = entries.filter(ws => eligibleEmpIds.has(ws.employeeId));

  // For every week that already has at least one submission, add a
  // "not_submitted" placeholder for any eligible employee who is missing.
  const allWeekKeys = [...new Set(entries.map(e => e.weekKey))];
  allWeekKeys.forEach(wk => {
    const submittedIds = new Set(entries.filter(e => e.weekKey === wk).map(e => e.employeeId));
    eligibleEmps.forEach(emp => {
      if (!submittedIds.has(emp.id)) {
        entries.push({
          employeeId:    emp.id,
          weekKey:       wk,
          status:        'not_submitted',
          empName:       emp.name    || '—',
          empColor:      emp.color   || '#555',
          empInitials:   emp.initials|| '?',
          totalHrs:      0,
          submittedAt:   null,
          approvedBy:    null,
          rejectionNote: null,
        });
      }
    });
  });

  // Sort newest week first, then by employee name
  entries.sort((a,b) => b.weekKey.localeCompare(a.weekKey) || a.empName.localeCompare(b.empName));

  // Filter
  const selEmp    = filterEmp    || el.dataset.filterEmp    || '';
  const selStatus = filterStatus || el.dataset.filterStatus || '';
  el.dataset.filterEmp    = selEmp;
  el.dataset.filterStatus = selStatus;
  const filtered = entries.filter(e =>
    (!selEmp    || e.employeeId === selEmp) &&
    (!selStatus || e.status === selStatus)
  );

  const uniqueEmps = eligibleEmps
    .map(e => ({ id: e.id, name: e.name }))
    .sort((a,b) => a.name.localeCompare(b.name));

  const statusBadge = s => ({
    not_submitted: '<span style="background:rgba(224,92,92,0.12);color:#e05c5c;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⚠ Not Submitted</span>',
    submitted: '<span style="background:rgba(232,162,52,0.15);color:#e8a234;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⏳ Pending</span>',
    approved:  '<span style="background:rgba(76,175,125,0.15);color:#4caf7d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✓ Approved</span>',
    rejected:  '<span style="background:rgba(224,92,92,0.15);color:#e05c5c;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✗ Rejected</span>',
  }[s] || '<span style="color:var(--muted);font-size:10px">Draft</span>');

  const fmtWeek = wk => { const sat = new Date(wk+'T00:00:00'); sat.setDate(sat.getDate()+6); return sat.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };

  el.innerHTML = `
    <div style="max-width:1100px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">&#x1F4C5; Timesheet History</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${entries.filter(e=>e.status!=='not_submitted').length} submission${entries.filter(e=>e.status!=='not_submitted').length!==1?'s':''} · ${entries.filter(e=>e.status==='not_submitted').length} not submitted · ${uniqueEmps.length} employee${uniqueEmps.length!==1?'s':''}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select onchange="renderTimesheetsReport(this.value, '${selStatus}')"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif">
            <option value="">All Employees</option>
            ${uniqueEmps.map(e => `<option value="${e.id}" ${selEmp===e.id?'selected':''}>${e.name}</option>`).join('')}
          </select>
          <select onchange="renderTimesheetsReport('${selEmp}', this.value)"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif">
            <option value="">All Statuses</option>
            <option value="submitted"     ${selStatus==='submitted'    ?'selected':''}>Pending</option>
            <option value="approved"      ${selStatus==='approved'     ?'selected':''}>Approved</option>
            <option value="rejected"      ${selStatus==='rejected'     ?'selected':''}>Rejected</option>
            <option value="not_submitted" ${selStatus==='not_submitted'?'selected':''}>Not Submitted</option>
          </select>
        </div>
      </div>

      ${filtered.length === 0 ? `<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">📭</div><div>No timesheets match the selected filters.</div></div>` : (() => {
        // Group by week, then deduplicate employee entries within each week
        const weekMap = {};
        filtered.forEach(ws => {
          if (!weekMap[ws.weekKey]) weekMap[ws.weekKey] = [];
          // Deduplicate: keep only one entry per employee per week (latest status)
          const existing = weekMap[ws.weekKey].find(e => e.employeeId === ws.employeeId);
          if (!existing) {
            weekMap[ws.weekKey].push(ws);
          } else {
            // Keep the most recent/relevant status: approved > submitted > rejected > draft
            const priority = {approved:3, submitted:2, rejected:1};
            if ((priority[ws.status]||0) > (priority[existing.status]||0)) {
              const idx = weekMap[ws.weekKey].indexOf(existing);
              weekMap[ws.weekKey][idx] = ws;
            }
          }
        });
        const sortedWeeks = Object.keys(weekMap).sort((a,b) => b.localeCompare(a));
        let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:2px solid var(--border)">' +
          '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Employee</th>' +
          '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Week Ending</th>' +
          '<th style="text-align:center;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Status</th>' +
          '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Hours</th>' +
          '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Notes</th>' +
          '<th style="padding:8px 12px"></th></tr></thead><tbody>';
        sortedWeeks.forEach(wk => {
          const rows = weekMap[wk].sort((a,b) => a.empName.localeCompare(b.empName));
          const weekTotal = rows.reduce((s,r) => s + r.totalHrs, 0);
          // Week subtotal header row
          const sat = new Date(wk+'T00:00:00'); sat.setDate(sat.getDate()+6);
          const weekLabel = sat.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
          html += '<tr style="background:var(--surface2);border-top:2px solid var(--border)">' +
            '<td colspan="3" style="padding:7px 12px;font-size:11px;font-weight:700;color:var(--text);letter-spacing:.3px">Week ending ' + weekLabel + '</td>' +
            '<td style="padding:7px 12px;text-align:right;font-family:JetBrains Mono,monospace;font-size:12px;font-weight:700;color:var(--amber)">' + weekTotal.toFixed(1) + 'h</td>' +
            '<td colspan="2" style="padding:7px 12px;text-align:right"><button onclick="printPayrollWeek(\'' + wk + '\')" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:4px 14px;font-size:11px;font-weight:600;cursor:pointer">&#x1F5A8; Print Payroll</button></td></tr>';
          rows.forEach(ws => {
            const rowStyle = 'border-bottom:1px solid var(--border);transition:background .12s';
            const hrsColor = ws.totalHrs > 0 ? 'var(--text)' : 'var(--muted)';
            const noteText = ws.rejectionNote ? '&#x2717; '+ws.rejectionNote : ws.approvedBy ? '&#x2713; Approved' : '&mdash;';
            html += '<tr style="' + rowStyle + '" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">'+
              '<td style="padding:9px 12px 9px 24px"><div style="display:flex;align-items:center;gap:8px">'+
              '<div style="width:26px;height:26px;border-radius:50%;background:' + ws.empColor + ';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">' + ws.empInitials + '</div>'+
              '<span style="font-size:13px;font-weight:500">' + ws.empName + '</span></div></td>'+
              '<td style="padding:9px 12px;font-family:JetBrains Mono,monospace;font-size:11px;color:var(--muted)">' + weekLabel + '</td>'+
              '<td style="padding:9px 12px;text-align:center">' + statusBadge(ws.status) + '</td>'+
              '<td style="padding:9px 12px;text-align:right;font-family:JetBrains Mono,monospace;font-size:13px;font-weight:600;color:' + hrsColor + '">' + ws.totalHrs.toFixed(1) + 'h</td>'+
              '<td style="padding:9px 12px;font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + noteText + '</td>'+
              '<td style="padding:9px 12px;text-align:right"><button onclick="viewEmployeeTimesheet(\''+ws.employeeId+'\',\''+ws.weekKey+'\');" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 12px;font-size:11px;color:var(--text);cursor:pointer">View</button></td></tr>';
          });
        });
        html += '</tbody></table>';
        return html;
      })()}
    </div>
  `;
}

// ── Payroll Print Summary ────────────────────────────────────────────────
function printPayrollWeek(weekKey) {
  const EXCLUDED_NAMES = ['Russ McAdoo', 'Jordan McAdoo'];
  const EXCLUDED_DEPT  = 'Ballantine';
  const eligible = employees.filter(e =>
    !EXCLUDED_NAMES.includes(e.name) &&
    (e.dept || '').toLowerCase() !== EXCLUDED_DEPT.toLowerCase() &&
    e.isActive !== false
  );

  const sat = new Date(weekKey + 'T00:00:00'); sat.setDate(sat.getDate() + 6);
  const weekLabel = sat.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function getEmpHours(emp) {
    const storeKey = emp.id + '|' + weekKey;
    const rows     = tsData[storeKey] || [];
    const ohStore  = tsData['oh_' + storeKey] || {};
    let projHrs = 0;
    rows.forEach(r => Object.values(r.hours || {}).forEach(h => projHrs += parseFloat(h) || 0));
    const ohCat = cat => Object.values(ohStore[cat] || {}).reduce((s, h) => s + (parseFloat(h) || 0), 0);
    const genOh   = ohCat('General Overhead') + ohCat('Sales Support');
    const sick    = ohCat('Sick');
    const vac     = ohCat('Vacation Time');
    const pt      = ohCat('Personal Time');
    const holiday = ohCat('Holiday');
    const snow    = ohCat('Snow Day');
    const total   = projHrs + genOh + sick + vac + pt + holiday + snow;
    return { projHrs, genOh, sick, vac, pt, holiday, snow, total };
  }

  const submittedIds = new Set(
    Object.values(tsWeekStatuses)
      .filter(ws => ws.weekKey === weekKey)
      .map(ws => ws.employeeId)
  );
  const empsToShow = eligible
    .filter(e => { const h = getEmpHours(e); return h.total > 0 || submittedIds.has(e.id); })
    .sort((a, b) => a.name.localeCompare(b.name));

  const fmtH = h => h > 0 ? h.toFixed(1) : '—';
  const empData = empsToShow.map(e => ({ emp: e, hrs: getEmpHours(e) }));

  const catRows = [
    { label: 'Project Total',  key: 'projHrs' },
    { label: 'Overhead Total', key: 'genOh'   },
    { label: 'Sick Total',     key: 'sick'    },
    { label: 'Vacation Total', key: 'vac'     },
    { label: 'PT Total',       key: 'pt'      },
    { label: 'Holiday Total',  key: 'holiday' },
    { label: 'Snow Day Total', key: 'snow'    },
  ];

  const tableHTML = '<table>' +
    '<thead><tr><th class="lc">Category</th>' +
    empsToShow.map(e => {
      const parts = e.name.split(' ');
      const first = parts[0];
      const last  = parts.slice(1).join(' ');
      return '<th>' + first + (last ? '<br><span style="font-weight:400;font-size:9px">' + last + '</span>' : '') + '</th>';
    }).join('') +
    '</tr></thead><tbody>' +
    catRows.map(r =>
      '<tr><td class="lc">' + r.label + '</td>' +
      empData.map(d => '<td>' + fmtH(d.hrs[r.key]) + '</td>').join('') +
      '</tr>'
    ).join('') +
    '<tr class="div-row"><td colspan="' + (empsToShow.length + 1) + '"></td></tr>' +
    '<tr class="tot"><td class="lc">Weekly Sum</td>' +
    empData.map(d => '<td>' + fmtH(d.hrs.total) + '</td>').join('') +
    '</tr></tbody></table>';

  const win = window.open('', '_blank', 'width=1000,height=650');
  win.document.write('<!DOCTYPE html><html><head><title>Payroll Summary — Week Ending ' + weekLabel + '</title>' +
    '<style>' +
    '* { box-sizing:border-box; margin:0; padding:0; }' +
    'body { font-family:Arial,sans-serif; font-size:11px; color:#111; padding:24px; }' +
    'h2 { font-size:15px; margin-bottom:4px; }' +
    '.sub { font-size:11px; color:#555; margin-bottom:18px; }' +
    'table { border-collapse:collapse; width:100%; }' +
    'th,td { border:1px solid #ccc; padding:5px 8px; text-align:center; }' +
    'th { background:#f0f0f0; font-weight:700; font-size:10px; }' +
    'th.lc,td.lc { text-align:left; font-weight:600; background:#fafafa; min-width:110px; }' +
    'tr:nth-child(even) td { background:#f9f9f9; }' +
    'tr:nth-child(even) td.lc { background:#f4f4f4; }' +
    '.tot td { font-weight:700; background:#dbeafe !important; border-top:2px solid #333; }' +
    '.div-row td { border:none; padding:3px; background:transparent !important; }' +
    '@media print { body { padding:12px; } }' +
    '</style></head><body>' +
    '<h2>Payroll Summary</h2>' +
    '<div class="sub">Week Ending: <strong>' + weekLabel + '</strong> &nbsp;|&nbsp; ' + empsToShow.length + ' employee' + (empsToShow.length !== 1 ? 's' : '') + ' &nbsp;|&nbsp; Printed: ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + '</div>' +
    tableHTML +
    '<scr' + 'ipt>window.onload=()=>{window.print();}</scr' + 'ipt>' +
    '</body></html>');
  win.document.close();
}
window.printPayrollWeek = printPayrollWeek;

// ── Overview Report ──────────────────────────────────────────────────────
function renderReportsOverview() {
  const el = document.getElementById('tab-overview');
  if (!el) return;

  // Only include non-closed projects in all calculations
  const openProjIds = new Set(projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').map(p => p.id));
  const openTasks   = taskStore.filter(t => openProjIds.has(t.proj));

  const totalProj  = projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').length;
  const activeProj = projects.filter(p => (projectInfo[p.id]||{}).status === 'active').length;
  const totalTasks = openTasks.length;
  const doneTasks  = openTasks.filter(t => t.done || t.status === 'complete' || t.status === 'billed').length;
  const overdue    = openTasks.filter(t => t.overdue && !t.done).length;
  const totalRev   = [...openProjIds].reduce((s,id) => s + (projectInfo[id]?.contractValue||0), 0);
  const billedRev  = openTasks.filter(t => t.status==='billed').reduce((s,t) => s+(t.fixedPrice||0), 0);
  const readyRev   = openTasks.filter(t => t.status==='complete').reduce((s,t) => s+(t.fixedPrice||0), 0);
  const fmt$ = n => '$' + n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  // Status breakdown for pie chart (exclude closed)
  const statusCounts = {};
  projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').forEach(p => {
    const s = (projectInfo[p.id]||{}).status || 'unknown';
    statusCounts[s] = (statusCounts[s]||0) + 1;
  });
  const statusLabels = { active:'Active', pending:'Pending', onhold:'On Hold', complete:'Complete', closed:'Closed', jobprep:'Job Prep', pendretest:'Pend-Retest', testcomplete:'Test Complete' };
  const statusColors = ['#4caf7d','#e8a234','#7a7a85','#888899','#5b9cf6','#a78bfa','#fb923c','#2dd4bf'];

  el.innerHTML = `
    <div class="report-stat-grid">
      <div class="report-stat"><div class="report-stat-label">Total Projects</div><div class="report-stat-val" style="color:var(--blue)">${totalProj}</div></div>
      <div class="report-stat"><div class="report-stat-label">Active Projects</div><div class="report-stat-val" style="color:var(--green)">${activeProj}</div></div>
      <div class="report-stat"><div class="report-stat-label">Total Tasks</div><div class="report-stat-val" style="color:var(--text)">${totalTasks}</div></div>
      <div class="report-stat"><div class="report-stat-label">Tasks Complete</div><div class="report-stat-val" style="color:var(--green)">${doneTasks}</div></div>
      <div class="report-stat"><div class="report-stat-label">Overdue Tasks</div><div class="report-stat-val" style="color:var(--red)">${overdue}</div></div>
      <div class="report-stat"><div class="report-stat-label">Billed Revenue</div><div class="report-stat-val" style="color:#c084fc">${fmt$(billedRev)}</div></div>
      <div class="report-stat"><div class="report-stat-label">Ready to Bill</div><div class="report-stat-val" style="color:var(--amber)">${fmt$(readyRev)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px">
      <div class="report-card">
        <div class="report-card-title">&#x1F4C1; Projects by Status</div>
        <canvas id="chartProjStatus" height="220"></canvas>
      </div>
      <div class="report-card">
        <div class="report-card-title">&#x2705; Task Completion</div>
        <canvas id="chartTaskStatus" height="220"></canvas>
      </div>
    </div>
  `;

  // Chart 1: Projects by status (doughnut)
  setTimeout(() => {
    const keys = Object.keys(statusCounts);
    new Chart(document.getElementById('chartProjStatus'), {
      type: 'doughnut',
      data: {
        labels: keys.map(k => statusLabels[k]||k),
        datasets: [{ data: keys.map(k => statusCounts[k]), backgroundColor: statusColors, borderWidth: 2, borderColor: 'var(--surface)' }]
      },
      options: { responsive:true, plugins:{ legend:{ position:'right', labels:{ color:'#9a9aaa', font:{size:11} } } } }
    });

    // Chart 2: Task status breakdown (bar)
    const tStatusCounts = {};
    taskStore.forEach(t => { const s = t.status||'new'; tStatusCounts[s]=(tStatusCounts[s]||0)+1; });
    const tKeys = ['new','inprogress','prohold','accthold','complete','cancelled','billed'];
    const tLabels = { new:'New', inprogress:'In Progress', prohold:'Prod Hold', accthold:'Acct Hold', complete:'Complete', cancelled:'Cancelled', billed:'Billed' };
    const tColors = { new:'#7a7a85', inprogress:'#4caf7d', prohold:'#e8a234', accthold:'#e05c5c', complete:'#888899', cancelled:'#5b7fa6', billed:'#c084fc' };
    new Chart(document.getElementById('chartTaskStatus'), {
      type: 'bar',
      data: {
        labels: tKeys.map(k => tLabels[k]),
        datasets: [{ data: tKeys.map(k => tStatusCounts[k]||0), backgroundColor: tKeys.map(k => tColors[k]+'cc'), borderColor: tKeys.map(k => tColors[k]), borderWidth:1.5, borderRadius:5 }]
      },
      options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ ticks:{color:'#9a9aaa',font:{size:10}} ,grid:{display:false}}, y:{ ticks:{color:'#9a9aaa',font:{size:10},stepSize:1}, grid:{color:'rgba(255,255,255,0.05)'} } } }
    });
  }, 50);
}

// ── Tasks Report ─────────────────────────────────────────────────────────
function renderReportsTasks() {
  const el = document.getElementById('tab-tasks');
  if (!el) return;

  const byEmployee = {};
  employees.forEach(e => { byEmployee[e.initials] = { name:e.name, color:e.color, total:0, done:0, overdue:0 }; });
  taskStore.forEach(t => {
    const k = t.assign;
    if (!byEmployee[k]) byEmployee[k] = { name:k||'Unassigned', color:'#555', total:0, done:0, overdue:0 };
    byEmployee[k].total++;
    if (t.done || t.status==='complete' || t.status==='billed') byEmployee[k].done++;
    if (t.overdue && !t.done) byEmployee[k].overdue++;
  });

  const empKeys = Object.keys(byEmployee).filter(k => byEmployee[k].total > 0);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="report-card">
        <div class="report-card-title">&#x1F4CB; Tasks by Employee</div>
        <canvas id="chartTasksByEmp" height="260"></canvas>
      </div>
      <div class="report-card">
        <div class="report-card-title">&#x1F6A8; Overdue Tasks by Employee</div>
        <canvas id="chartOverdueByEmp" height="260"></canvas>
      </div>
    </div>
    <div class="report-card" style="margin-top:0">
      <div class="report-card-title">&#x1F4CB; Task Detail by Employee</div>
      <table class="ai-report-table">
        <thead><tr><th>Employee</th><th>Total</th><th>Done</th><th>Active</th><th>Overdue</th><th>Completion</th></tr></thead>
        <tbody>${empKeys.map(k => {
          const e = byEmployee[k];
          const pct = e.total > 0 ? Math.round(e.done/e.total*100) : 0;
          return `<tr>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="itt-av" style="background:${e.color};width:22px;height:22px;font-size:9px">${k||'?'}</div>${e.name}</div></td>
            <td style="font-family:'JetBrains Mono',monospace">${e.total}</td>
            <td style="color:var(--green);font-family:'JetBrains Mono',monospace">${e.done}</td>
            <td style="font-family:'JetBrains Mono',monospace">${e.total-e.done}</td>
            <td style="color:${e.overdue>0?'var(--red)':'var(--muted)'};font-family:'JetBrains Mono',monospace">${e.overdue}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:var(--border);border-radius:3px"><div style="width:${pct}%;height:100%;background:var(--green);border-radius:3px"></div></div><span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted)">${pct}%</span></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;

  setTimeout(() => {
    new Chart(document.getElementById('chartTasksByEmp'), {
      type: 'bar',
      data: {
        labels: empKeys.map(k => byEmployee[k].name.split(' ')[0]),
        datasets: [
          { label:'Done', data: empKeys.map(k=>byEmployee[k].done), backgroundColor:'#4caf7dcc', borderRadius:4 },
          { label:'Active', data: empKeys.map(k=>byEmployee[k].total-byEmployee[k].done), backgroundColor:'#5b9cf6cc', borderRadius:4 }
        ]
      },
      options: { responsive:true, plugins:{ legend:{labels:{color:'#9a9aaa',font:{size:11}}} }, scales:{ x:{stacked:true,ticks:{color:'#9a9aaa',font:{size:10}},grid:{display:false}}, y:{stacked:true,ticks:{color:'#9a9aaa',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}} } }
    });
    new Chart(document.getElementById('chartOverdueByEmp'), {
      type: 'bar',
      data: {
        labels: empKeys.map(k => byEmployee[k].name.split(' ')[0]),
        datasets: [{ label:'Overdue', data: empKeys.map(k=>byEmployee[k].overdue), backgroundColor: empKeys.map(k=>byEmployee[k].overdue>0?'#e05c5ccc':'#7a7a8555'), borderRadius:4 }]
      },
      options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{color:'#9a9aaa',font:{size:10}},grid:{display:false}}, y:{ticks:{color:'#9a9aaa',font:{size:10},stepSize:1},grid:{color:'rgba(255,255,255,0.05)'}} } }
    });
  }, 50);
}

// ── Employees Report ─────────────────────────────────────────────────────
function empReportSetYear(y){var el=document.getElementById('tab-employees');if(el){el.dataset.filterYear=y;renderReportsEmployees();}}

function renderReportsEmployees() {
  const el = document.getElementById('tab-employees');
  if (!el) return;

  const activeEmps = employees.filter(e => e.isActive !== false && !e.isOwner);

  const monthSet = new Set();
  Object.keys(tsData).forEach(k => {
    if (k.startsWith('oh_')) return;
    const parts = k.split('|');
    if (parts.length !== 2 || !parts[1] || parts[1].length < 7) return;
    monthSet.add(parts[1].slice(0, 7));
  });
  const months = [...monthSet].sort();

  if (months.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center">No timesheet data available.</div>';
    return;
  }

  function getMonthHours(empId, yearMonth) {
    let total = 0;
    Object.keys(tsData).forEach(k => {
      if (!k.startsWith(empId + '|')) return;
      const weekDate = k.split('|')[1];
      if (!weekDate || weekDate.slice(0, 7) !== yearMonth) return;
      const rows = tsData[k];
      if (!Array.isArray(rows)) return;
      rows.forEach(r => {
        if (r.hours) total += Object.values(r.hours).reduce((s, h) => s + (parseFloat(h) || 0), 0);
      });
    });
    Object.keys(tsData).forEach(k => {
      if (!k.startsWith('oh_' + empId + '|')) return;
      const weekDate = k.split('|')[1];
      if (!weekDate || weekDate.slice(0, 7) !== yearMonth) return;
      const ohData = tsData[k];
      if (!ohData || typeof ohData !== 'object') return;
      Object.values(ohData).forEach(dayMap => {
        if (dayMap && typeof dayMap === 'object') {
          Object.values(dayMap).forEach(h => { total += parseFloat(h) || 0; });
        }
      });
    });
    return total;
  }

  const fmtMonth = ym => {
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const currentYear = new Date().getFullYear();
  const allYears = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse();
  const selYear = el.dataset.filterYear || String(currentYear);
  el.dataset.filterYear = selYear;
  const filteredMonths = months.filter(m => m.startsWith(selYear));

  const sortedEmps = [...activeEmps].sort((a, b) => a.name.localeCompare(b.name));
  const colTotals = {};
  filteredMonths.forEach(m => { colTotals[m] = 0; });
  let grandTotal = 0;

  const empHours = sortedEmps.map(emp => {
    const monthHours = {};
    let empYTD = 0;
    filteredMonths.forEach(m => {
      const h = getMonthHours(emp.id, m);
      monthHours[m] = h;
      colTotals[m] += h;
      empYTD += h;
      grandTotal += h;
    });
    return { emp, monthHours, empYTD };
  });

  let yearOpts = allYears.map(y => '<option value="' + y + '"' + (y === selYear ? ' selected' : '') + '>' + y + '</option>').join('');
  let headCols = filteredMonths.map(m => '<th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap">' + fmtMonth(m) + '</th>').join('');

  let bodyHtml = '';
  empHours.forEach(function(item, idx) {
    const emp = item.emp, monthHours = item.monthHours, empYTD = item.empYTD;
    const bg = idx % 2 === 1 ? 'var(--surface)' : '';
    const bgOut = idx % 2 === 1 ? 'var(--surface)' : '';
    let cells = filteredMonths.map(function(m) {
      const h = monthHours[m];
      return '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid var(--border);font-family:JetBrains Mono,monospace;font-size:12px;color:' + (h === 0 ? 'var(--muted)' : 'var(--text)') + '">' + (h > 0 ? h.toFixed(1) : '&mdash;') + '</td>';
    }).join('');
    bodyHtml += '<tr style="' + (bg ? 'background:' + bg : '') + '">' +
      '<td style="padding:10px 16px;border-bottom:1px solid var(--border)">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<div style="width:28px;height:28px;border-radius:50%;background:' + emp.color + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0">' + emp.initials + '</div>' +
          '<div><div style="font-size:13px;font-weight:500;color:var(--text)">' + emp.name + '</div>' +
          (emp.dept ? '<div style="font-size:10px;color:var(--muted)">' + emp.dept + '</div>' : '') + '</div>' +
        '</div></td>' +
      cells +
      '<td style="padding:10px 12px;text-align:center;border-bottom:1px solid var(--border);border-left:1px solid var(--border);font-family:JetBrains Mono,monospace;font-size:13px;font-weight:700;color:var(--amber)">' + (empYTD > 0 ? empYTD.toFixed(1) : '&mdash;') + '</td></tr>';
  });

  let footCols = filteredMonths.map(function(m) {
    return '<td style="padding:10px 12px;text-align:center;font-family:JetBrains Mono,monospace;font-size:13px;font-weight:700;color:var(--amber);border-top:2px solid var(--border)">' + (colTotals[m] > 0 ? colTotals[m].toFixed(1) : '&mdash;') + '</td>';
  }).join('');

  el.innerHTML = '<div style="max-width:1200px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">' +
      '<div><div style="font-family:DM Serif Display,serif;font-size:22px;color:var(--text)">&#x1F465; Employee Hours</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:2px">Monthly hours per employee</div></div>' +
      '<select onchange="empReportSetYear(this.value)" ' +
        'style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--text)">' +
        yearOpts + '</select></div>' +
    '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">' +
      '<table style="width:100%;border-collapse:collapse;min-width:600px">' +
        '<thead><tr style="background:var(--surface)">' +
          '<th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);min-width:160px">Employee</th>' +
          headCols +
          '<th style="padding:10px 12px;text-align:center;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--amber);border-bottom:1px solid var(--border);border-left:1px solid var(--border)">YTD Total</th>' +
        '</tr></thead>' +
        '<tbody>' + bodyHtml + '</tbody>' +
        '<tfoot><tr style="background:var(--surface)">' +
          '<td style="padding:10px 16px;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Total</td>' +
          footCols +
          '<td style="padding:10px 12px;text-align:center;font-family:JetBrains Mono,monospace;font-size:14px;font-weight:700;color:var(--amber);border-top:2px solid var(--border);border-left:1px solid var(--border)">' + grandTotal.toFixed(1) + '</td>' +
        '</tr></tfoot>' +
      '</table></div></div>';
}

// ===== STALE PROJECTS REPORT =====
// ===== STALE PROJECTS REPORT =====
async function renderStaleProjects() {
  const el = document.getElementById('tab-stale');
  if (!el) return;

  const days = parseInt(el.dataset.days || '45');
  el.dataset.days = days;

  el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center">&#x23F3; Loading activity data...</div>';

  // Open (non-closed) projects only
  const openProjects = projects.filter(p => {
    const st = (projectInfo[p.id] || {}).status;
    return st !== 'closed';
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Fetch last activity_log entry per project
  let lastActivity = {}; // projId -> { date, description }

  try {
    if (sb && openProjects.length > 0) {
      const projIds = openProjects.map(p => p.id);

      // Get most recent activity_log entry per project
      const { data: logRows } = await sb.from('activity_log')
        .select('record_id, created_at, field_changed, new_value, employee_name, record_type, record_label')
        .in('record_id', projIds)
        .order('created_at', { ascending: false })
        .limit(2000);

      (logRows || []).forEach(r => {
        if (!lastActivity[r.record_id] || r.created_at > lastActivity[r.record_id].date) {
          lastActivity[r.record_id] = {
            date: r.created_at,
            desc: (r.employee_name || 'Unknown') + ' updated ' + (r.field_changed || 'field') + (r.new_value ? ' to "' + String(r.new_value).slice(0, 40) + '"' : ''),
            type: 'log'
          };
        }
      });

      // Also check task activity_log entries (record_id is task id, not proj id)
      // Get tasks for open projects and their last log entry
      const taskIds = taskStore.filter(t => projIds.includes(t.proj)).map(t => t._id);
      if (taskIds.length > 0) {
        const { data: taskLogRows } = await sb.from('activity_log')
          .select('record_id, created_at, field_changed, new_value, employee_name')
          .in('record_id', taskIds)
          .order('created_at', { ascending: false })
          .limit(3000);

        (taskLogRows || []).forEach(r => {
          const task = taskStore.find(t => t._id === r.record_id);
          if (!task) return;
          const projId = task.proj;
          if (!lastActivity[projId] || r.created_at > lastActivity[projId].date) {
            lastActivity[projId] = {
              date: r.created_at,
              desc: (r.employee_name || 'Unknown') + ' updated task "' + task.name.slice(0, 40) + '"',
              type: 'task'
            };
          }
        });
      }

      // Also check chatter
      const { data: chatRows } = await sb.from('chatter')
        .select('proj_id, created_at, author_name, text')
        .in('proj_id', projIds)
        .order('created_at', { ascending: false })
        .limit(1000);

      (chatRows || []).forEach(r => {
        if (!lastActivity[r.proj_id] || r.created_at > lastActivity[r.proj_id].date) {
          lastActivity[r.proj_id] = {
            date: r.created_at,
            desc: (r.author_name || 'Unknown') + ' posted: "' + String(r.text || '').slice(0, 60) + '"',
            type: 'chatter'
          };
        }
      });
    }
  } catch(e) {
    console.warn('Stale projects query error:', e);
  }

  const now = new Date();
  const daysSince = date => Math.floor((now - new Date(date)) / 86400000);
  const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const typeIcon = t => t === 'chatter' ? '&#x1F4AC;' : t === 'task' ? '&#x2705;' : '&#x1F4CB;';

  // Build stale list
  const staleRows = openProjects.map(p => {
    const act = lastActivity[p.id];
    const lastDate = act ? act.date : (p.createdAt || null);
    const age = lastDate ? daysSince(lastDate) : 9999;
    const info = projectInfo[p.id] || {};
    return { p, act, lastDate, age, info };
  }).filter(r => r.age >= days)
    .sort((a, b) => b.age - a.age);

  const statusColors = {
    jobprep: '#e8a234', active: '#4caf7d', inprogress: '#4caf7d',
    prohold: '#e05c5c', accthold: '#e05c5c', complete: '#888899',
    cancelled: '#5b7fa6', billed: '#c084fc'
  };
  const statusLabels = {
    jobprep: 'Job Prep', active: 'Active', inprogress: 'In Progress',
    prohold: 'Production Hold', accthold: 'Accounting Hold',
    complete: 'Complete', cancelled: 'Cancelled', billed: 'Billed'
  };

  let dayOptions = [14, 30, 45, 60, 90, 120].map(d =>
    '<option value="' + d + '"' + (d === days ? ' selected' : '') + '>' + d + ' days</option>'
  ).join('');

  let rows = '';
  if (staleRows.length === 0) {
    rows = '<tr><td colspan="6" style="padding:48px;text-align:center;color:var(--muted)">' +
      '<div style="font-size:32px;margin-bottom:12px">&#x2705;</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text)">All projects have recent activity!</div>' +
      '<div style="font-size:12px;margin-top:4px">No projects found without activity in the last ' + days + ' days.</div>' +
      '</td></tr>';
  } else {
    staleRows.forEach(function(r) {
      const st = r.info.status || 'active';
      const stColor = statusColors[st] || '#888';
      const stLabel = statusLabels[st] || st;
      const ageBg = r.age >= 120 ? 'var(--red)' : r.age >= 90 ? '#e8a234' : r.age >= 60 ? '#5b9cf6' : 'var(--muted)';
      rows += '<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="staleOpenProject(\"' + r.p.id + '\")">' +
        '<td style="padding:11px 14px">' +
          '<div style="font-size:13px;font-weight:600;color:var(--text)">' + (r.p.emoji ? r.p.emoji + ' ' : '') + r.p.name + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + (r.info.clientName || r.info.client || '') + '</div>' +
        '</td>' +
        '<td style="padding:11px 14px">' +
          '<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + stColor + '22;color:' + stColor + '">' + stLabel + '</span>' +
        '</td>' +
        '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.pm || '&mdash;') + '</td>' +
        '<td style="padding:11px 14px;text-align:center">' +
          '<span style="font-family:JetBrains Mono,monospace;font-size:13px;font-weight:700;color:' + ageBg + '">' + r.age + 'd</span>' +
        '</td>' +
        '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' +
          (r.lastDate ? fmtDate(r.lastDate) : '&mdash;') +
        '</td>' +
        '<td style="padding:11px 14px;font-size:11px;color:var(--muted);max-width:260px">' +
          (r.act ? typeIcon(r.act.type) + ' ' + r.act.desc : '<span style="color:var(--border)">No activity recorded</span>') +
        '</td>' +
      '</tr>';
    });
  }

  el.innerHTML =
    '<div style="max-width:1100px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">' +
        '<div>' +
          '<div style="font-family:DM Serif Display,serif;font-size:22px;color:var(--text)">&#x1F4A4; Stale Projects</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:2px">Open projects with no recorded activity in the selected period</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:12px;color:var(--muted)">No activity for:</span>' +
          '<select onchange="staleSetDays(this.value)" style="background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;color:var(--text);font-family:DM Sans,sans-serif;font-size:13px;padding:5px 10px;outline:none;cursor:pointer">' +
            dayOptions +
          '</select>' +
          '<span style="font-size:12px;color:var(--muted);font-family:JetBrains Mono,monospace">' + staleRows.length + ' project' + (staleRows.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:var(--surface2);border-bottom:2px solid var(--border)">' +
            '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Status</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">PM</th>' +
            '<th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Days Silent</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Last Activity</th>' +
            '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">What Happened</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

function staleOpenProject(id){selectProject(id);var n=document.getElementById('navProjects');if(n)n.click();}

function staleSetDays(val) {
  const el = document.getElementById('tab-stale');
  if (el) { el.dataset.days = val; renderStaleProjects(); }
}


// ===== AI BUSINESS INTELLIGENCE =====
// ===== AI BUSINESS INTELLIGENCE =====
let aiConversationHistory = [];

function setAiPrompt(text) {
  const inp = document.getElementById('aiReportPrompt');
  if (inp) { inp.value = text; inp.focus(); }
}

function clearAiHistory() {
  aiConversationHistory = [];
  const conv = document.getElementById('aiConversation');
  if (conv) conv.innerHTML = '';
}

function buildAiContext() {
  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const openProjects = projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed');
  const projSummary = openProjects.map(p => {
    const info = projectInfo[p.id] || {};
    const tasks = taskStore.filter(t => t.proj === p.id);
    const done   = tasks.filter(t => ['complete','billed','cancelled'].includes(t.status)).length;
    const billed = tasks.filter(t => t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0);
    const ready  = tasks.filter(t => t.status==='complete').reduce((s,t)=>s+(t.fixedPrice||0),0);
    return {
      n:p.name, st:info.status||'unknown', ph:(info.phase||'').slice(0,30),
      pm:(info.pm||'').slice(0,20), cl:(info.clientName||info.client||'').slice(0,30),
      tt:tasks.length, td:done, to:tasks.filter(t=>t.overdue&&!t.done).length,
      br:Math.round(billed), rb:Math.round(ready), ch:info.creditHold||false,
    };
  });
  const empWorkload = employees.map(e => {
    const mt = taskStore.filter(t => t.assign===e.initials);
    return { n:e.name, d:e.dept||'',
      a:mt.filter(t=>!['complete','billed','cancelled'].includes(t.status)).length,
      o:mt.filter(t=>t.overdue&&!t.done).length,
      c:mt.filter(t=>['complete','billed'].includes(t.status)).length };
  });
  const totalBilled = taskStore.filter(t=>t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0);
  const totalReady  = taskStore.filter(t=>t.status==='complete'&&t.revenueType!=='nocharge').reduce((s,t)=>s+(t.fixedPrice||0),0);
  const today = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  return "You are a business intelligence assistant for NU Labs, a testing laboratory.\n" +
    "Today: " + today + "\n" +
    "REVENUE: Billed=" + fmt$(totalBilled) + " | Ready-to-bill=" + fmt$(totalReady) + "\n\n" +
    "OPEN PROJECTS (" + openProjects.length + ") fields: n=name,st=status,ph=phase,pm=PM,cl=client,tt=totalTasks,td=done,to=overdue,br=billedRevenue,rb=readyToBill,ch=creditHold\n" +
    JSON.stringify(projSummary) + "\n\n" +
    "EMPLOYEES (" + employees.length + ") fields: n=name,d=dept,a=active,o=overdue,c=completed\n" +
    JSON.stringify(empWorkload) + "\n\n" +
    "Answer concisely. Use markdown tables. Be specific with numbers.";
}

async function runAiReport() {
  const inp  = document.getElementById('aiReportPrompt');
  const btn  = document.getElementById('aiRunBtn');
  const conv = document.getElementById('aiConversation');
  if (!inp || !conv) return;

  const question = inp.value.trim();
  if (!question) { inp.focus(); return; }

  const ts = new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  aiConversationHistory.push({ role:'user', content:question, ts });
  renderAiConversation();
  inp.value = '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Thinking…'; }

  const loadingId = 'ai-loading-' + Date.now();
  conv.insertAdjacentHTML('beforeend',
    `<div id="${loadingId}" class="ai-bubble ai-bubble-assistant">
      <div class="ai-bubble-avatar">✨</div>
      <div class="ai-bubble-body"><div class="ai-loading-dots"><span></span><span></span><span></span></div></div>
    </div>`);
  conv.scrollTop = conv.scrollHeight;

  try {
    const messages = aiConversationHistory.map(m => ({ role:m.role, content:m.content }));
    const aiTimeout = new Promise((_,rej) => setTimeout(()=>rej(new Error('Request timed out after 30 seconds')), 30000));
    const aiCall = sb.functions.invoke('ai-analysis', { body: { system: buildAiContext(), messages } });
    const { data: aiData, error: aiError } = await Promise.race([aiCall, aiTimeout]);
    if (aiError) throw new Error(aiError.message || 'Edge function error');
    const answer = aiData?.content?.[0]?.text || 'Sorry, I could not generate a response.';
    document.getElementById(loadingId)?.remove();
    aiConversationHistory.push({ role:'assistant', content:answer, ts: new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) });
    renderAiConversation();
  } catch(err) {
    document.getElementById(loadingId)?.remove();
    aiConversationHistory.push({ role:'assistant', content:'⚠ Error reaching AI: ' + err.message, ts });
    renderAiConversation();
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '&#x2728; Ask'; }
  conv.scrollTop = conv.scrollHeight;
}

function renderAiConversation() {
  const conv = document.getElementById('aiConversation');
  if (!conv) return;
  if (!aiConversationHistory.length) { conv.innerHTML = ''; return; }
  conv.innerHTML = aiConversationHistory.map(m => {
    const isUser = m.role === 'user';
    const bodyHtml = isUser
      ? `<div style="white-space:pre-wrap;font-size:13.5px">${m.content.replace(/</g,'&lt;')}</div>`
      : aiMarkdownToHtml(m.content);
    return `<div class="ai-bubble ${isUser ? 'ai-bubble-user' : 'ai-bubble-assistant'}">
      ${isUser ? '' : '<div class="ai-bubble-avatar">✨</div>'}
      <div class="ai-bubble-body">${bodyHtml}<div class="ai-bubble-ts">${m.ts||''}</div></div>
      ${isUser ? '<div class="ai-bubble-avatar ai-bubble-avatar-user">You</div>' : ''}
    </div>`;
  }).join('');
  conv.scrollTop = conv.scrollHeight;
}

function aiMarkdownToHtml(text) {
  // Tables
  text = text.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_, header, rows) => {
    const ths = header.split('|').map(c=>c.trim()).filter(Boolean).map(c=>`<th>${c}</th>`).join('');
    const trs = rows.trim().split('\n').map(row => {
      const tds = row.split('|').map(c=>c.trim()).filter(Boolean).map(c=>`<td>${c}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table class="ai-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/`([^`]+)`/g, '<code style="font-family:JetBrains Mono,monospace;font-size:11px;background:var(--surface2);padding:1px 5px;border-radius:3px">$1</code>');
  text = text.replace(/^### (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--amber);margin:10px 0 4px">$1</div>');
  text = text.replace(/^## (.+)$/gm, '<div style="font-size:14px;font-weight:700;color:var(--text);margin:12px 0 4px">$1</div>');
  text = text.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/((<li>.*<\/li>\n?)+)/g, '<ul style="margin:6px 0 6px 16px;padding:0">$1</ul>');
  text = text.replace(/\n{2,}/g, '</p><p style="margin:6px 0">');
  text = text.replace(/\n/g, '<br>');
  return `<div class="ai-response" style="font-size:13.5px;line-height:1.65"><p style="margin:0">${text}</p></div>`;
}

(function injectAiStyles() {
  if (document.getElementById('ai-report-styles')) return;
  const s = document.createElement('style');
  s.id = 'ai-report-styles';
  s.textContent = `
    .ai-bubble{display:flex;gap:10px;margin-bottom:14px;align-items:flex-start;}
    .ai-bubble-user{flex-direction:row-reverse;}
    .ai-bubble-avatar{width:30px;height:30px;border-radius:50%;background:var(--amber);color:#0e0e0f;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}
    .ai-bubble-avatar-user{background:var(--surface3);color:var(--text);}
    .ai-bubble-body{max-width:82%;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:11px 14px;}
    .ai-bubble-user .ai-bubble-body{background:var(--amber-glow);border-color:var(--amber-dim);}
    .ai-bubble-ts{font-size:10px;color:var(--muted);margin-top:6px;text-align:right;}
    .ai-table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;}
    .ai-table th{background:var(--surface2);padding:6px 10px;text-align:left;font-weight:600;border:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);}
    .ai-table td{padding:6px 10px;border:1px solid var(--border);color:var(--text);}
    .ai-table tr:nth-child(even) td{background:var(--surface2);}
    .ai-prompt-chip{background:var(--surface2);border:1.5px solid var(--border);border-radius:20px;padding:5px 12px;font-size:11.5px;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap;}
    .ai-prompt-chip:hover{border-color:var(--amber-dim);color:var(--amber);background:var(--amber-glow);}
    .ai-loading-dots{display:flex;gap:5px;align-items:center;padding:4px 0;}
    .ai-loading-dots span{width:7px;height:7px;border-radius:50%;background:var(--amber);opacity:.4;animation:aiDot 1.2s infinite;}
    .ai-loading-dots span:nth-child(2){animation-delay:.2s;}
    .ai-loading-dots span:nth-child(3){animation-delay:.4s;}
    @keyframes aiDot{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
  `;
  document.head.appendChild(s);
})();


// ===== LOAD CLOSED PROJECTS ON DEMAND =====
// ===== LOAD CLOSED PROJECTS ON DEMAND =====
let closedProjectsLoaded = false;

async function loadClosedProjects(el) {
  if (closedProjectsLoaded) {
    toast('Closed jobs already loaded');
    return;
  }
  if (el) { el.textContent = '⏳ Loading...'; el.style.pointerEvents = 'none'; }
  toast('Loading closed jobs...');

  try {
    // Load closed project_info with cursor pagination
    let closedInfo = [], lastId = null;
    while (true) {
      let q = sb.from('project_info').select('*')
        .eq('status', 'closed')
        .order('project_id', { ascending: true })
        .limit(1000);
      if (lastId) q = q.gt('project_id', lastId);
      const { data } = await q;
      if (!data || data.length === 0) break;
      closedInfo = closedInfo.concat(data);
      lastId = data[data.length - 1].project_id;
      if (data.length < 1000) break;
    }

    const closedProjIds = new Set(closedInfo.map(r => r.project_id));

    // Add to projectInfo store
    closedInfo.forEach(r => {
      if (!projectInfo[r.project_id]) {
        projectInfo[r.project_id] = {
          pm: r.pm||'', po: r.po_number||'', contract: r.contract_amount||'',
          phase: r.phase||'Waiting on TP Approval', status: r.status||'closed',
          startDate: r.start_date||'', endDate: r.end_date||'', tentativeTestDate: r.tentative_test_date||'',
          client: r.client||'', clientContact: r.client_contact||'',
          clientEmail: r.client_email||'', clientPhone: r.client_phone||'',
          clientId: r.client_id||null, contactId: r.contact_id||null,
          billingType: r.billing_type||'Fixed Fee', invoiced: r.invoiced||'',
          remaining: r.remaining||'', notes: r.notes||'', desc: r.description||'',
          dcas: r.dcas||'', customerWitness: r.customer_witness||'', tpApproval: r.tp_approval||'',
          dpas: r.dpas||'', noforn: r.noforn||'', quoteNumber: r.quote_number||'',
          creditHold: r.credit_hold||false, needUpdatedPo: r.need_updated_po||false,
          testcompleteDate: r.testcomplete_date||'',
          testDesc: r.test_description||'', testArticleDesc: r.test_article_description||'',
          billedRevenue: r.billed_revenue ? parseFloat(r.billed_revenue) : 0,
          expectedRevenue: r.expected_revenue ? parseFloat(r.expected_revenue) : 0,
          po_number: r.po_number||'',
        };
      }
    });

    // Load tasks for closed projects — chunked to avoid URL length limits
    if (closedProjIds.size > 0) {
      const CHUNK = 100;
      const ids = [...closedProjIds];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        let taskPage = 0;
        while (true) {
          const { data } = await sb.from('tasks').select('*')
            .in('project_id', chunk)
            .range(taskPage * 1000, taskPage * 1000 + 999);
          if (!data || data.length === 0) break;
          data.forEach(r => {
            if (taskStore.find(t => t._id === r.id)) return;
            taskStore.push({
              _id: r.id, taskNum: r.task_num||0, proj: r.project_id,
              name: r.name||'', status: r.status||'new',
              assign: r.assignee||'',
              due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
              due_raw: r.due_date||'', overdue: false, done: r.done||false,
              priority: r.priority||'medium',
              section: r.section||'sprint', sectionId: r.section_id||null,
              taskStartDate: r.task_start_date||'',
              completedDate: r.completed_date||'', billedDate: r.billed_date||'',
              fixedPrice: r.fixed_price ? parseFloat(r.fixed_price) : 0,
              budgetHours: r.budget_hours ? parseFloat(r.budget_hours) : 0,
              salesCat: r.sales_category||'', quoteNum: r.quote_number||'',
              poNumber: r.po_number||'', peachtreeInv: r.peachtree_inv||'',
              createdAt: r.created_at ? r.created_at.split('T')[0] : '',
              revenueType: r.revenue_type||'fixed',
            });
          });
          if (data.length < 1000) break;
          taskPage++;
        }
      }
    }

    closedProjectsLoaded = true;
    if (el) { el.innerHTML = '✓ Closed Jobs Loaded'; el.style.color = 'var(--green)'; }
    renderProjectNav();
    renderAllViews();
    toast('✓ Closed jobs loaded (' + closedInfo.length + ' projects)');

  } catch(e) {
    console.error('loadClosedProjects:', e);
    toast('⚠ Error loading closed jobs: ' + e.message);
    if (el) { el.innerHTML = '🔒 Load Closed Jobs'; el.style.pointerEvents = ''; }
  }
}


// ===== CLOSING REPORT =====
function openClosingReport(el) {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-closing-report').classList.add('active');
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Closing Report';
  renderClosingReport();
}

function renderClosingReport() {
  const el = document.getElementById('closingReportBody');
  if (!el) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const daysSince = d => d ? Math.floor((now - new Date(d + 'T00:00:00')) / 86400000) : null;
  const fmtDate  = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmt$     = n => n > 0 ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const isJordan = currentEmployee && currentEmployee.name === 'Jordan McAdoo';

  // ── Test Complete rows (both 60+ and under 60) ──────────────────────────
  const tcRows = projects
    .filter(p => (projectInfo[p.id] || {}).status === 'testcomplete')
    .map(p => {
      const info = projectInfo[p.id] || {};
      const days = daysSince(info.testcompleteDate);
      const tasks = taskStore.filter(t => t.proj === p.id);
      const openTasks = tasks.filter(t => !['complete', 'billed', 'cancelled'].includes(t.status));
      const readyToBill = tasks.filter(t => t.status === 'complete').reduce((s, t) => s + (t.fixedPrice || 0), 0);
      return { p, info, days, openTasks, readyToBill };
    })
    .sort((a, b) => (b.days || 0) - (a.days || 0));

  const over60  = tcRows.filter(r => r.days !== null && r.days >= 60);
  const under60 = tcRows.filter(r => r.days === null || r.days < 60);

  // ── Ready to Close (status === 'complete') ───────────────────────────────
  const readyRows = projects
    .filter(p => (projectInfo[p.id] || {}).status === 'complete')
    .map(p => {
      const info = projectInfo[p.id] || {};
      const tasks = taskStore.filter(t => t.proj === p.id);
      const openTasks = tasks.filter(t => !['complete', 'billed', 'cancelled'].includes(t.status));
      const readyToBill = tasks.filter(t => t.status === 'complete').reduce((s, t) => s + (t.fixedPrice || 0), 0);
      return { p, info, openTasks, readyToBill };
    })
    .sort((a, b) => (a.p.name || '').localeCompare(b.p.name || ''));

  // ── Pending Jordan (status === 'closing') ────────────────────────────────
  const pendingRows = projects
    .filter(p => (projectInfo[p.id] || {}).status === 'closing')
    .map(p => {
      const info = projectInfo[p.id] || {};
      const tasks = taskStore.filter(t => t.proj === p.id);
      const readyToBill = tasks.filter(t => t.status === 'complete').reduce((s, t) => s + (t.fixedPrice || 0), 0);
      return { p, info, readyToBill };
    })
    .sort((a, b) => (a.p.name || '').localeCompare(b.p.name || ''));

  // ── Table builder for testcomplete rows ─────────────────────────────────
  function buildTcTable(list) {
    if (list.length === 0) return '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">None</div>';
    return '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="background:var(--surface2);border-bottom:2px solid var(--border)">' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Client</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">PM</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Test Complete Date</th>' +
        '<th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Days</th>' +
        '<th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Open Tasks</th>' +
        '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Ready to Bill</th>' +
      '</tr></thead><tbody>' +
      list.map(function(r) {
        const ageBg = (r.days || 0) >= 120 ? 'var(--red)' : (r.days || 0) >= 90 ? '#e8a234' : (r.days || 0) >= 60 ? '#5b9cf6' : 'var(--muted)';
        return '<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="selectProjectById(\'' + r.p.id + '\')">' +
          '<td style="padding:11px 14px"><span style="font-size:13px;font-weight:600;color:var(--text)">' + (r.p.emoji ? r.p.emoji + ' ' : '') + r.p.name + '</span></td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.client || '—') + '</td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.pm || '—') + '</td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted);font-family:JetBrains Mono,monospace">' + fmtDate(r.info.testcompleteDate) + '</td>' +
          '<td style="padding:11px 14px;text-align:center"><span style="font-family:JetBrains Mono,monospace;font-size:13px;font-weight:700;color:' + ageBg + '">' + (r.days !== null ? r.days + 'd' : '—') + '</span></td>' +
          '<td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:600;color:' + (r.openTasks.length > 0 ? 'var(--red)' : 'var(--muted)') + '">' + (r.openTasks.length || '—') + '</td>' +
          '<td style="padding:11px 14px;text-align:right;font-size:13px;font-weight:600;color:' + (r.readyToBill > 0 ? '#c084fc' : 'var(--muted)') + '">' + fmt$(r.readyToBill) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  // ── Table builder for Ready to Close rows ───────────────────────────────
  function buildReadyTable(list) {
    if (list.length === 0) return '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">None</div>';
    return '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="background:var(--surface2);border-bottom:2px solid var(--border)">' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Client</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">PM</th>' +
        '<th style="text-align:center;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Open Tasks</th>' +
        '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Ready to Bill</th>' +
        '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Action</th>' +
      '</tr></thead><tbody>' +
      list.map(function(r) {
        const canGenerate = r.openTasks.length === 0 && (isManager() || can('mark_closing'));
        const actionBtn = canGenerate
          ? '<button onclick="event.stopPropagation();generateClosingPdf(\'' + r.p.id + '\')" style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:8px;padding:6px 12px;font-size:11px;color:#4caf7d;cursor:pointer;font-weight:600;white-space:nowrap">&#x1F4C4; Generate PDF &amp; Mark Closing</button>'
          : (r.openTasks.length > 0
              ? '<span style="font-size:11px;color:var(--red)">' + r.openTasks.length + ' open task' + (r.openTasks.length > 1 ? 's' : '') + '</span>'
              : '<span style="font-size:11px;color:var(--muted)">No permission</span>');
        return '<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="selectProjectById(\'' + r.p.id + '\')">' +
          '<td style="padding:11px 14px"><span style="font-size:13px;font-weight:600;color:var(--text)">' + (r.p.emoji ? r.p.emoji + ' ' : '') + r.p.name + '</span></td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.client || '—') + '</td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.pm || '—') + '</td>' +
          '<td style="padding:11px 14px;text-align:center;font-size:13px;font-weight:600;color:' + (r.openTasks.length > 0 ? 'var(--red)' : 'var(--muted)') + '">' + (r.openTasks.length || '—') + '</td>' +
          '<td style="padding:11px 14px;text-align:right;font-size:13px;font-weight:600;color:' + (r.readyToBill > 0 ? '#c084fc' : 'var(--muted)') + '">' + fmt$(r.readyToBill) + '</td>' +
          '<td style="padding:11px 14px;text-align:right">' + actionBtn + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  // ── Table builder for Pending Jordan rows ───────────────────────────────
  function buildPendingTable(list) {
    if (list.length === 0) return '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">None</div>';
    return '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="background:var(--surface2);border-bottom:2px solid var(--border)">' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Client</th>' +
        '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">PM</th>' +
        '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Ready to Bill</th>' +
        '<th style="text-align:right;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Action</th>' +
      '</tr></thead><tbody>' +
      list.map(function(r) {
        const approveReject = isJordan
          ? '<button onclick="event.stopPropagation();approveClosing(\'' + r.p.id + '\')" style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:8px;padding:6px 12px;font-size:11px;color:#4caf7d;cursor:pointer;font-weight:600;margin-right:6px">&#x2713; Approve</button>' +
            '<button onclick="event.stopPropagation();rejectClosing(\'' + r.p.id + '\')" style="background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--red);cursor:pointer;font-weight:600">&#x2717; Reject</button>'
          : '<span style="font-size:11px;color:var(--amber);padding:5px 10px;background:rgba(232,162,52,0.1);border:1px solid rgba(232,162,52,0.3);border-radius:8px">&#x23F3; Awaiting Jordan</span>';
        return '<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="selectProjectById(\'' + r.p.id + '\')">' +
          '<td style="padding:11px 14px"><span style="font-size:13px;font-weight:600;color:var(--text)">' + (r.p.emoji ? r.p.emoji + ' ' : '') + r.p.name + '</span></td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.client || '—') + '</td>' +
          '<td style="padding:11px 14px;font-size:12px;color:var(--muted)">' + (r.info.pm || '—') + '</td>' +
          '<td style="padding:11px 14px;text-align:right;font-size:13px;font-weight:600;color:' + (r.readyToBill > 0 ? '#c084fc' : 'var(--muted)') + '">' + fmt$(r.readyToBill) + '</td>' +
          '<td style="padding:11px 14px;text-align:right">' + approveReject + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  el.innerHTML =
    // Summary chips
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">' +
      '<div style="background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:10px;padding:12px 20px;min-width:120px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--red);margin-bottom:4px">60+ Days</div>' +
        '<div style="font-size:28px;font-family:DM Serif Display,serif;color:var(--text)">' + over60.length + '</div>' +
      '</div>' +
      '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 20px;min-width:120px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Test Complete</div>' +
        '<div style="font-size:28px;font-family:DM Serif Display,serif;color:var(--text)">' + tcRows.length + '</div>' +
      '</div>' +
      '<div style="background:rgba(76,175,125,0.08);border:1px solid rgba(76,175,125,0.3);border-radius:10px;padding:12px 20px;min-width:120px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#4caf7d;margin-bottom:4px">Ready to Close</div>' +
        '<div style="font-size:28px;font-family:DM Serif Display,serif;color:var(--text)">' + readyRows.length + '</div>' +
      '</div>' +
      '<div style="background:rgba(91,156,246,0.08);border:1px solid rgba(91,156,246,0.3);border-radius:10px;padding:12px 20px;min-width:120px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--blue);margin-bottom:4px">Pending Approval</div>' +
        '<div style="font-size:28px;font-family:DM Serif Display,serif;color:var(--text)">' + pendingRows.length + '</div>' +
      '</div>' +
    '</div>' +

    // ── Needs Attention (60+ days in testcomplete) ──
    '<div style="font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--red);margin-bottom:10px">&#x26A0; Needs Attention — 60+ Days in Test Complete</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px">' +
      buildTcTable(over60) +
    '</div>' +

    // ── Under 60 days (testcomplete) ──
    '<div style="font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Under 60 Days — Test Complete</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px">' +
      buildTcTable(under60) +
    '</div>' +

    // ── Ready to Close (complete status) ──
    '<div style="font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#4caf7d;margin-bottom:10px">&#x2705; Ready to Close</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px">' +
      buildReadyTable(readyRows) +
    '</div>' +

    // ── Pending Jordan's Approval (closing status) ──
    '<div style="font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--blue);margin-bottom:10px">&#x23F3; Pending Jordan\'s Approval</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">' +
      buildPendingTable(pendingRows) +
    '</div>';
}

// ── Closing action functions ─────────────────────────────────────────────

function markProjectComplete(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  const projTasks = taskStore.filter(t => t.proj === projId);
  const blocking = projTasks.filter(t => !['complete', 'billed', 'cancelled'].includes(t.status));
  if (blocking.length > 0) {
    toast('⚠ Cannot mark Complete — ' + blocking.length + ' open task' + (blocking.length > 1 ? 's' : '') + ' remaining.', 'error');
    return;
  }
  info.status = 'complete';
  if (sb) dbUpdate('project_info', projId, { status: 'complete' });
  toast('Project marked Complete — ready to generate closing PDF.');
  renderClosingReport();
}

function generateClosingPdf(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  const projTasks = taskStore.filter(t => t.proj === projId);
  const blocking = projTasks.filter(t => !['complete', 'billed', 'cancelled'].includes(t.status));
  if (blocking.length > 0) {
    toast('⚠ Cannot close — ' + blocking.length + ' open task(s) remaining.', 'error');
    return;
  }

  // ── Build PDF ──
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const fmtD = ds => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmt$ = n => n > 0 ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  // Header
  doc.setFillColor(30, 30, 40);
  doc.rect(0, 0, pageW, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CLOSING REPORT', margin, 30);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(proj.name, margin, 48);
  doc.text('Generated: ' + fmtD(new Date().toISOString().slice(0, 10)), margin, 63);
  y = 90;

  // Project info block
  doc.setTextColor(40, 40, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const infoLines = [
    ['Client', info.client || '—'],
    ['PM', info.pm || '—'],
    ['Start Date', fmtD(info.startDate)],
    ['End Date', fmtD(info.endDate)],
    ['Test Complete Date', fmtD(info.testcompleteDate)],
  ];
  infoLines.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold'); doc.text(label + ':', margin, y);
    doc.setFont('helvetica', 'normal'); doc.text(val, margin + 130, y);
    y += 16;
  });
  y += 12;

  // Tasks table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Tasks', margin, y); y += 6;
  doc.setDrawColor(200, 200, 210);
  doc.line(margin, y, margin + contentW, y); y += 12;

  const billedTasks = projTasks.filter(t => ['complete', 'billed', 'cancelled'].includes(t.status));
  if (billedTasks.length > 0) {
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Task', 'Status', 'Fixed Price', 'Completed']],
      body: billedTasks.map(t => [
        t.name || '—',
        t.status || '—',
        t.fixedPrice > 0 ? fmt$(t.fixedPrice) : '—',
        fmtD(t.completedDate || t.billedDate),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [50, 50, 65], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 252] },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // Totals
  const totalBilled = projTasks.filter(t => t.status === 'billed').reduce((s, t) => s + (t.fixedPrice || 0), 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Total Billed:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fmt$(totalBilled), margin + 130, y);

  doc.save(proj.name.replace(/[^a-z0-9]/gi, '_') + '_closing_report.pdf');

  // ── Mark as Closing in DB and memory ──
  info.status = 'closing';
  if (sb) dbUpdate('project_info', projId, { status: 'closing' });
  toast('PDF downloaded — project marked Closing. Jordan has been notified for approval.');
  renderClosingReport();
}

function approveClosing(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  const today = new Date().toISOString().slice(0, 10);
  info.status = 'closed';
  if (!info.endDate) info.endDate = today;
  const payload = { status: 'closed' };
  if (!info.endDate || info.endDate === today) payload.end_date = today;
  if (sb) dbUpdate('project_info', projId, payload);
  toast('✓ Project approved and closed. Closed date set to today.');
  renderClosingReport();
}

function rejectClosing(projId) {
  const reason = prompt('Reason for rejection (will be noted):');
  if (reason === null) return; // cancelled
  const info = projectInfo[projId];
  if (!info) return;
  info.status = 'complete';
  if (sb) dbUpdate('project_info', projId, { status: 'complete' });
  toast('Closing rejected — project returned to Ready to Close.' + (reason ? ' Reason: ' + reason : ''));
  renderClosingReport();
}
