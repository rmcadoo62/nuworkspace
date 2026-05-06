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

  let _eligible  = [];   // [{ project, info, contactName, contactEmail, hasEmail }]
  let _sent      = [];   // [{ id, status, contact_*, sent_at, ..., project_name }]
  let _completed = [];   // [{ ...invitation, project_name, response }]
  let _skipped   = [];   // [{ project, info }]
  let _showSkipped = false;
  let _stats     = { avgScore: null, responseRate: null, eligibleCount: 0 };
  let _pendingSend = null;  // { invitationId, eligible } while preview modal is open

  const PREVIEW_SKIP_KEY = 'nuworkspace_survey_skip_preview';


  // ── Panel routing ─────────────────────────────────────────────────────────

  window.openSurveyQueuePanel = function () {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('navSetup')?.classList.add('active');
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
      // 1. Pull invitations with status 'sent' or 'completed'. The new model
      //    doesn't surface 'queued' or 'skipped' invitation rows — those are
      //    transient (queued during a Send call) or leftover from the old
      //    auto-queue model.
      const { data: invs, error: invErr } = await sb
        .from('survey_invitations')
        .select('id, status, contact_email, contact_name, sent_at, completed_at, expires_at, send_error, project_id, template_snapshot')
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

      // 3. Build a project lookup from the in-memory store. Decorates rows
      //    with project_name without an extra round trip.
      const projMap = {};
      (typeof projects !== 'undefined' ? projects : []).forEach(p => { projMap[p.id] = p; });

      // 4. Identify projects that already have any surfaced invitation (for
      //    filtering out of the Eligible list).
      const projectsWithInvitation = new Set(invs.map(r => r.project_id));

      // 5. Build the four display lists.
      _sent = invs.filter(r => r.status === 'sent').map(r => ({
        ...r,
        project_name: projMap[r.project_id]?.name || '—',
      }));
      _completed = invs.filter(r => r.status === 'completed').map(r => ({
        ...r,
        project_name: projMap[r.project_id]?.name || '—',
        response:     respMap[r.id] || null,
      }));

      _skipped = computeSkippedProjects(projMap);

      // 6. Eligible needs a fetch of project_info + contacts to display
      //    contact name/email per row.
      _eligible = await computeEligibleProjects(projectsWithInvitation);

      // 7. Compute the three top-of-panel stats.
      _stats = computeStats(_sent, _completed, _eligible);

      renderAll();
    } catch (e) {
      console.error('[surveys] load failed', e);
      body.innerHTML = `<div style="padding:24px;color:var(--red);font-size:13px">Error loading: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }


  // ── Eligible / Skipped computation ────────────────────────────────────────

  // Eligibility: project_info.status is 'testcomplete' or 'complete', AND
  // no tasks with status outside {complete, billed, cancelled}, AND
  // projects.skip_survey is not true, AND
  // no existing survey_invitations row for the project.
  //
  // The first three checks run against in-memory data. Contact-info
  // enrichment (for display) requires DB queries against project_info and
  // contacts.
  async function computeEligibleProjects(projectsWithInvitation) {
    if (typeof projects === 'undefined' || !projects.length) return [];

    const candidates = projects.filter(p => {
      if (p.skip_survey) return false;
      if (projectsWithInvitation.has(p.id)) return false;

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

    // Resolve each candidate's contact name + email. Contacts table wins
    // when contact_id is set; fall back to project_info.client_email.
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

      return {
        project: p,
        info,
        contactName: contactName || '—',
        contactEmail,
        hasEmail,
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
            Eligible Projects
            <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(0)</span>
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
    return `
      <div class="surveys-section">
        <div class="surveys-section-header">
          <span>
            Eligible Projects
            <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(${_eligible.length})</span>
          </span>
          ${previewLink}
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

    return `
      <tr>
        <td><strong>${escapeHtml(e.project.name)}</strong></td>
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
        <td><strong>${escapeHtml(r.project_name)}</strong></td>
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
    const rows = _completed.map(renderCompletedRow).join('');
    return `
      <div class="surveys-section">
        <div class="surveys-section-header">
          Completed
          <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(${_completed.length})</span>
        </div>
        <table class="surveys-table">
          <thead><tr><th>Job</th><th>Contact</th><th>Completed</th><th>NPS</th><th>Avg</th><th>Follow-up</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
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
        <td><strong>${escapeHtml(r.project_name)}</strong></td>
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
    const questions = Array.isArray(tpl.questions) ? tpl.questions : [];
    const scaleMax = tpl.scale_max != null ? tpl.scale_max : null;

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

    // Render the per-question Q&A. Looks up each answer in resp.answers by
    // the question's id, falls back to checking top-level resp[id].
    const questionRows = questions.length ? questions.map(q => {
      const qid = q.id || q.key || '';
      let answer = answersMap[qid];
      if (answer == null) answer = resp[qid];
      const display = (answer == null || answer === '')
        ? '<span style="color:var(--muted);font-style:italic">No answer</span>'
        : (typeof answer === 'object'
            ? `<pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:11px;white-space:pre-wrap">${escapeHtml(JSON.stringify(answer, null, 2))}</pre>`
            : escapeHtml(String(answer)));
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
