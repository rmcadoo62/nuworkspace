
// ===== AUTH STATE =====
// ===== AUTH STATE =====
let currentUser = null;       // Supabase auth user
let currentEmployee = null;   // matching employees[] record
let proxyEmployee = null;  

function isManager() { return !!(currentEmployee && ['manager','Manager','owner','Owner','admin','Admin'].includes(currentEmployee.permissionLevel)); }

// Capability checker — uses role if assigned, falls back to permissionLevel
function can(capability) {
  if (!currentEmployee) return false;
  // If employee has a role assigned, check its capabilities
  if (currentEmployee.roleId && permissionRoles.length) {
    const role = permissionRoles.find(r => r.id === currentEmployee.roleId);
    if (role) return !!(role.capabilities[capability]);
  }
  // Fallback: map old permissionLevel to capabilities
  const mgr = currentEmployee.permissionLevel === 'manager';
  const fallbacks = {
    add_projects: mgr, delete_projects: false, add_tasks: mgr || true, edit_tasks: mgr || true,
    delete_tasks: mgr, mark_complete: mgr, mark_closing: mgr, mark_closed: false,
    view_dashboard: mgr || true, view_reports: mgr, view_audit_log: mgr, view_setup: mgr,
    manage_employees: mgr, manage_permissions: false, view_billing: mgr,
    edit_project_info: mgr, view_chatter: true, post_chatter: true,
    add_clients: mgr, delete_clients: mgr, add_contacts: mgr, delete_contacts: mgr,
  };
  return !!(fallbacks[capability]);
}
function canEdit()   { return isManager(); }   // employee being entered on behalf of (manager proxy)
let isApprover = false;

// Timesheet week statuses: { weekKey: { status, submittedBy, rejectionNote, id } }
let tsWeekStatuses = {};
let tsData = {};
let tsWeekOffset = 0; // 0 = current week

function getWeekKey(offset) {
  const d = getWeekMonday(offset);
  return d.toISOString().slice(0,10);
}

function getTsKey(offset) {
  // Returns empId|weekDate key for tsData store
  const emp = proxyEmployee || currentEmployee;
  const empId = emp ? emp.id : '__me__';
  return empId + '|' + getWeekKey(offset);
}

function getWeekMonday(offset) {
  // Returns the Sunday that starts the week (Sun–Sat)
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = -day; // back to Sunday
  const sun = new Date(now);
  sun.setDate(now.getDate() + diff + offset * 7);
  sun.setHours(0,0,0,0);
  return sun;
}

function getWeekDays(offset) {
  const sun = getWeekMonday(offset); // sun = week start (Sunday)
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmtDay(d) {
  return d.toLocaleDateString('en-US', {weekday:'short'});
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}

function isToday(d) {
  const t = new Date();
  return d.getDate()===t.getDate() && d.getMonth()===t.getMonth() && d.getFullYear()===t.getFullYear();
}

function ensureWeek(key) {
  if (!tsData[key]) tsData[key] = [];
  if (tsData[key].length === 0) addTsRow(key, false);
  // Ensure overhead sub-key exists
  const ohKey = 'oh_' + key;
  if (!tsData[ohKey]) tsData[ohKey] = {};
}

function addTsRow(key, rerender=true) {
  if (!tsData[key]) tsData[key] = [];
  tsData[key].push({projId: '', taskName:'', isOverhead:false, overheadCat:'', hours:{0:0,1:0,2:0,3:0,4:0,5:0,6:0}});
  if (rerender) renderTimesheet();
}

function deleteTsRow(key, idx) {
  tsData[key].splice(idx, 1);
  if (tsData[key].length === 0) tsData[key].push({projId: '', taskName:'', isOverhead:false, overheadCat:'', hours:{0:0,1:0,2:0,3:0,4:0,5:0,6:0}});
  renderTimesheet();
}

function setOhHours(key, cat, di, val) {
  const overheadKey = 'oh_' + key;
  if (!tsData[overheadKey]) tsData[overheadKey] = {};
  if (!tsData[overheadKey][cat]) tsData[overheadKey][cat] = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  tsData[overheadKey][cat][di] = parseFloat(val) || 0;
  updateTsTotals(key);
}

window.setTsHours = function setTsHours(key, rowIdx, dayIdx, val) {
  const n = parseFloat(val) || 0;
  tsData[key][rowIdx].hours[dayIdx] = n >= 0 ? n : 0;
  updateTsTotals(key);
}

function setTsProject(key, rowIdx, val) {
  const row = tsData[key][rowIdx];
  if (val === '__overhead__') {
    // Switch to overhead mode — re-render row
    row.isOverhead = true;
    row.projId = '';
    row.taskName = '';
    row.overheadCat = OVERHEAD_CATS[0];
    renderTimesheet();
    return;
  }
  row.isOverhead = false;
  row.projId = val;
  row.taskName = '';
  row.overheadCat = '';
  // Re-render just the task dropdown for this row
  const taskSel = document.getElementById('ts-task-'+key+'-'+rowIdx);
  if (taskSel) {
    const tasks = taskStore.filter(t => t.proj === val);
    taskSel.innerHTML = '<option value="">— select task —</option>' +
      tasks.map(t => {
        const statusLabels = {new:'New',inprogress:'In Progress',prohold:'Pro Hold',accthold:'Acct Hold',complete:'Complete',cancelled:'Cancelled',billed:'Billed'};
        const label = '#'+(t.taskNum||'?')+' ['+(statusLabels[t.status]||t.status)+'] '+(t.name.length>38?t.name.slice(0,38)+'…':t.name);
        return '<option value="'+t.name+'">'+label+'</option>';
      }).join('');
  }
}

function setTsTask(key, rowIdx, taskName) {
  tsData[key][rowIdx].taskName = taskName;
}

function setTsOverhead(key, rowIdx, cat) {
  tsData[key][rowIdx].overheadCat = cat;
}

function switchTsToProject(key, rowIdx) {
  const row = tsData[key][rowIdx];
  row.isOverhead = false;
  row.overheadCat = '';
  row.projId = '';
  row.taskName = '';
  renderTimesheet();
  // Focus the search input after render
  setTimeout(() => {
    const inp = document.getElementById('ts-proj-input-'+key+'-'+rowIdx);
    if (inp) { inp.value = ''; inp.focus(); }
  }, 50);
}

function getOhHoursForDay(key, di) {
  const ohData = tsData['oh_' + key] || {};
  return OVERHEAD_CATS.reduce((s, cat) => s + ((ohData[cat] || {})[di] || 0), 0);
}

function getOhGrand(key) {
  const ohData = tsData['oh_' + key] || {};
  return OVERHEAD_CATS.reduce((s, cat) => s + Object.values(ohData[cat] || {}).reduce((a,b)=>a+b,0), 0);
}

function updateTsTotals(key) {
  const rows = tsData[key] || [];
  const days = getWeekDays(tsWeekOffset);

  // Row totals (project rows)
  rows.forEach((row, ri) => {
    const rowTotal = Object.values(row.hours).reduce((a,b) => a + b, 0);
    const el = document.getElementById(`ts-rowtotal-${key}-${ri}`);
    if (el) el.textContent = rowTotal > 0 ? rowTotal.toFixed(1) + 'h' : '—';
  });

  // Overhead row totals
  const ohData = tsData['oh_' + key] || {};
  OVERHEAD_CATS.forEach(cat => {
    const ohRow = ohData[cat] || {};
    const ohRowTotal = Object.values(ohRow).reduce((a,b)=>a+b,0);
    const ohEl = document.getElementById('oh-rowtotal-' + key + '-' + cat.replace(/[^a-z]/gi,''));
    if (ohEl) ohEl.textContent = ohRowTotal > 0 ? ohRowTotal.toFixed(1) + 'h' : '—';
  });

  // Day totals (project + overhead) + grand total
  let grand = 0;
  days.forEach((d, di) => {
    const projDay = rows.reduce((sum, row) => sum + (row.hours[di] || 0), 0);
    const ohDay   = getOhHoursForDay(key, di);
    const dayTotal = projDay + ohDay;
    grand += dayTotal;
    // Update project-only subtotal
    const projEl = document.getElementById('proj-daytotal-' + key + '-' + di);
    if (projEl) projEl.textContent = projDay > 0 ? projDay.toFixed(1) + 'h' : '—';
    // Update combined daily total
    const el = document.getElementById('ts-daytotal-' + key + '-' + di);
    if (el) el.textContent = dayTotal > 0 ? dayTotal.toFixed(1) + 'h' : '—';
  });

  // Overhead day totals row
  days.forEach((d, di) => {
    const ohDay = getOhHoursForDay(key, di);
    const ohDayEl = document.getElementById('oh-daytotal-' + key + '-' + di);
    if (ohDayEl) ohDayEl.textContent = ohDay > 0 ? ohDay.toFixed(1) + 'h' : '—';
  });

  // Overhead grand total
  const ohGrand = getOhGrand(key);
  const ohGtEl = document.getElementById('oh-grandtotal-' + key);
  if (ohGtEl) ohGtEl.textContent = ohGrand > 0 ? ohGrand.toFixed(1) + 'h' : '—';

  const grandWithOh = grand;
  // Update project-only grand
  const projGtEl = document.getElementById('proj-grandtotal-' + key);
  if (projGtEl) {
    const projOnly = rows.reduce((s,r)=>s+Object.values(r.hours).reduce((a,b)=>a+b,0),0);
    projGtEl.textContent = projOnly.toFixed(1) + 'h';
  }
  // Update combined grand
  const gtEl = document.getElementById('ts-grandtotal-' + key);
  if (gtEl) gtEl.textContent = grandWithOh.toFixed(1) + 'h';

  // Update header badge
  const badge = document.getElementById('tsTotalBadge');
  if (badge) badge.textContent = grandWithOh.toFixed(1) + 'h this week';

  // Update summary cards
  updateTsSummary(key);
}

function updateTsSummary(key) {
  const rows = tsData[key] || [];
  const days = getWeekDays(tsWeekOffset);
  const projGrand = rows.reduce((s, r) => s + Object.values(r.hours).reduce((a,b)=>a+b,0), 0);
  const ohGrand   = getOhGrand(key);
  const grand     = projGrand + ohGrand;

  const today = new Date().getDay();
  const todayIdx = today === 0 ? 6 : today - 1;
  const projToday = rows.reduce((s, r) => s + (r.hours[todayIdx]||0), 0);
  const ohToday   = getOhHoursForDay(key, todayIdx);
  const todayHrs  = projToday + ohToday;

  const projsLogged = [...new Set(rows.filter(r => Object.values(r.hours).some(h=>h>0)).map(r=>r.projId))].length;

  const s = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  s('ts-sum-week',  grand.toFixed(1) + 'h');
  s('ts-sum-today', todayHrs.toFixed(1) + 'h');
  s('ts-sum-projs', projsLogged);
  s('ts-sum-avg',   days.length > 0 ? (grand / 5).toFixed(1) + 'h' : '0h');
}

function openTimesheetPanel(el) {
  if (currentEmployee && currentEmployee.isOwner) { toast('Timesheets are not tracked for owners'); return; }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  proxyEmployee = null; // always reset to own timesheet when opening
  document.getElementById('topbarName').textContent = 'Timesheet';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-timesheet').classList.add('active');
  renderTimesheet();
}

function navTsWeek(dir) {
  tsWeekOffset += dir;
  renderTimesheet();
}

function goTsToday() {
  tsWeekOffset = 0;
  renderTimesheet();
}

function renderTimesheet() {
  const key = getTsKey(tsWeekOffset);
  ensureWeek(key);
  const rows = tsData[key];
  const days = getWeekDays(tsWeekOffset);

  const sun = days[0];
  const sat = days[6];
  const weekLabel = `${fmtDate(sun)} – ${fmtDate(sat)}, ${sat.getFullYear()}`;

  // Build table rows
  const tableRows = rows.map((row, ri) => {
    const rowTotal = Object.values(row.hours).reduce((a,b)=>a+b,0);

    const cells = days.map((d, di) => {
      const val = row.hours[di] || 0;
      return '<td class="ts-cell"><input class="ts-input '+(val>0?'has-val':'')+'" type="number" min="0" max="24" step="0.5"'+
        ' value="'+(val>0?val:'')+'" placeholder="—"'+
        ' id="ts-inp-'+key+'-'+ri+'-'+di+'"'+
        ' oninput="this.classList.toggle(\'has-val\',!!this.value);setTsHours(\''+key+'\','+ri+','+di+',this.value)"'+
        (isWeekLocked(key) ? ' disabled' : '')+
        ' onfocus="this.select()" /></td>';
    }).join('');

    let labelCell;
    if (row.isOverhead) {
      // Overhead row
      labelCell = '<td class="ts-row-label">'+
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'+
        '<span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;'+
          'color:var(--purple);background:rgba(124,92,191,0.12);padding:2px 8px;border-radius:10px;white-space:nowrap">Overhead</span>'+
        '<select class="ts-task-select" style="flex:1;min-width:140px" id="ts-overhead-'+key+'-'+ri+'"'+
          ' onchange="setTsOverhead(\''+key+'\','+ri+',this.value)">'+
          OVERHEAD_CATS.map(c=>'<option value="'+c+'" '+(c===row.overheadCat?'selected':'')+'>'+c+'</option>').join('')+
        '</select>'+
        '<button style="background:transparent;border:none;color:var(--muted);font-size:10px;cursor:pointer;white-space:nowrap;padding:2px 4px;"'+
          ' onclick="switchTsToProject(\''+key+'\','+ri+')" title="Switch to project">&#x21C4; Project</button>'+
        '</div></td>';
    } else {
      const projTasks = taskStore.filter(t => t.proj === row.projId);
      const taskOpts = '<option value="">— select task —</option>' +
        projTasks.map(t => {
          const statusLabels = {new:'New',inprogress:'In Progress',prohold:'Pro Hold',accthold:'Acct Hold',complete:'Complete',cancelled:'Cancelled',billed:'Billed'};
          const label = '#'+(t.taskNum||'?')+' ['+(statusLabels[t.status]||t.status)+'] '+(t.name.length>38?t.name.slice(0,38)+'…':t.name);
          return '<option value="'+t.name+'" '+(t.name===row.taskName?'selected':'')+'>'+label+'</option>';
        }).join('');
      const selProj = projects.find(p => p.id === row.projId);
      const projDisplayName = selProj ? selProj.emoji+' '+selProj.name : '';
      labelCell = '<td class="ts-row-label">'+
        '<div class="ts-proj-picker" id="ts-picker-wrap-'+key+'-'+ri+'">'+
          '<input class="ts-proj-input" id="ts-proj-input-'+key+'-'+ri+'"'+
            ' value="'+projDisplayName.replace(/"/g,'&quot;')+'"'+
            ' placeholder="Search project…"'+
            ' autocomplete="off"'+
            ' onfocus="openTsProjDropdown(\''+key+'\','+ri+')"'+
            ' oninput="filterTsProjDropdown(\''+key+'\','+ri+',this.value)"'+
            ' onkeydown="tsProjKeydown(event,\''+key+'\','+ri+')" />'+
          '<div class="ts-proj-dropdown" id="ts-proj-dd-'+key+'-'+ri+'"></div>'+
        '</div>'+
        '<select class="ts-task-select" id="ts-task-'+key+'-'+ri+'"'+
          ' onchange="setTsTask(\''+key+'\','+ri+',this.value)">'+taskOpts+'</select>'+
        '</td>';
    }

    return '<tr>'+labelCell+cells+
      '<td class="ts-row-total" id="ts-rowtotal-'+key+'-'+ri+'">'+(rowTotal>0?rowTotal.toFixed(1)+'h':'—')+'</td>'+
      '<td style="padding:0 8px;background:var(--surface)">'+
        '<button class="ts-del-row" onclick="deleteTsRow(\''+key+'\','+ri+')" title="Remove row">&#x2715;</button>'+
      '</td></tr>';
  }).join('');

  // Day total row (project rows only)
  const dayTotals = days.map((d, di) => {
    const total = rows.reduce((s, r) => s + (r.hours[di]||0), 0);
    return `<td class="ts-day-total" id="proj-daytotal-${key}-${di}">${total>0?total.toFixed(1)+'h':'—'}</td>`;
  }).join('');

  const grand = rows.reduce((s,r)=>s+Object.values(r.hours).reduce((a,b)=>a+b,0),0);

  // Day header cells
  const dayHeaders = days.map((d,di) => `
    <th class="day-col ${isToday(d)?'today':''}">
      ${fmtDay(d)}<span class="day-num">${d.getDate()}</span>
    </th>`).join('');

  // Build proxy employee bar (for approvers entering on behalf)
  // Paper employees: those flagged isPaperTs, OR those whose approverId matches current employee
  const paperEmps = employees.filter(e => {
    if (!currentEmployee) return false;
    if (e.id === currentEmployee.id) return false;
    return e.isPaperTs === true || e.isPaperTs === 1 || e.is_paper_ts === true;
  });
  // Show proxy bar if current user is approver/manager OR if there are paper employees assigned to them
  const showProxy = (isApprover || paperEmps.length > 0) && paperEmps.length > 0;
  const proxyBar = showProxy ?
    '<div class="ts-proxy-bar">'+
      '<span class="ts-proxy-label">&#x1F4CB; Entering timesheet for:</span>'+
      '<select class="ts-proxy-select" onchange="setTsProxy(this.value)">'+
        '<option value="">— My own timesheet —</option>'+
        paperEmps.map(e => '<option value="'+e.id+'" '+(proxyEmployee && proxyEmployee.id===e.id?'selected':'')+'>'+e.name+'</option>').join('')+
      '</select>'+
      (proxyEmployee ? '<span class="ts-proxy-badge">&#x270F; Entering for '+proxyEmployee.name+'</span>' : '')+
    '</div>' : '';

  document.getElementById('tsWrap').innerHTML = proxyBar + `
    <div class="ts-header">
      <div class="ts-title">${proxyEmployee ? proxyEmployee.name + "'s Timesheet" : 'Timesheet'}</div>
      <div class="ts-week-nav">
        <button class="ts-week-btn" onclick="navTsWeek(-1)">&#x2039;</button>
        <div class="ts-week-label">${weekLabel}</div>
        <button class="ts-week-btn" onclick="navTsWeek(1)">&#x203A;</button>
      </div>
      <button class="ts-today-btn" onclick="goTsToday()">Today</button>
      <div class="ts-total-badge" id="tsTotalBadge">${grand.toFixed(1)}h this week</div>
    </div>
    ${(function(){
      var locked = isWeekLocked(key);
      if (!locked) return '<div style="margin-bottom:10px"><button class="ts-add-row-btn" onclick="addTsRow(\'' + key + '\')">+ Add Row</button></div>';
      return '';
    })()}
        <div class="ts-summary">
      <div class="ts-sum-card">
        <div class="ts-sum-label">This Week</div>
        <div class="ts-sum-val" id="ts-sum-week">${grand.toFixed(1)}h</div>
        <div class="ts-sum-sub">of 40h target</div>
      </div>
      <div class="ts-sum-card">
        <div class="ts-sum-label">Today</div>
        <div class="ts-sum-val" id="ts-sum-today">0h</div>
        <div class="ts-sum-sub">logged today</div>
      </div>
      <div class="ts-sum-card">
        <div class="ts-sum-label">Projects</div>
        <div class="ts-sum-val" id="ts-sum-projs">0</div>
        <div class="ts-sum-sub">with logged time</div>
      </div>
      <div class="ts-sum-card">
        <div class="ts-sum-label">Daily Avg</div>
        <div class="ts-sum-val" id="ts-sum-avg">0h</div>
        <div class="ts-sum-sub">Mon – Fri</div>
      </div>
    </div>

  `; // end summary/header template

  // Build unified single table (projects + overhead perfectly aligned)
  const tsWrap = document.getElementById('tsWrap');
  if (tsWrap) {
    const overheadKey = 'oh_' + key;
    if (!tsData[overheadKey]) tsData[overheadKey] = {};
    OVERHEAD_CATS.forEach(cat => {
      if (!tsData[overheadKey][cat]) tsData[overheadKey][cat] = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    });
    const locked = isWeekLocked(key);

    let html = '<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">';
    html += '<table class="ts-grid" style="min-width:820px">';

    // Single shared header row
    html += '<thead><tr>';
    html += '<th style="text-align:left">Project / Task</th>';
    days.forEach((d,di) => {
      html += '<th class="day-col' + (isToday(d)?' today':'') + '">' + fmtDay(d) + '<span class="day-num">' + d.getDate() + '</span></th>';
    });
    html += '<th style="text-align:center;border-left:1px solid var(--border)">Total</th>';
    html += '<th style="width:32px"></th></tr></thead><tbody>';

    // Project rows
    html += tableRows;

    // Project subtotal row
    html += '<tr class="ts-footer-row"><td class="ts-footer-label" style="color:var(--muted);font-size:10.5px">Project Total</td>';
    days.forEach((d,di) => {
      const total = (tsData[key]||[]).reduce((s,r)=>s+(r.hours[di]||0),0);
      html += '<td class="ts-day-total" id="proj-daytotal-' + key + '-' + di + '">' + (total>0?total.toFixed(1)+'h':'—') + '</td>';
    });
    const projGrand = (tsData[key]||[]).reduce((s,r)=>s+Object.values(r.hours).reduce((a,b)=>a+b,0),0);
    html += '<td class="ts-grand-total" id="proj-grandtotal-' + key + '" style="font-size:13px">' + (projGrand>0?projGrand.toFixed(1)+'h':'—') + '</td>';
    html += '<td style="background:var(--surface);border-top:2px solid var(--border)"></td></tr>';

    // Overhead section divider
    html += '<tr><td colspan="9" style="padding:6px 14px;background:rgba(124,92,191,0.08);border-top:2px solid rgba(124,92,191,0.25);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--purple)">⬡ Overhead</td></tr>';

    // Overhead rows
    OVERHEAD_CATS.forEach(cat => {
      const ohHours = tsData[overheadKey][cat];
      const ohTotal = Object.values(ohHours).reduce((a,b)=>a+b,0);
      const escapedCat = cat.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html += '<tr><td class="ts-row-label"><span style="font-size:13px">' + cat + '</span></td>';
      days.forEach((d,di) => {
        const val = ohHours[di] || 0;
        html += '<td class="ts-cell"><input class="ts-input ' + (val>0?'has-val':'') + '" type="number" min="0" max="24" step="0.5"' +
          ' value="' + (val>0?val:'') + '" placeholder="—"' +
          ' oninput="this.classList.toggle(\'has-val\',!!this.value);setOhHours(\'' + key + '\',\'' + escapedCat + '\',' + di + ',this.value)"' +
          (locked ? ' disabled' : '') + ' onfocus="this.select()" /></td>';
      });
      const ohRowId = 'oh-rowtotal-' + key + '-' + cat.replace(/[^a-z]/gi,'');
      html += '<td class="ts-row-total" id="' + ohRowId + '">' + (ohTotal>0?ohTotal.toFixed(1)+'h':'—') + '</td>';
      html += '<td style="background:var(--surface)"></td></tr>';
    });

    // OH subtotal row
    html += '<tr class="ts-footer-row"><td class="ts-footer-label" style="color:var(--muted);font-size:10.5px">OH Total</td>';
    days.forEach((d,di) => {
      const total = OVERHEAD_CATS.reduce((s,cat)=>s+(tsData[overheadKey][cat][di]||0),0);
      html += '<td class="ts-day-total" id="oh-daytotal-' + key + '-' + di + '">' + (total>0?total.toFixed(1)+'h':'—') + '</td>';
    });
    const ohGrand = OVERHEAD_CATS.reduce((s,cat)=>s+Object.values(tsData[overheadKey][cat]).reduce((a,b)=>a+b,0),0);
    html += '<td class="ts-grand-total" id="oh-grandtotal-' + key + '" style="font-size:13px">' + (ohGrand>0?ohGrand.toFixed(1)+'h':'—') + '</td>';
    html += '<td style="background:var(--surface);border-top:2px solid var(--border)"></td></tr>';

    // Daily Total row (amber — project + overhead)
    const fullGrand = projGrand + ohGrand;
    html += '<tr class="ts-footer-row" style="background:var(--amber-glow)">';
    html += '<td class="ts-footer-label" style="color:var(--amber);border-top:2px solid var(--amber-dim)">Daily Total</td>';
    days.forEach((d,di) => {
      const projDay = (tsData[key]||[]).reduce((s,r)=>s+(r.hours[di]||0),0);
      const ohDay   = OVERHEAD_CATS.reduce((s,cat)=>s+((tsData[overheadKey][cat]||{})[di]||0),0);
      const total   = projDay + ohDay;
      html += '<td class="ts-day-total" id="ts-daytotal-' + key + '-' + di + '" style="color:var(--amber);font-weight:700;border-top:2px solid var(--amber-dim)">' + (total>0?total.toFixed(1)+'h':'—') + '</td>';
    });
    html += '<td class="ts-grand-total" id="ts-grandtotal-' + key + '" style="color:var(--amber);border-top:2px solid var(--amber-dim)">' + fullGrand.toFixed(1) + 'h</td>';
    html += '<td style="background:var(--amber-glow);border-top:2px solid var(--amber-dim)"></td></tr>';

    html += '</tbody></table></div>';

    // Status indicator — fresh lookup here so it reflects latest data
    const ws = getWeekStatusObj(key);
    let statusHTML = '';
    if (!ws || !ws.status || ws.status === 'open') {
      statusHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);font-size:12px;color:var(--muted)">📝 Open</span>';
    } else if (ws.status === 'submitted') {
      statusHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(91,156,246,.3);background:rgba(91,156,246,.08);font-size:12px;color:var(--blue)">⏳ Submitted — awaiting approval</span>';
    } else if (ws.status === 'approved') {
      statusHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(76,175,125,.3);background:rgba(76,175,125,.08);font-size:12px;color:#4caf7d">✓ Approved & Locked</span>';
    } else if (ws.status === 'rejected') {
      statusHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(224,92,92,.3);background:rgba(224,92,92,.08);font-size:12px;color:#e05c5c">✗ Rejected' + (ws.rejectionNote ? ': ' + ws.rejectionNote : '') + '</span>';
    }

    const submitBtn = (currentUser && !locked)
      ? '<button class="ts-add-row-btn" style="background:var(--blue)" onclick="submitTimesheet()">Submit for Approval</button>'
      : '';

    const badgeId = 'ts-status-badge-' + key.replace(/[^a-z0-9]/gi,'-');
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-bottom:40px">';
    html += '<div id="' + badgeId + '">' + statusHTML + '</div>';
    html += '<div>' + submitBtn + '</div>';
    html += '</div>';

    tsWrap.insertAdjacentHTML('beforeend', html);
  }

  updateTsSummary(key);
}

function updateTsStatusBadge(key) {
  const ws = getWeekStatusObj(key);
  const badgeEl = document.getElementById('ts-status-badge-' + key.replace(/[^a-z0-9]/gi,'-'));
  if (!badgeEl) { renderTimesheet(); return; }
  if (!ws || !ws.status || ws.status === 'open') {
    badgeEl.innerHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);font-size:12px;color:var(--muted)">📝 Open</span>';
  } else if (ws.status === 'submitted') {
    badgeEl.innerHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(91,156,246,.3);background:rgba(91,156,246,.08);font-size:12px;color:var(--blue)">⏳ Submitted — awaiting approval</span>';
  } else if (ws.status === 'approved') {
    badgeEl.innerHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(76,175,125,.3);background:rgba(76,175,125,.08);font-size:12px;color:#4caf7d">✓ Approved &amp; Locked</span>';
  } else if (ws.status === 'rejected') {
    badgeEl.innerHTML = '<span style="padding:6px 12px;border-radius:6px;border:1px solid rgba(224,92,92,.3);background:rgba(224,92,92,.08);font-size:12px;color:#e05c5c">✗ Rejected' + (ws.rejectionNote ? ': ' + ws.rejectionNote : '') + '</span>';
  }
}



// ===== AUTH FUNCTIONS =====
// ===== AUTH FUNCTIONS =====
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const btn   = document.getElementById('loginBtn');
  const err   = document.getElementById('loginError');
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  btn.disabled = true; btn.textContent = 'Signing in…';
  err.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) {
    err.textContent = error.message || 'Invalid email or password.';
    btn.disabled = false; btn.textContent = 'Sign In';
    return;
  }
  await afterLogin(data.user);
}

function applyPermissions() {
  if (!currentEmployee) return;
  const manager = isManager() || can('view_setup');

  // Dashboard nav
  const navDash = document.getElementById('navDashboard');
  if (navDash) navDash.style.display = can('view_dashboard') ? 'flex' : 'none';

  // Reports nav
  const navRep = document.getElementById('navReports');
  if (navRep) navRep.style.display = can('view_reports') ? 'flex' : 'none';

  // Setup nav — show if user has any admin capability
  const hasAnySetup = can('view_setup') || can('view_audit_log') || can('manage_employees') || can('manage_permissions');
  const navSetup = document.getElementById('navSetup');
  if (navSetup) navSetup.style.display = hasAnySetup ? 'flex' : 'none';
  // Audit log nav (no longer in sidebar, but keep for compat)
  const navAudit = document.getElementById('navAuditLog');
  if (navAudit) navAudit.style.display = 'none'; // always hidden, accessed via Setup

  // Activity tab on project page (managers only)
  const actTab = document.getElementById('projActivityTab');
  if (actTab) actTab.style.display = can('view_audit_log') ? '' : 'none';

  // Add Project buttons
  const ap1 = document.getElementById('addProjBtn1');
  const ap2 = document.getElementById('addProjBtn2');
  if (ap1) ap1.style.display = can('add_projects') ? '' : 'none';
  if (ap2) ap2.style.display = can('add_projects') ? '' : 'none';

  // Add Task button (standalone)
  const at1 = document.getElementById('addTaskBtn1');
  if (at1) at1.style.display = can('add_tasks') ? '' : 'none';

  // Project table row actions (delete/edit) - hide for non-managers
  document.querySelectorAll('.proj-row-actions').forEach(el => {
    el.style.display = can('add_projects') ? '' : 'none';
  });

  // Task row action buttons
  document.querySelectorAll('.itt-actions').forEach(el => {
    el.style.display = can('add_tasks') ? '' : 'none';
  });

  applySchedAccessToNav();
}

function applySchedAccessToNav() {
  if (!window.loadSchedSettings) return; // scheduler not loaded yet
  window.loadSchedSettings();
  const navItem = document.getElementById('navScheduler');
  if (!navItem) return;
  const emp = typeof currentEmployee !== 'undefined' ? currentEmployee : null;
  if (emp && !window.empHasSchedAccess(emp.id)) {
    navItem.style.display = 'none';
  } else {
    navItem.style.display = '';
  }
}

function updateSchedColor(key, value) {
  window.loadSchedSettings();
  window.schedSettings.colors[key] = value;
  window.saveSchedSettings();
  renderSchedSettingsSection();
}

function resetSchedColor(key) {
  window.loadSchedSettings();
  delete window.schedSettings.colors[key];
  window.saveSchedSettings();
  renderSchedSettingsSection();
}

function toggleSchedAccess(empId, hasAccess) {
  window.loadSchedSettings();
  window.schedSettings.access[empId] = hasAccess;
  window.saveSchedSettings();
  applySchedAccessToNav();
  renderSchedSettingsSection();
}

async function afterLogin(user) {
  currentUser = user;
  // Match to employee record by email
  currentEmployee = employees.find(e => e.email && e.email.toLowerCase() === user.email.toLowerCase()) || null;
  isApprover = currentEmployee ? (currentEmployee.role === 'approver' || currentEmployee.role === 'manager' || currentEmployee.isApprover === true || currentEmployee.isApprover === 1) : false;

  // Update sidebar badge
  const badge = document.getElementById('sidebarUserBadge');
  const av    = document.getElementById('userBadgeAv');
  const name  = document.getElementById('userBadgeName');
  const role  = document.getElementById('userBadgeRole');
  if (badge) badge.style.display = 'block';
  if (currentEmployee) {
    if (av)   { av.textContent = currentEmployee.initials; av.style.background = currentEmployee.color; }
    if (name) name.textContent = currentEmployee.name.split(" ")[0];
    if (role) role.textContent = isApprover ? 'Approver' : 'Employee';
  } else {
    if (av)   { av.textContent = user.email[0].toUpperCase(); }
    if (name) name.textContent = user.email.split("@")[0];
    if (role) role.textContent = 'User';
  }

  // Show approvals nav for approvers
  const navApp = document.getElementById('navApprovals');
  if (navApp) navApp.style.display = isApprover ? 'flex' : 'none';
  // Hide timesheet nav for owners
  const navTs = document.getElementById('navTimesheetItem');
  if (navTs && currentEmployee && currentEmployee.isOwner) navTs.style.display = 'none';

  // Apply permission-based UI
  applyPermissions();

  // Hide login, show app
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';

  // Load timesheet statuses
  await loadTsStatuses();
  bootApp();
  updateApprovalsBadge();
  setupRealtime();
}

async function doLogout() {
  await sb.auth.signOut();
  currentUser = null; currentEmployee = null; isApprover = false;
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('sidebarUserBadge').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = 'Sign In';
}

// ===== SUPABASE PATCHES =====
// Patch timesheet hour changes to persist
const _origSetTsHours = typeof setTsHours !== "undefined" ? setTsHours : ()=>{};
window.setTsHours = async function(key, rowIdx, dayIdx, val) {
  _origSetTsHours(key, rowIdx, dayIdx, val);
  const row = tsData[key]?.[rowIdx];
  if (!row) return;
  if (row._id) {
    await dbUpdate('timesheet_entries', row._id, { hours_json: JSON.stringify(row.hours) });
  } else {
    const saved = await dbInsert('timesheet_entries', {
      week_start: key, project_id: row.projId, task_name: row.taskName,
      hours_json: JSON.stringify(row.hours),
    });
    if (saved) row._id = saved.id;
  }
};


// ===== REALTIME SUBSCRIPTIONS =====
// ===== REALTIME SUBSCRIPTIONS =====
function setupRealtime() {
  if (!sb) return;

  // Helper: re-render whichever panel is currently visible
  function refreshCurrentView() {
    const active = document.querySelector('.view-panel.active');
    if (!active) return;
    const id = active.id;
    if (id === 'panel-dashboard') renderDashboard();
    else if (id === 'panel-projects') { document.querySelector('#navProjects') && openProjectsTable(document.getElementById('navProjects')); }
    else if (id === 'panel-project') {
      if (activeProjectId) {
        renderProjSummary(activeProjectId);
        const activeSub = document.querySelector('.proj-sub.active');
        if (activeSub) {
          const sid = activeSub.id;
          if (sid === 'sub-info') renderInfoSheet(activeProjectId);
          else if (sid === 'sub-expenses') renderExpensesPanel(activeProjectId);
        }
      }
    }
    else if (id === 'panel-timesheet') renderTimesheet();
  }

  // ── PROJECTS ──────────────────────────────────────────────
  sb.channel('rt-projects')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projects' }, payload => {
      const r = payload.new;
      if (!projects.find(p => p.id === r.id)) {
        projects.push({ id: r.id, name: r.name, color: r.color, emoji: r.emoji||'📁', desc: r.description||'' });
        toast('📁 New project: ' + r.name);
        refreshCurrentView();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, payload => {
      const r = payload.new;
      const p = projects.find(x => x.id === r.id);
      if (p) { p.name = r.name; p.color = r.color; p.emoji = r.emoji||p.emoji; p.desc = r.description||''; }
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects' }, payload => {
      projects = projects.filter(p => p.id !== payload.old.id);
      refreshCurrentView();
    })
    .subscribe();

  // ── PROJECT_INFO ───────────────────────────────────────────
  sb.channel('rt-project-info')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_info' }, payload => {
      const r = payload.new || payload.old;
      if (!r) return;
      if (payload.eventType !== 'DELETE') {
        projectInfo[r.project_id] = {
          pm: r.pm||'', po: r.po_number||'', contract: r.contract_amount||'',
          phase: r.phase||'Waiting on TP Approval', status: r.status||'active',
          startDate: r.start_date||'', endDate: r.end_date||'', tentativeTestDate: r.tentative_test_date||'',
          client: r.client||'', clientContact: r.client_contact||'',
          clientEmail: r.client_email||'', clientPhone: r.client_phone||'',
          clientId: r.client_id||null, contactId: r.contact_id||null,
          billingType: r.billing_type||'Fixed Fee', invoiced: r.invoiced||'',
          remaining: r.remaining||'', notes: r.notes||'', desc: r.description||'',
          dcas: r.dcas||'', customerWitness: r.customer_witness||'',
          tpApproval: r.tp_approval||'', dpas: r.dpas||'', noforn: r.noforn||'',
          testDesc: r.test_description||'', testArticleDesc: r.test_article_description||'',
          quoteNumber: r.quote_number||'', creditHold: r.credit_hold||false,
          needUpdatedPo: r.need_updated_po||false, testcompleteDate: r.testcomplete_date||'',
        };
      } else {
        delete projectInfo[r.project_id];
      }
      refreshCurrentView();
    })
    .subscribe();

  // ── TASKS ──────────────────────────────────────────────────
  sb.channel('rt-tasks')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, payload => {
      const r = payload.new;
      if (taskStore.find(t => t._id === r.id)) return;
      taskStore.unshift({
        _id: r.id, taskNum: r.task_num||0, name: r.name, assign: r.assignee||'',
        due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
        due_raw: r.due_date||'', overdue: false, done: r.done||false,
        proj: r.project_id||'', status: r.status||'new', priority: r.priority||'medium',
        section: r.section||'sprint', salesCat: r.sales_category||'',
        fixedPrice: r.fixed_price ? parseFloat(r.fixed_price) : 0,
        budgetHours: r.budget_hours ? parseFloat(r.budget_hours) : 0,
        taskStartDate: r.task_start_date||'', completedDate: r.completed_date||'',
        billedDate: r.billed_date||'', quoteNum: r.quote_number||'',
        poNumber: r.po_number||'', peachtreeInv: r.peachtree_inv||'',
        createdAt: r.created_at ? r.created_at.split('T')[0] : '',
        revenueType: r.revenue_type||'fixed',
      });
      const proj = projects.find(p => p.id === r.project_id);
      toast('✅ New task: ' + r.name + (proj ? ' on ' + proj.name : ''));
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, payload => {
      const r = payload.new;
      const t = taskStore.find(x => x._id === r.id);
      const wasDone = t ? t.done : false;
      if (t) {
        t.name = r.name; t.assign = r.assignee||''; t.done = r.done||false;
        t.status = r.status||t.status; t.priority = r.priority||t.priority;
        t.due_raw = r.due_date||'';
        t.due = r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        t.section = r.section||t.section; t.fixedPrice = r.fixed_price ? parseFloat(r.fixed_price) : t.fixedPrice;
        t.completedDate = r.completed_date||''; t.billedDate = r.billed_date||'';
      }
      if (!wasDone && r.done) toast('✓ Task completed: ' + r.name);
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, payload => {
      taskStore = taskStore.filter(t => t._id !== payload.old.id);
      refreshCurrentView();
    })
    .subscribe();

  // ── SCHEDULE_BLOCKS ────────────────────────────────────────
  sb.channel('rt-schedule-blocks')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'schedule_blocks' }, payload => {
      const blk = schedRowToBlock(payload.new);
      if (!schedBlocks.find(b => b.id === blk.id)) {
        schedBlocks.push(blk);
        _schedRerender();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedule_blocks' }, payload => {
      const blk = schedRowToBlock(payload.new);
      const idx = schedBlocks.findIndex(b => b.id === blk.id);
      if (idx >= 0) schedBlocks[idx] = blk; else schedBlocks.push(blk);
      _schedRerender();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'schedule_blocks' }, payload => {
      schedBlocks = schedBlocks.filter(b => b.id !== payload.old.id);
      _schedRerender();
    })
    .subscribe();

  console.log('✓ Realtime subscriptions active (projects, project_info, tasks, schedule_blocks)');
}

// Re-render the scheduler if it's currently visible
function _schedRerender() {
  const panel = document.getElementById('panel-scheduler');
  if (!panel?.classList.contains('active')) return;
  if (typeof schedView !== 'undefined' && schedView === 'calendar') {
    if (typeof renderSchedCalendar === 'function') renderSchedCalendar();
  } else {
    if (typeof renderSched === 'function') renderSched();
  }
}
