/**
 * Tests for RuvllmProvider SessionManager Integration (M0.1)
 *
 * Tests Phase 0 M0.1: SessionManager Integration
 * Expected: 50% latency reduction for multi-turn conversations
 */

import { RuvllmProvider } from '../../../src/providers/RuvllmProvider';

describe('RuvllmProvider SessionManager Integration', () => {
  let provider: RuvllmProvider;

  beforeEach(() => {
    provider = new RuvllmProvider({
      enableSessions: true,
      sessionTimeout: 5 * 60 * 1000, // 5 minutes for testing
      maxSessions: 10,
      enableTRM: false, // Disable TRM for simpler testing
      enableSONA: false // Disable SONA for simpler testing
    });
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  describe('Session Creation', () => {
    it('should create a new session', () => {
      const session = provider.createSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^session-\d+-[a-z0-9]+$/);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastUsedAt).toBeGreaterThan(0);
      expect(session.messageCount).toBe(0);
      expect(session.context).toEqual([]);
    });

    it('should retrieve an existing session', () => {
      const session1 = provider.createSession();
      const session2 = provider.getSession(session1.id);

      expect(session2).toBeDefined();
      expect(session2?.id).toBe(session1.id);
    });

    it('should return undefined for non-existent session', () => {
      const session = provider.getSession('non-existent-id');
      expect(session).toBeUndefined();
    });

    it('should enforce max sessions limit', () => {
      const sessions = [];

      // Create max sessions + 1
      for (let i = 0; i < 11; i++) {
        sessions.push(provider.createSession());
      }

      // First session should be evicted
      const firstSession = provider.getSession(sessions[0].id);
      expect(firstSession).toBeUndefined();

      // Last session should still exist
      const lastSession = provider.getSession(sessions[10].id);
      expect(lastSession).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should end a session', () => {
      const session = provider.createSession();
      const ended = provider.endSession(session.id);

      expect(ended).toBe(true);
      expect(provider.getSession(session.id)).toBeUndefined();
    });

    it('should return false when ending non-existent session', () => {
      const ended = provider.endSession('non-existent-id');
      expect(ended).toBe(false);
    });

    it('should update lastUsedAt when accessing session', () => {
      const session = provider.createSession();
      const originalTime = session.lastUsedAt;

      // Wait a bit
      const waitTime = 10;
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // Busy wait
      }

      const retrieved = provider.getSession(session.id);
      expect(retrieved?.lastUsedAt).toBeGreaterThan(originalTime);
    });
  });

  describe('Session Metrics', () => {
    it('should return initial metrics', () => {
      const metrics = provider.getSessionMetrics();

      expect(metrics.totalSessions).toBe(0);
      expect(metrics.activeSessions).toBe(0);
      expect(metrics.avgMessagesPerSession).toBe(0);
      expect(metrics.avgLatencyReduction).toBe(0);
      expect(metrics.cacheHitRate).toBe(0);
    });

    it('should track session count', () => {
      provider.createSession();
      provider.createSession();
      provider.createSession();

      const metrics = provider.getSessionMetrics();
      expect(metrics.totalSessions).toBe(3);
      expect(metrics.activeSessions).toBe(3);
    });

    it('should identify active sessions', () => {
      const session1 = provider.createSession();
      const session2 = provider.createSession();

      // Manually set one session to be old
      const oldSession = provider.getSession(session1.id);
      if (oldSession) {
        oldSession.lastUsedAt = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      }

      const metrics = provider.getSessionMetrics();
      expect(metrics.totalSessions).toBe(2);
      expect(metrics.activeSessions).toBe(1); // Only session2 is active
    });
  });

  describe('Configuration', () => {
    it('should initialize with default session config', () => {
      const defaultProvider = new RuvllmProvider({});
      const config = (defaultProvider as any).config;

      expect(config.enableSessions).toBe(true);
      expect(config.sessionTimeout).toBe(30 * 60 * 1000); // 30 minutes
      expect(config.maxSessions).toBe(100);
    });

    it('should respect custom session config', () => {
      const customProvider = new RuvllmProvider({
        enableSessions: false,
        sessionTimeout: 1000,
        maxSessions: 5
      });
      const config = (customProvider as any).config;

      expect(config.enableSessions).toBe(false);
      expect(config.sessionTimeout).toBe(1000);
      expect(config.maxSessions).toBe(5);
    });
  });

  describe('Session Context Enhancement', () => {
    it('should enhance options with empty context for new session', () => {
      const session = provider.createSession();
      const options = {
        messages: [
          { role: 'user' as const, content: 'Hello' }
        ]
      };

      const enhanced = (provider as any).enhanceWithSessionContext(options, session);
      expect(enhanced.messages).toHaveLength(1); // No context added yet
    });

    it('should enhance options with session context', () => {
      const session = provider.createSession();
      session.context = ['User: Hi', 'Assistant: Hello'];

      const options = {
        messages: [
          { role: 'user' as const, content: 'How are you?' }
        ]
      };

      const enhanced = (provider as any).enhanceWithSessionContext(options, session);
      expect(enhanced.messages).toHaveLength(2); // System message + user message
      expect(enhanced.messages[0].role).toBe('system');
      expect(enhanced.messages[0].content).toContain('Previous conversation context');
    });
  });

  describe('Metadata Integration', () => {
    it('should log session configuration on initialization', () => {
      const testProvider = new RuvllmProvider({
        enableSessions: true,
        sessionTimeout: 1000,
        maxSessions: 50
      });

      // Verify config was set
      const config = (testProvider as any).config;
      expect(config.enableSessions).toBe(true);
      expect(config.sessionTimeout).toBe(1000);
      expect(config.maxSessions).toBe(50);
    });
  });
});
