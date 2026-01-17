#!/usr/bin/env ts-node

/**
 * Security Fix Verification Script
 *
 * Verifies the CodeQL alert #35 security fix (Math.random → SecureRandom)
 * without running full integration test suite.
 *
 * Usage:
 *   npm run verify:security-fix
 *   OR
 *   ts-node scripts/verify-security-fix.ts
 */

import { SecureRandom } from '../src/utils/SecureRandom';
import * as fs from 'fs';
import * as path from 'path';

interface VerificationResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details?: string;
  error?: string;
}

const results: VerificationResult[] = [];

/**
 * Test 1: Verify SecureRandom utility works
 */
function testSecureRandomUtility(): VerificationResult {
  try {
    // Test randomFloat()
    const float = SecureRandom.randomFloat();
    if (typeof float !== 'number' || float < 0 || float >= 1) {
      return {
        test: 'SecureRandom.randomFloat()',
        status: 'FAIL',
        error: `Invalid float: ${float} (expected 0 <= x < 1)`
      };
    }

    // Test randomInt()
    const int = SecureRandom.randomInt(1, 100);
    if (typeof int !== 'number' || int < 1 || int >= 100) {
      return {
        test: 'SecureRandom.randomInt()',
        status: 'FAIL',
        error: `Invalid int: ${int} (expected 1 <= x < 100)`
      };
    }

    // Test uuid()
    const uuid = SecureRandom.uuid();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      return {
        test: 'SecureRandom.uuid()',
        status: 'FAIL',
        error: `Invalid UUID: ${uuid}`
      };
    }

    // Test generateId()
    const id = SecureRandom.generateId();
    if (typeof id !== 'string' || id.length !== 32) {
      return {
        test: 'SecureRandom.generateId()',
        status: 'FAIL',
        error: `Invalid ID: ${id} (expected 32 hex chars)`
      };
    }

    return {
      test: 'SecureRandom utility',
      status: 'PASS',
      details: 'All SecureRandom methods work correctly'
    };
  } catch (error) {
    return {
      test: 'SecureRandom utility',
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 2: Verify no Math.random() in security scanning tool
 */
function testNoMathRandom(): VerificationResult {
  try {
    const filePath = path.join(
      __dirname,
      '../src/mcp/tools/qe/security/scan-comprehensive.ts'
    );

    if (!fs.existsSync(filePath)) {
      return {
        test: 'Math.random() removal',
        status: 'FAIL',
        error: `File not found: ${filePath}`
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for Math.random() (should not exist)
    const mathRandomMatches = content.match(/Math\.random\(\)/g);
    if (mathRandomMatches && mathRandomMatches.length > 0) {
      return {
        test: 'Math.random() removal',
        status: 'FAIL',
        error: `Found ${mathRandomMatches.length} Math.random() calls (should be 0)`
      };
    }

    // Check for SecureRandom usage (should exist)
    const secureRandomMatches = content.match(/SecureRandom\.randomFloat\(\)/g);
    if (!secureRandomMatches || secureRandomMatches.length === 0) {
      return {
        test: 'Math.random() removal',
        status: 'FAIL',
        error: 'No SecureRandom.randomFloat() calls found (expected 16+)'
      };
    }

    return {
      test: 'Math.random() removal',
      status: 'PASS',
      details: `Found ${secureRandomMatches.length} SecureRandom.randomFloat() calls, 0 Math.random() calls`
    };
  } catch (error) {
    return {
      test: 'Math.random() removal',
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 3: Verify SecureRandom import exists
 */
function testSecureRandomImport(): VerificationResult {
  try {
    const filePath = path.join(
      __dirname,
      '../src/mcp/tools/qe/security/scan-comprehensive.ts'
    );

    const content = fs.readFileSync(filePath, 'utf-8');

    // Check for SecureRandom import
    const importRegex = /import\s+{\s*SecureRandom\s*}\s+from\s+['"].*SecureRandom['"];?/;
    if (!importRegex.test(content)) {
      return {
        test: 'SecureRandom import',
        status: 'FAIL',
        error: 'SecureRandom import not found'
      };
    }

    return {
      test: 'SecureRandom import',
      status: 'PASS',
      details: 'SecureRandom import exists'
    };
  } catch (error) {
    return {
      test: 'SecureRandom import',
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test 4: Verify TypeScript compilation
 */
function testTypeScriptCompilation(): VerificationResult {
  try {
    const { execSync } = require('child_process');

    // Run TypeScript compiler
    execSync('npm run typecheck', { stdio: 'pipe' });

    return {
      test: 'TypeScript compilation',
      status: 'PASS',
      details: 'No compilation errors'
    };
  } catch (error) {
    return {
      test: 'TypeScript compilation',
      status: 'FAIL',
      error: 'TypeScript compilation failed (run: npm run typecheck)'
    };
  }
}

/**
 * Test 5: Verify SecureRandom distribution
 */
function testRandomDistribution(): VerificationResult {
  try {
    // Generate 1000 random numbers
    const samples = 1000;
    const values: number[] = [];

    for (let i = 0; i < samples; i++) {
      values.push(SecureRandom.randomFloat());
    }

    // Check all values are in range [0, 1)
    const outOfRange = values.filter(v => v < 0 || v >= 1);
    if (outOfRange.length > 0) {
      return {
        test: 'Random distribution',
        status: 'FAIL',
        error: `${outOfRange.length} values out of range [0, 1)`
      };
    }

    // Check distribution is roughly uniform (statistical test)
    const mean = values.reduce((sum, v) => sum + v, 0) / samples;
    const expectedMean = 0.5;
    const tolerance = 0.05; // 5% tolerance

    if (Math.abs(mean - expectedMean) > tolerance) {
      return {
        test: 'Random distribution',
        status: 'FAIL',
        error: `Mean ${mean.toFixed(4)} differs from expected ${expectedMean} by > ${tolerance}`
      };
    }

    return {
      test: 'Random distribution',
      status: 'PASS',
      details: `Mean: ${mean.toFixed(4)} (expected ~0.5, samples: ${samples})`
    };
  } catch (error) {
    return {
      test: 'Random distribution',
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main verification function
 */
function verifySecurityFix(): void {
  console.log('🔍 Security Fix Verification (CodeQL Alert #35)\n');
  console.log('='.repeat(60));
  console.log();

  // Run all tests
  results.push(testSecureRandomUtility());
  results.push(testNoMathRandom());
  results.push(testSecureRandomImport());
  results.push(testTypeScriptCompilation());
  results.push(testRandomDistribution());

  // Print results
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;

  results.forEach((result, index) => {
    const icon = result.status === 'PASS' ? '✅' : '❌';
    console.log(`${index + 1}. ${icon} ${result.test}`);

    if (result.status === 'PASS' && result.details) {
      console.log(`   ${result.details}`);
    } else if (result.status === 'FAIL' && result.error) {
      console.log(`   ERROR: ${result.error}`);
    }
    console.log();
  });

  console.log('='.repeat(60));
  console.log();
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log();

  if (failCount === 0) {
    console.log('✅ All security fix verifications PASSED');
    console.log('✅ Safe to proceed with release');
    process.exit(0);
  } else {
    console.log('❌ Some verifications FAILED');
    console.log('⚠️  Review failures before release');
    process.exit(1);
  }
}

// Run verification
verifySecurityFix();
