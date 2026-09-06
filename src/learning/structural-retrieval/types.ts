export type StructuralTransformation =
  | 'rename'
  | 'framework-transfer'
  | 'reordered-steps'
  | 'distractor-terminology'
  | 'cross-domain-transfer';

export type CorpusSplit = 'train' | 'calibration' | 'audit';

export interface StructuralPattern {
  id: string;
  familyId: string;
  framework: string;
  domain: string;
  failureMechanism: string;
  invariant: string;
  actions: string[];
  oracle: string;
  text: string;
}

export interface StructuralRetrievalQuery {
  id: string;
  familyId: string;
  split: CorpusSplit;
  transformation: StructuralTransformation;
  text: string;
  relevantPatternIds: string[];
  mustNotRankAbove: Array<{ lowerPatternId: string; higherPatternId: string }>;
}

export interface StructuralRetrievalCorpus {
  schemaVersion: 'aqe-structural-retrieval/v1';
  corpusRevision: string;
  lineageHash: string;
  patterns: StructuralPattern[];
  queries: StructuralRetrievalQuery[];
}

export interface RankedCandidate {
  patternId: string;
  score: number;
}

export type RetrievalDiagnostic =
  | 'success'
  | 'not_retrieved'
  | 'retrieved_misranked'
  | 'ranked_not_used'
  | 'used_no_benefit';

export interface QueryRetrievalResult {
  queryId: string;
  candidates: RankedCandidate[];
  appliedPatternIds?: string[];
  outcomeImproved?: boolean;
}

export interface MetricEstimate {
  value: number;
  confidenceInterval: { lower: number; upper: number; level: 0.95 };
}

export interface RetrievalMetricSet {
  support: number;
  recallAtK: MetricEstimate;
  hitAt1: MetricEstimate;
  mrr: MetricEstimate;
  ndcg: MetricEstimate;
  top1Margin: MetricEstimate;
}

export interface StructuralRetrievalReport {
  corpusRevision: string;
  corpusLineageHash: string;
  rankerVersion: string;
  k: number;
  overall: RetrievalMetricSet;
  slices: Partial<Record<StructuralTransformation, RetrievalMetricSet>>;
  diagnostics: Record<RetrievalDiagnostic, number>;
  relationViolations: number;
}

export interface RetrievalReceipt {
  schemaVersion: 'aqe-retrieval-receipt/v1';
  receiptId: string;
  revision: string;
  queryId: string;
  queryRepresentationVersion: string;
  embeddingSpaceId: string;
  rankerVersion: string;
  candidates: RankedCandidate[];
  appliedPatternIds: string[];
  outcomeRef: string | null;
  outcomeImproved: boolean | null;
}
