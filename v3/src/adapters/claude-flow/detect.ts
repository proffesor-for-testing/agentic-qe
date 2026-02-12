/**
 * Claude Flow Detection Utility
 *
 * Smart detection that avoids triggering `npx` auto-install.
 * Checks cheap/local signals first (MCP config, package.json, local binary),
 * and only shells out if there's local evidence Claude Flow is installed.
 *
 * Used by all Claude Flow adapters and init-time setup.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeFlowDetection {
  /** Whether Claude Flow is available and working */
  available: boolean;
  /** How it was detected */
  method?: 'mcp-config' | 'local-binary' | 'npm-dependency' | 'npx-cached';
  /** Detected version string */
  version?: string;
}

// ============================================================================
// Module-level cache (shared across all callers in the same process)
// ============================================================================

let cachedResult: ClaudeFlowDetection | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Clear the detection cache (useful for testing or after install)
 */
export function clearDetectionCache(): void {
  cachedResult = null;
  cacheTimestamp = 0;
}

// ============================================================================
// Main Detection
// ============================================================================

/**
 * Detect Claude Flow availability without triggering npm auto-install.
 *
 * Detection order (cheapest first):
 * 1. MCP config in .claude/mcp.json or .claude/settings.json
 * 2. package.json dependency
 * 3. Locally installed binary (npx --no-install)
 *
 * Never runs `npx @claude-flow/cli@latest` which would trigger a download.
 */
export function detectClaudeFlow(projectRoot: string): ClaudeFlowDetection {
  // Return cached result if fresh
  if (cachedResult && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedResult;
  }

  const result = doDetection(projectRoot);
  cachedResult = result;
  cacheTimestamp = Date.now();
  return result;
}

function doDetection(projectRoot: string): ClaudeFlowDetection {
  // ── Method 1: Check MCP config files ──────────────────────────────
  const mcpResult = checkMCPConfig(projectRoot);
  if (mcpResult) return mcpResult;

  // ── Method 2: Check package.json dependency ───────────────────────
  const pkgResult = checkPackageJson(projectRoot);
  if (pkgResult) return pkgResult;

  // ── Method 3: Check if binary is already installed locally ────────
  // Uses --no-install to avoid triggering a download
  const binaryResult = checkLocalBinary(projectRoot);
  if (binaryResult) return binaryResult;

  // Not found via any method
  return { available: false };
}

// ============================================================================
// Individual Detection Methods
// ============================================================================

function checkMCPConfig(projectRoot: string): ClaudeFlowDetection | null {
  // Check .claude/mcp.json
  const mcpJsonPath = join(projectRoot, '.claude', 'mcp.json');
  if (existsSync(mcpJsonPath)) {
    try {
      const config = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
      if (config.mcpServers?.['claude-flow']) {
        return { available: true, method: 'mcp-config' };
      }
    } catch {
      // Malformed JSON, skip
    }
  }

  // Check .claude/settings.json
  const settingsPath = join(projectRoot, '.claude', 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const servers = settings.mcpServers || settings.mcp?.servers || {};
      if (servers['claude-flow'] || servers['@anthropic/claude-flow']) {
        return { available: true, method: 'mcp-config' };
      }
    } catch {
      // Malformed JSON, skip
    }
  }

  return null;
}

function checkPackageJson(projectRoot: string): ClaudeFlowDetection | null {
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['@claude-flow/cli'] || deps['claude-flow']) {
      return { available: true, method: 'npm-dependency' };
    }
  } catch {
    // Malformed JSON, skip
  }

  return null;
}

function checkLocalBinary(projectRoot: string): ClaudeFlowDetection | null {
  try {
    // --no-install prevents npx from downloading the package
    const result = execSync('npx --no-install @claude-flow/cli --version', {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'], // suppress stderr noise
    });
    const version = result.trim().match(/\d+\.\d+\.\d+[\w.-]*/)?.[0];
    return { available: true, method: 'npx-cached', version };
  } catch {
    // Not in npx cache — that's fine, don't try to install it
  }

  return null;
}

// ============================================================================
// User-Friendly Message
// ============================================================================

/**
 * Return a user-friendly message when Claude Flow is not found.
 * Suitable for printing during `aqe init`.
 */
export function getClaudeFlowNotFoundMessage(): string {
  return [
    '  Claude Flow not found — running in standalone mode.',
    '',
    '  Claude Flow adds optional features:',
    '    - SONA trajectory tracking (reinforcement learning)',
    '    - 3-tier model routing (haiku / sonnet / opus)',
    '    - Codebase pretrain analysis',
    '',
    '  To install later:',
    '    npm install -g @claude-flow/cli',
    '    claude mcp add claude-flow -- npx -y @claude-flow/cli@latest',
    '    aqe init --auto --with-claude-flow',
  ].join('\n');
}
