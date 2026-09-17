#!/usr/bin/env node

import { runSetup } from '../lib/commands/setup.js';
import { runStatus } from '../lib/commands/status.js';
import { runLink } from '../lib/commands/link.js';
import { runSync } from '../lib/commands/sync.js';
import { logError } from '../lib/logger.js';

const args = process.argv.slice(2);
const command = args[0];
const isHookSync = args.includes('--sync');
const isFull = args.includes('--full');

async function main() {
  if (command === 'setup') {
    await runSetup();
  } else if (command === 'status') {
    await runStatus();
  } else if (command === 'link') {
    await runLink({ force: args.includes('--force') });
  } else if (command === 'sync') {
    const ok = await runSync({ full: isFull, force: true, verbose: true });
    if (!ok) {
      process.exitCode = 1;
    }
  } else if (isHookSync) {
    // Hook path: keep the 10 minute interval and stay quiet
    await runSync({ full: isFull });
  } else {
    printUsage();
  }
}

function printUsage() {
  console.log('ccgh-stats - Track your Claude Code usage on GitHub\n');
  console.log('Usage:');
  console.log('  ccgh-stats setup        Register and do initial sync');
  console.log('  ccgh-stats link         Add this machine to an account you already have');
  console.log('  ccgh-stats status       Show registration status');
  console.log('  ccgh-stats sync         Sync now');
  console.log('  ccgh-stats sync --full  Read every session file again and resend everything');
  console.log('  ccgh-stats --sync       Incremental sync (used by hook)');
}

main().catch(err => {
  if (isHookSync) {
    logError('Uncaught error', err);
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});
