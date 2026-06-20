/**
 * Free-tier escalation ladder (D7).
 *
 * Ties the configurable provider layer to the real `AutoEscalationTracker`:
 * builds a tracker whose ladder starts at a FREE tier and escalates up the
 * existing Claude tiers on failure (Ruv's Round-3 economics), and resolves any
 * tier name to the concrete provider that should serve it.
 */

import { AutoEscalationTracker } from '../escalation/auto-escalation-tracker.js';
import { resolveFreeTierProvider } from './provider.js';
import type { ResolvedFreeTierProvider, QeRoutingLadder, TierBinding } from './types.js';
import type { AgentTier } from '../routing-config.js';

/**
 * A ready-to-use, opinionated default: a free local Ollama tier under the three
 * Claude tiers. Override `bindings.local.config.model` / `.kind` to point at
 * cloud Ollama, OpenRouter, or any compatible endpoint.
 */
export function defaultFreeTierLadder(model = 'qwen3:8b'): QeRoutingLadder {
  return {
    tierOrder: ['local', 'haiku', 'sonnet', 'opus'],
    minTier: 'local',
    maxTier: 'opus',
    escalateAfterFailures: 2,
    deEscalateAfterSuccesses: 5,
    bindings: {
      local: { provider: 'free-tier', config: { kind: 'local-ollama', model } },
      haiku: { provider: 'claude', claudeTier: 'haiku' },
      sonnet: { provider: 'claude', claudeTier: 'sonnet' },
      opus: { provider: 'claude', claudeTier: 'opus' },
    },
  };
}

/** Validate a ladder: every tier in `tierOrder` must have a binding, bounds must exist. */
export function validateLadder(ladder: QeRoutingLadder): void {
  if (ladder.tierOrder.length === 0) throw new Error('free-tier ladder: tierOrder is empty');
  for (const tier of ladder.tierOrder) {
    if (!ladder.bindings[tier]) throw new Error(`free-tier ladder: no binding for tier "${tier}"`);
  }
  const min = ladder.minTier ?? ladder.tierOrder[0];
  const max = ladder.maxTier ?? ladder.tierOrder[ladder.tierOrder.length - 1];
  if (!ladder.tierOrder.includes(min)) throw new Error(`free-tier ladder: minTier "${min}" not in tierOrder`);
  if (!ladder.tierOrder.includes(max)) throw new Error(`free-tier ladder: maxTier "${max}" not in tierOrder`);
  if (ladder.tierOrder.indexOf(min) > ladder.tierOrder.indexOf(max)) {
    throw new Error('free-tier ladder: minTier is above maxTier');
  }
}

/**
 * Build an `AutoEscalationTracker` over the ladder's string tiers. Agents start
 * at the bottom (free) tier; consecutive failures escalate, successes de-escalate
 * — bounded by min/maxTier. Reuses the unchanged, tested tracker engine.
 */
export function createFreeTierEscalation(ladder: QeRoutingLadder): {
  tracker: AutoEscalationTracker<string>;
  baseTier: string;
} {
  validateLadder(ladder);
  const tracker = new AutoEscalationTracker<string>({
    tierOrder: ladder.tierOrder,
    minTier: ladder.minTier ?? ladder.tierOrder[0],
    maxTier: ladder.maxTier ?? ladder.tierOrder[ladder.tierOrder.length - 1],
    escalateAfterFailures: ladder.escalateAfterFailures ?? 2,
    deEscalateAfterSuccesses: ladder.deEscalateAfterSuccesses ?? 5,
  });
  return { tracker, baseTier: ladder.tierOrder[0] };
}

export type ResolvedTier =
  | { provider: 'claude'; claudeTier: AgentTier }
  | { provider: 'free-tier'; resolved: ResolvedFreeTierProvider };

/**
 * Resolve a tier name to the concrete handler: either a Claude tier (for the
 * existing router) or a fully-resolved free-tier provider (env key read here).
 */
export function resolveTier(
  ladder: QeRoutingLadder,
  tier: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedTier {
  const binding: TierBinding | undefined = ladder.bindings[tier];
  if (!binding) throw new Error(`free-tier ladder: no binding for tier "${tier}"`);
  if (binding.provider === 'claude') {
    return { provider: 'claude', claudeTier: binding.claudeTier };
  }
  return { provider: 'free-tier', resolved: resolveFreeTierProvider(binding.config, env) };
}
