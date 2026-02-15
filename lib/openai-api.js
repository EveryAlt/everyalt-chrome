/**
 * EveryAlt - OpenAI API integration module.
 * Ported from the WordPress plugin's class-everyalt-openai.php.
 */

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const DEFAULT_PROMPT =
  'Describe this image in one short, clear sentence suitable for HTML alt text. ' +
  'Do not start with "This image shows" or similar. Output only the alt text, nothing else.';

const DEFAULT_MODEL = 'gpt-5-nano';
const DEFAULT_MAX_TOKENS = 1024;

// Pricing per 1M tokens (gpt-5-nano — cheapest vision-capable model)
const DEFAULT_INPUT_PRICE_PER_MILLION = 0.05;
const DEFAULT_OUTPUT_PRICE_PER_MILLION = 0.40;

/**
 * Validate an OpenAI API key by making a lightweight GET to /v1/models.
 * @param {string} apiKey
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return { valid: false, message: 'API key is empty.' };
  }
  try {
    const response = await fetch(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (response.ok) {
      return { valid: true, message: 'API key is valid.' };
    }
    if (response.status === 401) {
      return { valid: false, message: 'Invalid API key. Check that the key is correct.' };
    }
    return { valid: false, message: `Validation returned status ${response.status}. Try again.` };
  } catch (err) {
    return { valid: false, message: 'Network error: ' + err.message };
  }
}

/**
 * Generate alt text for an image using OpenAI Vision.
 * @param {string} base64DataUrl - Full data URL (data:image/...;base64,...)
 * @param {object} settings - { apiKey, model, maxTokens, customPrompt }
 * @returns {Promise<{altText: string, usage: object, cost: object}>}
 */
export async function generateAltText(base64DataUrl, settings = {}) {
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error('API key not configured. Open EveryAlt settings to add your OpenAI key.');
  }

  const model = settings.model || DEFAULT_MODEL;
  const maxTokens = settings.maxTokens || DEFAULT_MAX_TOKENS;
  const prompt = settings.customPrompt || DEFAULT_PROMPT;

  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: base64DataUrl, detail: 'low' },
          },
        ],
      },
    ],
  };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMsg = data?.error?.message || `OpenAI API returned ${response.status}`;
    throw new Error(errorMsg);
  }

  // Parse content (can be string or array of content parts)
  let altText = '';
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    altText = content.trim();
  } else if (Array.isArray(content)) {
    altText = content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text)
      .join('')
      .trim();
  }

  const finishReason = data?.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    throw new Error(
      'Response was cut off (max tokens reached). Increase max tokens in settings.'
    );
  }

  if (!altText) {
    throw new Error('OpenAI returned an empty response. Try again.');
  }

  const usage = data.usage || {};
  const cost = calculateCost(usage);

  return { altText, usage, cost };
}

/**
 * Calculate estimated cost in USD from token usage.
 */
function calculateCost(usage) {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || 0;

  const inputCost = (promptTokens / 1_000_000) * DEFAULT_INPUT_PRICE_PER_MILLION;
  const outputCost = (completionTokens / 1_000_000) * DEFAULT_OUTPUT_PRICE_PER_MILLION;
  const totalCost = inputCost + outputCost;

  // Format as cents string (e.g., "0.0123¢")
  const costCents = (totalCost * 100).toFixed(4) + '\u00A2';

  return {
    totalUsd: totalCost,
    costCents,
    inputCost,
    outputCost,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    },
  };
}

export { DEFAULT_PROMPT, DEFAULT_MODEL, DEFAULT_MAX_TOKENS };
