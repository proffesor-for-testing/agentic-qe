/**
 * Streaming API Integration Tests
 *
 * Tests for AsyncGenerator-based streaming handlers.
 * Verifies real-time progress updates and for-await-of compatibility.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BaseStreamHandler, StreamEvent } from '@streaming/BaseStreamHandler';
import { TestGenerateStreamHandler } from '@streaming/TestGenerateStreamHandler';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Mock streaming handler for testing base functionality
 */
class MockStreamHandler extends BaseStreamHandler {
  protected async *processTask(params: { items: number; delay?: number }): AsyncGenerator<StreamEvent> {
    const { items, delay = 10 } = params;

    for (let i = 0; i < items; i++) {
      if (this.isCancelled()) {
        throw new Error('Operation cancelled');
      }

      const percent = this.calculateProgress(i, items);

      yield this.progressEvent(percent, `Processing item ${i + 1}/${items}`, {
        currentItem: i + 1,
        totalItems: items
      });

      // Emit intermediate result
      yield this.resultEvent({
        item: i + 1,
        processed: true
      }, { type: 'intermediate' });

      await this.sleep(delay);
    }

    yield this.progressEvent(100, 'All items processed');
  }
}

describe('Streaming API', () => {
  describe('BaseStreamHandler', () => {
    it('should provide real-time progress updates', async () => {
      const handler = new MockStreamHandler();
      const events: StreamEvent[] = [];

      for await (const event of handler.execute({ items: 5, delay: 5 })) {
        events.push(event);
      }

      // Verify event sequence
      expect(events.length).toBeGreaterThan(5);
      expect(events[0].type).toBe('progress');
      expect(events[0].percent).toBe(0);

      const progressEvents = events.filter(e => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(3);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('complete');
      expect(lastEvent.percent).toBe(100);
    });

    it('should support for-await-of pattern', async () => {
      const handler = new MockStreamHandler();
      let eventCount = 0;

      for await (const event of handler.execute({ items: 3 })) {
        eventCount++;
        expect(event).toHaveProperty('type');
        expect(event).toHaveProperty('timestamp');
        expect(event.timestamp).toBeGreaterThan(0);
      }

      expect(eventCount).toBeGreaterThan(0);
    });

    it('should emit intermediate results', async () => {
      const handler = new MockStreamHandler();
      const results: any[] = [];

      for await (const event of handler.execute({ items: 3 })) {
        if (event.type === 'result' && event.metadata?.type === 'intermediate') {
          results.push(event.data);
        }
      }

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({ item: 1, processed: true });
      expect(results[2]).toEqual({ item: 3, processed: true });
    });

    it('should handle cancellation', async () => {
      const handler = new MockStreamHandler();
      let eventCount = 0;

      try {
        for await (const event of handler.execute({ items: 10, delay: 20 })) {
          eventCount++;

          // Cancel after 3 events
          if (eventCount === 3) {
            handler.cancel();
          }
        }
      } catch (error: any) {
        expect(error.message).toContain('cancelled');
      }

      expect(eventCount).toBeLessThan(10);
    });

    it('should emit error events on failure', async () => {
      class FailingHandler extends BaseStreamHandler {
        protected async *processTask(params: any): AsyncGenerator<StreamEvent> {
          yield this.progressEvent(50, 'Processing...');
          throw new Error('Simulated failure');
        }
      }

      const handler = new FailingHandler();
      const events: StreamEvent[] = [];

      try {
        for await (const event of handler.execute({})) {
          events.push(event);
        }
      } catch (error: any) {
        expect(error.message).toBe('Simulated failure');
      }

      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error).toBeDefined();
    });

    it('should calculate progress correctly', async () => {
      const handler = new MockStreamHandler();
      const progressValues: number[] = [];

      for await (const event of handler.execute({ items: 10 })) {
        if (event.type === 'progress' && event.percent !== undefined) {
          progressValues.push(event.percent);
        }
      }

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }

      // Last progress should be 100%
      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('should include execution time in completion event', async () => {
      const handler = new MockStreamHandler();
      let completeEvent: StreamEvent | undefined;

      for await (const event of handler.execute({ items: 3 })) {
        if (event.type === 'complete') {
          completeEvent = event;
        }
      }

      expect(completeEvent).toBeDefined();
      expect(completeEvent?.metadata?.executionTime).toBeGreaterThan(0);
      expect(completeEvent?.metadata?.executionTimeFormatted).toBeDefined();
    });
  });

  describe('TestGenerateStreamHandler', () => {
    const testSourceFile = path.join(__dirname, '../fixtures/sample-source.ts');
    const testOutputFile = path.join(__dirname, '../fixtures/sample-source.test.ts');

    beforeEach(async () => {
      // Create test source file
      const sourceCode = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}
`;
      await fs.mkdir(path.dirname(testSourceFile), { recursive: true });
      await fs.writeFile(testSourceFile, sourceCode, 'utf-8');
    });

    afterEach(async () => {
      // Clean up test files
      try {
        await fs.unlink(testSourceFile);
        await fs.unlink(testOutputFile);
      } catch {
        // Ignore errors
      }
    });

    it('should generate tests with progress updates', async () => {
      const handler = new TestGenerateStreamHandler();
      const events: StreamEvent[] = [];

      for await (const event of handler.execute({
        sourceFile: testSourceFile,
        framework: 'jest',
        includeEdgeCases: true,
        generateMocks: true
      })) {
        events.push(event);
      }

      // Verify progress events
      const progressEvents = events.filter(e => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(3);

      // Verify result events for each function
      const resultEvents = events.filter(e => e.type === 'result');
      expect(resultEvents.length).toBeGreaterThan(0);

      // Verify final result
      const finalResult = resultEvents[resultEvents.length - 1];
      expect(finalResult.data).toBeDefined();
      expect(finalResult.data.tests).toBeDefined();
      expect(finalResult.data.totalTests).toBeGreaterThan(0);
    }, 30000);

    it('should emit intermediate results for each function', async () => {
      const handler = new TestGenerateStreamHandler();
      const intermediateResults: any[] = [];

      for await (const event of handler.execute({
        sourceFile: testSourceFile,
        framework: 'jest'
      })) {
        if (event.type === 'result' && event.metadata?.type === 'intermediate') {
          intermediateResults.push(event.data);
        }
      }

      expect(intermediateResults.length).toBeGreaterThan(0);
      expect(intermediateResults[0]).toHaveProperty('functionName');
      expect(intermediateResults[0]).toHaveProperty('testCode');
      expect(intermediateResults[0]).toHaveProperty('testCount');
    }, 30000);

    it('should create test file with generated tests', async () => {
      const handler = new TestGenerateStreamHandler();
      let outputFile: string | undefined;

      for await (const event of handler.execute({
        sourceFile: testSourceFile,
        framework: 'jest'
      })) {
        if (event.type === 'result' && event.metadata?.type === 'final') {
          outputFile = event.data.outputFile;
        }
      }

      expect(outputFile).toBeDefined();

      // Verify file exists
      const fileExists = await fs.access(outputFile!).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file content
      const content = await fs.readFile(outputFile!, 'utf-8');
      expect(content).toContain('describe');
      expect(content).toContain('test');
      expect(content).toContain('expect');
    }, 30000);

    it('should support different frameworks', async () => {
      const frameworks = ['jest', 'mocha', 'vitest'] as const;

      for (const framework of frameworks) {
        const handler = new TestGenerateStreamHandler();
        let finalResult: any;

        for await (const event of handler.execute({
          sourceFile: testSourceFile,
          framework
        })) {
          if (event.type === 'result' && event.metadata?.type === 'final') {
            finalResult = event.data;
          }
        }

        expect(finalResult).toBeDefined();
        expect(finalResult.framework).toBe(framework);
      }
    }, 60000);

    it('should include edge cases when enabled', async () => {
      const handler = new TestGenerateStreamHandler();
      let testsWithEdgeCases: any[] = [];

      for await (const event of handler.execute({
        sourceFile: testSourceFile,
        framework: 'jest',
        includeEdgeCases: true
      })) {
        if (event.type === 'result' && event.metadata?.type === 'final') {
          testsWithEdgeCases = event.data.tests;
        }
      }

      const hasEdgeCases = testsWithEdgeCases.some(t => t.includesEdgeCases);
      expect(hasEdgeCases).toBe(true);
    }, 30000);

    it('should handle invalid source file gracefully', async () => {
      const handler = new TestGenerateStreamHandler();

      try {
        for await (const event of handler.execute({
          sourceFile: '/nonexistent/file.ts',
          framework: 'jest'
        })) {
          // Should not reach here
        }
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });
  });
});
