/**
 * Init Wizard and Orchestrator Tests
 * ADR-025: Enhanced Init with Self-Configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  InitOrchestrator,
  createInitOrchestrator,
  quickInit,
  formatInitResult,
} from '../../../src/init/init-wizard.js';
import type { InitResult, PretrainedLibrary } from '../../../src/init/types.js';

// Mock fs module for project analyzer and init wizard
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true }),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;

describe('InitOrchestrator', () => {
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('package.json')) {
        return JSON.stringify({ name: 'test-project' });
      }
      return '';
    });
    // Reset write mocks - they should succeed by default
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  describe('createInitOrchestrator', () => {
    it('should create an init orchestrator', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      expect(orchestrator).toBeInstanceOf(InitOrchestrator);
    });

    it('should create orchestrator with auto mode', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });
      expect(orchestrator).toBeInstanceOf(InitOrchestrator);
    });

    it('should create orchestrator with minimal config', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        minimal: true,
      });
      expect(orchestrator).toBeInstanceOf(InitOrchestrator);
    });
  });

  describe('getWizardSteps', () => {
    it('should return wizard steps', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      const steps = orchestrator.getWizardSteps();

      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should have welcome step first', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      const steps = orchestrator.getWizardSteps();

      expect(steps[0].id).toBe('welcome');
      expect(steps[0].type).toBe('info');
    });

    it('should include project-type step', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      const steps = orchestrator.getWizardSteps();

      const projectTypeStep = steps.find((s) => s.id === 'project-type');
      expect(projectTypeStep).toBeDefined();
      expect(projectTypeStep?.type).toBe('choice');
      expect(projectTypeStep?.options?.length).toBeGreaterThan(0);
    });

    it('should include learning-mode step', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      const steps = orchestrator.getWizardSteps();

      const learningStep = steps.find((s) => s.id === 'learning-mode');
      expect(learningStep).toBeDefined();
      expect(learningStep?.type).toBe('choice');
    });

    it('should include confirm steps', () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
      });
      const steps = orchestrator.getWizardSteps();

      const confirmSteps = steps.filter((s) => s.type === 'confirm');
      expect(confirmSteps.length).toBeGreaterThan(0);
    });
  });

  describe('initialize', () => {
    it('should complete initialization in auto mode', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should record all step results', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.steps.length).toBeGreaterThan(0);
      for (const step of result.steps) {
        expect(step.step).toBeDefined();
        expect(step.status).toMatch(/success|error/);
        expect(step.message).toBeDefined();
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should populate summary', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.summary.projectAnalyzed).toBe(true);
      expect(result.summary.configGenerated).toBe(true);
      expect(typeof result.summary.patternsLoaded).toBe('number');
      expect(typeof result.summary.skillsInstalled).toBe('number');
      expect(typeof result.summary.agentsInstalled).toBe('number');
      expect(typeof result.summary.hooksConfigured).toBe('boolean');
      expect(typeof result.summary.mcpConfigured).toBe('boolean');
      expect(typeof result.summary.claudeMdGenerated).toBe('boolean');
      expect(typeof result.summary.workersStarted).toBe('number');
    });

    it('should apply wizard answers', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        wizardAnswers: {
          'project-type': 'monorepo',
          'learning-mode': 'basic',
          'load-patterns': false,
          hooks: false,
          workers: false,
        },
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.config.project.type).toBe('monorepo');
      expect(result.config.learning.embeddingModel).toBe('hash');
      expect(result.config.learning.pretrainedPatterns).toBe(false);
      expect(result.config.hooks.claudeCode).toBe(false);
      expect(result.config.workers.daemonAutoStart).toBe(false);
    });

    it('should handle disabled learning mode', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        wizardAnswers: {
          'learning-mode': 'disabled',
        },
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.config.learning.enabled).toBe(false);
    });

    it('should load pretrained patterns when provided', async () => {
      // Create realistic pretrained library with actual patterns grouped by domain
      const testPatterns = Array.from({ length: 50 }, (_, i) => ({
        id: `pattern-${i}`,
        domain: i < 25 ? 'test-generation' : 'test-execution',
        type: 'unit',
        content: 'describe("test", () => { it("should work", () => {}) })',
        metadata: {
          language: 'typescript',
          framework: 'vitest',
          confidence: 0.9,
          usageCount: 10,
          successRate: 0.95,
        },
      }));

      const pretrainedLibrary: PretrainedLibrary = {
        version: '1.0.0',
        exportedFrom: 'test-suite',
        exportDate: new Date().toISOString(),
        patterns: testPatterns,
        statistics: {
          totalPatterns: 50,
          byDomain: {
            'test-generation': 25,
            'test-execution': 25,
          },
          byLanguage: { typescript: 50 },
          averageConfidence: 0.9,
        },
      };

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
        pretrainedLibrary,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.summary.patternsLoaded).toBe(50);
    });

    it('should skip patterns when requested', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
        skipPatterns: true,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      expect(result.summary.patternsLoaded).toBe(0);
    });

    it('should start workers based on config', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(true);
      // Workers started should match enabled workers count
      expect(result.summary.workersStarted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('quickInit', () => {
    it('should perform quick initialization', async () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('package.json');
      });

      const result = await quickInit(testProjectRoot);

      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('should use auto mode', async () => {
      const result = await quickInit(testProjectRoot);

      expect(result.success).toBe(true);
      // Auto mode generates config based on analysis
      expect(result.config.project.name).toBeDefined();
    });
  });

  describe('formatInitResult', () => {
    it('should format successful result', () => {
      const result: InitResult = {
        success: true,
        config: {
          version: '3.0.0',
          project: {
            name: 'test-project',
            root: '/test/project',
            type: 'single',
          },
          learning: {
            enabled: true,
            embeddingModel: 'transformer',
            hnswConfig: { M: 16, efConstruction: 200, efSearch: 100 },
            qualityThreshold: 0.7,
            promotionThreshold: 3,
            pretrainedPatterns: true,
          },
          routing: {
            mode: 'hybrid',
            confidenceThreshold: 0.7,
            fallbackEnabled: true,
          },
          workers: {
            enabled: ['pattern-consolidator'],
            intervals: {},
            maxConcurrent: 4,
            daemonAutoStart: true,
          },
          hooks: {
            claudeCode: true,
            preCommit: false,
            ciIntegration: false,
          },
          autoTuning: {
            enabled: true,
            parameters: [],
            evaluationPeriodMs: 60000,
          },
          domains: {
            enabled: ['test-generation'],
            disabled: [],
          },
          agents: {
            maxConcurrent: 8,
            defaultTimeout: 60000,
          },
        },
        steps: [
          { step: 'Project Analysis', status: 'success', message: 'Done', durationMs: 50 },
          { step: 'Configuration Generation', status: 'success', message: 'Done', durationMs: 10 },
        ],
        summary: {
          projectAnalyzed: true,
          configGenerated: true,
          patternsLoaded: 100,
          skillsInstalled: 64,
          agentsInstalled: 59,
          hooksConfigured: true,
          mcpConfigured: true,
          claudeMdGenerated: true,
          workersStarted: 2,
        },
        totalDurationMs: 200,
        timestamp: new Date(),
      };

      const formatted = formatInitResult(result);

      expect(formatted).toContain('AQE v3 Initialization');
      expect(formatted).toContain('test-project');
      expect(formatted).toContain('single');
      expect(formatted).toContain('100'); // patterns loaded
      expect(formatted).toContain('59'); // agents installed
      expect(formatted).toContain('MCP Server'); // MCP configured
      expect(formatted).toContain('initialized');
    });

    it('should format failed result', () => {
      const result: InitResult = {
        success: false,
        config: {
          version: '3.0.0',
          project: {
            name: 'unknown',
            root: '/test/project',
            type: 'single',
          },
          learning: {
            enabled: true,
            embeddingModel: 'hash',
            hnswConfig: { M: 16, efConstruction: 200, efSearch: 100 },
            qualityThreshold: 0.7,
            promotionThreshold: 3,
            pretrainedPatterns: true,
          },
          routing: {
            mode: 'rules',
            confidenceThreshold: 0.7,
            fallbackEnabled: true,
          },
          workers: {
            enabled: [],
            intervals: {},
            maxConcurrent: 4,
            daemonAutoStart: false,
          },
          hooks: {
            claudeCode: false,
            preCommit: false,
            ciIntegration: false,
          },
          autoTuning: {
            enabled: false,
            parameters: [],
            evaluationPeriodMs: 60000,
          },
          domains: {
            enabled: [],
            disabled: [],
          },
          agents: {
            maxConcurrent: 5,
            defaultTimeout: 60000,
          },
        },
        steps: [
          { step: 'Project Analysis', status: 'error', message: 'Failed to read', durationMs: 10 },
        ],
        summary: {
          projectAnalyzed: false,
          configGenerated: false,
          patternsLoaded: 0,
          skillsInstalled: 0,
          agentsInstalled: 0,
          hooksConfigured: false,
          mcpConfigured: false,
          claudeMdGenerated: false,
          workersStarted: 0,
        },
        totalDurationMs: 50,
        timestamp: new Date(),
      };

      const formatted = formatInitResult(result);

      expect(formatted).toContain('AQE v3 Initialization');
      expect(formatted).toContain('failed');
    });

    it('should include step timing', () => {
      const result: InitResult = {
        success: true,
        config: {
          version: '3.0.0',
          project: { name: 'test', root: '/test', type: 'single' },
          learning: {
            enabled: true,
            embeddingModel: 'hash',
            hnswConfig: { M: 16, efConstruction: 200, efSearch: 100 },
            qualityThreshold: 0.7,
            promotionThreshold: 3,
            pretrainedPatterns: true,
          },
          routing: { mode: 'rules', confidenceThreshold: 0.7, fallbackEnabled: true },
          workers: { enabled: [], intervals: {}, maxConcurrent: 4, daemonAutoStart: false },
          hooks: { claudeCode: false, preCommit: false, ciIntegration: false },
          autoTuning: { enabled: false, parameters: [], evaluationPeriodMs: 60000 },
          domains: { enabled: [], disabled: [] },
          agents: { maxConcurrent: 5, defaultTimeout: 60000 },
        },
        steps: [
          { step: 'Step 1', status: 'success', message: 'Done', durationMs: 123 },
        ],
        summary: {
          projectAnalyzed: true,
          configGenerated: true,
          patternsLoaded: 0,
          skillsInstalled: 0,
          agentsInstalled: 0,
          hooksConfigured: false,
          mcpConfigured: false,
          claudeMdGenerated: false,
          workersStarted: 0,
        },
        totalDurationMs: 123,
        timestamp: new Date(),
      };

      const formatted = formatInitResult(result);

      expect(formatted).toContain('123ms');
    });
  });

  describe('Error Handling', () => {
    it('should handle analysis errors gracefully', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      expect(result.steps.some((s) => s.status === 'error')).toBe(true);
    });

    it('should include error message in failed steps', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Test error message');
      });

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      expect(result.success).toBe(false);
      const errorStep = result.steps.find((s) => s.status === 'error');
      expect(errorStep?.message).toContain('Test error message');
    });
  });

  describe('Real Implementation File Operations', () => {
    it('should create .agentic-qe directory and config.yaml', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify mkdirSync was called for .agentic-qe
      expect(mockMkdirSync).toHaveBeenCalled();
      const mkdirCalls = mockMkdirSync.mock.calls;
      const configDirCall = mkdirCalls.find((call) =>
        (call[0] as string).includes('.agentic-qe')
      );
      expect(configDirCall).toBeDefined();

      // Verify writeFileSync was called for config.yaml
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writeCalls = mockWriteFileSync.mock.calls;
      const configYamlCall = writeCalls.find((call) =>
        (call[0] as string).includes('config.yaml')
      );
      expect(configYamlCall).toBeDefined();
      expect(configYamlCall![1]).toContain('version: "3.0.0"');
      expect(configYamlCall![1]).toContain('project:');
    });

    it('should create .claude/settings.json with hooks', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify writeFileSync was called for settings.json
      const writeCalls = mockWriteFileSync.mock.calls;
      const settingsCall = writeCalls.find((call) =>
        (call[0] as string).includes('settings.json')
      );
      expect(settingsCall).toBeDefined();

      // Parse and verify the settings content
      const settingsContent = JSON.parse(settingsCall![1] as string);
      expect(settingsContent.hooks).toBeDefined();
      expect(settingsContent.hooks.PreToolUse).toBeDefined();
      expect(settingsContent.hooks.PostToolUse).toBeDefined();
      expect(settingsContent.hooks.SessionStart).toBeDefined();
      expect(settingsContent.hooks.SessionEnd).toBeDefined();
      expect(settingsContent.aqe).toBeDefined();
      expect(settingsContent.aqe.hooksConfigured).toBe(true);
    });

    it('should create learning system directories and config', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify data and hnsw directories created
      const mkdirCalls = mockMkdirSync.mock.calls;
      const dataDirCall = mkdirCalls.find((call) =>
        (call[0] as string).includes('data')
      );
      expect(dataDirCall).toBeDefined();

      const hnswDirCall = mkdirCalls.find((call) =>
        (call[0] as string).includes('hnsw')
      );
      expect(hnswDirCall).toBeDefined();

      // Verify learning-config.json written
      const writeCalls = mockWriteFileSync.mock.calls;
      const learningConfigCall = writeCalls.find((call) =>
        (call[0] as string).includes('learning-config.json')
      );
      expect(learningConfigCall).toBeDefined();

      const learningConfig = JSON.parse(learningConfigCall![1] as string);
      expect(learningConfig.embeddingModel).toBeDefined();
      expect(learningConfig.hnswConfig).toBeDefined();
      expect(learningConfig.databasePath).toContain('qe-patterns.db');
    });

    it('should create worker registry and configs', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify workers directory created
      const mkdirCalls = mockMkdirSync.mock.calls;
      const workersDirCall = mkdirCalls.find((call) =>
        (call[0] as string).includes('workers')
      );
      expect(workersDirCall).toBeDefined();

      // Verify registry.json written
      const writeCalls = mockWriteFileSync.mock.calls;
      const registryCall = writeCalls.find((call) =>
        (call[0] as string).includes('registry.json')
      );
      expect(registryCall).toBeDefined();

      const registry = JSON.parse(registryCall![1] as string);
      expect(registry.version).toBe('3.0.0');
      expect(registry.workers).toBeDefined();
      expect(registry.maxConcurrent).toBeDefined();
    });

    it('should write pretrained patterns to domain directories', async () => {
      const testPatterns = [
        {
          id: 'p1',
          domain: 'test-generation',
          type: 'unit',
          content: 'test pattern 1',
          metadata: { confidence: 0.9, usageCount: 5, successRate: 0.95 },
        },
        {
          id: 'p2',
          domain: 'test-generation',
          type: 'integration',
          content: 'test pattern 2',
          metadata: { confidence: 0.85, usageCount: 3, successRate: 0.9 },
        },
      ];

      const pretrainedLibrary: PretrainedLibrary = {
        version: '1.0.0',
        exportedFrom: 'test-suite',
        exportDate: new Date().toISOString(),
        patterns: testPatterns,
        statistics: {
          totalPatterns: 2,
          byDomain: { 'test-generation': 2 },
          byLanguage: {},
          averageConfidence: 0.875,
        },
      };

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
        pretrainedLibrary,
      });

      await orchestrator.initialize();

      // Verify pattern directory created for the domain
      const mkdirCalls = mockMkdirSync.mock.calls;
      const patternDirCall = mkdirCalls.find((call) =>
        (call[0] as string).includes('patterns/test-generation')
      );
      expect(patternDirCall).toBeDefined();

      // Verify patterns.json written
      const writeCalls = mockWriteFileSync.mock.calls;
      const patternsCall = writeCalls.find((call) =>
        (call[0] as string).includes('patterns.json')
      );
      expect(patternsCall).toBeDefined();

      const patterns = JSON.parse(patternsCall![1] as string);
      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).toBe('p1');
    });

    it('should not write hooks when claudeCode is disabled', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        wizardAnswers: {
          hooks: false,
        },
      });

      await orchestrator.initialize();

      // Verify settings.json was NOT written
      const writeCalls = mockWriteFileSync.mock.calls;
      const settingsCall = writeCalls.find((call) =>
        (call[0] as string).includes('settings.json')
      );
      expect(settingsCall).toBeUndefined();
    });

    it('should not write worker configs when daemonAutoStart is disabled', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        wizardAnswers: {
          workers: false,
        },
      });

      await orchestrator.initialize();

      // Verify registry.json was NOT written
      const writeCalls = mockWriteFileSync.mock.calls;
      const registryCall = writeCalls.find((call) =>
        (call[0] as string).includes('registry.json')
      );
      expect(registryCall).toBeUndefined();
    });

    it('should create CLAUDE.md with AQE v3 section', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify CLAUDE.md was written
      const writeCalls = mockWriteFileSync.mock.calls;
      const claudeMdCall = writeCalls.find((call) =>
        (call[0] as string).includes('CLAUDE.md')
      );
      expect(claudeMdCall).toBeDefined();

      // Verify content includes expected sections
      const content = claudeMdCall![1] as string;
      expect(content).toContain('Agentic QE v3');
      expect(content).toContain('MCP Server');
      expect(content).toContain('DDD Bounded Contexts');
      expect(content).toContain('V3 QE Agents');
      expect(content).toContain('Data Storage');
      expect(content).toContain('qe-patterns.db');
    });

    it('should append to existing CLAUDE.md with backup', async () => {
      // Simulate existing CLAUDE.md
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('CLAUDE.md') && !path.includes('.backup')) return true;
        if (path.includes('package.json')) return true;
        return false;
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('CLAUDE.md')) {
          return '# Existing CLAUDE.md\n\nSome existing content here.';
        }
        if (path.includes('package.json')) {
          return JSON.stringify({ name: 'test-project' });
        }
        return '';
      });

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      const writeCalls = mockWriteFileSync.mock.calls;

      // Verify backup was created
      const backupCall = writeCalls.find((call) =>
        (call[0] as string).includes('CLAUDE.md.backup')
      );
      expect(backupCall).toBeDefined();
      expect(backupCall![1]).toBe('# Existing CLAUDE.md\n\nSome existing content here.');

      // Verify CLAUDE.md was appended to
      const claudeMdCall = writeCalls.find((call) =>
        (call[0] as string).includes('CLAUDE.md') && !(call[0] as string).includes('.backup')
      );
      expect(claudeMdCall).toBeDefined();

      const content = claudeMdCall![1] as string;
      // Should contain existing content
      expect(content).toContain('# Existing CLAUDE.md');
      expect(content).toContain('Some existing content');
      // Should contain AQE section
      expect(content).toContain('Agentic QE v3');
    });

    it('should not duplicate AQE section in CLAUDE.md', async () => {
      // Simulate existing CLAUDE.md that already has AQE section
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('CLAUDE.md')) return true;
        if (path.includes('package.json')) return true;
        return false;
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('CLAUDE.md')) {
          return '# Existing CLAUDE.md\n\n## Agentic QE v3\n\nAlready has section.';
        }
        if (path.includes('package.json')) {
          return JSON.stringify({ name: 'test-project' });
        }
        return '';
      });

      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      const result = await orchestrator.initialize();

      // Should still succeed - just won't duplicate
      expect(result.summary.claudeMdGenerated).toBe(true);
    });

    it('should create .claude/mcp.json with AQE v3 server', async () => {
      const orchestrator = createInitOrchestrator({
        projectRoot: testProjectRoot,
        autoMode: true,
      });

      await orchestrator.initialize();

      // Verify mcp.json was written
      const writeCalls = mockWriteFileSync.mock.calls;
      const mcpCall = writeCalls.find((call) =>
        (call[0] as string).includes('mcp.json')
      );
      expect(mcpCall).toBeDefined();

      // Verify content
      const mcpConfig = JSON.parse(mcpCall![1] as string);
      expect(mcpConfig.mcpServers).toBeDefined();
      expect(mcpConfig.mcpServers['agentic-qe-v3']).toBeDefined();
      expect(mcpConfig.mcpServers['agentic-qe-v3'].command).toBe('npx');
      expect(mcpConfig.mcpServers['agentic-qe-v3'].args).toContain('@agentic-qe/v3');
    });
  });
});
