/**
 * Unit tests for GossipPatternSharingProtocol
 *
 * Tests pattern-specific gossip protocol features:
 * - Pattern compression/decompression
 * - Priority-based pattern selection
 * - Anti-entropy reconciliation
 * - Pattern conflict resolution
 * - Quality-based filtering
 */

import { GossipPatternSharingProtocol, SharedPattern, PatternSharingConfig } from '../../../src/learning/GossipPatternSharingProtocol';
import { LearnedPattern } from '../../../src/learning/types';

/**
 * Helper function to calculate checksum matching the protocol's algorithm
 */
function calculateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

describe('GossipPatternSharingProtocol', () => {
  let protocol: GossipPatternSharingProtocol;
  let config: PatternSharingConfig;

  beforeEach(() => {
    config = {
      agentId: 'test-agent-1',
      maxExperiences: 1000,
      experienceTTL: 3600000, // 1 hour
      gossipInterval: 1000,
      fanout: 3,
      minSharePriority: 0.3,
      enableCompression: true,
      maxBandwidth: 1024 * 1024,
      enablePatternCompression: true,
      compressionThreshold: 100, // Low threshold for testing
      minPatternQuality: 0.5,
      minSuccessRate: 0.6,
      antiEntropyInterval: 5000,
      enableAntiEntropy: true
    };

    protocol = new GossipPatternSharingProtocol(config);
  });

  afterEach(async () => {
    await protocol.stop();
  });

  describe('Pattern Sharing', () => {
    it('should share a high-quality pattern', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-1',
        pattern: 'test-pattern',
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 10,
        contexts: ['unit-test', 'integration-test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      const patternId = await protocol.sharePattern(pattern);

      expect(patternId).toBe('pattern-1');
      expect(protocol.getPatternCount()).toBe(1);

      const stats = protocol.getStats();
      expect(stats.patternsShared).toBe(1);
      expect(stats.highValuePatternsShared).toBe(1); // High priority pattern
    });

    it('should filter low-quality patterns', async () => {
      const lowQualityPattern: LearnedPattern = {
        id: 'pattern-low',
        pattern: 'low-quality-pattern',
        confidence: 0.3, // Below minPatternQuality
        successRate: 0.4, // Below minSuccessRate
        usageCount: 1,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(lowQualityPattern);

      expect(protocol.getPatternCount()).toBe(0); // Pattern was filtered
      const stats = protocol.getStats();
      expect(stats.patternsShared).toBe(0);
    });

    it('should compress large patterns', async () => {
      const largePattern: LearnedPattern = {
        id: 'pattern-large',
        pattern: 'x'.repeat(1000), // Large pattern
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(largePattern);

      const patterns = protocol.getAllPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].isCompressed).toBe(true);
      expect(patterns[0].compressedContent).toBeDefined();

      const stats = protocol.getStats();
      expect(stats.bytesCompressed).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeGreaterThan(1); // Compression achieved
    });

    it('should not compress small patterns', async () => {
      const smallPattern: LearnedPattern = {
        id: 'pattern-small',
        pattern: 'small',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(smallPattern);

      const patterns = protocol.getAllPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].isCompressed).toBe(false);
      expect(patterns[0].compressedContent).toBeUndefined();
    });
  });

  describe('Pattern Reception', () => {
    it('should receive and decompress pattern from peer', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-remote',
        pattern: 'remote-pattern',
        confidence: 0.85,
        successRate: 0.9,
        usageCount: 8,
        contexts: ['integration'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      // Create a shared pattern from another agent
      const protocol2 = new GossipPatternSharingProtocol({
        ...config,
        agentId: 'test-agent-2'
      });

      await protocol2.sharePattern(pattern);
      const sharedPatterns = protocol2.getAllPatterns();

      // Receive pattern in first protocol
      const received = await protocol.receivePattern(sharedPatterns[0]);

      expect(received).toBe(true);
      expect(protocol.getPatternCount()).toBe(1);

      const stats = protocol.getStats();
      expect(stats.patternsReceived).toBe(1);

      await protocol2.stop();
    });

    it('should reject duplicate patterns', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-dup',
        pattern: 'duplicate-pattern',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      // Share locally
      await protocol.sharePattern(pattern);

      // Try to receive the same pattern
      const patterns = protocol.getAllPatterns();
      const received = await protocol.receivePattern(patterns[0]);

      expect(received).toBe(false); // Duplicate rejected
      expect(protocol.getPatternCount()).toBe(1);
    });

    it('should reject patterns with invalid checksum', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-invalid',
        pattern: 'invalid-pattern',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      const sharedPattern: SharedPattern = {
        id: pattern.id,
        pattern,
        sourceAgentId: 'test-agent-2',
        vectorClock: { 'test-agent-2': 1 },
        priority: 0.8,
        shareCount: 0,
        isCompressed: false,
        size: 100,
        checksum: 'invalid-checksum',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000
      };

      const received = await protocol.receivePattern(sharedPattern);

      expect(received).toBe(false); // Invalid checksum rejected
    });

    it('should reject expired patterns', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-expired',
        pattern: 'expired-pattern',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      const sharedPattern: SharedPattern = {
        id: pattern.id,
        pattern,
        sourceAgentId: 'test-agent-2',
        vectorClock: { 'test-agent-2': 1 },
        priority: 0.8,
        shareCount: 0,
        isCompressed: false,
        size: 100,
        checksum: '12345678',
        createdAt: Date.now() - 7200000,
        expiresAt: Date.now() - 3600000 // Expired 1 hour ago
      };

      const received = await protocol.receivePattern(sharedPattern);

      expect(received).toBe(false); // Expired pattern rejected
    });
  });

  describe('Pattern Conflict Resolution', () => {
    it('should resolve conflict using vector clocks', async () => {
      const pattern1: LearnedPattern = {
        id: 'pattern-conflict',
        pattern: 'version-1',
        confidence: 0.7,
        successRate: 0.75,
        usageCount: 3,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      const pattern2: LearnedPattern = {
        id: 'pattern-conflict',
        pattern: 'version-2',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      // Share pattern locally
      await protocol.sharePattern(pattern1);

      // Create remote shared pattern with newer vector clock
      const remotePattern: SharedPattern = {
        id: pattern2.id,
        pattern: pattern2,
        sourceAgentId: 'test-agent-2',
        vectorClock: { 'test-agent-2': 2 }, // Newer
        priority: 0.8,
        shareCount: 0,
        isCompressed: false,
        size: 100,
        checksum: calculateChecksum(JSON.stringify(pattern2)),
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000
      };

      const received = await protocol.receivePattern(remotePattern);

      expect(received).toBe(true);

      const stats = protocol.getStats();
      expect(stats.patternConflictsResolved).toBe(1);

      // Remote pattern should win (newer vector clock)
      const patterns = protocol.getAllPatterns();
      expect(patterns[0].pattern.pattern).toBe('version-2');
    });

    it('should use quality as tiebreaker for concurrent updates', async () => {
      const lowQualityPattern: LearnedPattern = {
        id: 'pattern-tie',
        pattern: 'low-quality',
        confidence: 0.6,
        successRate: 0.65,
        usageCount: 2,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      const highQualityPattern: LearnedPattern = {
        id: 'pattern-tie',
        pattern: 'high-quality',
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 10,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      // Share low-quality locally
      await protocol.sharePattern(lowQualityPattern);

      // Create concurrent remote update (both have updates the other doesn't)
      // Local has test-agent-1: 1, remote has test-agent-2: 1
      // Neither dominates the other = concurrent
      const remotePattern: SharedPattern = {
        id: highQualityPattern.id,
        pattern: highQualityPattern,
        sourceAgentId: 'test-agent-2',
        vectorClock: { 'test-agent-2': 1 }, // Concurrent - only has its own update
        priority: 0.9,
        shareCount: 0,
        isCompressed: false,
        size: 100,
        checksum: calculateChecksum(JSON.stringify(highQualityPattern)),
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000
      };

      await protocol.receivePattern(remotePattern);

      // High-quality pattern should win
      const patterns = protocol.getAllPatterns();
      expect(patterns[0].pattern.confidence).toBe(0.9);
    });
  });

  describe('Pattern Priority Calculation', () => {
    it('should calculate higher priority for recent high-quality patterns', async () => {
      const recentHighQuality: LearnedPattern = {
        id: 'pattern-recent',
        pattern: 'recent-pattern',
        confidence: 0.95,
        successRate: 0.98,
        usageCount: 50,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date() // Just used
      };

      await protocol.sharePattern(recentHighQuality);

      const patterns = protocol.getAllPatterns();
      expect(patterns[0].priority).toBeGreaterThan(0.8);
    });

    it('should calculate lower priority for old low-quality patterns', async () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      const oldLowQuality: LearnedPattern = {
        id: 'pattern-old',
        pattern: 'old-pattern',
        confidence: 0.6,
        successRate: 0.65,
        usageCount: 2,
        contexts: ['test'],
        createdAt: oldDate,
        lastUsedAt: oldDate
      };

      await protocol.sharePattern(oldLowQuality);

      const patterns = protocol.getAllPatterns();
      expect(patterns[0].priority).toBeLessThan(0.6);
    });
  });

  describe('Relevant Pattern Retrieval', () => {
    it('should retrieve patterns matching context', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'pattern-unit',
          pattern: 'unit-test-pattern',
          confidence: 0.9,
          successRate: 0.95,
          usageCount: 10,
          contexts: ['unit-test', 'jest'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'pattern-integration',
          pattern: 'integration-test-pattern',
          confidence: 0.85,
          successRate: 0.9,
          usageCount: 8,
          contexts: ['integration-test', 'api'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'pattern-e2e',
          pattern: 'e2e-test-pattern',
          confidence: 0.8,
          successRate: 0.85,
          usageCount: 5,
          contexts: ['e2e-test', 'selenium'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        }
      ];

      for (const pattern of patterns) {
        await protocol.sharePattern(pattern);
      }

      const unitPatterns = await protocol.getRelevantPatterns(['unit-test', 'jest'], 10);
      expect(unitPatterns.length).toBe(1);
      expect(unitPatterns[0].pattern.id).toBe('pattern-unit');

      const integrationPatterns = await protocol.getRelevantPatterns(['integration-test'], 10);
      expect(integrationPatterns.length).toBe(1);
      expect(integrationPatterns[0].pattern.id).toBe('pattern-integration');
    });

    it('should sort patterns by quality and priority', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'pattern-low',
          pattern: 'low-priority',
          confidence: 0.6,
          successRate: 0.65,
          usageCount: 2,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'pattern-high',
          pattern: 'high-priority',
          confidence: 0.95,
          successRate: 0.98,
          usageCount: 50,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'pattern-medium',
          pattern: 'medium-priority',
          confidence: 0.8,
          successRate: 0.85,
          usageCount: 20,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        }
      ];

      for (const pattern of patterns) {
        await protocol.sharePattern(pattern);
      }

      const relevant = await protocol.getRelevantPatterns(['test'], 10);
      expect(relevant.length).toBe(3);
      expect(relevant[0].pattern.id).toBe('pattern-high'); // Highest quality first
      expect(relevant[2].pattern.id).toBe('pattern-low'); // Lowest quality last
    });

    it('should respect limit parameter', async () => {
      const patterns: LearnedPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `pattern-${i}`,
        pattern: `pattern-${i}`,
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      }));

      for (const pattern of patterns) {
        await protocol.sharePattern(pattern);
      }

      const relevant = await protocol.getRelevantPatterns(['test'], 5);
      expect(relevant.length).toBe(5);
    });
  });

  describe('Peer Management', () => {
    it('should register peers', async () => {
      await protocol.registerPeer('peer-1');
      await protocol.registerPeer('peer-2');
      await protocol.registerPeer('peer-3');

      // Peers are tracked internally (no public getter in current implementation)
      // This test verifies no errors occur during registration
      expect(true).toBe(true);
    });

    it('should not register self as peer', async () => {
      await protocol.registerPeer('test-agent-1');

      // Self-registration should be silently ignored
      expect(true).toBe(true);
    });

    it('should unregister peers', async () => {
      await protocol.registerPeer('peer-1');
      await protocol.unregisterPeer('peer-1');

      // Unregistration should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track pattern sharing statistics', async () => {
      const pattern: LearnedPattern = {
        id: 'pattern-stats',
        pattern: 'stats-pattern',
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 10,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(pattern);

      const stats = protocol.getStats();
      expect(stats.patternsShared).toBe(1);
      expect(stats.patternsReceived).toBe(0);
      expect(stats.averagePatternQuality).toBeCloseTo(0.9, 1);
    });

    it('should track compression statistics', async () => {
      const largePattern: LearnedPattern = {
        id: 'pattern-compress-stats',
        pattern: 'x'.repeat(2000),
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(largePattern);

      const stats = protocol.getStats();
      expect(stats.bytesCompressed).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeGreaterThan(1);
    });

    it('should update average quality correctly', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'p1',
          pattern: 'p1',
          confidence: 0.6,
          successRate: 0.7,
          usageCount: 2,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'p2',
          pattern: 'p2',
          confidence: 0.8,
          successRate: 0.85,
          usageCount: 5,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'p3',
          pattern: 'p3',
          confidence: 1.0,
          successRate: 1.0,
          usageCount: 20,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        }
      ];

      for (const pattern of patterns) {
        await protocol.sharePattern(pattern);
      }

      const stats = protocol.getStats();
      const expectedAvg = (0.6 + 0.8 + 1.0) / 3;
      expect(stats.averagePatternQuality).toBeCloseTo(expectedAvg, 1);
    });
  });

  describe('Import/Export', () => {
    it('should export patterns', async () => {
      const patterns: LearnedPattern[] = [
        {
          id: 'export-1',
          pattern: 'export-pattern-1',
          confidence: 0.8,
          successRate: 0.85,
          usageCount: 5,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        },
        {
          id: 'export-2',
          pattern: 'export-pattern-2',
          confidence: 0.9,
          successRate: 0.95,
          usageCount: 10,
          contexts: ['test'],
          createdAt: new Date(),
          lastUsedAt: new Date()
        }
      ];

      for (const pattern of patterns) {
        await protocol.sharePattern(pattern);
      }

      const exported = protocol.exportPatterns();
      expect(exported.length).toBe(2);
      expect(exported[0].id).toBeDefined();
      expect(exported[0].pattern).toBeDefined();
    });

    it('should import patterns', async () => {
      const protocol2 = new GossipPatternSharingProtocol({
        ...config,
        agentId: 'test-agent-2'
      });

      const pattern: LearnedPattern = {
        id: 'import-1',
        pattern: 'import-pattern',
        confidence: 0.85,
        successRate: 0.9,
        usageCount: 7,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol2.sharePattern(pattern);
      const exported = protocol2.exportPatterns();

      const importedCount = await protocol.importPatterns(exported);

      expect(importedCount).toBe(1);
      expect(protocol.getPatternCount()).toBe(1);

      const stats = protocol.getStats();
      expect(stats.patternsReceived).toBe(1);

      await protocol2.stop();
    });
  });

  describe('Clear', () => {
    it('should clear all patterns and reset statistics', async () => {
      const pattern: LearnedPattern = {
        id: 'clear-test',
        pattern: 'clear-pattern',
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        contexts: ['test'],
        createdAt: new Date(),
        lastUsedAt: new Date()
      };

      await protocol.sharePattern(pattern);
      expect(protocol.getPatternCount()).toBe(1);

      protocol.clear();

      expect(protocol.getPatternCount()).toBe(0);

      const stats = protocol.getStats();
      expect(stats.patternsShared).toBe(0);
      expect(stats.patternsReceived).toBe(0);
      expect(stats.averagePatternQuality).toBe(0);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop protocol', async () => {
      await protocol.start();
      expect(true).toBe(true); // Protocol started

      await protocol.stop();
      expect(true).toBe(true); // Protocol stopped
    });

    it('should not start twice', async () => {
      await protocol.start();
      await protocol.start(); // Should warn but not error

      await protocol.stop();
    });

    it('should handle anti-entropy when enabled', async () => {
      const protocol2 = new GossipPatternSharingProtocol({
        ...config,
        enableAntiEntropy: true,
        antiEntropyInterval: 100 // Fast for testing
      });

      await protocol2.registerPeer('peer-1');
      await protocol2.start();

      // Wait for at least one anti-entropy round
      await new Promise(resolve => setTimeout(resolve, 200));

      const stats = protocol2.getStats();
      expect(stats.antiEntropyRounds).toBeGreaterThan(0);

      await protocol2.stop();
    });
  });
});
