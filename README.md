# RankSage Daily Brief — Obsidian Plugin

Automatically inject your [RankSage](https://www.ranksage.com) SEO, AEO, and AI visibility daily brief into your Obsidian daily notes.

RankSage joins what AI answer engines say about your brand with Google Search Console, GA4 and first-party visitor behaviour on one row — the page — and returns a ranked list of what to change next. This plugin delivers that ranked list — plus the day's AI-visibility, keyword and alert highlights — into the daily note you already keep.

## Features

- **Auto-inject on startup** — your brief is waiting every morning when you open Obsidian
- **Cursor-style AI visibility** — see your brand's mention score across ChatGPT, Perplexity, Gemini
- **Keyword movers** — top-improving and declining keywords at a glance
- **Alerts** — severity-ranked: traffic drops, SEO score issues, low AI visibility
- **Replace-on-rerun** — re-fetching never duplicates content
- **Graceful degradation** — shows last cached brief with a staleness warning if offline

## Setup

1. Install from Obsidian Community Plugins: search for **"RankSage Daily Brief"**
2. Enable the plugin
3. Go to **Settings → RankSage Daily Brief → Connect RankSage**
4. Authorize in your browser — you'll be redirected back to Obsidian automatically
5. Done. Open tomorrow's daily note and your brief will be there.

## Requirements

- Obsidian 1.4.0+ (desktop only)
- A [RankSage](https://www.ranksage.com) account
- The **Daily Notes** core plugin enabled in Obsidian

## Community Plugins Release Checklist

- [x] `manifest.json` with all required fields (`id`, `name`, `version`, `minAppVersion`, `author`, `description`, `isDesktopOnly`)
- [x] `main.js` built via esbuild (run `npm run build`)
- [x] No network requests to third-party trackers
- [x] All API calls use `requestUrl()` (CORS-compliant)
- [x] No `eval()` or dynamic code execution
- [x] No bundled credentials or API keys
- [x] `isDesktopOnly: true` (uses `window.open()` for OAuth, Electron environment)
- [x] Handles plugin unload cleanly (`onunload()`)
- [x] Respects Daily Notes core plugin folder/format settings
- [ ] Submit PR to [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository

## Development

```bash
cd packages/ranksage-obsidian
npm install
npm run build      # produces main.js
npm run dev        # watch mode
npm run typecheck  # TypeScript strict check
```

Copy `manifest.json` and `main.js` into your vault's `.obsidian/plugins/ranksage-obsidian/` folder to test locally.

## OAuth Flow

```
Obsidian Plugin
  → generates PKCE code_verifier + code_challenge
  → opens browser: GET https://api.ranksage.com/oauth/authorize?...
  → backend redirects → RankSage frontend consent page
  → user approves → frontend calls POST /api/v1/oauth/grants (Clerk JWT)
  → frontend redirects browser: obsidian://ranksage-callback?code=...
  → plugin receives callback via registerObsidianProtocolHandler
  → calls POST /api/v1/oauth/token (PKCE exchange)
  → stores access_token + refresh_token via plugin.saveData()
  → fetches GET /api/v1/digest
  → injects into daily note
```
