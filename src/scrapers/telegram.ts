import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

/**
 * Scraper provider that fetches updates from a public Telegram channel web preview.
 *
 * Why: Telegram is the primary channel for crypto announcements. Telegram's
 * public web preview (https://t.me/s/<channel>) serves clean, static HTML containing
 * recent messages, allowing us to scrape announcements without Telegram API keys.
 */
export class TelegramScraper implements ScraperProvider {
  public readonly name = 'telegram';
  private channelName: string;

  /**
   * Constructs the TelegramScraper.
   * @param channelName Name/handle of the target Telegram channel (default: SidraChain_Official).
   */
  constructor(channelName: string = 'SidraChain_Official') {
    this.channelName = channelName;
  }

  /**
   * Scrapes the target Telegram channel web preview.
   */
  async scrape(_instances: string[]): Promise<ScrapedUpdate[]> {
    const url = `https://t.me/s/${this.channelName}`;
    
    try {
      logger.info(`Fetching Telegram announcements from public web preview: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const updates: ScrapedUpdate[] = [];

      // Telegram messages are inside .tgme_widget_message wrappers
      $('.tgme_widget_message').each((_, element) => {
        try {
          const $el = $(element);

          // Extract unique message ID (looks like "SidraChain_Official/123")
          const messageLinkEl = $el.find('.tgme_widget_message_date');
          const messageUrl = messageLinkEl.attr('href') || '';
          if (!messageUrl) return;

          const match = messageUrl.match(/t\.me\/s\/([^/]+\/\d+)/) || messageUrl.match(/t\.me\/([^/]+\/\d+)/);
          const messageId = match ? match[1] : messageUrl;

          // Extract content text
          const contentText = $el.find('.tgme_widget_message_text').text().trim();
          if (!contentText) return;

          // Extract timestamp
          const timeEl = $el.find('time');
          const datetime = timeEl.attr('datetime') || new Date().toISOString();

          // Generate clean title
          const firstLine = contentText.split('\n')[0].trim();
          const title = firstLine.length > 80 ? `${firstLine.substring(0, 77)}...` : firstLine;

          updates.push({
            id: messageId,
            title,
            content: contentText,
            timestamp: new Date(datetime).toISOString(),
            url: messageUrl.startsWith('http') ? messageUrl : `https://${messageUrl}`,
            source: this.name,
          });
        } catch (itemError) {
          logger.error('Failed to parse individual Telegram message', itemError);
        }
      });

      // Return oldest first
      return updates;
    } catch (error) {
      logger.error(`Failed to scrape Telegram channel: ${this.channelName}`, error);
      throw error;
    }
  }
}
