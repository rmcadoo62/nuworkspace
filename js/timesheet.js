
// ===== TIMESHEET =====
// ===== TIMESHEET =====
// Data: tsData[weekKey][rowIndex] = {projId, taskName, hours:{Mon:..,Tue:..,..}}
const OVERHEAD_CATS = [
  'General Overhead','Sales Support','Sick',
  'Vacation Time','Personal Time','Holiday','Snow Day'
];



// ===== SEARCHABLE PROJECT PICKER (TIMESHEET) =====
// ===== SEARCHABLE PROJECT PICKER (TIMESHEET) =====
let tsProjFocusIdx = {}; // track keyboard focus per row

function openTsProjDropdown(key, ri) {
  const dd = document.getElementById('ts-proj-dd-'+key+'-'+ri);
  const inp = document.getElementById('ts-proj-input-'+key+'-'+ri);
  if (!dd || !inp) return;
  inp.value = '';
  renderTsProjDropdown(key, ri, '');
  dd.classList.add('open');
  tsProjFocusIdx[key+'-'+ri] = -1;

  // Close when clicking outside
  setTimeout(() => {
    const handler = function(e) {
      const wrap = document.getElementById('ts-picker-wrap-'+key+'-'+ri);
      if (wrap && !wrap.contains(e.target)) {
        closeTsProjDropdown(key, ri);
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 10);
}

function closeTsProjDropdown(key, ri) {
  const dd = document.getElementById('ts-proj-dd-'+key+'-'+ri);
  if (dd) dd.classList.remove('open');
  // Restore display name if nothing selected
  const row = tsData[key] && tsData[key][ri];
  const inp = document.getElementById('ts-proj-input-'+key+'-'+ri);
  if (inp && row && !row.isOverhead) {
    const p = projects.find(x => x.id === row.projId);
    inp.value = p ? p.emoji+' '+p.name : '';
  }
}

function renderTsProjDropdown(key, ri, search) {
  const dd = document.getElementById('ts-proj-dd-'+key+'-'+ri);
  if (!dd) return;
  // Search on name only — strip any emoji/spaces the user may have typed
  const q = search.replace(/[^a-zA-Z0-9 \-]/g, '').toLowerCase().trim();
  const openProjects = projects.filter(p => {
    const info = projectInfo[p.id];
    return !info || info.status !== 'closed';
  });
  const filtered = q === '' ? openProjects : openProjects.filter(p =>
    p.name.toLowerCase().includes(q)
  );
  let html = '<div class="ts-proj-drop-list" id="ts-proj-drop-list-'+key+'-'+ri+'">';
  if (filtered.length === 0 && !q.includes('over')) {
    html += '<div class="ts-proj-drop-empty">No projects match</div>';
  }
  filtered.forEach((p, i) => {
    html += '<div class="ts-proj-drop-item" data-idx="'+i+'" data-id="'+p.id+'"'+
      ' onmousedown="selectTsProjItem(event,\''+key+'\','+ri+',\''+p.id+'\')">'+
      '<span>'+p.emoji+'</span><span>'+p.name+'</span></div>';
  });
  // Always show Overhead at bottom
  if (!q || 'overhead'.includes(q)) {
    html += '<div class="ts-proj-drop-divider">Overhead</div>';
    OVERHEAD_CATS.forEach(cat => {
      html += '<div class="ts-proj-drop-item overhead"'+
        ' onmousedown="selectTsOverheadItem(event,\''+key+'\','+ri+',\''+cat.replace(/'/g,"\'")+'\')">'+
        '<span>⬡</span><span>'+cat+'</span></div>';
    });
  }
  html += '</div>';
  dd.innerHTML = html;
}

function filterTsProjDropdown(key, ri, search) {
  const dd = document.getElementById('ts-proj-dd-'+key+'-'+ri);
  if (dd && !dd.classList.contains('open')) dd.classList.add('open');
  renderTsProjDropdown(key, ri, search);
}

function selectTsProjItem(e, key, ri, projId) {
  e.preventDefault();
  const row = tsData[key][ri];
  row.isOverhead = false;
  row.projId = projId;
  row.taskName = '';
  row.overheadCat = '';
  const p = projects.find(x => x.id === projId);
  const inp = document.getElementById('ts-proj-input-'+key+'-'+ri);
  if (inp) inp.value = p ? p.emoji+' '+p.name : '';
  closeTsProjDropdown(key, ri);
  // Update task dropdown
  const taskSel = document.getElementById('ts-task-'+key+'-'+ri);
  if (taskSel) {
    const tasks = taskStore.filter(t => t.proj === projId);
    taskSel.innerHTML = '<option value="">— select task —</option>'+
      tasks.map(t => '<option value="'+t.name+'">'+(t.name.length>38?t.name.slice(0,38)+'…':t.name)+'</option>').join('');
  }
}

function selectTsOverheadItem(e, key, ri, cat) {
  e.preventDefault();
  const row = tsData[key][ri];
  row.isOverhead = true;
  row.projId = '';
  row.taskName = '';
  row.overheadCat = cat;
  renderTimesheet();
}

function tsProjKeydown(e, key, ri) {
  const dd = document.getElementById('ts-proj-dd-'+key+'-'+ri);
  if (!dd || !dd.classList.contains('open')) return;
  const items = dd.querySelectorAll('.ts-proj-drop-item');
  let idx = tsProjFocusIdx[key+'-'+ri] || -1;
  if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx+1, items.length-1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx-1, 0); }
  else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); items[idx].dispatchEvent(new MouseEvent('mousedown')); return; }
  else if (e.key === 'Escape') { closeTsProjDropdown(key, ri); return; }
  tsProjFocusIdx[key+'-'+ri] = idx;
  items.forEach((el, i) => el.classList.toggle('focused', i === idx));
  if (items[idx]) items[idx].scrollIntoView({block:'nearest'});
}


// ===== TIMESHEET STATUS =====
// ===== TIMESHEET STATUS =====
async function loadTsStatuses() {
  if (!sb) return;
  const { data } = await sb.from('timesheet_weeks').select('*');
  if (!data) return;
  data.forEach(r => {
    tsWeekStatuses[r.id] = {
      id: r.id,
      weekKey: r.week_key,
      status: r.status,
      employeeId: r.employee_id,
      submittedBy: r.submitted_by,
      rejectionNote: r.rejection_note || '',
      approvedBy: r.approved_by || ''
    };
  });

}
function getTsWeekStatus(key) {
  const emp = currentEmployee;
  if (!emp) return null;
  // Find status for this employee + week
  return Object.values(tsWeekStatuses).find(s => s.weekKey === key && s.employeeId === emp.id) || null;
}


function setTsProxy(empId) {
  proxyEmployee = empId ? employees.find(e => e.id === empId) : null;
  // When switching employee context, renderTimesheet will use getTsKey
  // which now includes the empId, so each person's data is isolated
  renderTimesheet();
}

// Override getWeekStatusObj to use proxyEmployee when set
const _origGetWeekStatusObj = getWeekStatusObj;
function getWeekStatusObj(key) {
  const emp = proxyEmployee || currentEmployee;
  if (!emp) return null;
  const weekDate = key.includes('|') ? key.split('|')[1] : key;
  const match = Object.values(tsWeekStatuses).find(s => s.weekKey === weekDate && s.employeeId === emp.id);
  return match || null;
}

// Override isWeekLocked — uses proxyEmployee when set, and strips empId prefix from key
function isWeekLocked(key) {
  const emp = proxyEmployee || currentEmployee;
  if (!emp) return false;
  // key may be 'empId|weekDate' — strip to just the date for status lookup
  const weekDate = key.includes('|') ? key.split('|')[1] : key;
  const status = Object.values(tsWeekStatuses).find(s => s.weekKey === weekDate && s.employeeId === emp.id);
  // Rejected timesheets are always editable so corrections can be made
  if (!status) return false;
  return status.status === 'submitted' || status.status === 'approved';
}


async function autoApproveProxyTimesheet() {
  const key = getTsKey(tsWeekOffset);
  const emp = proxyEmployee;
  if (!emp || !sb) return;
  const rows = tsData[key] || [];
  const ohData2 = tsData['oh_' + key] || {};
  const projHours = rows.reduce((s,r) => s + Object.values(r.hours).reduce((a,b)=>a+b,0), 0);
  const ohHours2 = OVERHEAD_CATS.reduce((s,cat) => s + Object.values(ohData2[cat]||{}).reduce((a,b)=>a+b,0), 0);
  const totalHours = projHours + ohHours2;
  if (totalHours === 0) { toast('No hours to save'); return; }

  const weekDateAA = key.includes('|') ? key.split('|')[1] : key;

  // DELETE existing entries then INSERT fresh — avoids duplicate rows
  await sb.from('timesheet_entries')
    .delete()
    .eq('employee_id', emp.id)
    .eq('week_start', weekDateAA);

  // INSERT project rows
  for (const row of rows) {
    const hasHours = Object.values(row.hours).some(h=>h>0);
    if (!hasHours) continue;
    await sb.from('timesheet_entries').insert({
      week_start: weekDateAA, project_id: row.isOverhead ? null : (row.projId||null),
      task_name: row.isOverhead ? ('⬡ ' + row.overheadCat) : (row.taskName||null),
      hours_json: JSON.stringify(row.hours),
      employee_id: emp.id,
      is_overhead: row.isOverhead||false, overhead_cat: row.overheadCat||null,
    });
  }
  // INSERT overhead rows
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    if (!Object.values(hours).some(h=>h>0)) continue;
    await sb.from('timesheet_entries').insert({
      week_start: weekDateAA, project_id: null,
      task_name: '⬡ ' + cat,
      hours_json: JSON.stringify(hours),
      employee_id: emp.id,
      is_overhead: true, overhead_cat: cat,
    });
  }

  // Upsert as approved directly
  const weekDate2 = key.includes('|') ? key.split('|')[1] : key;
  const weekRow = {
    week_key: weekDate2, week_start: weekDate2,
    employee_id: emp.id, employee_name: emp.name,
    submitted_by: currentEmployee ? currentEmployee.id : null,
    approver_id: currentEmployee ? currentEmployee.id : null,
    approved_by: currentEmployee ? currentEmployee.id : null,
    status: 'approved',
  };
  const existing = Object.values(tsWeekStatuses).find(s => s.weekKey === weekDate2 && s.employeeId === emp.id);
  if (existing) {
    await sb.from('timesheet_weeks').update(weekRow).eq('id', existing.id);
    tsWeekStatuses[existing.id] = { ...tsWeekStatuses[existing.id], ...weekRow, weekKey: weekDate2 };
  } else {
    const { data } = await sb.from('timesheet_weeks').insert(weekRow).select().single();
    if (data) tsWeekStatuses[data.id] = { ...weekRow, id: data.id, weekKey: weekDate2, employeeId: emp.id };
  }
  // Sync actual_hours for all projects touched
  const affectedIds = [...new Set((tsData[key]||[]).map(r => r.projId).filter(Boolean))];
  for (const pid of affectedIds) {
    if (typeof syncProjActualHours === 'function') await syncProjActualHours(pid);
  }
  toast('✓ Timesheet saved & approved for ' + emp.name);
  await loadTsStatuses();

  // Re-fetch this employee's entries from DB into tsData so any
  // subsequent re-renders (including realtime-triggered ones) show
  // the correctly saved values — not stale in-memory data.
  try {
    const { data: freshRows } = await sb.from('timesheet_entries')
      .select('*')
      .eq('employee_id', emp.id)
      .eq('week_start', weekDate2);
    if (freshRows) {
      tsData[key] = [];
      const ohKey = 'oh_' + key;
      tsData[ohKey] = {};
      freshRows.forEach(r => {
        if (r.is_overhead && r.overhead_cat) {
          tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
        } else {
          tsData[key].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
            hours: JSON.parse(r.hours_json||'{}'),
          });
        }
      });
    }
  } catch(e) { console.warn('Could not refresh timesheet entries after save:', e); }

  renderTimesheet();
}

async function submitTimesheet() {
  // For paper employees entered by manager — auto-approve, skip submit flow
  // Only if proxy is actively selected (not own timesheet)
  // Auto-approve only when proxy dropdown is actively set to a paper TS employee
  const proxySelect = document.querySelector('.ts-proxy-select');
  const isInProxyMode = proxySelect && proxySelect.value !== '' && proxyEmployee && proxyEmployee.isPaperTs;
  if (isInProxyMode) {
    await autoApproveProxyTimesheet();
    return;
  }
  // Build key using currentEmployee only — never proxy — this is the employee's own submit
  const weekDate = getWeekKey(tsWeekOffset);
  const key = currentEmployee.id + '|' + weekDate;
  const emp = currentEmployee;
  if (!emp) { toast('You must be signed in as an employee to submit'); return; }

  // Save all rows first
  await saveTsWeekToSupabase(key);

  // Find approver for this employee
  const approver = employees.find(e => e.id === emp.approverId);

  const row = {
    week_key: weekDate,
    employee_id: emp.id,
    employee_name: emp.name,
    submitted_by: emp.id,
    status: 'submitted',
    rejection_note: null,
    approver_id: approver ? approver.id : null,
    week_start: weekDate
  };

  // Upsert — strip empId prefix from key before comparing weekKey
  const existing = Object.values(tsWeekStatuses).find(s => s.weekKey === weekDate && s.employeeId === emp.id);
  let saved;
  if (existing) {
    const { data } = await sb.from('timesheet_weeks').update(row).eq('id', existing.id).select().single();
    saved = data;
  } else {
    const { data } = await sb.from('timesheet_weeks').insert(row).select().single();
    saved = data;
  }
  if (saved) {
    tsWeekStatuses[saved.id] = { ...row, id: saved.id, weekKey: weekDate, employeeId: emp.id, status: 'submitted' };
  }
  // Send email to approver
  if (approver?.email !== undefined || approver) {
    try {
      await sb.functions.invoke('send-notification', {
        body: {
          type: 'timesheet_submitted',
          data: {
            employeeName: emp.name,
            employeeId: emp.id,
            weekDate,
            approverId: approver ? approver.id : null,
          }
        }
      });
    } catch(e) { console.warn('Timesheet email notification failed:', e); }
  }
  toast('✅ Timesheet submitted for approval');
  await loadTsStatuses();
  updateTsStatusBadge(getTsKey(tsWeekOffset));
  updateApprovalsBadge();
}

async function saveTsWeekToSupabase(key) {
  if (!sb) return;
  const weekDate = key.includes('|') ? key.split('|')[1] : key;
  const empIdFromKey = key.includes('|') ? key.split('|')[0] : null;
  const empId = (empIdFromKey && empIdFromKey !== '__me__') ? empIdFromKey : currentEmployee?.id;
  if (!empId) return;

  // DELETE all existing entries for this employee+week first, then INSERT fresh.
  // This is the only reliable approach — upsert requires a unique DB constraint
  // that may not exist, causing duplicate rows on every submit.
  await sb.from('timesheet_entries')
    .delete()
    .eq('employee_id', empId)
    .eq('week_start', weekDate);

  // INSERT project rows
  const rows = tsData[key] || [];
  for (const row of rows) {
    const hasHours = Object.values(row.hours).some(h=>h>0);
    if (!hasHours) continue;
    const { data } = await sb.from('timesheet_entries').insert({
      week_start: weekDate,
      project_id: row.projId || null,
      task_name: row.isOverhead ? ('⬡ ' + row.overheadCat) : (row.taskName || ''),
      hours_json: JSON.stringify(row.hours),
      employee_id: empId,
      is_overhead: row.isOverhead || false,
      overhead_cat: row.overheadCat || null
    }).select().single();
    if (data) row._id = data.id;
  }

  // INSERT overhead rows
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    if (!Object.values(hours).some(h=>h>0)) continue;
    await sb.from('timesheet_entries').insert({
      week_start: weekDate,
      project_id: null,
      task_name: '⬡ ' + cat,
      hours_json: JSON.stringify(hours),
      employee_id: empId,
      is_overhead: true,
      overhead_cat: cat
    });
  }

  // Sync actual_hours on project_info
  const affectedProjIds = [...new Set((tsData[key]||[]).map(r => r.projId).filter(Boolean))];
  for (const projId of affectedProjIds) {
    if (typeof syncProjActualHours === 'function') await syncProjActualHours(projId);
  }
}


// getWeekStatusObj defined earlier

function updateApprovalsBadge() {
  if (!isApprover || !currentEmployee) return;
  const pending = Object.values(tsWeekStatuses).filter(s => {
    if (s.status !== 'submitted') return false;
    const emp = employees.find(e => e.id === s.employeeId);
    return emp && emp.approverId === currentEmployee.id;
  }).length;
  const badge = document.getElementById('approvalsBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
    if (pending > 0) badge.style.background = 'rgba(91,156,246,.2)';
  }
}


// ===== APPROVAL QUEUE =====
// ===== APPROVAL QUEUE =====
function openApprovalsPanel(el) {
  activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('topbarName').textContent = 'Approvals';
  
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-approvals').classList.add('active');
  renderApprovalsPanel();
}

async function resetTimesheetToDraft(weekStatusId) {
  if (!confirm('Reopen this timesheet so the employee can make corrections?')) return;
  const ws = Object.values(tsWeekStatuses).find(s => s.id === weekStatusId);
  if (!ws) return;
  if (sb) {
    const { error } = await sb.from('timesheet_weeks')
      .update({ status: 'open', approved_by: null, submitted_by: null })
      .eq('id', weekStatusId);
    if (error) { toast('⚠ Could not reopen timesheet'); console.error(error); return; }
  }
  ws.status = 'open';
  ws.approvedBy = null;
  ws.submittedBy = null;
  toast('✓ Timesheet reopened — employee can now edit and resubmit');
  renderApprovalsPanel();
  updateApprovalsBadge();
}

function renderApprovalsPanel() {
  const body = document.getElementById('approvalQueueBody');
  if (!body) return;

  // Get submitted timesheets for this approver's employees
  const myEmployeeIds = employees.filter(e => e.approverId === currentEmployee?.id).map(e => e.id);


  const pending   = Object.values(tsWeekStatuses).filter(s => s.status === 'submitted' && myEmployeeIds.includes(s.employeeId));
  const rejected  = Object.values(tsWeekStatuses).filter(s => s.status === 'rejected'  && myEmployeeIds.includes(s.employeeId));
  const approved  = Object.values(tsWeekStatuses).filter(s => s.status === 'approved'  && myEmployeeIds.includes(s.employeeId))
    .sort((a,b) => b.weekKey.localeCompare(a.weekKey)).slice(0, 10); // show last 10 approved
  const draft    = Object.values(tsWeekStatuses).filter(s => (s.status === 'open' || s.status === 'draft') && myEmployeeIds.includes(s.employeeId));
  const all = [...pending, ...rejected, ...draft];

  if (all.length === 0) {
    body.innerHTML = '<div class="approval-queue-title">Approvals <span style="font-size:14px;color:var(--muted);font-family:monospace;font-weight:400">(0 pending)</span></div>'+
      '<div style="color:var(--muted);font-size:13px;padding:20px 0">✓ All timesheets reviewed — nothing pending.</div>'+
      (approved.length > 0 ? '<div style="margin-top:20px"><div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Recently Approved</div>' +
        approved.map(ws => {
          const emp = employees.find(e => e.id === ws.employeeId);
          if (!emp) return '';
          const fmtWeek = (() => { const d = new Date(ws.weekKey+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); })();
          return '<div class="approval-card" style="opacity:.8">'+
            '<div class="approval-emp-av" style="background:'+emp.color+'">'+emp.initials+'</div>'+
            '<div class="approval-info">'+
              '<div class="approval-emp-name">'+emp.name+'</div>'+
              '<div class="approval-week">Week of '+fmtWeek+' · <span class="ts-status-badge ts-status-approved">✓ Approved</span></div>'+
            '</div>'+
            '<div class="approval-actions">'+
              '<button class="btn-view-ts" onclick="viewEmployeeTimesheet(\''+ws.employeeId+'\',\''+ws.weekKey+'\')">View</button>'+
              '<button class="btn-reject" style="background:rgba(232,162,52,0.15);color:var(--amber);border-color:rgba(232,162,52,0.4)" onclick="resetTimesheetToDraft(\''+ws.id+'\')">↩ Reopen</button>'+
            '</div>'+
          '</div>';
        }).join('') + '</div>'
      : '');
    return;
  }

  const cards = all.map(ws => {
    const emp = employees.find(e => e.id === ws.employeeId);
    if (!emp) return '';

    const storeKey = emp.id + '|' + ws.weekKey;
    let totalHrs = 0;
    (tsData[storeKey] || []).forEach(r => Object.values(r.hours).forEach(h => totalHrs += h));
    const ohStore = tsData['oh_' + storeKey] || {};
    OVERHEAD_CATS.forEach(cat => Object.values(ohStore[cat] || {}).forEach(h => totalHrs += h));

    const statusBadge = {
      submitted: '<span class="ts-status-badge ts-status-submitted">⏳ Pending Review</span>',
      approved:  '<span class="ts-status-badge ts-status-approved">✓ Approved</span>',
      rejected:  '<span class="ts-status-badge ts-status-rejected">✗ Rejected</span>',
      open:      '<span class="ts-status-badge ts-status-draft">✏ Awaiting Resubmit</span>',
      draft:     '<span class="ts-status-badge ts-status-draft">✏ Awaiting Resubmit</span>',
    }[ws.status] || '';

    const isPending = ws.status === 'submitted';
    const isActionable = isPending || ws.status === 'open' || ws.status === 'draft';
    const fmtWeek = (() => { const d = new Date(ws.weekKey+'T00:00:00'); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); })();
    const isSelf = emp.id === currentEmployee?.id;
    const wsId = ws.id;
    const empId = ws.employeeId;
    const weekKey = ws.weekKey;

    let actions = '';
    if (isActionable) {
      actions += '<button class="btn-approve" onclick="approveTimesheet(\''+wsId+'\')">&#x2713; Approve</button>';
      actions += '<button class="btn-reject" onclick="showRejectInput(\''+wsId+'\')">&#x2717; Reject</button>';
      actions += '<button class="btn-view-ts" style="border-color:rgba(124,92,191,.4);color:var(--purple)" onclick="editAndApprove(\''+wsId+'\',\''+empId+'\',\''+weekKey+'\')">&#x270F; Edit &amp; Approve</button>';
    }
    if (ws.status === 'approved' || ws.status === 'rejected') {
      actions += '<button class="btn-reject" style="background:rgba(232,162,52,0.15);color:var(--amber);border-color:rgba(232,162,52,0.4)" onclick="resetTimesheetToDraft(\''+wsId+'\')">&#x21A9; Reopen</button>';
    }
    actions += '<button class="btn-view-ts" onclick="viewEmployeeTimesheet(\''+empId+'\',\''+weekKey+'\')">View</button>';

    return '<div class="approval-card" id="acard-'+wsId+'">'+
      '<div class="approval-emp-av" style="background:'+emp.color+'">'+emp.initials+'</div>'+
      '<div class="approval-info">'+
        '<div class="approval-emp-name">'+emp.name+(isSelf ? ' <span style="font-size:10px;color:var(--muted);font-weight:400">(You)</span>' : '')+'</div>'+
        '<div class="approval-week">Week of '+fmtWeek+' &middot; '+statusBadge+
          (ws.rejectionNote ? ' <span style="color:var(--muted);font-size:11px">&middot; "'+ws.rejectionNote+'"</span>' : '')+
        '</div>'+
      '</div>'+
      '<span class="approval-hours">'+totalHrs.toFixed(1)+'h</span>'+
      '<div class="approval-actions">'+actions+'</div>'+
      '<div class="reject-note-wrap" id="reject-wrap-'+wsId+'">'+
        '<input class="reject-note-input" id="reject-note-'+wsId+'" placeholder="Rejection reason (optional)\u2026" />'+
        '<button class="btn-reject" onclick="confirmReject(\''+wsId+'\')">Send</button>'+
        '<button class="btn-view-ts" onclick="hideRejectInput(\''+wsId+'\')">Cancel</button>'+
      '</div>'+
    '</div>';
  }).join('');


  body.innerHTML = '<div class="approval-queue-title">Approvals <span style="font-size:14px;color:var(--muted);font-family:monospace;font-weight:400">('+pending.length+' pending)</span></div>' + cards;
}


function showRejectInput(wsId) {
  const wrap = document.getElementById('reject-wrap-'+wsId);
  if (wrap) { wrap.classList.add('open'); document.getElementById('reject-note-'+wsId)?.focus(); }
}
function hideRejectInput(wsId) {
  const wrap = document.getElementById('reject-wrap-'+wsId);
  if (wrap) wrap.classList.remove('open');
}

async function approveTimesheet(wsId) {
  const ws = Object.values(tsWeekStatuses).find(s => s.id === wsId);
  if (!ws) return;
  ws.status = 'approved';
  ws.approvedBy = currentEmployee?.id || '';
  await sb.from('timesheet_weeks').update({ status:'approved', approved_by: currentEmployee?.id, rejection_note: null }).eq('id', wsId);
  toast('✅ Timesheet approved');
  renderApprovalsPanel();
  updateApprovalsBadge();
}

async function confirmReject(wsId) {
  const ws = Object.values(tsWeekStatuses).find(s => s.id === wsId);
  if (!ws) return;
  const note = document.getElementById('reject-note-'+wsId)?.value.trim() || '';
  ws.status = 'rejected';
  ws.rejectionNote = note;
  await sb.from('timesheet_weeks').update({ status:'rejected', rejection_note: note || null }).eq('id', wsId);
  toast('Timesheet returned to employee');
  renderApprovalsPanel();
  updateApprovalsBadge();
}

async function viewEmployeeTimesheet(empId, weekKey) {
  const offset = (() => {
    const target = new Date(weekKey+'T00:00:00');
    const thisWeek = getWeekMonday(0);
    return Math.round((target - thisWeek) / (7*24*60*60*1000));
  })();
  tsWeekOffset = offset;
  // Set proxy to the employee being viewed
  proxyEmployee = employees.find(e => e.id === empId) || null;
  // Don't use openTimesheetPanel as it resets proxyEmployee
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.getElementById('navTimesheetItem');
  if (navItem) navItem.classList.add('active');
  document.getElementById('topbarName').textContent = 'Timesheet';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-timesheet').classList.add('active');

  // Always reload fresh entries from DB so the grid shows the true saved
  // state — prevents stale in-memory data from masking corrections after
  // a reject/reopen cycle (the "reverts to old hours" bug).
  if (sb && empId) {
    try {
      const storeKey = empId + '|' + weekKey;
      const ohKey = 'oh_' + storeKey;
      const { data: freshRows } = await sb.from('timesheet_entries')
        .select('*')
        .eq('employee_id', empId)
        .eq('week_start', weekKey);
      if (freshRows) {
        tsData[storeKey] = [];
        tsData[ohKey] = {};
        freshRows.forEach(r => {
          if (r.is_overhead && r.overhead_cat) {
            tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
          } else {
            tsData[storeKey].push({
              _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
              isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
              hours: JSON.parse(r.hours_json||'{}'),
            });
          }
        });
      }
    } catch(e) { console.warn('Could not refresh timesheet entries for view:', e); }
  }

  renderTimesheet();
}




// ===== EDIT & APPROVE =====
// Opens the employee's timesheet in editable proxy mode with a Save & Approve button
async function editAndApprove(wsId, empId, weekKey) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  // Set proxy and navigate to that week
  proxyEmployee = emp;
  const offset = (() => {
    const target = new Date(weekKey+'T00:00:00');
    const thisWeek = getWeekMonday(0);
    return Math.round((target - thisWeek) / (7*24*60*60*1000));
  })();
  tsWeekOffset = offset;

  // Switch to timesheet panel
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.getElementById('navTimesheetItem');
  if (navItem) navItem.classList.add('active');
  document.getElementById('topbarName').textContent = 'Timesheet';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-timesheet').classList.add('active');

  // Load fresh data for this employee+week
  try {
    const storeKey = empId + '|' + weekKey;
    const ohKey = 'oh_' + storeKey;
    const { data: freshRows } = await sb.from('timesheet_entries')
      .select('*').eq('employee_id', empId).eq('week_start', weekKey);
    if (freshRows) {
      tsData[storeKey] = [];
      tsData[ohKey] = {};
      freshRows.forEach(r => {
        if (r.is_overhead && r.overhead_cat) {
          tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
        } else {
          tsData[storeKey].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
            hours: JSON.parse(r.hours_json||'{}'),
          });
        }
      });
    }
  } catch(e) { console.warn('editAndApprove reload error:', e); }

  // Store wsId for the Save & Approve button
  window._editApproveWsId = wsId;
  window._editApproveEmpId = empId;
  window._editApproveWeekKey = weekKey;

  renderTimesheet();

  // Inject Save & Approve button into the status bar
  setTimeout(() => {
    const key = empId + '|' + weekKey;
    const badgeId = 'ts-status-badge-' + key.replace(/[^a-z0-9]/gi,'-');
    const badgeEl = document.getElementById(badgeId);
    if (badgeEl) {
      badgeEl.insertAdjacentHTML('afterend',
        '<button class="ts-add-row-btn" style="background:var(--green);margin-left:8px" onclick="saveAndApproveForEmployee()">&#x2713; Save &amp; Approve</button>'
      );
    }
  }, 100);
}

async function saveAndApproveForEmployee() {
  const wsId    = window._editApproveWsId;
  const empId   = window._editApproveEmpId;
  const weekKey = window._editApproveWeekKey;
  if (!wsId || !empId || !weekKey || !sb) return;

  const key = empId + '|' + weekKey;
  toast('Saving…');

  // Delete existing entries and insert corrected ones
  await sb.from('timesheet_entries').delete().eq('employee_id', empId).eq('week_start', weekKey);

  const rows = tsData[key] || [];
  for (const row of rows) {
    if (!Object.values(row.hours).some(h=>h>0)) continue;
    await sb.from('timesheet_entries').insert({
      week_start: weekKey,
      project_id: row.projId || null,
      task_name: row.isOverhead ? ('⬡ ' + row.overheadCat) : (row.taskName || ''),
      hours_json: JSON.stringify(row.hours),
      employee_id: empId,
      is_overhead: row.isOverhead || false,
      overhead_cat: row.overheadCat || null,
    });
  }
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {};
    if (!Object.values(hours).some(h=>h>0)) continue;
    await sb.from('timesheet_entries').insert({
      week_start: weekKey, project_id: null,
      task_name: '⬡ ' + cat, hours_json: JSON.stringify(hours),
      employee_id: empId, is_overhead: true, overhead_cat: cat,
    });
  }

  // Mark as approved
  await sb.from('timesheet_weeks').update({
    status: 'approved',
    approved_by: currentEmployee ? currentEmployee.id : null,
    rejection_note: null,
  }).eq('id', wsId);

  // Update local cache
  if (tsWeekStatuses[wsId]) {
    tsWeekStatuses[wsId].status = 'approved';
    tsWeekStatuses[wsId].approvedBy = currentEmployee?.id || '';
  }

  // Clear edit state and return to approvals
  window._editApproveWsId = null;
  proxyEmployee = null;
  tsWeekOffset = 0;

  toast('\u2713 Timesheet corrected and approved');
  await loadTsStatuses();
  openApprovalsPanel(document.getElementById('navApprovals'));
  updateApprovalsBadge();
}


async function forceUnlockTimesheet(wsId) {
  if (!confirm('Unlock this timesheet for editing? You can re-approve after corrections.')) return;
  const ws = Object.values(tsWeekStatuses).find(s => s.id === wsId);
  if (!ws || !sb) return;
  const { error } = await sb.from('timesheet_weeks')
    .update({ status: 'open', approved_by: null })
    .eq('id', wsId);
  if (error) { toast('Could not unlock timesheet'); return; }
  ws.status = 'open';
  ws.approvedBy = null;
  toast('\u2713 Timesheet unlocked — you can now edit and re-approve');
  renderTimesheet();
}

