/**
 * ADR-118 corpus scorer — the REAL PolicyScorer wired into the QE-policy
 * flywheel. Verifies the two decision signals over an in-memory qe_patterns
 * corpus (never the real memory.db):
 *   - heldOut is a genuine self-retrieval MRR that a well-weighted policy wins;
 *   - anchorMean is the honest FLAT GUARD (constant across policies, >= 0.8);
 *   - the scorer plugs into runFlywheelGeneration and produces a verdict.
 *
 * The seed corpus is crafted so BODY tokens are the distinguishing signal: each
 * pattern owns a unique `topicN` in its BODY, but its NAME references the NEXT
 * pattern's topic. A body-favoring policy recovers each doc from its own body;
 * a subject-favoring policy is misled onto the neighbor that names that topic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createCorpusScorer } from '../../../src/learning/qe-flywheel/corpus-scorer.js';
import { runFlywheelGeneration } from '../../../src/learning/qe-flywheel/generation.js';
import { DEFAULT_POLICY, type RetrievalPolicy } from '../../../src/learning/qe-flywheel/policy.js';
import { createSigner } from '../../../src/learning/qe-flywheel/receipt.js';
import { loadAnchorSet, computeContentHash } from '../../../src/validation/anchor-set.js';

const ANCHOR_PATH = 'verification/anchors/qe-anchor-v1.json';
const CORPUS_SIZE = 12;

const SCHEMA = `
  CREATE TABLE qe_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    qe_domain TEXT NOT NULL,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    template_json TEXT,
    context_json TEXT
  );
`;

/**
 * Seed a corpus where the BODY is the distinguishing signal. Pattern i owns
 * `topic{i}` in its body; its NAME references `topic{(i+1) % N}` — so a query
 * built from pattern i's body (subject withheld) uniquely matches body i, but
 * the NAME carrying `topic{i}` belongs to the neighbor i-1.
 */
function seedCorpus(db: Database.Database, n = CORPUS_SIZE): void {
  const insert = db.prepare(
    `INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description)
     VALUES (?, 'test', 'test-generation', 'core', ?, ?)`,
  );
  for (let i = 0; i < n; i++) {
    const id = `p${String(i).padStart(2, '0')}`;
    const next = (i + 1) % n;
    // BODY: generic frame + this pattern's own distinctive topic token.
    const description = `this pattern covers topic${i} with details about topic${i} handling and edge cases`;
    // NAME (subject): generic frame + the NEXT pattern's topic token.
    const name = `test pattern for topic${next}`;
    insert.run(id, name, description);
  }
}

describe('createCorpusScorer — heldOut self-retrieval MRR', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedCorpus(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should_scoreBodyFavoringPolicyHigher_when_bodyIsTheDistinguishingSignal', () => {
    // Arrange: two policies differing only in where they put retrieval weight.
    const bodyFavoring: RetrievalPolicy = {
      alpha: 0.9,
      bodyWeight: 3,
      subjectWeight: 0.5,
      mmrLambda: 1,
      typePenaltyFactor: 0,
    };
    const subjectFavoring: RetrievalPolicy = {
      alpha: 0.1,
      bodyWeight: 0.5,
      subjectWeight: 3,
      mmrLambda: 1,
      typePenaltyFactor: 0,
    };
    const score = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });

    // Act
    const bodyHeldOut = score(bodyFavoring).heldOut;
    const subjectHeldOut = score(subjectFavoring).heldOut;

    // Assert: matching the corpus's true signal (body) recovers docs better.
    expect(bodyHeldOut).toBeGreaterThan(subjectHeldOut);
  });

  it('should_returnHeldOutWithinUnitInterval_when_scoringAnyPolicy', () => {
    // Arrange
    const score = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });

    // Act
    const { heldOut } = score(DEFAULT_POLICY);

    // Assert: MRR is a reciprocal-rank mean, always in [0, 1].
    expect(heldOut).toBeGreaterThanOrEqual(0);
    expect(heldOut).toBeLessThanOrEqual(1);
  });

  it('should_perfectlyRecoverEveryDoc_when_policyUsesOnlyTheBodyChannel', () => {
    // Arrange: pure body channel — every query recovers its own doc at rank 1.
    const pureBody: RetrievalPolicy = {
      alpha: 1,
      bodyWeight: 1,
      subjectWeight: 0,
      mmrLambda: 1,
      typePenaltyFactor: 0,
    };
    const score = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });

    // Act
    const { heldOut } = score(pureBody);

    // Assert: MRR == 1 exactly (each true doc ranks first).
    expect(heldOut).toBe(1);
  });

  it('should_returnZeroHeldOut_when_corpusIsEmpty', () => {
    // Arrange
    const empty = new Database(':memory:');
    empty.exec(SCHEMA);
    const score = createCorpusScorer({ db: empty, anchorPath: ANCHOR_PATH });

    // Act
    const { heldOut } = score(DEFAULT_POLICY);

    // Assert
    expect(heldOut).toBe(0);
    empty.close();
  });
});

describe('createCorpusScorer — anchor flat guard', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedCorpus(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should_holdAnchorMeanConstant_when_gradingTwoDifferentPolicies', () => {
    // Arrange: two policies that produce different heldOut scores.
    const policyA: RetrievalPolicy = { ...DEFAULT_POLICY, alpha: 0.9, bodyWeight: 3 };
    const policyB: RetrievalPolicy = { ...DEFAULT_POLICY, alpha: 0.1, subjectWeight: 3 };
    const score = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });

    // Act
    const a = score(policyA);
    const b = score(policyB);

    // Assert: the anchor is policy-independent — the honest flat floor.
    expect(a.anchorMean).toBe(b.anchorMean);
  });

  it('should_gradeAnchorMeanAtOrAboveHighBar_when_usingGoldReferenceTests', () => {
    // Arrange
    const score = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });

    // Act
    const { anchorMean } = score(DEFAULT_POLICY);

    // Assert: the ADR-117 "High" bar is 0.8; gold tests must clear it on the mean.
    expect(anchorMean).toBeGreaterThanOrEqual(0.8);
  });

  it('should_loadTheFrozenAnchorWithoutHashDrift_when_wired', () => {
    // Arrange / Act: loader throws on drift; a clean load proves the pin holds.
    const anchor = loadAnchorSet(ANCHOR_PATH);

    // Assert
    expect(anchor.items).toHaveLength(5);
    expect(computeContentHash(anchor.items)).toBe(anchor.contentHash);
  });
});

describe('createCorpusScorer — PolicyScorer integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedCorpus(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should_produceAVerdict_when_pluggedIntoRunFlywheelGeneration', async () => {
    // Arrange: a real scorer + a strong candidate (pure body channel beats default).
    const scorer = createCorpusScorer({ db, anchorPath: ANCHOR_PATH });
    const candidate: RetrievalPolicy = {
      alpha: 1,
      bodyWeight: 1,
      subjectWeight: 0,
      mmrLambda: 1,
      typePenaltyFactor: 0,
    };

    // Act
    const result = await runFlywheelGeneration({
      generation: 1,
      baseline: DEFAULT_POLICY,
      candidate,
      scorer,
      anchorHash: 'test-anchor-hash',
      anchorTol: 0,
      signer: createSigner('00'.repeat(32)),
    });

    // Assert: the scorer satisfies the PolicyScorer shape end-to-end.
    expect(['promote', 'reject']).toContain(result.verdict);
    expect(result.receipt.signature).toBeTruthy();
    expect(result.scores.candidate.heldOut).toBeGreaterThanOrEqual(0);
    expect(result.scores.candidate.anchorMean).toBeGreaterThanOrEqual(0.8);
  });
});
