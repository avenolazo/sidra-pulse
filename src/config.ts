import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

/**
 * Interface representing the application configuration.
 */
export interface AppConfig {
  /**
   * Discord webhook URL to send notifications.
   * If not set, notifications will be logged instead of sent.
   */
  discordWebhookUrl: string | null;

  /**
   * Cron schedule pattern (e.g. "* / 30 * * * *").
   */
  scrapeInterval: string;

  /**
   * Absolute path to the state JSON file.
   */
  stateFilePath: string;

  /**
   * List of Nitter instances to query in rotation/fallback.
   */
  nitterInstances: string[];

  /**
   * The public Telegram channel name to scrape.
   */
  telegramChannel: string;

  /**
   * Discord webhook URL to send roadmap/feature status alerts.
   */
  roadmapWebhookUrl: string | null;

  /**
   * Google Gemini API key to automatically analyze landing page diffs.
   */
  geminiApiKey: string | null;

  /**
   * List of target ecosystem URLs to monitor for active capabilities.
   */
  roadmapUrls: string[];
}

/**
 * Validates and retrieves the application configuration.
 *
 * Why: Centralizing configuration loading ensures that missing or invalid
 * environment variables are caught early during system initialization, providing
 * defaults and clear log warnings rather than runtime crashes.
 *
 * @returns The parsed AppConfig object.
 */
export function getAppConfig(): AppConfig {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || null;
  const roadmapWebhookUrl = process.env.ROADMAP_WEBHOOK_URL || null;
  const geminiApiKey = process.env.GEMINI_API_KEY || null;
  const scrapeInterval = process.env.SCRAPE_INTERVAL || '*/30 * * * *';
  const rawStatePath = process.env.STATE_FILE_PATH || './data/state.json';
  
  // Resolve path to ensure absolute referencing regardless of running context
  const stateFilePath = path.resolve(process.cwd(), rawStatePath);

  const rawNitterInstances = process.env.NITTER_INSTANCES || 'nitter.cz,nitter.poast.org,nitter.no-logs.otf.gg';
  const nitterInstances = rawNitterInstances
    .split(',')
    .map((instance) => instance.trim())
    .filter((instance) => instance.length > 0);

  const telegramChannel = process.env.TELEGRAM_CHANNEL || 'SidraChain_Official';

  const rawRoadmapUrls = process.env.ROADMAP_URLS || 'https://sidrachain.com';
  const roadmapUrls = rawRoadmapUrls
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  return {
    discordWebhookUrl,
    roadmapWebhookUrl,
    geminiApiKey,
    scrapeInterval,
    stateFilePath,
    nitterInstances: nitterInstances.length > 0 ? nitterInstances : ['nitter.cz'],
    telegramChannel,
    roadmapUrls,
  };
}
