
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
    const testSb = window.supabase.createClient(url, key, {
      auth: {
        storage: window.nulabsSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
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
  if (can('view_setup') || isManager()) tiles.push(tile('&#x2705;','Approvals','Review and approve pending timesheets and vacation requests.',"openApprovalsPanel(document.getElementById('navSetup'))"));
  // Line 4: Merge Duplicate Clients
  // (Customer Surveys moved to its own sidebar nav item under Closing Report)
  if (can('manage_employees') || isManager()) tiles.push(tile('&#x1F9F9;','Merge Duplicate Clients','Find and merge client records with similar names.',"openMergeClientsPanel(document.getElementById('navSetup'))"));
  // Line 5: Company Documents (managers/owners only — uploads the Employee Handbook for all staff to view)
  if (isManager()) tiles.push(tile('&#x1F4D6;','Company Documents','Upload and manage the Employee Handbook and other company-wide documents.',"openCompanyDocsPanel(document.getElementById('navSetup'))"));

  const grid = document.getElementById('setupTilesGrid');
  if (grid) grid.innerHTML = tiles.join('') || '<div style="color:var(--muted);font-size:13px">No setup options available for your role.</div>';
}


// ===== COMPANY DOCUMENTS PANEL =====
// Manager-only panel under Setup. Currently manages the Employee Handbook.
// Storage: hr-documents bucket. Tracking row: public.hr_documents WHERE doc_key='handbook'.

function openCompanyDocsPanel(el) {
  if (!isManager()) {
    alert('You do not have permission to manage company documents.');
    return;
  }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Company Documents';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-company-docs').classList.add('active');
  renderCompanyDocsPanel();
}

async function renderCompanyDocsPanel() {
  const body = document.getElementById('companyDocsPanelBody');
  if (!body) return;

  body.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:14px">Loading…</div>`;

  let handbook = null;
  try {
    const { data, error } = await sb
      .from('hr_documents')
      .select('id, doc_key, doc_name, storage_path, filename, file_size_bytes, uploaded_at, uploaded_by')
      .eq('doc_key', 'handbook')
      .maybeSingle();
    if (error) throw error;
    handbook = data;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--red);font-size:13px;padding:14px">Could not load: ${_cdocsEsc(err.message || err)}</div>`;
    return;
  }

  const handbookCard = handbook
    ? `<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--surface);border:1.5px solid var(--border);border-radius:12px">
        <div style="font-size:26px;flex-shrink:0">📕</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14.5px;font-weight:600;color:var(--text)">${_cdocsEsc(handbook.doc_name)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">
            ${_cdocsEsc(handbook.filename)}
            ${handbook.file_size_bytes ? ' · ' + _cdocsFmtSize(handbook.file_size_bytes) : ''}
            · Uploaded ${new Date(handbook.uploaded_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            ${handbook.uploaded_by ? ' by ' + _cdocsEsc(handbook.uploaded_by) : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
          <button onclick="openPdfViewer({bucket:'hr-documents',path:'${_cdocsEsc(handbook.storage_path)}',filename:'${_cdocsEsc(handbook.filename)}',title:'${_cdocsEsc(handbook.doc_name)}'})"
            style="padding:6px 14px;border:1px solid var(--amber-dim);border-radius:7px;background:transparent;font-size:12px;color:var(--amber);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">👁 View</button>
          <button onclick="openHandbookUploadModal(true)"
            style="padding:6px 14px;border:1px solid var(--border);border-radius:7px;background:transparent;font-size:12px;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600"
            onmouseover="this.style.borderColor='var(--green)';this.style.color='var(--green)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">↑ Replace</button>
          <button onclick="deleteHandbook('${handbook.id}','${_cdocsEsc(handbook.storage_path)}')"
            style="padding:6px 12px;border:1px solid var(--border);border-radius:7px;background:transparent;font-size:12px;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600"
            onmouseover="this.style.borderColor='var(--red)';this.style.color='var(--red)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">🗑</button>
        </div>
      </div>`
    : `<div style="padding:24px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:12px">
        <div style="font-size:32px;margin-bottom:8px">📕</div>
        <div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:4px">No handbook uploaded yet</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Upload a PDF to make the Employee Handbook visible to all staff under My Info → HR Records.</div>
        <button onclick="openHandbookUploadModal(false)"
          style="background:var(--amber);color:#0e0e0f;border:none;border-radius:7px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer">↑ Upload Handbook</button>
      </div>`;

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;font-weight:600">Employee Handbook</div>
      ${handbookCard}
    </div>`;
}

function _cdocsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _cdocsFmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

function openHandbookUploadModal(isReplace) {
  const existing = document.getElementById('handbookUploadBackdrop');
  if (existing) existing.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'handbookUploadBackdrop';
  backdrop.onclick = e => { if (e.target === backdrop) closeHandbookUploadModal(); };
  backdrop.innerHTML = `
    <div class="modal" style="width:520px">
      <div class="modal-header">
        <div class="modal-title">${isReplace ? '↑ Replace Employee Handbook' : '↑ Upload Employee Handbook'}</div>
        <button class="modal-close" type="button" onclick="closeHandbookUploadModal()">&#x2715;</button>
      </div>
      <div class="modal-body">
        ${isReplace ? `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--muted);line-height:1.55">
          Replacing the handbook will overwrite the previous file. All employees will see the new version immediately.
        </div>` : ''}
        <div class="field">
          <div class="field-label">Document Name</div>
          <input type="text" id="handbookDocName" class="f-input" value="Employee Handbook" placeholder="Employee Handbook" />
        </div>
        <div class="field">
          <div class="field-label">PDF File</div>
          <input type="file" id="handbookFileInput" accept="application/pdf,.pdf" class="f-input" style="padding:7px 10px" />
          <div style="font-size:11px;color:var(--muted);margin-top:4px">PDF only. Max 50&nbsp;MB.</div>
        </div>
        <div id="handbookUploadStatus" style="font-size:12.5px;color:var(--muted);min-height:18px"></div>
      </div>
      <div class="modal-footer" style="justify-content:flex-end">
        <button type="button" onclick="closeHandbookUploadModal()" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:8px 16px;border-radius:7px;font-size:13px;cursor:pointer;font-family:'DM Sans',sans-serif">Cancel</button>
        <button type="button" id="handbookUploadSubmit" onclick="submitHandbookUpload()" style="background:var(--amber);color:#0e0e0f;border:none;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Upload</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
}

function closeHandbookUploadModal() {
  const el = document.getElementById('handbookUploadBackdrop');
  if (el) el.remove();
}

async function submitHandbookUpload() {
  const fileInput = document.getElementById('handbookFileInput');
  const nameInput = document.getElementById('handbookDocName');
  const status    = document.getElementById('handbookUploadStatus');
  const submitBtn = document.getElementById('handbookUploadSubmit');

  const file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    status.style.color = 'var(--red)';
    status.textContent = 'Please choose a PDF file.';
    return;
  }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    status.style.color = 'var(--red)';
    status.textContent = 'Only PDF files are allowed.';
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    status.style.color = 'var(--red)';
    status.textContent = 'File exceeds 50 MB limit.';
    return;
  }

  const docName = (nameInput.value || 'Employee Handbook').trim();
  // Use a stable storage path so a replace overwrites cleanly; preserve original extension.
  const storagePath = `handbook/handbook.pdf`;
  const uploaderEmail = (window.currentEmployee && currentEmployee.email) || 'unknown';

  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.6';
  status.style.color = 'var(--muted)';
  status.textContent = 'Uploading…';

  try {
    // Upload (upsert true so replace works)
    const { error: upErr } = await sb.storage
      .from('hr-documents')
      .upload(storagePath, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) throw upErr;

    // Upsert tracking row (one per doc_key)
    const { error: rowErr } = await sb
      .from('hr_documents')
      .upsert({
        doc_key: 'handbook',
        doc_name: docName,
        storage_path: storagePath,
        filename: file.name,
        file_size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
        uploaded_by: uploaderEmail
      }, { onConflict: 'doc_key' });
    if (rowErr) throw rowErr;

    status.style.color = 'var(--green)';
    status.textContent = 'Uploaded.';
    setTimeout(() => {
      closeHandbookUploadModal();
      renderCompanyDocsPanel();
    }, 600);
  } catch (err) {
    status.style.color = 'var(--red)';
    status.textContent = 'Upload failed: ' + (err.message || err);
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
  }
}

async function deleteHandbook(rowId, storagePath) {
  if (!isManager()) return;
  if (!confirm('Delete the Employee Handbook? This removes it for all employees. You can re-upload at any time.')) return;
  try {
    // Storage first (best effort — if it 404s, the row delete still proceeds)
    if (storagePath) {
      const { error: stErr } = await sb.storage.from('hr-documents').remove([storagePath]);
      if (stErr) console.warn('Storage delete warning:', stErr);
    }
    const { error } = await sb.from('hr_documents').delete().eq('id', rowId);
    if (error) throw error;
    renderCompanyDocsPanel();
  } catch (err) {
    alert('Delete failed: ' + (err.message || err));
  }
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
  { category: 'HR Templates', key: 'handbook', label: 'Employee Handbook Signed', instructions: `Provide the employee with a copy of the current NU Laboratories Employee Handbook. Review key sections together. Have the employee sign the acknowledgment page confirming they received and reviewed the handbook. Retain the signed copy and note the handbook version in the notes field.`, notes_enabled: true, track: 'ballantine', type: 'onboarding' },

  // NU Labs Offboarding - Generated from _buildOffboardingItems function mappings (12 items)
  { category: 'HR Templates', key: 'credentials', label: 'Credentials Revoked (AD + Email Disabled)', instructions: `In Active Directory Users and Computers, right-click the employee account and select Disable Account. In Google Workspace Admin disable the user account. Revoke any active sessions. This must be completed on or before the employee's last day.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'computer', label: 'Computer Removed from Domain & Retrieved', instructions: `Retrieve the assigned workstation from the employee. In Active Directory Users and Computers, delete or disable the computer object. Wipe the workstation before reassigning using a secure erase method.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'nuworkspace', label: 'NUWorkspace Account Deactivated', instructions: `In NUWorkspace Setup → Employees, set the employee's termination date and mark as inactive. In Supabase Authentication → Users, disable or delete the user account so they can no longer log in.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'office', label: 'Office 365 License Revoked', instructions: `In Microsoft 365 Admin Center, remove the employee's license assignment. Sign out all active sessions. Archive or transfer their email and OneDrive data per company policy before deleting.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'zac', label: 'ZAC / Phone Extension Removed', instructions: `Log into Zultys Administration panel. Remove the employee's user account and extension. Reassign the extension if needed. Confirm the employee can no longer access the phone system.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'alarm', label: 'Alarm Code Deleted', instructions: `Enter alarm panel admin mode. Delete the employee's alarm code. Confirm it no longer works. Consider whether combination codes for CUI areas need to be changed per the CMMC offboarding checklist.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'duo', label: 'Duo MFA Enrollment Removed', instructions: `Log into Duo Admin Panel. Find the employee under Users. Delete the user or remove all enrolled devices. Confirm they can no longer authenticate via Duo. This must be done on or before the last day.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'blumira', label: 'Blumira Agent Removed from Computer', instructions: `If the computer is being returned or reassigned, uninstall the Blumira agent. In the Blumira dashboard remove the device from the sensor list. If the workstation is being wiped this step is covered by the wipe process.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'withsecure', label: 'WithSecure EPP Uninstalled', instructions: `In WithSecure Elements Security Center, remove the device from the management console. Uninstall the endpoint protection agent from the workstation if it is being reassigned. If being wiped, the wipe process covers this.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'bitlocker', label: 'BitLocker Status Verified Before Wipe', instructions: `Before wiping or reassigning the workstation, confirm BitLocker is still active and that the recovery key is stored in Active Directory. Perform a secure wipe using BitLocker encryption + format, or use the manufacturer's secure erase tool for SSDs.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'vpn', label: 'VPN Access Removed', instructions: `Log into UniFi Network dashboard. Go to Settings → Teleport & VPN → VPN Server. Remove the employee's VPN user account. Confirm they can no longer establish a VPN connection. Revoke any VPN client config files that were issued.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },
  { category: 'HR Templates', key: 'handbook', label: 'Handbook Acknowledgment Filed', instructions: `Confirm the signed employee handbook acknowledgment is on file. Note the handbook version that was in effect at the time of the employee's hire. Retain per company records retention policy.`, notes_enabled: false, track: 'nulabs', type: 'offboarding' },

  // Ballantine Offboarding - Generated from _buildOffboardingItems function mappings (9 items)  
  { category: 'HR Templates', key: 'credentials', label: 'Credentials Revoked (AD + Email Disabled)', instructions: `In Active Directory Users and Computers, right-click the employee account and select Disable Account. In Google Workspace Admin disable the user account. Revoke any active sessions. This must be completed on or before the employee's last day.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'email', label: 'Email Account Disabled', instructions: `In Google Workspace Admin disable the employee's account. Set up an out-of-office reply if needed. Archive the mailbox per company policy. Remove from all distribution lists.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'office', label: 'Office 365 License Revoked', instructions: `In Microsoft 365 Admin Center, remove the employee's license assignment. Sign out all active sessions. Archive or transfer their email and OneDrive data per company policy before deleting.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'zac', label: 'ZAC / Phone Extension Removed', instructions: `Log into Zultys Administration panel. Remove the employee's user account and extension. Reassign the extension if needed. Confirm the employee can no longer access the phone system.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'sql', label: 'SQL Server Access Revoked', instructions: `Remove the employee's SQL Server login and database user accounts. Revoke any permissions granted. Confirm they can no longer connect to the database.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'dba', label: 'DBA Software Access Revoked', instructions: `Remove the employee's DBA manufacturing software user account and any related licenses. Uninstall the software from the returned workstation if being reassigned.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'alarm', label: 'Alarm Code Deleted', instructions: `Enter alarm panel admin mode. Delete the employee's alarm code. Confirm it no longer works. Consider whether combination codes for CUI areas need to be changed per the CMMC offboarding checklist.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'synology', label: 'Synology Private Share Access Revoked', instructions: `In Synology DSM → Control Panel → Shared Folder → Ballantine share → Permissions, remove the employee's AD account. Confirm they can no longer access the share.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' },
  { category: 'HR Templates', key: 'handbook', label: 'Handbook Acknowledgment Filed', instructions: `Confirm the signed employee handbook acknowledgment is on file. Note the handbook version that was in effect at the time of the employee's hire. Retain per company records retention policy.`, notes_enabled: false, track: 'ballantine', type: 'offboarding' }
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

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;">
      ${templateCategories.map(category => {
        const categoryTemplates = templates.filter(t => t.category_id === category.id);
        
        if (category.name === 'HR Templates') {
          // Break down HR templates by track AND type
          const nulabsOnboarding = categoryTemplates.filter(t => t.track === 'nulabs' && t.type === 'onboarding');
          const nulabsOffboarding = categoryTemplates.filter(t => t.track === 'nulabs' && t.type === 'offboarding');
          const ballantineOnboarding = categoryTemplates.filter(t => t.track === 'ballantine' && t.type === 'onboarding');
          const ballantineOffboarding = categoryTemplates.filter(t => t.track === 'ballantine' && t.type === 'offboarding');
          const generalTemplates = categoryTemplates.filter(t => !t.track || (t.track !== 'nulabs' && t.track !== 'ballantine'));
          
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">${category.icon} ${category.name}</div>
              <div style="font-size:12px;color:var(--muted);">${category.description}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px;">${categoryTemplates.length} total templates</div>
            </div>
            <div style="padding:16px 20px;">
              ${nulabsOnboarding.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text);">NU Labs Onboarding</div>
                    <div style="font-size:11px;color:var(--muted);">${nulabsOnboarding.length} templates</div>
                  </div>
                  <button onclick="editTemplateSubgroup('${category.id}', 'nulabs-onboarding')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Edit
                  </button>
                </div>` : ''}

              ${nulabsOffboarding.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text);">NU Labs Offboarding</div>
                    <div style="font-size:11px;color:var(--muted);">${nulabsOffboarding.length} templates</div>
                  </div>
                  <button onclick="editTemplateSubgroup('${category.id}', 'nulabs-offboarding')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Edit
                  </button>
                </div>` : ''}
              
              ${ballantineOnboarding.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text);">Ballantine Onboarding</div>
                    <div style="font-size:11px;color:var(--muted);">${ballantineOnboarding.length} templates</div>
                  </div>
                  <button onclick="editTemplateSubgroup('${category.id}', 'ballantine-onboarding')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Edit
                  </button>
                </div>` : ''}

              ${ballantineOffboarding.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text);">Ballantine Offboarding</div>
                    <div style="font-size:11px;color:var(--muted);">${ballantineOffboarding.length} templates</div>
                  </div>
                  <button onclick="editTemplateSubgroup('${category.id}', 'ballantine-offboarding')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Edit
                  </button>
                </div>` : ''}
              
              ${generalTemplates.length > 0 ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:var(--text);">General HR Templates</div>
                    <div style="font-size:11px;color:var(--muted);">${generalTemplates.length} templates</div>
                  </div>
                  <button onclick="editTemplateSubgroup('${category.id}', 'general')" 
                    style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Edit
                  </button>
                </div>` : ''}
              
              ${categoryTemplates.length === 0 ? `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">No templates yet</div>` : ''}
            </div>
          </div>`;
          
        } else if (category.name === 'Compliance Templates') {
          // Break down CMMC templates by domain
          const domains = [
            { key: 'AC', name: 'Access Control',                  desc: 'User accounts, permissions, access management' },
            { key: 'AT', name: 'Awareness & Training',            desc: 'Security awareness, CUI training' },
            { key: 'AU', name: 'Audit & Accountability',          desc: 'Logging, monitoring, audit trails' },
            { key: 'CA', name: 'Security Assessment',             desc: 'Self-assessment, POA&M, system security plan' },
            { key: 'CM', name: 'Configuration Management',        desc: 'System configurations, change control' },
            { key: 'IA', name: 'Identification & Authentication', desc: 'User identity, MFA, credentials' },
            { key: 'IR', name: 'Incident Response',               desc: 'Security incidents, response procedures' },
            { key: 'MA', name: 'Maintenance',                     desc: 'System maintenance, updates' },
            { key: 'MP', name: 'Media Protection',                desc: 'Data storage, media handling' },
            { key: 'PE', name: 'Physical Protection',             desc: 'Facility security, physical access' },
            { key: 'PS', name: 'Personnel Security',              desc: 'Background checks, training' },
            { key: 'RA', name: 'Risk Assessment',                 desc: 'Risk analysis, vulnerability scanning' },
            { key: 'SC', name: 'System & Communications',         desc: 'Network security, encryption' },
            { key: 'SI', name: 'System & Information Integrity',  desc: 'Malware protection, system monitoring' }
          ];
          
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">${category.icon} ${category.name}</div>
              <div style="font-size:12px;color:var(--muted);">${category.description}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px;">${categoryTemplates.length} total templates</div>
            </div>
            <div style="padding:16px 20px;max-height:400px;overflow-y:auto;">
              ${domains.map(domain => {
                const domainTemplates = categoryTemplates.filter(t => (t.domain || '').toUpperCase() === domain.key);
                return domainTemplates.length > 0 ? `
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:12px;">
                    <div>
                      <div style="font-weight:600;color:var(--text);">${domain.key} - ${domain.name}</div>
                      <div style="font-size:10px;color:var(--muted);">${domainTemplates.length} templates • ${domain.desc}</div>
                    </div>
                    <button onclick="editTemplateSubgroup('${category.id}', '${domain.key}')" 
                      style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                      Edit
                    </button>
                  </div>` : '';
              }).join('')}
              
              ${categoryTemplates.length === 0 ? `
                <div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">
                  No CMMC templates yet.<br>
                  <button onclick="migrateComplianceEvidence()" 
                    style="background:var(--blue);color:white;border:none;border-radius:6px;padding:6px 12px;font-size:11px;margin-top:8px;cursor:pointer;font-family:'DM Sans',sans-serif;">
                    Import from compliance.js
                  </button>
                </div>` : `
                <div style="display:flex;justify-content:flex-end;margin-top:8px;padding-top:10px;border-top:1px solid var(--border);">
                  <button onclick="migrateComplianceEvidence()"
                    title="Re-import evidence strings from compliance.js (will prompt before overwriting)"
                    style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;">
                    ↻ Re-import from compliance.js
                  </button>
                </div>`}
            </div>
          </div>`;
          
        } else if (category.name === 'Other Templates') {
          // Other Templates — break down by subgroup (Email Templates, future: Forms, Content, etc.)
          const emailTemplates = categoryTemplates.filter(t => t.type === 'email');
          const otherMisc = categoryTemplates.filter(t => t.type !== 'email');

          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">${category.icon} ${category.name}</div>
              <div style="font-size:12px;color:var(--muted);">${category.description}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px;">${categoryTemplates.length} total templates</div>
            </div>
            <div style="padding:16px 20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:600;color:var(--text);">📧 Email Templates</div>
                  <div style="font-size:11px;color:var(--muted);">${emailTemplates.length} template${emailTemplates.length !== 1 ? 's' : ''} — used by the 📧 button on Project Info pages and on Client cards</div>
                  ${emailTemplates.length > 0 ? `
                  <div style="font-size:11px;color:var(--text);margin-top:6px;line-height:1.5;">
                    ${emailTemplates.map(t => {
                      const label = (t.label || 'Untitled').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                      const audienceLabel =
                        t.audience === 'client_outreach' ? 'Client card'
                        : t.audience === 'general'       ? 'Both'
                        : 'Project page';
                      return `<span style="display:inline-block;margin-right:10px;"><span style="color:var(--text);font-weight:500;">↳ ${label}</span> <span style="color:var(--muted);font-size:10.5px;">(${audienceLabel})</span></span>`;
                    }).join('')}
                  </div>` : ''}
                </div>
                <button onclick="editTemplateSubgroup('${category.id}', 'email')"
                  style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0;margin-left:10px;">
                  Edit
                </button>
              </div>
              ${otherMisc.length > 0 ? `
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:6px 10px;background:var(--surface2);border-radius:6px;font-size:12px;">
                <div>
                  <div style="font-weight:600;color:var(--text);">📄 Other / Misc</div>
                  <div style="font-size:10px;color:var(--muted);">${otherMisc.length} template${otherMisc.length !== 1 ? 's' : ''}</div>
                </div>
                <button onclick="editCategoryTemplates('${category.id}')"
                  style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:4px;padding:4px 10px;font-size:11px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
                  Edit
                </button>
              </div>` : ''}
            </div>
          </div>`;
        } else if (category.name === 'Test Templates') {
          // Test Templates — flat list of snippets stamped into test log entries.
          // Mirrors the Other Templates card; Edit shows even when empty.
          const sorted = categoryTemplates.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
            <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">${category.icon} ${category.name}</div>
              <div style="font-size:12px;color:var(--muted);">${category.description}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px;">${categoryTemplates.length} total template${categoryTemplates.length !== 1 ? 's' : ''}</div>
            </div>
            <div style="padding:16px 20px;">
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:600;color:var(--text);">🧪 Test Log Snippets</div>
                  <div style="font-size:11px;color:var(--muted);">Stamped into test log entries from the ＋ Add form menu</div>
                  ${sorted.length > 0 ? `
                  <div style="font-size:11px;color:var(--text);margin-top:6px;line-height:1.6;">
                    ${sorted.map(t => {
                      const label = (t.label || 'Untitled').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                      return `<span style="display:inline-block;margin-right:10px;color:var(--text);font-weight:500;">↳ ${label}</span>`;
                    }).join('')}
                  </div>` : ''}
                </div>
                <button onclick="editCategoryTemplates('${category.id}')"
                  style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;flex-shrink:0;margin-left:10px;">
                  Edit
                </button>
              </div>
            </div>
          </div>`;
        } else {
          // Other categories (future expansion)
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
        }
      }).join('')}

      <!-- Customer Surveys card — data lives in survey_templates / survey_email_templates,
           edited via the openSurveyTemplateEditor(...) function in surveys.js -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
        <div style="padding:16px 20px;background:var(--surface2);border-bottom:1px solid var(--border);">
          <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">📊 Customer Surveys</div>
          <div style="font-size:12px;color:var(--muted);">Questions and email used when sending customer satisfaction surveys.</div>
        </div>
        <div style="padding:16px 20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:8px 12px;background:var(--surface2);border-radius:8px;">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text);">📝 Survey Questions</div>
              <div style="font-size:11px;color:var(--muted);">Questions, scale, and labels for the public form</div>
            </div>
            <button onclick="openSurveyTemplateEditor('questions')"
              style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
              Edit
            </button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-radius:8px;">
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--text);">✉ Email Template</div>
              <div style="font-size:11px;color:var(--muted);">Subject, body, and signature used in the survey send</div>
            </div>
            <button onclick="openSurveyTemplateEditor('email')"
              style="background:var(--amber-dim);border:1px solid var(--amber);border-radius:6px;padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:'DM Sans',sans-serif;">
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function editCategoryTemplates(categoryId) {
  openTemplateEditModal(categoryId);
}

function editTemplateSubgroup(categoryId, subgroup) {
  openTemplateEditModal(categoryId, subgroup);
}

// ===== TEMPLATE EDITING MODAL =====
let editingTemplateData = [];
let editingCategoryId = null;
let editingSubgroup = null;

function openTemplateEditModal(categoryId, subgroup = null) {
  editingCategoryId = categoryId;
  editingSubgroup = subgroup;
  const category = templateCategories.find(c => c.id === categoryId);
  
  // Filter templates by subgroup
  let filteredTemplates = templates.filter(t => t.category_id === categoryId);
  
  if (subgroup) {
    if (category.name === 'HR Templates') {
      // Handle new combined track-type subgroups
      if (subgroup === 'nulabs-onboarding') {
        filteredTemplates = filteredTemplates.filter(t => t.track === 'nulabs' && t.type === 'onboarding');
      } else if (subgroup === 'nulabs-offboarding') {
        filteredTemplates = filteredTemplates.filter(t => t.track === 'nulabs' && t.type === 'offboarding');
      } else if (subgroup === 'ballantine-onboarding') {
        filteredTemplates = filteredTemplates.filter(t => t.track === 'ballantine' && t.type === 'onboarding');
      } else if (subgroup === 'ballantine-offboarding') {
        filteredTemplates = filteredTemplates.filter(t => t.track === 'ballantine' && t.type === 'offboarding');
      } else if (subgroup === 'general') {
        filteredTemplates = filteredTemplates.filter(t => !t.track || (t.track !== 'nulabs' && t.track !== 'ballantine'));
      } else {
        // Legacy support for old subgroup names
        filteredTemplates = filteredTemplates.filter(t => t.track === subgroup);
      }
    } else if (category.name === 'Compliance Templates') {
      // Filter by domain for CMMC templates
      filteredTemplates = filteredTemplates.filter(t => (t.domain || '').toUpperCase() === subgroup.toUpperCase());
    } else if (category.name === 'Other Templates') {
      if (subgroup === 'email') {
        filteredTemplates = filteredTemplates.filter(t => t.type === 'email');
      }
    }
  }
  
  editingTemplateData = filteredTemplates.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  
  const modal = document.getElementById('templateEditModal');
  if (!modal) {
    createTemplateEditModal();
  }
  
  renderTemplateEditModal(category, subgroup);
  document.getElementById('templateEditModal').classList.add('open');
}

function createTemplateEditModal() {
  const modalHtml = `
    <div id="templateEditModal" class="modal-backdrop" onclick="if(event.target===this) closeTemplateEditModal()">
      <div class="modal" style="width:90%;max-width:1000px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
        <div class="modal-header">
          <div class="modal-title" id="templateEditTitle">Edit Templates</div>
          <button class="modal-close" onclick="closeTemplateEditModal()">&#x2715;</button>
        </div>
        <div class="modal-body" id="templateEditBody" style="flex:1;overflow-y:auto;">
          <!-- Template list will be rendered here -->
        </div>
        <div class="modal-footer">
          <button onclick="addNewTemplate()" 
            style="background:var(--amber);color:var(--bg);border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">
            + Add Template
          </button>
          <button onclick="closeTemplateEditModal()" 
            style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;color:var(--muted);font-family:'DM Sans',sans-serif;">
            Close
          </button>
        </div>
      </div>
    </div>`;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function renderTemplateEditModal(category, subgroup = null) {
  const body = document.getElementById('templateEditBody');
  const title = document.getElementById('templateEditTitle');
  
  // Generate appropriate title and description
  let modalTitle = `Edit ${category.name}`;
  let modalDescription = category.description;
  
  if (subgroup) {
    if (category.name === 'HR Templates') {
      if (subgroup === 'nulabs-onboarding') {
        modalTitle = 'Edit NU Labs Onboarding Templates';
        modalDescription = 'Onboarding checklist items for NU Labs employees';
      } else if (subgroup === 'nulabs-offboarding') {
        modalTitle = 'Edit NU Labs Offboarding Templates';
        modalDescription = 'Offboarding checklist items for NU Labs employees';
      } else if (subgroup === 'ballantine-onboarding') {
        modalTitle = 'Edit Ballantine Onboarding Templates';  
        modalDescription = 'Onboarding checklist items for Ballantine employees';
      } else if (subgroup === 'ballantine-offboarding') {
        modalTitle = 'Edit Ballantine Offboarding Templates';  
        modalDescription = 'Offboarding checklist items for Ballantine employees';
      } else if (subgroup === 'general') {
        modalTitle = 'Edit General HR Templates';
        modalDescription = 'General HR templates not specific to any track';
      } else {
        // Legacy support
        modalTitle = `Edit ${subgroup} Templates`;
        modalDescription = `Templates for ${subgroup} employees`;
      }
    } else if (category.name === 'Compliance Templates') {
      const domainNames = {
        'AC': 'Access Control',          'AT': 'Awareness & Training',
        'AU': 'Audit & Accountability',  'CA': 'Security Assessment',
        'CM': 'Configuration Management','IA': 'Identification & Authentication',
        'IR': 'Incident Response',       'MA': 'Maintenance',
        'MP': 'Media Protection',        'PE': 'Physical Protection',
        'PS': 'Personnel Security',      'RA': 'Risk Assessment',
        'SC': 'System & Communications', 'SI': 'System & Information Integrity'
      };
      modalTitle = `Edit ${subgroup} - ${domainNames[subgroup] || subgroup} Templates`;
      modalDescription = `CMMC Level 2 evidence strings for ${domainNames[subgroup] || subgroup} domain`;
    } else if (category.name === 'Other Templates') {
      if (subgroup === 'email') {
        modalTitle = 'Edit Email Templates';
        modalDescription = 'Email templates used by the 📧 button on Project Info pages and on Client cards. Set the Audience on each template to control where it shows up. Available variables: {{contactFirstName}}, {{contactFullName}}, {{contactEmail}}, {{clientName}}, {{projectName}}, {{po}}, {{quoteNumber}}, {{testCompleteDate}}, {{tentativeTestDate}}, {{lastProjectName}}, {{lastProjectClosedDate}}, {{senderName}}, {{senderEmail}}. Project-specific variables ({{projectName}}, {{po}}, {{quoteNumber}}, test dates) are blank when the template is used from a Client card. {{lastProjectName}} and {{lastProjectClosedDate}} resolve to the most recent project for the client.';
      }
    }
  }
  
  if (title) title.textContent = modalTitle;
  
  if (!body) return;
  
  body.innerHTML = `
    <div style="padding:24px;">
      <div style="margin-bottom:16px;">
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px;">${category.icon} ${modalTitle}</div>
        <div style="font-size:13px;color:var(--muted);">${modalDescription}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px;">${editingTemplateData.length} template${editingTemplateData.length !== 1 ? 's' : ''}</div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:16px;background:var(--amber-glow);border:1px solid var(--amber-dim);border-radius:6px;font-size:12px;color:var(--text);">
        <span style="font-size:14px;">💾</span>
        <span><strong>Changes save automatically</strong> when you click or tab out of a field. Watch for the <em>"✓ Template updated"</em> confirmation at the bottom of the screen.</span>
      </div>

      <div id="templateEditList">
        ${editingTemplateData.length === 0 
          ? '<div style="text-align:center;padding:40px;color:var(--muted);">No templates in this group yet.</div>'
          : editingTemplateData.map((template, index) => renderTemplateEditRow(template, index)).join('')
        }
      </div>
    </div>`;
}

async function addNewTemplate() {
  const category = templateCategories.find(c => c.id === editingCategoryId);
  if (!category) return;
  
  // Determine default values based on subgroup
  let defaultTrack = 'general';
  let defaultDomain = '';
  let defaultType = 'general';
  
  if (editingSubgroup) {
    if (category.name === 'HR Templates') {
      if (editingSubgroup === 'nulabs-onboarding') {
        defaultTrack = 'nulabs';
        defaultType = 'onboarding';
      } else if (editingSubgroup === 'nulabs-offboarding') {
        defaultTrack = 'nulabs';
        defaultType = 'offboarding';
      } else if (editingSubgroup === 'ballantine-onboarding') {
        defaultTrack = 'ballantine';
        defaultType = 'onboarding';
      } else if (editingSubgroup === 'ballantine-offboarding') {
        defaultTrack = 'ballantine';
        defaultType = 'offboarding';
      } else if (editingSubgroup === 'general') {
        defaultTrack = 'general';
        defaultType = 'general';
      } else {
        // Legacy support
        defaultTrack = editingSubgroup;
        defaultType = 'onboarding';
      }
    } else if (category.name === 'Compliance Templates') {
      defaultDomain = editingSubgroup;
      defaultType = 'compliance';
    } else if (editingSubgroup === 'email') {
      // Anything else with editingSubgroup='email' is an email-template context
      // (covers 'Other Templates' and any future category that gains an
      // email subgroup). Defensive against category-name drift.
      defaultType = 'email';
      defaultTrack = null;
    }
  }

  const newTemplate = {
    category_id: editingCategoryId,
    key: 'new_template_' + Date.now(),
    label: defaultType === 'email' ? 'New Email Template' : 'New Template',
    subject: defaultType === 'email' ? '{{projectName}}' : null,
    instructions: defaultType === 'email'
      ? 'Hi {{contactFirstName}},\n\n[Your message here]\n\nProject: {{projectName}}\nPO: {{po}}\nQuote: {{quoteNumber}}\n\nBest regards,\n{{senderName}}\nNU Laboratories, Inc.'
      : 'Enter template instructions here...',
    notes_enabled: false,
    track: defaultTrack,
    domain: defaultDomain,
    type: defaultType,
    audience: defaultType === 'email' ? 'project' : null,
    sort_order: editingTemplateData.length,
    is_active: true
  };
  
  try {
    const { data, error } = await sb.from('templates')
      .insert([newTemplate])
      .select()
      .single();
    
    if (error) {
      console.error('Template create error:', error);
      toast('⚠ Create failed: ' + error.message);
      return;
    }
    
    // Add to local data
    templates.push(data);
    editingTemplateData.push(data);
    
    // Re-render modal
    renderTemplateEditModal(category, editingSubgroup);
    
    // Update main templates panel
    renderTemplatesPanel();
    
    toast('✓ Template added');
    
  } catch (e) {
    console.error('Template create failed:', e);
    toast('⚠ Create failed');
  }
}

// Import CMMC evidence strings from compliance.js into the templates table.
// Reads window.POAM_PRACTICES (practice id + description) and window.ASSESSMENT_EVIDENCE (evidence strings)
// exposed by compliance.js. Inserts as type='compliance_evidence' with domain = first 2 chars of practice id.
async function migrateComplianceEvidence() {
  // Guard: make sure compliance.js globals are loaded
  if (typeof window.POAM_PRACTICES === 'undefined' || typeof window.ASSESSMENT_EVIDENCE === 'undefined') {
    alert('Source data not found.\n\nMake sure compliance.js is loaded (open Compliance tab once, then come back).');
    return;
  }
  const POAM_PRACTICES_SRC = window.POAM_PRACTICES;
  const ASSESSMENT_EVIDENCE_SRC = window.ASSESSMENT_EVIDENCE;

  // Find Compliance Templates category
  const complianceCategory = templateCategories.find(c => c.name === 'Compliance Templates');
  if (!complianceCategory) {
    alert('Compliance Templates category not found. Reload the page and try again.');
    return;
  }

  // Count existing compliance_evidence rows
  const existing = templates.filter(t =>
    t.type === 'compliance_evidence' && t.category_id === complianceCategory.id
  );

  let confirmMsg = `Import ${POAM_PRACTICES_SRC.length} CMMC evidence strings from compliance.js into the database?\n\n`;
  if (existing.length > 0) {
    confirmMsg += `⚠ This will DELETE ${existing.length} existing evidence template${existing.length === 1 ? '' : 's'} and replace with fresh data from compliance.js.\n\nAny edits made in Setup → Templates will be lost.\n\n`;
  }
  confirmMsg += 'Continue?';

  if (!confirm(confirmMsg)) return;

  try {
    // Delete existing first (if any)
    if (existing.length > 0) {
      const { error: delErr } = await sb.from('templates')
        .delete()
        .eq('type', 'compliance_evidence')
        .eq('category_id', complianceCategory.id);
      if (delErr) throw delErr;
    }

    // Build insert rows — sort_order matches POAM_PRACTICES order (AC.L1 before AC.L2, etc.)
    const rows = POAM_PRACTICES_SRC.map((p, idx) => {
      const domain = (p.id.split('.')[0] || '').toUpperCase(); // 'AC.L1-3.1.1' → 'AC'
      return {
        category_id:   complianceCategory.id,
        key:           p.id,
        label:         p.desc || p.id,
        instructions:  ASSESSMENT_EVIDENCE_SRC[p.id] || '',
        notes_enabled: false,
        track:         null,
        type:          'compliance_evidence',
        domain:        domain,
        sort_order:    idx,
        is_active:     true
      };
    });

    // Insert in batches of 50 to stay under Supabase payload limits
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error: insErr } = await sb.from('templates').insert(batch);
      if (insErr) throw insErr;
      inserted += batch.length;
    }

    // Reload and rerender
    await loadTemplateData();
    renderTemplatesPanel();

    toast(`✓ Imported ${inserted} CMMC evidence templates`);
  } catch (e) {
    console.error('Compliance migration failed:', e);
    alert('Import failed: ' + (e.message || e));
  }
}

function renderTemplateEditRow(template, index) {
  const trackOptions = ['nulabs', 'ballantine', 'general'].map(track => 
    `<option value="${track}" ${template.track === track ? 'selected' : ''}>${track}</option>`).join('');
  
  const typeOptions = ['onboarding', 'offboarding', 'compliance', 'general', 'email'].map(type => 
    `<option value="${type}" ${template.type === type ? 'selected' : ''}>${type}</option>`).join('');
  
  const domainOptions = ['AC','AT','AU','CA','CM','IA','IR','MA','MP','PE','PS','RA','SC','SI'].map(domain => 
    `<option value="${domain}" ${(template.domain || '').toUpperCase() === domain ? 'selected' : ''}>${domain}</option>`).join('');
  
  return `
    <div class="template-edit-row" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div style="flex:1;">
          <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Template Label</div>
          <input type="text" value="${template.label}" 
            onchange="updateTemplateField('${template.id}', 'label', this.value)"
            style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:13px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
        </div>
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Track</div>
            <select onchange="updateTemplateField('${template.id}', 'track', this.value)"
              style="background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
              ${trackOptions}
            </select>
          </div>
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Type</div>
            <select onchange="updateTemplateField('${template.id}', 'type', this.value)"
              style="background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
              ${typeOptions}
            </select>
          </div>
          ${template.type === 'compliance' || (template.domain && template.domain.length > 0) ? `
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Domain</div>
            <select onchange="updateTemplateField('${template.id}', 'domain', this.value)"
              style="background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
              <option value="">—</option>
              ${domainOptions}
            </select>
          </div>` : ''}
          <div>
            <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Sort</div>
            <input type="number" value="${template.sort_order || index}" min="0" max="999" 
              onchange="updateTemplateField('${template.id}', 'sort_order', parseInt(this.value))"
              style="width:60px;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 8px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
          </div>
          <button onclick="deleteTemplate('${template.id}')" 
            style="background:rgba(224,92,92,0.1);border:1px solid rgba(224,92,92,0.3);border-radius:6px;padding:8px 10px;color:var(--red);cursor:pointer;font-size:12px;">
            🗑
          </button>
        </div>
      </div>
      
      ${template.type === 'email' ? `
      <div style="display:flex;gap:12px;margin-bottom:12px;">
        <div style="flex:1;">
          <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Subject</div>
          <input type="text" value="${(template.subject||'').replace(/"/g,'&quot;')}"
            onchange="updateTemplateField('${template.id}', 'subject', this.value)"
            placeholder="e.g. {{projectName}} — update"
            style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;">
        </div>
        <div style="width:180px;flex-shrink:0;">
          <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;" title="Where this template appears">Audience</div>
          <select onchange="updateTemplateField('${template.id}', 'audience', this.value)"
            style="width:100%;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;">
            <option value="project"         ${(template.audience||'project') === 'project'         ? 'selected' : ''}>Project page only</option>
            <option value="client_outreach" ${template.audience === 'client_outreach'              ? 'selected' : ''}>Client card only</option>
            <option value="general"         ${template.audience === 'general'                      ? 'selected' : ''}>Both</option>
          </select>
        </div>
      </div>` : ''}

      <div style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${template.type === 'email' ? 'Body' : 'Instructions'}</div>
        <textarea onchange="updateTemplateField('${template.id}', 'instructions', this.value)"
          style="width:100%;min-height:${template.type === 'email' ? '180' : '100'}px;background:var(--surface);border:1.5px solid var(--border);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--text);font-family:'DM Sans',sans-serif;outline:none;resize:vertical;box-sizing:border-box;">${template.instructions||''}</textarea>
      </div>
      
      <div style="display:flex;align-items:center;gap:8px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text);">
          <input type="checkbox" ${template.notes_enabled ? 'checked' : ''} 
            onchange="updateTemplateField('${template.id}', 'notes_enabled', this.checked)"
            style="margin:0;">
          Notes field enabled
        </label>
        <div style="margin-left:auto;font-size:11px;color:var(--muted);">Key: <code style="font-family:'JetBrains Mono',monospace;background:var(--surface);padding:2px 6px;border-radius:3px;">${template.key}</code></div>
      </div>
    </div>`;
}

function closeTemplateEditModal() {
  document.getElementById('templateEditModal').classList.remove('open');
  // Refresh the outer Templates panel so any type changes made inside
  // the modal (e.g. flipping a row's Type to 'email') are reflected in
  // the subgroup card categorization.
  renderTemplatesPanel();
}

async function updateTemplateField(templateId, field, value) {
  try {
    // Update database
    const { error } = await sb.from('templates')
      .update({ [field]: value })
      .eq('id', templateId);
    
    if (error) {
      console.error('Template update error:', error);
      toast('⚠ Update failed: ' + error.message);
      return;
    }
    
    // Update local data
    const template = templates.find(t => t.id === templateId);
    if (template) template[field] = value;
    
    const editingTemplate = editingTemplateData.find(t => t.id === templateId);
    if (editingTemplate) editingTemplate[field] = value;
    
    // Show success feedback
    toast('✓ Template updated');
    
    // If sort order changed, re-render to show new order
    if (field === 'sort_order') {
      await loadTemplateData(); // Reload to get proper sorting
      const category = templateCategories.find(c => c.id === editingCategoryId);
      editingTemplateData = templates.filter(t => t.category_id === editingCategoryId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      renderTemplateEditModal(category);
    }

    // If type changed, re-render so the email-specific fields (Subject /
    // Audience / Body label) appear or disappear immediately. Without this,
    // the user has to close and re-open the modal to see the right layout.
    if (field === 'type') {
      const category = templateCategories.find(c => c.id === editingCategoryId);
      if (category) renderTemplateEditModal(category, editingSubgroup);
    }
    
  } catch (e) {
    console.error('Template update failed:', e);
    toast('⚠ Update failed');
  }
}

async function deleteTemplate(templateId) {
  const template = editingTemplateData.find(t => t.id === templateId);
  if (!template) return;
  
  if (!confirm(`Delete template "${template.label}"? This cannot be undone and will affect any onboarding checklists using this template.`)) {
    return;
  }
  
  try {
    const { error } = await sb.from('templates').delete().eq('id', templateId);
    
    if (error) {
      console.error('Template delete error:', error);
      toast('⚠ Delete failed: ' + error.message);
      return;
    }
    
    // Remove from local data
    const globalIndex = templates.findIndex(t => t.id === templateId);
    if (globalIndex > -1) templates.splice(globalIndex, 1);
    
    const editingIndex = editingTemplateData.findIndex(t => t.id === templateId);
    if (editingIndex > -1) editingTemplateData.splice(editingIndex, 1);
    
    // Re-render modal
    const category = templateCategories.find(c => c.id === editingCategoryId);
    renderTemplateEditModal(category);
    
    // Update main templates panel
    renderTemplatesPanel();
    
    toast('✓ Template deleted');
    
  } catch (e) {
    console.error('Template delete failed:', e);
    toast('⚠ Delete failed');
  }
}

async function addNewTemplate() {
  const category = templateCategories.find(c => c.id === editingCategoryId);
  if (!category) return;
  
  const newTemplate = {
    category_id: editingCategoryId,
    key: 'new_template_' + Date.now(),
    label: 'New Template',
    instructions: 'Enter template instructions here...',
    notes_enabled: false,
    track: 'nulabs',
    type: 'onboarding',
    sort_order: editingTemplateData.length,
    is_active: true
  };
  
  try {
    const { data, error } = await sb.from('templates')
      .insert([newTemplate])
      .select()
      .single();
    
    if (error) {
      console.error('Template create error:', error);
      toast('⚠ Create failed: ' + error.message);
      return;
    }
    
    // Add to local data
    templates.push(data);
    editingTemplateData.push(data);
    
    // Re-render modal
    renderTemplateEditModal(category);
    
    // Update main templates panel
    renderTemplatesPanel();
    
    toast('✓ Template added');
    
  } catch (e) {
    console.error('Template create failed:', e);
    toast('⚠ Create failed');
  }
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

  // Build tabbed layout — single-row flat tab bar
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%">
      <!-- Tab bar -->
      <div style="display:flex;gap:2px;padding:12px 32px 0;border-bottom:1px solid var(--border);background:var(--bg);flex-shrink:0">
        <button id="myInfoTab-profile"   onclick="switchMyInfoTab('profile')"   class="myinfo-tab active-tab">👤 Profile</button>
        <button id="myInfoTab-vacation"  onclick="switchMyInfoTab('vacation')"  class="myinfo-tab">✈️ Vacation</button>
        <button id="myInfoTab-chatter"   onclick="switchMyInfoTab('chatter')"   class="myinfo-tab">💬 Chatter</button>
        <button id="myInfoTab-lifecycle" onclick="switchMyInfoTab('lifecycle')" class="myinfo-tab">🔄 Lifecycle</button>
        <button id="myInfoTab-hrrecords" onclick="switchMyInfoTab('hrrecords')" class="myinfo-tab">📋 HR Records</button>
      </div>
      <!-- Tab content —
           Profile / Lifecycle / HR Records all render into #empProfilePane inside the shared pane.
           Vacation and Chatter have their own panes. -->
      <div id="myInfoTabContent" style="flex:1;overflow-y:auto;background:var(--bg)">
        <div id="myInfoPane-empprofile" style="padding:28px 32px">
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
  _myInfoReadOnly = true;      // lock Lifecycle/HR tabs to read-only for self-view
  empProfileTab = 'profile';   // always land on Profile when opening My Info
  showEmpProfile(currentEmployee.id);
  window._myInfoActiveTab = 'profile';
}

function switchMyInfoTab(tab) {
  window._myInfoActiveTab = tab;
  const allTabs = ['profile','vacation','chatter','lifecycle','hrrecords'];
  allTabs.forEach(t => {
    const btn = document.getElementById('myInfoTab-' + t);
    if (btn) btn.classList.toggle('active-tab', t === tab);
  });

  const empProfilePane = document.getElementById('myInfoPane-empprofile');
  const vacPane        = document.getElementById('myInfoPane-vacation');
  const chatPane       = document.getElementById('myInfoPane-chatter');
  const usesEmpPane    = ['profile','lifecycle','hrrecords'].includes(tab);
  if (empProfilePane) empProfilePane.style.display = usesEmpPane ? '' : 'none';
  if (vacPane)        vacPane.style.display        = tab === 'vacation' ? '' : 'none';
  if (chatPane)       chatPane.style.display       = tab === 'chatter'  ? '' : 'none';

  const empId = currentEmployee?.id;
  if (!empId) return;

  if (usesEmpPane) {
    empProfileTab = tab;
    if (typeof showEmpProfile === 'function') showEmpProfile(empId);
  } else if (tab === 'vacation' && typeof renderMyInfoVacationTab === 'function') {
    renderMyInfoVacationTab(empId);
  } else if (tab === 'chatter' && typeof renderMyInfoChatterTab === 'function') {
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
    { key: 'primary_contact',label: 'Primary Contact' },
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

// ── Tracked-fields config (shared, DB-backed) ───────────────────────────
// Single source of truth: the audit_config table (one row, id=1). Database
// triggers (fn_audit_track) read it directly to decide what to log; this
// cache only backs the Setup → Audit Log checkboxes. Owners edit it here
// (the RLS policy on audit_config blocks non-owner writes). Replaces the old
// per-browser localStorage settings so tracking is one shared policy.
const AUDIT_DEFAULTS = {
  tasks:     ['status','assignee','revenue_type','fixed_price'],
  projects:  ['status','credit_hold','need_updated_po'],
  employees: ['permission_level','termination_date'],
  shipping:  ['received','shipped'],
};
let _auditConfig = null;   // populated by loadAuditConfig()

async function loadAuditConfig() {
  if (!sb) { _auditConfig = JSON.parse(JSON.stringify(AUDIT_DEFAULTS)); return _auditConfig; }
  try {
    const { data, error } = await sb.from('audit_config').select('config').eq('id', 1).single();
    if (error) throw error;
    _auditConfig = (data && data.config) ? data.config : JSON.parse(JSON.stringify(AUDIT_DEFAULTS));
  } catch (e) {
    console.warn('Audit config load failed, using defaults:', e);
    _auditConfig = JSON.parse(JSON.stringify(AUDIT_DEFAULTS));
  }
  return _auditConfig;
}

// In-memory tracked-fields config (defaults until loadAuditConfig runs).
function getAuditSettings() {
  return _auditConfig || AUDIT_DEFAULTS;
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

// Field-change logging is now handled by database triggers (fn_audit_track)
// reading audit_config — there is no app-layer logAuditChange anymore.
// Discrete *action* events (record created, shipped, etc.) still go through
// logActivity above.

function openAuditLogPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  // Keep Setup highlighted since Audit Log is a sub-page of Setup
  (el || document.getElementById('navSetup'))?.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-auditlog').classList.add('active');
  document.getElementById('topbarName').textContent = 'Audit Log';
  renderAuditLogPanel();
}

// ── Audit Log tab state ──────────────────────────────────────────────
// Persists across re-renders so filter inputs / active tab survive re-paint.
let _auditActiveTab = 'field-changes';   // 'field-changes' | 'chatter'
let _auditChatterFilters = {
  empId:    '',
  projId:   '',
  dateFrom: '',
  dateTo:   '',
  keyword:  '',
};
let _auditFieldFilters = {
  empName:    '',   // matches activity_log.employee_name
  projId:     '',   // applied client-side (record_type→project lookup needed)
  dateFrom:   '',
  dateTo:     '',
  recordType: '',   // 'tasks' | 'projects' | 'employees' | 'shipping' | ''
  keyword:    '',   // ilike match across record_label / field_changed / old_value / new_value
};
let _auditFieldSort = {
  col: 'created_at',  // 'created_at' | 'employee_name' | 'field_changed'
  dir: 'desc',        // 'asc' | 'desc'
};

// Small HTML escape — used for any user-supplied string we render.
function _auditEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Navigate to a project from the audit log. If jumpToChatter is true,
// switch to the project's Chatter sub-tab (used by the Chatter Activity
// rows). Otherwise the project opens on its default Info tab.
function navToProjectFromAudit(projId, jumpToChatter) {
  if (!projId) return;
  if (typeof selectProjectById === 'function') {
    selectProjectById(projId);
  } else if (typeof selectProject === 'function') {
    selectProject(projId, null);
  }
  document.getElementById('navProjects')?.classList.add('active');
  if (jumpToChatter) {
    setTimeout(() => {
      if (typeof switchProjTab === 'function') switchProjTab('sub-chatter');
    }, 200);
  }
}

async function renderAuditLogPanel() {
  const el = document.getElementById('auditLogContent');
  if (!el) return;

  // Header + tab bar (same on both tabs)
  const tabBtn = (key, label) => {
    const active = _auditActiveTab === key;
    return '<button onclick="_switchAuditTab(\x27'+key+'\x27)" '+
      'style="padding:10px 20px;background:transparent;border:none;'+
      'border-bottom:2.5px solid '+(active?'var(--amber)':'transparent')+';'+
      'font-family:\x27DM Sans\x27,sans-serif;font-size:13px;'+
      'font-weight:'+(active?'600':'500')+';'+
      'color:'+(active?'var(--amber)':'var(--muted)')+';'+
      'cursor:pointer;transition:color .12s">'+label+'</button>';
  };

  el.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:10px">'+
      '<div><div style="font-family:DM Serif Display,serif;font-size:24px;color:var(--text)">📋 Audit Log</div>'+
        '<div style="font-size:12px;color:var(--muted);margin-top:2px">Investigate field changes and chatter activity</div></div>'+
    '</div>'+
    '<div style="display:flex;gap:0;border-bottom:1.5px solid var(--border);margin-bottom:24px;background:var(--bg);position:sticky;top:0;z-index:10">'+
      tabBtn('field-changes', '🔧 Field Changes') +
      tabBtn('chatter', '💬 Chatter Activity') +
    '</div>'+
    '<div id="auditTabBody"><div style="color:var(--muted);font-size:13px">Loading…</div></div>';

  if (_auditActiveTab === 'chatter') {
    await _renderAuditChatterTab();
  } else {
    await _renderAuditFieldChangesTab();
  }
}

function _switchAuditTab(tab) {
  _auditActiveTab = tab;
  renderAuditLogPanel();
}

// ── Tab 1: Field Changes (existing behavior, with clickable Project) ──
async function _renderAuditFieldChangesTab() {
  const body = document.getElementById('auditTabBody');
  if (!body) return;

  // Pull the shared tracked-fields config from the DB so the checkboxes
  // reflect the live policy, not a stale per-browser copy.
  await loadAuditConfig();

  // Static chrome (filters bar + tracked-fields settings card + empty list
  // container). Filters/sort changes only re-render the list, not the chrome.
  body.innerHTML =
    _auditFieldFiltersHtml() +
    _auditFieldSettingsHtml() +
    '<div id="auditFieldList"><div style="color:var(--muted);font-size:13px;padding:20px 0">Loading…</div></div>';

  await _loadAndRenderAuditFieldList();
}

// Filter bar — mirrors the Chatter Activity filter pattern with one extra
// dropdown (Record type). Project filter is applied client-side (the
// activity_log table doesn't have a project_id column; the project for any
// given row has to be derived via record_type + record_id → tasks → project).
function _auditFieldFiltersHtml() {
  const f = _auditFieldFilters;

  // Employee dropdown — activity_log stores employee_name as a denormalized
  // column, so we filter by name. Same active-only convention as the
  // Chatter tab.
  const sortedEmps = [...employees]
    .filter(e =>
      e.isActive !== false &&
      !e.terminationDate &&
      e.id !== 'aaaaaaaa-0000-0000-0000-000000000001'
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const empOpts = '<option value="">All employees</option>' +
    sortedEmps.map(e =>
      '<option value="' + _auditEsc(e.name) + '"' + (f.empName === e.name ? ' selected' : '') + '>' + _auditEsc(e.name) + '</option>'
    ).join('');

  // Project dropdown — exclude closed unless one is currently selected.
  const projInfoLookup = (typeof projectInfo === 'object' && projectInfo) ? projectInfo : {};
  const sortedProjs = [...projects]
    .filter(p => {
      if (p.id === f.projId) return true;
      return (projInfoLookup[p.id] || {}).status !== 'closed';
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const projOpts = '<option value="">All open projects</option>' +
    sortedProjs.map(p =>
      '<option value="' + p.id + '"' + (f.projId === p.id ? ' selected' : '') + '>' + _auditEsc((p.emoji ? p.emoji + ' ' : '') + p.name) + '</option>'
    ).join('');

  // Record type dropdown
  const typeOpts = '<option value="">All record types</option>' +
    [['tasks','Tasks'], ['projects','Projects'], ['employees','Employees'], ['shipping','Shipping & Receiving']]
      .map(([k, l]) => '<option value="' + k + '"' + (f.recordType === k ? ' selected' : '') + '>' + l + '</option>').join('');

  const fieldStyle = 'background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);font-family:\x27DM Sans\x27,sans-serif';
  const labelStyle = 'font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;display:block';

  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:20px">' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end">' +
      '<div><label style="' + labelStyle + '">Employee</label>' +
        '<select onchange="_updateAuditFieldFilter(\x27empName\x27,this.value)" style="' + fieldStyle + ';width:100%">' + empOpts + '</select></div>' +
      '<div><label style="' + labelStyle + '">Project</label>' +
        '<select onchange="_updateAuditFieldFilter(\x27projId\x27,this.value)" style="' + fieldStyle + ';width:100%">' + projOpts + '</select></div>' +
      '<div><label style="' + labelStyle + '">Record type</label>' +
        '<select onchange="_updateAuditFieldFilter(\x27recordType\x27,this.value)" style="' + fieldStyle + ';width:100%">' + typeOpts + '</select></div>' +
      '<div><label style="' + labelStyle + '">From</label>' +
        '<input type="date" value="' + _auditEsc(f.dateFrom) + '" onchange="_updateAuditFieldFilter(\x27dateFrom\x27,this.value)" style="' + fieldStyle + ';width:100%"></div>' +
      '<div><label style="' + labelStyle + '">To</label>' +
        '<input type="date" value="' + _auditEsc(f.dateTo) + '" onchange="_updateAuditFieldFilter(\x27dateTo\x27,this.value)" style="' + fieldStyle + ';width:100%"></div>' +
      '<div style="grid-column:1/-1;display:flex;gap:10px;align-items:end">' +
        '<div style="flex:1"><label style="' + labelStyle + '">Search text</label>' +
          '<input type="text" value="' + _auditEsc(f.keyword) + '" placeholder="Match record, field, or value text…" ' +
            'onkeydown="if(event.key===\x27Enter\x27){_updateAuditFieldFilter(\x27keyword\x27,this.value);}" ' +
            'onblur="_updateAuditFieldFilter(\x27keyword\x27,this.value)" style="' + fieldStyle + ';width:100%"></div>' +
        '<button onclick="_clearAuditFieldFilters()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:12px;color:var(--muted);cursor:pointer;font-family:\x27DM Sans\x27,sans-serif">Clear</button>' +
      '</div>' +
    '</div></div>';
}

function _updateAuditFieldFilter(field, value) {
  if (_auditFieldFilters[field] === value) return;  // no-op (avoids onblur spam)
  _auditFieldFilters[field] = value;
  _loadAndRenderAuditFieldList();
}

function _clearAuditFieldFilters() {
  _auditFieldFilters = { empName:'', projId:'', dateFrom:'', dateTo:'', recordType:'', keyword:'' };
  _renderAuditFieldChangesTab();   // full re-render so the inputs reset
}

function _setAuditFieldSort(col) {
  if (_auditFieldSort.col === col) {
    _auditFieldSort.dir = _auditFieldSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _auditFieldSort.col = col;
    _auditFieldSort.dir = 'desc';   // first click on a new column lands as DESC
  }
  _loadAndRenderAuditFieldList();
}

// Tracked-fields settings card — unchanged from before, just extracted so the
// list can re-render without redrawing it.
function _auditFieldSettingsHtml() {
  const settings = getAuditSettings();
  let html = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:24px">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px">⚙ Tracked Fields</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px">';
  Object.entries(AUDIT_FIELD_DEFS).forEach(([type, fields]) => {
    const typeLabel = { tasks:'Tasks', projects:'Projects', employees:'Employees', shipping:'Shipping & Receiving' }[type];
    html += '<div><div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:10px">' + typeLabel + '</div>';
    fields.forEach(f => {
      const checked = (settings[type] || []).includes(f.key);
      html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text);margin-bottom:7px">' +
        '<input type="checkbox" ' + (checked ? 'checked' : '') + ' style="accent-color:var(--amber);width:14px;height:14px;cursor:pointer"' +
        ' onchange="toggleAuditField(\x27' + type + '\x27,\x27' + f.key + '\x27,this.checked)"> ' + f.label + '</label>';
    });
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

async function _loadAndRenderAuditFieldList() {
  const list = document.getElementById('auditFieldList');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">Loading…</div>';

  if (!sb) { list.innerHTML = '<div style="color:var(--red);font-size:13px">Not connected.</div>'; return; }

  const f = _auditFieldFilters;
  const s = _auditFieldSort;
  const ascending = s.dir === 'asc';

  // Bump the row limit when filters narrow the result so users don't miss
  // older matches. Without filters the default 200 keeps it snappy.
  const anyFilterSet = !!(f.empName || f.projId || f.dateFrom || f.dateTo || f.recordType || (f.keyword && f.keyword.trim()));
  const limit = anyFilterSet ? 1000 : 200;

  let q = sb.from('activity_log')
    .select('*')
    .order(s.col, { ascending })
    .limit(limit);

  if (f.empName)    q = q.eq('employee_name', f.empName);
  if (f.recordType) q = q.eq('record_type',   f.recordType);
  if (f.dateFrom)   q = q.gte('created_at', f.dateFrom + 'T00:00:00');
  if (f.dateTo) {
    const end = new Date(f.dateTo + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    q = q.lt('created_at', end.toISOString());
  }
  if (f.keyword && f.keyword.trim()) {
    const safe = f.keyword.trim().replace(/[%_\\]/g, m => '\\' + m);
    // Match across the four user-visible columns. record_label may be null;
    // PostgREST handles that fine.
    q = q.or(
      'record_label.ilike.%' + safe + '%,' +
      'field_changed.ilike.%' + safe + '%,' +
      'old_value.ilike.%' + safe + '%,' +
      'new_value.ilike.%' + safe + '%'
    );
  }

  const { data, error } = await q;
  if (error) {
    list.innerHTML = '<div style="color:var(--red);font-size:13px;padding:20px 0">Error loading: ' + _auditEsc(error.message || 'unknown') + '</div>';
    return;
  }
  let logs = data || [];

  // Project filter is client-side because activity_log has no project_id;
  // we have to look up via record_type + record_id.
  if (f.projId) {
    logs = logs.filter(l => {
      if (l.record_type === 'projects') return l.record_id === f.projId;
      if (l.record_type === 'tasks') {
        const t = taskStore.find(t => t._id === l.record_id);
        return !!(t && t.proj === f.projId);
      }
      return false;
    });
  }

  list.innerHTML = _renderAuditFieldRows(logs, anyFilterSet);
}

function _renderAuditFieldRows(logs, filtersActive) {
  if (logs.length === 0) {
    if (filtersActive) {
      return '<div style="text-align:center;padding:48px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:12px">' +
        '<div style="font-size:32px;margin-bottom:12px">📋</div>' +
        '<div style="font-size:14px">No changes match these filters.</div>' +
        '<div style="font-size:12px;margin-top:6px">Try clearing filters or widening the date range.</div></div>';
    }
    return '<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">📋</div><div>No activity logged yet.</div></div>';
  }

  const fmtDate    = d => new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  const fieldLabel = (type, key) => {
    const def = (AUDIT_FIELD_DEFS[type] || []).find(f => f.key === key);
    return def ? def.label : key;
  };

  // Reusable clickable project cell builder.
  const projectCell = (l) => {
    let proj = null;
    if (l.record_type === 'projects') {
      proj = projects.find(p => p.id === l.record_id);
    } else if (l.record_type === 'tasks') {
      const t = taskStore.find(t => t._id === l.record_id);
      if (t) proj = projects.find(p => p.id === t.proj);
    }
    if (!proj) {
      return '<td style="padding:9px 14px;font-size:12px;color:var(--muted);white-space:nowrap;max-width:140px">—</td>';
    }
    const label = _auditEsc((proj.emoji ? proj.emoji + ' ' : '') + proj.name);
    return '<td style="padding:9px 14px;font-size:12px;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">' +
      '<span onclick="event.stopPropagation();navToProjectFromAudit(\x27' + proj.id + '\x27,false)" ' +
      'style="color:var(--amber);cursor:pointer;text-decoration:none" ' +
      'onmouseover="this.style.textDecoration=\x27underline\x27" ' +
      'onmouseout="this.style.textDecoration=\x27none\x27" ' +
      'title="Open project">' + label + '</span></td>';
  };

  // Sort-aware header cell. Clicking toggles direction on the active column,
  // or resets to DESC when switching columns.
  const s = _auditFieldSort;
  const sortHeader = (col, label) => {
    const isActive = s.col === col;
    const arrow = isActive ? (s.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const colorActive = isActive ? 'var(--amber)' : 'var(--muted)';
    return '<th onclick="_setAuditFieldSort(\x27' + col + '\x27)" ' +
      'style="text-align:left;padding:10px 14px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:' + colorActive + ';cursor:pointer;user-select:none">' +
      label + arrow + '</th>';
  };
  const plainHeader = (label) =>
    '<th style="text-align:left;padding:10px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)">' + label + '</th>';

  return '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">' + logs.length + (logs.length === 1 ? ' change' : ' changes') + '</div>' +
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:2px solid var(--border)">' +
      sortHeader('created_at', 'When') +
      sortHeader('employee_name', 'Who') +
      plainHeader('Project') +
      plainHeader('Record') +
      sortHeader('field_changed', 'Field') +
      plainHeader('From') +
      plainHeader('To') +
    '</tr></thead><tbody>' +
    logs.map(l => '<tr style="border-bottom:1px solid var(--border);transition:background .12s" onmouseover="this.style.background=\x27var(--surface2)\x27" onmouseout="this.style.background=\x27\x27">' +
      '<td style="padding:9px 14px;font-size:11px;color:var(--muted);white-space:nowrap">' + fmtDate(l.created_at) + '</td>' +
      '<td style="padding:9px 14px;font-size:13px;font-weight:500;color:var(--text)">' + _auditEsc(l.employee_name || '—') + '</td>' +
      projectCell(l) +
      '<td style="padding:9px 14px;font-size:12px;color:var(--text)">' +
        '<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--surface2);color:var(--muted);margin-right:6px">' + _auditEsc(l.record_type) + '</span>' +
        _auditEsc(l.record_label || l.record_id || '—') + '</td>' +
      '<td style="padding:9px 14px;font-size:12px;color:var(--text)">' + _auditEsc(fieldLabel(l.record_type, l.field_changed)) + '</td>' +
      '<td style="padding:9px 14px;font-size:12px;color:var(--red);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _auditEsc(l.old_value || '—') + '</td>' +
      '<td style="padding:9px 14px;font-size:12px;color:var(--green);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _auditEsc(l.new_value || '—') + '</td>' +
      '</tr>'
    ).join('') +
    '</tbody></table></div>';
}

async function toggleAuditField(type, key, checked) {
  const cfg = JSON.parse(JSON.stringify(getAuditSettings()));
  if (!cfg[type]) cfg[type] = [];
  if (checked) { if (!cfg[type].includes(key)) cfg[type].push(key); }
  else { cfg[type] = cfg[type].filter(k => k !== key); }
  _auditConfig = cfg;                       // optimistic local update
  if (!sb) return;
  try {
    const { error } = await sb.from('audit_config')
      .update({ config: cfg,
                updated_at: new Date().toISOString(),
                updated_by: (currentEmployee && currentEmployee.id) || null })
      .eq('id', 1);
    if (error) throw error;
  } catch (e) {
    console.error('Audit config save failed:', e);
    if (typeof toast === 'function') toast('⚠ Could not save tracked-fields change — you may not have permission.');
  }
}

// ── Tab 2: Chatter Activity ───────────────────────────────────────────
// "Show me everything Corrine posted." Queries the chatter table directly
// with server-side filtering for employee, project, date range, and keyword.
// Click the project label on any row to jump to that project's Chatter tab.
async function _renderAuditChatterTab() {
  const body = document.getElementById('auditTabBody');
  if (!body) return;

  // Render filter bar immediately so it's responsive while data loads.
  body.innerHTML = _auditChatterFiltersHtml() + '<div id="auditChatterList" style="color:var(--muted);font-size:13px">Loading messages…</div>';
  await _loadAndRenderAuditChatterList();
}

function _auditChatterFiltersHtml() {
  const f = _auditChatterFilters;

  // Employee dropdown — active employees only (matches scheduler.js / employees.js
  // convention: isActive !== false && no terminationDate). Skip the
  // historical-import sentinel.
  // Note: we do NOT require e.userId — the in-memory employee record (built
  // in supabase-client.js loadAllData) doesn't currently carry user_id, so
  // checking it would exclude everyone. The actual filter query below falls
  // back to author_name matching, which is reliable since chatter.author_name
  // is stored denormalized.
  const sortedEmps = [...employees]
    .filter(e =>
      e.isActive !== false &&
      !e.terminationDate &&
      e.id !== 'aaaaaaaa-0000-0000-0000-000000000001'
    )
    .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  const empOpts = '<option value="">All active employees</option>' +
    sortedEmps.map(e =>
      '<option value="'+e.id+'"'+(f.empId===e.id?' selected':'')+'>'+_auditEsc(e.name)+'</option>'
    ).join('');

  // Project dropdown — exclude closed projects (matches the projects.js
  // "Show Closed" convention: projectInfo[id].status !== 'closed'). If a
  // closed project is currently selected, keep it visible so the user can
  // see what they're filtering on.
  const projInfoLookup = (typeof projectInfo === 'object' && projectInfo) ? projectInfo : {};
  const sortedProjs = [...projects]
    .filter(p => {
      if (p.id === f.projId) return true;   // keep current selection visible
      return (projInfoLookup[p.id] || {}).status !== 'closed';
    })
    .sort((a,b) => (a.name||'').localeCompare(b.name||''));
  const projOpts = '<option value="">All open projects</option>' +
    sortedProjs.map(p =>
      '<option value="'+p.id+'"'+(f.projId===p.id?' selected':'')+'>'+_auditEsc((p.emoji?p.emoji+' ':'')+p.name)+'</option>'
    ).join('');

  const fieldStyle = 'background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);font-family:\x27DM Sans\x27,sans-serif';
  const labelStyle = 'font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;display:block';

  return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:20px">'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end">'+
      '<div><label style="'+labelStyle+'">Employee</label>'+
        '<select onchange="_updateAuditChatterFilter(\x27empId\x27,this.value)" style="'+fieldStyle+';width:100%">'+empOpts+'</select></div>'+
      '<div><label style="'+labelStyle+'">Project</label>'+
        '<select onchange="_updateAuditChatterFilter(\x27projId\x27,this.value)" style="'+fieldStyle+';width:100%">'+projOpts+'</select></div>'+
      '<div><label style="'+labelStyle+'">From</label>'+
        '<input type="date" value="'+_auditEsc(f.dateFrom)+'" onchange="_updateAuditChatterFilter(\x27dateFrom\x27,this.value)" style="'+fieldStyle+';width:100%"></div>'+
      '<div><label style="'+labelStyle+'">To</label>'+
        '<input type="date" value="'+_auditEsc(f.dateTo)+'" onchange="_updateAuditChatterFilter(\x27dateTo\x27,this.value)" style="'+fieldStyle+';width:100%"></div>'+
      '<div style="grid-column:1/-1;display:flex;gap:10px;align-items:end">'+
        '<div style="flex:1"><label style="'+labelStyle+'">Search text</label>'+
          '<input type="text" value="'+_auditEsc(f.keyword)+'" placeholder="Find a word or phrase…" '+
            'onkeydown="if(event.key===\x27Enter\x27){_updateAuditChatterFilter(\x27keyword\x27,this.value);}" '+
            'onblur="_updateAuditChatterFilter(\x27keyword\x27,this.value)" style="'+fieldStyle+';width:100%"></div>'+
        '<button onclick="_clearAuditChatterFilters()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:12px;color:var(--muted);cursor:pointer;font-family:\x27DM Sans\x27,sans-serif">Clear</button>'+
      '</div>'+
    '</div></div>';
}

function _updateAuditChatterFilter(field, value) {
  if (_auditChatterFilters[field] === value) return;   // no-op (avoids onblur spam)
  _auditChatterFilters[field] = value;
  _loadAndRenderAuditChatterList();
}

function _clearAuditChatterFilters() {
  _auditChatterFilters = { empId:'', projId:'', dateFrom:'', dateTo:'', keyword:'' };
  _renderAuditChatterTab();
}

async function _loadAndRenderAuditChatterList() {
  const list = document.getElementById('auditChatterList');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0">Loading messages…</div>';

  if (!sb) { list.innerHTML = '<div style="color:var(--red);font-size:13px">Not connected.</div>'; return; }

  const f = _auditChatterFilters;
  let q = sb.from('chatter').select('*').order('created_at', { ascending: false }).limit(200);

  // Employee filter — chatter.author_id stores the auth userId, so we
  // translate empId → userId. Fall back to author_name if userId is missing.
  if (f.empId) {
    const emp = employees.find(e => e.id === f.empId);
    if (emp && emp.userId) {
      q = q.eq('author_id', emp.userId);
    } else if (emp && emp.name) {
      q = q.eq('author_name', emp.name);
    }
  }
  if (f.projId)   q = q.eq('proj_id', f.projId);
  if (f.dateFrom) q = q.gte('created_at', f.dateFrom + 'T00:00:00');
  if (f.dateTo) {
    // Inclusive end-of-day: add 1 day, use less-than.
    const end = new Date(f.dateTo + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    q = q.lt('created_at', end.toISOString());
  }
  if (f.keyword && f.keyword.trim()) {
    // Escape PostgREST wildcards in user input, then ilike-wrap.
    const safe = f.keyword.trim().replace(/[%_\\]/g, m => '\\' + m);
    q = q.ilike('text', '%' + safe + '%');
  }

  const { data, error } = await q;
  if (error) {
    list.innerHTML = '<div style="color:var(--red);font-size:13px;padding:20px 0">Error loading chatter: '+_auditEsc(error.message||'unknown')+'</div>';
    return;
  }
  const rows = data || [];
  list.innerHTML = _renderAuditChatterRows(rows);
}

function _renderAuditChatterRows(rows) {
  if (!rows.length) {
    return '<div style="text-align:center;padding:48px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:12px">'+
      '<div style="font-size:32px;margin-bottom:12px">💬</div>'+
      '<div style="font-size:14px">No chatter messages match these filters.</div>'+
      '<div style="font-size:12px;margin-top:6px">Try clearing filters or widening the date range.</div></div>';
  }

  const fmtTs = d => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) +
      ' · ' + dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  };

  // Cache employee lookup by userId for speed (mentions / author resolution)
  const empByUserId = {};
  const empById     = {};
  employees.forEach(e => {
    if (e.userId) empByUserId[e.userId] = e;
    empById[e.id] = e;
  });
  const projById = {};
  projects.forEach(p => { projById[p.id] = p; });

  const header = '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">'+rows.length+' message'+(rows.length===1?'':'s')+(rows.length===200?' (limit reached — narrow your filters)':'')+'</div>';

  const list = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">'+
    rows.map((m, i) => {
      const isLast = i === rows.length - 1;
      const emp = empByUserId[m.author_id] || null;
      const initials = m.author_initials || (emp ? emp.initials : '?');
      const color    = m.author_color    || (emp ? emp.color    : '#888');
      const authorName = m.author_name || (emp ? emp.name : 'Unknown');

      // Project pill — clickable. Falls back to "—" when proj_id missing.
      const proj = projById[m.proj_id];
      let projHtml = '<span style="font-size:12px;color:var(--muted)">—</span>';
      if (proj) {
        const label = _auditEsc((proj.emoji ? proj.emoji+' ' : '') + proj.name);
        projHtml = '<span onclick="navToProjectFromAudit(\x27'+proj.id+'\x27,true)" '+
          'style="font-size:12px;color:var(--amber);cursor:pointer;font-weight:500" '+
          'onmouseover="this.style.textDecoration=\x27underline\x27" '+
          'onmouseout="this.style.textDecoration=\x27none\x27" '+
          'title="Open project chatter">'+label+'</span>';
      }

      // Build badges row (attachments, reply, mentions)
      const badges = [];
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      if (atts.length) {
        badges.push('<span style="font-size:11px;padding:2px 8px;background:var(--surface2);color:var(--muted);border-radius:6px">📎 '+atts.length+' attachment'+(atts.length===1?'':'s')+'</span>');
      }
      if (m.reply_to) {
        badges.push('<span style="font-size:11px;padding:2px 8px;background:var(--surface2);color:var(--muted);border-radius:6px">↩ Reply</span>');
      }
      const notifyIds = Array.isArray(m.notify_ids) ? m.notify_ids : [];
      if (notifyIds.length) {
        const names = notifyIds.map(id => empById[id]?.name).filter(Boolean).slice(0,4);
        if (names.length) {
          badges.push('<span style="font-size:11px;padding:2px 8px;background:var(--surface2);color:var(--muted);border-radius:6px">@ '+_auditEsc(names.join(', '))+(notifyIds.length>4?' +'+(notifyIds.length-4):'')+'</span>');
        }
      }
      const badgesHtml = badges.length
        ? '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'+badges.join('')+'</div>'
        : '';

      const text = _auditEsc(m.text || '').replace(/\n/g, '<br>');

      return '<div style="display:flex;gap:12px;padding:14px 16px'+(isLast?'':';border-bottom:1px solid var(--border)')+';transition:background .12s" '+
        'onmouseover="this.style.background=\x27var(--surface2)\x27" onmouseout="this.style.background=\x27\x27">'+
        '<div style="background:'+_auditEsc(color)+';color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0">'+_auditEsc(initials)+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap">'+
            '<span style="font-size:13px;font-weight:600;color:var(--text)">'+_auditEsc(authorName)+'</span>'+
            '<span style="color:var(--muted);font-size:11px">·</span>'+
            projHtml+
            '<span style="font-size:11px;color:var(--muted);margin-left:auto;white-space:nowrap">'+fmtTs(m.created_at)+'</span>'+
          '</div>'+
          '<div style="font-size:13px;line-height:1.55;color:var(--text);word-break:break-word">'+text+'</div>'+
          badgesHtml+
        '</div>'+
      '</div>';
    }).join('')+
    '</div>';

  return header + list;
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
  { key: 'view_closing_report',label: 'View Closing Report',   group: 'Reports' },
  { key: 'view_billing',       label: 'View Billing Queue',    group: 'Reports' },
  { key: 'view_quotes',        label: 'View Quotes (Vibrato)', group: 'Reports' },
  { key: 'view_surveys',       label: 'View Customer Surveys', group: 'Reports' },
  { key: 'view_audit_log',     label: 'View Audit Log',        group: 'Admin' },
  { key: 'view_setup',         label: 'View Setup',            group: 'Admin' },
  { key: 'manage_employees',   label: 'Manage Employees',      group: 'Admin' },
  { key: 'manage_permissions', label: 'Manage Permissions',    group: 'Admin' },
  { key: 'manage_templates',   label: 'Manage Templates',      group: 'Admin' },
  { key: 'view_chatter',       label: 'View Chatter',          group: 'Communication' },
  { key: 'send_client_email',  label: 'Send Client Emails',    group: 'Communication' },
  { key: 'post_chatter',       label: 'Post in Chatter',       group: 'Communication' },
  { key: 'view_schedule',      label: 'View Scheduler',        group: 'Scheduler' },
  { key: 'edit_schedule',      label: 'Edit Scheduler',        group: 'Scheduler' },
  { key: 'view_cmmc',          label: 'View CMMC Compliance',  group: 'Compliance' },
  { key: 'access_nuforce',     label: 'Access NUForce',        group: 'Apps' },
  { key: 'nuforce_approve_quotes', label: 'Approve Quotes (NUForce)', group: 'Apps' },
  { key: 'nuforce_send_quotes',    label: 'Send Approved Quotes (NUForce)', group: 'Apps' },
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

  // Role-level collapse state lives in localStorage so it persists across
  // visits. Key per role id. Missing key = collapsed (the default on first
  // load). false = explicitly expanded.
  const collapsed = _getCollapsedRoles();

  const expandAllBtn = `<button onclick="window._toggleAllPermRoles(false)"
    style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:4px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;">Expand all</button>`;
  const collapseAllBtn = `<button onclick="window._toggleAllPermRoles(true)"
    style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:4px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;">Collapse all</button>`;
  const topBar = `<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px;">${expandAllBtn}${collapseAllBtn}</div>`;

  body.innerHTML = topBar + permissionRoles.map(role => {
    const assignedEmps = employees.filter(e => e.roleId === role.id);
    const caps = role.capabilities || {};
    const isCollapsed = collapsed[role.id] !== false; // default: collapsed
    const arrow = isCollapsed ? '&#x25B8;' : '&#x25BE;'; // ▸ or ▾

    // Stacked avatars shown in the header only when collapsed — gives a
    // quick "who is in this role" answer without expanding.
    const avatars = isCollapsed
      ? assignedEmps.slice(0, 10).map(e =>
          `<div style="width:26px;height:26px;border-radius:50%;background:${e.color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;flex-shrink:0;margin-left:-6px;border:2px solid var(--surface2);" title="${e.name}">${e.initials}</div>`
        ).join('') +
        (assignedEmps.length > 10
          ? `<div style="font-size:10px;color:var(--muted);margin-left:8px;">+${assignedEmps.length - 10}</div>`
          : '') +
        (assignedEmps.length === 0
          ? `<div style="font-size:11px;color:var(--muted);font-style:italic;">No employees assigned</div>`
          : '')
      : '';

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
      <!-- Role header (click to toggle) -->
      <div style="padding:16px 20px;${isCollapsed ? '' : 'border-bottom:1px solid var(--border);'}display:flex;align-items:center;gap:12px;background:var(--surface2);cursor:pointer;user-select:none;"
        onclick="window._togglePermRole(event, '${role.id}')">
        <span style="font-size:13px;color:var(--muted);width:14px;display:inline-block;text-align:center;">${arrow}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:var(--text);">${role.name}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${role.description || ''}</div>
        </div>
        <div style="display:flex;align-items:center;padding-right:6px;" data-stop-toggle>${avatars}</div>
        <button onclick="event.stopPropagation();openEditRoleModal('${role.id}')" style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);font-size:12px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">&#x270E; Edit</button>
        <button onclick="event.stopPropagation();deleteRole('${role.id}')" style="background:transparent;border:1px solid rgba(208,64,64,.3);border-radius:6px;color:var(--red);font-size:12px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;">&#x2715;</button>
      </div>
      ${isCollapsed ? '' : `
      <!-- Capabilities + Assigned (only when expanded) -->
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
                <button onclick="unassignRole('${e.id}')" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 4px;" title="Remove from role">&#x2715;</button>
              </div>`).join('')}
          <div style="margin-top:12px;">
            <select onchange="assignRole(this.value,'${role.id}');this.value=''"
              style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 10px;outline:none;width:100%;cursor:pointer;">
              <option value="">+ Assign employee&hellip;</option>
              ${employees.filter(e => !e.roleId && e.isActive !== false).map(e =>
                `<option value="${e.id}">${e.name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`}
    </div>`;
  }).join('');
}

// ─── Permissions panel: role-level collapse state ─────────────────────────
// localStorage shape: { "<role_id_uuid>": false, "<role_id_uuid>": true, ... }
// Missing key = collapsed (the default on first load).
// false = explicitly expanded; true = explicitly collapsed.

const _PERM_ROLE_COLLAPSE_KEY = 'nuworkspace_perm_roles_collapsed';

function _getCollapsedRoles() {
  try {
    const raw = localStorage.getItem(_PERM_ROLE_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function _setCollapsedRoles(state) {
  try {
    localStorage.setItem(_PERM_ROLE_COLLAPSE_KEY, JSON.stringify(state));
  } catch (_) { /* localStorage quota / disabled — silent fallback */ }
}

window._togglePermRole = function(event, roleId) {
  // Don't toggle if the click landed on a child button or the avatars area —
  // those have stopPropagation but defense-in-depth helps if a future child
  // gets added without it.
  if (event && event.target) {
    let el = event.target;
    while (el && el !== event.currentTarget) {
      if (el.tagName === 'BUTTON' || el.dataset?.stopToggle !== undefined) return;
      el = el.parentElement;
    }
  }
  const state = _getCollapsedRoles();
  state[roleId] = !(state[roleId] !== false); // currently expanded? → collapse; else → expand
  _setCollapsedRoles(state);
  renderPermissionsPanel();
};

window._toggleAllPermRoles = function(collapseAll) {
  const state = {};
  permissionRoles.forEach(r => { state[r.id] = collapseAll; });
  _setCollapsedRoles(state);
  renderPermissionsPanel();
};

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
    ${renderCompanyHolidaysCard()}
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

  // Kick off async load of the currently selected year's holidays into the
  // Company Holidays section. This is fire-and-forget — the section initially
  // shows a "Loading…" state and re-renders once data is back.
  if (typeof window !== 'undefined' && window._companyHolidaysInit) {
    window._companyHolidaysInit();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANY HOLIDAYS — Setup UI
// ═══════════════════════════════════════════════════════════════════════════
//
// Self-contained section in Scheduler Settings (admin/owner-only) that
// manages the `company_holidays` Supabase table. Architecture:
//
//   _chSt: in-memory working state for the currently-selected year.
//          Edits accumulate here until "Save changes" commits the diff.
//
//   renderCompanyHolidaysCard():       returns the section HTML (called by
//                                      renderSchedSettingsPanel)
//
//   window._companyHolidaysInit():     async; fetches selected year's rows
//                                      from DB and re-renders the section
//                                      body in place. Called after panel
//                                      paint and after year-dropdown change.
//
//   Save flow:
//     - Compute diff (deletes, updates, inserts) against _chSt._original
//     - Execute via Supabase. Single transaction not available from JS
//       client; do deletes → updates → inserts so partial failure leaves
//       the cleanest state.
//     - Invalidate the holidays cache for that year so Home card / scheduler
//       stripes / employee card chips immediately see the new dates.
//     - Re-fetch and re-render the section.
//
// Permission: hidden entirely unless currentEmployee.isOwner === true.
// RLS will also reject writes from non-admins, so the gate is defense-in-depth.

const _chSt = {
  year: null,
  rows: [],          // [{ id?, holiday_date, name, sort_order, _dirty?, _new?, _deleted? }]
  _original: [],     // snapshot of rows as loaded, for diff
  loading: false,
};

function renderCompanyHolidaysCard() {
  // Hidden entirely for non-owners (RLS would block writes anyway,
  // but no point rendering the UI).
  if (!currentEmployee?.isOwner) return '';

  if (_chSt.year == null) _chSt.year = new Date().getFullYear();
  return `
    <div id="companyHolidaysCard" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:14px 18px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <span style="font-weight:700;font-size:13px;">&#x1F3D6;&#xFE0F; Company Holidays</span>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="font-size:12px;color:var(--muted);">Year:</label>
          <select id="chYearSelect" onchange="window._chSetYear(parseInt(this.value,10))"
            style="background:var(--surface2);border:1.5px solid var(--border);border-radius:7px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:5px 10px;outline:none;cursor:pointer;">
            ${_chBuildYearOptions()}
          </select>
          <button id="chSaveBtn" onclick="window._chSave()"
            style="padding:5px 14px;border-radius:6px;background:var(--amber);color:#0e0e0f;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">Save changes</button>
        </div>
      </div>
      <div id="chBody" style="padding:14px 18px;">
        <div style="color:var(--muted);font-size:12px;">Loading&hellip;</div>
      </div>
    </div>`;
}

function _chBuildYearOptions() {
  const cur = new Date().getFullYear();
  // Current year, next 2, plus any years already present in cache/state
  const set = new Set([cur, cur + 1, cur + 2]);
  if (_chSt.year != null) set.add(_chSt.year);
  if (typeof window._holidaysCachedYears === 'function') {
    window._holidaysCachedYears().forEach(y => set.add(y));
  }
  const years = Array.from(set).sort((a, b) => a - b);
  return years.map(y => `<option value="${y}"${y === _chSt.year ? ' selected' : ''}>${y}</option>`).join('');
}

window._chSetYear = async function(year) {
  // Warn if there are unsaved changes
  if (_chHasUnsavedChanges()) {
    if (!confirm('You have unsaved changes for ' + _chSt.year + '. Switch year and lose them?')) {
      // Re-select the old value in the dropdown
      const sel = document.getElementById('chYearSelect');
      if (sel) sel.value = String(_chSt.year);
      return;
    }
  }
  _chSt.year = year;
  await window._companyHolidaysInit();
};

window._companyHolidaysInit = async function() {
  if (!currentEmployee?.isOwner) return;
  if (_chSt.year == null) _chSt.year = new Date().getFullYear();
  const bodyEl = document.getElementById('chBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="color:var(--muted);font-size:12px;">Loading&hellip;</div>';
  _chSt.loading = true;
  try {
    const { data, error } = await sb.from('company_holidays')
      .select('id, year, holiday_date, name, sort_order')
      .eq('year', _chSt.year)
      .order('holiday_date', { ascending: true });
    if (error) throw error;
    _chSt.rows = (data || []).map(r => ({
      id: r.id, holiday_date: r.holiday_date, name: r.name,
      sort_order: r.sort_order, _dirty: false, _new: false, _deleted: false
    }));
    _chSt._original = JSON.parse(JSON.stringify(_chSt.rows));
  } catch (e) {
    console.error('[holidays] load year ' + _chSt.year + ' failed:', e);
    bodyEl.innerHTML = '<div style="color:var(--red);font-size:12px;">Failed to load: ' + (e.message || 'unknown') + '</div>';
    _chSt.loading = false;
    return;
  }
  _chSt.loading = false;
  _chRenderBody();
};

function _chHasUnsavedChanges() {
  if (_chSt.rows.some(r => r._new || r._dirty || r._deleted)) return true;
  return false;
}

function _chRenderBody() {
  const bodyEl = document.getElementById('chBody');
  if (!bodyEl) return;

  // Visible rows = everything not marked deleted, sorted by date
  const visible = _chSt.rows.filter(r => !r._deleted).slice().sort((a, b) =>
    (a.holiday_date || '').localeCompare(b.holiday_date || '')
  );

  const isEmpty = visible.length === 0;

  let seedRow = '';
  if (isEmpty) {
    seedRow = `
      <div style="padding:18px;background:var(--surface2);border:1px dashed var(--border);border-radius:8px;text-align:center;margin-bottom:14px;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:10px;">No holidays configured for ${_chSt.year}.</div>
        <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
          <button onclick="window._chAutoSeed()"
            style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">&#x2699; Auto-seed from federal rules</button>
          <button onclick="window._chDuplicatePrior()"
            style="padding:6px 14px;border-radius:6px;background:var(--surface);color:var(--text);border:1px solid var(--border);font-size:12px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">&#x1F4CB; Duplicate from ${_chSt.year - 1}</button>
        </div>
      </div>`;
  }

  const rowsHtml = visible.map((r, idx) => {
    // Use the row's index into the full _chSt.rows array so handlers can find
    // the right object even after sorting/filtering.
    const realIdx = _chSt.rows.indexOf(r);
    return `
      <div style="display:grid;grid-template-columns:160px 1fr 36px;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);">
        <input type="date" value="${r.holiday_date || ''}"
          onchange="window._chEditDate(${realIdx}, this.value)"
          style="background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:5px 8px;outline:none;" />
        <input type="text" value="${(r.name || '').replace(/"/g,'&quot;')}" placeholder="Holiday name"
          oninput="window._chEditName(${realIdx}, this.value)"
          style="background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;padding:5px 8px;outline:none;width:100%;" />
        <button onclick="window._chDeleteRow(${realIdx})" title="Remove this holiday"
          style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--red);font-size:14px;cursor:pointer;height:28px;display:flex;align-items:center;justify-content:center;">&times;</button>
      </div>`;
  }).join('');

  const dirtyCount = _chSt.rows.filter(r => r._new || r._dirty || r._deleted).length;
  const dirtyBadge = dirtyCount > 0
    ? `<span style="font-size:11px;color:var(--amber);margin-left:8px;">&middot; ${dirtyCount} unsaved change${dirtyCount===1?'':'s'}</span>`
    : '';

  bodyEl.innerHTML = `
    ${seedRow}
    ${visible.length > 0 ? `
      <div style="display:grid;grid-template-columns:160px 1fr 36px;gap:10px;padding:0 0 8px 0;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);">
        <div>Date</div>
        <div>Name</div>
        <div></div>
      </div>
      ${rowsHtml}
    ` : ''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;">
      <button onclick="window._chAddRow()"
        style="padding:6px 14px;border-radius:6px;background:transparent;color:var(--text);border:1px dashed var(--border);font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;">+ Add holiday</button>
      <div style="font-size:11px;color:var(--muted);">${visible.length} holiday${visible.length===1?'':'s'}${dirtyBadge}</div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.5;">
      The holiday list flows through to the Home page upcoming-holidays card, the Scheduler calendar stripes, the employee card chips, and the timesheet PTO accrual logic. Changes take effect after Save and a page refresh.
    </div>`;
}

window._chEditDate = function(idx, val) {
  const r = _chSt.rows[idx];
  if (!r) return;
  r.holiday_date = val;
  if (!r._new) r._dirty = true;
  _chUpdateButtonState();
};

window._chEditName = function(idx, val) {
  const r = _chSt.rows[idx];
  if (!r) return;
  r.name = val;
  if (!r._new) r._dirty = true;
  _chUpdateButtonState();
};

window._chDeleteRow = function(idx) {
  const r = _chSt.rows[idx];
  if (!r) return;
  if (r._new) {
    // New row not yet saved → just drop it from the array
    _chSt.rows.splice(idx, 1);
  } else {
    r._deleted = true;
  }
  _chRenderBody();
};

window._chAddRow = function() {
  // Default the new row's date to Jan 1 of the selected year so the date
  // input has a meaningful starting value; user changes it immediately.
  const defaultDate = _chSt.year + '-01-01';
  _chSt.rows.push({
    id: null,
    holiday_date: defaultDate,
    name: '',
    sort_order: null,
    _new: true, _dirty: false, _deleted: false,
  });
  _chRenderBody();
};

window._chAutoSeed = function() {
  if (typeof window.getHolidaysFromFederalRule !== 'function') {
    alert('Federal-rule seeder unavailable. Reload the page and try again.');
    return;
  }
  const seed = window.getHolidaysFromFederalRule(_chSt.year);
  // The federal rule includes "New Year's Eve" which sits on Dec 31 of the
  // PRIOR year. Drop entries that don't belong to _chSt.year, otherwise
  // we'd create rows with year = _chSt.year but a date like 2025-12-31.
  const yearStr = String(_chSt.year);
  _chSt.rows = seed
    .filter(h => h.date.startsWith(yearStr))
    .map(h => ({
      id: null,
      holiday_date: h.date,
      name: h.name,
      sort_order: null,
      _new: true, _dirty: false, _deleted: false,
    }));
  _chRenderBody();
};

window._chDuplicatePrior = async function() {
  const priorYear = _chSt.year - 1;
  try {
    const { data, error } = await sb.from('company_holidays')
      .select('holiday_date, name, sort_order')
      .eq('year', priorYear)
      .order('holiday_date', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      alert('No holidays found for ' + priorYear + '. Nothing to duplicate.');
      return;
    }
    // Shift each holiday_date forward by exactly one year.
    // Note: this preserves the calendar date (Jul 4 → Jul 4) but NOT the
    // observed-day shift. After duplication, the admin should review the
    // list because what was "Independence Day (observed)" on Fri Jul 3, 2026
    // shouldn't be on Sat Jul 3, 2027 — it should be on the new observed day.
    // We surface this with a warning.
    _chSt.rows = data.map(r => {
      const [yStr, m, d] = r.holiday_date.split('-');
      const newDate = (_chSt.year) + '-' + m + '-' + d;
      return {
        id: null,
        holiday_date: newDate,
        name: r.name,
        sort_order: r.sort_order,
        _new: true, _dirty: false, _deleted: false,
      };
    });
    _chRenderBody();
    setTimeout(() => alert(
      'Duplicated ' + data.length + ' holidays from ' + priorYear + '. ' +
      'Please review — dates were shifted forward one year as-is; if any ' +
      'were "observed" dates that need re-shifting for the new calendar, ' +
      'edit them before saving.'
    ), 50);
  } catch (e) {
    console.error('[holidays] duplicate from prior year failed:', e);
    alert('Failed to duplicate: ' + (e.message || 'unknown error'));
  }
};

function _chUpdateButtonState() {
  // Update the dirty badge without re-rendering the entire body
  const bodyEl = document.getElementById('chBody');
  if (!bodyEl) return;
  // Find the dirty span and update it. Cheaper than full re-render and
  // keeps the user's text-input focus intact while typing.
  const dirtyCount = _chSt.rows.filter(r => r._new || r._dirty || r._deleted).length;
  // For simplicity just patch the count line (last summary div is the one with "holiday" count)
  // If we can't find it, fall through silently — full re-render isn't worth it.
  const summaryDivs = bodyEl.querySelectorAll('div');
  for (const d of summaryDivs) {
    if (d.textContent && /\d+ holiday/i.test(d.textContent) && d.style && d.style.fontSize === '11px') {
      const visible = _chSt.rows.filter(r => !r._deleted).length;
      d.innerHTML = visible + ' holiday' + (visible === 1 ? '' : 's') +
        (dirtyCount > 0
          ? `<span style="font-size:11px;color:var(--amber);margin-left:8px;">&middot; ${dirtyCount} unsaved change${dirtyCount===1?'':'s'}</span>`
          : '');
      break;
    }
  }
}

window._chSave = async function() {
  if (!currentEmployee?.isOwner) {
    alert('Only owners can edit the holiday schedule.');
    return;
  }

  // Validate before any DB writes
  const visible = _chSt.rows.filter(r => !r._deleted);
  for (const r of visible) {
    if (!r.holiday_date || !/^\d{4}-\d{2}-\d{2}$/.test(r.holiday_date)) {
      alert('A row has an invalid or empty date. Please fix before saving.');
      return;
    }
    const rowYear = parseInt(r.holiday_date.slice(0, 4), 10);
    if (rowYear !== _chSt.year) {
      alert('Row date "' + r.holiday_date + '" is not in the year ' + _chSt.year +
        '. Either change the date or switch the Year dropdown to ' + rowYear + '.');
      return;
    }
    if (!r.name || !r.name.trim()) {
      alert('A row has an empty name. Please fill in or remove it before saving.');
      return;
    }
  }
  // Check for duplicate dates within the visible set (the table has a unique
  // constraint on (year, holiday_date) — catch this before the DB does for a
  // clearer error message)
  const seen = new Set();
  for (const r of visible) {
    if (seen.has(r.holiday_date)) {
      alert('Duplicate date: ' + r.holiday_date + '. Each holiday must have a unique date.');
      return;
    }
    seen.add(r.holiday_date);
  }

  const btn = document.getElementById('chSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    // Deletes first
    const toDelete = _chSt.rows.filter(r => r._deleted && r.id);
    for (const r of toDelete) {
      const { error } = await sb.from('company_holidays').delete().eq('id', r.id);
      if (error) throw new Error('Delete failed for "' + r.name + '": ' + error.message);
    }

    // Updates
    const toUpdate = _chSt.rows.filter(r => r._dirty && !r._deleted && !r._new && r.id);
    for (const r of toUpdate) {
      const { error } = await sb.from('company_holidays').update({
        holiday_date: r.holiday_date,
        name: r.name.trim(),
        sort_order: r.sort_order,
      }).eq('id', r.id);
      if (error) throw new Error('Update failed for "' + r.name + '": ' + error.message);
    }

    // Inserts
    const toInsert = _chSt.rows
      .filter(r => r._new && !r._deleted)
      .map(r => ({
        year: _chSt.year,
        holiday_date: r.holiday_date,
        name: r.name.trim(),
        sort_order: r.sort_order,
      }));
    if (toInsert.length > 0) {
      const { error } = await sb.from('company_holidays').insert(toInsert);
      if (error) throw new Error('Insert failed: ' + error.message);
    }

    // Invalidate the in-memory holidays cache so Home card / scheduler stripes
    // / employee card chips immediately see the new data on next render.
    if (typeof window.invalidateHolidaysCache === 'function') {
      await window.invalidateHolidaysCache(_chSt.year).catch(()=>{});
    }

    // Reload our local working state from DB
    await window._companyHolidaysInit();

    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Saved';
      btn.style.background = 'var(--green)';
      btn.style.color = '#fff';
      setTimeout(() => {
        btn.textContent = 'Save changes';
        btn.style.background = 'var(--amber)';
        btn.style.color = '#0e0e0f';
      }, 1800);
    }
  } catch (e) {
    console.error('[holidays] save failed:', e);
    alert('Save failed: ' + (e.message || 'unknown error') +
      '\n\nThe holiday list may be partially saved. Reload the page to see the current state.');
    if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
  }
};

// Helper exposed for _chBuildYearOptions: list years currently in the
// holidays cache (lets the dropdown include historical edits the admin
// may have done in earlier sessions).
window._holidaysCachedYears = function() {
  // The cache itself lives in employees.js; we sniff via the keys of the
  // exposed loader's known years. Since _holidaysCache is module-scoped,
  // we don't have direct access — instead, we just trust the static set
  // (current + 2). If the admin needs to edit a year far back, they can
  // type in the URL query string in the future. For now this is fine.
  return [];
};

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

