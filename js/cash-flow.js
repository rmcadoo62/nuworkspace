// ===== CASH FLOW TRACKER =====
// ===== CASH FLOW TRACKER =====
// New, self-contained feature file — does not modify dashboard.js, auth.js's
// applyPermissions body, or any other existing file's logic. Instead it wraps
// renderDashboard() (to inject a gated button at the top of the Dashboard)
// and applyPermissions() (to keep that button's visibility in sync with the
// current user's capabilities), following the same wrapping convention used
// by nav.js and router.js elsewhere in this codebase.
//
// Gated by the 'view_cash_flow' capability (Setup → Permissions → Financials).
// Real security is enforced by Postgres RLS on cash_flow_entries — see
// cash_flow_migration.sql. The client-side gating here is UI convenience only.

const CASH_FLOW_TABLE = 'cash_flow_entries';
const CASH_FLOW_CAP   = 'view_cash_flow';

let cashFlowEntries      = []; // [{id, entryDate, bankBalance, schwabBalance, heldForOwners, deposits, billPayments, arOutstanding, salesInvoiced, notes, createdBy}]
let cashFlowLoaded       = false;
let cashFlowLoading      = false;
let _cfEditingEntryId    = null; // id of entry currently open in the modal, or null for "new"

// ── Ballantine (separate co-owned company) ─────────────────────────────────
// Ballantine is a different company Russ co-owns, not part of NULabs. Same
// screen, same permission group, but its own table (see
// ballantine_cash_flow_migration.sql) — its entries are on their own
// independent timeline, and mixing two companies' books into NULabs' own
// cash_flow_entries rows would be exactly the kind of accidental blending
// this whole tracker was built to avoid. Deliberately lean: just Bank
// Balance and AR Outstanding, both carried forward like Schwab — no DSO,
// since Ballantine doesn't invoice through any system Workspace can read.
const BALLANTINE_TABLE = 'ballantine_cash_flow_entries';
let ballantineEntries          = []; // [{id, entryDate, bankBalance, arOutstanding, notes, createdBy}]
let ballantineLoaded           = false;
let ballantineLoading          = false;
let _cfEditingBallantineId     = null;
window._cfActiveCompany = window._cfActiveCompany || 'nulabs'; // 'nulabs' | 'ballantine' — which company's detail view is showing

// ── Data layer ──────────────────────────────────────────────────────────
async function loadCashFlowEntries(force) {
  if (!sb) return [];
  if (cashFlowLoaded && !force) return cashFlowEntries;
  if (cashFlowLoading) return cashFlowEntries;
  cashFlowLoading = true;
  try {
    const PAGE = 1000;
    let all = [], page = 0;
    while (true) {
      const { data, error } = await sb.from(CASH_FLOW_TABLE)
        .select('*')
        .order('entry_date', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) { console.error('[cash-flow] load error:', error); break; }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      page++;
    }
    cashFlowEntries = all.map(r => ({
      id:            r.id,
      entryDate:     r.entry_date,
      bankBalance:   r.bank_balance   != null ? parseFloat(r.bank_balance)   : null,
      schwabBalance: r.schwab_balance != null ? parseFloat(r.schwab_balance) : null,
      heldForOwners: r.held_for_owners != null ? parseFloat(r.held_for_owners) : null,
      deposits:      r.deposits       != null ? parseFloat(r.deposits)      : 0,
      billPayments:  r.bill_payments  != null ? parseFloat(r.bill_payments) : 0,
      arOutstanding: r.ar_outstanding != null ? parseFloat(r.ar_outstanding): null,
      salesInvoiced: r.sales_invoiced != null ? parseFloat(r.sales_invoiced): 0,
      notes:         r.notes || '',
      createdBy:     r.created_by || '',
    }));
    cashFlowLoaded = true;
  } finally {
    cashFlowLoading = false;
  }
  return cashFlowEntries;
}

async function upsertCashFlowEntry(entry) {
  if (!sb) return null;
  const row = {
    entry_date:      entry.entryDate,
    bank_balance:    entry.bankBalance,
    schwab_balance:  entry.schwabBalance,
    held_for_owners: entry.heldForOwners,
    deposits:        entry.deposits || 0,
    bill_payments:   entry.billPayments || 0,
    ar_outstanding:  entry.arOutstanding,
    sales_invoiced:  0, // unused — DSO now pulls sales from Workspace's own billed-revenue data (see _cfTrailingSalesInvoiced)
    notes:           entry.notes || null,
    created_by:      entry.createdBy || (typeof currentEmployee !== 'undefined' && currentEmployee ? currentEmployee.name : null),
  };
  const { data, error } = await sb.from(CASH_FLOW_TABLE)
    .upsert(row, { onConflict: 'entry_date' })
    .select()
    .single();
  if (error) { console.error('[cash-flow] save error:', error); if (typeof toast === 'function') toast('⚠ Could not save entry: ' + (error.message || error.code || '')); return null; }
  return data;
}

async function deleteCashFlowEntryById(id) {
  if (!sb || !id) return false;
  const { error } = await sb.from(CASH_FLOW_TABLE).delete().eq('id', id);
  if (error) { console.error('[cash-flow] delete error:', error); if (typeof toast === 'function') toast('⚠ Could not delete entry'); return false; }
  return true;
}

// ── Ballantine data layer ───────────────────────────────────────────────
async function loadBallantineEntries(force) {
  if (!sb) return [];
  if (ballantineLoaded && !force) return ballantineEntries;
  if (ballantineLoading) return ballantineEntries;
  ballantineLoading = true;
  try {
    const PAGE = 1000;
    let all = [], page = 0;
    while (true) {
      const { data, error } = await sb.from(BALLANTINE_TABLE)
        .select('*')
        .order('entry_date', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) { console.error('[cash-flow] Ballantine load error:', error); break; }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      page++;
    }
    ballantineEntries = all.map(r => ({
      id:            r.id,
      entryDate:     r.entry_date,
      bankBalance:   r.bank_balance   != null ? parseFloat(r.bank_balance)   : null,
      arOutstanding: r.ar_outstanding != null ? parseFloat(r.ar_outstanding): null,
      notes:         r.notes || '',
      createdBy:     r.created_by || '',
    }));
    ballantineLoaded = true;
  } finally {
    ballantineLoading = false;
  }
  return ballantineEntries;
}

async function upsertBallantineEntry(entry) {
  if (!sb) return null;
  const row = {
    entry_date:      entry.entryDate,
    bank_balance:    entry.bankBalance,
    ar_outstanding:  entry.arOutstanding,
    notes:           entry.notes || null,
    created_by:      entry.createdBy || (typeof currentEmployee !== 'undefined' && currentEmployee ? currentEmployee.name : null),
  };
  const { data, error } = await sb.from(BALLANTINE_TABLE)
    .upsert(row, { onConflict: 'entry_date' })
    .select()
    .single();
  if (error) { console.error('[cash-flow] Ballantine save error:', error); if (typeof toast === 'function') toast('⚠ Could not save Ballantine entry: ' + (error.message || error.code || '')); return null; }
  return data;
}

async function deleteBallantineEntryById(id) {
  if (!sb || !id) return false;
  const { error } = await sb.from(BALLANTINE_TABLE).delete().eq('id', id);
  if (error) { console.error('[cash-flow] Ballantine delete error:', error); if (typeof toast === 'function') toast('⚠ Could not delete Ballantine entry'); return false; }
  return true;
}

// ── Calculations ────────────────────────────────────────────────────────
function _cfSorted() {
  return [...cashFlowEntries].sort((a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0);
}

function cfLatestEntry() {
  const sorted = _cfSorted();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

// ── Charles Schwab carry-forward ──────────────────────────────────────────
// The Schwab money market account is separate from the NUI Cash TD Bank
// checking account and doesn't get a fresh reading every day — Russ pulls
// it "when he gets the number," sometimes weeks apart. So schwabBalance is
// null on most days, meaning "no new reading," not "$0." This carries the
// most recently known value forward so the combined total below doesn't
// wrongly drop every time a day passes without a fresh Schwab number.
// Returns a same-length array aligned to sortedEntries.
function _cfCarriedSchwab(sortedEntries) {
  let lastKnown = null;
  return sortedEntries.map(e => {
    if (e.schwabBalance != null) lastKnown = e.schwabBalance;
    return lastKnown;
  });
}

// Generic "most recently known value, and the true date it was actually
// entered" forward-fill. TD Bank Balance and AR Outstanding were originally
// built to require a fresh number every day (so a blank meant "Linda
// hasn't logged today yet") — but now that Schwab / Held for Owners can be
// updated on their own without touching TD Bank or AR that same day, an
// entry that ONLY updates one of those would otherwise leave TD Bank/AR
// null for "today" and blank out the KPI cards entirely, even though we do
// know a real recent figure. Carrying the last known reading forward (with
// its true source date, so the UI can say "carried from <that day>"
// instead of implying it's fresh) fixes that. The Recent Entries table
// still shows the raw per-day value separately, so the audit trail of
// "did Linda actually log a fresh number today" isn't lost.
function _cfCarriedWithDate(sortedEntries, field) {
  let lastKnown = null, lastKnownDate = null;
  return sortedEntries.map(e => {
    if (e[field] != null) { lastKnown = e[field]; lastKnownDate = e.entryDate; }
    return { value: lastKnown, asOfDate: lastKnownDate };
  });
}

// "Bank Balance" everywhere in the UI means TD Bank's most recently known
// reading plus Schwab's most recently known reading (both carried forward)
// — since that's the number Russ actually tracks day to day, not
// whatever's literally sitting in the newest calendar row.
function _cfTotalBalance(carriedBankBalance, carriedSchwab) {
  if (carriedBankBalance == null && carriedSchwab == null) return null;
  return (carriedBankBalance || 0) + (carriedSchwab || 0);
}

// ── Rental owner pass-through cash ──────────────────────────────────────
// Cash for a rental property (a deposit that's already earmarked for
// distribution to the property owners) hits the same bank account as
// NULabs' own operating money, but it isn't NULabs' to spend. This tracks
// how much of the current Bank Balance is really "held for owners" — a
// single running total across all properties, updated by Linda only when
// it changes (deposit in → raise it, distribution paid out → lower it),
// same carry-forward pattern as Schwab: null means "no change today," not
// "$0 held."
function _cfCarriedHeldForOwners(sortedEntries) {
  let lastKnown = null;
  return sortedEntries.map(e => {
    if (e.heldForOwners != null) lastKnown = e.heldForOwners;
    return lastKnown;
  });
}

// What NULabs can actually spend: TD Bank's most recently known reading,
// minus whatever is currently held for rental owners. Schwab is
// deliberately excluded — it's a money market fund, not checking-account
// cash, and would have to be sold to become spendable, so it's not
// "available" in the sense this figure means.
function _cfAvailableCash(carriedBankBalance, carriedHeld) {
  if (carriedBankBalance == null) return null;
  return carriedBankBalance - (carriedHeld || 0);
}

// Sorted entries with TD Bank, Schwab, Held-for-Owners, and AR Outstanding
// all carried forward (each with its own true "as of" source date), plus
// the combined total, available-cash, and net-flow figures attached,
// computed once over the FULL history so a chart zoomed to "1M" still
// carries forward a reading from outside that window instead of wrongly
// showing it as missing. Use this (not _cfSorted()) anywhere the UI needs
// these figures.
function _cfSortedWithTotal() {
  const sorted = _cfSorted();
  const carriedSchwab = _cfCarriedSchwab(sorted);
  const carriedHeld   = _cfCarriedHeldForOwners(sorted);
  const carriedBank   = _cfCarriedWithDate(sorted, 'bankBalance');
  const carriedAr     = _cfCarriedWithDate(sorted, 'arOutstanding');
  const withTotals = sorted.map((e, i) => {
    const bankKnown = carriedBank[i].value;
    const availableCash = _cfAvailableCash(bankKnown, carriedHeld[i]);
    return Object.assign({}, e, {
      carriedSchwab: carriedSchwab[i],
      carriedBankBalance: bankKnown,
      carriedBankAsOf: carriedBank[i].asOfDate,
      carriedArOutstanding: carriedAr[i].value,
      carriedArAsOf: carriedAr[i].asOfDate,
      totalBalance: _cfTotalBalance(bankKnown, carriedSchwab[i]),
      carriedHeldForOwners: carriedHeld[i],
      availableCash,
    });
  });
  // Net Cash Flow = day-over-day change in Available Cash, NOT hand-entered
  // Deposits/Bill Payments. Those two fields sat at $0 for the entire life
  // of this tracker because nobody actually logged them day to day — and
  // Bill Payments in particular can't really be tracked that way: a bill
  // paid by check or wire may not clear TD for days (sometimes weeks) after
  // it's "paid," so a same-day entry would never match what the bank shows
  // anyway. Deriving it from the real balance change means it's always
  // populated and always reflects what actually happened, with no extra
  // data entry — a rental deposit/distribution swing washes out on its own
  // since it's already netted out of Available Cash on both sides.
  let prevAvailable = null;
  return withTotals.map(e => {
    const netFlow = (prevAvailable != null && e.availableCash != null) ? (e.availableCash - prevAvailable) : null;
    if (e.availableCash != null) prevAvailable = e.availableCash;
    return Object.assign({}, e, { netFlow });
  });
}

// Sum of the last 7 rows' day-over-day netFlow values — i.e. the total
// change in Available Cash across however many calendar days those 7 rows
// actually span (may be more than 7 calendar days if entries are sparse).
function cfTrailing7NetFlow() {
  const sorted = _cfSortedWithTotal();
  const last7 = sorted.slice(-7);
  const flows = last7.map(e => e.netFlow).filter(v => v != null);
  return flows.length ? flows.reduce((s, v) => s + v, 0) : null;
}

// Sales Invoiced (for DSO) is NOT hand-entered by Linda — Workspace already
// tracks billed revenue across every project, open and closed, in the same
// monthly summary the Dashboard's "Billed Revenue" chart reads (populated
// from the billed_revenue_monthly table into window.billedMonthlyData by
// loadAllData() in supabase-client.js). That table only has month-level
// granularity, so this prorates each overlapping month's total evenly across
// its days to approximate a trailing-30-day sales figure. That's precise
// enough for a DSO trend indicator without asking anyone to track a second,
// redundant "sales invoiced" number by hand.
//
// One wrinkle: for a month that's still in progress in the real world (i.e.
// today's own month), Workspace's total for that month is a running
// month-to-date figure, NOT a finished total — it only reflects however
// many days have actually elapsed. Dividing that partial total by the
// month's full length (e.g. 31 for August) understates the true daily
// pace, which artificially inflates DSO until the month closes. So for
// whichever month is still open right now, we divide by days-elapsed so
// far instead of the month's full length. Every other (already-closed)
// month in the window keeps the full-length divide, since its total really
// is final.
function _cfTrailingSalesInvoiced(asOfDateStr) {
  const data = window.billedMonthlyData || {};
  const asOf = new Date(asOfDateStr + 'T00:00:00');
  const windowStart = new Date(asOf); windowStart.setDate(windowStart.getDate() - 29); // trailing 30 calendar days incl. asOf
  const realNow = new Date();

  let total = 0;
  let cursor = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
  const asOfMonthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  while (cursor <= asOfMonthStart) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const key = y + '-' + String(m + 1).padStart(2, '0');
    const monthStart = new Date(y, m, 1);
    const monthEnd   = new Date(y, m + 1, 0); // last calendar day of month
    // Still in progress in the real world right now → data[key] is a
    // month-to-date total, so divide by days elapsed, not the full month.
    const monthInProgress = monthEnd >= realNow;
    const daysInMonth = monthInProgress
      ? Math.max(1, Math.min(monthEnd.getDate(), realNow.getDate()))
      : monthEnd.getDate();
    const overlapStart = monthStart > windowStart ? monthStart : windowStart;
    const overlapEnd   = monthEnd < asOf ? monthEnd : asOf;
    const overlapDays = Math.floor((overlapEnd - overlapStart) / 86400000) + 1;
    const monthTotal = data[key] || 0;
    total += (monthTotal / daysInMonth) * Math.max(0, overlapDays);
    cursor = new Date(y, m + 1, 1);
  }
  return total;
}

function cfDSO() {
  const sorted = _cfSortedWithTotal();
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  if (!latest || latest.carriedArOutstanding == null) return null;
  // Trailing sales window is anchored to today's date (current pace),
  // even though the AR figure itself may be carried forward from an
  // earlier entry that's the most recent one we actually have.
  const salesSum = _cfTrailingSalesInvoiced(latest.entryDate);
  const avgDailySales = salesSum / 30;
  if (!avgDailySales) return null;
  return latest.carriedArOutstanding / avgDailySales;
}

// ── Ballantine calculations ─────────────────────────────────────────────
function _cfBallantineSorted() {
  return [...ballantineEntries].sort((a, b) => a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : 0);
}

// Bank Balance and AR Outstanding both carry forward, same "leave blank if
// unchanged" pattern as NULabs — reuses the same generic helper.
function _cfBallantineSortedWithCarry() {
  const sorted = _cfBallantineSorted();
  const carriedBank = _cfCarriedWithDate(sorted, 'bankBalance');
  const carriedAr   = _cfCarriedWithDate(sorted, 'arOutstanding');
  return sorted.map((e, i) => Object.assign({}, e, {
    carriedBankBalance: carriedBank[i].value,
    carriedBankAsOf: carriedBank[i].asOfDate,
    carriedArOutstanding: carriedAr[i].value,
    carriedArAsOf: carriedAr[i].asOfDate,
  }));
}

function ballantineLatest() {
  const sorted = _cfBallantineSortedWithCarry();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

// ── Multi Company combined total ────────────────────────────────────────
// Russ's own personal-level view across both companies — deliberately NOT
// the same figure as NULabs' own "Available Cash" card. Per Russ: include
// Schwab (even though it's excluded from NULabs' own Bank Balance/Available
// Cash since it isn't liquid) and don't net out Held for Owners — he's not
// using this figure operationally right now, he just wants the flat total
// value across everything. NULabs' own cards are unaffected by this and
// keep their stricter, liquid-only definitions.
function _cfCombinedTotals() {
  const nu = cfLatestEntry() ? _cfSortedWithTotal().slice(-1)[0] : null;
  const ba = ballantineLatest();
  const bank = (nu ? (nu.carriedBankBalance || 0) + (nu.carriedSchwab || 0) : 0) + (ba ? (ba.carriedBankBalance || 0) : 0);
  const ar = (nu && nu.carriedArOutstanding != null ? nu.carriedArOutstanding : 0) + (ba && ba.carriedArOutstanding != null ? ba.carriedArOutstanding : 0);
  const hasAny = !!(nu || ba);
  return { bank: hasAny ? bank : null, ar: hasAny ? ar : null, total: hasAny ? bank + ar : null };
}

// ── Dashboard button injection ────────────────────────────────────────────
// renderDashboard() replaces #dashWrap's innerHTML wholesale on every call,
// so the button has to be re-injected after every original call, not just
// once. Wrapping (rather than editing dashboard.js) keeps this feature
// entirely self-contained.
function _cfEnsureDashboardButton() {
  const wrap = document.getElementById('dashWrap');
  if (!wrap) return;
  let bar = document.getElementById('cfDashButtonBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cfDashButtonBar';
    bar.className = 'cf-dash-btn-bar';
    bar.innerHTML = `<button id="cfDashButton" class="cf-dash-btn" onclick="openCashFlowPanel()">💵 Cash Flow Tracker</button>`;
    wrap.insertBefore(bar, wrap.firstChild);
  }
  _cfApplyButtonVisibility();
}

function _cfApplyButtonVisibility() {
  const bar = document.getElementById('cfDashButtonBar');
  if (!bar) return;
  const allowed = (typeof can === 'function') && can(CASH_FLOW_CAP);
  bar.style.display = allowed ? '' : 'none';
}

(function _cfWrapRenderDashboard() {
  const orig = window.renderDashboard;
  if (typeof orig !== 'function') return; // dashboard.js not loaded — nothing to wrap
  window.renderDashboard = function (...args) {
    const r = orig.apply(this, args);
    _cfEnsureDashboardButton();
    return r;
  };
})();

(function _cfWrapApplyPermissions() {
  const orig = window.applyPermissions;
  if (typeof orig !== 'function') return;
  window.applyPermissions = function (...args) {
    const r = orig.apply(this, args);
    _cfApplyButtonVisibility();
    return r;
  };
})();

// ── Panel open/close ───────────────────────────────────────────────────
async function openCashFlowPanel(el) {
  if (!(typeof can === 'function' && can(CASH_FLOW_CAP))) {
    if (typeof toast === 'function') toast('⚠ You do not have access to the Cash Flow Tracker');
    return;
  }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  const topbar = document.getElementById('topbarName');
  if (topbar) topbar.textContent = 'Cash Flow Tracker';
  if (typeof showProjectView === 'function') {
    showProjectView('panel-cash-flow');
  } else {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-cash-flow')?.classList.add('active');
  }
  const wrap = document.getElementById('cashFlowWrap');
  if (wrap) wrap.innerHTML = '<div class="cf-loading">⏳ Loading cash flow data…</div>';
  // Load both companies up front — the Multi Company total banner needs
  // both regardless of which company's detail view is currently active.
  await Promise.all([loadCashFlowEntries(), loadBallantineEntries()]);
  renderCashFlowPanel();
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderCashFlowPanel() {
  const wrap = document.getElementById('cashFlowWrap');
  if (!wrap) return;

  const activeCompany = window._cfActiveCompany || 'nulabs';
  const fmt$ = n => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDays = n => n == null ? '—' : n.toFixed(1) + ' days';
  const combined = _cfCombinedTotals();

  const header = `
    <div class="cf-header">
      <button class="cf-back-btn" onclick="if(typeof openDashboardPanel==='function')openDashboardPanel(document.getElementById('navDashboard'))">&larr; Back to Dashboard</button>
      <h2 class="cf-title">💵 Cash Flow Tracker</h2>
      <button class="cf-add-btn" onclick="${activeCompany === 'ballantine' ? 'openBallantineEntryModal()' : 'openCashFlowEntryModal()'}">+ Add / Edit Entry</button>
    </div>

    <div class="cf-kpi-card" style="margin-bottom:16px">
      <div class="cf-kpi-label">Multi Company Total — NULabs + Ballantine</div>
      <div style="display:flex;gap:36px;margin-top:6px;flex-wrap:wrap">
        <div>
          <div class="cf-kpi-value">${fmt$(combined.bank)}</div>
          <div class="cf-kpi-sub">Combined Bank Balance — TD + Schwab + Ballantine (gross, not netted for Held for Owners)</div>
        </div>
        <div>
          <div class="cf-kpi-value">${fmt$(combined.ar)}</div>
          <div class="cf-kpi-sub">Combined AR Outstanding — both companies</div>
        </div>
        <div>
          <div class="cf-kpi-value">${fmt$(combined.total)}</div>
          <div class="cf-kpi-sub">Multi Company Total — Bank Balance + AR Outstanding</div>
        </div>
      </div>
    </div>

    <div class="cf-series-row" style="margin-bottom:18px">
      ${[['nulabs', 'NULabs'], ['ballantine', 'Ballantine']].map(([key, label]) => {
        const active = activeCompany === key;
        return `<button class="cf-range-btn${active ? ' active' : ''}" onclick="setCfActiveCompany('${key}')">${label}</button>`;
      }).join('')}
    </div>
  `;

  wrap.innerHTML = header + (activeCompany === 'ballantine' ? _cfRenderBallantineSection(fmt$) : _cfRenderNULabsSection(fmt$, fmtDays));

  setTimeout(() => {
    if (activeCompany === 'ballantine') {
      _cfDrawBallantineCharts(_cfFilterByRange(_cfBallantineSortedWithCarry(), window._cfChartRange || 'all'));
    } else {
      _cfDrawCharts(_cfFilterByRange(_cfSortedWithTotal(), window._cfChartRange || 'all'));
    }
  }, 60);
}

// Switches which company's detail view is showing and re-renders the whole
// panel. A full re-render (rather than a partial swap) is simplest here —
// the NULabs and Ballantine sections differ enough in KPI cards, charts,
// and table columns that trying to patch just one part in place isn't
// worth the complexity for a screen this infrequently switched.
function setCfActiveCompany(company) {
  window._cfActiveCompany = company;
  renderCashFlowPanel();
}

function _cfRenderNULabsSection(fmt$, fmtDays) {
  const sorted = _cfSortedWithTotal();
  const latest = sorted.length ? sorted[sorted.length - 1] : null;

  const bankBalance   = latest ? latest.carriedBankBalance : null; // TD Bank's most recently known reading — Schwab shown separately, not blended in
  const availableCash  = latest ? latest.availableCash : null;
  const netToday       = latest ? latest.netFlow : null;
  const netTrailing7   = cashFlowEntries.length ? cfTrailing7NetFlow() : null;
  const arOutstanding  = latest ? latest.carriedArOutstanding : null;
  const dso            = cfDSO();

  const netTodayColor  = netToday   == null ? 'var(--muted)' : netToday   >= 0 ? 'var(--green)' : 'var(--red)';
  const net7Color      = netTrailing7 == null ? 'var(--muted)' : netTrailing7 >= 0 ? 'var(--green)' : 'var(--red)';

  // If the most recent reading for a figure isn't from today's row (e.g.
  // today only updated Held for Owners), label it "carried from <date>"
  // instead of implying it's a fresh number.
  const bankAsOfLabel = !latest || !latest.carriedBankAsOf ? 'No entries yet'
    : (latest.carriedBankAsOf === latest.entryDate ? 'as of ' + _cfFmtDate(latest.carriedBankAsOf) : 'carried from ' + _cfFmtDate(latest.carriedBankAsOf));
  const arAsOfLabel = !latest || !latest.carriedArAsOf ? ''
    : (latest.carriedArAsOf === latest.entryDate ? 'as of ' + _cfFmtDate(latest.carriedArAsOf) : 'carried from ' + _cfFmtDate(latest.carriedArAsOf));

  // Net Cash Flow — Today is really "change since the previous entry," which
  // is only literally "today" if that previous entry was the prior calendar
  // day. When entries are sparse (or someone skipped a few days), say so
  // honestly rather than implying a same-day comparison.
  const prevEntry = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const netTodayLabel = !latest ? ''
    : !prevEntry ? 'First entry — nothing to compare yet'
    : (_cfDaysBetween(prevEntry.entryDate, latest.entryDate) <= 1
        ? _cfFmtDate(latest.entryDate)
        : 'since ' + _cfFmtDate(prevEntry.entryDate));
  const last7 = sorted.slice(-7);
  const net7RangeLabel = last7.length > 1 ? _cfFmtDate(last7[0].entryDate) + ' – ' + _cfFmtDate(last7[last7.length - 1].entryDate)
    : (last7.length === 1 ? _cfFmtDate(last7[0].entryDate) : '');

  const recent = sorted.slice(-30).reverse(); // most recent first

  return `
    <div class="cf-kpi-row">
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Bank Balance</div>
        <div class="cf-kpi-value">${fmt$(bankBalance)}</div>
        <div class="cf-kpi-sub">${bankAsOfLabel}</div>
        <div class="cf-kpi-sub" style="color:var(--muted)">TD Bank only — Schwab: ${fmt$(latest ? latest.carriedSchwab : null)} (separate, not included)</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Available Cash</div>
        <div class="cf-kpi-value">${fmt$(availableCash)}</div>
        <div class="cf-kpi-sub">TD Bank minus rental owner money currently held</div>
        <div class="cf-kpi-sub">Held for owners: ${fmt$(latest ? latest.carriedHeldForOwners : null)}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Net Cash Flow — Today</div>
        <div class="cf-kpi-value" style="color:${netTodayColor}">${netToday == null ? '—' : (netToday >= 0 ? '+' : '') + fmt$(netToday)}</div>
        <div class="cf-kpi-sub">${netTodayLabel}</div>
        <div class="cf-kpi-sub" style="color:var(--muted)">Change in Available Cash</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Net Cash Flow — Trailing 7</div>
        <div class="cf-kpi-value" style="color:${net7Color}">${netTrailing7 == null ? '—' : (netTrailing7 >= 0 ? '+' : '') + fmt$(netTrailing7)}</div>
        <div class="cf-kpi-sub">Last ${Math.min(sorted.length, 7)} ${Math.min(sorted.length, 7) === 1 ? 'entry' : 'entries'}${net7RangeLabel ? ' · ' + net7RangeLabel : ''}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">AR Outstanding</div>
        <div class="cf-kpi-value">${fmt$(arOutstanding)}</div>
        <div class="cf-kpi-sub">${arAsOfLabel}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">DSO</div>
        <div class="cf-kpi-value">${fmtDays(dso)}</div>
        <div class="cf-kpi-sub">Avg days to collect · sales auto-pulled from Workspace billing</div>
      </div>
    </div>

    <div class="cf-range-row">
      <span class="cf-range-label">Chart range:</span>
      ${['1m','3m','6m','1y','all'].map(r => {
        const labels = {'1m':'1M','3m':'3M','6m':'6M','1y':'1Y','all':'All'};
        const active = (window._cfChartRange || 'all') === r;
        return `<button class="cf-range-btn${active ? ' active' : ''}" data-range="${r}" onclick="setCfChartRange('${r}')">${labels[r]}</button>`;
      }).join('')}
    </div>

    <div class="cf-charts-row">
      <div class="cf-chart-card">
        <div class="cf-chart-title">📈 Bank Balance</div>
        <div class="cf-series-row">
          ${['td','schwab'].map(s => {
            const labels = {'td':'TD Bank','schwab':'Schwab'};
            const active = (window._cfBankSeries || 'td') === s;
            return `<button class="cf-range-btn${active ? ' active' : ''}" data-series="${s}" onclick="setCfBankSeries('${s}')">${labels[s]}</button>`;
          }).join('')}
        </div>
        <canvas id="cfBankBalanceChart" height="110"></canvas>
      </div>
      <div class="cf-chart-card">
        <div class="cf-chart-title">💧 Daily Net Cash Flow</div>
        <div style="font-size:11px;color:var(--muted);margin:-6px 0 10px">Change in Available Cash, entry to entry</div>
        <canvas id="cfNetFlowChart" height="110"></canvas>
      </div>
    </div>
    <div class="cf-charts-row" style="margin-top:20px">
      <div class="cf-chart-card" style="flex:1 1 100%">
        <div class="cf-chart-title">🧾 AR Outstanding &amp; DSO</div>
        <canvas id="cfArDsoChart" height="90"></canvas>
      </div>
    </div>

    <div class="cf-table-card" style="margin-top:20px">
      <div class="cf-table-title">Recent Entries</div>
      ${recent.length === 0 ? '<div class="cf-empty">No entries yet. Click “+ Add / Edit Entry” to log the first day.</div>' : `
      <div style="overflow-x:auto">
        <table class="cf-table">
          <thead>
            <tr>
              <th>Date</th><th>TD Bank</th><th>Schwab</th><th>Total Bank Balance</th><th>Held for Owners</th><th>Available Cash</th>
              <th>Net</th><th>AR Outstanding</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(e => {
              const net = e.netFlow;
              return `<tr>
                <td>${_cfFmtDate(e.entryDate)}</td>
                <td title="${e.bankBalance != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.bankBalance != null ? fmt$(e.bankBalance) : (e.carriedBankBalance != null ? fmt$(e.carriedBankBalance) + ' *' : '—')}</td>
                <td title="${e.schwabBalance != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.schwabBalance != null ? fmt$(e.schwabBalance) : (e.carriedSchwab != null ? fmt$(e.carriedSchwab) + ' *' : '—')}</td>
                <td>${fmt$(e.totalBalance)}</td>
                <td title="${e.heldForOwners != null ? 'Entered this day' : 'Carried forward — no update this day'}">${e.heldForOwners != null ? fmt$(e.heldForOwners) : (e.carriedHeldForOwners != null ? fmt$(e.carriedHeldForOwners) + ' *' : '—')}</td>
                <td>${fmt$(e.availableCash)}</td>
                <td style="color:${net == null ? 'var(--muted)' : net >= 0 ? 'var(--green)' : 'var(--red)'}">${net == null ? '—' : (net >= 0 ? '+' : '') + fmt$(net)}</td>
                <td title="${e.arOutstanding != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.arOutstanding != null ? fmt$(e.arOutstanding) : (e.carriedArOutstanding != null ? fmt$(e.carriedArOutstanding) + ' *' : '—')}</td>
                <td><button class="cf-row-edit-btn" onclick="openCashFlowEntryModal('${e.id}')">Edit</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="cf-modal-note" style="margin-top:10px">* Value carried forward from the last day it was actually entered — that day's row didn't include a fresh reading.</div>`}
    </div>
  `;
}

function _cfRenderBallantineSection(fmt$) {
  const sorted = _cfBallantineSortedWithCarry();
  const latest = sorted.length ? sorted[sorted.length - 1] : null;

  const bankAsOfLabel = !latest || !latest.carriedBankAsOf ? 'No entries yet'
    : (latest.carriedBankAsOf === latest.entryDate ? 'as of ' + _cfFmtDate(latest.carriedBankAsOf) : 'carried from ' + _cfFmtDate(latest.carriedBankAsOf));
  const arAsOfLabel = !latest || !latest.carriedArAsOf ? 'No entries yet'
    : (latest.carriedArAsOf === latest.entryDate ? 'as of ' + _cfFmtDate(latest.carriedArAsOf) : 'carried from ' + _cfFmtDate(latest.carriedArAsOf));

  const recent = sorted.slice(-30).reverse();

  return `
    <div class="cf-kpi-row" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:600px">
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Bank Balance</div>
        <div class="cf-kpi-value">${fmt$(latest ? latest.carriedBankBalance : null)}</div>
        <div class="cf-kpi-sub">${bankAsOfLabel}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">AR Outstanding</div>
        <div class="cf-kpi-value">${fmt$(latest ? latest.carriedArOutstanding : null)}</div>
        <div class="cf-kpi-sub">${arAsOfLabel}</div>
      </div>
    </div>
    <div class="cf-modal-note" style="margin:-10px 0 18px">No DSO for Ballantine — it doesn't invoice through any system Workspace can read, so there's no sales data to calculate it from.</div>

    <div class="cf-range-row">
      <span class="cf-range-label">Chart range:</span>
      ${['1m','3m','6m','1y','all'].map(r => {
        const labels = {'1m':'1M','3m':'3M','6m':'6M','1y':'1Y','all':'All'};
        const active = (window._cfChartRange || 'all') === r;
        return `<button class="cf-range-btn${active ? ' active' : ''}" data-range="${r}" onclick="setCfChartRange('${r}')">${labels[r]}</button>`;
      }).join('')}
    </div>

    <div class="cf-charts-row">
      <div class="cf-chart-card">
        <div class="cf-chart-title">📈 Bank Balance</div>
        <canvas id="cfBallantineBankChart" height="110"></canvas>
      </div>
      <div class="cf-chart-card">
        <div class="cf-chart-title">🧾 AR Outstanding</div>
        <canvas id="cfBallantineArChart" height="110"></canvas>
      </div>
    </div>

    <div class="cf-table-card" style="margin-top:20px">
      <div class="cf-table-title">Recent Entries — Ballantine</div>
      ${recent.length === 0 ? '<div class="cf-empty">No entries yet. Click “+ Add / Edit Entry” to log the first day.</div>' : `
      <div style="overflow-x:auto">
        <table class="cf-table">
          <thead>
            <tr><th>Date</th><th>Bank Balance</th><th>AR Outstanding</th><th></th></tr>
          </thead>
          <tbody>
            ${recent.map(e => `<tr>
                <td>${_cfFmtDate(e.entryDate)}</td>
                <td title="${e.bankBalance != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.bankBalance != null ? fmt$(e.bankBalance) : (e.carriedBankBalance != null ? fmt$(e.carriedBankBalance) + ' *' : '—')}</td>
                <td title="${e.arOutstanding != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.arOutstanding != null ? fmt$(e.arOutstanding) : (e.carriedArOutstanding != null ? fmt$(e.carriedArOutstanding) + ' *' : '—')}</td>
                <td><button class="cf-row-edit-btn" onclick="openBallantineEntryModal('${e.id}')">Edit</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="cf-modal-note" style="margin-top:10px">* Value carried forward from the last day it was actually entered — that day's row didn't include a fresh reading.</div>`}
    </div>
  `;
}

// ── Chart time-range filter ───────────────────────────────────────────────
// Charts plot every entry with no cap by default, which is fine at a few
// dozen points but turns into an unreadable smear after a year of daily
// entries. This trims to a trailing window (relative to the most recent
// entry, not today, so it still works mid-backfill) without touching the
// KPI cards or the Recent Entries table — those stay based on the full
// dataset regardless of chart zoom.
function _cfFilterByRange(sortedEntries, range) {
  if (range === 'all' || !sortedEntries.length) return sortedEntries;
  const days = { '1m': 30, '3m': 90, '6m': 182, '1y': 365 }[range];
  if (!days) return sortedEntries;
  const latest = new Date(sortedEntries[sortedEntries.length - 1].entryDate + 'T00:00:00');
  const cutoff = new Date(latest); cutoff.setDate(cutoff.getDate() - days);
  return sortedEntries.filter(e => new Date(e.entryDate + 'T00:00:00') >= cutoff);
}

// Swaps the active range and redraws just the three charts — cheap enough
// to skip a full renderCashFlowPanel() re-render, so KPI cards and the
// entries table don't flicker when someone's just zooming the charts.
function setCfChartRange(range) {
  window._cfChartRange = range;
  document.querySelectorAll('.cf-range-btn[data-range]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  if ((window._cfActiveCompany || 'nulabs') === 'ballantine') {
    _cfDrawBallantineCharts(_cfFilterByRange(_cfBallantineSortedWithCarry(), range));
  } else {
    _cfDrawCharts(_cfFilterByRange(_cfSortedWithTotal(), range));
  }
}

// Swaps which line the Bank Balance chart plots — TD Bank alone, Schwab
// alone (carried forward), or the combined total (default — same number
// shown on the KPI card). Only touches that one chart; the range selector
// and the other two charts are untouched.
function setCfBankSeries(series) {
  window._cfBankSeries = series;
  document.querySelectorAll('[data-series]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.series === series);
  });
  _cfDrawCharts(_cfFilterByRange(_cfSortedWithTotal(), window._cfChartRange || 'all'));
}

function _cfFmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function _cfDaysBetween(isoStart, isoEnd) {
  return Math.round((new Date(isoEnd + 'T00:00:00') - new Date(isoStart + 'T00:00:00')) / 86400000);
}

// Trailing 7-entry moving average — same "last 7 entries" convention as the
// Net Cash Flow — Trailing 7 KPI card, so it reads consistently whether
// entries are the old weekly backfill or daily going forward. Skips
// null values rather than treating them as $0. Shared across every chart
// that plots a trend line (Bank Balance, Schwab, and Daily Net Cash Flow).
function _cfMovingAvg(data) {
  return data.map((_, i) => {
    const start = Math.max(0, i - 6);
    const slice = data.slice(start, i + 1).filter(v => v != null);
    if (!slice.length) return null;
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

function _cfDrawCharts(sorted) {
  if (typeof Chart === 'undefined') return;
  const labels = sorted.map(e => _cfFmtDate(e.entryDate));

  const bankCanv = document.getElementById('cfBankBalanceChart');
  if (bankCanv) {
    const existing = Chart.getChart(bankCanv);
    if (existing) existing.destroy();
    // Which line to plot — TD Bank (default) or Schwab (carried forward).
    // No combined "Both" option anymore: TD and Schwab are separate
    // accounts that are no longer transferred back and forth, so a summed
    // line doesn't represent anything real going forward.
    const bankSeries = window._cfBankSeries || 'td';
    const bankDatasets = [];
    if (bankSeries === 'td') {
      // Carried-forward value — a day that only updated Schwab or Held for
      // Owners shouldn't drop TD Bank's line to null/zero on the chart.
      const tdData = sorted.map(e => e.carriedBankBalance);
      bankDatasets.push(
        { label: 'TD Bank', data: tdData, borderColor: '#5b9cf6', backgroundColor: 'rgba(91,156,246,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, spanGaps: true, order: 1 },
        { label: 'Trailing 7-Entry Avg', data: _cfMovingAvg(tdData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
      );
    } else if (bankSeries === 'schwab') {
      // Carried-forward value, not the raw per-entry reading — see
      // _cfCarriedSchwab() — so the line stays flat between actual readings
      // instead of dropping to $0/null on days Russ didn't pull a number.
      const schwabData = sorted.map(e => e.carriedSchwab);
      bankDatasets.push(
        { label: 'Schwab', data: schwabData, borderColor: '#2fae8f', backgroundColor: 'rgba(47,174,143,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, spanGaps: true, order: 1 },
        { label: 'Trailing 7-Entry Avg', data: _cfMovingAvg(schwabData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
      );
    }
    new Chart(bankCanv, {
      type: 'line',
      data: {
        labels,
        datasets: bankDatasets,
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true, position: 'top', align: 'end',
            labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 12, boxHeight: 8, padding: 8 },
          },
        },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y: { ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(0,0,0,0.08)' } },
        },
      },
    });
  }

  const netCanv = document.getElementById('cfNetFlowChart');
  if (netCanv) {
    const existing = Chart.getChart(netCanv);
    if (existing) existing.destroy();
    const netData = sorted.map(e => e.netFlow);
    // Floor the axis range at $100 so a stretch of all-null/near-$0 entries
    // (e.g. the backfilled historical weeks, which have no day-over-day
    // comparison point) doesn't leave Chart.js to invent a sub-$1
    // auto-scaled range — that produced fractional ticks that rounded to
    // confusing repeated "$1" labels. Real daily entries with actual
    // movement make this a non-issue.
    // Bar-to-bar noise is expected — a $28k deposit day next to a $10k draw
    // day doesn't mean anything is wrong. The trailing 7-entry average
    // (same convention as the Bank Balance chart) is the line to actually
    // watch: trending up means cash is building faster than it's going out;
    // trending down or hovering below $0 means the reverse, even while
    // individual days bounce around it.
    const netTrendData = _cfMovingAvg(netData);
    const maxAbsNet = Math.max(100, ...netData.map(v => Math.abs(v || 0)), ...netTrendData.map(v => Math.abs(v || 0)));
    new Chart(netCanv, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Net Cash Flow',
            data: netData,
            backgroundColor: netData.map(v => v == null ? 'rgba(150,150,150,0.25)' : v >= 0 ? 'rgba(76,175,125,0.7)' : 'rgba(224,92,92,0.7)'),
            borderColor: netData.map(v => v == null ? 'rgba(150,150,150,0.5)' : v >= 0 ? '#4caf7d' : '#e05c5c'),
            borderWidth: 1, borderRadius: 4, order: 1,
          },
          {
            type: 'line',
            label: 'Trailing 7-Entry Avg',
            data: netTrendData,
            borderColor: '#c07a1a', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4,
            fill: false, tension: 0.3, spanGaps: true, order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true, position: 'top', align: 'end',
            labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 12, boxHeight: 8, padding: 8 },
          },
          tooltip: { callbacks: { label: ctx => ctx.parsed.y == null ? ' No prior entry to compare' : ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y >= 0 ? '+' : '') + '$' + ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 0 }) } },
        },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y: {
            beginAtZero: true, suggestedMin: -maxAbsNet, suggestedMax: maxAbsNet,
            ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => (v < 0 ? '(' : '') + '$' + Math.abs(v >= 1000 || v <= -1000 ? v / 1000 : v).toFixed(0) + (Math.abs(v) >= 1000 ? 'k' : '') + (v < 0 ? ')' : '') },
            grid: { color: 'rgba(0,0,0,0.08)' },
          },
        },
      },
    });
  }

  const arCanv = document.getElementById('cfArDsoChart');
  if (arCanv) {
    const existing = Chart.getChart(arCanv);
    if (existing) existing.destroy();
    // Compute a rolling DSO series so the trend line has more than one point.
    // Uses the same auto-pulled billed-revenue proration as cfDSO() above.
    // Both AR and DSO use the carried-forward AR figure — a day that only
    // updated Schwab or Held for Owners shouldn't make AR (and therefore
    // DSO) look like it vanished.
    const dsoSeries = sorted.map(e => {
      if (e.carriedArOutstanding == null) return null;
      const avgDaily = _cfTrailingSalesInvoiced(e.entryDate) / 30;
      return avgDaily ? e.carriedArOutstanding / avgDaily : null;
    });
    new Chart(arCanv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'AR Outstanding', yAxisID: 'y', data: sorted.map(e => e.carriedArOutstanding), spanGaps: true,
            borderColor: '#e8a234', backgroundColor: 'rgba(232,162,52,0.12)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25,
          },
          {
            label: 'DSO (days)', yAxisID: 'y1', data: dsoSeries,
            borderColor: '#c084fc', borderWidth: 2, pointRadius: 2, borderDash: [5, 4], fill: false, tension: 0.25, spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: 'top', align: 'end', labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 10 } } },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y:  { position: 'left',  ticks: { color: '#e8a234', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y1: { position: 'right', ticks: { color: '#c084fc', font: { size: 10 }, callback: v => v + 'd' }, grid: { display: false } },
        },
      },
    });
  }
}

// Ballantine's own Bank Balance and AR Outstanding charts — same trend-line
// treatment as NULabs' charts, just no DSO axis (no invoice data to compute
// it from) and no TD/Schwab series toggle (there's only one balance here).
function _cfDrawBallantineCharts(sorted) {
  if (typeof Chart === 'undefined') return;
  const labels = sorted.map(e => _cfFmtDate(e.entryDate));

  const bankCanv = document.getElementById('cfBallantineBankChart');
  if (bankCanv) {
    const existing = Chart.getChart(bankCanv);
    if (existing) existing.destroy();
    const bankData = sorted.map(e => e.carriedBankBalance);
    new Chart(bankCanv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Bank Balance', data: bankData, borderColor: '#5b9cf6', backgroundColor: 'rgba(91,156,246,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, spanGaps: true, order: 1 },
          { label: 'Trailing 7-Entry Avg', data: _cfMovingAvg(bankData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 12, boxHeight: 8, padding: 8 } },
        },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y: { ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(0,0,0,0.08)' } },
        },
      },
    });
  }

  const arCanv = document.getElementById('cfBallantineArChart');
  if (arCanv) {
    const existing = Chart.getChart(arCanv);
    if (existing) existing.destroy();
    const arData = sorted.map(e => e.carriedArOutstanding);
    new Chart(arCanv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'AR Outstanding', data: arData, borderColor: '#e8a234', backgroundColor: 'rgba(232,162,52,0.12)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, spanGaps: true, order: 1 },
          { label: 'Trailing 7-Entry Avg', data: _cfMovingAvg(arData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 12, boxHeight: 8, padding: 8 } },
        },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(0,0,0,0.08)' } },
          y: { ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(0,0,0,0.08)' } },
        },
      },
    });
  }
}

// ── Entry modal (add / edit) ──────────────────────────────────────────────
function _cfEnsureModal() {
  if (document.getElementById('cfEntryModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-backdrop" id="cfEntryModal" onclick="if(event.target===this)closeCashFlowEntryModal()">
      <div class="modal" style="width:480px;max-width:94vw">
        <div class="modal-header">
          <div class="modal-title" id="cfEntryModalTitle">Cash Flow Entry</div>
          <button class="modal-close" onclick="closeCashFlowEntryModal()">&#x2715;</button>
        </div>
        <div class="modal-body">
          <div class="field" style="margin-bottom:14px">
            <label class="field-label">Date <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="cfEntryDate" type="date" style="color-scheme:dark" onchange="_cfLoadExistingForDate()" />
          </div>
          <div class="field-row" style="display:flex;gap:12px;margin-bottom:14px">
            <div class="field" style="flex:1">
              <label class="field-label">TD Bank Balance</label>
              <input class="f-input" id="cfEntryBankBalance" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div class="field" style="flex:1">
              <label class="field-label">Charles Schwab Balance</label>
              <input class="f-input" id="cfEntrySchwab" type="number" step="0.01" placeholder="Leave blank if unchanged" />
            </div>
          </div>
          <div class="field-row" style="display:flex;gap:12px;margin-bottom:14px">
            <div class="field" style="flex:1">
              <label class="field-label">Held for Rental Owners</label>
              <input class="f-input" id="cfEntryHeldForOwners" type="number" step="0.01" placeholder="Leave blank if unchanged" />
            </div>
            <div class="field" style="flex:1">
              <label class="field-label">AR Outstanding</label>
              <input class="f-input" id="cfEntryAr" type="number" step="0.01" placeholder="0.00" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Notes</label>
            <input class="f-input" id="cfEntryNotes" type="text" placeholder="Optional notes…" autocomplete="off" />
          </div>
          <div class="cf-modal-note">DSO is calculated automatically from Workspace's billed revenue, and Net Cash Flow is calculated automatically from the change in Available Cash — no need to enter sales, deposits, or bill payments here. Schwab and Held for Rental Owners only need a new number on the days they actually change — leave them blank and the last known value carries forward automatically. Held for Rental Owners is a running total of rental cash sitting in the bank that's already earmarked for owner distributions — raise it when a rental deposit comes in, lower it when the distribution goes out.</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cfEntryDeleteBtn" onclick="deleteCashFlowEntryFromModal()" style="margin-right:auto;display:none;color:var(--red)">&#x1F5D1; Delete</button>
          <button class="btn btn-ghost" onclick="closeCashFlowEntryModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveCashFlowEntryFromModal()">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div.firstElementChild);
}

function openCashFlowEntryModal(entryId) {
  _cfEnsureModal();
  const modal = document.getElementById('cfEntryModal');
  const dateInput = document.getElementById('cfEntryDate');
  const delBtn = document.getElementById('cfEntryDeleteBtn');
  _cfEditingEntryId = entryId || null;

  const entry = entryId ? cashFlowEntries.find(e => e.id === entryId) : null;

  document.getElementById('cfEntryModalTitle').textContent = entry ? 'Edit Cash Flow Entry' : 'New Cash Flow Entry';
  dateInput.value = entry ? entry.entryDate : new Date().toISOString().slice(0, 10);
  document.getElementById('cfEntryBankBalance').value   = entry && entry.bankBalance   != null ? entry.bankBalance   : '';
  document.getElementById('cfEntrySchwab').value          = entry && entry.schwabBalance != null ? entry.schwabBalance : '';
  document.getElementById('cfEntryHeldForOwners').value   = entry && entry.heldForOwners != null ? entry.heldForOwners : '';
  document.getElementById('cfEntryAr').value             = entry && entry.arOutstanding != null ? entry.arOutstanding : '';
  document.getElementById('cfEntryNotes').value           = entry ? entry.notes         : '';
  delBtn.style.display = entry ? '' : 'none';

  modal.classList.add('open');
  modal.style.display = 'flex';
}

function closeCashFlowEntryModal() {
  const modal = document.getElementById('cfEntryModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = 'none';
  _cfEditingEntryId = null;
}

// If the user picks a date that already has an entry, load it for editing
// instead of silently overwriting it on save.
function _cfLoadExistingForDate() {
  const dateInput = document.getElementById('cfEntryDate');
  const existing = cashFlowEntries.find(e => e.entryDate === dateInput.value);
  if (existing && existing.id !== _cfEditingEntryId) {
    openCashFlowEntryModal(existing.id);
  }
}

async function saveCashFlowEntryFromModal() {
  const entryDate = document.getElementById('cfEntryDate').value;
  if (!entryDate) { if (typeof toast === 'function') toast('⚠ Date is required'); return; }

  const num = id => {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseFloat(v);
  };

  // Schwab: blank means "no new reading" for a brand-new day (carried
  // forward at display time). But if we're editing a day that already had a
  // Schwab reading saved and the field is cleared, that's ambiguous — most
  // likely the user just didn't touch it (the placeholder says "leave blank
  // if unchanged"), so preserve the existing value rather than silently
  // deleting a real reading. To actually blank out a previously-entered
  // Schwab reading, delete the whole entry and re-add it.
  // Same "preserve on blank" logic for Held for Rental Owners — it's a
  // running balance Linda only touches on the days it actually changes.
  const existingEntry = _cfEditingEntryId ? cashFlowEntries.find(e => e.id === _cfEditingEntryId) : null;
  const schwabInput = num('cfEntrySchwab');
  const schwabBalance = schwabInput != null ? schwabInput : (existingEntry ? existingEntry.schwabBalance : null);
  const heldInput = num('cfEntryHeldForOwners');
  const heldForOwners = heldInput != null ? heldInput : (existingEntry ? existingEntry.heldForOwners : null);

  const entry = {
    entryDate,
    bankBalance:   num('cfEntryBankBalance'),
    schwabBalance, // null = "no new reading" — carried forward, not treated as $0
    heldForOwners, // null = "no change" — carried forward, not treated as $0
    deposits:      0, // no longer hand-entered — Net Cash Flow is derived from the change in Available Cash instead (see _cfSortedWithTotal)
    billPayments:  0, // same — kept as 0 only because the DB column is NOT NULL; unused by any calculation now
    arOutstanding: num('cfEntryAr'),
    notes:         document.getElementById('cfEntryNotes').value.trim(),
  };

  const saved = await upsertCashFlowEntry(entry);
  if (!saved) return;

  await loadCashFlowEntries(true);
  closeCashFlowEntryModal();
  renderCashFlowPanel();
  if (typeof toast === 'function') toast('✓ Cash flow entry saved');
}

async function deleteCashFlowEntryFromModal() {
  if (!_cfEditingEntryId) return;
  if (!confirm('Delete this cash flow entry?')) return;
  const ok = await deleteCashFlowEntryById(_cfEditingEntryId);
  if (!ok) return;
  await loadCashFlowEntries(true);
  closeCashFlowEntryModal();
  renderCashFlowPanel();
  if (typeof toast === 'function') toast('✓ Entry deleted');
}

// ── Ballantine entry modal (add / edit) ─────────────────────────────────
// Deliberately its own modal rather than reusing the NULabs one — different
// fields entirely (just Bank Balance, AR Outstanding, Notes), and keeping
// them separate avoids any chance of a save from one modal touching the
// other company's table.
function _cfEnsureBallantineModal() {
  if (document.getElementById('cfBallantineModal')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="modal-backdrop" id="cfBallantineModal" onclick="if(event.target===this)closeBallantineEntryModal()">
      <div class="modal" style="width:440px;max-width:94vw">
        <div class="modal-header">
          <div class="modal-title" id="cfBallantineModalTitle">Ballantine Cash Flow Entry</div>
          <button class="modal-close" onclick="closeBallantineEntryModal()">&#x2715;</button>
        </div>
        <div class="modal-body">
          <div class="field" style="margin-bottom:14px">
            <label class="field-label">Date <span style="color:var(--red)">*</span></label>
            <input class="f-input" id="cfBallantineDate" type="date" style="color-scheme:dark" onchange="_cfLoadExistingBallantineForDate()" />
          </div>
          <div class="field-row" style="display:flex;gap:12px;margin-bottom:14px">
            <div class="field" style="flex:1">
              <label class="field-label">Bank Balance</label>
              <input class="f-input" id="cfBallantineBankBalance" type="number" step="0.01" placeholder="Leave blank if unchanged" />
            </div>
            <div class="field" style="flex:1">
              <label class="field-label">AR Outstanding</label>
              <input class="f-input" id="cfBallantineAr" type="number" step="0.01" placeholder="Leave blank if unchanged" />
            </div>
          </div>
          <div class="field">
            <label class="field-label">Notes</label>
            <input class="f-input" id="cfBallantineNotes" type="text" placeholder="Optional notes…" autocomplete="off" />
          </div>
          <div class="cf-modal-note">Ballantine doesn't invoice through any system Workspace can read, so there's no DSO here — just Bank Balance and AR Outstanding. Both only need a new number on the days they actually change — leave a field blank and the last known value carries forward automatically.</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cfBallantineDeleteBtn" onclick="deleteBallantineEntryFromModal()" style="margin-right:auto;display:none;color:var(--red)">&#x1F5D1; Delete</button>
          <button class="btn btn-ghost" onclick="closeBallantineEntryModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveBallantineEntryFromModal()">Save</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(div.firstElementChild);
}

function openBallantineEntryModal(entryId) {
  _cfEnsureBallantineModal();
  const modal = document.getElementById('cfBallantineModal');
  const dateInput = document.getElementById('cfBallantineDate');
  const delBtn = document.getElementById('cfBallantineDeleteBtn');
  _cfEditingBallantineId = entryId || null;

  const entry = entryId ? ballantineEntries.find(e => e.id === entryId) : null;

  document.getElementById('cfBallantineModalTitle').textContent = entry ? 'Edit Ballantine Entry' : 'New Ballantine Entry';
  dateInput.value = entry ? entry.entryDate : new Date().toISOString().slice(0, 10);
  document.getElementById('cfBallantineBankBalance').value = entry && entry.bankBalance != null ? entry.bankBalance : '';
  document.getElementById('cfBallantineAr').value          = entry && entry.arOutstanding != null ? entry.arOutstanding : '';
  document.getElementById('cfBallantineNotes').value       = entry ? entry.notes : '';
  delBtn.style.display = entry ? '' : 'none';

  modal.classList.add('open');
  modal.style.display = 'flex';
}

function closeBallantineEntryModal() {
  const modal = document.getElementById('cfBallantineModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.style.display = 'none';
  _cfEditingBallantineId = null;
}

// Same "don't silently overwrite an existing day" protection as the NULabs
// modal — picking a date that already has a Ballantine entry loads it for
// editing instead of leaving the modal in "new entry" mode.
function _cfLoadExistingBallantineForDate() {
  const dateInput = document.getElementById('cfBallantineDate');
  const existing = ballantineEntries.find(e => e.entryDate === dateInput.value);
  if (existing && existing.id !== _cfEditingBallantineId) {
    openBallantineEntryModal(existing.id);
  }
}

async function saveBallantineEntryFromModal() {
  const entryDate = document.getElementById('cfBallantineDate').value;
  if (!entryDate) { if (typeof toast === 'function') toast('⚠ Date is required'); return; }

  const num = id => {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseFloat(v);
  };

  // Same "preserve on blank" logic as Schwab/Held for Owners on the NULabs
  // side — a blank field when editing an existing day means "unchanged,"
  // not "clear this," so it's pulled from the existing row rather than
  // written as null.
  const existingEntry = _cfEditingBallantineId ? ballantineEntries.find(e => e.id === _cfEditingBallantineId) : null;
  const bankInput = num('cfBallantineBankBalance');
  const bankBalance = bankInput != null ? bankInput : (existingEntry ? existingEntry.bankBalance : null);
  const arInput = num('cfBallantineAr');
  const arOutstanding = arInput != null ? arInput : (existingEntry ? existingEntry.arOutstanding : null);

  const entry = {
    entryDate,
    bankBalance,
    arOutstanding,
    notes: document.getElementById('cfBallantineNotes').value.trim(),
  };

  const saved = await upsertBallantineEntry(entry);
  if (!saved) return;

  await loadBallantineEntries(true);
  closeBallantineEntryModal();
  renderCashFlowPanel();
  if (typeof toast === 'function') toast('✓ Ballantine entry saved');
}

async function deleteBallantineEntryFromModal() {
  if (!_cfEditingBallantineId) return;
  if (!confirm('Delete this Ballantine entry?')) return;
  const ok = await deleteBallantineEntryById(_cfEditingBallantineId);
  if (!ok) return;
  await loadBallantineEntries(true);
  closeBallantineEntryModal();
  renderCashFlowPanel();
  if (typeof toast === 'function') toast('✓ Entry deleted');
}
