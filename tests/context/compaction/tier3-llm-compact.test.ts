/**
 * Tests for Tier3LLMCompact (IMP-08)
 */

import { describe, it, expect, vi } from 'vitest';
import { Tier3LLMCompact, type LLMCompactCaller } from '../../../src/context/compaction/tier3-llm-compact';
import type { ConversationMessage } from '../../../src/context/compaction/tier2-session-summary';

function makeMsg(role: ConversationMessage['role'], content: string): ConversationMessage {
  return { role, content, timestamp: Date.now() };
}

describe('Tier3LLMCompact', () => {
  describe('without LLM caller (extractive fallback)', () => {
    const tier3 = new Tier3LLMCompact();

    it('should handle empty messages', async () => {
      const result = await tier3.compact([]);
      expect(result.tier).toBe(3);
      expect(result.summary).toBe('');
      expect(result.tokensSaved).toBe(0);
      expect(result.usedFallback).toBe(false);
    });

    it('should produce extractive fallback with 9 sections', async () => {
      const messages: ConversationMessage[] = [
        makeMsg('user', 'Analyze test coverage for the auth module'),
        makeMsg('assistant', 'Coverage is at 72% with 3 uncovered branches'),
        makeMsg('tool_use', 'coverage_analyze --target auth'),
        makeMsg('tool_result', 'Analyzed: src/auth/login.ts, src/auth/register.ts'),
      ];

      const result = await tier3.compact(messages);
      expect(result.tier).toBe(3);
      expect(result.usedFallback).toBe(true);
      expect(result.summary).toContain('1. Primary QE Objective');
      expect(result.summary).toContain('2. Key Technical Findings');
      expect(result.summary).toContain('3. Files and Test Artifacts');
      expect(result.summary).toContain('4. Errors and Fixes Applied');
      expect(result.summary).toContain('5. Quality Gates Status');
      expect(result.summary).toContain('6. All User Requests');
      expect(result.summary).toContain('7. Pending QE Tasks');
      expect(result.summary).toContain('8. Current Analysis State');
      expect(result.summary).toContain('9. Suggested Next Action');
    });

    it('should extract file paths from messages', async () => {
      const messages: ConversationMessage[] = [
        makeMsg('user', 'Check src/auth/login.ts and tests/auth.test.ts'),
      ];

      const result = await tier3.compact(messages);
      expect(result.summary).toContain('login.ts');
    });

    it('should extract error mentions', async () => {
      const messages: ConversationMessage[] = [
        makeMsg('user', 'Fix the tests'),
        makeMsg('assistant', 'Error: test suite failed with 2 failures'),
      ];

      const result = await tier3.compact(messages);
      expect(result.summary).toContain('Error');
    });
  });

  describe('with LLM caller', () => {
    it('should use LLM caller when available', async () => {
      const mockCaller: LLMCompactCaller = {
        call: vi.fn().mockResolvedValue('## 1. Primary QE Objective\n- Test coverage analysis\n## 2. Key Technical Findings\n- Low coverage'),
      };

      const tier3 = new Tier3LLMCompact({ llmCall: mockCaller });
      const messages: ConversationMessage[] = [
        makeMsg('user', 'Analyze coverage'),
        makeMsg('assistant', 'Coverage at 60%'),
      ];

      const result = await tier3.compact(messages);
      expect(result.usedFallback).toBe(false);
      expect(mockCaller.call).toHaveBeenCalledOnce();
      expect(result.summary).toContain('Primary QE Objective');
    });

    it('should fallback on LLM call failure', async () => {
      const failingCaller: LLMCompactCaller = {
        call: vi.fn().mockRejectedValue(new Error('API rate limit')),
      };

      const tier3 = new Tier3LLMCompact({ llmCall: failingCaller });
      const messages: ConversationMessage[] = [
        makeMsg('user', 'Do something'),
      ];

      const result = await tier3.compact(messages);
      expect(result.usedFallback).toBe(true);
      expect(result.summary).toContain('Extractive Fallback');
    });
  });

  describe('token savings', () => {
    it('should report positive savings for non-trivial input', async () => {
      const tier3 = new Tier3LLMCompact();
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(makeMsg('user', `Request ${i}: ${'x'.repeat(200)}`));
        messages.push(makeMsg('assistant', `Response ${i}: ${'y'.repeat(200)}`));
      }

      const result = await tier3.compact(messages);
      expect(result.originalMessageCount).toBe(40);
      expect(result.tokensSaved).toBeGreaterThan(0);
    });
  });

  describe('summary truncation', () => {
    it('should truncate oversized LLM response', async () => {
      const verboseCaller: LLMCompactCaller = {
        call: vi.fn().mockResolvedValue('x'.repeat(200_000)), // way over budget
      };

      const tier3 = new Tier3LLMCompact({ llmCall: verboseCaller, maxSummaryTokens: 1_000 });
      const messages: ConversationMessage[] = [makeMsg('user', 'test')];

      const result = await tier3.compact(messages);
      // 1000 tokens * 3 chars = 3000 char limit
      expect(result.summary.length).toBeLessThan(4000);
      expect(result.summary).toContain('[LLM summary truncated');
    });
  });
});
