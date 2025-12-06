/**
 * Lazy Tool Loader for Hierarchical MCP Tools
 * Phase 2 Implementation - Issue #115
 *
 * Manages dynamic loading of tool domains to reduce context consumption.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  CORE_TOOLS,
  DOMAIN_TOOLS,
  SPECIALIZED_TOOLS,
  DOMAIN_KEYWORDS,
  ToolDomain,
  SpecializedDomain,
  detectDomainsFromMessage
} from './tool-categories.js';
import { agenticQETools } from './tools.js';

export interface LoaderState {
  loadedDomains: Set<ToolDomain | SpecializedDomain>;
  coreLoaded: boolean;
  totalToolsLoaded: number;
}

export interface LoadResult {
  success: boolean;
  domain: string;
  toolsLoaded: string[];
  alreadyLoaded: boolean;
}

export interface UsageStats {
  toolName: string;
  callCount: number;
  lastUsed: number;
  domain?: string;
}

export interface DomainUsageStats {
  domain: string;
  loadCount: number;
  toolUsageCount: number;
  lastLoaded: number;
  averageToolsPerLoad: number;
}

export class LazyToolLoader {
  private state: LoaderState;
  private toolCache: Map<string, Tool>;
  private toolUsageCount: Map<string, number>;
  private toolLastUsed: Map<string, number>;
  private domainUsageCount: Map<string, number>;
  private domainLastLoaded: Map<string, number>;
  private domainToolUsageCount: Map<string, number>;
  private usageTrackingEnabled: boolean;

  constructor(enableUsageTracking = true) {
    this.state = {
      loadedDomains: new Set(),
      coreLoaded: false,
      totalToolsLoaded: 0,
    };
    this.toolCache = new Map();
    this.toolUsageCount = new Map();
    this.toolLastUsed = new Map();
    this.domainUsageCount = new Map();
    this.domainLastLoaded = new Map();
    this.domainToolUsageCount = new Map();
    this.usageTrackingEnabled = enableUsageTracking;
    this.indexTools();
  }

  /**
   * Index all tools for quick lookup
   */
  private indexTools(): void {
    for (const tool of agenticQETools) {
      this.toolCache.set(tool.name, tool);
    }
  }

  /**
   * Get core tools (always loaded)
   */
  getCoreTools(): Tool[] {
    this.state.coreLoaded = true;
    return CORE_TOOLS
      .map(name => this.toolCache.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  /**
   * Load a specific domain's tools
   */
  loadDomain(domain: ToolDomain | SpecializedDomain): LoadResult {
    // Track domain usage
    if (this.usageTrackingEnabled) {
      const currentCount = this.domainUsageCount.get(domain) || 0;
      this.domainUsageCount.set(domain, currentCount + 1);
      this.domainLastLoaded.set(domain, Date.now());
    }

    // Check if already loaded
    if (this.state.loadedDomains.has(domain)) {
      return {
        success: true,
        domain,
        toolsLoaded: [],
        alreadyLoaded: true,
      };
    }

    // Get tools for domain
    const toolNames = domain in DOMAIN_TOOLS
      ? DOMAIN_TOOLS[domain as ToolDomain]
      : SPECIALIZED_TOOLS[domain as SpecializedDomain] || [];

    const loadedTools = toolNames.filter(name => this.toolCache.has(name));

    this.state.loadedDomains.add(domain);
    this.state.totalToolsLoaded += loadedTools.length;

    return {
      success: true,
      domain,
      toolsLoaded: loadedTools,
      alreadyLoaded: false,
    };
  }

  /**
   * Get tools for a loaded domain
   */
  getToolsForDomain(domain: ToolDomain | SpecializedDomain): Tool[] {
    const toolNames = domain in DOMAIN_TOOLS
      ? DOMAIN_TOOLS[domain as ToolDomain]
      : SPECIALIZED_TOOLS[domain as SpecializedDomain] || [];

    return toolNames
      .map(name => this.toolCache.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  /**
   * Auto-detect and load domains based on message content
   */
  autoLoadFromMessage(message: string): LoadResult[] {
    const domains = detectDomainsFromMessage(message);
    return domains.map(domain => this.loadDomain(domain));
  }

  /**
   * Get all currently loaded tools
   */
  getLoadedTools(): Tool[] {
    const tools: Tool[] = [];

    // Always include core
    tools.push(...this.getCoreTools());

    // Add loaded domains
    for (const domain of this.state.loadedDomains) {
      tools.push(...this.getToolsForDomain(domain));
    }

    return tools;
  }

  /**
   * Get current loader state
   */
  getState(): LoaderState {
    return { ...this.state, loadedDomains: new Set(this.state.loadedDomains) };
  }

  /**
   * Check if a domain is loaded
   */
  isDomainLoaded(domain: ToolDomain | SpecializedDomain): boolean {
    return this.state.loadedDomains.has(domain);
  }

  /**
   * Get available domains that haven't been loaded
   */
  getAvailableDomains(): (ToolDomain | SpecializedDomain)[] {
    const allDomains = [
      ...Object.keys(DOMAIN_TOOLS),
      ...Object.keys(SPECIALIZED_TOOLS),
    ] as (ToolDomain | SpecializedDomain)[];

    return allDomains.filter(d => !this.state.loadedDomains.has(d));
  }

  /**
   * Get statistics about tool loading
   */
  getStats(): {
    coreTools: number;
    loadedDomains: string[];
    availableDomains: string[];
    totalLoaded: number;
    totalAvailable: number;
  } {
    const availableDomains = this.getAvailableDomains();
    return {
      coreTools: CORE_TOOLS.length,
      loadedDomains: Array.from(this.state.loadedDomains),
      availableDomains,
      totalLoaded: this.state.totalToolsLoaded + CORE_TOOLS.length,
      totalAvailable: this.toolCache.size,
    };
  }

  /**
   * Reset loader state (useful for testing)
   */
  reset(): void {
    this.state = {
      loadedDomains: new Set(),
      coreLoaded: false,
      totalToolsLoaded: 0,
    };
  }

  /**
   * Preload commonly used domain combinations
   */
  preloadCommonDomains(): void {
    // Testing workflows often need coverage and quality
    this.loadDomain('coverage');
    this.loadDomain('quality');
  }

  /**
   * Track tool usage when a tool is called
   */
  trackToolUsage(toolName: string): void {
    if (!this.usageTrackingEnabled) return;

    const currentCount = this.toolUsageCount.get(toolName) || 0;
    this.toolUsageCount.set(toolName, currentCount + 1);
    this.toolLastUsed.set(toolName, Date.now());

    // Find the domain for this tool and track domain-level usage
    const domain = this.findDomainForTool(toolName);
    if (domain) {
      const currentDomainToolCount = this.domainToolUsageCount.get(domain) || 0;
      this.domainToolUsageCount.set(domain, currentDomainToolCount + 1);
    }
  }

  /**
   * Find which domain a tool belongs to
   */
  private findDomainForTool(toolName: string): string | undefined {
    // Check domain tools
    for (const [domain, tools] of Object.entries(DOMAIN_TOOLS)) {
      if (tools.includes(toolName as any)) {
        return domain;
      }
    }

    // Check specialized tools
    for (const [domain, tools] of Object.entries(SPECIALIZED_TOOLS)) {
      if (tools.includes(toolName as any)) {
        return domain;
      }
    }

    // Check core tools
    if (CORE_TOOLS.includes(toolName as any)) {
      return 'core';
    }

    return undefined;
  }

  /**
   * Get usage statistics for all tools
   */
  getToolUsageStats(): UsageStats[] {
    const stats: UsageStats[] = [];

    for (const [toolName, callCount] of this.toolUsageCount.entries()) {
      stats.push({
        toolName,
        callCount,
        lastUsed: this.toolLastUsed.get(toolName) || 0,
        domain: this.findDomainForTool(toolName),
      });
    }

    // Sort by call count descending
    return stats.sort((a, b) => b.callCount - a.callCount);
  }

  /**
   * Get usage statistics for domains
   */
  getDomainUsageStats(): DomainUsageStats[] {
    const stats: DomainUsageStats[] = [];

    for (const [domain, loadCount] of this.domainUsageCount.entries()) {
      const toolUsageCount = this.domainToolUsageCount.get(domain) || 0;
      stats.push({
        domain,
        loadCount,
        toolUsageCount,
        lastLoaded: this.domainLastLoaded.get(domain) || 0,
        averageToolsPerLoad: toolUsageCount / Math.max(loadCount, 1),
      });
    }

    // Sort by tool usage count descending
    return stats.sort((a, b) => b.toolUsageCount - a.toolUsageCount);
  }

  /**
   * Get top N most frequently used tools
   */
  getTopTools(limit = 10): UsageStats[] {
    return this.getToolUsageStats().slice(0, limit);
  }

  /**
   * Get top N most frequently used domains
   */
  getTopDomains(limit = 5): DomainUsageStats[] {
    return this.getDomainUsageStats().slice(0, limit);
  }

  /**
   * Preload domains based on usage frequency
   * Loads the most frequently used domains that aren't already loaded
   */
  preloadFrequentDomains(threshold = 5): LoadResult[] {
    const results: LoadResult[] = [];
    const domainStats = this.getDomainUsageStats();

    for (const stat of domainStats) {
      // Skip if already loaded or below threshold
      if (this.state.loadedDomains.has(stat.domain as any) || stat.toolUsageCount < threshold) {
        continue;
      }

      // Load the domain
      const result = this.loadDomain(stat.domain as ToolDomain | SpecializedDomain);
      results.push(result);
    }

    return results;
  }

  /**
   * Export usage statistics as JSON
   */
  exportUsageStats(): {
    toolStats: UsageStats[];
    domainStats: DomainUsageStats[];
    exportedAt: number;
  } {
    return {
      toolStats: this.getToolUsageStats(),
      domainStats: this.getDomainUsageStats(),
      exportedAt: Date.now(),
    };
  }

  /**
   * Import usage statistics from JSON
   */
  importUsageStats(data: {
    toolStats: UsageStats[];
    domainStats: DomainUsageStats[];
  }): void {
    // Import tool stats
    for (const stat of data.toolStats) {
      this.toolUsageCount.set(stat.toolName, stat.callCount);
      this.toolLastUsed.set(stat.toolName, stat.lastUsed);
    }

    // Import domain stats
    for (const stat of data.domainStats) {
      this.domainUsageCount.set(stat.domain, stat.loadCount);
      this.domainToolUsageCount.set(stat.domain, stat.toolUsageCount);
      this.domainLastLoaded.set(stat.domain, stat.lastLoaded);
    }
  }

  /**
   * Clear all usage statistics
   */
  clearUsageStats(): void {
    this.toolUsageCount.clear();
    this.toolLastUsed.clear();
    this.domainUsageCount.clear();
    this.domainLastLoaded.clear();
    this.domainToolUsageCount.clear();
  }

  /**
   * Enable or disable usage tracking
   */
  setUsageTracking(enabled: boolean): void {
    this.usageTrackingEnabled = enabled;
  }

  /**
   * Check if usage tracking is enabled
   */
  isUsageTrackingEnabled(): boolean {
    return this.usageTrackingEnabled;
  }
}

// Singleton instance for use across the application
let loaderInstance: LazyToolLoader | null = null;

export function getToolLoader(): LazyToolLoader {
  if (!loaderInstance) {
    loaderInstance = new LazyToolLoader();
  }
  return loaderInstance;
}

export function resetToolLoader(): void {
  loaderInstance = null;
}
