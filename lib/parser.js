import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/**
 * Shape version of the cached file contributions.
 * Bump this when the cache layout changes. A cache with a missing or older
 * version is thrown away, every file is parsed again and every day is resent.
 */
export const CACHE_VERSION = 2;

/**
 * Build the records to send, reusing cached per file contributions.
 *
 * Each file keeps its own token counts in the cache, keyed by date and model.
 * A file is read again only when it is new or when its mtime changed. Every
 * day touched by a file that changed is then rebuilt from ALL cached files,
 * so a day that is spread over many session files keeps its full total even
 * when only one of those files was written to.
 *
 * @param {Object} cache - Cache object from storage
 * @param {Object} [options]
 * @param {boolean} [options.full] - Parse everything and send every day
 * @returns {Object} { records, files, full, filesParsed, filesReused, dayCount }
 */
export function buildSyncPayload(cache, options = {}) {
  const usable = isUsableCache(cache);
  const full = options.full === true || !usable;
  const oldFiles = full ? {} : cache.files;

  const files = {};
  const dirtyDates = new Set();
  const onDisk = new Set();
  let filesParsed = 0;
  let filesReused = 0;

  for (const filePath of findJsonlFiles(CLAUDE_PROJECTS_DIR)) {
    onDisk.add(filePath);

    let mtime;
    try {
      mtime = statSync(filePath).mtimeMs;
    } catch (err) {
      // File went away while we were walking, treat it as gone
      onDisk.delete(filePath);
      continue;
    }

    const cached = oldFiles[filePath];
    if (cached && cached.records && cached.mtime === mtime) {
      // Unchanged since the last sync, never read it again
      files[filePath] = cached;
      filesReused++;
      continue;
    }

    let records;
    try {
      records = parseFileContributions(filePath);
    } catch (err) {
      // Cannot read it right now. Keep the old contribution and the old
      // mtime so we try again on the next sync.
      if (cached && cached.records) {
        files[filePath] = cached;
        filesReused++;
      }
      continue;
    }

    filesParsed++;
    // The days this file used to count towards also have to be rebuilt
    if (cached && cached.records) {
      markDates(cached.records, dirtyDates);
    }
    markDates(records, dirtyDates);
    files[filePath] = { mtime, records };
  }

  // Files that are no longer on disk stop counting, so their days are rebuilt
  for (const [filePath, entry] of Object.entries(oldFiles)) {
    if (!onDisk.has(filePath) && entry && entry.records) {
      markDates(entry.records, dirtyDates);
    }
  }

  // Sum every cached file, not only the ones that changed
  const totals = {};
  for (const entry of Object.values(files)) {
    for (const [key, value] of Object.entries(entry.records)) {
      if (!totals[key]) {
        totals[key] = { input: 0, output: 0 };
      }
      totals[key].input += value.input || 0;
      totals[key].output += value.output || 0;
    }
  }

  const records = [];
  const days = new Set();
  for (const [key, value] of Object.entries(totals)) {
    const { date, model } = splitKey(key);
    if (!full && !dirtyDates.has(date)) {
      continue;
    }
    records.push({ date, model, input: value.input, output: value.output });
    days.add(date);
  }

  return {
    records,
    files,
    full,
    filesParsed,
    filesReused,
    dayCount: days.size,
  };
}

/**
 * Check that a cache can be reused as is
 */
function isUsableCache(cache) {
  return Boolean(
    cache &&
    cache.version === CACHE_VERSION &&
    cache.files &&
    typeof cache.files === 'object'
  );
}

/**
 * Add every date of a contribution map to a set
 */
function markDates(records, dates) {
  for (const key of Object.keys(records)) {
    dates.add(splitKey(key).date);
  }
}

/**
 * Split a "<date>:<model>" key
 */
function splitKey(key) {
  const at = key.indexOf(':');
  return { date: key.slice(0, at), model: key.slice(at + 1) };
}

/**
 * Read one session file and return what it contributes
 * @param {string} filePath - Path to JSONL file
 * @returns {Object} Map of "<date>:<model>" to { input, output }
 */
function parseFileContributions(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const records = {};

  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    try {
      const data = JSON.parse(line);

      // Only assistant messages carry usage
      if (data.type !== 'assistant' || !data.message?.usage) {
        continue;
      }

      if (!data.timestamp) {
        continue;
      }

      const date = data.timestamp.slice(0, 10);
      const usage = data.message.usage;
      const model = normalizeModelName(data.message.model || 'unknown');

      const key = `${date}:${model}`;
      if (!records[key]) {
        records[key] = { input: 0, output: 0 };
      }
      records[key].input += usage.input_tokens || 0;
      records[key].output += usage.output_tokens || 0;
    } catch (err) {
      // Skip malformed lines
    }
  }

  return records;
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
  if (model.includes('fable')) return 'Fable';
  return model;
}
