import { buildSyncPayload } from '../parser.js';
import {
  readConfig,
  readCache,
  saveCache,
  shouldSync,
  getDeviceId,
  API_URL,
} from '../storage.js';
import { syncRecords } from '../api.js';
import {
  log,
  logError,
  logSyncStart,
  logSyncComplete,
} from '../logger.js';

/**
 * Sync token counts to the API.
 *
 * Files that did not change since the last sync are never read again, their
 * counts come from the cache. Every day touched by a file that did change is
 * rebuilt from all cached files and sent in full.
 *
 * @param {Object} [options]
 * @param {boolean} [options.full] - Parse every file again and send every day
 * @param {boolean} [options.force] - Ignore the 10 minute interval
 * @param {boolean} [options.verbose] - Print progress to the console
 * @returns {Promise<boolean>} True when the data on the server is up to date
 */
export async function runSync(options = {}) {
  const { full = false, force = false, verbose = false } = options;

  // Check if sync is needed (10 minute interval)
  if (!force && !shouldSync()) {
    return true;
  }

  // Must be registered
  const config = readConfig();
  if (!config || !config.writeToken || !config.publicId) {
    if (verbose) {
      console.error('Not registered. Run "ccgh-stats setup" first.');
    }
    return false;
  }

  const deviceId = getDeviceId();
  const startTime = Date.now();

  try {
    logSyncStart();
    if (verbose) {
      console.log(full ? 'Full sync...' : 'Syncing...');
    }

    const payload = buildSyncPayload(readCache(), { full });
    const records = payload.records.map(record => ({ ...record, device: deviceId }));

    log(
      `Read ${payload.filesParsed} changed files, reused ${payload.filesReused} cached files` +
      (payload.full ? ' (full rebuild)' : '')
    );

    if (records.length === 0) {
      log('No new records to sync');
      saveCache(payload.files);
      logSyncComplete(Date.now() - startTime);
      if (verbose) {
        console.log('Nothing changed.');
      }
      return true;
    }

    log(`Sending ${records.length} records across ${payload.dayCount} days`);

    // Send to API. The cache is only saved once this succeeds, so a failed
    // sync is retried with the same files still marked as changed.
    await syncRecords(API_URL, config.publicId, config.writeToken, records);
    saveCache(payload.files);

    log(`Synced ${records.length} records`);
    logSyncComplete(Date.now() - startTime);

    if (verbose) {
      console.log(`Synced ${records.length} records across ${payload.dayCount} days.`);
      console.log(`Device: ${deviceId}`);
    }

    return true;
  } catch (err) {
    logError('Sync failed', err);
    if (verbose) {
      console.error('Sync failed:', err.message);
    }
    return false;
  }
}
