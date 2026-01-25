/**
 * PrivacyManager Unit Tests
 *
 * Tests privacy controls for learning data including:
 * - Privacy levels (PUBLIC, TEAM, PRIVATE, PARANOID)
 * - Code sanitization
 * - Agent ID anonymization
 * - Data encryption
 * - Retention policies
 */

import {
  PrivacyManager,
  PrivacyLevel,
  PrivacyConfig
} from '../../../src/learning/PrivacyManager';
import { TaskExperience, TaskState, AgentAction } from '../../../src/learning/types';
import { SharedExperience } from '../../../src/learning/ExperienceSharingProtocol';

describe('PrivacyManager', () => {
  // Helper to create a test experience
  const createTestExperience = (agentId: string = 'test-agent-001'): TaskExperience => ({
    taskId: 'task-001',
    taskType: 'test',
    state: {
      taskComplexity: 0.5,
      requiredCapabilities: ['test'],
      contextFeatures: {
        code: 'const password = "secret123";',
        config: 'api_key = "abc-xyz-123"'
      },
      previousAttempts: 0,
      availableResources: 1.0
    },
    action: {
      strategy: 'default',
      toolsUsed: ['jest'],
      parallelization: 0.5,
      retryPolicy: 'exponential',
      resourceAllocation: 0.5
    },
    reward: 1.0,
    nextState: {
      taskComplexity: 0.5,
      requiredCapabilities: ['test'],
      contextFeatures: {},
      previousAttempts: 1,
      availableResources: 0.9
    },
    timestamp: new Date(),
    agentId
  });

  const createSharedExperience = (experience: TaskExperience): SharedExperience => ({
    id: 'shared-001',
    experience,
    sourceAgentId: experience.agentId,
    vectorClock: { [experience.agentId]: 1 },
    priority: 0.8,
    shareCount: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    checksum: 'abc123'
  });

  describe('Privacy Levels', () => {
    describe('PUBLIC Level', () => {
      it('should allow experience sharing', () => {
        const manager = new PrivacyManager({ level: PrivacyLevel.PUBLIC });

        expect(manager.canShareExperiences()).toBe(true);
        expect(manager.canPersist()).toBe(true);
        expect(manager.canShareWith('any-agent')).toBe(true);

        manager.dispose();
      });

      it('should not sanitize code by default', () => {
        const manager = new PrivacyManager({ level: PrivacyLevel.PUBLIC });
        const experience = createTestExperience();

        const { sanitized, redactions } = manager.sanitizeExperience(experience);

        expect(sanitized.state.contextFeatures).toEqual(experience.state.contextFeatures);
        expect(redactions).toHaveLength(0);

        manager.dispose();
      });

      it('should retain data for 1 year by default', () => {
        const manager = new PrivacyManager({ level: PrivacyLevel.PUBLIC });

        const now = new Date();
        const elevenMonthsAgo = new Date(now.getTime() - 330 * 24 * 60 * 60 * 1000);
        const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

        const recentResult = manager.applyRetentionPolicy(elevenMonthsAgo);
        const oldResult = manager.applyRetentionPolicy(twoYearsAgo);

        expect(recentResult.shouldRetain).toBe(true);
        expect(oldResult.shouldRetain).toBe(false);

        manager.dispose();
      });
    });

    describe('TEAM Level', () => {
      it('should require team namespace', () => {
        expect(() => {
          new PrivacyManager({ level: PrivacyLevel.TEAM });
        }).toThrow('teamNamespace is required for TEAM privacy level');
      });

      it('should only share within team namespace', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.TEAM,
          teamNamespace: 'team-alpha'
        });

        expect(manager.canShareExperiences()).toBe(true);
        expect(manager.canShareWith('agent-1', 'team-alpha')).toBe(true);
        expect(manager.canShareWith('agent-2', 'team-beta')).toBe(false);

        manager.dispose();
      });

      it('should sanitize code snippets', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.TEAM,
          teamNamespace: 'team-alpha'
        });
        const experience = createTestExperience();

        const { sanitized, redactions } = manager.sanitizeExperience(experience);

        expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
        expect(sanitized.state.contextFeatures?.config).toContain('[REDACTED]');
        expect(redactions.length).toBeGreaterThan(0);

        manager.dispose();
      });

      it('should anonymize agent IDs', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.TEAM,
          teamNamespace: 'team-alpha'
        });
        const experience = createTestExperience('real-agent-123');

        const { sanitized, anonymized } = manager.sanitizeExperience(experience);

        expect(sanitized.agentId).not.toBe('real-agent-123');
        expect(sanitized.agentId).toMatch(/^agent-[a-f0-9]{16}$/);
        expect(anonymized).toBe(true);

        manager.dispose();
      });

      it('should retain data for 90 days by default', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.TEAM,
          teamNamespace: 'team-alpha'
        });

        const now = new Date();
        const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const fourMonthsAgo = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

        const recentResult = manager.applyRetentionPolicy(twoMonthsAgo);
        const oldResult = manager.applyRetentionPolicy(fourMonthsAgo);

        expect(recentResult.shouldRetain).toBe(true);
        expect(oldResult.shouldRetain).toBe(false);

        manager.dispose();
      });
    });

    describe('PRIVATE Level', () => {
      it('should not allow experience sharing', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PRIVATE,
          encryptionKey: 'test-key-123'
        });

        expect(manager.canShareExperiences()).toBe(false);
        expect(manager.canPersist()).toBe(true);
        expect(manager.canShareWith('any-agent')).toBe(false);

        manager.dispose();
      });

      it('should encrypt action data', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PRIVATE,
          encryptionKey: 'test-key-123'
        });
        const experience = createTestExperience();

        const { sanitized, encrypted } = manager.sanitizeExperience(experience);

        expect(encrypted).toBe(true);
        expect(sanitized.action).toHaveProperty('encrypted', true);
        expect(sanitized.action).toHaveProperty('iv');
        expect(sanitized.action).toHaveProperty('data');

        manager.dispose();
      });

      it('should decrypt encrypted action data', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PRIVATE,
          encryptionKey: 'test-key-123'
        });
        const experience = createTestExperience();

        const { sanitized } = manager.sanitizeExperience(experience);
        const decrypted = manager.decryptActionData(sanitized.action);

        expect(decrypted).toEqual(experience.action);

        manager.dispose();
      });

      it('should redact sensitive patterns', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PRIVATE,
          encryptionKey: 'test-key-123'
        });
        const experience = createTestExperience();
        experience.state.contextFeatures = {
          code: 'email: test@example.com, ssn: 123-45-6789',
          config: 'card: 1234 5678 9012 3456'
        };

        const { sanitized } = manager.sanitizeExperience(experience);

        expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
        expect(sanitized.state.contextFeatures?.code).not.toContain('test@example.com');
        expect(sanitized.state.contextFeatures?.code).not.toContain('123-45-6789');

        manager.dispose();
      });

      it('should retain data for 30 days by default', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PRIVATE,
          encryptionKey: 'test-key-123'
        });

        const now = new Date();
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        const recentResult = manager.applyRetentionPolicy(twoWeeksAgo);
        const oldResult = manager.applyRetentionPolicy(twoMonthsAgo);

        expect(recentResult.shouldRetain).toBe(true);
        expect(oldResult.shouldRetain).toBe(false);

        manager.dispose();
      });
    });

    describe('PARANOID Level', () => {
      it('should not allow persistence or sharing', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PARANOID,
          encryptionKey: 'test-key-123'
        });

        expect(manager.canShareExperiences()).toBe(false);
        expect(manager.canPersist()).toBe(false);
        expect(manager.canShareWith('any-agent')).toBe(false);

        manager.dispose();
      });

      it('should enforce max experience age', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PARANOID,
          encryptionKey: 'test-key-123',
          maxExperienceAge: 60 * 60 * 1000 // 1 hour
        });

        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        const recentResult = manager.applyRetentionPolicy(thirtyMinutesAgo);
        const oldResult = manager.applyRetentionPolicy(twoHoursAgo);

        expect(recentResult.shouldRetain).toBe(true);
        expect(oldResult.shouldRetain).toBe(false);

        manager.dispose();
      });

      it('should use aggressive redaction patterns', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PARANOID,
          encryptionKey: 'test-key-123'
        });
        const experience = createTestExperience();
        experience.state.contextFeatures = {
          code: 'ip: 192.168.1.1, hash: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          config: 'server: 10.0.0.5'
        };

        const { sanitized, redactions } = manager.sanitizeExperience(experience);

        expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
        expect(redactions.length).toBeGreaterThan(0);

        manager.dispose();
      });

      it('should encrypt patterns for storage', () => {
        const manager = new PrivacyManager({
          level: PrivacyLevel.PARANOID,
          encryptionKey: 'test-key-123'
        });

        const pattern = 'test:strategy:critical-data';
        const encrypted = manager.encryptPattern(pattern);

        expect(encrypted).toMatch(/^encrypted:[a-f0-9]{32}:[a-f0-9]+$/);
        expect(encrypted).not.toContain(pattern);

        const decrypted = manager.decryptPattern(encrypted);
        expect(decrypted).toBe(pattern);

        manager.dispose();
      });
    });
  });

  describe('Code Sanitization', () => {
    it('should redact passwords from code', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });
      const experience = createTestExperience();
      experience.state.contextFeatures = {
        code: 'const password = "mysecret123";'
      };

      const { sanitized } = manager.sanitizeExperience(experience);

      expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
      expect(sanitized.state.contextFeatures?.code).not.toContain('mysecret123');

      manager.dispose();
    });

    it('should redact API keys from code', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });
      const experience = createTestExperience();
      experience.state.contextFeatures = {
        code: 'const api_key = "sk-abc123xyz";'
      };

      const { sanitized } = manager.sanitizeExperience(experience);

      expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
      expect(sanitized.state.contextFeatures?.code).not.toContain('sk-abc123xyz');

      manager.dispose();
    });

    it('should handle custom redaction patterns', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key',
        redactionPatterns: [
          '\\b[A-Z]{3}-\\d{4}\\b' // Custom pattern for codes like "ABC-1234"
        ]
      });
      const experience = createTestExperience();
      experience.state.contextFeatures = {
        code: 'ticket: ABC-1234'
      };

      const { sanitized } = manager.sanitizeExperience(experience);

      expect(sanitized.state.contextFeatures?.code).toContain('[REDACTED]');
      expect(sanitized.state.contextFeatures?.code).not.toContain('ABC-1234');

      manager.dispose();
    });

    it('should sanitize nested objects recursively', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });
      const experience = createTestExperience();
      experience.state.contextFeatures = {
        outer: {
          inner: {
            secret: 'password = "hidden"'
          }
        }
      };

      const { sanitized } = manager.sanitizeExperience(experience);

      expect(sanitized.state.contextFeatures?.outer?.inner?.secret).toContain('[REDACTED]');

      manager.dispose();
    });

    it('should sanitize arrays', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });
      const experience = createTestExperience();
      experience.state.contextFeatures = {
        commands: [
          'echo password="secret123"',  // Quoted value matches pattern
          'run test'
        ]
      };

      const { sanitized } = manager.sanitizeExperience(experience);

      expect(sanitized.state.contextFeatures?.commands[0]).toContain('[REDACTED]');
      expect(sanitized.state.contextFeatures?.commands[1]).toBe('run test');

      manager.dispose();
    });
  });

  describe('Agent ID Anonymization', () => {
    it('should generate consistent anonymous IDs', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      const anon1 = manager.anonymizeAgentId('test-agent-001');
      const anon2 = manager.anonymizeAgentId('test-agent-001');
      const anon3 = manager.anonymizeAgentId('test-agent-002');

      expect(anon1).toBe(anon2);
      expect(anon1).not.toBe(anon3);
      expect(anon1).toMatch(/^agent-[a-f0-9]{16}$/);

      manager.dispose();
    });

    it('should allow de-anonymization', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      const original = 'test-agent-001';
      const anonymous = manager.anonymizeAgentId(original);
      const restored = manager.deAnonymizeAgentId(anonymous);

      expect(restored).toBe(original);

      manager.dispose();
    });

    it('should sanitize shared experience agent IDs', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });
      const experience = createTestExperience('real-agent-123');
      const shared = createSharedExperience(experience);

      const sanitized = manager.sanitizeSharedExperience(shared);

      expect(sanitized.sourceAgentId).not.toBe('real-agent-123');
      expect(sanitized.experience.agentId).not.toBe('real-agent-123');

      manager.dispose();
    });

    it('should clear anonymization mappings', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      const anon1 = manager.anonymizeAgentId('test-agent-001');
      manager.clearAnonymizationMappings();

      // After clearing, old anonymous ID should not be reversible
      // (don't re-anonymize, as deterministic hashing would recreate the mapping)
      const restored = manager.deAnonymizeAgentId(anon1);
      expect(restored).toBeUndefined();

      manager.dispose();
    });
  });

  describe('Data Retention Policies', () => {
    it('should enforce custom retention periods', () => {
      const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC,
        retentionPeriod
      });

      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const recentResult = manager.applyRetentionPolicy(fiveDaysAgo);
      const oldResult = manager.applyRetentionPolicy(tenDaysAgo);

      expect(recentResult.shouldRetain).toBe(true);
      expect(recentResult.expiresAt).toBeDefined();
      expect(oldResult.shouldRetain).toBe(false);

      manager.dispose();
    });

    it('should handle zero retention period (keep forever)', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC,
        retentionPeriod: 0
      });

      const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);
      const result = manager.applyRetentionPolicy(tenYearsAgo);

      expect(result.shouldRetain).toBe(true);
      expect(result.reason).toContain('keep forever');

      manager.dispose();
    });

    it('should provide expiration dates for retained data', () => {
      const retentionPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC,
        retentionPeriod
      });

      const now = new Date();
      const result = manager.applyRetentionPolicy(now);

      expect(result.shouldRetain).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt!.getTime()).toBeCloseTo(now.getTime() + retentionPeriod, -2);

      manager.dispose();
    });
  });

  describe('Configuration Management', () => {
    it('should get current privacy level', () => {
      const manager = new PrivacyManager({ level: PrivacyLevel.PRIVATE });

      expect(manager.getPrivacyLevel()).toBe(PrivacyLevel.PRIVATE);

      manager.dispose();
    });

    it('should get full configuration', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test-team'
      });

      const config = manager.getConfig();

      expect(config.level).toBe(PrivacyLevel.TEAM);
      expect(config.teamNamespace).toBe('test-team');
      expect(config.retentionPeriod).toBeGreaterThan(0);

      manager.dispose();
    });

    it('should update configuration', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC
      });

      manager.updateConfig({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'new-key-123'
      });

      expect(manager.getPrivacyLevel()).toBe(PrivacyLevel.PRIVATE);

      manager.dispose();
    });

    it('should get privacy statistics', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      manager.anonymizeAgentId('agent-1');
      manager.anonymizeAgentId('agent-2');

      const stats = manager.getStats();

      expect(stats.privacyLevel).toBe(PrivacyLevel.TEAM);
      expect(stats.canShare).toBe(true);
      expect(stats.canPersist).toBe(true);
      expect(stats.anonymizedAgents).toBe(2);
      expect(stats.redactionPatterns).toBeGreaterThan(0);

      manager.dispose();
    });
  });

  describe('Pattern Encryption', () => {
    it('should encrypt patterns in PRIVATE mode', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key-123'
      });

      const pattern = 'test:strategy:sensitive';
      const encrypted = manager.encryptPattern(pattern);

      expect(encrypted).not.toBe(pattern);
      expect(encrypted).toMatch(/^encrypted:/);

      manager.dispose();
    });

    it('should decrypt patterns correctly', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key-123'
      });

      const pattern = 'test:strategy:sensitive-data';
      const encrypted = manager.encryptPattern(pattern);
      const decrypted = manager.decryptPattern(encrypted);

      expect(decrypted).toBe(pattern);

      manager.dispose();
    });

    it('should not encrypt patterns in PUBLIC mode', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC
      });

      const pattern = 'test:strategy';
      const result = manager.encryptPattern(pattern);

      expect(result).toBe(pattern);

      manager.dispose();
    });

    it('should handle decryption errors gracefully', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key-123'
      });

      const malformed = 'encrypted:invalid:data';
      const result = manager.decryptPattern(malformed);

      // Should return original if decryption fails
      expect(result).toBe(malformed);

      manager.dispose();
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should stop cleanup timer on dispose', (done) => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PARANOID,
        encryptionKey: 'test-key',
        maxExperienceAge: 1000
      });

      // Timer should start for PARANOID mode
      setTimeout(() => {
        manager.dispose();
        // After dispose, timer should be stopped
        expect(manager.getStats().privacyLevel).toBe(PrivacyLevel.PARANOID);
        done();
      }, 100);
    });

    it('should clear encryption key on dispose', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key-123'
      });

      const pattern = 'test';
      const encrypted = manager.encryptPattern(pattern);
      expect(encrypted).toMatch(/^encrypted:/);

      manager.dispose();

      // After dispose, encryption should not work
      const result = manager.encryptPattern('test2');
      expect(result).toBe('test2'); // Should return unencrypted

      manager.dispose();
    });

    it('should clear anonymization mappings on dispose', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      manager.anonymizeAgentId('agent-1');
      expect(manager.getStats().anonymizedAgents).toBe(1);

      manager.dispose();

      expect(manager.getStats().anonymizedAgents).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle PUBLIC to PRIVATE upgrade', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PUBLIC
      });

      expect(manager.canShareExperiences()).toBe(true);

      manager.updateConfig({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'secure-key'
      });

      expect(manager.canShareExperiences()).toBe(false);

      manager.dispose();
    });

    it('should handle PRIVATE to PARANOID upgrade', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.PRIVATE,
        encryptionKey: 'test-key'
      });

      expect(manager.canPersist()).toBe(true);

      manager.updateConfig({
        level: PrivacyLevel.PARANOID
      });

      expect(manager.canPersist()).toBe(false);

      manager.dispose();
    });

    it('should maintain anonymization consistency across sanitization calls', () => {
      const manager = new PrivacyManager({
        level: PrivacyLevel.TEAM,
        teamNamespace: 'test'
      });

      const exp1 = createTestExperience('agent-001');
      const exp2 = createTestExperience('agent-001');

      const san1 = manager.sanitizeExperience(exp1);
      const san2 = manager.sanitizeExperience(exp2);

      expect(san1.sanitized.agentId).toBe(san2.sanitized.agentId);

      manager.dispose();
    });
  });
});
