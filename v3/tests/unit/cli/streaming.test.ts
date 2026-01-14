/**
 * Streaming Utilities Tests
 *
 * Tests for the enhanced streaming output utilities per ADR-041.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TestResultStreamer,
  CoverageStreamer,
  AgentActivityStreamer,
  UnifiedStreamer,
  createTestStreamHandler,
  createCoverageStreamHandler,
  createUnifiedStreamHandler,
  type TestSuiteResult,
  type TestCaseResult,
  type FileCoverage,
  type CoverageGap,
  type CoverageSummary,
  type AgentActivity,
} from '../../../src/cli/utils/streaming';

// Mock console to capture output during tests
const mockConsole = {
  log: vi.fn(),
};

describe('Streaming Utilities (ADR-041)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(mockConsole.log);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockConsole.log.mockClear();
  });

  describe('TestResultStreamer', () => {
    it('should create a test result streamer with default options', () => {
      const streamer = new TestResultStreamer();
      expect(streamer).toBeDefined();
    });

    it('should create a test result streamer with custom options', () => {
      const streamer = new TestResultStreamer({
        colors: false,
        showTimestamps: true,
        compact: true,
      });
      expect(streamer).toBeDefined();
    });

    it('should start and stop streaming', () => {
      const streamer = new TestResultStreamer();
      streamer.start();
      const summary = streamer.stop();

      expect(summary).toBeDefined();
      expect(summary.total).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(0);
    });

    it('should stream test suite results', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      const suite: TestSuiteResult = {
        name: 'UserService.test.ts',
        status: 'passed',
        tests: [
          { name: 'should create user', status: 'passed', duration: 12 },
          { name: 'should validate email', status: 'passed', duration: 3 },
        ],
        duration: 15,
      };

      streamer.streamSuite(suite);
      const summary = streamer.stop();

      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.failed).toBe(0);
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should stream failed test results with error details', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      const suite: TestSuiteResult = {
        name: 'PaymentService.test.ts',
        status: 'failed',
        tests: [
          { name: 'should process payment', status: 'passed', duration: 23 },
          {
            name: 'should handle declined card',
            status: 'failed',
            duration: 45,
            error: {
              expected: 'DECLINED',
              received: 'undefined',
            },
          },
        ],
      };

      streamer.streamSuite(suite);
      const summary = streamer.stop();

      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
    });

    it('should stream skipped tests', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      const suite: TestSuiteResult = {
        name: 'AuthService.test.ts',
        status: 'passed',
        tests: [
          { name: 'should authenticate user', status: 'passed', duration: 15 },
          { name: 'should handle MFA', status: 'skipped' },
        ],
      };

      streamer.streamSuite(suite);
      const summary = streamer.stop();

      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.skipped).toBe(1);
    });

    it('should stream individual test results', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      const test: TestCaseResult = {
        name: 'should work correctly',
        status: 'passed',
        duration: 10,
      };

      streamer.streamTest(test);
      const summary = streamer.stop();

      expect(summary.total).toBe(1);
      expect(summary.passed).toBe(1);
    });

    it('should stream summary with counts', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      streamer.streamTest({ name: 'test1', status: 'passed', duration: 5 });
      streamer.streamTest({ name: 'test2', status: 'failed', duration: 10 });
      streamer.streamTest({ name: 'test3', status: 'skipped' });

      streamer.streamSummary();
      const summary = streamer.stop();

      expect(summary.total).toBe(3);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(1);
    });

    it('should return current counts via getCounts', () => {
      const streamer = new TestResultStreamer();
      streamer.start();

      streamer.streamTest({ name: 'test1', status: 'passed', duration: 5 });
      streamer.streamTest({ name: 'test2', status: 'passed', duration: 3 });

      const counts = streamer.getCounts();
      expect(counts.passed).toBe(2);
      expect(counts.total).toBe(2);

      streamer.stop();
    });
  });

  describe('CoverageStreamer', () => {
    it('should create a coverage streamer with default options', () => {
      const streamer = new CoverageStreamer();
      expect(streamer).toBeDefined();
    });

    it('should start with total file count', () => {
      const streamer = new CoverageStreamer();
      streamer.start(10);
      streamer.stop();
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should stream file coverage', () => {
      const streamer = new CoverageStreamer();
      streamer.start(5);

      const fileCoverage: FileCoverage = {
        file: 'src/services/user.ts',
        lines: { covered: 80, total: 100 },
        branches: { covered: 15, total: 20 },
        functions: { covered: 10, total: 12 },
        statements: { covered: 85, total: 100 },
      };

      streamer.streamFileCoverage(fileCoverage);
      streamer.stop();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should stream coverage gaps', () => {
      const streamer = new CoverageStreamer();
      streamer.start(3);

      const gap: CoverageGap = {
        file: 'src/services/payment.ts',
        line: 42,
        type: 'branch',
        description: 'Missing error handling branch',
        risk: 'high',
      };

      streamer.streamGap(gap);
      streamer.stop();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should stream coverage summary', () => {
      const streamer = new CoverageStreamer();
      streamer.start(2);

      const summary: CoverageSummary = {
        overall: 85.5,
        files: [
          {
            file: 'src/services/user.ts',
            lines: { covered: 80, total: 100 },
            branches: { covered: 15, total: 20 },
            functions: { covered: 10, total: 12 },
            statements: { covered: 85, total: 100 },
          },
        ],
        gaps: [
          { file: 'src/services/payment.ts', line: 42, type: 'branch', risk: 'high' },
        ],
      };

      streamer.streamSummary(summary);
      streamer.stop();

      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should handle empty gaps in summary', () => {
      const streamer = new CoverageStreamer();
      streamer.start(1);

      const summary: CoverageSummary = {
        overall: 95.0,
        files: [],
        gaps: [],
      };

      streamer.streamSummary(summary);
      streamer.stop();

      expect(mockConsole.log).toHaveBeenCalled();
    });
  });

  describe('AgentActivityStreamer', () => {
    it('should create an agent activity streamer', () => {
      const streamer = new AgentActivityStreamer();
      expect(streamer).toBeDefined();
    });

    it('should start and stop streaming', () => {
      const streamer = new AgentActivityStreamer();
      streamer.start();
      const activities = streamer.stop();

      expect(activities).toEqual([]);
    });

    it('should stream agent activities', () => {
      const streamer = new AgentActivityStreamer();
      streamer.start();

      const activity: AgentActivity = {
        agentId: 'agent-1',
        agentName: 'TestGenerator',
        action: 'Generating unit tests for UserService',
        timestamp: Date.now(),
      };

      streamer.streamActivity(activity);
      const activities = streamer.stop();

      expect(activities).toHaveLength(1);
      expect(activities[0].agentName).toBe('TestGenerator');
    });

    it('should stream activities with details', () => {
      const streamer = new AgentActivityStreamer();
      streamer.start();

      const activity: AgentActivity = {
        agentId: 'agent-2',
        agentName: 'CoverageAnalyzer',
        action: 'Analyzing coverage gaps',
        timestamp: Date.now(),
        details: {
          filesAnalyzed: 42,
          gapsFound: 5,
        },
      };

      streamer.streamActivity(activity);
      const activities = streamer.stop();

      expect(activities).toHaveLength(1);
      expect(activities[0].details).toBeDefined();
    });

    it('should stream activity summary', () => {
      const streamer = new AgentActivityStreamer();
      streamer.start();

      streamer.streamActivity({
        agentId: 'agent-1',
        agentName: 'TestGenerator',
        action: 'Action 1',
        timestamp: Date.now(),
      });

      streamer.streamActivity({
        agentId: 'agent-1',
        agentName: 'TestGenerator',
        action: 'Action 2',
        timestamp: Date.now(),
      });

      streamer.streamActivity({
        agentId: 'agent-2',
        agentName: 'Reviewer',
        action: 'Action 3',
        timestamp: Date.now(),
      });

      streamer.streamSummary();
      streamer.stop();

      expect(mockConsole.log).toHaveBeenCalled();
    });
  });

  describe('UnifiedStreamer', () => {
    it('should create a unified streamer', () => {
      const unified = new UnifiedStreamer();
      expect(unified).toBeDefined();
    });

    it('should handle test suite events', () => {
      const unified = new UnifiedStreamer({ bufferSize: 1 });
      unified.start();

      unified.handleEvent({
        type: 'test-suite',
        data: {
          name: 'Test.ts',
          status: 'passed',
          tests: [{ name: 'test1', status: 'passed', duration: 5 }],
        } as TestSuiteResult,
      });

      const { tests } = unified.stop();
      expect(tests.total).toBe(1);
    });

    it('should handle coverage file events', () => {
      const unified = new UnifiedStreamer();
      unified.start();

      unified.handleEvent({
        type: 'coverage-file',
        data: {
          file: 'src/test.ts',
          lines: { covered: 50, total: 100 },
          branches: { covered: 10, total: 20 },
          functions: { covered: 5, total: 10 },
          statements: { covered: 50, total: 100 },
        } as FileCoverage,
      });

      unified.stop();
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should handle agent activity events', () => {
      const unified = new UnifiedStreamer();
      unified.start();

      unified.handleEvent({
        type: 'agent-activity',
        data: {
          agentId: 'agent-1',
          agentName: 'Test',
          action: 'Testing',
          timestamp: Date.now(),
        } as AgentActivity,
      });

      const { activities } = unified.stop();
      expect(activities).toHaveLength(1);
    });

    it('should handle message events', () => {
      const unified = new UnifiedStreamer();
      unified.start();

      unified.handleEvent({
        type: 'message',
        data: 'Test message',
      });

      unified.stop();
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should provide access to individual streamers', () => {
      const unified = new UnifiedStreamer();

      expect(unified.getTestStreamer()).toBeInstanceOf(TestResultStreamer);
      expect(unified.getCoverageStreamer()).toBeInstanceOf(CoverageStreamer);
      expect(unified.getAgentStreamer()).toBeInstanceOf(AgentActivityStreamer);
    });
  });

  describe('Factory Functions', () => {
    describe('createTestStreamHandler', () => {
      it('should create a test stream handler', () => {
        const { onStream, streamer } = createTestStreamHandler();

        expect(onStream).toBeTypeOf('function');
        expect(streamer).toBeInstanceOf(TestResultStreamer);
      });

      it('should handle suite events', () => {
        const { onStream, streamer } = createTestStreamHandler({ bufferSize: 1 });

        onStream({
          suite: {
            name: 'Test.ts',
            status: 'passed',
            tests: [{ name: 'test1', status: 'passed' }],
          },
        });

        const summary = streamer.stop();
        expect(summary.total).toBe(1);
      });

      it('should handle test events', () => {
        const { onStream, streamer } = createTestStreamHandler({ bufferSize: 1 });

        onStream({
          test: { name: 'should work', status: 'passed', duration: 10 },
        });

        const summary = streamer.stop();
        expect(summary.total).toBe(1);
      });

      it('should handle message events', () => {
        const { onStream, streamer } = createTestStreamHandler();

        onStream({ message: 'Test progress message' });

        streamer.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });
    });

    describe('createCoverageStreamHandler', () => {
      it('should create a coverage stream handler', () => {
        const { onStream, streamer } = createCoverageStreamHandler();

        expect(onStream).toBeTypeOf('function');
        expect(streamer).toBeInstanceOf(CoverageStreamer);
      });

      it('should handle start events', () => {
        const { onStream, streamer } = createCoverageStreamHandler();

        onStream({ type: 'start', totalFiles: 10 });

        streamer.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });

      it('should handle file events', () => {
        const { onStream, streamer } = createCoverageStreamHandler();

        // Must start the streamer first before streaming file events
        onStream({ type: 'start', totalFiles: 5 });
        onStream({
          file: {
            file: 'test.ts',
            lines: { covered: 50, total: 100 },
            branches: { covered: 10, total: 20 },
            functions: { covered: 5, total: 10 },
            statements: { covered: 50, total: 100 },
          },
        });

        streamer.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });

      it('should handle gap events', () => {
        const { onStream, streamer } = createCoverageStreamHandler();

        // Must start the streamer first before streaming gap events
        onStream({ type: 'start', totalFiles: 1 });
        onStream({
          gap: { file: 'test.ts', line: 42, type: 'branch', risk: 'high' },
        });

        streamer.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });

      it('should handle summary events', () => {
        const { onStream, streamer } = createCoverageStreamHandler();

        // Must start the streamer first before streaming summary events
        onStream({ type: 'start', totalFiles: 1 });
        onStream({
          summary: { overall: 85, files: [], gaps: [] },
        });

        streamer.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });
    });

    describe('createUnifiedStreamHandler', () => {
      it('should create a unified stream handler', () => {
        const { onStream, unified } = createUnifiedStreamHandler();

        expect(onStream).toBeTypeOf('function');
        expect(unified).toBeInstanceOf(UnifiedStreamer);
      });

      it('should handle typed events', () => {
        const { onStream, unified } = createUnifiedStreamHandler({ bufferSize: 1 });

        onStream({
          type: 'test-case',
          data: { name: 'test', status: 'passed', duration: 5 },
        });

        const { tests } = unified.stop();
        expect(tests.total).toBe(1);
      });

      it('should handle message fallback', () => {
        const { onStream, unified } = createUnifiedStreamHandler();

        onStream({ message: 'Fallback message' });

        unified.stop();
        expect(mockConsole.log).toHaveBeenCalled();
      });
    });
  });

  describe('Output Format Verification (ADR-041)', () => {
    it('should produce ADR-041 compliant test output format', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1, colors: false });
      streamer.start();

      // Stream test suites as per ADR-041 example
      streamer.streamSuite({
        name: 'UserService.test.ts',
        status: 'passed',
        tests: [
          { name: 'should create user', status: 'passed', duration: 12 },
          { name: 'should validate email', status: 'passed', duration: 3 },
        ],
      });

      streamer.streamSuite({
        name: 'PaymentService.test.ts',
        status: 'failed',
        tests: [
          { name: 'should process payment', status: 'passed', duration: 23 },
          {
            name: 'should handle declined card',
            status: 'failed',
            duration: 45,
            error: { expected: 'DECLINED', received: 'undefined' },
          },
        ],
      });

      streamer.streamSummary();
      const summary = streamer.stop();

      // Verify counts match ADR-041 example expectations
      expect(summary.total).toBe(4);
      expect(summary.passed).toBe(3);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(0);
      // Duration should be >= 0 (tests run very fast, could be 0ms)
      expect(summary.duration).toBeGreaterThanOrEqual(0);

      // Verify console output was produced
      expect(mockConsole.log).toHaveBeenCalled();
    });

    it('should handle streaming during active test execution', () => {
      const streamer = new TestResultStreamer({ bufferSize: 1 });
      streamer.start();

      // Simulate real-time streaming as tests complete
      streamer.streamTest({ name: 'test 1', status: 'passed', duration: 5 });
      expect(streamer.getCounts().passed).toBe(1);

      streamer.streamTest({ name: 'test 2', status: 'passed', duration: 3 });
      expect(streamer.getCounts().passed).toBe(2);

      streamer.streamTest({ name: 'test 3', status: 'failed', duration: 10 });
      expect(streamer.getCounts().failed).toBe(1);

      const summary = streamer.stop();
      expect(summary.total).toBe(3);
    });
  });
});
