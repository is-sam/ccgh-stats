import {
  readConfig,
  writeConfig,
  isRegistered,
  getWidgetUrl,
  newDeviceId,
  API_URL,
} from '../storage.js';
import { register } from '../api.js';
import { runSync } from './sync.js';

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
    console.log('To add this machine to an account you already have, run "ccgh-stats link".');
    return;
  }

  console.log(`Registering with ${API_URL}...`);

  try {
    // Register
    const result = await register(API_URL);

    // Save config locally (secrets and the id of this machine)
    writeConfig({
      writeToken: result.writeToken,
      publicId: result.publicId,
      deviceId: newDeviceId(),
    });

    console.log('Registered successfully!\n');

    // Do the first sync, which reads every session file and fills the cache
    console.log('Parsing all sessions for initial sync...');
    const ok = await runSync({ full: true, force: true, verbose: true });
    if (!ok) {
      throw new Error('Initial sync failed');
    }

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
