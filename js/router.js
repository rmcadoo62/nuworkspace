// ===== HASH ROUTER =====
// ===== HASH ROUTER =====
// Enables browser back/forward navigation via URL hash.
// Hash format examples:
//   #projects
//   #project/abc123
//   #project/abc123/tasks
//   #reports/billing
//   #shipping
//   #employees

let _routerReady    = false; // only navigate after data is loaded
let _handlingPop    = false; // prevent push during popstate handling
let _suppressPush   = false; // prevent push during programmatic nav

// ── Hash → Navigation ──────────────────────────────────────────────────
function routerNavigate(hash) {
  if (!_routerReady) return;
  const raw  = (hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/');
  const panel = parts[0] || 'projects';

  _suppressPush = true; // nav functions will try to pushState — suppress during popstate replay
  try {
    switch (panel) {
      case 'dashboard':   if (typeof openDashboardPanel  === 'function') openDashboardPanel();  break;
      case 'projects':    if (typeof openProjectsTable   === 'function') openProjectsTable();   break;
      case 'shipping':    if (typeof openShippingPanel   === 'function') openShippingPanel();   break;
      case 'clients':     if (typeof openClientsPanel    === 'function') openClientsPanel();     break;
      case 'employees':   if (typeof openEmployeesPanel  === 'function') openEmployeesPanel();  break;
      case 'timesheet':   if (typeof openTimesheetPanel  === 'function') openTimesheetPanel();  break;
      case 'scheduler':   if (typeof openSchedulerPanel  === 'function') openSchedulerPanel();  break;
      case 'reports': {
        if (typeof openReportsPanel === 'function') openReportsPanel();
        const rTab = parts[1];
        if (rTab) {
          setTimeout(() => {
            const tabEl = document.querySelector('.reports-tab[data-tab="tab-' + rTab + '"]');
            if (tabEl && typeof switchReportsTab === 'function') switchReportsTab(tabEl);
          }, 120);
        }
        break;
      }
      case 'project': {
        const projId = parts[1];
        const subTab = parts[2]; // e.g. 'tasks', 'chatter', 'info'
        if (projId && typeof selectProject === 'function') {
          selectProject(projId, null);
          if (subTab) {
            setTimeout(() => {
              if (typeof switchProjTab === 'function') switchProjTab('sub-' + subTab);
            }, 160);
          }
        }
        break;
      }
      // Admin / misc panels
      case 'setup':       if (typeof openSetupPanel         === 'function') openSetupPanel();         break;
      case 'myinfo':      if (typeof openMyInfoPanel        === 'function') openMyInfoPanel();        break;
      case 'auditlog':    if (typeof openAuditLogPanel      === 'function') openAuditLogPanel();      break;
      case 'permissions': if (typeof openPermissionsPanel   === 'function') openPermissionsPanel();   break;
      case 'approvals':   if (typeof openApprovalsPanel     === 'function') openApprovalsPanel();     break;
      case 'quotes':      if (typeof openQuotesPanel        === 'function') openQuotesPanel();        break;
      case 'closingreport': if (typeof openClosingReport    === 'function') openClosingReport();      break;
      default:
        if (typeof openProjectsTable === 'function') openProjectsTable();
    }
  } finally {
    _suppressPush = false;
  }
}

// ── Push a new history entry ────────────────────────────────────────────
function routerPush(hash) {
  if (_handlingPop || _suppressPush) return;
  const full = '#' + hash;
  if (window.location.hash === full) return; // already here
  history.pushState({ hash }, '', full);
}

// ── Popstate — browser back / forward ──────────────────────────────────
window.addEventListener('popstate', () => {
  if (!_routerReady) return;
  _handlingPop = true;
  routerNavigate(window.location.hash);
  _handlingPop = false;
});

// ── Hook nav functions to push state ───────────────────────────────────
// Called once after DOMContentLoaded so all functions exist
function routerHookFunctions() {
  // Simple top-level panels
  const SIMPLE = [
    ['openDashboardPanel',      'dashboard'],
    ['openProjectsTable',       'projects'],
    ['openShippingPanel',       'shipping'],
    ['openClientsPanel',        'clients'],
    ['openEmployeesPanel',      'employees'],
    ['openTimesheetPanel',      'timesheet'],
    ['openSchedulerPanel',      'scheduler'],
    ['openReportsPanel',        'reports'],
    ['openSetupPanel',          'setup'],
    ['openMyInfoPanel',         'myinfo'],
    ['openAuditLogPanel',       'auditlog'],
    ['openPermissionsPanel',    'permissions'],
    ['openApprovalsPanel',      'approvals'],
    ['openQuotesPanel',         'quotes'],
    ['openClosingReport',       'closingreport'],
    ['openMergeClientsPanel',   'clients'],
    ['openSfImportPanel',       'clients'],
    ['openSchedSettingsPanel',  'scheduler'],
    ['openImportExpensesPanel', 'reports'],
  ];

  SIMPLE.forEach(([name, hash]) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...args) {
      const r = orig(...args);
      routerPush(hash);
      return r;
    };
  });

  // selectProject → #project/{id}
  const origSelect = window.selectProject;
  if (typeof origSelect === 'function') {
    window.selectProject = function (id, el) {
      const r = origSelect(id, el);
      routerPush('project/' + id);
      return r;
    };
  }

  // switchProjTab → #project/{id}/{tab}
  const origProjTab = window.switchProjTab;
  if (typeof origProjTab === 'function') {
    window.switchProjTab = function (subId) {
      const r = origProjTab(subId);
      if (typeof activeProjectId !== 'undefined' && activeProjectId) {
        const tab = subId.replace(/^sub-/, '');
        routerPush('project/' + activeProjectId + '/' + tab);
      }
      return r;
    };
  }

  // switchReportsTab → #reports/{tab}
  const origReportTab = window.switchReportsTab;
  if (typeof origReportTab === 'function') {
    window.switchReportsTab = function (el) {
      const r = origReportTab(el);
      const tab = (el.dataset && el.dataset.tab || '').replace(/^tab-/, '');
      if (tab) routerPush('reports/' + tab);
      return r;
    };
  }
}

// ── initRouter — called from app.js after data loads ───────────────────
function initRouter() {
  routerHookFunctions();
  _routerReady = true;

  // Navigate to whatever hash is in the URL (deep link / page refresh)
  const hash = window.location.hash;
  if (hash && hash.length > 1) {
    // Small delay to let all panels render before navigating
    setTimeout(() => routerNavigate(hash), 800);
  } else {
    // No hash — set default
    routerPush('projects');
  }
}
