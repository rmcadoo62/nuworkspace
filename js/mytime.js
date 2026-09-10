// ============================================================================
// mytime.js — stopwatch front-end for normal timesheet entry
//
// One line in index.html:
//     <script src="js/mytime.js?v=17"></script>
// Delete that line and the feature is gone. tasks.js is never edited.
//
// ── How this works ─────────────────────────────────────────────────────────
// Time is recorded in `timesheet_entries` — the same table everyone else's
// hours live in. That means Total Hours Charged, the Hours tab, Job Rate,
// the closing report and every other rollup pick it up with no changes to
// them. There is no parallel system.
//
// Privacy comes from the PROJECT, not from special storage: the
// private_project_guard policy already covers timesheet_entries, so hours on
// a private job are visible only to its members.
//
// `active_timers` holds ONLY the in-flight stopwatch, which the timesheet
// model cannot represent (it stores day totals, not intervals). One row per
// person, deleted on stop — normally the table is empty.
//
// Writing entries does NOT touch `timesheet_weeks`, where submit and approval
// live. So there is no submission, no approver and no 40-hour rollup.
//
// Depends only on existing globals: sb, currentEmployee, taskStore, projects,
// toast, and (optionally) syncProjActualHours, renderTasksPanel,
// renderInfoTasks, renderProjSummary.
// ============================================================================

(function () {
  'use strict';
  if (window.__mytimeLoaded) { console.warn('[mytime] already loaded'); return; }
  window.__mytimeLoaded = true;

  const log  = (...a) => console.log('%c[mytime]', 'color:#e8a234', ...a);
  const warn = (...a) => console.warn('[mytime]', ...a);
  const say  = m => { try { if (typeof toast === 'function') toast(m); } catch (_) {} };

  // Anything under this is treated as a misclick rather than work.
  const MIN_SECONDS = 120;

  let timer     = null;       // the active_timers row, or null
  let trackable = new Set();  // project ids where the ▶ button appears
  let ready     = false;
  let tick      = null;

  // ---- time helpers --------------------------------------------------------
  function elapsedSeconds() {
    if (!timer) return 0;
    let s = Number(timer.accumulated_seconds) || 0;
    if (timer.started_at) s += (Date.now() - new Date(timer.started_at).getTime()) / 1000;
    return s;
  }
  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? hh + ':' : '') + String(mm).padStart(hh ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0');
  }
  // Quarter-hour, matching how hours are entered by hand. Rounded ONCE at stop
  // across the whole sitting, so several short stretches can't each round away.
  function roundQuarter(hours) {
    const q = Math.round(hours * 4) / 4;
    return (q === 0 && hours > 0) ? 0.25 : q;
  }
  // Local date string — never toISOString(), which shifts across UTC.
  function localDate(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  const fmtHm = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Notes live in notes_json, keyed by day exactly like hours_json — the same
  // field the timesheet grid shows as a cell comment. Kept short so a day that
  // accumulates several sittings stays readable.
  function appendNote(existingJson, day, note) {
    let nj = {};
    try { nj = JSON.parse(existingJson || '{}') || {}; } catch (_) {}
    const prior = (nj[day] || '').trim();
    let combined = prior ? prior + ' · ' + note : note;
    if (combined.length > 240) combined = '…' + combined.slice(-239);
    nj[day] = combined;
    return nj;
  }

  // The week_start the app uses: the Sunday on or before this date.
  function weekStartOf(d) {
    const s = new Date(d);
    s.setDate(s.getDate() - s.getDay());
    s.setHours(0, 0, 0, 0);
    return localDate(s);
  }

  const taskOf = id => (typeof taskStore !== 'undefined' && Array.isArray(taskStore))
    ? taskStore.find(x => x._id === id) : null;
  const projOf = id => { const t = taskOf(id); return t ? t.proj : null; };
  const nameOf = id => { const t = taskOf(id); return t ? t.name : null; };
  const projNameOf = pid => {
    const p = (typeof projects !== 'undefined') ? projects.find(x => x.id === pid) : null;
    return p ? p.name : '';
  };

  // ---- load ----------------------------------------------------------------
  async function load() {
    if (typeof sb === 'undefined' || !sb) { warn('sb not available'); return; }
    if (typeof currentEmployee === 'undefined' || !currentEmployee || !currentEmployee.id) {
      warn('currentEmployee not ready'); return;
    }

    trackable = new Set();
    try {
      const { data, error } = await sb.from('projects').select('id').eq('is_private', true);
      if (error) throw error;
      (data || []).forEach(r => trackable.add(r.id));
    } catch (e) { warn('is_private lookup failed:', e.message || e); }
    try {
      const { data, error } = await sb.from('project_members')
        .select('project_id').eq('employee_id', currentEmployee.id);
      if (error) throw error;
      (data || []).forEach(r => trackable.add(r.project_id));
    } catch (e) { warn('project_members lookup failed:', e.message || e); }

    try {
      const { data, error } = await sb.from('active_timers')
        .select('*').eq('employee_id', currentEmployee.id).maybeSingle();
      if (error) throw error;
      timer = data || null;
    } catch (e) { warn('active_timers load failed:', e.message || e); timer = null; }

    await hydrateTsData();
    ready = true;
    log('ready — trackable projects:', trackable.size, timer ? '(timer running)' : '');
    paintAll(); manageTick();
    if (timer) openRunPanel();

    // Only surface billing for someone who actually tracks time here.
    if (trackable.size) { ensureBillingPanel(); ensureBillingNav(); }
  }

  // The app renders HRS LOGGED via getHoursForTask(), which reads the in-memory
  // tsData built by the Timesheet panel. Owners never open that panel, so
  // nothing populates it — we load our own entries into the same shape and let
  // the app's existing code do the rendering.
  async function hydrateTsData() {
    if (typeof tsData === 'undefined') return;
    try {
      const { data, error } = await sb.from('timesheet_entries')
        .select('*').eq('employee_id', currentEmployee.id).eq('is_overhead', false);
      if (error) throw error;
      (data || []).forEach(r => {
        const key = currentEmployee.id + '|' + r.week_start;
        if (!Array.isArray(tsData[key])) tsData[key] = [];
        const existing = tsData[key].find(x => x._id === r.id);
        const row = {
          _id: r.id, projId: r.project_id || '', taskName: r.task_name || '',
          taskId: r.task_id || null, isOverhead: false, overheadCat: '',
          hours: JSON.parse(r.hours_json || '{}'),
          comments: JSON.parse(r.notes_json || '{}'),
        };
        if (existing) Object.assign(existing, row); else tsData[key].push(row);
      });
    } catch (e) { warn('tsData hydrate failed:', e.message || e); }
  }

  function repaintApp(projId) {
    try {
      if (typeof renderTasksPanel === 'function' && typeof activeProjectId !== 'undefined' && activeProjectId)
        renderTasksPanel(activeProjectId);
      const subInfo = document.getElementById('sub-info');
      if (subInfo && subInfo.classList.contains('active') &&
          typeof renderInfoTasks === 'function' && typeof activeProjectId !== 'undefined')
        renderInfoTasks(activeProjectId, typeof currentTaskFilter !== 'undefined' ? currentTaskFilter : 'all');
      if (typeof renderProjSummary === 'function' && projId) renderProjSummary(projId);
    } catch (e) { warn('repaint failed', e); }
  }

  // ---- start / pause / resume / stop --------------------------------------
  async function start(taskId) {
    if (timer) {
      if (timer.task_id === taskId) return;
      await stop(true);                 // switching tasks commits the old sitting
    }
    const projId = projOf(taskId);
    if (!projId) { say('⚠ Could not resolve this task’s project'); return; }
    const now = new Date().toISOString();
    try {
      const { data, error } = await sb.from('active_timers').upsert({
        employee_id: currentEmployee.id,
        task_id: taskId, project_id: projId, task_name: nameOf(taskId),
        started_at: now, sitting_started_at: now,
        accumulated_seconds: 0, updated_at: now,
      }, { onConflict: 'employee_id' }).select().single();
      if (error) throw error;
      timer = data;
      paintAll(); manageTick(); openRunPanel();
    } catch (e) {
      warn('start failed', e); say('⚠ Could not start timer: ' + (e.message || 'unknown'));
    }
  }

  async function pause() {
    if (!timer || !timer.started_at) return;
    const acc = elapsedSeconds();
    try {
      const { data, error } = await sb.from('active_timers')
        .update({ started_at: null, accumulated_seconds: acc, updated_at: new Date().toISOString() })
        .eq('employee_id', currentEmployee.id).select().single();
      if (error) throw error;
      timer = data;
      paintAll(); manageTick(); openRunPanel();
    } catch (e) { warn('pause failed', e); say('⚠ Could not pause'); }
  }

  async function resume() {
    if (!timer || timer.started_at) return;
    try {
      const { data, error } = await sb.from('active_timers')
        .update({ started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('employee_id', currentEmployee.id).select().single();
      if (error) throw error;
      timer = data;
      paintAll(); manageTick(); openRunPanel();
    } catch (e) { warn('resume failed', e); say('⚠ Could not resume'); }
  }

  // Commit the sitting into timesheet_entries, then clear the stopwatch.
  // `overrideHours` logs a corrected amount instead of the elapsed time — used
  // when a forgotten timer is reconciled. `discard` throws the sitting away.
  async function stop(quiet, overrideHours, discard) {
    if (!timer) return;
    const t = timer, secs = elapsedSeconds();
    const projId = t.project_id, taskId = t.task_id;

    try {
      const hrs = discard ? 0
        : (typeof overrideHours === 'number' ? Math.round(overrideHours * 100) / 100
                                             : roundQuarter(secs / 3600));

      if (!discard && hrs > 0 && (typeof overrideHours === 'number' || secs >= MIN_SECONDS)) {
        const when = new Date(t.sitting_started_at || t.started_at || Date.now());
        const ws   = weekStartOf(when);
        const day  = String(when.getDay());          // 0=Sun … 6=Sat, as stored

        // Provenance. The timesheet stores day totals, so without this a wrong
        // entry is just a number with no way to tell where it came from.
        const note = typeof overrideHours === 'number'
          ? fmtHm(when) + ' – forgotten timer, logged ' + hrs.toFixed(2) + 'h by hand'
          : fmtHm(when) + '–' + fmtHm(new Date()) + ' (timer)';

        // Read–modify–write: hours_json must be MERGED, not replaced, so an
        // existing day's hours (or another day in the same week) survive.
        const { data: rows, error: selErr } = await sb.from('timesheet_entries')
          .select('id, hours_json, notes_json')
          .eq('week_start', ws).eq('employee_id', currentEmployee.id)
          .eq('task_id', taskId).eq('project_id', projId).limit(1);
        if (selErr) throw selErr;

        if (rows && rows.length) {
          const hj = JSON.parse(rows[0].hours_json || '{}');
          hj[day] = Math.round(((parseFloat(hj[day]) || 0) + hrs) * 100) / 100;
          const { error } = await sb.from('timesheet_entries')
            .update({ hours_json: JSON.stringify(hj),
                      notes_json: JSON.stringify(appendNote(rows[0].notes_json, day, note)) })
            .eq('id', rows[0].id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('timesheet_entries').insert({
            week_start: ws, employee_id: currentEmployee.id,
            task_id: taskId, project_id: projId,
            task_name: t.task_name || nameOf(taskId),
            is_overhead: false, hours_json: JSON.stringify({ [day]: hrs }),
            notes_json: JSON.stringify({ [day]: note }),
          });
          if (error) throw error;
        }
        if (!quiet) say('⏹ Logged ' + hrs.toFixed(2) + 'h');
      } else if (!quiet) {
        say(discard ? 'Timer discarded' : 'Timer discarded — under 2 minutes');
      }

      await sb.from('active_timers').delete().eq('employee_id', currentEmployee.id);
      timer = null;
      closeRunPanel();

      // Keep the stored project total in step, the same way the app does.
      if (typeof syncProjActualHours === 'function') { try { await syncProjActualHours(projId); } catch (_) {} }
      await hydrateTsData();
      paintAll(); manageTick(); repaintApp(projId);
    } catch (e) {
      warn('stop failed', e);
      say('⚠ Could not save time: ' + (e.message || 'unknown error'));
    }
  }
  // ---- time editor: backfill and correct entries ---------------------------
  // Writes straight to timesheet_entries, the same rows the stopwatch creates.
  // Deliberately NOT quarter-hour rounded: rounding exists to tame stopwatch
  // precision, not to override a number you typed on purpose.
  //
  // A new day is entered as free text — "1.5", "90m", "1h30m", "1pm-2pm",
  // "9am-11:30am", "13:00-14:15" — because that's how you actually think about
  // time you just worked. Existing days keep a number field with quarter-hour
  // arrows, which is the right control for nudging a value that's already there.
  function parseAmount(text) {
    const raw = (text || '').trim().toLowerCase();
    if (!raw) return null;

    const range = raw.match(/^(.+?)\s*(?:-|to|–|—)\s*(.+)$/);
    if (range) {
      const a = parseClock(range[1]), b = parseClock(range[2]);
      if (a == null || b == null || b <= a) return null;
      return Math.round(((b - a) / 60) * 100) / 100;
    }
    // `\d*\.?\d+` so a leading-dot decimal (".5", ".25") parses like "0.5".
    let mins = 0, ok = false;
    const hm = raw.match(/(\d*\.?\d+)\s*h/), mm = raw.match(/(\d*\.?\d+)\s*m/);
    if (hm) { mins += parseFloat(hm[1]) * 60; ok = true; }
    if (mm) { mins += parseFloat(mm[1]);      ok = true; }
    if (!ok && /^\d*\.?\d+$/.test(raw)) { mins = parseFloat(raw) * 60; ok = true; }
    if (!ok || !(mins > 0)) return null;
    // A bare number means hours, so "30" is 30 hours — almost certainly a typo
    // for 30 minutes. Refuse anything that can't fit in a day rather than
    // silently recording it.
    if (mins > 24 * 60) return null;
    return Math.round((mins / 60) * 100) / 100;
  }
  function parseClock(t) {
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

  // Every recorded day for one task, flattened out of the weekly rows.
  async function taskDays(taskId) {
    const out = [];
    try {
      const { data, error } = await sb.from('timesheet_entries')
        .select('id, week_start, hours_json, notes_json')
        .eq('employee_id', currentEmployee.id).eq('task_id', taskId)
        .eq('is_overhead', false);
      if (error) throw error;
      (data || []).forEach(r => {
        let hj = {}, nj = {};
        try { hj = JSON.parse(r.hours_json || '{}'); } catch (_) {}
        try { nj = JSON.parse(r.notes_json || '{}') || {}; } catch (_) {}
        Object.keys(hj).forEach(k => {
          const h = parseFloat(hj[k]) || 0;
          if (h <= 0) return;
          const d = new Date(r.week_start + 'T00:00:00');
          d.setDate(d.getDate() + parseInt(k, 10));
          out.push({ rowId: r.id, weekStart: r.week_start, dayIdx: parseInt(k, 10),
                     date: d, hours: h, note: (nj[k] || '') });
        });
      });
    } catch (e) { warn('taskDays failed', e.message || e); }
    return out.sort((a, b) => b.date - a.date);
  }

  // Set one day's hours. `hours <= 0` clears the day, and a row left with no
  // days is deleted rather than lingering as an empty shell.
  async function setDayHours(taskId, projId, dateObj, hours) {
    const ws  = weekStartOf(dateObj);
    const day = String(dateObj.getDay());
    try {
      const { data: rows, error: selErr } = await sb.from('timesheet_entries')
        .select('id, hours_json, notes_json')
        .eq('week_start', ws).eq('employee_id', currentEmployee.id)
        .eq('task_id', taskId).eq('project_id', projId).limit(1);
      if (selErr) throw selErr;

      const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (rows && rows.length) {
        const hj = JSON.parse(rows[0].hours_json || '{}');
        const prev = parseFloat(hj[day]) || 0;
        let nj = {};
        try { nj = JSON.parse(rows[0].notes_json || '{}') || {}; } catch (_) {}

        if (hours > 0) {
          hj[day] = Math.round(hours * 100) / 100;
          // Only note an actual change, so opening and closing the panel is silent.
          if (hj[day] !== prev) {
            nj = appendNote(rows[0].notes_json, day,
                            'set to ' + hj[day].toFixed(2) + 'h by hand ' + stamp);
          }
        } else {
          delete hj[day];
          delete nj[day];               // the day is gone; its provenance goes too
        }

        if (Object.keys(hj).length === 0) {
          const { error } = await sb.from('timesheet_entries').delete().eq('id', rows[0].id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('timesheet_entries')
            .update({ hours_json: JSON.stringify(hj), notes_json: JSON.stringify(nj) })
            .eq('id', rows[0].id);
          if (error) throw error;
        }
      } else if (hours > 0) {
        const { error } = await sb.from('timesheet_entries').insert({
          week_start: ws, employee_id: currentEmployee.id,
          task_id: taskId, project_id: projId, task_name: nameOf(taskId),
          is_overhead: false, hours_json: JSON.stringify({ [day]: Math.round(hours * 100) / 100 }),
          notes_json: JSON.stringify({ [day]: 'added by hand ' + stamp }),
        });
        if (error) throw error;
      }
      if (typeof syncProjActualHours === 'function') { try { await syncProjActualHours(projId); } catch (_) {} }
      await hydrateTsData();
      repaintApp(projId);
      return true;
    } catch (e) {
      warn('setDayHours failed', e);
      say('⚠ Could not save: ' + (e.message || 'unknown error'));
      return false;
    }
  }

  let editor = null;
  function closeEditor() { if (editor) { editor.remove(); editor = null; } }
  document.addEventListener('click', e => {
    if (editor && !editor.contains(e.target) && !e.target.closest('.mytime-btn')
        && !e.target.closest('.mytime-hrs-hit')) closeEditor();
  });

  // `pos` keeps the panel exactly where it already is when we rebuild it after
  // an edit. Without it we'd re-measure the anchor — but repaintApp() has by
  // then replaced the task row, so the anchor is detached, getBoundingClientRect()
  // returns all zeros, and the panel jumps to the top-left corner.
  // Nothing is written until Save. Edits, additions and removals are all staged
  // in memory, so an accidental × is visible and reversible instead of being an
  // instant, silent delete — which is exactly how an hour got lost once.
  async function openEditor(taskId, anchor, pos) {
    closeEditor();
    const projId = projOf(taskId);
    const days = await taskDays(taskId);

    // staged rows: { key, date, orig, hours, isNew, removed }
    const staged = days.map(d => ({
      key: localDate(d.date), date: d.date, orig: d.hours, hours: d.hours,
      note: d.note || '', isNew: false, removed: false,
    }));

    const el = document.createElement('div');
    el.className = 'mytime-pop';
    el.innerHTML =
        `<div class="mytime-pop-head"><span>${esc(nameOf(taskId) || 'Task')}</span>`
      +   `<span class="mytime-pop-total"></span></div>`
      + `<div class="mytime-pop-list"></div>`
      + `<button class="mytime-addrow" type="button">+ Add a day</button>`
      + `<div class="mytime-foot">`
      +   `<span class="mytime-dirty"></span>`
      +   `<button class="mytime-cancel" type="button">Cancel</button>`
      +   `<button class="mytime-save" type="button" disabled>Save</button>`
      + `</div>`;
    document.body.appendChild(el);
    editor = el;

    if (pos) {
      el.style.top = pos.top + 'px'; el.style.left = pos.left + 'px';
    } else {
      const r = anchor ? anchor.getBoundingClientRect() : null;
      // A detached anchor measures as all zeros — centre rather than corner it.
      if (!r || (!r.width && !r.height)) {
        el.style.top  = Math.max(12, (window.innerHeight - el.offsetHeight) / 2) + 'px';
        el.style.left = Math.max(12, (window.innerWidth  - el.offsetWidth)  / 2) + 'px';
      } else {
        el.style.top  = Math.min(window.innerHeight - el.offsetHeight - 12, r.bottom + 6) + 'px';
        el.style.left = Math.min(window.innerWidth  - el.offsetWidth  - 12, Math.max(8, r.left - 120)) + 'px';
      }
    }

    const listEl  = el.querySelector('.mytime-pop-list');
    const totalEl = el.querySelector('.mytime-pop-total');
    const saveBtn = el.querySelector('.mytime-save');
    const dirtyEl = el.querySelector('.mytime-dirty');

    const isDirty = () => staged.some(s =>
      (s.removed && !s.isNew) || (!s.removed && s.hours !== s.orig));

    function refresh() {
      const t = staged.filter(s => !s.removed).reduce((sum, s) => sum + (s.hours || 0), 0);
      totalEl.textContent = t ? t.toFixed(2) + 'h' : '0h';
      const d = isDirty();
      saveBtn.disabled = !d;
      dirtyEl.textContent = d ? 'unsaved changes' : '';
      const empty = listEl.querySelector('.mytime-empty');
      if (staged.length && empty) empty.remove();
      if (!staged.length && !empty) {
        listEl.innerHTML = '<div class="mytime-empty">No time recorded on this task yet.</div>';
      }
    }

    const fmtD = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    function addRowEl(s) {
      const row = document.createElement('div');
      row.className = 'mytime-day';
      row.innerHTML = s.isNew
        ? `<input type="date" class="mytime-day-date" value="${s.key}">`
          + `<input class="mytime-day-txt" type="text" placeholder="1.5, 90m, 1pm-2pm">`
          + `<span class="mytime-day-parsed"></span>`
          + `<button class="mytime-day-del" type="button" title="Remove">&times;</button>`
        : `<span class="mytime-day-when">${esc(fmtD(s.date))}</span>`
          + `<input class="mytime-day-inp" type="number" step="0.25" min="0" value="${s.hours}">`
          + `<span class="mytime-day-h">h</span><button class="mytime-day-del" type="button" title="Remove">&times;</button>`;
      listEl.appendChild(row);
      // Provenance under the row — the whole point of recording it is being
      // able to look at a wrong number and see where it came from.
      if (s.note) {
        const n = document.createElement('div');
        n.className = 'mytime-day-note';
        n.textContent = s.note;
        listEl.appendChild(n);
      }

      const inp = row.querySelector('.mytime-day-inp');
      if (inp) inp.oninput = () => {
        const v = parseFloat(inp.value);
        s.hours = isNaN(v) || v < 0 ? 0 : v;
        refresh();
      };

      // Free-text entry for a new day, echoing back what it understood so the
      // parse is never a guess.
      const txt = row.querySelector('.mytime-day-txt');
      if (txt) {
        const parsedEl = row.querySelector('.mytime-day-parsed');
        txt.oninput = () => {
          const raw = txt.value.trim();
          const v = parseAmount(raw);
          s.hours = v || 0;
          if (!raw)        { parsedEl.textContent = '';  parsedEl.className = 'mytime-day-parsed'; }
          else if (v == null) { parsedEl.textContent = '?'; parsedEl.className = 'mytime-day-parsed bad'; }
          else             { parsedEl.textContent = v.toFixed(2) + 'h'; parsedEl.className = 'mytime-day-parsed ok'; }
          refresh();
        };
      }
      const dateInp = row.querySelector('.mytime-day-date');
      if (dateInp) dateInp.onchange = () => {
        s.key = dateInp.value;
        s.date = new Date(dateInp.value + 'T00:00:00');
        refresh();
      };
      // Removal is staged, not done. Click again to put it back.
      row.querySelector('.mytime-day-del').onclick = () => {
        if (s.isNew && !s.removed) { staged.splice(staged.indexOf(s), 1); row.remove(); refresh(); return; }
        s.removed = !s.removed;
        row.classList.toggle('removed', s.removed);
        row.querySelector('.mytime-day-del').innerHTML = s.removed ? '&#8630;' : '&times;';
        row.querySelector('.mytime-day-del').title = s.removed ? 'Keep it after all' : 'Remove';
        if (inp) inp.disabled = s.removed;
        refresh();
      };
    }

    if (!staged.length) listEl.innerHTML = '<div class="mytime-empty">No time recorded on this task yet.</div>';
    staged.forEach(addRowEl);
    refresh();

    el.querySelector('.mytime-addrow').onclick = () => {
      const s = { key: localDate(new Date()), date: new Date(), orig: 0, hours: 0, isNew: true, removed: false };
      staged.push(s);
      const empty = listEl.querySelector('.mytime-empty'); if (empty) empty.remove();
      addRowEl(s);
      refresh();
      const rows = listEl.querySelectorAll('.mytime-day');
      const last = rows[rows.length - 1];
      if (last) last.querySelector('.mytime-day-inp').focus();
    };

    el.querySelector('.mytime-cancel').onclick = () => closeEditor();

    saveBtn.onclick = async () => {
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      let failed = 0;
      for (const s of staged) {
        const target = s.removed ? 0 : s.hours;
        if (!s.isNew && target === s.orig) continue;   // untouched
        if (s.isNew && target <= 0) continue;          // added then left blank
        const ok = await setDayHours(taskId, projId, s.date, target);
        if (!ok) failed++;
      }
      if (failed) {
        saveBtn.textContent = 'Save'; saveBtn.disabled = false;
        say('⚠ ' + failed + ' change' + (failed === 1 ? '' : 's') + ' could not be saved');
        return;
      }
      say('✓ Saved');
      closeEditor();
    };
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---- floating panel ------------------------------------------------------
  let runPanel = null, runPanelHidden = false;
  function closeRunPanel() { if (runPanel) { runPanel.remove(); runPanel = null; } }

  function openRunPanel() {
    if (!timer) return;
    runPanelHidden = false;
    if (!runPanel) {
      runPanel = document.createElement('div');
      runPanel.className = 'mytime-run';
      runPanel.innerHTML =
          '<div class="mytime-run-top">'
        +   '<span class="mytime-run-label"></span>'
        +   '<button class="mytime-run-hide" title="Hide — the timer keeps running">&times;</button>'
        + '</div>'
        + '<div class="mytime-run-task"></div>'
        + '<div class="mytime-run-proj"></div>'
        + '<div class="mytime-run-clock">0:00</div>'
        + '<div class="mytime-run-stale">'
        +   '<div class="mytime-stale-msg"></div>'
        +   '<div class="mytime-stale-row">'
        +     '<span>Log</span>'
        +     '<input class="mytime-stale-inp" type="number" step="0.25" min="0">'
        +     '<span>h</span>'
        +     '<button class="mytime-stale-log">Log it</button>'
        +   '</div>'
        +   '<button class="mytime-stale-discard">Discard — I wasn\'t working</button>'
        + '</div>'
        + '<div class="mytime-run-btns">'
        +   '<button class="mytime-run-pause"></button>'
        +   '<button class="mytime-run-stop"></button>'
        + '</div>'
        + '<div class="mytime-run-note"></div>';
      runPanel.querySelector('.mytime-run-hide').onclick  = () => { runPanelHidden = true; closeRunPanel(); };
      runPanel.querySelector('.mytime-run-pause').onclick = () => (timer && timer.started_at ? pause() : resume());
      runPanel.querySelector('.mytime-run-stop').onclick  = () => stop();
      runPanel.querySelector('.mytime-stale-log').onclick = () => {
        const v = parseFloat(runPanel.querySelector('.mytime-stale-inp').value);
        if (isNaN(v) || v < 0) return;
        stop(false, v);
      };
      runPanel.querySelector('.mytime-stale-discard').onclick = () => stop(false, 0, true);
      document.body.appendChild(runPanel);
    }
    paintRunPanel();
  }

  // A timer running longer than this was almost certainly forgotten, so the
  // panel stops offering to log it and starts asking what actually happened.
  const STALE_SECONDS = 4 * 3600;
  const isStale = () => !!timer && elapsedSeconds() >= STALE_SECONDS;

  function paintRunPanel() {
    if (!timer) { closeRunPanel(); return; }
    // A forgotten timer shouldn't stay out of sight — going stale un-hides the
    // panel so it can't keep counting behind your back.
    if (isStale() && (runPanelHidden || !runPanel)) { runPanelHidden = false; openRunPanel(); return; }
    if (runPanelHidden || !runPanel) return;
    const isPaused = !timer.started_at;
    const secs = elapsedSeconds();
    const stale = isStale();

    runPanel.classList.toggle('paused', isPaused);
    runPanel.classList.toggle('stale', stale);
    runPanel.querySelector('.mytime-run-label').innerHTML =
      stale ? '&#9888; STILL RUNNING?' : (isPaused ? '&#10073;&#10073; PAUSED' : '&#9679; TRACKING');
    runPanel.querySelector('.mytime-run-task').textContent =
      nameOf(timer.task_id) || timer.task_name || 'Task';
    runPanel.querySelector('.mytime-run-proj').textContent = projNameOf(timer.project_id);
    runPanel.querySelector('.mytime-run-clock').textContent = fmtClock(secs);
    runPanel.querySelector('.mytime-run-pause').innerHTML =
      isPaused ? '&#9654;&nbsp; RESUME' : '&#10073;&#10073;&nbsp; PAUSE';
    runPanel.querySelector('.mytime-run-stop').innerHTML = '&#9209;&nbsp; STOP';

    if (stale) {
      const started = new Date(timer.sitting_started_at || timer.started_at);
      const msg = runPanel.querySelector('.mytime-stale-msg');
      msg.textContent = 'Running since ' + started.toLocaleDateString('en-US',
          { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + fmtHm(started)
        + ' — that\'s ' + (secs / 3600).toFixed(1) + 'h. How long did you actually work?';
      const inp = runPanel.querySelector('.mytime-stale-inp');
      if (document.activeElement !== inp && !inp.value) inp.value = '';
      runPanel.querySelector('.mytime-run-note').textContent = '';
    } else {
      // Say plainly what will be written, so quarter-hour rounding is no surprise.
      runPanel.querySelector('.mytime-run-note').textContent =
        secs >= MIN_SECONDS ? ('will log ' + roundQuarter(secs / 3600).toFixed(2) + 'h')
                            : 'under 2 min — will be discarded';
    }
  }

  // ---- the ▶ button on task rows ------------------------------------------
  // The hours themselves are rendered by the app's own HRS LOGGED column now,
  // so this only adds the control.
  // The HRS LOGGED cell is the one immediately before the budget-hours cell.
  // Finding it by that anchor survives column reordering.
  function hoursCell(row) {
    const budget = row.querySelector('[onclick*="inlineEditBudgetHours"]');
    if (budget && budget.previousElementSibling) return budget.previousElementSibling;
    const kids = row.children;
    return kids.length > 10 ? kids[9] : null;
  }

  function paintRow(row) {
    const taskId = row.getAttribute('data-task-id');
    if (!taskId) return;
    const projId = projOf(taskId);
    if (!projId || !trackable.has(projId)) return;

    const actions = row.querySelector('.itt-row-actions');
    if (!actions) return;
    let btn = actions.querySelector('.mytime-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'mytime-btn itt-row-action-btn';
      btn.onclick = ev => {
        ev.stopPropagation();
        if (timer && timer.task_id === taskId) { openRunPanel(); return; }
        start(taskId);
      };
      // Right-click the button, or click the hours cell, to edit time by hand.
      btn.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); openEditor(taskId, btn); };
      actions.insertBefore(btn, actions.firstChild);
    }
    const isMine = !!(timer && timer.task_id === taskId);
    btn.classList.toggle('running', isMine);
    btn.innerHTML = isMine ? '&#9209;' : '&#9654;';
    btn.title = (isMine ? 'Timer running — click to open the panel' : 'Start timer')
              + '\nRight-click to add or correct time by hand';

    // Make the hours cell itself a click target — that's where the eye goes.
    const cell = hoursCell(row);
    if (cell && !cell.classList.contains('mytime-hrs-hit')) {
      cell.classList.add('mytime-hrs-hit');
      cell.title = 'Click to add or correct your time on this task';
      cell.addEventListener('click', ev => {
        ev.stopPropagation();
        openEditor(taskId, cell);
      });
    }
  }

  function paintAll() {
    if (!ready) return;
    document.querySelectorAll('.itt-row[data-task-id]').forEach(paintRow);
    paintRunPanel();
  }
  function manageTick() {
    const live = !!(timer && timer.started_at);
    if (live && !tick) tick = setInterval(paintRunPanel, 1000);
    else if (!live && tick) { clearInterval(tick); tick = null; }
  }

  let pending = null;
  new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; paintAll(); }, 60);
  }).observe(document.body, { childList: true, subtree: true });

  // ---- styles --------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
    .mytime-btn{display:inline-flex;align-items:center;}
    .mytime-btn.running{color:var(--amber);background:var(--amber-glow);border-color:var(--amber-dim);}
    .mytime-run{position:fixed;right:24px;bottom:24px;z-index:10000;width:250px;
      max-width:calc(100vw - 48px);background:var(--surface2);
      border:1px solid var(--amber-dim);border-radius:14px;padding:15px 18px 16px;
      box-shadow:0 18px 48px rgba(0,0,0,.5);font-family:'DM Sans',sans-serif;}
    .mytime-run.paused{border-color:var(--border);}
    .mytime-run-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;}
    .mytime-run-label{font-size:9.5px;font-weight:700;letter-spacing:1.4px;color:var(--amber);
      animation:mytimePulse 1.6s ease-in-out infinite;}
    .mytime-run.paused .mytime-run-label{color:var(--muted);animation:none;}
    @keyframes mytimePulse{0%,100%{opacity:1}50%{opacity:.45}}
    .mytime-run-hide{background:none;border:none;color:var(--muted);font-size:17px;
      cursor:pointer;line-height:1;padding:0 2px;}
    .mytime-run-hide:hover{color:var(--text);}
    .mytime-run-task{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.3;word-break:break-word;}
    .mytime-run-proj{font-size:11px;color:var(--muted);margin-top:3px;}
    .mytime-run-clock{font-family:'JetBrains Mono',monospace;font-size:38px;font-weight:700;
      color:var(--amber);text-align:center;margin:14px 0 16px;letter-spacing:1px;
      font-variant-numeric:tabular-nums;}
    .mytime-run.paused .mytime-run-clock{color:var(--muted);}
    .mytime-run-btns{display:flex;gap:8px;}
    .mytime-run-pause,.mytime-run-stop{flex:1;border-radius:9px;font-family:'DM Sans',sans-serif;
      font-size:13px;font-weight:700;letter-spacing:.4px;padding:12px 6px;cursor:pointer;
      transition:filter .15s,background .15s;white-space:nowrap;}
    .mytime-run-pause{background:transparent;border:1.5px solid var(--border);color:var(--text);}
    .mytime-run-pause:hover{border-color:var(--amber-dim);color:var(--amber);background:var(--amber-glow);}
    .mytime-run.paused .mytime-run-pause{background:var(--amber);border-color:var(--amber);color:#0e0e0f;}
    .mytime-run-stop{background:var(--amber);border:1.5px solid var(--amber);color:#0e0e0f;}
    .mytime-run.paused .mytime-run-stop{background:transparent;border-color:var(--border);color:var(--text);}
    .mytime-run-pause:active,.mytime-run-stop:active{transform:translateY(1px);}
    .mytime-run-note{margin-top:9px;text-align:center;font-size:10.5px;color:var(--muted);}
    .mytime-run-stale{display:none;}
    .mytime-run.stale{border-color:var(--red);}
    .mytime-run.stale .mytime-run-label{color:var(--red);animation:none;}
    .mytime-run.stale .mytime-run-clock{color:var(--red);font-size:30px;margin:10px 0 12px;}
    .mytime-run.stale .mytime-run-stale{display:block;margin-bottom:12px;}
    .mytime-run.stale .mytime-run-btns{opacity:.55;}
    .mytime-stale-msg{font-size:11.5px;color:var(--text);line-height:1.5;margin-bottom:10px;}
    .mytime-stale-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}
    .mytime-stale-inp{width:64px;background:var(--surface3);border:1px solid var(--border);
      border-radius:6px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;
      padding:6px 8px;outline:none;text-align:right;}
    .mytime-stale-inp:focus{border-color:var(--amber-dim);}
    .mytime-stale-log{flex:1;background:var(--amber);border:none;border-radius:7px;color:#0e0e0f;
      font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:700;padding:7px 10px;cursor:pointer;}
    .mytime-stale-log:hover{filter:brightness(1.08);}
    .mytime-stale-discard{width:100%;margin-top:8px;background:transparent;
      border:1px solid var(--border);border-radius:7px;color:var(--muted);
      font-family:'DM Sans',sans-serif;font-size:11.5px;padding:7px;cursor:pointer;}
    .mytime-stale-discard:hover{border-color:var(--red);color:var(--red);}
    .mytime-day-note{font-size:10.5px;color:var(--muted);line-height:1.45;
      padding:2px 2px 6px;word-break:break-word;}

    /* ---- My Billing panel ---- */
    .mb-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;
      margin-bottom:26px;flex-wrap:wrap;}
    .mb-title{font-family:'DM Serif Display',serif;font-size:24px;color:var(--text);}
    .mb-sub{font-size:12.5px;color:var(--muted);margin-top:5px;max-width:520px;line-height:1.6;}
    .mb-big{text-align:right;}
    .mb-big-val{font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:700;color:var(--amber);}
    .mb-big-lbl{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;
      color:var(--muted);margin-top:3px;}
    .mb-sec{font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;
      color:var(--muted);margin:26px 0 12px;display:flex;align-items:center;gap:10px;}
    .mb-sec::after{content:'';flex:1;height:1px;background:var(--border);}
    .mb-sec-meta{font-weight:600;letter-spacing:.4px;text-transform:none;font-size:11.5px;color:var(--text);}
    .mb-tasks{display:flex;flex-direction:column;gap:1px;}
    .mb-task{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:7px;
      background:var(--surface);border:1px solid transparent;}
    .mb-task-name{flex:1;font-size:13px;color:var(--text);}
    .mb-task-hrs{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);}
    .mb-month-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;
      margin:20px 0 4px;}
    .mb-mtile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:13px 16px;}
    .mb-mval{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;color:var(--text);}
    .mb-mval.mb-green{color:var(--green);} .mb-mval.mb-amber{color:var(--amber);}
    .mb-mlbl{font-size:10.5px;color:var(--muted);margin-top:4px;line-height:1.4;}
    .mb-month{border:1px solid var(--border);border-radius:10px;overflow:hidden;
      background:var(--surface);margin-bottom:10px;}
    .mb-month-head{display:flex;align-items:center;gap:12px;padding:9px 14px;background:var(--surface2);
      border-bottom:1px solid var(--border);}
    .mb-month-name{font-size:12.5px;font-weight:700;color:var(--text);}
    .mb-month-meta{flex:1;font-size:11.5px;color:var(--muted);}
    .mb-month-amt{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--amber);}
    .mb-month-sel{background:transparent;border:1.5px solid var(--border);border-radius:6px;
      color:var(--muted);font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;
      padding:3px 10px;cursor:pointer;min-width:54px;}
    .mb-month-sel:hover{border-color:var(--amber-dim);color:var(--amber);}
    .mb-list{border-radius:10px;overflow:visible;}
    .mb-row{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;
      border-bottom:1px solid var(--border);font-size:13px;}
    .mb-row:last-child{border-bottom:none;}
    .mb-row:hover{background:var(--surface2);}
    .mb-cb{width:15px;height:15px;accent-color:var(--amber);cursor:pointer;flex-shrink:0;}
    .mb-date{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);width:110px;flex-shrink:0;}
    .mb-name{flex:1;color:var(--text);}
    .mb-hrs{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);
      width:110px;text-align:right;flex-shrink:0;}
    .mb-amt{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;
      color:var(--amber);width:92px;text-align:right;flex-shrink:0;}
    .mb-actions{display:flex;align-items:center;gap:10px;margin-top:12px;}
    .mb-selinfo{flex:1;font-size:12px;color:var(--muted);}
    .mb-selall{background:transparent;border:1.5px solid var(--border);border-radius:7px;
      color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:8px 14px;cursor:pointer;}
    .mb-selall:hover{border-color:var(--amber-dim);color:var(--amber);}
    .mb-mark{background:var(--amber);border:none;border-radius:7px;color:#0e0e0f;
      font-family:'DM Sans',sans-serif;font-size:12.5px;font-weight:700;padding:8px 18px;cursor:pointer;}
    .mb-mark:disabled{opacity:.35;cursor:default;background:transparent;
      border:1.5px solid var(--border);color:var(--muted);}
    .mb-run{border:1px solid var(--border);border-radius:10px;margin-bottom:10px;
      overflow:hidden;background:var(--surface);}
    .mb-run-head{display:flex;align-items:center;gap:12px;padding:10px 14px;
      background:var(--surface2);font-size:12.5px;font-weight:600;color:var(--text);}
    .mb-run-meta{flex:1;font-weight:400;color:var(--muted);font-size:11.5px;}
    .mb-run-amt{font-family:'JetBrains Mono',monospace;color:var(--green);font-weight:700;}
    .mb-hist{display:flex;align-items:center;gap:12px;padding:8px 14px;font-size:12.5px;
      color:var(--muted);border-top:1px solid var(--border);}
    .mb-undo{background:none;border:none;color:transparent;cursor:pointer;font-size:15px;padding:0 2px;}
    .mb-hist:hover .mb-undo{color:var(--muted);}
    .mb-undo:hover{color:var(--amber);}
    .mb-empty{font-size:13px;color:var(--muted);padding:14px;}
    /* two payers: BLI wears the app's amber, NULabs a cool blue, so a glance
       at a row tells you who is paying without reading the label. */
    .mb-payers{display:flex;gap:6px;flex-shrink:0;}
    .mb-p{background:transparent;border:1.5px solid var(--border);border-radius:20px;
      color:var(--muted);font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;
      letter-spacing:.4px;padding:5px 12px;cursor:pointer;transition:all .15s;min-width:68px;}
    .mb-p:hover{border-color:var(--muted);color:var(--text);}
    .mb-p.on.bli{background:var(--amber);border-color:var(--amber);color:#0e0e0f;}
    .mb-p.on.nu{background:#5b9cf6;border-color:#5b9cf6;color:#0b1220;}
    .mb-task.bli{border-color:var(--amber-dim);background:var(--amber-glow);}
    .mb-task.nu{border-color:rgba(91,156,246,.35);background:rgba(91,156,246,.08);}
    .mb-tag{font-size:9.5px;font-weight:800;letter-spacing:.7px;padding:2px 7px;border-radius:20px;
      flex-shrink:0;line-height:1.5;}
    .mb-tag.bli{background:var(--amber-glow);color:var(--amber);border:1px solid var(--amber-dim);}
    .mb-tag.nu{background:rgba(91,156,246,.12);color:#5b9cf6;border:1px solid rgba(91,156,246,.35);}
    .mb-mtile.bli{border-color:var(--amber-dim);}
    .mb-mtile.nu{border-color:rgba(91,156,246,.35);}
    .mb-mval.mb-blue{color:#5b9cf6;}
    .mb-msub{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted);
      margin-top:7px;padding-top:6px;border-top:1px solid var(--border);}
    .mb-split{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);
      font-weight:400;letter-spacing:.2px;}
    .mb-grp{display:flex;align-items:baseline;gap:10px;margin:16px 0 5px;padding-bottom:5px;
      border-bottom:1px solid var(--border);}
    .mb-grp:first-child{margin-top:2px;}
    .mb-grp-name{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;
      color:var(--text);}
    .mb-grp-meta{flex:1;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);}
    .mb-task{flex-wrap:wrap;}
    .mb-task.both{border-color:var(--border);}
    .mb-slider{flex-basis:100%;display:flex;align-items:center;gap:12px;
      padding:8px 2px 2px;margin-top:6px;border-top:1px dashed var(--border);}
    .mb-sh{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;
      white-space:nowrap;min-width:132px;}
    .mb-sh.bli{color:var(--amber);}
    .mb-sh.nu{color:#5b9cf6;text-align:right;}
    .mb-range{flex:1;height:4px;-webkit-appearance:none;appearance:none;border-radius:3px;
      background:linear-gradient(90deg,var(--amber) 0 50%,#5b9cf6 50% 100%);
      outline:none;cursor:ew-resize;}
    .mb-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;
      border-radius:50%;background:var(--text);border:2px solid var(--surface);cursor:ew-resize;
      box-shadow:0 1px 4px rgba(0,0,0,.4);}
    .mb-range::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--text);
      border:2px solid var(--surface);cursor:ew-resize;}
    .mytime-hrs-hit{cursor:pointer;}
    .mytime-hrs-hit:hover{outline:1px dashed var(--amber-dim);outline-offset:-2px;border-radius:4px;}
    .mytime-pop{position:fixed;z-index:10001;width:390px;max-width:calc(100vw - 32px);
      background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px;
      box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:'DM Sans',sans-serif;}
    .mytime-pop-head{font-size:15px;font-weight:700;color:var(--text);margin-bottom:14px;
      padding-bottom:12px;border-bottom:1px solid var(--border);
      display:flex;justify-content:space-between;gap:12px;align-items:baseline;}
    .mytime-pop-total{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:700;
      color:var(--amber);white-space:nowrap;}
    .mytime-pop-list{max-height:300px;overflow-y:auto;margin-bottom:14px;}
    .mytime-day{display:flex;align-items:center;gap:10px;padding:7px 2px;
      border-bottom:1px solid rgba(46,46,51,.6);font-size:13px;color:var(--muted);}
    .mytime-day:last-child{border-bottom:none;}
    .mytime-day-when{flex:1;}
    .mytime-day-inp{width:76px;background:var(--surface3);border:1px solid var(--border);
      border-radius:6px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;
      padding:5px 8px;outline:none;text-align:right;}
    .mytime-day-inp:focus{border-color:var(--amber-dim);}
    .mytime-day-h{font-size:12px;color:var(--muted);width:10px;}
    .mytime-day-del{background:none;border:none;color:transparent;cursor:pointer;
      font-size:17px;padding:0 4px;line-height:1;}
    .mytime-day:hover .mytime-day-del{color:var(--muted);}
    .mytime-day-del:hover{color:var(--red);}
    .mytime-empty{font-size:13px;color:var(--muted);padding:10px 0;}
    .mytime-day.removed{opacity:.45;}
    .mytime-day.removed .mytime-day-when{text-decoration:line-through;}
    .mytime-day.removed .mytime-day-del{color:var(--amber);}
    .mytime-day-date{background:var(--surface3);border:1px solid var(--border);border-radius:6px;
      color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:4px 7px;
      outline:none;width:135px;flex:none;min-width:0;}
    .mytime-day-date:focus{border-color:var(--amber-dim);}
    .mytime-day-txt{background:var(--surface3);border:1px solid var(--border);border-radius:6px;
      color:var(--text);font-family:'DM Sans',sans-serif;font-size:12.5px;padding:5px 8px;
      outline:none;flex:1;min-width:0;}
    .mytime-day-txt:focus{border-color:var(--amber-dim);}
    .mytime-day-parsed{font-family:'JetBrains Mono',monospace;font-size:11.5px;
      min-width:46px;text-align:right;}
    .mytime-day-parsed.ok{color:var(--amber);}
    .mytime-day-parsed.bad{color:var(--red);}
    .mytime-addrow{width:100%;background:transparent;border:1px dashed var(--border);
      border-radius:7px;color:var(--muted);font-family:'DM Sans',sans-serif;font-size:12.5px;
      padding:8px;cursor:pointer;margin-bottom:14px;transition:all .15s;}
    .mytime-addrow:hover{border-color:var(--amber-dim);color:var(--amber);background:var(--amber-glow);}
    .mytime-foot{display:flex;align-items:center;gap:8px;}
    .mytime-dirty{flex:1;font-size:11px;color:var(--amber);}
    .mytime-cancel{background:transparent;border:1.5px solid var(--border);border-radius:7px;
      color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
      padding:8px 14px;cursor:pointer;}
    .mytime-cancel:hover{border-color:var(--muted);}
    .mytime-save{background:var(--amber);border:1.5px solid var(--amber);border-radius:7px;
      color:#0e0e0f;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;
      padding:8px 18px;cursor:pointer;transition:opacity .15s;}
    .mytime-save:hover:not(:disabled){filter:brightness(1.08);}
    .mytime-save:disabled{opacity:.35;cursor:default;background:transparent;
      border-color:var(--border);color:var(--muted);}
  `;
  document.head.appendChild(css);

  // ==========================================================================
  // MY BILLING — what my own hours are worth, and to whom
  //
  // Two payers. Some work benefits Ballantine (BLI), a sister company sharing
  // the building; some benefits NULabs; some benefits both, and those get a
  // share each. Everything is valued at the same flat rate.
  //
  // BLI hours are money to collect. NULabs hours are a reference figure — the
  // dollar value of direct work done on top of an owner's draw — so they are
  // totalled the same way but never presented as a receivable. Which is exactly
  // why the two sides SETTLE INDEPENDENTLY: you will invoice BLI and you will
  // never "invoice" NULabs, so a shared day must be able to have its BLI half
  // accounted for while its NULabs half stays open forever.
  //
  // That is the one thing to hold on to in here: every open/settled figure is
  // keyed on (task, day, payer), never on (task, day). Getting that wrong makes
  // a half-settled shared day re-split its own remainder.
  //
  // Nothing here touches NULabs revenue, job costing or the shared schema. It
  // reads timesheet_entries and annotates them in two private tables.
  // ==========================================================================

  const MY_RATE = 100;                    // $/hour, snapshotted onto each row

  const PAYERS = {
    BLI:    { key: 'BLI',    label: 'BLI',    cls: 'bli', full: 'Ballantine' },
    NULABS: { key: 'NULABS', label: 'NULabs', cls: 'nu',  full: 'NULabs' },
  };
  const PAYER_KEYS = ['BLI', 'NULABS'];
  const otherPayer = p => (p === 'BLI' ? 'NULABS' : 'BLI');
  const noShares = () => ({ BLI: 0, NULABS: 0 });

  let billable = new Map();               // task_id -> { BLI: pct, NULABS: pct }
  let billedBy = new Map();               // task|YYYY-MM-DD|payer -> share-hours settled
  let billedRows = [];                    // history
  let myEntries = [];                     // flattened {taskId, taskName, projId, date, hours}
  let billSel = new Set();                // checked keys in the unaccounted list
  let taskMeta = new Map();               // task_id -> { sectionId, num, projId }
  let sectionMap = new Map();             // section_id -> { name, num, projId }
  let projNames = new Map();              // project_id -> name

  // Every key in this panel carries the payer. See the header comment.
  const dayKey = (taskId, d, payer) => taskId + '|' + localDate(d) + '|' + payer;
  const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = n => Math.round(n * 100) / 100;

  const sharesOf = taskId => billable.get(taskId) || null;
  const pctFor = (taskId, p) => { const s = billable.get(taskId); return s ? (s[p] || 0) : 0; };
  const activePayers = taskId => {
    const s = billable.get(taskId);
    return s ? PAYER_KEYS.filter(k => s[k] > 0) : [];
  };
  const payerMeta = k => PAYERS[k] || { key: k, label: k || '?', cls: '', full: k || '?' };

  // Each source is loaded independently. A brand-new table or column can 404
  // until PostgREST reloads its schema cache, and one such failure must not
  // blank the whole panel — you'd see "no hours" and think your data was gone.
  let billingError = '';

  async function loadBilling() {
    myEntries = []; billable = new Map(); billedBy = new Map(); billedRows = [];
    taskMeta = new Map(); sectionMap = new Map(); projNames = new Map();
    billingError = '';

    try {
      const { data, error } = await sb.from('timesheet_entries')
        .select('task_id, task_name, project_id, week_start, hours_json')
        .eq('employee_id', currentEmployee.id).eq('is_overhead', false);
      if (error) throw error;
      (data || []).forEach(r => {
        let hj = {};
        try { hj = JSON.parse(r.hours_json || '{}'); } catch (_) {}
        Object.keys(hj).forEach(k => {
          const h = parseFloat(hj[k]) || 0;
          if (h <= 0 || !r.task_id) return;
          const d = new Date(r.week_start + 'T00:00:00');
          d.setDate(d.getDate() + parseInt(k, 10));
          myEntries.push({ taskId: r.task_id, taskName: r.task_name || nameOf(r.task_id) || 'Task',
                           projId: r.project_id, date: d, hours: h });
        });
      });
      myEntries.sort((a, b) => b.date - a.date);
    } catch (e) {
      warn('hours load failed', e.message || e);
      billingError = 'Could not load your hours: ' + (e.message || 'unknown error');
    }

    // Section headings, so this list reads in the same order as the project
    // page does. Purely cosmetic: if any of it fails the list falls back to one
    // flat group, which is exactly what it was before.
    try {
      const taskIds = [...new Set(myEntries.map(e => e.taskId))];
      const projIds = [...new Set(myEntries.map(e => e.projId).filter(Boolean))];
      if (taskIds.length) {
        const { data, error } = await sb.from('tasks')
          .select('id, section_id, task_num, project_id').in('id', taskIds);
        if (error) throw error;
        (data || []).forEach(r => taskMeta.set(r.id, {
          sectionId: r.section_id || null,
          num: r.task_num == null ? 9999 : Number(r.task_num),
          projId: r.project_id || null,
        }));
      }
      if (projIds.length) {
        const { data, error } = await sb.from('task_sections')
          .select('id, name, task_num, project_id').in('project_id', projIds);
        if (error) throw error;
        (data || []).forEach(r => sectionMap.set(r.id, {
          name: r.name || 'Section', num: Number(r.task_num) || 0, projId: r.project_id,
        }));
        const pr = await sb.from('projects').select('id, name').in('id', projIds);
        if (pr.error) throw pr.error;
        (pr.data || []).forEach(p => projNames.set(p.id, p.name || ''));
      }
    } catch (e) { warn('section load failed', e.message || e); }

    try {
      const { data, error } = await sb.from('my_billable_tasks')
        .select('task_id, payer, pct').eq('employee_id', currentEmployee.id);
      if (error) throw error;
      (data || []).forEach(r => {
        const s = billable.get(r.task_id) || noShares();
        if (s[r.payer] !== undefined) s[r.payer] += Number(r.pct) || 0;
        billable.set(r.task_id, s);
      });
      // A task whose shares all came back zero is unassigned, not "assigned 0%".
      [...billable.keys()].forEach(k => {
        const s = billable.get(k);
        if (!PAYER_KEYS.some(p => s[p] > 0)) billable.delete(k);
      });
    } catch (e) {
      warn('billable load failed', e.message || e);
      billingError = 'Could not load billing settings: ' + (e.message || 'unknown error');
    }

    try {
      const { data, error } = await sb.from('my_billed_time')
        .select('*').eq('employee_id', currentEmployee.id)
        .order('billed_on', { ascending: false });
      if (error) throw error;
      billedRows = data || [];
      // r.hours is already this company's share in hours — never re-multiply
      // it by r.pct. See the column comment in personal_billing_split_semantics.
      billedRows.forEach(r => {
        const k = r.task_id + '|' + r.work_date + '|' + (r.payer || 'BLI');
        billedBy.set(k, (billedBy.get(k) || 0) + Number(r.hours));
      });
    } catch (e) {
      warn('billed load failed', e.message || e);
      billingError = 'Could not load billing history: ' + (e.message || 'unknown error');
    }
  }

  // What one company owes on one day of one task, in hours.
  const shareHours = (e, p) => round2(e.hours * (pctFor(e.taskId, p) / 100));

  // ...minus what has already been settled for THAT COMPANY. Editing a day's
  // hours upward resurfaces only the difference, and only on the side that grew.
  const openHours = (e, p) =>
    Math.max(0, round2(shareHours(e, p) - (billedBy.get(dayKey(e.taskId, e.date, p)) || 0)));

  // ---- assignment ----------------------------------------------------------
  // Rows are replaced wholesale rather than patched: inserting a second payer
  // before clearing the first would trip the 100% guard, and a half-applied
  // change to who owes what is worse than a failed one.
  async function setShares(taskId, shares) {
    const rows = PAYER_KEYS
      .filter(p => (shares[p] || 0) > 0)
      .map(p => ({ employee_id: currentEmployee.id, task_id: taskId, payer: p,
                   pct: shares[p], updated_at: new Date().toISOString() }));
    try {
      const { error: delErr } = await sb.from('my_billable_tasks')
        .delete().eq('employee_id', currentEmployee.id).eq('task_id', taskId);
      if (delErr) throw delErr;

      if (rows.length) {
        const { error } = await sb.from('my_billable_tasks').insert(rows);
        if (error) throw error;
        const s = noShares();
        rows.forEach(r => s[r.payer] = r.pct);
        billable.set(taskId, s);
      } else {
        billable.delete(taskId);
      }
      // Selections naming a payer this task no longer has would be invisible
      // but still counted in the totals below.
      PAYER_KEYS.filter(p => !(shares[p] > 0)).forEach(p => {
        [...billSel].forEach(k => { if (k.startsWith(taskId + '|') && k.endsWith('|' + p)) billSel.delete(k); });
      });
      renderBilling();
    } catch (e) {
      warn('setShares failed', e);
      say('⚠ Could not save: ' + (e.message || ''));
      await loadBilling(); renderBilling();
    }
  }

  // Clicking a pill: off → on takes the whole task, or splits it evenly if the
  // other company already has it. On → off hands the whole task to the other,
  // or unassigns it entirely when there is no other.
  function togglePayer(taskId, p) {
    const cur = sharesOf(taskId) || noShares();
    const oth = otherPayer(p);
    const next = noShares();
    if (cur[p] > 0) {
      if (cur[oth] > 0) next[oth] = 100;
    } else {
      if (cur[oth] > 0) { next[p] = 50; next[oth] = 50; }
      else next[p] = 100;
    }
    setShares(taskId, next);
  }

  const setSplit = (taskId, bliPct) =>
    setShares(taskId, { BLI: bliPct, NULABS: 100 - bliPct });

  async function markAccounted() {
    // One row per (day, company) — a shared day settles one side at a time.
    const picks = [];
    myEntries.forEach(e => {
      activePayers(e.taskId).forEach(p => {
        if (!billSel.has(dayKey(e.taskId, e.date, p))) return;
        const hrs = openHours(e, p);
        if (hrs > 0) picks.push({ e, p, hrs });
      });
    });
    if (!picks.length) return;

    const rows = picks.map(({ e, p, hrs }) => ({
      employee_id: currentEmployee.id, task_id: e.taskId, task_name: e.taskName,
      project_id: e.projId, work_date: localDate(e.date), payer: p,
      hours: hrs, pct: pctFor(e.taskId, p), rate: MY_RATE,
      amount: round2(hrs * MY_RATE),
    }));
    try {
      const { error } = await sb.from('my_billed_time').insert(rows);
      if (error) throw error;
      const byPayer = {};
      rows.forEach(r => { byPayer[r.payer] = (byPayer[r.payer] || 0) + r.amount; });
      const parts = PAYER_KEYS.filter(k => byPayer[k])
        .map(k => payerMeta(k).label + ' ' + money(byPayer[k]));
      say('✓ Accounted for ' + rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies')
          + ' — ' + parts.join(' · '));
      billSel.clear();
      await loadBilling();
      renderBilling();
    } catch (e) { warn('markAccounted failed', e); say('⚠ Could not save: ' + (e.message || '')); }
  }

  async function unaccount(rowId) {
    try {
      const { error } = await sb.from('my_billed_time').delete().eq('id', rowId);
      if (error) throw error;
      await loadBilling(); renderBilling();
      say('Moved back to not accounted for');
    } catch (e) { warn('unaccount failed', e); say('⚠ Could not undo'); }
  }

  // ---- panel ---------------------------------------------------------------
  function ensureBillingPanel() {
    if (document.getElementById('panel-mybilling')) return;
    const sibling = document.getElementById('panel-mytasks');
    if (!sibling || !sibling.parentNode) return;
    const p = document.createElement('div');
    p.className = 'view-panel';
    p.id = 'panel-mybilling';
    p.style.cssText = 'flex-direction:column;overflow:hidden;';
    p.innerHTML = '<div style="flex:1;overflow-y:auto;padding:24px 28px"><div id="myBillingWrap"></div></div>';
    sibling.parentNode.insertBefore(p, sibling.nextSibling);
  }

  function ensureBillingNav() {
    if (document.getElementById('navMyBilling')) return;
    const anchor = document.getElementById('navMyTasks');
    if (!anchor || !anchor.parentNode) return;
    const item = document.createElement('div');
    item.className = 'nav-item';
    item.id = 'navMyBilling';
    item.innerHTML = '<span class="icon">&#128176;</span> My Billing';
    item.onclick = () => openBillingPanel(item);
    anchor.parentNode.insertBefore(item, anchor.nextSibling);
  }

  async function openBillingPanel(el) {
    ensureBillingPanel();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');
    if (typeof activeProjectId !== 'undefined') activeProjectId = null;
    const tb = document.getElementById('topbarName'); if (tb) tb.textContent = 'My Billing';
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('panel-mybilling');
    if (panel) panel.classList.add('active');
    const wrap = document.getElementById('myBillingWrap');
    if (wrap) wrap.innerHTML = '<div style="color:var(--muted);font-size:13px">Loading…</div>';
    await loadBilling();
    renderBilling();
  }

  function renderBilling() {
    const wrap = document.getElementById('myBillingWrap');
    if (!wrap) return;

    // --- tasks with hours, for the payer pills ---
    const byTask = new Map();
    myEntries.forEach(e => {
      const t = byTask.get(e.taskId) || { taskId: e.taskId, name: e.taskName, hours: 0 };
      t.hours += e.hours; byTask.set(e.taskId, t);
    });
    const tasks = [...byTask.values()];

    const taskRow = t => {
      const on = activePayers(t.taskId);
      const split = on.length === 2;
      const bli = pctFor(t.taskId, 'BLI');
      const cls = split ? ' both' : (on.length ? ' ' + payerMeta(on[0]).cls : '');
      // The row's background is the split itself — amber up to BLI's share,
      // blue after it — so the proportion reads without looking at a number.
      const bg = split
        ? ` style="background:linear-gradient(90deg,var(--amber-glow) 0 ${bli}%,rgba(91,156,246,.10) ${bli}% 100%)"`
        : '';
      const pills = PAYER_KEYS.map(k => {
        const m = PAYERS[k], lit = pctFor(t.taskId, k) > 0;
        const title = lit
          ? (split ? 'Click to give the whole task to ' + PAYERS[otherPayer(k)].full
                   : 'Click to unassign')
          : (on.length ? 'Click to split it with ' + m.full : 'Charge to ' + m.full);
        return `<button class="mb-p ${m.cls}${lit ? ' on' : ''}" data-task="${t.taskId}"
                  data-payer="${k}" title="${esc(title)}">${m.label}</button>`;
      }).join('');
      const slider = split ? `<div class="mb-slider">
            <span class="mb-sh bli" data-for="${t.taskId}" data-side="bli">BLI ${bli}% &middot; ${money(t.hours * bli / 100 * MY_RATE)}</span>
            <input type="range" class="mb-range" data-task="${t.taskId}" data-hours="${t.hours}"
                   min="5" max="95" step="5" value="${bli}">
            <span class="mb-sh nu" data-for="${t.taskId}" data-side="nu">${money(t.hours * (100 - bli) / 100 * MY_RATE)} &middot; NULabs ${100 - bli}%</span>
          </div>` : '';
      return `<div class="mb-task${cls}" data-task="${t.taskId}"${bg}>
          <span class="mb-task-name">${esc(t.name)}</span>
          <span class="mb-task-hrs">${t.hours.toFixed(2)}h</span>
          <span class="mb-payers">${pills}</span>
          ${slider}
        </div>`;
    };

    // Grouped by section, in the project's own order — same reading order as the
    // project page, so you're not hunting for a task in a list sorted a third way.
    const groups = [];
    tasks.forEach(t => {
      const meta = taskMeta.get(t.taskId) || {};
      const sec = meta.sectionId ? sectionMap.get(meta.sectionId) : null;
      const projId = meta.projId || t.projId || null;
      const key = (projId || '-') + '|' + (meta.sectionId || '~none');
      let g = groups.find(x => x.key === key);
      if (!g) {
        g = { key: key, projId: projId, name: sec ? sec.name : 'Unsectioned',
              secNum: sec ? sec.num : 1e9,        // unsectioned sinks to the bottom
              rows: [] };
        groups.push(g);
      }
      g.rows.push(t);
    });
    const multiProj = new Set(groups.map(g => g.projId)).size > 1;
    groups.sort((a, b) =>
      (multiProj ? (projNames.get(a.projId) || '').localeCompare(projNames.get(b.projId) || '') : 0)
      || a.secNum - b.secNum);
    const numOf = t => (taskMeta.get(t.taskId) || {}).num || 9999;
    groups.forEach(g => g.rows.sort((a, b) => numOf(a) - numOf(b) || a.name.localeCompare(b.name)));

    // With no section data at all there is one nameless group; a lone
    // "Unsectioned" banner over the whole list would be noise, so drop it.
    const showHeads = !(groups.length === 1 && groups[0].secNum === 1e9);

    const taskRows = groups.map(g => {
      const hrs = g.rows.reduce((s, t) => s + t.hours, 0);
      const by = {};
      PAYER_KEYS.forEach(p => by[p] = g.rows.reduce((s, t) => s + t.hours * pctFor(t.taskId, p) / 100, 0) * MY_RATE);
      const parts = PAYER_KEYS.filter(p => by[p] > 0).map(p => payerMeta(p).label + ' ' + money(by[p]));
      const head = showHeads ? `<div class="mb-grp">
            <span class="mb-grp-name">${esc(multiProj && g.projId ? (projNames.get(g.projId) || '') + ' · ' : '')}${esc(g.name)}</span>
            <span class="mb-grp-meta">${hrs.toFixed(2)}h${parts.length ? ' &middot; ' + parts.join(' &middot; ') : ' &middot; unassigned'}</span>
          </div>` : '';
      return head + g.rows.map(taskRow).join('');
    }).join('') || '<div class="mb-empty">No tracked hours yet.</div>';

    // --- per-company totals -------------------------------------------------
    const now = new Date();
    const mk = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const monthName = d => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const inMonth = d => monthKey(d) === mk;

    const stat = {};
    PAYER_KEYS.forEach(k => stat[k] = { monthH: 0, allH: 0, openH: 0, openAmt: 0, settled: 0 });
    myEntries.forEach(e => {
      activePayers(e.taskId).forEach(p => {
        const s = stat[p], h = shareHours(e, p);
        s.allH += h;
        if (inMonth(e.date)) s.monthH += h;
        const oh = openHours(e, p);
        s.openH += oh; s.openAmt += oh * MY_RATE;
      });
    });
    billedRows.forEach(r => {
      const s = stat[r.payer || 'BLI']; if (!s) return;
      s.settled += Number(r.amount);
    });

    const workedMonth = myEntries.filter(e => inMonth(e.date)).reduce((s, e) => s + e.hours, 0);
    const workedAll   = myEntries.reduce((s, e) => s + e.hours, 0);
    const openTotal   = PAYER_KEYS.reduce((s, k) => s + stat[k].openAmt, 0);
    const splitLine = pick => PAYER_KEYS
      .map(k => payerMeta(k).label + ' ' + money(pick(stat[k])))
      .join(' · ');

    const payerTiles = PAYER_KEYS.map(k => {
      const m = PAYERS[k], s = stat[k];
      return `<div class="mb-mtile ${m.cls}">
          <div class="mb-mval ${m.cls === 'nu' ? 'mb-blue' : 'mb-amber'}">${money(s.allH * MY_RATE)}</div>
          <div class="mb-mlbl">${esc(m.label)} &mdash; all time &middot; ${s.allH.toFixed(2)}h</div>
          <div class="mb-msub">${money(s.monthH * MY_RATE)} this month &middot; ${s.monthH.toFixed(2)}h<br>
            ${money(s.settled)} settled &middot; ${money(s.openAmt)} open</div>
        </div>`;
    }).join('');

    // --- not accounted for --------------------------------------------------
    // One line per (day, company). A shared day appears twice, on purpose:
    // you settle the BLI half and leave the NULabs half open.
    const open = [];
    myEntries.forEach(e => {
      activePayers(e.taskId).forEach(p => {
        const hrs = openHours(e, p);
        if (hrs > 0) open.push({ e, p, hrs, amt: hrs * MY_RATE, k: dayKey(e.taskId, e.date, p) });
      });
    });
    const selTotal = open.filter(o => billSel.has(o.k)).reduce((s, o) => s + o.amt, 0);

    const fmtD = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // Grouped by month, because that's the unit you invoice in.
    const months = [];
    open.forEach(o => {
      const key = monthKey(o.e.date);
      let g = months.find(m => m.key === key);
      if (!g) {
        g = { key: key, label: monthName(o.e.date), rows: [], hours: 0, amount: 0, by: {} };
        PAYER_KEYS.forEach(p => g.by[p] = 0);
        months.push(g);
      }
      g.rows.push(o); g.hours += o.hrs; g.amount += o.amt; g.by[o.p] += o.amt;
    });

    const openRows = months.map(g => {
      const allPicked = g.rows.every(o => billSel.has(o.k));
      const split = PAYER_KEYS.filter(k => g.by[k] > 0)
        .map(k => payerMeta(k).label + ' ' + money(g.by[k])).join(' · ');
      return `<div class="mb-month">
          <div class="mb-month-head">
            <button class="mb-month-sel" data-month="${g.key}">${allPicked ? 'Clear' : 'Select'}</button>
            <span class="mb-month-name">${esc(g.label)}</span>
            <span class="mb-month-meta">${g.rows.length} line${g.rows.length === 1 ? '' : 's'} &middot; ${g.hours.toFixed(2)}h
              <span class="mb-split">&nbsp;&nbsp;${esc(split)}</span></span>
            <span class="mb-month-amt">${money(g.amount)}</span>
          </div>
          ${g.rows.map(o => {
            const m = payerMeta(o.p), pct = pctFor(o.e.taskId, o.p);
            return `<label class="mb-row">
                <input type="checkbox" class="mb-cb" data-k="${o.k}" ${billSel.has(o.k) ? 'checked' : ''}>
                <span class="mb-date">${esc(fmtD(o.e.date))}</span>
                <span class="mb-tag ${m.cls}">${esc(m.label)}</span>
                <span class="mb-name">${esc(o.e.taskName)}</span>
                <span class="mb-hrs">${o.hrs.toFixed(2)}h${pct < 100 ? ' of ' + o.e.hours.toFixed(2) + 'h × ' + pct + '%' : ''}</span>
                <span class="mb-amt">${money(o.amt)}</span>
              </label>`;
          }).join('')}
        </div>`;
    }).join('') || '<div class="mb-empty">Nothing outstanding — every assigned hour is accounted for.</div>';

    // --- history ---
    const byRun = new Map();
    billedRows.forEach(r => {
      const g = byRun.get(r.billed_on) || { on: r.billed_on, n: 0, hours: 0, amount: 0, rows: [], by: {} };
      g.n++; g.hours += Number(r.hours); g.amount += Number(r.amount);
      const p = r.payer || 'BLI';
      g.by[p] = (g.by[p] || 0) + Number(r.amount);
      g.rows.push(r); byRun.set(r.billed_on, g);
    });
    const histRows = [...byRun.values()].map(g => {
      const split = PAYER_KEYS.filter(k => g.by[k] > 0)
        .map(k => payerMeta(k).label + ' ' + money(g.by[k])).join(' · ');
      return `
        <div class="mb-run">
          <div class="mb-run-head">
            <span>${esc(new Date(g.on + 'T00:00:00').toLocaleDateString('en-US',
                  { month: 'short', day: 'numeric', year: 'numeric' }))}</span>
            <span class="mb-run-meta">${g.n} line${g.n === 1 ? '' : 's'} &middot; ${g.hours.toFixed(2)}h
              <span class="mb-split">&nbsp;&nbsp;${esc(split)}</span></span>
            <span class="mb-run-amt">${money(g.amount)}</span>
          </div>
          ${g.rows.map(r => {
            const m = payerMeta(r.payer || 'BLI');
            return `<div class="mb-hist">
              <span>${esc(new Date(r.work_date + 'T00:00:00').toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric' }))}</span>
              <span class="mb-tag ${m.cls}">${esc(m.label)}</span>
              <span class="mb-name">${esc(r.task_name || '')}</span>
              <span class="mb-hrs">${Number(r.hours).toFixed(2)}h${Number(r.pct) < 100 ? ' @ ' + Number(r.pct) + '%' : ''}</span>
              <span class="mb-amt">${money(Number(r.amount))}</span>
              <button class="mb-undo" data-id="${r.id}" title="Move back to not accounted for">&#8630;</button>
            </div>`;
          }).join('')}
        </div>`;
    }).join('') || '<div class="mb-empty">Nothing accounted for yet.</div>';

    wrap.innerHTML = `
      ${billingError ? `<div class="mb-empty" style="color:var(--red)">${esc(billingError)}</div>` : ''}
      <div class="mb-head">
        <div>
          <div class="mb-title">My Billing</div>
          <div class="mb-sub">My own hours, valued at ${money(MY_RATE)}/hour and charged to one company or
            split between them. BLI is work to collect on; NULabs is the dollar value of direct work done on
            top of an owner&rsquo;s draw &mdash; a reference figure, not an invoice.</div>
        </div>
        <div class="mb-big">
          <div class="mb-big-val">${money(openTotal)}</div>
          <div class="mb-big-lbl">not accounted for</div>
        </div>
      </div>

      <div class="mb-month-strip">
        <div class="mb-mtile">
          <div class="mb-mval">${workedMonth.toFixed(2)}h</div>
          <div class="mb-mlbl">${esc(now.toLocaleDateString('en-US', { month: 'long' }))} &mdash; all hours worked</div>
          <div class="mb-msub">${workedAll.toFixed(2)}h all time</div>
        </div>
        ${payerTiles}
        <div class="mb-mtile">
          <div class="mb-mval mb-amber">${money(openTotal)}</div>
          <div class="mb-mlbl">not accounted for</div>
          <div class="mb-msub">${esc(splitLine(s => s.openAmt))}</div>
        </div>
      </div>

      <div class="mb-sec">Who pays for each task?
        <span class="mb-sec-meta">light both to split it &mdash; then drag</span>
      </div>
      <div class="mb-tasks">${taskRows}</div>

      <div class="mb-sec">Not accounted for
        <span class="mb-sec-meta">${open.length} line${open.length === 1 ? '' : 's'} &middot; ${money(openTotal)}</span>
      </div>
      <div class="mb-list">${openRows}</div>
      ${open.length ? `<div class="mb-actions">
          <span class="mb-selinfo">${billSel.size} selected${billSel.size ? ' · ' + money(selTotal) : ''}</span>
          <button class="mb-selall">Select all</button>
          <button class="mb-mark" ${billSel.size ? '' : 'disabled'}>Mark accounted for</button>
        </div>` : ''}

      <div class="mb-sec">Accounted for</div>
      <div class="mb-hist-wrap">${histRows}</div>`;

    wrap.querySelectorAll('.mb-p').forEach(b => {
      b.onclick = ev => { ev.preventDefault();
        togglePayer(b.getAttribute('data-task'), b.getAttribute('data-payer'));
      };
    });
    // Dragging repaints its own two labels; only the release writes, so a drag
    // across the track is one save rather than nineteen.
    wrap.querySelectorAll('.mb-range').forEach(r => {
      const id = r.getAttribute('data-task'), hrs = parseFloat(r.getAttribute('data-hours')) || 0;
      r.oninput = () => {
        const v = parseInt(r.value, 10);
        const a = wrap.querySelector('.mb-sh[data-for="' + id + '"][data-side="bli"]');
        const b = wrap.querySelector('.mb-sh[data-for="' + id + '"][data-side="nu"]');
        if (a) a.innerHTML = 'BLI ' + v + '% &middot; ' + money(hrs * v / 100 * MY_RATE);
        if (b) b.innerHTML = money(hrs * (100 - v) / 100 * MY_RATE) + ' &middot; NULabs ' + (100 - v) + '%';
        const row = r.closest('.mb-task');
        if (row) row.style.background =
          `linear-gradient(90deg,var(--amber-glow) 0 ${v}%,rgba(91,156,246,.10) ${v}% 100%)`;
      };
      r.onchange = () => setSplit(id, parseInt(r.value, 10));
    });
    wrap.querySelectorAll('.mb-cb').forEach(cb => {
      cb.onchange = () => {
        const k = cb.getAttribute('data-k');
        if (cb.checked) billSel.add(k); else billSel.delete(k);
        renderBilling();
      };
    });
    wrap.querySelectorAll('.mb-month-sel').forEach(b => {
      b.onclick = ev => { ev.preventDefault();
        const g = months.find(m => m.key === b.getAttribute('data-month'));
        if (!g) return;
        const allPicked = g.rows.every(o => billSel.has(o.k));
        g.rows.forEach(o => allPicked ? billSel.delete(o.k) : billSel.add(o.k));
        renderBilling();
      };
    });
    const selall = wrap.querySelector('.mb-selall');
    if (selall) selall.onclick = () => {
      const all = open.every(o => billSel.has(o.k));
      open.forEach(o => all ? billSel.delete(o.k) : billSel.add(o.k));
      renderBilling();
    };
    const mark = wrap.querySelector('.mb-mark');
    if (mark) mark.onclick = () => markAccounted();
    wrap.querySelectorAll('.mb-undo').forEach(b => {
      b.onclick = () => unaccount(b.getAttribute('data-id'));
    });
  }

  // ---- boot ----------------------------------------------------------------
  let waited = 0;
  (function boot() {
    if (typeof sb !== 'undefined' && sb &&
        typeof currentEmployee !== 'undefined' && currentEmployee && currentEmployee.id) {
      load();
    } else if ((waited += 500) <= 60000) {
      setTimeout(boot, 500);
    } else { warn('gave up waiting for sb / currentEmployee'); }
  })();

  window.myTime = {
    reload: load, start, stop, pause, resume,
    debug() {
      console.group('%c[mytime] health check', 'color:#e8a234');
      console.log('sb              :', typeof sb !== 'undefined' && !!sb);
      console.log('currentEmployee :', (typeof currentEmployee !== 'undefined' && currentEmployee)
                                        ? currentEmployee.name : 'MISSING');
      console.log('ready           :', ready);
      console.log('trackable       :', [...trackable]);
      console.log('active timer    :', timer);
      console.log('rows on screen  :', document.querySelectorAll('.itt-row[data-task-id]').length);
      console.groupEnd();
    },
  };
})();
