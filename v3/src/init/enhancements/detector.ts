/**
 * Enhancement Detector
 * Detects available optional integrations
 */

import type { EnhancementStatus } from '../phases/phase-interface.js';

/**
 * Detect available enhancements
 */
export async function detectEnhancements(): Promise<EnhancementStatus> {
  const [claudeFlow, ruvector] = await Promise.all([
    detectClaudeFlow(),
    detectRuVector(),
  ]);

  return {
    claudeFlow: claudeFlow.available,
    claudeFlowVersion: claudeFlow.version,
    ruvector: ruvector.available,
    ruvectorVersion: ruvector.version,
  };
}

/**
 * Detection result
 */
interface DetectionResult {
  available: boolean;
  version?: string;
}

/**
 * Detect Claude Flow MCP availability
 */
async function detectClaudeFlow(): Promise<DetectionResult> {
  try {
    // Check if claude-flow CLI is available
    const { execSync } = await import('child_process');
    const result = execSync('npx @claude-flow/cli@latest --version 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const version = result.trim();
    return {
      available: true,
      version,
    };
  } catch {
    // Try checking if MCP server is configured
    try {
      const { existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');

      const mcpPath = join(process.cwd(), '.claude', 'mcp.json');
      if (existsSync(mcpPath)) {
        const content = readFileSync(mcpPath, 'utf-8');
        const config = JSON.parse(content);

        if (config.mcpServers?.['claude-flow']) {
          return { available: true };
        }
      }
    } catch {
      // Ignore
    }

    return { available: false };
  }
}

/**
 * Detect RuVector availability
 */
async function detectRuVector(): Promise<DetectionResult> {
  try {
    // Check if ruvector packages are installed
    // Use dynamic require to avoid TypeScript error
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    require.resolve('@ruvector/core');
    return { available: true };
  } catch {
    // Check if Docker container is running
    try {
      const { execSync } = await import('child_process');
      const result = execSync('docker ps --filter "name=ruvector" --format "{{.Names}}" 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (result.trim().includes('ruvector')) {
        return { available: true };
      }
    } catch {
      // Ignore
    }

    return { available: false };
  }
}
