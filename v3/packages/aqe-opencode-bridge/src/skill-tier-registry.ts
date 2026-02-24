/**
 * Skill Tier Registry
 *
 * Classifies all 75 AQE skills into model tiers based on reasoning complexity.
 * Used by the graceful degradation middleware to decide whether a skill can
 * run on the current provider/model or needs to warn/block/fallback.
 *
 * Tier assignment rationale:
 * - tier1-any: Mechanical tasks with clear patterns (formatting, checklists, data management)
 * - tier2-good: Needs code understanding and structured analysis (test gen, code review, coverage)
 * - tier3-best: Needs deep reasoning, multi-factor analysis, or security expertise
 *
 * @module skill-tier-registry
 */

import type {
  SkillTierMetadata,
  ModelTierString,
  DegradationBehavior,
  SkillTierSummary,
} from '@agentic-qe/opencode-types/skill-tiers';

// ---------------------------------------------------------------------------
// Skill tier definitions — all 75 AQE skills
// ---------------------------------------------------------------------------

const SKILL_TIERS: readonly SkillTierMetadata[] = [
  // =========================================================================
  // TIER 1 — Any model (simple mechanical tasks)
  // =========================================================================

  // Quality metrics & reporting
  tier1('quality-metrics', 'Computes metrics from structured data, no reasoning needed', 'analysis-review'),
  tier1('test-reporting-analytics', 'Formats test results into reports', 'infrastructure'),
  tier1('verification-quality', 'Checks verification criteria against checklists', 'analysis-review'),

  // Environment & data management
  tier1('test-data-management', 'Generates structured test data from schemas', 'test-design'),
  tier1('test-environment-management', 'Validates environment configuration', 'infrastructure'),

  // Simple compliance & compatibility checks
  tier1('compliance-testing', 'Checks against compliance checklists', 'specialized-testing'),
  tier1('localization-testing', 'Verifies i18n/l10n patterns and string tables', 'specialized-testing'),
  tier1('compatibility-testing', 'Checks platform compatibility matrices', 'specialized-testing'),

  // Documentation & writing
  tier1('technical-writing', 'Structured documentation generation', 'development-practices'),
  tier1('consultancy-practices', 'Applies consulting frameworks to QE problems', 'development-practices'),
  tier1('bug-reporting-excellence', 'Formats bug reports with structured templates', 'bug-management'),

  // Simple workflow skills
  tier1('test-idea-rewriting', 'Rewrites test ideas into clearer format', 'test-design'),
  tier1('sfdipot-product-factors', 'Applies SFDIPOT product factor analysis', 'analysis-review'),
  tier1('stream-chain', 'Chains simple stream operations', 'infrastructure'),
  tier1('qe-v2-v3-migration', 'Migrates v2 configs to v3 format', 'infrastructure'),

  // =========================================================================
  // TIER 2 — Good model (needs decent reasoning)
  // =========================================================================

  // Core QE skills
  tier2('agentic-quality-engineering', 'Core QE philosophy requires understanding context', 'qe-core'),
  tier2('holistic-testing-pact', 'Holistic test strategy needs multi-factor analysis', 'qe-core'),
  tier2('context-driven-testing', 'Context-sensitive test approach selection', 'testing-methodologies'),

  // Test generation & design
  tier2('qe-test-generation', 'Generates meaningful test cases from code analysis', 'qe-domain'),
  tier2('test-design-techniques', 'Applies test design techniques (BVA, EP, etc.)', 'test-design'),
  tier2('testability-scoring', 'Scores code testability with multi-factor analysis', 'test-design'),
  tier2('api-testing-patterns', 'Generates API test suites with edge cases', 'test-design'),
  tier2('tdd-london-chicago', 'Guides TDD workflow with mock design', 'testing-methodologies'),
  tier2('test-automation-strategy', 'Designs test automation architecture', 'infrastructure'),

  // Coverage & execution
  tier2('qe-coverage-analysis', 'Analyzes coverage gaps requiring code understanding', 'qe-domain'),
  tier2('qe-test-execution', 'Orchestrates test execution with retry logic', 'qe-domain'),
  tier2('regression-testing', 'Identifies regression risk areas in changes', 'specialized-testing'),
  tier2('shift-left-testing', 'Designs shift-left testing strategies', 'infrastructure'),
  tier2('shift-right-testing', 'Designs shift-right / production testing strategies', 'infrastructure'),

  // Code review & analysis
  tier2('code-review-quality', 'Structured code review with pattern detection', 'analysis-review'),
  tier2('refactoring-patterns', 'Identifies and applies refactoring patterns', 'development-practices'),
  tier2('six-thinking-hats', 'Multi-perspective analysis using structured framework', 'analysis-review'),
  tier2('risk-based-testing', 'Risk analysis for test prioritization', 'testing-methodologies'),
  tier2('exploratory-testing-advanced', 'Guided exploratory testing with heuristics', 'testing-methodologies'),

  // Contract & API
  tier2('contract-testing', 'Validates API contracts for breaking changes', 'specialized-testing'),
  tier2('qe-contract-testing', 'QE-enhanced contract validation', 'qe-domain'),
  tier2('qe-requirements-validation', 'Validates requirements for testability', 'qe-domain'),

  // Performance & database
  tier2('performance-testing', 'Designs performance test plans and benchmarks', 'specialized-testing'),
  tier2('performance-analysis', 'Analyzes performance data for bottlenecks', 'monitoring'),
  tier2('database-testing', 'Generates database test cases and validates schemas', 'specialized-testing'),

  // Accessibility & visual
  tier2('accessibility-testing', 'Tests against WCAG standards', 'specialized-testing'),
  tier2('a11y-ally', 'Accessibility analysis with remediation suggestions', 'specialized-testing'),
  tier2('visual-testing-advanced', 'Visual regression testing strategies', 'specialized-testing'),
  tier2('qe-visual-accessibility', 'Combined visual and accessibility testing', 'qe-domain'),
  tier2('mobile-testing', 'Mobile-specific testing strategies', 'specialized-testing'),

  // QE domain skills
  tier2('qe-quality-assessment', 'Assesses overall code quality with metrics', 'qe-domain'),
  tier2('qe-learning-optimization', 'Optimizes learning from test patterns', 'qe-domain'),
  tier2('qe-iterative-loop', 'Iterative quality improvement cycles', 'qe-domain'),
  tier2('qe-code-intelligence', 'Code intelligence for test generation input', 'qe-domain'),

  // CI/CD & infrastructure
  tier2('cicd-pipeline-qe-orchestrator', 'Orchestrates QE checks in CI/CD pipelines', 'infrastructure'),

  // Development practices
  tier2('xp-practices', 'Applies XP practices to development workflow', 'development-practices'),
  tier2('skill-builder', 'Builds new AQE skills from templates', 'development-practices'),
  tier2('sparc-methodology', 'Applies SPARC methodology to development', 'development-practices'),

  // n8n testing (needs understanding of n8n workflows)
  tier2('n8n-workflow-testing-fundamentals', 'Tests n8n workflow execution paths', 'n8n-testing'),
  tier2('n8n-trigger-testing-strategies', 'Tests n8n trigger configurations', 'n8n-testing'),
  tier2('n8n-expression-testing', 'Tests n8n expression evaluation', 'n8n-testing'),

  // Middleware & observability
  tier2('middleware-testing-patterns', 'Tests middleware chains and interceptors', 'specialized-testing'),
  tier2('observability-testing-patterns', 'Tests observability instrumentation', 'specialized-testing'),
  tier2('wms-testing-patterns', 'Warehouse management system testing patterns', 'specialized-testing'),

  // Enterprise
  tier2('enterprise-integration-testing', 'Tests enterprise integration patterns', 'specialized-testing'),

  // =========================================================================
  // TIER 3 — Best model (needs advanced reasoning)
  // =========================================================================

  // Security (BLOCK on degradation — security gaps are unacceptable)
  tier3('security-testing', 'Deep security analysis requires expert reasoning', 'specialized-testing', 'block'),
  tier3('pentest-validation', 'Penetration test validation needs security expertise', 'specialized-testing', 'block'),
  tier3('qe-security-compliance', 'Security compliance requires thorough analysis', 'qe-domain', 'block'),
  tier3('security-visual-testing', 'Security-focused visual testing', 'specialized-testing', 'block'),
  tier3('n8n-security-testing', 'n8n security testing requires deep analysis', 'n8n-testing', 'block'),

  // Advanced analysis (WARN on degradation)
  tier3('mutation-testing', 'Designing effective mutants requires deep code understanding', 'specialized-testing', 'warn'),
  tier3('qe-defect-intelligence', 'Defect prediction needs pattern recognition at scale', 'qe-domain', 'warn'),
  tier3('chaos-engineering-resilience', 'Designing chaos experiments needs system-level reasoning', 'specialized-testing', 'warn'),
  tier3('qe-chaos-resilience', 'QE chaos resilience analysis', 'qe-domain', 'warn'),
  tier3('n8n-integration-testing-patterns', 'Complex n8n integration patterns need deep analysis', 'n8n-testing', 'warn'),

  // Advanced review (use-fallback to simpler review)
  tier3('brutal-honesty-review', 'Brutally honest review needs nuanced judgment', 'analysis-review', 'use-fallback', 'code-review-quality'),
  tier3('sherlock-review', 'Deductive code analysis needs advanced reasoning', 'analysis-review', 'use-fallback', 'code-review-quality'),

  // QCSD swarms (WARN — reduced quality but still usable)
  tier3('qcsd-ideation-swarm', 'Multi-agent quality analysis needs strong orchestration', 'qcsd-phases', 'warn'),
  tier3('qcsd-refinement-swarm', 'Multi-agent refinement needs strong reasoning', 'qcsd-phases', 'warn'),
  tier3('qcsd-development-swarm', 'Multi-agent development QA needs deep code understanding', 'qcsd-phases', 'warn'),
  tier3('qcsd-production-swarm', 'Production quality swarm needs system-level reasoning', 'qcsd-phases', 'warn'),
  tier3('qcsd-cicd-swarm', 'CI/CD quality swarm needs pipeline understanding', 'qcsd-phases', 'warn'),
] as const;

// ---------------------------------------------------------------------------
// Helper functions for concise tier definitions
// ---------------------------------------------------------------------------

function tier1(
  skillName: string,
  reason: string,
  category: string,
): SkillTierMetadata {
  return {
    skillName,
    minModelTier: 'tier1-any',
    reason,
    degradationBehavior: 'warn',
    category,
  };
}

function tier2(
  skillName: string,
  reason: string,
  category: string,
): SkillTierMetadata {
  return {
    skillName,
    minModelTier: 'tier2-good',
    reason,
    degradationBehavior: 'warn',
    category,
  };
}

function tier3(
  skillName: string,
  reason: string,
  category: string,
  degradationBehavior: DegradationBehavior = 'warn',
  fallbackSkill?: string,
): SkillTierMetadata {
  return {
    skillName,
    minModelTier: 'tier3-best',
    reason,
    degradationBehavior,
    ...(fallbackSkill ? { fallbackSkill } : {}),
    category,
  };
}

// ---------------------------------------------------------------------------
// Registry index for O(1) lookups
// ---------------------------------------------------------------------------

const TIER_INDEX = new Map<string, SkillTierMetadata>();
for (const entry of SKILL_TIERS) {
  TIER_INDEX.set(entry.skillName, entry);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the tier metadata for a specific skill.
 * Returns undefined if the skill is not classified (likely a platform skill, not AQE).
 */
export function getSkillTier(skillName: string): SkillTierMetadata | undefined {
  return TIER_INDEX.get(skillName);
}

/**
 * Get all classified skill tiers.
 */
export function getAllSkillTiers(): readonly SkillTierMetadata[] {
  return SKILL_TIERS;
}

/**
 * Get all skills for a specific tier.
 */
export function getSkillsByTier(tier: ModelTierString): SkillTierMetadata[] {
  return SKILL_TIERS.filter((s) => s.minModelTier === tier);
}

/**
 * Get all skills that would be blocked when running on a specific tier.
 */
export function getBlockedSkills(availableTier: ModelTierString): SkillTierMetadata[] {
  const tierRank = TIER_RANK[availableTier];
  return SKILL_TIERS.filter((s) => {
    const required = TIER_RANK[s.minModelTier];
    return required > tierRank && s.degradationBehavior === 'block';
  });
}

/**
 * Get a summary of tier distribution.
 */
export function getSkillTierSummary(): SkillTierSummary {
  const tier1 = SKILL_TIERS.filter((s) => s.minModelTier === 'tier1-any');
  const tier2 = SKILL_TIERS.filter((s) => s.minModelTier === 'tier2-good');
  const tier3 = SKILL_TIERS.filter((s) => s.minModelTier === 'tier3-best');
  const blocked = SKILL_TIERS.filter((s) => s.degradationBehavior === 'block');

  return {
    total: SKILL_TIERS.length,
    tier1Count: tier1.length,
    tier2Count: tier2.length,
    tier3Count: tier3.length,
    blockedOnDegradation: blocked.length,
  };
}

/**
 * Check whether a skill can run on the given tier.
 * Returns true if the model tier meets or exceeds the skill's minimum requirement.
 */
export function canSkillRunOnTier(skillName: string, availableTier: ModelTierString): boolean {
  const meta = TIER_INDEX.get(skillName);
  if (!meta) return true; // Unknown skills are allowed (platform skills, etc.)
  return TIER_RANK[availableTier] >= TIER_RANK[meta.minModelTier];
}

// ---------------------------------------------------------------------------
// Internal tier ranking for comparisons
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ModelTierString, number> = {
  'tier1-any': 1,
  'tier2-good': 2,
  'tier3-best': 3,
};

export { TIER_RANK };
