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

  const [weather, announcements, whosOut, mySubmissions] = await Promise.all([
    fetchHomeWeather(),
    fetchAnnouncements(),
    getWhosOut(),
    fetchMySubmissions(),
  ]);

  const holidays  = getUpcomingHolidays(3);
  const chatter   = await fetchRecentChatter(8);
  const canPost   = currentEmployee && (currentEmployee.isOwner || isManager());

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  wrap.innerHTML = `
    <div class="home-grid">

      <div class="home-date-header">${dateStr}</div>

      ${renderAnnouncementSection(announcements, canPost)}

      <div class="home-top-row">
        ${renderWeatherCard(weather)}
        ${renderWhosOutCard(whosOut)}
        ${renderHolidaysCard(holidays)}
      </div>

      ${renderChatterCard(chatter)}

      ${renderMySubmissionsCard(mySubmissions)}

    </div>
  `;

  attachHomeEvents();
}

// ---- Announcements ----
async function fetchAnnouncements() {
  if (!sb) return [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await sb.from('announcements')
      .select('*')
      .gte('expires_at', today)
      .order('created_at', { ascending: false })
      .limit(ANN_MAX_ACTIVE);
    if (error) { console.error('fetchAnnouncements:', error); return []; }
    return data || [];
  } catch (e) { console.error('fetchAnnouncements:', e); return []; }
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

// ---- Weather ----
async function fetchHomeWeather() {
  if (_homeWeatherCache) return _homeWeatherCache;
  try {
    // Spotswood NJ coordinates
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=40.6426&longitude=-74.8774' +
      '&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit' +
      '&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=4';
    const res  = await fetch(url);
    const data = await res.json();
    _homeWeatherCache = data;
    return data;
  } catch { return null; }
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

function attachHomeEvents() {
  // nothing extra needed — all wired via onclick
}
