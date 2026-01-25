import { VerificationHookManager } from '../../agentic-qe/src/hooks/VerificationHookManager';
import { SwarmMemoryManager } from '../../agentic-qe/src/memory/SwarmMemoryManager';

describe('VerificationHookManager', () => {
  let memory: SwarmMemoryManager;
  let hookManager: VerificationHookManager;

  beforeEach(async () => {
    memory = new SwarmMemoryManager(':memory:');
    await memory.initialize();
    hookManager = new VerificationHookManager(memory);
  });

  afterEach(async () => {
    await memory.close();
  });

  describe('PreToolUse Context Bundles', () => {
    test('should build small context bundle with top-5 artifacts', async () => {
      // Setup: Store some artifacts
      for (let i = 1; i <= 10; i++) {
        await memory.store(`artifact:${i}`, {
          id: `artifact-${i}`,
          path: `/path/to/artifact-${i}`,
          kind: 'code',
          sha256: `hash-${i}`
        }, { partition: 'artifacts' });
      }

      const bundle = await hookManager.buildPreToolUseBundle({
        task: 'generate-tests',
        maxArtifacts: 5
      });

      expect(bundle).toHaveProperty('summary');
      expect(bundle.summary).toBe('Task: generate-tests');

      expect(bundle).toHaveProperty('rules');
      expect(bundle.rules).toContain('prefer-small-diffs');
      expect(bundle.rules).toContain('tdd-required');
      expect(bundle.rules).toContain('coverage-95');

      expect(bundle).toHaveProperty('artifactIds');
      expect(bundle.artifactIds.length).toBeLessThanOrEqual(5);

      expect(bundle).toHaveProperty('hints');
      expect(bundle).toHaveProperty('patterns');
      expect(bundle).toHaveProperty('workflow');
    });

    test('should retrieve hints from blackboard (shared_state)', async () => {
      // First, post a hint
      await memory.postHint({
        key: 'aqe/test-context/current',
        value: { module: 'auth', priority: 'high' },
        ttl: 1800
      });

      const bundle = await hookManager.buildPreToolUseBundle({
        task: 'test-generation'
      });

      expect(bundle.hints).toHaveProperty('aqe/test-context/current');
      expect(bundle.hints['aqe/test-context/current'].module).toBe('auth');
      expect(bundle.hints['aqe/test-context/current'].priority).toBe('high');
    });

    test('should include patterns with threshold filtering', async () => {
      // Setup: Store patterns with different confidence levels
      await memory.store('patterns:auth-testing', {
        pattern: 'auth-testing',
        confidence: 0.92,
        description: 'Authentication testing pattern'
      }, { partition: 'patterns' });

      await memory.store('patterns:low-confidence', {
        pattern: 'low-confidence',
        confidence: 0.5,
        description: 'Low confidence pattern'
      }, { partition: 'patterns' });

      const bundle = await hookManager.buildPreToolUseBundle({
        task: 'test-generation'
      });

      expect(bundle.patterns.length).toBeGreaterThan(0);
      // Only patterns with confidence >= 0.8 should be included
      const highConfidencePatterns = bundle.patterns.filter(p => p.value.confidence >= 0.8);
      expect(highConfidencePatterns.length).toBe(1);
      expect(highConfidencePatterns[0].value.pattern).toBe('auth-testing');
    });

    test('should include current workflow state', async () => {
      // Setup: Store workflow state
      await memory.store('workflow:current', {
        phase: 'test-generation',
        step: 'unit-tests',
        progress: 0.5
      }, { partition: 'workflow_state' });

      const bundle = await hookManager.buildPreToolUseBundle({
        task: 'test-generation'
      });

      expect(bundle.workflow).toBeDefined();
      expect(bundle.workflow.phase).toBe('test-generation');
      expect(bundle.workflow.step).toBe('unit-tests');
    });
  });

  describe('PostToolUse Persistence', () => {
    test('should persist verified outcomes to multiple tables', async () => {
      await hookManager.persistPostToolUseOutcomes({
        events: [
          { type: 'test:generated', payload: { count: 50 } }
        ],
        patterns: [
          { pattern: 'auth-testing', confidence: 0.92 }
        ],
        checkpoints: [
          { step: 'generation-complete', status: 'completed' }
        ],
        artifacts: [
          { kind: 'code', path: './tests/auth.test.ts', sha256: 'abc123' }
        ],
        metrics: [
          { metric: 'generation-time', value: 25, unit: 'seconds' }
        ]
      });

      // Verify persisted to correct tables
      const events = await memory.query('events:%', { partition: 'events' });
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].value.type).toBe('test:generated');

      const patterns = await memory.query('patterns:%', { partition: 'patterns' });
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].value.pattern).toBe('auth-testing');

      const checkpoints = await memory.query('workflow:%', { partition: 'workflow_state' });
      expect(checkpoints.length).toBeGreaterThan(0);
      expect(checkpoints[0].value.status).toBe('completed');

      const artifacts = await memory.query('artifact:%', { partition: 'artifacts' });
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts[0].value.kind).toBe('code');

      const metrics = await memory.query('metrics:%', { partition: 'performance_metrics' });
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].value.metric).toBe('generation-time');
    });

    test('should emit post-tool-use:persisted event', async () => {
      const eventPromise = new Promise<any>((resolve) => {
        hookManager.once('post-tool-use:persisted', resolve);
      });

      const outcomes = {
        events: [{ type: 'test:completed', payload: {} }],
        patterns: [],
        checkpoints: [],
        artifacts: [],
        metrics: []
      };

      await hookManager.persistPostToolUseOutcomes(outcomes);

      const emittedOutcomes = await eventPromise;
      expect(emittedOutcomes).toEqual(outcomes);
    });

    test('should handle TTL for events (30 days)', async () => {
      await hookManager.persistPostToolUseOutcomes({
        events: [
          { type: 'test:generated', payload: { count: 50 } }
        ],
        patterns: [],
        checkpoints: [],
        artifacts: [],
        metrics: []
      });

      const events = await memory.query('events:%', { partition: 'events' });
      // Calculate expected expiration (approximately 30 days from now)
      const expectedExpiration = Date.now() + (2592000 * 1000);
      const actualExpiration = events[0].expiresAt || 0;

      // Allow 1 second tolerance for test execution time
      expect(actualExpiration).toBeGreaterThan(expectedExpiration - 1000);
      expect(actualExpiration).toBeLessThan(expectedExpiration + 1000);
    });

    test('should handle TTL for patterns (7 days)', async () => {
      await hookManager.persistPostToolUseOutcomes({
        events: [],
        patterns: [
          { pattern: 'test-pattern', confidence: 0.9 }
        ],
        checkpoints: [],
        artifacts: [],
        metrics: []
      });

      const patterns = await memory.query('patterns:%', { partition: 'patterns' });
      // Calculate expected expiration (approximately 7 days from now)
      const expectedExpiration = Date.now() + (604800 * 1000);
      const actualExpiration = patterns[0].expiresAt || 0;

      // Allow 1 second tolerance for test execution time
      expect(actualExpiration).toBeGreaterThan(expectedExpiration - 1000);
      expect(actualExpiration).toBeLessThan(expectedExpiration + 1000);
    });

    test('should persist checkpoints with no expiration', async () => {
      await hookManager.persistPostToolUseOutcomes({
        events: [],
        patterns: [],
        checkpoints: [
          { step: 'critical-checkpoint', status: 'completed' }
        ],
        artifacts: [],
        metrics: []
      });

      const checkpoints = await memory.query('workflow:%', { partition: 'workflow_state' });
      // SQLite returns null for missing TTL values (which means no expiration)
      expect(checkpoints[0].expiresAt).toBeNull();
    });
  });

  describe('5-Stage Verification Hooks', () => {
    test('should execute pre-task verification with priority 100', async () => {
      const result = await hookManager.executePreTaskVerification({
        task: 'test-generation',
        context: { module: 'auth' }
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.9);
      expect(result.priority).toBe(100);
      expect(result.checks).toContain('environment-check');
      expect(result.checks).toContain('resource-check');
      expect(result.checks).toContain('dependency-check');
    });

    test('should execute post-task validation with priority 90', async () => {
      const result = await hookManager.executePostTaskValidation({
        task: 'test-generation',
        result: { testsGenerated: 50, coverage: 0.95 }
      });

      expect(result.valid).toBe(true);
      expect(result.accuracy).toBeGreaterThanOrEqual(0.95);
      expect(result.priority).toBe(90);
      expect(result.validations).toContain('output-validation');
      expect(result.validations).toContain('quality-check');
    });

    test('should execute pre-edit verification with priority 80', async () => {
      const result = await hookManager.executePreEditVerification({
        file: './src/auth.ts',
        changes: { type: 'modification', lines: 25 }
      });

      expect(result.allowed).toBe(true);
      expect(result.priority).toBe(80);
      expect(result.checks).toContain('file-lock-check');
      expect(result.checks).toContain('syntax-validation');
    });

    test('should execute post-edit update with priority 70', async () => {
      const result = await hookManager.executePostEditUpdate({
        file: './src/auth.ts',
        changes: { linesAdded: 10, linesRemoved: 5 }
      });

      expect(result.updated).toBe(true);
      expect(result.priority).toBe(70);
      expect(result.updates).toContain('artifact-tracking');
      expect(result.updates).toContain('dependency-update');
    });

    test('should execute session-end finalization with priority 60', async () => {
      const result = await hookManager.executeSessionEndFinalization({
        sessionId: 'test-session-123',
        duration: 3600,
        tasksCompleted: 5
      });

      expect(result.finalized).toBe(true);
      expect(result.priority).toBe(60);
      expect(result.actions).toContain('state-export');
      expect(result.actions).toContain('metrics-aggregation');
      expect(result.actions).toContain('cleanup');
    });

    test('should execute hooks in priority order', async () => {
      const executionOrder: number[] = [];

      hookManager.on('hook:executed', (data) => {
        executionOrder.push(data.priority);
      });

      await hookManager.executePreTaskVerification({ task: 'test' });
      await hookManager.executePostTaskValidation({ task: 'test', result: {} });
      await hookManager.executePreEditVerification({ file: 'test.ts', changes: {} });
      await hookManager.executePostEditUpdate({ file: 'test.ts', changes: {} });
      await hookManager.executeSessionEndFinalization({ sessionId: 'test', duration: 0, tasksCompleted: 0 });

      // Verify execution order: 100, 90, 80, 70, 60
      expect(executionOrder).toEqual([100, 90, 80, 70, 60]);
    });
  });

  describe('Hook Integration', () => {
    test('should coordinate context building and persistence', async () => {
      // Setup initial context
      await memory.postHint({
        key: 'aqe/test-context/module',
        value: { name: 'authentication', priority: 'critical' },
        ttl: 1800
      });

      // Build context bundle
      const bundle = await hookManager.buildPreToolUseBundle({
        task: 'test-generation'
      });

      expect(bundle.hints['aqe/test-context/module'].name).toBe('authentication');

      // Execute task (simulated)
      const taskResult = {
        testsGenerated: 25,
        coverage: 0.92
      };

      // Persist outcomes
      await hookManager.persistPostToolUseOutcomes({
        events: [
          { type: 'test:completed', payload: taskResult }
        ],
        patterns: [
          { pattern: 'auth-testing', confidence: 0.92 }
        ],
        checkpoints: [
          { step: 'test-generation', status: 'completed' }
        ],
        artifacts: [
          { kind: 'test', path: './tests/auth.test.ts', sha256: 'xyz789' }
        ],
        metrics: [
          { metric: 'tests-generated', value: 25, unit: 'count' }
        ]
      });

      // Verify persistence
      const events = await memory.query('events:%', { partition: 'events' });
      expect(events[0].value.payload.testsGenerated).toBe(25);
    });
  });
});
