
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
  renderEmployeesPanel('');
}

let empDetailOpen = null;

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
  const fmt = d => d.toISOString().split('T')[0];
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

function getPartTimeSickAccrued(empId, annivStart, annivEnd) {
  // NJ rule: 1 hour sick for every 30 hours worked, calculated from timesheet data
  const rangeEnd = annivEnd || new Date();
  let totalHoursWorked = 0;
  Object.entries(tsData).forEach(([key, rows]) => {
    if (key.startsWith('oh_') || !Array.isArray(rows)) return;
    if (!key.startsWith(empId + '|')) return;
    const weekKey = key.split('|')[1];
    if (!weekKey) return;
    const weekDate = new Date(weekKey + 'T00:00:00');
    if (annivStart && weekDate < annivStart) return;
    if (weekDate >= rangeEnd) return;
    rows.forEach(row => {
      if (row.hours) totalHoursWorked += Object.values(row.hours).reduce((s,h)=>s+(parseFloat(h)||0),0);
    });
  });
  return Math.floor(totalHoursWorked / 30); // 1h per 30h worked, no fractional hours
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
      const dateStr = d.toISOString().slice(0,10);
      used.holiday += h;
      used.holidayDays.push({ date: dateStr, hrs: h });
    });
  });
  return used;
}

// ── Employee panel ───────────────────────────────────────────────────────────

let showInactiveEmployees = false;

function toggleInactiveEmployees() {
  showInactiveEmployees = !showInactiveEmployees;
  renderEmployeesPanel(document.getElementById('empSearch')?.value || '');
}

function renderEmployeesPanel(search) {
  const q = (search || '').toLowerCase();
  const filtered = employees.filter(e => {
    const _empInactive = e.isActive === false || !!e.terminationDate;
    if (!showInactiveEmployees && _empInactive) return false;
    return e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.dept.toLowerCase().includes(q);
  }).sort((a, b) => {
    const lastA = a.name.trim().split(' ').slice(-1)[0].toLowerCase();
    const lastB = b.name.trim().split(' ').slice(-1)[0].toLowerCase();
    return lastA.localeCompare(lastB);
  });
  const inactiveCount = employees.filter(e => e.isActive === false || !!e.terminationDate).length;
  const body = document.getElementById('empPanelBody');
  body.innerHTML = `
    <div style="display:flex;height:100%;gap:0;overflow:hidden">
      <!-- Left: employee list -->
      <div style="width:260px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;background:var(--surface)">
        <div style="padding:16px 14px 10px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
          <input style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none"
            placeholder="Search…" value="${q}" oninput="renderEmployeesPanel(this.value)" />
          <button onclick="openEmployeeModal(null)" style="background:var(--amber);border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:600;color:#000;cursor:pointer;white-space:nowrap">+ Add</button>
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
            return `
            <div onclick="showEmpProfile('${e.id}')" id="emplistrow-${e.id}"
              style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .12s;opacity:${isInactive?'0.55':'1'};${empDetailOpen===e.id?'background:var(--surface2);border-left:3px solid var(--amber);':'border-left:3px solid transparent;'}"
              onmouseover="if('${e.id}'!==empDetailOpen)this.style.background='var(--surface2)'" onmouseout="if('${e.id}'!==empDetailOpen)this.style.background=''">
              <div style="width:34px;height:34px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${e.initials}</div>
              <div style="overflow:hidden">
                <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.name}</div>
                <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isInactive ? '<span style="color:var(--red);font-weight:600">'+termLabel+'</span>' : e.role+(e.dept?' · '+e.dept:'')}</div>
              </div>
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
  const used = getTimeOffUsed(empId, year, _annivRange?.start, _annivRange?.end);
  const vacAllotment = getVacationAllotment(emp.hireDate);
  const vacAccrued = getQuarterlyAccrual(emp.hireDate, _annivRange?.start);
  const vacOpeningBalance = emp.vacBank || 0;
  const today = new Date();

  // Sick accrual: opening balance (sick_bank) + drops on Jan 1 and May 1 within anniversary year, capped at 48h
  // Part-time: NJ rule — 1h per 30h worked, no fixed drops
  const isPartTime = emp.empType === 'parttime';
  let sickAllotment = 0;
  const sickOpeningBalance = emp.sickBank || 0;
  if (isPartTime) {
    const ptAccrued = getPartTimeSickAccrued(empId, _annivRange?.start, _annivRange?.end);
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

  // Build weekly hours data for bar chart
  const weeklyHours = {};      // weekKey -> total hours
  const weeklySick = {};       // weekKey -> sick hours
  const weeklyVacation = {};   // weekKey -> vacation hours only
  const weeklyHoliday = {};    // weekKey -> holiday hours only
  // Chart starts at hire date in the current year (or Jan 1 if no hire date)
  // Chart shows last 52 weeks of data regardless of anniversary
  const chartStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 364); // 52 weeks back
    // Snap to nearest Sunday
    const dow = d.getDay();
    d.setDate(d.getDate() - dow);
    return d;
  })();

  const SICK_CATS = ['Sick', 'Sick Time', '⬡ Sick Time'];
  const VAC_CATS  = ['Vacation Time', 'Holiday', 'Personal Time'];

  const empWeekKeys = new Set();
  Object.keys(tsData).forEach(key => {
    if (key.startsWith(empId + '|') && !key.startsWith('oh_')) empWeekKeys.add(key.split('|')[1]);
    if (key.startsWith('oh_' + empId + '|')) empWeekKeys.add(key.split('|')[1]);
  });

  empWeekKeys.forEach(weekKey => {
    const key = empId + '|' + weekKey;
    const rows = tsData[key] || [];
    if (!weekKey || weekKey.length < 10) return;
    const weekDate = new Date(weekKey + 'T00:00:00');
    if (weekDate < chartStart) return;
    let projHrs = 0, sickHrs = 0, vacHrs = 0, holHrs = 0, ohWorkHrs = 0;
    rows.forEach(r => { if (r && r.hours) projHrs += Object.values(r.hours).reduce((s,h)=>s+(parseFloat(h)||0),0); });
    const ohKey = 'oh_' + key;
    const oh = tsData[ohKey] || {};
    // Deduplicate overhead categories — normalize names like "290-Sales Support" → "Sales Support"
    const ohNormalized = {};
    Object.entries(oh).forEach(([cat, dayMap]) => {
      if (!dayMap) return;
      const normCat = cat.replace(/^\d+-/, '').replace(/^⬡\s*/, '').trim();
      if (!ohNormalized[normCat]) ohNormalized[normCat] = {};
      Object.entries(dayMap).forEach(([di, h]) => {
        ohNormalized[normCat][di] = Math.max(ohNormalized[normCat][di]||0, parseFloat(h)||0);
      });
    });
    Object.entries(ohNormalized).forEach(([cat, dayMap]) => {
      const catHrs = Object.values(dayMap).reduce((s,h)=>s+(parseFloat(h)||0),0);
      if (SICK_CATS.some(sc => sc.replace(/^⬡\s*/,'').trim() === cat)) sickHrs += catHrs;
      else if (cat === 'Vacation Time' || cat === 'Personal Time') vacHrs += catHrs;
      else if (cat === 'Holiday' || cat === 'Snow Day') holHrs += catHrs;
      else ohWorkHrs += catHrs;
    });
    const total = projHrs + ohWorkHrs + sickHrs + vacHrs + holHrs;
    if (total > 0) {
      weeklyHours[weekKey] = projHrs + ohWorkHrs;
      weeklySick[weekKey] = sickHrs;
      weeklyVacation[weekKey] = vacHrs;
      weeklyHoliday[weekKey] = holHrs;
    }
  });

  const chartWeeks = Object.keys(weeklyHours).concat(
    Object.keys(weeklySick).filter(k => !weeklyHours[k]),
    Object.keys(weeklyVacation).filter(k => !weeklyHours[k] && !weeklySick[k]),
    Object.keys(weeklyHoliday).filter(k => !weeklyHours[k] && !weeklySick[k] && !weeklyVacation[k])
  ).filter((v,i,a)=>a.indexOf(v)===i).sort();

  const maxHrs = Math.max(40, ...chartWeeks.map(wk => (weeklyHours[wk]||0)+(weeklySick[wk]||0)+(weeklyVacation[wk]||0)+(weeklyHoliday[wk]||0)));

  // Build chart HTML
  const weeklyChartId = 'empHoursChart_' + empId;
  let weeklyHoursChartHtml = '';
  if (chartWeeks.length > 0) {
    const chartLabels = chartWeeks.map(wk => { const sat=new Date(wk+'T00:00:00'); sat.setDate(sat.getDate()+6); return sat.toLocaleDateString('en-US',{month:'short',day:'numeric'}); });
    const chartWork   = chartWeeks.map(wk => weeklyHours[wk]   || 0);
    const chartVac    = chartWeeks.map(wk => weeklyVacation[wk] || 0);
    const chartHol    = chartWeeks.map(wk => weeklyHoliday[wk]  || 0);
    const chartSick   = chartWeeks.map(wk => weeklySick[wk]     || 0);

    // Utilization: project hours / total hours, only for weeks on/after Mar 15 2026
    const utilCutoff = new Date('2026-03-09T00:00:00');
    const chartUtil = chartWeeks.map((wk, i) => {
      const wkDate = new Date(wk + 'T00:00:00');
      if (wkDate < utilCutoff) return null;
      // Hours in building = project hours + overhead work (Sales Support, General Overhead)
      const inBuilding = (chartWork[i]||0);
      if (inBuilding <= 0) return null;
      // Pure project hours only (exclude General Overhead from denominator's numerator)
      const key = empId + '|' + wk;
      const rows2 = tsData[key] || [];
      const projOnly = rows2.reduce((s, r) => s + Object.values(r.hours||{}).reduce((a,b)=>a+(parseFloat(b)||0),0), 0);
      return Math.round((projOnly / inBuilding) * 100);
    });

    // Running average utilization from cutoff to latest week with data
    const utilWeeks = chartUtil.filter(v => v !== null);
    const utilAvg = utilWeeks.length > 0 ? Math.round(utilWeeks.reduce((s,v)=>s+v,0) / utilWeeks.length) : null;

    weeklyHoursChartHtml =
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'+
          '<div style="font-size:13px;font-weight:700;color:var(--text)">📊 Weekly Hours — Last 12 Months</div>'+
          '<div style="display:flex;align-items:center;gap:12px">'+
            (utilAvg !== null ? '<div style="font-size:12px;color:var(--muted)">Avg utilization <span style="font-weight:700;color:var(--green)">'+utilAvg+'%</span></div>' : '')+
            '<div style="font-size:11px;color:var(--muted)">'+chartWeeks.length+' weeks</div>'+
          '</div>'+
        '</div>'+
        '<div style="position:relative;height:280px">'+
          '<canvas id="'+weeklyChartId+'"></canvas>'+
        '</div>'+
      '</div>';

    // Draw chart after HTML is injected
    setTimeout(() => {
      const canvas = document.getElementById(weeklyChartId);
      if (!canvas || !window.Chart) return;
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'Work',      data: chartWork, backgroundColor: '#4caf7dcc', borderRadius: 3, stack: 'a' },
            { label: 'Vacation',  data: chartVac,  backgroundColor: '#c07a1acc', borderRadius: 3, stack: 'a' },
            { label: 'Holiday',   data: chartHol,  backgroundColor: '#3a7fd4cc', borderRadius: 3, stack: 'a' },
            { label: 'Sick',      data: chartSick, backgroundColor: '#d04040cc', borderRadius: 3, stack: 'a' },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#6b6b78', font: { size: 11 }, boxWidth: 12, padding: 16 }
            },
            tooltip: {
              callbacks: {
                footer: items => {
                  const total = items.reduce((s, i) => s + i.raw, 0);
                  const idx = items[0]?.dataIndex;
                  const util = chartUtil[idx];
                  return 'Total: ' + total.toFixed(1) + 'h' + (util !== null ? '  |  Utilization: ' + util + '%' : '');
                }
              }
            },
            afterDraw: undefined
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: '#6b6b78', font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
              grid: { display: false }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              suggestedMax: 50,
              ticks: { color: '#6b6b78', font: { size: 11 }, stepSize: 10 },
              grid: { color: 'rgba(220,220,224,0.3)' }
            }
          },
          animation: {
            onComplete: function() {
              const chart = this;
              const ctx = chart.ctx;
              ctx.save();
              ctx.font = '600 10px DM Sans, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              chart.data.datasets[0].data.forEach((_, i) => {
                const util = chartUtil[i];
                if (util === null) return;
                const meta = chart.getDatasetMeta(chart.data.datasets.length - 1);
                // find topmost visible bar for this index
                let topY = Infinity;
                chart.data.datasets.forEach((ds, di) => {
                  const m = chart.getDatasetMeta(di);
                  if (!m.hidden && m.data[i]) {
                    topY = Math.min(topY, m.data[i].y);
                  }
                });
                if (topY === Infinity) return;
                const x = chart.getDatasetMeta(0).data[i]?.x;
                if (x === undefined) return;
                ctx.fillStyle = util >= 80 ? '#2e9e62' : util >= 60 ? '#c07a1a' : '#d04040';
                ctx.fillText(util + '%', x, topY - 4);
              });
              ctx.restore();
            }
          }
        }
      });
    }, 80);
  }

    pane.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:16px">
        <div style="width:64px;height:64px;border-radius:50%;background:${emp.color};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials}</div>
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:24px;color:var(--text)">${emp.name}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:2px">${emp.role}${emp.dept?' · '+emp.dept:''}</div>
          ${yearsWorked ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">Hired ${fmtDate(emp.hireDate)} · ${yearsWorked} yrs seniority</div>` : ''}
        </div>
      </div>
      ${isManager() ? `<div style="display:flex;gap:8px">
        <button onclick="openEmployeeModal('${empId}')" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--text);cursor:pointer">✎ Edit</button>
        <button onclick="deleteEmployee('${empId}')" style="background:transparent;border:1px solid rgba(224,92,92,0.4);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--red);cursor:pointer">✕ Remove</button>
      </div>` : ''}
    </div>

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
            <div style="font-size:13px;font-weight:600;color:${isInFirstYear(emp.hireDate) ? 'var(--muted)' : 'var(--blue)'}">
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
                  <div style="height:100%;border-radius:6px;width:${usedPct}%;background:${over?'var(--red)':'var(--blue)'};transition:width .4s;position:relative;z-index:1"></div>
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
                <span>${usedHrs.toFixed(1)}h used${over?' ⚠ Over':''}</span>
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
          ${sickOverage > 0 ? `<div style="margin-top:6px;padding:5px 9px;border-radius:6px;background:rgba(208,64,64,0.08);border:1px solid rgba(208,64,64,0.25);font-size:11px;color:var(--red)">+ ${sickOverage.toFixed(1)}h charged from sick overage</div>` : ''}
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
              const ptAccrued = getPartTimeSickAccrued(empId, _annivRange?.start, _annivRange?.end);
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
            const totalSick = sickOpeningBalance + 48;
            const usedSick = used.sick;
            const usedPct = totalSick > 0 ? Math.min(100, (usedSick / totalSick) * 100) : 0;
            const over = usedSick > sickAllotment;
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
            return `
              <div style="position:relative;margin-top:10px;margin-bottom:32px">
                <div style="background:var(--surface2);border-radius:6px;height:10px;position:relative;overflow:visible">
                  <div style="height:100%;border-radius:6px;width:${usedPct}%;background:${over?'var(--red)':'var(--amber)'};transition:width .4s;position:relative;z-index:1"></div>
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
              <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:-20px">
                <span>${usedSick.toFixed(1)}h used${over?' ⚠ Over':''}</span>
                <span>opened ${sickOpeningBalance}h + up to 48h drops</span>
              </div>`;
          })()}
          ${sickOverage > 0 ? `<div style="margin-top:6px;padding:5px 9px;border-radius:6px;background:rgba(208,64,64,0.1);border:1px solid rgba(208,64,64,0.3);font-size:11px;color:var(--red)">⚠ ${sickOverage.toFixed(1)}h overage — charged against vacation</div>` : ''}
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
            const taken = (used.holidayDays||[]).find(d => d.date === h.date);
            return taken
              ? `<span title="${taken.hrs}hrs logged" style="font-size:10px;padding:3px 8px;border-radius:8px;background:rgba(76,175,125,0.15);border:1px solid rgba(76,175,125,0.4);color:#4caf7d">✓ ${h.name}</span>`
              : `<span style="font-size:10px;padding:3px 8px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)">${h.name}</span>`;
          }).join('')}
        </div>
        ${(() => {
          const knownDates = new Set(holidays.map(h => h.date));
          const extraDays = (used.holidayDays||[]).filter(d => !knownDates.has(d.date));
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
  `;
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
  const _editingId = editingEmpId; // only use explicitly set editingEmpId, never fall back

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
