/**
 * Code Intelligence - Hypergraph Integration
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: Hypergraph initialization, untested functions, impacted tests,
 * coverage gaps, build from index, impact enhancement
 */

import { Result, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import {
  HypergraphEngine,
  createHypergraphEngine,
  type BuildResult as HypergraphBuildResult,
  type CodeIndexResult,
} from '../../integrations/ruvector/hypergraph-engine.js';
import { type HypergraphNode } from '../../integrations/ruvector/hypergraph-schema.js';
import type { EventBus, MemoryBackend } from '../../kernel/interfaces';
import { createEvent } from '../../shared/events/domain-events';
import type { ImpactRequest, ImpactAnalysis } from './interfaces';

/**
 * Initialize V3 Hypergraph Engine for code intelligence
 */
export async function initializeHypergraph(
  hypergraphDbPath: string | undefined,
  enableGNN: boolean
): Promise<{ engine: HypergraphEngine; db: import('better-sqlite3').Database }> {
  const { openDatabase } = await import('../../shared/safe-db.js');
  const fs = await import('fs');
  const path = await import('path');
  const { findProjectRoot } = await import('../../kernel/unified-memory.js');
  const projectRoot = findProjectRoot();
  const dbPath = hypergraphDbPath || path.join(projectRoot, '.agentic-qe', 'hypergraph.db');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = openDatabase(dbPath);

  const engine = await createHypergraphEngine({
    db,
    maxTraversalDepth: 10,
    maxQueryResults: 1000,
    enableVectorSearch: enableGNN,
  });

  console.log(`[CodeIntelligence] Hypergraph Engine initialized at ${dbPath}`);
  return { engine, db };
}

/**
 * Find untested functions using hypergraph analysis
 */
export async function findUntestedFunctions(
  hypergraph: HypergraphEngine,
  eventBus: EventBus,
  publishEvents: boolean
): Promise<Result<HypergraphNode[], Error>> {
  try {
    const untestedFunctions = await hypergraph.findUntestedFunctions();

    console.log(
      `[CodeIntelligence] Found ${untestedFunctions.length} untested functions via hypergraph`
    );

    if (publishEvents) {
      const event = createEvent(
        'code-intelligence.UntestedFunctionsFound',
        'code-intelligence',
        {
          count: untestedFunctions.length,
          functions: untestedFunctions.slice(0, 10).map((f) => ({
            name: f.name,
            file: f.filePath,
            complexity: f.complexity,
          })),
        }
      );
      await eventBus.publish(event);
    }

    return { success: true, value: untestedFunctions };
  } catch (error) {
    const errorObj = toError(error);
    console.error('[CodeIntelligence] Failed to find untested functions:', errorObj.message);
    return err(errorObj);
  }
}

/**
 * Find impacted tests using hypergraph traversal
 */
export async function findImpactedTestsFromHypergraph(
  hypergraph: HypergraphEngine,
  changedFiles: string[],
  eventBus: EventBus,
  publishEvents: boolean
): Promise<Result<HypergraphNode[], Error>> {
  if (changedFiles.length === 0) {
    return { success: true, value: [] };
  }

  try {
    const impactedTests = await hypergraph.findImpactedTests(changedFiles);

    console.log(
      `[CodeIntelligence] Found ${impactedTests.length} impacted tests for ` +
        `${changedFiles.length} changed files via hypergraph`
    );

    if (publishEvents) {
      const event = createEvent(
        'code-intelligence.ImpactedTestsFound',
        'code-intelligence',
        {
          changedFiles,
          testCount: impactedTests.length,
          tests: impactedTests.slice(0, 10).map((t) => ({
            name: t.name,
            file: t.filePath,
          })),
        }
      );
      await eventBus.publish(event);
    }

    return { success: true, value: impactedTests };
  } catch (error) {
    const errorObj = toError(error);
    console.error('[CodeIntelligence] Failed to find impacted tests:', errorObj.message);
    return err(errorObj);
  }
}

/**
 * Find coverage gaps using hypergraph analysis
 */
export async function findCoverageGapsFromHypergraph(
  hypergraph: HypergraphEngine,
  maxCoverage: number,
  eventBus: EventBus,
  publishEvents: boolean
): Promise<Result<HypergraphNode[], Error>> {
  try {
    const coverageGaps = await hypergraph.findCoverageGaps(maxCoverage);

    console.log(
      `[CodeIntelligence] Found ${coverageGaps.length} coverage gaps ` +
        `(functions with <=${maxCoverage}% coverage) via hypergraph`
    );

    if (publishEvents) {
      const event = createEvent(
        'code-intelligence.CoverageGapsFound',
        'code-intelligence',
        {
          maxCoverage,
          gapCount: coverageGaps.length,
          gaps: coverageGaps.slice(0, 10).map((g) => ({
            name: g.name,
            file: g.filePath,
            coverage: g.coverage,
            complexity: g.complexity,
          })),
        }
      );
      await eventBus.publish(event);
    }

    return { success: true, value: coverageGaps };
  } catch (error) {
    const errorObj = toError(error);
    console.error('[CodeIntelligence] Failed to find coverage gaps:', errorObj.message);
    return err(errorObj);
  }
}

/**
 * Build hypergraph from code index result
 */
export async function buildHypergraphFromIndex(
  hypergraph: HypergraphEngine,
  indexResult: CodeIndexResult,
  memory: MemoryBackend,
  eventBus: EventBus,
  publishEvents: boolean
): Promise<Result<HypergraphBuildResult, Error>> {
  try {
    console.log(
      `[CodeIntelligence] Building hypergraph from ${indexResult.files.length} indexed files`
    );

    const buildResult = await hypergraph.buildFromIndexResult(indexResult);

    console.log(
      `[CodeIntelligence] Hypergraph built: ` +
        `${buildResult.nodesCreated} nodes created, ` +
        `${buildResult.nodesUpdated} nodes updated, ` +
        `${buildResult.edgesCreated} edges created ` +
        `(${buildResult.durationMs}ms)`
    );

    await memory.set(
      `hypergraph:build:latest`,
      {
        timestamp: new Date().toISOString(),
        ...buildResult,
      },
      { namespace: 'code-intelligence', persist: true }
    );

    if (publishEvents) {
      const event = createEvent(
        'code-intelligence.HypergraphBuilt',
        'code-intelligence',
        {
          nodesCreated: buildResult.nodesCreated,
          nodesUpdated: buildResult.nodesUpdated,
          edgesCreated: buildResult.edgesCreated,
          durationMs: buildResult.durationMs,
          errorCount: buildResult.errors.length,
        }
      );
      await eventBus.publish(event);
    }

    return { success: true, value: buildResult };
  } catch (error) {
    const errorObj = toError(error);
    console.error('[CodeIntelligence] Failed to build hypergraph:', errorObj.message);
    return err(errorObj);
  }
}

/**
 * Enhanced impact analysis using hypergraph
 */
export async function enhanceImpactWithHypergraph(
  hypergraph: HypergraphEngine,
  request: ImpactRequest,
  baseAnalysis: ImpactAnalysis
): Promise<ImpactAnalysis> {
  try {
    const hypergraphTests = await hypergraph.findImpactedTests(request.changedFiles);

    const allTests = new Set([
      ...baseAnalysis.impactedTests,
      ...hypergraphTests.map((t) => t.filePath || t.name),
    ]);

    let newRiskLevel = baseAnalysis.riskLevel;
    if (hypergraphTests.length > baseAnalysis.impactedTests.length) {
      const totalImpact =
        baseAnalysis.directImpact.length + baseAnalysis.transitiveImpact.length;
      if (totalImpact > 10 && allTests.size > 20) {
        newRiskLevel = 'critical';
      } else if (totalImpact > 5 && allTests.size > 10) {
        newRiskLevel = 'high';
      }
    }

    const newRecommendations = [...baseAnalysis.recommendations];
    if (hypergraphTests.length > 0) {
      newRecommendations.push(
        `Hypergraph analysis found ${hypergraphTests.length} additional test(s) to run`
      );
    }

    return {
      ...baseAnalysis,
      impactedTests: Array.from(allTests),
      riskLevel: newRiskLevel,
      recommendations: newRecommendations,
    };
  } catch (error) {
    console.error('[CodeIntelligence] Failed to enhance impact with hypergraph:', error);
    return baseAnalysis;
  }
}
