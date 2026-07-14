import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

export class NitterScraper implements ScraperProvider {
  public readonly name = 'nitter';

  async scrape(instances: string[]): Promise<ScrapedUpdate[]> {
    for (const instance of instances) {
      try {
        logger.info(`Attempting to scrape Nitter feed from instance: ${instance}`);
        const updates = await this.tryScrapeInstance(instance);
        if (updates.length > 0) {
          logger.info(`Successfully scraped ${updates.length} updates from Nitter instance: ${instance}`);
          return updates;
        }
        logger.warn(`Nitter instance ${instance} returned 0 updates. Trying fallback.`);
      } catch (error) {
        logger.warn(`Failed to scrape Nitter instance: ${instance}. Trying fallback if available.`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new Error('All configured Nitter instances failed to respond or parse correctly.');
  }

  private async tryScrapeInstance(instance: string): Promise<ScrapedUpdate[]> {
    // Try RSS/Atom feed first (more stable, less likely to be blocked)
    try {
      const feed = await this.scrapeRSS(instance);
      if (feed.length > 0) return feed;
    } catch {
      // RSS failed, fall through to HTML scraping
    }

    return this.scrapeHTML(instance);
  }

  private async scrapeRSS(instance: string): Promise<ScrapedUpdate[]> {
    const rssUrl = `https://${instance}/sidrachain/rss`;

    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/atom+xml, application/rss+xml, text/xml',
      },
      timeout: 10000,
    });

    const contentType = String(response.headers['content-type'] || '');
    if (!contentType.includes('xml') && !contentType.includes('rss') && !contentType.includes('atom')) {
      throw new Error('Response is not an XML/RSS feed');
    }

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const entries = parsed.feed?.entry || parsed.rss?.channel?.item || [];
    const items = Array.isArray(entries) ? entries : [entries];

    return items.map((item: any) => {
      const id = item.id?._ || item.guid?._ || item.link?.href || item.link || '';
      const title = item.title?._ || item.title || '';
      const content = item.content?._ || item.description || item.summary?._ || title;
      const url = item.link?.href || item.link || '';
      const pubDate = item.published || item.updated || item.pubDate || '';

      let timestamp = new Date().toISOString();
      if (pubDate) {
        const parsedDate = new Date(pubDate);
        if (!isNaN(parsedDate.getTime())) {
          timestamp = parsedDate.toISOString();
        }
      }

      return {
        id,
        title: title.length > 80 ? `${title.substring(0, 77)}...` : title,
        content: typeof content === 'string' ? content : title,
        timestamp,
        url: url.startsWith('http') ? url : `https://x.com/sidrachain/status/${id}`,
        source: this.name,
      };
    });
  }

  private async scrapeHTML(instance: string): Promise<ScrapedUpdate[]> {
    const url = `https://${instance}/sidrachain`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const updates: ScrapedUpdate[] = [];

    $('.timeline-item').each((_, element) => {
      try {
        const $el = $(element);

        const isRetweet = $el.find('.retweet-header').length > 0;
        if (isRetweet) return;

        const tweetLinkEl = $el.find('.tweet-link');
        if (tweetLinkEl.length === 0) return;

        const relativePath = tweetLinkEl.attr('href') || '';
        if (!relativePath) return;

        const tweetIdMatch = relativePath.match(/\/status\/(\d+)/);
        if (!tweetIdMatch) return;
        const tweetId = tweetIdMatch[1];

        const xUrl = `https://x.com/sidrachain/status/${tweetId}`;

        const contentText = $el.find('.tweet-content').text().trim();
        if (!contentText) return;

        const firstLine = contentText.split('\n')[0].trim();
        const title = firstLine.length > 80 ? `${firstLine.substring(0, 77)}...` : firstLine;

        const dateEl = $el.find('.tweet-date a');
        const rawDateTitle = dateEl.attr('title') || '';
        let timestamp = new Date().toISOString();

        if (rawDateTitle) {
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

    return updates.reverse();
  }
}
