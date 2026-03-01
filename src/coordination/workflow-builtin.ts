/**
 * Built-in Workflow Definitions
 *
 * Pre-configured workflows for common QE patterns.
 * Extracted from workflow-orchestrator.ts.
 */

import type { WorkflowDefinition } from './workflow-types.js';

// ============================================================================
// Built-in Workflow Definitions
// ============================================================================

/**
 * Get all built-in workflow definitions.
 * These are registered automatically when the orchestrator initializes.
 */
export function getBuiltInWorkflows(): WorkflowDefinition[] {
  return [
    comprehensiveTestingWorkflow(),
    defectPreventionWorkflow(),
    preReleaseWorkflow(),
    continuousLearningWorkflow(),
    morningSyncWorkflow(),
    qcsdIdeationSwarmWorkflow(),
  ];
}

/**
 * IDs of built-in workflows (used to skip persistence).
 */
export const BUILTIN_WORKFLOW_IDS = [
  'comprehensive-testing',
  'defect-prevention',
  'pre-release',
  'continuous-learning',
  'morning-sync',
  'qcsd-ideation-swarm',
] as const;

// ============================================================================
// Individual Workflow Definitions
// ============================================================================

function comprehensiveTestingWorkflow(): WorkflowDefinition {
  return {
    id: 'comprehensive-testing',
    name: 'Comprehensive Testing Workflow',
    description:
      'test-generation -> test-execution -> coverage-analysis -> quality-assessment',
    version: '1.0.0',
    tags: ['testing', 'quality'],
    steps: [
      {
        id: 'generate-tests',
        name: 'Generate Tests',
        domain: 'test-generation',
        action: 'generateTests',
        inputMapping: {
          sourceFiles: 'input.sourceFiles',
          framework: 'input.framework',
        },
        outputMapping: {
          testFiles: 'generatedTests.files',
          testCount: 'generatedTests.count',
        },
        timeout: 120000,
        retry: { maxAttempts: 2, backoffMs: 1000 },
      },
      {
        id: 'execute-tests',
        name: 'Execute Tests',
        domain: 'test-execution',
        action: 'execute',
        dependsOn: ['generate-tests'],
        inputMapping: {
          testFiles: 'results.generatedTests.files',
        },
        outputMapping: {
          runId: 'execution.runId',
          passed: 'execution.passed',
          failed: 'execution.failed',
        },
        timeout: 300000,
      },
      {
        id: 'analyze-coverage',
        name: 'Analyze Coverage',
        domain: 'coverage-analysis',
        action: 'analyze',
        dependsOn: ['execute-tests'],
        inputMapping: {
          runId: 'results.execution.runId',
        },
        outputMapping: {
          line: 'coverage.line',
          branch: 'coverage.branch',
          overall: 'coverage.overall',
        },
      },
      {
        id: 'assess-quality',
        name: 'Assess Quality',
        domain: 'quality-assessment',
        action: 'evaluateGate',
        dependsOn: ['analyze-coverage'],
        inputMapping: {
          coverage: 'results.coverage',
          testResults: 'results.execution',
        },
        outputMapping: {
          passed: 'quality.gatePassed',
          score: 'quality.score',
        },
      },
      {
        id: 'generate-more-tests',
        name: 'Generate Additional Tests',
        domain: 'test-generation',
        action: 'generateTests',
        dependsOn: ['analyze-coverage'],
        condition: {
          path: 'results.coverage.overall',
          operator: 'lt',
          value: 80,
        },
        inputMapping: {
          sourceFiles: 'input.sourceFiles',
          targetCoverage: 'input.targetCoverage',
        },
        continueOnFailure: true,
      },
    ],
  };
}

function defectPreventionWorkflow(): WorkflowDefinition {
  return {
    id: 'defect-prevention',
    name: 'Defect Prevention Workflow',
    description:
      'code-intelligence (impact) -> defect-intelligence (predict) -> test-generation (for risky areas)',
    version: '1.0.0',
    tags: ['defect', 'prevention', 'ai'],
    steps: [
      {
        id: 'analyze-impact',
        name: 'Analyze Code Impact',
        domain: 'code-intelligence',
        action: 'analyzeImpact',
        inputMapping: {
          changedFiles: 'input.changedFiles',
        },
        outputMapping: {
          impactedFiles: 'impact.files',
          impactedTests: 'impact.tests',
          riskLevel: 'impact.riskLevel',
        },
        timeout: 60000,
      },
      {
        id: 'predict-defects',
        name: 'Predict Defects',
        domain: 'defect-intelligence',
        action: 'predictDefects',
        dependsOn: ['analyze-impact'],
        inputMapping: {
          files: 'results.impact.files',
        },
        outputMapping: {
          predictions: 'defects.predictions',
          highRiskFiles: 'defects.highRiskFiles',
        },
      },
      {
        id: 'generate-targeted-tests',
        name: 'Generate Targeted Tests',
        domain: 'test-generation',
        action: 'generateTests',
        dependsOn: ['predict-defects'],
        condition: {
          path: 'results.defects.highRiskFiles',
          operator: 'exists',
          value: true,
        },
        inputMapping: {
          sourceFiles: 'results.defects.highRiskFiles',
          priority: 'input.priority',
        },
      },
    ],
    triggers: [
      {
        eventType: 'code-intelligence.ImpactAnalysisCompleted',
        inputMapping: {
          changedFiles: 'event.changedFiles',
        },
      },
    ],
  };
}

function preReleaseWorkflow(): WorkflowDefinition {
  return {
    id: 'pre-release',
    name: 'Pre-Release Workflow',
    description: 'security-audit -> quality-gate -> deployment-advisor',
    version: '1.0.0',
    tags: ['release', 'security', 'deployment'],
    steps: [
      {
        id: 'security-audit',
        name: 'Security Audit',
        domain: 'security-compliance',
        action: 'runAudit',
        inputMapping: {
          targetFiles: 'input.targetFiles',
          includeDependencies: 'input.includeDependencies',
        },
        outputMapping: {
          vulnerabilities: 'security.vulnerabilities',
          riskScore: 'security.riskScore',
          passed: 'security.passed',
        },
        timeout: 180000,
      },
      {
        id: 'quality-gate',
        name: 'Quality Gate Evaluation',
        domain: 'quality-assessment',
        action: 'evaluateGate',
        dependsOn: ['security-audit'],
        inputMapping: {
          securityResults: 'results.security',
          releaseCandidate: 'input.releaseCandidate',
        },
        outputMapping: {
          passed: 'quality.gatePassed',
          checks: 'quality.checks',
        },
      },
      {
        id: 'deployment-advice',
        name: 'Get Deployment Advice',
        domain: 'quality-assessment',
        action: 'getDeploymentAdvice',
        dependsOn: ['quality-gate'],
        inputMapping: {
          releaseCandidate: 'input.releaseCandidate',
          qualityResults: 'results.quality',
          securityResults: 'results.security',
        },
        outputMapping: {
          decision: 'deployment.decision',
          recommendations: 'deployment.recommendations',
          riskScore: 'deployment.riskScore',
        },
      },
    ],
    triggers: [
      {
        eventType: 'quality-assessment.QualityGateEvaluated',
        condition: {
          path: 'event.passed',
          operator: 'eq',
          value: true,
        },
      },
    ],
  };
}

function continuousLearningWorkflow(): WorkflowDefinition {
  return {
    id: 'continuous-learning',
    name: 'Continuous Learning Workflow',
    description: 'Collect patterns -> consolidate -> transfer -> optimize',
    version: '1.0.0',
    tags: ['learning', 'optimization', 'ai'],
    steps: [
      {
        id: 'collect-patterns',
        name: 'Collect Patterns',
        domain: 'learning-optimization',
        action: 'runLearningCycle',
        inputMapping: {
          domain: 'input.targetDomain',
        },
        outputMapping: {
          patternsLearned: 'learning.patterns',
          experiencesProcessed: 'learning.experiences',
        },
      },
      {
        id: 'consolidate-patterns',
        name: 'Consolidate Patterns',
        domain: 'learning-optimization',
        action: 'shareCrossDomainLearnings',
        dependsOn: ['collect-patterns'],
        condition: {
          path: 'results.learning.patterns',
          operator: 'gt',
          value: 0,
        },
        outputMapping: {
          knowledgeShared: 'consolidation.shared',
          domainsUpdated: 'consolidation.domains',
        },
      },
      {
        id: 'transfer-knowledge',
        name: 'Transfer Knowledge',
        domain: 'learning-optimization',
        action: 'shareCrossDomainLearnings',
        dependsOn: ['consolidate-patterns'],
        outputMapping: {
          transferSuccessRate: 'transfer.successRate',
          newPatternsCreated: 'transfer.newPatterns',
        },
      },
      {
        id: 'optimize-strategies',
        name: 'Optimize Strategies',
        domain: 'learning-optimization',
        action: 'optimizeAllStrategies',
        dependsOn: ['transfer-knowledge'],
        outputMapping: {
          domainsOptimized: 'optimization.domains',
          avgImprovement: 'optimization.improvement',
        },
      },
    ],
  };
}

function morningSyncWorkflow(): WorkflowDefinition {
  return {
    id: 'morning-sync',
    name: 'Morning Sync Protocol',
    description: 'Daily quality synchronization across all domains',
    version: '1.0.0',
    tags: ['protocol', 'daily', 'sync'],
    steps: [
      {
        id: 'collect-metrics',
        name: 'Collect Quality Metrics',
        domain: 'quality-assessment',
        action: 'analyzeQuality',
        inputMapping: {
          sourceFiles: 'input.sourceFiles',
        },
        outputMapping: {
          score: 'metrics.qualityScore',
        },
      },
      {
        id: 'analyze-trends',
        name: 'Analyze Coverage Trends',
        domain: 'coverage-analysis',
        action: 'getTrend',
        inputMapping: {
          timeRange: 'input.timeRange',
          granularity: 'input.granularity',
        },
        outputMapping: {
          trend: 'trends.coverage',
          forecast: 'trends.forecast',
        },
      },
      {
        id: 'check-security',
        name: 'Check Security Posture',
        domain: 'security-compliance',
        action: 'getSecurityPosture',
        outputMapping: {
          overallScore: 'security.score',
          criticalIssues: 'security.critical',
          recommendations: 'security.recommendations',
        },
      },
      {
        id: 'get-defect-predictions',
        name: 'Get Defect Predictions',
        domain: 'defect-intelligence',
        action: 'predictDefects',
        inputMapping: {
          files: 'input.changedFiles',
        },
        outputMapping: {
          predictions: 'defects.predictions',
        },
      },
      {
        id: 'generate-learning-report',
        name: 'Generate Learning Dashboard',
        domain: 'learning-optimization',
        action: 'getLearningDashboard',
        dependsOn: ['collect-metrics', 'analyze-trends', 'check-security', 'get-defect-predictions'],
        outputMapping: {
          learningRate: 'learning.rate',
          topDomains: 'learning.topDomains',
        },
      },
    ],
  };
}

function qcsdIdeationSwarmWorkflow(): WorkflowDefinition {
  return {
    id: 'qcsd-ideation-swarm',
    name: 'QCSD Ideation Swarm',
    description:
      'Quality Conscious Software Delivery ideation phase: [url-extraction] -> [flag-detection] -> quality-criteria (HTSM) -> [testability, risk, requirements, security*, accessibility*, qx*] in parallel -> aggregated report. Supports live website URLs with conditional agent spawning based on HAS_UI, HAS_SECURITY, HAS_UX flags.',
    version: '3.0.0',
    tags: ['qcsd', 'ideation', 'quality-criteria', 'htsm', 'shift-left', 'url-analysis'],
    steps: [
      // Step 0: Optional - Website Content Extraction (for URL input)
      {
        id: 'website-content-extraction',
        name: 'Website Content Extraction',
        domain: 'requirements-validation',
        action: 'extractWebsiteContent',
        inputMapping: {
          url: 'input.url',
        },
        outputMapping: {
          extractedDescription: 'extraction.description',
          extractedFeatures: 'extraction.features',
          extractedAcceptanceCriteria: 'extraction.acceptanceCriteria',
          detectedFlags: 'extraction.flags',
          isWebsite: 'extraction.isWebsite',
        },
        timeout: 60000,
        continueOnFailure: true,
      },
      // Step 1: Primary - Quality Criteria Analysis (HTSM v6.3)
      {
        id: 'quality-criteria-analysis',
        name: 'HTSM Quality Criteria Analysis',
        domain: 'requirements-validation',
        action: 'analyzeQualityCriteria',
        dependsOn: ['website-content-extraction'],
        inputMapping: {
          targetId: 'input.targetId',
          targetType: 'input.targetType',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
        },
        outputMapping: {
          qualityCriteria: 'qualityCriteria.criteria',
          qualityScore: 'qualityCriteria.score',
        },
        timeout: 180000,
        retry: { maxAttempts: 2, backoffMs: 2000 },
      },
      // Step 2a: Parallel - Testability Scoring
      {
        id: 'testability-assessment',
        name: 'Testability Scoring (10 Principles)',
        domain: 'requirements-validation',
        action: 'assessTestability',
        dependsOn: ['quality-criteria-analysis'],
        inputMapping: {
          targetId: 'input.targetId',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
        },
        outputMapping: {
          overallScore: 'testability.overallScore',
          principles: 'testability.principles',
          blockers: 'testability.blockers',
          recommendations: 'testability.recommendations',
        },
        timeout: 120000,
        continueOnFailure: true,
      },
      // Step 2b: Parallel - Risk Assessment
      {
        id: 'risk-assessment',
        name: 'Quality Risk Assessment',
        domain: 'requirements-validation',
        action: 'assessRisks',
        dependsOn: ['quality-criteria-analysis'],
        inputMapping: {
          targetId: 'input.targetId',
          targetType: 'input.targetType',
          description: 'results.website-content-extraction.extractedDescription || input.description',
        },
        outputMapping: {
          overallRisk: 'risks.overallRisk',
          riskScore: 'risks.riskScore',
          factors: 'risks.factors',
          mitigations: 'risks.mitigations',
        },
        timeout: 90000,
        continueOnFailure: true,
      },
      // Step 2c: Parallel - Requirements Validation
      {
        id: 'requirements-validation',
        name: 'Requirements & Acceptance Criteria Validation',
        domain: 'requirements-validation',
        action: 'validateRequirements',
        dependsOn: ['quality-criteria-analysis'],
        inputMapping: {
          targetId: 'input.targetId',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          acceptanceCriteria: 'results.website-content-extraction.extractedAcceptanceCriteria || input.acceptanceCriteria',
        },
        outputMapping: {
          valid: 'requirements.valid',
          issues: 'requirements.issues',
          suggestions: 'requirements.suggestions',
        },
        timeout: 90000,
        continueOnFailure: true,
      },
      // Step 3a: Optional - Security Threat Modeling (if HAS_SECURITY flag is true)
      {
        id: 'security-threat-modeling',
        name: 'Early Security Threat Modeling (STRIDE)',
        domain: 'security-compliance',
        action: 'modelSecurityThreats',
        dependsOn: ['quality-criteria-analysis'],
        condition: {
          path: 'results.website-content-extraction.detectedFlags.hasSecurity || input.securityCritical',
          operator: 'eq',
          value: true,
        },
        inputMapping: {
          targetId: 'input.targetId',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          securityCritical: 'results.website-content-extraction.detectedFlags.hasSecurity || input.securityCritical',
        },
        outputMapping: {
          threats: 'security.threats',
          overallRisk: 'security.overallRisk',
          recommendations: 'security.recommendations',
        },
        timeout: 120000,
        continueOnFailure: true,
      },
      // Step 3b: Optional - Accessibility Audit (if HAS_UI flag is true)
      {
        id: 'accessibility-audit',
        name: 'Accessibility Audit (WCAG 2.2)',
        domain: 'visual-accessibility',
        action: 'auditAccessibility',
        dependsOn: ['quality-criteria-analysis'],
        condition: {
          path: 'results.website-content-extraction.detectedFlags.hasUI || input.hasUI',
          operator: 'eq',
          value: true,
        },
        inputMapping: {
          targetId: 'input.targetId',
          url: 'input.url',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          features: 'results.website-content-extraction.extractedFeatures',
        },
        outputMapping: {
          wcagLevel: 'accessibility.wcagLevel',
          violations: 'accessibility.violations',
          recommendations: 'accessibility.recommendations',
        },
        timeout: 180000,
        continueOnFailure: true,
      },
      // Step 3c: Optional - Quality Experience Analysis (if HAS_UX flag is true)
      {
        id: 'quality-experience-analysis',
        name: 'Quality Experience Analysis (QX Partner)',
        domain: 'coordination',
        action: 'analyzeQualityExperience',
        dependsOn: ['quality-criteria-analysis'],
        condition: {
          path: 'results.website-content-extraction.detectedFlags.hasUX || input.hasUX',
          operator: 'eq',
          value: true,
        },
        inputMapping: {
          targetId: 'input.targetId',
          url: 'input.url',
          description: 'results.website-content-extraction.extractedDescription || input.description',
          features: 'results.website-content-extraction.extractedFeatures',
        },
        outputMapping: {
          journeys: 'qx.journeys',
          frictionPoints: 'qx.frictionPoints',
          recommendations: 'qx.recommendations',
        },
        timeout: 150000,
        continueOnFailure: true,
      },
      // Step 4: Aggregate Ideation Report
      {
        id: 'aggregate-ideation-report',
        name: 'Generate Ideation Report',
        domain: 'requirements-validation',
        action: 'generateIdeationReport',
        dependsOn: [
          'quality-criteria-analysis',
          'testability-assessment',
          'risk-assessment',
          'requirements-validation',
          'security-threat-modeling',
          'accessibility-audit',
          'quality-experience-analysis',
        ],
        inputMapping: {
          targetId: 'input.targetId',
          targetType: 'input.targetType',
        },
        outputMapping: {
          report: 'ideation.report',
          readyForDevelopment: 'ideation.readyForDevelopment',
          blockers: 'ideation.blockers',
          recommendations: 'ideation.recommendations',
          testStrategy: 'ideation.testStrategy',
        },
        timeout: 60000,
      },
      // Step 5: Store learnings for cross-phase feedback
      {
        id: 'store-ideation-learnings',
        name: 'Store Ideation Learnings',
        domain: 'learning-optimization',
        action: 'storeIdeationLearnings',
        dependsOn: ['aggregate-ideation-report'],
        inputMapping: {
          targetId: 'input.targetId',
          report: 'results.ideation.report',
        },
        outputMapping: {
          stored: 'learning.stored',
          patternId: 'learning.patternId',
        },
        continueOnFailure: true,
      },
    ],
    triggers: [
      {
        eventType: 'requirements-validation.EpicCreated',
        inputMapping: {
          targetId: 'event.epicId',
          targetType: 'event.type',
          description: 'event.description',
          acceptanceCriteria: 'event.acceptanceCriteria',
        },
      },
      {
        eventType: 'requirements-validation.SprintPlanningStarted',
        inputMapping: {
          targetId: 'event.sprintId',
          targetType: 'event.type',
          description: 'event.description',
          acceptanceCriteria: 'event.acceptanceCriteria',
        },
      },
    ],
  };
}
