/**
 * Streaming MCP Tools Tests
 *
 * Comprehensive test suite for streaming functionality with progress updates.
 *
 * @version 1.0.5
 * @author Agentic QE Team
 */

import { EventEmitter } from 'events';
import {
  StreamingMCPTool,
  TestExecuteStreamHandler,
  CoverageAnalyzeStreamHandler,
  ProgressReporter,
  StreamEvent,
  createProgress,
  createResult,
  createError,
  calculateProgress
} from '@mcp/streaming';

describe('Streaming MCP Tools', () => {
  let memoryStore: Map<string, any>;
  let eventBus: EventEmitter;

  beforeEach(() => {
    memoryStore = new Map();
    eventBus = new EventEmitter();
  });

  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('StreamEvent Helpers', () => {
    it('should create progress event with correct structure', () => {
      const progress = createProgress('Testing...', 50, {
        currentItem: 'test.js',
        itemsProcessed: 5,
        itemsTotal: 10
      });

      expect(progress.type).toBe('progress');
      expect(progress.message).toBe('Testing...');
      expect(progress.percent).toBe(50);
      expect(progress.currentItem).toBe('test.js');
      expect(progress.itemsProcessed).toBe(5);
      expect(progress.itemsTotal).toBe(10);
      expect(progress.timestamp).toBeDefined();
    });

    it('should clamp progress percentage between 0 and 100', () => {
      const tooLow = createProgress('Too low', -10);
      const tooHigh = createProgress('Too high', 150);

      expect(tooLow.percent).toBe(0);
      expect(tooHigh.percent).toBe(100);
    });

    it('should create result event with execution time', () => {
      const result = createResult({ success: true }, { executionTime: 5000 });

      expect(result.type).toBe('result');
      expect(result.data).toEqual({ success: true });
      expect(result.executionTime).toBe(5000);
      expect(result.timestamp).toBeDefined();
    });

    it('should create error event with recovery flag', () => {
      const error = createError('Connection failed', {
        details: { code: 'ECONNRESET' },
        recoverable: true
      });

      expect(error.type).toBe('error');
      expect(error.error).toBe('Connection failed');
      expect(error.recoverable).toBe(true);
      expect(error.details).toBeDefined();
    });

    it('should calculate progress correctly', () => {
      expect(calculateProgress(0, 10)).toBe(0);
      expect(calculateProgress(5, 10)).toBe(50);
      expect(calculateProgress(10, 10)).toBe(100);
      expect(calculateProgress(7, 10)).toBe(70);
    });

    it('should handle division by zero in progress calculation', () => {
      expect(calculateProgress(5, 0)).toBe(0);
    });
  });

  describe('TestExecuteStreamHandler', () => {
    let handler: TestExecuteStreamHandler;

    beforeEach(() => {
      handler = new TestExecuteStreamHandler(memoryStore, eventBus);
    });

    it('should emit progress events during execution', async () => {
      const events: StreamEvent[] = [];

      const params = {
        spec: {
          testSuites: ['tests/unit/**/*.test.js'],
          parallelExecution: false,
          retryCount: 1,
          timeoutSeconds: 60,
          reportFormat: 'json' as const
        }
      };

      // Collect all events
      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      // Verify we got progress events
      const progressEvents = events.filter(e => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);

      // Verify we got a result event
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBe(1);

      // Verify final result structure
      const finalResult = resultEvents[0];
      expect(finalResult.type).toBe('result');
      expect((finalResult as any).data).toBeDefined();
      expect((finalResult as any).data.id).toBeDefined();
      expect((finalResult as any).data.status).toBe('completed');
    }, 30000);

    it('should emit streaming:started event on initialization', async () => {
      const startedEvents: any[] = [];
      eventBus.on('streaming:started', (event) => startedEvents.push(event));

      const params = {
        spec: {
          testSuites: ['tests/sample.test.js'],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const generator = handler.execute(params);
      await generator.next(); // Start execution

      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0].sessionId).toBeDefined();

      // Cleanup
      await generator.return(undefined);
    }, 15000);

    it('should store session state in memory', async () => {
      const params = {
        spec: {
          testSuites: ['tests/quick.test.js'],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const generator = handler.execute(params);
      await generator.next(); // Start execution

      // Check that session was created in memory
      const session = handler.getSession();
      expect(session).toBeDefined();
      expect(session?.status).toBe('active');

      // Cleanup
      await generator.return(undefined);
    }, 15000);

    it('should validate test execution spec', async () => {
      const invalidParams = {
        spec: {
          testSuites: [], // Empty array should fail
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const events: StreamEvent[] = [];

      try {
        for await (const event of handler.execute(invalidParams)) {
          events.push(event);
        }
        fail('Should have thrown validation error');
      } catch (error) {
        // Error should be caught
        expect(error).toBeDefined();
      }

      // Should have error event
      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should handle parallel execution', async () => {
      const events: StreamEvent[] = [];

      const params = {
        spec: {
          testSuites: ['tests/a.test.js', 'tests/b.test.js', 'tests/c.test.js'],
          parallelExecution: true,
          retryCount: 1,
          timeoutSeconds: 60,
          reportFormat: 'json' as const
        }
      };

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      // Check for parallel execution indicators in metadata
      const progressEvents = events.filter(e => e.type === 'progress');
      const parallelEvents = progressEvents.filter(
        e => 'metadata' in e && (e as any).metadata?.type?.includes('parallel')
      );

      expect(parallelEvents.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('CoverageAnalyzeStreamHandler', () => {
    let handler: CoverageAnalyzeStreamHandler;

    beforeEach(() => {
      handler = new CoverageAnalyzeStreamHandler(memoryStore, eventBus);
    });

    it('should emit file-by-file progress updates', async () => {
      const events: StreamEvent[] = [];

      const params = {
        sourceFiles: [
          'src/agents/TestExecutor.ts',
          'src/agents/CoverageAnalyzer.ts',
          'src/agents/QualityGate.ts'
        ],
        coverageThreshold: 0.8,
        useJohnsonLindenstrauss: false,
        includeUncoveredLines: true,
        analysisDepth: 'detailed' as const
      };

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      // Verify file analysis progress events
      const progressEvents = events.filter(e => e.type === 'progress');
      const fileAnalysisEvents = progressEvents.filter(
        e => 'metadata' in e && (e as any).metadata?.type === 'file-analysis-complete'
      );

      expect(fileAnalysisEvents.length).toBe(3); // One per file
    }, 30000);

    it('should apply Johnson-Lindenstrauss optimization', async () => {
      const events: StreamEvent[] = [];

      // Create large file list to trigger optimization
      const sourceFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);

      const params = {
        sourceFiles,
        coverageThreshold: 0.8,
        useJohnsonLindenstrauss: true,
        includeUncoveredLines: false,
        analysisDepth: 'basic' as const
      };

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      // Check for optimization indicator
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBe(1);

      const result = (resultEvents[0] as any).data;
      expect(result.optimizationApplied).toBe(true);

      // Should have analyzed fewer files due to optimization
      expect(result.fileResults.length).toBeLessThan(sourceFiles.length);
    }, 30000);

    it('should detect and report coverage gaps', async () => {
      const events: StreamEvent[] = [];

      const params = {
        sourceFiles: ['src/sample.ts'],
        coverageThreshold: 0.9,
        useJohnsonLindenstrauss: false,
        includeUncoveredLines: true,
        analysisDepth: 'comprehensive' as const
      };

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      // Verify result includes gaps
      const resultEvents = events.filter(e => e.type === 'result');
      const result = (resultEvents[0] as any).data;

      expect(result.gaps).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
    }, 30000);

    it('should generate recommendations', async () => {
      const events: StreamEvent[] = [];

      const params = {
        sourceFiles: ['src/low-coverage.ts'],
        coverageThreshold: 0.95,
        useJohnsonLindenstrauss: false,
        includeUncoveredLines: true,
        analysisDepth: 'detailed' as const
      };

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      const resultEvents = events.filter(e => e.type === 'result');
      const result = (resultEvents[0] as any).data;

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    }, 30000);

    it('should validate input parameters', async () => {
      const invalidParams = {
        sourceFiles: [], // Empty should fail
        coverageThreshold: 1.5 // Invalid threshold
      };

      const events: StreamEvent[] = [];

      try {
        for await (const event of handler.execute(invalidParams)) {
          events.push(event);
        }
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Progress Throttling', () => {
    it('should throttle progress updates based on interval', async () => {
      const progressEvents: any[] = [];
      eventBus.on('streaming:progress', (event) => progressEvents.push(event));

      // Create handler with short progress interval for testing
      const handler = new TestExecuteStreamHandler(memoryStore, eventBus);

      const params = {
        spec: {
          testSuites: ['tests/sample.test.js'],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const startTime = Date.now();
      const events: StreamEvent[] = [];

      for await (const event of handler.execute(params)) {
        events.push(event);
      }

      const duration = Date.now() - startTime;
      const progressEventCount = events.filter(e => e.type === 'progress').length;

      // Should have limited number of progress events based on throttling
      // Even if operation took 10 seconds, with 2s interval we expect ~5 progress events
      const expectedMaxEvents = Math.ceil(duration / 2000) + 5; // Add buffer
      expect(progressEventCount).toBeLessThan(expectedMaxEvents);
    }, 30000);
  });

  describe('Session Management', () => {
    it('should persist session state throughout execution', async () => {
      const handler = new TestExecuteStreamHandler(memoryStore, eventBus);

      const params = {
        spec: {
          testSuites: ['tests/sample.test.js'],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const generator = handler.execute(params);
      await generator.next();

      const session = handler.getSession();
      expect(session).toBeDefined();
      expect(session?.id).toBeDefined();
      expect(session?.status).toBe('active');
      expect(session?.progress).toBeDefined();

      // Cleanup
      await generator.return(undefined);
    }, 15000);

    it('should update session status on completion', async () => {
      const handler = new TestExecuteStreamHandler(memoryStore, eventBus);

      const params = {
        spec: {
          testSuites: ['tests/quick.test.js'],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      for await (const event of handler.execute(params)) {
        // Consume all events
      }

      const session = handler.getSession();
      expect(session?.status).toBe('completed');
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should emit error events for failures', async () => {
      const handler = new TestExecuteStreamHandler(memoryStore, eventBus);

      const params = {
        spec: {
          testSuites: [], // Invalid - should cause error
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json' as const
        }
      };

      const events: StreamEvent[] = [];

      try {
        for await (const event of handler.execute(params)) {
          events.push(event);
        }
      } catch (error) {
        // Expected
      }

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should mark errors as recoverable when appropriate', async () => {
      const error = createError('TIMEOUT', { recoverable: true });
      expect(error.recoverable).toBe(true);

      const nonRecoverableError = createError('SYNTAX_ERROR', { recoverable: false });
      expect(nonRecoverableError.recoverable).toBe(false);
    });
  });
});
