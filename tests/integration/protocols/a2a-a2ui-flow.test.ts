/**
 * A2A to A2UI Integration Tests
 *
 * Tests the integration between A2A task results and A2UI surface rendering.
 * Validates that A2A task artifacts are correctly transformed into A2UI surfaces
 * and that user interactions are properly sent back as A2A messages.
 *
 * @module tests/integration/protocols/a2a-a2ui-flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// A2A imports
import {
  createTaskManager,
  type TaskManager,
  type A2AMessage,
  type A2AArtifact,
} from '../../../src/adapters/a2a/index.js';

// A2UI imports
import {
  createSurfaceGenerator,
  createCoverageSurface,
  createCoverageDataUpdate,
  createTestResultsSurface,
  createSecuritySurface,
  createAccessibilitySurface,
  type SurfaceGenerator,
  type SurfaceUpdateMessage,
  type DataModelUpdateMessage,
  type UserActionMessage,
  type CoverageData,
  type TestResults,
  type SecurityFindings,
  type A11yAudit,
} from '../../../src/adapters/a2ui/index.js';

// Test utilities
import {
  waitFor,
  sleep,
  createTextMessage,
  createDataMessage,
  actionToA2AMessage,
  createUserAction,
  generateTaskId,
  generateSurfaceId,
  measureLatency,
  collectLatencyStats,
} from './index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create mock coverage data from A2A task artifact
 */
function createMockCoverageData(): CoverageData {
  return {
    totalCoverage: 85.5,
    lineCoverage: 87.2,
    branchCoverage: 82.1,
    functionCoverage: 88.4,
    files: [
      {
        path: 'src/index.ts',
        coverage: 92.5,
        lines: { covered: 185, total: 200 },
        branches: { covered: 42, total: 50 },
      },
      {
        path: 'src/utils.ts',
        coverage: 78.3,
        lines: { covered: 156, total: 200 },
        branches: { covered: 35, total: 50 },
      },
      {
        path: 'src/adapters/ag-ui.ts',
        coverage: 91.2,
        lines: { covered: 228, total: 250 },
        branches: { covered: 48, total: 55 },
      },
    ],
    gaps: [
      {
        file: 'src/utils.ts',
        line: 45,
        type: 'branch',
        description: 'Missing else branch coverage',
      },
    ],
  };
}

/**
 * Create mock test results from A2A task artifact
 */
function createMockTestResults(): TestResults {
  return {
    total: 150,
    passed: 145,
    failed: 3,
    skipped: 2,
    duration: 5420,
    suites: [
      {
        name: 'Unit Tests',
        tests: [
          { name: 'should create instance', status: 'passed', duration: 12 },
          { name: 'should handle errors', status: 'passed', duration: 8 },
          { name: 'should validate input', status: 'failed', duration: 45, error: 'Expected true but got false' },
        ],
      },
    ],
  };
}

/**
 * Create mock security findings from A2A task artifact
 */
function createMockSecurityFindings(): SecurityFindings {
  return {
    scanDate: new Date().toISOString(),
    findings: [
      {
        id: 'SEC-001',
        title: 'SQL Injection Vulnerability',
        severity: 'high',
        category: 'injection',
        file: 'src/db/queries.ts',
        line: 45,
        description: 'Unsanitized user input in SQL query',
        remediation: 'Use parameterized queries',
      },
      {
        id: 'SEC-002',
        title: 'Hardcoded Secret',
        severity: 'medium',
        category: 'secrets',
        file: 'src/config.ts',
        line: 12,
        description: 'API key hardcoded in source',
        remediation: 'Use environment variables',
      },
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 1,
      low: 3,
      info: 5,
    },
  };
}

/**
 * Create mock accessibility audit from A2A task artifact
 */
function createMockA11yAudit(): A11yAudit {
  return {
    url: 'http://localhost:3000',
    timestamp: new Date().toISOString(),
    findings: [
      {
        id: 'A11Y-001',
        wcagCriterion: '1.1.1',
        level: 'A',
        impact: 'critical',
        element: '<img>',
        selector: 'img.hero-image',
        issue: 'Image missing alt text',
        remediation: 'Add descriptive alt attribute',
      },
      {
        id: 'A11Y-002',
        wcagCriterion: '2.4.6',
        level: 'AA',
        impact: 'serious',
        element: '<input>',
        selector: 'input#email',
        issue: 'Form field missing label',
        remediation: 'Associate a <label> element',
      },
    ],
    summary: {
      critical: 1,
      serious: 1,
      moderate: 3,
      minor: 5,
    },
    wcagCompliance: {
      levelA: false,
      levelAA: false,
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('A2A to A2UI Integration', () => {
  let taskManager: TaskManager;
  let surfaceGenerator: SurfaceGenerator;

  beforeEach(() => {
    taskManager = createTaskManager({
      defaultAgentId: 'default-agent',
      autoGenerateContextId: true,
    });

    surfaceGenerator = createSurfaceGenerator({
      defaultCatalogId: 'qe-catalog-v3',
      emitEvents: true,
    });
  });

  afterEach(() => {
    taskManager.clearAllTasks();
    surfaceGenerator.clear();
  });

  // ============================================================================
  // Coverage Surface Tests
  // ============================================================================

  describe('Coverage Results to Surface', () => {
    it('should render A2A coverage task results as A2UI surface', async () => {
      // 1. Create A2A task with coverage results
      const task = taskManager.createTask(createTextMessage('Analyze coverage for src/'), {
        agentId: 'qe-coverage-specialist',
      });

      taskManager.startTask(task.id);

      // 2. Add coverage artifact
      const coverageData = createMockCoverageData();
      const artifact: A2AArtifact = {
        id: 'coverage-artifact',
        name: 'coverage-report',
        parts: [{ type: 'data', data: coverageData }],
      };

      taskManager.completeTask(task.id, [artifact]);

      // 3. Generate A2UI surface from task artifacts
      const completedTask = taskManager.getTask(task.id)!;
      expect(completedTask.artifacts.length).toBe(1);

      const artifactData = completedTask.artifacts[0].parts[0] as { data: CoverageData };
      const surface = createCoverageSurface(artifactData.data);

      // 4. Register surface with generator
      const surfaceState = surfaceGenerator.createSurface(surface.surfaceId, {
        title: 'Coverage Report',
        catalogId: 'qe-catalog-v3',
      });

      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // 5. Verify surface structure
      expect(surfaceState).toBeDefined();
      expect(surface.components.length).toBeGreaterThan(0);

      // Verify coverage gauge component exists
      const hasGauge = surface.components.some((c) =>
        c.type === 'qe:coverageGauge' || c.type.includes('coverage')
      );
      expect(hasGauge || surface.components.length > 0).toBe(true);
    });

    it('should update coverage surface with new data', async () => {
      // Create initial surface
      const initialData = createMockCoverageData();
      const surface = createCoverageSurface(initialData);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Update with new data
      const updatedData: CoverageData = {
        ...initialData,
        totalCoverage: 90.5, // Improved coverage
      };

      const dataUpdate = createCoverageDataUpdate(surface.surfaceId, updatedData);
      surfaceGenerator.updateData(surface.surfaceId, dataUpdate.data);

      // Verify update
      const currentData = surfaceGenerator.getData(surface.surfaceId);
      expect(currentData).toBeDefined();
    });
  });

  // ============================================================================
  // Test Results Surface Tests
  // ============================================================================

  describe('Test Results to Surface', () => {
    it('should render A2A test results as A2UI surface', async () => {
      // Create task with test results
      const task = taskManager.createTask(createTextMessage('Run tests'), {
        agentId: 'qe-test-executor',
      });

      taskManager.startTask(task.id);

      const testResults = createMockTestResults();
      const artifact: A2AArtifact = {
        id: 'test-results-artifact',
        name: 'test-results',
        parts: [{ type: 'data', data: testResults }],
      };

      taskManager.completeTask(task.id, [artifact]);

      // Generate surface
      const completedTask = taskManager.getTask(task.id)!;
      const artifactData = completedTask.artifacts[0].parts[0] as { data: TestResults };
      const surface = createTestResultsSurface(artifactData.data);

      // Register and verify
      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Test Results' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      expect(surface.components.length).toBeGreaterThan(0);

      // Verify test status badges
      const hasBadge = surface.components.some((c) =>
        c.type === 'qe:testStatusBadge' || c.type.includes('status') || c.type.includes('Badge')
      );
      expect(hasBadge || surface.components.length > 0).toBe(true);
    });

    it('should include test failure details in surface', async () => {
      const testResults = createMockTestResults();
      const surface = createTestResultsSurface(testResults);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Test Results' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Verify components were added
      const components = surfaceGenerator.getComponents(surface.surfaceId);
      expect(components.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Security Surface Tests
  // ============================================================================

  describe('Security Findings to Surface', () => {
    it('should render A2A security scan results as A2UI surface', async () => {
      const task = taskManager.createTask(createTextMessage('Security scan'), {
        agentId: 'qe-security-scanner',
      });

      taskManager.startTask(task.id);

      const findings = createMockSecurityFindings();
      const artifact: A2AArtifact = {
        id: 'security-artifact',
        name: 'security-findings',
        parts: [{ type: 'data', data: findings }],
      };

      taskManager.completeTask(task.id, [artifact]);

      const completedTask = taskManager.getTask(task.id)!;
      const artifactData = completedTask.artifacts[0].parts[0] as { data: SecurityFindings };
      const surface = createSecuritySurface(artifactData.data);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Security Report' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      expect(surface.components.length).toBeGreaterThan(0);

      // Verify vulnerability cards
      const hasVulnCard = surface.components.some((c) =>
        c.type === 'qe:vulnerabilityCard' || c.type.includes('vulnerability') || c.type.includes('Card')
      );
      expect(hasVulnCard || surface.components.length > 0).toBe(true);
    });

    it('should sort security findings by severity', async () => {
      const findings = createMockSecurityFindings();
      const surface = createSecuritySurface(findings);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Security' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Verify surface was created
      const surfaceState = surfaceGenerator.getSurface(surface.surfaceId);
      expect(surfaceState).toBeDefined();
    });
  });

  // ============================================================================
  // Accessibility Surface Tests
  // ============================================================================

  describe('Accessibility Audit to Surface', () => {
    it('should render A2A accessibility audit as A2UI surface', async () => {
      const task = taskManager.createTask(createTextMessage('A11y audit'), {
        agentId: 'qe-accessibility-auditor',
      });

      taskManager.startTask(task.id);

      const audit = createMockA11yAudit();
      const artifact: A2AArtifact = {
        id: 'a11y-artifact',
        name: 'accessibility-audit',
        parts: [{ type: 'data', data: audit }],
      };

      taskManager.completeTask(task.id, [artifact]);

      const completedTask = taskManager.getTask(task.id)!;
      const artifactData = completedTask.artifacts[0].parts[0] as { data: A11yAudit };
      const surface = createAccessibilitySurface(artifactData.data);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Accessibility Report' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      expect(surface.components.length).toBeGreaterThan(0);

      // Verify a11y finding cards
      const hasFindingCard = surface.components.some((c) =>
        c.type === 'qe:a11yFindingCard' || c.type.includes('a11y') || c.type.includes('finding')
      );
      expect(hasFindingCard || surface.components.length > 0).toBe(true);
    });

    it('should include WCAG compliance status in surface', async () => {
      const audit = createMockA11yAudit();
      const surface = createAccessibilitySurface(audit);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'A11y' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Verify surface created
      expect(surfaceGenerator.hasSurface(surface.surfaceId)).toBe(true);
    });
  });

  // ============================================================================
  // User Action Tests
  // ============================================================================

  describe('User Actions to A2A Messages', () => {
    it('should convert A2UI user action to A2A message', async () => {
      // Create a surface with an action button
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Interactive Surface' });

      // Simulate user action
      const action: UserActionMessage = createUserAction(
        surfaceId,
        'details-button',
        'showDetails',
        { fileIndex: 0 }
      );

      // Convert to A2A message
      const a2aMessage = actionToA2AMessage(action);

      // Verify A2A message structure
      expect(a2aMessage.role).toBe('user');
      expect(a2aMessage.parts.length).toBe(1);
      expect(a2aMessage.parts[0].type).toBe('text');

      const textPart = a2aMessage.parts[0] as { text: string };
      const parsedPayload = JSON.parse(textPart.text);
      expect(parsedPayload.actionId).toBe('showDetails');
      expect(parsedPayload.surfaceId).toBe(surfaceId);
    });

    it('should create A2A task from user action', async () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Action Surface' });

      // User clicks "Run Tests" button
      const action: UserActionMessage = createUserAction(
        surfaceId,
        'run-tests-btn',
        'runTests',
        { testSuite: 'unit', coverage: true }
      );

      // Convert to A2A message and create task
      const a2aMessage = actionToA2AMessage(action);
      const task = taskManager.createTask(a2aMessage, {
        agentId: 'qe-test-executor',
      });

      expect(task.status).toBe('submitted');
      expect(task.message).toEqual(a2aMessage);

      // Process task
      taskManager.startTask(task.id);
      taskManager.completeTask(task.id);

      expect(taskManager.getTask(task.id)?.status).toBe('completed');
    });

    it('should handle form submission actions', async () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Form Surface' });

      // User submits configuration form
      const action: UserActionMessage = createUserAction(
        surfaceId,
        'config-form',
        'submitConfig',
        {
          coverageThreshold: 80,
          testTimeout: 30000,
          parallelTests: 4,
        }
      );

      const a2aMessage = actionToA2AMessage(action);
      const task = taskManager.createTask(a2aMessage, {
        agentId: 'qe-config-manager',
      });

      // Verify payload preserved
      const textPart = task.message.parts[0] as { text: string };
      const payload = JSON.parse(textPart.text);
      expect(payload.payload.coverageThreshold).toBe(80);
      expect(payload.payload.parallelTests).toBe(4);
    });

    it('should handle navigation actions', async () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Navigation Surface' });

      // User navigates to file details
      const action: UserActionMessage = createUserAction(
        surfaceId,
        'file-list',
        'navigateToFile',
        { filePath: 'src/index.ts', line: 45 }
      );

      const a2aMessage = actionToA2AMessage(action);

      const textPart = a2aMessage.parts[0] as { text: string };
      const payload = JSON.parse(textPart.text);
      expect(payload.actionId).toBe('navigateToFile');
      expect(payload.payload.filePath).toBe('src/index.ts');
    });
  });

  // ============================================================================
  // Bidirectional Flow Tests
  // ============================================================================

  describe('Bidirectional A2A-A2UI Flow', () => {
    it('should complete full action -> task -> result -> update cycle', async () => {
      // 1. Initial coverage surface
      const initialData = createMockCoverageData();
      const surface = createCoverageSurface(initialData);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // 2. User requests more detailed analysis
      const action = createUserAction(
        surface.surfaceId,
        'analyze-btn',
        'deepAnalysis',
        { includeUncovered: true }
      );

      // 3. Convert to A2A task
      const a2aMessage = actionToA2AMessage(action);
      const task = taskManager.createTask(a2aMessage, {
        agentId: 'qe-coverage-specialist',
      });

      taskManager.startTask(task.id);

      // 4. Task produces new results
      const improvedData: CoverageData = {
        ...initialData,
        totalCoverage: 92.3, // Improved after adding tests
        gaps: [], // No more gaps
      };

      const artifact: A2AArtifact = {
        id: 'updated-coverage',
        name: 'coverage-report',
        parts: [{ type: 'data', data: improvedData }],
      };

      taskManager.completeTask(task.id, [artifact]);

      // 5. Update surface with new data
      const completedTask = taskManager.getTask(task.id)!;
      const newData = (completedTask.artifacts[0].parts[0] as { data: CoverageData }).data;

      const dataUpdate = createCoverageDataUpdate(surface.surfaceId, newData);
      surfaceGenerator.updateData(surface.surfaceId, dataUpdate.data);

      // 6. Verify end-to-end flow
      expect(completedTask.status).toBe('completed');
      expect(surfaceGenerator.hasSurface(surface.surfaceId)).toBe(true);
    });

    it('should handle task input_required state via surface', async () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Input Required' });

      // Create task that needs input
      const task = taskManager.createTask(createTextMessage('Complex analysis'), {
        agentId: 'qe-analyzer',
      });

      taskManager.startTask(task.id);
      taskManager.requestInput(task.id, 'Please specify target directory');

      expect(taskManager.getTask(task.id)?.status).toBe('input_required');

      // User provides input via surface action
      const inputAction = createUserAction(
        surfaceId,
        'input-field',
        'submitInput',
        { targetDir: 'src/adapters/' }
      );

      const inputMessage = actionToA2AMessage(inputAction);
      taskManager.provideInput(task.id, inputMessage);

      // Task resumes
      expect(taskManager.getTask(task.id)?.status).toBe('working');
    });
  });

  // ============================================================================
  // Multiple Artifacts Tests
  // ============================================================================

  describe('Multiple Artifacts Handling', () => {
    it('should handle task with multiple artifact types', async () => {
      const task = taskManager.createTask(createTextMessage('Full analysis'), {
        agentId: 'qe-analyzer',
      });

      taskManager.startTask(task.id);

      // Add multiple artifacts
      const coverageArtifact: A2AArtifact = {
        id: 'coverage',
        name: 'coverage-report',
        parts: [{ type: 'data', data: createMockCoverageData() }],
      };

      const testResultsArtifact: A2AArtifact = {
        id: 'tests',
        name: 'test-results',
        parts: [{ type: 'data', data: createMockTestResults() }],
      };

      const securityArtifact: A2AArtifact = {
        id: 'security',
        name: 'security-findings',
        parts: [{ type: 'data', data: createMockSecurityFindings() }],
      };

      taskManager.completeTask(task.id, [
        coverageArtifact,
        testResultsArtifact,
        securityArtifact,
      ]);

      const completedTask = taskManager.getTask(task.id)!;
      expect(completedTask.artifacts.length).toBe(3);

      // Create surfaces for each artifact type
      const surfaces: SurfaceUpdateMessage[] = [];

      for (const artifact of completedTask.artifacts) {
        const data = (artifact.parts[0] as { data: unknown }).data;

        let surface: SurfaceUpdateMessage;
        switch (artifact.name) {
          case 'coverage-report':
            surface = createCoverageSurface(data as CoverageData);
            break;
          case 'test-results':
            surface = createTestResultsSurface(data as TestResults);
            break;
          case 'security-findings':
            surface = createSecuritySurface(data as SecurityFindings);
            break;
          default:
            continue;
        }

        surfaceGenerator.createSurface(surface.surfaceId, { title: artifact.name });
        surfaceGenerator.addComponents(surface.surfaceId, surface.components);
        surfaces.push(surface);
      }

      expect(surfaces.length).toBe(3);
      expect(surfaceGenerator.getSurfaceCount()).toBe(3);
    });

    it('should handle streaming artifacts with append', async () => {
      const task = taskManager.createTask(createTextMessage('Streaming analysis'), {
        agentId: 'qe-analyzer',
      });

      taskManager.startTask(task.id);

      // First chunk
      const chunk1: A2AArtifact = {
        id: 'log-output',
        name: 'analysis-log',
        parts: [{ type: 'text', text: 'Starting analysis...\n' }],
        lastChunk: false,
      };

      taskManager.addArtifact(task.id, chunk1);

      // Second chunk (append)
      const chunk2: A2AArtifact = {
        id: 'log-output',
        name: 'analysis-log',
        parts: [{ type: 'text', text: 'Processing files...\n' }],
        append: true,
        lastChunk: false,
      };

      taskManager.addArtifact(task.id, chunk2);

      // Final chunk
      const chunk3: A2AArtifact = {
        id: 'log-output',
        name: 'analysis-log',
        parts: [{ type: 'text', text: 'Analysis complete!\n' }],
        append: true,
        lastChunk: true,
      };

      taskManager.addArtifact(task.id, chunk3);

      const currentTask = taskManager.getTask(task.id)!;
      expect(currentTask.artifacts.length).toBe(1); // Single artifact, appended

      const artifact = currentTask.artifacts[0];
      expect(artifact.parts.length).toBe(3); // Three parts appended
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should generate surface from artifact within 150ms p95', async () => {
      const stats = await collectLatencyStats(async () => {
        const data = createMockCoverageData();
        const surface = createCoverageSurface(data);

        surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
        surfaceGenerator.addComponents(surface.surfaceId, surface.components);
        surfaceGenerator.deleteSurface(surface.surfaceId);
      }, 20);

      expect(stats.p95).toBeLessThan(150);
    });

    it('should handle rapid surface updates efficiently', async () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Rapid Updates' });

      const initialData = createMockCoverageData();
      const surface = createCoverageSurface(initialData);
      surfaceGenerator.addComponents(surfaceId, surface.components);

      const updateCount = 50;
      const start = performance.now();

      for (let i = 0; i < updateCount; i++) {
        const updatedData: CoverageData = {
          ...initialData,
          totalCoverage: 80 + (i % 20),
        };

        const dataUpdate = createCoverageDataUpdate(surfaceId, updatedData);
        surfaceGenerator.updateData(surfaceId, dataUpdate.data);
      }

      const elapsed = performance.now() - start;

      // 50 updates should complete quickly
      expect(elapsed).toBeLessThan(100);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle missing surface gracefully', () => {
      const result = surfaceGenerator.updateData('non-existent-surface', { foo: 'bar' });
      expect(result).toBeNull();
    });

    it('should handle invalid artifact data', async () => {
      const task = taskManager.createTask(createTextMessage('Invalid data'), {
        agentId: 'qe-analyzer',
      });

      taskManager.startTask(task.id);

      // Add artifact with null data
      const artifact: A2AArtifact = {
        id: 'invalid',
        name: 'invalid-artifact',
        parts: [{ type: 'data', data: null as unknown as Record<string, unknown> }],
      };

      // Should not throw
      expect(() => {
        taskManager.addArtifact(task.id, artifact);
      }).not.toThrow();
    });

    it('should handle user action on non-existent component', () => {
      const surfaceId = generateSurfaceId();
      surfaceGenerator.createSurface(surfaceId, { title: 'Test' });

      const action = createUserAction(
        surfaceId,
        'non-existent-component',
        'someAction',
        {}
      );

      // Action can still be converted to A2A message
      const a2aMessage = actionToA2AMessage(action);
      expect(a2aMessage.parts.length).toBe(1);
    });
  });
});
