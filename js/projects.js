
// ===== PROJECT STORE =====
// ===== PROJECT STORE =====
let projects = []; // loaded from Supabase


// ===== PROJECTS TABLE =====
// ===== PROJECTS TABLE =====
function openProjectsTable(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Projects';
  showProjectView('panel-projects');
  // Force flex-column layout so sticky header works
  const panel = document.getElementById('panel-projects');
  if (panel) { panel.style.flexDirection = 'column'; panel.style.overflow = 'hidden'; }
  renderSavedFiltersBar();
  renderProjectsTable();
}

function openDashboardPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Dashboard';
  
  showProjectView('panel-dashboard');
  renderDashboard();
}


// ===== COLUMN VISIBILITY =====
// ===== COLUMN VISIBILITY =====
// Columns are split into LOCKED (always visible, fixed position) and OPTIONAL (toggleable, reorderable).
// Locked: Project (name), Status, Company (client) — these render first, in that order, always.
// Optional columns render in user-saved order (projColOrder in localStorage), or DEFAULT_COL_ORDER if not set.
//
// Each optional column def has:
//   key       — stable identifier used in localStorage, sort, filter
//   label     — display name in the chip + header
//   ptc       — short tag used by the resizer CSS var (--ptc-<ptc>)
//   default   — whether visible by default for users who have never toggled
//   width     — initial column width (before resizing)
//   colorRule — optional fn(value, info) => {bg, color} | null — applied to cell when visible
const PROJ_COL_DEFS = [
  // Previously "core" columns — now optional, default ON (existing users see no change)
  { key: 'po',            label: 'PO',                   ptc: 'po',       default: true,  width: '90px'  },
  { key: 'quote',         label: 'Quote',                ptc: 'quote',    default: true,  width: '90px'  },
  { key: 'desc',          label: 'Description',          ptc: 'desc',     default: true,  width: '180px' },
  { key: 'article',       label: 'Test Article Desc.',   ptc: 'article',  default: true,  width: '180px' },
  { key: 'expected',      label: 'Expected Rev.',        ptc: 'exp',      default: true,  width: '100px' },
  { key: 'billed',        label: 'Billed Rev.',          ptc: 'billed',   default: true,  width: '100px' },
  { key: 'hours',         label: 'Act. Hours',           ptc: 'hours',    default: true,  width: '90px'  },
  { key: 'remaining',     label: 'Remaining Rev.',       ptc: 'remain',   default: true,  width: '110px' },
  // Previously optional columns — unchanged defaults
  { key: 'pm',            label: 'PM',                   ptc: 'pm',       default: false, width: '110px' },
  { key: 'tentativeTest', label: 'Tent. Test Date',      ptc: 'tenttest', default: false, width: '120px' },
  { key: 'testcomplete',  label: 'Test Comp. Date',      ptc: 'testcomp', default: false, width: '120px' },
  { key: 'dcas',          label: 'DCAS',                 ptc: 'dcas',     default: true,  width: '80px',
    colorRule: ynCnfColor },
  { key: 'witness',       label: 'Cust. Witness',        ptc: 'witness',  default: false, width: '130px',
    colorRule: ynCnfColor },
  { key: 'tpApproval',    label: 'TP Approval',          ptc: 'tpappr',   default: false, width: '100px',
    colorRule: ynCnfColor },
  { key: 'dpas',          label: 'DPAS',                 ptc: 'dpas',     default: false, width: '70px'  },
  { key: 'cui',           label: 'CUI',                  ptc: 'cui',      default: false, width: '80px'  },
  { key: 'creditHold',    label: 'Credit Hold',          ptc: 'credit',   default: false, width: '90px'  },
  { key: 'needPo',        label: 'Need PO',              ptc: 'needpo',   default: false, width: '110px' },
  { key: 'contact',       label: 'Contact',              ptc: 'contact',  default: false, width: '130px' },
  // New column
  { key: 'inHouse',       label: 'Article In-House',     ptc: 'inhouse',  default: false, width: '110px',
    colorRule: inHouseColor },
];

// Color rule helpers — return {bg, color} or null
// Palette: green = yes/CNF (confirmed), red = no. Matches existing status/phase tinting style.
function ynCnfColor(v) {
  const s = (v || '').toString().trim().toLowerCase();
  if (!s || s === '—') return null;
  if (s === 'yes' || s === 'y' || s === 'cnf' || s === 'confirmed') {
    return { bg: 'rgba(46,158,98,0.15)', color: '#2e9e62' };
  }
  if (s === 'no' || s === 'n') {
    return { bg: 'rgba(208,64,64,0.12)', color: '#d04040' };
  }
  return null;
}
function inHouseColor(v) {
  if (v === true) return { bg: 'rgba(46,158,98,0.15)', color: '#2e9e62' };
  return null;
}

// Default order = order as declared in PROJ_COL_DEFS above
const DEFAULT_COL_ORDER = PROJ_COL_DEFS.map(c => c.key);

function getProjCols() { try { return JSON.parse(localStorage.getItem('projColVis') || '{}'); } catch { return {}; } }
function setProjCols(vis) { try { localStorage.setItem('projColVis', JSON.stringify(vis)); } catch {} }
function getProjColOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('projColOrder') || 'null');
    if (!Array.isArray(saved)) return [...DEFAULT_COL_ORDER];
    // Preserve saved order; append any new keys that didn't exist when user saved
    const merged = saved.filter(k => DEFAULT_COL_ORDER.includes(k));
    DEFAULT_COL_ORDER.forEach(k => { if (!merged.includes(k)) merged.push(k); });
    return merged;
  } catch { return [...DEFAULT_COL_ORDER]; }
}
function setProjColOrder(order) {
  try { localStorage.setItem('projColOrder', JSON.stringify(order)); } catch {}
}
// Returns PROJ_COL_DEFS sorted by the user's saved order
function getOrderedProjColDefs() {
  const order = getProjColOrder();
  const byKey = Object.fromEntries(PROJ_COL_DEFS.map(c => [c.key, c]));
  return order.map(k => byKey[k]).filter(Boolean);
}
function isProjColVisible(key) {
  const vis = getProjCols();
  const def = PROJ_COL_DEFS.find(c => c.key === key);
  return vis[key] !== undefined ? vis[key] : (def?.default || false);
}
function toggleProjCol(key) {
  const vis = getProjCols(); vis[key] = !isProjColVisible(key); setProjCols(vis);
  buildColToggleChips(); renderProjectsTable();
}
function buildColToggleChips() {
  const wrap = document.getElementById('colToggleChips');
  if (!wrap) return;
  const defs = getOrderedProjColDefs();
  wrap.innerHTML = defs.map(c => {
    const on = isProjColVisible(c.key);
    // Drag handle (⋮⋮) + chip. Whole chip is draggable; click toggles visibility (but not when dragging).
    return `<span class="proj-col-chip" draggable="true" data-col-key="${c.key}"
      ondragstart="projColDragStart(event)" ondragover="projColDragOver(event)"
      ondrop="projColDrop(event)" ondragend="projColDragEnd(event)" ondragleave="projColDragLeave(event)"
      onclick="projColChipClick(event,'${c.key}')"
      style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px 3px 6px;border-radius:12px;font-size:11px;font-weight:600;cursor:grab;user-select:none;background:${on?'var(--amber-glow)':'var(--surface2)'};color:${on?'var(--amber)':'var(--muted)'};border:1px solid ${on?'var(--amber-dim)':'var(--border)'};transition:all .15s">
      <span class="proj-col-chip-drag" style="cursor:grab;opacity:.5;font-size:10px;line-height:1;padding:0 1px" title="Drag to reorder">⋮⋮</span>
      <span>${on?'✓':'+'} ${c.label}</span>
    </span>`;
  }).join('');
}

// ===== COLUMN CHIP DRAG/DROP =====
let _projColDragKey = null;
let _projColDragMoved = false;
function projColDragStart(ev) {
  const chip = ev.currentTarget;
  _projColDragKey = chip.dataset.colKey;
  _projColDragMoved = false;
  chip.style.opacity = '0.4';
  try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', _projColDragKey); } catch {}
}
function projColDragOver(ev) {
  ev.preventDefault();
  if (!_projColDragKey) return;
  try { ev.dataTransfer.dropEffect = 'move'; } catch {}
  const chip = ev.currentTarget;
  if (chip.dataset.colKey === _projColDragKey) return;
  chip.style.boxShadow = 'inset 2px 0 0 var(--amber)';
  _projColDragMoved = true;
}
function projColDragLeave(ev) {
  ev.currentTarget.style.boxShadow = '';
}
function projColDrop(ev) {
  ev.preventDefault();
  const targetKey = ev.currentTarget.dataset.colKey;
  ev.currentTarget.style.boxShadow = '';
  if (!_projColDragKey || _projColDragKey === targetKey) return;
  const order = getProjColOrder();
  const fromIdx = order.indexOf(_projColDragKey);
  const toIdx   = order.indexOf(targetKey);
  if (fromIdx < 0 || toIdx < 0) return;
  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, _projColDragKey);
  setProjColOrder(order);
  _projColDragMoved = true;
  buildColToggleChips();
  renderProjectsTable();
}
function projColDragEnd(ev) {
  document.querySelectorAll('.proj-col-chip').forEach(c => { c.style.opacity=''; c.style.boxShadow=''; });
  // Delay clearing so chip click handler sees _projColDragMoved=true and suppresses toggle
  setTimeout(() => { _projColDragKey = null; _projColDragMoved = false; }, 50);
}
// Click-to-toggle handler that suppresses toggle right after a drag
function projColChipClick(ev, key) {
  if (_projColDragMoved) { ev.preventDefault(); ev.stopPropagation(); return; }
  toggleProjCol(key);
}

function renderProjectsTable() {
  const container = document.getElementById('projtblContainer');
  const subEl = document.getElementById('projtblSub');
  if (!container) return;

  // ── Stat bubbles ──
  const bubblesEl = document.getElementById('projStatBubbles');
  if (bubblesEl) {
    const openProjs = projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed');
    const statusGroups = {
      jobprep:     { label: 'Job Prep',     color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
      pending:     { label: 'Pending',       color: '#e8a234', bg: 'rgba(232,162,52,0.08)'  },
      pendretest:  { label: 'Pend. Retest', color: '#fb923c', bg: 'rgba(251,146,60,0.08)'  },
      active:      { label: 'Active',        color: '#4caf7d', bg: 'rgba(76,175,125,0.08)'  },
      onhold:      { label: 'On Hold',       color: '#7a7a85', bg: 'rgba(122,122,133,0.08)' },
      complete:    { label: 'Complete',      color: '#5b9cf6', bg: 'rgba(91,156,246,0.08)'  },
      testcomplete:{ label: 'Test Complete', color: '#4caf7d', bg: 'rgba(76,175,125,0.08)'  },
      closing:     { label: 'Closing',       color: '#e8a234', bg: 'rgba(232,162,52,0.08)'  },
    };
    const bubble = (label, count, color, bg) =>
      `<div style="background:${bg};border:1px solid ${color}44;border-radius:8px;padding:5px 12px;cursor:default;display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div style="font-size:18px;font-family:'DM Serif Display',serif;color:var(--text);line-height:1;font-weight:400">${count}</div>
        <div style="font-size:9px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;line-height:1.2">${label}</div>
      </div>`;
    let html = bubble('All Open', openProjs.length, '#5b9cf6', 'rgba(91,156,246,0.08)');
    Object.entries(statusGroups).forEach(([status, meta]) => {
      const count = openProjs.filter(p => (projectInfo[p.id]||{}).status === status).length;
      if (count > 0) html += bubble(meta.label, count, meta.color, meta.bg);
    });
    bubblesEl.innerHTML = html;
  }

  renderSavedFiltersBar();

  // ── Sort ──
  const sortFn = (a, b) => {
    const ia = projectInfo[a.id] || {}, ib = projectInfo[b.id] || {};
    let va, vb;
    const numCols = ['expected','billed','remaining','hours'];
    if (projSortCol === 'name')      { va = a.name||''; vb = b.name||''; }
    else if (projSortCol === 'status')   { va = ia.status||''; vb = ib.status||''; }
    else if (projSortCol === 'client')   { va = ia.client||''; vb = ib.client||''; }
    else if (projSortCol === 'dcas')     { va = ia.dcas||''; vb = ib.dcas||''; }
    else if (projSortCol === 'po')       { va = ia.po||''; vb = ib.po||''; }
    else if (projSortCol === 'pm')            { va = ia.pm||''; vb = ib.pm||''; }
    else if (projSortCol === 'tentativeTest') { va = ia.tentativeTestDate||''; vb = ib.tentativeTestDate||''; }
    else if (projSortCol === 'testcomplete')  { va = ia.testcompleteDate||''; vb = ib.testcompleteDate||''; }
    else if (projSortCol === 'witness')       { va = ia.customerWitness||''; vb = ib.customerWitness||''; }
    else if (projSortCol === 'tpApproval')    { va = ia.tpApproval||''; vb = ib.tpApproval||''; }
    else if (projSortCol === 'dpas')          { va = ia.dpas||''; vb = ib.dpas||''; }
    else if (projSortCol === 'cui')           { va = ia.cui||'';    vb = ib.cui||''; }
    else if (projSortCol === 'creditHold')    { va = String(ia.creditHold||false); vb = String(ib.creditHold||false); }
    else if (projSortCol === 'needPo')        { va = String(ia.needUpdatedPo||false); vb = String(ib.needUpdatedPo||false); }
    else if (projSortCol === 'contact')       { va = ia.clientContact||''; vb = ib.clientContact||''; }
    else if (projSortCol === 'quote')    { va = ia.quoteNumber||''; vb = ib.quoteNumber||''; }
    else if (projSortCol === 'expected') {
      const iaExp = (projectInfo[a.id]||{}).expectedRevenue||0, ibExp = (projectInfo[b.id]||{}).expectedRevenue||0;
      return (projSortDir==='asc'?1:-1) * (iaExp - ibExp);
    }
    else if (projSortCol === 'billed') {
      const iaBil = (projectInfo[a.id]||{}).billedRevenue||0, ibBil = (projectInfo[b.id]||{}).billedRevenue||0;
      return (projSortDir==='asc'?1:-1) * (iaBil - ibBil);
    }
    else if (projSortCol === 'remaining') {
      const getRem = (p) => { const i=projectInfo[p.id]||{}; return (i.expectedRevenue||0)-(i.billedRevenue||0); };
      return (projSortDir==='asc'?1:-1) * (getRem(a) - getRem(b));
    }
    else if (projSortCol === 'hours') {
      const getHrs = (p) => (projectInfo[p.id]||{}).actualHours || 0;
      return (projSortDir==='asc'?1:-1) * (getHrs(a) - getHrs(b));
    }
    else if (projSortCol === 'inHouse') {
      const hasInHouse = (p) => (typeof articleStore !== 'undefined' && Array.isArray(articleStore))
        ? articleStore.some(x => x.projId === p.id && x.receivedDate && !x.shippedDate)
        : false;
      // true sorts above false in asc; below in desc
      return (projSortDir==='asc'?1:-1) * ((hasInHouse(b) ? 1 : 0) - (hasInHouse(a) ? 1 : 0));
    }
    else { va = a.name||''; vb = b.name||''; }
    const cmp = va.localeCompare(vb, undefined, {numeric: true});
    return projSortDir === 'asc' ? cmp : -cmp;
  };
  let filtered = [...projects].sort(sortFn);
  // Always filter out closed unless showClosed is on
  if (!showClosed) {
    filtered = filtered.filter(p => (projectInfo[p.id] || {}).status !== 'closed');
  }
  // Name pattern filter — supports:
  //   ^N        → exclude names starting with N
  //   ^N,P      → exclude names starting with N or P
  //   smith     → include only names containing "smith"
  const namePattern = (document.getElementById('filterNamePattern')?.value.trim()) || navFilter.namePattern || '';
  if (namePattern) {
    if (namePattern.startsWith('^')) {
      const parts = namePattern.slice(1).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      filtered = filtered.filter(p => !parts.some(excl => p.name.toLowerCase().startsWith(excl)));
    } else {
      const incl = namePattern.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(incl));
    }
  }

  // Per-column filters
  if (Object.keys(projColFilters).length > 0) {
    filtered = filtered.filter(p => {
      const info = projectInfo[p.id] || {};
      return Object.entries(projColFilters).every(([field, val]) => {
        if (!val) return true;
        const v = val.toLowerCase();
        let cell = '';
        if (field === 'name')    cell = (p.name||'').toLowerCase();
        else if (field === 'status')  cell = (info.status||'').toLowerCase();
        else if (field === 'client')  cell = (info.client||'').toLowerCase();
        else if (field === 'po')      cell = (info.po||'').toLowerCase();
        else if (field === 'quote')   cell = (info.quoteNumber||'').toLowerCase();
        else if (field === 'desc')    cell = (p.desc||info.desc||'').toLowerCase();
        else if (field === 'article') cell = (info.testArticleDesc||'').toLowerCase();
        else if (field === 'pm')      cell = (info.pm||'').toLowerCase();
        else if (field === 'tentativeTest') cell = (info.tentativeTestDate||'').toLowerCase();
        else if (field === 'testcomplete')  cell = (info.testcompleteDate||'').toLowerCase();
        else if (field === 'witness')       cell = (info.customerWitness||'').toLowerCase();
        else if (field === 'contact')       cell = (info.clientContact||'').toLowerCase();
        else if (field === 'dcas')          cell = (info.dcas||'').toLowerCase();
        return cell.includes(v);
      });
    });
  }

  if (navFilter.status.size > 0 || navFilter.phase.size > 0) {
    filtered = filtered.filter(p => {
      const info = projectInfo[p.id] || {};
      // Never filter out closed projects via status filter when showClosed is on
      if (showClosed && (info.status || 'active') === 'closed') return true;
      const statusMatch = navFilter.status.size === 0 || navFilter.status.has(info.status || 'active');
      const phaseMatch  = navFilter.phase.size  === 0 || navFilter.phase.has(info.phase  || '');
      return statusMatch && phaseMatch;
    });
  }

  const closedCount = projects.filter(p => (projectInfo[p.id] || {}).status === 'closed').length;
  if (subEl) subEl.textContent = filtered.length + ' of ' + projects.length + ' projects' + 
    (!showClosed && closedCount > 0 ? ` (${closedCount} closed hidden)` : '') +
    (navFilter.status.size > 0 || navFilter.phase.size > 0 || namePattern ? ' (filtered)' : '');

  const STATUS_META = {
    jobprep:     { bg:'#a78bfa22', color:'#a78bfa', dot:'#a78bfa', label:'Job Preparation' },
    pending:     { bg:'#e8a23422', color:'#e8a234', dot:'#e8a234', label:'Pending' },
    pendretest:  { bg:'#fb923c22', color:'#fb923c', dot:'#fb923c', label:'Pending - ReTest' },
    active:      { bg:'#4caf7d22', color:'#4caf7d', dot:'#4caf7d', label:'Active' },
    onhold:      { bg:'#7a7a8522', color:'#7a7a85', dot:'#7a7a85', label:'On Hold' },
    complete:    { bg:'#5b9cf622', color:'#5b9cf6', dot:'#5b9cf6', label:'Complete' },
    testcomplete:{ bg:'#4caf7d22', color:'#4caf7d', dot:'#4caf7d', label:'Testing Complete' },
    closing:     { bg:'#e8a23422', color:'#e8a234', dot:'#e8a234', label:'Closing (Pending)' },
    closed:      { bg:'#55556622', color:'#555566', dot:'#555566', label:'Closed' },
  };

  if (filtered.length === 0) {
    container.innerHTML = `<div class="projtbl-empty">No projects match the current filter.<br><span style="font-size:12px">Adjust or clear your filter to see more projects.</span></div>`;
    return;
  }

  // Helpers available to both row building and header building
  const fmtMoney = n => n > 0 ? '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
  const truncate = (s, n=40) => s && s.length > n ? s.slice(0,n)+'…' : (s||'—');
  const fmtDate  = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—';

  // The visible optional columns, in user-saved order
  const visibleOptCols = getOrderedProjColDefs().filter(c => isProjColVisible(c.key));

  // Build a single optional cell for a given project + column
  // Returns HTML string for a <td> (with any color-rule styling applied)
  function buildOptCell(c, p, info) {
    let val = '—';
    let rawValue = null;      // value passed to colorRule
    let baseStyle = '';       // inline style before color rule (font, alignment, truncation)

    if (c.key === 'po') {
      val = info.po || '—';
      baseStyle = `font-family:'JetBrains Mono',monospace;font-size:11px`;
      rawValue = info.po;
    } else if (c.key === 'quote') {
      val = info.quoteNumber || '—';
      baseStyle = `font-family:'JetBrains Mono',monospace;font-size:11px`;
      rawValue = info.quoteNumber;
    } else if (c.key === 'desc') {
      const raw = p.desc || info.desc || '';
      val = truncate(raw);
      baseStyle = `font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
      return `<td style="${baseStyle}" title="${raw.replace(/"/g,'&quot;')}">${val}</td>`;
    } else if (c.key === 'article') {
      const raw = info.testArticleDesc || '';
      val = truncate(raw);
      baseStyle = `font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
      return `<td style="${baseStyle}" title="${raw.replace(/"/g,'&quot;')}">${val}</td>`;
    } else if (c.key === 'expected') {
      const expected  = info.expectedRevenue || 0;
      return `<td class="projtbl-amount" style="color:var(--green)">${fmtMoney(expected)}</td>`;
    } else if (c.key === 'billed') {
      const billed = info.billedRevenue || 0;
      return `<td class="projtbl-amount" style="color:var(--blue)">${fmtMoney(billed)}</td>`;
    } else if (c.key === 'hours') {
      const actualHours = info.actualHours || 0;
      return `<td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--blue)">${actualHours>0?actualHours.toFixed(1)+'h':'—'}</td>`;
    } else if (c.key === 'remaining') {
      const expected  = info.expectedRevenue || 0;
      const billed    = info.billedRevenue   || 0;
      const remaining = expected - billed;
      return `<td class="projtbl-amount" style="color:${remaining<0?'var(--red)':'var(--amber)'}">${expected>0?fmtMoney(remaining):'—'}</td>`;
    } else if (c.key === 'pm') {
      val = info.pm || '—';
      rawValue = info.pm;
    } else if (c.key === 'tentativeTest') {
      val = `<span style="font-size:11px;font-family:'JetBrains Mono',monospace">${fmtDate(info.tentativeTestDate)}</span>`;
    } else if (c.key === 'testcomplete') {
      val = `<span style="font-size:11px;font-family:'JetBrains Mono',monospace">${fmtDate(info.testcompleteDate)}</span>`;
    } else if (c.key === 'dcas') {
      val = `<span style="font-size:11px">${info.dcas||'—'}</span>`;
      rawValue = info.dcas;
    } else if (c.key === 'witness') {
      val = `<span style="font-size:11px">${truncate(info.customerWitness,30)}</span>`;
      rawValue = info.customerWitness;
    } else if (c.key === 'tpApproval') {
      val = `<span style="font-size:11px">${info.tpApproval||'—'}</span>`;
      rawValue = info.tpApproval;
    } else if (c.key === 'dpas') {
      val = `<span style="font-size:11px;color:var(--muted)">${info.dpas||'—'}</span>`;
    } else if (c.key === 'cui') {
      val = `<span style="font-size:11px;color:var(--muted)">${info.cui||'—'}</span>`;
    } else if (c.key === 'creditHold') {
      val = info.creditHold
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(208,64,64,0.15);color:var(--red)">YES</span>`
        : `<span style="color:var(--muted);font-size:11px">—</span>`;
    } else if (c.key === 'needPo') {
      val = info.needUpdatedPo
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber)">YES</span>`
        : `<span style="color:var(--muted);font-size:11px">—</span>`;
    } else if (c.key === 'contact') {
      val = `<span style="font-size:11px;color:var(--muted)">${truncate(info.clientContact,25)}</span>`;
    } else if (c.key === 'inHouse') {
      // Derived: any article for this project that was received and not yet shipped
      const hasInHouse = (typeof articleStore !== 'undefined' && Array.isArray(articleStore))
        ? articleStore.some(a => a.projId === p.id && a.receivedDate && !a.shippedDate)
        : false;
      rawValue = hasInHouse;
      val = hasInHouse
        ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">YES</span>`
        : `<span style="color:var(--muted);font-size:11px">—</span>`;
    }

    // Apply color rule if defined (cell-level background tint)
    let cellStyle = baseStyle;
    if (typeof c.colorRule === 'function') {
      const rule = c.colorRule(rawValue, info);
      if (rule && rule.bg) {
        cellStyle = (cellStyle ? cellStyle + ';' : '') + `background:${rule.bg}`;
        if (rule.color) cellStyle += `;color:${rule.color}`;
      }
    }
    return `<td${cellStyle?` style="${cellStyle}"`:''}>${val}</td>`;
  }

  const rows = filtered.map(p => {
    const info  = projectInfo[p.id] || {};
    const st    = STATUS_META[info.status] || STATUS_META['active'];

    const optCells = visibleOptCols.map(c => buildOptCell(c, p, info)).join('');

    return `<tr data-proj-id="${p.id}" onclick="navToProject('${p.id}')">
      <td>
        <span class="projtbl-proj-name">
          <span class="projtbl-proj-emoji">${p.emoji}</span>${p.name}
        </span>
      </td>
      <td>
        <span class="projtbl-status" style="background:${st.bg};color:${st.color}">
          <span style="width:5px;height:5px;border-radius:50%;background:${st.dot};display:inline-block"></span>
          ${st.label}
        </span>
      </td>
      <td style="font-size:12px">${info.client||'—'}</td>
      ${optCells}
    </tr>`;
  }).join('');

  // Build sort key for a column header (for showing the sort arrow)
  const colSortKey = (c) => {
    // Most col keys are also the sort col key; 'desc' and 'article' aren't sortable today
    if (c.key === 'desc' || c.key === 'article') return null;
    return c.key;
  };

  container.innerHTML = `
    <table class="projtbl-table" id="projtblTable" style="min-width:1200px;table-layout:fixed">
      <colgroup>
        <col style="width:var(--ptc-name,220px)">
        <col style="width:var(--ptc-status,130px)">
        <col style="width:var(--ptc-client,160px)">
        ${visibleOptCols.map(c => `<col style="width:var(--ptc-${c.ptc},${c.width})">`).join('')}
      </colgroup>
      <thead>
        <tr>
          <th class="sortable" style="position:relative" onclick="setProjSort('name')">Project <span class="sort-icon ${projSortCol==='name'?'active':''}">${projSortCol==='name'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="name"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('status')">Status <span class="sort-icon ${projSortCol==='status'?'active':''}">${projSortCol==='status'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="status"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('client')">Company <span class="sort-icon ${projSortCol==='client'?'active':''}">${projSortCol==='client'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="client"></span></th>
          ${visibleOptCols.map(c => {
            const sk = colSortKey(c);
            if (!sk) {
              return `<th style="position:relative">${c.label}<span class="itt-resizer" data-ptc="${c.ptc}"></span></th>`;
            }
            return `<th class="sortable" style="position:relative" onclick="setProjSort('${sk}')">${c.label} <span class="sort-icon ${projSortCol===sk?'active':''}">${projSortCol===sk?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="${c.ptc}"></span></th>`;
          }).join('')}
        </tr>
        <tr id="projColFilterRow" class="proj-col-filter-row">
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="name" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="status" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="client" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          ${visibleOptCols.map(c => {
            // Columns that don't make sense to filter get an empty cell
            const unfilterable = new Set(['expected','billed','hours','remaining','inHouse','creditHold','needPo','dpas','cui','testcomplete','tentativeTest']);
            if (unfilterable.has(c.key)) return '<th></th>';
            return '<th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="'+c.key+'" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>';
          }).join('')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  setTimeout(() => {
    ptblInitResizers();
    // Restore col filter values and styles after re-render
    Object.entries(projColFilters).forEach(([field, val]) => {
      const inp = document.querySelector('.proj-col-filter-input[data-field="' + field + '"]' );
      if (inp) {
        inp.value = val;
        inp.style.borderColor = 'var(--amber-dim)';
        inp.style.background = 'rgba(192,122,26,0.08)';
      }
    });
  }, 0);
}
function navToProject(projId) {
  const p = projects.find(x => x.id === projId);
  if (!p) return;
  activeProjectId = projId;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navProjects')?.classList.add('active');
  document.getElementById('topbarName').textContent = p.emoji + ' ' + p.name;

  // Reset to info tab
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.view-tab')?.classList.add('active');
  showProjectView('panel-info');

  const info = projectInfo[projId];
  const isClosed = !info || info.status === 'closed';
  if (isClosed && !_loadedClosedProjects.has(projId)) {
    const infoWrap = document.getElementById('infoWrap');
    if (infoWrap) infoWrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px;">&#x23F3; Loading project data…</div>';
    loadClosedProject(projId).then(() => {
      renderInfoSheet(projId);
      renderProjStickyHeader(projId);
      switchProjTab('sub-info');
    });
  } else {
    renderInfoSheet(projId);
    renderProjStickyHeader(projId);
    switchProjTab('sub-info');
  }
}


// ===== PROJECT NAV FILTER =====
// ===== PROJECT NAV FILTER =====
const NAV_FILTER_STATUS = ['jobprep','pending','pendretest','active','onhold','complete','testcomplete','closed'];
const NAV_FILTER_STATUS_LABELS = {jobprep:'Job Preparation',pending:'Pending',pendretest:'Pending - ReTest',active:'Active',onhold:'On Hold',complete:'Complete',testcomplete:'Testing Complete',closed:'Closed'};
const NAV_FILTER_PHASE  = ['Waiting on TP Approval','Within 3 Months','3 to 6 Months','No Time Frame'];

let showClosed = false;
let navFilter = { status: new Set(), phase: new Set(), namePattern: '' };
let projSortCol = 'name';
let projColFilters = {}; // { fieldKey: 'filterText' }
let projSortDir = 'asc';
let activeFilterName = null; // name of currently active saved filter

// Load saved filters from localStorage
function getSavedFilters() {
  try { return JSON.parse(localStorage.getItem('nuworkspace_saved_filters') || '[]'); } catch(e) { return []; }
}
function setSavedFilters(filters) {
  localStorage.setItem('nuworkspace_saved_filters', JSON.stringify(filters));
}

// Load last active filter on startup
(function loadSavedFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem('nuworkspace_nav_filter') || '{}');
    if (saved.status) navFilter.status = new Set(saved.status);
    if (saved.phase)  navFilter.phase  = new Set(saved.phase);
    if (saved.namePattern) navFilter.namePattern = saved.namePattern;
    if (saved.activeFilterName) activeFilterName = saved.activeFilterName;
    if (saved.sortCol) projSortCol = saved.sortCol;
    if (saved.sortDir) projSortDir = saved.sortDir;
  } catch(e) {}
  // Sync UI once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('filterNamePattern');
    if (inp && navFilter.namePattern) inp.value = navFilter.namePattern;
    updateNavFilterDot();
    renderSavedFiltersBar();
    updateProjViewsLabel();
  });
})();

function persistFilterState() {
  localStorage.setItem('nuworkspace_nav_filter', JSON.stringify({
    status: [...navFilter.status], phase: [...navFilter.phase],
    namePattern: navFilter.namePattern, activeFilterName,
    sortCol: projSortCol, sortDir: projSortDir,
  }));
}

function setProjColFilter(input) {
  const field = input.dataset.field;
  const val = input.value; // don't trim while typing
  if (val.trim()) projColFilters[field] = val.trim();
  else delete projColFilters[field];
  // Highlight active filter inputs
  input.style.borderColor = val.trim() ? 'var(--amber-dim)' : '';
  input.style.background  = val.trim() ? 'rgba(192,122,26,0.08)' : '';
  // Apply filter to existing rows without full re-render
  _applyProjColFiltersToDOM();
  renderSavedFiltersBar();
}

function _applyProjColFiltersToDOM() {
  const tbody = document.querySelector('#projtblContainer table tbody');
  if (!tbody) { renderProjectsTable(); return; }
  const rows = tbody.querySelectorAll('tr[data-proj-id]');
  let visibleCount = 0;
  rows.forEach(row => {
    const projId = row.dataset.projId;
    const p = projects.find(x => x.id === projId);
    const info = projectInfo[projId] || {};
    const match = Object.entries(projColFilters).every(([field, val]) => {
      const v = val.toLowerCase();
      let cell = '';
      if (field === 'name')    cell = (p?.name||'').toLowerCase();
      else if (field === 'status')  cell = (info.status||'').toLowerCase();
      else if (field === 'client')  cell = (info.client||'').toLowerCase();
      else if (field === 'po')      cell = (info.po||'').toLowerCase();
      else if (field === 'quote')   cell = (info.quoteNumber||'').toLowerCase();
      else if (field === 'desc')    cell = ((p?.desc||'')||(info.desc||'')).toLowerCase();
      else if (field === 'article') cell = (info.testArticleDesc||'').toLowerCase();
      else if (field === 'pm')      cell = (info.pm||'').toLowerCase();
      else if (field === 'tentativeTest') cell = (info.tentativeTestDate||'').toLowerCase();
      else if (field === 'testcomplete')  cell = (info.testcompleteDate||'').toLowerCase();
      else if (field === 'witness')       cell = (info.customerWitness||'').toLowerCase();
      else if (field === 'contact')       cell = (info.clientContact||'').toLowerCase();
      else if (field === 'dcas')          cell = (info.dcas||'').toLowerCase();
      return cell.includes(v);
    });
    row.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });
  // Update subtitle count
  const subEl = document.getElementById('projtblSub');
  if (subEl && Object.keys(projColFilters).length > 0) {
    const total = rows.length;
    subEl.textContent = visibleCount + ' of ' + total + ' projects (column filtered)';
  }
}

function clearProjColFilters() {
  projColFilters = {};
  document.querySelectorAll('.proj-col-filter-input').forEach(i => {
    i.value = '';
    i.style.borderColor = '';
    i.style.background = '';
  });
  renderProjectsTable();
}

function setProjSort(col) {
  if (projSortCol === col) projSortDir = projSortDir === 'asc' ? 'desc' : 'asc';
  else { projSortCol = col; projSortDir = 'asc'; }
  persistFilterState();
  renderProjectsTable();
}

function toggleNavFilter() {
  const panel = document.getElementById('navFilterPanel');
  const btn   = document.getElementById('navFilterBtn');
  const open  = panel.classList.toggle('open');
  btn.classList.toggle('active', open);
  if (open) {
    buildNavFilterChips();
    const inp = document.getElementById('filterNamePattern');
    if (inp) inp.value = navFilter.namePattern || '';
  }
}

function buildNavFilterChips() {
  const sc = document.getElementById('filterStatusChips');
  const pc = document.getElementById('filterPhaseChips');
  if (sc) sc.innerHTML = NAV_FILTER_STATUS.map(s => `
    <button class="nav-filter-chip ${navFilter.status.has(s)?'sel':''}"
      onclick="toggleNavFilterChip('status','${s}',this)">${NAV_FILTER_STATUS_LABELS[s]||s}</button>`).join('');
  if (pc) pc.innerHTML = NAV_FILTER_PHASE.map(p => `
    <button class="nav-filter-chip ${navFilter.phase.has(p)?'sel':''}"
      onclick="toggleNavFilterChip('phase','${p}',this)">${p}</button>`).join('');
}

function toggleNavFilterChip(group, value, el) {
  if (navFilter[group].has(value)) { navFilter[group].delete(value); el.classList.remove('sel'); }
  else { navFilter[group].add(value); el.classList.add('sel'); }
  activeFilterName = null; // modified — no longer matches a saved filter
  renderProjectNav();
  updateNavFilterDot();
  if (document.getElementById('panel-projects')?.classList.contains('active')) renderProjectsTable();
  document.getElementById('allBadge').textContent = projects.length;
  updateProjViewsLabel();
}

function clearNavFilter() {
  navFilter.status.clear();
  navFilter.phase.clear();
  navFilter.namePattern = '';
  activeFilterName = null;
  const inp = document.getElementById('filterNamePattern');
  if (inp) inp.value = '';
  buildNavFilterChips();
  renderSavedFiltersBar();
  updateNavFilterDot();
  persistFilterState();
  renderProjectsTable();
  updateProjViewsLabel();
  toast('Filter cleared');
}

function saveNamedFilter() {
  const nameInp = document.getElementById('filterSaveName');
  const name = nameInp ? nameInp.value.trim() : '';
  if (!name) { toast('Enter a name for this filter'); nameInp?.focus(); return; }
  const namePattern = document.getElementById('filterNamePattern')?.value.trim() || '';
  navFilter.namePattern = namePattern;
  const filters = getSavedFilters().filter(f => f.name !== name); // overwrite if exists
  filters.push({ name, status: [...navFilter.status], phase: [...navFilter.phase], namePattern, colVis: getProjCols(), colOrder: getProjColOrder() });
  setSavedFilters(filters);
  activeFilterName = name;
  if (nameInp) nameInp.value = '';
  renderSavedFiltersBar();
  persistFilterState();
  document.getElementById('navFilterPanel').classList.remove('open');
  document.getElementById('navFilterBtn').classList.remove('active');
  updateNavFilterDot();
  renderProjectsTable();
  updateProjViewsLabel();
  toast('✓ Filter "' + name + '" saved');
}

function applyNamedFilter(name) {
  const filters = getSavedFilters();
  const f = filters.find(x => x.name === name);
  if (!f) return;
  navFilter.status = new Set(f.status || []);
  navFilter.phase  = new Set(f.phase  || []);
  navFilter.namePattern = f.namePattern || '';
  if (f.colVis) setProjCols(f.colVis);
  if (f.colOrder) setProjColOrder(f.colOrder);
  activeFilterName = name;
  buildNavFilterChips();
  buildColToggleChips();
  const inp = document.getElementById('filterNamePattern');
  if (inp) inp.value = navFilter.namePattern;
  persistFilterState();
  updateNavFilterDot();
  renderSavedFiltersBar();
  updateProjViewsLabel();
  renderProjectsTable();
  // Close filter panel if open
  document.getElementById('navFilterPanel').classList.remove('open');
  document.getElementById('navFilterBtn').classList.remove('active');
}

function deleteNamedFilter(name) {
  const filters = getSavedFilters().filter(f => f.name !== name);
  setSavedFilters(filters);
  if (activeFilterName === name) { activeFilterName = null; persistFilterState(); }
  renderSavedFiltersBar();
  updateProjViewsLabel();
  renderProjViewsDropdown();
}

// ===== RESET TO DEFAULT =====
// Clears column visibility overrides, column order, per-column filters, nav filter,
// sort, and active-filter marker. Restores factory defaults from PROJ_COL_DEFS.
function resetProjectsToDefault() {
  if (!confirm('Reset columns, order, filters, and sort back to defaults? Your saved filters will not be deleted.')) return;
  try {
    localStorage.removeItem('projColVis');
    localStorage.removeItem('projColOrder');
  } catch {}
  projColFilters = {};
  navFilter.status.clear();
  navFilter.phase.clear();
  navFilter.namePattern = '';
  projSortCol = 'name';
  projSortDir = 'asc';
  activeFilterName = null;
  persistFilterState();
  // Clear UI inputs
  const nameInp = document.getElementById('filterNamePattern');
  if (nameInp) nameInp.value = '';
  document.querySelectorAll('.proj-col-filter-input').forEach(i => {
    i.value = ''; i.style.borderColor = ''; i.style.background = '';
  });
  buildNavFilterChips();
  buildColToggleChips();
  updateNavFilterDot();
  renderSavedFiltersBar();
  updateProjViewsLabel();
  renderProjectsTable();
  toast('↺ Reset to default');
}

// ===== VIEWS DROPDOWN =====
function toggleProjViewsDropdown(ev) {
  if (ev) { ev.stopPropagation(); }
  const dd = document.getElementById('projViewsDropdown');
  if (!dd) return;
  const open = dd.style.display === 'block';
  if (open) { dd.style.display = 'none'; return; }
  renderProjViewsDropdown();
  dd.style.display = 'block';
  // Close on outside click (one-shot)
  setTimeout(() => {
    const handler = (e) => {
      if (!dd.contains(e.target) && e.target.id !== 'projViewsBtn') {
        dd.style.display = 'none';
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 0);
}

function renderProjViewsDropdown() {
  const dd = document.getElementById('projViewsDropdown');
  if (!dd) return;
  const filters = getSavedFilters();
  const activeName = activeFilterName;
  const rowStyle = 'padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12.5px;transition:background .1s;';
  const defaultRow = `<div style="${rowStyle}background:${!activeName?'var(--amber-glow)':'transparent'};color:${!activeName?'var(--amber)':'var(--text)'}"
    onmouseover="if(this.style.background==='transparent')this.style.background='var(--surface2)'"
    onmouseout="this.style.background='${!activeName?'var(--amber-glow)':'transparent'}'"
    onclick="selectProjView('')"
    title="The default view — all defaults, no saved filter active">
    <span style="font-size:11px;width:14px;text-align:center">${!activeName?'✓':''}</span>
    <span style="font-weight:500">Default</span>
  </div>`;
  const filterRows = filters.map(f => {
    const isActive = activeName === f.name;
    const safeName = f.name.replace(/'/g, "\\'");
    return `<div style="${rowStyle}background:${isActive?'var(--amber-glow)':'transparent'};color:${isActive?'var(--amber)':'var(--text)'}"
      onmouseover="if(this.style.background==='transparent')this.style.background='var(--surface2)'"
      onmouseout="this.style.background='${isActive?'var(--amber-glow)':'transparent'}'"
      onclick="selectProjView('${safeName}')">
      <span style="font-size:11px;width:14px;text-align:center">${isActive?'✓':''}</span>
      <span style="flex:1;font-weight:500">${f.name}</span>
      <span onclick="event.stopPropagation();deleteProjView('${safeName}')" title="Delete this view" style="color:var(--muted);font-size:11px;padding:2px 5px;border-radius:3px;transition:all .1s" onmouseover="this.style.background='rgba(208,64,64,0.15)';this.style.color='var(--red)'" onmouseout="this.style.background='transparent';this.style.color='var(--muted)'">&#x2715;</span>
    </div>`;
  }).join('');
  const separator = filters.length ? `<div style="height:1px;background:var(--border);margin:2px 0"></div>` : '';
  const manageHint = filters.length
    ? ''
    : `<div style="padding:10px 12px;font-size:11px;color:var(--muted);font-style:italic;">No saved views yet. Set up columns/filters and click "✓ Save Filter" in the filter drawer.</div>`;
  dd.innerHTML = defaultRow + separator + filterRows + manageHint;
}

function selectProjView(name) {
  const dd = document.getElementById('projViewsDropdown');
  if (dd) dd.style.display = 'none';
  if (!name) {
    // "Default" chosen — same as reset, but skip the confirm prompt
    try {
      localStorage.removeItem('projColVis');
      localStorage.removeItem('projColOrder');
    } catch {}
    projColFilters = {};
    navFilter.status.clear();
    navFilter.phase.clear();
    navFilter.namePattern = '';
    projSortCol = 'name';
    projSortDir = 'asc';
    activeFilterName = null;
    persistFilterState();
    const nameInp = document.getElementById('filterNamePattern');
    if (nameInp) nameInp.value = '';
    document.querySelectorAll('.proj-col-filter-input').forEach(i => {
      i.value = ''; i.style.borderColor = ''; i.style.background = '';
    });
    buildNavFilterChips();
    buildColToggleChips();
    updateNavFilterDot();
    renderSavedFiltersBar();
    updateProjViewsLabel();
    renderProjectsTable();
    toast('✓ Default view');
    return;
  }
  applyNamedFilter(name);
  updateProjViewsLabel();
}

function deleteProjView(name) {
  if (!confirm('Delete saved view "' + name + '"? Your current columns and filters will stay as they are.')) return;
  deleteNamedFilter(name); // already handles activeFilterName reset + refresh
  renderProjViewsDropdown();
  updateProjViewsLabel();
  toast('View "' + name + '" deleted');
}

function updateProjViewsLabel() {
  const lbl = document.getElementById('projViewsLabel');
  if (!lbl) return;
  lbl.textContent = activeFilterName || 'Default';
}

function renderSavedFiltersBar() {
  const bar = document.getElementById('savedFiltersBar');
  if (!bar) return;
  const filters = getSavedFilters();
  const hasColFilters = Object.keys(projColFilters).length > 0;

  if (!filters.length && !hasColFilters) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  const colFilterPill = hasColFilters
    ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 5px 3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(192,122,26,0.12);color:var(--amber);border:1px solid var(--amber-dim);white-space:nowrap;">
        &#x1F50D; Column Filters Active
        <span onclick="clearProjColFilters()" title="Clear column filters" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:rgba(192,122,26,0.2);color:var(--amber);font-size:11px;line-height:1;font-weight:700;transition:background .15s" onmouseover="this.style.background='rgba(192,122,26,0.4)'" onmouseout="this.style.background='rgba(192,122,26,0.2)'">&#x2715;</span>
      </span>`
    : '';

  const savedPart = filters.length
    ? '<span style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;">Saved:</span>' +
      filters.map(f => `
        <span class="saved-filter-chip ${activeFilterName===f.name?'active':''}" onclick="applyNamedFilter('${f.name.replace(/'/g,"\\'")}')" title="Apply filter">
          ${f.name}
          <span class="sf-del" onclick="event.stopPropagation();deleteNamedFilter('${f.name.replace(/'/g,"\\'")}')">&#x2715;</span>
        </span>`).join('')
    : '';

  bar.innerHTML = (colFilterPill && savedPart)
    ? colFilterPill + '<span style="width:1px;height:16px;background:var(--border);align-self:center;flex-shrink:0;margin:0 4px"></span>' + savedPart
    : colFilterPill + savedPart;
}

function saveNavFilter() { saveNamedFilter(); } // backward compat

function updateNavFilterDot() {
  const hasFilter = navFilter.status.size > 0 || navFilter.phase.size > 0 || !!navFilter.namePattern;
  const dot = document.getElementById('navFilterDot');
  if (dot) dot.style.display = hasFilter ? 'inline-block' : 'none';
}

async function toggleShowClosed() {
  // project_info for all projects (open + closed) is already loaded at startup
  // tasks for closed projects load individually on demand when clicking into a project
  showClosed = !showClosed;
  // Clear col filters when toggling closed — DOM filter rows change so stale filters cause blank screen
  projColFilters = {};
  const btn = document.getElementById('showClosedBtn');
  if (btn) {
    btn.style.color = showClosed ? 'var(--amber)' : 'var(--muted)';
    btn.style.borderColor = showClosed ? 'var(--amber-dim)' : 'var(--border)';
    btn.innerHTML = showClosed ? '&#x1F513; Hide Closed' : '&#x1F512; Show Closed';
  }
  renderProjectsTable();
}

function toggleNavFilter() {
  const panel = document.getElementById('navFilterPanel');
  const btn   = document.getElementById('navFilterBtn');
  const open  = panel.classList.toggle('open');
  btn.classList.toggle('active', open);
  if (open) { buildNavFilterChips(); buildColToggleChips(); }
}

function buildNavFilterChips() {
  const sc = document.getElementById('filterStatusChips');
  const pc = document.getElementById('filterPhaseChips');
  if (!sc || !pc) return;
  sc.innerHTML = NAV_FILTER_STATUS.map(s => `
    <button class="nav-filter-chip ${navFilter.status.has(s)?'sel':''}"
      onclick="toggleNavFilterChip('status','${s}',this)">${NAV_FILTER_STATUS_LABELS[s]||s}</button>`).join('');
  pc.innerHTML = NAV_FILTER_PHASE.map(p => `
    <button class="nav-filter-chip ${navFilter.phase.has(p)?'sel':''}"
      onclick="toggleNavFilterChip('phase','${p}',this)">${p}</button>`).join('');
}

function toggleNavFilterChip(group, value, el) {
  if (navFilter[group].has(value)) { navFilter[group].delete(value); el.classList.remove('sel'); }
  else { navFilter[group].add(value); el.classList.add('sel'); }
  renderProjectNav();
  updateNavFilterDot();
  if (document.getElementById('panel-projects')?.classList.contains('active')) renderProjectsTable();
  document.getElementById('allBadge').textContent = projects.length;
}

function clearNavFilter() {
  navFilter.status.clear();
  navFilter.phase.clear();
  localStorage.removeItem('nuworkspace_nav_filter');
  buildNavFilterChips();
  renderProjectNav();
  updateNavFilterDot();
  renderProjectsTable();
  toast('Filter cleared');
}

function saveNavFilter() {
  localStorage.setItem('nuworkspace_nav_filter', JSON.stringify({
    status: [...navFilter.status],
    phase:  [...navFilter.phase],
  }));
  document.getElementById('navFilterPanel').classList.remove('open');
  document.getElementById('navFilterBtn').classList.remove('active');
  updateNavFilterDot();
  renderProjectsTable();
  toast('Filter saved');
}

function updateNavFilterDot() {
  const hasFilter = navFilter.status.size > 0 || navFilter.phase.size > 0;
  const dot = document.getElementById('navFilterDot');
  if (dot) dot.style.display = hasFilter ? 'inline-block' : 'none';
}

function renderProjectNav(){
  // Sidebar project list removed — projects now shown in table view
  const badge = document.getElementById('allBadge');
  if (badge) badge.textContent = projects.length;
  updateNavFilterDot();
  if (document.getElementById('panel-projects')?.classList.contains('active')) renderProjectsTable();
}




// ===== PROJECT MODAL =====
// ===== PROJECT MODAL =====
let pColor=COLORS[0],pEmoji='📁',pTeam=new Set();

function openProjectModal(){
  pColor=COLORS[0]; pEmoji='📁'; pTeam=new Set();
  document.getElementById('projName').value='';
  document.getElementById('projDesc').value='';
  document.getElementById('projStart').value='';
  document.getElementById('projEnd').value='';
  document.getElementById('projEmojiBtn').textContent=pEmoji;
  document.getElementById('emojiPickerWrap').style.display='none';
  buildSwatches(); buildEmojiGrid(); buildProjTeam();
  document.getElementById('projectModal').classList.add('open');
  setTimeout(()=>document.getElementById('projName').focus(),80);
}

function closeProjectModal(){document.getElementById('projectModal').classList.remove('open');}

function buildSwatches(){
  document.getElementById('colorSwatches').innerHTML=COLORS.map(c=>`
    <div class="swatch ${c===pColor?'sel':''}" style="background:${c}" onclick="pickColor('${c}',this)"></div>
  `).join('');
}

function pickColor(c,el){
  pColor=c;
  document.querySelectorAll('.swatch').forEach(s=>s.classList.remove('sel'));
  el.classList.add('sel');
}

function buildEmojiGrid(){
  document.getElementById('emojiGrid').innerHTML=EMOJIS.map(e=>`
    <div class="emoji-opt ${e===pEmoji?'sel':''}" onclick="pickEmoji(this,'${e}')">${e}</div>
  `).join('');
}

function pickEmoji(el,e){
  pEmoji=e;
  document.querySelectorAll('.emoji-opt').forEach(x=>x.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('projEmojiBtn').textContent=e;
  document.getElementById('emojiPickerWrap').style.display='none';
}

function toggleEmojiPicker(){
  const w=document.getElementById('emojiPickerWrap');
  w.style.display=w.style.display==='none'?'block':'none';
}

function buildProjTeam(){
  const grid = document.getElementById('projTeamGrid');
  if (employees.length === 0) {
    grid.innerHTML = '<div style="font-size:12.5px;color:var(--muted);padding:8px 4px">No employees yet — add some in the Employees panel first.</div>';
    return;
  }
  grid.innerHTML = employees.filter(e => e.isActive !== false).map(e=>`
    <div class="chip ${pTeam.has(e.id)?'sel':''}" onclick="togProjMember('${e.id}',this)">
      <div class="chip-av" style="background:${e.color}">${e.initials}</div>
      <span class="chip-name">${e.name}</span>
      <div class="chip-chk">${pTeam.has(e.id)?'&#x2713;':''}</div>
    </div>`).join('');
}

function togProjMember(id,el){
  if(pTeam.has(id)){pTeam.delete(id);el.classList.remove('sel');el.querySelector('.chip-chk').innerHTML='';}
  else{pTeam.add(id);el.classList.add('sel');el.querySelector('.chip-chk').innerHTML='&#x2713;';}
}




// ===== ACTIVE PROJECT STATE =====
// ===== ACTIVE PROJECT STATE =====
let activeProjectId = null; // null = All Projects


// ===== PROJECT SELECTION =====
// ===== PROJECT SELECTION =====
function showProjectView(panelId) {
  const subMap = {'panel-info':'sub-info','panel-tasks':'sub-tasks','panel-expenses':'sub-expenses','panel-invoicing':'sub-invoicing'};
  const subId = subMap[panelId];
  if (subId) {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-project').classList.add('active');
    switchProjTab(subId);
    return;
  }
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(panelId);
  if (el) el.classList.add('active');
}

function selectProject(id, el) {
  activeProjectId = id;
  const p = id ? projects.find(x => x.id === id) : null;

  // Update topbar name
  document.getElementById('topbarName').textContent = p ? p.emoji + ' ' + p.name : 'All Projects';

  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');

  // Always return to info panel when selecting a project
  showProjectView('panel-info');

  // Re-render data
  renderAllViews();
  renderProjStickyHeader(activeProjectId);

  // For closed projects, wait for data to load before rendering
  const info = projectInfo[id];
  const isClosed = !info || info.status === 'closed';
  if (id && isClosed && typeof loadClosedProject === 'function' && !_loadedClosedProjects.has(id)) {
    const infoWrap = document.getElementById('infoWrap');
    if (infoWrap) infoWrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px;">&#x23F3; Loading project data\u2026</div>';
    loadClosedProject(id).then(() => {
      renderInfoSheet(id);
      switchProjTab('sub-info');
    });
  } else {
    renderInfoSheet(activeProjectId);
    switchProjTab('sub-info');
  }
}

function selectAllProjects(el) { openDashboardPanel(el); }

// ===== SAVE PROJECT =====
async function saveProject() {
  const name = document.getElementById('projName').value.trim();
  if (!name) {
    const inp = document.getElementById('projName');
    inp.style.borderColor = 'var(--red)'; inp.style.boxShadow = '0 0 0 3px rgba(224,92,92,0.18)';
    inp.focus(); setTimeout(() => { inp.style.borderColor = ''; inp.style.boxShadow = ''; }, 1800);
    return;
  }

  // Prevent double-submit
  const btn = document.querySelector('#projectModal .btn-primary');
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const desc = document.getElementById('projDesc').value.trim();
  const start = document.getElementById('projStart').value;
  const end   = document.getElementById('projEnd').value;

  if (!sb) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch(e) {
      toast('⚠ Not connected to Supabase');
      if (btn) { btn.disabled = false; btn.textContent = 'Create Project'; }
      return;
    }
  }

  const row = { name, description: desc, color: pColor, emoji: pEmoji };
  const saved = await dbInsert('projects', row);
  if (!saved) {
    toast('⚠ Could not save project — check connection');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Project'; }
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  await dbInsert('project_info', {
    project_id: saved.id, phase: 'Waiting on TP Approval', status: 'jobprep',
    start_date: today, end_date: null,
  });

  projects.push({ id: saved.id, name, color: pColor, emoji: pEmoji, desc, createdAt: new Date().toISOString().split('T')[0] });
  projectInfo[saved.id] = { pm:'', po:'', contract:'', phase:'Waiting on TP Approval', status:'jobprep',
    startDate: today, endDate: '', tentativeTestDate: '', client:'', clientContact:'', clientEmail:'',
    clientPhone:'', billingType:'Fixed Fee', invoiced:'', remaining:'', notes:'', desc,
    dcas:'', customerWitness:'', tpApproval:'', dpas:'', cui:'', testDesc:'', testArticleDesc:'', quoteNumber:'' };
  renderProjectNav(); rebuildProjDropdown();
  closeProjectModal();
  toast(pEmoji + ' "' + name + '" created');
  renderProjectsTable();
  logActivity('projects', saved.id, name, 'Project Created');
  // Auto-open the new project in edit mode
  setTimeout(() => {
    selectProjectById(saved.id);
  }, 100);
}


const _origToggleInfoTask = typeof toggleInfoTask !== "undefined" ? toggleInfoTask : ()=>{};
window.toggleInfoTask = async function(idx, projId) {
  if (idx < 0 || idx >= taskStore.length) return;
  const t = taskStore[idx];
  t.done = !t.done;
  t.status = t.done ? 'complete' : 'inprogress';
  if (t._id) await dbUpdate('tasks', t._id, { done: t.done, status: t.status });
  renderInfoTasks(projId, currentTaskFilter);
  updateStatsBar();
  const ring = document.querySelector('.ring-fill');
  const pctEl = document.querySelector('.info-progress-pct');
  if (ring || pctEl) {
    const pt = taskStore.filter(x => x.proj === projId);
    const pct = pt.length ? Math.round(pt.filter(x=>x.done).length/pt.length*100) : 0;
    const circ = 2*Math.PI*20;
    if (ring) ring.setAttribute('stroke-dashoffset', circ-(pct/100)*circ);
    if (pctEl) pctEl.textContent = pct+'%';
  }
};
