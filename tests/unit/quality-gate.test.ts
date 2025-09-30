import { jest } from '@jest/globals';
import { QualityGate, QualityGatePhase, GateDecision, GateDecisionTree } from '../../src/core/quality-gate';
import { QualityMetricsCollector } from '../../src/metrics/quality-metrics-collector';
import { DecisionEngine } from '../../src/ai/decision-engine';
import { PolicyEngine } from '../../src/governance/policy-engine';
import { RiskAssessment } from '../../src/analysis/risk-assessment';

// London School TDD: Mock all decision-making collaborators
const mockQualityMetrics = {
  collectMetrics: jest.fn(),
  calculateQualityScore: jest.fn(),
  getTrendAnalysis: jest.fn(),
  validateThresholds: jest.fn()
} as jest.Mocked<QualityMetricsCollector>;

const mockDecisionEngine = {
  makeDecision: jest.fn(),
  evaluateConditions: jest.fn(),
  buildDecisionTree: jest.fn(),
  explainDecision: jest.fn()
} as jest.Mocked<DecisionEngine>;

const mockPolicyEngine = {
  evaluatePolicy: jest.fn(),
  getApplicablePolicies: jest.fn(),
  validateCompliance: jest.fn(),
  generateExceptions: jest.fn()
} as jest.Mocked<PolicyEngine>;

const mockRiskAssessment = {
  assessRisk: jest.fn(),
  calculateRiskScore: jest.fn(),
  identifyRiskFactors: jest.fn(),
  recommendMitigation: jest.fn()
} as jest.Mocked<RiskAssessment>;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockMetrics = {
  recordMetric: jest.fn(),
  recordDecision: jest.fn(),
  incrementCounter: jest.fn()
};

const mockNotificationService = {
  sendNotification: jest.fn(),
  notifyStakeholders: jest.fn(),
  createAlert: jest.fn()
};

describe('QualityGate - London School TDD with Decision Tree Logic', () => {
  let qualityGate: QualityGate;
  
  beforeEach(() => {
    jest.clearAllMocks();
    qualityGate = new QualityGate({
      qualityMetrics: mockQualityMetrics,
      decisionEngine: mockDecisionEngine,
      policyEngine: mockPolicyEngine,
      riskAssessment: mockRiskAssessment,
      logger: mockLogger,
      metrics: mockMetrics,
      notificationService: mockNotificationService
    });
  });

  describe('Unit Testing Quality Gate', () => {
    const unitTestMetrics = {
      coverage: {
        line: 85.5,
        branch: 78.2,
        function: 92.0
      },
      testCount: 147,
      passingTests: 145,
      failingTests: 2,
      testDuration: 12500,
      codeQuality: {
        complexity: 3.2,
        maintainability: 87.5,
        duplications: 2.1
      }
    };

    const unitGatePolicy = {
      phase: QualityGatePhase.UNIT,
      requirements: {
        minLineCoverage: 80,
        minBranchCoverage: 75,
        maxFailingTests: 0,
        maxComplexity: 5.0,
        minMaintainability: 85
      },
      exceptions: {
        allowCoverageException: false,
        allowFailedTestException: true,
        maxExceptions: 1
      }
    };

    beforeEach(() => {
      mockQualityMetrics.collectMetrics.mockResolvedValue(unitTestMetrics);
      mockPolicyEngine.getApplicablePolicies.mockReturnValue([unitGatePolicy]);
    });

    it('should pass unit quality gate with all criteria met', async () => {
      // Mock passing decision tree evaluation
      mockDecisionEngine.evaluateConditions.mockReturnValue({
        coverageCheck: { passed: true, value: 85.5, threshold: 80 },
        testFailureCheck: { passed: false, value: 2, threshold: 0 },
        complexityCheck: { passed: true, value: 3.2, threshold: 5.0 },
        maintainabilityCheck: { passed: true, value: 87.5, threshold: 85 }
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.PASS_WITH_WARNING,
        confidence: 0.87,
        reasons: ['2 failing tests detected but within exception policy'],
        recommendations: ['Fix failing tests before next release']
      });

      const gateEvaluation = {
        phase: QualityGatePhase.UNIT,
        target: 'user-service-unit-tests',
        context: { buildId: 'build-123', branch: 'feature/auth' }
      };

      const result = await qualityGate.evaluate(gateEvaluation);

      // Verify quality metrics collection
      expect(mockQualityMetrics.collectMetrics).toHaveBeenCalledWith(
        'user-service-unit-tests',
        expect.objectContaining({ phase: QualityGatePhase.UNIT })
      );

      // Verify policy evaluation
      expect(mockPolicyEngine.getApplicablePolicies).toHaveBeenCalledWith(
        QualityGatePhase.UNIT,
        expect.objectContaining({ target: 'user-service-unit-tests' })
      );

      // Verify decision tree evaluation
      expect(mockDecisionEngine.evaluateConditions).toHaveBeenCalledWith(
        unitTestMetrics,
        unitGatePolicy.requirements
      );

      // Verify final decision
      expect(mockDecisionEngine.makeDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluations: expect.any(Object),
          policy: unitGatePolicy,
          context: gateEvaluation.context
        })
      );

      expect(result).toEqual({
        decision: GateDecision.PASS_WITH_WARNING,
        phase: QualityGatePhase.UNIT,
        confidence: 0.87,
        details: {
          metricsEvaluated: unitTestMetrics,
          policiesApplied: [unitGatePolicy],
          decisionReasons: ['2 failing tests detected but within exception policy'],
          recommendations: ['Fix failing tests before next release']
        },
        timestamp: expect.any(String)
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Unit quality gate passed with warning for user-service-unit-tests'
      );
    });

    it('should fail unit quality gate with insufficient coverage', async () => {
      const lowCoverageMetrics = {
        ...unitTestMetrics,
        coverage: { line: 65.0, branch: 55.0, function: 70.0 }
      };
      
      mockQualityMetrics.collectMetrics.mockResolvedValue(lowCoverageMetrics);
      
      mockDecisionEngine.evaluateConditions.mockReturnValue({
        coverageCheck: { passed: false, value: 65.0, threshold: 80 },
        testFailureCheck: { passed: false, value: 2, threshold: 0 }
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.FAIL,
        confidence: 0.95,
        reasons: [
          'Line coverage 65% below minimum 80%',
          'Branch coverage 55% below minimum 75%',
          '2 failing tests exceed maximum 0'
        ],
        blockingIssues: ['coverage', 'failing-tests']
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.UNIT,
        target: 'low-coverage-service'
      });

      expect(result.decision).toBe(GateDecision.FAIL);
      expect(result.details.blockingIssues).toEqual(['coverage', 'failing-tests']);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unit quality gate failed for low-coverage-service: coverage, failing-tests'
      );
      
      expect(mockNotificationService.sendNotification).toHaveBeenCalledWith({
        type: 'quality-gate-failure',
        phase: QualityGatePhase.UNIT,
        target: 'low-coverage-service',
        issues: ['coverage', 'failing-tests']
      });
    });

    it('should handle policy exceptions with approval workflow', async () => {
      mockPolicyEngine.generateExceptions.mockReturnValue({
        allowedException: true,
        exceptionType: 'coverage-temporary',
        approver: 'tech-lead',
        expirationDate: '2024-12-31',
        justification: 'Legacy code refactoring in progress'
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.PASS_WITH_EXCEPTION,
        confidence: 0.75,
        reasons: ['Coverage exception approved by tech-lead'],
        exceptionDetails: expect.any(Object)
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.UNIT,
        target: 'legacy-service',
        requestException: true,
        exceptionJustification: 'Legacy code refactoring in progress'
      });

      // Verify exception generation
      expect(mockPolicyEngine.generateExceptions).toHaveBeenCalledWith(
        expect.objectContaining({
          justification: 'Legacy code refactoring in progress'
        })
      );

      expect(result.decision).toBe(GateDecision.PASS_WITH_EXCEPTION);
      expect(result.details.exceptionDetails).toBeDefined();
      
      expect(mockMetrics.recordDecision).toHaveBeenCalledWith(
        'quality-gate.exception-granted',
        expect.objectContaining({ phase: QualityGatePhase.UNIT })
      );
    });
  });

  describe('Integration Testing Quality Gate', () => {
    const integrationMetrics = {
      apiTests: {
        total: 45,
        passing: 43,
        failing: 2,
        averageResponseTime: 850
      },
      databaseTests: {
        total: 28,
        passing: 28,
        failing: 0,
        connectionPoolHealth: 95
      },
      serviceIntegration: {
        successRate: 96.5,
        errorRate: 3.5,
        circuitBreakerStatus: 'closed'
      },
      performanceMetrics: {
        throughput: 1250,
        latencyP95: 1200,
        memoryUsage: 78.5
      }
    };

    const integrationPolicy = {
      phase: QualityGatePhase.INTEGRATION,
      requirements: {
        minSuccessRate: 95.0,
        maxErrorRate: 5.0,
        maxLatencyP95: 1500,
        maxFailedTests: 3
      }
    };

    beforeEach(() => {
      mockQualityMetrics.collectMetrics.mockResolvedValue(integrationMetrics);
      mockPolicyEngine.getApplicablePolicies.mockReturnValue([integrationPolicy]);
    });

    it('should evaluate complex integration quality conditions', async () => {
      mockDecisionEngine.buildDecisionTree.mockReturnValue({
        root: {
          condition: 'service_integration_check',
          branches: {
            pass: {
              condition: 'performance_check',
              branches: {
                pass: { decision: GateDecision.PASS },
                fail: { decision: GateDecision.PASS_WITH_WARNING }
              }
            },
            fail: {
              condition: 'error_rate_check',
              branches: {
                pass: { decision: GateDecision.PASS_WITH_WARNING },
                fail: { decision: GateDecision.FAIL }
              }
            }
          }
        }
      });
      
      mockDecisionEngine.evaluateConditions.mockReturnValue({
        service_integration_check: { passed: true, value: 96.5, threshold: 95.0 },
        performance_check: { passed: true, value: 1200, threshold: 1500 },
        error_rate_check: { passed: true, value: 3.5, threshold: 5.0 }
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.PASS,
        confidence: 0.92,
        decisionPath: ['service_integration_check:pass', 'performance_check:pass'],
        reasons: ['All integration criteria met']
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.INTEGRATION,
        target: 'microservices-integration'
      });

      // Verify decision tree construction and evaluation
      expect(mockDecisionEngine.buildDecisionTree).toHaveBeenCalledWith(
        integrationPolicy.requirements,
        expect.objectContaining({ phase: QualityGatePhase.INTEGRATION })
      );
      
      expect(mockDecisionEngine.evaluateConditions).toHaveBeenCalledWith(
        integrationMetrics,
        integrationPolicy.requirements
      );

      expect(result.decision).toBe(GateDecision.PASS);
      expect(result.details.decisionPath).toEqual([
        'service_integration_check:pass',
        'performance_check:pass'
      ]);
    });

    it('should trigger risk assessment for borderline metrics', async () => {
      const borderlineMetrics = {
        ...integrationMetrics,
        serviceIntegration: { successRate: 95.1, errorRate: 4.9 }
      };
      
      mockQualityMetrics.collectMetrics.mockResolvedValue(borderlineMetrics);
      
      mockRiskAssessment.assessRisk.mockResolvedValue({
        riskScore: 0.65,
        riskLevel: 'medium',
        riskFactors: ['Success rate near threshold', 'Error rate trending up'],
        mitigationRecommendations: ['Increase monitoring', 'Review error patterns']
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.PASS_WITH_WARNING,
        confidence: 0.68,
        reasons: ['Metrics near thresholds, medium risk identified']
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.INTEGRATION,
        target: 'borderline-service',
        enableRiskAssessment: true
      });

      // Verify risk assessment coordination
      expect(mockRiskAssessment.assessRisk).toHaveBeenCalledWith(
        borderlineMetrics,
        expect.objectContaining({
          phase: QualityGatePhase.INTEGRATION,
          thresholds: integrationPolicy.requirements
        })
      );

      expect(result.details.riskAssessment).toEqual({
        riskScore: 0.65,
        riskLevel: 'medium',
        riskFactors: ['Success rate near threshold', 'Error rate trending up'],
        mitigationRecommendations: ['Increase monitoring', 'Review error patterns']
      });
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Medium risk identified for borderline-service integration gate'
      );
    });
  });

  describe('End-to-End Quality Gate', () => {
    const e2eMetrics = {
      userJourneys: {
        total: 15,
        passing: 13,
        failing: 2,
        averageJourneyTime: 45000
      },
      performanceTests: {
        loadTestsPassing: true,
        peakThroughput: 5000,
        responseTimeP99: 2800,
        errorRateUnderLoad: 0.5
      },
      securityTests: {
        vulnerabilitiesFound: 0,
        securityScore: 95.0,
        complianceChecks: { passed: 12, failed: 0 }
      },
      accessibilityTests: {
        wcagCompliance: 98.5,
        accessibilityIssues: 2,
        severityBreakdown: { critical: 0, major: 1, minor: 1 }
      }
    };

    const e2ePolicy = {
      phase: QualityGatePhase.E2E,
      requirements: {
        minUserJourneySuccess: 90,
        maxFailedJourneys: 3,
        maxResponseTimeP99: 3000,
        minSecurityScore: 90,
        minWcagCompliance: 95,
        maxCriticalAccessibilityIssues: 0
      },
      blocking: {
        securityVulnerabilities: true,
        criticalAccessibilityIssues: true,
        majorPerformanceDegradation: true
      }
    };

    beforeEach(() => {
      mockQualityMetrics.collectMetrics.mockResolvedValue(e2eMetrics);
      mockPolicyEngine.getApplicablePolicies.mockReturnValue([e2ePolicy]);
    });

    it('should perform comprehensive E2E quality evaluation', async () => {
      mockDecisionEngine.evaluateConditions.mockReturnValue({
        userJourneyCheck: { passed: true, value: 86.7, threshold: 90 }, // 13/15 = 86.7%
        performanceCheck: { passed: true, value: 2800, threshold: 3000 },
        securityCheck: { passed: true, value: 95.0, threshold: 90 },
        accessibilityCheck: { passed: true, value: 98.5, threshold: 95 }
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.PASS_WITH_WARNING,
        confidence: 0.83,
        reasons: [
          'User journey success rate 86.7% below target 90%',
          'All other criteria met'
        ],
        recommendations: [
          'Investigate failing user journeys',
          'Consider improving journey reliability'
        ]
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.E2E,
        target: 'complete-application',
        includeAllDimensions: true
      });

      // Verify comprehensive evaluation
      expect(mockQualityMetrics.collectMetrics).toHaveBeenCalledWith(
        'complete-application',
        expect.objectContaining({
          phase: QualityGatePhase.E2E,
          dimensions: ['performance', 'security', 'accessibility', 'functional']
        })
      );

      expect(result.decision).toBe(GateDecision.PASS_WITH_WARNING);
      expect(result.details.evaluations).toHaveProperty('userJourneyCheck');
      expect(result.details.evaluations).toHaveProperty('securityCheck');
      expect(result.details.evaluations).toHaveProperty('accessibilityCheck');
      
      expect(mockMetrics.recordDecision).toHaveBeenCalledWith(
        'quality-gate.e2e.completed',
        expect.objectContaining({
          decision: GateDecision.PASS_WITH_WARNING,
          dimensions: 4
        })
      );
    });

    it('should block deployment for critical security vulnerabilities', async () => {
      const unsecureMetrics = {
        ...e2eMetrics,
        securityTests: {
          vulnerabilitiesFound: 3,
          securityScore: 65.0,
          criticalVulnerabilities: ['SQL injection', 'XSS vulnerability']
        }
      };
      
      mockQualityMetrics.collectMetrics.mockResolvedValue(unsecureMetrics);
      
      mockDecisionEngine.evaluateConditions.mockReturnValue({
        securityCheck: { passed: false, value: 65.0, threshold: 90 },
        criticalVulnerabilityCheck: { passed: false, value: 3, threshold: 0 }
      });
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.BLOCK,
        confidence: 0.99,
        reasons: [
          'Critical security vulnerabilities detected',
          'Security score 65% below minimum 90%'
        ],
        blockingIssues: ['critical-vulnerabilities'],
        requiresManualApproval: false // Hard block, no exceptions
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.E2E,
        target: 'vulnerable-application'
      });

      expect(result.decision).toBe(GateDecision.BLOCK);
      expect(result.details.blockingIssues).toContain('critical-vulnerabilities');
      
      expect(mockNotificationService.createAlert).toHaveBeenCalledWith({
        severity: 'critical',
        type: 'security-vulnerability',
        message: 'Critical security vulnerabilities block deployment',
        target: 'vulnerable-application'
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Deployment blocked due to critical security vulnerabilities'
      );
    });
  });

  describe('Decision Explanation and Auditability', () => {
    it('should provide detailed decision explanation for audit purposes', async () => {
      mockDecisionEngine.explainDecision.mockReturnValue({
        decisionReasoning: {
          inputs: expect.any(Object),
          evaluationSteps: [
            { step: 'coverage-check', result: 'pass', details: 'Coverage 85% > 80%' },
            { step: 'quality-check', result: 'pass', details: 'Quality score 87.5 > 85' },
            { step: 'risk-assessment', result: 'low', details: 'Risk score 0.15 < 0.3' }
          ],
          finalDecision: 'pass',
          confidence: 0.91
        },
        auditTrail: {
          timestamp: expect.any(String),
          evaluator: 'quality-gate-engine',
          policiesApplied: expect.any(Array),
          dataCollected: expect.any(Object)
        }
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.UNIT,
        target: 'auditable-service',
        requireExplanation: true
      });

      // Verify decision explanation generation
      expect(mockDecisionEngine.explainDecision).toHaveBeenCalled();
      
      expect(result.details.explanation).toBeDefined();
      expect(result.details.explanation.decisionReasoning).toBeDefined();
      expect(result.details.explanation.auditTrail).toBeDefined();
      
      expect(mockMetrics.recordDecision).toHaveBeenCalledWith(
        'quality-gate.explained',
        expect.objectContaining({ auditEnabled: true })
      );
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle metrics collection failures gracefully', async () => {
      mockQualityMetrics.collectMetrics.mockRejectedValue(
        new Error('Metrics service unavailable')
      );
      
      mockDecisionEngine.makeDecision.mockReturnValue({
        decision: GateDecision.FAIL,
        confidence: 0.0,
        reasons: ['Unable to collect quality metrics'],
        error: 'metrics-collection-failed'
      });

      const result = await qualityGate.evaluate({
        phase: QualityGatePhase.UNIT,
        target: 'unreachable-service'
      });

      expect(result.decision).toBe(GateDecision.FAIL);
      expect(result.details.error).toBe('metrics-collection-failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Quality gate evaluation failed: Metrics service unavailable'
      );
    });

    it('should measure and optimize gate evaluation performance', async () => {
      const startTime = Date.now();
      
      await qualityGate.evaluate({
        phase: QualityGatePhase.INTEGRATION,
        target: 'performance-test',
        measurePerformance: true
      });
      
      const evaluationTime = Date.now() - startTime;

      expect(mockMetrics.recordMetric).toHaveBeenCalledWith(
        'quality-gate.evaluation-time',
        expect.objectContaining({ duration: expect.any(Number) })
      );
      
      // Quality gate evaluation should be fast
      expect(evaluationTime).toBeLessThan(5000);
    });
  });
});

// Contract tests for quality gate
describe('QualityGate Contracts', () => {
  it('should satisfy IQualityGate interface', () => {
    expect(typeof qualityGate.evaluate).toBe('function');
    expect(typeof qualityGate.configurePolicy).toBe('function');
    expect(typeof qualityGate.getGateHistory).toBe('function');
    expect(typeof qualityGate.validateConfiguration).toBe('function');
  });

  it('should return consistent decision format across all phases', async () => {
    const phases = [QualityGatePhase.UNIT, QualityGatePhase.INTEGRATION, QualityGatePhase.E2E];
    
    for (const phase of phases) {
      const result = await qualityGate.evaluate({
        phase,
        target: 'contract-test'
      });

      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('details');
      expect(result).toHaveProperty('timestamp');
      
      expect(Object.values(GateDecision)).toContain(result.decision);
    }
  });
});
