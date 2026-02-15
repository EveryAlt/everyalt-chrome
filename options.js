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
