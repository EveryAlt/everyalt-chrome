/**
 * EveryAlt Chrome Extension - Background Service Worker
 *
 * Responsibilities:
 *  - Register context menu on install
 *  - Handle context menu clicks (image right-click)
 *  - Fetch image, convert to base64, call OpenAI
 *  - Send results to content script for modal display
 */

import { generateAltText, validateApiKey } from './lib/openai-api.js';
import { imageUrlToBase64, getSettings, addLogEntry } from './lib/utils.js';

// ── Context Menu Registration ───────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'generate-alt-text',
    title: 'Generate Alt Text with EveryAlt',
    contexts: ['image'],
  });
});

// ── Context Menu Click Handler ──────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'generate-alt-text' || !info.srcUrl) return;
  if (!tab?.id) return;

  // Ensure content script is injected (handles pages opened before install)
  await ensureContentScript(tab.id);

  // Show loading state in the page
  sendToTab(tab.id, { type: 'EVERYALT_SHOW_LOADING' });

  try {
    // 1. Check for API key
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendToTab(tab.id, {
        type: 'EVERYALT_SHOW_ERROR',
        message: 'API key not configured. Click to open EveryAlt settings.',
        actionUrl: chrome.runtime.getURL('options.html'),
      });
      return;
    }

    // 2. Convert image to base64
    let base64DataUrl;
    try {
      base64DataUrl = await imageUrlToBase64(info.srcUrl);
    } catch (fetchErr) {
      // If service worker can't fetch (e.g., CORS), ask content script to try
      try {
        base64DataUrl = await requestBase64FromContentScript(tab.id, info.srcUrl);
      } catch (csErr) {
        throw new Error('Could not load image: ' + (csErr.message || fetchErr.message));
      }
    }

    // 3. Call OpenAI API
    const result = await generateAltText(base64DataUrl, {
      apiKey: settings.apiKey,
      model: settings.model,
      maxTokens: settings.maxTokens,
      customPrompt: settings.customPrompt,
    });

    // 4. Log success
    await addLogEntry({
      status: 'success',
      imageUrl: info.srcUrl,
      altText: result.altText,
      usage: result.usage,
      cost: result.cost,
    });

    // 5. Send result to content script
    sendToTab(tab.id, {
      type: 'EVERYALT_SHOW_RESULT',
      altText: result.altText,
      imageUrl: info.srcUrl,
      usage: result.usage,
      cost: result.cost,
    });
  } catch (err) {
    // Log error
    await addLogEntry({
      status: 'error',
      imageUrl: info.srcUrl,
      error: err.message || 'Unknown error',
    });

    sendToTab(tab.id, {
      type: 'EVERYALT_SHOW_ERROR',
      message: err.message || 'An unexpected error occurred.',
    });
  }
});

// ── Message Handler (from content script, popup, options) ───────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EVERYALT_REGENERATE') {
    handleRegenerate(request, sender);
    return false; // async handled separately
  }

  if (request.type === 'EVERYALT_VALIDATE_KEY') {
    validateApiKey(request.apiKey).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (request.type === 'EVERYALT_GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }

  if (request.type === 'EVERYALT_GET_LOG') {
    import('./lib/utils.js').then((m) => m.getLog()).then(sendResponse);
    return true;
  }

  if (request.type === 'EVERYALT_CLEAR_LOG') {
    import('./lib/utils.js').then((m) => m.clearLog()).then(sendResponse);
    return true;
  }

  if (request.type === 'EVERYALT_FETCH_BASE64') {
    imageUrlToBase64(request.imageUrl)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ── Regenerate Handler ──────────────────────────────────────────────

async function handleRegenerate(request, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  sendToTab(tabId, { type: 'EVERYALT_SHOW_LOADING' });

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendToTab(tabId, {
        type: 'EVERYALT_SHOW_ERROR',
        message: 'API key not configured.',
      });
      return;
    }

    let base64DataUrl;
    try {
      base64DataUrl = await imageUrlToBase64(request.imageUrl);
    } catch {
      base64DataUrl = await requestBase64FromContentScript(tabId, request.imageUrl);
    }

    const result = await generateAltText(base64DataUrl, {
      apiKey: settings.apiKey,
      model: settings.model,
      maxTokens: settings.maxTokens,
      customPrompt: request.customPrompt || settings.customPrompt,
    });

    await addLogEntry({
      status: 'success',
      imageUrl: request.imageUrl,
      altText: result.altText,
      usage: result.usage,
      cost: result.cost,
    });

    sendToTab(tabId, {
      type: 'EVERYALT_SHOW_RESULT',
      altText: result.altText,
      imageUrl: request.imageUrl,
      usage: result.usage,
      cost: result.cost,
    });
  } catch (err) {
    await addLogEntry({
      status: 'error',
      imageUrl: request.imageUrl,
      error: err.message || 'Regeneration failed',
    });

    sendToTab(tabId, {
      type: 'EVERYALT_SHOW_ERROR',
      message: err.message || 'Regeneration failed.',
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script might not be ready yet; ignore silently
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content-script.css'],
    });
  } catch {
    // Script may already be injected or page doesn't allow injection (chrome:// etc)
  }
}

/**
 * Ask the content script to fetch + base64-encode an image
 * (fallback when the service worker itself is blocked by CORS).
 */
function requestBase64FromContentScript(tabId, imageUrl) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'EVERYALT_FETCH_IMAGE', imageUrl },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Content script could not fetch image.'));
        }
      }
    );
  });
}
