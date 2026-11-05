// ==============================================================
// js/version.js — build number and "new version available" notice
// ==============================================================
// The deploy workflow (.github/workflows/deploy.yml) stamps each deploy:
//   <meta name="nuw-build" content="BUILD|COMMIT|BUILT-AT">  in index.html
//   version.json  {"build":N,"sha":"abc1234","built":"…Z"}  next to it
// The meta tag says which build this page is running; version.json says
// which build is live now. When they differ, offer a reload.
// Running locally (localhost) the meta still says "dev", so nothing is compared.
(function () {
  const POLL_MS = 5 * 60 * 1000;
  let running = null;     // { build, sha, built } this page was built as, or null for local dev
  let noticed = false;

  function readMeta() {
    const c = document.querySelector('meta[name="nuw-build"]')?.content || 'dev';
    const [build, sha, built] = c.split('|');
    return build && sha ? { build: Number(build), sha, built } : null;
  }

  // Two short lines so it fits the account menu: "Build 12 · 222e7ba" / "Nov 5, 3:10 PM".
  function lines(v) {
    if (!v) return ['NUWorkspace', 'Local dev build'];
    const d = v.built ? new Date(v.built) : null;
    const when = d && !isNaN(d) ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return ['Build ' + v.build + ' \u00b7 ' + v.sha, when].filter(Boolean);
  }

  function paint() {
    const el = document.getElementById('appVersion');
    if (!el) return;
    el.textContent = '';
    lines(running).forEach((t, i) => { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(t)); });
    el.title = running ? 'NUWorkspace build ' + running.build + ', commit ' + running.sha : 'Not a deployed build';
  }

  async function fetchLive() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  function showNotice(live) {
    if (noticed || document.getElementById('nuwUpdateNotice')) return;
    noticed = true;
    const n = document.createElement('div');
    n.id = 'nuwUpdateNotice';
    n.setAttribute('role', 'status');
    n.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10000;' +
      'display:flex;align-items:center;gap:14px;padding:10px 12px 10px 16px;border-radius:10px;' +
      'background:var(--surface,#fff);color:var(--text,#111);border:1.5px solid var(--amber,#c8860a);' +
      'box-shadow:0 8px 28px rgba(0,0,0,.18);font-family:"DM Sans",sans-serif;font-size:13px;';
    n.innerHTML = '<span>A new version of Workspace is available <span style="color:var(--muted,#777)">(build ' +
      Number(live.build) + ')</span>. Save anything you\'re working on, then reload.</span>' +
      '<button type="button" style="background:var(--amber,#c8860a);color:#fff;border:none;border-radius:7px;' +
      'padding:7px 14px;font:600 12.5px \'DM Sans\',sans-serif;cursor:pointer">Reload</button>' +
      '<button type="button" title="Later" style="background:none;border:none;color:var(--muted,#777);font-size:16px;cursor:pointer;padding:2px 6px">&#x2715;</button>';
    const [reloadBtn, laterBtn] = n.querySelectorAll('button');
    reloadBtn.onclick = () => location.reload();
    laterBtn.onclick = () => n.remove();   // stays dismissed until the page is reloaded
    document.body.appendChild(n);
  }

  async function check() {
    if (!running || noticed) return;
    const live = await fetchLive();
    if (live && live.sha && live.sha !== running.sha) showNotice(live);
  }

  function init() {
    running = readMeta();
    paint();
    if (!running) return;
    setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    check();
  }

  window.nuwBuild = () => running;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
