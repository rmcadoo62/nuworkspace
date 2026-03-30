
// ===== CONSTANTS =====
// ===== CONSTANTS =====

// ===== STATUS COLOR HELPER =====
// ===== STATUS COLOR HELPER =====
const STATUS_COLORS = {
  'new':        '#7a7a85',
  'inprogress': '#4caf7d',
  'prohold':    '#e8a234',
  'accthold':   '#e05c5c',
  'complete':   '#888899',
  'cancelled':  '#5b7fa6',
  'billed':     '#c084fc',
};
function statusColor(s) { return STATUS_COLORS[s] || '#7a7a85'; }
function statusLabel(s) {
  return {'new':'New','inprogress':'In Progress','prohold':'Production Hold','accthold':'Accounting Hold','complete':'Complete','cancelled':'Cancelled','billed':'Billed'}[s] || s;
}

const TASK_STATUSES = {
    new: {dot:'#7a7a85', label:'New'},
    inprogress: {dot:'#4caf7d', label:'In Progress'},
    prohold: {dot:'#e8a234', label:'Production Hold'},
    accthold: {dot:'#e05c5c', label:'Accounting Hold'},
    complete: {dot:'#888899', label:'Complete'},
    cancelled: {dot:'#5b7fa6', label:'Cancelled'},
    billed:    {dot:'#c084fc', label:'Billed'},
  };
const COLORS=['#5b9cf6','#a78bfa','#e8a234','#4caf7d','#e05c5c','#f472b6','#34d399','#fb923c','#60a5fa','#c084fc','#facc15','#2dd4bf'];
const EMOJIS=['📦','🚀','💡','🎯','🛠️','📊','🔬','🎨','📱','💻','🌐','📝','🔒','⚡','🤝','🏆','📌','🗂️','🔑','🛡️','🌟','🧩'];


// ===== SIDEBAR =====
// ===== SIDEBAR =====



// ===== VIEW SWITCH =====
// ===== VIEW SWITCH =====
function switchView(v,tab){
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+v).classList.add('active');
  if(v==='info' && activeProjectId) renderInfoSheet(activeProjectId);
  else if(v==='info') renderInfoSheet(null);
  else if(v==='tasks' && activeProjectId) renderTasksPanel(activeProjectId);
  else if(v==='expenses' && activeProjectId) renderExpensesPanel(activeProjectId);
  else if(v==='invoicing') {} // placeholder
}


// ===== TOAST =====
// ===== TOAST =====
let toastT;
function toast(msg){
  const el=document.getElementById('toast');
  document.getElementById('toastMsg').textContent=msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT=setTimeout(()=>el.classList.remove('show'),3200);
}


// ===== KEYBOARD =====
// ===== KEYBOARD =====
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeTaskModal();closeProjectModal();}
  if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){
    if(document.getElementById('taskModal').classList.contains('open'))saveTask();
    if(document.getElementById('projectModal').classList.contains('open'))saveProject();
  }
});


// ===== RE-RENDER ALL VIEWS =====
// ===== RE-RENDER ALL VIEWS =====
function renderAllViews() {
  renderTaskListView();
  updateStatsBar();
}


// ===== CONFIRM DELETE MODAL =====
// ===== CONFIRM DELETE MODAL =====
function showConfirmModal(msg, fn, opts) {
  opts = opts || {};
  const title  = opts.title  || 'Confirm Delete';
  const btnTxt = opts.btnTxt || 'Yes, Delete';
  const color  = opts.color  || 'var(--red)';
  const icon   = opts.icon   || '&#x26A0;';
  document.getElementById('confirmDeleteMsg').textContent = msg;
  const titleEl = document.getElementById('confirmModalTitle');
  titleEl.innerHTML = icon + ' ' + title;
  titleEl.style.color = color;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.textContent = btnTxt;
  btn.style.background = color;
  btn.style.borderColor = color;
  btn.style.color = '#fff';
  btn.onclick = () => { closeConfirmModal(); fn(); };
  document.getElementById('confirmDeleteModal').classList.add('open');
}
function closeConfirmModal() {
  document.getElementById('confirmDeleteModal').classList.remove('open');
}
function confirmDeleteProject(projId) {
  const proj = projects.find(p => p.id === projId);
  if (!proj) return;
  showConfirmModal(
    'Are you sure you want to delete "' + proj.name + '"? This will permanently remove the project and ALL its tasks, expenses, and chatter. This cannot be undone.',
    () => deleteProject(projId)
  );
}
function confirmDeleteTask() {
  showConfirmModal(
    'Are you sure you want to delete this task? This cannot be undone.',
    () => deleteTask()
  );
}



// ===== INIT =====
// ===== INIT =====
taskStore = [];



// ===== STARTUP =====
// ===== STARTUP =====
(async function startup() {
  // Only show setup screen if credentials are genuinely absent —
  // never because of a transient network/timing error.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    showSetupScreen();
    return;
  }

  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
  } catch(e) {
    console.error('Supabase client init failed:', e);
    // Still don't show setup screen — credentials are present, this is a library error
    // Show a user-friendly message instead
    showAppLoader(false);
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    const err = document.getElementById('loginError');
    if (err) err.textContent = 'App failed to initialize. Please refresh the page.';
    return;
  }

  // Keep the session alive — handles silent token refresh and expiry across tabs
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      console.log('Auth: token refreshed silently');
    } else if (event === 'SIGNED_OUT') {
      // Session expired or signed out in another tab — force back to login
      currentUser = null; currentEmployee = null;
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
    }
  });

  // Load data with retry — transient network errors get 2 retries before giving up
  let loadError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await loadAllData();
      loadError = null;
      break;
    } catch(e) {
      loadError = e;
      console.warn('loadAllData attempt ' + attempt + ' failed:', e);
      if (attempt < 3) await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
  if (loadError) {
    // Data load failed after retries — show login screen with error, NOT setup screen
    console.error('loadAllData failed after 3 attempts:', loadError);
    showAppLoader(false);
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    const err = document.getElementById('loginError');
    if (err) err.textContent = 'Could not connect to server. Please check your connection and refresh.';
    return;
  }

  showAppLoader(false);
  setTimeout(()=>{ if(typeof ittSetW==='function') ittSetW(ittGetW()); },200);

  // Check if already logged in (session persists)
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      await afterLogin(session.user);
    } else {
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
      showAppLoader(false);
    }
  } catch(e) {
    console.error('Session check failed:', e);
    document.getElementById('appShell').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    showAppLoader(false);
  }
})();

// ============================================================
