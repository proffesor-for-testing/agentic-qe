import { createHash } from 'node:crypto';
import type {
  CorpusSplit,
  StructuralPattern,
  StructuralRetrievalCorpus,
  StructuralRetrievalQuery,
  StructuralTransformation,
} from './types.js';

const REVISION = 'aqe-structural-transfer-2026-09-06';
const TRANSFORMATIONS: StructuralTransformation[] = [
  'rename', 'framework-transfer', 'reordered-steps',
  'distractor-terminology', 'cross-domain-transfer',
];

interface FamilySeed {
  mechanism: string;
  invariant: string;
  action: string;
  wrongAction: string;
  oracle: string;
  domain: string;
  framework: string;
}

const SEEDS: FamilySeed[] = [
  ['async-race', 'observe completion before assertion', 'await the operation', 'increase the timeout', 'completion probe', 'unit', 'vitest'],
  ['stale-cache', 'invalidate on every state mutation', 'invalidate the cache', 'retry the read', 'freshness assertion', 'integration', 'redis'],
  ['transaction-leak', 'rollback isolates each test', 'rollback the transaction', 'truncate a shared table', 'row-count check', 'database', 'postgres'],
  ['clock-skew', 'compare times in one clock domain', 'inject a monotonic clock', 'widen the time window', 'clock boundary check', 'unit', 'node'],
  ['event-loss', 'subscribe before publishing', 'register the listener first', 'publish twice', 'delivery assertion', 'events', 'eventemitter'],
  ['resource-leak', 'release resources on every exit', 'close in a finally block', 'raise the pool limit', 'handle-count check', 'integration', 'playwright'],
  ['eventual-consistency', 'poll the observable state', 'poll with a bounded deadline', 'sleep for a fixed delay', 'state convergence', 'distributed', 'kubernetes'],
  ['identity-confusion', 'compare canonical identities', 'normalize the identifier', 'use display names', 'identity equality', 'security', 'oauth'],
  ['partial-write', 'publish only complete state', 'commit through an atomic swap', 'ignore missing fields', 'atomicity check', 'filesystem', 'node'],
  ['order-dependence', 'tests start from isolated state', 'reset state in setup', 'force alphabetical order', 'shuffle repeat', 'unit', 'jest'],
  ['schema-drift', 'validate at the boundary', 'reject the incompatible schema', 'cast the payload', 'schema validator', 'api', 'zod'],
  ['backpressure-loss', 'producer respects consumer capacity', 'await the drain signal', 'increase buffer memory', 'loss counter', 'performance', 'streams'],
  ['retry-duplication', 'retries preserve idempotency', 'attach an idempotency key', 'disable all retries', 'duplicate detector', 'api', 'fetch'],
  ['permission-bypass', 'authorization precedes mutation', 'check permission before write', 'hide the user interface', 'denial assertion', 'security', 'express'],
  ['encoding-mismatch', 'encode and decode with one charset', 'set UTF-8 explicitly', 'strip non-ASCII text', 'round-trip equality', 'api', 'json'],
  ['pagination-gap', 'cursor advances from the last item', 'use the returned cursor', 'increase page size', 'set equality', 'api', 'graphql'],
  ['cancellation-leak', 'cancellation propagates to children', 'forward the abort signal', 'wait for natural completion', 'abort observation', 'integration', 'abortcontroller'],
  ['floating-point-boundary', 'compare numeric results by tolerance', 'use an error bound', 'round every input', 'relative-error check', 'unit', 'vitest'],
  ['locale-dependence', 'format under an explicit locale', 'pass the locale explicitly', 'update the snapshot locally', 'multi-locale check', 'ui', 'intl'],
  ['lock-starvation', 'lock acquisition remains fair', 'queue lock waiters', 'raise retry count', 'bounded-wait check', 'concurrency', 'mutex'],
].map(([mechanism, invariant, action, wrongAction, oracle, domain, framework]) => ({
  mechanism, invariant, action, wrongAction, oracle, domain, framework,
}));

function splitFor(index: number): CorpusSplit {
  if (index < 12) return 'train';
  if (index < 16) return 'calibration';
  return 'audit';
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function queryText(seed: FamilySeed, transformation: StructuralTransformation, index: number): string {
  const object = `component-${index + 41}`;
  switch (transformation) {
    case 'rename': return `${object} intermittently fails; ensure ${seed.invariant} by applying: ${seed.action}`;
    case 'framework-transfer': return `In an alternative runtime, ${seed.mechanism} appears. Preserve this rule: ${seed.invariant}`;
    case 'reordered-steps': return `Verify with ${seed.oracle}; first arrange the fixture, then ${seed.action}; fault: ${seed.mechanism}`;
    case 'distractor-terminology': return `${seed.wrongAction} is tempting for ${seed.mechanism}, but the required invariant is ${seed.invariant}`;
    case 'cross-domain-transfer': return `A ${seed.domain} workflow moved to service-${index}; reuse the mechanism ${seed.mechanism} and ${seed.action}`;
  }
}

export function createStructuralRetrievalCorpus(): StructuralRetrievalCorpus {
  const patterns: StructuralPattern[] = [];
  const queries: StructuralRetrievalQuery[] = [];
  SEEDS.forEach((seed, index) => {
    const familyId = `family-${String(index + 1).padStart(2, '0')}`;
    const correctId = `${familyId}-structural`;
    const distractorId = `${familyId}-surface-distractor`;
    const counterexampleId = `${familyId}-counterexample`;
    patterns.push(
      { id: correctId, familyId, framework: seed.framework, domain: seed.domain,
        failureMechanism: seed.mechanism, invariant: seed.invariant, actions: [seed.action], oracle: seed.oracle,
        text: `${seed.framework} ${seed.domain} ${seed.mechanism}: ${seed.action}; verify ${seed.oracle}` },
      { id: distractorId, familyId, framework: seed.framework, domain: seed.domain,
        failureMechanism: `symptom resembling ${seed.mechanism}`, invariant: 'mask the observed symptom',
        actions: [seed.wrongAction], oracle: 'single rerun',
        text: `${seed.framework} ${seed.domain} ${seed.mechanism}: ${seed.wrongAction}; quick ${seed.oracle}` },
      { id: counterexampleId, familyId, framework: seed.framework, domain: seed.domain,
        failureMechanism: seed.mechanism, invariant: `environment forbids ${seed.action}`,
        actions: [`escalate instead of ${seed.action}`], oracle: 'environment constraint check',
        text: `${seed.mechanism} ${seed.action} ${seed.framework}, but environment forbids the action` },
    );
    TRANSFORMATIONS.forEach((transformation) => queries.push({
      id: `${familyId}-${transformation}`,
      familyId,
      split: splitFor(index),
      transformation,
      text: queryText(seed, transformation, index),
      relevantPatternIds: [correctId],
      mustNotRankAbove: [
        { lowerPatternId: distractorId, higherPatternId: correctId },
        { lowerPatternId: counterexampleId, higherPatternId: correctId },
      ],
    }));
  });
  const payload = { schemaVersion: 'aqe-structural-retrieval/v1' as const, corpusRevision: REVISION, patterns, queries };
  return deepFreeze({ ...payload, lineageHash: stableHash(payload) });
}

export const STRUCTURAL_RETRIEVAL_TRANSFORMATIONS = Object.freeze([...TRANSFORMATIONS]);

export function verifyStructuralRetrievalCorpus(corpus: StructuralRetrievalCorpus): boolean {
  const { lineageHash: _lineageHash, ...payload } = corpus;
  return stableHash(payload) === corpus.lineageHash;
}
