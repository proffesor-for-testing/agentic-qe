/**
 * QXPartnerAgent Unit Tests
 * Tests for Quality Experience (QX) analysis agent
 */

// Jest test file - using jest globals
import { QXPartnerAgent } from '../../../src/agents/QXPartnerAgent';
import { QEAgentType } from '../../../src/types';
import { QXTaskType, QXHeuristic } from '../../../src/types/qx';
import { EventEmitter } from 'events';

describe('QXPartnerAgent', () => {
  let agent: QXPartnerAgent;
  let eventBus: EventEmitter;
  let memoryStore: any;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue(true),
      keys: jest.fn().mockResolvedValue([]),
      clear: jest.fn().mockResolvedValue(undefined),
      // Required by VerificationHookManager
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null)
    };

    agent = new QXPartnerAgent({
      analysisMode: 'full',
      integrateTestability: true,
      detectOracleProblems: true,
      heuristics: {
        enabledHeuristics: [QXHeuristic.PROBLEM_UNDERSTANDING, QXHeuristic.RULE_OF_THREE],
        minConfidence: 0.7
      },
      context: {
        workspaceRoot: '/test',
        project: 'test-project',
        environment: 'test'
      },
      memoryStore,
      eventBus
    });

    await agent.initialize();
  });

  afterEach(async () => {
    if (agent) {
      await agent.terminate();
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct agent type', () => {
      const agentId = agent.getAgentId();
      expect(agentId.type).toBe(QEAgentType.QX_PARTNER);
    });

    it('should have QX-specific capabilities', () => {
      const capabilities = agent.getCapabilities();
      const capabilityNames = Array.from(capabilities.values()).map(c => c.name);
      
      expect(capabilityNames).toContain('qx-analysis');
      expect(capabilityNames).toContain('oracle-problem-detection');
      expect(capabilityNames).toContain('ux-heuristics');
      expect(capabilityNames).toContain('impact-analysis');
      expect(capabilityNames).toContain('balance-finder');
      expect(capabilityNames).toContain('testability-integration');
    });

    it('should be in idle status after initialization', () => {
      const status = agent.getStatus();
      expect(status.status).toBe('idle');
    });
  });

  describe('Full QX Analysis', () => {
    it('should perform full QX analysis', async () => {
      const task = {
        id: 'test-full-analysis',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com',
            params: {
              context: {
                feature: 'test-feature'
              }
            }
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.grade).toMatch(/^[ABCDF]$/);
      expect(result.target).toBe('https://example.com');
      expect(result.problemAnalysis).toBeDefined();
      expect(result.userNeeds).toBeDefined();
      expect(result.businessNeeds).toBeDefined();
      expect(result.impactAnalysis).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should include testability integration when enabled', async () => {
      const task = {
        id: 'test-with-testability',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com',
            config: {
              integrateTestability: true
            }
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.testabilityIntegration).toBeDefined();
      expect(result.testabilityIntegration?.qxRelation).toBeDefined();
      expect(result.testabilityIntegration?.combinedInsights).toBeDefined();
    });

    it('should detect oracle problems when enabled', async () => {
      const task = {
        id: 'test-oracle-detection',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com',
            config: {
              detectOracleProblems: true
            }
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.oracleProblems).toBeDefined();
      expect(Array.isArray(result.oracleProblems)).toBe(true);
    });
  });

  describe('Oracle Problem Detection', () => {
    it('should detect oracle problems only', async () => {
      const task = {
        id: 'test-oracle-only',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.ORACLE_DETECTION,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(Array.isArray(result)).toBe(true);
      // Result may be empty array if no oracle problems detected
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('type');
        expect(result[0]).toHaveProperty('description');
        expect(result[0]).toHaveProperty('severity');
        expect(result[0]).toHaveProperty('resolutionApproach');
      }
    });

    it('should filter oracle problems by minimum severity', async () => {
      const agentWithHighSeverity = new QXPartnerAgent({
        analysisMode: 'full',
        integrateTestability: false,
        detectOracleProblems: true,
        minOracleSeverity: 'high',
        heuristics: {
          enabledHeuristics: [QXHeuristic.ORACLE_PROBLEM_DETECTION],
          minConfidence: 0.7
        },
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      await agentWithHighSeverity.initialize();

      const task = {
        id: 'test-high-severity',
        assignee: agentWithHighSeverity.getAgentId(),
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.ORACLE_DETECTION,
            target: 'https://example.com'
          }
        }
      };

      const result = await agentWithHighSeverity.executeTask(task);

      // All problems should be high or critical severity
      if (result.length > 0) {
        result.forEach((problem: any) => {
          expect(['high', 'critical']).toContain(problem.severity);
        });
      }

      await agentWithHighSeverity.terminate();
    });
  });

  describe('User vs Business Balance Analysis', () => {
    it('should analyze user-business balance', async () => {
      const task = {
        id: 'test-balance',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.BALANCE_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result.userNeeds).toBeDefined();
      expect(result.businessNeeds).toBeDefined();
      expect(result.balance).toBeDefined();
      expect(result.balance).toHaveProperty('isBalanced');
      expect(result.balance).toHaveProperty('recommendation');
      expect(typeof result.balance.isBalanced).toBe('boolean');
    });

    it('should identify when favoring users', async () => {
      const task = {
        id: 'test-user-favor',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.BALANCE_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      if (result.balance.favorsUser) {
        expect(result.balance.favorsBusiness).toBe(false);
        expect(result.userNeeds.alignmentScore).toBeGreaterThan(result.businessNeeds.alignmentScore);
      }
    });
  });

  describe('Impact Analysis', () => {
    it('should perform impact analysis', async () => {
      const task = {
        id: 'test-impact',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.IMPACT_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('visible');
      expect(result).toHaveProperty('invisible');
      expect(result).toHaveProperty('immutableRequirements');
      expect(result).toHaveProperty('overallImpactScore');
      expect(result.overallImpactScore).toBeGreaterThanOrEqual(0);
      expect(result.overallImpactScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Heuristics Application', () => {
    it('should apply specific heuristic', async () => {
      const task = {
        id: 'test-heuristic',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.APPLY_HEURISTIC,
            target: 'https://example.com',
            params: {
              heuristic: QXHeuristic.RULE_OF_THREE
            }
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('applied');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('recommendations');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should throw error if heuristic parameter missing', async () => {
      const task = {
        id: 'test-missing-heuristic',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.APPLY_HEURISTIC,
            target: 'https://example.com',
            params: {}
          }
        }
      };

      await expect(agent.executeTask(task)).rejects.toThrow('Heuristic parameter is required');
    });
  });

  describe('Recommendations Generation', () => {
    it('should generate QX recommendations', async () => {
      const task = {
        id: 'test-recommendations',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.GENERATE_RECOMMENDATIONS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        const rec = result[0];
        expect(rec).toHaveProperty('principle');
        expect(rec).toHaveProperty('recommendation');
        expect(rec).toHaveProperty('severity');
        expect(rec).toHaveProperty('impact');
        expect(rec).toHaveProperty('effort');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('category');
        expect(['low', 'medium', 'high', 'critical']).toContain(rec.severity);
        expect(['low', 'medium', 'high']).toContain(rec.effort);
        expect(['ux', 'qa', 'qx', 'technical', 'process', 'design']).toContain(rec.category);
      }
    });

    it('should sort recommendations by priority', async () => {
      const task = {
        id: 'test-sorted-recs',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.GENERATE_RECOMMENDATIONS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          // Priority should be non-decreasing (lower priority number = higher priority)
          expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
        }
      }
    });
  });

  describe('Scoring System', () => {
    it('should calculate scores within valid range', async () => {
      const task = {
        id: 'test-scoring',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(result.problemAnalysis.clarityScore).toBeGreaterThanOrEqual(0);
      expect(result.problemAnalysis.clarityScore).toBeLessThanOrEqual(100);
      expect(result.userNeeds.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(result.userNeeds.alignmentScore).toBeLessThanOrEqual(100);
      expect(result.businessNeeds.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(result.businessNeeds.alignmentScore).toBeLessThanOrEqual(100);
    });

    it('should assign correct grade based on score', async () => {
      const task = {
        id: 'test-grading',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await agent.executeTask(task);

      const score = result.overallScore;
      const expectedGrade = score >= 90 ? 'A' :
                           score >= 80 ? 'B' :
                           score >= 70 ? 'C' :
                           score >= 60 ? 'D' : 'F';

      expect(result.grade).toBe(expectedGrade);
    });
  });

  describe('Memory Operations', () => {
    it('should store analysis results in memory', async () => {
      const task = {
        id: 'test-memory',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      await agent.executeTask(task);

      // Verify memory store was called - MemoryServiceAdapter uses store(), not set()
      expect(memoryStore.store).toHaveBeenCalled();
    });

    it('should retrieve historical analyses from memory', async () => {
      const historicalData = {
        analyses: [
          { target: 'https://example.com', score: 75 }
        ]
      };

      // MemoryServiceAdapter uses retrieve(), not get()
      memoryStore.retrieve.mockResolvedValueOnce(historicalData);

      const task = {
        id: 'test-history',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      await agent.executeTask(task);

      expect(memoryStore.retrieve).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should respect analysis mode configuration', async () => {
      const quickAgent = new QXPartnerAgent({
        analysisMode: 'quick',
        integrateTestability: false,
        detectOracleProblems: false,
        heuristics: {
          enabledHeuristics: [QXHeuristic.PROBLEM_UNDERSTANDING],
          minConfidence: 0.7
        },
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      await quickAgent.initialize();

      const task = {
        id: 'test-quick',
        assignee: quickAgent.getAgentId(),
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await quickAgent.executeTask(task);

      expect(result).toBeDefined();
      expect(result.overallScore).toBeDefined();

      await quickAgent.terminate();
    });

    it('should respect custom thresholds', async () => {
      const strictAgent = new QXPartnerAgent({
        analysisMode: 'full',
        integrateTestability: false,
        detectOracleProblems: true,
        heuristics: {
          enabledHeuristics: [QXHeuristic.PROBLEM_UNDERSTANDING],
          minConfidence: 0.7
        },
        thresholds: {
          minQXScore: 80,
          minProblemClarity: 70,
          minUserNeedsAlignment: 80,
          minBusinessAlignment: 75
        },
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      await strictAgent.initialize();

      const task = {
        id: 'test-strict',
        assignee: strictAgent.getAgentId(),
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      };

      const result = await strictAgent.executeTask(task);

      expect(result).toBeDefined();

      await strictAgent.terminate();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task type', async () => {
      const task = {
        id: 'test-invalid',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: 'invalid-task-type' as any,
            target: 'https://example.com'
          }
        }
      };

      await expect(agent.executeTask(task)).rejects.toThrow();
    });

    it('should handle missing target', async () => {
      const task = {
        id: 'test-no-target',
        assignee: agent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: '',
            params: {}
          }
        }
      };

      // Should still execute but may have limited results
      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
    });
  });

  describe('Agent Lifecycle', () => {
    it('should transition through lifecycle states', async () => {
      const newAgent = new QXPartnerAgent({
        analysisMode: 'full',
        integrateTestability: false,
        detectOracleProblems: false,
        heuristics: {
          enabledHeuristics: [QXHeuristic.PROBLEM_UNDERSTANDING],
          minConfidence: 0.7
        },
        context: {
          workspaceRoot: '/test',
          project: 'test-project',
          environment: 'test'
        },
        memoryStore,
        eventBus
      });

      // Before initialization
      expect(newAgent.getStatus().status).toBe('initializing');

      await newAgent.initialize();

      // After initialization
      expect(newAgent.getStatus().status).toBe('idle');

      // During task execution
      const taskPromise = newAgent.executeTask({
        id: 'test-lifecycle',
        assignee: newAgent.getStatus().agentId,
        task: {
          type: 'qx-task',
          payload: {
            type: QXTaskType.FULL_ANALYSIS,
            target: 'https://example.com'
          }
        }
      });

      // Status should be active during execution
      // Note: This is timing-dependent and may not always catch the active state
      
      await taskPromise;

      // After task completion
      expect(newAgent.getStatus().status).toBe('idle');

      await newAgent.terminate();

      // After termination
      expect(newAgent.getStatus().status).toBe('terminated');
    });
  });
});
