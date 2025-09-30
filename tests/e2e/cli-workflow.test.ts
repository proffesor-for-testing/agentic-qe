/**
 * E2E CLI Workflow Tests
 * Testing complete CLI workflows from command input to final output
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Helper functions for CLI testing
class CLITestHelper {
  private tempDir: string;
  private processes: ChildProcess[] = [];

  constructor() {
    this.tempDir = '';
  }

  async setup() {
    // Create temporary directory for test artifacts
    this.tempDir = await fs.mkdtemp(path.join(tmpdir(), 'aqe-e2e-'));

    // Copy necessary test files
    await this.setupTestProject();
  }

  async cleanup() {
    // Kill all spawned processes
    this.processes.forEach(proc => {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    });

    // Clean up temp directory
    if (this.tempDir) {
      await fs.rmdir(this.tempDir, { recursive: true });
    }
  }

  async runCommand(command: string, args: string[] = [], options: any = {}): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd: this.tempDir,
        stdio: 'pipe',
        ...options
      });

      this.processes.push(proc);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      // Set timeout to prevent hanging tests
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
          resolve({
            exitCode: -1,
            stdout: stdout.trim(),
            stderr: 'Process timeout'
          });
        }
      }, 30000);
    });
  }

  async writeFile(filePath: string, content: string) {
    const fullPath = path.join(this.tempDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.tempDir, filePath);
    return fs.readFile(fullPath, 'utf-8');
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.tempDir, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  getTempDir(): string {
    return this.tempDir;
  }

  private async setupTestProject() {
    // Create a minimal Node.js project structure
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      description: 'Test project for AQE E2E testing',
      main: 'index.js',
      scripts: {
        test: 'jest',
        build: 'tsc'
      },
      devDependencies: {
        jest: '^29.0.0',
        '@types/jest': '^29.0.0',
        typescript: '^5.0.0'
      }
    };

    await this.writeFile('package.json', JSON.stringify(packageJson, null, 2));

    // Create tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };

    await this.writeFile('tsconfig.json', JSON.stringify(tsConfig, null, 2));

    // Create sample source files for testing
    await this.createSampleSourceFiles();
  }

  private async createSampleSourceFiles() {
    // Sample TypeScript class
    const calculatorCode = `
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Division by zero');
    }
    return a / b;
  }

  factorial(n: number): number {
    if (n < 0) {
      throw new Error('Factorial of negative number');
    }
    if (n === 0 || n === 1) {
      return 1;
    }
    return n * this.factorial(n - 1);
  }
}
`;

    await this.writeFile('src/Calculator.ts', calculatorCode);

    // Sample service class with dependencies
    const userServiceCode = `
import { Database } from './Database';
import { Logger } from './Logger';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export class UserService {
  constructor(
    private database: Database,
    private logger: Logger
  ) {}

  async createUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    this.logger.info('Creating user', userData);

    const user: User = {
      id: this.generateId(),
      ...userData,
      createdAt: new Date()
    };

    await this.database.save('users', user);
    this.logger.info('User created', { userId: user.id });

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    this.logger.info('Fetching user', { userId: id });

    const user = await this.database.findById('users', id);
    return user as User | null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const existingUser = await this.getUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }

    const updatedUser = { ...existingUser, ...updates };
    await this.database.update('users', id, updatedUser);

    this.logger.info('User updated', { userId: id });
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    await this.database.delete('users', id);
    this.logger.info('User deleted', { userId: id });
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
`;

    await this.writeFile('src/UserService.ts', userServiceCode);

    // Mock dependencies
    const databaseCode = `
export class Database {
  async save(collection: string, data: any): Promise<void> {
    // Mock implementation
  }

  async findById(collection: string, id: string): Promise<any> {
    // Mock implementation
    return null;
  }

  async update(collection: string, id: string, data: any): Promise<void> {
    // Mock implementation
  }

  async delete(collection: string, id: string): Promise<void> {
    // Mock implementation
  }
}
`;

    const loggerCode = `
export class Logger {
  info(message: string, metadata?: any): void {
    console.log(message, metadata);
  }

  error(message: string, error?: Error): void {
    console.error(message, error);
  }

  warn(message: string, metadata?: any): void {
    console.warn(message, metadata);
  }
}
`;

    await this.writeFile('src/Database.ts', databaseCode);
    await this.writeFile('src/Logger.ts', loggerCode);
  }
}

describe('AQE CLI E2E Workflow Tests', () => {
  let cliHelper: CLITestHelper;
  const AQE_CLI_PATH = path.join(__dirname, '../../dist/cli/index.js');

  beforeAll(async () => {
    cliHelper = new CLITestHelper();
    await cliHelper.setup();
  }, 60000);

  afterAll(async () => {
    await cliHelper.cleanup();
  }, 30000);

  describe('Fleet Initialization Workflow', () => {
    it('should initialize AQE fleet with default configuration', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'default'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Fleet initialized successfully');
      expect(result.stdout).toContain('Agents spawned:');

      // Check that fleet status file is created
      const fleetStatusExists = await cliHelper.fileExists('.aqe/fleet-status.json');
      expect(fleetStatusExists).toBe(true);
    });

    it('should initialize fleet with custom configuration', async () => {
      const customConfig = {
        fleet: {
          name: 'E2E Test Fleet',
          maxAgents: 5,
          topology: 'mesh'
        },
        agents: [
          { type: 'test-generator', count: 2 },
          { type: 'test-executor', count: 2 },
          { type: 'coverage-analyzer', count: 1 }
        ]
      };

      await cliHelper.writeFile('aqe-config.json', JSON.stringify(customConfig, null, 2));

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'aqe-config.json'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('E2E Test Fleet');
      expect(result.stdout).toContain('mesh topology');
      expect(result.stdout).toContain('5 agents');
    });

    it('should handle initialization errors gracefully', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'non-existent-config.json'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Configuration file not found');
    });
  });

  describe('Test Generation Workflow', () => {
    beforeEach(async () => {
      // Initialize fleet before each test
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'default'
      ]);
    });

    it('should generate unit tests for TypeScript files', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/Calculator.ts',
        '--type', 'unit',
        '--framework', 'jest'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test generation completed');
      expect(result.stdout).toContain('Calculator.test.ts');

      // Check that test file was created
      const testFileExists = await cliHelper.fileExists('tests/unit/Calculator.test.ts');
      expect(testFileExists).toBe(true);

      // Verify test content
      const testContent = await cliHelper.readFile('tests/unit/Calculator.test.ts');
      expect(testContent).toContain("describe('Calculator'");
      expect(testContent).toContain('add');
      expect(testContent).toContain('subtract');
      expect(testContent).toContain('divide');
      expect(testContent).toContain('Division by zero');
    });

    it('should generate integration tests with mocks', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/UserService.ts',
        '--type', 'integration',
        '--mocks', 'auto',
        '--coverage', '90'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Integration tests generated');
      expect(result.stdout).toContain('Mocks generated');

      // Check test files
      const testFileExists = await cliHelper.fileExists('tests/integration/UserService.test.ts');
      expect(testFileExists).toBe(true);

      const mockFileExists = await cliHelper.fileExists('tests/__mocks__/Database.ts');
      expect(mockFileExists).toBe(true);

      // Verify mock content
      const mockContent = await cliHelper.readFile('tests/__mocks__/Database.ts');
      expect(mockContent).toContain('jest.fn()');
      expect(mockContent).toContain('mockResolvedValue');
    });

    it('should generate tests for entire directory', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--type', 'unit',
        '--recursive'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Generated tests for 4 files');

      // Check multiple test files were created
      const calculatorTestExists = await cliHelper.fileExists('tests/unit/Calculator.test.ts');
      const userServiceTestExists = await cliHelper.fileExists('tests/unit/UserService.test.ts');
      const databaseTestExists = await cliHelper.fileExists('tests/unit/Database.test.ts');

      expect(calculatorTestExists).toBe(true);
      expect(userServiceTestExists).toBe(true);
      expect(databaseTestExists).toBe(true);
    });
  });

  describe('Test Execution Workflow', () => {
    beforeEach(async () => {
      // Initialize fleet and generate tests
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/Calculator.ts',
        '--type', 'unit'
      ]);
    });

    it('should execute generated tests successfully', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'run',
        'tests',
        '--pattern', 'tests/unit/Calculator.test.ts'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test execution completed');
      expect(result.stdout).toContain('passed');
      expect(result.stdout).toMatch(/\d+ tests? passed/);
    });

    it('should run tests with coverage reporting', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'run',
        'tests',
        '--coverage',
        '--threshold', '80'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Coverage report generated');
      expect(result.stdout).toMatch(/Coverage: \d+(\.\d+)?%/);

      // Check coverage files
      const coverageExists = await cliHelper.fileExists('coverage/lcov-report/index.html');
      expect(coverageExists).toBe(true);
    });

    it('should handle test failures gracefully', async () => {
      // Create a test file with intentional failure
      const failingTest = `
describe('Failing Test', () => {
  it('should fail intentionally', () => {
    expect(true).toBe(false);
  });
});
`;

      await cliHelper.writeFile('tests/unit/FailingTest.test.ts', failingTest);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'run',
        'tests',
        '--pattern', 'tests/unit/FailingTest.test.ts'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Test failures detected');
      expect(result.stdout).toContain('failed');
    });

    it('should run tests in parallel for better performance', async () => {
      // Generate multiple test files
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--recursive'
      ]);

      const startTime = Date.now();

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'run',
        'tests',
        '--parallel',
        '--workers', '3'
      ]);

      const duration = Date.now() - startTime;

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Parallel execution');
      expect(result.stdout).toContain('3 workers');

      // Parallel execution should be faster than 10 seconds
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Coverage Analysis Workflow', () => {
    beforeEach(async () => {
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--recursive'
      ]);
    });

    it('should analyze coverage and suggest improvements', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'analyze',
        'coverage',
        '--source', 'src/',
        '--tests', 'tests/',
        '--target', '90'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Coverage analysis completed');
      expect(result.stdout).toContain('Suggestions for improvement');

      // Check analysis report
      const reportExists = await cliHelper.fileExists('coverage-analysis.json');
      expect(reportExists).toBe(true);

      const report = JSON.parse(await cliHelper.readFile('coverage-analysis.json'));
      expect(report).toHaveProperty('currentCoverage');
      expect(report).toHaveProperty('targetCoverage');
      expect(report).toHaveProperty('suggestions');
    });

    it('should identify uncovered code paths', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'analyze',
        'coverage',
        '--detailed',
        '--show-uncovered'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Uncovered lines identified');
      expect(result.stdout).toMatch(/Line \d+:/);
    });

    it('should generate missing tests for uncovered code', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'missing-tests',
        '--source', 'src/UserService.ts',
        '--threshold', '95'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Missing tests generated');

      // Check additional test file
      const additionalTestExists = await cliHelper.fileExists('tests/unit/UserService.additional.test.ts');
      expect(additionalTestExists).toBe(true);
    });
  });

  describe('Quality Gate Workflow', () => {
    beforeEach(async () => {
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);
    });

    it('should enforce quality gates on test execution', async () => {
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--recursive'
      ]);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'gate',
        'check',
        '--coverage-threshold', '85',
        '--test-threshold', '100',
        '--performance-threshold', '500ms'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Quality gate passed');
      expect(result.stdout).toContain('All thresholds met');
    });

    it('should fail quality gate on insufficient coverage', async () => {
      // Generate minimal tests
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/Calculator.ts',
        '--minimal'
      ]);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'gate',
        'check',
        '--coverage-threshold', '95'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Quality gate failed');
      expect(result.stderr).toContain('Coverage below threshold');
    });

    it('should provide detailed quality gate report', async () => {
      await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--recursive'
      ]);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'gate',
        'report',
        '--format', 'json',
        '--output', 'quality-report.json'
      ]);

      expect(result.exitCode).toBe(0);

      const reportExists = await cliHelper.fileExists('quality-report.json');
      expect(reportExists).toBe(true);

      const report = JSON.parse(await cliHelper.readFile('quality-report.json'));
      expect(report).toHaveProperty('coverage');
      expect(report).toHaveProperty('testResults');
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('qualityScore');
    });
  });

  describe('Fleet Management Workflow', () => {
    it('should show fleet status and agent information', async () => {
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'status'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Fleet Status');
      expect(result.stdout).toContain('Active Agents');
      expect(result.stdout).toMatch(/Agent ID: \w+/);
      expect(result.stdout).toMatch(/Status: (active|idle|busy)/);
    });

    it('should scale fleet agents dynamically', async () => {
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'scale',
        '--type', 'test-executor',
        '--count', '5'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Fleet scaled successfully');
      expect(result.stdout).toContain('5 test-executor agents');

      // Verify status shows updated agent count
      const statusResult = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'status'
      ]);

      expect(statusResult.stdout).toContain('Total Agents: 5');
    });

    it('should gracefully shutdown fleet', async () => {
      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'init']);

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'shutdown'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Fleet shutdown completed');
      expect(result.stdout).toContain('All agents stopped');

      // Verify fleet is no longer running
      const statusResult = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'status'
      ]);

      expect(statusResult.stdout).toContain('Fleet Status: stopped');
    });
  });

  describe('Configuration and Environment Management', () => {
    it('should handle different environment configurations', async () => {
      const devConfig = {
        environment: 'development',
        fleet: { maxAgents: 3 },
        logging: { level: 'debug' }
      };

      const prodConfig = {
        environment: 'production',
        fleet: { maxAgents: 10 },
        logging: { level: 'error' }
      };

      await cliHelper.writeFile('aqe-dev.json', JSON.stringify(devConfig, null, 2));
      await cliHelper.writeFile('aqe-prod.json', JSON.stringify(prodConfig, null, 2));

      // Test development configuration
      const devResult = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'aqe-dev.json'
      ]);

      expect(devResult.exitCode).toBe(0);
      expect(devResult.stdout).toContain('development');
      expect(devResult.stdout).toContain('3 agents');

      await cliHelper.runCommand('node', [AQE_CLI_PATH, 'fleet', 'shutdown']);

      // Test production configuration
      const prodResult = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'aqe-prod.json'
      ]);

      expect(prodResult.exitCode).toBe(0);
      expect(prodResult.stdout).toContain('production');
      expect(prodResult.stdout).toContain('10 agents');
    });

    it('should validate configuration files', async () => {
      const invalidConfig = {
        fleet: {
          maxAgents: -1, // Invalid
          invalidProperty: 'value'
        }
      };

      await cliHelper.writeFile('invalid-config.json', JSON.stringify(invalidConfig, null, 2));

      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'fleet',
        'init',
        '--config', 'invalid-config.json'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Invalid configuration');
      expect(result.stderr).toContain('maxAgents must be positive');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle CLI errors gracefully', async () => {
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'invalid-command'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Unknown command');
      expect(result.stderr).toContain('See --help for usage');
    });

    it('should provide helpful error messages for common issues', async () => {
      // Try to run tests without initializing fleet
      const result = await cliHelper.runCommand('node', [
        AQE_CLI_PATH,
        'run',
        'tests'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('Fleet not initialized');
      expect(result.stderr).toContain('Run "aqe fleet init" first');
    });

    it('should handle interrupted operations gracefully', async () => {
      // Start a long-running operation and interrupt it
      const proc = spawn('node', [
        AQE_CLI_PATH,
        'generate',
        'tests',
        '--source', 'src/',
        '--recursive',
        '--detailed'
      ], {
        cwd: cliHelper.getTempDir(),
        stdio: 'pipe'
      });

      // Wait a bit then kill the process
      setTimeout(() => {
        proc.kill('SIGINT');
      }, 1000);

      const result = await new Promise<any>((resolve) => {
        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          });
        });
      });

      // Should handle interruption gracefully
      expect(result.stdout || result.stderr).toContain('Operation interrupted');
    });
  });
});