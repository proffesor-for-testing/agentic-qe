import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestExecutorService } from '../../../../src/domains/test-execution/services/test-executor.js';
import { createMockMemory } from '../coordinator-test-utils.js';

describe('TestExecutorService Node test runner', () => {
  let fixtureDir: string;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'aqe-node-test-'));
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  it('executes a CommonJS node:test file and reports TAP counts', async () => {
    const testFile = join(fixtureDir, 'example.test.cjs');
    await writeFile(testFile, `
const test = require('node:test');
const assert = require('node:assert/strict');
test('passes', () => assert.equal(2 + 2, 4));
test.skip('is intentionally skipped', () => {});
`);
    const executor = new TestExecutorService(
      { memory: createMockMemory() },
      { simulateForTesting: false, enableLLMAnalysis: false }
    );

    const result = await executor.execute({
      testFiles: [testFile],
      framework: 'node',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toMatchObject({
        status: 'passed',
        total: 2,
        passed: 1,
        failed: 0,
        skipped: 1,
      });
    }
  });

  it('rejects a TAP receipt with zero executed tests', () => {
    const executor = new TestExecutorService(
      { memory: createMockMemory() },
      { simulateForTesting: false, enableLLMAnalysis: false }
    );

    const result = (executor as unknown as {
      parseNodeTestOutput(
        stdout: string,
        stderr: string,
        file: string,
        exitCode: number | null
      ): { success: boolean; error?: Error };
    }).parseNodeTestOutput(
      'TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0\n',
      '',
      'empty.test.cjs',
      0
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('zero tests');
  });
});
