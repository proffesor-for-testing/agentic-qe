/**
 * ShardRetriever Integration for Agentic QE Fleet
 *
 * Provides semantic shard retrieval from the @claude-flow/guidance system.
 * Loads, parses, and matches domain shards to tasks based on intent and context.
 *
 * Features:
 * - Filesystem-based shard loading with caching
 * - Intent-based shard selection
 * - Semantic matching of tasks to relevant shards
 * - Context-aware rule injection
 * - Performance metrics and cache statistics
 *
 * @module governance/shard-retriever-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { governanceFlags } from './feature-flags.js';

/**
 * Agent constraints from a shard
 */
export interface AgentConstraints {
  primary: AgentRole[];
  secondary: AgentRole[];
  support: AgentRole[];
  readonly: AgentRole[];
  forbidden: string[];
}

/**
 * Agent role definition
 */
export interface AgentRole {
  agentId: string;
  permissions: string;
}

/**
 * Escalation trigger from a shard
 */
export interface EscalationTrigger {
  trigger: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  action: string;
}

/**
 * Quality thresholds from a shard
 */
export interface QualityThresholds {
  [metric: string]: {
    minimum: number;
    target: number;
    critical?: number;
  };
}

/**
 * Integration point definition
 */
export interface IntegrationPoint {
  domain: string;
  type: 'Input' | 'Output' | 'Bidirectional';
  purpose: string;
}

/**
 * Parsed shard content
 */
export interface ShardContent {
  domain: string;
  version: string;
  lastUpdated: string;
  parentConstitution: string;
  rules: string[];
  thresholds: QualityThresholds;
  invariants: string[];
  patterns: PatternReference[];
  agentConstraints: AgentConstraints;
  escalationTriggers: EscalationTrigger[];
  memoryNamespace: {
    namespace: string;
    retention: string;
    contradictionCheck: boolean;
  };
  integrationPoints: IntegrationPoint[];
  rawContent: string;
}

/**
 * Pattern reference from a shard
 */
export interface PatternReference {
  name: string;
  location: string;
  description: string;
}

/**
 * Task context for shard matching
 */
export interface TaskContext {
  taskType: string;
  domain?: string;
  agentId?: string;
  intent?: string;
  keywords?: string[];
  requiresSecurity?: boolean;
  requiresCompliance?: boolean;
  requiresCoverage?: boolean;
  requiresLearning?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Injected rules for a context
 */
export interface InjectedRules {
  rules: string[];
  thresholds: QualityThresholds;
  constraints: AgentConstraints;
  escalations: EscalationTrigger[];
  sourceDomains: string[];
}

/**
 * Shard statistics
 */
export interface ShardStats {
  totalShards: number;
  loadedShards: number;
  domains: string[];
  lastRefresh: number | null;
  parseErrors: string[];
}

/**
 * Cache statistics
 */
export interface CacheStats {
  enabled: boolean;
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  lastCleanup: number | null;
}

/**
 * Domain to task type mapping for relevance calculation
 */
const DOMAIN_TASK_MAPPING: Record<string, string[]> = {
  'test-generation': [
    'test-generation',
    'generate-tests',
    'tdd',
    'property-testing',
    'test-creation',
    'unit-test',
    'integration-test',
  ],
  'test-execution': [
    'test-execution',
    'run-tests',
    'test-run',
    'parallel-testing',
    'flaky-detection',
    'retry',
  ],
  'coverage-analysis': [
    'coverage-analysis',
    'coverage',
    'gap-detection',
    'coverage-report',
    'uncovered-code',
  ],
  'quality-assessment': [
    'quality-assessment',
    'quality-gate',
    'quality-check',
    'deployment-decision',
    'release-validation',
  ],
  'defect-intelligence': [
    'defect-intelligence',
    'defect-prediction',
    'root-cause',
    'bug-prediction',
    'regression-risk',
  ],
  'requirements-validation': [
    'requirements-validation',
    'bdd',
    'gherkin',
    'acceptance-criteria',
    'requirements-check',
  ],
  'code-intelligence': [
    'code-intelligence',
    'code-analysis',
    'complexity-analysis',
    'dependency-analysis',
    'code-structure',
  ],
  'security-compliance': [
    'security-compliance',
    'security-scan',
    'sast',
    'dast',
    'vulnerability',
    'owasp',
    'compliance',
  ],
  'contract-testing': [
    'contract-testing',
    'api-contract',
    'consumer-driven',
    'pact',
    'schema-validation',
  ],
  'visual-accessibility': [
    'visual-accessibility',
    'accessibility',
    'a11y',
    'wcag',
    'visual-regression',
    'screenshot',
  ],
  'chaos-resilience': [
    'chaos-resilience',
    'chaos-testing',
    'fault-injection',
    'resilience',
    'load-testing',
    'performance',
  ],
  'learning-optimization': [
    'learning-optimization',
    'pattern-learning',
    'knowledge-transfer',
    'experience-learning',
    'optimization',
  ],
};

/**
 * Intent keywords to domain mapping
 */
const INTENT_DOMAIN_MAPPING: Record<string, string[]> = {
  test: ['test-generation', 'test-execution'],
  coverage: ['coverage-analysis'],
  quality: ['quality-assessment'],
  security: ['security-compliance'],
  defect: ['defect-intelligence'],
  bug: ['defect-intelligence'],
  requirements: ['requirements-validation'],
  bdd: ['requirements-validation'],
  code: ['code-intelligence'],
  analysis: ['code-intelligence', 'coverage-analysis'],
  contract: ['contract-testing'],
  api: ['contract-testing'],
  accessibility: ['visual-accessibility'],
  a11y: ['visual-accessibility'],
  chaos: ['chaos-resilience'],
  performance: ['chaos-resilience'],
  learning: ['learning-optimization'],
  pattern: ['learning-optimization'],
  compliance: ['security-compliance'],
  vulnerability: ['security-compliance'],
};

/**
 * Check if shard retriever is enabled via feature flags
 */
function isShardRetrieverEnabled(): boolean {
  const flags = governanceFlags.getFlags();
  if (!flags.global.enableAllGates) return false;
  const flagsAsAny = flags as unknown as { shardRetriever?: ShardRetrieverFlags };
  return flagsAsAny.shardRetriever?.enabled ?? false;
}

/**
 * Get shard retriever flags with defaults
 */
function getShardRetrieverFlags(): ShardRetrieverFlags {
  const flags = governanceFlags.getFlags() as unknown as { shardRetriever?: ShardRetrieverFlags };
  return flags.shardRetriever ?? DEFAULT_SHARD_RETRIEVER_FLAGS;
}

/**
 * Shard retriever feature flags
 */
export interface ShardRetrieverFlags {
  enabled: boolean;
  shardsPath: string;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  maxShardsPerQuery: number;
  relevanceThreshold: number;
}

/**
 * Default shard retriever flags
 */
export const DEFAULT_SHARD_RETRIEVER_FLAGS: ShardRetrieverFlags = {
  enabled: true,
  shardsPath: '.claude/guidance/shards',
  cacheEnabled: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxShardsPerQuery: 3,
  relevanceThreshold: 0.3,
};

/**
 * Cache entry for parsed shards
 */
interface ShardCacheEntry {
  shard: ShardContent;
  loadedAt: number;
  expiresAt: number;
}

/**
 * ShardRetrieverIntegration class
 *
 * Provides semantic shard retrieval for the AQE governance system.
 */
export class ShardRetrieverIntegration {
  private shardCache: Map<string, ShardCacheEntry> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private lastCacheCleanup: number | null = null;
  private parseErrors: string[] = [];
  private initialized = false;
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.cwd();
  }

  /**
   * Initialize the ShardRetrieverIntegration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!isShardRetrieverEnabled()) {
      this.initialized = true;
      return;
    }

    // Pre-load all shards into cache
    await this.loadAllShards();
    this.initialized = true;
  }

  /**
   * Load all shards from the filesystem
   */
  async loadAllShards(): Promise<Map<string, ShardContent>> {
    const result = new Map<string, ShardContent>();

    if (!isShardRetrieverEnabled()) {
      return result;
    }

    const flags = getShardRetrieverFlags();
    const shardsPath = path.resolve(this.basePath, flags.shardsPath);

    try {
      const files = await fs.readdir(shardsPath);
      const shardFiles = files.filter(f => f.endsWith('.shard.md'));

      for (const file of shardFiles) {
        const domain = file.replace('.shard.md', '');
        try {
          const shard = await this.loadShardFromFile(path.join(shardsPath, file));
          if (shard) {
            result.set(domain, shard);
            this.cacheShardIfEnabled(domain, shard);
          }
        } catch (error) {
          const errorMsg = `Failed to load shard ${file}: ${error instanceof Error ? error.message : String(error)}`;
          this.parseErrors.push(errorMsg);
          this.logError(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Failed to read shards directory: ${error instanceof Error ? error.message : String(error)}`;
      this.parseErrors.push(errorMsg);
      this.logError(errorMsg);
    }

    return result;
  }

  /**
   * Load a specific shard by domain
   */
  async loadShard(domain: string): Promise<ShardContent | null> {
    if (!isShardRetrieverEnabled()) {
      return null;
    }

    // Check cache first
    const cached = this.getCachedShard(domain);
    if (cached) {
      this.cacheHits++;
      return cached;
    }

    this.cacheMisses++;

    const flags = getShardRetrieverFlags();
    const shardsPath = path.resolve(this.basePath, flags.shardsPath);
    const filePath = path.join(shardsPath, `${domain}.shard.md`);

    try {
      const shard = await this.loadShardFromFile(filePath);
      if (shard) {
        this.cacheShardIfEnabled(domain, shard);
      }
      return shard;
    } catch (error) {
      this.logError(`Failed to load shard for domain ${domain}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Retrieve shards relevant to a task
   */
  async retrieveForTask(taskType: string, context: TaskContext): Promise<ShardContent[]> {
    if (!isShardRetrieverEnabled()) {
      return [];
    }

    await this.initialize();

    const flags = getShardRetrieverFlags();
    const allShards = await this.getAllCachedOrLoadedShards();

    // Score each shard by relevance to the task
    const scoredShards: Array<{ shard: ShardContent; score: number }> = [];

    for (const shard of allShards.values()) {
      const score = this.calculateRelevance(shard, { ...context, taskType });
      if (score >= flags.relevanceThreshold) {
        scoredShards.push({ shard, score });
      }
    }

    // Sort by relevance score and limit
    scoredShards.sort((a, b) => b.score - a.score);
    const topShards = scoredShards.slice(0, flags.maxShardsPerQuery);

    return topShards.map(s => s.shard);
  }

  /**
   * Retrieve shards by intent string
   */
  async retrieveByIntent(intent: string): Promise<ShardContent[]> {
    if (!isShardRetrieverEnabled()) {
      return [];
    }

    await this.initialize();

    const flags = getShardRetrieverFlags();
    const normalizedIntent = intent.toLowerCase();

    // Find matching domains from intent keywords
    const matchingDomains = new Set<string>();

    for (const [keyword, domains] of Object.entries(INTENT_DOMAIN_MAPPING)) {
      if (normalizedIntent.includes(keyword)) {
        domains.forEach(d => matchingDomains.add(d));
      }
    }

    // Also check for direct domain mentions
    for (const domain of Object.keys(DOMAIN_TASK_MAPPING)) {
      if (normalizedIntent.includes(domain)) {
        matchingDomains.add(domain);
      }
    }

    // Load matching shards
    const shards: ShardContent[] = [];
    for (const domain of matchingDomains) {
      const shard = await this.loadShard(domain);
      if (shard) {
        shards.push(shard);
      }
    }

    // Limit results
    return shards.slice(0, flags.maxShardsPerQuery);
  }

  /**
   * Retrieve a shard by domain name
   */
  async retrieveByDomain(domain: string): Promise<ShardContent | null> {
    if (!isShardRetrieverEnabled()) {
      return null;
    }

    return this.loadShard(domain);
  }

  /**
   * Calculate relevance score between a shard and task context
   */
  calculateRelevance(shard: ShardContent, context: TaskContext): number {
    let score = 0;
    const weights = {
      domainMatch: 0.4,
      taskTypeMatch: 0.25,
      keywordMatch: 0.15,
      intentMatch: 0.1,
      agentMatch: 0.1,
    };

    // 1. Direct domain match (highest weight)
    if (context.domain === shard.domain) {
      score += weights.domainMatch;
    }

    // 2. Task type match
    const taskTypes = DOMAIN_TASK_MAPPING[shard.domain] || [];
    const normalizedTaskType = context.taskType.toLowerCase();
    for (const tt of taskTypes) {
      if (normalizedTaskType.includes(tt) || tt.includes(normalizedTaskType)) {
        score += weights.taskTypeMatch;
        break;
      }
    }

    // 3. Keyword match from context
    if (context.keywords && context.keywords.length > 0) {
      const shardText = shard.rawContent.toLowerCase();
      let keywordMatches = 0;
      for (const keyword of context.keywords) {
        if (shardText.includes(keyword.toLowerCase())) {
          keywordMatches++;
        }
      }
      score += (keywordMatches / context.keywords.length) * weights.keywordMatch;
    }

    // 4. Intent match
    if (context.intent) {
      const normalizedIntent = context.intent.toLowerCase();
      const intentDomains = this.getDomainsForIntent(normalizedIntent);
      if (intentDomains.includes(shard.domain)) {
        score += weights.intentMatch;
      }
    }

    // 5. Agent match - if the agent is listed in the shard
    if (context.agentId) {
      const agentIds = [
        ...shard.agentConstraints.primary.map(a => a.agentId),
        ...shard.agentConstraints.secondary.map(a => a.agentId),
        ...shard.agentConstraints.support.map(a => a.agentId),
      ];
      if (agentIds.includes(context.agentId)) {
        score += weights.agentMatch;
      }
    }

    // 6. Special context flags
    if (context.requiresSecurity && shard.domain === 'security-compliance') {
      score += 0.15;
    }
    if (context.requiresCompliance && shard.domain === 'security-compliance') {
      score += 0.1;
    }
    if (context.requiresCoverage && shard.domain === 'coverage-analysis') {
      score += 0.15;
    }
    if (context.requiresLearning && shard.domain === 'learning-optimization') {
      score += 0.1;
    }

    return Math.min(1, score); // Cap at 1.0
  }

  /**
   * Get top N shards for a context
   */
  async getTopShards(context: TaskContext, limit: number): Promise<ShardContent[]> {
    if (!isShardRetrieverEnabled()) {
      return [];
    }

    await this.initialize();

    const allShards = await this.getAllCachedOrLoadedShards();
    const scoredShards: Array<{ shard: ShardContent; score: number }> = [];

    for (const shard of allShards.values()) {
      const score = this.calculateRelevance(shard, context);
      scoredShards.push({ shard, score });
    }

    scoredShards.sort((a, b) => b.score - a.score);
    return scoredShards.slice(0, limit).map(s => s.shard);
  }

  /**
   * Inject rules for a specific context
   */
  async injectRulesForContext(context: TaskContext): Promise<InjectedRules> {
    const emptyResult: InjectedRules = {
      rules: [],
      thresholds: {},
      constraints: {
        primary: [],
        secondary: [],
        support: [],
        readonly: [],
        forbidden: [],
      },
      escalations: [],
      sourceDomains: [],
    };

    if (!isShardRetrieverEnabled()) {
      return emptyResult;
    }

    const relevantShards = await this.retrieveForTask(context.taskType, context);

    if (relevantShards.length === 0) {
      return emptyResult;
    }

    // Aggregate rules from all relevant shards
    const rules: string[] = [];
    const thresholds: QualityThresholds = {};
    const constraints: AgentConstraints = {
      primary: [],
      secondary: [],
      support: [],
      readonly: [],
      forbidden: [],
    };
    const escalations: EscalationTrigger[] = [];
    const sourceDomains: string[] = [];

    for (const shard of relevantShards) {
      // Add rules with domain prefix for traceability
      shard.rules.forEach(rule => {
        rules.push(`[${shard.domain}] ${rule}`);
      });

      // Merge thresholds (later shards can override)
      Object.assign(thresholds, shard.thresholds);

      // Merge agent constraints
      constraints.primary.push(...shard.agentConstraints.primary);
      constraints.secondary.push(...shard.agentConstraints.secondary);
      constraints.support.push(...shard.agentConstraints.support);
      constraints.readonly.push(...shard.agentConstraints.readonly);
      constraints.forbidden.push(...shard.agentConstraints.forbidden);

      // Add escalation triggers
      escalations.push(...shard.escalationTriggers);

      sourceDomains.push(shard.domain);
    }

    // Deduplicate agent constraints
    constraints.primary = this.dedupeAgentRoles(constraints.primary);
    constraints.secondary = this.dedupeAgentRoles(constraints.secondary);
    constraints.support = this.dedupeAgentRoles(constraints.support);
    constraints.readonly = this.dedupeAgentRoles(constraints.readonly);
    constraints.forbidden = [...new Set(constraints.forbidden)];

    return {
      rules,
      thresholds,
      constraints,
      escalations,
      sourceDomains,
    };
  }

  /**
   * Get shard statistics
   */
  getShardStats(): ShardStats {
    const cached = this.shardCache;
    const domains = Array.from(cached.keys());

    return {
      totalShards: 12, // Known 12 domain shards
      loadedShards: cached.size,
      domains,
      lastRefresh: cached.size > 0 ?
        Math.max(...Array.from(cached.values()).map(e => e.loadedAt)) :
        null,
      parseErrors: [...this.parseErrors],
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const flags = getShardRetrieverFlags();
    const total = this.cacheHits + this.cacheMisses;

    return {
      enabled: flags.cacheEnabled,
      size: this.shardCache.size,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      lastCleanup: this.lastCacheCleanup,
    };
  }

  /**
   * Clear the shard cache
   */
  clearCache(): void {
    this.shardCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.lastCacheCleanup = Date.now();
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.shardCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.lastCacheCleanup = null;
    this.parseErrors = [];
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load and parse a shard from a file
   */
  private async loadShardFromFile(filePath: string): Promise<ShardContent | null> {
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      // Normalize line endings to Unix style for consistent parsing
      content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      return this.parseShard(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Parse shard markdown content into structured data
   */
  private parseShard(content: string): ShardContent {
    const lines = content.split('\n');

    // Extract header metadata
    const domain = this.extractMetadata(content, 'Domain') || 'unknown';
    const version = this.extractMetadata(content, 'Version') || '1.0.0';
    const lastUpdated = this.extractMetadata(content, 'Last Updated') || new Date().toISOString().split('T')[0];
    const parentConstitution = this.extractMetadata(content, 'Parent Constitution') || '';

    // Extract sections
    const rules = this.extractRules(content);
    const thresholds = this.extractThresholds(content);
    const invariants = this.extractInvariants(content);
    const patterns = this.extractPatterns(content);
    const agentConstraints = this.extractAgentConstraints(content);
    const escalationTriggers = this.extractEscalationTriggers(content);
    const memoryNamespace = this.extractMemoryNamespace(content);
    const integrationPoints = this.extractIntegrationPoints(content);

    return {
      domain,
      version,
      lastUpdated,
      parentConstitution,
      rules,
      thresholds,
      invariants,
      patterns,
      agentConstraints,
      escalationTriggers,
      memoryNamespace,
      integrationPoints,
      rawContent: content,
    };
  }

  /**
   * Extract metadata from shard header
   */
  private extractMetadata(content: string, key: string): string | null {
    // Handle both Unix (\n) and Windows (\r\n) line endings
    const regex = new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+?)(?:\\r?\\n|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim().replace(/`/g, '') : null;
  }

  /**
   * Extract rules from the Domain Rules section
   */
  private extractRules(content: string): string[] {
    const rules: string[] = [];
    const rulesSection = this.extractSection(content, 'Domain Rules');

    if (!rulesSection) return rules;

    // Match numbered rules (1. **Rule Name**: Description)
    const ruleRegex = /\d+\.\s+\*\*([^*]+)\*\*:\s*(.+?)(?=\n\d+\.|\n\n|$)/gs;
    let match;

    while ((match = ruleRegex.exec(rulesSection)) !== null) {
      const ruleName = match[1].trim();
      const ruleDescription = match[2].trim().replace(/\n/g, ' ');
      rules.push(`${ruleName}: ${ruleDescription}`);
    }

    return rules;
  }

  /**
   * Extract quality thresholds from the Quality Thresholds section
   */
  private extractThresholds(content: string): QualityThresholds {
    const thresholds: QualityThresholds = {};
    const section = this.extractSection(content, 'Quality Thresholds');

    if (!section) return thresholds;

    // Parse markdown table
    const lines = section.split('\n').filter(l => l.includes('|') && !l.includes('---'));

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        const metric = cells[0];
        const minimum = this.parseThresholdValue(cells[1]);
        const target = this.parseThresholdValue(cells[2]);
        const critical = cells.length > 3 ? this.parseThresholdValue(cells[3]) : undefined;

        if (minimum !== null && target !== null) {
          thresholds[metric] = { minimum, target };
          if (critical !== null && critical !== undefined) {
            thresholds[metric].critical = critical;
          }
        }
      }
    }

    return thresholds;
  }

  /**
   * Parse a threshold value from string
   */
  private parseThresholdValue(value: string): number | null {
    if (!value || value === 'N/A') return null;

    // Handle special formats like "< 0.5", "> 0.1/week", "100%", "0 secrets"
    const cleanValue = value
      .replace(/[<>]/g, '')
      .replace(/%/g, '')
      .replace(/\/week/g, '')
      .replace(/\s*secrets?/gi, '')
      .replace(/\s*days?/gi, '')
      .replace(/\s*\(.*?\)/g, '')
      .trim();

    // Handle O(log n) and O(n) notation
    if (cleanValue.includes('O(')) return null;

    const num = parseFloat(cleanValue);
    return isNaN(num) ? null : num;
  }

  /**
   * Extract invariants from the Invariants section
   */
  private extractInvariants(content: string): string[] {
    const invariants: string[] = [];
    const section = this.extractSection(content, 'Invariants');

    if (!section) return invariants;

    // Extract code blocks containing invariants
    const codeBlockRegex = /```[\s\S]*?INVARIANT\s+(\w+):[\s\S]*?```/g;
    let match;

    while ((match = codeBlockRegex.exec(section)) !== null) {
      const invariantName = match[1];
      const fullMatch = match[0]
        .replace(/```/g, '')
        .trim();
      invariants.push(fullMatch);
    }

    return invariants;
  }

  /**
   * Extract patterns from the Patterns section
   */
  private extractPatterns(content: string): PatternReference[] {
    const patterns: PatternReference[] = [];
    const section = this.extractSection(content, 'Patterns');

    if (!section) return patterns;

    // Parse markdown table
    const lines = section.split('\n').filter(l => l.includes('|') && !l.includes('---'));

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        patterns.push({
          name: cells[0],
          location: cells[1].replace(/`/g, ''),
          description: cells[2],
        });
      }
    }

    return patterns;
  }

  /**
   * Extract agent constraints from the Agent Constraints section
   */
  private extractAgentConstraints(content: string): AgentConstraints {
    const constraints: AgentConstraints = {
      primary: [],
      secondary: [],
      support: [],
      readonly: [],
      forbidden: [],
    };

    const section = this.extractSection(content, 'Agent Constraints');
    if (!section) return constraints;

    // Parse markdown table
    const lines = section.split('\n').filter(l => l.includes('|') && !l.includes('---'));

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        const role = cells[0].toLowerCase().replace(/\*\*/g, '');
        const agentId = cells[1].replace(/`/g, '');
        const permissions = cells[2];

        const agentRole: AgentRole = { agentId, permissions };

        if (role.includes('primary')) {
          constraints.primary.push(agentRole);
        } else if (role.includes('secondary')) {
          constraints.secondary.push(agentRole);
        } else if (role.includes('support')) {
          constraints.support.push(agentRole);
        } else if (role.includes('readonly') || role.includes('approval')) {
          constraints.readonly.push(agentRole);
        }
      }
    }

    // Extract forbidden agents from text
    const forbiddenMatch = section.match(/\*\*Forbidden[^:]*:\*\*\s*([^\n]+)/i);
    if (forbiddenMatch) {
      const forbiddenText = forbiddenMatch[1];
      // Extract agent patterns mentioned
      const agentPatterns = forbiddenText.match(/agents?\s+(?:without|MUST\s+NOT)[^.]+/gi);
      if (agentPatterns) {
        constraints.forbidden.push(...agentPatterns);
      }
    }

    return constraints;
  }

  /**
   * Extract escalation triggers from the Escalation Triggers section
   */
  private extractEscalationTriggers(content: string): EscalationTrigger[] {
    const triggers: EscalationTrigger[] = [];
    const section = this.extractSection(content, 'Escalation Triggers');

    if (!section) return triggers;

    // Parse markdown table
    const lines = section.split('\n').filter(l => l.includes('|') && !l.includes('---'));

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        const trigger = cells[0];
        const severity = this.parseSeverity(cells[1]);
        const action = cells[2];

        triggers.push({ trigger, severity, action });
      }
    }

    return triggers;
  }

  /**
   * Parse severity string to enum value
   */
  private parseSeverity(value: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    const normalized = value.toUpperCase().trim();
    if (normalized === 'CRITICAL') return 'CRITICAL';
    if (normalized === 'HIGH') return 'HIGH';
    if (normalized === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Extract memory namespace configuration
   */
  private extractMemoryNamespace(content: string): { namespace: string; retention: string; contradictionCheck: boolean } {
    const section = this.extractSection(content, 'Memory Namespace');

    const result = {
      namespace: 'qe-patterns/unknown',
      retention: '30 days',
      contradictionCheck: true,
    };

    if (!section) return result;

    const namespaceMatch = section.match(/\*\*Namespace\*\*:\s*`([^`]+)`/);
    if (namespaceMatch) result.namespace = namespaceMatch[1];

    const retentionMatch = section.match(/\*\*Retention\*\*:\s*([^\n]+)/);
    if (retentionMatch) result.retention = retentionMatch[1].trim();

    const contradictionMatch = section.match(/\*\*Contradiction Check\*\*:\s*(\w+)/i);
    if (contradictionMatch) {
      result.contradictionCheck = contradictionMatch[1].toLowerCase() === 'enabled';
    }

    return result;
  }

  /**
   * Extract integration points
   */
  private extractIntegrationPoints(content: string): IntegrationPoint[] {
    const points: IntegrationPoint[] = [];
    const section = this.extractSection(content, 'Integration Points');

    if (!section) return points;

    // Parse markdown table
    const lines = section.split('\n').filter(l => l.includes('|') && !l.includes('---'));

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        const domain = cells[0].replace(/`/g, '');
        const type = this.parseIntegrationType(cells[1]);
        const purpose = cells[2];

        points.push({ domain, type, purpose });
      }
    }

    return points;
  }

  /**
   * Parse integration type string
   */
  private parseIntegrationType(value: string): 'Input' | 'Output' | 'Bidirectional' {
    const normalized = value.toLowerCase().trim();
    if (normalized === 'bidirectional') return 'Bidirectional';
    if (normalized === 'output') return 'Output';
    return 'Input';
  }

  /**
   * Extract a section by heading
   */
  private extractSection(content: string, heading: string): string | null {
    // Match section from ## Heading to next ## or end
    const regex = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |\\n---\\n\\*|$)`, 'i');
    const match = content.match(regex);
    return match ? match[0].replace(new RegExp(`## ${heading}\\n*`, 'i'), '').trim() : null;
  }

  /**
   * Cache a shard if caching is enabled
   */
  private cacheShardIfEnabled(domain: string, shard: ShardContent): void {
    const flags = getShardRetrieverFlags();
    if (!flags.cacheEnabled) return;

    const now = Date.now();
    this.shardCache.set(domain, {
      shard,
      loadedAt: now,
      expiresAt: now + flags.cacheTtlMs,
    });
  }

  /**
   * Get a cached shard if valid
   */
  private getCachedShard(domain: string): ShardContent | null {
    const flags = getShardRetrieverFlags();
    if (!flags.cacheEnabled) return null;

    const entry = this.shardCache.get(domain);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.shardCache.delete(domain);
      return null;
    }

    return entry.shard;
  }

  /**
   * Get all shards from cache or load them
   */
  private async getAllCachedOrLoadedShards(): Promise<Map<string, ShardContent>> {
    const flags = getShardRetrieverFlags();

    // If we have cached shards and caching is enabled, use them
    if (flags.cacheEnabled && this.shardCache.size > 0) {
      const result = new Map<string, ShardContent>();
      const now = Date.now();

      for (const [domain, entry] of this.shardCache) {
        if (now <= entry.expiresAt) {
          result.set(domain, entry.shard);
        }
      }

      // If we have enough valid entries, return them
      if (result.size > 0) {
        return result;
      }
    }

    // Otherwise load all shards
    return this.loadAllShards();
  }

  /**
   * Get domains matching an intent
   */
  private getDomainsForIntent(intent: string): string[] {
    const domains = new Set<string>();

    for (const [keyword, domainList] of Object.entries(INTENT_DOMAIN_MAPPING)) {
      if (intent.includes(keyword)) {
        domainList.forEach(d => domains.add(d));
      }
    }

    return Array.from(domains);
  }

  /**
   * Deduplicate agent roles by agentId
   */
  private dedupeAgentRoles(roles: AgentRole[]): AgentRole[] {
    const seen = new Map<string, AgentRole>();
    for (const role of roles) {
      if (!seen.has(role.agentId)) {
        seen.set(role.agentId, role);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Log an error
   */
  private logError(message: string): void {
    const flags = governanceFlags.getFlags();
    if (flags.global.logViolations) {
      console.error(`[ShardRetriever] ${message}`);
    }
  }
}

/**
 * Singleton instance
 */
export const shardRetrieverIntegration = new ShardRetrieverIntegration();
