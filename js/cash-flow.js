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

let cashFlowEntries      = []; // [{id, entryDate, bankBalance, deposits, billPayments, arOutstanding, salesInvoiced, notes, createdBy}]
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

  const latest   = cfLatestEntry();
  const fmt$     = n => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDays  = n => n == null ? '—' : n.toFixed(1) + ' days';

  const bankBalance   = latest ? latest.bankBalance : null;
  const netToday       = latest ? cfNetFlow(latest) : null;
  const netTrailing7   = cashFlowEntries.length ? cfTrailing7NetFlow() : null;
  const arOutstanding  = latest ? latest.arOutstanding : null;
  const dso            = cfDSO();

  const netTodayColor  = netToday   == null ? 'var(--muted)' : netToday   >= 0 ? 'var(--green)' : 'var(--red)';
  const net7Color      = netTrailing7 == null ? 'var(--muted)' : netTrailing7 >= 0 ? 'var(--green)' : 'var(--red)';

  const sorted = _cfSorted();
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

    <div class="cf-charts-row">
      <div class="cf-chart-card">
        <div class="cf-chart-title">📈 Bank Balance</div>
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
              <th>Date</th><th>Bank Balance</th><th>Deposits</th><th>Bill Payments</th>
              <th>Net</th><th>AR Outstanding</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(e => {
              const net = cfNetFlow(e);
              return `<tr>
                <td>${_cfFmtDate(e.entryDate)}</td>
                <td>${fmt$(e.bankBalance)}</td>
                <td>${fmt$(e.deposits)}</td>
                <td>${fmt$(e.billPayments)}</td>
                <td style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">${(net >= 0 ? '+' : '') + fmt$(net)}</td>
                <td>${fmt$(e.arOutstanding)}</td>
                <td><button class="cf-row-edit-btn" onclick="openCashFlowEntryModal('${e.id}')">Edit</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  `;

  setTimeout(() => _cfDrawCharts(sorted), 60);
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
    new Chart(bankCanv, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Bank Balance',
          data: sorted.map(e => e.bankBalance),
          borderColor: '#5b9cf6',
          backgroundColor: 'rgba(91,156,246,0.15)',
          borderWidth: 2, pointRadius: 2, fill: true, tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 8 }, grid: { display: false } },
          y: {
            beginAtZero: true, suggestedMin: -maxAbsNet, suggestedMax: maxAbsNet,
            ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => (v < 0 ? '(' : '') + '$' + Math.abs(v >= 1000 || v <= -1000 ? v / 1000 : v).toFixed(0) + (Math.abs(v) >= 1000 ? 'k' : '') + (v < 0 ? ')' : '') },
            grid: { color: 'rgba(255,255,255,0.05)' },
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
          x: { ticks: { color: '#9a9aaa', font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } },
          y:  { position: 'left',  ticks: { color: '#e8a234', font: { size: 10 }, callback: v => v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v }, grid: { color: 'rgba(255,255,255,0.05)' } },
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
              <label class="field-label">Bank Balance</label>
              <input class="f-input" id="cfEntryBankBalance" type="number" step="0.01" placeholder="0.00" />
            </div>
            <div class="field" style="flex:1">
              <label class="field-label">AR Outstanding</label>
              <input class="f-input" id="cfEntryAr" type="number" step="0.01" placeholder="0.00" />
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
          <div class="field">
            <label class="field-label">Notes</label>
            <input class="f-input" id="cfEntryNotes" type="text" placeholder="Optional notes…" autocomplete="off" />
          </div>
          <div class="cf-modal-note">DSO is calculated automatically from Workspace's billed revenue — no need to enter sales here.</div>
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

  const entry = {
    entryDate,
    bankBalance:   num('cfEntryBankBalance'),
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
