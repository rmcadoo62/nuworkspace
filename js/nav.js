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
        '#loa': 'LOA',
        '#vendors': 'Vendors',
        '#clients': 'Clients',
        '#shipping': 'Shipping & Receiving',
        '#reports': 'Reports',
        '#quotes': 'Quotes',
        '#setup': 'Setup',
        '#compliance': 'CMMC Compliance',
        '#bookings': 'Booking Report',
        '#salesbycat': 'Sales by Category'
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

// ===== NUFORCE LAUNCHER =====
// Opens the companion NUForce app in a new tab. The session is shared via the
// .nulabs.com cookie (set by nulabs-session-storage.js), so NUForce picks up
// the existing login automatically — no second sign-in. The launcher's
// visibility is gated by the access_nuforce capability in applyPermissions().
function openNuforce() {
  // Optional CMMC audit trail — fire-and-forget, never blocks the launch.
  // Delete this try/catch block if you don't want launch events logged.
  try {
    if (typeof sb !== 'undefined' && sb && typeof currentEmployee !== 'undefined' && currentEmployee) {
      (async () => {
        try {
          await sb.from('activity_log').insert({
            employee_id: currentEmployee.id,
            employee_name: currentEmployee.name,
            record_type: 'auth', record_id: null,
            record_label: 'NUForce',
            field_changed: 'nuforce_launch',
            old_value: null, new_value: 'opened'
          });
        } catch (_) { /* logging must never block the launch */ }
      })();
    }
  } catch (_) { /* ignore */ }
  window.open('https://nuforce.nulabs.com', '_blank', 'noopener');
}
window.openNuforce = openNuforce;

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
    { name: 'openReportPage',         label: 'Report'              },
    { name: 'openSchedulerPanel',     label: 'Scheduler'           },
    { name: 'openLoaPanel',           label: 'LOA'                 },
    { name: 'openVendorsPanel',       label: 'Vendors'             },
    { name: 'openMyPurchasesPanel',   label: 'My Purchase Requests' },
    { name: 'openPurchasesPanel',     label: 'Purchases'           },
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
    { name: 'openBookingReportPanel', label: 'Booking Report'     },
    { name: 'openSalesByCategoryPanel', label: 'Sales by Category' },
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

// ===== DEPARTMENT TABS (one-click tabs with dropdowns) =====
// The sidebar markup still holds every department page
// (.nav-section[data-section] in index.html). Whether each page shows is still
// decided only by applyPermissions() / _applyIdentityNav() in auth.js; this
// reads the result. The department sections themselves are kept hidden: their
// pages are reached from the top bar.
//   - Each department with at least one visible page gets a tab. One click
//     does both: it opens that department's default page (unless you are
//     already in that department) AND drops down the list of its pages so
//     you can pick another. Clicking the tab again closes the list.
//     (Was a split label/caret until 11/6/2026: people didn't find the caret.)
//   - The star in a dropdown picks the default page, remembered per browser.
//     With no star (or a starred page this user can't see) the first visible
//     page is the default.
//   - A user with no department pages gets no tabs: My Workspace only.
// The highlighted tab follows the page you're on (clicks, deep links,
// back/forward); a My Workspace page clears it.
(function () {
  const DEFAULTS_KEY = 'nuworkspace_dept_defaults';
  const ALWAYS = 'me';
  const LAUNCHER = 'navNuforce'; // opens another site in a new tab: never a default
  // Hash -> department. My Workspace pages (Home, Dashboard, Projects,
  // Scheduler, LOA, Shipping, Timesheet...) leave the current tab alone.
  const HASH_DEPT = {
    vendors: 'billing',
    'reports/overview': 'production', 'reports/stale': 'production', 'reports/revenue': 'production',
    'reports/billing': 'billing', purchases: 'billing',
    clients: 'quotes', surveys: 'quotes',
    employees: 'hr', 'reports/employees': 'hr', 'reports/timesheets': 'hr',
    closingreport: 'production',
    'reports/closedjobs': 'admin', cashflow: 'admin', bookings: 'admin', salesbycat: 'admin',
  };

  let current = null;   // department of the page on screen, or null
  let openDept = null;  // department whose dropdown is open, or null
  let menuEl = null;

  try { localStorage.removeItem('nuworkspace_dept'); } catch (_) {} // old tab memory, no longer used

  function loadDefaults() {
    try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveDefault(dept, id) {
    const d = loadDefaults();
    d[dept] = id;
    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d)); } catch (_) {}
  }

  const sections = () => Array.from(document.querySelectorAll('.sidebar .nav-section[data-section]'));
  const sectionOf = dept => document.querySelector('.sidebar .nav-section[data-section="' + dept + '"]');
  const isShown = el => el.style.display !== 'none';
  const pagesOf = sec => Array.from(sec.querySelectorAll('.nav-item')).filter(isShown);

  function defaultPage(dept) {
    const sec = sectionOf(dept);
    if (!sec) return null;
    const pages = pagesOf(sec).filter(i => i.id !== LAUNCHER);
    const want = loadDefaults()[dept];
    return pages.find(i => i.id && i.id === want) || pages[0] || null;
  }

  function labelText(item) {
    const clone = item.cloneNode(true);
    clone.querySelectorAll('.icon, .nav-badge').forEach(el => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function render() {
    const all = sections();
    const depts = all.filter(s => s.dataset.section !== ALWAYS && pagesOf(s).length > 0);
    const tabbed = depts.length > 0;
    if (current && !depts.some(s => s.dataset.section === current)) current = null;
    if (openDept && !depts.some(s => s.dataset.section === openDept)) closeMenu();

    // Department sections never show in the sidebar while tabs carry them.
    all.forEach(s => {
      const off = tabbed && s.dataset.section !== ALWAYS;
      s.classList.toggle('dept-off', off);
      const label = s.previousElementSibling;
      if (label && label.classList.contains('brand-block')) label.classList.toggle('dept-off', off);
    });

    // Setup gear in the top bar: show it when any of its items is visible.
    const gear = document.getElementById('setupMenuWrap');
    if (gear) {
      const items = Array.from(gear.querySelectorAll('.nav-item'));
      gear.style.display = items.some(isShown) ? '' : 'none';
      // Divider above Issue Tracker only when there is something on both sides.
      const sep = gear.querySelector('.setup-menu-sep');
      const issues = document.getElementById('navIssueTracker');
      if (sep) sep.style.display = (issues && isShown(issues) &&
        items.some(i => i !== issues && isShown(i))) ? '' : 'none';
    }

    const bar = document.getElementById('deptTabs');
    if (!bar) return;
    bar.textContent = '';
    if (!tabbed) return;
    depts.forEach(s => {
      const dept = s.dataset.section;
      const name = s.dataset.label || dept;
      const wrap = document.createElement('div');
      wrap.className = 'dept-tab-wrap' + (dept === current ? ' active' : '') + (dept === openDept ? ' open' : '');
      wrap.dataset.dept = dept;

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dept-tab';
      b.setAttribute('aria-haspopup', 'true');
      b.setAttribute('aria-expanded', dept === openDept ? 'true' : 'false');
      const dflt = defaultPage(dept);
      if (dflt) b.title = 'Open ' + labelText(dflt) + ' and show all ' + name + ' pages';
      if (dept === current) b.setAttribute('aria-current', 'true');
      const lbl = document.createElement('span');
      lbl.textContent = name;
      b.appendChild(lbl);
      b.insertAdjacentHTML('beforeend', '<svg class="dept-tab-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');

      wrap.appendChild(b);
      bar.appendChild(wrap);
    });
  }

  // ----- dropdown -----
  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'dept-menu';
    menuEl.id = 'deptMenu';
    menuEl.setAttribute('role', 'menu');
    menuEl.hidden = true;
    document.body.appendChild(menuEl);
    menuEl.addEventListener('click', e => {
      e.stopPropagation();
      const star = e.target.closest('.dept-menu-star');
      if (star) {
        saveDefault(star.dataset.dept, star.dataset.target);
        fillMenu(star.dataset.dept); // stay open so the change is visible
        render();
        return;
      }
      const it = e.target.closest('.dept-menu-item');
      if (it) {
        const src = document.getElementById(it.dataset.target);
        closeMenu();
        if (src) src.click();
      }
    });
    return menuEl;
  }

  function fillMenu(dept) {
    const sec = sectionOf(dept);
    if (!sec || !menuEl) return;
    const dflt = defaultPage(dept);
    const activeItem = sec.querySelector('.nav-item.active');
    menuEl.textContent = '';
    pagesOf(sec).forEach(src => {
      if (!src.id) return;
      const row = document.createElement('div');
      row.className = 'dept-menu-row';

      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'dept-menu-item' + (src === activeItem ? ' current' : '');
      it.setAttribute('role', 'menuitem');
      it.dataset.target = src.id;
      // Copy icon, label and live badge counts; drop ids so nothing is duplicated.
      const clone = src.cloneNode(true);
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      while (clone.firstChild) it.appendChild(clone.firstChild);
      row.appendChild(it);

      if (src.id !== LAUNCHER) {
        const isDef = dflt === src;
        const name = labelText(src);
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'dept-menu-star' + (isDef ? ' is-default' : '');
        star.dataset.dept = dept;
        star.dataset.target = src.id;
        star.title = isDef ? name + ' opens when you click the tab' : 'Open ' + name + ' when you click the tab';
        star.setAttribute('aria-label', star.title);
        star.setAttribute('aria-pressed', isDef ? 'true' : 'false');
        star.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (isDef ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
        row.appendChild(star);
      }
      menuEl.appendChild(row);
    });
    const foot = document.createElement('div');
    foot.className = 'dept-menu-foot';
    foot.textContent = '★ = page that opens when you click ' + (sec.dataset.label || dept);
    menuEl.appendChild(foot);
  }

  function positionMenu(dept) {
    const wrap = document.querySelector('#deptTabs .dept-tab-wrap[data-dept="' + dept + '"]');
    if (!wrap || !menuEl) return;
    const r = wrap.getBoundingClientRect();
    const w = menuEl.offsetWidth;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    menuEl.style.left = left + 'px';
    menuEl.style.top = (r.bottom + 3) + 'px'; // just below the gold rule
  }

  function openMenu(dept) {
    ensureMenu();
    if (typeof _closeSetupMenu === 'function') _closeSetupMenu();
    if (typeof _closeUserMenu === 'function') _closeUserMenu();
    openDept = dept;
    fillMenu(dept);
    menuEl.hidden = false;
    render();
    positionMenu(dept);
  }

  function closeMenu() {
    if (!openDept) return;
    openDept = null;
    if (menuEl) menuEl.hidden = true;
    render();
  }

  function goDefault(dept) {
    closeMenu();
    if (typeof _closeSetupMenu === 'function') _closeSetupMenu();
    if (typeof _closeUserMenu === 'function') _closeUserMenu();
    const page = defaultPage(dept);
    if (page) page.click();
  }

  function setCurrent(dept) {
    if (dept === ALWAYS) dept = null;
    if (dept === current) return;
    current = dept;
    render();
  }

  function followHash(hash) {
    const parts = String(hash || '').replace(/^#\/?/, '').split('/');
    // Reports are keyed by their page (reports/billing), everything else by
    // the first segment.
    const key = parts[0] === 'reports' && parts[1] ? 'reports/' + parts[1] : parts[0];
    const dept = HASH_DEPT[key];
    if (dept) setCurrent(dept);
  }

  // Re-render whenever auth.js finishes a visibility pass. Both
  // applyPermissions() and _applyIdentityNav() (login, View-As enter/exit)
  // end by calling this function, so wrapping it catches every change.
  const origCollapse = window._autoCollapseNavSections;
  if (typeof origCollapse === 'function') {
    window._autoCollapseNavSections = function () {
      const r = origCollapse.apply(this, arguments);
      render();
      return r;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('deptTabs');
    if (bar) bar.addEventListener('click', e => {
      const wrap = e.target.closest('.dept-tab-wrap');
      if (!wrap) return;
      e.stopPropagation();
      const dept = wrap.dataset.dept;
      if (openDept === dept) { closeMenu(); return; }
      // Go to the starred page only when coming from somewhere else, so
      // switching pages within a department doesn't reload the current one.
      if (dept !== current) goDefault(dept);
      openMenu(dept);
    });
    // Tabs scroll sideways on narrow screens; a scrolled tab would leave the menu behind.
    if (bar) bar.addEventListener('scroll', closeMenu);

    document.addEventListener('click', e => {
      if (!openDept) return;
      if (e.target.closest && (e.target.closest('#deptMenu') || e.target.closest('#deptTabs'))) return;
      closeMenu();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', closeMenu);

    // A page opened from its (hidden) sidebar item gets class "active"; follow it.
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) new MutationObserver(muts => {
      for (const m of muts) {
        const el = m.target;
        if (!el.classList || !el.classList.contains('nav-item') || !el.classList.contains('active')) continue;
        const sec = el.closest('.nav-section[data-section]');
        if (sec) setCurrent(sec.dataset.section);
      }
    }).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });

    // Pages opened any other way (deep link, back/forward, a link inside a
    // page) go through router.js's routerPush; follow the hash.
    const origPush = window.routerPush;
    if (typeof origPush === 'function') {
      window.routerPush = function (hash) {
        followHash(hash);
        return origPush.apply(this, arguments);
      };
    }

    followHash(window.location.hash);
    render();
  });

  window._closeDeptMenu = closeMenu;
})();

// ===== ACCOUNT MENU (top-right avatar) =====
// Opens a small menu with the signed-in name, role and Sign out. auth.js fills
// the avatar, name and role (#userBadgeAv/Name/Role) exactly as it did when the
// badge lived at the bottom of the sidebar.
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('userMenu');
  const btn = document.getElementById('userMenuBtn');
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && typeof window._closeDeptMenu === 'function') window._closeDeptMenu();
}
function _closeUserMenu() {
  const menu = document.getElementById('userMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  const btn = document.getElementById('userMenuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => {
  if (!e.target.closest || !e.target.closest('#sidebarUserBadge')) _closeUserMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeUserMenu(); });
window.toggleUserMenu = toggleUserMenu;

// ===== SETUP GEAR MENU (top bar) =====
// Holds Setup and Issue Tracker (system configuration, not daily work). The
// items keep their ids, so auth.js still decides who sees each one.
function toggleSetupMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('setupMenu');
  const btn = document.getElementById('setupGearBtn');
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && typeof _closeUserMenu === 'function') _closeUserMenu();
  if (open && typeof window._closeDeptMenu === 'function') window._closeDeptMenu();
}
function _closeSetupMenu() {
  const menu = document.getElementById('setupMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  const btn = document.getElementById('setupGearBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', e => {
  if (!e.target.closest || !e.target.closest('#setupMenuWrap')) _closeSetupMenu();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeSetupMenu(); });
window.toggleSetupMenu = toggleSetupMenu;
window._closeSetupMenu = _closeSetupMenu;
