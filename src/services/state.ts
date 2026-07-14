import fs from 'fs/promises';
import path from 'path';
import { ScraperState } from '../types.js';
import { logger } from './logger.js';

/**
 * Maximum number of historical processed IDs we retain per scraping source
 * to prevent the state file from growing indefinitely.
 */
const MAX_RETAINED_IDS_PER_SOURCE = 100;

/**
 * Service to manage local state, ensuring we do not send duplicate notifications.
 *
 * Why: A local-first JSON file acts as a lightweight, database-free persistence
 * layer. Writing atomically via a temporary file avoids corrupting the state
 * should the process be abruptly terminated during write operations.
 */
export class StateManager {
  private stateFilePath: string;

  /**
   * Constructs the StateManager instance.
   * @param stateFilePath Absolute path to the state JSON file.
   */
  constructor(stateFilePath: string) {
    this.stateFilePath = stateFilePath;
  }

  /**
   * Loads the current state from disk.
   *
   * Why: Gracefully handle the absence of the state file on initial run
   * by returning a default empty structure instead of crashing.
   *
   * @returns The ScraperState object.
   */
  async load(): Promise<ScraperState> {
    try {
      await fs.access(this.stateFilePath);
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(data) as ScraperState;
      
      // Ensure expected fields exist
      if (!parsed.processedIds) {
        parsed.processedIds = {};
      }
      if (!parsed.lastRunTimestamp) {
        parsed.lastRunTimestamp = new Date(0).toISOString();
      }
      if (!parsed.consecutiveFailures) {
        parsed.consecutiveFailures = {};
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No existing state file found. Initializing empty state.', { path: this.stateFilePath });
        return {
          processedIds: {},
          lastRunTimestamp: new Date(0).toISOString(),
          consecutiveFailures: {},
        };
      }
      logger.error('Failed to parse state file. Returning empty state fallback.', error);
      return {
        processedIds: {},
        lastRunTimestamp: new Date(0).toISOString(),
        consecutiveFailures: {},
      };
    }
  }

  /**
   * Saves the state to disk using an atomic write approach.
   *
   * Why: Writing directly to the target file can corrupt it if the process dies.
   * Writing to a temp file first and renaming it is an atomic operation in POSIX systems.
   *
   * @param state The state object to persist.
   */
  async save(state: ScraperState): Promise<void> {
    const tempPath = `${this.stateFilePath}.tmp`;
    try {
      // Ensure target directory exists
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });

      // Serialize state
      const data = JSON.stringify(state, null, 2);

      // Write to temp file and rename atomically
      await fs.writeFile(tempPath, data, 'utf-8');
      await fs.rename(tempPath, this.stateFilePath);
      logger.debug('State persisted successfully.', { path: this.stateFilePath });
    } catch (error) {
      logger.error('Failed to save state atomically. Attempting cleanup.', error);
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup failure if file didn't exist
      }
      throw error;
    }
  }

  /**
   * Checks whether a specific update ID has already been processed for a source.
   * @param state The active ScraperState object.
   * @param source The source identifier.
   * @param id The update's unique ID.
   * @returns True if already processed, false otherwise.
   */
  isProcessed(state: ScraperState, source: string, id: string): boolean {
    const ids = state.processedIds[source] || [];
    return ids.includes(id);
  }

  /**
   * Records a new update ID as processed, enforcing a rotation limit on stored IDs.
   * @param state The active ScraperState object.
   * @param source The source identifier.
   * @param id The update's unique ID to mark.
   */
  markAsProcessed(state: ScraperState, source: string, id: string): void {
    if (!state.processedIds[source]) {
      state.processedIds[source] = [];
    }

    const ids = state.processedIds[source];
    if (!ids.includes(id)) {
      ids.push(id);
      
      // Shift out oldest items if limit is exceeded
      if (ids.length > MAX_RETAINED_IDS_PER_SOURCE) {
        state.processedIds[source] = ids.slice(ids.length - MAX_RETAINED_IDS_PER_SOURCE);
      }
    }
  }
}
