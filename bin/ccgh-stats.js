#!/usr/bin/env node

import { runSetup } from '../lib/commands/setup.js';
import { runStatus } from '../lib/commands/status.js';
import { runSync } from '../lib/commands/sync.js';
import { logError } from '../lib/logger.js';

const args = process.argv.slice(2);
const command = args[0];
const isSyncMode = args.includes('--sync');

async function main() {
  if (command === 'setup') {
    await runSetup();
  } else if (command === 'status') {
    await runStatus();
  } else if (isSyncMode) {
    await runSync();
  } else {
    printUsage();
  }
}

function printUsage() {
  console.log('ccgh-stats - Track your Claude Code usage on GitHub\n');
  console.log('Usage:');
  console.log('  ccgh-stats setup    Register and do initial sync');
  console.log('  ccgh-stats status   Show registration status');
  console.log('  ccgh-stats --sync   Incremental sync (used by hook)');
}

main().catch(err => {
  if (isSyncMode) {
    logError('Uncaught error', err);
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});
