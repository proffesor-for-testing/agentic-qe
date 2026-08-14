import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { QualityGateTool } from '../../../../src/mcp/tools/quality-assessment/gate.js';
import type { MCPToolContext, ToolLogger } from '../../../../src/mcp/tools/base.js';

describe('QualityGateTool diagnostics', () => {
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
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('provider timeout'),
      { requestId: 'request-621' },
    );
  });
});
