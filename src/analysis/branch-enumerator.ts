/**
 * Branch Enumerator Utility (BMAD-004)
 *
 * Mechanically enumerates all branching constructs in TypeScript/JavaScript files
 * without subjective risk scoring. Reports every unhandled path for completeness.
 *
 * Design: Strategy pattern (BranchEnumerator interface) for future multi-language support.
 * Uses regex-based pattern matching (NOT AST parsing) to keep the utility lightweight
 * and avoid parser version issues (Gap 5).
 */

export type SupportedLanguage = 'typescript' | 'javascript';

export type ConstructType =
  | 'if-without-else'
  | 'switch-no-default'
  | 'switch-missing-break'
  | 'try-empty-catch'
  | 'try-no-finally'
  | 'optional-chaining-null-path'
  | 'nullish-coalescing-fallback'
  | 'logical-or-falsy'
  | 'logical-and-short-circuit'
  | 'promise-no-catch'
  | 'array-callback-empty'
  | 'ternary-complex'
  | 'type-guard-unhandled';

export interface UnhandledBranch {
  file: string;
  line: number;
  column: number;
  language: SupportedLanguage;
  construct: ConstructType;
  triggerCondition: string;
  currentHandling: string;
  suggestedGuard: string;
  severity: 'high' | 'medium' | 'low';
}

export interface BranchEnumerator {
  /** Enumerate all unhandled branches in source code. */
  enumerate(sourceCode: string, filePath: string): UnhandledBranch[];
  /** Supported language */
  readonly language: SupportedLanguage;
}

export interface EnumerationResult {
  file: string;
  language: SupportedLanguage;
  branches: UnhandledBranch[];
  totalConstructs: number;
  unhandledCount: number;
  duration: number;
}

/**
 * TypeScript/JavaScript branch enumerator.
 * Uses line-by-line pattern matching for reliability.
 */
export class TSBranchEnumerator implements BranchEnumerator {
  readonly language: SupportedLanguage;

  constructor(language: SupportedLanguage = 'typescript') {
    this.language = language;
  }

  enumerate(sourceCode: string, filePath: string): UnhandledBranch[] {
    const branches: UnhandledBranch[] = [];
    const lines = sourceCode.split('\n');

    // Track context for multi-line comment detection
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;
      const col = line.length - line.trimStart().length + 1;

      // Skip block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith('/*')) {
        inBlockComment = !trimmed.includes('*/');
        continue;
      }
      // Skip line comments
      if (trimmed.startsWith('//')) continue;

      // 1. if-without-else
      if (/^\s*if\s*\(/.test(line)) {
        const hasElse = this.findMatchingElse(lines, i);
        if (!hasElse) {
          branches.push({
            file: filePath,
            line: lineNum,
            column: col,
            language: this.language,
            construct: 'if-without-else',
            triggerCondition: 'when condition is false',
            currentHandling: 'falls through — no else branch',
            suggestedGuard: 'Add else branch or document why falsy path is safe',
            severity: 'medium',
          });
        }
      }

      // 2. switch-no-default and switch-missing-break
      if (/^\s*switch\s*\(/.test(line)) {
        const switchBlock = this.extractBlock(lines, i);
        if (switchBlock && !switchBlock.includes('default:') && !switchBlock.includes('default :')) {
          branches.push({
            file: filePath,
            line: lineNum,
            column: col,
            language: this.language,
            construct: 'switch-no-default',
            triggerCondition: 'when value matches no case',
            currentHandling: 'falls through — no default case',
            suggestedGuard: 'Add default case with error handling or exhaustive check',
            severity: 'high',
          });
        }

        // 2b. switch-missing-break
        if (switchBlock) {
          const caseBlocks = switchBlock.match(/case\s+[^:]+:/g) || [];
          const breakStatements = switchBlock.match(/\b(break|return|throw|continue)\b/g) || [];
          if (caseBlocks.length > 0 && breakStatements.length < caseBlocks.length) {
            branches.push({
              file: filePath,
              line: lineNum,
              column: col,
              language: this.language,
              construct: 'switch-missing-break',
              triggerCondition: 'when case falls through to next case',
              currentHandling: 'fall-through — may execute unintended cases',
              suggestedGuard: 'Add break/return to each case or add explicit // falls through comment',
              severity: 'medium',
            });
          }
        }
      }

      // 3. try-empty-catch
      if (/\bcatch\s*\(/.test(trimmed) || /\bcatch\s*\{/.test(trimmed)) {
        const catchBody = this.extractBlock(lines, i);
        if (catchBody !== null) {
          const bodyContent = catchBody.replace(/[{}]/g, '').trim();
          if (bodyContent.length === 0 || /^\s*\/\//.test(bodyContent)) {
            branches.push({
              file: filePath,
              line: lineNum,
              column: col,
              language: this.language,
              construct: 'try-empty-catch',
              triggerCondition: 'when exception is thrown',
              currentHandling: 'exception silently swallowed',
              suggestedGuard: 'Log the error or rethrow with context',
              severity: 'high',
            });
          }
        }
      }

      // 3b. try-no-finally
      if (/\btry\s*\{/.test(trimmed)) {
        const tryBlock = this.extractBlock(lines, i);
        if (tryBlock) {
          const afterTry = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
          if (!afterTry.includes('finally')) {
            branches.push({
              file: filePath,
              line: lineNum,
              column: col,
              language: this.language,
              construct: 'try-no-finally',
              triggerCondition: 'when cleanup is needed regardless of success/failure',
              currentHandling: 'no finally block — cleanup may be skipped on exception',
              suggestedGuard: 'Add finally block for resource cleanup if applicable',
              severity: 'low',
            });
          }
        }
      }

      // 4. Optional chaining ?.
      if (trimmed.includes('?.')) {
        const chainMatches = trimmed.match(/(\w+(?:\.\w+)*)\?\./g) || [];
        for (const match of chainMatches) {
          // Check if the result is used without null check
          if (!trimmed.includes('??') && !trimmed.includes('|| ') && !trimmed.includes('if')) {
            branches.push({
              file: filePath,
              line: lineNum,
              column: col,
              language: this.language,
              construct: 'optional-chaining-null-path',
              triggerCondition: `when ${match.replace('?.', '')} is null/undefined`,
              currentHandling: 'returns undefined — may propagate',
              suggestedGuard: 'Add ?? fallback or explicit null check',
              severity: 'low',
            });
            break; // One per line
          }
        }
      }

      // 5. Nullish coalescing ??
      if (trimmed.includes('??') && !trimmed.includes('?.')) {
        branches.push({
          file: filePath,
          line: lineNum,
          column: col,
          language: this.language,
          construct: 'nullish-coalescing-fallback',
          triggerCondition: 'when left side is null/undefined',
          currentHandling: 'uses fallback value',
          suggestedGuard: 'Verify fallback value is appropriate for all null cases',
          severity: 'low',
        });
      }

      // 6. Promise without .catch
      if (/\.\s*then\s*\(/.test(trimmed) && !trimmed.includes('.catch') && !trimmed.includes('await')) {
        // Look ahead a few lines for .catch
        const nextLines = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
        if (!nextLines.includes('.catch') && !nextLines.includes('try')) {
          branches.push({
            file: filePath,
            line: lineNum,
            column: col,
            language: this.language,
            construct: 'promise-no-catch',
            triggerCondition: 'when promise rejects',
            currentHandling: 'unhandled rejection — may crash process',
            suggestedGuard: 'Add .catch() handler or use try/catch with await',
            severity: 'high',
          });
        }
      }

      // 7. Array methods with callbacks (empty array case)
      const arrayMethods = ['map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'flatMap'];
      for (const method of arrayMethods) {
        const pattern = new RegExp(`\\.${method}\\s*\\(`);
        if (pattern.test(trimmed)) {
          // Check if there's an empty array check before
          const prevLines = lines.slice(Math.max(0, i - 3), i).join(' ');
          if (!prevLines.includes('.length') && !prevLines.includes('if (') && !prevLines.includes('?.')) {
            branches.push({
              file: filePath,
              line: lineNum,
              column: col,
              language: this.language,
              construct: 'array-callback-empty',
              triggerCondition: `when array is empty before .${method}()`,
              currentHandling: method === 'reduce'
                ? 'may throw without initial value'
                : 'returns empty result — may cause downstream issues',
              suggestedGuard: method === 'reduce'
                ? 'Provide initial value or check array length'
                : 'Check array length or handle empty result',
              severity: method === 'reduce' ? 'high' : 'low',
            });
            break; // One per line
          }
        }
      }

      // 8. Logical OR for defaults (falsy trap)
      if (/\|\|\s*['"`\d]/.test(trimmed) && !trimmed.includes('??')) {
        branches.push({
          file: filePath,
          line: lineNum,
          column: col,
          language: this.language,
          construct: 'logical-or-falsy',
          triggerCondition: 'when left side is falsy (0, "", false, null, undefined)',
          currentHandling: 'uses fallback — may unintentionally override 0, "", or false',
          suggestedGuard: 'Use ?? instead of || if only null/undefined should trigger fallback',
          severity: 'medium',
        });
      }

      // 9. Logical AND short-circuit
      if (/&&\s*\w+\s*\(/.test(trimmed) && !trimmed.includes('if') && !trimmed.includes('while')) {
        branches.push({
          file: filePath,
          line: lineNum,
          column: col,
          language: this.language,
          construct: 'logical-and-short-circuit',
          triggerCondition: 'when left side is falsy — right side never executes',
          currentHandling: 'short-circuits — function call skipped silently',
          suggestedGuard: 'Use explicit if-statement for clarity when side effects matter',
          severity: 'low',
        });
      }

      // 10. Complex ternary (nested or very long)
      const ternaryMatches = trimmed.match(/\?/g) || [];
      if (ternaryMatches.length >= 2 && trimmed.includes(':')) {
        branches.push({
          file: filePath,
          line: lineNum,
          column: col,
          language: this.language,
          construct: 'ternary-complex',
          triggerCondition: 'when nested ternary conditions interact',
          currentHandling: 'nested ternary — hard to read and maintain',
          suggestedGuard: 'Refactor to if/else or switch for readability',
          severity: 'medium',
        });
      }

      // 11. Type guard without exhaustive handling
      if (/\btypeof\s+\w+\s*===?\s*['"]/.test(trimmed) || /\binstanceof\b/.test(trimmed)) {
        if (!trimmed.includes('else') && !this.findMatchingElse(lines, i)) {
          branches.push({
            file: filePath,
            line: lineNum,
            column: col,
            language: this.language,
            construct: 'type-guard-unhandled',
            triggerCondition: 'when value does not match the guarded type',
            currentHandling: 'unguarded type path — may cause runtime type errors',
            suggestedGuard: 'Add else branch or exhaustive type checking',
            severity: 'medium',
          });
        }
      }
    }

    return branches;
  }

  /**
   * Check if an if-statement has a matching else.
   * Simple heuristic: look for 'else' at same or lower indentation within ~30 lines.
   */
  private findMatchingElse(lines: string[], ifLineIndex: number): boolean {
    const braceCount = { depth: 0 };

    for (let i = ifLineIndex; i < Math.min(ifLineIndex + 30, lines.length); i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') braceCount.depth++;
        if (ch === '}') braceCount.depth--;
      }

      // After the if block closes, check for else
      if (braceCount.depth === 0 && i > ifLineIndex) {
        const nextLine = lines[i + 1]?.trim() || '';
        if (
          nextLine.startsWith('else') ||
          lines[i].trim().endsWith('else') ||
          lines[i].trim().endsWith('else {')
        ) {
          return true;
        }
        // Also check same line (e.g., "} else {")
        if (lines[i].includes('} else')) return true;
        break;
      }
    }

    return false;
  }

  /**
   * Extract the block (curly braces content) starting near a line.
   */
  private extractBlock(lines: string[], startIndex: number): string | null {
    let braceDepth = 0;
    let started = false;
    const blockLines: string[] = [];

    for (let i = startIndex; i < Math.min(startIndex + 50, lines.length); i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') {
          braceDepth++;
          started = true;
        }
        if (ch === '}') braceDepth--;
      }

      if (started) {
        blockLines.push(line);
        if (braceDepth === 0) {
          return blockLines.join('\n');
        }
      }
    }

    return null;
  }
}

/**
 * Enumerate branches in a source file.
 */
export function enumerateBranches(
  sourceCode: string,
  filePath: string,
  language?: SupportedLanguage,
): EnumerationResult {
  const start = Date.now();

  // Detect language from file extension
  const detectedLang: SupportedLanguage = language ||
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript');

  const enumerator = new TSBranchEnumerator(detectedLang);
  const branches = enumerator.enumerate(sourceCode, filePath);

  return {
    file: filePath,
    language: detectedLang,
    branches,
    totalConstructs: branches.length,
    unhandledCount: branches.length,
    duration: Date.now() - start,
  };
}

/**
 * Format enumeration result as markdown.
 */
export function formatBranchReport(result: EnumerationResult): string {
  const lines: string[] = [];

  lines.push(`# Branch Enumeration Report: ${result.file}`);
  lines.push('');
  lines.push(`**Language**: ${result.language} | **Branches**: ${result.unhandledCount} | **Duration**: ${result.duration}ms`);
  lines.push('');

  if (result.branches.length === 0) {
    lines.push('No unhandled branches detected.');
    return lines.join('\n');
  }

  // Group by severity
  const bySeverity: Record<string, UnhandledBranch[]> = { high: [], medium: [], low: [] };
  for (const branch of result.branches) {
    bySeverity[branch.severity].push(branch);
  }

  for (const severity of ['high', 'medium', 'low'] as const) {
    const group = bySeverity[severity];
    if (group.length === 0) continue;

    lines.push(`## ${severity.toUpperCase()} Severity (${group.length})`);
    lines.push('');

    for (const branch of group) {
      lines.push(`### ${branch.construct} — Line ${branch.line}`);
      lines.push(`- **Trigger**: ${branch.triggerCondition}`);
      lines.push(`- **Current**: ${branch.currentHandling}`);
      lines.push(`- **Suggested**: ${branch.suggestedGuard}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format enumeration result as JSON.
 */
export function formatBranchJSON(result: EnumerationResult): string {
  return JSON.stringify(result, null, 2);
}
