/**
 * Agentic QE v3 - Test Runner Tests
 * ADR-032: Time Crystal Scheduling
 *
 * Tests for real test runner implementations (Vitest, Jest).
 * These tests verify the runner infrastructure without actually
 * executing external processes (uses mocks for subprocess calls).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  VitestTestRunner,
  JestTestRunner,
  createTestRunner,
  detectTestRunner,
  runTests,
  TestExecutionError,
  TestOutputParseError,
} from '../../src/time-crystal/test-runner';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs functions
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('VitestTestRunner', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpawn = vi.fn();
    vi.mocked(childProcess.spawn).mockImplementation(mockSpawn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('should parse valid Vitest JSON output', async () => {
      const vitestOutput = JSON.stringify({
        numTotalTests: 50,
        numPassedTests: 48,
        numFailedTests: 1,
        numPendingTests: 1,
        numTodoTests: 0,
        startTime: Date.now(),
        success: true,
        testResults: [
          {
            name: '/path/to/test.spec.ts',
            status: 'passed',
            startTime: Date.now(),
            endTime: Date.now() + 100,
            assertionResults: [
              {
                ancestorTitles: ['describe'],
                fullName: 'describe should work',
                status: 'passed',
                title: 'should work',
                duration: 50,
                failureMessages: [],
              },
              {
                ancestorTitles: ['describe'],
                fullName: 'describe should fail',
                status: 'failed',
                title: 'should fail',
                duration: 25,
                failureMessages: ['Expected true to be false'],
              },
            ],
          },
        ],
      });

      // Create mock process
      const mockProcess = createMockProcess(vitestOutput, '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const runner = new VitestTestRunner({ cwd: '/test/project' });
      const result = await runner.run(['unit'], {
        parallelism: 4,
        timeout: 60000,
        collectCoverage: false,
        retryFailed: false,
        maxRetries: 0,
      });

      expect(result.total).toBe(50);
      expect(result.passed).toBe(48);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.details).toHaveLength(2);
    });

    it('should call vitest with correct arguments', async () => {
      const mockProcess = createMockProcess(
        JSON.stringify({
          numTotalTests: 10,
          numPassedTests: 10,
          numFailedTests: 0,
          numPendingTests: 0,
          numTodoTests: 0,
          startTime: Date.now(),
          success: true,
          testResults: [],
        }),
        '',
        0
      );
      mockSpawn.mockReturnValue(mockProcess);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const runner = new VitestTestRunner({ cwd: '/test/project' });
      await runner.run(['unit', 'integration'], {
        parallelism: 8,
        timeout: 30000,
        collectCoverage: true,
        retryFailed: true,
        maxRetries: 3,
      });

      expect(mockSpawn).toHaveBeenCalled();
      const [_command, args] = mockSpawn.mock.calls[0];

      // Should include vitest run with json reporter
      expect(args).toContain('vitest');
      expect(args).toContain('run');
      expect(args).toContain('--reporter=json');

      // Should include coverage flag
      expect(args).toContain('--coverage');

      // Should include retry flag
      expect(args.some((a: string) => a.includes('--retry'))).toBe(true);
    });

    it('should throw TestOutputParseError on invalid JSON', async () => {
      const mockProcess = createMockProcess('not valid json', '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new VitestTestRunner({ cwd: '/test/project' });

      await expect(
        runner.run(['unit'], {
          parallelism: 1,
          timeout: 5000,
          collectCoverage: false,
          retryFailed: false,
          maxRetries: 0,
        })
      ).rejects.toThrow(TestOutputParseError);
    });

    it('should read coverage from coverage-summary.json when available', async () => {
      const vitestOutput = JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        startTime: Date.now(),
        success: true,
        testResults: [],
      });

      const coverageSummary = JSON.stringify({
        total: {
          lines: { total: 100, covered: 85, pct: 85 },
          statements: { total: 100, covered: 80, pct: 80 },
          functions: { total: 50, covered: 45, pct: 90 },
          branches: { total: 30, covered: 24, pct: 80 },
        },
      });

      const mockProcess = createMockProcess(vitestOutput, '', 0);
      mockSpawn.mockReturnValue(mockProcess);

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        return String(p).includes('coverage-summary.json');
      });
      vi.mocked(fs.readFileSync).mockReturnValue(coverageSummary);

      const runner = new VitestTestRunner({ cwd: '/test/project' });
      const result = await runner.run(['unit'], {
        parallelism: 1,
        timeout: 5000,
        collectCoverage: true,
        retryFailed: false,
        maxRetries: 0,
      });

      // Average of 85, 80, 90, 80 = 83.75%
      expect(result.coverage).toBeCloseTo(0.8375, 2);
    });

    it('should handle timeout', async () => {
      // Create a process that never completes - the mock will trigger the timeout
      // Note: This test verifies the timeout error message, not actual timeout behavior
      // (actual subprocess timeout is tested in integration tests)
      const mockProcess = createMockProcessWithTimeout();
      mockSpawn.mockReturnValue(mockProcess);

      const runner = new VitestTestRunner({ cwd: '/test/project' });

      await expect(
        runner.run(['unit'], {
          parallelism: 1,
          timeout: 50, // Very short timeout
          collectCoverage: false,
          retryFailed: false,
          maxRetries: 0,
        })
      ).rejects.toThrow(/timed out/);
    }, 5000); // Set test timeout to 5 seconds
  });
});

describe('JestTestRunner', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpawn = vi.fn();
    vi.mocked(childProcess.spawn).mockImplementation(mockSpawn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('should parse valid Jest JSON output', async () => {
      const jestOutput = JSON.stringify({
        numTotalTests: 30,
        numPassedTests: 28,
        numFailedTests: 2,
        numPendingTests: 0,
        numTodoTests: 0,
        startTime: Date.now(),
        success: false,
        testResults: [
          {
            name: '/path/to/test.test.ts',
            status: 'failed',
            startTime: Date.now(),
            endTime: Date.now() + 200,
            assertionResults: [
              {
                ancestorTitles: ['module'],
                fullName: 'module should work',
                status: 'passed',
                title: 'should work',
                duration: 100,
                failureMessages: [],
              },
            ],
          },
        ],
      });

      const mockProcess = createMockProcess(jestOutput, '', 1);
      mockSpawn.mockReturnValue(mockProcess);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const runner = new JestTestRunner({ cwd: '/test/project' });
      const result = await runner.run(['unit'], {
        parallelism: 2,
        timeout: 60000,
        collectCoverage: false,
        retryFailed: false,
        maxRetries: 0,
      });

      expect(result.total).toBe(30);
      expect(result.passed).toBe(28);
      expect(result.failed).toBe(2);
    });

    it('should call jest with correct arguments', async () => {
      const mockProcess = createMockProcess(
        JSON.stringify({
          numTotalTests: 5,
          numPassedTests: 5,
          numFailedTests: 0,
          numPendingTests: 0,
          numTodoTests: 0,
          startTime: Date.now(),
          success: true,
          testResults: [],
        }),
        '',
        0
      );
      mockSpawn.mockReturnValue(mockProcess);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const runner = new JestTestRunner({ cwd: '/test/project' });
      await runner.run(['integration'], {
        parallelism: 4,
        timeout: 30000,
        collectCoverage: true,
        retryFailed: false,
        maxRetries: 0,
      });

      expect(mockSpawn).toHaveBeenCalled();
      const [_command, args] = mockSpawn.mock.calls[0];

      expect(args).toContain('jest');
      expect(args).toContain('--json');
      expect(args).toContain('--coverage');
      expect(args.some((a: string) => a.includes('--maxWorkers'))).toBe(true);
    });
  });
});

describe('detectTestRunner', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should detect vitest from config file', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('vitest.config.ts');
    });

    const result = detectTestRunner('/test/project');
    expect(result).toBe('vitest');
  });

  it('should detect jest from config file', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('jest.config.js');
    });

    const result = detectTestRunner('/test/project');
    expect(result).toBe('jest');
  });

  it('should detect vitest from package.json', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('package.json');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        devDependencies: {
          vitest: '^1.0.0',
        },
      })
    );

    const result = detectTestRunner('/test/project');
    expect(result).toBe('vitest');
  });

  it('should detect jest from package.json', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('package.json');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        devDependencies: {
          jest: '^29.0.0',
        },
      })
    );

    const result = detectTestRunner('/test/project');
    expect(result).toBe('jest');
  });

  it('should return null when no runner is detected', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = detectTestRunner('/test/project');
    expect(result).toBeNull();
  });
});

describe('createTestRunner', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create VitestTestRunner when vitest is detected', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('vitest.config.ts');
    });

    const runner = createTestRunner({ cwd: '/test/project' });
    expect(runner).toBeInstanceOf(VitestTestRunner);
  });

  it('should create JestTestRunner when jest is detected', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('jest.config.js');
    });

    const runner = createTestRunner({ cwd: '/test/project' });
    expect(runner).toBeInstanceOf(JestTestRunner);
  });

  it('should throw when no runner is detected', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => createTestRunner({ cwd: '/test/project' })).toThrow(
      /No test runner detected/
    );
  });

  it('should use explicit framework when provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const runner = createTestRunner({ cwd: '/test/project' }, 'vitest');
    expect(runner).toBeInstanceOf(VitestTestRunner);
  });
});

describe('runTests', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSpawn = vi.fn();
    vi.mocked(childProcess.spawn).mockImplementation(mockSpawn);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should run tests with auto-detected framework', async () => {
    // Setup vitest detection
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
      return String(p).includes('vitest.config.ts');
    });

    const vitestOutput = JSON.stringify({
      numTotalTests: 20,
      numPassedTests: 20,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      startTime: Date.now(),
      success: true,
      testResults: [],
    });

    const mockProcess = createMockProcess(vitestOutput, '', 0);
    mockSpawn.mockReturnValue(mockProcess);

    const result = await runTests('/test/project', ['unit']);

    expect(result.total).toBe(20);
    expect(result.passed).toBe(20);
  });
});

describe('TestExecutionError', () => {
  it('should include execution details', () => {
    const error = new TestExecutionError(
      'Test failed',
      1,
      'stderr output',
      'npx vitest run'
    );

    expect(error.message).toBe('Test failed');
    expect(error.exitCode).toBe(1);
    expect(error.stderr).toBe('stderr output');
    expect(error.command).toBe('npx vitest run');
    expect(error.name).toBe('TestExecutionError');
  });
});

describe('TestOutputParseError', () => {
  it('should include parse details', () => {
    const error = new TestOutputParseError(
      'Invalid JSON',
      'raw output here',
      'vitest'
    );

    expect(error.message).toBe('Invalid JSON');
    expect(error.rawOutput).toBe('raw output here');
    expect(error.framework).toBe('vitest');
    expect(error.name).toBe('TestOutputParseError');
  });
});

// Helper function to create mock child process
function createMockProcess(
  stdout: string,
  stderr: string,
  exitCode: number | null,
  neverComplete: boolean = false
): ReturnType<typeof childProcess.spawn> {
  const mockStdout = {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === 'data' && !neverComplete) {
        setTimeout(() => callback(Buffer.from(stdout)), 10);
      }
    }),
  };

  const mockStderr = {
    on: vi.fn((event: string, callback: (data: Buffer) => void) => {
      if (event === 'data' && stderr && !neverComplete) {
        setTimeout(() => callback(Buffer.from(stderr)), 10);
      }
    }),
  };

  let killCalled = false;

  const mockProcess = {
    stdout: mockStdout,
    stderr: mockStderr,
    on: vi.fn(
      (event: string, callback: (code: number | null) => void | ((error: Error) => void)) => {
        if (event === 'close' && !neverComplete) {
          setTimeout(() => (callback as (code: number | null) => void)(exitCode), 20);
        }
      }
    ),
    kill: vi.fn(() => {
      killCalled = true;
    }),
    killed: false,
    get killed_status() {
      return killCalled;
    },
  };

  // Update killed property when kill is called
  Object.defineProperty(mockProcess, 'killed', {
    get: () => killCalled,
  });

  return mockProcess as unknown as ReturnType<typeof childProcess.spawn>;
}

// Helper function to create mock process that simulates timeout
function createMockProcessWithTimeout(): ReturnType<typeof childProcess.spawn> {
  let closeCallback: ((code: number | null) => void) | null = null;
  let killCalled = false;

  const mockStdout = {
    on: vi.fn(),
  };

  const mockStderr = {
    on: vi.fn(),
  };

  const mockProcess = {
    stdout: mockStdout,
    stderr: mockStderr,
    on: vi.fn((event: string, callback: (code: number | null) => void | ((error: Error) => void)) => {
      if (event === 'close') {
        closeCallback = callback as (code: number | null) => void;
      }
    }),
    kill: vi.fn(() => {
      killCalled = true;
      // When kill is called due to timeout, trigger close callback
      if (closeCallback) {
        setTimeout(() => closeCallback!(null), 10);
      }
    }),
    killed: false,
  };

  Object.defineProperty(mockProcess, 'killed', {
    get: () => killCalled,
  });

  return mockProcess as unknown as ReturnType<typeof childProcess.spawn>;
}
