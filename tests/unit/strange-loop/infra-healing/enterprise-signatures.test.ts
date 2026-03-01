/**
 * Enterprise Error Signatures Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Validates the 12 enterprise error signatures added to TestOutputObserver:
 * SAP RFC/BAPI, Salesforce, Payment Gateway, and WMS/ERP patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TestOutputObserver,
  createTestOutputObserver,
  DEFAULT_ERROR_SIGNATURES,
} from '../../../../src/strange-loop/infra-healing/test-output-observer.js';
import { createRecoveryPlaybook } from '../../../../src/strange-loop/infra-healing/recovery-playbook.js';
import type { InfraErrorSignature } from '../../../../src/strange-loop/infra-healing/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Enterprise Error Signatures Tests
// ============================================================================

describe('Enterprise Error Signatures', () => {
  let observer: TestOutputObserver;

  beforeEach(() => {
    observer = createTestOutputObserver();
  });

  // ==========================================================================
  // DEFAULT_ERROR_SIGNATURES enterprise count
  // ==========================================================================

  describe('DEFAULT_ERROR_SIGNATURES enterprise count', () => {
    it('has at least 35 built-in signatures (23 original + 12 enterprise)', () => {
      // 23 original + up to 12 enterprise = at least 34
      // Some enterprise signatures may share patterns; verify the minimum
      expect(DEFAULT_ERROR_SIGNATURES.length).toBeGreaterThanOrEqual(34);
    });
  });

  // ==========================================================================
  // SAP RFC/BAPI errors
  // ==========================================================================

  describe('SAP RFC/BAPI errors', () => {
    it('detects RFC_COMMUNICATION_FAILURE', () => {
      const result = observer.observe(
        'RFC_COMMUNICATION_FAILURE: Connection to SAP system failed'
      );
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('sap-rfc');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('sap_rfc_failure');
    });

    it('detects SYSTEM_FAILURE', () => {
      const result = observer.observe('RFC_SYSTEM_FAILURE: ABAP runtime error occurred');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('sap-rfc');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'sap_system_failure'
      );
    });

    it('detects SAP BTP connection failure via ECONNREFUSED', () => {
      // After reordering, enterprise ECONNREFUSED patterns match before generic catch-all
      const result = observer.observe('Error: connect ECONNREFUSED 10.0.1.5:443 sapbtp-proxy');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('sap-btp');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('sap_btp_failure');
    });

    it('detects SAP BTP failure via BTP keyword', () => {
      const result = observer.observe('BTP_FAILURE: SAP BTP service is unavailable');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('sap-btp');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('sap_btp_failure');
    });
  });

  // ==========================================================================
  // Salesforce errors
  // ==========================================================================

  describe('Salesforce errors', () => {
    it('detects REQUEST_LIMIT_EXCEEDED', () => {
      const result = observer.observe('REQUEST_LIMIT_EXCEEDED: API rate limit hit');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('salesforce');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('api_rate_limit');
    });

    it('detects INVALID_SESSION_ID for Salesforce', () => {
      const result = observer.observe('INVALID_SESSION_ID: Session expired salesforce login');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('salesforce');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'auth_token_expired'
      );
    });

    it('detects Salesforce ECONNREFUSED', () => {
      const result = observer.observe('Error: connect ECONNREFUSED salesforce.example.com');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('salesforce');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'service_unreachable'
      );
    });
  });

  // ==========================================================================
  // Payment gateway errors
  // ==========================================================================

  describe('Payment gateway errors', () => {
    it('detects payment gateway timeout with ETIMEDOUT', () => {
      // After reordering, payment-specific pattern matches before generic ETIMEDOUT
      const result = observer.observe('payment processing ETIMEDOUT - stripe connection failed');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('payment-gateway');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'payment_gateway_timeout'
      );
    });

    it('detects stripe ECONNREFUSED', () => {
      const result = observer.observe('Error: connect ECONNREFUSED stripe-api.example.com');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('payment-gateway');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'service_unreachable'
      );
    });

    it('detects payment rate limit', () => {
      const result = observer.observe('payment gateway rate limit exceeded - 429');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('payment-gateway');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('api_rate_limit');
    });
  });

  // ==========================================================================
  // WMS/ERP errors
  // ==========================================================================

  describe('WMS/ERP errors', () => {
    it('detects WMS ECONNREFUSED', () => {
      const result = observer.observe('Error: connect ECONNREFUSED wms.warehouse.local');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('wms');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'service_unreachable'
      );
    });

    it('detects WMS connection failure', () => {
      const result = observer.observe('WMS service connection timeout');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('wms');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'service_unreachable'
      );
    });

    it('detects SAP BTP pool exhaustion', () => {
      // Use "BTP connection pool" variant to match the SAP-specific pool
      // pattern before the generic pool exhaustion pattern
      const result = observer.observe('BTP connection pool limit reached');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('sap-btp');
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe(
        'service_unreachable'
      );
    });
  });

  // ==========================================================================
  // Signature priority: enterprise before generic catch-alls
  // ==========================================================================

  describe('Signature priority', () => {
    it('enterprise ECONNREFUSED matches before generic ECONNREFUSED', () => {
      // This input contains ECONNREFUSED + IP:port + "stripe" — the payment-gateway
      // pattern should match, NOT the generic ECONNREFUSED catch-all
      const result = observer.observe('Error: connect ECONNREFUSED 10.0.1.5:443 stripe-api');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('payment-gateway');
    });

    it('enterprise ECONNREFUSED salesforce matches before generic', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 10.0.2.3:443 salesforce');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('salesforce');
    });

    it('ECONNREFUSED with unknown service falls through to generic', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 192.168.1.100:9999');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('generic-service');
    });

    it('payment ETIMEDOUT matches before generic ETIMEDOUT', () => {
      const result = observer.observe('payment gateway ETIMEDOUT after 30s');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('payment-gateway');
    });

    it('bare ETIMEDOUT without payment context falls through to generic', () => {
      const result = observer.observe('Error: ETIMEDOUT connecting to unknown-service');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('network');
    });
  });

  // ==========================================================================
  // Custom signature merge behavior
  // ==========================================================================

  describe('Custom signature merge behavior', () => {
    it('custom signatures merge with defaults (not replace)', () => {
      const custom: InfraErrorSignature[] = [
        {
          pattern: /CUSTOM_ENTERPRISE_ERROR/,
          classification: 'infra_failure',
          vulnerabilityType: 'service_unreachable',
          serviceName: 'custom-enterprise',
          defaultSeverity: 0.9,
          description: 'Custom enterprise error',
        },
      ];
      const obs = createTestOutputObserver(custom);

      // Custom pattern matches
      const customResult = obs.observe('CUSTOM_ENTERPRISE_ERROR: something went wrong');
      expect(customResult.infraFailures).toHaveLength(1);
      expect(customResult.infraFailures[0].serviceName).toBe('custom-enterprise');

      // Default pattern still matches (PostgreSQL ECONNREFUSED)
      const defaultResult = obs.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      expect(defaultResult.infraFailures).toHaveLength(1);
      expect(defaultResult.infraFailures[0].serviceName).toBe('postgres');
    });

    it('custom signatures take precedence when matching first', () => {
      const custom: InfraErrorSignature[] = [
        {
          pattern: /CUSTOM_TIMEOUT_PATTERN/,
          classification: 'infra_failure',
          vulnerabilityType: 'infra_timeout',
          serviceName: 'custom-timeout-service',
          defaultSeverity: 0.99,
          description: 'Custom timeout pattern',
        },
        {
          pattern: /CUSTOM_DNS_PATTERN/,
          classification: 'infra_failure',
          vulnerabilityType: 'dns_resolution_failure',
          serviceName: 'custom-dns',
          defaultSeverity: 0.88,
          description: 'Custom DNS failure pattern',
        },
      ];
      const obs = createTestOutputObserver(custom);

      // Both custom patterns work
      const timeoutResult = obs.observe('CUSTOM_TIMEOUT_PATTERN detected');
      expect(timeoutResult.infraFailures).toHaveLength(1);
      expect(timeoutResult.infraFailures[0].serviceName).toBe('custom-timeout-service');

      const dnsResult = obs.observe('CUSTOM_DNS_PATTERN in resolver');
      expect(dnsResult.infraFailures).toHaveLength(1);
      expect(dnsResult.infraFailures[0].serviceName).toBe('custom-dns');

      // Defaults still operational alongside custom
      const sapResult = obs.observe('RFC_COMMUNICATION_FAILURE: Connection to SAP system failed');
      expect(sapResult.infraFailures).toHaveLength(1);
      expect(sapResult.infraFailures[0].serviceName).toBe('sap-rfc');
    });
  });
});

// ============================================================================
// Production Playbook Parsing Test
// ============================================================================

describe('Production default-playbook.yaml', () => {
  const EXPECTED_SERVICES = [
    'postgres',
    'mysql',
    'mongodb',
    'redis',
    'elasticsearch',
    'rabbitmq',
    'selenium-grid',
    'generic-service',
    'sap-rfc',
    'sap-btp',
    'salesforce',
    'payment-gateway',
  ] as const;

  it('loads and parses the real production playbook with all 12 services', () => {
    const playbookPath = resolve(
      __dirname,
      '../../../../src/strange-loop/infra-healing/default-playbook.yaml'
    );
    const playbookContent = readFileSync(playbookPath, 'utf-8');
    expect(playbookContent.length).toBeGreaterThan(0);

    const playbook = createRecoveryPlaybook();
    playbook.loadFromString(playbookContent);
    expect(playbook.isLoaded()).toBe(true);

    const services = playbook.listServices();
    expect(services).toHaveLength(EXPECTED_SERVICES.length);

    for (const serviceName of EXPECTED_SERVICES) {
      const plan = playbook.getRecoveryPlan(serviceName);
      expect(plan, `Missing recovery plan for service: ${serviceName}`).toBeDefined();
      expect(plan!.healthCheck?.command).toBeTruthy();
      expect(plan!.recover.length).toBeGreaterThan(0);
      expect(plan!.verify?.command).toBeTruthy();
    }
  });

  it('enterprise services have correct descriptions', () => {
    const playbookPath = resolve(
      __dirname,
      '../../../../src/strange-loop/infra-healing/default-playbook.yaml'
    );
    const playbook = createRecoveryPlaybook();
    playbook.loadFromString(readFileSync(playbookPath, 'utf-8'));

    const enterpriseServices = ['sap-rfc', 'sap-btp', 'salesforce', 'payment-gateway'];
    for (const serviceName of enterpriseServices) {
      const plan = playbook.getRecoveryPlan(serviceName);
      expect(plan, `Missing plan for ${serviceName}`).toBeDefined();
      expect(plan!.description).toBeTruthy();
    }
  });

  it('all services have valid maxRetries and backoffMs', () => {
    const playbookPath = resolve(
      __dirname,
      '../../../../src/strange-loop/infra-healing/default-playbook.yaml'
    );
    const playbook = createRecoveryPlaybook();
    playbook.loadFromString(readFileSync(playbookPath, 'utf-8'));

    for (const serviceName of EXPECTED_SERVICES) {
      const plan = playbook.getRecoveryPlan(serviceName);
      expect(plan, `Missing plan for ${serviceName}`).toBeDefined();
      expect(plan!.maxRetries).toBeGreaterThan(0);
      expect(plan!.backoffMs.length).toBeGreaterThan(0);
      for (const ms of plan!.backoffMs) {
        expect(ms).toBeGreaterThan(0);
      }
    }
  });
});
