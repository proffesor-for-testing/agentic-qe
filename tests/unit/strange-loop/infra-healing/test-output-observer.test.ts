/**
 * Test Output Observer Tests
 * ADR-057: Infrastructure Self-Healing Extension
 *
 * Tests pattern matching for infrastructure error signatures,
 * classification, deduplication, and vulnerability generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TestOutputObserver,
  createTestOutputObserver,
  DEFAULT_ERROR_SIGNATURES,
} from '../../../../src/strange-loop/infra-healing/test-output-observer.js';
import type { InfraErrorSignature } from '../../../../src/strange-loop/infra-healing/types.js';

// ============================================================================
// Test Output Observer Tests
// ============================================================================

describe('TestOutputObserver', () => {
  let observer: TestOutputObserver;

  beforeEach(() => {
    observer = createTestOutputObserver();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createTestOutputObserver', () => {
    it('creates an observer with default signatures', () => {
      const obs = createTestOutputObserver();
      expect(obs).toBeInstanceOf(TestOutputObserver);
    });

    it('accepts custom signatures and merges with defaults', () => {
      const custom: InfraErrorSignature[] = [
        {
          pattern: /CUSTOM_ERROR/,
          classification: 'infra_failure',
          vulnerabilityType: 'service_unreachable',
          serviceName: 'custom-service',
          defaultSeverity: 0.9,
          description: 'Custom error',
        },
      ];
      const obs = createTestOutputObserver(custom);
      // Custom signature works
      const customResult = obs.observe('CUSTOM_ERROR occurred');
      expect(customResult.infraFailures).toHaveLength(1);
      expect(customResult.infraFailures[0].serviceName).toBe('custom-service');

      // Default signatures still work (merged, not replaced)
      const defaultResult = obs.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      expect(defaultResult.infraFailures).toHaveLength(1);
      expect(defaultResult.infraFailures[0].serviceName).toBe('postgres');
    });
  });

  // ==========================================================================
  // Default Signatures Coverage
  // ==========================================================================

  describe('DEFAULT_ERROR_SIGNATURES', () => {
    it('has at least 34 built-in signatures', () => {
      expect(DEFAULT_ERROR_SIGNATURES.length).toBeGreaterThanOrEqual(34);
    });

    it('all signatures have required fields', () => {
      for (const sig of DEFAULT_ERROR_SIGNATURES) {
        expect(sig.pattern).toBeInstanceOf(RegExp);
        expect(sig.classification).toBeTruthy();
        expect(sig.vulnerabilityType).toBeTruthy();
        expect(sig.serviceName).toBeTruthy();
        expect(sig.defaultSeverity).toBeGreaterThan(0);
        expect(sig.description).toBeTruthy();
      }
    });
  });

  // ==========================================================================
  // Database Connection Errors
  // ==========================================================================

  describe('database connection errors', () => {
    it('detects PostgreSQL ECONNREFUSED on port 5432', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('postgres');
      expect(result.infraFailures[0].classification).toBe('infra_failure');
    });

    it('detects MySQL ECONNREFUSED on port 3306', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:3306');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('mysql');
    });

    it('detects MongoDB ECONNREFUSED on port 27017', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:27017');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('mongodb');
    });

    it('detects psycopg2 connection errors', () => {
      const result = observer.observe(
        'psycopg2.OperationalError: could not connect to server: Connection refused'
      );
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('postgres');
    });

    it('detects Java JDBC connection failures', () => {
      const result = observer.observe(
        'java.sql.SQLException: Communications link failure - Connection refused'
      );
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('mysql');
    });
  });

  // ==========================================================================
  // Cache / Message Broker Errors
  // ==========================================================================

  describe('cache and message broker errors', () => {
    it('detects Redis ECONNREFUSED on port 6379', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:6379');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('redis');
    });

    it('detects RabbitMQ ECONNREFUSED on port 5672', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5672');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('rabbitmq');
    });

    it('detects Kafka ECONNREFUSED on port 9092', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:9092');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('kafka');
    });

    it('detects Elasticsearch ECONNREFUSED on port 9200', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:9200');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('elasticsearch');
    });
  });

  // ==========================================================================
  // Network Errors
  // ==========================================================================

  describe('network errors', () => {
    it('detects ETIMEDOUT', () => {
      const result = observer.observe('Error: connect ETIMEDOUT 10.0.0.1:443');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('infra_timeout');
    });

    it('detects ESOCKETTIMEDOUT', () => {
      const result = observer.observe('Error: ESOCKETTIMEDOUT');
      expect(result.infraFailures).toHaveLength(1);
    });

    it('detects ECONNRESET', () => {
      const result = observer.observe('Error: read ECONNRESET');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('service_unreachable');
    });

    it('detects DNS ENOTFOUND', () => {
      const result = observer.observe('Error: getaddrinfo ENOTFOUND myservice.local');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('dns_resolution_failure');
    });

    it('detects DNS EAI_AGAIN', () => {
      const result = observer.observe('Error: getaddrinfo EAI_AGAIN myservice.local');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('dns_resolution_failure');
    });
  });

  // ==========================================================================
  // Resource Exhaustion Errors
  // ==========================================================================

  describe('resource exhaustion errors', () => {
    it('detects ENOMEM', () => {
      const result = observer.observe('Error: ENOMEM: not enough memory');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('out_of_memory');
    });

    it('detects Java OutOfMemoryError', () => {
      const result = observer.observe('java.lang.OutOfMemoryError: Heap space');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('out_of_memory');
    });

    it('detects ENOSPC (disk full)', () => {
      const result = observer.observe('Error: ENOSPC: No space left on device');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('disk_full');
    });

    it('detects EADDRINUSE (port conflict)', () => {
      const result = observer.observe('Error: listen EADDRINUSE: address already in use');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('port_bind_failure');
    });
  });

  // ==========================================================================
  // TLS / Certificate Errors
  // ==========================================================================

  describe('TLS and certificate errors', () => {
    it('detects expired certificate', () => {
      const result = observer.observe('Error: certificate has expired');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].matchedSignature?.vulnerabilityType).toBe('certificate_expired');
    });

    it('detects CERT_HAS_EXPIRED', () => {
      const result = observer.observe('Error: CERT_HAS_EXPIRED');
      expect(result.infraFailures).toHaveLength(1);
    });

    it('detects UNABLE_TO_VERIFY_LEAF_SIGNATURE', () => {
      const result = observer.observe('Error: UNABLE_TO_VERIFY_LEAF_SIGNATURE');
      expect(result.infraFailures).toHaveLength(1);
    });

    it('detects self-signed certificate', () => {
      const result = observer.observe('Error: certificate is self signed');
      expect(result.infraFailures).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Connection Pool and Docker Errors
  // ==========================================================================

  describe('pool and container errors', () => {
    it('detects connection pool exhaustion', () => {
      const result = observer.observe('Error: pool exhausted, no connections available');
      expect(result.infraFailures).toHaveLength(1);
    });

    it('detects too many connections', () => {
      const result = observer.observe('FATAL: too many connections for role "app"');
      expect(result.infraFailures).toHaveLength(1);
    });

    it('detects Docker daemon unreachable', () => {
      const result = observer.observe('Cannot connect to the Docker daemon at unix:///var/run/docker.sock');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('docker');
    });

    it('detects Selenium Grid unreachable', () => {
      const result = observer.observe('WebDriverError: session not created: Could not start browser');
      expect(result.infraFailures).toHaveLength(1);
      expect(result.infraFailures[0].serviceName).toBe('selenium-grid');
    });
  });

  // ==========================================================================
  // Multi-line Output and Deduplication
  // ==========================================================================

  describe('observe()', () => {
    it('parses multiple lines and finds multiple errors', () => {
      const output = [
        'Running test suite...',
        'Error: connect ECONNREFUSED 127.0.0.1:5432',
        'PASS: test_login',
        'Error: connect ECONNREFUSED 127.0.0.1:6379',
        'FAIL: test_cache_lookup',
      ].join('\n');

      const result = observer.observe(output);
      expect(result.totalLinesParsed).toBe(5);
      expect(result.infraFailures).toHaveLength(2);
      expect(result.classifiedErrors).toHaveLength(2);
    });

    it('deduplicates vulnerabilities by service name', () => {
      const output = [
        'Error: connect ECONNREFUSED 127.0.0.1:5432',
        'Error: connect ECONNREFUSED 127.0.0.1:5432 postgres',
      ].join('\n');

      const result = observer.observe(output);
      // Two classified errors but only one vulnerability (deduped by service)
      expect(result.infraFailures).toHaveLength(2);
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.vulnerabilities[0].affectedAgents).toContain('infra-postgres');
    });

    it('generates vulnerabilities with correct fields', () => {
      const result = observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      expect(result.vulnerabilities).toHaveLength(1);

      const vuln = result.vulnerabilities[0];
      expect(vuln.type).toBe('db_connection_failure');
      expect(vuln.severity).toBeGreaterThan(0);
      expect(vuln.affectedAgents).toContain('infra-postgres');
      expect(vuln.suggestedAction).toBe('restart_service');
      expect(vuln.detectedAt).toBeGreaterThan(0);
    });

    it('returns empty results for clean output', () => {
      const result = observer.observe('All 42 tests passed.\nDone in 12.3s');
      expect(result.infraFailures).toHaveLength(0);
      expect(result.classifiedErrors).toHaveLength(0);
      expect(result.vulnerabilities).toHaveLength(0);
    });

    it('records observation metadata', () => {
      const result = observer.observe('some output');
      expect(result.id).toBeTruthy();
      expect(result.observedAt).toBeGreaterThan(0);
      expect(result.parsingDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // State Management
  // ==========================================================================

  describe('getFailingServices()', () => {
    it('returns empty set before any observation', () => {
      expect(observer.getFailingServices().size).toBe(0);
    });

    it('returns failing service names after observation', () => {
      observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const failing = observer.getFailingServices();
      expect(failing.has('postgres')).toBe(true);
    });

    it('returns multiple failing services', () => {
      observer.observe(
        'Error: connect ECONNREFUSED 127.0.0.1:5432\nError: connect ECONNREFUSED 127.0.0.1:6379'
      );
      const failing = observer.getFailingServices();
      expect(failing.has('postgres')).toBe(true);
      expect(failing.has('redis')).toBe(true);
    });
  });

  describe('getLastObservation()', () => {
    it('returns null before any observation', () => {
      expect(observer.getLastObservation()).toBeNull();
    });

    it('returns the most recent observation', () => {
      observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      const obs = observer.getLastObservation();
      expect(obs).not.toBeNull();
      expect(obs!.infraFailures).toHaveLength(1);
    });
  });

  describe('clearObservation()', () => {
    it('clears the last observation', () => {
      observer.observe('Error: connect ECONNREFUSED 127.0.0.1:5432');
      expect(observer.getLastObservation()).not.toBeNull();

      observer.clearObservation();
      expect(observer.getLastObservation()).toBeNull();
      expect(observer.getFailingServices().size).toBe(0);
    });
  });

  // ==========================================================================
  // classifyLine()
  // ==========================================================================

  describe('classifyLine()', () => {
    it('returns null for non-matching lines', () => {
      expect(observer.classifyLine('All tests passed')).toBeNull();
    });

    it('returns ClassifiedError for matching lines', () => {
      const result = observer.classifyLine('Error: connect ECONNREFUSED 127.0.0.1:5432', 5);
      expect(result).not.toBeNull();
      expect(result!.classification).toBe('infra_failure');
      expect(result!.lineNumber).toBe(5);
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.classifiedAt).toBeGreaterThan(0);
    });
  });
});
