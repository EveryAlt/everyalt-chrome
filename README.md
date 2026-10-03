# EveryAlt — AI Alt Text Generator for Chrome

Free, open-source Chrome extension that generates descriptive alt text for any image on the web. Just right-click on any image to generate alt text that you can easily copy and paste.

Created by [HDC](https://hdc.net). We also have a [WordPress plugin](https://everyalt.com). Learn more at [EveryAlt.com](https://everyalt.com).

---

## How It Works

1. Right-click any image on any webpage
2. Select **"EveryAlt – Generate Alt Text"** from the context menu
3. A dialog appears with AI-generated alt text
4. Copy the text with one click and paste it wherever you need it

Choose your AI model in Settings and bring your own API key from **OpenAI**, **Google Gemini**, or **DeepInfra**. EveryAlt is completely free — you are billed directly by your provider for API usage only.

| Model | Provider | Input / 1M tokens | Output / 1M tokens |
|-------|----------|------------------:|-------------------:|
| **GPT-6 Luna** (default) | OpenAI | $0.10 | $0.50 |
| **Gemini 3.1 Flash-Lite** | Google Gemini | $0.25 | $1.50 |
| **DeepSeek V4.1 Flash** | DeepInfra | $0.20 | $0.60 |
| **GLM-5.3-Flash** | DeepInfra | $0.15 | $0.50 |

Prices are each provider’s published regular rates as of October 2026 and can change: [OpenAI pricing](https://openai.com/api/pricing/) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [DeepInfra pricing](https://deepinfra.com/pricing). A typical image costs a small fraction of a cent; the exact cost of each one is shown under Recent Generations.

🔒 **DeepInfra** runs its models in its own data centers in the **US and Canada** with **zero data retention**: images and generated text aren't stored, request content isn't logged, and nothing is used for training ([data privacy](https://docs.deepinfra.com/account/data-privacy) · [privacy policy](https://deepinfra.com/privacy) · [trust center](https://trust.deepinfra.com/)). Gemini's free tier may use your content to improve Google's products; the paid tier doesn't ([terms](https://ai.google.dev/gemini-api/terms)).

---

## Features

- **One-click alt text generation** — Right-click any image, get alt text instantly
- **Copy-friendly dialog** — Generated text appears in a modal with a one-click copy button
- **Regenerate on the fly** — Not happy with the result? Hit regenerate without leaving the dialog
- **Custom prompts** — Tailor the AI instruction to your specific needs (SEO-focused, casual, technical, etc.)
- **Image optimization** — Images are automatically resized to 300px max dimension before being sent to the API, dramatically reducing token usage and cost
- **Choose your AI model** — OpenAI, Google Gemini, or DeepInfra; save keys for several providers and switch any time
- **Generation log** — Track your last 10 generations with the model used, token counts, and cost estimates in the settings page
- **Lightweight & fast** — No bundler, no dependencies, just vanilla JS with Chrome's Manifest V3 APIs
- **Privacy-first** — Your API keys are stored locally in Chrome. No data is sent anywhere except directly to the provider you choose

---

## Installation

### From source (developer mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/everyalt-chrome.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `everyalt-chrome` folder

5. The EveryAlt icon will appear in your Chrome toolbar

### Setup

1. Click the EveryAlt icon in the toolbar, then click **Settings**
2. Pick an **AI model**
3. Enter the API key for that provider — [OpenAI](https://platform.openai.com/api-keys), [Google AI Studio](https://aistudio.google.com/apikey), or [DeepInfra](https://deepinfra.com/dash/api_keys). Settings shows step-by-step instructions for each.
4. Click **Validate** to confirm the key works, then **Save Settings**
5. You're ready to go — right-click any image to generate alt text

> **Upgrading from 1.0?** Your OpenAI key carries over automatically. 1.0 used `gpt-5-nano`, which OpenAI retires on December 11, 2026; EveryAlt now uses **GPT-6 Luna**, OpenAI's recommended replacement, at a lower price.

---

## Configuration

All settings are accessible from the extension's options page (click the toolbar icon → Settings):

| Setting | Description | Default |
|---------|-------------|---------|
| **AI model** | Which provider and model generates alt text | GPT-6 Luna (OpenAI) |
| **API keys** | One key per provider (OpenAI, Google Gemini, DeepInfra) | — |
| **Alt Text Prompt** | The instruction sent to the AI with each image | *"Describe this image in one short, clear sentence suitable for HTML alt text..."* |
| **Max Completion Tokens** | Maximum tokens the model can use for the response | 1024 |

---

## Project Structure

```
everyalt-chrome/
├── manifest.json           # Chrome Extension Manifest V3 configuration
├── service-worker.js       # Background service worker (context menu, API calls, logging)
├── content-script.js       # Injected UI (loading spinner, result modal, copy/regenerate)
├── content-script.css      # Scoped styles for the injected modal
├── popup.html / .js / .css # Extension toolbar popup
├── options.html / .js / .css # Settings page (API key, prompt, log)
├── lib/
│   ├── providers.js        # Models, prices, endpoints (mirrors the WordPress plugin)
│   ├── ai-api.js           # AI client: Chat Completions (OpenAI, DeepInfra) + Gemini Interactions API
│   └── utils.js            # Image processing, settings, generation log helpers
└── images/
    ├── icon.svg            # Source SVG icon
    ├── icon-512.png        # Source PNG icon
    ├── icon-128.png        # Extension icon (128px)
    ├── icon-48.png         # Extension icon (48px)
    └── icon-16.png         # Extension icon (16px)
```

---

## Technical Details

### Architecture

- **Manifest V3** — Uses a module-based service worker, `chrome.scripting.executeScript` for content script injection, and `chrome.storage.local` for all persistent data
- **No static content scripts** — The content script is injected programmatically only when the user right-clicks an image, keeping the extension's footprint minimal
- **CORS fallback** — The service worker attempts to fetch the image directly. If CORS blocks the request, it falls back to the content script (which runs in the page context) to fetch and resize the image
- **Image optimization** — Before sending to OpenAI, images are resized to a maximum of 300px on their largest dimension using `OffscreenCanvas` and exported as JPEG at 85% quality. This dramatically reduces token usage
- **CSS isolation** — All injected styles use an `everyalt-` prefix with `!important` overrides to prevent host page styles from interfering with the modal

### Permissions

| Permission | Why it's needed |
|------------|----------------|
| `contextMenus` | Adds the "Generate Alt Text" option to the right-click menu |
| `storage` | Saves your API key, settings, and generation log locally |
| `activeTab` | Injects the content script into the current tab when you use the context menu |
| `scripting` | Programmatically injects the content script and CSS |
| `host_permissions: <all_urls>` | Fetches images from any domain for processing |
| `host_permissions: api.openai.com`, `generativelanguage.googleapis.com`, `api.deepinfra.com` | Sends images to the AI provider you choose |

### Cost

You pay your provider directly; see the model table above for prices. Images are resized to 300px before sending, OpenAI receives them at `detail: low`, and Gemini at low resolution (280 tokens per image). Reasoning is turned off where the model allows it (GPT-6 Luna, DeepSeek V4.1 Flash), because alt text doesn't need it and reasoning tokens are billed as output. Cost estimates include any thinking tokens a provider reports.

---

## Privacy & Security

- **Your API keys never leave your machine** — they are stored in `chrome.storage.local` and each is sent only to its own provider
- **No analytics, no tracking, no external servers** — the extension communicates only with the AI provider you choose
- **No hardcoded secrets** — the codebase is safe to publish publicly
- **Images are processed in-browser** — resizing happens locally before anything is sent to the provider
- **Gemini requests use `store: false`**, so Google doesn't keep them for later retrieval

---

## Related Projects

- **[EveryAlt WordPress Plugin](https://everyalt.com)** — Generate alt text for images directly in your WordPress media library and block editor

---

## License

This project is open source. See [LICENSE](LICENSE) for details.

---

## Credits

Built by [HDC](https://hdc.net).
