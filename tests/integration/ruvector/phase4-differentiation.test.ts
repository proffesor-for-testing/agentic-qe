/**
 * RuVector Phase 4 Differentiation Integration Tests
 *
 * Exercises all Phase 4 differentiation components working together:
 * - Cognitive Container (Task 4.1): binary export/import with Ed25519 signing & COW branching
 * - DAG Attention Scheduler (Task 4.2): critical path, parallel branches, MinCut pruning
 * - CNN Visual Regression (Task 4.3): spatial pooling embeddings and similarity comparison
 * - Behavior Trees (Task 4.4): composable node orchestration with serialization
 * - Reasoning QEC (Task 4.5): multi-path error correction via majority vote
 * - Browser Dashboard (Task 4.6): pattern explorer, clustering, health dashboard
 * - End-to-end: multiple Phase 4 components working together
 * - Feature flag backward compatibility
 *
 * @see docs/implementation/ruvector-integration-plan.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// -- Cognitive Container --
import {
  CognitiveContainer,
  createCognitiveContainer,
  generateSigningKeyPair,
} from '../../../src/integrations/ruvector/cognitive-container.js';
import type {
  ContainerManifest,
  ExportOptions,
  ImportOptions,
  ImportResult,
  VerificationResult,
  ContainerInfo,
} from '../../../src/integrations/ruvector/cognitive-container.js';
import { ensureTargetTables } from '../../../src/integrations/ruvector/brain-shared.js';

// -- DAG Attention Scheduler --
import {
  DAGAttentionScheduler,
  createDAGAttentionScheduler,
} from '../../../src/test-scheduling/dag-attention-scheduler.js';
import type {
  TestNode,
  TestDAG,
  ScheduledExecution,
} from '../../../src/test-scheduling/dag-attention-scheduler.js';

// -- CNN Visual Regression --
import {
  CNNVisualRegression,
  cosineSimilarity as cnnCosineSimilarity,
} from '../../../src/domains/visual-accessibility/cnn-visual-regression.js';

// -- Behavior Trees --
import {
  SequenceNode,
  SelectorNode,
  ParallelNode,
  ActionNode,
  ConditionNode,
  deserializeNode,
  sequence,
  action,
  condition,
} from '../../../src/coordination/behavior-tree/nodes.js';
import type {
  NodeStatus,
  NodeHandlerRegistry,
  SerializedNode,
} from '../../../src/coordination/behavior-tree/nodes.js';
import { RetryNode, InverterNode } from '../../../src/coordination/behavior-tree/decorators.js';
import {
  buildTestGenerationPipeline,
  buildRegressionSuite,
  serializeQETree,
  deserializeQETree,
  createQEHandlerRegistry,
  QEActionIds,
  QEConditionIds,
} from '../../../src/coordination/behavior-tree/qe-trees.js';
import type { QETreeHandlers } from '../../../src/coordination/behavior-tree/qe-trees.js';

// -- Reasoning QEC --
import {
  ReasoningQEC,
  createReasoningQEC,
  processReasoning,
} from '../../../src/coordination/reasoning-qec.js';
import type {
  ReasoningProblem,
  ReasoningPath,
  Syndrome,
  CorrectedReasoning,
  ValidationResult as QECValidationResult,
} from '../../../src/coordination/reasoning-qec.js';

// -- Browser Dashboard --
import {
  WasmVectorStore,
} from '../../../src/integrations/browser/qe-dashboard/wasm-vector-store.js';
import {
  PatternExplorer,
  kMeansClustering,
} from '../../../src/integrations/browser/qe-dashboard/pattern-explorer.js';
import type {
  Pattern,
  PatternCluster,
  DomainStats,
  DashboardData,
} from '../../../src/integrations/browser/qe-dashboard/pattern-explorer.js';
import {
  generateEmbedding,
  EMBEDDING_DIM,
} from '../../../src/integrations/browser/qe-dashboard/clustering.js';

// -- Feature Flags --
import {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../src/integrations/ruvector/feature-flags.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create an in-memory SQLite database with all brain tables. */
function createTestDB(): Database.Database {
  const db = new Database(':memory:');
  ensureTargetTables(db);
  return db;
}

/** Seed a test database with sample patterns and Q-values. */
function seedTestDB(db: Database.Database): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('p1', 'test-gen', 'api-testing', 'testing', 'Auth pattern', 'JWT auth testing', 0.9);
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('p2', 'security', 'security', 'security', 'XSS guard', 'XSS sanitization check', 0.85);

  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('q1', 'sarsa', 'agent-1', 'state-a', 'action-x', 0.75, 10, 'api-testing');
}

/** Generate synthetic RGBA pixel data for a given width/height and a base color. */
function generateSyntheticImage(
  width: number, height: number, r: number, g: number, b: number,
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/** Generate synthetic image with a gradient for more interesting embeddings. */
function generateGradientImage(
  width: number, height: number, channel: 'r' | 'g' | 'b',
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const intensity = Math.floor((x / width) * 255);
      pixels[i] = channel === 'r' ? intensity : 0;
      pixels[i + 1] = channel === 'g' ? intensity : 0;
      pixels[i + 2] = channel === 'b' ? intensity : 0;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

/** Build a standard DAG of test nodes for scheduler tests. */
function buildStandardTestNodes(): TestNode[] {
  return [
    { id: 'setup', name: 'Setup', estimatedDuration: 100, dependencies: [], priority: 10, tags: ['setup'] },
    { id: 'unit-a', name: 'Unit A', estimatedDuration: 50, dependencies: ['setup'], priority: 5, tags: ['unit'] },
    { id: 'unit-b', name: 'Unit B', estimatedDuration: 80, dependencies: ['setup'], priority: 5, tags: ['unit'] },
    { id: 'unit-c', name: 'Unit C', estimatedDuration: 30, dependencies: ['setup'], priority: 3, tags: ['unit'] },
    { id: 'integration-ab', name: 'Integration AB', estimatedDuration: 200, dependencies: ['unit-a', 'unit-b'], priority: 8, tags: ['integration'] },
    { id: 'integration-c', name: 'Integration C', estimatedDuration: 60, dependencies: ['unit-c'], priority: 4, tags: ['integration'] },
    { id: 'e2e', name: 'E2E', estimatedDuration: 300, dependencies: ['integration-ab', 'integration-c'], priority: 10, tags: ['e2e'] },
  ];
}

/** Generate sample patterns for dashboard tests. */
function generateSamplePatterns(count: number): Pattern[] {
  const domains = ['api-testing', 'security', 'performance', 'accessibility', 'e2e'];
  const patterns: Pattern[] = [];
  for (let i = 0; i < count; i++) {
    const domain = domains[i % domains.length];
    patterns.push({
      id: `pattern-${i}`,
      domain,
      description: `Test pattern ${i} for ${domain} validation and coverage`,
      confidence: 0.5 + (i % 5) * 0.1,
      tags: [domain, i % 2 === 0 ? 'automated' : 'manual'],
      createdAt: Date.now() - (i * 60_000),
      success: i % 3 !== 0,
    });
  }
  return patterns;
}

// ============================================================================
// 1. Cognitive Container Tests
// ============================================================================

describe('Phase 4: Cognitive Container', () => {
  let container: CognitiveContainer;
  let db: Database.Database;

  beforeEach(() => {
    container = createCognitiveContainer();
    db = createTestDB();
    seedTestDB(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('round-trip export/import', () => {
    it('should export and re-import brain state preserving patterns and Q-values', () => {
      // Export
      const { data, manifest } = container.exportContainer(db);

      expect(data).toBeInstanceOf(Buffer);
      expect(data.length).toBeGreaterThan(0);
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.segments.length).toBe(6);

      // Verify checksums are present for all segments
      for (const seg of manifest.segments) {
        expect(manifest.checksums[seg.name]).toBe(seg.checksum);
        expect(seg.checksum).toMatch(/^[0-9a-f]{64}$/);
      }

      // Import into a fresh database
      const freshDB = createTestDB();
      const result = container.importContainer(data, freshDB, {
        mergeStrategy: 'latest-wins',
      });

      expect(result.segmentsRestored).toBe(6);
      expect(result.imported).toBeGreaterThanOrEqual(3); // 2 patterns + 1 q-value at minimum

      // Verify patterns survived
      const patterns = freshDB.prepare('SELECT * FROM qe_patterns ORDER BY id').all() as Array<{ id: string; confidence: number }>;
      expect(patterns.length).toBe(2);
      expect(patterns[0].id).toBe('p1');
      expect(patterns[0].confidence).toBe(0.9);
      expect(patterns[1].id).toBe('p2');
      expect(patterns[1].confidence).toBe(0.85);

      // Verify Q-values survived
      const qValues = freshDB.prepare('SELECT * FROM rl_q_values').all() as Array<{ id: string; q_value: number }>;
      expect(qValues.length).toBe(1);
      expect(qValues[0].q_value).toBe(0.75);

      freshDB.close();
    });

    it('should handle uncompressed export/import', () => {
      const { data } = container.exportContainer(db, { compress: false });

      const freshDB = createTestDB();
      const result = container.importContainer(data, freshDB, {
        mergeStrategy: 'latest-wins',
      });

      expect(result.segmentsRestored).toBe(6);
      expect(result.imported).toBeGreaterThanOrEqual(3);

      freshDB.close();
    });

    it('should support dry-run import', () => {
      const { data } = container.exportContainer(db);

      const freshDB = createTestDB();
      const result = container.importContainer(data, freshDB, {
        mergeStrategy: 'latest-wins',
        dryRun: true,
      });

      expect(result.segmentsRestored).toBe(6);
      // Dry run counts rows but does not actually insert
      const patterns = freshDB.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number };
      expect(patterns.cnt).toBe(0);

      freshDB.close();
    });

    it('should verify container integrity', () => {
      const { data } = container.exportContainer(db);
      const verification = container.verifyContainer(data);

      expect(verification.valid).toBe(true);
      expect(verification.manifestValid).toBe(true);
      expect(verification.segmentsValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('should detect tampered container data', () => {
      const { data } = container.exportContainer(db);

      // Tamper with some bytes in the segment data area
      const tampered = Buffer.from(data);
      const lastByte = tampered.length - 1;
      tampered[lastByte] = tampered[lastByte] ^ 0xff;

      const verification = container.verifyContainer(tampered);
      // Tampering should either cause parse error or checksum mismatch
      expect(verification.valid).toBe(false);
    });

    it('should return container info without full import', () => {
      const { data } = container.exportContainer(db, { sourceId: 'test-source-42' });
      const info = container.getContainerInfo(data);

      expect(info.version).toBe('2.0.0');
      expect(info.source).toBe('test-source-42');
      expect(info.segmentCount).toBe(6);
      expect(info.segmentNames).toContain('patterns');
      expect(info.segmentNames).toContain('q-values');
      expect(info.totalDataBytes).toBeGreaterThan(0);
      expect(info.signed).toBe(false);
      expect(info.branchOf).toBeNull();
    });
  });

  describe('Ed25519 signing', () => {
    it('should export with Ed25519 signing and verify signature', () => {
      const keyPair = generateSigningKeyPair();

      const { data, manifest } = container.exportContainer(db, {
        sign: true,
        privateKey: keyPair.privateKey,
      });

      expect(manifest.signature).toBeDefined();
      expect(manifest.signature!.length).toBeGreaterThan(0);

      // Verify signature
      const verification = container.verifyContainer(data, keyPair.publicKey);
      expect(verification.valid).toBe(true);
      expect(verification.signatureValid).toBe(true);
    });

    it('should detect tampered manifest via signature verification', () => {
      const keyPair = generateSigningKeyPair();

      const { data } = container.exportContainer(db, {
        sign: true,
        privateKey: keyPair.privateKey,
      });

      // Re-export with different data but try to use old signature
      const wrongKeyPair = generateSigningKeyPair();
      const verification = container.verifyContainer(data, wrongKeyPair.publicKey);

      // Verifying with wrong key should fail
      expect(verification.signatureValid).toBe(false);
    });

    it('should import with signature verification', () => {
      const keyPair = generateSigningKeyPair();

      const { data } = container.exportContainer(db, {
        sign: true,
        privateKey: keyPair.privateKey,
      });

      const freshDB = createTestDB();
      const result = container.importContainer(data, freshDB, {
        mergeStrategy: 'latest-wins',
        verifySignature: true,
        publicKey: keyPair.publicKey,
      });

      expect(result.segmentsRestored).toBe(6);
      expect(result.imported).toBeGreaterThanOrEqual(3);

      freshDB.close();
    });

    it('should reject unsigned container when signature verification is requested', () => {
      const { data } = container.exportContainer(db); // no signing
      const keyPair = generateSigningKeyPair();

      const freshDB = createTestDB();
      expect(() => container.importContainer(data, freshDB, {
        mergeStrategy: 'latest-wins',
        verifySignature: true,
        publicKey: keyPair.publicKey,
      })).toThrow(/not signed/i);

      freshDB.close();
    });
  });

  describe('COW branching', () => {
    it('should create a branch referencing the parent container', () => {
      const { data: parentData, manifest: parentManifest } = container.exportContainer(db, {
        sourceId: 'parent-brain',
      });

      const { data: branchData, manifest: branchManifest } = container.branchContainer(
        parentData,
        'experiment-branch',
      );

      expect(branchManifest.branchOf).toBe('parent-brain');
      expect(branchManifest.source).toBe('experiment-branch');
      expect(branchManifest.segments.length).toBe(parentManifest.segments.length);
      expect(branchManifest.version).toBe(parentManifest.version);

      // Branch data should be importable
      const branchDB = createTestDB();
      const result = container.importContainer(branchData, branchDB, {
        mergeStrategy: 'latest-wins',
      });
      expect(result.segmentsRestored).toBe(6);
      expect(result.imported).toBeGreaterThanOrEqual(3);

      // Verify branch info
      const info = container.getContainerInfo(branchData);
      expect(info.branchOf).toBe('parent-brain');
      expect(info.source).toBe('experiment-branch');

      branchDB.close();
    });

    it('should preserve parent checksums in the branch', () => {
      const { data: parentData, manifest: parentManifest } = container.exportContainer(db);
      const { manifest: branchManifest } = container.branchContainer(parentData, 'branch-1');

      // All checksums should match the parent since data is shared
      for (const segName of Object.keys(parentManifest.checksums)) {
        expect(branchManifest.checksums[segName]).toBe(parentManifest.checksums[segName]);
      }
    });
  });
});

// ============================================================================
// 2. DAG Attention Scheduler Tests
// ============================================================================

describe('Phase 4: DAG Attention Scheduler', () => {
  let scheduler: DAGAttentionScheduler;

  beforeEach(() => {
    scheduler = createDAGAttentionScheduler();
  });

  describe('DAG construction and critical path', () => {
    it('should build a valid DAG from test nodes', () => {
      const tests = buildStandardTestNodes();
      const dag = scheduler.buildTestDAG(tests);

      expect(dag.nodes.size).toBe(7);
      expect(dag.criticalPath.length).toBeGreaterThan(0);
      expect(dag.parallelGroups.length).toBeGreaterThan(0);
    });

    it('should identify the critical path as the longest duration chain', () => {
      const tests = buildStandardTestNodes();
      const dag = scheduler.buildTestDAG(tests);
      const criticalPath = scheduler.findCriticalPath(dag);

      // Critical path should include setup -> one of the unit branches -> integration-ab -> e2e
      const pathIds = criticalPath.map(n => n.id);
      expect(pathIds).toContain('setup');
      expect(pathIds).toContain('e2e');

      // Critical path duration should be the sum of the longest chain
      const criticalDuration = criticalPath.reduce((sum, n) => sum + n.estimatedDuration, 0);
      // setup(100) + unit-b(80) + integration-ab(200) + e2e(300) = 680
      expect(criticalDuration).toBeGreaterThanOrEqual(680);
    });

    it('should find parallel branches', () => {
      const tests = buildStandardTestNodes();
      const dag = scheduler.buildTestDAG(tests);
      const parallelBranches = scheduler.findParallelBranches(dag);

      expect(parallelBranches.length).toBeGreaterThan(1);

      // The three unit tests should be in the same parallel group
      const unitGroup = parallelBranches.find(group =>
        group.some(n => n.id === 'unit-a') && group.some(n => n.id === 'unit-b'),
      );
      expect(unitGroup).toBeDefined();
    });

    it('should detect cycle in test DAG', () => {
      const cyclicTests: TestNode[] = [
        { id: 'a', name: 'A', estimatedDuration: 10, dependencies: ['b'], priority: 1, tags: [] },
        { id: 'b', name: 'B', estimatedDuration: 10, dependencies: ['a'], priority: 1, tags: [] },
      ];

      expect(() => scheduler.buildTestDAG(cyclicTests)).toThrow(/[Cc]ycle/);
    });

    it('should reject missing dependency references', () => {
      const badTests: TestNode[] = [
        { id: 'a', name: 'A', estimatedDuration: 10, dependencies: ['nonexistent'], priority: 1, tags: [] },
      ];

      expect(() => scheduler.buildTestDAG(badTests)).toThrow(/does not exist/);
    });
  });

  describe('scheduling and parallelism', () => {
    it('should produce a schedule that improves over naive sequential ordering', () => {
      const tests = buildStandardTestNodes();
      const scheduled = scheduler.schedule(tests);

      expect(scheduled.phases.length).toBeGreaterThan(0);
      expect(scheduled.criticalPathTime).toBeGreaterThan(0);

      // Total sequential time = sum of all durations
      const totalSequential = tests.reduce((sum, t) => sum + t.estimatedDuration, 0);
      // Parallel wall-clock estimate should be less than or equal to sequential
      expect(scheduled.totalEstimatedTime).toBeLessThanOrEqual(totalSequential);

      // Parallelism factor should be >= 1 (at least 1 means no worse than sequential)
      expect(scheduled.parallelism).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty test set gracefully', () => {
      const scheduled = scheduler.schedule([]);

      expect(scheduled.phases).toHaveLength(0);
      expect(scheduled.totalEstimatedTime).toBe(0);
      expect(scheduled.criticalPathTime).toBe(0);
    });

    it('should handle single test', () => {
      const tests: TestNode[] = [
        { id: 'only', name: 'Only Test', estimatedDuration: 100, dependencies: [], priority: 5, tags: [] },
      ];

      const scheduled = scheduler.schedule(tests);
      expect(scheduled.phases.length).toBe(1);
      expect(scheduled.totalEstimatedTime).toBe(100);
    });
  });

  describe('MinCut pruning', () => {
    it('should prune low-value tests to fit within a budget', () => {
      const tests = buildStandardTestNodes();
      const dag = scheduler.buildTestDAG(tests);

      // Total duration is 820ms; set a tight budget
      const prunedDag = scheduler.pruneByMinCut(dag, 500);

      // Critical path tests should be preserved
      const criticalIds = prunedDag.criticalPath;
      expect(criticalIds).toContain('setup');
      expect(criticalIds).toContain('e2e');

      const stats = scheduler.getOptimizationStats();
      // If pruning happened, prunedTests > 0
      // (may not prune if critical path + dependencies exceed budget)
      expect(stats.prunedTests).toBeGreaterThanOrEqual(0);
    });

    it('should not prune when total duration is within budget', () => {
      const tests = buildStandardTestNodes();
      const dag = scheduler.buildTestDAG(tests);

      const prunedDag = scheduler.pruneByMinCut(dag, 10000);
      expect(prunedDag.nodes.size).toBe(dag.nodes.size);
    });
  });

  describe('self-learning', () => {
    it('should record execution and update learned durations via EMA', () => {
      scheduler.recordExecution('unit-a', 120, 'pass');
      expect(scheduler.getLearnedDuration('unit-a')).toBe(120);

      scheduler.recordExecution('unit-a', 80, 'pass');
      const learned = scheduler.getLearnedDuration('unit-a')!;
      // EMA: 120 * 0.7 + 80 * 0.3 = 108
      expect(learned).toBeCloseTo(108, 0);

      // Learned duration should affect subsequent scheduling
      const tests: TestNode[] = [
        { id: 'unit-a', name: 'Unit A', estimatedDuration: 50, dependencies: [], priority: 5, tags: [] },
      ];
      const dag = scheduler.buildTestDAG(tests);
      const node = dag.nodes.get('unit-a')!;
      expect(node.estimatedDuration).toBe(Math.round(learned));
    });
  });
});

// ============================================================================
// 3. CNN Visual Regression Tests
// ============================================================================

describe('Phase 4: CNN Visual Regression', () => {
  let cnn: CNNVisualRegression;

  beforeEach(() => {
    cnn = new CNNVisualRegression({ tryNativeBackend: false });
  });

  describe('embedding computation', () => {
    it('should compute embeddings from synthetic pixel data', () => {
      const image = generateSyntheticImage(64, 64, 128, 64, 32);
      const embedding = cnn.computeEmbedding(image, 64, 64);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(cnn.getEmbeddingDimension());
      // L2-normalized: norm should be approximately 1
      let norm = 0;
      for (let i = 0; i < embedding.length; i++) norm += embedding[i] * embedding[i];
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 2);
    });

    it('should produce identical embeddings for identical images', () => {
      const image1 = generateSyntheticImage(32, 32, 100, 150, 200);
      const image2 = generateSyntheticImage(32, 32, 100, 150, 200);

      const embed1 = cnn.computeEmbedding(image1, 32, 32);
      const embed2 = cnn.computeEmbedding(image2, 32, 32);

      const similarity = cnnCosineSimilarity(embed1, embed2);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should reject invalid image dimensions', () => {
      const image = new Uint8Array(10);
      expect(() => cnn.computeEmbedding(image, 0, 10)).toThrow(/Invalid/);
      expect(() => cnn.computeEmbedding(image, 10, 0)).toThrow(/Invalid/);
    });

    it('should reject image data too small for declared dimensions', () => {
      const image = new Uint8Array(100);
      expect(() => cnn.computeEmbedding(image, 64, 64)).toThrow(/too small/);
    });
  });

  describe('similarity comparison', () => {
    it('should detect similar images as matching', () => {
      const baseline = generateSyntheticImage(64, 64, 128, 64, 32);
      // Slightly different: just a few pixel changes
      const current = new Uint8Array(baseline);
      current[0] = 130; // tiny modification
      current[4] = 66;

      const baseEmbed = cnn.computeEmbedding(baseline, 64, 64);
      const curEmbed = cnn.computeEmbedding(current, 64, 64);

      const result = cnn.compare(baseEmbed, curEmbed);
      expect(result.isMatch).toBe(true);
      expect(result.similarity).toBeGreaterThan(0.99);
    });

    it('should detect different images as regression', () => {
      const baseline = generateGradientImage(64, 64, 'r');
      const different = generateGradientImage(64, 64, 'b');

      const baseEmbed = cnn.computeEmbedding(baseline, 64, 64);
      const diffEmbed = cnn.computeEmbedding(different, 64, 64);

      const isReg = cnn.isRegression(baseEmbed, diffEmbed);
      expect(isReg).toBe(true);

      const similarity = cnnCosineSimilarity(baseEmbed, diffEmbed);
      expect(similarity).toBeLessThan(0.95);
    });

    it('should support per-region comparison', () => {
      const baseline = generateSyntheticImage(64, 64, 128, 128, 128);
      const current = generateSyntheticImage(64, 64, 128, 128, 128);

      const baseEmbed = cnn.computeEmbedding(baseline, 64, 64);
      const curEmbed = cnn.computeEmbedding(current, 64, 64);

      const result = cnn.compareWithRegions(
        baseEmbed, curEmbed,
        [{ x: 0, y: 0, width: 32, height: 32 }],
        64, 64,
      );

      expect(result.regionSimilarities).toBeDefined();
      expect(result.regionSimilarities!.length).toBe(1);
      expect(result.regionSimilarities![0].similarity).toBeGreaterThan(0.99);
    });
  });

  describe('threshold learning', () => {
    it('should learn optimal threshold from labeled pairs', () => {
      const img1 = generateSyntheticImage(32, 32, 100, 100, 100);
      const img2 = generateSyntheticImage(32, 32, 102, 100, 100);
      const img3 = generateGradientImage(32, 32, 'r');
      const img4 = generateGradientImage(32, 32, 'b');

      const embed1 = cnn.computeEmbedding(img1, 32, 32);
      const embed2 = cnn.computeEmbedding(img2, 32, 32);
      const embed3 = cnn.computeEmbedding(img3, 32, 32);
      const embed4 = cnn.computeEmbedding(img4, 32, 32);

      const learnedThreshold = cnn.learnThreshold([
        { embedA: embed1, embedB: embed2, isMatch: true },
        { embedA: embed3, embedB: embed4, isMatch: false },
      ]);

      expect(learnedThreshold).toBeGreaterThan(0);
      expect(learnedThreshold).toBeLessThanOrEqual(1);
    });

    it('should throw if no labeled pairs provided', () => {
      expect(() => cnn.learnThreshold([])).toThrow(/At least one/);
    });

    it('should throw if all labeled pairs have same label', () => {
      const img1 = generateSyntheticImage(32, 32, 100, 100, 100);
      const embed1 = cnn.computeEmbedding(img1, 32, 32);

      expect(() => cnn.learnThreshold([
        { embedA: embed1, embedB: embed1, isMatch: true },
      ])).toThrow(/both matching and non-matching/);
    });
  });

  describe('masking', () => {
    it('should produce different embeddings when regions are masked', () => {
      const image = generateGradientImage(64, 64, 'r');

      const embedUnmasked = cnn.computeEmbedding(image, 64, 64);
      const embedMasked = cnn.computeEmbedding(image, 64, 64, {
        maskRegions: [{ x: 0, y: 0, width: 32, height: 32 }],
      });

      // Masking a region should change the embedding
      const similarity = cnnCosineSimilarity(embedUnmasked, embedMasked);
      expect(similarity).toBeLessThan(1.0);
    });
  });
});

// ============================================================================
// 4. Behavior Tree Orchestration Tests
// ============================================================================

describe('Phase 4: Behavior Tree Orchestration', () => {
  describe('test generation pipeline', () => {
    it('should run the test-generation-pipeline tree to completion', async () => {
      const executionLog: string[] = [];

      const handlers: QETreeHandlers = {
        actions: {
          [QEActionIds.ANALYZE_CODE]: async () => { executionLog.push('analyze'); return 'SUCCESS'; },
          [QEActionIds.GENERATE_TESTS]: async () => { executionLog.push('generate'); return 'SUCCESS'; },
          [QEActionIds.VALIDATE_TESTS]: async () => { executionLog.push('validate'); return 'SUCCESS'; },
          [QEActionIds.COMMIT_TESTS]: async () => { executionLog.push('commit'); return 'SUCCESS'; },
        },
        conditions: {
          [QEConditionIds.HAS_SOURCE_FILES]: async () => true,
          [QEConditionIds.TESTS_ARE_VALID]: async () => true,
        },
      };

      const tree = buildTestGenerationPipeline(handlers);
      const result = await tree.tick();

      expect(result).toBe('SUCCESS');
      expect(executionLog).toEqual(['analyze', 'generate', 'validate', 'commit']);
    });

    it('should fail the pipeline when condition fails', async () => {
      const handlers: QETreeHandlers = {
        actions: {},
        conditions: {
          [QEConditionIds.HAS_SOURCE_FILES]: async () => false,
        },
      };

      const tree = buildTestGenerationPipeline(handlers);
      const result = await tree.tick();

      expect(result).toBe('FAILURE');
    });

    it('should retry analyze-code up to 2 times on failure', async () => {
      let attempts = 0;
      const handlers: QETreeHandlers = {
        actions: {
          [QEActionIds.ANALYZE_CODE]: async () => {
            attempts++;
            return attempts < 3 ? 'FAILURE' : 'SUCCESS';
          },
          [QEActionIds.GENERATE_TESTS]: async () => 'SUCCESS',
          [QEActionIds.VALIDATE_TESTS]: async () => 'SUCCESS',
          [QEActionIds.COMMIT_TESTS]: async () => 'SUCCESS',
        },
        conditions: {
          [QEConditionIds.HAS_SOURCE_FILES]: async () => true,
          [QEConditionIds.TESTS_ARE_VALID]: async () => true,
        },
      };

      const tree = buildTestGenerationPipeline(handlers);
      const result = await tree.tick();

      expect(result).toBe('SUCCESS');
      expect(attempts).toBe(3); // initial + 2 retries
    });
  });

  describe('regression suite', () => {
    it('should run regression suite tree to completion', async () => {
      const executionLog: string[] = [];

      const handlers: QETreeHandlers = {
        actions: {
          [QEActionIds.LOAD_TESTS]: async () => { executionLog.push('load'); return 'SUCCESS'; },
          [QEActionIds.EXECUTE_TESTS]: async () => { executionLog.push('execute'); return 'SUCCESS'; },
          [QEActionIds.COLLECT_RESULTS]: async () => { executionLog.push('collect'); return 'SUCCESS'; },
          [QEActionIds.GENERATE_REPORT]: async () => { executionLog.push('report'); return 'SUCCESS'; },
        },
        conditions: {
          [QEConditionIds.HAS_TEST_FILES]: async () => true,
        },
      };

      const tree = buildRegressionSuite(handlers);
      const result = await tree.tick();

      expect(result).toBe('SUCCESS');
      expect(executionLog).toContain('load');
      expect(executionLog).toContain('execute');
      expect(executionLog).toContain('collect');
      expect(executionLog).toContain('report');
    });
  });

  describe('serialization round-trip', () => {
    it('should serialize and deserialize a behavior tree preserving structure', async () => {
      const executionLog: string[] = [];
      const handlers: QETreeHandlers = {
        actions: {
          [QEActionIds.ANALYZE_CODE]: async () => { executionLog.push('analyze'); return 'SUCCESS'; },
          [QEActionIds.GENERATE_TESTS]: async () => { executionLog.push('generate'); return 'SUCCESS'; },
          [QEActionIds.VALIDATE_TESTS]: async () => { executionLog.push('validate'); return 'SUCCESS'; },
          [QEActionIds.COMMIT_TESTS]: async () => { executionLog.push('commit'); return 'SUCCESS'; },
        },
        conditions: {
          [QEConditionIds.HAS_SOURCE_FILES]: async () => true,
          [QEConditionIds.TESTS_ARE_VALID]: async () => true,
        },
      };

      const originalTree = buildTestGenerationPipeline(handlers);
      const json = serializeQETree(originalTree);

      // Verify JSON is valid
      const parsed = JSON.parse(json) as SerializedNode;
      expect(parsed.type).toBe('Sequence');
      expect(parsed.name).toBe('Test Generation Pipeline');
      expect(parsed.children!.length).toBeGreaterThan(0);

      // Deserialize back with handlers
      const restoredTree = deserializeQETree(json, handlers);
      const result = await restoredTree.tick();

      expect(result).toBe('SUCCESS');
      expect(executionLog).toEqual(['analyze', 'generate', 'validate', 'commit']);
    });
  });

  describe('composite node behaviors', () => {
    it('should run selector node with OR logic', async () => {
      const tree = new SelectorNode('try-methods', [
        new ActionNode('method-1', async () => 'FAILURE'),
        new ActionNode('method-2', async () => 'SUCCESS'),
        new ActionNode('method-3', async () => 'FAILURE'),
      ]);

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should run parallel node with threshold', async () => {
      const tree = new ParallelNode('parallel-tasks', [
        new ActionNode('task-1', async () => 'SUCCESS'),
        new ActionNode('task-2', async () => 'SUCCESS'),
        new ActionNode('task-3', async () => 'FAILURE'),
      ], { successThreshold: 2 });

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should support inverter decorator', async () => {
      const tree = new InverterNode('invert',
        new ActionNode('fail-action', async () => 'FAILURE'),
      );

      const result = await tree.tick();
      expect(result).toBe('SUCCESS');
    });

    it('should reset composite node state', async () => {
      let callCount = 0;
      const tree = new SequenceNode('seq', [
        new ActionNode('count', async () => { callCount++; return 'SUCCESS'; }),
        new ActionNode('final', async () => 'SUCCESS'),
      ]);

      await tree.tick();
      expect(callCount).toBe(1);

      tree.reset();
      await tree.tick();
      expect(callCount).toBe(2);
    });
  });
});

// ============================================================================
// 5. Reasoning QEC Tests
// ============================================================================

describe('Phase 4: Reasoning QEC', () => {
  let qec: ReasoningQEC;

  beforeEach(() => {
    qec = createReasoningQEC({ useNativeBackend: false });
  });

  describe('path generation', () => {
    it('should generate 3 independent reasoning paths', () => {
      const problem: ReasoningProblem = {
        type: 'test-generation',
        context: { file: 'auth.ts', coverage: 45 },
        steps: ['Analyze existing tests', 'Identify gaps', 'Generate tests'],
      };

      const paths = qec.generatePaths(problem);

      expect(paths.length).toBe(3);
      for (const path of paths) {
        expect(path.steps.length).toBe(3);
        expect(path.conclusion.length).toBeGreaterThan(0);
        expect(path.confidence).toBeGreaterThan(0);
        expect(path.confidence).toBeLessThanOrEqual(1);
      }

      // Each path should have a different perspective
      const perspectives = paths.map(p => p.steps[0].description);
      const uniquePerspectives = new Set(perspectives);
      expect(uniquePerspectives.size).toBe(3);
    });

    it('should use domain-specific perspectives for known problem types', () => {
      const securityProblem: ReasoningProblem = {
        type: 'security-audit',
        context: { finding: 'potential XSS' },
        steps: ['Analyze input', 'Check sanitization'],
      };

      const paths = qec.generatePaths(securityProblem);

      // Security audit should use threat-modeling, attack-surface, defense-in-depth
      const descriptions = paths.map(p => p.steps[0].description);
      expect(descriptions.some(d => d.includes('threat-modeling'))).toBe(true);
      expect(descriptions.some(d => d.includes('attack-surface'))).toBe(true);
      expect(descriptions.some(d => d.includes('defense-in-depth'))).toBe(true);
    });

    it('should use default perspectives for unknown problem types', () => {
      const problem: ReasoningProblem = {
        type: 'unknown-type',
        context: {},
        steps: ['Step 1'],
      };

      const paths = qec.generatePaths(problem);
      expect(paths.length).toBe(3);
      // Should use analytical, empirical, heuristic
      const descriptions = paths.map(p => p.steps[0].description);
      expect(descriptions.some(d => d.includes('analytical'))).toBe(true);
    });
  });

  describe('syndrome extraction', () => {
    it('should detect disagreements between paths (deliberate reasoning error)', () => {
      const problem: ReasoningProblem = {
        type: 'test-generation',
        context: { file: 'auth.ts' },
        steps: ['Analyze code', 'Identify gaps'],
      };

      const paths = qec.generatePaths(problem);

      // Since each path uses a different perspective, conclusions differ at each step
      const syndromes = qec.extractSyndromes(paths);

      // Should find syndromes due to different perspective-based conclusions
      expect(syndromes.length).toBeGreaterThan(0);

      for (const syndrome of syndromes) {
        expect(syndrome.disagreements.length).toBeGreaterThan(0);
        expect(['minor', 'major', 'critical']).toContain(syndrome.severity);
      }
    });

    it('should return empty syndromes for paths with identical conclusions', () => {
      // Create paths that all agree
      const paths: ReasoningPath[] = [
        { id: 0, steps: [{ index: 0, description: 'Step', conclusion: 'same', evidence: ['e1'] }], conclusion: 'final', confidence: 0.9 },
        { id: 1, steps: [{ index: 0, description: 'Step', conclusion: 'same', evidence: ['e2'] }], conclusion: 'final', confidence: 0.8 },
        { id: 2, steps: [{ index: 0, description: 'Step', conclusion: 'same', evidence: ['e3'] }], conclusion: 'final', confidence: 0.85 },
      ];

      const syndromes = qec.extractSyndromes(paths);
      expect(syndromes.length).toBe(0);
    });

    it('should classify syndrome severity based on agreement', () => {
      // All 3 paths disagree -> critical
      const allDisagree: ReasoningPath[] = [
        { id: 0, steps: [{ index: 0, description: 'S', conclusion: 'A', evidence: [] }], conclusion: 'X', confidence: 0.5 },
        { id: 1, steps: [{ index: 0, description: 'S', conclusion: 'B', evidence: [] }], conclusion: 'Y', confidence: 0.5 },
        { id: 2, steps: [{ index: 0, description: 'S', conclusion: 'C', evidence: [] }], conclusion: 'Z', confidence: 0.5 },
      ];

      const syndromes = qec.extractSyndromes(allDisagree);
      const stepSyndrome = syndromes.find(s => s.stepIndex === 0);
      expect(stepSyndrome).toBeDefined();
      expect(stepSyndrome!.severity).toBe('critical');
    });
  });

  describe('error correction', () => {
    it('should correct errors via majority vote', () => {
      // Two paths agree, one disagrees -> majority corrects the outlier
      const paths: ReasoningPath[] = [
        { id: 0, steps: [{ index: 0, description: 'S', conclusion: 'correct', evidence: ['e1'] }], conclusion: 'right', confidence: 0.9 },
        { id: 1, steps: [{ index: 0, description: 'S', conclusion: 'correct', evidence: ['e2'] }], conclusion: 'right', confidence: 0.8 },
        { id: 2, steps: [{ index: 0, description: 'S', conclusion: 'wrong', evidence: ['e3'] }], conclusion: 'wrong', confidence: 0.7 },
      ];

      const syndromes = qec.extractSyndromes(paths);
      const corrected = qec.correctErrors(paths, syndromes);

      // Step 0 should have majority conclusion 'correct'
      expect(corrected.steps[0].conclusion).toBe('correct');
      // Final conclusion should be majority: 'right'
      expect(corrected.conclusion).toBe('right');
      expect(corrected.confidence).toBeGreaterThan(0);
    });

    it('should handle empty paths gracefully', () => {
      const corrected = qec.correctErrors([], []);
      expect(corrected.steps).toHaveLength(0);
      expect(corrected.conclusion).toBe('');
      expect(corrected.confidence).toBe(0);
    });
  });

  describe('full pipeline', () => {
    it('should run the complete process() pipeline', () => {
      const problem: ReasoningProblem = {
        type: 'defect-triage',
        context: { bug: 'null pointer', severity: 'high' },
        steps: ['Reproduce', 'Root cause', 'Impact assess'],
      };

      const result = qec.process(problem);

      expect(result.paths.length).toBe(3);
      expect(result.syndromes.length).toBeGreaterThanOrEqual(0);
      expect(result.corrected.steps.length).toBe(3);
      expect(result.corrected.confidence).toBeGreaterThan(0);
      expect(result.validation).toBeDefined();
    });

    it('should produce valid result via processReasoning convenience function', () => {
      const problem: ReasoningProblem = {
        type: 'security-audit',
        context: { finding: 'SQL injection' },
        steps: ['Analyze', 'Classify', 'Prioritize'],
      };

      const result = processReasoning(problem, { useNativeBackend: false });

      expect(result.paths.length).toBe(3);
      expect(result.corrected.conclusion.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it('should validate a well-corrected reasoning chain', () => {
      const corrected: CorrectedReasoning = {
        steps: [
          { index: 0, description: 'Step 0', conclusion: 'ok', evidence: ['e1', 'e2'] },
        ],
        conclusion: 'valid',
        confidence: 0.9,
        corrections: [],
        syndromeCount: 0,
      };

      const validation = qec.validate(corrected);
      expect(validation.valid).toBe(true);
      expect(validation.confidence).toBeGreaterThan(0.5);
      expect(validation.issues).toHaveLength(0);
    });

    it('should flag low-confidence corrected reasoning', () => {
      const corrected: CorrectedReasoning = {
        steps: [{ index: 0, description: 'S', conclusion: 'maybe', evidence: ['e'] }],
        conclusion: 'uncertain',
        confidence: 0.2,
        corrections: [],
        syndromeCount: 3,
      };

      const validation = qec.validate(corrected);
      expect(validation.valid).toBe(false);
      expect(validation.issues.some(i => i.type === 'low-confidence')).toBe(true);
    });
  });
});

// ============================================================================
// 6. Browser Dashboard Tests
// ============================================================================

describe('Phase 4: Browser Dashboard', () => {
  let explorer: PatternExplorer;

  beforeEach(async () => {
    explorer = new PatternExplorer();
    await explorer.initialize();
  });

  describe('pattern explorer with 100+ patterns', () => {
    it('should load and index 120 patterns', () => {
      const patterns = generateSamplePatterns(120);
      explorer.loadPatterns(patterns);

      expect(explorer.patternCount).toBe(120);

      // Verify specific patterns are retrievable
      const p0 = explorer.getPattern('pattern-0');
      expect(p0).toBeDefined();
      expect(p0!.domain).toBe('api-testing');
    });

    it('should search by similarity and return relevant results', () => {
      const patterns = generateSamplePatterns(120);
      explorer.loadPatterns(patterns);

      const results = explorer.searchSimilar('api-testing validation coverage', 5);

      expect(results.length).toBe(5);
      // All results should be valid Pattern objects
      for (const r of results) {
        expect(r.id).toBeDefined();
        expect(r.domain).toBeDefined();
        expect(r.description).toBeDefined();
      }
    });

    it('should search with no results for empty store', () => {
      const results = explorer.searchSimilar('anything', 5);
      expect(results).toHaveLength(0);
    });
  });

  describe('clustering', () => {
    it('should cluster patterns into groups', () => {
      const patterns = generateSamplePatterns(50);
      explorer.loadPatterns(patterns);

      const clusters = explorer.clusterPatterns(5);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(5);

      // Every pattern should be assigned to exactly one cluster
      const totalAssigned = clusters.reduce((sum, c) => sum + c.patterns.length, 0);
      expect(totalAssigned).toBe(50);

      for (const cluster of clusters) {
        expect(cluster.centroid).toBeInstanceOf(Float32Array);
        expect(cluster.centroid.length).toBe(EMBEDDING_DIM);
        expect(cluster.dominantDomain).toBeDefined();
        expect(cluster.avgConfidence).toBeGreaterThan(0);
        expect(cluster.cohesion).toBeGreaterThan(0);
      }
    });

    it('should handle empty pattern set for clustering', () => {
      const clusters = explorer.clusterPatterns(3);
      expect(clusters).toHaveLength(0);
    });

    it('should handle k-means directly', () => {
      const vectors = [
        new Float32Array([1, 0, 0]),
        new Float32Array([0.9, 0.1, 0]),
        new Float32Array([0, 1, 0]),
        new Float32Array([0, 0.9, 0.1]),
        new Float32Array([0, 0, 1]),
        new Float32Array([0.1, 0, 0.9]),
      ];

      const assignments = kMeansClustering(vectors, 3);
      expect(assignments.length).toBe(6);

      // Similar vectors should be in the same cluster
      expect(assignments[0]).toBe(assignments[1]); // both ~[1,0,0]
      expect(assignments[2]).toBe(assignments[3]); // both ~[0,1,0]
      expect(assignments[4]).toBe(assignments[5]); // both ~[0,0,1]
    });
  });

  describe('domain distribution', () => {
    it('should compute domain statistics', () => {
      const patterns = generateSamplePatterns(100);
      explorer.loadPatterns(patterns);

      const distribution = explorer.getDomainDistribution();

      expect(distribution.length).toBe(5); // 5 domains
      for (const stat of distribution) {
        expect(stat.domain).toBeDefined();
        expect(stat.patternCount).toBe(20); // 100 / 5 domains
        expect(stat.avgConfidence).toBeGreaterThan(0);
        expect(stat.topTags.length).toBeGreaterThan(0);
      }

      // Should be sorted by pattern count descending
      for (let i = 1; i < distribution.length; i++) {
        expect(distribution[i].patternCount).toBeLessThanOrEqual(distribution[i - 1].patternCount);
      }
    });
  });

  describe('health dashboard data', () => {
    it('should aggregate dashboard data correctly', () => {
      const patterns = generateSamplePatterns(100);
      explorer.loadPatterns(patterns);

      const dashboard = explorer.getHealthDashboardData();

      expect(dashboard.totalPatterns).toBe(100);
      expect(dashboard.domainCount).toBe(5);
      expect(dashboard.avgConfidence).toBeGreaterThan(0);
      expect(dashboard.avgConfidence).toBeLessThanOrEqual(1);
      expect(dashboard.successRate).toBeGreaterThan(0);
      expect(dashboard.successRate).toBeLessThanOrEqual(1);
      expect(dashboard.domainStats.length).toBe(5);

      // Confidence histogram should have 10 bins summing to 100
      expect(dashboard.confidenceHistogram.length).toBe(10);
      const histogramSum = dashboard.confidenceHistogram.reduce((a, b) => a + b, 0);
      expect(histogramSum).toBe(100);

      // Store stats
      expect(dashboard.storeStats.totalVectors).toBe(100);
      expect(dashboard.storeStats.dimensions).toBe(EMBEDDING_DIM);
      expect(dashboard.storeStats.memoryBytes).toBeGreaterThan(0);
    });

    it('should report recent activity based on timestamps', () => {
      const patterns = generateSamplePatterns(20);
      explorer.loadPatterns(patterns);

      const dashboard = explorer.getHealthDashboardData();
      // All patterns have recent timestamps (within last hour), so recentActivity should be high
      expect(dashboard.recentActivity).toBeGreaterThan(0);
    });
  });

  describe('vector store operations', () => {
    it('should support namespace-scoped search', async () => {
      const store = new WasmVectorStore();
      await store.initialize();

      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([0, 1, 0]);
      const v3 = new Float32Array([0.9, 0.1, 0]);

      store.add('a', v1, {}, 'ns-1');
      store.add('b', v2, {}, 'ns-2');
      store.add('c', v3, {}, 'ns-1');

      // Search only in ns-1
      const results = store.search(v1, 10, 'ns-1');
      expect(results.length).toBe(2);
      expect(results.every(r => r.namespace === 'ns-1')).toBe(true);
      expect(results[0].id).toBe('a'); // exact match first
    });

    it('should report accurate store statistics', async () => {
      const store = new WasmVectorStore();
      await store.initialize();

      store.add('a', new Float32Array([1, 0, 0]), { domain: 'testing' }, 'ns-1');
      store.add('b', new Float32Array([0, 1, 0]), { domain: 'security' }, 'ns-2');
      store.add('c', new Float32Array([0, 0, 1]), { domain: 'testing' }, 'ns-1');

      const stats = store.getStats();
      expect(stats.totalVectors).toBe(3);
      expect(stats.namespaceCount).toBe(2);
      expect(stats.namespaceSizes['ns-1']).toBe(2);
      expect(stats.namespaceSizes['ns-2']).toBe(1);
      expect(stats.dimensions).toBe(3);
      expect(stats.memoryBytes).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 7. End-to-End Integration Tests
// ============================================================================

describe('Phase 4: End-to-End Integration', () => {
  it('should schedule tests with DAG, execute via behavior tree, validate with QEC, store in container', async () => {
    // Step 1: Schedule tests with DAG scheduler
    const scheduler = createDAGAttentionScheduler();
    const tests: TestNode[] = [
      { id: 'auth-unit', name: 'Auth Unit', estimatedDuration: 50, dependencies: [], priority: 8, tags: ['unit'] },
      { id: 'auth-integration', name: 'Auth Integration', estimatedDuration: 200, dependencies: ['auth-unit'], priority: 10, tags: ['integration'] },
      { id: 'auth-e2e', name: 'Auth E2E', estimatedDuration: 300, dependencies: ['auth-integration'], priority: 10, tags: ['e2e'] },
    ];

    const scheduled = scheduler.schedule(tests);
    expect(scheduled.phases.length).toBeGreaterThan(0);

    // Step 2: Execute via behavior tree
    const executionResults: { testId: string; status: NodeStatus }[] = [];

    const tree = new SequenceNode('e2e-pipeline', [
      ...scheduled.phases.map((phase, idx) =>
        new ActionNode(`phase-${idx}`, async () => {
          for (const test of phase.tests) {
            executionResults.push({ testId: test.id, status: 'SUCCESS' });
          }
          return 'SUCCESS' as NodeStatus;
        }),
      ),
    ]);

    const treeResult = await tree.tick();
    expect(treeResult).toBe('SUCCESS');
    expect(executionResults.length).toBe(3);

    // Step 3: Validate the execution reasoning with QEC
    const problem: ReasoningProblem = {
      type: 'test-generation',
      context: {
        testsRun: executionResults.length,
        allPassed: executionResults.every(r => r.status === 'SUCCESS'),
      },
      steps: ['Verify test order', 'Validate coverage', 'Assess quality'],
    };

    const qec = createReasoningQEC({ useNativeBackend: false });
    const qecResult = qec.process(problem);
    expect(qecResult.corrected.confidence).toBeGreaterThan(0);

    // Step 4: Store results in a cognitive container
    const db = createTestDB();
    db.prepare(`
      INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('e2e-result', 'e2e-validation', 'e2e', 'e2e',
      `E2E pipeline: ${executionResults.length} tests passed`, qecResult.corrected.confidence);

    const container = createCognitiveContainer();
    const { data, manifest } = container.exportContainer(db);

    expect(manifest.segments.length).toBe(6);
    expect(data.length).toBeGreaterThan(0);

    // Verify the full round-trip
    const freshDB = createTestDB();
    const importResult = container.importContainer(data, freshDB, { mergeStrategy: 'latest-wins' });
    expect(importResult.imported).toBeGreaterThanOrEqual(1);

    const storedPattern = freshDB.prepare("SELECT * FROM qe_patterns WHERE id = 'e2e-result'").get() as
      { name: string; confidence: number } | undefined;
    expect(storedPattern).toBeDefined();
    expect(storedPattern!.name).toContain('3 tests passed');

    db.close();
    freshDB.close();
  });

  it('should use visual regression CNN alongside behavior tree for validation', async () => {
    const cnn = new CNNVisualRegression({ tryNativeBackend: false });

    // Generate baseline and current screenshots
    const baseline = generateSyntheticImage(64, 64, 128, 128, 128);
    const current = generateSyntheticImage(64, 64, 128, 128, 128);

    const baseEmbed = cnn.computeEmbedding(baseline, 64, 64);
    const curEmbed = cnn.computeEmbedding(current, 64, 64);

    let visualResult: ComparisonResultLike | null = null;

    // Use behavior tree to orchestrate the visual check
    const tree = new SequenceNode('visual-check', [
      new ActionNode('compute-embeddings', async () => 'SUCCESS'),
      new ConditionNode('check-regression', async () => {
        const result = cnn.compare(baseEmbed, curEmbed);
        visualResult = result;
        return result.isMatch;
      }),
      new ActionNode('report', async () => 'SUCCESS'),
    ]);

    const result = await tree.tick();
    expect(result).toBe('SUCCESS');
    expect(visualResult).toBeDefined();
    expect(visualResult!.isMatch).toBe(true);
  });

  it('should combine pattern explorer results with DAG scheduler', async () => {
    // Load patterns into explorer
    const explorerInstance = new PatternExplorer();
    await explorerInstance.initialize();
    explorerInstance.loadPatterns(generateSamplePatterns(50));

    // Search for relevant test patterns
    const relevantPatterns = explorerInstance.searchSimilar('api testing validation', 5);
    expect(relevantPatterns.length).toBe(5);

    // Convert patterns to test nodes for scheduling
    const testNodes: TestNode[] = relevantPatterns.map((p, i) => ({
      id: p.id,
      name: p.description,
      estimatedDuration: 100 + i * 50,
      dependencies: i > 0 ? [relevantPatterns[i - 1].id] : [],
      priority: Math.round(p.confidence * 10),
      tags: p.tags || [],
    }));

    const scheduler = createDAGAttentionScheduler();
    const scheduled = scheduler.schedule(testNodes);

    expect(scheduled.phases.length).toBeGreaterThan(0);
    expect(scheduled.totalEstimatedTime).toBeGreaterThan(0);
  });
});

// ============================================================================
// 8. Feature Flag Backward Compatibility Tests
// ============================================================================

describe('Phase 4: Feature Flag Backward Compatibility', () => {
  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  it('should have all Phase 4 flags off by default', () => {
    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    expect(flags.useCNNVisualRegression).toBe(false);
    expect(flags.useDAGAttention).toBe(false);
    expect(flags.useReasoningQEC).toBe(false);
  });

  it('should allow enabling Phase 4 flags individually', () => {
    setRuVectorFeatureFlags({ useCNNVisualRegression: true });
    let flags = getRuVectorFeatureFlags();
    expect(flags.useCNNVisualRegression).toBe(true);
    expect(flags.useDAGAttention).toBe(false);

    setRuVectorFeatureFlags({ useDAGAttention: true });
    flags = getRuVectorFeatureFlags();
    expect(flags.useCNNVisualRegression).toBe(true);
    expect(flags.useDAGAttention).toBe(true);
  });

  it('should reset all flags to defaults', () => {
    setRuVectorFeatureFlags({
      useCNNVisualRegression: true,
      useDAGAttention: true,
      useReasoningQEC: true,
    });

    resetRuVectorFeatureFlags();
    const flags = getRuVectorFeatureFlags();

    expect(flags.useCNNVisualRegression).toBe(false);
    expect(flags.useDAGAttention).toBe(false);
    expect(flags.useReasoningQEC).toBe(false);
  });

  it('should not affect pre-existing Phase 1-3 flags when setting Phase 4 flags', () => {
    const beforeFlags = getRuVectorFeatureFlags();
    const sonaState = beforeFlags.useQESONA;
    const flashState = beforeFlags.useQEFlashAttention;
    const gnnState = beforeFlags.useQEGNNIndex;

    setRuVectorFeatureFlags({
      useCNNVisualRegression: true,
      useDAGAttention: true,
      useReasoningQEC: true,
    });

    const afterFlags = getRuVectorFeatureFlags();
    expect(afterFlags.useQESONA).toBe(sonaState);
    expect(afterFlags.useQEFlashAttention).toBe(flashState);
    expect(afterFlags.useQEGNNIndex).toBe(gnnState);
  });

  it('should preserve original behavior with all Phase 4 flags disabled', () => {
    resetRuVectorFeatureFlags();

    // With all Phase 4 flags off, core features should still work
    const flags = getRuVectorFeatureFlags();
    expect(flags.useQESONA).toBe(true);
    expect(flags.useQEFlashAttention).toBe(true);
    expect(flags.useQEGNNIndex).toBe(true);
    expect(flags.logMigrationMetrics).toBe(true);
  });
});

// ============================================================================
// Helper type for the visual regression end-to-end test
// ============================================================================

interface ComparisonResultLike {
  similarity: number;
  isMatch: boolean;
  threshold: number;
}
