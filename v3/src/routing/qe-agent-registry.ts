/**
 * QE Agent Registry
 * ADR-022: Adaptive QE Agent Routing
 *
 * Registry of all 78 QE agents with their capabilities, domains, and performance metrics.
 * This registry is used by the QETaskRouter to select the optimal agent for each task.
 */

import type {
  QEAgentProfile,
  AgentCapability,
  ProgrammingLanguage,
  TestFramework,
  ComplexityLevel,
} from './types.js';
import type { QEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an agent profile with defaults
 */
function createAgentProfile(
  partial: Omit<QEAgentProfile, 'performanceScore' | 'tasksCompleted' | 'successRate' | 'avgDurationMs'>
): QEAgentProfile {
  return {
    ...partial,
    performanceScore: 0.7, // Default performance score
    tasksCompleted: 0,
    successRate: 0,
    avgDurationMs: 0,
  };
}

// ============================================================================
// V3 QE Agents (Core Quality Engineering)
// ============================================================================

const v3QEAgents: QEAgentProfile[] = [
  // Test Generation Domain
  createAgentProfile({
    id: 'qe-test-generator',
    name: 'QE Test Generator',
    description: 'AI-powered test generation with sublinear optimization and multi-framework support',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'unit-test', 'integration-test', 'e2e-test', 'tdd', 'bdd'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit', 'go-test'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['ai-powered', 'multi-framework'],
  }),
  createAgentProfile({
    id: 'qe-test-writer',
    name: 'TDD RED Phase Specialist',
    description: 'TDD RED phase specialist - writes failing tests that define expected behavior before implementation',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'unit-test'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['tdd', 'red-phase'],
  }),
  createAgentProfile({
    id: 'qe-test-implementer',
    name: 'TDD GREEN Phase Specialist',
    description: 'TDD GREEN phase specialist - implements minimal code to make failing tests pass',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'unit-test'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['tdd', 'green-phase'],
  }),
  createAgentProfile({
    id: 'qe-test-refactorer',
    name: 'TDD REFACTOR Phase Specialist',
    description: 'TDD REFACTOR phase specialist - improves code quality while keeping all tests passing',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'test-quality'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['tdd', 'refactor-phase'],
  }),
  createAgentProfile({
    id: 'v3-qe-test-architect',
    name: 'V3 QE Test Architect',
    description: 'V3 QE Test Architect for AI-powered test generation strategy, test pyramid design, and cross-framework test orchestration',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'test-orchestration', 'unit-test', 'integration-test', 'e2e-test'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'architect', 'strategy'],
  }),

  // Test Execution Domain
  createAgentProfile({
    id: 'qe-test-executor',
    name: 'QE Test Executor',
    description: 'Multi-framework test executor with parallel execution, retry logic, and real-time reporting',
    domains: ['test-execution'],
    capabilities: ['test-orchestration', 'retry', 'flaky-detection'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit', 'go-test', 'playwright', 'cypress'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['parallel', 'retry', 'reporting'],
  }),
  createAgentProfile({
    id: 'qe-flaky-test-hunter',
    name: 'QE Flaky Test Hunter',
    description: 'Detects, analyzes, and stabilizes flaky tests through pattern recognition and auto-remediation',
    domains: ['test-execution'],
    capabilities: ['flaky-detection', 'test-stability', 'retry'],
    frameworks: ['jest', 'vitest', 'pytest', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['flaky', 'stability', 'remediation'],
  }),
  createAgentProfile({
    id: 'qe-flaky-investigator',
    name: 'QE Flaky Investigator',
    description: 'Detects flaky tests, analyzes root causes, and suggests stabilization fixes',
    domains: ['test-execution'],
    capabilities: ['flaky-detection', 'test-stability'],
    frameworks: ['jest', 'vitest', 'pytest', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['investigation', 'root-cause'],
  }),

  // Coverage Analysis Domain
  createAgentProfile({
    id: 'qe-coverage-analyzer',
    name: 'QE Coverage Analyzer',
    description: 'Coverage gap detection with sublinear algorithms (O(log n) analysis)',
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'sublinear-analysis', 'risk-scoring'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['sublinear', 'gap-detection'],
  }),
  createAgentProfile({
    id: 'qe-coverage-gap-analyzer',
    name: 'QE Coverage Gap Analyzer',
    description: 'Identifies coverage gaps, risk-scores untested code, and recommends tests',
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'risk-scoring'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['gap-analysis', 'recommendations'],
  }),
  createAgentProfile({
    id: 'v3-qe-coverage-specialist',
    name: 'V3 QE Coverage Specialist',
    description: 'V3 QE Coverage Specialist for O(log n) sublinear coverage analysis, risk-weighted gap detection, and intelligent test prioritization',
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'sublinear-analysis', 'risk-scoring', 'branch-coverage'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'sublinear', 'prioritization'],
  }),

  // Quality Assessment Domain
  createAgentProfile({
    id: 'qe-quality-gate',
    name: 'QE Quality Gate',
    description: 'Quality gate decisions with risk assessment and policy validation',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'deployment-readiness', 'risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['gate', 'deployment', 'policy'],
  }),
  createAgentProfile({
    id: 'qe-quality-analyzer',
    name: 'QE Quality Analyzer',
    description: 'Comprehensive quality metrics analysis with trend detection, predictive analytics, and actionable insights',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'risk-scoring'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['metrics', 'trends', 'analytics'],
  }),
  createAgentProfile({
    id: 'qe-deployment-readiness',
    name: 'QE Deployment Readiness',
    description: 'Aggregates quality signals for deployment risk assessment and go/no-go decisions',
    domains: ['quality-assessment'],
    capabilities: ['deployment-readiness', 'quality-gate', 'risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['deployment', 'go-no-go'],
  }),
  createAgentProfile({
    id: 'qe-code-reviewer',
    name: 'QE Code Reviewer',
    description: 'Enforce quality standards, linting, complexity, and security',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['code-review', 'standards'],
  }),
  createAgentProfile({
    id: 'qe-code-complexity',
    name: 'QE Code Complexity',
    description: 'AI-powered code complexity analysis with refactoring recommendations',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'risk-scoring'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['complexity', 'refactoring'],
  }),

  // Security & Compliance Domain
  createAgentProfile({
    id: 'qe-security-scanner',
    name: 'QE Security Scanner',
    description: 'Security scanning with SAST/DAST, vulnerability detection, and compliance validation',
    domains: ['security-compliance'],
    capabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['sast', 'dast', 'owasp'],
  }),
  createAgentProfile({
    id: 'qe-security-auditor',
    name: 'QE Security Auditor',
    description: 'Audits code for security vulnerabilities and compliance',
    domains: ['security-compliance'],
    capabilities: ['sast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['audit', 'compliance'],
  }),

  // API & Contract Testing Domain
  createAgentProfile({
    id: 'qe-api-contract-validator',
    name: 'QE API Contract Validator',
    description: 'Validates API contracts, detects breaking changes, and ensures backward compatibility with consumer-driven contract testing',
    domains: ['contract-testing'],
    capabilities: ['api-testing', 'contract-testing', 'pact', 'openapi'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['contract', 'api', 'pact'],
  }),
  createAgentProfile({
    id: 'qe-integration-tester',
    name: 'QE Integration Tester',
    description: 'Validates component interactions and system integration',
    domains: ['contract-testing'],
    capabilities: ['integration-test', 'api-testing', 'contract-testing'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['integration', 'component'],
  }),

  // Visual & Accessibility Domain
  createAgentProfile({
    id: 'qe-visual-tester',
    name: 'QE Visual Tester',
    description: 'Visual regression testing with AI-powered screenshot comparison and accessibility validation',
    domains: ['visual-accessibility'],
    capabilities: ['visual-regression', 'screenshot', 'percy', 'chromatic', 'wcag', 'aria'],
    frameworks: ['playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['visual', 'regression', 'screenshots'],
  }),
  createAgentProfile({
    id: 'qe-a11y-ally',
    name: 'QE Accessibility Ally',
    description: 'Developer-focused accessibility agent delivering copy-paste ready fixes, WCAG 2.2 compliance, and AI-powered video caption generation',
    domains: ['visual-accessibility'],
    capabilities: ['wcag', 'aria', 'screen-reader', 'contrast'],
    frameworks: ['playwright', 'cypress'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['wcag', 'a11y', 'accessibility'],
  }),

  // Performance Domain
  createAgentProfile({
    id: 'qe-performance-tester',
    name: 'QE Performance Tester',
    description: 'Performance testing with load orchestration and bottleneck detection',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery', 'benchmark'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['load', 'stress', 'performance'],
  }),
  createAgentProfile({
    id: 'qe-performance-validator',
    name: 'QE Performance Validator',
    description: 'Validates performance metrics against SLAs and benchmarks',
    domains: ['chaos-resilience'],
    capabilities: ['benchmark', 'load-testing'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['sla', 'validation', 'benchmark'],
  }),

  // Chaos & Resilience Domain
  createAgentProfile({
    id: 'qe-chaos-engineer',
    name: 'QE Chaos Engineer',
    description: 'Resilience testing with controlled fault injection and blast radius management',
    domains: ['chaos-resilience'],
    capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['chaos', 'fault-injection', 'resilience'],
  }),

  // Test Data Domain
  createAgentProfile({
    id: 'qe-test-data-architect',
    name: 'QE Test Data Architect',
    description: 'Generates realistic, schema-aware test data at 10k+ records/sec with referential integrity and GDPR compliance',
    domains: ['test-generation'],
    capabilities: ['test-data'],
    languages: ['typescript', 'javascript', 'python'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['data', 'generation', 'gdpr'],
  }),
  createAgentProfile({
    id: 'qe-test-data-architect-sub',
    name: 'QE Test Data Architect Sub',
    description: 'Designs and generates high-volume test datasets with relationship preservation',
    domains: ['test-generation'],
    capabilities: ['test-data'],
    languages: ['typescript', 'javascript', 'python'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['data', 'relationships'],
  }),
  createAgentProfile({
    id: 'qe-data-generator',
    name: 'QE Data Generator',
    description: 'Generates realistic test data for various scenarios',
    domains: ['test-generation'],
    capabilities: ['test-data'],
    languages: ['typescript', 'javascript', 'python'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['data', 'generation'],
  }),

  // Code Intelligence Domain
  createAgentProfile({
    id: 'qe-code-intelligence',
    name: 'QE Code Intelligence',
    description: 'Knowledge graph-based code understanding with 80% token reduction via semantic search and AST analysis',
    domains: ['code-intelligence'],
    capabilities: ['coverage-analysis', 'gap-detection'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['knowledge-graph', 'ast', 'semantic'],
  }),

  // Requirements & Defect Domain
  createAgentProfile({
    id: 'qe-requirements-validator',
    name: 'QE Requirements Validator',
    description: 'Validates requirements testability and generates BDD scenarios before development begins',
    domains: ['requirements-validation'],
    capabilities: ['bdd', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['requirements', 'bdd', 'testability'],
  }),
  createAgentProfile({
    id: 'qe-production-intelligence',
    name: 'QE Production Intelligence',
    description: 'Converts production data into test scenarios through incident replay and RUM analysis',
    domains: ['defect-intelligence'],
    capabilities: ['test-generation'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['production', 'incidents', 'rum'],
  }),
  createAgentProfile({
    id: 'qe-regression-risk-analyzer',
    name: 'QE Regression Risk Analyzer',
    description: 'Analyzes code changes to predict regression risk and intelligently select minimal test suites',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring', 'coverage-analysis'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['regression', 'risk', 'selection'],
  }),

  // Fleet & Orchestration Domain
  createAgentProfile({
    id: 'qe-fleet-commander',
    name: 'QE Fleet Commander',
    description: 'Hierarchical fleet coordinator for 50+ agent orchestration with dynamic topology management and resource optimization',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['fleet', 'orchestration', 'coordination'],
  }),
  createAgentProfile({
    id: 'v3-qe-queen-coordinator',
    name: 'V3 QE Queen Coordinator',
    description: 'V3 QE Queen Coordinator for multi-agent concurrent swarm orchestration, quality engineering workflows, and cross-agent coordination',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration', 'quality-gate'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'queen', 'swarm'],
  }),
  createAgentProfile({
    id: 'qx-partner',
    name: 'QX Partner',
    description: 'Quality Experience (QX) analysis combining QA advocacy and UX perspectives to co-create quality for all stakeholders',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['qx', 'ux', 'advocacy'],
  }),
];

// ============================================================================
// n8n Workflow Testing Agents
// ============================================================================

const n8nAgents: QEAgentProfile[] = [
  createAgentProfile({
    id: 'n8n-base-agent',
    name: 'n8n Base Agent',
    description: 'Abstract base agent for n8n workflow automation testing - provides common utilities for all n8n testing agents',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'test-orchestration'],
    complexity: { min: 'simple', max: 'simple' },
    tags: ['n8n', 'base', 'workflow'],
  }),
  createAgentProfile({
    id: 'n8n-workflow-executor',
    name: 'n8n Workflow Executor',
    description: 'Execute and validate n8n workflows programmatically with test data injection, output assertions, and data flow validation',
    domains: ['test-execution'],
    capabilities: ['test-orchestration', 'integration-test'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'execution', 'validation'],
  }),
  createAgentProfile({
    id: 'n8n-unit-tester',
    name: 'n8n Unit Tester',
    description: 'Unit test custom n8n node functions with Jest/Vitest integration, function isolation, mock data injection, and coverage reporting',
    domains: ['test-generation'],
    capabilities: ['unit-test', 'test-generation'],
    frameworks: ['jest', 'vitest'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['n8n', 'unit', 'isolation'],
  }),
  createAgentProfile({
    id: 'n8n-integration-test',
    name: 'n8n Integration Tester',
    description: 'Test n8n node integrations with external services including API contract validation, authentication flows, rate limiting, and error handling',
    domains: ['contract-testing'],
    capabilities: ['integration-test', 'api-testing', 'contract-testing'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'integration', 'api'],
  }),
  createAgentProfile({
    id: 'n8n-trigger-test',
    name: 'n8n Trigger Tester',
    description: 'Test n8n workflow triggers including webhooks, schedules, polling triggers, and event-driven activation',
    domains: ['test-execution'],
    capabilities: ['integration-test', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'triggers', 'webhooks'],
  }),
  createAgentProfile({
    id: 'n8n-node-validator',
    name: 'n8n Node Validator',
    description: 'Validate n8n node configurations, connections, data mappings, and conditional routing logic',
    domains: ['contract-testing'],
    capabilities: ['contract-testing', 'test-generation'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['n8n', 'validation', 'nodes'],
  }),
  createAgentProfile({
    id: 'n8n-performance-tester',
    name: 'n8n Performance Tester',
    description: 'Load and stress testing for n8n workflows using k6/Artillery with execution time analysis, rate limit testing, and bottleneck detection',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery', 'benchmark'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'performance', 'load'],
  }),
  createAgentProfile({
    id: 'n8n-security-auditor',
    name: 'n8n Security Auditor',
    description: 'Security vulnerability scanning for n8n workflows including credential exposure, injection risks, OWASP compliance, and secret detection',
    domains: ['security-compliance'],
    capabilities: ['sast', 'vulnerability', 'owasp', 'security-scanning'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'security', 'owasp'],
  }),
  createAgentProfile({
    id: 'n8n-compliance-validator',
    name: 'n8n Compliance Validator',
    description: 'Regulatory compliance testing for n8n workflows including GDPR, CCPA, HIPAA, SOC2, and PCI-DSS validation',
    domains: ['security-compliance'],
    capabilities: ['security-scanning'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'compliance', 'gdpr'],
  }),
  createAgentProfile({
    id: 'n8n-bdd-scenario-tester',
    name: 'n8n BDD Scenario Tester',
    description: 'BDD/Gherkin scenario testing for n8n workflows with Cucumber integration, business requirement mapping, and stakeholder-friendly reports',
    domains: ['requirements-validation'],
    capabilities: ['bdd', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'bdd', 'gherkin'],
  }),
  createAgentProfile({
    id: 'n8n-expression-validator',
    name: 'n8n Expression Validator',
    description: 'Validate n8n expressions and data transformations with syntax checking, context-aware testing, and security analysis',
    domains: ['code-intelligence'],
    capabilities: ['test-generation', 'security-scanning'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['n8n', 'expressions', 'validation'],
  }),
  createAgentProfile({
    id: 'n8n-version-comparator',
    name: 'n8n Version Comparator',
    description: 'Workflow version diff and regression detection with JSON comparison, change impact analysis, migration validation, and rollback testing',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'version', 'diff'],
  }),
  createAgentProfile({
    id: 'n8n-chaos-tester',
    name: 'n8n Chaos Tester',
    description: 'Chaos engineering for n8n workflows with controlled fault injection, service failure simulation, recovery validation, and resilience testing',
    domains: ['chaos-resilience'],
    capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['n8n', 'chaos', 'resilience'],
  }),
  createAgentProfile({
    id: 'n8n-ci-orchestrator',
    name: 'n8n CI Orchestrator',
    description: 'CI/CD pipeline integration for n8n workflows with REST API triggers, automated regression testing, GitHub Actions/Jenkins integration, and test scheduling',
    domains: ['test-execution'],
    capabilities: ['test-orchestration', 'integration-test'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'ci', 'cd'],
  }),
  createAgentProfile({
    id: 'n8n-monitoring-validator',
    name: 'n8n Monitoring Validator',
    description: 'Validate monitoring and alerting configurations for n8n workflows including error tracking, alert rules, SLA compliance, and observability checks',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'deployment-readiness'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['n8n', 'monitoring', 'alerting'],
  }),
];

// ============================================================================
// General Purpose Agents (with QE capabilities)
// ============================================================================

const generalAgents: QEAgentProfile[] = [
  createAgentProfile({
    id: 'tester',
    name: 'Tester',
    description: 'Comprehensive testing and quality assurance specialist with AI-powered test generation',
    domains: ['test-generation', 'test-execution'],
    capabilities: ['test-generation', 'unit-test', 'integration-test', 'e2e-test'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
    frameworks: ['jest', 'vitest', 'mocha', 'pytest', 'junit', 'go-test', 'rust-test', 'playwright', 'cypress'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['general', 'versatile'],
  }),
  createAgentProfile({
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Code review and quality assurance specialist with AI-powered pattern detection',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['general', 'code-review'],
  }),
  createAgentProfile({
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Advanced security auditor with self-learning vulnerability detection, CVE database search, and compliance auditing',
    domains: ['security-compliance'],
    capabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['security', 'cve', 'compliance'],
  }),
  createAgentProfile({
    id: 'security-architect',
    name: 'Security Architect',
    description: 'V3 Security Architecture specialist with ReasoningBank learning, HNSW threat pattern search, and zero-trust design capabilities',
    domains: ['security-compliance'],
    capabilities: ['sast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['architecture', 'zero-trust'],
  }),
  createAgentProfile({
    id: 'performance-engineer',
    name: 'Performance Engineer',
    description: 'V3 Performance Engineering Agent specialized in Flash Attention optimization, WASM SIMD acceleration, and comprehensive performance profiling',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'benchmark'],
    languages: ['typescript', 'javascript', 'python', 'go', 'rust'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['performance', 'optimization'],
  }),
  createAgentProfile({
    id: 'code-analyzer',
    name: 'Code Analyzer',
    description: 'Advanced code quality analysis agent for comprehensive code reviews and improvements',
    domains: ['code-intelligence', 'quality-assessment'],
    capabilities: ['coverage-analysis', 'gap-detection', 'quality-gate'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go', 'rust'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['analysis', 'quality'],
  }),
  createAgentProfile({
    id: 'cicd-engineer',
    name: 'CI/CD Engineer',
    description: 'Specialized agent for GitHub Actions CI/CD pipeline creation and optimization',
    domains: ['test-execution'],
    capabilities: ['test-orchestration', 'deployment-readiness'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['cicd', 'github-actions'],
  }),
];

// ============================================================================
// V3 Specialized Agents
// ============================================================================

const v3SpecializedAgents: QEAgentProfile[] = [
  createAgentProfile({
    id: 'reasoningbank-learner',
    name: 'ReasoningBank Learner',
    description: 'V3 ReasoningBank integration specialist for trajectory tracking, verdict judgment, pattern distillation, and experience replay using HNSW-indexed memory',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'reasoningbank', 'learning'],
  }),
  createAgentProfile({
    id: 'adr-architect',
    name: 'ADR Architect',
    description: 'V3 Architecture Decision Record specialist that documents, tracks, and enforces architectural decisions with ReasoningBank integration for pattern learning',
    domains: ['learning-optimization'],
    capabilities: ['quality-gate'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'adr', 'architecture'],
  }),
  createAgentProfile({
    id: 'ddd-domain-expert',
    name: 'DDD Domain Expert',
    description: 'V3 Domain-Driven Design specialist for bounded context identification, aggregate design, domain modeling, and ubiquitous language enforcement',
    domains: ['code-intelligence'],
    capabilities: ['quality-gate'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'ddd', 'domain'],
  }),
  createAgentProfile({
    id: 'v3-integration-architect',
    name: 'V3 Integration Architect',
    description: 'V3 deep agentic-flow integration specialist implementing ADR-001 for eliminating duplicate code and building claude-flow as a specialized extension',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'integration', 'agentic-flow'],
  }),
  createAgentProfile({
    id: 'memory-specialist',
    name: 'Memory Specialist',
    description: 'V3 memory optimization specialist with HNSW indexing, hybrid backend management, vector quantization, and EWC++ for preventing catastrophic forgetting',
    domains: ['learning-optimization'],
    capabilities: ['sublinear-analysis'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'memory', 'hnsw'],
  }),
  createAgentProfile({
    id: 'claims-authorizer',
    name: 'Claims Authorizer',
    description: 'V3 Claims-based authorization specialist implementing ADR-010 for fine-grained access control across swarm agents and MCP tools',
    domains: ['security-compliance'],
    capabilities: ['security-scanning'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'claims', 'authorization'],
  }),
  createAgentProfile({
    id: 'sparc-orchestrator',
    name: 'SPARC Orchestrator',
    description: 'V3 SPARC methodology orchestrator that coordinates Specification, Pseudocode, Architecture, Refinement, and Completion phases with ReasoningBank learning',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'sparc', 'methodology'],
  }),
  createAgentProfile({
    id: 'sona-learning-optimizer',
    name: 'SONA Learning Optimizer',
    description: 'V3 SONA-powered self-optimizing agent using claude-flow neural tools for adaptive learning, pattern discovery, and continuous quality improvement with sub-millisecond overhead',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'sona', 'self-learning'],
  }),
  createAgentProfile({
    id: 'safla-neural',
    name: 'SAFLA Neural',
    description: 'Self-Aware Feedback Loop Algorithm (SAFLA) neural specialist that creates intelligent, memory-persistent AI systems with self-learning capabilities',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'safla', 'neural'],
  }),
  createAgentProfile({
    id: 'production-validator',
    name: 'Production Validator',
    description: 'Production validation specialist ensuring applications are fully implemented and deployment-ready',
    domains: ['quality-assessment'],
    capabilities: ['deployment-readiness', 'quality-gate'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['production', 'validation'],
  }),
  createAgentProfile({
    id: 'tdd-london-swarm',
    name: 'TDD London Swarm',
    description: 'TDD London School specialist for mock-driven development within swarm coordination',
    domains: ['test-generation'],
    capabilities: ['tdd', 'unit-test', 'test-generation'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['tdd', 'london', 'mocks'],
  }),
];

// ============================================================================
// Swarm & Coordination Agents
// ============================================================================

const swarmAgents: QEAgentProfile[] = [
  createAgentProfile({
    id: 'queen-coordinator',
    name: 'Queen Coordinator',
    description: 'The sovereign orchestrator of hierarchical hive operations, managing strategic decisions, resource allocation, and maintaining hive coherence',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['queen', 'hive', 'orchestration'],
  }),
  createAgentProfile({
    id: 'swarm-memory-manager',
    name: 'Swarm Memory Manager',
    description: 'V3 distributed memory manager for cross-agent state synchronization, CRDT replication, and namespace coordination across the swarm',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['swarm', 'memory', 'crdt'],
  }),
  createAgentProfile({
    id: 'worker-specialist',
    name: 'Worker Specialist',
    description: 'Dedicated task execution specialist that carries out assigned work with precision, continuously reporting progress through memory coordination',
    domains: ['test-execution'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['worker', 'execution'],
  }),
  createAgentProfile({
    id: 'collective-intelligence-coordinator',
    name: 'Collective Intelligence Coordinator',
    description: 'Hive-mind collective decision making with Byzantine fault-tolerant consensus, attention-based coordination, and emergent intelligence patterns',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['collective', 'consensus'],
  }),
  createAgentProfile({
    id: 'scout-explorer',
    name: 'Scout Explorer',
    description: 'Information reconnaissance specialist that explores unknown territories, gathers intelligence, and reports findings to the hive mind',
    domains: ['code-intelligence'],
    capabilities: ['coverage-analysis', 'gap-detection'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['scout', 'exploration'],
  }),
  createAgentProfile({
    id: 'adaptive-coordinator',
    name: 'Adaptive Coordinator',
    description: 'Dynamic topology switching coordinator with self-organizing swarm patterns and real-time optimization',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['adaptive', 'topology'],
  }),
  createAgentProfile({
    id: 'mesh-coordinator',
    name: 'Mesh Coordinator',
    description: 'Peer-to-peer mesh network swarm with distributed decision making and fault tolerance',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration', 'resilience'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['mesh', 'p2p'],
  }),
  createAgentProfile({
    id: 'hierarchical-coordinator',
    name: 'Hierarchical Coordinator',
    description: 'Queen-led hierarchical swarm coordination with specialized worker delegation',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['hierarchical', 'delegation'],
  }),
];

// ============================================================================
// Consensus Agents
// ============================================================================

const consensusAgents: QEAgentProfile[] = [
  createAgentProfile({
    id: 'consensus-coordinator',
    name: 'Consensus Coordinator',
    description: 'Distributed consensus agent that uses sublinear solvers for fast agreement protocols in multi-agent systems',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration', 'resilience'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['consensus', 'distributed'],
  }),
  createAgentProfile({
    id: 'byzantine-coordinator',
    name: 'Byzantine Coordinator',
    description: 'Coordinates Byzantine fault-tolerant consensus protocols with malicious actor detection',
    domains: ['security-compliance'],
    capabilities: ['resilience', 'security-scanning'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['byzantine', 'fault-tolerance'],
  }),
  createAgentProfile({
    id: 'raft-manager',
    name: 'Raft Manager',
    description: 'Manages Raft consensus algorithm with leader election and log replication',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration', 'resilience'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['raft', 'leader-election'],
  }),
  createAgentProfile({
    id: 'crdt-synchronizer',
    name: 'CRDT Synchronizer',
    description: 'Implements Conflict-free Replicated Data Types for eventually consistent state synchronization',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['crdt', 'eventual-consistency'],
  }),
];

// ============================================================================
// Registry Export
// ============================================================================

/**
 * All QE agents in the registry
 */
export const QE_AGENT_REGISTRY: readonly QEAgentProfile[] = Object.freeze([
  ...v3QEAgents,
  ...n8nAgents,
  ...generalAgents,
  ...v3SpecializedAgents,
  ...swarmAgents,
  ...consensusAgents,
]);

/**
 * Get all agents for a specific domain
 */
export function getAgentsByDomain(domain: QEDomain): QEAgentProfile[] {
  return QE_AGENT_REGISTRY.filter(agent => agent.domains.includes(domain));
}

/**
 * Get all agents with a specific capability
 */
export function getAgentsByCapability(capability: AgentCapability): QEAgentProfile[] {
  return QE_AGENT_REGISTRY.filter(agent => agent.capabilities.includes(capability));
}

/**
 * Get all agents that support a specific language
 */
export function getAgentsByLanguage(language: ProgrammingLanguage): QEAgentProfile[] {
  return QE_AGENT_REGISTRY.filter(agent => agent.languages?.includes(language));
}

/**
 * Get all agents that support a specific framework
 */
export function getAgentsByFramework(framework: TestFramework): QEAgentProfile[] {
  return QE_AGENT_REGISTRY.filter(agent => agent.frameworks?.includes(framework));
}

/**
 * Get all agents that can handle a specific complexity level
 */
export function getAgentsByComplexity(complexity: ComplexityLevel): QEAgentProfile[] {
  const complexityOrder: Record<ComplexityLevel, number> = {
    simple: 0,
    medium: 1,
    complex: 2,
  };

  return QE_AGENT_REGISTRY.filter(agent => {
    const minOrder = complexityOrder[agent.complexity.min];
    const maxOrder = complexityOrder[agent.complexity.max];
    const targetOrder = complexityOrder[complexity];
    return targetOrder >= minOrder && targetOrder <= maxOrder;
  });
}

/**
 * Get an agent by ID
 */
export function getAgentById(id: string): QEAgentProfile | undefined {
  return QE_AGENT_REGISTRY.find(agent => agent.id === id);
}

/**
 * Get agent count by category
 */
export function getAgentCounts(): {
  v3QE: number;
  n8n: number;
  general: number;
  v3Specialized: number;
  swarm: number;
  consensus: number;
  total: number;
} {
  return {
    v3QE: v3QEAgents.length,
    n8n: n8nAgents.length,
    general: generalAgents.length,
    v3Specialized: v3SpecializedAgents.length,
    swarm: swarmAgents.length,
    consensus: consensusAgents.length,
    total: QE_AGENT_REGISTRY.length,
  };
}
