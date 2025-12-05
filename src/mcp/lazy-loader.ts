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

export class LazyToolLoader {
  private state: LoaderState;
  private toolCache: Map<string, Tool>;

  constructor() {
    this.state = {
      loadedDomains: new Set(),
      coreLoaded: false,
      totalToolsLoaded: 0,
    };
    this.toolCache = new Map();
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
