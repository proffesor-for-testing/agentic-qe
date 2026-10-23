/**
 * Agentic QE v3 - task_orchestrate inference
 * Infers the task type and QE domain from a free-text task description, and
 * the workflow (if any) that runs a task type (Issue #206).
 */

import type { TaskType } from '../../coordination/queen-coordinator';

// ============================================================================
// Task Type to Workflow Mapping (Issue #206)
// Maps TaskTypes to their associated workflow IDs for auto-execution
// ============================================================================

export const TASK_WORKFLOW_MAP: Partial<Record<TaskType, string>> = {
  'ideation-assessment': 'qcsd-ideation-swarm',
  // Add more mappings as workflows are created:
  // 'generate-tests': 'comprehensive-testing',
  // 'test-accessibility': 'visual-accessibility-workflow',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Infer domain from task description for routing enrichment
 * Maps task descriptions to QE domains so the complexity analyzer
 * can apply domain-specific scoring (e.g., security → complex domain)
 */
export function inferDomainFromDescription(description: string): string {
  const lower = description.toLowerCase();

  if (/\b(security|vulnerabilit|cve|owasp|secret|credential|injection|xss|csrf)\b/.test(lower)) {
    return 'security-compliance';
  }
  if (/\b(chaos|resilience|fault.?inject|disaster|failover)\b/.test(lower)) {
    return 'chaos-resilience';
  }
  if (/\b(defect|bug.?predict|risk.?assess|mutation)\b/.test(lower)) {
    return 'defect-intelligence';
  }
  if (/\b(coverage|uncovered|gap.?analy)\b/.test(lower)) {
    return 'coverage-analysis';
  }
  if (/\b(quality|code.?review|maintain|tech.?debt)\b/.test(lower)) {
    return 'quality-assessment';
  }
  if (/\b(contract|api.?compat|breaking.?change|pact)\b/.test(lower)) {
    return 'contract-testing';
  }
  if (/\b(index|knowledge.?graph|semantic|code.?intel)\b/.test(lower)) {
    return 'code-intelligence';
  }
  if (/\b(accessib|a11y|wcag|screen.?read)\b/.test(lower)) {
    return 'visual-accessibility';
  }
  if (/\b(requirement|bdd|acceptance|user.?stor)\b/.test(lower)) {
    return 'requirements-validation';
  }
  if (/\b(generat.*test|test.*generat|write.*test|create.*test)\b/.test(lower)) {
    return 'test-generation';
  }
  if (/\b(run.*test|execut.*test)\b/.test(lower)) {
    return 'test-execution';
  }

  return 'test-generation'; // Default
}

// #1130: chaos named as the activity of a test run. The lookaheads keep a
// path segment or file name (resilience tests/unit/…, src/fault-injection/…,
// fault-injection.ts) from counting, and "fault injector" names a component.
const CHAOS_ACTIVITY = new RegExp([
  String.raw`\b(?:chaos|resilience)\s+(?:\w+\s+)?(?:tests?|testing|experiments?)\b(?![./\w])`,
  String.raw`\bfault[\s-]?inject(?:ion|ing)\b(?![./\w])`,
  String.raw`\binject(?:s|ing)?\s+(?:\w+\s+)?faults?\b(?![./\w])`,
].join('|'));

// #1146: learning named as the subject ("optimize learning", "learned
// patterns", "learn from failures"), not any use of "learn/optimize/improve".
const LEARNING_ACTIVITY = /\b(?:learning|learned|learnt)\b|\blearn\s+from\b/;

/** #1146: a request to search code ("semantic search for auth code", "search the codebase for X"). */
const CODE_SEARCH = /\b(?:semantic|code)\s+search\b|\bsearch\s+(?:the\s+)?(?:code(?:base)?|repo(?:sitory)?|source(?:\s+code)?)\b|\bsearch\s+for\b/;

/** #1146: a code search that is not also an indexing request. */
export function isCodeSearch(description: string): boolean {
  const lower = description.toLowerCase();
  return CODE_SEARCH.test(lower) && !/\bindex|knowledge\s+graph/.test(lower);
}

/**
 * Infer task type from description
 */
export function inferTaskType(description: string): TaskType {
  const lower = description.toLowerCase();

  // Check execution first (more specific patterns)
  if (
    /run\s+(?:\w+\s+)*tests?/.test(lower) ||
    /execute\s+(?:\w+\s+)*tests?/.test(lower) ||
    lower.includes('run tests') ||
    lower.includes('execute tests')
  ) {
    // #1130: "run chaos resilience testing" names a chaos run, not a test run.
    // Only a run whose activity is chaos counts; every other description keeps
    // the order below, where chaos wording is the last resort.
    return CHAOS_ACTIVITY.test(lower) ? 'run-chaos' : 'execute-tests';
  }
  // Then check generation
  if (lower.includes('generate test') || lower.includes('create test') || lower.includes('write test')) {
    return 'generate-tests';
  }
  if (lower.includes('coverage') || lower.includes('uncovered')) {
    return 'analyze-coverage';
  }
  if (lower.includes('quality') || lower.includes('code quality')) {
    return 'assess-quality';
  }
  if (lower.includes('defect') || lower.includes('bug') || lower.includes('predict')) {
    return 'predict-defects';
  }
  if (lower.includes('requirement') || lower.includes('bdd') || lower.includes('acceptance')) {
    return 'validate-requirements';
  }
  if (lower.includes('index') || lower.includes('knowledge graph') || lower.includes('semantic')) {
    return 'index-code';
  }
  if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('owasp')) {
    return 'scan-security';
  }
  if (lower.includes('contract') || lower.includes('api contract') || lower.includes('pact')) {
    return 'validate-contracts';
  }
  if (lower.includes('accessibility') || lower.includes('a11y') || lower.includes('wcag')) {
    return 'test-accessibility';
  }
  if (lower.includes('chaos') || lower.includes('resilience') || lower.includes('fault')) {
    return 'run-chaos';
  }
  // #1146: a code search is code-intelligence work; routeInferredTask refuses
  // it with a search-specific reason rather than "no files to index".
  if (CODE_SEARCH.test(lower)) {
    return 'index-code';
  }
  // #1146: only wording about learning itself. "improve" or "optimize" alone
  // ("improve test coverage", "optimize the login page") names no learning task.
  if (LEARNING_ACTIVITY.test(lower)) {
    return 'optimize-learning';
  }
  // QCSD Ideation phase - quality criteria, testability, risk assessment
  if (
    lower.includes('ideation') ||
    lower.includes('quality criteria') ||
    lower.includes('htsm') ||
    lower.includes('qcsd') ||
    lower.includes('testability') ||
    lower.includes('pi planning') ||
    lower.includes('sprint planning')
  ) {
    return 'ideation-assessment';
  }

  // Default to test generation
  return 'generate-tests';
}
