/**
 * Comprehensive test suite for RequirementsValidatorAgent
 * Tests all core capabilities: testability analysis, BDD generation, risk assessment,
 * acceptance criteria validation, traceability mapping, and edge case identification
 */

import { RequirementsValidatorAgent, RequirementsValidatorConfig, Requirement } from '@agents/RequirementsValidatorAgent';
import { EventEmitter } from 'events';
import { QEAgentType, AgentStatus, MemoryStore, QETask, TaskAssignment } from '@types';

// Mock MemoryStore implementation
class MockMemoryStore implements MemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, { value, ttl, timestamp: Date.now() });
  }

  async retrieve(key: string): Promise<any> {
    const item = this.data.get(key);
    return item ? item.value : undefined;
  }

  async set(key: string, value: any, namespace?: string): Promise<void> {
    const fullKey = namespace ? `${namespace}/${key}` : key;
    this.data.set(fullKey, value);
  }

  async get(key: string, namespace?: string): Promise<any> {
    const fullKey = namespace ? `${namespace}/${key}` : key;
    return this.data.get(fullKey);
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = namespace ? `${namespace}/${key}` : key;
    return this.data.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      for (const key of this.data.keys()) {
        if (key.startsWith(namespace)) {
          this.data.delete(key);
        }
      }
    } else {
      this.data.clear();
    }
  }

  // Test helper
  public getData(): Map<string, any> {
    return this.data;
  }
}

describe('RequirementsValidatorAgent', () => {
  let agent: RequirementsValidatorAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  const createTestRequirement = (overrides?: Partial<Requirement>): Requirement => ({
    id: 'REQ-001',
    title: 'User Authentication Feature',
    description: 'The system must authenticate users via email and password with response time under 200ms and success rate above 99%',
    acceptanceCriteria: [
      'User can login with valid email and password',
      'System returns JWT token with 24-hour expiry',
      'Failed attempts are logged'
    ],
    priority: 'high',
    type: 'functional',
    dependencies: ['AUTH-SERVICE', 'USER-DB'],
    ...overrides
  });

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const config: RequirementsValidatorConfig = {
      type: QEAgentType.REQUIREMENTS_VALIDATOR,
      capabilities: [],
      context: {
        id: 'test-context',
        type: 'requirements-validator',
        status: AgentStatus.IDLE
      },
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus,
      thresholds: {
        minTestabilityScore: 8.0,
        maxHighRiskRequirements: 3,
        minBddCoverage: 100
      },
      reportFormat: 'json'
    };

    agent = new RequirementsValidatorAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    if (agent && agent.getStatus().status !== AgentStatus.TERMINATED) {
      await agent.terminate();
    }
    // Clean up event listeners to prevent memory leaks
    mockEventBus.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should initialize successfully with correct capabilities', () => {
      const status = agent.getStatus();

      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.agentId.type).toBe(QEAgentType.REQUIREMENTS_VALIDATOR);
      expect(status.capabilities).toContain('testability-analysis');
      expect(status.capabilities).toContain('bdd-scenario-generation');
      expect(status.capabilities).toContain('risk-assessment');
      expect(status.capabilities).toContain('acceptance-criteria-validation');
      expect(status.capabilities).toContain('traceability-mapping');
      expect(status.capabilities).toContain('edge-case-identification');
      expect(status.capabilities).toContain('completeness-check');
    });

    it('should initialize with default thresholds', async () => {
      const agent2 = new RequirementsValidatorAgent({
        type: QEAgentType.REQUIREMENTS_VALIDATOR,
        capabilities: [],
        context: {
          id: 'test-context-2',
          type: 'requirements-validator',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus
      });

      await agent2.initialize();
      const status = agent2.getStatus();
      expect(status.status).toBe(AgentStatus.ACTIVE);
      await agent2.terminate();
    });

    it('should register event handlers during initialization', (done) => {
      mockEventBus.once('requirements.validated', (event) => {
        expect(event.type).toBe('requirements.validated');
        done();
      });

      mockEventBus.emit('requirements.updated', {
        type: 'requirements.updated',
        data: { requirements: [] }
      });
    });
  });

  describe('Testability Scoring', () => {
    it('should give high score to well-defined requirement', async () => {
      const requirement = createTestRequirement({
        description: 'The API must return user profile data within 200ms at p95 with 99.9% availability for authenticated requests'
      });

      const task: QETask = {
        id: 'task-1',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testabilityScore.overall).toBeGreaterThanOrEqual(7.0);
      expect(result.testabilityScore.measurable).toBe(true);
    });

    it('should identify vague language issues', async () => {
      const requirement = createTestRequirement({
        description: 'The system should be fast and easy to use with good performance',
        acceptanceCriteria: []
      });

      const task: QETask = {
        id: 'task-2',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testabilityScore.overall).toBeLessThan(6.0);
      expect(result.testabilityScore.issues.length).toBeGreaterThan(0);
      expect(result.testabilityScore.issues.some(i => i.includes('Vague') || i.includes('vague'))).toBe(true);
    });

    it('should identify ambiguous modal verbs', async () => {
      const requirement = createTestRequirement({
        description: 'The system should probably handle errors and might log failures if possible'
      });

      const task: QETask = {
        id: 'task-3',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testabilityScore.issues.some(i => i.toLowerCase().includes('ambiguous'))).toBe(true);
      expect(result.testabilityScore.recommendations.length).toBeGreaterThan(0);
    });

    it('should detect missing acceptance criteria', async () => {
      const requirement = createTestRequirement({
        acceptanceCriteria: []
      });

      const task: QETask = {
        id: 'task-4',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testabilityScore.measurable).toBe(false);
      expect(result.testabilityScore.issues.some(i => i.toLowerCase().includes('acceptance'))).toBe(true);
    });

    it('should validate all SMART criteria', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-5',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-5',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testabilityScore).toHaveProperty('specific');
      expect(result.testabilityScore).toHaveProperty('measurable');
      expect(result.testabilityScore).toHaveProperty('achievable');
      expect(result.testabilityScore).toHaveProperty('relevant');
      expect(result.testabilityScore).toHaveProperty('timeBound');
      expect(result.testabilityScore).toHaveProperty('overall');
    });
  });

  describe('BDD Scenario Generation', () => {
    it('should generate BDD scenarios for requirement', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-6',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-6',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.feature).toBeDefined();
      expect(result.scenarios).toBeDefined();
      expect(Array.isArray(result.scenarios)).toBe(true);
      expect(result.scenarios.length).toBeGreaterThan(0);
      expect(result.metadata.requirementId).toBe('REQ-001');
    });

    it('should generate happy path scenario', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-7',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-7',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      const happyPath = result.scenarios.find((s: any) => s.name.toLowerCase().includes('successful'));
      expect(happyPath).toBeDefined();
      expect(happyPath.type).toBe('scenario');
      expect(happyPath.given).toBeDefined();
      expect(happyPath.when).toBeDefined();
      expect(happyPath.then).toBeDefined();
    });

    it('should generate error scenarios', async () => {
      const requirement = createTestRequirement({
        description: 'System validates input data and returns appropriate error messages for invalid inputs'
      });

      const task: QETask = {
        id: 'task-8',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-8',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      const errorScenario = result.scenarios.find((s: any) => s.name.toLowerCase().includes('failed') || s.name.toLowerCase().includes('invalid'));
      expect(errorScenario).toBeDefined();
    });

    it('should generate scenario outlines for validation tests', async () => {
      const requirement = createTestRequirement({
        description: 'System validates user input according to business rules'
      });

      const task: QETask = {
        id: 'task-9',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-9',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      const outline = result.scenarios.find((s: any) => s.type === 'scenario_outline');
      if (outline) {
        expect(outline.examples).toBeDefined();
        expect(outline.examples.headers).toBeDefined();
        expect(outline.examples.rows).toBeDefined();
      }
    });

    it('should include background for authentication requirements', async () => {
      const requirement = createTestRequirement({
        description: 'Authenticated users can access protected resources'
      });

      const task: QETask = {
        id: 'task-10',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-10',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.background).toBeDefined();
      if (result.background) {
        expect(result.background.length).toBeGreaterThan(0);
      }
    });

    it('should emit event when BDD scenarios are generated', (done) => {
      const requirement = createTestRequirement();

      mockEventBus.once('bdd-scenarios.generated', (event) => {
        expect(event.data.requirementId).toBe('REQ-001');
        expect(event.data.scenarioCount).toBeGreaterThan(0);
        done();
      });

      const task: QETask = {
        id: 'task-11',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-11',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      agent.executeTask(assignment);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess technical complexity risk', async () => {
      const requirement = createTestRequirement({
        description: 'Implement distributed microservice with real-time event-driven architecture and machine learning predictions'
      });

      const task: QETask = {
        id: 'task-12',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-12',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.riskScore).toBeGreaterThan(5);
      expect(result.factors.technicalComplexity).toBeGreaterThan(5);
      expect(result.overallRisk).toMatch(/high|critical/);
    });

    it('should assess external dependency risk', async () => {
      const requirement = createTestRequirement({
        description: 'Integrate with third-party payment gateway (Stripe) and external fraud detection API'
      });

      const task: QETask = {
        id: 'task-13',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-13',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.factors.externalDependencies).toBeGreaterThan(3);
      expect(result.mitigation).toContain('Create mock services for testing');
    });

    it('should assess security implications', async () => {
      const requirement = createTestRequirement({
        description: 'Store encrypted user passwords with bcrypt hashing and implement OAuth2 authentication with PII data protection'
      });

      const task: QETask = {
        id: 'task-14',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-14',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.factors.securityImplications).toBeGreaterThan(5);
      expect(result.mitigation.some(m => m.toLowerCase().includes('security'))).toBe(true);
    });

    it('should assess regulatory compliance risk', async () => {
      const requirement = createTestRequirement({
        description: 'Implement GDPR-compliant user data management with right to erasure and HIPAA-compliant patient records'
      });

      const task: QETask = {
        id: 'task-15',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-15',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.factors.regulatoryCompliance).toBeGreaterThan(3);
    });

    it('should calculate testing priority based on risk', async () => {
      const highRiskReq = createTestRequirement({
        description: 'Critical payment processing with real-time fraud detection and PCI compliance'
      });

      const task: QETask = {
        id: 'task-16',
        type: 'assess-risk',
        payload: { requirement: highRiskReq },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-16',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testingPriority).toBeGreaterThan(5);
    });

    it('should provide mitigation strategies', async () => {
      const requirement = createTestRequirement({
        description: 'High-performance distributed system with external API integrations'
      });

      const task: QETask = {
        id: 'task-17',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-17',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.mitigation).toBeDefined();
      expect(Array.isArray(result.mitigation)).toBe(true);
      expect(result.mitigation.length).toBeGreaterThan(0);
    });
  });

  describe('Acceptance Criteria Validation', () => {
    it('should validate well-formed acceptance criteria', async () => {
      const requirement = createTestRequirement({
        acceptanceCriteria: [
          'API response time must be under 200ms at p95',
          'System must handle 1000 concurrent users',
          'Error rate must be below 0.1%'
        ]
      });

      const task: QETask = {
        id: 'task-18',
        type: 'validate-acceptance-criteria',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-18',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(7);
    });

    it('should flag missing acceptance criteria', async () => {
      const requirement = createTestRequirement({
        acceptanceCriteria: []
      });

      const task: QETask = {
        id: 'task-19',
        type: 'validate-acceptance-criteria',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-19',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toContain('No acceptance criteria defined');
    });

    it('should identify ambiguous acceptance criteria', async () => {
      const requirement = createTestRequirement({
        acceptanceCriteria: [
          'System should work quickly',
          'Users might be able to login',
          'Performance could be good'
        ]
      });

      const task: QETask = {
        id: 'task-20',
        type: 'validate-acceptance-criteria',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-20',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.enhanced.some(e => e.includes('must'))).toBe(true);
    });

    it('should enhance vague acceptance criteria', async () => {
      const requirement = createTestRequirement({
        acceptanceCriteria: [
          'Fast response',
          'Secure access'
        ]
      });

      const task: QETask = {
        id: 'task-21',
        type: 'validate-acceptance-criteria',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-21',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.enhanced.length).toBe(requirement.acceptanceCriteria!.length);
    });
  });

  describe('Traceability Mapping', () => {
    it('should create traceability map', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-22',
        type: 'create-traceability',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-22',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.requirementId).toBe('REQ-001');
      expect(result.acceptanceCriteria).toEqual(requirement.acceptanceCriteria);
      expect(result.bddScenarios).toBeDefined();
      expect(result.testCases).toBeDefined();
      expect(result.codeModules).toBeDefined();
    });

    it('should extract business requirement from metadata', async () => {
      const requirement = createTestRequirement({
        metadata: {
          businessRequirement: 'BR-100'
        }
      });

      const task: QETask = {
        id: 'task-23',
        type: 'create-traceability',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-23',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.businessRequirement).toBe('BR-100');
    });

    it('should link to generated BDD scenarios', async () => {
      const requirement = createTestRequirement();

      // First generate BDD scenarios
      const bddTask: QETask = {
        id: 'task-24a',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const bddAssignment: TaskAssignment = {
        id: 'assignment-24a',
        task: bddTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(bddAssignment);

      // Then create traceability
      const task: QETask = {
        id: 'task-24',
        type: 'create-traceability',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-24',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.bddScenarios.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Case Identification', () => {
    it('should identify boundary value edge cases', async () => {
      const requirement = createTestRequirement({
        description: 'System processes orders with quantity limits between 1 and 1000'
      });

      const task: QETask = {
        id: 'task-25',
        type: 'identify-edge-cases',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-25',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((ec: string) => ec.toLowerCase().includes('boundary'))).toBe(true);
    });

    it('should identify null/empty edge cases', async () => {
      const requirement = createTestRequirement({
        description: 'System validates user input data before processing'
      });

      const task: QETask = {
        id: 'task-26',
        type: 'identify-edge-cases',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-26',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.some((ec: string) => ec.toLowerCase().includes('null') || ec.toLowerCase().includes('empty'))).toBe(true);
    });

    it('should identify security edge cases', async () => {
      const requirement = createTestRequirement({
        description: 'System accepts user text input and stores in database'
      });

      const task: QETask = {
        id: 'task-27',
        type: 'identify-edge-cases',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-27',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.some((ec: string) => ec.toLowerCase().includes('injection') || ec.toLowerCase().includes('xss'))).toBe(true);
    });

    it('should identify concurrent operation edge cases', async () => {
      const requirement = createTestRequirement({
        description: 'System handles concurrent user requests and parallel processing'
      });

      const task: QETask = {
        id: 'task-28',
        type: 'identify-edge-cases',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-28',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.some((ec: string) => ec.toLowerCase().includes('race') || ec.toLowerCase().includes('concurrent'))).toBe(true);
    });

    it('should identify network error edge cases', async () => {
      const requirement = createTestRequirement({
        description: 'System calls external API service to fetch data'
      });

      const task: QETask = {
        id: 'task-29',
        type: 'identify-edge-cases',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-29',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.some((ec: string) => ec.toLowerCase().includes('timeout') || ec.toLowerCase().includes('network'))).toBe(true);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple requirements', async () => {
      const requirements = [
        createTestRequirement({ id: 'REQ-001' }),
        createTestRequirement({ id: 'REQ-002' }),
        createTestRequirement({ id: 'REQ-003' })
      ];

      const task: QETask = {
        id: 'task-30',
        type: 'batch-validate',
        payload: { requirements },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-30',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.validated).toBe(3);
      expect(result.reports.length).toBe(3);
      expect(result.summary).toBeDefined();
      expect(result.summary.averageTestabilityScore).toBeGreaterThan(0);
    });

    it('should track pass/fail counts in batch validation', async () => {
      const requirements = [
        createTestRequirement({ id: 'REQ-001', description: 'Well-defined requirement with metrics: 200ms response time' }),
        createTestRequirement({ id: 'REQ-002', description: 'Vague requirement that should be fast and easy' })
      ];

      const task: QETask = {
        id: 'task-31',
        type: 'batch-validate',
        payload: { requirements },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-31',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.passed + result.failed).toBe(result.validated);
    });
  });

  describe('Report Generation', () => {
    it('should generate JSON format report', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-32',
        type: 'generate-report',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-32',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(typeof result).toBe('string');
      const parsed = JSON.parse(result);
      expect(parsed.requirementId).toBe('REQ-001');
    });

    it('should generate markdown format report', async () => {
      const config: RequirementsValidatorConfig = {
        type: QEAgentType.REQUIREMENTS_VALIDATOR,
        capabilities: [],
        context: {
          id: 'test-context-md',
          type: 'requirements-validator',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus,
        reportFormat: 'markdown'
      };

      const mdAgent = new RequirementsValidatorAgent(config);
      await mdAgent.initialize();

      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-33',
        type: 'generate-report',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-33',
        task,
        agentId: mdAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await mdAgent.executeTask(assignment);

      expect(typeof result).toBe('string');
      expect(result).toContain('# Requirement Validation Report');
      expect(result).toContain('### Testability Score:');

      await mdAgent.terminate();
    });

    it('should generate HTML format report', async () => {
      const config: RequirementsValidatorConfig = {
        type: QEAgentType.REQUIREMENTS_VALIDATOR,
        capabilities: [],
        context: {
          id: 'test-context-html',
          type: 'requirements-validator',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus,
        reportFormat: 'html'
      };

      const htmlAgent = new RequirementsValidatorAgent(config);
      await htmlAgent.initialize();

      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-34',
        type: 'generate-report',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-34',
        task,
        agentId: htmlAgent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await htmlAgent.executeTask(assignment);

      expect(typeof result).toBe('string');
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Requirement Validation Report');

      await htmlAgent.terminate();
    });
  });

  describe('Memory Coordination', () => {
    it('should store validation results in memory', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-35',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-35',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve(`aqe/requirements/validated/${requirement.id}`);
      expect(stored).toBeDefined();
      expect(stored.requirementId).toBe('REQ-001');
    });

    it('should store BDD scenarios in memory', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-36',
        type: 'generate-bdd',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-36',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve(`aqe/bdd-scenarios/generated/${requirement.id}`);
      expect(stored).toBeDefined();
      expect(stored.scenarios).toBeDefined();
    });

    it('should store risk assessments in memory', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-37',
        type: 'assess-risk',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-37',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve(`aqe/risk-scores/requirements/${requirement.id}`);
      expect(stored).toBeDefined();
      expect(stored.riskScore).toBeDefined();
    });

    it('should store traceability maps in memory', async () => {
      const requirement = createTestRequirement();

      const task: QETask = {
        id: 'task-38',
        type: 'create-traceability',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-38',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve(`aqe/traceability/matrix/${requirement.id}`);
      expect(stored).toBeDefined();
      expect(stored.requirementId).toBe('REQ-001');
    });
  });

  describe('Event Broadcasting', () => {
    it('should emit validation complete event', (done) => {
      const requirement = createTestRequirement();

      mockEventBus.once('requirements.validated', (event) => {
        expect(event.data.requirementId).toBe('REQ-001');
        expect(event.data.testabilityScore).toBeDefined();
        expect(event.data.riskLevel).toBeDefined();
        done();
      });

      const task: QETask = {
        id: 'task-39',
        type: 'validate-requirement',
        payload: { requirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-39',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      agent.executeTask(assignment);
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported task type', async () => {
      const task: QETask = {
        id: 'task-40',
        type: 'unsupported-task',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-40',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Unsupported task type');
    });

    it('should handle invalid requirement data gracefully', async () => {
      const invalidRequirement = {
        id: 'REQ-INVALID'
        // Missing required fields
      } as any;

      const task: QETask = {
        id: 'task-41',
        type: 'validate-requirement',
        payload: { requirement: invalidRequirement },
        priority: 1,
        status: 'pending'
      };

      const assignment: TaskAssignment = {
        id: 'assignment-41',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      // Should not throw, but should handle gracefully
      const result = await agent.executeTask(assignment);
      expect(result).toBeDefined();
    });
  });

  describe('Lifecycle Management', () => {
    it('should clean up resources on termination', async () => {
      const localAgent = new RequirementsValidatorAgent({
        type: QEAgentType.REQUIREMENTS_VALIDATOR,
        capabilities: [],
        context: {
          id: 'test-cleanup',
          type: 'requirements-validator',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus
      });

      await localAgent.initialize();
      expect(localAgent.getStatus().status).toBe(AgentStatus.ACTIVE);

      await localAgent.terminate();
      expect(localAgent.getStatus().status).toBe(AgentStatus.TERMINATED);
    });
  });
});