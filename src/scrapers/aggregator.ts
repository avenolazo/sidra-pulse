import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

/**
 * Scraper provider that parses RSS feeds to aggregate ecosystem updates.
 *
 * Why: Public crypto aggregators like CoinMarketCap or Binance Square often employ
 * strict anti-bot measures, JavaScript obfuscation, and rate limits. Aggregating
 * news and announcements via public search engines (like Google News RSS) using
 * Cheerio's XML mode provides a stable, zero-dependency, and highly reliable alternative.
 */
export class AggregatorScraper implements ScraperProvider {
  public readonly name = 'aggregator';

  /**
   * Scrapes the target news/crypto RSS feed.
   *
   * Why: Cheerio's xmlMode is highly efficient at parsing RSS/XML structures,
   * avoiding the need for heavy external XML parsing libraries.
   *
   * @param _instances Unused for RSS feeds, but kept for interface compliance.
   * @returns A promise resolving to an array of ScrapedUpdate objects.
   */
  async scrape(_instances: string[]): Promise<ScrapedUpdate[]> {
    const searchUrl = 'https://news.google.com/rss/search?q=Sidra+Chain+OR+SidraChain&hl=en-US&gl=US&ceid=US:en';
    
    try {
      logger.info('Fetching latest crypto/ecosystem aggregator updates via RSS search feed...');
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data, {
        xmlMode: true,
      });

      const updates: ScrapedUpdate[] = [];

      $('item').each((_, element) => {
        try {
          const $el = $(element);

          const title = $el.find('title').text().trim();
          const url = $el.find('link').text().trim();
          const guid = $el.find('guid').text().trim() || url;
          const description = $el.find('description').text().trim();
          const pubDate = $el.find('pubDate').text().trim();

          if (!title || !url) return;

          let timestamp = new Date().toISOString();
          if (pubDate) {
            const parsedDate = new Date(pubDate);
            if (!isNaN(parsedDate.getTime())) {
              timestamp = parsedDate.toISOString();
            }
          }

          // Strip HTML tags from description if present
          const cleanDescription = description.replace(/<[^>]*>/g, '').trim();

          updates.push({
            id: guid,
            title,
            content: cleanDescription || title,
            timestamp,
            url,
            source: this.name,
          });
        } catch (itemError) {
          logger.error('Failed to parse individual RSS item', itemError);
        }
      });

      // Limit to the most recent 10 updates to avoid spamming on first run
      const limitedUpdates = updates.slice(0, 10);
      
      // Return oldest first
      return limitedUpdates.reverse();
    } catch (error) {
      logger.error('Failed to fetch aggregator RSS feed', error);
      throw error;
    }
  }
}
