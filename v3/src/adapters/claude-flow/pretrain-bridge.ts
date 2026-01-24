/**
 * Pretrain Bridge
 * Connects AQE to Claude Flow's codebase analysis pipeline
 *
 * When Claude Flow is available:
 * - Uses 4-step pretrain pipeline for codebase understanding
 * - Generates optimized agent configurations
 * - Transfers learned patterns
 *
 * When not available:
 * - Uses AQE's built-in project analyzer
 * - Generates basic agent configurations
 */

import type { PretrainResult } from './types.js';

/**
 * Pretrain Bridge for codebase analysis
 */
export class PretrainBridge {
  private claudeFlowAvailable = false;
  private analysisCache: Map<string, PretrainResult> = new Map();

  constructor(private options: { projectRoot: string }) {}

  /**
   * Initialize the bridge
   */
  async initialize(): Promise<void> {
    this.claudeFlowAvailable = await this.checkClaudeFlow();
  }

  /**
   * Check if Claude Flow is available
   */
  private async checkClaudeFlow(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync('npx @claude-flow/cli@latest hooks pretrain --help 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
        cwd: this.options.projectRoot,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run pretrain analysis
   */
  async analyze(
    path?: string,
    depth: 'shallow' | 'medium' | 'deep' = 'medium'
  ): Promise<PretrainResult> {
    const targetPath = path || this.options.projectRoot;
    const cacheKey = `${targetPath}:${depth}`;

    // Check cache
    const cached = this.analysisCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.claudeFlowAvailable) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `npx @claude-flow/cli@latest hooks pretrain --path ${this.escapeArg(targetPath)} --depth ${depth} 2>/dev/null`,
          { encoding: 'utf-8', timeout: 120000, cwd: this.options.projectRoot }
        );

        // Try to parse JSON result
        try {
          const parsed = JSON.parse(result);
          const pretrainResult: PretrainResult = {
            success: true,
            repositoryPath: targetPath,
            depth,
            analysis: parsed.analysis || parsed,
            agentConfigs: parsed.agentConfigs,
          };

          this.analysisCache.set(cacheKey, pretrainResult);
          return pretrainResult;
        } catch {
          // Raw output - still successful
          return {
            success: true,
            repositoryPath: targetPath,
            depth,
          };
        }
      } catch (error) {
        // Fall through to local analysis
      }
    }

    // Local analysis using AQE project analyzer
    return this.localAnalyze(targetPath, depth);
  }

  /**
   * Generate agent configurations from analysis
   */
  async generateAgentConfigs(
    format: 'yaml' | 'json' = 'yaml'
  ): Promise<Record<string, unknown>[]> {
    if (this.claudeFlowAvailable) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `npx @claude-flow/cli@latest hooks build-agents --format ${format} 2>/dev/null`,
          { encoding: 'utf-8', timeout: 60000, cwd: this.options.projectRoot }
        );

        try {
          return JSON.parse(result);
        } catch {
          return [];
        }
      } catch {
        // Fall through to local generation
      }
    }

    // Generate basic QE agent configs
    return this.generateLocalAgentConfigs();
  }

  /**
   * Transfer patterns from another project
   */
  async transferPatterns(
    sourcePath: string,
    minConfidence: number = 0.7
  ): Promise<{ transferred: number; skipped: number }> {
    if (this.claudeFlowAvailable) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `npx @claude-flow/cli@latest hooks transfer --source-path ${this.escapeArg(sourcePath)} --min-confidence ${minConfidence} 2>/dev/null`,
          { encoding: 'utf-8', timeout: 60000, cwd: this.options.projectRoot }
        );

        const transferredMatch = result.match(/transferred[:\s]+(\d+)/i);
        const skippedMatch = result.match(/skipped[:\s]+(\d+)/i);

        return {
          transferred: transferredMatch ? parseInt(transferredMatch[1]) : 0,
          skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
        };
      } catch {
        // Fall through
      }
    }

    return { transferred: 0, skipped: 0 };
  }

  /**
   * Check if Claude Flow is available
   */
  isClaudeFlowAvailable(): boolean {
    return this.claudeFlowAvailable;
  }

  /**
   * Escape shell argument using $'...' syntax for complete safety
   * This ANSI-C quoting handles ALL special characters including backslashes
   * CodeQL: js/incomplete-sanitization - Fixed by escaping backslashes AND quotes
   */
  private escapeArg(arg: string): string {
    // Escape backslashes first, then single quotes, using ANSI-C quoting
    // $'...' syntax interprets escape sequences like \\ and \'
    const escaped = arg
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/'/g, "\\'");   // Then escape single quotes
    return "$'" + escaped + "'";
  }

  /**
   * Local analysis using file system scanning
   */
  private async localAnalyze(
    targetPath: string,
    depth: 'shallow' | 'medium' | 'deep'
  ): Promise<PretrainResult> {
    try {
      const glob = await import('fast-glob');
      const { existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');

      // Scan patterns based on depth
      const patterns = depth === 'shallow'
        ? ['*.ts', '*.js', '*.json']
        : depth === 'medium'
        ? ['**/*.ts', '**/*.js', '**/*.json', '**/*.py']
        : ['**/*'];

      const ignore = ['node_modules/**', 'dist/**', 'coverage/**', '.git/**'];

      const files = await glob.default(patterns, {
        cwd: targetPath,
        ignore,
        onlyFiles: true,
      });

      // Detect languages
      const languages = new Set<string>();
      const frameworks = new Set<string>();

      for (const file of files.slice(0, 100)) {
        if (file.endsWith('.ts') || file.endsWith('.tsx')) languages.add('typescript');
        if (file.endsWith('.js') || file.endsWith('.jsx')) languages.add('javascript');
        if (file.endsWith('.py')) languages.add('python');
        if (file.endsWith('.go')) languages.add('go');
        if (file.endsWith('.rs')) languages.add('rust');
      }

      // Check package.json for frameworks
      const packageJsonPath = join(targetPath, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps.react) frameworks.add('react');
          if (deps.vue) frameworks.add('vue');
          if (deps.angular) frameworks.add('angular');
          if (deps.vitest) frameworks.add('vitest');
          if (deps.jest) frameworks.add('jest');
          if (deps.playwright) frameworks.add('playwright');
          if (deps.express) frameworks.add('express');
          if (deps.fastify) frameworks.add('fastify');
        } catch {
          // Ignore parse errors
        }
      }

      const result: PretrainResult = {
        success: true,
        repositoryPath: targetPath,
        depth,
        analysis: {
          languages: Array.from(languages),
          frameworks: Array.from(frameworks),
          patterns: [],
          complexity: files.length > 500 ? 3 : files.length > 100 ? 2 : 1,
        },
      };

      this.analysisCache.set(`${targetPath}:${depth}`, result);
      return result;
    } catch (error) {
      return {
        success: false,
        repositoryPath: targetPath,
        depth,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate basic QE agent configurations
   */
  private generateLocalAgentConfigs(): Record<string, unknown>[] {
    return [
      {
        name: 'qe-test-architect',
        type: 'worker',
        capabilities: ['test-generation', 'test-design'],
        model: 'sonnet',
      },
      {
        name: 'qe-coverage-specialist',
        type: 'worker',
        capabilities: ['coverage-analysis', 'gap-detection'],
        model: 'haiku',
      },
      {
        name: 'qe-quality-gate',
        type: 'worker',
        capabilities: ['quality-assessment', 'risk-scoring'],
        model: 'sonnet',
      },
      {
        name: 'qe-security-scanner',
        type: 'worker',
        capabilities: ['security-scanning', 'vulnerability-detection'],
        model: 'opus',
      },
    ];
  }
}

/**
 * Create pretrain bridge
 */
export function createPretrainBridge(options: { projectRoot: string }): PretrainBridge {
  return new PretrainBridge(options);
}
