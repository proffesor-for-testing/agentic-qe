/**
 * ADR-105 evidence-class gating policy in the validation pipeline.
 *
 * Policy under test: only EXECUTED/STATIC findings may block; INFERRED is
 * queued in needsVerification (ADR-102 dispatch surface) and downgrades to
 * warn; CONJECTURE never gates; a failed blocking step without gating
 * evidence must never read as a clean pass.
 */
import { describe, it, expect } from 'vitest';
import {
  runPipeline,
  type Finding,
  type ValidationStep,
  type EvidenceClass,
} from '../../../src/validation/pipeline.js';

function finding(evidenceClass: EvidenceClass, id = `f-${evidenceClass}`): Finding {
  return {
    id,
    stepId: 'step-under-test',
    severity: 'critical',
    evidenceClass,
    title: `${evidenceClass} finding`,
    description: 'fixture finding',
  };
}

function failingBlockingStep(findings: Finding[]): ValidationStep {
  return {
    id: 'step-under-test',
    name: 'Failing blocking step',
    category: 'quality',
    severity: 'blocking',
    async execute() {
      return {
        stepId: 'step-under-test',
        stepName: 'Failing blocking step',
        status: 'fail' as const,
        score: 0,
        findings,
        evidence: ['fixture'],
        duration: 1,
      };
    },
  };
}

const passingStep: ValidationStep = {
  id: 'passing-step',
  name: 'Passing step',
  category: 'quality',
  severity: 'blocking',
  async execute() {
    return {
      stepId: 'passing-step',
      stepName: 'Passing step',
      status: 'pass' as const,
      score: 100,
      findings: [],
      evidence: ['fixture'],
      duration: 1,
    };
  },
};

function pipelineWith(steps: ValidationStep[]) {
  return runPipeline({ id: 'adr105-test', name: 'ADR-105 gating', steps }, 'content');
}

describe('ADR-105 evidence-class gating', () => {
  it('should_failAndHalt_when_blockingStepHasExecutedFinding', async () => {
    const result = await pipelineWith([failingBlockingStep([finding('EXECUTED')]), passingStep]);
    expect({ overall: result.overall, halted: result.halted, blockers: result.blockers.length })
      .toEqual({ overall: 'fail', halted: true, blockers: 1 });
  });

  it('should_gateOnStatic_when_blockingStepHasStaticFinding', async () => {
    const result = await pipelineWith([failingBlockingStep([finding('STATIC')])]);
    expect(result.overall).toBe('fail');
  });

  it('should_warnAndQueue_when_blockingStepFailsOnInferredOnly', async () => {
    const result = await pipelineWith([failingBlockingStep([finding('INFERRED')]), passingStep]);
    expect({
      overall: result.overall,
      halted: result.halted,
      blockers: result.blockers.length,
      queued: result.needsVerification.length,
    }).toEqual({ overall: 'warn', halted: false, blockers: 0, queued: 1 });
  });

  it('should_notHalt_when_inferredOnlyFailure_soLaterStepsStillRun', async () => {
    const result = await pipelineWith([failingBlockingStep([finding('INFERRED')]), passingStep]);
    expect(result.steps.map(s => s.stepId)).toEqual(['step-under-test', 'passing-step']);
  });

  it('should_neverGateOrQueue_when_findingsAreConjectureOnly', async () => {
    const result = await pipelineWith([failingBlockingStep([finding('CONJECTURE')])]);
    expect({ blockers: result.blockers.length, queued: result.needsVerification.length })
      .toEqual({ blockers: 0, queued: 0 });
  });

  it('should_atLeastWarn_when_blockingStepFailsWithoutGatingEvidence', async () => {
    // The conjecture-only failure must never read as a clean pass.
    const result = await pipelineWith([failingBlockingStep([finding('CONJECTURE')])]);
    expect(result.overall).toBe('warn');
  });

  it('should_blockOnVerifiedAndQueueInferred_when_evidenceMixed', async () => {
    const result = await pipelineWith([
      failingBlockingStep([finding('EXECUTED', 'f1'), finding('INFERRED', 'f2')]),
    ]);
    expect({
      overall: result.overall,
      blockerIds: result.blockers.map(f => f.id),
      queuedIds: result.needsVerification.map(f => f.id),
    }).toEqual({ overall: 'fail', blockerIds: ['f1'], queuedIds: ['f2'] });
  });

  it('should_passCleanly_when_allStepsPass', async () => {
    const result = await pipelineWith([passingStep]);
    expect({ overall: result.overall, queued: result.needsVerification.length })
      .toEqual({ overall: 'pass', queued: 0 });
  });
});
