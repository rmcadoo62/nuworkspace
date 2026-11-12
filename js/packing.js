// ===== PACKING LISTS =====
// Shared packing lists, built from what you select:
//   * LOA — tick assets → "Packing list" (new or add to a draft), or
//           "Send out for cal" with "Create packing list" ticked.
//   * Shipping & Receiving — open an in-house article → "Packing List";
//           pick the other in-house articles for the same job.
//   * Shipping & Receiving → Packing Lists tab — find, edit, print, void.
//
// Tables (migration 2026-10-29_packing_lists.sql): packing_lists,
// packing_list_lines. The DATABASE assigns PL-YYYY-NNNN on insert and
// enforces the lifecycle: draft (editable) → shipped (locked except
// tracking #) → void (locked). No deletes — void instead.
//
// Marking a list Shipped also marks its test articles shipped (date +
// carrier), so the shipment is recorded once.
//
// Direction (Batch 3, migration 2026-11-09): every list is Outgoing or
// Incoming, sharing one PL-YYYY-NNNN series. Incoming = customer property
// dropped off without paperwork: the party block is FROM, "shipped" shows as
// Received, and it never touches test-article status. "Create Return List"
// makes a linked outgoing list (return_of_id). An incoming list that's been
// received with no live return is customer property still on site.
//
// Unsaved drafts (Batch 3.1, Scott): starting a list opens it in memory
// (_plEditId = PL_NEW). No row and no PL number until Save; Cancel/close
// discards it, nothing to void. Print saves first. Exception: LOA multi-vendor
// and Send-out create their lists straight away (one per vendor, confirmed).
//
// Capabilities (Setup → Permissions → Packing Lists):
//   create_packing_lists — create, edit, mark shipped
//   void_packing_lists   — void
// Viewing and printing follow Shipping & Receiving (everyone).

const PL_COMPANY = { name: 'NU Laboratories, Inc.', street: '312 Old Allerton Road', city: 'Annandale, NJ 08801' };
const PL_CARRIERS = ['UPS', 'FedEx', 'USPS', 'Customer Pickup', 'Customer Drop-off', 'Customer Delivered', 'Hand Delivered', 'Vendor Pickup', 'Other'];
const PL_STATUS = { draft: 'Draft', shipped: 'Shipped', void: 'Void' };

let plStore = [];            // header rows + line_count
let _plLoaded = false;
let _plTab = 'articles';     // Shipping & Receiving tab: 'articles' | 'lists'
let _plSearch = '';
let _plStatusFilter = 'open';  // open (draft) | shipped | void | all
let _plEditId = null;
const PL_NEW = '__new__';      // _plEditId while an unsaved draft is open
let _plNewDraft = null;        // that draft's header (not in the database yet)
// Header of the list open in the drawer — saved or not.
function plCur() { return _plEditId === PL_NEW ? _plNewDraft : plStore.find(p => p.id === _plEditId); }
let _plEditLines = [];       // working copy of lines in the editor
let _plPendingLines = null;  // lines waiting for "new or add to draft"
let _plPendingShipTo = null;

// ---------- helpers ----------
function plCanCreate() { return typeof can === 'function' ? can('create_packing_lists') : false; }
function plCanVoid()   { return typeof can === 'function' ? can('void_packing_lists')   : false; }
function plEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plToast(m) { if (typeof toast === 'function') toast(m); }
function plErr(prefix, e) { console.error('[packing] ' + prefix, e); plToast('⚠ ' + prefix + (e && e.message ? ': ' + e.message : '')); }
function plActor() {
  const e = (typeof realEmployee !== 'undefined' && realEmployee) ? realEmployee
          : (typeof currentEmployee !== 'undefined' ? currentEmployee : null);
  return e || null;
}
function plToday() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function plFmt(d) {
  if (!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function plNum(n) { const x = Number(n); return Number.isInteger(x) ? String(x) : String(x); }
// Carrier suggestions: the standard list plus anything typed before (on packing lists or
// test articles), so a new "Other" carrier becomes part of the list after first use.
function plCarrierOptions() {
  const seen = new Map();
  const add = v => { const t = String(v || '').trim(); if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); };
  PL_CARRIERS.filter(c => c !== 'Other').forEach(add);
  plStore.forEach(p => add(p.shipped_via));
  if (typeof articleStore !== 'undefined') articleStore.forEach(a => { add(a.carrier); add(a.receivedCarrier); });
  return [...seen.values()];
}

// ---------- direction ----------
function plIsIn(h) { return !!h && h.direction === 'incoming'; }
function plStatusLabel(h) { return h.status === 'shipped' && plIsIn(h) ? 'Received' : PL_STATUS[h.status]; }
function plDirBadge(h) { return plIsIn(h) ? '<span class="pl-dir in">&#x1F4E5; Incoming</span>' : '<span class="pl-dir out">&#x1F4E4; Outgoing</span>'; }
function plReturnOf(h) { return h && h.return_of_id ? plStore.find(p => p.id === h.return_of_id) : null; }
function plReturnsFor(h) { return plStore.filter(p => p.return_of_id === h.id && p.status !== 'void'); }
// Received incoming list with no live return list = that customer property is still here.
function plOnSite(p) { return plIsIn(p) && p.status === 'shipped' && !plReturnsFor(p).length; }

function plProject(id) { return (typeof projects !== 'undefined') ? projects.find(p => p.id === id) : null; }
// Customer's PO on the job (project_info.po_number) — the packing list's Cust. Order No.
function plJobPo(id) { return (id && typeof projectInfo !== 'undefined' && projectInfo[id]) ? (projectInfo[id].po || '') : ''; }
function plAddress(o) {
  if (!o) return '';
  const cityLine = [o.city, [o.state, o.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [o.address, cityLine].filter(Boolean).join('\n');
}
// Ship-to block from a vendor or client record.
function plShipToFromVendor(v) {
  return v ? { ship_to_type: 'vendor', vendor_id: v.id, client_id: null, ship_to_name: v.name, ship_to_address: plAddress(v) } : null;
}
function plShipToFromClient(c) {
  return c ? { ship_to_type: 'client', client_id: c.id, vendor_id: null, ship_to_name: c.name, ship_to_address: plAddress(c) } : null;
}

// ---------- data ----------
async function loadPackingLists() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('packing_lists').select('*, packing_list_lines(count)')
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) { plErr('Could not load packing lists', error); return; }
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  plStore = out.map(r => ({ ...r, line_count: r.packing_list_lines?.[0]?.count ?? 0 }));
  _plLoaded = true;
}

async function plLoadOne(id) {
  const [h, l] = await Promise.all([
    sb.from('packing_lists').select('*').eq('id', id).maybeSingle(),
    sb.from('packing_list_lines').select('*').eq('packing_list_id', id).order('line_no').order('created_at'),
  ]);
  if (h.error || l.error) { plErr('Could not load packing list', h.error || l.error); return null; }
  if (!h.data) return null;
  const i = plStore.findIndex(x => x.id === id);
  const row = { ...h.data, line_count: (l.data || []).length };
  if (i >= 0) plStore[i] = row; else plStore.unshift(row);
  return { header: h.data, lines: l.data || [] };
}

// ---------- create / add ----------
// Open a new list in the drawer WITHOUT saving it. No number until Save; Cancel discards.
function plOpenNew(shipTo, lines, extra) {
  if (!plCanCreate()) { plToast('Your role cannot create packing lists'); return; }
  _plNewDraft = { ...plBuildHeader(shipTo, extra, true), id: PL_NEW, pl_number: 'New', status: 'draft', created_at: new Date().toISOString() };
  _plEditLines = (lines || []).map(l => ({ id: null, qty_ordered: l.qty_ordered ?? 1, qty_backordered: l.qty_backordered ?? 0,
    qty_shipped: l.qty_shipped ?? 1, description: l.description, asset_id: l.asset_id || null,
    cal_record_id: l.cal_record_id || null, test_article_id: l.test_article_id || null }));
  plEnsureDrawer();
  _plEditId = PL_NEW;
  document.getElementById('plDrawer').classList.add('open');
  document.getElementById('plDrawerBackdrop').classList.add('open');
  plRenderEditor(_plNewDraft);
}

// lines: [{description, qty_ordered?, qty_shipped?, qty_backordered?, asset_id?, cal_record_id?, test_article_id?}]
// The columns a new list starts with. unsaved: leave the name blank for the user to fill in.
function plBuildHeader(shipTo, extra, unsaved) {
  const actor = plActor();
  return {
    ship_to_type: shipTo?.ship_to_type || 'other',
    vendor_id: shipTo?.vendor_id || null,
    client_id: shipTo?.client_id || null,
    ship_to_name: shipTo?.ship_to_name || (unsaved ? '' : (extra?.direction === 'incoming' ? '(from not set)' : '(ship to not set)')),
    ship_to_address: shipTo?.ship_to_address || null,
    ship_to_attn: shipTo?.ship_to_attn || null,
    direction: extra?.direction === 'incoming' ? 'incoming' : 'outgoing',
    return_of_id: extra?.return_of_id || null,
    source: extra?.source || 'manual',
    project_id: extra?.project_id || null,
    cust_order_no: extra?.cust_order_no || plJobPo(extra?.project_id) || null,
    po_pr_number: extra?.po_pr_number || null,
    purchase_order_id: extra?.purchase_order_id || null,
    shipped_via: extra?.shipped_via || null,
    date_shipped: extra?.date_shipped || null,
    notes: extra?.notes || null,
    packed_by: actor?.name || null,
    created_by: actor?.id || null,
  };
}

// Saves immediately (gets a number). Used where lists are made in bulk: LOA multi-vendor / Send-out.
async function plCreate(shipTo, lines, extra) {
  if (!plCanCreate()) { plToast('Your role cannot create packing lists'); return null; }
  const header = plBuildHeader(shipTo, extra, false);
  const { data, error } = await sb.from('packing_lists').insert(header).select().single();
  if (error) { plErr('Could not create packing list', error); return null; }
  if (lines && lines.length) {
    const ok = await plInsertLines(data.id, lines, 0);
    if (!ok) return data;
  }
  await plLoadOne(data.id);
  return data;
}

async function plInsertLines(plId, lines, startNo) {
  const rows = lines.map((ln, i) => ({
    packing_list_id: plId,
    line_no: startNo + i + 1,
    qty_ordered: ln.qty_ordered ?? 1,
    qty_backordered: ln.qty_backordered ?? 0,
    qty_shipped: ln.qty_shipped ?? 1,
    description: ln.description,
    asset_id: ln.asset_id || null,
    cal_record_id: ln.cal_record_id || null,
    test_article_id: ln.test_article_id || null,
  }));
  const { error } = await sb.from('packing_list_lines').insert(rows);
  if (error) { plErr('Could not add lines', error); return false; }
  return true;
}

async function plAddToDraft(plId, lines) {
  const one = await plLoadOne(plId);
  if (!one) return false;
  if (one.header.status !== 'draft') { plToast('⚠ ' + one.header.pl_number + ' is no longer a draft'); return false; }
  // Skip anything already on the list.
  const have = new Set(one.lines.map(l => l.asset_id || l.test_article_id).filter(Boolean));
  const fresh = lines.filter(l => !have.has(l.asset_id || l.test_article_id));
  if (!fresh.length) { plToast('Those items are already on ' + one.header.pl_number); return true; }
  const maxNo = one.lines.reduce((m, l) => Math.max(m, l.line_no || 0), 0);
  const ok = await plInsertLines(plId, fresh, maxNo);
  await plLoadOne(plId);
  return ok;
}

// "New packing list or add to a draft?" — used by LOA and S&R.
async function plStartFrom(lines, shipTo, extra) {
  if (!plCanCreate()) { plToast('Your role cannot create packing lists'); return; }
  if (!lines || !lines.length) { plToast('Nothing selected'); return; }
  await loadPackingLists();
  // Only drafts that fit: same Ship To, or a draft whose Ship To isn't set yet.
  // Shipped and void lists never appear here.
  const unset = d => d.ship_to_type === 'other' && (!d.ship_to_name || d.ship_to_name.startsWith('(ship to') || d.ship_to_name.startsWith('(from'));
  const same = d => shipTo && ((shipTo.vendor_id && d.vendor_id === shipTo.vendor_id) ||
                               (shipTo.client_id && d.client_id === shipTo.client_id));
  const dir = extra?.direction === 'incoming' ? 'incoming' : 'outgoing';
  const drafts = plStore.filter(p => p.status === 'draft' && (p.direction || 'outgoing') === dir && (same(p) || unset(p)))
    .sort((a, b) => (same(b) ? 1 : 0) - (same(a) ? 1 : 0));
  _plPendingLines = lines; _plPendingShipTo = { shipTo, extra };
  const what = `${lines.length} item${lines.length !== 1 ? 's' : ''}${shipTo?.ship_to_name ? (dir === 'incoming' ? ' from <strong>' : ' to <strong>') + plEsc(shipTo.ship_to_name) + '</strong>' : ''}`;
  const kindWord = dir === 'incoming' ? 'an incoming packing list' : 'a packing list';

  // Nothing to add to → open a new, unsaved list straight away (no number until Save).
  if (!drafts.length) {
    _plPendingLines = null; _plPendingShipTo = null;
    plOpenNew(shipTo, lines, extra);
    return;
  }
  plModal(dir === 'incoming' ? 'Incoming packing list' : 'Packing list', `
    <div class="pl-meta">${what}.</div>
    <label class="pl-choice"><input type="radio" name="plDest" value="new" checked /> <span><strong>New ${dir === 'incoming' ? 'incoming ' : ''}packing list</strong>
      <span class="pl-dim">· numbered when you save</span></span></label>
    <div class="pl-choice-head">or add to a draft</div>
    ${drafts.map(d => `<label class="pl-choice"><input type="radio" name="plDest" value="${d.id}" />
      <span><span class="pl-mono">${plEsc(d.pl_number)}</span> — ${plEsc(d.ship_to_name)}
      <span class="pl-dim">· ${d.line_count} line${d.line_count !== 1 ? 's' : ''} · ${plFmt(d.created_at)}</span>
      ${same(d) ? '<span class="pl-tag">same ship-to</span>' : ''}</span></label>`).join('')}`,
    `<button class="btn btn-ghost" onclick="plCloseModal()">Cancel</button>
     <button class="btn btn-primary" style="margin-left:auto" onclick="plConfirmStart()">Continue</button>`);
}

async function plConfirmStart() {
  const dest = document.querySelector('input[name="plDest"]:checked')?.value || 'new';
  const lines = _plPendingLines, ctx = _plPendingShipTo || {};
  plCloseModal();
  _plPendingLines = null; _plPendingShipTo = null;
  if (dest === 'new') {
    plOpenNew(ctx.shipTo, lines, ctx.extra);
  } else {
    const ok = await plAddToDraft(dest, lines);
    if (ok) { plToast('✓ Added to ' + (plStore.find(p => p.id === dest)?.pl_number || 'packing list')); openPackingList(dest); }
  }
}

// ---------- from LOA ----------
function plAssetLine(a, calRecordId) {
  const bits = [a.manufacturer, a.model_no].filter(Boolean).join(' ');
  const sn = a.serial_no ? 'S/N ' + a.serial_no : '';
  const tail = [bits, sn].filter(Boolean).join(', ');
  return {
    description: `${a.asset_id} — ${a.description || 'Asset'}${tail ? ' (' + tail + ')' : ''}`,
    asset_id: a.asset_id, cal_record_id: calRecordId || null,
  };
}

function plFromLoaSelection(ids) {
  if (typeof loaAssets === 'undefined') return;
  const list = (ids && ids.length ? ids : [...(typeof _loaSelected !== 'undefined' ? _loaSelected : [])])
    .map(id => loaAssets.find(a => a.asset_id === id)).filter(Boolean);
  if (!list.length) { plToast('Select assets first'); return; }
  const status = typeof loaStatus !== 'undefined' ? loaStatus : {};
  // Vendor per item: where it actually went if it's out for cal, else its usual cal vendor.
  const vendOf = a => status[a.asset_id]?.out_for_cal_vendor_id || a.cal_vendor_id || null;
  const groups = {};
  list.forEach(a => { const k = vendOf(a) || 'none'; (groups[k] = groups[k] || []).push(a); });
  const keys = Object.keys(groups);
  const vend = id => (id !== 'none' && typeof vendorStore !== 'undefined') ? vendorStore.find(x => x.id === id) : null;

  // One vendor → the usual flow (new list or add to that vendor's draft), vendor filled in.
  if (keys.length === 1) {
    const lines = list.map(a => plAssetLine(a, status[a.asset_id]?.open_cal_id || null));
    plStartFrom(lines, plShipToFromVendor(vend(keys[0])), { source: 'loa' });
    return;
  }
  // Several vendors → one packing list per vendor, after one confirm.
  _plVendorGroups = keys.map(k => ({
    vendor: vend(k), assets: groups[k],
    calIds: Object.fromEntries(groups[k].map(a => [a.asset_id, status[a.asset_id]?.open_cal_id || null])),
  }));
  plModal('Packing lists', `
    <div style="font-size:13.5px;color:var(--text)">These items go to ${keys.length} different places. Create one packing list for each?</div>
    <div class="pl-art-list">${_plVendorGroups.map(g => `<div class="pl-choice" style="cursor:default">
      <span><strong>${plEsc(g.vendor ? g.vendor.name : 'Vendor not set')}</strong>
      <span class="pl-dim">· ${g.assets.length} item${g.assets.length !== 1 ? 's' : ''}</span></span></div>`).join('')}</div>
    <div class="pl-meta">Each list gets the next PL number.${groups.none ? ' Items with no vendor go on a list where you pick the vendor.' : ''}</div>`,
    `<button class="btn btn-ghost" onclick="plCloseModal()">Cancel</button>
     <button class="btn btn-primary" style="margin-left:auto" onclick="plConfirmVendorGroups()">Create ${keys.length} packing lists</button>`);
}

let _plVendorGroups = null;
async function plConfirmVendorGroups() {
  const groups = _plVendorGroups; _plVendorGroups = null;
  plCloseModal();
  if (groups && groups.length) await plCreateForSendOut(groups);
}

// Called by LOA's Send-out after cal records are created. One list per vendor.
async function plCreateForSendOut(groups, shippedVia) {
  // groups: [{ vendor, assets:[asset], calIds:{asset_id: cal_record_id} }]
  const made = [];
  for (const g of groups) {
    const lines = g.assets.map(a => plAssetLine(a, g.calIds[a.asset_id]));
    const pl = await plCreate(plShipToFromVendor(g.vendor) || { ship_to_type: 'other', ship_to_name: '(ship to not set)' },
      lines, { source: 'loa', shipped_via: shippedVia || null });
    if (pl) made.push(pl);
  }
  if (made.length === 1) openPackingList(made[0].id);
  else if (made.length > 1) { plToast('✓ Created ' + made.map(p => p.pl_number).join(', ')); _plTab = 'lists'; if (typeof openShippingPanel === 'function') openShippingPanel(document.getElementById('navShipping')); }
  return made;
}

// ---------- from Shipping & Receiving ----------
// dir: 'outgoing' (default — returning goods) or 'incoming' (documenting a drop-off).
// receipt (incoming, optional): { date, via } from the Receive Test Article form.
let _plPendingReceipt = null;
function plFromArticle(articleId, dir, receipt) {
  dir = dir === 'incoming' ? 'incoming' : 'outgoing';
  _plPendingReceipt = dir === 'incoming' ? (receipt || null) : null;
  const id = articleId || (typeof _editingArticleId !== 'undefined' ? _editingArticleId : null);
  const art = (typeof articleStore !== 'undefined') ? articleStore.find(a => a._id === id) : null;
  if (!art) { plToast('Save the article first'); return; }
  if (typeof closeArticleModal === 'function') closeArticleModal();
  // Other un-shipped articles on the same job (or same client when there's no job).
  const siblings = articleStore.filter(a => a._id !== art._id && a.status !== 'shipped' &&
    (art.projId ? a.projId === art.projId : (art.clientId && a.clientId === art.clientId)));
  const proj = plProject(art.projId);
  plModal((dir === 'incoming' ? 'Incoming packing list for ' : 'Packing list for ') + (proj ? proj.name : (art.clientName || 'this article')), `
    <div class="pl-meta">${dir === 'incoming' ? 'Tick everything the customer left with us.' : 'Tick everything going in this shipment.'}</div>
    <div class="pl-art-list">
      ${[art, ...siblings].map(a => `<label class="pl-choice"><input type="checkbox" class="plArt" value="${a._id}" ${a._id === art._id ? 'checked' : ''} />
        <span>${plEsc(a.desc)} <span class="pl-dim">· ${a.status === 'in_storage' ? 'in storage' : 'in house'}${a.receivedDate ? ' · received ' + plFmt(a.receivedDate) : ''}</span></span></label>`).join('')}
    </div>`,
    `<button class="btn btn-ghost" onclick="plCloseModal()">Cancel</button>
     <button class="btn btn-primary" style="margin-left:auto" onclick="plConfirmArticles('${art._id}','${dir}')">Continue</button>`);
}

function plConfirmArticles(firstId, dir) {
  const ids = [...document.querySelectorAll('.plArt:checked')].map(cb => cb.value);
  plCloseModal();
  if (!ids.length) return;
  const arts = ids.map(id => articleStore.find(a => a._id === id)).filter(Boolean);
  const first = arts.find(a => a._id === firstId) || arts[0];
  const client = (typeof clientStore !== 'undefined' && first.clientId) ? clientStore.find(c => c.id === first.clientId)
    : null;
  let shipTo = plShipToFromClient(client);
  if (!shipTo && first.clientName) shipTo = { ship_to_type: 'other', ship_to_name: first.clientName };
  const lines = arts.map(a => ({ description: a.desc, test_article_id: a._id }));
  const rc = dir === 'incoming' ? _plPendingReceipt : null;
  _plPendingReceipt = null;
  plStartFrom(lines, shipTo, { source: 'articles', project_id: first.projId || null, direction: dir === 'incoming' ? 'incoming' : 'outgoing',
    date_shipped: rc?.date || null, shipped_via: rc?.via || null });
}

// Packing Lists tab → "+ Incoming list": a blank incoming draft.
function plNewIncoming() {
  plOpenNew(null, [], { source: 'manual', direction: 'incoming' });
}

// Received incoming list → a new outgoing draft back to the same customer, same lines, linked.
async function plCreateReturn() {
  const h = plCur();
  if (!h || !plIsIn(h) || !plCanCreate()) return;
  const live = plReturnsFor(h);
  if (live.length) { openPackingList(live[0].id); return; }
  const one = await plLoadOne(h.id);
  if (!one) return;
  const lines = one.lines.map(l => ({ description: l.description, qty_ordered: l.qty_shipped ?? l.qty_ordered ?? 1,
    qty_shipped: l.qty_shipped ?? 1, test_article_id: l.test_article_id || null, asset_id: l.asset_id || null }));
  const shipTo = { ship_to_type: h.ship_to_type, vendor_id: h.vendor_id, client_id: h.client_id,
    ship_to_name: h.ship_to_name, ship_to_address: h.ship_to_address, ship_to_attn: h.ship_to_attn };
  plOpenNew(shipTo, lines, {
    direction: 'outgoing', return_of_id: h.id, project_id: h.project_id, cust_order_no: h.cust_order_no,
    source: lines.some(l => l.test_article_id) ? 'articles' : 'manual',
  });
}

// ---------- editor (drawer) ----------
function plEnsureDrawer() {
  if (document.getElementById('plDrawer')) return;
  const bd = document.createElement('div');
  bd.className = 'client-drawer-backdrop'; bd.id = 'plDrawerBackdrop'; bd.onclick = () => closePackingList();
  const dr = document.createElement('div');
  dr.className = 'client-drawer pl-drawer'; dr.id = 'plDrawer';
  dr.innerHTML = `
    <div class="client-drawer-header">
      <div class="client-drawer-title" id="plDrawerTitle">Packing List</div>
      <button class="client-drawer-close" onclick="closePackingList()">&#x2715;</button>
    </div>
    <div class="client-drawer-body" id="plDrawerBody"></div>
    <div class="client-save-bar" id="plSaveBar"></div>`;
  document.body.appendChild(bd); document.body.appendChild(dr);
}

async function openPackingList(id) {
  plEnsureDrawer();
  _plEditId = id;
  document.getElementById('plDrawerBody').innerHTML = '<div class="pl-empty">Loading…</div>';
  document.getElementById('plSaveBar').innerHTML = '';
  document.getElementById('plDrawer').classList.add('open');
  document.getElementById('plDrawerBackdrop').classList.add('open');
  const one = await plLoadOne(id);
  if (!one || _plEditId !== id) return;
  _plEditLines = one.lines.map(l => ({ ...l }));
  plRenderEditor(one.header);
}

// An unsaved new list is discarded on close (asks first). force: skip the question.
function closePackingList(force) {
  if (_plEditId === PL_NEW && force !== true &&
      !confirm('Discard this new packing list?\n\nIt was never saved, so no PL number was used.')) return;
  if (_plEditId === PL_NEW) _plNewDraft = null;
  document.getElementById('plDrawer')?.classList.remove('open');
  document.getElementById('plDrawerBackdrop')?.classList.remove('open');
  _plEditId = null;
  if (_plTab === 'lists' && document.getElementById('panel-shipping')?.classList.contains('active')) renderPackingListsTab();
}

function plRenderEditor(h) {
  const draft = h.status === 'draft';
  const edit = draft && plCanCreate();
  const dis = edit ? '' : 'disabled';
  const proj = plProject(h.project_id);
  // vendor = cal send-out (from LOA) · client = returning goods (from Shipping) · other = typed in
  const inc = plIsIn(h);
  const kind = inc ? 'client'
             : (h.ship_to_type === 'vendor' || h.source === 'loa') ? 'vendor'
             : (h.ship_to_type === 'client' || h.source === 'articles') ? 'client' : 'other';
  const retOf = plReturnOf(h), rets = inc ? plReturnsFor(h) : [];
  const contacts = plContactNames(h);
  const st = `<span class="pl-status ${h.status}">${plStatusLabel(h)}</span>`;
  const isNew = h.id === PL_NEW;
  document.getElementById('plDrawerTitle').innerHTML = (isNew ? 'New packing list' : plEsc(h.pl_number)) + ' ' + plDirBadge(h) + ' ' +
    (isNew ? '<span class="pl-status draft">Not saved</span>' : st);

  const vendOpts = (typeof vendorStore !== 'undefined' ? vendorStore : []).filter(v => v.status === 'approved' || v.id === h.vendor_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const cliOpts = (typeof clientStore !== 'undefined' ? clientStore : []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const f = (label, id, val, extra) => `<div class="client-field"><label>${label}</label>
    <input id="${id}" type="text" value="${plEsc(val || '')}" ${dis} ${extra || ''} /></div>`;

  const linesHtml = _plEditLines.map((l, i) => {
    const tag = l.asset_id ? `<span class="pl-tag">LOA ${plEsc(l.asset_id)}</span>`
      : l.test_article_id ? '<span class="pl-tag">test article</span>' : '';
    return `<tr>
      <td><input type="number" min="0" step="1" class="pl-qty" value="${plNum(l.qty_ordered)}" ${dis} onchange="_plEditLines[${i}].qty_ordered=this.value" /></td>
      <td><input type="number" min="0" step="1" class="pl-qty" value="${plNum(l.qty_shipped)}" ${dis} onchange="_plEditLines[${i}].qty_shipped=this.value" /></td>
      <td><input type="text" class="pl-desc" value="${plEsc(l.description)}" ${dis} onchange="_plEditLines[${i}].description=this.value" />${tag}</td>
      <td>${edit ? `<button class="client-action-btn" title="Remove line" onclick="plRemoveLine(${i})">&#x2715;</button>` : ''}</td>
    </tr>`;
  }).join('');

  document.getElementById('plDrawerBody').innerHTML = `
    ${h.status === 'void' ? `<div class="pl-banner void">Void${h.void_reason ? ': ' + plEsc(h.void_reason) : ''} — ${plFmt(h.voided_at)}</div>` : ''}
    ${isNew ? `<div class="pl-banner link">Not saved yet — the PL number is assigned when you click <b>Save</b>. <b>Cancel</b> throws it away with nothing to void.</div>` : ''}
    ${h.status === 'shipped' ? `<div class="pl-banner shipped">${inc ? 'Received' : 'Shipped'} ${plFmt(h.date_shipped)}${h.shipped_via ? ' via ' + plEsc(h.shipped_via) : ''}. Locked — only the tracking number can be added.</div>` : ''}
    ${retOf ? `<div class="pl-banner link">&#x21A9; Return of <a onclick="openPackingList('${retOf.id}')">${plEsc(retOf.pl_number)}</a> (incoming, received ${plFmt(retOf.date_shipped)})</div>` : ''}
    ${rets.length ? `<div class="pl-banner link">&#x21AA; Returned on ${rets.map(r => `<a onclick="openPackingList('${r.id}')">${plEsc(r.pl_number)}</a> (${plStatusLabel(r).toLowerCase()})`).join(', ')}</div>` : ''}
    ${inc && h.status === 'shipped' && !rets.length ? `<div class="pl-banner onsite">&#x1F4CD; This customer property is still on site.</div>` : ''}

    <div class="client-detail-section">
      <div class="client-detail-section-title">${inc ? 'From (customer)' : 'Ship To'}</div>
      ${edit && kind !== 'client' ? `<div class="client-field" style="margin-bottom:10px"><label>${kind === 'vendor' ? 'Vendor' : 'Vendor (sending out)'}</label>
        <select id="plVendor" class="pl-select" onchange="plPickShipTo('vendor',this.value)">
          <option value="">—</option>${vendOpts.map(v => `<option value="${v.id}" ${h.vendor_id === v.id ? 'selected' : ''}>${plEsc(v.name)}</option>`).join('')}</select></div>` : ''}
      ${edit && kind !== 'vendor' ? `<div class="client-field" style="margin-bottom:10px"><label>${kind === 'client' ? 'Client' : 'or Client (returning goods)'}</label>
        <select id="plClient" class="pl-select" onchange="plPickShipTo('client',this.value)">
          <option value="">—</option>${cliOpts.map(c => `<option value="${c.id}" ${h.client_id === c.id ? 'selected' : ''}>${plEsc(c.name)}</option>`).join('')}</select></div>` : ''}
      <input type="hidden" id="plShipType" value="${plEsc(h.ship_to_type)}" />
      ${f('Name *', 'plShipName', h.ship_to_name)}
      ${kind !== 'vendor' ? `<div class="client-field-row" style="margin-top:10px">
        <div class="client-field"><label>Our Job</label><input type="text" value="${plEsc(proj ? proj.name : '')}" placeholder="—" disabled /></div>
        ${f('Cust. Order No.', 'plCustOrder', h.cust_order_no || (draft ? plJobPo(h.project_id) : ''))}</div>` : ''}
      ${inc ? `<div class="client-field" style="margin-top:10px"><label>Delivered By <span class="pl-dim" style="text-transform:none;letter-spacing:0;font-weight:400">· their person who dropped it off</span></label>
        <input id="plDeliveredBy" type="text" value="${plEsc(h.delivered_by || '')}" ${dis} /></div>` : ''}
      <div class="client-field" style="margin-top:10px"><label>${inc ? 'Contact' : 'Attn'}</label>
        <input id="plAttn" type="text" list="plAttnList" value="${plEsc(h.ship_to_attn || '')}" placeholder="${contacts.length ? 'Pick a contact or type a name' : ''}" ${dis} />
        <datalist id="plAttnList">${contacts.map(n => `<option value="${plEsc(n)}">`).join('')}</datalist></div>
      <div class="client-field" style="margin-top:10px"><label>Address
        ${edit && (h.vendor_id || h.client_id) ? `<a class="pl-inline-link" onclick="plRefreshAddress()">&#x21bb; Use ${h.vendor_id ? 'vendor' : 'client'} address</a>` : ''}</label>
        <textarea id="plShipAddr" class="full" rows="3" ${dis}>${plEsc(h.ship_to_address || '')}</textarea>
        ${edit && !h.ship_to_address && (h.vendor_id || h.client_id) ? `<span class="pl-hint">No address on the ${h.vendor_id ? 'vendor' : 'client'} record yet — add it under ${h.vendor_id ? 'Vendors' : 'Clients'} and it fills in for every future list, or type it here.</span>` : ''}</div>
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Items</div>
      <table class="pl-lines">
        <thead><tr><th>${inc ? 'Qty Exp.' : 'Qty Ord.'}</th><th>${inc ? 'Qty Rec\'d' : 'Qty Ship.'}</th><th>Description</th><th></th></tr></thead>
        <tbody>${linesHtml || '<tr><td colspan="4" class="pl-empty">No items yet.</td></tr>'}</tbody>
      </table>
      ${edit ? `<button class="loa-link-btn pl-addline" onclick="plAddBlankLine()">+ Add a line</button>` : ''}

    <div class="client-detail-section">
      <div class="client-detail-section-title">${inc ? 'Receipt' : 'Shipment'}</div>
      <div class="client-field-row">
        <div class="client-field"><label>${inc ? 'Date Received' : 'Date Shipped'}</label><input id="plDate" type="date" value="${h.date_shipped || (draft ? plToday() : '')}" ${dis} /></div>
        <div class="client-field"><label>${inc ? 'Received Via' : 'Shipped Via'}</label><input id="plVia" list="plCarrierList" value="${plEsc(h.shipped_via || '')}" placeholder="Pick or type a carrier" ${dis} />
          <datalist id="plCarrierList">${plCarrierOptions().map(c => `<option value="${plEsc(c)}">`).join('')}</datalist></div>
      </div>
      <div class="client-field-row">
        ${inc ? '' : `<div class="client-field"><label>Freight</label><select id="plFreight" class="pl-select" ${dis}>
          <option value="">—</option><option value="prepaid" ${h.freight_terms === 'prepaid' ? 'selected' : ''}>Prepaid</option>
          <option value="collect" ${h.freight_terms === 'collect' ? 'selected' : ''}>Collect</option></select></div>
        <div class="client-field"><label>Billed To <span class="pl-dim" style="text-transform:none;letter-spacing:0;font-weight:400">· who pays the freight</span></label>
          <input id="plBilledTo" type="text" value="${plEsc(h.freight_billed_to || '')}" placeholder="e.g. Customer — FedEx acct 1234" ${dis} /></div>`}
        ${inc ? `<div class="client-field"><label>Tracking #</label><input id="plTracking" type="text" value="${plEsc(h.tracking_number || '')}"
          ${h.status === 'void' || !plCanCreate() ? 'disabled' : ''} /></div><div></div>` : ''}
      </div>
      ${inc ? '' : `<div class="client-field-row"><div class="client-field"><label>Tracking #</label><input id="plTracking" type="text" value="${plEsc(h.tracking_number || '')}"
          ${h.status === 'void' || !plCanCreate() ? 'disabled' : ''} /></div><div></div></div>`}
      ${inc ? '' : `<div class="client-field-row">${f('PO / PR #', 'plPoPr', h.po_pr_number)}<div></div></div>`}
      <div class="pl-row3">
        <div class="client-field"><label>No. of Cartons</label><input id="plCartons" type="number" min="0" value="${h.cartons ?? ''}" ${dis} /></div>
        ${f('Total Weight', 'plWeight', h.total_weight, 'placeholder="e.g. 42 lb"')}
        ${f('Container No.', 'plContainer', h.container_no)}
      </div>
      <div class="client-field-row">${f(inc ? 'Received By (NU Labs)' : 'Packed By', 'plPackedBy', h.packed_by)}${f('Checked By', 'plCheckedBy', h.checked_by)}</div>
      <div class="client-field"><label>Notes</label><textarea id="plNotes" class="full" rows="2" ${dis}>${plEsc(h.notes || '')}</textarea></div>
    </div>

    </div>
    <div class="client-detail-section">
      <div class="client-detail-section-title">Attachments</div>
      <div id="plAttachments"></div>
    </div>`;
  if (typeof attMount === 'function') attMount('packing_list', isNew ? null : h.id, 'plAttachments', { canAdd: h.status !== 'void' });

  const bar = [];
  if (isNew) bar.push(`<button class="btn btn-ghost" style="margin-right:auto" onclick="closePackingList()">Cancel</button>`);
  else if (h.status !== 'void' && plCanVoid()) bar.push(`<button class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="plVoid()">Void</button>`);
  else bar.push('<span style="margin-right:auto"></span>');
  bar.push(`<button class="btn btn-ghost pl-outline" onclick="plPrint('${h.id}')">&#x1F5A8; Print</button>`);
  if (edit) {
    bar.push(`<button class="btn btn-ghost pl-outline" onclick="plSave()">Save</button>`);
    bar.push(`<button class="btn btn-primary" onclick="plMarkShipped()">${inc ? 'Mark Received' : 'Mark Shipped'}</button>`);
  } else if (h.status === 'shipped' && plCanCreate()) {
    bar.push(`<button class="btn btn-ghost pl-outline" onclick="plSaveTracking()">Save Tracking #</button>`);
    if (inc && !rets.length) bar.push(`<button class="btn btn-primary" onclick="plCreateReturn()">&#x21A9; Create Return List</button>`);
  }
  document.getElementById('plSaveBar').innerHTML = bar.join('');
}

// Contact names for the Attn pick-list.
function plContactNames(h) {
  if (h.vendor_id && typeof vendorContactStore !== 'undefined') {
    return vendorContactStore.filter(c => c.vendor_id === h.vendor_id)
      .map(c => [c.first_name, c.last_name].filter(Boolean).join(' ')).filter(Boolean);
  }
  if (h.client_id && typeof contactStore !== 'undefined') {
    return contactStore.filter(c => c.clientId === h.client_id)
      .map(c => [c.firstName, c.lastName].filter(Boolean).join(' ')).filter(Boolean);
  }
  return [];
}

// Re-pull the address from the vendor / client record (e.g. after filling it in under Vendors).
async function plRefreshAddress() {
  const h = plCur();
  if (!h) return;
  let rec = null;
  if (h.vendor_id) {
    if (typeof loadVendorData === 'function') await loadVendorData();
    rec = (typeof vendorStore !== 'undefined') ? vendorStore.find(v => v.id === h.vendor_id) : null;
  } else if (h.client_id) {
    rec = (typeof clientStore !== 'undefined') ? clientStore.find(c => c.id === h.client_id) : null;
  }
  const addr = plAddress(rec);
  if (!addr) { plToast('No address on the ' + (h.vendor_id ? 'vendor' : 'client') + ' record yet'); return; }
  const el = document.getElementById('plShipAddr');
  if (el) el.value = addr;
  plToast('Address filled in — click Save to keep it');
}

function plPickShipTo(kind, id) {
  const rec = kind === 'vendor'
    ? (typeof vendorStore !== 'undefined' ? vendorStore.find(v => v.id === id) : null)
    : (typeof clientStore !== 'undefined' ? clientStore.find(c => c.id === id) : null);
  const other = document.getElementById(kind === 'vendor' ? 'plClient' : 'plVendor');
  if (other) other.value = '';
  document.getElementById('plShipType').value = rec ? kind : 'other';
  if (rec) {
    document.getElementById('plShipName').value = rec.name;
    document.getElementById('plShipAddr').value = plAddress(rec);
  }
  // Redraw so the form matches (vendor vs client fields, contacts for Attn). Unsaved edits are kept.
  const h = plCur();
  if (h) {
    plCaptureLines();
    const cur = plHeaderFromForm(h);
    Object.keys(cur).forEach(k => cur[k] === undefined && delete cur[k]);
    if (kind === 'vendor') cur.vendor_id = rec ? rec.id : null;
    if (kind === 'client') cur.client_id = rec ? rec.id : null;
    plRenderEditor({ ...h, ...cur });
  }
}

function plCaptureLines() {
  document.querySelectorAll('.pl-lines tbody tr').forEach((tr, i) => {
    const l = _plEditLines[i]; if (!l) return;
    const ins = tr.querySelectorAll('input');
    if (ins.length >= 3) {
      l.qty_ordered = ins[0].value; l.qty_shipped = ins[1].value; l.description = ins[2].value;
    }
  });
}
function plAddBlankLine() {
  plCaptureLines();
  _plEditLines.push({ id: null, qty_ordered: 1, qty_backordered: 0, qty_shipped: 1, description: '' });
  const h = plCur();
  plRenderEditor({ ...h, ...plHeaderFromForm(h) });
  const inputs = document.querySelectorAll('.pl-desc'); inputs[inputs.length - 1]?.focus();
}
function plRemoveLine(i) {
  plCaptureLines();
  _plEditLines.splice(i, 1);
  const h = plCur();
  plRenderEditor({ ...h, ...plHeaderFromForm(h) });
}

function plHeaderFromForm(h) {
  const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
  const nz = v => (v === undefined ? undefined : (v === '' ? null : v));
  const type = g('plShipType') || h.ship_to_type;
  const cartons = g('plCartons');
  return {
    ship_to_type: type,
    vendor_id: type === 'vendor' ? (g('plVendor') || h.vendor_id) : null,
    client_id: type === 'client' ? (g('plClient') || h.client_id) : null,
    ship_to_name: g('plShipName') ?? h.ship_to_name,
    ship_to_attn: nz(g('plAttn')), cust_order_no: nz(g('plCustOrder')),
    ship_to_address: nz(g('plShipAddr')),
    date_shipped: nz(g('plDate')), shipped_via: nz(g('plVia')),
    freight_terms: nz(g('plFreight')), tracking_number: nz(g('plTracking')),
    po_pr_number: nz(g('plPoPr')),
    cartons: cartons === undefined ? undefined : (cartons === '' ? null : parseInt(cartons, 10)),
    total_weight: nz(g('plWeight')), container_no: nz(g('plContainer')),
    packed_by: nz(g('plPackedBy')), checked_by: nz(g('plCheckedBy')), notes: nz(g('plNotes')),
    delivered_by: nz(g('plDeliveredBy')),
    freight_billed_to: nz(g('plBilledTo')),
  };
}

// Save header + lines (draft only). Returns true on success.
async function plSave(silent) {
  let h = plCur();
  if (!h || h.status !== 'draft') return false;
  const wasNew = h.id === PL_NEW;
  plCaptureLines();
  const hdr = plHeaderFromForm(h);
  if (!hdr.ship_to_name) { plToast((plIsIn(h) ? 'From' : 'Ship To') + ' name is required'); return false; }
  const bad = _plEditLines.find(l => !String(l.description || '').trim());
  if (bad) { plToast('Every line needs a description (or remove it)'); return false; }
  Object.keys(hdr).forEach(k => hdr[k] === undefined && delete hdr[k]);

  if (h.id === PL_NEW) {
    // First save of a new list: insert it — this is when the PL number is assigned.
    const { id, pl_number, status, created_at, ...base } = h;
    const { data, error } = await sb.from('packing_lists').insert({ ...base, ...hdr }).select().single();
    if (error) { plErr('Could not save', error); return false; }
    plStore.unshift({ ...data, line_count: 0 });
    _plNewDraft = null;
    _plEditId = data.id;
    h = data;
  } else {
    const { error } = await sb.from('packing_lists').update(hdr).eq('id', h.id);
    if (error) { plErr('Could not save', error); return false; }
  }

  // Lines: delete removed, update existing, insert new — numbered in order.
  const { data: current, error: e1 } = await sb.from('packing_list_lines').select('id').eq('packing_list_id', h.id);
  if (e1) { plErr('Could not save lines', e1); return false; }
  const keep = new Set(_plEditLines.filter(l => l.id).map(l => l.id));
  const gone = (current || []).map(r => r.id).filter(id => !keep.has(id));
  if (gone.length) {
    const { error: e2 } = await sb.from('packing_list_lines').delete().in('id', gone);
    if (e2) { plErr('Could not remove lines', e2); return false; }
  }
  const num = v => { const n = Number(v); return isNaN(n) || n < 0 ? 0 : n; };
  for (let i = 0; i < _plEditLines.length; i++) {
    const l = _plEditLines[i];
    const row = { line_no: i + 1, qty_ordered: num(l.qty_ordered), qty_backordered: num(l.qty_backordered),
      qty_shipped: num(l.qty_shipped), description: String(l.description).trim() };
    const res = l.id
      ? await sb.from('packing_list_lines').update(row).eq('id', l.id)
      : await sb.from('packing_list_lines').insert({ ...row, packing_list_id: h.id, asset_id: l.asset_id || null,
          cal_record_id: l.cal_record_id || null, test_article_id: l.test_article_id || null }).select().single();
    if (res.error) { plErr('Could not save line ' + (i + 1), res.error); return false; }
    if (!l.id && res.data) l.id = res.data.id;
  }
  const one = await plLoadOne(h.id);
  if (one) { _plEditLines = one.lines.map(l => ({ ...l })); plRenderEditor(one.header); }
  if (!silent) plToast('✓ ' + h.pl_number + ' saved');
  else if (h.pl_number && wasNew) plToast('✓ Saved as ' + h.pl_number);
  return true;
}

async function plSaveTracking() {
  const h = plCur();
  if (!h) return;
  const tr = (document.getElementById('plTracking')?.value || '').trim() || null;
  const { error } = await sb.from('packing_lists').update({ tracking_number: tr }).eq('id', h.id);
  if (error) { plErr('Could not save tracking #', error); return; }
  const one = await plLoadOne(h.id); if (one) plRenderEditor(one.header);
  plToast('✓ Tracking # saved');
}

async function plMarkShipped() {
  let h = plCur();
  if (!h) return;
  const inc = plIsIn(h);
  const via = (document.getElementById('plVia')?.value || '').trim();
  if (!via && !inc) { plToast('Enter how it shipped (Shipped Via) first'); document.getElementById('plVia')?.focus(); return; }
  if (!_plEditLines.length) { plToast('Add at least one item first'); return; }
  if (!confirm(inc
    ? `Mark ${h.id === PL_NEW ? 'this list' : h.pl_number} as received?\n\nThe incoming list locks (only the tracking # can be added). Print it for signatures; when the equipment goes back, use Create Return List.`
    : `Mark ${h.id === PL_NEW ? 'this list' : h.pl_number} as shipped?\n\nThe packing list locks (only the tracking # can be added), and any test articles on it are marked shipped.`)) return;
  if (!(await plSave(true))) return;
  h = plCur();      // a new list now has its id and number
  const date = document.getElementById('plDate')?.value || plToday();
  const { error } = await sb.from('packing_lists').update({ status: 'shipped', date_shipped: date }).eq('id', h.id);
  if (error) { plErr('Could not mark shipped', error); return; }

  // Outgoing only: mark linked test articles shipped (same date + carrier).
  // Incoming lists document a receipt; the articles were already logged in house.
  const artIds = inc ? [] : _plEditLines.map(l => l.test_article_id).filter(Boolean);
  if (artIds.length) {
    const { error: e2 } = await sb.from('test_articles')
      .update({ status: 'shipped', shipped_date: date, carrier: via }).in('id', artIds);
    if (e2) plErr('Packing list shipped, but test articles were not updated', e2);
    else if (typeof articleStore !== 'undefined') {
      articleStore.forEach(a => { if (artIds.includes(a._id)) { a.status = 'shipped'; a.shippedDate = date; a.carrier = via; } });
      if (typeof logActivity === 'function') {
        const proj = plProject(h.project_id);
        logActivity('shipping', h.id, proj ? proj.name : h.pl_number, `📤 Shipped ${artIds.length} article${artIds.length !== 1 ? 's' : ''} on ${h.pl_number} via ${via}`);
      }
    }
  }
  const one = await plLoadOne(h.id); if (one) plRenderEditor(one.header);
  if (typeof renderShippingGlobal === 'function' && document.getElementById('panel-shipping')?.classList.contains('active')) renderShippingGlobal();
  plToast('✓ ' + h.pl_number + (inc ? ' received' : ' shipped'));
}

async function plVoid() {
  const h = plCur();
  if (!h || !plCanVoid()) return;
  const reason = prompt(`Void ${h.pl_number}?\n\nThe number is kept and prints as VOID. Reason:`);
  if (reason === null) return;
  const actor = plActor();
  const { error } = await sb.from('packing_lists').update({ status: 'void', void_reason: reason.trim() || null, voided_by: actor?.id || null }).eq('id', h.id);
  if (error) { plErr('Could not void', error); return; }
  const one = await plLoadOne(h.id); if (one) plRenderEditor(one.header);
  plToast(h.pl_number + ' voided' + (h.status === 'shipped' ? ' — test articles keep their shipped status' : ''));
}

// ---------- print ----------
async function plPrint(id) {
  // Save a draft first so the print matches the screen.
  const h0 = id === PL_NEW ? _plNewDraft : plStore.find(p => p.id === id);
  if (h0 && h0.status === 'draft' && _plEditId === id && plCanCreate()) {
    if (!(await plSave(true))) return;
    id = _plEditId;   // a new list was just saved and numbered
  }
  const one = await plLoadOne(id);
  if (!one) return;
  const h = one.header, lines = one.lines;
  const proj = plProject(h.project_id);
  const MIN_ROWS = 14;
  const rows = lines.map(l => `<tr><td class="c">${plNum(l.qty_ordered)}</td>
    <td class="c">${plNum(l.qty_shipped)}</td><td>${plEsc(l.description)}</td></tr>`).join('') +
    Array(Math.max(0, MIN_ROWS - lines.length)).fill('<tr><td></td><td></td><td></td></tr>').join('');
  const box = on => on ? '&#9746;' : '&#9744;';
  const inc = plIsIn(h), retOf = plReturnOf(h);
  const shipBlock = [h.ship_to_name, h.ship_to_attn ? 'Attn: ' + h.ship_to_attn : '', h.ship_to_address || '']
    .filter(Boolean).map(plEsc).join('<br>').replace(/\n/g, '<br>');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${plEsc(h.pl_number)}</title><style>
    @page{size:letter;margin:0.5in}
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:11px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
    .co{font-size:12px;line-height:1.35}.co b{font-size:17px;font-style:italic}
    .title{text-align:right}.title .t{font-size:20px;font-weight:bold;border-bottom:2px solid #111;padding-bottom:2px;letter-spacing:.5px}
    .title .n{font-size:18px;color:#b00;font-family:'Courier New',monospace;margin-top:6px;font-weight:bold}
    .title .dir{font-size:10px;font-weight:bold;letter-spacing:1.5px;margin-top:4px}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
    th{background:#e6e6e6;font-size:8.5px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;text-align:left}
    .lbl{font-size:8px;text-transform:uppercase;color:#333;display:block;margin-bottom:2px;letter-spacing:.3px}
    .shipto{height:92px}.shipto .side{width:22px;background:#333;color:#fff;font-size:9px;font-weight:bold;text-align:center;writing-mode:vertical-rl;text-orientation:upright;letter-spacing:1px}
    .items td{height:22px}.items .c{text-align:center;width:70px}
    .void{position:fixed;top:38%;left:0;right:0;text-align:center;font-size:120px;color:rgba(200,0,0,.18);font-weight:bold;transform:rotate(-20deg)}
    .sig{display:flex;justify-content:flex-end;gap:30px;margin-top:22px;font-size:10px}
    .sig span{display:inline-block;border-bottom:1px solid #111;width:200px;height:14px}
    .notes{margin-top:8px;font-size:10px}
  </style></head><body>
  ${h.status === 'void' ? '<div class="void">VOID</div>' : ''}
  <div class="top">
    <div class="co"><b>${PL_COMPANY.name}</b><br>${PL_COMPANY.street}<br>${PL_COMPANY.city}</div>
    <div class="title"><div class="t">${inc ? 'PACKING LIST &mdash; RECEIVED' : 'PACKING LIST'}</div>
      <div class="dir">${inc ? 'INCOMING' : 'OUTGOING'}${retOf ? ' &middot; RETURN OF ' + plEsc(retOf.pl_number) : ''}</div>
      <div class="n">${plEsc(h.pl_number)}</div></div>
  </div>
  <table><tr class="shipto"><td class="side">${inc ? 'FROM' : 'SHIP TO'}</td><td style="font-size:12px;line-height:1.4">${shipBlock}</td>
    ${h.ship_to_type !== 'vendor' ? `<td style="width:210px"><span class="lbl">Our Job No.</span><div style="font-size:12px;margin-bottom:8px">${plEsc(proj ? proj.name : '')}</div>
      <span class="lbl">Cust. Order No.</span><div style="font-size:12px">${plEsc(h.cust_order_no || '')}</div></td>` : ''}</tr></table>
  <table style="margin-top:-1px"><tr>
    <td><span class="lbl">${inc ? 'Date Received' : 'Date Shipped'}</span>${plFmt(h.date_shipped)}</td>
    <td><span class="lbl">${inc ? 'Received Via' : 'Shipped Via'}</span>${plEsc(h.shipped_via || '')}
      ${inc ? '' : `<div style="font-size:9px;margin-top:3px">${box(h.freight_terms === 'prepaid')} Prepaid &nbsp; ${box(h.freight_terms === 'collect')} Collect</div>
        ${h.freight_billed_to ? `<div style="font-size:9px;margin-top:2px"><b>Billed to:</b> ${plEsc(h.freight_billed_to)}</div>` : ''}`}</td>
    <td><span class="lbl">Tracking No.</span>${plEsc(h.tracking_number || '')}</td>
    ${inc ? `<td><span class="lbl">Delivered By</span>${plEsc(h.delivered_by || '')}</td>` : `<td><span class="lbl">PO / PR No.</span>${plEsc(h.po_pr_number || '')}</td>`}
  </tr></table>
  <table class="items" style="margin-top:-1px">
    <thead><tr><th class="c">${inc ? 'Qty Expected' : 'Qty Ordered'}</th><th class="c">${inc ? 'Qty Received' : 'Qty Shipped'}</th><th style="text-align:center">Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table style="margin-top:-1px"><tr>
    <td><span class="lbl">No. of Cartons</span>${h.cartons ?? ''}</td>
    <td><span class="lbl">Total Weight</span>${plEsc(h.total_weight || '')}</td>
    <td><span class="lbl">Container No.</span>${plEsc(h.container_no || '')}</td>
    <td><span class="lbl">${inc ? 'Received By' : 'Packed By'}</span>${plEsc(h.packed_by || '')}</td>
    <td><span class="lbl">Checked By</span>${plEsc(h.checked_by || '')}</td>
  </tr></table>
  ${h.notes ? `<div class="notes"><b>Notes:</b> ${plEsc(h.notes)}</div>` : ''}
  ${inc
    ? `<div class="sig">Delivered By <span></span> Date <span style="width:110px"></span></div>
       <div class="sig">Received for NU Labs By <span></span> Date <span style="width:110px"></span></div>`
    : `<div class="sig">Rec'd By <span></span> Date <span style="width:110px"></span></div>`}
  </body></html>`;

  let frame = document.getElementById('plPrintFrame');
  if (frame) frame.remove();
  frame = document.createElement('iframe');
  frame.id = 'plPrintFrame';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); }, 250);
}

// ---------- Packing Lists tab (inside Shipping & Receiving) ----------
function plTabBar() {
  const t = (k, l) => `<button class="pl-tab ${_plTab === k ? 'active' : ''}" onclick="plSwitchTab('${k}')">${l}</button>`;
  return `<div class="pl-tabs">${t('articles', '📦 Test Articles')}${t('lists', '📄 Packing Lists')}</div>`;
}
function plSwitchTab(k) {
  _plTab = k;
  if (typeof renderShippingGlobal === 'function') renderShippingGlobal();
}

async function renderPackingListsTab() {
  const el = document.getElementById('shippingGlobalBody');
  if (!el) return;
  if (!_plLoaded) { el.innerHTML = plTabBar() + '<div class="pl-empty">Loading packing lists…</div>'; await loadPackingLists(); }
  const q = _plSearch.toLowerCase().trim();
  const list = plStore.filter(p => {
    if (_plStatusFilter === 'open' && p.status !== 'draft') return false;
    if (_plStatusFilter === 'onsite' && !plOnSite(p)) return false;
    if (['shipped', 'void'].includes(_plStatusFilter) && p.status !== _plStatusFilter) return false;
    if (!q) return true;
    const proj = plProject(p.project_id);
    return [p.pl_number, p.ship_to_name, p.po_pr_number, p.cust_order_no, p.tracking_number, proj?.name, plIsIn(p) ? 'incoming' : 'outgoing']
      .join(' ').toLowerCase().includes(q);
  });
  const count = s => plStore.filter(p => s === 'all' ? true : s === 'open' ? p.status === 'draft' : s === 'onsite' ? plOnSite(p) : p.status === s).length;
  const chip = (k, l) => `<button class="vnd-chip ${_plStatusFilter === k ? 'active' : ''}" onclick="_plStatusFilter='${k}';renderPackingListsTab()">${l} <span class="vnd-chip-n">${count(k)}</span></button>`;

  const searchEl = el.querySelector('.pl-search');
  const focused = searchEl && document.activeElement === searchEl;
  const caret = focused ? searchEl.selectionStart : null;

  el.innerHTML = `
    ${plTabBar()}
    <div class="pl-head">
      <div>
        <div class="pl-h1">📄 Packing Lists</div>
        <div class="pl-meta">Outgoing: start from LOA (select assets) or a test article. Incoming: from a test article or + Incoming list. One number series; restarts each January.</div>
      </div>
      <div class="pl-head-right">
        <input class="emp-search pl-search" placeholder="Search PL #, to/from, job, PO/PR, tracking…" value="${plEsc(_plSearch)}"
          oninput="_plSearch=this.value;renderPackingListsTab()" />
        ${plCanCreate() ? `<button class="btn btn-ghost pl-outline" onclick="plNewIncoming()" title="Document customer property dropped off without paperwork">&#x1F4E5; + Incoming list</button>` : ''}
      </div>
    </div>
    <div class="vnd-filter-bar">${chip('open', 'Drafts')}${chip('shipped', 'Shipped / Received')}${chip('onsite', '&#x1F4CD; On site')}${chip('void', 'Void')}${chip('all', 'All')}</div>
    <div class="pl-table-wrap"><table class="pl-table">
      <thead><tr><th>PL #</th><th>Direction</th><th>Status</th><th>To / From</th><th>Job</th><th>PO / PR</th><th>Date</th><th>Via</th><th>Items</th><th></th></tr></thead>
      <tbody>${list.map(p => {
        const proj = plProject(p.project_id);
        return `<tr onclick="openPackingList('${p.id}')">
          <td class="pl-mono">${plEsc(p.pl_number)}${p.return_of_id ? ' <span class="pl-dim" title="Return of ' + plEsc(plReturnOf(p)?.pl_number || '') + '">&#x21A9;</span>' : ''}</td>
          <td>${plDirBadge(p)}</td>
          <td><span class="pl-status ${p.status}">${plStatusLabel(p)}</span>${plOnSite(p) ? ' <span class="pl-tag">on site</span>' : ''}</td>
          <td>${plIsIn(p) ? '<span class="pl-dim">from</span> ' : ''}${plEsc(p.ship_to_name)}</td>
          <td>${proj ? plEsc((proj.emoji || '') + ' ' + proj.name) : ''}</td>
          <td>${plEsc(p.po_pr_number || '')}</td>
          <td class="pl-mono">${p.status === 'shipped' ? plFmt(p.date_shipped) : ''}</td>
          <td>${plEsc(p.shipped_via || '')}</td>
          <td class="pl-mono">${p.line_count}</td>
          <td onclick="event.stopPropagation()"><button class="client-action-btn" title="Print" onclick="plPrint('${p.id}')">&#x1F5A8;</button></td>
        </tr>`;
      }).join('') || `<tr><td colspan="10" class="pl-empty">${plStore.length ? 'No packing lists match.' : 'No packing lists yet.'}</td></tr>`}</tbody>
    </table></div>`;
  if (focused) { const s = el.querySelector('.pl-search'); if (s) { s.focus(); s.setSelectionRange(caret, caret); } }
}

// ---------- small modal ----------
function plModal(title, body, footer) {
  let m = document.getElementById('plModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'modal-backdrop pl-modal-backdrop'; m.id = 'plModal';
    m.onclick = e => { if (e.target === m) plCloseModal(); };
    m.innerHTML = `<div class="modal" style="width:500px"><div class="modal-header"><div class="modal-title" id="plModalTitle"></div>
      <button class="modal-close" onclick="plCloseModal()">&#x2715;</button></div>
      <div class="modal-body" id="plModalBody"></div><div class="modal-footer" id="plModalFooter"></div></div>`;
    document.body.appendChild(m);
  }
  document.getElementById('plModalTitle').textContent = title;
  document.getElementById('plModalBody').innerHTML = body;
  document.getElementById('plModalFooter').innerHTML = footer;
  m.classList.add('open');
}
function plCloseModal() { document.getElementById('plModal')?.classList.remove('open'); }

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('plModal')?.classList.contains('open')) { plCloseModal(); return; }
  if (document.getElementById('plDrawer')?.classList.contains('open')) closePackingList();
});

window.openPackingList = openPackingList;
window.plFromLoaSelection = plFromLoaSelection;
window.plFromArticle = plFromArticle;
window.plNewIncoming = plNewIncoming;
window.plCreateReturn = plCreateReturn;
window.plCreateForSendOut = plCreateForSendOut;
window.renderPackingListsTab = renderPackingListsTab;
