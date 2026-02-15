/**
 * EveryAlt - Utility helpers.
 */

/**
 * Convert an image URL to a base64 data URL.
 * Works for same-origin and cross-origin images (service worker has broad fetch access).
 * @param {string} url - Image URL
 * @returns {Promise<string>} base64 data URL (data:image/...;base64,...)
 */
export async function imageUrlToBase64(url) {
  // If it's already a data URL, return as-is
  if (url.startsWith('data:')) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }

  const blob = await response.blob();

  // Validate it's actually an image
  if (!blob.type.startsWith('image/')) {
    throw new Error(`URL did not return an image (got ${blob.type})`);
  }

  // Check size (4MB limit to keep API costs reasonable)
  const MAX_SIZE = 4 * 1024 * 1024;
  if (blob.size > MAX_SIZE) {
    throw new Error('Image is too large (over 4MB). Try a smaller image.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to encode image.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Get saved settings from chrome.storage.local, with defaults applied.
 * @returns {Promise<object>}
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['apiKey', 'apiKeyValidated', 'settings', 'metadata'],
      (result) => {
        const settings = result.settings || {};
        resolve({
          apiKey: result.apiKey || '',
          apiKeyValidated: result.apiKeyValidated || false,
          model: settings.model || 'gpt-5-nano',
          maxTokens: settings.maxTokens || 1024,
          customPrompt: settings.customPrompt || '',
          imageDetail: settings.imageDetail || 'low',
          metadata: result.metadata || {},
        });
      }
    );
  });
}

/**
 * Save settings to chrome.storage.local.
 * @param {object} updates - Key/value pairs to merge into settings.
 */
export async function saveSettings(updates) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings', 'metadata'], (result) => {
      const settings = { ...(result.settings || {}), ...updates };
      const metadata = {
        ...(result.metadata || {}),
        lastUpdated: Date.now(),
        version: '1.0.0',
      };
      chrome.storage.local.set({ settings, metadata }, resolve);
    });
  });
}
