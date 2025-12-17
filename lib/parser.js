import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/**
 * Parse ALL session files and return records (for setup sync)
 * @returns {Array} Records array [{ date, model, input, output }]
 */
export function parseAllToRecords() {
  const jsonlFiles = findJsonlFiles(CLAUDE_PROJECTS_DIR);
  const recordsMap = {}; // key: date:model

  for (const filePath of jsonlFiles) {
    try {
      parseFileToRecords(filePath, recordsMap, null); // no date filter
    } catch (err) {
      // Skip files that can't be parsed
    }
  }

  return Object.values(recordsMap);
}

/**
 * Parse only MODIFIED files since lastSyncTime and return records
 * @param {number} lastSyncTime - Timestamp in ms
 * @param {string} minDate - Only include records >= this date (YYYY-MM-DD)
 * @returns {Array} Records array [{ date, model, input, output }]
 */
export function parseModifiedToRecords(lastSyncTime, minDate) {
  const jsonlFiles = findJsonlFiles(CLAUDE_PROJECTS_DIR);
  const recordsMap = {}; // key: date:model

  for (const filePath of jsonlFiles) {
    try {
      const stat = statSync(filePath);
      const mtime = stat.mtimeMs;

      // Only parse files modified since lastSyncTime
      if (mtime > lastSyncTime) {
        parseFileToRecords(filePath, recordsMap, minDate);
      }
    } catch (err) {
      // Skip files we can't access
    }
  }

  return Object.values(recordsMap);
}

/**
 * Parse a single file and aggregate into recordsMap
 * @param {string} filePath - Path to JSONL file
 * @param {Object} recordsMap - Map to aggregate into (mutated)
 * @param {string|null} minDate - Only include entries >= this date, or null for all
 */
function parseFileToRecords(filePath, recordsMap, minDate) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const data = JSON.parse(line);

      // Only process assistant messages with usage data
      if (data.type !== 'assistant' || !data.message?.usage) {
        continue;
      }

      // Skip if no timestamp
      if (!data.timestamp) {
        continue;
      }

      const day = data.timestamp.slice(0, 10);

      // Filter by date if minDate is set
      if (minDate && day < minDate) {
        continue;
      }

      const usage = data.message.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;

      const model = data.message.model || 'unknown';
      const modelKey = normalizeModelName(model);

      // Aggregate by date:model
      const key = `${day}:${modelKey}`;
      if (!recordsMap[key]) {
        recordsMap[key] = { date: day, model: modelKey, input: 0, output: 0 };
      }
      recordsMap[key].input += inputTokens;
      recordsMap[key].output += outputTokens;
    } catch (err) {
      // Skip malformed lines
    }
  }
}

/**
 * Recursively find all .jsonl files in a directory
 */
function findJsonlFiles(dir) {
  const files = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          files.push(...findJsonlFiles(fullPath));
        } else if (entry.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      } catch (err) {
        // Skip files/dirs we can't access
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Normalize model names to friendly display names
 */
function normalizeModelName(model) {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('haiku')) return 'Haiku';
  return model;
}

/**
 * Format a number with commas and optional suffix (K, M, B)
 */
export function formatNumber(num) {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}
