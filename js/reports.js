
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
                <td style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace">${t.due||'—'}</td>
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

  const uniqueEmps = [...new Map(entries.map(e => [e.employeeId, {id:e.employeeId,name:e.empName}])).values()]
    .sort((a,b) => a.name.localeCompare(b.name));

  const statusBadge = s => ({
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
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${entries.length} total submissions across ${uniqueEmps.length} employee${uniqueEmps.length!==1?'s':''}</div>
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
            <option value="submitted" ${selStatus==='submitted'?'selected':''}>Pending</option>
            <option value="approved"  ${selStatus==='approved' ?'selected':''}>Approved</option>
            <option value="rejected"  ${selStatus==='rejected' ?'selected':''}>Rejected</option>
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
            '<td colspan="2"></td></tr>';
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
function renderReportsEmployees() {
  const el = document.getElementById('tab-employees');
  if (!el) return;

  const rows = employees.map(e => {
    const tasks = taskStore.filter(t => t.assign === e.initials);
    const done = tasks.filter(t => t.done||t.status==='complete'||t.status==='billed').length;
    const billedVal = tasks.filter(t=>t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0);
    const fmt$ = n => n>0 ? '$'+n.toLocaleString('en-US',{minimumFractionDigits:0}) : '—';
    return { e, tasks:tasks.length, done, active:tasks.length-done, billedVal };
  }).sort((a,b) => b.tasks-a.tasks);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="report-card">
        <div class="report-card-title">&#x1F4B0; Billed Revenue by Employee</div>
        <canvas id="chartBilledByEmp" height="260"></canvas>
      </div>
      <div class="report-card">
        <div class="report-card-title">&#x1F4CA; Task Load by Employee</div>
        <canvas id="chartLoadByEmp" height="260"></canvas>
      </div>
    </div>
    <div class="report-card" style="margin-top:0">
      <div class="report-card-title">&#x1F465; Employee Summary</div>
      <table class="ai-report-table">
        <thead><tr><th>Employee</th><th>Dept</th><th>Total Tasks</th><th>Active</th><th>Done</th><th>Billed Revenue</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><div style="display:flex;align-items:center;gap:8px"><div class="emp-av" style="background:${r.e.color};width:28px;height:28px;font-size:10px">${getInitials(r.e.name)}</div>${r.e.name}</div></td>
          <td style="color:var(--muted);font-size:12px">${r.e.dept||'—'}</td>
          <td style="font-family:'JetBrains Mono',monospace">${r.tasks}</td>
          <td style="color:var(--blue);font-family:'JetBrains Mono',monospace">${r.active}</td>
          <td style="color:var(--green);font-family:'JetBrains Mono',monospace">${r.done}</td>
          <td style="color:#c084fc;font-family:'JetBrains Mono',monospace">${'$'+r.billedVal.toLocaleString('en-US',{minimumFractionDigits:0})}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  `;

  setTimeout(() => {
    new Chart(document.getElementById('chartBilledByEmp'), {
      type: 'bar',
      data: {
        labels: rows.map(r => r.e.name.split(' ')[0]),
        datasets: [{ label:'Billed $', data: rows.map(r=>r.billedVal), backgroundColor: rows.map(r=>r.e.color+'cc'), borderColor: rows.map(r=>r.e.color), borderWidth:1.5, borderRadius:5 }]
      },
      options: { responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ticks:{color:'#9a9aaa',font:{size:10}},grid:{display:false}}, y:{ticks:{color:'#9a9aaa',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(255,255,255,0.05)'}} } }
    });
    new Chart(document.getElementById('chartLoadByEmp'), {
      type: 'doughnut',
      data: {
        labels: rows.map(r => r.e.name.split(' ')[0]),
        datasets: [{ data: rows.map(r=>r.tasks), backgroundColor: rows.map(r=>r.e.color+'cc'), borderColor: rows.map(r=>r.e.color), borderWidth:1.5 }]
      },
      options: { responsive:true, plugins:{ legend:{ position:'right', labels:{color:'#9a9aaa',font:{size:11}} } } }
    });
  }, 50);
}


// ── Anthropic API Key management ─────────────────────────────────────────
function getAnthropicKey() {
  return localStorage.getItem('nuworkspace_anthropic_key') || '';
}

function saveAnthropicKey(key) {
  localStorage.setItem('nuworkspace_anthropic_key', key.trim());
}

// ── AI Analysis ──────────────────────────────────────────────────────────
let aiHistory = []; // { question, report }

function setAiPrompt(text) {
  document.getElementById('aiReportPrompt').value = text;
  document.getElementById('aiReportPrompt').focus();
}

function clearAiHistory() {
  aiHistory = [];
  document.getElementById('aiConversation').innerHTML = '';
}

function showApiKeyPrompt() {
  const conv = document.getElementById('aiConversation');
  // Remove any existing key prompt
  const existing = document.getElementById('apiKeyPromptDiv');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'apiKeyPromptDiv';
  div.style.cssText = 'background:var(--surface2);border:1.5px solid var(--amber-dim);border-radius:12px;padding:20px 24px;margin-bottom:16px';
  div.innerHTML = `
    <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">&#x1F511; Anthropic API Key Required</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.6">
      To use AI Reports, enter your Anthropic API key. It's stored only in your browser's local storage and never sent anywhere except directly to Anthropic.<br>
      Get a key at <a href="https://console.anthropic.com" target="_blank" style="color:var(--amber)">console.anthropic.com</a>
    </div>
    <div style="display:flex;gap:8px">
      <input type="password" id="apiKeyInput" placeholder="sk-ant-..." style="flex:1;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;padding:8px 12px;outline:none" 
        onkeydown="if(event.key==='Enter')saveAndCloseKeyPrompt()" />
      <button class="btn btn-primary" style="padding:8px 18px;font-size:13px" onclick="saveAndCloseKeyPrompt()">Save & Continue</button>
    </div>
  `;
  conv.prepend(div);
  setTimeout(() => document.getElementById('apiKeyInput').focus(), 80);
}

function saveAndCloseKeyPrompt() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  saveAnthropicKey(key);
  document.getElementById('apiKeyPromptDiv').remove();
  // Re-focus prompt and let user try again
  document.getElementById('aiReportPrompt').focus();
}

function buildDataContext() {
  return {
    projects: projects.map(p => {
      const info = projectInfo[p.id] || {};
      const tasks = taskStore.filter(t => t.proj === p.id);
      const expTotal = (expenseStore||[]).filter(e=>e.projId===p.id).reduce((s,e)=>s+(e.amount||0),0);
      return {
        name: p.name, status: info.status, phase: info.phase,
        startDate: info.startDate, endDate: info.endDate,
        contractValue: info.contractValue || 0,
        billedRevenue: tasks.filter(t=>t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0),
        readyToBill: tasks.filter(t=>t.status==='complete').reduce((s,t)=>s+(t.fixedPrice||0),0),
        unbilled: tasks.filter(t=>!['billed','complete','cancelled'].includes(t.status)).reduce((s,t)=>s+(t.fixedPrice||0),0),
        totalTaskValue: tasks.reduce((s,t)=>s+(t.fixedPrice||0),0),
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t=>t.done||t.status==='complete'||t.status==='billed').length,
        overdueTasks: tasks.filter(t=>t.overdue&&!t.done).length,
        expenses: expTotal,
        client: info.clientName || '',
        creditHold: info.creditHold || false,
        needUpdatedPo: info.needUpdatedPo || false
      };
    }),
    tasks: taskStore.map(t => ({
      name: t.name, status: t.status, priority: t.priority,
      assignee: t.assign,
      project: (projects.find(p=>p.id===t.proj)||{}).name || '',
      due: t.due, overdue: t.overdue, done: t.done,
      fixedPrice: t.fixedPrice || 0,
      taskNum: t.taskNum
    })),
    employees: employees.map(e => ({
      name: e.name, dept: e.dept, role: e.role,
      totalTasks: taskStore.filter(t=>t.assign===e.initials).length,
      activeTasks: taskStore.filter(t=>t.assign===e.initials&&!t.done).length,
      overdueTasks: taskStore.filter(t=>t.assign===e.initials&&t.overdue&&!t.done).length,
      completedTasks: taskStore.filter(t=>t.assign===e.initials&&t.done).length,
      billedValue: taskStore.filter(t=>t.assign===e.initials&&t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0)
    })),
    summary: {
      totalProjects: projects.length,
      activeProjects: projects.filter(p=>(projectInfo[p.id]||{}).status==='active').length,
      totalTasks: taskStore.length,
      overdueTasks: taskStore.filter(t=>t.overdue&&!t.done).length,
      billedRevenue: taskStore.filter(t=>t.status==='billed').reduce((s,t)=>s+(t.fixedPrice||0),0),
      readyToBill: taskStore.filter(t=>t.status==='complete').reduce((s,t)=>s+(t.fixedPrice||0),0),
      totalContractValue: taskStore.reduce((s,t)=>s+(t.fixedPrice||0),0)
    }
  };
}

async function runAiReport() {
  const prompt = document.getElementById('aiReportPrompt').value.trim();
  if (!prompt) return;

  // Check for API key
  if (!getAnthropicKey()) {
    showApiKeyPrompt();
    return;
  }
  const btn = document.getElementById('aiRunBtn');
  const conv = document.getElementById('aiConversation');

  // Add user bubble immediately
  const msgId = 'aiMsg_' + Date.now();
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ai-msg';
  msgDiv.id = msgId;
  msgDiv.innerHTML = `
    <div class="ai-msg-user"><div class="ai-msg-user-bubble">${prompt}</div></div>
    <div class="ai-msg-response">
      <div class="ai-thinking"><div class="ai-thinking-dot"></div> Claude is analyzing your data…</div>
    </div>`;
  conv.appendChild(msgDiv);
  msgDiv.scrollIntoView({behavior:'smooth', block:'start'});

  document.getElementById('aiReportPrompt').value = '';
  btn.disabled = true;
  btn.innerHTML = '⏳';

  const ctx = buildDataContext();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getAnthropicKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a business intelligence assistant for NU Labs, analyzing live project management data.
Respond ONLY in valid JSON, no markdown, no prose outside JSON.
Schema:
{
  "summary": "2-3 sentence executive insight",
  "sections": [
    {
      "title": "Section title",
      "text": "1-2 sentence insight",
      "chart": {
        "type": "bar|doughnut|line",
        "title": "Chart title",
        "labels": ["A","B","C"],
        "datasets": [{"label":"Series name","data":[1,2,3],"color":"#hexcolor"}]
      },
      "table": {
        "headers": ["Col1","Col2","Col3"],
        "rows": [["val","val","val"]]
      }
    }
  ]
}
Rules:
- Include charts wherever data can be visualized (revenue by project, tasks by status, workload by employee etc.)
- For doughnut charts use one dataset with multiple colors: datasets[0].colors = ["#hex","#hex"]
- Tables and charts are both optional but prefer charts for numerical comparisons
- Be concise and actionable. Use $ formatting for money values in tables.
- Max 4 sections per response.`,
        messages: [{ role: 'user', content: `Question: ${prompt}\n\nLive Data:\n${JSON.stringify(ctx, null, 1)}` }]
      })
    });
    const data = await res.json();
    const raw = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const clean = raw.replace(/```json|```/g,'').trim();
    const report = JSON.parse(clean);

    aiHistory.push({ question: prompt, report });
    const responseEl = msgDiv.querySelector('.ai-msg-response');
    renderAiReport(report, responseEl);
    msgDiv.scrollIntoView({behavior:'smooth', block:'start'});
  } catch(err) {
    const responseEl = msgDiv.querySelector('.ai-msg-response');
    responseEl.innerHTML = `<div style="color:var(--red);font-size:13px">&#x26A0; Could not generate report: ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = '&#x2728; Ask';
}

function renderAiReport(report, container) {
  const CHART_COLORS = ['#5b9cf6','#4caf7d','#e8a234','#e05c5c','#a78bfa','#c084fc','#2dd4bf','#fb923c'];
  let innerHtml = '';

  if (report.summary) {
    innerHtml += `<div class="ai-response-summary">${report.summary}</div>`;
  }

  const sections = report.sections || [];
  // Put chart sections in a grid if 2+ charts side by side
  const chartSections = sections.filter(s => s.chart);
  const tableSections = sections.filter(s => !s.chart && s.table);

  if (chartSections.length >= 2) {
    innerHtml += '<div class="ai-chart-grid">';
    chartSections.forEach((sec, si) => {
      const chartId = 'aiChart_' + si + '_' + Date.now();
      innerHtml += `<div class="ai-section">
        <div class="ai-section-title">${sec.title}</div>
        ${sec.text ? `<div class="ai-section-text">${sec.text}</div>` : ''}
        <div class="ai-chart-wrap"><canvas id="${chartId}" height="220"></canvas></div>
        ${sec.table ? renderAiTable(sec.table) : ''}
      </div>`;
      setTimeout(() => drawAiChart(chartId, sec.chart, CHART_COLORS), 100);
    });
    innerHtml += '</div>';
  } else {
    chartSections.forEach((sec, si) => {
      const chartId = 'aiChart_s' + si + '_' + Date.now();
      innerHtml += `<div class="ai-section">
        <div class="ai-section-title">${sec.title}</div>
        ${sec.text ? `<div class="ai-section-text">${sec.text}</div>` : ''}
        <div class="ai-chart-wrap" style="max-width:${sec.chart.type==='doughnut'?'360px':'100%'}"><canvas id="${chartId}" height="${sec.chart.type==='doughnut'?'260':'200'}"></canvas></div>
        ${sec.table ? renderAiTable(sec.table) : ''}
      </div>`;
      setTimeout(() => drawAiChart(chartId, sec.chart, CHART_COLORS), 100);
    });
  }

  tableSections.forEach(sec => {
    innerHtml += `<div class="ai-section">
      <div class="ai-section-title">${sec.title}</div>
      ${sec.text ? `<div class="ai-section-text">${sec.text}</div>` : ''}
      ${renderAiTable(sec.table)}
    </div>`;
  });

  container.innerHTML = innerHtml;
}

function renderAiTable(table) {
  if (!table) return '';
  return `<table class="ai-report-table">
    <thead><tr>${table.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function drawAiChart(chartId, chartDef, COLORS) {
  const canv = document.getElementById(chartId);
  if (!canv || !chartDef) return;
  const isDoughnut = chartDef.type === 'doughnut';
  const ds = chartDef.datasets.map((d, i) => {
    const baseColor = d.color || COLORS[i % COLORS.length];
    const bgColors = isDoughnut
      ? (d.colors || chartDef.labels.map((_,li) => COLORS[li % COLORS.length]))
      : baseColor + 'bb';
    return {
      label: d.label,
      data: d.data,
      backgroundColor: bgColors,
      borderColor: isDoughnut ? 'transparent' : baseColor,
      borderWidth: isDoughnut ? 0 : 1.5,
      borderRadius: chartDef.type === 'bar' ? 5 : 0,
      fill: chartDef.type === 'line' ? {target:'origin', above: baseColor+'22'} : false,
      tension: 0.4,
      pointBackgroundColor: baseColor,
      pointRadius: chartDef.type === 'line' ? 4 : 0
    };
  });
  new Chart(canv, {
    type: chartDef.type,
    data: { labels: chartDef.labels, datasets: ds },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: isDoughnut || chartDef.datasets.length > 1,
          position: isDoughnut ? 'right' : 'top',
          labels: { color: '#9a9aaa', font: { size: 11 }, boxWidth: 12, padding: 12 }
        },
        title: chartDef.title ? {
          display: true, text: chartDef.title,
          color: '#9a9aaa', font: { size: 11, weight: '600' }, padding: { bottom: 10 }
        } : { display: false }
      },
      scales: isDoughnut ? {} : {
        x: { ticks: { color: '#9a9aaa', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#9a9aaa', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      },
      cutout: isDoughnut ? '65%' : undefined
    }
  });
}


// ===== CLOSING REPORT =====
// ===== CLOSING REPORT =====
function openClosingReport(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Closing Report';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-closing-report').classList.add('active');
  renderClosingReport();
}

function renderClosingReport() {
  const body = document.getElementById('closingReportBody');
  if (!body) return;

  const today = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  const getDays = (dateStr) => {
    if (!dateStr) return null;
    return Math.floor((today - new Date(dateStr + 'T00:00:00')) / msPerDay);
  };

  const fmtDate = ds => ds ? new Date(ds+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  // Categorize projects
  const testComplete60 = [];
  const readyToClose = [];
  const pendingJordan = [];

  projects.forEach(p => {
    const info = projectInfo[p.id];
    if (!info) return;
    if (info.status === 'testcomplete') {
      const projTasks = taskStore.filter(t => t.proj === p.id);
      const openTasks = projTasks.filter(t => !['complete','billed','cancelled'].includes(t.status));
      if (openTasks.length > 0) return; // skip — still has open tasks

      let refDate = info.testcompleteDate || '';
      let days = getDays(refDate);

      // If tasks are loaded, use the most recent date across ALL tasks (billed, complete, cancelled)
      if (projTasks.length > 0) {
        const lastAnyDate = projTasks.reduce((latest, t) => {
          const d = t.billedDate || t.completedDate || '';
          return d > latest ? d : latest;
        }, '');
        if (lastAnyDate) { refDate = lastAnyDate; days = getDays(refDate); }
      }

      if (days === null || days >= 60) testComplete60.push({p, info, days, refDate});
    } else if (info.status === 'complete') {
      readyToClose.push({p, info});
    } else if (info.status === 'closing') {
      pendingJordan.push({p, info});
    }
  });

  const projectCard = ({p, info, days, refDate, section}) => {
    const projTasks = taskStore.filter(t => t.proj === p.id);
    const openTasks = projTasks.filter(t => !['complete','billed','cancelled'].includes(t.status));
    const canClose = openTasks.length === 0;

    let buttons = '';
    if (section === 'testcomplete' && canClose && isManager()) {
      buttons += `<button onclick="markProjectComplete('${p.id}')"
        style="background:rgba(91,156,246,0.15);border:1px solid rgba(91,156,246,0.4);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--blue);cursor:pointer;font-weight:600">
        Mark Complete
      </button>`;
    }
    if (section === 'readytoclose' && isManager()) {
      buttons += `<button onclick="generateClosingPdf('${p.id}')"
        style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:8px;padding:7px 14px;font-size:12px;color:#4caf7d;cursor:pointer;font-weight:600">
        📄 Generate PDF &amp; Mark Closing
      </button>`;
    }
    if (section === 'pending') {
      buttons += `<span style="font-size:11px;color:var(--amber);padding:6px 12px;background:rgba(232,162,52,0.1);border:1px solid rgba(232,162,52,0.3);border-radius:8px">⏳ Awaiting Jordan</span>`;
      if (currentEmployee && currentEmployee.name === 'Jordan McAdoo') {
        buttons += `<button onclick="approveClosing('${p.id}')"
          style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:8px;padding:7px 14px;font-size:12px;color:#4caf7d;cursor:pointer;font-weight:600;margin-left:6px">
          ✓ Approve Close
        </button>
        <button onclick="rejectClosing('${p.id}')"
          style="background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--red);cursor:pointer;margin-left:6px">
          ✗ Reject
        </button>`;
      }
    }

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">${p.emoji||'📁'} ${p.name}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${info.client ? `<span style="font-size:12px;color:var(--muted)">🏢 ${info.client}</span>` : ''}
          ${info.pm ? `<span style="font-size:12px;color:var(--muted)">👤 ${info.pm}</span>` : ''}
          ${info.testcompleteDate ? `<span style="font-size:12px;color:var(--muted)">📅 TC: ${fmtDate(info.testcompleteDate)}</span>` : ''}
          ${refDate && refDate !== info.testcompleteDate ? `<span style="font-size:12px;color:var(--muted)">🏷 Last billed: ${fmtDate(refDate)}</span>` : ''}
          ${days !== null && days !== undefined ? `<span style="font-size:12px;font-weight:700;color:${days>=90?'var(--red)':'var(--amber)'}">${days} days since last billed</span>` : ''}
        </div>
        ${!canClose && section !== 'pending' ? `<div style="margin-top:6px;font-size:11px;color:var(--red)">⚠ ${openTasks.length} open task${openTasks.length>1?'s':''} remaining</div>` : ''}
        ${canClose && section === 'testcomplete' ? `<div style="margin-top:6px;font-size:11px;color:#4caf7d">✓ All tasks complete</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center">
        <button onclick="selectProject('${p.id}',null);document.getElementById('navProjects')?.classList.add('active')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;color:var(--text);cursor:pointer">
          View
        </button>
        ${buttons}
      </div>
    </div>`;
  };

  const section = (title, color, icon, items, sectionKey, emptyMsg) => {
    let html = `<div style="margin-bottom:32px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid ${color}22">
        <span style="font-size:18px">${icon}</span>
        <div style="font-size:14px;font-weight:700;color:var(--text)">${title}</div>
        <div style="font-size:12px;font-weight:600;color:${color};background:${color}22;padding:2px 10px;border-radius:20px">${items.length}</div>
      </div>`;
    if (items.length === 0) {
      html += `<div style="font-size:13px;color:var(--muted);padding:16px;text-align:center;background:var(--surface);border-radius:8px;border:1px solid var(--border)">${emptyMsg}</div>`;
    } else {
      html += `<div style="display:flex;flex-direction:column;gap:10px">`;
      items.forEach(item => { html += projectCard({...item, section: sectionKey}); });
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  };

  let html = '';
  html += section('Testing Complete — 60+ Days', '#e8a234', '🕐', testComplete60, 'testcomplete', 'No projects have been in Testing Complete for 60+ days.');
  html += section('Ready to Close', '#4caf7d', '✅', readyToClose, 'readytoclose', 'No projects are ready to close yet.');
  html += section("Pending Jordan's Approval", '#5b9cf6', '⏳', pendingJordan, 'pending', 'No projects pending approval.');

  body.innerHTML = html;
}

function markProjectComplete(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  const projTasks = taskStore.filter(t => t.proj === projId);
  const blocking = projTasks.filter(t => !['complete','billed','cancelled'].includes(t.status));
  if (blocking.length > 0) {
    toast(`⚠ Cannot mark Complete — ${blocking.length} open task${blocking.length>1?'s':''} remaining.`, 'error');
    return;
  }
  info.status = 'complete';
  if (sb) dbUpdate('project_info', projId, { status: 'complete' });
  toast('Project marked Complete');
  renderClosingReport();
}

function approveClosing(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  info.status = 'closed';
  if (sb) dbUpdate('project_info', projId, { status: 'closed' });
  toast('Project approved and closed.');
  renderClosingReport();
}

function rejectClosing(projId) {
  const reason = prompt('Reason for rejection (will be noted):');
  if (reason === null) return; // cancelled
  const info = projectInfo[projId];
  if (!info) return;
  info.status = 'complete';
  if (sb) dbUpdate('project_info', projId, { status: 'complete' });
  toast('Closing rejected — project returned to Complete.');
  renderClosingReport();
}

function generateClosingPdf(projId) {
  const info = projectInfo[projId];
  if (!info) return;

  // Block if open tasks
  const projTasks = taskStore.filter(t => t.proj === projId);
  const blocking = projTasks.filter(t => !['complete','billed','cancelled'].includes(t.status));
  if (blocking.length > 0) {
    toast('⚠ Cannot close — ' + blocking.length + ' open task(s) remaining.', 'error');
    return;
  }

  const proj = projects.find(p => p.id === projId);
  if (!proj) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const fmtDate = ds => ds ? new Date(ds+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  // ── Header ──
  doc.setFillColor(30, 30, 40);
  doc.rect(0, 0, pageW, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('NUWorkspace — Project Closing Report', margin, 30);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated: ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}), margin, 50);
  doc.text('Status: Closing (Pending Approval)', pageW - margin, 50, {align:'right'});
  y = 90;

  // ── Project Title ──
  doc.setTextColor(20, 20, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(proj.name, margin, y);
  y += 8;
  doc.setDrawColor(91, 156, 246);
  doc.setLineWidth(2);
  doc.line(margin, y, margin + contentW, y);
  y += 16;

  // ── Project Info Grid ──
  const infoItems = [
    ['Client', info.client || '—'],
    ['Project Manager', info.pm || '—'],
    ['Quote Number', info.quoteNumber || '—'],
    ['PO Number', info.po || '—'],
    ['Created Date', fmtDate(info.startDate)],
    ['Closed Date', fmtDate(info.endDate)],
    ['Billing Type', info.billingType || '—'],
    ['Contract Amount', info.contract ? '$' + parseFloat(info.contract).toLocaleString() : '—'],
  ];

  doc.setFontSize(10);
  const colW = contentW / 2;
  infoItems.forEach((item, i) => {
    const x = margin + (i % 2 === 0 ? 0 : colW);
    const rowY = y + Math.floor(i / 2) * 22;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 120);
    doc.text(item[0].toUpperCase(), x, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 30);
    doc.text(String(item[1]), x, rowY + 12);
  });
  y += Math.ceil(infoItems.length / 2) * 22 + 20;

  // ── Section helper ──
  const sectionHeader = (title) => {
    if (y > pageH - 120) { doc.addPage(); y = margin; }
    doc.setFillColor(240, 242, 255);
    doc.rect(margin, y - 12, contentW, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(60, 80, 160);
    doc.text(title, margin + 6, y + 2);
    y += 16;
    doc.setTextColor(20, 20, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };

  // ── Tasks ──
  sectionHeader('TASKS');
  const taskData = projTasks.map(t => [
    t.name.length > 50 ? t.name.substring(0,50)+'...' : t.name,
    t.status.charAt(0).toUpperCase() + t.status.slice(1),
    t.assignee || '—',
    t.dueDate ? fmtDate(t.dueDate) : '—',
    t.fixedPrice ? '$' + parseFloat(t.fixedPrice).toLocaleString() : '—',
  ]);

  doc.autoTable({
    startY: y,
    head: [['Task Name', 'Status', 'Assigned To', 'Due Date', 'Value']],
    body: taskData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [50, 50, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 60 }, 2: { cellWidth: 80 }, 3: { cellWidth: 65 }, 4: { cellWidth: 65 } },
  });
  y = doc.lastAutoTable.finalY + 20;

  // ── Expenses ──
  sectionHeader('EXPENSES');
  const expenses = (window.expenseStore || expenseStore || []).filter(e => e.projId === projId);
  if (expenses.length === 0) {
    doc.text('No expenses recorded.', margin + 6, y + 4);
    y += 20;
  } else {
    const plannedTotal = expenses.reduce((s,e) => s + (parseFloat(e.planned)||0), 0);
    const actualTotal  = expenses.reduce((s,e) => s + (parseFloat(e.actual)||0), 0);
    const taskName = (taskId) => { const t = taskStore.find(t=>t._id===taskId); return t ? t.name : '—'; };
    const expData = expenses.map(e => [
      e.name || '—',
      e.taskId ? taskName(e.taskId) : '—',
      e.planned > 0 ? '$' + parseFloat(e.planned).toLocaleString('en-US',{minimumFractionDigits:2}) : '—',
      e.actual > 0 ? '$' + parseFloat(e.actual).toLocaleString('en-US',{minimumFractionDigits:2}) : '—',
    ]);
    expData.push(['', 'TOTAL',
      '$' + plannedTotal.toLocaleString('en-US',{minimumFractionDigits:2}),
      '$' + actualTotal.toLocaleString('en-US',{minimumFractionDigits:2}),
    ]);
    doc.autoTable({
      startY: y,
      head: [['Description', 'Task', 'Planned', 'Actual']],
      body: expData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [50, 50, 70], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 252] },
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  // ── Invoice Summary ──
  sectionHeader('INVOICE SUMMARY');
  const billedTasks = projTasks.filter(t => t.status === 'billed');
  const totalBilled = billedTasks.reduce((s,t) => s + (parseFloat(t.fixedPrice)||0), 0);
  const totalContract = parseFloat(info.contract) || 0;
  const invData = [
    ['Contract Amount', '$' + totalContract.toLocaleString('en-US',{minimumFractionDigits:2})],
    ['Total Billed (tasks)', '$' + totalBilled.toLocaleString('en-US',{minimumFractionDigits:2})],
    ['Remaining', '$' + (totalContract - totalBilled).toLocaleString('en-US',{minimumFractionDigits:2})],
  ];
  doc.autoTable({
    startY: y,
    body: invData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 200 }, 1: { cellWidth: 150 } },
    alternateRowStyles: { fillColor: [248, 248, 252] },
  });
  y = doc.lastAutoTable.finalY + 20;

  // ── Hours Summary ──
  sectionHeader('HOURS SUMMARY');
  const hoursMap = {};
  Object.entries(tsData).forEach(([key, rows]) => {
    if (!key.includes('|') || key.startsWith('oh_')) return;
    if (!Array.isArray(rows)) return;
    const empId = key.split('|')[0];
    rows.forEach(row => {
      if (row.projId !== projId) return;
      const hrs = Object.values(row.hours||{}).reduce((s,h)=>s+(parseFloat(h)||0),0);
      if (hrs > 0) hoursMap[empId] = (hoursMap[empId]||0) + hrs;
    });
  });
  const grandHrs = Object.values(hoursMap).reduce((s,h)=>s+h,0);
  const hrsData = Object.entries(hoursMap).map(([empId, hrs]) => {
    const emp = employees.find(e => e.id === empId);
    return [emp ? emp.name : empId, hrs.toFixed(1) + ' hrs'];
  });
  if (hrsData.length === 0) {
    doc.text('No hours logged.', margin + 6, y + 4);
    y += 20;
  } else {
    hrsData.push(['TOTAL', grandHrs.toFixed(1) + ' hrs']);
    doc.autoTable({
      startY: y,
      head: [['Employee', 'Total Hours']],
      body: hrsData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [50, 50, 70], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 120 } },
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  // ── Footer on each page ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 160);
    doc.text('NUWorkspace — CONFIDENTIAL', margin, pageH - 20);
    doc.text('Page ' + i + ' of ' + pageCount, pageW - margin, pageH - 20, {align:'right'});
    doc.text(proj.name, pageW/2, pageH - 20, {align:'center'});
  }

  // ── Save PDF ──
  const safeName = proj.name.replace(/[^a-z0-9]/gi,'_');
  doc.save('Closing_' + safeName + '_' + new Date().toISOString().slice(0,10) + '.pdf');

  // ── Mark as closing in app ──
  info.status = 'closing';
  if (sb) dbUpdate('project_info', projId, { status: 'closing' });
  toast('PDF downloaded — project marked as Closing.');
  renderClosingReport();
}



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
    // Load closed project_info
    let closedInfo = [];
    let page = 0;
    while (true) {
      const { data } = await sb.from('project_info')
        .select('*')
        .eq('status', 'closed')
        .range(page * 1000, page * 1000 + 999);
      if (!data || data.length === 0) break;
      closedInfo = closedInfo.concat(data);
      if (data.length < 1000) break;
      page++;
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

    // Load tasks for closed projects
    if (closedProjIds.size > 0) {
      let taskPage = 0;
      while (true) {
        const { data } = await sb.from('tasks')
          .select('*')
          .in('project_id', [...closedProjIds])
          .range(taskPage * 1000, taskPage * 1000 + 999);
        if (!data || data.length === 0) break;
        data.forEach(r => {
          if (taskStore.find(t => t._id === r.id)) return; // skip duplicates
          taskStore.push({
            _id: r.id, taskNum: r.task_num||0, proj: r.project_id,
            name: r.name||'', status: r.status||'new',
            assign: r.assignee||'',
            due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
            due_raw: r.due_date||'',
            overdue: false, done: r.done||false,
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

    closedProjectsLoaded = true;
    if (el) { el.innerHTML = '<span class="icon">✓</span> Closed Jobs Loaded'; el.style.color = 'var(--green)'; }
    
    // Re-render
    renderProjectNav();
    renderAllViews();
    toast('✓ Closed jobs loaded (' + closedInfo.length + ' projects)');

  } catch(e) {
    console.error('loadClosedProjects:', e);
    toast('⚠ Error loading closed jobs: ' + e.message);
    if (el) { el.innerHTML = '<span class="icon">🔒</span> Load Closed Jobs'; el.style.pointerEvents = ''; }
  }
}



// ===== ACTIVITY PANEL (per project) =====
// ===== ACTIVITY PANEL (per project) =====
async function renderActivityPanel(projId) {
  const el = document.getElementById('activityPanelBody');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:13px">Loading...</div>';

  const proj = projects.find(p => p.id === projId);
  let logs = [];
  if (sb) {
    const { data } = await sb.from('activity_log')
      .select('*')
      .or('record_id.eq.' + projId + ',record_id.in.(' + taskStore.filter(t => t.proj === projId).map(t => t._id).join(',') + ')')
      .order('created_at', { ascending: false })
      .limit(100);
    logs = data || [];
  }

  const fmtDate = d => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const fieldLabels = {};
  Object.values(AUDIT_FIELD_DEFS).forEach(arr => arr.forEach(f => fieldLabels[f.key] = f.label));

  if (logs.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">📋</div><div>No activity recorded yet for this project.</div></div>';
    return;
  }

  el.innerHTML = '<div style="margin-bottom:16px"><div style="font-family:DM Serif Display,serif;font-size:20px;color:var(--text)">📋 Activity Log</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + logs.length + ' changes recorded</div></div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:2px solid var(--border)">' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">When</th>' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Who</th>' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Record</th>' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Field</th>' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">From</th>' +
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">To</th>' +
    '</tr></thead><tbody>' +
    logs.map(l =>
      '<tr style="border-bottom:1px solid var(--border)">' +
      '<td style="padding:9px 14px;font-size:11px;color:var(--muted);white-space:nowrap">' + fmtDate(l.created_at) + '</td>' +
      '<td style="padding:9px 14px;font-size:13px;font-weight:500">' + (l.employee_name||'—') + '</td>' +
      '<td style="padding:9px 14px;font-size:12px">' +
        '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface2);color:var(--muted);margin-right:6px">' + l.record_type + '</span>' +
        (l.record_label||'—') + '</td>' +
      '<td style="padding:9px 14px;font-size:12px">' + (fieldLabels[l.field_changed] || l.field_changed) + '</td>' +
      '<td style="padding:9px 14px;font-size:12px;color:var(--red);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (l.old_value||'—') + '</td>' +
      '<td style="padding:9px 14px;font-size:12px;color:var(--green);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (l.new_value||'—') + '</td>' +
      '</tr>'
    ).join('') +
    '</tbody></table></div>';
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
