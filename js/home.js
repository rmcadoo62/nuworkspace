// ===== HOME PAGE =====

let _homeWeatherCache = null;
let _homeAnnouncementId = null; // currently displayed announcement being edited

// ---- Open Home Panel ----
function openHomePanel(navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-home').classList.add('active');
  document.getElementById('topbarName').textContent = 'Home';
  activeProjectId = null;
  renderHomePage();
}
window.openHomePanel = openHomePanel;

// ---- Main render ----
async function renderHomePage() {
  const wrap = document.getElementById('homeWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="home-loading">Loading...</div>';

  const [weather, announcement, whosOut] = await Promise.all([
    fetchHomeWeather(),
    fetchAnnouncement(),
    getWhosOut(),
  ]);

  const holidays  = getUpcomingHolidays(3);
  const chatter   = getRecentChatter(8);
  const canPost   = currentEmployee && (currentEmployee.isOwner || isManager());

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  wrap.innerHTML = `
    <div class="home-grid">

      <div class="home-date-header">${dateStr}</div>

      ${renderAnnouncementSection(announcement, canPost)}

      <div class="home-top-row">
        ${renderWeatherCard(weather)}
        ${renderWhosOutCard(whosOut)}
        ${renderHolidaysCard(holidays)}
      </div>

      ${renderChatterCard(chatter)}

    </div>
  `;

  attachHomeEvents();
}

// ---- Announcement ----
async function fetchAnnouncement() {
  if (!sb) return null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data } = await sb.from('announcements')
      .select('*')
      .gte('expires_at', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data || null;
  } catch { return null; }
}

function renderAnnouncementSection(ann, canPost) {
  const postBtn = canPost
    ? `<button class="home-ann-post-btn" onclick="openAnnouncementEditor()">
        ${ann ? '&#x270F; Edit' : '&#x2b; Post Announcement'}
       </button>`
    : '';

  if (!ann) {
    return `<div class="home-ann-empty" id="homeAnnSection">
      ${postBtn}
      <div id="homeAnnEditor" style="display:none"></div>
    </div>`;
  }

  const emp = (typeof employees !== 'undefined' ? employees : []).find(e => e.id === ann.posted_by);
  const poster = emp ? emp.name : 'Management';
  const expires = new Date(ann.expires_at + 'T00:00:00');
  const expiresStr = expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `<div class="home-ann-banner" id="homeAnnSection">
    <div class="home-ann-icon">&#x1F4E2;</div>
    <div class="home-ann-body">
      <div class="home-ann-message">${ann.message}</div>
      <div class="home-ann-meta">Posted by ${poster} &middot; Expires ${expiresStr}</div>
    </div>
    <div class="home-ann-actions">
      ${postBtn}
      ${canPost ? `<button class="home-ann-clear-btn" onclick="clearAnnouncement('${ann.id}')">&#x2715; Clear</button>` : ''}
    </div>
    <div id="homeAnnEditor" style="display:none"></div>
  </div>`;
}

window.openAnnouncementEditor = function() {
  const editor = document.getElementById('homeAnnEditor');
  if (!editor) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  editor.style.display = 'block';
  editor.innerHTML = `
    <div class="home-ann-form">
      <textarea class="home-ann-textarea" id="homeAnnText" placeholder="Type your announcement..." rows="2"></textarea>
      <div class="home-ann-form-row">
        <label class="home-ann-label">Expires:
          <input type="date" class="home-ann-date" id="homeAnnExpiry" value="${tomorrowStr}" />
        </label>
        <button class="home-ann-save-btn" onclick="saveAnnouncement()">Post</button>
        <button class="home-ann-cancel-btn" onclick="document.getElementById('homeAnnEditor').style.display='none'">Cancel</button>
      </div>
    </div>
  `;
  document.getElementById('homeAnnText').focus();
};

window.saveAnnouncement = async function() {
  const msg     = (document.getElementById('homeAnnText')?.value || '').trim();
  const expiry  = document.getElementById('homeAnnExpiry')?.value;
  if (!msg || !expiry) return;
  if (!sb || !currentEmployee) return;

  try {
    // Delete any existing active announcements first
    const today = new Date().toISOString().slice(0, 10);
    await sb.from('announcements').delete().gte('expires_at', today);
    // Insert new
    await sb.from('announcements').insert({
      message: msg,
      posted_by: currentEmployee.id,
      expires_at: expiry,
    });
    renderHomePage();
  } catch(e) { console.error('saveAnnouncement:', e); }
};

window.clearAnnouncement = async function(id) {
  if (!sb) return;
  try {
    await sb.from('announcements').delete().eq('id', id);
    renderHomePage();
  } catch(e) { console.error('clearAnnouncement:', e); }
};

// ---- Weather ----
async function fetchHomeWeather() {
  if (_homeWeatherCache) return _homeWeatherCache;
  try {
    // Spotswood NJ coordinates
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=40.6426&longitude=-74.8774' +
      '&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m' +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit' +
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
    const d   = new Date(dateStr + 'T00:00:00');
    const dow = DOW[d.getDay()];
    const code = days.weathercode[i + 1];
    return `<div class="home-forecast-day">
      <div class="home-forecast-dow">${dow}</div>
      <div class="home-forecast-icon">${weatherIcon(code)}</div>
      <div class="home-forecast-temps">
        <span class="home-fc-hi">${Math.round(days.temperature_2m_max[i+1])}°</span>
        <span class="home-fc-lo">${Math.round(days.temperature_2m_min[i+1])}°</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="home-card home-weather-card">
    <div class="home-card-title">🌡️ Annandale, NJ</div>
    <div class="home-weather-current">
      <div class="home-weather-icon">${weatherIcon(cur.weathercode)}</div>
      <div class="home-weather-info">
        <div class="home-weather-temp">${Math.round(cur.temperature_2m)}°F</div>
        <div class="home-weather-desc">${weatherDesc(cur.weathercode)}</div>
        <div class="home-weather-meta">Humidity ${cur.relative_humidity_2m}% · Wind ${Math.round(cur.windspeed_10m)} mph</div>
      </div>
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
      .in('emp_event_type', ['vacation', 'sick'])
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
    const label = b.empEventType === 'vacation' ? '🌴 Vacation' : '🤒 Sick';
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
function getRecentChatter(limit) {
  if (typeof chatterStore === 'undefined') return [];
  const all = [];
  Object.entries(chatterStore).forEach(([projId, msgs]) => {
    msgs.forEach(m => all.push({ ...m, projId }));
  });
  return all
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, limit);
}

function renderChatterCard(msgs) {
  const projs = typeof projects !== 'undefined' ? projects : [];

  const items = msgs.map(m => {
    const proj = projs.find(p => p.id === m.projId);
    const projName = proj ? proj.name : 'Unknown Project';
    const ago  = timeAgo(m.ts);
    const text = (m.text || '').slice(0, 120) + ((m.text||'').length > 120 ? '…' : '');
    return `<div class="home-chat-row" onclick="selectProjectById('${m.projId}')">
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
