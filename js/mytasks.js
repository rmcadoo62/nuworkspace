// ===== MY TASKS =====
// A personal queue: every open task assigned to the logged-in user, across all
// projects, sorted by age (newest created on top). The nav item (added under
// Home in index.html, hidden by default) reveals itself only when you have at
// least one open task assigned to you, mirroring the navApprovals pattern.

const MT_DONE_STATUSES = new Set(['complete', 'billed', 'cancelled', 'done']);
const MT_REPORT_CATS   = new Set(['41', '43']);   // report deliverables age from eligibility, not creation

function _mtEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _mtCatOf(t) { return (t.salesCat || '').toString().trim(); }

// --- Report age, mirrored from reports.js so the two screens agree ---
// A report's age is measured from the moment it became eligible — i.e. the
// latest completion among the same scope siblings the report waits on — NOT
// from its created date. (Keep this in sync with reportScope/reportEligibleDate
// in reports.js; both read the shared global taskStore/sectionStore.)
function _mtReportScope(r) {
  const base = t => t.proj === r.proj && t._id !== r._id && !MT_REPORT_CATS.has(_mtCatOf(t));
  const sectioned = r.sectionId && (typeof sectionStore !== 'undefined')
    && sectionStore.some(s => s._id === r.sectionId);
  let scope = sectioned
    ? taskStore.filter(t => base(t) && t.sectionId === r.sectionId)
    : taskStore.filter(base);
  if (sectioned && scope.length === 0) scope = taskStore.filter(base);   // reports-only section → whole job
  return scope;
}
function _mtReportEligibleDate(r) {
  const dates = _mtReportScope(r).map(t => t.completedDate || t.billedDate).filter(Boolean);
  if (!dates.length) return '';
  return dates.reduce((a, b) => (a > b ? a : b));
}
// A report is "owed" (eligible to work) only once everything in its scope is
// done. Mirrors reportOwed in reports.js.
function _mtReportOwed(r) {
  const scope = _mtReportScope(r);
  if (scope.length === 0) return true;
  return scope.every(t => MT_DONE_STATUSES.has(t.status));
}
// Age anchor: reports age from eligibility; procedures and everything else age
// from their created date.
function _mtAgeAnchor(t) {
  return MT_REPORT_CATS.has(_mtCatOf(t)) ? _mtReportEligibleDate(t) : t.createdAt;
}

// True if this task is assigned to the current user (by id, falling back to
// initials for older rows that predate assignId).
function _mtIsMine(t) {
  if (typeof currentEmployee === 'undefined' || !currentEmployee) return false;
  if (t.assignId && currentEmployee.id && t.assignId === currentEmployee.id) return true;
  if (t.assign && currentEmployee.initials && t.assign === currentEmployee.initials) return true;
  return false;
}

// My open tasks (unsorted) — used for the count.
function _myTasksRaw() {
  if (typeof taskStore === 'undefined' || !Array.isArray(taskStore)) return [];
  return taskStore.filter(t => {
    if (!_mtIsMine(t) || MT_DONE_STATUSES.has(t.status)) return false;
    // A NEW report isn't actionable until its scope work is done, so hide it
    // until then — same gate the In-Progress report uses. Started reports
    // (in progress / on hold), procedures, and everything else always show.
    if (MT_REPORT_CATS.has(_mtCatOf(t)) && t.status === 'new' && !_mtReportOwed(t)) return false;
    return true;
  });
}

// My open tasks, sorted by age: newest (most recent anchor date) on top. The
// anchor (eligibility for reports, created date otherwise) is computed once and
// stashed on each task for the render to reuse.
function _myTasksList() {
  const mine = _myTasksRaw();
  mine.forEach(t => { t._mtAnchor = _mtAgeAnchor(t); });
  return mine.sort((a, b) => {
    const ad = a._mtAnchor || '';
    const bd = b._mtAnchor || '';
    if (ad !== bd) return ad < bd ? 1 : -1;          // newer anchor first
    return (a.name || '').localeCompare(b.name || '');
  });
}

function myTasksCount() { return _myTasksRaw().length; }

// Call after any task change (assign, status, add, delete): refreshes the nav
// count and re-renders the page if it's the one being viewed.
function myTasksRefresh() {
  updateMyTasksNav();
  const p = document.getElementById('panel-mytasks');
  if (p && p.classList.contains('active')) renderMyTasksPanel();
}

// Show/hide the nav item and update its count badge. Safe to call anytime;
// call it on load and whenever tasks change (assignment, status, add, delete).
function updateMyTasksNav() {
  const nav = document.getElementById('navMyTasks');
  const badge = document.getElementById('myTasksBadge');
  if (!nav) return;
  const n = (typeof currentEmployee !== 'undefined' && currentEmployee) ? myTasksCount() : 0;
  if (badge) badge.textContent = n;
  if (n > 0) {
    nav.style.display = '';
  } else {
    nav.style.display = 'none';
    // If the user is sitting on a now-empty My Tasks view, bounce to Home.
    const panel = document.getElementById('panel-mytasks');
    if (panel && panel.classList.contains('active')) {
      const home = document.getElementById('navHome');
      if (home) home.click();
    }
  }
}

const MT_STATUS_ORDER  = ['new', 'inprogress', 'prohold', 'accthold', 'complete', 'cancelled', 'billed'];
const MT_STATUS_LABELS = { new: 'New', inprogress: 'In Progress', prohold: 'Production Hold', accthold: 'Accounting Hold', complete: 'Complete', cancelled: 'Cancelled', billed: 'Billed' };
// Statuses you're allowed to set FROM this page. Everything else (Accounting
// Hold, Cancelled, Billed) must be changed from the job itself.
const MT_EDITABLE_STATUSES = ['new', 'inprogress', 'prohold', 'complete'];

function _mtStatusColor(s) {
  try { if (typeof statusColor === 'function') return statusColor(s); } catch (e) {}
  return '#888';
}

// Row background tint by status, matching the project task list's color scheme.
function _mtRowBg(t) {
  if (t.status === 'billed') return 'rgba(192,132,252,0.50)';
  if (t.status === 'cancelled') return 'rgba(232,162,52,0.50)';
  if (t.status === 'complete' || t.done) return 'rgba(120,120,130,0.50)';
  if (t.status === 'inprogress') return 'rgba(46,158,98,0.50)';
  return '';
}

// Editable status dropdown, styled like the project task list's status pill.
// Only the allowed statuses are offered; if the task is currently in a locked
// status (e.g. Accounting Hold), it's shown so the value reads correctly, but
// the only changes available are the allowed ones.
function _mtStatusSelect(t) {
  const cur = t.status || 'new';
  let values = MT_EDITABLE_STATUSES.slice();
  if (values.indexOf(cur) === -1) values = [cur].concat(values);
  const opts = values.map(s =>
    '<option value="' + s + '"' + (cur === s ? ' selected' : '') + '>' + (MT_STATUS_LABELS[s] || s) + '</option>').join('');
  const isNew = cur === 'new';
  const bg = isNew ? '#fff' : _mtStatusColor(cur) + '80';
  const bd = isNew ? '#bbb' : _mtStatusColor(cur) + '99';
  return '<select class="status-pill-select" style="color:#000;background:' + bg + ';border-color:' + bd + '"'
    + ' onchange="myTasksSetStatus(\'' + t._id + '\',\'' + t.proj + '\',this.value)">' + opts + '</select>';
}

// Save a status change, then re-render this page and refresh the nav count —
// a task that goes complete/billed/cancelled drops off the list.
function myTasksSetStatus(taskId, projId, value) {
  if (typeof inlineSave !== 'function') return;
  const after = function () { renderMyTasksPanel(); updateMyTasksNav(); };
  const r = inlineSave(taskId, projId, 'status', value);
  if (r && typeof r.then === 'function') r.then(after); else after();
}

// Age color thresholds, matched to the In-Progress report's age badge.
function _mtAgeColor(d) {
  if (d == null) return 'var(--muted)';
  if (d >= 45) return 'var(--red)';
  if (d >= 14) return '#e8a234';
  return 'var(--text)';
}

function _mtFmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// Whole days from a YYYY-MM-DD created date to today.
function _mtAgeDays(iso) {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - d) / 86400000));
}

// Logged vs budgeted hours for a task. Logged comes from the timesheet layer.
function _mtHours(t) {
  let logged = 0;
  try { if (typeof getHoursForTask === 'function') logged = getHoursForTask(t.name, t.proj, t._id) || 0; } catch (e) {}
  return { logged, budget: t.budgetHours || 0 };
}

// Navigate into a project the same way the In-Progress report does.
function myTasksOpenProject(projId) {
  const n = document.getElementById('navProjects');
  if (n) n.click();
  setTimeout(function () { if (typeof selectProject === 'function') selectProject(projId); }, 50);
}

function openMyTasksPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  const tb = document.getElementById('topbarName'); if (tb) tb.textContent = 'My Tasks';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('panel-mytasks'); if (panel) panel.classList.add('active');
  renderMyTasksPanel();
}

function renderMyTasksPanel() {
  const wrap = document.getElementById('myTasksWrap');
  if (!wrap) return;
  const list = _myTasksList();
  const meName = (typeof currentEmployee !== 'undefined' && currentEmployee) ? (currentEmployee.name || 'you') : 'you';

  let head = '<div style="margin-bottom:18px">'
    + '<div style="font-family:\'DM Serif Display\',serif;font-size:22px;color:var(--text)">My Tasks</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:3px">'
    + list.length + ' open task' + (list.length === 1 ? '' : 's') + ' assigned to ' + _mtEsc(meName)
    + '</div></div>';

  if (list.length === 0) {
    wrap.innerHTML = head
      + '<div style="text-align:center;padding:40px;color:var(--muted);background:var(--surface2);'
      + 'border:1px solid var(--border);border-radius:10px;font-size:13px">Nothing assigned to you right now.</div>';
    return;
  }

  const th = (label, align) => '<th style="text-align:' + (align || 'left') + ';padding:9px 14px;'
    + 'font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);white-space:nowrap">' + label + '</th>';

  const rowsHtml = list.map(t => {
    const proj = (typeof projects !== 'undefined' ? projects.find(p => p.id === t.proj) : null) || {};
    const info = (typeof projectInfo !== 'undefined' ? projectInfo[t.proj] : null) || {};
    const projNum = proj.name || '—';
    const client  = info.clientName || info.client || '';
    const age = _mtAgeDays(t._mtAnchor);
    const ageStr = age == null ? '—' : age + 'd';
    const ageColor = _mtAgeColor(age);
    const h = _mtHours(t);
    const over = h.budget > 0 && h.logged > h.budget;
    const hoursStr = (h.logged > 0 ? h.logged.toFixed(1) + 'h' : '—')
      + (h.budget > 0 ? ' <span style="color:var(--muted)">/ ' + h.budget + 'h</span>' : '');
    const rowBg = _mtRowBg(t);
    const cell = 'padding:11px 14px;border-top:1px solid var(--border);font-size:12px;vertical-align:middle';
    const mono = 'font-family:\'JetBrains Mono\',monospace';
    return '<tr onclick="myTasksOpenProject(\'' + t.proj + '\')" title="Open project" style="cursor:pointer;background:' + rowBg + '"'
      + ' onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'' + rowBg + '\'">'
      + '<td style="' + cell + '">'
      +   '<div style="font-size:13.5px;color:var(--text)">' + _mtEsc(t.name || 'Untitled task') + '</div>'
      +   '<div style="font-size:11px;color:var(--muted);margin-top:2px"><span style="' + mono + '">' + _mtEsc(projNum) + '</span>'
      +     (client ? ' &middot; ' + _mtEsc(client) : '') + '</div>'
      + '</td>'
      + '<td style="' + cell + ';' + mono + ';color:var(--amber);white-space:nowrap">' + _mtEsc(_mtCatOf(t) || '—') + '</td>'
      + '<td style="' + cell + '" onclick="event.stopPropagation()">' + _mtStatusSelect(t) + '</td>'
      + '<td style="' + cell + ';' + mono + ';color:var(--muted);white-space:nowrap">' + _mtFmtDate(t.createdAt) + '</td>'
      + '<td style="' + cell + ';' + mono + ';text-align:right;font-weight:600;color:' + ageColor + '">' + ageStr + '</td>'
      + '<td style="' + cell + ';' + mono + ';text-align:right;white-space:nowrap;color:' + (over ? 'var(--red);font-weight:600' : 'var(--text)') + '">' + hoursStr + '</td>'
      + '</tr>';
  }).join('');

  wrap.innerHTML = head
    + '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:var(--surface2)">'
    +   th('Task') + th('Cat') + th('Status') + th('Created') + th('Age', 'right') + th('Hours', 'right')
    + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
}

// Keep the nav in sync with the effective user. Recompute the badge/visibility
// every tick — it's cheap and idempotent, so a transient empty state (e.g. data
// mid-swap during "View as") can't latch the item hidden, and exiting "View as"
// reverts the count on the next tick. Only re-render the open panel when the
// effective user actually changes, so open dropdowns/scroll aren't disturbed.
(function _mtWatch() {
  let lastKey = '\u0000';
  setInterval(function () {
    if (typeof currentEmployee === 'undefined'
        || typeof taskStore === 'undefined' || !Array.isArray(taskStore)) return;
    updateMyTasksNav();
    const key = (currentEmployee && currentEmployee.id) || '';
    if (key !== lastKey) {
      lastKey = key;
      const p = document.getElementById('panel-mytasks');
      if (p && p.classList.contains('active')) renderMyTasksPanel();
    }
  }, 1000);
})();
