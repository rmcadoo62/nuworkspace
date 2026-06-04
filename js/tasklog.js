// ============================================================================
// tasklog.js — Test Log for NUWorkspace (Phase A)
//
// Task-scoped, append-only log. Opened from the 📋 button on a task row via
// openTaskLog(taskId). Entries read chatter-style, oldest at top / newest at
// bottom. Editing an entry writes a NEW version (nothing is ever mutated or
// deleted); "delete" posts a version reading "ENTRY DELETED". Only the
// original author may edit/delete an entry (also enforced by RLS).
//
// Media (non-CUI jobs only — gate is the project's cui flag): uploaded to the
// private 'task-logs' bucket and viewed via short-lived signed URLs. Images
// show as thumbnails, video plays inline, PDFs open via openPdfViewer(), other
// files open in a new tab.
//
// Depends only on globals already present in the app: sb, currentUser,
// currentEmployee, employees, projects, taskStore, toast, openPdfViewer.
// No new libraries. Styles are injected once.
// ============================================================================

(function () {
  'use strict';

  const BUCKET   = 'task-logs';
  const URL_TTL  = 60 * 60; // 60 min signed URLs

  // Per-open state
  let S = null;
  function _freshState(taskId, task, project, isCui) {
    return {
      taskId, task, project, isCui,
      groups: [],            // [{groupId, current, versions[], firstCreated, ownerId, media[]}]
      pending: [],           // pending File attachments for the composer
      editingGroupId: null,  // when editing an existing entry
      signedByKey: {},       // object_key -> signed url (images/video)
      mediaByKey: {},        // object_key -> media row
    };
  }

  // ---- small utils ---------------------------------------------------------
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
    return d.toLocaleString('en-US', {
      month:'short', day:'numeric', year:'numeric',
      hour:'numeric', minute:'2-digit'
    });
  }

  function _authorName() {
    const emp = (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee : {};
    return emp.name || (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'User');
  }

  function _kind(mime) {
    const m = (mime || '').toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m === 'application/pdf') return 'pdf';
    return 'file';
  }

  // ---- row-button visibility (injected at load, before any log is opened) --
  // The task row's .itt-row-actions cell is display:none until hover. We keep
  // the edit pencil hover-only but force the 📋 log button to always show.
  (function _ensureRowStyles() {
    if (document.getElementById('tlogRowStyles')) return;
    const st = document.createElement('style');
    st.id = 'tlogRowStyles';
    st.textContent = `
      .itt-row-actions{display:flex !important;}
      .itt-row-actions > button:not(.tlog-log-btn){display:none;}
      .itt-row:hover .itt-row-actions > button:not(.tlog-log-btn){display:inline-flex;}
    `;
    (document.head || document.documentElement).appendChild(st);
  })();

  // ---- styles (injected once) ----------------------------------------------
  function _ensureStyles() {
    if (document.getElementById('tlogStyles')) return;
    const st = document.createElement('style');
    st.id = 'tlogStyles';
    st.textContent = `
      .tlog-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);
        display:flex;align-items:center;justify-content:center;opacity:0;
        transition:opacity .18s ease;}
      .tlog-backdrop.open{opacity:1;}
      .tlog-modal{width:720px;max-width:94vw;height:86vh;max-height:86vh;background:var(--bg,#fff);
        border-radius:12px;display:flex;flex-direction:column;overflow:hidden;
        box-shadow:0 18px 60px rgba(0,0,0,.35);font-family:'DM Sans',system-ui,sans-serif;}
      .tlog-head{display:flex;align-items:center;gap:10px;padding:14px 16px;
        border-bottom:1px solid var(--border,#e5e5e5);}
      .tlog-title{font-size:15px;font-weight:700;color:var(--text,#111);flex:1;min-width:0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .tlog-title .sub{font-weight:500;color:var(--muted,#888);font-size:12.5px;}
      .tlog-x{background:none;border:none;font-size:18px;cursor:pointer;color:var(--muted,#888);
        line-height:1;padding:4px 6px;border-radius:6px;}
      .tlog-x:hover{background:rgba(0,0,0,.06);}
      .tlog-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;}
      .tlog-empty{color:var(--muted,#888);font-size:13px;text-align:center;margin:auto 0;}
      .tlog-entry{border:1px solid var(--border,#e5e5e5);border-radius:10px;padding:10px 12px;background:#fff;}
      .tlog-entry.deleted{opacity:.6;}
      .tlog-meta{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted,#888);margin-bottom:4px;}
      .tlog-meta .who{font-weight:700;color:var(--text,#111);}
      .tlog-meta .spacer{flex:1;}
      .tlog-edited{cursor:pointer;color:var(--amber,#e8a234);font-weight:600;}
      .tlog-act{cursor:pointer;color:var(--muted,#888);font-weight:600;}
      .tlog-act:hover{color:var(--text,#111);}
      .tlog-text{font-size:13.5px;color:var(--text,#111);line-height:1.45;white-space:normal;word-break:break-word;}
      .tlog-text.deleted{font-style:italic;color:var(--red,#c0392b);}
      .tlog-history{margin-top:8px;border-top:1px dashed var(--border,#e5e5e5);padding-top:8px;
        display:none;flex-direction:column;gap:8px;}
      .tlog-history.open{display:flex;}
      .tlog-hist-item{font-size:12px;color:var(--muted,#888);}
      .tlog-hist-item .hbody{color:var(--text,#111);margin-top:2px;white-space:normal;word-break:break-word;}
      .tlog-media{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
      .tlog-thumb{width:96px;height:96px;border-radius:8px;object-fit:cover;cursor:pointer;
        border:1px solid var(--border,#e5e5e5);background:#f3f3f3;}
      video.tlog-thumb{object-fit:cover;}
      .tlog-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;
        border:1px solid var(--border,#e5e5e5);border-radius:8px;padding:6px 10px;color:var(--text,#111);
        background:#fafafa;}
      .tlog-chip:hover{border-color:var(--amber,#e8a234);}
      .tlog-composer{border-top:1px solid var(--border,#e5e5e5);padding:12px 16px;display:flex;
        flex-direction:column;gap:8px;background:var(--bg,#fff);}
      .tlog-editing-note{font-size:12px;color:var(--amber,#e8a234);font-weight:600;display:none;}
      .tlog-editing-note.show{display:block;}
      .tlog-ta{width:100%;min-height:64px;max-height:200px;resize:vertical;border:1px solid var(--border,#e5e5e5);
        border-radius:8px;padding:10px;font-family:inherit;font-size:13.5px;color:var(--text,#111);box-sizing:border-box;}
      .tlog-ta:focus{outline:none;border-color:var(--amber,#e8a234);}
      .tlog-comp-row{display:flex;align-items:center;gap:8px;}
      .tlog-comp-row .spacer{flex:1;}
      .tlog-cui-note{font-size:11.5px;color:var(--muted,#888);font-style:italic;}
      .tlog-attach-btn{font-size:12.5px;border:1px solid var(--border,#e5e5e5);background:#fafafa;
        border-radius:8px;padding:7px 12px;cursor:pointer;color:var(--text,#111);}
      .tlog-attach-btn:hover{border-color:var(--amber,#e8a234);}
      .tlog-post-btn{font-size:13px;font-weight:700;border:none;background:var(--amber,#e8a234);
        color:#0e0e0f;border-radius:8px;padding:8px 16px;cursor:pointer;}
      .tlog-post-btn:disabled{opacity:.5;cursor:default;}
      .tlog-pending{display:flex;flex-wrap:wrap;gap:6px;}
      .tlog-pending .p{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;background:#f0f0f0;
        border-radius:6px;padding:4px 8px;color:var(--text,#111);}
      .tlog-pending .p b{font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .tlog-pending .p .rm{cursor:pointer;color:var(--red,#c0392b);font-weight:700;}
      .tlog-lightbox{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.85);
        display:flex;align-items:center;justify-content:center;cursor:zoom-out;}
      .tlog-lightbox img{max-width:92vw;max-height:92vh;border-radius:8px;}
      .tlog-spinner{width:26px;height:26px;border:3px solid var(--border,#ddd);
        border-top-color:var(--amber,#e8a234);border-radius:50%;animation:tlogspin .8s linear infinite;margin:auto;}
      @keyframes tlogspin{to{transform:rotate(360deg);}}
    `;
    document.head.appendChild(st);
  }

  // ---- open / close ---------------------------------------------------------
  function openTaskLog(taskId) {
    if (typeof sb === 'undefined' || !sb) { if (typeof toast==='function') toast('⚠ Not connected'); return; }
    const task = (typeof taskStore !== 'undefined' ? taskStore : []).find(t => t._id === taskId) || { name: 'Task' };
    const project = (typeof projects !== 'undefined' ? projects : []).find(p => p.id === task.proj) || null;
    const isCui = ((project && project.cui) || '').toLowerCase() === 'yes';

    S = _freshState(taskId, task, project, isCui);
    _ensureStyles();
    _closeTaskLog();

    const bd = document.createElement('div');
    bd.className = 'tlog-backdrop';
    bd.id = 'tlogBackdrop';
    bd.onclick = e => { if (e.target === bd) _closeTaskLog(); };

    const projLabel = project ? `${project.emoji ? project.emoji + ' ' : ''}${project.name}` : '';
    bd.innerHTML = `
      <div class="tlog-modal" role="dialog" aria-label="Test log">
        <div class="tlog-head">
          <div class="tlog-title">📋 ${_esc(S.task.name)} <span class="sub">${_esc(projLabel ? '· ' + projLabel : '')}</span></div>
          <button class="tlog-x" type="button" onclick="closeTaskLog()" title="Close">✕</button>
        </div>
        <div class="tlog-body" id="tlogBody">
          <div class="tlog-spinner"></div>
        </div>
        <div class="tlog-composer">
          <div class="tlog-editing-note" id="tlogEditNote">Editing your entry — saving adds a new version. <span class="tlog-act" onclick="tlogCancelEdit()">cancel</span></div>
          <textarea class="tlog-ta" id="tlogTa" placeholder="Add a log entry…"></textarea>
          <div class="tlog-pending" id="tlogPending"></div>
          <div class="tlog-comp-row">
            ${S.isCui
              ? `<span class="tlog-cui-note">🛑 Attachments disabled on CUI-flagged jobs (Phase A) — text only.</span>`
              : `<button class="tlog-attach-btn" type="button" onclick="document.getElementById('tlogFile').click()">📎 Attach</button>
                 <input type="file" id="tlogFile" multiple style="display:none"
                   accept="image/*,video/*,application/pdf,text/plain,text/csv,.csv,.txt"
                   onchange="tlogAttachChange(this)">`}
            <span class="spacer"></span>
            <button class="tlog-post-btn" id="tlogPostBtn" type="button" onclick="tlogPost()">Post</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('open'));
    document.addEventListener('keydown', _onKey);
    _loadEntries();
  }

  function _closeTaskLog() {
    const el = document.getElementById('tlogBackdrop');
    if (el) el.remove();
    document.removeEventListener('keydown', _onKey);
  }
  function _onKey(e) { if (e.key === 'Escape') { _closeLightbox(); _closeTaskLog(); } }

  // ---- load + render --------------------------------------------------------
  async function _loadEntries() {
    const body = document.getElementById('tlogBody');
    try {
      const { data: rows, error } = await sb
        .from('task_log_entries')
        .select('id, entry_group_id, version, body, author_id, author_name, created_at')
        .eq('task_id', S.taskId)
        .order('entry_group_id', { ascending: true })
        .order('version', { ascending: true });
      if (error) throw error;

      // Group versions by entry_group_id
      const map = new Map();
      (rows || []).forEach(r => {
        if (!map.has(r.entry_group_id)) map.set(r.entry_group_id, []);
        map.get(r.entry_group_id).push(r);
      });

      // Media for all version rows
      const ids = (rows || []).map(r => r.id);
      let media = [];
      if (ids.length) {
        const { data: m } = await sb.from('task_log_media').select('*').in('entry_id', ids);
        media = m || [];
      }
      const idToGroup = {};
      (rows || []).forEach(r => { idToGroup[r.id] = r.entry_group_id; });
      const mediaByGroup = {};
      media.forEach(mm => {
        const g = idToGroup[mm.entry_id];
        if (!g) return;
        (mediaByGroup[g] = mediaByGroup[g] || []).push(mm);
        S.mediaByKey[mm.object_key] = mm;
      });

      S.groups = Array.from(map.values()).map(versions => {
        const current = versions[versions.length - 1];
        return {
          groupId: versions[0].entry_group_id,
          versions,
          current,
          firstCreated: versions[0].created_at,
          ownerId: versions[0].author_id,
          media: mediaByGroup[versions[0].entry_group_id] || [],
        };
      }).sort((a, b) => new Date(a.firstCreated) - new Date(b.firstCreated));

      // Pre-sign image/video media
      const previewKeys = [];
      S.groups.forEach(g => g.media.forEach(mm => {
        const k = _kind(mm.mime_type);
        if (k === 'image' || k === 'video') previewKeys.push(mm.object_key);
      }));
      if (previewKeys.length) {
        try {
          const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(previewKeys, URL_TTL);
          (signed || []).forEach(s => { if (s && s.signedUrl && !s.error) S.signedByKey[s.path] = s.signedUrl; });
        } catch (_) { /* thumbnails will just show a placeholder */ }
      }

      _renderEntries();
    } catch (err) {
      if (body) body.innerHTML = `<div class="tlog-empty">Could not load the log.<br><span style="font-size:11px">${_esc(err.message || err)}</span></div>`;
    }
  }

  function _renderEntries() {
    const body = document.getElementById('tlogBody');
    if (!body) return;
    if (!S.groups.length) {
      body.innerHTML = `<div class="tlog-empty">No entries yet. Add the first log entry below.</div>`;
      return;
    }
    const myId = currentUser && currentUser.id;
    body.innerHTML = S.groups.map(g => {
      const c = g.current;
      const isDeleted = (c.body || '').trim() === 'ENTRY DELETED';
      const isMine = myId && g.ownerId === myId;
      const edited = g.versions.length > 1;
      const histId = 'hist_' + g.groupId;

      const histHtml = edited ? `
        <div class="tlog-history" id="${histId}">
          ${g.versions.slice(0, -1).reverse().map(v => `
            <div class="tlog-hist-item">
              v${v.version} · ${_esc(v.author_name || '')} · ${_fmtDateTime(v.created_at)}
              <div class="hbody">${_nl2br(v.body)}</div>
            </div>`).join('')}
        </div>` : '';

      const mediaHtml = g.media.length ? `<div class="tlog-media">${g.media.map(_mediaHtml).join('')}</div>` : '';

      const actions = (isMine && !isDeleted)
        ? `<span class="tlog-act" onclick="tlogStartEdit('${g.groupId}')">edit</span>
           <span class="tlog-act" onclick="tlogMarkDeleted('${g.groupId}')">delete</span>`
        : '';

      return `
        <div class="tlog-entry ${isDeleted ? 'deleted' : ''}">
          <div class="tlog-meta">
            <span class="who">${_esc(c.author_name || '')}</span>
            <span>${_fmtDateTime(c.created_at)}</span>
            ${edited ? `<span class="tlog-edited" onclick="tlogToggleHistory('${histId}')">edited (${g.versions.length - 1}) ▾</span>` : ''}
            <span class="spacer"></span>
            ${actions}
          </div>
          <div class="tlog-text ${isDeleted ? 'deleted' : ''}">${_nl2br(c.body)}</div>
          ${mediaHtml}
          ${histHtml}
        </div>`;
    }).join('');

    // Fill signed thumbnail/video sources
    body.querySelectorAll('[data-tlog-key]').forEach(el => {
      const url = S.signedByKey[el.getAttribute('data-tlog-key')];
      if (url) el.src = url;
    });
    body.scrollTop = body.scrollHeight; // newest at bottom, scroll into view
  }

  function _mediaHtml(m) {
    const k = _kind(m.mime_type);
    const key = _esc(m.object_key);
    if (k === 'image') {
      return `<img class="tlog-thumb" data-tlog-key="${key}" alt="${_esc(m.filename)}"
        onclick="tlogOpenMedia('${key}')" title="${_esc(m.filename)}">`;
    }
    if (k === 'video') {
      return `<video class="tlog-thumb" data-tlog-key="${key}" controls preload="metadata" title="${_esc(m.filename)}"></video>`;
    }
    if (k === 'pdf') {
      return `<span class="tlog-chip" onclick="tlogOpenMedia('${key}')">📄 <b>${_esc(m.filename)}</b></span>`;
    }
    return `<span class="tlog-chip" onclick="tlogOpenMedia('${key}')">📎 <b>${_esc(m.filename)}</b></span>`;
  }

  // ---- media open -----------------------------------------------------------
  async function tlogOpenMedia(key) {
    const m = S.mediaByKey[key];
    if (!m) return;
    const k = _kind(m.mime_type);
    if (k === 'pdf' && typeof openPdfViewer === 'function') {
      openPdfViewer({ bucket: BUCKET, path: m.object_key, filename: m.filename, title: m.filename });
      return;
    }
    if (k === 'image') {
      const url = S.signedByKey[key] || await _sign(key);
      if (url) _openLightbox(url);
      return;
    }
    // video / other → open in a new tab
    const url = S.signedByKey[key] || await _sign(key);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function _sign(key) {
    try {
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, URL_TTL);
      if (data && data.signedUrl) { S.signedByKey[key] = data.signedUrl; return data.signedUrl; }
    } catch (_) {}
    return null;
  }

  function _openLightbox(url) {
    _closeLightbox();
    const lb = document.createElement('div');
    lb.className = 'tlog-lightbox';
    lb.id = 'tlogLightbox';
    lb.onclick = _closeLightbox;
    lb.innerHTML = `<img src="${_esc(url)}" alt="">`;
    document.body.appendChild(lb);
  }
  function _closeLightbox() {
    const el = document.getElementById('tlogLightbox');
    if (el) el.remove();
  }

  // ---- composer: attachments ------------------------------------------------
  function tlogAttachChange(input) {
    const files = Array.from(input.files || []);
    files.forEach(f => S.pending.push(f));
    input.value = '';
    _renderPending();
  }
  function tlogRemovePending(i) { S.pending.splice(i, 1); _renderPending(); }
  function _renderPending() {
    const el = document.getElementById('tlogPending');
    if (!el) return;
    el.innerHTML = S.pending.map((f, i) =>
      `<span class="p"><b>${_esc(f.name)}</b><span class="rm" onclick="tlogRemovePending(${i})">✕</span></span>`).join('');
  }

  // ---- composer: edit mode --------------------------------------------------
  function tlogStartEdit(groupId) {
    const g = S.groups.find(x => x.groupId === groupId);
    if (!g) return;
    S.editingGroupId = groupId;
    const ta = document.getElementById('tlogTa');
    if (ta) { ta.value = g.current.body; ta.focus(); }
    const note = document.getElementById('tlogEditNote');
    if (note) note.classList.add('show');
  }
  function tlogCancelEdit() {
    S.editingGroupId = null;
    const ta = document.getElementById('tlogTa'); if (ta) ta.value = '';
    const note = document.getElementById('tlogEditNote'); if (note) note.classList.remove('show');
  }

  // ---- composer: post / edit / delete --------------------------------------
  async function tlogPost() {
    const ta  = document.getElementById('tlogTa');
    const btn = document.getElementById('tlogPostBtn');
    const text = (ta && ta.value || '').trim();
    if (!text && !S.pending.length) return;
    if (S.editingGroupId && !text) { if (typeof toast==='function') toast('⚠ Entry text required'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }
    try {
      let row;
      if (S.editingGroupId) {
        const g = S.groups.find(x => x.groupId === S.editingGroupId);
        const nextVer = (g ? g.current.version : 1) + 1;
        const { data, error } = await sb.from('task_log_entries').insert({
          task_id: S.taskId,
          entry_group_id: S.editingGroupId,
          version: nextVer,
          body: text,
          author_id: currentUser.id,
          author_name: _authorName(),
        }).select('id, entry_group_id').single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await sb.from('task_log_entries').insert({
          task_id: S.taskId,
          version: 1,
          body: text,
          author_id: currentUser.id,
          author_name: _authorName(),
        }).select('id, entry_group_id').single();
        if (error) throw error;
        row = data;
      }

      // Upload pending media against the new version row (non-CUI only)
      if (!S.isCui && S.pending.length && row && row.id) {
        for (const f of S.pending) { await _uploadOne(f, row.id); }
      }

      // Reset composer + reload
      S.pending = [];
      S.editingGroupId = null;
      if (ta) ta.value = '';
      const note = document.getElementById('tlogEditNote'); if (note) note.classList.remove('show');
      _renderPending();
      await _loadEntries();
    } catch (err) {
      if (typeof toast === 'function') toast('⚠ ' + (err.message || 'Post failed'));
      else alert('Post failed: ' + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Post'; }
    }
  }

  async function tlogMarkDeleted(groupId) {
    if (!window.confirm('Mark this entry as deleted? The original stays in the version history.')) return;
    const g = S.groups.find(x => x.groupId === groupId);
    if (!g) return;
    try {
      const { error } = await sb.from('task_log_entries').insert({
        task_id: S.taskId,
        entry_group_id: groupId,
        version: g.current.version + 1,
        body: 'ENTRY DELETED',
        author_id: currentUser.id,
        author_name: _authorName(),
      });
      if (error) throw error;
      await _loadEntries();
    } catch (err) {
      if (typeof toast === 'function') toast('⚠ ' + (err.message || 'Failed'));
    }
  }

  async function _uploadOne(file, entryId) {
    const safe = (file.name || 'file').replace(/[^\w.\-]+/g, '_');
    const key  = `${S.taskId}/${entryId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await sb.storage.from(BUCKET)
      .upload(key, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await sb.from('task_log_media').insert({
      entry_id: entryId, bucket: BUCKET, object_key: key,
      filename: file.name, mime_type: file.type || null, size_bytes: file.size || null,
    });
    if (insErr) throw insErr;
  }

  function tlogToggleHistory(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
  }

  // ---- expose ---------------------------------------------------------------
  window.openTaskLog      = openTaskLog;
  window.closeTaskLog     = _closeTaskLog;
  window.tlogPost         = tlogPost;
  window.tlogStartEdit    = tlogStartEdit;
  window.tlogCancelEdit   = tlogCancelEdit;
  window.tlogMarkDeleted  = tlogMarkDeleted;
  window.tlogToggleHistory= tlogToggleHistory;
  window.tlogOpenMedia    = tlogOpenMedia;
  window.tlogAttachChange = tlogAttachChange;
  window.tlogRemovePending= tlogRemovePending;
})();
