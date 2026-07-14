import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedUpdate, ScraperProvider } from '../types.js';
import { logger } from '../services/logger.js';

const GEMINI_MODEL = 'gemini-2.5-flash';

export class AggregatorScraper implements ScraperProvider {
  public readonly name = 'aggregator';

  async scrape(_instances: string[]): Promise<ScrapedUpdate[]> {
    const updateSets: ScrapedUpdate[][] = [];

    const results = await Promise.allSettled([
      this.scrapeGoogleNews(),
      this.scrapeBinanceSquare(),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        updateSets.push(result.value);
      }
    }

    const allUpdates = updateSets.flat();

    const limited = allUpdates.slice(0, 10);

    return limited.reverse();
  }

  private async scrapeGoogleNews(): Promise<ScrapedUpdate[]> {
    const searchUrl = 'https://news.google.com/rss/search?q=Sidra+Chain+OR+SidraChain&hl=en-US&gl=US&ceid=US:en';

    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const items: { title: string; url: string; guid: string; description: string; timestamp: string }[] = [];

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

          const cleanDescription = description.replace(/<[^>]*>/g, '').trim();

          items.push({ title, url, guid, description: cleanDescription, timestamp });
        } catch (itemError) {
          logger.error('Failed to parse individual RSS item', itemError);
        }
      });

      // Use Gemini for bulk semantic filtering if API key is available
      const apiKey = process.env.GEMINI_API_KEY;
      let filteredItems = items;

      if (apiKey) {
        const geminiFiltered = await this.filterWithGemini(items, apiKey);
        filteredItems = items.filter((item) =>
          geminiFiltered.some((f) => f.title === item.title && f.description === item.description)
        );
      } else {
        filteredItems = items.filter((item) => {
          const combinedText = `${item.title} ${item.description}`.toLowerCase();
          const keywords = ['sda', 'token', 'blockchain', 'chain', 'node', 'validator', 'mainnet', 'testnet', 'kyc', 'crypto', 'web3', 'sidra', 'wallet', 'exchange', 'listing', 'airdrop', 'staking', 'defi'];
          return keywords.some((keyword) => combinedText.includes(keyword));
        });
      }

      const skippedCount = items.length - filteredItems.length;
      if (skippedCount > 0) {
        logger.debug(`Semantic filtering removed ${skippedCount} irrelevant articles`);
      }

      return filteredItems.map((item) => ({
        id: item.guid,
        title: item.title,
        content: item.description || item.title,
        timestamp: item.timestamp,
        url: item.url,
        source: this.name,
      }));
    } catch (error) {
      logger.error('Failed to fetch Google News RSS feed', error);
      return [];
    }
  }

  private async filterWithGemini(
    items: { title: string; description: string }[],
    apiKey: string
  ): Promise<typeof items> {
    const batchSize = 20;
    const relevant: typeof items = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const articleLines = batch
        .map((a, idx) => `[${idx}] Title: ${a.title}\n    Description: ${a.description.slice(0, 200)}`)
        .join('\n\n');

      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: `You are a strict SidraChain content filter. SidraChain is a Shariah-compliant blockchain platform (SDA token, mainnet since Oct 2023).
Only flag articles as relevant if they are specifically about SidraChain the blockchain project (NOT Sidra Bank, Sidra Capital, Sidra Medicine, Sidra Hospital, Sidra Mall, or other unrelated entities with "Sidra" in the name).

Respond with a comma-separated list of index numbers that ARE relevant to SidraChain blockchain.
Example: "0,3,5"
If none are relevant, respond with "NONE".`,
                  },
                  {
                    text: `Classify these news articles:\n\n${articleLines}`,
                  },
                ],
              },
            ],
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
          }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'NONE';
        if (text !== 'NONE') {
          const indices = text.split(',').map((s: string) => parseInt(s.trim(), 10));
          for (const idx of indices) {
            if (idx >= 0 && idx < batch.length) {
              relevant.push(batch[idx]);
            }
          }
        }
      } catch (error) {
        logger.error('Gemini filtering failed for batch, falling back to all items', error);
        relevant.push(...batch);
      }
    }

    return relevant;
  }

  private async scrapeBinanceSquare(): Promise<ScrapedUpdate[]> {
    try {
      const response = await axios.get('https://www.binance.com/en/square/hashtag/sidrachain', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const updates: ScrapedUpdate[] = [];

      $('a[href*="/square/post/"]').each((_, element) => {
        const $el = $(element);
        const href = $el.attr('href') || '';
        const fullUrl = href.startsWith('http') ? href : `https://www.binance.com${href}`;
        const text = $el.text().trim();
        if (!text || !href) return;

        const idMatch = href.match(/\/post\/(\d+)/);
        const id = idMatch ? idMatch[1] : fullUrl;

        updates.push({
          id: `binance_${id}`,
          title: text.length > 80 ? `${text.substring(0, 77)}...` : text,
          content: text,
          timestamp: new Date().toISOString(),
          url: fullUrl,
          source: this.name,
        });
      });

      return updates.slice(0, 5);
    } catch (error) {
      logger.error('Failed to scrape Binance Square', error);
      return [];
    }
  }
}
