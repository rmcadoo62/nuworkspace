
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
const PROJ_COL_DEFS = [
  { key: 'pm',            label: 'PM',                    ptc: 'pm',       default: false, width: '110px' },
  { key: 'tentativeTest', label: 'Tent. Test Date',   ptc: 'tenttest', default: false, width: '120px' },
  { key: 'testcomplete',  label: 'Test Comp. Date',    ptc: 'testcomp', default: false, width: '120px' },
  { key: 'dcas',          label: 'DCAS',                  ptc: 'dcas',     default: true,  width: '80px'  },
  { key: 'witness',       label: 'Cust. Witness',      ptc: 'witness',  default: false, width: '130px' },
  { key: 'tpApproval',    label: 'TP Approval',           ptc: 'tpappr',   default: false, width: '100px' },
  { key: 'dpas',          label: 'DPAS',                  ptc: 'dpas',     default: false, width: '70px'  },
  { key: 'noforn',        label: 'NOFORN',                ptc: 'noforn',   default: false, width: '80px'  },
  { key: 'creditHold',    label: 'Credit Hold',           ptc: 'credit',   default: false, width: '90px'  },
  { key: 'needPo',        label: 'Need PO',       ptc: 'needpo',   default: false, width: '110px' },
  { key: 'contact',       label: 'Contact',        ptc: 'contact',  default: false, width: '130px' },
];
function getProjCols() { try { return JSON.parse(localStorage.getItem('projColVis') || '{}'); } catch { return {}; } }
function setProjCols(vis) { try { localStorage.setItem('projColVis', JSON.stringify(vis)); } catch {} }
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
  wrap.innerHTML = PROJ_COL_DEFS.map(c => {
    const on = isProjColVisible(c.key);
    return `<span onclick="toggleProjCol('${c.key}')" style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;user-select:none;background:${on?'var(--amber-glow)':'var(--surface2)'};color:${on?'var(--amber)':'var(--muted)'};border:1px solid ${on?'var(--amber-dim)':'var(--border)'};transition:all .15s">${on?'✓':'+'} ${c.label}</span>`;
  }).join('');
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
      `<div style="background:${bg};border:1px solid ${color}44;border-radius:10px;padding:10px 16px;min-width:100px;cursor:default">
        <div style="font-size:10px;color:${color};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${label}</div>
        <div style="font-size:24px;font-family:'DM Serif Display',serif;color:var(--text);line-height:1">${count}</div>
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
    else if (projSortCol === 'noforn')        { va = ia.noforn||''; vb = ib.noforn||''; }
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
      // Always pass closed projects through when showClosed is on — don't let status filter hide them
      if (showClosed && info.status === 'closed') return true;
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

  const rows = filtered.map(p => {
    const info  = projectInfo[p.id] || {};
    const st    = STATUS_META[info.status] || STATUS_META['active'];
    // Revenue calcs — use stored values from project_info (no need to scan taskStore)
    const expected  = info.expectedRevenue || 0;
    const billed    = info.billedRevenue   || 0;
    const remaining = expected - billed;

    // Actual hours — use stored value from project_info (covers full history)
    const actualHours = info.actualHours || 0;

    const fmtMoney = n => n > 0 ? '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
    const truncate = (s, n=40) => s && s.length > n ? s.slice(0,n)+'…' : (s||'—');
    const fmtDate  = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—';

    const optCells = PROJ_COL_DEFS.filter(c => isProjColVisible(c.key)).map(c => {
      let val = '—';
      if (c.key === 'pm')            val = info.pm || '—';
      if (c.key === 'tentativeTest') val = `<span style="font-size:11px;font-family:'JetBrains Mono',monospace">${fmtDate(info.tentativeTestDate)}</span>`;
      if (c.key === 'testcomplete')  val = `<span style="font-size:11px;font-family:'JetBrains Mono',monospace">${fmtDate(info.testcompleteDate)}</span>`;
      if (c.key === 'dcas')          val = `<span style="font-size:11px;color:var(--muted)">${info.dcas||'—'}</span>`;
      if (c.key === 'witness')       val = `<span style="font-size:11px;color:var(--muted)">${truncate(info.customerWitness,30)}</span>`;
      if (c.key === 'tpApproval')    val = `<span style="font-size:11px;color:var(--muted)">${info.tpApproval||'—'}</span>`;
      if (c.key === 'dpas')          val = `<span style="font-size:11px;color:var(--muted)">${info.dpas||'—'}</span>`;
      if (c.key === 'noforn')        val = `<span style="font-size:11px;color:var(--muted)">${info.noforn||'—'}</span>`;
      if (c.key === 'creditHold')    val = info.creditHold ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(208,64,64,0.15);color:var(--red)">YES</span>` : `<span style="color:var(--muted);font-size:11px">—</span>`;
      if (c.key === 'needPo')        val = info.needUpdatedPo ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber)">YES</span>` : `<span style="color:var(--muted);font-size:11px">—</span>`;
      if (c.key === 'contact')       val = `<span style="font-size:11px;color:var(--muted)">${truncate(info.clientContact,25)}</span>`;
      return `<td>${val}</td>`;
    }).join('');

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
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${info.po||'—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${info.quoteNumber||'—'}</td>
      <td style="font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${(p.desc||info.desc||'').replace(/"/g,'&quot;')}">${truncate(p.desc||info.desc)}</td>
      <td style="font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${(info.testArticleDesc||'').replace(/"/g,'&quot;')}">${truncate(info.testArticleDesc)}</td>
      ${optCells}
      <td class="projtbl-amount" style="color:var(--green)">${fmtMoney(expected)}</td>
      <td class="projtbl-amount" style="color:var(--blue)">${fmtMoney(billed)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--blue)">${actualHours>0?actualHours.toFixed(1)+'h':'—'}</td>
      <td class="projtbl-amount" style="color:${remaining<0?'var(--red)':'var(--amber)'}">${expected>0?fmtMoney(remaining):'—'}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto">
    <table class="projtbl-table" id="projtblTable" style="min-width:1200px;table-layout:fixed">
      <colgroup>
        <col style="width:var(--ptc-name,220px)">
        <col style="width:var(--ptc-status,130px)">
        <col style="width:var(--ptc-client,160px)">
        <col style="width:var(--ptc-po,90px)">
        <col style="width:var(--ptc-quote,90px)">
        <col style="width:var(--ptc-desc,180px)">
        <col style="width:var(--ptc-article,180px)">
        ${PROJ_COL_DEFS.filter(c => isProjColVisible(c.key)).map(c => `<col style="width:var(--ptc-${c.ptc},${c.width})">`).join('')}
        <col style="width:var(--ptc-exp,100px)">
        <col style="width:var(--ptc-billed,100px)">
        <col style="width:var(--ptc-hours,90px)">
        <col style="width:var(--ptc-remain,110px)">
      </colgroup>
      <thead>
        <tr>
          <th class="sortable" style="position:relative" onclick="setProjSort('name')">Project <span class="sort-icon ${projSortCol==='name'?'active':''}">${projSortCol==='name'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="name"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('status')">Status <span class="sort-icon ${projSortCol==='status'?'active':''}">${projSortCol==='status'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="status"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('client')">Company <span class="sort-icon ${projSortCol==='client'?'active':''}">${projSortCol==='client'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="client"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('po')">PO <span class="sort-icon ${projSortCol==='po'?'active':''}">${projSortCol==='po'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="po"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('quote')">Quote <span class="sort-icon ${projSortCol==='quote'?'active':''}">${projSortCol==='quote'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="quote"></span></th>
          <th style="position:relative">Description<span class="itt-resizer" data-ptc="desc"></span></th>
          <th style="position:relative">Test Article Desc.<span class="itt-resizer" data-ptc="article"></span></th>
          ${PROJ_COL_DEFS.filter(c => isProjColVisible(c.key)).map(c =>
            `<th class="sortable" style="position:relative" onclick="setProjSort('${c.key}')">${c.label} <span class="sort-icon ${projSortCol===c.key?'active':''}">${projSortCol===c.key?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="${c.ptc}"></span></th>`
          ).join('')}
          <th class="sortable" style="position:relative" onclick="setProjSort('expected')">Expected Rev. <span class="sort-icon ${projSortCol==='expected'?'active':''}">${projSortCol==='expected'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="exp"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('billed')">Billed Rev. <span class="sort-icon ${projSortCol==='billed'?'active':''}">${projSortCol==='billed'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="billed"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('hours')">Act. Hours <span class="sort-icon ${projSortCol==='hours'?'active':''}">${projSortCol==='hours'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="hours"></span></th>
          <th class="sortable" style="position:relative" onclick="setProjSort('remaining')">Remaining Rev. <span class="sort-icon ${projSortCol==='remaining'?'active':''}">${projSortCol==='remaining'?(projSortDir==='asc'?'▲':'▼'):'⇅'}</span><span class="itt-resizer" data-ptc="remain"></span></th>
        </tr>
      <tr id="projColFilterRow" class="proj-col-filter-row">
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="name" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="status" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="client" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="po" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="quote" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="desc" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          <th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="article" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>
          ${PROJ_COL_DEFS.filter(c => isProjColVisible(c.key)).map(c =>
            '<th style="padding:4px 6px"><input class="proj-col-filter-input" data-field="'+c.key+'" placeholder="🔍" oninput="setProjColFilter(this)" style="width:100%"></th>'
          ).join('')}
          <th></th><th></th><th></th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>`;
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
  toast('Filter cleared');
}

function saveNamedFilter() {
  const nameInp = document.getElementById('filterSaveName');
  const name = nameInp ? nameInp.value.trim() : '';
  if (!name) { toast('Enter a name for this filter'); nameInp?.focus(); return; }
  const namePattern = document.getElementById('filterNamePattern')?.value.trim() || '';
  navFilter.namePattern = namePattern;
  const filters = getSavedFilters().filter(f => f.name !== name); // overwrite if exists
  filters.push({ name, status: [...navFilter.status], phase: [...navFilter.phase], namePattern, colVis: getProjCols() });
  setSavedFilters(filters);
  activeFilterName = name;
  if (nameInp) nameInp.value = '';
  renderSavedFiltersBar();
  persistFilterState();
  document.getElementById('navFilterPanel').classList.remove('open');
  document.getElementById('navFilterBtn').classList.remove('active');
  updateNavFilterDot();
  renderProjectsTable();
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
  activeFilterName = name;
  buildNavFilterChips();
  buildColToggleChips();
  const inp = document.getElementById('filterNamePattern');
  if (inp) inp.value = navFilter.namePattern;
  persistFilterState();
  updateNavFilterDot();
  renderSavedFiltersBar();
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
}

function renderSavedFiltersBar() {
  const bar = document.getElementById('savedFiltersBar');
  if (!bar) return;
  const filters = getSavedFilters();
  if (!filters.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '<span style="font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;">Saved:</span>' +
    filters.map(f => `
      <span class="saved-filter-chip ${activeFilterName===f.name?'active':''}" onclick="applyNamedFilter('${f.name.replace(/'/g,"\\'")}')" title="Apply filter">
        ${f.name}
        <span class="sf-del" onclick="event.stopPropagation();deleteNamedFilter('${f.name.replace(/'/g,"\\'")}')">&#x2715;</span>
      </span>`).join('');
}

function saveNavFilter() { saveNamedFilter(); } // backward compat

function updateNavFilterDot() {
  const hasFilter = navFilter.status.size > 0 || navFilter.phase.size > 0 || !!navFilter.namePattern;
  const dot = document.getElementById('navFilterDot');
  if (dot) dot.style.display = hasFilter ? 'inline-block' : 'none';
}

async function toggleShowClosed() {
  // If turning on and closed not loaded yet, load them first
  if (!showClosed && !closedProjectsLoaded) {
    const btn = document.getElementById('showClosedBtn');
    if (btn) { btn.innerHTML = '⏳ Loading...'; btn.disabled = true; }
    await loadClosedProjects(null);
    if (btn) { btn.disabled = false; }
  }
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
  renderInfoSheet(activeProjectId);
  renderProjStickyHeader(activeProjectId);
  // Switch to info sub-panel
  switchProjTab('sub-info');
}

function selectAllProjects(el) { openDashboardPanel(el); } function _oldSelectAllProjects(el) {
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'All Projects';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  showProjectView('panel-dashboard');
  renderDashboard();
}

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
    dcas:'', customerWitness:'', tpApproval:'', dpas:'', noforn:'', testDesc:'', testArticleDesc:'', quoteNumber:'' };
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
