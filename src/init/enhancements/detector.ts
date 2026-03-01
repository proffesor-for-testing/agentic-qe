/**
 * Enhancement Detector
 * Detects available optional integrations
 */

import type { EnhancementStatus } from '../phases/phase-interface.js';
import { detectClaudeFlow as smartDetectClaudeFlow } from '../../adapters/claude-flow/detect.js';

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
 * Detect Claude Flow MCP availability (no npm auto-install)
 */
async function detectClaudeFlow(): Promise<DetectionResult> {
  const detection = smartDetectClaudeFlow(process.cwd());
  return {
    available: detection.available,
    version: detection.version,
  };
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
      const result = execSync('docker ps --filter "name=ruvector" --format "{{.Names}}"', {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (result.trim().includes('ruvector')) {
        return { available: true };
      }
    } catch (error) {
      // Non-critical: Docker check failed
      console.debug('[EnhancementDetector] Docker RuVector check failed:', error instanceof Error ? error.message : error);
    }

    return { available: false };
  }
}
