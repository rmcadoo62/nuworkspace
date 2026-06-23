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

  host.innerHTML = `
    <div class="mt-detail-head">
      <div class="mt-avatar mt-avatar-lg" style="background:${emp.color || '#888'}">${_mtEsc(_mtInitials(emp))}</div>
      <div>
        <div class="mt-detail-name">${_mtEsc(emp.name)}</div>
        <div class="mt-detail-role">${_mtEsc(emp.role || '')}${emp.dept ? ' &middot; ' + _mtEsc(emp.dept) : ''}</div>
      </div>
    </div>

    <div class="mt-section-head">
      <div class="mt-section-title">&#x1F4DD; Performance Reviews</div>
      <div class="mt-picker-wrap" id="mtRevPickerWrap">
        <button class="mt-new-btn" onclick="_mtToggleRevPicker(event)">+ New Review <span style="font-size:9px;opacity:.65">&#x25BC;</span></button>
        <div class="mt-picker" id="mtRevPicker">
          <button class="rev-picker-opt" onclick="_mtCloseRevPicker();mtOpenReview('${empId}',null,'staff')">&#x1F4CB; Staff Review<span class="rev-picker-formnum">NUI #28</span></button>
          <button class="rev-picker-opt" onclick="_mtCloseRevPicker();mtOpenReview('${empId}',null,'supervisor')">&#x1F9ED; Supervisor Review<span class="rev-picker-formnum">NUI #29</span></button>
        </div>
      </div>
    </div>
    <div id="mtReviewsList"><div class="mt-loading">Loading&hellip;</div></div>

    <div class="mt-section-head" style="margin-top:26px">
      <div class="mt-section-title">&#x26A0;&#xFE0F; Disciplinary Actions</div>
      <button class="mt-new-btn" style="background:var(--red);color:#fff" onclick="mtOpenDiscipline('${empId}',null)">+ New Action</button>
    </div>
    <div id="mtDiscList"><div class="mt-loading">Loading&hellip;</div></div>

    <div class="mt-section-head" style="margin-top:26px">
      <div class="mt-section-title">&#x1F4C5; Time Off <span style="font-size:11px;font-weight:400;color:var(--muted)">&middot; view only</span></div>
    </div>
    <div id="mtTimeOff"></div>`;

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
