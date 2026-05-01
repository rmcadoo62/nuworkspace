// NU Labs customer satisfaction survey — public-facing form logic
// Runs on the customer's browser. No auth required; token in URL is the auth.
// Single dependency: workspace's survey-public edge function.

(function () {

  // ── Config ──────────────────────────────────────────────────────────────
  const SUPABASE_URL = 'https://swuuxzmgmldvvomsgmjf.supabase.co';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/survey-public';

  // ── Boot ────────────────────────────────────────────────────────────────
  const root   = document.getElementById('surveyRoot');
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('t') || params.get('token');

  if (!token) {
    showMessage('No survey token provided. Please use the link from your email.');
    return;
  }

  fetchSurvey(token);

  // ── Network ─────────────────────────────────────────────────────────────
  async function fetchSurvey(tok) {
    try {
      const r = await fetch(`${FUNCTION_URL}?action=validate&token=${encodeURIComponent(tok)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) return showError(data.error || 'unknown');
      renderForm(tok, data);
    } catch (e) {
      console.error(e);
      showMessage('Could not load survey. Please try again later.');
    }
  }

  async function submitSurvey(tok, answers) {
    const r = await fetch(FUNCTION_URL + '?action=submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ token: tok, answers })
    });
    return r.json();
  }

  // ── UI states ───────────────────────────────────────────────────────────
  function showMessage(msg) {
    root.innerHTML = `<div class="message-card">${escapeHtml(msg)}</div>`;
  }

  function showError(code) {
    const m = {
      not_found:         'Survey link not recognized. Please use the link from your email.',
      expired:           'This survey link has expired.',
      already_completed: 'This survey has already been submitted. Thank you!',
      missing_token:     'No survey token provided.'
    };
    showMessage(m[code] || 'Survey could not be loaded. Please try again later.');
  }

  function showThanks() {
    root.innerHTML = `
      <div class="message-card thanks-card">
        <div class="icon">✓</div>
        <h2>Thank you</h2>
        <p>Your feedback has been submitted.<br>NU Laboratories appreciates your time.</p>
      </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Form rendering ──────────────────────────────────────────────────────
  function renderForm(tok, data) {
    const tpl       = data.template || {};
    const questions = tpl.questions || [];
    const ctx       = data.context  || {};

    let html = `
      <div class="survey-card">
        <div class="survey-header">
          <h1>NU Laboratories</h1>
          <div class="subtitle">Satisfaction Survey</div>
        </div>`;

    // Job context block — pre-filled from the project record
    const ctxRows = [];
    if (ctx.jobNumber) ctxRows.push(['Job',       ctx.jobNumber]);
    if (ctx.po)        ctxRows.push(['PO',        ctx.po]);
    if (ctx.testItem)  ctxRows.push(['Test item', ctx.testItem]);
    if (ctx.client)    ctxRows.push(['Company',   ctx.client]);
    if (ctxRows.length) {
      html += `<div class="context-box">${ctxRows.map(([k, v]) =>
        `<div class="context-row"><span class="context-label">${escapeHtml(k)}</span><span class="context-value">${escapeHtml(v)}</span></div>`
      ).join('')}</div>`;
    }

    html += `<p class="intro">As part of NU Laboratories' continuous improvement program, we'd appreciate your feedback on this job. It should take about 2 minutes.</p>`;
    html += `<div id="errorBanner"></div>`;

    // Questions — emit a "Please rate" header before the first likert run
    let inLikertSection = false;
    questions.forEach(q => {
      const isLikert = q.type === 'likert';
      if (isLikert && !inLikertSection) {
        html += `<div class="section-header">Please rate how well we met your expectations</div>`;
        inLikertSection = true;
      } else if (!isLikert) {
        inLikertSection = false;
      }
      html += renderQuestion(q, tpl);
    });

    html += `<button type="button" class="submit-btn" id="submitBtn">Submit feedback</button>`;
    html += `<div class="footer">NU Laboratories, Inc. · 312 Old Allerton Road, Annandale NJ</div>`;
    html += `</div>`;

    root.innerHTML = html;
    bindHandlers(tok, questions, ctx);
  }

  function renderQuestion(q, tpl) {
    const required = q.required ? '<span class="field-required">required</span>' : '';
    const labels   = (tpl && tpl.scale_labels) || ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'];

    if (q.type === 'likert') {
      return `
        <div class="likert-row" data-qid="${q.id}">
          <div class="likert-question">${escapeHtml(q.text)}${required}</div>
          <div class="likert-options">
            ${labels.map((lbl, i) => `
              <label class="likert-option" data-val="${i + 1}">
                <input type="radio" name="${q.id}" value="${i + 1}">
                <span>${escapeHtml(lbl)}</span>
              </label>`).join('')}
          </div>
        </div>`;
    }

    if (q.type === 'nps') {
      return `
        <div class="field" data-qid="${q.id}" data-type="nps">
          <label class="field-label">${escapeHtml(q.text)}${required}</label>
          <div class="nps-scale">
            ${[0,1,2,3,4,5,6,7,8,9,10].map(n => {
              const cls = n <= 6 ? 'detractor' : n <= 8 ? 'passive' : 'promoter';
              return `<div class="nps-cell ${cls}" data-val="${n}">${n}</div>`;
            }).join('')}
          </div>
          <div class="nps-labels">
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>
          <input type="hidden" name="${q.id}" value="">
        </div>`;
    }

    if (q.type === 'text') {
      const rows = q.rows || 2;
      return `
        <div class="field" data-qid="${q.id}">
          <label class="field-label">${escapeHtml(q.text)}${required}</label>
          <textarea name="${q.id}" rows="${rows}"></textarea>
        </div>`;
    }

    if (q.type === 'select') {
      // No fixed list yet — render as text input (department field is the typical case)
      return `
        <div class="field" data-qid="${q.id}">
          <label class="field-label">${escapeHtml(q.text)}${required}</label>
          <input type="text" name="${q.id}">
        </div>`;
    }

    if (q.type === 'checkbox') {
      return `
        <div class="field" data-qid="${q.id}">
          <label class="checkbox-row">
            <input type="checkbox" name="${q.id}">
            <span>${escapeHtml(q.text)}</span>
          </label>
        </div>`;
    }

    return '';
  }

  // ── Wire up clicks + submit ─────────────────────────────────────────────
  function bindHandlers(tok, questions, ctx) {

    // Pre-fill department if the template has a "dept" select and the project has one
    const deptInput = root.querySelector('input[name="dept"]');
    if (deptInput && ctx.department) deptInput.value = ctx.department;

    // Likert: clicking a tile selects the radio + visual state
    root.querySelectorAll('.likert-row').forEach(row => {
      row.querySelectorAll('.likert-option').forEach(opt => {
        opt.addEventListener('click', e => {
          e.preventDefault();
          row.querySelectorAll('.likert-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          const r = opt.querySelector('input');
          if (r) r.checked = true;
        });
      });
    });

    // NPS: clicking a number selects it
    root.querySelectorAll('[data-type="nps"]').forEach(field => {
      const hidden = field.querySelector('input[type="hidden"]');
      field.querySelectorAll('.nps-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          field.querySelectorAll('.nps-cell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          if (hidden) hidden.value = cell.dataset.val;
        });
      });
    });

    // Submit
    document.getElementById('submitBtn').addEventListener('click', async () => {
      const errBanner = document.getElementById('errorBanner');
      errBanner.innerHTML = '';

      const answers = collectAnswers(questions);
      const missing = questions.filter(q => {
        if (!q.required) return false;
        const v = answers[q.id];
        return v === '' || v === undefined || v === null;
      });

      if (missing.length) {
        errBanner.innerHTML = `<div class="error-banner">Please answer the required questions: ${missing.map(q => escapeHtml(q.text)).join('; ')}</div>`;
        errBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const result = await submitSurvey(tok, answers);
        if (result && result.error) {
          errBanner.innerHTML = `<div class="error-banner">${escapeHtml(result.error)}</div>`;
          btn.disabled = false;
          btn.textContent = 'Submit feedback';
          return;
        }
        showThanks();
      } catch (e) {
        console.error(e);
        errBanner.innerHTML = `<div class="error-banner">Submission failed. Please check your connection and try again.</div>`;
        btn.disabled = false;
        btn.textContent = 'Submit feedback';
      }
    });
  }

  function collectAnswers(questions) {
    const ans = {};
    questions.forEach(q => {
      if (q.type === 'likert') {
        const checked = root.querySelector(`input[name="${q.id}"]:checked`);
        ans[q.id] = checked ? parseInt(checked.value, 10) : null;
      } else if (q.type === 'nps') {
        const hidden = root.querySelector(`input[name="${q.id}"][type="hidden"]`);
        const v = hidden ? hidden.value : '';
        ans[q.id] = v !== '' ? parseInt(v, 10) : null;
      } else if (q.type === 'checkbox') {
        const cb = root.querySelector(`input[name="${q.id}"]`);
        ans[q.id] = !!(cb && cb.checked);
      } else {
        const el = root.querySelector(`[name="${q.id}"]`);
        ans[q.id] = el ? (el.value || '').trim() : '';
      }
    });
    return ans;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
