
// ===== CONSTANTS =====
// ===== CONSTANTS =====
const TEAM=[
  {id:'AL',name:'Alex',  c:'#5b4fcf'},{id:'SA',name:'Sam',   c:'#b94d8a'},
  {id:'JO',name:'Jordan',c:'#2d8a6e'},{id:'RI',name:'Riley', c:'#c47a25'},
  {id:'CA',name:'Casey', c:'#4a6fa5'},{id:'MO',name:'Morgan',c:'#7a4a9a'},
  {id:'DR',name:'Drew',  c:'#3d8a3d'},{id:'TA',name:'Taylor',c:'#8a4a3d'},
  {id:'QU',name:'Quinn', c:'#5a7a4a'},{id:'BL',name:'Blake', c:'#4a5a8a'},
  {id:'AV',name:'Avery', c:'#8a6a2a'},{id:'RE',name:'Reese', c:'#6a3d5a'},
  {id:'FI',name:'Finley',c:'#2d6a7a'},{id:'SG',name:'Sage',  c:'#7a2d4a'},
];


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
  renderKanbanView();
  renderIndentedView();
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
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    await loadAllData(); // load projects/employees/etc first
    showAppLoader(false);
    setTimeout(()=>{ if(typeof ittSetW==='function') ittSetW(ittGetW()); },200);

    // Check if already logged in (session persists)
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      await afterLogin(session.user);
    } else {
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('loginScreen').style.display = 'flex';
      showAppLoader(false);
    }
  } catch(e) {
    console.error('Startup failed:', e);
    showSetupScreen();
  }
})();

// ============================================================
