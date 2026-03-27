// ===== IN-APP NAVIGATION HISTORY =====
// ===== IN-APP NAVIGATION HISTORY =====
// Tracks navigation so the ← Back button can replay the previous screen.
// Wraps each nav function after all scripts have loaded — no other files need changing.

let navStack = [];

function navPush(fn, args, label) {
  // Don't double-push the same destination back-to-back
  const last = navStack[navStack.length - 1];
  if (last && last.label === label) return;
  navStack.push({ fn, args: args || [], label });
  _updateBackBtn();
}

function goBack() {
  if (navStack.length < 2) return;
  navStack.pop(); // remove current page
  const prev = navStack.pop(); // remove previous (fn call will re-push it)
  prev.fn(...prev.args);
}

function _updateBackBtn() {
  const btn = document.getElementById('backBtn');
  const lbl = document.getElementById('backBtnLabel');
  if (!btn) return;
  if (navStack.length > 1) {
    btn.style.display = 'flex';
    if (lbl) lbl.textContent = navStack[navStack.length - 2].label;
  } else {
    btn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', function () {

  // List of simple nav functions to wrap (name → back-button label)
  const NAV_FNS = [
    { name: 'openDashboardPanel',     label: 'Dashboard'           },
    { name: 'openProjectsTable',      label: 'Projects'            },
    { name: 'openClientsPanel',       label: 'Clients'             },
    { name: 'openEmployeesPanel',     label: 'Employees'           },
    { name: 'openTimesheetPanel',     label: 'Timesheet'           },
    { name: 'openReportsPanel',       label: 'Reports'             },
    { name: 'openSchedulerPanel',     label: 'Scheduler'           },
    { name: 'openSetupPanel',         label: 'Setup'               },
    { name: 'openMyInfoPanel',        label: 'My Info'             },
    { name: 'openAuditLogPanel',      label: 'Audit Log'           },
    { name: 'openPermissionsPanel',   label: 'Permissions'         },
    { name: 'openShippingPanel',      label: 'Shipping & Receiving'},
    { name: 'openMergeClientsPanel',  label: 'Merge Clients'       },
    { name: 'openSfImportPanel',      label: 'Import Salesforce'   },
    { name: 'openSchedSettingsPanel', label: 'Scheduler Settings'  },
    { name: 'openApprovalsPanel',     label: 'Approvals'           },
    { name: 'openImportExpensesPanel',label: 'Import Expenses'     },
  ];

  NAV_FNS.forEach(({ name, label }) => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...args) {
      const result = orig(...args);
      navPush(window[name], args, label);
      return result;
    };
  });

  // selectProject is special — label comes from the project name
  const origSelectProject = window.selectProject;
  if (typeof origSelectProject === 'function') {
    window.selectProject = function (id, el) {
      const result = origSelectProject(id, el);
      const p = (typeof projects !== 'undefined') && projects.find(p => p.id === id);
      const label = p ? ((p.emoji || '') + ' ' + p.name).trim() : 'Project';
      navPush(window.selectProject, [id, null], label);
      return result;
    };
  }

  _updateBackBtn();
});
