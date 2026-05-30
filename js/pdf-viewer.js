// ============================================================================
// pdf-viewer.js — Shared PDF viewer modal for NUWorkspace
//
// Usage:
//   openPdfViewer({
//     bucket:   'cmmc-documents' | 'hr-documents',
//     path:     '<storage path within bucket>',
//     filename: 'OriginalFile.pdf',     // used for Download
//     title:    'Display Title in Header'
//   });
//
// Renders the PDF via a 60-min signed URL inside an <iframe>. On mobile
// (narrow viewports) the iframe is replaced with an "Open in new tab" link
// because mobile Safari/Chrome iframe PDF rendering is unreliable.
//
// Buttons in modal header:
//   - Print  (proxies into the iframe's contentWindow.print() when same-origin
//             permits, otherwise opens the signed URL in a new window with print)
//   - Download (forces a save of the original file via Supabase download())
//   - Close
//
// No new dependencies. Browser-native PDF toolbar is kept enabled inside
// the iframe.
// ============================================================================

(function () {
  const SIGNED_URL_TTL_SECONDS = 60 * 60; // 60 minutes
  const MOBILE_BREAKPOINT_PX   = 768;

  function _isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT_PX;
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _closePdfViewer() {
    const el = document.getElementById('pdfViewerBackdrop');
    if (el) el.remove();
    document.removeEventListener('keydown', _onKeydown);
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') _closePdfViewer();
  }

  async function _getSignedUrl(bucket, path) {
    if (typeof sb === 'undefined' || !sb || !sb.storage) {
      throw new Error('Supabase client not available.');
    }
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    if (!data || !data.signedUrl) throw new Error('No signed URL returned.');
    return data.signedUrl;
  }

  async function _downloadOriginal(bucket, path, filename) {
    try {
      const { data, error } = await sb.storage
        .from(bucket)
        .download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a   = document.createElement('a');
      a.href = url;
      a.download = filename || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('Download failed: ' + (err.message || err));
    }
  }

  function _printPdf(signedUrl) {
    // Cross-origin iframe content cannot be directly printed via JS.
    // Opening the signed URL in a new window and calling print() there is
    // the most reliable approach across browsers.
    const w = window.open(signedUrl, '_blank');
    if (!w) {
      alert('Please allow pop-ups to print, or use the print button inside the PDF viewer toolbar.');
      return;
    }
    // The PDF will load in the new tab; user can hit print or the browser-native
    // PDF toolbar there. Auto-triggering print() before the PDF is loaded is
    // unreliable, so we leave it to the user.
  }

  /**
   * Open the PDF viewer modal.
   * @param {Object} opts
   * @param {string} opts.bucket    Supabase Storage bucket name
   * @param {string} opts.path      Object path within the bucket
   * @param {string} opts.filename  Original filename for Download button
   * @param {string} opts.title     Header title text
   */
  async function openPdfViewer(opts) {
    const { bucket, path, filename, title } = opts || {};
    if (!bucket || !path) {
      console.error('openPdfViewer: bucket and path are required');
      return;
    }

    // Build the modal shell immediately with a loading state.
    _closePdfViewer();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop pdf-viewer-backdrop';
    backdrop.id = 'pdfViewerBackdrop';
    backdrop.onclick = e => { if (e.target === backdrop) _closePdfViewer(); };

    backdrop.innerHTML = `
      <div class="modal pdf-viewer-modal">
        <div class="modal-header pdf-viewer-header">
          <div class="modal-title pdf-viewer-title">📄 ${_esc(title || filename || 'Document')}</div>
          <button class="pdf-viewer-action" id="pdfViewerPrintBtn" type="button" title="Print">🖨 Print</button>
          <button class="pdf-viewer-action" id="pdfViewerDownloadBtn" type="button" title="Download">⬇ Download</button>
          <button class="modal-close" type="button" onclick="closePdfViewer()" title="Close">✕</button>
        </div>
        <div class="pdf-viewer-body" id="pdfViewerBody">
          <div class="pdf-viewer-loading">
            <div class="pdf-viewer-spinner"></div>
            <div style="margin-top:12px;color:var(--muted);font-size:13px">Preparing document…</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    document.addEventListener('keydown', _onKeydown);

    // Wire header buttons (Download works without signed URL; Print needs it).
    document.getElementById('pdfViewerDownloadBtn').onclick = () =>
      _downloadOriginal(bucket, path, filename);

    // Fetch signed URL and render iframe / mobile fallback.
    let signedUrl;
    try {
      signedUrl = await _getSignedUrl(bucket, path);
    } catch (err) {
      const body = document.getElementById('pdfViewerBody');
      if (body) {
        body.innerHTML = `
          <div class="pdf-viewer-error">
            <div style="font-size:22px;margin-bottom:8px">⚠</div>
            <div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:6px">Could not load document</div>
            <div style="font-size:12px;color:var(--muted)">${_esc(err.message || err)}</div>
          </div>`;
      }
      return;
    }

    // Now we have a URL — wire Print and render the body.
    document.getElementById('pdfViewerPrintBtn').onclick = () => _printPdf(signedUrl);

    const body = document.getElementById('pdfViewerBody');
    if (!body) return;

    if (_isMobile()) {
      body.innerHTML = `
        <div class="pdf-viewer-mobile-fallback">
          <div style="font-size:32px;margin-bottom:10px">📄</div>
          <div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:8px">Best viewed in a new tab on mobile</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:18px;max-width:320px">Mobile browsers don't reliably render embedded PDFs. Tap below to open the document.</div>
          <a href="${_esc(signedUrl)}" target="_blank" rel="noopener"
             style="display:inline-block;background:var(--amber);color:#0e0e0f;padding:10px 18px;border-radius:8px;font-size:13.5px;font-weight:600;text-decoration:none">
            Open document
          </a>
        </div>`;
    } else {
      // Browser-native PDF rendering. Toolbar kept enabled.
      body.innerHTML = `<iframe class="pdf-viewer-iframe" src="${_esc(signedUrl)}" title="${_esc(title || filename || 'Document')}"></iframe>`;
    }
  }

  // Expose globally
  window.openPdfViewer  = openPdfViewer;
  window.closePdfViewer = _closePdfViewer;
})();
