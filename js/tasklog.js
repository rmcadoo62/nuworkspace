// ============================================================================
// tasklog.js — Test Log for NUWorkspace (Phase A)
//
// Full-page, chatter-styled log scoped to a single task. Opened from the 📋
// button on a task row -> openTaskLogPanel(taskId) -> routes to #tasklog/{id}.
//
// Append-only: editing writes a NEW version (nothing is mutated or deleted);
// "delete" posts a version reading "ENTRY DELETED". Only the original author
// may edit/delete (also enforced by RLS).
//
// Each entry carries a technician-asserted EVENT time (when the thing
// happened — set via a roll-back slider, default "now") separate from the
// immutable record time (created_at). Display/order use event time.
//
// Media (non-CUI jobs only — gate is the project's cui flag): uploaded to the
// private 'task-logs' bucket, viewed via signed URLs. Images -> thumbnails +
// lightbox, video inline, PDFs via openPdfViewer, other files -> new tab.
//
// Depends only on existing globals: sb, currentUser, currentEmployee,
// employees, projects, taskStore, toast, openPdfViewer, selectProject,
// switchProjTab, routerPush. No new libraries.
// ============================================================================

(function () {
  'use strict';

  const BUCKET  = 'task-logs';
  const URL_TTL = 60 * 60;

  let S = null;
  function _freshState(taskId, task, project, isCui) {
    return {
      taskId, task, project, isCui,
      groups: [], editingGroupId: null,
      pending: [], signedByKey: {}, mediaByKey: {},
    };
  }

  // ---- utils ---------------------------------------------------------------
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function _nl2br(s) { return _esc(s).replace(/\r?\n/g, '<br>'); }

  function _fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  }
  function _fmtClock(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
  }

  function _authorName() {
    const emp = (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee : {};
    return emp.name || (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'User');
  }
  function _avatar(name) {
    let emp = null;
    if (typeof employees !== 'undefined' && Array.isArray(employees)) emp = employees.find(e => e.name === name) || null;
    const initials = (emp && emp.initials) ||
      (name ? name.trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() : '?');
    const color = (emp && emp.color) || '#888';
    return { initials, color };
  }

  function _kind(mime) {
    const m = (mime || '').toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m === 'application/pdf') return 'pdf';
    return 'file';
  }

  // datetime-local <-> Date helpers (local tz)
  function _toLocalInput(d) {
    const pad = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
      + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function _fromLocalInput(v) { const d = new Date(v); return isNaN(d) ? null : d; }

  // ---- styles (injected at load; row override must exist before any open) --
  (function _ensureStyles() {
    if (document.getElementById('tlogStyles')) return;
    const st = document.createElement('style');
    st.id = 'tlogStyles';
    st.textContent = `
      /* always-visible log icon on task rows (pencil stays hover-only) */
      .itt-row-actions{display:flex !important;}
      .itt-row-actions > button:not(.tlog-log-btn){display:none;}
      .itt-row:hover .itt-row-actions > button:not(.tlog-log-btn){display:inline-flex;}

      .tlog-page-head{display:flex;align-items:center;gap:14px;padding:16px 28px 12px;
        border-bottom:1px solid var(--border);flex-shrink:0;}
      .tlog-back{font-size:12.5px;color:var(--amber);cursor:pointer;white-space:nowrap;}
      .tlog-back:hover{text-decoration:underline;}
      .tlog-page-title{font-family:'DM Serif Display',serif;font-size:20px;color:var(--text);
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tlog-page-title .sub{font-family:'DM Sans',sans-serif;font-size:12.5px;color:var(--muted);font-weight:500;}

      .tlog-recorded{font-size:11px;color:var(--muted);}
      .tlog-conditions{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;margin:1px 0 4px;}
      .tlog-edited{font-size:11px;color:var(--amber);cursor:pointer;font-weight:600;}
      .tlog-history{margin-top:8px;border-left:3px solid var(--border);padding:4px 0 4px 12px;
        display:none;flex-direction:column;gap:8px;}
      .tlog-history.open{display:flex;}
      .tlog-hist-item{font-size:11.5px;color:var(--muted);}
      .tlog-hist-item .hbody{color:var(--text);margin-top:2px;line-height:1.5;word-break:break-word;}

      .tlog-thumb{width:120px;height:120px;border-radius:8px;object-fit:cover;cursor:pointer;
        border:1px solid var(--border);background:var(--surface2);}
      video.tlog-thumb{object-fit:cover;}

      .tlog-msg-text.deleted{font-style:italic;color:var(--red);}

      /* textarea must fill the flex wrap (a contenteditable div does this on its own) */
      #tlogTa{display:block;width:100%;box-sizing:border-box;}

      .tlog-dl-btn{font-size:11.5px;border:1px solid var(--border);background:var(--surface2);
        color:var(--muted);border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;}
      .tlog-dl-btn:hover{border-color:var(--amber-dim);color:var(--amber);}
      .tlog-pending-name{border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:11px;
        font-family:'DM Sans',sans-serif;color:var(--text);background:var(--surface);max-width:170px;}
      .tlog-pending-ext{font-size:11px;color:var(--muted);}

      .tlog-evt-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
        padding:0 0 10px 0;font-size:12px;color:var(--muted);}
      .tlog-evt-label{font-weight:600;color:var(--text);}
      .tlog-evt-display{font-family:'JetBrains Mono',monospace;color:var(--amber);min-width:120px;}
      .tlog-evt-slider{flex:1;min-width:140px;max-width:280px;accent-color:var(--amber);}
      .tlog-link{color:var(--amber);cursor:pointer;}
      .tlog-link:hover{text-decoration:underline;}
      .tlog-evt-manual{border:1.5px solid var(--border);border-radius:6px;padding:4px 8px;
        font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text);background:var(--surface2);}

      .tlog-editing-note{font-size:12px;color:var(--amber);font-weight:600;display:none;}
      .tlog-editing-note.show{display:inline;}
      .tlog-post-btn{font-size:13px;font-weight:700;border:none;background:var(--amber);
        color:#fff;border-radius:8px;padding:8px 18px;cursor:pointer;}
      .tlog-post-btn:disabled{opacity:.5;cursor:default;}
      .tlog-cui-note{font-size:11.5px;color:var(--muted);font-style:italic;}

      .tlog-lightbox{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.85);
        display:flex;align-items:center;justify-content:center;cursor:zoom-out;}
      .tlog-lightbox img{max-width:92vw;max-height:92vh;border-radius:8px;}
      .tlog-spinner{width:26px;height:26px;border:3px solid var(--border);
        border-top-color:var(--amber);border-radius:50%;animation:tlogspin .8s linear infinite;margin:40px auto;}
      @keyframes tlogspin{to{transform:rotate(360deg);}}
    `;
    document.head.appendChild(st);
  })();

  // ---- open panel -----------------------------------------------------------
  function openTaskLogPanel(taskId) {
    if (typeof sb === 'undefined' || !sb) { if (typeof toast==='function') toast('⚠ Not connected'); return; }
    const task = (typeof taskStore !== 'undefined' ? taskStore : []).find(t => t._id === taskId) || { name:'Task' };
    const project = (typeof projects !== 'undefined' ? projects : []).find(p => p.id === task.proj) || null;
    const isCui = ((project && project.cui) || '').toLowerCase() === 'yes';
    S = _freshState(taskId, task, project, isCui);

    // activate the panel (mirror openMyTasksPanel)
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (typeof activeProjectId !== 'undefined') activeProjectId = null;
    const tb = document.getElementById('topbarName'); if (tb) tb.textContent = S.task.name || 'Test Log';
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-tasklog'); if (panel) panel.classList.add('active');

    const projLabel = project ? `${project.emoji ? project.emoji + ' ' : ''}${project.name}` : '';
    const me = _avatar(_authorName());
    const wrap = document.getElementById('taskLogWrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="tlog-page-head">
        ${project ? `<span class="tlog-back" onclick="tlogBack()">← ${_esc(projLabel)}</span>` : ''}
        <div class="tlog-page-title">📋 Test Log <span class="sub">· ${_esc(S.task.name)}</span></div>
        <span style="flex:1"></span>
        <button class="tlog-dl-btn" onclick="tlogExport('task')" title="Download this task's log + photos as a ZIP">⬇ This task</button>
        <button class="tlog-dl-btn" onclick="tlogExport('job')" title="Download the whole job's logs + photos as a ZIP">⬇ Whole job</button>
      </div>
      <div class="chatter-composer" id="tlogComposer">
        <div class="tlog-evt-row">
          <span class="tlog-evt-label">Event time:</span>
          <span class="tlog-evt-display" id="tlogEvtDisplay">now</span>
          <input type="range" min="0" max="60" value="0" class="tlog-evt-slider" id="tlogEvtSlider" oninput="tlogEvtSlide(this.value)">
          <span>roll back up to 1 hr · <span class="tlog-link" onclick="tlogEvtManualToggle()">set manually</span></span>
          <input type="datetime-local" class="tlog-evt-manual" id="tlogEvtManual" style="display:none" onchange="tlogEvtManualChange()">
        </div>
        <div class="chatter-composer-top">
          <div class="chatter-avatar-self" style="background:${me.color}">${_esc(me.initials)}</div>
          <div class="chatter-input-wrap">
            <textarea class="chatter-input" id="tlogTa" placeholder="Add a log entry…"></textarea>
          </div>
        </div>
        <div class="chatter-composer-actions">
          <span class="tlog-editing-note" id="tlogEditNote">Editing your entry — saving adds a new version. <span class="tlog-link" onclick="tlogCancelEdit()">cancel</span></span>
          ${S.isCui
            ? `<span class="tlog-cui-note">🛑 Attachments disabled on CUI-flagged jobs (Phase A) — text only.</span>`
            : `<span class="chatter-attach-btn" title="Attach" onclick="document.getElementById('tlogFile').click()">📎</span>
               <input type="file" id="tlogFile" multiple style="display:none"
                 accept="image/*,video/*,application/pdf,text/plain,text/csv,.csv,.txt" onchange="tlogAttachChange(this)">
               <div class="chatter-attachments-preview" id="tlogPending"></div>`}
          <span style="flex:1"></span>
          <button class="tlog-post-btn" id="tlogPostBtn" onclick="tlogPost()">Post</button>
        </div>
      </div>
      <div class="chatter-feed" id="tlogFeed"><div class="tlog-spinner"></div></div>`;

    _loadEntries(); // hash push is handled by the router hook on openTaskLogPanel
  }

  function tlogBack() {
    const projId = S && S.project && S.project.id;
    if (projId && typeof selectProject === 'function') {
      selectProject(projId);
      if (typeof switchProjTab === 'function') setTimeout(() => switchProjTab('sub-tasks'), 120);
    } else {
      const home = document.getElementById('navHome'); if (home) home.click();
    }
  }

  // ---- load + render --------------------------------------------------------
  async function _loadEntries() {
    const feed = document.getElementById('tlogFeed');
    try {
      const { data: rows, error } = await sb
        .from('task_log_entries')
        .select('id, entry_group_id, version, body, author_id, author_name, created_at, event_at, lab_conditions')
        .eq('task_id', S.taskId)
        .order('entry_group_id', { ascending: true })
        .order('version', { ascending: true });
      if (error) throw error;

      const map = new Map();
      (rows || []).forEach(r => { if (!map.has(r.entry_group_id)) map.set(r.entry_group_id, []); map.get(r.entry_group_id).push(r); });

      const ids = (rows || []).map(r => r.id);
      let media = [];
      if (ids.length) { const { data: m } = await sb.from('task_log_media').select('*').in('entry_id', ids); media = m || []; }
      const idToGroup = {}; (rows || []).forEach(r => { idToGroup[r.id] = r.entry_group_id; });
      const mediaByGroup = {};
      media.forEach(mm => { const g = idToGroup[mm.entry_id]; if (!g) return;
        (mediaByGroup[g] = mediaByGroup[g] || []).push(mm); S.mediaByKey[mm.object_key] = mm; });

      S.groups = Array.from(map.values()).map(versions => {
        const current = versions[versions.length - 1];
        return {
          groupId: versions[0].entry_group_id, versions, current,
          eventAt: current.event_at || current.created_at,
          ownerId: versions[0].author_id,
          labConditions: (versions[0] && versions[0].lab_conditions) || null,
          media: mediaByGroup[versions[0].entry_group_id] || [],
        };
      }).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt)); // newest first, like chatter

      const previewKeys = [];
      S.groups.forEach(g => g.media.forEach(mm => { const k = _kind(mm.mime_type); if (k==='image'||k==='video') previewKeys.push(mm.object_key); }));
      if (previewKeys.length) {
        try {
          const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(previewKeys, URL_TTL);
          (signed || []).forEach(s => { if (s && s.signedUrl && !s.error) S.signedByKey[s.path] = s.signedUrl; });
        } catch (_) {}
      }
      _renderEntries();
    } catch (err) {
      if (feed) feed.innerHTML = `<div class="chatter-empty"><div class="chatter-empty-icon">⚠</div>Could not load the log.<br><span style="font-size:11px">${_esc(err.message || err)}</span></div>`;
    }
  }

  function _renderEntries() {
    const feed = document.getElementById('tlogFeed');
    if (!feed) return;
    if (!S.groups.length) {
      feed.innerHTML = `<div class="chatter-empty"><div class="chatter-empty-icon">📋</div>No entries yet. Add the first log entry below.</div>`;
      return;
    }
    const myId = currentUser && currentUser.id;
    let _lastDate = '';
    feed.innerHTML = S.groups.map(g => {
      const c = g.current;
      const isDeleted = (c.body || '').trim() === 'ENTRY DELETED';
      const isMine = myId && g.ownerId === myId;
      const edited = g.versions.length > 1;
      const av = _avatar(c.author_name);
      const histId = 'hist_' + g.groupId;

      // event time is the headline; show record time only if it differs notably
      const evt = g.eventAt;
      const rec = c.created_at;
      const showRec = evt && rec && Math.abs(new Date(rec) - new Date(evt)) > 90 * 1000;

      // lab conditions stamped on the original entry (SensorPush, via cache)
      let condHtml = '';
      const lc = g.labConditions;
      if (lc) {
        const bits = [];
        if (lc.temp != null)     bits.push(`${Number(lc.temp).toFixed(1)}°F`);
        if (lc.humidity != null) bits.push(`${Number(lc.humidity).toFixed(0)}% RH`);
        let label = bits.join(' · ');
        if (lc.sensor) label += (label ? ' · ' : '') + lc.sensor;
        // if the reading was sampled well away from the event time (e.g. a
        // rolled-back entry), surface the actual sample time so it's honest
        if (lc.sampled_at && evt && Math.abs(new Date(lc.sampled_at) - new Date(evt)) > 10 * 60 * 1000) {
          label += ` · sampled ${_fmtClock(lc.sampled_at)}`;
        }
        if (label) condHtml = `<div class="tlog-conditions">🌡 ${_esc(label)}</div>`;
      }

      const histHtml = edited ? `
        <div class="tlog-history" id="${histId}">
          ${g.versions.slice(0, -1).reverse().map(v => `
            <div class="tlog-hist-item">v${v.version} · ${_esc(v.author_name||'')} · ${_fmtDateTime(v.event_at || v.created_at)}
              <div class="hbody">${_nl2br(v.body)}</div></div>`).join('')}
        </div>` : '';

      const mediaHtml = g.media.length ? `<div class="chatter-msg-attachments">${g.media.map(_mediaHtml).join('')}</div>` : '';
      const actions = (isMine && !isDeleted) ? `
        <div class="chatter-msg-actions">
          <button class="chatter-action-btn" onclick="tlogStartEdit('${g.groupId}')">Edit</button>
          <button class="chatter-action-btn" onclick="tlogMarkDeleted('${g.groupId}')">Delete</button>
        </div>` : '';

      const _dStr = new Date(g.eventAt).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
      const _div = _dStr !== _lastDate ? `<div class="chatter-date-divider">${_dStr}</div>` : '';
      _lastDate = _dStr;
      return _div + `
        <div class="chatter-msg">
          <div class="chatter-msg-avatar" style="background:${av.color}">${_esc(av.initials)}</div>
          <div class="chatter-msg-body">
            <div class="chatter-msg-header">
              <span class="chatter-msg-name">${_esc(c.author_name || '')}</span>
              <span class="chatter-msg-time">${_fmtDateTime(evt)}</span>
              ${showRec ? `<span class="tlog-recorded">· logged ${_fmtClock(rec)}</span>` : ''}
              ${edited ? `<span class="tlog-edited" onclick="tlogToggleHistory('${histId}')">edited (${g.versions.length-1}) ▾</span>` : ''}
            </div>
            ${condHtml}
            <div class="chatter-msg-text tlog-msg-text ${isDeleted ? 'deleted' : ''}">${_nl2br(c.body)}</div>
            ${mediaHtml}
            ${histHtml}
            ${actions}
          </div>
        </div>`;
    }).join('');

    feed.querySelectorAll('[data-tlog-key]').forEach(el => {
      const url = S.signedByKey[el.getAttribute('data-tlog-key')];
      if (url) el.src = url;
    });
    feed.scrollTop = 0; // newest at top, like chatter
  }

  function _mediaHtml(m) {
    const k = _kind(m.mime_type); const key = _esc(m.object_key);
    if (k === 'image') return `<img class="tlog-thumb" data-tlog-key="${key}" alt="${_esc(m.filename)}" onclick="tlogOpenMedia('${key}')" title="${_esc(m.filename)}">`;
    if (k === 'video') return `<video class="tlog-thumb" data-tlog-key="${key}" controls preload="metadata" title="${_esc(m.filename)}"></video>`;
    if (k === 'pdf')   return `<span class="chatter-attach-chip" onclick="tlogOpenMedia('${key}')">📄 ${_esc(m.filename)}</span>`;
    return `<span class="chatter-attach-chip" onclick="tlogOpenMedia('${key}')">📎 ${_esc(m.filename)}</span>`;
  }

  // ---- media open -----------------------------------------------------------
  async function tlogOpenMedia(key) {
    const m = S.mediaByKey[key]; if (!m) return;
    const k = _kind(m.mime_type);
    if (k === 'pdf' && typeof openPdfViewer === 'function') {
      openPdfViewer({ bucket: BUCKET, path: m.object_key, filename: m.filename, title: m.filename }); return;
    }
    const url = S.signedByKey[key] || await _sign(key);
    if (!url) return;
    if (k === 'image') _openLightbox(url); else window.open(url, '_blank', 'noopener');
  }
  async function _sign(key) {
    try { const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, URL_TTL);
      if (data && data.signedUrl) { S.signedByKey[key] = data.signedUrl; return data.signedUrl; } } catch (_) {}
    return null;
  }
  function _openLightbox(url) {
    _closeLightbox();
    const lb = document.createElement('div'); lb.className = 'tlog-lightbox'; lb.id = 'tlogLightbox';
    lb.onclick = _closeLightbox; lb.innerHTML = `<img src="${_esc(url)}" alt="">`;
    document.body.appendChild(lb);
    document.addEventListener('keydown', _lbKey);
  }
  function _closeLightbox() { const el = document.getElementById('tlogLightbox'); if (el) el.remove(); document.removeEventListener('keydown', _lbKey); }
  function _lbKey(e) { if (e.key === 'Escape') _closeLightbox(); }

  // ---- event-time controls --------------------------------------------------
  function tlogEvtSlide(v) {
    const min = parseInt(v,10) || 0;
    const man = document.getElementById('tlogEvtManual');
    if (man) { man.style.display = 'none'; man.value = ''; } // slider takes precedence
    const disp = document.getElementById('tlogEvtDisplay');
    if (!disp) return;
    if (min === 0) disp.textContent = 'now';
    else disp.textContent = _fmtClock(new Date(Date.now() - min*60000).toISOString()) + ' (' + min + ' min ago)';
  }
  function tlogEvtManualToggle() {
    const man = document.getElementById('tlogEvtManual');
    const sl = document.getElementById('tlogEvtSlider');
    if (!man) return;
    if (man.style.display === 'none') {
      if (sl) sl.value = 0;
      man.value = _toLocalInput(new Date());
      man.style.display = '';
      tlogEvtManualChange();
    } else { man.style.display = 'none'; man.value = ''; tlogEvtSlide(0); }
  }
  function tlogEvtManualChange() {
    const man = document.getElementById('tlogEvtManual');
    const disp = document.getElementById('tlogEvtDisplay');
    if (!man || !disp || !man.value) return;
    const d = _fromLocalInput(man.value);
    disp.textContent = d ? _fmtDateTime(d.toISOString()) : 'now';
  }
  function _resolvedEventISO() {
    const man = document.getElementById('tlogEvtManual');
    if (man && man.style.display !== 'none' && man.value) {
      const d = _fromLocalInput(man.value); if (d) return d.toISOString();
    }
    const sl = document.getElementById('tlogEvtSlider');
    const min = sl ? (parseInt(sl.value,10) || 0) : 0;
    return new Date(Date.now() - min*60000).toISOString();
  }
  function _resetEventControls() {
    const sl = document.getElementById('tlogEvtSlider'); if (sl) sl.value = 0;
    const man = document.getElementById('tlogEvtManual'); if (man) { man.style.display = 'none'; man.value = ''; }
    tlogEvtSlide(0);
  }

  // ---- attachments ----------------------------------------------------------
  function _splitName(name){ const i=(name||'').lastIndexOf('.'); return (i>0)?{base:name.slice(0,i),ext:name.slice(i)}:{base:name||'file',ext:''}; }
  function tlogAttachChange(input) {
    Array.from(input.files || []).forEach(f => { const sp=_splitName(f.name); S.pending.push({ file:f, base:sp.base, ext:sp.ext }); });
    input.value=''; _renderPending();
  }
  function tlogRemovePending(i) { S.pending.splice(i,1); _renderPending(); }
  function tlogRenamePending(i, val) { if (S.pending[i]) S.pending[i].base = val; }
  function _renderPending() {
    const el = document.getElementById('tlogPending'); if (!el) return;
    el.innerHTML = S.pending.map((p,i) =>
      `<span class="chatter-preview-chip"><input class="tlog-pending-name" value="${_esc(p.base)}" oninput="tlogRenamePending(${i}, this.value)" title="Rename before posting">${p.ext ? `<span class="tlog-pending-ext">${_esc(p.ext)}</span>` : ''} <button onclick="tlogRemovePending(${i})">✕</button></span>`).join('');
  }

  // ---- edit mode ------------------------------------------------------------
  function tlogStartEdit(groupId) {
    const g = S.groups.find(x => x.groupId === groupId); if (!g) return;
    S.editingGroupId = groupId;
    const ta = document.getElementById('tlogTa'); if (ta) { ta.value = g.current.body; ta.focus(); }
    // carry forward the entry's event time via the manual field
    const man = document.getElementById('tlogEvtManual'), sl = document.getElementById('tlogEvtSlider');
    if (sl) sl.value = 0;
    if (man) { man.style.display=''; man.value = _toLocalInput(new Date(g.eventAt)); tlogEvtManualChange(); }
    const note = document.getElementById('tlogEditNote'); if (note) note.classList.add('show');
    const ta2 = document.getElementById('tlogTa'); if (ta2) ta2.scrollIntoView({ block:'nearest' });
  }
  function tlogCancelEdit() {
    S.editingGroupId = null;
    const ta = document.getElementById('tlogTa'); if (ta) ta.value = '';
    const note = document.getElementById('tlogEditNote'); if (note) note.classList.remove('show');
    _resetEventControls();
  }

  // ---- lab conditions (SensorPush, read from cache table) -------------------
  // EMI sensor applies ONLY to sales category 51 tasks; everything else (incl.
  // null/blank category) reads the High Bay sensor.
  function _sensorForTask(task) {
    const cat = String((task && task.salesCat) || '').trim();
    return cat === '51' ? 'EMI' : 'High Bay';
  }
  // Returns {sensor, temp, humidity, sampled_at} or null. Never throws — a
  // failure here must never block posting a log entry.
  async function _fetchLabConditions() {
    try {
      const sensor = _sensorForTask(S.task);
      const { data, error } = await sb
        .from('lab_conditions_latest')
        .select('sensor, temp, humidity, sampled_at')
        .eq('sensor', sensor)
        .maybeSingle();
      if (error || !data) return null;
      return { sensor: data.sensor, temp: data.temp, humidity: data.humidity, sampled_at: data.sampled_at };
    } catch (_) { return null; }
  }

  // ---- post / edit / delete -------------------------------------------------
  async function tlogPost() {
    const ta = document.getElementById('tlogTa'), btn = document.getElementById('tlogPostBtn');
    const text = (ta && ta.value || '').trim();
    if (!text && !S.pending.length) return;
    if (S.editingGroupId && !text) { if (typeof toast==='function') toast('⚠ Entry text required'); return; }
    const eventISO = _resolvedEventISO();
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }
    try {
      let row;
      if (S.editingGroupId) {
        const g = S.groups.find(x => x.groupId === S.editingGroupId);
        const { data, error } = await sb.from('task_log_entries').insert({
          task_id: S.taskId, entry_group_id: S.editingGroupId, version: (g ? g.current.version : 1) + 1,
          body: text, author_id: currentUser.id, author_name: _authorName(), event_at: eventISO,
        }).select('id, entry_group_id').single();
        if (error) throw error; row = data;
      } else {
        const lab = await _fetchLabConditions(); // null-safe; never blocks the post
        const ins = {
          task_id: S.taskId, version: 1, body: text,
          author_id: currentUser.id, author_name: _authorName(), event_at: eventISO,
        };
        if (lab) ins.lab_conditions = lab;
        const { data, error } = await sb.from('task_log_entries').insert(ins).select('id, entry_group_id').single();
        if (error) throw error; row = data;
      }
      if (!S.isCui && S.pending.length && row && row.id) { for (const p of S.pending) { await _uploadOne(p, row.id); } }
      S.pending = []; S.editingGroupId = null;
      if (ta) ta.value = '';
      const note = document.getElementById('tlogEditNote'); if (note) note.classList.remove('show');
      _renderPending(); _resetEventControls();
      await _loadEntries();
    } catch (err) {
      if (typeof toast === 'function') toast('⚠ ' + (err.message || 'Post failed')); else alert('Post failed: ' + (err.message || err));
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Post'; } }
  }

  async function tlogMarkDeleted(groupId) {
    if (!window.confirm('Mark this entry as deleted? The original stays in the version history.')) return;
    const g = S.groups.find(x => x.groupId === groupId); if (!g) return;
    try {
      const { error } = await sb.from('task_log_entries').insert({
        task_id: S.taskId, entry_group_id: groupId, version: g.current.version + 1,
        body: 'ENTRY DELETED', author_id: currentUser.id, author_name: _authorName(), event_at: g.eventAt,
      });
      if (error) throw error;
      await _loadEntries();
    } catch (err) { if (typeof toast === 'function') toast('⚠ ' + (err.message || 'Failed')); }
  }

  async function _uploadOne(p, entryId) {
    const file = p.file;
    const finalName = ((p.base || '').trim() || 'file') + (p.ext || '');
    const safe = finalName.replace(/[^\w.\-]+/g, '_');
    const key = `${S.taskId}/${entryId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(key, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await sb.from('task_log_media').insert({
      entry_id: entryId, bucket: BUCKET, object_key: key, filename: finalName, mime_type: file.type || null, size_bytes: file.size || null,
    });
    if (insErr) throw insErr;
  }

  function tlogToggleHistory(id) { const el = document.getElementById(id); if (el) el.classList.toggle('open'); }

  // ---- export (ZIP: oldest-first PDF log + original media files) -----------
  function _dlBlob(blob, name) {
    const u = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(u), 1500);
  }
  function _sanitize(s){ return String(s||'').replace(/[^\w.\- ]+/g,'_').replace(/\s+/g,'_').slice(0,80) || 'item'; }

  async function _fetchTaskEntries(taskId) {
    const { data: rows } = await sb.from('task_log_entries')
      .select('id, entry_group_id, version, body, author_name, created_at, event_at, lab_conditions')
      .eq('task_id', taskId).order('entry_group_id').order('version');
    const map = new Map();
    (rows||[]).forEach(r => { if (!map.has(r.entry_group_id)) map.set(r.entry_group_id, []); map.get(r.entry_group_id).push(r); });
    const ids = (rows||[]).map(r => r.id); let media = [];
    if (ids.length) { const { data:m } = await sb.from('task_log_media').select('*').in('entry_id', ids); media = m||[]; }
    const idToGroup = {}; (rows||[]).forEach(r => idToGroup[r.id] = r.entry_group_id);
    const mByG = {}; media.forEach(mm => { const g = idToGroup[mm.entry_id]; if (g) (mByG[g]=mByG[g]||[]).push(mm); });
    return Array.from(map.values()).map(vs => { const c = vs[vs.length-1];
      return { current:c, eventAt: c.event_at || c.created_at, labConditions: (vs[0] && vs[0].lab_conditions) || null, media: mByG[vs[0].entry_group_id] || [] }; })
      .sort((a,b) => new Date(a.eventAt) - new Date(b.eventAt));
  }

  function _blobToThumb(blob, maxW) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(blob); const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
        const w = Math.max(1, Math.round((img.naturalWidth || maxW) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || maxW) * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        try { c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
          resolve({ dataUrl: c.toDataURL('image/jpeg', 0.82), w, h }); }
        catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function _labLine(lc) {
    if (!lc) return '';
    const bits = [];
    if (lc.temp != null)     bits.push(Number(lc.temp).toFixed(1) + '\u00B0F');
    if (lc.humidity != null) bits.push(Number(lc.humidity).toFixed(0) + '% RH');
    let label = bits.join('  ');
    if (lc.sensor) label += (label ? ' \u00B7 ' : '') + lc.sensor;
    return label;
  }

  async function tlogExport(scope) {
    if (!window.JSZip) { if (typeof toast==='function') toast('\u26A0 ZIP library not loaded'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { if (typeof toast==='function') toast('\u26A0 PDF library not loaded'); return; }
    const tasks = (scope === 'job' && S.project)
      ? (typeof taskStore !== 'undefined' ? taskStore : []).filter(t => t.proj === S.project.id)
      : [S.task];
    if (!tasks.length) { if (typeof toast==='function') toast('Nothing to export'); return; }
    if (typeof toast === 'function') toast('Building bundle\u2026');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'letter' });
    const M = 54, PW = 612, PH = 792, CW = PW - 2*M; let y = M;
    const ensure = h => { if (y + h > PH - M) { doc.addPage(); y = M; } };
    const heading = (txt, size, gap) => { doc.setFont('helvetica','bold'); doc.setFontSize(size); doc.setTextColor(0); ensure(size + (gap||6)); doc.text(String(txt||''), M, y); y += size + (gap||6); };
    const para = (txt, size, color) => { doc.setFont('helvetica','normal'); doc.setFontSize(size); doc.setTextColor(color==null?0:color); (doc.splitTextToSize(String(txt||''), CW)).forEach(ln => { ensure(size+4); doc.text(ln, M, y); y += size+4; }); doc.setTextColor(0); };

    const zip = new JSZip();
    const jobName = (S.project && S.project.name) ? S.project.name : 'job';

    heading('Test Log', 20, 12);
    para('Job: ' + jobName, 11);
    para(scope === 'job' ? 'Scope: all tasks' : ('Task: ' + S.task.name), 11);
    para('Exported: ' + _fmtDateTime(new Date().toISOString()) + ' by ' + _authorName(), 10, 110);
    y += 10;

    let mediaCount = 0;
    try {
      for (const task of tasks) {
        const groups = await _fetchTaskEntries(task._id);
        if (scope === 'job') { y += 8; heading(task.name || 'Task', 14, 8); }
        if (!groups.length) { para('\u2014 no entries \u2014', 10, 130); continue; }

        const keys = []; groups.forEach(g => g.media.forEach(m => keys.push(m.object_key)));
        const signed = {};
        if (keys.length) { try { const { data } = await sb.storage.from(BUCKET).createSignedUrls(keys, URL_TTL);
          (data||[]).forEach(s => { if (s && s.signedUrl && !s.error) signed[s.path] = s.signedUrl; }); } catch (_) {} }

        const folder = (scope === 'job' ? _sanitize(task.name) + '/' : '') + 'photos/';
        let fileSeq = 0;

        for (const g of groups) {
          const c = g.current;
          if ((c.body || '').trim() === 'ENTRY DELETED') continue; // clean export omits deleted entries
          const recNote = (g.eventAt && c.created_at && Math.abs(new Date(c.created_at) - new Date(g.eventAt)) > 90000)
            ? '  (logged ' + _fmtClock(c.created_at) + ')' : '';
          doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0); ensure(14);
          doc.text((c.author_name || '') + ' \u2014 ' + _fmtDateTime(g.eventAt) + recNote, M, y); y += 14;
          const labLn = _labLine(g.labConditions);
          if (labLn) para('Lab conditions: ' + labLn, 9, 120);
          para(c.body || '', 11);

          for (const m of g.media) {
            const url = signed[m.object_key]; if (!url) continue;
            let blob = null; try { blob = await (await fetch(url)).blob(); } catch (_) {}
            if (!blob) continue;
            mediaCount++; fileSeq++;
            const safeName = String(fileSeq).padStart(2,'0') + '_' + _sanitize(m.filename);
            zip.file(folder + safeName, blob);
            if (_kind(m.mime_type) === 'image') {
              const thumb = await _blobToThumb(blob, 220);
              if (thumb) { ensure(thumb.h + 16); doc.addImage(thumb.dataUrl, 'JPEG', M, y, thumb.w, thumb.h); y += thumb.h + 2; }
              para(m.filename, 8, 120);
            } else { para('File: ' + m.filename, 9, 120); }
          }
          y += 8;
        }
      }

      const stamp = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const base = 'TestLog_' + _sanitize(jobName) + '_' + (scope === 'job' ? 'ALL' : _sanitize(S.task.name)) + '_' + stamp;
      zip.file(base + '.pdf', doc.output('blob'));
      const out = await zip.generateAsync({ type:'blob' });
      _dlBlob(out, base + '.zip');
      if (typeof toast === 'function') toast('\u2713 Downloaded (' + mediaCount + ' file' + (mediaCount===1?'':'s') + ')');
    } catch (err) {
      if (typeof toast === 'function') toast('\u26A0 Export failed: ' + (err.message || err));
    }
  }

  // ---- expose ---------------------------------------------------------------
  window.openTaskLogPanel  = openTaskLogPanel;
  window.tlogBack          = tlogBack;
  window.tlogPost          = tlogPost;
  window.tlogStartEdit     = tlogStartEdit;
  window.tlogCancelEdit    = tlogCancelEdit;
  window.tlogMarkDeleted   = tlogMarkDeleted;
  window.tlogToggleHistory = tlogToggleHistory;
  window.tlogOpenMedia     = tlogOpenMedia;
  window.tlogAttachChange  = tlogAttachChange;
  window.tlogRemovePending = tlogRemovePending;
  window.tlogEvtSlide       = tlogEvtSlide;
  window.tlogEvtManualToggle= tlogEvtManualToggle;
  window.tlogEvtManualChange= tlogEvtManualChange;
  window.tlogRenamePending  = tlogRenamePending;
  window.tlogExport         = tlogExport;
})();
