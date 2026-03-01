/**
 * Agentic QE v3 - Domain Service Registry
 *
 * CQ-005: Breaks the bidirectional dependency between coordination/ and domains/.
 * Coordination depends on this registry (in shared/) to resolve domain services,
 * and domains register their factories here at startup.
 *
 * This ensures the dependency direction is always:
 *   domains/ -> shared/ (to register)
 *   coordination/ -> shared/ (to resolve)
 *   domains/ -> coordination/ (allowed)
 *
 * But never:
 *   coordination/ -> domains/ (eliminated)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceFactory = (...args: any[]) => any;

/**
 * Well-known service keys for type-safe resolution.
 * Domains register factories under these keys, and coordination
 * resolves them without importing from domains/.
 */
export const ServiceKeys = {
  // coverage-analysis domain
  CoverageAnalyzerService: 'coverage-analysis.CoverageAnalyzerService',

  // security-compliance domain
  SecurityScannerService: 'security-compliance.SecurityScannerService',
  isSemgrepAvailable: 'security-compliance.isSemgrepAvailable',
  runSemgrepWithRules: 'security-compliance.runSemgrepWithRules',
  convertSemgrepFindings: 'security-compliance.convertSemgrepFindings',

  // test-generation domain
  createTestGeneratorService: 'test-generation.createTestGeneratorService',

  // code-intelligence domain
  KnowledgeGraphService: 'code-intelligence.KnowledgeGraphService',

  // quality-assessment domain
  QualityAnalyzerService: 'quality-assessment.QualityAnalyzerService',
} as const;

export type ServiceKey = (typeof ServiceKeys)[keyof typeof ServiceKeys];

/**
 * Global domain service registry.
 *
 * Domain modules call `registerService()` to provide factory functions.
 * Coordination modules call `resolveService()` to obtain factories
 * without importing domain code directly.
 */
class DomainServiceRegistryImpl {
  private readonly factories = new Map<string, ServiceFactory>();

  /**
   * Register a service factory under a well-known key.
   * Called by domain modules during initialization.
   */
  register(key: string, factory: ServiceFactory): void {
    this.factories.set(key, factory);
  }

  /**
   * Resolve a service factory by key.
   * Called by coordination modules to obtain domain services.
   *
   * @throws Error if the service has not been registered
   */
  resolve<T extends ServiceFactory>(key: string): T {
    const factory = this.factories.get(key);
    if (!factory) {
      throw new Error(
        `DomainServiceRegistry: service '${key}' not registered. ` +
        `Ensure the domain module is initialized before coordination.`
      );
    }
    return factory as T;
  }

  /**
   * Check whether a service has been registered.
   */
  has(key: string): boolean {
    return this.factories.has(key);
  }

  /**
   * Clear all registrations (useful for testing).
   */
  clear(): void {
    this.factories.clear();
  }

  /**
   * Get all registered service keys (useful for debugging).
   */
  keys(): string[] {
    return Array.from(this.factories.keys());
  }
}

/** Singleton instance */
export const DomainServiceRegistry = new DomainServiceRegistryImpl();
