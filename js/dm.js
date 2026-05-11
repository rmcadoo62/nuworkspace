// ============================================================
// dm.js — Direct Messaging (DM) module
// ============================================================
// Floating chat bubble + panel for 1-on-1 and group conversations.
// Reuses chatter_notifs for the bell — we insert with preview ending
// in ||dm:<convId> so notifClick can route. See chatter.js displayPreview
// regex and the ||dm: branch in notifClick.
//
// Tables (see dm_migration.sql):
//   conversations, conversation_participants, direct_messages
// ============================================================

// ── State ───────────────────────────────────────────────────
let dmConvs       = [];     // [{id, name, is_group, _memberIds, _myLastReadAt, _unreadCount, _lastMessage, ...}]
let dmMsgsByConv  = {};     // convId -> [{id, sender_id, body, created_at, ...}]
let dmActiveConv  = null;   // currently-open conversation id, or null = list view
let dmPanelOpen   = false;
let dmToastTimer  = null;
let _dmInitForEmpId = null;     // employee id we last initialized for; lets dmInit re-run when the logged-in user changes (e.g. logout → login as someone else without page reload)

// ── Init / boot ─────────────────────────────────────────────
async function dmInit() {
  if (!currentEmployee) return;
  if (_dmInitForEmpId === currentEmployee.id) return;
  _dmInitForEmpId = currentEmployee.id;
  await dmLoadConversations();
  dmRenderBubble();
}

// Force-reload DM state for the currently-active currentEmployee. Used by
// View-As to swap to the impersonated user's DM bubble + conversations
// (and back to the real user on exit). Resets local caches and closes any
// open panel/conversation views so we don't leak the previous user's data.
async function dmReinitForCurrentUser() {
  dmConvs        = [];
  dmMsgsByConv   = {};
  dmActiveConv   = null;
  if (dmPanelOpen) {
    const panel = document.getElementById('dmPanel');
    if (panel) panel.style.display = 'none';
    dmPanelOpen = false;
  }
  if (!currentEmployee) {
    _dmInitForEmpId = null;
    dmRenderBubble();
    return;
  }
  _dmInitForEmpId = currentEmployee.id;
  await dmLoadConversations();
}

// Loads my conversations + member ids + last message + unread counts.
// Two queries: my participant rows, then conversations + last messages.
async function dmLoadConversations() {
  if (!currentEmployee) return;
  const myEmpId = currentEmployee.id;

  // 1. My participant rows (gives last_read_at + conversation IDs)
  const { data: myParts, error: e1 } = await sb
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('employee_id', myEmpId);
  if (e1) { console.error('[dm] load my participants:', e1); return; }
  if (!myParts || !myParts.length) { dmConvs = []; dmRenderBubble(); return; }

  const convIds = myParts.map(p => p.conversation_id);

  // 2. Conversations themselves
  const { data: convs, error: e2 } = await sb
    .from('conversations')
    .select('*')
    .in('id', convIds)
    .order('updated_at', { ascending: false });
  if (e2) { console.error('[dm] load conversations:', e2); return; }

  // 3. All participants of those convs (member display + last_read_at for receipts)
  const { data: allParts, error: e3 } = await sb
    .from('conversation_participants')
    .select('conversation_id, employee_id, last_read_at')
    .in('conversation_id', convIds);
  if (e3) { console.error('[dm] load all participants:', e3); return; }

  // 4. Recent messages for unread counts + previews.
  // Pull last 100 messages per conv conservatively; compute unread + last from this set.
  const { data: recentMsgs, error: e4 } = await sb
    .from('direct_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
    .limit(500);
  if (e4) { console.error('[dm] load recent messages:', e4); return; }

  // Compose
  dmConvs = (convs || []).map(c => {
    const myPart = myParts.find(p => p.conversation_id === c.id);
    const partsForConv = (allParts || []).filter(p => p.conversation_id === c.id);
    const memberIds = partsForConv.map(p => p.employee_id);
    const partReads = {};
    partsForConv.forEach(p => { partReads[p.employee_id] = p.last_read_at; });
    const msgs = (recentMsgs || []).filter(m => m.conversation_id === c.id);
    const lastMessage = msgs[0] || null;
    const lastReadAt = myPart?.last_read_at || '1970-01-01T00:00:00Z';
    const unread = msgs.filter(m =>
      m.sender_id !== myEmpId &&
      new Date(m.created_at) > new Date(lastReadAt)
    ).length;
    // Cache messages for later
    dmMsgsByConv[c.id] = msgs.slice().reverse(); // chronological
    return {
      ...c,
      _myLastReadAt: lastReadAt,
      _memberIds: memberIds,
      _participantReads: partReads,
      _lastMessage: lastMessage,
      _unreadCount: unread,
    };
  });

  dmRenderBubble();
  if (dmPanelOpen) dmRenderPanel();
}

// ── Helpers ────────────────────────────────────────────────
function dmTotalUnread() {
  return dmConvs.reduce((sum, c) => sum + (c._unreadCount || 0), 0);
}

function dmConvDisplayName(c) {
  if (c.name) return c.name;
  // Auto-name from non-self members
  const others = (c._memberIds || [])
    .filter(id => id !== currentEmployee?.id)
    .map(id => employees.find(e => e.id === id))
    .filter(Boolean);
  if (!others.length) return '(empty conversation)';
  if (others.length === 1) return others[0].name;
  return others.map(e => e.name.split(' ')[0]).join(', ');
}

function dmConvAvatar(c) {
  // Group: show participant count badge
  if (c.is_group) {
    const count = (c._memberIds || []).length;
    return '<div class="dm-avatar dm-avatar-group">' + count + '</div>';
  }
  // 1-on-1: show the other person's avatar
  const otherId = (c._memberIds || []).find(id => id !== currentEmployee?.id);
  const other = employees.find(e => e.id === otherId);
  if (!other) return '<div class="dm-avatar" style="background:#888;color:#fff">?</div>';
  return '<div class="dm-avatar" style="background:' + other.color + ';color:#fff">' +
    (other.initials || '?') + '</div>';
}

function dmFmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _dmEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Bubble (always-visible floating button) ─────────────────
function dmRenderBubble() {
  let bubble = document.getElementById('dmBubble');
  if (!bubble) {
    // Create scaffolding lazily in case index.html hasn't been updated yet
    const wrap = document.createElement('div');
    wrap.id = 'dmRoot';
    wrap.innerHTML = `
      <div id="dmBubble" onclick="dmTogglePanel()">
        <span class="dm-bubble-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></span>
        <span id="dmBubbleBadge" class="dm-bubble-badge" style="display:none">0</span>
      </div>
      <div id="dmPanel" style="display:none"></div>
      <div id="dmToast" style="display:none"></div>
    `;
    document.body.appendChild(wrap);
    bubble = document.getElementById('dmBubble');
  }
  const badge = document.getElementById('dmBubbleBadge');
  const total = dmTotalUnread();
  if (badge) {
    badge.textContent = total > 99 ? '99+' : total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
}

function dmTogglePanel() {
  const panel = document.getElementById('dmPanel');
  if (!panel) return;
  dmPanelOpen = !dmPanelOpen;
  if (dmPanelOpen) {
    panel.style.display = 'block';
    dmRenderPanel();
  } else {
    panel.style.display = 'none';
    dmActiveConv = null;
  }
}

function dmClosePanel() {
  dmPanelOpen = false;
  dmActiveConv = null;
  const panel = document.getElementById('dmPanel');
  if (panel) panel.style.display = 'none';
}

// ── Panel (list view + conversation view) ───────────────────
function dmRenderPanel() {
  const panel = document.getElementById('dmPanel');
  if (!panel) return;
  if (dmActiveConv) dmRenderConversationView();
  else dmRenderListView();
}

function dmRenderListView() {
  const panel = document.getElementById('dmPanel');
  if (!panel) return;
  const items = dmConvs.map(c => {
    const unread = c._unreadCount || 0;
    const cls = 'dm-thread' + (unread > 0 ? ' dm-thread-unread' : '');
    const last = c._lastMessage;
    let preview = '';
    if (last) {
      const senderEmp = last.sender_id === currentEmployee?.id ? null : employees.find(e => e.id === last.sender_id);
      const prefix = c.is_group && senderEmp
        ? _dmEsc(senderEmp.name.split(' ')[0]) + ': '
        : (last.sender_id === currentEmployee?.id ? 'You: ' : '');
      preview = prefix + _dmEsc((last.body || '').slice(0, 60));
    }
    const timeStr = last ? dmFmtTime(last.created_at) : '';
    return `<div class="${cls}" onclick="dmOpenConversation('${c.id}')">
      ${dmConvAvatar(c)}
      <div class="dm-thread-body">
        <div class="dm-thread-row1">
          <span class="dm-thread-name">${_dmEsc(dmConvDisplayName(c))}</span>
          <span class="dm-thread-time">${timeStr}</span>
        </div>
        <div class="dm-thread-preview">${preview || '<span style="opacity:.5">No messages yet</span>'}</div>
      </div>
      ${unread > 0 ? '<div class="dm-thread-unread-dot">' + (unread > 9 ? '9+' : unread) + '</div>' : ''}
      <button class="dm-thread-delete" onclick="event.stopPropagation();dmConfirmDelete('${c.id}')" title="${c.is_group ? 'Leave group' : 'Delete conversation'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
      </button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="dm-panel-header">
      <span class="dm-panel-title">Messages</span>
      <div class="dm-panel-header-actions">
        <button class="dm-icon-btn" onclick="dmOpenNewConversation()" title="New conversation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="dm-icon-btn" onclick="dmTogglePanel()" title="Close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="dm-thread-list">
      ${items || '<div class="dm-empty">No conversations yet. Tap + to start one.</div>'}
    </div>
  `;
}

async function dmOpenConversation(convId) {
  dmActiveConv = convId;
  // Mark as read
  const nowIso = new Date().toISOString();
  await sb.from('conversation_participants')
    .update({ last_read_at: nowIso })
    .eq('conversation_id', convId)
    .eq('employee_id', currentEmployee.id);
  // Update local cache
  const conv = dmConvs.find(c => c.id === convId);
  if (conv) {
    conv._myLastReadAt = nowIso;
    conv._unreadCount = 0;
    if (!conv._participantReads) conv._participantReads = {};
    conv._participantReads[currentEmployee.id] = nowIso;
  }
  // Make sure we have messages — fetch fresh batch
  await dmLoadMessages(convId);
  dmRenderConversationView();
  dmRenderBubble();
}

async function dmLoadMessages(convId) {
  const { data, error } = await sb.from('direct_messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) { console.error('[dm] load messages:', error); return; }
  dmMsgsByConv[convId] = data || [];
}

function dmRenderConversationView() {
  const panel = document.getElementById('dmPanel');
  if (!panel) return;
  const conv = dmConvs.find(c => c.id === dmActiveConv);
  if (!conv) { dmActiveConv = null; dmRenderListView(); return; }
  const msgs = dmMsgsByConv[conv.id] || [];

  const msgsHtml = msgs.map(m => {
    const isMine = m.sender_id === currentEmployee?.id;
    const sender = employees.find(e => e.id === m.sender_id);
    const senderName = sender ? sender.name.split(' ')[0] : '?';
    const time = dmFmtTime(m.created_at);
    const showSenderName = conv.is_group && !isMine;
    // Read receipt: 1-on-1 only. "Read" if the other party's last_read_at >= this msg.
    let receipt = '';
    if (isMine) {
      if (!conv.is_group) {
        const otherEmpId = (conv._memberIds || []).find(id => id !== currentEmployee?.id);
        const otherLastRead = otherEmpId ? conv._participantReads?.[otherEmpId] : null;
        const isRead = otherLastRead && new Date(otherLastRead) >= new Date(m.created_at);
        receipt = ' &middot; ' + (isRead ? '<span class="dm-msg-read">Read</span>' : 'Sent');
      } else {
        receipt = ' &middot; Sent';
      }
    }
    return `<div class="dm-msg ${isMine ? 'dm-msg-mine' : 'dm-msg-other'}">
      ${showSenderName ? '<div class="dm-msg-sender">' + _dmEsc(senderName) + '</div>' : ''}
      <div class="dm-msg-bubble">${_dmEsc(m.body)}</div>
      <div class="dm-msg-time">${time}${receipt}</div>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="dm-panel-header">
      <button class="dm-icon-btn" onclick="dmBackToList()" title="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      ${dmConvAvatar(conv)}
      <span class="dm-panel-title" style="flex:1">${_dmEsc(dmConvDisplayName(conv))}</span>
      <button class="dm-icon-btn" onclick="dmTogglePanel()" title="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="dm-reminder">For project conversations, use the project's Chatter tab. No CUI in DMs.</div>
    <div class="dm-msg-list" id="dmMsgList">
      ${msgsHtml || '<div class="dm-empty">Say hi.</div>'}
    </div>
    <div class="dm-composer">
      <textarea id="dmComposeInput" class="dm-compose-input" placeholder="Type a message..." rows="1"
        oninput="_dmAutoGrow(this)" onkeydown="_dmComposeKey(event)"></textarea>
      <button class="dm-send-btn" onclick="dmSendFromComposer()" title="Send">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  `;
  // Scroll to bottom
  setTimeout(() => {
    const list = document.getElementById('dmMsgList');
    if (list) list.scrollTop = list.scrollHeight;
    document.getElementById('dmComposeInput')?.focus();
  }, 30);
}

function dmBackToList() {
  dmActiveConv = null;
  dmRenderListView();
}

function _dmAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function _dmComposeKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    dmSendFromComposer();
  }
}

async function dmSendFromComposer() {
  const input = document.getElementById('dmComposeInput');
  if (!input || !dmActiveConv) return;
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  input.style.height = 'auto';
  await dmSendMessage(dmActiveConv, body);
}

async function dmSendMessage(convId, body) {
  if (!currentEmployee) return;
  const conv = dmConvs.find(c => c.id === convId);
  if (!conv) return;

  // Optimistic insert into local cache
  const tempId = '_temp_' + Date.now();
  const optimistic = {
    id: tempId,
    conversation_id: convId,
    sender_id: currentEmployee.id,
    body,
    created_at: new Date().toISOString(),
  };
  dmMsgsByConv[convId] = (dmMsgsByConv[convId] || []).concat(optimistic);
  if (dmActiveConv === convId) dmRenderConversationView();

  // Insert
  const { data, error } = await sb.from('direct_messages').insert([{
    conversation_id: convId,
    sender_id: currentEmployee.id,
    body,
  }]).select().single();
  if (error) {
    console.error('[dm] send failed:', error);
    if (typeof toast === 'function') toast('Failed to send message');
    // Remove optimistic
    dmMsgsByConv[convId] = (dmMsgsByConv[convId] || []).filter(m => m.id !== tempId);
    if (dmActiveConv === convId) dmRenderConversationView();
    return;
  }
  // Replace temp with real
  if (data) {
    dmMsgsByConv[convId] = (dmMsgsByConv[convId] || []).map(m => m.id === tempId ? data : m);
    conv._lastMessage = data;
    if (dmActiveConv === convId) dmRenderConversationView();
  }

  // Notify other participants via chatter_notifs
  const otherIds = (conv._memberIds || []).filter(id => id !== currentEmployee.id);
  if (otherIds.length) {
    const senderInitials = currentEmployee.initials || '?';
    const senderColor    = currentEmployee.color || '#888';
    const senderName     = currentEmployee.name;
    const previewBody    = body.slice(0, 80);
    const convDisplay    = dmConvDisplayName(conv);
    // For groups, prefix with conv name; for 1-on-1 the sender name is enough
    const previewText    = conv.is_group
      ? `${senderName} in ${convDisplay}: ${previewBody}`
      : `${senderName}: ${previewBody}`;
    const rows = otherIds.map(empId => ({
      employee_id: empId,
      msg_id:      null,
      proj_id:     null,
      from_name:   senderName,
      from_color:  senderColor,
      from_initials: senderInitials,
      preview:     previewText + '||dm:' + convId,
      is_read:     false,
    }));
    await sb.from('chatter_notifs').insert(rows);
  }
}

// ── Realtime: incoming message handler ──────────────────────
async function dmOnIncomingMessage(payload) {
  const m = payload.new;
  if (!m) return;
  const convId = m.conversation_id;
  // If the conv isn't in my list, refresh to find out (could be a new conv I was just added to)
  let conv = dmConvs.find(c => c.id === convId);
  if (!conv) {
    await dmLoadConversations();
    conv = dmConvs.find(c => c.id === convId);
    if (!conv) return; // not a participant; ignore
  }
  // Append to message cache
  if (!dmMsgsByConv[convId]) dmMsgsByConv[convId] = [];
  // Skip if already there (our own optimistic insert may have been replaced before realtime arrives)
  if (!dmMsgsByConv[convId].find(x => x.id === m.id)) {
    dmMsgsByConv[convId].push(m);
  }
  conv._lastMessage = m;
  // Bump unread count if it's not from me and the conv isn't currently open
  const isMine = m.sender_id === currentEmployee?.id;
  if (!isMine && dmActiveConv !== convId) {
    conv._unreadCount = (conv._unreadCount || 0) + 1;
    dmShowToast(m, conv);
  }
  // Reorder convs: move this one to top
  dmConvs = dmConvs.filter(c => c.id !== convId);
  dmConvs.unshift(conv);

  dmRenderBubble();
  if (dmPanelOpen) dmRenderPanel();
  // If active conv is this one, mark read (user is looking at it)
  if (dmActiveConv === convId && !isMine) {
    await sb.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('employee_id', currentEmployee.id);
    conv._unreadCount = 0;
    dmRenderBubble();
  }
}

// ── Toast notification ──────────────────────────────────────
function dmShowToast(msg, conv) {
  // If the panel is already open, the list re-renders with the unread badge —
  // a toast on top of it would overlap and feel redundant. Skip.
  if (dmPanelOpen) return;
  const toastEl = document.getElementById('dmToast');
  if (!toastEl) return;
  const sender = employees.find(e => e.id === msg.sender_id);
  const fromInitials = sender?.initials || '?';
  const fromColor    = sender?.color || '#888';
  const fromName     = sender?.name || 'Someone';
  const ctx = conv.is_group ? ' in ' + _dmEsc(dmConvDisplayName(conv)) : '';
  toastEl.innerHTML = `
    <div class="dm-toast-card">
      <div class="dm-toast-row">
        <div class="dm-avatar" style="background:${fromColor};color:#fff;width:22px;height:22px;font-size:9px">${fromInitials}</div>
        <div class="dm-toast-body">
          <div class="dm-toast-name">${_dmEsc(fromName)}${ctx}</div>
          <div class="dm-toast-preview">${_dmEsc((msg.body || '').slice(0, 80))}</div>
        </div>
      </div>
      <div class="dm-toast-actions">
        <button class="dm-toast-btn" onclick="dmDismissToast()">Dismiss</button>
        <button class="dm-toast-btn dm-toast-btn-primary" onclick="dmReplyFromToast('${conv.id}')">Reply</button>
      </div>
    </div>
  `;
  toastEl.style.display = 'block';
  clearTimeout(dmToastTimer);
  dmToastTimer = setTimeout(dmDismissToast, 6000);
}

function dmDismissToast() {
  clearTimeout(dmToastTimer);
  const toastEl = document.getElementById('dmToast');
  if (toastEl) { toastEl.style.display = 'none'; toastEl.innerHTML = ''; }
}

function dmReplyFromToast(convId) {
  dmDismissToast();
  if (!dmPanelOpen) {
    dmPanelOpen = true;
    document.getElementById('dmPanel').style.display = 'block';
  }
  dmOpenConversation(convId);
}

// ── New conversation flow ───────────────────────────────────
let _dmNewSelected = []; // employee ids selected in the picker

function dmOpenNewConversation() {
  _dmNewSelected = [];
  dmRenderNewConversationView('');
}

function dmRenderNewConversationView(searchQuery) {
  const panel = document.getElementById('dmPanel');
  if (!panel) return;
  const q = (searchQuery || '').toLowerCase();
  const candidates = (employees || []).filter(e => {
    if (!e || !e.id || !e.name) return false;
    if (e.id === currentEmployee?.id) return false;
    if (e.isActive === false || e.terminationDate) return false;
    if ((e.dept || '').toLowerCase() === 'ballantine') return false;
    return !q || e.name.toLowerCase().includes(q);
  });

  const itemsHtml = candidates.map(e => {
    const sel = _dmNewSelected.includes(e.id);
    return `<div class="dm-picker-item ${sel ? 'selected' : ''}" onclick="_dmTogglePickerEmp('${e.id}')">
      <div class="dm-avatar" style="background:${e.color};color:#fff;width:24px;height:24px;font-size:9px">${e.initials || '?'}</div>
      <span class="dm-picker-name">${_dmEsc(e.name)}</span>
      <span class="dm-picker-check">${sel ? '&#10003;' : ''}</span>
    </div>`;
  }).join('');

  const isGroup = _dmNewSelected.length >= 2;

  panel.innerHTML = `
    <div class="dm-panel-header">
      <button class="dm-icon-btn" onclick="dmBackToList()" title="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <span class="dm-panel-title" style="flex:1">New conversation</span>
      <button class="dm-icon-btn" onclick="dmTogglePanel()" title="Close">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="dm-picker-search-wrap">
      <input type="text" id="dmPickerSearch" class="dm-picker-search" placeholder="Search people..."
        oninput="dmRenderNewConversationView(this.value)" value="${_dmEsc(searchQuery)}" autofocus>
    </div>
    ${isGroup ? `
      <div class="dm-picker-group-name-wrap">
        <input type="text" id="dmGroupNameInput" class="dm-picker-group-name" placeholder="Group name (optional)"
          maxlength="60">
      </div>` : ''}
    <div class="dm-picker-list">${itemsHtml || '<div class="dm-empty">No matches</div>'}</div>
    <div class="dm-picker-actions">
      <span class="dm-picker-count">${_dmNewSelected.length} selected</span>
      <button class="dm-create-btn" ${_dmNewSelected.length === 0 ? 'disabled' : ''} onclick="dmCreateConversationFromPicker()">
        ${isGroup ? 'Create group' : 'Start chat'}
      </button>
    </div>
  `;
  // Restore search focus
  if (searchQuery) {
    const inp = document.getElementById('dmPickerSearch');
    if (inp) { inp.focus(); inp.setSelectionRange(searchQuery.length, searchQuery.length); }
  }
}

function _dmTogglePickerEmp(empId) {
  const idx = _dmNewSelected.indexOf(empId);
  if (idx >= 0) _dmNewSelected.splice(idx, 1);
  else _dmNewSelected.push(empId);
  const search = document.getElementById('dmPickerSearch')?.value || '';
  dmRenderNewConversationView(search);
}

async function dmCreateConversationFromPicker() {
  if (!_dmNewSelected.length || !currentEmployee) return;
  const isGroup = _dmNewSelected.length >= 2;
  let name = null;
  if (isGroup) {
    const inp = document.getElementById('dmGroupNameInput');
    name = (inp?.value || '').trim() || null;
  }

  // For 1-on-1: check if a conversation already exists with that exact pair
  if (!isGroup) {
    const otherId = _dmNewSelected[0];
    const existing = dmConvs.find(c => !c.is_group &&
      (c._memberIds || []).length === 2 &&
      c._memberIds.includes(otherId) &&
      c._memberIds.includes(currentEmployee.id));
    if (existing) {
      _dmNewSelected = [];
      await dmOpenConversation(existing.id);
      return;
    }
  }

  // Create the conversation
  const { data: convRow, error: e1 } = await sb.from('conversations').insert([{
    name,
    is_group: isGroup,
    created_by: currentEmployee.id,
  }]).select().single();
  if (e1) { console.error('[dm] create conversation:', e1); if (typeof toast === 'function') toast('Failed to create conversation'); return; }

  // Add participants (me + selected)
  const partRows = [{ conversation_id: convRow.id, employee_id: currentEmployee.id }]
    .concat(_dmNewSelected.map(eid => ({ conversation_id: convRow.id, employee_id: eid })));
  const { error: e2 } = await sb.from('conversation_participants').insert(partRows);
  if (e2) { console.error('[dm] add participants:', e2); if (typeof toast === 'function') toast('Failed to add members'); return; }

  // Add to local cache
  const newConv = {
    ...convRow,
    _myLastReadAt: new Date().toISOString(),
    _memberIds: [currentEmployee.id].concat(_dmNewSelected),
    _lastMessage: null,
    _unreadCount: 0,
  };
  dmConvs.unshift(newConv);
  dmMsgsByConv[newConv.id] = [];
  _dmNewSelected = [];
  await dmOpenConversation(newConv.id);
}

// ── Delete conversation flow ────────────────────────────────
// Conversation-level delete only (no per-message). Two paths:
//   1. Self delete: removes only my participant row → conversation
//      stays for the other side. For groups this is "leave group".
//   2. Owner override: deletes the conversation row entirely, which
//      cascades to participants + messages.
// Confirmation overlay is appended to #dmRoot so capture-phase outside-
// click handler doesn't close the panel underneath.

function dmConfirmDelete(convId) {
  const conv = dmConvs.find(c => c.id === convId);
  if (!conv) return;
  const isOwner = !!currentEmployee?.isOwner;
  const isGroup = !!conv.is_group;

  let title, body, primaryLabel;
  if (isGroup) {
    title = 'Leave this group?';
    body  = "You'll be removed from \"" + dmConvDisplayName(conv) + "\". Other members will continue without you.";
    primaryLabel = 'Leave group';
  } else {
    const otherEmp = (conv._memberIds || [])
      .map(id => employees.find(e => e.id === id))
      .find(e => e && e.id !== currentEmployee?.id);
    const otherName = otherEmp?.name || 'the other person';
    title = 'Delete this conversation?';
    body  = 'This will permanently delete the conversation with ' + otherName + ' for both of you. Messages will be removed.';
    primaryLabel = 'Delete';
  }

  const existing = document.getElementById('dmConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dmConfirmOverlay';
  overlay.className = 'dm-confirm-overlay';
  // Owner override link only makes sense for groups — for 1-on-1s,
  // "delete" already nukes the whole thing via the auto-clean trigger.
  const ownerLinkHtml = (isOwner && isGroup)
    ? `<a href="#" class="dm-confirm-owner-link" onclick="event.preventDefault();dmConfirmOwnerDelete('${convId}')">Delete entirely (owner override)</a>`
    : '';
  overlay.innerHTML = `
    <div class="dm-confirm-modal" onclick="event.stopPropagation()">
      <div class="dm-confirm-title">${_dmEsc(title)}</div>
      <div class="dm-confirm-body">${_dmEsc(body)}</div>
      <div class="dm-confirm-actions">
        <button class="dm-confirm-cancel" onclick="dmCancelDelete()">Cancel</button>
        <button class="dm-confirm-primary" onclick="dmDeleteForSelf('${convId}')">${_dmEsc(primaryLabel)}</button>
      </div>
      ${ownerLinkHtml}
    </div>
  `;
  overlay.onclick = dmCancelDelete; // click on overlay backdrop closes
  const root = document.getElementById('dmRoot');
  if (root) root.appendChild(overlay);
}

function dmConfirmOwnerDelete(convId) {
  const conv = dmConvs.find(c => c.id === convId);
  if (!conv) return;
  const name = dmConvDisplayName(conv);

  const existing = document.getElementById('dmConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dmConfirmOverlay';
  overlay.className = 'dm-confirm-overlay';
  overlay.innerHTML = `
    <div class="dm-confirm-modal" onclick="event.stopPropagation()">
      <div class="dm-confirm-title" style="color:var(--red)">Delete entirely?</div>
      <div class="dm-confirm-body">
        This will permanently delete the conversation with <strong>${_dmEsc(name)}</strong> for ALL participants. Messages will be removed. This action is logged.
      </div>
      <div class="dm-confirm-actions">
        <button class="dm-confirm-cancel" onclick="dmCancelDelete()">Cancel</button>
        <button class="dm-confirm-primary dm-confirm-danger" onclick="dmDeleteForEveryone('${convId}')">Delete for everyone</button>
      </div>
    </div>
  `;
  overlay.onclick = dmCancelDelete;
  const root = document.getElementById('dmRoot');
  if (root) root.appendChild(overlay);
}

function dmCancelDelete() {
  document.getElementById('dmConfirmOverlay')?.remove();
}

async function dmDeleteForSelf(convId) {
  dmCancelDelete();
  if (!currentEmployee) return;
  const conv = dmConvs.find(c => c.id === convId);
  if (!conv) return;

  // Optimistic local removal
  const convLabel = dmConvDisplayName(conv);
  const isGroup = conv.is_group;
  dmConvs = dmConvs.filter(c => c.id !== convId);
  delete dmMsgsByConv[convId];
  if (dmActiveConv === convId) dmActiveConv = null;
  dmRenderBubble();
  if (dmPanelOpen) dmRenderListView();

  // DB: remove my participant row
  const { error } = await sb.from('conversation_participants')
    .delete()
    .eq('conversation_id', convId)
    .eq('employee_id', currentEmployee.id);
  if (error) {
    console.error('[dm] delete self participant:', error);
    if (typeof toast === 'function') toast('Failed to remove conversation');
    await dmLoadConversations(); // recover from optimistic state
    return;
  }
}

async function dmDeleteForEveryone(convId) {
  dmCancelDelete();
  if (!currentEmployee?.isOwner) return;
  const conv = dmConvs.find(c => c.id === convId);
  if (!conv) return;

  const convLabel = dmConvDisplayName(conv);

  // Optimistic local removal
  dmConvs = dmConvs.filter(c => c.id !== convId);
  delete dmMsgsByConv[convId];
  if (dmActiveConv === convId) dmActiveConv = null;
  dmRenderBubble();
  if (dmPanelOpen) dmRenderListView();

  // DB: hard delete the conversation (cascades to participants + messages)
  const { error } = await sb.from('conversations').delete().eq('id', convId);
  if (error) {
    console.error('[dm] owner delete conversation:', error);
    if (typeof toast === 'function') toast('Failed to delete conversation');
    await dmLoadConversations();
    return;
  }
}

// Realtime: someone removed me from a conversation (or owner nuked it).
// Either way, my participant row is gone — drop the conv from my view.
function dmOnDeletedParticipant(payload) {
  if (!payload?.old || !currentEmployee) return;
  if (payload.old.employee_id !== currentEmployee.id) return;
  const convId = payload.old.conversation_id;
  dmConvs = dmConvs.filter(c => c.id !== convId);
  delete dmMsgsByConv[convId];
  if (dmActiveConv === convId) dmActiveConv = null;
  dmRenderBubble();
  if (dmPanelOpen) dmRenderListView();
}

// Realtime: a participant updated their last_read_at (i.e., opened the convo).
// Refresh receipts on any of MY messages they've now read past.
function dmOnParticipantUpdate(payload) {
  if (!payload?.new) return;
  const { conversation_id, employee_id, last_read_at } = payload.new;
  const conv = dmConvs.find(c => c.id === conversation_id);
  if (!conv) return;
  if (!conv._participantReads) conv._participantReads = {};
  conv._participantReads[employee_id] = last_read_at;
  // If I'm currently looking at this convo, re-render so receipts flip live
  if (dmPanelOpen && dmActiveConv === conversation_id) {
    dmRenderConversationView();
  }
}

// ── Outside click closes panel/toast on click outside ───────
// Use CAPTURE phase so we evaluate e.target.closest('#dmRoot') BEFORE any
// inline onclick mutates the DOM. Otherwise clicking the + button would
// detach it (innerHTML replaced by picker view), making closest() return null
// and incorrectly closing the panel.
document.addEventListener('click', e => {
  if (!e.target.closest || !e.target.closest('#dmRoot')) {
    if (dmPanelOpen) dmClosePanel();
  }
}, true);

// ── Expose for inline handlers ──────────────────────────────
window.dmInit = dmInit;
window.dmReinitForCurrentUser = dmReinitForCurrentUser;
window.dmTogglePanel = dmTogglePanel;
window.dmOpenConversation = dmOpenConversation;
window.dmBackToList = dmBackToList;
window.dmSendFromComposer = dmSendFromComposer;
window.dmDismissToast = dmDismissToast;
window.dmReplyFromToast = dmReplyFromToast;
window.dmOpenNewConversation = dmOpenNewConversation;
window.dmRenderNewConversationView = dmRenderNewConversationView;
window._dmTogglePickerEmp = _dmTogglePickerEmp;
window.dmCreateConversationFromPicker = dmCreateConversationFromPicker;
window._dmAutoGrow = _dmAutoGrow;
window._dmComposeKey = _dmComposeKey;
window.dmOnIncomingMessage = dmOnIncomingMessage;
window.dmLoadConversations = dmLoadConversations;
window.dmConfirmDelete = dmConfirmDelete;
window.dmConfirmOwnerDelete = dmConfirmOwnerDelete;
window.dmCancelDelete = dmCancelDelete;
window.dmDeleteForSelf = dmDeleteForSelf;
window.dmDeleteForEveryone = dmDeleteForEveryone;
window.dmOnDeletedParticipant = dmOnDeletedParticipant;
window.dmOnParticipantUpdate = dmOnParticipantUpdate;
