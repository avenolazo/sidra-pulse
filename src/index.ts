import cron from 'node-cron';
import crypto from 'crypto';
import { getAppConfig } from './config.js';
import { logger } from './services/logger.js';
import { StateManager } from './services/state.js';
import { DiscordNotifier } from './services/discord.js';
import { RoadmapTracker } from './services/roadmap.js';
import { NitterScraper } from './scrapers/nitter.js';
import { AggregatorScraper } from './scrapers/aggregator.js';
import { TelegramScraper } from './scrapers/telegram.js';
import { GitHubScraper } from './scrapers/github.js';
import { ScrapedUpdate, ScraperProvider } from './types.js';

const MAX_PER_SOURCE_FIRST_RUN = 5;

class ScraperPipeline {
  private config = getAppConfig();
  private stateManager = new StateManager(this.config.stateFilePath);
  private notifier = new DiscordNotifier(this.config.discordWebhookUrl);
  private roadmapTracker = new RoadmapTracker(this.config);
  private scrapers: ScraperProvider[] = [
    new NitterScraper(),
    new AggregatorScraper(),
    new TelegramScraper(this.config.telegramChannel),
    new GitHubScraper(),
  ];
  private isRunning = false;

  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scraper pipeline is already running. Skipping this iteration to prevent overlap.');
      return;
    }

    this.isRunning = true;
    logger.info('Starting scraper pipeline execution...');

    try {
      const state = await this.stateManager.load();
      const newUpdatesForDiscord: ScrapedUpdate[] = [];

      for (const scraper of this.scrapers) {
        try {
          const scraped = await scraper.scrape(this.config.nitterInstances);
          
          if (!state.consecutiveFailures) {
            state.consecutiveFailures = {};
          }
          state.consecutiveFailures[scraper.name] = 0;

          const newForScraper = scraped.filter(
            (update) => !this.stateManager.isProcessed(state, scraper.name, update.id)
          );

          if (newForScraper.length > 0) {
            logger.info(`Found ${newForScraper.length} new updates from source: ${scraper.name}`);

            const isFirstRun = state.lastRunTimestamp === new Date(0).toISOString();
            const cap = isFirstRun ? Math.min(newForScraper.length, MAX_PER_SOURCE_FIRST_RUN) : newForScraper.length;

            for (let i = 0; i < cap; i++) {
              newUpdatesForDiscord.push(newForScraper[i]);
              this.stateManager.markAsProcessed(state, scraper.name, newForScraper[i].id);
            }

            if (cap < newForScraper.length) {
              logger.info(`First-run throttle: capped ${scraper.name} from ${newForScraper.length} to ${cap} notifications.`);
              for (let i = cap; i < newForScraper.length; i++) {
                this.stateManager.markAsProcessed(state, scraper.name, newForScraper[i].id);
              }
            }
          } else {
            logger.debug(`No new updates found for source: ${scraper.name}`);
          }
        } catch (scraperError) {
          logger.error(`Error executing scraper: ${scraper.name}`, scraperError);

          if (!state.consecutiveFailures) {
            state.consecutiveFailures = {};
          }
          const failures = (state.consecutiveFailures[scraper.name] || 0) + 1;
          state.consecutiveFailures[scraper.name] = failures;

          if (failures === 5) {
            logger.warn(`Scraper ${scraper.name} has failed 5 consecutive times. Sending alert to Discord.`);
            const errorMsg = scraperError instanceof Error ? scraperError.message : String(scraperError);
            await this.notifier.sendErrorAlert(scraper.name, errorMsg);
          }
        }
      }

      const deduplicated = this.deduplicate(newUpdatesForDiscord);
      if (deduplicated.length < newUpdatesForDiscord.length) {
        logger.info(`Cross-source dedup removed ${newUpdatesForDiscord.length - deduplicated.length} duplicates.`);
      }

      await this.roadmapTracker.checkUpdates(state);

      state.lastRunTimestamp = new Date().toISOString();

      await this.stateManager.save(state);

      if (deduplicated.length > 0) {
        deduplicated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        await this.notifier.sendUpdates(deduplicated);
      } else {
        logger.info('Pipeline finished. No new updates to notify.');
      }
    } catch (error) {
      logger.error('Unhandled exception in scraper pipeline execution', error);
    } finally {
      this.isRunning = false;
    }
  }

  private deduplicate(updates: ScrapedUpdate[]): ScrapedUpdate[] {
    const seenHashes = new Set<string>();
    return updates.filter((update) => {
      const normalized = `${update.title.toLowerCase().trim()}|${update.content.toLowerCase().trim().slice(0, 200)}`;
      const hash = crypto.createHash('md5').update(normalized).digest('hex');
      if (seenHashes.has(hash)) return false;
      seenHashes.add(hash);
      return true;
    });
  }

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

    const task = cron.schedule(interval, async () => {
      logger.info('Triggered scheduled execution.');
      await this.run();
    });

    logger.info('Running startup pipeline validation...');
    this.run().catch((err) => {
      logger.error('Startup validation run encountered an error', err);
    });

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

const pipeline = new ScraperPipeline();
pipeline.start();
