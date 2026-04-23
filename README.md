# ccwrapped

> Daily Claude Code report — like Spotify Wrapped, but for your AI coding habits.

![sample](docs/sample-horizontal.png)

Every night, `ccwrapped` scans your local Claude Code history, writes a short AI narrative about what you actually did, and emails you a dark-themed report card. Zero code or conversation content leaves your machine except the aggregated numbers used to generate the narrative.

- **Local-first** — reads `~/.claude/projects/**/*.jsonl` directly, no cloud sync
- **AI narrative** — any OpenAI-compatible endpoint (Kimi, DeepSeek, OpenAI, OpenRouter…) writes 2–3 sentences about your day
- **Pretty HTML email** — via Resend (free tier: 3000/month)
- **Shareable PNGs** — horizontal for Twitter/X, vertical for Stories/小红书/TikTok
- **Auto-runs nightly** — macOS launchd takes care of the schedule, including catch-up when your Mac was asleep

## Install

```bash
git clone https://github.com/PeiGuagua/ccwrapped.git
cd ccwrapped
npm install
npm run build
```

(An `npm publish`-ready package is a goal — track [#1](https://github.com/PeiGuagua/ccwrapped/issues/1) for progress.)

## Quick start

```bash
# One-shot today's report
node dist/cli.js

# Same but no AI narrative (pure template — zero network)
node dist/cli.js --no-ai

# Email it to yourself (needs config below)
node dist/cli.js --email

# Generate PNGs to ~/Desktop
node dist/cli.js --share
```

## Config

Create `~/.ccwrapped/config.json`:

```json
{
  "ai": {
    "base_url": "https://api.moonshot.cn/v1",
    "api_key": "sk-…",
    "model": "moonshot-v1-32k"
  },
  "email": {
    "resend_api_key": "re_…",
    "email_to": "you@example.com",
    "from": "onboarding@resend.dev"
  }
}
```

Both sections are optional:

- omit `ai` → narrative falls back to a template
- omit `email` → `--email` is skipped

### Supported AI providers

Any OpenAI-compatible endpoint works. Set `base_url` to:

| Provider | `base_url` | Example model |
|---|---|---|
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | `moonshot-v1-32k` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | any supported model |

## Schedule daily runs

```bash
# Install launchd agent (default 23:00)
node dist/cli.js install-cron

# Or pick a time
node dist/cli.js install-cron --at 08:00

# Trigger immediately (useful for testing)
node dist/cli.js trigger-cron

# Status / log
node dist/cli.js cron-status
tail -f ~/.ccwrapped/daily.log

# Remove
node dist/cli.js uninstall-cron
```

Missed the scheduled time because your Mac was asleep? `launchd` catches up on the next wake.

## Screenshots

Horizontal (`ccwrapped-YYYY-MM-DD.png`, 1200×675 — Twitter/X, blog headers):

![horizontal](docs/sample-horizontal.png)

Vertical (`ccwrapped-YYYY-MM-DD-story.png`, 1080×1920 — Instagram Stories, TikTok, 小红书):

<img src="docs/sample-vertical.png" width="360" alt="vertical">

## How it works

```
~/.claude/projects/**/*.jsonl
        │ stream-parse (local, no network)
        ▼
    aggregate per-day stats
        │
        ├─ terminal output  (default)
        ├─ HTML email       (--email  → Resend)
        ├─ PNG × 2          (--share  → Desktop)
        └─ AI narrative     (one call with aggregated numbers only)
```

What leaves your machine:

- **Nothing** if you pass `--no-ai` and don't use `--email`.
- Aggregated stats (no code, no messages) → your chosen AI provider, if AI narrative is enabled.
- Rendered HTML + narrative → Resend, if `--email` is enabled.

File contents, conversation text, and command arguments are **never** sent to any third party.

## Privacy & safety

- API keys live in `~/.ccwrapped/config.json` (chmod 600 by default on macOS).
- The launchd plist runs only your local installed binary; it does not auto-update.
- Cost estimates use public API rates — if you pay a flat Claude Max subscription, the "cost" figure is a theoretical API equivalent, not your actual spend.

## Roadmap

- [ ] Weekly / monthly wrap
- [ ] Year-in-review auto-generated at year end
- [ ] Windows + Linux cron
- [ ] Web dashboard (optional, self-hosted)
- [ ] `npx ccwrapped` one-liner install

## License

MIT © 2026
