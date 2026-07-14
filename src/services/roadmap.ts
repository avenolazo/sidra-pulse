import axios from 'axios';
import * as cheerio from 'cheerio';
import { AppConfig } from '../config.js';
import { ScraperState } from '../types.js';
import { DiscordNotifier } from './discord.js';
import { logger } from './logger.js';

/**
 * Service to scrape official pages and track major roadmap & capability updates.
 */
export class RoadmapTracker {
  private config: AppConfig;
  private notifier: DiscordNotifier;

  constructor(config: AppConfig) {
    this.config = config;
    this.notifier = new DiscordNotifier(config.roadmapWebhookUrl);
  }

  /**
   * Runs the roadmap check against the configured target URLs.
   * @param state The active ScraperState object.
   */
  async checkUpdates(state: ScraperState): Promise<void> {
    if (!this.config.roadmapWebhookUrl) {
      logger.debug('No ROADMAP_WEBHOOK_URL configured. Skipping roadmap check.');
      return;
    }

    if (!state.roadmapHtml) {
      state.roadmapHtml = {};
    }

    logger.info('Starting roadmap and ecosystem capability check...');

    for (const url of this.config.roadmapUrls) {
      try {
        logger.debug(`Fetching target roadmap URL: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          timeout: 15000,
        });

        const $ = cheerio.load(response.data);
        
        // Strip out noisy tags that don't represent feature context
        $('script, style, iframe, nav, footer, noscript').remove();

        // Extract body text, collapsing whitespaces
        const textElements: string[] = [];
        $('h1, h2, h3, h4, p, li, button, a').each((_, el) => {
          const txt = $(el).text().replace(/\s+/g, ' ').trim();
          if (txt.length > 5) {
            textElements.push(txt);
          }
        });

        const cleanContent = textElements.join('\n');
        const previousContent = state.roadmapHtml[url] || '';

        // If content has changed or this is the first run
        if (cleanContent !== previousContent) {
          logger.info(`Roadmap content change detected for URL: ${url}`);

          if (previousContent) {
            let analysis = '';
            if (this.config.geminiApiKey) {
              logger.info('Analyzing roadmap differences using Gemini API...');
              analysis = await this.analyzeWithGemini(previousContent, cleanContent);
            } else {
              logger.info('Gemini API key not set. Generating standard diff output...');
              analysis = this.generateTextDiff(previousContent, cleanContent);
            }

            await this.notifier.sendCustomEmbed(
              `Sidra Ecosystem Update: ${new URL(url).hostname}`,
              analysis,
              3447003 // Decimal for blue/cyan milestone color (#3498DB)
            );
          } else {
            logger.info(`First run for target: ${url}. Caching initial state.`);
            // Send a welcome message showing the current state of the page
            let initialSummary = '';
            if (this.config.geminiApiKey) {
              initialSummary = await this.analyzeWithGemini('', cleanContent);
            } else {
              initialSummary = 'Initial crawl successful. Tracking changes from this snapshot forward.';
            }

            await this.notifier.sendCustomEmbed(
              `Initialized Roadmap Tracker: ${new URL(url).hostname}`,
              initialSummary,
              3066993 // Decimal for emerald/green (#2ECC71)
            );
          }

          // Cache the clean content text to prevent repeating alert triggers
          state.roadmapHtml[url] = cleanContent;
        } else {
          logger.debug(`No roadmap changes detected for target URL: ${url}`);
        }
      } catch (error) {
        logger.error(`Failed to execute roadmap tracker for URL: ${url}`, error);
      }
    }
  }

  /**
   * Calls Google's Gemini API to analyze page changes.
   */
  private async analyzeWithGemini(oldText: string, newText: string): Promise<string> {
    const apiKey = this.config.geminiApiKey;
    if (!apiKey) return 'No API Key present.';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const systemPrompt = `You are a professional blockchain auditor and software product manager monitoring updates on the Sidra Chain web portal.
Your task is to analyze the crawled page text and identify changes to active and missing features.

Write a structured status report containing the following sections:
1. New Releases and Additions: (What was added in this update? If this is the initial crawl, list the newest active features).
2. Active Features: (List currently active portal capabilities, e.g. Wallet creation, KYC portal, P2P validation).
3. Roadmap Gaps and Pending Items: (What key standard blockchain capabilities, e.g. public block explorer, validator staking interface, swap/dApp interfaces, developer documentation, or bridges, are not mentioned as active in the crawled text?).
4. Summary: (A brief, one-sentence objective overview of the target page's current status and update).

Requirements:
- For New Releases and Active Features, be 100% accurate to the crawled text. Do not extrapolate features not directly mentioned.
- For Roadmap Gaps, identify standard layer-1/layer-2/layer-3 ecosystem modules that are not listed as active in the text.
- Do NOT use any emojis, icons, or decorative symbols.
- Use plain markdown bullet points (-) and bold section headers.
- Be extremely concise, technical, and objective.
- Avoid introductory sentences, concluding remarks, or conversational filler.`;

    const prompt = oldText
      ? `Compare the old crawled text with the new crawled text below:

--- OLD TEXT ---
${oldText.slice(0, 3000)}

--- NEW TEXT ---
${newText.slice(0, 3000)}`
      : `Analyze the current crawled text of the portal:

--- SITE TEXT ---
${newText.slice(0, 4000)}`;

    try {
      const response = await axios.post(
        url,
        {
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { text: prompt },
              ],
            },
          ],
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      const candidates = response.data?.candidates;
      if (candidates && candidates.length > 0) {
        const textResult = candidates[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          return textResult;
        }
      }
      return 'Failed to retrieve analysis from Gemini API candidate parts.';
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        logger.error(`Error invoking Gemini API for roadmap analysis: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error('Error invoking Gemini API for roadmap analysis', error);
      }
      return 'Error occurred during AI-assisted diff analysis. Falling back to manual logging.';
    }
  }

  /**
   * Generates a basic text diff when Gemini API is not available.
   */
  private generateTextDiff(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const additions: string[] = [];

    for (const line of newLines) {
      if (!oldLines.includes(line) && line.trim().length > 0) {
        additions.push(`+ ${line}`);
      }
    }

    if (additions.length === 0) {
      return 'Minor structural page adjustments detected without content additions.';
    }

    // Limit to prevent exceeding embed size limits
    const diffBlock = additions.slice(0, 15).join('\n');
    return `### 🔄 Content Changes Detected:\n\`\`\`diff\n${diffBlock}\n${additions.length > 15 ? '\n... (truncated)' : ''}\n\`\`\``;
  }
}
