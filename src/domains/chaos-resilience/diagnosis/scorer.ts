import type {
  AgentFaultCaseScore,
  AgentFaultCorpus,
  AgentFaultDiagnosis,
  AgentFaultDetector,
  AgentFaultScoreReport,
  AgentFaultSliceScore,
} from './types.js';

const ratio = (numerator: number, denominator: number): number => denominator === 0 ? 0 : numerator / denominator;

function wilson95(successes: number, total: number): readonly [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function scoreAgentFaultDetector(
  corpus: AgentFaultCorpus,
  detector: AgentFaultDetector,
  topK = 3,
): AgentFaultScoreReport {
  const diagnoses = new Map<string, AgentFaultDiagnosis>();
  for (const item of corpus.cases) diagnoses.set(item.caseId, runDetector(detector, item.caseId, item.detectorInput));

  const cases: AgentFaultCaseScore[] = corpus.cases.map((item) => {
    const diagnosis = diagnoses.get(item.caseId)!;
    const truth = item.heldOut.truth;
    const top = diagnosis.candidates[0];
    const injected = truth.faultType !== 'none';
    const predictedFault = Boolean(top && top.faultType !== 'none');
    return {
      caseId: item.caseId,
      faultType: truth.faultType,
      boundary: truth.boundary,
      faultInjected: injected,
      signalObserved: diagnosis.signalObserved,
      detected: injected ? predictedFault : !predictedFault,
      typeCorrect: top?.faultType === truth.faultType,
      componentLocalized: top?.componentId === truth.componentId,
      spanLocalized: top?.spanId === truth.spanId,
      jointCorrect: top?.faultType === truth.faultType && top?.componentId === truth.componentId,
      recovered: item.detectorInput.structured.spans.some((span) => span.recovered),
      taskSucceeded: item.detectorInput.structured.terminalOutcome === 'completed',
      abstained: diagnosis.status === 'abstained',
    };
  });

  const faulty = corpus.cases.filter((item) => item.heldOut.truth.faultType !== 'none');
  const clean = corpus.cases.filter((item) => item.heldOut.truth.faultType === 'none');
  const faultyScores = cases.filter((item) => item.faultInjected);
  const cleanScores = cases.filter((item) => !item.faultInjected);
  const predictedClean = corpus.cases.filter((item) => diagnoses.get(item.caseId)?.candidates[0]?.faultType === 'none');
  const trueCleanPredictions = predictedClean.filter((item) => item.heldOut.truth.faultType === 'none');
  const typeTopKCorrect = faulty.filter((item) => diagnoses.get(item.caseId)?.candidates
    .slice(0, topK).some((candidate) => candidate.faultType === item.heldOut.truth.faultType)).length;
  const parsed = [...diagnoses.values()].filter((item) => item.status !== 'parse-error').length;
  const abstained = [...diagnoses.values()].filter((item) => item.status === 'abstained').length;

  return {
    detectorId: detector.id,
    corpusId: corpus.manifest.corpusId,
    support: cases.length,
    noFault: {
      precision: ratio(trueCleanPredictions.length, predictedClean.length),
      recall: ratio(cleanScores.filter((item) => item.typeCorrect).length, clean.length),
      falsePositiveRate: ratio(cleanScores.filter((item) => !item.typeCorrect).length, clean.length),
    },
    faultRecall: ratio(faultyScores.filter((item) => item.detected).length, faulty.length),
    typeTop1: ratio(faultyScores.filter((item) => item.typeCorrect).length, faulty.length),
    typeTopK: ratio(typeTopKCorrect, faulty.length),
    componentTop1: ratio(faultyScores.filter((item) => item.componentLocalized).length, faulty.length),
    exactSpanTop1: ratio(faultyScores.filter((item) => item.spanLocalized).length, faulty.length),
    jointTop1: ratio(faultyScores.filter((item) => item.jointCorrect).length, faulty.length),
    parseRate: ratio(parsed, cases.length),
    abstentionRate: ratio(abstained, cases.length),
    meanLatencyMs: ratio([...diagnoses.values()].reduce((sum, item) => sum + item.latencyMs, 0), cases.length),
    totalTokens: [...diagnoses.values()].reduce((sum, item) => sum + (item.tokens ?? 0), 0),
    totalCost: [...diagnoses.values()].reduce((sum, item) => sum + (item.cost ?? 0), 0),
    uncertainty: { method: 'wilson-95', faultRecall: wilson95(faultyScores.filter((item) => item.detected).length, faulty.length) },
    byFault: slice(corpus, cases, (index) => corpus.cases[index]!.heldOut.truth.faultType),
    byBoundary: slice(corpus, cases, (index) => corpus.cases[index]!.heldOut.truth.boundary),
    cases,
  };
}

function slice(
  corpus: AgentFaultCorpus,
  scores: readonly AgentFaultCaseScore[],
  key: (index: number) => string,
): Readonly<Record<string, AgentFaultSliceScore>> {
  const groups = new Map<string, AgentFaultCaseScore[]>();
  scores.forEach((score, index) => groups.set(key(index), [...(groups.get(key(index)) ?? []), score]));
  return Object.fromEntries([...groups.entries()].map(([name, items]) => [name, {
    support: items.length,
    detected: items.filter((item) => item.detected).length,
    typeTop1: items.filter((item) => item.typeCorrect).length,
    componentTop1: items.filter((item) => item.componentLocalized).length,
    jointTop1: items.filter((item) => item.jointCorrect).length,
    abstentions: items.filter((item) => item.abstained).length,
  }]));
}

export interface AgentFaultQualification {
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export function qualifyAgentFaultDetector(report: AgentFaultScoreReport): AgentFaultQualification {
  const failures: string[] = [];
  if (report.noFault.falsePositiveRate > 0.1) failures.push('no-fault false-positive rate exceeds 10%');
  if (report.typeTop1 < 0.5) failures.push('fault-type top-1 accuracy is below 50%');
  if (report.jointTop1 < 0.5) failures.push('joint type/location accuracy is below 50%');
  if (report.parseRate < 1) failures.push('detector did not parse every frozen case');
  for (const critical of ['corrupted-tool-output', 'guardrail-bypass']) {
    const score = report.cases.find((item) => item.faultType === critical);
    if (score && !score.typeCorrect && !score.abstained) {
      failures.push(`${critical} must be diagnosed correctly or explicitly abstained`);
    }
  }
  return { passed: failures.length === 0, failures };
}

function runDetector(
  detector: AgentFaultDetector,
  caseId: string,
  input: Parameters<AgentFaultDetector['diagnose']>[1],
): AgentFaultDiagnosis {
  try {
    const result = detector.diagnose(caseId, input);
    const validStatus = ['diagnosed', 'abstained', 'parse-error'].includes(result.status);
    const validCandidates = Array.isArray(result.candidates)
      && result.candidates.every((item) => Number.isFinite(item.confidence)
        && item.confidence >= 0 && item.confidence <= 1);
    if (result.caseId !== caseId || !validStatus || !validCandidates
      || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
      throw new Error('Detector returned an invalid diagnosis envelope');
    }
    return result;
  } catch (error) {
    return {
      caseId,
      status: 'parse-error',
      candidates: [],
      signalObserved: false,
      latencyMs: 0,
      reason: error instanceof Error ? error.message : 'Detector failed',
    };
  }
}
