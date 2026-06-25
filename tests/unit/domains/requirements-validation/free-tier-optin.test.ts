/**
 * Requirements-validation coordinator — opt-in cheap-first BDD generation
 * (plan 06 broadening; ADR-111). Mocks the free-tier network call; no real model.
 * Generates Gherkin on the local tier, verifies structure (objective oracle),
 * parses it back into structured scenarios.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FreeTierChatResult } from '../../../../src/routing/free-tier/provider.js';

const chatMock = vi.fn<(...a: unknown[]) => Promise<FreeTierChatResult>>();
vi.mock('../../../../src/routing/free-tier/provider.js', async (orig) => {
  const actual = await orig<typeof import('../../../../src/routing/free-tier/provider.js')>();
  return { ...actual, freeTierChat: (...a: unknown[]) => chatMock(...a) };
});

import {
  RequirementsValidationCoordinator,
  type CoordinatorConfig,
} from '../../../../src/domains/requirements-validation/coordinator';
import {
  createCoordinatorTestContext,
  resetTestContext,
  type CoordinatorTestContext,
} from '../coordinator-test-utils';
import type { Requirement } from '../../../../src/domains/requirements-validation/interfaces';

const baseConfig: Partial<CoordinatorConfig> = { publishEvents: false, enablePPO: false, enableSONA: false };

const REQ: Requirement = {
  id: 'req-1',
  title: 'Apply tier discount',
  description: 'Apply a percentage discount to a price based on customer tier.',
  acceptanceCriteria: ['gold tier gets 20% off', 'silver tier gets 10% off'],
  type: 'functional',
  priority: 'high',
  status: 'approved',
};

const GHERKIN = [
  '```gherkin',
  'Feature: Apply tier discount',
  '  Scenario: Gold tier discount',
  '    Given a price of 100 and tier gold',
  '    When the discount is applied',
  '    Then the result is 80',
  '  Scenario: Silver tier discount',
  '    Given a price of 100 and tier silver',
  '    When the discount is applied',
  '    Then the result is 90',
  '```',
].join('\n');

describe('RequirementsValidationCoordinator — free-tier opt-in BDD', () => {
  let ctx: CoordinatorTestContext;

  beforeEach(async () => {
    chatMock.mockReset();
    ctx = createCoordinatorTestContext();
    await ctx.memory.set('requirement:req-1', REQ); // seed for repository.findById
  });
  afterEach(() => resetTestContext(ctx));

  it('should NOT touch the free tier when disabled (default)', async () => {
    const coord = new RequirementsValidationCoordinator(ctx.eventBus, ctx.memory, ctx.agentCoordinator, baseConfig);
    await coord.generateTestArtifacts('req-1').catch(() => undefined);
    expect(chatMock).not.toHaveBeenCalled();
    await coord.dispose();
  });

  it('should generate scenarios via the free local tier when opted in (valid Gherkin)', async () => {
    chatMock.mockResolvedValue({ ok: true, content: GHERKIN, latencyMs: 9 });
    const coord = new RequirementsValidationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true },
    );

    const result = await coord.generateTestArtifacts('req-1');

    expect(chatMock).toHaveBeenCalled(); // cheap-first path ran
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.bddScenarios.length).toBeGreaterThanOrEqual(2);
      expect(result.value.gherkinFiles.length).toBeGreaterThan(0);
    }
    await coord.dispose();
  });

  it('should feed the BDD outcome to routing-feedback (D9) when a collector is injected', async () => {
    chatMock.mockResolvedValue({ ok: true, content: GHERKIN, latencyMs: 9 });
    const recordOutcome = vi.fn().mockReturnValue({ id: 'o1' });
    const coord = new RequirementsValidationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true },
      undefined, // llmRouter
      { recordOutcome } as never, // D9 sink
    );

    await coord.generateTestArtifacts('req-1');

    expect(recordOutcome).toHaveBeenCalledOnce();
    const [, , usedAgent, outcome] = recordOutcome.mock.calls[0];
    expect(usedAgent).toBe('local');
    expect(outcome).toMatchObject({ success: true });
    await coord.dispose();
  });

  it('should REJECT structurally-valid but off-topic Gherkin (anti-Goodhart relevance gate)', async () => {
    // Well-formed Gherkin about an UNRELATED feature — must not pass the oracle.
    const offTopic = [
      '```gherkin',
      'Feature: User login',
      '  Scenario: Successful login',
      '    Given a registered account',
      '    When the password is correct',
      '    Then access is granted',
      '```',
    ].join('\n');
    chatMock
      .mockResolvedValueOnce({ ok: true, content: offTopic, latencyMs: 5 }) // rejected by relevance gate
      .mockResolvedValueOnce({ ok: true, content: GHERKIN, latencyMs: 7 }); // on-topic repair passes
    const coord = new RequirementsValidationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true, freeTierRepairAttempts: 1, freeTierBestOfK: 1 },
    );

    const result = await coord.generateTestArtifacts('req-1');

    // If the off-topic feature had passed, this would be 1 call; the relevance
    // gate rejects it and forces the repair turn → 2 calls.
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    await coord.dispose();
  });

  it('should repair on non-Gherkin output then succeed (D8)', async () => {
    chatMock
      .mockResolvedValueOnce({ ok: true, content: 'just prose, no gherkin', latencyMs: 4 })
      .mockResolvedValueOnce({ ok: true, content: GHERKIN, latencyMs: 7 });
    const coord = new RequirementsValidationCoordinator(
      ctx.eventBus, ctx.memory, ctx.agentCoordinator,
      { ...baseConfig, enableFreeTier: true, freeTierRepairAttempts: 1, freeTierBestOfK: 1 },
    );

    const result = await coord.generateTestArtifacts('req-1');

    expect(chatMock).toHaveBeenCalledTimes(2); // initial + 1 repair (bestOfK pinned to 1)
    expect(result.success).toBe(true);
    await coord.dispose();
  });
});
