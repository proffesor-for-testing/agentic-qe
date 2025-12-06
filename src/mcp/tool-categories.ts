/**
 * Tool Categories for Hierarchical Lazy Loading
 * Phase 2 Implementation - Issue #115
 *
 * This file organizes all 96 MCP tools into categories for efficient loading:
 * - Core tools: Always loaded (~14 tools)
 * - Domain tools: Loaded on keyword detection (70 tools across 7 domains)
 * - Specialized tools: Loaded on explicit request (12 tools)
 */

// Domain types
export type ToolDomain = 'security' | 'performance' | 'coverage' | 'quality' | 'flaky' | 'visual' | 'requirements';
export type SpecializedDomain = 'learning' | 'advanced';
export type ToolCategory = 'core' | 'domain' | 'specialized';

/**
 * Core tools - always loaded (~14 tools)
 * These are fundamental tools needed for basic fleet operations
 */
export const CORE_TOOLS = [
  'mcp__agentic_qe__fleet_init',
  'mcp__agentic_qe__agent_spawn',
  'mcp__agentic_qe__fleet_status',
  'mcp__agentic_qe__test_generate_enhanced',
  'mcp__agentic_qe__test_execute',
  'mcp__agentic_qe__test_execute_parallel',
  'mcp__agentic_qe__test_report_comprehensive',
  'mcp__agentic_qe__memory_store',
  'mcp__agentic_qe__memory_retrieve',
  'mcp__agentic_qe__memory_query',
  'mcp__agentic_qe__task_orchestrate',
  'mcp__agentic_qe__task_status',
  'mcp__agentic_qe__tools_discover',
  'mcp__agentic_qe__tools_load_domain',
] as const;

/**
 * Domain tools - load on keyword detection
 * Organized by testing domain with specific focus areas
 */
export const DOMAIN_TOOLS: Record<ToolDomain, readonly string[]> = {
  security: [
    'mcp__agentic_qe__qe_security_scan_comprehensive',
    'mcp__agentic_qe__qe_security_detect_vulnerabilities',
    'mcp__agentic_qe__qe_security_validate_compliance',
    'mcp__agentic_qe__security_generate_report',
  ],
  performance: [
    'mcp__agentic_qe__performance_analyze_bottlenecks',
    'mcp__agentic_qe__performance_generate_report',
    'mcp__agentic_qe__performance_run_benchmark',
    'mcp__agentic_qe__performance_monitor_realtime',
    'mcp__agentic_qe__performance_track',
  ],
  coverage: [
    'mcp__agentic_qe__coverage_analyze_stream',
    'mcp__agentic_qe__coverage_analyze_with_risk_scoring',
    'mcp__agentic_qe__coverage_detect_gaps_ml',
    'mcp__agentic_qe__coverage_recommend_tests',
    'mcp__agentic_qe__coverage_calculate_trends',
    'mcp__agentic_qe__test_coverage_detailed',
    'mcp__agentic_qe__coverage_analyze_sublinear',
    'mcp__agentic_qe__coverage_gaps_detect',
  ],
  quality: [
    'mcp__agentic_qe__qe_qualitygate_evaluate',
    'mcp__agentic_qe__qe_qualitygate_assess_risk',
    'mcp__agentic_qe__qe_qualitygate_validate_metrics',
    'mcp__agentic_qe__qe_qualitygate_generate_report',
    'mcp__agentic_qe__qe_code_quality_complexity',
    'mcp__agentic_qe__qe_code_quality_metrics',
    'mcp__agentic_qe__quality_gate_execute',
    'mcp__agentic_qe__quality_validate_metrics',
    'mcp__agentic_qe__quality_risk_assess',
    'mcp__agentic_qe__quality_decision_make',
    'mcp__agentic_qe__quality_policy_check',
    'mcp__agentic_qe__deployment_readiness_check',
  ],
  flaky: [
    'mcp__agentic_qe__flaky_detect_statistical',
    'mcp__agentic_qe__flaky_analyze_patterns',
    'mcp__agentic_qe__flaky_stabilize_auto',
  ],
  visual: [
    'mcp__agentic_qe__visual_compare_screenshots',
    'mcp__agentic_qe__visual_validate_accessibility',
    'mcp__agentic_qe__visual_detect_regression',
    'mcp__agentic_qe__visual_test_regression',
  ],
  requirements: [
    'mcp__agentic_qe__qe_requirements_validate',
    'mcp__agentic_qe__qe_requirements_generate_bdd',
    'mcp__agentic_qe__requirements_validate',
    'mcp__agentic_qe__requirements_generate_bdd',
  ],
};

/**
 * Specialized tools - load on explicit request
 * These are advanced tools for specific scenarios
 */
export const SPECIALIZED_TOOLS: Record<SpecializedDomain, readonly string[]> = {
  learning: [
    'mcp__agentic_qe__learning_store_experience',
    'mcp__agentic_qe__learning_store_qvalue',
    'mcp__agentic_qe__learning_store_pattern',
    'mcp__agentic_qe__learning_query',
    'mcp__agentic_qe__learning_status',
    'mcp__agentic_qe__learning_train',
    'mcp__agentic_qe__learning_history',
    'mcp__agentic_qe__learning_reset',
    'mcp__agentic_qe__learning_export',
    'mcp__agentic_qe__pattern_store',
    'mcp__agentic_qe__pattern_find',
    'mcp__agentic_qe__pattern_extract',
    'mcp__agentic_qe__pattern_share',
    'mcp__agentic_qe__pattern_stats',
    'mcp__agentic_qe__improvement_status',
    'mcp__agentic_qe__improvement_cycle',
    'mcp__agentic_qe__improvement_ab_test',
    'mcp__agentic_qe__improvement_failures',
  ],
  advanced: [
    'mcp__agentic_qe__mutation_test_execute',
    'mcp__agentic_qe__api_breaking_changes',
    'mcp__agentic_qe__qe_api_contract_validate',
    'mcp__agentic_qe__qe_api_contract_breaking_changes',
    'mcp__agentic_qe__qe_api_contract_versioning',
    'mcp__agentic_qe__production_incident_replay',
    'mcp__agentic_qe__production_rum_analyze',
    'mcp__agentic_qe__qe_testgen_generate_unit',
    'mcp__agentic_qe__qe_testgen_generate_integration',
    'mcp__agentic_qe__qe_testgen_optimize_suite',
    'mcp__agentic_qe__qe_testgen_analyze_quality',
    'mcp__agentic_qe__qe_test_data_generate',
    'mcp__agentic_qe__qe_test_data_mask',
    'mcp__agentic_qe__qe_test_data_analyze_schema',
    'mcp__agentic_qe__qe_regression_analyze_risk',
    'mcp__agentic_qe__qe_regression_select_tests',
    'mcp__agentic_qe__qe_fleet_coordinate',
    'mcp__agentic_qe__qe_fleet_agent_status',
    'mcp__agentic_qe__test_optimize_sublinear',
    'mcp__agentic_qe__test_execute_stream',
    'mcp__agentic_qe__predict_defects_ai',
    'mcp__agentic_qe__regression_risk_analyze',
  ],
};

/**
 * Keywords for auto-loading domains
 * Used to detect which domain tools to load based on user message content
 *
 * Enhanced in Phase 3 Track I with:
 * - More comprehensive keyword coverage
 * - Common misspellings and abbreviations
 * - Related testing terminology
 * - Industry-standard terms
 */
export const DOMAIN_KEYWORDS: Record<ToolDomain, readonly string[]> = {
  security: [
    // Core security terms
    'security', 'vulnerability', 'vulnerabilities', 'vuln', 'vulns', 'scan', 'audit',
    'owasp', 'cve', 'cwe', 'sast', 'dast', 'iast', 'rasp', 'penetration', 'pentest',
    'compliance', 'gdpr', 'hipaa', 'pci-dss', 'soc2', 'iso-27001',
    // Auth & access
    'authentication', 'authorization', 'auth', 'oauth', 'jwt', 'saml', 'sso',
    'session', 'token', 'credential', 'password', 'secret', 'key management',
    // Security issues
    'encryption', 'injection', 'sql injection', 'xss', 'csrf', 'xxe', 'ssrf',
    'buffer overflow', 'race condition', 'privilege escalation', 'backdoor',
    'malware', 'exploit', 'zero-day', 'threat', 'attack', 'breach',
    // Security testing
    'security test', 'security scan', 'vulnerability scan', 'dependency scan',
    'container scan', 'image scan', 'secrets scan', 'hardcoded secret',
    'insecure', 'unsafe', 'risky'
  ],
  performance: [
    // Core performance
    'performance', 'perf', 'benchmark', 'benchmarking', 'bottleneck', 'profiling',
    'latency', 'throughput', 'load test', 'stress test', 'speed', 'optimization',
    'optimize', 'slow', 'fast', 'faster', 'slowdown',
    // Resources
    'memory leak', 'memory usage', 'cpu usage', 'disk io', 'network io',
    'resource usage', 'resource consumption', 'memory pressure', 'cpu spike',
    // Response metrics
    'response time', 'time to first byte', 'ttfb', 'render time', 'page load',
    'api latency', 'database query time', 'network latency', 'round trip',
    // Load & scale
    'load testing', 'stress testing', 'spike testing', 'endurance test',
    'scalability', 'scale', 'capacity', 'concurrency', 'concurrent users',
    'rps', 'requests per second', 'tps', 'transactions per second',
    // Monitoring
    'apm', 'monitoring', 'profiler', 'flame graph', 'hotspot', 'bottleneck analysis'
  ],
  coverage: [
    // Coverage types
    'coverage', 'test coverage', 'code coverage', 'gap', 'uncovered', 'untested',
    'line coverage', 'branch coverage', 'function coverage', 'statement coverage',
    'path coverage', 'condition coverage', 'decision coverage', 'mc/dc',
    // Missing coverage
    'missing tests', 'missing coverage', 'coverage gap', 'coverage hole',
    'not covered', 'no coverage', 'low coverage', 'insufficient coverage',
    // Coverage goals
    'coverage goal', 'coverage target', 'coverage threshold', '80% coverage',
    'increase coverage', 'improve coverage', 'boost coverage', 'coverage analysis',
    // Related
    'mutation testing', 'mutation score', 'test effectiveness', 'test quality',
    'dead code', 'unused code', 'untested code', 'test completeness'
  ],
  quality: [
    // Quality gates
    'quality gate', 'quality gates', 'gate', 'deploy', 'deployment', 'release',
    'go/no-go', 'go-nogo', 'deployment readiness', 'production readiness',
    'quality check', 'quality validation', 'quality criteria',
    // Quality metrics
    'quality metrics', 'quality score', 'code quality', 'code health',
    'technical debt', 'debt', 'maintainability', 'maintainability index',
    'reliability', 'stability', 'robustness',
    // Code issues
    'complexity', 'cyclomatic complexity', 'cognitive complexity', 'code complexity',
    'duplication', 'duplicate code', 'code clone', 'smell', 'code smell',
    'anti-pattern', 'bad practice', 'violation', 'issue', 'warning',
    // Standards
    'linting', 'lint', 'eslint', 'sonarqube', 'sonar', 'codacy',
    'code review', 'review', 'refactor', 'refactoring', 'cleanup',
    // Deployment
    'ci/cd', 'pipeline', 'build quality', 'build health', 'merge readiness',
    'production', 'staging', 'pre-production'
  ],
  flaky: [
    // Flakiness
    'flaky', 'flaky test', 'flakiness', 'unstable', 'unstable test',
    'intermittent', 'intermittent failure', 'sporadic', 'occasional failure',
    'non-deterministic', 'random', 'random failure', 'inconsistent',
    // Timing
    'timing issue', 'timing problem', 'race condition', 'race', 'timeout',
    'wait', 'sleep', 'delay', 'async issue', 'async problem',
    // Retry & stability
    'retry', 'retries', 'test retry', 'flake detection', 'flake analysis',
    'test stability', 'stabilize', 'stabilization', 'stable',
    // Failures
    'failing randomly', 'passes sometimes', 'fails sometimes', 'unreliable',
    'inconsistent result', 'different results', 'non-repeatable'
  ],
  visual: [
    // Visual testing
    'screenshot', 'screenshot test', 'visual', 'visual test', 'visual testing',
    'visual regression', 'visual diff', 'visual comparison', 'pixel diff',
    'image comparison', 'image diff', 'ui test', 'ui testing',
    // Accessibility
    'accessibility', 'a11y', 'wcag', 'wcag 2.0', 'wcag 2.1', 'wcag 2.2',
    'section 508', 'ada', 'aria', 'screen reader', 'keyboard navigation',
    // Visual elements
    'contrast', 'color contrast', 'contrast ratio', 'font size', 'text size',
    'layout', 'rendering', 'render', 'appearance', 'look', 'visual appearance',
    'responsive', 'breakpoint', 'viewport', 'cross-browser',
    // Specific checks
    'alt text', 'focus indicator', 'focus visible', 'touch target',
    'color blindness', 'color blind', 'semantic html'
  ],
  requirements: [
    // BDD & Gherkin
    'requirements', 'requirement', 'bdd', 'behavior driven', 'behavior-driven',
    'gherkin', 'cucumber', 'specflow', 'behat', 'behave',
    'acceptance criteria', 'acceptance test', 'acceptance testing',
    'given when then', 'given-when-then', 'scenario', 'feature', 'feature file',
    // User stories
    'user story', 'user stories', 'story', 'epic', 'use case',
    'as a user', 'i want', 'so that',
    // Specification
    'specification', 'spec', 'specs', 'requirement spec', 'functional spec',
    'test scenario', 'test case', 'testability', 'testable',
    // Quality attributes
    'invest', 'smart', 'acceptance', 'definition of done', 'dod',
    'definition of ready', 'dor', 'backlog', 'refinement'
  ],
};

/**
 * Additional coordination and workflow tools
 * These don't fit neatly into domains but are important
 */
export const COORDINATION_TOOLS = [
  'mcp__agentic_qe__workflow_create',
  'mcp__agentic_qe__workflow_execute',
  'mcp__agentic_qe__workflow_checkpoint',
  'mcp__agentic_qe__workflow_resume',
  'mcp__agentic_qe__memory_share',
  'mcp__agentic_qe__memory_backup',
  'mcp__agentic_qe__blackboard_post',
  'mcp__agentic_qe__blackboard_read',
  'mcp__agentic_qe__consensus_propose',
  'mcp__agentic_qe__consensus_vote',
  'mcp__agentic_qe__artifact_manifest',
] as const;

/**
 * Legacy tools that have been deprecated but may still exist
 * These should not be loaded in normal operations
 */
export const DEPRECATED_TOOLS = [
  'mcp__agentic_qe__test_generate',
  'mcp__agentic_qe__test_execute',
  'mcp__agentic_qe__predict_defects',
  'mcp__agentic_qe__optimize_tests',
] as const;

// Helper functions

/**
 * Get the category of a tool (core, domain, or specialized)
 */
export function getToolCategory(toolName: string): ToolCategory {
  if (CORE_TOOLS.includes(toolName as any)) return 'core';

  for (const tools of Object.values(DOMAIN_TOOLS)) {
    if (tools.includes(toolName as any)) return 'domain';
  }

  for (const tools of Object.values(SPECIALIZED_TOOLS)) {
    if (tools.includes(toolName as any)) return 'specialized';
  }

  if (COORDINATION_TOOLS.includes(toolName as any)) return 'domain';

  return 'domain'; // Default uncategorized to domain
}

/**
 * Get the specific domain of a tool
 */
export function getToolDomain(toolName: string): ToolDomain | SpecializedDomain | 'coordination' | null {
  for (const [domain, tools] of Object.entries(DOMAIN_TOOLS)) {
    if (tools.includes(toolName as any)) return domain as ToolDomain;
  }

  for (const [domain, tools] of Object.entries(SPECIALIZED_TOOLS)) {
    if (tools.includes(toolName as any)) return domain as SpecializedDomain;
  }

  if (COORDINATION_TOOLS.includes(toolName as any)) return 'coordination';

  return null;
}

/**
 * Related domains that should be loaded together
 * When one domain is detected, related domains may also be useful
 */
export const DOMAIN_RELATIONSHIPS: Record<ToolDomain, ToolDomain[]> = {
  security: ['quality'], // Security issues affect quality gates
  performance: ['quality'], // Performance is part of quality metrics
  coverage: ['quality'], // Coverage is part of quality gates
  quality: [], // Quality gate is often the final check
  flaky: ['coverage', 'quality'], // Flaky tests affect coverage and quality
  visual: ['quality'], // Visual regression affects quality
  requirements: ['coverage', 'quality'], // Requirements drive tests and quality
};

/**
 * Detect which domains should be loaded based on message content
 * Enhanced with:
 * - Better keyword matching (word boundaries)
 * - Related domain detection
 * - Duplicate prevention
 */
export function detectDomainsFromMessage(message: string, options: {
  includeRelated?: boolean;
  minKeywordLength?: number;
} = {}): ToolDomain[] {
  const { includeRelated = false, minKeywordLength = 3 } = options;
  const lowerMessage = message.toLowerCase();
  const detected = new Set<ToolDomain>();

  // Detect primary domains based on keywords
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const hasMatch = keywords.some(kw => {
      // Skip very short keywords unless they're exact matches
      if (kw.length < minKeywordLength && !lowerMessage.includes(` ${kw} `)) {
        return false;
      }
      return lowerMessage.includes(kw.toLowerCase());
    });

    if (hasMatch) {
      detected.add(domain as ToolDomain);
    }
  }

  // Optionally add related domains
  if (includeRelated) {
    const relatedDomains = new Set<ToolDomain>();
    for (const domain of detected) {
      const related = DOMAIN_RELATIONSHIPS[domain] || [];
      related.forEach(d => relatedDomains.add(d));
    }
    relatedDomains.forEach(d => detected.add(d));
  }

  return Array.from(detected);
}

/**
 * Get all tools for a specific domain
 */
export function getAllToolsForDomain(domain: ToolDomain | SpecializedDomain | 'coordination'): readonly string[] {
  if (domain === 'coordination') {
    return COORDINATION_TOOLS;
  }

  if (domain in DOMAIN_TOOLS) {
    return DOMAIN_TOOLS[domain as ToolDomain];
  }

  if (domain in SPECIALIZED_TOOLS) {
    return SPECIALIZED_TOOLS[domain as SpecializedDomain];
  }

  return [];
}

/**
 * Get all tools that should be loaded for a given message
 */
export function getToolsForMessage(message: string): {
  core: readonly string[];
  domains: Record<ToolDomain, readonly string[]>;
  total: number;
} {
  const detectedDomains = detectDomainsFromMessage(message);
  const domainTools: Record<string, readonly string[]> = {};

  for (const domain of detectedDomains) {
    domainTools[domain] = DOMAIN_TOOLS[domain];
  }

  const totalTools = CORE_TOOLS.length +
    Object.values(domainTools).reduce((sum, arr) => sum + arr.length, 0);

  return {
    core: CORE_TOOLS,
    domains: domainTools as Record<ToolDomain, readonly string[]>,
    total: totalTools,
  };
}

/**
 * Check if a tool is deprecated
 */
export function isToolDeprecated(toolName: string): boolean {
  return DEPRECATED_TOOLS.includes(toolName as any);
}

/**
 * Statistics about tool distribution
 */
export const TOOL_STATS = {
  core: CORE_TOOLS.length,
  domains: Object.values(DOMAIN_TOOLS).reduce((sum, arr) => sum + arr.length, 0),
  specialized: Object.values(SPECIALIZED_TOOLS).reduce((sum, arr) => sum + arr.length, 0),
  coordination: COORDINATION_TOOLS.length,
  deprecated: DEPRECATED_TOOLS.length,
  get total() {
    return this.core + this.domains + this.specialized + this.coordination;
  },
  get activeTotal() {
    return this.total - this.deprecated;
  }
} as const;

/**
 * Get a summary of the tool categorization
 */
export function getToolCategorySummary(): string {
  return `
Tool Categories Summary:
- Core: ${TOOL_STATS.core} tools (always loaded)
- Domain: ${TOOL_STATS.domains} tools across ${Object.keys(DOMAIN_TOOLS).length} domains
- Specialized: ${TOOL_STATS.specialized} tools across ${Object.keys(SPECIALIZED_TOOLS).length} categories
- Coordination: ${TOOL_STATS.coordination} tools
- Total Active: ${TOOL_STATS.activeTotal} tools
- Deprecated: ${TOOL_STATS.deprecated} tools

Domains:
${Object.entries(DOMAIN_TOOLS).map(([domain, tools]) => `  - ${domain}: ${tools.length} tools`).join('\n')}

Specialized:
${Object.entries(SPECIALIZED_TOOLS).map(([domain, tools]) => `  - ${domain}: ${tools.length} tools`).join('\n')}
`.trim();
}
