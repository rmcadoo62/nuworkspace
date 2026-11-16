// ===== EMI LAYOUT AUDIT (NUForce) =====
// Shows Jordan's self-contained "NU EMI Layout (audit)" page inside Workspace
// so reviewers can use it without being handed the HTML file.
//
// The HTML lives in the PRIVATE Supabase Storage bucket `nuforce-tools`
// (see 2026-11-16_emi_audit_bucket.sql). Storage RLS only lets a signed-in
// employee whose role has the view_emi_audit capability download it, and the
// nav item is gated by the same capability in applyPermissions() (auth.js).
//
// It renders in a sandboxed iframe via srcdoc:
//   - no allow-same-origin, so the page can't reach Workspace's session,
//     localStorage or cookies. Its own localStorage calls are all wrapped in
//     try/catch, so edits work for the visit but are not kept on reload.
//   - srcdoc (not a blob: URL) so there is no URL to open in a new tab and save.
// To publish a new version from Jordan: upload it over the same object
// (bucket nuforce-tools, path emi-layout-audit.html) in the Supabase dashboard.

const EMI_AUDIT_BUCKET = 'nuforce-tools';
const EMI_AUDIT_PATH   = 'emi-layout-audit.html';

let _emiAuditLoaded = false;

async function openEmiAuditPanel(navEl) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  (navEl || document.getElementById('navEmiAudit'))?.classList.add('active');
  if (typeof activeProjectId !== 'undefined') activeProjectId = null;
  const tb = document.getElementById('topbarName');
  if (tb) tb.textContent = 'EMI Layout Audit';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-emiaudit')?.classList.add('active');

  if (typeof can === 'function' && !can('view_emi_audit')) {
    _emiAuditMsg("You don't have access to the EMI Layout Audit.");
    return;
  }
  if (_emiAuditLoaded) return;   // keep the reviewer's in-progress edits when they come back
  await _emiAuditLoad();
}

async function _emiAuditLoad() {
  const frame = document.getElementById('emiAuditFrame');
  if (!frame) return;
  _emiAuditMsg('Loading…');
  try {
    const { data, error } = await sb.storage.from(EMI_AUDIT_BUCKET).download(EMI_AUDIT_PATH);
    if (error || !data) throw error || new Error('No file returned');
    const html = await data.text();
    frame.srcdoc = html;
    frame.style.display = 'block';
    document.getElementById('emiAuditMsg').style.display = 'none';
    _emiAuditLoaded = true;
    try {
      if (currentEmployee) {
        sb.from('activity_log').insert({
          employee_id: currentEmployee.id, employee_name: currentEmployee.name,
          record_type: 'auth', record_id: null, record_label: 'EMI Layout Audit',
          field_changed: 'emi_audit_open', old_value: null, new_value: 'opened'
        }).then(() => {}, () => {});
      }
    } catch (_) { /* logging never blocks */ }
  } catch (e) {
    console.error('[emi-audit] load failed:', e);
    _emiAuditMsg("Couldn't load the EMI layout. Ask Russ to check that it's uploaded and that your role has EMI Layout Audit ticked.");
  }
}

function reloadEmiAudit() {
  if (!confirm('Reload the EMI layout? Any changes you made in it will be lost.')) return;
  _emiAuditLoaded = false;
  _emiAuditLoad();
}

function _emiAuditMsg(text) {
  const m = document.getElementById('emiAuditMsg');
  const f = document.getElementById('emiAuditFrame');
  if (f) f.style.display = 'none';
  if (m) { m.textContent = text; m.style.display = 'block'; }
}

window.openEmiAuditPanel = openEmiAuditPanel;
window.reloadEmiAudit = reloadEmiAudit;
