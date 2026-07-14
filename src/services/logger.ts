/**
 * Log levels supported by the application logger.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Formats the log statement with timestamp, level, and metadata.
 *
 * Why: Module-private function to handle serialization of metadata and timestamp.
 */
function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaString = meta && Object.keys(meta).length > 0 ? ` | Meta: ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}`;
}

/**
 * Low-level method to write logs to standard output or standard error.
 *
 * Why: Module-private function to direct ERROR level logs to stderr and other levels to stdout.
 */
function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const formatted = format(level, message, meta);
  if (level === 'ERROR') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }
}

/**
 * Dedicated logger service that handles formatted stdout/stderr logging.
 *
 * Why: Standardizing logs avoids direct use of console.log in production, allows
 * consistent formatting (timestamps, log levels), and facilitates redirection of
 * logs to monitoring systems or log aggregators.
 */
export const logger = {
  /**
   * Logs a message with DEBUG level.
   * @param message Description of the event.
   * @param meta Optional metadata object.
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG === 'true') {
      log('DEBUG', message, meta);
    }
  },

  /**
   * Logs a message with INFO level.
   * @param message Description of the event.
   * @param meta Optional metadata object.
   */
  info(message: string, meta?: Record<string, unknown>): void {
    log('INFO', message, meta);
  },

  /**
   * Logs a message with WARN level.
   * @param message Description of the event.
   * @param meta Optional metadata object.
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    log('WARN', message, meta);
  },

  /**
   * Logs a message with ERROR level and prints stack trace if available.
   * @param message Description of the failure.
   * @param error The thrown error or exception.
   * @param meta Optional metadata object.
   */
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorMeta: Record<string, unknown> = { ...meta };
    if (error instanceof Error) {
      errorMeta.errorName = error.name;
      errorMeta.errorMessage = error.message;
      errorMeta.stack = error.stack;
    } else if (error !== undefined) {
      errorMeta.rawError = String(error);
    }
    log('ERROR', message, errorMeta);
  }
};
