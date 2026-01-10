/**
 * Self-Configurator
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Automatically generates optimal AQE configuration based on project analysis.
 */

import type {
  ProjectAnalysis,
  AQEInitConfig,
  LearningConfig,
  RoutingConfig,
  WorkersConfig,
  HooksConfig,
  AutoTuningConfig,
  HNSWConfig,
} from './types.js';
import {
  DEFAULT_HNSW_CONFIG,
  DEFAULT_LEARNING_CONFIG,
  DEFAULT_ROUTING_CONFIG,
  DEFAULT_WORKERS_CONFIG,
  DEFAULT_HOOKS_CONFIG,
  DEFAULT_AUTO_TUNING_CONFIG,
  ALL_DOMAINS,
} from './types.js';

// ============================================================================
// Configuration Recommendation Rules
// ============================================================================

interface ConfigurationRule {
  name: string;
  condition: (analysis: ProjectAnalysis) => boolean;
  apply: (config: AQEInitConfig, analysis: ProjectAnalysis) => void;
}

const configurationRules: ConfigurationRule[] = [
  // TypeScript-specific rules
  {
    name: 'typescript-vitest',
    condition: (a) =>
      a.hasTypeScript && a.frameworks.some((f) => f.name === 'vitest'),
    apply: (config) => {
      config.learning.embeddingModel = 'transformer';
      // Vitest projects typically have good type coverage
      config.routing.confidenceThreshold = 0.75;
    },
  },

  // Large codebase rules
  {
    name: 'large-codebase',
    condition: (a) => a.codeComplexity.totalFiles > 500,
    apply: (config) => {
      // Larger HNSW index for more files
      config.learning.hnswConfig.M = 32;
      config.learning.hnswConfig.efConstruction = 400;
      config.learning.hnswConfig.efSearch = 200;
      // More concurrent agents for parallel work
      config.agents.maxConcurrent = 15;
    },
  },

  // Small project rules
  {
    name: 'small-project',
    condition: (a) => a.codeComplexity.totalFiles < 50,
    apply: (config) => {
      // Smaller HNSW settings
      config.learning.hnswConfig.M = 8;
      config.learning.hnswConfig.efConstruction = 100;
      // Fewer workers needed
      config.workers.enabled = ['pattern-consolidator', 'routing-accuracy-monitor'];
      config.workers.maxConcurrent = 2;
      config.agents.maxConcurrent = 5;
    },
  },

  // High complexity rules
  {
    name: 'high-complexity',
    condition: (a) => a.codeComplexity.recommendation === 'complex',
    apply: (config) => {
      // Complex code needs more careful testing
      config.autoTuning.parameters.push('complexity.analysisDepth');
      // Enable all quality domains
      config.domains.enabled = ALL_DOMAINS;
    },
  },

  // Low coverage rules
  {
    name: 'low-coverage',
    condition: (a) => a.coverage.hasReport && a.coverage.lines < 50,
    apply: (config) => {
      // Prioritize coverage improvement
      config.workers.enabled.push('coverage-gap-scanner');
      config.workers.intervals['coverage-gap-scanner'] = 30 * 60 * 1000; // Every 30 min
    },
  },

  // Monorepo rules
  {
    name: 'monorepo',
    condition: (a) => a.projectType === 'monorepo',
    apply: (config) => {
      // Monorepos need more agents
      config.agents.maxConcurrent = 15;
      config.workers.maxConcurrent = 6;
      // Enable code intelligence for cross-package analysis
      config.domains.enabled = [...new Set([...config.domains.enabled, 'code-intelligence'])];
    },
  },

  // E2E testing present
  {
    name: 'has-e2e',
    condition: (a) =>
      a.frameworks.some((f) => ['playwright', 'cypress'].includes(f.name)) ||
      a.existingTests.byType.e2e > 0,
    apply: (config) => {
      // Enable visual and accessibility domains
      config.domains.enabled = [
        ...new Set([...config.domains.enabled, 'visual-accessibility', 'chaos-resilience']),
      ];
    },
  },

  // CI/CD integration
  {
    name: 'has-ci',
    condition: (a) => a.hasCIConfig,
    apply: (config) => {
      config.hooks.ciIntegration = true;
      // Enable quality gate for CI
      config.domains.enabled = [...new Set([...config.domains.enabled, 'quality-assessment'])];
    },
  },

  // GitHub Actions specific
  {
    name: 'github-actions',
    condition: (a) => a.ciProvider === 'github-actions',
    apply: (config) => {
      config.hooks.ciIntegration = true;
      // Can use Claude Code hooks in GitHub Actions
      config.hooks.claudeCode = true;
    },
  },

  // Python project rules
  {
    name: 'python-project',
    condition: (a) => a.languages.some((l) => l.name === 'python' && l.percentage > 30),
    apply: (config) => {
      // Python projects have different test patterns
      config.routing.mode = 'hybrid';
      // Enable security compliance (Python has more CVEs)
      config.domains.enabled = [...new Set([...config.domains.enabled, 'security-compliance'])];
    },
  },

  // Java project rules
  {
    name: 'java-project',
    condition: (a) => a.languages.some((l) => l.name === 'java' && l.percentage > 30),
    apply: (config) => {
      // Java projects typically have complex build systems
      config.agents.defaultTimeout = 120000; // 2 minutes
    },
  },

  // No existing tests
  {
    name: 'no-tests',
    condition: (a) => a.existingTests.totalCount === 0,
    apply: (config) => {
      // Focus on test generation
      config.workers.enabled = ['pattern-consolidator'];
      config.domains.enabled = ['test-generation', 'coverage-analysis', 'learning-optimization'];
      // Lower thresholds for new projects
      config.learning.qualityThreshold = 0.5;
      config.learning.promotionThreshold = 2;
    },
  },

  // Many existing tests
  {
    name: 'many-tests',
    condition: (a) => a.existingTests.totalCount > 500,
    apply: (config) => {
      // Enable flaky test detection
      config.workers.enabled = [...new Set([...config.workers.enabled, 'flaky-test-detector'])];
      // Enable performance monitoring
      config.domains.enabled = [...new Set([...config.domains.enabled, 'test-execution'])];
    },
  },

  // Security-focused (has security-related deps)
  {
    name: 'security-focus',
    condition: (a) => {
      // Could check for security packages, but for now just enable by default for larger projects
      return a.codeComplexity.totalFiles > 100;
    },
    apply: (config) => {
      config.domains.enabled = [...new Set([...config.domains.enabled, 'security-compliance'])];
    },
  },
];

// ============================================================================
// Self-Configurator Class
// ============================================================================

export interface SelfConfiguratorOptions {
  /** Apply only essential rules */
  minimal?: boolean;
  /** Skip pattern loading */
  skipPatterns?: boolean;
  /** Custom rules to apply */
  customRules?: ConfigurationRule[];
}

export class SelfConfigurator {
  private rules: ConfigurationRule[];

  constructor(options: SelfConfiguratorOptions = {}) {
    this.rules = options.minimal
      ? configurationRules.filter((r) =>
          ['typescript-vitest', 'large-codebase', 'small-project'].includes(r.name)
        )
      : [...configurationRules, ...(options.customRules || [])];
  }

  /**
   * Generate recommended configuration based on project analysis
   */
  recommend(analysis: ProjectAnalysis): AQEInitConfig {
    // Start with base configuration
    const config: AQEInitConfig = {
      version: '3.0.0',
      project: {
        name: analysis.projectName,
        root: analysis.projectRoot,
        type: analysis.projectType === 'unknown' ? 'single' : analysis.projectType,
      },
      learning: this.recommendLearning(analysis),
      routing: this.recommendRouting(analysis),
      workers: this.recommendWorkers(analysis),
      hooks: this.recommendHooks(analysis),
      autoTuning: this.recommendAutoTuning(analysis),
      domains: {
        enabled: this.recommendDomains(analysis),
        disabled: [],
      },
      agents: {
        maxConcurrent: this.recommendMaxAgents(analysis),
        defaultTimeout: 60000,
      },
    };

    // Apply all matching rules
    const appliedRules: string[] = [];
    for (const rule of this.rules) {
      if (rule.condition(analysis)) {
        rule.apply(config, analysis);
        appliedRules.push(rule.name);
      }
    }

    // Deduplicate domain lists
    config.domains.enabled = [...new Set(config.domains.enabled)];
    config.workers.enabled = [...new Set(config.workers.enabled)];

    return config;
  }

  /**
   * Get list of rules that would be applied
   */
  getApplicableRules(analysis: ProjectAnalysis): string[] {
    return this.rules.filter((r) => r.condition(analysis)).map((r) => r.name);
  }

  /**
   * Recommend learning configuration
   */
  private recommendLearning(analysis: ProjectAnalysis): LearningConfig {
    const config = { ...DEFAULT_LEARNING_CONFIG };

    // Adjust HNSW based on project size
    if (analysis.codeComplexity.totalFiles > 1000) {
      config.hnswConfig = {
        M: 32,
        efConstruction: 400,
        efSearch: 200,
      };
    } else if (analysis.codeComplexity.totalFiles < 100) {
      config.hnswConfig = {
        M: 8,
        efConstruction: 100,
        efSearch: 50,
      };
    }

    // Use transformer embeddings for TypeScript/JavaScript
    if (analysis.languages.some((l) => ['typescript', 'javascript'].includes(l.name))) {
      config.embeddingModel = 'transformer';
    }

    return config;
  }

  /**
   * Recommend routing configuration
   */
  private recommendRouting(analysis: ProjectAnalysis): RoutingConfig {
    const config = { ...DEFAULT_ROUTING_CONFIG };

    // ML routing for complex projects, rules for simple
    if (analysis.codeComplexity.recommendation === 'simple') {
      config.mode = 'rules';
    } else if (analysis.codeComplexity.recommendation === 'complex') {
      config.mode = 'ml';
    } else {
      config.mode = 'hybrid';
    }

    return config;
  }

  /**
   * Recommend workers configuration
   */
  private recommendWorkers(analysis: ProjectAnalysis): WorkersConfig {
    const config = { ...DEFAULT_WORKERS_CONFIG };

    // Always enable core workers
    const workers = new Set(['pattern-consolidator', 'routing-accuracy-monitor']);

    // Add coverage scanner if coverage is low or missing
    if (!analysis.coverage.hasReport || analysis.coverage.lines < 70) {
      workers.add('coverage-gap-scanner');
    }

    // Add flaky detector if many tests
    if (analysis.existingTests.totalCount > 100) {
      workers.add('flaky-test-detector');
    }

    config.enabled = Array.from(workers);

    // Adjust concurrency based on project size
    if (analysis.codeComplexity.totalFiles > 500) {
      config.maxConcurrent = 6;
    } else if (analysis.codeComplexity.totalFiles < 50) {
      config.maxConcurrent = 2;
    }

    return config;
  }

  /**
   * Recommend hooks configuration
   */
  private recommendHooks(analysis: ProjectAnalysis): HooksConfig {
    const config = { ...DEFAULT_HOOKS_CONFIG };

    // Enable CI integration if CI is configured
    config.ciIntegration = analysis.hasCIConfig;

    // Enable pre-commit for projects with many tests
    config.preCommit = analysis.existingTests.totalCount > 50;

    return config;
  }

  /**
   * Recommend auto-tuning configuration
   */
  private recommendAutoTuning(analysis: ProjectAnalysis): AutoTuningConfig {
    const config = { ...DEFAULT_AUTO_TUNING_CONFIG };

    // Disable auto-tuning for small projects
    if (analysis.codeComplexity.totalFiles < 20) {
      config.enabled = false;
    }

    return config;
  }

  /**
   * Recommend enabled domains
   */
  private recommendDomains(analysis: ProjectAnalysis): string[] {
    // Core domains always enabled
    const domains = new Set([
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'learning-optimization',
    ]);

    // Add quality assessment if CI is present
    if (analysis.hasCIConfig) {
      domains.add('quality-assessment');
    }

    // Add security for larger projects
    if (analysis.codeComplexity.totalFiles > 100) {
      domains.add('security-compliance');
    }

    // Add visual/a11y if E2E frameworks present
    if (analysis.frameworks.some((f) => ['playwright', 'cypress'].includes(f.name))) {
      domains.add('visual-accessibility');
    }

    // Add code intelligence for TypeScript/complex projects
    if (
      analysis.hasTypeScript ||
      analysis.codeComplexity.recommendation === 'complex'
    ) {
      domains.add('code-intelligence');
    }

    // Add contract testing if API patterns detected
    // (simplified: check for common API file patterns)
    domains.add('contract-testing');

    return Array.from(domains);
  }

  /**
   * Recommend max concurrent agents
   */
  private recommendMaxAgents(analysis: ProjectAnalysis): number {
    if (analysis.projectType === 'monorepo') return 15;
    if (analysis.codeComplexity.totalFiles > 500) return 12;
    if (analysis.codeComplexity.totalFiles > 100) return 8;
    return 5;
  }
}

/**
 * Factory function to create a self-configurator
 */
export function createSelfConfigurator(
  options?: SelfConfiguratorOptions
): SelfConfigurator {
  return new SelfConfigurator(options);
}

/**
 * Quick function to generate recommended config from analysis
 */
export function recommendConfig(analysis: ProjectAnalysis): AQEInitConfig {
  return new SelfConfigurator().recommend(analysis);
}
