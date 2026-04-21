
// ===== EMPLOYEE STORE =====
// ===== EMPLOYEE STORE =====
let employees = []; // loaded from Supabase

let editingEmpId = null;
let empColor = '#5b4fcf';


// ===== EMPLOYEES PANEL =====
// ===== EMPLOYEES PANEL =====
function openEmployeesPanel(el) {

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  
  activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('topbarName').textContent = 'Employees';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-employees').classList.add('active');
  _myInfoReadOnly = false;  // ensure full edit rights in the manager view
  _loadCmmcScreenedIds().then(() => renderEmployeesPanel(''));
}

let empDetailOpen = null;
let empProfileTab = 'profile'; // 'profile' | 'lifecycle' | 'hrrecords'
let lifecycleCache = {}; // empId -> lifecycle records
let hrRecordsCache = {}; // empId -> { reviews: [], discipline: [] }
let _myInfoReadOnly = false; // when true, Lifecycle/HR tabs render read-only even for managers
// Note: `templates` is declared in admin.js. We populate it here on demand.

// Ensure the templates global is populated from Supabase before any lifecycle
// rendering touches it. Safe to call repeatedly — only hits the DB once.
async function _ensureTemplatesLoaded() {
  if (typeof templates !== 'undefined' && templates && templates.length) return;
  if (!sb) return;
  try {
    const { data, error } = await sb.from('templates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      console.error('Failed to load templates:', error);
      if (typeof templates !== 'undefined') templates = [];
      return;
    }
    // Assign to the shared global (declared in admin.js)
    templates = data || [];
  } catch (e) {
    console.error('Failed to load templates:', e);
    if (typeof templates !== 'undefined') templates = [];
  }
}

// ── Time-off helpers ────────────────────────────────────────────────────────

function getHolidays(year) {
  // Compute variable holidays for a given year
  const easterDate = y => {
    const f = Math.floor, a = y%19, b = f(y/100), c = y%100,
      d = f(b/4), e = b%4, g = f((8*b+13)/25), h = (19*a+b-d-g+15)%30,
      i = f(c/4), k = c%4, l = (32+2*e+2*i-h-k)%7,
      m = f((a+11*h+19*l)/433), n = f((h+l-7*m+90)/25), p = (h+l-7*m+33*n+19)%32;
    return new Date(y, n-1, p);
  };
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate()+n); return r; };
  const nthWeekday = (y, m, wd, n) => { const d = new Date(y, m, 1); let c = 0; while(d.getMonth()===m){if(d.getDay()===wd){c++;if(c===n)return new Date(d);}d.setDate(d.getDate()+1);} };
  const lastWeekday = (y, m, wd) => { const d = new Date(y, m+1, 0); while(d.getDay()!==wd)d.setDate(d.getDate()-1); return d; };
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const easter = easterDate(year);
  const goodFriday = addDays(easter, -2);
  const memorialDay = lastWeekday(year, 4, 1); // last Monday of May
  const laborDay = nthWeekday(year, 8, 1, 1);  // 1st Monday Sep
  const columbusDay = nthWeekday(year, 9, 1, 2); // 2nd Monday Oct
  const thanksgiving = nthWeekday(year, 10, 4, 4); // 4th Thursday Nov
  const blackFriday = addDays(thanksgiving, 1);
  const holidays = [
    { name: "New Year's Eve",    date: fmt(new Date(year-1, 11, 31)) },
    { name: "New Year's Day",    date: fmt(new Date(year, 0, 1)) },
    { name: "Martin Luther King Jr. Day", date: fmt(nthWeekday(year, 0, 1, 3)) },
    { name: "Presidents' Day",   date: fmt(nthWeekday(year, 1, 1, 3)) },
    { name: "Good Friday",       date: fmt(goodFriday) },
    { name: "Memorial Day",      date: fmt(memorialDay) },
    { name: "Juneteenth",        date: fmt(new Date(year, 5, 19)) },
    { name: "Independence Day",  date: fmt(new Date(year, 6, 4)) },
    { name: "Labor Day",         date: fmt(laborDay) },
    { name: "Columbus Day",      date: fmt(columbusDay) },
    { name: "Veterans Day",      date: fmt(new Date(year, 10, 11)) },
    { name: "Thanksgiving Day",  date: fmt(thanksgiving) },
    { name: "Black Friday",      date: fmt(blackFriday) },
    { name: "Christmas Eve",     date: fmt(new Date(year, 11, 24)) },
    { name: "Christmas Day",     date: fmt(new Date(year, 11, 25)) },
  ];
  return holidays;
}

function getVacationAllotment(hireDateStr) {
  if (!hireDateStr) return 0;
  const hire = new Date(hireDateStr + 'T00:00:00');
  const today = new Date();
  const yearsWorked = (today - hire) / (365.25 * 24 * 60 * 60 * 1000);
  if (yearsWorked < 5) return 80; // 2 weeks
  // After 5 years: 80 + 8hrs (1 day) per additional year, max 120hrs (3 weeks)
  return Math.min(120, 80 + Math.floor(yearsWorked - 5) * 8);
}

function getFirstAnniversary(hireDateStr) {
  if (!hireDateStr) return null;
  const hire = new Date(hireDateStr + 'T00:00:00');
  const anniv = new Date(hire);
  anniv.setFullYear(hire.getFullYear() + 1);
  return anniv;
}

function isInFirstYear(hireDateStr) {
  if (!hireDateStr) return false;
  const firstAnniv = getFirstAnniversary(hireDateStr);
  return firstAnniv > new Date();
}

function getQuarterlyAccrual(hireDateStr, annivStart) {
  // Returns how much vacation has accrued so far in the current anniversary year.
  // Rule: NO vacation accrues during the first year of employment.
  // On the first anniversary the full allotment drops at once.
  // From year 2 onward, quarterly drops apply.
  const today = new Date();

  if (!hireDateStr) return 0;

  // Still in first year — no vacation earned yet
  if (isInFirstYear(hireDateStr)) return 0;

  const allotment = getVacationAllotment(hireDateStr);
  const dropAmt = allotment / 4;

  if (!annivStart) {
    // Fallback: if no annivStart, use calendar quarters but only after first anniversary
    const quarter = Math.floor(today.getMonth() / 3) + 1;
    return dropAmt * quarter;
  }

  // Is this the first anniversary year? (annivStart === first anniversary date)
  const firstAnniv = getFirstAnniversary(hireDateStr);
  const isFirstAnnivYear = Math.abs(annivStart - firstAnniv) < 24 * 60 * 60 * 1000; // within 1 day

  if (isFirstAnnivYear) {
    // The 80h lump sum already dropped at the first anniversary and is reflected
    // in the employee's vacBank opening balance. Just apply standard quarterly drops.
    let accrued = 0;
    for (let q = 1; q <= 4; q++) {
      const dropDate = new Date(annivStart.getFullYear(), annivStart.getMonth() + (q * 3), annivStart.getDate());
      if (dropDate <= today) accrued += dropAmt;
    }
    return accrued;
  }

  // Year 2+ — standard quarterly drops from annivStart
  let accrued = 0;
  for (let q = 1; q <= 4; q++) {
    const dropDate = new Date(annivStart.getFullYear(), annivStart.getMonth() + (q * 3), annivStart.getDate());
    if (dropDate <= today) accrued += dropAmt;
  }
  return accrued;
}

function getPartTimeSickAccrued(empId, calYear) {
  // Part-time only: 1h sick per 30h worked, calendar year Jan 1 – Dec 31, max 40h
  // Counts both project hours AND overhead work hours (General Overhead, Sales Support, etc.)
  // Does NOT count sick/vacation/holiday/personal/snow day hours
  const NON_WORK_CATS = ['Sick', 'Sick Time', 'Vacation Time', 'Personal Time', 'Holiday', 'Snow Day'];
  const yr = calYear || new Date().getFullYear();
  const rangeStart = new Date(yr, 0, 1);
  const rangeEnd   = new Date(yr + 1, 0, 1);
  let totalHoursWorked = 0;
  Object.entries(tsData).forEach(([key, rows]) => {
    const isOh = key.startsWith('oh_');
    const baseKey = isOh ? key.slice(3) : key;
    if (!baseKey.startsWith(empId + '|')) return;
    const weekKey = baseKey.split('|')[1];
    if (!weekKey) return;
    const weekDate = new Date(weekKey + 'T00:00:00');
    if (weekDate < rangeStart || weekDate >= rangeEnd) return;
    if (!isOh && Array.isArray(rows)) {
      // Regular project hours
      rows.forEach(row => {
        if (row.hours) totalHoursWorked += Object.values(row.hours).reduce((s,h)=>s+(parseFloat(h)||0),0);
      });
    } else if (isOh && rows && typeof rows === 'object') {
      // Overhead work hours only — skip PTO categories
      Object.entries(rows).forEach(([cat, dayMap]) => {
        const normCat = cat.replace(/^\d+-/, '').replace(/^⬡\s*/, '').trim();
        if (NON_WORK_CATS.some(c => normCat.includes(c))) return;
        if (!dayMap) return;
        Object.values(dayMap).forEach(h => { totalHoursWorked += parseFloat(h) || 0; });
      });
    }
  });
  return Math.min(40, Math.floor(totalHoursWorked / 30)); // 1h per 30h worked, capped at 40h
}

function getTimeOffUsed(empId, year, annivStart, annivEnd) {
  const used = { vacation: 0, sick: 0, holiday: 0, holidayDays: [] };
  // If anniversary dates provided, use them; otherwise fall back to calendar year
  const rangeStart = annivStart || new Date(year, 0, 1);
  const rangeEnd   = annivEnd   || new Date(year + 1, 0, 1);
  const allWeekKeys = new Set();
  Object.keys(tsData).forEach(k => {
    if (k.startsWith(empId + '|') && !k.startsWith('oh_')) allWeekKeys.add(k.split('|')[1]);
    if (k.startsWith('oh_' + empId + '|')) allWeekKeys.add(k.split('|')[1]);
  });
  allWeekKeys.forEach(weekKey => {
    if (!weekKey) return;
    const weekDate = new Date(weekKey + 'T00:00:00');
    // Include week if any day of it could fall in range (week spans Mon-Sun)
    const weekEnd = new Date(weekDate); weekEnd.setDate(weekDate.getDate() + 6);
    if (weekEnd < rangeStart || weekDate >= rangeEnd) return;
    const ohKey = 'oh_' + empId + '|' + weekKey;
    const oh = tsData[ohKey] || {};
    // Vacation — check each day individually so Dec weeks don't bleed into next year
    const vacByDay = oh['Vacation Time'] || {};
    Object.entries(vacByDay).forEach(([di, hrs]) => {
      const h = parseFloat(hrs) || 0;
      if (h <= 0) return;
      const d = new Date(weekDate);
      d.setDate(weekDate.getDate() + parseInt(di));
      if (d < rangeStart || d >= rangeEnd) return;
      used.vacation += h;
    });
    // Sick — check each day individually too
    // Merge all sick category variants into one map per day
    const sickMerged = {};
    ['Sick', 'Sick Time', '⬡ Sick Time'].forEach(cat => {
      Object.entries(oh[cat] || {}).forEach(([di, hrs]) => {
        sickMerged[di] = (sickMerged[di] || 0) + (parseFloat(hrs) || 0);
      });
    });
    Object.entries(sickMerged).forEach(([di, h]) => {
      if (h <= 0) return;
      const d = new Date(weekDate);
      d.setDate(weekDate.getDate() + parseInt(di));
      if (d < rangeStart || d >= rangeEnd) return;
      used.sick += h;
    });
    // Holiday / Snow Day - track per day
    // Merge Holiday and Snow Day into one map
    const holMerged = {};
    ['Holiday', 'Snow Day'].forEach(cat => {
      Object.entries(oh[cat] || {}).forEach(([di, hrs]) => {
        holMerged[di] = (holMerged[di] || 0) + (parseFloat(hrs) || 0);
      });
    });
    const holByDay = holMerged;
    Object.entries(holByDay).forEach(([di, hrs]) => {
      const h = parseFloat(hrs) || 0;
      if (h <= 0) return;
      // di is 0=Sun...6=Sat, week starts Sunday
      const d = new Date(weekDate);
      d.setDate(weekDate.getDate() + parseInt(di));
      if (d < rangeStart || d >= rangeEnd) return;
      const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      used.holiday += h;
      used.holidayDays.push({ date: dateStr, hrs: h });
    });
  });
  return used;
}

// ── Employee panel ───────────────────────────────────────────────────────────

let showInactiveEmployees = false;
let empDeptFilter = 'all'; // 'all' | 'nulabs' | 'ballantine'
let cmmcScreenedIds = new Set(); // employee_ids with a completed screening record

async function _loadCmmcScreenedIds() {
  try {
    const { data } = await sb.from('cmmc_personnel_records')
      .select('employee_id')
      .eq('record_type', 'screening');
    cmmcScreenedIds = new Set((data || []).map(r => r.employee_id).filter(Boolean));
  } catch(e) {
    cmmcScreenedIds = new Set();
  }
}

function toggleInactiveEmployees() {
  showInactiveEmployees = !showInactiveEmployees;
  renderEmployeesPanel(document.getElementById('empSearch')?.value || '');
}

function setEmpDeptFilter(dept) {
  empDeptFilter = dept;
  renderEmployeesPanel(document.getElementById('empSearch')?.value || '');
}

function renderEmployeesPanel(search) {
  const q = (search || '').toLowerCase();
  const filtered = employees.filter(e => {
    const _empInactive = e.isActive === false || !!e.terminationDate;
    if (!showInactiveEmployees && _empInactive) return false;
    if (empDeptFilter === 'ballantine' && (e.dept || '').toLowerCase() !== 'ballantine') return false;
    if (empDeptFilter === 'nulabs' && (e.dept || '').toLowerCase() === 'ballantine') return false;
    return e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      (e.dept || '').toLowerCase().includes(q);
  }).sort((a, b) => {
    const lastA = a.name.trim().split(' ').slice(-1)[0].toLowerCase();
    const lastB = b.name.trim().split(' ').slice(-1)[0].toLowerCase();
    return lastA.localeCompare(lastB);
  });
  const inactiveCount = employees.filter(e => e.isActive === false || !!e.terminationDate).length;
  const deptBtn = (label, val) => `<button onclick="setEmpDeptFilter('${val}')"
    style="flex:1;padding:4px 6px;font-size:10px;font-weight:600;border-radius:6px;cursor:pointer;border:1px solid var(--border);
    background:${empDeptFilter===val?'var(--amber)':'var(--surface2)'};color:${empDeptFilter===val?'#000':'var(--muted)'};transition:background .15s">${label}</button>`;
  const body = document.getElementById('empPanelBody');
  body.innerHTML = `
    <div style="display:flex;height:100%;gap:0;overflow:hidden">
      <!-- Left: employee list -->
      <div style="width:260px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surface)">
        <div style="padding:16px 14px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <input style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none"
            placeholder="Search…" value="${q}" oninput="renderEmployeesPanel(this.value)" id="empSearch" />
          <button onclick="openEmployeeModal(null)" style="background:var(--amber);border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:600;color:#000;cursor:pointer;white-space:nowrap">+ Add</button>
        </div>
        <div style="padding:6px 14px;border-bottom:1px solid var(--border);display:flex;gap:4px">
          ${deptBtn('All', 'all')}
          ${deptBtn('NU Labs', 'nulabs')}
          ${deptBtn('Ballantine', 'ballantine')}
        </div>
        ${inactiveCount > 0 ? `<div style="padding:6px 14px;border-bottom:1px solid var(--border)">
          <button onclick="toggleInactiveEmployees()" style="width:100%;background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:10px;color:var(--muted);cursor:pointer;text-align:left">
            ${showInactiveEmployees ? '👁 Hide' : '👁 Show'} ${inactiveCount} inactive employee${inactiveCount!==1?'s':''}
          </button>
        </div>` : ''}
        <div>
          ${filtered.map(e => {
            const isInactive = e.isActive === false || !!e.terminationDate;
            const termLabel = e.terminationDate ? 'Terminated ' + new Date(e.terminationDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Inactive';
            const hasScreening = cmmcScreenedIds.has(e.id);
            const isBallantine = (e.dept || '').toLowerCase() === 'ballantine';
            const shieldBadge = isInactive || isBallantine ? '' :
              hasScreening
                ? `<span title="CMMC screening record on file" style="font-size:13px;line-height:1;flex-shrink:0">🛡️</span>`
                : `<span title="No CMMC screening record — click to add" style="font-size:12px;flex-shrink:0;opacity:0.5;cursor:pointer" onclick="event.stopPropagation();openCompliancePanel(null);complianceSwitchTab('personnel')">⚠️</span>`;
            return `
            <div onclick="showEmpProfile('${e.id}')" id="emplistrow-${e.id}"
              style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;opacity:${isInactive?'0.55':'1'};${empDetailOpen===e.id?'background:var(--surface2);border-left:3px solid var(--amber);':'border-left:3px solid transparent;'}"
              onmouseover="if('${e.id}'!==empDetailOpen)this.style.background='var(--surface2)'" onmouseout="if('${e.id}'!==empDetailOpen)this.style.background=''">
              <div style="width:34px;height:34px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${e.initials}</div>
              <div style="overflow:hidden;flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</div>
                <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isInactive ? '<span style="color:var(--red);font-weight:600">'+termLabel+'</span>' : e.role+(e.dept?' · '+e.dept:'')}</div>
              </div>
              ${shieldBadge}
            </div>`;}).join('')}
        </div>
      </div>
      <!-- Right: profile -->
      <div id="empProfilePane" style="flex:1;overflow-y:auto;padding:28px 32px;background:var(--bg)">
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:14px;flex-direction:column;gap:10px">
          <div style="font-size:36px">👤</div>
          <div>Select an employee to view their profile</div>
        </div>
      </div>
    </div>
  `;
  if (empDetailOpen) showEmpProfile(empDetailOpen);
}

function showEmpProfile(empId, annivOffset) {
  annivOffset = annivOffset || 0;
  empDetailOpen = empId;
  // Highlight in list
  document.querySelectorAll('[id^="emplistrow-"]').forEach(el => {
    const eid = el.id.replace('emplistrow-','');
    el.style.background = eid === empId ? 'var(--surface2)' : '';
    el.style.borderLeft = eid === empId ? '3px solid var(--amber)' : '3px solid transparent';
  });
  const pane = document.getElementById('empProfilePane');
  if (!pane) return;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  const isInactive = emp.isActive === false || !!emp.terminationDate;
  const year = new Date().getFullYear() + annivOffset;
  // Calculate anniversary year window from hire date, shifted by annivOffset
  const _annivRange = (() => {
    if (!emp.hireDate) return null;
    const hire = new Date(emp.hireDate + 'T00:00:00');
    const now = new Date();
    let annivStart = new Date(hire); annivStart.setFullYear(now.getFullYear());
    if (annivStart > now) annivStart.setFullYear(now.getFullYear() - 1);
    // Shift by offset
    annivStart.setFullYear(annivStart.getFullYear() + annivOffset);
    const annivEnd = new Date(annivStart); annivEnd.setFullYear(annivStart.getFullYear() + 1);
    return { start: annivStart, end: annivEnd };
  })();
  // Part-time: sick tracking uses calendar year; full-time uses anniversary year
  const isPartTime = emp.empType === 'parttime';
  const usedStart = isPartTime ? new Date(year, 0, 1) : _annivRange?.start;
  const usedEnd   = isPartTime ? new Date(year + 1, 0, 1) : _annivRange?.end;
  const used = getTimeOffUsed(empId, year, usedStart, usedEnd);
  // For holiday display, always use calendar year so Jan holidays aren't missed for mid-year hire dates
  const usedHolidays = getTimeOffUsed(empId, year, null, null);
  const vacAllotment = getVacationAllotment(emp.hireDate);
  const vacAccrued = getQuarterlyAccrual(emp.hireDate, _annivRange?.start);
  const vacOpeningBalance = emp.vacBank || 0;
  const today = new Date();

  // Sick accrual: opening balance (sick_bank) + drops on Jan 1 and May 1 within anniversary year, capped at 48h
  // Part-time: NJ rule — 1h per 30h worked, no fixed drops
  let sickAllotment = 0;
  const sickOpeningBalance = emp.sickBank || 0;
  if (isPartTime) {
    const ptAccrued = getPartTimeSickAccrued(empId, new Date().getFullYear());
    sickAllotment = sickOpeningBalance + ptAccrued;
  } else if (emp.hireDate && _annivRange) {
    const annivStart = _annivRange.start;
    const annivEnd   = _annivRange.end;
    let running = sickOpeningBalance;
    // Add drops that have already occurred since anniv start up to today
    for (let y = annivStart.getFullYear(); y <= annivEnd.getFullYear(); y++) {
      for (const mo of [0, 4]) { // Jan=0, May=4
        const drop = new Date(y, mo, 1);
        if (drop > annivStart && drop <= annivEnd && drop <= today) {
          running = Math.min(48, running + 24);
        }
      }
    }
    sickAllotment = running;
  } else {
    if (today >= new Date(year, 0, 1)) sickAllotment += 24;
    if (today >= new Date(year, 4, 1)) sickAllotment += 24;
  }

  // sickAllotment = what's been accrued/available to take this year (capped at 48)
  // sickBankBalance = true running balance (opening + all drops - used), no cap
  const sickBankBalance = (() => {
    if (isPartTime) return Math.max(0, sickAllotment - used.sick);
    if (!emp.hireDate || !_annivRange) return sickOpeningBalance - used.sick;
    let running = sickOpeningBalance;
    const annivStart = _annivRange.start;
    const annivEnd   = _annivRange.end;
    for (let y = annivStart.getFullYear(); y <= annivEnd.getFullYear(); y++) {
      for (const mo of [0, 4]) {
        const drop = new Date(y, mo, 1);
        if (drop > annivStart && drop <= annivEnd && drop <= today) {
          running += 24; // no cap on bank balance
        }
      }
    }
    return Math.max(0, running - used.sick);
  })();

  // Calculate sick overage and how much flows to vacation
  const sickOverage = Math.max(0, used.sick - sickAllotment);
  // Vacation bank: opening balance + accrued so far - used (incl. sick overage charged to vacation)
  const vacBankBalance = vacOpeningBalance + vacAccrued - (used.vacation + sickOverage);
  const holidays = getHolidays(year);
  const approver = employees.find(e => e.id === emp.approverId);

  const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';
  const yearsWorked = emp.hireDate ? ((new Date() - new Date(emp.hireDate+'T00:00:00')) / (365.25*24*60*60*1000)).toFixed(1) : null;

  const bar = (used, allotment, color) => {
    const pct = allotment > 0 ? Math.min(100, (used/allotment)*100) : 0;
    const over = used > allotment;
    return `<div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden;margin-top:6px">
      <div style="height:100%;border-radius:6px;width:${pct}%;background:${over?'var(--red)':color};transition:width .4s"></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--muted)">
      <span>${used.toFixed(1)} hrs used${over?' ⚠ Over allotment':''}</span>
      <span>${allotment} hrs allotted</span>
    </div>`;
  };

  // Timesheet history
  // Deduplicate: one entry per week, keeping best status (approved > submitted > rejected > draft)
  const statusPriority = {approved:3, submitted:2, rejected:1};
  const weekBest = {};
  Object.values(tsWeekStatuses)
    .filter(ws => ws.employeeId === empId)
    .forEach(ws => {
      const existing = weekBest[ws.weekKey];
      if (!existing || (statusPriority[ws.status]||0) > (statusPriority[existing.status]||0)) {
        weekBest[ws.weekKey] = ws;
      }
    });
  const weeks = Object.values(weekBest)
    .sort((a,b) => b.weekKey.localeCompare(a.weekKey))
    .slice(0, 10);

  const statusBadge = s => ({
    submitted: '<span style="background:rgba(232,162,52,0.15);color:#e8a234;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">⏳ Pending</span>',
    approved:  '<span style="background:rgba(76,175,125,0.15);color:#4caf7d;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✓ Approved</span>',
    rejected:  '<span style="background:rgba(224,92,92,0.15);color:#e05c5c;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">✗ Rejected</span>',
  }[s] || '<span style="color:var(--muted);font-size:10px">Draft</span>');

  const fmtWeek = wk => { const sat = new Date(wk+'T00:00:00'); sat.setDate(sat.getDate()+6); return sat.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };

  const tsRows = weeks.map(ws => {
    const storeKey = empId + '|' + ws.weekKey;
    let hrs = 0;
    (tsData[storeKey]||[]).forEach(r => Object.values(r.hours||{}).forEach(h => hrs+=(parseFloat(h)||0)));
    const oh = tsData['oh_'+storeKey]||{};
    OVERHEAD_CATS.forEach(cat => Object.values(oh[cat]||{}).forEach(h => hrs+=(parseFloat(h)||0)));
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 12px;font-size:12px;font-family:'JetBrains Mono',monospace">${fmtWeek(ws.weekKey)}</td>
      <td style="padding:8px 12px">${statusBadge(ws.status)}</td>
      <td style="padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600">${hrs.toFixed(1)}h</td>
      <td style="padding:8px 12px;font-size:11px;color:var(--muted)">${ws.rejectionNote?'✗ '+ws.rejectionNote:ws.approvedBy?'✓ Approved':'—'}</td>
      <td style="padding:8px 12px;text-align:right">
        <button onclick="viewEmployeeTimesheet('${empId}','${ws.weekKey}')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--text);cursor:pointer">View</button>
      </td>
    </tr>`;
  }).join('');

  // ===== Weekly Hours Pivot Table (anniversary year × categories) =====
  // Replaces the legacy Chart.js bar chart — avoids stale-canvas issues and
  // makes per-category hours explicit and scannable.
  const PIVOT_CATEGORIES = [
    { key:'project',  label:'Direct to Job'    },
    { key:'genoh',    label:'General Overhead' },
    { key:'salessup', label:'Sales Support'    },
    { key:'vacation', label:'Vacation Time'    },
    { key:'personal', label:'Personal Time'    },
    { key:'holiday',  label:'Holiday'          },
    { key:'snow',     label:'Snow Day'         },
    { key:'sick',     label:'Sick'             },
  ];

  // Snap a date to the Sunday on or before it (timesheets are Sun–Sat weeks)
  const _sundayOnOrBefore = (d) => {
    const x = new Date(d);
    x.setDate(x.getDate() - x.getDay());
    x.setHours(0,0,0,0);
    return x;
  };

  // Anniversary window for full-time, calendar-year for part-time (matches PTO tracking)
  const _yearAnchor = isPartTime
    ? new Date(year, 0, 1)
    : ((_annivRange && _annivRange.start)
        ? _annivRange.start
        : new Date((new Date().getFullYear() + (annivOffset || 0)), 0, 1));
  const _yearStart = _sundayOnOrBefore(_yearAnchor);
  const pivotWeeks = [];
  for (let i = 0; i < 52; i++) {
    const d = new Date(_yearStart);
    d.setDate(d.getDate() + 7 * i);
    pivotWeeks.push(d.toISOString().split('T')[0]);
  }
  const _todayWeekKey = _sundayOnOrBefore(new Date()).toISOString().split('T')[0];

  // Aggregate hours per category per week
  const pivotData = {};
  PIVOT_CATEGORIES.forEach(c => { pivotData[c.key] = {}; });

  pivotWeeks.forEach(wk => {
    const storeKey = empId + '|' + wk;
    const rows = tsData[storeKey] || [];
    let projHrs = 0;
    rows.forEach(r => {
      if (r && r.hours) projHrs += Object.values(r.hours).reduce((s,h)=>s+(parseFloat(h)||0),0);
    });
    if (projHrs > 0) pivotData.project[wk] = projHrs;

    // Overhead — normalize category names (strip "290-" / "⬡ ")
    const oh = tsData['oh_' + storeKey] || {};
    const ohNorm = {};
    Object.entries(oh).forEach(([cat, dayMap]) => {
      if (!dayMap) return;
      const nc = cat.replace(/^\d+-/, '').replace(/^⬡\s*/, '').trim();
      const hrs = Object.values(dayMap).reduce((s,h)=>s+(parseFloat(h)||0),0);
      ohNorm[nc] = (ohNorm[nc] || 0) + hrs;
    });
    Object.entries(ohNorm).forEach(([cat, hrs]) => {
      if (hrs <= 0) return;
      let k = 'genoh'; // unknown cats fall into the "other work" bucket
      if (cat === 'General Overhead')      k = 'genoh';
      else if (cat === 'Sales Support')    k = 'salessup';
      else if (cat === 'Vacation Time')    k = 'vacation';
      else if (cat === 'Personal Time')    k = 'personal';
      else if (cat === 'Holiday')          k = 'holiday';
      else if (cat === 'Snow Day')         k = 'snow';
      else if (cat === 'Sick' || cat === 'Sick Time') k = 'sick';
      pivotData[k][wk] = (pivotData[k][wk] || 0) + hrs;
    });
  });

  // Per-week totals and utilization
  const _utilCutoff = new Date('2026-03-09T00:00:00');
  const weekTotals = {};
  const weekUtil = {}; // null = not computable (pre-cutoff, future, or zero in-building)
  pivotWeeks.forEach(wk => {
    const t = PIVOT_CATEGORIES.reduce((s,c) => s + (pivotData[c.key][wk]||0), 0);
    weekTotals[wk] = t;
    const inBuilding = (pivotData.project[wk]||0) + (pivotData.genoh[wk]||0) + (pivotData.salessup[wk]||0);
    const wkDate = new Date(wk + 'T00:00:00');
    if (wkDate < _utilCutoff || wk > _todayWeekKey || inBuilding <= 0) {
      weekUtil[wk] = null;
    } else {
      weekUtil[wk] = Math.round(((pivotData.project[wk]||0) / inBuilding) * 100);
    }
  });

  // YTD totals per category (sum only up to current week) + weighted utilization
  const ytd = {};
  PIVOT_CATEGORIES.forEach(c => {
    ytd[c.key] = pivotWeeks.reduce((s,wk) => s + (wk <= _todayWeekKey ? (pivotData[c.key][wk]||0) : 0), 0);
  });
  const ytdTotal = PIVOT_CATEGORIES.reduce((s,c) => s + ytd[c.key], 0);
  const ytdInBuilding = ytd.project + ytd.genoh + ytd.salessup;
  const ytdUtil = ytdInBuilding > 0 ? Math.round((ytd.project / ytdInBuilding) * 100) : null;
  const weeksLoggedCount = pivotWeeks.filter(wk => wk <= _todayWeekKey && (weekTotals[wk]||0) > 0).length;

  // Formatters / helpers
  const _fmtHdr = (wk) => { const s = new Date(wk+'T00:00:00'); s.setDate(s.getDate()+6); return s.toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
  const _fmtRange = (d) => d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
  const _utilColor = u => u === null ? 'var(--muted)' : u >= 80 ? 'var(--green)' : u >= 60 ? 'var(--amber)' : 'var(--red)';
  const _cellBg = (wk) => {
    if (wk === _todayWeekKey) return 'rgba(232,162,52,0.12)';
    if (wk > _todayWeekKey)   return 'var(--surface2)';
    return 'var(--surface)';
  };
  const _numCell = (val, wk, opts) => {
    opts = opts || {};
    const isFuture = wk > _todayWeekKey;
    const bg = _cellBg(wk);
    const borders = 'border-bottom:1px solid var(--border);' + (opts.topBorder ? 'border-top:2px solid var(--border);' : '');
    const fw = opts.bold ? 'font-weight:700' : '';
    let display;
    if (val > 0) display = val.toFixed(1);
    else if (isFuture) display = '';
    else display = '<span style="color:var(--muted)">—</span>';
    return '<td style="background:'+bg+';padding:6px;'+borders+';text-align:right;font-family:\'JetBrains Mono\',monospace;font-size:12px;'+fw+'">'+display+'</td>';
  };
  const _utilCell = (wk) => {
    const u = weekUtil[wk];
    const isFuture = wk > _todayWeekKey;
    const bg = _cellBg(wk);
    let display;
    if (u !== null) display = '<span style="color:'+_utilColor(u)+';font-weight:600">'+u+'%</span>';
    else if (isFuture) display = '';
    else display = '<span style="color:var(--muted)">—</span>';
    return '<td style="background:'+bg+';padding:6px;border-bottom:1px solid var(--border);text-align:right;font-family:\'JetBrains Mono\',monospace;font-size:11px">'+display+'</td>';
  };

  // Sticky-cell base styles
  const STICKY_L_TH = 'position:sticky;left:0;z-index:3;background:var(--surface2);padding:8px 12px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);font-weight:600;font-size:11px;color:var(--muted);text-align:left;min-width:140px';
  const STICKY_R_TH = 'position:sticky;right:0;z-index:3;background:var(--surface2);padding:8px 12px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);font-weight:600;font-size:11px;color:var(--text);text-align:center;min-width:68px';
  const STICKY_L_TD = 'position:sticky;left:0;z-index:2;background:var(--surface);padding:8px 12px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);font-size:12px;color:var(--text);min-width:140px';
  const STICKY_R_TD = 'position:sticky;right:0;z-index:2;background:var(--surface2);padding:6px 12px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);text-align:right;font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:700;min-width:68px';

  const annivLabel = isPartTime
    ? 'Calendar year ' + year
    : ((_annivRange && _annivRange.start)
        ? _fmtRange(_annivRange.start) + ' – ' + _fmtRange(_annivRange.end)
        : 'Year ' + (new Date().getFullYear() + (annivOffset || 0)));

  let weeklyHoursChartHtml =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;flex-wrap:wrap">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:var(--text)">📋 Weekly Hours — '+(isPartTime ? 'Calendar Year' : 'Anniversary Year')+'</div>'+
          '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+annivLabel+'</div>'+
        '</div>'+
        '<div style="font-size:12px;color:var(--muted);text-align:right">'+
          (ytdUtil !== null ? 'Avg utilization <span style="font-weight:700;color:'+_utilColor(ytdUtil)+'">'+ytdUtil+'%</span> · ' : '')+
          weeksLoggedCount+' of 52 weeks logged'+
        '</div>'+
      '</div>'+
      '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px">'+
        '<table id="empPivot_'+empId+'" style="border-collapse:separate;border-spacing:0;width:max-content;font-size:12px">'+
          '<thead>'+
            // Row 1: week numbers
            '<tr>'+
              '<th style="'+STICKY_L_TH+';border-bottom:0">&nbsp;</th>'+
              pivotWeeks.map((wk, i) => {
                const bg = _cellBg(wk);
                const isNow = wk === _todayWeekKey;
                const weight = isNow ? '700' : '600';
                const col = isNow ? 'var(--amber)' : 'var(--muted)';
                const idAttr = isNow ? ' id="empPivotNowCol_'+empId+'"' : '';
                return '<th'+idAttr+' style="background:'+bg+';padding:6px 6px 2px;border-bottom:0;font-weight:'+weight+';font-size:10px;color:'+col+';text-align:center;min-width:50px;font-family:\'JetBrains Mono\',monospace">Wk '+(i+1)+'</th>';
              }).join('')+
              '<th style="'+STICKY_R_TH+';border-bottom:0">&nbsp;</th>'+
            '</tr>'+
            // Row 2: week-ending dates
            '<tr>'+
              '<th style="'+STICKY_L_TH+'">Category</th>'+
              pivotWeeks.map(wk => {
                const bg = _cellBg(wk);
                return '<th style="background:'+bg+';padding:2px 6px 8px;border-bottom:1px solid var(--border);font-weight:500;font-size:10px;color:var(--muted);text-align:center;min-width:50px;font-family:\'JetBrains Mono\',monospace">'+_fmtHdr(wk)+'</th>';
              }).join('')+
              '<th style="'+STICKY_R_TH+'">YTD</th>'+
            '</tr>'+
          '</thead>'+
          '<tbody>'+
            PIVOT_CATEGORIES.map(c => '<tr>'+
              '<td style="'+STICKY_L_TD+'">'+c.label+'</td>'+
              pivotWeeks.map(wk => _numCell(pivotData[c.key][wk]||0, wk)).join('')+
              '<td style="'+STICKY_R_TD+'">'+(ytd[c.key] > 0 ? ytd[c.key].toFixed(1) : '<span style="color:var(--muted);font-weight:400">—</span>')+'</td>'+
            '</tr>').join('')+
            // Total row
            '<tr>'+
              '<td style="'+STICKY_L_TD.replace('background:var(--surface)','background:var(--surface2)')+';border-top:2px solid var(--border);font-weight:700">Total</td>'+
              pivotWeeks.map(wk => _numCell(weekTotals[wk]||0, wk, {topBorder:true, bold:true})).join('')+
              '<td style="'+STICKY_R_TD+';border-top:2px solid var(--border)">'+(ytdTotal > 0 ? ytdTotal.toFixed(1) : '—')+'</td>'+
            '</tr>'+
            // Utilization row
            '<tr>'+
              '<td style="'+STICKY_L_TD+';font-style:italic;color:var(--muted)">Utilization</td>'+
              pivotWeeks.map(wk => _utilCell(wk)).join('')+
              '<td style="'+STICKY_R_TD+';font-size:11px">'+(ytdUtil !== null ? '<span style="color:'+_utilColor(ytdUtil)+'">'+ytdUtil+'%</span>' : '<span style="color:var(--muted);font-weight:400">—</span>')+'</td>'+
            '</tr>'+
          '</tbody>'+
        '</table>'+
      '</div>'+
      '<div style="display:flex;gap:16px;margin-top:10px;font-size:10.5px;color:var(--muted);align-items:center;flex-wrap:wrap">'+
        '<span><span style="display:inline-block;width:10px;height:10px;background:rgba(232,162,52,0.25);vertical-align:middle;margin-right:5px;border-radius:2px;border:1px solid rgba(232,162,52,0.4)"></span>current week</span>'+
        '<span><span style="display:inline-block;width:10px;height:10px;background:var(--surface2);vertical-align:middle;margin-right:5px;border-radius:2px;border:1px solid var(--border)"></span>future (not yet entered)</span>'+
        '<span style="margin-left:auto;opacity:0.7">← scroll left for earlier weeks</span>'+
      '</div>'+
    '</div>';

    pane.innerHTML = `
    ${_myInfoReadOnly ? '' : `
    <!-- Tab bar (shown only in manager-view of Employees panel; in My Info the outer tab bar handles this) -->
    <div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:24px;background:var(--bg);position:sticky;top:0;z-index:10">
      ${['profile','lifecycle','hrrecords'].map(t => {
        const labels = { profile:'👤 Profile', lifecycle:'🔄 Lifecycle', hrrecords:'📋 HR Records' };
        const active = empProfileTab === t;
        return `<button onclick="switchEmpTab('${empId}','${t}')"
          style="padding:10px 20px;background:transparent;border:none;border-bottom:2.5px solid ${active?'var(--amber)':'transparent'};font-family:'DM Sans',sans-serif;font-size:13px;font-weight:${active?'600':'500'};color:${active?'var(--amber)':'var(--muted)'};cursor:pointer;transition:all var(--transition);margin-bottom:-1.5px;white-space:nowrap">
          ${labels[t]}
        </button>`;
      }).join('')}
    </div>`}
    <div id="empTabContent" style="padding:0 28px 28px">
    ${empProfileTab === 'profile' ? `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:64px;height:64px;border-radius:50%;background:${emp.color};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials}</div>
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:24px;color:var(--text)">${emp.name}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px">${emp.role}${emp.dept?' · '+emp.dept:''}</div>
          ${yearsWorked ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">Hired ${fmtDate(emp.hireDate)} · ${yearsWorked} yrs seniority</div>` : ''}
        </div>
      </div>
      ${isManager() && !_myInfoReadOnly ? `<div style="display:flex;gap:8px">
        <button onclick="openEmployeeModal('${empId}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--text);cursor:pointer">✎ Edit</button>
        <button onclick="deleteEmployee('${empId}')" style="background:transparent;border:1px solid rgba(224,92,92,0.4);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--red);cursor:pointer">✕ Remove</button>
      </div>` : ''}
    </div>

    <!-- CMMC Screening status banner (active, non-Ballantine employees only) -->
    ${!isInactive && (emp.dept||'').toLowerCase() !== 'ballantine' ? (() => {
      const screened = cmmcScreenedIds.has(empId);
      return screened
        ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(46,158,98,0.07);border:1px solid rgba(46,158,98,0.3);border-radius:8px;margin-bottom:18px;font-size:12.5px">
            <span style="font-size:16px">🛡️</span>
            <div style="flex:1;color:var(--green);font-weight:600">CMMC Pre-Employment Screening on file</div>
            <button onclick="openCompliancePanel(null);complianceSwitchTab('personnel')"
              style="background:transparent;border:1px solid rgba(46,158,98,0.4);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--green);cursor:pointer">View Record</button>
          </div>`
        : `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(232,162,52,0.07);border:1px solid rgba(232,162,52,0.35);border-radius:8px;margin-bottom:18px;font-size:12.5px">
            <span style="font-size:16px">⚠️</span>
            <div style="flex:1;color:var(--amber);font-weight:600">No CMMC Pre-Employment Screening record found</div>
            <button onclick="openCompliancePanel(null);complianceSwitchTab('personnel')"
              style="background:var(--amber);border:none;border-radius:6px;padding:4px 10px;font-size:11px;color:#000;font-weight:600;cursor:pointer">+ Add Screening</button>
          </div>`;
    })() : ''}

    <!-- Info cards row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px">
      ${emp.email ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Work Email</div>
        <div style="font-size:12px;color:var(--text)">${emp.email}</div>
      </div>` : ''}
      ${emp.personalEmail ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Personal Email</div>
        <div style="font-size:12px;color:var(--text)">${emp.personalEmail}</div>
      </div>` : ''}
      ${emp.phone ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Phone</div>
        <div style="font-size:12px;color:var(--text)">${emp.phone}</div>
      </div>` : ''}
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Permission Role</div>
        <div style="font-size:12px;color:var(--text)">${(()=>{ const r = permissionRoles.find(r=>r.id===emp.roleId); return r ? r.name : '<span style="color:var(--muted)">—</span>'; })()}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Approver</div>
        <div style="font-size:12px;color:var(--text)">${approver ? approver.name : '—'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Timesheet</div>
        <div style="font-size:12px;color:var(--text)">${emp.isPaperTs ? '📄 Paper' : '💻 Digital'}</div>
      </div>
    </div>

    <!-- Time off section -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">🏖 Time Off</div>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto">
          <button onclick="showEmpProfile('${empId}', ${annivOffset - 1})" style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px;color:var(--muted)">◀</button>
          <div style="font-size:12px;font-weight:600;color:var(--text);min-width:160px;text-align:center">
            ${_annivRange ? _annivRange.start.toLocaleDateString('en-US',{month:'short',year:'numeric'}) + ' – ' + new Date(_annivRange.end-1).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : String(year)}
            ${annivOffset === 0 ? '<span style="font-size:10px;color:var(--green);margin-left:4px">Current</span>' : ''}
          </div>
          <button onclick="showEmpProfile('${empId}', ${annivOffset + 1})" ${annivOffset >= 0 ? 'disabled' : ''} style="background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:12px;color:var(--muted);${annivOffset >= 0 ? 'opacity:.3;cursor:not-allowed' : 'cursor:pointer'}">▶</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:${isPartTime?'1fr':'1fr 1fr'};gap:20px">
        <!-- Vacation -->
        ${isPartTime ? '<div style="display:none">' : '<div>'}
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="font-size:12px;font-weight:600;color:var(--text)">Vacation</div>
            <div style="font-size:13px;font-weight:600;color:${isInFirstYear(emp.hireDate) ? 'var(--muted)' : (annivOffset === 0 && vacBankBalance < 0 ? 'rgba(208,64,64,0.95)' : 'var(--blue)')}">
              ${isInFirstYear(emp.hireDate) && annivOffset === 0
                ? '0h — first year'
                : annivOffset === 0 ? vacBankBalance.toFixed(2)+'h bank balance' : (used.vacation + sickOverage).toFixed(1)+'h used'}
            </div>
          </div>
          ${isInFirstYear(emp.hireDate) && annivOffset === 0 ? (() => {
            const firstAnniv = getFirstAnniversary(emp.hireDate);
            const fmtAnniv = firstAnniv ? firstAnniv.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '';
            return '<div style="margin-top:8px;padding:10px 12px;background:rgba(232,162,52,0.08);border:1px solid rgba(232,162,52,0.25);border-radius:8px;font-size:12px;color:var(--amber)">'+
              '⏳ No vacation accrues during the first year of employment.<br>'+
              '<b>80h will be available on ' + fmtAnniv + '</b> (first anniversary).'+
            '</div>';
          })() : (() => {
            // Build quarterly drop visualization
            const totalAvail = annivOffset === 0 ? vacOpeningBalance + vacAllotment : vacAllotment;
            const usedHrs = used.vacation + sickOverage;
            const usedPct = totalAvail > 0 ? Math.min(100, (usedHrs / totalAvail) * 100) : 0;
            const over = usedHrs > totalAvail;
            const fmtShort = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
            const today2 = new Date();

            // Calculate quarterly drop dates and amounts from annivStart
            const drops = [];
            if (_annivRange) {
              const dropAmt = vacAllotment / 4;
              for (let q = 1; q <= 4; q++) {
                const dropDate = new Date(_annivRange.start);
                dropDate.setMonth(dropDate.getMonth() + (q * 3));
                // Position as % of total year span
                const yearMs = _annivRange.end - _annivRange.start;
                const pct = ((dropDate - _annivRange.start) / yearMs) * 100;
                const past = dropDate <= today2;
                drops.push({ date: dropDate, pct, amt: dropAmt, past, label: fmtShort(dropDate) });
              }
            }

            // Today marker position
            const todayPct = _annivRange ? Math.min(100, Math.max(0,
              ((today2 - _annivRange.start) / (_annivRange.end - _annivRange.start)) * 100
            )) : null;

            return `
              <div style="position:relative;margin-top:10px;margin-bottom:32px">
                <!-- Bar track -->
                <div style="background:var(--surface2);border-radius:6px;height:10px;position:relative;overflow:visible">
                  <!-- Used fill -->
                  <div style="height:100%;border-radius:6px;width:${usedPct}%;background:${over?'rgba(208,64,64,0.85)':'var(--blue)'};transition:width .4s;position:relative;z-index:1"></div>
                  <!-- Today marker -->
                  ${todayPct !== null && annivOffset === 0 ? `<div style="position:absolute;left:${todayPct}%;top:-4px;bottom:-4px;width:2px;background:var(--amber);border-radius:2px;z-index:3" title="Today"></div>` : ''}
                  <!-- Drop tick marks -->
                  ${drops.map(d => `
                    <div style="position:absolute;left:${d.pct}%;top:-3px;bottom:-3px;width:2px;background:${d.past?'rgba(58,127,212,0.6)':'rgba(58,127,212,0.25)'};z-index:2;border-radius:1px"></div>
                  `).join('')}
                </div>
                <!-- Drop labels below -->
                <div style="position:relative;height:28px;margin-top:2px">
                  ${drops.map(d => `
                    <div style="position:absolute;left:${d.pct}%;transform:translateX(-50%);text-align:center;white-space:nowrap">
                      <div style="font-size:9px;font-weight:600;color:${d.past?'var(--blue)':'var(--muted)'}">${d.label}</div>
                      <div style="font-size:9px;color:${d.past?'var(--blue)':'var(--muted)'}">+${d.amt}h</div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:-20px">
                <span>${usedHrs.toFixed(1)}h used${over?' · bank overdrawn '+Math.abs(vacBankBalance).toFixed(1)+'h':''}</span>
                ${annivOffset === 0 ? `<span>opened ${vacOpeningBalance}h + ${vacAccrued}h accrued = ${(vacOpeningBalance + vacAccrued).toFixed(1)}h</span>` : `<span>${vacAllotment}h allotted</span>`}
              </div>`;
          })()}
          ${(() => {
            // Build vacation drill-down using anniversary range
            const vacEntries = [];
            const _vrs = _annivRange?.start || new Date(year, 0, 1);
            const _vre = _annivRange?.end   || new Date(year + 1, 0, 1);
            Object.keys(tsData).forEach(key => {
              if (!key.startsWith('oh_' + empId + '|')) return;
              const weekKey = key.split('|')[1];
              if (!weekKey) return;
              const weekDate = new Date(weekKey + 'T00:00:00');
              const weekEnd = new Date(weekDate); weekEnd.setDate(weekDate.getDate() + 6);
              if (weekEnd < _vrs || weekDate >= _vre) return;
              const oh = tsData[key] || {};
              const vacByDay = oh['Vacation Time'] || {};
              Object.entries(vacByDay).forEach(([di, hrs]) => {
                const h = parseFloat(hrs)||0;
                if (h <= 0) return;
                const d = new Date(weekDate);
                d.setDate(weekDate.getDate() + parseInt(di));
                if (d < _vrs || d >= _vre) return;
                vacEntries.push({ date: d.toISOString().slice(0,10), hrs: h });
              });
            });
            vacEntries.sort((a,b) => a.date.localeCompare(b.date));
            if (vacEntries.length === 0) return '';
            return '<div style="margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border)">' +
              '<div style="font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Vacation Days Used</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:5px">' +
              vacEntries.map(e =>
                '<span style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(58,127,212,0.12);border:1px solid rgba(58,127,212,0.3);color:var(--blue)">' +
                new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'}) + ' — ' + e.hrs + 'h' +
                '</span>'
              ).join('') +
              '</div></div>';
          })()}
          ${sickOverage > 0 ? `<div style="margin-top:6px;padding:5px 9px;border-radius:6px;background:rgba(208,64,64,0.08);border:1px solid rgba(208,64,64,0.25);font-size:11px;color:var(--muted)"><span style="color:rgba(208,64,64,0.85);font-weight:600">+ ${sickOverage.toFixed(1)}h</span> charged from sick overage</div>` : ''}
        </div>
        <!-- Sick -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="font-size:12px;font-weight:600;color:var(--text)">Sick</div>
            <div style="font-size:13px;font-weight:600;color:var(--amber)">${sickBankBalance.toFixed(1)}h bank balance</div>
          </div>
          ${(() => {
            if (isPartTime) {
              // Part-time: show hours worked and NJ accrual rate
              const ptAccrued = getPartTimeSickAccrued(empId, new Date().getFullYear());
              const totalHrsWorked = ptAccrued * 30;
              const usedPct = sickAllotment > 0 ? Math.min(100, (used.sick / sickAllotment) * 100) : 0;
              return `
                <div style="background:var(--surface2);border-radius:6px;height:10px;margin-top:10px;overflow:hidden">
                  <div style="height:100%;border-radius:6px;width:${usedPct}%;background:var(--amber);transition:width .4s"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--muted)">
                  <span>${used.sick.toFixed(1)}h used of ${sickAllotment}h accrued</span>
                  <span>~${totalHrsWorked}h worked · 1h per 30h (NJ)</span>
                </div>`;
            }
            const usedSick = used.sick;
            const over = usedSick > sickAllotment;
            // Sick bar is a "what's in the sick ledger" gauge, not a cumulative-used counter.
            // Overage hours have been transferred out to the vacation ledger and no longer
            // count against the sick bucket, so the bar only ever shows bank-drawn hours.
            const inBucket = Math.min(usedSick, sickAllotment);
            const toVacation = Math.max(0, usedSick - sickAllotment);
            const sickUsedPct = sickAllotment > 0 ? Math.min(100, (inBucket / sickAllotment) * 100) : 0;
            const fmtShort = d => d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
            const today2 = new Date();
            const sickDrops = [];
            if (_annivRange) {
              const yearMs = _annivRange.end - _annivRange.start;
              for (let y = _annivRange.start.getFullYear(); y <= _annivRange.end.getFullYear(); y++) {
                for (const mo of [0, 4]) {
                  const dropDate = new Date(y, mo, 1);
                  if (dropDate > _annivRange.start && dropDate <= _annivRange.end) {
                    const pct = ((dropDate - _annivRange.start) / yearMs) * 100;
                    const past = dropDate <= today2;
                    sickDrops.push({ date: dropDate, pct, amt: 24, past, label: fmtShort(dropDate) });
                  }
                }
              }
            }
            const todayPct = _annivRange ? Math.min(100, Math.max(0,
              ((today2 - _annivRange.start) / (_annivRange.end - _annivRange.start)) * 100
            )) : null;
            // Label tells the full story: what's in the sick bucket right now, plus any
            // hours that were taken this year but transferred out to vacation.
            let leftLabel;
            if (over && inBucket === 0) {
              leftLabel = '0.0h in bucket · ' + usedSick.toFixed(1) + 'h taken this year (all \u2192 vacation)';
            } else if (over) {
              leftLabel = inBucket.toFixed(1) + 'h in bucket · ' + toVacation.toFixed(1) + 'h of ' + usedSick.toFixed(1) + 'h taken went \u2192 vacation';
            } else {
              leftLabel = usedSick.toFixed(1) + 'h used';
            }
            return `
              <div style="position:relative;margin-top:10px;margin-bottom:32px">
                <div style="background:var(--surface2);border-radius:6px;height:10px;position:relative;overflow:visible">
                  <div style="height:100%;border-radius:6px;width:${sickUsedPct}%;background:var(--amber);transition:width .4s;position:relative;z-index:1"></div>
                  ${todayPct !== null && annivOffset === 0 ? `<div style="position:absolute;left:${todayPct}%;top:-4px;bottom:-4px;width:2px;background:var(--amber);border-radius:2px;z-index:3" title="Today"></div>` : ''}
                  ${sickDrops.map(d => `
                    <div style="position:absolute;left:${d.pct}%;top:-3px;bottom:-3px;width:2px;background:${d.past?'rgba(232,162,52,0.7)':'rgba(232,162,52,0.25)'};z-index:2;border-radius:1px"></div>
                  `).join('')}
                </div>
                <div style="position:relative;height:28px;margin-top:2px">
                  ${sickDrops.map(d => `
                    <div style="position:absolute;left:${d.pct}%;transform:translateX(-50%);text-align:center;white-space:nowrap">
                      <div style="font-size:9px;font-weight:600;color:${d.past?'var(--amber)':'var(--muted)'}">${d.label}</div>
                      <div style="font-size:9px;color:${d.past?'var(--amber)':'var(--muted)'}">+${d.amt}h</div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:-20px;gap:10px">
                <span>${leftLabel}</span>
                <span style="white-space:nowrap">opened ${sickOpeningBalance}h + up to 48h drops</span>
              </div>${(() => {
                // Show the next upcoming drop (if any) and what the bank will look like after.
                // Overage under Interpretation A is already paid from vacation — future drops
                // create fresh sick capacity, they do NOT retroactively rebate vacation.
                const futureDrops = sickDrops.filter(d => !d.past);
                if (futureDrops.length === 0) return '';
                const next = futureDrops[0];
                // Projected bank after drop = current bank + drop amount (capped at 48 by policy,
                // but actual cap logic runs in getTimeOffUsed so keep this display simple).
                const projectedBank = Math.min(48, Math.max(0, sickBankBalance) + next.amt);
                return '<div style="margin-top:4px;font-size:10px;color:var(--muted);font-style:italic">Next drop ' + next.label + ' (+' + next.amt + 'h) → sick bank will be ' + projectedBank.toFixed(1) + 'h</div>';
              })()}`;
          })()}
          ${(() => {
            // Sick-days drill-down — mirrors the vacation list, colors overage chips
            // in soft red so it's visually obvious which day(s) hit the vacation bank.
            if (isPartTime) return ''; // part-time sick accounting works differently
            const sickEntries = [];
            const _srs = _annivRange?.start || new Date(year, 0, 1);
            const _sre = _annivRange?.end   || new Date(year + 1, 0, 1);
            const SICK_CAT_KEYS = ['Sick', 'Sick Time', '⬡ Sick Time'];
            Object.keys(tsData).forEach(key => {
              if (!key.startsWith('oh_' + empId + '|')) return;
              const weekKey = key.split('|')[1];
              if (!weekKey) return;
              const weekDate = new Date(weekKey + 'T00:00:00');
              const weekEnd = new Date(weekDate); weekEnd.setDate(weekDate.getDate() + 6);
              if (weekEnd < _srs || weekDate >= _sre) return;
              const oh = tsData[key] || {};
              // Merge all sick variants per day so we don't double-count
              const byDay = {};
              SICK_CAT_KEYS.forEach(cat => {
                Object.entries(oh[cat] || {}).forEach(([di, hrs]) => {
                  byDay[di] = (byDay[di] || 0) + (parseFloat(hrs) || 0);
                });
              });
              Object.entries(byDay).forEach(([di, hrs]) => {
                if (hrs <= 0) return;
                const d = new Date(weekDate);
                d.setDate(weekDate.getDate() + parseInt(di));
                if (d < _srs || d >= _sre) return;
                sickEntries.push({ date: d.toISOString().slice(0,10), hrs: hrs });
              });
            });
            sickEntries.sort((a,b) => a.date.localeCompare(b.date));
            if (sickEntries.length === 0) return '';
            // Walk chronologically and tag hours past the allotment as 'overage'
            let runningUsed = 0;
            const tagged = sickEntries.map(e => {
              const before = runningUsed;
              runningUsed += e.hrs;
              const bankHrs    = Math.max(0, Math.min(e.hrs, sickAllotment - before));
              const overageHrs = Math.max(0, e.hrs - bankHrs);
              return { ...e, bankHrs, overageHrs };
            });
            return '<div style="margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;border:1px solid var(--border)">' +
              '<div style="font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Sick Days Used</div>' +
              '<div style="display:flex;flex-wrap:wrap;gap:5px">' +
              tagged.map(e => {
                const dateLabel = new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',weekday:'short'});
                // Fully from sick bank → amber. Fully overage → soft red. Split → show both chips.
                if (e.overageHrs === 0) {
                  return '<span title="Drawn from sick bank" style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(232,162,52,0.12);border:1px solid rgba(232,162,52,0.35);color:var(--amber)">' + dateLabel + ' — ' + e.hrs + 'h</span>';
                }
                if (e.bankHrs === 0) {
                  return '<span title="Sick bank empty — charged against vacation" style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(208,64,64,0.1);border:1px solid rgba(208,64,64,0.3);color:rgba(208,64,64,0.95)">↪ ' + dateLabel + ' — ' + e.hrs + 'h</span>';
                }
                // Split day: part sick bank, part overage
                return '<span title="' + e.bankHrs + 'h from sick bank, ' + e.overageHrs + 'h charged against vacation" style="font-size:10px;padding:2px 8px;border-radius:6px;background:rgba(232,162,52,0.12);border:1px solid rgba(208,64,64,0.3);color:var(--amber)">' + dateLabel + ' — ' + e.bankHrs + 'h <span style="color:rgba(208,64,64,0.95)">+ ' + e.overageHrs + 'h ↪</span></span>';
              }).join('') +
              '</div></div>';
          })()}
          ${sickOverage > 0 ? `<div style="margin-top:6px;padding:5px 9px;border-radius:6px;background:rgba(208,64,64,0.08);border:1px solid rgba(208,64,64,0.25);font-size:11px;color:var(--muted)"><span style="color:rgba(208,64,64,0.85);font-weight:600">↪ ${sickOverage.toFixed(1)}h</span> charged against vacation bank</div> ` : ''}
        </div>
      </div>
      <!-- Holiday -->
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <div style="font-size:12px;font-weight:600;color:var(--text)">Holidays</div>
          <div style="font-size:11px;color:var(--muted)">${used.holiday.toFixed(1)} hrs logged</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${holidays.filter(h=>h.date.startsWith(String(year))).map(h => {
            const taken = (usedHolidays.holidayDays||[]).find(d => d.date === h.date);
            return taken
              ? `<span title="${taken.hrs}hrs logged" style="font-size:10px;padding:3px 8px;border-radius:8px;background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);color:#4caf7d">✓ ${h.name}</span>`
              : `<span style="font-size:10px;padding:3px 8px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)">${h.name}</span>`;
          }).join('')}
        </div>
        ${(() => {
          const knownDates = new Set(holidays.map(h => h.date));
          const extraDays = (usedHolidays.holidayDays||[]).filter(d => !knownDates.has(d.date));
          if (extraDays.length === 0) return '';
          return `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--amber);margin-bottom:6px">Extra Paid Days</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${extraDays.map(d =>
                `<span style="font-size:10px;padding:3px 8px;border-radius:8px;background:rgba(232,162,52,0.12);border:1px solid rgba(232,162,52,0.35);color:#e8a234">
                  ${new Date(d.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} — ${d.hrs}hrs
                </span>`
              ).join('')}
            </div>
          </div>`;
        })()}
      </div>
    </div>

    <!-- Weekly hours bar chart -->
    ${weeklyHoursChartHtml}

    <!-- Timesheet history -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">📅 Timesheet History</div>
        <div style="font-size:11px;color:var(--muted)">Last 10 weeks</div>
      </div>
      ${weeks.length === 0
        ? `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">No timesheets submitted yet.</div>`
        : `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Week Of</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Status</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Hours</th>
              <th style="text-align:left;padding:6px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Notes</th>
              <th></th>
            </tr></thead>
            <tbody>${tsRows}</tbody>
          </table>`}
    </div>
  ` : empProfileTab === 'hrrecords' ? `<div id="hrRecordsTabInner"></div>` : `<div id="lifecycleTabInner"></div>`}
  </div>
  `;

  // Scroll the pivot table so the current week lands at the right edge of the
  // visible scroll area (just left of the sticky YTD column). If you're viewing
  // a past anniversary year, no current week exists in view so we scroll to the end.
  if (empProfileTab === 'profile') {
    setTimeout(() => {
      const table = document.getElementById('empPivot_' + empId);
      if (!table) return;
      const scroller = table.parentElement;
      if (!scroller) return;
      const nowCol = document.getElementById('empPivotNowCol_' + empId);
      if (nowCol) {
        // Find the sticky YTD column width so we don't hide the current week under it
        const ytdTh = table.querySelector('thead tr:last-child th:last-child');
        const ytdW = ytdTh ? ytdTh.offsetWidth : 68;
        // Target scroll: place current-week column flush against the YTD sticky edge
        const target = nowCol.offsetLeft + nowCol.offsetWidth - (scroller.clientWidth - ytdW);
        scroller.scrollLeft = Math.max(0, target);
      } else {
        // No current week in this view (viewing a prior anniversary year) — show the tail end
        scroller.scrollLeft = scroller.scrollWidth;
      }
    }, 40);
  }

  // If not profile tab, load tab content
  if (empProfileTab === 'lifecycle') {
    _loadLifecycleTab(empId, emp);
  } else if (empProfileTab === 'hrrecords') {
    _loadHrRecordsTab(empId, emp);
  }
}

// ════════════════════════════════════════════════════════════════════
//  UNIFIED EMPLOYEE LIFECYCLE SYSTEM  
// ════════════════════════════════════════════════════════════════════

function switchEmpTab(empId, tab) {
  empProfileTab = tab;
  showEmpProfile(empId);
}

// ── Load unified lifecycle data ─────────────────────────────────────────────

async function _loadLifecycleTab(empId, emp) {
  const inner = document.getElementById('lifecycleTabInner');
  if (!inner) return;
  inner.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">Loading…</div>';

  // Make sure template definitions are in memory before we filter them
  await _ensureTemplatesLoaded();
  if (!templates.length) {
    inner.innerHTML = '<div style="padding:20px;color:var(--red);font-size:13px">No lifecycle templates found. Check the <code>templates</code> table in Supabase.</div>';
    return;
  }

  // Determine employee track
  const isBallantine = (emp.dept||'').toLowerCase() === 'ballantine';
  const track = isBallantine ? 'ballantine' : 'nulabs';
  
  // Load lifecycle data for this employee
  let lifecycleData = {};
  if (!lifecycleCache[empId]) {
    const { data } = await sb.from('employee_lifecycle')
      .select('*')
      .eq('employee_id', empId);
    lifecycleCache[empId] = data || [];
  }
  
  // Convert array to lookup object
  lifecycleCache[empId].forEach(record => {
    lifecycleData[record.template_key] = record;
  });

  // Get applicable templates for this track
  const applicableTemplates = templates.filter(t => 
    t.track === track && 
    (t.type === 'onboarding' || t.type === 'offboarding')
  );
  
  // Get unique template keys (each key appears in both onboarding and offboarding)
  const templateKeys = [...new Set(applicableTemplates.map(t => t.key))]
    .sort((a, b) => {
      const aTemplate = applicableTemplates.find(t => t.key === a && t.type === 'onboarding');
      const bTemplate = applicableTemplates.find(t => t.key === b && t.type === 'onboarding');
      return (aTemplate?.sort_order || 0) - (bTemplate?.sort_order || 0);
    });

  // Calculate progress
  const applicableItems = templateKeys.filter(key => !lifecycleData[key]?.is_na);
  const onboardingComplete = applicableItems.filter(key => lifecycleData[key]?.onboarding_date).length;
  const offboardingComplete = applicableItems.filter(key => lifecycleData[key]?.offboarding_date).length;
  
  const canEdit = isManager() && !_myInfoReadOnly;
  const isInactive = emp.isActive === false || !!emp.terminationDate;

  inner.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:12px">
        <div style="background:var(--surface2);border-radius:8px;padding:8px 12px;border-left:3px solid #4caf7d">
          <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:2px">Onboarding Progress</div>
          <div style="font-size:16px;font-weight:700;color:#4caf7d">${onboardingComplete} / ${applicableItems.length} applicable</div>
        </div>
        <div style="background:var(--surface2);border-radius:8px;padding:8px 12px;border-left:3px solid #e05c5c">
          <div style="font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:2px">Offboarding Progress</div>
          <div style="font-size:16px;font-weight:700;color:#e05c5c">${offboardingComplete} / ${applicableItems.length} applicable</div>
        </div>
      </div>
      
      ${!isInactive ? `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(232,162,52,0.07);border:1px solid rgba(232,162,52,0.35);border-radius:8px;font-size:12.5px">
          <span style="font-size:16px">⚠️</span>
          <div style="color:var(--amber);font-weight:600">This employee is currently active. Offboarding items are for future use.</div>
        </div>
      ` : ''}
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:12px 16px;font-size:12px;font-weight:600;color:var(--text)">Template Item</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:600;color:var(--text);width:140px">Onboarding</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:600;color:var(--text);width:140px">Offboarding</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:600;color:var(--text);width:80px">N/A</th>
            <th style="text-align:center;padding:12px 16px;font-size:12px;font-weight:600;color:var(--text);width:80px">Help</th>
          </tr>
        </thead>
        <tbody>
          ${templateKeys.map(key => {
            const onboardingTemplate = applicableTemplates.find(t => t.key === key && t.type === 'onboarding');
            const offboardingTemplate = applicableTemplates.find(t => t.key === key && t.type === 'offboarding');
            const record = lifecycleData[key] || {};
            const isNA = record.is_na || false;
            const onboardingDate = record.onboarding_date || '';
            const offboardingDate = record.offboarding_date || '';
            const onbNotes = record.onboarding_notes || '';
            const offNotes = record.offboarding_notes || '';
            const showOnbNotes = !isNA && onboardingTemplate?.notes_enabled;
            const showOffNotes = !isNA && offboardingTemplate?.notes_enabled;
            
            return `
              <tr style="border-bottom:${(showOnbNotes || showOffNotes) ? 'none' : '1px solid var(--border)'};${isNA ? 'opacity:0.5;' : ''}" data-key="${key}">
                <td style="padding:12px 16px;font-size:13px;color:var(--text)">${onboardingTemplate?.label || key}</td>
                <td style="text-align:center;padding:12px 16px">
                  ${isNA ? `<span style="color:var(--muted);font-size:12px">N/A</span>` : 
                    canEdit ? `
                      <div style="display:inline-flex;align-items:center;gap:6px">
                        <span style="font-size:14px;font-weight:700;line-height:1;color:${onboardingDate ? '#4caf7d' : 'var(--border)'}">${onboardingDate ? '✓' : '○'}</span>
                        <input type="date" value="${onboardingDate}" 
                          onchange="updateLifecycleItem('${empId}', '${key}', 'onboarding_date', this.value)"
                          style="border:1px solid ${onboardingDate ? '#4caf7d' : 'var(--border)'};border-radius:4px;padding:4px 6px;font-size:12px;background:${onboardingDate ? 'rgba(76,175,125,0.10)' : 'var(--bg)'};color:${onboardingDate ? '#4caf7d' : 'var(--text)'};font-weight:${onboardingDate ? '600' : 'normal'}">
                      </div>` :
                    (onboardingDate ? `<span style="color:#4caf7d;font-weight:600">✓ ${formatLifecycleDate(onboardingDate)}</span>` : 
                     `<span style="color:var(--muted)">⏸️ pending</span>`)
                  }
                </td>
                <td style="text-align:center;padding:12px 16px">
                  ${isNA ? `<span style="color:var(--muted);font-size:12px">N/A</span>` : 
                    canEdit ? `
                      <div style="display:inline-flex;align-items:center;gap:6px">
                        <span style="font-size:14px;font-weight:700;line-height:1;color:${offboardingDate ? '#e05c5c' : 'var(--border)'}">${offboardingDate ? '●' : '○'}</span>
                        <input type="date" value="${offboardingDate}" 
                          onchange="updateLifecycleItem('${empId}', '${key}', 'offboarding_date', this.value)"
                          style="border:1px solid ${offboardingDate ? '#e05c5c' : 'var(--border)'};border-radius:4px;padding:4px 6px;font-size:12px;background:${offboardingDate ? 'rgba(224,92,92,0.10)' : 'var(--bg)'};color:${offboardingDate ? '#e05c5c' : 'var(--text)'};font-weight:${offboardingDate ? '600' : 'normal'}">
                      </div>` :
                    (offboardingDate ? `<span style="color:#e05c5c;font-weight:600">● ${formatLifecycleDate(offboardingDate)}</span>` : 
                     `<span style="color:var(--muted)">⏸️ pending</span>`)
                  }
                </td>
                <td style="text-align:center;padding:12px 16px">
                  ${canEdit ? `<input type="checkbox" ${isNA ? 'checked' : ''} 
                    onchange="updateLifecycleItem('${empId}', '${key}', 'is_na', this.checked)"
                    style="width:16px;height:16px;accent-color:var(--amber)">` : 
                    (isNA ? '☑️' : '☐')
                  }
                </td>
                <td style="text-align:center;padding:12px 16px">
                  <button onclick="showLifecycleInstructions('${key}')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--text);cursor:pointer">
                    💡 How-to
                  </button>
                </td>
              </tr>
              ${showOnbNotes ? `
                <tr style="border-bottom:${showOffNotes ? 'none' : '1px solid var(--border)'}">
                  <td colspan="5" style="padding:0 16px 10px 16px">
                    <div style="display:flex;align-items:center;gap:8px;padding-left:8px">
                      <span style="font-size:11px;font-weight:600;color:#4caf7d;min-width:130px;text-transform:uppercase;letter-spacing:0.5px">📝 Onboarding Notes</span>
                      ${canEdit ? `
                        <input type="text" value="${onbNotes.replace(/"/g,'&quot;')}" placeholder="e.g. Dell Latitude s/n ABC123, assigned to desk 4…"
                          onchange="updateLifecycleItem('${empId}', '${key}', 'onboarding_notes', this.value)"
                          style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif"
                          onfocus="this.style.borderColor='#4caf7d'" onblur="this.style.borderColor='var(--border)'">
                      ` : `<span style="flex:1;font-size:12px;color:var(--muted);font-style:${onbNotes ? 'normal' : 'italic'}">${onbNotes || '(none)'}</span>`}
                    </div>
                  </td>
                </tr>
              ` : ''}
              ${showOffNotes ? `
                <tr style="border-bottom:1px solid var(--border)">
                  <td colspan="5" style="padding:0 16px 10px 16px">
                    <div style="display:flex;align-items:center;gap:8px;padding-left:8px">
                      <span style="font-size:11px;font-weight:600;color:#e05c5c;min-width:130px;text-transform:uppercase;letter-spacing:0.5px">📝 Offboarding Notes</span>
                      ${canEdit ? `
                        <input type="text" value="${offNotes.replace(/"/g,'&quot;')}" placeholder="e.g. Retrieved, wiped, returned to inventory…"
                          onchange="updateLifecycleItem('${empId}', '${key}', 'offboarding_notes', this.value)"
                          style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif"
                          onfocus="this.style.borderColor='#e05c5c'" onblur="this.style.borderColor='var(--border)'">
                      ` : `<span style="flex:1;font-size:12px;color:var(--muted);font-style:${offNotes ? 'normal' : 'italic'}">${offNotes || '(none)'}</span>`}
                    </div>
                  </td>
                </tr>
              ` : ''}
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    ${canEdit ? `
      <div style="margin-top:16px;text-align:center;color:var(--muted);font-size:12px">
        Changes are saved automatically
      </div>
    ` : ''}
  `;
}

// ── Update lifecycle item ─────────────────────────────────────────────

async function updateLifecycleItem(empId, templateKey, field, value) {
  try {
    // Prepare the update data
    const updateData = {
      employee_id: empId,
      template_key: templateKey,
      [field]: field === 'is_na' ? value : (value || null)
    };
    
    // If setting N/A, clear both dates
    if (field === 'is_na' && value) {
      updateData.onboarding_date = null;
      updateData.offboarding_date = null;
    }
    
    const { data, error } = await sb
      .from('employee_lifecycle')
      .upsert(updateData, { 
        onConflict: 'employee_id,template_key',
        ignoreDuplicates: false 
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Update cache
    lifecycleCache[empId] = lifecycleCache[empId] || [];
    const existingIndex = lifecycleCache[empId].findIndex(r => r.template_key === templateKey);
    if (existingIndex >= 0) {
      lifecycleCache[empId][existingIndex] = data;
    } else {
      lifecycleCache[empId].push(data);
    }
    
    // Refresh the lifecycle tab to show updated progress
    const emp = employees.find(e => e.id === empId);
    if (emp) _loadLifecycleTab(empId, emp);
    
  } catch (e) {
    console.error('Failed to update lifecycle item:', e);
    toast('⚠ Update failed');
  }
}

// ── Show tabbed how-to modal ─────────────────────────────────────────────

function showLifecycleInstructions(templateKey) {
  const onboardingTemplate = templates.find(t => t.key === templateKey && t.type === 'onboarding');
  const offboardingTemplate = templates.find(t => t.key === templateKey && t.type === 'offboarding');
  
  if (!onboardingTemplate || !offboardingTemplate) {
    alert('Template instructions not found');
    return;
  }
  
  // Create modal backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'lifecycleInstructionsModal';
  backdrop.onclick = e => { if(e.target===backdrop) backdrop.remove(); };
  
  backdrop.innerHTML = `
    <div class="modal" style="width:680px;max-height:80vh">
      <div class="modal-header">
        <div class="modal-title">Instructions: ${onboardingTemplate.label}</div>
        <button class="modal-close" onclick="document.getElementById('lifecycleInstructionsModal').remove()">✕</button>
      </div>
      <div style="display:flex;border-bottom:1px solid var(--border)">
        <button id="onboardingTab" onclick="switchInstructionTab('onboarding')" 
          style="flex:1;padding:10px 16px;background:var(--amber);border:none;font-size:13px;font-weight:600;color:var(--bg);cursor:pointer">
          📋 Onboarding
        </button>
        <button id="offboardingTab" onclick="switchInstructionTab('offboarding')" 
          style="flex:1;padding:10px 16px;background:var(--surface2);border:none;font-size:13px;color:var(--muted);cursor:pointer">
          🚪 Offboarding
        </button>
      </div>
      <div class="modal-body" style="padding:20px;max-height:400px;overflow-y:auto">
        <div id="onboardingInstructions" style="font-size:13px;line-height:1.5;color:var(--text)">
          ${onboardingTemplate.instructions || 'No instructions provided.'}
        </div>
        <div id="offboardingInstructions" style="display:none;font-size:13px;line-height:1.5;color:var(--text)">
          ${offboardingTemplate.instructions || 'No instructions provided.'}
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="document.getElementById('lifecycleInstructionsModal').remove()" 
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:13px;color:var(--text);cursor:pointer">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

// ── Switch instruction tab ─────────────────────────────────────────────

function switchInstructionTab(tab) {
  const onboardingTab = document.getElementById('onboardingTab');
  const offboardingTab = document.getElementById('offboardingTab');
  const onboardingInstructions = document.getElementById('onboardingInstructions');
  const offboardingInstructions = document.getElementById('offboardingInstructions');
  
  if (tab === 'onboarding') {
    onboardingTab.style.background = 'var(--amber)';
    onboardingTab.style.color = 'var(--bg)';
    offboardingTab.style.background = 'var(--surface2)';
    offboardingTab.style.color = 'var(--muted)';
    onboardingInstructions.style.display = 'block';
    offboardingInstructions.style.display = 'none';
  } else {
    offboardingTab.style.background = 'var(--amber)';
    offboardingTab.style.color = 'var(--bg)';
    onboardingTab.style.background = 'var(--surface2)';
    onboardingTab.style.color = 'var(--muted)';
    offboardingInstructions.style.display = 'block';
    onboardingInstructions.style.display = 'none';
  }
}

// ── Format date helper ─────────────────────────────────────────────

function formatLifecycleDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// ── Load onboarding/offboarding templates from DB (legacy fallback helper) ─
async function _loadOnboardingItems(track, type) {
  if (!sb) return [];
  
  try {
    const { data } = await sb.from('templates')
      .select('*')
      .eq('track', track)
      .eq('type', type)
      .eq('is_active', true)
      .order('sort_order');
    
    // Map database structure to expected format
    return (data || []).map(tmpl => ({
      key: tmpl.key,
      label: tmpl.label,
      instructions: tmpl.instructions || '',
      notes: tmpl.notes_enabled || false,
      notesLabel: tmpl.notes_enabled ? 'Notes' : undefined
    }));
  } catch (e) {
    console.error('Failed to load onboarding templates:', e);
    return [];
  }
}

// Offboarding = reverse of onboarding with revoke language
async function _buildOffboardingItems(track) {
  // Load onboarding templates from database
  const src = await _loadOnboardingItems(track, 'onboarding');
  
  const labels = {
    credentials:  { label: 'Credentials Revoked (AD + Email Disabled)', instructions: `In Active Directory Users and Computers, right-click the employee account and select Disable Account. In Google Workspace Admin disable the user account. Revoke any active sessions. This must be completed on or before the employee's last day.` },
    computer:     { label: 'Computer Removed from Domain & Retrieved', instructions: `Retrieve the assigned workstation from the employee. In Active Directory Users and Computers, delete or disable the computer object. Wipe the workstation before reassigning using a secure erase method.` },
    nuworkspace:  { label: 'NUWorkspace Account Deactivated', instructions: `In NUWorkspace Setup → Employees, set the employee's termination date and mark as inactive. In Supabase Authentication → Users, disable or delete the user account so they can no longer log in.` },
    office:       { label: 'Office 365 License Revoked', instructions: `In Microsoft 365 Admin Center, remove the employee's license assignment. Sign out all active sessions. Archive or transfer their email and OneDrive data per company policy before deleting.` },
    zac:          { label: 'ZAC / Phone Extension Removed', instructions: `Log into Zultys Administration panel. Remove the employee's user account and extension. Reassign the extension if needed. Confirm the employee can no longer access the phone system.` },
    alarm:        { label: 'Alarm Code Deleted', instructions: `Enter alarm panel admin mode. Delete the employee's alarm code. Confirm it no longer works. Consider whether combination codes for CUI areas need to be changed per the CMMC offboarding checklist.` },
    duo:          { label: 'Duo MFA Enrollment Removed', instructions: `Log into Duo Admin Panel. Find the employee under Users. Delete the user or remove all enrolled devices. Confirm they can no longer authenticate via Duo. This must be done on or before the last day.` },
    blumira:      { label: 'Blumira Agent Removed from Computer', instructions: `If the computer is being returned or reassigned, uninstall the Blumira agent. In the Blumira dashboard remove the device from the sensor list. If the workstation is being wiped this step is covered by the wipe process.` },
    withsecure:   { label: 'WithSecure EPP Uninstalled', instructions: `In WithSecure Elements Security Center, remove the device from the management console. Uninstall the endpoint protection agent from the workstation if it is being reassigned. If being wiped, the wipe process covers this.` },
    bitlocker:    { label: 'BitLocker Status Verified Before Wipe', instructions: `Before wiping or reassigning the workstation, confirm BitLocker is still active and that the recovery key is stored in Active Directory. Perform a secure wipe using BitLocker encryption + format, or use the manufacturer's secure erase tool for SSDs.` },
    vpn:          { label: 'VPN Access Removed', instructions: `Log into UniFi Network dashboard. Go to Settings → Teleport & VPN → VPN Server. Remove the employee's VPN user account. Confirm they can no longer establish a VPN connection. Revoke any VPN client config files that were issued.` },
    email:        { label: 'Email Account Disabled', instructions: `In Google Workspace Admin disable the employee's account. Set up an out-of-office reply if needed. Archive the mailbox per company policy. Remove from all distribution lists.` },
    sql:          { label: 'SQL Server Access Revoked', instructions: `Remove the employee's SQL Server login and database user accounts. Revoke any permissions granted. Confirm they can no longer connect to the database.` },
    dba:          { label: 'DBA Software Access Revoked', instructions: `Remove the employee's DBA manufacturing software user account and any related licenses. Uninstall the software from the returned workstation if being reassigned.` },
    synology:     { label: 'Synology Private Share Access Revoked', instructions: `In Synology DSM → Control Panel → Shared Folder → Ballantine share → Permissions, remove the employee's AD account. Confirm they can no longer access the share.` },
    handbook:     { label: 'Handbook Acknowledgment Filed', instructions: `Confirm the signed employee handbook acknowledgment is on file. Note the handbook version that was in effect at the time of the employee's hire. Retain per company records retention policy.` },
  };
  return src.map(item => ({
    key: item.key,
    label: labels[item.key]?.label || `${item.label} — Revoked`,
    notes: false,
    instructions: labels[item.key]?.instructions || `Reverse the ${item.label} step completed during onboarding.`,
  }));
}

// ── Load and render checklist ─────────────────────────────────────

async function _loadOnboardingTab(empId, emp, tabType) {
  const inner = document.getElementById('onboardingTabInner');
  if (!inner) return;
  inner.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">Loading…</div>';

  // Load or use cached record
  if (!onboardingCache[empId]) {
    const { data } = await sb.from('employee_onboarding')
      .select('*')
      .eq('employee_id', empId)
      .maybeSingle();
    onboardingCache[empId] = data || { employee_id: empId };
  }

  const rec = onboardingCache[empId];
  const isBallantine = (emp.dept||'').toLowerCase() === 'ballantine';
  const track = isBallantine ? 'ballantine' : 'nulabs';
  const items = tabType === 'onboarding'
    ? await _loadOnboardingItems(track, 'onboarding')
    : await _buildOffboardingItems(track);

  const prefix = tabType === 'onboarding' ? 'ob_' : 'off_';
  const canEdit = isManager();
  const isInactive = emp.isActive === false || !!emp.terminationDate;

  // Progress
  const done = items.filter(item => rec[prefix + item.key + '_done']).length;
  const pct  = items.length ? Math.round((done / items.length) * 100) : 0;
  const progressColor = pct === 100 ? 'var(--green)' : pct > 50 ? 'var(--amber)' : 'var(--blue)';

  // Offboarding warning banner for active employees
  const offboardingBanner = tabType === 'offboarding' && !isInactive
    ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(232,162,52,0.07);border:1px solid rgba(232,162,52,0.35);border-radius:8px;margin-bottom:18px;font-size:12.5px">
        <span style="font-size:16px">⚠️</span>
        <div style="color:var(--amber);font-weight:600">This employee is currently active. Complete this checklist on or before their last day.</div>
      </div>` : '';

  const itemsHtml = items.map(item => {
    const doneKey  = prefix + item.key + '_done';
    const dateKey  = prefix + item.key + '_date';
    const notesKey = prefix + item.key + '_notes';
    const isDone   = !!rec[doneKey];
    const dateVal  = rec[dateKey] || '';
    const notesVal = rec[notesKey] || '';

    return `
      <div id="obitem_${prefix}${item.key}" style="border:1.5px solid ${isDone?'rgba(46,158,98,0.3)':'var(--border)'};border-radius:10px;margin-bottom:8px;overflow:hidden;background:${isDone?'rgba(46,158,98,0.04)':'var(--surface)'}">
        <!-- Item header -->
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px">
          <input type="checkbox" ${isDone?'checked':''} ${canEdit?'':'disabled'}
            onchange="_obToggle('${empId}','${prefix}','${item.key}',this.checked)"
            style="width:17px;height:17px;cursor:${canEdit?'pointer':'default'};flex-shrink:0;accent-color:var(--green)"/>
          <div style="flex:1;font-size:13px;font-weight:600;color:${isDone?'var(--muted)':'var(--text)'};${isDone?'text-decoration:line-through':''}">
            ${item.label}
          </div>
          ${canEdit ? `<input type="date" value="${dateVal}" style="color-scheme:light;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11.5px;color:var(--text);font-family:'DM Sans',sans-serif;cursor:pointer"
            onchange="_obDateChange('${empId}','${prefix}','${item.key}',this.value)"/>` :
            (dateVal ? `<span style="font-size:11.5px;color:var(--muted);font-family:'JetBrains Mono',monospace">${dateVal}</span>` : '')}
          <button onclick="_obToggleInstructions('${prefix}${item.key}')"
            style="padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;font-size:11px;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;flex-shrink:0"
            onmouseover="this.style.borderColor='var(--amber-dim)';this.style.color='var(--amber)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
            💡 How-to
          </button>
        </div>
        <!-- Instructions (collapsed) -->
        <div id="obinstr_${prefix}${item.key}" style="display:none;padding:0 16px 12px 44px">
          <div style="background:rgba(192,122,26,0.05);border:1px solid rgba(192,122,26,0.2);border-radius:7px;padding:10px 14px;font-size:12px;color:var(--text);line-height:1.65">
            ${item.instructions}
          </div>
        </div>
        <!-- Notes field -->
        ${item.notes && canEdit ? `
        <div style="padding:0 16px 12px 44px">
          <input type="text" placeholder="${item.notesLabel||'Notes…'}" value="${(notesVal||'').replace(/"/g,'&quot;')}"
            onchange="_obNotesChange('${empId}','${prefix}','${item.key}',this.value)"
            style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none"
            onfocus="this.style.borderColor='var(--amber-dim)'" onblur="this.style.borderColor='var(--border)'"/>
        </div>` : (item.notes && notesVal ? `<div style="padding:0 16px 12px 44px;font-size:12px;color:var(--muted);font-style:italic">${notesVal}</div>` : '')}
      </div>`;
  }).join('');

  inner.innerHTML = `
    <!-- Progress -->
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${tabType === 'onboarding' ? '✅ Onboarding Progress' : '🚪 Offboarding Progress'}</div>
        <div style="font-size:13px;font-weight:700;color:${progressColor};font-family:'JetBrains Mono',monospace">${done} / ${items.length}</div>
      </div>
      <div style="background:var(--surface2);border-radius:6px;height:8px;overflow:hidden">
        <div style="height:100%;border-radius:6px;width:${pct}%;background:${progressColor};transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">${pct}% complete${pct===100?' — ✓ All steps done':''}</div>
    </div>

    ${offboardingBanner}

    ${!canEdit ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;margin-bottom:14px;font-size:12px;color:var(--muted)">
      👁 Read-only view — only Owners and Managers can update the checklist.
    </div>` : ''}

    ${itemsHtml}

    ${canEdit ? `<div style="margin-top:16px;display:flex;justify-content:flex-end">
      <button onclick="_obSave('${empId}')"
        style="padding:8px 20px;background:var(--amber);color:#000;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">
        💾 Save Checklist
      </button>
    </div>` : ''}
  `;
}

function _obToggleInstructions(key) {
  const el = document.getElementById(`obinstr_${key}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function _obToggle(empId, prefix, key, checked) {
  if (!onboardingCache[empId]) onboardingCache[empId] = { employee_id: empId };
  onboardingCache[empId][prefix + key + '_done'] = checked;
  // Auto-set today's date if checking and no date set
  const dateKey = prefix + key + '_date';
  if (checked && !onboardingCache[empId][dateKey]) {
    const today = new Date().toISOString().split('T')[0];
    onboardingCache[empId][dateKey] = today;
    // Update the date input if visible
    const inputs = document.querySelectorAll(`#obitem_${prefix}${key} input[type="date"]`);
    inputs.forEach(i => i.value = today);
  }
  // Update item appearance
  const item = document.getElementById(`obitem_${prefix}${key}`);
  if (item) {
    item.style.borderColor = checked ? 'rgba(46,158,98,0.3)' : 'var(--border)';
    item.style.background  = checked ? 'rgba(46,158,98,0.04)' : 'var(--surface)';
    const label = item.querySelector('div[style*="font-weight:600"]');
    if (label) {
      label.style.color = checked ? 'var(--muted)' : 'var(--text)';
      label.style.textDecoration = checked ? 'line-through' : '';
    }
  }
}

function _obDateChange(empId, prefix, key, value) {
  if (!onboardingCache[empId]) onboardingCache[empId] = { employee_id: empId };
  onboardingCache[empId][prefix + key + '_date'] = value || null;
}

function _obNotesChange(empId, prefix, key, value) {
  if (!onboardingCache[empId]) onboardingCache[empId] = { employee_id: empId };
  onboardingCache[empId][prefix + key + '_notes'] = value || null;
}

async function _obSave(empId) {
  const rec = onboardingCache[empId];
  if (!rec) return;

  const now = new Date().toISOString();
  const payload = { 
    ...rec, 
    employee_id: empId, 
    updated_at: now,
    created_at: rec.created_at || now  // Preserve original created_at if it exists
  };

  const { data, error } = await sb.from('employee_onboarding')
    .upsert(payload, { 
      onConflict: 'employee_id',
      ignoreDuplicates: false 
    })
    .select()
    .single();

  if (error) { 
    alert('Save failed: ' + error.message); 
    return; 
  }
  
  // Update cache with the saved record (including id if it was a new insert)
  onboardingCache[empId] = data;
  toast('✅ Checklist saved.');

  // Refresh progress bar
  const emp = employees.find(e => e.id === empId);
  if (emp) _loadOnboardingTab(empId, emp, empProfileTab);
}

window.deleteEmployee = function deleteEmployee(id) {
  if (!confirm('Remove this employee?')) return;
  employees = employees.filter(e => e.id !== id);
  renderEmployeesPanel('');
  renderSidebarTeam();
  toast('Employee removed');
}


// ===== EMPLOYEE MODAL =====
// ===== EMPLOYEE MODAL =====
function openEmployeeModal(id) {
  editingEmpId = null; // always reset first
  editingEmpId = (id && id !== 'undefined' && id !== 'null') ? id : null;
  const emp = id ? employees.find(e => e.id === id) : null;
  if (emp) {
    empColor = emp.color;
  } else {
    // Pick the color least used by existing employees
    const usedColors = employees.map(e => e.color);
    const colorCounts = {};
    COLORS.forEach(c => colorCounts[c] = 0);
    usedColors.forEach(c => { if (colorCounts[c] !== undefined) colorCounts[c]++; });
    empColor = COLORS.reduce((a, b) => colorCounts[a] <= colorCounts[b] ? a : b);
  }

  document.getElementById('empModalTitle').textContent = emp ? 'Edit Employee' : 'Add Employee';
  document.getElementById('empSaveBtn').textContent = emp ? 'Save Changes' : 'Add Employee';
  document.getElementById('empName').value  = emp ? emp.name  : '';
  document.getElementById('empRole').value  = emp ? emp.role  : '';
  document.getElementById('empDept').value  = emp ? emp.dept  : '';
  document.getElementById('empEmail').value = emp ? emp.email : '';
  if (document.getElementById('empPersonalEmail')) document.getElementById('empPersonalEmail').value = emp ? (emp.personalEmail || '') : '';
  document.getElementById('empPhone').value    = emp ? emp.phone    : '';
  document.getElementById('empHireDate').value = emp ? emp.hireDate : '';
  if (document.getElementById('empTermDate')) document.getElementById('empTermDate').value = emp ? (emp.terminationDate || '') : '';
  if (document.getElementById('empType')) document.getElementById('empType').value = emp ? (emp.empType || 'fulltime') : 'fulltime';
  if (document.getElementById('empActive')) document.getElementById('empActive').value = emp ? (emp.isActive !== false ? 'true' : 'false') : 'true';
  if (document.getElementById('empSickBank')) document.getElementById('empSickBank').value = emp ? (emp.sickBank || 0) : 0;
  if (document.getElementById('empVacBank'))  document.getElementById('empVacBank').value  = emp ? (emp.vacBank  || 0) : 0;

  buildEmpColorSwatches();
  updateEmpPreview();
  // Populate approver dropdown
  const approverSel = document.getElementById('empApprover');
  approverSel.innerHTML = '<option value="">— None —</option>' +
    employees.filter(e => e.isActive !== false).map(e =>
      '<option value="'+e.id+'" '+(emp && emp.approverId===e.id ? 'selected' : '')+'>'+e.name+'</option>'
    ).join('');
  const _isAppr = document.getElementById('empIsApprover'); if(_isAppr) _isAppr.checked = emp ? !!emp.isApprover : false;
  const _isPaper = document.getElementById('empIsPaperTs'); if(_isPaper) _isPaper.checked = emp ? !!emp.isPaperTs : false;
  // Populate role dropdown from permissionRoles
  const _perm = document.getElementById('empPermLevel');
  if (_perm) {
    _perm.innerHTML = '<option value="">— No role assigned —</option>' +
      permissionRoles.map(r => `<option value="${r.id}" ${emp && emp.roleId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
    if (!emp && _perm.options.length > 1) _perm.selectedIndex = 1; // default to first role for new employees
  }
  document.getElementById('employeeModal').classList.add('open');
  setTimeout(() => document.getElementById('empName').focus(), 80);
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').classList.remove('open');
  editingEmpId = null;
}

function buildEmpColorSwatches() {
  document.getElementById('empColorSwatches').innerHTML = COLORS.map(c => `
    <div class="swatch ${c === empColor ? 'sel' : ''}" style="background:${c}"
      onclick="empColor='${c}';buildEmpColorSwatches();updateEmpPreview()"></div>
  `).join('');
}

function updateEmpPreview() {
  const name = document.getElementById('empName').value.trim();
  const parts = name.split(' ').filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : (name.slice(0,2).toUpperCase() || '?');
  const el = document.getElementById('empAvPreview');
  el.textContent = initials;
  el.style.background = empColor;
}

function getInitials(name) {
  const parts = name.trim().split(' ').filter(Boolean);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : name.slice(0,2).toUpperCase();
}

async function saveEmployee() {
  const _editingId = editingEmpId; // declare FIRST — used below in sick/vac bank fallbacks
  // Capture ALL field values synchronously before any async work
  const _name      = document.getElementById('empName').value.trim();
  const _role      = document.getElementById('empRole').value.trim();
  const _dept      = document.getElementById('empDept').value.trim();
  const _email         = document.getElementById('empEmail').value.trim();
  const _personalEmail = document.getElementById('empPersonalEmail') ? document.getElementById('empPersonalEmail').value.trim() : '';
  const _phone     = document.getElementById('empPhone').value.trim();
  const _hireDate  = document.getElementById('empHireDate').value || '';
  // Preserve existing sick_bank from DB if the UI field doesn't exist — never overwrite with 0
  const _sickBankEl = document.getElementById('empSickBank');
  const _sickBank = _sickBankEl ? (parseFloat(_sickBankEl.value) || 0) : ((_editingId ? (employees.find(e=>e.id===_editingId)?.sickBank || 0) : 0));
  // Preserve existing vac_bank from DB if the UI field doesn't exist — never overwrite with 0
  const _vacBankEl = document.getElementById('empVacBank');
  const _vacBank = _vacBankEl ? (parseFloat(_vacBankEl.value) || 0) : ((_editingId ? (employees.find(e=>e.id===_editingId)?.vacBank || 0) : 0));
  const _roleId = document.getElementById('empPermLevel').value || null;
  const _empType   = document.getElementById('empType') ? document.getElementById('empType').value : 'fulltime';
  const _termDate  = document.getElementById('empTermDate') ? document.getElementById('empTermDate').value : '';
  const _isActive  = _termDate ? false : (document.getElementById('empActive') ? document.getElementById('empActive').value !== 'false' : true);
  const _color     = empColor;

  if (!_name) {
    const inp = document.getElementById('empName');
    inp.style.borderColor = 'var(--red)'; inp.style.boxShadow = '0 0 0 3px rgba(224,92,92,0.18)';
    inp.focus(); setTimeout(() => { inp.style.borderColor=''; inp.style.boxShadow=''; }, 1800);
    return;
  }

  const data = {
    name: _name, initials: getInitials(_name),
    role: _role, dept: _dept, email: _email, phone: _phone, personalEmail: _personalEmail,
    hireDate: _hireDate, sickBank: _sickBank, vacBank: _vacBank, color: _color,
  };

  const dbPayload = {
    name: data.name, initials: data.initials,
    role: data.role, department: data.dept,
    email: data.email, phone: data.phone, personal_email: _personalEmail||null,
    color: data.color,
    hire_date: data.hireDate || null,
    // sick_bank and vac_bank are managed directly in Supabase — never overwrite from the app
    role_id: _roleId || null,
    employment_type: _empType,
    is_active: _isActive,
    termination_date: _termDate || null,
    approver_id: document.getElementById('empApprover') ? (document.getElementById('empApprover').value || null) : null,
    is_approver: document.getElementById('empIsApprover') ? document.getElementById('empIsApprover').checked : false,
    is_paper_ts: document.getElementById('empIsPaperTs') ? document.getElementById('empIsPaperTs').checked : false,
  };

  if (_editingId) {
    editingEmpId = _editingId;
    const idx = employees.findIndex(e => e.id === _editingId);
    if (idx > -1) employees[idx] = {...employees[idx], ...data, empType: _empType, roleId: _roleId, terminationDate: _termDate, isActive: _isActive, isPaperTs: document.getElementById('empIsPaperTs')?.checked||false, isApprover: document.getElementById('empIsApprover')?.checked||false, approverId: document.getElementById('empApprover')?.value||null};
    if (sb) {
      const { error } = await sb.from('employees').update(dbPayload).eq('id', _editingId);
      if (error) { console.error('saveEmployee update error:', error); toast('⚠ Save error: ' + error.message); return; }
      const { data: fresh } = await sb.from('employees').select('*').eq('id', _editingId).single();
      if (fresh) {
        const idx2 = employees.findIndex(e => e.id === _editingId);
        if (idx2 > -1) employees[idx2] = { ...employees[idx2],
          name: fresh.name, initials: fresh.initials,
          role: fresh.role, dept: fresh.department||'',
          email: fresh.email||'', phone: fresh.phone||'',
          color: fresh.color, hireDate: fresh.hire_date||'',
          sickBank: parseFloat(fresh.sick_bank)||0,
                  vacBank: parseFloat(fresh.vac_bank)||0,
          permissionLevel: fresh.permission_level||'employee',
          roleId: fresh.role_id||null,
          empType: fresh.employment_type||'fulltime',
          isOwner: !!fresh.is_owner,
          isPaperTs: !!fresh.is_paper_ts,
          isApprover: !!fresh.is_approver,
          approverId: fresh.approver_id||null,
          terminationDate: fresh.termination_date||'',
          personalEmail: fresh.personal_email||'',
        };
      }
    }
    toast('Employee updated');
  } else {
    if (sb) {
      const { data: d, error } = await sb.from('employees').insert(dbPayload).select().single();
      if (error) { console.error('saveEmployee insert error:', error); toast('⚠ Save error: ' + error.message); return; }
      if (d) {
        employees.push({
          id: d.id, name: d.name, initials: d.initials,
          role: d.role, dept: d.department||'',
          email: d.email||'', phone: d.phone||'',
          color: d.color, hireDate: d.hire_date||'',
          sickBank: parseFloat(d.sick_bank)||0,
          vacBank: parseFloat(d.vac_bank)||0,
          permissionLevel: d.permission_level||'employee',
          roleId: d.role_id||null,
          empType: d.employment_type||'fulltime',
          isOwner: !!d.is_owner,
          approverId: d.approver_id||null,
          isApprover: !!d.is_approver,
          isPaperTs: !!d.is_paper_ts,
        });
      }
    } else {
      employees.push({id: 'emp'+Date.now(), ...data, roleId: _roleId});
    }
    toast(data.name + ' added');
  }
  closeEmployeeModal();
  renderEmployeesPanel('');
  renderSidebarTeam();
}


// ===== PM DROPDOWN =====
// ===== PM DROPDOWN =====
let pmDropdownProjId = null;

function openPmDropdown(projId) {
  pmDropdownProjId = projId;
  const info = projectInfo[projId];
  const drop = document.getElementById('pmDropdown');
  const search = document.getElementById('pmSearch');
  search.value = '';
  renderPmOptions('');
  drop.classList.add('open');
  document.getElementById('pmSelected').classList.add('open');
  setTimeout(() => search.focus(), 50);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closePmDropdownOutside, {once: true});
  }, 10);
}

function closePmDropdownOutside(e) {
  const wrap = document.getElementById('pmDropdownWrap');
  if (wrap && !wrap.contains(e.target)) closePmDropdown();
  else document.addEventListener('click', closePmDropdownOutside, {once: true});
}

function closePmDropdown() {
  const drop = document.getElementById('pmDropdown');
  const sel  = document.getElementById('pmSelected');
  if (drop) drop.classList.remove('open');
  if (sel)  sel.classList.remove('open');
}

function renderPmOptions(query) {
  const q = query.toLowerCase();
  const info = projectInfo[pmDropdownProjId];
  const currentPm = info ? info.pm : '';
  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)
  );
  document.getElementById('pmList').innerHTML = filtered.length === 0
    ? `<div style="padding:12px 14px;font-size:12.5px;color:var(--muted)">No employees found</div>`
    : filtered.map(e => `
        <div class="pm-opt ${e.name === currentPm ? 'selected' : ''}" onclick="selectPm('${e.id}')">
          <div class="pm-opt-av" style="background:${e.color}">${e.initials}</div>
          <div class="pm-opt-name">${e.name}</div>
          <div class="pm-opt-role">${e.role}</div>
          ${e.name === currentPm ? '<div class="pm-opt-check">&#x2713;</div>' : ''}
        </div>`).join('');
}

window.selectPm = function selectPm(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp || !pmDropdownProjId) return;
  if (!projectInfo[pmDropdownProjId]) projectInfo[pmDropdownProjId] = defaultInfo(projects.find(p=>p.id===pmDropdownProjId)||{});
  projectInfo[pmDropdownProjId].pm = emp.name;
  closePmDropdown();
  // Update the displayed value without full re-render
  const nameEl = document.getElementById('pmSelectedName');
  const avEl   = document.getElementById('pmSelectedAv');
  if (nameEl) nameEl.textContent = emp.name;
  if (avEl)   { avEl.textContent = emp.initials; avEl.style.background = emp.color; }
  toast('Project Manager set to ' + emp.name);
}

function clearPm() {
  if (!pmDropdownProjId) return;
  if (projectInfo[pmDropdownProjId]) projectInfo[pmDropdownProjId].pm = '';
  closePmDropdown();
  renderInfoSheet(pmDropdownProjId);
}



// ===== SIDEBAR TEAM AVATARS =====
// ===== SIDEBAR TEAM AVATARS =====
function renderSidebarTeam() {
  // Only show team when logged in
  const teamDiv = document.getElementById('sidebarTeam');
  if (!currentUser) { if (teamDiv) teamDiv.innerHTML = ''; return; }
  const container = document.getElementById('sidebarTeam');
  const label = document.getElementById('teamLabel');
  if (!container) return;
  const activeEmps = employees.filter(e => e.isActive !== false);
  if (label) label.textContent = 'Team · ' + activeEmps.length + ' member' + (activeEmps.length !== 1 ? 's' : '');
  if (activeEmps.length === 0) {
    container.innerHTML = '<div style="padding:6px 8px;font-size:11.5px;color:var(--muted)">No employees yet</div>';
    return;
  }
  container.innerHTML = activeEmps.map(e =>
    `<div class="avatar" style="background:${e.color};color:#fff" title="${e.name}" onclick="openEmployeesPanel(null)">${e.initials}</div>`
  ).join('');
}


function pickField(label, val, key, projId, options) {
  const cur = options.find(o => o.value === val);
  const color = cur ? (cur.color || 'var(--text)') : 'var(--muted)';
  const opts = options.map(o =>
    '<option value="' + o.value + '" ' + (val === o.value ? 'selected' : '') + ' style="color:' + o.color + '">' + o.label + '</option>'
  ).join('');
  const sel = '<select class="yn-select" onchange="setYnField(\'' + projId + '\',\'' + key + '\',this.value)" style="color:' + color + '">' +
    '<option value="">—</option>' + opts + '</select>';
  return '<div class="info-field" data-key="' + key + '"><div class="info-field-label">' + label + '</div><div class="info-field-value">' + sel + '</div></div>';
}

function ynField(label, val, key, projId) {
  return pickField(label, val, key, projId, [
    {value:'Yes', label:'Yes', color:'var(--green)'},
    {value:'No',  label:'No',  color:'var(--red)'}
  ]);
}

function setYnField(projId, key, val) {
  if (!projectInfo[projId]) return;
  projectInfo[projId][key] = val;
  if (sb) {
    const colMap = {dcas:'dcas', customerWitness:'customer_witness', tpApproval:'tp_approval', dpas:'dpas', noforn:'noforn'};
    const col = colMap[key];
    if (col) sb.from('project_info').upsert({project_id: projId, [col]: val||null},{onConflict:'project_id'}).then(({error})=>{ if(error) console.error('yn upsert',error); });
  }
  const sel = event.target;
  const colorMap = {Yes:'var(--green)', No:'var(--red)', CNF:'var(--blue)', Partial:'var(--amber)', 'Not Required':'var(--muted)', DO:'var(--purple)', DX:'var(--amber)'};
  sel.style.color = colorMap[val] || 'var(--muted)';
}

// ===== SUPABASE PATCHES =====
// Patch deleteEmployee
const _origDeleteEmployee = typeof deleteEmployee !== "undefined" ? deleteEmployee : ()=>{};
window.deleteEmployee = async function(id) {
  if (!confirm('Remove this employee?')) return;
  await dbDelete('employees', id);
  employees = employees.filter(e => e.id !== id);
  renderEmployeesPanel('');
  renderSidebarTeam();
  toast('Employee removed');
};

// Patch selectPm
const _origSelectPm = typeof selectPm !== "undefined" ? selectPm : ()=>{};
window.selectPm = async function(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp || !pmDropdownProjId) return;
  if (!projectInfo[pmDropdownProjId]) projectInfo[pmDropdownProjId] = defaultInfo(projects.find(p=>p.id===pmDropdownProjId)||{});
  projectInfo[pmDropdownProjId].pm = emp.name;
  if (sb) await sb.from('project_info').upsert({project_id: pmDropdownProjId, pm: emp.name},{onConflict:'project_id'});
  closePmDropdown();
  const nameEl = document.getElementById('pmSelectedName');
  const avEl   = document.getElementById('pmSelectedAv');
  if (nameEl) nameEl.textContent = emp.name;
  if (avEl)   { avEl.textContent = emp.initials; avEl.style.background = emp.color; }
  toast('Project Manager set to ' + emp.name);
};


// ===== VACATION REQUESTS =====
// ===== VACATION REQUESTS =====
let vacationRequestCache = {}; // empId -> array of requests

async function loadAndRenderVacRequests(empId) {
  const el = document.getElementById('vacReqList-' + empId);
  if (!el) return;
  if (!sb) { el.innerHTML = '<div style="color:var(--muted);font-size:12px">Not connected.</div>'; return; }
  try {
    const { data } = await sb.from('vacation_requests')
      .select('*')
      .eq('employee_id', empId)
      .order('created_at', { ascending: false });
    vacationRequestCache[empId] = data || [];
  } catch(e) {
    vacationRequestCache[empId] = [];
  }
  renderVacReqList(empId);
}

function renderVacReqList(empId) {
  const el = document.getElementById('vacReqList-' + empId);
  if (!el) return;
  const requests = vacationRequestCache[empId] || [];
  const statusColor = { pending: '#e8a234', approved: '#4caf7d', rejected: '#d04040' };
  const statusLabel = { pending: '⏳ Pending', approved: '✓ Approved', rejected: '✗ Rejected' };
  const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const canManage = isManager() || isApprover;

  // Preserve any open forms (new request or reject inline)
  const newForm = document.getElementById('vacNewReqForm-' + empId);
  const newFormHtml = newForm ? newForm.outerHTML : '';

  if (requests.length === 0) {
    el.innerHTML = newFormHtml + '<div style="color:var(--muted);font-size:12px;padding:4px 0">No vacation requests yet.</div>';
    return;
  }

  const rows = requests.map(r => {
    const sc = statusColor[r.status] || '#888';
    const sl = statusLabel[r.status] || r.status;
    const days = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
    return `
    <div data-req-id="${r.id}" style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg)">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${fmtD(r.start_date)} → ${fmtD(r.end_date)}</div>
          <span style="font-size:10px;color:var(--muted)">${days} day${days !== 1 ? 's' : ''}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${sc}22;color:${sc};border:1px solid ${sc}44">${sl}</span>
        </div>
        ${r.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${r.notes}</div>` : ''}
        ${r.approver_note ? `<div style="font-size:11px;color:var(--muted);margin-top:3px;font-style:italic">💬 ${r.approver_note}</div>` : ''}
        <div style="font-size:10px;color:var(--muted);margin-top:4px">Submitted ${new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
      </div>
      ${canManage && r.status === 'pending' ? `
        <div style="display:flex;gap:6px;flex-shrink:0;margin-top:2px">
          <button onclick="approveVacationRequest('${r.id}','${empId}')"
            style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:#4caf7d;cursor:pointer">✓ Approve</button>
          <button onclick="openRejectVacForm('${r.id}','${empId}')"
            style="background:rgba(208,64,64,0.1);border:1px solid rgba(208,64,64,0.3);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--red);cursor:pointer">✗ Reject</button>
          <button onclick="deleteVacationRequest('${r.id}','${empId}')"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer">🗑</button>
        </div>
      ` : ''}
      ${canManage && r.status !== 'pending' ? `
        <button onclick="deleteVacationRequest('${r.id}','${empId}')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer;flex-shrink:0">🗑</button>
      ` : ''}
      ${!canManage && r.status === 'pending' && r.employee_id === (typeof currentEmployee !== 'undefined' ? currentEmployee?.id : null) ? `
        <button onclick="cancelVacationRequest('${r.id}','${empId}')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--muted);cursor:pointer;flex-shrink:0">✕ Cancel</button>
      ` : ''}
      ${!canManage && r.status === 'approved' && r.employee_id === (typeof currentEmployee !== 'undefined' ? currentEmployee?.id : null) ? `
        <button onclick="cancelVacationRequest('${r.id}','${empId}')"
          style="background:rgba(208,64,64,0.08);border:1px solid rgba(208,64,64,0.25);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--red);cursor:pointer;flex-shrink:0">✕ Cancel Vacation</button>
      ` : ''}
    </div>`;
  }).join('');

  el.innerHTML = newFormHtml + rows;
}

function openVacationRequestForm(empId) {
  if (document.getElementById('vacNewReqForm-' + empId)) return;
  const el = document.getElementById('vacReqList-' + empId);
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10);
  const formHtml = `
  <div id="vacNewReqForm-${empId}" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:10px">New Vacation Request</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:4px">Start Date</div>
        <input type="date" id="vacStart-${empId}" value="${today}"
          style="background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;color-scheme:light">
      </div>
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:4px">End Date</div>
        <input type="date" id="vacEnd-${empId}" value="${today}"
          style="background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;color-scheme:light">
      </div>
      <div style="flex:1;min-width:180px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:4px">Notes (optional)</div>
        <input type="text" id="vacNotes-${empId}" placeholder="Any details or context…"
          style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button onclick="submitVacationRequest('${empId}')"
        style="background:var(--amber-glow);border:1px solid var(--amber-dim);border-radius:6px;padding:5px 14px;font-size:12px;font-weight:600;color:var(--amber);cursor:pointer">Submit Request</button>
      <button onclick="cancelVacationForm('${empId}')"
        style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:12px;color:var(--muted);cursor:pointer">Cancel</button>
    </div>
  </div>`;
  el.insertAdjacentHTML('afterbegin', formHtml);
}

function cancelVacationForm(empId) {
  document.getElementById('vacNewReqForm-' + empId)?.remove();
}

async function cancelVacationRequest(reqId, empId) {
  if (!confirm('Cancel this vacation request?')) return;
  if (!sb) return;
  try {
    await sb.from('vacation_requests').delete().eq('id', reqId);
    // Also remove scheduler block if it exists
    await sb.from('schedule_blocks').delete().eq('id', 'vac_' + reqId);
    if (typeof window.schedAddBlock === 'function') {
      // Remove from in-memory schedBlocks
      const idx = (window._schedBlocks||[]).findIndex(b => b.id === 'vac_' + reqId);
      if (idx > -1) window._schedBlocks.splice(idx, 1);
    }
  } catch(e) { toast('⚠ Could not cancel request'); return; }
  vacationRequestCache[empId] = (vacationRequestCache[empId] || []).filter(r => r.id !== reqId);
  renderVacReqList(empId);
  toast('Vacation request cancelled');
}

async function deleteVacationRequest(reqId, empId) {
  if (!confirm('Delete this vacation request? This will also remove the scheduler block if one was created.')) return;
  if (!sb) return;
  try {
    await sb.from('vacation_requests').delete().eq('id', reqId);
    await sb.from('schedule_blocks').delete().eq('id', 'vac_' + reqId);
  } catch(e) { toast('⚠ Could not delete request'); return; }
  vacationRequestCache[empId] = (vacationRequestCache[empId] || []).filter(r => r.id !== reqId);
  renderVacReqList(empId);
  toast('Request deleted');
}

async function submitVacationRequest(empId) {
  const startDate = document.getElementById('vacStart-' + empId)?.value;
  const endDate   = document.getElementById('vacEnd-'   + empId)?.value;
  const notes     = document.getElementById('vacNotes-' + empId)?.value.trim() || null;

  if (!startDate || !endDate) { toast('⚠ Please enter start and end dates'); return; }
  if (startDate > endDate)    { toast('⚠ End date must be on or after start date'); return; }

  const emp      = employees.find(e => e.id === empId);
  if (!emp) return;

  const row = {
    employee_id:   empId,
    employee_name: emp.name,
    start_date:    startDate,
    end_date:      endDate,
    notes:         notes,
    status:        'pending',
    approver_id:   emp.approverId || null,
  };

  let saved;
  try {
    const { data, error } = await sb.from('vacation_requests').insert(row).select().single();
    if (error) { toast('⚠ ' + error.message); return; }
    saved = data;
  } catch(e) { toast('⚠ Error saving request'); return; }

  if (!vacationRequestCache[empId]) vacationRequestCache[empId] = [];
  vacationRequestCache[empId].unshift(saved);

  // Notify: approver + all managers/approvers
  // Use same logic as auth.js isApprover check to catch all cases
  const isEmpManager = (e) =>
    e.isApprover === true || e.isApprover === 1 ||
    ['manager','Manager','owner','Owner','admin','Admin'].includes(e.permissionLevel) ||
    e.role === 'approver' || e.role === 'manager';

  const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const preview = `${emp.name} requested vacation: ${fmtD(startDate)} → ${fmtD(endDate)}||empId:${empId}`;
  const notifyIds = [...new Set(
    employees
      .filter(e => e.isActive !== false && (e.id === emp.approverId || isEmpManager(e)))
      .map(e => e.id)
  )].filter(id => id !== empId); // don't notify the requester

  if (sb && notifyIds.length > 0) {
    try {
      const { error: notifErr } = await sb.from('chatter_notifs').insert(
        notifyIds.map(nid => ({
          employee_id:    nid,
          proj_id:        null,
          msg_id:         null,
          from_name:      emp.name,
          from_initials:  emp.initials,
          from_color:     emp.color,
          preview:        preview,
          is_read:        false,
          created_at:     new Date().toISOString(),
        }))
      );
      if (notifErr) {
        toast('⚠ Notification error: ' + notifErr.message);
        console.error('Vacation notif insert error:', notifErr);
      }
    } catch(e) {
      toast('⚠ Notification failed: ' + e.message);
      console.error('Vacation notification exception:', e);
    }
  } else if (notifyIds.length === 0) {
    console.warn('Vacation request: no managers/approvers found to notify. Employees:', employees.map(e => ({name:e.name, isApprover:e.isApprover, permLevel:e.permissionLevel})));
  }

  cancelVacationForm(empId);
  renderVacReqList(empId);
  toast('✅ Vacation request submitted');
}

async function approveVacationRequest(reqId, empId) {
  if (!sb) return;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  try {
    await sb.from('vacation_requests')
      .update({ status: 'approved', approver_id: currentEmployee?.id || null, updated_at: new Date().toISOString() })
      .eq('id', reqId);
  } catch(e) { toast('⚠ Error approving request'); return; }

  const req = (vacationRequestCache[empId] || []).find(r => r.id === reqId);
  if (req) req.status = 'approved';

  // Create scheduler block
  if (req && typeof window.schedSaveBlock === 'function') {
    const block = {
      id:           'vac_' + reqId,
      rowId:        'emp_' + empId,
      cat:          '__emp__',
      empId:        empId,
      empEventType: 'vacation',
      label:        emp.name + ' — Vacation',
      start:        req.start_date,
      end:          req.end_date,
      projId:       null,
      taskId:       null,
      flag:         null,
      startTime:    null,
      endTime:      null,
    };
    await window.schedSaveBlock(block);
    if (typeof window.schedAddBlock === 'function') window.schedAddBlock(block);
  }

  // Notify employee
  if (req) {
    const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      await sb.from('chatter_notifs').insert({
        employee_id:   empId,
        proj_id:       null,
        msg_id:        null,
        from_name:     currentEmployee?.name || 'Manager',
        from_initials: currentEmployee?.initials || 'M',
        from_color:    currentEmployee?.color || '#888',
        preview:       `✓ Your vacation (${fmtD(req.start_date)} → ${fmtD(req.end_date)}) has been approved`,
        is_read:       false,
        created_at:    new Date().toISOString(),
      });
    } catch(e) {}
  }

  renderVacReqList(empId);
  toast('✅ Vacation approved — scheduler block created');
}

function openRejectVacForm(reqId, empId) {
  if (document.getElementById('rejectVacInline-' + reqId)) return;
  const el = document.getElementById('vacReqList-' + empId);
  if (!el) return;
  const formHtml = `
  <div id="rejectVacInline-${reqId}" style="background:rgba(208,64,64,0.06);border:1px solid rgba(208,64,64,0.25);border-radius:8px;padding:12px;margin-bottom:8px">
    <div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:8px">Reject / Suggest Alternative</div>
    <input type="text" id="rejectVacNote-${reqId}" placeholder="Optional: suggest alternative dates or reason…"
      style="width:100%;background:var(--surface);border:1.5px solid rgba(208,64,64,0.3);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;margin-bottom:8px">
    <div style="display:flex;gap:8px">
      <button onclick="confirmRejectVacation('${reqId}','${empId}')"
        style="background:rgba(208,64,64,0.15);border:1px solid rgba(208,64,64,0.4);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600;color:var(--red);cursor:pointer">Confirm Reject</button>
      <button onclick="document.getElementById('rejectVacInline-${reqId}')?.remove()"
        style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;color:var(--muted);cursor:pointer">Cancel</button>
    </div>
  </div>`;
  el.insertAdjacentHTML('afterbegin', formHtml);
}

async function confirmRejectVacation(reqId, empId) {
  if (!sb) return;
  const note = document.getElementById('rejectVacNote-' + reqId)?.value.trim() || null;

  try {
    await sb.from('vacation_requests')
      .update({ status: 'rejected', approver_note: note, updated_at: new Date().toISOString() })
      .eq('id', reqId);
  } catch(e) { toast('⚠ Error rejecting request'); return; }

  const req = (vacationRequestCache[empId] || []).find(r => r.id === reqId);
  if (req) { req.status = 'rejected'; req.approver_note = note; }

  // Notify employee
  if (req) {
    const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    try {
      await sb.from('chatter_notifs').insert({
        employee_id:   empId,
        proj_id:       null,
        msg_id:        null,
        from_name:     currentEmployee?.name || 'Manager',
        from_initials: currentEmployee?.initials || 'M',
        from_color:    currentEmployee?.color || '#888',
        preview:       `✗ Your vacation request (${fmtD(req.start_date)} → ${fmtD(req.end_date)}) was not approved${note ? ': ' + note : ''}`,
        is_read:       false,
        created_at:    new Date().toISOString(),
      });
    } catch(e) {}
  }

  document.getElementById('rejectVacInline-' + reqId)?.remove();
  renderVacReqList(reqId);
  // Re-query fresh since renderVacReqList with reqId won't work — use empId
  renderVacReqList(empId);
  toast('Request rejected');
}


// ===== MY INFO TAB RENDERERS =====
// ===== MY INFO TAB RENDERERS =====

async function renderMyInfoVacationTab(empId) {
  const pane = document.getElementById('myInfoPane-vacation');
  if (!pane) return;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;

  const canApprove = isManager() || isApprover;
  pane.innerHTML = '<div style="color:var(--muted);font-size:13px">Loading…</div>';

  // Load this employee's own requests
  await loadAndRenderVacRequests(empId);

  // Build own requests section
  const mySection = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">✈️ My Vacation Requests</div>
        <button onclick="openVacationRequestForm('${empId}')"
          style="margin-left:auto;background:var(--amber-glow);border:1px solid var(--amber-dim);border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;color:var(--amber);cursor:pointer">
          + New Request
        </button>
      </div>
      <div id="vacReqList-${empId}">
        <div style="color:var(--muted);font-size:12px;padding:4px 0">Loading…</div>
      </div>
    </div>`;

  // Build approver section if manager/approver
  let approverSection = '';
  if (canApprove) {
    // Fetch all vacation requests for employees whose approver is this person OR all if owner/admin
    let pendingRows = [], historyRows = [];
    try {
      const { data } = await sb.from('vacation_requests')
        .select('*')
        .order('created_at', { ascending: false });
      const allReqs = data || [];

      // Filter to requests this person is responsible for
      const myEmpIds = employees
        .filter(e => e.isActive !== false && e.id !== empId && (e.approverId === empId || isManager()))
        .map(e => e.id);
      const relevant = allReqs.filter(r => myEmpIds.includes(r.employee_id));

      pendingRows = relevant.filter(r => r.status === 'pending');
      historyRows = relevant.filter(r => r.status !== 'pending');
    } catch(e) { console.warn('Approver vacation load error:', e); }

    const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const statusColor = { pending: '#e8a234', approved: '#4caf7d', rejected: '#d04040' };
    const statusLabel = { pending: '⏳ Pending', approved: '✓ Approved', rejected: '✗ Rejected' };

    const buildRow = (r, showActions) => {
      const sc = statusColor[r.status] || '#888';
      const sl = statusLabel[r.status] || r.status;
      const days = Math.round((new Date(r.end_date) - new Date(r.start_date)) / 86400000) + 1;
      const reqEmp = employees.find(e => e.id === r.employee_id);
      return `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg)">
        <div style="width:34px;height:34px;border-radius:50%;background:${reqEmp?.color||'#888'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${reqEmp?.initials||'?'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${r.employee_name}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px">
            <div style="font-size:12px;color:var(--muted)">${fmtD(r.start_date)} → ${fmtD(r.end_date)}</div>
            <span style="font-size:10px;color:var(--muted)">${days} day${days!==1?'s':''}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${sc}22;color:${sc};border:1px solid ${sc}44">${sl}</span>
          </div>
          ${r.notes ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${r.notes}</div>` : ''}
          ${r.approver_note ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;font-style:italic">💬 ${r.approver_note}</div>` : ''}
        </div>
        ${showActions ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="approveVacationRequest('${r.id}','${r.employee_id}');renderMyInfoVacationTab('${empId}')"
            style="background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:#4caf7d;cursor:pointer">✓ Approve</button>
          <button onclick="openRejectVacForm('${r.id}','${r.employee_id}')"
            style="background:rgba(208,64,64,0.1);border:1px solid rgba(208,64,64,0.3);border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;color:var(--red);cursor:pointer">✗ Reject</button>
          <button onclick="deleteVacationRequest('${r.id}','${r.employee_id}');renderMyInfoVacationTab('${empId}')"
            style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer">🗑</button>
        </div>` : `
        <button onclick="deleteVacationRequest('${r.id}','${r.employee_id}');renderMyInfoVacationTab('${empId}')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;color:var(--muted);cursor:pointer;flex-shrink:0">🗑</button>`}
      </div>`;
    };

    const pendingHtml = pendingRows.length
      ? pendingRows.map(r => buildRow(r, true)).join('')
      : '<div style="color:var(--muted);font-size:12px;padding:4px 0">No pending requests.</div>';

    // History — show last 20, with toggle
    const historyHtml = historyRows.length
      ? `<div id="vacHistoryList">
          ${historyRows.slice(0, 5).map(r => buildRow(r, false)).join('')}
        </div>
        ${historyRows.length > 5 ? `
          <button id="vacHistoryToggle" onclick="
            const list=document.getElementById('vacHistoryList');
            const btn=document.getElementById('vacHistoryToggle');
            const showing=list.dataset.expanded==='1';
            list.innerHTML=showing
              ? ${JSON.stringify(historyRows.slice(0,5).map(r=>buildRow(r,false)).join(''))}
              : ${JSON.stringify(historyRows.map(r=>buildRow(r,false)).join(''))};
            list.dataset.expanded=showing?'0':'1';
            btn.textContent=showing?'Show all ${historyRows.length} requests ▼':'Show less ▲';"
            style="background:none;border:none;color:var(--amber);font-size:12px;cursor:pointer;padding:4px 0;margin-top:4px">
            Show all ${historyRows.length} requests ▼
          </button>` : ''}` 
      : '<div style="color:var(--muted);font-size:12px;padding:4px 0">No history yet.</div>';

    approverSection = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">⏳ Pending Approvals</div>
        ${pendingHtml}
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">📋 Approval History</div>
        ${historyHtml}
      </div>`;
  }

  pane.innerHTML = mySection + approverSection;
  // Now load the employee's own requests into the placeholder
  loadAndRenderVacRequests(empId);
}

function renderMyInfoChatterTab(empId) {
  const pane = document.getElementById('myInfoPane-chatter');
  if (!pane) return;
  pane.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">Loading…</div>';
  _loadMyChatter(empId).then(html => { if (pane) pane.innerHTML = html; });
}

async function _loadMyChatter(empId) {
  if (!sb || !currentUser) return '<div style="color:var(--muted);font-size:13px">Not signed in.</div>';

  let sent = [], mentioned = [];
  try {
    const [sentRes, mentionedRes] = await Promise.all([
      sb.from('chatter').select('*').eq('author_id', currentUser.id).order('created_at', { ascending: false }).limit(100),
      sb.from('chatter').select('*').contains('notify_ids', [empId]).order('created_at', { ascending: false }).limit(100),
    ]);
    sent      = sentRes.data      || [];
    mentioned = mentionedRes.data || [];
  } catch(e) {
    return '<div style="color:var(--red);font-size:13px">Error loading chatter history.</div>';
  }

  // Merge + deduplicate — tag each as sent/mentioned/both
  const msgMap = {};
  sent.forEach(r => { msgMap[r.id] = { ...r, _sent: true, _mentioned: false }; });
  mentioned.forEach(r => {
    if (msgMap[r.id]) msgMap[r.id]._mentioned = true;
    else msgMap[r.id] = { ...r, _sent: false, _mentioned: true };
  });

  const msgs = Object.values(msgMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (msgs.length === 0) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:10px;color:var(--muted)">
      <div style="font-size:32px">💬</div>
      <div style="font-size:14px">No chatter messages yet</div>
    </div>`;
  }

  const fmtDate = d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const textFmt = t => (t || '')
    .replace(/\n/g, '<br>')
    .replace(/@([\w][\w ]*?)(?=\s|$|<br>)/g, '<span style="color:var(--amber);font-weight:600">@$1</span>');

  const sentCount      = msgs.filter(m => m._sent).length;
  const mentionedCount = msgs.filter(m => m._mentioned && !m._sent).length;

  const rows = msgs.map(r => {
    const proj = (typeof projects !== 'undefined') && projects.find(p => p.id === r.proj_id);
    const projLabel = proj ? `${proj.emoji || ''} ${proj.name}` : '—';
    const tag = r._sent && r._mentioned
      ? '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(124,92,191,0.15);color:var(--purple);border:1px solid rgba(124,92,191,0.3)">Sent + Mentioned</span>'
      : r._sent
        ? '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(58,127,212,0.12);color:var(--blue);border:1px solid rgba(58,127,212,0.3)">Sent</span>'
        : '<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:rgba(232,162,52,0.12);color:var(--amber);border:1px solid rgba(232,162,52,0.3)">Mentioned</span>';

    return `
    <div onclick="if(typeof selectProject==='function'&&'${r.proj_id}'){selectProject('${r.proj_id}',null);setTimeout(()=>switchProjTab('sub-chatter'),250);}"
      style="padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg);cursor:pointer;transition:background .12s"
      onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='var(--bg)'">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="font-size:11px;font-weight:600;color:var(--amber)">${projLabel}</div>
        ${tag}
        <div style="font-size:10px;color:var(--muted);margin-left:auto;white-space:nowrap">${fmtDate(r.created_at)}</div>
      </div>
      ${!r._sent ? `<div style="font-size:11px;color:var(--muted);margin-bottom:4px">from <strong style="color:var(--text)">${r.author_name}</strong></div>` : ''}
      <div style="font-size:13px;color:var(--text);line-height:1.5">${textFmt(r.text)}</div>
      ${r.attachments && r.attachments.length ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">📎 ${r.attachments.length} attachment${r.attachments.length>1?'s':''}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:700;color:var(--text)">💬 My Chatter</div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(58,127,212,0.1);color:var(--blue);border:1px solid rgba(58,127,212,0.25)">${sentCount} sent</span>
        <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:rgba(232,162,52,0.1);color:var(--amber);border:1px solid rgba(232,162,52,0.25)">${mentionedCount} mentions</span>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:14px">Last 100 messages · Click any row to jump to that project's chatter</div>
    ${rows}`;
}

// ════════════════════════════════════════════════════════════════════
//  PHASE 2 — HR RECORDS (Performance Reviews + Disciplinary Actions)
// ════════════════════════════════════════════════════════════════════

// ── Shared constants ───────────────────────────────────────────────
const HR_TIERS = [
  { key:'verbal',        label:'Verbal Warning',        color:'#5b9cf6' },
  { key:'written',       label:'Written Warning',       color:'#e8a234' },
  { key:'final_written', label:'Final Written Warning', color:'#e05c5c' },
  { key:'demotion',      label:'Demotion',              color:'#9c56a4' },
  { key:'transfer',      label:'Transfer',              color:'#888899' },
  { key:'forced_leave',  label:'Forced Leave',          color:'#e05c5c' },
  { key:'termination',   label:'Termination',           color:'#e05c5c' },
];
const HR_CATEGORIES = [
  { key:'attendance',      label:'Attendance',              policy:'§4.1 Attendance',             counted:true },
  { key:'vacation',        label:'Vacation Shortage',       policy:'§7.8 Vacation',               counted:true },
  { key:'conduct',         label:'Standards of Conduct',    policy:'§5.5 Standards of Conduct',   counted:false },
  { key:'safety',          label:'Safety Violation',        policy:'§8.2 General Safety',         counted:false },
  { key:'drug_alcohol',    label:'Drug/Alcohol Policy',     policy:'§8.1 Drug and Alcohol',       counted:false },
  { key:'harassment',      label:'Harassment / EEO',        policy:'EEO & Nonharassment',         counted:false },
  { key:'violence',        label:'Workplace Violence',      policy:'§8.3 Workplace Violence',     counted:false },
  { key:'confidentiality', label:'Confidentiality / TS',    policy:'Trade Secrets / §6.2',        counted:false },
  { key:'falsify_time',    label:'Falsifying Time Records', policy:'§4.6 Recording Time',         counted:false },
  { key:'other',           label:'Other',                   policy:'',                            counted:false },
];
// ── Staff Performance Review categories (mirrors NU Laboratories Staff form, NUI #28) ──
const STAFF_REVIEW_CATEGORIES = [
  {
    key:'knowledge', label:'Knowledge of Job', max:20,
    tiers:[
      { score:4,  desc:'Lacks understanding of the job. Needs constant supervision and instruction.' },
      { score:8,  desc:'Less than adequate. Must be supervised and instructed more than necessary.' },
      { score:12, desc:'Has sufficient knowledge. Occasional supervision and/or instruction.' },
      { score:16, desc:'Better than normally expected knowledge of the job. Seldom needs supervision.' },
      { score:20, desc:'Exceptionally knowledgeable about all aspects of the job. Needs no supervision.' },
    ]
  },
  {
    key:'quantity', label:'Quantity of Work', max:10,
    tiers:[
      { score:2,  desc:'Inadequate production.' },
      { score:4,  desc:'Production slower than normally expected.' },
      { score:6,  desc:'Production adequate for requirements of the job.' },
      { score:8,  desc:'Usually produces more than expected.' },
      { score:10, desc:'Consistently produces an exceptional amount of work.' },
    ]
  },
  {
    key:'quality', label:'Quality of Work', max:20,
    tiers:[
      { score:4,  desc:'Careless. Work quality poor. Needs constant correction. Repeats mistakes.' },
      { score:8,  desc:'Occasionally careless. Work needs more than normal amount of correction.' },
      { score:12, desc:'Accuracy and thoroughness meet job requirements. Work needs only occasional correction.' },
      { score:16, desc:'Consistently more thorough and accurate than expected. Work seldom needs correction.' },
      { score:20, desc:'Exceptionally thorough and accurate. Work never needs correction.' },
    ]
  },
  {
    key:'initiative', label:'Initiative', max:10,
    tiers:[
      { score:2,  desc:'Must be told what to do. Never makes suggestions.' },
      { score:4,  desc:'Often needs help getting started. Seldom makes suggestions.' },
      { score:6,  desc:'Proceeds on own work without prompting. Occasionally makes suggestions.' },
      { score:8,  desc:'Proceeds on own work without prompting. Frequently offers suggestions.' },
      { score:10, desc:'Resourceful and imaginative. Consistently looks for ways to increase efficiency and makes suggestions to improve own work and that of the department.' },
    ]
  },
  {
    key:'cooperation', label:'Cooperation', max:15,
    tiers:[
      { score:3,  desc:'Uncooperative. Refuses when asked for help.' },
      { score:6,  desc:'Cooperates reluctantly but will do so when pressed.' },
      { score:9,  desc:'Cooperates well when assistance is requested.' },
      { score:12, desc:'Very cooperative. Willingly responds to requests for help.' },
      { score:15, desc:'Extremely cooperative. Always willing to go the extra mile.' },
    ]
  },
  {
    key:'responsibility', label:'Responsibility', max:15,
    tiers:[
      { score:3,  desc:'Refuses any responsibility. Lacks interest in job and department.' },
      { score:6,  desc:'Hesitates to accept any responsibility toward own job or department function.' },
      { score:9,  desc:'Accepts but does not seek responsibility. Is comfortable with job as described.' },
      { score:12, desc:'Accepts and handles responsibility well. Has better than normally expected interest in the job.' },
      { score:15, desc:'Welcomes, accepts, and handles responsibility exceptionally well. Has total interest in the job and department.' },
    ]
  },
  {
    key:'dependability', label:'Dependability', max:10,
    commentHint:'Comment here on attendance and punctuality.',
    tiers:[
      { score:2,  desc:'Cannot be depended upon.' },
      { score:4,  desc:'Often undependable.' },
      { score:6,  desc:'Usually dependable.' },
      { score:8,  desc:'Unusually dependable.' },
      { score:10, desc:'Exceptionally dependable.' },
    ]
  },
];

// Total → Performance Rating conversion (1-9 scale, per paper form)
const REVIEW_RATING_BANDS = [
  { min:92, rating:9 }, { min:83, rating:8 }, { min:74, rating:7 },
  { min:65, rating:6 }, { min:56, rating:5 }, { min:47, rating:4 },
  { min:38, rating:3 }, { min:29, rating:2 }, { min:0,  rating:1 },
];
function _reviewRatingFor(total) {
  for (const b of REVIEW_RATING_BANDS) if (total >= b.min) return b.rating;
  return 1;
}
function _reviewRatingBandLabel(rating) {
  const bands = { 9:'92–100', 8:'83–91', 7:'74–82', 6:'65–73', 5:'56–64', 4:'47–55', 3:'38–46', 2:'29–37', 1:'20–28' };
  return bands[rating] || '';
}

// ── Supervisor Performance Review categories (mirrors NU Laboratories Supervisor form, NUI #29) ──
// Note: The first 7 keys deliberately match STAFF_REVIEW_CATEGORIES keys so both forms share DB columns.
// The 8th key 'support' is Supervisor-only and uses dedicated columns (support_score/support_comment).
const SUPERVISOR_REVIEW_CATEGORIES = [
  {
    key:'knowledge', label:'Understanding of the Job Supervised', max:20,
    tiers:[
      { score:4,  desc:'Inadequate.' },
      { score:8,  desc:'Fair understanding. Not always sufficient.' },
      { score:12, desc:'Good understanding of all jobs supervised.' },
      { score:16, desc:'Well informed in all phases of jobs supervised.' },
      { score:20, desc:'Thorough knowledge of own and related responsibilities.' },
    ]
  },
  {
    key:'quantity', label:'Consistency & Accuracy of Judgment', max:20,
    tiers:[
      { score:4,  desc:'Often hasty and inaccurate.' },
      { score:8,  desc:'Sometimes makes decisions without regard to consequences.' },
      { score:12, desc:'Generally reliable.' },
      { score:16, desc:'Very good. Based on sound reasoning.' },
      { score:20, desc:'Superior. Completely reliable.' },
    ]
  },
  {
    key:'quality', label:'Satisfactory Work by Group Supervised', max:15,
    tiers:[
      { score:3,  desc:'Unsatisfactory. Does not meet needs or deadlines.' },
      { score:6,  desc:'Generally satisfactory but occasionally gets behind.' },
      { score:9,  desc:'Usually meets production requirements and deadlines.' },
      { score:12, desc:'Group produces more than expected and meets deadlines.' },
      { score:15, desc:'Consistently gets maximum production from the group.' },
    ]
  },
  {
    key:'initiative', label:'Harmony & Cooperation with Employees Supervised', max:15,
    tiers:[
      { score:3,  desc:'Ineffective. Does not develop cooperative attitudes.' },
      { score:6,  desc:'Some lack of skill in handling people.' },
      { score:9,  desc:'Usually maintains smooth relationships and cooperation.' },
      { score:12, desc:'Consistently maintains effective relationships and cooperation.' },
      { score:15, desc:'Superior. Develops utmost cooperation.' },
    ]
  },
  {
    key:'cooperation', label:'Proceeds on Own Initiative', max:10,
    tiers:[
      { score:2,  desc:'Lacks initiative.' },
      { score:4,  desc:'Occasional inability to plan or organize. Needs to be prodded.' },
      { score:6,  desc:'Meets needs of the position to get work done.' },
      { score:8,  desc:'Careful and effective in planning, organizing, and delegating.' },
      { score:10, desc:'Unusual ability to plan, organize, and delegate.' },
    ]
  },
  {
    key:'responsibility', label:'Trains & Develops Employees', max:10,
    tiers:[
      { score:2,  desc:'Lacks ability to train and develop.' },
      { score:4,  desc:'Not always thorough in training employees.' },
      { score:6,  desc:'All employees sufficiently trained to do the job expected.' },
      { score:8,  desc:'Thorough. Interested in employee development and progress.' },
      { score:10, desc:'All employees are thoroughly trained and encouraged to seek promotional opportunities.' },
    ]
  },
  {
    key:'dependability', label:'Work Under Pressure (Emergencies, Deadlines)', max:5,
    tiers:[
      { score:1, desc:'Unstable. Cannot cope with emergencies and deadlines.' },
      { score:2, desc:'Sometimes reacts adversely.' },
      { score:3, desc:'Usually handles pressures well.' },
      { score:4, desc:'Very stable under pressure.' },
      { score:5, desc:'Exceptionally calm and effective under pressure.' },
    ]
  },
  {
    key:'support', label:'Supports the Organization', max:5,
    tiers:[
      { score:1, desc:'Rarely.' },
      { score:2, desc:'Reluctantly.' },
      { score:3, desc:'Usually.' },
      { score:4, desc:'Consistently.' },
      { score:5, desc:'Always.' },
    ]
  },
];

// Form-type registry: single source of truth for review metadata.
const REVIEW_FORM_TYPES = {
  staff:      { label:'Staff',      formNum:'NUI #28', categories: STAFF_REVIEW_CATEGORIES },
  supervisor: { label:'Supervisor', formNum:'NUI #29', categories: SUPERVISOR_REVIEW_CATEGORIES },
};

function _reviewCategoriesFor(formType) {
  const ft = REVIEW_FORM_TYPES[formType] || REVIEW_FORM_TYPES.staff;
  return ft.categories;
}
function _reviewFormLabel(formType) { return REVIEW_FORM_TYPES[formType]?.label   || 'Staff'; }
function _reviewFormNum(formType)   { return REVIEW_FORM_TYPES[formType]?.formNum || 'NUI #28'; }

// Helpers
function _hrTier(key)     { return HR_TIERS.find(t => t.key === key) || {label:key, color:'var(--muted)'}; }
function _hrCategory(key) { return HR_CATEGORIES.find(c => c.key === key) || {label:key, policy:'', counted:false}; }
function _hrFmtDate(s)    { if(!s) return ''; const d=new Date(s); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function _hrIsWithin12mo(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
  return d >= cutoff;
}

// ── Load HR Records for an employee (with cache) ───────────────────
async function _loadHrRecordsTab(empId, emp) {
  const inner = document.getElementById('hrRecordsTabInner');
  if (!inner) return;
  inner.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">Loading…</div>';

  if (!hrRecordsCache[empId]) {
    const [revRes, discRes] = await Promise.all([
      sb.from('performance_reviews').select('*').eq('employee_id', empId).order('review_date', {ascending:false}),
      sb.from('disciplinary_actions').select('*').eq('employee_id', empId).order('incident_date', {ascending:false}),
    ]);
    hrRecordsCache[empId] = {
      reviews:    revRes.data  || [],
      discipline: discRes.data || [],
    };
  }
  _renderHrRecordsTab(empId, emp);
}

function _renderHrRecordsTab(empId, emp) {
  const inner = document.getElementById('hrRecordsTabInner');
  if (!inner) return;
  const rawData = hrRecordsCache[empId] || { reviews: [], discipline: [] };
  // In self-view, only show records that have been released to the employee — drafts stay private to managers
  const data = _myInfoReadOnly
    ? {
        reviews:    rawData.reviews.filter(r => r.released_to_employee_at),
        discipline: rawData.discipline.filter(d => d.released_to_employee_at),
      }
    : rawData;
  const canEdit = isManager() && !_myInfoReadOnly;

  // Category counters (rolling 12-mo + all-time), counted categories only
  const counters = HR_CATEGORIES.filter(c => c.counted).map(c => {
    const all = data.discipline.filter(d => d.category === c.key);
    const rolling = all.filter(d => _hrIsWithin12mo(d.incident_date));
    return { ...c, count12: rolling.length, countAll: all.length };
  });
  // All-time totals per non-counted category
  const otherCounts = HR_CATEGORIES.filter(c => !c.counted).map(c => {
    return { ...c, countAll: data.discipline.filter(d => d.category === c.key).length };
  }).filter(c => c.countAll > 0);

  // Status pill helper
  const statusPill = (rec) => {
    if (rec.employee_acknowledged_at) {
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:rgba(76,175,125,0.15);color:#4caf7d;font-size:10.5px;font-weight:600">🟢 Acknowledged ${_hrFmtDate(rec.employee_acknowledged_at)}</span>`;
    }
    if (rec.released_to_employee_at) {
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:rgba(91,156,246,0.15);color:#5b9cf6;font-size:10.5px;font-weight:600">🔵 Released</span>`;
    }
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:#e8a234;font-size:10.5px;font-weight:600">🟡 Draft</span>`;
  };

  // Counter card markup
  const counterHtml = counters.map(c => `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:180px;flex:1">
      <div style="font-size:10.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">${c.label}</div>
      <div style="display:flex;align-items:baseline;gap:8px">
        <div style="font-size:20px;font-weight:700;color:${c.count12 >= 3 ? '#e05c5c' : c.count12 >= 2 ? '#e8a234' : 'var(--text)'}">${c.count12}</div>
        <div style="font-size:11px;color:var(--muted)">last 12 mo</div>
      </div>
      <div style="font-size:10.5px;color:var(--muted);margin-top:2px">Total all-time: ${c.countAll}</div>
    </div>
  `).join('');
  const otherCountHtml = otherCounts.length ? `
    <div style="margin-top:8px;font-size:11.5px;color:var(--muted)">
      Other categories: ${otherCounts.map(c => `<span style="margin-right:10px"><b style="color:var(--text)">${c.countAll}</b> ${c.label}</span>`).join('')}
    </div>` : '';

  // Reviews list
  const reviewsHtml = data.reviews.length === 0
    ? `<div style="padding:28px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px">No performance reviews yet.</div>`
    : data.reviews.map(r => _renderReviewCard(r, canEdit, emp)).join('');

  // Disciplinary list
  const discHtml = data.discipline.length === 0
    ? `<div style="padding:28px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface);border:1px dashed var(--border);border-radius:10px">No disciplinary actions on record.</div>`
    : data.discipline.map(d => _renderDisciplineCard(d, canEdit, emp)).join('');

  inner.innerHTML = `
    ${counters.length ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">${counterHtml}</div>
      ${otherCountHtml}
    ` : ''}

    <!-- PERFORMANCE REVIEWS -->
    <div style="margin-top:26px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-family:'DM Serif Display',serif;font-size:18px;color:var(--text)">📝 Performance Reviews</div>
      ${canEdit ? `
        <div style="position:relative" id="revTypePickerWrap_${empId}">
          <button onclick="_toggleReviewTypePicker('${empId}',event)" style="background:var(--amber);color:#0e0e0f;border:none;border-radius:7px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px">+ New Review<span style="font-size:9px;opacity:.65">▼</span></button>
          <div id="revTypePicker_${empId}" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.35);z-index:250;min-width:200px;overflow:hidden">
            <button onclick="_closeReviewTypePicker('${empId}');openReviewModal('${empId}',null,'staff')" class="rev-picker-opt">📋 Staff Review<span class="rev-picker-formnum">NUI #28</span></button>
            <button onclick="_closeReviewTypePicker('${empId}');openReviewModal('${empId}',null,'supervisor')" class="rev-picker-opt">🧭 Supervisor Review<span class="rev-picker-formnum">NUI #29</span></button>
          </div>
        </div>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">${reviewsHtml}</div>

    <!-- DISCIPLINARY ACTIONS -->
    <div style="margin-top:26px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-family:'DM Serif Display',serif;font-size:18px;color:var(--text)">⚠️ Disciplinary Actions</div>
      ${canEdit ? `<button onclick="openDisciplineModal('${empId}')" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer">+ New Action</button>` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">${discHtml}</div>
  `;
  // Re-target status pill renderer for all cards (attached to window for expand handlers)
  window._hrStatusPill = statusPill;
}

// ── Review Card ────────────────────────────────────────────────────
function _renderReviewCard(r, canEdit, emp) {
  const total   = r.total_score;
  const rating  = r.performance_rating;
  const statusPill = (window._hrStatusPill) ? window._hrStatusPill(r) : '';
  const ackAgreePill = r.agreement_status
    ? `<span style="padding:2px 8px;border-radius:10px;background:${r.agreement_status==='agree'?'rgba(76,175,125,0.15)':'rgba(224,92,92,0.15)'};color:${r.agreement_status==='agree'?'#4caf7d':'#e05c5c'};font-size:10.5px;font-weight:600">${r.agreement_status==='agree'?'Agreed':'Disagreed'}</span>`
    : '';
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="_hrToggleCard('rev_${r.id}')">
        <div style="flex:1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-size:13px;font-weight:600;color:var(--text)">Staff Review — ${_hrFmtDate(r.review_date)}</div>
          ${(total != null) ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;background:rgba(91,156,246,0.12);color:#5b9cf6;font-size:11px;font-weight:600">Score ${total}/100</span>` : ''}
          ${(rating != null) ? `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber);font-size:11px;font-weight:700">Rating ${rating}/9</span>` : `<span style="font-size:11px;color:var(--muted);font-style:italic">Not scored</span>`}
          ${statusPill}
          ${ackAgreePill}
          ${r.reviewer_name ? `<span style="font-size:11px;color:var(--muted)">by ${r.reviewer_name}</span>` : ''}
        </div>
        <span id="rev_${r.id}_chev" style="font-size:11px;color:var(--muted)">▼</span>
      </div>
      <div id="rev_${r.id}" style="display:none;padding:0 16px 14px 16px;border-top:1px solid var(--border)">
        ${_renderReviewDetail(r, canEdit, emp)}
      </div>
    </div>
  `;
}

function _renderReviewDetail(r, canEdit, emp) {
  const scoreRows = _reviewCategoriesFor(r.form_type).map(cat => {
    const v = r[`${cat.key}_score`];
    const c = r[`${cat.key}_comment`];
    return `
      <div style="padding:8px 0;border-bottom:1px dotted var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div style="font-size:12.5px;color:var(--text);font-weight:500">${cat.label}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;color:${v!=null?'#5b9cf6':'var(--muted)'}">${v!=null ? v : '—'}<span style="color:var(--muted);font-weight:400">/${cat.max}</span></div>
        </div>
        ${c ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px;white-space:pre-wrap">${(c||'').replace(/</g,'&lt;')}</div>` : ''}
      </div>`;
  }).join('');

  // Decide whether to show employee-acknowledge panel (self view, released, not yet acked)
  const selfView     = !isManager() || _myInfoReadOnly || (currentEmployee && currentEmployee.id === r.employee_id && !canEdit);
  const canAck       = selfView && r.released_to_employee_at && !r.employee_acknowledged_at
                       && currentEmployee && currentEmployee.id === r.employee_id;

  const agreementBlock = r.employee_acknowledged_at
    ? `
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:14px 0 6px">Employee Acknowledgment</div>
      <div style="background:var(--surface2);border-radius:7px;padding:10px 12px;font-size:12.5px;color:var(--text);line-height:1.55">
        <div>
          <b style="color:${r.agreement_status==='agree'?'#4caf7d':'#e05c5c'}">${r.agreement_status==='agree'?'✓ I AM IN AGREEMENT':'✕ I DO NOT AGREE'}</b>
          · signed <b>${(r.employee_signature_name||'').replace(/</g,'&lt;')}</b>
          · ${_hrFmtDate(r.employee_acknowledged_at)}
        </div>
        ${r.disagreement_explanation ? `<div style="margin-top:6px;white-space:pre-wrap;color:var(--muted);font-size:12px">${(r.disagreement_explanation||'').replace(/</g,'&lt;')}</div>` : ''}
      </div>`
    : '';

  return `
    <div style="margin-top:12px">
      ${(r.job_title || r.division) ? `
        <div style="display:flex;gap:18px;font-size:11.5px;color:var(--muted);margin-bottom:10px">
          ${r.job_title ? `<div><b style="color:var(--text);font-weight:500">${(r.job_title||'').replace(/</g,'&lt;')}</b> · Job Title</div>` : ''}
          ${r.division  ? `<div><b style="color:var(--text);font-weight:500">${(r.division ||'').replace(/</g,'&lt;')}</b> · Department</div>` : ''}
        </div>` : ''}

      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:6px">Category Scores</div>
      ${scoreRows}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-top:10px;background:var(--surface2);border-radius:7px">
        <div style="font-size:12.5px;color:var(--text);font-weight:600">Total</div>
        <div style="display:flex;align-items:center;gap:14px">
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;color:#5b9cf6">${r.total_score ?? '—'}<span style="color:var(--muted);font-weight:400;font-size:13px">/100</span></div>
          <div style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;color:var(--amber)">Rating ${r.performance_rating ?? '—'}<span style="color:var(--muted);font-weight:400;font-size:13px">/9</span></div>
        </div>
      </div>

      ${r.listed_objectives ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:14px 0 6px">Listed Objectives</div>
        <div style="font-size:13px;color:var(--text);line-height:1.55;white-space:pre-wrap">${(r.listed_objectives||'').replace(/</g,'&lt;')}</div>` : ''}
      ${r.how_to_accomplish ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:14px 0 6px">How to Accomplish</div>
        <div style="font-size:13px;color:var(--text);line-height:1.55;white-space:pre-wrap">${(r.how_to_accomplish||'').replace(/</g,'&lt;')}</div>` : ''}
      ${r.employee_input ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:14px 0 6px">Employee Input</div>
        <div style="font-size:13px;color:var(--text);line-height:1.55;white-space:pre-wrap;background:var(--surface2);padding:10px 12px;border-radius:6px">${(r.employee_input||'').replace(/</g,'&lt;')}</div>` : ''}

      ${agreementBlock}

      ${canAck ? `
        <div style="display:flex;gap:8px;margin-top:16px;padding:12px;border:1px solid var(--amber-dim);border-radius:8px;background:var(--amber-glow);align-items:center;flex-wrap:wrap">
          <div style="font-size:12.5px;color:var(--text);flex:1;min-width:220px">
            <b>Your review has been released.</b> Please read it and acknowledge.
          </div>
          <button onclick="openReviewModal('${r.employee_id}','${r.id}')" style="background:var(--amber);color:#0e0e0f;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">Open &amp; Acknowledge</button>
        </div>` : ''}

      <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap">
        ${canEdit ? `<button onclick="openReviewModal('${r.employee_id}','${r.id}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:12px;color:var(--text);cursor:pointer">✎ Edit</button>` : ''}
        ${canEdit && !r.released_to_employee_at ? `<button onclick="releaseHrRecord('performance_reviews','${r.id}','${r.employee_id}')" style="background:rgba(91,156,246,0.15);border:1px solid #5b9cf6;border-radius:6px;padding:5px 12px;font-size:12px;color:#5b9cf6;cursor:pointer;font-weight:600">🔓 Release to Employee</button>` : ''}
        <button onclick="exportReviewPdf('${r.id}','${r.employee_id}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:12px;color:var(--text);cursor:pointer">📄 Export PDF</button>
        ${canEdit ? `<button onclick="deleteHrRecord('performance_reviews','${r.id}','${r.employee_id}')" style="background:transparent;border:1px solid rgba(224,92,92,0.4);border-radius:6px;padding:5px 12px;font-size:12px;color:#e05c5c;cursor:pointer;margin-left:auto">✕ Delete</button>` : ''}
      </div>
    </div>
  `;
}

// ── Discipline Card ────────────────────────────────────────────────
function _renderDisciplineCard(d, canEdit, emp) {
  const tier = _hrTier(d.tier);
  const cat  = _hrCategory(d.category);
  const statusPill = (window._hrStatusPill) ? window._hrStatusPill(d) : '';
  return `
    <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${tier.color};border-radius:10px;overflow:hidden">
      <div style="padding:12px 16px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="_hrToggleCard('disc_${d.id}')">
        <div style="flex:1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${_hrFmtDate(d.incident_date)}</div>
          <span style="padding:2px 10px;border-radius:10px;background:${tier.color}22;color:${tier.color};font-size:11px;font-weight:700">${tier.label}</span>
          <span style="font-size:11.5px;color:var(--muted)">${cat.label}</span>
          ${statusPill}
          ${d.issued_by_name ? `<span style="font-size:11px;color:var(--muted)">by ${d.issued_by_name}</span>` : ''}
        </div>
        <span id="disc_${d.id}_chev" style="font-size:11px;color:var(--muted)">▼</span>
      </div>
      <div id="disc_${d.id}" style="display:none;padding:0 16px 14px 16px;border-top:1px solid var(--border)">
        ${_renderDisciplineDetail(d, canEdit, emp)}
      </div>
    </div>
  `;
}

function _renderDisciplineDetail(d, canEdit, emp) {
  const ackMap = { pending:['Pending','var(--muted)'], signed:['Signed','#4caf7d'], refused:['Refused to Sign','#e05c5c'] };
  const [ackLabel, ackColor] = ackMap[d.emp_ack_status] || ackMap.pending;
  return `
    <div style="margin-top:12px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:6px">Description</div>
      <div style="font-size:13px;color:var(--text);line-height:1.55;white-space:pre-wrap">${(d.description||'').replace(/</g,'&lt;')}</div>
      ${d.policy_cited ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:12px 0 4px">Handbook Policy Cited</div>
        <div style="font-size:12.5px;color:var(--text);font-family:'JetBrains Mono',monospace">${(d.policy_cited||'').replace(/</g,'&lt;')}</div>` : ''}
      ${d.witnesses ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:12px 0 4px">Witnesses</div>
        <div style="font-size:12.5px;color:var(--text)">${(d.witnesses||'').replace(/</g,'&lt;')}</div>` : ''}
      ${d.corrective_action ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:12px 0 4px">Corrective Action Plan</div>
        <div style="font-size:12.5px;color:var(--text);line-height:1.55;white-space:pre-wrap">${(d.corrective_action||'').replace(/</g,'&lt;')}</div>` : ''}
      <div style="display:flex;gap:16px;align-items:center;margin-top:14px;padding:10px 12px;background:var(--surface2);border-radius:7px">
        <div>
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Paper Ack</div>
          <div style="font-size:12.5px;color:${ackColor};font-weight:600">${ackLabel}${d.emp_ack_date ? ' · '+_hrFmtDate(d.emp_ack_date) : ''}</div>
        </div>
      </div>
      ${d.employee_comment ? `
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:14px 0 6px">Employee Response (from My Info)</div>
        <div style="font-size:13px;color:var(--text);line-height:1.55;white-space:pre-wrap;background:var(--surface2);padding:10px 12px;border-radius:6px">${(d.employee_comment||'').replace(/</g,'&lt;')}</div>` : ''}
      ${canEdit ? `
        <div style="display:flex;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap">
          <button onclick="openDisciplineModal('${d.employee_id}','${d.id}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:5px 12px;font-size:12px;color:var(--text);cursor:pointer">✎ Edit</button>
          ${!d.released_to_employee_at ? `<button onclick="releaseHrRecord('disciplinary_actions','${d.id}','${d.employee_id}')" style="background:rgba(91,156,246,0.15);border:1px solid #5b9cf6;border-radius:6px;padding:5px 12px;font-size:12px;color:#5b9cf6;cursor:pointer;font-weight:600">🔓 Release to Employee</button>` : ''}
          <button onclick="deleteHrRecord('disciplinary_actions','${d.id}','${d.employee_id}')" style="background:transparent;border:1px solid rgba(224,92,92,0.4);border-radius:6px;padding:5px 12px;font-size:12px;color:#e05c5c;cursor:pointer;margin-left:auto">✕ Delete</button>
        </div>` : ''}
    </div>
  `;
}

// ── Form-type picker (Staff vs Supervisor dropdown on + New Review) ───────
function _toggleReviewTypePicker(empId, event) {
  if (event) event.stopPropagation();
  // Close any other open picker first
  document.querySelectorAll('[id^="revTypePicker_"]').forEach(el => {
    if (el.id !== `revTypePicker_${empId}`) el.style.display = 'none';
  });
  const picker = document.getElementById(`revTypePicker_${empId}`);
  if (!picker) return;
  const nowOpen = picker.style.display === 'none' || !picker.style.display;
  picker.style.display = nowOpen ? 'block' : 'none';
  if (nowOpen) {
    // Close on outside click — one-shot listener
    setTimeout(() => {
      const onDocClick = (e) => {
        const wrap = document.getElementById(`revTypePickerWrap_${empId}`);
        if (!wrap || !wrap.contains(e.target)) {
          _closeReviewTypePicker(empId);
          document.removeEventListener('click', onDocClick);
        }
      };
      document.addEventListener('click', onDocClick);
    }, 0);
  }
}
function _closeReviewTypePicker(empId) {
  const picker = document.getElementById(`revTypePicker_${empId}`);
  if (picker) picker.style.display = 'none';
}

function _hrToggleCard(id) {
  const el = document.getElementById(id);
  const chev = document.getElementById(id+'_chev');
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (chev) chev.textContent = open ? '▼' : '▲';
}

// ── Release / Delete ───────────────────────────────────────────────
async function releaseHrRecord(table, id, empId) {
  if (!confirm('Release this record to the employee? This cannot be undone — once released, the employee can see it in My Info.')) return;
  const releasedBy = currentEmployee?.id || null;
  const { error } = await sb.from(table).update({
    released_to_employee_at: new Date().toISOString(),
    released_by: releasedBy,
  }).eq('id', id);
  if (error) { alert('Release failed: ' + error.message); return; }
  delete hrRecordsCache[empId];
  await _loadHrRecordsTab(empId, employees.find(e => e.id === empId));
  toast('🔓 Released to employee');
}

async function deleteHrRecord(table, id, empId) {
  const typeLabel = table === 'performance_reviews' ? 'performance review' : 'disciplinary action';
  if (!confirm(`Delete this ${typeLabel}? This cannot be undone.`)) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { alert('Delete failed: ' + error.message); return; }
  delete hrRecordsCache[empId];
  await _loadHrRecordsTab(empId, employees.find(e => e.id === empId));
  toast('✕ Record deleted');
}

// ── Review modal (create + edit + acknowledge) ────────────────────
// Modes:
//   manager_new    — admin/manager creating a new review
//   manager_edit   — admin/manager editing an existing draft or released (not yet acked) review
//   employee_ack   — subject employee viewing their released, unacknowledged review
//   readonly       — anything else (acknowledged, or viewer not allowed to edit)
function openReviewModal(empId, reviewId, formType) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const existing = reviewId ? (hrRecordsCache[empId]?.reviews || []).find(r => r.id === reviewId) : null;

  // Resolve form type: explicit arg > existing record > 'staff' default
  const resolvedFormType = formType || existing?.form_type || 'staff';
  const categories = _reviewCategoriesFor(resolvedFormType);

  const isSelf = currentEmployee && currentEmployee.id === emp.id;
  const isMgr  = isManager() && !_myInfoReadOnly;
  let mode;
  if (!existing && isMgr)                                                            mode = 'manager_new';
  else if (existing && isMgr && !existing.employee_acknowledged_at)                  mode = 'manager_edit';
  else if (existing && isSelf && existing.released_to_employee_at && !existing.employee_acknowledged_at) mode = 'employee_ack';
  else                                                                                mode = 'readonly';

  const mgrs = employees.filter(e => ['manager','Manager','owner','Owner','admin','Admin'].includes(e.permissionLevel) && e.isActive !== false);

  // Modal state lives on window for inline handlers
  const state = window._reviewState = {
    empId, reviewId: existing?.id || null, mode,
    formType: resolvedFormType,
    scores: {}, comments: {}, expandedCat: categories[0].key,
    reviewDate:              existing?.review_date || new Date().toISOString().slice(0,10),
    reviewerId:              existing?.reviewer_id || (isMgr ? currentEmployee?.id : null),
    jobTitle:                existing?.job_title || emp.role || '',
    division:                existing?.division  || emp.dept || '',
    listedObjectives:        existing?.listed_objectives || '',
    howToAccomplish:         existing?.how_to_accomplish  || '',
    employeeInput:           existing?.employee_input || '',
    agreementStatus:         existing?.agreement_status || '',
    disagreementExplanation: existing?.disagreement_explanation || '',
    employeeSignatureName:   existing?.employee_signature_name || (isSelf ? emp.name : ''),
  };
  categories.forEach(c => {
    state.scores[c.key]   = existing?.[`${c.key}_score`]   ?? null;
    state.comments[c.key] = existing?.[`${c.key}_comment`] ?? '';
  });

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'reviewModal';
  backdrop.onclick = e => { if(e.target===backdrop) closeReviewModal(); };

  const statusBadge = existing?.employee_acknowledged_at
    ? `<span class="rev-status-pill" style="background:rgba(76,175,125,0.15);color:#4caf7d">Acknowledged</span>`
    : existing?.released_to_employee_at
      ? `<span class="rev-status-pill" style="background:rgba(91,156,246,0.15);color:#5b9cf6">Released</span>`
      : `<span class="rev-status-pill" style="background:rgba(232,162,52,0.15);color:var(--amber)">Draft</span>`;

  backdrop.innerHTML = `
    <div class="modal rev-modal" style="width:900px;max-width:95vw;max-height:92vh;display:flex;flex-direction:column">
      <div class="modal-header" style="display:flex;align-items:center;gap:12px">
        <div class="modal-title" style="flex:1">${_reviewFormLabel(state.formType)} Performance Review — ${emp.name}</div>
        ${statusBadge}
        <button class="modal-close" onclick="closeReviewModal()">✕</button>
      </div>
      <div class="modal-body rev-body" style="display:grid;grid-template-columns:1fr 240px;gap:0;padding:0;overflow:hidden;flex:1;min-height:0">
        <div class="rev-main" style="padding:18px 22px;overflow-y:auto">
          ${_renderReviewMeta(state, mgrs)}
          <div class="rev-section-label">I · Rating Categories</div>
          <div class="rev-cats">${_renderReviewCategoriesInner(state)}</div>
          ${_renderReviewObjectives(state)}
          ${_renderReviewEmployeeInput(state)}
          ${(state.mode === 'employee_ack') ? _renderReviewAgreement(state) : (existing?.employee_acknowledged_at ? _renderReviewAckSummary(existing) : '')}
        </div>
        <div class="rev-sidebar" style="background:var(--surface2);border-left:1px solid var(--border);padding:18px 16px;overflow-y:auto">
          ${_renderReviewSidebar(state)}
        </div>
      </div>
      <div class="modal-footer" style="flex-shrink:0">
        ${_renderReviewFooter(state)}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  _reviewRecompute();
}

function closeReviewModal() {
  document.getElementById('reviewModal')?.remove();
  window._reviewState = null;
}

function _reviewFieldsDisabled() {
  const m = window._reviewState?.mode;
  return (m === 'employee_ack' || m === 'readonly') ? 'disabled' : '';
}

function _renderReviewMeta(state, mgrs) {
  const dis = (state.mode === 'employee_ack' || state.mode === 'readonly') ? 'disabled' : '';
  const reviewerOpts = mgrs.map(m => `<option value="${m.id}" ${state.reviewerId===m.id?'selected':''}>${m.name}</option>`).join('');
  return `
    <div class="rev-meta-grid">
      <div class="rev-field">
        <div class="rev-field-label">Review Date *</div>
        <input type="date" id="rev_date" value="${state.reviewDate}" ${dis} onchange="_reviewState.reviewDate=this.value">
      </div>
      <div class="rev-field">
        <div class="rev-field-label">Reviewer *</div>
        <select id="rev_reviewer" ${dis} onchange="_reviewState.reviewerId=this.value">
          <option value="">— Select reviewer —</option>
          ${reviewerOpts}
        </select>
      </div>
      <div class="rev-field">
        <div class="rev-field-label">Job Title</div>
        <input type="text" id="rev_jobTitle" value="${(state.jobTitle||'').replace(/"/g,'&quot;')}" ${dis} onchange="_reviewState.jobTitle=this.value">
      </div>
      <div class="rev-field">
        <div class="rev-field-label">Department</div>
        <input type="text" id="rev_division" value="${(state.division||'').replace(/"/g,'&quot;')}" ${dis} onchange="_reviewState.division=this.value">
      </div>
    </div>
  `;
}

function _renderReviewCategoriesInner(state) {
  const readonly = (state.mode === 'employee_ack' || state.mode === 'readonly');
  const dis      = readonly ? 'disabled' : '';
  return _reviewCategoriesFor(state.formType).map(cat => {
    const expanded = (state.expandedCat === cat.key);
    const score    = state.scores[cat.key];
    const comment  = state.comments[cat.key] || '';
    const nearest  = (score == null) ? null : cat.tiers.reduce((p,t)=>Math.abs(t.score-score)<Math.abs(p.score-score)?t:p, cat.tiers[0]);

    if (!expanded) {
      return `
        <div class="rev-cat rev-cat-collapsed" data-catkey="${cat.key}" onclick="_reviewExpandCat('${cat.key}')">
          <div class="rev-cat-label">${cat.label}<span class="rev-cat-max">/ ${cat.max}</span></div>
          <div class="rev-cat-right">
            <span class="rev-cat-score" data-catkey="${cat.key}">${score != null ? score : '—'}</span>
            <span class="rev-cat-caret">▸</span>
          </div>
        </div>`;
    }

    const tierCells = cat.tiers.map(t => {
      const active = nearest && nearest.score === t.score;
      const clickAttr = readonly ? '' : `onclick="_reviewSetScore('${cat.key}',${t.score})"`;
      return `
        <div class="rev-tier ${active?'rev-tier-active':''}" data-catkey="${cat.key}" data-tier-score="${t.score}" ${clickAttr}>
          <div class="rev-tier-score">${t.score}${active?' ←':''}</div>
          <div class="rev-tier-desc">${t.desc}</div>
        </div>`;
    }).join('');

    return `
      <div class="rev-cat rev-cat-expanded" data-catkey="${cat.key}">
        <div class="rev-cat-header" onclick="_reviewExpandCat('${cat.key}')">
          <div class="rev-cat-label">${cat.label}<span class="rev-cat-max">/ ${cat.max}</span></div>
          <div class="rev-cat-right">
            <span class="rev-cat-score" data-catkey="${cat.key}">${score != null ? score : '—'}</span>
            <span class="rev-cat-caret">▾</span>
          </div>
        </div>
        <div class="rev-tier-grid">${tierCells}</div>
        <div class="rev-slider-row">
          <input type="range" min="0" max="${cat.max}" step="1" value="${score != null ? score : 0}" ${dis}
                 class="rev-slider" data-catkey="${cat.key}"
                 oninput="_reviewSetScore('${cat.key}', parseInt(this.value,10))">
          <input type="number" min="0" max="${cat.max}" value="${score != null ? score : ''}" ${dis}
                 class="rev-score-num" data-catkey="${cat.key}" placeholder="—"
                 onchange="_reviewSetScore('${cat.key}', this.value===''?null:parseInt(this.value,10))">
          <span class="rev-slider-max">/ ${cat.max}</span>
        </div>
        <textarea ${dis} class="rev-comment" placeholder="${cat.commentHint || 'Comments…'}"
                  onchange="_reviewState.comments['${cat.key}']=this.value">${(comment||'').replace(/</g,'&lt;')}</textarea>
      </div>`;
  }).join('');
}

function _renderReviewObjectives(state) {
  const dis = (state.mode === 'employee_ack' || state.mode === 'readonly') ? 'disabled' : '';
  return `
    <div class="rev-section-label" style="margin-top:20px">II · Specifics of Comments</div>
    <div class="rev-field">
      <div class="rev-field-label">Listed Objectives</div>
      <textarea ${dis} class="rev-longtext" onchange="_reviewState.listedObjectives=this.value"
                placeholder="Goals and targets for the upcoming period…">${(state.listedObjectives||'').replace(/</g,'&lt;')}</textarea>
    </div>
    <div class="rev-field" style="margin-top:10px">
      <div class="rev-field-label">How to Accomplish</div>
      <textarea ${dis} class="rev-longtext" onchange="_reviewState.howToAccomplish=this.value"
                placeholder="Concrete steps, support, resources, or training needed…">${(state.howToAccomplish||'').replace(/</g,'&lt;')}</textarea>
    </div>`;
}

function _renderReviewEmployeeInput(state) {
  const canWrite = (state.mode === 'employee_ack');
  const dis = canWrite ? '' : 'disabled';
  const hint = canWrite
    ? 'Add your own comments before acknowledging.'
    : 'Writable by the employee after the review is released.';
  return `
    <div class="rev-section-label" style="margin-top:20px">III · Employee Input</div>
    <div class="rev-field-label" style="color:var(--muted);font-size:11px;margin-bottom:6px">${hint}</div>
    <textarea ${dis} class="rev-longtext" onchange="_reviewState.employeeInput=this.value"
              placeholder="Your comments, disagreements, or context…">${(state.employeeInput||'').replace(/</g,'&lt;')}</textarea>`;
}

function _renderReviewAgreement(state) {
  return `
    <div class="rev-agreement">
      <div class="rev-section-label" style="margin-top:20px">IV · Your Acknowledgment</div>
      <div style="font-size:12.5px;color:var(--text);margin-bottom:10px">This performance review has been discussed with me and:</div>
      <label class="rev-agree-opt">
        <input type="radio" name="rev_agreement" value="agree" ${state.agreementStatus==='agree'?'checked':''}
               onchange="_reviewState.agreementStatus='agree';_reviewToggleDisagreement()">
        <span><b style="color:#4caf7d">✓ I AM IN AGREEMENT</b></span>
      </label>
      <label class="rev-agree-opt">
        <input type="radio" name="rev_agreement" value="disagree" ${state.agreementStatus==='disagree'?'checked':''}
               onchange="_reviewState.agreementStatus='disagree';_reviewToggleDisagreement()">
        <span><b style="color:#e05c5c">✕ I DO NOT AGREE</b> (please explain below)</span>
      </label>
      <div id="rev_disagreeBox" style="display:${state.agreementStatus==='disagree'?'block':'none'};margin-top:8px">
        <textarea class="rev-longtext" onchange="_reviewState.disagreementExplanation=this.value"
                  placeholder="Explanation…">${(state.disagreementExplanation||'').replace(/</g,'&lt;')}</textarea>
      </div>
      <div class="rev-field" style="margin-top:14px">
        <div class="rev-field-label">Signature (type your full name)</div>
        <input type="text" id="rev_sigName" value="${(state.employeeSignatureName||'').replace(/"/g,'&quot;')}"
               onchange="_reviewState.employeeSignatureName=this.value"
               placeholder="Your full name">
      </div>
    </div>`;
}

function _renderReviewAckSummary(r) {
  return `
    <div class="rev-section-label" style="margin-top:20px">IV · Acknowledgment</div>
    <div style="background:var(--surface2);border-radius:7px;padding:12px 14px;font-size:12.5px;color:var(--text);line-height:1.55">
      <div><b style="color:${r.agreement_status==='agree'?'#4caf7d':'#e05c5c'}">${r.agreement_status==='agree'?'✓ I AM IN AGREEMENT':'✕ I DO NOT AGREE'}</b>
        · signed <b>${(r.employee_signature_name||'').replace(/</g,'&lt;')}</b>
        · ${_hrFmtDate(r.employee_acknowledged_at)}
      </div>
      ${r.disagreement_explanation ? `<div style="margin-top:6px;white-space:pre-wrap;color:var(--muted);font-size:12px">${(r.disagreement_explanation||'').replace(/</g,'&lt;')}</div>` : ''}
    </div>`;
}

function _renderReviewSidebar(state) {
  return `
    <div class="rev-sidebar-form">${_reviewFormLabel(state.formType)} Form · ${_reviewFormNum(state.formType)}</div>
    <div class="rev-sidebar-label">Total Score</div>
    <div id="rev_totalOut" class="rev-sidebar-total">0</div>
    <div class="rev-sidebar-hint">of 100</div>

    <div class="rev-sidebar-label" style="margin-top:18px">Performance Rating</div>
    <div id="rev_ratingOut" class="rev-sidebar-rating">—</div>
    <div id="rev_ratingBand" class="rev-sidebar-hint" style="text-align:center"></div>

    <div class="rev-sidebar-label" style="margin-top:18px">Scale (1–9)</div>
    <div class="rev-scale">
      <div><span>9</span><span>92–100</span></div>
      <div><span>8</span><span>83–91</span></div>
      <div><span>7</span><span>74–82</span></div>
      <div><span>6</span><span>65–73</span></div>
      <div><span>5</span><span>56–64</span></div>
      <div><span>4</span><span>47–55</span></div>
      <div><span>3</span><span>38–46</span></div>
      <div><span>2</span><span>29–37</span></div>
      <div><span>1</span><span>20–28</span></div>
    </div>`;
}

function _renderReviewFooter(state) {
  const cancelBtn = `<button class="rev-btn rev-btn-cancel" onclick="closeReviewModal()">Cancel</button>`;
  const pdfBtn    = state.reviewId
    ? `<button class="rev-btn" onclick="exportReviewPdf('${state.reviewId}','${state.empId}')">📄 Export PDF</button>`
    : '';

  if (state.mode === 'employee_ack') {
    return `${cancelBtn}${pdfBtn}<button id="revSaveBtnAck" class="rev-btn rev-btn-primary" onclick="saveReview('ack')" style="margin-left:auto">✓ Acknowledge</button>`;
  }
  if (state.mode === 'readonly') {
    return `${cancelBtn}${pdfBtn}`;
  }
  // manager_new / manager_edit — Save & Release available anytime (no draft-first requirement)
  const releaseBtn = !state.released
    ? `<button id="revSaveBtnRelease" class="rev-btn rev-btn-release" onclick="saveReview('release')">🔓 Save &amp; Release</button>`
    : '';
  const draftLabel = state.reviewId ? 'Save Changes' : 'Save Draft';
  return `${cancelBtn}${pdfBtn}${releaseBtn}<button id="revSaveBtnDraft" class="rev-btn rev-btn-primary" onclick="saveReview('draft')" style="margin-left:auto">${draftLabel}</button>`;
}

// ── Modal interactions ────────────────────────────────────────────
function _reviewExpandCat(key) {
  if (!window._reviewState) return;
  window._reviewState.expandedCat = (window._reviewState.expandedCat === key) ? null : key;
  const host = document.querySelector('.rev-cats');
  if (host) host.innerHTML = _renderReviewCategoriesInner(window._reviewState);
}

function _reviewSetScore(key, val) {
  if (!window._reviewState) return;
  const cat = _reviewCategoriesFor(window._reviewState.formType).find(c => c.key === key);
  if (!cat) return;
  if (val != null && !isNaN(val)) val = Math.max(0, Math.min(cat.max, val));
  else if (isNaN(val)) val = null;
  window._reviewState.scores[key] = val;

  // Update tier highlight in-place (no re-render, to preserve slider drag)
  const nearest = (val == null) ? null : cat.tiers.reduce((p,t)=>Math.abs(t.score-val)<Math.abs(p.score-val)?t:p, cat.tiers[0]);
  document.querySelectorAll(`.rev-tier[data-catkey="${key}"]`).forEach(el => {
    const ts = parseInt(el.dataset.tierScore, 10);
    const active = nearest && nearest.score === ts;
    el.classList.toggle('rev-tier-active', active);
    const lab = el.querySelector('.rev-tier-score');
    if (lab) lab.textContent = ts + (active ? ' ←' : '');
  });
  // Update displayed score numbers
  document.querySelectorAll(`.rev-cat-score[data-catkey="${key}"]`).forEach(el => {
    el.textContent = val != null ? val : '—';
  });
  // Sync slider + number input (only when they're not the active element, to avoid disrupting drag)
  const slider = document.querySelector(`.rev-slider[data-catkey="${key}"]`);
  if (slider && document.activeElement !== slider) slider.value = val != null ? val : 0;
  const num = document.querySelector(`.rev-score-num[data-catkey="${key}"]`);
  if (num && document.activeElement !== num) num.value = val != null ? val : '';

  _reviewRecompute();
}

function _reviewRecompute() {
  if (!window._reviewState) return;
  const categories = _reviewCategoriesFor(window._reviewState.formType);
  const total = categories.reduce((sum, c) => sum + (window._reviewState.scores[c.key] || 0), 0);
  const allScored = categories.every(c => window._reviewState.scores[c.key] != null);
  const rating = allScored ? _reviewRatingFor(total) : null;

  const totalOut = document.getElementById('rev_totalOut');
  if (totalOut) totalOut.textContent = total;
  const ratingOut = document.getElementById('rev_ratingOut');
  if (ratingOut) ratingOut.textContent = rating != null ? rating : '—';
  const bandOut = document.getElementById('rev_ratingBand');
  if (bandOut) bandOut.textContent = rating != null ? _reviewRatingBandLabel(rating) : `Score all ${categories.length} categories`;
}

function _reviewToggleDisagreement() {
  const box = document.getElementById('rev_disagreeBox');
  if (!box || !window._reviewState) return;
  box.style.display = window._reviewState.agreementStatus === 'disagree' ? 'block' : 'none';
}

// ── Save ───────────────────────────────────────────────────────────
async function saveReview(action) {
  const s = window._reviewState;
  if (!s) return;

  // Re-entrancy guard — prevents double-clicks from firing duplicate inserts
  if (window._reviewSaving) return;
  window._reviewSaving = true;
  // Visually disable all save buttons during the save
  ['revSaveBtnDraft','revSaveBtnRelease','revSaveBtnAck'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = true; b.style.opacity = '.55'; b.style.cursor = 'wait'; }
  });
  try {
    await _saveReviewInner(action, s);
  } finally {
    window._reviewSaving = false;
    // Buttons are either gone (modal closed) or still in DOM (error path); re-enable if still present
    ['revSaveBtnDraft','revSaveBtnRelease','revSaveBtnAck'].forEach(id => {
      const b = document.getElementById(id);
      if (b) { b.disabled = false; b.style.opacity = ''; b.style.cursor = ''; }
    });
  }
}

async function _saveReviewInner(action, s) {

  // Employee acknowledgment path
  if (action === 'ack') {
    if (!s.agreementStatus) { alert('Please select Agree or Disagree before acknowledging.'); return; }
    if (s.agreementStatus === 'disagree' && !(s.disagreementExplanation||'').trim()) {
      alert('Please explain why you disagree.'); return;
    }
    if (!(s.employeeSignatureName||'').trim()) { alert('Please type your name as your signature.'); return; }
    const payload = {
      employee_input:           s.employeeInput || null,
      agreement_status:         s.agreementStatus,
      disagreement_explanation: s.agreementStatus === 'disagree' ? (s.disagreementExplanation || null) : null,
      employee_signature_name:  s.employeeSignatureName.trim(),
      employee_acknowledged_at: new Date().toISOString(),
    };
    const { error } = await sb.from('performance_reviews').update(payload).eq('id', s.reviewId);
    if (error) { alert('Acknowledge failed: ' + error.message); return; }

    // Notify the reviewing manager — skip self-review (manager reviewed themselves)
    try {
      const reviewRow = (hrRecordsCache[s.empId]?.reviews || []).find(r => r.id === s.reviewId);
      const reviewerId = reviewRow?.reviewer_id;
      if (reviewerId && reviewerId !== s.empId) {
        const subject = employees.find(e => e.id === s.empId);
        const icon = s.agreementStatus === 'agree' ? '✓' : '⚠';
        const label = s.agreementStatus === 'agree' ? 'Agreed' : 'Disagreed';
        const { error: notifErr } = await sb.from('chatter_notifs').insert([{
          employee_id:   reviewerId,
          proj_id:       null,
          msg_id:        null,
          from_name:     subject?.name || 'Employee',
          from_initials: subject?.initials || 'E',
          from_color:    subject?.color || '#888',
          preview:       `${icon} ${subject?.name || 'Employee'} acknowledged their review (${label})||empHr:${s.empId}`,
          is_read:       false,
          created_at:    new Date().toISOString(),
        }]);
        if (notifErr) { toast('⚠ Notif error: ' + notifErr.message); console.error('review-ack notif insert error:', notifErr); }
      }
    } catch(e) { console.warn('review-ack notif insert failed:', e); }

    closeReviewModal();
    delete hrRecordsCache[s.empId];
    await _loadHrRecordsTab(s.empId, employees.find(e => e.id === s.empId));
    toast('✓ Review acknowledged');
    return;
  }

  // Manager save (draft or release)
  if (!s.reviewDate) { alert('Review date is required.'); return; }
  if (!s.reviewerId) { alert('Please select a reviewer.'); return; }

  const categories = _reviewCategoriesFor(s.formType);
  const total = categories.reduce((sum, c) => sum + (s.scores[c.key] || 0), 0);
  const allScored = categories.every(c => s.scores[c.key] != null);
  const rating = allScored ? _reviewRatingFor(total) : null;

  const reviewerEmp = employees.find(e => e.id === s.reviewerId);

  const payload = {
    employee_id:        s.empId,
    form_type:          s.formType || 'staff',
    review_date:        s.reviewDate,
    reviewer_id:        s.reviewerId,
    reviewer_name:      reviewerEmp?.name || null,
    job_title:          s.jobTitle || null,
    division:           s.division || null,
    total_score:        allScored ? total : null,
    performance_rating: rating,
    listed_objectives:  s.listedObjectives || null,
    how_to_accomplish:  s.howToAccomplish  || null,
  };
  categories.forEach(c => {
    payload[`${c.key}_score`]   = (s.scores[c.key] != null) ? s.scores[c.key] : null;
    payload[`${c.key}_comment`] = s.comments[c.key] || null;
  });

  if (action === 'release') {
    if (!allScored) { alert(`Please score all ${categories.length} categories before releasing.`); return; }
    payload.released_to_employee_at = new Date().toISOString();
    payload.released_by             = currentEmployee?.id || null;
  }

  let err;
  if (s.reviewId) {
    ({ error: err } = await sb.from('performance_reviews').update(payload).eq('id', s.reviewId));
  } else {
    payload.created_by = currentEmployee?.id || null;
    ({ error: err } = await sb.from('performance_reviews').insert(payload));
  }
  if (err) { alert('Save failed: ' + err.message); return; }

  // On release, notify the subject employee so they see the red-badge and can jump to HR Records
  if (action === 'release') {
    try {
      const { error: notifErr } = await sb.from('chatter_notifs').insert([{
        employee_id:   s.empId,
        proj_id:       null,
        msg_id:        null,
        from_name:     currentEmployee?.name || 'Manager',
        from_initials: currentEmployee?.initials || 'M',
        from_color:    currentEmployee?.color || '#888',
        preview:       `📋 Your performance review is ready. Please review and acknowledge.||myinfo:hrrecords`,
        is_read:       false,
        created_at:    new Date().toISOString(),
      }]);
      if (notifErr) { toast('⚠ Notif error: ' + notifErr.message); console.error('review-release notif insert error:', notifErr); }
    } catch(e) { console.warn('review-release notif insert failed:', e); }
  }

  closeReviewModal();
  delete hrRecordsCache[s.empId];
  await _loadHrRecordsTab(s.empId, employees.find(e => e.id === s.empId));
  toast(action === 'release' ? '🔓 Review released to employee' : (s.reviewId ? '✓ Review updated' : '✓ Review created'));
}

// ── PDF export (mirrors NUI #28 Staff / NUI #29 Supervisor paper forms) ───
async function exportReviewPdf(reviewId, empId) {
  const r = (hrRecordsCache[empId]?.reviews || []).find(x => x.id === reviewId);
  if (!r) { alert('Review not found.'); return; }
  const emp = employees.find(e => e.id === empId);
  if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library not loaded.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Header
  const formLbl = _reviewFormLabel(r.form_type);
  const formNum = _reviewFormNum(r.form_type);
  doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('NU LABORATORIES', pageW/2, y, { align:'center' }); y += 18;
  doc.text(`${formLbl.toUpperCase()} EMPLOYEE — PERFORMANCE REVIEW`, pageW/2, y, { align:'center' }); y += 16;
  doc.setDrawColor(180); doc.line(margin, y, pageW-margin, y); y += 16;

  // Metadata
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  const labelVal = (label, val, x, yy) => {
    doc.setTextColor(120); doc.text(label, x, yy);
    doc.setTextColor(0); doc.setFont('helvetica','bold');
    doc.text(val || '—', x, yy+12); doc.setFont('helvetica','normal');
  };
  labelVal('NAME',             emp?.name || '',                  margin,       y);
  labelVal('DATE OF REVIEW',   _hrFmtDate(r.review_date),        margin + 180, y);
  labelVal('JOB TITLE',        r.job_title || '',                margin + 340, y);
  y += 30;
  labelVal('DEPARTMENT',       r.division || 'NU Laboratories',  margin,       y);
  labelVal('REVIEWER',         r.reviewer_name || '',            margin + 180, y);
  labelVal('FORM',             `${formNum} (${formLbl})`,        margin + 340, y);
  y += 26;

  // Category table
  const body = _reviewCategoriesFor(r.form_type).map(cat => {
    const score   = r[`${cat.key}_score`];
    const comment = r[`${cat.key}_comment`] || '';
    return [ cat.label, `${score != null ? score : '—'} / ${cat.max}`, comment ];
  });
  doc.autoTable({
    startY: y,
    head: [['Category','Score','Comments']],
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 5, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: [60,60,60], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0:{ cellWidth: 130, fontStyle:'bold' }, 1:{ cellWidth: 55, halign:'center' }, 2:{ cellWidth: 'auto' } },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 12;

  // Totals
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text(`TOTAL SCORE: ${r.total_score != null ? r.total_score : '—'} / 100`, margin, y);
  doc.text(`PERFORMANCE RATING: ${r.performance_rating != null ? r.performance_rating : '—'} / 9`, margin + 240, y);
  y += 20;

  // Sections
  const addSection = (label, text) => {
    if (!text) return;
    if (y > pageH - 140) { doc.addPage(); y = margin; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80);
    doc.text(label.toUpperCase(), margin, y); y += 12;
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(0);
    const lines = doc.splitTextToSize(text, pageW - margin*2);
    doc.text(lines, margin, y); y += lines.length * 12 + 10;
  };
  addSection('II · Listed Objectives', r.listed_objectives);
  addSection('    How to Accomplish',  r.how_to_accomplish);
  addSection('III · Employee Input',   r.employee_input);

  // Signature / agreement
  if (y > pageH - 110) { doc.addPage(); y = margin; }
  doc.setDrawColor(180); doc.line(margin, y, pageW-margin, y); y += 14;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(0);
  doc.text('This performance review has been discussed with me and:', margin, y); y += 14;
  doc.setFont('helvetica','normal');
  const ack = r.agreement_status;
  doc.text(`[${ack==='agree'?'X':' '}] I AM IN AGREEMENT`,   margin, y);
  doc.text(`[${ack==='disagree'?'X':' '}] I DO NOT AGREE`, margin + 200, y); y += 14;
  if (ack === 'disagree' && r.disagreement_explanation) {
    doc.setTextColor(60);
    const lines = doc.splitTextToSize(r.disagreement_explanation, pageW - margin*2);
    doc.text(lines, margin, y); y += lines.length * 12 + 6;
    doc.setTextColor(0);
  }
  y += 6;
  doc.setTextColor(120); doc.setFontSize(9);
  doc.text(`SIGNATURE: ${r.employee_signature_name || '— not signed —'}`, margin, y);
  doc.text(`DATE: ${r.employee_acknowledged_at ? _hrFmtDate(r.employee_acknowledged_at) : '—'}`, margin + 320, y); y += 14;
  doc.text(`RELEASED BY: ${r.reviewer_name || ''}${r.released_to_employee_at ? '  ·  ' + _hrFmtDate(r.released_to_employee_at) : '  ·  not released'}`, margin, y);

  // Footer
  doc.setFontSize(8); doc.setTextColor(150);
  doc.text(formNum, pageW - margin, pageH - 20, { align:'right' });

  const fname = `Performance_Review_${(emp?.name||'employee').replace(/\s+/g,'_')}_${r.review_date}.pdf`;
  doc.save(fname);
}

// ── Discipline modal (create + edit) ───────────────────────────────
function openDisciplineModal(empId, actionId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  const existing = actionId ? (hrRecordsCache[empId]?.discipline || []).find(d => d.id === actionId) : null;
  const mgrs = employees.filter(e => ['manager','Manager','owner','Owner','admin','Admin'].includes(e.permissionLevel) && e.isActive !== false);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'discModal';
  backdrop.onclick = e => { if(e.target===backdrop) backdrop.remove(); };

  backdrop.innerHTML = `
    <div class="modal" style="width:680px;max-height:90vh">
      <div class="modal-header">
        <div class="modal-title">${existing ? '✎ Edit' : '+ New'} Disciplinary Action — ${emp.name}</div>
        <button class="modal-close" onclick="document.getElementById('discModal').remove()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="disc_id" value="${existing?.id || ''}">
        <input type="hidden" id="disc_empId" value="${empId}">
        <div class="field-row">
          <div class="field">
            <div class="field-label">Incident Date *</div>
            <input type="date" id="disc_date" class="f-input" value="${existing?.incident_date || new Date().toISOString().slice(0,10)}">
          </div>
          <div class="field">
            <div class="field-label">Warning Tier *</div>
            <select id="disc_tier" class="f-select">
              ${HR_TIERS.map(t => `<option value="${t.key}" ${existing?.tier===t.key?'selected':''}>${t.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Category *</div>
            <select id="disc_category" class="f-select" onchange="_hrPolicyAutoFill()">
              ${HR_CATEGORIES.map(c => `<option value="${c.key}" data-policy="${c.policy}" ${existing?.category===c.key?'selected':''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <div class="field-label">Handbook Policy Cited</div>
            <input type="text" id="disc_policy" class="f-input" value="${(existing?.policy_cited||'').replace(/"/g,'&quot;')}" placeholder="e.g. §4.1 Attendance">
          </div>
        </div>
        <div class="field">
          <div class="field-label">Description of Incident *</div>
          <textarea id="disc_desc" class="f-textarea" placeholder="What happened, when, and how…">${(existing?.description||'').replace(/</g,'&lt;')}</textarea>
        </div>
        <div class="field">
          <div class="field-label">Witness(es)</div>
          <input type="text" id="disc_witnesses" class="f-input" value="${(existing?.witnesses||'').replace(/"/g,'&quot;')}" placeholder="Names of anyone present, if any">
        </div>
        <div class="field">
          <div class="field-label">Corrective Action Plan</div>
          <textarea id="disc_corrective" class="f-textarea" placeholder="Expected changes, follow-up date, consequences of repeat…">${(existing?.corrective_action||'').replace(/</g,'&lt;')}</textarea>
        </div>
        <div class="field">
          <div class="field-label">Issued By *</div>
          <select id="disc_issuer" class="f-select">
            <option value="">— Select —</option>
            ${mgrs.map(m => `<option value="${m.id}" data-name="${m.name}" ${existing?.issued_by_id===m.id?'selected':''}>${m.name}</option>`).join('')}
          </select>
        </div>
        <div class="modal-div"></div>
        <div class="field-row">
          <div class="field">
            <div class="field-label">Paper Acknowledgment</div>
            <select id="disc_ack" class="f-select">
              <option value="pending" ${existing?.emp_ack_status==='pending'||!existing?'selected':''}>Pending</option>
              <option value="signed"  ${existing?.emp_ack_status==='signed'?'selected':''}>Signed</option>
              <option value="refused" ${existing?.emp_ack_status==='refused'?'selected':''}>Refused to Sign</option>
            </select>
          </div>
          <div class="field">
            <div class="field-label">Acknowledgment Date</div>
            <input type="date" id="disc_ackDate" class="f-input" value="${existing?.emp_ack_date || ''}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-close" style="margin-left:auto;background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:8px 16px;font-size:12.5px;color:var(--text);cursor:pointer" onclick="document.getElementById('discModal').remove()">Cancel</button>
        <button onclick="saveDiscipline()" style="background:var(--red);color:#fff;border:none;border-radius:7px;padding:8px 18px;font-size:12.5px;font-weight:600;cursor:pointer">${existing?'Save Changes':'Create Action'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));

  // Auto-fill policy if new and category default selected
  if (!existing) _hrPolicyAutoFill();
}

function _hrPolicyAutoFill() {
  const catSel = document.getElementById('disc_category');
  const polIn  = document.getElementById('disc_policy');
  if (!catSel || !polIn) return;
  // Only auto-fill if empty, to not clobber manual edits
  if (polIn.value.trim()) return;
  const suggested = catSel.selectedOptions[0]?.dataset.policy || '';
  polIn.value = suggested;
}

async function saveDiscipline() {
  const id    = document.getElementById('disc_id').value || null;
  const empId = document.getElementById('disc_empId').value;
  const date  = document.getElementById('disc_date').value;
  const tier  = document.getElementById('disc_tier').value;
  const cat   = document.getElementById('disc_category').value;
  const desc  = document.getElementById('disc_desc').value.trim();
  const issuerSel = document.getElementById('disc_issuer');
  const issuerId  = issuerSel.value || null;
  const issuerName = issuerSel.selectedOptions[0]?.dataset.name || null;

  if (!date)    { alert('Incident date is required'); return; }
  if (!tier)    { alert('Warning tier is required'); return; }
  if (!cat)     { alert('Category is required'); return; }
  if (!desc)    { alert('Description is required'); return; }
  if (!issuerId){ alert('Please select who issued this'); return; }

  const payload = {
    employee_id: empId,
    incident_date: date,
    tier, category: cat,
    description: desc,
    policy_cited:      document.getElementById('disc_policy').value || null,
    witnesses:         document.getElementById('disc_witnesses').value || null,
    corrective_action: document.getElementById('disc_corrective').value || null,
    issued_by_id: issuerId,
    issued_by_name: issuerName,
    emp_ack_status: document.getElementById('disc_ack').value || 'pending',
    emp_ack_date:   document.getElementById('disc_ackDate').value || null,
  };

  let err;
  if (id) {
    ({ error: err } = await sb.from('disciplinary_actions').update(payload).eq('id', id));
  } else {
    ({ error: err } = await sb.from('disciplinary_actions').insert(payload));
  }
  if (err) { alert('Save failed: ' + err.message); return; }

  document.getElementById('discModal')?.remove();
  delete hrRecordsCache[empId];
  await _loadHrRecordsTab(empId, employees.find(e => e.id === empId));
  toast(id ? '✓ Action updated' : '✓ Action created');
}
