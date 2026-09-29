/**
 * CoherenceService.verifyConsensus — verdict and recommendation text
 * must agree with the actual vote tally (issue #535 item 7).
 *
 * False consensus means votes that *appear* unified but may not be
 * (tool contract: "appears unified but isn't"). A split vote such as
 * 2 pass / 1 fail carries its disagreement openly, so it is never a false
 * consensus; it is a majority (fallback) or an unverified consensus
 * (spectral). Every recommendation string must name the real tally.
 */

import { describe, it, expect } from 'vitest';
import {
  createCoherenceService,
  type AgentVote,
  type IWasmLoader,
  type WasmModule,
} from '../../../../src/integrations/coherence/index';
import type { ISpectralAdapter } from '../../../../src/integrations/coherence/engines/spectral-adapter';

const unavailableLoader: IWasmLoader = {
  async isAvailable() { return false; },
  async load(): Promise<WasmModule> { throw new Error('WASM not available'); },
  getModule(): WasmModule { throw new Error('WASM not available'); },
};

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function votes(...spec: Array<[string, string | number | boolean, number]>): AgentVote[] {
  return spec.map(([agentId, verdict, confidence]) => ({
    agentId,
    agentType: 'worker' as AgentVote['agentType'],
    verdict,
    confidence,
    timestamp: new Date(),
  }));
}

async function fallbackService() {
  return createCoherenceService(unavailableLoader, {}, silentLogger);
}

/** Service whose spectral adapter reports the given Fiedler value / risk. */
async function spectralService(fiedlerValue: number, collapseRisk: number) {
  const service = await fallbackService();
  const stub: Partial<ISpectralAdapter> = {
    isInitialized: () => true,
    clear: () => {},
    addNode: () => {},
    addEdge: () => {},
    computeFiedlerValue: () => fiedlerValue,
    predictCollapseRisk: () => collapseRisk,
  };
  (service as unknown as { spectralAdapter: Partial<ISpectralAdapter> }).spectralAdapter = stub;
  return service;
}

describe('CoherenceService.verifyConsensus (fallback path)', () => {
  it('does not flag a 2-1 split as false consensus and reports the tally', async () => {
    const service = await fallbackService();
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'fail', 0.8], ['a3', 'pass', 0.6])
    );

    expect(result.usedFallback).toBe(true);
    expect(result.isFalseConsensus).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.recommendation).not.toMatch(/unanimous/i);
    expect(result.recommendation).toContain("2 of 3 votes 'pass'");
    expect(result.recommendation).toContain("1 'fail'");
  });

  it('flags a 3-0 unanimous vote as possible false consensus and says so with counts', async () => {
    const service = await fallbackService();
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'pass', 0.8], ['a3', 'pass', 0.6])
    );

    expect(result.isFalseConsensus).toBe(true);
    expect(result.recommendation).toMatch(/^Unanimous consensus \(3 of 3 votes 'pass'\) may indicate false consensus/);
  });

  it('does not claim false consensus in the text when the flag is false (2-0 unanimous)', async () => {
    const service = await fallbackService();
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'pass', 0.8])
    );

    expect(result.isFalseConsensus).toBe(false);
    expect(result.recommendation).not.toMatch(/false consensus/i);
    expect(result.recommendation).toContain("2 of 2 votes 'pass'");
  });

  it('uses the same majority threshold for isValid and the recommendation (3 of 5)', async () => {
    const service = await fallbackService();
    const result = await service.verifyConsensus(
      votes(
        ['a1', 'pass', 0.9], ['a2', 'pass', 0.8], ['a3', 'pass', 0.7],
        ['a4', 'fail', 0.6], ['a5', 'fail', 0.6]
      )
    );

    expect(result.isValid).toBe(false);
    expect(result.recommendation).toMatch(/^No clear majority/);
    expect(result.recommendation).toContain("3 'pass' / 2 'fail'");
  });

  it('reports every verdict when there is no majority', async () => {
    const service = await fallbackService();
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'fail', 0.8], ['a3', 'skip', 0.6])
    );

    expect(result.isValid).toBe(false);
    expect(result.isFalseConsensus).toBe(false);
    expect(result.recommendation).toContain("1 'fail' / 1 'pass' / 1 'skip'");
  });
});

describe('CoherenceService.verifyConsensus (spectral path)', () => {
  it('does not flag a split vote as false consensus even though its agreement graph is disconnected', async () => {
    // Agreement graph for pass/fail/pass = one edge + an isolated node, so λ2 = 0.
    const service = await spectralService(0, 1);
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'fail', 0.8], ['a3', 'pass', 0.6])
    );

    expect(result.usedFallback).toBe(false);
    expect(result.isValid).toBe(false);
    expect(result.isFalseConsensus).toBe(false);
    expect(result.recommendation).toMatch(/^No verified consensus/);
    expect(result.recommendation).toContain("2 of 3 votes 'pass'");
    expect(result.recommendation).toContain("1 'fail'");
  });

  it('verifies a unanimous vote with a connected agreement graph and names the tally', async () => {
    const service = await spectralService(1.8, 0);
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'pass', 0.8], ['a3', 'pass', 0.6])
    );

    expect(result.usedFallback).toBe(false);
    expect(result.isValid).toBe(true);
    expect(result.isFalseConsensus).toBe(true);
    expect(result.recommendation).toMatch(/^Consensus verified \(3 of 3 votes 'pass'\)/);
    expect(result.recommendation).toMatch(/false consensus/i);
  });

  it('falls back when the engine reports λ2 = 0 for a unanimous (connected) vote', async () => {
    // A complete graph with positive weights always has λ2 > 0, so a zero
    // Fiedler value here means the engine result cannot be trusted.
    const service = await spectralService(0, 1);
    const result = await service.verifyConsensus(
      votes(['a1', 'pass', 0.9], ['a2', 'pass', 0.8], ['a3', 'pass', 0.6])
    );

    expect(result.usedFallback).toBe(true);
    expect(result.isValid).toBe(true);
    expect(result.recommendation).toContain("3 of 3 votes 'pass'");
  });
});
