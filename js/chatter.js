
// ===== CHATTER =====
// ===== CHATTER =====
let chatterStore = {}; // { [projId]: [msg...] }
let chatterAttachPending = [];
let chatterMentionQuery = '';
let chatterMentionActive = false;
let chatterMentionSel = 0;
let chatterReplyTo = null; // { id, authorName, text }
let chatterEditingId = null; // id of message currently being edited (null = none)
let chatterNotifySelected = []; // array of employee ids chosen in notify dropdown
let chatterGroupsStore = []; // { id, name, memberIds, isDefault } — personal notify groups for current user
let _chatterEditingGroupId = null; // id of group open in editor modal (null = creating new)
let notifStore = []; // { id, projId, projName, msgId, fromName, fromColor, fromInitials, text, ts, read }
// One-shot guard so the 45-day prune of read notifications fires only once per
// session (at the first loadNotifs call after login). Reset by auth.js on
// login/logout. Skipped entirely while in View-As mode.
let _notifsPruned = false;

function chatterMsgs(projId) { return chatterStore[projId] || []; }

// ── Load & Render ──────────────────────────────────────────────────────
async function loadChatter(projId) {
  if (!projId) return;
  try {
    const { data, error } = await sb.from('chatter')
      .select('*').eq('proj_id', projId).order('created_at', { ascending: false });
    if (error) throw error;
    chatterStore[projId] = (data || []).map(r => ({
      id: r.id, authorId: r.author_id, authorName: r.author_name,
      authorInitials: r.author_initials, authorColor: r.author_color,
      text: r.text, attachments: r.attachments || [],
      replyTo: r.reply_to || null, notifyIds: r.notify_ids || [],
      ts: r.created_at
    }));
  } catch(e) { chatterStore[projId] = chatterStore[projId] || []; }
  renderChatter(projId);
  loadNotifs();
  // Load personal notify groups and auto-apply default group if one is set,
  // but only when no chips are already selected (don't stomp other flows).
  // Reloaded every project-load — small query, accounts for user switches
  // and edits made elsewhere.
  try {
    await chatterLoadGroups();
    if (!chatterNotifySelected.length) chatterApplyDefaultGroup();
  } catch(e) { console.warn('Chatter groups load error:', e); }
}

function renderChatter(projId) {
  const feed = document.getElementById('chatterFeed');
  const selfAv = document.getElementById('chatterSelfAvatar');
  if (!feed) return;
  if (selfAv && currentUser) {
    const emp = currentEmployee || {};
    selfAv.textContent = emp.initials || currentUser.email?.[0]?.toUpperCase() || '?';
    selfAv.style.background = emp.color || 'var(--amber)';
    selfAv.style.color = '#fff';
  }
  const msgs = chatterMsgs(projId);
  // Index replies by parent id for O(1) child lookup at any depth
  const childrenByParent = {};
  msgs.forEach(m => {
    if (m.replyTo) {
      if (!childrenByParent[m.replyTo]) childrenByParent[m.replyTo] = [];
      childrenByParent[m.replyTo].push(m);
    }
  });
  // Top-level: messages with no replyTo (still newest-first; fetch already desc)
  const topLevel = msgs.filter(m => !m.replyTo);
  if (!topLevel.length) {
    feed.innerHTML = '<div class="chatter-empty"><div class="chatter-empty-icon">\u{1F4AC}</div><div>No messages yet \u2014 start the conversation!</div></div>';
    return;
  }
  // Recursively render a message and its descendants. Children within a thread
  // are sorted OLDEST-FIRST so conversation reads top-down naturally; top-level
  // stays newest-first so active threads bubble up.
  function renderTree(m, depth) {
    let html = chatterMsgHtml(m, depth);
    const kids = (childrenByParent[m.id] || []).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
    if (kids.length) {
      html += '<div class="chatter-replies">';
      kids.forEach(k => { html += renderTree(k, depth + 1); });
      html += '</div>';
    }
    return html;
  }
  let out = '';
  let lastDate = '';
  topLevel.forEach(m => {
    const d = new Date(m.ts);
    const dateStr = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    if (dateStr !== lastDate) { out += '<div class="chatter-date-divider">' + dateStr + '</div>'; lastDate = dateStr; }
    out += renderTree(m, 0);
  });
  feed.innerHTML = out;
  feed.scrollTop = 0;
  // Update chatter tab badge
  updateChatterTabBadge(projId);
}

function chatterMsgHtml(m, depth) {
  const isReply = depth > 0;
  const d = new Date(m.ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const timeStr = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) +
    (sameYear ? '' : ', ' + d.getFullYear());
  const isOwn = !!currentEmployee && m.authorId === currentEmployee.id;
  // Edit/Delete are suppressed while in View-As: impersonation is a read-only
  // diagnostic (mirrors the read-only prune guard in loadNotifs). Owners
  // looking through someone else's eyes should not be able to mutate chatter.
  const _isView = (typeof isImpersonating === 'function' && isImpersonating());
  const canModify = isOwn && !_isView;
  const isEditing = chatterEditingId === m.id;
  const avatarClass = isReply ? 'chatter-reply-avatar' : 'chatter-msg-avatar';
  const msgClass = isReply ? 'chatter-reply-msg' : 'chatter-msg';

  // Attachments and notify chips render whether or not we're editing
  const attachHtml = m.attachments && m.attachments.length
    ? '<div class="chatter-msg-attachments">' + m.attachments.map(a =>
        '<div class="chatter-attach-chip" onclick="chatterOpenAttach(this)" data-url="' + (a.dataUrl||'') + '" data-name="' + a.name + '">\uD83D\uDCCE ' + a.name + ' <span style="color:var(--muted);font-size:10px">(' + a.size + ')</span></div>'
      ).join('') + '</div>' : '';
  const notifyHtml = m.notifyIds && m.notifyIds.length
    ? '<div style="font-size:11px;color:var(--muted);margin-top:3px">\uD83D\uDD14 ' + m.notifyIds.map(id => { const e = employees.find(x => x.id === id); return e ? '@'+e.name : ''; }).filter(Boolean).join(', ') + '</div>' : '';

  // Body: either editor (when editing) OR rendered text + actions
  let bodyContent;
  if (isEditing) {
    // Raw text in a textarea so the user edits the source, not the styled HTML
    const rawText = (m.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    bodyContent =
      '<textarea id="chatterEditArea_' + m.id + '" class="chatter-edit-area" ' +
        'style="width:100%;min-height:60px;background:var(--surface2);color:var(--text);' +
        'border:1px solid var(--amber-dim);border-radius:6px;padding:8px 10px;font-family:inherit;' +
        'font-size:13px;resize:vertical;box-sizing:border-box">' + rawText + '</textarea>' +
      attachHtml + notifyHtml +
      '<div class="chatter-msg-actions" style="margin-top:6px">' +
        '<button class="chatter-action-btn" style="color:var(--amber);font-weight:600" onclick="chatterSaveEdit(\x27' + m.id + '\x27)">\u2714 Save</button>' +
        '<button class="chatter-action-btn" style="color:var(--muted)" onclick="chatterCancelEdit()">\u2715 Cancel</button>' +
      '</div>';
  } else {
    const textHtml = (m.text || '').replace(/\n/g,'<br>').replace(/@([\w][\w ]*?)(?=\s|$|<br>)/g, '<span class="mention">@$1</span>');
    const replyBtn  = '<button class="chatter-action-btn" onclick="chatterStartReply(\x27' + m.id + '\x27,\x27' + (m.authorName||'').replace(/'/g,"\x27") + '\x27)">\u21A9 Reply</button>';
    const editBtn   = canModify ? '<button class="chatter-action-btn" style="color:var(--muted)" onclick="chatterEdit(\x27' + m.id + '\x27)">\u270E Edit</button>' : '';
    const deleteBtn = canModify ? '<button class="chatter-action-btn" style="color:var(--muted)" onclick="chatterDelete(\x27' + m.id + '\x27)">\uD83D\uDDD1 Delete</button>' : '';
    bodyContent =
      '<div class="chatter-msg-text">' + textHtml + '</div>' +
      attachHtml +
      notifyHtml +
      '<div class="chatter-msg-actions">' + replyBtn + editBtn + deleteBtn + '</div>';
  }

  return '<div class="' + msgClass + '" data-msg-id="' + m.id + '">' +
    '<div class="' + avatarClass + '" style="background:' + (m.authorColor||'#888') + ';color:#fff">' + (m.authorInitials||'?') + '</div>' +
    '<div class="chatter-msg-body">' +
      '<div class="chatter-msg-header"><span class="chatter-msg-name">' + m.authorName + '</span><span class="chatter-msg-time">' + timeStr + '</span></div>' +
      bodyContent +
    '</div></div>';
}

// ── Reply ──────────────────────────────────────────────────────────────
function chatterStartReply(msgId, authorName) {
  chatterReplyTo = { id: msgId, authorName };
  const bar = document.getElementById('chatterReplyBar');
  const lbl = document.getElementById('chatterReplyLabel');
  if (bar) bar.style.display = 'flex';
  if (lbl) lbl.textContent = 'Replying to ' + authorName;

  // Pre-fill notify chips with the parent message's audience: parent author +
  // parent's notifyIds, minus the current user (don't ping yourself). This
  // REPLACES any pre-existing chip selections — the user can ✕ anyone they
  // don't want before posting. The chip row is the single source of truth at
  // post time.
  const parentMsg = (chatterStore[activeProjectId] || []).find(m => m.id === msgId);
  if (parentMsg) {
    const myEmpId = currentEmployee?.id;
    const parentAuthorEmpId = parentMsg.authorId || null;
    const preFill = [];
    if (parentAuthorEmpId) preFill.push(parentAuthorEmpId);
    (parentMsg.notifyIds || []).forEach(id => preFill.push(id));
    chatterNotifySelected = [...new Set(preFill)].filter(id => id && id !== myEmpId);
    chatterRenderNotifyChips();
    chatterUpdateNotifyBtn();
  }

  document.getElementById('chatterInput')?.focus();
}
function chatterCancelReply() {
  chatterReplyTo = null;
  const bar = document.getElementById('chatterReplyBar');
  if (bar) bar.style.display = 'none';
  // Clear the pre-filled chips so they don't bleed into the next non-reply post
  chatterNotifySelected = [];
  chatterRenderNotifyChips();
  chatterUpdateNotifyBtn();
  // Re-apply default group now that we're back to fresh-message mode
  chatterApplyDefaultGroup();
}

async function chatterDelete(msgId) {
  if (!confirm('Delete this message?')) return;
  if (sb && !msgId.startsWith('local_')) {
    const { error } = await sb.from('chatter').delete().eq('id', msgId);
    if (error) { toast('⚠ Could not delete message'); return; }
  }
  if (chatterStore[activeProjectId]) {
    chatterStore[activeProjectId] = chatterStore[activeProjectId].filter(m => m.id !== msgId);
  }
  renderChatter(activeProjectId);
  toast('Message deleted');
}

// ── Edit ───────────────────────────────────────────────────────────────
function chatterEdit(msgId) {
  // Cancel any other in-progress edit before starting a new one
  chatterEditingId = msgId;
  renderChatter(activeProjectId);
  setTimeout(() => {
    const ta = document.getElementById('chatterEditArea_' + msgId);
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, 30);
}

function chatterCancelEdit() {
  chatterEditingId = null;
  renderChatter(activeProjectId);
}

async function chatterSaveEdit(msgId) {
  const ta = document.getElementById('chatterEditArea_' + msgId);
  if (!ta) return;
  const newText = ta.value.trim();
  if (!newText) { toast('⚠ Message cannot be empty'); return; }

  // Find the message in local store
  const msgs = chatterStore[activeProjectId] || [];
  const msg = msgs.find(m => m.id === msgId);
  if (!msg) { chatterEditingId = null; renderChatter(activeProjectId); return; }
  if (msg.text === newText) { chatterEditingId = null; renderChatter(activeProjectId); return; }

  // Persist to Supabase (skip for unsynced local messages)
  if (sb && !msgId.startsWith('local_')) {
    const { error } = await sb.from('chatter').update({ text: newText }).eq('id', msgId);
    if (error) { console.warn('chatterSaveEdit', error); toast('⚠ Could not save edit'); return; }
  }

  // Update local store and exit edit mode
  msg.text = newText;
  chatterEditingId = null;
  renderChatter(activeProjectId);
  toast('Message updated');
}


// ── Post ───────────────────────────────────────────────────────────────
async function chatterPost() {
  const input = document.getElementById('chatterInput');
  if (!input) return;
  const text = input.innerText.trim();
  if (!text && !chatterAttachPending.length) return;
  if (!activeProjectId) return;
  const emp = currentEmployee || {};
  const authorName = emp.name || currentUser?.email?.split('@')[0] || 'Unknown';
  const authorInitials = emp.initials || authorName[0]?.toUpperCase() || '?';
  const authorColor = emp.color || '#888';
  // Collect @mentioned employee ids
  const mentionedNames = [...text.matchAll(/@([\w][\w ]*?)(?=\s|$)/g)].map(m => m[1].toLowerCase());
  const mentionedIds = employees.filter(e => mentionedNames.some(n => e.name?.toLowerCase().startsWith(n))).map(e => e.id);
  // Chip row (chatterNotifySelected) is the single source of truth for who gets
  // notified. For replies, it is pre-filled in chatterStartReply with the
  // parent's author + notifyIds (minus the current user), so we don't need to
  // re-fetch the parent author here. The user has full control via the chips.
  let allNotifyIds = [...new Set([...mentionedIds, ...chatterNotifySelected])];
  const msg = {
    proj_id: activeProjectId,
    author_id: currentEmployee?.id || null,
    author_name: authorName, author_initials: authorInitials, author_color: authorColor,
    text, attachments: chatterAttachPending.map(a => ({ name: a.name, size: a.size, dataUrl: a.dataUrl })),
    reply_to: chatterReplyTo ? chatterReplyTo.id : null,
    notify_ids: allNotifyIds,
    created_at: new Date().toISOString()
  };
  if (!chatterStore[activeProjectId]) chatterStore[activeProjectId] = [];
  const localMsg = {
    id: 'local_' + Date.now(),
    authorId: msg.author_id,
    authorName,
    authorInitials,
    authorColor,
    text,
    attachments: msg.attachments,
    replyTo: msg.reply_to,
    notifyIds: msg.notify_ids,
    ts: msg.created_at,
  };
  chatterStore[activeProjectId].unshift(localMsg);  // newest first
  renderChatter(activeProjectId);
  input.innerText = '';
  chatterAttachPending = [];
  chatterNotifySelected = [];
  chatterCancelReply();
  document.getElementById('chatterAttachPreview').innerHTML = '';
  chatterRenderNotifyChips();  try {
    const { data, error } = await sb.from('chatter').insert([msg]).select().single();
    if (!error && data) {
      const idx = chatterStore[activeProjectId].findIndex(m => m.id === localMsg.id);
      if (idx > -1) chatterStore[activeProjectId][idx] = { ...localMsg, id: data.id };
      // Save notifications
      if (allNotifyIds.length) {
        const proj = projects.find(p => p.id === activeProjectId);
        const notifRows = allNotifyIds.map(uid => ({
          employee_id: uid, proj_id: activeProjectId, msg_id: data.id,
          from_name: authorName, from_initials: authorInitials, from_color: authorColor,
          preview: text.slice(0, 80), is_read: false, created_at: new Date().toISOString()
        }));
        await sb.from('chatter_notifs').insert(notifRows);
        // Send email notifications via edge function
        const _notifProj = projects.find(p => p.id === activeProjectId);
        try {
          await sb.functions.invoke('send-notification', {
            body: {
              type: 'chatter_mention',
              data: {
                mentionedIds: allNotifyIds,
                authorName,
                projectName: _notifProj ? (_notifProj.emoji + ' ' + _notifProj.name) : 'a project',
                messageText: text.length > 500 ? text.slice(0, 500) + '…' : text,
              }
            }
          });
        } catch(e) { console.warn('Email notification failed:', e); }
      }
    }
  } catch(e) { console.warn('Chatter save error:', e); }
}

// ── Notifications ──────────────────────────────────────────────────────
async function loadNotifs() {
  if (!currentUser) return;
  const myEmp = currentEmployee;
  if (!myEmp) return;

  // Once-per-session prune: delete this user's READ notifications older than
  // 45 days. Unread items stay forever (some employees never clear their bell
  // and we don't want to silently lose unhandled notifications). Skipped while
  // impersonating, both because the write guard would block it and because
  // pruning under another identity is a destructive side-effect that should
  // never happen in a "view-only" session.
  const _isView = (typeof isImpersonating === 'function' && isImpersonating());
  if (!_notifsPruned && !_isView) {
    _notifsPruned = true;
    try {
      const cutoff = new Date(Date.now() - 45 * 86400000).toISOString();
      // Fire-and-forget — don't block the bell render on cleanup.
      sb.from('chatter_notifs').delete()
        .eq('employee_id', myEmp.id)
        .eq('is_read', true)
        .lt('created_at', cutoff)
        .then(({ error }) => {
          if (error) console.warn('[notifs] 45-day prune error:', error.message);
        });
    } catch(e) { console.warn('[notifs] prune exception:', e); }
  }

  try {
    const { data } = await sb.from('chatter_notifs')
      .select('*').eq('employee_id', myEmp.id).order('created_at', { ascending: false }).limit(40);
    notifStore = (data || []).map(r => ({
      id: r.id, projId: r.proj_id, msgId: r.msg_id,
      fromName: r.from_name, fromInitials: r.from_initials, fromColor: r.from_color,
      preview: r.preview, read: r.is_read, ts: r.created_at
    }));
  } catch(e) { notifStore = []; }
  renderNotifBadge();
  // Vacation request notifications arrive via the same chatter_notifs realtime
  // channel that calls loadNotifs(). Refreshing the Approvals badge here gives
  // managers near-realtime awareness of new pending requests without needing
  // a separate realtime subscription on vacation_requests.
  if (typeof updateApprovalsBadge === 'function') {
    try { updateApprovalsBadge(); } catch(e) { /* badge is best-effort */ }
  }
}
function renderNotifBadge() {
  const unread = notifStore.filter(n => !n.read).length;
  const badge = document.getElementById('notifBellBadge');
  if (badge) { badge.textContent = unread; badge.style.display = unread ? '' : 'none'; }
  updateChatterTabBadge(activeProjectId);
}
function updateChatterTabBadge(projId) {
  const unread = notifStore.filter(n => !n.read && n.projId === projId).length;
  document.querySelectorAll('.proj-tab').forEach(t => {
    if (t.dataset.sub === 'sub-chatter') {
      t.innerHTML = (unread ? '<span style="display:inline-flex;align-items:center;gap:5px">\uD83D\uDCAC Chatter <span style="background:var(--red);color:#fff;font-size:9px;font-weight:700;border-radius:10px;padding:1px 5px">' + unread + '</span></span>' : '\uD83D\uDCAC Chatter');
    }
  });
}
async function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  await loadNotifs();
  renderNotifPanel();
  panel.style.display = '';
}
function renderNotifPanel() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!notifStore.length) { list.innerHTML = '<div class="notif-empty">No notifications yet</div>'; return; }
  list.innerHTML = notifStore.map(n => {
    const proj = projects.find(p => p.id === n.projId);
    const timeStr = new Date(n.ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
    const displayPreview = (n.preview || '').replace(/\|\|(empId:[a-f0-9-]+|empHr:[a-f0-9-]+|surveyResp:[a-f0-9-]+|dm:[a-f0-9-]+|myinfo:hrrecords|issueTracker|closingReport)$/, '');
    return '<div class="notif-item' + (n.read ? '' : ' unread') + '" onclick="notifClick(\x27' + n.id + '\x27,\x27' + (n.projId||'') + '\x27)">' +
      '<div class="notif-item-avatar" style="background:' + (n.fromColor||'#888') + ';color:#fff">' + (n.fromInitials||'?') + '</div>' +
      '<div class="notif-item-body">' +
        '<div class="notif-item-title">' + (proj
          ? '<strong>' + n.fromName + '</strong> mentioned you in <strong>' + proj.name + '</strong>: ' + displayPreview
          : displayPreview
        ) + '</div>' +
        '<div class="notif-item-time">' + timeStr + '</div>' +
      '</div></div>';
  }).join('');
}
function notifClick(notifId, projId) {
  const n = notifStore.find(x => x.id === notifId);
  if (n) n.read = true;
  sb.from('chatter_notifs').update({ is_read: true }).eq('id', notifId).then(() => {});
  renderNotifBadge();
  document.getElementById('notifPanel').style.display = 'none';

  // Check for vacation notification — preview contains ||empId:uuid
  // Routes the requester (clicking on a status update about their own request)
  // to My Info → Vacation tab where their request history lives, and routes
  // the approver (clicking on a "X requested vacation" notification) to the
  // Approvals panel → Vacation Requests tab where approval actions live.
  const preview = n?.preview || '';
  const empMatch = preview.match(/\|\|empId:([a-f0-9-]+)$/);
  if (empMatch) {
    const requestingEmpId = empMatch[1];
    if (requestingEmpId === currentEmployee?.id) {
      // Requester clicking — go to their own My Info → Vacation tab
      if (typeof openMyInfoPanel === 'function') openMyInfoPanel(document.getElementById('navMyInfo'));
      setTimeout(() => { if (typeof switchMyInfoTab === 'function') switchMyInfoTab('vacation'); }, 250);
    } else {
      // Approver/manager clicking — go to Approvals panel and switch to Vacation tab
      const navAppr = document.getElementById('navApprovals');
      if (typeof openApprovalsPanel === 'function') {
        openApprovalsPanel(navAppr || null);
      } else if (typeof openSetupPanel === 'function') {
        openSetupPanel(document.getElementById('navSetup'));
      }
      setTimeout(() => { if (typeof switchApprovalsTab === 'function') switchApprovalsTab('vacation'); }, 250);
    }
    return;
  }

  // Check for employee HR Records routing — preview ends with ||empHr:uuid
  // Used when a manager is notified that a review has been acknowledged; routes them
  // to the subject employee's HR Records tab where the full review detail is visible.
  const empHrMatch = preview.match(/\|\|empHr:([a-f0-9-]+)$/);
  if (empHrMatch) {
    const subjectId = empHrMatch[1];
    if (typeof openEmployeesPanel === 'function') openEmployeesPanel(null);
    setTimeout(() => {
      if (typeof empProfileTab !== 'undefined') empProfileTab = 'hrrecords';
      if (typeof showEmpProfile === 'function') showEmpProfile(subjectId);
    }, 250);
    return;
  }

  // Check for self-HR-Records routing — preview ends with ||myinfo:hrrecords
  // Used when an employee is notified that their review has been released;
  // routes them to My Info → HR Records tab where the "acknowledge" banner is shown.
  if (preview.endsWith('||myinfo:hrrecords')) {
    if (typeof openMyInfoPanel === 'function') openMyInfoPanel(document.getElementById('navMyInfo'));
    setTimeout(() => { if (typeof switchMyInfoTab === 'function') switchMyInfoTab('hrrecords'); }, 250);
    return;
  }

  // Check for direct message notification — preview ends with ||dm:<convId>
  // Opens the DM panel and lands on that conversation.
  const dmMatch = preview.match(/\|\|dm:([a-f0-9-]+)$/);
  if (dmMatch) {
    const convId = dmMatch[1];
    if (typeof window.dmReplyFromToast === 'function') {
      window.dmReplyFromToast(convId);
    } else if (typeof window.dmTogglePanel === 'function') {
      // Fallback: open panel; user can find conv in list
      if (!window.dmPanelOpen) window.dmTogglePanel();
    }
    return;
  }

  // Check for issue tracker notification — preview ends with ||issueTracker
  if (preview.endsWith('||issueTracker')) {
    // Admins go to the Issue Tracker panel; everyone else goes to Home where
    // their "Your Open Submissions" card will show the reply.
    const isAdmin = currentUser && currentUser.email === 'rmcadoo@nulabs.com';
    if (isAdmin) {
      const navItem = document.getElementById('navIssueTracker');
      if (typeof openIssueTrackerPanel === 'function') openIssueTrackerPanel(navItem);
    } else {
      const navItem = document.getElementById('navHome');
      if (typeof openHomePanel === 'function') openHomePanel(navItem);
    }
    return;
  }

  // Check for survey response notification — preview ends with ||surveyResp:<invId>
  // Routes Scott / Jordan straight to the response detail modal so they can
  // see the customer's answers without navigating through the surveys panel.
  const surveyMatch = preview.match(/\|\|surveyResp:([a-f0-9-]+)$/);
  if (surveyMatch) {
    const invitationId = surveyMatch[1];
    if (typeof openSurveyResponseDetail === 'function') {
      openSurveyResponseDetail(invitationId);
    } else if (typeof openSurveyQueuePanel === 'function') {
      // Fallback: at least open the surveys panel so they can find it.
      openSurveyQueuePanel();
    }
    return;
  }

  // Check for closing report notification — preview ends with ||closingReport
  // Routes Jordan to the Closing Report panel where he can approve/reject
  // projects pending his review.
  if (preview.endsWith('||closingReport')) {
    const navItem = document.getElementById('navClosingReport');
    if (typeof openClosingReport === 'function') openClosingReport(navItem);
    return;
  }

  // Standard project chatter notification
  const isRealProject = projId && (typeof projects !== 'undefined') && projects.find(p => p.id === projId);
  if (!isRealProject) {
    if (typeof openMyInfoPanel === 'function') openMyInfoPanel(document.getElementById('navMyInfo'));
    return;
  }
  selectProject(projId, null);
  document.getElementById('navProjects')?.classList.add('active');
  setTimeout(() => switchProjTab('sub-chatter'), 200);
}
function markAllNotifsRead(e) {
  if (e) e.stopPropagation();
  const myEmp = currentEmployee;
  if (!myEmp) return;
  notifStore.forEach(n => n.read = true);
  sb.from('chatter_notifs').update({ is_read: true }).eq('employee_id', myEmp.id).then(() => {});
  renderNotifBadge();
  renderNotifPanel();
}
// Close notif panel on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.notif-bell-wrap')) {
    const p = document.getElementById('notifPanel');
    if (p) p.style.display = 'none';
  }

});

// ── Mention / Input ────────────────────────────────────────────────────
function chatterKeydown(e) {
  if (chatterMentionActive) {
    const items = document.querySelectorAll('.chatter-mention-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); chatterMentionSel = Math.min(chatterMentionSel+1, items.length-1); chatterHighlightMention(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); chatterMentionSel = Math.max(chatterMentionSel-1, 0); chatterHighlightMention(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (items[chatterMentionSel]) items[chatterMentionSel].click(); return; }
    if (e.key === 'Escape') { chatterCloseMention(); return; }
  }
  // Cmd+Enter (Mac) or Ctrl+Enter (Win) posts; plain Enter inserts a line
  // break (default contenteditable behavior). The Post button is always
  // available for mouse users. renderChatter() already converts \n → <br>
  // for display (see line ~79), so captured newlines render correctly.
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); chatterPost(); }
}
function chatterInputHandler(e) {
  const input = document.getElementById('chatterInput');
  const text = input.innerText;
  const sel = window.getSelection();
  const pos = sel.anchorOffset;
  const textBefore = text.slice(0, pos);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx > -1 && !textBefore.slice(atIdx).includes(' ')) {
    chatterMentionQuery = textBefore.slice(atIdx + 1).toLowerCase();
    chatterShowMention();
  } else { chatterCloseMention(); }
}
function chatterShowMention() {
  const drop = document.getElementById('chatterMentionDrop');
  if (!drop) return;
  const matches = employees.filter(e => e.name && e.name.toLowerCase().includes(chatterMentionQuery)).slice(0, 6);
  if (!matches.length) { chatterCloseMention(); return; }
  drop.innerHTML = matches.map((e, i) =>
    '<div class="chatter-mention-item' + (i===chatterMentionSel?' sel':'') + '" onclick="chatterPickMention(\x27' + e.name.replace(/'/g,"\x27") + '\x27)">' +
    '<div style="width:24px;height:24px;border-radius:50%;background:' + e.color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">' + e.initials + '</div>' +
    e.name + '</div>'
  ).join('');
  // Position above the input using fixed coords
  const input = document.getElementById('chatterInput');
  if (input) {
    const rect = input.getBoundingClientRect();
    drop.style.left = rect.left + 'px';
    drop.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    drop.style.top = 'auto';
    drop.style.width = Math.max(220, rect.width) + 'px';
  }
  drop.style.display = '';
  chatterMentionActive = true;
  chatterMentionSel = 0;
}
function chatterHighlightMention() {
  document.querySelectorAll('.chatter-mention-item').forEach((el, i) => el.classList.toggle('sel', i === chatterMentionSel));
}
function chatterCloseMention() {
  const drop = document.getElementById('chatterMentionDrop');
  if (drop) drop.style.display = 'none';
  chatterMentionActive = false;
}
function chatterPickMention(name) {
  const input = document.getElementById('chatterInput');
  const text = input.innerText;
  const sel = window.getSelection();
  const pos = sel.anchorOffset;
  const textBefore = text.slice(0, pos);
  const atIdx = textBefore.lastIndexOf('@');
  input.innerText = text.slice(0, atIdx) + '@' + name + ' ' + text.slice(pos);
  const range = document.createRange();
  const node = input.firstChild || input;
  const offset = Math.min(atIdx + name.length + 2, node.length || 0);
  try { range.setStart(node, offset); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); } catch(e) {}
  chatterCloseMention();
}

// ── Notify Multi-Select ────────────────────────────────────────────────
function chatterToggleNotifyDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('chatterNotifyDrop');
  const btn  = document.getElementById('chatterNotifyBtn');
  if (!drop) return;
  const isOpen = drop.style.display !== 'none';
  if (isOpen) { drop.style.display = 'none'; return; }
  // Position fixed relative to button (avoids overflow:hidden clipping)
  if (btn) {
    const rect = btn.getBoundingClientRect();
    drop.style.left   = rect.left + 'px';
    drop.style.top    = (rect.bottom + 6) + 'px';
    drop.style.bottom = 'auto';
    drop.style.width  = Math.max(230, rect.width) + 'px';
  }
  chatterRenderNotifyList('');
  drop.style.display = '';
  const s = document.getElementById('chatterNotifySearch');
  if (s) { s.value = ''; s.focus(); }
}
function chatterFilterNotifyList() {
  const q = (document.getElementById('chatterNotifySearch')?.value || '').toLowerCase();
  chatterRenderNotifyList(q);
}
function chatterRenderNotifyList(q) {
  const list = document.getElementById('chatterNotifyList');
  if (!list) return;
  const matches = employees.filter(e => {
    if (!e.name) return false;
    // Hide inactive / terminated employees
    if (e.isActive === false || e.terminationDate) return false;
    // Hide Ballantine department (handle null department safely)
    if ((e.dept || '').toLowerCase() === 'ballantine') return false;
    return !q || e.name.toLowerCase().includes(q);
  });
  if (!matches.length) { list.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--muted)">No employees found</div>'; return; }
  list.innerHTML = matches.map(e => {
    const sel = chatterNotifySelected.includes(e.id);
    return '<div class="chatter-notify-item' + (sel ? ' selected' : '') + '" onclick="chatterToggleNotifyEmp(\'' + e.id + '\')">' +
      '<div class="chatter-notify-avatar" style="background:' + e.color + ';color:#fff">' + e.initials + '</div>' +
      '<div class="chatter-notify-name">' + e.name + '</div>' +
      '<div class="chatter-notify-check">' + (sel ? '✓' : '') + '</div>' +
    '</div>';
  }).join('');
}
function chatterToggleNotifyEmp(empId) {
  const idx = chatterNotifySelected.indexOf(empId);
  if (idx > -1) chatterNotifySelected.splice(idx, 1);
  else chatterNotifySelected.push(empId);
  chatterRenderNotifyList((document.getElementById('chatterNotifySearch')?.value || '').toLowerCase());
  chatterRenderNotifyChips();
  chatterUpdateNotifyBtn();
}
function chatterUpdateNotifyBtn() {
  const btn = document.getElementById('chatterNotifyBtn');
  if (!btn) return;
  btn.textContent = chatterNotifySelected.length ? '🔔 Notify (' + chatterNotifySelected.length + ')' : '🔔 Notify';
  if (chatterNotifySelected.length) btn.classList.add('has-selections');
  else btn.classList.remove('has-selections');
}
function chatterRenderNotifyChips() {
  const wrap = document.getElementById('chatterNotifyChips');
  if (!wrap) return;
  if (!chatterNotifySelected.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = chatterNotifySelected.map(id => {
    const e = employees.find(x => x.id === id);
    if (!e) return '';
    return '<div class="chatter-notify-chip">' +
      '<div class="chatter-notify-chip-av" style="background:' + e.color + ';color:#fff">' + e.initials + '</div>' +
      e.name +
      '<button onclick="chatterToggleNotifyEmp(\'' + e.id + '\')" title="Remove">✕</button>' +
    '</div>';
  }).filter(Boolean).join('');
}
// Close notify dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#chatterNotifyWrap')) {
    const drop = document.getElementById('chatterNotifyDrop');
    if (drop) drop.style.display = 'none';
  }
});

// ── Chatter Groups (personal notify shortcuts) ─────────────────────────
// Per-user saved groups of employee ids. Click a group to chip everyone in.
// One group per user may be flagged is_default → auto-applied when a project's
// chatter loads (provided no chips are already selected).
// Hard cap: 5 groups per user. Name length capped at 40 chars (DB check).

const CHATTER_GROUPS_MAX = 5;

// Resolve current user → employee row. Tries currentEmployee first (set by
// auth.js after login), falls back to email lookup if needed.
function _chatterCurrentEmpId() {
  if (typeof currentEmployee !== 'undefined' && currentEmployee?.id) return currentEmployee.id;
  return null;
}

async function chatterLoadGroups() {
  const empId = _chatterCurrentEmpId();
  if (!empId || !sb) { chatterGroupsStore = []; return; }
  try {
    const { data, error } = await sb.from('chatter_groups')
      .select('*').eq('employee_id', empId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    chatterGroupsStore = (data || []).map(r => ({
      id: r.id, name: r.name, memberIds: r.member_ids || [], isDefault: !!r.is_default
    }));
  } catch(e) {
    console.warn('chatterLoadGroups error:', e);
    chatterGroupsStore = [];
  }
}

// Filter member ids the way the Notify dropdown does — drop inactive,
// terminated, or Ballantine-department employees. Silent skip.
function _chatterValidMemberIds(ids) {
  return (ids || []).filter(id => {
    const e = employees.find(x => x.id === id);
    if (!e || !e.name) return false;
    if (e.isActive === false || e.terminationDate) return false;
    if ((e.dept || '').toLowerCase() === 'ballantine') return false;
    return true;
  });
}

function chatterApplyGroup(groupId) {
  const g = chatterGroupsStore.find(x => x.id === groupId);
  if (!g) return;
  const valid = _chatterValidMemberIds(g.memberIds);
  // Additive merge with existing selection — no duplicates.
  chatterNotifySelected = [...new Set([...chatterNotifySelected, ...valid])];
  chatterRenderNotifyChips();
  chatterUpdateNotifyBtn();
  // Close the dropdown
  const drop = document.getElementById('chatterGroupsDrop');
  if (drop) drop.style.display = 'none';
}

function chatterApplyDefaultGroup() {
  if (!chatterGroupsStore || !chatterGroupsStore.length) return;
  if (chatterNotifySelected.length) return; // never overwrite existing chips
  const def = chatterGroupsStore.find(g => g.isDefault);
  if (!def) return;
  chatterApplyGroup(def.id);
}

function chatterToggleGroupsDrop(e) {
  e.stopPropagation();
  const drop = document.getElementById('chatterGroupsDrop');
  const btn  = document.getElementById('chatterGroupsBtn');
  if (!drop) return;
  const isOpen = drop.style.display !== 'none';
  if (isOpen) { drop.style.display = 'none'; return; }
  if (btn) {
    const rect = btn.getBoundingClientRect();
    drop.style.left   = rect.left + 'px';
    drop.style.top    = (rect.bottom + 6) + 'px';
    drop.style.bottom = 'auto';
    drop.style.width  = Math.max(240, rect.width) + 'px';
  }
  chatterRenderGroupsDropdown();
  drop.style.display = '';
}

function chatterRenderGroupsDropdown() {
  const list = document.getElementById('chatterGroupsList');
  if (!list) return;
  const atMax = chatterGroupsStore.length >= CHATTER_GROUPS_MAX;
  let html = '';
  if (!chatterGroupsStore.length) {
    html += '<div class="chatter-groups-empty">No groups yet. Create one to chip a team of recipients in one click.</div>';
  } else {
    html += chatterGroupsStore.map(g => {
      const memberCount = _chatterValidMemberIds(g.memberIds).length;
      const star = g.isDefault ? '⭐' : '';
      const nameEsc = (g.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return '<div class="chatter-groups-item' + (g.isDefault ? ' is-default' : '') + '" onclick="chatterApplyGroup(\'' + g.id + '\')">' +
        '<div class="chatter-groups-item-star">' + star + '</div>' +
        '<div class="chatter-groups-item-name">' + (g.name || '(unnamed)') + '</div>' +
        '<div class="chatter-groups-item-count">' + memberCount + '</div>' +
        '<button class="chatter-groups-item-edit" onclick="event.stopPropagation();chatterOpenGroupModal(\'' + g.id + '\')" title="Edit group">✏</button>' +
      '</div>';
    }).join('');
  }
  html += '<button class="chatter-groups-new" onclick="chatterOpenGroupModal(null)"' +
    (atMax ? ' disabled title="Maximum 5 groups"' : '') +
    '>+ New group' + (atMax ? ' (5/5 max)' : '') + '</button>';
  list.innerHTML = html;
}

// Close groups dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('#chatterGroupsWrap')) {
    const drop = document.getElementById('chatterGroupsDrop');
    if (drop) drop.style.display = 'none';
  }
});

// ── Group editor modal ────────────────────────────────────────────────
let _chatterGroupModalMemberIds = []; // working set while modal is open

function chatterOpenGroupModal(groupId) {
  // Block creation past the cap
  if (!groupId && chatterGroupsStore.length >= CHATTER_GROUPS_MAX) {
    toast('⚠ Maximum ' + CHATTER_GROUPS_MAX + ' groups');
    return;
  }
  // Close the Groups dropdown so it doesn't float over the modal
  const drop = document.getElementById('chatterGroupsDrop');
  if (drop) drop.style.display = 'none';
  _chatterEditingGroupId = groupId || null;
  const modal = document.getElementById('chatterGroupModal');
  const titleEl = document.getElementById('chatterGroupModalTitle');
  const nameInp = document.getElementById('chatterGroupNameInput');
  const defInp  = document.getElementById('chatterGroupDefaultInput');
  const delBtn  = document.getElementById('chatterGroupDeleteBtn');
  if (groupId) {
    const g = chatterGroupsStore.find(x => x.id === groupId);
    if (!g) return;
    titleEl.textContent = '👥 Edit Group';
    nameInp.value = g.name || '';
    defInp.checked = !!g.isDefault;
    _chatterGroupModalMemberIds = [...(g.memberIds || [])];
    if (delBtn) delBtn.style.display = '';
  } else {
    titleEl.textContent = '👥 New Group';
    nameInp.value = '';
    defInp.checked = false;
    _chatterGroupModalMemberIds = [];
    if (delBtn) delBtn.style.display = 'none';
  }
  const search = document.getElementById('chatterGroupMemberSearch');
  if (search) search.value = '';
  chatterRenderGroupModalMembers();
  chatterGroupModalValidate();
  modal.classList.add('open');
  setTimeout(() => nameInp?.focus(), 50);
}

function chatterCloseGroupModal() {
  const modal = document.getElementById('chatterGroupModal');
  if (modal) modal.classList.remove('open');
  _chatterEditingGroupId = null;
  _chatterGroupModalMemberIds = [];
}

function chatterGroupModalValidate() {
  const nameInp = document.getElementById('chatterGroupNameInput');
  const saveBtn = document.getElementById('chatterGroupSaveBtn');
  if (!nameInp || !saveBtn) return;
  const ok = nameInp.value.trim().length > 0;
  saveBtn.disabled = !ok;
  saveBtn.style.opacity = ok ? '1' : '0.5';
  saveBtn.style.cursor  = ok ? 'pointer' : 'not-allowed';
}

function chatterRenderGroupModalMembers() {
  const list = document.getElementById('chatterGroupMemberList');
  if (!list) return;
  const q = (document.getElementById('chatterGroupMemberSearch')?.value || '').toLowerCase();
  const matches = employees.filter(e => {
    if (!e.name) return false;
    if (e.isActive === false || e.terminationDate) return false;
    if ((e.dept || '').toLowerCase() === 'ballantine') return false;
    return !q || e.name.toLowerCase().includes(q);
  });
  // Selected first (alphabetical within each bucket), then the rest
  matches.sort((a, b) => {
    const aSel = _chatterGroupModalMemberIds.includes(a.id) ? 0 : 1;
    const bSel = _chatterGroupModalMemberIds.includes(b.id) ? 0 : 1;
    if (aSel !== bSel) return aSel - bSel;
    return (a.name || '').localeCompare(b.name || '');
  });
  // Update count label
  const countEl = document.getElementById('chatterGroupMemberCount');
  if (countEl) countEl.textContent = _chatterGroupModalMemberIds.length
    ? _chatterGroupModalMemberIds.length + ' selected'
    : 'None selected';
  if (!matches.length) {
    list.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--muted);text-align:center">No employees match</div>';
    return;
  }
  list.innerHTML = matches.map(e => {
    const sel = _chatterGroupModalMemberIds.includes(e.id);
    return '<div class="chatter-group-member-row' + (sel ? ' selected' : '') + '" onclick="chatterToggleGroupModalMember(\'' + e.id + '\')">' +
      '<div class="chatter-group-member-cb">' + (sel ? '✓' : '') + '</div>' +
      '<div class="chatter-notify-avatar" style="background:' + e.color + ';color:#fff">' + e.initials + '</div>' +
      '<div class="chatter-notify-name">' + e.name + '</div>' +
    '</div>';
  }).join('');
}

function chatterToggleGroupModalMember(empId) {
  const idx = _chatterGroupModalMemberIds.indexOf(empId);
  if (idx > -1) _chatterGroupModalMemberIds.splice(idx, 1);
  else _chatterGroupModalMemberIds.push(empId);
  chatterRenderGroupModalMembers();
}

async function chatterSaveGroup() {
  const empId = _chatterCurrentEmpId();
  if (!empId || !sb) { toast('⚠ Not signed in'); return; }
  const nameInp = document.getElementById('chatterGroupNameInput');
  const defInp  = document.getElementById('chatterGroupDefaultInput');
  const name = (nameInp?.value || '').trim();
  if (!name) { toast('⚠ Group name required'); return; }
  if (name.length > 40) { toast('⚠ Group name max 40 characters'); return; }
  const isDefault = !!defInp?.checked;
  const memberIds = [..._chatterGroupModalMemberIds];

  try {
    // If marking this as default, clear default on any other group first
    // (the unique partial index would otherwise reject the second true).
    if (isDefault) {
      const others = chatterGroupsStore.filter(g => g.isDefault && g.id !== _chatterEditingGroupId);
      for (const o of others) {
        await sb.from('chatter_groups').update({ is_default: false, updated_at: new Date().toISOString() }).eq('id', o.id);
      }
    }

    if (_chatterEditingGroupId) {
      // Update
      const { error } = await sb.from('chatter_groups').update({
        name, member_ids: memberIds, is_default: isDefault, updated_at: new Date().toISOString()
      }).eq('id', _chatterEditingGroupId);
      if (error) throw error;
    } else {
      // Insert — re-check cap server-side to avoid race
      if (chatterGroupsStore.length >= CHATTER_GROUPS_MAX) {
        toast('⚠ Maximum ' + CHATTER_GROUPS_MAX + ' groups');
        return;
      }
      const { error } = await sb.from('chatter_groups').insert({
        employee_id: empId, name, member_ids: memberIds, is_default: isDefault
      });
      if (error) throw error;
    }
    await chatterLoadGroups();
    chatterRenderGroupsDropdown();
    chatterCloseGroupModal();
    toast('Group saved');
  } catch(e) {
    console.warn('chatterSaveGroup error:', e);
    toast('⚠ Could not save group');
  }
}

async function chatterDeleteGroup() {
  if (!_chatterEditingGroupId || !sb) return;
  const g = chatterGroupsStore.find(x => x.id === _chatterEditingGroupId);
  if (!g) return;
  if (!confirm('Delete group "' + (g.name || '') + '"?')) return;
  try {
    const { error } = await sb.from('chatter_groups').delete().eq('id', _chatterEditingGroupId);
    if (error) throw error;
    await chatterLoadGroups();
    chatterRenderGroupsDropdown();
    chatterCloseGroupModal();
    toast('Group deleted');
  } catch(e) {
    console.warn('chatterDeleteGroup error:', e);
    toast('⚠ Could not delete group');
  }
}

// ── Attachments ────────────────────────────────────────────────────────
function chatterAttachFile(e) {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const sizeStr = file.size > 1024*1024 ? (file.size/1024/1024).toFixed(1)+'MB' : Math.round(file.size/1024)+'KB';
      chatterAttachPending.push({ name: file.name, size: sizeStr, dataUrl: ev.target.result });
      renderChatterPreviews();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}
function renderChatterPreviews() {
  const el = document.getElementById('chatterAttachPreview');
  if (!el) return;
  el.innerHTML = chatterAttachPending.map((a, i) =>
    '<div class="chatter-preview-chip">\uD83D\uDCCE ' + a.name + ' <span>(' + a.size + ')</span><button onclick="chatterRemoveAttach(' + i + ')">✕</button></div>'
  ).join('');
}
function chatterRemoveAttach(i) { chatterAttachPending.splice(i, 1); renderChatterPreviews(); }
function chatterOpenAttach(el) {
  const url = el.dataset.url; const name = el.dataset.name;
  if (!url) return;
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}



async function toggleCreditHold(projId) {
  if (!projectInfo[projId]) return;
  const oldVal = projectInfo[projId].creditHold;
  const newVal = !oldVal;
  projectInfo[projId].creditHold = newVal;
  renderProjStickyHeader(projId);
  try {
    await sb.from('project_info')
      .upsert({ project_id: projId, credit_hold: newVal }, { onConflict: 'project_id' });
  } catch(e) { console.warn('Credit hold save error:', e); }
}

async function toggleNeedUpdatedPo(projId) {
  if (!projectInfo[projId]) return;
  const oldVal = projectInfo[projId].needUpdatedPo;
  const newVal = !oldVal;
  projectInfo[projId].needUpdatedPo = newVal;
  renderProjStickyHeader(projId);
  try {
    if (sb) await sb.from('project_info')
      .upsert({ project_id: projId, need_updated_po: newVal }, { onConflict: 'project_id' });
  } catch(e) { console.warn('Need PO save error:', e); }
}


async function deleteProject(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  if (sb) {
    // Delete in order: chatter_notifs, chatter, timesheets, expenses, tasks, project_info, project
    await sb.from('chatter_notifs').delete().eq('proj_id', projId);
    await sb.from('chatter').delete().eq('proj_id', projId);
    await sb.from('expenses').delete().eq('project_id', projId);
    await sb.from('tasks').delete().eq('project_id', projId);
    await sb.from('project_info').delete().eq('project_id', projId);
    const { error } = await sb.from('projects').delete().eq('id', projId);
    if (error) { toast('⚠ Could not delete project'); return; }
  }
  // Remove from local stores
  projects = projects.filter(p => p.id !== projId);
  taskStore = taskStore.filter(t => t.proj !== projId);
  delete projectInfo[projId];
  delete chatterStore[projId];

  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'NUWorkspace';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navProjects')?.classList.add('active');
  showProjectView('panel-projects');
  renderProjectsTable();
  toast('Project deleted');
}


