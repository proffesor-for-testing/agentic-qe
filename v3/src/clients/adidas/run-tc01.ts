/**
 * Agentic QE v3 - Adidas Order-to-Cash Runner
 * Drives the full O2C lifecycle: create → ship → deliver → invoice → return → credit.
 *
 * Usage:
 *   aqe run o2c                                   # Create new order + full lifecycle
 *   aqe run o2c --order APT26149445               # Validate existing order
 *   aqe run o2c --parallel 3                      # Run N orders in parallel
 *
 * Direct (without aqe CLI):
 *   npx tsx v3/src/clients/adidas/run-tc01.ts
 *   npx tsx v3/src/clients/adidas/run-tc01.ts --order APT26149445
 *
 * Environment: Requires ADIDAS_OMNI_HOST, ADIDAS_STERLING_AUTH_METHOD, etc.
 * See config.ts for full env var documentation.
 */

import { resolve } from 'path';
import { loadAdidasConfig } from './config';
import { createAdidasTestContext } from './context';
import { buildTC01Lifecycle } from './tc01-lifecycle';
import { tc01Steps } from './tc01-steps';
import { createActionOrchestrator } from '../../integrations/orchestration/action-orchestrator';
import { generateTC01Report } from './report-generator';
import { runOrdersInParallel } from './parallel-order-runner';
import { createHealingHandler } from './healing-handler';
import { loadSterlingPatterns } from './sterling-patterns';
import { initHealingTelemetry } from './healing-telemetry';
import type { PatternLookup } from '../../shared/types/pattern-lookup';
import type { RunResult, StageResult } from '../../integrations/orchestration/action-types';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
  orderId?: string;
  parallel?: number;
  skipLayer2: boolean;
  skipLayer3: boolean;
  continueOnFailure: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    skipLayer2: false,
    skipLayer3: false,
    continueOnFailure: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--order':
        result.orderId = args[++i];
        break;
      case '--parallel':
        result.parallel = parseInt(args[++i], 10);
        break;
      case '--skip-layer2':
        result.skipLayer2 = true;
        break;
      case '--skip-layer3':
        result.skipLayer3 = true;
        break;
      case '--continue-on-failure':
        result.continueOnFailure = true;
        break;
    }
  }

  return result;
}

// ============================================================================
// Pattern Store Adapter (memory.db → PatternLookup)
// ============================================================================

/**
 * Create a PatternLookup adapter backed by memory.db (SQLite).
 * Uses the same database as the AQE learning system.
 * Returns null if the database is not available (e.g., first run, CI).
 */
async function createPatternLookup(): Promise<PatternLookup | undefined> {
  try {
    // Dynamic import to avoid hard dependency on better-sqlite3
    const Database = (await import('better-sqlite3')).default;
    const dbPath = resolve(process.cwd(), '.agentic-qe', 'memory.db');
    const db = new Database(dbPath);

    // Ensure the patterns table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS sterling_patterns (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        metadata TEXT,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Fetch all patterns (small dataset ~18 rows) and score in-memory.
    // Uses keyword overlap + tag filtering + confidence weighting.
    // More effective than LIKE '%keyword%' for relevance ranking.
    const allStmt = db.prepare(
      `SELECT name, description, content, confidence, tags, rowid as id FROM sterling_patterns`
    );

    const usageStmt = db.prepare(`
      UPDATE sterling_patterns
      SET usage_count = usage_count + 1,
          success_count = success_count + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
          updated_at = datetime('now')
      WHERE rowid = ?
    `);

    const patternLookup: PatternLookup = {
      async search(query, options) {
        const limit = options?.limit ?? 5;
        const allPatterns = allStmt.all() as Array<{
          name: string; description: string; content: string;
          confidence: number; tags: string; id: number;
        }>;

        // Filter by tags if specified (exact match on each required tag)
        let filtered = allPatterns;
        if (options?.tags?.length) {
          filtered = filtered.filter((p) => {
            try {
              const patternTags = JSON.parse(p.tags) as string[];
              return options.tags!.every((t) => patternTags.includes(t));
            } catch {
              return false;
            }
          });
        }

        // Score by keyword overlap: each query word checked against name+description+content
        const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        if (queryWords.length === 0) return [];

        const scored = filtered.map((p) => {
          const text = `${p.name} ${p.description} ${p.content}`.toLowerCase();
          const hits = queryWords.filter((w) => text.includes(w)).length;
          const relevance = hits / queryWords.length;
          return { name: p.name, content: p.content, confidence: p.confidence, id: String(p.id), relevance };
        });

        return scored
          .filter((p) => p.relevance > 0)
          .sort((a, b) => (b.relevance * b.confidence) - (a.relevance * a.confidence))
          .slice(0, limit)
          .map(({ name, content, confidence, id }) => ({ name, content, confidence, id }));
      },
      async recordUsage(patternId, outcome) {
        usageStmt.run(outcome.success ? 1 : 0, patternId);
      },
    };

    return patternLookup;
  } catch {
    // Database not available — cross-session learning disabled
    return undefined;
  }
}

/**
 * Create a PatternStoreAdapter for loadSterlingPatterns().
 * Backed by the same sterling_patterns table in memory.db.
 */
async function createPatternStoreAdapter() {
  try {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = resolve(process.cwd(), '.agentic-qe', 'memory.db');
    const db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS sterling_patterns (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        metadata TEXT,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO sterling_patterns (name, description, tags, content, confidence, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const getStmt = db.prepare('SELECT name FROM sterling_patterns WHERE name = ?');

    return {
      async storePattern(pattern: {
        name: string; description: string; tags: string[]; content: string;
        confidence: number; metadata: Record<string, string>;
      }) {
        insertStmt.run(
          pattern.name,
          pattern.description,
          JSON.stringify(pattern.tags),
          pattern.content,
          pattern.confidence,
          JSON.stringify(pattern.metadata),
        );
      },
      async getPattern(name: string) {
        return getStmt.get(name) ?? null;
      },
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Console Output
// ============================================================================

function printStageResult(stageId: string, result: StageResult): void {
  const icon = result.overallSuccess ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  const duration = (result.durationMs / 1000).toFixed(1);
  const verify = `${result.verification.passed}/${result.verification.passed + result.verification.failed}`;
  console.log(`  [${icon}] ${result.stageName} (${verify} checks, ${duration}s)`);

  if (result.action.error) {
    console.log(`         Action error: ${result.action.error}`);
  }
  if (result.poll.error) {
    console.log(`         Poll error: ${result.poll.error}`);
  }

  for (const step of result.verification.steps) {
    if (!step.result.success && step.result.error) {
      console.log(`         ${step.stepId}: ${step.result.error}`);
    }
  }
}

function printSummary(result: RunResult, orderId: string, reportPath: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`  Order: ${orderId}`);
  console.log(`  Stages: ${result.passed} passed, ${result.failed} failed`);
  console.log(`  Checks: ${result.totalChecks}`);
  console.log(`  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Result: ${result.overallSuccess ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
  console.log(`  Report: ${reportPath}`);
  console.log('='.repeat(60));
}

// ============================================================================
// Main
// ============================================================================

export async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Loading Adidas configuration...');
  const config = loadAdidasConfig();

  const orderId = args.orderId ?? process.env.ADIDAS_ORDER_NO;

  // --- Load Sterling patterns into memory.db (idempotent) ---
  const patternStoreAdapter = await createPatternStoreAdapter();
  if (patternStoreAdapter) {
    const count = await loadSterlingPatterns(patternStoreAdapter);
    if (count > 0) {
      console.log(`Loaded ${count} Sterling patterns into memory.db`);
    }
  }

  // --- Initialize healing telemetry (structured outcome recording) ---
  const dbPath = resolve(process.cwd(), '.agentic-qe', 'memory.db');
  const telemetry = await initHealingTelemetry(dbPath);

  // --- Create cross-session pattern lookup (HNSW fallback — dormant until 50+ outcomes) ---
  const patternLookup = await createPatternLookup();

  // --- Parallel mode ---
  if (args.parallel && args.parallel > 1) {
    // Each order is created fresh via the create-order stage (XAPI required)
    if (!config.xapi.enabled) {
      console.error('Error: Parallel mode creates new orders — XAPI credentials required.');
      console.error('  Set ADIDAS_XAPI_URL (+ ADIDAS_XAPI_USERNAME / ADIDAS_XAPI_PASSWORD)');
      process.exit(1);
    }

    // Generate test data for N orders
    const orderInputs = Array.from({ length: args.parallel }, () => ({
      enterpriseCode: config.enterpriseCode,
      sellerOrganizationCode: config.enterpriseCode,
      items: [{ itemId: 'EE6464_530', quantity: '1' }],
      shipTo: { firstName: 'QE', lastName: 'Automation', addressLine1: 'Rua Marques de Fronteira', city: 'Lisboa', zipCode: '1050-999', country: 'PT' },
    }));

    console.log(`Running ${args.parallel} orders in parallel (max concurrency: 5)...`);
    console.log(`  Self-healing: enabled (each order has its own healing handler)`);
    console.log(`  Cross-session learning: ${patternLookup ? 'enabled (shared pattern store)' : 'disabled'}`);
    console.log('');

    const parallelResult = await runOrdersInParallel(orderInputs, config, {
      maxConcurrency: 5,
      continueOnOrderFailure: true,
      skipLayer2: args.skipLayer2,
      skipLayer3: args.skipLayer3,
      patternStore: patternLookup,
      telemetry: telemetry ?? undefined,
      onOrderComplete: (orderNo, result, index) => {
        const healed = result.stages.some(s => !s.overallSuccess);
        const icon = result.overallSuccess
          ? (healed ? '\x1b[33mHEAL\x1b[0m' : '\x1b[32mPASS\x1b[0m')
          : '\x1b[31mFAIL\x1b[0m';
        const checks = `${result.passed}/${result.passed + result.failed} stages`;
        console.log(`  [${icon}] Order ${index + 1}/${args.parallel}: ${orderNo} (${checks})`);
      },
    });

    console.log(`\nParallel run complete: ${parallelResult.passed}/${parallelResult.totalOrders} orders passed`);
    process.exit(parallelResult.overallSuccess ? 0 : 1);
  }

  // --- Single order mode ---
  const mode = orderId ? 'validate' : 'create';

  if (mode === 'validate') {
    console.log(`O2C: Validating existing order ${orderId}`);
  } else {
    console.log('O2C: Creating new order via XAPI');
    if (!config.xapi.enabled) {
      console.error('Error: XAPI credentials required to create new orders.');
      console.error('  Set ADIDAS_XAPI_URL (+ ADIDAS_XAPI_USERNAME / ADIDAS_XAPI_PASSWORD)');
      console.error('  Or use --order <ORDER_NO> to validate an existing order.');
      process.exit(1);
    }
  }

  console.log(`  Layers: Sterling${args.skipLayer2 ? '' : ' + IIB'}${args.skipLayer3 ? '' : ' + NShift/Email/PDF/Browser'}`);
  console.log(`  XAPI: ${config.xapi.enabled ? 'enabled' : 'disabled (set ADIDAS_XAPI_URL + credentials)'}`);
  console.log(`  Self-healing: enabled (invoice recovery playbook)`);
  if (telemetry) {
    const stats = telemetry.getStats();
    console.log(`  Telemetry: ${stats.totalOutcomes} outcomes recorded, HNSW fallback: ${stats.hnswActivated ? 'active' : `dormant (${50 - stats.totalOutcomes} more to activate)`}`);
  } else {
    console.log(`  Telemetry: disabled (memory.db not available)`);
  }
  console.log('');

  const ctx = createAdidasTestContext(config);
  ctx.orderId = orderId ?? '';

  // Pre-flight health check
  console.log('Pre-flight: checking Sterling connectivity...');
  const healthy = await ctx.sterlingClient.healthCheck();
  if (!healthy) {
    console.error('Pre-flight FAILED: Sterling is unreachable. Check VPN and ADIDAS_OMNI_HOST.');
    process.exit(1);
  }
  console.log('Pre-flight: Sterling is reachable\n');

  const stages = buildTC01Lifecycle();
  const runId = `o2c-${Date.now()}`;
  const healingHandler = createHealingHandler({
    enterpriseCode: config.enterpriseCode,
    runId,
    telemetry: telemetry ?? undefined,
    patternStore: patternLookup ?? undefined,
  });
  const orchestrator = createActionOrchestrator({
    stages,
    verificationSteps: tc01Steps,
    skipLayer2: args.skipLayer2,
    skipLayer3: args.skipLayer3,
    continueOnVerifyFailure: args.continueOnFailure,
    onStageComplete: printStageResult,
    onStageFailed: healingHandler,
    maxStageRetries: 1,
  });

  const result = await orchestrator.runAll(ctx);

  // Close Playwright browser if XAPI client was used
  await ctx.xapiClient?.close?.();

  // Update pattern confidence from actual outcomes (telemetry → sterling_patterns)
  telemetry?.updateConfidenceFromOutcomes();

  // ctx.orderId is set by the create-order stage when creating new orders
  const finalOrderId = ctx.orderId || orderId || 'unknown';
  const reportPath = await generateTC01Report(result, finalOrderId);
  printSummary(result, finalOrderId, reportPath);

  process.exit(result.overallSuccess ? 0 : 1);
}

// Auto-execute only when run directly (not when imported by CLI wrapper)
const isDirectRun = process.argv[1]?.includes('run-tc01') ||
                    process.argv[1]?.endsWith('/adidas/run-tc01.ts') ||
                    process.argv[1]?.endsWith('/adidas/run-tc01.js');

if (isDirectRun) {
  main().catch((error) => {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
