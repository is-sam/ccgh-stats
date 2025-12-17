import {
  readConfig,
  getWidgetUrl,
  getLastSyncDate,
  API_URL,
} from '../storage.js';

/**
 * Status: Show registration info
 */
export async function runStatus() {
  console.log('ccgh-stats Status\n');

  const config = readConfig();
  if (config && config.publicId) {
    console.log('Registration: Registered');
    console.log(`Public ID: ${config.publicId}`);
    console.log(`API URL: ${API_URL}`);
    console.log(`Widget: ${getWidgetUrl()}`);
    console.log(`Last sync: ${getLastSyncDate() || 'Never'}`);
  } else {
    console.log('Registration: Not registered');
    console.log('Run "ccgh-stats setup" to register.');
  }
}
