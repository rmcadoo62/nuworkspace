// ===== LOA — LIST OF APPARATUS =====
// Calibration-asset register (replaces the standalone NU_LOA_V4.html).
//
// Tables (migration 2026-10-19_loa.sql):
//   loa_assets          keyed by asset_id (text, ≤10 chars, unique ignoring case)
//   loa_cal_records     calibration history; open record (sent, not returned) = out for cal
//   loa_repair_records  repair history
//   loa_locations       editable list
//   loa_asset_status    view: last cal, next due, out-for-cal (calculated, never stored)
// Cal vendors come from the shared Vendors module (vendors.js).
//
// Capabilities (Setup → Permissions → LOA):
//   view_loa   — see the LOA nav item and page
//   edit_loa   — add / edit assets, send out / check in, cal + repair records, locations
//   delete_loa — delete assets and records
//
// Writes go straight to sb, check the error, then re-read from the database.

let loaAssets   = [];      // loa_assets rows (without legacy)
let loaStatus   = {};      // asset_id -> loa_asset_status row
let loaLocations = [];
let _loaLoaded  = false;
let _loaLoading = null;

let _loaSearch  = '';
let _loaFilter  = { status: 'in_service', calType: 'all', location: 'all', vendor: 'all', due: 'all' };
let _loaSort    = { key: 'asset_id', dir: 1 };
let _loaSelected = new Set();
let _loaShowLimit = 300;

let _loaDrawerId  = null;   // asset_id; null = new asset
let _loaDrawerTab = 'ltab-details';
let _loaCalCache  = {};     // asset_id -> cal records
let _loaRepCache  = {};     // asset_id -> repair records
let _loaEditCalId = null;
let _loaEditRepId = null;

const LOA_CAL_TYPES = {
  interval:             'Interval',
  verify_before_use:    'Verify before use',
  calibrate_before_use: 'Calibrate before use',
  ref_only:             'Ref only',
  not_required:         'Cal not required',
};
const LOA_STATUS = { in_service: 'In Service', out_of_service: 'Out of Service' };
const LOA_RESULTS = { pass: 'Pass', adjusted: 'Adjusted', limited: 'Limited', fail: 'Fail' };
const LOA_DUE_SOON_DAYS = 30;

// ---------- helpers ----------
function loaCanView()   { return typeof can === 'function' ? can('view_loa')   : false; }
function loaCanEdit()   { return typeof can === 'function' ? can('edit_loa')   : false; }
function loaCanDelete() { return typeof can === 'function' ? can('delete_loa') : false; }

function lEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function lJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function lToast(m) { if (typeof toast === 'function') toast(m); }
function lErr(prefix, error) {
  console.error('[loa] ' + prefix, error);
  lToast('⚠ ' + prefix + (error && error.message ? ': ' + error.message : ''));
}
function lActor() {
  const e = (typeof realEmployee !== 'undefined' && realEmployee) ? realEmployee
          : (typeof currentEmployee !== 'undefined' ? currentEmployee : null);
  return e && e.id ? e.id : null;
}
function lToday() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function lFmt(d) {
  if (!d) return '';
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function lDays(d) {
  if (!d) return null;
  return Math.round((new Date(d + 'T00:00:00') - new Date(lToday() + 'T00:00:00')) / 86400000);
}
function lAddMonths(d, m) {
  if (!d || !m) return '';
  const dt = new Date(d + 'T00:00:00');
  const day = dt.getDate();
  dt.setMonth(dt.getMonth() + Number(m));
  if (dt.getDate() < day) dt.setDate(0);   // Jan 31 + 1 month -> Feb 28
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function lMoney(n) { return n == null || n === '' ? '' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function lVendorName(id) {
  if (!id || typeof vendorStore === 'undefined') return '';
  const v = vendorStore.find(x => x.id === id);
  return v ? v.name : '';
}
function lLocName(id) { const l = loaLocations.find(x => x.id === id); return l ? l.name : ''; }
function lCalTypeLabel(a) {
  if (!a.cal_type) return '';
  if (a.cal_type === 'interval') {
    const m = a.cal_interval_months;
    if (!m) return 'Interval';
    return m % 12 === 0 ? (m / 12) + ' yr' + (m / 12 > 1 ? 's' : '') : m + ' mo';
  }
  return LOA_CAL_TYPES[a.cal_type] || a.cal_type;
}
// Due state for colouring: only in-service interval assets can be due/overdue.
function lDueState(a) {
  const s = loaStatus[a.asset_id];
  if (!s) return '';
  if (s.out_for_cal) return 'out';
  if (a.status !== 'in_service' || a.cal_type !== 'interval' || !s.next_due) return '';
  const d = lDays(s.next_due);
  if (d < 0) return 'overdue';
  if (d <= LOA_DUE_SOON_DAYS) return 'soon';
  return 'ok';
}

// Supabase caps a select at 1000 rows — page through.
async function lFetchAll(table, cols, orderCol) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order(orderCol).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const LOA_ASSET_COLS = 'asset_id,description,manufacturer,model_no,serial_no,status,location_id,cal_type,' +
  'cal_interval_months,cal_vendor_id,linked_asset_id,link_note,purchase_source,purchase_price,purchase_date,' +
  'test_category,file_location,notes,created_at,updated_at';

async function loadLoaData(force) {
  if (_loaLoading) return _loaLoading;
  if (_loaLoaded && !force) return;
  _loaLoading = (async () => {
    try {
      const vendorsP = (typeof loadVendorData === 'function') ? loadVendorData() : Promise.resolve();
      const [assets, status, locs] = await Promise.all([
        lFetchAll('loa_assets', LOA_ASSET_COLS, 'asset_id'),
        lFetchAll('loa_asset_status', '*', 'asset_id'),
        sb.from('loa_locations').select('*').order('sort_order'),
        vendorsP,
      ]);
      if (locs.error) throw locs.error;
      loaAssets = assets;
      loaStatus = {};
      status.forEach(s => { loaStatus[s.asset_id] = s; });
      loaLocations = locs.data || [];
      _loaLoaded = true;
    } catch (e) {
      lErr('Could not load LOA', e);
    } finally {
      _loaLoading = null;
    }
  })();
  return _loaLoading;
}

// Re-read one asset (and its status) after an edit, without reloading 1,300 rows.
async function refreshLoaAsset(assetId) {
  const [a, s] = await Promise.all([
    sb.from('loa_assets').select(LOA_ASSET_COLS).eq('asset_id', assetId).maybeSingle(),
    sb.from('loa_asset_status').select('*').eq('asset_id', assetId).maybeSingle(),
  ]);
  if (a.error || s.error) { lErr('Could not refresh asset', a.error || s.error); return; }
  const i = loaAssets.findIndex(x => x.asset_id === assetId);
  if (a.data) { if (i >= 0) loaAssets[i] = a.data; else loaAssets.push(a.data); }
  else if (i >= 0) loaAssets.splice(i, 1);
  if (s.data) loaStatus[assetId] = s.data; else delete loaStatus[assetId];
  delete _loaCalCache[assetId];
  delete _loaRepCache[assetId];
}

// ---------- panel ----------
async function openLoaPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navLoa'))?.classList.add('active');
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'LOA — List of Apparatus';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-loa')?.classList.add('active');

  const wrap = document.getElementById('loaWrap');
  if (!loaCanView()) {
    if (wrap) wrap.innerHTML = '<div class="loa-placeholder"><div class="loa-ph-title">No access</div>' +
      '<div class="loa-ph-text">Your role does not include View LOA.</div></div>';
    return;
  }
  if (!_loaLoaded && wrap) wrap.innerHTML = '<div class="loa-empty">Loading assets…</div>';
  await loadLoaData();
  renderLoaPanel();
}

function _loaFiltered() {
  const q = _loaSearch.toLowerCase().trim();
  const f = _loaFilter;
  return loaAssets.filter(a => {
    if (f.status !== 'all' && a.status !== f.status) return false;
    if (f.calType !== 'all') {
      if (f.calType === 'none' ? !!a.cal_type : a.cal_type !== f.calType) return false;
    }
    if (f.location !== 'all') {
      if (f.location === 'none' ? !!a.location_id : a.location_id !== f.location) return false;
    }
    if (f.vendor !== 'all') {
      if (f.vendor === 'in_house') { if (!loaStatus[a.asset_id]?.last_cal_in_house) return false; }
      else if (a.cal_vendor_id !== f.vendor) return false;
    }
    if (f.due !== 'all') {
      const st = lDueState(a);
      if (f.due === 'overdue' && st !== 'overdue') return false;
      if (f.due === 'soon' && st !== 'soon') return false;
      if (f.due === 'due' && st !== 'overdue' && st !== 'soon') return false;
      if (f.due === 'out' && st !== 'out') return false;
    }
    if (q) {
      const hay = [a.asset_id, a.description, a.manufacturer, a.model_no, a.serial_no, a.test_category, a.notes]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function _loaSortVal(a, key) {
  const s = loaStatus[a.asset_id] || {};
  switch (key) {
    case 'location': return lLocName(a.location_id).toLowerCase();
    case 'cal_type': return lCalTypeLabel(a).toLowerCase();
    case 'last_cal': return s.last_cal_date || '';
    case 'next_due': return s.next_due || (s.out_for_cal ? '0000' : '9999');
    case 'vendor':   return (s.last_cal_in_house ? 'nu labs' : lVendorName(a.cal_vendor_id)).toLowerCase();
    default:         return String(a[key] == null ? '' : a[key]).toLowerCase();
  }
}

function renderLoaPanel() {
  const wrap = document.getElementById('loaWrap');
  if (!wrap) return;
  if (!loaCanView()) return;

  const edit = loaCanEdit();
  const inService = loaAssets.filter(a => a.status === 'in_service');
  const counts = {
    in_service: inService.length,
    overdue: inService.filter(a => lDueState(a) === 'overdue').length,
    soon: inService.filter(a => lDueState(a) === 'soon').length,
    out: loaAssets.filter(a => lDueState(a) === 'out').length,
    notype: inService.filter(a => !a.cal_type).length,
  };

  const list = _loaFiltered().sort((a, b) => {
    const x = _loaSortVal(a, _loaSort.key), y = _loaSortVal(b, _loaSort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * _loaSort.dir || a.asset_id.localeCompare(b.asset_id);
  });
  const shown = list.slice(0, _loaShowLimit);

  // Keep only selections that are still visible and sendable.
  const visibleIds = new Set(list.map(a => a.asset_id));
  [..._loaSelected].forEach(id => { if (!visibleIds.has(id)) _loaSelected.delete(id); });

  const searchEl = wrap.querySelector('.loa-search');
  const wasFocused = searchEl && document.activeElement === searchEl;
  const selStart = wasFocused ? searchEl.selectionStart : null;

  const tile = (key, label, n, cls) => {
    const active = (key === 'overdue' || key === 'soon' || key === 'out') ? _loaFilter.due === key
                 : key === 'notype' ? _loaFilter.calType === 'none' : false;
    return `<button class="loa-tile ${cls || ''} ${active ? 'active' : ''}" onclick="_loaTile('${key}')">
      <span class="loa-tile-n">${n}</span><span class="loa-tile-l">${label}</span></button>`;
  };

  const opt = (val, label, cur) => `<option value="${lEsc(val)}" ${cur === val ? 'selected' : ''}>${lEsc(label)}</option>`;
  const vendorIds = [...new Set(loaAssets.map(a => a.cal_vendor_id).filter(Boolean))]
    .map(id => ({ id, name: lVendorName(id) })).sort((a, b) => a.name.localeCompare(b.name));

  const th = (key, label) => `<th class="loa-th ${_loaSort.key === key ? 'sorted' : ''}" onclick="_loaSortBy('${key}')">${label}${
    _loaSort.key === key ? (_loaSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  const rows = shown.map(a => {
    const s = loaStatus[a.asset_id] || {};
    const due = lDueState(a);
    const sel = _loaSelected.has(a.asset_id);
    const canSend = a.status === 'in_service' && !s.out_for_cal;
    let dueCell = '';
    if (s.out_for_cal) dueCell = `<span class="loa-due out" title="Sent ${lFmt(s.out_for_cal_since)}">Out for cal</span>`;
    else if (s.next_due) dueCell = `<span class="loa-due ${due}">${lFmt(s.next_due)}</span>`;
    const vend = s.last_cal_in_house && !a.cal_vendor_id ? 'NU Labs (in-house)' : lVendorName(a.cal_vendor_id);
    return `<tr class="loa-row ${a.status === 'out_of_service' ? 'oos' : ''} ${sel ? 'selected' : ''}" onclick="openLoaDrawer('${lJs(a.asset_id)}')">
      ${edit ? `<td class="loa-td-check" onclick="event.stopPropagation()">${canSend
        ? `<input type="checkbox" ${sel ? 'checked' : ''} onchange="_loaToggleSel('${lJs(a.asset_id)}',this.checked)" />` : ''}</td>` : ''}
      <td class="loa-mono">${lEsc(a.asset_id)}</td>
      <td class="loa-desc">${lEsc(a.description)}</td>
      <td>${lEsc(a.manufacturer)}</td>
      <td>${lEsc(a.model_no)}</td>
      <td class="loa-mono loa-dim">${lEsc(a.serial_no)}</td>
      <td>${lEsc(lLocName(a.location_id))}</td>
      <td>${lEsc(lCalTypeLabel(a))}</td>
      <td class="loa-mono">${lFmt(s.last_cal_date)}</td>
      <td>${dueCell}</td>
      <td>${lEsc(vend)}</td>
      <td>${a.status === 'out_of_service' ? '<span class="loa-oos">Out of service</span>' : ''}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="loa-head">
      <div>
        <div class="loa-title">List of Apparatus <span class="loa-count">(${loaAssets.length})</span></div>
        <div class="loa-sub">Calibration assets, calibration and repair history</div>
      </div>
      <div class="loa-head-actions">
        <input class="emp-search loa-search" placeholder="Search ID, description, make, model, serial…" value="${lEsc(_loaSearch)}"
          oninput="_loaSearch=this.value;_loaShowLimit=300;renderLoaPanel()" />
        ${edit ? `<button class="emp-add-btn loa-secondary" onclick="openLoaLocationsModal()">⚙ Locations</button>` : ''}
        ${edit ? `<button class="emp-add-btn" onclick="openNewLoaDrawer()">+ Add Asset</button>` : ''}
      </div>
    </div>

    <div class="loa-tiles">
      ${tile('in_service', 'In service', counts.in_service)}
      ${tile('overdue', 'Overdue', counts.overdue, 'bad')}
      ${tile('soon', 'Due in ' + LOA_DUE_SOON_DAYS + ' days', counts.soon, 'warn')}
      ${tile('out', 'Out for cal', counts.out, 'info')}
      ${tile('notype', 'No cal type', counts.notype, 'muted')}
    </div>

    <div class="loa-filters">
      <select class="loa-select" onchange="_loaFilter.status=this.value;_loaShowLimit=300;renderLoaPanel()">
        ${opt('in_service', 'In service', _loaFilter.status)}${opt('out_of_service', 'Out of service', _loaFilter.status)}${opt('all', 'All statuses', _loaFilter.status)}
      </select>
      <select class="loa-select" onchange="_loaFilter.due=this.value;_loaShowLimit=300;renderLoaPanel()">
        ${opt('all', 'Any due date', _loaFilter.due)}${opt('due', 'Overdue or due soon', _loaFilter.due)}
        ${opt('overdue', 'Overdue', _loaFilter.due)}${opt('soon', 'Due in ' + LOA_DUE_SOON_DAYS + ' days', _loaFilter.due)}${opt('out', 'Out for cal', _loaFilter.due)}
      </select>
      <select class="loa-select" onchange="_loaFilter.calType=this.value;_loaShowLimit=300;renderLoaPanel()">
        ${opt('all', 'All cal types', _loaFilter.calType)}
        ${Object.entries(LOA_CAL_TYPES).map(([k, l]) => opt(k, l, _loaFilter.calType)).join('')}
        ${opt('none', '— No cal type —', _loaFilter.calType)}
      </select>
      <select class="loa-select" onchange="_loaFilter.location=this.value;_loaShowLimit=300;renderLoaPanel()">
        ${opt('all', 'All locations', _loaFilter.location)}
        ${loaLocations.map(l => opt(l.id, l.name + (l.active ? '' : ' (retired)'), _loaFilter.location)).join('')}
        ${opt('none', '— No location —', _loaFilter.location)}
      </select>
      <select class="loa-select" onchange="_loaFilter.vendor=this.value;_loaShowLimit=300;renderLoaPanel()">
        ${opt('all', 'All cal sources', _loaFilter.vendor)}${opt('in_house', 'NU Labs (in-house)', _loaFilter.vendor)}
        ${vendorIds.map(v => opt(v.id, v.name, _loaFilter.vendor)).join('')}
      </select>
      <button class="loa-link-btn" onclick="_loaResetFilters()">Reset</button>
      <span class="loa-result-n">${list.length} shown</span>
    </div>

    ${edit && _loaSelected.size ? `<div class="loa-bulkbar">
      <strong>${_loaSelected.size}</strong> selected
      <button class="emp-add-btn" onclick="openLoaSendModal()">Send out for cal</button>
      <button class="loa-link-btn" onclick="_loaSelected.clear();renderLoaPanel()">Clear</button>
    </div>` : ''}

    <div class="loa-table-wrap">
      <table class="loa-table">
        <thead><tr>
          ${edit ? `<th class="loa-td-check"></th>` : ''}
          ${th('asset_id', 'Asset ID')}${th('description', 'Description')}${th('manufacturer', 'Make')}${th('model_no', 'Model')}
          ${th('serial_no', 'Serial')}${th('location', 'Location')}${th('cal_type', 'Cal Type')}${th('last_cal', 'Last Cal')}
          ${th('next_due', 'Next Due')}${th('vendor', 'Cal Source')}<th></th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="12" class="loa-empty">No assets match these filters.</td></tr>`}</tbody>
      </table>
      ${list.length > shown.length ? `<div class="loa-more"><button class="loa-link-btn" onclick="_loaShowLimit+=500;renderLoaPanel()">Show more (${list.length - shown.length} remaining)</button></div>` : ''}
    </div>`;

  if (wasFocused) {
    const s2 = wrap.querySelector('.loa-search');
    if (s2) { s2.focus(); s2.setSelectionRange(selStart, selStart); }
  }
}

function _loaTile(key) {
  if (key === 'in_service') { _loaResetFilters(); return; }
  if (key === 'notype') {
    _loaFilter.calType = _loaFilter.calType === 'none' ? 'all' : 'none';
    _loaFilter.status = 'in_service';
  } else {
    _loaFilter.due = _loaFilter.due === key ? 'all' : key;
    _loaFilter.status = key === 'out' ? 'all' : 'in_service';
    if (_loaFilter.due !== 'all') _loaSort = { key: 'next_due', dir: 1 };
  }
  _loaShowLimit = 300;
  renderLoaPanel();
}
function _loaResetFilters() {
  _loaFilter = { status: 'in_service', calType: 'all', location: 'all', vendor: 'all', due: 'all' };
  _loaSearch = '';
  _loaSort = { key: 'asset_id', dir: 1 };
  _loaShowLimit = 300;
  renderLoaPanel();
}
function _loaSortBy(key) {
  _loaSort = _loaSort.key === key ? { key, dir: -_loaSort.dir } : { key, dir: 1 };
  renderLoaPanel();
}
function _loaToggleSel(id, on) {
  if (on) _loaSelected.add(id); else _loaSelected.delete(id);
  renderLoaPanel();
}

// ---------- drawer ----------
function ensureLoaDrawer() {
  if (document.getElementById('loaDrawer')) return;
  const bd = document.createElement('div');
  bd.className = 'client-drawer-backdrop';
  bd.id = 'loaDrawerBackdrop';
  bd.onclick = closeLoaDrawer;
  const dr = document.createElement('div');
  dr.className = 'client-drawer loa-drawer';
  dr.id = 'loaDrawer';
  dr.innerHTML = `
    <div class="client-drawer-header">
      <div class="client-drawer-title" id="loaDrawerTitle">Asset</div>
      <button class="client-drawer-close" onclick="closeLoaDrawer()">&#x2715;</button>
    </div>
    <div class="client-drawer-tabs" id="loaDrawerTabs"></div>
    <div class="client-drawer-body" id="loaDrawerBody"></div>
    <div class="client-save-bar" id="loaSaveBar">
      <button class="btn btn-ghost" id="loaDeleteBtn" onclick="deleteLoaAsset()" style="margin-right:auto;color:var(--red)">&#x1F5D1; Delete Asset</button>
      <button class="btn btn-primary" id="loaSaveBtn" onclick="saveLoaAsset()">Save Changes</button>
      <button class="btn btn-ghost" onclick="closeLoaDrawer()">Cancel</button>
    </div>`;
  document.body.appendChild(bd);
  document.body.appendChild(dr);
}

function openNewLoaDrawer() {
  if (!loaCanEdit()) return;
  ensureLoaDrawer();
  _loaDrawerId = null;
  _loaDrawerTab = 'ltab-details';
  document.getElementById('loaDrawerTitle').textContent = 'New Asset';
  _showLoaDrawer();
  setTimeout(() => document.getElementById('laId')?.focus(), 100);
}

function openLoaDrawer(assetId) {
  const a = loaAssets.find(x => x.asset_id === assetId);
  if (!a) return;
  ensureLoaDrawer();
  _loaDrawerId = assetId;
  _loaDrawerTab = 'ltab-details';
  _loaEditCalId = null; _loaEditRepId = null;
  document.getElementById('loaDrawerTitle').textContent = a.asset_id + (a.description ? ' — ' + a.description : '');
  _showLoaDrawer();
}

function _showLoaDrawer() {
  renderLoaDrawer();
  document.getElementById('loaDrawer').classList.add('open');
  document.getElementById('loaDrawerBackdrop').classList.add('open');
}
function closeLoaDrawer() {
  document.getElementById('loaDrawer')?.classList.remove('open');
  document.getElementById('loaDrawerBackdrop')?.classList.remove('open');
}
function switchLoaTab(tab) {
  _loaDrawerTab = tab;
  _loaEditCalId = null; _loaEditRepId = null;
  renderLoaDrawer();
}

function renderLoaDrawer() {
  const a = _loaDrawerId ? loaAssets.find(x => x.asset_id === _loaDrawerId) : null;
  const tabs = [['ltab-details', '&#x1F4CB; Details']];
  if (a) tabs.push(['ltab-cal', '&#x1F4CF; Calibration'], ['ltab-repair', '&#x1F527; Repairs']);
  document.getElementById('loaDrawerTabs').innerHTML = tabs.map(([k, l]) =>
    `<div class="client-dtab ${_loaDrawerTab === k ? 'active' : ''}" onclick="switchLoaTab('${k}')">${l}</div>`).join('');

  const onDetails = _loaDrawerTab === 'ltab-details';
  document.getElementById('loaSaveBar').style.display = (loaCanEdit() && onDetails) ? 'flex' : 'none';
  document.getElementById('loaDeleteBtn').style.display = (a && loaCanDelete()) ? 'inline-flex' : 'none';

  if (_loaDrawerTab === 'ltab-details') document.getElementById('loaDrawerBody').innerHTML = _loaDetailsHtml(a);
  else if (_loaDrawerTab === 'ltab-cal') _renderLoaCalTab(a);
  else if (_loaDrawerTab === 'ltab-repair') _renderLoaRepairTab(a);
}

function _loaStatusBanner(a) {
  const s = loaStatus[a.asset_id] || {};
  const bits = [];
  if (s.out_for_cal) bits.push(`<span class="loa-due out">Out for cal since ${lFmt(s.out_for_cal_since)}${s.out_for_cal_vendor_id ? ' — ' + lEsc(lVendorName(s.out_for_cal_vendor_id)) : ''}</span>`);
  if (s.last_cal_date) bits.push(`<span class="loa-chip">Last cal ${lFmt(s.last_cal_date)}</span>`);
  if (s.next_due && !s.out_for_cal) bits.push(`<span class="loa-due ${lDueState(a)}">Next due ${lFmt(s.next_due)}</span>`);
  if (a.status === 'out_of_service') bits.push('<span class="loa-oos">Out of service</span>');
  return bits.length ? `<div class="loa-banner">${bits.join('')}</div>` : '';
}

function _loaDetailsHtml(a) {
  const edit = loaCanEdit();
  const dis = edit ? '' : 'disabled';
  const v = (k) => lEsc(a ? (a[k] == null ? '' : a[k]) : '');
  const input = (id, val, ph, type, extra) =>
    `<input id="${id}" type="${type || 'text'}" value="${val}" placeholder="${lEsc(ph || '')}" ${dis} ${extra || ''} />`;
  const fld = (label, inner, full) => `<div class="client-field" ${full ? 'style="margin-bottom:10px"' : ''}><label>${label}</label>${inner}</div>`;

  const calVendors = (typeof getVendorsForService === 'function') ? getVendorsForService('calibration') : [];
  const curVendor = a?.cal_vendor_id;
  if (curVendor && !calVendors.some(x => x.id === curVendor) && typeof vendorStore !== 'undefined') {
    const cv = vendorStore.find(x => x.id === curVendor);
    if (cv) calVendors.push(cv);
  }
  const ct = a?.cal_type || '';

  return `
    ${a ? _loaStatusBanner(a) : ''}
    <div class="client-detail-section">
      <div class="client-detail-section-title">Identification</div>
      <div class="client-field-row">
        ${fld('Asset ID *', input('laId', v('asset_id'), '000123', 'text', 'maxlength="10" style="font-family:\'JetBrains Mono\',monospace"'))}
        ${fld('Status', `<select id="laStatus" class="loa-select" ${dis}>
          ${Object.entries(LOA_STATUS).map(([k, l]) => `<option value="${k}" ${(a?.status || 'in_service') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      </div>
      ${fld('Description', input('laDesc', v('description'), 'e.g. Multimeter').replace('<input ', '<input class="full" '), true)}
      <div class="client-field-row">
        ${fld('Manufacturer', input('laMfr', v('manufacturer'), ''))}
        ${fld('Model #', input('laModel', v('model_no'), ''))}
      </div>
      <div class="client-field-row">
        ${fld('Serial #', input('laSerial', v('serial_no'), ''))}
        ${fld('Location', `<select id="laLoc" class="loa-select" ${dis}><option value="">—</option>
          ${loaLocations.filter(l => l.active || l.id === a?.location_id).map(l =>
            `<option value="${l.id}" ${a?.location_id === l.id ? 'selected' : ''}>${lEsc(l.name)}</option>`).join('')}</select>`)}
      </div>
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Calibration</div>
      <div class="client-field-row">
        ${fld('Cal Type', `<select id="laCalType" class="loa-select" ${dis} onchange="document.getElementById('laMonthsWrap').style.display=this.value==='interval'?'':'none'">
          <option value="">—</option>
          ${Object.entries(LOA_CAL_TYPES).map(([k, l]) => `<option value="${k}" ${ct === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        <div class="client-field" id="laMonthsWrap" style="${ct === 'interval' ? '' : 'display:none'}"><label>Interval (months) *</label>
          ${input('laMonths', v('cal_interval_months'), '12', 'number', 'min="1" step="1"')}</div>
      </div>
      <div class="client-field-row">
        ${fld('Usual Cal Vendor', `<select id="laVendor" class="loa-select" ${dis}><option value="">— none / in-house —</option>
          ${calVendors.map(x => `<option value="${x.id}" ${curVendor === x.id ? 'selected' : ''}>${lEsc(x.name)}${x.status !== 'approved' ? ' (' + x.status + ')' : ''}</option>`).join('')}</select>`)}
        ${fld('Test Category', input('laTestCat', v('test_category'), 'e.g. CS114, RE102'))}
      </div>
      <div class="client-field-row">
        ${fld('Linked Asset', input('laLink', v('linked_asset_id'), 'Asset ID', 'text', 'maxlength="10" list="loaAssetIdList"'))}
        ${fld('Link Note', input('laLinkNote', v('link_note'), 'e.g. cal with this asset / paired'))}
      </div>
      <datalist id="loaAssetIdList">${loaAssets.slice(0, 2000).map(x => `<option value="${lEsc(x.asset_id)}">${lEsc(x.description || '')}</option>`).join('')}</datalist>
      ${a?.linked_asset_id ? `<div class="loa-meta"><a class="loa-link-btn" onclick="openLoaDrawer('${lJs(a.linked_asset_id)}')">Open ${lEsc(a.linked_asset_id)} →</a></div>` : ''}
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Purchase</div>
      <div class="client-field-row">
        ${fld('Purchase Source', input('laPSrc', v('purchase_source'), ''))}
        ${fld('Purchase Price', input('laPPrice', v('purchase_price'), '0.00', 'number', 'step="0.01" min="0"'))}
      </div>
      <div class="client-field" style="max-width:200px">${'<label>Purchase Date</label>' + input('laPDate', v('purchase_date'), '', 'date')}</div>
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Records &amp; Notes</div>
      ${fld('File Location', input('laFile', v('file_location'), '\\\\NU3\\Quality Documents\\…').replace('<input ', '<input class="full" '), true)}
      <div class="client-field"><label>Notes</label>
        <textarea class="full" id="laNotes" ${dis}>${v('notes')}</textarea></div>
    </div>

    ${a ? `<div class="client-detail-section">
      <div class="client-detail-section-title">Original LOA Record</div>
      <div id="loaLegacyBox"><button class="loa-link-btn" onclick="_loaShowLegacy('${lJs(a.asset_id)}')">Show the row imported from NU_LOA_V4</button></div>
    </div>` : ''}`;
}

async function _loaShowLegacy(assetId) {
  const box = document.getElementById('loaLegacyBox');
  if (!box) return;
  box.innerHTML = '<div class="loa-meta">Loading…</div>';
  const { data, error } = await sb.from('loa_assets').select('legacy').eq('asset_id', assetId).maybeSingle();
  if (error) { box.innerHTML = ''; lErr('Could not load original record', error); return; }
  const leg = data?.legacy;
  if (!leg) { box.innerHTML = '<div class="loa-meta">No imported record — this asset was added in NUWorkspace.</div>'; return; }
  box.innerHTML = `<table class="loa-legacy">${Object.entries(leg)
    .filter(([, val]) => val !== null && val !== '' && val !== false)
    .map(([k, val]) => `<tr><th>${lEsc(k)}</th><td>${lEsc(val === true ? 'Yes' : val)}</td></tr>`).join('')}</table>`;
}

async function saveLoaAsset() {
  if (!loaCanEdit()) return;
  const g = id => (document.getElementById(id)?.value ?? '').trim();
  const nz = s => s === '' ? null : s;
  const newId = g('laId');
  if (!newId) { lToast('Asset ID is required'); document.getElementById('laId')?.focus(); return; }
  if (newId.length > 10) { lToast('Asset ID can be at most 10 characters'); return; }

  const calType = nz(g('laCalType'));
  const months = calType === 'interval' ? parseInt(g('laMonths'), 10) : null;
  if (calType === 'interval' && !(months > 0)) { lToast('Enter the interval in months'); document.getElementById('laMonths')?.focus(); return; }

  const link = nz(g('laLink'));
  if (link && link.toUpperCase() === newId.toUpperCase()) { lToast('An asset cannot be linked to itself'); return; }
  if (link && !loaAssets.some(x => x.asset_id === link)) { lToast('Linked asset ' + link + ' does not exist'); return; }

  const price = g('laPPrice');
  const fields = {
    description: nz(g('laDesc')), manufacturer: nz(g('laMfr')), model_no: nz(g('laModel')), serial_no: nz(g('laSerial')),
    status: g('laStatus') || 'in_service', location_id: nz(g('laLoc')),
    cal_type: calType, cal_interval_months: months, cal_vendor_id: nz(g('laVendor')),
    linked_asset_id: link, link_note: nz(g('laLinkNote')), test_category: nz(g('laTestCat')),
    purchase_source: nz(g('laPSrc')), purchase_price: price === '' ? null : Number(price), purchase_date: nz(g('laPDate')),
    file_location: nz(g('laFile')), notes: nz(g('laNotes')),
  };

  const btn = document.getElementById('loaSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const oldId = _loaDrawerId;
    if (oldId) {
      if (newId !== oldId) {
        if (!confirm(`Renumber asset ${oldId} to ${newId}?\n\nIts calibration and repair history, and any assets linked to it, move with it.`)) return;
        fields.asset_id = newId;
      }
      const { error } = await sb.from('loa_assets').update(fields).eq('asset_id', oldId);
      if (error) return _loaSaveErr(error, newId);
      if (newId !== oldId) { await loadLoaData(true); }
      else await refreshLoaAsset(oldId);
    } else {
      const { error } = await sb.from('loa_assets').insert({ ...fields, asset_id: newId, created_by: lActor() });
      if (error) return _loaSaveErr(error, newId);
      await refreshLoaAsset(newId);
    }
    _loaDrawerId = newId;
    const a = loaAssets.find(x => x.asset_id === newId);
    document.getElementById('loaDrawerTitle').textContent = newId + (a?.description ? ' — ' + a.description : '');
    renderLoaDrawer();
    renderLoaPanel();
    lToast(oldId ? '✓ Asset saved' : '✓ Asset added');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

function _loaSaveErr(error, id) {
  if (error?.code === '23505') { lToast('⚠ Asset ID ' + id + ' already exists'); return; }
  if (error?.code === '23514') { lToast('⚠ ' + (error.message || 'A value is not allowed')); return; }
  lErr('Could not save asset', error);
}

async function deleteLoaAsset() {
  if (!loaCanDelete() || !_loaDrawerId) return;
  const id = _loaDrawerId;
  if (!confirm(`Delete asset ${id}?\n\nThis cannot be undone.`)) return;
  const { error } = await sb.from('loa_assets').delete().eq('asset_id', id);
  if (error) {
    if (error.code === '23503') {
      lToast('⚠ ' + id + ' has calibration or repair history and cannot be deleted — set it Out of Service instead.');
      return;
    }
    lErr('Could not delete asset', error); return;
  }
  closeLoaDrawer();
  await loadLoaData(true);
  renderLoaPanel();
  lToast('Asset ' + id + ' deleted');
}

// ---------- calibration tab ----------
async function _loaLoadCal(assetId) {
  const { data, error } = await sb.from('loa_cal_records').select('*').eq('asset_id', assetId)
    .order('cal_date', { ascending: false, nullsFirst: true }).order('sent_date', { ascending: false });
  if (error) { lErr('Could not load cal records', error); return []; }
  // Open (out for cal) first, then newest cal date first.
  _loaCalCache[assetId] = (data || []).sort((x, y) => {
    const ox = x.sent_date && !x.returned_date ? 1 : 0, oy = y.sent_date && !y.returned_date ? 1 : 0;
    if (ox !== oy) return oy - ox;
    return String(y.cal_date || y.sent_date || '').localeCompare(String(x.cal_date || x.sent_date || ''));
  });
  return _loaCalCache[assetId];
}

async function _renderLoaCalTab(a) {
  const body = document.getElementById('loaDrawerBody');
  body.innerHTML = '<div class="loa-empty">Loading…</div>';
  const recs = _loaCalCache[a.asset_id] || await _loaLoadCal(a.asset_id);
  if (_loaDrawerId !== a.asset_id || _loaDrawerTab !== 'ltab-cal') return;
  const edit = loaCanEdit(), del = loaCanDelete();
  const s = loaStatus[a.asset_id] || {};
  const open = recs.find(r => r.sent_date && !r.returned_date);
  const editing = _loaEditCalId ? recs.find(r => r.id === _loaEditCalId) : null;

  let form = '';
  if (edit && open && !editing) form = _loaCheckInForm(a, open);
  else if (edit && (editing || _loaEditCalId === 'new')) form = _loaCalForm(a, editing);

  const actions = edit && !form ? `<div class="loa-actions">
      ${a.status === 'in_service' && !open ? `<button class="btn btn-primary" onclick="openLoaSendModal(['${lJs(a.asset_id)}'])">Send out for cal</button>` : ''}
      <button class="btn btn-ghost loa-outline" onclick="_loaEditCalId='new';renderLoaDrawer()">+ Record a calibration</button>
    </div>` : '';

  body.innerHTML = `
    ${_loaStatusBanner(a)}
    <div class="loa-meta" style="margin-bottom:12px">Cal type: <strong>${lEsc(lCalTypeLabel(a) || 'not set')}</strong>
      ${a.cal_vendor_id ? ' · Usual vendor: <strong>' + lEsc(lVendorName(a.cal_vendor_id)) + '</strong>' : ''}</div>
    ${form}${actions}
    <div class="client-detail-section-title" style="margin-top:18px">History</div>
    ${recs.length === 0 ? '<div class="loa-empty">No calibration records yet.</div>' : recs.map(r => `
      <div class="loa-rec ${r.sent_date && !r.returned_date ? 'open' : ''}">
        <div class="loa-rec-head">
          <span class="loa-rec-date">${r.cal_date ? lFmt(r.cal_date) : 'Not yet calibrated'}</span>
          <span class="loa-chip">${r.in_house ? 'NU Labs (in-house)' : lEsc(lVendorName(r.vendor_id) || 'Vendor not set')}</span>
          ${r.result ? `<span class="loa-result ${r.result}">${LOA_RESULTS[r.result]}</span>` : ''}
          ${r.sent_date && !r.returned_date ? '<span class="loa-due out">Out for cal</span>' : ''}
          <span style="margin-left:auto;display:flex;gap:2px">
            ${edit ? `<button class="client-action-btn" title="Edit" onclick="_loaEditCalId='${r.id}';renderLoaDrawer()">&#x270E;</button>` : ''}
            ${del ? `<button class="client-action-btn" title="Delete" onclick="deleteLoaCal('${r.id}')">&#x2715;</button>` : ''}
          </span>
        </div>
        <div class="loa-rec-grid">
          ${r.sent_date ? `<span>Sent <b>${lFmt(r.sent_date)}</b></span>` : ''}
          ${r.returned_date ? `<span>Returned <b>${lFmt(r.returned_date)}</b></span>` : ''}
          ${r.due_date ? `<span>Due <b>${lFmt(r.due_date)}</b></span>` : ''}
          ${r.cost != null ? `<span>Cost <b>${lMoney(r.cost)}</b></span>` : ''}
          ${r.cert_number ? `<span>Cert # <b>${lEsc(r.cert_number)}</b></span>` : ''}
        </div>
        ${r.notes ? `<div class="loa-rec-notes">${lEsc(r.notes)}</div>` : ''}
      </div>`).join('')}`;
}

function _loaVendorOptions(sel) {
  const list = (typeof getVendorsForService === 'function') ? getVendorsForService('calibration') : [];
  if (sel && !list.some(v => v.id === sel) && typeof vendorStore !== 'undefined') {
    const v = vendorStore.find(x => x.id === sel); if (v) list.push(v);
  }
  return list.map(v => `<option value="${v.id}" ${sel === v.id ? 'selected' : ''}>${lEsc(v.name)}</option>`).join('');
}

function _loaCheckInForm(a, open) {
  const today = lToday();
  const due = a.cal_type === 'interval' ? lAddMonths(today, a.cal_interval_months) : '';
  return `<div class="loa-form">
    <div class="loa-form-title">Check in from calibration</div>
    <div class="loa-meta" style="margin:-4px 0 10px">Sent ${lFmt(open.sent_date)}${open.vendor_id ? ' to ' + lEsc(lVendorName(open.vendor_id)) : ''}.</div>
    <div class="client-field-row">
      <div class="client-field"><label>Returned *</label><input type="date" id="lcReturned" value="${today}" /></div>
      <div class="client-field"><label>Cal Date (on cert) *</label><input type="date" id="lcCalDate" value="${today}"
        onchange="_loaAutoDue(this.value)" /></div>
    </div>
    <div class="client-field-row">
      <div class="client-field"><label>Due Date</label><input type="date" id="lcDue" value="${due}" />
        ${a.cal_type === 'interval' ? `<span class="loa-hint">Cal date + ${a.cal_interval_months} months. Change if the cert says otherwise.</span>` : ''}</div>
      <div class="client-field"><label>Result</label><select id="lcResult" class="loa-select"><option value="">—</option>
        ${Object.entries(LOA_RESULTS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    </div>
    <div class="client-field-row">
      <div class="client-field"><label>Cost</label><input type="number" step="0.01" min="0" id="lcCost" value="${open.cost ?? ''}" /></div>
      <div class="client-field"><label>Cert #</label><input type="text" id="lcCert" /></div>
    </div>
    <div class="client-field" style="margin-bottom:10px"><label>Notes</label><textarea class="full" id="lcNotes">${lEsc(open.notes || '')}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="_loaEditCalId='${open.id}';renderLoaDrawer()">Edit record instead</button>
      <button class="btn btn-primary" onclick="checkInLoaCal('${open.id}')">Check In</button>
    </div>
  </div>`;
}

function _loaAutoDue(calDate) {
  const a = loaAssets.find(x => x.asset_id === _loaDrawerId);
  const el = document.getElementById('lcDue');
  if (a && el && a.cal_type === 'interval' && calDate) el.value = lAddMonths(calDate, a.cal_interval_months);
}

async function checkInLoaCal(recId) {
  const g = id => (document.getElementById(id)?.value ?? '').trim();
  const returned = g('lcReturned'), calDate = g('lcCalDate');
  if (!returned || !calDate) { lToast('Returned and cal date are required'); return; }
  const cost = g('lcCost');
  const { error } = await sb.from('loa_cal_records').update({
    returned_date: returned, cal_date: calDate, due_date: g('lcDue') || null,
    result: g('lcResult') || null, cost: cost === '' ? null : Number(cost),
    cert_number: g('lcCert') || null, notes: g('lcNotes') || null,
  }).eq('id', recId);
  if (error) { lErr('Could not check in', error); return; }
  await refreshLoaAsset(_loaDrawerId);
  renderLoaDrawer(); renderLoaPanel();
  lToast('✓ Checked in');
}

function _loaCalForm(a, r) {
  const isNew = !r;
  const inHouse = r ? r.in_house : !a.cal_vendor_id;
  const calDate = r?.cal_date || (isNew ? lToday() : '');
  const due = r ? (r.due_date || '') : (a.cal_type === 'interval' ? lAddMonths(calDate, a.cal_interval_months) : '');
  const vend = r ? r.vendor_id : a.cal_vendor_id;
  return `<div class="loa-form">
    <div class="loa-form-title">${isNew ? 'Record a calibration' : 'Edit calibration record'}</div>
    <label class="loa-check" style="margin-bottom:10px"><input type="checkbox" id="lcInHouse" ${inHouse ? 'checked' : ''}
      onchange="document.getElementById('lcVendorWrap').style.display=this.checked?'none':''" /> Calibrated in-house by NU Labs</label>
    <div class="client-field" id="lcVendorWrap" style="margin-bottom:10px;${inHouse ? 'display:none' : ''}"><label>Vendor</label>
      <select id="lcVendor" class="loa-select"><option value="">—</option>${_loaVendorOptions(vend)}</select></div>
    <div class="client-field-row">
      <div class="client-field"><label>Sent</label><input type="date" id="lcSent" value="${r?.sent_date || ''}" /></div>
      <div class="client-field"><label>Returned</label><input type="date" id="lcReturned" value="${r?.returned_date || ''}" /></div>
    </div>
    <div class="client-field-row">
      <div class="client-field"><label>Cal Date</label><input type="date" id="lcCalDate" value="${calDate}" onchange="_loaAutoDue(this.value)" /></div>
      <div class="client-field"><label>Due Date</label><input type="date" id="lcDue" value="${due}" /></div>
    </div>
    <div class="client-field-row">
      <div class="client-field"><label>Result</label><select id="lcResult" class="loa-select"><option value="">—</option>
        ${Object.entries(LOA_RESULTS).map(([k, l]) => `<option value="${k}" ${r?.result === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="client-field"><label>Cost</label><input type="number" step="0.01" min="0" id="lcCost" value="${r?.cost ?? ''}" /></div>
    </div>
    <div class="client-field" style="margin-bottom:10px"><label>Cert #</label><input type="text" id="lcCert" value="${lEsc(r?.cert_number || '')}" /></div>
    <div class="client-field" style="margin-bottom:10px"><label>Notes</label><textarea class="full" id="lcNotes">${lEsc(r?.notes || '')}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="_loaEditCalId=null;renderLoaDrawer()">Cancel</button>
      <button class="btn btn-primary" onclick="saveLoaCal(${isNew ? 'null' : "'" + r.id + "'"})">Save</button>
    </div>
  </div>`;
}

async function saveLoaCal(recId) {
  const g = id => (document.getElementById(id)?.value ?? '').trim();
  const inHouse = !!document.getElementById('lcInHouse')?.checked;
  const sent = g('lcSent') || null, returned = g('lcReturned') || null, calDate = g('lcCalDate') || null;
  if (!sent && !calDate) { lToast('Enter a sent date or a cal date'); return; }
  if (sent && returned && returned < sent) { lToast('Returned date is before the sent date'); return; }
  const cost = g('lcCost');
  const row = {
    in_house: inHouse, vendor_id: inHouse ? null : (g('lcVendor') || null),
    sent_date: sent, returned_date: returned, cal_date: calDate, due_date: g('lcDue') || null,
    result: g('lcResult') || null, cost: cost === '' ? null : Number(cost),
    cert_number: g('lcCert') || null, notes: g('lcNotes') || null,
  };
  const { error } = recId
    ? await sb.from('loa_cal_records').update(row).eq('id', recId)
    : await sb.from('loa_cal_records').insert({ ...row, asset_id: _loaDrawerId, created_by: lActor() });
  if (error) { lErr('Could not save cal record', error); return; }
  _loaEditCalId = null;
  await refreshLoaAsset(_loaDrawerId);
  renderLoaDrawer(); renderLoaPanel();
  lToast('✓ Calibration saved');
}

async function deleteLoaCal(recId) {
  if (!loaCanDelete() || !confirm('Delete this calibration record?')) return;
  const { error } = await sb.from('loa_cal_records').delete().eq('id', recId);
  if (error) { lErr('Could not delete cal record', error); return; }
  await refreshLoaAsset(_loaDrawerId);
  renderLoaDrawer(); renderLoaPanel();
}

// ---------- send out for cal (one or many) ----------
function ensureLoaModal() {
  if (document.getElementById('loaModal')) return;
  const m = document.createElement('div');
  m.className = 'modal-backdrop loa-modal-backdrop';
  m.id = 'loaModal';
  m.onclick = e => { if (e.target === m) closeLoaModal(); };
  m.innerHTML = `<div class="modal" id="loaModalBox" style="width:480px">
      <div class="modal-header"><div class="modal-title" id="loaModalTitle"></div>
        <button class="modal-close" onclick="closeLoaModal()">&#x2715;</button></div>
      <div class="modal-body" id="loaModalBody"></div>
      <div class="modal-footer" id="loaModalFooter"></div></div>`;
  document.body.appendChild(m);
}
function _openLoaModal(title, body, footer, width) {
  ensureLoaModal();
  document.getElementById('loaModalTitle').textContent = title;
  document.getElementById('loaModalBody').innerHTML = body;
  document.getElementById('loaModalFooter').innerHTML = footer;
  document.getElementById('loaModalBox').style.width = (width || 480) + 'px';
  document.getElementById('loaModal').classList.add('open');
}
function closeLoaModal() { document.getElementById('loaModal')?.classList.remove('open'); }

let _loaSendIds = [];
function openLoaSendModal(ids) {
  if (!loaCanEdit()) return;
  _loaSendIds = (ids && ids.length ? ids : [..._loaSelected])
    .filter(id => { const a = loaAssets.find(x => x.asset_id === id); return a && !loaStatus[id]?.out_for_cal; });
  if (!_loaSendIds.length) { lToast('Nothing to send — selected items are already out for cal'); return; }
  const assets = _loaSendIds.map(id => loaAssets.find(x => x.asset_id === id));
  const vends = [...new Set(assets.map(a => a.cal_vendor_id).filter(Boolean))];
  const defVendor = vends.length === 1 ? vends[0] : '';
  _openLoaModal(_loaSendIds.length === 1 ? 'Send out for calibration' : `Send ${_loaSendIds.length} items out for calibration`, `
    <div class="loa-send-list">${assets.map(a => `<div><span class="loa-mono">${lEsc(a.asset_id)}</span> ${lEsc(a.description || '')}
      <span class="loa-dim">${lEsc(lVendorName(a.cal_vendor_id))}</span></div>`).join('')}</div>
    <div class="field"><label class="field-label">Vendor</label>
      <select class="f-select" id="lsVendor"><option value="">${vends.length > 1 ? 'Each item\'s usual vendor' : '—'}</option>${_loaVendorOptions(defVendor)}</select></div>
    <div class="field-row">
      <div class="field"><label class="field-label">Date Sent *</label><input class="f-input" type="date" id="lsDate" value="${lToday()}" /></div>
      <div class="field"><label class="field-label">Quoted Cost (each)</label><input class="f-input" type="number" step="0.01" min="0" id="lsCost" /></div>
    </div>
    <div class="field"><label class="field-label">Notes</label><input class="f-input" type="text" id="lsNotes" placeholder="PO #, shipping, etc." /></div>`,
    `<button class="btn btn-ghost" onclick="closeLoaModal()">Cancel</button>
     <button class="btn btn-primary" style="margin-left:auto" onclick="sendLoaOut()">Send Out</button>`);
}

async function sendLoaOut() {
  const date = document.getElementById('lsDate')?.value;
  if (!date) { lToast('Date sent is required'); return; }
  const vend = document.getElementById('lsVendor')?.value || null;
  const cost = document.getElementById('lsCost')?.value;
  const notes = (document.getElementById('lsNotes')?.value || '').trim() || null;
  const rows = _loaSendIds.map(id => {
    const a = loaAssets.find(x => x.asset_id === id);
    return { asset_id: id, vendor_id: vend || a?.cal_vendor_id || null, sent_date: date,
      cost: cost === '' || cost == null ? null : Number(cost), notes, created_by: lActor() };
  });
  const { error } = await sb.from('loa_cal_records').insert(rows);
  if (error) { lErr('Could not send out', error); return; }
  closeLoaModal();
  await Promise.all(_loaSendIds.map(id => refreshLoaAsset(id)));
  _loaSelected.clear();
  if (document.getElementById('loaDrawer')?.classList.contains('open')) renderLoaDrawer();
  renderLoaPanel();
  lToast('✓ ' + rows.length + (rows.length === 1 ? ' item' : ' items') + ' marked out for cal');
}

// ---------- repairs tab ----------
async function _renderLoaRepairTab(a) {
  const body = document.getElementById('loaDrawerBody');
  body.innerHTML = '<div class="loa-empty">Loading…</div>';
  let recs = _loaRepCache[a.asset_id];
  if (!recs) {
    const { data, error } = await sb.from('loa_repair_records').select('*').eq('asset_id', a.asset_id)
      .order('repair_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    if (error) { lErr('Could not load repairs', error); return; }
    recs = _loaRepCache[a.asset_id] = data || [];
  }
  if (_loaDrawerId !== a.asset_id || _loaDrawerTab !== 'ltab-repair') return;
  const edit = loaCanEdit(), del = loaCanDelete();
  const editing = _loaEditRepId && _loaEditRepId !== 'new' ? recs.find(r => r.id === _loaEditRepId) : null;
  const showForm = edit && (_loaEditRepId === 'new' || editing);

  body.innerHTML = `
    ${_loaStatusBanner(a)}
    ${showForm ? _loaRepairForm(editing) : (edit ? `<div class="loa-actions"><button class="btn btn-primary" onclick="_loaEditRepId='new';renderLoaDrawer()">+ Add Repair</button></div>` : '')}
    <div class="client-detail-section-title" style="margin-top:18px">History</div>
    ${recs.length === 0 ? '<div class="loa-empty">No repair records.</div>' : recs.map(r => `
      <div class="loa-rec">
        <div class="loa-rec-head">
          <span class="loa-rec-date">${r.repair_date ? lFmt(r.repair_date) : 'Date not recorded'}</span>
          ${r.vendor_id ? `<span class="loa-chip">${lEsc(lVendorName(r.vendor_id))}</span>` : ''}
          ${r.performed_by ? `<span class="loa-chip">${lEsc(r.performed_by)}</span>` : ''}
          ${r.cost != null ? `<span class="loa-chip">${lMoney(r.cost)}</span>` : ''}
          <span style="margin-left:auto;display:flex;gap:2px">
            ${edit ? `<button class="client-action-btn" title="Edit" onclick="_loaEditRepId='${r.id}';renderLoaDrawer()">&#x270E;</button>` : ''}
            ${del ? `<button class="client-action-btn" title="Delete" onclick="deleteLoaRepair('${r.id}')">&#x2715;</button>` : ''}
          </span>
        </div>
        <div class="loa-rec-text">${lEsc(r.description)}</div>
        ${r.notes ? `<div class="loa-rec-notes">${lEsc(r.notes)}</div>` : ''}
      </div>`).join('')}`;
}

function _loaRepairForm(r) {
  const vendors = (typeof getVendorsForService === 'function') ? getVendorsForService('repair') : [];
  if (r?.vendor_id && !vendors.some(v => v.id === r.vendor_id) && typeof vendorStore !== 'undefined') {
    const v = vendorStore.find(x => x.id === r.vendor_id); if (v) vendors.push(v);
  }
  return `<div class="loa-form">
    <div class="loa-form-title">${r ? 'Edit repair' : 'Add repair'}</div>
    <div class="client-field-row">
      <div class="client-field"><label>Date</label><input type="date" id="lrDate" value="${r ? (r.repair_date || '') : lToday()}" /></div>
      <div class="client-field"><label>Cost</label><input type="number" step="0.01" min="0" id="lrCost" value="${r?.cost ?? ''}" /></div>
    </div>
    <div class="client-field-row">
      <div class="client-field"><label>Repair Vendor</label><select id="lrVendor" class="loa-select"><option value="">— in-house / none —</option>
        ${vendors.map(v => `<option value="${v.id}" ${r?.vendor_id === v.id ? 'selected' : ''}>${lEsc(v.name)}</option>`).join('')}</select></div>
      <div class="client-field"><label>Performed By</label><input type="text" id="lrBy" value="${lEsc(r?.performed_by || '')}" /></div>
    </div>
    <div class="client-field" style="margin-bottom:10px"><label>Description *</label><textarea class="full" id="lrDesc">${lEsc(r?.description || '')}</textarea></div>
    <div class="client-field" style="margin-bottom:10px"><label>Notes</label><textarea class="full" id="lrNotes">${lEsc(r?.notes || '')}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="_loaEditRepId=null;renderLoaDrawer()">Cancel</button>
      <button class="btn btn-primary" onclick="saveLoaRepair(${r ? "'" + r.id + "'" : 'null'})">Save</button>
    </div>
  </div>`;
}

async function saveLoaRepair(recId) {
  const g = id => (document.getElementById(id)?.value ?? '').trim();
  const desc = g('lrDesc');
  if (!desc) { lToast('Description is required'); return; }
  const cost = g('lrCost');
  const row = { repair_date: g('lrDate') || null, cost: cost === '' ? null : Number(cost), vendor_id: g('lrVendor') || null,
    performed_by: g('lrBy') || null, description: desc, notes: g('lrNotes') || null };
  const { error } = recId
    ? await sb.from('loa_repair_records').update(row).eq('id', recId)
    : await sb.from('loa_repair_records').insert({ ...row, asset_id: _loaDrawerId, created_by: lActor() });
  if (error) { lErr('Could not save repair', error); return; }
  _loaEditRepId = null;
  delete _loaRepCache[_loaDrawerId];
  renderLoaDrawer();
  lToast('✓ Repair saved');
}

async function deleteLoaRepair(recId) {
  if (!loaCanDelete() || !confirm('Delete this repair record?')) return;
  const { error } = await sb.from('loa_repair_records').delete().eq('id', recId);
  if (error) { lErr('Could not delete repair', error); return; }
  delete _loaRepCache[_loaDrawerId];
  renderLoaDrawer();
}

// ---------- locations ----------
function openLoaLocationsModal() {
  if (!loaCanEdit()) return;
  const used = id => loaAssets.filter(a => a.location_id === id).length;
  const rows = [...loaLocations].sort((a, b) => a.sort_order - b.sort_order);
  _openLoaModal('Locations', `
    <div class="loa-meta">Retire a location instead of deleting it — assets keep it until moved.</div>
    <div class="loa-loc-list">${rows.map((l, i) => `<div class="loa-loc-row ${l.active ? '' : 'retired'}">
      <div class="loa-order">
        <button class="client-action-btn" ${i === 0 ? 'disabled' : ''} onclick="moveLoaLocation('${l.id}',-1)">&#x25B2;</button>
        <button class="client-action-btn" ${i === rows.length - 1 ? 'disabled' : ''} onclick="moveLoaLocation('${l.id}',1)">&#x25BC;</button>
      </div>
      <input class="f-input" value="${lEsc(l.name)}" onchange="updateLoaLocation('${l.id}',{name:this.value})" />
      <label class="loa-check"><input type="checkbox" ${l.active ? 'checked' : ''} onchange="updateLoaLocation('${l.id}',{active:this.checked})" /> Active</label>
      <span class="loa-dim loa-mono" title="Assets here">${used(l.id)}</span>
    </div>`).join('')}</div>
    <div class="loa-loc-add">
      <input class="f-input" id="llNew" placeholder="New location" onkeydown="if(event.key==='Enter')addLoaLocation()" />
      <button class="btn btn-primary" onclick="addLoaLocation()">Add</button>
    </div>`,
    `<button class="btn btn-ghost" style="margin-left:auto" onclick="closeLoaModal()">Done</button>`, 520);
}

async function _loaReloadLocations() {
  const { data, error } = await sb.from('loa_locations').select('*').order('sort_order');
  if (error) { lErr('Could not load locations', error); return; }
  loaLocations = data || [];
  openLoaLocationsModal();
  renderLoaPanel();
}
async function addLoaLocation() {
  const name = (document.getElementById('llNew')?.value || '').trim();
  if (!name) return;
  const max = loaLocations.reduce((m, l) => Math.max(m, l.sort_order || 0), 0);
  const { error } = await sb.from('loa_locations').insert({ name, sort_order: max + 10 });
  if (error) { error.code === '23505' ? lToast('⚠ That location already exists') : lErr('Could not add location', error); return; }
  _loaReloadLocations();
}
async function updateLoaLocation(id, patch) {
  if (patch.name !== undefined) { patch.name = patch.name.trim(); if (!patch.name) { openLoaLocationsModal(); return; } }
  const { error } = await sb.from('loa_locations').update(patch).eq('id', id);
  if (error) { error.code === '23505' ? lToast('⚠ That location already exists') : lErr('Could not update location', error); }
  _loaReloadLocations();
}
async function moveLoaLocation(id, dir) {
  const rows = [...loaLocations].sort((a, b) => a.sort_order - b.sort_order);
  const i = rows.findIndex(l => l.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  const res = await Promise.all(rows.map((l, k) => sb.from('loa_locations').update({ sort_order: (k + 1) * 10 }).eq('id', l.id)));
  const bad = res.find(r => r.error);
  if (bad) lErr('Could not reorder locations', bad.error);
  _loaReloadLocations();
}

// Escape: modal first, then drawer.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('loaModal')?.classList.contains('open')) { closeLoaModal(); return; }
  if (document.getElementById('loaDrawer')?.classList.contains('open')) closeLoaDrawer();
});

window.openLoaPanel   = openLoaPanel;
window.renderLoaPanel = renderLoaPanel;
