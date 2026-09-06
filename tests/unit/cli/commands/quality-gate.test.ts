import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import {
  computeVerificationArtifactDigest,
  createVerificationReachManifest,
} from '../../../../src/validation/verification-reach.js';

const chat = vi.fn();

vi.mock('../../../../src/shared/llm/llm-router-service.js', () => ({
  createLLMRouterService: vi.fn(async () => ({ router: { chat } })),
}));

import { createQualityGateCommand } from '../../../../src/cli/commands/quality-gate.js';

describe('quality-gate CLI diagnostics', () => {
  let stdout: string[];
  let stderr: string[];
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    chat.mockReset();
    vi.spyOn(console, 'log').mockImplementation((message) => stdout.push(String(message)));
    vi.spyOn(console, 'error').mockImplementation((message) => stderr.push(String(message)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('should_acceptRevisionBoundReachManifest_throughSharedCliPath', async () => {
    chat
      .mockResolvedValueOnce({ content: 'OK' })
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const directory = mkdtempSync(path.join(tmpdir(), 'aqe-reach-'));
    temporaryDirectories.push(directory);
    const manifestPath = path.join(directory, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(createVerificationReachManifest({
      id: 'cli-reach-v1',
      systemUnderTest: 'cli-artifact',
      artifact: {
        revision: 'abc123',
        digest: computeVerificationArtifactDigest('test artifact'),
        environment: 'test',
      },
      generatedAt: '2026-09-06T09:00:00.000Z',
      risks: [{
        riskId: 'non-execution',
        failureMode: 'artifact was not executed',
        severity: 'critical',
        requiredOracle: 'process-exit',
        requiredObservations: ['runtime'],
        dispositionWhenUncovered: 'fail',
        checks: [{
          checkId: 'cli-smoke',
          channel: 'runtime',
          reach: 'direct',
          evidenceClass: 'EXECUTED',
          executionStatus: 'passed',
          target: {
            revision: 'abc123',
            digest: computeVerificationArtifactDigest('test artifact'),
            environment: 'test',
          },
          oracleRef: 'process-exit',
          observedAt: '2026-09-06T10:00:00.000Z',
          limitations: [],
        }],
      }],
    })));
    const cleanupAndExit = vi.fn(async () => undefined) as unknown as (
      code: number,
    ) => Promise<never>;
    const command = createQualityGateCommand(
      {} as CLIContext,
      cleanupAndExit,
      vi.fn(async () => true),
    );

    await command.parseAsync([
      '--checklist', 'A1-inRange',
      '--artifact', 'test artifact',
      '--oracle-passed',
      '--baseline-passed',
      '--anchor', path.resolve('verification/anchors/qe-anchor-v1.json'),
      '--verification-manifest', manifestPath,
    ], { from: 'user' });

    expect(stdout.join('\n')).toContain('Coverage verdict: pass');
    expect(stdout.join('\n')).toContain('non-execution: pass');
    expect(stdout.join('\n')).toContain('direct=cli-smoke; partial=none; uncovered=none');
  });

  it('should_keepStdoutParseable_when_judgeFailureIsLoggedToStderr', async () => {
    // Arrange: preflight succeeds, then both grade attempts fail.
    chat
      .mockResolvedValueOnce({ content: 'OK' })
      .mockRejectedValueOnce(new Error('provider spawn failed'))
      .mockRejectedValueOnce(new Error('provider spawn failed'));
    const cleanupAndExit = vi.fn(async () => undefined) as unknown as (
      code: number,
    ) => Promise<never>;
    const command = createQualityGateCommand(
      {} as CLIContext,
      cleanupAndExit,
      vi.fn(async () => true),
    );

    // Act
    await command.parseAsync([
      '--checklist', 'A1-inRange',
      '--artifact', 'test artifact',
      '--oracle-passed',
      '--baseline-passed',
      '--anchor', path.resolve('verification/anchors/qe-anchor-v1.json'),
      '--format', 'json',
    ], { from: 'user' });

    // Assert
    expect(stdout, stderr.join('\n')).not.toHaveLength(0);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed).toMatchObject({
      verdict: 'inconclusive',
      coverageVerdict: 'inconclusive',
      verification: { kind: 'legacy-unknown' },
    });
    expect(stderr.join('\n')).toContain('provider spawn failed');
    expect(cleanupAndExit).toHaveBeenCalledWith(3);
  });
});
