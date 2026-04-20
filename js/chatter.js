
// ===== CHATTER =====
// ===== CHATTER =====
let chatterStore = {}; // { [projId]: [msg...] }
let chatterAttachPending = [];
let chatterMentionQuery = '';
let chatterMentionActive = false;
let chatterMentionSel = 0;
let chatterReplyTo = null; // { id, authorName, text }
let chatterNotifySelected = []; // array of employee ids chosen in notify dropdown
let notifStore = []; // { id, projId, projName, msgId, fromName, fromColor, fromInitials, text, ts, read }

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
}

function renderChatter(projId) {
  const feed = document.getElementById('chatterFeed');
  const selfAv = document.getElementById('chatterSelfAvatar');
  if (!feed) return;
  if (selfAv && currentUser) {
    const emp = currentEmployee || employees.find(e => e.userId === currentUser.id) || {};
    selfAv.textContent = emp.initials || currentUser.email?.[0]?.toUpperCase() || '?';
    selfAv.style.background = emp.color || 'var(--amber)';
    selfAv.style.color = '#fff';
  }
  const msgs = chatterMsgs(projId);
  // Separate top-level from replies
  const topLevel = msgs.filter(m => !m.replyTo);
  const replies = msgs.filter(m => m.replyTo);
  if (!topLevel.length) {
    feed.innerHTML = '<div class="chatter-empty"><div class="chatter-empty-icon">\u{1F4AC}</div><div>No messages yet \u2014 start the conversation!</div></div>';
    return;
  }
  let out = '';
  let lastDate = '';
  // Newest first (fetch is already descending)
  topLevel.forEach(m => {
    const d = new Date(m.ts);
    const dateStr = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    if (dateStr !== lastDate) { out += '<div class="chatter-date-divider">' + dateStr + '</div>'; lastDate = dateStr; }
    out += chatterMsgHtml(m, false);
    const kids = replies.filter(r => r.replyTo === m.id);
    if (kids.length) {
      out += '<div class="chatter-replies">';
      kids.forEach(k => { out += chatterMsgHtml(k, true); });
      out += '</div>';
    }
  });
  feed.innerHTML = out;
  feed.scrollTop = 0;
  // Update chatter tab badge
  updateChatterTabBadge(projId);
}

function chatterMsgHtml(m, isReply) {
  const d = new Date(m.ts);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const timeStr = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) +
    (sameYear ? '' : ', ' + d.getFullYear());
  const textHtml = (m.text || '').replace(/\n/g,'<br>').replace(/@([\w][\w ]*?)(?=\s|$|<br>)/g, '<span class="mention">@$1</span>');
  const attachHtml = m.attachments && m.attachments.length
    ? '<div class="chatter-msg-attachments">' + m.attachments.map(a =>
        '<div class="chatter-attach-chip" onclick="chatterOpenAttach(this)" data-url="' + (a.dataUrl||'') + '" data-name="' + a.name + '">\uD83D\uDCCE ' + a.name + ' <span style="color:var(--muted);font-size:10px">(' + a.size + ')</span></div>'
      ).join('') + '</div>' : '';
  const notifyHtml = m.notifyIds && m.notifyIds.length
    ? '<div style="font-size:11px;color:var(--muted);margin-top:3px">\uD83D\uDD14 ' + m.notifyIds.map(id => { const e = employees.find(x => x.id === id); return e ? '@'+e.name : ''; }).filter(Boolean).join(', ') + '</div>' : '';
  const isOwn = currentEmployee && (m.authorName === currentEmployee.name || m.authorId === currentUser?.id);
  const deleteBtn = isOwn && !isReply ? '<button class="chatter-action-btn" style="color:var(--muted)" onclick="chatterDelete(\x27' + m.id + '\x27)">🗑 Delete</button>' : '';
  const replyBtn = !isReply ? '<button class="chatter-action-btn" onclick="chatterStartReply(\x27' + m.id + '\x27,\x27' + (m.authorName||'').replace(/'/g,"\x27") + '\x27)">↩ Reply</button>' : '';
  const avatarClass = isReply ? 'chatter-reply-avatar' : 'chatter-msg-avatar';
  const msgClass = isReply ? 'chatter-reply-msg' : 'chatter-msg';
  return '<div class="' + msgClass + '" data-msg-id="' + m.id + '">' +
    '<div class="' + avatarClass + '" style="background:' + (m.authorColor||'#888') + ';color:#fff">' + (m.authorInitials||'?') + '</div>' +
    '<div class="chatter-msg-body">' +
      '<div class="chatter-msg-header"><span class="chatter-msg-name">' + m.authorName + '</span><span class="chatter-msg-time">' + timeStr + '</span></div>' +
      '<div class="chatter-msg-text">' + textHtml + '</div>' +
      attachHtml +
      '<div class="chatter-msg-actions">' + replyBtn + deleteBtn + '</div>' +
    '</div></div>';
}

// ── Reply ──────────────────────────────────────────────────────────────
function chatterStartReply(msgId, authorName) {
  chatterReplyTo = { id: msgId, authorName };
  const bar = document.getElementById('chatterReplyBar');
  const lbl = document.getElementById('chatterReplyLabel');
  if (bar) bar.style.display = 'flex';
  if (lbl) lbl.textContent = 'Replying to ' + authorName;
  document.getElementById('chatterInput')?.focus();
}
function chatterCancelReply() {
  chatterReplyTo = null;
  const bar = document.getElementById('chatterReplyBar');
  if (bar) bar.style.display = 'none';
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


// ── Post ───────────────────────────────────────────────────────────────
async function chatterPost() {
  const input = document.getElementById('chatterInput');
  if (!input) return;
  const text = input.innerText.trim();
  if (!text && !chatterAttachPending.length) return;
  if (!activeProjectId) return;
  const emp = currentEmployee || employees.find(e => e.userId === currentUser?.id) || {};
  const authorName = emp.name || currentUser?.email?.split('@')[0] || 'Unknown';
  const authorInitials = emp.initials || authorName[0]?.toUpperCase() || '?';
  const authorColor = emp.color || '#888';
  // Collect @mentioned employee ids
  const mentionedNames = [...text.matchAll(/@([\w][\w ]*?)(?=\s|$)/g)].map(m => m[1].toLowerCase());
  const mentionedIds = employees.filter(e => mentionedNames.some(n => e.name?.toLowerCase().startsWith(n))).map(e => e.id);
  let allNotifyIds = [...new Set([...mentionedIds, ...chatterNotifySelected])];
  
  // If this is a reply, also notify the original chatter author
  if (chatterReplyTo && chatterReplyTo.id) {
    try {
      const { data: originalMsg } = await sb.from('chatter')
        .select('author_id')
        .eq('id', chatterReplyTo.id)
        .single();
      
      if (originalMsg && originalMsg.author_id && originalMsg.author_id !== currentUser?.id) {
        // Find the employee record for the original author
        const originalAuthorEmp = employees.find(e => e.userId === originalMsg.author_id);
        if (originalAuthorEmp && !allNotifyIds.includes(originalAuthorEmp.id)) {
          allNotifyIds.push(originalAuthorEmp.id);
        }
      }
    } catch (error) {
      console.error('Error fetching original chatter author:', error);
    }
  }
  const msg = {
    proj_id: activeProjectId,
    author_id: currentUser?.id || null,
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
  const myEmp = currentEmployee || employees.find(e => e.userId === currentUser.id);
  if (!myEmp) return;
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
    const displayPreview = (n.preview || '').replace(/\|\|(empId:[a-f0-9-]+|empHr:[a-f0-9-]+|myinfo:hrrecords|issueTracker)$/, '');
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
  const preview = n?.preview || '';
  const empMatch = preview.match(/\|\|empId:([a-f0-9-]+)$/);
  if (empMatch) {
    const requestingEmpId = empMatch[1];
    if (requestingEmpId === currentEmployee?.id) {
      if (typeof openMyInfoPanel === 'function') openMyInfoPanel(document.getElementById('navMyInfo'));
    } else {
      if (typeof openEmployeesPanel === 'function') openEmployeesPanel(null);
      setTimeout(() => { if (typeof showEmpProfile === 'function') showEmpProfile(requestingEmpId); }, 250);
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
  const myEmp = currentEmployee || employees.find(e => e.userId === currentUser?.id);
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
  const matches = employees.filter(e => e.name && (!q || e.name.toLowerCase().includes(q)));
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
  // Update button label
  const btn = document.getElementById('chatterNotifyBtn');
  if (btn) btn.textContent = chatterNotifySelected.length ? '🔔 Notify (' + chatterNotifySelected.length + ')' : '🔔 Notify';
  if (chatterNotifySelected.length) btn?.classList.add('has-selections');
  else btn?.classList.remove('has-selections');
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
  const proj = projects.find(p => p.id === projId);
  logAuditChange('projects', projId, proj?.name||projId, 'credit_hold', oldVal, newVal);
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
  const proj = projects.find(p => p.id === projId);
  logAuditChange('projects', projId, proj?.name||projId, 'need_updated_po', oldVal, newVal);
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


