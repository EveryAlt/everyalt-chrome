# EveryAlt — AI Alt Text Generator for Chrome

Free, open-source Chrome extension that generates descriptive alt text for any image on the web. Just right-click on any image to generate alt text that you can easily copy and paste.

Created by [HDC](https://hdc.net). We also have a [WordPress plugin](https://everyalt.com). Learn more at [EveryAlt.com](https://everyalt.com).

---

## How It Works

1. Right-click any image on any webpage
2. Select **"EveryAlt – Generate Alt Text"** from the context menu
3. A dialog appears with AI-generated alt text
4. Copy the text with one click and paste it wherever you need it

EveryAlt uses OpenAI's Vision API with the **gpt-5-nano** model — the cheapest and most efficient vision-capable model available. A typical image costs roughly **0.02¢** to process.

You bring your own OpenAI API key. EveryAlt is completely free — you are billed directly by OpenAI for API usage only.

---

## Features

- **One-click alt text generation** — Right-click any image, get alt text instantly
- **Copy-friendly dialog** — Generated text appears in a modal with a one-click copy button
- **Regenerate on the fly** — Not happy with the result? Hit regenerate without leaving the dialog
- **Custom prompts** — Tailor the AI instruction to your specific needs (SEO-focused, casual, technical, etc.)
- **Image optimization** — Images are automatically resized to 300px max dimension before being sent to the API, dramatically reducing token usage and cost
- **Generation log** — Track your last 10 generations with token counts and cost estimates in the settings page
- **Lightweight & fast** — No bundler, no dependencies, just vanilla JS with Chrome's Manifest V3 APIs
- **Privacy-first** — Your API key is stored locally in Chrome. No data is sent anywhere except directly to OpenAI's API

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
2. Enter your OpenAI API key ([get one here](https://platform.openai.com/api-keys))
3. Click **Validate** to confirm the key works
4. Click **Save Settings**
5. You're ready to go — right-click any image to generate alt text

---

## Configuration

All settings are accessible from the extension's options page (click the toolbar icon → Settings):

| Setting | Description | Default |
|---------|-------------|---------|
| **API Key** | Your OpenAI API key | — |
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
│   ├── openai-api.js       # OpenAI Chat Completions API module
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
| `host_permissions: api.openai.com` | Sends images to the OpenAI API |

### Cost

EveryAlt uses **gpt-5-nano**, priced at $0.05 per million input tokens and $0.40 per million output tokens. With the built-in image resizing (300px max dimension), a typical generation costs approximately **0.02¢** — meaning you could process roughly 5,000 images for $1.

---

## Privacy & Security

- **Your API key never leaves your machine** — it is stored in `chrome.storage.local` and sent only to `api.openai.com`
- **No analytics, no tracking, no external servers** — the extension communicates exclusively with OpenAI's API
- **No hardcoded secrets** — the codebase is safe to publish publicly
- **Images are processed in-browser** — resizing happens locally before anything is sent to OpenAI

---

## Related Projects

- **[EveryAlt WordPress Plugin](https://everyalt.com)** — Generate alt text for images directly in your WordPress media library and block editor

---

## License

This project is open source. See [LICENSE](LICENSE) for details.

---

## Credits

Built by [HDC](https://hdc.net).
