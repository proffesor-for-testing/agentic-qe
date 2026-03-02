/**
 * Tests for run-history.ts — run persistence + recurring failure analysis.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { unlinkSync, existsSync } from 'fs';

describe('RunHistory', () => {
  let db: import('better-sqlite3').Database;
  const testDbPath = resolve(__dirname, 'test-run-history.db');

  beforeEach(async () => {
    // Clean up any previous test DB
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');

    const Database = (await import('better-sqlite3')).default;
    db = new Database(testDbPath);
  });

  afterEach(() => {
    db?.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
    if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
  });

  it('initRunHistory creates tables and returns store', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);
    expect(store).toBeDefined();
    expect(typeof store.persistRun).toBe('function');
    expect(typeof store.persistRunConfig).toBe('function');
    expect(typeof store.analyzeRecurringFailures).toBe('function');
    expect(typeof store.getLastSuccessfulConfig).toBe('function');
    expect(typeof store.getRunCount).toBe('function');
  });

  it('persistRun stores and getRunCount returns correct count', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    const fakeResult = {
      stages: [],
      passed: 5,
      failed: 1,
      skipped: 0,
      totalChecks: 30,
      totalDurationMs: 12000,
      overallSuccess: false,
    };

    store.persistRun('run-1', 'APT001', fakeResult, '--order APT001');
    expect(store.getRunCount()).toBe(1);

    store.persistRun('run-2', 'APT002', { ...fakeResult, overallSuccess: true }, '');
    expect(store.getRunCount()).toBe(2);
  });

  it('persistRunConfig stores config and getLastSuccessfulConfig retrieves it', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    const fakeResult = {
      stages: [], passed: 5, failed: 0, skipped: 0,
      totalChecks: 30, totalDurationMs: 12000, overallSuccess: true,
    };
    store.persistRun('run-1', 'APT001', fakeResult, '');

    store.persistRunConfig('run-1', {
      nodeVersion: 'v20.0.0',
      envVarsPresent: ['ADIDAS_OMNI_HOST', 'ADIDAS_XAPI_URL'],
      cliArgs: '--order APT001',
      xapiEnabled: true,
      layersUsed: 'L1+L2',
      success: true,
    });

    const lastGood = store.getLastSuccessfulConfig();
    expect(lastGood).not.toBeNull();
    expect(lastGood!.nodeVersion).toBe('v20.0.0');
    expect(lastGood!.envVarsPresent).toEqual(['ADIDAS_OMNI_HOST', 'ADIDAS_XAPI_URL']);
    expect(lastGood!.xapiEnabled).toBe(true);
  });

  it('getLastSuccessfulConfig returns null when no successful runs', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    store.persistRunConfig('run-fail', {
      nodeVersion: 'v20.0.0', envVarsPresent: [], cliArgs: '',
      xapiEnabled: false, layersUsed: 'L1', success: false,
    });

    expect(store.getLastSuccessfulConfig()).toBeNull();
  });

  it('analyzeRecurringFailures detects checks failing >50% of runs', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    // Create 3 runs: check "ShipTo FirstName present" fails in 2/3 (67%)
    // Check "Has order lines" fails in 1/3 (33%) — should NOT appear
    const makeResult = (failChecks: string[]) => ({
      stages: [{
        stageId: 'create-order', stageName: 'Create Order',
        action: { success: true, durationMs: 100, data: {} },
        poll: { success: true, durationMs: 0, data: {} },
        verification: {
          steps: [{
            stepId: 'step-1',
            result: {
              success: failChecks.length === 0,
              durationMs: 10,
              checks: [
                { name: 'ShipTo FirstName present', passed: !failChecks.includes('ShipTo FirstName present'), expected: 'present', actual: failChecks.includes('ShipTo FirstName present') ? 'missing' : 'present' },
                { name: 'Has order lines', passed: !failChecks.includes('Has order lines'), expected: 'present', actual: failChecks.includes('Has order lines') ? 'missing' : 'present' },
              ],
            },
          }],
          passed: failChecks.length === 0 ? 2 : 2 - failChecks.length,
          failed: failChecks.length,
          skipped: 0,
        },
        overallSuccess: failChecks.length === 0,
        durationMs: 110,
      }],
      passed: failChecks.length === 0 ? 1 : 0,
      failed: failChecks.length > 0 ? 1 : 0,
      skipped: 0,
      totalChecks: 2,
      totalDurationMs: 110,
      overallSuccess: failChecks.length === 0,
    });

    store.persistRun('run-1', 'APT001', makeResult(['ShipTo FirstName present']), '');
    store.persistRun('run-2', 'APT002', makeResult(['ShipTo FirstName present', 'Has order lines']), '');
    store.persistRun('run-3', 'APT003', makeResult([]), '');

    const recurring = store.analyzeRecurringFailures();

    // "ShipTo FirstName present" fails in 2/3 = 67% (>50%) → recurring
    const firstName = recurring.find(r => r.checkName === 'ShipTo FirstName present');
    expect(firstName).toBeDefined();
    expect(firstName!.failRate).toBeCloseTo(0.667, 1);
    expect(firstName!.sterlingField).toBe('PersonInfoShipTo.FirstName');

    // "Has order lines" fails in 1/3 = 33% (<50%) → NOT recurring
    const orderLines = recurring.find(r => r.checkName === 'Has order lines');
    expect(orderLines).toBeUndefined();
  });

  it('analyzeRecurringFailures returns empty when only 1 run', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    store.persistRun('run-1', 'APT001', {
      stages: [], passed: 0, failed: 1, skipped: 0,
      totalChecks: 0, totalDurationMs: 100, overallSuccess: false,
    }, '');

    // Need at least 2 runs for recurring analysis
    expect(store.analyzeRecurringFailures(2)).toEqual([]);
  });

  it('unmapped checks have sterlingField: null', async () => {
    const { initRunHistory } = await import('../../../../src/clients/adidas/run-history');
    const store = initRunHistory(db);

    const makeResult = (fail: boolean) => ({
      stages: [{
        stageId: 'test', stageName: 'Test',
        action: { success: true, durationMs: 0, data: {} },
        poll: { success: true, durationMs: 0, data: {} },
        verification: {
          steps: [{
            stepId: 'step-1',
            result: {
              success: !fail, durationMs: 0,
              checks: [
                { name: 'Some Unknown Check', passed: !fail, expected: 'yes', actual: fail ? 'no' : 'yes' },
              ],
            },
          }],
          passed: fail ? 0 : 1, failed: fail ? 1 : 0, skipped: 0,
        },
        overallSuccess: !fail, durationMs: 0,
      }],
      passed: fail ? 0 : 1, failed: fail ? 1 : 0, skipped: 0,
      totalChecks: 1, totalDurationMs: 0, overallSuccess: !fail,
    });

    store.persistRun('run-1', 'A', makeResult(true), '');
    store.persistRun('run-2', 'B', makeResult(true), '');

    const recurring = store.analyzeRecurringFailures();
    const unknown = recurring.find(r => r.checkName === 'Some Unknown Check');
    expect(unknown).toBeDefined();
    expect(unknown!.sterlingField).toBeNull();
  });
});

describe('STERLING_FIELD_MAP', () => {
  it('maps known check names to Sterling fields', async () => {
    const { STERLING_FIELD_MAP } = await import('../../../../src/clients/adidas/run-history');
    expect(STERLING_FIELD_MAP['ShipTo FirstName present']).toBe('PersonInfoShipTo.FirstName');
    expect(STERLING_FIELD_MAP['DateInvoiced present']).toBe('OrderInvoice.DateInvoiced');
    expect(Object.keys(STERLING_FIELD_MAP).length).toBe(11);
  });

  it('FIELD_PRESENCE_CHECKS matches STERLING_FIELD_MAP keys', async () => {
    const { STERLING_FIELD_MAP, FIELD_PRESENCE_CHECKS } = await import('../../../../src/clients/adidas/run-history');
    expect(FIELD_PRESENCE_CHECKS.size).toBe(Object.keys(STERLING_FIELD_MAP).length);
    for (const key of Object.keys(STERLING_FIELD_MAP)) {
      expect(FIELD_PRESENCE_CHECKS.has(key)).toBe(true);
    }
  });
});
