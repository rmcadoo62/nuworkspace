
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
  row.taskId = null;
  row.overheadCat = '';
  closeTsProjDropdown(key, ri);
  // Re-render so the row moves into the correct project group (grouped layout)
  renderTimesheet();
  // Auto-focus the new row's task dropdown for fast entry
  setTimeout(() => {
    const sel = document.getElementById('ts-task-'+key+'-'+ri);
    if (sel) sel.focus();
  }, 50);
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
  const { error: aaDelErr } = await sb.from('timesheet_entries')
    .delete()
    .eq('employee_id', emp.id)
    .eq('week_start', weekDateAA);
  if (aaDelErr) {
    console.error('[autoApprove] DELETE failed:', aaDelErr);
    toast('⚠ Delete failed — aborting approval: ' + (aaDelErr.message||''));
    return;
  }

  const aaFailed = [];

  // UPSERT project rows (project_id + task_id both non-null → unique constraint applies)
  for (const row of rows) {
    if (row.isOverhead) continue; // overhead handled below
    const hasHours = Object.values(row.hours).some(h=>h>0);
    if (!hasHours) continue;
    const aaPayload = {
      week_start: weekDateAA, project_id: row.projId||null,
      task_name: row.taskName||null,
      task_id: row.taskId||null,
      hours_json: JSON.stringify(row.hours),
      employee_id: emp.id,
      is_overhead: false, overhead_cat: null,
    };
    const { error: aaErr } = await sb.from('timesheet_entries')
      .upsert(aaPayload, { onConflict: 'week_start,employee_id,task_id,project_id' });
    if (aaErr) {
      console.error('[autoApprove] UPSERT project-row failed:', { payload: aaPayload, error: aaErr });
      aaFailed.push({ kind:'project', payload: aaPayload, error: aaErr });
    }
  }
  // INSERT overhead rows (unique constraint doesn't apply — DELETE above clears priors)
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    if (!Object.values(hours).some(h=>h>0)) continue;
    const aaOhPayload = {
      week_start: weekDateAA, project_id: null,
      task_name: '⬡ ' + cat,
      hours_json: JSON.stringify(hours),
      employee_id: emp.id,
      is_overhead: true, overhead_cat: cat,
    };
    const { error: aaOhErr } = await sb.from('timesheet_entries').insert(aaOhPayload);
    if (aaOhErr) {
      console.error('[autoApprove] INSERT overhead-row failed:', { payload: aaOhPayload, error: aaOhErr });
      aaFailed.push({ kind:'overhead', payload: aaOhPayload, error: aaOhErr });
    }
  }

  // Don't mark the week as approved if rows failed — that'd lock a broken timesheet.
  if (aaFailed.length > 0) {
    const first = aaFailed[0];
    const code = first.error?.code || '';
    const msg  = first.error?.message || 'unknown error';
    toast('⚠ ' + aaFailed.length + ' row(s) did NOT save — approval aborted · ' + code + ' ' + msg);
    return;
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
      const ohCmtKey = 'oh_comments_' + key;
      tsData[ohCmtKey] = {};
      freshRows.forEach(r => {
        if (r.is_overhead && r.overhead_cat) {
          tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
          tsData[ohCmtKey][r.overhead_cat] = JSON.parse(r.notes_json || '{}');
        } else {
          tsData[key].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            taskId: r.task_id||null,
            isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
            hours: JSON.parse(r.hours_json||'{}'),
            comments: JSON.parse(r.notes_json||'{}'),
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
  // Use the pinned week the grid actually rendered, NOT a freshly recomputed offset —
  // recomputing getWeekKey(tsWeekOffset) at submit time submits the wrong week if the
  // clock has crossed the Sat->Sun boundary while the tab was open (the "Lucas bug").
  const weekDate = tsRenderedWeekStart || getWeekKey(tsWeekOffset);
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

  // --- Dedupe tsData rows by (isOverhead, overheadCat, projId, taskId) ---
  // The DB has a unique constraint `timesheet_entries_week_employee_task_project_unique`
  // on (week_start, employee_id, task_id, project_id). If the in-memory tsData has two
  // rows with the same key (e.g. user added the same task twice under a project group),
  // the second INSERT would 409 and that row's hours would silently vanish on refresh.
  // Merge hours + keep the first non-empty comment per day so no data is lost.
  const rawRows = tsData[key] || [];
  const dedupMap = new Map();
  let dedupMerged = 0;
  for (const row of rawRows) {
    const k = row.isOverhead
      ? 'OH|' + (row.overheadCat||'')
      : 'PR|' + (row.projId||'') + '|' + (row.taskId||'');
    if (!dedupMap.has(k)) {
      dedupMap.set(k, {
        ...row,
        hours: { ...(row.hours||{}) },
        comments: { ...(row.comments||{}) }
      });
    } else {
      const ex = dedupMap.get(k);
      for (let d = 0; d < 7; d++) {
        ex.hours[d] = (ex.hours[d]||0) + ((row.hours||{})[d]||0);
      }
      if (row.comments) {
        for (let d = 0; d < 7; d++) {
          if (!ex.comments[d] && row.comments[d]) ex.comments[d] = row.comments[d];
        }
      }
      dedupMerged++;
    }
  }
  const rows = Array.from(dedupMap.values());
  if (dedupMerged > 0) {
    console.warn('[timesheet save] merged ' + dedupMerged + ' duplicate row(s) in tsData before save');
  }

  // DELETE all existing entries for this employee+week first, then UPSERT fresh.
  // UPSERT (not INSERT) so that if the DELETE silently misses any row (e.g. RLS,
  // timing), we UPDATE instead of colliding on the unique constraint.
  const { error: delErr } = await sb.from('timesheet_entries')
    .delete()
    .eq('employee_id', empId)
    .eq('week_start', weekDate);
  if (delErr) {
    console.error('[timesheet save] DELETE failed for', empId, weekDate, delErr);
    // Don't abort — upsert below is our safety net. Log and continue.
  }

  // Track per-row failures so the UI can surface them instead of the old
  // silent-failure behaviour that showed "✓ saved" while rows never landed.
  const failed = [];

  // UPSERT project rows (project_id + task_id both non-null → unique constraint applies)
  for (const row of rows) {
    if (row.isOverhead) continue; // overhead handled below
    const hasHours = Object.values(row.hours).some(h=>h>0);
    if (!hasHours) continue;
    const payload = {
      week_start: weekDate,
      project_id: row.projId || null,
      task_name: row.taskName || '',
      task_id: row.taskId || null,
      hours_json: JSON.stringify(row.hours),
      notes_json: row.comments ? JSON.stringify(row.comments) : null,
      employee_id: empId,
      is_overhead: false,
      overhead_cat: null
    };
    const { data, error } = await sb.from('timesheet_entries')
      .upsert(payload, { onConflict: 'week_start,employee_id,task_id,project_id' })
      .select().single();
    if (error) {
      console.error('[timesheet save] UPSERT project-row failed:', { payload, error });
      failed.push({ kind:'project', payload, error });
      continue;
    }
    if (data) row._id = data.id;
  }

  // INSERT overhead rows — overhead has project_id=null AND task_id=null, so the
  // unique constraint on those columns doesn't apply. DELETE above clears prior rows.
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    if (!Object.values(hours).some(h=>h>0)) continue;
    const ohComments = (tsData['oh_comments_' + key] && tsData['oh_comments_' + key][cat]) || null;
    const ohPayload = {
      week_start: weekDate,
      project_id: null,
      task_name: '⬡ ' + cat,
      hours_json: JSON.stringify(hours),
      notes_json: ohComments ? JSON.stringify(ohComments) : null,
      employee_id: empId,
      is_overhead: true,
      overhead_cat: cat
    };
    const { error: ohErr } = await sb.from('timesheet_entries').insert(ohPayload);
    if (ohErr) {
      console.error('[timesheet save] INSERT overhead-row failed:', { payload: ohPayload, error: ohErr });
      failed.push({ kind:'overhead', payload: ohPayload, error: ohErr });
    }
  }

  // Sync actual_hours on project_info
  const affectedProjIds = [...new Set((tsData[key]||[]).map(r => r.projId).filter(Boolean))];
  for (const projId of affectedProjIds) {
    if (typeof syncProjActualHours === 'function') await syncProjActualHours(projId);
  }

  // Surface silent failures — the original code swallowed every insert error,
  // which is how rows could "disappear" on hard refresh (saved UX, no DB write).
  if (failed.length > 0) {
    const first = failed[0];
    const code = first.error?.code || '';
    const msg  = first.error?.message || 'unknown error';
    const hint = first.error?.hint ? (' · hint: ' + first.error.hint) : '';
    toast('⚠ ' + failed.length + ' row(s) did NOT save — ' + code + ' ' + msg + hint);
    throw new Error('[timesheet] ' + failed.length + ' insert failure(s); first: ' + msg);
  }
}

async function saveTsNow(key) {
  if (typeof isWeekLocked === 'function' && isWeekLocked(key)) return;
  // Cancel any pending debounced save for this key
  if (typeof _tsAutoSaveTimers !== 'undefined' && _tsAutoSaveTimers[key]) {
    clearTimeout(_tsAutoSaveTimers[key]);
    delete _tsAutoSaveTimers[key];
  }
  try {
    await saveTsWeekToSupabase(key);
    toast('✅ Timesheet saved');
  } catch (e) {
    // Error already logged + toasted inside saveTsWeekToSupabase.
    // Suppress the misleading success toast so the user sees the real failure.
    console.warn('[saveTsNow] save completed with errors — see earlier console output:', e?.message||e);
  }
}


// getWeekStatusObj defined earlier

// Cached count of pending vacation requests for this approver. Refreshed
// inside updateApprovalsBadge() so the Approvals tab badge can render
// synchronously without a second DB roundtrip.
let _cachedPendingVacationCount = 0;

function _pendingTimesheetCountForApprover() {
  if (!currentEmployee) return 0;
  return Object.values(tsWeekStatuses).filter(s => {
    if (s.status !== 'submitted') return false;
    const emp = employees.find(e => e.id === s.employeeId);
    return emp && emp.approverId === currentEmployee.id;
  }).length;
}

// Resolves which employee IDs the current user is responsible for approving.
// Managers see all active employees; plain approvers see only those who have
// them as approverId. Excludes the current user from the set (people don't
// approve their own requests in the queue).
function _approveeEmployeeIds() {
  if (!currentEmployee) return [];
  return employees
    .filter(e => e.isActive !== false && e.id !== currentEmployee.id && (e.approverId === currentEmployee.id || isManager()))
    .map(e => e.id);
}

async function _fetchPendingVacationCount() {
  if (!sb || !currentEmployee) return 0;
  const ids = _approveeEmployeeIds();
  if (ids.length === 0) return 0;
  try {
    const { count, error } = await sb.from('vacation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('employee_id', ids);
    if (error) { console.warn('[approvals] vacation count error:', error.message); return 0; }
    return count || 0;
  } catch(e) {
    console.warn('[approvals] vacation count exception:', e);
    return 0;
  }
}

async function updateApprovalsBadge() {
  const _mgr = (typeof isManager === 'function') && isManager();
  if ((!isApprover && !_mgr) || !currentEmployee) return;
  const tsPending = _pendingTimesheetCountForApprover();
  // Refresh the cached vacation count, then sum for the badge total.
  _cachedPendingVacationCount = await _fetchPendingVacationCount();
  // Managers/HR also see pending performance reviews awaiting approval.
  let revPending = 0;
  if (_mgr && typeof _fetchPendingReviewCount === 'function') revPending = await _fetchPendingReviewCount();
  let discPending = 0;
  if (_mgr && typeof _fetchPendingDisciplineCount === 'function') discPending = await _fetchPendingDisciplineCount();
  const total = tsPending + _cachedPendingVacationCount + revPending + discPending;
  const badge = document.getElementById('approvalsBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
    if (total > 0) badge.style.background = 'rgba(91,156,246,.2)';
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

  _injectApprovalsTabStylesOnce();

  // Default to whichever tab was last active; first open lands on Timesheets.
  if (!window._approvalsActiveTab) window._approvalsActiveTab = 'timesheets';
  const activeTab = window._approvalsActiveTab;

  const tsCount  = _pendingTimesheetCountForApprover();
  // Use the cached vacation count for the tab badge — updateApprovalsBadge()
  // refreshes the cache as it runs, and the per-tab renderer below pulls
  // fresh data when its tab is selected.
  const vacCount = _cachedPendingVacationCount || 0;
  // Reviews tab is for managers/HR only (supervisors submit, they don't approve).
  const showReviews = (typeof isManager === 'function') && isManager();
  const revCount = (typeof _cachedPendingReviewCount !== 'undefined') ? (_cachedPendingReviewCount || 0) : 0;
  const discCount = (typeof _cachedPendingDisciplineCount !== 'undefined') ? (_cachedPendingDisciplineCount || 0) : 0;
  // A non-manager can't land on the manager-only tabs.
  if ((activeTab === 'reviews' || activeTab === 'discipline') && !showReviews) { window._approvalsActiveTab = 'timesheets'; }

  const tabBtn = (id, label, count, isActive) => {
    const badgeHtml = count > 0
      ? `<span class="approvals-tab-badge">${count}</span>`
      : '';
    return `<button id="approvalsTab-${id}" onclick="switchApprovalsTab('${id}')" class="approvals-tab${isActive ? ' active-tab' : ''}">${label}${badgeHtml}</button>`;
  };

  const activeNow = window._approvalsActiveTab;
  body.innerHTML = `
    <div class="approvals-shell">
      <div class="approvals-header">
        <div class="approval-queue-title" style="margin-bottom:0">Approvals</div>
      </div>
      <div class="approvals-tab-bar">
        ${tabBtn('timesheets', '⏰ Timesheets',        tsCount,  activeNow === 'timesheets')}
        ${tabBtn('vacation',   '✈️ Vacation Requests', vacCount, activeNow === 'vacation')}
        ${showReviews ? tabBtn('reviews', '📝 Reviews', revCount, activeNow === 'reviews') : ''}
        ${showReviews ? tabBtn('discipline', '⚠️ Discipline', discCount, activeNow === 'discipline') : ''}
      </div>
      <div id="approvalsTabContent" class="approvals-tab-content"></div>
    </div>`;

  if (activeNow === 'timesheets') {
    _renderApprovalsTimesheetTab();
  } else if (activeNow === 'vacation') {
    _renderApprovalsVacationTab();
  } else if (activeNow === 'reviews' && typeof _renderApprovalsReviewsTab === 'function') {
    _renderApprovalsReviewsTab();
  } else if (activeNow === 'discipline' && typeof _renderApprovalsDisciplineTab === 'function') {
    _renderApprovalsDisciplineTab();
  }
}

function switchApprovalsTab(tab) {
  window._approvalsActiveTab = tab;
  renderApprovalsPanel();
}

function _injectApprovalsTabStylesOnce() {
  if (document.getElementById('approvalsTabStyles')) return;
  const style = document.createElement('style');
  style.id = 'approvalsTabStyles';
  style.textContent = `
    .approvals-shell { padding: 0; }
    .approvals-header { padding: 32px 40px 12px; }
    .approvals-tab-bar { display: flex; gap: 2px; padding: 0 40px; border-bottom: 1px solid var(--border); background: var(--bg); position: sticky; top: 0; z-index: 5; }
    .approvals-tab {
      background: none; border: none; border-bottom: 2px solid transparent;
      padding: 10px 18px; font-size: 13px; font-weight: 500; cursor: pointer;
      color: var(--muted); font-family: 'DM Sans', sans-serif;
      margin-bottom: -1px; border-radius: 6px 6px 0 0; transition: all .15s;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .approvals-tab:hover { color: var(--text); background: var(--surface2); }
    .approvals-tab.active-tab { color: var(--amber); border-bottom-color: var(--amber); background: var(--bg); }
    .approvals-tab-badge {
      background: rgba(91,156,246,.2); color: var(--blue, #5b9cf6);
      font-size: 11px; font-weight: 700; border-radius: 10px;
      padding: 1px 8px; min-width: 18px; text-align: center;
      font-family: 'JetBrains Mono', monospace;
    }
    .approvals-tab.active-tab .approvals-tab-badge { background: rgba(232,162,52,.18); color: var(--amber); }
    .approvals-tab-content { padding: 24px 40px; }
  `;
  document.head.appendChild(style);
}

// ── Timesheet tab — original approval queue rendering, unchanged behavior ──
function _renderApprovalsTimesheetTab() {
  const content = document.getElementById('approvalsTabContent');
  if (!content) return;

  // Get submitted timesheets for this approver's employees
  const myEmployeeIds = employees.filter(e => e.approverId === currentEmployee?.id).map(e => e.id);

  const pending   = Object.values(tsWeekStatuses).filter(s => s.status === 'submitted' && myEmployeeIds.includes(s.employeeId));
  const rejected  = Object.values(tsWeekStatuses).filter(s => s.status === 'rejected'  && myEmployeeIds.includes(s.employeeId));
  const approved  = Object.values(tsWeekStatuses).filter(s => s.status === 'approved'  && myEmployeeIds.includes(s.employeeId))
    .sort((a,b) => b.weekKey.localeCompare(a.weekKey)).slice(0, 10); // show last 10 approved
  const draft    = Object.values(tsWeekStatuses).filter(s => (s.status === 'open' || s.status === 'draft') && myEmployeeIds.includes(s.employeeId));
  const all = [...pending, ...rejected, ...draft];

  if (all.length === 0) {
    content.innerHTML = '<div style="font-size:14px;color:var(--muted);margin-bottom:14px">' + pending.length + ' pending</div>'+
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

  content.innerHTML = '<div style="font-size:14px;color:var(--muted);margin-bottom:14px">'+pending.length+' pending</div>' + cards;
}

// Toggle handler for the vacation-history "Show all / Show less" button.
// Reads the pre-built short/full HTML that _renderApprovalsVacationTab()
// stashed on window — see the comment there for why this replaced the old
// inline-onclick-with-JSON.stringify approach.
function _toggleVacHistoryApprovals() {
  const list = document.getElementById('vacHistoryListApprovals');
  const btn  = document.getElementById('vacHistoryToggleApprovals');
  if (!list || !btn) return;
  const showing = list.dataset.expanded === '1';
  list.innerHTML = showing ? window._vacHistoryApprovalsShort : window._vacHistoryApprovalsFull;
  list.dataset.expanded = showing ? '0' : '1';
  btn.textContent = showing
    ? 'Show all ' + window._vacHistoryApprovalsCount + ' requests ▼'
    : 'Show less ▲';
}

// ── Vacation Requests tab — pending + history with approve/reject/delete ──
async function _renderApprovalsVacationTab() {
  const content = document.getElementById('approvalsTabContent');
  if (!content) return;

  content.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">Loading vacation requests…</div>';

  // Resolve approvee set the same way the badge count does so the tab and
  // the badge always agree on "what counts as mine to approve."
  const myEmpIds = _approveeEmployeeIds();
  if (myEmpIds.length === 0) {
    content.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">No employees are assigned to you for vacation approval.</div>';
    return;
  }

  let pendingRows = [], historyRows = [];
  try {
    const { data, error } = await sb.from('vacation_requests')
      .select('*')
      .in('employee_id', myEmpIds)
      .order('created_at', { ascending: false });
    if (error) {
      content.innerHTML = '<div style="color:var(--red);font-size:13px;padding:20px 0">⚠ Could not load vacation requests: ' + error.message + '</div>';
      return;
    }
    const all = data || [];
    pendingRows = all.filter(r => r.status === 'pending');
    historyRows = all.filter(r => r.status !== 'pending');
  } catch(e) {
    content.innerHTML = '<div style="color:var(--red);font-size:13px;padding:20px 0">⚠ Could not load vacation requests.</div>';
    console.error('[approvals] vacation load exception:', e);
    return;
  }

  // Keep the cached count in sync with what we just loaded — protects against
  // drift between the tab badge and the body when this tab is opened directly.
  _cachedPendingVacationCount = pendingRows.length;

  const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const statusColor = { pending: '#e8a234', approved: '#4caf7d', rejected: '#d04040' };
  const statusLabel = { pending: '⏳ Pending', approved: '✓ Approved', rejected: '✗ Rejected' };

  const buildRow = (r, showActions) => {
    const sc = statusColor[r.status] || '#888';
    const sl = statusLabel[r.status] || r.status;
    const days = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
    const reqEmp = employees.find(e => e.id === r.employee_id);
    return `
    <div data-req-id="${r.id}" style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg)">
      <div style="width:34px;height:34px;border-radius:50%;background:${reqEmp?.color||'#888'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${reqEmp?.initials||'?'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${r.employee_name}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px">
          <div style="font-size:12px;color:var(--muted)">${fmtD(r.start_date)} → ${fmtD(r.end_date)}</div>
          <span style="font-size:10px;color:var(--muted)">${days} day${days!==1?'s':''}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${sc}22;color:${sc};border:1px solid ${sc}44">${sl}</span>
        </div>
        ${r.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${r.notes}</div>` : ''}
        ${r.approver_note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic">💬 ${r.approver_note}</div>` : ''}
      </div>
      ${showActions ? `
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="approveVacationRequest('${r.id}','${r.employee_id}')"
          style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:#4caf7d;cursor:pointer">✓ Approve</button>
        <button onclick="openRejectVacForm('${r.id}','${r.employee_id}')"
          style="background:rgba(208,64,64,0.1);border:1px solid rgba(208,64,64,0.3);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--red);cursor:pointer">✗ Reject</button>
        <button onclick="deleteVacationRequest('${r.id}','${r.employee_id}')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer">🗑</button>
      </div>` : `
      <button onclick="deleteVacationRequest('${r.id}','${r.employee_id}')"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer;flex-shrink:0">🗑</button>`}
    </div>`;
  };

  // Inline reject form target — openRejectVacForm() inserts the form into
  // a #vacReqList-<empId> container; we provide one per pending row so the
  // existing employees.js helpers continue to work unchanged.
  const pendingHtml = pendingRows.length
    ? pendingRows.map(r => `<div id="vacReqList-${r.employee_id}">${buildRow(r, true)}</div>`).join('')
    : '<div style="color:var(--muted);font-size:12px;padding:4px 0">No pending requests.</div>';

  const historyHtml = historyRows.length
    ? `<div id="vacHistoryListApprovals">
        ${historyRows.slice(0, 5).map(r => buildRow(r, false)).join('')}
      </div>
      ${historyRows.length > 5 ? `
        <button id="vacHistoryToggleApprovals" onclick="_toggleVacHistoryApprovals()"
          style="background:none;border:none;color:var(--amber);font-size:12px;cursor:pointer;padding:4px 0;margin-top:4px">
          Show all ${historyRows.length} requests ▼
        </button>` : ''}`
    : '<div style="color:var(--muted);font-size:12px;padding:4px 0">No history yet.</div>';

  // Stash both variants for the toggle button to swap between. Previously
  // these were JSON.stringify'd and inlined directly into the button's
  // onclick="..." attribute — but JSON.stringify wraps strings in double
  // quotes, which collided with the attribute's own double-quote delimiter
  // and broke out of it early, dumping raw HTML/escaped-\n text onto the
  // page (only visible once historyRows.length > 5, since that's the only
  // time this button rendered at all). Storing on window + calling a real
  // function sidesteps the quoting problem entirely.
  window._vacHistoryApprovalsShort = historyRows.slice(0, 5).map(r => buildRow(r, false)).join('');
  window._vacHistoryApprovalsFull  = historyRows.map(r => buildRow(r, false)).join('');
  window._vacHistoryApprovalsCount = historyRows.length;

  content.innerHTML = `
    <div style="font-size:14px;color:var(--muted);margin-bottom:14px">${pendingRows.length} pending</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">⏳ Pending Approvals</div>
      ${pendingHtml}
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📋 Approval History</div>
      ${historyHtml}
    </div>`;
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
        const ohCmtKey = 'oh_comments_' + storeKey;
        tsData[ohCmtKey] = {};
        freshRows.forEach(r => {
          if (r.is_overhead && r.overhead_cat) {
            tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
            tsData[ohCmtKey][r.overhead_cat] = JSON.parse(r.notes_json || '{}');
          } else {
            tsData[storeKey].push({
              _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
              taskId: r.task_id||null,
              isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
              hours: JSON.parse(r.hours_json||'{}'),
              comments: JSON.parse(r.notes_json||'{}'),
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
      const ohCmtKey = 'oh_comments_' + storeKey;
      tsData[ohCmtKey] = {};
      freshRows.forEach(r => {
        if (r.is_overhead && r.overhead_cat) {
          tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
          tsData[ohCmtKey][r.overhead_cat] = JSON.parse(r.notes_json || '{}');
        } else {
          tsData[storeKey].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            taskId: r.task_id||null,
            isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
            hours: JSON.parse(r.hours_json||'{}'),
            comments: JSON.parse(r.notes_json||'{}'),
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
  const { error: saDelErr } = await sb.from('timesheet_entries').delete().eq('employee_id', empId).eq('week_start', weekKey);
  if (saDelErr) {
    console.error('[saveAndApprove] DELETE failed:', saDelErr);
    toast('⚠ Delete failed — aborting: ' + (saDelErr.message||''));
    return;
  }

  const saFailed = [];

  const rows = tsData[key] || [];
  for (const row of rows) {
    if (row.isOverhead) continue; // overhead handled below
    if (!Object.values(row.hours).some(h=>h>0)) continue;
    const saPayload = {
      week_start: weekKey,
      project_id: row.projId || null,
      task_name: row.taskName || '',
      task_id: row.taskId || null,
      hours_json: JSON.stringify(row.hours),
      employee_id: empId,
      is_overhead: false,
      overhead_cat: null,
    };
    const { error: saErr } = await sb.from('timesheet_entries')
      .upsert(saPayload, { onConflict: 'week_start,employee_id,task_id,project_id' });
    if (saErr) {
      console.error('[saveAndApprove] UPSERT project-row failed:', { payload: saPayload, error: saErr });
      saFailed.push({ kind:'project', payload: saPayload, error: saErr });
    }
  }
  const ohData = tsData['oh_' + key] || {};
  for (const cat of OVERHEAD_CATS) {
    const hours = ohData[cat] || {};
    if (!Object.values(hours).some(h=>h>0)) continue;
    const saOhPayload = {
      week_start: weekKey, project_id: null,
      task_name: '⬡ ' + cat, hours_json: JSON.stringify(hours),
      employee_id: empId, is_overhead: true, overhead_cat: cat,
    };
    const { error: saOhErr } = await sb.from('timesheet_entries').insert(saOhPayload);
    if (saOhErr) {
      console.error('[saveAndApprove] INSERT overhead-row failed:', { payload: saOhPayload, error: saOhErr });
      saFailed.push({ kind:'overhead', payload: saOhPayload, error: saOhErr });
    }
  }

  // Don't approve a broken timesheet — surface the errors and bail.
  if (saFailed.length > 0) {
    const first = saFailed[0];
    const code = first.error?.code || '';
    const msg  = first.error?.message || 'unknown error';
    toast('⚠ ' + saFailed.length + ' row(s) did NOT save — approval aborted · ' + code + ' ' + msg);
    return;
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

