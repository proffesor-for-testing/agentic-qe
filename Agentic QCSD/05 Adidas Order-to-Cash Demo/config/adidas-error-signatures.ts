/**
 * Adidas-Specific Error Signatures
 *
 * Custom InfraErrorSignature definitions for the 7 Adidas services.
 * Merged with DEFAULT_ERROR_SIGNATURES via createTestOutputObserver(customSignatures).
 */

import type { InfraErrorSignature } from '../../../v3/src/strange-loop/infra-healing/types.js';
import { DEFAULT_ERROR_SIGNATURES, TestOutputObserver } from '../../../v3/src/strange-loop/infra-healing/test-output-observer.js';

/**
 * Port-specific ECONNREFUSED patterns for each Adidas service.
 * These supplement the default signatures (which cover databases, caches, etc.)
 */
export const ADIDAS_ERROR_SIGNATURES: readonly InfraErrorSignature[] = [
  // Integrator Web (port 3001)
  {
    pattern: /ECONNREFUSED.*:3001/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'integrator-web',
    defaultSeverity: 0.9,
    description: 'Integrator Web (storefront) connection refused on port 3001',
  },

  // API Tester (port 3002)
  {
    pattern: /ECONNREFUSED.*:3002/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'api-tester',
    defaultSeverity: 0.9,
    description: 'API Tester (REST gateway) connection refused on port 3002',
  },

  // OMNI Orchestrator (port 3003)
  {
    pattern: /ECONNREFUSED.*:3003/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'omni',
    defaultSeverity: 0.95,
    description: 'OMNI (orchestrator) connection refused on port 3003',
  },

  // IIB ESB (port 3004)
  {
    pattern: /ECONNREFUSED.*:3004/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'iib-esb',
    defaultSeverity: 0.85,
    description: 'IIB ESB (integration bus) connection refused on port 3004',
  },

  // WMS (port 3005)
  {
    pattern: /ECONNREFUSED.*:3005/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'wms',
    defaultSeverity: 0.85,
    description: 'WMS (warehouse) connection refused on port 3005',
  },

  // SAP S/4HANA (port 3006)
  {
    pattern: /ECONNREFUSED.*:3006/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'sap-s4',
    defaultSeverity: 0.95,
    description: 'SAP S/4HANA connection refused on port 3006',
  },

  // Kibana (port 3007)
  {
    pattern: /ECONNREFUSED.*:3007/,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'kibana',
    defaultSeverity: 0.7,
    description: 'Kibana (dashboard) connection refused on port 3007',
  },

  // 503 Service Unavailable from any Adidas service (failure mode)
  {
    pattern: /503 Service Unavailable.*(?:integrator|api-tester|omni|iib|wms|sap|kibana)/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'unknown',
    defaultSeverity: 0.8,
    description: 'Adidas service returning 503 (failure mode active)',
  },

  // SAP-specific OData errors
  {
    pattern: /SAP.*CX_SY_OPEN_SQL|OData.*error.*ORDER_SRV/i,
    classification: 'infra_failure',
    vulnerabilityType: 'service_unreachable',
    serviceName: 'sap-s4',
    defaultSeverity: 0.9,
    description: 'SAP OData service error',
  },
];

/**
 * Create a TestOutputObserver with Adidas signatures checked FIRST.
 *
 * The default `createTestOutputObserver(custom)` appends custom signatures
 * after defaults, so the generic ECONNREFUSED pattern matches before our
 * port-specific ones. This factory puts Adidas signatures at the front
 * so that port 3006 resolves to "sap-s4" (not "generic-service").
 *
 * We construct with no custom (uses defaults), then override the internal
 * signatures array to put Adidas-specific patterns first.
 */
export function createAdidasObserver(): InstanceType<typeof TestOutputObserver> {
  const observer = new TestOutputObserver();
  // Put Adidas-specific patterns before the defaults for priority matching
  // TypeScript readonly/private is compile-time only; at runtime we can reassign
  (observer as Record<string, unknown>)['signatures'] = [
    ...ADIDAS_ERROR_SIGNATURES,
    ...DEFAULT_ERROR_SIGNATURES,
  ];
  return observer;
}

/**
 * Map of service name to its port number.
 * Useful for programmatic health checks.
 */
export const SERVICE_PORTS: Record<string, number> = {
  'integrator-web': 3001,
  'api-tester': 3002,
  'omni': 3003,
  'iib-esb': 3004,
  'wms': 3005,
  'sap-s4': 3006,
  'kibana': 3007,
};
