// ===== IN-APP NAVIGATION HISTORY =====
// ===== IN-APP NAVIGATION HISTORY =====
// Tracks navigation so the ← Back button can replay the previous screen.
// Wraps each nav function after all scripts have loaded — no other files need changing.

// ===== WHAT'S NEW RELEASE NOTES =====
// To add a new entry: add an object to the TOP of this array, then deploy.
// date: 'YYYY-MM-DD', tag: category label, text: description
const WHATS_NEW = [
  { date: '2026-04-13', tag: 'Projects',  text: 'Column filter clear pill — when you type in the 🔍 filter rows a clear button now appears in the filter bar to reset all column filters at once.' },
  { date: '2026-04-10', tag: 'Scheduler', text: 'Scheduler block colors and employee access settings now save to Supabase so all users share the same configuration.' },
  { date: '2026-04-09', tag: 'Compliance', text: 'New CMMC 2.0 compliance tracking module added to the sidebar.' },
  { date: '2026-04-08', tag: 'Notifications', text: 'Notification bell now updates live — no more needing to click it first to see new messages.' },
  { date: '2026-04-07', tag: 'Job Pack',  text: 'ESS Batch Test Log and Photo Index forms added. Acoustic Noise and Light Weight Shock Test forms added.' },
  { date: '2026-04-05', tag: 'Projects',  text: 'Sticky header and frozen top section when scrolling the projects table.' },
  { date: '2026-04-04', tag: 'Quotes',    text: 'Quotes panel added to the sidebar — view and sort all saved quotes from your partner system.' },
  { date: '2026-04-01', tag: 'Chatter',   text: 'Notify multiple people at once using the 🔔 Notify dropdown in the chatter composer — no @ required.' },
  { date: '2026-04-01', tag: 'Shipping',  text: 'Client lookup added to Shipping & Receiving log — pick a client even when no job has been opened yet.' },
];

const WN_STORAGE_KEY = 'nuworkspace_whats_new_read';

function _wnGetLastRead() {
  try { return localStorage.getItem(WN_STORAGE_KEY) || '1970-01-01'; } catch { return '1970-01-01'; }
}
function _wnSetLastRead(date) {
  try { localStorage.setItem(WN_STORAGE_KEY, date); } catch {}
}
function _wnUnreadCount() {
  const last = _wnGetLastRead();
  return WHATS_NEW.filter(e => e.date > last).length;
}

function renderWhatsNewBadge() {
  const badge = document.getElementById('whatsNewBadge');
  if (!badge) return;
  const count = _wnUnreadCount();
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
  badge.textContent = count;
}

function renderWhatsNewList() {
  const list = document.getElementById('whatsNewList');
  if (!list) return;
  const last = _wnGetLastRead();
  const TAG_COLORS = {
    'Projects':      '#5b9cf6', 'Scheduler':  '#a78bfa', 'Compliance': '#4caf7d',
    'Notifications': '#e8a234', 'Job Pack':   '#fb923c', 'Chatter':    '#f472b6',
    'Shipping':      '#94a3b8', 'Quotes':     '#4caf7d', 'Employees':  '#e8a234',
    'Reports':       '#5b9cf6', 'Timesheets': '#a78bfa',
  };
  if (!WHATS_NEW.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No updates yet.</div>';
    return;
  }
  list.innerHTML = WHATS_NEW.map(e => {
    const isNew = e.date > last;
    const color = TAG_COLORS[e.tag] || '#5b9cf6';
    const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);${isNew ? 'background:rgba(91,156,246,0.05)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
        <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;background:${color}22;color:${color};text-transform:uppercase;letter-spacing:.5px">${e.tag}</span>
        <span style="font-size:10px;color:var(--muted);margin-left:auto">${dateStr}</span>
        ${isNew ? '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;background:rgba(91,156,246,0.15);color:#5b9cf6">NEW</span>' : ''}
      </div>
      <div style="font-size:12.5px;color:var(--text);line-height:1.5">${e.text}</div>
    </div>`;
  }).join('');
}

function toggleWhatsNewPanel() {
  const panel = document.getElementById('whatsNewPanel');
  const notifPanel = document.getElementById('notifPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  // Close notif panel if open
  if (notifPanel) notifPanel.style.display = 'none';
  if (isOpen) {
    panel.style.display = 'none';
  } else {
    renderWhatsNewList();
    panel.style.display = 'block';
    // Auto-mark all read once they open it
    const latest = WHATS_NEW.length ? WHATS_NEW[0].date : '1970-01-01';
    _wnSetLastRead(latest);
    renderWhatsNewBadge();
  }
}

function markWhatsNewRead() {
  const latest = WHATS_NEW.length ? WHATS_NEW[0].date : '1970-01-01';
  _wnSetLastRead(latest);
  renderWhatsNewBadge();
  renderWhatsNewList();
}

// Close panel on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#whatsNewBtn') && !e.target.closest('#whatsNewPanel')) {
    const panel = document.getElementById('whatsNewPanel');
    if (panel) panel.style.display = 'none';
  }
});

// Init badge on load
document.addEventListener('DOMContentLoaded', () => {
  renderWhatsNewBadge();
  // Also mark read when panel is opened (auto-clear after viewing)
  document.getElementById('whatsNewPanel')?.addEventListener('transitionend', () => {});
});



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
