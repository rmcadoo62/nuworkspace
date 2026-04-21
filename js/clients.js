
// ===== CLIENTS PANEL =====
// ===== CLIENTS PANEL =====

// ===== SHIPPING & RECEIVING =====
// ===== SHIPPING & RECEIVING =====
let articleStore = []; // loaded at startup
let _editingArticleId = null;
let _articleProjId = null;
let _showArchivedShipping = false;

function mapArticle(r) {
  // Auto-derive status for legacy rows that don't have one set yet:
  //   shipped_date present → 'shipped'
  //   otherwise            → 'in_house'
  // New rows will always have an explicit status saved from the modal.
  const derived = r.shipped_date ? 'shipped' : 'in_house';
  return {
    _id: r.id, projId: r.project_id,
    clientId: r.client_id||null,
    clientName: r.client_name||'',
    desc: r.description||'',
    receivedDate: r.received_date||'',
    receivedBy: r.received_by||'',
    shippedDate: r.shipped_date||'',
    carrier: r.carrier||'',
    notes: r.notes||'',
    status: r.status || derived,
    createdAt: r.created_at ? r.created_at.split('T')[0] : '',
  };
}

function openShippingPanel(el) {
  activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('topbarName').textContent = 'Shipping & Receiving';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-shipping').classList.add('active');
  renderShippingGlobal();
}

function renderShippingGlobal() {
  const el = document.getElementById('shippingGlobalBody');
  if (!el) return;
  const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  // Determine archive cutoff: shipped 30+ days ago.
  // Only 'shipped' items can be archived — in-storage items stay visible indefinitely.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const isArchived = a => a.status === 'shipped' && !!a.shippedDate && a.shippedDate < cutoffStr;

  const inHouseCount   = articleStore.filter(a => a.status === 'in_house').length;
  const inStorageCount = articleStore.filter(a => a.status === 'in_storage').length;
  const archivedCount  = articleStore.filter(isArchived).length;
  const totalCount     = articleStore.length;

  // Active = anything except archived
  const visible = _showArchivedShipping
    ? [...articleStore]
    : articleStore.filter(a => !isArchived(a));

  // Sort: in_house → in_storage → shipped, then by received date desc within each group
  const statusRank = { in_house: 0, in_storage: 1, shipped: 2 };
  visible.sort((a,b) => {
    const ra = statusRank[a.status] ?? 3, rb = statusRank[b.status] ?? 3;
    if (ra !== rb) return ra - rb;
    return (b.receivedDate||'').localeCompare(a.receivedDate||'');
  });

  // Build the status badge for a row.
  const statusBadge = a => {
    if (a.status === 'in_house')   return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(46,158,98,0.15);color:#2e9e62;border:1px solid rgba(46,158,98,0.3)">📦 In House</span>';
    if (a.status === 'in_storage') return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:#e8a234;border:1px solid rgba(232,162,52,0.3)">🗃 In Storage</span>';
    // shipped — archived variant when old enough
    if (isArchived(a))             return '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)">🗄 Archived</span>';
    return '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)">🚚 Shipped</span>';
  };

  const rows = visible.length === 0
    ? `<tr><td colspan="9"><div style="text-align:center;padding:60px;color:var(--muted)"><div style="font-size:36px;margin-bottom:12px">📦</div><div>No articles logged yet.</div></div></td></tr>`
    : visible.map(a => {
        const proj     = projects.find(p => p.id === a.projId);
        const archived = isArchived(a);
        const rowStyle = archived ? 'opacity:0.6;' : '';
        return `<tr style="border-bottom:1px solid var(--border);${rowStyle}"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
          <td style="padding:10px 14px">${statusBadge(a)}</td>
          <td style="padding:10px 14px;font-size:13.5px;font-weight:500;color:var(--text)">${a.desc}</td>
          <td style="padding:10px 14px;font-size:12px;">${proj ? `<span onclick="navToProject('${a.projId}')" style="color:var(--amber);cursor:pointer;font-weight:600;white-space:nowrap" title="Go to project">${proj.emoji} ${proj.name}</span>` : '—'}</td>
          <td style="padding:10px 14px;font-size:12px;color:var(--muted)">${a.clientName || (proj ? '' : '—')}</td>
          <td style="padding:10px 14px;font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace">${fmt(a.receivedDate)}</td>
          <td style="padding:10px 14px;font-size:12px;color:var(--muted)">${a.receivedBy||'—'}</td>
          <td style="padding:10px 14px;font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace">${a.shippedDate ? fmt(a.shippedDate) : '—'}</td>
          <td style="padding:10px 14px;font-size:12px;color:var(--muted)">${a.carrier||'—'}</td>
          <td style="padding:6px 10px;text-align:right"><button onclick="openArticleModal('${a._id}','${a.projId}')" style="background:transparent;border:1.5px solid var(--border);border-radius:6px;color:var(--muted);font-size:11px;padding:4px 10px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s" onmouseover="this.style.borderColor='var(--amber-dim)';this.style.color='var(--amber)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">&#x270E; Edit</button></td>
        </tr>`;
      }).join('');

  const archiveBtnLabel = _showArchivedShipping
    ? `Hide Archived`
    : `🗄 Show Archived (${archivedCount})`;
  const archiveBtnStyle = `background:var(--surface2);border:1.5px solid var(--border);color:var(--muted);`;

  // Header stats — only show in-house / in-storage lines if they have any items
  const statsParts = [];
  if (inHouseCount   > 0) statsParts.push(`${inHouseCount} in house`);
  if (inStorageCount > 0) statsParts.push(`${inStorageCount} in storage`);
  statsParts.push(`${totalCount - archivedCount} active`);
  statsParts.push(`${archivedCount} archived`);

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--text)">📦 Shipping & Receiving</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${statsParts.join(' · ')}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        ${archivedCount > 0 ? `<button onclick="_showArchivedShipping=!_showArchivedShipping;renderShippingGlobal()"
          style="${archiveBtnStyle}border-radius:8px;font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s"
          onmouseover="this.style.borderColor='var(--amber-dim)';this.style.color='var(--amber)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">${archiveBtnLabel}</button>` : ''}
        <button class="btn btn-primary" onclick="openArticleModal(null,null)">+ Log Article</button>
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--surface2)">
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Status</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Article</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Project</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Client</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Received</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Received By</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Shipped</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:left">Carrier</th>
            <th style="padding:9px 14px;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);text-align:right"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderShippingProjTab(projId) {
  const el = document.getElementById('shippingProjWrap');
  if (!el) return;
  const fmt = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  const statusRank = { in_house: 0, in_storage: 1, shipped: 2 };
  const articles = articleStore.filter(a => a.projId === projId)
    .sort((a,b) => {
      const ra = statusRank[a.status] ?? 3, rb = statusRank[b.status] ?? 3;
      if (ra !== rb) return ra - rb;
      return (b.receivedDate||'').localeCompare(a.receivedDate||'');
    });
  const inHouseCount   = articles.filter(a => a.status === 'in_house').length;
  const inStorageCount = articles.filter(a => a.status === 'in_storage').length;

  const cards = articles.length === 0
    ? `<div style="text-align:center;padding:60px;color:var(--muted)"><div style="font-size:36px;margin-bottom:12px">📦</div><div>No articles logged for this project yet.</div></div>`
    : articles.map(a => {
        const status = a.status || 'in_house';
        const icon        = status === 'in_house' ? '📦' : status === 'in_storage' ? '🗃' : '🚚';
        const borderColor = status === 'in_house' ? 'rgba(46,158,98,0.4)' : status === 'in_storage' ? 'rgba(232,162,52,0.4)' : 'var(--border)';
        const badge = status === 'in_house'
          ? '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;background:rgba(46,158,98,0.15);color:#2e9e62;border:1px solid rgba(46,158,98,0.3);flex-shrink:0">In House</span>'
          : status === 'in_storage'
            ? '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px;background:rgba(232,162,52,0.15);color:#e8a234;border:1px solid rgba(232,162,52,0.3);flex-shrink:0">In Storage</span>'
            : '<span style="font-size:10px;font-weight:600;padding:3px 10px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border);flex-shrink:0">Shipped</span>';
        return `<div style="background:var(--surface);border:1px solid ${borderColor};border-radius:10px;padding:16px 20px;margin-bottom:10px;display:flex;align-items:center;gap:16px;cursor:pointer;transition:all .15s"
          onclick="openArticleModal('${a._id}','${projId}')"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='var(--surface)'">
          <div style="font-size:24px;flex-shrink:0">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">${a.desc}</div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--muted)">
              <span>📥 Received ${fmt(a.receivedDate)}${a.receivedBy ? ' by '+a.receivedBy : ''}</span>
              ${a.shippedDate ? `<span>📤 Shipped ${fmt(a.shippedDate)}${a.carrier ? ' via '+a.carrier : ''}</span>` : ''}
              ${a.notes ? `<span>📝 ${a.notes}</span>` : ''}
            </div>
          </div>
          ${badge}
        </div>`;
      }).join('');

  // Header counts — show whichever statuses have items
  const headerParts = [];
  if (inHouseCount   > 0) headerParts.push(`<span style="color:#2e9e62;font-weight:600">${inHouseCount} in house</span>`);
  if (inStorageCount > 0) headerParts.push(`<span style="color:#e8a234;font-weight:600">${inStorageCount} in storage</span>`);
  const headerLine = headerParts.length > 0
    ? `<div style="font-size:12px;margin-top:2px">${headerParts.join(' · ')}</div>`
    : `<div style="font-size:12px;color:var(--muted);margin-top:2px">${articles.length} article${articles.length!==1?'s':''} logged</div>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <div style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--text)">📦 Shipping & Receiving</div>
        ${headerLine}
      </div>
      <button class="btn btn-primary" onclick="openArticleModal(null,'${projId}')">+ Log Article</button>
    </div>
    ${cards}`;
}

function openArticleModal(articleId, projId) {
  _editingArticleId = articleId || null;
  _articleProjId = projId || null;

  const a = articleId ? articleStore.find(x => x._id === articleId) : null;
  document.getElementById('articleModalTitle').textContent = a ? 'Edit Test Article' : 'Receive Test Article';
  document.getElementById('articleDeleteBtn').style.display = a ? 'inline-flex' : 'none';
  document.getElementById('articleDesc').value = a ? a.desc : '';
  document.getElementById('articleReceivedDate').value = a ? a.receivedDate : new Date().toISOString().split('T')[0];
  document.getElementById('articleShippedDate').value = a ? a.shippedDate : '';
  document.getElementById('articleCarrier').value = a ? a.carrier : '';
  document.getElementById('articleNotes').value = a ? a.notes : '';
  // Status dropdown — defaults to 'in_house' for new records.
  const statusEl = document.getElementById('articleStatus');
  if (statusEl) statusEl.value = a ? (a.status || 'in_house') : 'in_house';

  // Project picker — show when no project context (global panel) or editing
  const projField = document.getElementById('articleProjField');
  const projSel   = document.getElementById('articleProjSelect');
  const effectiveProjId = projId || (a ? a.projId : null);
  const openProjects = projects.filter(p => (projectInfo[p.id]||{}).status !== 'closed')
    .sort((a,b) => a.name.localeCompare(b.name));

  // If the article is tied to a CLOSED project, include that project at the
  // top of the dropdown (flagged "(closed)") so the current linkage is
  // visible and editable on historical records. Without this, editing an
  // article from a closed project shows "— Select Project —" even though
  // the link is intact.
  const closedCurrent = effectiveProjId && !openProjects.find(p => p.id === effectiveProjId)
    ? projects.find(p => p.id === effectiveProjId)
    : null;
  const dropdownProjects = closedCurrent ? [closedCurrent, ...openProjects] : openProjects;

  projSel.innerHTML = '<option value="">— Select Project —</option>' +
    dropdownProjects.map(p => {
      const isClosed = closedCurrent && p.id === closedCurrent.id;
      return `<option value="${p.id}" ${effectiveProjId===p.id?'selected':''}>${p.emoji} ${p.name}${isClosed ? ' (closed)' : ''}</option>`;
    }).join('');
  // Hide picker only when opening from within a project tab (projId locked)
  projField.style.display = projId && !articleId ? 'none' : '';

  // Populate received-by dropdown
  const sel = document.getElementById('articleReceivedBy');
  sel.innerHTML = '<option value="">— Select —</option>' +
    employees.filter(e => e.isActive !== false).map(e =>
      `<option value="${e.name}" ${a && a.receivedBy===e.name ? 'selected' : ''}>${e.name}</option>`
    ).join('');

  // Populate client picker
  const clientSearch = document.getElementById('articleClientSearch');
  const clientIdInp  = document.getElementById('articleClientId');
  if (clientSearch && clientIdInp) {
    if (a) {
      // Editing existing article — use its saved client
      const existingClient = clientStore.find(c => c.id === a.clientId);
      clientSearch.value = existingClient ? existingClient.name : (a.clientName || '');
      clientIdInp.value  = a.clientId || '';
    } else if (projId) {
      // New article from within a project — auto-fill the project's client
      const info = projectInfo[projId] || {};
      const projClient = info.clientId ? clientStore.find(c => c.id === info.clientId) : null;
      clientSearch.value = projClient ? projClient.name : (info.client || '');
      clientIdInp.value  = info.clientId || '';
    } else {
      clientSearch.value = '';
      clientIdInp.value  = '';
    }
  }

  document.getElementById('articleModal').classList.add('open');
  setTimeout(() => document.getElementById('articleDesc').focus(), 80);
}

function closeArticleModal() {
  document.getElementById('articleModal').classList.remove('open');
  _editingArticleId = null;
}

// Auto-link shipped date → status.
// Filling in a shipped date flips status to 'shipped' (no need to also
// change the dropdown); clearing the date reverts status to 'in_house'.
// If the user explicitly set 'in_storage', we still flip to 'shipped' when
// a date is entered — a shipped date is a strong enough signal that the
// item has actually left the building.
function articleShippedDateChanged() {
  const dateEl   = document.getElementById('articleShippedDate');
  const statusEl = document.getElementById('articleStatus');
  if (!dateEl || !statusEl) return;
  if (dateEl.value) {
    if (statusEl.value !== 'shipped') statusEl.value = 'shipped';
  } else {
    if (statusEl.value === 'shipped') statusEl.value = 'in_house';
  }
}

async function saveArticle() {
  const desc = document.getElementById('articleDesc').value.trim();
  if (!desc) {
    const inp = document.getElementById('articleDesc');
    inp.style.borderColor = 'var(--red)'; setTimeout(() => inp.style.borderColor='', 1800);
    return;
  }

  // Resolve project — use picker value if visible, otherwise use locked _articleProjId
  const projField = document.getElementById('articleProjField');
  const projSel   = document.getElementById('articleProjSelect');
  const resolvedProjId = (projField.style.display !== 'none' ? projSel.value : null) || _articleProjId;
  const hasClient = document.getElementById('articleClientId')?.value || document.getElementById('articleClientSearch')?.value.trim();
  if (!resolvedProjId && !hasClient) {
    projSel.style.borderColor = 'var(--red)'; setTimeout(() => projSel.style.borderColor='', 1800);
    toast('⚠ Please select a project or client'); return;
  }

  const clientId   = document.getElementById('articleClientId')?.value || null;
  const clientName = document.getElementById('articleClientSearch')?.value.trim() || '';
  const resolvedClient = clientStore.find(c => c.id === clientId);

  const payload = {
    project_id:    resolvedProjId || null,
    client_id:     clientId || null,
    client_name:   resolvedClient ? resolvedClient.name : clientName || null,
    description:   desc,
    received_date: document.getElementById('articleReceivedDate').value || null,
    received_by:   document.getElementById('articleReceivedBy').value || null,
    shipped_date:  document.getElementById('articleShippedDate').value || null,
    carrier:       document.getElementById('articleCarrier').value || null,
    notes:         document.getElementById('articleNotes').value.trim() || null,
    status:        document.getElementById('articleStatus')?.value || 'in_house',
  };

  if (_editingArticleId) {
    const oldArticle = articleStore.find(a => a._id === _editingArticleId);
    if (sb) {
      const { error } = await sb.from('test_articles').update(payload).eq('id', _editingArticleId);
      if (error) { toast('⚠ Save error: ' + error.message); return; }
    }
    const idx = articleStore.findIndex(a => a._id === _editingArticleId);
    if (idx > -1) articleStore[idx] = { ...articleStore[idx], ...mapArticle({ id: _editingArticleId, ...payload, created_at: articleStore[idx].createdAt }) };
    // Log shipped event if shipped date was just set
    if (payload.shipped_date && (!oldArticle || !oldArticle.shippedDate)) {
      const projLabel = projects.find(p => p.id === resolvedProjId)?.name || desc;
      logActivity('shipping', _editingArticleId, projLabel, `📤 Shipped: ${desc}${payload.carrier ? ' via ' + payload.carrier : ''}`);
    }
    // Log received date change if it was updated
    if (oldArticle && payload.received_date && payload.received_date !== oldArticle.receivedDate) {
      const projLabel = projects.find(p => p.id === resolvedProjId)?.name || desc;
      logActivity('shipping', _editingArticleId, projLabel, `📥 Received date updated: ${desc}`);
    }
    toast('Article updated');
  } else {
    if (sb) {
      const { data, error } = await sb.from('test_articles').insert(payload).select().single();
      if (error) { toast('⚠ Save error: ' + error.message); return; }
      if (data) {
        articleStore.push(mapArticle(data));
        // Log received event for new article
        const projLabel = projects.find(p => p.id === resolvedProjId)?.name || desc;
        logActivity('shipping', data.id, projLabel, `📥 Received: ${desc}${payload.received_by ? ' — received by ' + payload.received_by : ''}`);
      }
    } else {
      articleStore.push({ _id: 'local-'+Date.now(), projId: resolvedProjId, desc, receivedDate: payload.received_date||'', receivedBy: payload.received_by||'', shippedDate: payload.shipped_date||'', carrier: payload.carrier||'', notes: payload.notes||'', status: payload.status, createdAt: new Date().toISOString().split('T')[0] });
    }
    toast('📦 Article logged');
  }

  closeArticleModal();
  // Refresh whichever view is active
  const activeProjId = resolvedProjId || activeProjectId;
  if (document.getElementById('panel-shipping')?.classList.contains('active')) renderShippingGlobal();
  if (document.getElementById('sub-shipping')?.classList.contains('active') && activeProjId) renderShippingProjTab(activeProjId);
  if (activeProjId) renderInfoSheet(activeProjId);
}

async function deleteArticle() {
  if (!_editingArticleId) return;
  if (!confirm('Delete this article record? This cannot be undone.')) return;
  if (sb) {
    const { error } = await sb.from('test_articles').delete().eq('id', _editingArticleId);
    if (error) { toast('⚠ Delete error'); return; }
  }
  articleStore = articleStore.filter(a => a._id !== _editingArticleId);
  toast('Article deleted');
  closeArticleModal();
  const activeProjId = activeProjectId;
  if (document.getElementById('panel-shipping')?.classList.contains('active')) renderShippingGlobal();
  if (activeProjId) { renderShippingProjTab(activeProjId); renderInfoSheet(activeProjId); }
}

function articleClientFilter(q) {
  const drop = document.getElementById('articleClientDrop');
  const idInp = document.getElementById('articleClientId');
  if (!drop) return;
  const matches = clientStore.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (!matches.length) { drop.style.display = 'none'; return; }
  drop.innerHTML = matches.map(c =>
    '<div style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid var(--border)" ' +
    'onmousedown="articlePickClient(\'' + c.id + '\',\'' + c.name.replace(/'/g,"\\'") + '\')"' +
    'onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">' +
    c.name + '</div>'
  ).join('');
  drop.style.display = '';
}

function articlePickClient(id, name) {
  document.getElementById('articleClientId').value = id;
  document.getElementById('articleClientSearch').value = name;
  document.getElementById('articleClientDrop').style.display = 'none';
}

function openClientsPanel(el) {
  activeProjectId = null;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('topbarName').textContent = 'Clients';
  
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-clients').classList.add('active');
  renderClientsPanel('');
}

let _clientSearchQuery = '';

function renderClientsPanel(search) {
  if (search !== undefined) _clientSearchQuery = search;
  const q = _clientSearchQuery.toLowerCase();
  const filtered = clientStore.filter(c => c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const body = document.getElementById('clientsPanelBody');
  if (!body) return;

  // Save focus state so we can restore it after re-render (prevents single-char typing bug)
  const searchEl = body.querySelector('.emp-search');
  const wasFocused = searchEl && document.activeElement === searchEl;
  const selStart = wasFocused ? searchEl.selectionStart : null;
  const selEnd   = wasFocused ? searchEl.selectionEnd   : null;

  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colors = ['#c07a1a','#3a7fd4','#2e9e62','#7c5cbf','#d04040','#2d8a6e'];

  body.innerHTML = `
    <div class="emp-panel-header">
      <div class="emp-panel-title">Clients <span style="font-size:14px;color:var(--muted);font-family:'JetBrains Mono',monospace;font-weight:400">(${clientStore.length})</span></div>
      <input class="emp-search" placeholder="Search clients…" value="${_clientSearchQuery}" oninput="_clientSearchQuery=this.value;renderClientsPanel()" />
      ${can('add_clients') ? `<button class="emp-add-btn" style="background:var(--surface2);border:1.5px solid var(--border);color:var(--text);margin-right:8px" onclick="openSfImportPanel()" title="Import or backfill from a Salesforce CSV export">📥 Import CSV</button>` : ''}
      ${can('add_clients') ? `<button class="emp-add-btn" onclick="openNewClientDrawer()">+ Add Client</button>` : ''}
    </div>
    <div class="client-grid">
      ${filtered.map(c => {
        const contacts = contactStore.filter(ct => ct.clientId === c.id);
        const jobs = projects.filter(p => (projectInfo[p.id]||{}).clientId === c.id);
        const initials = c.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();
        const color = colors[Math.abs(c.name.split('').reduce((a,ch)=>a+ch.charCodeAt(0),0)) % colors.length];
        return `<div class="client-card" onclick="openClientDrawer('${c.id}')">
          <div class="client-actions">
            <button class="client-action-btn" onclick="event.stopPropagation();openClientDrawer('${c.id}')" title="Edit">&#x270E;</button>
            ${can('delete_clients') ? `<button class="client-action-btn" onclick="event.stopPropagation();deleteClient('${c.id}')" title="Delete" style="color:var(--muted)">&#x2715;</button>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div>
              <div class="client-name" style="margin-bottom:0">${esc(c.name)}</div>
              ${c.city||c.state ? `<div style="font-size:11px;color:var(--muted)">${esc([c.city,c.state].filter(Boolean).join(', '))}</div>` : ''}
            </div>
          </div>
          ${c.phone ? `<div style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:5px">📞 ${esc(c.phone)}</div>` : ''}
          ${c.website ? `<div style="font-size:12px;color:var(--blue);display:flex;align-items:center;gap:5px">🌐 ${esc(c.website)}</div>` : ''}
          <div style="display:flex;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <div style="font-size:11px;color:var(--muted)">👤 <strong style="color:var(--text)">${contacts.length}</strong> contact${contacts.length!==1?'s':''}</div>
            <div style="font-size:11px;color:var(--muted)">📁 <strong style="color:var(--text)">${jobs.length}</strong> job${jobs.length!==1?'s':''}</div>
          </div>
        </div>`;
      }).join('')}
      ${filtered.length === 0 ? `<div style="color:var(--muted);font-size:13px;padding:20px 0">No clients yet — add one above.</div>` : ''}
    </div>`;

  // Restore focus and cursor position if the search input was active before re-render
  if (wasFocused) {
    const newSearchEl = body.querySelector('.emp-search');
    if (newSearchEl) {
      newSearchEl.focus();
      newSearchEl.setSelectionRange(selStart, selEnd);
    }
  }
}


// ===== CLIENT DETAIL DRAWER =====
// ===== CLIENT DETAIL DRAWER =====
let _clientDrawerId = null;
let _clientDrawerTab = 'dtab-info';

function openNewClientDrawer() {
  _clientDrawerId = null;
  _clientDrawerTab = 'dtab-info';
  document.getElementById('clientDrawerTitle').textContent = 'New Client';
  document.getElementById('clientSaveBar').style.display = 'flex';
  const delBtn = document.getElementById('clientDeleteBtn');
  if (delBtn) delBtn.style.display = 'none';
  switchClientDrawerTab(document.querySelector('.client-dtab[data-dtab="dtab-info"]'), true);
  renderClientDrawerBody();
  document.getElementById('clientDrawer').classList.add('open');
  document.getElementById('clientDrawerBackdrop').classList.add('open');
  setTimeout(() => document.getElementById('cdName')?.focus(), 100);
}

function openClientDrawer(id) {
  _clientDrawerId = id;
  _clientDrawerTab = 'dtab-info';
  const c = clientStore.find(x => x.id === id);
  if (!c) return;
  document.getElementById('clientDrawerTitle').textContent = c.name;
  document.getElementById('clientSaveBar').style.display = 'flex';
  const delBtn = document.getElementById('clientDeleteBtn');
  if (delBtn) delBtn.style.display = can('delete_clients') ? 'inline-flex' : 'none';
  document.querySelectorAll('.client-dtab').forEach(t => t.classList.remove('active'));
  document.querySelector('.client-dtab[data-dtab="dtab-info"]').classList.add('active');
  renderClientDrawerBody();
  document.getElementById('clientDrawer').classList.add('open');
  document.getElementById('clientDrawerBackdrop').classList.add('open');
}

function closeClientDrawer() {
  document.getElementById('clientDrawer').classList.remove('open');
  document.getElementById('clientDrawerBackdrop').classList.remove('open');
}

function switchClientDrawerTab(el, silent) {
  if (!el) return;
  document.querySelectorAll('.client-dtab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _clientDrawerTab = el.dataset.dtab;
  if (!silent) renderClientDrawerBody();
}

function renderClientDrawerBody() {
  const body = document.getElementById('clientDrawerBody');
  const c = _clientDrawerId ? clientStore.find(x => x.id === _clientDrawerId) : null;

  if (_clientDrawerTab === 'dtab-info') {
    body.innerHTML = `
      <div class="client-detail-section">
        <div class="client-detail-section-title">Company</div>
        <div class="client-field" style="margin-bottom:10px">
          <label>Company Name *</label>
          <input class="full" id="cdName" type="text" value="${(c?.name||'').replace(/"/g,'&quot;')}" placeholder="Company name" />
        </div>
        <div class="client-field-row">
          <div class="client-field"><label>Phone</label><input id="cdPhone" type="text" value="${(c?.phone||'').replace(/"/g,'&quot;')}" placeholder="+1 (555) 000-0000" /></div>
          <div class="client-field"><label>Website</label><input id="cdWebsite" type="text" value="${(c?.website||'').replace(/"/g,'&quot;')}" placeholder="www.example.com" /></div>
        </div>
      </div>
      <div class="client-detail-section">
        <div class="client-detail-section-title">Address</div>
        <div class="client-field" style="margin-bottom:10px">
          <label>Street Address</label>
          <input class="full" id="cdAddress" type="text" value="${(c?.address||'').replace(/"/g,'&quot;')}" placeholder="123 Main St" />
        </div>
        <div class="client-field-row">
          <div class="client-field"><label>City</label><input id="cdCity" type="text" value="${(c?.city||'').replace(/"/g,'&quot;')}" placeholder="City" /></div>
          <div class="client-field"><label>State</label><input id="cdState" type="text" value="${(c?.state||'').replace(/"/g,'&quot;')}" placeholder="NJ" /></div>
        </div>
        <div class="client-field" style="max-width:140px">
          <label>ZIP</label>
          <input id="cdZip" type="text" value="${(c?.zip||'').replace(/"/g,'&quot;')}" placeholder="00000" />
        </div>
      </div>
      <div class="client-detail-section">
        <div class="client-detail-section-title">Notes</div>
        <div class="client-field">
          <textarea class="full" id="cdNotes" placeholder="Internal notes about this client…">${c?.notes||''}</textarea>
        </div>
      </div>`;

  } else if (_clientDrawerTab === 'dtab-contacts') {
    const contacts = _clientDrawerId ? contactStore.filter(ct => ct.clientId === _clientDrawerId) : [];
    body.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        ${can('add_contacts') ? `<button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="openContactModal(null,'${_clientDrawerId}')">+ Add Contact</button>` : ''}
      </div>
      ${contacts.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">No contacts yet</div>` :
        contacts.map(ct => {
          const initials = (ct.firstName[0]||'')+(ct.lastName[0]||'');
          return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
            <div style="width:38px;height:38px;border-radius:50%;background:var(--amber);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div style="flex:1">
              <div style="font-size:13.5px;font-weight:600;color:var(--text)">${ct.firstName} ${ct.lastName}</div>
              ${ct.email ? `<div style="font-size:12px;color:var(--blue)">${ct.email}</div>` : ''}
              ${ct.phone ? `<div style="font-size:12px;color:var(--muted)">${ct.phone}</div>` : ''}
            </div>
            <button class="client-action-btn" onclick="openContactModal('${ct.id}')" title="Edit">&#x270E;</button>
            ${can('delete_contacts') ? `<button class="client-action-btn" onclick="deleteContact('${ct.id}')" title="Delete">&#x2715;</button>` : ''}
          </div>`;
        }).join('')}`;

  } else if (_clientDrawerTab === 'dtab-jobs') {
    const jobs = _clientDrawerId
      ? projects.filter(p => (projectInfo[p.id]||{}).clientId === _clientDrawerId)
          .sort((a,b) => a.name.localeCompare(b.name))
      : [];

    const fmt$ = n => n > 0 ? '$' + n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—';
    const fmtH = h => h > 0 ? h.toFixed(1) + 'h' : '—';
    const fmtRate = (billed, hours) => (billed > 0 && hours > 0) ? '$' + (billed / hours).toFixed(2) + '/h' : '—';

    const statusColors = { active:'rgba(46,158,98,0.15)', closed:'rgba(107,107,120,0.15)', jobprep:'rgba(91,156,246,0.15)' };
    const statusText   = { active:'Active', closed:'Closed', jobprep:'Job Prep' };

    // Totals across all jobs
    const totalBilled  = jobs.reduce((s,p) => s + ((projectInfo[p.id]||{}).billedRevenue||0), 0);
    const totalHours   = jobs.reduce((s,p) => s + ((projectInfo[p.id]||{}).actualHours||0), 0);
    const avgRate      = (totalBilled > 0 && totalHours > 0) ? totalBilled / totalHours : 0;

    // Build as a proper table so columns align regardless of content
    const th = (label, align='left') =>
      `<th style="padding:6px 8px;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);text-align:${align};white-space:nowrap;border-bottom:2px solid var(--border)">${label}</th>`;

    const jobRows = jobs.map(p => {
      const info = projectInfo[p.id]||{};
      const st   = info.status||'active';
      const bil  = info.billedRevenue||0;
      const hrs  = info.actualHours||0;
      const td   = (val, color='var(--text)', align='left') =>
        `<td style="padding:6px 8px;font-size:11px;color:${color};text-align:${align};white-space:nowrap;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace">${val}</td>`;
      return `<tr style="cursor:pointer;transition:background .12s" onclick="closeClientDrawer();navToProject('${p.id}')"
          onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;white-space:nowrap">${p.name.match(/^\d+/)?.[0]||''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.emoji||''} ${p.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${statusColors[st]||'var(--surface2)'};color:var(--muted);white-space:nowrap">${statusText[st]||st}</span>
        </td>
        ${td(fmt$(bil), bil > 0 ? 'var(--green)' : 'var(--muted)', 'right')}
        ${td(fmtH(hrs), hrs > 0 ? 'var(--blue)' : 'var(--muted)', 'right')}
        ${td(fmtRate(bil, hrs), (bil > 0 && hrs > 0) ? 'var(--amber)' : 'var(--muted)', 'right')}
        <td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-size:12px">›</td>
      </tr>`;
    }).join('');

    const table = `
      <div style="border:1px solid var(--border);border-radius:10px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:var(--surface2)">
            <tr>
              ${th('#')}${th('Job')}${th('Status')}${th('Billed','right')}${th('Hours','right')}${th('Job Rate','right')}${th('')}
            </tr>
          </thead>
          <tbody>${jobRows}</tbody>
        </table>
      </div>`;

    // Summary footer
    const summary = `
      <div style="margin-top:14px;border:1px solid var(--border);border-radius:10px;padding:14px 18px;background:var(--surface2);display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total Billed</div>
          <div style="font-size:18px;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--green)">${fmt$(totalBilled)}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total Hours</div>
          <div style="font-size:18px;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--blue)">${fmtH(totalHours)}</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Avg Job Rate</div>
          <div style="font-size:18px;font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--amber)">${fmtRate(totalBilled, totalHours)}</div>
        </div>
      </div>`;

    body.innerHTML = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${jobs.length} project${jobs.length!==1?'s':''} linked to this client</div>
      ${jobs.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px">No projects linked yet</div>`
        : table + summary}`;
  }
}

async function saveClientDrawer() {
  const name = document.getElementById('cdName')?.value.trim();
  if (!name) { toast('Company name is required'); return; }
  const fields = {
    name,
    phone:   document.getElementById('cdPhone')?.value.trim()||null,
    website: document.getElementById('cdWebsite')?.value.trim()||null,
    address: document.getElementById('cdAddress')?.value.trim()||null,
    city:    document.getElementById('cdCity')?.value.trim()||null,
    state:   document.getElementById('cdState')?.value.trim()||null,
    zip:     document.getElementById('cdZip')?.value.trim()||null,
    notes:   document.getElementById('cdNotes')?.value.trim()||null,
  };
  if (_clientDrawerId) {
    const c = clientStore.find(x => x.id === _clientDrawerId);
    if (c) Object.assign(c, { name: fields.name, phone: fields.phone||'', website: fields.website||'', address: fields.address||'', city: fields.city||'', state: fields.state||'', zip: fields.zip||'', notes: fields.notes||'' });
    if (sb) await dbUpdate('clients', _clientDrawerId, fields);
    document.getElementById('clientDrawerTitle').textContent = name;
    toast('✓ Client saved');
  } else {
    const saved = sb ? await dbInsert('clients', fields) : null;
    const newId = saved?.id || 'local-' + Date.now();
    clientStore.push({ id: newId, name: fields.name, phone: fields.phone||'', website: fields.website||'', address: fields.address||'', city: fields.city||'', state: fields.state||'', zip: fields.zip||'', notes: fields.notes||'' });
    _clientDrawerId = newId;
    document.getElementById('clientDrawerTitle').textContent = name;
    toast('✓ Client added');
  }
  renderClientsPanel('');
}


// ===== CLIENT MODAL (kept for backward compat, now routes to drawer) =====
// ===== CLIENT MODAL (kept for backward compat, now routes to drawer) =====
function openClientModal(id) { if (id) openClientDrawer(id); else openNewClientDrawer(); }

async function deleteClient(id) {
  if (!confirm('Delete this client and all their contacts?')) return;
  if (sb) {
    await sb.from('contacts').delete().eq('client_id', id);
    await dbDelete('clients', id);
  }
  clientStore = clientStore.filter(c => c.id !== id);
  contactStore = contactStore.filter(c => c.clientId !== id);
  renderClientsPanel('');
  toast('Client deleted');
}

async function deleteClientFromDrawer() {
  if (!_clientDrawerId) return;
  const c = clientStore.find(x => x.id === _clientDrawerId);
  if (!c) return;
  if (!confirm(`Delete "${c.name}" and all their contacts? This cannot be undone.`)) return;
  closeClientDrawer();
  await deleteClient(_clientDrawerId);
}


// ===== CONTACT MODAL =====
// ===== CONTACT MODAL =====
let _contactModalId = null;
let _contactModalClientId = null;

function openContactModal(id, clientId) {
  const ct = id ? contactStore.find(x => x.id === id) : null;
  _contactModalId = id || null;
  _contactModalClientId = clientId || (ct ? ct.clientId : null);
  document.getElementById('contactModalTitle').textContent = id ? 'Edit Contact' : 'Add Contact';
  document.getElementById('ctFirstName').value = ct ? ct.firstName : '';
  document.getElementById('ctLastName').value  = ct ? ct.lastName  : '';
  document.getElementById('ctEmail').value     = ct ? ct.email     : '';
  document.getElementById('ctPhone').value     = ct ? (ct.phone||'') : '';
  document.getElementById('contactModalOverlay').style.display='flex';
  setTimeout(() => document.getElementById('ctFirstName').focus(), 50);
}

function closeContactModal() {
  document.getElementById('contactModalOverlay').style.display='none';
}

async function saveContactModal() {
  const firstName = document.getElementById('ctFirstName').value.trim();
  if (!firstName) { document.getElementById('ctFirstName').style.borderColor='var(--red)'; setTimeout(()=>document.getElementById('ctFirstName').style.borderColor='',1500); return; }
  const lastName = document.getElementById('ctLastName').value.trim();
  const email    = document.getElementById('ctEmail').value.trim();
  const phone    = document.getElementById('ctPhone').value.trim();
  closeContactModal();
  await saveContactRecord(_contactModalId, _contactModalClientId, firstName, lastName, email, phone);
}

async function saveContactRecord(id, clientId, firstName, lastName, email, phone) {
  if (id) {
    const ct = contactStore.find(x => x.id === id);
    if (ct) { ct.firstName = firstName; ct.lastName = lastName; ct.email = email; ct.phone = phone||''; }
    if (sb) await dbUpdate('contacts', id, { first_name: firstName, last_name: lastName, email: email||null, phone: phone||null });
    toast('Contact updated');
  } else {
    const row = { client_id: clientId, first_name: firstName, last_name: lastName, email: email||null };
    const saved = sb ? await dbInsert('contacts', row) : null;
    const newId = saved ? saved.id : 'local-' + Date.now();
    contactStore.push({ id: newId, clientId, firstName, lastName, email });
    toast('Contact added');
  }
  renderClientsPanel('');
  // Refresh project contact picker if we were adding from a project
  if (window._afterContactSaveProjId) {
    const _pid = window._afterContactSaveProjId;
    window._afterContactSaveProjId = null;
    renderContactPickerList(_pid, '');
    const dd = document.getElementById('contactPickerDropdown');
    if (dd) dd.style.display = 'block';
  }
}

async function deleteContact(id) {
  if (!confirm('Remove this contact?')) return;
  if (sb) await dbDelete('contacts', id);
  contactStore = contactStore.filter(c => c.id !== id);
  renderClientsPanel('');
  toast('Contact deleted');
}


// ===== CLIENT/CONTACT PICKERS ON INFO SHEET =====
// ===== CLIENT/CONTACT PICKERS ON INFO SHEET =====
function openClientPicker(projId) {
  const dd = document.getElementById('clientPickerDropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    renderClientPickerList(projId, '');
    setTimeout(() => document.getElementById('clientPickerSearch')?.focus(), 50);
  }
}

function renderClientPickerList(projId, search) {
  const list = document.getElementById('clientPickerList');
  if (!list) return;
  const q = search.toLowerCase();
  const filtered = clientStore.filter(c => c.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exact = clientStore.find(c => c.name.toLowerCase() === q);
  const addNew = search.trim() && !exact
    ? `<div class="client-picker-item" style="color:var(--amber);font-weight:600;border-top:1px solid var(--border);margin-top:4px;padding-top:8px" onclick="createAndSelectClient('${projId}','${search.trim().replace(/'/g,"\\'")}')">&#xFF0B; Add "${search.trim()}" as new client</div>`
    : '';
  list.innerHTML = (filtered.map(c =>
    `<div class="client-picker-item" onclick="selectClient('${projId}','${c.id}')">${c.name}</div>`
  ).join('') || `<div style="padding:8px 12px;font-size:12px;color:var(--muted)">No clients found</div>`) + addNew;
}

async function createAndSelectClient(projId, name) {
  if (!name.trim()) return;
  const saved = sb ? await dbInsert('clients', { name: name.trim() }) : null;
  const newId = saved ? saved.id : 'local-' + Date.now();
  clientStore.push({ id: newId, name: name.trim() });
  renderClientsPanel('');
  await selectClient(projId, newId);
  toast('✓ Client "' + name + '" created and linked');
}

async function selectClient(projId, clientId) {
  const info = projectInfo[projId];
  const c = clientStore.find(x => x.id === clientId);
  if (!info || !c) return;
  info.clientId = clientId;
  info.client = c.name;
  // Clear contact if it doesn't belong to this client
  if (info.contactId) {
    const ct = contactStore.find(x => x.id === info.contactId);
    if (ct && ct.clientId !== clientId) { info.contactId = null; info.clientContact = ''; }
  }
  if (sb) await dbUpdate('project_info', projId, { client_id: clientId, client: c.name });
  document.getElementById('clientPickerDropdown').style.display = 'none';
  renderInfoSheet(projId);
  toast('Client saved');
}

async function clearClientPicker(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  info.clientId = null; info.client = '';
  info.contactId = null; info.clientContact = '';
  if (sb) await dbUpdate('project_info', projId, { client_id: null, client: null, contact_id: null, client_contact: null });
  document.getElementById('clientPickerDropdown').style.display = 'none';
  renderInfoSheet(projId);
}

function openContactPicker(projId) {
  const dd = document.getElementById('contactPickerDropdown');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    renderContactPickerList(projId, '');
    setTimeout(() => document.getElementById('contactPickerSearch')?.focus(), 50);
  }
}

function renderContactPickerList(projId, search) {
  const list = document.getElementById('contactPickerList');
  if (!list) return;
  const info = projectInfo[projId] || {};
  const q = search.toLowerCase();
  let contacts = contactStore;
  // Filter to client's contacts if a client is selected
  if (info.clientId) contacts = contacts.filter(c => c.clientId === info.clientId);
  contacts = contacts.filter(c =>
    (c.firstName+' '+c.lastName).toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q)
  );
  list.innerHTML = contacts.map(c =>
    `<div class="client-picker-item" onclick="selectContact('${projId}','${c.id}')">
      <div>${c.firstName} ${c.lastName}</div>
      ${c.email ? `<div style="font-size:11px;color:var(--muted)">${c.email}</div>` : ''}
    </div>`
  ).join('') || `<div class="client-picker-item" style="color:var(--muted)">No contacts found</div>`;
  // Add "+ New Contact" option at bottom
  const info2 = projectInfo[projId] || {};
  list.innerHTML += `<div class="client-picker-item" style="color:var(--blue);border-top:1px solid var(--border);margin-top:4px;padding-top:8px"
    onclick="closeContactPickerAndAdd('${projId}')">+ New Contact</div>`;
}

function closeContactPickerAndAdd(projId) {
  const dd = document.getElementById('contactPickerDropdown');
  if (dd) dd.style.display = 'none';
  const info = projectInfo[projId] || {};
  openContactModal(null, info.clientId || null);
  // After saving, refresh the contact picker
  const _origSave = window._afterContactSaveProjId;
  window._afterContactSaveProjId = projId;
}

async function selectContact(projId, contactId) {
  const info = projectInfo[projId];
  const ct = contactStore.find(x => x.id === contactId);
  if (!info || !ct) return;
  info.contactId = contactId;
  info.clientContact = ct.firstName + ' ' + ct.lastName;
  info.clientEmail = ct.email;
  if (sb) await dbUpdate('project_info', projId, {
    contact_id: contactId,
    client_contact: info.clientContact,
    client_email: ct.email||null
  });
  document.getElementById('contactPickerDropdown').style.display = 'none';
  renderInfoSheet(projId);
  toast('Contact saved');
}

async function clearContactPicker(projId) {
  const info = projectInfo[projId];
  if (!info) return;
  info.contactId = null; info.clientContact = ''; info.clientEmail = '';
  if (sb) await dbUpdate('project_info', projId, { contact_id: null, client_contact: null, client_email: null });
  document.getElementById('contactPickerDropdown').style.display = 'none';
  renderInfoSheet(projId);
}

// Close pickers when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('#clientPickerWrap')) {
    document.getElementById('clientPickerDropdown')?.style && (document.getElementById('clientPickerDropdown').style.display = 'none');
  }
  if (!e.target.closest('#contactPickerWrap')) {
    document.getElementById('contactPickerDropdown')?.style && (document.getElementById('contactPickerDropdown').style.display = 'none');
  }
});



// ===== SALESFORCE CSV IMPORT =====
// ===== SALESFORCE CSV IMPORT =====
let _sfParsed = []; // [{ accountName, city, state, zip, address, website, phone, contacts: [] }]


// ===== MERGE DUPLICATE CLIENTS =====
// ===== MERGE DUPLICATE CLIENTS =====
let _mergeDecisions = {}; // pairKey -> 'dismissed'
let _mergeAllPairs = [];  // cached ALL pairs (score > 0) from last scan, sorted desc
let _mergeHasScanned = false;
let _mergeDismissalsLoadPromise = null; // awaited by runMergeScan so we never render dismissed pairs
const _MERGE_THRESHOLD = 0.45;

async function loadMergeDismissals() {
  _mergeDecisions = {};
  if (!sb) return;
  try {
    const { data, error } = await sb.from('merge_dismissals').select('pair_key');
    if (error) throw error;
    (data || []).forEach(r => { _mergeDecisions[r.pair_key] = 'dismissed'; });
  } catch(e) {
    console.warn('Could not load merge dismissals:', e.message);
  }
}

function openMergeClientsPanel(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Merge Duplicate Clients';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-merge-clients').classList.add('active');
  document.getElementById('mergeResultsWrap').innerHTML = '<div style="color:var(--muted);font-size:13px">Click Scan to find potential duplicates.</div>';
  // Reset search UI — hidden until scan runs
  const searchWrap = document.getElementById('mergeSearchWrap');
  if (searchWrap) searchWrap.style.display = 'none';
  const searchInput = document.getElementById('mergeSearchInput');
  if (searchInput) searchInput.value = '';
  // Kick off dismissals fetch (fire-and-forget; runMergeScan awaits it)
  _mergeDismissalsLoadPromise = loadMergeDismissals();
}

function mergeSimScore(a, b) {
  // Normalize: lowercase, strip common suffixes and punctuation
  const norm = s => s.toLowerCase()
    .replace(/[,\.]/g,'')
    .replace(/\b(inc|llc|ltd|corp|co|company|corporation|the|and|&|div|division|systems|technologies|technology|group|services|manufacturing|products|aerospace)\b/g,'')
    .replace(/\s+/g,' ').trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Word overlap score
  const wa = new Set(na.split(' ').filter(w=>w.length>2));
  const wb = new Set(nb.split(' ').filter(w=>w.length>2));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  wa.forEach(w => { if (wb.has(w)) overlap++; });
  const score = overlap / Math.max(wa.size, wb.size);
  return score;
}

function runMergeScan() {
  const wrap = document.getElementById('mergeResultsWrap');
  wrap.innerHTML = '<div style="color:var(--muted);font-size:13px">Scanning…</div>';

  // Wait for persisted dismissals to load before rendering, so dismissed pairs stay hidden.
  const proceed = () => {
    // Compute ALL pairs with any positive score — we cache them so search can reach
    // below the 0.45 threshold (e.g. typos like "Elma Electoronics") without re-scanning.
    _mergeAllPairs = [];
    const seen = new Set();

    for (let i = 0; i < clientStore.length; i++) {
      for (let j = i + 1; j < clientStore.length; j++) {
        const a = clientStore[i], b = clientStore[j];
        const key = [a.id, b.id].sort().join('|');
        if (seen.has(key)) continue;
        const score = mergeSimScore(a.name, b.name);
        if (score > 0) {
          _mergeAllPairs.push({ a, b, score, key });
          seen.add(key);
        }
      }
    }
    _mergeAllPairs.sort((x, y) => y.score - x.score);
    _mergeHasScanned = true;

    // Reveal the search input now that we have data to filter
    const searchWrap = document.getElementById('mergeSearchWrap');
    if (searchWrap) searchWrap.style.display = '';

    renderMergeResults();
  };

  if (_mergeDismissalsLoadPromise) {
    _mergeDismissalsLoadPromise.then(proceed);
  } else {
    proceed();
  }
}

function filterMergePairs() {
  if (!_mergeHasScanned) return;
  renderMergeResults();
}

function renderMergeResults() {
  const wrap = document.getElementById('mergeResultsWrap');
  if (!wrap) return;
  const searchEl = document.getElementById('mergeSearchInput');
  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';

  // Empty search → default behavior (pairs ≥ 0.45).
  // Non-empty search → show ANY pair where either name contains the text, regardless of score.
  // Dismissed pairs are always hidden.
  let pairs;
  if (search) {
    pairs = _mergeAllPairs.filter(p =>
      _mergeDecisions[p.key] !== 'dismissed' &&
      (p.a.name.toLowerCase().includes(search) || p.b.name.toLowerCase().includes(search))
    );
  } else {
    pairs = _mergeAllPairs.filter(p =>
      _mergeDecisions[p.key] !== 'dismissed' &&
      p.score >= _MERGE_THRESHOLD
    );
  }

  if (pairs.length === 0) {
    if (search) {
      wrap.innerHTML = `<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">🔍</div><div>No client pairs match "${search}".</div></div>`;
    } else {
      wrap.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)"><div style="font-size:32px;margin-bottom:12px">✅</div><div>No duplicate candidates found.</div></div>';
    }
    return;
  }

  const headerText = search
    ? `${pairs.length} match${pairs.length!==1?'es':''} for "${search}" — showing all scores`
    : `${pairs.length} potential duplicate pair${pairs.length!==1?'s':''} found — review and merge or dismiss each one.`;

  wrap.innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:18px">${headerText}</div>
    ${pairs.map(p => renderMergePair(p)).join('')}`;
}

function renderMergePair(p) {
  const { a, b, score, key } = p;
  const aContacts = contactStore.filter(c => c.clientId === a.id);
  const bContacts = contactStore.filter(c => c.clientId === b.id);
  const aJobs = Object.values(projectInfo).filter(i => i.clientId === a.id).length;
  const bJobs = Object.values(projectInfo).filter(i => i.clientId === b.id).length;
  const pct = Math.round(score * 100);
  const barColor = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--blue)';

  const clientCard = (c, contacts, jobs, isKeeper) => `
    <div style="flex:1;background:var(--surface2);border:1.5px solid ${isKeeper?'var(--amber-dim)':'var(--border)'};border-radius:10px;padding:16px 18px">
      ${isKeeper ? '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--amber);margin-bottom:8px">⭐ Keep (Newer)</div>' : '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Remove</div>'}
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${c.name}</div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted)">
        <span>👤 ${contacts.length} contact${contacts.length!==1?'s':''}</span>
        <span>📁 ${jobs} job${jobs!==1?'s':''}</span>
      </div>
      ${c.city||c.state ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">📍 ${[c.city,c.state].filter(Boolean).join(', ')}</div>` : ''}
    </div>`;

  // Newer = higher created_at = the Salesforce import = keeper by default
  // We don't have created_at in clientStore, so use index in store (later = newer)
  const aIdx = clientStore.indexOf(a);
  const bIdx = clientStore.indexOf(b);
  const keeper = aIdx > bIdx ? a : b;
  const loser  = aIdx > bIdx ? b : a;
  const kContacts = keeper === a ? aContacts : bContacts;
  const lContacts = keeper === b ? aContacts : bContacts; // unused but consistent
  const kJobs = keeper === a ? aJobs : bJobs;
  const lJobs = keeper === b ? aJobs : bJobs;

  return `<div id="merge-pair-${key.replace(/[^a-z0-9]/gi,'-')}" style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px"></div>
      </div>
      <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted);white-space:nowrap">${pct}% match</div>
    </div>
    <div style="display:flex;gap:14px;margin-bottom:16px;align-items:stretch">
      ${clientCard(keeper, kContacts, kJobs, true)}
      <div style="display:flex;align-items:center;font-size:18px;color:var(--muted);flex-shrink:0">⟵</div>
      ${clientCard(loser, lContacts, lJobs, false)}
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" style="font-size:12px" onclick="dismissMergePair('${key}')">Dismiss</button>
      <button class="btn" style="font-size:12px;background:rgba(192,122,26,0.15);color:var(--amber);border:1px solid var(--amber-dim)"
        onclick="swapMergeKeeper('${key}','${keeper.id}','${loser.id}')">⇄ Swap</button>
      <button class="btn btn-primary" style="font-size:12px"
        onclick="confirmMerge('${key}','${keeper.id}','${loser.id}')">Merge →</button>
    </div>
  </div>`;
}

function swapMergeKeeper(key, keeperId, loserId) {
  // Re-render this pair with swapped roles
  const a = clientStore.find(c => c.id === keeperId);
  const b = clientStore.find(c => c.id === loserId);
  if (!a || !b) return;
  const score = mergeSimScore(a.name, b.name);
  const pairEl = document.getElementById('merge-pair-' + key.replace(/[^a-z0-9]/gi,'-'));
  if (!pairEl) return;
  // Force b as keeper by temporarily swapping their store indices
  const aContacts = contactStore.filter(c => c.clientId === a.id);
  const bContacts = contactStore.filter(c => c.clientId === b.id);
  const aJobs = Object.values(projectInfo).filter(i => i.clientId === a.id).length;
  const bJobs = Object.values(projectInfo).filter(i => i.clientId === b.id).length;
  const pct = Math.round(score * 100);
  const barColor = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--blue)';

  const clientCard = (c, contacts, jobs, isKeeper) => `
    <div style="flex:1;background:var(--surface2);border:1.5px solid ${isKeeper?'var(--amber-dim)':'var(--border)'};border-radius:10px;padding:16px 18px">
      ${isKeeper ? '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--amber);margin-bottom:8px">⭐ Keep</div>' : '<div style="font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Remove</div>'}
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${c.name}</div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--muted)">
        <span>👤 ${contacts.length} contact${contacts.length!==1?'s':''}</span>
        <span>📁 ${jobs} job${jobs!==1?'s':''}</span>
      </div>
      ${c.city||c.state ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">📍 ${[c.city,c.state].filter(Boolean).join(', ')}</div>` : ''}
    </div>`;

  pairEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px"></div>
      </div>
      <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted);white-space:nowrap">${pct}% match</div>
    </div>
    <div style="display:flex;gap:14px;margin-bottom:16px;align-items:stretch">
      ${clientCard(b, bContacts, bJobs, true)}
      <div style="display:flex;align-items:center;font-size:18px;color:var(--muted);flex-shrink:0">⟵</div>
      ${clientCard(a, aContacts, aJobs, false)}
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" style="font-size:12px" onclick="dismissMergePair('${key}')">Dismiss</button>
      <button class="btn" style="font-size:12px;background:rgba(192,122,26,0.15);color:var(--amber);border:1px solid var(--amber-dim)"
        onclick="swapMergeKeeper('${key}','${loserId}','${keeperId}')">⇄ Swap</button>
      <button class="btn btn-primary" style="font-size:12px"
        onclick="confirmMerge('${key}','${loserId}','${keeperId}')">Merge →</button>
    </div>`;
}

function dismissMergePair(key) {
  _mergeDecisions[key] = 'dismissed';
  const el = document.getElementById('merge-pair-' + key.replace(/[^a-z0-9]/gi,'-'));
  if (el) el.style.opacity = '0.3';
  setTimeout(() => { if (el) el.remove(); }, 400);
  // Persist so the dismissal survives reload (work the list down to zero over time)
  if (sb) {
    const empId = (typeof currentEmployee !== 'undefined' && currentEmployee) ? currentEmployee.id : null;
    sb.from('merge_dismissals')
      .upsert({ pair_key: key, dismissed_by: empId }, { onConflict: 'pair_key' })
      .then(({ error }) => {
        if (error) console.warn('Could not persist dismissal:', error.message);
      });
  }
}

function confirmMerge(key, keeperId, loserId) {
  const keeper = clientStore.find(c => c.id === keeperId);
  const loser  = clientStore.find(c => c.id === loserId);
  if (!keeper || !loser) return;
  showConfirmModal(
    `Merge "${loser.name}" into "${keeper.name}"?\n\nAll contacts and job history from "${loser.name}" will move to "${keeper.name}", then "${loser.name}" will be deleted. This cannot be undone.`,
    () => executeMerge(key, keeperId, loserId)
  );
}

async function executeMerge(key, keeperId, loserId) {
  const keeper = clientStore.find(c => c.id === keeperId);
  const loser  = clientStore.find(c => c.id === loserId);
  if (!keeper || !loser) return;

  try {
    if (sb) {
      // Move contacts
      await sb.from('contacts').update({ client_id: keeperId }).eq('client_id', loserId);
      // Move project_info client links
      await sb.from('project_info').update({ client_id: keeperId }).eq('client_id', loserId);
      // Delete loser client
      await sb.from('clients').delete().eq('id', loserId);
    }

    // Update in-memory stores
    contactStore.forEach(c => { if (c.clientId === loserId) c.clientId = keeperId; });
    Object.values(projectInfo).forEach(info => { if (info.clientId === loserId) info.clientId = keeperId; });
    clientStore = clientStore.filter(c => c.id !== loserId);
    // Purge any cached pair referencing the deleted client so search doesn't show ghosts
    _mergeAllPairs = _mergeAllPairs.filter(p => p.a.id !== loserId && p.b.id !== loserId);

    _mergeDecisions[key] = 'dismissed';
    const el = document.getElementById('merge-pair-' + key.replace(/[^a-z0-9]/gi,'-'));
    if (el) {
      el.style.background = 'rgba(46,158,98,0.08)';
      el.style.borderColor = 'rgba(46,158,98,0.3)';
      el.innerHTML = `<div style="padding:12px;font-size:13px;color:#2e9e62">✓ Merged "${loser.name}" into "${keeper.name}"</div>`;
      setTimeout(() => el.remove(), 2000);
    }
    toast(`✓ Merged into "${keeper.name}"`);
  } catch(e) {
    toast('⚠ Merge error: ' + e.message);
  }
}

// Builds the SF import panel DOM if it hasn't been added to index.html yet.
// Safe to call multiple times — only creates the panel once.
function ensureSfImportPanel() {
  if (document.getElementById('panel-sf-import')) return;
  const anchor = document.getElementById('panel-clients');
  if (!anchor || !anchor.parentElement) return;
  const panel = document.createElement('div');
  panel.id = 'panel-sf-import';
  panel.className = 'view-panel';
  panel.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:20px 28px">
      <div style="margin-bottom:20px">
        <div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--text)">📥 Import from Salesforce</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">
          Drop a Salesforce CSV export to create new clients + contacts, or backfill addresses on existing clients.
          The importer auto-detects both <em>Mailing ___</em> (contacts export) and <em>Billing ___</em> (accounts-only export) column formats.
        </div>
      </div>

      <div id="sfDropZone"
           style="border:2px dashed var(--border);border-radius:12px;padding:48px 24px;text-align:center;cursor:pointer;transition:all .15s;background:var(--surface)"
           onclick="document.getElementById('sfCsvInput').click()"
           ondragover="event.preventDefault();this.style.borderColor='var(--amber)';this.style.background='var(--amber-glow)'"
           ondragleave="this.style.borderColor='var(--border)';this.style.background='var(--surface)'"
           ondrop="event.preventDefault();this.style.borderColor='var(--border)';this.style.background='var(--surface)';handleSfCsvDrop(event)">
        <div style="font-size:42px;margin-bottom:10px">📄</div>
        <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">Drop a CSV file here</div>
        <div style="font-size:12px;color:var(--muted)">…or click to browse. Expects Salesforce export columns (Account Name required).</div>
        <input id="sfCsvInput" type="file" accept=".csv,text/csv" style="display:none"
               onchange="handleSfCsvFile(this.files[0])" />
      </div>

      <div id="sfImportPreview" style="display:none;margin-top:20px">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;gap:12px;flex-wrap:wrap">
          <div>
            <div id="sfPreviewTitle" style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--text)"></div>
            <div id="sfPreviewSub"   style="font-size:12px;color:var(--muted);margin-top:3px"></div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="resetSfImport()"
              style="background:var(--surface2);border:1.5px solid var(--border);color:var(--text);border-radius:8px;font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;font-family:'DM Sans',sans-serif">Cancel</button>
            <button id="sfImportBtn" class="btn btn-primary" onclick="runSfImport()">Import Selected</button>
          </div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--border);background:var(--surface2)">
                <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Status</th>
                <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Account</th>
                <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Contacts</th>
                <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Location</th>
                <th style="padding:9px 14px;text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Match</th>
              </tr>
            </thead>
            <tbody id="sfPreviewBody"></tbody>
          </table>
        </div>
      </div>

      <div id="sfImportLog" style="display:none;margin-top:18px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:12px;max-height:360px;overflow-y:auto;line-height:1.6"></div>
    </div>
  `;
  anchor.parentElement.appendChild(panel);
}

function openSfImportPanel(el) {
  ensureSfImportPanel();
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  activeProjectId = null;
  document.getElementById('topbarName').textContent = 'Import from Salesforce';
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-sf-import').classList.add('active');
  resetSfImport();
}

function resetSfImport() {
  _sfParsed = [];
  document.getElementById('sfImportPreview').style.display = 'none';
  document.getElementById('sfImportLog').style.display = 'none';
  document.getElementById('sfDropZone').style.display = '';
  document.getElementById('sfCsvInput').value = '';
  document.getElementById('sfImportBtn').disabled = false;
  document.getElementById('sfImportBtn').textContent = 'Import Selected';
}

function handleSfCsvDrop(e) {
  const file = e.dataTransfer.files[0];
  if (file) handleSfCsvFile(file);
}

function handleSfCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseSfCsv(e.target.result);
  reader.readAsText(file);
}

// Full US state name → 2-letter code (includes DC + PR). Used to normalize
// address data coming in from Salesforce exports (which may contain either
// "Massachusetts" or "MA" in the state column).
const US_STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC','puerto rico':'PR',
};
function normalizeState(s) {
  if (!s) return '';
  const trimmed = s.trim();
  if (!trimmed) return '';
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return US_STATE_MAP[trimmed.toLowerCase()] || trimmed;
}

// Corporate suffixes stripped when fuzzy-matching account names. Order matters —
// longer phrases listed first so they match before shorter ones (e.g. "incorporated"
// before "inc"). Periods are optional in the regex below.
const COMPANY_SUFFIXES = [
  'incorporated', 'corporation', 'limited liability company',
  'company', 'limited', 'inc', 'corp', 'llc', 'l l c',
  'ltd', 'co', 'l p', 'lp', 'l l p', 'llp',
  'p l l c', 'pllc', 'plc', 'p c', 'pc', 'p a', 'pa',
];

// Normalize a company name for fuzzy matching: lowercase, strip punctuation,
// collapse whitespace, then strip trailing corporate suffixes (stacked OK,
// e.g. "Acme Co., LLC" → "acme").
function normalizeCompanyName(name) {
  if (!name) return '';
  let s = name.toLowerCase().trim();
  s = s.replace(/[.,'"()&/\\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of COMPANY_SUFFIXES) {
      const re = new RegExp('(^|\\s)' + suf.replace(/ /g, '\\s+') + '$');
      if (re.test(s)) { s = s.replace(re, '').trim(); changed = true; break; }
    }
  }
  return s;
}

// Look up a Salesforce account in clientStore. Returns { client, mode } where
// mode is 'exact' (case-insensitive trimmed) or 'fuzzy' (normalized — only
// tried when _sfFuzzyMode is on). Returns null if nothing matches.
let _sfFuzzyMode = false;
function sfFindMatchMode(accountName) {
  const exact = sfFindExisting(accountName);
  if (exact) return { client: exact, mode: 'exact' };
  if (!_sfFuzzyMode) return null;
  const normed = normalizeCompanyName(accountName);
  if (!normed) return null;
  const fuzzy = clientStore.find(c => normalizeCompanyName(c.name) === normed);
  if (fuzzy) return { client: fuzzy, mode: 'fuzzy' };
  return null;
}

function parseSfCsv(text) {
  // Parse CSV respecting quoted fields with embedded newlines
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i+1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cur.push(field.trim()); field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i+1] === '\n') i++;
      if (cur.length > 0 || field) { cur.push(field.trim()); rows.push(cur); cur = []; field = ''; }
    } else {
      field += ch;
    }
  }
  if (field || cur.length) { cur.push(field.trim()); rows.push(cur); }

  if (rows.length < 2) { toast('⚠ Could not parse CSV — check file format'); return; }

  // Map headers. Accept both "Mailing ___" (contacts export) and "Billing ___"
  // (accounts-only export used for address backfill).
  const headers = rows[0].map(h => h.replace(/["\r\n]/g,'').trim().toLowerCase());
  const col     = name => headers.indexOf(name);
  const colAny  = (...names) => { for (const n of names) { const i = col(n); if (i !== -1) return i; } return -1; };
  const iAcctName  = col('account name');
  const iFirst     = col('first name');
  const iLast      = col('last name');
  const iTitle     = col('title');
  const iEmail     = col('email');
  const iPhone     = col('phone');
  const iMobile    = col('mobile');
  const iStreet    = colAny('mailing street', 'billing street');
  const iCity      = colAny('mailing city', 'billing city');
  const iState     = colAny('mailing state/province (text only)', 'mailing state/province', 'billing state/province', 'billing state');
  const iZip       = colAny('mailing zip/postal code', 'billing zip/postal code');
  const iWebsite   = col('website');

  if (iAcctName === -1) { toast('⚠ "Account Name" column not found'); return; }

  // Group contacts by account name
  const accounts = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    const acct = (r[iAcctName]||'').trim();
    if (!acct) continue;
    if (!accounts[acct]) {
      accounts[acct] = {
        accountName: acct,
        address: iStreet > -1 ? (r[iStreet]||'').replace(/\n/g,' ').trim() : '',
        city:    iCity    > -1 ? (r[iCity]||'').trim()    : '',
        state:   iState   > -1 ? normalizeState(r[iState]||'') : '',
        zip:     iZip     > -1 ? (r[iZip]||'').trim()     : '',
        website: iWebsite > -1 ? (r[iWebsite]||'').trim() : '',
        phone:   iPhone   > -1 ? (r[iPhone]||'').trim()   : '',
        contacts: [],
      };
    }
    const firstName = iFirst > -1 ? (r[iFirst]||'').trim() : '';
    const lastName  = iLast  > -1 ? (r[iLast]||'').trim()  : '';
    const email     = iEmail > -1 ? (r[iEmail]||'').trim()  : '';
    const phone     = iPhone > -1 ? (r[iPhone]||'').trim()  : '';
    const mobile    = iMobile > -1 ? (r[iMobile]||'').trim() : '';
    const title     = iTitle > -1 ? (r[iTitle]||'').trim()  : '';
    if (firstName || lastName || email) {
      accounts[acct].contacts.push({ firstName, lastName, email, phone: phone||mobile, title });
    }
  }

  _sfParsed = Object.values(accounts).sort((a,b) => a.accountName.localeCompare(b.accountName));
  renderSfPreview();
}

function sfFindExisting(accountName) {
  const norm = s => s.trim().toLowerCase();
  return clientStore.find(c => norm(c.name) === norm(accountName));
}

function renderSfPreview() {
  // Look up each row's match result (exact first, then fuzzy if enabled).
  const matches = _sfParsed.map(a => sfFindMatchMode(a.accountName));
  const newCount      = matches.filter(m => !m).length;
  const existingCount = _sfParsed.length - newCount;
  const contactCount  = _sfParsed.reduce((s,a) => s + a.contacts.length, 0);
  const fuzzyCount    = matches.filter(m => m && m.mode === 'fuzzy').length;

  // "Backfill mode" = the CSV has zero contacts across all rows (e.g. a Salesforce
  // Accounts-only export with billing addresses). In this mode we skip unmatched
  // rows by default and only fill blank address fields on matched clients.
  const backfillMode  = contactCount === 0 && _sfParsed.length > 0;

  // Pre-compute what each matched row would actually fill, for accurate preview copy.
  const fillPlan = _sfParsed.map((a, i) => {
    const existing = matches[i]?.client;
    if (!existing) return null;
    const blanks = {};
    if (!existing.address && a.address) blanks.address = a.address;
    if (!existing.city    && a.city)    blanks.city    = a.city;
    if (!existing.state   && a.state)   blanks.state   = a.state;
    if (!existing.zip     && a.zip)     blanks.zip     = a.zip;
    return blanks;
  });
  const willFillCount = fillPlan.filter(p => p && Object.keys(p).length > 0).length;

  document.getElementById('sfDropZone').style.display = 'none';
  document.getElementById('sfImportPreview').style.display = '';

  if (backfillMode) {
    const fuzzyNote = fuzzyCount > 0 ? ` (incl. ${fuzzyCount} fuzzy)` : '';
    document.getElementById('sfPreviewTitle').textContent = `${_sfParsed.length} accounts · address backfill`;
    document.getElementById('sfPreviewSub').textContent   = `${willFillCount} will fill blanks${fuzzyNote} · ${existingCount - willFillCount} matched but nothing to fill · ${newCount} unmatched (will skip)`;
  } else {
    document.getElementById('sfPreviewTitle').textContent = `${_sfParsed.length} accounts · ${contactCount} contacts`;
    document.getElementById('sfPreviewSub').textContent   = `${existingCount} matches found · ${newCount} need review — use the Match column to link or create new`;
  }

  // Fuzzy-match toggle bar (injected above the preview table).
  let toggleBar = document.getElementById('sfFuzzyBar');
  if (!toggleBar) {
    toggleBar = document.createElement('div');
    toggleBar.id = 'sfFuzzyBar';
    toggleBar.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:12px';
    const previewDiv = document.getElementById('sfImportPreview');
    const table = previewDiv.querySelector('table')?.parentElement;
    if (table) previewDiv.insertBefore(toggleBar, table);
  }
  toggleBar.innerHTML = `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
      <input type="checkbox" id="sfFuzzyChk" ${_sfFuzzyMode ? 'checked' : ''}
             onchange="_sfFuzzyMode=this.checked;renderSfPreview()"
             style="accent-color:var(--amber);width:15px;height:15px;cursor:pointer" />
      <span style="font-weight:600;color:var(--text)">🔍 Fuzzy matching</span>
    </label>
    <span style="color:var(--muted);font-size:11.5px">Strips Inc./LLC/Corp/punctuation before comparing — catches "Acme Inc." ↔ "Acme, Inc"</span>
    ${_sfFuzzyMode && fuzzyCount > 0 ? `<span style="margin-left:auto;font-size:11px;color:var(--amber);font-weight:700">${fuzzyCount} new fuzzy match${fuzzyCount!==1?'es':''}</span>` : ''}
  `;

  // Build sorted client list for dropdowns
  const clientOpts = clientStore
    .slice().sort((a,b) => a.name.localeCompare(b.name))
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const tbody = document.getElementById('sfPreviewBody');
  tbody.innerHTML = _sfParsed.map((a, i) => {
    const match    = matches[i];
    const existing = match?.client;
    const isFuzzy  = match?.mode === 'fuzzy';
    const location = [a.city, a.state].filter(Boolean).join(', ') || '—';
    const existingContactCount = existing ? contactStore.filter(c => c.clientId === existing.id).length : 0;

    let matchCell;
    if (existing) {
      const blanks = fillPlan[i] || {};
      const blankKeys = Object.keys(blanks);
      const matchLabel = isFuzzy ? `✓ Fuzzy match: <strong>${existing.name}</strong>` : `✓ Exact match`;
      const matchColor = isFuzzy ? 'var(--amber)' : '#2e9e62';
      if (backfillMode) {
        if (blankKeys.length > 0) {
          matchCell = `<span style="font-size:11px;color:${matchColor};font-weight:600">${matchLabel}</span>
             <div style="font-size:10px;color:var(--muted);margin-top:2px">Will fill: ${blankKeys.join(', ')}</div>`;
        } else {
          matchCell = `<span style="font-size:11px;color:${matchColor};font-weight:600">${matchLabel}</span>
             <div style="font-size:10px;color:var(--muted);margin-top:2px">Already has address data — no change</div>`;
        }
      } else {
        matchCell = `<span style="font-size:11px;color:${matchColor};font-weight:600">${matchLabel}</span>
           <div style="font-size:10px;color:var(--muted);margin-top:2px">${existingContactCount} contacts in system</div>`;
      }
    } else {
      // Unmatched — dropdown. In backfill mode, default to Skip.
      const newSel  = backfillMode ? '' : ' selected';
      const skipSel = backfillMode ? ' selected' : '';
      matchCell = `<select class="sf-match-sel" data-idx="${i}"
           style="background:var(--surface2);border:1.5px solid var(--border);border-radius:6px;font-family:'DM Sans',sans-serif;font-size:11px;padding:4px 6px;color:var(--text);outline:none;width:100%;max-width:220px;cursor:pointer"
           onchange="sfMatchChanged(${i},this)">
           <option value="__new__"${newSel}>➕ Create New Client</option>
           <option value="__skip__"${skipSel}>⊘ Skip</option>
           <optgroup label="── Match to Existing ──">${clientOpts}</optgroup>
         </select>`;
    }

    let statusBadge;
    if (existing) {
      if (backfillMode) {
        const blankKeys = Object.keys(fillPlan[i] || {});
        if (blankKeys.length > 0) {
          statusBadge = isFuzzy
            ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber);border:1px solid rgba(232,162,52,0.3)">🔍 Fuzzy Fill</span>`
            : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(46,158,98,0.15);color:#2e9e62;border:1px solid rgba(46,158,98,0.3)">Will Fill</span>`;
        } else {
          statusBadge = `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)">No Change</span>`;
        }
      } else {
        statusBadge = isFuzzy
          ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber);border:1px solid rgba(232,162,52,0.3)">🔍 Fuzzy Match</span>`
          : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:rgba(46,158,98,0.15);color:#2e9e62;border:1px solid rgba(46,158,98,0.3)">Exact Match</span>`;
      }
    } else {
      const label = backfillMode ? 'Skip' : 'New';
      const style = backfillMode
        ? 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)'
        : 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber);border:1px solid rgba(232,162,52,0.3)';
      statusBadge = `<span style="${style}" id="sf-badge-${i}">${label}</span>`;
    }

    return `<tr style="border-bottom:1px solid var(--border)" id="sf-row-${i}" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <td style="padding:9px 14px">${statusBadge}</td>
      <td style="padding:9px 14px;font-size:13px;font-weight:500;color:var(--text)">${a.accountName}</td>
      <td style="padding:9px 14px;font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace">${a.contacts.length} contact${a.contacts.length!==1?'s':''}</td>
      <td style="padding:9px 14px;font-size:12px;color:var(--muted)">${location}</td>
      <td style="padding:9px 14px">${matchCell}</td>
    </tr>`;
  }).join('');
}

function sfMatchChanged(idx, sel) {
  const val = sel.value;
  const badge = document.getElementById('sf-badge-'+idx);
  if (!badge) return;
  if (val === '__new__')  { badge.textContent = 'New';  badge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(232,162,52,0.15);color:var(--amber);border:1px solid rgba(232,162,52,0.3)'; }
  else if (val === '__skip__') { badge.textContent = 'Skip'; badge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:var(--surface2);color:var(--muted);border:1px solid var(--border)'; }
  else { const c = clientStore.find(x => x.id === val); badge.textContent = 'Contacts → ' + (c ? c.name : ''); badge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(58,127,212,0.15);color:var(--blue);border:1px solid rgba(58,127,212,0.3)'; }
}

function sfToggleAll(checked) {
  document.querySelectorAll('.sf-row-chk').forEach(chk => chk.checked = checked);
}

async function runSfImport() {
  const logEl = document.getElementById('sfImportLog');
  logEl.style.display = ''; logEl.innerHTML = '';
  const btn = document.getElementById('sfImportBtn');
  btn.disabled = true; btn.textContent = '⏳ Importing…';

  let clientsAdded = 0, contactsAdded = 0, skipped = 0, errors = 0, addressesFilled = 0;

  for (let i = 0; i < _sfParsed.length; i++) {
    const a = _sfParsed[i];
    const match = sfFindMatchMode(a.accountName);
    const existing = match?.client;
    const isFuzzy  = match?.mode === 'fuzzy';

    // Determine mode: exact or fuzzy match → contacts_only, dropdown selection otherwise
    let mode, clientId;
    if (existing) {
      mode = 'contacts_only';
      clientId = existing.id;
    } else {
      const sel = document.querySelector(`.sf-match-sel[data-idx="${i}"]`);
      const val = sel ? sel.value : '__new__';
      if (val === '__skip__') { skipped++; logEl.innerHTML += `<div style="color:var(--muted)">⊘ Skipped: ${a.accountName}</div>`; continue; }
      else if (val === '__new__') { mode = 'full'; }
      else { mode = 'contacts_only'; clientId = val; }
    }

    try {
      if (mode === 'full') {
        const payload = { name: a.accountName, address: a.address||null, city: a.city||null, state: a.state||null, zip: a.zip||null, website: a.website||null, phone: a.phone||null };
        if (sb) {
          const { data, error } = await sb.from('clients').insert(payload).select().single();
          if (error) throw error;
          clientId = data.id;
          clientStore.push({ id: data.id, name: a.accountName, address: a.address||'', city: a.city||'', state: a.state||'', zip: a.zip||'', website: a.website||'', phone: a.phone||'', notes: '' });
        } else {
          clientId = 'local-' + Date.now() + Math.random();
          clientStore.push({ id: clientId, name: a.accountName, address: a.address||'', city: a.city||'', state: a.state||'', zip: a.zip||'', website: a.website||'', phone: a.phone||'', notes: '' });
        }
        clientsAdded++;
        logEl.innerHTML += `<div style="color:var(--green)">✓ Created: ${a.accountName} (${a.contacts.length} contacts)</div>`;
      } else {
        // contacts_only — matched to an existing client. Backfill address fields
        // that are currently blank on the existing record (never overwrites).
        const matched = clientStore.find(c => c.id === clientId);
        if (matched) {
          const addrUpdate = {};
          if (!matched.address && a.address) addrUpdate.address = a.address;
          if (!matched.city    && a.city)    addrUpdate.city    = a.city;
          if (!matched.state   && a.state)   addrUpdate.state   = a.state;
          if (!matched.zip     && a.zip)     addrUpdate.zip     = a.zip;
          const filledKeys = Object.keys(addrUpdate);
          if (filledKeys.length > 0) {
            if (sb) await dbUpdate('clients', clientId, addrUpdate);
            Object.assign(matched, addrUpdate);
            addressesFilled++;
            const prefix = isFuzzy ? '🔍 Fuzzy backfill' : '✓ Address backfilled';
            logEl.innerHTML += `<div style="color:${isFuzzy ? 'var(--amber)' : 'var(--green)'}">${prefix}: ${a.accountName} → ${matched.name} (${filledKeys.join(', ')})</div>`;
          } else if (a.contacts.length > 0) {
            logEl.innerHTML += `<div style="color:var(--blue)">→ Contacts only: ${a.accountName} → ${matched.name}</div>`;
          } else {
            logEl.innerHTML += `<div style="color:var(--muted)">— No change: ${a.accountName} (address already filled)</div>`;
          }
        }
      }

      for (const ct of a.contacts) {
        if (!ct.firstName && !ct.lastName) continue;
        const ctPayload = { client_id: clientId, first_name: ct.firstName, last_name: ct.lastName, email: ct.email||null, phone: ct.phone||null };
        if (sb) {
          const { data: ctData } = await sb.from('contacts').insert(ctPayload).select().single();
          if (ctData) contactStore.push({ id: ctData.id, clientId, firstName: ct.firstName, lastName: ct.lastName, email: ct.email||'', phone: ct.phone||'' });
        } else {
          contactStore.push({ id: 'local-ct-'+Date.now()+Math.random(), clientId, firstName: ct.firstName, lastName: ct.lastName, email: ct.email||'', phone: ct.phone||'' });
        }
        contactsAdded++;
      }
    } catch(e) {
      errors++;
      logEl.innerHTML += `<div style="color:var(--red)">✗ ${a.accountName}: ${e.message}</div>`;
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  const tallyParts = [];
  if (clientsAdded)    tallyParts.push(`${clientsAdded} clients created`);
  if (contactsAdded)   tallyParts.push(`${contactsAdded} contacts imported`);
  if (addressesFilled) tallyParts.push(`${addressesFilled} addresses backfilled`);
  if (skipped)         tallyParts.push(`${skipped} skipped`);
  if (errors)          tallyParts.push(`${errors} errors`);
  logEl.innerHTML += `<div style="margin-top:8px;color:var(--amber);font-weight:700">Done — ${tallyParts.join(' · ') || 'no changes'}.</div>`;
  btn.textContent = '✓ Import Complete';

  // Refresh the clients panel so the new city/state shows up on cards immediately
  renderClientsPanel('');

  const toastParts = [];
  if (clientsAdded)    toastParts.push(`${clientsAdded} clients`);
  if (contactsAdded)   toastParts.push(`${contactsAdded} contacts`);
  if (addressesFilled) toastParts.push(`${addressesFilled} addresses`);
  toast(`✅ ${toastParts.join(' · ') || 'done'}`);
}

