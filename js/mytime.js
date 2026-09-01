// ============================================================================
// mytime.js — stopwatch front-end for normal timesheet entry
//
// One line in index.html:
//     <script src="js/mytime.js?v=13"></script>
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
  async function stop(quiet) {
    if (!timer) return;
    const t = timer, secs = elapsedSeconds();
    const projId = t.project_id, taskId = t.task_id;

    try {
      if (secs >= MIN_SECONDS) {
        const hrs  = roundQuarter(secs / 3600);
        const when = new Date(t.sitting_started_at || t.started_at || Date.now());
        const ws   = weekStartOf(when);
        const day  = String(when.getDay());          // 0=Sun … 6=Sat, as stored

        // Read–modify–write: hours_json must be MERGED, not replaced, so an
        // existing day's hours (or another day in the same week) survive.
        const { data: rows, error: selErr } = await sb.from('timesheet_entries')
          .select('id, hours_json')
          .eq('week_start', ws).eq('employee_id', currentEmployee.id)
          .eq('task_id', taskId).eq('project_id', projId).limit(1);
        if (selErr) throw selErr;

        if (rows && rows.length) {
          const hj = JSON.parse(rows[0].hours_json || '{}');
          hj[day] = Math.round(((parseFloat(hj[day]) || 0) + hrs) * 100) / 100;
          const { error } = await sb.from('timesheet_entries')
            .update({ hours_json: JSON.stringify(hj) }).eq('id', rows[0].id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('timesheet_entries').insert({
            week_start: ws, employee_id: currentEmployee.id,
            task_id: taskId, project_id: projId,
            task_name: t.task_name || nameOf(taskId),
            is_overhead: false, hours_json: JSON.stringify({ [day]: hrs }),
          });
          if (error) throw error;
        }
        if (!quiet) say('⏹ Logged ' + hrs.toFixed(2) + 'h');
      } else if (!quiet) {
        say('Timer discarded — under 2 minutes');
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
        .select('id, week_start, hours_json')
        .eq('employee_id', currentEmployee.id).eq('task_id', taskId)
        .eq('is_overhead', false);
      if (error) throw error;
      (data || []).forEach(r => {
        let hj = {};
        try { hj = JSON.parse(r.hours_json || '{}'); } catch (_) {}
        Object.keys(hj).forEach(k => {
          const h = parseFloat(hj[k]) || 0;
          if (h <= 0) return;
          const d = new Date(r.week_start + 'T00:00:00');
          d.setDate(d.getDate() + parseInt(k, 10));
          out.push({ rowId: r.id, weekStart: r.week_start, dayIdx: parseInt(k, 10), date: d, hours: h });
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
        .select('id, hours_json')
        .eq('week_start', ws).eq('employee_id', currentEmployee.id)
        .eq('task_id', taskId).eq('project_id', projId).limit(1);
      if (selErr) throw selErr;

      if (rows && rows.length) {
        const hj = JSON.parse(rows[0].hours_json || '{}');
        if (hours > 0) hj[day] = Math.round(hours * 100) / 100; else delete hj[day];
        if (Object.keys(hj).length === 0) {
          const { error } = await sb.from('timesheet_entries').delete().eq('id', rows[0].id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('timesheet_entries')
            .update({ hours_json: JSON.stringify(hj) }).eq('id', rows[0].id);
          if (error) throw error;
        }
      } else if (hours > 0) {
        const { error } = await sb.from('timesheet_entries').insert({
          week_start: ws, employee_id: currentEmployee.id,
          task_id: taskId, project_id: projId, task_name: nameOf(taskId),
          is_overhead: false, hours_json: JSON.stringify({ [day]: Math.round(hours * 100) / 100 }),
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
      isNew: false, removed: false,
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
        + '<div class="mytime-run-btns">'
        +   '<button class="mytime-run-pause"></button>'
        +   '<button class="mytime-run-stop"></button>'
        + '</div>'
        + '<div class="mytime-run-note"></div>';
      runPanel.querySelector('.mytime-run-hide').onclick  = () => { runPanelHidden = true; closeRunPanel(); };
      runPanel.querySelector('.mytime-run-pause').onclick = () => (timer && timer.started_at ? pause() : resume());
      runPanel.querySelector('.mytime-run-stop').onclick  = () => stop();
      document.body.appendChild(runPanel);
    }
    paintRunPanel();
  }

  function paintRunPanel() {
    if (!timer) { closeRunPanel(); return; }
    if (runPanelHidden || !runPanel) return;
    const isPaused = !timer.started_at;
    const secs = elapsedSeconds();
    runPanel.classList.toggle('paused', isPaused);
    runPanel.querySelector('.mytime-run-label').innerHTML =
      isPaused ? '&#10073;&#10073; PAUSED' : '&#9679; TRACKING';
    runPanel.querySelector('.mytime-run-task').textContent =
      nameOf(timer.task_id) || timer.task_name || 'Task';
    runPanel.querySelector('.mytime-run-proj').textContent = projNameOf(timer.project_id);
    runPanel.querySelector('.mytime-run-clock').textContent = fmtClock(secs);
    runPanel.querySelector('.mytime-run-pause').innerHTML =
      isPaused ? '&#9654;&nbsp; RESUME' : '&#10073;&#10073;&nbsp; PAUSE';
    runPanel.querySelector('.mytime-run-stop').innerHTML = '&#9209;&nbsp; STOP';
    // Say plainly what will be written, so quarter-hour rounding is no surprise.
    runPanel.querySelector('.mytime-run-note').textContent =
      secs >= MIN_SECONDS ? ('will log ' + roundQuarter(secs / 3600).toFixed(2) + 'h')
                          : 'under 2 min — will be discarded';
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
