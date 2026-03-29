
// ===== SUPABASE CONFIG =====
// ===== SUPABASE CONFIG =====
// Paste your Project URL and anon key from supabase.com → Project Settings → API
const SUPABASE_URL = localStorage.getItem('nuworkspace_sb_url') || 'https://swuuxzmgmldvvomsgmjf.supabase.co';
const SUPABASE_KEY = localStorage.getItem('nuworkspace_sb_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dXV4em1nbWxkdnZvbXNnbWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjcyMzMsImV4cCI6MjA4ODQwMzIzM30.GinbXqvBHcvYRaACBhgpd_Si8-qIDDj7PlbTCINcSU8';

let sb = null; // Supabase client

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) { return false; }
}


// ===== DB HELPERS =====
// ===== DB HELPERS =====
async function dbFetch(table, query) {
  if (!sb) return [];
  const PAGE = 1000;
  let all = [], page = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(query || '*')
      .order('created_at', {ascending: true})
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) { console.error(table, error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

async function dbInsert(table, row) {
  if (!sb) return null;
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) { console.error('insert', table, error); return null; }
  return data;
}

async function dbUpdate(table, id, updates) {
  if (!sb) return;
  // project_info uses project_id as its key, not id
  const keyCol = table === 'project_info' ? 'project_id' : 'id';
  const { error } = await sb.from(table).update(updates).eq(keyCol, id);
  if (error) console.error('update', table, id, error);
}

async function dbDelete(table, id) {
  if (!sb) return;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) console.error('delete', table, error);
}


// ===== LOAD ALL DATA =====
// ===== LOAD ALL DATA =====
let _dashResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_dashResizeTimer);
  _dashResizeTimer = setTimeout(() => {
    const dashPanel = document.getElementById('panel-dashboard');
    if (dashPanel && dashPanel.classList.contains('active')) {
      renderDashboard();
    }
  }, 150);
});

// Track which closed projects have been lazy-loaded this session
const _loadedClosedProjects = new Set();

async function loadAllData() {
  showAppLoader(true);
  try {
    // Helper: paginate any table with optional filter
    async function fetchAllPages(table, selectCols, orderCol, filterFn) {
      let rows = [], page = 0;
      while (true) {
        let q = sb.from(table).select(selectCols).range(page * 1000, page * 1000 + 999);
        if (orderCol) q = q.order(orderCol, { ascending: true });
        if (filterFn)  q = filterFn(q);
        const { data } = await q;
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      return rows;
    }

    // Load timesheet data from Jan 1 2020 onward at startup; pre-2020 loaded on demand per project
    const tsWeekCutoff = new Date('2020-01-01');
    const tsCutoffStr = tsWeekCutoff.toISOString().split('T')[0];

    // Phase 1: load projects and project_info first so we can filter tasks by open projects
    const [projRows, infoRows] = await Promise.all([
      fetchAllPages('projects',     '*', 'created_at'),
      fetchAllPages('project_info', '*', null, null),
    ]);

    // Get open project IDs (everything except closed)
    const openProjInfoMap = {};
    infoRows.forEach(r => { openProjInfoMap[r.project_id] = r.status || 'active'; });
    const openProjIds = projRows
      .filter(p => (openProjInfoMap[p.id] || 'active') !== 'closed')
      .map(p => p.id);

    // Phase 2: load remaining tables in parallel, filtering tasks to open projects only
    const [taskRows, empRows, clientRows, contactRows, expRows, , sectionRows, roleRows, billedMonthlyRows, billedCatRows, articleRows] = await Promise.all([
      (async () => {
        // Only load tasks for open projects (145 open vs 2252 closed)
        let rows = [], page = 0;
        while (true) {
          const { data } = await sb.from('tasks').select('*')
            .in('project_id', openProjIds)
            .range(page * 1000, page * 1000 + 999);
          if (!data || data.length === 0) break;
          rows = rows.concat(data);
          if (data.length < 1000) break;
          page++;
        }
        return rows;
      })(),
      dbFetch('employees'),
      dbFetch('clients'),
      dbFetch('contacts'),
      fetchAllPages('expenses',       '*', null,  null),  // expenses are small, load all
      Promise.resolve([]), // placeholder — timesheets loaded separately below
      fetchAllPages('task_sections',  '*', null,  null),
      fetchAllPages('permission_roles','*', null, null),
      (async () => {
        let rows = [], page = 0;
        while (true) {
          const { data } = await sb.from('billed_revenue_monthly').select('*')
            .range(page * 1000, page * 1000 + 999);
          if (!data || data.length === 0) break;
          rows = rows.concat(data);
          if (data.length < 1000) break;
          page++;
        }
        return rows;
      })(),
      (async () => {
        let rows = [], page = 0;
        while (true) {
          const { data } = await sb.from('billed_revenue_by_category').select('*')
            .range(page * 1000, page * 1000 + 999);
          if (!data || data.length === 0) break;
          rows = rows.concat(data);
          if (data.length < 1000) break;
          page++;
        }
        return rows;
      })(),
      fetchAllPages('test_articles', '*', 'created_at'),
    ]);

    // Projects
    projects = projRows.map(r => ({
      id: r.id, name: r.name, color: r.color, emoji: r.emoji, desc: r.description || '', description: r.description || ''
    }));

    // Project info
    const loadedProjectIds = new Set(infoRows.map(r => r.project_id));
    infoRows.forEach(r => {
      projectInfo[r.project_id] = {
        pm: r.pm||'', po: r.po_number||'', contract: r.contract_amount||'',
        phase: r.phase||'Waiting on TP Approval', status: r.status||'active',
        startDate: r.start_date||'', endDate: r.end_date||'', tentativeTestDate: r.tentative_test_date||'',
        client: r.client||'', clientContact: r.client_contact||'',
        clientEmail: r.client_email||'', clientPhone: r.client_phone||'',
        clientId: r.client_id||null, contactId: r.contact_id||null,
        billingType: r.billing_type||'Fixed Fee', invoiced: r.invoiced||'',
        remaining: r.remaining||'', notes: r.notes||'', desc: r.description||'',
        dcas: r.dcas||'', customerWitness: r.customer_witness||'', tpApproval: r.tp_approval||'', dpas: r.dpas||'', noforn: r.noforn||'',
        testDesc: r.test_description||'', testArticleDesc: r.test_article_description||'', quoteNumber: r.quote_number||'',
        creditHold: r.credit_hold||false,
        needUpdatedPo: r.need_updated_po||false,
        testcompleteDate: r.testcomplete_date||'',
        billedRevenue: r.billed_revenue ? parseFloat(r.billed_revenue) : 0,
        expectedRevenue: r.expected_revenue ? parseFloat(r.expected_revenue) : 0,
        actualHours: r.actual_hours ? parseFloat(r.actual_hours) : 0,
      };
    });

    // Billed monthly summary (for accurate chart across all projects including closed)
    window.billedMonthlyData = {};
    billedMonthlyRows.forEach(r => {
      if (!window.billedMonthlyData[r.year_month]) window.billedMonthlyData[r.year_month] = 0;
      window.billedMonthlyData[r.year_month] += parseFloat(r.amount) || 0;
    });

    // Billed by category summary — DB table is the source of truth (covers all projects
    // including closed). Kept accurate going forward by _applyBilledCatDelta().
    window.billedCatData = {}; // { 'YYYY-MM': { cat: amount } }
    billedCatRows.forEach(r => {
      if (!window.billedCatData[r.year_month]) window.billedCatData[r.year_month] = {};
      window.billedCatData[r.year_month][r.sales_category || 'Uncategorized'] =
        (window.billedCatData[r.year_month][r.sales_category || 'Uncategorized'] || 0) + (parseFloat(r.amount) || 0);
    });

    // Tasks
    taskStore = taskRows.map(r => ({
      _id: r.id, taskNum: r.task_num||0, name: r.name, assign: r.assignee||'',
      due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
      due_raw: r.due_date||'',
      overdue: r.due_date ? new Date(r.due_date+'T00:00:00') < new Date() && !r.done : false,
      done: r.done||false, proj: r.project_id||'',
      status: r.status||'new', priority: r.priority||'medium',
      section: r.section||'sprint',
      sectionId: r.section_id||null,
      salesCat: r.sales_category||'',
      fixedPrice: r.fixed_price ? parseFloat(r.fixed_price) : 0,
      budgetHours: r.budget_hours ? parseFloat(r.budget_hours) : 0,
      taskStartDate: r.task_start_date||'',
      completedDate: r.completed_date||'',
      billedDate: r.billed_date||'',
      quoteNum: r.quote_number||'',
      poNumber: r.po_number||'',
      peachtreeInv: r.peachtree_inv||'',
      createdAt: r.created_at ? r.created_at.split('T')[0] : '',
      revenueType: r.revenue_type||'fixed',
    }));

    // Task Sections
    sectionStore = sectionRows.map(r => ({
      _id: r.id, projId: r.project_id, name: r.name,
      taskNum: r.task_num||0, collapsed: r.collapsed||false,
    }));

    // Permission Roles
    permissionRoles = (roleRows||[]).map(r => ({
      id: r.id, name: r.name, description: r.description||'',
      capabilities: r.capabilities||{}, sortOrder: r.sort_order||0,
    })).sort((a,b) => a.sortOrder - b.sortOrder);

    // Assign task_num per project
    const projTaskNums = {};
    taskStore.forEach(t => {
      if (!projTaskNums[t.proj]) projTaskNums[t.proj] = 0;
      if (!t.taskNum) {
        projTaskNums[t.proj]++;
        t.taskNum = projTaskNums[t.proj];
      } else {
        projTaskNums[t.proj] = Math.max(projTaskNums[t.proj], t.taskNum);
      }
    });
    window._projTaskNums = projTaskNums;

    // Employees
    employees = empRows.map(r => ({
      id: r.id, name: r.name, initials: r.initials||getInitials(r.name),
      role: r.role||'', dept: r.department||'',
      email: r.email||'', personalEmail: r.personal_email||'', phone: r.phone||'', color: r.color||'#5b9cf6',
      isApprover: r.is_approver||false, isPaperTs: r.is_paper_ts||false, approverId: r.approver_id||null,
      hireDate: r.hire_date||'',
      permissionLevel: r.permission_level||'employee',
      roleId: r.role_id||null,
      empType: r.employment_type||'fulltime',
      sickBank: parseFloat(r.sick_bank)||0,
      vacBank: parseFloat(r.vac_bank)||0,
      isOwner: !!r.is_owner,
      isActive: r.is_active !== false,
      terminationDate: r.termination_date||'',
    }));

    // Clients & Contacts
    clientStore = clientRows.map(r => ({
      id: r.id, name: r.name||'',
      address: r.address||'', city: r.city||'', state: r.state||'',
      zip: r.zip||'', phone: r.phone||'', website: r.website||'', notes: r.notes||''
    }));
    contactStore = contactRows.map(r => ({
      id: r.id, clientId: r.client_id||null,
      firstName: r.first_name||'', lastName: r.last_name||'',
      email: r.email||''
    }));

    // Expenses
    expenseStore = expRows.map(r => ({
      _id: r.id, projId: r.proj_id,
      taskId: r.task_id||null,
      name: r.name||'', planned: r.planned_amount ? parseFloat(r.planned_amount) : 0,
      actual: r.actual_cost ? parseFloat(r.actual_cost) : 0,
    }));

    // Test Articles
    articleStore = (articleRows || []).map(mapArticle);

    // Timesheet — loaded sequentially AFTER other queries, with count-based pagination
    // to guarantee all rows are fetched regardless of Supabase rate limiting
    const tsRows = await (async () => {
      // First get the exact count so we know how many pages to fetch
      const { count } = await sb.from('timesheet_entries')
        .select('*', { count: 'exact', head: true })
        .gte('week_start', tsCutoffStr);
      const totalPages = Math.ceil((count || 0) / 1000);
      let rows = [];
      for (let page = 0; page < totalPages; page++) {
        let data = null;
        // Retry up to 3 times per page
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await sb.from('timesheet_entries').select('*')
            .gte('week_start', tsCutoffStr)
            .order('id', { ascending: true })
            .range(page * 1000, page * 1000 + 999);
          if (res.data && res.data.length > 0) { data = res.data; break; }
          await new Promise(r => setTimeout(r, 300));
        }
        if (data) rows = rows.concat(data);
      }
      return rows;
    })();

    // Timesheet
    tsRows.forEach(r => {
      const empId = r.employee_id || '__unknown__';
      const storeKey = empId + '|' + r.week_start;
      if (r.is_overhead && r.overhead_cat) {
        const ohKey = 'oh_' + storeKey;
        if (!tsData[ohKey]) tsData[ohKey] = {};
        tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
      } else {
        if (!tsData[storeKey]) tsData[storeKey] = [];
        tsData[storeKey].push({
          _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
          isOverhead: r.is_overhead||false, overheadCat: r.overhead_cat||'',
          hours: JSON.parse(r.hours_json||'{}'),
        });
      }
    });

  } catch(e) { console.error('loadAllData', e); }
  showAppLoader(false);
  bootApp();
}

function showAppLoader(show) {
  document.getElementById('appLoader').style.display = show ? 'flex' : 'none';
  document.getElementById('appShell').style.display  = show ? 'none'  : 'flex';
}

function bootApp() {
  renderSidebarTeam();
  renderProjectNav();
  rebuildProjDropdown();
  renderAllViews();
  if (activeProjectId && projects.find(p => p.id === activeProjectId)) {
    selectProjectById(activeProjectId);
  } else {
    openDashboardPanel(document.getElementById('navDashboard'));
  }
}

// Lazy-load a closed project's tasks, expenses, and info on demand
async function loadClosedProject(projId) {
  if (_loadedClosedProjects.has(projId)) return; // already loaded this session
  _loadedClosedProjects.add(projId);

  try {
    // Show subtle loading indicator on project panel
    const loadingEl = document.getElementById('panel-project');
    if (loadingEl) loadingEl.style.opacity = '0.6';

    const [infoRows, taskRows, expRows, sectionRows, tsRows] = await Promise.all([
      sb.from('project_info').select('*').eq('project_id', projId).then(r => r.data || []),
      sb.from('tasks').select('*').eq('project_id', projId).then(r => r.data || []),
      sb.from('expenses').select('*').eq('proj_id', projId).then(r => r.data || []),
      sb.from('task_sections').select('*').eq('project_id', projId).then(r => r.data || []),
      sb.from('timesheet_entries').select('*').eq('project_id', projId).then(r => r.data || []),
    ]);

    // Merge project_info
    infoRows.forEach(r => {
      projectInfo[r.project_id] = {
        pm: r.pm||'', po: r.po_number||'', contract: r.contract_amount||'',
        phase: r.phase||'Waiting on TP Approval', status: r.status||'active',
        startDate: r.start_date||'', endDate: r.end_date||'', tentativeTestDate: r.tentative_test_date||'',
        client: r.client||'', clientContact: r.client_contact||'',
        clientEmail: r.client_email||'', clientPhone: r.client_phone||'',
        clientId: r.client_id||null, contactId: r.contact_id||null,
        billingType: r.billing_type||'Fixed Fee', invoiced: r.invoiced||'',
        remaining: r.remaining||'', notes: r.notes||'', desc: r.description||'',
        dcas: r.dcas||'', customerWitness: r.customer_witness||'',
        tpApproval: r.tp_approval||'', dpas: r.dpas||'', noforn: r.noforn||'',
        testDesc: r.test_description||'', testArticleDesc: r.test_article_description||'',
        quoteNumber: r.quote_number||'', creditHold: r.credit_hold||false,
        needUpdatedPo: r.need_updated_po||false, testcompleteDate: r.testcomplete_date||'',
        billedRevenue: r.billed_revenue ? parseFloat(r.billed_revenue) : 0,
        expectedRevenue: r.expected_revenue ? parseFloat(r.expected_revenue) : 0,
        actualHours: r.actual_hours ? parseFloat(r.actual_hours) : 0,
      };
    });

    // Merge tasks (avoid duplicates)
    const existingIds = new Set(taskStore.map(t => t._id));
    taskRows.forEach(r => {
      if (existingIds.has(r.id)) return;
      taskStore.push({
        _id: r.id, taskNum: r.task_num||0, name: r.name, assign: r.assignee||'',
        due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
        due_raw: r.due_date||'', overdue: false, done: r.done||false,
        proj: r.project_id||'', status: r.status||'new', priority: r.priority||'medium',
        section: r.section||'sprint', sectionId: r.section_id||null,
        salesCat: r.sales_category||'',
        fixedPrice: r.fixed_price ? parseFloat(r.fixed_price) : 0,
        budgetHours: r.budget_hours ? parseFloat(r.budget_hours) : 0,
        taskStartDate: r.task_start_date||'', completedDate: r.completed_date||'',
        billedDate: r.billed_date||'', quoteNum: r.quote_number||'',
        poNumber: r.po_number||'', peachtreeInv: r.peachtree_inv||'',
        createdAt: r.created_at ? r.created_at.split('T')[0] : '',
        revenueType: r.revenue_type||'fixed',
      });
    });

    // Merge expenses
    const existingExpIds = new Set(expenseStore.map(e => e._id));
    expRows.forEach(r => {
      if (existingExpIds.has(r.id)) return;
      expenseStore.push({
        _id: r.id, projId: r.proj_id, taskId: r.task_id||null,
        name: r.name||'', planned: r.planned_amount ? parseFloat(r.planned_amount) : 0,
        actual: r.actual_cost ? parseFloat(r.actual_cost) : 0,
      });
    });

    // Merge timesheet rows into tsData so Hours tab works
    tsRows.forEach(r => {
      const empId = r.employee_id || '__unknown__';
      const storeKey = empId + '|' + r.week_start;
      if (r.is_overhead && r.overhead_cat) {
        const ohKey = 'oh_' + storeKey;
        if (!tsData[ohKey]) tsData[ohKey] = {};
        tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
      } else {
        if (!tsData[storeKey]) tsData[storeKey] = [];
        if (!tsData[storeKey].find(x => x._id === r.id)) {
          tsData[storeKey].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            isOverhead: false, overheadCat: '',
            hours: JSON.parse(r.hours_json||'{}'),
          });
        }
      }
    });

    // Merge task sections
    const existingSectionIds = new Set(sectionStore.map(s => s._id));
    sectionRows.forEach(r => {
      if (existingSectionIds.has(r.id)) return;
      sectionStore.push({ _id: r.id, projId: r.project_id, name: r.name, taskNum: r.task_num||0, collapsed: r.collapsed||false });
    });

    if (loadingEl) loadingEl.style.opacity = '1';
  } catch(e) {
    console.error('loadClosedProject failed:', e);
    _loadedClosedProjects.delete(projId); // allow retry
  }
}


// Track which projects have had full timesheet history loaded (pre-2020)
const _loadedFullTsProjects = new Set();

async function loadFullProjectTimesheets(projId) {
  if (_loadedFullTsProjects.has(projId)) return;
  _loadedFullTsProjects.add(projId);
  try {
    const { data } = await sb.from('timesheet_entries')
      .select('*')
      .eq('project_id', projId)
      .lt('week_start', '2020-01-01');
    if (!data || data.length === 0) return;
    data.forEach(r => {
      const empId = r.employee_id || '__unknown__';
      const storeKey = empId + '|' + r.week_start;
      if (r.is_overhead && r.overhead_cat) {
        const ohKey = 'oh_' + storeKey;
        if (!tsData[ohKey]) tsData[ohKey] = {};
        tsData[ohKey][r.overhead_cat] = JSON.parse(r.hours_json || '{}');
      } else {
        if (!tsData[storeKey]) tsData[storeKey] = [];
        if (!tsData[storeKey].find(x => x._id === r.id)) {
          tsData[storeKey].push({
            _id: r.id, projId: r.project_id||'', taskName: r.task_name||'',
            isOverhead: false, overheadCat: '',
            hours: JSON.parse(r.hours_json||'{}'),
          });
        }
      }
    });
  } catch(e) {
    console.error('loadFullProjectTimesheets failed:', e);
    _loadedFullTsProjects.delete(projId); // allow retry
  }
}

// ===== REALTIME SUBSCRIPTIONS =====
// ===== REALTIME SUBSCRIPTIONS =====
function setupRealtime() {
  if (!sb) return;

  // Helper: re-render whichever panel is currently visible
  function refreshCurrentView() {
    const active = document.querySelector('.view-panel.active');
    if (!active) return;
    const id = active.id;
    if (id === 'panel-dashboard') renderDashboard();
    else if (id === 'panel-projects') { document.querySelector('#navProjects') && openProjectsTable(document.getElementById('navProjects')); }
    else if (id === 'panel-project') {
      if (activeProjectId) {
        renderProjSummary(activeProjectId);
        const activeSub = document.querySelector('.proj-sub.active');
        if (activeSub) {
          const sid = activeSub.id;
          if (sid === 'sub-info') renderInfoSheet(activeProjectId);
          else if (sid === 'sub-expenses') renderExpensesPanel(activeProjectId);
        }
      }
    }
    else if (id === 'panel-timesheet') renderTimesheet();
  }

  // ── PROJECTS ──────────────────────────────────────────────
  sb.channel('rt-projects')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projects' }, payload => {
      const r = payload.new;
      if (!projects.find(p => p.id === r.id)) {
        projects.push({ id: r.id, name: r.name, color: r.color, emoji: r.emoji||'📁', desc: r.description||'' });
        toast('📁 New project: ' + r.name);
        refreshCurrentView();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, payload => {
      const r = payload.new;
      const p = projects.find(x => x.id === r.id);
      if (p) { p.name = r.name; p.color = r.color; p.emoji = r.emoji||p.emoji; p.desc = r.description||''; }
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'projects' }, payload => {
      projects = projects.filter(p => p.id !== payload.old.id);
      refreshCurrentView();
    })
    .subscribe();

  // ── PROJECT_INFO ───────────────────────────────────────────
  sb.channel('rt-project-info')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_info' }, payload => {
      const r = payload.new || payload.old;
      if (!r) return;
      if (payload.eventType !== 'DELETE') {
        projectInfo[r.project_id] = {
          pm: r.pm||'', po: r.po_number||'', contract: r.contract_amount||'',
          phase: r.phase||'Waiting on TP Approval', status: r.status||'active',
          startDate: r.start_date||'', endDate: r.end_date||'', tentativeTestDate: r.tentative_test_date||'',
          client: r.client||'', clientContact: r.client_contact||'',
          clientEmail: r.client_email||'', clientPhone: r.client_phone||'',
          clientId: r.client_id||null, contactId: r.contact_id||null,
          billingType: r.billing_type||'Fixed Fee', invoiced: r.invoiced||'',
          remaining: r.remaining||'', notes: r.notes||'', desc: r.description||'',
          dcas: r.dcas||'', customerWitness: r.customer_witness||'',
          tpApproval: r.tp_approval||'', dpas: r.dpas||'', noforn: r.noforn||'',
          testDesc: r.test_description||'', testArticleDesc: r.test_article_description||'',
          quoteNumber: r.quote_number||'', creditHold: r.credit_hold||false,
          needUpdatedPo: r.need_updated_po||false, testcompleteDate: r.testcomplete_date||'',
          billedRevenue: r.billed_revenue ? parseFloat(r.billed_revenue) : 0,
          expectedRevenue: r.expected_revenue ? parseFloat(r.expected_revenue) : 0,
          actualHours: r.actual_hours ? parseFloat(r.actual_hours) : 0,
        };
      } else {
        delete projectInfo[r.project_id];
      }
      refreshCurrentView();
    })
    .subscribe();

  // ── TASKS ──────────────────────────────────────────────────
  sb.channel('rt-tasks')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, payload => {
      const r = payload.new;
      if (taskStore.find(t => t._id === r.id)) return;
      if (window._localInsertIds?.has(r.id)) return; // skip locally inserted tasks
      taskStore.unshift({
        _id: r.id, taskNum: r.task_num||0, name: r.name, assign: r.assignee||'',
        due: r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '',
        due_raw: r.due_date||'', overdue: false, done: r.done||false,
        proj: r.project_id||'', status: r.status||'new', priority: r.priority||'medium',
        section: r.section||'sprint', salesCat: r.sales_category||'',
        fixedPrice: r.fixed_price ? parseFloat(r.fixed_price) : 0,
        budgetHours: r.budget_hours ? parseFloat(r.budget_hours) : 0,
        taskStartDate: r.task_start_date||'', completedDate: r.completed_date||'',
        billedDate: r.billed_date||'', quoteNum: r.quote_number||'',
        poNumber: r.po_number||'', peachtreeInv: r.peachtree_inv||'',
        createdAt: r.created_at ? r.created_at.split('T')[0] : '',
        revenueType: r.revenue_type||'fixed',
      });
      const proj = projects.find(p => p.id === r.project_id);
      toast('✅ New task: ' + r.name + (proj ? ' on ' + proj.name : ''));
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, payload => {
      const r = payload.new;
      const t = taskStore.find(x => x._id === r.id);
      const wasDone = t ? t.done : false;
      if (t) {
        t.name = r.name; t.assign = r.assignee||''; t.done = r.done||false;
        t.status = r.status||t.status; t.priority = r.priority||t.priority;
        t.due_raw = r.due_date||'';
        t.due = r.due_date ? new Date(r.due_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        t.section = r.section||t.section; t.fixedPrice = r.fixed_price ? parseFloat(r.fixed_price) : t.fixedPrice;
        t.completedDate = r.completed_date||''; t.billedDate = r.billed_date||'';
      }
      if (!wasDone && r.done) toast('✓ Task completed: ' + r.name);
      refreshCurrentView();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, payload => {
      taskStore = taskStore.filter(t => t._id !== payload.old.id);
      refreshCurrentView();
    })
    .subscribe();

  // ── SCHEDULE_BLOCKS ────────────────────────────────────────
  sb.channel('rt-schedule-blocks')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'schedule_blocks' }, payload => {
      const blk = schedRowToBlock(payload.new);
      if (!schedBlocks.find(b => b.id === blk.id)) {
        schedBlocks.push(blk);
        _schedRerender();
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedule_blocks' }, payload => {
      const blk = schedRowToBlock(payload.new);
      const idx = schedBlocks.findIndex(b => b.id === blk.id);
      if (idx >= 0) schedBlocks[idx] = blk; else schedBlocks.push(blk);
      _schedRerender();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'schedule_blocks' }, payload => {
      schedBlocks = schedBlocks.filter(b => b.id !== payload.old.id);
      _schedRerender();
    })
    .subscribe();

  console.log('✓ Realtime subscriptions active (projects, project_info, tasks, schedule_blocks)');
}

// ===== BILLED CATEGORY SYNC HELPER =====
// ===== BILLED CATEGORY SYNC HELPER =====
// Applies deltas to window.billedCatData (in-memory) AND billed_revenue_by_category (DB).
// deltaMap: { 'YYYY-MM|salesCat': amountDelta }  — positive when billing, negative when unbilling.
// Call this after every bill / unbill operation to keep chart, summary, and DB in sync.
async function _applyBilledCatDelta(deltaMap) {
  if (!deltaMap || !Object.keys(deltaMap).length) return;
  // 1. Update in-memory billedCatData immediately (chart re-renders use this)
  for (const [key, delta] of Object.entries(deltaMap)) {
    const [ym, cat] = key.split('|');
    if (!window.billedCatData[ym]) window.billedCatData[ym] = {};
    window.billedCatData[ym][cat] = Math.max(0, (window.billedCatData[ym][cat] || 0) + delta);
  }
  // 2. Sync to DB summary table so future page loads are also accurate
  if (!sb) return;
  for (const [key, delta] of Object.entries(deltaMap)) {
    if (!delta) continue;
    const [ym, cat] = key.split('|');
    try {
      const { data: rows } = await sb.from('billed_revenue_by_category')
        .select('id, amount').eq('year_month', ym).eq('sales_category', cat);
      if (rows && rows.length > 0) {
        const newAmt = Math.max(0, (parseFloat(rows[0].amount) || 0) + delta);
        await sb.from('billed_revenue_by_category').update({ amount: newAmt }).eq('id', rows[0].id);
      } else if (delta > 0) {
        await sb.from('billed_revenue_by_category').insert({ year_month: ym, sales_category: cat, amount: delta });
      }
    } catch(e) {
      console.error('_applyBilledCatDelta', ym, cat, e);
    }
  }
}

// Re-render the scheduler if it's currently visible
function _schedRerender() {
  const panel = document.getElementById('panel-scheduler');
  if (!panel?.classList.contains('active')) return;
  if (typeof schedView !== 'undefined' && schedView === 'calendar') {
    if (typeof renderSchedCalendar === 'function') renderSchedCalendar();
  } else {
    if (typeof renderSched === 'function') renderSched();
  }
}

