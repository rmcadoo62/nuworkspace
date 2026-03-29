
// ===== ALL PROJECTS DASHBOARD =====
// ===== ALL PROJECTS DASHBOARD =====
function renderDashboard() {
  const wrap = document.getElementById('dashWrap');
  if (!wrap) return;

  const totalTasks   = taskStore.length;
  const doneTasks    = taskStore.filter(t => t.done).length;
  const overdueTasks = taskStore.filter(t => t.overdue && !t.done).length;
  const activeProjCount = projects.filter(p => {
    const info = projectInfo[p.id];
    return !info || info.status === 'active';
  }).length;

  const pct = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;

  // Tasks due in next 7 days (not done)
  const now = new Date(); now.setHours(0,0,0,0);
  const in7 = new Date(now); in7.setDate(now.getDate() + 7);
  const dueSoon = taskStore
    .filter(t => {
      if (t.done) return false;
      if (!t.due_raw) return false;
      const d = new Date(t.due_raw + 'T00:00:00');
      return d <= in7;
    })
    .sort((a,b) => new Date(a.due_raw+'T00:00:00') - new Date(b.due_raw+'T00:00:00'))
    .slice(0, 8);

  // Status style map
  const statusStyle = {
    active:       {label:'Active',        bg:'rgba(76,175,125,0.15)',  color:'#4caf7d'},
    'on-hold':    {label:'On Hold',       bg:'rgba(232,162,52,0.15)',  color:'#e8a234'},
    onhold:       {label:'On Hold',       bg:'rgba(232,162,52,0.15)',  color:'#e8a234'},
    complete:     {label:'Complete',      bg:'rgba(91,156,246,0.15)',  color:'#5b9cf6'},
    testcomplete: {label:'Test Complete', bg:'rgba(91,156,246,0.15)',  color:'#5b9cf6'},
    cancelled:    {label:'Cancelled',     bg:'rgba(224,92,92,0.15)',   color:'#e05c5c'},
    closed:       {label:'Closed',        bg:'rgba(85,85,102,0.15)',   color:'#888899'},
    jobprep:      {label:'Job Prep',      bg:'rgba(167,139,250,0.15)', color:'#a78bfa'},
    pending:      {label:'Pending',       bg:'rgba(232,162,52,0.15)',  color:'#e8a234'},
    pendretest:   {label:'Pend-Retest',   bg:'rgba(251,146,60,0.15)',  color:'#fb923c'},
  };



  // Due soon rows
  const dueSoonHTML = dueSoon.length === 0
    ? `<div class="dash-empty">No tasks due in the next 7 days.</div>`
    : dueSoon.map(t => {
        const p  = projects.find(x => x.id === t.proj);
        const emp = employees.find(e => e.initials === t.assign || e.id === t.assign);
        const avColor = emp ? emp.color : '#7a7a85';
        const d  = t.due_raw ? new Date(t.due_raw + 'T00:00:00') : null;
        const isOv = d && d < now;
        const dateLabel = d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
        return `
          <div class="dash-due-row" onclick="selectProjectById('${t.proj}')">
            <div class="dash-due-proj-dot" style="background:${p ? p.color : '#7a7a85'}"></div>
            <div class="dash-due-name">${t.name}</div>
            ${p ? `<div class="dash-due-proj" style="background:${p.color}18;color:${p.color}">${p.emoji} ${p.name}</div>` : ''}
            <div class="dash-due-assign" style="background:${avColor}">${t.assign || '?'}</div>
            <div class="dash-due-date ${isOv?'overdue':''}">${isOv ? '⚠ ' : ''}${dateLabel}</div>
          </div>`;
      }).join('');

  // Overdue tasks
  const overdueList = taskStore.filter(t => t.overdue && !t.done).slice(0, 6);
  const overdueHTML = overdueList.length === 0
    ? `<div class="dash-empty">&#x1F389; No overdue tasks!</div>`
    : overdueList.map(t => {
        const p = projects.find(x => x.id === t.proj);
        const emp = employees.find(e => e.initials === t.assign);
        const avColor = emp ? emp.color : '#7a7a85';
        return `
          <div class="dash-due-row" onclick="selectProjectById('${t.proj}')">
            <div class="dash-due-proj-dot" style="background:var(--red)"></div>
            <div class="dash-due-name">${t.name}</div>
            ${p ? `<div class="dash-due-proj" style="background:${p.color}18;color:${p.color}">${p.emoji} ${p.name}</div>` : ''}
            <div class="dash-due-assign" style="background:${avColor}">${t.assign || '?'}</div>
            <div class="dash-due-date overdue">${t.due || '—'}</div>
          </div>`;
      }).join('');

  // ── Billed by Month chart data ────────────────────────────────────────
  // billedMonthlyData is the source of truth — it covers ALL projects including closed.
  // It is kept current by the billed_revenue_monthly table in Supabase.
  const totalBilledAllProjects = Object.values(projectInfo).reduce((s, p) => s + (p.billedRevenue||0), 0);
  const monthMap = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    monthMap[key] = { label: d.toLocaleDateString('en-US',{month:'short', year:'2-digit'}), val: window.billedMonthlyData?.[key] || 0 };
  }
  const billedTasks = taskStore.filter(t => t.status === 'billed');
  const todayStr = new Date().toISOString().split('T')[0];
  const chartLabels  = Object.values(monthMap).map(m => m.label);
  const chartData    = Object.values(monthMap).map(m => m.val);
  const chartKeys    = Object.keys(monthMap); // e.g. ['2025-03', ...]
  const totalBilled  = chartData[chartData.length - 1] || 0; // current month from chart
  // Note: totalBilledAllProjects is the accurate all-time total across all projects
  // Sum ALL billed tasks directly — not just those with a date
  const _openProjIds = new Set(projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').map(p => p.id));
  const readyToBill  = taskStore.filter(t => t.status === 'complete' && _openProjIds.has(t.proj)).reduce((s,t) => s + (t.fixedPrice||0), 0);
  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  // ── Booking Report — tasks entered this month grouped by sales category ─
  const _now = new Date();
  const _thisMonthKey = _now.getFullYear() + '-' + String(_now.getMonth()+1).padStart(2,'0');
  const _thisMonthLabel = _now.toLocaleDateString('en-US', {month:'long', year:'numeric'});
  const bookingByCat = {};
  taskStore.forEach(t => {
    const created = (t.createdAt || '').slice(0,7); // 'YYYY-MM'
    if (created !== _thisMonthKey) return;
    const cat = t.salesCat || 'Uncategorized';
    bookingByCat[cat] = (bookingByCat[cat] || 0) + (t.fixedPrice || 0);
  });
  const bookingCats   = Object.keys(bookingByCat).sort((a,b) => bookingByCat[b] - bookingByCat[a]);
  const bookingTotal  = Object.values(bookingByCat).reduce((s,v) => s+v, 0);
  // Detail list for audit view — all tasks this month sorted by category then project
  const bookingDetailTasks = taskStore
    .filter(t => (t.createdAt||'').slice(0,7) === _thisMonthKey)
    .sort((a,b) => {
      const catA = a.salesCat||'Uncategorized', catB = b.salesCat||'Uncategorized';
      if (catA !== catB) return catA.localeCompare(catB);
      const pA = (projects.find(p=>p.id===a.proj)||{}).name||'', pB = (projects.find(p=>p.id===b.proj)||{}).name||'';
      return pA.localeCompare(pB);
    });

  // Sales by Category detail — billed tasks this year by category and project
  const curYearStr = new Date().getFullYear().toString();
  const salesDetailTasks = taskStore
    .filter(t => t.status === 'billed' && (t.billedDate||'').slice(0,4) === curYearStr)
    .sort((a,b) => {
      const catA = a.salesCat||'?', catB = b.salesCat||'?';
      if (catA !== catB) return catA.localeCompare(catB);
      const pA = (projects.find(p=>p.id===a.proj)||{}).name||'', pB = (projects.find(p=>p.id===b.proj)||{}).name||'';
      return pA.localeCompare(pB);
    });

  // Backlog detail — all non-billed tasks on open projects
  const backlogDetailTasks = taskStore
    .filter(t => {
      if (t.status === 'billed') return false;
      const proj = projectInfo[t.proj];
      if (proj && proj.status === 'closed') return false;
      const projObj = projects.find(p => p.id === t.proj);
      if (projObj && /^N/i.test((projObj.name||'').trim())) return false; // exclude N jobs
      return true;
    })
    .sort((a,b) => {
      const pA = (projects.find(p=>p.id===a.proj)||{}).name||'', pB = (projects.find(p=>p.id===b.proj)||{}).name||'';
      return pB.localeCompare(pA, undefined, {numeric:true}); // descending by project number
    });

  // Backlog: sum of all task prices excluding billed
  const backlogTotal = taskStore.reduce((sum, t) => {
    if (t.status === 'billed') return sum;
    const proj = projectInfo[t.proj];
    if (proj && proj.status === 'closed') return sum;
    return sum + (parseFloat(t.fixedPrice) || 0);
  }, 0);

  wrap.innerHTML = `
    <div class="dash-charts-row">
      <div class="dash-chart-card">
        <div class="dash-chart-title"><span>💰</span> Billed Revenue <span style="margin-left:auto;font-size:13px;font-family:monospace;color:var(--green);letter-spacing:0;text-transform:none;font-weight:700">${fmt$(totalBilled)} this month</span><span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#c084fc;letter-spacing:0;text-transform:none;font-weight:600;margin-left:12px">${fmt$(readyToBill)} ready to bill</span></div>
        <canvas id="billedByMonthChart" height="110"></canvas>
      </div>
    </div>

    <div class="dash-charts-row" style="margin-top:20px">
      <div class="dash-chart-card">
        <div class="dash-chart-title">
          <span>📊</span> Sales by Category
          <div style="display:flex;gap:4px;margin-left:auto">
            <button id="salesBtnChart" onclick="setSalesView('chart')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--amber-dim);background:var(--amber-glow);color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Chart</button>
            <button id="salesBtnSummary" onclick="setSalesView('summary')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Summary</button>
            <button id="salesBtnDetail" onclick="setSalesView('detail')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Detail</button>
          </div>
        </div>
        <div id="salesChartWrap"><canvas id="salesByCatChart" height="140"></canvas></div>
        <div id="salesSummaryWrap" style="display:none;max-height:400px;overflow-y:scroll">
          ${(() => {
            const curYearStr2 = new Date().getFullYear().toString();
            const mnths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const catRows = {};
            Object.entries(window.billedCatData||{}).forEach(([ym,cats]) => {
              if (ym.slice(0,4) !== curYearStr2) return;
              const mo = parseInt(ym.slice(5,7))-1;
              Object.entries(cats).forEach(([cat,amt]) => {
                if (!catRows[cat]) catRows[cat] = {months:{}, total:0};
                catRows[cat].months[mo] = (catRows[cat].months[mo]||0)+amt;
                catRows[cat].total += amt;
              });
            });
            const sortedCats2 = Object.entries(catRows).sort((a,b)=>b[1].total-a[1].total);
            const activeMos = [...new Set(Object.values(catRows).flatMap(r=>Object.keys(r.months).map(Number)))].sort((a,b)=>a-b);
            if (!sortedCats2.length) return '<div style="padding:24px;text-align:center;color:var(--muted)">No billed data this year.</div>';
            return '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
              '<thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Cat</th>'+
              activeMos.map(m=>'<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">'+mnths[m]+'</th>').join('')+
              '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--amber)">Total</th>'+
              '</tr></thead><tbody>'+
              sortedCats2.map(([cat,row],i)=>
                '<tr style="border-bottom:1px solid var(--border);background:'+(i%2===1?'var(--surface2)':'')+'">'+
                '<td style="padding:7px 12px;font-weight:600;color:var(--amber)">'+cat+'</td>'+
                activeMos.map(m=>'<td style="padding:7px 12px;text-align:right;font-family:monospace;color:var(--muted)">'+(row.months[m]?fmt$(row.months[m]):'—')+'</td>').join('')+
                '<td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--text)">'+fmt$(row.total)+'</td>'+
                '</tr>'
              ).join('')+
              '</tbody></table>';
          })()}
        </div>
        <div id="salesDetailWrap" style="display:none;max-height:400px;overflow-y:scroll">
          ${(() => {
            const mnthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const byCatMonth = {};
            salesDetailTasks.forEach(t => {
              const cat = t.salesCat||'—';
              const mo = t.billedDate ? mnthNames[parseInt(t.billedDate.slice(5,7))-1]+' '+t.billedDate.slice(0,4) : 'Unknown';
              if (!byCatMonth[cat]) byCatMonth[cat] = {};
              if (!byCatMonth[cat][mo]) byCatMonth[cat][mo] = [];
              byCatMonth[cat][mo].push(t);
            });
            const sortedCats3 = Object.keys(byCatMonth).sort();
            if (!sortedCats3.length) return '<div style="padding:24px;text-align:center;color:var(--muted)">No billed data this year.</div>';
            return '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
              '<thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Cat / Month / Task</th>'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Billed Date</th>'+
              '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Price</th>'+
              '</tr></thead><tbody>'+
              sortedCats3.map(cat => {
                const months = Object.keys(byCatMonth[cat]).sort();
                const catTotal = months.flatMap(m=>byCatMonth[cat][m]).reduce((s,t)=>s+(t.fixedPrice||0),0);
                return '<tr style="background:var(--surface2);border-bottom:1px solid var(--border)">'+
                  '<td colspan="3" style="padding:8px 12px;font-weight:700;color:var(--amber);font-size:12px">Cat '+cat+'</td>'+
                  '<td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--amber)">'+fmt$(catTotal)+'</td>'+
                  '</tr>'+
                  months.map(mo => {
                    const tasks = byCatMonth[cat][mo];
                    const moTotal = tasks.reduce((s,t)=>s+(t.fixedPrice||0),0);
                    return '<tr style="background:rgba(128,128,128,0.05);border-bottom:1px solid var(--border)">'+
                      '<td style="padding:6px 12px 6px 24px;font-weight:600;color:var(--muted);font-size:11px">'+mo+'</td>'+
                      '<td colspan="2"></td>'+
                      '<td style="padding:6px 12px;text-align:right;font-family:monospace;color:var(--muted);font-size:11px">'+fmt$(moTotal)+'</td>'+
                      '</tr>'+
                      tasks.map(t => {
                        const p = projects.find(x=>x.id===t.proj);
                        return '<tr style="border-bottom:1px solid var(--border)">'+
                          '<td style="padding:5px 12px 5px 36px;color:var(--text);font-size:11px">'+t.name+'</td>'+
                          '<td style="padding:5px 12px;color:var(--muted);font-size:11px">'+(p?p.emoji+' '+p.name:'—')+'</td>'+
                          '<td style="padding:5px 12px;color:var(--muted);font-size:11px">'+(t.billedDate||'—')+'</td>'+
                          '<td style="padding:5px 12px;text-align:right;font-family:monospace;color:var(--blue);font-size:11px">'+(t.fixedPrice>0?fmt$(t.fixedPrice):'—')+'</td>'+
                        '</tr>';
                      }).join('');
                  }).join('');
              }).join('')+
              '</tbody></table>';
          })()}
        </div>
      </div>
    </div>

    <div class="dash-charts-row" style="margin-top:20px">
      <div class="dash-chart-card" style="display:flex;flex-direction:column;align-items:center;padding-bottom:12px">
        <div class="dash-chart-title" style="width:100%">
          <span>📦</span> Backlog
          <span style="margin-left:8px;font-family:monospace;font-size:15px;color:var(--text);letter-spacing:0;text-transform:none;font-weight:700">${fmt$(backlogTotal)}</span>
          <span style="font-size:11px;color:var(--muted);letter-spacing:0;text-transform:none;font-weight:400;margin-left:6px">excl. billed</span>
          <div style="display:flex;gap:4px;margin-left:auto">
            <button id="backlogBtnChart" onclick="setBacklogView('chart')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--amber-dim);background:var(--amber-glow);color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Chart</button>
            <button id="backlogBtnCat" onclick="setBacklogView('cat')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">By Category</button>
            <button id="backlogBtnSummary" onclick="setBacklogView('summary')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Summary</button>
            <button id="backlogBtnDetail" onclick="setBacklogView('detail')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Detail</button>
          </div>
        </div>
        <div id="backlogChartWrap" style="display:flex;flex-direction:column;align-items:center;width:100%">
          <canvas id="backlogGaugeChart" width="400" height="210" style="display:block;margin:0 auto"></canvas>
          <div style="display:flex;gap:24px;margin-top:-8px;font-size:11px;color:var(--muted)">
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#e05c5c;display:inline-block"></span>$0 – $1M</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#4caf7d;display:inline-block"></span>$1M – $2M</span>
          </div>
        </div>
        <div id="backlogCatWrap" style="display:none;width:100%">
          <canvas id="backlogByCatChart" height="150"></canvas>
        </div>
        <div id="backlogSummaryWrap" style="display:none;max-height:400px;overflow-y:scroll;width:100%">
          ${(() => {
            const projMap = {};
            backlogDetailTasks.forEach(t => {
              const p = projects.find(x=>x.id===t.proj);
              const key = t.proj;
              if (!projMap[key]) projMap[key] = {proj:p, tasks:[], total:0};
              projMap[key].tasks.push(t);
              projMap[key].total += (t.fixedPrice||0);
            });
            const rows = Object.values(projMap).sort((a,b)=>((b.proj?.name||'').localeCompare(a.proj?.name||'', undefined, {numeric:true})));
            if (!rows.length) return '<div style="padding:24px;text-align:center;color:var(--muted)">No backlog.</div>';
            return '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
              '<thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>'+
              '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)"># Tasks</th>'+
              '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Total</th>'+
              '</tr></thead><tbody>'+
              rows.map((r,i)=>
                '<tr style="border-bottom:1px solid var(--border);background:'+(i%2===1?'var(--surface2)':'')+'">'+
                '<td style="padding:7px 12px;color:var(--text)">'+(r.proj?r.proj.emoji+' '+r.proj.name:'—')+'</td>'+
                '<td style="padding:7px 12px;text-align:right;color:var(--muted)">'+r.tasks.length+'</td>'+
                '<td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--green)">'+fmt$(r.total)+'</td>'+
                '</tr>'
              ).join('')+
              '</tbody></table>';
          })()}
        </div>
        <div id="backlogDetailWrap" style="display:none;max-height:400px;overflow-y:scroll;width:100%">
          ${(() => {
            const projMap2 = {};
            backlogDetailTasks.forEach(t => {
              const key = t.proj;
              if (!projMap2[key]) projMap2[key] = {proj:projects.find(x=>x.id===t.proj), tasks:[], total:0};
              projMap2[key].tasks.push(t);
              projMap2[key].total += (t.fixedPrice||0);
            });
            const rows2 = Object.values(projMap2).sort((a,b)=>((b.proj?.name||'').localeCompare(a.proj?.name||'', undefined, {numeric:true})));
            if (!rows2.length) return '<div style="padding:24px;text-align:center;color:var(--muted)">No backlog.</div>';
            const statusColors = {new:'var(--muted)',inprogress:'var(--green)',complete:'var(--blue)',cancelled:'var(--amber)',prohold:'var(--amber)',accthold:'var(--red)'};
            return '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
              '<thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project / Task</th>'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Cat</th>'+
              '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Status</th>'+
              '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Price</th>'+
              '</tr></thead><tbody>'+
              rows2.map(r => {
                return '<tr style="background:var(--surface2);border-bottom:1px solid var(--border)">'+
                  '<td colspan="3" style="padding:8px 12px;font-weight:700;color:var(--text)">'+(r.proj?r.proj.emoji+' '+r.proj.name:'—')+'</td>'+
                  '<td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--green)">'+fmt$(r.total)+'</td>'+
                  '</tr>'+
                  r.tasks.map(t =>
                    '<tr style="border-bottom:1px solid var(--border)">'+
                    '<td style="padding:5px 12px 5px 24px;color:var(--text);font-size:11px">'+t.name+'</td>'+
                    '<td style="padding:5px 12px;color:var(--amber);font-weight:600;font-size:11px">'+(t.salesCat||'—')+'</td>'+
                    '<td style="padding:5px 12px"><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(statusColors[t.status]||'var(--muted)')+'22;color:'+(statusColors[t.status]||'var(--muted)')+'">'+t.status+'</span></td>'+
                    '<td style="padding:5px 12px;text-align:right;font-family:monospace;color:var(--green);font-size:11px">'+(t.fixedPrice>0?fmt$(t.fixedPrice):'—')+'</td>'+
                    '</tr>'
                  ).join('');
              }).join('')+
              '</tbody></table>';
          })()}
        </div>
      </div>
    </div>
    <div class="dash-charts-row" style="margin-top:20px">
      <div class="dash-chart-card">
        <div class="dash-chart-title">
          <span>📋</span> Booking Report — ${_thisMonthLabel}
          <span style="margin-left:8px;font-family:monospace;font-size:13px;color:var(--amber);letter-spacing:0;text-transform:none;font-weight:700">${fmt$(bookingTotal)}</span>
          ${bookingCats.length > 0 ? `
          <div style="display:flex;gap:4px;margin-left:auto">
            <button id="bookingBtnChart" onclick="setBookingView('chart')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--amber-dim);background:var(--amber-glow);color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Chart</button>
            <button id="bookingBtnSummary" onclick="setBookingView('summary')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Summary</button>
            <button id="bookingBtnDetail" onclick="setBookingView('detail')" style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">Detail</button>
          </div>` : ''}
        </div>
        ${bookingCats.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">No tasks entered this month yet.</div>`
          : `<div id="bookingChartWrap"><canvas id="bookingByCatChart" height="120"></canvas></div>
             <div id="bookingSummaryWrap" style="display:none;max-height:400px;overflow-y:scroll">
               <table style="width:100%;border-collapse:collapse;font-size:12px">
                 <thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">
                   <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Sales Category</th>
                   <th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)"># Tasks</th>
                   <th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Total</th>
                 </tr></thead>
                 <tbody>
                   ${bookingCats.map((cat,i) => {
                     const count = bookingDetailTasks.filter(t=>(t.salesCat||'Uncategorized')===cat).length;
                     return '<tr style="border-bottom:1px solid var(--border);background:'+(i%2===1?'var(--surface2)':'')+'">'+
                       '<td style="padding:7px 12px;font-weight:600;color:var(--amber)">Cat '+cat+'</td>'+
                       '<td style="padding:7px 12px;text-align:right;color:var(--muted)">'+count+'</td>'+
                       '<td style="padding:7px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--green)">'+fmt$(bookingByCat[cat])+'</td>'+
                     '</tr>';
                   }).join('')}
                   <tr style="border-top:2px solid var(--border);background:var(--surface2)">
                     <td style="padding:8px 12px;font-weight:700;color:var(--text)">Total</td>
                     <td style="padding:8px 12px;text-align:right;font-weight:700;color:var(--text)">${bookingDetailTasks.length}</td>
                     <td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--amber)">${fmt$(bookingTotal)}</td>
                   </tr>
                 </tbody>
               </table>
             </div>
             <div id="bookingDetailWrap" style="display:none;max-height:400px;overflow-y:scroll">
               ${(() => {
                 const byCat = {};
                 bookingDetailTasks.forEach(t => {
                   const cat = t.salesCat||'Uncategorized';
                   if (!byCat[cat]) byCat[cat] = [];
                   byCat[cat].push(t);
                 });
                 const sortedCatsD = Object.keys(byCat).sort((a,b)=>
                   (byCat[b].reduce((s,t)=>s+(t.fixedPrice||0),0)) - (byCat[a].reduce((s,t)=>s+(t.fixedPrice||0),0))
                 );
                 const statusColors = {new:'var(--muted)',inprogress:'var(--green)',complete:'var(--blue)',billed:'#c084fc',cancelled:'var(--amber)',prohold:'var(--amber)',accthold:'var(--red)'};
                 return '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
                   '<thead><tr style="border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--surface)">'+
                   '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Cat / Task</th>'+
                   '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>'+
                   '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Status</th>'+
                   '<th style="text-align:right;padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Price</th>'+
                   '</tr></thead><tbody>'+
                   sortedCatsD.map(cat => {
                     const tasks = byCat[cat];
                     const catTotal = tasks.reduce((s,t)=>s+(t.fixedPrice||0),0);
                     return '<tr style="background:var(--surface2);border-bottom:1px solid var(--border)">'+
                       '<td colspan="3" style="padding:8px 12px;font-weight:700;color:var(--amber)">Cat '+cat+'</td>'+
                       '<td style="padding:8px 12px;text-align:right;font-family:monospace;font-weight:700;color:var(--amber)">'+fmt$(catTotal)+'</td>'+
                       '</tr>'+
                       tasks.map(t => {
                         const p = projects.find(x=>x.id===t.proj);
                         return '<tr style="border-bottom:1px solid var(--border)">'+
                           '<td style="padding:5px 12px 5px 24px;color:var(--text);font-size:11px">'+t.name+'</td>'+
                           '<td style="padding:5px 12px;color:var(--muted);font-size:11px">'+(p?p.emoji+' '+p.name:'—')+'</td>'+
                           '<td style="padding:5px 12px"><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(statusColors[t.status]||'var(--muted)')+'22;color:'+(statusColors[t.status]||'var(--muted)')+'">'+(t.status||'—')+'</span></td>'+
                           '<td style="padding:5px 12px;text-align:right;font-family:monospace;color:var(--green);font-size:11px">'+(t.fixedPrice>0?fmt$(t.fixedPrice):'—')+'</td>'+
                         '</tr>';
                       }).join('');
                   }).join('')+
                   '</tbody></table>';
               })()}
             </div>`}
      </div>
    </div>

  `;
  // Draw chart after DOM renders
  setTimeout(() => {
    const canv = document.getElementById('billedByMonthChart');
    if (!canv || typeof Chart === 'undefined') return;
    // Destroy existing chart instance if any
    const existing = Chart.getChart(canv);
    if (existing) existing.destroy();

    new Chart(canv, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Billed Revenue',
          data: chartData,
          backgroundColor: chartData.map(v => v > 0 ? 'rgba(76,175,125,0.7)' : 'rgba(122,122,133,0.2)'),
          borderColor:     chartData.map(v => v > 0 ? '#4caf7d' : 'rgba(122,122,133,0.3)'),
          borderWidth: 1.5,
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: (e, els) => {
          if (!els.length) return;
          const idx = els[0].index;
          showBilledAuditModal(chartKeys[idx], chartLabels[idx]);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' $' + ctx.parsed.y.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9a9aaa', font: { size: 10 } }, grid: { display: false } },
          y: {
            ticks: {
              color: '#9a9aaa', font: { size: 10 },
              callback: v => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: true
          }
        }
      },
      plugins: [{
        id: 'barValueLabels',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar, idx) => {
              const val = dataset.data[idx];
              if (!val || val <= 0) return;
              const label = val >= 1000 ? '$' + (val/1000).toFixed(1) + 'k' : '$' + val.toFixed(0);
              ctx.save();
              ctx.fillStyle = '#c8c8d8';
              ctx.font = '600 10px DM Sans, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(label, bar.x, bar.y - 3);
              ctx.restore();
            });
          });
        }
      }]
    });
  ////// ── Sales by Category — stacked by month, category on X axis ──
  setTimeout(() => {
    const catCanv = document.getElementById('salesByCatChart');
    if (!catCanv || typeof Chart === 'undefined') return;
    const existing2 = Chart.getChart(catCanv);
    if (existing2) existing2.destroy();

    // Use billedCatData for accurate totals across ALL projects including closed
    const curYear = new Date().getFullYear();
    // Build catTotals and per-month per-cat from billedCatData
    const catTotals = {};
    const catMonthData = {}; // { cat: { month: amount } }
    Object.entries(window.billedCatData || {}).forEach(([ym, cats]) => {
      const yr = parseInt(ym.slice(0,4));
      const mo = parseInt(ym.slice(5,7)) - 1; // 0-based month
      if (yr !== curYear) return;
      Object.entries(cats).forEach(([cat, amt]) => {
        catTotals[cat] = (catTotals[cat]||0) + amt;
        if (!catMonthData[cat]) catMonthData[cat] = {};
        catMonthData[cat][mo] = (catMonthData[cat][mo]||0) + amt;
      });
    });

    // Month colors Jan–Dec
    const monthColors = [
      'rgba(91,156,246,0.85)',   // Jan — blue
      'rgba(124,92,191,0.85)',   // Feb — purple
      'rgba(76,175,125,0.85)',   // Mar — green
      'rgba(251,146,60,0.85)',   // Apr — orange
      'rgba(232,162,52,0.85)',   // May — amber
      'rgba(224,92,92,0.85)',    // Jun — red
      'rgba(52,211,153,0.85)',   // Jul — teal
      'rgba(167,139,250,0.85)',  // Aug — lavender
      'rgba(251,191,36,0.85)',   // Sep — yellow
      'rgba(156,163,175,0.85)',  // Oct — grey
      'rgba(249,115,22,0.85)',   // Nov — deep orange
      'rgba(59,130,246,0.85)',   // Dec — bright blue
    ];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const _todayMonth = new Date().getMonth(); // 0-based

    const sortedCats = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([k]) => k);

    // Build one dataset per month (only months up to current)
    const datasets = [];
    for (let m = 0; m <= _todayMonth; m++) {
      const data = sortedCats.map(cat => {
        return (catMonthData[cat]?.[m]) || 0;
      });
      datasets.push({
        label: monthNames[m],
        data,
        backgroundColor: monthColors[m],
        borderColor: monthColors[m].replace('0.85','1'),
        borderWidth: 1,
        borderRadius: m === _todayMonth ? 5 : 0,
        borderSkipped: false,
        stack: 'cat'
      });
    }

    new Chart(catCanv, {
      type: 'bar',
      data: { labels: sortedCats, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { color: '#9a9aaa', font: { size: 10 }, boxWidth: 10, padding: 8,
              filter: item => datasets[item.datasetIndex]?.data.some(v => v > 0)
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + ctx.dataset.label + ': $' + ctx.parsed.y.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
            }
          }
        },
        scales: {
          x: { stacked: true, ticks: { color: '#9a9aaa', font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true,
            ticks: { color: '#9a9aaa', font: { size: 10 }, callback: v => v >= 1000 ? '$'+(v/1000).toFixed(0)+'k' : '$'+v },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      },
      plugins: [{
        id: 'catStackTotals',
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const meta0 = chart.getDatasetMeta(chart.data.datasets.length - 1);
          meta0.data.forEach((bar, idx) => {
            const total = chart.data.datasets.reduce((s, ds) => s + (ds.data[idx]||0), 0);
            if (!total) return;
            const lbl = total >= 1000 ? '$'+(total/1000).toFixed(1)+'k' : '$'+total.toFixed(0);
            ctx.save();
            ctx.fillStyle = '#c8c8d8'; ctx.font = '600 10px DM Sans,sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(lbl, bar.x, bar.y - 3);
            ctx.restore();
          });
        }
      }]
    });


    // ── Backlog Gauge ──
    window._drawBacklogGauge = function() {
      const c = document.getElementById('backlogGaugeChart');
      if (!c) return;
      // Destroy any existing Chart.js instance
      const existing = Chart.getChart(c);
      if (existing) existing.destroy();

      const W = c.width, H = c.height;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, W, H);

      const MAX1 = 1000000, MAX2 = 2000000;
      const val = backlogTotal;
      const pct = Math.min(val / MAX2, 1);

      const cx = W / 2, cy = H - 20;
      const r = Math.min(W, H * 2) / 2 - 30;
      const startA = Math.PI, endA = 0; // left to right

      // Background arc
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, 0, false);
      ctx.lineWidth = 28;
      ctx.strokeStyle = 'rgba(128,128,140,0.15)';
      ctx.stroke();

      // Red segment (0 to $1M)
      const midA = Math.PI * (1 - 0.5); // 50% = $1M
      const valA  = Math.PI * (1 - pct);
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI, pct <= 0.5 ? valA : midA, false);
      ctx.lineWidth = 28;
      ctx.strokeStyle = '#e05c5c';
      ctx.stroke();

      // Green segment ($1M to value)
      if (pct > 0.5) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, midA, valA, false);
        ctx.lineWidth = 28;
        ctx.strokeStyle = '#4caf7d';
        ctx.stroke();
      }

      // Tick labels
      const ticks = [{p:0,lbl:'$0'},{p:0.5,lbl:'$1M'},{p:1,lbl:'$2M'}];
      ticks.forEach(({p, lbl}) => {
        const a = Math.PI * (1 - p);
        const tx = cx + Math.cos(a) * (r + 22);
        const ty = cy - Math.sin(a) * (r + 22);
        ctx.save();
        ctx.fillStyle = '#9a9aaa';
        ctx.font = '600 11px DM Sans,sans-serif';
        ctx.textAlign = p === 0 ? 'right' : p === 1 ? 'left' : 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, tx, ty);
        ctx.restore();
      });

      // Needle
      const needleA = Math.PI * (1 - pct);
      const needleLen = r - 16;
      const nx = cx + Math.cos(needleA) * needleLen;
      const ny = cy - Math.sin(needleA) * needleLen;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(needleA + Math.PI/2) * 5, cy - Math.sin(needleA + Math.PI/2) * 5);
      ctx.lineTo(nx, ny);
      ctx.lineTo(cx + Math.cos(needleA - Math.PI/2) * 5, cy - Math.sin(needleA - Math.PI/2) * 5);
      ctx.closePath();
      ctx.fillStyle = '#e8e8f0';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 5;
      ctx.fill();
      ctx.restore();

      // Hub
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#e8e8f0';
      ctx.fill();

      // Value label
      const lbl = val >= 1000000 ? '$' + (val/1000000).toFixed(2) + 'M' : '$' + Math.round(val).toLocaleString();
      ctx.save();
      ctx.fillStyle = val < MAX1 ? '#e05c5c' : '#4caf7d';
      ctx.font = 'bold 15px DM Sans,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(lbl, cx, cy - r * 0.3);
      ctx.restore();
    };
    window._drawBacklogGauge();

    // ── Backlog by Category bar chart ──
    window._drawBacklogByCat = function() {
      const catCanv = document.getElementById('backlogByCatChart');
      if (!catCanv || typeof Chart === 'undefined') return;
      const existing = Chart.getChart(catCanv);
      if (existing) existing.destroy();

      // Build cat totals from backlogDetailTasks
      const catTotals = {};
      backlogDetailTasks.forEach(t => {
        const cat = t.salesCat || 'Uncategorized';
        catTotals[cat] = (catTotals[cat] || 0) + (t.fixedPrice || 0);
      });
      const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
      const labels = sorted.map(([k]) => k);
      const data   = sorted.map(([, v]) => v);
      const BCOLORS = ['#5b9cf6','#a78bfa','#e8a234','#4caf7d','#e05c5c','#f472b6',
                       '#34d399','#fb923c','#60a5fa','#c084fc','#facc15','#2dd4bf',
                       '#7c3aed','#db2777','#059669','#d97706'];

      new Chart(catCanv, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map((_, i) => BCOLORS[i % BCOLORS.length] + 'cc'),
            borderColor:     labels.map((_, i) => BCOLORS[i % BCOLORS.length]),
            borderWidth: 1,
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ' $' + ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})
              }
            }
          },
          scales: {
            x: { ticks: { color: '#9a9aaa', font: { size: 11 } }, grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: {
                color: '#9a9aaa', font: { size: 10 },
                callback: v => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        },
        plugins: [{
          id: 'backlogCatLabels',
          afterDatasetsDraw(chart) {
            const ctx2 = chart.ctx;
            chart.getDatasetMeta(0).data.forEach((bar, idx) => {
              const val = data[idx];
              if (!val) return;
              const lbl = val >= 1000 ? '$' + (val/1000).toFixed(1) + 'k' : '$' + val.toFixed(0);
              ctx2.save();
              ctx2.fillStyle = '#c8c8d8';
              ctx2.font = '600 10px DM Sans, sans-serif';
              ctx2.textAlign = 'center';
              ctx2.textBaseline = 'bottom';
              ctx2.fillText(lbl, bar.x, bar.y - 3);
              ctx2.restore();
            });
          }
        }]
      });
    };

  }, 120);

  // ── Booking Report chart ─────────────────────────────────────────────
  setTimeout(() => {
    const bookCanv = document.getElementById('bookingByCatChart');
    if (!bookCanv || typeof Chart === 'undefined' || bookingCats.length === 0) return;
    const existingB = Chart.getChart(bookCanv);
    if (existingB) existingB.destroy();
    const COLORS = ['#5b9cf6','#a78bfa','#e8a234','#4caf7d','#e05c5c','#f472b6',
                    '#34d399','#fb923c','#60a5fa','#c084fc','#facc15','#2dd4bf',
                    '#7c3aed','#db2777','#059669','#d97706'];
    new Chart(bookCanv, {
      type: 'bar',
      data: {
        labels: bookingCats,
        datasets: [{
          data: bookingCats.map(c => bookingByCat[c]),
          backgroundColor: bookingCats.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
          borderColor:     bookingCats.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' $' + ctx.parsed.y.toLocaleString('en-US', {minimumFractionDigits:0,maximumFractionDigits:0})
            }
          }
        },
        scales: {
          x: {
            ticks: { color: 'var(--muted)', font: { size: 11 } },
            grid:  { color: 'rgba(128,128,128,0.1)' }
          },
          y: {
            ticks: {
              color: 'var(--muted)', font: { size: 11 },
              callback: v => '$' + (v>=1000 ? (v/1000).toFixed(0)+'k' : v)
            },
            grid: { color: 'rgba(128,128,128,0.1)' }
          }
        }
      }
    });
  }, 150);

}, 80);
}

function _setView3(prefix, view) {
  const views = ['chart','summary','detail'];
  views.forEach(v => {
    const wrap = document.getElementById(prefix + v.charAt(0).toUpperCase()+v.slice(1) + 'Wrap');
    const btn  = document.getElementById(prefix + 'Btn' + v.charAt(0).toUpperCase()+v.slice(1));
    if (wrap) wrap.style.display = v === view ? '' : 'none';
    if (btn) {
      const active = v === view;
      btn.style.background   = active ? 'var(--amber-glow)' : 'transparent';
      btn.style.color        = active ? 'var(--amber)' : 'var(--muted)';
      btn.style.borderColor  = active ? 'var(--amber-dim)' : 'var(--border)';
    }
  });
  // For backlog chart, destroy and redraw fresh so canvas sizes correctly
  if (prefix === 'backlog' && view === 'chart') {
    setTimeout(() => {
      if (typeof _drawBacklogGauge === 'function') _drawBacklogGauge();
    }, 50);
  }
}
function setSalesView(view)   { _setView3('sales', view); }
function setBacklogView(view) {
  const allViews = ['chart', 'cat', 'summary', 'detail'];
  allViews.forEach(v => {
    const wrap = document.getElementById('backlog' + v.charAt(0).toUpperCase() + v.slice(1) + 'Wrap');
    const btn  = document.getElementById('backlogBtn' + v.charAt(0).toUpperCase() + v.slice(1));
    if (wrap) wrap.style.display = v === view ? '' : 'none';
    if (btn) {
      const active = v === view;
      btn.style.background  = active ? 'var(--amber-glow)' : 'transparent';
      btn.style.color       = active ? 'var(--amber)' : 'var(--muted)';
      btn.style.borderColor = active ? 'var(--amber-dim)' : 'var(--border)';
    }
  });
  if (view === 'chart'  && typeof _drawBacklogGauge  === 'function') setTimeout(() => _drawBacklogGauge(),  50);
  if (view === 'cat'    && typeof _drawBacklogByCat   === 'function') setTimeout(() => _drawBacklogByCat(),  50);
}
function setBookingView(view) { _setView3('booking', view); }


async function editProjectName(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  const newName = window.prompt('Edit project name:', proj.name);
  if (!newName || !newName.trim() || newName.trim() === proj.name) return;
  proj.name = newName.trim();
  if (sb) await sb.from('projects').update({ name: proj.name }).eq('id', projId);
  document.getElementById('topbarName').textContent = (proj.emoji||'') + ' ' + proj.name;
  renderProjStickyHeader(projId);
  toast('Project name updated');
}

// Helper — select a project by id and navigate to its info sheet
function selectProjectById(id) {
  activeProjectId = id;
  const p = projects.find(x => x.id === id);
  if (!p) return;

  document.getElementById('topbarName').textContent = p.emoji + ' ' + p.name;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navProjects')?.classList.add('active');
  showProjectView('panel-info');

  const info = projectInfo[id];
  const isClosed = !info || info.status === 'closed';
  if (isClosed && !_loadedClosedProjects.has(id)) {
    const infoWrap = document.getElementById('infoWrap');
    if (infoWrap) infoWrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px;">&#x23F3; Loading project data…</div>';
    loadClosedProject(id).then(() => {
      renderInfoSheet(id);
      renderProjStickyHeader(id);
      switchProjTab('sub-info');
    });
  } else {
    renderAllViews();
    renderInfoSheet(id);
    renderProjStickyHeader(id);
    switchProjTab('sub-info');
  }
}


