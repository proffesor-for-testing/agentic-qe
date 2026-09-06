import { createHash } from 'node:crypto';
import {
  AGENT_FAULT_CORPUS_SCHEMA_VERSION,
  AGENT_FAULT_TRACE_SCHEMA_VERSION,
  type AgentFaultCorpus,
  type AgentFaultCorpusCase,
  type AgentFaultGroundTruth,
  type AgentRuntimeBoundary,
  type AgentRuntimeFaultType,
  type SanitizedExecutionTrace,
  type SanitizedTraceSpan,
  type StructuredTraceView,
} from './types.js';

const SOURCE_REVISION = 'fixture-source-v1';
const HARNESS_REVISION = 'agent-runtime-diagnosis-v1';
const ENVIRONMENT_DIGEST = sha256('synthetic-node-runtime-v1');

interface FaultFixture {
  readonly faultType: Exclude<AgentRuntimeFaultType, 'none'>;
  readonly boundary: Exclude<AgentRuntimeBoundary, 'control'>;
  readonly componentId: string;
  readonly spanId: string;
  readonly signal: string;
  readonly mutate: (span: SanitizedTraceSpan) => SanitizedTraceSpan;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function span(
  spanId: string,
  componentId: string,
  kind: SanitizedTraceSpan['kind'],
  parentSpanId?: string,
): SanitizedTraceSpan {
  const input = `input:${componentId}`;
  const output = `output:${componentId}`;
  return {
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    componentId,
    kind,
    startOffsetMs: kind === 'run' ? 0 : 10,
    durationMs: kind === 'run' ? 100 : 20,
    status: 'ok',
    inputBytes: Buffer.byteLength(input),
    outputBytes: Buffer.byteLength(output),
    inputHash: sha256(input),
    outputHash: sha256(output),
    recovered: false,
  };
}

function baseSpans(): SanitizedTraceSpan[] {
  return [
    span('run', 'workflow', 'run'),
    span('agent-primary', 'planner', 'agent', 'run'),
    { ...span('tool-weather', 'weather-tool', 'tool', 'agent-primary'), intendedDestination: 'weather-tool', actualDestination: 'weather-tool' },
    span('model-answer', 'reasoning-model', 'model', 'agent-primary'),
    { ...span('policy-check', 'safety-policy', 'guardrail', 'agent-primary'), policyRef: 'policy://safety/v1', expectedDecision: 'deny', actualDecision: 'deny' },
    { ...span('delegate-review', 'reviewer-agent', 'delegation', 'agent-primary'), intendedDestination: 'reviewer-agent', actualDestination: 'reviewer-agent' },
  ];
}

const FIXTURES: readonly FaultFixture[] = [
  { faultType: 'tool-unavailable', boundary: 'tool', componentId: 'weather-tool', spanId: 'tool-weather', signal: 'tool unavailable', mutate: (s) => ({ ...s, status: 'error', signalCode: 'TOOL_UNAVAILABLE', outputBytes: 0, outputHash: sha256('') }) },
  { faultType: 'tool-timeout', boundary: 'tool', componentId: 'weather-tool', spanId: 'tool-weather', signal: 'tool deadline exceeded', mutate: (s) => ({ ...s, status: 'timeout', signalCode: 'DEADLINE_EXCEEDED', durationMs: 5_000 }) },
  { faultType: 'corrupted-tool-output', boundary: 'tool', componentId: 'weather-tool', spanId: 'tool-weather', signal: 'output differs from aligned clean reference', mutate: (s) => ({ ...s, outputHash: sha256('plausible-but-wrong'), outputBytes: 19 }) },
  { faultType: 'context-truncation', boundary: 'model-context', componentId: 'reasoning-model', spanId: 'model-answer', signal: 'context truncated', mutate: (s) => ({ ...s, status: 'error', signalCode: 'CONTEXT_TRUNCATED', inputBytes: 131_072 }) },
  { faultType: 'delegation-timeout', boundary: 'inter-agent', componentId: 'reviewer-agent', spanId: 'delegate-review', signal: 'delegation deadline exceeded', mutate: (s) => ({ ...s, status: 'timeout', signalCode: 'DELEGATION_TIMEOUT', durationMs: 5_000 }) },
  { faultType: 'agent-misroute', boundary: 'inter-agent', componentId: 'reviewer-agent', spanId: 'delegate-review', signal: 'actual agent differs from intended agent', mutate: (s) => ({ ...s, actualDestination: 'billing-agent' }) },
  { faultType: 'delegation-loop', boundary: 'inter-agent', componentId: 'reviewer-agent', spanId: 'delegate-review', signal: 'delegation edge repeats', mutate: (s) => ({ ...s, retry: 4, signalCode: 'DELEGATION_REPEATED' }) },
  { faultType: 'guardrail-bypass', boundary: 'guardrail', componentId: 'safety-policy', spanId: 'policy-check', signal: 'policy oracle denies but runtime allows', mutate: (s) => ({ ...s, actualDecision: 'allow' }) },
];

function trace(runId: string, taskId: string, spans: readonly SanitizedTraceSpan[]): SanitizedExecutionTrace {
  return {
    schemaVersion: AGENT_FAULT_TRACE_SCHEMA_VERSION,
    runId,
    taskId,
    harnessRevision: HARNESS_REVISION,
    terminalOutcome: 'completed',
    spans,
  };
}

function structured(raw: SanitizedExecutionTrace): StructuredTraceView {
  return {
    schemaVersion: raw.schemaVersion,
    runId: raw.runId,
    taskId: raw.taskId,
    terminalOutcome: raw.terminalOutcome,
    spans: [...raw.spans].sort((a, b) => a.startOffsetMs - b.startOffsetMs || a.spanId.localeCompare(b.spanId)),
  };
}

function makeCase(
  caseId: string,
  runId: string,
  taskId: string,
  truth: AgentFaultGroundTruth,
  spans: readonly SanitizedTraceSpan[],
  cleanReference?: StructuredTraceView,
  cleanReferenceId?: string,
  expectedObservableSignal = 'no fault signal',
): AgentFaultCorpusCase {
  const raw = trace(runId, taskId, spans);
  return {
    caseId,
    ...(cleanReferenceId ? { cleanReferenceId } : {}),
    detectorInput: { trace: raw, structured: structured(raw), ...(cleanReference ? { cleanReference } : {}) },
    heldOut: {
      truth,
      manifest: {
        schemaVersion: AGENT_FAULT_CORPUS_SCHEMA_VERSION,
        caseId,
        runId,
        taskId,
        sourceRevision: SOURCE_REVISION,
        environmentDigest: ENVIRONMENT_DIGEST,
        seed: 649,
        target: { boundary: truth.boundary, componentId: truth.componentId, spanId: truth.spanId },
        parameters: { synthetic: true },
        expectedObservableSignal,
        cleanup: { required: false, state: 'not-required', witness: 'synthetic fixture; no side effects' },
      },
    },
  };
}

/** Frozen, synthetic corpus. Ground truth is never embedded in detectorInput. */
export function createAgentFaultDiagnosisCorpus(): AgentFaultCorpus {
  const cases: AgentFaultCorpusCase[] = [];
  FIXTURES.forEach((fixture, index) => {
    const ordinal = String(index + 1).padStart(3, '0');
    const taskId = `task-${ordinal}`;
    const cleanCaseId = `case-${ordinal}-a`;
    const cleanSpans = baseSpans();
    const cleanRaw = trace(`run-${ordinal}-a`, taskId, cleanSpans);
    const cleanView = structured(cleanRaw);
    const cleanTruth: AgentFaultGroundTruth = { faultType: 'none', boundary: 'control', componentId: 'workflow', spanId: 'run' };
    cases.push(makeCase(cleanCaseId, `run-${ordinal}-a`, taskId, cleanTruth, cleanSpans));

    const faultySpans = cleanSpans.map((item) => item.spanId === fixture.spanId ? fixture.mutate(item) : item);
    const truth: AgentFaultGroundTruth = {
      faultType: fixture.faultType,
      boundary: fixture.boundary,
      componentId: fixture.componentId,
      spanId: fixture.spanId,
    };
    cases.push(makeCase(
      `case-${ordinal}-b`,
      `run-${ordinal}-b`,
      taskId,
      truth,
      faultySpans,
      cleanView,
      cleanCaseId,
      fixture.signal,
    ));
  });
  const casesDigest = sha256(stable(cases.map(({ caseId, cleanReferenceId, detectorInput, heldOut }) => ({
    caseId, cleanReferenceId, detectorInput, heldOut,
  }))));
  return {
    manifest: {
      schemaVersion: AGENT_FAULT_CORPUS_SCHEMA_VERSION,
      corpusId: `aqe-agent-faults-${casesDigest.slice(0, 16)}`,
      sourceRevision: SOURCE_REVISION,
      harnessRevision: HARNESS_REVISION,
      caseCount: cases.length,
      casesDigest,
      mixedFaults: 'out-of-scope',
      detectorInputExcludes: ['injection manifest', 'ground-truth fault type', 'ground-truth location', 'fixture path'],
    },
    cases,
  };
}

export function serializeDetectorInput(input: AgentFaultCorpusCase['detectorInput']): string {
  return stable(input);
}
