// ===== QUOTES PANEL =====
let quotesData      = [];
let quotesSortCol   = 'created_at';
let quotesSortDir   = 'desc';
let quotesLoaded    = false;
let quotesSearchVal = '';
let _resolvedCols   = [];

// ── Fixed column order with candidate field names ────────────────────────
const QUOTE_COLS = [
  { label: 'Opportunity', candidates: ['opportunity', 'opportunity_name', 'name', 'title', 'subject'], clickable: true },
  { label: 'Rev',         candidates: ['revenue', 'rev', 'expected_revenue', 'projected_revenue'],     money: true  },
  { label: 'Client',      candidates: ['client', 'client_name', 'customer', 'company', 'account']                   },
  { label: 'Created',     candidates: ['created_at', 'created', 'date', 'issue_date'],                 date: true   },
  { label: 'RFQ',         candidates: ['rfq', 'rfq_number', 'rfq_no', 'rfq_date']                                   },
  { label: 'Total',       candidates: ['total', 'amount', 'total_amount', 'quote_total', 'price'],     money: true  },
  { label: 'Stage',       candidates: ['stage', 'status', 'phase'],                                    badge: true  },
  { label: 'Job Number',  candidates: ['job_number', 'job_no', 'job_num', 'job', 'project_number']                  },
  { label: 'PO Number',   candidates: ['po_number', 'po_no', 'po', 'purchase_order']                                },
  { label: 'Won Date',    candidates: ['won_date', 'won_at', 'close_date', 'closed_at', 'award_date'], date: true   },
];

function resolveQuoteCols(rows) {
  if (!rows || !rows.length) { _resolvedCols = []; return; }
  const avail = new Set(Object.keys(rows[0]));
  _resolvedCols = QUOTE_COLS.map(def => {
    const key = def.candidates.find(c => avail.has(c));
    return key ? { ...def, key } : null;
  }).filter(Boolean);
}

// ── Stage badges ─────────────────────────────────────────────────────────
const STAGE_MAP = {
  draft:       { label: 'Draft',       color: '#7a7a85', bg: 'rgba(122,122,133,0.12)' },
  sent:        { label: 'Sent',        color: '#e8a234', bg: 'rgba(232,162,52,0.12)'  },
  quoted:      { label: 'Quoted',      color: '#e8a234', bg: 'rgba(232,162,52,0.12)'  },
  pending:     { label: 'Pending',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  approved:    { label: 'Approved',    color: '#4caf7d', bg: 'rgba(76,175,125,0.12)'  },
  won:         { label: 'Won',         color: '#4caf7d', bg: 'rgba(76,175,125,0.12)'  },
  closed_won:  { label: 'Won',         color: '#4caf7d', bg: 'rgba(76,175,125,0.12)'  },
  lost:        { label: 'Lost',        color: '#e05c5c', bg: 'rgba(224,92,92,0.12)'   },
  rejected:    { label: 'Rejected',    color: '#e05c5c', bg: 'rgba(224,92,92,0.12)'   },
  closed_lost: { label: 'Lost',        color: '#e05c5c', bg: 'rgba(224,92,92,0.12)'   },
  expired:     { label: 'Expired',     color: '#7a7a85', bg: 'rgba(122,122,133,0.12)' },
  negotiation: { label: 'Negotiation', color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  in_progress: { label: 'In Progress', color: '#5b9cf6', bg: 'rgba(91,156,246,0.12)'  },
};

function stageBadge(val) {
  if (!val) return '<span style="color:var(--muted)">—</span>';
  const key = String(val).toLowerCase().replace(/[\s-]+/g, '_');
  const s = STAGE_MAP[key] || { label: val, color: '#7a7a85', bg: 'rgba(122,122,133,0.12)' };
  return `<span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color};border:1px solid ${s.color}44;white-space:nowrap">${s.label}</span>`;
}

// ── Formatters ───────────────────────────────────────────────────────────
function fmtMoney(val) {
  const n = parseFloat(val);
  return isNaN(n) ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Cell renderer ────────────────────────────────────────────────────────
function quoteCell(col, val, origIdx) {
  const empty = val === null || val === undefined || val === '';
  if (col.clickable) {
    const txt = empty ? '(unnamed)' : String(val);
    return `<span onclick="openQuoteDetail(${origIdx})" style="color:var(--amber);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--amber-dim)">${txt}</span>`;
  }
  if (empty) return '<span style="color:var(--muted)">—</span>';
  if (col.badge) return stageBadge(val);
  if (col.money) return `<span style="font-family:'JetBrains Mono',monospace;font-size:12px">${fmtMoney(val)}</span>`;
  if (col.date)  return `<span style="font-size:12px;color:var(--muted)">${fmtDate(val)}</span>`;
  const str = String(val);
  return str.length > 42 ? `<span title="${str.replace(/"/g,'&quot;')}">${str.slice(0,40)}…</span>` : str;
}

// ── Open / load ──────────────────────────────────────────────────────────
async function openQuotesPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navQuotes'))?.classList.add('active');
  document.getElementById('topbarName').textContent = 'Quotes';
  showProjectView('panel-quotes');
  if (!quotesLoaded) { await loadQuotes(); quotesLoaded = true; }
  renderQuotesPanel();
}

async function loadQuotes() {
  if (!sb) return;
  quotesData = await dbFetch('quotes', '*');
  resolveQuoteCols(quotesData);
}

async function refreshQuotes() {
  quotesLoaded = false;
  await loadQuotes();
  quotesLoaded = true;
  renderQuotesPanel();
  toast('Quotes refreshed');
}

function quotesSortBy(key) {
  quotesSortDir = quotesSortCol === key && quotesSortDir === 'asc' ? 'desc' : 'asc';
  quotesSortCol = key;
  renderQuotesPanel();
}

// ── Render panel ─────────────────────────────────────────────────────────
function renderQuotesPanel() {
  const container = document.getElementById('quotesTableContainer');
  const subEl     = document.getElementById('quotesSub');
  if (!container) return;

  const search = quotesSearchVal.trim().toLowerCase();
  let rows = search
    ? quotesData.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search)))
    : quotesData;

  const moneySort = _resolvedCols.find(c => c.money && c.key === quotesSortCol);
  rows = [...rows].sort((a, b) => {
    let va = a[quotesSortCol] ?? '', vb = b[quotesSortCol] ?? '';
    if (moneySort) { va = parseFloat(va)||0; vb = parseFloat(vb)||0; return quotesSortDir === 'asc' ? va-vb : vb-va; }
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return quotesSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  if (subEl) subEl.textContent = `${rows.length} quote${rows.length !== 1 ? 's' : ''}`;

  if (!rows.length) {
    container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
      <div style="font-size:36px;margin-bottom:12px">📋</div>
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">No quotes found</div>
      <div style="font-size:13px">${search ? 'No results found.' : 'Quotes will appear here once loaded.'}</div>
    </div>`;
    return;
  }

  // Stat bubbles
  const stageCol = _resolvedCols.find(c => c.badge);
  const moneyCol = _resolvedCols.find(c => c.money);
  let bubbles = '';
  if (moneyCol) {
    const grand = quotesData.reduce((s,r) => s + (parseFloat(r[moneyCol.key])||0), 0);
    bubbles += _qBubble('Total Value', fmtMoney(grand), '#5b9cf6', 'rgba(91,156,246,0.08)');
  }
  if (stageCol) {
    const counts = {};
    quotesData.forEach(r => { const k = String(r[stageCol.key]||'unknown').toLowerCase().replace(/[\s-]+/g,'_'); counts[k]=(counts[k]||0)+1; });
    Object.entries(counts).forEach(([k,cnt]) => {
      const m = STAGE_MAP[k] || { label:k, color:'#7a7a85', bg:'rgba(122,122,133,0.08)' };
      bubbles += _qBubble(m.label, cnt, m.color, m.bg);
    });
  }

  // Table
  const arrow = k => quotesSortCol === k ? (quotesSortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const TH = `padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);white-space:nowrap;cursor:pointer;user-select:none;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:2`;
  const TD = c => `padding:9px 12px;font-size:12.5px;border-bottom:1px solid var(--border);vertical-align:middle;${c.money?'text-align:right;':''}`;
  const idxMap = new Map(quotesData.map((r,i) => [r,i]));

  container.innerHTML = `
    ${bubbles ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${bubbles}</div>` : ''}
    <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>${_resolvedCols.map(c=>`<th style="${TH}" onclick="quotesSortBy('${c.key}')">${c.label}${arrow(c.key)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r,i)=>{
          const oi = idxMap.get(r)??i;
          const stripe = i%2!==0?'var(--surface2)':'';
          return `<tr style="${stripe?`background:${stripe};`:''}transition:background .1s" onmouseover="this.style.background='var(--amber-glow)'" onmouseout="this.style.background='${stripe}'">
            ${_resolvedCols.map(c=>`<td style="${TD(c)}">${quoteCell(c,r[c.key],oi)}</td>`).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

function _qBubble(label, value, color, bg) {
  return `<div style="background:${bg};border:1px solid ${color}44;border-radius:10px;padding:10px 16px;min-width:90px;cursor:default">
    <div style="font-size:10px;color:${color};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${label}</div>
    <div style="font-size:22px;font-family:'DM Serif Display',serif;color:var(--text);line-height:1">${value}</div>
  </div>`;
}

// ── Line items renderer ───────────────────────────────────────────────────
function renderLineItems(val) {
  let items;
  try {
    items = typeof val === 'string' ? JSON.parse(val) : val;
  } catch {
    return `<span style="color:var(--muted);font-size:12px">${String(val)}</span>`;
  }
  if (!Array.isArray(items) || !items.length) return '<span style="color:var(--muted)">—</span>';

  // Sort by seq if present
  items = [...items].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  // val = price per item, qty = quantity (default 1)
  const lineTotal = items.reduce((s, i) => s + ((parseFloat(i.val)||0) * (parseFloat(i.qty)||1)), 0);

  const rows = items.map(item => {
    const qty      = parseFloat(item.qty) || 1;
    const price    = parseFloat(item.val) || 0;
    const subtotal = price * qty;
    return `<tr>
      <td style="padding:6px 10px;font-size:12px;color:var(--muted);white-space:nowrap">${item.code || '—'}</td>
      <td style="padding:6px 10px;font-size:12px">${item.label || '—'}</td>
      <td style="padding:6px 10px;font-size:12px;text-align:center;color:var(--muted);white-space:nowrap">${qty}</td>
      <td style="padding:6px 10px;font-size:12px;text-align:right;font-family:'JetBrains Mono',monospace;white-space:nowrap">${fmtMoney(price)}</td>
      <td style="padding:6px 10px;font-size:12px;text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;white-space:nowrap">${fmtMoney(subtotal)}</td>
    </tr>`;
  }).join('');

  return `<table style="width:100%;border-collapse:collapse;margin-top:4px;border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:var(--surface2)">
        <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:left;white-space:nowrap">Code</th>
        <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:left">Description</th>
        <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:center;white-space:nowrap">Qty</th>
        <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:right;white-space:nowrap">Price</th>
        <th style="padding:6px 10px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:right;white-space:nowrap">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:var(--surface2);border-top:1px solid var(--border)">
        <td colspan="4" style="padding:7px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);text-align:right">Total</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:700;text-align:right;font-family:'JetBrains Mono',monospace;color:var(--text);white-space:nowrap">${fmtMoney(lineTotal)}</td>
      </tr>
    </tfoot>
  </table>`;
}

// ── Detail modal ──────────────────────────────────────────────────────────
function openQuoteDetail(idx) {
  const r = quotesData[idx];
  if (!r) return;

  let modal = document.getElementById('quoteDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'quoteDetailModal';
    modal.onclick = e => { if (e.target === modal) closeQuoteDetail(); };
    modal.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px)`;
    document.body.appendChild(modal);
  }

  const oppCol  = _resolvedCols.find(c => c.clickable);
  const oppName = oppCol ? (r[oppCol.key] || '(unnamed)') : 'Quote Detail';

  const fields = Object.entries(r).filter(([k]) => k !== 'id').map(([k, v]) => {
    const col   = _resolvedCols.find(c => c.key === k);
    const label = col ? col.label : k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    let display;
    if (v === null || v === undefined || v === '') display = '<span style="color:var(--muted)">—</span>';
    else if (k === 'line_items') display = renderLineItems(v);
    else if (col?.badge) display = stageBadge(v);
    else if (col?.money) display = `<span style="font-family:'JetBrains Mono',monospace">${fmtMoney(v)}</span>`;
    else if (col?.date || /date|_at|_on/i.test(k)) display = fmtDate(v);
    else if (typeof v === 'boolean') display = v ? 'Yes' : 'No';
    else display = String(v);
    return `<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);align-items:baseline">
      <div style="width:160px;flex-shrink:0;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted)">${label}</div>
      <div style="flex:1;font-size:13px;color:var(--text);word-break:break-word">${display}</div>
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;width:100%;max-width:960px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.4)">
      <div style="padding:20px 24px 16px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--amber);margin-bottom:4px">Quote Detail</div>
          <div style="font-size:18px;font-family:'DM Serif Display',serif;color:var(--text);line-height:1.3;word-break:break-word">${oppName}</div>
        </div>
        <button onclick="closeQuoteDetail()" style="background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;padding:2px 6px;border-radius:6px;line-height:1" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--muted)'">&times;</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:4px 24px 20px">${fields}</div>
    </div>`;

  modal.style.display = 'flex';
  document.addEventListener('keydown', _qEsc);
}

function closeQuoteDetail() {
  const m = document.getElementById('quoteDetailModal');
  if (m) m.style.display = 'none';
  document.removeEventListener('keydown', _qEsc);
}

function _qEsc(e) { if (e.key === 'Escape') closeQuoteDetail(); }
