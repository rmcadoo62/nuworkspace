// ============================================================================
// My Team — supervisor surface (Phase 2: performance reviews)
// ----------------------------------------------------------------------------
// Shows the people whose Supervisor/Approver (employees.approver_id) points at
// the current user, and for each report their performance reviews. Authoring,
// editing, and "Submit to HR" all run through the existing review modal
// (openReviewModal); this file owns only the surface. Disciplinary actions and
// the time-off panel arrive in a later phase.
//
// Access is gated two ways: the nav item is shown only for someone with the
// supervise_team capability who has reports (see auth.js), and the database RLS
// policies scope every read/write to the supervisor's own reports.
// ============================================================================

let _myTeamSelectedId = null;
let _myTeamReviews    = {}; // empId -> reviews[]
let _myTeamDiscipline = {}; // empId -> disciplinary actions[]
let _myTeamHrTab      = 'reviews'; // 'reviews' | 'discipline' — which secondary tab is showing

// Timesheet and Time Off are the two things a supervisor actually needs to
// check regularly, so they render as always-visible primary sections.
// Performance Reviews and Disciplinary Actions are used far less often, so
// they're tucked behind a small tab bar instead of always taking up space.
function _mtSwitchHrTab(tab) {
  _myTeamHrTab = tab;
  const revPane  = document.getElementById('mtHrPane-reviews');
  const discPane = document.getElementById('mtHrPane-discipline');
  if (revPane)  revPane.style.display  = tab === 'reviews'    ? '' : 'none';
  if (discPane) discPane.style.display = tab === 'discipline' ? '' : 'none';
  document.getElementById('mtHrTab-reviews')?.classList.toggle('active-tab', tab === 'reviews');
  document.getElementById('mtHrTab-discipline')?.classList.toggle('active-tab', tab === 'discipline');
}

// Small tab-bar styling injected once (mirrors the pattern the Approvals
// panel already uses for its own tab bar) since there's no dedicated
// myteam.css class for this yet.
function _injectMtHrTabStylesOnce() {
  if (document.getElementById('mtHrTabStyles')) return;
  const style = document.createElement('style');
  style.id = 'mtHrTabStyles';
  style.textContent = `
    .mt-hr-tab-bar { display:flex; gap:2px; border-bottom:1px solid var(--border); }
    .mt-hr-tab {
      background:none; border:none; border-bottom:2px solid transparent;
      padding:8px 16px; font-size:13px; font-weight:500; cursor:pointer;
      color:var(--muted); font-family:'DM Sans',sans-serif;
      margin-bottom:-1px; border-radius:6px 6px 0 0; transition:all .15s;
    }
    .mt-hr-tab:hover { color:var(--text); background:var(--surface2); }
    .mt-hr-tab.active-tab { color:var(--amber); border-bottom-color:var(--amber); }
  `;
  document.head.appendChild(style);
}

// Active employees whose approver is the current user, sorted by last name.
function myTeamReports() {
  if (!currentEmployee) return [];
  return employees
    .filter(e => e.isActive !== false && e.approverId && e.approverId === currentEmployee.id)
    .sort((a, b) => {
      const la = (a.name || '').trim().split(' ').slice(-1)[0].toLowerCase();
      const lb = (b.name || '').trim().split(' ').slice(-1)[0].toLowerCase();
      return la.localeCompare(lb);
    });
}

function _mtInitials(e) {
  if (e.initials) return e.initials;
  return (e.name || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}
function _mtEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Show/hide the nav item (idempotent; auth.js sets it authoritatively on login
// and View-As, this keeps it correct after any data refresh).
function updateMyTeamNav() {
  const nav = document.getElementById('navMyTeam');
  if (!nav) return;
  const show = (typeof can === 'function' && can('supervise_team')) && myTeamReports().length > 0;
  nav.style.display = show ? '' : 'none';
  if (!show) {
    const panel = document.getElementById('panel-myteam');
    if (panel && panel.classList.contains('active')) {
      const home = document.getElementById('navHome');
      if (home) home.click();
    }
  }
}

function openMyTeamPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'My Team';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-myteam');
  if (panel) panel.classList.add('active');
  renderMyTeamPanel();
}

function renderMyTeamPanel() {
  const wrap = document.getElementById('myTeamWrap');
  if (!wrap) return;
  const reports = myTeamReports();
  if (!reports.length) {
    wrap.innerHTML = `<div class="mt-empty">You don't have any direct reports yet. An admin can assign you on an employee's record using the <b>Supervisor / Approver</b> field.</div>`;
    return;
  }
  if (!_myTeamSelectedId || !reports.some(r => r.id === _myTeamSelectedId)) {
    _myTeamSelectedId = reports[0].id;
  }
  wrap.innerHTML = `
    <div class="mt-header">
      <div class="mt-header-title">&#x1F465; My Team</div>
      <div class="mt-header-sub">Your direct reports only</div>
    </div>
    <div class="mt-layout">
      <div class="mt-list">${reports.map(_renderMtReportRow).join('')}</div>
      <div class="mt-detail" id="mtDetail"></div>
    </div>`;
  _renderMtDetail(_myTeamSelectedId);
}

function _renderMtReportRow(e) {
  const sel = e.id === _myTeamSelectedId ? ' active' : '';
  return `
    <div class="mt-report${sel}" onclick="selectMyTeamReport('${e.id}')">
      <div class="mt-avatar" style="background:${e.color || '#888'}">${_mtEsc(_mtInitials(e))}</div>
      <div class="mt-report-meta">
        <div class="mt-report-name">${_mtEsc(e.name)}</div>
        <div class="mt-report-role">${_mtEsc(e.role || '')}</div>
      </div>
    </div>`;
}

function selectMyTeamReport(empId) {
  if (empId === _myTeamSelectedId) return;
  _myTeamSelectedId = empId;
  document.querySelectorAll('.mt-report').forEach(n => n.classList.remove('active'));
  const reports = myTeamReports();
  const idx = reports.findIndex(r => r.id === empId);
  const rows = document.querySelectorAll('.mt-report');
  if (idx > -1 && rows[idx]) rows[idx].classList.add('active');
  _renderMtDetail(empId);
}

async function _renderMtDetail(empId) {
  const host = document.getElementById('mtDetail');
  if (!host) return;
  const emp = employees.find(e => e.id === empId);
  if (!emp) { host.innerHTML = ''; return; }

  _injectMtHrTabStylesOnce();
  const activeHr = _myTeamHrTab || 'reviews';

  host.innerHTML = `
    <div class="mt-detail-head">
      <div class="mt-avatar mt-avatar-lg" style="background:${emp.color || '#888'}">${_mtEsc(_mtInitials(emp))}</div>
      <div>
        <div class="mt-detail-name">${_mtEsc(emp.name)}</div>
        <div class="mt-detail-role">${_mtEsc(emp.role || '')}${emp.dept ? ' &middot; ' + _mtEsc(emp.dept) : ''}</div>
      </div>
    </div>

    <!-- PRIMARY: these two are what a supervisor actually checks day to day -->
    <div class="mt-section-head">
      <div class="mt-section-title">&#x23F1;&#xFE0F; Timesheet &mdash; This Week <span style="font-size:11px;font-weight:400;color:var(--muted)">&middot; view only</span></div>
    </div>
    <div id="mtTimesheet"><div class="mt-loading">Loading&hellip;</div></div>

    <div class="mt-section-head" style="margin-top:26px">
      <div class="mt-section-title">&#x1F4C5; Time Off <span style="font-size:11px;font-weight:400;color:var(--muted)">&middot; view only</span></div>
    </div>
    <div id="mtTimeOff"></div>

    <!-- SECONDARY: used far less often, tucked behind tabs instead of always expanded -->
    <div style="margin-top:32px;border-top:1px solid var(--border);padding-top:18px">
      <div class="mt-hr-tab-bar">
        <button id="mtHrTab-reviews" class="mt-hr-tab${activeHr === 'reviews' ? ' active-tab' : ''}" onclick="_mtSwitchHrTab('reviews')">&#x1F4DD; Performance Reviews</button>
        <button id="mtHrTab-discipline" class="mt-hr-tab${activeHr === 'discipline' ? ' active-tab' : ''}" onclick="_mtSwitchHrTab('discipline')">&#x26A0;&#xFE0F; Disciplinary Actions</button>
      </div>

      <div id="mtHrPane-reviews" style="display:${activeHr === 'reviews' ? '' : 'none'};padding-top:16px">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <div class="mt-picker-wrap" id="mtRevPickerWrap">
            <button class="mt-new-btn" onclick="_mtToggleRevPicker(event)">+ New Review <span style="font-size:9px;opacity:.65">&#x25BC;</span></button>
            <div class="mt-picker" id="mtRevPicker">
              <button class="rev-picker-opt" onclick="_mtCloseRevPicker();mtOpenReview('${empId}',null,'staff')">&#x1F4CB; Staff Review<span class="rev-picker-formnum">NUI #28</span></button>
              <button class="rev-picker-opt" onclick="_mtCloseRevPicker();mtOpenReview('${empId}',null,'supervisor')">&#x1F9ED; Supervisor Review<span class="rev-picker-formnum">NUI #29</span></button>
            </div>
          </div>
        </div>
        <div id="mtReviewsList"><div class="mt-loading">Loading&hellip;</div></div>
      </div>

      <div id="mtHrPane-discipline" style="display:${activeHr === 'discipline' ? '' : 'none'};padding-top:16px">
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button class="mt-new-btn" style="background:var(--red);color:#fff" onclick="mtOpenDiscipline('${empId}',null)">+ New Action</button>
        </div>
        <div id="mtDiscList"><div class="mt-loading">Loading&hellip;</div></div>
      </div>
    </div>`;

  // Reviews
  if (_myTeamReviews[empId]) { _renderMtReviews(empId); }
  else {
    try {
      const { data, error } = await sb.from('performance_reviews').select('*').eq('employee_id', empId).order('review_date', { ascending: false });
      if (error) throw error;
      _myTeamReviews[empId] = data || [];
      _renderMtReviews(empId);
    } catch (err) {
      const list = document.getElementById('mtReviewsList');
      if (list) list.innerHTML = `<div class="mt-error">Could not load reviews: ${_mtEsc(err.message || err)}</div>`;
    }
  }

  // Disciplinary actions
  if (_myTeamDiscipline[empId]) { _renderMtDiscipline(empId); }
  else {
    try {
      const { data, error } = await sb.from('disciplinary_actions').select('*').eq('employee_id', empId).order('incident_date', { ascending: false });
      if (error) throw error;
      _myTeamDiscipline[empId] = data || [];
      _renderMtDiscipline(empId);
    } catch (err) {
      const list = document.getElementById('mtDiscList');
      if (list) list.innerHTML = `<div class="mt-error">Could not load disciplinary actions: ${_mtEsc(err.message || err)}</div>`;
    }
  }

  // Time off (read-only, computed the same way the employee card does)
  _renderMtTimeOff(empId);

  // Timesheet — current week, read-only. Always fetched fresh (not cached
  // like reviews/discipline) since this is meant to reflect hours as they're
  // being entered right now, not a snapshot from earlier in the session.
  _renderMtTimesheet(empId);
}

// Timesheet — This Week (read-only audit view). Scoped to the supervisor's
// own reports via RLS the same as everything else on this surface. Pulls
// directly from timesheet_entries/timesheet_weeks rather than any in-memory
// cache from timesheet.js, since this panel can be opened without ever having
// visited the Timesheet or Approvals panels this session.
//
// Renders as a real project/task-by-day grid — the same shape as the actual
// Timesheet page — rather than a condensed summary, so a supervisor can see
// exactly what job numbers hours were charged to, not just a total.
async function _renderMtTimesheet(empId) {
  const host = document.getElementById('mtTimesheet');
  if (!host) return;
  host.innerHTML = `<div class="mt-loading">Loading&hellip;</div>`;

  const weekDate = (typeof getWeekKey === 'function') ? getWeekKey(0) : null;
  if (!weekDate || typeof sb === 'undefined' || !sb) {
    host.innerHTML = `<div class="mt-empty-sm">Timesheet data isn't available.</div>`;
    return;
  }

  let rows = [], wsRow = null;
  try {
    const [entryRes, statusRes] = await Promise.all([
      sb.from('timesheet_entries').select('*').eq('employee_id', empId).eq('week_start', weekDate),
      sb.from('timesheet_weeks').select('*').eq('employee_id', empId).eq('week_key', weekDate),
    ]);
    if (entryRes.error) throw entryRes.error;
    if (statusRes.error) throw statusRes.error;
    rows = entryRes.data || [];
    wsRow = (statusRes.data && statusRes.data[0]) || null;
  } catch (err) {
    host.innerHTML = `<div class="mt-error">Could not load timesheet: ${_mtEsc(err.message || err)}</div>`;
    return;
  }

  // Overhead rows have NO database uniqueness constraint (project_id and
  // task_id are both null for them), so a stray duplicate row is possible
  // under a race (e.g. two autosaves overlapping). Every other place that
  // reads timesheets — reloadTsWeek(), openTimesheetPanel(), viewEmployeeTimesheet()
  // — already tolerates this by keying on category and letting the last row
  // loaded win, rather than summing: `tsData[ohKey][r.overhead_cat] = ...`.
  // We key by category here too so a leftover duplicate row can't quietly
  // double someone's hours (this is what happened for Obi's Sales Support /
  // General Overhead rows before this fix). Project+task rows don't need
  // this treatment — the DB has a real unique constraint on
  // (week_start, employee_id, task_id, project_id), so duplicates there
  // aren't possible.
  const ohByCat = {};  // cat -> hours{0..6}
  const projRows = []; // [{projId, taskName, hrs}]
  rows.forEach(r => {
    let hrs = {};
    try { hrs = JSON.parse(r.hours_json || '{}'); } catch (_) {}
    if (r.is_overhead) {
      ohByCat[r.overhead_cat || 'Overhead'] = hrs;
    } else {
      projRows.push({ projId: r.project_id || '__unassigned__', taskName: r.task_name || '(untitled task)', hrs });
    }
  });

  // Group task rows under their project/job so the grid reads the same way
  // the real Timesheet page does — job number first, tasks nested under it.
  const projGroups = {}; // projId -> [{taskName, hrs}]
  const projOrder = [];
  projRows.forEach(pr => {
    if (!projGroups[pr.projId]) { projGroups[pr.projId] = []; projOrder.push(pr.projId); }
    projGroups[pr.projId].push(pr);
  });

  const projList = (typeof projects !== 'undefined' && Array.isArray(projects)) ? projects : [];
  const OH_CATS = (typeof OVERHEAD_CATS !== 'undefined' && Array.isArray(OVERHEAD_CATS))
    ? OVERHEAD_CATS
    : ['General Overhead','Sales Support','Sick','Vacation Time','Personal Time','Holiday','Snow Day'];
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const days = (typeof getWeekDays === 'function') ? getWeekDays(0) : null;

  const dayHeaderHtml = days
    ? days.map((d, i) => `<th class="day-col${(typeof isToday === 'function' && isToday(d)) ? ' today' : ''}">${DAY_SHORT[i]}<span class="day-num">${d.getDate()}</span></th>`).join('')
    : DAY_SHORT.map(d => `<th class="day-col">${d}</th>`).join('');

  const fmtH = (h) => h > 0 ? h.toFixed(1) : '&mdash;';
  const fmtHTot = (h) => h > 0 ? h.toFixed(1) + 'h' : '&mdash;';

  // ---- Project/job section ----
  const projDayTotals = [0,0,0,0,0,0,0];
  let projGrand = 0;
  let bodyHtml = '';
  projOrder.forEach(pid => {
    const tasks = projGroups[pid];
    const p = projList.find(x => x.id === pid);
    const projLabel = p ? `${p.emoji || '&#x1F4C1;'} ${_mtEsc(p.name)}` : (pid === '__unassigned__' ? '(no job assigned)' : _mtEsc(pid));
    const projDot = p ? `<span class="ts-proj-dot" style="background:${p.color || '#888'}"></span>` : '';
    const groupDaySums = [0,0,0,0,0,0,0];
    let groupTotal = 0;
    const taskRowsHtml = tasks.map(t => {
      let rowTotal = 0;
      const cells = [];
      for (let d = 0; d < 7; d++) {
        const h = t.hrs[d] || 0;
        groupDaySums[d] += h; projDayTotals[d] += h; rowTotal += h;
        cells.push(`<td class="ts-cell" style="text-align:center">${fmtH(h)}</td>`);
      }
      groupTotal += rowTotal; projGrand += rowTotal;
      return `<tr class="ts-task-subrow">
        <td class="ts-row-label ts-task-subrow-label" style="padding-left:26px;font-size:12px;color:var(--muted)">${_mtEsc(t.taskName)}</td>
        ${cells.join('')}
        <td class="ts-row-total">${fmtHTot(rowTotal)}</td>
      </tr>`;
    }).join('');
    const groupDayCells = groupDaySums.map(h => `<td class="ts-projgroup-sub">${h > 0 ? h.toFixed(1) + 'h' : ''}</td>`).join('');
    bodyHtml += `<tr class="ts-proj-group-header">
      <td class="ts-proj-group-namecell"><span class="ts-proj-group-name">${projDot}${projLabel}</span><span class="ts-proj-group-count">${tasks.length} task${tasks.length === 1 ? '' : 's'}</span></td>
      ${groupDayCells}
      <td class="ts-projgroup-total">${groupTotal > 0 ? groupTotal.toFixed(1) + 'h' : ''}</td>
    </tr>${taskRowsHtml}`;
  });

  const projTotalCells = projDayTotals.map(h => `<td class="ts-day-total">${fmtHTot(h)}</td>`).join('');
  bodyHtml += `<tr class="ts-footer-row"><td class="ts-footer-label">Project Total</td>${projTotalCells}<td class="ts-grand-total">${fmtHTot(projGrand)}</td></tr>`;

  // ---- Overhead section — always shows all categories, matching the real page ----
  bodyHtml += `<tr><td colspan="9" style="padding:6px 14px;background:rgba(124,92,191,0.08);border-top:2px solid rgba(124,92,191,0.25);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--purple)">&#x2b21; Overhead</td></tr>`;

  const ohDayTotals = [0,0,0,0,0,0,0];
  let ohGrand = 0;
  OH_CATS.forEach(cat => {
    const hrs = ohByCat[cat] || {};
    let rowTotal = 0;
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const h = hrs[d] || 0;
      ohDayTotals[d] += h; rowTotal += h;
      cells.push(`<td class="ts-cell" style="text-align:center">${fmtH(h)}</td>`);
    }
    ohGrand += rowTotal;
    bodyHtml += `<tr><td class="ts-row-label"><span style="font-size:13px">${_mtEsc(cat)}</span></td>${cells.join('')}<td class="ts-row-total">${fmtHTot(rowTotal)}</td></tr>`;
  });
  const ohTotalCells = ohDayTotals.map(h => `<td class="ts-day-total">${fmtHTot(h)}</td>`).join('');
  bodyHtml += `<tr class="ts-footer-row"><td class="ts-footer-label">OH Total</td>${ohTotalCells}<td class="ts-grand-total">${fmtHTot(ohGrand)}</td></tr>`;

  // ---- Daily Total row (project + overhead combined) ----
  const grand = projGrand + ohGrand;
  const dailyCells = projDayTotals.map((h, i) => {
    const total = h + ohDayTotals[i];
    return `<td class="ts-day-total" style="color:var(--amber);font-weight:700;border-top:2px solid var(--amber-dim)">${fmtHTot(total)}</td>`;
  }).join('');
  bodyHtml += `<tr class="ts-footer-row" style="background:var(--amber-glow)"><td class="ts-footer-label" style="color:var(--amber);border-top:2px solid var(--amber-dim)">Daily Total</td>${dailyCells}<td class="ts-grand-total" style="color:var(--amber);border-top:2px solid var(--amber-dim)">${grand.toFixed(1)}h</td></tr>`;

  const statusMeta = {
    submitted: { label: 'Submitted',   color: 'var(--blue, #5b9cf6)', bg: 'rgba(91,156,246,.12)', icon: '&#x23F3;' },
    approved:  { label: 'Approved',    color: '#4caf7d',              bg: 'rgba(76,175,125,.12)', icon: '&#x2713;' },
    rejected:  { label: 'Rejected',    color: '#e05c5c',              bg: 'rgba(224,92,92,.12)',  icon: '&#x2717;' },
  }[wsRow?.status] || { label: 'In progress', color: 'var(--muted)', bg: 'var(--surface2)', icon: '&#x270F;' };

  host.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
      <span class="mt-pill" style="background:${statusMeta.bg};color:${statusMeta.color}">${statusMeta.icon} ${statusMeta.label}</span>
      <span style="font-size:12.5px;color:var(--muted)">Total so far: <b style="color:var(--amber)">${grand.toFixed(1)}h</b></span>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
      <table class="ts-grid" style="min-width:640px">
        <thead><tr><th style="text-align:left">Project / Task</th>${dayHeaderHtml}<th style="text-align:center;border-left:1px solid var(--border)">Total</th></tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>`;
}

function _renderMtTimeOff(empId) {
  const host = document.getElementById('mtTimeOff');
  if (!host) return;
  const emp = employees.find(e => e.id === empId);
  const t = (emp && typeof _computeTimeOffSummary === 'function') ? _computeTimeOffSummary(emp) : null;
  if (!t) { host.innerHTML = `<div class="mt-empty-sm">Time-off data isn't available for this employee.</div>`; return; }
  const h = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2).replace(/\.00$/, '') + 'h';
  const card = (label, val, accent) => `
    <div class="mt-to-card">
      <div class="mt-to-label">${label}</div>
      <div class="mt-to-val"${accent ? ` style="color:${accent}"` : ''}>${val}</div>
    </div>`;
  host.innerHTML = `
    <div class="mt-to-grid">
      ${card('Vacation bank', h(t.vacBankBalance), t.vacBankBalance < 0 ? '#e05c5c' : 'var(--blue, #5b9cf6)')}
      ${card('Sick bank', h(t.sickBankBalance), 'var(--amber)')}
      ${card('Used this period', h((t.usedVacation || 0) + (t.usedSick || 0)), null)}
    </div>
    <div class="mt-to-note">Balances match the employee card. Time-off requests are still approved in the Scheduler — shown here for context only.</div>`;
}

function _renderMtReviews(empId) {
  const list = document.getElementById('mtReviewsList');
  if (!list) return;
  const revs = _myTeamReviews[empId] || [];
  if (!revs.length) {
    list.innerHTML = `<div class="mt-empty-sm">No performance reviews yet. Use &ldquo;+ New Review&rdquo; to start one.</div>`;
    return;
  }
  const fmtDate = (d) => (typeof _hrFmtDate === 'function') ? _hrFmtDate(d) : d;
  const formLabel = (t) => (typeof _reviewFormLabel === 'function') ? _reviewFormLabel(t) : 'Staff';
  list.innerHTML = revs.map(r => {
    const meta = (typeof _reviewStatusMeta === 'function')
      ? _reviewStatusMeta(r)
      : { label: '', color: 'var(--muted)', bg: 'var(--surface2)', icon: '' };
    const locked = r.submitted_for_approval_at || r.hr_approved_at || r.employee_acknowledged_at;
    const openLabel = locked ? '&#x1F441; View' : '&#x270E; Open';
    const returnedNote = (r.hr_returned_at && r.hr_rejection_note && !r.submitted_for_approval_at)
      ? `<div class="mt-rev-note">&#x21A9; Returned by HR: ${_mtEsc(r.hr_rejection_note)}</div>` : '';
    return `
      <div class="mt-rev-card">
        <div class="mt-rev-main">
          <div class="mt-rev-title">${_mtEsc(formLabel(r.form_type))} Review &mdash; ${_mtEsc(fmtDate(r.review_date))}</div>
          <div class="mt-rev-pills">
            ${r.total_score != null ? `<span class="mt-pill mt-pill-score">Score ${r.total_score}/100</span>` : ''}
            ${r.performance_rating != null
              ? `<span class="mt-pill mt-pill-rating">Rating ${r.performance_rating}/9</span>`
              : `<span class="mt-pill-muted">Not scored</span>`}
            <span class="mt-pill" style="background:${meta.bg};color:${meta.color}">${meta.icon} ${meta.label}</span>
          </div>
          ${returnedNote}
        </div>
        <div class="mt-rev-actions">
          <button class="mt-act" onclick="mtOpenReview('${empId}','${r.id}')">${openLabel}</button>
          <button class="mt-act" onclick="exportReviewPdf('${r.id}','${empId}')">&#x1F4C4; PDF</button>
        </div>
      </div>`;
  }).join('');
}

// Open the review modal from My Team. Seeds hrRecordsCache so the modal can
// find the existing record (the modal looks up "existing" from that cache).
function mtOpenReview(empId, reviewId, type) {
  if (reviewId && _myTeamReviews[empId] && typeof hrRecordsCache !== 'undefined') {
    hrRecordsCache[empId] = hrRecordsCache[empId] || { reviews: [], discipline: [] };
    hrRecordsCache[empId].reviews = _myTeamReviews[empId];
  }
  if (typeof openReviewModal === 'function') openReviewModal(empId, reviewId || null, type);
}

function _renderMtDiscipline(empId) {
  const list = document.getElementById('mtDiscList');
  if (!list) return;
  const items = _myTeamDiscipline[empId] || [];
  if (!items.length) {
    list.innerHTML = `<div class="mt-empty-sm">No disciplinary actions on record. Use &ldquo;+ New Action&rdquo; if one is needed.</div>`;
    return;
  }
  const fmtDate = (d) => (typeof _hrFmtDate === 'function') ? _hrFmtDate(d) : d;
  const tierOf  = (k) => (typeof _hrTier === 'function') ? (_hrTier(k).label || k) : k;
  const catOf   = (k) => (typeof _hrCategory === 'function') ? (_hrCategory(k).label || k) : k;
  list.innerHTML = items.map(d => {
    const meta = (typeof _reviewStatusMeta === 'function')
      ? _reviewStatusMeta(d)
      : { label: '', color: 'var(--muted)', bg: 'var(--surface2)', icon: '' };
    const locked = d.submitted_for_approval_at || d.hr_approved_at || d.employee_acknowledged_at;
    const openLabel = locked ? '&#x1F441; View' : '&#x270E; Open';
    const returnedNote = (d.hr_returned_at && d.hr_rejection_note && !d.submitted_for_approval_at)
      ? `<div class="mt-rev-note">&#x21A9; Returned by HR: ${_mtEsc(d.hr_rejection_note)}</div>` : '';
    return `
      <div class="mt-rev-card">
        <div class="mt-rev-main">
          <div class="mt-rev-title">${_mtEsc(tierOf(d.tier))} &mdash; ${_mtEsc(fmtDate(d.incident_date))}</div>
          <div class="mt-rev-pills">
            <span class="mt-pill mt-pill-cat">${_mtEsc(catOf(d.category))}</span>
            <span class="mt-pill" style="background:${meta.bg};color:${meta.color}">${meta.icon} ${meta.label}</span>
          </div>
          ${returnedNote}
        </div>
        <div class="mt-rev-actions">
          <button class="mt-act" onclick="mtOpenDiscipline('${empId}','${d.id}')">${openLabel}</button>
        </div>
      </div>`;
  }).join('');
}

// Open the discipline modal from My Team. Seeds hrRecordsCache so the modal finds the record.
function mtOpenDiscipline(empId, actionId) {
  if (actionId && _myTeamDiscipline[empId] && typeof hrRecordsCache !== 'undefined') {
    hrRecordsCache[empId] = hrRecordsCache[empId] || { reviews: [], discipline: [] };
    hrRecordsCache[empId].discipline = _myTeamDiscipline[empId];
  }
  if (typeof openDisciplineModal === 'function') openDisciplineModal(empId, actionId || null);
}

// Picker show/hide
function _mtToggleRevPicker(ev) {
  if (ev) ev.stopPropagation();
  const p = document.getElementById('mtRevPicker');
  if (p) p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}
function _mtCloseRevPicker() {
  const p = document.getElementById('mtRevPicker');
  if (p) p.style.display = 'none';
}
document.addEventListener('click', (e) => {
  const w = document.getElementById('mtRevPickerWrap');
  if (w && !w.contains(e.target)) _mtCloseRevPicker();
});

// Called by saveReview() after a supervisor save/submit so the surface refreshes.
window._myTeamAfterSave = function (empId) {
  const panel = document.getElementById('panel-myteam');
  if (!panel || !panel.classList.contains('active')) return;
  delete _myTeamReviews[empId];
  delete _myTeamDiscipline[empId];
  if (empId === _myTeamSelectedId) _renderMtDetail(empId);
  // Nav visibility could change if reports were edited elsewhere — keep it honest.
  if (typeof updateMyTeamNav === 'function') updateMyTeamNav();
};
