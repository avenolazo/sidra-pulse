import axios from 'axios';
import { ScrapedUpdate } from '../types.js';
import { logger } from './logger.js';

/**
 * Discord Webhook client to dispatch formatted Rich Embed notifications.
 *
 * Why: Encapsulates all formatting and dispatching logic. Incorporates rate-limiting
 * protection (throttled queue) and payload formatting (truncation, embeds) to ensure
 * stable integration with Discord.
 */
export class DiscordNotifier {
  private webhookUrl: string | null;

  /**
   * Constructs the DiscordNotifier.
   * @param webhookUrl The Discord Webhook URL. If null, notifications will be logged to console.
   */
  constructor(webhookUrl: string | null) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Dispatches a list of updates as embeds to the Discord webhook.
   *
   * Why: Processes updates sequentially with a slight delay to respect Discord's rate limits
   * (maximum 5 requests per 2 seconds).
   *
   * @param updates List of new scraped updates.
   */
  async sendUpdates(updates: ScrapedUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    logger.info(`Dispatching ${updates.length} new updates to Discord...`);

    for (const update of updates) {
      if (!this.webhookUrl) {
        logger.warn('No Discord Webhook URL configured. Logging update payload instead:', { update });
        continue;
      }

      try {
        await this.sendEmbed(update);
        // Delay between posts to respect Discord's rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`Failed to send update to Discord: ${update.id}`, error);
      }
    }
  }

  /**
   * Sends a single update formatted as a Discord Rich Embed.
   */
  private async sendEmbed(update: ScrapedUpdate): Promise<void> {
    if (!this.webhookUrl) return;

    // Truncate content to avoid exceeding Discord embed limits (4096 char max, but 1000 is cleaner)
    const maxLength = 1000;
    const truncatedContent = update.content.length > maxLength
      ? `${update.content.substring(0, maxLength)}...\n\n[Read full post](${update.url})`
      : update.content;

    // Decimal color equivalent to #10B981 (Emerald Green for Sidra Chain pulse)
    const embedColor = 1095937;

    const payload = {
      embeds: [
        {
          title: this.truncateString(update.title, 256),
          description: truncatedContent,
          url: update.url,
          color: embedColor,
          timestamp: update.timestamp,
          fields: [
            {
              name: 'Source Feed',
              value: `📡 ${this.formatSource(update.source)}`,
              inline: true,
            },
          ],
          footer: {
            text: 'Sidra Pulse Monitor',
            icon_url: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/testnets/sidrachain/images/sidra.png', // Fallback to a placeholder if needed
          },
        },
      ],
    };

    await axios.post(this.webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000, // 10s timeout
    });

    logger.info(`Successfully dispatched Discord alert for update ID: ${update.id}`);
  }

  /**
   * Formats the raw source identifier to a user-friendly name.
   */
  private formatSource(source: string): string {
    switch (source.toLowerCase()) {
      case 'nitter':
        return 'Nitter (X Mirror)';
      case 'binance_square':
        return 'Binance Square Feed';
      case 'coinmarketcap':
        return 'CoinMarketCap Community';
      case 'github':
        return 'GitHub (Sidra-Chain)';
      default:
        return source;
    }
  }

  /**
   * Helper to truncate strings safely without breaking.
   */
  private truncateString(str: string, max: number): string {
    return str.length > max ? `${str.substring(0, max - 3)}...` : str;
  }

  /**
   * Dispatches a warning alert message to the Discord webhook notifying about a scraper error.
   */
  async sendErrorAlert(scraperName: string, errorMsg: string): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn(`No Discord Webhook configured. Skipping error alert for scraper: ${scraperName}`);
      return;
    }

    const payload = {
      embeds: [
        {
          title: `⚠️ Scraper Failure Alert: ${scraperName}`,
          description: `The scraper provider **${scraperName}** has failed multiple times consecutively.\n\n**Error Log**:\n\`\`\`\n${this.truncateString(errorMsg, 800)}\n\`\`\``,
          color: 16731215, // Decimal equivalent for #FF5252 (Red Warning)
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Sidra Pulse Developer Alert',
          },
        },
      ],
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      logger.info(`Developer failure alert sent for scraper: ${scraperName}`);
    } catch (error) {
      logger.error(`Failed to dispatch error alert to Discord for scraper: ${scraperName}`, error);
    }
  }

  /**
   * Dispatches a custom rich embed to the configured webhook.
   */
  async sendCustomEmbed(title: string, description: string, color: number = 1095937): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn(`No Discord Webhook configured. Skipping embed: ${title}`);
      return;
    }

    const payload = {
      embeds: [
        {
          title: this.truncateString(title, 256),
          description: description,
          color: color,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Sidra Pulse Monitor',
          },
        },
      ],
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      logger.info(`Successfully dispatched custom embed: ${title}`);
    } catch (error) {
      logger.error(`Failed to dispatch custom embed: ${title}`, error);
    }
  }
}
