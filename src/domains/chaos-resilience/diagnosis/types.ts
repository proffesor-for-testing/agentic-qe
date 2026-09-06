export const AGENT_FAULT_TRACE_SCHEMA_VERSION = '1.0.0' as const;
export const AGENT_FAULT_CORPUS_SCHEMA_VERSION = '1.0.0' as const;

export type AgentRuntimeBoundary = 'tool' | 'model-context' | 'guardrail' | 'inter-agent' | 'control';

export type AgentRuntimeFaultType =
  | 'none'
  | 'tool-unavailable'
  | 'tool-timeout'
  | 'corrupted-tool-output'
  | 'context-truncation'
  | 'delegation-timeout'
  | 'agent-misroute'
  | 'delegation-loop'
  | 'guardrail-bypass';

export type TraceSpanKind = 'run' | 'agent' | 'delegation' | 'tool' | 'model' | 'guardrail';
export type TraceSpanStatus = 'ok' | 'error' | 'timeout' | 'cancelled';

export interface SanitizedTraceSpan {
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly componentId: string;
  readonly kind: TraceSpanKind;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly status: TraceSpanStatus;
  readonly signalCode?: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly intendedDestination?: string;
  readonly actualDestination?: string;
  readonly policyRef?: string;
  readonly expectedDecision?: 'allow' | 'deny';
  readonly actualDecision?: 'allow' | 'deny';
  readonly retry?: number;
  readonly recovered?: boolean;
}

export interface SanitizedExecutionTrace {
  readonly schemaVersion: typeof AGENT_FAULT_TRACE_SCHEMA_VERSION;
  readonly runId: string;
  readonly taskId: string;
  readonly harnessRevision: string;
  readonly terminalOutcome: 'completed' | 'failed' | 'cancelled';
  readonly spans: readonly SanitizedTraceSpan[];
}

export interface StructuredTraceView {
  readonly schemaVersion: typeof AGENT_FAULT_TRACE_SCHEMA_VERSION;
  readonly runId: string;
  readonly taskId: string;
  readonly terminalOutcome: SanitizedExecutionTrace['terminalOutcome'];
  readonly spans: readonly SanitizedTraceSpan[];
}

export interface AgentFaultDetectorInput {
  readonly trace: SanitizedExecutionTrace;
  readonly structured: StructuredTraceView;
  readonly cleanReference?: StructuredTraceView;
}

export interface AgentFaultInjectionManifest {
  readonly schemaVersion: typeof AGENT_FAULT_CORPUS_SCHEMA_VERSION;
  readonly caseId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly sourceRevision: string;
  readonly environmentDigest: string;
  readonly seed: number;
  readonly target: {
    readonly boundary: AgentRuntimeBoundary;
    readonly componentId: string;
    readonly spanId: string;
  };
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly expectedObservableSignal: string;
  readonly cleanup: {
    readonly required: boolean;
    readonly state: 'not-required' | 'verified';
    readonly witness: string;
  };
}

export interface AgentFaultGroundTruth {
  readonly faultType: AgentRuntimeFaultType;
  readonly boundary: AgentRuntimeBoundary;
  readonly componentId: string;
  readonly spanId: string;
}

export interface AgentFaultCorpusCase {
  readonly caseId: string;
  readonly cleanReferenceId?: string;
  readonly detectorInput: AgentFaultDetectorInput;
  /** Held outside detectorInput. Callers must not pass this object to detectors. */
  readonly heldOut: {
    readonly manifest: AgentFaultInjectionManifest;
    readonly truth: AgentFaultGroundTruth;
  };
}

export interface AgentFaultCorpusManifest {
  readonly schemaVersion: typeof AGENT_FAULT_CORPUS_SCHEMA_VERSION;
  readonly corpusId: string;
  readonly sourceRevision: string;
  readonly harnessRevision: string;
  readonly caseCount: number;
  readonly casesDigest: string;
  readonly mixedFaults: 'out-of-scope';
  readonly detectorInputExcludes: readonly string[];
}

export interface AgentFaultCorpus {
  readonly manifest: AgentFaultCorpusManifest;
  readonly cases: readonly AgentFaultCorpusCase[];
}

export interface RankedFaultCandidate {
  readonly faultType: AgentRuntimeFaultType;
  readonly boundary: AgentRuntimeBoundary;
  readonly componentId: string;
  readonly spanId: string;
  readonly confidence: number;
}

export interface AgentFaultDiagnosis {
  readonly caseId: string;
  readonly status: 'diagnosed' | 'abstained' | 'parse-error';
  readonly candidates: readonly RankedFaultCandidate[];
  readonly signalObserved: boolean;
  readonly latencyMs: number;
  readonly tokens?: number;
  readonly cost?: number;
  readonly reason?: string;
}

export interface AgentFaultDetector {
  readonly id: string;
  diagnose(caseId: string, input: AgentFaultDetectorInput): AgentFaultDiagnosis;
}

export interface AgentFaultCaseScore {
  readonly caseId: string;
  readonly faultType: AgentRuntimeFaultType;
  readonly boundary: AgentRuntimeBoundary;
  readonly faultInjected: boolean;
  readonly signalObserved: boolean;
  readonly detected: boolean;
  readonly typeCorrect: boolean;
  readonly componentLocalized: boolean;
  readonly spanLocalized: boolean;
  readonly jointCorrect: boolean;
  readonly recovered: boolean;
  readonly taskSucceeded: boolean;
  readonly abstained: boolean;
}

export interface AgentFaultSliceScore {
  readonly support: number;
  readonly detected: number;
  readonly typeTop1: number;
  readonly componentTop1: number;
  readonly jointTop1: number;
  readonly abstentions: number;
}

export interface AgentFaultScoreReport {
  readonly detectorId: string;
  readonly corpusId: string;
  readonly support: number;
  readonly noFault: { readonly precision: number; readonly recall: number; readonly falsePositiveRate: number };
  readonly faultRecall: number;
  readonly typeTop1: number;
  readonly typeTopK: number;
  readonly componentTop1: number;
  readonly exactSpanTop1: number;
  readonly jointTop1: number;
  readonly parseRate: number;
  readonly abstentionRate: number;
  readonly meanLatencyMs: number;
  readonly totalTokens: number;
  readonly totalCost: number;
  readonly uncertainty: { readonly method: 'wilson-95'; readonly faultRecall: readonly [number, number] };
  readonly byFault: Readonly<Record<string, AgentFaultSliceScore>>;
  readonly byBoundary: Readonly<Record<string, AgentFaultSliceScore>>;
  readonly cases: readonly AgentFaultCaseScore[];
}
