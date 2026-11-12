// ==============================================================
// js/purchasing.js — Purchase Requests / Purchase Orders (Batch 4, Nov 2026)
// ==============================================================
// One purchase_orders record starts as a PR (PR-YYYY-NNNN) and becomes a PO
// (PO-YYYY-NNNN, assigned by the database on approval). Design and every
// rule: claude/batch4-pr-po-handoff.md. Migration 2026-11-11_batch4_purchasing.sql.
//
// Screens
//   - PR / PO window (modal) ............ openPurchaseWindow(id) / purNewRequest()
//   - My Purchase Requests (My Workspace)  openMyPurchasesPanel()  — your own only
//   - Accounting → Purchases ............. openPurchasesPanel()    — everything
//   - Approvals → Purchase Requests tab ... renderApprovalsPurchasesTab()
//   - LOA → Purchase Request ............. purFromLoaSelection()  — one PR per vendor
//
// Who can do what
//   employees.can_purchase / purchase_limit / purchase_approver_id (employee card)
//   approve_purchases — Approve PRs (never your own: the database refuses)
//   view_purchases    — Accounting → Purchases (all PRs/POs)
//   bill_purchases    — Bill & Close POs (Linda) — bill matching comes in Step 3
//
// The database enforces the rules (numbering, no self-approval, limits,
// priced lines before submit, locked lines after approval, auto-close). This
// file shows the right buttons and reports the database's message when it
// refuses. Writes check the error and reload from the database.
// ==============================================================

let purStore      = [];     // purchase_order_summary rows (the lists)
let purVendors    = [];     // vendors (id, name, status, address, Peachtree id, pricing…)
let purLineTypes  = [];     // vendor_service_types
let _purLoaded    = false;
let _purListMode  = 'mine'; // 'mine' | 'all'
let _purFilter    = { mine: 'open', all: 'waiting' };
let _purInspectDefaulted = false;   // inspect-only users land on Awaiting inspection once
let _purSearch    = '';
let _purWin       = null;   // { po, lines, isNew, editing, removed:Set }

const NU_COMPANY = {
  name: 'NU LABORATORIES, INC.',
  address: '312 Old Allerton Road',
  cityLine: 'Annandale, NJ  08801',
  voice: '(908)713-9300',
  fax: '(908)713-9001',
};
// Prints on POs that have calibration lines (was the "Purchase Order - EMI" form in Peachtree).
const PUR_CAL_INSTRUCTION = ['Reference to NU Labs EMC-WI-004',
  'Calibrate to manufacturers recommended procedure (Type 4A of EMC-WI-004)'];

const PUR_STATUS = {
  draft:            { label: 'Draft',             cls: 'draft' },
  awaiting_quote:   { label: 'Awaiting quote',    cls: 'quote' },
  pending_approval: { label: 'Waiting for approval', cls: 'waiting' },
  approved:         { label: 'Approved — not sent', cls: 'approved' },
  ordered:          { label: 'Ordered',           cls: 'ordered' },
  received:         { label: 'Received',          cls: 'ordered' },
  closed:           { label: 'Closed',            cls: 'closed' },
  rejected:         { label: 'Rejected',          cls: 'rejected' },
  cancelled:        { label: 'Cancelled',         cls: 'closed' },
};
const PUR_OPEN = ['draft', 'awaiting_quote', 'pending_approval', 'approved', 'ordered', 'received', 'rejected'];
const PUR_BASIS = { estimate: 'Estimate', quoted: 'Quoted', actual: 'Actual' };

// ---------- helpers ----------
function pEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function pJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function pToast(m) { if (typeof toast === 'function') toast(m); }
function pErr(what, error) {
  console.error(what, error);
  // Trigger messages are written for people ("Pick a vendor before submitting") — show them as-is.
  const msg = (error && (error.message || error.details)) || 'unknown error';
  pToast('⚠ ' + what + ': ' + msg);
}
function pMoney(n) {
  if (n == null || n === '' || isNaN(n)) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pNum(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pDate(d) {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(x) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function pDateTime(d) {
  if (!d) return '';
  const x = new Date(d);
  return isNaN(x) ? '' : x.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function pCan(cap) { return typeof can === 'function' && can(cap); }
function pMe() { return (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee : null; }
function pEmp(id) { return (typeof employees !== 'undefined' ? employees : []).find(e => e.id === id) || null; }
function pEmpName(id) { return pEmp(id)?.name || ''; }
function pFirst(id) { return (pEmpName(id) || '').split(' ')[0]; }
function pVendor(id) { return purVendors.find(v => v.id === id) || null; }
function pType(id) { return purLineTypes.find(t => t.id === id) || null; }
function pProject(id) { return (typeof projects !== 'undefined' ? projects : []).find(p => p.id === id) || null; }
function pNo(po) { return po ? (po.po_number || po.pr_number || 'New request') : ''; }
function pIsViewOnly() { return typeof isImpersonating === 'function' && isImpersonating(); }
function pCanPurchase() { const me = pMe(); return !!me && me.canPurchase !== false; }
function pCanInspect() { return !pIsViewOnly() && pCan('inspect_purchases'); }
function pCanSeeAll() { return pCan('view_purchases') || pCan('bill_purchases'); }
// The full list is also open to inspectors (to find POs waiting on incoming inspection);
// it does not give them close/cancel rights on other people's POs (_purCanWork).
function pCanList() { return pCanSeeAll() || pCan('inspect_purchases'); }

function pStatusText(po) {
  if (!po) return '';
  if (po.status === 'pending_approval') return po.approver_id ? 'Waiting for ' + (pFirst(po.approver_id) || 'approval') : 'Waiting for approval';
  if (po.status === 'ordered') return po.sent_at ? 'Ordered · sent ' + pDate(po.sent_at).replace(/, \d{4}$/, '') : 'Ordered';
  return PUR_STATUS[po.status]?.label || po.status;
}
function pStatusChip(po) {
  const s = PUR_STATUS[po.status] || { cls: 'draft' };
  return `<span class="pur-chip ${s.cls}">${pEsc(pStatusText(po))}</span>`;
}

// ---------- data ----------
async function purLoadRefs() {
  const [v, t] = await Promise.all([
    sb.from('vendors').select('id,name,nickname,status,address,city,state,zip,phone,account_number,payment_terms,peachtree_vendor_id,pricing').order('name'),
    sb.from('vendor_service_types').select('id,code,name,sort_order,active,is_calibration,gl_account').order('sort_order'),
  ]);
  if (v.error) { pErr('Could not load vendors', v.error); return false; }
  if (t.error) { pErr('Could not load line types', t.error); return false; }
  purVendors = v.data || [];
  purLineTypes = t.data || [];
  return true;
}

async function purLoadList() {
  const me = pMe();
  if (!me) return;
  let q = sb.from('purchase_order_summary').select('*').order('created_at', { ascending: false }).limit(2000);
  if (_purListMode === 'mine') q = q.eq('requester_id', me.id);
  const { data, error } = await q;
  if (error) { pErr('Could not load purchase requests', error); return; }
  purStore = data || [];
  _purLoaded = true;
}

async function purEnsureRefs() {
  if (!purVendors.length || !purLineTypes.length) return purLoadRefs();
  return true;
}

// ---------- panels ----------
function _purShowPanel(panelId, navId, title, el) {
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById(navId))?.classList.add('active');
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = title;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId)?.classList.add('active');
}

async function openMyPurchasesPanel(el) {
  _purShowPanel('panel-mypurchases', 'navMyPurchases', 'My Purchase Requests', el);
  _purListMode = 'mine';
  const body = document.getElementById('myPurchasesBody');
  if (body) body.innerHTML = '<div class="pur-empty">Loading…</div>';
  await purEnsureRefs();
  await purLoadList();
  renderPurchasesList();
}

async function openPurchasesPanel(el) {
  _purShowPanel('panel-purchases', 'navPurchases', 'Purchases', el);
  _purListMode = 'all';
  const body = document.getElementById('purchasesBody');
  if (!pCanList()) { if (body) body.innerHTML = '<div class="pur-empty">Your role does not include View All Purchases.</div>'; return; }
  if (!pCanSeeAll() && !_purInspectDefaulted) { _purFilter.all = 'inspect'; _purInspectDefaulted = true; }
  if (body) body.innerHTML = '<div class="pur-empty">Loading…</div>';
  await purEnsureRefs();
  await purLoadList();
  renderPurchasesList();
}

const PUR_FILTERS = {
  mine: [
    ['open',   'Open',   po => PUR_OPEN.includes(po.status)],
    ['closed', 'Closed', po => ['closed', 'cancelled'].includes(po.status)],
    ['all',    'All',    () => true],
  ],
  all: [
    ['waiting', 'Waiting for approval', po => po.status === 'pending_approval'],
    ['inspect', 'Awaiting inspection', po => ['ordered', 'received'].includes(po.status) && Number(po.open_lines) - Number(po.accepted_lines) > 0],
    ['open',    'Open POs',  po => ['approved', 'ordered', 'received'].includes(po.status)],
    ['tobill',  'To bill',   po => ['ordered', 'received'].includes(po.status) && Number(po.accepted_lines) > 0],
    ['drafts',  'Drafts & quotes', po => ['draft', 'awaiting_quote', 'rejected'].includes(po.status)],
    ['closed',  'Closed',    po => ['closed', 'cancelled'].includes(po.status)],
    ['all',     'All',       () => true],
  ],
};

function _purWhat(po) {
  const n = Number(po.line_count || 0);
  return n === 1 ? '1 line' : n + ' lines';
}

function renderPurchasesList() {
  const mode = _purListMode;
  const body = document.getElementById(mode === 'mine' ? 'myPurchasesBody' : 'purchasesBody');
  if (!body) return;
  const filters = PUR_FILTERS[mode];
  const cur = _purFilter[mode];
  const counts = Object.fromEntries(filters.map(([k, , fn]) => [k, purStore.filter(fn).length]));
  const fn = (filters.find(f => f[0] === cur) || filters[0])[2];
  const s = _purSearch.trim().toLowerCase();
  const rows = purStore.filter(fn).filter(po => !s || [po.pr_number, po.po_number, pVendor(po.vendor_id)?.name,
    pEmpName(po.requester_id), po.vendor_quote_no, po.notes].join(' ').toLowerCase().includes(s));

  const canNew = pCanPurchase() && !pIsViewOnly();
  body.innerHTML = `
    <div class="pur-head">
      <h1 class="pur-title">${mode === 'mine' ? 'My Purchase Requests' : 'Purchases'}</h1>
      ${canNew ? `<button class="emp-add-btn" onclick="purNewRequest()">+ New Purchase Request</button>` : ''}
    </div>
    <div class="pur-sub">${mode === 'mine'
      ? 'Only requests you made. Cal items start from the LOA; use + New for anything else (charged to overhead or a job).'
      : 'Every purchase request and PO. Requests over someone\'s limit wait for their PR Approver.'}</div>
    <div class="pur-toolbar">
      <div class="pur-filters" role="tablist">${filters.map(([k, label]) =>
        `<button role="tab" aria-selected="${k === cur}" class="pur-filter ${k === cur ? 'on' : ''}" onclick="_purSetFilter('${k}')">${label}${k !== 'all' ? ' (' + counts[k] + ')' : ''}</button>`).join('')}</div>
      <input class="f-input pur-search" type="search" placeholder="Search PR / PO #, vendor, person…" value="${pEsc(_purSearch)}"
        oninput="_purSearch=this.value;renderPurchasesList();this.focus();this.setSelectionRange(this.value.length,this.value.length)" aria-label="Search purchases" />
    </div>
    ${rows.length ? `<div class="pur-table-wrap"><table class="pur-table">
      <thead><tr><th>PR / PO</th><th>Vendor</th>${mode === 'all' ? '<th>Requested by</th>' : ''}<th>What</th>
        <th class="num">Total</th><th>Where it stands</th><th>Updated</th></tr></thead>
      <tbody>${rows.map(po => `<tr onclick="openPurchaseWindow('${po.id}')">
        <td class="mono"><a href="#purchase/${po.id}" onclick="event.preventDefault()">${pEsc(pNo(po))}</a>${po.po_number ? `<div class="pur-dim">was ${pEsc(po.pr_number)}</div>` : ''}</td>
        <td>${pEsc(pVendor(po.vendor_id)?.name || '—')}</td>
        ${mode === 'all' ? `<td>${pEsc(pEmpName(po.requester_id))}</td>` : ''}
        <td>${_purWhat(po)}${po.charge_to === 'job' && po.project_id ? `<div class="pur-dim">${pEsc(pProject(po.project_id)?.name || 'Job')}</div>` : ''}</td>
        <td class="num">${Number(po.unpriced_lines) > 0 && !Number(po.total) ? '—' : pMoney(po.total)}</td>
        <td>${pStatusChip(po)}${po.auto_approved && po.po_number ? `<div class="pur-dim">Auto-approved (under ${pEsc(pFirst(po.requester_id))}'s limit)</div>` : ''}</td>
        <td class="pur-dim">${pDate(po.updated_at)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="pur-empty">${purStore.length ? 'Nothing here.' : (mode === 'mine' ? 'You have no purchase requests yet.' : 'No purchase requests yet.')}</div>`}`;
}
function _purSetFilter(k) { _purFilter[_purListMode] = k; renderPurchasesList(); }

// ---------- the PR / PO window ----------
function _purEnsureModal() {
  if (document.getElementById('purModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="purModal" onclick="if(event.target===this)purCloseWindow()">
      <div class="modal pur-modal">
        <div id="purModalInner"></div>
      </div>
    </div>`);
}

async function openPurchaseWindow(id) {
  if (!id) return;
  _purEnsureModal();
  await purEnsureRefs();
  const [h, l] = await Promise.all([
    sb.from('purchase_order_summary').select('*').eq('id', id).maybeSingle(),
    sb.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('line_no'),
  ]);
  if (h.error) { pErr('Could not open', h.error); return; }
  if (!h.data) { pToast('That purchase request was not found (or is on a private job you cannot see)'); return; }
  if (l.error) { pErr('Could not load lines', l.error); return; }
  _purWin = { po: h.data, lines: l.data || [], isNew: false, editing: false, removed: new Set() };
  _purWin.editing = _purCanEdit();
  renderPurchaseWindow();
  document.getElementById('purModal').classList.add('open');
  if (typeof routerPush === 'function') routerPush('purchase/' + id);
}

async function purNewRequest(prefill) {
  if (!pCanPurchase()) { pToast('You are not set up to make purchase requests (Setup → Employees → Purchasing)'); return; }
  if (pIsViewOnly()) { pToast('View-As is read-only'); return; }
  _purEnsureModal();
  await purEnsureRefs();
  const me = pMe();
  _purWin = {
    isNew: true, editing: true, removed: new Set(),
    po: Object.assign({ id: null, status: 'draft', source: 'manual', requester_id: me.id, charge_to: 'overhead',
      project_id: null, vendor_id: null, pricing: null, vendor_quote_no: '', notes: '', internal_notes: '', ship_via: '' }, prefill?.po || {}),
    lines: prefill?.lines || [{ _tmp: 1, line_type_id: null, description: '', qty: 1, unit_price: null, price_basis: 'estimate' }],
  };
  renderPurchaseWindow();
  document.getElementById('purModal').classList.add('open');
}

function purCloseWindow() {
  document.getElementById('purModal')?.classList.remove('open');
  _purWin = null;
}

function _purIsRequester() { const me = pMe(); return !!(me && _purWin && _purWin.po.requester_id === me.id); }
function _purCanEdit() {
  if (!_purWin || pIsViewOnly()) return false;
  if (!['draft', 'awaiting_quote', 'rejected'].includes(_purWin.po.status)) return false;
  return _purWin.isNew || _purIsRequester() || _purWin.po.created_by === pMe()?.id;
}
function _purCanApprove() {
  const me = pMe(), po = _purWin?.po;
  if (!me || !po || pIsViewOnly() || po.status !== 'pending_approval') return false;
  if (po.requester_id === me.id) return false;
  return pCan('approve_purchases');
}
function _purCanWork() {   // order / receive / close lines
  return !pIsViewOnly() && (_purIsRequester() || pCanSeeAll());
}

function _purTotal() {
  return (_purWin?.lines || []).reduce((t, l) => t + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
}
function _purHasCal() {
  return (_purWin?.lines || []).some(l => pType(l.line_type_id)?.is_calibration);
}

function renderPurchaseWindow() {
  const el = document.getElementById('purModalInner');
  if (!el || !_purWin) return;
  const w = _purWin, po = w.po, ed = w.editing;
  const v = pVendor(po.vendor_id);
  const me = pMe();
  const requester = pEmp(po.requester_id);
  const total = _purTotal();
  const limit = Number(requester?.purchaseLimit || 0);

  // progress strip
  const steps = [['draft', 'Draft'], ['quote', 'Quote in'], ['pending_approval', 'Waiting for approval'],
    ['approved', 'Approved · PO#'], ['ordered', 'Ordered'], ['received', 'Received'], ['closed', 'Billed · Closed']];
  const order = { draft: 0, rejected: 0, awaiting_quote: 1, pending_approval: 2, approved: 3, ordered: 4, received: 5, closed: 6, cancelled: -1 };
  const at = order[po.status] ?? 0;
  const strip = po.status === 'cancelled' ? `<span class="pur-step cur">Cancelled</span>`
    : steps.map(([k, label], i) => i < at ? `<span class="pur-step done">✓ ${label}</span>`
      : i === at ? `<span class="pur-step cur">${po.status === 'rejected' ? 'Rejected — back to draft' : label}</span>`
      : `<span class="pur-step">${label}</span>`).join('<span class="pur-step-sep">—</span>');

  // banner
  let banner = '';
  if (po.status === 'pending_approval') {
    banner = `<div class="pur-banner warn"><strong>${pMoney(po.total ?? total)} is over ${pEsc(pFirst(po.requester_id))}'s ${pMoney(limit)} limit.</strong>
      It's waiting for <strong>${pEsc(pEmpName(po.approver_id) || 'the PR Approver')}</strong>${po.approver_id === me?.id ? ' — that\'s you.' : '.'}</div>`;
  } else if (po.status === 'rejected') {
    banner = `<div class="pur-banner bad"><strong>Rejected by ${pEsc(pEmpName(po.rejected_by) || 'the approver')}:</strong> ${pEsc(po.reject_reason || '')}
      ${ed ? '<div class="pur-dim" style="margin-top:4px">Change it and submit again, or cancel it.</div>' : ''}</div>`;
  } else if (po.status === 'approved') {
    banner = `<div class="pur-banner good"><strong>${pEsc(po.po_number)} is approved</strong>${po.auto_approved ? ` (auto — under ${pEsc(pFirst(po.requester_id))}'s limit)` : ` by ${pEsc(pEmpName(po.approved_by))}`}.
      Print or email the PO to the vendor, then mark it sent.</div>`;
  } else if (ed && po.status !== 'awaiting_quote' && requester) {
    banner = `<div class="pur-banner info">${pEsc(po.requester_id === me?.id ? 'Your' : pFirst(po.requester_id) + '\'s')} limit is ${pMoney(limit)}.
      ${limit > 0 ? 'At or under it, this is approved straight away and gets a PO number.' : ''} Over it, it goes to
      <strong>${pEsc(pEmpName(requester.purchaseApproverId) || 'a PR Approver (none set yet)')}</strong>.</div>`;
  }

  // header fields
  const vendorOpts = purVendors.filter(x => x.status === 'approved' || x.status === 'proposed' || x.id === po.vendor_id)
    .map(x => `<option value="${x.id}" ${x.id === po.vendor_id ? 'selected' : ''}>${pEsc(x.name)}${x.status !== 'approved' ? ' (' + x.status + ')' : ''}</option>`).join('');
  const projName = po.project_id ? (pProject(po.project_id)?.name || '') : '';
  const fields = ed ? `
    <div class="pur-fields">
      <div class="field"><label class="field-label" for="purVendor">Vendor</label>
        <select class="f-input" id="purVendor" onchange="_purSet('vendor_id', this.value||null);_purVendorChanged()">
          <option value="">— Pick a vendor —</option>${vendorOpts}</select>
        <button type="button" class="pur-link" onclick="purProposeVendor()">Vendor not listed?</button></div>
      <div class="field"><label class="field-label" for="purChargeTo">Charge to</label>
        <select class="f-input" id="purChargeTo" onchange="_purSet('charge_to', this.value);renderPurchaseWindow()">
          <option value="overhead" ${po.charge_to !== 'job' ? 'selected' : ''}>Overhead</option>
          <option value="job" ${po.charge_to === 'job' ? 'selected' : ''}>A job</option></select>
        ${po.charge_to === 'job' ? `<input class="f-input" id="purJob" list="purJobList" style="margin-top:6px" placeholder="Type to find the job" value="${pEsc(projName)}"
          onchange="_purPickJob(this.value)" /><datalist id="purJobList">${(typeof projects !== 'undefined' ? projects : [])
            .map(p => `<option value="${pEsc(p.name)}"></option>`).join('')}</datalist>` : ''}</div>
      <div class="field"><label class="field-label" for="purQuote">Vendor quote #</label>
        <input class="f-input" id="purQuote" value="${pEsc(po.vendor_quote_no || '')}" oninput="_purSet('vendor_quote_no', this.value)" placeholder="If you have one" /></div>
      <div class="field"><label class="field-label" for="purShipVia">Ship via</label>
        <input class="f-input" id="purShipVia" value="${pEsc(po.ship_via || '')}" oninput="_purSet('ship_via', this.value)" placeholder="e.g. UPS Ground" /></div>
    </div>`
    : `<div class="pur-fields ro">
      <div><div class="pur-k">Vendor</div><div class="pur-v">${pEsc(v?.name || '—')}</div>
        <div class="pur-dim">${[v?.peachtree_vendor_id ? 'Peachtree ' + v.peachtree_vendor_id : '', v?.payment_terms, v?.pricing === 'trusted' ? 'Trusted pricing' : 'Quote required'].filter(Boolean).map(pEsc).join(' · ')}</div></div>
      <div><div class="pur-k">Charge to</div><div class="pur-v">${po.charge_to === 'job' ? pEsc(projName || 'Job') : 'Overhead'}</div></div>
      <div><div class="pur-k">Vendor quote #</div><div class="pur-v mono">${pEsc(po.vendor_quote_no || '—')}</div></div>
      <div><div class="pur-k">Ship via</div><div class="pur-v">${pEsc(po.ship_via || '—')}</div>
        ${po.sent_at ? `<div class="pur-dim">Sent ${pDate(po.sent_at)}${po.sent_method ? ' · ' + (po.sent_method === 'email' ? 'emailed' : 'printed') : ''}</div>` : ''}</div>
    </div>`;

  // lines
  const typeOpts = sel => '<option value="">— Type —</option>' + purLineTypes.filter(t => t.active || t.id === sel)
    .map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${pEsc(t.name)}</option>`).join('');
  const lineLive = ['ordered', 'received'].includes(po.status);
  const canRecv = pCanInspect() && lineLive;          // incoming inspection sign-off
  const canCloseL = _purCanWork() && lineLive;        // close a line (billed / no bill)
  const lineRows = w.lines.map((l, i) => {
    const t = pType(l.line_type_id);
    const amt = (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
    if (ed) return `<tr>
      <td class="pur-dim">${i + 1}</td>
      <td><select class="f-input pur-in" aria-label="Line ${i + 1} type" onchange="_purLine(${i},'line_type_id',this.value||null)">${typeOpts(l.line_type_id)}</select></td>
      <td><input class="f-input pur-in" aria-label="Line ${i + 1} description" value="${pEsc(l.description || '')}" oninput="_purLine(${i},'description',this.value)" placeholder="What is it?" />
        ${l.loa_asset_id ? `<div class="pur-dim">LOA asset ${pEsc(l.loa_asset_id)}</div>` : ''}</td>
      <td><input class="f-input pur-in num" aria-label="Line ${i + 1} quantity" type="number" min="0.001" step="1" value="${pEsc(l.qty ?? 1)}" oninput="_purLine(${i},'qty',this.value)" style="width:70px" /></td>
      <td><input class="f-input pur-in num" aria-label="Line ${i + 1} unit price" type="number" min="0" step="0.01" value="${l.unit_price == null ? '' : pEsc(l.unit_price)}" oninput="_purLine(${i},'unit_price',this.value)" placeholder="?" style="width:100px" /></td>
      <td><select class="f-input pur-in" aria-label="Line ${i + 1} price basis" onchange="_purLine(${i},'price_basis',this.value)">${Object.entries(PUR_BASIS)
        .map(([k, lab]) => `<option value="${k}" ${l.price_basis === k ? 'selected' : ''}>${lab}</option>`).join('')}</select></td>
      <td class="num" id="purAmt${i}">${l.unit_price == null || l.unit_price === '' ? '—' : pNum(amt)}</td>
      <td><button class="pur-x" aria-label="Remove line ${i + 1}" onclick="_purRemoveLine(${i})">✕</button></td></tr>`;
    return `<tr>
      <td class="pur-dim">${i + 1}</td>
      <td>${t ? `<span class="pur-type ${t.is_calibration ? 'cal' : ''}">${pEsc(t.name)}</span>` : '—'}</td>
      <td>${pEsc(l.description || '')}${l.status === 'closed' ? `<div class="pur-dim">Closed: ${pEsc(l.closed_reason || '')}</div>` : ''}${l.received_by ? `<div class="pur-dim">Accepted by ${pEsc(pEmpName(l.received_by) || '?')}${l.received_at ? ' · ' + pEsc(new Date(l.received_at).toLocaleDateString()) : ''}</div>` : ''}${l.inspection_note && l.status === 'open' ? `<div class="pur-warn-line">⚠ Inspection: ${pEsc(l.inspection_note)}</div>` : ''}</td>
      <td class="mono">${pEsc(l.loa_asset_id || '')}</td>
      <td class="num">${pEsc(Number(l.qty))}</td>
      <td class="num">${l.unit_price == null ? '—' : pNum(l.unit_price)}</td>
      <td>${PUR_BASIS[l.price_basis] || ''}</td>
      <td class="num strong">${l.unit_price == null ? '—' : pNum(amt)}</td>
      ${['approved', 'ordered', 'received', 'closed'].includes(po.status) ? `<td>${_purLineStatus(l, i, canRecv, canCloseL)}</td>` : ''}</tr>`;
  }).join('');
  const showStatusCol = !ed && ['approved', 'ordered', 'received', 'closed'].includes(po.status);
  const lines = `
    <div class="pur-sec">Lines</div>
    <div class="pur-table-wrap"><table class="pur-table pur-lines">
      <thead><tr><th>#</th><th>Type</th><th>Description</th>${ed ? '' : '<th>LOA asset</th>'}<th class="num">Qty</th><th class="num">Unit price</th><th>Price basis</th><th class="num">Amount</th>${ed ? '<th></th>' : ''}${showStatusCol ? '<th>Line</th>' : ''}</tr></thead>
      <tbody>${lineRows || `<tr><td colspan="9" class="pur-dim">No lines yet.</td></tr>`}
        <tr class="pur-total"><td colspan="${ed ? 6 : 7}" class="num">Total</td><td class="num" id="purTotal">${pMoney(total)}</td>${ed ? '<td></td>' : ''}${showStatusCol ? '<td></td>' : ''}</tr></tbody>
    </table></div>
    ${ed ? `<button class="pur-add" onclick="_purAddLine()">+ Add line</button>` : ''}
    ${canRecv && w.lines.some(l => l.status === 'open') ? `<button class="pur-add" onclick="purReceiveAll()">✓ Inspected – all OK</button>` : ''}`;

  // notes + attachments
  const notes = `
    <div class="pur-two">
      <div class="field">
        <label class="field-label" for="purNotes">Notes for the vendor (print on the PO)</label>
        ${ed ? `<textarea class="f-input" id="purNotes" rows="3" oninput="_purSet('notes', this.value)">${pEsc(po.notes || '')}</textarea>`
             : `<div class="pur-notes">${pEsc(po.notes || '—')}</div>`}
        ${_purHasCal() ? `<div class="pur-dim" style="margin-top:4px">ⓘ This PO has calibration lines, so the EMC-WI-004 calibration instruction prints automatically.</div>` : ''}
        <label class="field-label" for="purInternal" style="margin-top:10px">Internal notes (never print)</label>
        ${ed ? `<textarea class="f-input" id="purInternal" rows="2" oninput="_purSet('internal_notes', this.value)">${pEsc(po.internal_notes || '')}</textarea>`
             : `<div class="pur-notes">${pEsc(po.internal_notes || '—')}</div>`}
      </div>
      <div class="field"><div class="field-label">Attachments</div>
        ${po.id ? `<div id="purAtt"></div>` : `<div class="pur-dim">Save the request first, then attach the quote or other files.</div>`}</div>
    </div>`;

  // history
  const hist = [];
  if (po.created_at) hist.push([po.created_at, `${pEmpName(po.created_by || po.requester_id)} created ${pEsc(po.pr_number || '')}${po.source === 'loa' ? ' from the LOA' : ''}`]);
  if (po.submitted_at) hist.push([po.submitted_at, `Submitted for approval`]);
  if (po.rejected_at) hist.push([po.rejected_at, `Rejected by ${pEmpName(po.rejected_by)}: ${pEsc(po.reject_reason || '')}`]);
  if (po.approved_at) hist.push([po.approved_at, po.auto_approved ? `Auto-approved → ${pEsc(po.po_number)}` : `Approved by ${pEmpName(po.approved_by)} → ${pEsc(po.po_number)}`]);
  if (po.sent_at) hist.push([po.sent_at, `Sent to vendor${po.sent_method ? ' (' + (po.sent_method === 'email' ? 'emailed' : 'printed') + ')' : ''}${po.sent_by ? ' by ' + pEmpName(po.sent_by) : ''}`]);
  if (po.received_at) hist.push([po.received_at, 'All lines received']);
  if (po.cancelled_at) hist.push([po.cancelled_at, `Cancelled by ${pEmpName(po.cancelled_by)}${po.cancel_reason ? ': ' + pEsc(po.cancel_reason) : ''}`]);
  if (po.closed_at) hist.push([po.closed_at, 'Closed']);
  hist.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const history = hist.length ? `<div class="pur-sec">History</div><div class="pur-hist">${hist.map(([t, s]) =>
    `<div><span class="mono pur-dim">${pDateTime(t)}</span> · ${s}</div>`).join('')}</div>` : '';

  el.innerHTML = `
    <div class="modal-header pur-mhead">
      <div>
        <div class="pur-mtitle-row"><div class="modal-title pur-mtitle">${pEsc(pNo(po))}</div>${po.id ? pStatusChip(po) : '<span class="pur-chip draft">New</span>'}</div>
        <div class="pur-dim">${po.id ? `Requested by <strong>${pEsc(pEmpName(po.requester_id))}</strong> · ${pDate(po.created_at)}${po.source === 'loa' ? ' · Started from the LOA' : ''}` : 'Not saved yet'}</div>
      </div>
      <button class="modal-close" aria-label="Close" onclick="purCloseWindow()">&#x2715;</button>
    </div>
    <div class="pur-strip">${strip}</div>
    <div class="modal-body pur-mbody">
      ${banner}
      ${fields}
      ${lines}
      ${notes}
      ${history}
    </div>
    <div class="modal-footer pur-foot">${_purButtons()}</div>`;

  if (po.id && typeof attMount === 'function') attMount('purchase_order', po.id, 'purAtt', { canAdd: !pIsViewOnly() });
}

// Line state: Open → (incoming inspection) Accepted → (billed in Peachtree) Closed.
// Only people with Inspect & accept sign off; Close… on an accepted line = billed,
// on an open line = closed with no bill (no charge, cancelled, not repairable).
function _purLineStatus(l, i, canRecv, canClose) {
  if (l.status === 'received') return `<span class="pur-chip ordered">Accepted</span>`
    + (canClose ? ` <button class="pur-mini ghost" onclick="purCloseLine(${i})" title="Billed in Peachtree — close this line">Close…</button>` : '');
  if (l.status === 'billed') return `<span class="pur-chip closed">Billed</span>`;
  if (l.status === 'closed') return `<span class="pur-chip closed">Closed</span>`;
  const b = [];
  if (canRecv) {
    b.push(`<button class="pur-mini" onclick="purReceiveLine(${i})">Inspected – OK</button>`);
    b.push(`<button class="pur-mini ghost" onclick="purInspectNote(${i})" title="Something is wrong — note it; the line stays open">Problem…</button>`);
  }
  if (canClose) b.push(`<button class="pur-mini ghost" onclick="purCloseLine(${i})" title="Close with no bill (no charge, cancelled, not repairable)">Close…</button>`);
  return b.length ? b.join(' ') : `<span class="pur-chip draft">Awaiting inspection</span>`;
}

function _purButtons() {
  const w = _purWin, po = w.po, b = [];
  const btn = (label, fn, cls) => `<button class="btn ${cls || 'btn-ghost'}" onclick="${fn}">${label}</button>`;
  if (w.editing) {
    if (po.id && po.status === 'draft' && !po.po_number) b.push(btn('Delete draft', 'purDeleteDraft()', 'btn-ghost pur-danger'));
    if (po.id) b.push(btn('Cancel request…', 'purCancel()', 'btn-ghost pur-danger'));
    if (po.id) b.push(btn('Print RFQ', 'purPrint(true)'));
    // Ship-first / price-later: a saved request with LOA items can make its packing list now.
    if (po.id && w.lines.some(l => l.loa_asset_id) && typeof plCreate === 'function') b.push(btn('Packing list', 'purPackingList()'));
    b.push('<span style="flex:1"></span>');
    b.push(btn('Save draft', 'purSave()'));
    if (po.status !== 'awaiting_quote') b.push(btn('Waiting on a quote', 'purSave(\'awaiting_quote\')'));
    b.push(btn('Submit', 'purSubmit()', 'btn-primary'));
    return b.join('');
  }
  if (po.status === 'pending_approval') {
    if (_purIsRequester() && !pIsViewOnly()) b.push(btn('Recall to draft', 'purRecall()'));
    b.push('<span style="flex:1"></span>');
    if (_purCanApprove()) {
      b.push(btn('Reject…', 'purReject()', 'btn-ghost pur-danger'));
      b.push(btn('Approve → issue PO number', 'purApprove()', 'btn-primary'));
    }
    return b.join('');
  }
  if (po.status === 'approved') {
    if (_purCanWork()) b.push(btn('Cancel PO…', 'purCancel()', 'btn-ghost pur-danger'));
    b.push('<span style="flex:1"></span>');
    b.push(btn('Print PO', 'purPrint()'));
    if (_purCanWork()) {
      b.push(btn('Mark emailed', 'purMarkSent(\'email\')'));
      b.push(btn('Mark printed &amp; sent', 'purMarkSent(\'print\')', 'btn-primary'));
    }
    return b.join('');
  }
  if (['ordered', 'received'].includes(po.status)) {
    if (_purCanWork()) b.push(btn('Cancel PO…', 'purCancel()', 'btn-ghost pur-danger'));
    if (_purCanWork() && w.lines.some(l => l.status === 'received')) b.push(btn('Close PO…', 'purClosePo()'));
    if (_purCanWork() && typeof plCreate === 'function' && w.lines.some(l => l.loa_asset_id)) b.push(btn('Packing list', 'purPackingList()'));
    b.push('<span style="flex:1"></span>');
    b.push(btn('Print PO', 'purPrint()'));
    return b.join('');
  }
  if (['draft', 'awaiting_quote', 'rejected'].includes(po.status) && w.lines.some(l => l.loa_asset_id) && _purCanWork() && typeof plCreate === 'function') {
    b.push(btn('Packing list', 'purPackingList()'));
  }
  b.push('<span style="flex:1"></span>');
  if (po.po_number) b.push(btn('Print PO', 'purPrint()'));
  b.push(btn('Close', 'purCloseWindow()'));
  return b.join('');
}

// ---------- editing ----------
function _purSet(k, v) { if (_purWin) _purWin.po[k] = v; }
function _purVendorChanged() {
  const v = pVendor(_purWin.po.vendor_id);
  _purWin.po.pricing = v ? (v.pricing || 'quote_required') : null;
}
function _purPickJob(name) {
  const p = (typeof projects !== 'undefined' ? projects : []).find(x => x.name === name);
  _purWin.po.project_id = p ? p.id : null;
  if (!p && name) pToast('Pick the job from the list');
}
function _purLine(i, k, v) {
  const l = _purWin.lines[i];
  if (!l) return;
  if (k === 'qty' || k === 'unit_price') v = v === '' ? null : Number(v);
  l[k] = v;
  if (k === 'line_type_id' || k === 'price_basis') { renderPurchaseWindow(); return; }
  const amt = document.getElementById('purAmt' + i);
  if (amt) amt.textContent = l.unit_price == null ? '—' : pNum((Number(l.qty) || 0) * (Number(l.unit_price) || 0));
  const tot = document.getElementById('purTotal');
  if (tot) tot.textContent = pMoney(_purTotal());
}
function _purAddLine() {
  const prev = _purWin.lines[_purWin.lines.length - 1];
  _purWin.lines.push({ _tmp: 1, line_type_id: prev?.line_type_id || null, description: '', qty: 1, unit_price: null, price_basis: 'estimate' });
  renderPurchaseWindow();
}
function _purRemoveLine(i) {
  const l = _purWin.lines[i];
  if (l?.id) _purWin.removed.add(l.id);
  _purWin.lines.splice(i, 1);
  renderPurchaseWindow();
}

async function purProposeVendor() {
  const name = (prompt('Vendor name (it is added as Proposed; Linda approves it and sets its Peachtree ID):') || '').trim();
  if (!name) return;
  const dup = purVendors.find(v => v.name.trim().toLowerCase() === name.toLowerCase());
  if (dup) { _purWin.po.vendor_id = dup.id; _purVendorChanged(); renderPurchaseWindow(); pToast('That vendor is already on the list — picked it'); return; }
  const me = pMe();
  const { data, error } = await sb.from('vendors').insert({ name, status: 'proposed', proposed_by: me?.id || null, proposed_at: new Date().toISOString() })
    .select('id,name,nickname,status,address,city,state,zip,phone,account_number,payment_terms,peachtree_vendor_id,pricing').single();
  if (error) { pErr('Could not add the vendor', error); return; }
  purVendors.push(data);
  purVendors.sort((a, b) => a.name.localeCompare(b.name));
  _purWin.po.vendor_id = data.id;
  _purVendorChanged();
  renderPurchaseWindow();
  pToast('✓ ' + name + ' added as a proposed vendor');
}

// Saves the header and lines. statusOverride: 'awaiting_quote' or 'draft'. Returns the id or null.
async function purSave(statusOverride, quiet) {
  const w = _purWin;
  if (!w || !w.editing) return null;
  const po = w.po, me = pMe();
  if (po.charge_to === 'job' && !po.project_id) { pToast('Pick the job this is charged to'); return null; }
  const lines = w.lines.filter(l => (l.description || '').trim() || l.unit_price != null || l.line_type_id);
  if (lines.some(l => !(l.description || '').trim())) { pToast('Every line needs a description'); return null; }
  if (lines.some(l => !(Number(l.qty) > 0))) { pToast('Quantities must be more than zero'); return null; }

  const hdr = {
    vendor_id: po.vendor_id || null, charge_to: po.charge_to || 'overhead',
    project_id: po.charge_to === 'job' ? (po.project_id || null) : null,
    pricing: po.pricing || pVendor(po.vendor_id)?.pricing || null,
    vendor_quote_no: (po.vendor_quote_no || '').trim() || null, ship_via: (po.ship_via || '').trim() || null,
    notes: (po.notes || '').trim() || null, internal_notes: (po.internal_notes || '').trim() || null,
  };
  let id = po.id;
  if (!id) {
    const { data, error } = await sb.from('purchase_orders').insert({
      ...hdr, requester_id: po.requester_id || me.id, created_by: me.id, source: po.source || 'manual',
      status: statusOverride === 'awaiting_quote' ? 'awaiting_quote' : 'draft',
    }).select().single();
    if (error) { pErr('Could not save', error); return null; }
    id = data.id; po.id = id; po.pr_number = data.pr_number; po.status = data.status; po.created_at = data.created_at;
    w.isNew = false;
  } else {
    const upd = { ...hdr };
    if (po.status === 'rejected') upd.status = 'draft';
    if (statusOverride && statusOverride !== po.status && ['draft', 'awaiting_quote'].includes(statusOverride)) upd.status = statusOverride;
    const { error } = await sb.from('purchase_orders').update(upd).eq('id', id);
    if (error) { pErr('Could not save', error); return null; }
  }
  // lines
  if (w.removed.size) {
    const { error } = await sb.from('purchase_order_lines').delete().in('id', [...w.removed]);
    if (error) { pErr('Could not remove a line', error); return null; }
    w.removed.clear();
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const row = {
      line_no: i + 1, line_type_id: l.line_type_id || null, description: l.description.trim(),
      qty: Number(l.qty) || 1, unit_price: l.unit_price == null || l.unit_price === '' ? null : Number(l.unit_price),
      price_basis: l.price_basis || 'estimate',
      gl_account: l.gl_account || pType(l.line_type_id)?.gl_account || null,
      loa_asset_id: l.loa_asset_id || null, cal_record_id: l.cal_record_id || null, expense_id: l.expense_id || null,
      test_category: l.test_category || null,
    };
    const res = l.id
      ? await sb.from('purchase_order_lines').update(row).eq('id', l.id)
      : await sb.from('purchase_order_lines').insert({ ...row, purchase_order_id: id }).select('id').single();
    if (res.error) { pErr('Could not save line ' + (i + 1), res.error); return null; }
    if (!l.id && res.data) { l.id = res.data.id; delete l._tmp; }
  }
  if (!quiet) pToast('✓ Saved ' + (po.pr_number || ''));
  await _purReload(id);
  return id;
}

async function _purReload(id) {
  const [h, l] = await Promise.all([
    sb.from('purchase_order_summary').select('*').eq('id', id).maybeSingle(),
    sb.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('line_no'),
  ]);
  if (!h.error && h.data && _purWin) {
    _purWin.po = h.data; _purWin.lines = l.data || []; _purWin.removed = new Set();
    _purWin.editing = _purCanEdit();
    renderPurchaseWindow();
  }
  _purRefreshLists();
}

function _purRefreshLists() {
  const mine = document.getElementById('panel-mypurchases'), all = document.getElementById('panel-purchases');
  if (mine?.classList.contains('active') && _purListMode === 'mine') purLoadList().then(renderPurchasesList);
  if (all?.classList.contains('active') && _purListMode === 'all') purLoadList().then(renderPurchasesList);
  if (document.getElementById('panel-approvals')?.classList.contains('active') && window._approvalsActiveTab === 'purchases') renderApprovalsPurchasesTab();
  if (typeof updateApprovalsBadge === 'function') { try { updateApprovalsBadge(); } catch (e) {} }
  refreshMyPurchasesBadge();
}

async function purSubmit() {
  const w = _purWin;
  if (!w) return;
  if (!w.po.vendor_id) { pToast('Pick a vendor first'); return; }
  const id = await purSave(null, true);
  if (!id) return;
  const po = w.po;
  const requester = pEmp(po.requester_id);
  const total = Number(po.total ?? _purTotal());
  const limit = Number(requester?.purchaseLimit || 0);
  if (Number(po.unpriced_lines) > 0) { pToast('Every line needs a price to submit — use "Waiting on a quote" until it comes in'); return; }
  if (total <= limit) {
    const { error } = await sb.from('purchase_orders').update({ status: 'approved', auto_approved: true }).eq('id', id);
    if (error) { pErr('Could not submit', error); await _purReload(id); return; }
    await _purReload(id);
    pToast('✓ Approved — ' + (_purWin?.po.po_number || 'PO issued') + '. Print or email it to the vendor.');
    return;
  }
  const approverId = requester?.purchaseApproverId || null;
  if (!approverId) {
    pToast('⚠ ' + pMoney(total) + ' is over the ' + pMoney(limit) + ' limit and no PR Approver is set. Ask an admin to set one on the employee card.');
    return;
  }
  const { error } = await sb.from('purchase_orders').update({ status: 'pending_approval', approver_id: approverId }).eq('id', id);
  if (error) { pErr('Could not submit', error); await _purReload(id); return; }
  await _purReload(id);
  const p = _purWin?.po || po;
  await purNotify(approverId, `🛒 ${pEmpName(p.requester_id)} needs your approval: ${p.pr_number} — ${pVendor(p.vendor_id)?.name || ''} ${pMoney(total)}`, p.id,
    { subject: `Purchase request ${p.pr_number} needs your approval`,
      lines: [`${pEmpName(p.requester_id)} submitted ${p.pr_number} to ${pVendor(p.vendor_id)?.name || 'a vendor'} for ${pMoney(total)}.`,
              `It is over their ${pMoney(limit)} limit, so it needs your approval.`] });
  pToast('✓ Sent to ' + pEmpName(approverId) + ' for approval');
}

async function purApprove() {
  const po = _purWin?.po, me = pMe();
  if (!po || !me) return;
  const { error } = await sb.from('purchase_orders').update({ status: 'approved', approved_by: me.id, auto_approved: false }).eq('id', po.id);
  if (error) { pErr('Could not approve', error); return; }
  await _purReload(po.id);
  const p = _purWin?.po || po;
  await purNotify(p.requester_id, `✓ ${me.name} approved ${p.pr_number} → ${p.po_number}. Print or email it to the vendor.`, p.id,
    { subject: `${p.pr_number} approved — ${p.po_number}`, lines: [`${me.name} approved your purchase request ${p.pr_number}.`, `It is now ${p.po_number}. Print or email it to the vendor and mark it sent.`] });
  pToast('✓ Approved — ' + (p.po_number || ''));
}

async function purReject() {
  const po = _purWin?.po, me = pMe();
  if (!po || !me) return;
  const reason = (prompt('Why is it rejected? (the requester sees this)') || '').trim();
  if (!reason) return;
  const { error } = await sb.from('purchase_orders').update({ status: 'rejected', reject_reason: reason, rejected_by: me.id }).eq('id', po.id);
  if (error) { pErr('Could not reject', error); return; }
  await _purReload(po.id);
  await purNotify(po.requester_id, `✗ ${me.name} rejected ${po.pr_number}: ${reason}`, po.id,
    { subject: `${po.pr_number} was not approved`, lines: [`${me.name} rejected your purchase request ${po.pr_number}.`, `Reason: ${reason}`, 'You can change it and submit it again, or cancel it.'] });
  pToast('Rejected');
}

async function purRecall() {
  const po = _purWin?.po;
  if (!po) return;
  const { error } = await sb.from('purchase_orders').update({ status: 'draft' }).eq('id', po.id);
  if (error) { pErr('Could not recall', error); return; }
  await _purReload(po.id);
  pToast('Back to draft');
}

async function purCancel() {
  const po = _purWin?.po, me = pMe();
  if (!po) return;
  const reason = (prompt(`Cancel ${pNo(po)}? Give a short reason:`) || '').trim();
  if (!reason) return;
  const { error } = await sb.from('purchase_orders').update({ status: 'cancelled', cancel_reason: reason, cancelled_by: me?.id || null }).eq('id', po.id);
  if (error) { pErr('Could not cancel', error); return; }
  await _purReload(po.id);
  pToast(pNo(po) + ' cancelled');
}

async function purDeleteDraft() {
  const po = _purWin?.po;
  if (!po?.id) return;
  if (!confirm(`Delete draft ${po.pr_number}? This can't be undone.`)) return;
  const { error } = await sb.from('purchase_orders').delete().eq('id', po.id);
  if (error) { pErr('Could not delete', error); return; }
  purCloseWindow();
  _purRefreshLists();
  pToast('Draft deleted');
}

async function purMarkSent(method) {
  const po = _purWin?.po, me = pMe();
  if (!po) return;
  const { error } = await sb.from('purchase_orders').update({ status: 'ordered', sent_method: method, sent_by: me?.id || null }).eq('id', po.id);
  if (error) { pErr('Could not mark sent', error); return; }
  await _purReload(po.id);
  pToast('✓ ' + po.po_number + ' marked ' + (method === 'email' ? 'emailed' : 'sent'));
}

async function _purAfterReceive(id) {
  const { data } = await sb.from('purchase_order_lines').select('status').eq('purchase_order_id', id);
  const st = _purWin?.po?.status;
  if (st === 'ordered' && data && data.length && data.every(l => l.status !== 'open')) {
    const { error } = await sb.from('purchase_orders').update({ status: 'received' }).eq('id', id);
    if (error) pErr('Could not mark received', error);
  }
  await _purReload(id);
}
async function purReceiveLine(i) {
  const l = _purWin?.lines[i], me = pMe();
  if (!l || !pCanInspect()) return;
  const { error } = await sb.from('purchase_order_lines').update({ status: 'received', received_by: me?.id || null }).eq('id', l.id);
  if (error) { pErr('Could not receive', error); return; }
  await _purAfterReceive(_purWin.po.id);
}
async function purReceiveAll() {
  const me = pMe();
  if (!pCanInspect()) return;
  const ids = (_purWin?.lines || []).filter(l => l.status === 'open').map(l => l.id);
  if (!ids.length) return;
  if (!confirm(`Inspected and OK: accept all ${ids.length} open line${ids.length === 1 ? '' : 's'} on ${pNo(_purWin.po)}?`)) return;
  const { error } = await sb.from('purchase_order_lines').update({ status: 'received', received_by: me?.id || null }).in('id', ids);
  if (error) { pErr('Could not accept the lines', error); return; }
  await _purAfterReceive(_purWin.po.id);
  pToast('✓ All lines accepted');
}
// Inspection found a problem: note it, the line stays open (Linda sees the note and holds payment).
async function purInspectNote(i) {
  const l = _purWin?.lines[i];
  if (!l || !pCanInspect()) return;
  const note = prompt('What is wrong? (wrong item, damaged, no cal cert…) — leave empty to clear the note', l.inspection_note || '');
  if (note === null) return;
  const { error } = await sb.from('purchase_order_lines').update({ inspection_note: note.trim() || null }).eq('id', l.id);
  if (error) { pErr('Could not save the note', error); return; }
  await _purReload(_purWin.po.id);
}
async function purCloseLine(i) {
  const l = _purWin?.lines[i], me = pMe();
  if (!l) return;
  const accepted = l.status === 'received';
  const reason = ((accepted
    ? prompt('Close this line — billed in Peachtree? Add the invoice number.', 'Billed in Peachtree, inv ')
    : prompt('This line was not accepted at inspection, so it closes with NO bill paid. Why? (no charge, not repairable, cancelled)')) || '').trim();
  if (!reason || reason === 'Billed in Peachtree, inv') return;
  const { error } = await sb.from('purchase_order_lines').update({ status: 'closed', closed_reason: reason, closed_by: me?.id || null }).eq('id', l.id);
  if (error) { pErr('Could not close the line', error); return; }
  await _purAfterReceive(_purWin.po.id);
}

// Close every remaining line at once with one reason (e.g. "Billed in Peachtree, inv 12345").
// The DB trigger closes the PO itself once no line is left open/received.
async function purClosePo() {
  const w = _purWin, me = pMe();
  if (!w || !_purCanWork()) return;
  // Only lines accepted at incoming inspection can be closed as billed.
  const ids = w.lines.filter(l => l.status === 'received').map(l => l.id);
  const waiting = w.lines.filter(l => l.status === 'open').length;
  if (!ids.length) { pToast('Nothing has been accepted at inspection yet'); return; }
  const reason = (prompt(`Close ${ids.length === 1 ? 'the accepted line' : 'all ' + ids.length + ' accepted lines'} of ${pNo(w.po)}`
    + (waiting ? ` (${waiting} line${waiting === 1 ? '' : 's'} still waiting on inspection stay open)` : '') + ' — billed in Peachtree? Add the invoice number.',
    'Billed in Peachtree, inv ') || '').trim();
  if (!reason || reason === 'Billed in Peachtree, inv') return;
  const { error } = await sb.from('purchase_order_lines').update({ status: 'closed', closed_reason: reason, closed_by: me?.id || null }).in('id', ids);
  if (error) { pErr('Could not close the PO', error); return; }
  await _purReload(w.po.id);
  pToast(waiting ? '✓ Accepted lines closed — ' + waiting + ' still waiting on inspection' : '✓ ' + pNo(w.po) + ' closed');
}

// Packing list for the LOA items on this PR / PO (tied to it, carries its number).
async function purPackingList() {
  const w = _purWin;
  if (!w || typeof plCreate !== 'function') return;
  const assetLines = w.lines.filter(l => l.loa_asset_id);
  if (!assetLines.length) { pToast('No LOA items on this request'); return; }
  const assets = typeof loaAssets !== 'undefined' ? loaAssets : [];
  const lines = assetLines.map(l => {
    const a = assets.find(x => x.asset_id === l.loa_asset_id);
    return a && typeof plAssetLine === 'function' ? plAssetLine(a, l.cal_record_id || null)
      : { description: `${l.loa_asset_id} — ${l.description}`, asset_id: l.loa_asset_id, cal_record_id: l.cal_record_id || null };
  });
  const v = pVendor(w.po.vendor_id);
  const shipTo = typeof plShipToFromVendor === 'function' ? plShipToFromVendor(v) : null;
  const pl = await plCreate(shipTo || { ship_to_type: 'other', ship_to_name: '(ship to not set)' }, lines,
    { source: 'loa', po_pr_number: pNo(w.po), purchase_order_id: w.po.id, project_id: w.po.charge_to === 'job' ? w.po.project_id : null });
  if (!pl) return;
  pToast('✓ ' + pl.pl_number + ' created for ' + pNo(w.po));
  purCloseWindow();
  if (typeof openPackingList === 'function') openPackingList(pl.id);
}

// ---------- notifications (bell + email) ----------
// Bell: chatter_notifs row (no project), preview ends ||purchase:<id> so a click opens the window.
// Email: send-notification type 'purchase_notice' (best-effort; never blocks the action).
async function purNotify(empId, text, poId, email) {
  const me = pMe();
  if (!empId || !me || empId === me.id) return;
  try {
    await sb.from('chatter_notifs').insert({
      employee_id: empId, proj_id: null, msg_id: null,
      from_name: me.name || 'Workspace', from_initials: me.initials || 'W', from_color: me.color || '#888',
      preview: String(text).slice(0, 240) + '||purchase:' + poId, is_read: false, created_at: new Date().toISOString(),
    });
  } catch (e) { console.warn('[purchasing] bell notice failed', e); }
  if (email) {
    try {
      await sb.functions.invoke('send-notification', {
        body: { type: 'purchase_notice', data: { recipientIds: [empId], subject: email.subject, lines: email.lines || [], hash: 'purchase/' + poId } },
      });
    } catch (e) { console.warn('[purchasing] email notice failed', e); }
  }
}

// ---------- Approvals → Purchase Requests tab ----------
async function purPendingApprovalCount() {
  const me = pMe();
  if (!me || !pCan('approve_purchases') || typeof sb === 'undefined' || !sb) return 0;
  const { count, error } = await sb.from('purchase_orders').select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval').eq('approver_id', me.id);
  return error ? 0 : (count || 0);
}

async function renderApprovalsPurchasesTab() {
  const content = document.getElementById('approvalsTabContent');
  if (!content) return;
  const me = pMe();
  content.innerHTML = '<div class="pur-empty">Loading…</div>';
  await purEnsureRefs();
  const { data, error } = await sb.from('purchase_order_summary').select('*')
    .eq('status', 'pending_approval').eq('approver_id', me.id).order('submitted_at');
  if (error) { content.innerHTML = '<div class="pur-empty">Could not load purchase requests.</div>'; console.error(error); return; }
  const rows = data || [];
  window._cachedPendingPrCount = rows.length;
  content.innerHTML = `<div class="pur-appr">
    <div class="pur-sub">Requests over someone's limit that name you as their PR Approver.</div>
    ${rows.length ? rows.map(po => {
      const req = pEmp(po.requester_id), lim = Number(req?.purchaseLimit || 0);
      return `<div class="pur-card">
        <div class="pur-card-main">
          <div class="pur-card-top"><span class="pur-tag">Purchase request</span>
            <a href="#purchase/${po.id}" onclick="event.preventDefault();openPurchaseWindow('${po.id}')" class="mono">${pEsc(po.pr_number)}</a>
            <span class="pur-dim">from ${pEsc(req?.name || '')} · ${pDate(po.submitted_at)}</span></div>
          <div class="pur-card-what">${pEsc(pVendor(po.vendor_id)?.name || '—')} — ${_purWhat(po)} · <strong>${pMoney(po.total)}</strong></div>
          <div class="pur-dim">${pMoney(Number(po.total) - lim)} over ${pEsc((req?.name || '').split(' ')[0])}'s ${pMoney(lim)} limit · ${po.charge_to === 'job' ? pEsc(pProject(po.project_id)?.name || 'Job') : 'Overhead'}${po.vendor_quote_no ? ' · Quote ' + pEsc(po.vendor_quote_no) : ''}</div>
        </div>
        <div class="pur-card-btns">
          <button class="btn btn-ghost" onclick="openPurchaseWindow('${po.id}')">Open</button>
          <button class="btn btn-ghost pur-danger" onclick="_purQuick('${po.id}','reject')">Reject…</button>
          <button class="btn btn-primary" onclick="_purQuick('${po.id}','approve')">Approve</button>
        </div></div>`;
    }).join('') : '<div class="pur-empty">Nothing waiting for you. 🎉</div>'}
  </div>`;
  if (typeof _repaintApprovalsBadges === 'function') { try { _repaintApprovalsBadges(); } catch (e) {} }
}

async function _purQuick(id, action) {
  await openPurchaseWindow(id);
  if (!_purWin) return;
  if (action === 'approve') await purApprove();
  if (action === 'reject') await purReject();
}

// ---------- My Purchase Requests badge (open requests that need you) ----------
async function refreshMyPurchasesBadge() {
  const me = pMe(), badge = document.getElementById('myPurchasesBadge');
  if (!me || !badge || typeof sb === 'undefined' || !sb) return;
  const { count, error } = await sb.from('purchase_orders').select('id', { count: 'exact', head: true })
    .eq('requester_id', me.id).in('status', ['draft', 'awaiting_quote', 'rejected', 'approved']);
  const n = error ? 0 : (count || 0);
  badge.textContent = n;
  badge.style.display = n ? 'inline-flex' : 'none';
}

// ---------- LOA → Purchase Request (one per vendor, after a confirm) ----------
let _purLoaGroups = null;
async function purFromLoaSelection(ids) {
  if (!pCanPurchase()) { pToast('You are not set up to make purchase requests'); return; }
  if (typeof loaAssets === 'undefined') return;
  const list = (ids && ids.length ? ids : [...(typeof _loaSelected !== 'undefined' ? _loaSelected : [])])
    .map(id => loaAssets.find(a => a.asset_id === id)).filter(Boolean);
  if (!list.length) { pToast('Select assets first'); return; }
  await purEnsureRefs();
  // Last price paid per asset (and the vendor it was paid to).
  const { data: recs } = await sb.from('loa_cal_records').select('asset_id,vendor_id,cost,cal_date,sent_date')
    .in('asset_id', list.map(a => a.asset_id)).not('cost', 'is', null).order('cal_date', { ascending: false, nullsFirst: false });
  const last = {};
  (recs || []).forEach(r => { const k = r.asset_id + '|' + (r.vendor_id || ''); if (!(k in last)) last[k] = Number(r.cost); });
  const status = typeof loaStatus !== 'undefined' ? loaStatus : {};
  const groups = {};
  list.forEach(a => {
    const vid = status[a.asset_id]?.out_for_cal_vendor_id || a.cal_vendor_id || '';
    (groups[vid] = groups[vid] || []).push(a);
  });
  _purLoaGroups = Object.entries(groups).map(([vid, assets]) => ({ vendorId: vid || null, assets, last }));
  _purEnsureModal();
  _renderPurLoaConfirm();
  document.getElementById('purModal').classList.add('open');
}

function _purLoaCalType() { return purLineTypes.find(t => t.is_calibration) || purLineTypes.find(t => t.code === 'calibration') || null; }
function _purLoaLine(a, vendorId, last) {
  const bits = [a.manufacturer, a.model_no].filter(Boolean).join(' ');
  const price = last[a.asset_id + '|' + (vendorId || '')];
  return {
    _tmp: 1, line_type_id: _purLoaCalType()?.id || null,
    description: `Calibrate ${a.description || 'asset'}${bits ? ' (' + bits + (a.serial_no ? ', S/N ' + a.serial_no : '') + ')' : ''}`,
    qty: 1, unit_price: price != null && !isNaN(price) ? price : null, price_basis: 'estimate',
    loa_asset_id: a.asset_id, test_category: a.test_category || null,
  };
}

function _renderPurLoaConfirm() {
  const el = document.getElementById('purModalInner');
  if (!el || !_purLoaGroups) return;
  const g = _purLoaGroups;
  const vOpts = sel => '<option value="">— Pick a vendor —</option>' + purVendors.filter(v => ['approved', 'proposed'].includes(v.status) || v.id === sel)
    .map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${pEsc(v.name)}${v.status !== 'approved' ? ' (' + v.status + ')' : ''}</option>`).join('');
  el.innerHTML = `
    <div class="modal-header"><div class="modal-title">Purchase requests from the LOA</div>
      <button class="modal-close" aria-label="Close" onclick="purCloseWindow()">&#x2715;</button></div>
    <div class="modal-body pur-mbody">
      <div class="pur-sub">One purchase request per vendor. Change a group's vendor if it's going somewhere other than its usual cal vendor.
        Prices are the last price paid at that vendor (Estimate) — update them when the quote comes in.</div>
      ${g.map((grp, gi) => {
        const lines = grp.assets.map(a => _purLoaLine(a, grp.vendorId, grp.last));
        const tot = lines.reduce((t, l) => t + (l.unit_price || 0), 0);
        const unpriced = lines.filter(l => l.unit_price == null).length;
        return `<div class="pur-group">
          <div class="pur-group-head">
            <label class="field-label" for="purLoaV${gi}">Vendor</label>
            <select class="f-input" id="purLoaV${gi}" onchange="_purLoaGroups[${gi}].vendorId=this.value||null;_renderPurLoaConfirm()">${vOpts(grp.vendorId)}</select>
            <span class="pur-dim">${grp.assets.length} item${grp.assets.length !== 1 ? 's' : ''} · ${unpriced ? unpriced + ' without a past price' : 'est. ' + pMoney(tot)}</span>
          </div>
          <table class="pur-table pur-lines"><tbody>${lines.map(l => `<tr><td class="mono">${pEsc(l.loa_asset_id)}</td><td>${pEsc(l.description)}</td>
            <td class="num">${l.unit_price == null ? '<span class="pur-dim">no past price</span>' : pNum(l.unit_price)}</td></tr>`).join('')}</tbody></table>
        </div>`;
      }).join('')}
    </div>
    <div class="modal-footer pur-foot">
      <button class="btn btn-ghost" onclick="purCloseWindow()">Cancel</button><span style="flex:1"></span>
      <button class="btn btn-primary" onclick="purConfirmLoaGroups()">Create ${g.length} purchase request${g.length !== 1 ? 's' : ''}</button>
    </div>`;
}

async function purConfirmLoaGroups() {
  const groups = _purLoaGroups;
  if (!groups) return;
  if (groups.some(g => !g.vendorId)) { pToast('Pick a vendor for every group'); return; }
  const me = pMe(), made = [];
  for (const g of groups) {
    const v = pVendor(g.vendorId);
    const lines = g.assets.map(a => _purLoaLine(a, g.vendorId, g.last));
    // Quote-required vendors (or any line without a past price) start as Awaiting quote.
    const status = (v?.pricing !== 'trusted' || lines.some(l => l.unit_price == null)) ? 'awaiting_quote' : 'draft';
    const { data, error } = await sb.from('purchase_orders').insert({
      requester_id: me.id, created_by: me.id, vendor_id: g.vendorId, source: 'loa', status,
      charge_to: 'overhead', pricing: v?.pricing || 'quote_required',
    }).select().single();
    if (error) { pErr('Could not create the request for ' + (v?.name || 'a vendor'), error); continue; }
    const rows = lines.map((l, i) => ({
      purchase_order_id: data.id, line_no: i + 1, line_type_id: l.line_type_id, description: l.description, qty: 1,
      unit_price: l.unit_price, price_basis: 'estimate', loa_asset_id: l.loa_asset_id, test_category: l.test_category,
      gl_account: pType(l.line_type_id)?.gl_account || null,
    }));
    const r = await sb.from('purchase_order_lines').insert(rows);
    if (r.error) pErr('Could not add lines to ' + data.pr_number, r.error);
    made.push(data);
  }
  _purLoaGroups = null;
  if (typeof _loaSelected !== 'undefined') { _loaSelected.clear(); if (typeof renderLoaPanel === 'function') renderLoaPanel(); }
  refreshMyPurchasesBadge();
  if (made.length === 1) { await openPurchaseWindow(made[0].id); pToast('✓ ' + made[0].pr_number + ' created'); }
  else if (made.length > 1) { purCloseWindow(); pToast('✓ Created ' + made.map(p => p.pr_number).join(', ')); openMyPurchasesPanel(); }
  else purCloseWindow();
}

// ---------- Print PO / RFQ ----------
function purPrint(rfq) {
  const w = _purWin;
  if (!w) return;
  const po = w.po, v = pVendor(po.vendor_id) || {};
  const isRfq = !!rfq || !po.po_number;
  const total = _purTotal();
  const vendAddr = [v.name, v.address, [v.city, v.state].filter(Boolean).join(', ') + (v.zip ? '  ' + v.zip : '')].filter(x => x && x.trim()).map(pEsc).join('<br>');
  const issued = po.approved_at || po.created_at || new Date().toISOString();
  const goodThru = po.good_thru || new Date(new Date(issued).getTime() + 30 * 86400000).toISOString();
  const sig = isRfq ? '' : (po.auto_approved
    ? `Auto-approved (under ${pEsc(pEmpName(po.requester_id))}'s limit) · ${pDate(po.approved_at)}`
    : `Approved by ${pEsc(pEmpName(po.approved_by))} · ${pDate(po.approved_at)}`);
  const job = po.charge_to === 'job' ? pProject(po.project_id)?.name : '';
  const rows = w.lines.map(l => `<tr>
    <td class="n">${pEsc(Number(l.qty))}</td>
    <td>${pEsc(pType(l.line_type_id)?.name || '')}</td>
    <td>${pEsc(l.description || '')}${l.loa_asset_id ? '<div class="s">Asset ' + pEsc(l.loa_asset_id) + '</div>' : ''}</td>
    <td class="n">${isRfq ? '' : (l.unit_price == null ? '' : pNum(l.unit_price))}</td>
    <td class="n">${isRfq ? '' : (l.unit_price == null ? '' : pNum((Number(l.qty) || 0) * Number(l.unit_price)))}</td></tr>`).join('');
  const notes = [job ? 'NUI Job: ' + job : '', po.vendor_quote_no ? 'Your quote: ' + po.vendor_quote_no : '', po.notes || ''].filter(Boolean);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${pEsc(isRfq ? 'RFQ ' + (po.pr_number || '') : po.po_number)}</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5px; margin: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; }
  .co .lbl { font-size: 11px; } .co .nm { font-size: 19px; font-weight: 700; margin: 4px 0 2px; }
  .big { font-size: 34px; font-weight: 800; color: #777; line-height: 1; letter-spacing: 1px; }
  .meta td { padding: 1px 10px 1px 0; }
  .boxes { display: flex; gap: 40px; margin: 22px 0 14px; }
  .box { flex: 1; border: 1px solid #333; } .box .h { background: #ccc; border-bottom: 1px solid #333; padding: 3px 8px; font-weight: 700; }
  .box .b { padding: 8px 10px; min-height: 70px; line-height: 1.35; }
  table.g { width: 100%; border-collapse: collapse; }
  table.g th { background: #ccc; border: 1px solid #333; padding: 3px 6px; font-weight: 700; }
  table.g td { border-left: 1px solid #333; border-right: 1px solid #333; padding: 4px 6px; vertical-align: top; }
  table.g.lines tbody tr:last-child td { border-bottom: 1px solid #333; }
  table.g.hdr td { border: 1px solid #333; text-align: center; }
  .n { text-align: right; white-space: nowrap; } .s { font-size: 10.5px; color: #444; }
  .tot { display: flex; justify-content: flex-end; margin-top: -1px; }
  .tot table { border-collapse: collapse; } .tot td { border: 1px solid #333; padding: 4px 8px; font-weight: 700; background: #ccc; min-width: 110px; }
  .notes { margin-top: 18px; white-space: pre-line; }
  .cal { margin: 18px 0 0 180px; font-weight: 700; } .cal div { margin-bottom: 4px; }
  .sig { margin-top: 36px; display: flex; gap: 12px; align-items: flex-end; }
  .sig .line { border-bottom: 1px solid #333; min-width: 320px; padding: 0 4px 2px; font-size: 12px; }
</style></head><body>
<div class="top">
  <div class="co"><div class="lbl">ORDERED BY:</div><div class="nm">${NU_COMPANY.name}</div>${NU_COMPANY.address}<br>${NU_COMPANY.cityLine}
    <div style="margin-top:12px">Voice: ${NU_COMPANY.voice}<br>Fax: ${NU_COMPANY.fax}</div></div>
  <div><div class="big">${isRfq ? 'REQUEST FOR<br>QUOTE' : 'PURCHASE<br>ORDER'}</div>
    <table class="meta" style="margin-top:6px"><tr><td>${isRfq ? 'Request No.:' : 'Purchase Order No.:'}</td><td>${pEsc(isRfq ? (po.pr_number || '') : po.po_number)}</td></tr>
    <tr><td>Date Issued:</td><td>${pDate(isRfq ? new Date().toISOString() : issued)}</td></tr></table></div>
</div>
<div class="boxes">
  <div class="box"><div class="h">To:</div><div class="b">${vendAddr || '&nbsp;'}</div></div>
  <div class="box"><div class="h">Ship To:</div><div class="b">${NU_COMPANY.name}<br>${NU_COMPANY.address}<br>${NU_COMPANY.cityLine}</div></div>
</div>
<table class="g hdr"><tr><th>Good Thru</th><th>Ship Via</th><th>Account No.</th><th>Terms</th></tr>
  <tr><td>${isRfq ? '' : pDate(goodThru)}</td><td>${pEsc(po.ship_via || '')}</td><td>${pEsc(v.account_number || '')}</td><td>${pEsc(v.payment_terms || '')}</td></tr></table>
<table class="g lines" style="margin-top:10px"><thead><tr><th style="width:70px">Quantity</th><th style="width:120px">Item</th><th>Description</th><th style="width:90px">Unit Cost</th><th style="width:100px">Amount</th></tr></thead>
  <tbody>${rows}<tr><td style="height:${Math.max(40, 260 - w.lines.length * 34)}px"></td><td></td><td></td><td></td><td></td></tr></tbody></table>
${isRfq ? '<div class="notes"><strong>Please quote the items above.</strong></div>' : `<div class="tot"><table><tr><td>TOTAL</td><td class="n">${pMoney(total)}</td></tr></table></div>`}
${notes.length ? `<div class="notes">${notes.map(pEsc).join('\n')}</div>` : ''}
${_purHasCal() ? `<div class="cal">${PUR_CAL_INSTRUCTION.map(t => `<div>${pEsc(t)}</div>`).join('')}</div>` : ''}
${isRfq ? '' : `<div class="sig"><span>Authorized Signature</span><span class="line">${sig}</span></div>`}
<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };<\/script>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { pToast('Allow pop-ups for Workspace to print'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}

// ---------- globals for inline handlers / router ----------
Object.assign(window, {
  openMyPurchasesPanel, openPurchasesPanel, openPurchaseWindow, purNewRequest, purCloseWindow, renderPurchasesList,
  _purSetFilter, _purSet, _purVendorChanged, _purPickJob, _purLine, _purAddLine, _purRemoveLine, purProposeVendor,
  purSave, purSubmit, purApprove, purReject, purRecall, purCancel, purDeleteDraft, purMarkSent, purClosePo, purInspectNote, purReceiveLine,
  purReceiveAll, purCloseLine, purPackingList, purPrint, renderApprovalsPurchasesTab, purPendingApprovalCount,
  _purQuick, refreshMyPurchasesBadge, purFromLoaSelection, purConfirmLoaGroups, _renderPurLoaConfirm,
});
