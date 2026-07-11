/**
 * MMR scaling regression (ADR-118 corpus scorer) — FALSIFIABLE guard for the
 * O(n^3) greedy-MMR hang that the `MMR_POOL_SIZE` cap fixed.
 *
 * THE BUG CLASS: the held-out self-retrieval MRR reranks the candidate list with
 * greedy MMR, which is O(pool^2 * tokens) PER query and is run once PER pattern —
 * so an UNCAPPED pool makes the whole scoreHeldOut pass O(n^4) in corpus size. It
 * stayed green on the tiny (n=12) unit corpus but HUNG the live flywheel on the
 * real ~262-pattern corpus. The fix (`MMR_POOL_SIZE = 50` in corpus-scorer.ts)
 * reranks only the top-K by relevance and force-includes the true doc, bounding
 * the cost while leaving MRR unchanged.
 *
 * WHY THIS TARGETS corpus-scorer (not the createSemanticRetriever the brutal
 * review's note pointed at): the semantic retriever's inline MMR is bounded by
 * `topK` (early-stops after topK picks), so at n=300 it runs in ~tens of ms whether
 * or not anything is capped — an assertion on it would pass against the pre-fix
 * code too, i.e. it would be a NON-falsifiable (self-fulfilling) test. The cubic
 * blow-up that the MMR_POOL_SIZE cap actually fixes lives in corpus-scorer's
 * `scoreHeldOut` -> `rankMMR`, which drains the WHOLE pool per query. Measured on
 * this machine at n=300, one isolated scoreHeldOut pass: uncapped ~96,000ms vs
 * capped ~700ms — a ~140x gap and a genuine failure (via the 2000ms bound and the
 * vitest timeout) against the pre-fix code.
 *
 * $0 / no model / no network: an in-memory SQLite qe_patterns corpus + the real
 * frozen anchor (graded once by the local mutation oracle in the untimed warm-up,
 * then cached, so the TIMED call measures only the cubic-risk scoreHeldOut path).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createCorpusScorer } from '../../../src/learning/qe-flywheel/corpus-scorer.js';
import { DEFAULT_POLICY, type RetrievalPolicy } from '../../../src/learning/qe-flywheel/policy.js';

const ANCHOR_PATH = 'verification/anchors/qe-anchor-v1.json';

// ~300 patterns — comfortably past the MMR_POOL_SIZE (50) cap and the size that
// hung the live flywheel, while small enough to seed instantly in-memory.
const CORPUS_SIZE = 300;

// The upper time bound for a SINGLE scoreHeldOut pass over the whole corpus. The
// capped path is ~700ms here; the pre-fix uncapped path is ~96s (and blows the
// vitest testTimeout long before this assertion). 2000ms leaves ~2.9x headroom for
// slower CI while staying ~140x below the pre-fix cost.
const SCORE_BUDGET_MS = 2000;

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
 * Seed a DETERMINISTIC corpus (no Math.random — every token derives from the row
 * index) with realistic token overlap so the greedy-MMR similarity term does real
 * work. Each pattern i owns a unique `topic{i}` in its body plus a shared frame,
 * and its name references the neighbour's topic — the same body-is-the-signal
 * shape as qe-flywheel-scorer.test.ts, scaled up.
 */
function seedCorpus(db: Database.Database, n: number): void {
  const insert = db.prepare(
    `INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description)
     VALUES (?, 'test', 'test-generation', 'core', ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const id = `p${String(i).padStart(4, '0')}`;
      const next = (i + 1) % n;
      const description = `this pattern covers topic${i} with details about topic${i} handling and edge cases`;
      const name = `test pattern for topic${next}`;
      insert.run(id, name, description);
    }
  });
  tx();
}

describe('createCorpusScorer — MMR scaling regression (O(n^4) hang / MMR_POOL_SIZE cap)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedCorpus(db, CORPUS_SIZE);
  });

  afterEach(() => {
    db.close();
  });

  it(
    'should_complete_a_full_heldOut_pass_under_the_time_bound_when_the_corpus_has_hundreds_of_patterns',
    () => {
      // Arrange: a real scorer over the ~300-pattern corpus. The warm-up call
      // grades + CACHES the frozen anchor (the slow, non-timed part) so the timed
      // call below measures ONLY scoreHeldOut — the cubic-risk MMR path.
      const scorer = createCorpusScorer({ db, anchorPath: ANCHOR_PATH, heldOutRatio: 1 });
      scorer(DEFAULT_POLICY); // warm-up: anchor graded once, then memoized

      // Act: a second policy re-runs scoreHeldOut over the whole corpus (anchor is
      // cached). A diversity-leaning mmrLambda exercises the MMR similarity term.
      const diversityPolicy: RetrievalPolicy = { ...DEFAULT_POLICY, mmrLambda: 0.3 };
      const start = performance.now();
      const { heldOut } = scorer(diversityPolicy);
      const elapsedMs = performance.now() - start;

      // Assert: bounded time (fails against the pre-fix uncapped ~96s MMR) AND a
      // valid MRR — proving it actually ranked the corpus, not short-circuited.
      expect(elapsedMs).toBeLessThan(SCORE_BUDGET_MS);
      expect(heldOut).toBeGreaterThanOrEqual(0);
      expect(heldOut).toBeLessThanOrEqual(1);
    },
    20000, // generous total budget; pre-fix warm-up (~96s) times out here anyway
  );

  it('should_preserve_retrieval_correctness_when_the_MMR_pool_is_capped', () => {
    // Arrange: the pure-body channel — every held-out query is built from its own
    // unique topic token, so the true doc is the strict relevance maximum and MUST
    // survive the top-K pool cap (force-included) and rank first.
    const pureBody: RetrievalPolicy = {
      alpha: 1,
      bodyWeight: 1,
      subjectWeight: 0,
      mmrLambda: 1,
      typePenaltyFactor: 0,
    };
    const scorer = createCorpusScorer({ db, anchorPath: ANCHOR_PATH, heldOutRatio: 1 });

    // Act
    const { heldOut } = scorer(pureBody);

    // Assert: the cap bounds cost WITHOUT changing the MRR — perfect recovery holds
    // at n=300 exactly as it does on the tiny corpus (regression proof the cap is
    // a pure speedup, not a behaviour change).
    expect(heldOut).toBe(1);
  }, 20000);
});
