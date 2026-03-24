
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
  // Start with billedMonthlyData (covers ALL projects including closed) as the base,
  // then overlay open-project tasks from taskStore to catch anything not yet in the summary.
  const totalBilledAllProjects = Object.values(projectInfo).reduce((s, p) => s + (p.billedRevenue||0), 0);
  const monthMap = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    // Seed with pre-aggregated summary (includes closed projects)
    monthMap[key] = { label: d.toLocaleDateString('en-US',{month:'short', year:'2-digit'}), val: window.billedMonthlyData?.[key] || 0 };
  }
  // For open projects, recalculate from taskStore directly to stay accurate in real time.
  // We replace the summary value for any month that has open-project billed tasks,
  // since the summary may lag or double-count newly billed items.
  const _openProjIdSet = new Set(projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').map(p => p.id));
  const billedTasks = taskStore.filter(t => t.status === 'billed' && _openProjIdSet.has(t.proj));
  const todayStr = new Date().toISOString().split('T')[0];
  // Build open-project totals per month
  const openMonthTotals = {};
  billedTasks.forEach(t => {
    const dateStr = t.billedDate || t.completedDate || todayStr;
    const d = new Date(dateStr + 'T00:00:00');
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    if (monthMap[key]) openMonthTotals[key] = (openMonthTotals[key] || 0) + (t.fixedPrice || 0);
  });
  // Merge: for months with open-project data, add to the closed-project base
  // The summary already includes closed projects; we add open project actuals on top
  Object.entries(openMonthTotals).forEach(([key, openTotal]) => {
    // Get closed-project portion from summary
    const closedPortion = (window.billedMonthlyData?.[key] || 0);
    // Replace with: closed summary + open taskStore actuals
    if (monthMap[key]) monthMap[key].val = closedPortion + openTotal;
  });
  const chartLabels  = Object.values(monthMap).map(m => m.label);
  const chartData    = Object.values(monthMap).map(m => m.val);
  const chartKeys    = Object.keys(monthMap); // e.g. ['2025-03', ...]
  const totalBilled  = chartData[chartData.length - 1] || 0; // current month from chart
  // Note: totalBilledAllProjects is the accurate all-time total across all projects
  // Sum ALL billed tasks directly — not just those with a date
  const _openProjIds = new Set(projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed').map(p => p.id));
  const readyToBill  = taskStore.filter(t => t.status === 'complete' && _openProjIds.has(t.proj)).reduce((s,t) => s + (t.fixedPrice||0), 0);
  const fmt$ = n => '$' + (n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

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
        <div class="dash-chart-title"><span>💰</span> Billed Revenue <span style="margin-left:auto;font-size:13px;font-family:'JetBrains Mono',monospace;color:var(--green);letter-spacing:0;text-transform:none;font-weight:700">${fmt$(totalBilled)} this month</span><span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#c084fc;letter-spacing:0;text-transform:none;font-weight:600;margin-left:12px">${fmt$(readyToBill)} ready to bill</span></div>
        <canvas id="billedByMonthChart" height="110"></canvas>
      </div>
    </div>

    <div class="dash-charts-row" style="margin-top:20px">
      <div class="dash-chart-card">
        <div class="dash-chart-title"><span>📊</span> Sales by Category</div>
        <canvas id="salesByCatChart" height="140"></canvas>
      </div>
    </div>

    <div class="dash-charts-row" style="margin-top:20px">
      <div class="dash-chart-card" style="display:flex;flex-direction:column;align-items:center;padding-bottom:12px">
        <div class="dash-chart-title" style="width:100%"><span>📦</span> Backlog <span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:15px;color:var(--text);letter-spacing:0;text-transform:none;font-weight:700">${fmt$(backlogTotal)}</span><span style="font-size:11px;color:var(--muted);letter-spacing:0;text-transform:none;font-weight:400;margin-left:8px">excl. billed</span></div>
        <canvas id="backlogGaugeChart" height="160" style="max-width:500px"></canvas>
        <div style="display:flex;gap:24px;margin-top:-8px;font-size:11px;color:var(--muted)">
          <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#e05c5c;display:inline-block"></span>$0 – $1M</span>
          <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#4caf7d;display:inline-block"></span>$1M – $2M</span>
        </div>
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
    const gaugeCanv = document.getElementById('backlogGaugeChart');
    if (gaugeCanv) {
      const existingG = Chart.getChart(gaugeCanv);
      if (existingG) existingG.destroy();

      const MAX1 = 1000000;   // $1M threshold (red zone end)
      const MAX2 = 2000000;   // $2M threshold (green zone end)
      const val  = backlogTotal;
      const clampedVal = Math.min(val, MAX2);
      const seg1 = Math.min(clampedVal, MAX1);         // red portion
      const seg2 = Math.max(0, clampedVal - MAX1);     // green portion
      const empty = MAX2 - clampedVal;                  // unfilled

      new Chart(gaugeCanv, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [seg1, seg2, empty],
            backgroundColor: ['#e05c5c', '#4caf7d', 'rgba(255,255,255,0.07)'],
            borderWidth: 0,
            circumference: 180,
            rotation: 270,
          }]
        },
        options: {
          responsive: true,
          cutout: '68%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 900, easing: 'easeOutQuart' }
        },
        plugins: [{
          id: 'gaugeTicks',
          afterDraw(chart) {
            const { ctx, chartArea: { left, right, bottom } } = chart;
            const cx = (left + right) / 2;
            const cy = bottom;
            const outerR = (right - left) / 2;
            const labelR = outerR * 1.08;

            const ticks = [
              { pct: 0,   label: '$0'  },
              { pct: 0.5, label: '$1M' },
              { pct: 1,   label: '$2M' },
            ];
            ticks.forEach(({ pct, label }) => {
              const angle = Math.PI * (1 - pct);  // 180°→0° left to right
              const tx = cx + Math.cos(angle) * labelR;
              const ty = cy - Math.sin(angle) * labelR;
              ctx.save();
              ctx.fillStyle = '#9a9aaa';
              ctx.font = '600 10px DM Sans,sans-serif';
              ctx.textAlign = pct === 0 ? 'right' : pct === 1 ? 'left' : 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label, tx, ty);
              ctx.restore();
            });
          }
        }]
      });
    }
    if (gaugeCanv) {
      const existingG = Chart.getChart(gaugeCanv);
      if (existingG) existingG.destroy();

      const MAX1 = 1000000;  // 0-1M red
      const MAX2 = 2000000;  // 1M-2M green
      const val  = Math.min(backlogTotal, MAX2);
      const seg1 = Math.min(val, MAX1);
      const seg2 = Math.max(0, val - MAX1);
      const empty = MAX2 - val;

      new Chart(gaugeCanv, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [seg1, seg2, empty],
            backgroundColor: ['#e05c5c', '#4caf7d', 'rgba(255,255,255,0.06)'],
            borderWidth: 0,
            circumference: 180,
            rotation: -90,
          }]
        },
        options: {
          responsive: false,
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          animation: { duration: 800, easing: 'easeOutQuart' }
        },
        plugins: [{
          id: 'gaugeNeedle',
          afterDraw(chart) {
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const cx = (left + right) / 2;
            const cy = bottom;
            const r  = (right - left) / 2 * 0.78;
            const pct = Math.min(val / MAX2, 1);
            const angle = Math.PI * (1 - pct);  // 180deg = left (0), 0deg = right (MAX)
            // Tick marks at 0, 1M, 2M
            [[0,'$0'],[0.5,'$1M'],[1,'$2M']].forEach(([p, lbl]) => {
              const a = Math.PI * (1 - p);
              const tx = cx + Math.cos(a) * (r * 1.18);
              const ty = cy - Math.sin(a) * (r * 1.18);
              ctx.save();
              ctx.fillStyle = '#9a9aaa';
              ctx.font = '600 9px DM Sans,sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(lbl, tx, ty);
              ctx.restore();
            });
          }
        }]
      });
    }
  }, 120);

}, 80);
}

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

  const info   = projectInfo[id];
  const status = info ? info.status : 'active';
  const CLOSED = ['closed','complete','cancelled','billed'];
  const isClosed = CLOSED.includes(status) || !info;

  if (isClosed && !_loadedClosedProjects.has(id)) {
    // Show skeleton while loading
    const infoWrap = document.getElementById('panel-info');
    if (infoWrap) infoWrap.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:13px;">&#x23F3; Loading project data…</div>';
    loadClosedProject(id).then(() => {
      renderAllViews();
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


