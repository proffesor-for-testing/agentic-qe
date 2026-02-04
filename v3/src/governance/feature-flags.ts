/**
 * Governance Feature Flags for @claude-flow/guidance integration
 *
 * Per ADR-058: Gradual rollout of governance mechanisms with feature flags
 * allows safe integration and A/B testing of governance components.
 *
 * @module governance/feature-flags
 * @see ADR-058-guidance-governance-integration.md
 */

export interface GovernanceFeatureFlags {
  /**
   * ContinueGate: Loop detection and throttling
   * Prevents agents from getting stuck in infinite loops
   */
  continueGate: {
    enabled: boolean;
    maxConsecutiveRetries: number;
    reworkRatioThreshold: number;
    idleTimeoutMs: number;
    throttleOnExceed: boolean;
  };

  /**
   * MemoryWriteGate: Contradiction detection and temporal decay
   * Prevents conflicting patterns from being stored
   */
  memoryWriteGate: {
    enabled: boolean;
    contradictionDetection: boolean;
    temporalDecayDays: number;
    minUsesForRetention: number;
    domainNamespacing: boolean;
  };

  /**
   * TrustAccumulator: Agent trust scoring and tier adjustment
   * Routes tasks to agents based on historical performance
   */
  trustAccumulator: {
    enabled: boolean;
    performanceWeight: number;
    taskSimilarityWeight: number;
    capabilityMatchWeight: number;
    minTrustForCritical: number;
    autoTierAdjustment: boolean;
  };

  /**
   * ProofEnvelope: Hash-chained audit trails
   * Provides cryptographic verification of agent actions
   */
  proofEnvelope: {
    enabled: boolean;
    hashChaining: boolean;
    auditLogRetentionDays: number;
    requireProofForClaims: boolean;
    chainPersistence: boolean;       // Persist chain to disk
    maxChainLength: number;          // Max envelopes before rotation
    signAllEnvelopes: boolean;       // Sign every envelope
  };

  /**
   * BudgetMeter: Cost and token tracking
   * Enforces budget limits per session
   */
  budgetMeter: {
    enabled: boolean;
    maxSessionCostUsd: number;
    maxTokensPerSession: number;
    warningThresholdPercent: number;
  };

  /**
   * DeterministicGateway: Tool idempotency enforcement
   * Provides request deduplication, schema validation, and result caching
   */
  deterministicGateway: {
    enabled: boolean;
    deduplicationWindowMs: number;
    cacheResultsForIdempotent: boolean;
    validateSchemas: boolean;
  };

  /**
   * EvolutionPipeline: Rule effectiveness tracking and pattern evolution
   * Tracks rule success rates, promotes effective patterns, demotes ineffective ones
   */
  evolutionPipeline: {
    enabled: boolean;
    autoPromoteThreshold: number;  // Success rate to auto-promote (e.g., 0.9)
    autoDemoteThreshold: number;   // Success rate to auto-demote (e.g., 0.3)
    minSamplesForDecision: number; // Min samples before auto-action
    learningRate: number;          // How quickly to adapt (0-1)
  };

  /**
   * ShardRetriever: Semantic shard retrieval for domain governance
   * Loads, parses, and matches domain shards to tasks based on intent and context
   */
  shardRetriever: {
    enabled: boolean;
    shardsPath: string;           // Path to shards directory (default: '.claude/guidance/shards')
    cacheEnabled: boolean;        // Cache parsed shards in memory
    cacheTtlMs: number;           // Cache TTL in milliseconds
    maxShardsPerQuery: number;    // Maximum shards returned per query
    relevanceThreshold: number;   // Minimum relevance score (0-1) to include shard
  };

  /**
   * ABBenchmarking: A/B testing framework for governance rule optimization
   * Provides statistical analysis, multi-metric comparison, and auto-winner selection
   */
  abBenchmarking: {
    enabled: boolean;
    defaultConfidenceLevel: number;   // Default confidence level (e.g., 0.95 for 95%)
    defaultMinSampleSize: number;     // Default minimum samples per variant
    autoApplyWinners: boolean;        // Auto-apply winning variants when confident
    maxConcurrentBenchmarks: number;  // Maximum concurrent benchmark tests
  };

  /**
   * ShardEmbeddings: Semantic embedding generation and search for domain shards
   * Generates TF-IDF based embeddings for shard content and enables semantic similarity search
   */
  shardEmbeddings: {
    enabled: boolean;
    embeddingDimensions: number;  // Embedding vector dimensions (default: 128)
    persistEmbeddings: boolean;   // Save embeddings to disk
    autoRebuildOnChange: boolean; // Rebuild index when shards change
    ngramMin: number;             // Minimum n-gram size (default: 2)
    ngramMax: number;             // Maximum n-gram size (default: 4)
    persistPath: string;          // Path to persist embeddings file
  };

  /**
   * AdversarialDefense: Prompt injection and malicious input detection
   * Detects and blocks adversarial inputs, sanitizes risky content
   */
  adversarialDefense: {
    enabled: boolean;
    blockThreshold: number;       // Threat score to auto-block (default: 0.7)
    sanitizeInputs: boolean;      // Auto-sanitize risky inputs
    penalizeOnDetection: boolean; // Penalize agent trust on detection
    logDetections: boolean;       // Log all threat detections
  };

  /**
   * ComplianceReporter: Governance audit and compliance tracking
   * Tracks violations, calculates compliance scores, generates audit reports
   */
  complianceReporter: {
    enabled: boolean;
    autoRecordViolations: boolean;  // Auto-record violations from gates
    retentionDays: number;          // How long to keep violation records
    alertOnCritical: boolean;       // Alert on critical violations
    generateDailyReport: boolean;   // Auto-generate daily compliance reports
  };

  /**
   * ConstitutionalEnforcer: Invariant enforcement from constitution.md
   * Parses and enforces the 7 unbreakable invariants from the AQE Constitution
   */
  constitutionalEnforcer: {
    enabled: boolean;
    strictEnforcement: boolean;     // Block on any violation
    escalateViolations: boolean;    // Escalate to Queen Coordinator
    constitutionPath: string;       // Path to constitution.md
    logAllChecks: boolean;          // Log every invariant check
  };

  /**
   * Global governance settings
   */
  global: {
    enableAllGates: boolean;
    strictMode: boolean;
    logViolations: boolean;
    escalateToQueen: boolean;
  };
}

/**
 * Default feature flag values for Phase 1 rollout
 * Conservative defaults with gates enabled but non-blocking
 */
export const DEFAULT_GOVERNANCE_FLAGS: GovernanceFeatureFlags = {
  continueGate: {
    enabled: true,
    maxConsecutiveRetries: 3,
    reworkRatioThreshold: 0.5,
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
    throttleOnExceed: true,
  },

  memoryWriteGate: {
    enabled: true,
    contradictionDetection: true,
    temporalDecayDays: 30,
    minUsesForRetention: 3,
    domainNamespacing: true,
  },

  trustAccumulator: {
    enabled: true,
    performanceWeight: 0.5,
    taskSimilarityWeight: 0.3,
    capabilityMatchWeight: 0.2,
    minTrustForCritical: 0.7,
    autoTierAdjustment: true,
  },

  proofEnvelope: {
    enabled: true,
    hashChaining: true,
    auditLogRetentionDays: 90,
    requireProofForClaims: true,
    chainPersistence: false,         // Disabled by default for Phase 4
    maxChainLength: 10000,           // 10k envelopes before rotation
    signAllEnvelopes: true,          // Sign every envelope by default
  },

  budgetMeter: {
    enabled: true,
    maxSessionCostUsd: 50.0,
    maxTokensPerSession: 1_000_000,
    warningThresholdPercent: 80,
  },

  deterministicGateway: {
    enabled: true,
    deduplicationWindowMs: 5000, // 5 seconds
    cacheResultsForIdempotent: true,
    validateSchemas: true,
  },

  evolutionPipeline: {
    enabled: true,
    autoPromoteThreshold: 0.9,   // 90% success rate to auto-promote
    autoDemoteThreshold: 0.3,    // 30% success rate to auto-demote
    minSamplesForDecision: 20,   // Min samples before auto-action
    learningRate: 0.1,           // 10% adaptation rate
  },

  shardRetriever: {
    enabled: true,
    shardsPath: '.claude/guidance/shards',
    cacheEnabled: true,
    cacheTtlMs: 5 * 60 * 1000,   // 5 minutes
    maxShardsPerQuery: 3,
    relevanceThreshold: 0.3,
  },

  abBenchmarking: {
    enabled: true,
    defaultConfidenceLevel: 0.95,    // 95% confidence by default
    defaultMinSampleSize: 100,       // 100 samples per variant
    autoApplyWinners: false,         // Manual application by default
    maxConcurrentBenchmarks: 5,      // Allow up to 5 concurrent benchmarks
  },

  shardEmbeddings: {
    enabled: true,
    embeddingDimensions: 128,        // 128-dimensional embeddings
    persistEmbeddings: false,        // Don't persist by default
    autoRebuildOnChange: true,       // Rebuild when shards change
    ngramMin: 2,                     // Character bigrams minimum
    ngramMax: 4,                     // Character 4-grams maximum
    persistPath: '.agentic-qe/shard-embeddings.json',
  },

  adversarialDefense: {
    enabled: true,
    blockThreshold: 0.7,             // Block inputs with 70%+ threat score
    sanitizeInputs: true,            // Auto-sanitize risky inputs
    penalizeOnDetection: true,       // Penalize agent trust on detection
    logDetections: true,             // Log all threat detections
  },

  complianceReporter: {
    enabled: true,
    autoRecordViolations: true,      // Auto-record from gates
    retentionDays: 90,               // Keep 90 days of violation history
    alertOnCritical: true,           // Alert on critical violations
    generateDailyReport: false,      // Manual report generation by default
  },

  constitutionalEnforcer: {
    enabled: true,
    strictEnforcement: false,        // Non-blocking by default for Phase 4
    escalateViolations: true,        // Escalate to Queen Coordinator
    constitutionPath: '.claude/guidance/constitution.md',
    logAllChecks: true,              // Log all invariant checks
  },

  global: {
    enableAllGates: true,
    strictMode: false, // Start non-strict for Phase 1
    logViolations: true,
    escalateToQueen: true,
  },
};

/**
 * Environment variable overrides for feature flags
 */
export function loadFlagsFromEnv(): Partial<GovernanceFeatureFlags> {
  const env = process.env;

  return {
    continueGate: {
      enabled: env.GOVERNANCE_CONTINUE_GATE !== 'false',
      maxConsecutiveRetries: parseInt(env.GOVERNANCE_MAX_RETRIES || '3', 10),
      reworkRatioThreshold: parseFloat(env.GOVERNANCE_REWORK_THRESHOLD || '0.5'),
      idleTimeoutMs: parseInt(env.GOVERNANCE_IDLE_TIMEOUT || '300000', 10),
      throttleOnExceed: env.GOVERNANCE_THROTTLE !== 'false',
    },
    memoryWriteGate: {
      enabled: env.GOVERNANCE_MEMORY_GATE !== 'false',
      contradictionDetection: env.GOVERNANCE_CONTRADICTION_CHECK !== 'false',
      temporalDecayDays: parseInt(env.GOVERNANCE_DECAY_DAYS || '30', 10),
      minUsesForRetention: parseInt(env.GOVERNANCE_MIN_USES || '3', 10),
      domainNamespacing: env.GOVERNANCE_DOMAIN_NS !== 'false',
    },
    trustAccumulator: {
      enabled: env.GOVERNANCE_TRUST !== 'false',
      performanceWeight: parseFloat(env.GOVERNANCE_PERF_WEIGHT || '0.5'),
      taskSimilarityWeight: parseFloat(env.GOVERNANCE_SIMILARITY_WEIGHT || '0.3'),
      capabilityMatchWeight: parseFloat(env.GOVERNANCE_CAPABILITY_WEIGHT || '0.2'),
      minTrustForCritical: parseFloat(env.GOVERNANCE_MIN_TRUST || '0.7'),
      autoTierAdjustment: env.GOVERNANCE_AUTO_TIER !== 'false',
    },
    proofEnvelope: {
      enabled: env.GOVERNANCE_PROOF !== 'false',
      hashChaining: env.GOVERNANCE_HASH_CHAIN !== 'false',
      auditLogRetentionDays: parseInt(env.GOVERNANCE_AUDIT_DAYS || '90', 10),
      requireProofForClaims: env.GOVERNANCE_REQUIRE_PROOF !== 'false',
      chainPersistence: env.GOVERNANCE_CHAIN_PERSIST === 'true',
      maxChainLength: parseInt(env.GOVERNANCE_MAX_CHAIN_LENGTH || '10000', 10),
      signAllEnvelopes: env.GOVERNANCE_SIGN_ALL !== 'false',
    },
    budgetMeter: {
      enabled: env.GOVERNANCE_BUDGET !== 'false',
      maxSessionCostUsd: parseFloat(env.GOVERNANCE_MAX_COST || '50'),
      maxTokensPerSession: parseInt(env.GOVERNANCE_MAX_TOKENS || '1000000', 10),
      warningThresholdPercent: parseInt(env.GOVERNANCE_WARNING_PERCENT || '80', 10),
    },
    deterministicGateway: {
      enabled: env.GOVERNANCE_DETERMINISTIC !== 'false',
      deduplicationWindowMs: parseInt(env.GOVERNANCE_DEDUP_WINDOW || '5000', 10),
      cacheResultsForIdempotent: env.GOVERNANCE_CACHE_IDEMPOTENT !== 'false',
      validateSchemas: env.GOVERNANCE_VALIDATE_SCHEMAS !== 'false',
    },
    evolutionPipeline: {
      enabled: env.GOVERNANCE_EVOLUTION !== 'false',
      autoPromoteThreshold: parseFloat(env.GOVERNANCE_PROMOTE_THRESHOLD || '0.9'),
      autoDemoteThreshold: parseFloat(env.GOVERNANCE_DEMOTE_THRESHOLD || '0.3'),
      minSamplesForDecision: parseInt(env.GOVERNANCE_MIN_SAMPLES || '20', 10),
      learningRate: parseFloat(env.GOVERNANCE_LEARNING_RATE || '0.1'),
    },
    shardRetriever: {
      enabled: env.GOVERNANCE_SHARD_RETRIEVER !== 'false',
      shardsPath: env.GOVERNANCE_SHARDS_PATH || '.claude/guidance/shards',
      cacheEnabled: env.GOVERNANCE_SHARD_CACHE !== 'false',
      cacheTtlMs: parseInt(env.GOVERNANCE_SHARD_CACHE_TTL || '300000', 10),
      maxShardsPerQuery: parseInt(env.GOVERNANCE_MAX_SHARDS || '3', 10),
      relevanceThreshold: parseFloat(env.GOVERNANCE_RELEVANCE_THRESHOLD || '0.3'),
    },
    abBenchmarking: {
      enabled: env.GOVERNANCE_AB_BENCHMARKING !== 'false',
      defaultConfidenceLevel: parseFloat(env.GOVERNANCE_AB_CONFIDENCE || '0.95'),
      defaultMinSampleSize: parseInt(env.GOVERNANCE_AB_MIN_SAMPLES || '100', 10),
      autoApplyWinners: env.GOVERNANCE_AB_AUTO_APPLY === 'true',
      maxConcurrentBenchmarks: parseInt(env.GOVERNANCE_AB_MAX_CONCURRENT || '5', 10),
    },
    shardEmbeddings: {
      enabled: env.GOVERNANCE_SHARD_EMBEDDINGS !== 'false',
      embeddingDimensions: parseInt(env.GOVERNANCE_EMBEDDING_DIMENSIONS || '128', 10),
      persistEmbeddings: env.GOVERNANCE_PERSIST_EMBEDDINGS === 'true',
      autoRebuildOnChange: env.GOVERNANCE_AUTO_REBUILD !== 'false',
      ngramMin: parseInt(env.GOVERNANCE_NGRAM_MIN || '2', 10),
      ngramMax: parseInt(env.GOVERNANCE_NGRAM_MAX || '4', 10),
      persistPath: env.GOVERNANCE_EMBEDDINGS_PATH || '.agentic-qe/shard-embeddings.json',
    },
    adversarialDefense: {
      enabled: env.GOVERNANCE_ADVERSARIAL_DEFENSE !== 'false',
      blockThreshold: parseFloat(env.GOVERNANCE_BLOCK_THRESHOLD || '0.7'),
      sanitizeInputs: env.GOVERNANCE_SANITIZE_INPUTS !== 'false',
      penalizeOnDetection: env.GOVERNANCE_PENALIZE_DETECTION !== 'false',
      logDetections: env.GOVERNANCE_LOG_DETECTIONS !== 'false',
    },
    complianceReporter: {
      enabled: env.GOVERNANCE_COMPLIANCE_REPORTER !== 'false',
      autoRecordViolations: env.GOVERNANCE_AUTO_RECORD_VIOLATIONS !== 'false',
      retentionDays: parseInt(env.GOVERNANCE_VIOLATION_RETENTION_DAYS || '90', 10),
      alertOnCritical: env.GOVERNANCE_ALERT_ON_CRITICAL !== 'false',
      generateDailyReport: env.GOVERNANCE_DAILY_REPORT === 'true',
    },
    constitutionalEnforcer: {
      enabled: env.GOVERNANCE_CONSTITUTIONAL_ENFORCER !== 'false',
      strictEnforcement: env.GOVERNANCE_CONSTITUTIONAL_STRICT === 'true',
      escalateViolations: env.GOVERNANCE_CONSTITUTIONAL_ESCALATE !== 'false',
      constitutionPath: env.GOVERNANCE_CONSTITUTION_PATH || '.claude/guidance/constitution.md',
      logAllChecks: env.GOVERNANCE_CONSTITUTIONAL_LOG !== 'false',
    },
    global: {
      enableAllGates: env.GOVERNANCE_ENABLED !== 'false',
      strictMode: env.GOVERNANCE_STRICT === 'true',
      logViolations: env.GOVERNANCE_LOG_VIOLATIONS !== 'false',
      escalateToQueen: env.GOVERNANCE_ESCALATE !== 'false',
    },
  };
}

/**
 * Merge flags with environment overrides and custom overrides
 */
export function mergeFlags(
  base: GovernanceFeatureFlags = DEFAULT_GOVERNANCE_FLAGS,
  envOverrides: Partial<GovernanceFeatureFlags> = loadFlagsFromEnv(),
  customOverrides: Partial<GovernanceFeatureFlags> = {}
): GovernanceFeatureFlags {
  const deepMerge = <T extends object>(target: T, source: Partial<T>): T => {
    const result = { ...target };
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = deepMerge(
            target[key] as object,
            source[key] as object
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = source[key] as T[Extract<keyof T, string>];
        }
      }
    }
    return result;
  };

  return deepMerge(deepMerge(base, envOverrides), customOverrides);
}

/**
 * GovernanceFlags singleton for runtime access
 */
class GovernanceFlagsManager {
  private flags: GovernanceFeatureFlags;
  private listeners: Set<(flags: GovernanceFeatureFlags) => void> = new Set();

  constructor() {
    this.flags = mergeFlags();
  }

  /**
   * Get current feature flags
   */
  getFlags(): GovernanceFeatureFlags {
    return this.flags;
  }

  /**
   * Check if a specific gate is enabled
   */
  isGateEnabled(gate: keyof Omit<GovernanceFeatureFlags, 'global'>): boolean {
    if (!this.flags.global.enableAllGates) return false;
    return this.flags[gate].enabled;
  }

  /**
   * Update flags at runtime (for A/B testing)
   */
  updateFlags(overrides: Partial<GovernanceFeatureFlags>): void {
    this.flags = mergeFlags(this.flags, {}, overrides);
    this.notifyListeners();
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(listener: (flags: GovernanceFeatureFlags) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.flags));
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.flags = mergeFlags();
    this.notifyListeners();
  }

  /**
   * Enable strict mode (blocking enforcement)
   */
  enableStrictMode(): void {
    this.updateFlags({ global: { ...this.flags.global, strictMode: true } });
  }

  /**
   * Disable all gates (emergency kill switch)
   */
  disableAllGates(): void {
    this.updateFlags({ global: { ...this.flags.global, enableAllGates: false } });
  }
}

/**
 * Singleton instance
 */
export const governanceFlags = new GovernanceFlagsManager();

/**
 * Convenience exports for common checks
 */
export const isContinueGateEnabled = (): boolean =>
  governanceFlags.isGateEnabled('continueGate');

export const isMemoryWriteGateEnabled = (): boolean =>
  governanceFlags.isGateEnabled('memoryWriteGate');

export const isTrustAccumulatorEnabled = (): boolean =>
  governanceFlags.isGateEnabled('trustAccumulator');

export const isProofEnvelopeEnabled = (): boolean =>
  governanceFlags.isGateEnabled('proofEnvelope');

export const isBudgetMeterEnabled = (): boolean =>
  governanceFlags.isGateEnabled('budgetMeter');

export const isDeterministicGatewayEnabled = (): boolean =>
  governanceFlags.isGateEnabled('deterministicGateway');

export const isEvolutionPipelineEnabled = (): boolean =>
  governanceFlags.isGateEnabled('evolutionPipeline');

export const isShardRetrieverEnabled = (): boolean =>
  governanceFlags.isGateEnabled('shardRetriever');

export const isABBenchmarkingEnabled = (): boolean =>
  governanceFlags.isGateEnabled('abBenchmarking');

export const isShardEmbeddingsEnabled = (): boolean =>
  governanceFlags.isGateEnabled('shardEmbeddings');

export const isAdversarialDefenseEnabled = (): boolean =>
  governanceFlags.isGateEnabled('adversarialDefense');

export const isComplianceReporterEnabled = (): boolean =>
  governanceFlags.isGateEnabled('complianceReporter');

export const isConstitutionalEnforcerEnabled = (): boolean =>
  governanceFlags.isGateEnabled('constitutionalEnforcer');

export const isStrictMode = (): boolean =>
  governanceFlags.getFlags().global.strictMode;
