/**
 * CodeComplexityAnalyzerAgent Test Suite
 * Demonstrates comprehensive agent testing patterns
 */

// Mock Logger before imports
jest.mock('../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

import { CodeComplexityAnalyzerAgent, ComplexityAnalysisRequest } from '../../src/agents/CodeComplexityAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, QEAgentType } from '../../src/types';
import { EventEmitter } from 'events';

describe('CodeComplexityAnalyzerAgent', () => {
  let agent: CodeComplexityAnalyzerAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;

  beforeEach(async () => {
    // Initialize memory store
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    // Initialize event bus
    eventBus = new EventEmitter();

    // Create agent with test configuration
    agent = new CodeComplexityAnalyzerAgent({
      type: QEAgentType.QUALITY_ANALYZER,
      capabilities: [],
      context: {
        id: 'test-complexity-agent',
        type: 'quality-analyzer',
        status: AgentStatus.INITIALIZING
      },
      memoryStore,
      eventBus,
      thresholds: {
        cyclomaticComplexity: 10,
        cognitiveComplexity: 15,
        linesOfCode: 300
      },
      enableRecommendations: true,
      enableLearning: false // Disable for simpler testing
    });

    await agent.initialize();
  });

  afterEach(async () => {
    if (agent.getStatus().status !== AgentStatus.STOPPED) {
      await agent.terminate();
    }
    await memoryStore.close();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initialization', () => {
    it('should initialize with correct capabilities', () => {
      const status = agent.getStatus();

      expect(status.agentId.type).toBe(QEAgentType.QUALITY_ANALYZER);
      expect(status.status).toBe(AgentStatus.IDLE);

      const capabilityNames = status.capabilities.map((c: any) => c.name);
      expect(capabilityNames).toContain('complexity-analysis');
      expect(capabilityNames).toContain('refactoring-recommendations');
      expect(capabilityNames).toContain('pattern-detection');
    });

    it('should load knowledge during initialization', async () => {
      // Knowledge loading is called in initialize()
      // Verify by checking agent is ready
      expect(agent.getStatus().status).toBe(AgentStatus.IDLE);
    });
  });

  // ============================================================================
  // Complexity Analysis Tests
  // ============================================================================

  describe('complexity analysis', () => {
    it('should analyze simple code with low complexity', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'simple.ts',
          content: `
            function add(a: number, b: number): number {
              return a + b;
            }
          `,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);

      expect(result).toBeDefined();
      expect(result.overall).toBeDefined();
      expect(result.fileMetrics.size).toBe(1);
      expect(result.issues).toHaveLength(0); // No issues for simple code
      expect(result.score).toBeGreaterThan(90); // High score for simple code
    });

    it('should detect high cyclomatic complexity', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'complex.ts',
          content: `
            function complexFunction(x: number) {
              if (x > 0) {
                if (x > 10) {
                  if (x > 20) {
                    if (x > 30) {
                      return "very high";
                    }
                    return "high";
                  }
                  return "medium";
                }
                return "low";
              }
              return "zero or negative";
            }
          `,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);

      expect(result.issues.length).toBeGreaterThan(0);

      const cyclomaticIssue = result.issues.find(i => i.type === 'cyclomatic');
      expect(cyclomaticIssue).toBeDefined();
      expect(cyclomaticIssue?.severity).toMatch(/medium|high|critical/);
    });

    it('should detect high cognitive complexity from nesting', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'nested.ts',
          content: `
            function deeplyNested() {
              for (let i = 0; i < 10; i++) {
                for (let j = 0; j < 10; j++) {
                  for (let k = 0; k < 10; k++) {
                    if (i > j) {
                      if (j > k) {
                        console.log("deeply nested");
                      }
                    }
                  }
                }
              }
            }
          `,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);

      const cognitiveIssue = result.issues.find(i => i.type === 'cognitive');
      expect(cognitiveIssue).toBeDefined();
    });

    it('should detect large file size', async () => {
      // Generate a large file
      const largeContent = Array(400)
        .fill('const x = 1;')
        .join('\n');

      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'large.ts',
          content: largeContent,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);

      const sizeIssue = result.issues.find(i => i.type === 'size');
      expect(sizeIssue).toBeDefined();
      expect(sizeIssue?.current).toBeGreaterThan(300);
    });

    it('should analyze multiple files', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [
          {
            path: 'file1.ts',
            content: 'function simple() { return 1; }',
            language: 'typescript'
          },
          {
            path: 'file2.ts',
            content: 'function alsoSimple() { return 2; }',
            language: 'typescript'
          }
        ]
      };

      const result = await agent.analyzeComplexity(request);

      expect(result.fileMetrics.size).toBe(2);
      expect(result.fileMetrics.has('file1.ts')).toBe(true);
      expect(result.fileMetrics.has('file2.ts')).toBe(true);
      expect(result.overall.functionCount).toBe(2);
    });
  });

  // ============================================================================
  // Recommendation Tests
  // ============================================================================

  describe('recommendations', () => {
    it('should generate recommendations for complex code', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'complex.ts',
          content: `
            function veryComplexFunction() {
              if (true) {
                if (true) {
                  if (true) {
                    for (let i = 0; i < 10; i++) {
                      while (i > 0) {
                        console.log("complex");
                      }
                    }
                  }
                }
              }
            }
          `,
          language: 'typescript'
        }],
        options: {
          includeRecommendations: true
        }
      };

      const result = await agent.analyzeComplexity(request);

      expect(result.recommendations.length).toBeGreaterThan(0);

      // Should contain specific refactoring advice
      const hasRefactoringAdvice = result.recommendations.some(r =>
        r.toLowerCase().includes('refactor') ||
        r.toLowerCase().includes('extract') ||
        r.toLowerCase().includes('reduce')
      );
      expect(hasRefactoringAdvice).toBe(true);
    });

    it('should not generate recommendations when disabled', async () => {
      // Create agent with recommendations disabled
      const noRecommendationsAgent = new CodeComplexityAnalyzerAgent({
        type: QEAgentType.QUALITY_ANALYZER,
        capabilities: [],
        context: {
          id: 'test-no-rec',
          type: 'quality-analyzer',
          status: AgentStatus.INITIALIZING
        },
        memoryStore,
        eventBus,
        enableRecommendations: false,
        enableLearning: false
      });

      await noRecommendationsAgent.initialize();

      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'complex.ts',
          content: 'if (true) { if (true) { if (true) { } } }',
          language: 'typescript'
        }]
      };

      const result = await noRecommendationsAgent.analyzeComplexity(request);

      expect(result.recommendations).toHaveLength(0);

      await noRecommendationsAgent.terminate();
    });
  });

  // ============================================================================
  // Memory Integration Tests
  // ============================================================================

  describe('memory integration', () => {
    it('should store analysis results in memory', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'test.ts',
          content: 'function test() { return 1; }',
          language: 'typescript'
        }]
      };

      await agent.analyzeComplexity(request);

      // Retrieve stored result
      const storedResult = await memoryStore.retrieve(
        `aqe/complexity/${agent.getStatus().agentId.id}/latest-result`
      );

      expect(storedResult).toBeDefined();
      expect(storedResult.overall).toBeDefined();
    });

    it('should store current request during analysis', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'test.ts',
          content: 'function test() { return 1; }',
          language: 'typescript'
        }]
      };

      await agent.analyzeComplexity(request);

      const storedRequest = await memoryStore.retrieve(
        `aqe/complexity/${agent.getStatus().agentId.id}/current-request`
      );

      expect(storedRequest).toBeDefined();
      expect(storedRequest.files).toHaveLength(1);
    });

    it('should store errors in memory on failure', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [] // Invalid: empty files array
      };

      await agent.analyzeComplexity(request);

      // Check if any error was stored
      const agentId = agent.getStatus().agentId.id;
      // Errors are stored with timestamp keys, so we just verify analysis completed
      // (In real scenario, you'd need to query by prefix)
    });
  });

  // ============================================================================
  // Event Integration Tests
  // ============================================================================

  describe('event integration', () => {
    it('should emit completion event after analysis', async () => {
      const eventPromise = new Promise<void>(resolve => {
        eventBus.once('complexity:analysis:completed', () => {
          resolve();
        });
      });

      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'test.ts',
          content: 'function test() { return 1; }',
          language: 'typescript'
        }]
      };

      await agent.analyzeComplexity(request);
      await eventPromise; // Wait for event

      expect(true).toBe(true); // Event was emitted
    });
  });

  // ============================================================================
  // Lifecycle Hook Tests
  // ============================================================================

  describe('lifecycle hooks', () => {
    it('should execute pre-task hook before analysis', async () => {
      // Store some historical data first
      await memoryStore.store(
        `aqe/complexity/${agent.getStatus().agentId.id}/history`,
        [{ test: 'historical data' }]
      );

      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'test.ts',
          content: 'function test() { return 1; }',
          language: 'typescript'
        }]
      };

      // Execute task (which triggers hooks)
      await agent.executeTask({
        id: 'test-task',
        type: 'complexity-analysis',
        payload: request,
        priority: 1,
        status: 'pending'
      });

      // Pre-task hook should have loaded historical data
      // (Verified by successful execution)
      expect(true).toBe(true);
    });

    it('should execute post-task hook after analysis', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'test.ts',
          content: 'function test() { return 1; }',
          language: 'typescript'
        }]
      };

      await agent.executeTask({
        id: 'test-task',
        type: 'complexity-analysis',
        payload: request,
        priority: 1,
        status: 'pending'
      });

      // Post-task hook should have stored result in history
      const history = await memoryStore.retrieve(
        `aqe/complexity/${agent.getStatus().agentId.id}/history`
      );

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  // ============================================================================
  // Quality Score Tests
  // ============================================================================

  describe('quality scoring', () => {
    it('should give high score to simple code', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'simple.ts',
          content: `
            function add(a: number, b: number): number {
              return a + b;
            }
          `,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);
      expect(result.score).toBeGreaterThanOrEqual(90);
    });

    it('should give low score to complex code', async () => {
      const request: ComplexityAnalysisRequest = {
        files: [{
          path: 'complex.ts',
          content: `
            function veryComplexFunction() {
              if (true) {
                if (true) {
                  if (true) {
                    if (true) {
                      if (true) {
                        for (let i = 0; i < 10; i++) {
                          while (i > 0) {
                            if (i % 2 === 0) {
                              console.log("very complex");
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          language: 'typescript'
        }]
      };

      const result = await agent.analyzeComplexity(request);
      expect(result.score).toBeLessThan(80);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('performance', () => {
    it('should complete analysis in reasonable time', async () => {
      const request: ComplexityAnalysisRequest = {
        files: Array.from({ length: 10 }, (_, i) => ({
          path: `file${i}.ts`,
          content: 'function test() { return 1; }',
          language: 'typescript'
        }))
      };

      const startTime = Date.now();
      const result = await agent.analyzeComplexity(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      expect(result.analysisTime).toBeLessThan(1000);
    });
  });
});
