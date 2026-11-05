// ==============================================================
// js/table-tools.js — column layout for a list table, Projects-style
// ==============================================================
// What it gives a table:
//   - a ☰ Columns popover: click a column to show/hide it, drag ⋮⋮ to reorder, Reset
//   - a 🔍 filter row under the headers (contains-match, case-insensitive)
//   - drag a header's right edge to resize
// Layout (order, hidden columns, widths) is saved in this browser, per user.
// Filters are not saved — they reset each visit.
//
// Used by: LOA (js/loa.js). Nothing else uses it yet.
//
// Column defs: { key, label, width, min?, fixed?: 'left'|'right', resizable?: false, filter?: false,
//                text?: row => string  (what the filter matches against) }
// Columns with `fixed` can't be hidden or moved. The caller renders headers/cells;
// this file supplies the colgroup, resizer handles, filter row and popover.

const TT = {
  _t: {},

  // Register a table. onChange() is called whenever the layout or a filter changes (the caller re-renders).
  define(id, cols, onChange) {
    const t = { id, defs: cols, onChange, filters: {}, popOpen: false, dragKey: null, dragMoved: false };
    this._t[id] = t;
    return t;
  },

  // ---------- storage (per browser, per user) ----------
  _user() {
    try { return (typeof currentUser !== 'undefined' && currentUser && (currentUser.id || currentUser.email)) || 'anon'; }
    catch (e) { return 'anon'; }
  },
  _key(id, what) { return 'nuw_tt_' + id + '_' + what + '_' + this._user(); },
  _load(id, what, fallback) {
    try { const v = JSON.parse(localStorage.getItem(this._key(id, what))); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  },
  _save(id, what, val) { try { localStorage.setItem(this._key(id, what), JSON.stringify(val)); } catch (e) {} },

  // ---------- layout ----------
  _movable(t) { return t.defs.filter(c => !c.fixed); },
  // Movable columns in saved order (unknown keys dropped, new columns added at the end), hidden ones included.
  order(id) {
    const t = this._t[id];
    const keys = this._movable(t).map(c => c.key);
    const saved = this._load(id, 'order', []).filter(k => keys.includes(k));
    return [...saved, ...keys.filter(k => !saved.includes(k))];
  },
  hidden(id) { return new Set(this._load(id, 'hidden', [])); },
  isVisible(id, key) {
    const c = this._t[id].defs.find(d => d.key === key);
    return !!c && (c.fixed || !this.hidden(id).has(key));
  },
  // Columns as displayed: fixed-left, visible movable in order, fixed-right. `skip` = keys to leave out.
  cols(id, skip) {
    const t = this._t[id], hid = this.hidden(id), sk = new Set(skip || []);
    const byKey = Object.fromEntries(t.defs.map(c => [c.key, c]));
    return [
      ...t.defs.filter(c => c.fixed === 'left'),
      ...this.order(id).filter(k => !hid.has(k)).map(k => byKey[k]),
      ...t.defs.filter(c => c.fixed === 'right'),
    ].filter(c => !sk.has(c.key));
  },
  width(id, key) {
    const c = this._t[id].defs.find(d => d.key === key);
    const w = this._load(id, 'widths', {})[key];
    return Math.max(c?.min || 40, w || c?.width || 120);
  },
  colgroup(id, cols) { return '<colgroup>' + cols.map(c => `<col data-tt-col="${c.key}" style="width:${this.width(id, c.key)}px">`).join('') + '</colgroup>'; },
  tableWidth(id, cols) { return cols.reduce((s, c) => s + this.width(id, c.key), 0); },
  // Drag handle for a header cell (the header itself needs position:relative).
  resizer(id, c) { return c.resizable === false ? '' : `<span class="itt-resizer tt-resizer" data-tt="${id}" data-key="${c.key}" title="Drag to resize"></span>`; },

  toggle(id, key) {
    const hid = this.hidden(id);
    if (hid.has(key)) hid.delete(key);
    else {
      if (this._movable(this._t[id]).length - hid.size <= 1) return;   // keep at least one movable column
      hid.add(key);
      delete this._t[id].filters[key];                                 // a hidden column's filter goes with it
    }
    this._save(id, 'hidden', [...hid]);
    this._t[id].onChange();
  },
  reset(id) {
    ['order', 'hidden', 'widths'].forEach(w => { try { localStorage.removeItem(this._key(id, w)); } catch (e) {} });
    this._t[id].onChange();
  },

  // ---------- filters ----------
  setFilter(id, key, val) {
    const t = this._t[id];
    if (String(val).trim()) t.filters[key] = String(val).trim(); else delete t.filters[key];
    t.onChange();
  },
  clearFilters(id) { this._t[id].filters = {}; },
  activeFilters(id) { return Object.keys(this._t[id].filters).length; },
  // Does a row pass every filter on a visible column?
  matches(id, row) {
    const t = this._t[id];
    for (const [k, v] of Object.entries(t.filters)) {
      const c = t.defs.find(d => d.key === k);
      if (!c || !c.text || !this.isVisible(id, k)) continue;
      if (!String(c.text(row) ?? '').toLowerCase().includes(v.toLowerCase())) return false;
    }
    return true;
  },
  filterRow(id, cols) {
    const t = this._t[id];
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<tr class="proj-col-filter-row tt-filter-row">` + cols.map(c => {
      if (c.filter === false || !c.text) return '<th></th>';
      const v = t.filters[c.key] || '';
      return `<th style="padding:4px 6px"><input class="proj-col-filter-input tt-filter ${v ? 'on' : ''}" data-tt="${id}" data-key="${c.key}"
        placeholder="&#x1F50D;" value="${esc(v)}" oninput="TT.setFilter('${id}','${c.key}',this.value)" /></th>`;
    }).join('') + '</tr>';
  },
  // Re-rendering replaces the inputs; call before and after so typing in a filter box keeps focus.
  captureFocus(id) {
    const el = document.activeElement;
    if (!el || !el.classList?.contains('tt-filter') || el.dataset.tt !== id) return null;
    return { key: el.dataset.key, pos: el.selectionStart };
  },
  restoreFocus(id, f) {
    if (!f) return;
    const el = document.querySelector(`.tt-filter[data-tt="${id}"][data-key="${f.key}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(f.pos, f.pos); } catch (e) {} }
  },

  // ---------- ☰ Columns popover ----------
  columnsButton(id) {
    const t = this._t[id], hid = this.hidden(id);
    const movable = this._movable(t), byKey = Object.fromEntries(movable.map(c => [c.key, c]));
    const shown = movable.length - [...hid].filter(k => byKey[k]).length;
    const rows = this.order(id).map(k => {
      const on = !hid.has(k);
      return `<button type="button" class="pf-colrow tt-colrow ${on ? 'on' : ''}" draggable="true" data-key="${k}"
        ondragstart="TT._dragStart(event,'${id}')" ondragover="TT._dragOver(event,'${id}')" ondragleave="TT._dragLeave(event)"
        ondrop="TT._drop(event,'${id}')" ondragend="TT._dragEnd('${id}')" onclick="TT._rowClick(event,'${id}','${k}')">
        <span class="pf-grip" title="Drag to reorder">&#x22EE;&#x22EE;</span>
        <span>${byKey[k].label}</span>
        <span class="pf-box">${on ? '&#x2713;' : ''}</span>
      </button>`;
    }).join('');
    // Only animate the first time it opens, not on every re-render while it stays open.
    const html = `<div class="pf-pop-wrap tt-popwrap" data-tt="${id}">
      <button type="button" class="pf-btn ${t.popOpen ? 'on' : ''}" onclick="TT.togglePop('${id}')" title="Show, hide and reorder columns">
        &#x2630; Columns <span class="pf-count">${shown}</span><span class="pf-caret">&#x25BC;</span></button>
      <div class="pf-pop pf-pop-right ${t.popOpen ? 'open' : ''}" style="width:250px${t.popShown ? ';animation:none' : ''}">
        <div class="pf-pop-head"><b>Columns</b><button type="button" class="pf-pop-reset" onclick="TT.reset('${id}')" title="Default columns, order and widths">Reset</button></div>
        <div class="pf-collist">${rows}</div>
        <div class="pf-pop-foot"><span>Drag &#x22EE;&#x22EE; to reorder · drag a header edge to resize</span></div>
      </div>
    </div>`;
    t.popShown = t.popOpen;
    return html;
  },
  togglePop(id) { const t = this._t[id]; t.popOpen = !t.popOpen; t.onChange(); },
  closePops() {
    Object.values(this._t).forEach(t => {
      if (!t.popOpen) return;
      t.popOpen = false;
      document.querySelectorAll(`.tt-popwrap[data-tt="${t.id}"]`).forEach(w => {
        w.querySelector('.pf-pop')?.classList.remove('open');
        w.querySelector('.pf-btn')?.classList.remove('on');
      });
    });
  },

  _rowClick(ev, id, key) {
    if (this._t[id].dragMoved) { ev.preventDefault(); return; }
    this.toggle(id, key);
  },
  _dragStart(ev, id) {
    const t = this._t[id];
    t.dragKey = ev.currentTarget.dataset.key; t.dragMoved = false;
    ev.currentTarget.style.opacity = '0.45';
    try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', t.dragKey); } catch (e) {}
  },
  _dragOver(ev, id) {
    const t = this._t[id];
    if (!t.dragKey) return;
    ev.preventDefault();
    const row = ev.currentTarget;
    if (row.dataset.key !== t.dragKey) row.style.boxShadow = 'inset 0 2px 0 var(--amber)';
  },
  _dragLeave(ev) { ev.currentTarget.style.boxShadow = ''; },
  _drop(ev, id) {
    ev.preventDefault();
    const t = this._t[id], target = ev.currentTarget.dataset.key;
    ev.currentTarget.style.boxShadow = '';
    if (!t.dragKey || t.dragKey === target) return;
    const order = this.order(id).filter(k => k !== t.dragKey);
    order.splice(order.indexOf(target), 0, t.dragKey);     // drop lands above the target row
    this._save(id, 'order', order);
    t.dragMoved = true;
    t.onChange();
  },
  _dragEnd(id) {
    const t = this._t[id];
    document.querySelectorAll('.tt-colrow').forEach(r => { r.style.opacity = ''; r.style.boxShadow = ''; });
    setTimeout(() => { t.dragKey = null; t.dragMoved = false; }, 50);   // let the click after a drag be ignored
  },

  // ---------- column resizing ----------
  // Call after each render with the <table> element.
  initResizers(id, table) {
    if (!table) return;
    table.querySelectorAll(`.tt-resizer[data-tt="${id}"]`).forEach(r => {
      r.addEventListener('click', e => e.stopPropagation());
      r.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const key = r.dataset.key, th = r.closest('th');
        const col = table.querySelector(`col[data-tt-col="${key}"]`);
        const def = this._t[id].defs.find(d => d.key === key);
        const startX = e.clientX, startW = th ? th.offsetWidth : this.width(id, key);
        const startTable = table.offsetWidth;
        let dragged = false, w = startW;
        r.classList.add('active');
        const mv = m => {
          dragged = true;
          w = Math.max(def?.min || 40, startW + (m.clientX - startX));
          if (col) col.style.width = w + 'px';
          table.style.width = (startTable + (w - startW)) + 'px';
        };
        const up = () => {
          r.classList.remove('active');
          document.removeEventListener('mousemove', mv);
          document.removeEventListener('mouseup', up);
          if (!dragged) return;
          const widths = this._load(id, 'widths', {});
          widths[key] = Math.round(w);
          this._save(id, 'widths', widths);
          // Swallow the click that follows mouseup so the header doesn't also sort.
          if (th) {
            const block = e2 => { e2.stopPropagation(); th.removeEventListener('click', block, true); };
            th.addEventListener('click', block, true);
            setTimeout(() => th.removeEventListener('click', block, true), 300);
          }
        };
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
      });
    });
  },
};

// Clicking outside an open Columns popover closes it. A click that re-rendered the
// popover's own contents leaves its target detached — that isn't an outside click.
document.addEventListener('click', e => {
  if (!Object.values(TT._t).some(t => t.popOpen)) return;
  if (!document.body.contains(e.target) || e.target.closest?.('.tt-popwrap')) return;
  TT.closePops();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && Object.values(TT._t).some(t => t.popOpen)) { TT.closePops(); e.stopImmediatePropagation(); }
});
