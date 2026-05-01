// js/surveys.js
// Customer Satisfaction Surveys — admin queue panel.
// Lives at Setup → Customer Surveys.
//
// Sends queued invitations via the survey-send edge function, displays sent
// and completed responses. Single-send opens an email preview modal first
// (with a "don't show again" toggle); batch send confirms count then fires.

(function () {

  const PREVIEW_SKIP_KEY = 'nuworkspace_survey_skip_preview';

  let _queue        = null;   // [{ id, status, contact_email, project_name, response, ... }]
  let _previewState = null;   // { ids, rendered }
  let _editState    = null;   // { invId }


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
      const { data: invs, error } = await sb
        .from('survey_invitations')
        .select('id, status, contact_email, contact_name, sent_at, queued_at, completed_at, expires_at, send_error, project_id')
        .order('queued_at', { ascending: false });
      if (error) throw error;

      // Decorate with project name from in-memory store
      const projMap = {};
      (typeof projects !== 'undefined' ? projects : []).forEach(p => { projMap[p.id] = p; });

      // Pull responses for completed invitations
      const completedIds = invs.filter(r => r.status === 'completed').map(r => r.id);
      const respMap = {};
      if (completedIds.length) {
        const { data: resps } = await sb
          .from('survey_responses')
          .select('invitation_id, nps_score, avg_likert, follow_up_requested')
          .in('invitation_id', completedIds);
        (resps || []).forEach(r => { respMap[r.invitation_id] = r; });
      }

      _queue = invs.map(r => ({
        ...r,
        project_name: projMap[r.project_id]?.name || '—',
        response:     respMap[r.id] || null,
      }));

      renderQueue();
    } catch (e) {
      console.error('loadQueue', e);
      body.innerHTML = `<div style="padding:24px;color:var(--red);font-size:13px">Error loading queue: ${escapeHtml(e.message || String(e))}</div>`;
    }
  }


  // ── Render ────────────────────────────────────────────────────────────────

  function renderQueue() {
    const body      = document.getElementById('surveyQueueBody');
    const queued    = _queue.filter(r => r.status === 'queued');
    const sent      = _queue.filter(r => r.status === 'sent');
    const completed = _queue.filter(r => r.status === 'completed');
    const sendable  = queued.filter(r => r.contact_email && r.contact_email.includes('@'));

    let html = `
      <div class="surveys-summary">
        <div class="surveys-stat">
          <div class="surveys-stat-label">Queued</div>
          <div class="surveys-stat-value">${queued.length}</div>
        </div>
        <div class="surveys-stat">
          <div class="surveys-stat-label">Sent</div>
          <div class="surveys-stat-value">${sent.length}</div>
        </div>
        <div class="surveys-stat">
          <div class="surveys-stat-label">Responses</div>
          <div class="surveys-stat-value">${completed.length}</div>
        </div>
      </div>`;

    if (queued.length) {
      html += `
        <div class="surveys-section">
          <div class="surveys-section-header">
            <span>Queued — ready to send</span>
            ${sendable.length ? `<button class="btn btn-primary" style="font-size:12px;padding:5px 14px" onclick="surveysSendAll()">Send all (${sendable.length})</button>` : ''}
          </div>
          <table class="surveys-table">
            <thead><tr><th>Job</th><th>Contact</th><th>Email</th><th>Queued</th><th></th></tr></thead>
            <tbody>${queued.map(renderQueuedRow).join('')}</tbody>
          </table>
        </div>`;
    }

    if (sent.length) {
      html += `
        <div class="surveys-section">
          <div class="surveys-section-header">Sent — awaiting response</div>
          <table class="surveys-table">
            <thead><tr><th>Job</th><th>Contact</th><th>Email</th><th>Sent</th><th>Expires</th></tr></thead>
            <tbody>${sent.map(renderSentRow).join('')}</tbody>
          </table>
        </div>`;
    }

    if (completed.length) {
      html += `
        <div class="surveys-section">
          <div class="surveys-section-header">Completed</div>
          <table class="surveys-table">
            <thead><tr><th>Job</th><th>Contact</th><th>Submitted</th><th>NPS</th><th>Avg</th><th>Follow-up</th></tr></thead>
            <tbody>${completed.map(renderCompletedRow).join('')}</tbody>
          </table>
        </div>`;
    }

    if (!queued.length && !sent.length && !completed.length) {
      html += `<div style="padding:48px;text-align:center;color:var(--muted)">No surveys yet.</div>`;
    }

    body.innerHTML = html;
  }

  function renderQueuedRow(r) {
    const hasEmail = r.contact_email && r.contact_email.includes('@');
    const emailDisplay = hasEmail
      ? escapeHtml(r.contact_email)
      : `<span style="color:var(--red)">— missing —</span>`;
    const errBadge = r.send_error
      ? `<div style="color:var(--red);font-size:11px;margin-top:2px">⚠ ${escapeHtml(r.send_error)}</div>`
      : '';
    return `
      <tr>
        <td><strong>${escapeHtml(r.project_name)}</strong></td>
        <td>${escapeHtml(r.contact_name || '—')}</td>
        <td>${emailDisplay}${errBadge}</td>
        <td>${fmtDate(r.queued_at)}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn-small" onclick="surveysEditRecipient('${r.id}')">Edit</button>
          ${hasEmail ? `<button class="btn-small btn-primary" onclick="surveysSendOne('${r.id}')" style="margin-left:6px">Send</button>` : ''}
        </td>
      </tr>`;
  }

  function renderSentRow(r) {
    return `
      <tr>
        <td><strong>${escapeHtml(r.project_name)}</strong></td>
        <td>${escapeHtml(r.contact_name || '—')}</td>
        <td>${escapeHtml(r.contact_email || '')}</td>
        <td>${fmtDate(r.sent_at)}</td>
        <td>${fmtDate(r.expires_at)}</td>
      </tr>`;
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
      <tr>
        <td><strong>${escapeHtml(r.project_name)}</strong></td>
        <td>${escapeHtml(r.contact_name || '—')}</td>
        <td>${fmtDate(r.completed_at)}</td>
        <td>${nps}</td>
        <td>${avg}</td>
        <td>${fu}</td>
      </tr>`;
  }


  // ── Send actions ──────────────────────────────────────────────────────────

  window.surveysSendOne = async function (invId) {
    const skipPreview = localStorage.getItem(PREVIEW_SKIP_KEY) === '1';
    if (skipPreview) {
      await actuallySend([invId]);
      return;
    }
    try {
      const { data, error } = await sb.functions.invoke('survey-send', {
        body: { action: 'preview', invitation_id: invId }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      _previewState = { ids: [invId], rendered: data };
      showPreviewModal(data);
    } catch (e) {
      console.error(e);
      toast('Preview failed: ' + (e.message || e));
    }
  };

  window.surveysSendAll = function () {
    const sendable = _queue.filter(r => r.status === 'queued' && r.contact_email && r.contact_email.includes('@'));
    if (!sendable.length) return;
    showConfirmModal(
      `Send ${sendable.length} survey email${sendable.length === 1 ? '' : 's'}? Each customer will receive their personalized survey link.`,
      () => actuallySend(sendable.map(r => r.id)),
      { title: 'Send all surveys', btnTxt: `Send ${sendable.length}`, color: 'var(--amber)', icon: '✉' }
    );
  };

  async function actuallySend(ids) {
    toast(`Sending ${ids.length} email${ids.length === 1 ? '' : 's'}…`);
    try {
      const { data, error } = await sb.functions.invoke('survey-send', {
        body: { action: 'send', invitation_ids: ids }
      });
      if (error) throw error;
      const results = data?.results || [];
      const ok   = results.filter(r => r.success).length;
      const fail = results.length - ok;
      if (fail === 0)      toast(`✓ Sent ${ok} survey${ok === 1 ? '' : 's'}`);
      else if (ok === 0)   toast(`⚠ All ${fail} sends failed`);
      else                 toast(`✓ Sent ${ok}, ${fail} failed`);
      loadAndRender();
    } catch (e) {
      console.error(e);
      toast('Send failed: ' + (e.message || e));
    }
  }


  // ── Preview modal ─────────────────────────────────────────────────────────

  function showPreviewModal(rendered) {
    document.getElementById('surveyPreviewSubject').textContent = rendered.subject;
    document.getElementById('surveyPreviewFrom').textContent    = rendered.from;
    document.getElementById('surveyPreviewTo').textContent      = rendered.to;
    document.getElementById('surveyPreviewReplyTo').textContent = rendered.replyTo;
    document.getElementById('surveyPreviewBody').textContent    = rendered.body;
    document.getElementById('surveyPreviewSkipChk').checked     = false;
    document.getElementById('surveyPreviewModal')?.classList.add('open');
  }

  window.surveysClosePreview = function () {
    document.getElementById('surveyPreviewModal')?.classList.remove('open');
    _previewState = null;
  };

  window.surveysConfirmSend = async function () {
    if (!_previewState) return;
    if (document.getElementById('surveyPreviewSkipChk').checked) {
      localStorage.setItem(PREVIEW_SKIP_KEY, '1');
    }
    const ids = _previewState.ids;
    surveysClosePreview();
    await actuallySend(ids);
  };


  // ── Edit recipient ────────────────────────────────────────────────────────

  window.surveysEditRecipient = function (invId) {
    const inv = _queue.find(r => r.id === invId);
    if (!inv) return;
    _editState = { invId };
    document.getElementById('surveyEditName').value  = inv.contact_name || '';
    document.getElementById('surveyEditEmail').value = inv.contact_email || '';
    document.getElementById('surveyEditModal')?.classList.add('open');
  };

  window.surveysCloseEditModal = function () {
    document.getElementById('surveyEditModal')?.classList.remove('open');
    _editState = null;
  };

  window.surveysSaveRecipient = async function () {
    if (!_editState) return;
    const name  = document.getElementById('surveyEditName').value.trim();
    const email = document.getElementById('surveyEditEmail').value.trim();
    try {
      const { error } = await sb.from('survey_invitations')
        .update({
          contact_name:  name  || null,
          contact_email: email || null,
        })
        .eq('id', _editState.invId);
      if (error) throw error;
      surveysCloseEditModal();
      loadAndRender();
      toast('✓ Recipient updated');
    } catch (e) {
      console.error(e);
      toast('Save failed: ' + (e.message || e));
    }
  };


  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

})();
