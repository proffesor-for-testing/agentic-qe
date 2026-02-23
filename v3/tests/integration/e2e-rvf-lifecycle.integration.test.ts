/**
 * E2E RVF Integration Lifecycle Test
 *
 * Validates the full lifecycle across all 4 workstreams:
 *   WS-A: MinCut routing
 *   WS-B: Dream branching (RVCOW)
 *   WS-C: Witness chain (audit)
 *   WS-D: HNSW unification (vector search)
 *
 * Uses a real in-memory SQLite database -- no mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

// WS-A: MinCut routing
import {
  QEMinCutService,
  type AgentNode,
} from '../../src/integrations/ruvector/mincut-wrapper.js';

// WS-B: Dream branching
import { RVCOWBranchManager } from '../../src/learning/dream/rvcow-branch-manager.js';

// WS-C: Witness chain
import { WitnessChain } from '../../src/audit/witness-chain.js';

// WS-D: HNSW unification
import { ProgressiveHnswBackend } from '../../src/kernel/progressive-hnsw-backend.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('E2E RVF Integration Lifecycle', () => {
  let db: DatabaseType;
  let witnessChain: WitnessChain;
  let branchManager: RVCOWBranchManager;
  let hnswBackend: ProgressiveHnswBackend;
  let minCutService: QEMinCutService;

  // Shared state between steps
  let routingLambda: number;
  let routingTier: number;
  const testVectorId = 42;
  let testVector: Float32Array;

  // --------------------------------------------------------------------------
  // Setup: Create in-memory SQLite with required schemas
  // --------------------------------------------------------------------------

  beforeAll(async () => {
    db = new Database(':memory:');

    // Create qe_patterns table (used by RVCOWBranchManager baseline capture)
    db.exec(`
      CREATE TABLE IF NOT EXISTS qe_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL DEFAULT 'unknown',
        pattern_data TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // witness_chain table is created by WitnessChain.initialize()
    // dream_cycles and dream_insights tables are not needed for branch manager
    // (it only uses savepoints on qe_patterns)

    // Initialize components
    witnessChain = new WitnessChain(db);
    await witnessChain.initialize();

    branchManager = new RVCOWBranchManager(db);
    hnswBackend = new ProgressiveHnswBackend({ dimensions: 384, metric: 'cosine' });
    minCutService = new QEMinCutService();
  });

  afterAll(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // Step 1: WS-A -- Route a task via MinCut
  // --------------------------------------------------------------------------

  it('Step 1: should compute lambda and routing tier from agent topology', () => {
    // Build a simple 3-agent topology
    const agents: AgentNode[] = [
      {
        id: 'agent-alpha',
        name: 'Alpha',
        domain: 'test-generation',
        capabilities: ['unit-test'],
        dependsOn: [],
        weight: 1.0,
      },
      {
        id: 'agent-beta',
        name: 'Beta',
        domain: 'test-generation',
        capabilities: ['integration-test'],
        dependsOn: ['agent-alpha'],
        weight: 0.8,
      },
      {
        id: 'agent-gamma',
        name: 'Gamma',
        domain: 'test-execution',
        capabilities: ['runner'],
        dependsOn: ['agent-beta'],
        weight: 0.6,
      },
    ];

    const tier = minCutService.computeRoutingTier(
      'Implement authentication flow with JWT refresh tokens',
      agents,
    );

    // Lambda should be a non-negative number
    expect(tier.lambda).toBeGreaterThanOrEqual(0);
    expect(tier.normalizedLambda).toBeGreaterThanOrEqual(0);
    expect(tier.normalizedLambda).toBeLessThanOrEqual(1);

    // Tier should be 1, 2, or 3
    expect([1, 2, 3]).toContain(tier.tier);
    expect(['Haiku', 'Sonnet', 'Opus']).toContain(tier.label);

    // Confidence should be a reasonable value
    expect(tier.confidence).toBeGreaterThan(0);
    expect(tier.confidence).toBeLessThanOrEqual(1);

    // Rationale should mention the task
    expect(tier.rationale).toContain('authentication');

    // Store for subsequent steps
    routingLambda = tier.lambda;
    routingTier = tier.tier;
  });

  // --------------------------------------------------------------------------
  // Step 2: WS-C -- Record routing decision in witness chain
  // --------------------------------------------------------------------------

  it('Step 2: should append a ROUTING_DECISION witness entry', () => {
    const entry = witnessChain.append(
      'ROUTING_DECISION',
      {
        task: 'Implement authentication flow with JWT refresh tokens',
        lambda: routingLambda,
        tier: routingTier,
      },
      'e2e-test-actor',
    );

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.action_type).toBe('ROUTING_DECISION');
    expect(entry.actor).toBe('e2e-test-actor');
    expect(entry.prev_hash).toHaveLength(64); // SHA-256 hex

    // Verify action_data round-trips
    const parsed = JSON.parse(entry.action_data);
    expect(parsed.task).toContain('authentication');
    expect(parsed.lambda).toBe(routingLambda);
    expect(parsed.tier).toBe(routingTier);
  });

  // --------------------------------------------------------------------------
  // Step 3: WS-D -- Store and search pattern in HNSW
  // --------------------------------------------------------------------------

  it('Step 3: should add a vector to ProgressiveHnswBackend and search for it', () => {
    // Generate a random 384-dim embedding
    testVector = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      testVector[i] = Math.random() * 2 - 1; // [-1, 1]
    }

    hnswBackend.add(testVectorId, testVector, { label: 'auth-pattern' });

    expect(hnswBackend.size()).toBe(1);
    expect(hnswBackend.dimensions()).toBe(384);

    // Search with the same vector -- should get perfect (or near-perfect) match
    const results = hnswBackend.search(testVector, 1);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(testVectorId);
    // Cosine similarity of a vector with itself should be ~1.0
    expect(results[0].score).toBeGreaterThan(0.99);
  });

  // --------------------------------------------------------------------------
  // Step 4: WS-B -- Dream with RVCOW branching
  // --------------------------------------------------------------------------

  it('Step 4: should create a branch, insert a pattern, validate and merge', () => {
    // Seed some baseline patterns so captureBaseline is non-trivial
    db.exec(`
      INSERT INTO qe_patterns (pattern_type, pattern_data, confidence)
      VALUES ('auth', '{"type":"jwt"}', 0.85);
      INSERT INTO qe_patterns (pattern_type, pattern_data, confidence)
      VALUES ('error-handling', '{"type":"retry"}', 0.90);
    `);

    const baselineBeforeBranch = branchManager.captureBaseline();
    expect(baselineBeforeBranch.patternCount).toBe(2);

    // Create a branch (SAVEPOINT)
    const branch = branchManager.createBranch('dream-e2e-test');
    expect(branch.status).toBe('active');
    expect(branch.name).toBe('dream-e2e-test');

    // Insert a new pattern within the branch
    db.exec(`
      INSERT INTO qe_patterns (pattern_type, pattern_data, confidence)
      VALUES ('caching', '{"type":"redis"}', 0.92);
    `);

    // Validate -- adding a pattern should pass (no degradation)
    const validation = branchManager.validateBranch(branch);
    expect(validation.passed).toBe(true);
    expect(validation.patternCountDelta).toBe(1); // +1 pattern
    expect(validation.avgConfidenceDelta).toBeGreaterThanOrEqual(0); // confidence improved or same
    expect(validation.reason).toContain('passed');

    // Merge the branch (RELEASE SAVEPOINT)
    branchManager.mergeBranch(branch);
    expect(branch.status).toBe('merged');

    // Verify the pattern persisted after merge
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
    expect(count).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Step 5: WS-C -- Record pattern operation in witness chain
  // --------------------------------------------------------------------------

  it('Step 5: should record a PATTERN_CREATE witness entry for the dream', () => {
    const entry = witnessChain.append(
      'PATTERN_CREATE',
      {
        patternType: 'caching',
        confidence: 0.92,
        source: 'dream-e2e-test',
      },
      'dream-engine',
    );

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.action_type).toBe('PATTERN_CREATE');
    expect(entry.actor).toBe('dream-engine');
  });

  // --------------------------------------------------------------------------
  // Step 6: WS-C -- Verify witness chain integrity
  // --------------------------------------------------------------------------

  it('Step 6: should verify witness chain integrity after all operations', () => {
    const verification = witnessChain.verify();

    expect(verification.valid).toBe(true);
    expect(verification.entriesChecked).toBeGreaterThanOrEqual(2);
    expect(verification.brokenAt).toBeUndefined();

    // Verify entries exist by type
    const routingEntries = witnessChain.getEntries({ action_type: 'ROUTING_DECISION' });
    expect(routingEntries.length).toBeGreaterThanOrEqual(1);
    expect(routingEntries[0].action_type).toBe('ROUTING_DECISION');

    const patternEntries = witnessChain.getEntries({ action_type: 'PATTERN_CREATE' });
    expect(patternEntries.length).toBeGreaterThanOrEqual(1);

    // Total chain length
    const chainLength = witnessChain.getChainLength();
    expect(chainLength).toBeGreaterThanOrEqual(2);
  });

  // --------------------------------------------------------------------------
  // Step 7: WS-D -- Search unified HNSW for the vector added in Step 3
  // --------------------------------------------------------------------------

  it('Step 7: should find the previously stored vector via HNSW search', () => {
    // Add a second vector to make the search non-trivial
    const noiseVector = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      noiseVector[i] = Math.random() * 2 - 1;
    }
    hnswBackend.add(99, noiseVector, { label: 'noise' });

    expect(hnswBackend.size()).toBe(2);

    // Search for the original test vector
    const results = hnswBackend.search(testVector, 2);

    expect(results.length).toBe(2);
    // The first result should be the exact match
    expect(results[0].id).toBe(testVectorId);
    expect(results[0].score).toBeGreaterThan(0.99);

    // Second result should be the noise vector (lower score)
    expect(results[1].id).toBe(99);
    expect(results[1].score).toBeLessThan(results[0].score);
  });

  // --------------------------------------------------------------------------
  // Step 8: Cross-workstream integration validation
  // --------------------------------------------------------------------------

  it('Step 8: should validate cross-workstream data consistency', () => {
    // Verify all workstreams operated on consistent state:

    // WS-A produced a valid routing decision
    expect(routingLambda).toBeDefined();
    expect(routingTier).toBeDefined();

    // WS-B left the DB in a consistent state with 3 patterns
    const patternCount = (db.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
    expect(patternCount).toBe(3);

    // WS-C recorded both routing and pattern events with valid chain
    const allEntries = witnessChain.getEntries();
    const actionTypes = allEntries.map(e => e.action_type);
    expect(actionTypes).toContain('ROUTING_DECISION');
    expect(actionTypes).toContain('PATTERN_CREATE');

    // WS-D holds 2 vectors
    expect(hnswBackend.size()).toBe(2);
    expect(hnswBackend.recall()).toBe(1.0); // brute-force = perfect recall

    // Chain integrity is intact end-to-end
    const finalVerification = witnessChain.verify();
    expect(finalVerification.valid).toBe(true);
  });
});
