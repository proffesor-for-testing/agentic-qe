/**
 * Test Output Observer
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Parses test runner stdout/stderr, pattern-matches infrastructure error
 * signatures, classifies errors as test_bug | infra_failure | flaky | unknown,
 * and converts infrastructure failures into SwarmVulnerability objects that
 * the existing Strange Loop Observe-Model-Decide-Act cycle can consume.
 *
 * Framework-agnostic: infrastructure errors (ECONNREFUSED, ETIMEDOUT, etc.)
 * are OS-level and appear the same regardless of Jest, Pytest, JUnit, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SwarmVulnerability } from '../types.js';
import type {
  InfraErrorSignature,
  ClassifiedError,
  TestOutputObservation,
  TestOutputClassification,
} from './types.js';

// ============================================================================
// Default Error Signatures (Framework-Agnostic)
// ============================================================================

/**
 * Built-in infrastructure error patterns.
 * Covers common OS-level and service-level errors that appear in test output
 * regardless of the test framework being used.
 */
export const DEFAULT_ERROR_SIGNATURES: readonly InfraErrorSignature[] = [
  // Database connection errors
  {
    pattern: /ECONNREFUSED.*(?::5432|postgres)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'db_connection_failure',
    serviceName: 'postgres',
    defaultSeverity: 0.95,
    description: 'PostgreSQL connection refused',
  },
  {
    pattern: /ECONNREFUSED.*(?::3306|mysql)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'db_connection_failure',
    serviceName: 'mysql',
    defaultSeverity: 0.95,
    description: 'MySQL connection refused',
  },
  {
    pattern: /ECONNREFUSED.*(?::27017|mongo)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'db_connection_failure',
    serviceName: 'mongodb',
    defaultSeverity: 0.95,
    description: 'MongoDB connection refused',
  },

  // Cache / message broker errors
  {
    pattern: /ECONNREFUSED.*(?::6379|redis)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'redis',
    defaultSeverity: 0.85,
    description: 'Redis connection refused',
  },
  {
    pattern: /ECONNREFUSED.*(?::5672|rabbitmq|amqp)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'rabbitmq',
    defaultSeverity: 0.85,
    description: 'RabbitMQ connection refused',
  },
  {
    pattern: /ECONNREFUSED.*(?::9092|kafka)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'kafka',
    defaultSeverity: 0.85,
    description: 'Kafka connection refused',
  },

  // Search engine errors
  {
    pattern: /ECONNREFUSED.*(?::9200|elasticsearch)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'elasticsearch',
    defaultSeverity: 0.8,
    description: 'Elasticsearch connection refused',
  },

  // DNS errors
  {
    pattern: /ENOTFOUND/,
    classification: 'infra_failure',
    vulnerabilityType: 'dns_resolution_failure',
    serviceName: 'dns',
    defaultSeverity: 0.9,
    description: 'DNS resolution failed',
  },
  {
    pattern: /EAI_AGAIN/,
    classification: 'infra_failure',
    vulnerabilityType: 'dns_resolution_failure',
    serviceName: 'dns',
    defaultSeverity: 0.7,
    description: 'DNS resolution temporary failure',
  },

  // Resource exhaustion
  {
    pattern: /ENOMEM|out of memory|OutOfMemoryError|java\.lang\.OutOfMemoryError/i,
    classification: 'infra_failure',
    vulnerabilityType: 'out_of_memory',
    serviceName: 'memory',
    defaultSeverity: 0.95,
    description: 'Out of memory',
  },
  {
    pattern: /ENOSPC|No space left on device/i,
    classification: 'infra_failure',
    vulnerabilityType: 'disk_full',
    serviceName: 'disk',
    defaultSeverity: 0.9,
    description: 'Disk space exhausted',
  },

  // Port / bind errors
  {
    pattern: /EADDRINUSE/,
    classification: 'infra_failure',
    vulnerabilityType: 'port_bind_failure',
    serviceName: 'port',
    defaultSeverity: 0.8,
    description: 'Port already in use',
  },

  // TLS / certificate errors
  {
    pattern: /certificate.*(?:expired|invalid|self.signed)|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i,
    classification: 'infra_failure',
    vulnerabilityType: 'certificate_expired',
    serviceName: 'tls',
    defaultSeverity: 0.85,
    description: 'TLS certificate error',
  },

  // Docker / container errors
  {
    pattern: /Cannot connect to the Docker daemon|docker.*not running/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'docker',
    defaultSeverity: 0.9,
    description: 'Docker daemon unreachable',
  },

  // Selenium / browser automation errors
  {
    pattern: /WebDriverError.*session not created|ECONNREFUSED.*(?::4444|selenium)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'selenium-grid',
    defaultSeverity: 0.85,
    description: 'Selenium Grid unreachable',
  },

  // Python-specific DB errors (framework-agnostic at OS level)
  {
    pattern: /psycopg2\.OperationalError.*(?:could not connect|Connection refused)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'db_connection_failure',
    serviceName: 'postgres',
    defaultSeverity: 0.95,
    description: 'Python psycopg2 PostgreSQL connection failed',
  },
  {
    pattern: /(?:java\.sql\.SQLException|com\.mysql).*(?:Communications link failure|Connection refused)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'db_connection_failure',
    serviceName: 'mysql',
    defaultSeverity: 0.95,
    description: 'Java JDBC connection failed',
  },

  // ========================================================================
  // Enterprise: SAP RFC/BAPI Errors
  // ========================================================================

  {
    pattern: /(?:RFC_)?COMMUNICATION_FAILURE|CpicError.*CMRC/i,
    classification: 'infra_failure',
    vulnerabilityType: 'sap_rfc_failure',
    serviceName: 'sap-rfc',
    defaultSeverity: 0.95,
    description: 'SAP RFC communication failure',
  },
  {
    pattern: /(?:RFC_)?SYSTEM_FAILURE|ABAP.*runtime.*error/i,
    classification: 'infra_failure',
    vulnerabilityType: 'sap_system_failure',
    serviceName: 'sap-rfc',
    defaultSeverity: 0.95,
    description: 'SAP system failure (ABAP runtime error)',
  },
  {
    pattern: /ECONNREFUSED.*(?::443.*sap|sapbtp)|BTP_.*(?:FAILURE|UNAVAILABLE)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'sap_btp_failure',
    serviceName: 'sap-btp',
    defaultSeverity: 0.9,
    description: 'SAP BTP connection failure',
  },

  // ========================================================================
  // Enterprise: Salesforce Errors
  // ========================================================================

  {
    pattern: /REQUEST_LIMIT_EXCEEDED|API_CURRENTLY_DISABLED/i,
    classification: 'infra_failure',
    vulnerabilityType: 'api_rate_limit',
    serviceName: 'salesforce',
    defaultSeverity: 0.85,
    description: 'Salesforce API rate limit exceeded',
  },
  {
    pattern: /INVALID_SESSION_ID|Session expired.*(?:salesforce|sfdc|force\.com)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'auth_token_expired',
    serviceName: 'salesforce',
    defaultSeverity: 0.8,
    description: 'Salesforce session/token expired',
  },
  {
    pattern: /ECONNREFUSED.*(?:salesforce|sfdc|force\.com|sf-api)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'salesforce',
    defaultSeverity: 0.9,
    description: 'Salesforce API connection refused',
  },

  // ========================================================================
  // Enterprise: Payment Gateway Errors
  // ========================================================================

  {
    pattern: /payment.*(?:timeout|ETIMEDOUT)|(?:stripe|paypal|adyen|braintree).*timeout/i,
    classification: 'infra_failure',
    vulnerabilityType: 'payment_gateway_timeout',
    serviceName: 'payment-gateway',
    defaultSeverity: 0.95,
    description: 'Payment gateway timeout',
  },
  {
    pattern: /ECONNREFUSED.*(?:stripe|paypal|adyen|braintree|payment)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'payment-gateway',
    defaultSeverity: 0.95,
    description: 'Payment gateway connection refused',
  },
  {
    pattern: /payment.*(?:rate.limit|429|too.many.requests)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'api_rate_limit',
    serviceName: 'payment-gateway',
    defaultSeverity: 0.8,
    description: 'Payment gateway rate limit exceeded',
  },

  // ========================================================================
  // Enterprise: WMS / ERP Errors
  // ========================================================================

  {
    pattern: /ECONNREFUSED.*(?:wms|warehouse|erp)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'wms',
    defaultSeverity: 0.85,
    description: 'WMS/ERP connection refused',
  },
  {
    pattern: /WMS.*(?:connection|timeout|unreachable)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'wms',
    defaultSeverity: 0.85,
    description: 'WMS service connection failure',
  },
  {
    pattern: /SAP.*pool.*(?:exhausted|timeout)|BTP.*connection.*pool/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'sap-btp',
    defaultSeverity: 0.85,
    description: 'SAP BTP connection pool exhausted',
  },

  // ========================================================================
  // Generic Catch-All Patterns (MUST be last — specific patterns above take priority)
  // ========================================================================

  // Generic ECONNREFUSED (no service qualifier — catches any IP:port)
  {
    pattern: /ECONNREFUSED\s+[\d.]+:\d+/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'generic-service',
    defaultSeverity: 0.8,
    description: 'Service connection refused on unknown port',
  },

  // Generic timeout errors
  {
    pattern: /ETIMEDOUT/,
    classification: 'infra_failure',
    vulnerabilityType: 'infra_timeout',
    serviceName: 'network',
    defaultSeverity: 0.7,
    description: 'Network connection timed out',
  },
  {
    pattern: /ESOCKETTIMEDOUT/,
    classification: 'infra_failure',
    vulnerabilityType: 'infra_timeout',
    serviceName: 'network',
    defaultSeverity: 0.7,
    description: 'Socket connection timed out',
  },
  {
    pattern: /ECONNRESET/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'network',
    defaultSeverity: 0.6,
    description: 'Connection reset by peer',
  },

  // Generic connection pool exhaustion
  {
    pattern: /pool.*(?:exhausted|timeout|full)|too many (?:connections|clients)|max.*connections.*reached/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'connection-pool',
    defaultSeverity: 0.8,
    description: 'Connection pool exhausted',
  },
];

// ============================================================================
// Test Output Observer
// ============================================================================

/**
 * Observes test runner output and classifies errors as infrastructure
 * failures or test bugs. Converts infra failures into SwarmVulnerability
 * objects consumable by the existing Strange Loop pipeline.
 */
export class TestOutputObserver {
  private readonly signatures: readonly InfraErrorSignature[];
  private lastObservation: TestOutputObservation | null = null;

  constructor(customSignatures?: readonly InfraErrorSignature[]) {
    this.signatures = customSignatures
      ? [...DEFAULT_ERROR_SIGNATURES, ...customSignatures]
      : DEFAULT_ERROR_SIGNATURES;
  }

  /**
   * Observe a block of test output (stdout + stderr combined).
   * Parses line-by-line and classifies each error found.
   */
  observe(output: string): TestOutputObservation {
    const startTime = Date.now();
    const lines = output.split('\n');
    const classifiedErrors: ClassifiedError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const classified = this.classifyLine(line, i + 1);
      if (classified) {
        classifiedErrors.push(classified);
      }
    }

    const infraFailures = classifiedErrors.filter(
      (e) => e.classification === 'infra_failure'
    );

    const vulnerabilities = this.toVulnerabilities(infraFailures);

    const observation: TestOutputObservation = {
      id: uuidv4(),
      totalLinesParsed: lines.length,
      classifiedErrors,
      infraFailures,
      vulnerabilities,
      observedAt: Date.now(),
      parsingDurationMs: Date.now() - startTime,
    };

    this.lastObservation = observation;
    return observation;
  }

  /**
   * Get the most recent observation (for AgentProvider health reporting).
   */
  getLastObservation(): TestOutputObservation | null {
    return this.lastObservation;
  }

  /**
   * Get the set of currently-failing service names from the last observation.
   */
  getFailingServices(): ReadonlySet<string> {
    if (!this.lastObservation) return new Set();
    const services = new Set<string>();
    for (const failure of this.lastObservation.infraFailures) {
      if (failure.serviceName) {
        services.add(failure.serviceName);
      }
    }
    return services;
  }

  /**
   * Clear the last observation (e.g., after recovery).
   */
  clearObservation(): void {
    this.lastObservation = null;
  }

  /**
   * Classify a single line of output.
   * Returns null if the line doesn't match any error signature.
   */
  classifyLine(line: string, lineNumber?: number): ClassifiedError | null {
    for (const signature of this.signatures) {
      if (signature.pattern.test(line)) {
        return {
          rawOutput: line,
          lineNumber,
          classification: signature.classification,
          matchedSignature: signature,
          confidence: 0.9,
          serviceName: signature.serviceName,
          classifiedAt: Date.now(),
        };
      }
    }
    return null;
  }

  /**
   * Convert classified infra failures into SwarmVulnerability objects.
   * Deduplicates by service name — one vulnerability per failing service.
   */
  private toVulnerabilities(
    infraFailures: readonly ClassifiedError[]
  ): SwarmVulnerability[] {
    const byService = new Map<string, ClassifiedError[]>();

    for (const failure of infraFailures) {
      const service = failure.serviceName ?? 'unknown';
      const existing = byService.get(service) ?? [];
      existing.push(failure);
      byService.set(service, existing);
    }

    const vulnerabilities: SwarmVulnerability[] = [];
    for (const [service, failures] of byService) {
      const maxSeverity = Math.max(
        ...failures.map((f) => f.matchedSignature?.defaultSeverity ?? 0.5)
      );
      const description = failures[0]?.matchedSignature?.description ?? `Service ${service} failure`;
      const vulnType = failures[0]?.matchedSignature?.vulnerabilityType ?? 'service_unreachable';

      vulnerabilities.push({
        type: vulnType,
        severity: maxSeverity,
        affectedAgents: [`infra-${service}`],
        description: `${description} (${failures.length} occurrence${failures.length > 1 ? 's' : ''})`,
        suggestedAction: 'restart_service',
        detectedAt: Date.now(),
      });
    }

    return vulnerabilities;
  }
}

/**
 * Factory function for creating a TestOutputObserver.
 */
export function createTestOutputObserver(
  customSignatures?: readonly InfraErrorSignature[]
): TestOutputObserver {
  return new TestOutputObserver(customSignatures);
}
