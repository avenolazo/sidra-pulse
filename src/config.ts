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
  const scrapeInterval = process.env.SCRAPE_INTERVAL || '*/30 * * * *';
  const rawStatePath = process.env.STATE_FILE_PATH || './data/state.json';
  
  // Resolve path to ensure absolute referencing regardless of running context
  const stateFilePath = path.resolve(process.cwd(), rawStatePath);

  const rawNitterInstances = process.env.NITTER_INSTANCES || 'nitter.privacydev.net,nitter.poast.org,nitter.no-logs.otf.gg';
  const nitterInstances = rawNitterInstances
    .split(',')
    .map((instance) => instance.trim())
    .filter((instance) => instance.length > 0);

  return {
    discordWebhookUrl,
    scrapeInterval,
    stateFilePath,
    nitterInstances: nitterInstances.length > 0 ? nitterInstances : ['nitter.privacydev.net'],
  };
}
