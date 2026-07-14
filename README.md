# Sidra Pulse

Automated headless web scraper and Discord notification pipeline for Sidra Chain updates.

## Features
- Scrapes Telegram public channels, Twitter/X (via Nitter instances), and Google News RSS.
- Filters out noise using crypto/network keyword relevance matching.
- Sends updates to Discord webhooks, and alerts developers after 5 consecutive failures.
- Stores processed IDs and scraper failure counts in a <2KB local state file.

## Setup

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your details:
   ```bash
   cp .env.example .env
   ```

   Key options:
   - `DISCORD_WEBHOOK_URL`: Your main updates channel Discord webhook endpoint.
   - `ROADMAP_WEBHOOK_URL`: Discord webhook for high-value roadmap and feature updates.
   - `GEMINI_API_KEY`: (Optional) Google Gemini API Key to automatically generate AI summary change diffs.
   - `SCRAPE_INTERVAL`: Cron pattern (e.g. `*/5 * * * *` for every 5 minutes).

3. **Build & Run**:
   - Compile TypeScript:
     ```bash
     pnpm run build
     ```
   - Run scraper once:
     ```bash
     RUN_ONCE=true pnpm run dev
     ```
   - Run as persistent daemon:
     ```bash
     pnpm run dev
     ```

## GitHub Actions Automated Runner
A workflow is configured in `.github/workflows/scrape.yml` to run the scraper every 15 minutes.

### Required Setup:
Go to your GitHub repository **Settings** -> **Secrets and variables** -> **Actions** and add:
- `DISCORD_WEBHOOK_URL`: Your Discord updates channel webhook.
- `ROADMAP_WEBHOOK_URL`: Your Discord roadmap channel webhook.
- `GEMINI_API_KEY`: (Optional) Your Google Gemini API Key for automated diff digests.
