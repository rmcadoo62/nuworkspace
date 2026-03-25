
// ===== TASK LIST DATA =====
// ===== TASK LIST DATA =====
const sprintTasks = [];   // loaded from Supabase
const upcomingTasks = []; // loaded from Supabase

function renderTaskList(tasks,cid){
  document.getElementById(cid).innerHTML=tasks.map((t,i)=>{
    const p=projects.find(x=>x.id===t.proj);
    const m=employees.find(x=>x.initials===t.assign)||{color:'#555',c:'#555'};
    const pt=p?`<span class="task-proj-tag" style="background:${p.color}22;color:${p.color}">${p.emoji} ${p.name}</span>`:'';
    return`<div class="task-row" style="animation-delay:${i*.04}s">
      <div class="task-check ${t.done?'done':''}" onclick="toggleTask(this)">${t.done?'&#x2713;':''}</div>
      <div class="task-name ${t.done?'done':''}">${t.name}</div>
      ${pt}
      <div class="task-assign-av" style="background:${m.c};color:#fff">${t.assign}</div>
      <div class="task-due ${t.overdue?'overdue':''}">${t.overdue?'&#x26A0; ':''}${t.due}</div>
    </div>`;
  }).join('');
}

function toggleTask(el){
  const done=el.classList.toggle('done');
  el.innerHTML=done?'&#x2713;':'';
  el.nextElementSibling.classList.toggle('done');
  event.stopPropagation();
}


// ===== INDENTED =====
// ===== INDENTED =====
const indData=[
  {title:'Platform v3',color:'#5b9cf6',epics:[
    {label:'Authentication & Security',tc:'rgba(91,156,246,0.15)',tt:'#5b9cf6',prog:60,stories:[
      {label:'OAuth 2.0 Migration',tasks:[
        {name:'Audit existing auth flow',a:'MO',due:'Mar 6',done:true},
        {name:'Set up OAuth provider config',a:'MO',due:'Mar 7',done:true},
        {name:'Migrate legacy endpoints',a:'MO',due:'Mar 8',done:false},
        {name:'Write regression tests',a:'AL',due:'Mar 10',done:false},
      ]},
      {label:'Rate Limiting',tasks:[
        {name:'Research rate limit strategies',a:'JO',due:'Mar 12',done:false},
        {name:'Implement on public endpoints',a:'JO',due:'Mar 15',done:false},
      ]}
    ]},
    {label:'Frontend — Notifications',tc:'rgba(232,162,52,0.15)',tt:'#e8a234',prog:25,stories:[
      {label:'Real-time Notification Center',tasks:[
        {name:'Design notification UI',a:'RI',due:'Mar 8',done:true},
        {name:'Integrate WebSocket feed',a:'RI',due:'Mar 10',done:false},
        {name:'Notification preferences screen',a:'SA',due:'Mar 14',done:false},
      ]}
    ]}
  ]},
  {title:'Mobile App',color:'#a78bfa',epics:[
    {label:'User Onboarding',tc:'rgba(167,139,250,0.15)',tt:'#a78bfa',prog:40,stories:[
      {label:'Welcome & Signup Flow',tasks:[
        {name:'Wireframe 5-step onboarding',a:'SA',due:'Mar 12',done:true},
        {name:'Build step 1-3 screens',a:'TA',due:'Mar 16',done:false},
        {name:'A/B test CTA copy',a:'CA',due:'Mar 20',done:false},
      ]}
    ]}
  ]}
];

function renderIndented(){
  document.getElementById('indented-body').innerHTML=indData.map((proj,pi)=>{
    const epHTML=proj.epics.map((ep,ei)=>{
      const stHTML=ep.stories.map((st,si)=>{
        const sid=`s${pi}${ei}${si}`;
        const tHTML=st.tasks.map(t=>{
          const m=employees.find(x=>x.initials===t.a)||{color:'#555',c:'#555'};
          return`<div class="tier3-row">
            <div class="tier3-check ${t.done?'done':''}" onclick="this.classList.toggle('done');this.innerHTML=this.classList.contains('done')?'&#x2713;':'';this.nextElementSibling.classList.toggle('done');event.stopPropagation()">${t.done?'&#x2713;':''}</div>
            <div class="tier3-label ${t.done?'done':''}">${t.name}</div>
            <div class="tier3-av" style="background:${m.c};color:#fff">${t.a}</div>
            <div class="tier3-due">${t.due}</div>
          </div>`;
        }).join('');
        return`<div class="tier2-row" onclick="toggle('${sid}',this.querySelector('.tier2-chevron'))">
            <span class="tier2-chevron open">&#x25B6;</span>
            <div class="tier2-label">${st.label}</div>
            <div class="tier3-due" style="margin-left:auto">${st.tasks.filter(x=>x.done).length}/${st.tasks.length} done</div>
          </div><div id="${sid}">${tHTML}</div>`;
      }).join('');
      const eid=`e${pi}${ei}`;
      return`<div class="tier1-row" onclick="toggle('${eid}',this.querySelector('.tier1-chevron'))">
          <span class="tier1-chevron open">&#x25B6;</span>
          <div class="tier1-label">${ep.label}</div>
          <div class="tier1-tag" style="background:${ep.tc};color:${ep.tt}">Epic</div>
          <div class="prog-wrap" style="margin-left:auto"><div class="prog-fill" style="width:${ep.prog}%"></div></div>
          <div class="tier3-due" style="min-width:32px;text-align:right">${ep.prog}%</div>
        </div><div id="${eid}">${stHTML}</div>`;
    }).join('');
    const pid=`p${pi}`;
    return`<div class="indent-project">
      <div class="indent-project-header" onclick="toggle('${pid}',this.querySelector('.indent-chevron'))">
        <div style="width:10px;height:10px;border-radius:50%;background:${proj.color};flex-shrink:0"></div>
        <div class="indent-project-title">${proj.title}</div>
        <span class="indent-chevron open">&#x25B6;</span>
      </div>
      <div class="indent-body" id="${pid}">${epHTML}</div>
    </div>`;
  }).join('');
}

function toggle(id,ch){
  document.getElementById(id).classList.toggle('hidden');
  if(ch)ch.classList.toggle('open');
}


// ===== TASK MODAL =====
// ===== TASK MODAL =====
let tPri='low',tAssign=new Set(),tTags=[];
let lockedProjectId = null;

function rebuildProjDropdown(){
  const sel=document.getElementById('taskProject');
  const cur=sel.value;
  sel.innerHTML=projects.map(p=>`<option value="${p.id}">${p.emoji} ${p.name}</option>`).join('');
  if(projects.find(x=>x.id===cur))sel.value=cur;
  syncProjChip(sel);
}

function syncProjChip(sel){
  const p=projects.find(x=>x.id===sel.value);
  if(!p)return;
  document.getElementById('tProjDot').style.background=p.color;
  document.getElementById('tProjLabel').textContent=p.emoji+' '+p.name;
}

function openTaskModal(){
  lockedProjectId = null;
  const projField = document.getElementById('taskProject')?.closest('.field');
  if (projField) projField.style.display = '';
  tPri='low'; tAssign=new Set(); tTags=[];
  document.getElementById('taskTitle').value='';
  document.getElementById('taskDesc').value='';
  document.getElementById('taskStatus').value='new';
  document.getElementById('taskDue').value='';
  document.getElementById('taskSalesCat').value='';
  document.getElementById('taskFixedPrice').value='';
  if (document.getElementById('taskRevenueType')) { document.getElementById('taskRevenueType').value='fixed'; toggleTaskFixedPriceField('fixed'); }
  document.getElementById('tTitleCnt').textContent='0';
  document.getElementById('tDescCnt').textContent='0';
  document.querySelectorAll('.pp').forEach(b=>b.className='pp');
  document.querySelector('[data-p="high"]').classList.add('sel-high');
  renderTags(); rebuildProjDropdown(); buildTaskChips();
  document.getElementById('taskModal').classList.add('open');
  setTimeout(()=>document.getElementById('taskTitle').focus(),80);
}

function closeTaskModal(){document.getElementById('taskModal').classList.remove('open');}

function buildTaskChips(){
  const grid = document.getElementById('taskChipGrid');
  if (employees.length === 0) {
    grid.innerHTML = '<div style="font-size:12.5px;color:var(--muted);padding:8px 4px">No employees yet — add some in the Employees panel first.</div>';
    return;
  }
  grid.innerHTML = employees.filter(e => e.isActive !== false).map(e=>`
    <div class="chip ${tAssign.has(e.id)?'sel':''}" onclick="togAssign('${e.id}',this)">
      <div class="chip-av" style="background:${e.color}">${e.initials}</div>
      <span class="chip-name">${e.name}</span>
      <div class="chip-chk">${tAssign.has(e.id)?'&#x2713;':''}</div>
    </div>`).join('');
}

function togAssign(id,el){
  if(tAssign.has(id)){tAssign.delete(id);el.classList.remove('sel');el.querySelector('.chip-chk').innerHTML='';}
  else{tAssign.add(id);el.classList.add('sel');el.querySelector('.chip-chk').innerHTML='&#x2713;';}
}

function selPri(btn){
  document.querySelectorAll('.pp').forEach(b=>b.className='pp');
  tPri=btn.dataset.p; btn.classList.add('sel-'+tPri);
}

function cc(el,id,max){document.getElementById(id).textContent=el.value.length;}

function tagKey(e){
  const inp=e.target;
  if((e.key==='Enter'||e.key===',')&&inp.value.trim()){
    e.preventDefault();
    const t=inp.value.trim().replace(/,/g,'');
    if(t&&!tTags.includes(t)&&tTags.length<8){tTags.push(t);renderTags();}
    inp.value='';
  }else if(e.key==='Backspace'&&!inp.value&&tTags.length){tTags.pop();renderTags();}
}

function removeTag(i){tTags.splice(i,1);renderTags();}

function renderTags(){
  const w=document.getElementById('tagWrap'),inp=document.getElementById('tagIn');
  w.querySelectorAll('.tag-pill').forEach(p=>p.remove());
  tTags.forEach((t,i)=>{
    const pill=document.createElement('div');
    pill.className='tag-pill';
    pill.innerHTML=`${t} <span class="tag-rm" onclick="removeTag(${i})">&#x2715;</span>`;
    w.insertBefore(pill,inp);
  });
}

// saveTask moved to unified store section below


// ===== UNIFIED TASK STORE =====
// ===== UNIFIED TASK STORE =====
// Merge sprint + upcoming into one flat store with section metadata
let taskStore = [
  ...sprintTasks.map(t => ({...t, section:'sprint'})),
  ...upcomingTasks.map(t => ({...t, section:'upcoming'})),
];


// ===== FILTERED TASK HELPERS =====
// ===== FILTERED TASK HELPERS =====
function getFilteredTasks() {
  if (!activeProjectId) return taskStore;
  return taskStore.filter(t => t.proj === activeProjectId);
}


// ===== TASK LIST VIEW =====
// ===== TASK LIST VIEW =====
function renderTaskListView() {
  const tasks = getFilteredTasks();
  const sprint = tasks.filter(t => t.section === 'sprint');
  const upcoming = tasks.filter(t => t.section === 'upcoming');

  renderTaskList(sprint, 'tasks-sprint');
  renderTaskList(upcoming, 'tasks-upcoming');

  // Update section counts
  const sc = document.getElementById('sprintCount');
  if (sc) sc.textContent = sprint.length + ' task' + (sprint.length !== 1 ? 's' : '');

  // Show/hide empty states
  showEmptyIfNeeded('tasks-sprint', sprint.length, 'No sprint tasks for this project');
  showEmptyIfNeeded('tasks-upcoming', upcoming.length, 'No upcoming tasks for this project');
}

function showEmptyIfNeeded(containerId, count, msg) {
  const c = document.getElementById(containerId);
  if (!c) return;
  const existing = c.querySelector('.empty-state');
  if (existing) existing.remove();
  if (count === 0) {
    c.innerHTML = `<div class="empty-state">
      <div class="empty-icon">&#x1F4CB;</div>
      <div class="empty-msg">${msg}</div>
      <button class="btn btn-ghost" id="addTaskBtn1" style="margin-top:10px;font-size:12px;display:none" onclick="openTaskModal()">+ Add Task</button>
    </div>`;
  }
}


// ===== KANBAN VIEW =====
// ===== KANBAN VIEW =====
function renderKanbanView() {
  const tasks = getFilteredTasks();
  const statuses = [
    {id:'col-backlog',   status:'backlog',    label:'Backlog',     color:'#7a7a85'},
    {id:'col-inprogress',status:'inprogress', label:'In Progress', color:'#e8a234'},
    {id:'col-review',    status:'review',     label:'Review',      color:'#5b9cf6'},
    {id:'col-done',      status:'done',       label:'Done',        color:'#4caf7d'},
  ];

  statuses.forEach(({id, status, label, color}) => {
    const col = document.getElementById(id);
    if (!col) return;
    const colTasks = tasks.filter(t => (t.status || guessStatus(t)) === status);
    const addBtn = col.querySelector('.add-card');

    // Remove all existing cards
    col.querySelectorAll('.card').forEach(c => c.remove());

    // Update count
    const cnt = col.querySelector('.kanban-count');
    if (cnt) cnt.textContent = colTasks.length;

    // Render filtered cards
    colTasks.forEach((t, i) => {
      const p = projects.find(x => x.id === t.proj);
      const m = employees.find(x => x.initials === t.assign) || {color:'#555',c:'#555'};
      const card = document.createElement('div');
      card.className = 'card';
      card.style.animationDelay = (i * 0.05) + 's';
      card.setAttribute('data-proj', t.proj);
      card.setAttribute('data-task-id', t._id || '');
      card.innerHTML = `
        <div class="card-tag" style="background:${p ? p.color+'22' : 'rgba(76,175,125,0.15)'};color:${p ? p.color : '#4caf7d'}">${p ? p.emoji + ' ' + p.name : 'Task'}</div>
        <div class="card-title">${t.name}</div>
        <div class="card-footer">
          <div class="card-assignee" style="background:${m.c};color:#fff">${t.assign}</div>
          <div class="priority ${priClass(t.priority || 'medium')}">${priLabel(t.priority || 'medium')}</div>
          <div class="card-meta">${t.due || ''}</div>
        </div>`;
      if (t.done) card.style.opacity = '0.6';
      col.insertBefore(card, addBtn);
    });

    // Show empty state if no tasks
    let emptyCard = col.querySelector('.col-empty');
    if (emptyCard) emptyCard.remove();
    if (colTasks.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'col-empty';
      emptyCard.style.cssText = 'text-align:center;padding:20px 10px;color:var(--muted);font-size:12px;';
      emptyCard.textContent = 'No tasks';
      col.insertBefore(emptyCard, addBtn);
    }
  });
}

function guessStatus(t) {
  if (t.done) return 'done';
  if (t.section === 'upcoming') return 'backlog';
  return 'inprogress';
}

function priClass(p) {
  return {urgent:'p-high', high:'p-med', medium:'p-low', low:'p-low'}[p] || 'p-low';
}

function priLabel(p) {
  return {urgent:'Urgent', high:'High', medium:'Medium', low:'Low'}[p] || 'Medium';
}


// ===== INDENTED VIEW (filtered) =====
// ===== INDENTED VIEW (filtered) =====
function renderIndentedView() {
  const body = document.getElementById('indented-body');

  // Filter indData to only show projects matching activeProjectId
  const filtered = activeProjectId
    ? indData.filter(p => {
        const proj = projects.find(x => x.name === p.title || x.id === activeProjectId);
        // Match by project id stored in indData, or by title for default data
        return p.projId === activeProjectId ||
               (activeProjectId === 'platform' && p.title === 'Platform v3') ||
               (activeProjectId === 'mobile'   && p.title === 'Mobile App') ||
               (activeProjectId === 'brand'    && p.title === 'Brand Refresh') ||
               (activeProjectId === 'docs'     && p.title === 'API Docs');
      })
    : indData;

  if (filtered.length === 0) {
    body.innerHTML = `<div class="empty-state" style="margin:40px auto;max-width:340px">
      <div class="empty-icon">&#x1F5C2;&#xFE0F;</div>
      <div class="empty-msg">No epics or stories yet for this project</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Epics and stories will appear here once added.</div>
    </div>`;
    return;
  }

  body.innerHTML = filtered.map((proj, pi) => {
    const epHTML = proj.epics.map((ep, ei) => {
      const stHTML = ep.stories.map((st, si) => {
        const sid = `s${pi}${ei}${si}`;
        const tHTML = st.tasks.map(t => {
          const m = employees.find(x => x.initials === t.a) || {color:'#555',c:'#555'};
          return `<div class="tier3-row">
            <div class="tier3-check ${t.done?'done':''}" onclick="this.classList.toggle('done');this.innerHTML=this.classList.contains('done')?'&#x2713;':'';this.nextElementSibling.classList.toggle('done');event.stopPropagation()">${t.done?'&#x2713;':''}</div>
            <div class="tier3-label ${t.done?'done':''}">${t.name}</div>
            <div class="tier3-av" style="background:${m.c};color:#fff">${t.a}</div>
            <div class="tier3-due">${t.due}</div>
          </div>`;
        }).join('');
        return `<div class="tier2-row" onclick="toggle('${sid}',this.querySelector('.tier2-chevron'))">
            <span class="tier2-chevron open">&#x25B6;</span>
            <div class="tier2-label">${st.label}</div>
            <div class="tier3-due" style="margin-left:auto">${st.tasks.filter(x=>x.done).length}/${st.tasks.length} done</div>
          </div><div id="${sid}">${tHTML}</div>`;
      }).join('');
      const eid = `e${pi}${ei}`;
      return `<div class="tier1-row" onclick="toggle('${eid}',this.querySelector('.tier1-chevron'))">
          <span class="tier1-chevron open">&#x25B6;</span>
          <div class="tier1-label">${ep.label}</div>
          <div class="tier1-tag" style="background:${ep.tc};color:${ep.tt}">Epic</div>
          <div class="prog-wrap" style="margin-left:auto"><div class="prog-fill" style="width:${ep.prog}%"></div></div>
          <div class="tier3-due" style="min-width:32px;text-align:right">${ep.prog}%</div>
        </div><div id="${eid}">${stHTML}</div>`;
    }).join('');
    const pid = `p${pi}`;
    return `<div class="indent-project">
      <div class="indent-project-header" onclick="toggle('${pid}',this.querySelector('.indent-chevron'))">
        <div style="width:10px;height:10px;border-radius:50%;background:${proj.color};flex-shrink:0"></div>
        <div class="indent-project-title">${proj.title}</div>
        <span class="indent-chevron open">&#x25B6;</span>
      </div>
      <div class="indent-body" id="${pid}">${epHTML}</div>
    </div>`;
  }).join('');
}


// ===== STATS BAR =====
// ===== STATS BAR =====
function updateStatsBar() { /* stats bar removed */ }


// ===== SAVE TASK — push to store =====
// ===== SAVE TASK — push to store =====
window.saveTask = function saveTask(another=false){
  const title=document.getElementById('taskTitle').value.trim();
  if(!title){
    const inp=document.getElementById('taskTitle');
    inp.style.borderColor='var(--red)';inp.style.boxShadow='0 0 0 3px rgba(224,92,92,0.18)';
    inp.focus();setTimeout(()=>{inp.style.borderColor='';inp.style.boxShadow='';},1800);return;
  }
  const due=document.getElementById('taskDue').value;
  let dueLabel='';
  if(due){const d=new Date(due+'T00:00:00');dueLabel=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});}
  const assign=[...tAssign][0]||'AL';
  const status=document.getElementById('taskStatus').value;
  const projId = lockedProjectId || document.getElementById('taskProject').value;
  const overdue = due && new Date(due+'T00:00:00') < new Date();

  const today = new Date().toISOString().split('T')[0];

  // Add to store
  const newTask = {
    name: title,
    assign,
    due: dueLabel,
    overdue,
    done: status === 'complete',
    proj: projId,
    status,
    priority: tPri,
    section: 'sprint',
    createdAt: today,
    _id: Date.now(),
  };
  taskStore.unshift(newTask);

  closeTaskModal();
  toast('"'+(title.length>40?title.slice(0,40)+'...':title)+'" created');

  // Re-render all views with current filter
  renderAllViews();

  // Always refresh the tasks sub-panel if we're on it or switch to it
  if (activeProjectId) {
    renderTasksPanel(activeProjectId);
    // If tasks sub-panel is visible, keep it; otherwise switch to it
    const subTasks = document.getElementById('sub-tasks');
    if (subTasks && subTasks.classList.contains('active')) {
      // already visible, already re-rendered above
    } else if (document.getElementById('panel-project')?.classList.contains('active')) {
      switchProjTab('sub-tasks');
    }
  }

  // Refresh info task list if info sub-panel is active
  const subInfo = document.getElementById('sub-info');
  if (subInfo && subInfo.classList.contains('active') && activeProjectId) {
    renderInfoTasks(activeProjectId, currentTaskFilter);
  }

  if(another)setTimeout(()=>openTaskModal(),340);
}


// ===== EMPTY STATE CSS =====
// ===== EMPTY STATE CSS =====
const emptyStyle = document.createElement('style');
emptyStyle.textContent = `
  .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;}
  .empty-icon{font-size:32px;margin-bottom:10px;opacity:0.5;}
  .empty-msg{font-size:14px;color:var(--muted);font-weight:500;}
`;
document.head.appendChild(emptyStyle);



// ===== TASKS PANEL =====
// ===== TASKS PANEL =====
function renderTasksPanel(projId) {
  const wrap = document.getElementById('tasksPanelWrap');
  if (!wrap || !projId) return;

  let tasks = taskStore.filter(t => t.proj === projId).sort((a,b) => (a.taskNum||0) - (b.taskNum||0));
  const total   = tasks.length;
  const done    = tasks.filter(t => t.status === 'complete' || t.status === 'billed' || t.status === 'cancelled' || t.done).length;
  const active  = total - done;
  const overdue = tasks.filter(t => t.overdue && !t.done).length;

  // Get current filter from button state
  const activeFilter = wrap.getAttribute('data-filter') || 'all';
  if (activeFilter === 'active')  tasks = tasks.filter(t => !t.done);
  if (activeFilter === 'done')    tasks = tasks.filter(t => t.done);
  if (activeFilter === 'overdue') tasks = tasks.filter(t => t.overdue && !t.done);

  const statusStyles = {
    new: {dot:'#7a7a85', label:'New'},
    inprogress: {dot:'#4caf7d', label:'In Progress'},
    prohold: {dot:'#e8a234', label:'Production Hold'},
    accthold: {dot:'#e05c5c', label:'Accounting Hold'},
    complete: {dot:'#888899', label:'Complete'},
    cancelled: {dot:'#5b7fa6', label:'Cancelled'},
    billed:    {dot:'#c084fc', label:'Billed'},
  };

  // Build combined ordered list: sections + tasks interleaved by taskNum
  const sections = sectionStore
    .filter(s => s.projId === projId)
    .sort((a,b) => (a.taskNum||0) - (b.taskNum||0));

  // Build a flat ordered list of {type, item, num}
  const allItems = [
    ...sections.map(s => ({type:'section', item:s, num: s.taskNum||0})),
    ...tasks.map(t => ({type:'task', item:t, num: t.taskNum||0})),
  ].sort((a,b) => a.num - b.num);

  const taskRows = allItems.map(entry => {
    if (entry.type === 'section') {
      const s = entry.item;
      const taskCount = tasks.filter(t => t.sectionId === s._id).length;
      return `<div class="itt-section-header" data-section-id="${s._id}" draggable="true"
          ondragstart="sectionDragStart(event,'${s._id}')"
          ondragover="taskDragOver(event)"
          ondragleave="taskDragLeave(event)"
          ondrop="taskDrop(event,'${projId}')">
          <div class="itt-drag-handle" onclick="event.stopPropagation()">⠿</div>
          <span class="itt-section-chevron ${s.collapsed?'':'open'}" onclick="toggleSection('${s._id}','${projId}');event.stopPropagation()">▶</span>
          <span class="itt-section-name" ondblclick="startEditSectionName('${s._id}','${projId}');event.stopPropagation()">${s.name}</span>
          <span class="itt-section-count">${taskCount} task${taskCount!==1?'s':''}</span>
          <div class="itt-section-actions">
            <button class="itt-section-action-btn itt-section-add-btn" onclick="openTaskModalForSection('${s._id}','${projId}');event.stopPropagation()">+ Task</button>
            <button class="itt-section-action-btn" onclick="deleteSectionHeader('${s._id}','${projId}');event.stopPropagation()">✕</button>
          </div>
        </div>`;
    }

    const t = entry.item;
    // Hide if parent section is collapsed
    const parentSec = t.sectionId ? sections.find(s => s._id === t.sectionId) : null;
    if (parentSec && parentSec.collapsed) return '';

    const empM = employees.find(e => e.initials === t.assign) || {color:'#555'};
    const statusOpts = ['new','inprogress','prohold','accthold','complete','cancelled','billed'].map(s => {
        const labels = {'new':'New','inprogress':'In Progress','prohold':'Production Hold','accthold':'Accounting Hold','complete':'Complete','cancelled':'Cancelled','billed':'Billed'};
        return `<option value="${s}" ${t.status===s?'selected':''}>${labels[s]}</option>`;
      }).join('');
    const salesOpts = ['','11','12','13','33','41','42','43','44','51','52','53','54','55','56','57','58','59','67','91','92','93','94','95','96','98','99'].map(v =>
      `<option value="${v}" ${(t.salesCat||'')===v?'selected':''}>${v||'—'}</option>`).join('');
    const loggedH = getHoursForTask(t.name, t.proj);
    const budgetH = t.budgetHours || 0;
    const hColor  = budgetH > 0 && loggedH > budgetH ? 'var(--red)' : loggedH > 0 ? 'var(--blue)' : 'var(--muted)';

    return `
      <div class="itt-row" data-task-id="${t._id}" draggable="true" style="${t.status==='billed'?'background:rgba(192,132,252,0.18);border-color:rgba(192,132,252,0.45);':t.status==='cancelled'?'background:rgba(232,162,52,0.15);border-color:rgba(232,162,52,0.45);border-left:3px solid #e8a234;':t.status==='complete'||t.done?'background:rgba(120,120,130,0.16);border-color:rgba(120,120,130,0.35);':t.status==='inprogress'?'background:rgba(46,158,98,0.10);border-color:rgba(46,158,98,0.30);':''}"
        ondragstart="taskDragStart(event,'${t._id}')"
        ondragover="taskDragOver(event)"
        ondragleave="taskDragLeave(event)"
        ondrop="taskDrop(event,'${projId}')">
        <div class="itt-drag-handle" onclick="event.stopPropagation()">⠿</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);padding-left:2px">${t.taskNum||''}</div>
        <div class="itt-check" onclick="tpToggleDone('${t._id}','${projId}');event.stopPropagation()"></div>
        <div onclick="event.stopPropagation()">
          <select class="inline-edit-select" onchange="inlineSave('${t._id}','${projId}','salesCat',this.value)" style="color:var(--amber);font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 2px;width:100%">${salesOpts}</select>
        </div>
        <div class="itt-name ${t.done?'done':''} itt-cell-edit" onclick="inlineEditName('${t._id}','${projId}');event.stopPropagation()">${t.name}${t.revenueType==='nocharge'?'<span style="margin-left:6px;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:rgba(208,64,64,0.12);color:var(--red)">NC</span>':''}</div>
        <div onclick="event.stopPropagation()">
          <select class="status-pill-select" style="color:${statusColor(t.status||'new')};background:${statusColor(t.status||'new')}18;border-color:${statusColor(t.status||'new')}55"
            onchange="inlineSave('${t._id}','${projId}','status',this.value);this.style.color=statusColor(this.value);this.style.background=statusColor(this.value)+'18';this.style.borderColor=statusColor(this.value)+'55'">${statusOpts}</select>
        </div>
        <div class="itt-cell-edit" onclick="inlineEditQuoteNum('${t._id}','${projId}');event.stopPropagation()" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);cursor:text">${t.quoteNum||'—'}</div>
        <div class="itt-cell-edit" onclick="inlineEditPoNum('${t._id}','${projId}');event.stopPropagation()" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text);cursor:text">${t.poNumber||'—'}</div>
        <div class="itt-cell-edit" onclick="inlineEditPrice('${t._id}','${projId}');event.stopPropagation()" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--green);cursor:text">
          ${t.fixedPrice ? '$'+t.fixedPrice.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}
        </div>
        <div style="font-size:12px;color:var(--muted)">${fmtShortDate(t.createdAt)}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${hColor}">
          ${loggedH > 0 ? loggedH.toFixed(1)+'h' : '—'}${budgetH > 0 ? '<span style="color:var(--muted);font-size:10px"> /'+budgetH+'</span>' : ''}
        </div>
        <div class="itt-cell-edit" onclick="inlineEditBudgetHours('${t._id}','${projId}');event.stopPropagation()" style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);cursor:text">
          ${budgetH > 0 ? budgetH+'h' : '—'}
        </div>
        <div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:4px">
          <div class="itt-av" style="background:${empM.color}" id="av_${t._id}">${t.assign||'?'}</div>
          <select class="inline-edit-select" style="font-size:10px;padding:2px 2px;border:none;background:transparent;color:var(--muted);width:auto;max-width:70px" onchange="inlineSave('${t._id}','${projId}','assign',this.value);document.getElementById('av_${t._id}').style.background=(employees.find(e=>e.initials===this.value)||{color:'#555'}).color;document.getElementById('av_${t._id}').textContent=this.value||'?'">
            <option value="">—</option>
            ${employees.filter(e=>e.isActive!==false).map(e => `<option value="${e.initials}" ${t.assign===e.initials?'selected':''}>${e.name.split(' ')[0]}</option>`).join('')}
          </select>
        </div>
        <div class="itt-cell-edit" onclick="inlineEditTaskDate('${t._id}','${projId}','taskStartDate');event.stopPropagation()" style="font-size:12px;color:var(--muted);cursor:text">${fmtShortDate(t.taskStartDate)}</div>
        <div class="itt-cell-edit" onclick="inlineEditTaskDate('${t._id}','${projId}','${t.status==='billed'?'billedDate':'completedDate'}');event.stopPropagation()" style="font-size:12px;color:${(t.completedDate||t.billedDate)?'var(--green)':'var(--muted)'};cursor:text">${t.status==='billed'?fmtShortDate(t.billedDate):fmtShortDate(t.completedDate)}</div>
        <div class="itt-row-actions">
          <button class="itt-row-action-btn" onclick="openEditTaskModal('${t._id}');event.stopPropagation()">&#x270E;</button>
        </div>
      </div>`;
  }).join('');

  wrap.setAttribute('data-filter', activeFilter);
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="info-task-filters" style="margin:0">
          <button class="itf ${activeFilter==='all'?'active':''}"    onclick="setTasksPanelFilter('all','${projId}')">All <span style="font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.7">${total}</span></button>
          <button class="itf ${activeFilter==='active'?'active':''}" onclick="setTasksPanelFilter('active','${projId}')">Open <span style="font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.7">${active}</span></button>
          <button class="itf ${activeFilter==='done'?'active':''}"   onclick="setTasksPanelFilter('done','${projId}')">Done <span style="font-family:'JetBrains Mono',monospace;font-size:10px;opacity:.7">${done}</span></button>
        </div>
      </div>
      ${isManager() ? `<div style="display:flex;gap:8px"><button class="btn btn-primary" style="font-size:12.5px" onclick="openTaskModalForProject('${projId}')">+ Add Task</button><button class="btn btn-ghost" style="font-size:12.5px;border:1px solid var(--border)" onclick="addSectionHeader('${projId}')">+ Section</button></div>` : ''}
    </div>
    <div class="itt-head" id="ittHead">
      <div class="itt-head-cell"></div><div class="itt-head-cell" style="color:var(--muted);font-size:10px">#<span class="itt-resizer" data-col="num"></span></div>
      <div class="itt-head-cell"><span class="itt-resizer" data-col="pri"></span></div>
      <div class="itt-head-cell">Cat.<span class="itt-resizer" data-col="cat"></span></div>
      <div class="itt-head-cell">Task<span class="itt-resizer" data-col="task"></span></div>
      <div class="itt-head-cell">Status<span class="itt-resizer" data-col="status"></span></div>
      <div class="itt-head-cell">Quote #<span class="itt-resizer" data-col="quote"></span></div>
      <div class="itt-head-cell">PO #<span class="itt-resizer" data-col="po"></span></div>
      <div class="itt-head-cell">Price<span class="itt-resizer" data-col="price"></span></div>
      <div class="itt-head-cell">Created<span class="itt-resizer" data-col="created"></span></div>
      <div class="itt-head-cell">Hrs Logged<span class="itt-resizer" data-col="hrs"></span></div>
      <div class="itt-head-cell">Budget Hrs<span class="itt-resizer" data-col="bhrs"></span></div>
      <div class="itt-head-cell">Assignee<span class="itt-resizer" data-col="assign"></span></div>
      <div class="itt-head-cell">Start Date<span class="itt-resizer" data-col="start"></span></div>
      <div class="itt-head-cell">Done/Billed<span class="itt-resizer" data-col="comp"></span></div>
      <div class="itt-head-cell"></div>
    </div>
    ${tasks.length === 0
      ? `<div class="info-tasks-empty"><div class="eico">${activeFilter==='done'?'✅':activeFilter==='overdue'?'🎉':'📋'}</div>${activeFilter==='done'?'No completed tasks yet':activeFilter==='overdue'?'No overdue tasks — great work!':'No tasks yet — add one above'}</div>`
      : taskRows}
  `;
  setTimeout(ittInitResizers, 0);
}


function renderHoursPanel(projId) {
  const body = document.getElementById('hoursPanelBody');
  if (!body) return;

  const tasks = taskStore.filter(t => t.proj === projId);
  if (tasks.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">No tasks found for this project.</div>';
    return;
  }

  // Build: { taskName: [ { date, empId, hrs } ] }
  const data = {};

  Object.entries(tsData).forEach(([key, rows]) => {
    if (!key.includes('|')) return;
    const [empId, weekKey] = key.split('|');
    if (!weekKey) return;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    const weekStart = new Date(weekKey + 'T00:00:00');

    rows.forEach(row => {
      if (row.projId !== projId || !row.taskName) return;
      // Each day index
      Object.entries(row.hours||{}).forEach(([di, hrs]) => {
        const h = parseFloat(hrs)||0;
        if (h <= 0) return;
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + parseInt(di));
        const dateStr = d.toISOString().slice(0,10);
        if (!data[row.taskName]) data[row.taskName] = [];
        data[row.taskName].push({ date: dateStr, empId, hrs: h });
      });
    });
  });

  const taskNames = Object.keys(data);
  if (taskNames.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">No hours logged for this project yet.</div>';
    return;
  }

  const fmtDate = ds => new Date(ds+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

  let grandTotal = 0;
  let html = '';

  // Sort tasks in same order as taskStore
  tasks.forEach(task => {
    if (!data[task.name]) return;
    const entries = data[task.name].sort((a,b) => a.date.localeCompare(b.date));
    const taskTotal = entries.reduce((s,e)=>s+e.hrs,0);
    grandTotal += taskTotal;

    html += `<div style="margin-bottom:24px;border:1px solid var(--border);border-radius:10px;overflow:hidden">`;
    // Task header
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--surface2);border-bottom:1px solid var(--border)">`;
    html += `<div style="font-size:13px;font-weight:700;color:var(--text)">📋 ${task.name}</div>`;
    html += `<div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--blue)">${taskTotal.toFixed(1)}h total</div>`;
    html += `</div>`;

    // Entries table
    html += `<table style="width:100%;border-collapse:collapse">`;
    html += `<thead><tr style="border-bottom:1px solid var(--border)">
      <th style="text-align:left;padding:7px 16px;font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)">Date</th>
      <th style="text-align:left;padding:7px 16px;font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)">Employee</th>
      <th style="text-align:right;padding:7px 16px;font-size:10px;font-weight:600;letter-spacing:.7px;text-transform:uppercase;color:var(--muted)">Hours</th>
    </tr></thead><tbody>`;

    entries.forEach((entry, i) => {
      const emp = employees.find(e => e.id === entry.empId);
      if (!emp) return;
      const bg = i % 2 === 0 ? '' : 'background:var(--surface2)';
      html += `<tr style="border-bottom:1px solid var(--border);${bg}">`;
      html += `<td style="padding:7px 16px;font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace">${fmtDate(entry.date)}</td>`;
      html += `<td style="padding:7px 16px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:22px;height:22px;border-radius:50%;background:${emp.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0">${emp.initials}</div>
          <span style="font-size:12.5px;color:var(--text)">${emp.name}</span>
        </div>
      </td>`;
      html += `<td style="text-align:right;padding:7px 16px;font-size:12.5px;font-weight:600;font-family:'JetBrains Mono',monospace;color:var(--text)">${entry.hrs.toFixed(1)}h</td>`;
      html += '</tr>';
    });

    html += '</tbody></table></div>';
  });

  // Grand total
  html += `<div style="display:flex;justify-content:flex-end;padding:12px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface2)">
    <span style="font-size:13px;font-weight:700;color:var(--text);margin-right:16px">Project Total</span>
    <span style="font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--blue)">${grandTotal.toFixed(1)}h</span>
  </div>`;

  body.innerHTML = html;
}


function inlineEditBudgetHours(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  // Find the budget hours cell (7th child after check)
  const cells = [...row.children];
  const cell = cells[11]; // budget hours cell (index 11: drag,num,check,cat,name,status,quote,po,price,created,loggedHrs,budgetHrs)
  if (!cell) return;
  const orig = t.budgetHours || 0;
  cell.innerHTML = `<input class="inline-edit-input" type="text" inputmode="decimal" value="${orig||''}" placeholder="0" style="font-family:'JetBrains Mono',monospace;width:50px" />`;
  const inp = cell.querySelector('input');
  inp.focus(); inp.select();
  const commit = () => { inlineSave(taskId, projId, 'budgetHours', inp.value); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inp.blur();} if(e.key==='Escape'){renderTasksPanel(projId);} });
}

function inlineEditTaskDate(taskId, projId, field) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const fieldIdx = {taskStartDate:13, completedDate:14};
  const cell = [...row.children][fieldIdx[field]];
  if (!cell) return;
  const orig = t[field] || '';
  cell.innerHTML = `<input class="inline-edit-input" type="date" value="${orig}" style="color-scheme:dark;width:110px" />`;
  const inp = cell.querySelector('input');
  inp.focus();
  const commit = () => { inlineSave(taskId, projId, field, inp.value); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inp.blur();} if(e.key==='Escape'){renderTasksPanel(projId);} });
}

function setTasksPanelFilter(filter, projId) {
  const wrap = document.getElementById('tasksPanelWrap');
  if (wrap) wrap.setAttribute('data-filter', filter);
  renderTasksPanel(projId);
}

function tpToggleDone(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  t.done = !t.done;
  t.status = t.done ? 'complete' : 'inprogress';
  if (sb) dbUpdate('tasks', taskId, { done: t.done, status: t.status });
  renderTasksPanel(projId);
  renderProjSummary(projId);
  updateStatsBar();
  setTimeout(ittInitResizers,0);
  setTimeout(applyPermissions,0);
}



// ===== INLINE TASK EDITING =====
// ===== INLINE TASK EDITING =====
async function inlineSave(taskId, projId, field, value) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;

  const today = new Date().toISOString().split('T')[0];

  // Update local store first
  if (field === 'status') {
    const _oldStatus = t.status;
    t.status = value;
    t.done = (value === 'complete' || value === 'done' || value === 'billed');
    logAuditChange('tasks', taskId, t.name, 'status', _oldStatus, value);

    // Auto-set dates on status transitions
    const extraUpdates = {};
    if (value === 'inprogress' && !t.taskStartDate) {
      t.taskStartDate = today;
      extraUpdates.task_start_date = today;
    }
    if ((value === 'complete' || value === 'done') && !t.completedDate) {
      t.completedDate = today;
      extraUpdates.completed_date = today;
    }
    if (value === 'billed') {
      if (!t.billedDate) {
        t.billedDate = today;
        extraUpdates.billed_date = today;
      }
      if (!t.completedDate) {
        t.completedDate = today;
        extraUpdates.completed_date = today;
      }
    }
    // Save status first (always works), then dates separately (in case columns are new)
    if (sb) {
      const { error } = await sb.from('tasks').update({ status: value }).eq('id', taskId);
      if (error) console.error('status save', error);
      if (Object.keys(extraUpdates).length > 0) {
        const { error: e2 } = await sb.from('tasks').update(extraUpdates).eq('id', taskId);
        if (e2) console.error('date save error (run SQL migration):', e2.message);
      }
    }
  }
  else if (field === 'salesCat')    { t.salesCat = value; }
  else if (field === 'priority')    { t.priority = value; }
  else if (field === 'fixedPrice')  { t.fixedPrice = parseFloat(value) || 0; }
  else if (field === 'name')        { t.name = value; }
  else if (field === 'due_raw') {
    t.due_raw = value;
    t.due = value ? new Date(value + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
    t.overdue = value ? new Date(value + 'T00:00:00') < new Date() && !t.done : false;
  }
  else if (field === 'budgetHours')   { t.budgetHours = parseFloat(value)||0; }
  else if (field === 'taskStartDate') { t.taskStartDate = value; }
  else if (field === 'completedDate') { t.completedDate = value; }
  else if (field === 'billedDate')    { t.billedDate = value; }
  else if (field === 'quoteNum')      { t.quoteNum = value; }
  else if (field === 'poNumber')      { t.poNumber = value; }
  else if (field === 'assign')        { t.assign = value; t.assignId = (employees.find(e => e.initials === value)||{}).id || ''; }

  // Persist non-status fields to Supabase
  if (field !== 'status' && sb) {
    const dbFieldMap = {
      salesCat: 'sales_category', priority: 'priority',
      fixedPrice: 'fixed_price', name: 'name',
      due_raw: 'due_date', assign: 'assignee',
      taskStartDate: 'task_start_date', completedDate: 'completed_date',
      billedDate: 'billed_date', budgetHours: 'budget_hours', poNumber: 'po_number',
      quoteNum: 'quote_number',
    };
    const col = dbFieldMap[field];
    if (col) {
      const { error } = await sb.from('tasks').update({ [col]: value||null }).eq('id', taskId);
      if (error) console.error('inline save', error);
    }
  }

  renderInfoTasks(projId, currentTaskFilter);
  renderTasksPanel(projId);
  renderProjSummary(projId);
  updateStatsBar();
  // Sync billed revenue to project_info when status or price changes
  if (field === 'status' || field === 'fixedPrice') syncProjBilledRevenue(projId);
  setTimeout(ittInitResizers,0);
  setTimeout(applyPermissions,0);
}

function inlineEditName(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const nameEl = row.querySelector('.itt-name');
  const orig = t.name;
  nameEl.innerHTML = `<input class="inline-edit-input" value="${orig.replace(/"/g,'&quot;')}" maxlength="120" />`;
  const inp = nameEl.querySelector('input');
  inp.focus(); inp.select();
  const commit = () => {
    const val = inp.value.trim();
    if (val && val !== orig) inlineSave(taskId, projId, 'name', val);
    else renderInfoTasks(projId, currentTaskFilter);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { renderInfoTasks(projId, currentTaskFilter); }
  });
}


async function inlineEditQuoteNum(taskId, projId) {
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  // Quote cell (index 6: drag,num,check,cat,name,status,quote)
  const cells = row.children;
  const cell = cells[6];
  if (cell.querySelector('input')) return;
  const prev = cell.innerHTML;
  cell.innerHTML = '';
  const inp = document.createElement('input');
  inp.className = 'inline-edit-input';
  inp.value = t.quoteNum || '';
  inp.placeholder = 'Quote #';
  inp.style.cssText = 'width:100%;font-family:"JetBrains Mono",monospace;font-size:11px';
  cell.appendChild(inp);
  inp.focus(); inp.select();
  const save = async () => {
    const val = inp.value.trim();
    t.quoteNum = val;
    if (sb) await sb.from('tasks').update({ quote_number: val||null }).eq('id', taskId);
    renderTasksPanel(projId);
  };
  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', e => { if (e.key==='Enter') inp.blur(); if (e.key==='Escape') { cell.innerHTML=prev; } });
}

function inlineEditPoNum(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const cells = [...row.children];
  const cell = cells[7]; // PO # cell
  if (!cell) return;
  const orig = t.poNumber || '';
  cell.innerHTML = `<input class="inline-edit-input" type="text" value="${orig}" placeholder="PO #" style="width:80px" />`;
  const inp = cell.querySelector('input');
  inp.focus(); inp.select();
  const commit = () => { inlineSave(taskId, projId, 'poNumber', inp.value); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();inp.blur();} if(e.key==='Escape'){renderTasksPanel(projId);} });
}

function inlineEditPrice(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const cells = row.querySelectorAll('div');
  // Price is the 5th cell (index 4 after check, name, status, cat)
  const priceCell = [...row.children].find(el => el.classList.contains('itt-cell-edit') && el.style.color.includes('green') || el.getAttribute('onclick')?.includes('inlineEditPrice'));
  if (!priceCell) return;
  const orig = t.fixedPrice || 0;
  priceCell.innerHTML = `<input class="inline-edit-input" type="number" value="${orig||''}" step="0.01" placeholder="0.00" style="font-family:'JetBrains Mono',monospace;width:80px" />`;
  const inp = priceCell.querySelector('input');
  inp.focus(); inp.select();
  const commit = () => {
    const val = parseFloat(inp.value) || 0;
    inlineSave(taskId, projId, 'fixedPrice', val);
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { renderInfoTasks(projId, currentTaskFilter); }
  });
}

function inlineEditDue(taskId, projId) {
  const t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  const row = document.querySelector(`.itt-row[data-task-id="${taskId}"]`);
  if (!row) return;
  const dueCell = row.querySelector('.itt-due');
  if (!dueCell) return;
  dueCell.innerHTML = `<input class="inline-edit-input" type="date" value="${t.due_raw||''}" style="color-scheme:dark;width:120px" />`;
  const inp = dueCell.querySelector('input');
  inp.focus();
  const commit = () => inlineSave(taskId, projId, 'due_raw', inp.value);
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { renderInfoTasks(projId, currentTaskFilter); }
  });
}

async function inlineDeleteTask(taskId, projId) {
  if (!confirm('Delete this task?')) return;
  if (sb) {
    const { error } = await sb.from('tasks').delete().eq('id', taskId);
    if (error) { toast('⚠ Could not delete task'); return; }
  }
  taskStore = taskStore.filter(t => t._id !== taskId);
  toast('Task deleted');
  if (document.getElementById('panel-tasks')?.classList.contains('active')) renderTasksPanel(projId);
  else renderInfoTasks(projId, currentTaskFilter);
  renderProjSummary(projId);
  updateStatsBar();
  setTimeout(ittInitResizers,0);
  setTimeout(applyPermissions,0);
}


// ===== EDIT TASK MODAL =====
// ===== EDIT TASK MODAL =====
let editingTaskId = null;
let etPri = 'medium';
let etAssign = new Set();

async function openEditTaskModal(taskId) {
  let t = taskStore.find(x => x._id === taskId);
  if (!t) return;
  // Refresh revenue_type from DB in case it was updated
  if (sb && !taskId.startsWith('local-')) {
    const { data: fresh } = await sb.from('tasks').select('revenue_type').eq('id', taskId).single();
    if (fresh) {
      t.revenueType = fresh.revenue_type || 'fixed';
      const idx = taskStore.findIndex(x => x._id === taskId);
      if (idx > -1) taskStore[idx].revenueType = t.revenueType;
    }
  }
  editingTaskId = taskId;
  etPri = t.priority || 'low';
  etAssign = new Set(t.assign ? [t.assign] : []);

  const p = projects.find(x => x.id === t.proj);
  document.getElementById('etProjDot').style.background = p ? p.color : '#5b9cf6';
  document.getElementById('etProjLabel').textContent = p ? p.emoji + ' ' + p.name : '';

  document.getElementById('etTitle').value = t.name || '';
  document.getElementById('etDesc').value = t.desc || '';
  document.getElementById('etStatus').value = t.status || 'inprogress';
  document.getElementById('etDue').value = t.completedDate || t.due_raw || '';
  document.getElementById('etSalesCat').value = t.salesCat || '';
  document.getElementById('etFixedPrice').value = t.fixedPrice || '';
  if (document.getElementById('etRevenueType')) {
    document.getElementById('etRevenueType').value = t.revenueType || 'fixed';
    toggleFixedPriceField(t.revenueType || 'fixed');
  }
  document.getElementById('etTitleCnt').textContent = (t.name||'').length;
  document.getElementById('etDescCnt').textContent = (t.desc||'').length;

  // Priority buttons
  document.querySelectorAll('#editTaskModal .pp').forEach(b => b.className = 'pp');
  const pb = document.querySelector('#editTaskModal [data-p="' + etPri + '"]');
  if (pb) pb.classList.add('sel-' + etPri);

  // Assignee chips
  buildEditTaskChips();

  document.getElementById('editTaskModal').classList.add('open');
  setTimeout(() => document.getElementById('etTitle').focus(), 80);
}

function closeEditTaskModal() {
  document.getElementById('editTaskModal').classList.remove('open');
  editingTaskId = null;
}

function etSelPri(btn) {
  document.querySelectorAll('#editTaskModal .pp').forEach(b => b.className = 'pp');
  etPri = btn.dataset.p;
  btn.classList.add('sel-' + etPri);
}

function toggleTaskFixedPriceField(val) {
  const field = document.getElementById('taskFixedPriceField');
  if (field) field.style.display = val === 'nocharge' ? 'none' : '';
  if (val === 'nocharge') {
    const inp = document.getElementById('taskFixedPrice');
    if (inp) inp.value = '0';
  }
}

function toggleFixedPriceField(val) {
  const field = document.getElementById('etFixedPriceField');
  if (field) field.style.display = val === 'nocharge' ? 'none' : 'flex';
  if (val === 'nocharge') {
    const inp = document.getElementById('etFixedPrice');
    if (inp) inp.value = '0';
  }
}

function buildEditTaskChips() {
  const grid = document.getElementById('etChipGrid');
  if (employees.length === 0) {
    grid.innerHTML = '<div style="font-size:12.5px;color:var(--muted);padding:8px 4px">No employees yet.</div>';
    return;
  }
  grid.innerHTML = employees.filter(e => e.isActive !== false).map(e => `
    <div class="chip ${etAssign.has(e.id) || etAssign.has(e.initials) ? 'sel' : ''}" onclick="etTogAssign('${e.id}','${e.initials}',this)">
      <div class="chip-av" style="background:${e.color}">${e.initials}</div>
      <span class="chip-name">${e.name}</span>
      <div class="chip-chk">${etAssign.has(e.id) || etAssign.has(e.initials) ? '&#x2713;' : ''}</div>
    </div>`).join('');
}

function etTogAssign(id, initials, el) {
  // Clear others (single assignee for now)
  etAssign.clear();
  document.querySelectorAll('#etChipGrid .chip').forEach(c => { c.classList.remove('sel'); c.querySelector('.chip-chk').innerHTML = ''; });
  etAssign.add(id);
  el.classList.add('sel');
  el.querySelector('.chip-chk').innerHTML = '&#x2713;';
}

async function updateCompletedDateFromStatus() {
  const status = document.getElementById('etStatus').value;
  const dueFld = document.getElementById('etDue');
  if ((status === 'complete' || status === 'billed') && !dueFld.value) {
    dueFld.value = new Date().toISOString().slice(0,10);
  }
}

async function saveEditTask() {
  const title = document.getElementById('etTitle').value.trim();
  if (!title) {
    document.getElementById('etTitle').style.borderColor = 'var(--red)';
    setTimeout(() => document.getElementById('etTitle').style.borderColor = '', 1800);
    return;
  }

  const due        = document.getElementById('etDue').value;
  const status     = document.getElementById('etStatus').value;
  const salesCat   = document.getElementById('etSalesCat').value;
  const fixedPrice = parseFloat(document.getElementById('etFixedPrice').value) || 0;
  const revenueType = document.getElementById('etRevenueType') ? document.getElementById('etRevenueType').value : 'fixed';
  const assignId   = [...etAssign][0] || '';
  const assignEmp  = employees.find(e => e.id === assignId) || employees.find(e => e.initials === assignId);
  const assign     = assignEmp ? assignEmp.initials : assignId;
  const desc       = document.getElementById('etDesc').value.trim();
  const dueLabel   = due ? new Date(due + 'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';
  const isOverdue  = due ? new Date(due + 'T00:00:00') < new Date() && status !== 'done' : false;

  // Auto-set completed date if marking complete/billed with no date
  const completedDate = due || ((status === 'complete' || status === 'billed') ? new Date().toISOString().slice(0,10) : null);

  const updates = {
    name: title, description: desc, assignee: assign,
    completed_date: completedDate||null, due_date: null, status, priority: etPri,
    sales_category: salesCat||null,
    fixed_price: fixedPrice||null,
    revenue_type: revenueType,
    done: status === 'complete',
  };

  if (sb && editingTaskId) {
    const _editTask = taskStore.find(t => t._id === editingTaskId);
    if (_editTask) {
      const _fieldMap = {name:'name',assignee:'assign',status:'status',sales_category:'salesCat',
        fixed_price:'fixedPrice',revenue_type:'revenueType',priority:'priority',description:'desc',
        completed_date:'completedDate'};
      Object.entries(updates).forEach(([dbCol, newVal]) => {
        const storeKey = _fieldMap[dbCol];
        if (storeKey) {
          const oldVal = _editTask[storeKey];
          if (String(oldVal||'') !== String(newVal||'')) {
            logAuditChange('tasks', editingTaskId, _editTask.name, dbCol, oldVal, newVal);
          }
        }
      });
    }
    const { error } = await sb.from('tasks').update(updates).eq('id', editingTaskId);
    if (error) { toast('⚠ Could not save changes'); console.error(error); return; }
  }

  // Update taskStore
  const idx = taskStore.findIndex(t => t._id === editingTaskId);
  if (idx > -1) {
    taskStore[idx] = {
      ...taskStore[idx],
      name: title, desc, assign, due: dueLabel, due_raw: '', completedDate: completedDate||'',
      status, priority: etPri, salesCat, fixedPrice, revenueType,
      done: status === 'complete', overdue: isOverdue,
    };
  }

  closeEditTaskModal();
  toast('Task updated');
  syncProjBilledRevenue(editingTaskId ? taskStore.find(t=>t._id===editingTaskId)?.proj || activeProjectId : activeProjectId);
  renderAllViews();
  if (activeProjectId) {
    renderInfoTasks(activeProjectId, currentTaskFilter);
    renderTasksPanel(activeProjectId);
    renderProjSummary(activeProjectId);
    renderExpectedRevenue(activeProjectId);
  }
}

async function deleteTask() {
  if (!editingTaskId) return;
  if (sb) {
    const { error } = await sb.from('tasks').delete().eq('id', editingTaskId);
    if (error) { toast('⚠ Could not delete task'); return; }
  }
  taskStore = taskStore.filter(t => t._id !== editingTaskId);
  closeEditTaskModal();
  toast('Task deleted');
  renderAllViews();
  if (activeProjectId) {
    renderTasksPanel(activeProjectId);
    renderInfoTasks(activeProjectId, currentTaskFilter);
    renderExpectedRevenue(activeProjectId);
  }
}


// ===== TASK DRAG & DROP REORDER =====
// ===== TASK DRAG & DROP REORDER =====
let _dragTaskId = null;
let _dragSectionId = null;

function taskDragStart(event, taskId) {
  _dragTaskId = taskId;
  _dragSectionId = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', taskId);
  setTimeout(() => event.target.closest('.itt-row')?.classList.add('dragging'), 0);
}

function sectionDragStart(event, sectionId) {
  _dragSectionId = sectionId;
  _dragTaskId = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', sectionId);
  setTimeout(() => event.target.closest('.itt-section-header')?.classList.add('dragging'), 0);
}

function taskDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const row = event.target.closest('.itt-row, .itt-section-header');
  if (row) {
    const dragId = _dragTaskId || _dragSectionId;
    const rowId = row.dataset.taskId || row.dataset.sectionId;
    if (rowId !== dragId) {
      document.querySelectorAll('.itt-row.drag-over, .itt-section-header.drag-over').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    }
  }
}

function taskDragLeave(event) {
  event.target.closest('.itt-row, .itt-section-header')?.classList.remove('drag-over');
}

async function taskDrop(event, projId) {
  event.preventDefault();
  document.querySelectorAll('.itt-row.dragging, .itt-row.drag-over, .itt-section-header.dragging, .itt-section-header.drag-over').forEach(r => {
    r.classList.remove('dragging', 'drag-over');
  });

  const dropRow = event.target.closest('.itt-row, .itt-section-header');
  if (!dropRow) return;
  const dropTaskId = dropRow.dataset.taskId;
  const dropSectionId = dropRow.dataset.sectionId;

  // Build the flat ordered list of all items
  const projTasks = taskStore.filter(t => t.proj === projId);
  const projSections = sectionStore.filter(s => s.projId === projId);
  let allItems = [
    ...projSections.map(s => ({type:'section', item:s, num: s.taskNum||0})),
    ...projTasks.map(t => ({type:'task', item:t, num: t.taskNum||0})),
  ].sort((a,b) => a.num - b.num);

  // Find drag and drop indices
  const dragId = _dragTaskId || _dragSectionId;
  const dropId = dropTaskId || dropSectionId;
  if (!dragId || dragId === dropId) return;

  const dragIdx = allItems.findIndex(x => (x.item._id === dragId));
  const dropIdx = allItems.findIndex(x => (x.item._id === dropId));
  if (dragIdx === -1 || dropIdx === -1) return;

  // If dragging a section, also move its tasks with it
  if (_dragSectionId) {
    const sec = projSections.find(s => s._id === _dragSectionId);
    if (!sec) return;
    // Get indices of all tasks belonging to this section in the ordered list
    const sectionItemIndices = [dragIdx, ...allItems.map((x,i) => (x.type==='task' && x.item.sectionId===_dragSectionId) ? i : -1).filter(i=>i>=0)];
    const sectionItems = sectionItemIndices.map(i => allItems[i]);
    // Remove them all
    const remaining = allItems.filter((_,i) => !sectionItemIndices.includes(i));
    // Find drop position in remaining
    const newDropIdx = remaining.findIndex(x => x.item._id === dropId);
    if (newDropIdx === -1) return;
    remaining.splice(newDropIdx, 0, ...sectionItems);
    allItems = remaining;
  } else {
    // Simple task move
    const [moved] = allItems.splice(dragIdx, 1);
    const newDropIdx = allItems.findIndex(x => x.item._id === dropId);
    allItems.splice(newDropIdx, 0, moved);

    // Update sectionId: task takes the section of whatever section header precedes it
    let currentSecId = null;
    allItems.forEach(x => {
      if (x.type === 'section') currentSecId = x.item._id;
      else if (x.item._id === moved.item._id) moved.item.sectionId = currentSecId;
    });
    if (sb) await sb.from('tasks').update({ section_id: moved.item.sectionId||null }).eq('id', moved.item._id);
  }

  // Reassign taskNum 1..n for all items
  allItems.forEach((x, i) => { x.item.taskNum = i + 1; });

  // Save to Supabase
  if (sb) {
    await Promise.all(allItems.map(x => {
      if (x.type === 'task') return sb.from('tasks').update({ task_num: x.item.taskNum }).eq('id', x.item._id);
      else return sb.from('task_sections').update({ task_num: x.item.taskNum }).eq('id', x.item._id);
    }));
  }

  _dragTaskId = null; _dragSectionId = null;
  renderTasksPanel(projId);
  if (document.getElementById('infoTaskList')) renderInfoTasks(projId, currentTaskFilter);
}


// ===== TASK SECTION HEADERS =====
// ===== TASK SECTION HEADERS =====
async function addSectionHeader(projId) {
  const name = prompt('Section name:', 'New Section');
  if (!name?.trim()) return;
  // Place at end — get max taskNum
  const maxNum = Math.max(0,
    ...taskStore.filter(t=>t.proj===projId).map(t=>t.taskNum||0),
    ...sectionStore.filter(s=>s.projId===projId).map(s=>s.taskNum||0)
  ) + 1;
  let newId = 'local-' + Date.now();
  if (sb) {
    const { data, error } = await sb.from('task_sections')
      .insert({ project_id: projId, name: name.trim(), task_num: maxNum, collapsed: false })
      .select().single();
    if (!error && data) newId = data.id;
  }
  sectionStore.push({ _id: newId, projId, name: name.trim(), taskNum: maxNum, collapsed: false });
  renderTasksPanel(projId);
}

async function toggleSection(sectionId, projId) {
  const s = sectionStore.find(x => x._id === sectionId);
  if (!s) return;
  s.collapsed = !s.collapsed;
  if (sb && !sectionId.startsWith('local-')) {
    await sb.from('task_sections').update({ collapsed: s.collapsed }).eq('id', sectionId);
  }
  renderTasksPanel(projId);
}

function startEditSectionName(sectionId, projId) {
  const s = sectionStore.find(x => x._id === sectionId);
  if (!s) return;
  const nameEl = document.querySelector(`.itt-section-header[data-section-id="${sectionId}"] .itt-section-name`);
  if (!nameEl) return;
  const input = document.createElement('input');
  input.className = 'itt-section-name-input';
  input.value = s.name;
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const save = async () => {
    const newName = input.value.trim() || s.name;
    s.name = newName;
    if (sb && !sectionId.startsWith('local-')) {
      await sb.from('task_sections').update({ name: newName }).eq('id', sectionId);
    }
    renderTasksPanel(projId);
  };
  input.onblur = save;
  input.onkeydown = e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderTasksPanel(projId); };
}

async function deleteSectionHeader(sectionId, projId) {
  if (!confirm('Delete this section header? Tasks inside it will remain but lose their grouping.')) return;
  // Unlink tasks from this section
  const affectedTasks = taskStore.filter(t => t.sectionId === sectionId);
  affectedTasks.forEach(t => { t.sectionId = null; });
  if (sb) {
    await sb.from('tasks').update({ section_id: null }).eq('section_id', sectionId);
    if (!sectionId.startsWith('local-')) await sb.from('task_sections').delete().eq('id', sectionId);
  }
  sectionStore = sectionStore.filter(s => s._id !== sectionId);
  renderTasksPanel(projId);
}

function openTaskModalForSection(sectionId, projId) {
  openTaskModalForProject(projId);
  // Store the sectionId so saveTask can attach it
  window._pendingSectionId = sectionId;
}

// ===== SUPABASE SAVE TASK PATCH =====
// Patch saveTask
const _origSaveTask = typeof saveTask !== "undefined" ? saveTask : ()=>{};
window.saveTask = async function(another=false) {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { document.getElementById('taskTitle').style.borderColor='var(--red)'; setTimeout(()=>document.getElementById('taskTitle').style.borderColor='',1800); return; }

  const due   = document.getElementById('taskDue').value;
  const assignId = [...tAssign][0] || '';
  const assignEmp = employees.find(e => e.id === assignId);
  const assign = assignEmp ? assignEmp.initials : assignId;
  const status= document.getElementById('taskStatus').value;
  const projId= lockedProjectId || document.getElementById('taskProject').value;
  const salesCat = document.getElementById('taskSalesCat').value;
  const fixedPrice = parseFloat(document.getElementById('taskFixedPrice').value) || 0;

  // Assign next taskNum for this project BEFORE saving
  if (!window._projTaskNums) window._projTaskNums = {};
  window._projTaskNums[projId] = (window._projTaskNums[projId] || 0) + 1;
  const _nextNum = window._projTaskNums[projId];

  const today = new Date().toISOString().split('T')[0];
  const row = {
    name: title,
    description: document.getElementById('taskDesc').value.trim(),
    project_id: projId, assignee: assign,
    completed_date: (status === 'complete' || status === 'done' || status === 'billed') ? (due||null) : null,
    due_date: null, status, priority: tPri,
    section: 'sprint', done: status==='done',
    sales_category: salesCat||null,
    fixed_price: fixedPrice||null,
    revenue_type: document.getElementById('taskRevenueType') ? document.getElementById('taskRevenueType').value : 'fixed',
    task_num: _nextNum,
    created_at: new Date().toISOString(),
  };
  const saved = await dbInsert('tasks', row);
  if (!saved) { window._projTaskNums[projId]--; toast('⚠ Could not save task'); return; }

  // Link to section if opened via "+ Task" on a section header
  if (window._pendingSectionId) {
    await sb?.from('tasks').update({ section_id: window._pendingSectionId }).eq('id', saved.id);
  }

  const dueLabel = due ? new Date(due+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
  // 'due' field is now Completed Date
  const _revType = document.getElementById('taskRevenueType') ? document.getElementById('taskRevenueType').value : 'fixed';
  taskStore.push({
    _id: saved.id, taskNum: _nextNum, name: title, assign, assignId, due: dueLabel, due_raw: '',
    completedDate: (status === 'complete' || status === 'done' || status === 'billed') ? due : '',
    salesCat, fixedPrice,
    sectionId: window._pendingSectionId || null,
    overdue: due ? new Date(due+'T00:00:00') < new Date() && status!=='done' : false,
    done: status==='done', proj: projId, status, priority: tPri, section:'sprint',
    createdAt: today, revenueType: _revType,
  });

  closeTaskModal();
  window._pendingSectionId = null;
  toast('"' + (title.length>40?title.slice(0,40)+'…':title) + '" created');
  renderAllViews();
  const _proj = projects.find(p => p.id === projId);
  logActivity('tasks', saved.id, title, 'Task Created' + (_proj ? ' on ' + _proj.name : ''));

  // Always refresh tasks panel — works whether on sub-tasks or sub-info
  if (activeProjectId) {
    renderTasksPanel(activeProjectId);
    const subInfo = document.getElementById('sub-info');
    if (subInfo && subInfo.classList.contains('active')) renderInfoTasks(activeProjectId, currentTaskFilter);
    // If project container is open but not on tasks tab, switch to tasks
    const subTasks = document.getElementById('sub-tasks');
    const projContainer = document.getElementById('panel-project');
    if (projContainer && projContainer.classList.contains('active') && subTasks && !subTasks.classList.contains('active')) {
      switchProjTab('sub-tasks');
    }
  }
  if (another) setTimeout(()=>openTaskModal(), 340);
};

// Patch toggleInfoTask to persist
