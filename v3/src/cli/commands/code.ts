/**
 * Agentic QE v3 - Code Command
 *
 * Provides code intelligence analysis.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';

export function createCodeCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const codeCmd = new Command('code')
    .description('Code intelligence analysis')
    .argument('<action>', 'Action (index|search|impact|deps)')
    .argument('[target]', 'Target path or query')
    .option('--depth <depth>', 'Analysis depth', '3')
    .option('--include-tests', 'Include test files')
    .action(async (action: string, target: string, options) => {
      if (!await ensureInitialized()) return;

      try {
        const codeAPI = await context.kernel!.getDomainAPIAsync!<{
          index(request: { paths: string[]; incremental?: boolean; includeTests?: boolean }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          search(request: { query: string; type: string; limit?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          analyzeImpact(request: { changedFiles: string[]; depth?: number; includeTests?: boolean }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          mapDependencies(request: { files: string[]; direction: string; depth?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('code-intelligence');

        if (!codeAPI) {
          console.log(chalk.red('Code intelligence domain not available'));
          return;
        }

        const fs = await import('fs');
        const path = await import('path');

        if (action === 'index') {
          console.log(chalk.blue(`\n Indexing codebase at ${target || '.'}...\n`));

          const targetPath = path.resolve(target || '.');
          let paths: string[] = [];

          if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isDirectory()) {
              const walkDir = (dir: string, depth: number = 0): string[] => {
                if (depth > 4) return [];
                const result: string[] = [];
                const items = fs.readdirSync(dir);
                for (const item of items) {
                  if (item === 'node_modules' || item === 'dist') continue;
                  const fullPath = path.join(dir, item);
                  const stat = fs.statSync(fullPath);
                  if (stat.isDirectory()) {
                    result.push(...walkDir(fullPath, depth + 1));
                  } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
                    result.push(fullPath);
                  }
                }
                return result;
              };
              paths = walkDir(targetPath);
            } else {
              paths = [targetPath];
            }
          }

          console.log(chalk.gray(`  Found ${paths.length} files to index...\n`));

          const result = await codeAPI.index({
            paths,
            incremental: false,
            includeTests: options.includeTests || false,
          });

          if (result.success && result.value) {
            const idx = result.value as { filesIndexed: number; nodesCreated: number; edgesCreated: number; duration: number; errors: Array<{ file: string; error: string }> };
            console.log(chalk.green(`Indexing complete\n`));
            console.log(chalk.cyan('  Results:'));
            console.log(`    Files indexed: ${chalk.white(idx.filesIndexed)}`);
            console.log(`    Nodes created: ${chalk.white(idx.nodesCreated)}`);
            console.log(`    Edges created: ${chalk.white(idx.edgesCreated)}`);
            console.log(`    Duration: ${chalk.yellow(idx.duration + 'ms')}`);
            if (idx.errors.length > 0) {
              console.log(chalk.red(`\n  Errors (${idx.errors.length}):`));
              for (const err of idx.errors.slice(0, 5)) {
                console.log(chalk.red(`    ${err.file}: ${err.error}`));
              }
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'search') {
          if (!target) {
            console.log(chalk.red('Search query required'));
            return;
          }

          console.log(chalk.blue(`\n Searching for: "${target}"...\n`));

          const result = await codeAPI.search({
            query: target,
            type: 'semantic',
            limit: 10,
          });

          if (result.success && result.value) {
            const search = result.value as { results: Array<{ file: string; line?: number; snippet: string; score: number }>; total: number; searchTime: number };
            console.log(chalk.green(`Found ${search.total} results (${search.searchTime}ms)\n`));

            for (const r of search.results) {
              const filePath = r.file.replace(process.cwd() + '/', '');
              console.log(`  ${chalk.cyan(filePath)}${r.line ? ':' + r.line : ''}`);
              console.log(chalk.gray(`    ${r.snippet.slice(0, 100)}...`));
              console.log(chalk.gray(`    Score: ${(r.score * 100).toFixed(0)}%\n`));
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'impact') {
          console.log(chalk.blue(`\n Analyzing impact for ${target || 'recent changes'}...\n`));

          const targetPath = path.resolve(target || '.');
          let changedFiles: string[] = [];

          if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isFile()) {
              changedFiles = [targetPath];
            } else {
              const walkDir = (dir: string, depth: number = 0): string[] => {
                if (depth > 2) return [];
                const result: string[] = [];
                const items = fs.readdirSync(dir);
                for (const item of items) {
                  if (item === 'node_modules' || item === 'dist') continue;
                  const fullPath = path.join(dir, item);
                  const stat = fs.statSync(fullPath);
                  if (stat.isDirectory()) {
                    result.push(...walkDir(fullPath, depth + 1));
                  } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
                    result.push(fullPath);
                  }
                }
                return result;
              };
              changedFiles = walkDir(targetPath).slice(0, 10);
            }
          }

          const result = await codeAPI.analyzeImpact({
            changedFiles,
            depth: parseInt(options.depth),
            includeTests: options.includeTests || false,
          });

          if (result.success && result.value) {
            const impact = result.value as {
              directImpact: Array<{ file: string; reason: string; distance: number; riskScore: number }>;
              transitiveImpact: Array<{ file: string; reason: string; distance: number; riskScore: number }>;
              impactedTests: string[];
              riskLevel: string;
              recommendations: string[];
            };

            const riskColor = impact.riskLevel === 'high' ? chalk.red : impact.riskLevel === 'medium' ? chalk.yellow : chalk.green;
            console.log(`  Risk Level: ${riskColor(impact.riskLevel)}\n`);

            console.log(chalk.cyan(`  Direct Impact (${impact.directImpact.length} files):`));
            for (const file of impact.directImpact.slice(0, 5)) {
              const filePath = file.file.replace(process.cwd() + '/', '');
              console.log(`    ${chalk.white(filePath)}`);
              console.log(chalk.gray(`      Reason: ${file.reason}, Risk: ${(file.riskScore * 100).toFixed(0)}%`));
            }

            if (impact.transitiveImpact.length > 0) {
              console.log(chalk.cyan(`\n  Transitive Impact (${impact.transitiveImpact.length} files):`));
              for (const file of impact.transitiveImpact.slice(0, 5)) {
                const filePath = file.file.replace(process.cwd() + '/', '');
                console.log(`    ${chalk.white(filePath)} (distance: ${file.distance})`);
              }
            }

            if (impact.impactedTests.length > 0) {
              console.log(chalk.cyan(`\n  Impacted Tests (${impact.impactedTests.length}):`));
              for (const test of impact.impactedTests.slice(0, 5)) {
                console.log(`    ${chalk.gray(test)}`);
              }
            }

            if (impact.recommendations.length > 0) {
              console.log(chalk.cyan('\n  Recommendations:'));
              for (const rec of impact.recommendations) {
                console.log(chalk.gray(`    - ${rec}`));
              }
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'deps') {
          console.log(chalk.blue(`\n Mapping dependencies for ${target || '.'}...\n`));

          const targetPath = path.resolve(target || '.');
          let files: string[] = [];

          if (fs.existsSync(targetPath)) {
            if (fs.statSync(targetPath).isFile()) {
              files = [targetPath];
            } else {
              const walkDir = (dir: string, depth: number = 0): string[] => {
                if (depth > 2) return [];
                const result: string[] = [];
                const items = fs.readdirSync(dir);
                for (const item of items) {
                  if (item === 'node_modules' || item === 'dist') continue;
                  const fullPath = path.join(dir, item);
                  const stat = fs.statSync(fullPath);
                  if (stat.isDirectory()) {
                    result.push(...walkDir(fullPath, depth + 1));
                  } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
                    result.push(fullPath);
                  }
                }
                return result;
              };
              files = walkDir(targetPath).slice(0, 50);
            }
          }

          const result = await codeAPI.mapDependencies({
            files,
            direction: 'both',
            depth: parseInt(options.depth),
          });

          if (result.success && result.value) {
            const deps = result.value as {
              nodes: Array<{ id: string; path: string; type: string; inDegree: number; outDegree: number }>;
              edges: Array<{ source: string; target: string; type: string }>;
              cycles: string[][];
              metrics: { totalNodes: number; totalEdges: number; avgDegree: number; maxDepth: number; cyclomaticComplexity: number };
            };

            console.log(chalk.cyan('  Dependency Metrics:'));
            console.log(`    Nodes: ${chalk.white(deps.metrics.totalNodes)}`);
            console.log(`    Edges: ${chalk.white(deps.metrics.totalEdges)}`);
            console.log(`    Avg Degree: ${chalk.yellow(deps.metrics.avgDegree.toFixed(2))}`);
            console.log(`    Max Depth: ${chalk.yellow(deps.metrics.maxDepth)}`);
            console.log(`    Cyclomatic Complexity: ${chalk.yellow(deps.metrics.cyclomaticComplexity)}`);

            if (deps.cycles.length > 0) {
              console.log(chalk.red(`\n  Circular Dependencies (${deps.cycles.length}):`));
              for (const cycle of deps.cycles.slice(0, 3)) {
                console.log(chalk.red(`    ${cycle.join(' -> ')}`));
              }
            }

            console.log(chalk.cyan(`\n  Top Dependencies (by connections):`));
            const sortedNodes = [...deps.nodes].sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));
            for (const node of sortedNodes.slice(0, 8)) {
              const filePath = node.path.replace(process.cwd() + '/', '');
              console.log(`    ${chalk.white(filePath)}`);
              console.log(chalk.gray(`      In: ${node.inDegree}, Out: ${node.outDegree}, Type: ${node.type}`));
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else {
          console.log(chalk.red(`\nUnknown action: ${action}`));
          console.log(chalk.gray('  Available: index, search, impact, deps\n'));
          await cleanupAndExit(1);
        }

        console.log('');
        await cleanupAndExit(0);

      } catch (error) {
        console.error(chalk.red('\nFailed:'), error);
        await cleanupAndExit(1);
      }
    });

  return codeCmd;
}
