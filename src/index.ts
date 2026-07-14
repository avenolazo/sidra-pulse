import cron from 'node-cron';
import { getAppConfig } from './config.js';
import { logger } from './services/logger.js';
import { StateManager } from './services/state.js';
import { DiscordNotifier } from './services/discord.js';
import { NitterScraper } from './scrapers/nitter.js';
import { AggregatorScraper } from './scrapers/aggregator.js';
import { TelegramScraper } from './scrapers/telegram.js';
import { ScrapedUpdate, ScraperProvider } from './types.js';

/**
 * Main orchestrator class for the Sidra Chain scraper pipeline.
 *
 * Why: Coordinates state loading, scraper executions, state persistence,
 * and notification dispatching in a unified workflow.
 */
class ScraperPipeline {
  private config = getAppConfig();
  private stateManager = new StateManager(this.config.stateFilePath);
  private notifier = new DiscordNotifier(this.config.discordWebhookUrl);
  private scrapers: ScraperProvider[] = [
    new NitterScraper(),
    new AggregatorScraper(),
    new TelegramScraper(this.config.telegramChannel),
  ];
  private isRunning = false;

  /**
   * Runs the entire scraping and notification pipeline.
   *
   * Why: Wrapped in a try/catch block with explicit concurrency prevention
   * to avoid overlapping execution if scraping takes longer than the interval.
   */
  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scraper pipeline is already running. Skipping this iteration to prevent overlap.');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scraper pipeline execution...');

    try {
      const state = await this.stateManager.load();
      const allScrapedUpdates: ScrapedUpdate[] = [];
      const newUpdatesForDiscord: ScrapedUpdate[] = [];

      for (const scraper of this.scrapers) {
        try {
          const scraped = await scraper.scrape(this.config.nitterInstances);
          
          // Collect all updates to populate the website feed
          allScrapedUpdates.push(...scraped);

          const newForScraper = scraped.filter(
            (update) => !this.stateManager.isProcessed(state, scraper.name, update.id)
          );

          if (newForScraper.length > 0) {
            logger.info(`Found ${newForScraper.length} new updates from source: ${scraper.name}`);
            
            for (const update of newForScraper) {
              newUpdatesForDiscord.push(update);
              this.stateManager.markAsProcessed(state, scraper.name, update.id);
            }
          } else {
            logger.debug(`No new updates found for source: ${scraper.name}`);
          }
        } catch (scraperError) {
          logger.error(`Error executing scraper: ${scraper.name}`, scraperError);
        }
      }

      // Update global run timestamp
      state.lastRunTimestamp = new Date().toISOString();

      // Add all active scraped updates to the state file
      if (allScrapedUpdates.length > 0) {
        this.stateManager.addUpdates(state, allScrapedUpdates);
      }

      // Save state to disk
      await this.stateManager.save(state);

      if (newUpdatesForDiscord.length > 0) {
        // Chronological order sorting for notifications
        newUpdatesForDiscord.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Dispatch notifications
        await this.notifier.sendUpdates(newUpdatesForDiscord);
      } else {
        logger.info('Pipeline finished. No new updates to notify.');
      }
    } catch (error) {
      logger.error('Unhandled exception in scraper pipeline execution', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Initializes the scheduled cron jobs or executes a single run depending on config.
   *
   * Why: Supports running as a persistent daemon in development/local environments
   * and as a stateless, one-shot scheduler under CI/CD (GitHub Actions).
   */
  start(): void {
    const isOneShot = process.env.RUN_ONCE === 'true' || process.env.GITHUB_ACTIONS === 'true';

    if (isOneShot) {
      logger.info('Executing single-run validation (One-Shot Mode)...');
      this.run()
        .then(() => {
          logger.info('One-shot run completed successfully.');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('One-shot run encountered an error.', err);
          process.exit(1);
        });
      return;
    }

    const interval = this.config.scrapeInterval;

    if (!cron.validate(interval)) {
      logger.error(`Invalid cron schedule pattern: "${interval}". Exiting.`);
      process.exit(1);
    }

    logger.info('Initializing Sidra Pulse Scraper Daemon...');
    logger.info(`Cron Schedule: "${interval}"`);
    logger.info(`State File: "${this.config.stateFilePath}"`);
    logger.info(`Discord Webhook Status: ${this.config.discordWebhookUrl ? 'Configured' : 'NOT Configured (Dry Run Mode)'}`);

    // Schedule cron job
    const task = cron.schedule(interval, async () => {
      logger.info('Triggered scheduled execution.');
      await this.run();
    });

    // Run once on startup immediately to verify credentials and parsing
    logger.info('Running startup pipeline validation...');
    this.run().catch((err) => {
      logger.error('Startup validation run encountered an error', err);
    });

    // Register shutdown hooks for cleanup
    const shutdown = (): void => {
      logger.info('Received shutdown signal. Stopping scheduled tasks...');
      task.stop();
      logger.info('Daemon stopped successfully.');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

// Start the daemon
const pipeline = new ScraperPipeline();
pipeline.start();
