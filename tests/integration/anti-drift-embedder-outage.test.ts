/** #1078: the configured HTTP embedder may disappear after its initial probe. */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('anti-drift with a real failing HTTP embedder', () => {
  it('delivers events during emit/receive outages and resumes checks after recovery', () => {
    const source = resolve('.');
    const root = mkdtempSync(join(tmpdir(), 'aqe-outage-'));
    mkdirSync(join(root, '.git'));
    try {
      const result = spawnSync(process.execPath, ['--import', join(source, 'node_modules/tsx/dist/loader.mjs'),
        join(source, 'tests/fixtures/anti-drift-embedder-outage.mjs')], {
        cwd: root, encoding: 'utf8', timeout: 30000,
        env: { PATH: process.env.PATH, HOME: root, AQE_SOURCE_ROOT: source, AQE_PROJECT_ROOT: root,
          AQE_MEMORY_PATH: ':memory:', AQE_MEMORY_BACKEND: 'memory', AQE_LLM_ROUTER_DISABLED: 'true' },
      });
      expect(result.status, result.stderr).toBe(0);
      const line = result.stdout.split('\n').find(value => value.startsWith('OUTAGE_RECEIPT '));
      expect(line, result.stdout).toBeDefined();
      const receipt = JSON.parse(line!.slice('OUTAGE_RECEIPT '.length));
      expect(receipt.errors).toEqual([]);
      expect(receipt.delivered).toEqual(['healthy-before-outage', 'emit-during-outage', 'healthy-after-recovery']);
      expect(receipt.receiveDelivered).toBe(true);
      expect(receipt.requests.failed).toBe(2); // actual 503 responses, not mocked methods
      expect(receipt.requests.succeeded).toBeGreaterThan(2);
      expect(receipt.healthyStats).toMatchObject({ totalChecked: 1, driftCount: 0, unverifiedCount: 0 });
      // The outage adds no checks; each failed request counts once as unverified.
      expect(receipt.outageStats).toEqual({ ...receipt.healthyStats, unverifiedCount: receipt.requests.failed });
      expect(receipt.recoveryStats).toMatchObject({ totalChecked: 2, driftCount: 0, unverifiedCount: 2 });
      expect(result.stderr).toContain('event delivered without verification');
      expect(result.stderr).not.toContain('SECRET-PROVIDER-ERROR');
      expect(result.stderr).not.toContain('A unique meaningful test completion');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 40000);
});
