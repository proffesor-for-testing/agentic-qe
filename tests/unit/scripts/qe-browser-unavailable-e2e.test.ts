/**
 * qe-browser: end-to-end "vibium unavailable" contract test
 *
 * Spawns each helper script with a stripped PATH that does NOT contain
 * vibium and asserts the documented skipped envelope shape:
 *
 *   - exit code 2
 *   - parsed JSON has status: "skipped"
 *   - parsed JSON has vibiumUnavailable: true
 *   - parsed JSON.output.reason === "browser-engine-unavailable"
 *   - parsed JSON.output.summary mentions vibium
 *
 * This is a regression guard against the F1 contract being silently broken
 * by future changes to lib/vibium.js or any of the per-script wrappers.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { mkdirSync, symlinkSync, existsSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SCRIPTS_DIR = resolve(__dirname, '../../../.claude/skills/qe-browser/scripts');

// Build a fake bin dir that contains node (so the script can run) but
// NOT vibium (so the helper hits the ENOENT path).
const FAKE_BIN = resolve(tmpdir(), `qe-browser-fake-bin-${process.pid}`);

beforeAll(() => {
  mkdirSync(FAKE_BIN, { recursive: true });
  const nodePath = process.execPath; // absolute path to node
  const fakeNode = resolve(FAKE_BIN, 'node');
  if (existsSync(fakeNode)) {
    // Sanity: it points at the right place
    if (readlinkSync(fakeNode) !== nodePath) {
      throw new Error(
        `stale fake node symlink at ${fakeNode}; please remove it and retry`
      );
    }
  } else {
    symlinkSync(nodePath, fakeNode);
  }
});

function runScript(script: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [resolve(SCRIPTS_DIR, script), ...args], {
    encoding: 'utf8',
    env: {
      // Critical: only the fake bin dir on PATH. No vibium anywhere.
      PATH: FAKE_BIN,
      HOME: process.env.HOME || '/tmp',
      // Keep TERM so child process doesn't trip on missing terminfo.
      TERM: 'dumb',
    },
  });
}

function expectSkippedEnvelope(
  result: SpawnSyncReturns<string>,
  operation: string
): void {
  // Exit code 2 == skipped, per F1 contract.
  expect(result.status, `${operation} should exit 2 (skipped); stderr=${result.stderr}`).toBe(
    2
  );
  let parsed: any;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (e) {
    throw new Error(
      `${operation} did not emit valid JSON. stdout=${result.stdout} stderr=${result.stderr}`
    );
  }
  expect(parsed.skillName).toBe('qe-browser');
  expect(parsed.status).toBe('skipped');
  expect(parsed.vibiumUnavailable).toBe(true);
  expect(parsed.output.operation).toBe(operation);
  expect(parsed.output.reason).toBe('browser-engine-unavailable');
  expect(parsed.output.summary).toMatch(/vibium binary not found/);
  expect(Array.isArray(parsed.output.remediation)).toBe(true);
  expect(parsed.output.remediation.join(' ')).toMatch(/npm install -g vibium/);
}

describe('qe-browser F1: end-to-end skipped envelope when vibium missing', () => {
  it('assert.js — emits skipped envelope + exit 2', () => {
    const res = runScript('assert.js', [
      '--checks',
      '[{"kind":"url_contains","text":"foo"}]',
    ]);
    expectSkippedEnvelope(res, 'assert');
  });

  it('batch.js — emits skipped envelope + exit 2', () => {
    const res = runScript('batch.js', [
      '--steps',
      '[{"action":"go","url":"https://example.com"}]',
    ]);
    expectSkippedEnvelope(res, 'batch');
  });

  it('check-injection.js — emits skipped envelope + exit 2', () => {
    const res = runScript('check-injection.js', []);
    expectSkippedEnvelope(res, 'check-injection');
  });

  it('intent-score.js — emits skipped envelope + exit 2', () => {
    const res = runScript('intent-score.js', ['--intent', 'submit_form']);
    expectSkippedEnvelope(res, 'intent-score');
  });

  it('visual-diff.js — emits skipped envelope + exit 2', () => {
    const res = runScript('visual-diff.js', ['--name', 'unavailable-test']);
    expectSkippedEnvelope(res, 'visual-diff');
  });
});
