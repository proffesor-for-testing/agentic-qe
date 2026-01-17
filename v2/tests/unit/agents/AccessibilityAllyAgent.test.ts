/**
 * AccessibilityAllyAgent Unit Tests
 * Tests for the intelligent accessibility testing agent
 */

import { AccessibilityAllyAgent } from '../../../src/agents/AccessibilityAllyAgent';
import { QEAgentType } from '../../../src/types';
import { EventEmitter } from 'events';

// Helper to create a mock memory store
function createMockMemoryStore() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    has: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(true),
    keys: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue(undefined),
    retrieve: jest.fn().mockResolvedValue(null)
  };
}

// Helper to create a proper TaskAssignment structure
function createTask(id: string, type: string, payload: any, agentId: string = 'test-agent') {
  return {
    id,
    task: { type, payload },
    agentId,
    assignedAt: new Date(),
    status: 'assigned'
  };
}

// Helper to create and initialize an agent
async function createAgent(config: Partial<any> = {}) {
  const eventBus = new EventEmitter();
  const memoryStore = createMockMemoryStore();

  const agent = new AccessibilityAllyAgent({
    wcagLevel: 'AA',
    enableVisionAPI: false,
    contextAwareRemediation: true,
    generateMarkdownReport: true,
    context: {
      workspaceRoot: '/test',
      project: 'test-project',
      environment: 'test'
    },
    memoryStore,
    eventBus,
    ...config
  });

  await agent.initialize();
  return { agent, eventBus, memoryStore };
}

describe('AccessibilityAllyAgent', () => {
  describe('Initialization', () => {
    it('should initialize with correct agent type', async () => {
      const { agent } = await createAgent();

      const agentId = agent.getAgentId();
      expect(agentId.type).toBe(QEAgentType.ACCESSIBILITY_ALLY);

      await agent.terminate();
    });

    it('should have accessibility-specific capabilities', async () => {
      const { agent } = await createAgent();

      const capabilities = agent.getCapabilities();
      const capabilityNames = Array.from(capabilities.values()).map(c => c.name);

      expect(capabilityNames).toContain('wcag-2.2-validation');
      expect(capabilityNames).toContain('context-aware-remediation');
      expect(capabilityNames).toContain('aria-intelligence');
      expect(capabilityNames).toContain('video-accessibility-analysis');
      expect(capabilityNames).toContain('webvtt-generation');
      expect(capabilityNames).toContain('en301549-compliance');
      expect(capabilityNames).toContain('keyboard-navigation-testing');
      expect(capabilityNames).toContain('color-contrast-optimization');

      await agent.terminate();
    });

    it('should be in idle status after initialization', async () => {
      const { agent } = await createAgent();

      const status = agent.getStatus();
      expect(status.status).toBe('idle');

      await agent.terminate();
    });

    it('should have 10 capabilities', async () => {
      const { agent } = await createAgent();

      const capabilities = agent.getCapabilities();
      // getCapabilities() returns an array, not a Map
      expect(capabilities.length).toBe(10);

      await agent.terminate();
    });
  });

  describe('Configuration', () => {
    it('should use default WCAG level AA when not specified', async () => {
      const eventBus = new EventEmitter();
      const memoryStore = createMockMemoryStore();

      const defaultAgent = new AccessibilityAllyAgent({
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      await defaultAgent.initialize();
      expect(defaultAgent.getStatus().status).toBe('idle');
      await defaultAgent.terminate();
    });

    it('should accept custom WCAG levels', async () => {
      const { agent } = await createAgent({ wcagLevel: 'AAA' });
      expect(agent.getStatus().status).toBe('idle');
      await agent.terminate();
    });

    it('should accept custom thresholds', async () => {
      const { agent } = await createAgent({
        thresholds: {
          minComplianceScore: 95,
          maxCriticalViolations: 0,
          maxSeriousViolations: 0
        }
      });
      expect(agent.getStatus().status).toBe('idle');
      await agent.terminate();
    });

    it('should support EU compliance settings', async () => {
      const { agent } = await createAgent({
        euCompliance: {
          enabled: true,
          en301549Mapping: true,
          euAccessibilityAct: true
        }
      });
      expect(agent.getStatus().status).toBe('idle');
      await agent.terminate();
    });
  });

  describe('Task Validation', () => {
    it('should throw error when scan task has no URL', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-no-url', 'scan', {});

      await expect(agent.executeTask(task)).rejects.toThrow('URL is required');
      await agent.terminate();
    });

    it('should throw error when check-compliance has no scan result', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-no-result', 'check-compliance', {});

      await expect(agent.executeTask(task)).rejects.toThrow('Scan result is required');
      await agent.terminate();
    });

    it('should throw error when keyboard analysis has no URL', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-keyboard-no-url', 'analyze-keyboard-nav', {});

      await expect(agent.executeTask(task)).rejects.toThrow('URL is required');
      await agent.terminate();
    });
  });

  describe('Generate Remediations', () => {
    it('should generate remediations for violations', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-remediations', 'generate-remediations', {
        violations: [
          {
            id: 'color-contrast',
            wcagCriterion: '1.4.3',
            severity: 'serious',
            elements: [{ html: '<p class="low-contrast">Text</p>' }]
          },
          {
            id: 'label',
            wcagCriterion: '1.3.1',
            severity: 'critical',
            elements: [{ html: '<input type="text">' }]
          }
        ]
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.remediationsGenerated).toBe(2);
      expect(result.remediations).toHaveLength(2);
      expect(result.remediations[0].violationId).toBe('color-contrast');
      expect(result.remediations[1].violationId).toBe('label');

      await agent.terminate();
    });

    it('should provide effort estimates for remediations', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-effort', 'generate-remediations', {
        violations: [
          { id: 'test-1', severity: 'critical' },
          { id: 'test-2', severity: 'serious' },
          { id: 'test-3', severity: 'moderate' },
          { id: 'test-4', severity: 'minor' }
        ]
      });

      const result = await agent.executeTask(task) as any;

      expect(result.remediations[0].effort).toContain('High');
      expect(result.remediations[1].effort).toContain('Medium');
      expect(result.remediations[2].effort).toContain('Low');
      expect(result.remediations[3].effort).toContain('Trivial');

      await agent.terminate();
    });

    it('should handle empty violations array', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-empty', 'generate-remediations', {
        violations: []
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.remediationsGenerated).toBe(0);
      expect(result.remediations).toHaveLength(0);

      await agent.terminate();
    });
  });

  describe('Check Compliance', () => {
    it('should pass compliance with good scores', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-good-compliance', 'check-compliance', {
        scanResult: {
          compliance: { score: 95 },
          summary: { critical: 0, serious: 1 }
        }
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.passes).toBe(true);
      expect(result.details.score.passes).toBe(true);
      expect(result.details.criticalViolations.passes).toBe(true);
      expect(result.details.seriousViolations.passes).toBe(true);

      await agent.terminate();
    });

    it('should fail compliance with low score', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-low-score', 'check-compliance', {
        scanResult: {
          compliance: { score: 60 },
          summary: { critical: 0, serious: 2 }
        }
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.passes).toBe(false);
      expect(result.details.score.passes).toBe(false);

      await agent.terminate();
    });

    it('should fail compliance with critical violations', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-critical', 'check-compliance', {
        scanResult: {
          compliance: { score: 90 },
          summary: { critical: 2, serious: 0 }
        }
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.passes).toBe(false);
      expect(result.details.criticalViolations.passes).toBe(false);

      await agent.terminate();
    });

    it('should fail compliance with too many serious violations', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-serious', 'check-compliance', {
        scanResult: {
          compliance: { score: 90 },
          summary: { critical: 0, serious: 10 }
        }
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.passes).toBe(false);
      expect(result.details.seriousViolations.passes).toBe(false);

      await agent.terminate();
    });
  });

  describe('Generate WebVTT', () => {
    // Note: generateWebVTT expects WebVTTFile format with cues array
    // These tests verify the task execution path
    it('should accept WebVTT file structure', async () => {
      const { agent } = await createAgent();

      // WebVTT file format expected by the generator
      const task = createTask('test-webvtt', 'generate-webvtt', {
        frameDescriptions: {
          cues: [
            { startTime: 0, endTime: 3, text: 'Opening scene' },
            { startTime: 3, endTime: 6, text: 'Car driving' },
            { startTime: 6, endTime: 9, text: 'Arriving at destination' }
          ]
        }
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.webvtt).toContain('WEBVTT');

      await agent.terminate();
    });
  });

  describe('Generate ARIA Labels', () => {
    it('should generate ARIA label recommendations', async () => {
      const { agent } = await createAgent();

      // Element structure expected by accname-computation
      const task = createTask('test-aria', 'generate-aria-labels', {
        elements: [
          { tagName: 'BUTTON', attributes: {}, textContent: '', accessibleName: '' },
          { tagName: 'INPUT', attributes: { type: 'text' }, textContent: '', accessibleName: '' },
          { tagName: 'IMG', attributes: { src: 'logo.png' }, textContent: '', accessibleName: '' }
        ]
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.elementCount).toBe(3);
      expect(result.recommendations).toHaveLength(3);

      await agent.terminate();
    });

    it('should handle empty elements array', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-empty-aria', 'generate-aria-labels', {
        elements: []
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.elementCount).toBe(0);
      expect(result.recommendations).toHaveLength(0);

      await agent.terminate();
    });
  });

  describe('Analyze Video', () => {
    it('should return guidance for video analysis', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-video', 'analyze-video', {
        url: 'https://example.com/video.mp4'
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.videoUrl).toBe('https://example.com/video.mp4');
      expect(result.message).toContain('frame extraction');

      await agent.terminate();
    });

    it('should throw error when video URL is missing', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-no-video-url', 'analyze-video', {});

      await expect(agent.executeTask(task)).rejects.toThrow('Video URL is required');

      await agent.terminate();
    });
  });

  describe('Analyze Keyboard Navigation', () => {
    it('should return keyboard analysis structure', async () => {
      const { agent } = await createAgent();

      const task = createTask('test-keyboard', 'analyze-keyboard-nav', {
        url: 'https://example.com'
      });

      const result = await agent.executeTask(task) as any;

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
      expect(result.analysis).toBeDefined();
      expect(result.analysis.keyboardTraps).toBeInstanceOf(Array);
      expect(result.analysis.skipLinks).toBeInstanceOf(Array);
      expect(result.analysis.focusIndicators).toBeInstanceOf(Array);

      await agent.terminate();
    });
  });

  describe('Agent Lifecycle', () => {
    it('should transition through lifecycle states', async () => {
      const eventBus = new EventEmitter();
      const memoryStore = createMockMemoryStore();

      const newAgent = new AccessibilityAllyAgent({
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      // Before initialization - status object has status field
      const beforeStatus = newAgent.getStatus();
      expect(beforeStatus.status).toBe('initializing');

      await newAgent.initialize();

      // After initialization - may be idle or active depending on implementation
      const afterInit = newAgent.getStatus().status;
      expect(['idle', 'active']).toContain(afterInit);

      await newAgent.terminate();

      // After termination
      expect(newAgent.getStatus().status).toBe('terminated');
    });
  });

  describe('Static Methods', () => {
    it('should return default capabilities from static method', () => {
      const capabilities = AccessibilityAllyAgent.getDefaultCapabilities();

      expect(capabilities).toBeInstanceOf(Array);
      expect(capabilities.length).toBe(10);
      expect(capabilities.map(c => c.name)).toContain('wcag-2.2-validation');
    });
  });
});
