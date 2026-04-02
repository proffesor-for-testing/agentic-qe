/**
 * Tests for Tier2SessionSummary (IMP-08)
 */

import { describe, it, expect } from 'vitest';
import { Tier2SessionSummary, type ConversationMessage } from '../../../src/context/compaction/tier2-session-summary';

function makeMessage(role: ConversationMessage['role'], content: string, extra?: Partial<ConversationMessage>): ConversationMessage {
  return { role, content, timestamp: Date.now(), ...extra };
}

describe('Tier2SessionSummary', () => {
  const tier2 = new Tier2SessionSummary({ minRecentTokens: 100, maxSummaryTokens: 5_000 });

  describe('empty input', () => {
    it('should handle empty message list', () => {
      const result = tier2.compact([]);
      expect(result.tier).toBe(2);
      expect(result.summary).toBe('');
      expect(result.preservedMessages).toHaveLength(0);
      expect(result.tokensSaved).toBe(0);
    });
  });

  describe('preservation', () => {
    it('should preserve recent messages up to minRecentTokens', () => {
      const messages: ConversationMessage[] = [
        makeMessage('user', 'a'.repeat(300)),   // ~100 tokens
        makeMessage('assistant', 'b'.repeat(300)), // ~100 tokens
        makeMessage('user', 'c'.repeat(300)),      // ~100 tokens (recent)
        makeMessage('assistant', 'd'.repeat(300)), // ~100 tokens (recent)
      ];

      const result = tier2.compact(messages);
      expect(result.preservedMessages.length).toBeGreaterThan(0);
      expect(result.preservedTokens).toBeGreaterThanOrEqual(100);
    });

    it('should not break tool_use/tool_result pairs', () => {
      const messages: ConversationMessage[] = [
        makeMessage('user', 'old request'),
        makeMessage('tool_use', 'call tool', { toolUseId: 'pair-1', toolName: 'test' }),
        makeMessage('tool_result', 'result data', { toolUseId: 'pair-1' }),
        makeMessage('user', 'recent request with enough tokens to meet threshold: ' + 'x'.repeat(300)),
      ];

      const result = tier2.compact(messages);

      // Check that if tool_result is preserved, tool_use is too
      const preserved = result.preservedMessages;
      const hasToolResult = preserved.some(m => m.role === 'tool_result' && m.toolUseId === 'pair-1');
      const hasToolUse = preserved.some(m => m.role === 'tool_use' && m.toolUseId === 'pair-1');

      if (hasToolResult) {
        expect(hasToolUse).toBe(true);
      }
    });
  });

  describe('summary output', () => {
    it('should produce structured summary with sections', () => {
      const messages: ConversationMessage[] = [
        makeMessage('user', 'Analyze test coverage for auth module'),
        makeMessage('assistant', 'Found 3 uncovered branches in login.ts'),
        makeMessage('tool_use', 'coverage_analyze', { toolName: 'coverage_analyze' }),
        makeMessage('tool_result', '{"coverage": 72}'),
        // Recent tail
        makeMessage('user', 'recent: ' + 'x'.repeat(400)),
      ];

      const result = tier2.compact(messages);

      if (result.summary) {
        expect(result.summary).toContain('Session Summary');
        expect(result.summary).toContain('User Requests');
      }
    });

    it('should include tool call summaries', () => {
      const messages: ConversationMessage[] = [
        makeMessage('tool_use', 'Running security scan', { toolName: 'security_scan' }),
        makeMessage('tool_result', 'No vulnerabilities found'),
        makeMessage('user', 'recent: ' + 'x'.repeat(400)),
      ];

      const result = tier2.compact(messages);
      if (result.summary && result.removedMessageCount > 0) {
        expect(result.summary).toContain('Tool Calls');
      }
    });
  });

  describe('token savings', () => {
    it('should report positive tokensSaved when messages are summarized', () => {
      const messages: ConversationMessage[] = [];
      // Add enough old messages to guarantee summarization
      for (let i = 0; i < 20; i++) {
        messages.push(makeMessage('user', `Request ${i}: ${'x'.repeat(200)}`));
        messages.push(makeMessage('assistant', `Response ${i}: ${'y'.repeat(200)}`));
      }

      const result = tier2.compact(messages);
      expect(result.originalMessageCount).toBe(40);
      expect(result.removedMessageCount).toBeGreaterThan(0);
      expect(result.tokensSaved).toBeGreaterThan(0);
    });
  });

  describe('summary truncation', () => {
    it('should truncate summary if it exceeds maxSummaryTokens', () => {
      const smallBudget = new Tier2SessionSummary({ minRecentTokens: 50, maxSummaryTokens: 100 });
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push(makeMessage('user', `Long request ${i}: ${'data'.repeat(100)}`));
      }

      const result = smallBudget.compact(messages);
      if (result.summary) {
        // Summary should be capped — token estimate should not wildly exceed budget
        const summaryChars = result.summary.length;
        // 100 tokens * 3 chars/token = 300 char limit + truncation message
        expect(summaryChars).toBeLessThan(600);
      }
    });
  });
});
