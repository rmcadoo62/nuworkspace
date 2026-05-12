// ===== BUG REPORT MODAL FUNCTIONS - DEFINED IMMEDIATELY =====
(function() {
  function openBugReportModal() {
    const modal = document.getElementById('bugReportModal');
    if (!modal) return;
    
    // Auto-detect current page
    const pageInput = document.getElementById('bugReportPage');
    if (pageInput) {
      const hash = window.location.hash || '#home';
      const pageMap = {
        '#home': 'Home',
        '#projects': 'Projects Table', 
        '#dashboard': 'Dashboard',
        '#timesheet': 'Timesheet',
        '#scheduler': 'Scheduler',
        '#clients': 'Clients',
        '#shipping': 'Shipping & Receiving',
        '#reports': 'Reports',
        '#quotes': 'Quotes',
        '#setup': 'Setup',
        '#compliance': 'CMMC Compliance'
      };
      pageInput.value = pageMap[hash] || hash.replace('#', '').replace('-', ' ');
    }
    
    // Clear form
    const titleInput = document.getElementById('bugReportTitle');
    const descInput = document.getElementById('bugReportDescription');
    const prioritySelect = document.getElementById('bugReportPriority');
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (prioritySelect) prioritySelect.value = 'medium';
    
    // Reset to bug type
    const bugRadio = document.querySelector('input[name="feedbackType"][value="bug"]');
    if (bugRadio) {
      bugRadio.checked = true;
      updateBugReportType();
    }
    
    // Use the same pattern as other modals - add 'open' class
    modal.classList.add('open');
    if (titleInput) setTimeout(() => titleInput.focus(), 100);
  }

  function closeBugReportModal() {
    const modal = document.getElementById('bugReportModal');
    if (modal) modal.classList.remove('open');
  }

  function updateBugReportType() {
    const typeRadio = document.querySelector('input[name="feedbackType"]:checked');
    const prioritySelect = document.getElementById('bugReportPriority');
    if (!typeRadio || !prioritySelect) return;
    
    // Update priority options based on type
    if (typeRadio.value === 'feature') {
      prioritySelect.innerHTML = `
        <option value="nice-to-have">Nice to have</option>
        <option value="would-help" selected>Would help</option>
        <option value="important">Important</option>
      `;
    } else {
      prioritySelect.innerHTML = `
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
        <option value="blocker">🚨 Blocker</option>
      `;
    }
  }

  async function submitBugReport() {
    const typeRadio = document.querySelector('input[name="feedbackType"]:checked');
    const titleInput = document.getElementById('bugReportTitle');
    const descInput = document.getElementById('bugReportDescription');
    const prioritySelect = document.getElementById('bugReportPriority');
    const pageInput = document.getElementById('bugReportPage');
    
    if (!typeRadio || !titleInput || !descInput || !prioritySelect || !currentEmployee) return;
    
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    
    if (!title || !description) {
      alert('Please fill in both title and description.');
      return;
    }
    
    try {
      // Submit to database
      const { data, error } = await sb.from('feedback_submissions').insert([{
        submitter_id: currentEmployee.id,
        submitter_name: currentEmployee.name,
        submitter_email: currentEmployee.email,
        type: typeRadio.value,
        priority: prioritySelect.value,
        title: title,
        description: description,
        page_context: pageInput ? pageInput.value : null,
        user_agent: navigator.userAgent
      }]).select();
      
      if (error) throw error;
      
      // Send notification to Russ
      if (data && data[0]) {
        const submission = data[0];
        const typeEmoji = submission.type === 'bug' ? '🐛' : '💡';
        const priorityLabel = submission.priority.charAt(0).toUpperCase() + submission.priority.slice(1).replace('-', ' ');
        
        // Find Russ's user_id
        const russEmp = employees.find(emp => emp.email === 'rmcadoo@nulabs.com');
        if (russEmp) {
          await sb.from('chatter_notifs').insert([{
            employee_id: russEmp.id,
            msg_id: null,
            from_name: currentEmployee.name,
            from_color: currentEmployee.color || '#5b9cf6',
            from_initials: currentEmployee.initials,
            preview: `${typeEmoji} ${submission.type === 'bug' ? 'Bug Report' : 'Feature Request'}: ${title}||issueTracker`,
            is_read: false
          }]);
        }
      }
      
      closeBugReportModal();
      
      const typeLabel = typeRadio.value === 'bug' ? 'Bug report' : 'Feature request';
      alert(`${typeLabel} submitted successfully! Russ will review it and follow up.`);
      
    } catch (e) {
      console.error('Failed to submit feedback:', e);
      alert('Failed to submit report. Please try again.');
    }
  }

  // Make functions available globally immediately
  window.openBugReportModal = openBugReportModal;
  window.closeBugReportModal = closeBugReportModal;
  window.updateBugReportType = updateBugReportType;
  window.submitBugReport = submitBugReport;
})();

// ===== IN-APP NAVIGATION HISTORY =====
// ===== IN-APP NAVIGATION HISTORY =====
// Tracks navigation so the ← Back button can replay the previous screen.
// Wraps each nav function after all scripts have loaded — no other files need changing.

// ===== BUG REPORT MODAL FUNCTIONS =====
// Explicitly add to window object
// (Functions now defined above)


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
    { name: 'openQuotesPanel',        label: 'Quotes'              },
    { name: 'openClosingReport',      label: 'Closing Report'      },
    { name: 'openCompliancePanel',    label: 'CMMC Compliance'     },
    { name: 'openIssueTrackerPanel', label: 'Issue Tracker'       },
    { name: 'openSurveyQueuePanel',  label: 'Customer Surveys'    },
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

// ===== SIDEBAR COLLAPSE TOGGLE =====
const SB_COLLAPSE_KEY = 'nuworkspace_sidebar_collapsed';

function _applySidebarState(collapsed) {
  if (collapsed) document.body.classList.add('sb-collapsed');
  else document.body.classList.remove('sb-collapsed');
  const btn = document.getElementById('sbToggleBtn');
  if (btn) btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

function toggleSidebar() {
  const willCollapse = !document.body.classList.contains('sb-collapsed');
  _applySidebarState(willCollapse);
  try { localStorage.setItem(SB_COLLAPSE_KEY, willCollapse ? '1' : '0'); } catch {}
}

// Restore saved state on load (desktop only — CSS gates the visual effect via media query)
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem(SB_COLLAPSE_KEY) === '1') _applySidebarState(true);
  } catch {}
});

window.toggleSidebar = toggleSidebar;

// ===== NAV TOOLTIPS (collapsed sidebar) =====
let _navTipEl = null;

function _ensureNavTip() {
  if (_navTipEl) return _navTipEl;
  _navTipEl = document.createElement('div');
  _navTipEl.className = 'nav-tip';
  document.body.appendChild(_navTipEl);
  return _navTipEl;
}

function _navTipText(item) {
  if (item.dataset.tip) return item.dataset.tip;
  // Strip icon and badge from a clone to extract just the label text
  const clone = item.cloneNode(true);
  clone.querySelectorAll('.icon, .nav-badge').forEach(el => el.remove());
  const text = clone.textContent.trim();
  if (text) item.dataset.tip = text;
  return text;
}

function _showNavTip(item) {
  if (!document.body.classList.contains('sb-collapsed')) return;
  const text = _navTipText(item);
  if (!text) return;
  const tip = _ensureNavTip();
  tip.textContent = text;
  const r = item.getBoundingClientRect();
  tip.style.left = (r.right + 12) + 'px';
  tip.style.top = (r.top + r.height / 2) + 'px';
  tip.classList.add('show');
}

function _hideNavTip() {
  if (_navTipEl) _navTipEl.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  // Event delegation so dynamically added nav items also work
  sidebar.addEventListener('mouseover', e => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    _showNavTip(item);
  });
  sidebar.addEventListener('mouseout', e => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    if (e.relatedTarget && item.contains(e.relatedTarget)) return;
    _hideNavTip();
  });
  sidebar.addEventListener('click', _hideNavTip);
  const scroll = sidebar.querySelector('.sidebar-nav-scroll');
  if (scroll) scroll.addEventListener('scroll', _hideNavTip);
});
