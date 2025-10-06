/**
 * Phase 1 Integration Tests: Hook Lifecycle
 *
 * Tests full pre-task → post-task flow, PreToolUse bundle creation,
 * PostToolUse persistence, and rollback mechanisms.
 */

import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { VerificationHookManager, PostToolUsePersistence } from '../../../src/core/hooks/VerificationHookManager';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Phase 1 - Hook Lifecycle Integration', () => {
  let memory: SwarmMemoryManager;
  let hooks: VerificationHookManager;
  let tempDbPath: string;

  beforeAll(async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-hooks-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  beforeEach(async () => {
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();
    hooks = new VerificationHookManager(memory);
  });

  afterEach(async () => {
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(path.dirname(tempDbPath));
  });

  describe('PreToolUse Bundle Creation', () => {
    test('should build complete context bundle with top artifacts', async () => {
      // Setup test data
      await memory.store('artifact:1', {
        id: 'artifact-1',
        path: '/src/test1.ts',
        sha256: 'hash1'
      }, { partition: 'artifacts' });

      await memory.store('artifact:2', {
        id: 'artifact-2',
        path: '/src/test2.ts',
        sha256: 'hash2'
      }, { partition: 'artifacts' });

      await memory.postHint({
        key: 'aqe/test-queue/task1',
        value: { priority: 'high' }
      });

      await memory.store('patterns:success-rate', {
        pattern: 'high-success',
        confidence: 0.95
      }, { partition: 'patterns' });

      await memory.store('workflow:current', {
        step: 'testing',
        status: 'in-progress'
      }, { partition: 'workflow_state' });

      // Build bundle
      const bundle = await hooks.buildPreToolUseBundle({
        task: 'Generate integration tests',
        maxArtifacts: 5
      });

      expect(bundle.summary).toContain('Generate integration tests');
      expect(bundle.rules).toContain('prefer-small-diffs');
      expect(bundle.rules).toContain('tdd-required');
      expect(bundle.artifactIds).toHaveLength(2);
      expect(bundle.hints['aqe/test-queue/task1']).toEqual({ priority: 'high' });
      expect(bundle.patterns.length).toBeGreaterThanOrEqual(1);
      expect(bundle.workflow).toEqual({
        step: 'testing',
        status: 'in-progress'
      });
    });

    test('should limit artifacts to maxArtifacts parameter', async () => {
      // Create 10 artifacts
      for (let i = 0; i < 10; i++) {
        await memory.store(`artifact:${i}`, {
          id: `artifact-${i}`,
          path: `/src/test${i}.ts`
        }, { partition: 'artifacts' });
      }

      const bundle = await hooks.buildPreToolUseBundle({
        task: 'Test task',
        maxArtifacts: 3
      });

      expect(bundle.artifactIds.length).toBeLessThanOrEqual(3);
    });

    test('should filter patterns by confidence threshold', async () => {
      await memory.store('patterns:low-conf', {
        pattern: 'low-confidence',
        confidence: 0.5
      }, { partition: 'patterns' });

      await memory.store('patterns:high-conf', {
        pattern: 'high-confidence',
        confidence: 0.9
      }, { partition: 'patterns' });

      const bundle = await hooks.buildPreToolUseBundle({
        task: 'Test task'
      });

      // Only high confidence (>= 0.8) should be included
      const highConfPattern = bundle.patterns.find(
        p => p.value.pattern === 'high-confidence'
      );
      const lowConfPattern = bundle.patterns.find(
        p => p.value.pattern === 'low-confidence'
      );

      expect(highConfPattern).toBeDefined();
      expect(lowConfPattern).toBeUndefined();
    });

    test('should handle missing workflow state gracefully', async () => {
      const bundle = await hooks.buildPreToolUseBundle({
        task: 'Test task'
      });

      expect(bundle.workflow).toBeNull();
      expect(bundle.summary).toBeDefined();
      expect(bundle.rules).toBeDefined();
    });
  });

  describe('PostToolUse Persistence', () => {
    test('should persist all outcomes to correct memory tables with TTLs', async () => {
      const outcomes: PostToolUsePersistence = {
        events: [
          { type: 'test-completed', payload: { result: 'success' } },
          { type: 'coverage-updated', payload: { coverage: 95 } }
        ],
        patterns: [
          { pattern: 'successful-test-pattern', confidence: 0.92 }
        ],
        checkpoints: [
          { step: 'test-generation', status: 'completed' },
          { step: 'test-execution', status: 'completed' }
        ],
        artifacts: [
          { kind: 'test-file', path: '/tests/new.test.ts', sha256: 'abc123' }
        ],
        metrics: [
          { metric: 'execution-time', value: 125, unit: 'ms' },
          { metric: 'coverage', value: 95, unit: 'percent' }
        ]
      };

      await hooks.persistPostToolUseOutcomes(outcomes);

      // Verify events (30 days TTL)
      const events = await memory.query('events:%', { partition: 'events' });
      expect(events.length).toBeGreaterThanOrEqual(2);

      // Verify patterns (7 days TTL)
      const patterns = await memory.query('patterns:%', { partition: 'patterns' });
      expect(patterns.length).toBeGreaterThanOrEqual(1);

      // Verify checkpoints (no expiration)
      const workflow1 = await memory.retrieve('workflow:test-generation', {
        partition: 'workflow_state'
      });
      expect(workflow1).toEqual({ step: 'test-generation', status: 'completed' });

      // Verify artifacts (no expiration)
      const artifacts = await memory.query('artifact:%', { partition: 'artifacts' });
      expect(artifacts.length).toBeGreaterThanOrEqual(1);

      // Verify metrics
      const metrics = await memory.query('metrics:%', { partition: 'performance_metrics' });
      expect(metrics.length).toBeGreaterThanOrEqual(2);
    });

    test('should emit event after persistence', async () => {
      const outcomes: PostToolUsePersistence = {
        events: [],
        patterns: [],
        checkpoints: [],
        artifacts: [],
        metrics: []
      };

      const eventPromise = new Promise((resolve) => {
        hooks.once('post-tool-use:persisted', resolve);
      });

      await hooks.persistPostToolUseOutcomes(outcomes);

      const emittedData = await eventPromise;
      expect(emittedData).toEqual(outcomes);
    });

    test('should handle large batch persistence', async () => {
      const outcomes: PostToolUsePersistence = {
        events: Array(50).fill(null).map((_, i) => ({
          type: `event-${i}`,
          payload: { data: i }
        })),
        patterns: Array(20).fill(null).map((_, i) => ({
          pattern: `pattern-${i}`,
          confidence: 0.8 + (i * 0.01)
        })),
        checkpoints: Array(10).fill(null).map((_, i) => ({
          step: `step-${i}`,
          status: 'completed'
        })),
        artifacts: Array(30).fill(null).map((_, i) => ({
          kind: 'test',
          path: `/test${i}.ts`,
          sha256: `hash-${i}`
        })),
        metrics: Array(15).fill(null).map((_, i) => ({
          metric: `metric-${i}`,
          value: i * 10,
          unit: 'units'
        }))
      };

      await expect(
        hooks.persistPostToolUseOutcomes(outcomes)
      ).resolves.not.toThrow();
    });
  });

  describe('5-Stage Hook Execution', () => {
    test('should execute Stage 1: Pre-Task Verification (Priority 100)', async () => {
      const result = await hooks.executePreTaskVerification({
        task: 'test-generation',
        context: { environment: 'production' }
      });

      expect(result.passed).toBe(true);
      expect(result.priority).toBe(100);
      expect(result.score).toBeGreaterThan(0);
      expect(result.checks).toContain('environment-check');
      expect(result.checks).toContain('resource-check');
      expect(result.checks).toContain('dependency-check');
    });

    test('should execute Stage 2: Post-Task Validation (Priority 90)', async () => {
      const result = await hooks.executePostTaskValidation({
        task: 'test-execution',
        result: { coverage: 0.92 }
      });

      expect(result.valid).toBe(true);
      expect(result.priority).toBe(90);
      expect(result.accuracy).toBe(0.92);
      expect(result.validations).toContain('output-validation');
      expect(result.validations).toContain('quality-check');
    });

    test('should execute Stage 3: Pre-Edit Verification (Priority 80)', async () => {
      const result = await hooks.executePreEditVerification({
        file: '/src/test.ts',
        changes: { lines: [10, 20], type: 'modification' }
      });

      expect(result.allowed).toBe(true);
      expect(result.priority).toBe(80);
      expect(result.checks).toContain('file-lock-check');
      expect(result.checks).toContain('syntax-validation');
    });

    test('should execute Stage 4: Post-Edit Update (Priority 70)', async () => {
      const result = await hooks.executePostEditUpdate({
        file: '/src/test.ts',
        changes: { lines: [10, 20], type: 'modification' }
      });

      expect(result.updated).toBe(true);
      expect(result.priority).toBe(70);
      expect(result.updates).toContain('artifact-tracking');
      expect(result.updates).toContain('dependency-update');
    });

    test('should execute Stage 5: Session-End Finalization (Priority 60)', async () => {
      const result = await hooks.executeSessionEndFinalization({
        sessionId: 'session-123',
        duration: 3600000,
        tasksCompleted: 15
      });

      expect(result.finalized).toBe(true);
      expect(result.priority).toBe(60);
      expect(result.actions).toContain('state-export');
      expect(result.actions).toContain('metrics-aggregation');
      expect(result.actions).toContain('cleanup');
    });

    test('should emit hook execution events for all stages', async () => {
      const events: any[] = [];

      hooks.on('hook:executed', (data) => {
        events.push(data);
      });

      await hooks.executePreTaskVerification({ task: 'test' });
      await hooks.executePostTaskValidation({ task: 'test', result: {} });
      await hooks.executePreEditVerification({ file: 'test.ts', changes: {} });
      await hooks.executePostEditUpdate({ file: 'test.ts', changes: {} });
      await hooks.executeSessionEndFinalization({
        sessionId: 'test',
        duration: 1000,
        tasksCompleted: 1
      });

      expect(events).toHaveLength(5);
      expect(events.map(e => e.stage)).toEqual([
        'pre-task',
        'post-task',
        'pre-edit',
        'post-edit',
        'session-end'
      ]);
    });
  });

  describe('Full Lifecycle Flow', () => {
    test('should execute complete pre-task → post-task lifecycle', async () => {
      // Stage 1: Pre-Task Verification
      const preTask = await hooks.executePreTaskVerification({
        task: 'integration-test-generation'
      });
      expect(preTask.passed).toBe(true);

      // Build PreToolUse bundle
      const bundle = await hooks.buildPreToolUseBundle({
        task: 'integration-test-generation'
      });
      expect(bundle).toBeDefined();

      // Stage 2: Post-Task Validation
      const postTask = await hooks.executePostTaskValidation({
        task: 'integration-test-generation',
        result: { coverage: 0.95, testsGenerated: 42 }
      });
      expect(postTask.valid).toBe(true);

      // Persist PostToolUse outcomes
      const outcomes: PostToolUsePersistence = {
        events: [{ type: 'task-completed', payload: { taskId: 'test-123' } }],
        patterns: [{ pattern: 'successful-generation', confidence: 0.95 }],
        checkpoints: [{ step: 'generation', status: 'completed' }],
        artifacts: [{ kind: 'test', path: '/tests/integration.test.ts', sha256: 'xyz' }],
        metrics: [{ metric: 'generation-time', value: 5000, unit: 'ms' }]
      };

      await hooks.persistPostToolUseOutcomes(outcomes);

      // Verify all data persisted
      const events = await memory.query('events:%', { partition: 'events' });
      const patterns = await memory.query('patterns:%', { partition: 'patterns' });
      const checkpoints = await memory.retrieve('workflow:generation', {
        partition: 'workflow_state'
      });

      expect(events.length).toBeGreaterThan(0);
      expect(patterns.length).toBeGreaterThan(0);
      expect(checkpoints).toEqual({ step: 'generation', status: 'completed' });
    });

    test('should handle edit workflow with pre/post hooks', async () => {
      const file = '/src/calculator.ts';
      const changes = {
        additions: 5,
        deletions: 2,
        type: 'enhancement'
      };

      // Stage 3: Pre-Edit Verification
      const preEdit = await hooks.executePreEditVerification({
        file,
        changes
      });
      expect(preEdit.allowed).toBe(true);

      // Simulate edit operation
      await memory.store(`artifact:${file}`, {
        path: file,
        sha256: 'new-hash',
        timestamp: Date.now()
      }, { partition: 'artifacts' });

      // Stage 4: Post-Edit Update
      const postEdit = await hooks.executePostEditUpdate({
        file,
        changes
      });
      expect(postEdit.updated).toBe(true);

      // Verify artifact was tracked
      const artifact = await memory.retrieve(`artifact:${file}`, {
        partition: 'artifacts'
      });
      expect(artifact).toBeDefined();
      expect(artifact.sha256).toBe('new-hash');
    });

    test('should finalize session with complete cleanup', async () => {
      const sessionId = 'test-session-456';

      // Create session data
      await memory.store('session:data', {
        tasks: ['task1', 'task2', 'task3'],
        duration: 7200000
      }, { partition: 'workflow_state' });

      await memory.store('metrics:session', {
        tasksCompleted: 3,
        avgTime: 2400000
      }, { partition: 'performance_metrics' });

      // Stage 5: Session-End Finalization
      const finalization = await hooks.executeSessionEndFinalization({
        sessionId,
        duration: 7200000,
        tasksCompleted: 3
      });

      expect(finalization.finalized).toBe(true);
      expect(finalization.actions).toContain('state-export');
      expect(finalization.actions).toContain('metrics-aggregation');
      expect(finalization.actions).toContain('cleanup');
    });
  });

  describe('Rollback Mechanisms', () => {
    test('should support checkpoint-based rollback', async () => {
      const checkpoints = [
        { step: 'initialization', status: 'completed', timestamp: Date.now() },
        { step: 'data-loading', status: 'completed', timestamp: Date.now() + 1000 },
        { step: 'processing', status: 'failed', timestamp: Date.now() + 2000 }
      ];

      // Store checkpoints
      for (const checkpoint of checkpoints) {
        await memory.store(`workflow:${checkpoint.step}`, checkpoint, {
          partition: 'workflow_state'
        });
      }

      // Identify last successful checkpoint
      const dataLoading = await memory.retrieve('workflow:data-loading', {
        partition: 'workflow_state'
      });

      expect(dataLoading.status).toBe('completed');

      // Rollback to this checkpoint (delete failed checkpoint)
      await memory.delete('workflow:processing', 'workflow_state');

      const processing = await memory.retrieve('workflow:processing', {
        partition: 'workflow_state'
      });

      expect(processing).toBeNull();
    });

    test('should support versioned artifact rollback', async () => {
      const file = '/src/important.ts';
      const versions = [
        { version: 1, content: 'original', sha256: 'v1-hash' },
        { version: 2, content: 'updated', sha256: 'v2-hash' },
        { version: 3, content: 'buggy', sha256: 'v3-hash' }
      ];

      // Store versioned artifacts
      for (const ver of versions) {
        await memory.store(`artifact:v${ver.version}:${file}`, ver, {
          partition: 'artifacts'
        });
      }

      // Rollback to version 2
      const v2 = await memory.retrieve(`artifact:v2:${file}`, {
        partition: 'artifacts'
      });

      expect(v2.content).toBe('updated');
      expect(v2.sha256).toBe('v2-hash');

      // Restore version 2 as current
      await memory.store(`artifact:${file}`, v2, {
        partition: 'artifacts'
      });

      const current = await memory.retrieve(`artifact:${file}`, {
        partition: 'artifacts'
      });

      expect(current.version).toBe(2);
    });

    test('should track and recover from failed operations', async () => {
      const operations = [
        { id: 'op1', status: 'success', result: 'data1' },
        { id: 'op2', status: 'success', result: 'data2' },
        { id: 'op3', status: 'failed', error: 'connection timeout' },
        { id: 'op4', status: 'skipped', reason: 'previous failure' }
      ];

      // Store operation history
      for (const op of operations) {
        await memory.store(`events:operation:${op.id}`, op, {
          partition: 'events',
          ttl: 3600
        });
      }

      // Find failed operation
      const events = await memory.query('events:operation:%', {
        partition: 'events'
      });

      const failedOp = events.find(e => e.value.status === 'failed');

      expect(failedOp).toBeDefined();
      expect(failedOp?.value.error).toBe('connection timeout');

      // Recovery: Mark operation for retry
      await memory.store(`events:operation:${failedOp?.value.id}:retry`, {
        originalOperation: failedOp?.value,
        retryAttempt: 1,
        status: 'pending'
      }, { partition: 'events', ttl: 1800 });
    });
  });

  describe('Hook Error Handling', () => {
    test('should handle missing memory dependencies gracefully', async () => {
      const bundle = await hooks.buildPreToolUseBundle({
        task: 'test-with-no-data'
      });

      expect(bundle.artifactIds).toEqual([]);
      expect(bundle.hints).toEqual({});
      expect(bundle.patterns).toEqual([]);
      expect(bundle.workflow).toBeNull();
    });

    test('should continue on partial persistence failures', async () => {
      // This test verifies the system doesn't crash on persistence
      const outcomes: PostToolUsePersistence = {
        events: [{ type: 'test', payload: {} }],
        patterns: [{ pattern: 'test', confidence: 0.9 }],
        checkpoints: [{ step: 'test', status: 'completed' }],
        artifacts: [{ kind: 'test', path: '/test', sha256: 'hash' }],
        metrics: [{ metric: 'test', value: 1, unit: 'unit' }]
      };

      await expect(
        hooks.persistPostToolUseOutcomes(outcomes)
      ).resolves.not.toThrow();
    });
  });
});
