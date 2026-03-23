/**
 * Agentic QE v3 - Hypergraph Query MCP Handler
 *
 * Exposes hypergraph queries as an MCP tool:
 *   - stats: node/edge counts
 *   - untested: functions without test coverage
 *   - impacted: tests impacted by changed files
 *   - gaps: functions with low coverage
 */

import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { ToolResult } from '../types.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import { openDatabase } from '../../shared/safe-db.js';
import { createHypergraphEngine } from '../../integrations/ruvector/hypergraph-engine.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface HypergraphQueryParams {
  /** Query type */
  query: 'stats' | 'untested' | 'impacted' | 'gaps';
  /** Changed files (for 'impacted' query) */
  files?: string[];
  /** Max coverage threshold (for 'gaps' query, default 50) */
  maxCoverage?: number;
  /** Max results (default 20) */
  limit?: number;
}

export interface HypergraphQueryResult {
  query: string;
  data: Record<string, unknown>;
  totalResults: number;
}

// ============================================================================
// Helpers
// ============================================================================

function makeResult(
  success: boolean,
  startTime: number,
  data?: HypergraphQueryResult,
  error?: string
): ToolResult<HypergraphQueryResult> {
  return {
    success,
    data,
    error,
    metadata: {
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      requestId: uuidv4(),
      domain: 'code-intelligence',
      toolName: 'hypergraph_query',
      dataSource: 'real',
    },
  };
}

// ============================================================================
// Handler
// ============================================================================

export async function handleHypergraphQuery(
  params: HypergraphQueryParams
): Promise<ToolResult<HypergraphQueryResult>> {
  const startTime = Date.now();

  try {
    const projectRoot = findProjectRoot();
    const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');

    if (!existsSync(dbPath)) {
      return makeResult(false, startTime, undefined,
        `Database not found: ${dbPath}. Run "aqe init --auto" first.`);
    }

    const db = openDatabase(dbPath);
    try {
      const engine = await createHypergraphEngine({
        db,
        maxTraversalDepth: 10,
        maxQueryResults: 1000,
        enableVectorSearch: false,
      });

      const limit = params.limit || 20;

      switch (params.query) {
        case 'stats': {
          const stats = await engine.getStats();
          return makeResult(true, startTime, {
            query: 'stats',
            data: {
              totalNodes: stats.totalNodes,
              totalEdges: stats.totalEdges,
              nodesByType: stats.nodesByType,
              edgesByType: stats.edgesByType,
              avgComplexity: stats.avgComplexity,
              avgCoverage: stats.avgCoverage,
              nodesWithEmbeddings: stats.nodesWithEmbeddings,
            },
            totalResults: stats.totalNodes + stats.totalEdges,
          });
        }

        case 'untested': {
          const untested = await engine.findUntestedFunctions();
          const results = untested.slice(0, limit);
          return makeResult(true, startTime, {
            query: 'untested',
            data: {
              functions: results.map(fn => ({
                name: fn.name,
                filePath: fn.filePath,
                lineStart: fn.lineStart,
                complexity: fn.complexity,
              })),
            },
            totalResults: untested.length,
          });
        }

        case 'impacted': {
          if (!params.files || params.files.length === 0) {
            return makeResult(false, startTime, undefined,
              'The "files" parameter is required for the "impacted" query.');
          }
          // Resolve relative paths to absolute so they match hypergraph entries
          const absoluteFiles = params.files.map(f => resolve(f));
          const tests = await engine.findImpactedTests(absoluteFiles);
          return makeResult(true, startTime, {
            query: 'impacted',
            data: {
              changedFiles: params.files,
              impactedTests: tests.map(t => ({
                name: t.name,
                filePath: t.filePath,
              })),
            },
            totalResults: tests.length,
          });
        }

        case 'gaps': {
          const maxCov = params.maxCoverage ?? 50;
          const gaps = await engine.findCoverageGaps(maxCov);
          const results = gaps.slice(0, limit);
          return makeResult(true, startTime, {
            query: 'gaps',
            data: {
              maxCoverage: maxCov,
              functions: results.map(fn => ({
                name: fn.name,
                filePath: fn.filePath,
                coverage: fn.coverage,
                complexity: fn.complexity,
              })),
            },
            totalResults: gaps.length,
          });
        }

        default:
          return makeResult(false, startTime, undefined,
            `Unknown query type: "${params.query}". Use: stats, untested, impacted, gaps`);
      }
    } finally {
      try { db.close(); } catch { /* ignore */ }
    }
  } catch (error) {
    return makeResult(false, startTime, undefined, toErrorMessage(error));
  }
}
