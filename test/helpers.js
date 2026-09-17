import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLI = join(HERE, '..', 'bin', 'ccgh-stats.js');

/**
 * Make a throwaway home directory
 * @returns {string} Path to the new home
 */
export function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'ccgh-test-'));
  mkdirSync(join(home, '.claude', 'projects'), { recursive: true });
  return home;
}

/**
 * Remove a throwaway home directory
 */
export function dropHome(home) {
  rmSync(home, { recursive: true, force: true });
}

/**
 * Empty the session files without removing the home
 */
export function clearSessions(home) {
  const projects = join(home, '.claude', 'projects');
  rmSync(projects, { recursive: true, force: true });
  mkdirSync(projects, { recursive: true });
}

/**
 * Build one assistant line of a session file
 */
export function assistantLine(date, model, input, output) {
  return JSON.stringify({
    type: 'assistant',
    timestamp: `${date}T10:00:00.000Z`,
    message: { model, usage: { input_tokens: input, output_tokens: output } },
  });
}

/**
 * Write a session file and return its path
 */
export function writeSession(home, project, name, lines) {
  const dir = join(home, '.claude', 'projects', project);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(filePath, lines.join('\n') + '\n');
  return filePath;
}

/**
 * Start a stub of the API.
 *
 * @param {Object} [options]
 * @param {number} [options.status] - Status to answer with
 * @param {Object} [options.body] - Body to answer with
 * @param {Array} [options.answers] - One { status, body } per call, in order.
 *   The last one is reused once the list runs out.
 * @returns {Promise<Object>} { url, requests, close }
 */
export async function startStubApi(options = {}) {
  const answers = options.answers || [
    { status: options.status || 200, body: options.body || { success: true } },
  ];
  const requests = [];

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        parsed = null;
      }
      requests.push({
        url: req.url,
        auth: req.headers.authorization || '',
        body: parsed,
      });
      const answer = answers[Math.min(requests.length - 1, answers.length - 1)];
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

/**
 * Run the CLI in a throwaway home
 * @returns {Promise<Object>} { code, stdout, stderr }
 */
export function runCli(args, options = {}) {
  const env = { ...process.env, HOME: options.home };
  delete env.CCGH_PUBLIC_ID;
  delete env.CCGH_WRITE_TOKEN;
  if (options.apiUrl) {
    env.CCGH_API_URL = options.apiUrl;
  }
  Object.assign(env, options.env || {});

  return new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, ...args], { env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();

    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
