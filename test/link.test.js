import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  makeHome,
  dropHome,
  assistantLine,
  writeSession,
  startStubApi,
  runCli,
} from './helpers.js';

const CREDS = { CCGH_PUBLIC_ID: 'pub_target', CCGH_WRITE_TOKEN: 'tok_target' };

function configPath(home) {
  return join(home, '.claude-stats', 'config.json');
}

function readStoredConfig(home) {
  return JSON.parse(readFileSync(configPath(home), 'utf-8'));
}

function writeStoredConfig(home, config) {
  mkdirSync(join(home, '.claude-stats'), { recursive: true });
  writeFileSync(configPath(home), JSON.stringify(config, null, 2));
}

test('link refuses a bad token and leaves no config behind, even with records', async t => {
  const home = makeHome();
  const api = await startStubApi({ status: 401, body: { error: 'Invalid token' } });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 1000, 100),
  ]);

  const result = await runCli(['link'], { home, apiUrl: api.url, env: CREDS });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /refused/);
  assert.equal(existsSync(configPath(home)), false);
});

test('link refuses a bad token when the machine has no records at all', async t => {
  const home = makeHome();
  const api = await startStubApi({ status: 401, body: { error: 'Invalid token' } });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  const result = await runCli(['link'], { home, apiUrl: api.url, env: CREDS });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /refused/);
  assert.equal(existsSync(configPath(home)), false);

  // It has to ask the API rather than call an empty sync a success
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].auth, 'Bearer tok_target');
  assert.deepEqual(api.requests[0].body.records, []);
});

test('a failed link leaves a working config exactly as it was', async t => {
  const home = makeHome();
  const api = await startStubApi({ status: 404, body: { error: 'User not found' } });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  const original = {
    writeToken: 'tok_original',
    publicId: 'pub_original',
    deviceId: 'dev_original',
  };
  writeStoredConfig(home, original);

  const result = await runCli(['link', '--force'], { home, apiUrl: api.url, env: CREDS });

  assert.equal(result.code, 1);
  assert.deepEqual(readStoredConfig(home), original);
});

test('a link that passes the check but fails to sync puts the old config back', async t => {
  const home = makeHome();
  // The check goes through, the sync that follows does not
  const api = await startStubApi({
    answers: [
      { status: 200, body: { success: true } },
      { status: 500, body: { error: 'server on fire' } },
    ],
  });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  const original = {
    writeToken: 'tok_original',
    publicId: 'pub_original',
    deviceId: 'dev_original',
  };
  writeStoredConfig(home, original);
  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 1000, 100),
  ]);

  const result = await runCli(['link', '--force'], { home, apiUrl: api.url, env: CREDS });

  assert.equal(result.code, 1);
  assert.equal(api.requests.length, 2);
  assert.deepEqual(readStoredConfig(home), original);
});

test('link joins an account and gives the machine its own device id', async t => {
  const home = makeHome();
  const api = await startStubApi();
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 1000, 100),
  ]);

  const result = await runCli(['link'], { home, apiUrl: api.url, env: CREDS });

  assert.equal(result.code, 0);
  const config = readStoredConfig(home);
  assert.equal(config.publicId, 'pub_target');
  assert.equal(config.writeToken, 'tok_target');
  assert.match(config.deviceId, /^dev_[0-9a-f]{16}$/);

  const sent = api.requests[api.requests.length - 1];
  assert.equal(sent.body.publicId, 'pub_target');
  assert.equal(sent.body.records[0].device, config.deviceId);
});

test('link stops when the machine already has a config', async t => {
  const home = makeHome();
  t.after(() => dropHome(home));

  const original = { writeToken: 'tok_a', publicId: 'pub_a', deviceId: 'dev_a' };
  writeStoredConfig(home, original);

  const result = await runCli(['link'], { home, env: CREDS });

  assert.equal(result.code, 1);
  assert.match(result.stdout, /already set up/);
  assert.deepEqual(readStoredConfig(home), original);
});
