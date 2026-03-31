
// ===== GLOBAL SEARCH =====
// ===== GLOBAL SEARCH =====
function runGlobalSearch(q) {
  const res = document.getElementById('globalSearchResults');
  if (!res) return;
  q = (q||'').trim().toLowerCase();
  if (!q) { res.classList.remove('open'); return; }

  let html = '';

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

  // Tasks
  const taskMatches = taskStore.filter(t => t.name.toLowerCase().includes(q)).slice(0, 5);
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

  // Clients
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



