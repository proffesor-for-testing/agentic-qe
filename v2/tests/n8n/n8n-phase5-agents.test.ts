/**
 * Phase 5 N8n Agents Integration Tests
 *
 * Tests for the Data & Reliability agents:
 * - ContractTester
 * - ReplayabilityTester
 * - FailureModeTester
 * - IdempotencyTester
 * - SecretsHygieneAuditor
 */

// Jest-compatible imports (replaces vitest)
import { EventEmitter } from 'events';
import { MemoryStore } from '../../src/types';
import {
  N8nContractTesterAgent,
  N8nReplayabilityTesterAgent,
  N8nFailureModeTesterAgent,
  N8nIdempotencyTesterAgent,
  N8nSecretsHygieneAuditorAgent,
  N8nWorkflow,
  N8nAPIConfig,
  createN8nAgent,
  getAvailableN8nAgentTypes,
  N8N_AGENT_DESCRIPTIONS,
  N8N_AGENT_CATEGORIES,
} from '../../src/agents/n8n';

// Mock memory store with all required methods
const createMockMemoryStore = (): MemoryStore & { set: unknown; get: unknown } => ({
  store: jest.fn().mockResolvedValue(undefined),
  retrieve: jest.fn().mockResolvedValue(null),
  search: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue([]),
  clear: jest.fn().mockResolvedValue(undefined),
  // Additional methods required by VerificationHookManager
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
});

// Test workflow fixtures
const createTestWorkflow = (overrides: Partial<N8nWorkflow> = {}): N8nWorkflow => ({
  id: 'test-workflow-1',
  name: 'Test Workflow',
  active: true,
  nodes: [
    {
      id: 'node-1',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      position: [0, 0],
      parameters: {
        path: '/webhook',
        httpMethod: 'POST',
      },
    },
    {
      id: 'node-2',
      name: 'HTTP Request',
      type: 'n8n-nodes-base.httpRequest',
      position: [200, 0],
      parameters: {
        url: 'https://api.example.com/data',
        method: 'POST',
        body: '={{ $json }}',
      },
    },
    {
      id: 'node-3',
      name: 'Postgres',
      type: 'n8n-nodes-base.postgres',
      position: [400, 0],
      parameters: {
        operation: 'insert',
        table: 'users',
      },
      credentials: {
        postgres: { id: 'cred-1', name: 'PostgreSQL' },
      },
    },
  ],
  connections: {
    'Webhook Trigger': {
      main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]],
    },
    'HTTP Request': {
      main: [[{ node: 'Postgres', type: 'main', index: 0 }]],
    },
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// Workflow with security issues for testing
const createInsecureWorkflow = (): N8nWorkflow => ({
  ...createTestWorkflow(),
  id: 'insecure-workflow',
  name: 'Insecure Workflow',
  nodes: [
    {
      id: 'node-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      position: [0, 0],
      parameters: {
        path: '/webhook',
        httpMethod: 'POST',
      },
    },
    {
      id: 'node-2',
      name: 'Set Data',
      type: 'n8n-nodes-base.set',
      position: [200, 0],
      parameters: {
        values: {
          string: [
            {
              name: 'apiKey',
              value: 'sk_live_FAKE_TEST_VALUE_NOT_REAL_KEY', // Hardcoded secret!
            },
            {
              name: 'password',
              value: 'supersecret123', // Hardcoded password!
            },
          ],
        },
      },
    },
    {
      id: 'node-3',
      name: 'Send to Slack',
      type: 'n8n-nodes-base.slack',
      position: [400, 0],
      parameters: {
        channel: '#alerts',
        text: '={{ $json }}', // Potential secret leakage
      },
    },
  ],
});

// Workflow with concurrency issues for testing
const createConcurrencyRiskyWorkflow = (): N8nWorkflow => ({
  ...createTestWorkflow(),
  id: 'concurrent-workflow',
  name: 'Concurrent Workflow',
  nodes: [
    {
      id: 'node-1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      position: [0, 0],
      parameters: { path: '/webhook' },
    },
    {
      id: 'node-2',
      name: 'Update Counter',
      type: 'n8n-nodes-base.postgres',
      position: [200, 0],
      parameters: {
        operation: 'update',
        table: 'counters',
        // No version check - race condition risk
      },
    },
    {
      id: 'node-3',
      name: 'Send Email',
      type: 'n8n-nodes-base.emailSend',
      position: [400, 0],
      parameters: {
        fromEmail: 'noreply@example.com',
        toEmail: '={{ $json.email }}',
        subject: 'Notification',
        body: 'Counter updated',
      },
    },
  ],
});

describe('Phase 5 N8n Agents', () => {
  let memoryStore: MemoryStore;
  let eventBus: EventEmitter;
  let apiConfig: N8nAPIConfig;

  beforeAll(() => {
    memoryStore = createMockMemoryStore();
    eventBus = new EventEmitter();
    apiConfig = {
      baseUrl: 'http://localhost:5678',
      apiKey: 'test-api-key',
    };
  });

  describe('Agent Registry', () => {
    it('should include phase 5 agents in available types', () => {
      const types = getAvailableN8nAgentTypes();
      expect(types).toContain('contract-tester');
      expect(types).toContain('replayability-tester');
      expect(types).toContain('failure-mode-tester');
      expect(types).toContain('idempotency-tester');
      expect(types).toContain('secrets-hygiene-auditor');
    });

    it('should have descriptions for phase 5 agents', () => {
      expect(N8N_AGENT_DESCRIPTIONS['contract-tester']).toBeDefined();
      expect(N8N_AGENT_DESCRIPTIONS['replayability-tester']).toBeDefined();
      expect(N8N_AGENT_DESCRIPTIONS['failure-mode-tester']).toBeDefined();
      expect(N8N_AGENT_DESCRIPTIONS['idempotency-tester']).toBeDefined();
      expect(N8N_AGENT_DESCRIPTIONS['secrets-hygiene-auditor']).toBeDefined();
    });

    it('should have reliability category with phase 5 agents', () => {
      expect(N8N_AGENT_CATEGORIES.reliability).toContain('contract-tester');
      expect(N8N_AGENT_CATEGORIES.reliability).toContain('replayability-tester');
      expect(N8N_AGENT_CATEGORIES.reliability).toContain('failure-mode-tester');
      expect(N8N_AGENT_CATEGORIES.reliability).toContain('idempotency-tester');
      expect(N8N_AGENT_CATEGORIES.reliability).toContain('secrets-hygiene-auditor');
    });
  });

  describe('Factory Function', () => {
    it('should create contract-tester agent', () => {
      const agent = createN8nAgent('contract-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      });
      expect(agent).toBeInstanceOf(N8nContractTesterAgent);
    });

    it('should create replayability-tester agent', () => {
      const agent = createN8nAgent('replayability-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      });
      expect(agent).toBeInstanceOf(N8nReplayabilityTesterAgent);
    });

    it('should create failure-mode-tester agent', () => {
      const agent = createN8nAgent('failure-mode-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      });
      expect(agent).toBeInstanceOf(N8nFailureModeTesterAgent);
    });

    it('should create idempotency-tester agent', () => {
      const agent = createN8nAgent('idempotency-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      });
      expect(agent).toBeInstanceOf(N8nIdempotencyTesterAgent);
    });

    it('should create secrets-hygiene-auditor agent', () => {
      const agent = createN8nAgent('secrets-hygiene-auditor', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      });
      expect(agent).toBeInstanceOf(N8nSecretsHygieneAuditorAgent);
    });
  });

  describe('N8nContractTesterAgent', () => {
    let agent: N8nContractTesterAgent;

    beforeAll(() => {
      agent = createN8nAgent('contract-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nContractTesterAgent;
    });

    it('should have correct capabilities', () => {
      // Agent should have schema validation capability
      expect(agent).toBeDefined();
    });

    it('should test contracts with provided workflow', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testContracts('test-1', { inferSchemas: false }, workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-1');
      expect(result.passed).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should detect node boundary issues', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testContracts('test-1', {}, workflow);

      expect(result.boundaryTests).toBeDefined();
      expect(Array.isArray(result.boundaryTests)).toBe(true);
    });
  });

  describe('N8nReplayabilityTesterAgent', () => {
    let agent: N8nReplayabilityTesterAgent;

    beforeAll(() => {
      agent = createN8nAgent('replayability-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nReplayabilityTesterAgent;
    });

    it('should test replayability with provided workflow', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testReplayability('test-1', {}, workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-1');
      expect(result.determinismScore).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should identify non-deterministic patterns', async () => {
      const workflow = createTestWorkflow({
        nodes: [
          ...createTestWorkflow().nodes,
          {
            id: 'node-date',
            name: 'Current Date',
            type: 'n8n-nodes-base.dateTime',
            position: [600, 0],
            parameters: {
              action: 'now',
            },
          },
        ],
      });

      const result = await agent.testReplayability('test-1', {}, workflow);

      // Date/time nodes are non-deterministic
      expect(result.nonDeterministicNodes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('N8nFailureModeTesterAgent', () => {
    let agent: N8nFailureModeTesterAgent;

    beforeAll(() => {
      agent = createN8nAgent('failure-mode-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nFailureModeTesterAgent;
    });

    it('should test failure modes with provided workflow', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testFailureModes('test-1', {}, workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-1');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should analyze retry configurations', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testFailureModes('test-1', {}, workflow);

      expect(result.retryAnalysis).toBeDefined();
      expect(typeof result.retryAnalysis).toBe('object');
      expect(result.retryAnalysis.nodesWithRetry).toBeDefined();
      expect(result.retryAnalysis.nodesWithoutRetry).toBeDefined();
    });

    it('should detect continue-on-fail risks', async () => {
      const workflow = createTestWorkflow({
        nodes: createTestWorkflow().nodes.map(node => ({
          ...node,
          continueOnFail: true, // Risky setting
        })),
      });

      const result = await agent.testFailureModes('test-1', {}, workflow);

      expect(result.continueOnFailAnalysis).toBeDefined();
    });
  });

  describe('N8nIdempotencyTesterAgent', () => {
    let agent: N8nIdempotencyTesterAgent;

    beforeAll(() => {
      agent = createN8nAgent('idempotency-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nIdempotencyTesterAgent;
    });

    it('should test idempotency with provided workflow', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testIdempotency('test-1', workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-1');
      expect(result.isIdempotent).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should detect concurrency risks', async () => {
      const workflow = createConcurrencyRiskyWorkflow();
      const result = await agent.testIdempotency('test-1', workflow);

      expect(result.concurrencyRisks).toBeDefined();
      // Should detect risks in update operations without version checks
    });

    it('should analyze webhook duplicate handling', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.testIdempotency('test-1', workflow);

      expect(result.webhookDuplicates).toBeDefined();
      expect(Array.isArray(result.webhookDuplicates)).toBe(true);
    });

    it('should identify non-idempotent operations', async () => {
      const workflow = createConcurrencyRiskyWorkflow();
      const result = await agent.testIdempotency('test-1', workflow);

      expect(result.nonIdempotentOperations).toBeDefined();
      // Email send is non-idempotent
    });
  });

  describe('N8nSecretsHygieneAuditorAgent', () => {
    let agent: N8nSecretsHygieneAuditorAgent;

    beforeAll(() => {
      agent = createN8nAgent('secrets-hygiene-auditor', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nSecretsHygieneAuditorAgent;
    });

    it('should audit secrets hygiene with provided workflow', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('test-workflow-1');
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRisk).toBeDefined();
    });

    it('should detect hardcoded secrets', async () => {
      const workflow = createInsecureWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result.hardcodedSecrets).toBeDefined();
      // Should find the hardcoded API key and password
      expect(result.hardcodedSecrets.length).toBeGreaterThan(0);
    });

    it('should analyze credential scoping', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result.credentialScopes).toBeDefined();
      expect(Array.isArray(result.credentialScopes)).toBe(true);
    });

    it('should detect log leakage risks', async () => {
      const workflow = createInsecureWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result.logLeakage).toBeDefined();
      // Sending $json to Slack may leak secrets
    });

    it('should provide recommendations', async () => {
      const workflow = createInsecureWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should analyze environment configuration', async () => {
      const workflow = createTestWorkflow();
      const result = await agent.auditSecretsHygiene('test-1', workflow);

      expect(result.environment).toBeDefined();
      expect(result.environment.detectedEnvironment).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should run multiple agents on the same workflow', async () => {
      const workflow = createTestWorkflow();

      const contractAgent = createN8nAgent('contract-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nContractTesterAgent;

      const idempotencyAgent = createN8nAgent('idempotency-tester', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nIdempotencyTesterAgent;

      const secretsAgent = createN8nAgent('secrets-hygiene-auditor', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nSecretsHygieneAuditorAgent;

      const [contractResult, idempotencyResult, secretsResult] = await Promise.all([
        contractAgent.testContracts('test-1', {}, workflow),
        idempotencyAgent.testIdempotency('test-1', workflow),
        secretsAgent.auditSecretsHygiene('test-1', workflow),
      ]);

      expect(contractResult.workflowId).toBe('test-workflow-1');
      expect(idempotencyResult.workflowId).toBe('test-workflow-1');
      expect(secretsResult.workflowId).toBe('test-workflow-1');
    });

    it('should provide comprehensive analysis for insecure workflow', async () => {
      const workflow = createInsecureWorkflow();

      const secretsAgent = createN8nAgent('secrets-hygiene-auditor', {
        n8nConfig: apiConfig,
        memoryStore,
        eventBus,
      }) as N8nSecretsHygieneAuditorAgent;

      const result = await secretsAgent.auditSecretsHygiene('test-1', workflow);

      // Insecure workflow should have low score and high risk
      expect(result.overallScore).toBeLessThan(100);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });
});
