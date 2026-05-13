
// ===== GLOBAL SEARCH =====
// ===== GLOBAL SEARCH =====

// ===== RECENT PICKS (search-box history) =====
// Stored in localStorage. Storage is per-browser, not per-user — switching
// machines means a fresh recents list. If cross-device sync becomes a need
// later, swap the three _recents* functions below for Supabase calls; the
// rest of the file stays as-is.
const RECENTS_KEY = 'nuworkspace_search_recents';
const RECENTS_MAX = 5;

function _recentsRead() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); }
  catch { return []; }
}
function _recentsWrite(arr) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(arr.slice(0, RECENTS_MAX))); }
  catch (e) { console.warn('[recents] save failed', e); }
}
function _recentsEsc(s) {
  // Defensive: recents can be tampered with in localStorage. Escape on render.
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function recordRecentPick(pick) {
  if (!pick || !pick.type || !pick.id) return;
  // Don't pollute the real user's history while impersonating
  if (typeof isImpersonating === 'function' && isImpersonating()) return;
  const recents = _recentsRead().filter(r => !(r.type === pick.type && r.id === pick.id));
  recents.unshift({
    type: pick.type,
    id:   pick.id,
    proj: pick.proj || null,
    label: pick.label || '',
    icon:  pick.icon  || '',
    sub:   pick.sub   || '',
    picked_at: Date.now()
  });
  _recentsWrite(recents);
}

function getRecentsForDisplay() {
  // Filter stale entries whose underlying entity no longer exists in memory
  return _recentsRead().filter(r => {
    if (r.type === 'project') return typeof projects    !== 'undefined' && projects.some(p => p.id === r.id);
    if (r.type === 'task')    return typeof taskStore   !== 'undefined' && taskStore.some(t => t._id === r.id);
    if (r.type === 'client')  return typeof clientStore !== 'undefined' && clientStore.some(c => c.id === r.id);
    return false;
  });
}

function _renderRecentsHtml(recents) {
  // No section label — visual absence signals "these are your recents, not a search"
  let html = '<div class="gs-section">';
  recents.forEach(r => {
    const projAttr = r.proj ? ' data-proj="' + _recentsEsc(r.proj) + '"' : '';
    html += '<div class="gs-item" data-action="' + _recentsEsc(r.type) + '" data-id="' + _recentsEsc(r.id) + '"' + projAttr + '>' +
      '<span class="gs-item-icon">' + _recentsEsc(r.icon || '📁') + '</span>' +
      '<div><div class="gs-item-main">' + _recentsEsc(r.label) + '</div>' +
      (r.sub ? '<div class="gs-item-sub">' + _recentsEsc(r.sub) + '</div>' : '') +
      '</div></div>';
  });
  html += '</div>';
  return html;
}

function runGlobalSearch(q) {
  const res = document.getElementById('globalSearchResults');
  if (!res) return;
  q = (q||'').trim().toLowerCase();
  if (!q) {
    const recents = getRecentsForDisplay();
    if (!recents.length) { res.classList.remove('open'); return; }
    res.innerHTML = _renderRecentsHtml(recents);
    res.classList.add('open');
    return;
  }

  let html = '';

  // Clients (entity-level matches first — they're usually what you want)
  const clientMatches = clientStore.filter(c => c.name.toLowerCase().includes(q)).slice(0, 4);
  if (clientMatches.length) {
    html += '<div class="gs-section"><div class="gs-section-label">Clients</div>';
    clientMatches.forEach(c => {
      html += '<div class="gs-item" data-action="client" data-id="' + c.id + '">' +
        '<span class="gs-item-icon">🏢</span>' +
        '<div><div class="gs-item-main">' + c.name + '</div></div></div>';
    });
    html += '</div>';
  }

  // Contacts
  const contactMatches = contactStore.filter(c =>
    (c.firstName + ' ' + c.lastName).toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)
  ).slice(0, 4);
  if (contactMatches.length) {
    html += '<div class="gs-section"><div class="gs-section-label">Contacts</div>';
    contactMatches.forEach(c => {
      html += '<div class="gs-item" data-action="client" data-id="' + (c.clientId||'') + '">' +
        '<span class="gs-item-icon">👤</span>' +
        '<div><div class="gs-item-main">' + c.firstName + ' ' + c.lastName + '</div>' +
        '<div class="gs-item-sub">' + (c.email||'') + '</div></div></div>';
    });
    html += '</div>';
  }

  // Projects
  const projMatches = projects.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  if (projMatches.length) {
    html += '<div class="gs-section"><div class="gs-section-label">Projects</div>';
    projMatches.forEach(p => {
      const info = projectInfo[p.id] || {};
      html += '<div class="gs-item" data-action="project" data-id="' + p.id + '">' +
        '<span class="gs-item-icon">' + (p.emoji||'📁') + '</span>' +
        '<div><div class="gs-item-main">' + p.name + '</div>' +
        '<div class="gs-item-sub">' + (info.status||'') + '</div></div></div>';
    });
    html += '</div>';
  }

  // Tasks (capped at 3 — task names are repetitive and tend to flood the
  // panel; keeping them shorter pushes them to a tertiary signal)
  const taskMatches = taskStore.filter(t => t.name.toLowerCase().includes(q)).slice(0, 3);
  if (taskMatches.length) {
    html += '<div class="gs-section"><div class="gs-section-label">Tasks</div>';
    taskMatches.forEach(t => {
      const proj = projects.find(p => p.id === t.proj);
      html += '<div class="gs-item" data-action="task" data-proj="' + t.proj + '" data-id="' + t._id + '">' +
        '<span class="gs-item-icon">✓</span>' +
        '<div><div class="gs-item-main">' + t.name + '</div>' +
        '<div class="gs-item-sub">' + (proj ? proj.name : '') + '</div></div></div>';
    });
    html += '</div>';
  }

  res.innerHTML = html || '<div class="gs-no-results">No results</div>';
  res.classList.add('open');
}

// Single delegated click handler on the results container — no inline onclick needed
document.addEventListener('DOMContentLoaded', function() {
  const res = document.getElementById('globalSearchResults');
  if (!res) return;
  res.addEventListener('mousedown', function(e) {
    const item = e.target.closest('.gs-item');
    if (!item) return;
    e.preventDefault();
    const action = item.dataset.action;
    const id = item.dataset.id;
    const proj = item.dataset.proj;
    // Capture display data from the DOM (cheaper than re-fetching from state stores)
    const label = item.querySelector('.gs-item-main')?.textContent || '';
    const icon  = item.querySelector('.gs-item-icon')?.textContent || '';
    const sub   = item.querySelector('.gs-item-sub')?.textContent || '';
    recordRecentPick({ type: action, id, proj, label, icon, sub });
    gsCloseSearch();
    if (action === 'project') {
      navToProject(id);
      document.getElementById('navProjects')?.classList.add('active');
    } else if (action === 'task') {
      selectProject(proj, null);
      
      document.getElementById('navProjects')?.classList.add('active');
      setTimeout(() => {
        const tasksTab = Array.from(document.querySelectorAll('.view-tab')).find(t => (t.getAttribute('onclick')||'').includes("'tasks'"));
        if (tasksTab) tasksTab.click();
        setTimeout(() => {
          const row = document.querySelector('[data-task-id="' + id + '"]');
          if (row) { row.scrollIntoView({behavior:'smooth',block:'center'}); row.style.background='var(--amber-glow)'; setTimeout(()=>row.style.background='',1500); }
        }, 300);
      }, 150);
    } else if (action === 'client') {
      openClientsPanel(document.getElementById('navClients'));
      setTimeout(() => openClientDrawer(id), 150);
    }
  });
});

function gsCloseSearch() {
  const res = document.getElementById('globalSearchResults');
  const inp = document.getElementById('globalSearchInput');
  if (res) res.classList.remove('open');
  if (inp) inp.value = '';
}

function gsOpenProject(projId) {
  gsCloseSearch();
  if (!projId) return;
  navToProject(projId);
  document.getElementById('navProjects')?.classList.add('active');
}

function gsOpenClients() {
  gsCloseSearch();
  openClientsPanel(document.getElementById('navClients'));
}

// Close search on click outside
document.addEventListener('click', e => {
  if (!e.target.closest('.global-search-wrap')) gsCloseSearch();
});



