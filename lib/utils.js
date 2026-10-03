/**
 * EveryAlt - Utility helpers.
 */

import { MODELS, PROVIDERS, DEFAULT_MODEL, RETIRED_MODELS, resolveModelSlug } from './providers.js';

/** Extension version recorded in saved metadata. Keep in sync with manifest.json. */
export const EXTENSION_VERSION = '1.1.0';

/** Max pixel dimension (width or height) before sending to the AI provider. */
const MAX_DIMENSION = 300;

/**
 * Convert an image URL to a resized base64 data URL.
 * Images are scaled so the largest side is at most MAX_DIMENSION pixels,
 * which dramatically reduces the token count sent to the API.
 *
 * Uses OffscreenCanvas (available in service workers & modern browsers).
 *
 * @param {string} url - Image URL or data URL
 * @returns {Promise<string>} base64 data URL (data:image/jpeg;base64,...)
 */
export async function imageUrlToBase64(url) {
  let blob;

  if (url.startsWith('data:')) {
    // Convert data URL to blob so we can feed it to createImageBitmap
    const res = await fetch(url);
    blob = await res.blob();
  } else {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image (${response.status})`);
    }
    blob = await response.blob();
  }

  // Validate it's actually an image
  if (!blob.type.startsWith('image/')) {
    throw new Error(`URL did not return an image (got ${blob.type})`);
  }

  // Check original size (reject extremely large files before processing)
  const MAX_SIZE = 20 * 1024 * 1024;
  if (blob.size > MAX_SIZE) {
    throw new Error('Image is too large (over 20 MB). Try a smaller image.');
  }

  // Decode the image to get its natural dimensions
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  // Calculate scaled dimensions (fit within MAX_DIMENSION box)
  let newW = width;
  let newH = height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    newW = Math.round(width * scale);
    newH = Math.round(height * scale);
  }

  // Draw to an OffscreenCanvas at the target size
  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, newW, newH);
  bitmap.close();

  // Export as JPEG (smaller payload than PNG for photographs)
  const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });

  // Convert to data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to encode resized image.'));
    reader.readAsDataURL(outBlob);
  });
}

/**
 * Get saved settings from chrome.storage.local, with defaults applied.
 *
 * Storage layout (1.1+): apiKeys / apiKeysValidated are keyed by provider ('openai', 'gemini',
 * 'deepinfra'); settings.model is a model slug from MODELS. Version 1.0 stored a single OpenAI key in
 * apiKey / apiKeyValidated and the raw model ID 'gpt-5-nano'; those are read as a fallback here and
 * converted for good by migrateStorage().
 *
 * @returns {Promise<object>} apiKey / apiKeyValidated are for the selected model's provider.
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['apiKey', 'apiKeyValidated', 'apiKeys', 'apiKeysValidated', 'settings', 'metadata'],
      (result) => {
        const settings = result.settings || {};
        const apiKeys = { ...(result.apiKeys || {}) };
        const apiKeysValidated = { ...(result.apiKeysValidated || {}) };
        if (result.apiKey && !apiKeys.openai) {
          apiKeys.openai = result.apiKey;
          apiKeysValidated.openai = !!result.apiKeyValidated;
        }
        const model = resolveModelSlug(settings.model);
        const provider = MODELS[model].provider;
        resolve({
          apiKey: apiKeys[provider] || '',
          apiKeyValidated: !!apiKeysValidated[provider],
          apiKeys,
          apiKeysValidated,
          model,
          provider,
          maxTokens: settings.maxTokens || 1024,
          customPrompt: settings.customPrompt || '',
          metadata: result.metadata || {},
        });
      }
    );
  });
}

/**
 * One-time conversion of 1.0 storage: move the single OpenAI key into apiKeys.openai, and move a
 * saved retired model (gpt-5-nano, GPT-5.4 nano) to DEFAULT_MODEL. Safe to run repeatedly.
 * @returns {Promise<void>}
 */
export async function migrateStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['apiKey', 'apiKeyValidated', 'apiKeys', 'apiKeysValidated', 'settings'],
      (result) => {
        const updates = {};
        if (result.apiKey) {
          const apiKeys = { ...(result.apiKeys || {}) };
          const apiKeysValidated = { ...(result.apiKeysValidated || {}) };
          if (!apiKeys.openai) {
            apiKeys.openai = result.apiKey;
            apiKeysValidated.openai = !!result.apiKeyValidated;
          }
          updates.apiKeys = apiKeys;
          updates.apiKeysValidated = apiKeysValidated;
        }
        const settings = result.settings || {};
        if (settings.model && Object.prototype.hasOwnProperty.call(RETIRED_MODELS, settings.model)) {
          updates.settings = { ...settings, model: DEFAULT_MODEL };
        }
        const done = () => {
          if (result.apiKey) {
            chrome.storage.local.remove(['apiKey', 'apiKeyValidated'], resolve);
          } else {
            resolve();
          }
        };
        if (Object.keys(updates).length) {
          chrome.storage.local.set(updates, done);
        } else {
          done();
        }
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
        version: EXTENSION_VERSION,
      };
      chrome.storage.local.set({ settings, metadata }, resolve);
    });
  });
}

export { MODELS, PROVIDERS };

// ── Generation Log ────────────────────────────────────────────

const MAX_LOG_ENTRIES = 10;

/**
 * Append a generation result (success or error) to the log.
 * Keeps only the most recent MAX_LOG_ENTRIES entries.
 *
 * @param {object} entry
 *   Success: { imageUrl, altText, usage, cost, timestamp }
 *   Error:   { imageUrl, error, timestamp }
 */
export async function addLogEntry(entry) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['generationLog'], (result) => {
      const log = result.generationLog || [];
      log.unshift({ ...entry, timestamp: entry.timestamp || Date.now() });
      // Trim to last N entries
      const trimmed = log.slice(0, MAX_LOG_ENTRIES);
      chrome.storage.local.set({ generationLog: trimmed }, resolve);
    });
  });
}

/**
 * Retrieve the generation log.
 * @returns {Promise<Array>}
 */
export async function getLog() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['generationLog'], (result) => {
      resolve(result.generationLog || []);
    });
  });
}

/**
 * Clear the generation log.
 */
export async function clearLog() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ generationLog: [] }, resolve);
  });
}
