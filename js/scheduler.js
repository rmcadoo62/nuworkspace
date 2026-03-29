
// ===== SALES CATEGORY SCHEDULER / GANTT =====
// ===== SALES CATEGORY SCHEDULER / GANTT =====================
// ============================================================
(function() {

// ---- Sales categories (Y-axis assets) ----
// Named asset rows — rowId unique, cat drives color
const SCHED_ROWS = [
  { rowId: '11',            cat: '11', label: '11 – Acoustic Noise' },
  { rowId: '12',            cat: '12', label: '12 – Noise Emission' },
  { rowId: '51_emi_room',   cat: '51', label: '51 – EMI Room' },
  { rowId: '51_emi_elec',   cat: '51', label: '51 – EMI Electrical' },
  { rowId: '52_ling_vib',   cat: '52', label: '52 – Ling Vib' },
  { rowId: '52_ud_vib',     cat: '52', label: '52 – UD Vib' },
  { rowId: '53_10x10',      cat: '53', label: '53 – 10 x 10' },
  { rowId: '53_centrifuge', cat: '53', label: '53 – Centrifuge' },
  { rowId: '53_sexton',     cat: '53', label: '53 – Sexton 4 x 4' },
  { rowId: '53_tenney3',    cat: '53', label: '53 – Tenney 3 x 3' },
  { rowId: '53_tenney4',    cat: '53', label: '53 – Tenney 4 x 4' },
  { rowId: '53_tenneyjr',   cat: '53', label: '53 – Tenney Jr. 145' },
  { rowId: '55',            cat: '55', label: '55 – Salt Fog' },
  { rowId: '56',            cat: '56', label: '56 – Altitude 6 x 6' },
  { rowId: '58',            cat: '58', label: '58 – Wind & Rain' },
  { rowId: '59_monteray',   cat: '59', label: '59 – Monteray Shock' },
  { rowId: '59_pressure',   cat: '59', label: '59 – Pressure Vessel' },
  { rowId: '59_misc',       cat: '59', label: '59 – Misc.' },
  { rowId: '91',            cat: '91', label: '91 – MW Shock' },
  { rowId: '92',            cat: '92', label: '92 – LW Shock' },
  { rowId: '93',            cat: '93', label: '93 – Inclination' },
  { rowId: '94',            cat: '94', label: '94 – LAB 5000' },
  { rowId: '96',            cat: '96', label: '96 – Teardown' },
];
// Helper: get cat from rowId (for color lookup & backward compat)
function rowCat(rowId) {
  const r = SCHED_ROWS.find(r => r.rowId === rowId);
  if (r) return r.cat;
  // Legacy: if rowId is just a plain cat number, return it
  return rowId;
}
function rowLabel(rowId) {
  const r = SCHED_ROWS.find(r => r.rowId === rowId);
  return r ? r.label : ('Cat ' + rowId);
}

const CAT_COLORS = {
  '11':'#3a7fd4','12':'#2e9e62','13':'#c07a1a','33':'#7c5cbf',
  '41':'#d04040','42':'#2baacc','43':'#c45c9b','44':'#5a8c4a',
  '51':'#c4874a','52':'#4a7cba','53':'#a0522d','54':'#20b2aa',
  '55':'#8b6914','56':'#6a5acd','57':'#2e8b57','58':'#cd5c5c',
  '59':'#4682b4','67':'#9acd32','91':'#ff7f50','92':'#da70d6',
  '93':'#40e0d0','94':'#f4a460','95':'#708090','96':'#bc8f8f',
  '98':'#66cdaa','99':'#b8860b'
};
function getCatColor(cat) { return CAT_COLORS[cat] || '#888'; }

// ---- Scheduler settings (colors + access) ──────────────────
const SCHED_SETTINGS_KEY = 'nuws_sched_settings_v1';
let schedSettings = null;

function loadSchedSettings() {
  try { schedSettings = JSON.parse(localStorage.getItem(SCHED_SETTINGS_KEY)||'null') || {}; }
  catch(e) { schedSettings = {}; }
  // Defaults
  if (schedSettings.colors === undefined) schedSettings.colors = {};
  if (schedSettings.access === undefined) schedSettings.access = {}; // empId → true/false
}

function saveSchedSettings() {
  localStorage.setItem(SCHED_SETTINGS_KEY, JSON.stringify(schedSettings));
}

// Default colors (can be overridden in settings)
const SCHED_COLOR_DEFAULTS = {
  reschedule : '#f6e040',
  tentative  : '#a0a0a0',
  setup      : '#f48fb1',
  teardown   : '#9c27b0',
  dcas_no_wit_yes    : '#e53935',
  dcas_yes_wit_no    : '#ff9800',
  dcas_yes_wit_yes   : '#76d275',
};

function sc(key) {
  // Get effective color for a setting key
  if (!schedSettings) loadSchedSettings();
  return schedSettings.colors[key] || SCHED_COLOR_DEFAULTS[key];
}

// Check if an employee has scheduler access (default: all have access)
function empHasSchedAccess(empId) {
  if (!schedSettings) loadSchedSettings();
  const a = schedSettings.access;
  if (Object.keys(a).length === 0) return true; // no restrictions set → everyone in
  return a[empId] !== false;
}

// ---- Block color resolution ----
// Priority: override flags > task keyword > DCAS/Witness rules > category default
function resolveBlockColor(block) {
  // 1. Override flags
  if (!schedSettings) loadSchedSettings();
  // Employee event colors take priority
  if (block.empEventType === 'vacation') return '#43a047';
  if (block.empEventType === 'sick')     return '#e91e9e';
  if (block.flag === 'reschedule') return sc('reschedule');
  if (block.flag === 'tentative')  return sc('tentative');

  // 2. Task keyword rules
  if (block.taskId) {
    const task = (typeof taskStore !== 'undefined' ? taskStore : []).find(t => t._id === block.taskId);
    if (task) {
      const n = (task.name||'').toLowerCase();
      if (n.includes('setup'))    return sc('setup');
      if (n.includes('teardown')) return sc('teardown');
    }
  }

  // 3. DCAS / Witness rules
  if (block.projId) {
    const pi = getProjInfo(block.projId);
    if (pi) {
      const dcas    = (pi.info.dcas||'').trim().toUpperCase();
      const witness = (pi.info.customerWitness||'').trim().toUpperCase();
      const dcasYes    = dcas    === 'YES' || dcas    === 'CNF';
      const witnessYes = witness === 'YES' || witness === 'CNF';
      const dcasNo     = dcas    === 'NO'  || dcas    === '';
      const witnessNo  = witness === 'NO'  || witness === '';

      if (dcasNo  && witnessYes) return sc('dcas_no_wit_yes');
      if (dcasYes && witnessNo)  return sc('dcas_yes_wit_no');
      if (dcasYes && witnessYes) return sc('dcas_yes_wit_yes');
    }
  }

  // 4. Default category color (use rowCat for multi-row categories)
  return getCatColor(rowCat(block.rowId || block.cat));
}

// ---- State ----
const SCHED_KEY = 'nuws_sched_v2';
let schedBlocks    = [];   // [{ id, cat, start, end, label?, projId? }]
let schedZoom      = 'week';
let schedOffset    = 0;
let schedSelectedCat    = null;
let schedSelectedProjId = null;
let schedSelectedTaskId = null;
let schedFlag           = null;   // null | 'reschedule' | 'tentative'
let schedShowRooms      = true;   // toggle rooms section
let schedShowEmps       = true;   // toggle employees section

// DAY_W — 1week/week/month fill available width; quarter is fixed
const DAY_W_FALLBACK = { '1week': 120, week: 52, month: 30, quarter: 18 };
function getEffectiveDayW(zoom, days) {
  if (zoom === '1week' || zoom === 'week' || zoom === 'month') {
    const gridArea = document.getElementById('schedCanvasScroll');
    if (gridArea && gridArea.clientWidth > 0) {
      const available = gridArea.clientWidth - 4;
      const minW = zoom === '1week' ? 120 : zoom === 'week' ? 60 : 22;
      return Math.max(minW, Math.floor(available / days));
    }
  }
  return DAY_W_FALLBACK[zoom] || 52;
}

// Row/bar sizing constants
const ROW_H_FIXED  = 64;   // 2-week, month, quarter rows
const BAR_H_FIXED  = 52;
// Hour grid constants live inside renderSched for 1-week view

// ---- Persistence (Supabase) ----
function schedRowToBlock(r) {
  return {
    id:           r.id,
    rowId:        r.row_id          || null,
    cat:          r.cat             || null,
    start:        r.start_date,
    end:          r.end_date,
    startTime:    r.start_time      || null,
    endTime:      r.end_time        || null,
    label:        r.label           || '',
    projId:       r.proj_id         || null,
    taskId:       r.task_id         || null,
    empId:        r.emp_id          || null,
    empEventType: r.emp_event_type  || null,
    flag:         r.flag            || null,
  };
}
function blockToRow(b) {
  return {
    id:             b.id,
    row_id:         b.rowId         || null,
    cat:            b.cat           || null,
    start_date:     b.start,
    end_date:       b.end,
    start_time:     b.startTime     || null,
    end_time:       b.endTime       || null,
    label:          b.label         || null,
    proj_id:        b.projId        || null,
    task_id:        b.taskId        || null,
    emp_id:         b.empId         || null,
    emp_event_type: b.empEventType  || null,
    flag:           b.flag          || null,
  };
}

async function schedLoad() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('schedule_blocks').select('*');
    if (error) { console.error('schedLoad:', error); return; }
    schedBlocks = (data || []).map(schedRowToBlock);
    // One-time migration from localStorage
    const legacy = localStorage.getItem(SCHED_KEY);
    if (legacy) {
      try {
        const old = JSON.parse(legacy);
        if (Array.isArray(old) && old.length > 0) {
          const rows = old.map(blockToRow);
          await sb.from('schedule_blocks').upsert(rows, { onConflict: 'id' });
          const refreshed = await sb.from('schedule_blocks').select('*');
          if (refreshed.data) schedBlocks = refreshed.data.map(schedRowToBlock);
          console.log('Migrated', rows.length, 'blocks from localStorage to Supabase');
        }
      } catch(e) { console.warn('Migration failed:', e); }
      localStorage.removeItem(SCHED_KEY);
    }
  } catch(e) { console.error('schedLoad exception:', e); }
}

async function schedSaveBlock(block) {
  // Upsert single block — called after save/drag
  if (!sb) return;
  try {
    await sb.from('schedule_blocks').upsert(blockToRow(block), { onConflict: 'id' });
  } catch(e) { console.error('schedSaveBlock:', e); }
}

async function schedDeleteFromDB(blockId) {
  if (!sb) return;
  try {
    await sb.from('schedule_blocks').delete().eq('id', blockId);
  } catch(e) { console.error('schedDeleteFromDB:', e); }
}

// ---- Date helpers ----
function toDateStr(d) { return d.toISOString().split('T')[0]; }
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function todayStr() { return toDateStr(new Date()); }

// ---- Project info helpers ----
function getProjInfo(projId) {
  if (!projId) return null;
  const proj = (typeof projects !== 'undefined' ? projects : []).find(p => p.id === projId);
  if (!proj) return null;
  const info = (typeof projectInfo !== 'undefined' ? projectInfo[projId] : null) || {};
  return { proj, info };
}

// Build the display lines shown inside a bar / chip
function buildBlockDisplayLines(block) {
  const lines = [];
  // For employee blocks show emp name + event type
  let lbl;
  if (block.empId || block.empEventType) {
    const emp = (typeof employees !== 'undefined' ? employees : []).find(e => e.id === block.empId);
    const empName = emp ? emp.name : (block.label || '');
    const evtLbl  = block.empEventType === 'vacation' ? 'Vacation' : block.empEventType === 'sick' ? 'Sick' : 'Work';
    lbl = block.label || (empName ? empName + ' — ' + evtLbl : evtLbl);
  } else {
    lbl = block.label || rowLabel(block.rowId || block.cat);
  }
  // Time range on label line if set
  let timeSuffix = '';
  if (block.startTime || block.endTime) {
    const fmt = t => { if (!t) return ''; const [h,m] = t.split(':'); const hr = +h; return (hr%12||12)+':'+(m||'00')+(hr<12?'am':'pm'); };
    timeSuffix = '  ' + [fmt(block.startTime), fmt(block.endTime)].filter(Boolean).join('\u2013');
  }
  lines.push(lbl + timeSuffix);
  if (block.projId) {
    const pi = getProjInfo(block.projId);
    if (pi) {
      lines.push((pi.proj.emoji||'') + ' ' + pi.proj.name);
      if (pi.info.client)           lines.push('\uD83C\uDFE2 ' + pi.info.client);
      if (pi.info.dcas)             lines.push('DCAS: ' + pi.info.dcas);
      if (pi.info.customerWitness)  lines.push('\uD83D\uDC64 ' + pi.info.customerWitness);
    }
  }
  if (block.taskId) {
    const task = (typeof taskStore !== 'undefined' ? taskStore : []).find(t => t._id === block.taskId);
    if (task) {
      const STATUS_SHORT = { new:'New', inprogress:'In Prog', prohold:'Pro Hold', accthold:'Acct Hold' };
      const stLbl = STATUS_SHORT[task.status] || task.status || '';
      lines.push('\u2713 #' + (task.taskNum||'?') + '  ' + task.name + (stLbl ? '  ['+stLbl+']' : ''));
    }
  }
  return lines;
}

// ---- Zoom range ----
function getSchedRange() {
  const today = new Date(); today.setHours(0,0,0,0);
  if (schedZoom === '1week') {
    const dow = today.getDay(); const diff = (dow + 6) % 7;
    const mon = addDays(today, -diff + schedOffset * 7);
    return { start: mon, days: 7 };
  }
  if (schedZoom === 'week') {
    const dow = today.getDay(); const diff = (dow + 6) % 7;
    const mon = addDays(today, -diff + schedOffset * 14);
    return { start: mon, days: 14 };
  }
  if (schedZoom === 'month') {
    const d = new Date(today.getFullYear(), today.getMonth() + schedOffset, 1);
    const days = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return { start: d, days };
  }
  const qStart = Math.floor(today.getMonth() / 3) * 3;
  const d = new Date(today.getFullYear(), qStart + schedOffset * 3, 1);
  const endMonth = new Date(d.getFullYear(), d.getMonth()+3, 0);
  const days = Math.round((endMonth - d) / 86400000) + 1;
  return { start: d, days };
}

function fmtRangeLabel(range) {
  const end = addDays(range.start, range.days - 1);
  if (schedZoom === 'month') return range.start.toLocaleString('default',{month:'long',year:'numeric'});
  if (schedZoom === 'quarter') return range.start.toLocaleString('default',{month:'short',year:'numeric'}) + ' \u2013 ' + end.toLocaleString('default',{month:'short',year:'numeric'});
  const opts = { month: 'short', day: 'numeric' };
  return range.start.toLocaleString('default', opts) + ' \u2013 ' + end.toLocaleString('default', opts) + ', ' + end.getFullYear();
}

// ---- Open panel ----
window.openSchedulerPanel = async function(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Scheduler';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-scheduler').classList.add('active');
  loadSchedSettings();
  await schedLoad();
  renderSched();
};

// ---- Render (Gantt) ----
function renderSched() {
  const range   = getSchedRange();
  const is1Week = schedZoom === '1week';
  const is2Week = schedZoom === 'week';

  // Hours config (1-week: full hour grid; 2-week: just noon)
  const H_START = 8;   // 8 am
  const H_END   = 17;  // 5 pm
  const H_COUNT = H_END - H_START;  // 9 hours

  // In 1-week view each day column is subdivided into hours.
  // dayW = the full column width for one day = H_COUNT * hourW
  // For 2-week/month we just fill the container as before.
  let dayW, hourW;
  if (is1Week) {
    const gridArea = document.getElementById('schedCanvasScroll');
    const available = gridArea ? Math.max(gridArea.clientWidth - 4, 800) : 800;
    // Each day column must be at least 9*14=126 px wide so hour slots are >=14px
    const minDayW = H_COUNT * 14;
    dayW  = Math.max(minDayW, Math.floor(available / range.days));
    hourW = Math.floor(dayW / H_COUNT);
    dayW  = hourW * H_COUNT; // snap to exact multiple
  } else {
    dayW  = getEffectiveDayW(schedZoom, range.days);
    hourW = 0;
  }

  document.getElementById('schedRangeLabel').textContent = fmtRangeLabel(range);

  const days = [];
  for (let i = 0; i < range.days; i++) days.push(addDays(range.start, i));
  const todayS      = todayStr();
  const totalW      = days.length * dayW;
  const rowH        = ROW_H_FIXED;
  const barH        = BAR_H_FIXED;
  const barTop      = Math.floor((rowH - barH) / 2);
  const allRows     = getSchedRowsAll();
  const rows        = allRows; // includes rooms, divider, employees
  const rangeStartStr = toDateStr(range.start);
  const rangeEndStr   = toDateStr(addDays(range.start, range.days - 1));
  const totalH      = rows.length * rowH;

  // ---- Day header ----
  const hdr = document.getElementById('schedDayHeader');
  hdr.style.width = totalW + 'px';

  if (is1Week) {
    // Each day cell contains hour sub-labels
    const hrLabels = Array.from({length: H_COUNT + 1}, (_, i) => {
      const hr = H_START + i;
      const lbl = hr === 12 ? '12p' : hr < 12 ? hr + 'a' : (hr-12) + 'p';
      return `<div style="position:absolute;left:${i * hourW}px;top:0;bottom:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding-bottom:4px;">
        <span style="font-size:8.5px;font-family:'JetBrains Mono',monospace;color:var(--muted);opacity:.8;line-height:1;white-space:nowrap;">${lbl}</span>
      </div>`;
    }).join('');

    hdr.innerHTML = days.map(d => {
      const isToday = toDateStr(d) === todayS;
      const isWknd  = d.getDay() === 0 || d.getDay() === 6;
      const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const cls = ['sched-day-cell', isToday?'today':'', isWknd?'weekend':''].filter(Boolean).join(' ');
      // Half-day marker at noon position
      const noonX = Math.round(dayW / 2);
      const halfDayMarker = `<div style="position:absolute;left:${noonX}px;top:0;bottom:0;width:1px;background:rgba(192,122,26,0.35);pointer-events:none;"></div>
        <div style="position:absolute;left:${noonX+3}px;bottom:5px;font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--amber);opacity:.7;pointer-events:none;">½</div>`;
      return `<div class="${cls}" style="width:${dayW}px;position:relative;flex-shrink:0;">
        <div class="sched-day-name">${dayNames[d.getDay()]}</div>
        <div class="sched-day-num">${d.getDate()}</div>
        ${hrLabels}
        ${halfDayMarker}
      </div>`;
    }).join('');
  } else {
    hdr.innerHTML = days.map(d => {
      const isToday = toDateStr(d) === todayS;
      const isWknd  = d.getDay() === 0 || d.getDay() === 6;
      const isMonthStart = d.getDate() === 1;
      const cls = ['sched-day-cell', isToday?'today':'', isWknd?'weekend':'', isMonthStart?'month-start':''].filter(Boolean).join(' ');
      const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
      const showMonth = (schedZoom !== 'week') && d.getDate() === 1;
      // In 2-week view show AM/PM half-day markers
      const halfMarker = is2Week
        ? `<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(192,122,26,0.3);pointer-events:none;"></div>
           <div style="position:absolute;left:2px;bottom:3px;font-size:7.5px;font-family:'JetBrains Mono',monospace;color:var(--muted);opacity:.8">AM</div>
           <div style="position:absolute;left:50%;margin-left:2px;bottom:3px;font-size:7.5px;font-family:'JetBrains Mono',monospace;color:var(--muted);opacity:.8">PM</div>`
        : '';
      return `<div class="${cls}" style="width:${dayW}px;position:relative;">
        ${showMonth
          ? `<div style="font-size:9px;color:var(--amber);font-weight:700;letter-spacing:.5px;text-transform:uppercase">${d.toLocaleString('default',{month:'short'})}</div>`
          : `<div class="sched-day-name">${dayNames[d.getDay()]}</div>`}
        <div class="sched-day-num">${d.getDate()}</div>
        ${halfMarker}
      </div>`;
    }).join('');
  }

  // ---- Sidebar ----
  const labelsEl = document.getElementById('schedRowLabels');
  labelsEl.style.height = totalH + 'px';
  labelsEl.innerHTML = rows.map(row => {
    if (row.section === 'divider') {
      return `<div class="sched-sidebar-divider" style="height:${rowH}px"><span>${row.label}</span></div>`;
    }
    const isEmp = row.section === 'employee';
    const color = isEmp ? (row.color || '#888') : getCatColor(row.cat);
    const blockCount = schedBlocks.filter(b => (b.rowId||b.cat) === row.rowId).length;
    const dot = isEmp
      ? `<div style="width:26px;height:26px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0;">${row.initials||''}</div>`
      : `<div class="sched-asset-dot" style="background:${color}"></div>`;
    return `<div class="sched-asset-row" style="height:${rowH}px" onclick="openSchedModal(null,'${row.rowId}')">
      ${dot}
      <div class="sched-asset-name" title="${row.label}">${row.label}</div>
      ${blockCount ? `<div class="sched-asset-badge">${blockCount}</div>` : ''}
    </div>`;
  }).join('');

  // ---- Canvas ----
  const canvas = document.getElementById('schedCanvas');
  canvas.style.width  = totalW + 'px';
  canvas.style.height = totalH + 'px';
  canvas.innerHTML = '';

  // Row backgrounds
  rows.forEach((row, ri) => {
    if (row.section === 'divider') {
      // Section header divider strip
      const div = document.createElement('div');
      div.className = 'sched-section-divider';
      div.style.cssText = `top:${ri*rowH}px;height:${rowH}px;`;
      div.innerHTML = `<span>${row.label}</span>`;
      canvas.appendChild(div);
      return;
    }
    const el = document.createElement('div');
    el.className = 'sched-grid-row' + (ri % 2 === 1 ? ' alt' : '');
    el.style.cssText = `top:${ri*rowH}px;height:${rowH}px`;
    canvas.appendChild(el);
  });

  // Vertical column/day lines
  days.forEach((d, di) => {
    const isWknd  = d.getDay() === 0 || d.getDay() === 6;
    const isToday = toDateStr(d) === todayS;
    if (isWknd) {
      const el = document.createElement('div');
      el.className = 'sched-col-line weekend';
      el.style.cssText = `left:${di*dayW}px;--day-w:${dayW}px`;
      canvas.appendChild(el);
    }
    if (isToday) {
      const el = document.createElement('div');
      el.className = 'sched-col-line today-line';
      el.style.cssText = `left:${di*dayW + Math.floor(dayW/2)}px`;
      canvas.appendChild(el);
    }
    // Alternating day background for readability
    if (di % 2 === 0) {
      const bg = document.createElement('div');
      bg.style.cssText = `position:absolute;left:${di*dayW}px;top:0;bottom:0;width:${dayW}px;background:rgba(100,100,120,0.03);pointer-events:none;z-index:0;`;
      canvas.appendChild(bg);
    }
    // Day start line
    const el = document.createElement('div');
    el.className = 'sched-col-line';
    el.style.cssText = `left:${di*dayW}px`;
    canvas.appendChild(el);

    if (is1Week) {
      // Vertical hour lines within each day column
      for (let h = 1; h < H_COUNT; h++) {
        const x = di * dayW + h * hourW;
        const isNoon = (H_START + h) === 12;
        const hline = document.createElement('div');
        hline.style.cssText = `position:absolute;left:${x}px;top:0;bottom:0;width:1px;` +
          (isNoon
            ? `background:rgba(192,122,26,0.35);z-index:2;`
            : `background:rgba(128,128,128,0.13);z-index:1;`) +
          `pointer-events:none;`;
        canvas.appendChild(hline);
      }
    } else if (is2Week && !isWknd) {
      // Just a noon tick at the midpoint of each weekday column
      const x = di * dayW + Math.floor(dayW / 2);
      const nline = document.createElement('div');
      nline.style.cssText = `position:absolute;left:${x}px;top:0;bottom:0;width:1px;background:rgba(192,122,26,0.18);z-index:1;pointer-events:none;`;
      canvas.appendChild(nline);
    }
  });

  // Empty state
  if (schedBlocks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sched-empty';
    empty.innerHTML = '<div class="sched-empty-icon">\uD83D\uDCC5</div><div style="font-size:14px;font-weight:500">No schedule blocks yet</div><div style="font-size:12px;margin-top:6px">Click <strong>+ Schedule Block</strong> to schedule a sales category</div>';
    canvas.appendChild(empty);
  }

  // ---- Holiday stripes ----
  {
    const visYears = [...new Set(days.map(d => d.getFullYear()))];
    const allHolidays = visYears.flatMap(y => (typeof getHolidays === 'function' ? getHolidays(y) : []));
    allHolidays.forEach(h => {
      if (h.date < rangeStartStr || h.date > rangeEndStr) return;
      const di = diffDays(rangeStartStr, h.date);
      const x  = di * dayW;
      const stripe = document.createElement('div');
      stripe.className = 'sched-holiday-stripe';
      stripe.style.cssText = `left:${x}px;width:${dayW}px;`;
      canvas.appendChild(stripe);
      const lbl = document.createElement('div');
      lbl.className = 'sched-holiday-label';
      lbl.style.cssText = `left:${x + 3}px;max-width:${dayW - 6}px;`;
      lbl.textContent = h.name;
      canvas.appendChild(lbl);
    });
  }

  // ---- Helper: time string → x offset within a day column ----
  function timeToXOffset(timeStr, defaultFrac) {
    if (!timeStr || !is1Week) return Math.round(dayW * defaultFrac);
    const [h, m] = timeStr.split(':').map(Number);
    const hrs = Math.min(Math.max(h + m/60, H_START), H_END) - H_START;
    return Math.round(hrs * hourW);
  }

  // ---- Bars ----
  schedBlocks.forEach(block => {
    const rid = block.rowId || block.cat;
    const ri  = rows.findIndex(r => r.rowId === rid && r.section !== 'divider');
    if (ri < 0) return;
    const bStart = block.start > rangeStartStr ? block.start : rangeStartStr;
    const bEnd   = block.end   < rangeEndStr   ? block.end   : rangeEndStr;
    if (bStart > rangeEndStr || bEnd < rangeStartStr) return;

    const startOff = diffDays(rangeStartStr, bStart);
    const endOff   = diffDays(rangeStartStr, bEnd);
    const spanDays = diffDays(block.start, block.end);
    const color    = resolveBlockColor(block);
    const lines    = buildBlockDisplayLines(block);

    let x, w;
    if (is1Week) {
      // x = day column start + time-within-day offset
      const xStart = startOff * dayW + timeToXOffset(block.startTime, 0);
      const xEnd   = endOff   * dayW + timeToXOffset(block.endTime,   1);
      x = xStart + 2;
      w = Math.max(xEnd - xStart - 4, hourW - 4); // at least 1 hour wide
    } else {
      // Account for half-day start/end offsets
      const startHalfPx = block._startHalf ? Math.round(dayW / 2) : 0;
      const endHalfAdj  = block._endHalf   ? Math.round(dayW / 2) : dayW;
      x = startOff * dayW + startHalfPx + 2;
      w = Math.max((endOff - startOff) * dayW + endHalfAdj - startHalfPx - 4, Math.round(dayW / 2) - 4);
    }

    // Text layout
    let innerHtml;
    if (is1Week) {
      // Stacked lines, each clipped, max 5 shown
      const visLines = lines.slice(0, 5);
      innerHtml = `<div style="display:flex;flex-direction:column;gap:1px;overflow:hidden;height:100%;">` +
        visLines.map((ln, i) => {
          const fs = i === 0 ? '11px' : '9.5px';
          const fw = i === 0 ? '700'  : '500';
          const op = i === 0 ? '1'    : '0.9';
          return `<div style="font-size:${fs};font-weight:${fw};opacity:${op};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,0.3);flex-shrink:0;">${ln}</div>`;
        }).join('') +
        `</div>`;
    } else if (spanDays === 0) {
      innerHtml = `<div style="display:flex;flex-direction:column;gap:1px;overflow:hidden;">` +
        lines.map((ln, i) => `<div style="font-size:${i===0?'11px':'9.5px'};font-weight:${i===0?'700':'500'};opacity:${i===0?'1':'0.88'};white-space:normal;word-break:break-word;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${ln}</div>`).join('') +
        `</div>`;
    } else {
      innerHtml = `<div style="font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${lines.join('  \u00B7  ')}</div>`;
    }

    // In 1-week view expand bar to use most of the row height so all lines fit
    const thisBarH   = is1Week ? rowH - 8 : barH;
    const thisBarTop = is1Week ? 4         : barTop;

    const bar = document.createElement('div');
    bar.className = 'sched-bar';
    bar.dataset.blockId = block.id;
    bar.style.cssText = `left:${x}px;top:${ri*rowH + thisBarTop}px;width:${w}px;height:${thisBarH}px;background:${color};box-shadow:0 2px 8px ${color}66;border-radius:6px;`;
    bar.innerHTML = `
      <div class="sched-bar-handle sched-bar-handle-l" data-dir="left"></div>
      <div class="sched-bar-inner" style="flex:1;min-width:0;overflow:hidden;padding:5px 9px;display:flex;flex-direction:column;justify-content:flex-start;color:#fff;">${innerHtml}</div>
      <div class="sched-bar-handle sched-bar-handle-r" data-dir="right"></div>`;
    canvas.appendChild(bar);

    bar.addEventListener('mouseenter', e => showSchedTooltip(block, e));
    bar.addEventListener('mousemove',  e => moveSchedTooltip(e));
    bar.addEventListener('mouseleave', ()  => hideSchedTooltip());
    attachBarDrag(bar, block, rows, range, dayW);
  });

  // ---- Click-drag to create new block ----
  attachCanvasCreateDrag(canvas, rows, range, dayW, hourW, rowH, is1Week, is2Week, rangeStartStr);

  syncSchedScroll();
  renderSchedLegend();
}

// ---- Canvas drag-to-create ----
function attachCanvasCreateDrag(canvas, rows, range, dayW, hourW, rowH, is1Week, is2Week, rangeStartStr) {
  let drag = null;
  let ghost = null;

  canvas.addEventListener('mousedown', e => {
    // Only fire on canvas background — not on bars, handles, or other elements
    if (e.button !== 0) return;
    if (e.target !== canvas && (
      e.target.classList.contains('sched-bar') ||
      e.target.classList.contains('sched-bar-inner') ||
      e.target.classList.contains('sched-bar-handle') ||
      e.target.closest('.sched-bar')
    )) return;

    const scrollEl = document.getElementById('schedCanvasScroll');
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
    const scrollTop  = scrollEl ? scrollEl.scrollTop  : 0;
    // Use the scroll container's rect — canvas rect shifts as it's larger than the viewport
    const containerRect = scrollEl ? scrollEl.getBoundingClientRect() : canvas.getBoundingClientRect();

    const localX = e.clientX - containerRect.left + scrollLeft;
    const localY = e.clientY - containerRect.top  + scrollTop;

    // Which row?
    const ri = Math.floor(localY / rowH);
    if (ri < 0 || ri >= rows.length) return;
    const row = rows[ri];
    if (!row || row.section === 'divider') return;

    // Which day/time?
    function xToDateHalf(px) {
      const di = Math.floor(px / dayW);
      const fracInDay = (px % dayW) / dayW;
      const d = addDays(range.start, Math.max(0, Math.min(di, range.days - 1)));
      const dateStr = toDateStr(d);
      if (is1Week && hourW > 0) {
        // Snap to nearest hour
        const hr = Math.floor(fracInDay * (17 - 8)) + 8;
        return { dateStr, isHalf: false, hr };
      }
      // 2-week/month: snap to half-day
      const isHalf = fracInDay >= 0.5;
      return { dateStr, isHalf };
    }

    const startSnap = xToDateHalf(localX);

    drag = {
      startX: localX,
      startY: localY,
      rowId: row.rowId,
      rowColor: getCatColor(row.cat || row.rowId),
      startSnap,
      hasMoved: false,
    };
  });

  canvas.addEventListener('mousemove', e => {
    if (!drag) return;
    const scrollEl = document.getElementById('schedCanvasScroll');
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;
    const scrollTop  = scrollEl ? scrollEl.scrollTop  : 0;
    const containerRect = scrollEl ? scrollEl.getBoundingClientRect() : canvas.getBoundingClientRect();
    const localX = e.clientX - containerRect.left + scrollLeft;

    if (!drag.hasMoved && Math.abs(localX - drag.startX) < 8) return;
    drag.hasMoved = true;
    e.preventDefault();

    // Calculate ghost bar position
    const x1 = Math.min(drag.startX, localX);
    const x2 = Math.max(drag.startX, localX);
    const ri  = Math.floor(drag.startY / rowH);

    if (!ghost) {
      ghost = document.createElement('div');
      ghost.style.cssText = `position:absolute;border-radius:5px;pointer-events:none;z-index:50;opacity:0.55;border:2px dashed rgba(255,255,255,0.6);`;
      ghost.style.background = drag.rowColor;
      canvas.appendChild(ghost);
    }
    ghost.style.left   = x1 + 'px';
    ghost.style.width  = Math.max(x2 - x1, 4) + 'px';
    ghost.style.top    = (ri * rowH + 4) + 'px';
    ghost.style.height = (rowH - 8) + 'px';
  });

  const finishDrag = e => {
    if (!drag) return;
    if (ghost) { ghost.remove(); ghost = null; }

    if (drag.hasMoved) {
      const scrollEl2 = document.getElementById('schedCanvasScroll');
      const scrollLeft = scrollEl2 ? scrollEl2.scrollLeft : 0;
      const containerRect2 = scrollEl2 ? scrollEl2.getBoundingClientRect() : canvas.getBoundingClientRect();
      const localX = e.clientX - containerRect2.left + scrollLeft;

      // Calculate start and end from drag
      const x1 = Math.min(drag.startX, localX);
      const x2 = Math.max(drag.startX, localX);

      function xToDate(px) {
        const di = Math.max(0, Math.min(Math.floor(px / dayW), range.days - 1));
        const frac = (px % dayW) / dayW;
        const d = addDays(range.start, di);
        const isHalf = frac >= 0.5;
        return { dateStr: toDateStr(d), isHalf };
      }

      const s = xToDate(x1);
      const en = xToDate(x2);

      // Open modal pre-filled
      openSchedModal(null, drag.rowId, s.dateStr, en.dateStr);
    }
    drag = null;
  };

  canvas.addEventListener('mouseup', finishDrag);
}

// ---- Drag ----
function attachBarDrag(bar, block, rows, range, dayW) {
  let drag = null;

  bar.addEventListener('mousedown', e => {
    const dir = e.target.dataset.dir;
    if (e.button !== 0) return;

    // Store original dates and half flags — we always calculate delta from these originals
    // Capture the canvas Y position at drag start to track row changes
    const _cScroll = document.getElementById('schedCanvasScroll');
    const _scrollRect = _cScroll ? _cScroll.getBoundingClientRect() : null;
    const _startCanvasY = _scrollRect ? (e.clientY - _scrollRect.top + (_cScroll ? _cScroll.scrollTop : 0)) : e.clientY;

    drag = {
      dir,
      startX:    e.clientX,
      startClientY: e.clientY,
      startCanvasY: _startCanvasY,
      lastSnap:  null,
      lastRowIdx: -1,
      origStart: block.start,
      origEnd:   block.end,
      origStartHalf: block._startHalf || false,
      origEndHalf:   block._endHalf   || false,
      origRowId: block.rowId || block.cat,
      origCat:   block.cat,
      origRowIdx: rows.findIndex(r => r.rowId === (block.rowId || block.cat)),
      startClientY: e.clientY,
      hasMoved:  false,
      currentRowId: block.rowId || block.cat,
      bar,
    };

    const onMove = e => {
      if (!drag) return;
      const px = Math.abs(e.clientX - drag.startX);
      if (!drag.hasMoved && px < 5) return;
      drag.hasMoved = true;
      e.preventDefault();

      // 1-week: snap to full days; 2-week: snap to half-days
      const useHalfDay = schedZoom === 'week';
      const snapPx     = dayW / (useHalfDay ? 2 : 1);
      const rawDelta   = (e.clientX - drag.startX) / snapPx;
      const snapped    = Math.round(rawDelta);
      // Row tracking for whole-bar moves — delta from start row using canvas-relative coords
      if (!drag.dir && drag.origRowIdx >= 0) {
        const _csRowD = document.getElementById('schedCanvasScroll');
        const _crRowD = _csRowD ? _csRowD.getBoundingClientRect() : null;
        const currentCanvasY = _crRowD ? (e.clientY - _crRowD.top + (_csRowD ? _csRowD.scrollTop : 0)) : e.clientY;
        const rowDelta = Math.floor((currentCanvasY - drag.startCanvasY + ROW_H_FIXED * 0.5) / ROW_H_FIXED);
        let targetRi = drag.origRowIdx + rowDelta;
        targetRi = Math.max(0, Math.min(targetRi, rows.length - 1));
        // Skip divider rows
        while (targetRi < rows.length && rows[targetRi].section === 'divider') targetRi++;
        if (targetRi !== drag.lastRowIdx && targetRi < rows.length) {
          drag.lastRowIdx = targetRi;
          const hoverRow = rows[targetRi];
          if (hoverRow && hoverRow.section !== 'divider') {
            drag.currentRowId = hoverRow.rowId;
            block.rowId = hoverRow.rowId;
            block.cat   = hoverRow.cat || hoverRow.rowId;
            const barTop = schedZoom === '1week' ? 4 : Math.floor((ROW_H_FIXED - BAR_H_FIXED) / 2);
            drag.bar.style.top = (targetRi * ROW_H_FIXED + barTop) + 'px';
            drag.bar.style.background = getCatColor(hoverRow.cat || hoverRow.rowId);
            drag.bar.style.boxShadow = '0 2px 8px ' + getCatColor(hoverRow.cat || hoverRow.rowId) + '66';
          }
        }
      }

      if (snapped === drag.lastSnap) return;
      drag.lastSnap = snapped;

      if (!useHalfDay) {
        // Full-day snap — simple date arithmetic
        if (drag.dir === 'left') {
          const ns = toDateStr(addDays(parseDate(drag.origStart), snapped));
          if (ns >= drag.origEnd) return;
          block.start = ns;
        } else if (drag.dir === 'right') {
          const ne = toDateStr(addDays(parseDate(drag.origEnd), snapped));
          if (ne <= drag.origStart) return;
          block.end = ne;
        } else {
          block.start = toDateStr(addDays(parseDate(drag.origStart), snapped));
          block.end   = toDateStr(addDays(parseDate(drag.origEnd),   snapped));
          // Track row for non-half-day views too
          const _cv2 = document.getElementById('schedCanvas');
          const _cs2 = document.getElementById('schedCanvasScroll');
          if (_cv2) {
            const _cr2 = _cv2.getBoundingClientRect();
            const localY2 = e.clientY - _cr2.top + (_cs2 ? _cs2.scrollTop : 0);
            const ri2 = Math.max(0, Math.min(Math.floor(localY2 / ROW_H_FIXED), rows.length - 1));
            const hoverRow2 = rows[ri2];
            if (hoverRow2 && hoverRow2.section !== 'divider') {
              block.rowId = hoverRow2.rowId;
              block.cat   = hoverRow2.cat || hoverRow2.rowId;
            }
          }
        }
        requestAnimationFrame(renderSched);
        return;
      }

      // Half-day snap for 2-week view.
      // Key insight: start and end have different base semantics —
      //   start (isHalf=false) = start-of-day  → base half-unit = days*2 + 0
      //   start (isHalf=true)  = noon          → base half-unit = days*2 + 1
      //   end   (isHalf=false) = end-of-day    → base half-unit = days*2 + 2
      //   end   (isHalf=true)  = noon          → base half-unit = days*2 + 1
      // This ensures +1 snap from end-of-Monday lands on noon-Tuesday (not noon-Monday).

      const EPOCH = new Date(2000, 0, 1);
      function daysFromEpoch(dateStr) {
        return Math.round((parseDate(dateStr) - EPOCH) / 86400000);
      }
      function fromHalfUnit(u) {
        const d = Math.floor(u / 2);
        const isHalf = (((u % 2) + 2) % 2) === 1;
        const date = new Date(EPOCH);
        date.setDate(date.getDate() + d);
        return { dateStr: toDateStr(date), isHalf };
      }

      const startBase = daysFromEpoch(drag.origStart) * 2 + (drag.origStartHalf ? 1 : 0);
      const endBase   = daysFromEpoch(drag.origEnd)   * 2 + (drag.origEndHalf   ? 1 : 2);

      if (drag.dir === 'left') {
        const nu = startBase + snapped;
        if (nu >= endBase) return; // can't pass end
        const ns = fromHalfUnit(nu);
        block.start      = ns.dateStr;
        block._startHalf = ns.isHalf;
      } else if (drag.dir === 'right') {
        const nu = endBase + snapped;
        if (nu <= startBase) return; // can't pass start
        // Convert back: end half-unit even = end-of-day (isHalf=false), odd = noon (isHalf=true)
        const wholeDays = Math.floor(nu / 2);
        const isEndHalf = (((nu % 2) + 2) % 2) === 1;
        const date = new Date(EPOCH);
        date.setDate(date.getDate() + wholeDays + (isEndHalf ? 0 : -1));
        block.end      = toDateStr(isEndHalf ? date : date);
        // If nu is even, it means end-of-day for the PREVIOUS day boundary
        if (!isEndHalf) {
          // nu is even: e.g. nu=4 means end of day 1 (Tue) = block.end=Tue, isHalf=false
          const d2 = new Date(EPOCH);
          d2.setDate(d2.getDate() + nu/2 - 1);
          block.end      = toDateStr(d2);
          block._endHalf = false;
        } else {
          block._endHalf = true;
        }
      } else {
        // Move whole bar — also track vertical row changes
        if (!drag.dir) {
          const _cv = document.getElementById('schedCanvas');
          const _cs = document.getElementById('schedCanvasScroll');
          if (_cv) {
            const _cr = _cv.getBoundingClientRect();
            const localY = e.clientY - _cr.top + (_cs ? _cs.scrollTop : 0);
            const ri = Math.max(0, Math.min(Math.floor(localY / ROW_H_FIXED), rows.length - 1));
            const hoverRow = rows[ri];
            if (hoverRow && hoverRow.section !== 'divider' && hoverRow.rowId !== drag.currentRowId) {
              drag.currentRowId = hoverRow.rowId;
              block.rowId = hoverRow.rowId;
              block.cat   = hoverRow.cat || hoverRow.rowId;
            }
          }
        }
        // Move whole bar
        const ns = fromHalfUnit(startBase + snapped);
        const endHalfUnit = endBase + snapped;
        const wholeDays = Math.floor(endHalfUnit / 2);
        const isEndHalf = (((endHalfUnit % 2) + 2) % 2) === 1;
        block.start      = ns.dateStr;
        block._startHalf = ns.isHalf;
        if (!isEndHalf) {
          const d2 = new Date(EPOCH);
          d2.setDate(d2.getDate() + endHalfUnit/2 - 1);
          block.end      = toDateStr(d2);
          block._endHalf = false;
        } else {
          const d2 = new Date(EPOCH);
          d2.setDate(d2.getDate() + wholeDays);
          block.end      = toDateStr(d2);
          block._endHalf = true;
        }
      }

      requestAnimationFrame(renderSched);
    };

    const onUp = e => {
      if (drag) {
        if (drag.hasMoved) {
          schedSaveBlock(block).then(() => renderSched());
        } else {
          openSchedModal(block.id);
        }
        drag = null;
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ---- Scroll sync ----
function syncSchedScroll() {
  const hScroll = document.getElementById('schedHeaderScroll');
  const cScroll = document.getElementById('schedCanvasScroll');
  const labels  = document.getElementById('schedRowLabels');
  if (!hScroll || !cScroll) return;
  cScroll.onscroll = () => {
    hScroll.scrollLeft = cScroll.scrollLeft;
    labels.scrollTop   = cScroll.scrollTop;
  };
  const range = getSchedRange();
  const dayW  = getEffectiveDayW(schedZoom, getSchedRange().days);
  const todayOff = diffDays(toDateStr(range.start), todayStr());
  if (todayOff > 0 && todayOff < range.days) {
    setTimeout(() => { cScroll.scrollLeft = Math.max(0, todayOff * dayW - 150); }, 10);
  }
}

// ---- Tooltip ----
function showSchedTooltip(block, e) {
  const days = diffDays(block.start, block.end) + 1;
  const lines = buildBlockDisplayLines(block);
  const tt = document.getElementById('schedTooltip');
  tt.innerHTML = lines.map((l,i) => i===0 ? `<strong>${l}</strong>` : `<span style="opacity:.85">${l}</span>`).join('<br>') +
    `<br><span style="opacity:.6;font-size:10.5px">${block.start} \u2192 ${block.end} \u00B7 ${days}d</span>`;
  tt.style.display = 'block';
  moveSchedTooltip(e);
}
function moveSchedTooltip(e) {
  const tt = document.getElementById('schedTooltip');
  // Hide tooltip if hovering near a resize handle so it doesn't block dragging
  const target = e.target;
  if (target && (target.dataset.dir === 'left' || target.dataset.dir === 'right' ||
      target.classList.contains('sched-bar-handle'))) {
    tt.style.display = 'none';
    return;
  }
  // Also hide if near left or right edge of bar
  const bar = target && target.closest ? target.closest('.sched-bar') : null;
  if (bar) {
    const rect = bar.getBoundingClientRect();
    const fromLeft  = e.clientX - rect.left;
    const fromRight = rect.right - e.clientX;
    if (fromLeft < 18 || fromRight < 18) { tt.style.display = 'none'; return; }
  }
  tt.style.left = (e.clientX + 14) + 'px';
  tt.style.top  = (e.clientY - 50) + 'px';
}
function hideSchedTooltip() {
  const tt = document.getElementById('schedTooltip');
  if (tt) tt.style.display = 'none';
}

// ---- Legend ----
function renderSchedLegend() {
  const el = document.getElementById('schedLegend');
  if (!el) return;
  const rowsInUse = [...new Set(schedBlocks.map(b => b.rowId || b.cat))];
  if (rowsInUse.length === 0) {
    el.innerHTML = '<span style="font-size:11px;color:var(--muted);padding:0 4px">No blocks scheduled yet</span>';
    return;
  }
  el.innerHTML = rowsInUse.map(rid => {
    const repBlock = schedBlocks.find(b => (b.rowId||b.cat) === rid) || { rowId: rid, cat: rowCat(rid) };
    const color = resolveBlockColor(repBlock);
    const lbl   = rowLabel(rid);
    return `<div style="display:flex;align-items:center;gap:5px;padding:2px 8px;background:var(--surface2);border-radius:5px;border:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;background:${color}"></div>
      <span style="font-size:11px;">${lbl}</span>
    </div>`;
  }).join('');
}

// ---- Navigation ----
window.schedNav = function(dir) {
  schedOffset += dir;
  if (schedView === 'calendar') renderSchedCalendar(); else renderSched();
};
window.schedGoToday = function() {
  schedOffset = 0;
  if (schedView === 'calendar') renderSchedCalendar(); else renderSched();
};
window.setSchedZoom = function(z, btn) {
  schedZoom = z; schedOffset = 0;
  // Only clear active on the gantt zoom group, not the view-mode buttons
  const zoomGroup = document.getElementById('schedGanttZoomGroup');
  if (zoomGroup) zoomGroup.querySelectorAll('.sched-zoom-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSched();
};

// ---- Modal ----
window.openSchedModal = function(blockId, preselCat, clickedDate, prefilledEnd) {
  schedSelectedCat    = preselCat || null;
  schedSelectedProjId = null;

  document.getElementById('schedEditId').value = blockId || '';
  document.getElementById('schedModalTitle').textContent = blockId ? 'Edit Schedule Block' : 'New Schedule Block';
  document.getElementById('schedDeleteBtn').style.display = blockId ? '' : 'none';
  document.getElementById('schedProjSearch').value = '';
  const dd = document.getElementById('schedProjDD');
  if (dd) { dd.style.display = 'none'; dd.innerHTML = ''; }
  document.getElementById('schedProjPreview').style.display = 'none';
  document.getElementById('schedTaskSection').style.display = 'none';
  document.getElementById('schedTaskList').innerHTML = '';
  _schedProjDDOpen = false;
  schedSelectedTaskId = null;
  schedFlag = null;
  updateFlagUI();
  // Populate employee picker
  const empPicker = document.getElementById('schedEmpPicker');
  if (empPicker) {
    empPicker.innerHTML = '<option value="">— select employee —</option>' +
      (typeof employees !== 'undefined' ? employees : [])
        .filter(e => e.isActive !== false && e.name)
        .map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  }

  if (blockId) {
    const blk = schedBlocks.find(b => b.id === blockId);
    if (blk) {
      schedSelectedCat    = blk.rowId || blk.cat;
      schedSelectedProjId = blk.projId || null;
      document.getElementById('schedStartDate').value = blk.start;
      document.getElementById('schedEndDate').value   = blk.end;
      document.getElementById('schedStartTime').value = blk.startTime || '';
      document.getElementById('schedEndTime').value   = blk.endTime   || '';
      document.getElementById('schedLabel').value     = blk.label || '';
      schedSelectedTaskId = blk.taskId || null;
      schedFlag = blk.flag || null;
      updateFlagUI();
      // Restore type/employee
      const isEmpBlock = !!(blk.empId || blk.empEventType);
      const typeEl = document.getElementById('schedBlockType');
      if (typeEl) typeEl.value = isEmpBlock ? 'employee' : 'room';
      const empPkr = document.getElementById('schedEmpPicker');
      if (empPkr && blk.empId) empPkr.value = blk.empId;
      const evtEl = document.getElementById('schedEmpEventType');
      if (evtEl) evtEl.value = blk.empEventType || '';
      schedBlockTypeChanged();
      if (blk.projId) {
        const pi = getProjInfo(blk.projId);
        if (pi) {
          document.getElementById('schedProjSearch').value = (pi.proj.emoji||'') + ' ' + pi.proj.name;
          updateSchedProjPreview(blk.projId);
          renderSchedTaskList(blk.projId);
        }
      }
    }
  } else {
    const s = clickedDate || todayStr();
    const e = prefilledEnd || clickedDate || toDateStr(addDays(new Date(), 6));
    document.getElementById('schedStartDate').value = s;
    document.getElementById('schedEndDate').value   = e;
    document.getElementById('schedStartTime').value = '';
    document.getElementById('schedEndTime').value   = '';
    document.getElementById('schedLabel').value     = '';
    const typeEl2 = document.getElementById('schedBlockType');
    if (typeEl2) typeEl2.value = 'room';
    const evtEl2 = document.getElementById('schedEmpEventType');
    if (evtEl2) evtEl2.value = '';
    schedBlockTypeChanged();
  }

  // If preselCat is an employee row, auto-switch to employee mode
  if (schedSelectedCat && schedSelectedCat.startsWith('emp_')) {
    const empId = schedSelectedCat.replace('emp_', '');
    const typeEl = document.getElementById('schedBlockType');
    if (typeEl) typeEl.value = 'employee';
    const empPkr = document.getElementById('schedEmpPicker');
    if (empPkr) empPkr.value = empId;
    schedBlockTypeChanged();
  }
  renderSchedCatList();
  schedDateChanged();
  document.getElementById('schedModal').classList.add('open');
};

window.closeSchedModal = function() {
  document.getElementById('schedModal').classList.remove('open');
  document.getElementById('schedProjDD').innerHTML = '';
};

function renderSchedCatList() {
  const list = document.getElementById('schedProjList');
  list.innerHTML = SCHED_ROWS.map(row => {
    const color = getCatColor(row.cat);
    const sel   = row.rowId === schedSelectedCat;
    return `<div class="sched-proj-opt${sel?' selected':''}" onclick="selectSchedCat('${row.rowId}')">
      <div class="sched-proj-opt-dot" style="background:${color}"></div>
      <div class="sched-proj-opt-name" style="font-size:12.5px">${row.label}</div>
      <div class="sched-proj-opt-check">&#x2713;</div>
    </div>`;
  }).join('');
}

window.selectSchedCat = function(cat) {
  schedSelectedCat = cat;
  renderSchedCatList();
};

// ---- Project picker in modal ----
// ---- Project dropdown (jitter-free: mousedown prevents blur, blur hides with delay) ----
let _schedProjDDOpen = false;

window.schedProjMousedown = function(e) {
  // Toggle on click of the input when already focused
  if (document.activeElement === e.target && _schedProjDDOpen) {
    // clicking the already-focused input — leave open
    return;
  }
  filterSchedProjDD(e.target.value);
};

window.schedProjBlur = function() {
  // Small delay so a mousedown on a list item can fire before we hide
  setTimeout(() => {
    const dd = document.getElementById('schedProjDD');
    if (dd) { dd.style.display = 'none'; _schedProjDDOpen = false; }
  }, 150);
};

window.filterSchedProjDD = function(q) {
  const dd = document.getElementById('schedProjDD');
  if (!dd) return;
  const inp = document.getElementById('schedProjSearch');
  // Only show if input is focused or being interacted with
  if (document.activeElement !== inp && !inp) return;

  const allP = typeof projects !== 'undefined' ? projects : [];
  const filtered = q
    ? allP.filter(p => (p.name||'').toLowerCase().includes(q.toLowerCase()))
    : allP;

  if (filtered.length === 0) {
    dd.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--muted)">No matching projects</div>';
  } else {
    dd.innerHTML = filtered.map(p => {
      const sel = p.id === schedSelectedProjId;
      return `<div class="sched-proj-opt${sel?' selected':''}"
        onmousedown="event.preventDefault();selectSchedLinkedProj('${p.id}')">
        <div class="sched-proj-opt-name">${p.emoji||''} ${p.name}</div>
        <div class="sched-proj-opt-check">&#x2713;</div>
      </div>`;
    }).join('');
  }
  dd.style.display = 'block';
  _schedProjDDOpen = true;
};

window.selectSchedLinkedProj = function(projId) {
  schedSelectedProjId = projId;
  schedSelectedTaskId = null;  // reset task when project changes
  const pi = getProjInfo(projId);
  if (pi) document.getElementById('schedProjSearch').value = (pi.proj.emoji||'') + ' ' + pi.proj.name;
  const dd = document.getElementById('schedProjDD');
  if (dd) { dd.style.display = 'none'; _schedProjDDOpen = false; }
  updateSchedProjPreview(projId);
  renderSchedTaskList(projId);
  document.getElementById('schedProjSearch')?.focus();
};

function updateSchedProjPreview(projId) {
  const preview = document.getElementById('schedProjPreview');
  if (!projId) { preview.style.display = 'none'; return; }
  const pi = getProjInfo(projId);
  if (!pi) { preview.style.display = 'none'; return; }
  const { proj, info } = pi;
  const rows = [];
  rows.push(`<strong>${proj.emoji||''} ${proj.name}</strong>`);
  if (info.client)           rows.push(`\uD83C\uDFE2 Customer: ${info.client}`);
  if (info.dcas)             rows.push(`DCAS: ${info.dcas}`);
  if (info.customerWitness)  rows.push(`\uD83D\uDC64 Witness: ${info.customerWitness}`);
  preview.innerHTML = rows.join('<br>');
  preview.style.display = 'block';
}

function renderSchedTaskList(projId) {
  const section  = document.getElementById('schedTaskSection');
  const listEl   = document.getElementById('schedTaskList');
  if (!section || !listEl) return;

  const EXCLUDED      = ['complete','billed','cancelled'];
  const NAME_EXCLUDE  = ['procedure','report'];  // hide tasks whose name contains these words
  const STATUS_LABELS = { new:'New', inprogress:'In Progress', prohold:'Pro Hold', accthold:'Acct Hold' };
  const STATUS_COLORS = { new:'#7a7a85', inprogress:'var(--green)', prohold:'var(--amber)', accthold:'var(--red)' };

  const tasks = (typeof taskStore !== 'undefined' ? taskStore : [])
    .filter(t => {
      if (t.proj !== projId) return false;
      if (EXCLUDED.includes(t.status||'')) return false;
      const nameLower = (t.name||'').toLowerCase();
      if (NAME_EXCLUDE.some(kw => nameLower.includes(kw))) return false;
      return true;
    });

  if (tasks.length === 0) {
    section.style.display = 'block';
    listEl.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:var(--muted)">No active tasks for this project</div>';
    return;
  }

  section.style.display = 'block';
  listEl.innerHTML = tasks.map(t => {
    const sel    = t._id === schedSelectedTaskId;
    const stLbl  = STATUS_LABELS[t.status] || t.status || 'New';
    const stClr  = STATUS_COLORS[t.status] || '#888';
    const lineNo = t.taskNum ? `#${t.taskNum}` : '—';
    return `<div class="sched-proj-opt${sel?' selected':''}" onclick="selectSchedTask('${t._id}')">
      <div style="display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);flex-shrink:0">${lineNo}</span>
          <span style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.name}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;padding-left:2px;">
          <span style="font-size:10px;font-weight:600;color:${stClr};background:${stClr}18;padding:1px 6px;border-radius:4px;">${stLbl}</span>
        </div>
      </div>
      <div class="sched-proj-opt-check">&#x2713;</div>
    </div>`;
  }).join('');
}

window.selectSchedTask = function(taskId) {
  schedSelectedTaskId = schedSelectedTaskId === taskId ? null : taskId; // toggle
  if (schedSelectedProjId) renderSchedTaskList(schedSelectedProjId);
};

// Project dropdown close handled via blur event

window.toggleSchedFlag = function(flag) {
  schedFlag = schedFlag === flag ? null : flag;  // toggle off if already set
  updateFlagUI();
};

function updateFlagUI() {
  ['reschedule','tentative'].forEach(f => {
    const box   = document.getElementById('flagBox' + f.charAt(0).toUpperCase() + f.slice(1));
    const label = document.getElementById('flagLabel' + f.charAt(0).toUpperCase() + f.slice(1));
    const check = box?.querySelector('span');
    const active = schedFlag === f;
    if (box)   { box.style.borderColor   = active ? (f==='reschedule'?'#c9a800':'#555') : (f==='reschedule'?'#c9a800':'#888'); }
    if (check) { check.style.display     = active ? 'block' : 'none'; }
    if (label) { label.style.borderColor = active ? (f==='reschedule'?'#c9a800':'#888') : 'var(--border)';
                 label.style.background  = active ? (f==='reschedule'?'#fff8cc':'#f0f0f0') : 'transparent'; }
  });
}

window.applySchedDur = function(days) {
  const s = document.getElementById('schedStartDate').value || todayStr();
  document.getElementById('schedEndDate').value = toDateStr(addDays(parseDate(s), days - 1));
  document.querySelectorAll('.sched-dur-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  schedDateChanged();
};

window.schedDateChanged = function() {
  const s = document.getElementById('schedStartDate').value;
  const e = document.getElementById('schedEndDate').value;
  const preview = document.getElementById('schedDurationPreview');
  if (s && e && e >= s) {
    const d = diffDays(s, e) + 1;
    preview.textContent = `Duration: ${d} day${d!==1?'s':''}`;
  } else {
    preview.textContent = '';
  }
};

function _doSaveSchedBlock() {
  const _isEmpBlock = document.getElementById('schedBlockType')?.value === 'employee';
  const _empId      = _isEmpBlock ? (document.getElementById('schedEmpPicker')?.value || null) : null;
  const _empEvtType = _isEmpBlock ? (document.getElementById('schedEmpEventType')?.value || null) : null;

  if (!_isEmpBlock && !schedSelectedCat) { alert('Please select a lab room / asset.'); return; }
  if (_isEmpBlock && !_empId)            { alert('Please select an employee.'); return; }
  if (_isEmpBlock && !_empEvtType)       { alert('Please select Vacation, Sick, or Working.'); return; }

  const s = document.getElementById('schedStartDate').value;
  const e = document.getElementById('schedEndDate').value;
  if (!s || !e || e < s) { alert('Please set valid start and end dates.'); return; }
  const lbl = (document.getElementById('schedLabel').value || '').trim();
  const editId = document.getElementById('schedEditId').value;
  if (editId) {
    const idx = schedBlocks.findIndex(b => b.id === editId);
    if (idx >= 0) {
      const _isEmpSave = _isEmpBlock;
      const _empEvt    = _isEmpSave ? (document.getElementById('schedEmpEventType')?.value || null) : null;
      // For employee blocks, rowId = emp_<id>; for room blocks use selected cat
      const _rowId     = _isEmpSave && _empId ? ('emp_' + _empId) : schedSelectedCat;
      schedBlocks[idx].rowId        = _rowId;
      schedBlocks[idx].cat          = _isEmpSave ? '__emp__' : rowCat(schedSelectedCat);
      schedBlocks[idx].empId        = _empId;
      schedBlocks[idx].empEventType = _empEvt;
      schedBlocks[idx].start     = s;
      schedBlocks[idx].end       = e;
      schedBlocks[idx].startTime = document.getElementById('schedStartTime').value || null;
      schedBlocks[idx].endTime   = document.getElementById('schedEndTime').value   || null;
      schedBlocks[idx].label     = lbl;
      schedBlocks[idx].projId    = schedSelectedProjId || null;
      schedBlocks[idx].taskId    = schedSelectedTaskId  || null;
      schedBlocks[idx].flag      = schedFlag             || null;
    }
  } else {
    schedBlocks.push({
      id: 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      rowId: (()=>{ const _ie=document.getElementById('schedBlockType')?.value==='employee'; const _eid=_ie?(document.getElementById('schedEmpPicker')?.value||null):null; return _ie&&_eid?'emp_'+_eid:schedSelectedCat; })(),
      cat:   (()=>{ return document.getElementById('schedBlockType')?.value==='employee'?'__emp__':rowCat(schedSelectedCat); })(),
      empId: (()=>{ return document.getElementById('schedBlockType')?.value==='employee'?(document.getElementById('schedEmpPicker')?.value||null):null; })(),
      empEventType: (()=>{ return document.getElementById('schedBlockType')?.value==='employee'?(document.getElementById('schedEmpEventType')?.value||null):null; })(),
      start: s, end: e,
      startTime: document.getElementById('schedStartTime').value || null,
      endTime:   document.getElementById('schedEndTime').value   || null,
      label: lbl, projId: schedSelectedProjId || null,
      taskId: schedSelectedTaskId || null,
      flag:   schedFlag           || null
    });
  }
  // Persist to Supabase
  const _savedBlock = editId
    ? schedBlocks.find(b => b.id === editId)
    : schedBlocks[schedBlocks.length - 1];
  if (_savedBlock) schedSaveBlock(_savedBlock);
  closeSchedModal();
  if (schedView === 'calendar') renderSchedCalendar(); else renderSched();
}

window.saveSchedBlock   = _doSaveSchedBlock;

window.deleteSchedBlock = function() {
  const editId = document.getElementById('schedEditId').value;
  schedBlocks = schedBlocks.filter(b => b.id !== editId);
  schedDeleteFromDB(editId);
  closeSchedModal();
  if (schedView === 'calendar') renderSchedCalendar(); else renderSched();
};

// ---- View mode (gantt | calendar) ----
let schedView = 'gantt';

window.setSchedView = function(v, btn) {
  schedView = v;
  const ganttBody   = document.querySelector('.sched-body');
  const ganttLegend = document.getElementById('schedLegend');
  const ganttZoom   = document.getElementById('schedGanttZoomGroup');
  const calView     = document.getElementById('schedCalView');
  document.querySelectorAll('#schedViewGantt,#schedViewCal').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (v === 'calendar') {
    if (ganttBody)   ganttBody.style.display   = 'none';
    if (ganttLegend) ganttLegend.style.display  = 'none';
    if (ganttZoom)   ganttZoom.style.display    = 'none';
    if (calView)     calView.style.display      = 'block';
    if (schedZoom !== 'month') { schedZoom = 'month'; schedOffset = 0; }
    renderSchedCalendar();
  } else {
    if (ganttBody)   ganttBody.style.display   = '';
    if (ganttLegend) ganttLegend.style.display  = '';
    if (ganttZoom)   ganttZoom.style.display    = '';
    if (calView)     calView.style.display      = 'none';
    renderSched();
  }
};

// ---- Calendar render ----
function renderSchedCalendar() {
  const today = new Date(); today.setHours(0,0,0,0);
  const d0 = new Date(today.getFullYear(), today.getMonth() + schedOffset, 1);
  const displayYear  = d0.getFullYear();
  const displayMonth = d0.getMonth();

  document.getElementById('schedRangeLabel').textContent =
    d0.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(displayYear, displayMonth, 1);
  const lastDay  = new Date(displayYear, displayMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay); gridStart.setDate(gridStart.getDate() - startDow);
  const endDow = (lastDay.getDay() + 6) % 7;
  const gridEnd = new Date(lastDay); gridEnd.setDate(gridEnd.getDate() + (6 - endDow));

  const cells = [];
  for (let cur = new Date(gridStart); cur <= gridEnd; cur.setDate(cur.getDate() + 1)) cells.push(new Date(cur));

  const todayStr2 = toDateStr(today);
  // Build holiday lookup for visible months
  const calHolidays = (typeof getHolidays === 'function')
    ? [...new Set([displayYear, displayYear-1])].flatMap(y => getHolidays(y))
    : [];

  function blocksForDate(ds) {
    return schedBlocks.filter(b => b.start <= ds && b.end >= ds)
      .sort((a,b) => a.start.localeCompare(b.start));
  }

  const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = '<div class="sched-cal-grid">';
  DOW.forEach(d => { html += `<div class="sched-cal-dow">${d}</div>`; });

  cells.forEach(cell => {
    const ds        = toDateStr(cell);
    const isToday   = ds === todayStr2;
    const isOther   = cell.getMonth() !== displayMonth;
    const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;
    const holiday   = calHolidays.find(h => h.date === ds);
    const cls = ['sched-cal-day', isToday?'today-cell':'', isOther?'other-month':'', isWeekend?'weekend-cell':'', holiday?'holiday-day':''].filter(Boolean).join(' ');

    const dayBlocks = blocksForDate(ds);
    const MAX_SHOW  = 8;
    const shown     = dayBlocks.slice(0, MAX_SHOW);
    const extra     = dayBlocks.length - MAX_SHOW;
    const holidayTag = holiday ? `<div class="sched-cal-holiday-tag">&#x1F4C5; ${holiday.name}</div>` : '';

    const entries = shown.map(blk => {
      const color = resolveBlockColor(blk);
      const fmt = t => { if (!t) return ''; const [h,m] = t.split(':'); const hr=+h; return (hr%12||12)+(m&&m!=='00'?':'+m:'')+(hr<12?'am':'pm'); };
      const timeLbl = blk.startTime ? fmt(blk.startTime) : '';
      const pi    = blk.projId ? getProjInfo(blk.projId) : null;
      const proj  = pi ? (pi.proj.name||'') : '';
      const cust  = pi ? (pi.info.client||'') : '';
      const room  = rowLabel(blk.rowId || blk.cat);
      const emp   = blk.empId ? (typeof employees!=='undefined'?employees:[]).find(e=>e.id===blk.empId) : null;
      let parts = [];
      if (blk.empId) {
        const evtLbl = blk.empEventType==='vacation'?'Vacation':blk.empEventType==='sick'?'Sick':'Work';
        parts = [(emp ? emp.name.split(' ').pop() : '') + ':' + evtLbl];
        if (blk.label) parts.push(blk.label);
      } else {
        if (proj) parts.push(proj);
        if (cust) parts.push(cust);
        if (room && room !== blk.cat) parts.push(room);
      }
      const bodyText = parts.join('  ');
      const titleTxt = (timeLbl ? timeLbl + '  ' : '') + bodyText;
      return `<div class="sched-cal-entry" title="${titleTxt}">
        <span class="sched-cal-entry-dot" style="background:${color};"></span>
        ${timeLbl ? `<span class="sched-cal-entry-time" style="color:${color};">${timeLbl}</span>` : ''}
        <span class="sched-cal-entry-body">${bodyText}</span>
      </div>`;
    }).join('');

    const moreHtml = extra > 0 ? `<div class="sched-cal-more">+${extra} more</div>` : '';

    html += `<div class="${cls}">
      <div class="sched-cal-daynum">${cell.getDate()}</div>
      ${holidayTag}${entries}${moreHtml}
    </div>`;
  });

  html += '</div>';
  document.getElementById('schedCalGrid').innerHTML = html;
}

// ---- Toggle rooms/employees sections ----
window.toggleSchedSection = function(section, btn) {
  if (section === 'rooms') {
    schedShowRooms = !schedShowRooms;
  } else {
    schedShowEmps = !schedShowEmps;
  }
  btn.classList.toggle('on', section === 'rooms' ? schedShowRooms : schedShowEmps);
  renderSched();
};

// ---- Modal: type switching ----
window.schedBlockTypeChanged = function() {
  const type  = document.getElementById('schedBlockType').value;
  const isEmp = type === 'employee';
  const show  = el => { if (el) el.style.display = ''; };
  const hide  = el => { if (el) el.style.display = 'none'; };

  const flagSection = document.querySelector('.sched-flag-section');

  if (isEmp) {
    hide(document.getElementById('schedRoomSection'));
    hide(document.getElementById('schedProjWrap'));
    hide(document.getElementById('schedTaskSection'));
    hide(document.getElementById('schedProjPreview'));
    show(document.getElementById('schedEmpSection'));
    show(document.getElementById('schedEmpTypeField'));
    if (flagSection) hide(flagSection);
  } else {
    show(document.getElementById('schedRoomSection'));
    show(document.getElementById('schedProjWrap'));
    hide(document.getElementById('schedEmpSection'));
    hide(document.getElementById('schedEmpTypeField'));
    if (flagSection) show(flagSection);
    // taskSection and projPreview shown only when a project is selected
  }
};

window.schedEmpPickerChanged = function() {
  // no-op — employee is stored on select change
};

// ---- Employee color logic ----
function getEmpEventColor(eventType) {
  if (eventType === 'vacation') return '#43a047';   // green
  if (eventType === 'sick')     return '#e91e9e';   // magenta
  return '#3a7fd4';                                  // working — blue
}

// ---- Compute combined rows (rooms + divider + employees) based on toggles ----
function getSchedRowsAll() {
  const roomRows = schedShowRooms
    ? SCHED_ROWS.map(r => ({ ...r, section: 'room' }))
    : [];
  const empRows = schedShowEmps
    ? (typeof employees !== 'undefined' ? employees : [])
        .filter(e => e.isActive !== false && e.name)
        .map(e => ({
          rowId:   'emp_' + e.id,
          cat:     '__emp__',
          label:   e.name,
          empId:   e.id,
          initials: e.initials,
          color:   e.color,
          section: 'employee',
        }))
    : [];

  const rows = [];
  if (roomRows.length) rows.push(...roomRows);
  if (roomRows.length && empRows.length) rows.push({ rowId: '__divider__', section: 'divider', label: 'Employees' });
  if (empRows.length)  rows.push(...empRows);
  return rows;
}

// Re-render on resize so 1-week fills available width
window.addEventListener('resize', () => {
  const panel = document.getElementById('panel-scheduler');
  if (panel?.classList.contains('active') && schedView === 'gantt' &&
      (schedZoom === '1week' || schedZoom === 'week' || schedZoom === 'month')) {
    renderSched();
  }
});

// Expose scheduler-settings helpers to global scope
window.sc                  = sc;
window.loadSchedSettings   = loadSchedSettings;
window.saveSchedSettings   = saveSchedSettings;
window.empHasSchedAccess   = empHasSchedAccess;
window.resolveBlockColor   = resolveBlockColor;
window.getSchedSettings    = function() { return schedSettings; };

})(); // end scheduler IIFE


