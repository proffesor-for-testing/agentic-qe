/**
 * Tests for Tier4Reactive (IMP-08)
 */

import { describe, it, expect } from 'vitest';
import { Tier4Reactive } from '../../../src/context/compaction/tier4-reactive';
import type { ConversationMessage } from '../../../src/context/compaction/tier2-session-summary';

function makeMsg(role: ConversationMessage['role'], content: string, extra?: Partial<ConversationMessage>): ConversationMessage {
  return { role, content, timestamp: Date.now(), ...extra };
}

describe('Tier4Reactive', () => {
  const tier4 = new Tier4Reactive({ recoveryTarget: 500, minPreservedMessages: 2 });

  describe('empty input', () => {
    it('should handle empty messages', () => {
      const result = tier4.compact([], 'context_overflow');
      expect(result.tier).toBe(4);
      expect(result.survivingMessages).toHaveLength(0);
      expect(result.droppedCount).toBe(0);
    });
  });

  describe('already under target', () => {
    it('should return all messages if already under recovery target', () => {
      const messages: ConversationMessage[] = [
        makeMsg('user', 'hi'),
        makeMsg('assistant', 'hello'),
      ];

      const result = tier4.compact(messages);
      expect(result.droppedCount).toBe(0);
      expect(result.survivingMessages).toHaveLength(2);
      expect(result.tokensSaved).toBe(0);
    });
  });

  describe('aggressive peeling', () => {
    it('should drop oldest messages to get under recovery target', () => {
      const messages: ConversationMessage[] = [];
      // Create 10 messages, each ~100 tokens (300 chars / 3)
      for (let i = 0; i < 10; i++) {
        messages.push(makeMsg('user', `Message ${i}: ${'x'.repeat(300)}`));
      }

      const result = tier4.compact(messages, 'status_413');
      expect(result.trigger).toBe('status_413');
      expect(result.droppedCount).toBeGreaterThan(0);
      expect(result.survivingTokens).toBeLessThanOrEqual(600); // some tolerance
      expect(result.tokensSaved).toBeGreaterThan(0);
    });

    it('should preserve minimum tail messages', () => {
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(makeMsg('user', 'x'.repeat(300)));
      }

      const result = tier4.compact(messages);
      // minPreservedMessages = 2
      expect(result.survivingMessages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('tool pair handling', () => {
    it('should drop tool_use and tool_result pairs together', () => {
      const messages: ConversationMessage[] = [
        makeMsg('tool_use', 'x'.repeat(300), { toolUseId: 'pair-1', toolName: 'test' }),
        makeMsg('tool_result', 'y'.repeat(300), { toolUseId: 'pair-1' }),
        makeMsg('user', 'short'), // preserved tail
        makeMsg('assistant', 'ok'), // preserved tail
      ];

      const result = tier4.compact(messages);

      // If one of the pair was dropped, both should be dropped
      const surviving = result.survivingMessages;
      const hasTU = surviving.some(m => m.role === 'tool_use' && m.toolUseId === 'pair-1');
      const hasTR = surviving.some(m => m.role === 'tool_result' && m.toolUseId === 'pair-1');
      // Either both survived or neither
      expect(hasTU).toBe(hasTR);
    });
  });

  describe('isContextOverflow', () => {
    it('should detect 413 status code', () => {
      expect(Tier4Reactive.isContextOverflow(413)).toBe(true);
      expect(Tier4Reactive.isContextOverflow(200)).toBe(false);
    });

    it('should detect context_length_exceeded in error message', () => {
      expect(Tier4Reactive.isContextOverflow('context_length_exceeded')).toBe(true);
    });

    it('should detect maximum context length in error message', () => {
      expect(Tier4Reactive.isContextOverflow('Error: maximum context length reached')).toBe(true);
    });

    it('should detect too many tokens', () => {
      expect(Tier4Reactive.isContextOverflow('too many tokens in request')).toBe(true);
    });

    it('should return false for unrelated messages', () => {
      expect(Tier4Reactive.isContextOverflow('connection timeout')).toBe(false);
    });
  });

  describe('trigger types', () => {
    it('should record trigger type in result', () => {
      const messages = [makeMsg('user', 'x'.repeat(1000))];

      expect(tier4.compact(messages, 'status_413').trigger).toBe('status_413');
      expect(tier4.compact(messages, 'context_overflow').trigger).toBe('context_overflow');
      expect(tier4.compact(messages, 'manual').trigger).toBe('manual');
    });
  });
});
