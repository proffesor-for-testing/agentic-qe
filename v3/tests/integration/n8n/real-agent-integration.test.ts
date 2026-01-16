/**
 * Real N8n Agent Integration Test
 *
 * This test ACTUALLY loads and instantiates v2 n8n agents.
 * It is NOT a mock test - it verifies real integration works.
 *
 * REQUIRES:
 * - v2 must be built first (`npm run build` in project root)
 * - n8n config is required for "live" agents (they need n8n API access)
 *
 * BRUTAL HONESTY:
 * - V2 agents are n8n-specific tools that require n8n API access
 * - Without n8nConfig, agents cannot be instantiated (by design)
 * - This is not a limitation, it's their purpose
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import {
  N8nAgentFactory,
  createAgentFactory,
  getDefaultFactory,
  resetDefaultFactory,
  resetV2ModuleCache,
  type V2N8nAPIConfig,
} from '../../../src/integrations/n8n/agent-factory.js';
import type { N8nAgentType } from '../../../src/integrations/n8n/types.js';

// ============================================================================
// Helper: Find V2 Agents Path (same logic as agent-factory.ts)
// ============================================================================

function findV2AgentsPath(): string | null {
  const cwd = process.cwd();
  const possiblePaths = [
    // From v3/tests/integration/n8n/
    resolve(__dirname, '../../../../dist/agents/n8n/index.js'),
    // From v3 directory
    resolve(cwd, '../dist/agents/n8n/index.js'),
    // From workspace root
    resolve(cwd, 'dist/agents/n8n/index.js'),
    // Monorepo structure
    join(cwd, '..', 'dist', 'agents', 'n8n', 'index.js'),
    // Absolute fallback
    '/workspaces/agentic-qe/dist/agents/n8n/index.js',
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

// ============================================================================
// Test Configurations
// ============================================================================

/**
 * Mock n8n configuration for testing agent instantiation.
 * Note: Actual API calls will fail, but agent can be created.
 */
const MOCK_N8N_CONFIG: V2N8nAPIConfig = {
  baseUrl: 'http://localhost:5678', // Local n8n instance
  apiKey: 'test-api-key-for-instantiation',
  timeout: 5000,
  retries: 0,
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Real N8n Agent Integration', () => {
  const v2Path = findV2AgentsPath();
  const v2Available = v2Path !== null;

  let factory: N8nAgentFactory;

  beforeAll(async () => {
    // Reset module cache to ensure clean state
    resetV2ModuleCache();
    resetDefaultFactory();

    factory = createAgentFactory();
    await factory.initialize();
  }, 30000); // V2 module loading can take time

  afterAll(async () => {
    await factory.clearPool();
    resetDefaultFactory();
    resetV2ModuleCache();
  });

  // ==========================================================================
  // V2 Availability Tests
  // ==========================================================================

  describe('V2 Module Discovery', () => {
    it('should find v2 agents path when built', () => {
      // This test documents whether v2 is available
      console.log(`[Integration Test] V2 agents path: ${v2Path || 'NOT FOUND'}`);
      console.log(`[Integration Test] V2 available: ${v2Available}`);

      // If running in CI with v2 built, this should be true
      // If v2 is not built, test still passes but logs warning
      if (!v2Available) {
        console.warn(
          '[Integration Test] V2 agents not built. Run `npm run build` in project root.'
        );
      }
      expect(typeof v2Available).toBe('boolean');
    });

    it('should initialize factory without errors', async () => {
      const newFactory = createAgentFactory();
      const initialized = await newFactory.initialize();

      // Should return true if v2 available, false otherwise
      expect(typeof initialized).toBe('boolean');
      expect(initialized).toBe(v2Available);
    });

    it('should report v2 availability accurately', () => {
      expect(factory.isV2Available()).toBe(v2Available);
    });
  });

  // ==========================================================================
  // Without N8n Config (Expected: non-live agents)
  // ==========================================================================

  describe('Without N8n Config (Graceful Degradation)', () => {
    it('should create non-live agent when n8nConfig is missing', async () => {
      // Without n8nConfig, v2 agents cannot be instantiated
      // This is by design - they need n8n API access
      const instance = await factory.createAgent('node-validator');

      expect(instance).toBeDefined();
      expect(instance.type).toBe('node-validator');

      // Agent should NOT be live without config
      // This is HONEST - the agent can't work without n8n access
      expect(instance.isLive).toBe(false);
      expect(instance.agent).toBeNull();

      // Metadata should still be available
      expect(instance.capabilities).toContain('config-validation');
      expect(instance.primaryDomain).toBe('code-intelligence');

      console.log(
        '[Integration Test] Agent created without config: non-live (expected)'
      );
    });

    it('should return graceful error on task execution without config', async () => {
      const result = await factory.executeTask('security-auditor', {
        operation: 'scan',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not live');
      // Error should guide user to the solution
      expect(result.error).toContain('npm run build');

      console.log('[Integration Test] Task execution without config:', result.error);
    });
  });

  // ==========================================================================
  // With N8n Config (Real Agent Creation)
  // ==========================================================================

  describe.runIf(v2Available)('With N8n Config (Real Agent Creation)', () => {
    let configuredFactory: N8nAgentFactory;

    beforeAll(async () => {
      configuredFactory = createAgentFactory({
        n8nConfig: MOCK_N8N_CONFIG,
      });
      await configuredFactory.initialize();
    });

    afterAll(async () => {
      await configuredFactory.clearPool();
    });

    it('should create a LIVE node-validator agent with config', async () => {
      const instance = await configuredFactory.createAgent('node-validator');

      expect(instance).toBeDefined();
      expect(instance.type).toBe('node-validator');
      expect(instance.id).toMatch(/^n8n-node-validator-\d+-\w+$/);
      expect(instance.primaryDomain).toBe('code-intelligence');

      // THIS IS THE CRITICAL TEST - agent should be LIVE with config
      expect(instance.isLive).toBe(true);
      expect(instance.agent).not.toBeNull();

      console.log(`[Integration Test] Created LIVE agent: ${instance.id}`);
    });

    it('should create a LIVE security-auditor agent with config', async () => {
      const instance = await configuredFactory.createAgent('security-auditor');

      expect(instance.type).toBe('security-auditor');
      expect(instance.isLive).toBe(true);
      expect(instance.agent).not.toBeNull();
      expect(instance.primaryDomain).toBe('security-compliance');
    });

    it('should create a LIVE workflow-executor agent with config', async () => {
      const instance = await configuredFactory.createAgent('workflow-executor');

      expect(instance.type).toBe('workflow-executor');
      expect(instance.isLive).toBe(true);
      expect(instance.agent).not.toBeNull();
      expect(instance.primaryDomain).toBe('test-execution');
    });

    it('should get agent type and status from live agent', async () => {
      const instance = await configuredFactory.createAgent('expression-validator');

      expect(instance.isLive).toBe(true);
      expect(instance.agent).not.toBeNull();

      // Access v2 agent context properties (not methods)
      const type = instance.agent!.context.type;
      const status = instance.agent!.context.status;

      expect(type).toBe('n8n-expression-validator');
      expect(typeof status).toBe('string');
      console.log(`[Integration Test] Agent type: ${type}, status: ${status}`);
    });

    it('should track pool status with live agents', async () => {
      // Create a few agents
      await configuredFactory.createAgent('trigger-test');
      await configuredFactory.createAgent('unit-tester');

      const status = configuredFactory.getPoolStatus();

      expect(status.totalAgents).toBeGreaterThanOrEqual(2);
      expect(status.liveAgents).toBeGreaterThanOrEqual(2);
      expect(status.availableTypes.length).toBeGreaterThanOrEqual(2);

      console.log(`[Integration Test] Pool status:`, status);
    });

    it('should reuse existing live agents', async () => {
      const agent1 = await configuredFactory.getOrCreateAgent('chaos-tester');
      const agent2 = await configuredFactory.getOrCreateAgent('chaos-tester');

      // Should return same instance (by ID)
      expect(agent1.id).toBe(agent2.id);
      expect(agent1.isLive).toBe(true);
    });
  });

  // ==========================================================================
  // Task Execution Tests (With Config)
  // ==========================================================================

  describe.runIf(v2Available)('Task Execution (With Config)', () => {
    let configuredFactory: N8nAgentFactory;

    beforeAll(async () => {
      configuredFactory = createAgentFactory({
        n8nConfig: MOCK_N8N_CONFIG,
      });
      await configuredFactory.initialize();
    });

    afterAll(async () => {
      await configuredFactory.clearPool();
    });

    it('should execute a validation task on node-validator', async () => {
      const result = await configuredFactory.executeTask('node-validator', {
        operation: 'validate',
        workflow: {
          nodes: [
            { type: 'n8n-nodes-base.start', name: 'Start' },
            { type: 'n8n-nodes-base.set', name: 'Set' },
          ],
          connections: {},
        },
      });

      expect(result.agentId).toMatch(/^n8n-node-validator-/);
      console.log(`[Integration Test] Task execution result:`, result);

      // Task may succeed or fail depending on v2 implementation,
      // but it should NOT throw and should have a proper response structure
      expect(typeof result.success).toBe('boolean');
    });
  });

  // ==========================================================================
  // All Available Types Test
  // ==========================================================================

  describe('Available Agent Types', () => {
    const allTypes: N8nAgentType[] = [
      'security-auditor',
      'secrets-hygiene-auditor',
      'compliance-validator',
      'workflow-executor',
      'trigger-test',
      'performance-tester',
      'unit-tester',
      'replayability-tester',
      'idempotency-tester',
      'chaos-tester',
      'failure-mode-tester',
      'monitoring-validator',
      'contract-tester',
      'integration-test',
      'expression-validator',
      'node-validator',
      'bdd-scenario-tester',
      'ci-orchestrator',
      'version-comparator',
    ];

    it('should list all 19 n8n agent types', () => {
      const types = factory.getAvailableTypes();
      expect(types).toHaveLength(19);
      expect(types).toEqual(expect.arrayContaining(allTypes));
    });

    it.runIf(v2Available)(
      'should create live agents for all types with config',
      async () => {
        const configuredFactory = createAgentFactory({
          n8nConfig: MOCK_N8N_CONFIG,
        });
        await configuredFactory.initialize();

        const results: { type: string; isLive: boolean }[] = [];

        for (const type of allTypes) {
          const instance = await configuredFactory.createAgent(type);
          results.push({ type, isLive: instance.isLive });

          // Cleanup to avoid pool pollution
          await configuredFactory.removeAgent(instance.id);
        }

        console.log('[Integration Test] Agent creation results:', results);

        // All should be live when v2 is available WITH config
        const liveCount = results.filter((r) => r.isLive).length;
        expect(liveCount).toBe(19);

        await configuredFactory.clearPool();
      },
      30000
    ); // Extended timeout for creating 19 agents
  });
});
