/**
 * Progressive Disclosure System for Skill Management
 * Achieves 98% token reduction by lazy-loading skills on demand
 */

/**
 * Skill priority levels for loading strategy
 */
export type SkillPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Skill categories for organization and discovery
 */
export type SkillCategory =
  | 'qe-core'           // Core QE principles (agentic-quality-engineering, holistic-testing-pact)
  | 'qe-methodology'    // Testing methodologies (tdd-london-chicago, context-driven-testing)
  | 'qe-specialized'    // Domain-specific (api-testing, performance-testing, security-testing)
  | 'qe-advanced'       // Advanced techniques (mutation-testing, chaos-engineering)
  | 'advanced'          // Non-QE skills (swarm-orchestration, hooks-automation)
  | 'integration';      // Integration tools (github-*, flow-nexus-*)

/**
 * Lightweight metadata for skill discovery without loading full content
 * Reduces initialization tokens from ~50,000 to ~1,000 (98% reduction)
 */
export interface SkillMetadata {
  /** Unique skill identifier (matches directory name) */
  id: string;

  /** Human-readable skill name */
  name: string;

  /** Category for organization and filtering */
  category: SkillCategory;

  /** Short description (<100 chars) for quick reference */
  description: string;

  /** Keywords for semantic search and discovery */
  keywords: string[];

  /** Other skills this skill depends on (lazy-loaded together) */
  dependencies?: string[];

  /** Estimated token count for full skill content */
  estimatedTokens: number;

  /** Loading priority (critical skills preloaded on init) */
  priority: SkillPriority;

  /** File path relative to .claude/skills/ */
  path: string;

  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Full skill content (loaded on demand)
 */
export interface Skill {
  /** Metadata (duplicated for convenience) */
  metadata: SkillMetadata;

  /** Full markdown content */
  content: string;

  /** Parsed frontmatter from SKILL.md */
  frontmatter: {
    name: string;
    description: string;
    [key: string]: any;
  };

  /** Timestamp when loaded into memory */
  loadedAt: Date;
}

/**
 * Manifest containing all skill metadata
 */
export interface SkillManifest {
  /** Manifest version for compatibility checking */
  version: string;

  /** Generation timestamp */
  generatedAt: string;

  /** Total number of skills */
  totalSkills: number;

  /** Skills by category for quick filtering */
  categoryCounts: Record<SkillCategory, number>;

  /** All skill metadata (lightweight) */
  skills: SkillMetadata[];
}

/**
 * Skill loader configuration
 */
export interface SkillLoaderConfig {
  /** Path to skills directory */
  skillsDir: string;

  /** Path to manifest file */
  manifestPath: string;

  /** LRU cache size (number of skills to keep in memory) */
  cacheSize: number;

  /** Cache TTL in milliseconds (0 = no expiry) */
  cacheTTL: number;

  /** Preload critical skills on initialization */
  preloadCritical: boolean;

  /** Enable usage analytics for optimization */
  enableAnalytics: boolean;
}

/**
 * Skill usage statistics for optimization
 */
export interface SkillUsageStats {
  /** Skill ID */
  skillId: string;

  /** Number of times loaded */
  loadCount: number;

  /** Last load timestamp */
  lastLoaded: Date;

  /** Average time to load (ms) */
  avgLoadTime: number;

  /** Agents that use this skill */
  usedByAgents: string[];
}

/**
 * Search filter for skill discovery
 */
export interface SkillSearchFilter {
  /** Filter by category */
  category?: SkillCategory;

  /** Filter by priority */
  priority?: SkillPriority;

  /** Keyword search */
  keyword?: string;

  /** Full-text search in description */
  query?: string;

  /** Filter by dependencies */
  hasDependencies?: boolean;
}
