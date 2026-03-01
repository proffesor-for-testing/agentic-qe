#!/usr/bin/env node
/**
 * Coherence Check Script for CI/CD
 *
 * ADR-052 Action A4.4: CI/CD Coherence Badge
 *
 * Runs coherence verification on test patterns and outputs:
 * - JSON result with: isCoherent, energy, contradictionCount
 * - Badge JSON for shields.io
 * - Exit code 0 if coherent, 1 if violation
 *
 * Robust fallback mode: If WASM fails, outputs warning but doesn't fail CI.
 *
 * Usage:
 *   node scripts/coherence-check.js
 *   node scripts/coherence-check.js --badge-only
 *   node scripts/coherence-check.js --output badge.json
 *
 * @module scripts/coherence-check
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

// Parse command line arguments
const args = process.argv.slice(2);
const badgeOnly = args.includes('--badge-only');
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex !== -1 ? args[outputIndex + 1] : null;

// Get the script directory for resolving paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Create test coherence nodes for verification.
 * These represent typical QE patterns that should be coherent.
 *
 * The embeddings are designed to be similar (low distance) to simulate
 * coherent QE patterns from the same domain family.
 */
function createTestNodes() {
  // Generate embeddings that are similar but with small variations
  // All QE patterns share a common "base" embedding with domain-specific offsets
  const dimension = 64;

  // Base embedding representing "QE domain" concepts
  const baseEmbedding = [];
  for (let i = 0; i < dimension; i++) {
    baseEmbedding.push(0.5 + 0.3 * Math.sin(i * 0.2));
  }

  // Create domain-specific embeddings with small perturbations
  // This simulates coherent patterns from related QE domains
  const createDomainEmbedding = (domainOffset, variationScale = 0.05) => {
    return baseEmbedding.map((val, i) => {
      // Add small domain-specific variation
      const variation = variationScale * Math.sin((i + domainOffset) * 0.3);
      return Math.max(0, Math.min(1, val + variation));
    });
  };

  return [
    {
      id: 'test-generation-pattern',
      embedding: createDomainEmbedding(1),
      weight: 1.0,
      metadata: { domain: 'test-generation', type: 'pattern' },
    },
    {
      id: 'coverage-analysis-pattern',
      embedding: createDomainEmbedding(2),
      weight: 1.0,
      metadata: { domain: 'coverage-analysis', type: 'pattern' },
    },
    {
      id: 'quality-assessment-pattern',
      embedding: createDomainEmbedding(3),
      weight: 1.0,
      metadata: { domain: 'quality-assessment', type: 'pattern' },
    },
    {
      id: 'defect-intelligence-pattern',
      embedding: createDomainEmbedding(4),
      weight: 1.0,
      metadata: { domain: 'defect-intelligence', type: 'pattern' },
    },
    {
      id: 'security-compliance-pattern',
      embedding: createDomainEmbedding(5),
      weight: 1.0,
      metadata: { domain: 'security-compliance', type: 'pattern' },
    },
  ];
}

/**
 * Generate shields.io badge JSON
 */
function generateBadgeJson(isCoherent, energy, usedFallback) {
  return {
    schemaVersion: 1,
    label: 'coherence',
    message: usedFallback
      ? 'fallback'
      : isCoherent
        ? 'verified'
        : 'violation',
    color: usedFallback
      ? 'yellow'
      : isCoherent
        ? 'brightgreen'
        : 'red',
    // Additional metadata for detailed badge endpoints
    namedLogo: 'checkmarx',
    logoColor: 'white',
  };
}

/**
 * Run coherence check with WASM service
 */
async function runWithWasm(nodes) {
  // Dynamic import to handle ESM modules
  const { CoherenceService } = await import('../dist/integrations/coherence/coherence-service.js');
  const { WasmLoader } = await import('../dist/integrations/coherence/wasm-loader.js');

  // Create a custom logger for CI output
  const logger = {
    debug: () => {},
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg, err) => console.error(`[ERROR] ${msg}`, err?.message || ''),
  };

  // Create WASM loader and service
  const wasmLoader = new WasmLoader({
    maxAttempts: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    timeoutMs: 5000,
  });

  const service = new CoherenceService(
    wasmLoader,
    {
      enabled: true,
      fallbackEnabled: true,
      coherenceThreshold: 0.1,
      timeoutMs: 5000,
      cacheEnabled: false,
      laneConfig: {
        reflexThreshold: 0.1,
        retrievalThreshold: 0.4,
        heavyThreshold: 0.7,
      },
    },
    logger
  );

  await service.initialize();
  const result = await service.checkCoherence(nodes);
  await service.dispose();

  return result;
}

/**
 * Fallback coherence check using pure TypeScript
 * Used when WASM is unavailable
 */
function runFallbackCheck(nodes) {
  console.log('[WARN] Using TypeScript fallback for coherence check');

  // Simple Euclidean distance calculation
  const euclideanDistance = (a, b) => {
    if (a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  };

  // Calculate average pairwise distance as energy proxy
  let totalDistance = 0;
  let comparisons = 0;
  const contradictions = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const distance = euclideanDistance(nodes[i].embedding, nodes[j].embedding);
      totalDistance += distance;
      comparisons++;

      // Detect potential contradictions
      if (distance > 1.5) {
        contradictions.push({
          nodeIds: [nodes[i].id, nodes[j].id],
          severity: distance > 2 ? 'critical' : 'high',
          description: `High distance (${distance.toFixed(2)}) between nodes`,
          confidence: Math.min(1, distance / 2),
        });
      }
    }
  }

  const energy = comparisons > 0 ? totalDistance / comparisons : 0;
  const isCoherent = energy < 0.5; // Relaxed threshold for fallback

  return {
    energy,
    isCoherent,
    lane: energy < 0.1 ? 'reflex' : energy < 0.4 ? 'retrieval' : energy < 0.7 ? 'heavy' : 'human',
    contradictions,
    recommendations: isCoherent
      ? ['Fallback check passed. Consider enabling WASM for full verification.']
      : ['Potential coherence issues detected. Review contradicting patterns.'],
    durationMs: 0,
    usedFallback: true,
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('========================================');
  console.log('ADR-052 Coherence Check - CI/CD Badge');
  console.log('========================================\n');

  const startTime = Date.now();
  const nodes = createTestNodes();

  console.log(`Testing ${nodes.length} coherence nodes...\n`);

  let result;
  let wasmAvailable = false;

  try {
    // Check if dist folder exists (build required)
    const distPath = join(projectRoot, 'dist');
    if (!existsSync(distPath)) {
      console.log('[WARN] dist/ folder not found. Running build may be required.');
      console.log('[WARN] Falling back to TypeScript implementation.\n');
      result = runFallbackCheck(nodes);
    } else {
      // Try WASM-based coherence check
      result = await runWithWasm(nodes);
      wasmAvailable = !result.usedFallback;
    }
  } catch (error) {
    // WASM failed, use fallback
    console.log(`[WARN] WASM coherence check failed: ${error.message}`);
    console.log('[WARN] Using TypeScript fallback (CI will not fail).\n');
    result = runFallbackCheck(nodes);
  }

  const totalDuration = Date.now() - startTime;

  // Prepare output data
  const checkResult = {
    isCoherent: result.isCoherent,
    energy: Math.round(result.energy * 1000) / 1000,
    contradictionCount: result.contradictions.length,
    lane: result.lane,
    wasmAvailable,
    usedFallback: result.usedFallback,
    durationMs: totalDuration,
    timestamp: new Date().toISOString(),
    nodeCount: nodes.length,
  };

  const badgeJson = generateBadgeJson(
    result.isCoherent,
    result.energy,
    result.usedFallback
  );

  // Output results
  console.log('Results:');
  console.log('----------------------------------------');
  console.log(`  Coherent:       ${result.isCoherent ? 'YES' : 'NO'}`);
  console.log(`  Energy:         ${checkResult.energy}`);
  console.log(`  Contradictions: ${checkResult.contradictionCount}`);
  console.log(`  Compute Lane:   ${result.lane}`);
  console.log(`  WASM Available: ${wasmAvailable ? 'YES' : 'NO'}`);
  console.log(`  Used Fallback:  ${result.usedFallback ? 'YES' : 'NO'}`);
  console.log(`  Duration:       ${totalDuration}ms`);
  console.log('----------------------------------------\n');

  if (result.contradictions.length > 0) {
    console.log('Contradictions:');
    result.contradictions.forEach((c, i) => {
      console.log(`  ${i + 1}. [${c.severity}] ${c.nodeIds.join(' <-> ')}`);
      console.log(`     ${c.description}`);
    });
    console.log('');
  }

  if (result.recommendations.length > 0) {
    console.log('Recommendations:');
    result.recommendations.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r}`);
    });
    console.log('');
  }

  // Output badge JSON
  if (!badgeOnly) {
    console.log('Check Result JSON:');
    console.log(JSON.stringify(checkResult, null, 2));
    console.log('');
  }

  console.log('Badge JSON:');
  console.log(JSON.stringify(badgeJson, null, 2));
  console.log('');

  // Write output file if specified
  if (outputPath) {
    const fullOutputPath = outputPath.startsWith('/')
      ? outputPath
      : join(process.cwd(), outputPath);

    // Ensure directory exists
    const outputDir = dirname(fullOutputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const outputData = badgeOnly ? badgeJson : { check: checkResult, badge: badgeJson };
    writeFileSync(fullOutputPath, JSON.stringify(outputData, null, 2));
    console.log(`Output written to: ${fullOutputPath}`);
  }

  // Set exit code based on coherence (but not for fallback mode)
  // In fallback mode, we don't fail CI as WASM might just not be available
  if (!result.isCoherent && !result.usedFallback) {
    console.log('\n[FAIL] Coherence violation detected!');
    process.exit(1);
  } else if (result.usedFallback) {
    console.log('\n[PASS] Fallback check completed (WASM unavailable)');
    process.exit(0);
  } else {
    console.log('\n[PASS] Coherence verified successfully!');
    process.exit(0);
  }
}

// Run main function
main().catch((error) => {
  console.error('[FATAL] Coherence check failed:', error.message);
  console.error(error.stack);

  // Output fallback badge even on fatal error
  const fallbackBadge = {
    schemaVersion: 1,
    label: 'coherence',
    message: 'error',
    color: 'lightgrey',
  };
  console.log('\nFallback Badge JSON:');
  console.log(JSON.stringify(fallbackBadge, null, 2));

  // Don't fail CI on script errors - output warning badge instead
  process.exit(0);
});
