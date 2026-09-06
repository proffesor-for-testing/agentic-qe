import { describe, expect, it } from 'vitest';
import {
  createAgentFaultDiagnosisCorpus,
  directSignalBaseline,
  majorityFaultDetector,
  qualifyAgentFaultDetector,
  referenceAwareAqeDetector,
  scoreAgentFaultDetector,
  serializeDetectorInput,
} from '../../../../src/domains/chaos-resilience/diagnosis/index.js';

describe('agent runtime fault diagnosis corpus', () => {
  it('freezes paired clean/fault traces across every required boundary and fault', () => {
    const corpus = createAgentFaultDiagnosisCorpus();
    const faults = corpus.cases.filter((item) => item.heldOut.truth.faultType !== 'none');

    expect(corpus.manifest.caseCount).toBe(16);
    expect(new Set(faults.map((item) => item.heldOut.truth.boundary))).toEqual(
      new Set(['tool', 'model-context', 'guardrail', 'inter-agent']),
    );
    expect(new Set(faults.map((item) => item.heldOut.truth.faultType))).toEqual(new Set([
      'tool-unavailable', 'tool-timeout', 'corrupted-tool-output', 'context-truncation',
      'delegation-timeout', 'agent-misroute', 'delegation-loop', 'guardrail-bypass',
    ]));
    for (const item of faults) {
      const clean = corpus.cases.find((candidate) => candidate.caseId === item.cleanReferenceId);
      expect(clean).toBeDefined();
      expect(clean?.detectorInput.trace.taskId).toBe(item.detectorInput.trace.taskId);
      expect(item.heldOut.manifest.cleanup).toEqual({
        required: false, state: 'not-required', witness: 'synthetic fixture; no side effects',
      });
    }
    expect(createAgentFaultDiagnosisCorpus().manifest).toEqual(corpus.manifest);
  });

  it('keeps provenance and ground truth outside sanitized detector inputs', () => {
    const corpus = createAgentFaultDiagnosisCorpus();
    const forbiddenKeys = [
      'heldOut', 'manifest', 'truth', 'faultType', 'boundary', 'expectedObservableSignal',
      'sourceRevision', 'environmentDigest', 'parameters', 'seed', 'caseId',
    ];

    for (const item of corpus.cases) {
      const serialized = serializeDetectorInput(item.detectorInput);
      for (const key of forbiddenKeys) expect(serialized).not.toContain(`"${key}"`);
      expect(serialized).not.toContain(item.caseId);
      expect(item.caseId).toMatch(/^case-\d{3}-[ab]$/);
      for (const span of item.detectorInput.trace.spans) {
        expect(span.inputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(span.outputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(span).not.toHaveProperty('input');
        expect(span).not.toHaveProperty('output');
      }
    }
  });

  it('reports the full metric surface and separates runtime outcomes', () => {
    const corpus = createAgentFaultDiagnosisCorpus();
    const report = scoreAgentFaultDetector(corpus, referenceAwareAqeDetector);

    expect(report.noFault).toEqual({ precision: 1, recall: 1, falsePositiveRate: 0 });
    expect(report.faultRecall).toBe(1);
    expect(report.typeTop1).toBe(1);
    expect(report.typeTopK).toBe(1);
    expect(report.componentTop1).toBe(1);
    expect(report.exactSpanTop1).toBe(1);
    expect(report.jointTop1).toBe(1);
    expect(report.parseRate).toBe(1);
    expect(report.byFault['guardrail-bypass']?.support).toBe(1);
    expect(report.byBoundary.tool?.support).toBe(3);
    expect(report.byBoundary.control?.support).toBe(8);
    expect(report.uncertainty.method).toBe('wilson-95');
    const corruption = corpus.cases.find((item) => item.heldOut.truth.faultType === 'corrupted-tool-output')!;
    expect(report.cases.find((item) => item.caseId === corruption.caseId)).toMatchObject({
      faultInjected: true, signalObserved: true, detected: true, recovered: false, taskSucceeded: true,
    });
    expect(qualifyAgentFaultDetector(report)).toEqual({ passed: true, failures: [] });
  });

  it('abstains on silent corruption without a qualified reference interpretation', () => {
    const corpus = createAgentFaultDiagnosisCorpus();
    const item = corpus.cases.find(
      (candidate) => candidate.heldOut.truth.faultType === 'corrupted-tool-output',
    )!;
    expect(directSignalBaseline.diagnose(item.caseId, item.detectorInput)).toMatchObject({
      status: 'abstained', candidates: [],
    });
  });

  it('rejects an always-majority fault detector', () => {
    const report = scoreAgentFaultDetector(createAgentFaultDiagnosisCorpus(), majorityFaultDetector);
    const qualification = qualifyAgentFaultDetector(report);

    expect(qualification.passed).toBe(false);
    expect(report.noFault.falsePositiveRate).toBe(1);
    expect(report.typeTop1).toBeLessThan(0.5);
    expect(qualification.failures).toContain('no-fault false-positive rate exceeds 10%');
  });

  it('retains throwing detectors as parse failures instead of dropping cases', () => {
    const report = scoreAgentFaultDetector(createAgentFaultDiagnosisCorpus(), {
      id: 'throwing-detector',
      diagnose: () => { throw new Error('malformed output'); },
    });

    expect(report.support).toBe(16);
    expect(report.parseRate).toBe(0);
    expect(report.cases).toHaveLength(16);
    expect(qualifyAgentFaultDetector(report).failures).toContain(
      'detector did not parse every frozen case',
    );
  });
});
