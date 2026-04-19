
// ===== SETUP SCREEN =====
// ===== SETUP SCREEN =====
function showSetupScreen() {
  document.getElementById('appLoader').style.display = 'none';
  document.getElementById('appShell').style.display  = 'none';
  document.getElementById('setupScreen').style.display = 'flex';
}

async function connectSupabase() {
  const url = document.getElementById('setupUrl').value.trim().replace(/\/+$/,'');
  const key = document.getElementById('setupKey').value.trim();
  const btn = document.getElementById('setupConnectBtn');
  const err = document.getElementById('setupError');
  err.textContent = '';
  if (!url || !key) { err.textContent = 'Both fields are required.'; return; }
  btn.textContent = 'Connecting…'; btn.disabled = true;

  // Test connection
  try {
    const testSb = window.supabase.createClient(url, key);
    const { error } = await testSb.from('projects').select('id').limit(1);
    if (error) throw error;
    localStorage.setItem('nuworkspace_sb_url', url);
    localStorage.setItem('nuworkspace_sb_key', key);
    sb = testSb;
    document.getElementById('setupScreen').style.display = 'none';
    await loadAllData();
  } catch(e) {
    err.textContent = 'Connection failed: ' + (e.message || 'check your URL and key.');
    btn.textContent = 'Connect'; btn.disabled = false;
  }
}

function resetConfig() {
  if (!confirm('Clear saved Supabase credentials?')) return;
  localStorage.removeItem('nuworkspace_sb_url');
  localStorage.removeItem('nuworkspace_sb_key');
  location.reload();
}



// ===== IMPORT HISTORICAL EXPENSES =====
// ===== IMPORT HISTORICAL EXPENSES =====
function openImportExpensesPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Import Expenses';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-import-expenses').classList.add('active');
  // Reset state
  document.getElementById('importExpensesStatus').style.display = 'none';
  document.getElementById('importExpensesProgress').style.display = 'none';
  document.getElementById('importExpensesLog').style.display = 'none';
  document.getElementById('importExpensesBtn').disabled = false;
}

async function runImportExpenses() {
  if (!sb) { toast('⚠ Not connected to Supabase'); return; }
  const btn = document.getElementById('importExpensesBtn');
  const prog = document.getElementById('importExpensesProgress');
  const logEl = document.getElementById('importExpensesLog');
  const statusEl = document.getElementById('importExpensesStatus');

  btn.disabled = true;
  btn.textContent = '⏳ Importing…';
  prog.style.display = 'block';
  logEl.style.display = 'block';
  logEl.innerHTML = '';
  statusEl.style.display = 'none';

  // Build a lookup: project name → project id
  const projLookup = {};
  projects.forEach(p => { projLookup[p.name.trim()] = p.id; });

  let inserted = 0, skipped = 0, errors = 0;
  const BATCH = 50;
  const rows = HIST_EXP;

  // Build rows to insert, log skipped projects
  const toInsert = [];
  const skippedProjs = new Set();
  rows.forEach(([desc, type, planned, actual, source, projName, date]) => {
    const pid = projLookup[projName.trim()];
    if (!pid) { skipped++; skippedProjs.add(projName); return; }
    // Compose name: include type + source context if available
    let name = desc || '';
    if (source && source !== desc) name = name ? name + (source ? ' — ' + source : '') : source;
    if (!name) name = type || 'Expense';
    toInsert.push({ proj_id: pid, name: name.substring(0,500), planned_amount: planned||null, actual_cost: actual||null });
  });

  logEl.innerHTML += `<div style="color:var(--amber)">▸ ${toInsert.length} rows matched to projects, ${skipped} rows skipped (unmatched project #)</div>`;
  if (skippedProjs.size) {
    logEl.innerHTML += `<div style="color:var(--muted)">  Unmatched projects: ${[...skippedProjs].slice(0,12).join(', ')}${skippedProjs.size > 12 ? '… +' + (skippedProjs.size-12) + ' more' : ''}</div>`;
  }

  // Batch insert
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    prog.textContent = `${Math.min(i + BATCH, toInsert.length)} / ${toInsert.length} rows…`;
    const { data, error } = await sb.from('expenses').insert(batch).select('id,proj_id');
    if (error) {
      errors += batch.length;
      logEl.innerHTML += `<div style="color:var(--red)">✗ Batch ${Math.floor(i/BATCH)+1} error: ${error.message}</div>`;
    } else {
      inserted += data.length;
      // Add to local expenseStore
      data.forEach((r, idx) => {
        const src = batch[idx];
        expenseStore.push({ _id: r.id, projId: r.proj_id, taskId: null, name: src.name, planned: src.planned_amount||0, actual: src.actual_cost||0 });
      });
    }
    logEl.scrollTop = logEl.scrollHeight;
    await new Promise(r => setTimeout(r, 40));
  }

  prog.style.display = 'none';
  const ok = errors === 0;
  statusEl.style.display = 'block';
  statusEl.innerHTML = `<div style="background:${ok?'rgba(46,158,98,0.1)':'rgba(208,64,64,0.1)'};border:1px solid ${ok?'rgba(46,158,98,0.3)':'rgba(208,64,64,0.3)'};border-radius:8px;padding:14px 18px;font-size:13.5px;color:${ok?'var(--green)':'var(--red)'}">
    ${ok?'✅':'⚠'} <strong>${inserted.toLocaleString()} expenses imported</strong>${skipped?' · '+skipped+' skipped (project not found)':''}${errors?' · '+errors+' errors':''}
  </div>`;
  logEl.innerHTML += `<div style="color:var(--green);margin-top:6px">✓ Done — ${inserted} inserted, ${skipped} skipped, ${errors} errors</div>`;
  logEl.scrollTop = logEl.scrollHeight;
  btn.textContent = '✓ Import Complete';
  toast('✅ Imported ' + inserted.toLocaleString() + ' expenses');
}


// ===== SETUP PANEL =====
// ===== SETUP PANEL =====
function openSetupPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Setup';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-setup').classList.add('active');

  // Render tiles based on what this user can access
  const tile = (icon, title, desc, onclick) => `
    <div onclick="${onclick}" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:22px 20px;cursor:pointer;transition:all var(--transition);"
      onmouseover="this.style.borderColor='var(--amber-dim)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:28px;margin-bottom:12px;">${icon}</div>
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">${title}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;">${desc}</div>
    </div>`;

  const tiles = [];
  // Line 1: Employees, Permissions
  if (can('manage_employees')) tiles.push(tile('&#x1F465;','Employees','Manage team members, roles, and access.',"openEmployeesPanel(document.getElementById('navSetup'))"));
  if (can('manage_permissions')) tiles.push(tile('&#x1F510;','Permissions','Configure role-based access and user permissions.',"openPermissionsPanel()"));
  // Line 2: Scheduler Settings, Templates  
  if (can('manage_permissions')) tiles.push(tile('&#x1F4C5;','Scheduler Settings','Configure block colors and employee scheduler access.',"openSchedSettingsPanel()"));
  if (can('manage_templates')) tiles.push(tile('&#x1F4CB;','Templates','Manage onboarding checklists, compliance evidence, and content templates.',"openTemplatesPanel(document.getElementById('navSetup'))"));
  // Line 3: Audit Log, Approvals
  if (can('view_audit_log')) tiles.push(tile('&#x1F4DD;','Audit Log','View recent changes and configure tracked fields.',"openAuditLogPanel(document.getElementById('navSetup'))"));
  if (can('view_setup') || isManager()) tiles.push(tile('&#x2705;','Approvals','Review and approve pending timesheet submissions.',"openApprovalsPanel(document.getElementById('navSetup'))"));
  // Line 4: Merge Duplicate Clients
  if (can('manage_employees') || isManager()) tiles.push(tile('&#x1F9F9;','Merge Duplicate Clients','Find and merge client records with similar names.',"openMergeClientsPanel(document.getElementById('navSetup'))"));

  const grid = document.getElementById('setupTilesGrid');
  if (grid) grid.innerHTML = tiles.join('') || '<div style="color:var(--muted);font-size:13px">No setup options available for your role.</div>';
}


// ===== PERMISSIONS PANEL (placeholder) =====
// ===== PERMISSIONS PANEL (placeholder) =====
function openPermissionsPanel() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navSetup')?.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Permissions';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-permissions').classList.add('active');
}


// ===== TEMPLATES PANEL =====
// ===== TEMPLATES PANEL =====

// Template categories and items (will be moved to DB)
const TEMPLATE_CATEGORIES = [
  { name: 'HR Templates', description: 'Employee onboarding and offboarding checklists', icon: '👥' },
  { name: 'Compliance Templates', description: 'CMMC evidence strings and policy templates', icon: '🛡️' },
  { name: 'Other Templates', description: 'Email templates, forms, and content', icon: '📄' }
];

const TEMPLATE_SEED_DATA = [
  // NU Labs Onboarding - EXACT COPY from original ONBOARDING_NULABS array (12 items)
  { category: 'HR Templates', key: 'credentials', label: 'Initial Credentials Issued', instructions: `Create AD account in Active Directory Users and Computers. Set temporary password and check "User must change password at next logon." Create matching email account in Google Workspace using the work email address. Provide credentials to employee securely on their first day in person — do not send via email or text.`, notes_enabled: true, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'computer', label: 'Computer Assigned & Added to Server', instructions: `Record the computer name and asset tag. On the workstation go to System Properties → Computer Name → Change → select Domain and enter the NU Laboratories domain name. Restart when prompted. Verify the computer appears in Active Directory Users and Computers under the Computers OU.`, notes_enabled: true, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'nuworkspace', label: 'NUWorkspace Account Created & Permissions Set', instructions: `Add the employee record in NUWorkspace Setup → Employees. Set permission level, hire date, and role. Then go to your Supabase project → Authentication → Users → Invite User and enter their work email address. They will receive an invite email to set their password. Once they log in verify their profile loads correctly and permissions are appropriate.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'office', label: 'Office Suite Installed', instructions: `Log into the Microsoft 365 Admin Center (admin.microsoft.com). Assign a Microsoft 365 license to the employee's work email. On the employee's workstation go to portal.office.com, sign in with the work email, and download/install Microsoft 365. Activate with the work account credentials.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'zac', label: 'ZAC Phone Software Installed', instructions: `Download ZAC from https://www.zultys.com/zac/ and install on the employee's workstation. Configure with the employee's extension number and credentials. Log into the Zultys Administration panel and add the employee as a user, assign their extension, and configure voicemail. Test by placing a test call.`, notes_enabled: true, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'alarm', label: 'Added to Alarm System', instructions: `Enter alarm panel admin mode using the master code. Add a new user code for the employee. Assign a unique code that is not shared with any other employee. Test the code to confirm it arms and disarms the system correctly. Provide the code to the employee verbally — do not write it down or send electronically.`, notes_enabled: true, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'duo', label: 'Duo MFA Installed on Computer', instructions: `Log into the Duo Admin Panel (admin.duosecurity.com). Go to Users → Add User. Enter the employee's name and work email. Click Send Enrollment Email. The employee will receive an email to enroll their device. Verify the enrollment is complete and the employee can successfully authenticate before granting CUI system access.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'blumira', label: 'Blumira SIEM Agent Installed', instructions: `Log into the Blumira dashboard. Navigate to Sensors → Deploy Agent. Select Windows as the platform and download the installer. Run the installer on the employee's workstation. Once installed confirm the agent appears as active in the Blumira dashboard under the Sensors or Devices section.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'withsecure', label: 'WithSecure EPP Installed', instructions: `Log into WithSecure Elements Security Center (elements.withsecure.com). Go to Devices → Add Device. Download the Windows endpoint protection installer. Run the installer on the employee's workstation. Confirm the device appears in the Elements Security Center console as protected and showing green status.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'bitlocker', label: 'BitLocker Enabled', instructions: `Open Group Policy Management on the AD server and verify the BitLocker GPO is linked to the OU containing the employee's workstation. On the workstation run gpupdate /force in an elevated command prompt. Then go to Control Panel → BitLocker Drive Encryption and confirm encryption is in progress or active. This may take several hours to complete on first encryption.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'vpn', label: 'Added to VPN', instructions: `Log into the UniFi Network dashboard. Go to Settings → Teleport & VPN → VPN Server. Add a new user with the employee's credentials. Download the OpenVPN client configuration file. Provide the employee with the VPN client config file and instructions for installing the OpenVPN client. Test the connection by having the employee connect remotely.`, notes_enabled: false, track: 'nulabs', type: 'onboarding' },
  { category: 'HR Templates', key: 'handbook', label: 'Employee Handbook Signed', instructions: `Provide the employee with a copy of the current NU Laboratories Employee Handbook. Review key sections together including the disciplinary policy, CUI handling requirements, and acceptable use policy. Have the employee sign the acknowledgment page confirming they received and reviewed the handbook. Retain the signed copy and note the handbook version in the notes field.`, notes_enabled: true, track: 'nulabs', type: 'onboarding' },
  
  // Ballantine Onboarding - EXACT COPY from original ONBOARDING_BALLANTINE array (9 items)
  { category: 'HR Templates', key: 'credentials', label: 'Initial Credentials Issued', instructions: `Create AD account in Active Directory Users and Computers. Set temporary password and check "User must change password at next logon." Create matching email account in Google Workspace. Provide credentials to employee securely on their first day in person.`, notes_enabled: true, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'email', label: 'Email Setup', instructions: `Log into Google Workspace Admin (admin.google.com). Create a new user account with the employee's work email address. Set a temporary password. Confirm the employee can log in and access email. Set up email signature and configure any needed distribution lists.`, notes_enabled: false, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'office', label: 'Office Suite Installed', instructions: `Log into the Microsoft 365 Admin Center (admin.microsoft.com). Assign a Microsoft 365 license to the employee's work email. On the employee's workstation go to portal.office.com, sign in with the work email, and download/install Microsoft 365.`, notes_enabled: false, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'zac', label: 'ZAC Phone Software Installed', instructions: `Download ZAC from https://www.zultys.com/zac/ and install on the employee's workstation. Configure with the employee's extension number and credentials. Add the employee in the Zultys Administration panel and test with a call.`, notes_enabled: true, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'sql', label: 'SQL Server Installed', instructions: `Install SQL Server client tools on the employee's workstation. Configure the connection string to point to the NU Labs SQL Server instance. Verify the employee can connect to the database with appropriate permissions. Test by running a basic query.`, notes_enabled: false, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'dba', label: 'DBA Manufacturing Software Installed', instructions: `Install DBA manufacturing software from the network share or installation media. Configure with the employee's credentials and company database settings. Verify the employee can log in and access their required modules.`, notes_enabled: false, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'alarm', label: 'Added to Alarm System', instructions: `Enter alarm panel admin mode. Add a new user code for the employee. Assign a unique code not shared with others. Test the code and provide it verbally to the employee.`, notes_enabled: true, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'synology', label: 'Synology Private Share Access Granted', instructions: `Log into Synology DSM → Control Panel → Shared Folder. Select the Ballantine private share. Click Edit → Permissions. Add the employee's AD account with the appropriate Read/Write access level. Apply and confirm the employee can access the share from their workstation.`, notes_enabled: false, track: 'ballantine', type: 'onboarding' },
  { category: 'HR Templates', key: 'handbook', label: 'Employee Handbook Signed', instructions: `Provide the employee with a copy of the current NU Laboratories Employee Handbook. Review key sections together. Have the employee sign the acknowledgment page confirming they received and reviewed the handbook. Retain the signed copy and note the handbook version in the notes field.`, notes_enabled: true, track: 'ballantine', type: 'onboarding' }
];

let templateCategories = [];
let templates = [];
let templatesInitialized = false;

async function initializeTemplates() {
  if (!sb || templatesInitialized) return;
  
  try {
    // Load existing data (tables should exist by now)
    await loadTemplateData();
    
    // Seed if categories are empty
    if (templateCategories.length === 0) {
      await seedTemplateData();
      await loadTemplateData();
    }
    
    templatesInitialized = true;
  } catch (e) {
    console.error('Template initialization failed:', e);
    // Show user-friendly message
    const body = document.getElementById('templatesBody');
    if (body) {
      body.innerHTML = `
        <div style="margin-bottom:24px;">
          <div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--text);margin-bottom:6px">📋 Templates</div>
          <div style="font-size:13px;color:var(--muted);">Database tables need to be created.</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;">
          <div style="color:var(--red);margin-bottom:12px;font-weight:600;">⚠ Setup Required</div>
          <div style="font-size:13px;color:var(--text);margin-bottom:12px;">Run these SQL commands in Supabase SQL Editor:</div>
          <pre style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;color:var(--text);overflow-x:auto;white-space:pre-wrap;">-- Template Categories
CREATE TABLE IF NOT EXISTS template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Templates  
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES template_categories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  instructions TEXT,
  notes_enabled BOOLEAN DEFAULT false,
  track TEXT, -- 'nulabs', 'ballantine', or NULL
  type TEXT, -- 'onboarding', 'offboarding', 'evidence'
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies (adjust as needed)
ALTER TABLE template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_categories_select" ON template_categories FOR SELECT USING (true);
CREATE POLICY "template_categories_all" ON template_categories FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "templates_select" ON templates FOR SELECT USING (true);  
CREATE POLICY "templates_all" ON templates FOR ALL USING (auth.uid() IS NOT NULL);</pre>
          <button onclick="location.reload()" style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:8px 16px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:12px;">
            Refresh After Running SQL
          </button>
        </div>
      `;
    }
  }
}

async function loadTemplateData() {
  const [categoriesRes, templatesRes] = await Promise.all([
    sb.from('template_categories').select('*').order('sort_order'),
    sb.from('templates').select('*').order('sort_order')
  ]);
  
  templateCategories = categoriesRes.data || [];
  templates = templatesRes.data || [];
}

async function seedTemplateData() {
  // Insert categories
  const categoryInserts = TEMPLATE_CATEGORIES.map((cat, idx) => ({
    name: cat.name,
    description: cat.description,
    icon: cat.icon,
    sort_order: idx
  }));
  
  const { data: insertedCategories } = await sb.from('template_categories')
    .insert(categoryInserts)
    .select();
    
  // Create category lookup
  const categoryLookup = {};
  insertedCategories.forEach(cat => {
    categoryLookup[cat.name] = cat.id;
  });
  
  // Insert templates
  const templateInserts = TEMPLATE_SEED_DATA.map((tmpl, idx) => ({
    category_id: categoryLookup[tmpl.category],
    key: tmpl.key,
    label: tmpl.label,
    instructions: tmpl.instructions,
    notes_enabled: tmpl.notes_enabled,
    track: tmpl.track,
    type: tmpl.type,
    sort_order: idx,
    is_active: true
  }));
  
  await sb.from('templates').insert(templateInserts);
}

function openTemplatesPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Templates';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-templates').classList.add('active');
  
  // Initialize templates on first load
  if (!templatesInitialized) {
    const body = document.getElementById('templatesBody');
    if (body) body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Loading templates...</div>';
    initializeTemplates().then(() => renderTemplatesPanel());
  } else {
    renderTemplatesPanel();
  }
}

function renderTemplatesPanel() {
  const body = document.getElementById('templatesBody');
  if (!body) return;

  body.innerHTML = `
    <div style="margin-bottom:24px;">
      <div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--text);margin-bottom:6px">📋 Templates</div>
      <div style="font-size:13px;color:var(--muted);">Manage onboarding checklists, compliance evidence strings, and content templates.</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;">
      ${templateCategories.map(category => {
        const categoryTemplates = templates.filter(t => t.category_id === category.id);
        return `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
          <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
            <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">${category.icon} ${category.name}</div>
            <div style="font-size:12px;color:var(--muted);">${category.description}</div>
          </div>
          <div style="padding:16px 20px;">
            ${categoryTemplates.length > 0 
              ? `<div style="font-size:13px;color:var(--text);margin-bottom:8px;">${categoryTemplates.length} template${categoryTemplates.length !== 1 ? 's' : ''}</div>
                 <button onclick="editCategoryTemplates('${category.id}')" 
                   style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                   Edit Templates
                 </button>`
              : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">No templates yet</div>`
            }
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function editCategoryTemplates(categoryId) {
  // TODO: Open template editing modal/panel
  const category = templateCategories.find(c => c.id === categoryId);
  const categoryTemplates = templates.filter(t => t.category_id === categoryId);
  alert(`Edit ${category.name} - ${categoryTemplates.length} templates (TODO: Build editing UI)`);
}


// ===== MY INFO PANEL =====
// ===== MY INFO PANEL =====
function openMyInfoPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'My Info';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-myinfo').classList.add('active');

  if (!currentEmployee) return;

  const body = document.getElementById('myInfoBody');
  if (!body) return;

  // Remove any stray empProfilePane to avoid duplicate-ID conflicts
  document.querySelectorAll('#empProfilePane').forEach(el => el.remove());

  // Build tabbed layout
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%">
      <!-- Tab bar -->
      <div style="display:flex;gap:2px;padding:12px 32px 0;border-bottom:1px solid var(--border);background:var(--bg);flex-shrink:0">
        <button id="myInfoTab-profile"  onclick="switchMyInfoTab('profile')"  class="myinfo-tab active-tab">👤 Profile</button>
        <button id="myInfoTab-vacation" onclick="switchMyInfoTab('vacation')" class="myinfo-tab">✈️ Vacation</button>
        <button id="myInfoTab-chatter"  onclick="switchMyInfoTab('chatter')"  class="myinfo-tab">💬 My Chatter</button>
      </div>
      <!-- Tab content -->
      <div id="myInfoTabContent" style="flex:1;overflow-y:auto;background:var(--bg)">
        <!-- Profile pane — showEmpProfile renders into empProfilePane -->
        <div id="myInfoPane-profile" style="padding:28px 32px">
          <div id="empProfilePane"></div>
        </div>
        <div id="myInfoPane-vacation" style="display:none;padding:28px 32px"></div>
        <div id="myInfoPane-chatter"  style="display:none;padding:28px 32px"></div>
      </div>
    </div>
  `;

  // Inject tab styles if not already present
  if (!document.getElementById('myInfoTabStyles')) {
    const style = document.createElement('style');
    style.id = 'myInfoTabStyles';
    style.textContent = `
      .myinfo-tab {
        background: none; border: none; border-bottom: 2px solid transparent;
        padding: 8px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
        color: var(--muted); font-family: 'DM Sans', sans-serif;
        margin-bottom: -1px; border-radius: 6px 6px 0 0; transition: all .15s;
      }
      .myinfo-tab:hover { color: var(--text); background: var(--surface2); }
      .myinfo-tab.active-tab { color: var(--amber); border-bottom-color: var(--amber); background: var(--bg); }
    `;
    document.head.appendChild(style);
  }

  // Render profile tab
  showEmpProfile(currentEmployee.id);
  window._myInfoActiveTab = 'profile';
}

function switchMyInfoTab(tab) {
  window._myInfoActiveTab = tab;
  ['profile','vacation','chatter'].forEach(t => {
    const pane = document.getElementById('myInfoPane-' + t);
    const btn  = document.getElementById('myInfoTab-' + t);
    if (pane) pane.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active-tab', t === tab);
  });

  const empId = currentEmployee?.id;
  if (!empId) return;

  if (tab === 'vacation' && typeof renderMyInfoVacationTab === 'function') {
    renderMyInfoVacationTab(empId);
  }
  if (tab === 'chatter' && typeof renderMyInfoChatterTab === 'function') {
    renderMyInfoChatterTab(empId);
  }
}

function renderMyInfoPanel() { openMyInfoPanel(document.getElementById('navMyInfo')); }


// ===== AUDIT LOG =====
// ===== AUDIT LOG =====

// Fields available to track, with display labels
const AUDIT_FIELD_DEFS = {
  tasks: [
    { key: 'status',        label: 'Status' },
    { key: 'assignee',      label: 'Assignee' },
    { key: 'fixed_price',   label: 'Fixed Price' },
    { key: 'revenue_type',  label: 'Revenue Type (No Charge)' },
    { key: 'name',          label: 'Task Name' },
    { key: 'sales_category',label: 'Sales Category' },
    { key: 'quote_number',  label: 'Quote Number' },
    { key: 'po_number',     label: 'PO Number' },
    { key: 'budget_hours',  label: 'Budget Hours' },
    { key: 'task_start_date',label: 'Start Date' },
    { key: 'completed_date',label: 'Completed Date' },
    { key: 'billed_date',   label: 'Billed Date' },
    { key: 'priority',      label: 'Priority' },
    { key: 'description',   label: 'Description' },
  ],
  projects: [
    { key: 'status',        label: 'Project Status' },
    { key: 'phase',         label: 'Condition/Phase' },
    { key: 'credit_hold',   label: 'Credit Hold' },
    { key: 'need_updated_po',label: 'Need Updated PO' },
    { key: 'pm',            label: 'PM Assignment' },
    { key: 'contract_amount',label: 'Contract Amount' },
  ],
  employees: [
    { key: 'permission_level', label: 'Permission Level' },
    { key: 'is_approver',      label: 'Is Approver' },
    { key: 'is_paper_ts',      label: 'Paper Timesheet' },
    { key: 'termination_date', label: 'Termination Date' },
  ],
  shipping: [
    { key: 'received', label: 'Article Received' },
    { key: 'shipped',  label: 'Article Shipped' },
  ],
};

// Load tracked fields from localStorage (default: status, assignee, revenue_type for tasks)
function getAuditSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('auditSettings') || '{}');
    if (!saved.tasks)     saved.tasks     = ['status','assignee','revenue_type','fixed_price'];
    if (!saved.projects)  saved.projects  = ['status','credit_hold','need_updated_po'];
    if (!saved.employees) saved.employees = ['permission_level','termination_date'];
    if (!saved.shipping)  saved.shipping  = ['received','shipped'];
    return saved;
  } catch(e) { return {tasks:['status','assignee','revenue_type','fixed_price'],projects:['status','credit_hold','need_updated_po'],employees:['permission_level','termination_date'],shipping:['received','shipped']}; }
}

function saveAuditSettings(settings) {
  localStorage.setItem('auditSettings', JSON.stringify(settings));
}

function isFieldTracked(recordType, field) {
  const settings = getAuditSettings();
  return (settings[recordType] || []).includes(field);
}

async function logActivity(recordType, recordId, recordLabel, action) {
  if (!sb || !currentEmployee) return;
  try {
    await sb.from('activity_log').insert({
      employee_id:   currentEmployee.id,
      employee_name: currentEmployee.name,
      record_type:   recordType,
      record_id:     recordId,
      record_label:  recordLabel,
      field_changed: action,
      old_value:     null,
      new_value:     null,
    });
  } catch(e) { console.warn('Activity log error:', e); }
}

async function logAuditChange(recordType, recordId, recordLabel, field, oldValue, newValue) {
  if (!isFieldTracked(recordType, field)) return;
  if (oldValue === newValue) return;
  if (!sb || !currentEmployee) return;
  try {
    await sb.from('activity_log').insert({
      employee_id: currentEmployee.id,
      employee_name: currentEmployee.name,
      record_type: recordType,
      record_id: recordId,
      record_label: recordLabel,
      field_changed: field,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: newValue != null ? String(newValue) : null,
    });
  } catch(e) { console.warn('Audit log error:', e); }
}

function openAuditLogPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // Keep Setup highlighted since Audit Log is a sub-page of Setup
  (el || document.getElementById('navSetup'))?.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-auditlog').classList.add('active');
  document.getElementById('topbarName').textContent = 'Audit Log';
  renderAuditLogPanel();
}

async function renderAuditLogPanel() {
  const el = document.getElementById('auditLogContent');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:13px">Loading...</div>';

  // Fetch recent activity
  let logs = [];
  if (sb) {
    const { data } = await sb.from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    logs = data || [];
  }

  const settings = getAuditSettings();
  const fmtDate = d => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

  // Field label lookup
  const fieldLabel = (type, key) => {
    const def = (AUDIT_FIELD_DEFS[type]||[]).find(f => f.key === key);
    return def ? def.label : key;
  };

  const settingsHtml = () => {
    let html = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px">⚙ Tracked Fields</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px">';
    Object.entries(AUDIT_FIELD_DEFS).forEach(([type, fields]) => {
      const typeLabel = {tasks:'Tasks',projects:'Projects',employees:'Employees',shipping:'Shipping & Receiving'}[type];
      html += '<div><div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:10px">'+typeLabel+'</div>';
      fields.forEach(f => {
        const checked = (settings[type]||[]).includes(f.key);
        html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text);margin-bottom:7px">'+
          '<input type="checkbox" '+(checked?'checked':'')+' style="accent-color:var(--amber);width:14px;height:14px;cursor:pointer"'+
          ' onchange="toggleAuditField(\x27'+type+'\x27,\x27'+f.key+'\x27,this.checked)"> '+f.label+'</label>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  };

  const logsHtml = logs.length === 0
    ? '<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">📋</div><div>No activity logged yet.</div></div>'
    : '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">'+
      '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr style="border-bottom:2px solid var(--border)">'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">When</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Who</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Project</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Record</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">Field</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">From</th>'+
      '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">To</th>'+
      '</tr></thead><tbody>'+
      logs.map(l => '<tr style="border-bottom:1px solid var(--border);transition:background .12s" onmouseover="this.style.background=\x27var(--surface2)\x27" onmouseout="this.style.background=\x27\x27">'+
        '<td style="padding:9px 14px;font-size:11px;color:var(--muted);white-space:nowrap">'+fmtDate(l.created_at)+'</td>'+
        '<td style="padding:9px 14px;font-size:13px;font-weight:500;color:var(--text)">'+( l.employee_name||'—')+'</td>'+
        (()=>{ let proj = null; if(l.record_type==='projects') { proj=projects.find(p=>p.id===l.record_id); } else if(l.record_type==='tasks') { const t=taskStore.find(t=>t._id===l.record_id); if(t) proj=projects.find(p=>p.id===t.proj); } return '<td style="padding:9px 14px;font-size:12px;color:var(--muted);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis">'+(proj ? proj.emoji+' '+proj.name : '—')+'</td>'; })()+
        '<td style="padding:9px 14px;font-size:12px;color:var(--text)">'+
          '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface2);color:var(--muted);margin-right:6px">'+l.record_type+'</span>'+
          (l.record_label||l.record_id||'—')+'</td>'+
        '<td style="padding:9px 14px;font-size:12px;color:var(--text)">'+fieldLabel(l.record_type, l.field_changed)+'</td>'+
        '<td style="padding:9px 14px;font-size:12px;color:var(--red);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(l.old_value||'—')+'</td>'+
        '<td style="padding:9px 14px;font-size:12px;color:var(--green);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(l.new_value||'—')+'</td>'+
        '</tr>'
      ).join('')+
      '</tbody></table></div>';

  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:10px">'+
    '<div><div style="font-family:DM Serif Display,serif;font-size:24px;color:var(--text)">📋 Audit Log</div>'+
    '<div style="font-size:12px;color:var(--muted);margin-top:2px">'+logs.length+' recent changes</div></div></div>'+
    settingsHtml() + logsHtml;
}

function toggleAuditField(type, key, checked) {
  const settings = getAuditSettings();
  if (!settings[type]) settings[type] = [];
  if (checked) { if (!settings[type].includes(key)) settings[type].push(key); }
  else { settings[type] = settings[type].filter(k => k !== key); }
  saveAuditSettings(settings);
}




// ===== PERMISSIONS PANEL =====
// ===== PERMISSIONS PANEL =====
const CAPABILITY_DEFS = [
  { key: 'add_projects',       label: 'Add Projects',          group: 'Projects' },
  { key: 'delete_projects',    label: 'Delete Projects',       group: 'Projects' },
  { key: 'edit_project_info',  label: 'Edit Project Info',     group: 'Projects' },
  { key: 'mark_complete',      label: 'Mark Complete',         group: 'Projects' },
  { key: 'mark_closing',       label: 'Mark Closing',          group: 'Projects' },
  { key: 'mark_closed',        label: 'Mark Closed',           group: 'Projects' },
  { key: 'add_tasks',          label: 'Add Tasks',             group: 'Tasks' },
  { key: 'edit_tasks',         label: 'Edit Tasks',            group: 'Tasks' },
  { key: 'delete_tasks',       label: 'Delete Tasks',          group: 'Tasks' },
  { key: 'view_hours',         label: 'View Hours Tab',        group: 'Projects' },
  { key: 'view_expenses',      label: 'View Expenses Tab',     group: 'Projects' },
  { key: 'view_invoicing',     label: 'View Invoicing Tab',    group: 'Projects' },
  { key: 'view_proj_shipping', label: 'View Shipping Tab',     group: 'Projects' },
  { key: 'add_clients',        label: 'Add Clients',           group: 'Clients' },
  { key: 'delete_clients',     label: 'Delete Clients',        group: 'Clients' },
  { key: 'add_contacts',       label: 'Add Contacts',          group: 'Clients' },
  { key: 'delete_contacts',    label: 'Delete Contacts',       group: 'Clients' },
  { key: 'view_clients',       label: 'View Clients',          group: 'Clients' },
  { key: 'view_dashboard',     label: 'View Dashboard',        group: 'Reports' },
  { key: 'view_reports',       label: 'View Reports',          group: 'Reports' },
  { key: 'view_billing',       label: 'View Billing Queue',    group: 'Reports' },
  { key: 'view_quotes',        label: 'View Quotes (Vibrato)', group: 'Reports' },
  { key: 'view_audit_log',     label: 'View Audit Log',        group: 'Admin' },
  { key: 'view_setup',         label: 'View Setup',            group: 'Admin' },
  { key: 'manage_employees',   label: 'Manage Employees',      group: 'Admin' },
  { key: 'manage_permissions', label: 'Manage Permissions',    group: 'Admin' },
  { key: 'manage_templates',   label: 'Manage Templates',      group: 'Admin' },
  { key: 'view_chatter',       label: 'View Chatter',          group: 'Communication' },
  { key: 'post_chatter',       label: 'Post in Chatter',       group: 'Communication' },
  { key: 'view_schedule',      label: 'View Scheduler',        group: 'Scheduler' },
  { key: 'edit_schedule',      label: 'Edit Scheduler',        group: 'Scheduler' },
  { key: 'view_cmmc',          label: 'View CMMC Compliance',  group: 'Compliance' },
];

function openPermissionsPanel() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navSetup')?.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Permissions';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-permissions').classList.add('active');
  renderPermissionsPanel();
}

function renderPermissionsPanel() {
  const body = document.getElementById('permissionsBody');
  if (!body) return;

  if (!permissionRoles.length) {
    body.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">No roles defined yet. Click + New Role to create one.</div>';
    return;
  }

  // Group capabilities
  const groups = [...new Set(CAPABILITY_DEFS.map(c => c.group))];

  body.innerHTML = permissionRoles.map(role => {
    const assignedEmps = employees.filter(e => e.roleId === role.id);
    const caps = role.capabilities || {};

    const capRows = groups.map(group => {
      const defs = CAPABILITY_DEFS.filter(c => c.group === group);
      return `<div style="margin-bottom:16px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">${group}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          ${defs.map(c => `
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer;padding:5px 8px;border-radius:6px;transition:background .12s;" onmouseover="this.style.background='var(--surface3)'" onmouseout="this.style.background=''">
              <input type="checkbox" ${caps[c.key] ? 'checked' : ''}
                style="width:14px;height:14px;accent-color:var(--amber);cursor:pointer;"
                onchange="toggleRoleCapability('${role.id}','${c.key}',this.checked)" />
              ${c.label}
            </label>`).join('')}
        </div>
      </div>`;
    }).join('');

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden;">
      <!-- Role header -->
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;background:var(--surface2);">
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;color:var(--text);">${role.name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${role.description}</div>
        </div>
        <button onclick="openEditRoleModal('${role.id}')" style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:12px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">✎ Edit</button>
        <button onclick="deleteRole('${role.id}')" style="background:transparent;border:1px solid rgba(208,64,64,.3);border-radius:6px;color:var(--red);font-size:12px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">✕</button>
      </div>
      <!-- Capabilities -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;padding:20px 20px 8px;">
        <div>${capRows}</div>
        <!-- Assigned employees -->
        <div style="padding-left:20px;border-left:1px solid var(--border);">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;">Assigned Employees</div>
          ${assignedEmps.length === 0
            ? '<div style="font-size:12px;color:var(--muted);font-style:italic">No employees assigned</div>'
            : assignedEmps.map(e => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
                <div style="width:28px;height:28px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;">${e.initials}</div>
                <div style="flex:1;font-size:13px;color:var(--text);">${e.name}</div>
                <button onclick="unassignRole('${e.id}')" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 4px;" title="Remove from role">✕</button>
              </div>`).join('')}
          <div style="margin-top:12px;">
            <select onchange="assignRole(this.value,'${role.id}');this.value=''"
              style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 10px;outline:none;width:100%;cursor:pointer;">
              <option value="">+ Assign employee…</option>
              ${employees.filter(e => !e.roleId && e.isActive !== false).map(e =>
                `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openSchedSettingsPanel() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('navSetup')?.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Scheduler Settings';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-sched-settings').classList.add('active');
  await window.loadSchedSettings();
  renderSchedSettingsPanel();
}

const SCHED_COLOR_DEFS = [
  { key: 'reschedule',       label: 'Reschedule',             hint: 'Status override — Yellow' },
  { key: 'tentative',        label: 'Tentative',              hint: 'Status override — Gray' },
  { key: 'setup',            label: 'Setup task',             hint: 'Task name contains "setup"' },
  { key: 'teardown',         label: 'Teardown task',          hint: 'Task name contains "teardown"' },
  { key: 'dcas_no_wit_no',  label: 'DCAS No / Witness No',   hint: 'DCAS=No, Witness=No' },
  { key: 'dcas_no_wit_yes',  label: 'DCAS No / Witness Yes',  hint: 'DCAS=No, Witness=Yes' },
  { key: 'dcas_yes_wit_no',  label: 'DCAS Yes / Witness No',  hint: 'DCAS=Yes/CNF, Witness=No' },
  { key: 'dcas_yes_wit_yes', label: 'DCAS Yes / Witness Yes', hint: 'DCAS=Yes/CNF, Witness=Yes/CNF' },
];

window.saveSchedColors = async function() {
  const ss = window.getSchedSettings();
  SCHED_COLOR_DEFS.forEach(def => {
    const inp = document.getElementById('sched-input-' + def.key);
    if (inp) ss.colors[def.key] = inp.value;
  });
  await window.saveSchedSettings();
  const btn = document.getElementById('schedColorSaveBtn');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Save Colors'; btn.style.background = 'var(--amber)'; }, 1800);
  }
};

window.resetSchedColorAndSave = async function(key) {
  delete window.getSchedSettings().colors[key];
  await window.saveSchedSettings();
  renderSchedSettingsPanel();
};

window.saveSchedAccess = async function() {
  const ss = window.getSchedSettings();
  document.querySelectorAll('.sched-access-chk').forEach(chk => {
    ss.access[chk.dataset.empId] = chk.checked;
  });
  await window.saveSchedSettings();
  applySchedAccessToNav();
  const btn = document.getElementById('schedAccessSaveBtn');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.style.background = 'var(--green)';
    setTimeout(() => { btn.textContent = 'Save Access'; btn.style.background = 'var(--amber)'; }, 1800);
  }
};

function renderSchedSettingsPanel() {
  const body = document.getElementById('schedSettingsPanelBody');
  if (!body) return;
  const ss = window.getSchedSettings();

  const colorRows = SCHED_COLOR_DEFS.map(def => {
    const cur = window.sc(def.key);
    const isDefault = !ss.colors?.[def.key];
    const resetBtn = `<button onclick="${isDefault ? '' : `resetSchedColorAndSave(${JSON.stringify(def.key)})`}"
      style="background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--muted);font-size:10px;padding:3px 7px;cursor:${isDefault ? 'default' : 'pointer'};font-family:'DM Sans',sans-serif;opacity:${isDefault ? '0.35' : '1'};" ${isDefault ? 'disabled' : ''}>&#x21BA; Reset</button>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);">
      <div id="sched-swatch-${def.key}" style="width:26px;height:26px;border-radius:6px;border:1.5px solid rgba(0,0,0,.15);flex-shrink:0;background:${cur}"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:600;">${def.label}</div>
        <div style="font-size:11px;color:var(--muted);">${def.hint}</div>
      </div>
      <input type="color" id="sched-input-${def.key}" value="${cur}"
        style="width:34px;height:26px;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;padding:1px;flex-shrink:0;"
        oninput="document.getElementById('sched-swatch-${def.key}').style.background=this.value" />
      ${resetBtn}
    </div>`;
  }).join('');

  const accessRows = (typeof employees !== 'undefined' ? employees : []).filter(e => e.isActive !== false && e.name).map(emp => {
    const hasAccess = window.empHasSchedAccess(emp.id);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="width:30px;height:30px;border-radius:50%;background:${emp.color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;">${emp.initials}</div>
      <div style="flex:1;font-size:13px;">${emp.name}</div>
      <input type="checkbox" class="sched-access-chk" data-emp-id="${emp.id}" ${hasAccess ? 'checked' : ''}
        style="width:15px;height:15px;accent-color:var(--green);cursor:pointer;" />
    </div>`;
  }).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:700;font-size:13px;">&#x1F3A8; Block Colors</span>
          <button id="schedColorSaveBtn" onclick="saveSchedColors()"
            style="padding:5px 14px;border-radius:6px;background:var(--amber);color:#0e0e0f;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Save Colors</button>
        </div>
        <div style="padding:10px 18px;">${colorRows}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:700;font-size:13px;">&#x1F465; Employee Access</span>
          <button id="schedAccessSaveBtn" onclick="saveSchedAccess()"
            style="padding:5px 14px;border-radius:6px;background:var(--amber);color:#0e0e0f;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Save Access</button>
        </div>
        <div style="padding:10px 18px;">${accessRows}</div>
      </div>
    </div>`;
}

function renderSchedSettingsSection() {
  // Append to setup panel's scroll container
  const body = document.querySelector('#panel-setup > div') || document.getElementById('permissionsBody');
  if (!body) return;
  const prev = document.getElementById('schedSettingsSection');
  if (prev) prev.remove();

  const ss = window.getSchedSettings();

  const COLOR_DEFS = [
    { key: 'reschedule',       label: 'Reschedule',             hint: 'Status override — Yellow' },
    { key: 'tentative',        label: 'Tentative',              hint: 'Status override — Gray' },
    { key: 'setup',            label: 'Setup task',             hint: 'Task name contains "setup"' },
    { key: 'teardown',         label: 'Teardown task',          hint: 'Task name contains "teardown"' },
    { key: 'dcas_no_wit_no',  label: 'DCAS No / Witness No',   hint: 'DCAS=No, Witness=No' },
    { key: 'dcas_no_wit_yes',  label: 'DCAS No / Witness Yes',  hint: 'DCAS=No, Witness=Yes' },
    { key: 'dcas_yes_wit_no',  label: 'DCAS Yes / Witness No',  hint: 'DCAS=Yes/CNF, Witness=No' },
    { key: 'dcas_yes_wit_yes', label: 'DCAS Yes / Witness Yes', hint: 'DCAS=Yes/CNF, Witness=Yes/CNF' },
  ];

  const colorRows = COLOR_DEFS.map(def => {
    const cur = window.sc(def.key);
    const isDefault = !ss.colors[def.key];
    const resetBtn = `<button onclick="${isDefault ? '' : `resetSchedColor(${JSON.stringify(def.key)})`}"
      style="background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--muted);font-size:10px;padding:3px 7px;cursor:${isDefault ? 'default' : 'pointer'};font-family:'DM Sans',sans-serif;opacity:${isDefault ? '0.35' : '1'};" ${isDefault ? 'disabled' : ''}>&#x21BA; Reset</button>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);">
      <div style="width:26px;height:26px;border-radius:6px;border:1.5px solid rgba(0,0,0,.15);flex-shrink:0;background:${cur}"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:600;">${def.label}</div>
        <div style="font-size:11px;color:var(--muted);">${def.hint}</div>
      </div>
      <input type="color" value="${cur}"
        style="width:34px;height:26px;border:1.5px solid var(--border);border-radius:6px;cursor:pointer;padding:1px;flex-shrink:0;"
        oninput="updateSchedColor(${JSON.stringify(def.key)},this.value)"
        onchange="updateSchedColor(${JSON.stringify(def.key)},this.value)" />
      ${resetBtn}
    </div>`;
  }).join('');

  const accessRows = employees.filter(e => e.isActive !== false).map(emp => {
    const hasAccess = window.empHasSchedAccess(emp.id);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="width:30px;height:30px;border-radius:50%;background:${emp.color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;">${emp.initials}</div>
      <div style="flex:1;font-size:13px;">${emp.name}</div>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:${hasAccess ? 'var(--green)' : 'var(--muted)'};user-select:none;">
        <input type="checkbox" ${hasAccess ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--green);cursor:pointer;"
          onchange="toggleSchedAccess(${JSON.stringify(emp.id)},this.checked)" />
        ${hasAccess ? 'Has access' : 'No access'}
      </label>
    </div>`;
  }).join('');

  const section = document.createElement('div');
  section.id = 'schedSettingsSection';
  section.style.cssText = 'margin-top:32px;padding-top:24px;border-top:2px solid var(--border);';
  section.innerHTML = `
    <div style="font-family:'DM Serif Display',serif;font-size:20px;margin-bottom:4px;">&#x1F4C5; Scheduler Settings</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:20px;">Configure default block colors and which employees can access the Scheduler.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-weight:700;font-size:13px;">&#x1F3A8; Block Colors</div>
        <div style="padding:4px 18px 12px;">${colorRows}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-weight:700;font-size:13px;">&#x1F510; Employee Access</div>
        <div style="padding:4px 18px 12px;">${accessRows}</div>
        <div style="padding:0 18px 14px;font-size:11px;color:var(--muted);">Unchecked employees will not see the Scheduler in the sidebar.</div>
      </div>
    </div>`;
  body.appendChild(section);
}

async function toggleRoleCapability(roleId, key, checked) {
  const role = permissionRoles.find(r => r.id === roleId);
  if (!role) return;
  role.capabilities[key] = checked;
  if (sb) await sb.from('permission_roles').update({ capabilities: role.capabilities }).eq('id', roleId);
  // Re-apply permissions if this affects current user's role
  if (currentEmployee?.roleId === roleId) applyPermissions();
}

async function assignRole(empId, roleId) {
  if (!empId || !roleId) return;
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  emp.roleId = roleId;
  if (sb) await sb.from('employees').update({ role_id: roleId }).eq('id', empId);
  if (currentEmployee?.id === empId) applyPermissions();
  renderPermissionsPanel();
  toast('✓ Role assigned');
}

async function unassignRole(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  emp.roleId = null;
  if (sb) await sb.from('employees').update({ role_id: null }).eq('id', empId);
  renderPermissionsPanel();
  toast('Role removed');
}

async function deleteRole(roleId) {
  const role = permissionRoles.find(r => r.id === roleId);
  if (!role) return;
  if (!confirm(`Delete role "${role.name}"? Employees assigned to it will lose their role.`)) return;
  // Unassign all employees
  employees.forEach(e => { if (e.roleId === roleId) e.roleId = null; });
  if (sb) {
    await sb.from('employees').update({ role_id: null }).eq('role_id', roleId);
    await sb.from('permission_roles').delete().eq('id', roleId);
  }
  permissionRoles = permissionRoles.filter(r => r.id !== roleId);
  renderPermissionsPanel();
  toast('Role deleted');
}

// Role modal
let _editingRoleId = null;
function openNewRoleModal() {
  _editingRoleId = null;
  document.getElementById('roleModalTitle').textContent = 'New Role';
  document.getElementById('roleModalName').value = '';
  document.getElementById('roleModalDesc').value = '';
  document.getElementById('roleModal').classList.add('open');
  setTimeout(() => document.getElementById('roleModalName').focus(), 80);
}
function openEditRoleModal(roleId) {
  const role = permissionRoles.find(r => r.id === roleId);
  if (!role) return;
  _editingRoleId = roleId;
  document.getElementById('roleModalTitle').textContent = 'Edit Role';
  document.getElementById('roleModalName').value = role.name;
  document.getElementById('roleModalDesc').value = role.description;
  document.getElementById('roleModal').classList.add('open');
  setTimeout(() => document.getElementById('roleModalName').focus(), 80);
}
function closeRoleModal() { document.getElementById('roleModal').classList.remove('open'); }
async function saveRoleModal() {
  const name = document.getElementById('roleModalName').value.trim();
  if (!name) { toast('Name required'); return; }
  const description = document.getElementById('roleModalDesc').value.trim();
  if (_editingRoleId) {
    const role = permissionRoles.find(r => r.id === _editingRoleId);
    if (role) { role.name = name; role.description = description; }
    if (sb) await sb.from('permission_roles').update({ name, description }).eq('id', _editingRoleId);
    toast('✓ Role updated');
  } else {
    const caps = {};
    CAPABILITY_DEFS.forEach(c => caps[c.key] = false);
    const maxOrder = Math.max(0, ...permissionRoles.map(r => r.sortOrder||0)) + 1;
    let newId = 'local-' + Date.now();
    if (sb) {
      const { data } = await sb.from('permission_roles').insert({ name, description, capabilities: caps, sort_order: maxOrder }).select().single();
      if (data) newId = data.id;
    }
    permissionRoles.push({ id: newId, name, description, capabilities: caps, sortOrder: maxOrder });
    toast('✓ Role created');
  }
  closeRoleModal();
  renderPermissionsPanel();
}

