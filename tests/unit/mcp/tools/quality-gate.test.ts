import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { QualityGateTool } from '../../../../src/mcp/tools/quality-assessment/gate.js';
import type { MCPToolContext, ToolLogger } from '../../../../src/mcp/tools/base.js';
import {
  computeVerificationArtifactDigest,
  createVerificationReachManifest,
} from '../../../../src/validation/verification-reach.js';

describe('QualityGateTool diagnostics', () => {
  it('should_acceptRevisionBoundReachManifest_throughSharedMcpPath', async () => {
    const tool = new QualityGateTool();
    tool.setLogger({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    const result = await tool.execute({
      checklistId: 'A1-inRange',
      artifact: 'test artifact',
      oracle: { passed: true, baselinePassed: true },
      anchorPath: path.resolve('verification/anchors/qe-anchor-v1.json'),
      verificationManifest: createVerificationReachManifest({
        id: 'mcp-reach-v1',
        systemUnderTest: 'mcp-artifact',
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
            checkId: 'mcp-smoke',
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
      }),
    }, {
      requestId: 'request-reach',
      llmRouter: { chat: vi.fn().mockRejectedValue(new Error('offline test judge')) },
    } as unknown as MCPToolContext);

    expect(result).toMatchObject({
      success: true,
      data: {
        coverageVerdict: 'pass',
        verification: { kind: 'verified', manifestId: 'mcp-reach-v1' },
      },
    });
  });

  it('should_routeJudgeFailureToToolLogger_when_providerFails', async () => {
    // Arrange: preflight succeeds, then both grade attempts fail.
    const chat = vi.fn()
      .mockResolvedValueOnce({ content: 'OK' })
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockRejectedValueOnce(new Error('provider timeout'));
    const logger: ToolLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const tool = new QualityGateTool();
    tool.setLogger(logger);
    const context = {
      requestId: 'request-621',
      llmRouter: { chat },
    } as unknown as MCPToolContext;

    // Act
    const result = await tool.execute({
      checklistId: 'A1-inRange',
      artifact: 'test artifact',
      oracle: { passed: true, baselinePassed: true },
      anchorPath: path.resolve('verification/anchors/qe-anchor-v1.json'),
    }, context);

    // Assert
    expect(result, result.success ? undefined : result.error).toMatchObject({ success: true });
    expect(result).toMatchObject({
      data: {
        verdict: 'inconclusive',
        coverageVerdict: 'inconclusive',
        verification: { kind: 'legacy-unknown' },
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('provider timeout'),
      { requestId: 'request-621' },
    );
  });
});
