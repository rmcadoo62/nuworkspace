// ============================================================================
// mytime.js — private per-task time tracking for NUWorkspace
//
// Self-contained. One line in index.html:
//     <script src="js/mytime.js"></script>
// Delete that line and the feature is gone without a trace. tasks.js is never
// edited; this watches the DOM and decorates rows after they render.
//
// SHOWS: your running total in the existing HOURS column (amber, so it is
// visibly distinct from timesheet hours) plus a ▶/⏹ button in the actions cell.
//
// WHERE: task rows in projects you can time-track — private projects you are a
// member of, plus any task that already has time on it.
//
// WRITES: public.personal_time_entries only. RLS there is
// employee_id = current_employee_id(), so rows are yours alone — invisible to
// owners, and entirely outside timesheet_entries, approvals, PTO and costing.
//
// Diagnostics: everything logs under "[mytime]". window.myTime.debug() prints
// a one-shot health check.
// ============================================================================

(function () {
  'use strict';
  if (window.__mytimeLoaded) { console.warn('[mytime] already loaded, skipping'); return; }
  window.__mytimeLoaded = true;

  const TABLE = 'personal_time_entries';
  const log  = (...a) => console.log('%c[mytime]', 'color:#e8a234', ...a);
  const warn = (...a) => console.warn('[mytime]', ...a);

  let totals    = new Map();   // taskId -> seconds of completed sessions
  let running   = null;        // the one open session, if any
  let trackable = new Set();   // project ids where the timer shows
  let ready     = false;
  let tick      = null;

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const say = m => { try { if (typeof toast === 'function') toast(m); } catch (_) {} };

  // ---- formatting ----------------------------------------------------------
  // Natural units. Decimal hours is a billing convention and reads as "0.00h"
  // for anything under ~4 minutes, which is useless on a personal timer.
  // Storage is unaffected — started_at/ended_at keep full precision.
  function fmtHours(sec) {
    if (!sec || sec < 1) return '';
    if (sec < 60)   return Math.round(sec) + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    const h = sec / 3600;
    return (h < 10 ? h.toFixed(1) : Math.round(h)) + 'h';
  }
  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? hh + ':' : '') + String(mm).padStart(hh ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0');
  }
  const runningSeconds = () =>
    running ? (Date.now() - new Date(running.started_at).getTime()) / 1000 : 0;
  function totalFor(taskId) {
    let s = totals.get(taskId) || 0;
    if (running && running.task_id === taskId) s += runningSeconds();
    return s;
  }

  // ---- data ----------------------------------------------------------------
  async function load() {
    if (typeof sb === 'undefined' || !sb) { warn('supabase client (sb) not available'); return; }
    if (typeof currentEmployee === 'undefined' || !currentEmployee || !currentEmployee.id) {
      warn('currentEmployee not ready'); return;
    }

    // Which projects get a timer. Two independent sources, so one failing
    // (e.g. a stale PostgREST schema cache) does not kill the feature.
    trackable = new Set();
    try {
      const { data, error } = await sb.from('projects').select('id').eq('is_private', true);
      if (error) throw error;
      (data || []).forEach(r => trackable.add(r.id));
      log('private projects visible to you:', trackable.size);
    } catch (e) {
      warn('is_private lookup failed (falling back to membership):', e.message || e);
    }
    try {
      const { data, error } = await sb.from('project_members')
        .select('project_id').eq('employee_id', currentEmployee.id);
      if (error) throw error;
      (data || []).forEach(r => trackable.add(r.project_id));
    } catch (e) {
      warn('project_members lookup failed:', e.message || e);
    }

    try {
      const { data, error } = await sb.from(TABLE)
        .select('id, task_id, started_at, ended_at')
        .eq('employee_id', currentEmployee.id);
      if (error) throw error;
      totals = new Map();
      running = null;
      (data || []).forEach(r => {
        if (!r.ended_at) { running = r; return; }
        const sec = (new Date(r.ended_at) - new Date(r.started_at)) / 1000;
        if (sec > 0) totals.set(r.task_id, (totals.get(r.task_id) || 0) + sec);
        // A task with time on it is always trackable, wherever it lives.
        if (r.task_id) { const p = projOf(r.task_id); if (p) trackable.add(p); }
      });
      ready = true;
      log('loaded', (data || []).length, 'entries across', totals.size, 'tasks',
          running ? '(a timer is running)' : '');
    } catch (e) {
      warn('could not load time entries:', e.message || e);
      ready = true;   // still paint buttons so the feature is usable
    }
    paintAll();
    manageTick();
  }

  const taskOf = id => (typeof taskStore !== 'undefined' && Array.isArray(taskStore))
    ? taskStore.find(x => x._id === id) : null;
  const projOf = id => { const t = taskOf(id); return t ? t.proj : null; };
  const nameOf = id => { const t = taskOf(id); return t ? t.name : null; };

  // ---- start / stop --------------------------------------------------------
  async function start(taskId) {
    if (running) {
      const same = running.task_id === taskId;
      await stop(true);
      if (same) return;
    }
    const projId = projOf(taskId);
    const proj = (typeof projects !== 'undefined') ? projects.find(p => p.id === projId) : null;
    try {
      const { data, error } = await sb.from(TABLE).insert({
        employee_id: currentEmployee.id,
        task_id: taskId, project_id: projId,
        task_name: nameOf(taskId), project_name: proj ? proj.name : null,
        started_at: new Date().toISOString(), source: 'timer',
      }).select().single();
      if (error) throw error;
      running = data;
      paintAll(); manageTick();
      say('▶ Timer started');
    } catch (e) {
      warn('start failed', e);
      say('⚠ Could not start timer: ' + (e.message || 'unknown error'));
    }
  }

  async function stop(quiet) {
    if (!running) return;
    const r = running, sec = runningSeconds();
    try {
      const { error } = await sb.from(TABLE)
        .update({ ended_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      totals.set(r.task_id, (totals.get(r.task_id) || 0) + sec);
      running = null;
      paintAll(); manageTick();
      if (!quiet) say('⏹ Logged ' + fmtHours(sec));
    } catch (e) {
      warn('stop failed', e);
      say('⚠ Could not stop timer: ' + (e.message || 'unknown error'));
    }
  }

  // ---- manual entry / backfill --------------------------------------------
  // "1.5" | "90m" | "1h30m" | "1pm-2pm" | "13:00-14:15"
  function parseEntry(text, dateStr) {
    const raw = (text || '').trim().toLowerCase();
    if (!raw) return null;
    const day = dateStr || new Date().toISOString().slice(0, 10);

    const range = raw.match(/^(.+?)\s*(?:-|to|–)\s*(.+)$/);
    if (range) {
      const a = parseTime(range[1]), b = parseTime(range[2]);
      if (a == null || b == null) return null;
      const s = new Date(day + 'T00:00:00'); s.setMinutes(a);
      const e = new Date(day + 'T00:00:00'); e.setMinutes(b);
      return e > s ? { started: s, ended: e } : null;
    }

    let mins = 0, ok = false;
    const hm = raw.match(/(\d+(?:\.\d+)?)\s*h/), mm = raw.match(/(\d+(?:\.\d+)?)\s*m/);
    if (hm) { mins += parseFloat(hm[1]) * 60; ok = true; }
    if (mm) { mins += parseFloat(mm[1]);      ok = true; }
    if (!ok && /^\d+(\.\d+)?$/.test(raw)) { mins = parseFloat(raw) * 60; ok = true; }
    if (!ok || !(mins > 0)) return null;

    // Duration-only entries anchor at noon so started_at stays honest.
    const s = new Date(day + 'T12:00:00');
    return { started: s, ended: new Date(s.getTime() + mins * 60000) };
  }

  function parseTime(t) {
    const s = (t || '').trim().toLowerCase().replace(/\s+/g, '');
    let m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
    if (m) { let h = parseInt(m[1], 10) % 12; if (m[3] === 'pm') h += 12;
             return h * 60 + (m[2] ? parseInt(m[2], 10) : 0); }
    m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    m = s.match(/^(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60;
    return null;
  }

  async function addManual(taskId, text, dateStr) {
    const p = parseEntry(text, dateStr);
    if (!p) { say('⚠ Try "1.5", "90m", "1h30m", or "1pm-2pm"'); return false; }
    const projId = projOf(taskId);
    const proj = (typeof projects !== 'undefined') ? projects.find(x => x.id === projId) : null;
    try {
      const { error } = await sb.from(TABLE).insert({
        employee_id: currentEmployee.id,
        task_id: taskId, project_id: projId,
        task_name: nameOf(taskId), project_name: proj ? proj.name : null,
        started_at: p.started.toISOString(), ended_at: p.ended.toISOString(),
        source: 'manual',
      });
      if (error) throw error;
      const sec = (p.ended - p.started) / 1000;
      totals.set(taskId, (totals.get(taskId) || 0) + sec);
      paintAll();
      say('✓ Added ' + fmtHours(sec));
      return true;
    } catch (e) {
      warn('manual add failed', e);
      say('⚠ Could not add time: ' + (e.message || 'unknown error'));
      return false;
    }
  }

  async function deleteEntry(id) {
    try {
      const { error } = await sb.from(TABLE).delete().eq('id', id);
      if (error) throw error;
      await load();
      say('✓ Entry removed');
    } catch (e) { warn('delete failed', e); say('⚠ Could not remove entry'); }
  }

  // ---- session popover -----------------------------------------------------
  let pop = null;
  const closePop = () => { if (pop) { pop.remove(); pop = null; } };
  document.addEventListener('click', e => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.mytime-wrap')) closePop();
  });

  async function openPop(taskId, anchor) {
    closePop();
    let rows = [];
    try {
      const { data } = await sb.from(TABLE)
        .select('id, started_at, ended_at, source')
        .eq('employee_id', currentEmployee.id).eq('task_id', taskId)
        .order('started_at', { ascending: false });
      rows = data || [];
    } catch (_) {}

    const fmtDay = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fmtHm  = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const list = rows.length ? rows.map(r => {
      const open = !r.ended_at;
      const sec = open ? runningSeconds() : (new Date(r.ended_at) - new Date(r.started_at)) / 1000;
      return `<div class="mytime-sess">
          <span class="mytime-sess-when">${esc(fmtDay(r.started_at))} &middot; ${esc(fmtHm(r.started_at))}${open ? ' — running' : ' – ' + esc(fmtHm(r.ended_at))}</span>
          <span class="mytime-sess-dur">${open ? fmtClock(sec) : fmtHours(sec)}</span>
          ${open ? '' : `<button class="mytime-sess-del" title="Remove" data-del="${r.id}">&times;</button>`}
        </div>`;
    }).join('') : '<div class="mytime-empty">No time logged yet.</div>';

    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const el = document.createElement('div');
    el.className = 'mytime-pop';
    el.innerHTML = `
      <div class="mytime-pop-head">${esc(nameOf(taskId) || 'Task')}
        <span class="mytime-pop-total">${fmtHours(totalFor(taskId)) || '0h'}</span></div>
      <div class="mytime-pop-list">${list}</div>
      <div class="mytime-add">
        <input type="date" class="mytime-date" value="${today}">
        <input type="text" class="mytime-amt" placeholder="1.5, 90m, 1pm-2pm">
        <button class="mytime-add-btn">Add</button>
      </div>`;
    document.body.appendChild(el);
    pop = el;

    const r = anchor.getBoundingClientRect();
    el.style.top  = Math.min(window.innerHeight - el.offsetHeight - 12, r.bottom + 6) + 'px';
    el.style.left = Math.min(window.innerWidth  - el.offsetWidth  - 12, Math.max(8, r.left)) + 'px';

    el.querySelector('.mytime-add-btn').onclick = async () => {
      if (await addManual(taskId, el.querySelector('.mytime-amt').value,
                          el.querySelector('.mytime-date').value)) openPop(taskId, anchor);
    };
    el.querySelector('.mytime-amt').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') el.querySelector('.mytime-add-btn').click();
    });
    el.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = async () => { await deleteEntry(b.getAttribute('data-del')); openPop(taskId, anchor); };
    });
  }

  // ---- painting ------------------------------------------------------------
  // The Hours cell is the one immediately before the budget-hours cell. Finding
  // it by that anchor rather than a column index survives column reordering.
  function hoursCell(row) {
    const budget = row.querySelector('[onclick*="inlineEditBudgetHours"]');
    if (budget && budget.previousElementSibling) return budget.previousElementSibling;
    const kids = row.children;                       // fallback: known position
    return kids.length > 10 ? kids[9] : null;
  }

  function paintRow(row) {
    const taskId = row.getAttribute('data-task-id');
    if (!taskId) return;
    const projId = projOf(taskId);
    const has = totals.has(taskId) || (running && running.task_id === taskId);
    if (!has && (!projId || !trackable.has(projId))) return;

    const isRunning = !!(running && running.task_id === taskId);
    const sec = totalFor(taskId);

    // --- the Hours column: ▶/⏹ button AND the total, side by side ------------
    // Both live here rather than in the actions cell, which sits off the right
    // edge of the screen on this grid — the control has to be where you look.
    const cell = hoursCell(row);
    if (!cell) return;

    let wrap = cell.querySelector('.mytime-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'mytime-wrap';
      wrap.innerHTML = '<button class="mytime-play" type="button"></button>'
                     + '<span class="mytime-hours"></span>';
      wrap.querySelector('.mytime-play').onclick = ev => {
        ev.stopPropagation();
        (running && running.task_id === taskId) ? stop() : start(taskId);
      };
      wrap.querySelector('.mytime-hours').onclick = ev => {
        ev.stopPropagation(); openPop(taskId, wrap);
      };
      wrap.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); openPop(taskId, wrap); };
      cell.appendChild(wrap);
    }

    const play = wrap.querySelector('.mytime-play');
    const num  = wrap.querySelector('.mytime-hours');
    play.innerHTML = isRunning ? '&#9209;' : '&#9654;';
    play.classList.toggle('running', isRunning);
    play.title = isRunning ? 'Stop timer' : 'Start timer';
    num.textContent = sec > 0 ? (isRunning ? fmtClock(sec) : fmtHours(sec)) : '';
    num.classList.toggle('running', isRunning);
    num.title = (sec > 0 ? 'Exactly ' + (sec / 3600).toFixed(3) + ' h  (' + Math.round(sec) + ' s)\n' : '')
      + 'Your personal time — separate from timesheet hours.\n'
      + 'Click for sessions & manual entry.';
  }

  function paintAll() {
    if (!ready) return;
    document.querySelectorAll('.itt-row[data-task-id]').forEach(paintRow);
  }

  function manageTick() {
    if (running && !tick) tick = setInterval(paintAll, 1000);
    else if (!running && tick) { clearInterval(tick); tick = null; }
  }

  // ---- keep up with re-renders --------------------------------------------
  let pending = null;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; paintAll(); }, 60);
  }).observe(document.body, { childList: true, subtree: true });

  // ---- styles --------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    .mytime-wrap{display:flex;align-items:center;gap:5px;margin-top:3px;}
    .mytime-play{background:transparent;border:1px solid var(--border);border-radius:4px;
      color:var(--muted);cursor:pointer;font-size:9px;line-height:1;padding:3px 6px;
      transition:all .15s;flex-shrink:0;}
    .mytime-play:hover{border-color:var(--amber-dim);color:var(--amber);background:var(--amber-glow);}
    .mytime-play.running{border-color:var(--amber);color:var(--amber);background:var(--amber-glow);}
    .mytime-hours{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;
      color:var(--amber);cursor:pointer;line-height:1.2;}
    .mytime-hours:hover{text-decoration:underline;}
    .mytime-hours.running{animation:mytimePulse 1.6s ease-in-out infinite;}
    @keyframes mytimePulse{0%,100%{opacity:1}50%{opacity:.45}}
    .mytime-pop{position:fixed;z-index:9999;width:290px;background:var(--surface2);
      border:1px solid var(--border);border-radius:10px;padding:12px;
      box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:'DM Sans',sans-serif;}
    .mytime-pop-head{font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:10px;
      display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
    .mytime-pop-total{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--amber);}
    .mytime-pop-list{max-height:190px;overflow-y:auto;margin-bottom:10px;}
    .mytime-sess{display:flex;align-items:center;gap:8px;padding:5px 0;
      border-bottom:1px solid rgba(46,46,51,.6);font-size:11.5px;color:var(--muted);}
    .mytime-sess:last-child{border-bottom:none;}
    .mytime-sess-when{flex:1;}
    .mytime-sess-dur{font-family:'JetBrains Mono',monospace;color:var(--text);}
    .mytime-sess-del{background:none;border:none;color:transparent;cursor:pointer;font-size:14px;padding:0 2px;}
    .mytime-sess:hover .mytime-sess-del{color:var(--muted);}
    .mytime-sess-del:hover{color:var(--red);}
    .mytime-empty{font-size:11.5px;color:var(--muted);padding:6px 0;}
    .mytime-add{display:flex;gap:6px;}
    .mytime-date,.mytime-amt{background:var(--surface3);border:1px solid var(--border);
      border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:11.5px;
      padding:5px 7px;outline:none;min-width:0;}
    .mytime-date{width:118px;} .mytime-amt{flex:1;}
    .mytime-amt:focus,.mytime-date:focus{border-color:var(--amber-dim);}
    .mytime-add-btn{background:var(--amber);border:none;border-radius:6px;color:#0e0e0f;
      font-family:'DM Sans',sans-serif;font-size:11.5px;font-weight:600;padding:5px 11px;cursor:pointer;}
    .mytime-add-btn:hover{filter:brightness(1.08);}
  `;
  document.head.appendChild(css);

  // ---- boot ----------------------------------------------------------------
  let waited = 0;
  (function boot() {
    if (typeof sb !== 'undefined' && sb &&
        typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee.id) {
      log('booting for', currentEmployee.name || currentEmployee.id);
      load();
    } else if ((waited += 500) <= 60000) {
      setTimeout(boot, 500);
    } else {
      warn('gave up waiting for sb / currentEmployee after 60s');
    }
  })();

  // ---- console helpers -----------------------------------------------------
  window.myTime = {
    reload: load, start, stop, addManual, totalFor,
    debug() {
      const rows = document.querySelectorAll('.itt-row[data-task-id]');
      console.group('%c[mytime] health check', 'color:#e8a234');
      console.log('sb present          :', typeof sb !== 'undefined' && !!sb);
      console.log('currentEmployee     :', (typeof currentEmployee !== 'undefined' && currentEmployee)
                                            ? (currentEmployee.name + ' / ' + currentEmployee.id) : 'MISSING');
      console.log('ready               :', ready);
      console.log('trackable projects  :', [...trackable]);
      console.log('tasks with time     :', [...totals.entries()]);
      console.log('running             :', running);
      console.log('.itt-row on screen  :', rows.length);
      if (rows.length) {
        const id = rows[0].getAttribute('data-task-id');
        console.log('first row taskId    :', id);
        console.log('  its project       :', projOf(id), '(trackable:', trackable.has(projOf(id)) + ')');
        console.log('  hours cell found  :', !!hoursCell(rows[0]));
        console.log('  actions cell found:', !!rows[0].querySelector('.itt-row-actions'));
      }
      console.groupEnd();
    },
  };
})();
