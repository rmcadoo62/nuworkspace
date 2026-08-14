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

let cashFlowEntries      = []; // [{id, entryDate, bankBalance, schwabBalance, deposits, billPayments, arOutstanding, salesInvoiced, notes, createdBy}]
let cashFlowLoaded       = false;
let cashFlowLoading      = false;
let _cfEditingEntryId    = null; // id of entry currently open in the modal, or null for "new"

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

// "Bank Balance" everywhere in the UI means the combined NULabs total — TD
// Bank + Schwab (carried forward) — since that's the number Russ actually
// tracks day to day. Before any Schwab reading has ever been entered, the
// carried value is null and this just falls back to TD alone.
function _cfTotalBalance(entry, carriedSchwab) {
  if (entry.bankBalance == null && carriedSchwab == null) return null;
  return (entry.bankBalance || 0) + (carriedSchwab || 0);
}

// Sorted entries with Schwab carried forward and the combined total attached
// (as `carriedSchwab` / `totalBalance`), computed once over the FULL history
// so a chart zoomed to "1M" still carries forward a Schwab reading from
// outside that window instead of wrongly showing it as missing. Use this
// (not _cfSorted()) anywhere the UI needs the combined balance.
function _cfSortedWithTotal() {
  const sorted = _cfSorted();
  const carried = _cfCarriedSchwab(sorted);
  return sorted.map((e, i) => Object.assign({}, e, {
    carriedSchwab: carried[i],
    totalBalance: _cfTotalBalance(e, carried[i]),
  }));
}

function cfNetFlow(entry) {
  if (!entry) return 0;
  return (entry.deposits || 0) - (entry.billPayments || 0);
}

function cfTrailing7NetFlow() {
  const sorted = _cfSorted();
  const last7 = sorted.slice(-7);
  return last7.reduce((s, e) => s + cfNetFlow(e), 0);
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
function _cfTrailingSalesInvoiced(asOfDateStr) {
  const data = window.billedMonthlyData || {};
  const asOf = new Date(asOfDateStr + 'T00:00:00');
  const windowStart = new Date(asOf); windowStart.setDate(windowStart.getDate() - 29); // trailing 30 calendar days incl. asOf

  let total = 0;
  let cursor = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
  const asOfMonthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  while (cursor <= asOfMonthStart) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const key = y + '-' + String(m + 1).padStart(2, '0');
    const monthStart = new Date(y, m, 1);
    const monthEnd   = new Date(y, m + 1, 0); // last calendar day of month
    const daysInMonth = monthEnd.getDate();
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
  const latest = cfLatestEntry();
  if (!latest || !latest.arOutstanding) return null;
  const salesSum = _cfTrailingSalesInvoiced(latest.entryDate);
  const avgDailySales = salesSum / 30;
  if (!avgDailySales) return null;
  return latest.arOutstanding / avgDailySales;
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
  await loadCashFlowEntries();
  renderCashFlowPanel();
}

// ── Rendering ────────────────────────────────────────────────────────────
function renderCashFlowPanel() {
  const wrap = document.getElementById('cashFlowWrap');
  if (!wrap) return;

  const sorted = _cfSortedWithTotal();
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  const fmt$     = n => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDays  = n => n == null ? '—' : n.toFixed(1) + ' days';

  const bankBalance   = latest ? latest.totalBalance : null;
  const netToday       = latest ? cfNetFlow(latest) : null;
  const netTrailing7   = cashFlowEntries.length ? cfTrailing7NetFlow() : null;
  const arOutstanding  = latest ? latest.arOutstanding : null;
  const dso            = cfDSO();

  const netTodayColor  = netToday   == null ? 'var(--muted)' : netToday   >= 0 ? 'var(--green)' : 'var(--red)';
  const net7Color      = netTrailing7 == null ? 'var(--muted)' : netTrailing7 >= 0 ? 'var(--green)' : 'var(--red)';

  const recent = sorted.slice(-30).reverse(); // most recent first

  wrap.innerHTML = `
    <div class="cf-header">
      <button class="cf-back-btn" onclick="if(typeof openDashboardPanel==='function')openDashboardPanel(document.getElementById('navDashboard'))">&larr; Back to Dashboard</button>
      <h2 class="cf-title">💵 Cash Flow Tracker</h2>
      <button class="cf-add-btn" onclick="openCashFlowEntryModal()">+ Add / Edit Entry</button>
    </div>

    <div class="cf-kpi-row">
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Bank Balance</div>
        <div class="cf-kpi-value">${fmt$(bankBalance)}</div>
        <div class="cf-kpi-sub">${latest ? 'as of ' + _cfFmtDate(latest.entryDate) : 'No entries yet'}</div>
        <div class="cf-kpi-sub">TD ${fmt$(latest ? latest.bankBalance : null)} + Schwab ${fmt$(latest ? latest.carriedSchwab : null)}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Net Cash Flow — Today</div>
        <div class="cf-kpi-value" style="color:${netTodayColor}">${netToday == null ? '—' : (netToday >= 0 ? '+' : '') + fmt$(netToday)}</div>
        <div class="cf-kpi-sub">${latest ? _cfFmtDate(latest.entryDate) : ''}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">Net Cash Flow — Trailing 7</div>
        <div class="cf-kpi-value" style="color:${net7Color}">${netTrailing7 == null ? '—' : (netTrailing7 >= 0 ? '+' : '') + fmt$(netTrailing7)}</div>
        <div class="cf-kpi-sub">Last ${Math.min(sorted.length, 7)} ${Math.min(sorted.length, 7) === 1 ? 'entry' : 'entries'}</div>
      </div>
      <div class="cf-kpi-card">
        <div class="cf-kpi-label">AR Outstanding</div>
        <div class="cf-kpi-value">${fmt$(arOutstanding)}</div>
        <div class="cf-kpi-sub">${latest ? 'as of ' + _cfFmtDate(latest.entryDate) : ''}</div>
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
          ${['td','schwab','both'].map(s => {
            const labels = {'td':'TD Bank','schwab':'Schwab','both':'Both'};
            const active = (window._cfBankSeries || 'both') === s;
            return `<button class="cf-range-btn${active ? ' active' : ''}" data-series="${s}" onclick="setCfBankSeries('${s}')">${labels[s]}</button>`;
          }).join('')}
        </div>
        <canvas id="cfBankBalanceChart" height="110"></canvas>
      </div>
      <div class="cf-chart-card">
        <div class="cf-chart-title">💧 Daily Net Cash Flow</div>
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
              <th>Date</th><th>TD Bank</th><th>Schwab</th><th>Total Bank Balance</th><th>Deposits</th><th>Bill Payments</th>
              <th>Net</th><th>AR Outstanding</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(e => {
              const net = cfNetFlow(e);
              return `<tr>
                <td>${_cfFmtDate(e.entryDate)}</td>
                <td>${fmt$(e.bankBalance)}</td>
                <td title="${e.schwabBalance != null ? 'Entered this day' : 'Carried forward — no new reading this day'}">${e.schwabBalance != null ? fmt$(e.schwabBalance) : (e.carriedSchwab != null ? fmt$(e.carriedSchwab) + ' *' : '—')}</td>
                <td>${fmt$(e.totalBalance)}</td>
                <td>${fmt$(e.deposits)}</td>
                <td>${fmt$(e.billPayments)}</td>
                <td style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">${(net >= 0 ? '+' : '') + fmt$(net)}</td>
                <td>${fmt$(e.arOutstanding)}</td>
                <td><button class="cf-row-edit-btn" onclick="openCashFlowEntryModal('${e.id}')">Edit</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="cf-modal-note" style="margin-top:10px">* Schwab reading carried forward from the last day it was entered — Russ only updates it when he pulls a new balance, not daily.</div>`}
    </div>
  `;

  setTimeout(() => _cfDrawCharts(_cfFilterByRange(sorted, window._cfChartRange || 'all')), 60);
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
  document.querySelectorAll('.cf-range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  _cfDrawCharts(_cfFilterByRange(_cfSortedWithTotal(), range));
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

function _cfDrawCharts(sorted) {
  if (typeof Chart === 'undefined') return;
  const labels = sorted.map(e => _cfFmtDate(e.entryDate));

  const bankCanv = document.getElementById('cfBankBalanceChart');
  if (bankCanv) {
    const existing = Chart.getChart(bankCanv);
    if (existing) existing.destroy();
    // Which line(s) to plot — TD Bank alone, Schwab alone (carried forward),
    // or the combined total (default — same number as the KPI card and the
    // old pre-Schwab chart, so "Both" reproduces exactly what this chart
    // already showed).
    const bankSeries = window._cfBankSeries || 'both';
    const cfMovingAvg = data => data.map((_, i) => {
      const start = Math.max(0, i - 6);
      const slice = data.slice(start, i + 1).filter(v => v != null);
      if (!slice.length) return null;
      return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
    // Trailing 7-entry moving average — same "last 7 entries" convention as
    // the Net Cash Flow — Trailing 7 KPI card, so it reads consistently
    // whether entries are the old weekly backfill or daily going forward.
    // Skips null balances rather than treating them as $0.
    const bankDatasets = [];
    if (bankSeries === 'both') {
      const bankData = sorted.map(e => e.totalBalance);
      bankDatasets.push(
        { label: 'Bank Balance', data: bankData, borderColor: '#5b9cf6', backgroundColor: 'rgba(91,156,246,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, order: 1 },
        { label: 'Trailing 7-Entry Avg', data: cfMovingAvg(bankData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
      );
    } else if (bankSeries === 'td') {
      const tdData = sorted.map(e => e.bankBalance);
      bankDatasets.push(
        { label: 'TD Bank', data: tdData, borderColor: '#5b9cf6', backgroundColor: 'rgba(91,156,246,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, order: 1 },
        { label: 'Trailing 7-Entry Avg', data: cfMovingAvg(tdData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
      );
    } else if (bankSeries === 'schwab') {
      // Carried-forward value, not the raw per-entry reading — see
      // _cfCarriedSchwab() — so the line stays flat between actual readings
      // instead of dropping to $0/null on days Russ didn't pull a number.
      const schwabData = sorted.map(e => e.carriedSchwab);
      bankDatasets.push(
        { label: 'Schwab', data: schwabData, borderColor: '#2fae8f', backgroundColor: 'rgba(47,174,143,0.15)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25, spanGaps: true, order: 1 },
        { label: 'Trailing 7-Entry Avg', data: cfMovingAvg(schwabData), borderColor: '#c07a1a', backgroundColor: 'rgba(192,122,26,0.15)', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, fill: false, tension: 0.3, spanGaps: true, order: 0 },
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
    const netData = sorted.map(e => cfNetFlow(e));
    // Floor the axis range at $100 so a stretch of all-$0 entries (e.g. the
    // backfilled historical weeks, which have no deposit/payment detail)
    // doesn't leave Chart.js to invent a sub-$1 auto-scaled range — that
    // produced fractional ticks that rounded to confusing repeated "$1"
    // labels. Real daily entries with actual movement make this a non-issue.
    const maxAbsNet = Math.max(100, ...netData.map(v => Math.abs(v || 0)));
    new Chart(netCanv, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Net Cash Flow',
          data: netData,
          backgroundColor: netData.map(v => v >= 0 ? 'rgba(76,175,125,0.7)' : 'rgba(224,92,92,0.7)'),
          borderColor: netData.map(v => v >= 0 ? '#4caf7d' : '#e05c5c'),
          borderWidth: 1, borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + (ctx.parsed.y >= 0 ? '+' : '') + '$' + ctx.parsed.y.toLocaleString('en-US', { maximumFractionDigits: 0 }) } } },
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
    const dsoSeries = sorted.map(e => {
      if (!e.arOutstanding) return null;
      const avgDaily = _cfTrailingSalesInvoiced(e.entryDate) / 30;
      return avgDaily ? e.arOutstanding / avgDaily : null;
    });
    new Chart(arCanv, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'AR Outstanding', yAxisID: 'y', data: sorted.map(e => e.arOutstanding),
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
              <label class="field-label">Deposits</label>
              <input class="f-input" id="cfEntryDeposits" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div class="field" style="flex:1">
              <label class="field-label">Bill Payments</label>
              <input class="f-input" id="cfEntryBillPayments" type="number" step="0.01" placeholder="0.00" />
            </div>
          </div>
          <div class="field" style="margin-bottom:14px">
            <label class="field-label">AR Outstanding</label>
            <input class="f-input" id="cfEntryAr" type="number" step="0.01" placeholder="0.00" />
          </div>
          <div class="field">
            <label class="field-label">Notes</label>
            <input class="f-input" id="cfEntryNotes" type="text" placeholder="Optional notes…" autocomplete="off" />
          </div>
          <div class="cf-modal-note">DSO is calculated automatically from Workspace's billed revenue — no need to enter sales here. Schwab only needs a new number on the days it actually changes — leave it blank and the last known balance carries forward automatically.</div>
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
  document.getElementById('cfEntryAr').value             = entry && entry.arOutstanding != null ? entry.arOutstanding : '';
  document.getElementById('cfEntryDeposits').value       = entry ? entry.deposits      : '';
  document.getElementById('cfEntryBillPayments').value   = entry ? entry.billPayments  : '';
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
  const existingEntry = _cfEditingEntryId ? cashFlowEntries.find(e => e.id === _cfEditingEntryId) : null;
  const schwabInput = num('cfEntrySchwab');
  const schwabBalance = schwabInput != null ? schwabInput : (existingEntry ? existingEntry.schwabBalance : null);

  const entry = {
    entryDate,
    bankBalance:   num('cfEntryBankBalance'),
    schwabBalance, // null = "no new reading" — carried forward, not treated as $0
    deposits:      num('cfEntryDeposits') || 0,
    billPayments:  num('cfEntryBillPayments') || 0,
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
