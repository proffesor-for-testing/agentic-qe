import { jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

// E2E tests for CLI commands and workflows
const CLI_BINARY = './dist/bin/agentic-qe';
const TEST_PROJECT_DIR = '/tmp/agentic-qe-e2e-test';
const CLI_TIMEOUT = 30000; // 30 seconds

// Mock project files for testing
const MOCK_SOURCE_CODE = `
export class UserService {
  constructor(private userRepo: UserRepository) {}
  
  async createUser(userData: UserData): Promise<User> {
    if (!userData.email) {
      throw new Error('Email required');
    }
    return this.userRepo.save(userData);
  }
  
  async getUserById(id: string): Promise<User | null> {
    return this.userRepo.findById(id);
  }
}
`;

const MOCK_PACKAGE_JSON = {
  name: 'test-project',
  version: '1.0.0',
  scripts: {
    test: 'jest',
    'test:coverage': 'jest --coverage'
  },
  devDependencies: {
    jest: '^29.0.0',
    '@types/jest': '^29.0.0',
    typescript: '^5.0.0'
  }
};

interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

// CLI test utilities
function execCLI(command: string, args: string[] = [], options: any = {}): Promise<CLIResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const child = spawn(command, args, {
      cwd: TEST_PROJECT_DIR,
      stdio: 'pipe',
      timeout: CLI_TIMEOUT,
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        exitCode: code || 0,
        stdout,
        stderr,
        duration
      });
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

describe('Agentic QE CLI E2E Tests', () => {
  beforeAll(async () => {
    // Setup test project
    await rm(TEST_PROJECT_DIR, { recursive: true, force: true });
    await mkdir(TEST_PROJECT_DIR, { recursive: true });
    
    // Create mock project structure
    await mkdir(join(TEST_PROJECT_DIR, 'src'), { recursive: true });
    await mkdir(join(TEST_PROJECT_DIR, 'tests'), { recursive: true });
    
    await writeFile(
      join(TEST_PROJECT_DIR, 'package.json'),
      JSON.stringify(MOCK_PACKAGE_JSON, null, 2)
    );
    
    await writeFile(
      join(TEST_PROJECT_DIR, 'src', 'user-service.ts'),
      MOCK_SOURCE_CODE
    );
  });
  
  afterAll(async () => {
    // Cleanup test project
    await rm(TEST_PROJECT_DIR, { recursive: true, force: true });
  });

  describe('Fleet Management Commands', () => {
    it('should initialize QE fleet with hierarchical topology', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'init',
        'hierarchical',
        '--max-agents=8',
        '--strategy=balanced'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('QE fleet initialized successfully');
      expect(result.stdout).toContain('Topology: hierarchical');
      expect(result.stdout).toContain('Max agents: 8');
      expect(result.stdout).toContain('Strategy: balanced');
      
      // Verify fleet status file created
      const fleetStatus = await readFile(
        join(TEST_PROJECT_DIR, '.agentic-qe', 'fleet-status.json'),
        'utf-8'
      );
      const status = JSON.parse(fleetStatus);
      
      expect(status).toEqual({
        topology: 'hierarchical',
        maxAgents: 8,
        strategy: 'balanced',
        status: 'initialized',
        timestamp: expect.any(String)
      });
    }, CLI_TIMEOUT);

    it('should spawn unit test generator agent', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'spawn',
        'unit-test-generator',
        '--specialization=jest',
        '--capabilities=typescript,mocking'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Agent spawned successfully');
      expect(result.stdout).toContain('Type: unit-test-generator');
      expect(result.stdout).toContain('Specialization: jest');
      expect(result.stdout).toContain('Agent ID:');
      
      // Extract agent ID from output
      const agentIdMatch = result.stdout.match(/Agent ID: ([a-zA-Z0-9-]+)/);
      expect(agentIdMatch).toBeTruthy();
      
      const agentId = agentIdMatch![1];
      
      // Verify agent status
      const statusResult = await execCLI('npx', [
        'agentic-qe',
        'status',
        '--agent-id', agentId
      ]);
      
      expect(statusResult.exitCode).toBe(0);
      expect(statusResult.stdout).toContain('Status: ready');
      expect(statusResult.stdout).toContain('Health: healthy');
    }, CLI_TIMEOUT);

    it('should list active agents', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'list',
        '--format=json'
      ]);
      
      expect(result.exitCode).toBe(0);
      
      const agents = JSON.parse(result.stdout);
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
      
      const unitTestAgent = agents.find(a => a.type === 'unit-test-generator');
      expect(unitTestAgent).toBeDefined();
      expect(unitTestAgent.specialization).toBe('jest');
      expect(unitTestAgent.capabilities).toContain('typescript');
    }, CLI_TIMEOUT);
  });

  describe('Test Generation Commands', () => {
    it('should generate unit tests for source code', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'generate',
        'unit-tests',
        'src/user-service.ts',
        '--framework=jest',
        '--coverage=90',
        '--output=tests/user-service.test.ts'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test generation completed');
      expect(result.stdout).toContain('Tests generated: ');
      expect(result.stdout).toContain('Estimated coverage: ');
      
      // Verify generated test file
      const generatedTest = await readFile(
        join(TEST_PROJECT_DIR, 'tests', 'user-service.test.ts'),
        'utf-8'
      );
      
      expect(generatedTest).toContain('describe(\'UserService\')');
      expect(generatedTest).toContain('it(\'should create user\'');
      expect(generatedTest).toContain('expect(');
      expect(generatedTest).toContain('jest.fn()');
      expect(generatedTest).toContain('mockUserRepo');
    }, CLI_TIMEOUT);

    it('should generate integration tests for API endpoints', async () => {
      // Create API spec file
      const apiSpec = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              summary: 'Create user',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/UserData' }
                  }
                }
              }
            }
          }
        }
      };
      
      await writeFile(
        join(TEST_PROJECT_DIR, 'api-spec.json'),
        JSON.stringify(apiSpec, null, 2)
      );
      
      const result = await execCLI('npx', [
        'agentic-qe',
        'generate',
        'integration-tests',
        'api-spec.json',
        '--framework=supertest',
        '--output=tests/api.test.ts'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Integration tests generated');
      
      const generatedTest = await readFile(
        join(TEST_PROJECT_DIR, 'tests', 'api.test.ts'),
        'utf-8'
      );
      
      expect(generatedTest).toContain('supertest');
      expect(generatedTest).toContain('POST /users');
      expect(generatedTest).toContain('.expect(200)');
    }, CLI_TIMEOUT);
  });

  describe('Test Execution Commands', () => {
    beforeEach(async () => {
      // Ensure we have test files to execute
      if (!await fileExists(join(TEST_PROJECT_DIR, 'tests', 'user-service.test.ts'))) {
        await execCLI('npx', [
          'agentic-qe',
          'generate',
          'unit-tests',
          'src/user-service.ts',
          '--framework=jest',
          '--output=tests/user-service.test.ts'
        ]);
      }
    });

    it('should execute test suite with parallel execution', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'test',
        'full-test-suite',
        'tests/',
        '--strategy=parallel',
        '--max-workers=4',
        '--timeout=30000'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test execution completed');
      expect(result.stdout).toContain('Strategy: parallel');
      expect(result.stdout).toContain('Workers: 4');
      expect(result.stdout).toContain('Total tests: ');
      expect(result.stdout).toContain('Passed: ');
      expect(result.stdout).toContain('Duration: ');
      
      // Verify execution report
      const reportExists = await fileExists(
        join(TEST_PROJECT_DIR, '.agentic-qe', 'execution-report.json')
      );
      expect(reportExists).toBe(true);
    }, CLI_TIMEOUT);

    it('should execute tests with coverage analysis', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'test',
        'full-test-suite',
        'tests/',
        '--coverage',
        '--coverage-threshold=80',
        '--optimization=sublinear'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Coverage analysis completed');
      expect(result.stdout).toContain('Line coverage: ');
      expect(result.stdout).toContain('Branch coverage: ');
      expect(result.stdout).toContain('Function coverage: ');
      expect(result.stdout).toContain('Optimization: O(log n)');
      
      // Verify coverage report
      const coverageReport = await readFile(
        join(TEST_PROJECT_DIR, '.agentic-qe', 'coverage-report.json'),
        'utf-8'
      );
      const coverage = JSON.parse(coverageReport);
      
      expect(coverage).toHaveProperty('summary');
      expect(coverage).toHaveProperty('files');
      expect(coverage.summary).toHaveProperty('lines');
      expect(coverage.summary).toHaveProperty('branches');
    }, CLI_TIMEOUT);
  });

  describe('Quality Gate Commands', () => {
    it('should evaluate unit testing quality gate', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'quality-gate',
        'unit',
        '--target=src/user-service.ts',
        '--min-coverage=80',
        '--max-complexity=5',
        '--format=json'
      ]);
      
      expect(result.exitCode).toBe(0);
      
      const gateResult = JSON.parse(result.stdout);
      expect(gateResult).toHaveProperty('decision');
      expect(gateResult).toHaveProperty('phase', 'unit');
      expect(gateResult).toHaveProperty('confidence');
      expect(gateResult).toHaveProperty('details');
      
      expect(['pass', 'pass-with-warning', 'fail', 'block']).toContain(gateResult.decision);
    }, CLI_TIMEOUT);

    it('should evaluate comprehensive quality gates pipeline', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'pipeline',
        'full-quality-cycle',
        '--target=src/',
        '--gates=unit,integration,e2e',
        '--fail-fast=false'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Quality pipeline completed');
      expect(result.stdout).toContain('Unit gate: ');
      expect(result.stdout).toContain('Integration gate: ');
      expect(result.stdout).toContain('E2E gate: ');
      expect(result.stdout).toContain('Overall result: ');
      
      // Verify pipeline report
      const pipelineReport = await readFile(
        join(TEST_PROJECT_DIR, '.agentic-qe', 'pipeline-report.json'),
        'utf-8'
      );
      const pipeline = JSON.parse(pipelineReport);
      
      expect(pipeline.gates).toHaveLength(3);
      expect(pipeline.gates[0].phase).toBe('unit');
      expect(pipeline.gates[1].phase).toBe('integration');
      expect(pipeline.gates[2].phase).toBe('e2e');
    }, CLI_TIMEOUT);
  });

  describe('Batch Operations and Workflows', () => {
    it('should execute batch test generation for multiple targets', async () => {
      // Create additional source files
      await writeFile(
        join(TEST_PROJECT_DIR, 'src', 'auth-service.ts'),
        'export class AuthService { authenticate() {} }'
      );
      
      await writeFile(
        join(TEST_PROJECT_DIR, 'src', 'payment-service.ts'),
        'export class PaymentService { processPayment() {} }'
      );
      
      const result = await execCLI('npx', [
        'agentic-qe',
        'batch',
        'test-generation',
        '--targets=src/user-service.ts,src/auth-service.ts,src/payment-service.ts',
        '--framework=jest',
        '--parallel=true'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Batch test generation completed');
      expect(result.stdout).toContain('Targets processed: 3');
      expect(result.stdout).toContain('Success rate: ');
      
      // Verify all test files were generated
      const testFiles = [
        'tests/user-service.test.ts',
        'tests/auth-service.test.ts',
        'tests/payment-service.test.ts'
      ];
      
      for (const testFile of testFiles) {
        const exists = await fileExists(join(TEST_PROJECT_DIR, testFile));
        expect(exists).toBe(true);
      }
    }, CLI_TIMEOUT);

    it('should execute concurrent TDD workflow', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'concurrent',
        'tdd-workflow',
        '--targets-file=batch-targets.json',
        '--max-concurrent=3'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Concurrent TDD workflow completed');
      expect(result.stdout).toContain('Concurrent executions: ');
      expect(result.stdout).toContain('Total duration: ');
      expect(result.stdout).toContain('Efficiency gain: ');
    }, CLI_TIMEOUT);
  });

  describe('Performance and Monitoring', () => {
    it('should measure CLI command performance', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'benchmark',
        '--command=test-generation',
        '--iterations=5',
        '--target=src/user-service.ts'
      ]);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Benchmark completed');
      expect(result.stdout).toContain('Average duration: ');
      expect(result.stdout).toContain('Min duration: ');
      expect(result.stdout).toContain('Max duration: ');
      expect(result.stdout).toContain('Standard deviation: ');
      
      // Performance should be reasonable
      const avgMatch = result.stdout.match(/Average duration: (\d+)ms/);
      expect(avgMatch).toBeTruthy();
      const avgDuration = parseInt(avgMatch![1]);
      expect(avgDuration).toBeLessThan(10000); // Should average < 10 seconds
    }, CLI_TIMEOUT);

    it('should provide fleet monitoring dashboard', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'monitor',
        '--duration=10s',
        '--metrics=performance,resource-usage,coordination',
        '--format=json'
      ]);
      
      expect(result.exitCode).toBe(0);
      
      const monitoringData = JSON.parse(result.stdout);
      expect(monitoringData).toHaveProperty('performance');
      expect(monitoringData).toHaveProperty('resourceUsage');
      expect(monitoringData).toHaveProperty('coordination');
      expect(monitoringData).toHaveProperty('timestamp');
      
      expect(monitoringData.performance).toHaveProperty('throughput');
      expect(monitoringData.resourceUsage).toHaveProperty('cpu');
      expect(monitoringData.coordination).toHaveProperty('messagesPerSecond');
    }, CLI_TIMEOUT);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid command gracefully', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'invalid-command',
        '--unknown-flag'
      ]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: invalid-command');
      expect(result.stderr).toContain('Usage: agentic-qe <command>');
      expect(result.stderr).toContain('Available commands:');
    }, CLI_TIMEOUT);

    it('should handle missing target files gracefully', async () => {
      const result = await execCLI('npx', [
        'agentic-qe',
        'generate',
        'unit-tests',
        'src/non-existent.ts'
      ]);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Target file not found: src/non-existent.ts');
      expect(result.stderr).toContain('Please check the file path and try again');
    }, CLI_TIMEOUT);

    it('should recover from agent failures during execution', async () => {
      // Simulate agent failure by corrupting agent state
      await writeFile(
        join(TEST_PROJECT_DIR, '.agentic-qe', 'corrupted-agent.json'),
        'invalid json content'
      );
      
      const result = await execCLI('npx', [
        'agentic-qe',
        'test',
        'full-test-suite',
        'tests/',
        '--resilient=true'
      ]);
      
      expect(result.exitCode).toBe(0); // Should still succeed
      expect(result.stderr).toContain('Agent failure detected');
      expect(result.stdout).toContain('Recovery mechanism activated');
      expect(result.stdout).toContain('Test execution completed');
    }, CLI_TIMEOUT);
  });
});

// Test utilities
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractMetricFromOutput(output: string, metricName: string): number | null {
  const regex = new RegExp(`${metricName}:\\s*(\\d+(?:\\.\\d+)?)`);
  const match = output.match(regex);
  return match ? parseFloat(match[1]) : null;
}

function parseCLITable(output: string): Array<Record<string, string>> {
  const lines = output.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
  const rows = lines.slice(2).map(line => {
    const cells = line.split('|').map(c => c.trim()).filter(c => c);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || '';
    });
    return row;
  });
  
  return rows;
}
