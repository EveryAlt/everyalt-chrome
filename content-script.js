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

    // Alt text in an editable textarea (easy to select all or make quick edits)
    const textarea = el('textarea', `${PREFIX}-alt-textarea`);
    textarea.value = altText;
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
      navigator.clipboard.writeText(textarea.value).then(() => {
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
    logoSvg.setAttribute('viewBox', '0 0 512 512');
    logoSvg.setAttribute('width', '20');
    logoSvg.setAttribute('height', '20');
    logoSvg.innerHTML =
      '<path d="M0 0 C15.51 0 31.02 0 47 0 C47 9.9 47 19.8 47 30 C161.18 30 275.36 30 393 30 C393 136.92 393 243.84 393 354 C239.22 354 85.44 354 -73 354 C-73 247.08 -73 140.16 -73 30 C-48.91 30 -24.82 30 0 30 C0 20.1 0 10.2 0 0 Z M-48 55 C-48 86.68 -48 118.36 -48 151 C-24.91352926 151.48131195 -24.91352926 151.48131195 -1.82635117 151.80406189 C6.43726459 151.8924523 14.69827348 152.0043235 22.95996094 152.20703125 C29.50547103 152.36755319 36.04900789 152.46996766 42.59643173 152.50541592 C46.05798768 152.5261137 49.5139045 152.57396217 52.97363281 152.69168091 C70.59015063 153.55584436 70.59015063 153.55584436 85.45278931 145.35850525 C88.00091442 142.62333181 90.32652702 139.7816645 92.57098389 136.79393005 C95.67289156 132.89991841 99.74249919 130.45812726 104 128 C104.59329102 127.6488916 105.18658203 127.2977832 105.79785156 126.93603516 C129.78669616 112.88273703 157.69132141 107.97289999 184.94580078 114.45654297 C201.14468037 118.74210346 221.52670373 127.11387924 231.35502625 141.26908875 C235.0034768 146.19640495 238.75524186 150.17519156 244.85815811 151.7265358 C252.792886 152.76821565 260.77936823 152.53738499 268.76118684 152.31812119 C272.2575044 152.23608419 275.75401291 152.22915896 279.25114441 152.21379089 C285.85361097 152.17360393 292.45323304 152.06724288 299.05445451 151.93624753 C307.31765523 151.77588037 315.58133149 151.70535056 323.84570312 151.63476562 C338.56601022 151.50864983 353.28012289 151.24819507 368 151 C368 119.32 368 87.64 368 55 C230.72 55 93.44 55 -48 55 Z M97 157 C96.3296875 157.65742188 95.659375 158.31484375 94.96875 158.9921875 C80.39664472 174.42537172 73.52912735 197.32495257 73.8515625 218.21875 C74.94941363 238.78901319 82.24172993 257.61279085 96 273 C97.10794922 274.24910156 97.10794922 274.24910156 98.23828125 275.5234375 C114.31780269 292.62931137 136.47565903 301.24227869 159.734375 301.99609375 C183.85471527 302.29569147 205.01368579 291.83025898 222.0625 275.375 C236.10300096 261.36985441 245.14287211 240.86300713 246 221 C246.03996094 220.26136719 246.07992187 219.52273438 246.12109375 218.76171875 C246.74804663 196.22829474 239.01875521 174.79693205 224 158 C223.26136719 157.16726562 222.52273438 156.33453125 221.76171875 155.4765625 C207.69290745 140.50974197 187.77113678 130.59922428 167.1875 129.68359375 C139.20178339 128.93489051 116.98929069 137.29791176 97 157 Z " fill="#0750b6" transform="translate(96,79)"/>' +
      '<path d="M0 0 C14.17819241 -0.64540964 26.50188509 4.18225429 37.1875 13.29296875 C47.73616395 23.22731783 52.37496363 34.6517882 54.03515625 48.8671875 C54.45058316 63.48502179 48.35998574 76.50941967 38.72265625 87.19140625 C27.38220329 97.21016613 15.09200706 101.74812613 0.046875 101.43359375 C-14.0993207 100.4029661 -26.4553201 94.20768236 -36.12109375 83.8671875 C-44.67708035 73.24970413 -49.37911116 59.84108027 -48.27734375 46.19140625 C-46.07989237 31.49827796 -39.49505602 19.31977041 -27.640625 10.15234375 C-19.17809701 4.47846621 -10.1672279 0.85453545 0 0 Z " fill="#0750b6" transform="translate(253.27734375,243.80859375)"/>';
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
