// js/surveys.js
//
// Customer Surveys admin panel.
//
// Workflow:
//   • Eligible Projects   — projects with status testcomplete/complete + no
//                           open tasks + not skipped + no existing invitation.
//                           Each row has a Send and Skip button.
//   • Sent                — invitations awaiting response (read-only).
//   • Completed           — invitations with a response, expandable.
//   • Show Skipped toggle — projects flagged skip_survey=true, with Unskip.
//
// On Send: insert a survey_invitations row for the project, immediately
// invoke the survey-send edge function. On failure we DELETE the row so the
// project returns to the Eligible list (no orphan queued rows).
//
// On Skip: sets projects.skip_survey = true.  Project disappears from the
// Eligible list permanently unless unskipped via the Show Skipped panel.

(function () {

  // ── Module state ──────────────────────────────────────────────────────────

  let _eligible  = [];   // [{ project, info, contactName, contactEmail, hasEmail, priorAttempt, recentWarning }]
  let _sent      = [];   // [{ id, status, contact_*, sent_at, ..., project_name }]  status='sent', within 30 days
  let _completed = [];   // [{ ...invitation, project_name, response }]
  let _skipped   = [];   // [{ project, info }]
  let _showSkipped = false;
  let _expandedYears = new Set();   // years user has manually expanded in Completed section
  let _stats     = { avgScore: null, responseRate: null, eligibleCount: 0 };
  let _pendingSend = null;  // { invitationId, eligible } while preview modal is open

  const PREVIEW_SKIP_KEY = 'nuworkspace_survey_skip_preview';

  // Sent invitations older than this drop out of the active "Sent" section
  // and the project becomes re-eligible (no response after this window means
  // we can resurvey). The original invitation row stays in the DB for audit
  // history but isn't shown in the UI.
  const SENT_EXPIRY_DAYS = 30;


  // ── Panel routing ─────────────────────────────────────────────────────────

  window.openSurveyQueuePanel = function (navEl) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    // Highlight the dedicated sidebar nav item. Falls back to whatever
    // element was passed in (e.g. when called programmatically from a tile
    // or a chatter notification click).
    const navItem = document.getElementById('navCustomerSurveys');
    if (navItem) navItem.classList.add('active');
    else if (navEl) navEl.classList.add('active');
    activeProjectId = null;
    document.getElementById('topbarName').textContent = 'Customer Surveys';
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-survey-queue').classList.add('active');
    loadAndRender();
  };


  // ── Data load ─────────────────────────────────────────────────────────────

  async function loadAndRender() {
    const body = document.getElementById('surveyQueueBody');
    if (!body) return;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Loading…</div>';

    try {
      const now = Date.now();
      const expiryCutoffIso = new Date(now - SENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // 1. Pull invitations with status 'sent' or 'completed', newest first.
      const { data: invs, error: invErr } = await sb
        .from('survey_invitations')
        .select('id, status, contact_email, contact_name, contact_id, sent_at, completed_at, expires_at, send_error, project_id, template_snapshot')
        .in('status', ['sent', 'completed'])
        .order('sent_at', { ascending: false, nullsFirst: false });
      if (invErr) throw invErr;

      // 2. Pull responses for completed invitations.
      const completedIds = invs.filter(r => r.status === 'completed').map(r => r.id);
      const respMap = {};
      if (completedIds.length) {
        const { data: resps } = await sb
          .from('survey_responses')
          .select('invitation_id, nps_score, avg_likert, follow_up_requested')
          .in('invitation_id', completedIds);
        (resps || []).forEach(r => { respMap[r.invitation_id] = r; });
      }

      // 3. Build a project lookup from the in-memory store.
      const projMap = {};
      (typeof projects !== 'undefined' ? projects : []).forEach(p => { projMap[p.id] = p; });

      // 4. Group by project to find the LATEST invitation per project. Older
      //    historical invitations (e.g. an expired sent followed by a re-sent
      //    one) are kept in DB for audit but don't surface in the UI.
      const latestByProject = {};
      invs.forEach(inv => {
        if (!latestByProject[inv.project_id]) latestByProject[inv.project_id] = inv;
      });
      const latests = Object.values(latestByProject);

      // 5. Build the eligibility-blocking project set:
      //    - completed invitations always block (we got feedback)
      //    - sent invitations within the 30-day window block (still waiting)
      //    - sent invitations older than 30 days do NOT block — project is
      //      re-eligible to resurvey.
      const projectsBlocking = new Set();
      const expiredByProject = {};   // project_id → expired sent invitation row
      latests.forEach(inv => {
        if (inv.status === 'completed') {
          projectsBlocking.add(inv.project_id);
        } else if (inv.status === 'sent') {
          if (inv.sent_at && inv.sent_at >= expiryCutoffIso) {
            projectsBlocking.add(inv.project_id);
          } else {
            expiredByProject[inv.project_id] = inv;
          }
        }
      });

      // 6. Build the recent-by-contact map for the ✋ "same contact recently
      //    surveyed" warning. Keyed by contact_id, value is the most recent
      //    sent invitation within the 30-day window.
      const recentByContact = {};
      invs.forEach(inv => {
        if (inv.contact_id && inv.sent_at && inv.sent_at >= expiryCutoffIso) {
          if (!recentByContact[inv.contact_id]) recentByContact[inv.contact_id] = inv;
        }
      });

      // 7. Build the four display lists.
      //    Sent: latest sent within 30 days
      //    Completed: latest is completed (per-project, since we filter to latest)
      _sent = latests
        .filter(r => r.status === 'sent' && r.sent_at && r.sent_at >= expiryCutoffIso)
        .map(r => ({ ...r, project_name: projMap[r.project_id]?.name || '—' }));

      _completed = latests
        .filter(r => r.status === 'completed')
        .map(r => ({
          ...r,
          project_name: projMap[r.project_id]?.name || '—',
          response:     respMap[r.id] || null,
        }));

      _skipped = computeSkippedProjects(projMap);

      // 8. Eligible includes projects where the latest invitation is expired
      //    sent (re-eligible). Decorated with priorAttempt/recentWarning.
      _eligible = await computeEligibleProjects(projectsBlocking, expiredByProject, recentByContact);

      // 9. Compute the three top-of-panel stats.
      _stats = computeStats(_sent, _completed, _eligible);

      renderAll();

      // Sidebar badge: piggyback off the freshly computed _eligible count.
      _setSurveysBadgeCount(_eligible.length);
    } catch (e) {
      console.error('[surveys] load failed', e);
      body.innerHTML = `<div style="padding:24px;color:var(--red);font-size:13px">Error loading: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }


  // ── Eligible / Skipped computation ────────────────────────────────────────

  // Eligibility: project_info.status is 'testcomplete' or 'complete', AND
  // no tasks with status outside {complete, billed, cancelled}, AND
  // projects.skip_survey is not true, AND
  // no blocking invitation (active sent within 30 days, or completed).
  //
  // A project whose latest invitation is "expired sent" (>30 days old, no
  // response) IS eligible — we treat it as a fresh send opportunity. The row
  // gets a priorAttempt note so the user knows there was a previous try.
  //
  // The first three checks run against in-memory data. Contact-info
  // enrichment (for display) requires DB queries against project_info and
  // contacts.
  async function computeEligibleProjects(projectsBlocking, expiredByProject, recentByContact) {
    if (typeof projects === 'undefined' || !projects.length) return [];

    const candidates = projects.filter(p => {
      if (p.skip_survey) return false;
      if (projectsBlocking.has(p.id)) return false;

      const info = (typeof projectInfo !== 'undefined') ? projectInfo[p.id] : null;
      if (!info) return false;
      if (info.status !== 'testcomplete' && info.status !== 'complete') return false;

      const projTasks = (typeof taskStore !== 'undefined' ? taskStore : [])
        .filter(t => t.proj === p.id);
      if (!projTasks.length) return false;
      const hasOpen = projTasks.some(t =>
        !['complete', 'billed', 'cancelled'].includes(t.status));
      if (hasOpen) return false;

      return true;
    });

    if (!candidates.length) return [];

    // Batch-fetch project_info contact data for all candidates in one query.
    const ids = candidates.map(p => p.id);
    const { data: pis } = await sb.from('project_info')
      .select('project_id, contact_id, client_email')
      .in('project_id', ids);
    const piMap = {};
    (pis || []).forEach(pi => { piMap[pi.project_id] = pi; });

    // Batch-fetch contacts for any candidates that have a contact_id.
    const contactIds = (pis || [])
      .map(pi => pi.contact_id)
      .filter(id => !!id);
    let contactMap = {};
    if (contactIds.length) {
      const { data: contacts } = await sb.from('contacts')
        .select('id, first_name, last_name, email')
        .in('id', contactIds);
      (contacts || []).forEach(c => { contactMap[c.id] = c; });
    }

    const now = Date.now();
    const dayMs = 86400000;

    // Resolve each candidate's contact name + email + warnings.
    return candidates.map(p => {
      const info = projectInfo[p.id];
      const pi   = piMap[p.id] || {};
      const ct   = pi.contact_id ? contactMap[pi.contact_id] : null;

      let contactName = '';
      let contactEmail = '';
      if (ct) {
        contactName  = `${ct.first_name || ''} ${ct.last_name || ''}`.trim();
        contactEmail = ct.email || '';
      }
      if (!contactEmail) contactEmail = pi.client_email || '';

      const hasEmail = contactEmail && contactEmail.includes('@');

      // Prior-attempt note: this project's latest invitation was expired sent
      // (we tried before; no reply within 30 days). User should know.
      let priorAttempt = null;
      const expiredInv = expiredByProject ? expiredByProject[p.id] : null;
      if (expiredInv && expiredInv.sent_at) {
        const days = Math.floor((now - new Date(expiredInv.sent_at).getTime()) / dayMs);
        priorAttempt = { days, sentAt: expiredInv.sent_at };
      }

      // Recent-contact warning: same contact got a survey within 30 days for
      // another project. (For this project to be eligible, its own active sent
      // can't be in recentByContact — so this only fires for cross-project
      // recency.)
      let recentWarning = null;
      if (pi.contact_id && recentByContact && recentByContact[pi.contact_id]) {
        const inv = recentByContact[pi.contact_id];
        const days = Math.floor((now - new Date(inv.sent_at).getTime()) / dayMs);
        recentWarning = { days, otherProjectId: inv.project_id };
      }

      return {
        project: p,
        info,
        contactName: contactName || '—',
        contactEmail,
        hasEmail,
        priorAttempt,
        recentWarning,
      };
    }).sort((a, b) => {
      // Sort by test complete date descending (most recently complete first).
      const ad = a.info.testcompleteDate || '';
      const bd = b.info.testcompleteDate || '';
      return bd.localeCompare(ad);
    });
  }

  function computeSkippedProjects(projMap) {
    if (typeof projects === 'undefined') return [];
    return projects
      .filter(p => p.skip_survey === true)
      .map(p => ({
        project: p,
        info: (typeof projectInfo !== 'undefined') ? projectInfo[p.id] : null,
      }))
      .sort((a, b) => (b.project.name || '').localeCompare(a.project.name || ''));
  }


  // ── Stats ─────────────────────────────────────────────────────────────────

  function computeStats(sent, completed, eligible) {
    // Average score across all completed responses' avg_likert.
    let scoreSum = 0, scoreCount = 0;
    let scaleMax = null;
    completed.forEach(r => {
      if (r.response && r.response.avg_likert != null) {
        scoreSum += Number(r.response.avg_likert);
        scoreCount += 1;
      }
      // Pick up scale_max from the template snapshot stored on the invitation.
      // Snapshots are immutable per-send so this stays accurate even if the
      // active template's scale changes later.
      if (scaleMax == null && r.template_snapshot && r.template_snapshot.scale_max != null) {
        scaleMax = Number(r.template_snapshot.scale_max);
      }
    });
    const avgScore = scoreCount > 0 ? scoreSum / scoreCount : null;

    // Response rate = completed / (sent + completed).
    // 'sent' here means awaiting response (status='sent'); once they respond
    // they move to status='completed'. Total-sent denominator = sent+completed.
    const totalSent = sent.length + completed.length;
    const responseRate = totalSent > 0
      ? (completed.length / totalSent) * 100
      : null;

    return {
      avgScore,
      scaleMax,
      responseRate,
      eligibleCount: eligible.length,
    };
  }


  // ── Render ────────────────────────────────────────────────────────────────

  function renderAll() {
    const body = document.getElementById('surveyQueueBody');
    if (!body) return;

    let html = '';
    html += renderStatsHTML();
    html += renderEligibleHTML();
    html += renderSentHTML();
    html += renderCompletedHTML();
    html += renderSkippedToggleHTML();

    body.innerHTML = html;
  }

  function renderStatsHTML() {
    const denom = _stats.scaleMax != null ? `/ ${_stats.scaleMax}` : '';
    const avg = _stats.avgScore != null
      ? `${_stats.avgScore.toFixed(2)}${denom ? ` <span style="font-size:14px;color:var(--muted);font-family:'DM Sans',sans-serif">${denom}</span>` : ''}`
      : '—';
    const rate = _stats.responseRate != null
      ? `${_stats.responseRate.toFixed(0)}<span style="font-size:14px;color:var(--muted);font-family:'DM Sans',sans-serif">%</span>`
      : '—';

    return `
      <div class="surveys-summary">
        <div class="surveys-stat">
          <div class="surveys-stat-label">Avg Score</div>
          <div class="surveys-stat-value">${avg}</div>
        </div>
        <div class="surveys-stat">
          <div class="surveys-stat-label">Response Rate</div>
          <div class="surveys-stat-value">${rate}</div>
        </div>
        <div class="surveys-stat">
          <div class="surveys-stat-label">Eligible</div>
          <div class="surveys-stat-value">${_stats.eligibleCount}</div>
        </div>
      </div>`;
  }

  function renderEligibleHTML() {
    if (!_eligible.length) {
      return `
        <div class="surveys-section">
          <div class="surveys-section-header">
            <span>Eligible Projects
              <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(0)</span>
            </span>
            ${(typeof can === 'function' && can('manage_templates')) ? `<button class="btn-small" onclick="openSurveyTemplateEditor('questions')" style="font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;padding:3px 8px">✏ Edit Templates</button>` : ''}
          </div>
          <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
            No eligible projects right now. A project becomes eligible once it's marked test-complete and all tasks are done.
          </div>
        </div>`;
    }

    const rows = _eligible.map(renderEligibleRow).join('');
    const previewDisabled = localStorage.getItem(PREVIEW_SKIP_KEY) === '1';
    const previewLink = previewDisabled
      ? `<button class="btn-small" onclick="surveysReenablePreview()" style="font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;padding:3px 8px">🔍 Re-enable preview</button>`
      : '';
    const editTplBtn = (typeof can === 'function' && can('manage_templates'))
      ? `<button class="btn-small" onclick="openSurveyTemplateEditor('questions')" style="font-size:10px;font-weight:500;text-transform:none;letter-spacing:0;padding:3px 8px">✏ Edit Templates</button>`
      : '';
    return `
      <div class="surveys-section">
        <div class="surveys-section-header">
          <span>
            Eligible Projects
            <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(${_eligible.length})</span>
          </span>
          <span style="display:flex;gap:6px;align-items:center;">${previewLink}${editTplBtn}</span>
        </div>
        <table class="surveys-table">
          <thead><tr>
            <th>Job</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Test Complete</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderEligibleRow(e) {
    const sendBtn = e.hasEmail
      ? `<button class="btn-small btn-primary" onclick="surveysSendForProject('${e.project.id}')" style="margin-left:6px">Send</button>`
      : `<button class="btn-small" disabled title="No contact email on file — edit the project first" style="margin-left:6px;opacity:0.5;cursor:not-allowed">Send</button>`;

    // Optional notice line(s) under project name.
    const notices = [];
    if (e.priorAttempt) {
      notices.push(`<span style="color:var(--muted);font-size:10.5px" title="A previous survey was sent ${e.priorAttempt.days} days ago and never completed">↺ Previously sent ${e.priorAttempt.days} days ago, no reply</span>`);
    }
    if (e.recentWarning) {
      notices.push(`<span style="color:var(--amber);font-size:10.5px;font-weight:500" title="The same contact received a survey for a different project ${e.recentWarning.days} days ago — review before sending">✋ Same contact surveyed ${e.recentWarning.days} days ago</span>`);
    }
    const noticesHtml = notices.length
      ? `<div style="margin-top:3px;line-height:1.4">${notices.join(' &nbsp;·&nbsp; ')}</div>`
      : '';

    return `
      <tr>
        <td>
          <a onclick="selectProjectById('${e.project.id}')" style="color:var(--blue);cursor:pointer;text-decoration:none;font-weight:600" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Open project">${escapeHtml(e.project.name)}</a>
          ${noticesHtml}
        </td>
        <td>${escapeHtml(e.contactName)}</td>
        <td>${escapeHtml(e.contactEmail || '—')}</td>
        <td>${fmtDate(e.info?.testcompleteDate)}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn-small" onclick="surveysSkipProject('${e.project.id}')">Skip</button>
          ${sendBtn}
        </td>
      </tr>`;
  }

  function renderSentHTML() {
    if (!_sent.length) return '';
    const rows = _sent.map(r => `
      <tr>
        <td><a onclick="selectProjectById('${r.project_id}')" style="color:var(--blue);cursor:pointer;text-decoration:none;font-weight:600" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Open project">${escapeHtml(r.project_name)}</a></td>
        <td>${escapeHtml(r.contact_name || '—')}</td>
        <td>${escapeHtml(r.contact_email || '')}</td>
        <td>${fmtDate(r.sent_at)}</td>
        <td>${daysSince(r.sent_at)} days</td>
      </tr>`).join('');
    return `
      <div class="surveys-section">
        <div class="surveys-section-header">
          Sent
          <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(${_sent.length})</span>
        </div>
        <table class="surveys-table">
          <thead><tr><th>Job</th><th>Contact</th><th>Email</th><th>Sent</th><th>Awaiting</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderCompletedHTML() {
    if (!_completed.length) return '';

    // Group by year of completed_at (newest first).
    const byYear = {};
    _completed.forEach(r => {
      const y = r.completed_at ? new Date(r.completed_at).getFullYear() : 'Unknown';
      if (!byYear[y]) byYear[y] = [];
      byYear[y].push(r);
    });
    const years = Object.keys(byYear).sort((a, b) => String(b).localeCompare(String(a)));
    const currentYear = String(new Date().getFullYear());

    const tableHeader = `
      <thead><tr><th>Job</th><th>Contact</th><th>Completed</th><th>NPS</th><th>Avg</th><th>Follow-up</th></tr></thead>`;

    let groupsHtml = '';
    if (years.length === 1) {
      // Single year — render the table without a year header.
      const rows = byYear[years[0]].map(renderCompletedRow).join('');
      groupsHtml = `<table class="surveys-table">${tableHeader}<tbody>${rows}</tbody></table>`;
    } else {
      // Multiple years — collapsible section per year. Current year expanded;
      // older years require a click to expand (unless previously toggled).
      groupsHtml = years.map(y => {
        const items = byYear[y];
        const isCurrent = String(y) === currentYear;
        const expanded = isCurrent || _expandedYears.has(String(y));
        const arrow = expanded ? '▾' : '▸';
        const tableHtml = expanded
          ? `<table class="surveys-table" style="margin-top:6px">${tableHeader}<tbody>${items.map(renderCompletedRow).join('')}</tbody></table>`
          : '';
        return `
          <div style="margin-bottom:14px">
            <button onclick="surveysToggleYear('${y}')"
                    style="background:none;border:none;color:var(--muted);font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:6px 0;cursor:pointer;font-family:inherit">
              ${arrow} ${escapeHtml(String(y))} <span style="color:var(--muted);font-weight:400;letter-spacing:0">(${items.length})</span>
            </button>
            ${tableHtml}
          </div>`;
      }).join('');
    }

    return `
      <div class="surveys-section">
        <div class="surveys-section-header">
          Completed
          <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(${_completed.length})</span>
        </div>
        ${groupsHtml}
      </div>`;
  }

  function renderCompletedRow(r) {
    const resp = r.response || {};
    const npsCls = resp.nps_score >= 9 ? 'nps-promoter'
                 : resp.nps_score <= 6 ? 'nps-detractor'
                 : 'nps-passive';
    const nps = resp.nps_score != null
      ? `<span class="nps-pill ${npsCls}">${resp.nps_score}</span>`
      : '—';
    const avg = resp.avg_likert != null ? Number(resp.avg_likert).toFixed(2) : '—';
    const fu  = resp.follow_up_requested ? '<span style="color:var(--amber);font-weight:600">Yes</span>' : '—';
    return `
      <tr style="cursor:pointer" onclick="surveysOpenResponse('${r.id}')" title="Click to view full response">
        <td><a onclick="event.stopPropagation();selectProjectById('${r.project_id}')" style="color:var(--blue);cursor:pointer;text-decoration:none;font-weight:600" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'" title="Open project">${escapeHtml(r.project_name)}</a></td>
        <td>${escapeHtml(r.contact_name || '—')}</td>
        <td>${fmtDate(r.completed_at)}</td>
        <td>${nps}</td>
        <td>${avg}</td>
        <td>${fu}</td>
      </tr>`;
  }

  function renderSkippedToggleHTML() {
    const count = _skipped.length;
    const label = _showSkipped ? 'Hide skipped' : 'Show skipped';
    const arrow = _showSkipped ? '▾' : '▸';

    let html = `
      <div class="surveys-section" style="margin-top:8px">
        <div style="text-align:right">
          <button class="btn-small" onclick="surveysToggleShowSkipped()">
            ${arrow} ${label}${count ? ` (${count})` : ''}
          </button>
        </div>`;

    if (_showSkipped) {
      if (!count) {
        html += `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-top:10px">
          No skipped projects.
        </div>`;
      } else {
        const rows = _skipped.map(s => `
          <tr>
            <td><strong>${escapeHtml(s.project.name)}</strong></td>
            <td>${fmtDate(s.info?.testcompleteDate)}</td>
            <td style="text-align:right">
              <button class="btn-small" onclick="surveysUnskipProject('${s.project.id}')">Unskip</button>
            </td>
          </tr>`).join('');
        html += `
          <table class="surveys-table" style="margin-top:10px">
            <thead><tr><th>Job</th><th>Test Complete</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }
    }

    html += `</div>`;
    return html;
  }


  // ── Actions: Send ─────────────────────────────────────────────────────────

  // Click Send on an Eligible row.
  // 1. Build payload + INSERT a 'queued' invitation row.
  // 2. If preview is enabled (default), call edge function preview action and
  //    show the modal with rendered email content. User confirms or cancels.
  //    If preview is disabled (user opted out), skip straight to send.
  // 3. On confirmed send: call edge function send action. Success → status
  //    flips to 'sent', refresh. Failure → DELETE the row, refresh.
  // 4. On cancel: DELETE the inserted row, refresh.
  window.surveysSendForProject = async function (projectId) {
    if (!projectId) return;
    const eligible = _eligible.find(e => e.project.id === projectId);
    if (!eligible) {
      toast('Project no longer eligible — refreshing.');
      loadAndRender();
      return;
    }
    if (!eligible.hasEmail) {
      toast('No valid contact email on file. Edit the project first.');
      return;
    }

    let newInvitationId = null;
    try {
      // Build the invitation payload.
      const payload = await buildInvitationPayload(eligible);
      if (!payload) {
        toast('Could not build invitation — missing active template?');
        return;
      }

      // Insert the row.
      const { data: inserted, error: insErr } = await sb
        .from('survey_invitations')
        .insert(payload)
        .select('id')
        .single();
      if (insErr) throw insErr;
      newInvitationId = inserted.id;

      // Branch on preview preference.
      const skipPreview = localStorage.getItem(PREVIEW_SKIP_KEY) === '1';
      if (skipPreview) {
        await actuallySend(newInvitationId, eligible);
      } else {
        // Fetch the rendered email and pop the preview modal.
        const { data: prev, error: prevErr } = await sb.functions.invoke('survey-send', {
          body: { action: 'preview', invitation_id: newInvitationId },
        });
        if (prevErr) throw prevErr;
        if (prev?.error) throw new Error(prev.error);

        _pendingSend = { invitationId: newInvitationId, eligible };
        showPreviewModal(prev);
      }

    } catch (e) {
      console.error('[surveys] send failed', e);
      // Roll back the inserted row so the project returns to Eligible.
      if (newInvitationId) {
        await sb.from('survey_invitations').delete().eq('id', newInvitationId);
      }
      _pendingSend = null;
      toast('Send failed: ' + (e.message || String(e)));
      loadAndRender();
    }
  };

  // Called either directly (when preview is skipped) or from the modal's
  // Send Now button (after user confirmation).
  async function actuallySend(invitationId, eligible) {
    toast('Sending survey…');
    try {
      const { data: sendResp, error: sendErr } = await sb.functions.invoke('survey-send', {
        body: { action: 'send', invitation_ids: [invitationId] },
      });
      if (sendErr) throw sendErr;

      const result = sendResp?.results?.[0];
      if (!result || !result.success) {
        const msg = result?.error || 'unknown error';
        throw new Error(msg);
      }

      toast(`✓ Survey sent to ${eligible.contactEmail}`);
      loadAndRender();
    } catch (e) {
      console.error('[surveys] send-confirm failed', e);
      // Roll back the row.
      await sb.from('survey_invitations').delete().eq('id', invitationId);
      toast('Send failed: ' + (e.message || String(e)));
      loadAndRender();
    }
  }


  // ── Preview modal ─────────────────────────────────────────────────────────

  function showPreviewModal(rendered) {
    // Build the modal markup dynamically and inject into body. Removed on
    // confirm or cancel.
    const overlay = document.createElement('div');
    overlay.id = 'surveyPreviewOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:24px';

    const modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
      'width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;' +
      'overflow:hidden;font-family:"DM Sans",sans-serif';

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:16px;font-weight:600;color:var(--text)">Preview Customer Survey</div>
        <button class="btn-small" onclick="surveysCancelPreview()" style="font-size:11px">Cancel</button>
      </div>
      <div style="padding:20px 24px;overflow-y:auto;flex:1">
        <div class="survey-preview-meta">
          <div class="survey-preview-meta-label">From</div><div>${escapeHtml(rendered.from || '')}</div>
          <div class="survey-preview-meta-label">To</div><div>${escapeHtml(rendered.to || '')}</div>
          <div class="survey-preview-meta-label">Reply-To</div><div>${escapeHtml(rendered.replyTo || '')}</div>
          <div class="survey-preview-meta-label">Subject</div><div style="font-weight:600">${escapeHtml(rendered.subject || '')}</div>
        </div>
        <div class="survey-preview-body">${escapeHtml(rendered.body || '')}</div>
      </div>
      <div style="padding:14px 24px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:14px">
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer">
          <input type="checkbox" id="previewSkipChk" style="margin:0">
          <span>Don't show preview again — just send</span>
        </label>
        <div style="display:flex;gap:8px">
          <button class="btn-small" onclick="surveysCancelPreview()">Cancel</button>
          <button class="btn-small btn-primary" onclick="surveysConfirmSend()">Send Now</button>
        </div>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function closePreviewModal() {
    const el = document.getElementById('surveyPreviewOverlay');
    if (el) el.remove();
  }

  window.surveysCancelPreview = async function () {
    closePreviewModal();
    if (!_pendingSend) return;
    const { invitationId } = _pendingSend;
    _pendingSend = null;
    // Roll back the inserted row so the project returns to Eligible.
    await sb.from('survey_invitations').delete().eq('id', invitationId);
    loadAndRender();
  };

  window.surveysConfirmSend = async function () {
    if (!_pendingSend) { closePreviewModal(); return; }
    // Capture the "don't show again" preference before tearing down the modal.
    const chk = document.getElementById('previewSkipChk');
    if (chk && chk.checked) {
      localStorage.setItem(PREVIEW_SKIP_KEY, '1');
    }
    const { invitationId, eligible } = _pendingSend;
    _pendingSend = null;
    closePreviewModal();
    await actuallySend(invitationId, eligible);
  };

  window.surveysReenablePreview = function () {
    localStorage.removeItem(PREVIEW_SKIP_KEY);
    toast('Preview re-enabled for next send.');
    renderAll();
  };


  // ── Response detail modal ─────────────────────────────────────────────────

  // Click a Completed row → fetch the full survey_responses row + the
  // invitation's template_snapshot, render answers next to question text.
  // Designed to be callable from anywhere (Surveys panel, client card,
  // closing report) — fetches all data fresh rather than relying on this
  // module's local _completed cache.
  window.surveysOpenResponse = async function (invitationId) {
    if (!invitationId) return;

    try {
      // Fetch invitation + response in parallel.
      const [{ data: inv, error: invErr }, { data: resp, error: respErr }] = await Promise.all([
        sb.from('survey_invitations')
          .select('id, status, contact_email, contact_name, sent_at, completed_at, expires_at, project_id, template_snapshot')
          .eq('id', invitationId).maybeSingle(),
        sb.from('survey_responses')
          .select('*')
          .eq('invitation_id', invitationId).maybeSingle(),
      ]);
      if (invErr)  throw invErr;
      if (respErr) throw respErr;
      if (!inv)    { toast('Survey not found.'); return; }
      if (!resp)   { toast('No response data found.'); return; }

      // Decorate with project_name from in-memory store.
      const proj = (typeof projects !== 'undefined' ? projects : [])
        .find(p => p.id === inv.project_id);
      const invitation = { ...inv, project_name: proj?.name || '—' };

      showResponseModal(invitation, resp, inv);
    } catch (e) {
      console.error('[surveys] open response failed', e);
      toast('Could not load response: ' + (e.message || String(e)));
    }
  };

  // Public alias — reports.js (closing report) and clients.js (Feedback tab)
  // call this name to avoid coupling to the "surveys*" naming convention.
  window.openSurveyResponseDetail = window.surveysOpenResponse;

  function showResponseModal(invitation, resp, inv) {
    const tpl = inv?.template_snapshot || {};
    const questions   = Array.isArray(tpl.questions) ? tpl.questions : [];
    const scaleMin    = tpl.scale_min != null ? tpl.scale_min : null;
    const scaleMax    = tpl.scale_max != null ? tpl.scale_max : null;
    const scaleLabels = Array.isArray(tpl.scale_labels) ? tpl.scale_labels : [];

    // Survey responses store per-question answers under various possible keys.
    // We try common shapes: resp.answers (object keyed by question id) or the
    // response columns directly. Fall back to "no answer recorded" gracefully.
    const answersMap = (resp.answers && typeof resp.answers === 'object') ? resp.answers : {};

    const npsCls = resp.nps_score >= 9 ? 'nps-promoter'
                 : resp.nps_score <= 6 ? 'nps-detractor'
                 : 'nps-passive';
    const nps = resp.nps_score != null
      ? `<span class="nps-pill ${npsCls}">${resp.nps_score}</span>`
      : '—';
    const avg = resp.avg_likert != null
      ? Number(resp.avg_likert).toFixed(2) + (scaleMax != null ? ` <span style="color:var(--muted);font-size:11px">/ ${scaleMax}</span>` : '')
      : '—';

    // Format a likert value as "5 / 5 — Excellent" using the scale_labels array.
    // scale_labels[0] corresponds to scale_min, last corresponds to scale_max.
    function formatLikert(val) {
      if (val == null || val === '' || isNaN(Number(val))) return null;
      const n = Number(val);
      let labelHtml = '';
      if (scaleLabels.length && scaleMin != null) {
        const idx = n - scaleMin;
        if (idx >= 0 && idx < scaleLabels.length && scaleLabels[idx]) {
          labelHtml = ` <span style="color:var(--muted);font-size:12px">— ${escapeHtml(String(scaleLabels[idx]))}</span>`;
        }
      }
      const denom = scaleMax != null
        ? ` <span style="color:var(--muted);font-size:12px">/ ${scaleMax}</span>`
        : '';
      return `<strong>${n}</strong>${denom}${labelHtml}`;
    }

    // Format an NPS value as "9 / 10 — Promoter" with a coloured pill.
    function formatNps(val) {
      if (val == null || val === '' || isNaN(Number(val))) return null;
      const n = Number(val);
      const cls = n >= 9 ? 'nps-promoter' : n <= 6 ? 'nps-detractor' : 'nps-passive';
      const lbl = n >= 9 ? 'Promoter' : n <= 6 ? 'Detractor' : 'Passive';
      return `<span class="nps-pill ${cls}">${n}</span> <span style="color:var(--muted);font-size:12px">/ 10 — ${lbl}</span>`;
    }

    // One-line scale legend shown above the question list, e.g.
    //   "Scale: 1 (Poor) – 2 (Fair) – 3 (Good) – 4 (Great) – 5 (Excellent)"
    let scaleLegend = '';
    if (scaleMin != null && scaleMax != null && scaleLabels.length) {
      const parts = [];
      for (let i = 0; i < scaleLabels.length; i++) {
        parts.push(`${scaleMin + i} (${escapeHtml(String(scaleLabels[i]))})`);
      }
      scaleLegend = `
        <div style="margin-bottom:14px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--muted);">
          <strong style="color:var(--text);font-weight:600">Scale:</strong> ${parts.join('  •  ')}
        </div>`;
    }

    // Render the per-question Q&A. Looks up each answer in resp.answers by
    // the question's id, falls back to checking top-level resp[id]. Format
    // varies by question type so a likert "5" reads as "5 / 5 — Excellent"
    // instead of a context-free number.
    const questionRows = questions.length ? questions.map(q => {
      const qid = q.id || q.key || '';
      const qType = (q.type || '').toLowerCase();
      let answer = answersMap[qid];
      if (answer == null) answer = resp[qid];

      let display;
      if (answer == null || answer === '') {
        display = '<span style="color:var(--muted);font-style:italic">No answer</span>';
      } else if (qType === 'likert') {
        display = formatLikert(answer) || escapeHtml(String(answer));
      } else if (qType === 'nps') {
        display = formatNps(answer) || escapeHtml(String(answer));
      } else if (typeof answer === 'object') {
        display = `<pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:11px;white-space:pre-wrap">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>`;
      } else {
        display = escapeHtml(String(answer));
      }

      return `
        <div style="padding:14px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">${escapeHtml(q.text || q.label || qid)}</div>
          <div style="font-size:14px;color:var(--text);line-height:1.5">${display}</div>
        </div>`;
    }).join('') : '<div style="padding:14px 0;color:var(--muted);font-style:italic">No question data on file for this response.</div>';

    // Render any "extra" fields on the response that aren't the headline
    // metrics or the questions/answers map. Things like nps_comment,
    // department_worked_with, free-text feedback — whatever your schema has.
    const knownKeys = new Set([
      'id', 'invitation_id', 'created_at', 'submitted_at',
      'nps_score', 'avg_likert', 'follow_up_requested', 'answers',
      ...questions.map(q => q.id || q.key || ''),
    ]);
    const extras = Object.keys(resp)
      .filter(k => !knownKeys.has(k) && resp[k] != null && resp[k] !== '')
      .map(k => {
        const val = typeof resp[k] === 'object'
          ? JSON.stringify(resp[k])
          : String(resp[k]);
        const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `
          <div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${escapeHtml(label)}</div>
            <div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(val)}</div>
          </div>`;
      }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'surveyResponseOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:24px';
    overlay.onclick = (e) => { if (e.target === overlay) closeResponseModal(); };

    const modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
      'width:100%;max-width:700px;max-height:90vh;display:flex;flex-direction:column;' +
      'overflow:hidden;font-family:"DM Sans",sans-serif';

    modal.innerHTML = `
      <div style="padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:16px;font-weight:600;color:var(--text)">${escapeHtml(invitation.project_name)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">${escapeHtml(invitation.contact_name || '—')} · ${escapeHtml(inv?.contact_email || invitation.contact_email || '')}</div>
        </div>
        <button class="btn-small" onclick="surveysCloseResponse()" style="font-size:11px">Close</button>
      </div>

      <div style="padding:16px 24px;background:var(--surface2);border-bottom:1px solid var(--border);display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">NPS</div>
          <div style="font-size:18px;font-weight:600">${nps}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Avg Score</div>
          <div style="font-size:18px;font-weight:600">${avg}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Follow-up</div>
          <div style="font-size:14px;font-weight:600;color:${resp.follow_up_requested ? 'var(--amber)' : 'var(--muted)'}">${resp.follow_up_requested ? 'Yes' : 'No'}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Completed</div>
          <div style="font-size:13px;font-weight:500">${fmtDate(invitation.completed_at)}</div>
        </div>
      </div>

      <div style="padding:6px 24px 24px;overflow-y:auto;flex:1">
        ${scaleLegend}
        ${questionRows}
        ${extras ? `<div style="margin-top:18px"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px">Other Fields</div>${extras}</div>` : ''}
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function closeResponseModal() {
    const el = document.getElementById('surveyResponseOverlay');
    if (el) el.remove();
  }

  window.surveysCloseResponse = closeResponseModal;


  // Build the row to insert into survey_invitations for a Send action.
  // Returns the insert payload, or null if active templates are missing.
  async function buildInvitationPayload(eligible) {
    const projectId = eligible.project.id;

    // Fetch contact_id from project_info (used as foreign key on the invitation).
    const { data: pi } = await sb.from('project_info')
      .select('contact_id')
      .eq('project_id', projectId)
      .maybeSingle();

    // Active templates (one survey + one email).
    const [{ data: tpl }, { data: etpl }] = await Promise.all([
      sb.from('survey_templates')
        .select('id, name, version, questions, scale_min, scale_max, scale_labels')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from('survey_email_templates')
        .select('id, name, subject, body_template, signature_emp_id')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!tpl || !etpl) {
      console.warn('[surveys] missing active template/email — cannot send');
      return null;
    }

    // Cryptographically random 48-char hex token for the public survey URL.
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    const token = Array.from(buf)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      project_id:        projectId,
      contact_id:        pi?.contact_id || null,
      contact_email:     eligible.contactEmail,
      contact_name:      eligible.contactName !== '—' ? eligible.contactName : null,
      template_id:       tpl.id,
      email_template_id: etpl.id,
      template_snapshot: {
        name: tpl.name, version: tpl.version, questions: tpl.questions,
        scale_min: tpl.scale_min, scale_max: tpl.scale_max, scale_labels: tpl.scale_labels,
      },
      email_snapshot: {
        name: etpl.name, subject: etpl.subject,
        body_template: etpl.body_template, signature_emp_id: etpl.signature_emp_id,
      },
      token,
      status:     'queued',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      queued_at:  new Date().toISOString(),
      queued_by:  (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee.id : null,
    };
  }


  // ── Actions: Skip / Unskip ────────────────────────────────────────────────

  window.surveysSkipProject = async function (projectId) {
    if (!projectId) return;
    try {
      const { error } = await sb.from('projects')
        .update({ skip_survey: true })
        .eq('id', projectId);
      if (error) throw error;

      // Update the in-memory cache so other panels reflect immediately.
      const p = (typeof projects !== 'undefined' ? projects : []).find(x => x.id === projectId);
      if (p) p.skip_survey = true;

      toast('Project skipped — will not be surveyed.');
      loadAndRender();
    } catch (e) {
      console.error('[surveys] skip failed', e);
      toast('Skip failed: ' + (e.message || e));
    }
  };

  window.surveysUnskipProject = async function (projectId) {
    if (!projectId) return;
    try {
      const { error } = await sb.from('projects')
        .update({ skip_survey: false })
        .eq('id', projectId);
      if (error) throw error;

      const p = (typeof projects !== 'undefined' ? projects : []).find(x => x.id === projectId);
      if (p) p.skip_survey = false;

      toast('✓ Restored — project is eligible again.');
      loadAndRender();
    } catch (e) {
      console.error('[surveys] unskip failed', e);
      toast('Unskip failed: ' + (e.message || e));
    }
  };

  window.surveysToggleShowSkipped = function () {
    _showSkipped = !_showSkipped;
    renderAll();
  };

  window.surveysToggleYear = function (year) {
    const y = String(year);
    if (_expandedYears.has(y)) _expandedYears.delete(y);
    else                        _expandedYears.add(y);
    renderAll();
  };


  // ════════════════════════════════════════════════════════════════════════
  // SURVEY TEMPLATE EDITOR
  // Edits survey_templates (questions JSONB + scale settings) and
  // survey_email_templates (subject + body + signature). Opened from
  // Setup → Templates → Customer Surveys card or from the ✏ Edit Templates
  // button in the Eligible header. Subgroup = 'questions' or 'email'.
  // ════════════════════════════════════════════════════════════════════════

  let _surveyTpls       = [];     // survey_templates rows
  let _emailTpls        = [];     // survey_email_templates rows
  let _currentTplId     = null;
  let _currentSubgroup  = 'questions';

  window.openSurveyTemplateEditor = async function (subgroup) {
    // Defense in depth: even if the button is hidden, refuse to open the
    // editor for users without the manage_templates permission. RLS on the
    // template tables is the ultimate gate, but failing fast here gives a
    // cleaner error than a save that silently 403s.
    if (typeof can === 'function' && !can('manage_templates')) {
      if (typeof toast === 'function') toast('You don\'t have permission to edit survey templates');
      return;
    }
    _currentSubgroup = (subgroup === 'email') ? 'email' : 'questions';
    _currentTplId = null;  // reset so loadSurveyTplData picks the active one
    if (!document.getElementById('surveyTplModal')) {
      createSurveyTplModal();
    }
    document.getElementById('surveyTplModal').classList.add('open');
    const body = document.getElementById('surveyTplBody');
    if (body) body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Loading…</div>';
    await loadSurveyTplData();
    renderSurveyTplEditor();
  };

  window.closeSurveyTplEditor = function () {
    const m = document.getElementById('surveyTplModal');
    if (m) m.classList.remove('open');
  };

  async function loadSurveyTplData() {
    const [qRes, eRes] = await Promise.all([
      sb.from('survey_templates')
        .select('id, name, version, questions, scale_min, scale_max, scale_labels, is_active, created_at')
        .order('created_at', { ascending: false }),
      sb.from('survey_email_templates')
        .select('id, name, subject, body_template, signature_emp_id, is_active, created_at')
        .order('created_at', { ascending: false }),
    ]);
    _surveyTpls = qRes.data || [];
    _emailTpls  = eRes.data || [];

    const list = (_currentSubgroup === 'email') ? _emailTpls : _surveyTpls;
    if (!_currentTplId || !list.find(t => t.id === _currentTplId)) {
      const active = list.find(t => t.is_active) || list[0];
      _currentTplId = active ? active.id : null;
    }
  }

  function createSurveyTplModal() {
    const html = `
      <div id="surveyTplModal" class="modal-backdrop" onclick="if(event.target===this) closeSurveyTplEditor()">
        <div class="modal" style="width:92%;max-width:1000px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
          <div class="modal-header">
            <div class="modal-title" id="surveyTplTitle">Edit Survey Templates</div>
            <button class="modal-close" onclick="closeSurveyTplEditor()">&#x2715;</button>
          </div>
          <div class="modal-body" id="surveyTplBody" style="flex:1;overflow-y:auto;padding:24px;"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderSurveyTplEditor() {
    const titleEl = document.getElementById('surveyTplTitle');
    const body    = document.getElementById('surveyTplBody');
    if (!body) return;
    if (_currentSubgroup === 'email') {
      if (titleEl) titleEl.textContent = 'Edit Survey Email Template';
      body.innerHTML = renderEmailTplBody();
    } else {
      if (titleEl) titleEl.textContent = 'Edit Survey Questions';
      body.innerHTML = renderQuestionsTplBody();
    }
  }

  function tplSelectorHTML(list, kind) {
    const opts = list.map(t => {
      const star = t.is_active ? ' (active)' : '';
      const sel  = (t.id === _currentTplId) ? 'selected' : '';
      return `<option value="${t.id}" ${sel}>${escapeHtml(t.name || 'Untitled')}${star}</option>`;
    }).join('');
    const tpl = list.find(t => t.id === _currentTplId);
    const isActive = tpl?.is_active;
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:end;">
        <div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Editing Template</div>
          <select onchange="surveyTplSwitch(this.value)" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;color:var(--text);font-family:inherit;outline:none;">${opts}</select>
        </div>
        <button onclick="surveyTplSetActive('${kind}')" ${isActive ? 'disabled' : ''} style="background:${isActive ? 'transparent' : 'var(--surface2)'};border:1px solid var(--border);border-radius:6px;padding:7px 12px;font-size:12px;color:${isActive ? 'var(--muted)' : 'var(--text)'};cursor:${isActive ? 'default' : 'pointer'};font-family:inherit;opacity:${isActive ? '0.5' : '1'};">${isActive ? '✓ Active' : 'Make Active'}</button>
        <button onclick="surveyTplDuplicate('${kind}')" style="background:var(--amber);border:none;border-radius:6px;padding:7px 12px;font-size:12px;color:var(--bg);font-weight:600;cursor:pointer;font-family:inherit;">+ Duplicate</button>
        <button onclick="surveyTplDelete('${kind}')" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:7px 12px;font-size:12px;color:var(--muted);cursor:pointer;font-family:inherit;">Delete</button>
      </div>`;
  }

  function autoSaveBannerHTML() {
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:14px;background:var(--amber-glow);border:1px solid var(--amber-dim);border-radius:6px;font-size:12px;color:var(--text);">
        <span style="font-size:14px;">💾</span>
        <span><strong>Changes save automatically</strong> when you click or tab out of a field.</span>
      </div>`;
  }

  function renderQuestionsTplBody() {
    if (!_surveyTpls.length) {
      return `<div style="text-align:center;padding:40px;color:var(--muted);">
        No survey question templates yet.
        <div style="margin-top:12px;"><button onclick="surveyTplCreateFirst('questions')" style="background:var(--amber);border:none;border-radius:6px;padding:8px 16px;color:var(--bg);font-weight:600;cursor:pointer;font-family:inherit;">+ Create First Template</button></div>
      </div>`;
    }
    const tpl = _surveyTpls.find(t => t.id === _currentTplId);
    if (!tpl) return '<div style="padding:40px;text-align:center;color:var(--muted);">Pick a template above.</div>';

    const questions = Array.isArray(tpl.questions) ? tpl.questions : [];
    const labels = Array.isArray(tpl.scale_labels) ? tpl.scale_labels.join(', ')
                 : (tpl.scale_labels || '');

    const inputCss = "width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;color:var(--text);font-family:inherit;outline:none;";
    const tinyLab  = "font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;";

    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;color:var(--muted);">Questions, scale, and labels for the public survey form. Existing responses keep their original snapshot — edits only affect future sends.</div>
      </div>
      ${autoSaveBannerHTML()}
      ${tplSelectorHTML(_surveyTpls, 'questions')}

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px;display:grid;grid-template-columns:2fr 80px 80px 2fr;gap:12px;align-items:end;">
        <div>
          <div style="${tinyLab}">Template Name</div>
          <input type="text" value="${escapeHtml(tpl.name || '')}" onchange="surveyTplUpdateField('${tpl.id}','questions','name',this.value)" style="${inputCss}">
        </div>
        <div>
          <div style="${tinyLab}">Scale Min</div>
          <input type="number" value="${tpl.scale_min ?? 1}" onchange="surveyTplUpdateField('${tpl.id}','questions','scale_min',parseInt(this.value)||0)" style="${inputCss}">
        </div>
        <div>
          <div style="${tinyLab}">Scale Max</div>
          <input type="number" value="${tpl.scale_max ?? 5}" onchange="surveyTplUpdateField('${tpl.id}','questions','scale_max',parseInt(this.value)||0)" style="${inputCss}">
        </div>
        <div>
          <div style="${tinyLab}">Labels (low → high, comma-separated)</div>
          <input type="text" value="${escapeHtml(labels)}" onchange="surveyTplUpdateLabels('${tpl.id}',this.value)" style="${inputCss}">
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Questions (${questions.length})</div>
        <button onclick="surveyTplAddQuestion('${tpl.id}')" style="background:var(--amber-glow);border:1px solid var(--amber);border-radius:6px;padding:5px 11px;font-size:12px;color:var(--text);cursor:pointer;font-family:inherit;">+ Add Question</button>
      </div>

      ${questions.length === 0
        ? '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">No questions yet. Click + Add Question.</div>'
        : questions.map((q, i) => renderQuestionRow(tpl.id, q, i, questions.length)).join('')
      }
    `;
  }

  function renderQuestionRow(tplId, q, idx, total) {
    const inputCss = "background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:13px;color:var(--text);font-family:inherit;outline:none;";
    const known = ['likert', 'text', 'nps'];
    const t = q.type || 'likert';
    const typeOpts = (known.includes(t) ? known : known.concat([t]))
      .map(x => `<option value="${x}" ${x === t ? 'selected' : ''}>${x}</option>`).join('');
    const text = q.text || q.label || '';
    const upDis   = (idx === 0);
    const downDis = (idx === total - 1);
    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;gap:10px;align-items:center;">
        <div style="display:flex;flex-direction:column;gap:2px;">
          <button onclick="surveyTplMoveQuestion('${tplId}',${idx},-1)" ${upDis ? 'disabled' : ''} title="Move up" style="background:transparent;border:1px solid var(--border);border-radius:4px;width:22px;height:18px;font-size:10px;color:var(--muted);cursor:${upDis ? 'not-allowed' : 'pointer'};opacity:${upDis ? '0.4' : '1'};font-family:inherit;padding:0;">▲</button>
          <button onclick="surveyTplMoveQuestion('${tplId}',${idx},1)"  ${downDis ? 'disabled' : ''} title="Move down" style="background:transparent;border:1px solid var(--border);border-radius:4px;width:22px;height:18px;font-size:10px;color:var(--muted);cursor:${downDis ? 'not-allowed' : 'pointer'};opacity:${downDis ? '0.4' : '1'};font-family:inherit;padding:0;">▼</button>
        </div>
        <span style="font-size:11px;color:var(--muted);min-width:24px;">Q${idx + 1}</span>
        <select onchange="surveyTplUpdateQuestion('${tplId}',${idx},'type',this.value)" style="${inputCss}width:90px;">${typeOpts}</select>
        <input type="text" value="${escapeHtml(text)}" onchange="surveyTplUpdateQuestion('${tplId}',${idx},'text',this.value)" style="${inputCss}flex:1;">
        <button onclick="surveyTplRemoveQuestion('${tplId}',${idx})" title="Delete this question" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:5px 9px;font-size:13px;color:var(--muted);cursor:pointer;font-family:inherit;">×</button>
      </div>`;
  }

  function renderEmailTplBody() {
    if (!_emailTpls.length) {
      return `<div style="text-align:center;padding:40px;color:var(--muted);">
        No email templates yet.
        <div style="margin-top:12px;"><button onclick="surveyTplCreateFirst('email')" style="background:var(--amber);border:none;border-radius:6px;padding:8px 16px;color:var(--bg);font-weight:600;cursor:pointer;font-family:inherit;">+ Create First Template</button></div>
      </div>`;
    }
    const tpl = _emailTpls.find(t => t.id === _currentTplId);
    if (!tpl) return '<div style="padding:40px;text-align:center;color:var(--muted);">Pick a template above.</div>';

    const inputCss = "width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:13px;color:var(--text);font-family:inherit;outline:none;";
    const tinyLab  = "font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;";

    // Signature employee dropdown — pulls from the global employees array
    const emps = (typeof employees !== 'undefined' ? employees : []).filter(e => e && e.active !== false);
    const empOpts = '<option value="">— None —</option>' + emps.map(e => {
      const name = `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.email || e.id;
      return `<option value="${e.id}" ${e.id === tpl.signature_emp_id ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    }).join('');

    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;color:var(--muted);">Subject and body of the email sent to customers when a survey is dispatched. Use <code>{{placeholder}}</code> syntax for dynamic values.</div>
      </div>
      ${autoSaveBannerHTML()}
      ${tplSelectorHTML(_emailTpls, 'email')}

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px;">
        <div style="${tinyLab}">Template Name</div>
        <input type="text" value="${escapeHtml(tpl.name || '')}" onchange="surveyTplUpdateField('${tpl.id}','email','name',this.value)" style="${inputCss}margin-bottom:14px;">

        <div style="${tinyLab}">Subject</div>
        <input type="text" value="${escapeHtml(tpl.subject || '')}" onchange="surveyTplUpdateField('${tpl.id}','email','subject',this.value)" style="${inputCss}margin-bottom:14px;">

        <div style="${tinyLab}">Body</div>
        <textarea onchange="surveyTplUpdateField('${tpl.id}','email','body_template',this.value)" style="${inputCss}min-height:240px;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;margin-bottom:14px;resize:vertical;">${escapeHtml(tpl.body_template || '')}</textarea>

        <div style="${tinyLab}">Signature Employee</div>
        <select onchange="surveyTplUpdateField('${tpl.id}','email','signature_emp_id',this.value || null)" style="${inputCss}">${empOpts}</select>
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:11px;color:var(--muted);line-height:1.6;">
        <div style="font-weight:600;color:var(--text);margin-bottom:4px;">Available placeholders</div>
        Substituted by the <code>survey-send</code> edge function. Common ones include <code>{{contactFirstName}}</code>, <code>{{contactFullName}}</code>, <code>{{projectName}}</code>, <code>{{clientName}}</code>, <code>{{senderName}}</code>, <code>{{surveyLink}}</code>. The exact set depends on what the edge function supports — verify with the preview modal before sending broadly.
      </div>
    `;
  }


  // ── Editor actions (window-exposed for inline onclicks) ────────────────────

  window.surveyTplSwitch = function (id) {
    _currentTplId = id;
    renderSurveyTplEditor();
  };

  window.surveyTplUpdateField = async function (id, kind, field, value) {
    const table = (kind === 'email') ? 'survey_email_templates' : 'survey_templates';
    try {
      const { error } = await sb.from(table).update({ [field]: value }).eq('id', id);
      if (error) throw error;
      const list = (kind === 'email') ? _emailTpls : _surveyTpls;
      const t = list.find(x => x.id === id);
      if (t) t[field] = value;
      toast('✓ Saved');
      // If name changed, the dropdown label needs refresh.
      if (field === 'name') renderSurveyTplEditor();
    } catch (e) {
      console.error('[surveys] template update failed', e);
      toast('Save failed: ' + (e.message || e));
    }
  };

  window.surveyTplUpdateLabels = function (id, raw) {
    const arr = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    surveyTplUpdateField(id, 'questions', 'scale_labels', arr);
  };

  window.surveyTplUpdateQuestion = async function (tplId, idx, field, value) {
    const t = _surveyTpls.find(x => x.id === tplId);
    if (!t) return;
    const qs = Array.isArray(t.questions) ? [...t.questions] : [];
    if (!qs[idx]) return;
    qs[idx] = { ...qs[idx], [field]: value };  // preserve all other fields
    try {
      const { error } = await sb.from('survey_templates').update({ questions: qs }).eq('id', tplId);
      if (error) throw error;
      t.questions = qs;
      toast('✓ Saved');
    } catch (e) {
      console.error('[surveys] question update failed', e);
      toast('Save failed: ' + (e.message || e));
    }
  };

  window.surveyTplAddQuestion = async function (tplId) {
    const t = _surveyTpls.find(x => x.id === tplId);
    if (!t) return;
    const qs = Array.isArray(t.questions) ? [...t.questions] : [];
    const newId = 'q_' + Date.now().toString(36);
    qs.push({ id: newId, type: 'likert', text: 'New question' });
    try {
      const { error } = await sb.from('survey_templates').update({ questions: qs }).eq('id', tplId);
      if (error) throw error;
      t.questions = qs;
      renderSurveyTplEditor();
      toast('✓ Question added');
    } catch (e) {
      console.error('[surveys] add question failed', e);
      toast('Save failed: ' + (e.message || e));
    }
  };

  window.surveyTplRemoveQuestion = async function (tplId, idx) {
    const t = _surveyTpls.find(x => x.id === tplId);
    if (!t) return;
    const qs = Array.isArray(t.questions) ? [...t.questions] : [];
    if (!qs[idx]) return;
    if (!confirm(`Delete question "${qs[idx].text || qs[idx].label || ''}"?`)) return;
    qs.splice(idx, 1);
    try {
      const { error } = await sb.from('survey_templates').update({ questions: qs }).eq('id', tplId);
      if (error) throw error;
      t.questions = qs;
      renderSurveyTplEditor();
      toast('✓ Question removed');
    } catch (e) {
      console.error('[surveys] remove question failed', e);
      toast('Delete failed: ' + (e.message || e));
    }
  };

  window.surveyTplMoveQuestion = async function (tplId, idx, dir) {
    const t = _surveyTpls.find(x => x.id === tplId);
    if (!t) return;
    const qs = Array.isArray(t.questions) ? [...t.questions] : [];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= qs.length) return;
    [qs[idx], qs[newIdx]] = [qs[newIdx], qs[idx]];
    try {
      const { error } = await sb.from('survey_templates').update({ questions: qs }).eq('id', tplId);
      if (error) throw error;
      t.questions = qs;
      renderSurveyTplEditor();
    } catch (e) {
      console.error('[surveys] reorder failed', e);
      toast('Save failed: ' + (e.message || e));
    }
  };

  window.surveyTplSetActive = async function (kind) {
    if (!_currentTplId) return;
    const table = (kind === 'email') ? 'survey_email_templates' : 'survey_templates';
    const list  = (kind === 'email') ? _emailTpls : _surveyTpls;
    const tpl   = list.find(t => t.id === _currentTplId);
    if (!tpl) return;
    if (tpl.is_active) { toast('Already active'); return; }
    try {
      // Deactivate any others that are currently active, then activate this one.
      const others = list.filter(t => t.is_active && t.id !== _currentTplId).map(t => t.id);
      if (others.length) {
        const { error: e1 } = await sb.from(table).update({ is_active: false }).in('id', others);
        if (e1) throw e1;
      }
      const { error: e2 } = await sb.from(table).update({ is_active: true }).eq('id', _currentTplId);
      if (e2) throw e2;
      list.forEach(t => { t.is_active = (t.id === _currentTplId); });
      renderSurveyTplEditor();
      toast('✓ Marked active');
    } catch (e) {
      console.error('[surveys] set active failed', e);
      toast('Save failed: ' + (e.message || e));
    }
  };

  window.surveyTplDuplicate = async function (kind) {
    if (!_currentTplId) return;
    const table = (kind === 'email') ? 'survey_email_templates' : 'survey_templates';
    const list  = (kind === 'email') ? _emailTpls : _surveyTpls;
    const src   = list.find(t => t.id === _currentTplId);
    if (!src) return;
    const copy = { ...src };
    delete copy.id;
    delete copy.created_at;
    copy.is_active = false;
    copy.name = (src.name || 'Untitled') + ' (copy)';
    try {
      const { data, error } = await sb.from(table).insert([copy]).select().single();
      if (error) throw error;
      list.unshift(data);
      _currentTplId = data.id;
      renderSurveyTplEditor();
      toast('✓ Duplicated');
    } catch (e) {
      console.error('[surveys] duplicate failed', e);
      toast('Duplicate failed: ' + (e.message || e));
    }
  };

  window.surveyTplDelete = async function (kind) {
    if (!_currentTplId) return;
    const table = (kind === 'email') ? 'survey_email_templates' : 'survey_templates';
    const list  = (kind === 'email') ? _emailTpls : _surveyTpls;
    const tpl   = list.find(t => t.id === _currentTplId);
    if (!tpl) return;

    if (list.length <= 1) {
      alert('Can\'t delete the only ' + (kind === 'email' ? 'email' : 'question') + ' template. Create another one first.');
      return;
    }

    // Delete protection: count survey_invitations referencing this template.
    const refField = (kind === 'email') ? 'email_template_id' : 'template_id';
    const { count, error: cntErr } = await sb.from('survey_invitations')
      .select('id', { count: 'exact', head: true })
      .eq(refField, _currentTplId);
    if (cntErr) {
      console.error('[surveys] delete-protection check failed', cntErr);
      toast('Couldn\'t verify references — aborting');
      return;
    }

    if (count && count > 0) {
      const deactivate = confirm(
        `This template was used by ${count} sent survey${count === 1 ? '' : 's'}.\n\n` +
        `Their snapshots still work, but deleting will leave the rows with a tombstone reference.\n\n` +
        `OK to deactivate instead (recommended). Cancel to actually delete.`
      );
      if (deactivate) {
        try {
          const { error } = await sb.from(table).update({ is_active: false }).eq('id', _currentTplId);
          if (error) throw error;
          tpl.is_active = false;
          renderSurveyTplEditor();
          toast('✓ Deactivated');
        } catch (e) {
          console.error('[surveys] deactivate failed', e);
          toast('Save failed: ' + (e.message || e));
        }
        return;
      }
      // else: fall through to hard delete
    }

    if (!confirm(`Permanently delete template "${tpl.name || 'Untitled'}"? This cannot be undone.`)) return;

    try {
      const { error } = await sb.from(table).delete().eq('id', _currentTplId);
      if (error) throw error;
      const idx = list.findIndex(t => t.id === _currentTplId);
      if (idx > -1) list.splice(idx, 1);
      // If the deleted one was the active one, promote first remaining to active.
      if (tpl.is_active && list.length && !list.some(t => t.is_active)) {
        const promote = list[0];
        const { error: pErr } = await sb.from(table).update({ is_active: true }).eq('id', promote.id);
        if (!pErr) promote.is_active = true;
      }
      _currentTplId = list[0]?.id || null;
      renderSurveyTplEditor();
      toast('✓ Deleted');
    } catch (e) {
      console.error('[surveys] delete failed', e);
      toast('Delete failed: ' + (e.message || e));
    }
  };

  window.surveyTplCreateFirst = async function (kind) {
    const table = (kind === 'email') ? 'survey_email_templates' : 'survey_templates';
    const list  = (kind === 'email') ? _emailTpls : _surveyTpls;
    const seed  = (kind === 'email')
      ? {
          name: 'Default',
          subject: 'How was your experience with NU Labs?',
          body_template: 'Hi {{contactFirstName}},\n\nThanks for working with NU Labs. We\'d love your feedback — it takes about a minute:\n\n{{surveyLink}}\n\nThanks,\n{{senderName}}',
          signature_emp_id: null,
          is_active: true
        }
      : {
          name: 'Standard v1',
          version: 1,
          questions: [
            { id: 'q1', type: 'likert', text: 'How would you rate the overall quality of work?' },
            { id: 'q2', type: 'likert', text: 'How would you rate communication during the project?' },
            { id: 'q3', type: 'text',   text: 'Any additional comments?' }
          ],
          scale_min: 1,
          scale_max: 5,
          scale_labels: ['Poor', 'Fair', 'Good', 'Great', 'Excellent'],
          is_active: true
        };
    try {
      const { data, error } = await sb.from(table).insert([seed]).select().single();
      if (error) throw error;
      list.unshift(data);
      _currentTplId = data.id;
      renderSurveyTplEditor();
      toast('✓ Created');
    } catch (e) {
      console.error('[surveys] create-first failed', e);
      toast('Create failed: ' + (e.message || e));
    }
  };


  // ════════════════════════════════════════════════════════════════════════
  // SIDEBAR BADGE
  // Shows the eligible-projects count on the navCustomerSurveys nav item.
  // Two entry points:
  //   - refreshSurveysBadge()  — async; called from auth.js after permissions
  //                               apply, and on app boot. Does its own slim
  //                               DB fetch since the surveys panel may not
  //                               have been opened yet.
  //   - _setSurveysBadgeCount(n) — sync helper; called from loadAndRender
  //                               where _eligible is already known so we
  //                               skip the redundant fetch.
  // ════════════════════════════════════════════════════════════════════════

  function _setSurveysBadgeCount(count) {
    const navItem = document.getElementById('navCustomerSurveys');
    const badge   = document.getElementById('surveysBadge');
    if (!navItem || !badge) return;
    if (typeof can === 'function' && !can('view_surveys')) {
      badge.style.display = 'none';
      return;
    }
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  window.refreshSurveysBadge = async function () {
    const navItem = document.getElementById('navCustomerSurveys');
    const badge   = document.getElementById('surveysBadge');
    if (!navItem || !badge) return;

    // Permission gate (defense in depth — auth.js also hides the nav item)
    if (typeof can === 'function' && !can('view_surveys')) {
      badge.style.display = 'none';
      return;
    }
    // Need the in-memory data structures. Bail if not loaded yet.
    if (typeof projects === 'undefined' || typeof projectInfo === 'undefined' ||
        typeof taskStore === 'undefined' || !sb) return;

    try {
      // Fetch only the invitations that BLOCK eligibility:
      // sent within last SENT_EXPIRY_DAYS, OR completed (we got feedback).
      const cutoff = new Date(Date.now() - SENT_EXPIRY_DAYS * 86400000).toISOString();
      const { data: invs, error } = await sb.from('survey_invitations')
        .select('project_id, status, sent_at')
        .or(`status.eq.completed,and(status.eq.sent,sent_at.gte.${cutoff})`);
      if (error) {
        console.error('[surveys] badge fetch failed', error);
        return;
      }
      const blocked = new Set((invs || []).map(i => i.project_id));

      // Apply the same eligibility logic as computeEligibleProjects, minus
      // the warning/priorAttempt decoration which we don't need for a count.
      const count = projects.filter(p => {
        const info = projectInfo[p.id] || {};
        if (!['testcomplete', 'complete'].includes(info.status)) return false;
        if (p.skip_survey) return false;
        if (blocked.has(p.id)) return false;
        const tasks = taskStore.filter(t => t.proj === p.id);
        const hasOpenTasks = tasks.some(t => !['complete', 'billed', 'cancelled'].includes(t.status));
        if (hasOpenTasks) return false;
        return true;
      }).length;

      _setSurveysBadgeCount(count);
    } catch (e) {
      console.error('[surveys] refreshSurveysBadge threw', e);
    }
  };


  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysSince(s) {
    if (!s) return '—';
    const ms = Date.now() - new Date(s).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
