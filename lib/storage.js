import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Storage directory and files
const STORAGE_DIR = join(homedir(), '.claude-stats');
const CONFIG_FILE = join(STORAGE_DIR, 'config.json');
const CACHE_FILE = join(STORAGE_DIR, 'cache.json');

// API URL is hardcoded, not user-configurable
export const API_URL = 'https://claude-github-stats.vercel.app';

// Sync interval: 10 minutes
export const SYNC_INTERVAL = 10 * 60 * 1000;

/**
 * Ensure storage directory exists
 */
function ensureStorageDir() {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// === CONFIG (secrets only: writeToken, publicId) ===

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
 * @param {Object} config - Config object to save (writeToken, publicId)
 */
export function writeConfig(config) {
  ensureStorageDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
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

// === CACHE (lastSyncTime only) ===

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
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
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

// === MIGRATION (from old ~/.claude-stats-state file) ===

const OLD_STATE_FILE = join(homedir(), '.claude-stats-state');

/**
 * Migrate from old single-file format to new folder structure
 * @returns {boolean} True if migration was performed
 */
export function migrateFromOldFormat() {
  if (!existsSync(OLD_STATE_FILE)) {
    return false;
  }

  try {
    const oldState = JSON.parse(readFileSync(OLD_STATE_FILE, 'utf-8'));

    // Extract config (secrets only)
    if (oldState.writeToken && oldState.publicId) {
      writeConfig({
        writeToken: oldState.writeToken,
        publicId: oldState.publicId,
      });
    }

    // Remove old file
    unlinkSync(OLD_STATE_FILE);

    return true;
  } catch (err) {
    return false;
  }
}
