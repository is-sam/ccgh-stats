import { parseModifiedToRecords } from '../parser.js';
import {
  readConfig,
  shouldSync,
  getLastSyncTime,
  getLastSyncDate,
  updateSyncTime,
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
 * Hook sync: Incremental sync (modified files only)
 */
export async function runSync() {
  // Check if sync is needed (10 minute interval)
  if (!shouldSync()) {
    return;
  }

  // Must be registered
  const config = readConfig();
  if (!config || !config.writeToken || !config.publicId) {
    return;
  }

  const startTime = Date.now();

  try {
    logSyncStart();

    const lastSyncTime = getLastSyncTime();
    const lastSyncDate = getLastSyncDate();

    // Parse only modified files, filter by date
    const records = parseModifiedToRecords(lastSyncTime, lastSyncDate);

    if (records.length === 0) {
      log('No new records to sync');
      updateSyncTime();
      logSyncComplete(Date.now() - startTime);
      return;
    }

    log(`Found ${records.length} records to sync`);

    // Send to API
    await syncRecords(API_URL, config.publicId, config.writeToken, records);
    log(`Synced ${records.length} records`);

    updateSyncTime();
    logSyncComplete(Date.now() - startTime);
  } catch (err) {
    logError('Sync failed', err);
  }
}
