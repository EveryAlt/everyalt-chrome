/**
 * EveryAlt Chrome Extension - Popup Logic
 */

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const settingsBtn = document.getElementById('settings-btn');

// Check if API key is configured
chrome.storage.local.get(['apiKey', 'apiKeyValidated'], (result) => {
  if (result.apiKey && result.apiKeyValidated) {
    statusDot.className = 'everyalt-status-dot ready';
    statusText.textContent = 'Ready to use';
  } else if (result.apiKey) {
    statusDot.className = 'everyalt-status-dot warning';
    statusText.textContent = 'API key saved (not yet validated)';
  } else {
    statusDot.className = 'everyalt-status-dot warning';
    statusText.textContent = 'API key needed';
  }
});

// Open settings page
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
