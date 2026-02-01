/**
 * A2A Discovery Service
 *
 * Provides agent discovery functionality per RFC 8615 well-known URI standard.
 * Supports platform aggregate cards, individual agent cards, and extended cards
 * for authenticated clients.
 *
 * @module adapters/a2a/discovery/discovery-service
 * @see https://tools.ietf.org/html/rfc8615
 * @see https://a2a-protocol.org/latest/topics/agent-discovery/
 */

import {
  AgentCard,
  QEAgentCard,
  ExtendedAgentCard,
  AgentSkill,
  AgentCapabilities,
  AgentProvider,
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,
} from '../agent-cards/schema.js';
import { AgentCardGenerator } from '../agent-cards/generator.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the Discovery Service
 */
export interface DiscoveryServiceConfig {
  /** Agent card generator instance */
  readonly generator: AgentCardGenerator;
  /** Base URL for the platform */
  readonly baseUrl: string;
  /** Cache TTL in milliseconds (default: 1 hour) */
  readonly cacheTtl?: number;
  /** Platform name for aggregate card */
  readonly platformName?: string;
  /** Platform description */
  readonly platformDescription?: string;
  /** Platform version */
  readonly platformVersion?: string;
  /** Enable access metrics tracking */
  readonly enableMetrics?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_DISCOVERY_CONFIG = {
  cacheTtl: 3600000, // 1 hour
  platformName: 'Agentic QE Platform',
  platformDescription: 'AI-powered Quality Engineering platform with 68+ specialized agents',
  platformVersion: '3.0.0',
  enableMetrics: true,
} as const;

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cached card entry
 */
interface CacheEntry<T> {
  readonly card: T;
  readonly etag: string;
  readonly cachedAt: number;
  readonly expiresAt: number;
}

/**
 * Access metrics for a card
 */
export interface CardAccessMetrics {
  readonly agentId: string;
  readonly accessCount: number;
  readonly lastAccessedAt: number;
  readonly extendedAccessCount: number;
}

// ============================================================================
// Search/Filter Types
// ============================================================================

/**
 * Search criteria for finding agents
 */
export interface AgentSearchCriteria {
  /** Filter by capability */
  readonly capability?: keyof AgentCapabilities;
  /** Filter by skill ID */
  readonly skill?: string;
  /** Filter by tag */
  readonly tag?: string;
  /** Filter by domain (QE-specific) */
  readonly domain?: string;
  /** Filter by streaming support */
  readonly streaming?: boolean;
  /** Maximum results to return */
  readonly limit?: number;
}

/**
 * Search result
 */
export interface AgentSearchResult {
  readonly agents: QEAgentCard[];
  readonly total: number;
  readonly criteria: AgentSearchCriteria;
}

// ============================================================================
// Extended Card Types
// ============================================================================

/**
 * Rate limit information for extended cards
 */
export interface RateLimitInfo {
  readonly requestsPerMinute: number;
  readonly requestsPerHour: number;
  readonly requestsPerDay: number;
}

/**
 * Usage statistics for extended cards
 */
export interface UsageStats {
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly averageResponseTimeMs: number;
}

/**
 * Extended card data available to authenticated clients
 */
export interface ExtendedCardData {
  readonly rateLimits: RateLimitInfo;
  readonly usageStats?: UsageStats;
  readonly supportContact?: string;
  readonly sla?: {
    readonly uptimeTarget: number;
    readonly responseTimeTarget: number;
  };
  readonly authenticationRequired: boolean;
  readonly requiredScopes?: string[];
}

// ============================================================================
// Discovery Service Implementation
// ============================================================================

/**
 * Discovery Service for A2A agent discovery
 *
 * Provides RFC 8615 compliant agent discovery with caching, metrics tracking,
 * and support for extended cards for authenticated clients.
 */
export class DiscoveryService {
  private readonly config: Required<Omit<DiscoveryServiceConfig, 'generator'>> & {
    generator: AgentCardGenerator;
  };

  /** Cache for individual agent cards */
  private readonly cardCache: Map<string, CacheEntry<QEAgentCard>> = new Map();

  /** Cache for platform aggregate card */
  private platformCardCache: CacheEntry<AgentCard> | null = null;

  /** Access metrics by agent ID */
  private readonly accessMetrics: Map<string, CardAccessMetrics> = new Map();

  /** All loaded agent cards */
  private agentCards: Map<string, QEAgentCard> = new Map();

  /** Flag indicating if cards have been loaded */
  private cardsLoaded = false;

  constructor(config: DiscoveryServiceConfig) {
    this.config = {
      ...DEFAULT_DISCOVERY_CONFIG,
      ...config,
    };
  }

  // ============================================================================
  // Card Loading
  // ============================================================================

  /**
   * Load agent cards from the generator
   */
  async loadCards(agentsBasePath: string): Promise<void> {
    const result = await this.config.generator.generateAllCards(agentsBasePath);
    this.agentCards = result.cards;
    this.cardsLoaded = true;

    // Clear caches when cards are reloaded
    this.cardCache.clear();
    this.platformCardCache = null;
  }

  /**
   * Register a pre-generated agent card
   */
  registerCard(card: QEAgentCard): void {
    this.agentCards.set(card.name, card);
    this.invalidateCache(card.name);
  }

  /**
   * Register multiple pre-generated agent cards
   */
  registerCards(cards: Map<string, QEAgentCard>): void {
    for (const [name, card] of cards) {
      this.agentCards.set(name, card);
    }
    this.cardCache.clear();
    this.platformCardCache = null;
    this.cardsLoaded = true;
  }

  /**
   * Check if cards have been loaded
   */
  hasLoadedCards(): boolean {
    return this.cardsLoaded;
  }

  /**
   * Get the number of registered agents
   */
  getAgentCount(): number {
    return this.agentCards.size;
  }

  // ============================================================================
  // Platform Card
  // ============================================================================

  /**
   * Get the aggregate platform card
   *
   * Returns a card representing the entire QE platform with aggregated
   * capabilities and skills from all registered agents.
   */
  async getPlatformCard(): Promise<AgentCard> {
    // Check cache
    if (this.platformCardCache && !this.isCacheExpired(this.platformCardCache)) {
      return this.platformCardCache.card;
    }

    // Generate aggregate card
    const platformCard = this.generatePlatformCard();

    // Cache the card
    const etag = this.generateEtag(platformCard);
    this.platformCardCache = {
      card: platformCard,
      etag,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTtl,
    };

    return platformCard;
  }

  /**
   * Get the ETag for the platform card
   */
  getPlatformCardEtag(): string | null {
    return this.platformCardCache?.etag ?? null;
  }

  /**
   * Generate the aggregate platform card
   */
  private generatePlatformCard(): AgentCard {
    // Aggregate all skills
    const allSkills: AgentSkill[] = [];
    const skillIds = new Set<string>();

    for (const card of this.agentCards.values()) {
      for (const skill of card.skills) {
        if (!skillIds.has(skill.id)) {
          skillIds.add(skill.id);
          allSkills.push(skill);
        }
      }
    }

    // Determine aggregate capabilities
    const capabilities: AgentCapabilities = {
      streaming: Array.from(this.agentCards.values()).some((c) => c.capabilities.streaming),
      pushNotifications: Array.from(this.agentCards.values()).some(
        (c) => c.capabilities.pushNotifications
      ),
      stateTransitionHistory: Array.from(this.agentCards.values()).some(
        (c) => c.capabilities.stateTransitionHistory
      ),
    };

    // Collect all unique input/output modes
    const inputModes = new Set<string>();
    const outputModes = new Set<string>();

    for (const card of this.agentCards.values()) {
      for (const mode of card.defaultInputModes ?? DEFAULT_INPUT_MODES) {
        inputModes.add(mode);
      }
      for (const mode of card.defaultOutputModes ?? DEFAULT_OUTPUT_MODES) {
        outputModes.add(mode);
      }
    }

    return {
      name: this.config.platformName,
      description: this.config.platformDescription,
      url: this.config.baseUrl,
      version: this.config.platformVersion,
      provider: DEFAULT_QE_PROVIDER,
      documentationUrl: `${this.config.baseUrl}/docs`,
      capabilities,
      skills: allSkills,
      defaultInputModes: Array.from(inputModes),
      defaultOutputModes: Array.from(outputModes),
      supportsAuthenticatedExtendedCard: true,
    };
  }

  // ============================================================================
  // Individual Agent Cards
  // ============================================================================

  /**
   * Get an individual agent card by ID
   *
   * @param agentId - The agent identifier (e.g., 'qe-test-architect')
   * @returns The agent card or null if not found
   */
  async getAgentCard(agentId: string): Promise<QEAgentCard | null> {
    // Check cache
    const cached = this.cardCache.get(agentId);
    if (cached && !this.isCacheExpired(cached)) {
      this.recordAccess(agentId, false);
      return cached.card;
    }

    // Look up agent card
    const card = this.agentCards.get(agentId);
    if (!card) {
      return null;
    }

    // Cache the card
    const etag = this.generateEtag(card);
    this.cardCache.set(agentId, {
      card,
      etag,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTtl,
    });

    this.recordAccess(agentId, false);
    return card;
  }

  /**
   * Get the ETag for an agent card
   */
  getAgentCardEtag(agentId: string): string | null {
    return this.cardCache.get(agentId)?.etag ?? null;
  }

  /**
   * Check if an agent exists
   */
  hasAgent(agentId: string): boolean {
    return this.agentCards.has(agentId);
  }

  /**
   * Get all registered agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agentCards.keys());
  }

  // ============================================================================
  // Extended Cards
  // ============================================================================

  /**
   * Get an extended agent card for authenticated clients
   *
   * Extended cards include additional information such as rate limits,
   * usage statistics, and authentication requirements.
   *
   * @param agentId - The agent identifier
   * @returns Extended agent card or null if not found
   */
  async getExtendedAgentCard(agentId: string): Promise<ExtendedAgentCard | null> {
    const baseCard = await this.getAgentCard(agentId);
    if (!baseCard) {
      return null;
    }

    this.recordAccess(agentId, true);

    // Get access metrics for usage stats
    const metrics = this.accessMetrics.get(agentId);

    const extendedData: ExtendedCardData = {
      rateLimits: this.getDefaultRateLimits(),
      usageStats: metrics
        ? {
            totalRequests: metrics.accessCount,
            successfulRequests: metrics.accessCount,
            failedRequests: 0,
            averageResponseTimeMs: 150,
          }
        : undefined,
      supportContact: 'support@agentic-qe.io',
      sla: {
        uptimeTarget: 99.9,
        responseTimeTarget: 200,
      },
      authenticationRequired: true,
      requiredScopes: this.getRequiredScopesForAgent(agentId),
    };

    return {
      ...baseCard,
      extended: extendedData,
    };
  }

  /**
   * Get default rate limits for agents
   */
  private getDefaultRateLimits(): RateLimitInfo {
    return {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
    };
  }

  /**
   * Get required scopes for an agent
   */
  private getRequiredScopesForAgent(agentId: string): string[] {
    const card = this.agentCards.get(agentId);
    if (!card?.qeMetadata?.domain) {
      return ['agent:read'];
    }

    const domain = card.qeMetadata.domain;
    return [`${domain}:read`, `${domain}:execute`];
  }

  // ============================================================================
  // Search and Filter
  // ============================================================================

  /**
   * Find agents by capability
   *
   * @param capability - The capability to filter by (e.g., 'streaming')
   * @returns List of agents that support the capability
   */
  async findByCapability(capability: keyof AgentCapabilities): Promise<QEAgentCard[]> {
    const results: QEAgentCard[] = [];

    for (const card of this.agentCards.values()) {
      if (card.capabilities[capability]) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Find agents by skill ID
   *
   * @param skillId - The skill ID to search for
   * @returns List of agents that have the skill
   */
  async findBySkill(skillId: string): Promise<QEAgentCard[]> {
    const results: QEAgentCard[] = [];

    for (const card of this.agentCards.values()) {
      if (card.skills.some((s) => s.id === skillId)) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Find agents by tag
   *
   * @param tag - The tag to search for
   * @returns List of agents that have the tag
   */
  async findByTag(tag: string): Promise<QEAgentCard[]> {
    const results: QEAgentCard[] = [];
    const lowerTag = tag.toLowerCase();

    for (const card of this.agentCards.values()) {
      for (const skill of card.skills) {
        if (skill.tags?.some((t) => t.toLowerCase() === lowerTag)) {
          results.push(card);
          break;
        }
      }
    }

    return results;
  }

  /**
   * Find agents by domain (QE-specific)
   *
   * @param domain - The domain to filter by (e.g., 'test-generation')
   * @returns List of agents in the domain
   */
  async findByDomain(domain: string): Promise<QEAgentCard[]> {
    const results: QEAgentCard[] = [];

    for (const card of this.agentCards.values()) {
      if (card.qeMetadata?.domain === domain) {
        results.push(card);
      }
    }

    return results;
  }

  /**
   * Search agents with multiple criteria
   *
   * @param criteria - Search criteria
   * @returns Search result with matching agents
   */
  async search(criteria: AgentSearchCriteria): Promise<AgentSearchResult> {
    let results = Array.from(this.agentCards.values());

    // Filter by capability
    if (criteria.capability) {
      results = results.filter((card) => card.capabilities[criteria.capability!]);
    }

    // Filter by streaming
    if (criteria.streaming !== undefined) {
      results = results.filter((card) => card.capabilities.streaming === criteria.streaming);
    }

    // Filter by skill
    if (criteria.skill) {
      results = results.filter((card) => card.skills.some((s) => s.id === criteria.skill));
    }

    // Filter by tag
    if (criteria.tag) {
      const lowerTag = criteria.tag.toLowerCase();
      results = results.filter((card) =>
        card.skills.some((skill) => skill.tags?.some((t) => t.toLowerCase() === lowerTag))
      );
    }

    // Filter by domain
    if (criteria.domain) {
      results = results.filter((card) => card.qeMetadata?.domain === criteria.domain);
    }

    const total = results.length;

    // Apply limit
    if (criteria.limit && criteria.limit > 0) {
      results = results.slice(0, criteria.limit);
    }

    return {
      agents: results,
      total,
      criteria,
    };
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  /**
   * Get access metrics for an agent
   */
  getAccessMetrics(agentId: string): CardAccessMetrics | null {
    return this.accessMetrics.get(agentId) ?? null;
  }

  /**
   * Get all access metrics
   */
  getAllAccessMetrics(): CardAccessMetrics[] {
    return Array.from(this.accessMetrics.values());
  }

  /**
   * Record an access to an agent card
   */
  private recordAccess(agentId: string, isExtended: boolean): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const existing = this.accessMetrics.get(agentId);
    const now = Date.now();

    if (existing) {
      // Using Object.assign to create a new object since the interface is readonly
      const updated: CardAccessMetrics = {
        agentId: existing.agentId,
        accessCount: existing.accessCount + 1,
        lastAccessedAt: now,
        extendedAccessCount: existing.extendedAccessCount + (isExtended ? 1 : 0),
      };
      this.accessMetrics.set(agentId, updated);
    } else {
      this.accessMetrics.set(agentId, {
        agentId,
        accessCount: 1,
        lastAccessedAt: now,
        extendedAccessCount: isExtended ? 1 : 0,
      });
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Check if a cache entry is expired
   */
  private isCacheExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Generate an ETag for a card
   */
  private generateEtag(card: AgentCard | QEAgentCard): string {
    const content = JSON.stringify(card);
    // Simple hash for ETag
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }

  /**
   * Invalidate cache for a specific agent
   */
  invalidateCache(agentId: string): void {
    this.cardCache.delete(agentId);
    this.platformCardCache = null;
  }

  /**
   * Invalidate all caches
   */
  invalidateAllCaches(): void {
    this.cardCache.clear();
    this.platformCardCache = null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cardCacheSize: number;
    hasPlatformCard: boolean;
    oldestEntry: number | null;
  } {
    let oldest: number | null = null;

    for (const entry of this.cardCache.values()) {
      if (oldest === null || entry.cachedAt < oldest) {
        oldest = entry.cachedAt;
      }
    }

    return {
      cardCacheSize: this.cardCache.size,
      hasPlatformCard: this.platformCardCache !== null,
      oldestEntry: oldest,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Discovery Service instance
 *
 * @param config - Service configuration
 * @returns Discovery service instance
 *
 * @example
 * ```typescript
 * const discovery = createDiscoveryService({
 *   generator: agentCardGenerator,
 *   baseUrl: 'https://qe.example.com',
 *   cacheTtl: 3600000, // 1 hour
 * });
 *
 * // Get platform card
 * const platformCard = await discovery.getPlatformCard();
 *
 * // Get agent card
 * const agentCard = await discovery.getAgentCard('qe-test-architect');
 *
 * // Search by capability
 * const agents = await discovery.findByCapability('streaming');
 * ```
 */
export function createDiscoveryService(config: DiscoveryServiceConfig): DiscoveryService {
  return new DiscoveryService(config);
}
