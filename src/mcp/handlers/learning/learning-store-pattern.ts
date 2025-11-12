/**
 * MCP Tool: learning_store_pattern
 *
 * Stores a successful pattern for an agent. Patterns capture proven approaches,
 * strategies, and techniques that worked well and should be reused.
 *
 * Part of Phase 1 implementation of Option C (Hybrid Approach) for
 * enabling learning persistence with Claude Code Task tool.
 */

import { BaseHandler, HandlerResponse } from '../base-handler';
import type { SwarmMemoryManager } from '../../../core/memory/SwarmMemoryManager';
import type { AgentRegistry } from '../../services/AgentRegistry';
import type { HookExecutor } from '../../services/HookExecutor';

export interface LearningPattern {
  agentId?: string;
  pattern: string;
  confidence: number; // 0-1 scale
  domain?: string;
  usageCount?: number;
  successRate?: number;
  metadata?: Record<string, any>;
}

export class LearningStorePatternHandler extends BaseHandler {
  constructor(
    private registry?: AgentRegistry,
    private hookExecutor?: HookExecutor,
    private memoryManager?: SwarmMemoryManager,
    private eventBus?: import('events').EventEmitter
  ) {
    super();
  }

  async handle(args: LearningPattern): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      const {
        agentId,
        pattern,
        confidence,
        domain = 'general',
        usageCount = 1,
        successRate = 1.0,
        metadata = {}
      } = args;

      // Validate inputs
      this.validateRequired(args, ['pattern', 'confidence']);

      if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
        throw new Error('confidence must be a number between 0 and 1');
      }

      if (typeof pattern !== 'string' || pattern.trim().length === 0) {
        throw new Error('pattern must be a non-empty string');
      }

      // Get memory manager
      if (!this.memoryManager) {
        throw new Error('SwarmMemoryManager not initialized');
      }

      const db = (this.memoryManager as any).db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Use existing patterns table instead of creating test_patterns
      // Note: patterns table should have agent_id, domain, success_rate columns (added via migration)

      // Generate unique pattern ID
      const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Check if pattern already exists (for the same agent + pattern text)
      const existing = agentId ? db.prepare(`
        SELECT id, usage_count, success_rate, confidence FROM patterns
        WHERE agent_id = ? AND pattern = ?
      `).get(agentId, pattern) as { id: string; usage_count: number; success_rate: number; confidence: number } | undefined : undefined;

      if (existing) {
        // Update existing pattern (weighted average for confidence and success rate)
        const newUsageCount = existing.usage_count + usageCount;
        const weightedConfidence = (existing.confidence * existing.usage_count + confidence * usageCount) / newUsageCount;
        const weightedSuccessRate = (existing.success_rate * existing.usage_count + successRate * usageCount) / newUsageCount;

        db.prepare(`
          UPDATE patterns
          SET usage_count = ?, confidence = ?, success_rate = ?, metadata = ?
          WHERE id = ?
        `).run(
          newUsageCount,
          weightedConfidence,
          weightedSuccessRate,
          JSON.stringify(metadata),
          existing.id
        );

        this.log('info', `Pattern updated: ${existing.id}`, {
          agentId,
          domain,
          usageCount: newUsageCount,
          confidence: weightedConfidence,
          successRate: weightedSuccessRate
        });

        // Emit event to track explicit learning (prevents duplicate auto-storage)
        if (this.eventBus) {
          this.eventBus.emit('learning:pattern:stored', {
            agentId,
            type: 'pattern'
          });
        }

        return this.createSuccessResponse({
          patternId: existing.id,
          message: `Pattern updated successfully${agentId ? ` for ${agentId}` : ''}`,
          pattern: {
            id: existing.id,
            domain,
            confidence: weightedConfidence,
            usageCount: newUsageCount,
            successRate: weightedSuccessRate
          }
        }, requestId);

      } else {
        // Insert new pattern into patterns table
        db.prepare(`
          INSERT INTO patterns (
            id, pattern, confidence, usage_count, agent_id, domain, success_rate,
            metadata, ttl, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          patternId,
          pattern,
          confidence,
          usageCount,
          agentId || null,
          domain,
          successRate,
          JSON.stringify(metadata),
          0, // ttl (0 = no expiry)
          Date.now(),
          null // expires_at
        );

        this.log('info', `Pattern stored: ${patternId}`, {
          agentId,
          domain,
          confidence,
          usageCount,
          successRate
        });

        // Emit event to track explicit learning (prevents duplicate auto-storage)
        if (this.eventBus) {
          this.eventBus.emit('learning:pattern:stored', {
            agentId,
            type: 'pattern'
          });
        }

        return this.createSuccessResponse({
          patternId,
          message: `Pattern stored successfully${agentId ? ` for ${agentId}` : ''}`,
          pattern: {
            id: patternId,
            domain,
            confidence,
            usageCount
          }
        }, requestId);
      }

    });
  }
}
