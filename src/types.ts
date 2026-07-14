/**
 * Represents a single scraped update from a tracked ecosystem resource.
 */
export interface ScrapedUpdate {
  /**
   * Unique identifier for the update (e.g. tweet ID, post URL).
   */
  id: string;

  /**
   * Title or short summary of the update.
   */
  title: string;

  /**
   * Full text content of the update.
   */
  content: string;

  /**
   * The timestamp of when the update was originally published (ISO string).
   */
  timestamp: string;

  /**
   * Direct URL link to the original update.
   */
  url: string;

  /**
   * The source provider identifier (e.g., 'nitter', 'binance_square').
   */
  source: string;
}

/**
 * Structure of the local state JSON file.
 * Storing a list of recently processed IDs helps avoid duplicate notifications
 * even if posts are reordered, deleted, or pinned.
 */
export interface ScraperState {
  /**
   * Map of source name to an array of recently processed update IDs.
   */
  processedIds: Record<string, string[]>;

  /**
   * Timestamp of the last run.
   */
  lastRunTimestamp: string;
}

/**
 * Interface that all scraper providers must implement.
 *
 * Why: Standardizing the scraper interface allows us to easily add or hot-swap
 * scraping sources (e.g., Nitter, Binance Square, CoinMarketCap) without changing
 * the core orchestrator or notification logic.
 */
export interface ScraperProvider {
  /**
   * The unique identifier for the provider.
   */
  name: string;

  /**
   * Fetches the latest updates from the source.
   * @param config The application configuration to retrieve URLs or fallback instances.
   * @returns A promise resolving to an array of ScrapedUpdate objects.
   */
  scrape(instances: string[]): Promise<ScrapedUpdate[]>;
}
