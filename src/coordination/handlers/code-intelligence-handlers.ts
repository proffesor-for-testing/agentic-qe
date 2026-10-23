/**
 * Code intelligence and defect prediction task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: index-code, predict-defects
 */

import { randomUUID } from 'node:crypto';
import { prunePredictionHistory } from '../../domains/defect-intelligence/prediction-history.js';
import * as path from 'path';
import { ok, err, type Result } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';
import { resolveProjectRootFromPaths } from '../../domains/code-intelligence/project-root-resolver.js';
import { nothingIndexedError } from '../../domains/code-intelligence/index-path-guard.js';
import { createLogger } from '../../logging/logger-factory.js';
import { requirePayloadPath } from '../../shared/io/payload-path-guard.js';
import { readConfinedText } from '../../shared/io/confined-read.js';

const logger = createLogger('CodeIntelligenceHandlers');

/** Project metric summary returned by the MCP index-code handler (#999). */
export interface IndexProjectMetricsSummary {
  root: string;
  loc: number;
  locByLanguage: Record<string, number>;
  tests: number;
  toolsUsed: string[];
}

async function collectProjectMetricsForTarget(
  ctx: TaskHandlerContext,
  targetPath: string,
  indexedFiles: string[],
): Promise<IndexProjectMetricsSummary | undefined> {
  if (!ctx.getCodeIntelligenceCoordinator) return undefined;
  const root = resolveProjectRootFromPaths(indexedFiles, { target: path.resolve(targetPath) });
  if (!root) {
    logger.debug('Skipping project metrics: no project root resolved (filesystem root or no paths)');
    return undefined;
  }
  try {
    const coordinator = await ctx.getCodeIntelligenceCoordinator();
    if (!coordinator) return undefined;
    const metrics = await coordinator.collectProjectMetrics(root);
    if (!metrics.success) {
      logger.debug(`Project metrics unavailable: ${metrics.error.message}`);
      return undefined;
    }
    return {
      root,
      loc: metrics.value.loc.total,
      locByLanguage: metrics.value.loc.byLanguage,
      tests: metrics.value.tests.total,
      toolsUsed: metrics.value.toolsUsed,
    };
  } catch (error) {
    logger.debug(`Project metrics unavailable: ${toError(error).message}`);
    return undefined;
  }
}

/** #1126: a caller-named target must be a file or directory inside the project. */
async function confineTarget(taskType: string, target: string | undefined): Promise<Result<string | undefined, Error>> {
  if (!target || target === '.') return ok(undefined);
  return requirePayloadPath(taskType, 'target', target, { allowDirectory: true, allowMissing: true });
}

/**
 * #1224: index the files for the code-intelligence search (the index the
 * Queen's `search` task reads), not only the knowledge graph. Returns warnings
 * for the index result.
 */
async function indexFilesForSearch(ctx: TaskHandlerContext, indexedFiles: string[]): Promise<string[]> {
  const unavailable = 'Search index not updated: the code-intelligence domain is unavailable, so a code search will not find these files.';
  if (!ctx.getCodeIntelligenceCoordinator) return [unavailable];
  try {
    const coordinator = await ctx.getCodeIntelligenceCoordinator();
    if (!coordinator) return [unavailable];
    return (await coordinator.indexForSearch(indexedFiles)).warnings;
  } catch (error) {
    return [`Search index not updated: ${toError(error).message}`];
  }
}

export function registerCodeIntelligenceHandlers(ctx: TaskHandlerContext): void {
  // Register code indexing handler - REAL IMPLEMENTATION
  ctx.registerHandler('index-code', async (task) => {
    const payload = task.payload as {
      target: string;
      incremental: boolean;
      includeTests?: boolean;
      languages?: string[];
    };

    try {
      // #1126: refuse an outside target before listing it, so the error
      // cannot name the files in an outside directory.
      const confined = await confineTarget('index-code', payload.target);
      if (!confined.success) return confined;
      const kg = ctx.getKnowledgeGraph();
      const targetPath = confined.value ?? (payload.target || process.cwd());
      const startTime = Date.now();

      // Discover files to index
      const filesToIndex = await discoverSourceFiles(targetPath, {
        includeTests: payload.includeTests !== false,
        languages: payload.languages,
      });

      if (filesToIndex.length === 0) {
        return ok({
          filesIndexed: 0,
          nodesCreated: 0,
          edgesCreated: 0,
          target: targetPath,
          incremental: payload.incremental || false,
          languages: payload.languages || [],
          duration: Date.now() - startTime,
          warning: `No source files found in ${targetPath}. Searched for: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, C/C++, and more.`,
        });
      }

      // Use the real KnowledgeGraphService to index files
      const result = await kg.index({
        paths: filesToIndex,
        incremental: payload.incremental || false,
        includeTests: payload.includeTests !== false,
        languages: payload.languages,
      });

      if (!result.success) {
        return result;
      }

      const indexResult = result.value;

      // #1096: files were found but none was indexed (e.g. the target is a
      // symlink out of the project) - fail like the coordinator does.
      if (indexResult.filesIndexed === 0) {
        return err(nothingIndexedError(filesToIndex.length, indexResult.skipped ?? [], indexResult.errors));
      }
      const notIndexed = new Set([
        ...(indexResult.skipped ?? []).map((s) => s.path),
        ...indexResult.errors.map((e) => e.file),
      ]);
      const indexedFiles = filesToIndex.filter((file) => !notIndexed.has(file));

      // #999 MCP-CLI parity: `aqe code index` runs the coordinator's project
      // metric step (LOC, tests, tools); run the same step here, rooted at the
      // caller's target the way #997 resolves it. Best-effort: indexing has
      // already succeeded, so a metric failure only omits projectMetrics.
      const projectMetrics = await collectProjectMetricsForTarget(ctx, targetPath, indexedFiles);
      const searchWarnings = await indexFilesForSearch(ctx, indexedFiles);

      // Detect languages from files
      const detectedLanguages = new Set<string>();
      const extToLang: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        py: 'python', pyw: 'python',
        go: 'go', rs: 'rust',
        java: 'java', kt: 'kotlin', kts: 'kotlin',
        rb: 'ruby', cs: 'csharp', php: 'php', swift: 'swift',
        c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
        scala: 'scala',
      };
      for (const file of indexedFiles) {
        const ext = path.extname(file).slice(1);
        const lang = extToLang[ext];
        if (lang) detectedLanguages.add(lang);
      }

      return ok({
        filesIndexed: indexResult.filesIndexed,
        nodesCreated: indexResult.nodesCreated,
        edgesCreated: indexResult.edgesCreated,
        // MCP CodeIndexResult reports symbols/relations; map them from the KG's
        // node/edge counts so `code_index` doesn't always report 0 (#511 MCP
        // parity — the result mapper reads these exact field names).
        symbolsExtracted: indexResult.nodesCreated,
        relationsFound: indexResult.edgesCreated,
        target: targetPath,
        incremental: payload.incremental || false,
        languages: Array.from(detectedLanguages),
        duration: indexResult.duration,
        errors: indexResult.errors,
        warnings: [...(indexResult.warnings ?? []), ...searchWarnings],
        skipped: indexResult.skipped ?? [],
        ...(projectMetrics ? { projectMetrics } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });

  // Register defect prediction handler - REAL IMPLEMENTATION
  ctx.registerHandler('predict-defects', async (task) => {
    const payload = task.payload as {
      target: string;
      minConfidence: number;
    };

    try {
      const confined = await confineTarget('predict-defects', payload.target);
      if (!confined.success) return confined;
      const targetPath = confined.value ?? path.resolve(payload.target || process.cwd());
      const minConfidence = payload.minConfidence || 0.5;

      // Discover actual source files in the target directory
      const sourceFiles = await discoverSourceFiles(targetPath, { includeTests: false });

      if (sourceFiles.length === 0) {
        return ok({
          predictedDefects: [],
          riskScore: 0,
          recommendations: [
            `No source files found in ${targetPath}. Ensure the path contains source code files.`,
          ],
          warning: `No source files found in ${targetPath}`,
          filesAnalyzed: 0,
        });
      }

      // Analyze each file for defect indicators based on real metrics
      const predictedDefects: Array<{ file: string; probability: number; reason: string }> = [];
      const predictions: Array<{
        file: string; probability: number; riskLevel: string;
        factors: Array<{ name: string; contribution: number }>; recommendations: string[];
      }> = [];

      let filesSkipped = 0;
      for (const filePath of sourceFiles) {
        try {
          // #1161: validate the opened descriptor, not the name listed earlier.
          const content = await readConfinedText(filePath, { outsideRoot: 'allow' });
          const lines = content.split('\n');
          const lineCount = lines.length;

          // Calculate complexity indicators from real code
          let probability = 0;
          const reasons: string[] = [];

          // Factor 1: File size (large files are more defect-prone)
          if (lineCount > 500) {
            probability += 0.25;
            reasons.push(`Large file (${lineCount} lines)`);
          } else if (lineCount > 300) {
            probability += 0.15;
            reasons.push(`Medium-large file (${lineCount} lines)`);
          }

          // Factor 2: Cyclomatic complexity indicators
          const branchKeywords = content.match(/\b(if|else|switch|case|for|while|catch|&&|\|\|)\b/g) || [];
          const branchDensity = branchKeywords.length / Math.max(lineCount, 1);
          if (branchDensity > 0.15) {
            probability += 0.25;
            reasons.push(`High branch density (${branchKeywords.length} branches in ${lineCount} lines)`);
          } else if (branchDensity > 0.08) {
            probability += 0.10;
            reasons.push('Moderate branch complexity');
          }

          // Factor 3: Deeply nested code
          const maxIndent = Math.max(...lines.map(l => {
            const match = l.match(/^(\s*)/);
            return match ? match[1].length : 0;
          }));
          if (maxIndent > 20) {
            probability += 0.15;
            reasons.push('Deep nesting detected');
          }

          // Factor 4: TODO/FIXME/HACK comments
          const debtComments = (content.match(/\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/gi) || []).length;
          if (debtComments > 3) {
            probability += 0.15;
            reasons.push(`${debtComments} technical debt markers`);
          }

          // Factor 5: Long functions (heuristic)
          const functionStarts = (content.match(/\b(function|def|func|async)\b/g) || []).length;
          if (functionStarts > 0 && lineCount / functionStarts > 80) {
            probability += 0.10;
            reasons.push('Potentially long functions');
          }

          probability = Math.min(probability, 0.95);

          // Keep every analyzed file, including a clean reanalysis below the
          // display threshold. Absolute paths retain the project-relative
          // identity when the caller targeted a nested directory (#1050).
          const roundedProbability = Math.round(probability * 100) / 100;
          predictions.push({
            file: path.resolve(filePath),
            probability: roundedProbability,
            riskLevel: probability >= 0.8 ? 'critical' : probability >= 0.6 ? 'high'
              : probability >= 0.4 ? 'medium' : probability >= 0.2 ? 'low' : 'info',
            factors: [{ name: 'staticCodeIndicators', contribution: roundedProbability }],
            recommendations: reasons,
          });

          if (probability >= minConfidence) {
            // Use relative path for readability
            const relativePath = filePath.startsWith(targetPath)
              ? filePath.slice(targetPath.length).replace(/^\//, '')
              : filePath;
            predictedDefects.push({
              file: relativePath,
              probability: Math.round(probability * 100) / 100,
              reason: reasons.join('; '),
            });
          }
        } catch {
          filesSkipped++;
          // Skip files that can't be read
        }
      }

      if (predictions.length === 0) {
        return err(new Error(`Defect prediction could not read any of ${sourceFiles.length} source files`));
      }

      // Record the run in the schema consumed by the background worker.
      // These are static risk estimates from files actually read, not an
      // empirically calibrated likelihood of future production defects.
      const id = randomUUID();
      await ctx.memory.set(`defect-intelligence:predictor:prediction:${id}`, {
        id,
        timestamp: new Date().toISOString(),
        predictions,
        predictionMethod: 'static-code-indicators',
        estimated: true,
        filesSkipped,
        scanStatus: filesSkipped > 0 ? 'partial' : 'complete',
      }, { namespace: 'defect-intelligence', ttl: 86400 * 7 });
      await prunePredictionHistory(ctx.memory);

      // Sort by probability descending
      predictedDefects.sort((a, b) => b.probability - a.probability);

      // Calculate overall risk score
      const avgProb = predictedDefects.length > 0
        ? predictedDefects.reduce((sum, d) => sum + d.probability, 0) / predictedDefects.length
        : 0;
      const riskScore = Math.round(avgProb * 100);

      // Generate recommendations from actual findings
      const recommendations: string[] = [];
      if (predictedDefects.length > 0) {
        recommendations.push(`${predictedDefects.length} files flagged for potential defects out of ${predictions.length} analyzed`);
        const topFile = predictedDefects[0];
        recommendations.push(`Highest risk: ${topFile.file} (${Math.round(topFile.probability * 100)}%) — ${topFile.reason}`);
      }
      if (predictedDefects.some(d => d.reason.includes('Large file'))) {
        recommendations.push('Consider splitting large files to reduce complexity');
      }
      if (predictedDefects.some(d => d.reason.includes('technical debt'))) {
        recommendations.push('Address TODO/FIXME comments to reduce technical debt');
      }
      if (predictedDefects.length === 0) {
        recommendations.push(filesSkipped > 0
          ? `No analyzed files exceeded the threshold; ${filesSkipped} unreadable source files remain unassessed`
          : 'No files exceeded the defect probability threshold — code looks healthy');
      }

      return ok({
        predictedDefects: predictedDefects.slice(0, 20), // Top 20
        riskScore,
        recommendations,
        filesAnalyzed: predictions.length,
        filesSkipped,
        scanStatus: filesSkipped > 0 ? 'partial' : 'complete',
        predictionMethod: 'static-code-indicators',
        estimated: true,
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
