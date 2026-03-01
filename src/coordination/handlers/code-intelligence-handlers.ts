/**
 * Code intelligence and defect prediction task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: index-code, predict-defects
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ok, err } from '../../shared/types';
import { toError } from '../../shared/error-utils.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles } from './handler-utils';

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
      const kg = ctx.getKnowledgeGraph();
      const targetPath = payload.target || process.cwd();
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
      for (const file of filesToIndex) {
        const ext = path.extname(file).slice(1);
        const lang = extToLang[ext];
        if (lang) detectedLanguages.add(lang);
      }

      return ok({
        filesIndexed: indexResult.filesIndexed,
        nodesCreated: indexResult.nodesCreated,
        edgesCreated: indexResult.edgesCreated,
        target: targetPath,
        incremental: payload.incremental || false,
        languages: Array.from(detectedLanguages),
        duration: indexResult.duration,
        errors: indexResult.errors,
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
      const targetPath = payload.target || process.cwd();
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

      for (const filePath of sourceFiles) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
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
          // Skip files that can't be read
        }
      }

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
        recommendations.push(`${predictedDefects.length} files flagged for potential defects out of ${sourceFiles.length} analyzed`);
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
        recommendations.push('No files exceeded the defect probability threshold — code looks healthy');
      }

      return ok({
        predictedDefects: predictedDefects.slice(0, 20), // Top 20
        riskScore,
        recommendations,
        filesAnalyzed: sourceFiles.length,
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
