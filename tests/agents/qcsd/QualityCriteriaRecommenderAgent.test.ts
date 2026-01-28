/**
 * QualityCriteriaRecommenderAgent Test Suite
 *
 * Tests for HTSM v6.3 quality criteria recommendation capabilities.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { QualityCriteriaRecommenderAgent, HTSMAssessment, ProductFactorsInput } from '@agents/QualityCriteriaRecommenderAgent';

// Mock MemoryStore implementation for tests
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  createAgentLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

describe('QualityCriteriaRecommenderAgent', () => {
  let agent: QualityCriteriaRecommenderAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const testConfig = {
      id: 'test-qcr-agent',
      name: 'Test Quality Criteria Recommender',
      enableLearning: false,
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus
    };

    agent = new QualityCriteriaRecommenderAgent(testConfig);
    await agent.initialize();
  });

  describe('Initialization', () => {
    it('should create agent with correct type', () => {
      expect(agent).toBeInstanceOf(QualityCriteriaRecommenderAgent);
    });

    it('should have HTSM capabilities', async () => {
      const capabilities = await agent.getCapabilities();
      const capabilityNames = capabilities.map(c => c.name);
      expect(capabilityNames).toContain('htsm-assessment');
      expect(capabilityNames).toContain('quality-criteria-generation');
      expect(capabilityNames).toContain('risk-based-prioritization');
    });
  });

  describe('HTSM Assessment', () => {
    const sampleProductFactors: ProductFactorsInput = {
      epicId: 'EPIC-123',
      epicName: 'User Authentication System',
      description: 'Implement secure user authentication with OAuth2 and MFA support',
      userStories: [
        'As a user, I want to log in with my email and password',
        'As a user, I want to use multi-factor authentication for extra security',
        'As an admin, I want to manage user sessions and force logout'
      ],
      acceptanceCriteria: [
        'Users can authenticate with email/password',
        'MFA supports TOTP and SMS',
        'Sessions expire after 30 minutes of inactivity',
        'Failed login attempts are rate-limited'
      ],
      technicalConstraints: [
        'Must integrate with existing LDAP',
        'Response time under 200ms',
        'Support 10,000 concurrent users'
      ],
      businessContext: {
        userBase: '50,000 active users',
        marketPosition: 'Enterprise B2B',
        timeline: 'Q2 2025',
        budget: 'Medium'
      }
    };

    it('should assess all 10 HTSM categories', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {
          productFactors: sampleProductFactors
        }
      };

      const result = await agent.performTask(task) as HTSMAssessment;

      expect(result).toBeDefined();
      expect(result.categories).toBeDefined();
      // Verify all 10 HTSM categories are assessed
      expect(result.categories.capability).toBeDefined();
      expect(result.categories.reliability).toBeDefined();
      expect(result.categories.usability).toBeDefined();
      expect(result.categories.charisma).toBeDefined();
      expect(result.categories.security).toBeDefined();
      expect(result.categories.scalability).toBeDefined();
      expect(result.categories.compatibility).toBeDefined();
      expect(result.categories.performance).toBeDefined();
      expect(result.categories.installability).toBeDefined();
      expect(result.categories.development).toBeDefined();
    });

    it('should prioritize security for authentication epics', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {
          productFactors: sampleProductFactors
        }
      };

      const result = await agent.performTask(task) as HTSMAssessment;

      // Security should have meaningful relevance for auth system (>= 5 is significant)
      expect(result.categories.security.relevance).toBeGreaterThanOrEqual(5);
      expect(['medium', 'high', 'critical']).toContain(result.categories.security.riskLevel);
    });

    it('should generate prioritized criteria list', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {
          productFactors: sampleProductFactors
        }
      };

      const result = await agent.performTask(task) as HTSMAssessment;

      expect(result.prioritizedCriteria).toBeDefined();
      expect(Array.isArray(result.prioritizedCriteria)).toBe(true);
      expect(result.prioritizedCriteria.length).toBeGreaterThan(0);

      // First criteria should be critical or high priority
      const firstCriteria = result.prioritizedCriteria[0];
      expect(['critical', 'high']).toContain(firstCriteria.priority);
    });

    it('should calculate overall risk score', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {
          productFactors: sampleProductFactors
        }
      };

      const result = await agent.performTask(task) as HTSMAssessment;

      expect(result.overallRiskScore).toBeDefined();
      expect(result.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(100);
    });

    it('should include recommendations array', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {
          productFactors: sampleProductFactors
        }
      };

      const result = await agent.performTask(task) as HTSMAssessment;

      // Recommendations array exists (may be empty for low-risk assessments)
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('Quality Criteria Generation', () => {
    it('should generate quality criteria for specified categories', async () => {
      const task = {
        type: 'generate-quality-criteria',
        payload: {
          productFactors: {
            epicId: 'EPIC-456',
            epicName: 'Payment Processing',
            description: 'Handle credit card payments securely'
          },
          categories: ['security', 'reliability', 'performance']
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.criteria).toBeDefined();
      expect(Array.isArray(result.criteria)).toBe(true);
    });
  });

  describe('Criteria Prioritization', () => {
    it('should prioritize by risk', async () => {
      const task = {
        type: 'prioritize-criteria',
        payload: {
          criteria: [
            {
              id: 'QC-1',
              category: 'security',
              description: 'Input validation',
              priority: 'medium',
              rationale: 'Prevent injection attacks',
              testingApproach: ['security-scan'],
              acceptanceCriteria: ['All inputs validated'],
              riskIfNeglected: 'SQL injection vulnerability',
              effortEstimate: 'medium'
            },
            {
              id: 'QC-2',
              category: 'performance',
              description: 'Response time',
              priority: 'low',
              rationale: 'User experience',
              testingApproach: ['load-test'],
              acceptanceCriteria: ['P95 < 500ms'],
              riskIfNeglected: 'Slow user experience',
              effortEstimate: 'high'
            }
          ],
          method: 'risk-based'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.prioritizedCriteria).toBeDefined();
    });

    it('should prioritize by value', async () => {
      const task = {
        type: 'prioritize-criteria',
        payload: {
          criteria: [],
          method: 'value-based'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
    });

    it('should prioritize by MoSCoW method', async () => {
      const task = {
        type: 'prioritize-criteria',
        payload: {
          criteria: [],
          method: 'moscow'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
    });
  });

  describe('Test Strategy Generation', () => {
    it('should generate test strategy based on quality criteria', async () => {
      const task = {
        type: 'generate-test-strategy',
        payload: {
          criteria: [
            {
              id: 'QC-1',
              category: 'security',
              description: 'Authentication security',
              priority: 'critical',
              rationale: 'Protect user data',
              testingApproach: ['penetration-testing', 'security-review'],
              acceptanceCriteria: ['No OWASP Top 10 vulnerabilities'],
              riskIfNeglected: 'Data breach',
              effortEstimate: 'high'
            }
          ]
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.testTypes).toBeDefined();
    });
  });

  describe('Stakeholder View Generation', () => {
    it('should generate business stakeholder view', async () => {
      const task = {
        type: 'generate-stakeholder-view',
        payload: {
          assessment: {
            productFactors: {
              epicId: 'EPIC-789',
              epicName: 'Feature X',
              description: 'New feature'
            },
            prioritizedCriteria: [],
            overallRiskScore: 45
          },
          stakeholderType: 'business'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.view).toBeDefined();
      expect(result.stakeholderType).toBe('business');
    });

    it('should generate technical stakeholder view', async () => {
      const task = {
        type: 'generate-stakeholder-view',
        payload: {
          assessment: {},
          stakeholderType: 'technical'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.stakeholderType).toBe('technical');
    });
  });

  describe('Batch Assessment', () => {
    it('should assess multiple epics in batch', async () => {
      const task = {
        type: 'batch-assess',
        payload: {
          epics: [
            {
              epicId: 'EPIC-A',
              epicName: 'Feature A',
              description: 'First feature'
            },
            {
              epicId: 'EPIC-B',
              epicName: 'Feature B',
              description: 'Second feature'
            }
          ]
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.assessments).toBeDefined();
      expect(Array.isArray(result.assessments)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown task type gracefully', async () => {
      const task = {
        type: 'unknown-task',
        payload: {}
      };

      await expect(agent.performTask(task)).rejects.toThrow();
    });

    it('should handle missing product factors', async () => {
      const task = {
        type: 'assess-htsm',
        payload: {}
      };

      await expect(agent.performTask(task)).rejects.toThrow();
    });
  });
});
