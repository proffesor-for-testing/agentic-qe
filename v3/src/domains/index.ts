/**
 * Agentic QE v3 - Domain Exports
 *
 * Note: Each domain is exported as a namespace to avoid name collisions
 * between domains that may have similarly named types.
 */

// Base domain interface
export * from './domain-interface';

// Domain-specific interfaces exported as namespaces
export * as TestGeneration from './test-generation/interfaces';
export * as TestExecution from './test-execution/interfaces';
export * as CoverageAnalysis from './coverage-analysis/interfaces';
export * as QualityAssessment from './quality-assessment/interfaces';
export * as DefectIntelligence from './defect-intelligence/interfaces';
export * as CodeIntelligence from './code-intelligence/interfaces';
export * as RequirementsValidation from './requirements-validation/interfaces';
export * as SecurityCompliance from './security-compliance/interfaces';
export * as ContractTesting from './contract-testing/interfaces';
export * as VisualAccessibility from './visual-accessibility/interfaces';
export * as ChaosResilience from './chaos-resilience/interfaces';
export * as LearningOptimization from './learning-optimization/interfaces';
