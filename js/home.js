// ===== HOME PAGE =====

const ANN_MAX_ACTIVE = 3;
const ANN_TITLE_MAX  = 80;

let _homeWeatherCache       = null;
let _editingAnnouncementId  = null;        // null = posting new; uuid = editing
let _homeRefreshTimer       = null;        // 15-minute chatter refresh

// ---- Open Home Panel ----
function openHomePanel(navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-home').classList.add('active');
  document.getElementById('topbarName').textContent = 'Home';
  activeProjectId = null;
  renderHomePage();
  // Start 15-minute refresh timer
  if (_homeRefreshTimer) clearInterval(_homeRefreshTimer);
  _homeRefreshTimer = setInterval(() => {
    const panel = document.getElementById('panel-home');
    if (panel && panel.classList.contains('active')) refreshHomeChatter();
  }, 15 * 60 * 1000);
}
window.openHomePanel = openHomePanel;

// ---- Main render ----
async function renderHomePage() {
  const wrap = document.getElementById('homeWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="home-loading">Loading...</div>';

  const [weather, announcements, closureAnn, whosOut, mySubmissions] = await Promise.all([
    fetchHomeWeather(),
    fetchAnnouncements(),
    fetchClosureAnnouncement(),
    getWhosOut(),
    fetchMySubmissions(),
  ]);

  const holidays   = getUpcomingHolidays(3);
  const chatter    = await fetchRecentChatter(8);
  const canPost    = currentEmployee && (currentEmployee.isOwner || isManager());
  const canClosure = !!(currentEmployee && currentEmployee.isOwner);  // owners only

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  wrap.innerHTML = `
    <div class="home-grid">

      <div class="home-date-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <span>${dateStr}</span>
        ${renderClosureButton(canClosure)}
      </div>

      ${renderClosureBanner(closureAnn, canClosure)}

      ${renderAnnouncementSection(announcements, canPost)}

      <div class="home-top-row">
        ${renderWeatherCard(weather)}
        ${renderWhosOutCard(whosOut)}
        ${renderHolidaysCard(holidays)}
      </div>

      ${renderCuiHintCard()}

      ${renderChatterCard(chatter)}

      ${renderMySubmissionsCard(mySubmissions)}

    </div>
  `;

  attachHomeEvents();
}

// ---- Announcements ----
// General announcements only — closure notices (kind='closure') are pinned
// separately above the board and must not count toward the ANN_MAX_ACTIVE cap.
// Closure rows are filtered client-side (not via .neq) because a server-side
// .neq('kind','closure') would silently drop any legacy null-kind rows.
async function fetchAnnouncements() {
  if (!sb) return [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await sb.from('announcements')
      .select('*')
      .gte('expires_at', today)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) { console.error('fetchAnnouncements:', error); return []; }
    return (data || [])
      .filter(a => (a.kind || 'general') !== 'closure')
      .slice(0, ANN_MAX_ACTIVE);
  } catch (e) { console.error('fetchAnnouncements:', e); return []; }
}

// The single active closure/snow notice, if any. Pinned above the board,
// independent of the 3-announcement cap. Auto-expires the day after closure.
async function fetchClosureAnnouncement() {
  if (!sb) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await sb.from('announcements')
      .select('*')
      .eq('kind', 'closure')
      .gte('expires_at', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { console.error('fetchClosureAnnouncement:', error); return null; }
    return (data && data[0]) || null;
  } catch (e) { console.error('fetchClosureAnnouncement:', e); return null; }
}

// ---- Closure / Snow Notice ----
// Pinned banner shown above the regular announcement board. Owners always see
// the "Send Closure Notice" button; everyone sees the active banner if one is up.
function renderClosureBanner(ann, canClosure) {
  let html = '';

  if (ann) {
    const emp     = (typeof employees !== 'undefined' ? employees : []).find(e => e.id === ann.posted_by);
    const poster  = emp ? emp.name : 'Management';
    const expires = new Date(ann.expires_at + 'T00:00:00');
    const expStr  = expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const title   = (ann.title || '').trim();
    const message = (ann.message || '').trim();
    const clearBtn = canClosure
      ? `<button onclick="clearAnnouncement('${ann.id}')" title="Clear notice"
           style="background:transparent;border:1px solid var(--blue);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--blue);cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0;">&#x2715; Clear</button>`
      : '';

    html += `<div id="homeClosureBanner"
      style="display:flex;align-items:flex-start;gap:12px;background:rgba(58,127,212,0.08);border:1px solid rgba(58,127,212,0.35);border-left:4px solid var(--blue);border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px;">
      <div style="font-size:22px;line-height:1;flex-shrink:0;">&#x2744;&#xFE0F;</div>
      <div style="flex:1;min-width:0;">
        ${title ? `<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">${_homeEsc(title)}</div>` : ''}
        ${message ? `<div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5;">${_homeEsc(message)}</div>` : ''}
        <div style="font-size:11px;color:var(--muted);margin-top:6px;">Posted by ${_homeEsc(poster)} &middot; Clears ${expStr}</div>
      </div>
      ${clearBtn}
    </div>`;
  }

  return html;
}

// Owner-only "Send Closure Notice" button — rendered inline with the date header.
function renderClosureButton(canClosure) {
  if (!canClosure) return '';
  return `<button onclick="openClosureNotice()"
    style="background:var(--surface);border:1px solid var(--blue);border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'DM Sans',sans-serif;display:inline-flex;align-items:center;gap:7px;flex-shrink:0;">
    &#x2744;&#xFE0F; Send Closure Notice
  </button>`;
}

function renderAnnouncementSection(anns, canPost) {
  const count = anns.length;
  const atCap = count >= ANN_MAX_ACTIVE;

  // 0 announcements — just the post button (or nothing if user can't post)
  if (count === 0) {
    const postBtn = canPost
      ? `<button class="home-ann-post-btn" onclick="openAnnouncementEditor(null)">+ Post Announcement</button>`
      : '';
    return `<div class="home-ann-empty" id="homeAnnSection">${postBtn}</div>`;
  }

  // 1 announcement — full single banner
  if (count === 1) {
    return renderSingleAnnouncement(anns[0], canPost);
  }

  // 2–3 announcements — title list w/ accordion
  return renderMultiAnnouncements(anns, canPost, atCap);
}

function renderSingleAnnouncement(ann, canPost) {
  const emp     = (typeof employees !== 'undefined' ? employees : []).find(e => e.id === ann.posted_by);
  const poster  = emp ? emp.name : 'Management';
  const expires = new Date(ann.expires_at + 'T00:00:00');
  const expStr  = expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const title    = (ann.title || '').trim();
  const message  = (ann.message || '').trim();
  const showBody = message && message !== title;

  const actions = canPost
    ? `<div class="home-ann-actions">
         <button class="home-ann-post-btn"  onclick="openAnnouncementEditor('${ann.id}')">&#x270F; Edit</button>
         <button class="home-ann-add-btn"   onclick="openAnnouncementEditor(null)">+ New</button>
         <button class="home-ann-clear-btn" onclick="clearAnnouncement('${ann.id}')">&#x2715; Clear</button>
       </div>`
    : '';

  return `<div class="home-ann-banner" id="homeAnnSection">
    <div class="home-ann-icon">&#x1F4E2;</div>
    <div class="home-ann-body">
      ${title ? `<div class="home-ann-title-text">${_homeEsc(title)}</div>` : ''}
      ${showBody ? `<div class="home-ann-message">${_homeEsc(message)}</div>` : ''}
      <div class="home-ann-meta">Posted by ${_homeEsc(poster)} &middot; Expires ${expStr}</div>
    </div>
    ${actions}
  </div>`;
}

function renderMultiAnnouncements(anns, canPost, atCap) {
  const items = anns.map(ann => {
    const emp     = (typeof employees !== 'undefined' ? employees : []).find(e => e.id === ann.posted_by);
    const poster  = emp ? emp.name : 'Management';
    const expires = new Date(ann.expires_at + 'T00:00:00');
    const expStr  = expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const title   = (ann.title || (ann.message || '').slice(0, ANN_TITLE_MAX)).trim();
    const message = (ann.message || '').trim();

    const rowActions = canPost
      ? `<button class="home-ann-item-edit"  title="Edit"  onclick="event.stopPropagation();openAnnouncementEditor('${ann.id}')">&#x270F;</button>
         <button class="home-ann-item-clear" title="Clear" onclick="event.stopPropagation();clearAnnouncement('${ann.id}')">&#x2715;</button>`
      : '';

    return `<div class="home-ann-item" id="ann-item-${ann.id}">
      <div class="home-ann-item-head" onclick="toggleAnnouncementItem('${ann.id}')">
        <div class="home-ann-item-chevron">&#x25B8;</div>
        <div class="home-ann-item-title">${_homeEsc(title)}</div>
        ${rowActions}
      </div>
      <div class="home-ann-item-body">
        <div class="home-ann-item-message">${_homeEsc(message)}</div>
        <div class="home-ann-item-meta">Posted by ${_homeEsc(poster)} &middot; Expires ${expStr}</div>
      </div>
    </div>`;
  }).join('');

  const topAction = canPost
    ? (atCap
        ? `<button class="home-ann-post-btn home-ann-post-btn-disabled" disabled title="Maximum ${ANN_MAX_ACTIVE} announcements active. Clear one to add another.">+ Post (max ${ANN_MAX_ACTIVE})</button>`
        : `<button class="home-ann-post-btn" onclick="openAnnouncementEditor(null)">+ Post Another</button>`)
    : '';

  return `<div class="home-ann-banner home-ann-banner-multi" id="homeAnnSection">
    <div class="home-ann-icon">&#x1F4E2;</div>
    <div class="home-ann-list">${items}</div>
    ${topAction ? `<div class="home-ann-top-actions">${topAction}</div>` : ''}
  </div>`;
}

window.toggleAnnouncementItem = function(id) {
  const el = document.getElementById('ann-item-' + id);
  if (el) el.classList.toggle('expanded');
};

// ---- Editor (modal) ----
window.openAnnouncementEditor = async function(id) {
  _editingAnnouncementId = id || null;

  let title = '';
  let message = '';
  let expiry = '';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  expiry = tomorrow.toISOString().slice(0, 10);

  if (id && sb) {
    try {
      const { data } = await sb.from('announcements').select('*').eq('id', id).maybeSingle();
      if (data) {
        title   = data.title   || '';
        message = data.message || '';
        expiry  = data.expires_at || expiry;
      }
    } catch (e) { console.error('openAnnouncementEditor fetch:', e); }
  }

  let overlay = document.getElementById('homeAnnModalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'homeAnnModalOverlay';
    overlay.className = 'home-ann-modal-overlay';
    document.body.appendChild(overlay);
  }

  const heading = id ? 'Edit Announcement' : 'Post Announcement';
  const action  = id ? 'Save Changes'      : 'Post';

  overlay.innerHTML = `
    <div class="home-ann-modal" role="dialog" aria-modal="true" aria-labelledby="homeAnnModalTitle">
      <div class="home-ann-modal-header">
        <div class="home-ann-modal-heading" id="homeAnnModalTitle">${heading}</div>
        <button class="home-ann-modal-close" onclick="closeAnnouncementEditor()" aria-label="Close">&#x2715;</button>
      </div>
      <div class="home-ann-modal-body">
        <label class="home-ann-modal-label">
          Title <span class="home-ann-modal-label-muted">required &middot; max ${ANN_TITLE_MAX} chars</span>
          <input type="text" class="home-ann-modal-input" id="homeAnnTitle" maxlength="${ANN_TITLE_MAX}" value="${_homeEsc(title)}" placeholder="Brief headline staff will see first" />
        </label>
        <label class="home-ann-modal-label">
          Message
          <textarea class="home-ann-modal-textarea" id="homeAnnText" rows="6" placeholder="Full announcement details...">${_homeEsc(message)}</textarea>
        </label>
        <label class="home-ann-modal-label">
          Expires
          <input type="date" class="home-ann-modal-date" id="homeAnnExpiry" value="${expiry}" />
        </label>
      </div>
      <div class="home-ann-modal-footer">
        <button class="home-ann-cancel-btn" onclick="closeAnnouncementEditor()">Cancel</button>
        <button class="home-ann-save-btn"   onclick="saveAnnouncement()">${action}</button>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  overlay.onclick = (e) => { if (e.target === overlay) closeAnnouncementEditor(); };
  document.addEventListener('keydown', _annEscHandler);

  setTimeout(() => { document.getElementById('homeAnnTitle')?.focus(); }, 50);
};

function _annEscHandler(e) {
  if (e.key === 'Escape') closeAnnouncementEditor();
}

window.closeAnnouncementEditor = function() {
  const overlay = document.getElementById('homeAnnModalOverlay');
  if (overlay) overlay.classList.remove('active');
  _editingAnnouncementId = null;
  document.removeEventListener('keydown', _annEscHandler);
};

window.saveAnnouncement = async function() {
  const title  = (document.getElementById('homeAnnTitle')?.value || '').trim();
  const msg    = (document.getElementById('homeAnnText')?.value  || '').trim();
  const expiry = document.getElementById('homeAnnExpiry')?.value;

  if (!title) {
    if (typeof toast === 'function') toast('⚠ Title is required');
    document.getElementById('homeAnnTitle')?.focus();
    return;
  }
  if (!msg) {
    if (typeof toast === 'function') toast('⚠ Message is required');
    document.getElementById('homeAnnText')?.focus();
    return;
  }
  if (!expiry) {
    if (typeof toast === 'function') toast('⚠ Expiration date is required');
    return;
  }
  if (!sb || !currentEmployee) return;

  try {
    if (_editingAnnouncementId) {
      // EDIT — real update, preserves posted_by + created_at
      const { error } = await sb.from('announcements')
        .update({ title, message: msg, expires_at: expiry })
        .eq('id', _editingAnnouncementId);
      if (error) {
        console.error('saveAnnouncement update:', error);
        if (typeof toast === 'function') toast('⚠ Could not save: ' + (error.message || error.code || ''));
        return;
      }
      if (typeof toast === 'function') toast('✓ Announcement updated');
    } else {
      // NEW — enforce 3-active cap server-side fetch
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing, error: cntErr } = await sb.from('announcements')
        .select('id')
        .gte('expires_at', today);
      if (cntErr) {
        console.error('saveAnnouncement count:', cntErr);
        if (typeof toast === 'function') toast('⚠ Could not check active announcements');
        return;
      }
      if ((existing || []).length >= ANN_MAX_ACTIVE) {
        if (typeof toast === 'function') toast(`⚠ ${ANN_MAX_ACTIVE} announcements already active. Clear one first.`);
        return;
      }
      const { error: insErr } = await sb.from('announcements').insert({
        title,
        message:    msg,
        posted_by:  currentEmployee.id,
        expires_at: expiry,
      });
      if (insErr) {
        console.error('saveAnnouncement insert:', insErr);
        if (typeof toast === 'function') toast('⚠ Could not post: ' + (insErr.message || insErr.code || ''));
        return;
      }
      if (typeof toast === 'function') toast('✓ Announcement posted');
    }

    closeAnnouncementEditor();
    renderHomePage();
  } catch (e) {
    console.error('saveAnnouncement:', e);
    if (typeof toast === 'function') toast('⚠ Could not save announcement');
  }
};

window.clearAnnouncement = async function(id) {
  if (!sb) return;
  if (!confirm('Clear this announcement?')) return;
  try {
    const { error } = await sb.from('announcements').delete().eq('id', id);
    if (error) {
      console.error('clearAnnouncement:', error);
      if (typeof toast === 'function') toast('⚠ Could not clear: ' + (error.message || error.code || ''));
      return;
    }
    if (typeof toast === 'function') toast('✓ Announcement cleared');
    renderHomePage();
  } catch (e) {
    console.error('clearAnnouncement:', e);
    if (typeof toast === 'function') toast('⚠ Could not clear announcement');
  }
};

// HTML escape helper (file-scoped)
function _homeEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- CUI Hint of the Day ----
// Flat bank of awareness one-liners, grouped by CMMC / NIST 800-171 domain.
// One is shown per calendar day, picked deterministically so everyone sees the
// same hint on the same day; it advances by one each day and wraps around.
// ~172 hints => ~6 months before any repeat. Edit freely: add/remove lines,
// the rotation adjusts automatically. Groupings are only for your convenience.
const CUI_HINTS = [
  // --- PE  Physical Protection ---
  "End of day: is your CUI locked in a drawer, or still sitting out on your desk?",
  "The RDM Office PIN is yours. Don't share it, don't prop the door, don't let anyone tailgate in behind you.",
  "Stepping away? Win+L. A locked screen can't be read over your shoulder.",
  "Clean desk = compliant desk. Papers away, drawers locked, screen locked.",
  "Visitors get escorted \u2014 even if you're \u201cjust grabbing coffee.\u201d",
  "Last one out of the RDM Office? Make sure the door actually latched behind you.",
  "That locking desk drawer isn't decoration. If CUI paperwork lives at your desk, it lives locked.",
  "Don't prop the server room door \u201cjust for a minute.\u201d A minute is all it takes.",
  "Someone you don't recognize wandering the tech floor? Ask who they're here to see.",
  "Printouts with CUI don't stay on your desk unattended. Lock them up or take them with you.",
  "The cameras aren't there to watch you \u2014 they're there so we know who was where if it ever matters.",
  "Going to lunch? Lock your screen and clear any CUI off your desk first.",
  "A propped-open door is an open invitation. If you see one, close it.",
  "Your PIN is like your toothbrush \u2014 personal, and you don't lend it out.",
  "Working late alone? Same rules. Lock up CUI before you head out \u2014 no exceptions for the night shift.",
  "If a delivery driver needs in, meet them at the door \u2014 don't wave a stranger through to the floor.",
  "Badges and keys stay with their owner. Don't hand them off so someone can skip signing in.",

  // --- AC  Access Control ---
  "Your login is yours. Never work under someone else's account \u2014 or hand yours to anyone.",
  "Stepping away, even for two minutes? Win+L.",
  "You get access to what your job needs. Can't open something? That's by design, not a glitch.",
  "Never leave a workstation logged in and walk away \u2014 that's your name on whatever happens next.",
  "\u201cCan you just log in for me real quick?\u201d No. Everyone uses their own access.",
  "Remote in from home with the same care as at your desk \u2014 lock it when you step away.",
  "Shared passwords aren't convenient, they're a liability. One person, one login.",
  "If you can suddenly see files you couldn't before, that's worth a heads-up to Russ, not a shrug.",
  "Don't save the CUI NAS password in a browser on a shared machine.",
  "Changing roles or leaving? Your access changes too \u2014 that's expected, nothing personal.",
  "A coworker asking to \u201cborrow\u201d your login has a problem you shouldn't solve that way.",
  "Auto-lock is your backup, not your plan. Lock it yourself when you get up.",
  "The fewer people who can reach CUI, the safer it is. That's why access is by name, not by default.",
  "Logged into the CUI NAS on someone else's desktop? Log out before you walk away.",
  "Kiosk or shared terminal? Log out completely \u2014 don't just close the window.",
  "Access requests go through Russ, not through borrowing a coworker's session.",

  // --- IA  Identification & Authentication ---
  "Where does your Windows password live? Not on a sticky note, not under the keyboard \u2014 in an approved manager or in your head.",
  "Got a Duo push you didn't request? Deny it and tell Russ. Someone's trying to log in as you.",
  "Your password is yours alone. Real IT will never ask you for it.",
  "A password taped to your monitor is a password anyone who walks by already knows.",
  "Don't reuse your work password anywhere else. If another site leaks, your login shouldn't be part of the fallout.",
  "Approving a Duo prompt without reading it defeats the point. Know what you're approving.",
  "\u201cWhat's your password?\u201d is never a normal question \u2014 including from someone claiming to be IT.",
  "A longer passphrase beats a clever short one. Length wins.",
  "Unexpected MFA prompt in the middle of the night? Deny it, then tell Russ.",
  "Don't let the browser remember your password on a machine other people use.",
  "Writing it down \u201cjust until I memorize it\u201d? That note is a risk the whole time it exists.",
  "Your Duo device is a key. Lost phone = tell Russ so we can cut off the old one.",
  "If a login screen looks even slightly off, stop and check the address before you type anything.",
  "One account, one human. Never log in as someone else \u201cto save time.\u201d",
  "Let the password manager do the remembering so you never have to write it down.",
  "Treat your MFA prompt like a signature \u2014 you're vouching that it's really you.",

  // --- MP  Media Protection ---
  "Found a USB stick? Don't plug it in \u2014 anywhere. Hand it to Russ.",
  "CUI printouts get shredded, not recycled. Paper is media too.",
  "CUI lives on the CUI NAS \u2014 not a personal USB drive, your phone, or a home laptop.",
  "Don't snap a phone photo of a CUI drawing \u201cjust to reference later.\u201d",
  "That \u201cfree\u201d USB stick from a trade show is exactly how malware walks in the front door.",
  "Old drive headed for the trash? It gets wiped first. Ask Russ \u2014 don't just toss it.",
  "Copying something to a thumb drive for a customer? Stop and ask how it should go out.",
  "If it has CUI on it, it doesn't ride home in your bag.",
  "Know what's CUI before you decide how to handle or ship it. Labels matter.",
  "Shred bin, not recycle bin. When in doubt, shred it.",
  "Don't email CUI to your personal address to \u201cwork on it at home.\u201d",
  "A misplaced USB drive is a reportable event, not a \u201chope I find it later.\u201d",
  "Printing CUI? Grab it off the printer immediately \u2014 don't leave it sitting in the tray.",
  "Sanitize before you surplus. No device leaves with data still on it.",
  "Draft printouts with CUI count too \u2014 into the shred bin, not the trash.",
  "Moving CUI between machines? It goes over the approved path, not on a thumb drive.",

  // --- SI  System & Information Integrity ---
  "That security warning on your screen isn't \u201cjust noise.\u201d Read it; if you're unsure, ask Russ.",
  "Phishing is the #1 way in. Slow down on emails that push you to click, log in, or act now.",
  "Don't turn off antivirus or dismiss updates because they're inconvenient.",
  "Unexpected attachment, even from a name you know? Verify before you open it.",
  "\u201cYour account will be closed in 24 hours!\u201d is pressure \u2014 and pressure is the tell.",
  "Hover before you click. The link text and the real address aren't always the same.",
  "A pop-up saying your PC is infected and to \u201ccall this number\u201d is the scam \u2014 close it, don't call.",
  "Forward suspicious emails to Russ rather than testing the link yourself.",
  "Updates ship for a reason \u2014 usually a hole someone's already trying to use. Let them run.",
  "Machine suddenly slow, popping ads, or acting weird? Say something.",
  "Don't install browser extensions on a work machine without asking.",
  "A login page reached from an email link deserves a second look before you type.",
  "Bad grammar and a strange sender address are gifts \u2014 they're telling you it's fake.",
  "When an email asks you to break normal procedure \u201curgently,\u201d that's the moment to slow down.",
  "QR codes in emails can be phishing too \u2014 don't scan first and think later.",
  "If IT didn't announce it, an \u201cupdate now\u201d pop-up from a website isn't your update. Ignore it.",

  // --- IR  Incident Response ---
  "Think you clicked something bad? Tell Russ immediately. Fast beats perfect.",
  "You won't be in trouble for reporting. Hiding it is the only real mistake.",
  "Lost a laptop, phone, or badge? Report it the same day, not next week.",
  "\u201cIt's probably nothing\u201d is exactly the thing to report. Let us decide.",
  "Not sure if it's an incident? Report it anyway \u2014 that's what reporting is for.",
  "Spot CUI somewhere it shouldn't be? Flag it. Don't just move it and forget it.",
  "If a coworker's account is doing strange things, say something \u2014 it might not be them.",
  "The faster we know, the smaller the cleanup. Speed is the whole game in incident response.",
  "Know who to tell before you need to: for anything security, that's Russ.",
  "Got tricked by a phishing email? It happens \u2014 report it and we sort it out. No shame, just speed.",
  "A missing device isn't just lost property; it's a security report.",
  "After-hours incident? Report it as soon as you can \u2014 don't wait for it to become someone else's find.",

  // --- SC  System & Communications Protection ---
  "Sending CUI out? Through Virtru. Every time. No \u201cjust this once\u201d plain email.",
  "Don't plug personal devices \u2014 phones, drives, chargers with data \u2014 into work machines.",
  "CUI stays on our systems. Not personal cloud, not personal email, not \u201cjust to finish at home.\u201d",
  "Plain email is a postcard. CUI goes in the Virtru envelope.",
  "Public wifi and CUI don't mix. If you're out, you're not working on CUI.",
  "Zipping a file isn't encrypting it. Use Virtru for the real thing.",
  "Don't forward a CUI thread to an outside address without stopping to think how it's protected.",
  "Your work phone isn't a CUI storage locker. Keep the data where it belongs.",
  "A customer asking you to \u201cjust email it unencrypted\u201d is asking you to break the rule. Virtru it.",
  "Personal USB chargers can carry more than power. Use approved gear on work machines.",
  "Don't set up your own file-sharing link for work files. Ask how it should go out.",
  "Remote work runs through the approved path. No shortcuts around the VPN.",
  "Texting a customer a CUI detail is still sending CUI the wrong way. Keep it in Virtru.",

  // --- AT  Awareness & Training ---
  "These hints are the training. Read them, act on them \u2014 that's the point.",
  "Security isn't just Russ's job. Everyone who touches CUI keeps it safe.",
  "See something off? Say something. You don't need to be sure to speak up.",
  "A minute reading this is a minute well spent \u2014 awareness is the cheapest defense we have.",
  "The habits are simple: lock it, shred it, verify it, report it. Repeat daily.",
  "You're not expected to be an expert \u2014 just alert. Notice things and speak up.",
  "Every one of us is either a way in or a way blocked. Be the block.",
  "Good security is mostly good habits done every day, not heroics once a year.",
  "If a hint here changes one thing you do, it did its job.",
  "The goal isn't fear, it's habit. Small, steady, everyday.",

  // --- CM  Configuration Management ---
  "Don't install software yourself. Need a program? Ask \u2014 free downloads are how bad things get in.",
  "Don't plug in new hardware without asking \u2014 that mystery gadget from home included.",
  "Your machine is set up a certain way for a reason. If something changed on its own, report it.",
  "\u201cIt's just a little free tool\u201d is how big problems start. Ask first.",
  "New device that needs to touch the network? Run it by Russ before you connect it.",
  "Don't change system settings to force something to work \u2014 flag it instead.",
  "Approved software only. If it's not on the machine already, ask before adding it.",
  "That browser toolbar you don't remember installing? Tell Russ.",
  "Consistency is security. The standard setup is standard on purpose.",
  "If a program wants to install \u201chelpers\u201d or \u201cextras,\u201d that's your cue to pause and ask.",

  // --- MA  Maintenance ---
  "A repair tech on site gets escorted, same as any visitor. Don't leave them alone with our gear.",
  "Equipment leaving for repair or disposal gets wiped first. Flag it to Russ \u2014 don't just hand it off.",
  "Maintenance on CUI systems is scheduled and tracked. An unannounced \u201cIT guy\u201d isn't.",
  "Don't let a stranger with a toolbox start working on a machine without checking they're expected.",
  "Vendor needs access to fix something? Someone stays with them the whole time.",
  "Before a device goes out the door for service, its data comes off first.",
  "\u201cI'm here to service the server\u201d isn't a badge. Verify, then escort.",
  "Scheduled maintenance is fine. Surprise maintenance is a question mark \u2014 ask.",

  // --- AU  Audit & Accountability ---
  "Everything on our systems is logged \u2014 that protects you too. If it wasn't you, the log shows it.",
  "Never share a login. Shared accounts make logs useless and put your name on someone else's actions.",
  "The clocks are synced on purpose. Don't change your machine's date and time.",
  "Logs aren't Big Brother \u2014 they're the receipt that proves what you did and didn't do.",
  "One account per person keeps the record honest. Keep yours yours.",
  "Notice odd activity under your account? Tell Russ \u2014 the log will back you up.",
  "Accurate logs depend on accurate identities. That's the whole reason we don't share logins.",
  "The system remembers so nobody has to argue about it later. Keep your account clean and it works for you.",

  // --- PS  Personnel Security ---
  "When someone leaves, their access leaves too. Former employee still has a key or login? Tell Russ.",
  "Returning a badge, key, or laptop on your last day is part of protecting CUI, not just paperwork.",
  "Access follows the role. Change jobs here and your access changes \u2014 nothing personal.",
  "Notice a departed coworker's account still active? Flag it.",
  "Keys and badges are accountable items. If yours goes missing, report it.",
  "The day someone leaves is the day their access should end \u2014 help us make that true.",
  "Don't pass your badge to someone who forgot theirs. Everyone uses their own.",
  "Offboarding is a security step. Return what you were issued.",

  // --- RA  Risk Assessment ---
  "Spot a new risk \u2014 a propped door, an unlocked cabinet, a weird email trend? Report it.",
  "Don't work around a security control because it's inconvenient. Tell us it's slowing you down; we'll fix it safely.",
  "Every shortcut around security is a risk someone has to own. Flag the friction instead.",
  "You see things Russ can't. If something feels risky, that instinct is worth a message.",
  "A workaround that \u201cjust works\u201d often works for attackers too. Ask for a safe fix.",
  "Small risks noticed early beat big problems found late. Speak up.",
  "If a process forces you to do something insecure to get your job done, that's a bug \u2014 report it.",
  "Security friction is feedback. Tell us where it hurts and we'll smooth it the right way.",

  // --- CA  Security Assessment ---
  "Assessors sometimes ask staff questions. \u201cI lock my screen and shred CUI\u201d is a great answer.",
  "The locked doors, the shredding, these hints \u2014 it all adds up to what an assessor checks. You're the evidence.",
  "Ask how we keep CUI safe? The true answer is simple: we all follow the same habits every day.",
  "An honest \u201chere's what I actually do\u201d beats a polished script every time.",
  "You don't need to memorize the framework \u2014 just be able to describe your own good habits.",
  "When the assessment comes, the best prep is the habits you already keep every day.",
  "\u201cThat's not my department\u201d is the wrong answer. Protecting CUI is everyone's department.",
  "The cleanest evidence is a team that all does the small things right, consistently.",
];

// Deterministic daily pick: same hint for everyone on a given local calendar
// day, advancing by one each day and wrapping. Local midnight keeps it stable
// through the day and avoids a jump at the year boundary.
function renderCuiHintCard() {
  if (!CUI_HINTS.length) return '';
  const now = new Date();
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayIndex = Math.floor(localMidnight.getTime() / 86400000);
  const hint = CUI_HINTS[((dayIndex % CUI_HINTS.length) + CUI_HINTS.length) % CUI_HINTS.length];

  return `<div class="home-cui-hint">
    <div class="home-cui-hint-head">
      <span class="home-cui-hint-icon">&#x1F6E1;&#xFE0F;</span>
      <span class="home-cui-hint-label">CUI Hint of the Day</span>
    </div>
    <div class="home-cui-hint-text">${_homeEsc(hint)}</div>
  </div>`;
}

// ---- Weather ----
// Cached across reloads in localStorage (30-min TTL) so we don't re-hit
// Open-Meteo on every page load — repeated calls were tripping their rate
// limit (HTTP 429). On any failure we fall back to the last good value
// (even if stale) so the card keeps showing a temperature instead of
// "unavailable". At most ~2 calls/hour per browser.
const WEATHER_TTL_MS = 30 * 60 * 1000;
const WEATHER_LS_KEY = 'nulabs_home_weather_v1';

function _readWeatherCache() {
  try {
    const raw = localStorage.getItem(WEATHER_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

async function fetchHomeWeather() {
  if (_homeWeatherCache) return _homeWeatherCache;

  // Fresh enough cache from a previous load? Use it, skip the network.
  const cached = _readWeatherCache();
  if (cached && cached.data && cached.ts && (Date.now() - cached.ts) < WEATHER_TTL_MS) {
    _homeWeatherCache = cached.data;
    return _homeWeatherCache;
  }

  try {
    // Annandale NJ coordinates
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=40.6426&longitude=-74.8774' +
      '&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit' +
      '&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=4';
    const res  = await fetch(url);
    if (!res.ok) throw new Error('weather HTTP ' + res.status);   // 429 etc. → don't cache a bad body
    const data = await res.json();
    _homeWeatherCache = data;
    try { localStorage.setItem(WEATHER_LS_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
    return data;
  } catch (e) {
    console.warn('fetchHomeWeather failed:', e);
    // Rate-limited or offline — show the last good reading rather than nothing.
    if (cached && cached.data) { _homeWeatherCache = cached.data; return cached.data; }
    return null;
  }
}

function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2)  return '🌤️';
  if (code <= 3)  return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '❄️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

function weatherDesc(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 2)  return 'Partly cloudy';
  if (code <= 3)  return 'Overcast';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}

function renderWeatherCard(data) {
  if (!data || !data.current) {
    return `<div class="home-card home-weather-card">
      <div class="home-card-title">🌡️ Weather</div>
      <div class="home-card-empty">Weather unavailable</div>
    </div>`;
  }

  const cur  = data.current;
  const days = data.daily;
  const DOW  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const forecastHtml = days.time.slice(1, 4).map((dateStr, i) => {
    const d    = new Date(dateStr + 'T00:00:00');
    const dow  = DOW[d.getDay()];
    const code = days.weathercode[i + 1];
    const rain = days.precipitation_probability_max[i + 1];
    const rainHtml = rain > 0
      ? `<div class="home-fc-rain">💧${rain}%</div>` : '';
    return `<div class="home-forecast-day">
      <div class="home-forecast-dow">${dow}</div>
      <div class="home-forecast-icon">${weatherIcon(code)}</div>
      <div class="home-forecast-temps">
        <span class="home-fc-hi">${Math.round(days.temperature_2m_max[i+1])}°</span>
        <span class="home-fc-lo">${Math.round(days.temperature_2m_min[i+1])}°</span>
      </div>
      ${rainHtml}
    </div>`;
  }).join('');

  const feelsLike = Math.round(cur.apparent_temperature);
  const temp      = Math.round(cur.temperature_2m);
  const feelsHtml = feelsLike !== temp
    ? `<div class="home-weather-feels">Feels like ${feelsLike}°F</div>` : '';

  return `<div class="home-card home-weather-card">
    <div class="home-weather-hero">
      <div class="home-weather-hero-icon">${weatherIcon(cur.weathercode)}</div>
      <div class="home-weather-hero-info">
        <div class="home-weather-location">📍 Annandale, NJ</div>
        <div class="home-weather-temp">${temp}°<span class="home-weather-unit">F</span></div>
        <div class="home-weather-desc">${weatherDesc(cur.weathercode)}</div>
        ${feelsHtml}
      </div>
    </div>
    <div class="home-weather-stats">
      <div class="home-weather-stat">💧 <span>${cur.relative_humidity_2m}%</span> Humidity</div>
      <div class="home-weather-stat">💨 <span>${Math.round(cur.windspeed_10m)} mph</span> Wind</div>
      <div class="home-weather-stat">🌧️ <span>${days.precipitation_probability_max[0] || 0}%</span> Rain today</div>
    </div>
    <div class="home-forecast">${forecastHtml}</div>
  </div>`;
}

// ---- Who's Out ----
async function getWhosOut() {
  const today = new Date().toISOString().slice(0, 10);
  if (!sb) return [];
  try {
    const { data } = await sb.from('schedule_blocks')
      .select('emp_id, emp_event_type, start_date, end_date')
      .not('emp_id', 'is', null)
      .in('emp_event_type', ['vacation', 'sick', 'ooo', 'work'])
      .lte('start_date', today)
      .gte('end_date', today);
    return (data || []).map(r => ({
      empId:        r.emp_id,
      empEventType: r.emp_event_type,
      start:        r.start_date,
      end:          r.end_date,
    }));
  } catch(e) { console.error('getWhosOut:', e); return []; }
}

function renderWhosOutCard(blocks) {
  const emps = typeof employees !== 'undefined' ? employees : [];
  const items = blocks.map(b => {
    const emp = emps.find(e => e.id === b.empId);
    const name = emp ? emp.name : 'Unknown';
    const initials = emp ? (emp.initials || name[0]) : '?';
    const color = emp ? (emp.color || '#888') : '#888';
    const label = b.empEventType === 'vacation' ? '🌴 Vacation'
                : b.empEventType === 'sick'     ? '🤒 Sick'
                : b.empEventType === 'ooo'      ? '🚪 Out of Office'
                : b.empEventType === 'work'     ? '💻 Working - off site'
                : '';
    return `<div class="home-out-row">
      <div class="home-out-av" style="background:${color}">${initials}</div>
      <div class="home-out-name">${name}</div>
      <div class="home-out-type">${label}</div>
    </div>`;
  }).join('');

  return `<div class="home-card home-out-card">
    <div class="home-card-title">👤 Who's Out Today</div>
    ${items || '<div class="home-card-empty">Everyone is in today 🎉</div>'}
  </div>`;
}

// ---- Holidays ----
function getUpcomingHolidays(count) {
  if (typeof getHolidays !== 'function') return [];
  const today = new Date().toISOString().slice(0, 10);
  const year  = new Date().getFullYear();
  const all   = [...getHolidays(year), ...getHolidays(year + 1)];
  return all
    .filter(h => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}

function renderHolidaysCard(holidays) {
  const items = holidays.map(h => {
    const d   = new Date(h.date + 'T00:00:00');
    const mon = d.toLocaleString('default', { month: 'short' });
    const day = d.getDate();
    const dow = d.toLocaleString('default', { weekday: 'short' });
    return `<div class="home-hol-row">
      <div class="home-hol-date">
        <div class="home-hol-mon">${mon}</div>
        <div class="home-hol-day">${day}</div>
        <div class="home-hol-dow">${dow}</div>
      </div>
      <div class="home-hol-name">${h.name}</div>
    </div>`;
  }).join('');

  return `<div class="home-card home-hol-card">
    <div class="home-card-title">📅 Upcoming Holidays</div>
    ${items || '<div class="home-card-empty">No holidays coming up</div>'}
  </div>`;
}

// ---- Recent Chatter ----
// Email follow-ups posted via the 📧 button on Project Info land in chatter
// with a "📍 Email sent to ..." prefix. We exclude those from the home page
// card so it stays focused on team conversation; managers can still review
// them in Audit Log → Chatter Activity.
function _isEmailFollowUp(text) {
  if (!text) return false;
  // Strip leading whitespace and any leading non-letter characters
  // (emoji, pin glyph, punctuation) before checking the prefix.
  const stripped = String(text).replace(/^[\s\W]+/, '');
  return /^email\s+sent\s+to/i.test(stripped);
}

async function fetchRecentChatter(limit) {
  if (!sb) return [];
  try {
    // Pull more than `limit` so that after filtering follow-ups we still
    // have enough left to fill the card.
    const fetchSize = Math.max(limit * 4, 30);
    const { data } = await sb.from('chatter')
      .select('id, proj_id, author_id, author_name, author_initials, author_color, text, created_at')
      .order('created_at', { ascending: false })
      .limit(fetchSize);
    return (data || [])
      .filter(r => !_isEmailFollowUp(r.text))
      .slice(0, limit)
      .map(r => ({
        id:             r.id,
        projId:         r.proj_id,
        authorName:     r.author_name,
        authorInitials: r.author_initials,
        authorColor:    r.author_color,
        text:           r.text,
        ts:             r.created_at,
      }));
  } catch(e) { console.error('fetchRecentChatter:', e); return []; }
}

async function refreshHomeChatter() {
  const chatter = await fetchRecentChatter(8);
  const card = document.querySelector('.home-chat-card');
  if (card) card.outerHTML = renderChatterCard(chatter);
}

function renderChatterCard(msgs) {
  const projs = typeof projects !== 'undefined' ? projects : [];

  const items = msgs.map(m => {
    const proj = projs.find(p => p.id === m.projId);
    const projName = proj ? proj.name : 'Unknown Project';
    const ago  = timeAgo(m.ts);
    const text = (m.text || '').slice(0, 120) + ((m.text||'').length > 120 ? '…' : '');
    return `<div class="home-chat-row" onclick="openProjectChatter('${m.projId}')">
      <div class="home-chat-av" style="background:${m.authorColor||'#888'}">${m.authorInitials||'?'}</div>
      <div class="home-chat-body">
        <div class="home-chat-header">
          <span class="home-chat-author">${m.authorName}</span>
          <span class="home-chat-proj">${projName}</span>
          <span class="home-chat-ago">${ago}</span>
        </div>
        <div class="home-chat-text">${text}</div>
      </div>
    </div>`;
  }).join('');

  return `<div class="home-card home-chat-card">
    <div class="home-card-title">💬 Recent Chatter</div>
    ${items || '<div class="home-card-empty">No recent messages</div>'}
  </div>`;
}

// Open a project and jump straight to its Chatter tab (not the default Info tab).
// Uses the same pattern as the notification-click handler in chatter.js.
window.openProjectChatter = function(projId) {
  if (typeof selectProjectById === 'function') {
    selectProjectById(projId);
  } else if (typeof selectProject === 'function') {
    selectProject(projId, null);
  }
  setTimeout(() => {
    if (typeof switchProjTab === 'function') switchProjTab('sub-chatter');
  }, 200);
};

// ---- My Submissions ----
async function fetchMySubmissions() {
  if (!sb || !currentEmployee) return [];
  try {
    const { data, error } = await sb.from('feedback_submissions')
      .select('*')
      .eq('submitter_id', currentEmployee.id)
      .not('status', 'in', '("done","wont_fix","duplicate")')
      .order('submitted_at', { ascending: false });
    if (error) { console.error('fetchMySubmissions:', error); return []; }
    return data || [];
  } catch(e) { console.error('fetchMySubmissions:', e); return []; }
}

function renderMySubmissionsCard(subs) {
  // Hide the card entirely when there are no open submissions
  if (!subs || !subs.length) return '';

  const statusColors = {
    'new': '#3b82f6',
    'acknowledged': '#8b5cf6',
    'in_progress': '#f59e0b',
  };
  const statusLabels = {
    'new': 'New',
    'acknowledged': 'Acknowledged',
    'in_progress': 'In Progress',
  };

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const items = subs.map(s => {
    const typeEmoji = s.type === 'bug' ? '🐛' : '💡';
    const color = statusColors[s.status] || '#6b7280';
    const label = statusLabels[s.status] || s.status;
    const submitted = new Date(s.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const submittedFull = new Date(s.submitted_at).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    const hasReply = s.admin_notes && s.admin_notes.trim();
    const replyIndicator = hasReply
      ? '<span class="home-sub-reply-tag">↩ Replied</span>'
      : '';

    const replyHtml = hasReply
      ? `<div class="home-sub-reply">
          <div class="home-sub-reply-label">Reply from Russ</div>
          <div class="home-sub-reply-text">${esc(s.admin_notes)}</div>
         </div>`
      : '';

    return `<div class="home-sub-row" id="sub-row-${s.id}" onclick="toggleSubmissionRow('${s.id}')">
      <div class="home-sub-head">
        <div class="home-sub-type">${typeEmoji}</div>
        <div class="home-sub-title">${esc(s.title)}</div>
        <div class="home-sub-status" style="background:${color}22;color:${color}">${label}</div>
        ${replyIndicator}
        <div class="home-sub-date">${submitted}</div>
        <div class="home-sub-chevron">▸</div>
      </div>
      <div class="home-sub-details">
        <div class="home-sub-meta">Submitted ${submittedFull}${s.page_context ? ` &middot; From ${esc(s.page_context)}` : ''}</div>
        <div class="home-sub-desc-label">Your description</div>
        <div class="home-sub-desc">${esc(s.description)}</div>
        ${replyHtml}
      </div>
    </div>`;
  }).join('');

  const count = subs.length;
  const subtitle = count === 1 ? '1 open submission' : `${count} open submissions`;

  return `<div class="home-card home-sub-card">
    <div class="home-card-title">🐛 Your Open Submissions <span class="home-sub-subtitle">${subtitle}</span></div>
    ${items}
  </div>`;
}

window.toggleSubmissionRow = function(id) {
  const row = document.getElementById('sub-row-' + id);
  if (row) row.classList.toggle('expanded');
};


function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400)return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

// ============================================================================
// Closure / Snow Notice composer  (owners only)
// ----------------------------------------------------------------------------
// Emails every active employee (NU Labs + Ballantine) who has a personal email
// on file, via the send-client-email Edge Function with BCC so home addresses
// are never exposed to each other. Optionally pins a snow banner to Home and
// always logs the send to the closure_notices audit table.
// ============================================================================

// Fallback wording if the DB templates (audience='staff_closure') aren't found.
const CLOSURE_DEFAULTS = {
  closed: {
    subject: 'NU Labs & Ballantine — Closed {date}',
    body: 'Hi All,\n\nDue to current weather conditions, NU Labs and Ballantine Labs will be closed on {date}.\n\nPlease stay safe and watch your email and the Home page for any updates.\n\n{note}\n\n— NU Laboratories Management',
  },
  delayed: {
    subject: 'NU Labs & Ballantine — {delay} delayed opening {date}',
    body: 'Hi All,\n\nDue to the current weather conditions, NU Labs and Ballantine Labs will operate on a {delay} delayed opening tomorrow, {date}.\n\nIf the weather continues overnight, we will reassess and send further information in the morning, so please monitor your email addresses so you don\'t miss potential closure information.\n\n{note}\n\n— NU Laboratories Management',
  },
};

let _closureTemplates = null;        // { closed:{subject,body}, delayed:{subject,body} }
let _closureType      = 'delayed';   // 'closed' | 'delayed'

function _closureRecipients() {
  return (typeof employees !== 'undefined' ? employees : [])
    .filter(e => e && e.isActive && e.personalEmail && String(e.personalEmail).trim());
}
function _closureFmtDate(iso) {
  try { const p = iso.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch (e) { return iso; }
}
function _closureFmtDateShort(iso) {
  try { const p = iso.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) { return iso; }
}
function _closureEscHandler(e) { if (e.key === 'Escape') closeClosureNotice(); }

window.openClosureNotice = async function() {
  if (!currentEmployee || !currentEmployee.isOwner) {
    if (typeof toast === 'function') toast('⚠ Owners only');
    return;
  }

  // Load editable templates (fall back to built-in wording on any miss)
  const tpl = { closed: { ...CLOSURE_DEFAULTS.closed }, delayed: { ...CLOSURE_DEFAULTS.delayed } };
  try {
    const { data } = await sb.from('templates')
      .select('key,subject,instructions')
      .eq('audience', 'staff_closure');
    (data || []).forEach(r => {
      if (r.key === 'closure_closed')  tpl.closed  = { subject: r.subject || tpl.closed.subject,  body: r.instructions || tpl.closed.body };
      if (r.key === 'closure_delayed') tpl.delayed = { subject: r.subject || tpl.delayed.subject, body: r.instructions || tpl.delayed.body };
    });
  } catch (e) { console.error('closure templates fetch:', e); }
  _closureTemplates = tpl;
  _closureType = 'delayed';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const recipCount  = _closureRecipients().length;

  let overlay = document.getElementById('homeClosureModalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'homeClosureModalOverlay';
    overlay.className = 'home-ann-modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="home-ann-modal" role="dialog" aria-modal="true" aria-labelledby="cnHeading" style="max-width:480px;">
      <div class="home-ann-modal-header">
        <div class="home-ann-modal-heading" id="cnHeading">&#x2744;&#xFE0F; Send Closure Notice</div>
        <button class="home-ann-modal-close" onclick="closeClosureNotice()" aria-label="Close">&#x2715;</button>
      </div>
      <div class="home-ann-modal-body">

        <label class="home-ann-modal-label" style="margin-bottom:4px;">Notice type</label>
        <div style="display:flex;margin-bottom:14px;">
          <button class="cn-seg" data-type="closed" onclick="setClosureType('closed')"
            style="flex:1;height:38px;border:1px solid var(--border);border-right:none;border-radius:8px 0 0 8px;background:var(--surface);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Closed</button>
          <button class="cn-seg" data-type="delayed" onclick="setClosureType('delayed')"
            style="flex:1;height:38px;border:1px solid var(--border);border-radius:0 8px 8px 0;background:var(--surface);color:var(--muted);font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Delayed opening</button>
        </div>

        <div style="display:flex;gap:12px;margin-bottom:14px;">
          <label class="home-ann-modal-label" style="flex:1;margin:0;">
            Date
            <input type="date" class="home-ann-modal-date" id="cnDate" value="${tomorrowIso}" oninput="_cnBuild()" />
          </label>
          <div id="cnDelayRow" style="flex:1;">
            <label class="home-ann-modal-label" style="margin:0;">
              Delay
              <select id="cnDelay" class="home-ann-modal-input" onchange="_cnBuild()" style="height:38px;">
                <option value="1-hour">1-hour</option>
                <option value="2-hour" selected>2-hour</option>
                <option value="3-hour">3-hour</option>
              </select>
            </label>
          </div>
        </div>

        <label class="home-ann-modal-label">
          Additional note <span class="home-ann-modal-label-muted">— optional</span>
          <textarea class="home-ann-modal-textarea" id="cnNote" rows="2" placeholder="e.g. Lab leads, please check the freezers remotely." oninput="_cnBuild()"></textarea>
        </label>

        <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:9px 11px;margin:6px 0 14px;">
          <span style="font-size:12px;color:var(--muted);">Sending to <span style="color:var(--text);font-weight:600;">${recipCount}</span> active employee${recipCount !== 1 ? 's' : ''} (NU Labs + Ballantine) with a personal email on file.</span>
        </div>

        <label class="home-ann-modal-label" style="margin-bottom:4px;">Preview <span class="home-ann-modal-label-muted">— editable before send</span></label>
        <input type="text" class="home-ann-modal-input" id="cnSubj" style="font-weight:600;margin-bottom:8px;" />
        <textarea class="home-ann-modal-textarea" id="cnBody" rows="9"></textarea>

        <label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin-top:14px;">
          <input type="checkbox" id="cnAnn" checked style="margin-top:2px;width:15px;height:15px;flex-shrink:0;" />
          <span style="font-size:13px;color:var(--text);">Also post to the Home announcements board
            <span style="display:block;font-size:11px;color:var(--muted);margin-top:1px;">Pinned as a snow banner, clears the day after the closure.</span>
          </span>
        </label>

      </div>
      <div class="home-ann-modal-footer">
        <button class="home-ann-cancel-btn" onclick="closeClosureNotice()">Cancel</button>
        <button class="home-ann-save-btn" id="cnSendBtn" onclick="sendClosureNotice()" ${recipCount === 0 ? 'disabled' : ''}>Send to ${recipCount}</button>
      </div>
    </div>
  `;

  overlay.classList.add('active');
  overlay.onclick = (e) => { if (e.target === overlay) closeClosureNotice(); };
  document.addEventListener('keydown', _closureEscHandler);

  setClosureType('delayed');  // sets segment styling, delay visibility, builds preview
};

window.setClosureType = function(t) {
  _closureType = (t === 'closed') ? 'closed' : 'delayed';
  const overlay = document.getElementById('homeClosureModalOverlay');
  if (!overlay) return;
  overlay.querySelectorAll('.cn-seg').forEach(b => {
    const on = b.getAttribute('data-type') === _closureType;
    b.style.background  = on ? 'var(--blue)' : 'var(--surface)';
    b.style.color       = on ? '#fff'        : 'var(--muted)';
    b.style.borderColor = on ? 'var(--blue)' : 'var(--border)';
  });
  const dr = overlay.querySelector('#cnDelayRow');
  if (dr) dr.style.visibility = (_closureType === 'delayed') ? 'visible' : 'hidden';
  _cnBuild();
};

// Rebuild the editable subject/body preview from the current fields.
window._cnBuild = function() {
  const overlay = document.getElementById('homeClosureModalOverlay');
  if (!overlay) return;
  const dateV  = overlay.querySelector('#cnDate').value;
  const delaySel = overlay.querySelector('#cnDelay');
  const delayV = delaySel ? delaySel.value : '';
  const noteV  = (overlay.querySelector('#cnNote').value || '').trim();
  const dateStr = dateV ? _closureFmtDate(dateV) : '{date}';
  const tpl = (_closureTemplates && _closureTemplates[_closureType]) || CLOSURE_DEFAULTS[_closureType];

  const subject = String(tpl.subject || '')
    .split('{date}').join(dateStr)
    .split('{delay}').join(delayV);
  let body = String(tpl.body || '')
    .split('{date}').join(dateStr)
    .split('{delay}').join(delayV)
    .split('{note}').join(noteV)
    .replace(/\n{3,}/g, '\n\n');

  overlay.querySelector('#cnSubj').value = subject;
  overlay.querySelector('#cnBody').value = body;
};

window.closeClosureNotice = function() {
  const overlay = document.getElementById('homeClosureModalOverlay');
  if (overlay) overlay.classList.remove('active');
  document.removeEventListener('keydown', _closureEscHandler);
};

window.sendClosureNotice = async function() {
  if (!currentEmployee || !currentEmployee.isOwner) {
    if (typeof toast === 'function') toast('⚠ Owners only');
    return;
  }
  const overlay = document.getElementById('homeClosureModalOverlay');
  if (!overlay) return;

  const btn     = overlay.querySelector('#cnSendBtn');
  const dateV   = overlay.querySelector('#cnDate').value;
  const delaySel= overlay.querySelector('#cnDelay');
  const delayV  = delaySel ? delaySel.value : '';
  const noteV   = (overlay.querySelector('#cnNote').value || '').trim();
  const subject = (overlay.querySelector('#cnSubj').value || '').trim();
  const body    = (overlay.querySelector('#cnBody').value || '').trim();
  const postAnn = overlay.querySelector('#cnAnn').checked;

  if (!dateV)            { if (typeof toast === 'function') toast('⚠ Pick a date'); return; }
  if (!subject || !body) { if (typeof toast === 'function') toast('⚠ Subject and body are required'); return; }

  const recips = _closureRecipients();
  if (recips.length === 0) {
    if (typeof toast === 'function') toast('⚠ No active employees have a personal email on file');
    return;
  }

  if (!confirm(`Send this ${_closureType === 'closed' ? 'closure' : 'delayed-opening'} notice to ${recips.length} employee${recips.length !== 1 ? 's' : ''}?`)) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  // To = sender's real inbox (keeps a copy); all staff go in BCC so personal
  // addresses are never exposed to each other.
  const SEND_DOMAIN = 'mail.nulabs.com';
  const realEmail = currentEmployee.email;
  const fromEmail = realEmail.split('@')[0] + '@' + SEND_DOMAIN;
  const bcc = recips.map(r => String(r.personalEmail).trim());

  let resendId = null, status = 'sent', errorMsg = null;
  try {
    const { data, error } = await sb.functions.invoke('send-client-email', {
      body: {
        to:           [realEmail],
        bcc:          bcc,
        subject:      subject,
        body:         body,
        fromName:     currentEmployee.name || 'NU Laboratories Management',
        fromEmail:    fromEmail,
        replyToEmail: realEmail,
      },
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    resendId = (data && data.id) ? data.id : null;
  } catch (e) {
    console.error('sendClosureNotice failed:', e);
    status = 'failed';
    errorMsg = (e && e.message) ? e.message : 'Unknown error';
  }

  // Audit log — one row per send (recipient_count rather than per-recipient rows)
  try {
    await sb.from('closure_notices').insert({
      sent_by:         currentEmployee.id,
      notice_type:     _closureType === 'closed' ? 'closed' : 'delayed',
      notice_date:     dateV,
      delay_label:     _closureType === 'delayed' ? (delayV || null) : null,
      note:            noteV || null,
      subject:         subject,
      body:            body,
      recipient_count: recips.length,
      resend_id:       resendId,
      status:          status,
      error:           errorMsg,
    });
  } catch (e) { console.error('closure_notices insert:', e); }

  if (status === 'failed') {
    if (btn) { btn.disabled = false; btn.textContent = 'Send to ' + recips.length; }
    if (typeof toast === 'function') toast('⚠ Send failed: ' + (errorMsg || ''));
    return;
  }

  // Auto-post the pinned snow banner (replaces any prior closure notice).
  if (postAnn) {
    try {
      const dateShort = _closureFmtDateShort(dateV);
      const annTitle = _closureType === 'closed'
        ? ('Closed ' + dateShort)
        : ((delayV || 'Delayed') + ' delayed opening ' + dateShort);
      const exp = new Date(dateV + 'T00:00:00');
      exp.setDate(exp.getDate() + 1);  // clears the day after the closure
      const expIso = exp.toISOString().slice(0, 10);
      await sb.from('announcements').delete().eq('kind', 'closure');
      await sb.from('announcements').insert({
        title:      annTitle,
        message:    body,
        posted_by:  currentEmployee.id,
        expires_at: expIso,
        kind:       'closure',
      });
    } catch (e) { console.error('closure announcement post:', e); }
  }

  if (typeof toast === 'function') toast('✓ Notice sent to ' + recips.length + (recips.length === 1 ? ' employee' : ' employees'));
  closeClosureNotice();
  renderHomePage();
};

function attachHomeEvents() {
  // nothing extra needed — all wired via onclick
}
