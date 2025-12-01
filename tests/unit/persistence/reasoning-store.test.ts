/**
 * Unit Tests for Reasoning Store
 * Tests chain creation, step recording, and reconstruction
 */

import * as fs from 'fs';
import * as path from 'path';

// Load test fixtures
const fixturesPath = path.join(__dirname, '../../fixtures/phase1/sample-reasoning-chain.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

// Mock interfaces for reasoning store
interface ReasoningStep {
  stepId: string;
  type: 'observation' | 'thought' | 'action' | 'conclusion' | 'error';
  timestamp: string;
  content: string;
  metadata?: Record<string, any>;
}

interface ReasoningChain {
  id: string;
  agentId: string;
  taskId: string;
  createdAt: string;
  completedAt?: string;
  status: 'active' | 'completed' | 'failed';
  steps: ReasoningStep[];
  outcome?: {
    success: boolean;
    result?: any;
    error?: any;
  };
}

interface ReasoningStore {
  createChain(agentId: string, taskId: string): Promise<ReasoningChain>;
  recordStep(chainId: string, step: Omit<ReasoningStep, 'stepId' | 'timestamp'>): Promise<ReasoningStep>;
  completeChain(chainId: string, outcome: ReasoningChain['outcome']): Promise<ReasoningChain>;
  getChain(chainId: string): Promise<ReasoningChain | null>;
  getChainsByAgent(agentId: string): Promise<ReasoningChain[]>;
  getChainsByTask(taskId: string): Promise<ReasoningChain[]>;
  reconstructChain(chainId: string): Promise<ReasoningChain | null>;
  deleteChain(chainId: string): Promise<boolean>;
}

// Mock ReasoningStore implementation
class MockReasoningStore implements ReasoningStore {
  private chains = new Map<string, ReasoningChain>();
  private chainIdCounter = 0;
  private stepIdCounter = 0;

  async createChain(agentId: string, taskId: string): Promise<ReasoningChain> {
    if (!agentId) {
      throw new Error('agentId is required');
    }
    if (!taskId) {
      throw new Error('taskId is required');
    }

    const id = `chain-${++this.chainIdCounter}`;
    const chain: ReasoningChain = {
      id,
      agentId,
      taskId,
      createdAt: new Date().toISOString(),
      status: 'active',
      steps: []
    };

    this.chains.set(id, chain);
    return chain;
  }

  async recordStep(
    chainId: string,
    step: Omit<ReasoningStep, 'stepId' | 'timestamp'>
  ): Promise<ReasoningStep> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    if (chain.status !== 'active') {
      throw new Error(`Cannot add steps to ${chain.status} chain`);
    }

    if (!step.type) {
      throw new Error('Step type is required');
    }

    if (!step.content) {
      throw new Error('Step content is required');
    }

    const validTypes = ['observation', 'thought', 'action', 'conclusion', 'error'];
    if (!validTypes.includes(step.type)) {
      throw new Error(`Invalid step type: ${step.type}`);
    }

    const fullStep: ReasoningStep = {
      stepId: `step-${++this.stepIdCounter}`,
      timestamp: new Date().toISOString(),
      ...step
    };

    chain.steps.push(fullStep);
    return fullStep;
  }

  async completeChain(
    chainId: string,
    outcome: ReasoningChain['outcome']
  ): Promise<ReasoningChain> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    if (chain.status !== 'active') {
      throw new Error(`Chain already ${chain.status}`);
    }

    chain.completedAt = new Date().toISOString();
    chain.status = outcome?.success ? 'completed' : 'failed';
    chain.outcome = outcome;

    return chain;
  }

  async getChain(chainId: string): Promise<ReasoningChain | null> {
    return this.chains.get(chainId) || null;
  }

  async getChainsByAgent(agentId: string): Promise<ReasoningChain[]> {
    const results: ReasoningChain[] = [];
    for (const chain of this.chains.values()) {
      if (chain.agentId === agentId) {
        results.push(chain);
      }
    }
    return results.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getChainsByTask(taskId: string): Promise<ReasoningChain[]> {
    const results: ReasoningChain[] = [];
    for (const chain of this.chains.values()) {
      if (chain.taskId === taskId) {
        results.push(chain);
      }
    }
    return results;
  }

  async reconstructChain(chainId: string): Promise<ReasoningChain | null> {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return null;
    }

    // Return a deep copy for reconstruction
    return JSON.parse(JSON.stringify(chain));
  }

  async deleteChain(chainId: string): Promise<boolean> {
    return this.chains.delete(chainId);
  }

  async clear(): Promise<void> {
    this.chains.clear();
    this.chainIdCounter = 0;
    this.stepIdCounter = 0;
  }
}

describe('ReasoningStore', () => {
  let store: MockReasoningStore;

  beforeEach(() => {
    store = new MockReasoningStore();
  });

  afterEach(async () => {
    await store.clear();
  });

  describe('createChain', () => {
    test('should create chain with auto-generated id and timestamp', async () => {
      const chain = await store.createChain('qe-test-generator', 'task-123');

      expect(chain.id).toBeDefined();
      expect(chain.id).toMatch(/^chain-\d+$/);
      expect(chain.createdAt).toBeDefined();
      expect(new Date(chain.createdAt).getTime()).not.toBeNaN();
    });

    test('should create chain with provided agentId and taskId', async () => {
      const chain = await store.createChain('qe-test-generator', 'task-123');

      expect(chain.agentId).toBe('qe-test-generator');
      expect(chain.taskId).toBe('task-123');
    });

    test('should create chain with active status and empty steps', async () => {
      const chain = await store.createChain('agent', 'task');

      expect(chain.status).toBe('active');
      expect(chain.steps).toEqual([]);
      expect(chain.completedAt).toBeUndefined();
      expect(chain.outcome).toBeUndefined();
    });

    test('should create multiple chains with unique ids', async () => {
      const chain1 = await store.createChain('agent-1', 'task-1');
      const chain2 = await store.createChain('agent-2', 'task-2');

      expect(chain1.id).not.toBe(chain2.id);
    });

    test('should throw error when agentId is missing', async () => {
      await expect(store.createChain('', 'task-123')).rejects.toThrow('agentId is required');
    });

    test('should throw error when taskId is missing', async () => {
      await expect(store.createChain('agent', '')).rejects.toThrow('taskId is required');
    });
  });

  describe('recordStep', () => {
    let chainId: string;

    beforeEach(async () => {
      const chain = await store.createChain('test-agent', 'test-task');
      chainId = chain.id;
    });

    test('should record step with auto-generated id and timestamp', async () => {
      const step = await store.recordStep(chainId, {
        type: 'observation',
        content: 'Analyzing source code'
      });

      expect(step.stepId).toBeDefined();
      expect(step.stepId).toMatch(/^step-\d+$/);
      expect(step.timestamp).toBeDefined();
    });

    test('should record step with all valid types', async () => {
      const types: ReasoningStep['type'][] = ['observation', 'thought', 'action', 'conclusion', 'error'];

      for (const type of types) {
        const step = await store.recordStep(chainId, {
          type,
          content: `Test ${type}`
        });

        expect(step.type).toBe(type);
      }

      const chain = await store.getChain(chainId);
      expect(chain?.steps).toHaveLength(types.length);
    });

    test('should record step with metadata', async () => {
      const metadata = {
        linesOfCode: 150,
        complexity: 'medium',
        dependencies: ['ServiceA', 'ServiceB']
      };

      const step = await store.recordStep(chainId, {
        type: 'observation',
        content: 'Analyzing code',
        metadata
      });

      expect(step.metadata).toEqual(metadata);
    });

    test('should add steps to chain in order', async () => {
      await store.recordStep(chainId, { type: 'observation', content: 'Step 1' });
      await store.recordStep(chainId, { type: 'thought', content: 'Step 2' });
      await store.recordStep(chainId, { type: 'action', content: 'Step 3' });

      const chain = await store.getChain(chainId);
      expect(chain?.steps).toHaveLength(3);
      expect(chain?.steps[0].content).toBe('Step 1');
      expect(chain?.steps[1].content).toBe('Step 2');
      expect(chain?.steps[2].content).toBe('Step 3');
    });

    test('should throw error for non-existent chain', async () => {
      await expect(store.recordStep('non-existent', {
        type: 'observation',
        content: 'Test'
      })).rejects.toThrow('Chain not found');
    });

    test('should throw error when type is missing', async () => {
      await expect(store.recordStep(chainId, {
        content: 'Test'
      } as any)).rejects.toThrow('Step type is required');
    });

    test('should throw error when content is missing', async () => {
      await expect(store.recordStep(chainId, {
        type: 'observation'
      } as any)).rejects.toThrow('Step content is required');
    });

    test('should throw error for invalid step type', async () => {
      await expect(store.recordStep(chainId, {
        type: 'invalid' as any,
        content: 'Test'
      })).rejects.toThrow('Invalid step type');
    });

    test('should throw error when adding to completed chain', async () => {
      await store.completeChain(chainId, { success: true });

      await expect(store.recordStep(chainId, {
        type: 'observation',
        content: 'Test'
      })).rejects.toThrow('Cannot add steps to completed chain');
    });

    test('should throw error when adding to failed chain', async () => {
      await store.completeChain(chainId, { success: false });

      await expect(store.recordStep(chainId, {
        type: 'observation',
        content: 'Test'
      })).rejects.toThrow('Cannot add steps to failed chain');
    });
  });

  describe('completeChain', () => {
    let chainId: string;

    beforeEach(async () => {
      const chain = await store.createChain('test-agent', 'test-task');
      chainId = chain.id;
    });

    test('should complete chain with success outcome', async () => {
      const chain = await store.completeChain(chainId, {
        success: true,
        result: { testsGenerated: 15 }
      });

      expect(chain.status).toBe('completed');
      expect(chain.completedAt).toBeDefined();
      expect(chain.outcome?.success).toBe(true);
      expect(chain.outcome?.result).toEqual({ testsGenerated: 15 });
    });

    test('should complete chain with failure outcome', async () => {
      const chain = await store.completeChain(chainId, {
        success: false,
        error: { code: 'TIMEOUT', message: 'Operation timed out' }
      });

      expect(chain.status).toBe('failed');
      expect(chain.completedAt).toBeDefined();
      expect(chain.outcome?.success).toBe(false);
      expect(chain.outcome?.error).toEqual({ code: 'TIMEOUT', message: 'Operation timed out' });
    });

    test('should throw error for non-existent chain', async () => {
      await expect(store.completeChain('non-existent', {
        success: true
      })).rejects.toThrow('Chain not found');
    });

    test('should throw error when completing already completed chain', async () => {
      await store.completeChain(chainId, { success: true });

      await expect(store.completeChain(chainId, { success: true }))
        .rejects.toThrow('Chain already completed');
    });

    test('should throw error when completing already failed chain', async () => {
      await store.completeChain(chainId, { success: false });

      await expect(store.completeChain(chainId, { success: true }))
        .rejects.toThrow('Chain already failed');
    });
  });

  describe('getChain', () => {
    test('should retrieve chain by id', async () => {
      const created = await store.createChain('agent', 'task');
      const retrieved = await store.getChain(created.id);

      expect(retrieved).toEqual(created);
    });

    test('should return null for non-existent chain', async () => {
      const result = await store.getChain('non-existent');

      expect(result).toBeNull();
    });

    test('should retrieve chain with steps', async () => {
      const chain = await store.createChain('agent', 'task');
      await store.recordStep(chain.id, { type: 'observation', content: 'Step 1' });
      await store.recordStep(chain.id, { type: 'thought', content: 'Step 2' });

      const retrieved = await store.getChain(chain.id);

      expect(retrieved?.steps).toHaveLength(2);
    });
  });

  describe('getChainsByAgent', () => {
    test('should retrieve all chains for agent', async () => {
      await store.createChain('agent-1', 'task-1');
      await store.createChain('agent-1', 'task-2');
      await store.createChain('agent-2', 'task-3');

      const chains = await store.getChainsByAgent('agent-1');

      expect(chains).toHaveLength(2);
      expect(chains.every(c => c.agentId === 'agent-1')).toBe(true);
    });

    test('should return empty array for agent with no chains', async () => {
      const chains = await store.getChainsByAgent('non-existent');

      expect(chains).toEqual([]);
    });

    test('should return chains sorted by creation time', async () => {
      await store.createChain('agent', 'task-1');
      await store.createChain('agent', 'task-2');
      await store.createChain('agent', 'task-3');

      const chains = await store.getChainsByAgent('agent');

      for (let i = 0; i < chains.length - 1; i++) {
        const current = new Date(chains[i].createdAt).getTime();
        const next = new Date(chains[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('getChainsByTask', () => {
    test('should retrieve all chains for task', async () => {
      await store.createChain('agent-1', 'task-123');
      await store.createChain('agent-2', 'task-123');
      await store.createChain('agent-1', 'task-456');

      const chains = await store.getChainsByTask('task-123');

      expect(chains).toHaveLength(2);
      expect(chains.every(c => c.taskId === 'task-123')).toBe(true);
    });

    test('should return empty array for task with no chains', async () => {
      const chains = await store.getChainsByTask('non-existent');

      expect(chains).toEqual([]);
    });
  });

  describe('reconstructChain', () => {
    test('should reconstruct complete chain', async () => {
      const chain = await store.createChain('agent', 'task');
      await store.recordStep(chain.id, { type: 'observation', content: 'Observe' });
      await store.recordStep(chain.id, { type: 'thought', content: 'Think' });
      await store.recordStep(chain.id, { type: 'action', content: 'Act' });
      await store.recordStep(chain.id, { type: 'conclusion', content: 'Conclude' });
      await store.completeChain(chain.id, { success: true, result: { done: true } });

      const reconstructed = await store.reconstructChain(chain.id);

      expect(reconstructed).not.toBeNull();
      expect(reconstructed?.steps).toHaveLength(4);
      expect(reconstructed?.status).toBe('completed');
      expect(reconstructed?.outcome?.success).toBe(true);
    });

    test('should return deep copy of chain', async () => {
      const chain = await store.createChain('agent', 'task');
      const reconstructed = await store.reconstructChain(chain.id);

      expect(reconstructed).not.toBe(chain);
      expect(reconstructed).toEqual(chain);
    });

    test('should return null for non-existent chain', async () => {
      const result = await store.reconstructChain('non-existent');

      expect(result).toBeNull();
    });

    test('should reconstruct from fixture data', async () => {
      const fixtureChain = fixtures.chains[0];
      const chain = await store.createChain(fixtureChain.agentId, fixtureChain.taskId);

      for (const step of fixtureChain.steps) {
        await store.recordStep(chain.id, {
          type: step.type,
          content: step.content,
          metadata: step.metadata
        });
      }

      await store.completeChain(chain.id, fixtureChain.outcome);

      const reconstructed = await store.reconstructChain(chain.id);

      expect(reconstructed?.steps).toHaveLength(fixtureChain.steps.length);
      expect(reconstructed?.status).toBe('completed');
    });
  });

  describe('deleteChain', () => {
    test('should delete existing chain', async () => {
      const chain = await store.createChain('agent', 'task');
      const deleted = await store.deleteChain(chain.id);

      expect(deleted).toBe(true);
      expect(await store.getChain(chain.id)).toBeNull();
    });

    test('should return false for non-existent chain', async () => {
      const deleted = await store.deleteChain('non-existent');

      expect(deleted).toBe(false);
    });

    test('should delete chain with steps', async () => {
      const chain = await store.createChain('agent', 'task');
      await store.recordStep(chain.id, { type: 'observation', content: 'Test' });

      await store.deleteChain(chain.id);

      expect(await store.getChain(chain.id)).toBeNull();
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle complete test generation workflow', async () => {
      // Create chain for test generation task
      const chain = await store.createChain('qe-test-generator', 'task-gen-001');

      // Record observation about source code
      await store.recordStep(chain.id, {
        type: 'observation',
        content: 'Analyzing UserService.ts with 150 lines of code',
        metadata: { linesOfCode: 150, complexity: 'medium' }
      });

      // Record thought about approach
      await store.recordStep(chain.id, {
        type: 'thought',
        content: 'Identified 5 public methods. Using London School TDD with mocked dependencies.',
        metadata: { methodCount: 5, approach: 'london-school' }
      });

      // Record action taken
      await store.recordStep(chain.id, {
        type: 'action',
        content: 'Generating unit tests for all public methods',
        metadata: { targetCoverage: 90 }
      });

      // Record observation of results
      await store.recordStep(chain.id, {
        type: 'observation',
        content: 'Generated 15 test cases',
        metadata: { testCount: 15 }
      });

      // Record conclusion
      await store.recordStep(chain.id, {
        type: 'conclusion',
        content: 'Test generation completed with 85.5% estimated coverage',
        metadata: { estimatedCoverage: 85.5, confidence: 0.9 }
      });

      // Complete chain
      const completed = await store.completeChain(chain.id, {
        success: true,
        result: { testsGenerated: 15, coverage: 85.5 }
      });

      expect(completed.status).toBe('completed');
      expect(completed.steps).toHaveLength(5);
      expect(completed.outcome?.result.testsGenerated).toBe(15);
    });

    test('should handle error during analysis', async () => {
      const chain = await store.createChain('qe-coverage-analyzer', 'task-cov-001');

      await store.recordStep(chain.id, {
        type: 'observation',
        content: 'Starting coverage analysis'
      });

      await store.recordStep(chain.id, {
        type: 'action',
        content: 'Running istanbul coverage collection'
      });

      await store.recordStep(chain.id, {
        type: 'error',
        content: 'Coverage collection timed out after 30 seconds',
        metadata: { errorCode: 'TIMEOUT_ERROR', timeout: 30000 }
      });

      const failed = await store.completeChain(chain.id, {
        success: false,
        error: { code: 'TIMEOUT_ERROR', message: 'Operation timed out' }
      });

      expect(failed.status).toBe('failed');
      expect(failed.steps).toHaveLength(3);
      expect(failed.steps[2].type).toBe('error');
    });

    test('should support multiple chains for same task (retries)', async () => {
      // First attempt fails
      const chain1 = await store.createChain('agent', 'task-123');
      await store.recordStep(chain1.id, { type: 'error', content: 'Failed' });
      await store.completeChain(chain1.id, { success: false });

      // Second attempt succeeds
      const chain2 = await store.createChain('agent', 'task-123');
      await store.recordStep(chain2.id, { type: 'conclusion', content: 'Success' });
      await store.completeChain(chain2.id, { success: true });

      const chains = await store.getChainsByTask('task-123');

      expect(chains).toHaveLength(2);
      expect(chains[0].status).toBe('failed');
      expect(chains[1].status).toBe('completed');
    });
  });
});
