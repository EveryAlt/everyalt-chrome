/**
 * EveryAlt - AI provider client (OpenAI, Google Gemini, DeepInfra).
 * Ported from the WordPress plugin's admin/class-everyalt-openai.php.
 */

import { PROVIDERS, MODELS, resolveModelSlug } from './providers.js';

const DEFAULT_PROMPT =
  'Describe this image in one short, clear sentence suitable for HTML alt text. ' +
  'If the image contains important text (such as a logo, sign, or heading), include that text. ' +
  'Do not start with "This image shows" or similar. Output only the alt text, nothing else.';

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Validate an API key against the provider's model-list endpoint (a free, read-only request).
 * @param {string} provider - 'openai' | 'gemini' | 'deepinfra'
 * @param {string} apiKey
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateApiKey(provider, apiKey) {
  const def = PROVIDERS[provider];
  if (!def) {
    return { valid: false, message: 'Unknown provider.' };
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return { valid: false, message: 'API key is empty.' };
  }
  try {
    const response = await fetch(def.modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (response.ok) {
      return { valid: true, message: 'API key is valid.' };
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { valid: false, message: `Invalid ${def.label} API key. Check that the key is correct.` };
    }
    return { valid: false, message: `Validation returned status ${response.status}. Try again.` };
  } catch (err) {
    return { valid: false, message: 'Network error: ' + err.message };
  }
}

/**
 * Generate alt text for an image with the selected model.
 * @param {string} base64DataUrl - Full data URL (data:image/...;base64,...)
 * @param {object} settings - { apiKey, model (slug), maxTokens, customPrompt }
 * @returns {Promise<{altText: string, usage: object, cost: object, model: string}>}
 */
export async function generateAltText(base64DataUrl, settings = {}) {
  const slug = resolveModelSlug(settings.model);
  const modelDef = MODELS[slug];
  const provider = PROVIDERS[modelDef.provider];
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error(`API key not configured. Open EveryAlt settings to add your ${provider.label} key.`);
  }

  let maxTokens = settings.maxTokens || DEFAULT_MAX_TOKENS;
  if (provider.maxTokensCap) maxTokens = Math.min(maxTokens, provider.maxTokensCap);
  const prompt = settings.customPrompt || DEFAULT_PROMPT;

  const isInteractions = provider.api === 'interactions';
  let body;
  let headers;
  if (isInteractions) {
    // Gemini Interactions API: raw base64 plus mime type, with an explicit low image resolution.
    const [, mimeType = 'image/jpeg', data = ''] = base64DataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
    const image = { type: 'image', data, mime_type: mimeType };
    if (provider.imageResolution) image.resolution = provider.imageResolution;
    body = {
      model: modelDef.model,
      input: [{ type: 'text', text: prompt }, image],
      generation_config: { max_output_tokens: maxTokens },
      // Don't keep the request and image on Google's side for later retrieval.
      store: false,
    };
    headers = { 'x-goog-api-key': apiKey };
  } else {
    const imageUrl = { url: base64DataUrl };
    // OpenAI-only hint: low detail keeps image input tokens (and cost) small; plenty for alt text.
    if (provider.imageDetail) imageUrl.detail = provider.imageDetail;
    body = {
      model: modelDef.model,
      [provider.tokenParam]: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: imageUrl },
          ],
        },
      ],
    };
    headers = { Authorization: `Bearer ${apiKey}` };
  }
  Object.assign(body, modelDef.params);

  const response = await fetch(provider.endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON error body; handled below.
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || `${provider.label} API returned ${response.status}`;
    throw new Error(errorMsg);
  }

  const usage = normalizeUsage(data?.usage, isInteractions);
  const cost = calculateCost(usage, modelDef);

  let altText = '';
  let truncated = false;
  if (isInteractions) {
    // { status, steps: [ { type: "model_output", content: [ { type: "text", text } ] } ] }
    const status = data?.status || '';
    if (status === 'failed' || status === 'cancelled') {
      throw new Error(`${provider.label} request ${status}.`);
    }
    truncated = status === 'incomplete';
    (data?.steps || [])
      .filter((step) => step.type === 'model_output')
      .forEach((step) => { altText += textFromParts(step.content); });
  } else {
    const content = data?.choices?.[0]?.message?.content;
    truncated = data?.choices?.[0]?.finish_reason === 'length';
    altText = typeof content === 'string' ? content : textFromParts(content);
  }
  altText = altText.trim();

  if (truncated) {
    throw new Error('Response was cut off (max tokens reached). Increase max tokens in settings.');
  }
  if (!altText) {
    throw new Error(`${provider.label} returned an empty response. Try again.`);
  }

  return { altText, usage, cost, model: slug };
}

/** Concatenate the text parts of a content array ([ { type: "text", text } ]). */
function textFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('');
}

/**
 * Map a provider's usage object onto Chat Completions field names
 * (prompt_tokens, completion_tokens, total_tokens, plus reasoning_tokens when reported separately).
 */
function normalizeUsage(usage, isInteractions) {
  if (!usage || typeof usage !== 'object') return {};
  if (!isInteractions) return usage;
  return {
    prompt_tokens: usage.total_input_tokens || 0,
    completion_tokens: usage.total_output_tokens || 0,
    reasoning_tokens: usage.total_thought_tokens || 0,
    total_tokens: usage.total_tokens || 0,
  };
}

/**
 * Output tokens the provider bills, including thinking/reasoning tokens.
 * OpenAI counts reasoning inside completion_tokens; Gemini reports thinking separately and leaves it
 * out of the output count. Anything in the total beyond the prompt is billed as output either way.
 */
function billableOutputTokens(usage) {
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  if (usage.total_tokens) return Math.max(completion, usage.total_tokens - prompt);
  return completion + (usage.reasoning_tokens || 0);
}

/** Estimated cost in USD from token usage and the model's published prices. */
function calculateCost(usage, modelDef) {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const outputTokens = billableOutputTokens(usage);
  const totalTokens = usage.total_tokens || promptTokens + outputTokens;

  const inputCost = (promptTokens / 1_000_000) * modelDef.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * modelDef.outputPrice;
  const totalCost = inputCost + outputCost;

  return {
    totalUsd: totalCost,
    costCents: (totalCost * 100).toFixed(4) + '¢',
    inputCost,
    outputCost,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      thinking: Math.max(0, outputTokens - completionTokens),
      total: totalTokens,
    },
  };
}

export { DEFAULT_PROMPT, DEFAULT_MAX_TOKENS };
