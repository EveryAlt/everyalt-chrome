/**
 * EveryAlt Chrome Extension - Options Page Logic
 */

import { MODELS, PROVIDERS, PRICES_AS_OF, formatPrice, modelDisplayName } from './lib/providers.js';
import { DEFAULT_PROMPT, DEFAULT_MAX_TOKENS } from './lib/ai-api.js';
import { getSettings, migrateStorage, EXTENSION_VERSION } from './lib/utils.js';

// ── DOM Elements ──────────────────────────────────────────────

const modelList = document.querySelector('.everyalt-model-list');
const customPromptInput = document.getElementById('custom-prompt');
const resetPromptBtn = document.getElementById('reset-prompt-btn');
const maxTokensInput = document.getElementById('max-tokens');
const saveBtn = document.getElementById('save-btn');
const saveStatus = document.getElementById('save-status');

const keyInput = (provider) => document.getElementById(`key-${provider}`);
const keyStatus = (provider) => document.querySelector(`[data-status="${provider}"]`);
const keyBadge = (provider) => document.querySelector(`[data-badge="${provider}"]`);

document.getElementById('ext-version').textContent = EXTENSION_VERSION;
document.getElementById('prices-as-of').textContent = new Date(PRICES_AS_OF + 'T12:00:00')
  .toLocaleDateString([], { month: 'long', year: 'numeric' });

// ── Model Picker ──────────────────────────────────────────────

function renderModelList(selected) {
  modelList.textContent = '';
  const legend = document.createElement('legend');
  legend.className = 'everyalt-sr-only';
  legend.textContent = 'AI model';
  modelList.appendChild(legend);

  Object.entries(MODELS).forEach(([slug, model]) => {
    const label = document.createElement('label');
    label.className = 'everyalt-model-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'model';
    radio.value = slug;
    radio.checked = slug === selected;
    radio.addEventListener('change', showSelectedProviderKey);

    const name = document.createElement('strong');
    name.textContent = model.label;
    const provider = document.createElement('span');
    provider.className = 'everyalt-model-provider';
    provider.textContent = PROVIDERS[model.provider].label;
    const price = document.createElement('span');
    price.className = 'everyalt-model-price';
    price.textContent = `$${formatPrice(model.inputPrice)} input · $${formatPrice(model.outputPrice)} output per 1M tokens`;

    label.append(radio, name, provider, price);
    modelList.appendChild(label);
  });

  const links = document.getElementById('pricing-links');
  links.textContent = '';
  Object.values(PROVIDERS).forEach((def, i) => {
    if (i) links.append(' · ');
    const a = document.createElement('a');
    a.href = def.pricingUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `${def.label} pricing`;
    const sr = document.createElement('span');
    sr.className = 'everyalt-sr-only';
    sr.textContent = ' (opens in a new tab)';
    a.appendChild(sr);
    links.appendChild(a);
  });
}

function selectedModel() {
  const checked = modelList.querySelector('input[name="model"]:checked');
  return checked ? checked.value : null;
}

// Show only the API key block for the selected model's provider.
function showSelectedProviderKey() {
  const slug = selectedModel();
  const provider = slug ? MODELS[slug].provider : 'openai';
  document.querySelectorAll('.everyalt-provider-key').forEach((block) => {
    block.hidden = block.dataset.provider !== provider;
  });
}

// ── Load Saved Settings ───────────────────────────────────────

async function load() {
  await migrateStorage();
  const settings = await getSettings();

  renderModelList(settings.model);
  showSelectedProviderKey();

  Object.keys(PROVIDERS).forEach((provider) => {
    const saved = !!settings.apiKeys[provider];
    keyBadge(provider).textContent = saved ? 'Key saved' : 'No key saved';
    keyBadge(provider).className = 'everyalt-key-badge ' + (saved ? 'is-saved' : 'is-missing');
    if (saved) {
      keyInput(provider).placeholder = 'Key saved (enter new key to replace)';
      if (!settings.apiKeysValidated[provider]) {
        setStatus(keyStatus(provider), 'API key is saved but not yet validated.', 'validating');
      }
    }
  });

  customPromptInput.value = settings.customPrompt || DEFAULT_PROMPT;
  maxTokensInput.value = settings.maxTokens || DEFAULT_MAX_TOKENS;
}

// ── Busy buttons ──────────────────────────────────────────────
// aria-disabled instead of disabled, so keyboard focus stays on the button while it works.

function isBusy(btn) { return btn.getAttribute('aria-disabled') === 'true'; }
function setBusy(btn, busy) {
  if (busy) btn.setAttribute('aria-disabled', 'true');
  else btn.removeAttribute('aria-disabled');
}

// ── Validate API Key ──────────────────────────────────────────

function validateKey(provider, apiKey) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'EVERYALT_VALIDATE_KEY', provider, apiKey }, resolve);
  });
}

document.querySelectorAll('.everyalt-validate').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (isBusy(btn)) return;
    const provider = btn.dataset.provider;
    const status = keyStatus(provider);
    let key = keyInput(provider).value.trim();
    if (!key) {
      key = (await getSettings()).apiKeys[provider] || '';
      if (!key) {
        setStatus(status, 'Enter an API key above to validate.', 'error');
        return;
      }
    }
    setBusy(btn, true);
    setStatus(status, 'Validating…', 'validating');
    const response = await validateKey(provider, key);
    setBusy(btn, false);
    setStatus(status, response?.message || 'Validation failed.', response?.valid ? 'success' : 'error');
  });
});

// ── Reset Prompt ──────────────────────────────────────────────

resetPromptBtn.addEventListener('click', () => {
  customPromptInput.value = DEFAULT_PROMPT;
});

// ── Save Settings ─────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
  if (isBusy(saveBtn)) return;
  setBusy(saveBtn, true);
  saveStatus.textContent = '';
  saveStatus.className = 'everyalt-save-status';

  const customPrompt = customPromptInput.value.trim();
  const maxTokens = Math.max(1, Math.min(4096, parseInt(maxTokensInput.value, 10) || DEFAULT_MAX_TOKENS));
  const model = selectedModel();

  try {
    // Validate every newly entered key before saving anything, so a typo doesn't half-save the form.
    const newKeys = {};
    for (const provider of Object.keys(PROVIDERS)) {
      const key = keyInput(provider).value.trim();
      if (!key) continue;
      setStatus(keyStatus(provider), 'Validating new key…', 'validating');
      const validation = await validateKey(provider, key);
      if (!validation || !validation.valid) {
        setStatus(keyStatus(provider), validation?.message || 'Invalid API key.', 'error');
        saveStatus.textContent = `${PROVIDERS[provider].label} key validation failed. Settings not saved.`;
        saveStatus.className = 'everyalt-save-status error';
        setBusy(saveBtn, false);
        return;
      }
      newKeys[provider] = key;
    }

    await new Promise((resolve) => {
      chrome.storage.local.get(['apiKeys', 'apiKeysValidated', 'settings', 'metadata'], (result) => {
        const apiKeys = { ...(result.apiKeys || {}), ...newKeys };
        const apiKeysValidated = { ...(result.apiKeysValidated || {}) };
        Object.keys(newKeys).forEach((p) => { apiKeysValidated[p] = true; });
        const settings = {
          ...(result.settings || {}),
          customPrompt: customPrompt || '',
          maxTokens,
          ...(model ? { model } : {}),
        };
        const metadata = { ...(result.metadata || {}), lastUpdated: Date.now(), version: EXTENSION_VERSION };
        chrome.storage.local.set({ apiKeys, apiKeysValidated, settings, metadata }, resolve);
      });
    });

    Object.keys(newKeys).forEach((provider) => {
      setStatus(keyStatus(provider), 'API key is saved and validated.', 'success');
      keyInput(provider).value = '';
      keyInput(provider).placeholder = 'Key saved (enter new key to replace)';
      keyBadge(provider).textContent = 'Key saved';
      keyBadge(provider).className = 'everyalt-key-badge is-saved';
    });

    const settings = await getSettings();
    saveStatus.textContent = settings.apiKey
      ? 'Settings saved!'
      : `Settings saved. Add a ${PROVIDERS[settings.provider].label} API key to use ${MODELS[settings.model].label}.`;
    saveStatus.className = 'everyalt-save-status ' + (settings.apiKey ? 'success' : 'error');
    if (settings.apiKey) {
      setTimeout(() => {
        saveStatus.textContent = '';
        saveStatus.className = 'everyalt-save-status';
      }, 3000);
    }
  } catch (err) {
    saveStatus.textContent = 'Error: ' + err.message;
    saveStatus.className = 'everyalt-save-status error';
  }

  setBusy(saveBtn, false);
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

    // Entries from 1.0 have no model; they were all gpt-5-nano.
    const modelName = modelDisplayName(entry.model || 'gpt-5-nano');

    if (entry.status === 'success') {
      successCount++;
      const altEl = document.createElement('p');
      altEl.className = 'everyalt-log-alt';
      altEl.textContent = entry.altText || '(empty)';
      body.appendChild(altEl);

      const meta = document.createElement('span');
      meta.className = 'everyalt-log-meta';
      const tokens = entry.cost?.tokens?.total || 0;
      const thinking = entry.cost?.tokens?.thinking || 0;
      const cents = entry.cost?.costCents || '—';
      meta.textContent = `${modelName} · ${tokens} tokens` +
        (thinking ? ` (${thinking} thinking)` : '') + ` · ${cents}`;
      totalTokens += tokens;
      totalCostUsd += entry.cost?.totalUsd || 0;
      body.appendChild(meta);
    } else {
      errorCount++;
      const errEl = document.createElement('p');
      errEl.className = 'everyalt-log-error-msg';
      errEl.textContent = entry.error || 'Unknown error';
      body.appendChild(errEl);

      const meta = document.createElement('span');
      meta.className = 'everyalt-log-meta';
      meta.textContent = modelName;
      body.appendChild(meta);
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
    const totalCents = (totalCostUsd * 100).toFixed(4) + '¢';
    logTotals.textContent =
      `${successCount} generation${successCount !== 1 ? 's' : ''}` +
      (errorCount > 0 ? `, ${errorCount} error${errorCount !== 1 ? 's' : ''}` : '') +
      ` · ${totalTokens.toLocaleString()} total tokens · ${totalCents} total cost`;
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

// Load settings and log on page open
load();
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
  return url.slice(0, max - 1) + '…';
}
