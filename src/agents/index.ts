/**
 * Agents - Export all QE agent implementations
 * Based on SPARC Phase 2 Pseudocode patterns
 */

// Export all agent implementations
export { BaseAgent, BaseAgentConfig, BaseAgentFactory, AgentLLMConfig } from './BaseAgent';
export { TestGeneratorAgent } from './TestGeneratorAgent';
export { TestExecutorAgent } from './TestExecutorAgent';
export { CoverageAnalyzerAgent } from './CoverageAnalyzerAgent';
export { QualityGateAgent } from './QualityGateAgent';
export { QualityAnalyzerAgent } from './QualityAnalyzerAgent';
export { FleetCommanderAgent } from './FleetCommanderAgent';
export { RequirementsValidatorAgent } from './RequirementsValidatorAgent';
export { ProductionIntelligenceAgent } from './ProductionIntelligenceAgent';

// Week 2 Agent exports (prepared for implementation)
export { DeploymentReadinessAgent } from './DeploymentReadinessAgent';
export { PerformanceTesterAgent } from './PerformanceTesterAgent';
export { SecurityScannerAgent } from './SecurityScannerAgent';

// Week 3+ P1 Optimization Agent exports
export { RegressionRiskAnalyzerAgent } from './RegressionRiskAnalyzerAgent';
export { ApiContractValidatorAgent } from './ApiContractValidatorAgent';
export { TestDataArchitectAgent } from './TestDataArchitectAgent';
export { FlakyTestHunterAgent } from './FlakyTestHunterAgent';

// Quality Experience (QX) Agent
export { QXPartnerAgent } from './QXPartnerAgent';

// Accessibility Testing Agent
export { AccessibilityAllyAgent, AccessibilityAllyConfig } from './AccessibilityAllyAgent';

// Code Intelligence Agent (Wave 6)
export { CodeIntelligenceAgent, CodeIntelligenceAgentConfig, createCodeIntelligenceAgent } from './CodeIntelligenceAgent';

// Agent factory for creating agents by type
import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { EventBus } from '../core/EventBus';
import { MemoryManager } from '../core/MemoryManager';
import { AgentType, QEAgentType, AgentContext, AgentStatus, MemoryStore } from '../types';

import { TestGeneratorAgent } from './TestGeneratorAgent';
import { TestExecutorAgent, TestExecutorConfig } from './TestExecutorAgent';
import { CoverageAnalyzerAgent, CoverageAnalyzerConfig } from './CoverageAnalyzerAgent';
import { QualityGateAgent, QualityGateConfig } from './QualityGateAgent';
import { QualityAnalyzerAgent, QualityAnalyzerConfig } from './QualityAnalyzerAgent';
import { FleetCommanderAgent, FleetCommanderConfig } from './FleetCommanderAgent';
import { RequirementsValidatorAgent, RequirementsValidatorConfig } from './RequirementsValidatorAgent';
import { ProductionIntelligenceAgent, ProductionIntelligenceConfig } from './ProductionIntelligenceAgent';

// Week 2 Agent imports (prepared for implementation)
import { DeploymentReadinessAgent } from './DeploymentReadinessAgent';
import { PerformanceTesterAgent } from './PerformanceTesterAgent';
import { SecurityScannerAgent, SecurityScannerConfig } from './SecurityScannerAgent';

// Week 3+ P1 Optimization Agent imports
import { RegressionRiskAnalyzerAgent, RegressionRiskAnalyzerConfig as RegressionConfig } from './RegressionRiskAnalyzerAgent';
import { ApiContractValidatorAgent } from './ApiContractValidatorAgent';
import { TestDataArchitectAgent, TestDataArchitectAgentConfig } from './TestDataArchitectAgent';
import { FlakyTestHunterAgent } from './FlakyTestHunterAgent';
import { QXPartnerAgent } from './QXPartnerAgent';
import { QXPartnerConfig } from '../types/qx';
import { AccessibilityAllyAgent, AccessibilityAllyConfig } from './AccessibilityAllyAgent';
import { CodeIntelligenceAgent, CodeIntelligenceAgentConfig } from './CodeIntelligenceAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import type {
  DeploymentReadinessConfig,
  PerformanceTesterConfig,
  TestDataArchitectConfig,
  ApiContractValidatorConfig,
  FlakyTestHunterConfig
} from '../types';

export interface QEAgentFactoryConfig {
  eventBus: EventBus;
  memoryStore: MemoryStore;
  context: AgentContext;
}

/**
 * Configuration options for creating agents via QEAgentFactory.createAgent()
 *
 * This is a flexible interface that allows any agent-specific configuration options.
 * Each agent type may use different subsets of these options. The index signature
 * allows additional properties beyond the explicitly typed ones.
 *
 * Common options include:
 * - id: Custom agent identifier
 * - name: Agent display name
 * - timeout: Execution timeout in milliseconds
 * - frameworks: Testing frameworks to use (e.g., ['jest', 'mocha'])
 * - tools: Analysis tools configuration
 * - thresholds: Quality/performance thresholds
 * - enablePatterns: Enable pattern learning
 * - enableLearning: Enable learning capabilities
 * - retryAttempts: Number of retry attempts for operations
 *
 * Agent-specific options are documented in each agent's configuration interface.
 *
 * Note: Uses Record<string, any> to support the dynamic property access patterns
 * used by the factory. Type safety for specific agents is enforced by the
 * agent-specific configuration interfaces (e.g., TestExecutorConfig, CoverageAnalyzerConfig).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentCreationOptions = Record<string, any>;

export class QEAgentFactory {
  private readonly config: QEAgentFactoryConfig;

  constructor(config: QEAgentFactoryConfig) {
    this.config = config;
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(type: AgentType): string {
    return `${type}-${Date.now()}-${SecureRandom.randomFloat().toString(36).substring(7)}`;
  }

  /**
   * Create an agent instance by type
   */
  async createAgent(type: AgentType, agentConfig?: AgentCreationOptions): Promise<BaseAgent> {
    const baseConfig: BaseAgentConfig = {
      type,
      capabilities: this.getCapabilitiesForType(type),
      context: this.config.context,
      memoryStore: this.config.memoryStore,
      eventBus: this.config.eventBus,
      // ARCHITECTURE (v2.2.0): All persistence goes through SwarmMemoryManager to memory.db
      // AgentDB path removed - patterns/learning/experiences stored in unified memory.db
      // LearningEngine uses memoryStore (SwarmMemoryManager) for all persistence
      enableLearning: true,
      ...agentConfig  // Allow caller to override
    };

    switch (type) {
      case QEAgentType.TEST_GENERATOR:
        return new TestGeneratorAgent(baseConfig);
      case QEAgentType.TEST_EXECUTOR: {
        const executorConfig: TestExecutorConfig = {
          ...baseConfig,
          frameworks: agentConfig?.frameworks || ['jest', 'mocha', 'cypress', 'playwright'],
          maxParallelTests: agentConfig?.maxParallelTests || 8,
          timeout: agentConfig?.timeout || 300000,
          reportFormat: agentConfig?.reportFormat || 'json',
          retryAttempts: agentConfig?.retryAttempts || 3,
          retryBackoff: agentConfig?.retryBackoff || 1000,
          sublinearOptimization: agentConfig?.sublinearOptimization !== undefined ? agentConfig.sublinearOptimization : true
        };
        return new TestExecutorAgent(executorConfig);
      }
      case QEAgentType.COVERAGE_ANALYZER: {
        const coverageConfig: CoverageAnalyzerConfig = {
          ...baseConfig,
          enablePatterns: agentConfig?.enablePatterns ?? true,
          targetImprovement: agentConfig?.targetImprovement ?? 0.20,
          improvementPeriodDays: agentConfig?.improvementPeriodDays ?? 30
        };
        return new CoverageAnalyzerAgent(coverageConfig);
      }
      case QEAgentType.QUALITY_GATE: {
        const qualityGateConfig: QualityGateConfig = {
          ...baseConfig,
          customCriteria: agentConfig?.customCriteria,
          defaultThreshold: agentConfig?.defaultThreshold ?? 0.8
        };
        return new QualityGateAgent(qualityGateConfig);
      }
      case QEAgentType.QUALITY_ANALYZER: {
        const analyzerConfig: QualityAnalyzerConfig & BaseAgentConfig = {
          ...baseConfig,
          tools: agentConfig?.tools || ['eslint', 'sonarqube', 'lighthouse'],
          thresholds: agentConfig?.thresholds || {
            coverage: 80,
            complexity: 10,
            maintainability: 65,
            security: 90
          },
          reportFormat: agentConfig?.reportFormat || 'json'
        };
        return new QualityAnalyzerAgent(analyzerConfig);
      }

      // Week 1 P0 Strategic Agents
      case QEAgentType.REQUIREMENTS_VALIDATOR: {
        const validatorConfig: RequirementsValidatorConfig & BaseAgentConfig = {
          ...baseConfig,
          thresholds: agentConfig?.thresholds || {
            minTestabilityScore: 70,
            maxHighRiskRequirements: 5,
            minBddCoverage: 80
          },
          validationRules: agentConfig?.validationRules || ['SMART', 'INVEST', 'CLEAR'],
          reportFormat: agentConfig?.reportFormat || 'json'
        };
        return new RequirementsValidatorAgent(validatorConfig);
      }

      case QEAgentType.PRODUCTION_INTELLIGENCE: {
        const intelligenceConfig: ProductionIntelligenceConfig & BaseAgentConfig = {
          ...baseConfig,
          monitoringPlatforms: agentConfig?.monitoringPlatforms,
          thresholds: agentConfig?.thresholds || {
            anomalyStdDev: 3,
            errorRateSpike: 0.5,
            latencyDegradation: 0.3,
            minIncidentOccurrences: 5
          },
          features: agentConfig?.features || {
            incidentReplay: true,
            rumAnalysis: true,
            anomalyDetection: true,
            loadPatternAnalysis: true,
            featureUsageAnalytics: true
          }
        };
        return new ProductionIntelligenceAgent(intelligenceConfig);
      }

      case QEAgentType.FLEET_COMMANDER: {
        const commanderConfig: FleetCommanderConfig & BaseAgentConfig = {
          ...baseConfig,
          topology: agentConfig?.topology || 'hierarchical',
          maxAgents: agentConfig?.maxAgents || 50,
          agentPools: agentConfig?.agentPools,
          resourceLimits: agentConfig?.resourceLimits,
          autoScaling: agentConfig?.autoScaling,
          faultTolerance: agentConfig?.faultTolerance
        };
        return new FleetCommanderAgent(commanderConfig);
      }

      // Week 2 P0 Agents
      case QEAgentType.DEPLOYMENT_READINESS: {
        const deploymentConfig: DeploymentReadinessConfig & BaseAgentConfig = {
          ...baseConfig,
          integrations: agentConfig?.integrations || {
            qualityGate: true,
            performance: true,
            security: true,
            monitoring: ['quality-metrics', 'test-results', 'performance-benchmarks']
          },
          thresholds: agentConfig?.thresholds || {
            minConfidenceScore: 85,
            reviewThreshold: 90,
            maxRollbackRisk: 15,
            maxOpenIncidents: 2
          },
          checklist: agentConfig?.checklist || {
            requiredApprovals: ['tech-lead', 'qa-lead'],
            requiredTests: ['unit', 'integration', 'e2e', 'performance'],
            requiredMetrics: ['coverage', 'quality-score', 'security-scan']
          }
        };
        throw new Error(`Agent type ${type} implementation in progress. Week 2 P0.`);
      }

      case QEAgentType.PERFORMANCE_TESTER: {
        const perfConfig: PerformanceTesterConfig & BaseAgentConfig = {
          ...baseConfig,
          tools: agentConfig?.tools || {
            loadTesting: 'k6' as const,
            monitoring: ['prometheus', 'grafana'],
            apm: 'datadog' as const
          },
          thresholds: {
            maxLatencyP95: agentConfig?.thresholds?.maxLatencyP95 ?? 500,
            maxLatencyP99: agentConfig?.thresholds?.maxLatencyP99 ?? 1000,
            minThroughput: agentConfig?.thresholds?.minThroughput ?? 1000,
            maxErrorRate: agentConfig?.thresholds?.maxErrorRate ?? 0.01,
            maxCpuUsage: agentConfig?.thresholds?.maxCpuUsage ?? 80,
            maxMemoryUsage: agentConfig?.thresholds?.maxMemoryUsage ?? 85
          },
          loadProfile: {
            virtualUsers: agentConfig?.loadProfile?.virtualUsers ?? 100,
            duration: agentConfig?.loadProfile?.duration ?? 300,
            rampUpTime: agentConfig?.loadProfile?.rampUpTime ?? 60,
            pattern: (agentConfig?.loadProfile?.pattern ?? 'ramp-up') as 'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak'
          }
        };
        return new PerformanceTesterAgent(perfConfig as any);
      }

      case QEAgentType.SECURITY_SCANNER: {
        const securityConfig: SecurityScannerConfig & BaseAgentConfig = {
          ...baseConfig,
          tools: agentConfig?.tools || {
            sast: 'sonarqube',
            dast: 'owasp-zap',
            dependencies: 'snyk',
            containers: 'trivy'
          },
          thresholds: agentConfig?.thresholds || {
            maxCriticalVulnerabilities: 0,
            maxHighVulnerabilities: 2,
            maxMediumVulnerabilities: 10,
            minSecurityScore: 80
          },
          compliance: agentConfig?.compliance || {
            standards: ['OWASP-Top-10', 'CWE-Top-25'],
            enforceCompliance: true
          },
          scanScope: agentConfig?.scanScope || {
            includeCode: true,
            includeDependencies: true,
            includeContainers: true,
            includeDynamic: true
          }
        };
        return new SecurityScannerAgent(securityConfig);
      }

      // Week 3+ P1 Optimization Agents
      case QEAgentType.REGRESSION_RISK_ANALYZER: {
        const regressionConfig: RegressionConfig = {
          ...baseConfig,
          gitIntegration: agentConfig?.gitIntegration !== false,
          gitRepository: agentConfig?.gitRepository || process.cwd(),
          baseBranch: agentConfig?.baseBranch || 'main',
          astParsing: agentConfig?.astParsing !== false,
          supportedLanguages: agentConfig?.supportedLanguages || ['typescript', 'javascript'],
          mlModelEnabled: agentConfig?.mlModelEnabled !== false,
          historicalDataWindow: agentConfig?.historicalDataWindow || 90,
          testSelectionStrategy: agentConfig?.testSelectionStrategy || 'smart',
          changeImpactThreshold: agentConfig?.changeImpactThreshold || 0.5,
          confidenceLevel: agentConfig?.confidenceLevel || 0.95,
          riskHeatMapEnabled: agentConfig?.riskHeatMapEnabled !== false,
          ciOptimizationEnabled: agentConfig?.ciOptimizationEnabled !== false,
          maxParallelWorkers: agentConfig?.maxParallelWorkers || 8
        };
        return new RegressionRiskAnalyzerAgent(regressionConfig);
      }

      case QEAgentType.TEST_DATA_ARCHITECT: {
        const testDataConfig: TestDataArchitectAgentConfig = {
          ...baseConfig,
          databases: agentConfig?.databases || ['postgresql', 'mysql', 'mongodb', 'sqlite'],
          generationRate: agentConfig?.generationRate || 10000,
          referentialIntegrity: agentConfig?.referentialIntegrity !== false,
          piiAnonymization: agentConfig?.piiAnonymization !== false,
          gdprCompliant: agentConfig?.gdprCompliant !== false,
          edgeCaseGeneration: agentConfig?.edgeCaseGeneration !== false,
          fakerLocale: agentConfig?.fakerLocale || 'en',
          batchSize: agentConfig?.batchSize || 1000,
          parallelGeneration: agentConfig?.parallelGeneration !== false
        };
        return new TestDataArchitectAgent(testDataConfig);
      }

      case QEAgentType.API_CONTRACT_VALIDATOR: {
        const apiContractConfig: ApiContractValidatorConfig & BaseAgentConfig = {
          ...baseConfig,
          schemas: agentConfig?.schemas || {
            openApi: true,
            graphql: true,
            protobuf: true
          },
          validation: agentConfig?.validation || {
            strictMode: true,
            breakingChangeDetection: true,
            versionCompatibility: true
          },
          impact: agentConfig?.impact || {
            consumerAnalysis: true,
            backwardCompatibility: true,
            deprecationWarnings: true
          }
        };
        return new ApiContractValidatorAgent({
          ...apiContractConfig,
          validatorConfig: {
            schemaFormats: ['openapi', 'swagger', 'graphql'],
            breakingChangeDetection: apiContractConfig.validation?.breakingChangeDetection ?? true,
            semanticVersioning: apiContractConfig.validation?.versionCompatibility ?? true,
            consumerImpactAnalysis: apiContractConfig.impact?.consumerAnalysis ?? true,
            contractDiffing: true
          }
        } as any);
      }

      case QEAgentType.FLAKY_TEST_HUNTER: {
        const flakyTestConfig: FlakyTestHunterConfig = {
          detection: agentConfig?.detection || {
            repeatedRuns: 20,
            parallelExecutions: 4,
            timeWindow: 30
          },
          analysis: agentConfig?.analysis || {
            rootCauseIdentification: true,
            patternRecognition: true,
            environmentalFactors: true
          },
          remediation: agentConfig?.remediation || {
            autoStabilization: true,
            quarantineEnabled: true,
            retryAttempts: 3
          },
          reporting: agentConfig?.reporting || {
            trendTracking: true,
            flakinessScore: true,
            recommendationEngine: true
          }
        };
        return new FlakyTestHunterAgent(baseConfig, flakyTestConfig);
      }

      case QEAgentType.QX_PARTNER: {
        const qxConfig: QXPartnerConfig & BaseAgentConfig = {
          ...baseConfig,
          analysisMode: agentConfig?.analysisMode || 'full',
          heuristics: agentConfig?.heuristics || {
            enabledHeuristics: [
              'problem-understanding',
              'rule-of-three',
              'user-needs-identification',
              'user-vs-business-balance',
              'oracle-problem-detection',
              'impact-analysis',
              'intuitive-design'
            ] as any,
            minConfidence: 0.7,
            enableCompetitiveAnalysis: false
          },
          integrateTestability: agentConfig?.integrateTestability ?? true,
          testabilityScoringPath: agentConfig?.testabilityScoringPath || '.claude/skills/testability-scoring',
          detectOracleProblems: agentConfig?.detectOracleProblems ?? true,
          minOracleSeverity: agentConfig?.minOracleSeverity || 'medium',
          collaboration: agentConfig?.collaboration || {
            coordinateWithUX: true,
            coordinateWithQA: true,
            shareWithQualityAnalyzer: true
          },
          outputFormat: agentConfig?.outputFormat || 'json',
          thresholds: agentConfig?.thresholds || {
            minQXScore: 70,
            minProblemClarity: 60,
            minUserNeedsAlignment: 70,
            minBusinessAlignment: 70
          }
        };
        return new QXPartnerAgent(qxConfig as any);
      }

      case QEAgentType.ACCESSIBILITY_ALLY: {
        const a11yConfig: AccessibilityAllyConfig = {
          ...baseConfig,
          wcagLevel: agentConfig?.wcagLevel || 'AA',
          enableVisionAPI: agentConfig?.enableVisionAPI ?? true,
          visionProvider: agentConfig?.visionProvider || 'free',
          ollamaBaseUrl: agentConfig?.ollamaBaseUrl || 'http://localhost:11434',
          ollamaModel: agentConfig?.ollamaModel || 'llava',
          contextAwareRemediation: agentConfig?.contextAwareRemediation ?? true,
          generateHTMLReport: agentConfig?.generateHTMLReport ?? false,
          generateMarkdownReport: agentConfig?.generateMarkdownReport ?? true,
          thresholds: agentConfig?.thresholds || {
            minComplianceScore: 85,
            maxCriticalViolations: 0,
            maxSeriousViolations: 3
          },
          euCompliance: agentConfig?.euCompliance || {
            enabled: true,
            en301549Mapping: true,
            euAccessibilityAct: true
          }
        };
        return new AccessibilityAllyAgent(a11yConfig as any);
      }

      case QEAgentType.CODE_INTELLIGENCE: {
        const codeIntelConfig: CodeIntelligenceAgentConfig = {
          ...baseConfig,
          rootDir: agentConfig?.rootDir || process.cwd(),
          ollamaUrl: agentConfig?.ollamaUrl || 'http://localhost:11434',
          database: agentConfig?.database || {
            enabled: true,
            host: process.env.PGHOST || 'localhost',
            port: parseInt(process.env.PGPORT || '5432'),
            database: process.env.PGDATABASE || 'ruvector_db',
            user: process.env.PGUSER || 'ruvector',
            password: process.env.PGPASSWORD || 'ruvector',
          },
          includePatterns: agentConfig?.includePatterns,
          excludePatterns: agentConfig?.excludePatterns,
          incrementalIndexing: agentConfig?.incrementalIndexing ?? true,
        };
        return new CodeIntelligenceAgent(codeIntelConfig);
      }

      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  /**
   * Get supported agent types
   */
  getSupportedTypes(): QEAgentType[] {
    return [
      // Core Testing Agents
      QEAgentType.TEST_GENERATOR,
      QEAgentType.TEST_EXECUTOR,
      QEAgentType.COVERAGE_ANALYZER,
      QEAgentType.QUALITY_GATE,
      QEAgentType.QUALITY_ANALYZER,
      // Week 1 P0 Strategic Agents
      QEAgentType.REQUIREMENTS_VALIDATOR,
      QEAgentType.PRODUCTION_INTELLIGENCE,
      QEAgentType.FLEET_COMMANDER,
      // Week 2 P0 Agents
      QEAgentType.DEPLOYMENT_READINESS,
      QEAgentType.PERFORMANCE_TESTER,
      QEAgentType.SECURITY_SCANNER,
      // Week 3+ P1 Optimization Agents
      QEAgentType.REGRESSION_RISK_ANALYZER,
      QEAgentType.TEST_DATA_ARCHITECT,
      QEAgentType.API_CONTRACT_VALIDATOR,
      QEAgentType.FLAKY_TEST_HUNTER,
      // Quality Experience (QX) Agent
      QEAgentType.QX_PARTNER,
      // Accessibility Testing Agent
      QEAgentType.ACCESSIBILITY_ALLY,
      // Code Intelligence Agent (Wave 6)
      QEAgentType.CODE_INTELLIGENCE
    ];
  }

  /**
   * Get capabilities for a specific agent type
   */
  private getCapabilitiesForType(type: AgentType) {
    const capabilityMap: Record<QEAgentType, Array<{name: string; version: string; description: string}>> = {
      [QEAgentType.TEST_GENERATOR]: [
        {
          name: 'ai-test-generation',
          version: '2.0.0',
          description: 'Generate tests using AI with sublinear optimization'
        },
        {
          name: 'property-based-testing',
          version: '1.0.0',
          description: 'Generate property-based tests'
        }
      ],
      [QEAgentType.TEST_EXECUTOR]: [
        {
          name: 'parallel-execution',
          version: '2.0.0',
          description: 'Execute tests in parallel with retry logic'
        },
        {
          name: 'multi-framework',
          version: '1.0.0',
          description: 'Support multiple testing frameworks'
        }
      ],
      [QEAgentType.COVERAGE_ANALYZER]: [
        {
          name: 'sublinear-coverage-optimization',
          version: '2.0.0',
          description: 'O(log n) coverage optimization algorithms'
        },
        {
          name: 'real-time-gap-detection',
          version: '1.0.0',
          description: 'Real-time coverage gap detection'
        }
      ],
      [QEAgentType.QUALITY_GATE]: [
        {
          name: 'intelligent-quality-assessment',
          version: '2.0.0',
          description: 'AI-driven quality gate decisions'
        },
        {
          name: 'dynamic-threshold-adjustment',
          version: '1.0.0',
          description: 'Dynamic quality threshold adjustment'
        }
      ],
      [QEAgentType.QUALITY_ANALYZER]: [
        {
          name: 'quality-metrics-analysis',
          version: '1.0.0',
          description: 'Comprehensive quality metrics analysis'
        }
      ],

      // Week 1 P0 Strategic Agents
      [QEAgentType.REQUIREMENTS_VALIDATOR]: [
        {
          name: 'testability-analysis',
          version: '1.0.0',
          description: 'INVEST criteria validation and testability scoring'
        },
        {
          name: 'bdd-scenario-generation',
          version: '1.0.0',
          description: 'Automatic Gherkin scenario generation from requirements'
        },
        {
          name: 'ambiguity-detection',
          version: '1.0.0',
          description: 'NLP-based ambiguity and clarity analysis'
        },
        {
          name: 'acceptance-criteria-validation',
          version: '1.0.0',
          description: 'Automated acceptance criteria completeness checking'
        }
      ],
      [QEAgentType.PRODUCTION_INTELLIGENCE]: [
        {
          name: 'incident-replay-generation',
          version: '1.0.0',
          description: 'Generate tests from production incidents'
        },
        {
          name: 'rum-analysis',
          version: '1.0.0',
          description: 'Real User Monitoring data analysis'
        },
        {
          name: 'load-pattern-extraction',
          version: '1.0.0',
          description: 'Extract realistic load patterns from production'
        },
        {
          name: 'observability-integration',
          version: '1.0.0',
          description: 'Integration with Datadog, New Relic, Grafana, Prometheus'
        }
      ],
      [QEAgentType.FLEET_COMMANDER]: [
        {
          name: 'hierarchical-orchestration',
          version: '1.0.0',
          description: 'Hierarchical fleet coordination and task distribution'
        },
        {
          name: 'agent-health-monitoring',
          version: '1.0.0',
          description: 'Real-time agent health and performance monitoring'
        },
        {
          name: 'dynamic-load-balancing',
          version: '1.0.0',
          description: 'Intelligent load distribution across agent pool'
        },
        {
          name: 'auto-scaling',
          version: '1.0.0',
          description: 'Automatic agent scaling based on workload'
        },
        {
          name: 'failure-recovery',
          version: '1.0.0',
          description: 'Automatic detection and recovery from agent failures'
        }
      ],

      // Week 2 P0 Agents (capabilities for Week 2 implementation)
      [QEAgentType.DEPLOYMENT_READINESS]: [
        {
          name: 'risk-scoring',
          version: '1.0.0',
          description: 'Multi-factor deployment risk assessment with O(log n) algorithms'
        },
        {
          name: 'release-confidence-analysis',
          version: '1.0.0',
          description: 'Statistical confidence analysis for releases based on quality metrics'
        },
        {
          name: 'rollback-risk-prediction',
          version: '1.0.0',
          description: 'Predict and prevent rollback scenarios using historical data'
        },
        {
          name: 'checklist-validation',
          version: '1.0.0',
          description: 'Automated deployment checklist validation and approval tracking'
        },
        {
          name: 'integration-orchestration',
          version: '1.0.0',
          description: 'Coordinate quality gate, performance, and security validations'
        },
        {
          name: 'incident-monitoring',
          version: '1.0.0',
          description: 'Real-time monitoring of open production incidents'
        }
      ],
      [QEAgentType.PERFORMANCE_TESTER]: [
        {
          name: 'multi-tool-load-testing',
          version: '1.0.0',
          description: 'Support for k6, JMeter, Gatling, Artillery load testing'
        },
        {
          name: 'performance-profiling',
          version: '1.0.0',
          description: 'Deep performance profiling with APM integration'
        },
        {
          name: 'bottleneck-detection',
          version: '1.0.0',
          description: 'AI-driven bottleneck detection and analysis'
        },
        {
          name: 'load-pattern-simulation',
          version: '1.0.0',
          description: 'Realistic load pattern simulation (constant, ramp-up, spike, stress, soak)'
        },
        {
          name: 'threshold-monitoring',
          version: '1.0.0',
          description: 'Real-time P95/P99 latency and throughput monitoring'
        },
        {
          name: 'resource-tracking',
          version: '1.0.0',
          description: 'CPU, memory, and resource usage tracking'
        }
      ],
      [QEAgentType.SECURITY_SCANNER]: [
        {
          name: 'multi-layer-scanning',
          version: '1.0.0',
          description: 'SAST, DAST, dependency, and container scanning'
        },
        {
          name: 'vulnerability-prioritization',
          version: '1.0.0',
          description: 'AI-driven vulnerability prioritization by severity and impact'
        },
        {
          name: 'compliance-validation',
          version: '1.0.0',
          description: 'OWASP Top 10, CWE Top 25 compliance validation'
        },
        {
          name: 'dependency-analysis',
          version: '1.0.0',
          description: 'Comprehensive dependency vulnerability analysis'
        },
        {
          name: 'container-security',
          version: '1.0.0',
          description: 'Container image and runtime security scanning'
        },
        {
          name: 'security-remediation',
          version: '1.0.0',
          description: 'Automated security remediation suggestions'
        }
      ],
      // Week 3+ P1 Optimization Agents (6 capabilities each = 24 total)
      [QEAgentType.REGRESSION_RISK_ANALYZER]: [
        {
          name: 'smart-test-selection',
          version: '1.0.0',
          description: 'O(log n) intelligent test selection based on code changes'
        },
        {
          name: 'code-impact-analysis',
          version: '1.0.0',
          description: 'AST-based code change impact analysis with dependency tracking'
        },
        {
          name: 'ml-pattern-recognition',
          version: '1.0.0',
          description: 'Machine learning for historical regression pattern detection'
        },
        {
          name: 'risk-heat-mapping',
          version: '1.0.0',
          description: 'Visual heat map of high-risk code areas for targeted testing'
        },
        {
          name: 'git-integration',
          version: '1.0.0',
          description: 'Deep Git integration for change tracking and diff analysis'
        },
        {
          name: 'adaptive-strategy',
          version: '1.0.0',
          description: 'Adaptive test selection strategy based on project characteristics'
        }
      ],
      [QEAgentType.TEST_DATA_ARCHITECT]: [
        {
          name: 'high-speed-data-generation',
          version: '1.0.0',
          description: '10,000+ records/second realistic test data generation'
        },
        {
          name: 'referential-integrity',
          version: '1.0.0',
          description: 'Automatic referential integrity preservation across tables'
        },
        {
          name: 'pii-anonymization',
          version: '1.0.0',
          description: 'GDPR-compliant PII anonymization and masking'
        },
        {
          name: 'schema-introspection',
          version: '1.0.0',
          description: 'Automatic database schema discovery and analysis'
        },
        {
          name: 'edge-case-generation',
          version: '1.0.0',
          description: 'Intelligent edge case and boundary condition data generation'
        },
        {
          name: 'multi-database-support',
          version: '1.0.0',
          description: 'Support for PostgreSQL, MySQL, MongoDB, SQLite data generation'
        }
      ],
      [QEAgentType.API_CONTRACT_VALIDATOR]: [
        {
          name: 'breaking-change-detection',
          version: '1.0.0',
          description: 'Automatic detection of API breaking changes across versions'
        },
        {
          name: 'multi-schema-support',
          version: '1.0.0',
          description: 'OpenAPI, Swagger, GraphQL, gRPC, Protobuf schema validation'
        },
        {
          name: 'consumer-impact-analysis',
          version: '1.0.0',
          description: 'Analyze downstream impact of API changes on consumers'
        },
        {
          name: 'semantic-versioning',
          version: '1.0.0',
          description: 'Automatic semantic versioning recommendations based on changes'
        },
        {
          name: 'backward-compatibility',
          version: '1.0.0',
          description: 'Backward compatibility verification and migration path analysis'
        },
        {
          name: 'contract-diffing',
          version: '1.0.0',
          description: 'Visual contract diffing with deprecation warnings'
        }
      ],
      [QEAgentType.FLAKY_TEST_HUNTER]: [
        {
          name: 'statistical-flakiness-detection',
          version: '1.0.0',
          description: 'Statistical analysis of test reliability with 10x-100x reruns'
        },
        {
          name: 'root-cause-identification',
          version: '1.0.0',
          description: 'Automatic identification of flakiness root causes (timing, race conditions, etc.)'
        },
        {
          name: 'auto-stabilization',
          version: '1.0.0',
          description: 'Suggest and automatically apply test stabilization fixes'
        },
        {
          name: 'flakiness-scoring',
          version: '1.0.0',
          description: 'Quantitative flakiness scoring (0-100) with trend tracking'
        },
        {
          name: 'quarantine-management',
          version: '1.0.0',
          description: 'Automatic test quarantine and isolation for unstable tests'
        },
        {
          name: 'environmental-analysis',
          version: '1.0.0',
          description: 'Analyze environmental factors contributing to test flakiness'
        }
      ],

      // Quality Experience (QX) Agent
      [QEAgentType.QX_PARTNER]: [
        {
          name: 'qx-analysis',
          version: '1.0.0',
          description: 'Comprehensive QX (Quality Experience) analysis combining QA and UX perspectives'
        },
        {
          name: 'oracle-problem-detection',
          version: '1.0.0',
          description: 'Detect and resolve oracle problems when quality criteria are unclear'
        },
        {
          name: 'ux-testing-heuristics',
          version: '1.0.0',
          description: 'Apply UX testing heuristics (Rule of Three, user needs, business needs, impact analysis)'
        },
        {
          name: 'user-business-balance',
          version: '1.0.0',
          description: 'Find optimal balance between user experience and business objectives'
        },
        {
          name: 'impact-analysis',
          version: '1.0.0',
          description: 'Analyze visible and invisible impacts of design changes on stakeholders'
        },
        {
          name: 'testability-integration',
          version: '1.0.0',
          description: 'Integrate with testability scoring (10 Principles) for comprehensive QX insights'
        },
        {
          name: 'collaborative-qx',
          version: '1.0.0',
          description: 'Coordinate with UX and QA agents for holistic quality experience assessment'
        }
      ],

      // Accessibility Testing Agent
      [QEAgentType.ACCESSIBILITY_ALLY]: [
        {
          name: 'wcag-2.2-validation',
          version: '1.0.0',
          description: 'Comprehensive WCAG 2.2 compliance testing (Level A, AA, AAA)'
        },
        {
          name: 'context-aware-remediation',
          version: '1.0.0',
          description: 'Intelligent remediation suggestions with context-specific code examples'
        },
        {
          name: 'aria-intelligence',
          version: '1.0.0',
          description: 'Smart ARIA label generation based on element semantics and context'
        },
        {
          name: 'video-accessibility-analysis',
          version: '1.0.0',
          description: 'AI-powered video analysis with multi-provider cascade (FREE with Ollama)'
        },
        {
          name: 'webvtt-generation',
          version: '1.0.0',
          description: 'Automatic WebVTT caption file generation with detailed scene descriptions'
        },
        {
          name: 'en301549-compliance',
          version: '1.0.0',
          description: 'EN 301 549 EU accessibility standard compliance mapping'
        },
        {
          name: 'apg-pattern-suggestions',
          version: '1.0.0',
          description: 'ARIA Authoring Practices Guide pattern recommendations'
        },
        {
          name: 'keyboard-navigation-testing',
          version: '1.0.0',
          description: 'Keyboard navigation path validation and focus management'
        },
        {
          name: 'color-contrast-optimization',
          version: '1.0.0',
          description: 'Color contrast analysis with specific fix recommendations'
        },
        {
          name: 'learning-integration',
          version: '1.0.0',
          description: 'Learn from remediation feedback to improve future recommendations'
        }
      ],

      // Other core agents (placeholder capabilities - future implementation)
      [QEAgentType.CHAOS_ENGINEER]: [],
      [QEAgentType.VISUAL_TESTER]: [],

      // Code Intelligence Agent (Wave 6)
      [QEAgentType.CODE_INTELLIGENCE]: [
        {
          name: 'tree-sitter-parsing',
          version: '1.0.0',
          description: 'Multi-language AST parsing with Tree-sitter (TypeScript, Python, Go, Rust, JavaScript)'
        },
        {
          name: 'semantic-embeddings',
          version: '1.0.0',
          description: 'Ollama nomic-embed-text embeddings (768 dimensions, 8192 context)'
        },
        {
          name: 'hybrid-search',
          version: '1.0.0',
          description: 'BM25 + Vector search with RRF fusion for accurate code retrieval'
        },
        {
          name: 'knowledge-graph',
          version: '1.0.0',
          description: 'Entity relationships (imports, extends, calls) with graph traversal'
        },
        {
          name: 'context-building',
          version: '1.0.0',
          description: '80% token reduction through intelligent code context generation'
        },
        {
          name: 'visualization',
          version: '1.0.0',
          description: 'Mermaid class diagrams and dependency graphs'
        },
        {
          name: 'incremental-indexing',
          version: '1.0.0',
          description: 'Git change detection for efficient incremental updates'
        }
      ]
    };

    return capabilityMap[type as QEAgentType] || [];
  }
}

/**
 * Configuration options for the legacy createAgent function
 */
export interface LegacyAgentConfig extends AgentCreationOptions {
  memoryStore: MemoryStore;
  context?: AgentContext;
}

// Legacy compatibility function
export async function createAgent(type: string, id: string, config: LegacyAgentConfig, eventBus: EventBus): Promise<BaseAgent> {
  const factory = new QEAgentFactory({
    eventBus,
    memoryStore: config.memoryStore,
    context: config.context || { id, type, status: AgentStatus.INITIALIZING }
  });

  return await factory.createAgent(type as AgentType, { id, ...config });
}

// SONA Integration (NEW in v2.4.0+ - ruvLLM Integration)
export {
  createSONAContext,
  withSONALearning,
  isSONAAvailable,
  getRecommendedConfig,
  quickStartSONA,
  createLearningStrategyFactory,
} from './SONAIntegration';
export type {
  SONAIntegrationConfig,
  SONAAgentContext,
} from './SONAIntegration';

// SONA Lifecycle Manager (NEW in v2.5.4 - Phase 2: Lifecycle Integration)
export {
  SONALifecycleManager,
  getSONALifecycleManager,
  resetSONALifecycleManager,
  createSONALifecycleManager,
} from './SONALifecycleManager';
export type {
  SONALifecycleConfig,
  AgentSONAContext,
  TaskCompletionFeedback,
} from './SONALifecycleManager';