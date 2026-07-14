import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

/**
 * Scraper provider that fetches updates from a Twitter timeline mirrored via Nitter.
 *
 * Why: Scraping X/Twitter directly requires expensive developer API access or complex
 * headless browsers to bypass login walls. Nitter instances serve clean, static HTML,
 * which can be parsed efficiently with Axios and Cheerio.
 */
export class NitterScraper implements ScraperProvider {
  public readonly name = 'nitter';

  /**
   * Scrapes the Sidra Chain timeline, rotating through Nitter instances if errors occur.
   *
   * Why: Public Nitter instances frequently experience rate limits, cloudflare challenges,
   * or temporary downtime. Auto-rotating ensures high uptime and resilience.
   *
   * @param instances Array of Nitter hostnames to try in order (e.g., ['nitter.privacydev.net']).
   * @returns List of parsed updates.
   */
  async scrape(instances: string[]): Promise<ScrapedUpdate[]> {
    for (const instance of instances) {
      try {
        logger.info(`Attempting to scrape Nitter feed from instance: ${instance}`);
        const updates = await this.scrapeInstance(instance);
        logger.info(`Successfully scraped ${updates.length} updates from Nitter instance: ${instance}`);
        return updates;
      } catch (error) {
        logger.warn(`Failed to scrape Nitter instance: ${instance}. Trying fallback if available.`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw new Error('All configured Nitter instances failed to respond or parse correctly.');
  }

  /**
   * Scrapes a single Nitter instance.
   */
  private async scrapeInstance(instance: string): Promise<ScrapedUpdate[]> {
    const url = `https://${instance}/sidrachain`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000, // 15-second timeout
    });

    const $ = cheerio.load(response.data);
    const updates: ScrapedUpdate[] = [];

    // Nitter timeline items are contained in timeline-item divs
    $('.timeline-item').each((_, element) => {
      try {
        const $el = $(element);

        // Skip if it is a retweet header unless you specifically want retweets
        const isRetweet = $el.find('.retweet-header').length > 0;
        if (isRetweet) {
          return; // Skip retweets to focus only on original Sidra Chain announcements
        }

        // Extract Tweet Content Link
        const tweetLinkEl = $el.find('.tweet-link');
        if (tweetLinkEl.length === 0) return;

        const relativePath = tweetLinkEl.attr('href') || ''; // e.g., "/sidrachain/status/1789012345678#m"
        if (!relativePath) return;

        // Parse out the Tweet ID from path
        const tweetIdMatch = relativePath.match(/\/status\/(\d+)/);
        if (!tweetIdMatch) return;
        const tweetId = tweetIdMatch[1];

        // Format a direct Twitter/X link instead of Nitter mirror link for end users
        const xUrl = `https://x.com/sidrachain/status/${tweetId}`;

        // Extract Content text
        const contentText = $el.find('.tweet-content').text().trim();
        if (!contentText) return;

        // Generate clean title (first line of tweet up to 80 chars)
        const firstLine = contentText.split('\n')[0].trim();
        const title = firstLine.length > 80 ? `${firstLine.substring(0, 77)}...` : firstLine;

        // Extract Timestamp
        const dateEl = $el.find('.tweet-date a');
        const rawDateTitle = dateEl.attr('title') || ''; // e.g. "Jul 14, 2026 · 8:33:22 AM UTC"
        let timestamp = new Date().toISOString();

        if (rawDateTitle) {
          // Nitter title formatting: "Jul 14, 2026 · 8:33:22 AM UTC" or "Jul 14, 2026 · 8:33 AM UTC"
          const cleanDateStr = rawDateTitle.replace('·', '').replace(/\s+/g, ' ');
          const parsedDate = new Date(cleanDateStr);
          if (!isNaN(parsedDate.getTime())) {
            timestamp = parsedDate.toISOString();
          }
        }

        updates.push({
          id: tweetId,
          title: title || 'New update from Sidra Chain',
          content: contentText,
          timestamp,
          url: xUrl,
          source: this.name,
        });
      } catch (itemError) {
        logger.error('Failed to parse individual Nitter timeline item', itemError);
      }
    });

    // Return chronological ordering (oldest first so that Discord dispatches them sequentially)
    return updates.reverse();
  }
}
