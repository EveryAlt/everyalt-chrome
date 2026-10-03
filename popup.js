/**
 * EveryAlt Chrome Extension - Popup Logic
 */

import { getSettings } from './lib/utils.js';
import { MODELS, PROVIDERS } from './lib/providers.js';

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const settingsBtn = document.getElementById('settings-btn');

// Check that the selected model's provider has a key
getSettings().then((settings) => {
  const model = MODELS[settings.model].label;
  const provider = PROVIDERS[settings.provider].label;
  if (settings.apiKey && settings.apiKeyValidated) {
    statusDot.className = 'everyalt-status-dot ready';
    statusText.textContent = `Ready · ${model}`;
  } else if (settings.apiKey) {
    statusDot.className = 'everyalt-status-dot warning';
    statusText.textContent = `${provider} API key saved (not yet validated)`;
  } else {
    statusDot.className = 'everyalt-status-dot warning';
    statusText.textContent = `${provider} API key needed`;
  }
});

// Open settings page
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
