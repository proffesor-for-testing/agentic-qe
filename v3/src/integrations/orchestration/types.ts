/**
 * Agentic QE v3 - E2E Orchestration Types
 * Generic step definition and execution types for enterprise E2E test orchestration.
 * Reusable across all clients — clients provide step definitions, the framework runs them.
 */

import type { BaseTestContext } from './base-context';

// ============================================================================
// Step Definition
// ============================================================================

/**
 * A single test step definition. Generic over context type so clients
 * can extend BaseTestContext with their own fields without unsafe casts.
 */
export interface StepDef<TContext extends BaseTestContext = BaseTestContext> {
  id: string;                          // 'step-01', 'step-02', etc.
  name: string;
  description: string;
  layer: 1 | 2 | 3;                   // Progressive Enhancement layer
  requires: {
    iib?: boolean;
    nshift?: boolean;
    email?: boolean;
    pdf?: boolean;
    browser?: boolean;
  };
  execute: (ctx: TContext) => Promise<StepResult>;
}

// ============================================================================
// Step Execution Results
// ============================================================================

export interface StepResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  checks: StepCheck[];
}

export interface StepCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

// ============================================================================
// Suite Results
// ============================================================================

export interface SuiteResult {
  steps: Array<{ step: Pick<StepDef, 'id' | 'name' | 'layer'>; result: StepResult }>;
  passed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
}

// ============================================================================
// Step Runner Interface
// ============================================================================

export interface StepRunner<TContext extends BaseTestContext = BaseTestContext> {
  runStep(ctx: TContext, stepId: string): Promise<StepResult>;
  runFromStep(ctx: TContext, startStepId: string): Promise<SuiteResult>;
  runAll(ctx: TContext): Promise<SuiteResult>;
  getReport(): SuiteResult;
}

// ============================================================================
// Step Runner Configuration
// ============================================================================

export interface StepRunnerConfig<TContext extends BaseTestContext = BaseTestContext> {
  steps: StepDef<TContext>[];
  skipLayer2Steps?: boolean;
  skipLayer3Steps?: boolean;
  onStepComplete?: (stepId: string, result: StepResult) => void;
}

// ============================================================================
// Base Test Context (re-exported for convenience — canonical source is base-context.ts)
// ============================================================================

// Forward reference — actual definition lives in base-context.ts
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export type { BaseTestContext } from './base-context';
