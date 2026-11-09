// ==============================================================
// js/attachments.js — files attached to a record (Batch 3, Nov 2026)
// ==============================================================
// Scanned delivery paperwork, photos of box labels, cal certs, etc.,
// attached to the record they belong to instead of filed in folders.
//
// Used on: test articles (Shipping & Receiving), packing lists, LOA
// calibration records. Purchase orders later.
//
// Storage: private bucket 'record-attachments' (25 MB/file, PDFs + images),
// opened through short-lived signed URLs. Rows: public.attachments
// (record_type, record_id). Migration 2026-11-09_batch3_incoming_attachments.sql.
// These are calibration and shipping/receiving documents — not CMMC test
// documents (Russ, Nov 5).
//
// Delete: Setup → Permissions → "Delete Attachments" (delete_attachments).
//
// Usage: put an empty <div id="x"></div> in the page, then
//   attMount('packing_list', recordId, 'x', { canAdd: true })
// ==============================================================

const ATT_BUCKET = 'record-attachments';
const ATT_MAX_BYTES = 25 * 1024 * 1024;
const ATT_ACCEPT = 'application/pdf,image/*';
const _attMounts = {};   // elId -> { type, id, canAdd }

function attEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function attToast(m) { if (typeof toast === 'function') toast(m); }
function attCanDelete() { return typeof can === 'function' && can('delete_attachments'); }
function attSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function attIcon(a) {
  const t = (a.content_type || '').toLowerCase(), n = (a.file_name || '').toLowerCase();
  if (t === 'application/pdf' || n.endsWith('.pdf')) return '&#x1F4C4;';
  if (t.startsWith('image/')) return '&#x1F5BC;';
  return '&#x1F4CE;';
}

// Draw the attachments box for a record into element elId.
async function attMount(type, id, elId, opts) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!id || String(id).startsWith('local-')) {
    el.innerHTML = '<div class="att-empty">Save first, then attach files here.</div>';
    return;
  }
  _attMounts[elId] = { type, id: String(id), canAdd: opts?.canAdd !== false };
  el.innerHTML = '<div class="att-empty">Loading attachments…</div>';
  await attRefresh(elId);
}

async function attRefresh(elId) {
  const m = _attMounts[elId], el = document.getElementById(elId);
  if (!m || !el) return;
  const { data, error } = await sb.from('attachments').select('*')
    .eq('record_type', m.type).eq('record_id', m.id).order('uploaded_at');
  if (error) { console.error('[attachments] load', error); el.innerHTML = '<div class="att-empty">Could not load attachments.</div>'; return; }
  const rows = data || [];
  const del = attCanDelete();
  el.innerHTML = `
    <div class="att-list">
      ${rows.map(a => `<div class="att-row">
        <span class="att-ico">${attIcon(a)}</span>
        <a class="att-name" onclick="attOpen('${a.id}','${elId}')" title="Open">${attEsc(a.file_name)}</a>
        <span class="att-meta">${attSize(a.size_bytes)}${a.uploaded_by_name ? ' · ' + attEsc(a.uploaded_by_name) : ''} · ${
          new Date(a.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        ${del ? `<button type="button" class="att-del" title="Delete" onclick="attDelete('${a.id}','${elId}')">&#x2715;</button>` : ''}
      </div>`).join('') || '<div class="att-empty">No attachments yet.</div>'}
    </div>
    ${m.canAdd ? `<label class="att-add">
      <input type="file" multiple accept="${ATT_ACCEPT}" onchange="attUpload(this,'${elId}')" />
      &#x1F4CE; Attach file <span class="att-hint">PDF or photo · up to 25 MB each</span></label>` : ''}`;
  el._attRows = rows;
  // Lets lists keep a 📎 count badge current after uploads/deletes.
  document.dispatchEvent(new CustomEvent('att:changed', { detail: { type: m.type, id: m.id, count: rows.length } }));
}

async function attUpload(input, elId) {
  const m = _attMounts[elId];
  const files = [...(input.files || [])];
  input.value = '';
  if (!m || !files.length) return;
  const emp = (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee : null;
  const box = document.getElementById(elId);
  const label = box?.querySelector('.att-add');
  if (label) label.classList.add('busy');
  let ok = 0;
  for (const file of files) {
    if (file.size > ATT_MAX_BYTES) { attToast('⚠ ' + file.name + ' is over 25 MB — skipped'); continue; }
    const t = (file.type || '').toLowerCase();
    if (t && t !== 'application/pdf' && !t.startsWith('image/')) { attToast('⚠ ' + file.name + ': only PDFs and images'); continue; }
    const safe = (file.name || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
    const uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(36).slice(2);
    const path = `${m.type}/${m.id}/${uid}_${safe}`;
    const up = await sb.storage.from(ATT_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error) { console.error('[attachments] upload', up.error); attToast('⚠ Upload failed: ' + file.name + ' — ' + up.error.message); continue; }
    const { error } = await sb.from('attachments').insert({
      record_type: m.type, record_id: m.id, file_name: file.name || safe, storage_path: path,
      content_type: file.type || null, size_bytes: file.size,
      uploaded_by: emp?.id || null, uploaded_by_name: emp?.name || null,
    });
    if (error) {
      console.error('[attachments] row', error);
      attToast('⚠ Could not save ' + file.name + ' — ' + error.message);
      try { await sb.storage.from(ATT_BUCKET).remove([path]); } catch (e) {}
      continue;
    }
    ok++;
  }
  if (ok) attToast('📎 ' + ok + ' file' + (ok !== 1 ? 's' : '') + ' attached');
  await attRefresh(elId);
}

async function attOpen(attId, elId) {
  const a = (document.getElementById(elId)?._attRows || []).find(r => r.id === attId);
  if (!a) return;
  const isPdf = (a.content_type || '').toLowerCase() === 'application/pdf' || (a.file_name || '').toLowerCase().endsWith('.pdf');
  if (isPdf && typeof openPdfViewer === 'function') {
    openPdfViewer({ bucket: ATT_BUCKET, path: a.storage_path, filename: a.file_name, title: a.file_name });
    return;
  }
  const { data, error } = await sb.storage.from(ATT_BUCKET).createSignedUrl(a.storage_path, 3600);
  if (error || !data?.signedUrl) { console.error('[attachments] open', error); attToast('⚠ Could not open file'); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

async function attDelete(attId, elId) {
  if (!attCanDelete()) return;
  const a = (document.getElementById(elId)?._attRows || []).find(r => r.id === attId);
  if (!a || !confirm('Delete "' + a.file_name + '"?\n\nThis removes the file for everyone.')) return;
  const { error } = await sb.from('attachments').delete().eq('id', attId);
  if (error) { console.error('[attachments] delete', error); attToast('⚠ Could not delete: ' + error.message); return; }
  try { await sb.storage.from(ATT_BUCKET).remove([a.storage_path]); } catch (e) { console.warn('[attachments] storage cleanup', e); }
  attToast('Attachment deleted');
  await attRefresh(elId);
}

// How many files a set of records has — for 📎 badges in lists. Returns { record_id: n }.
async function attCounts(type, ids) {
  const out = {};
  const list = (ids || []).map(String).filter(Boolean);
  if (!list.length) return out;
  const { data, error } = await sb.from('attachments').select('record_id').eq('record_type', type).in('record_id', list);
  if (error) return out;
  (data || []).forEach(r => { out[r.record_id] = (out[r.record_id] || 0) + 1; });
  return out;
}

window.attMount = attMount;
window.attCounts = attCounts;
