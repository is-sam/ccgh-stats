import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { CACHE_VERSION } from './parser.js';

// Storage directory and files
const STORAGE_DIR = join(homedir(), '.claude-stats');
const CONFIG_FILE = join(STORAGE_DIR, 'config.json');
const CACHE_FILE = join(STORAGE_DIR, 'cache.json');

// API URL is fixed. CCGH_API_URL is only there so the tests can point at a
// local stub server, it is not meant as a setting.
export const API_URL = process.env.CCGH_API_URL || 'https://ccgh-stats.vercel.app';

// Sync interval: 10 minutes
export const SYNC_INTERVAL = 10 * 60 * 1000;

// Device name used for rows that were stored before device support existed.
// The backend reads a row with no device field as this name.
export const LEGACY_DEVICE_ID = 'default';

/**
 * Ensure storage directory exists
 */
function ensureStorageDir() {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// === CONFIG (secrets and device id: writeToken, publicId, deviceId) ===

/**
 * Read config from ~/.claude-stats/config.json
 * @returns {Object|null} Config object or null if not found
 */
export function readConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Write config to ~/.claude-stats/config.json
 * @param {Object} config - Config object to save (writeToken, publicId, deviceId)
 */
export function writeConfig(config) {
  ensureStorageDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Check if a config file already exists
 * @returns {boolean}
 */
export function configExists() {
  return existsSync(CONFIG_FILE);
}

/**
 * Delete the config file
 */
export function removeConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }
  } catch (err) {
    // Nothing to undo if it cannot be removed
  }
}

/**
 * Check if user is registered (has valid config)
 * @returns {boolean}
 */
export function isRegistered() {
  const config = readConfig();
  return config && config.writeToken && config.publicId;
}

/**
 * Build a fresh random device id
 * @returns {string}
 */
export function newDeviceId() {
  return 'dev_' + randomBytes(8).toString('hex');
}

/**
 * Get the device id for this machine, adding one to the config if it is missing.
 *
 * A config written before device support gets the name 'default', never a
 * random id. Rows this machine already sent carry no device field and the
 * backend reads them as 'default', so a random id here would split the
 * history of this machine in two and could count some days twice.
 *
 * @returns {string|null} Device id, or null if there is no config
 */
export function getDeviceId() {
  const config = readConfig();
  if (!config) {
    return null;
  }
  if (config.deviceId) {
    return config.deviceId;
  }

  config.deviceId = LEGACY_DEVICE_ID;
  writeConfig(config);
  return config.deviceId;
}

/**
 * Get widget URL
 * @returns {string|null}
 */
export function getWidgetUrl() {
  const config = readConfig();
  if (!config || !config.publicId) {
    return null;
  }
  return `${API_URL}/api/w/${config.publicId}.svg`;
}

// === CACHE (sync time and per file token counts) ===

/**
 * Read cache from ~/.claude-stats/cache.json
 * @returns {Object} Cache object (empty object if not found)
 */
export function readCache() {
  try {
    if (!existsSync(CACHE_FILE)) {
      return {};
    }
    const content = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    return {};
  }
}

/**
 * Write cache to ~/.claude-stats/cache.json
 * @param {Object} cache - Cache object to save
 */
export function writeCache(cache) {
  ensureStorageDir();
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

/**
 * Save the per file contributions and stamp the sync time
 * @param {Object} files - Map of file path to { mtime, records }
 */
export function saveCache(files) {
  writeCache({
    version: CACHE_VERSION,
    lastSyncTime: Date.now(),
    files,
  });
}

/**
 * Check if sync is needed (based on lastSyncTime)
 * @returns {boolean}
 */
export function shouldSync() {
  const cache = readCache();
  if (!cache.lastSyncTime) {
    return true;
  }
  return (Date.now() - cache.lastSyncTime) >= SYNC_INTERVAL;
}

/**
 * Get lastSyncTime from cache
 * @returns {number} Timestamp in ms, or 0 if never synced
 */
export function getLastSyncTime() {
  const cache = readCache();
  return cache.lastSyncTime || 0;
}

/**
 * Derive lastSyncDate from lastSyncTime
 * @returns {string|null} Date string YYYY-MM-DD or null if never synced
 */
export function getLastSyncDate() {
  const lastSyncTime = getLastSyncTime();
  if (!lastSyncTime) {
    return null;
  }
  return new Date(lastSyncTime).toISOString().slice(0, 10);
}

/**
 * Update lastSyncTime in cache
 */
export function updateSyncTime() {
  const cache = readCache();
  cache.lastSyncTime = Date.now();
  writeCache(cache);
}
