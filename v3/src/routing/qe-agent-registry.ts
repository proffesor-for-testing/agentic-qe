/**
 * QE Agent Registry
 * ADR-022: Adaptive QE Agent Routing
 * ADR-037: V3 QE Agent Naming Standardization
 *
 * Registry of all 90+ QE agents with their capabilities, domains, and performance metrics.
 * This registry is used by the QETaskRouter to select the optimal agent for each task.
 *
 * Agent Categories:
 * - V3 QE Agents (49): Core quality engineering agents with v3-qe-* prefix (including SFDIPOT assessor and test idea rewriter)
 * - V3 QE Subagents (7): Specialized QE subagents with v3-qe-* prefix
 * - n8n Agents (15): n8n workflow testing agents
 * - General Agents (7): Versatile general-purpose agents
 * - V3 Specialized (12): Advanced v3-specific agents (no v3-qe prefix)
 * - Swarm Agents (8): Multi-agent coordination
 * - Consensus Agents (4): Distributed consensus protocols
 *
 * Naming Convention:
 * - V3 QE Domain Agents: v3-qe-{domain}-{specialty} (e.g., v3-qe-test-architect)
 * - V3 QE Subagents: v3-qe-{domain}-{subagent-type} (e.g., v3-qe-tdd-red)
 * - V3 Specialized: {name} (cross-cutting, no v3-qe prefix, e.g., memory-specialist)
 * - Legacy/V2 Compatibility: qe-* (deprecated, use v3-qe-* instead)
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
// ADR-037: All V3 QE domain agents use v3-qe-* prefix
// ============================================================================

const v3QEAgents: QEAgentProfile[] = [
  // Test Generation Domain
  createAgentProfile({
    id: 'v3-qe-tdd-specialist',
    name: 'V3 QE TDD Specialist',
    description: 'V3 QE TDD specialist covering RED, GREEN, REFACTOR phases with comprehensive test-driven development support',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'unit-test', 'test-quality'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['v3', 'tdd', 'red-green-refactor'],
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
    id: 'v3-qe-parallel-executor',
    name: 'V3 QE Parallel Executor',
    description: 'V3 QE Parallel test executor with intelligent sharding, worker pool management, retry logic, and real-time reporting',
    domains: ['test-execution'],
    capabilities: ['test-orchestration', 'retry', 'flaky-detection'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit', 'go-test', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'parallel', 'retry', 'sharding'],
  }),
  createAgentProfile({
    id: 'v3-qe-flaky-hunter',
    name: 'V3 QE Flaky Hunter',
    description: 'V3 QE Flaky test detection and stabilization through pattern recognition, auto-remediation, and retry orchestration',
    domains: ['test-execution'],
    capabilities: ['flaky-detection', 'test-stability', 'retry'],
    frameworks: ['jest', 'vitest', 'pytest', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'flaky', 'stability', 'remediation'],
  }),
  createAgentProfile({
    id: 'v3-qe-retry-handler',
    name: 'V3 QE Retry Handler',
    description: 'V3 QE Intelligent retry handler with adaptive backoff, circuit breakers, and failure classification',
    domains: ['test-execution'],
    capabilities: ['retry', 'test-stability'],
    frameworks: ['jest', 'vitest', 'pytest', 'playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'retry', 'adaptive-backoff'],
  }),

  // Coverage Analysis Domain
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
  createAgentProfile({
    id: 'v3-qe-gap-detector',
    name: 'V3 QE Gap Detector',
    description: 'V3 QE Coverage gap detection with sublinear algorithms (O(log n) analysis), risk scoring, and intelligent test recommendations',
    domains: ['coverage-analysis'],
    capabilities: ['coverage-analysis', 'gap-detection', 'sublinear-analysis', 'risk-scoring'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'sublinear', 'gap-detection'],
  }),

  // Quality Assessment Domain
  createAgentProfile({
    id: 'v3-qe-quality-gate',
    name: 'V3 QE Quality Gate',
    description: 'V3 QE Quality gate enforcement with risk assessment, policy validation, and deployment readiness evaluation',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'deployment-readiness', 'risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'gate', 'deployment', 'policy'],
  }),
  createAgentProfile({
    id: 'v3-qe-deployment-advisor',
    name: 'V3 QE Deployment Advisor',
    description: 'V3 QE Aggregates quality signals for deployment risk assessment and go/no-go decisions with predictive analytics',
    domains: ['quality-assessment'],
    capabilities: ['deployment-readiness', 'quality-gate', 'risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'deployment', 'go-no-go', 'analytics'],
  }),
  createAgentProfile({
    id: 'v3-qe-code-complexity',
    name: 'V3 QE Code Complexity',
    description: 'V3 QE AI-powered code complexity analysis with refactoring recommendations and technical debt tracking',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'risk-scoring'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['v3', 'complexity', 'refactoring', 'debt'],
  }),
  createAgentProfile({
    id: 'v3-qe-qx-partner',
    name: 'V3 QE QX Partner',
    description: 'V3 QE Quality Experience (QX) analysis combining QA advocacy and UX perspectives to co-create quality for all stakeholders',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'qx', 'ux', 'advocacy'],
  }),

  // Security & Compliance Domain
  createAgentProfile({
    id: 'v3-qe-security-scanner',
    name: 'V3 QE Security Scanner',
    description: 'V3 QE Security scanning with SAST/DAST, vulnerability detection, OWASP compliance, and threat modeling',
    domains: ['security-compliance'],
    capabilities: ['sast', 'dast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'sast', 'dast', 'owasp'],
  }),
  createAgentProfile({
    id: 'v3-qe-security-auditor',
    name: 'V3 QE Security Auditor',
    description: 'V3 QE Security audits for vulnerabilities, compliance validation, and security best practices enforcement',
    domains: ['security-compliance'],
    capabilities: ['sast', 'vulnerability', 'owasp', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'audit', 'compliance'],
  }),

  // API & Contract Testing Domain
  createAgentProfile({
    id: 'v3-qe-contract-validator',
    name: 'V3 QE Contract Validator',
    description: 'V3 QE API contract validation, breaking change detection, and backward compatibility with consumer-driven contract testing',
    domains: ['contract-testing'],
    capabilities: ['api-testing', 'contract-testing', 'pact', 'openapi'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'contract', 'api', 'pact'],
  }),
  createAgentProfile({
    id: 'v3-qe-integration-tester',
    name: 'V3 QE Integration Tester',
    description: 'V3 QE Validates component interactions and system integration with comprehensive test scenarios',
    domains: ['contract-testing'],
    capabilities: ['integration-test', 'api-testing', 'contract-testing'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    frameworks: ['jest', 'vitest', 'pytest', 'junit'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'integration', 'component'],
  }),
  createAgentProfile({
    id: 'v3-qe-graphql-tester',
    name: 'V3 QE GraphQL Tester',
    description: 'V3 QE GraphQL API testing with schema validation, query/mutation testing, and security analysis',
    domains: ['contract-testing'],
    capabilities: ['api-testing', 'contract-testing', 'graphql'],
    languages: ['typescript', 'javascript', 'python'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'graphql', 'api'],
  }),

  // Visual & Accessibility Domain
  createAgentProfile({
    id: 'v3-qe-visual-tester',
    name: 'V3 QE Visual Tester',
    description: 'V3 QE Visual regression testing with AI-powered screenshot comparison and accessibility validation',
    domains: ['visual-accessibility'],
    capabilities: ['visual-regression', 'screenshot', 'percy', 'chromatic', 'wcag', 'aria'],
    frameworks: ['playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'visual', 'regression', 'screenshots'],
  }),
  createAgentProfile({
    id: 'v3-qe-accessibility-auditor',
    name: 'V3 QE Accessibility Auditor',
    description: 'V3 QE Accessibility testing with WCAG 2.2 compliance, screen reader validation, and copy-paste ready fixes',
    domains: ['visual-accessibility'],
    capabilities: ['wcag', 'aria', 'screen-reader', 'contrast'],
    frameworks: ['playwright', 'cypress'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['v3', 'wcag', 'a11y', 'accessibility'],
  }),
  createAgentProfile({
    id: 'v3-qe-responsive-tester',
    name: 'V3 QE Responsive Tester',
    description: 'V3 QE Responsive design testing across viewports, devices, and breakpoints with layout regression detection',
    domains: ['visual-accessibility'],
    capabilities: ['visual-regression'],
    frameworks: ['playwright', 'cypress'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'responsive', 'viewport', 'breakpoints'],
  }),

  // Performance & Chaos Domain
  createAgentProfile({
    id: 'v3-qe-performance-tester',
    name: 'V3 QE Performance Tester',
    description: 'V3 QE Performance testing with load orchestration, bottleneck detection, and SLA validation',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery', 'benchmark'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'load', 'stress', 'performance'],
  }),
  createAgentProfile({
    id: 'v3-qe-load-tester',
    name: 'V3 QE Load Tester',
    description: 'V3 QE Load and stress testing with execution time analysis, rate limit testing, and bottleneck detection',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'stress-testing', 'k6', 'artillery'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'load', 'stress', 'k6'],
  }),
  createAgentProfile({
    id: 'v3-qe-chaos-engineer',
    name: 'V3 QE Chaos Engineer',
    description: 'V3 QE Resilience testing with controlled fault injection, blast radius management, and recovery validation',
    domains: ['chaos-resilience'],
    capabilities: ['chaos-testing', 'resilience', 'fault-injection'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'chaos', 'fault-injection', 'resilience'],
  }),

  // Code Intelligence Domain
  createAgentProfile({
    id: 'v3-qe-code-intelligence',
    name: 'V3 QE Code Intelligence',
    description: 'V3 QE Knowledge graph-based code understanding with semantic search and AST analysis',
    domains: ['code-intelligence'],
    capabilities: ['coverage-analysis', 'gap-detection'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'knowledge-graph', 'ast', 'semantic'],
  }),
  createAgentProfile({
    id: 'v3-qe-dependency-mapper',
    name: 'V3 QE Dependency Mapper',
    description: 'V3 QE Dependency graph analysis with coupling metrics and security advisories',
    domains: ['code-intelligence'],
    capabilities: ['coverage-analysis', 'gap-detection'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'dependency', 'graph'],
  }),
  createAgentProfile({
    id: 'v3-qe-kg-builder',
    name: 'V3 QE Knowledge Graph Builder',
    description: 'V3 QE Knowledge graph construction with entity extraction and relationship inference',
    domains: ['code-intelligence'],
    capabilities: ['coverage-analysis', 'gap-detection'],
    languages: ['typescript', 'javascript', 'python'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'knowledge-graph', 'entity-extraction'],
  }),

  // Requirements & Defect Intelligence Domain
  createAgentProfile({
    id: 'v3-qe-requirements-validator',
    name: 'V3 QE Requirements Validator',
    description: 'V3 QE Validates requirements testability and generates BDD scenarios with testability scoring',
    domains: ['requirements-validation'],
    capabilities: ['bdd', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'requirements', 'bdd', 'testability'],
  }),
  createAgentProfile({
    id: 'v3-qe-bdd-generator',
    name: 'V3 QE BDD Generator',
    description: 'V3 QE BDD scenario generation with Gherkin syntax, example discovery, and step definition mapping',
    domains: ['requirements-validation'],
    capabilities: ['bdd', 'test-generation'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'bdd', 'gherkin', 'cucumber'],
  }),
  createAgentProfile({
    id: 'v3-qe-product-factors-assessor',
    name: 'V3 QE Product Factors Assessor',
    description: 'V3 QE SFDIPOT product factors analysis using James Bach\'s HTSM framework for comprehensive test strategy generation with prioritized test ideas (P0-P3) and automation fitness recommendations',
    domains: ['requirements-validation'],
    capabilities: ['bdd', 'test-generation', 'risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'sfdipot', 'htsm', 'product-factors', 'james-bach'],
  }),
  createAgentProfile({
    id: 'v3-qe-test-idea-rewriter',
    name: 'V3 QE Test Idea Rewriter',
    description: 'V3 QE Transform passive "Verify X" test descriptions into active, observable test actions using action verbs for clearer, more testable descriptions',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'test-quality'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['v3', 'test-ideas', 'rewriting', 'action-verbs', 'quality'],
  }),
  createAgentProfile({
    id: 'v3-qe-defect-predictor',
    name: 'V3 QE Defect Predictor',
    description: 'V3 QE AI-powered defect prediction using historical data and code metrics',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring', 'coverage-analysis'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'defect', 'prediction', 'ml'],
  }),
  createAgentProfile({
    id: 'v3-qe-root-cause-analyzer',
    name: 'V3 QE Root Cause Analyzer',
    description: 'V3 QE Systematic root cause analysis for test failures with prevention recommendations',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'root-cause', 'failure-analysis'],
  }),
  createAgentProfile({
    id: 'v3-qe-regression-analyzer',
    name: 'V3 QE Regression Analyzer',
    description: 'V3 QE Analyzes code changes to predict regression risk and intelligently select minimal test suites',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring', 'coverage-analysis'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'regression', 'risk', 'selection'],
  }),
  createAgentProfile({
    id: 'v3-qe-impact-analyzer',
    name: 'V3 QE Impact Analyzer',
    description: 'V3 QE Change impact analysis with blast radius calculation and test selection',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring', 'coverage-analysis'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'impact', 'blast-radius'],
  }),
  createAgentProfile({
    id: 'v3-qe-risk-assessor',
    name: 'V3 QE Risk Assessor',
    description: 'V3 QE Quality risk assessment with multi-factor scoring and mitigation recommendations',
    domains: ['defect-intelligence'],
    capabilities: ['risk-scoring'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'risk', 'assessment'],
  }),

  // Learning & Optimization Domain
  createAgentProfile({
    id: 'v3-qe-learning-coordinator',
    name: 'V3 QE Learning Coordinator',
    description: 'V3 QE Fleet-wide learning coordination with pattern recognition and knowledge synthesis',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'learning', 'coordination', 'patterns'],
  }),
  createAgentProfile({
    id: 'v3-qe-pattern-learner',
    name: 'V3 QE Pattern Learner',
    description: 'V3 QE Pattern discovery and learning from QE activities for test generation and defect prediction',
    domains: ['learning-optimization'],
    capabilities: ['test-generation', 'risk-scoring'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'pattern', 'learning', 'ml'],
  }),
  createAgentProfile({
    id: 'v3-qe-transfer-specialist',
    name: 'V3 QE Transfer Specialist',
    description: 'V3 QE Knowledge transfer learning with domain adaptation and knowledge distillation',
    domains: ['learning-optimization'],
    capabilities: ['test-generation'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'transfer', 'learning', 'adaptation'],
  }),
  createAgentProfile({
    id: 'v3-qe-metrics-optimizer',
    name: 'V3 QE Metrics Optimizer',
    description: 'V3 QE Learning metrics optimization with hyperparameter tuning and A/B testing',
    domains: ['learning-optimization'],
    capabilities: ['quality-gate'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'metrics', 'optimization', 'tuning'],
  }),
  createAgentProfile({
    id: 'v3-qe-fleet-commander',
    name: 'V3 QE Fleet Commander',
    description: 'V3 QE Hierarchical fleet coordinator for 50+ agent orchestration with dynamic topology management and resource optimization',
    domains: ['learning-optimization'],
    capabilities: ['test-orchestration'],
    complexity: { min: 'complex', max: 'complex' },
    tags: ['v3', 'fleet', 'orchestration', 'coordination'],
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

  // Property-Based & Mutation Testing
  createAgentProfile({
    id: 'v3-qe-property-tester',
    name: 'V3 QE Property Tester',
    description: 'V3 QE Property-based testing with fast-check for edge case discovery through randomized input generation',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'unit-test'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'mocha'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'property', 'pbt', 'edge-cases'],
  }),
  createAgentProfile({
    id: 'v3-qe-mutation-tester',
    name: 'V3 QE Mutation Tester',
    description: 'V3 QE Mutation testing for test suite effectiveness evaluation with mutation score analysis',
    domains: ['test-generation'],
    capabilities: ['test-quality', 'coverage-analysis'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'mutation', 'test-quality'],
  }),
];

// ============================================================================
// V3 QE Subagents (Specialized QE Subagents)
// ADR-037: V3 QE subagents use v3-qe-* prefix for consistency
// ============================================================================

const v3QESubagents: QEAgentProfile[] = [
  // TDD Phase Subagents
  createAgentProfile({
    id: 'v3-qe-tdd-red',
    name: 'V3 QE TDD RED Phase',
    description: 'V3 QE TDD RED phase specialist - writes failing tests that define expected behavior before implementation',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'unit-test'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['v3', 'tdd', 'red-phase', 'subagent'],
  }),
  createAgentProfile({
    id: 'v3-qe-tdd-green',
    name: 'V3 QE TDD GREEN Phase',
    description: 'V3 QE TDD GREEN phase specialist - implements minimal code to make failing tests pass',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'unit-test'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'simple', max: 'medium' },
    tags: ['v3', 'tdd', 'green-phase', 'subagent'],
  }),
  createAgentProfile({
    id: 'v3-qe-tdd-refactor',
    name: 'V3 QE TDD REFACTOR Phase',
    description: 'V3 QE TDD REFACTOR phase specialist - improves code quality while keeping all tests passing',
    domains: ['test-generation'],
    capabilities: ['test-generation', 'tdd', 'test-quality'],
    languages: ['typescript', 'javascript', 'python'],
    frameworks: ['jest', 'vitest', 'pytest'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'tdd', 'refactor-phase', 'subagent'],
  }),

  // Review Subagents
  createAgentProfile({
    id: 'v3-qe-code-reviewer',
    name: 'V3 QE Code Reviewer',
    description: 'V3 QE Code review specialist enforcing quality standards, linting, complexity, and security',
    domains: ['quality-assessment'],
    capabilities: ['quality-gate', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'simple', max: 'complex' },
    tags: ['v3', 'code-review', 'standards', 'subagent'],
  }),
  createAgentProfile({
    id: 'v3-qe-integration-reviewer',
    name: 'V3 QE Integration Reviewer',
    description: 'V3 QE Integration review specialist for API compatibility and cross-service interactions',
    domains: ['contract-testing'],
    capabilities: ['integration-test', 'api-testing'],
    languages: ['typescript', 'javascript', 'python', 'java'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'integration', 'review', 'subagent'],
  }),
  createAgentProfile({
    id: 'v3-qe-performance-reviewer',
    name: 'V3 QE Performance Reviewer',
    description: 'V3 QE Performance review specialist for algorithmic complexity and resource usage',
    domains: ['chaos-resilience'],
    capabilities: ['load-testing', 'benchmark'],
    languages: ['typescript', 'javascript', 'python', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'performance', 'review', 'subagent'],
  }),
  createAgentProfile({
    id: 'v3-qe-security-reviewer',
    name: 'V3 QE Security Reviewer',
    description: 'V3 QE Security review specialist for vulnerability detection and secure coding practices',
    domains: ['security-compliance'],
    capabilities: ['sast', 'vulnerability', 'security-scanning'],
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    complexity: { min: 'medium', max: 'complex' },
    tags: ['v3', 'security', 'review', 'subagent'],
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
  ...v3QESubagents,
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
  v3QESubagents: number;
  n8n: number;
  general: number;
  v3Specialized: number;
  swarm: number;
  consensus: number;
  total: number;
} {
  return {
    v3QE: v3QEAgents.length,
    v3QESubagents: v3QESubagents.length,
    n8n: n8nAgents.length,
    general: generalAgents.length,
    v3Specialized: v3SpecializedAgents.length,
    swarm: swarmAgents.length,
    consensus: consensusAgents.length,
    total: QE_AGENT_REGISTRY.length,
  };
}
