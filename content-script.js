/**
 * EveryAlt Chrome Extension - Content Script
 *
 * Injected into web pages. Responsibilities:
 *  - Listen for messages from service worker
 *  - Show loading spinner overlay
 *  - Show alt-text result modal with copy/regenerate/close
 *  - Show error messages
 *  - Fetch images on behalf of service worker (CORS fallback)
 */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__everyaltInjected) return;
  window.__everyaltInjected = true;

  const PREFIX = 'everyalt';

  // ── State ───────────────────────────────────────────────────────

  let currentModal = null;
  let currentImageUrl = null;

  // ── Message Listener ────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case 'EVERYALT_SHOW_LOADING':
        showLoading();
        break;

      case 'EVERYALT_SHOW_RESULT':
        currentImageUrl = request.imageUrl;
        showResult(request.altText, request.cost);
        break;

      case 'EVERYALT_SHOW_ERROR':
        showError(request.message, request.actionUrl);
        break;

      case 'EVERYALT_FETCH_IMAGE':
        fetchImageAsBase64(request.imageUrl)
          .then((data) => sendResponse({ success: true, data }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // async

      default:
        break;
    }
  });

  // ── Loading State ───────────────────────────────────────────────

  function showLoading() {
    removeModal();

    const modal = createModalShell();
    const body = modal.querySelector(`.${PREFIX}-modal-body`);
    body.innerHTML = '';

    const spinner = el('div', `${PREFIX}-spinner`);
    for (let i = 0; i < 3; i++) {
      spinner.appendChild(el('span', `${PREFIX}-spinner-dot`));
    }

    const text = el('p', `${PREFIX}-loading-text`);
    text.textContent = 'Generating alt text\u2026';

    body.appendChild(spinner);
    body.appendChild(text);

    // Hide action buttons during loading
    const actions = modal.querySelector(`.${PREFIX}-modal-actions`);
    if (actions) actions.style.display = 'none';

    document.body.appendChild(modal);
    currentModal = modal;
  }

  // ── Result Modal ────────────────────────────────────────────────

  function showResult(altText, cost) {
    removeModal();

    const modal = createModalShell();
    const body = modal.querySelector(`.${PREFIX}-modal-body`);
    body.innerHTML = '';

    // Alt text in a readonly textarea (easy to select all)
    const textarea = el('textarea', `${PREFIX}-alt-textarea`);
    textarea.value = altText;
    textarea.readOnly = true;
    textarea.rows = 3;
    textarea.setAttribute('aria-label', 'Generated alt text');
    body.appendChild(textarea);

    // Cost info
    if (cost && cost.costCents) {
      const costEl = el('p', `${PREFIX}-cost-info`);
      costEl.textContent = `Est. cost: ${cost.costCents}`;
      if (cost.tokens) {
        costEl.textContent += ` (${cost.tokens.total} tokens)`;
      }
      body.appendChild(costEl);
    }

    // Action buttons
    const actions = modal.querySelector(`.${PREFIX}-modal-actions`);
    actions.style.display = '';
    actions.innerHTML = '';

    const copyBtn = el('button', `${PREFIX}-btn ${PREFIX}-btn-primary`);
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(altText).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add(`${PREFIX}-btn-success`);
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove(`${PREFIX}-btn-success`);
        }, 2000);
      });
    });

    const regenBtn = el('button', `${PREFIX}-btn ${PREFIX}-btn-secondary`);
    regenBtn.textContent = 'Regenerate';
    regenBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'EVERYALT_REGENERATE',
        imageUrl: currentImageUrl,
      });
    });

    const closeBtn = el('button', `${PREFIX}-btn ${PREFIX}-btn-ghost`);
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => removeModal());

    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);
    actions.appendChild(closeBtn);

    document.body.appendChild(modal);
    currentModal = modal;

    // Auto-select the textarea content
    textarea.focus();
    textarea.select();
  }

  // ── Error Modal ─────────────────────────────────────────────────

  function showError(message, actionUrl) {
    removeModal();

    const modal = createModalShell();
    const body = modal.querySelector(`.${PREFIX}-modal-body`);
    body.innerHTML = '';

    const errorBox = el('div', `${PREFIX}-error-box`);
    const errorText = el('p', `${PREFIX}-error-text`);
    errorText.textContent = message || 'An error occurred.';
    errorBox.appendChild(errorText);

    if (actionUrl) {
      const link = document.createElement('a');
      link.href = actionUrl;
      link.target = '_blank';
      link.className = `${PREFIX}-error-link`;
      link.textContent = 'Open Settings';
      errorBox.appendChild(link);
    }

    body.appendChild(errorBox);

    const actions = modal.querySelector(`.${PREFIX}-modal-actions`);
    actions.style.display = '';
    actions.innerHTML = '';

    const closeBtn = el('button', `${PREFIX}-btn ${PREFIX}-btn-ghost`);
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => removeModal());
    actions.appendChild(closeBtn);

    document.body.appendChild(modal);
    currentModal = modal;
  }

  // ── Modal Shell (shared structure) ──────────────────────────────

  function createModalShell() {
    const overlay = el('div', `${PREFIX}-overlay`);

    // Backdrop (click to close)
    const backdrop = el('div', `${PREFIX}-backdrop`);
    backdrop.addEventListener('click', () => removeModal());
    overlay.appendChild(backdrop);

    // Modal container
    const modal = el('div', `${PREFIX}-modal`);

    // Header
    const header = el('div', `${PREFIX}-modal-header`);

    const logo = el('div', `${PREFIX}-modal-logo`);
    const logoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logoSvg.setAttribute('viewBox', '0 0 24 24');
    logoSvg.setAttribute('width', '20');
    logoSvg.setAttribute('height', '20');
    logoSvg.setAttribute('fill', 'none');
    logoSvg.setAttribute('stroke', '#0750b6');
    logoSvg.setAttribute('stroke-width', '2');
    logoSvg.setAttribute('stroke-linecap', 'round');
    logoSvg.setAttribute('stroke-linejoin', 'round');
    logoSvg.innerHTML =
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
      '<circle cx="8.5" cy="8.5" r="1.5"/>' +
      '<polyline points="21 15 16 10 5 21"/>';
    logo.appendChild(logoSvg);

    const title = el('span', `${PREFIX}-modal-title`);
    title.textContent = 'EveryAlt';
    logo.appendChild(title);
    header.appendChild(logo);

    const closeX = el('button', `${PREFIX}-close-x`);
    closeX.innerHTML = '&times;';
    closeX.setAttribute('aria-label', 'Close');
    closeX.addEventListener('click', () => removeModal());
    header.appendChild(closeX);

    modal.appendChild(header);

    // Body (filled by show* functions)
    const body = el('div', `${PREFIX}-modal-body`);
    modal.appendChild(body);

    // Actions (filled by show* functions)
    const actions = el('div', `${PREFIX}-modal-actions`);
    modal.appendChild(actions);

    overlay.appendChild(modal);

    // ESC key handler
    overlay._escHandler = (e) => {
      if (e.key === 'Escape') removeModal();
    };
    document.addEventListener('keydown', overlay._escHandler);

    return overlay;
  }

  // ── Remove Modal ────────────────────────────────────────────────

  function removeModal() {
    if (currentModal) {
      if (currentModal._escHandler) {
        document.removeEventListener('keydown', currentModal._escHandler);
      }
      currentModal.remove();
      currentModal = null;
    }
  }

  // ── Image Fetch + Resize (CORS fallback for service worker) ─────

  const MAX_DIMENSION = 300;

  async function fetchImageAsBase64(url) {
    let blob;

    if (url.startsWith('data:')) {
      const res = await fetch(url);
      blob = await res.blob();
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
      blob = await response.blob();
    }

    if (blob.size > 20 * 1024 * 1024) {
      throw new Error('Image is too large (over 20 MB).');
    }

    // Resize to MAX_DIMENSION on largest side
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to encode resized image.'));
      reader.readAsDataURL(outBlob);
    });
  }

  // ── DOM Helpers ─────────────────────────────────────────────────

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
})();
