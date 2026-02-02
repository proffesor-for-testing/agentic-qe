/**
 * Recovery Playbook Tests
 * ADR-056: Infrastructure Self-Healing Extension
 *
 * Tests for YAML playbook loading, parsing, variable interpolation,
 * and service recovery plan retrieval.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RecoveryPlaybook,
  createRecoveryPlaybook,
} from '../../../../src/strange-loop/infra-healing/recovery-playbook.js';

// ============================================================================
// Test YAML Fixtures
// ============================================================================

const MINIMAL_PLAYBOOK = `
version: "1.0.0"
services:
  postgres:
    healthCheck:
      command: "pg_isready"
      timeoutMs: 5000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 30000
    verify:
      command: "pg_isready"
      timeoutMs: 5000
`;

const FULL_PLAYBOOK = `
version: "2.0.0"
defaults:
  timeoutMs: 8000
  maxRetries: 2
  backoffMs: [1000, 3000]

services:
  postgres:
    description: "PostgreSQL database"
    healthCheck:
      command: "pg_isready -h localhost -p 5432"
      timeoutMs: 5000
    recover:
      - command: "docker compose up -d postgres"
        timeoutMs: 30000
      - command: "sleep 3"
        timeoutMs: 5000
        required: false
    verify:
      command: "pg_isready -h localhost -p 5432"
      timeoutMs: 5000
    maxRetries: 3
    backoffMs: [2000, 5000, 10000]

  redis:
    description: "Redis cache"
    healthCheck: "redis-cli ping"
    recover:
      - command: "docker compose up -d redis"
        timeoutMs: 15000
    verify: "redis-cli ping"
`;

const INTERPOLATION_PLAYBOOK = `
version: "1.0.0"
services:
  postgres:
    healthCheck:
      command: "pg_isready -h \${PGHOST} -p \${PGPORT}"
      timeoutMs: 5000
    recover:
      - command: "docker compose up -d \${DB_SERVICE}"
        timeoutMs: 30000
    verify:
      command: "pg_isready -h \${PGHOST} -p \${PGPORT}"
      timeoutMs: 5000
`;

// ============================================================================
// Recovery Playbook Tests
// ============================================================================

describe('RecoveryPlaybook', () => {
  let playbook: RecoveryPlaybook;

  beforeEach(() => {
    playbook = createRecoveryPlaybook();
  });

  // ==========================================================================
  // Factory
  // ==========================================================================

  describe('createRecoveryPlaybook', () => {
    it('creates a playbook instance', () => {
      const pb = createRecoveryPlaybook();
      expect(pb).toBeInstanceOf(RecoveryPlaybook);
    });

    it('accepts explicit variables', () => {
      const pb = createRecoveryPlaybook({ PGHOST: 'db.example.com' });
      expect(pb).toBeInstanceOf(RecoveryPlaybook);
    });
  });

  // ==========================================================================
  // Loading
  // ==========================================================================

  describe('loadFromString()', () => {
    it('loads a minimal YAML playbook', () => {
      playbook.loadFromString(MINIMAL_PLAYBOOK);
      expect(playbook.isLoaded()).toBe(true);
    });

    it('loads a full YAML playbook with all fields', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      expect(playbook.isLoaded()).toBe(true);
    });
  });

  describe('isLoaded()', () => {
    it('returns false before loading', () => {
      expect(playbook.isLoaded()).toBe(false);
    });

    it('returns true after loading', () => {
      playbook.loadFromString(MINIMAL_PLAYBOOK);
      expect(playbook.isLoaded()).toBe(true);
    });
  });

  // ==========================================================================
  // Service Listing
  // ==========================================================================

  describe('listServices()', () => {
    it('returns empty array before loading', () => {
      expect(playbook.listServices()).toHaveLength(0);
    });

    it('returns service names from playbook', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const services = playbook.listServices();
      expect(services).toContain('postgres');
      expect(services).toContain('redis');
      expect(services).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Recovery Plan Retrieval
  // ==========================================================================

  describe('getRecoveryPlan()', () => {
    it('returns undefined before loading', () => {
      expect(playbook.getRecoveryPlan('postgres')).toBeUndefined();
    });

    it('returns undefined for unknown service', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      expect(playbook.getRecoveryPlan('nonexistent')).toBeUndefined();
    });

    it('returns recovery plan for known service', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres');
      expect(plan).toBeDefined();
      expect(plan!.serviceName).toBe('postgres');
      expect(plan!.description).toBe('PostgreSQL database');
    });

    it('parses healthCheck command correctly', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres')!;
      expect(plan.healthCheck.command).toBe('pg_isready -h localhost -p 5432');
      expect(plan.healthCheck.timeoutMs).toBe(5000);
      expect(plan.healthCheck.required).toBe(true);
    });

    it('parses recover commands in order', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres')!;
      expect(plan.recover).toHaveLength(2);
      expect(plan.recover[0].command).toBe('docker compose up -d postgres');
      expect(plan.recover[0].timeoutMs).toBe(30000);
      expect(plan.recover[0].required).toBe(true);
      expect(plan.recover[1].command).toBe('sleep 3');
      expect(plan.recover[1].required).toBe(false);
    });

    it('parses verify command correctly', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres')!;
      expect(plan.verify.command).toBe('pg_isready -h localhost -p 5432');
      expect(plan.verify.timeoutMs).toBe(5000);
    });

    it('uses per-service maxRetries and backoffMs', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres')!;
      expect(plan.maxRetries).toBe(3);
      expect(plan.backoffMs).toEqual([2000, 5000, 10000]);
    });

    it('inherits defaults when per-service values not specified', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('redis')!;
      expect(plan.maxRetries).toBe(2); // from defaults
      expect(plan.backoffMs).toEqual([1000, 3000]); // from defaults
    });

    it('handles string-only command shorthand', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('redis')!;
      // healthCheck was a bare string, should get default timeout
      expect(plan.healthCheck.command).toBe('redis-cli ping');
      expect(plan.healthCheck.timeoutMs).toBe(8000); // defaults.timeoutMs
    });
  });

  // ==========================================================================
  // Config Retrieval
  // ==========================================================================

  describe('getConfig()', () => {
    it('returns null before loading', () => {
      expect(playbook.getConfig()).toBeNull();
    });

    it('returns full config after loading', () => {
      playbook.loadFromString(FULL_PLAYBOOK);
      const config = playbook.getConfig()!;
      expect(config.version).toBe('2.0.0');
      expect(config.defaultTimeoutMs).toBe(8000);
      expect(config.defaultMaxRetries).toBe(2);
      expect(config.defaultBackoffMs).toEqual([1000, 3000]);
    });
  });

  // ==========================================================================
  // Variable Interpolation
  // ==========================================================================

  describe('variable interpolation', () => {
    it('interpolates variables from constructor', () => {
      const pb = createRecoveryPlaybook({
        PGHOST: 'db.production.local',
        PGPORT: '5433',
        DB_SERVICE: 'my-postgres',
      });
      pb.loadFromString(INTERPOLATION_PLAYBOOK);

      const plan = pb.getRecoveryPlan('postgres')!;
      expect(plan.healthCheck.command).toBe('pg_isready -h db.production.local -p 5433');
      expect(plan.recover[0].command).toBe('docker compose up -d my-postgres');
      expect(plan.verify.command).toBe('pg_isready -h db.production.local -p 5433');
    });

    it('leaves unresolved variables as-is', () => {
      const pb = createRecoveryPlaybook({ PGHOST: 'localhost' });
      pb.loadFromString(INTERPOLATION_PLAYBOOK);

      const plan = pb.getRecoveryPlan('postgres')!;
      expect(plan.healthCheck.command).toBe('pg_isready -h localhost -p ${PGPORT}');
    });
  });

  // ==========================================================================
  // Defaults Fallback
  // ==========================================================================

  describe('defaults fallback', () => {
    it('uses hardcoded defaults when no defaults section', () => {
      playbook.loadFromString(MINIMAL_PLAYBOOK);
      const plan = playbook.getRecoveryPlan('postgres')!;
      expect(plan.maxRetries).toBe(3); // hardcoded default
      expect(plan.backoffMs).toEqual([2000, 5000, 10000]); // hardcoded default
    });
  });

  // ==========================================================================
  // loadFromFile
  // ==========================================================================

  describe('loadFromFile', () => {
    it('loads playbook from a real YAML file', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      // Write a temp YAML file
      const tmpDir = os.tmpdir();
      const tmpFile = path.join(tmpDir, `aqe-playbook-test-${Date.now()}.yaml`);
      await fs.writeFile(tmpFile, MINIMAL_PLAYBOOK, 'utf-8');

      try {
        await playbook.loadFromFile(tmpFile);
        const services = playbook.listServices();
        expect(services).toContain('postgres');
        const plan = playbook.getRecoveryPlan('postgres')!;
        expect(plan.healthCheck.command).toBe('pg_isready');
        expect(plan.recover).toHaveLength(1);
        expect(plan.recover[0].command).toBe('docker compose up -d postgres');
      } finally {
        await fs.unlink(tmpFile);
      }
    });

    it('rejects non-existent file path', async () => {
      await expect(playbook.loadFromFile('/tmp/does-not-exist-aqe.yaml'))
        .rejects.toThrow();
    });

    it('getConfig returns parsed config after loadFromFile', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpFile = path.join(os.tmpdir(), `aqe-playbook-config-${Date.now()}.yaml`);
      await fs.writeFile(tmpFile, MINIMAL_PLAYBOOK, 'utf-8');

      try {
        await playbook.loadFromFile(tmpFile);
        const config = playbook.getConfig();
        expect(config).toBeDefined();
        expect(config!.version).toBe('1.0.0');
        expect(config!.services).toHaveProperty('postgres');
      } finally {
        await fs.unlink(tmpFile);
      }
    });
  });
});
