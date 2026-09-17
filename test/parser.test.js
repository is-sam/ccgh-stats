import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync, utimesSync } from 'fs';
import {
  makeHome,
  dropHome,
  clearSessions,
  assistantLine,
  writeSession,
} from './helpers.js';

// The parser reads the projects directory of the current home, and it picks
// that up when it is imported, so the home has to be set first.
const HOME = makeHome();
process.env.HOME = HOME;
const { buildSyncPayload, CACHE_VERSION } = await import('../lib/parser.js');

after(() => dropHome(HOME));

function freshCache(files) {
  return { version: CACHE_VERSION, lastSyncTime: Date.now(), files };
}

function find(records, date, model) {
  return records.find(r => r.date === date && r.model === model);
}

test('a day split over two projects keeps its full total when one changes', () => {
  clearSessions(HOME);
  const a = writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 1000, 100),
  ]);
  const b = writeSession(HOME, 'projB', 'b.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 2000, 200),
  ]);
  utimesSync(a, 1000, 1000);
  utimesSync(b, 1000, 1000);

  const first = buildSyncPayload({}, {});
  assert.equal(first.full, true);
  assert.deepEqual(find(first.records, '2026-09-10', 'Opus'), {
    date: '2026-09-10',
    model: 'Opus',
    input: 3000,
    output: 300,
  });

  // Only project B is written to. Project A still has to count.
  writeSession(HOME, 'projB', 'b.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 2000, 200),
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 500, 50),
  ]);
  utimesSync(b, 2000, 2000);

  const second = buildSyncPayload(freshCache(first.files), {});
  assert.equal(second.filesParsed, 1);
  assert.equal(second.filesReused, 1);
  assert.deepEqual(find(second.records, '2026-09-10', 'Opus'), {
    date: '2026-09-10',
    model: 'Opus',
    input: 3500,
    output: 350,
  });
});

test('a day that did not change is not sent again', () => {
  clearSessions(HOME);
  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-10', 'claude-opus-4-1-20250805', 1000, 100),
  ]);

  const first = buildSyncPayload({}, {});
  const second = buildSyncPayload(freshCache(first.files), {});

  assert.equal(second.records.length, 0);
  assert.equal(second.filesParsed, 0);
  assert.equal(second.filesReused, 1);
});

test('a full rebuild zeroes the row an older version left under the raw model id', () => {
  clearSessions(HOME);
  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
    assistantLine('2026-09-12', 'claude-opus-4-1-20250805', 10, 1),
  ]);

  const payload = buildSyncPayload({}, {});
  assert.equal(payload.full, true);

  // The day goes out under the name we use now
  assert.deepEqual(find(payload.records, '2026-09-12', 'Fable'), {
    date: '2026-09-12',
    model: 'Fable',
    input: 900,
    output: 90,
  });

  // And the row version 0.1.0 wrote under the raw id is emptied
  assert.deepEqual(find(payload.records, '2026-09-12', 'claude-fable-5-1'), {
    date: '2026-09-12',
    model: 'claude-fable-5-1',
    input: 0,
    output: 0,
  });

  // Opus always had a friendly name, so it needs no tombstone
  assert.equal(find(payload.records, '2026-09-12', 'claude-opus-4-1-20250805'), undefined);
});

test('an incremental sync sends no tombstones', () => {
  clearSessions(HOME);
  const a = writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
  ]);
  utimesSync(a, 1000, 1000);

  const first = buildSyncPayload({}, {});
  assert.ok(find(first.records, '2026-09-12', 'claude-fable-5-1'));

  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
    assistantLine('2026-09-12', 'claude-fable-5-1', 100, 10),
  ]);
  utimesSync(a, 2000, 2000);

  const second = buildSyncPayload(freshCache(first.files), {});
  assert.deepEqual(find(second.records, '2026-09-12', 'Fable'), {
    date: '2026-09-12',
    model: 'Fable',
    input: 1000,
    output: 100,
  });
  assert.equal(find(second.records, '2026-09-12', 'claude-fable-5-1'), undefined);
});

test('a full rebuild keeps the cached counts of a file it cannot read', t => {
  clearSessions(HOME);
  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-13', 'claude-opus-4-1-20250805', 1000, 100),
  ]);
  const b = writeSession(HOME, 'projB', 'b.jsonl', [
    assistantLine('2026-09-13', 'claude-opus-4-1-20250805', 2000, 200),
  ]);

  const first = buildSyncPayload({}, {});
  assert.equal(find(first.records, '2026-09-13', 'Opus').input, 3000);

  chmodSync(b, 0o000);
  let readable = true;
  try {
    readFileSync(b, 'utf-8');
  } catch (err) {
    readable = false;
  }
  if (readable) {
    chmodSync(b, 0o644);
    t.skip('this user can read a file with no permissions');
    return;
  }

  try {
    const second = buildSyncPayload(freshCache(first.files), { full: true });

    // The unreadable file still counts, so the day is not sent too low
    assert.deepEqual(find(second.records, '2026-09-13', 'Opus'), {
      date: '2026-09-13',
      model: 'Opus',
      input: 3000,
      output: 300,
    });

    // And its counts stay in the cache for the next run
    assert.deepEqual(second.files[b], first.files[b]);
  } finally {
    chmodSync(b, 0o644);
  }
});

test('a cache from an older version rebuilds everything', () => {
  clearSessions(HOME);
  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-14', 'claude-sonnet-4-5-20250929', 5, 5),
  ]);

  const payload = buildSyncPayload({ lastSyncTime: 123 }, {});
  assert.equal(payload.full, true);
  assert.equal(payload.records.length, 1);
});

test('a file that is gone stops counting', () => {
  clearSessions(HOME);
  const a = writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-15', 'claude-opus-4-1-20250805', 1000, 100),
  ]);
  writeSession(HOME, 'projB', 'b.jsonl', [
    assistantLine('2026-09-15', 'claude-opus-4-1-20250805', 2000, 200),
  ]);

  const first = buildSyncPayload({}, {});
  assert.equal(find(first.records, '2026-09-15', 'Opus').input, 3000);

  rmSync(a);

  const second = buildSyncPayload(freshCache(first.files), {});
  assert.deepEqual(find(second.records, '2026-09-15', 'Opus'), {
    date: '2026-09-15',
    model: 'Opus',
    input: 2000,
    output: 200,
  });
  assert.equal(second.files[a], undefined);
});

test('a brand new account gets no tombstones', () => {
  clearSessions(HOME);
  writeSession(HOME, 'projA', 'a.jsonl', [
    assistantLine('2026-09-12', 'claude-fable-5-1', 900, 90),
  ]);

  const payload = buildSyncPayload({}, { tombstones: false });

  assert.ok(find(payload.records, '2026-09-12', 'Fable'));
  assert.equal(find(payload.records, '2026-09-12', 'claude-fable-5-1'), undefined);
});
