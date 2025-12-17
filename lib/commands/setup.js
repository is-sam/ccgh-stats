import { parseAllToRecords } from '../parser.js';
import {
  readConfig,
  writeConfig,
  isRegistered,
  getWidgetUrl,
  updateSyncTime,
  API_URL,
} from '../storage.js';
import { register, syncRecords } from '../api.js';

/**
 * Setup: Register with API and do initial full sync
 */
export async function runSetup() {
  console.log('ccgh-stats Setup\n');

  // Check if already registered
  if (isRegistered()) {
    const config = readConfig();
    console.log('Already registered!');
    console.log(`Public ID: ${config.publicId}`);
    console.log(`Widget URL: ${getWidgetUrl()}`);
    console.log('\nTo re-register, delete ~/.claude-stats/ and run setup again.');
    return;
  }

  console.log(`Registering with ${API_URL}...`);

  try {
    // Register
    const result = await register(API_URL);

    // Save config locally (secrets only)
    writeConfig({
      writeToken: result.writeToken,
      publicId: result.publicId,
    });

    console.log('Registered successfully!\n');

    // Do initial full sync
    console.log('Parsing all sessions for initial sync...');
    const records = parseAllToRecords();
    console.log(`Found ${records.length} records\n`);

    console.log('Uploading to API...');
    await syncRecords(API_URL, result.publicId, result.writeToken, records);
    updateSyncTime();

    console.log('\nSetup complete!\n');
    console.log(`Public ID: ${result.publicId}`);
    console.log(`Widget URL: ${result.widgetUrl}`);
    console.log('\nAdd this to your GitHub README:');
    console.log(`  ![Claude Stats](${result.widgetUrl})`);
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
}
