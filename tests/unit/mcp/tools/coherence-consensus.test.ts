/**
 * qe/coherence/consensus MCP tool — input validation at the boundary
 * (issue #535 item 7).
 *
 * Root cause of the reported "Unanimous consensus" text for a 2-1 vote:
 * votes that carried the verdict under another key (e.g. `vote`) were
 * accepted, every verdict became `undefined`, and the service counted
 * three identical "undefined" verdicts as a unanimous false consensus.
 */

import { describe, it, expect } from 'vitest';
import { CoherenceConsensusTool } from '../../../../src/mcp/tools/coherence/consensus';
import {
  createCoherenceService,
  type IWasmLoader,
  type WasmModule,
} from '../../../../src/integrations/coherence/index';

const unavailableLoader: IWasmLoader = {
  async isAvailable() { return false; },
  async load(): Promise<WasmModule> { throw new Error('WASM not available'); },
  getModule(): WasmModule { throw new Error('WASM not available'); },
};

async function toolWithFallbackService(): Promise<CoherenceConsensusTool> {
  const tool = new CoherenceConsensusTool();
  const service = await createCoherenceService(unavailableLoader, {}, {
    debug() {}, info() {}, warn() {}, error() {},
  });
  (tool as unknown as { coherenceService: unknown }).coherenceService = service;
  return tool;
}

describe('qe/coherence/consensus tool', () => {
  it('rejects votes whose verdict is missing instead of treating them as unanimous', async () => {
    const tool = await toolWithFallbackService();
    const result = await tool.invoke({
      votes: [
        { agentId: 'a1', vote: 'pass', confidence: 0.9 },
        { agentId: 'a2', vote: 'fail', confidence: 0.8 },
        { agentId: 'a3', vote: 'pass', confidence: 0.6 },
      ] as never,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('votes[0].verdict');
  });

  it('rejects a non-numeric or out-of-range confidence', async () => {
    const tool = await toolWithFallbackService();
    const nonNumeric = await tool.invoke({
      votes: [
        { agentId: 'a1', verdict: 'pass', confidence: 'high' as never },
        { agentId: 'a2', verdict: 'pass', confidence: 0.8 },
      ],
    });
    const outOfRange = await tool.invoke({
      votes: [
        { agentId: 'a1', verdict: 'pass', confidence: 0.9 },
        { agentId: 'a2', verdict: 'pass', confidence: 1.5 },
      ],
    });

    expect(nonNumeric.success).toBe(false);
    expect(nonNumeric.error).toContain('votes[0].confidence');
    expect(outOfRange.success).toBe(false);
    expect(outOfRange.error).toContain('votes[1].confidence');
  });

  it('rejects a vote that is not an object or has no agentId', async () => {
    const tool = await toolWithFallbackService();
    const tuple = await tool.invoke({
      votes: [['a1', 'pass', 0.9], ['a2', 'fail', 0.8]] as never,
    });
    const noAgent = await tool.invoke({
      votes: [
        { agentId: 'a1', verdict: 'pass', confidence: 0.9 },
        { verdict: 'fail', confidence: 0.8 } as never,
      ],
    });

    expect(tuple.success).toBe(false);
    expect(tuple.error).toContain('votes[0]');
    expect(noAgent.success).toBe(false);
    expect(noAgent.error).toContain('votes[1].agentId');
  });

  it('returns a majority (not false consensus) for a well-formed 2-1 vote with the tally in the text', async () => {
    const tool = await toolWithFallbackService();
    const result = await tool.invoke({
      votes: [
        { agentId: 'a1', verdict: 'pass', confidence: 0.9 },
        { agentId: 'a2', verdict: 'fail', confidence: 0.8 },
        { agentId: 'a3', verdict: 'pass', confidence: 0.6 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.isFalseConsensus).toBe(false);
    expect(result.data?.recommendation).not.toMatch(/unanimous/i);
    expect(result.data?.recommendation).toContain("2 of 3 votes 'pass'");
  });

  it('describes the required vote shape in its schema', () => {
    const tool = new CoherenceConsensusTool();
    const votesSchema = tool.getSchema().properties.votes;

    expect(votesSchema.items?.required).toEqual(['agentId', 'verdict', 'confidence']);
    expect(votesSchema.description).toMatch(/agentId.*verdict.*confidence/);
  });
});
