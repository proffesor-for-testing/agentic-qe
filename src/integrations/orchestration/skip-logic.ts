/**
 * Agentic QE v3 - Shared Layer Skip Logic
 * Single source of truth for determining whether a step should be skipped
 * based on its layer and requirements vs. available credentials.
 *
 * Used by both StepRunner and ActionOrchestrator to avoid drift.
 */

import type { StepDef, BaseTestContext } from './types';

export interface SkipConfig {
  skipLayer2: boolean;
  skipLayer3: boolean;
}

/**
 * Determine if a step should be skipped based on its layer/requirements
 * and the current skip configuration.
 */
export function shouldSkipStep<TContext extends BaseTestContext>(
  step: StepDef<TContext>,
  config: SkipConfig
): boolean {
  if (step.layer === 2 && config.skipLayer2) return true;
  if (step.layer === 3 && config.skipLayer3) return true;
  if (step.requires.iib && config.skipLayer2) return true;
  if (step.requires.nshift && config.skipLayer3) return true;
  if (step.requires.email && config.skipLayer3) return true;
  if (step.requires.pdf && config.skipLayer3) return true;
  if (step.requires.browser && config.skipLayer3) return true;
  return false;
}

/**
 * Return a human-readable reason for why a step was skipped.
 */
export function skipReason<TContext extends BaseTestContext>(
  step: StepDef<TContext>,
  config: SkipConfig
): string {
  if (step.layer === 2 && config.skipLayer2) return 'Layer 2 steps skipped (no IIB credentials)';
  if (step.layer === 3 && config.skipLayer3) return 'Layer 3 steps skipped (no Layer 3 credentials)';
  if (step.requires.iib && config.skipLayer2) return 'Requires IIB provider (not available)';
  if (step.requires.nshift && config.skipLayer3) return 'Requires NShift client (not available)';
  if (step.requires.email && config.skipLayer3) return 'Requires email provider (not available)';
  if (step.requires.pdf && config.skipLayer3) return 'Requires PDF extractor (not available)';
  if (step.requires.browser && config.skipLayer3) return 'Requires browser provider (not available)';
  return 'Unknown skip reason';
}
