import { appendFileSync, statSync, truncateSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_FILE = join(homedir(), '.claude-stats', 'sync.log');
const MAX_LOG_SIZE = 1024 * 1024; // 1MB max log size

/**
 * Get current timestamp in readable format
 */
function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Log a message to the log file
 * @param {string} message - Message to log
 */
export function log(message) {
  const line = `[${getTimestamp()}] ${message}\n`;

  try {
    // Check if log file is too large and truncate if needed
    try {
      const stats = statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        truncateSync(LOG_FILE, 0);
        appendFileSync(LOG_FILE, `[${getTimestamp()}] Log rotated (exceeded ${MAX_LOG_SIZE / 1024}KB)\n`);
      }
    } catch (e) {
      // File doesn't exist yet, that's fine
    }

    appendFileSync(LOG_FILE, line);
  } catch (err) {
    // Silently fail - we don't want logging to break the sync
  }
}

/**
 * Log an error
 * @param {string} message - Error message
 * @param {Error} [error] - Optional error object
 */
export function logError(message, error) {
  log(`ERROR: ${message}${error ? ` - ${error.message}` : ''}`);
}

/**
 * Log sync start
 */
export function logSyncStart() {
  log('─'.repeat(50));
  log('SYNC START');
}

/**
 * Log sync completion
 * @param {number} durationMs - Duration in milliseconds
 */
export function logSyncComplete(durationMs) {
  log(`SYNC COMPLETE (${(durationMs / 1000).toFixed(1)}s)`);
}

/**
 * Log stats parsed
 * @param {Object} stats - Stats object
 */
export function logStatsParsed(stats) {
  const tokens = formatTokens(stats.totalTokens);
  log(`Parsed ${stats.totalSessions} sessions, ${tokens} tokens`);
}

/**
 * Log SVG generated
 * @param {string} path - Path to generated SVG
 */
export function logSvgGenerated(path) {
  log(`SVG generated: ${path}`);
}

/**
 * Log gist updated
 * @param {string} gistId - Gist ID
 */
export function logGistUpdated(gistId) {
  log(`Gist updated: ${gistId}`);
}

/**
 * Format token count for display
 */
function formatTokens(num) {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toString();
}
