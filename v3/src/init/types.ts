/**
 * Init Module Types
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Types for project analysis, self-configuration, and initialization.
 */

// ============================================================================
// Project Analysis Types
// ============================================================================

/**
 * Detected test framework
 */
export interface DetectedFramework {
  name: string;
  version?: string;
  configFile?: string;
  confidence: number; // 0-1
}

/**
 * Detected programming language
 */
export interface DetectedLanguage {
  name: string;
  percentage: number; // File percentage
  fileCount: number;
  extensions: string[];
}

/**
 * Existing test information
 */
export interface ExistingTests {
  totalCount: number;
  byFramework: Record<string, number>;
  byType: {
    unit: number;
    integration: number;
    e2e: number;
    unknown: number;
  };
  directories: string[];
}

/**
 * Code complexity metrics
 */
export interface CodeComplexity {
  averageCyclomatic: number;
  maxCyclomatic: number;
  totalFiles: number;
  complexFiles: string[]; // Files with high complexity
  recommendation: 'simple' | 'medium' | 'complex';
}

/**
 * Current coverage metrics
 */
export interface CoverageMetrics {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
  hasReport: boolean;
  reportPath?: string;
}

/**
 * Complete project analysis result
 */
export interface ProjectAnalysis {
  projectName: string;
  projectRoot: string;
  projectType: 'monorepo' | 'single' | 'library' | 'unknown';

  frameworks: DetectedFramework[];
  languages: DetectedLanguage[];
  existingTests: ExistingTests;
  codeComplexity: CodeComplexity;
  coverage: CoverageMetrics;

  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';
  hasTypeScript: boolean;
  hasCIConfig: boolean;
  ciProvider?: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'circleci' | 'other';

  analysisTimestamp: Date;
  analysisDurationMs: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * HNSW configuration for vector search
 */
export interface HNSWConfig {
  M: number;              // Max connections per node (default: 16)
  efConstruction: number; // Construction time accuracy (default: 200)
  efSearch: number;       // Search time accuracy (default: 100)
}

/**
 * Learning system configuration
 */
export interface LearningConfig {
  enabled: boolean;
  pretrainedPatterns: boolean;
  patternsPath?: string;
  hnswConfig: HNSWConfig;
  promotionThreshold: number;    // Min successful uses before promotion
  qualityThreshold: number;      // Min quality score for long-term storage
  embeddingModel: 'transformer' | 'hash' | 'auto';
}

/**
 * Routing system configuration
 */
export interface RoutingConfig {
  mode: 'ml' | 'rules' | 'hybrid';
  confidenceThreshold: number;
  feedbackEnabled: boolean;
  cacheEnabled: boolean;
  cacheTTLMs: number;
}

/**
 * Background workers configuration
 */
export interface WorkersConfig {
  enabled: string[];
  intervals: Record<string, number>;
  maxConcurrent: number;
  daemonAutoStart: boolean;
}

/**
 * Hooks configuration
 */
export interface HooksConfig {
  claudeCode: boolean;
  preCommit: boolean;
  ciIntegration: boolean;
  customHooksPath?: string;
}

/**
 * Skills configuration
 */
export interface SkillsConfig {
  /** Install skills during init (default: true) */
  install: boolean;
  /** Install v2 methodology skills (default: true) */
  installV2: boolean;
  /** Install v3 domain skills (default: true) */
  installV3: boolean;
  /** Overwrite existing skills (default: false) */
  overwrite: boolean;
}

/**
 * Auto-tuning configuration
 */
export interface AutoTuningConfig {
  enabled: boolean;
  parameters: string[];
  tuningIntervalMs: number;
  evaluationPeriodMs: number;
}

/**
 * N8n platform configuration
 */
export interface N8nPlatformConfig {
  enabled: boolean;
  installAgents: boolean;
  installSkills: boolean;
  installTypeScriptAgents: boolean;
  n8nApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
}

/**
 * Platform integrations configuration
 */
export interface PlatformsConfig {
  n8n?: N8nPlatformConfig;
  // Future: github?, agentdb?, flow-nexus?
}

/**
 * Complete AQE initialization configuration
 */
export interface AQEInitConfig {
  version: string;

  project: {
    name: string;
    root: string;
    type: 'monorepo' | 'single' | 'library';
  };

  learning: LearningConfig;
  routing: RoutingConfig;
  workers: WorkersConfig;
  hooks: HooksConfig;
  skills: SkillsConfig;
  autoTuning: AutoTuningConfig;

  // Platform integrations (n8n, etc.)
  platforms?: PlatformsConfig;

  // Domain-specific settings
  domains: {
    enabled: string[];
    disabled: string[];
  };

  // Agent settings
  agents: {
    maxConcurrent: number;
    defaultTimeout: number;
  };
}

// ============================================================================
// Init Result Types
// ============================================================================

/**
 * Single initialization step result
 */
export interface InitStepResult {
  step: string;
  status: 'success' | 'warning' | 'error' | 'skipped';
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
}

/**
 * Complete initialization result
 */
export interface InitResult {
  success: boolean;
  config: AQEInitConfig;
  steps: InitStepResult[];

  summary: {
    projectAnalyzed: boolean;
    configGenerated: boolean;
    codeIntelligenceIndexed: number;
    patternsLoaded: number;
    skillsInstalled: number;
    agentsInstalled: number;
    hooksConfigured: boolean;
    mcpConfigured: boolean;
    claudeMdGenerated: boolean;
    workersStarted: number;
    // Platform integration results
    n8nInstalled?: {
      agents: number;
      skills: number;
    };
  };

  totalDurationMs: number;
  timestamp: Date;

  /** Indicates v2 installation was detected and migration is needed */
  v2Detected?: boolean;
  /** V2 migration was performed during init */
  v2Migrated?: boolean;
}

// ============================================================================
// Wizard Types
// ============================================================================

/**
 * Wizard step definition
 */
export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'info' | 'choice' | 'confirm' | 'input';
  options?: WizardOption[];
  default?: string | boolean;
  validation?: (value: unknown) => boolean;
}

/**
 * Wizard option for choice steps
 */
export interface WizardOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

/**
 * Wizard state
 */
export interface WizardState {
  currentStep: number;
  totalSteps: number;
  answers: Record<string, unknown>;
  analysis?: ProjectAnalysis;
}

// ============================================================================
// Pre-trained Patterns Types
// ============================================================================

/**
 * Pre-trained pattern for loading
 */
export interface PretrainedPattern {
  id: string;
  domain: string;
  type: string;
  content: string;
  metadata: {
    framework?: string;
    language?: string;
    confidence: number;
    usageCount: number;
    successRate: number;
  };
}

/**
 * Pre-trained patterns library
 */
export interface PretrainedLibrary {
  version: string;
  exportedFrom: string;
  exportDate: string;
  patterns: PretrainedPattern[];
  statistics: {
    totalPatterns: number;
    byDomain: Record<string, number>;
    byLanguage: Record<string, number>;
    averageConfidence: number;
  };
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_HNSW_CONFIG: HNSWConfig = {
  M: 16,
  efConstruction: 200,
  efSearch: 100,
};

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  pretrainedPatterns: true,
  hnswConfig: DEFAULT_HNSW_CONFIG,
  promotionThreshold: 3,
  qualityThreshold: 0.7,
  embeddingModel: 'auto',
};

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  mode: 'hybrid',
  confidenceThreshold: 0.7,
  feedbackEnabled: true,
  cacheEnabled: true,
  cacheTTLMs: 5 * 60 * 1000, // 5 minutes
};

export const DEFAULT_WORKERS_CONFIG: WorkersConfig = {
  enabled: [
    'pattern-consolidator',
    'coverage-gap-scanner',
    'flaky-test-detector',
    'routing-accuracy-monitor',
  ],
  intervals: {
    'pattern-consolidator': 30 * 60 * 1000,     // 30 min
    'coverage-gap-scanner': 60 * 60 * 1000,     // 1 hour
    'flaky-test-detector': 2 * 60 * 60 * 1000,  // 2 hours
    'routing-accuracy-monitor': 15 * 60 * 1000, // 15 min
  },
  maxConcurrent: 4,
  daemonAutoStart: true,
};

export const DEFAULT_HOOKS_CONFIG: HooksConfig = {
  claudeCode: true,
  preCommit: false,
  ciIntegration: false,
};

export const DEFAULT_SKILLS_CONFIG: SkillsConfig = {
  install: true,
  installV2: true,
  installV3: true,
  overwrite: false,
};

export const DEFAULT_AUTO_TUNING_CONFIG: AutoTuningConfig = {
  enabled: true,
  parameters: [
    'hnsw.efSearch',
    'routing.confidenceThreshold',
    'pattern.promotionThreshold',
    'testGen.complexityLimit',
  ],
  tuningIntervalMs: 7 * 24 * 60 * 60 * 1000, // Weekly
  evaluationPeriodMs: 5000,
};

export const DEFAULT_N8N_PLATFORM_CONFIG: N8nPlatformConfig = {
  enabled: false, // Disabled by default, enabled with --with-n8n
  installAgents: true,
  installSkills: true,
  installTypeScriptAgents: false,
};

export const ALL_DOMAINS = [
  'test-generation',
  'test-execution',
  'coverage-analysis',
  'quality-assessment',
  'defect-intelligence',
  'requirements-validation',
  'code-intelligence',
  'security-compliance',
  'contract-testing',
  'visual-accessibility',
  'chaos-resilience',
  'learning-optimization',
];

/**
 * Create default AQE init configuration
 */
export function createDefaultConfig(projectName: string, projectRoot: string): AQEInitConfig {
  return {
    version: '3.0.0',
    project: {
      name: projectName,
      root: projectRoot,
      type: 'single',
    },
    learning: DEFAULT_LEARNING_CONFIG,
    routing: DEFAULT_ROUTING_CONFIG,
    workers: DEFAULT_WORKERS_CONFIG,
    hooks: DEFAULT_HOOKS_CONFIG,
    skills: DEFAULT_SKILLS_CONFIG,
    autoTuning: DEFAULT_AUTO_TUNING_CONFIG,
    domains: {
      enabled: ALL_DOMAINS,
      disabled: [],
    },
    agents: {
      maxConcurrent: 15,
      defaultTimeout: 60000,
    },
  };
}
