// ===== ISSUE TRACKER =====
// Bug reports and feature requests admin panel

let issueTrackerData = [];
let currentIssueFilter = 'all';
let selectedIssue = null;

// ── Main Panel ──────────────────────────────────────────────────────
function openIssueTrackerPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Issue Tracker';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-issue-tracker').classList.add('active');
  loadIssueTracker();
}

async function loadIssueTracker() {
  if (!currentUser || currentUser.email !== 'rmcadoo@nulabs.com') {
    const table = document.getElementById('issueTrackerTable');
    if (table) {
      table.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--muted)">Access restricted to administrators</div>';
    }
    return;
  }

  try {
    const { data, error } = await sb
      .from('feedback_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    issueTrackerData = data || [];
    renderIssueTracker();
    updateIssueBadge();
  } catch (e) {
    console.error('Failed to load issues:', e);
    const table = document.getElementById('issueTrackerTable');
    if (table) {
      table.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--red)">Failed to load issues: ' +
        (e.message || e) + '</div>';
    }
  }
}

function renderIssueTracker() {
  const table = document.getElementById('issueTrackerTable');
  if (!table) return;

  const filtered = filterIssues();

  if (!filtered.length) {
    table.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted)">
        <div style="font-size:18px;margin-bottom:8px">🐛</div>
        <div>No ${currentIssueFilter === 'all' ? '' : currentIssueFilter + ' '}issues found</div>
      </div>
    `;
    updateSubtitle();
    return;
  }

  const html = `
    <div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface2)">
      <div class="table-header" style="display:grid;grid-template-columns:120px 120px 60px 1fr 110px 120px 32px;padding:12px 16px;background:var(--surface3);border-bottom:1px solid var(--border);font-size:12px;font-weight:600;color:var(--muted);gap:12px">
        <div>Submitted</div>
        <div>Submitter</div>
        <div>Type</div>
        <div>Title</div>
        <div>Priority</div>
        <div>Status</div>
        <div></div>
      </div>
      ${filtered.map(issue => renderIssueRow(issue)).join('')}
    </div>
  `;

  table.innerHTML = html;
  updateSubtitle();
}

function renderIssueRow(issue) {
  const typeEmoji = issue.type === 'bug' ? '🐛' : '💡';
  const submittedDate = new Date(issue.submitted_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit'
  });

  const priorityColors = {
    'blocker': '#dc2626', 'high': '#ea580c', 'medium': '#d97706', 'low': '#059669',
    'important': '#dc2626', 'would-help': '#d97706', 'nice-to-have': '#059669'
  };
  const priorityColor = priorityColors[issue.priority] || '#6b7280';

  const statusColors = {
    'new': '#3b82f6', 'acknowledged': '#8b5cf6', 'in_progress': '#f59e0b',
    'done': '#10b981', 'wont_fix': '#6b7280', 'duplicate': '#6b7280'
  };
  const statusColor = statusColors[issue.status] || '#6b7280';
  const statusLabel = (issue.status || '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  const priorityLabel = (issue.priority || '').replace('-', ' ');

  // Escape for use in HTML attributes (titles)
  const safeName = String(issue.submitter_name || '').replace(/"/g, '&quot;');
  const safeTitle = String(issue.title || '').replace(/"/g, '&quot;');

  return `
    <div class="table-row" style="display:grid;grid-template-columns:120px 120px 60px 1fr 110px 120px 32px;padding:12px 16px;border-bottom:1px solid var(--border);gap:12px;cursor:pointer;transition:background-color var(--transition)"
      onclick="openIssueDetail('${issue.id}')"
      onmouseover="this.style.backgroundColor='var(--surface3)'"
      onmouseout="this.style.backgroundColor='transparent'">
      <div style="font-size:12px;color:var(--muted)">${submittedDate}</div>
      <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${safeName}">${issue.submitter_name || '—'}</div>
      <div style="font-size:16px" title="${issue.type}">${typeEmoji}</div>
      <div style="font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${safeTitle}">${issue.title || ''}</div>
      <div style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:12px;background:${priorityColor}22;color:${priorityColor};text-align:center;text-transform:uppercase;letter-spacing:0.5px;align-self:center">
        ${priorityLabel}
      </div>
      <div style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:12px;background:${statusColor}22;color:${statusColor};text-align:center;text-transform:uppercase;letter-spacing:0.5px;align-self:center">
        ${statusLabel}
      </div>
      <div style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:14px">→</div>
    </div>
  `;
}

function filterIssues() {
  return issueTrackerData.filter(issue => {
    switch (currentIssueFilter) {
      case 'new': return issue.status === 'new';
      case 'bug': return issue.type === 'bug';
      case 'feature': return issue.type === 'feature';
      case 'open': return ['new', 'acknowledged', 'in_progress'].includes(issue.status);
      case 'done': return issue.status === 'done';
      default: return true;
    }
  });
}

// Now takes the clicked tab element directly — no more fragile text matching
function setIssueFilter(filter, tabEl) {
  currentIssueFilter = filter;

  const tabs = document.querySelectorAll('#issueFilterTabs .filter-tab');
  tabs.forEach(t => t.classList.remove('active'));
  if (tabEl) {
    tabEl.classList.add('active');
  } else {
    // Fallback: try to find a tab whose onclick string contains this filter
    tabs.forEach(t => {
      const oc = t.getAttribute('onclick') || '';
      if (oc.indexOf("'" + filter + "'") !== -1) t.classList.add('active');
    });
  }

  renderIssueTracker();
}

function updateSubtitle() {
  const sub = document.getElementById('issueTrackerSub');
  if (!sub) return;

  const total = issueTrackerData.length;
  const filtered = filterIssues().length;
  const newCount = issueTrackerData.filter(i => i.status === 'new').length;

  if (currentIssueFilter === 'all') {
    sub.textContent = `${total} total issues${newCount > 0 ? ` • ${newCount} new` : ''}`;
  } else {
    sub.textContent = `${filtered} ${currentIssueFilter} issues`;
  }
}

function updateIssueBadge() {
  const navItem = document.getElementById('navIssueTracker');
  const badge = document.getElementById('issuesBadge');
  if (!navItem) return; // nav item not in DOM for this user — nothing to update

  // Only show for Russ
  if (!currentUser || currentUser.email !== 'rmcadoo@nulabs.com') {
    navItem.style.display = 'none';
    return;
  }

  navItem.style.display = 'flex';
  if (!badge) return;

  const newCount = issueTrackerData.filter(i => i.status === 'new').length;
  badge.style.display = newCount > 0 ? 'inline-block' : 'none';
  badge.textContent = newCount;
}

function refreshIssueTracker() {
  loadIssueTracker();
}

// ── Issue Detail Modal ──────────────────────────────────────────────────────
function openIssueDetail(issueId) {
  const issue = issueTrackerData.find(i => i.id === issueId);
  if (!issue) return;

  selectedIssue = issue;
  const modal = document.getElementById('issueDetailModal');
  const title = document.getElementById('issueDetailTitle');
  const body = document.getElementById('issueDetailBody');
  const saveBtn = document.getElementById('saveIssueBtn');

  if (!modal || !title || !body) return;
  if (saveBtn) saveBtn.style.display = 'none';

  const typeEmoji = issue.type === 'bug' ? '🐛' : '💡';
  const typeLabel = issue.type === 'bug' ? 'Bug Report' : 'Feature Request';
  title.textContent = `${typeEmoji} ${typeLabel}`;

  const submittedDate = new Date(issue.submitted_at).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });

  const resolvedDate = issue.resolved_at ?
    new Date(issue.resolved_at).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }) : null;

  // Escape HTML for free-text fields to avoid breaking the rendered markup
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  body.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px">${esc(issue.title)}</div>
      <div style="font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap">
        <span>By ${esc(issue.submitter_name)}</span>
        <span>Submitted ${submittedDate}</span>
        ${issue.page_context ? `<span>From ${esc(issue.page_context)}</span>` : ''}
      </div>
    </div>

    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">Description</div>
      <div style="font-size:13px;line-height:1.6;color:var(--text);white-space:pre-wrap;background:var(--surface3);padding:12px;border-radius:6px">${esc(issue.description)}</div>
    </div>

    <div class="field-row" style="margin-bottom:20px">
      <div class="field">
        <label class="field-label">Status</label>
        <select class="f-input" id="issueStatus" onchange="markIssueChanged()" style="cursor:pointer">
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="wont_fix">Won't Fix</option>
          <option value="duplicate">Duplicate</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Priority</label>
        <select class="f-input" id="issuePriority" onchange="markIssueChanged()" style="cursor:pointer">
          ${issue.type === 'bug' ? `
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="blocker">🚨 Blocker</option>
          ` : `
            <option value="nice-to-have">Nice to have</option>
            <option value="would-help">Would help</option>
            <option value="important">Important</option>
          `}
        </select>
      </div>
    </div>

    <div class="field" style="margin-bottom:20px">
      <label class="field-label">Admin Notes (private)</label>
      <textarea class="f-input" id="issueAdminNotes" placeholder="Internal notes, investigation details, etc."
        onchange="markIssueChanged()" rows="3" style="resize:vertical;font-family:'DM Sans',sans-serif">${esc(issue.admin_notes || '')}</textarea>
    </div>

    <div class="field" id="shipNoteField" style="display:none;margin-bottom:20px">
      <label class="field-label">Ship Note (will appear in What's New)</label>
      <textarea class="f-input" id="issueShipNote" placeholder="User-facing description of the fix or feature..."
        onchange="markIssueChanged()" rows="2" style="resize:vertical;font-family:'DM Sans',sans-serif">${esc(issue.ship_note || '')}</textarea>
    </div>

    ${resolvedDate ? `
      <div style="font-size:12px;color:var(--muted);margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        Resolved ${resolvedDate}
      </div>
    ` : ''}
  `;

  // Set current values
  const statusSel = document.getElementById('issueStatus');
  const prioritySel = document.getElementById('issuePriority');
  if (statusSel) statusSel.value = issue.status;
  if (prioritySel) prioritySel.value = issue.priority;

  // Show ship note field if status is done
  updateShipNoteVisibility();

  // Use the project's modal system (.open class) instead of style.display
  modal.classList.add('open');
}

function closeIssueDetailModal() {
  const modal = document.getElementById('issueDetailModal');
  const saveBtn = document.getElementById('saveIssueBtn');
  if (modal) modal.classList.remove('open');
  if (saveBtn) saveBtn.style.display = 'none';
  selectedIssue = null;
}

function markIssueChanged() {
  const saveBtn = document.getElementById('saveIssueBtn');
  if (saveBtn) saveBtn.style.display = 'inline-block';
  updateShipNoteVisibility();
}

function updateShipNoteVisibility() {
  const statusSelect = document.getElementById('issueStatus');
  const shipNoteField = document.getElementById('shipNoteField');
  if (statusSelect && shipNoteField) {
    shipNoteField.style.display = statusSelect.value === 'done' ? 'block' : 'none';
  }
}

async function saveIssueChanges() {
  if (!selectedIssue) return;

  const statusSelect = document.getElementById('issueStatus');
  const prioritySelect = document.getElementById('issuePriority');
  const notesTextarea = document.getElementById('issueAdminNotes');
  const shipNoteTextarea = document.getElementById('issueShipNote');

  if (!statusSelect || !prioritySelect || !notesTextarea) return;

  const newStatus = statusSelect.value;
  const newPriority = prioritySelect.value;
  const newNotes = notesTextarea.value.trim();
  const newShipNote = shipNoteTextarea ? shipNoteTextarea.value.trim() : '';

  const wasCompleted = selectedIssue.status === 'done';
  const nowCompleted = newStatus === 'done';

  try {
    const updateData = {
      status: newStatus,
      priority: newPriority,
      admin_notes: newNotes || null,
      ship_note: newShipNote || null,
      resolved_at: nowCompleted && !wasCompleted ? new Date().toISOString() :
                   !nowCompleted && wasCompleted ? null : selectedIssue.resolved_at
    };

    const { error } = await sb
      .from('feedback_submissions')
      .update(updateData)
      .eq('id', selectedIssue.id);

    if (error) throw error;

    // Log ship note intent (What's New array is currently hardcoded in nav.js)
    if (nowCompleted && !wasCompleted && newShipNote) {
      console.log('Add to What\'s New:', {
        date: new Date().toISOString().split('T')[0],
        tag: selectedIssue.type === 'bug' ? 'Bug Fix' : 'Feature',
        text: newShipNote
      });
    }

    // Notify submitter if resolved
    if (nowCompleted && !wasCompleted && selectedIssue.submitter_id) {
      const typeEmoji = selectedIssue.type === 'bug' ? '🐛' : '💡';
      const actionText = selectedIssue.type === 'bug' ? 'fixed' : 'completed';

      await sb.from('chatter_notifs').insert([{
        employee_id: selectedIssue.submitter_id,
        msg_id: null,
        from_name: 'System',
        from_color: '#10b981',
        from_initials: '✓',
        preview: `${typeEmoji} Your ${selectedIssue.type} report "${selectedIssue.title}" has been ${actionText}`,
        route_info: null,
        is_read: false
      }]);
    }

    closeIssueDetailModal();
    loadIssueTracker();

  } catch (e) {
    console.error('Failed to save issue:', e);
    alert('Failed to save changes: ' + (e.message || e));
  }
}

// ── Hook into login flow so nav visibility updates the moment auth completes ──
// The old setTimeout(1000) approach was a race condition — if Supabase auth
// took longer than 1s to restore a session, currentUser was still null when
// updateIssueBadge ran and the nav item stayed hidden forever.
(function wrapAfterLogin() {
  function install() {
    if (typeof window.afterLogin !== 'function') {
      // auth.js hasn't loaded yet — try again next tick
      setTimeout(install, 50);
      return;
    }
    if (window.__issueTrackerAfterLoginWrapped) return;
    window.__issueTrackerAfterLoginWrapped = true;

    const orig = window.afterLogin;
    window.afterLogin = async function(...args) {
      const result = await orig.apply(this, args);
      try { updateIssueBadge(); } catch (e) { console.error('updateIssueBadge failed:', e); }
      return result;
    };
  }
  install();
})();

// Also try on DOMContentLoaded in case the user is already logged in from a
// restored session and afterLogin already ran before this script loaded.
document.addEventListener('DOMContentLoaded', () => {
  // Retry a few times — currentUser may get populated during auth restoration
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (currentUser || tries >= 20) { // up to 10 seconds
      clearInterval(poll);
      updateIssueBadge();
    }
  }, 500);
});
