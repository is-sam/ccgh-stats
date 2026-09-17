import { createInterface } from 'readline';
import {
  readConfig,
  writeConfig,
  configExists,
  getWidgetUrl,
  newDeviceId,
} from '../storage.js';
import { runSync } from './sync.js';

/**
 * Link: point this machine at an account that already exists.
 *
 * Reads the public id and the write token from CCGH_PUBLIC_ID and
 * CCGH_WRITE_TOKEN, or asks for them on stdin with the token hidden so the
 * secret never lands in the shell history. The machine gets its own device
 * id, so its numbers sit next to the ones from your other machines instead
 * of replacing them.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force] - Overwrite an existing config
 */
export async function runLink(options = {}) {
  console.log('ccgh-stats Link\n');

  if (configExists() && !options.force) {
    const config = readConfig();
    console.log('This machine is already set up.');
    if (config && config.publicId) {
      console.log(`Public ID: ${config.publicId}`);
    }
    console.log('\nRun "ccgh-stats link --force" to point it at another account.');
    process.exitCode = 1;
    return;
  }

  let publicId = (process.env.CCGH_PUBLIC_ID || '').trim();
  let writeToken = (process.env.CCGH_WRITE_TOKEN || '').trim();

  if (!publicId || !writeToken) {
    const prompt = openPrompt();
    try {
      if (!publicId) {
        publicId = await prompt.ask('Public ID: ');
      }
      if (!writeToken) {
        writeToken = await prompt.ask('Write token: ', true);
      }
    } catch (err) {
      console.error('Could not read input:', err.message);
      process.exitCode = 1;
      return;
    } finally {
      prompt.close();
    }
  }

  if (!publicId || !writeToken) {
    console.error('\nBoth a public ID and a write token are needed.');
    console.error('You can also set CCGH_PUBLIC_ID and CCGH_WRITE_TOKEN.');
    process.exitCode = 1;
    return;
  }

  const deviceId = newDeviceId();
  writeConfig({ writeToken, publicId, deviceId });

  console.log(`\nLinked to ${publicId} as device ${deviceId}.\n`);

  const ok = await runSync({ full: true, force: true, verbose: true });
  if (!ok) {
    console.error('\nThe first sync did not go through. Check the public ID and the token.');
    process.exitCode = 1;
    return;
  }

  console.log(`\nWidget URL: ${getWidgetUrl()}`);
}

/**
 * Open a prompt on stdin.
 *
 * On a terminal one readline interface is shared by every question and the
 * hidden ones are not echoed. When stdin is a pipe or a file there is no
 * readline at all, the whole input is read once and handed out line by line,
 * because a second readline would find the stream already drained.
 *
 * @returns {Object} { ask, close }
 */
function openPrompt() {
  const isTty = process.stdin.isTTY === true;

  if (!isTty) {
    let lines = null;

    return {
      async ask(question) {
        if (lines === null) {
          lines = (await readAllStdin()).split('\n');
        }
        process.stdout.write(question);
        if (lines.length === 0) {
          throw new Error('no input');
        }
        const answer = lines.shift().trim();
        process.stdout.write('\n');
        return answer;
      },
      close() {},
    };
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let muted = false;
  rl._writeToOutput = function writeToOutput(text) {
    if (!muted) {
      rl.output.write(text);
    }
  };

  /**
   * Ask a question
   * @param {string} question - Prompt to show
   * @param {boolean} [hidden] - Do not echo what is typed
   * @returns {Promise<string>}
   */
  function ask(question, hidden = false) {
    return new Promise((resolve, reject) => {
      let answered = false;

      const onClose = () => {
        if (!answered) {
          reject(new Error('no input'));
        }
      };

      rl.once('close', onClose);
      rl.question(question, answer => {
        answered = true;
        rl.removeListener('close', onClose);
        if (muted) {
          muted = false;
          rl.output.write('\n');
        }
        resolve(answer.trim());
      });

      // Set after the question so the prompt itself is still printed
      muted = hidden;
    });
  }

  return { ask, close: () => rl.close() };
}

/**
 * Read everything waiting on stdin
 * @returns {Promise<string>}
 */
async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
