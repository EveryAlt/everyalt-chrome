/**
 * EveryAlt Chrome Extension - Options Page Logic
 */

const DEFAULT_PROMPT =
  'Describe this image in one short, clear sentence suitable for HTML alt text. ' +
  'Do not start with "This image shows" or similar. Output only the alt text, nothing else.';

const DEFAULT_MAX_TOKENS = 1024;

// ── DOM Elements ──────────────────────────────────────────────

const apiKeyInput = document.getElementById('api-key');
const validateBtn = document.getElementById('validate-btn');
const keyStatus = document.getElementById('key-status');

const customPromptInput = document.getElementById('custom-prompt');
const resetPromptBtn = document.getElementById('reset-prompt-btn');

const maxTokensInput = document.getElementById('max-tokens');

const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

// ── Load Saved Settings ───────────────────────────────────────

chrome.storage.local.get(['apiKey', 'apiKeyValidated', 'settings'], (result) => {
  const settings = result.settings || {};

  // API key: show masked placeholder if key exists
  if (result.apiKey) {
    apiKeyInput.placeholder = 'Key saved (enter new key to replace)';
    if (result.apiKeyValidated) {
      setStatus(keyStatus, 'API key is saved and validated.', 'success');
    } else {
      setStatus(keyStatus, 'API key is saved but not yet validated.', 'validating');
    }
  }

  // Prompt
  customPromptInput.value = settings.customPrompt || DEFAULT_PROMPT;

  // Max tokens
  maxTokensInput.value = settings.maxTokens || DEFAULT_MAX_TOKENS;
});

// ── Validate API Key ──────────────────────────────────────────

validateBtn.addEventListener('click', async () => {
  let keyToValidate = apiKeyInput.value.trim();

  // If input is empty, validate the stored key
  if (!keyToValidate) {
    const stored = await getStoredKey();
    if (!stored) {
      setStatus(keyStatus, 'Enter an API key above to validate.', 'error');
      return;
    }
    keyToValidate = stored;
  }

  validateBtn.disabled = true;
  setStatus(keyStatus, 'Validating\u2026', 'validating');

  chrome.runtime.sendMessage(
    { type: 'EVERYALT_VALIDATE_KEY', apiKey: keyToValidate },
    (response) => {
      validateBtn.disabled = false;
      if (response && response.valid) {
        setStatus(keyStatus, response.message, 'success');
      } else {
        setStatus(keyStatus, response?.message || 'Validation failed.', 'error');
      }
    }
  );
});

// ── Reset Prompt ──────────────────────────────────────────────

resetPromptBtn.addEventListener('click', () => {
  customPromptInput.value = DEFAULT_PROMPT;
});

// ── Save Settings ─────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveStatus.textContent = '';
  saveStatus.className = 'everyalt-save-status';

  const newKey = apiKeyInput.value.trim();
  const customPrompt = customPromptInput.value.trim();
  const maxTokens = Math.max(1, Math.min(4096, parseInt(maxTokensInput.value, 10) || DEFAULT_MAX_TOKENS));

  try {
    // If a new key was entered, validate it first
    if (newKey) {
      setStatus(keyStatus, 'Validating new key\u2026', 'validating');

      const validation = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'EVERYALT_VALIDATE_KEY', apiKey: newKey },
          resolve
        );
      });

      if (!validation || !validation.valid) {
        setStatus(keyStatus, validation?.message || 'Invalid API key.', 'error');
        saveBtn.disabled = false;
        saveStatus.textContent = 'Key validation failed. Settings not saved.';
        saveStatus.className = 'everyalt-save-status error';
        return;
      }

      // Save the new key
      await new Promise((resolve) => {
        chrome.storage.local.set(
          { apiKey: newKey, apiKeyValidated: true },
          resolve
        );
      });

      setStatus(keyStatus, 'API key is saved and validated.', 'success');
      apiKeyInput.value = '';
      apiKeyInput.placeholder = 'Key saved (enter new key to replace)';
    }

    // Save other settings
    await new Promise((resolve) => {
      chrome.storage.local.get(['settings', 'metadata'], (result) => {
        const settings = {
          ...(result.settings || {}),
          customPrompt: customPrompt || '',
          maxTokens,
        };
        const metadata = {
          ...(result.metadata || {}),
          lastUpdated: Date.now(),
          version: '1.0.0',
        };
        chrome.storage.local.set({ settings, metadata }, resolve);
      });
    });

    saveStatus.textContent = 'Settings saved!';
    saveStatus.className = 'everyalt-save-status success';
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'everyalt-save-status';
    }, 3000);
  } catch (err) {
    saveStatus.textContent = 'Error: ' + err.message;
    saveStatus.className = 'everyalt-save-status error';
  }

  saveBtn.disabled = false;
});

// ── Generation Log ────────────────────────────────────────────

const logContainer = document.getElementById('log-container');
const logTotals = document.getElementById('log-totals');
const clearLogBtn = document.getElementById('clear-log-btn');

function loadLog() {
  chrome.storage.local.get(['generationLog'], (result) => {
    const log = result.generationLog || [];
    if (log.length === 0) {
      logContainer.innerHTML =
        '<p class="everyalt-log-empty">No generations yet. Right-click an image to get started.</p>';
      logTotals.style.display = 'none';
      return;
    }

    renderLog(log);
  });
}

function renderLog(log) {
  logContainer.innerHTML = '';
  let totalTokens = 0;
  let totalCostUsd = 0;
  let successCount = 0;
  let errorCount = 0;

  log.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'everyalt-log-row' + (entry.status === 'error' ? ' is-error' : '');

    // Timestamp
    const time = document.createElement('span');
    time.className = 'everyalt-log-time';
    time.textContent = formatTime(entry.timestamp);
    row.appendChild(time);

    // Main content
    const body = document.createElement('div');
    body.className = 'everyalt-log-body';

    if (entry.status === 'success') {
      successCount++;
      const altEl = document.createElement('p');
      altEl.className = 'everyalt-log-alt';
      altEl.textContent = entry.altText || '(empty)';
      body.appendChild(altEl);

      const meta = document.createElement('span');
      meta.className = 'everyalt-log-meta';
      const tokens = entry.cost?.tokens?.total || 0;
      const cents = entry.cost?.costCents || '—';
      meta.textContent = `${tokens} tokens \u00B7 ${cents}`;
      totalTokens += tokens;
      totalCostUsd += entry.cost?.totalUsd || 0;
      body.appendChild(meta);
    } else {
      errorCount++;
      const errEl = document.createElement('p');
      errEl.className = 'everyalt-log-error-msg';
      errEl.textContent = entry.error || 'Unknown error';
      body.appendChild(errEl);
    }

    // Image URL (truncated)
    if (entry.imageUrl) {
      const urlEl = document.createElement('span');
      urlEl.className = 'everyalt-log-url';
      urlEl.title = entry.imageUrl;
      urlEl.textContent = truncateUrl(entry.imageUrl, 60);
      body.appendChild(urlEl);
    }

    row.appendChild(body);
    logContainer.appendChild(row);
  });

  // Totals bar
  if (successCount > 0) {
    const totalCents = (totalCostUsd * 100).toFixed(4) + '\u00A2';
    logTotals.textContent =
      `${successCount} generation${successCount !== 1 ? 's' : ''}` +
      (errorCount > 0 ? `, ${errorCount} error${errorCount !== 1 ? 's' : ''}` : '') +
      ` \u00B7 ${totalTokens.toLocaleString()} total tokens \u00B7 ${totalCents} total cost`;
    logTotals.style.display = '';
  } else {
    logTotals.textContent = `${errorCount} error${errorCount !== 1 ? 's' : ''}`;
    logTotals.style.display = '';
  }
}

clearLogBtn.addEventListener('click', () => {
  chrome.storage.local.set({ generationLog: [] }, () => {
    loadLog();
  });
});

// Load log on page open
loadLog();

// Refresh log when storage changes (e.g., new generation while page is open)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.generationLog) {
    loadLog();
  }
});

// ── Helpers ─────────────────────────────────────────────────

function setStatus(el, text, className) {
  el.textContent = text;
  el.className = 'everyalt-status ' + (className || '');
}

function getStoredKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey'], (result) => {
      resolve(result.apiKey || '');
    });
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Show date if not today
  if (d.toDateString() !== now.toDateString()) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
  }
  return timeStr;
}

function truncateUrl(url, max) {
  if (!url) return '';
  if (url.startsWith('data:')) return '(data URL)';
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '\u2026';
}
