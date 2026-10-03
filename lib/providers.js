/**
 * EveryAlt - Supported AI providers and models.
 * Mirrors includes/class-everyalt-providers.php in the WordPress plugin; keep the two in sync.
 *
 * OpenAI and DeepInfra use OpenAI-style Chat Completions (api: 'chat'). Gemini uses its native
 * Interactions API (api: 'interactions'), because only that API lets us request low image resolution
 * (280 tokens per image instead of 1,120) and reports thinking tokens separately.
 *
 * Prices are the providers' published regular (non-promotional) rates in USD per 1M tokens, as of
 * PRICES_AS_OF. Update that date whenever prices here are re-checked.
 */

export const PRICES_AS_OF = '2026-10-02';

export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    api: 'chat',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    tokenParam: 'max_completion_tokens',
    imageDetail: 'low',
    keyUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/api/pricing/',
  },
  gemini: {
    label: 'Google Gemini',
    api: 'interactions',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
    // Key validation uses the OpenAI-compatible model list, which accepts a Bearer key.
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
    imageResolution: 'low',
    keyUrl: 'https://aistudio.google.com/apikey',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  deepinfra: {
    label: 'DeepInfra',
    api: 'chat',
    endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions',
    modelsUrl: 'https://api.deepinfra.com/v1/openai/models',
    tokenParam: 'max_tokens',
    // DeepInfra rejects requests above this output limit.
    maxTokensCap: 16384,
    keyUrl: 'https://deepinfra.com/dash/api_keys',
    pricingUrl: 'https://deepinfra.com/pricing',
  },
};

/**
 * Selectable models, keyed by slug (saved as settings.model).
 * `params` are extra request body fields. Reasoning is kept as low as each model allows: alt text is
 * one sentence, and reasoning tokens are billed as output.
 */
export const MODELS = {
  'openai-gpt-6-luna': {
    provider: 'openai',
    model: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    inputPrice: 0.10,
    outputPrice: 0.50,
    // Luna models default to medium reasoning; alt text doesn't need it.
    params: { reasoning_effort: 'none' },
  },
  'gemini-3.1-flash-lite': {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    inputPrice: 0.25,
    outputPrice: 1.50,
    // Thinking can't be turned off on Gemini 3; Flash-Lite defaults to the lowest level (minimal).
    params: {},
  },
  'deepinfra-deepseek-v4.1-flash': {
    provider: 'deepinfra',
    model: 'deepseek-ai/DeepSeek-V4.1-Flash',
    label: 'DeepSeek V4.1 Flash',
    inputPrice: 0.20,
    outputPrice: 0.60,
    params: { reasoning_effort: 'none' },
  },
  'deepinfra-glm-5.3-flash': {
    provider: 'deepinfra',
    model: 'zai-org/GLM-5.3-Flash',
    label: 'GLM-5.3-Flash',
    inputPrice: 0.15,
    outputPrice: 0.50,
    params: {},
  },
};

/** Model used when none has been chosen, or when the saved model has been retired. */
export const DEFAULT_MODEL = 'openai-gpt-6-luna';

/**
 * Models offered in earlier versions, slug or raw model ID => label. Kept so the log still shows a
 * readable name; a saved one falls back to DEFAULT_MODEL. Version 1.0 saved the raw model ID.
 */
export const RETIRED_MODELS = {
  'gpt-5-nano': 'GPT-5 nano',
  'openai-gpt-5.4-nano': 'GPT-5.4 nano',
};

/** Slug of a saved model, falling back to the default if unset or no longer offered. */
export function resolveModelSlug(saved) {
  return Object.prototype.hasOwnProperty.call(MODELS, saved) ? saved : DEFAULT_MODEL;
}

/** Display label for a model slug, including retired ones (falls back to the slug itself). */
export function modelLabel(slug) {
  if (MODELS[slug]) return MODELS[slug].label;
  return RETIRED_MODELS[slug] || String(slug || '');
}

/** "GPT-6 Luna (OpenAI)" */
export function modelDisplayName(slug) {
  const model = MODELS[slug];
  return model ? `${model.label} (${PROVIDERS[model.provider].label})` : modelLabel(slug);
}

/** Per-1M-token price with 2 decimals, or 3 when needed (0.20, 1.50, 0.075). */
export function formatPrice(price) {
  const formatted = Number(price).toFixed(3);
  return formatted.endsWith('0') ? formatted.slice(0, -1) : formatted;
}
