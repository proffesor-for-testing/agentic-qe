/**
 * #1137: a defect_predict run that was stored but whose retention pass failed
 * is a success with `retention: 'failed'`; the MCP result mapping must carry
 * that note instead of dropping it (MCP/CLI parity).
 */
import { describe, it, expect } from 'vitest';
// Load the handler registry first so the config module resolves without a cycle.
import '../../../../src/mcp/handlers/domain-handlers';
import { defectPredictConfig } from '../../../../src/mcp/handlers/domain-handler-configs';

const handlerOutput = {
  predictedDefects: [], riskScore: 0, recommendations: [], filesAnalyzed: 1, filesSkipped: 0,
  scanStatus: 'complete', predictionMethod: 'static-code-indicators', estimated: true,
};

describe('defect_predict result mapping (#1137)', () => {
  it('carries a retention failure note', () => {
    const result = defectPredictConfig.mapToResult('task-1',
      { ...handlerOutput, retention: 'failed', retentionError: 'retention storage failed' }, 5);
    expect(result).toMatchObject({ status: 'completed', filesAnalyzed: 1, retention: 'failed', retentionError: 'retention storage failed' });
  });

  it('adds no note when retention succeeded', () => {
    const result = defectPredictConfig.mapToResult('task-1', handlerOutput, 5);
    expect(result).not.toHaveProperty('retention');
    expect(result).not.toHaveProperty('retentionError');
  });
});
