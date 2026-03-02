/**
 * Tests for generateDebugDump — structured Markdown debug output.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { RunResult } from '../../../../src/integrations/orchestration/action-types';
import type { HealingOutcome } from '../../../../src/clients/adidas/healing-telemetry';
import type { RecurringFailure } from '../../../../src/clients/adidas/run-history';

const testOutputDir = resolve(__dirname, 'test-debug-output');
const createdFiles: string[] = [];

afterEach(() => {
  for (const f of createdFiles) {
    if (existsSync(f)) unlinkSync(f);
  }
  createdFiles.length = 0;
});

function makeRunResult(overrides?: Partial<RunResult>): RunResult {
  return {
    stages: [
      {
        stageId: 'create-order', stageName: 'Create Order',
        action: { success: true, durationMs: 500, data: {} },
        poll: { success: true, durationMs: 0, data: {} },
        verification: {
          steps: [{
            stepId: 'step-1',
            result: {
              success: true, durationMs: 10,
              checks: [
                { name: 'ShipTo FirstName present', passed: true, expected: 'present', actual: 'present' },
              ],
            },
          }],
          passed: 1, failed: 0, skipped: 0,
        },
        overallSuccess: true, durationMs: 510,
      },
      {
        stageId: 'forward-invoice', stageName: 'Forward Invoice',
        action: { success: false, error: 'Invoice not found after 180s', durationMs: 180000, data: {} },
        poll: { success: true, durationMs: 0, data: {} },
        verification: {
          steps: [{
            stepId: 'step-12',
            result: {
              success: false, durationMs: 5,
              checks: [
                { name: 'DateInvoiced present', passed: false, expected: 'present', actual: 'missing' },
              ],
            },
          }],
          passed: 0, failed: 1, skipped: 0,
        },
        overallSuccess: false, durationMs: 180005,
      },
    ],
    passed: 1,
    failed: 1,
    skipped: 0,
    totalChecks: 2,
    totalDurationMs: 180515,
    overallSuccess: false,
    ...overrides,
  };
}

describe('generateDebugDump', () => {
  it('produces a Markdown file with all 5 sections', async () => {
    const { generateDebugDump } = await import('../../../../src/clients/adidas/report-generator');

    mkdirSync(testOutputDir, { recursive: true });

    const healingOutcomes: HealingOutcome[] = [
      {
        runId: 'run-1', stageId: 'forward-invoice', playbookName: 'fix-invoice-generation',
        decision: 'retry', success: true, durationMs: 45000,
      },
    ];

    const recurringFailures: RecurringFailure[] = [
      {
        checkName: 'DateInvoiced present', failRate: 0.75,
        failedInRuns: 3, totalRuns: 4, sterlingField: 'OrderInvoice.DateInvoiced', stageId: 'forward-invoice',
      },
    ];

    const filePath = await generateDebugDump(
      makeRunResult(),
      'APT12345678',
      { enterpriseCode: 'adidas_PT', host: 'https://sterling.example.com', layers: 'L1+L2' },
      healingOutcomes,
      recurringFailures,
      testOutputDir,
    );
    createdFiles.push(filePath);

    expect(existsSync(filePath)).toBe(true);
    expect(filePath).toContain('debug-APT12345678-');
    expect(filePath.endsWith('.md')).toBe(true);

    const content = readFileSync(filePath, 'utf8');

    // Section 1: Run Summary
    expect(content).toContain('# Debug Dump — APT12345678');
    expect(content).toContain('adidas_PT');
    expect(content).toContain('FAIL');
    expect(content).toContain('1 pass / 1 fail / 0 skip');

    // Section 2: Stages
    expect(content).toContain('## Stages');
    expect(content).toContain('create-order');
    expect(content).toContain('forward-invoice');

    // Section 3: Failed Checks
    expect(content).toContain('## Failed Checks');
    expect(content).toContain('DateInvoiced present');
    expect(content).toContain('OrderInvoice.DateInvoiced');

    // Section 4: Self-Healing Outcomes
    expect(content).toContain('## Self-Healing Outcomes');
    expect(content).toContain('fix-invoice-generation');
    expect(content).toContain('retry');

    // Section 5: Recurring Failures
    expect(content).toContain('## Recurring Failures (Cross-Run)');
    expect(content).toContain('75%');
  });

  it('omits optional sections when empty', async () => {
    const { generateDebugDump } = await import('../../../../src/clients/adidas/report-generator');

    mkdirSync(testOutputDir, { recursive: true });

    const allPassResult: RunResult = {
      stages: [{
        stageId: 'create-order', stageName: 'Create Order',
        action: { success: true, durationMs: 100, data: {} },
        poll: { success: true, durationMs: 0, data: {} },
        verification: {
          steps: [{
            stepId: 'step-1',
            result: { success: true, durationMs: 5, checks: [{ name: 'ok', passed: true, expected: 'true', actual: 'true' }] },
          }],
          passed: 1, failed: 0, skipped: 0,
        },
        overallSuccess: true, durationMs: 105,
      }],
      passed: 1, failed: 0, skipped: 0,
      totalChecks: 1, totalDurationMs: 105, overallSuccess: true,
    };

    const filePath = await generateDebugDump(
      allPassResult, 'APT00000001',
      { enterpriseCode: 'adidas_PT', host: 'https://sterling.example.com', layers: 'L1' },
      [], [],
      testOutputDir,
    );
    createdFiles.push(filePath);

    const content = readFileSync(filePath, 'utf8');

    // Should have summary + stages but NOT optional sections
    expect(content).toContain('# Debug Dump');
    expect(content).toContain('## Stages');
    expect(content).not.toContain('## Failed Checks');
    expect(content).not.toContain('## Self-Healing Outcomes');
    expect(content).not.toContain('## Recurring Failures');
  });
});
