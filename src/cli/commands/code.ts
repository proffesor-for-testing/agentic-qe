/**
 * Agentic QE v3 - Code Command
 *
 * Provides code intelligence analysis.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { walkSourceFiles, SOURCE_EXTENSIONS } from '../utils/file-discovery.js';
import { type OutputFormat, writeOutput, toJSON } from '../utils/ci-output.js';

export function createCodeCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const codeCmd = new Command('code')
    .description('Code intelligence analysis')
    .argument('<action>', 'Action (index|search|impact|deps|complexity)')
    .argument('[target]', 'Target path or query')
    .option('--depth <depth>', 'Analysis depth', '3')
    .option('--include-tests', 'Include test files')
    .option('--incremental', 'Incremental indexing (index action only)')
    .option('--git-since <ref>', 'Index changes since git ref (index action only)')
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .addHelpText('after', `
Examples:
  aqe code index src/                  Index source files into knowledge graph
  aqe code index src/ --incremental    Incremental index (only changed files)
  aqe code index . --git-since HEAD~5  Index files changed in last 5 commits
  aqe code search "authentication"     Semantic code search
  aqe code impact src/auth/            Analyze change impact
  aqe code deps src/                   Map dependencies
  aqe code complexity src/             Analyze code complexity metrics
`)
    .action(async (action: string, target: string, options) => {
      if (!await ensureInitialized()) return;

      try {
        const codeAPI = await context.kernel!.getDomainAPIAsync!<{
          index(request: { paths: string[]; incremental?: boolean; includeTests?: boolean; languages?: string[] }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          search(request: { query: string; type: string; limit?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          analyzeImpact(request: { changedFiles: string[]; depth?: number; includeTests?: boolean }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          mapDependencies(request: { files: string[]; direction: string; depth?: number }): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          getSemanticAnalyzer(): { analyze(code: string): Promise<{ success: boolean; value?: { concepts: string[]; patterns: string[]; complexity: { cyclomatic: number; cognitive: number; halstead: { vocabulary: number; length: number; difficulty: number; effort: number; time: number; bugs: number } }; dependencies: string[]; suggestions: string[] }; error?: Error }> } | null;
        }>('code-intelligence');

        if (!codeAPI) {
          console.log(chalk.red('Code intelligence domain not available'));
          return;
        }

        const path = await import('path');
        const format = (options.format || 'text') as OutputFormat;
        const parsedDepth = parseInt(options.depth);
        if (isNaN(parsedDepth) || parsedDepth < 1) {
          console.log(chalk.red(`Invalid --depth value: "${options.depth}" (must be a positive integer)`));
          return;
        }

        if (action === 'index') {
          const incremental = options.incremental || false;
          const gitSince = options.gitSince as string | undefined;
          const label = incremental ? 'Incrementally indexing' : 'Indexing';
          console.log(chalk.blue(`\n ${label} codebase at ${target || '.'}${gitSince ? ` (since ${gitSince})` : ''}...\n`));

          const targetPath = path.resolve(target || '.');
          let paths: string[];

          if (gitSince) {
            // Use git diff to find changed files since the ref
            // SEC: Use execFileSync with array args to prevent shell injection (CWE-78)
            const { execFileSync } = await import('child_process');
            try {
              const diffOutput = execFileSync(
                'git',
                ['diff', '--name-only', '--diff-filter=ACMR', gitSince, '--', targetPath],
                { encoding: 'utf-8', cwd: process.cwd() }
              ).trim();
              paths = diffOutput
                ? diffOutput.split('\n')
                    .filter(f => SOURCE_EXTENSIONS.has(path.extname(f)))
                    .map(f => path.resolve(f))
                : [];
            } catch {
              console.log(chalk.yellow(`  Warning: git diff failed for ref "${gitSince}", falling back to full scan`));
              paths = walkSourceFiles(targetPath, {
                includeTests: options.includeTests || false,
              });
            }
          } else {
            // Fix #280: Use shared file discovery supporting all languages
            paths = walkSourceFiles(targetPath, {
              includeTests: options.includeTests || false,
            });
          }

          console.log(chalk.gray(`  Found ${paths.length} files to index...\n`));

          const result = await codeAPI.index({
            paths,
            incremental,
            includeTests: options.includeTests || false,
          });

          if (result.success && result.value) {
            const idx = result.value as { filesIndexed: number; nodesCreated: number; edgesCreated: number; duration: number; errors: Array<{ file: string; error: string }> };
            if (format === 'json') {
              writeOutput(toJSON(idx), options.output);
            } else {
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
            if (format === 'json') {
              writeOutput(toJSON(search), options.output);
            } else {
              console.log(chalk.green(`Found ${search.total} results (${search.searchTime}ms)\n`));

              for (const r of search.results) {
                const filePath = r.file.replace(process.cwd() + '/', '');
                console.log(`  ${chalk.cyan(filePath)}${r.line ? ':' + r.line : ''}`);
                console.log(chalk.gray(`    ${r.snippet.slice(0, 100)}...`));
                console.log(chalk.gray(`    Score: ${(r.score * 100).toFixed(0)}%\n`));
              }
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'impact') {
          console.log(chalk.blue(`\n Analyzing impact for ${target || 'recent changes'}...\n`));

          const targetPath = path.resolve(target || '.');
          // Fix #280: Use shared file discovery supporting all languages
          const changedFiles = walkSourceFiles(targetPath, { maxDepth: 2 }).slice(0, 10);

          const result = await codeAPI.analyzeImpact({
            changedFiles,
            depth: parsedDepth,
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

            if (format === 'json') {
              writeOutput(toJSON(impact), options.output);
            } else {
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
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'deps') {
          console.log(chalk.blue(`\n Mapping dependencies for ${target || '.'}...\n`));

          const targetPath = path.resolve(target || '.');
          // Fix #280: Use shared file discovery supporting all languages
          const files = walkSourceFiles(targetPath, { maxDepth: 2 }).slice(0, 50);

          const result = await codeAPI.mapDependencies({
            files,
            direction: 'both',
            depth: parsedDepth,
          });

          if (result.success && result.value) {
            const deps = result.value as {
              nodes: Array<{ id: string; path: string; type: string; inDegree: number; outDegree: number }>;
              edges: Array<{ source: string; target: string; type: string }>;
              cycles: string[][];
              metrics: { totalNodes: number; totalEdges: number; avgDegree: number; maxDepth: number; cyclomaticComplexity: number };
            };

            if (format === 'json') {
              writeOutput(toJSON(deps), options.output);
            } else {
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
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error?.message || 'Unknown error'}`));
          }

        } else if (action === 'complexity') {
          console.log(chalk.blue(`\n Analyzing complexity for ${target || '.'}...\n`));

          const targetPath = path.resolve(target || '.');
          const files = walkSourceFiles(targetPath, {
            includeTests: options.includeTests || false,
            maxDepth: 3,
          }).slice(0, 50);

          if (files.length === 0) {
            console.log(chalk.yellow('  No source files found'));
            return await cleanupAndExit(0);
          }

          const fs = await import('fs');
          const analyzer = typeof codeAPI.getSemanticAnalyzer === 'function'
            ? codeAPI.getSemanticAnalyzer()
            : null;

          if (!analyzer) {
            console.log(chalk.red('Semantic analyzer not available — ensure fleet is initialized'));
            return await cleanupAndExit(1);
          }

          interface FileComplexity {
            file: string;
            cyclomatic: number;
            cognitive: number;
            halstead: { vocabulary: number; length: number; difficulty: number; effort: number; time: number; bugs: number };
            suggestions: string[];
          }

          // Analyze files in batches of 8 for concurrency
          const BATCH_SIZE = 8;
          const results: FileComplexity[] = [];
          for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
              batch.map(async (file) => {
                try {
                  const content = fs.readFileSync(file, 'utf-8');
                  const analysisResult = await analyzer.analyze(content);
                  if (analysisResult.success && analysisResult.value) {
                    const a = analysisResult.value;
                    return {
                      file,
                      cyclomatic: a.complexity.cyclomatic,
                      cognitive: a.complexity.cognitive,
                      halstead: a.complexity.halstead,
                      suggestions: a.suggestions,
                    } as FileComplexity;
                  }
                } catch {
                  // Skip files that can't be read/analyzed
                }
                return null;
              })
            );
            for (const r of batchResults) {
              if (r) results.push(r);
            }
          }

          // Sort by cyclomatic complexity descending
          results.sort((a, b) => b.cyclomatic - a.cyclomatic);

          // Compute aggregates
          const totalCyclomatic = results.reduce((s, r) => s + r.cyclomatic, 0);
          const avgCyclomatic = results.length > 0 ? totalCyclomatic / results.length : 0;
          const maxCyclomatic = results.length > 0 ? results[0].cyclomatic : 0;
          const totalBugs = results.reduce((s, r) => s + r.halstead.bugs, 0);
          const highComplexity = results.filter(r => r.cyclomatic > 10).length;

          if (format === 'json') {
            writeOutput(toJSON({
              filesAnalyzed: results.length,
              aggregate: {
                totalCyclomatic,
                avgCyclomatic: Math.round(avgCyclomatic * 100) / 100,
                maxCyclomatic,
                estimatedBugs: Math.round(totalBugs * 1000) / 1000,
                highComplexityFiles: highComplexity,
              },
              files: results,
            }), options.output);
          } else {
            console.log(chalk.cyan('  Aggregate Metrics:'));
            console.log(`    Files analyzed:       ${chalk.white(results.length)}`);
            console.log(`    Avg cyclomatic:       ${chalk.yellow(avgCyclomatic.toFixed(2))}`);
            console.log(`    Max cyclomatic:       ${maxCyclomatic > 20 ? chalk.red(maxCyclomatic) : maxCyclomatic > 10 ? chalk.yellow(maxCyclomatic) : chalk.green(maxCyclomatic)}`);
            console.log(`    Estimated bugs:       ${chalk.yellow(totalBugs.toFixed(3))}`);
            console.log(`    High complexity (>10): ${highComplexity > 0 ? chalk.red(highComplexity) : chalk.green(highComplexity)}`);

            // Show top hotspots
            const hotspots = results.filter(r => r.cyclomatic > 5).slice(0, 10);
            if (hotspots.length > 0) {
              console.log(chalk.cyan('\n  Complexity Hotspots:'));
              for (const h of hotspots) {
                const filePath = h.file.replace(process.cwd() + '/', '');
                const cyclColor = h.cyclomatic > 20 ? chalk.red : h.cyclomatic > 10 ? chalk.yellow : chalk.white;
                console.log(`    ${chalk.white(filePath)}`);
                console.log(chalk.gray(`      Cyclomatic: ${cyclColor(h.cyclomatic)}  Cognitive: ${h.cognitive}  Halstead bugs: ${h.halstead.bugs}`));
                if (h.suggestions.length > 0) {
                  console.log(chalk.gray(`      Suggestion: ${h.suggestions[0]}`));
                }
              }
            }

            if (highComplexity === 0) {
              console.log(chalk.green('\n  All files within acceptable complexity thresholds'));
            }
          }

        } else {
          console.log(chalk.red(`\nUnknown action: ${action}`));
          console.log(chalk.gray('  Available: index, search, impact, deps, complexity\n'));
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
