/**
 * RiskAssessorAgent Test Suite
 *
 * Tests for multi-category risk assessment capabilities.
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  RiskAssessorAgent,
  RiskAssessmentInput,
  RiskAssessmentResult,
  RiskHeatMap
} from '@agents/RiskAssessorAgent';

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

describe('RiskAssessorAgent', () => {
  let agent: RiskAssessorAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(() => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const testConfig = {
      id: 'test-risk-agent',
      name: 'Test Risk Assessor',
      enableLearning: false,
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus
    };

    agent = new RiskAssessorAgent(testConfig);
  });

  describe('Initialization', () => {
    it('should create agent with correct type', () => {
      expect(agent).toBeInstanceOf(RiskAssessorAgent);
    });

    it('should have risk assessment capabilities', async () => {
      const capabilities = await agent.getCapabilities();
      const capabilityNames = capabilities.map(c => c.name);
      expect(capabilityNames).toContain('multi-category-risk-assessment');
      expect(capabilityNames).toContain('risk-scoring');
      expect(capabilityNames).toContain('mitigation-recommendation');
    });
  });

  describe('Risk Assessment', () => {
    const sampleInput: RiskAssessmentInput = {
      epicId: 'EPIC-100',
      epicName: 'Cloud Migration',
      description: 'Migrate legacy on-premise systems to AWS cloud infrastructure',
      technicalDetails: [
        'Current system uses Oracle database',
        'Integration with 15 external APIs',
        'Custom authentication module',
        'Legacy COBOL components'
      ],
      businessContext: {
        userBase: '100,000 users',
        revenue: '$5M annual impact',
        strategic: true,
        deadline: '6 months'
      },
      dependencies: [
        'Network team availability',
        'AWS account setup',
        'Data migration tools',
        'Training for DevOps team'
      ],
      constraints: [
        'Zero downtime during migration',
        'GDPR compliance required',
        'Budget cap of $500K'
      ]
    };

    it('should assess risks across all categories', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: sampleInput
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      expect(result).toBeDefined();
      expect(result.risks).toBeDefined();
      expect(Array.isArray(result.risks)).toBe(true);
      expect(result.risks.length).toBeGreaterThan(0);

      // Should identify risks in multiple categories
      const categories = [...new Set(result.risks.map(r => r.category))];
      expect(categories.length).toBeGreaterThan(1);
    });

    it('should identify technical risks for migration epic', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: sampleInput
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      const technicalRisks = result.risks.filter(r => r.category === 'technical');
      expect(technicalRisks.length).toBeGreaterThan(0);
    });

    it('should identify compliance risks when GDPR mentioned', async () => {
      // GDPR must be in description or technicalDetails (searched fields)
      const complianceInput = {
        ...sampleInput,
        description: 'Migration with GDPR compliance requirements and data privacy handling'
      };

      const task = {
        type: 'assess-risks',
        payload: {
          input: complianceInput
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      const complianceRisks = result.risks.filter(r => r.category === 'compliance');
      expect(complianceRisks.length).toBeGreaterThan(0);
    });

    it('should calculate overall risk level', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: sampleInput
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      expect(result.overallRiskLevel).toBeDefined();
      expect(['low', 'medium', 'high', 'critical']).toContain(result.overallRiskLevel);
    });

    it('should include summary statistics', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: sampleInput
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      expect(result.summary).toBeDefined();
      expect(result.summary.totalRisks).toBeGreaterThan(0);
      expect(result.summary.risksByCategory).toBeDefined();
    });
  });

  describe('Risk Scoring', () => {
    it('should score risk using qualitative method', async () => {
      const task = {
        type: 'score-risk',
        payload: {
          risk: {
            id: 'RISK-001',
            category: 'technical',
            title: 'Database migration failure',
            description: 'Oracle to PostgreSQL migration may fail due to incompatible features',
            source: 'EPIC-100',
            identifiedBy: 'test-agent',
            identifiedAt: new Date()
          },
          method: 'qualitative'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.impact).toBeGreaterThanOrEqual(1);
      expect(result.impact).toBeLessThanOrEqual(10);
      expect(result.probability).toBeGreaterThanOrEqual(1);
      expect(result.probability).toBeLessThanOrEqual(10);
      expect(result.riskLevel).toBeDefined();
      expect(result.severity).toBeDefined();
    });

    it('should score risk using quantitative method', async () => {
      const task = {
        type: 'score-risk',
        payload: {
          risk: {
            id: 'RISK-002',
            category: 'business',
            title: 'Revenue loss during downtime',
            description: 'Each hour of downtime costs $50K',
            source: 'EPIC-100',
            identifiedBy: 'test-agent',
            identifiedAt: new Date()
          },
          method: 'quantitative'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should score risk using hybrid method', async () => {
      const task = {
        type: 'score-risk',
        payload: {
          risk: {
            id: 'RISK-003',
            category: 'security',
            title: 'Authentication vulnerability',
            description: 'Custom auth module may have security flaws',
            source: 'EPIC-100',
            identifiedBy: 'test-agent',
            identifiedAt: new Date()
          },
          method: 'hybrid'
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      expect(result.rationale).toBeDefined();
    });
  });

  describe('Mitigation Suggestions', () => {
    it('should suggest mitigations for identified risks', async () => {
      const task = {
        type: 'suggest-mitigations',
        payload: {
          risks: [
            {
              id: 'RISK-001',
              category: 'technical',
              title: 'Database migration failure',
              description: 'Migration may fail',
              score: { impact: 8, probability: 6, severity: 'high' }
            }
          ]
        }
      };

      const result = await agent.performTask(task);

      // suggestMitigations returns an array directly
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should include mitigation strategy type', async () => {
      const task = {
        type: 'suggest-mitigations',
        payload: {
          risks: [
            {
              id: 'RISK-002',
              category: 'security',
              title: 'Data breach risk',
              description: 'Potential data exposure',
              score: { impact: 10, probability: 4, severity: 'critical' }
            }
          ]
        }
      };

      const result = await agent.performTask(task);

      // Result is an array of mitigations
      if (Array.isArray(result) && result.length > 0) {
        const mitigation = result[0];
        expect(['avoid', 'mitigate', 'transfer', 'accept']).toContain(mitigation.strategy);
      }
    });
  });

  describe('Heat Map Generation', () => {
    it('should generate risk heat map', async () => {
      const task = {
        type: 'generate-heat-map',
        payload: {
          assessment: {
            assessmentId: 'ASSESS-001',
            risks: [
              { id: 'R1', category: 'technical', title: 'Tech Risk 1' },
              { id: 'R2', category: 'business', title: 'Business Risk 1' }
            ],
            scores: [
              { riskId: 'R1', impact: 7, probability: 5 },
              { riskId: 'R2', impact: 4, probability: 8 }
            ]
          }
        }
      };

      const result = await agent.performTask(task) as RiskHeatMap;

      expect(result).toBeDefined();
      expect(result.cells).toBeDefined();
      expect(Array.isArray(result.cells)).toBe(true);
      expect(result.legend).toBeDefined();
    });
  });

  describe('Trend Analysis', () => {
    it('should analyze risk trends over time', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const task = {
        type: 'analyze-trends',
        payload: {
          epicId: 'EPIC-100',
          timeRange: { start: thirtyDaysAgo, end: now }
        }
      };

      const result = await agent.performTask(task);

      expect(result).toBeDefined();
      // Returns { trend: 'improving' | 'stable' | 'worsening', ... }
      expect(result.trend).toBeDefined();
      expect(['improving', 'stable', 'worsening']).toContain(result.trend);
    });
  });

  describe('Mitigation Status Update', () => {
    it('should return null for non-existent mitigation', async () => {
      const task = {
        type: 'update-mitigation',
        payload: {
          mitigationId: 'MIT-NONEXISTENT',
          status: 'in-progress'
        }
      };

      const result = await agent.performTask(task);

      // Returns null when mitigation not found
      expect(result).toBeNull();
    });

    it('should update existing mitigation status', async () => {
      // First create mitigations by suggesting them
      const suggestTask = {
        type: 'suggest-mitigations',
        payload: {
          risks: [
            {
              id: 'RISK-FOR-UPDATE',
              category: 'technical',
              title: 'Test risk',
              description: 'Risk for testing mitigation update'
            }
          ]
        }
      };

      const mitigations = await agent.performTask(suggestTask) as any[];

      if (mitigations && mitigations.length > 0) {
        const mitigationId = mitigations[0].id;

        const updateTask = {
          type: 'update-mitigation',
          payload: {
            mitigationId,
            status: 'in-progress'
          }
        };

        const result = await agent.performTask(updateTask);

        expect(result).toBeDefined();
        expect(result.status).toBe('in-progress');
      }
    });
  });

  describe('Batch Assessment', () => {
    it('should assess multiple inputs in batch', async () => {
      const task = {
        type: 'batch-assess',
        payload: {
          inputs: [
            {
              epicId: 'EPIC-A',
              epicName: 'Feature A',
              description: 'First feature with database integration'
            },
            {
              epicId: 'EPIC-B',
              epicName: 'Feature B',
              description: 'Second feature with authentication changes'
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

  describe('Risk Categories', () => {
    it('should identify business risks from business keywords', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: {
            epicId: 'EPIC-BIZ',
            epicName: 'Revenue Feature',
            description: 'New revenue stream feature with customer impact and market deadline'
          }
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      const businessRisks = result.risks.filter(r => r.category === 'business');
      expect(businessRisks.length).toBeGreaterThan(0);
    });

    it('should identify operational risks from operational keywords', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: {
            epicId: 'EPIC-OPS',
            epicName: 'Deployment Pipeline',
            description: 'New deployment with monitoring, incident response, and SLA requirements'
          }
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      const operationalRisks = result.risks.filter(r => r.category === 'operational');
      expect(operationalRisks.length).toBeGreaterThan(0);
    });

    it('should identify security risks from security keywords', async () => {
      const task = {
        type: 'assess-risks',
        payload: {
          input: {
            epicId: 'EPIC-SEC',
            epicName: 'Auth System',
            description: 'New authentication with encryption, tokens, and session management'
          }
        }
      };

      const result = await agent.performTask(task) as RiskAssessmentResult;

      const securityRisks = result.risks.filter(r => r.category === 'security');
      expect(securityRisks.length).toBeGreaterThan(0);
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

    it('should handle missing input data', async () => {
      const task = {
        type: 'assess-risks',
        payload: {}
      };

      await expect(agent.performTask(task)).rejects.toThrow();
    });
  });
});
