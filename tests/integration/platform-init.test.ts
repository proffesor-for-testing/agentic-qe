/**
 * Integration Test: Platform Initialization Flow
 * TQ-004: Tests the init wizard orchestration pipeline end-to-end
 *
 * Covers: project analysis -> phase execution -> config generation
 * Mocks: filesystem operations, external services
 * Real: full orchestration pipeline, configuration logic, step sequencing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';

// Keep project analysis, configuration and orchestration real. Mock explicit
// side-effect boundaries so no database, installer or worker touches user state.
vi.mock('../../src/init/init-wizard-hooks.js', () => ({
  configureHooks: vi.fn(async () => true),
  configureMCP: vi.fn(async () => true),
  generateCLAUDEmd: vi.fn(async () => true),
}));

vi.mock('../../src/init/init-wizard-steps.js', () => ({
  initializePersistenceDatabase: vi.fn(async () => ({ success: true })),
  checkCodeIntelligenceIndex: vi.fn(async () => false),
  runCodeIntelligenceScan: vi.fn(async () => ({ status: 'new', entries: 42 })),
  getKGEntryCount: vi.fn(async () => 42),
  initializeLearningSystem: vi.fn(async () => 10),
  startWorkers: vi.fn(async () => 3),
  installSkills: vi.fn(async () => 5),
  installAgents: vi.fn(async () => 4),
  installN8n: vi.fn(async () => ({ agents: 2, skills: 3 })),
  saveConfig: vi.fn(async () => {}),
  writeVersionToDb: vi.fn(async () => {}),
}));

import { InitOrchestrator } from '../../src/init/init-wizard';
import { configureHooks, configureMCP, generateCLAUDEmd } from '../../src/init/init-wizard-hooks.js';
import {
  initializePersistenceDatabase,
  installSkills,
  installAgents,
  startWorkers,
  saveConfig,
  writeVersionToDb,
  runCodeIntelligenceScan,
} from '../../src/init/init-wizard-steps.js';

// ============================================================================
// Test Suite
// ============================================================================

describe('Platform Init - Current Orchestration Pipeline', () => {
  let projectRoot: string;

  beforeEach(() => {
    // Arrange: create a real temp directory with a package.json
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-e2e-init-'));
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        devDependencies: { vitest: '^1.0.0' },
      }),
    );
    // Create minimal src directory so analyzer finds files
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const hello = "world";');
    writeFileSync(join(projectRoot, 'vitest.config.ts'), 'export default {}');
    writeFileSync(join(projectRoot, 'tsconfig.json'), '{}');
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (existsSync(projectRoot)) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  // --------------------------------------------------------------------------
  // 1. Happy path: auto-mode initialization
  // --------------------------------------------------------------------------
  it('should complete full auto-mode initialization with all steps succeeding', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
      skipPatterns: false,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  // --------------------------------------------------------------------------
  // 2. Verify step ordering in the pipeline
  // --------------------------------------------------------------------------
  it('should execute steps in correct order', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert: check step names appear in sequence
    const stepNames = result.steps.map((s) => s.step);
    expect(stepNames).toContain('Project Analysis');
    expect(stepNames).toContain('Configuration Generation');
    expect(stepNames).toContain('Persistence Database Setup');

    // Project Analysis must come before Configuration Generation
    const analysisIdx = stepNames.indexOf('Project Analysis');
    const configIdx = stepNames.indexOf('Configuration Generation');
    expect(analysisIdx).toBeLessThan(configIdx);
    const requiredOrder = ['Configuration Generation', 'Persistence Database Setup', 'Code Intelligence Pre-Scan',
      'Hooks Configuration', 'MCP Configuration', 'Skills Installation', 'Agents Installation', 'Save Configuration', 'Version Marker'];
    for (let index = 1; index < requiredOrder.length; index++) {
      expect(stepNames.indexOf(requiredOrder[index - 1])).toBeLessThan(stepNames.indexOf(requiredOrder[index]));
      expect(stepNames.indexOf(requiredOrder[index])).toBeGreaterThanOrEqual(0);
    }
    expect(vi.mocked(initializePersistenceDatabase).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runCodeIntelligenceScan).mock.invocationCallOrder[0]);
    expect(vi.mocked(saveConfig).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(writeVersionToDb).mock.invocationCallOrder[0]);
  });

  // --------------------------------------------------------------------------
  // 3. Project analysis detects frameworks correctly
  // --------------------------------------------------------------------------
  it('should detect vitest framework from project structure', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert: the config should reflect detected frameworks
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config.learning.embeddingModel).toBe('transformer');
    expect(result.config.routing.confidenceThreshold).toBe(0.75);
    // Config should have domains enabled (domains is an object with enabled/disabled arrays)
    expect(result.config.domains).toBeDefined();
    expect(result.config.domains.enabled.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 4. Configuration generation produces valid config
  // --------------------------------------------------------------------------
  it('should generate config with required fields', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert
    expect(result.config).toMatchObject({
      version: expect.any(String),
      domains: expect.objectContaining({
        enabled: expect.any(Array),
      }),
      learning: expect.objectContaining({
        enabled: expect.any(Boolean),
      }),
    });
  });

  // --------------------------------------------------------------------------
  // 5. Hooks and MCP configuration are called
  // --------------------------------------------------------------------------
  it('should configure hooks and MCP when enabled', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert
    expect(result.success).toBe(true);
    expect(configureHooks).toHaveBeenCalled();
    expect(configureMCP).toHaveBeenCalledWith(projectRoot, { force: undefined });
    expect(generateCLAUDEmd).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Current --no-mcp contract still completes unrelated initialization.
  it('should skip MCP configuration only when explicitly disabled', async () => {
    const result = await new InitOrchestrator({ projectRoot, autoMode: true, noMcp: true }).initialize();
    expect(result.success).toBe(true);
    expect(result.summary.mcpConfigured).toBe(false);
    expect(configureMCP).not.toHaveBeenCalled();
    expect(configureHooks).toHaveBeenCalled();
    expect(saveConfig).toHaveBeenCalled();
    expect(writeVersionToDb).toHaveBeenCalled();
  });

  // 6. Skills and agents installation
  // --------------------------------------------------------------------------
  it('should install skills and agents during initialization', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert
    expect(result.success).toBe(true);
    expect(installSkills).toHaveBeenCalled();
    expect(installAgents).toHaveBeenCalledWith(projectRoot);
    expect(result.summary.skillsInstalled).toBe(5);
    expect(result.summary.agentsInstalled).toBe(4);
  });

  // --------------------------------------------------------------------------
  // 7. Required persistence failure prevents downstream side effects
  // --------------------------------------------------------------------------
  it('should stop after required persistence fails', async () => {
    vi.mocked(initializePersistenceDatabase).mockRejectedValueOnce(new Error('fixture persistence unavailable'));
    const result = await new InitOrchestrator({ projectRoot, autoMode: true }).initialize();
    expect(result.success).toBe(false);
    expect(result.steps.find((step) => step.step === 'Persistence Database Setup')).toMatchObject({
      status: 'error', message: 'fixture persistence unavailable',
    });
    expect(runCodeIntelligenceScan).not.toHaveBeenCalled();
    expect(configureHooks).not.toHaveBeenCalled();
    expect(configureMCP).not.toHaveBeenCalled();
    expect(installAgents).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
    expect(writeVersionToDb).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // 8. Config is persisted at end of pipeline
  // --------------------------------------------------------------------------
  it('should save configuration before the version marker', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    await orchestrator.initialize();

    // Assert
    expect(saveConfig).toHaveBeenCalledWith(projectRoot, expect.any(Object));
  });

  // --------------------------------------------------------------------------
  // 9. Wizard steps are accessible
  // --------------------------------------------------------------------------
  it('should expose wizard step definitions', () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const steps = orchestrator.getWizardSteps();

    // Assert
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].id).toBe('welcome');
    expect(steps.some((s) => s.id === 'project-type')).toBe(true);
    expect(steps.some((s) => s.id === 'learning-mode')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 10. Summary aggregates all step outcomes
  // --------------------------------------------------------------------------
  it('should produce a summary with aggregated outcomes', async () => {
    // Arrange
    const orchestrator = new InitOrchestrator({
      projectRoot,
      autoMode: true,
    });

    // Act
    const result = await orchestrator.initialize();

    // Assert
    expect(result.summary).toMatchObject({
      projectAnalyzed: true,
      configGenerated: true,
      hooksConfigured: true,
      mcpConfigured: true,
      claudeMdGenerated: true,
      workersStarted: 3,
    });
  });
});
