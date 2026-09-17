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

function setupHome(config) {
  const home = makeHome();
  mkdirSync(join(home, '.claude-stats'), { recursive: true });
  writeFileSync(
    join(home, '.claude-stats', 'config.json'),
    JSON.stringify(config, null, 2)
  );
  return home;
}

function readStoredConfig(home) {
  return JSON.parse(readFileSync(join(home, '.claude-stats', 'config.json'), 'utf-8'));
}

function cachePath(home) {
  return join(home, '.claude-stats', 'cache.json');
}

test('every record carries the device, tombstones included', async t => {
  const home = setupHome({
    writeToken: 'tok_a',
    publicId: 'pub_a',
    deviceId: 'dev_laptop',
  });
  const api = await startStubApi();
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
  ]);

  const result = await runCli(['sync', '--full'], { home, apiUrl: api.url });
  assert.equal(result.code, 0);

  const sent = api.requests[0].body.records;
  const real = sent.find(r => r.model === 'Fable');
  const tombstone = sent.find(r => r.model === 'claude-fable-5-1');

  assert.deepEqual(real, {
    date: '2026-09-12',
    model: 'Fable',
    input: 900,
    output: 90,
    device: 'dev_laptop',
  });
  assert.deepEqual(tombstone, {
    date: '2026-09-12',
    model: 'claude-fable-5-1',
    input: 0,
    output: 0,
    device: 'dev_laptop',
  });
});

test('a config with no device id is read as the default device', async t => {
  const home = setupHome({ writeToken: 'tok_a', publicId: 'pub_a' });
  const api = await startStubApi();
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-opus-4-1-20250805', 10, 1),
  ]);

  const result = await runCli(['sync'], { home, apiUrl: api.url });
  assert.equal(result.code, 0);

  assert.equal(readStoredConfig(home).deviceId, 'default');
  assert.equal(api.requests[0].body.records[0].device, 'default');
});

test('a sync that fails leaves the cache alone so the next one retries', async t => {
  const home = setupHome({
    writeToken: 'tok_a',
    publicId: 'pub_a',
    deviceId: 'dev_laptop',
  });
  const api = await startStubApi({ status: 500, body: { error: 'nope' } });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-opus-4-1-20250805', 10, 1),
  ]);

  const result = await runCli(['sync'], { home, apiUrl: api.url });

  assert.equal(result.code, 1);
  assert.equal(existsSync(cachePath(home)), false);
});

test('the hook keeps the ten minute interval', async t => {
  const home = setupHome({
    writeToken: 'tok_a',
    publicId: 'pub_a',
    deviceId: 'dev_laptop',
  });
  const api = await startStubApi();
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-opus-4-1-20250805', 10, 1),
  ]);

  await runCli(['sync'], { home, apiUrl: api.url });
  assert.equal(api.requests.length, 1);

  // Straight after a sync the hook has to do nothing at all
  await runCli(['--sync'], { home, apiUrl: api.url });
  assert.equal(api.requests.length, 1);
});

test('status shows the device id', async t => {
  const home = setupHome({
    writeToken: 'tok_a',
    publicId: 'pub_a',
    deviceId: 'dev_laptop',
  });
  t.after(() => dropHome(home));

  const result = await runCli(['status'], { home });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Device ID: dev_laptop/);
});

test('setup does not send tombstones for an account it just created', async t => {
  const home = makeHome();
  const api = await startStubApi({
    answers: [
      { status: 200, body: { publicId: 'pub_new', writeToken: 'tok_new', widgetUrl: 'http://x/w.svg' } },
      { status: 200, body: { success: true } },
    ],
  });
  t.after(async () => {
    await api.close();
    dropHome(home);
  });

  writeSession(home, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
  ]);

  const result = await runCli(['setup'], { home, apiUrl: api.url });
  assert.equal(result.code, 0);

  const sent = api.requests[1].body.records;
  assert.ok(sent.find(r => r.model === 'Fable'));
  assert.equal(sent.find(r => r.model === 'claude-fable-5-1'), undefined);
  assert.match(readStoredConfig(home).deviceId, /^dev_[0-9a-f]{16}$/);
});
