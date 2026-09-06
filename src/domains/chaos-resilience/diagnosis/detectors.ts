import type {
  AgentFaultDetector,
  AgentFaultDiagnosis,
  AgentRuntimeBoundary,
  AgentRuntimeFaultType,
  RankedFaultCandidate,
  SanitizedTraceSpan,
} from './types.js';

interface RuleMatch {
  readonly faultType: Exclude<AgentRuntimeFaultType, 'none'>;
  readonly boundary: Exclude<AgentRuntimeBoundary, 'control'>;
  readonly confidence: number;
}

function directSignal(span: SanitizedTraceSpan): RuleMatch | undefined {
  if (span.signalCode === 'TOOL_UNAVAILABLE') return { faultType: 'tool-unavailable', boundary: 'tool', confidence: 1 };
  if (span.kind === 'tool' && span.status === 'timeout') return { faultType: 'tool-timeout', boundary: 'tool', confidence: 1 };
  if (span.signalCode === 'CONTEXT_TRUNCATED') return { faultType: 'context-truncation', boundary: 'model-context', confidence: 1 };
  if (span.kind === 'delegation' && span.status === 'timeout') return { faultType: 'delegation-timeout', boundary: 'inter-agent', confidence: 1 };
  if (span.kind === 'delegation' && span.intendedDestination !== span.actualDestination) {
    return { faultType: 'agent-misroute', boundary: 'inter-agent', confidence: 1 };
  }
  if (span.kind === 'delegation' && (span.retry ?? 0) >= 3) {
    return { faultType: 'delegation-loop', boundary: 'inter-agent', confidence: 0.95 };
  }
  return undefined;
}

function candidate(span: SanitizedTraceSpan, match: RuleMatch): RankedFaultCandidate {
  return {
    ...match,
    componentId: span.componentId,
    spanId: span.spanId,
  };
}

/** A transparent baseline limited to explicit runtime signals. */
export const directSignalBaseline: AgentFaultDetector = {
  id: 'direct-signal-v1',
  diagnose(caseId, input) {
    const candidates = input.structured.spans.flatMap((span) => {
      const match = directSignal(span);
      return match ? [candidate(span, match)] : [];
    });
    if (candidates.length > 0) return diagnosed(caseId, candidates);
    if (input.cleanReference && input.structured.spans.some((span) => {
      const clean = input.cleanReference?.spans.find((item) => item.spanId === span.spanId);
      return clean?.outputHash !== span.outputHash;
    })) return abstained(caseId, 'Output differs from reference but has no direct failure signal');
    if (input.structured.spans.every(isHealthy)) return healthy(caseId);
    return abstained(caseId, 'No qualified direct signal');
  },
};

/**
 * AQE reference-aware diagnosis. It adds paired-output comparison and a policy
 * oracle to the direct-signal baseline; neither source is a hidden fault label.
 */
export const referenceAwareAqeDetector: AgentFaultDetector = {
  id: 'aqe-reference-aware-v1',
  diagnose(caseId, input) {
    const direct = directSignalBaseline.diagnose(caseId, input);
    if (direct.status === 'diagnosed') return direct;

    for (const span of input.structured.spans) {
      if (span.kind === 'guardrail' && span.policyRef && span.expectedDecision && span.actualDecision
        && span.expectedDecision !== span.actualDecision) {
        return diagnosed(caseId, [candidate(span, {
          faultType: 'guardrail-bypass', boundary: 'guardrail', confidence: 1,
        })]);
      }
      if (span.kind === 'tool' && input.cleanReference) {
        const clean = input.cleanReference.spans.find((item) => item.spanId === span.spanId);
        if (clean && clean.outputHash !== span.outputHash) {
          return diagnosed(caseId, [candidate(span, {
            faultType: 'corrupted-tool-output', boundary: 'tool', confidence: 0.9,
          })]);
        }
      }
    }
    return direct;
  },
};

/** Negative-control detector used to prove majority-class guessing cannot pass. */
export const majorityFaultDetector: AgentFaultDetector = {
  id: 'always-tool-unavailable',
  diagnose(caseId, input) {
    const span = input.structured.spans.find((item) => item.kind === 'tool') ?? input.structured.spans[0];
    if (!span) return { ...abstained(caseId, 'Empty trace'), status: 'parse-error' };
    return diagnosed(caseId, [candidate(span, {
      faultType: 'tool-unavailable', boundary: 'tool', confidence: 1,
    })]);
  },
};

function isHealthy(span: SanitizedTraceSpan): boolean {
  return span.status === 'ok'
    && span.intendedDestination === span.actualDestination
    && (!(span.expectedDecision && span.actualDecision) || span.expectedDecision === span.actualDecision)
    && (span.retry ?? 0) < 3;
}

function diagnosed(caseId: string, candidates: readonly RankedFaultCandidate[]): AgentFaultDiagnosis {
  return { caseId, status: 'diagnosed', candidates, signalObserved: true, latencyMs: 0 };
}

function healthy(caseId: string): AgentFaultDiagnosis {
  return {
    caseId,
    status: 'diagnosed',
    candidates: [{
      faultType: 'none', boundary: 'control', componentId: 'workflow', spanId: 'run', confidence: 1,
    }],
    signalObserved: false,
    latencyMs: 0,
  };
}

function abstained(caseId: string, reason: string): AgentFaultDiagnosis {
  return { caseId, status: 'abstained', candidates: [], signalObserved: false, latencyMs: 0, reason };
}
