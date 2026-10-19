// ===== VENDORS =====
// Shared vendor register used by LOA (calibration / repair vendors) and,
// later, Purchase Requests (job materials). Tables: vendors,
// vendor_service_types, vendor_services, vendor_contacts, vendor_evaluations
// (migration 2026-10-19_vendors.sql).
//
// Capabilities (Setup → Permissions → Vendors):
//   view_vendors   — see the Vendors nav item and page
//   edit_vendors   — add / edit vendors, contacts, evaluations, service types
//   delete_vendors — delete vendors
//
// Status lifecycle: proposed → approved | rejected; approved → inactive.
// Vendors added here start Approved. Proposed vendors come from PRs (later).
//
// ISO/IEC 17025 §6.6: a vendor offering any service type flagged
// requires_17025_eval gets the accreditation fields and the evaluation log.
//
// Writes go straight to sb and check the error, then reload from the
// database — no optimistic local updates, so a rejected write is never left
// looking saved on screen.

let vendorStore        = [];   // vendors rows
let vendorTypeStore    = [];   // vendor_service_types rows
let vendorServiceStore = [];   // vendor_services rows
let vendorContactStore = [];   // vendor_contacts rows
let _vendorsLoaded     = false;

let _vendorSearch       = '';
let _vendorStatusFilter = 'current';   // current | approved | proposed | rejected | inactive | all
let _vendorTypeFilter   = 'all';       // 'all' or a service type id
let _vendorFlagFilter   = false;       // show only vendors with 17025 flags

let _vendorDrawerId  = null;           // null = new vendor
let _vendorDrawerTab = 'vtab-info';
let _vendorDraft     = null;           // unsaved Info-tab values, kept across tab switches
let _vendorEvalCache = {};             // vendorId -> evaluations[]
let _vendorContactEditId = null;

const VENDOR_STATUS = {
  proposed: { label: 'Proposed', cls: 'proposed' },
  approved: { label: 'Approved', cls: 'approved' },
  rejected: { label: 'Rejected', cls: 'rejected' },
  inactive: { label: 'Inactive', cls: 'inactive' },
};
const VENDOR_EVAL_TYPES    = { initial: 'Initial', periodic: 'Periodic', issue: 'Issue' };
const VENDOR_EVAL_OUTCOMES = { acceptable: 'Acceptable', conditional: 'Conditional', unacceptable: 'Unacceptable' };
const VENDOR_EXPIRY_WARN_DAYS = 60;

// ---------- helpers ----------
function vCanView()   { return typeof can === 'function' ? can('view_vendors')   : false; }
function vCanEdit()   { return typeof can === 'function' ? can('edit_vendors')   : false; }
function vCanDelete() { return typeof can === 'function' ? can('delete_vendors') : false; }

function vEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function vToast(msg) { if (typeof toast === 'function') toast(msg); }
function vActorId() {
  const e = (typeof realEmployee !== 'undefined' && realEmployee) ? realEmployee
          : (typeof currentEmployee !== 'undefined' ? currentEmployee : null);
  return e && e.id ? e.id : null;
}
function vEmpName(id) {
  if (!id || typeof employees === 'undefined') return '';
  const e = employees.find(x => x.id === id);
  return e ? e.name : '';
}
function vFmtDate(d) {
  if (!d) return '';
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function vTodayStr() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}
function vDaysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date(vTodayStr() + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}
function vErr(prefix, error) {
  console.error('[vendors] ' + prefix, error);
  vToast('⚠ ' + prefix + (error && error.message ? ': ' + error.message : ''));
}

function vTypeIdsFor(vendorId) {
  return vendorServiceStore.filter(s => s.vendor_id === vendorId).map(s => s.service_type_id);
}
function vTypesFor(vendorId) {
  const ids = vTypeIdsFor(vendorId);
  return vendorTypeStore.filter(t => ids.includes(t.id)).sort((a, b) => a.sort_order - b.sort_order);
}
function vNeeds17025(typeIds) {
  return vendorTypeStore.some(t => typeIds.includes(t.id) && t.requires_17025_eval);
}

// 17025 warnings for an approved vendor whose services require evaluation.
function vVendorFlags(v) {
  if (!v || v.status !== 'approved') return [];
  if (!vNeeds17025(vTypeIdsFor(v.id))) return [];
  const flags = [];
  const exp = vDaysUntil(v.accreditation_expires);
  if (!v.accreditation_expires)           flags.push({ level: 'warn', text: 'No accreditation on file' });
  else if (exp < 0)                       flags.push({ level: 'bad',  text: 'Accreditation expired' });
  else if (exp <= VENDOR_EXPIRY_WARN_DAYS) flags.push({ level: 'warn', text: 'Accreditation expires in ' + exp + 'd' });
  const re = vDaysUntil(v.reeval_due);
  if (!v.reeval_due)                      flags.push({ level: 'warn', text: 'No re-evaluation date' });
  else if (re < 0)                        flags.push({ level: 'bad',  text: 'Re-evaluation overdue' });
  return flags;
}

// ---------- data ----------
async function loadVendorData() {
  if (!sb) return;
  const [v, t, s, c] = await Promise.all([
    sb.from('vendors').select('*').order('name'),
    sb.from('vendor_service_types').select('*').order('sort_order'),
    sb.from('vendor_services').select('vendor_id,service_type_id'),
    sb.from('vendor_contacts').select('*').order('last_name'),
  ]);
  const firstErr = v.error || t.error || s.error || c.error;
  if (firstErr) { vErr('Could not load vendors', firstErr); return; }
  vendorStore        = v.data || [];
  vendorTypeStore    = t.data || [];
  vendorServiceStore = s.data || [];
  vendorContactStore = c.data || [];
  _vendorsLoaded = true;
}

async function loadVendorEvaluations(vendorId) {
  const { data, error } = await sb.from('vendor_evaluations')
    .select('*').eq('vendor_id', vendorId)
    .order('eval_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) { vErr('Could not load evaluations', error); return []; }
  _vendorEvalCache[vendorId] = data || [];
  return _vendorEvalCache[vendorId];
}

// Lookup used by LOA and Purchases: active, approved vendors offering a
// service type, by its stable code (e.g. 'calibration', 'repair').
function getVendorsForService(code, opts) {
  const includeProposed = !!(opts && opts.includeProposed);
  const type = vendorTypeStore.find(t => t.code === code);
  if (!type) return [];
  const ids = new Set(vendorServiceStore.filter(s => s.service_type_id === type.id).map(s => s.vendor_id));
  return vendorStore
    .filter(v => ids.has(v.id) && (v.status === 'approved' || (includeProposed && v.status === 'proposed')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- panel ----------
async function openVendorsPanel(el) {
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (el || document.getElementById('navVendors'))?.classList.add('active');
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'Vendors';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-vendors')?.classList.add('active');

  const body = document.getElementById('vendorsPanelBody');
  if (!vCanView()) {
    if (body) body.innerHTML = '<div class="vnd-empty">Your role does not include View Vendors.</div>';
    return;
  }
  if (!_vendorsLoaded && body) body.innerHTML = '<div class="vnd-empty">Loading vendors…</div>';
  await loadVendorData();
  renderVendorsPanel();
}

function renderVendorsPanel() {
  const body = document.getElementById('vendorsPanelBody');
  if (!body) return;

  const q = _vendorSearch.toLowerCase().trim();
  const contactHits = {};
  if (q) {
    vendorContactStore.forEach(ct => {
      const nm = ((ct.first_name || '') + ' ' + (ct.last_name || '')).trim();
      if (nm.toLowerCase().includes(q) || (ct.email || '').toLowerCase().includes(q)) {
        (contactHits[ct.vendor_id] = contactHits[ct.vendor_id] || []).push(nm || ct.email);
      }
    });
  }

  const statusOk = v => {
    if (_vendorStatusFilter === 'all')     return true;
    if (_vendorStatusFilter === 'current') return v.status === 'approved' || v.status === 'proposed';
    return v.status === _vendorStatusFilter;
  };
  const typeOk = v => _vendorTypeFilter === 'all' || vTypeIdsFor(v.id).includes(_vendorTypeFilter);
  const searchOk = v => !q || v.name.toLowerCase().includes(q) || !!contactHits[v.id];
  const flagOk = v => !_vendorFlagFilter || vVendorFlags(v).length > 0;

  const list = vendorStore.filter(v => statusOk(v) && typeOk(v) && searchOk(v) && flagOk(v))
    .sort((a, b) => a.name.localeCompare(b.name));

  const count = st => st === 'all' ? vendorStore.length
    : st === 'current' ? vendorStore.filter(v => v.status === 'approved' || v.status === 'proposed').length
    : vendorStore.filter(v => v.status === st).length;
  const flaggedCount = vendorStore.filter(v => vVendorFlags(v).length > 0).length;

  const chip = (active, onclick, label, n, extraCls) =>
    `<button class="vnd-chip ${active ? 'active' : ''} ${extraCls || ''}" onclick="${onclick}">${label}` +
    (n != null ? ` <span class="vnd-chip-n">${n}</span>` : '') + `</button>`;

  const statusChips = [
    ['current', 'Current'], ['approved', 'Approved'], ['proposed', 'Proposed'],
    ['rejected', 'Rejected'], ['inactive', 'Inactive'], ['all', 'All'],
  ].map(([k, l]) => chip(_vendorStatusFilter === k, `_vendorStatusFilter='${k}';renderVendorsPanel()`, l, count(k))).join('');

  const typeChips = chip(_vendorTypeFilter === 'all', `_vendorTypeFilter='all';renderVendorsPanel()`, 'All services') +
    vendorTypeStore.filter(t => t.active).map(t =>
      chip(_vendorTypeFilter === t.id, `_vendorTypeFilter='${t.id}';renderVendorsPanel()`, vEsc(t.name),
        vendorServiceStore.filter(s => s.service_type_id === t.id).length)
    ).join('');

  const flagChip = flaggedCount
    ? chip(_vendorFlagFilter, `_vendorFlagFilter=!_vendorFlagFilter;renderVendorsPanel()`, '⚠ 17025 attention', flaggedCount, 'warn')
    : '';

  const searchEl = body.querySelector('.emp-search');
  const wasFocused = searchEl && document.activeElement === searchEl;
  const selStart = wasFocused ? searchEl.selectionStart : null;
  const selEnd   = wasFocused ? searchEl.selectionEnd   : null;

  const cards = list.map(v => {
    const types = vTypesFor(v.id);
    const contacts = vendorContactStore.filter(ct => ct.vendor_id === v.id);
    const flags = vVendorFlags(v);
    const st = VENDOR_STATUS[v.status] || VENDOR_STATUS.approved;
    const hits = (q && !v.name.toLowerCase().includes(q)) ? (contactHits[v.id] || []) : [];
    return `<div class="client-card vnd-card ${v.status !== 'approved' ? 'vnd-dim-' + v.status : ''}" onclick="openVendorDrawer('${v.id}')">
      <div class="client-actions">
        <button class="client-action-btn" onclick="event.stopPropagation();openVendorDrawer('${v.id}')" title="${vCanEdit() ? 'Edit' : 'View'}">&#x270E;</button>
        ${vCanDelete() ? `<button class="client-action-btn" onclick="event.stopPropagation();deleteVendor('${v.id}')" title="Delete">&#x2715;</button>` : ''}
      </div>
      <div class="vnd-card-top">
        <div class="client-name">${vEsc(v.name)}</div>
        ${v.status !== 'approved' ? `<span class="vnd-status ${st.cls}">${st.label}</span>` : ''}
      </div>
      ${v.city || v.state ? `<div class="vnd-sub">${vEsc([v.city, v.state].filter(Boolean).join(', '))}</div>` : ''}
      ${v.phone ? `<div class="vnd-sub">📞 ${vEsc(v.phone)}</div>` : ''}
      <div class="vnd-type-row">
        ${types.length ? types.map(t => `<span class="vnd-type ${t.requires_17025_eval ? 'iso' : ''}">${vEsc(t.name)}</span>`).join('')
                       : '<span class="vnd-sub" style="font-style:italic">No services set</span>'}
      </div>
      ${flags.length ? `<div class="vnd-flags">${flags.map(f => `<span class="vnd-flag ${f.level}">${vEsc(f.text)}</span>`).join('')}</div>` : ''}
      <div class="vnd-card-foot">👤 <strong>${contacts.length}</strong> contact${contacts.length !== 1 ? 's' : ''}</div>
      ${hits.length ? `<div class="vnd-hit">↳ ${hits.slice(0, 3).map(vEsc).join(', ')}${hits.length > 3 ? ' +' + (hits.length - 3) + ' more' : ''}</div>` : ''}
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="emp-panel-header">
      <div class="emp-panel-title">Vendors <span class="vnd-count">(${vendorStore.length})</span></div>
      <input class="emp-search" placeholder="Search vendors & contacts…" value="${vEsc(_vendorSearch)}"
        oninput="_vendorSearch=this.value;renderVendorsPanel()" />
      ${vCanEdit() ? `<button class="emp-add-btn vnd-secondary-btn" onclick="openVendorTypesModal()" title="Add or edit service types">⚙ Service Types</button>` : ''}
      ${vCanEdit() ? `<button class="emp-add-btn" onclick="openNewVendorDrawer()">+ Add Vendor</button>` : ''}
    </div>
    <div class="vnd-filter-bar">
      <span class="vnd-filter-label">Status</span>${statusChips}
    </div>
    <div class="vnd-filter-bar">
      <span class="vnd-filter-label">Service</span>${typeChips}${flagChip}
    </div>
    <div class="client-grid">
      ${cards || `<div class="vnd-empty">${vendorStore.length ? 'No vendors match these filters.' : 'No vendors yet' + (vCanEdit() ? ' — add one above.' : '.')}</div>`}
    </div>`;

  if (wasFocused) {
    const s = body.querySelector('.emp-search');
    if (s) { s.focus(); s.setSelectionRange(selStart, selEnd); }
  }
}

// ---------- drawer ----------
function ensureVendorDrawer() {
  if (document.getElementById('vendorDrawer')) return;
  const bd = document.createElement('div');
  bd.className = 'client-drawer-backdrop';
  bd.id = 'vendorDrawerBackdrop';
  bd.onclick = closeVendorDrawer;
  const dr = document.createElement('div');
  dr.className = 'client-drawer vnd-drawer';
  dr.id = 'vendorDrawer';
  dr.innerHTML = `
    <div class="client-drawer-header">
      <div class="client-drawer-title" id="vendorDrawerTitle">Vendor</div>
      <button class="client-drawer-close" onclick="closeVendorDrawer()">&#x2715;</button>
    </div>
    <div class="client-drawer-tabs" id="vendorDrawerTabs"></div>
    <div class="client-drawer-body" id="vendorDrawerBody"></div>
    <div class="client-save-bar" id="vendorSaveBar">
      <button class="btn btn-ghost" id="vendorDeleteBtn" onclick="deleteVendorFromDrawer()" style="margin-right:auto;color:var(--red)">&#x1F5D1; Delete Vendor</button>
      <button class="btn btn-primary" id="vendorSaveBtn" onclick="saveVendorDrawer()">Save Changes</button>
      <button class="btn btn-ghost" onclick="closeVendorDrawer()">Cancel</button>
    </div>`;
  document.body.appendChild(bd);
  document.body.appendChild(dr);
}

function openNewVendorDrawer() {
  if (!vCanEdit()) return;
  ensureVendorDrawer();
  _vendorDrawerId = null;
  _vendorDrawerTab = 'vtab-info';
  _vendorDraft = null;
  document.getElementById('vendorDrawerTitle').textContent = 'New Vendor';
  _showVendorDrawer();
  setTimeout(() => document.getElementById('vdName')?.focus(), 100);
}

function openVendorDrawer(id) {
  const v = vendorStore.find(x => x.id === id);
  if (!v) return;
  ensureVendorDrawer();
  _vendorDrawerId = id;
  _vendorDrawerTab = 'vtab-info';
  _vendorDraft = null;
  document.getElementById('vendorDrawerTitle').textContent = v.name;
  _showVendorDrawer();
}

function _showVendorDrawer() {
  renderVendorDrawer();
  document.getElementById('vendorDrawer').classList.add('open');
  document.getElementById('vendorDrawerBackdrop').classList.add('open');
}

function closeVendorDrawer() {
  document.getElementById('vendorDrawer')?.classList.remove('open');
  document.getElementById('vendorDrawerBackdrop')?.classList.remove('open');
  _vendorDraft = null;
}

function switchVendorDrawerTab(tab) {
  if (_vendorDrawerTab === 'vtab-info') _captureVendorForm();
  _vendorDrawerTab = tab;
  renderVendorDrawer();
}

// The type ids currently ticked — from the draft if the form has been
// touched, else from the database.
function _vendorCurrentTypeIds() {
  if (_vendorDraft) return _vendorDraft.typeIds;
  return _vendorDrawerId ? vTypeIdsFor(_vendorDrawerId) : [];
}

function renderVendorDrawer() {
  const v = _vendorDrawerId ? vendorStore.find(x => x.id === _vendorDrawerId) : null;
  const editable = vCanEdit();
  const iso = vNeeds17025(_vendorCurrentTypeIds());

  // Tabs: Contacts and Evaluations need a saved vendor.
  const tabs = [['vtab-info', '&#x1F4CB; Details']];
  if (v) tabs.push(['vtab-contacts', '&#x1F465; Contacts']);
  if (v && iso) tabs.push(['vtab-evals', '&#x2714; 17025 Evaluations']);
  if (!tabs.some(t => t[0] === _vendorDrawerTab)) _vendorDrawerTab = 'vtab-info';
  document.getElementById('vendorDrawerTabs').innerHTML = tabs.map(([k, l]) =>
    `<div class="client-dtab ${_vendorDrawerTab === k ? 'active' : ''}" onclick="switchVendorDrawerTab('${k}')">${l}</div>`).join('');

  // Save bar only applies to the Details tab.
  const onInfo = _vendorDrawerTab === 'vtab-info';
  document.getElementById('vendorSaveBar').style.display = (editable && onInfo) ? 'flex' : 'none';
  document.getElementById('vendorDeleteBtn').style.display = (v && vCanDelete()) ? 'inline-flex' : 'none';

  const body = document.getElementById('vendorDrawerBody');
  if (_vendorDrawerTab === 'vtab-info')          body.innerHTML = _vendorInfoHtml(v, editable);
  else if (_vendorDrawerTab === 'vtab-contacts') body.innerHTML = _vendorContactsHtml(v, editable);
  else if (_vendorDrawerTab === 'vtab-evals')    _renderVendorEvalsTab(v, editable);
}

function _vendorInfoHtml(v, editable) {
  const d = _vendorDraft || {
    name: v?.name || '', phone: v?.phone || '', website: v?.website || '',
    account_number: v?.account_number || '', payment_terms: v?.payment_terms || '',
    address: v?.address || '', city: v?.city || '', state: v?.state || '', zip: v?.zip || '',
    notes: v?.notes || '', status: v?.status || 'approved',
    accreditation_body: v?.accreditation_body || '', accreditation_cert: v?.accreditation_cert || '',
    accreditation_scope_url: v?.accreditation_scope_url || '', accreditation_expires: v?.accreditation_expires || '',
    approval_basis: v?.approval_basis || '', reeval_due: v?.reeval_due || '',
    typeIds: v ? vTypeIdsFor(v.id) : [],
  };
  const dis = editable ? '' : 'disabled';
  const inp = (id, val, ph, type) =>
    `<input id="${id}" type="${type || 'text'}" value="${vEsc(val)}" placeholder="${vEsc(ph || '')}" ${dis} />`;
  const field = (label, id, val, ph, type, full) =>
    `<div class="client-field"><label>${label}</label>${inp(id, val, ph, type).replace('<input ', '<input ' + (full ? 'class="full" ' : ''))}</div>`;

  // Types: all active ones, plus any inactive type already linked.
  const types = vendorTypeStore
    .filter(t => t.active || d.typeIds.includes(t.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  const iso = vNeeds17025(d.typeIds);

  const statusMeta = [];
  if (v?.proposed_at) statusMeta.push('Proposed ' + vFmtDate(v.proposed_at) + (v.proposed_by ? ' by ' + vEsc(vEmpName(v.proposed_by)) : ''));
  if (v?.approved_at) statusMeta.push('Approved ' + vFmtDate(v.approved_at) + (v.approved_by ? ' by ' + vEsc(vEmpName(v.approved_by)) : ''));

  const flags = v ? vVendorFlags(v) : [];

  return `
    <div class="client-detail-section">
      <div class="client-detail-section-title">Company</div>
      <div class="client-field" style="margin-bottom:10px"><label>Vendor Name *</label>${inp('vdName', d.name, 'Company name').replace('<input ', '<input class="full" ')}</div>
      <div class="client-field-row">${field('Phone', 'vdPhone', d.phone, '+1 (555) 000-0000')}${field('Website', 'vdWebsite', d.website, 'www.example.com')}</div>
      <div class="client-field-row">${field('Our Account #', 'vdAccount', d.account_number, '')}${field('Payment Terms', 'vdTerms', d.payment_terms, 'Net 30')}</div>
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Status</div>
      <div class="client-field" style="max-width:220px">
        <label>Status</label>
        <select id="vdStatus" class="vnd-select" ${dis}>
          ${Object.entries(VENDOR_STATUS).map(([k, s]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      ${statusMeta.length ? `<div class="vnd-meta">${statusMeta.join(' · ')}</div>` : ''}
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Services Provided</div>
      <div class="vnd-type-checks">
        ${types.map(t => `<label class="vnd-check">
          <input type="checkbox" class="vdType" value="${t.id}" ${d.typeIds.includes(t.id) ? 'checked' : ''} ${dis}
            onchange="_captureVendorForm();renderVendorDrawer()" />
          ${vEsc(t.name)}${t.requires_17025_eval ? ' <span class="vnd-iso-tag">17025</span>' : ''}${!t.active ? ' <span class="vnd-sub">(retired)</span>' : ''}
        </label>`).join('') || '<div class="vnd-sub">No service types defined.</div>'}
      </div>
    </div>

    ${iso ? `
    <div class="client-detail-section vnd-iso-section">
      <div class="client-detail-section-title">ISO/IEC 17025 — External Provider</div>
      ${flags.length ? `<div class="vnd-flags" style="margin-bottom:12px">${flags.map(f => `<span class="vnd-flag ${f.level}">${vEsc(f.text)}</span>`).join('')}</div>` : ''}
      <div class="client-field-row">${field('Accreditation Body', 'vdAccBody', d.accreditation_body, 'A2LA, ANAB, PJLA…')}${field('Certificate #', 'vdAccCert', d.accreditation_cert, '')}</div>
      <div class="client-field" style="margin-bottom:10px"><label>Scope Link</label>${inp('vdAccScope', d.accreditation_scope_url, 'https://…').replace('<input ', '<input class="full" ')}
        ${d.accreditation_scope_url ? `<a class="vnd-link" href="${vEsc(d.accreditation_scope_url)}" target="_blank" rel="noopener">Open scope ↗</a>` : ''}</div>
      <div class="client-field-row">${field('Accreditation Expires', 'vdAccExp', d.accreditation_expires, '', 'date')}${field('Re-evaluation Due', 'vdReeval', d.reeval_due, '', 'date')}</div>
      <div class="client-field"><label>Basis for Approval</label>
        <textarea class="full" id="vdBasis" placeholder="e.g. A2LA accredited, measurement in scope, cert reviewed" ${dis}>${vEsc(d.approval_basis)}</textarea></div>
    </div>` : ''}

    <div class="client-detail-section">
      <div class="client-detail-section-title">Address</div>
      <div class="client-field" style="margin-bottom:10px"><label>Street Address</label>${inp('vdAddress', d.address, '123 Main St').replace('<input ', '<input class="full" ')}</div>
      <div class="client-field-row">${field('City', 'vdCity', d.city, 'City')}${field('State', 'vdState', d.state, 'NJ')}</div>
      <div class="client-field" style="max-width:140px"><label>ZIP</label>${inp('vdZip', d.zip, '00000')}</div>
    </div>

    <div class="client-detail-section">
      <div class="client-detail-section-title">Notes</div>
      <div class="client-field"><textarea class="full" id="vdNotes" placeholder="Internal notes about this vendor…" ${dis}>${vEsc(d.notes)}</textarea></div>
    </div>`;
}

// Read the Details form into _vendorDraft (no-op if the form isn't rendered).
function _captureVendorForm() {
  if (!document.getElementById('vdName')) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const prev = _vendorDraft || {};
  const keep = (id, key) => { const x = val(id); return x === undefined ? (prev[key] || '') : x; };
  _vendorDraft = {
    name: val('vdName'), phone: val('vdPhone'), website: val('vdWebsite'),
    account_number: val('vdAccount'), payment_terms: val('vdTerms'),
    address: val('vdAddress'), city: val('vdCity'), state: val('vdState'), zip: val('vdZip'),
    notes: val('vdNotes'), status: val('vdStatus'),
    // 17025 fields may be hidden (no flagged type ticked) — keep what we had.
    accreditation_body: keep('vdAccBody', 'accreditation_body'),
    accreditation_cert: keep('vdAccCert', 'accreditation_cert'),
    accreditation_scope_url: keep('vdAccScope', 'accreditation_scope_url'),
    accreditation_expires: keep('vdAccExp', 'accreditation_expires'),
    reeval_due: keep('vdReeval', 'reeval_due'),
    approval_basis: keep('vdBasis', 'approval_basis'),
    typeIds: [...document.querySelectorAll('.vdType:checked')].map(cb => cb.value),
  };
  // Seed 17025 fields from the record the first time they're captured hidden.
  if (!prev.name && _vendorDrawerId) {
    const v = vendorStore.find(x => x.id === _vendorDrawerId) || {};
    ['accreditation_body', 'accreditation_cert', 'accreditation_scope_url', 'accreditation_expires', 'reeval_due', 'approval_basis']
      .forEach(k => { if (!_vendorDraft[k] && v[k]) _vendorDraft[k] = v[k]; });
  }
}

async function saveVendorDrawer() {
  if (!vCanEdit()) return;
  _captureVendorForm();
  const d = _vendorDraft;
  const name = (d.name || '').trim();
  if (!name) { vToast('Vendor name is required'); document.getElementById('vdName')?.focus(); return; }

  const nz = s => { const t = (s || '').trim(); return t ? t : null; };
  const existing = _vendorDrawerId ? vendorStore.find(x => x.id === _vendorDrawerId) : null;
  const now = new Date().toISOString();
  const actor = vActorId();

  const fields = {
    name,
    phone: nz(d.phone), website: nz(d.website),
    account_number: nz(d.account_number), payment_terms: nz(d.payment_terms),
    address: nz(d.address), city: nz(d.city), state: nz(d.state), zip: nz(d.zip),
    notes: nz(d.notes),
    status: d.status || 'approved',
    accreditation_body: nz(d.accreditation_body), accreditation_cert: nz(d.accreditation_cert),
    accreditation_scope_url: nz(d.accreditation_scope_url),
    accreditation_expires: nz(d.accreditation_expires), reeval_due: nz(d.reeval_due),
    approval_basis: nz(d.approval_basis),
  };
  // Stamp approval / proposal when the status moves into that state.
  if (fields.status === 'approved' && (!existing || existing.status !== 'approved')) {
    fields.approved_by = actor; fields.approved_at = now;
  }
  if (fields.status === 'proposed' && (!existing || existing.status !== 'proposed')) {
    fields.proposed_by = actor; fields.proposed_at = now;
  }

  const btn = document.getElementById('vendorSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    let vendorId = _vendorDrawerId;
    if (vendorId) {
      const { error } = await sb.from('vendors').update(fields).eq('id', vendorId);
      if (error) return _vendorSaveError(error, name);
    } else {
      const { data, error } = await sb.from('vendors').insert(fields).select().single();
      if (error) return _vendorSaveError(error, name);
      vendorId = data.id;
    }

    // Sync services: delete unticked, insert newly ticked.
    const before = new Set(vTypeIdsFor(vendorId));
    const after  = new Set(d.typeIds);
    const toDel = [...before].filter(id => !after.has(id));
    const toAdd = [...after].filter(id => !before.has(id));
    if (toDel.length) {
      const { error } = await sb.from('vendor_services').delete().eq('vendor_id', vendorId).in('service_type_id', toDel);
      if (error) { vErr('Vendor saved, but services could not be updated', error); }
    }
    if (toAdd.length) {
      const { error } = await sb.from('vendor_services').insert(toAdd.map(t => ({ vendor_id: vendorId, service_type_id: t })));
      if (error) { vErr('Vendor saved, but services could not be updated', error); }
    }

    await loadVendorData();
    _vendorDrawerId = vendorId;
    _vendorDraft = null;
    document.getElementById('vendorDrawerTitle').textContent = name;
    renderVendorDrawer();
    renderVendorsPanel();
    vToast(existing ? '✓ Vendor saved' : '✓ Vendor added');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

function _vendorSaveError(error, name) {
  if (error && error.code === '23505') {
    const dup = vendorStore.find(v => v.name.trim().toLowerCase() === name.trim().toLowerCase());
    vToast('⚠ A vendor named "' + name + '" already exists' + (dup ? ' (' + (VENDOR_STATUS[dup.status]?.label || dup.status) + ')' : ''));
    return;
  }
  vErr('Could not save vendor', error);
}

async function deleteVendor(id) {
  if (!vCanDelete()) return;
  const v = vendorStore.find(x => x.id === id);
  if (!v) return;
  if (!confirm(`Delete "${v.name}" with its contacts and evaluation history? This cannot be undone.\n\nTo stop using a vendor but keep its history, set its status to Inactive instead.`)) return;
  const { error } = await sb.from('vendors').delete().eq('id', id);
  if (error) { vErr('Could not delete vendor', error); return; }
  if (_vendorDrawerId === id) closeVendorDrawer();
  await loadVendorData();
  renderVendorsPanel();
  vToast('Vendor deleted');
}
function deleteVendorFromDrawer() { if (_vendorDrawerId) deleteVendor(_vendorDrawerId); }

// ---------- contacts ----------
function _vendorContactsHtml(v, editable) {
  const list = vendorContactStore.filter(ct => ct.vendor_id === v.id);
  return `
    ${editable ? `<div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="openVendorContactModal(null)">+ Add Contact</button></div>` : ''}
    ${list.length === 0 ? '<div class="vnd-empty">No contacts yet</div>' : list.map(ct => {
      const nm = ((ct.first_name || '') + ' ' + (ct.last_name || '')).trim();
      const ini = ((ct.first_name || '')[0] || '') + ((ct.last_name || '')[0] || '');
      return `<div class="vnd-contact">
        <div class="vnd-contact-av">${vEsc(ini.toUpperCase() || '?')}</div>
        <div style="flex:1;min-width:0">
          <div class="vnd-contact-name">${vEsc(nm || '(no name)')}</div>
          ${ct.title ? `<div class="vnd-sub">${vEsc(ct.title)}</div>` : ''}
          ${ct.email ? `<div class="vnd-sub"><a class="vnd-link" href="mailto:${vEsc(ct.email)}">${vEsc(ct.email)}</a></div>` : ''}
          ${ct.phone ? `<div class="vnd-sub">${vEsc(ct.phone)}</div>` : ''}
          ${ct.notes ? `<div class="vnd-contact-notes">${vEsc(ct.notes)}</div>` : ''}
        </div>
        ${editable ? `<div style="display:flex;gap:4px;flex-shrink:0">
          <button class="client-action-btn" onclick="openVendorContactModal('${ct.id}')" title="Edit">&#x270E;</button>
          <button class="client-action-btn" onclick="deleteVendorContact('${ct.id}')" title="Delete">&#x2715;</button></div>` : ''}
      </div>`;
    }).join('')}`;
}

function ensureVendorModal() {
  if (document.getElementById('vendorModal')) return;
  const m = document.createElement('div');
  m.className = 'modal-backdrop vnd-modal-backdrop';
  m.id = 'vendorModal';
  m.onclick = e => { if (e.target === m) closeVendorModal(); };
  m.innerHTML = `<div class="modal" id="vendorModalBox" style="width:460px">
      <div class="modal-header"><div class="modal-title" id="vendorModalTitle"></div>
        <button class="modal-close" onclick="closeVendorModal()">&#x2715;</button></div>
      <div class="modal-body" id="vendorModalBody"></div>
      <div class="modal-footer" id="vendorModalFooter"></div>
    </div>`;
  document.body.appendChild(m);
}
function _openVendorModal(title, bodyHtml, footerHtml, width) {
  ensureVendorModal();
  document.getElementById('vendorModalTitle').textContent = title;
  document.getElementById('vendorModalBody').innerHTML = bodyHtml;
  document.getElementById('vendorModalFooter').innerHTML = footerHtml;
  document.getElementById('vendorModalBox').style.width = (width || 460) + 'px';
  document.getElementById('vendorModal').classList.add('open');
}
function closeVendorModal() { document.getElementById('vendorModal')?.classList.remove('open'); }

function openVendorContactModal(id) {
  if (!vCanEdit() || !_vendorDrawerId) return;
  const ct = id ? vendorContactStore.find(x => x.id === id) : null;
  _vendorContactEditId = id || null;
  const f = (label, fid, val, type, req) => `<div class="field"><label class="field-label">${label}${req ? ' <span style="color:var(--red)">*</span>' : ''}</label>
    <input class="f-input" id="${fid}" type="${type || 'text'}" value="${vEsc(val || '')}" autocomplete="off" /></div>`;
  _openVendorModal(id ? 'Edit Contact' : 'Add Contact', `
    <div class="field-row">${f('First Name', 'vcFirst', ct?.first_name, 'text', true)}${f('Last Name', 'vcLast', ct?.last_name)}</div>
    ${f('Title', 'vcTitle', ct?.title)}
    ${f('Email', 'vcEmail', ct?.email, 'email')}
    ${f('Phone', 'vcPhone', ct?.phone)}
    <div class="field"><label class="field-label">Notes</label>
      <textarea class="f-textarea" id="vcNotes" rows="3" style="padding:10px 13px;resize:vertical">${vEsc(ct?.notes || '')}</textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeVendorModal()">Cancel</button>
     <button class="btn btn-primary" style="margin-left:auto" onclick="saveVendorContact()">Save Contact</button>`);
  setTimeout(() => document.getElementById('vcFirst')?.focus(), 50);
}

async function saveVendorContact() {
  const g = id => (document.getElementById(id)?.value || '').trim() || null;
  const row = { first_name: g('vcFirst'), last_name: g('vcLast'), title: g('vcTitle'), email: g('vcEmail'), phone: g('vcPhone'), notes: g('vcNotes') };
  if (!row.first_name) { vToast('First name is required'); document.getElementById('vcFirst')?.focus(); return; }
  let error;
  if (_vendorContactEditId) ({ error } = await sb.from('vendor_contacts').update(row).eq('id', _vendorContactEditId));
  else ({ error } = await sb.from('vendor_contacts').insert({ ...row, vendor_id: _vendorDrawerId }));
  if (error) { vErr('Could not save contact', error); return; }
  closeVendorModal();
  await loadVendorData();
  renderVendorDrawer();
  renderVendorsPanel();
  vToast('✓ Contact saved');
}

async function deleteVendorContact(id) {
  if (!vCanEdit()) return;
  const ct = vendorContactStore.find(x => x.id === id);
  if (!ct || !confirm(`Delete contact ${((ct.first_name || '') + ' ' + (ct.last_name || '')).trim()}?`)) return;
  const { error } = await sb.from('vendor_contacts').delete().eq('id', id);
  if (error) { vErr('Could not delete contact', error); return; }
  await loadVendorData();
  renderVendorDrawer();
  renderVendorsPanel();
}

// ---------- 17025 evaluations ----------
async function _renderVendorEvalsTab(v, editable) {
  const body = document.getElementById('vendorDrawerBody');
  body.innerHTML = '<div class="vnd-empty">Loading evaluations…</div>';
  const reqId = v.id;
  const evals = await loadVendorEvaluations(v.id);
  if (_vendorDrawerId !== reqId || _vendorDrawerTab !== 'vtab-evals') return;

  const outcomeCls = { acceptable: 'approved', conditional: 'proposed', unacceptable: 'rejected' };
  body.innerHTML = `
    <div class="vnd-meta" style="margin-bottom:14px">
      Record of how this provider was evaluated, monitored and re-evaluated (ISO/IEC 17025 §6.6).
      ${v.reeval_due ? `Next re-evaluation due <strong>${vFmtDate(v.reeval_due)}</strong>.` : ''}
    </div>
    ${editable ? `<div class="vnd-eval-form">
      <div class="client-field-row">
        <div class="client-field"><label>Date</label><input type="date" id="veDate" value="${vTodayStr()}" /></div>
        <div class="client-field"><label>Type</label><select id="veType" class="vnd-select">
          ${Object.entries(VENDOR_EVAL_TYPES).map(([k, l]) => `<option value="${k}" ${k === (evals.length ? 'periodic' : 'initial') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="client-field" style="margin-bottom:10px"><label>Outcome</label><select id="veOutcome" class="vnd-select">
        <option value="">—</option>
        ${Object.entries(VENDOR_EVAL_OUTCOMES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="client-field" style="margin-bottom:10px"><label>Notes</label>
        <textarea class="full" id="veNotes" placeholder="What was reviewed, issues found, actions taken…"></textarea></div>
      <label class="vnd-check" style="margin-bottom:10px"><input type="checkbox" id="veBumpReeval" checked />
        Set next re-evaluation to one year from this date</label>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="saveVendorEvaluation()">+ Add Evaluation</button></div>
    </div>` : ''}
    ${evals.length === 0 ? '<div class="vnd-empty">No evaluations recorded yet.</div>' : evals.map(e => `
      <div class="vnd-eval">
        <div class="vnd-eval-head">
          <span class="vnd-eval-date">${vFmtDate(e.eval_date)}</span>
          <span class="vnd-type">${VENDOR_EVAL_TYPES[e.eval_type] || e.eval_type}</span>
          ${e.outcome ? `<span class="vnd-status ${outcomeCls[e.outcome] || ''}">${VENDOR_EVAL_OUTCOMES[e.outcome] || e.outcome}</span>` : ''}
          <span class="vnd-sub" style="margin-left:auto">${vEsc(vEmpName(e.evaluated_by))}</span>
          ${editable ? `<button class="client-action-btn" onclick="deleteVendorEvaluation('${e.id}')" title="Delete">&#x2715;</button>` : ''}
        </div>
        ${e.notes ? `<div class="vnd-eval-notes">${vEsc(e.notes)}</div>` : ''}
      </div>`).join('')}`;
}

async function saveVendorEvaluation() {
  if (!vCanEdit() || !_vendorDrawerId) return;
  const date = document.getElementById('veDate')?.value;
  if (!date) { vToast('Evaluation date is required'); return; }
  const row = {
    vendor_id: _vendorDrawerId,
    eval_date: date,
    eval_type: document.getElementById('veType')?.value || 'periodic',
    outcome: document.getElementById('veOutcome')?.value || null,
    notes: (document.getElementById('veNotes')?.value || '').trim() || null,
    evaluated_by: vActorId(),
  };
  const { error } = await sb.from('vendor_evaluations').insert(row);
  if (error) { vErr('Could not save evaluation', error); return; }

  if (document.getElementById('veBumpReeval')?.checked) {
    const d = new Date(date + 'T00:00:00'); d.setFullYear(d.getFullYear() + 1);
    const next = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const { error: e2 } = await sb.from('vendors').update({ reeval_due: next }).eq('id', _vendorDrawerId);
    if (e2) vErr('Evaluation saved, but re-evaluation date was not updated', e2);
  }
  await loadVendorData();
  renderVendorDrawer();
  renderVendorsPanel();
  vToast('✓ Evaluation added');
}

async function deleteVendorEvaluation(id) {
  if (!vCanEdit() || !confirm('Delete this evaluation record?')) return;
  const { error } = await sb.from('vendor_evaluations').delete().eq('id', id);
  if (error) { vErr('Could not delete evaluation', error); return; }
  renderVendorDrawer();
}

// ---------- service types ----------
function openVendorTypesModal() {
  if (!vCanEdit()) return;
  _renderVendorTypesModal();
}

function _renderVendorTypesModal() {
  const rows = [...vendorTypeStore].sort((a, b) => a.sort_order - b.sort_order);
  const used = id => vendorServiceStore.filter(s => s.service_type_id === id).length;
  _openVendorModal('Service Types', `
    <div class="vnd-meta">Types marked <strong>17025</strong> give their vendors the accreditation fields and evaluation log. Retire a type instead of deleting it — existing links are kept.</div>
    <div class="vnd-types-list">
      ${rows.map((t, i) => `<div class="vnd-type-row-edit ${t.active ? '' : 'retired'}">
        <div class="vnd-order">
          <button class="client-action-btn" ${i === 0 ? 'disabled' : ''} onclick="moveVendorType('${t.id}',-1)" title="Move up">&#x25B2;</button>
          <button class="client-action-btn" ${i === rows.length - 1 ? 'disabled' : ''} onclick="moveVendorType('${t.id}',1)" title="Move down">&#x25BC;</button>
        </div>
        <input class="f-input" value="${vEsc(t.name)}" onchange="updateVendorType('${t.id}',{name:this.value})" />
        <label class="vnd-check" title="Requires ISO 17025 evaluation"><input type="checkbox" ${t.requires_17025_eval ? 'checked' : ''}
          onchange="updateVendorType('${t.id}',{requires_17025_eval:this.checked})" /> 17025</label>
        <label class="vnd-check"><input type="checkbox" ${t.active ? 'checked' : ''}
          onchange="updateVendorType('${t.id}',{active:this.checked})" /> Active</label>
        <span class="vnd-sub" title="Vendors using this type">${used(t.id)}</span>
      </div>`).join('')}
    </div>
    <div class="vnd-type-add">
      <input class="f-input" id="vtNewName" placeholder="New service type, e.g. Testing Subcontract" onkeydown="if(event.key==='Enter')addVendorType()" />
      <label class="vnd-check"><input type="checkbox" id="vtNewIso" /> 17025</label>
      <button class="btn btn-primary" onclick="addVendorType()">Add</button>
    </div>`,
    `<button class="btn btn-ghost" style="margin-left:auto" onclick="closeVendorModal()">Done</button>`, 600);
}

function _vendorTypeCode(name) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'type';
  let code = base, n = 2;
  while (vendorTypeStore.some(t => t.code === code)) code = base + '_' + (n++);
  return code;
}

async function addVendorType() {
  const name = (document.getElementById('vtNewName')?.value || '').trim();
  if (!name) return;
  if (vendorTypeStore.some(t => t.name.trim().toLowerCase() === name.toLowerCase())) { vToast('That service type already exists'); return; }
  const maxSort = vendorTypeStore.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
  const { error } = await sb.from('vendor_service_types').insert({
    code: _vendorTypeCode(name), name,
    requires_17025_eval: !!document.getElementById('vtNewIso')?.checked,
    sort_order: maxSort + 10,
  });
  if (error) { vErr('Could not add service type', error); return; }
  await loadVendorData();
  _renderVendorTypesModal();
  renderVendorsPanel();
}

async function updateVendorType(id, patch) {
  if (patch.name !== undefined) {
    patch.name = patch.name.trim();
    if (!patch.name) { _renderVendorTypesModal(); return; }
  }
  const { error } = await sb.from('vendor_service_types').update(patch).eq('id', id);
  if (error) { vErr('Could not update service type', error); }
  await loadVendorData();
  _renderVendorTypesModal();
  renderVendorsPanel();
}

async function moveVendorType(id, dir) {
  const rows = [...vendorTypeStore].sort((a, b) => a.sort_order - b.sort_order);
  const i = rows.findIndex(t => t.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  // Renumber everything so ties can't stall a move.
  [rows[i], rows[j]] = [rows[j], rows[i]];
  const results = await Promise.all(rows.map((t, k) =>
    sb.from('vendor_service_types').update({ sort_order: (k + 1) * 10 }).eq('id', t.id)));
  const err = results.find(r => r.error);
  if (err) vErr('Could not reorder service types', err.error);
  await loadVendorData();
  _renderVendorTypesModal();
  renderVendorsPanel();
}

// Escape closes the vendor modal first, then the drawer.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('vendorModal')?.classList.contains('open')) { closeVendorModal(); return; }
  if (document.getElementById('vendorDrawer')?.classList.contains('open')) closeVendorDrawer();
});

window.openVendorsPanel      = openVendorsPanel;
window.renderVendorsPanel    = renderVendorsPanel;
window.getVendorsForService  = getVendorsForService;
window.loadVendorData        = loadVendorData;
