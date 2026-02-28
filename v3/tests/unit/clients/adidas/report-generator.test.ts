/**
 * Report Generator Unit Tests
 * Tests HTML report generation with canned RunResult data.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { generateTC01Report } from '../../../../src/clients/adidas/report-generator';
import { readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { RunResult } from '../../../../src/integrations/orchestration/action-types';

// ============================================================================
// Test Data
// ============================================================================

const PASS_RESULT: RunResult = {
  stages: [
    {
      stageId: 'create-order',
      stageName: 'Create Sales Order',
      action: { success: true, durationMs: 1200 },
      poll: { success: true, durationMs: 3000 },
      verification: {
        steps: [
          {
            stepId: 'step-01',
            result: {
              success: true,
              durationMs: 500,
              checks: [
                { name: 'OrderNo present', passed: true, expected: 'truthy', actual: 'APT123' },
                { name: 'Has order lines', passed: true, expected: '>0', actual: '1' },
              ],
            },
          },
        ],
        passed: 1,
        failed: 0,
        skipped: 0,
      },
      overallSuccess: true,
      durationMs: 4700,
    },
    {
      stageId: 'forward-invoice',
      stageName: 'Forward Invoice',
      action: { success: true, durationMs: 0, data: { actionStatus: 'skipped' } },
      poll: { success: true, durationMs: 15000 },
      verification: {
        steps: [
          {
            stepId: 'step-12',
            result: {
              success: true,
              durationMs: 200,
              checks: [
                { name: 'Forward invoice exists', passed: true, expected: 'truthy', actual: 'INV-001' },
              ],
            },
          },
        ],
        passed: 1,
        failed: 0,
        skipped: 0,
      },
      overallSuccess: true,
      durationMs: 15200,
    },
  ],
  passed: 2,
  failed: 0,
  totalChecks: 3,
  totalDurationMs: 19900,
  overallSuccess: true,
};

const FAIL_RESULT: RunResult = {
  stages: [
    {
      stageId: 'confirm-shipment',
      stageName: 'Confirm Shipment',
      action: { success: false, error: 'XAPI ship confirm failed: HTTP 500', durationMs: 2000 },
      poll: { success: true, durationMs: 0 },
      verification: { steps: [], passed: 0, failed: 0, skipped: 0 },
      overallSuccess: false,
      durationMs: 2000,
    },
  ],
  passed: 0,
  failed: 1,
  totalChecks: 0,
  totalDurationMs: 2000,
  overallSuccess: false,
};

// ============================================================================
// Tests
// ============================================================================

const outputDir = join(tmpdir(), 'aqe-report-test-' + Date.now());

afterAll(async () => {
  try { await rm(outputDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('generateTC01Report', () => {
  it('generates an HTML file for a passing result', async () => {
    const path = await generateTC01Report(PASS_RESULT, 'APT12345678', outputDir);

    expect(path).toContain('tc01-APT12345678');
    expect(path).toMatch(/\.html$/);

    const info = await stat(path);
    expect(info.isFile()).toBe(true);
    expect(info.size).toBeGreaterThan(100);
  });

  it('HTML contains order ID and PASS badge', async () => {
    const path = await generateTC01Report(PASS_RESULT, 'APT12345678', outputDir);
    const html = await readFile(path, 'utf-8');

    expect(html).toContain('APT12345678');
    expect(html).toContain('PASS');
    expect(html).toContain('Create Sales Order');
    expect(html).toContain('Forward Invoice');
  });

  it('HTML contains check details', async () => {
    const path = await generateTC01Report(PASS_RESULT, 'APT99999999', outputDir);
    const html = await readFile(path, 'utf-8');

    expect(html).toContain('OrderNo present');
    expect(html).toContain('Has order lines');
    expect(html).toContain('step-01');
  });

  it('generates report for failing result with error details', async () => {
    const path = await generateTC01Report(FAIL_RESULT, 'APT-FAIL-001', outputDir);
    const html = await readFile(path, 'utf-8');

    expect(html).toContain('FAIL');
    expect(html).toContain('Confirm Shipment');
    expect(html).toContain('XAPI ship confirm failed');
  });

  it('produces valid HTML document', async () => {
    const path = await generateTC01Report(PASS_RESULT, 'APT-VALID', outputDir);
    const html = await readFile(path, 'utf-8');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
  });

  it('summary section has correct numbers', async () => {
    const path = await generateTC01Report(PASS_RESULT, 'APT-SUMMARY', outputDir);
    const html = await readFile(path, 'utf-8');

    // 2 stages, 2 passed, 0 failed, 3 checks
    expect(html).toContain('>2<');  // stages count
    expect(html).toContain('>3<');  // checks count
  });
});
