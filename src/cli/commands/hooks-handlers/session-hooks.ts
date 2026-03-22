/**
 * Agentic QE v3 - Session Hooks (session-start, session-end)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Handles session lifecycle hooks.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { findProjectRoot } from '../../../kernel/unified-memory.js';
import {
  state,
  getHooksSystem,
  createHybridBackendWithTimeout,
  consolidateExperiencesToPatterns,
  printJson,
  printSuccess,
  DREAM_STATE_KEY,
  type DreamHookState,
} from './hooks-shared.js';

/**
 * Register session-start and session-end subcommands on the hooks command.
 */
export function registerSessionHooks(hooks: Command): void {
  // -------------------------------------------------------------------------
  // session-start: Initialize session state (called by SessionStart hook)
  // -------------------------------------------------------------------------
  hooks
    .command('session-start')
    .description('Initialize session state when Claude Code session starts')
    .option('-s, --session-id <id>', 'Session ID')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const sessionId = options.sessionId || `session-${Date.now()}`;
        state.sessionId = sessionId;

        // Initialize hooks system (lazy)
        const { reasoningBank } = await getHooksSystem();

        // Get initial stats for context
        const stats = await reasoningBank.getStats();

        // Initialize dream scheduler state for this session
        const projectRoot = findProjectRoot();
        const dataDir = path.join(projectRoot, '.agentic-qe');
        const memoryBackend = await createHybridBackendWithTimeout(dataDir);

        // Load existing dream state or create fresh one
        let dreamState = await memoryBackend.get<DreamHookState>(DREAM_STATE_KEY);
        const isNewSession = !dreamState || !dreamState.sessionStartTime;

        if (!dreamState) {
          dreamState = {
            lastDreamTime: null,
            experienceCount: 0,
            sessionStartTime: new Date().toISOString(),
            totalDreamsThisSession: 0,
          };
        } else {
          // Reset session counters but preserve lastDreamTime across sessions
          dreamState.sessionStartTime = new Date().toISOString();
          dreamState.totalDreamsThisSession = 0;
          // Don't reset experienceCount — carry over unfulfilled experiences
        }

        await memoryBackend.set(DREAM_STATE_KEY, dreamState);

        // Build context injection for Claude
        const contextParts: string[] = [];
        contextParts.push(`AQE Learning: ${stats.totalPatterns} patterns loaded`);

        // Top domains by pattern count
        const domainEntries = Object.entries(stats.byDomain)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);
        if (domainEntries.length > 0) {
          contextParts.push(`Top domains: ${domainEntries.map(([d, c]) => `${d}(${c})`).join(', ')}`);
        }

        if (stats.patternSuccessRate > 0) {
          contextParts.push(`Pattern success rate: ${(stats.patternSuccessRate * 100).toFixed(0)}%`);
        }
        if (stats.routingRequests > 0) {
          contextParts.push(`Routing confidence: ${(stats.avgRoutingConfidence * 100).toFixed(0)}% across ${stats.routingRequests} requests`);
        }

        const additionalContext = contextParts.join('. ') + '.';

        if (options.json) {
          printJson({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext,
            },
            sessionId,
            initialized: true,
            patternsLoaded: stats.totalPatterns,
            dreamScheduler: {
              enabled: true,
              lastDreamTime: dreamState.lastDreamTime,
              pendingExperiences: dreamState.experienceCount,
            },
          });
        } else {
          printSuccess(`Session started: ${sessionId}`);
          console.log(chalk.dim(`  Patterns loaded: ${stats.totalPatterns}`));
          console.log(chalk.dim(`  Dream scheduler: enabled (${dreamState.experienceCount} pending experiences)`));
        }

        return;
      } catch (error) {
        // Don't fail the hook - just log and return cleanly
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        return; // Return cleanly even on error (continueOnError)
      }
    });

  // -------------------------------------------------------------------------
  // session-end: Save session state (called by Stop hook)
  // -------------------------------------------------------------------------
  hooks
    .command('session-end')
    .description('Save session state when Claude Code session ends')
    .option('--save-state', 'Save learning state to disk')
    .option('--export-metrics', 'Export session metrics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const sessionId = state.sessionId || 'unknown';

        // Get final stats if system is already initialized (don't init just for shutdown)
        let stats = null;
        if (state.initialized && state.reasoningBank) {
          try {
            stats = await state.reasoningBank.getStats();
          } catch {
            // Ignore - system may not be available during shutdown
          }
        }

        // Run lightweight experience-to-pattern consolidation
        let patternsCreated = 0;
        try {
          patternsCreated = await consolidateExperiencesToPatterns();
        } catch {
          // Non-critical — don't block session end
        }

        if (options.json) {
          const summary = stats
            ? `Session complete: ${stats.totalPatterns} patterns, ${stats.routingRequests} routings, ${(stats.patternSuccessRate * 100).toFixed(0)}% success rate`
            : 'Session complete';

          // Stop hooks don't support hookSpecificOutput — only simple fields
          printJson({
            continue: true,
            sessionId,
            stateSaved: options.saveState || false,
            metricsExported: options.exportMetrics || false,
            patternsConsolidated: patternsCreated,
            finalStats: stats ? {
              patternsLearned: stats.totalPatterns,
              routingRequests: stats.routingRequests,
              successRate: stats.patternSuccessRate,
            } : null,
          });
        } else {
          printSuccess(`Session ended: ${sessionId}`);
          if (stats) {
            console.log(chalk.dim(`  Patterns: ${stats.totalPatterns}`));
            console.log(chalk.dim(`  Routing requests: ${stats.routingRequests}`));
          }
          if (patternsCreated > 0) {
            console.log(chalk.dim(`  Patterns consolidated: ${patternsCreated}`));
          }
        }

        return;
      } catch (error) {
        // Don't fail the hook - just return cleanly
        if (options.json) {
          printJson({ success: false, error: error instanceof Error ? error.message : 'unknown' });
        }
        return;
      }
    });
}
