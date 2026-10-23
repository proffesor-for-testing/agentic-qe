/**
 * Agentic QE v3 - Code Metrics Analyzer
 * Real code analysis for complexity, maintainability, and quality metrics
 */

import { TypeScriptParser, FunctionInfo, MethodInfo } from '../parsers';
import { FileReader, PathTraversalError } from '../io';
import { treeSitterRegistry } from '../parsers/multi-language-parser.js';
import { getLanguageFromExtension } from '../types/test-frameworks.js';
import { calculateCognitiveComplexity } from './cognitive-complexity.js';
import { findProjectRoot } from '../../kernel/project-root.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FileMetrics {
  path: string;
  linesOfCode: number;
  linesOfComments: number;
  blankLines: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  halsteadMetrics: HalsteadMetrics;
  functionCount: number;
  classCount: number;
  maxNestingDepth: number;
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  volume: number;
  difficulty: number;
  effort: number;
}

export interface FunctionMetrics {
  name: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  parameterCount: number;
  linesOfCode: number;
}

export interface DuplicationResult {
  percentage: number;
  duplicates: DuplicateBlock[];
}

/**
 * #1011 / #1021: how one file's analysis counts as evidence.
 * - `measured`: real metrics.
 * - `excluded`: not source to judge (binary, generated, minified, type
 *   declarations, or refused by the reader's path policy) — leave it out.
 * - `failed`: source that could not be read or parsed — a gap in the scope.
 */
export type FileAnalysisStatus = 'measured' | 'excluded' | 'failed';

export interface FileAnalysisOutcome {
  status: FileAnalysisStatus;
  /** Metrics computed from the file; null when excluded or unreadable. */
  metrics: FileMetrics | null;
  /** Why the file is excluded or failed. */
  reason?: string;
}

/** git-style binary sniff: a NUL within the first 8 KB. */
const BINARY_SNIFF_CHARS = 8192;
/** How far into a file the generated-file conventions are looked for. */
const GENERATED_SNIFF_CHARS = 1024;
/** Go's convention (golang.org/s/generatedcode), one full line. */
const GO_GENERATED_LINE = /^\/\/ Code generated .* DO NOT EDIT\.$/m;
/** `@generated` used as a tag (not part of a word, e.g. not `@generatedAt`). */
const GENERATED_TAG = /(?:^|[\s*/])@generated(?![\w-])/;

/** The file's first comment block: a leading block comment or run of line comments. */
function firstCommentBlock(content: string): string {
  const text = content.replace(/^\uFEFF/, '').replace(/^#![^\n]*\n/, '').trimStart();
  if (text.startsWith('/*')) {
    const close = text.indexOf('*/');
    return close >= 0 ? text.slice(0, close + 2) : text;
  }
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trimStart().startsWith('//')) break;
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * #1021 round 2b: generated only by convention — Go's
 * "// Code generated … DO NOT EDIT." line near the top, or an `@generated`
 * tag in the first comment block. Prose such as "DO NOT EDIT the retry
 * constants", or `@generated` mentioned later in the file, is handwritten.
 */
function isGeneratedSource(content: string): boolean {
  const head = content.slice(0, GENERATED_SNIFF_CHARS).replace(/\r\n/g, '\n');
  return GO_GENERATED_LINE.test(head) || GENERATED_TAG.test(firstCommentBlock(head));
}

/** Extensions parsed as TypeScript/JavaScript; anything else is only estimated. */
const PARSED_EXTENSIONS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

/**
 * A UTF-16 file read as UTF-8: its byte-order mark becomes two replacement
 * characters (#1020). It is source in an unsupported encoding, not binary.
 */
function isUtf16Source(content: string): boolean {
  return content.startsWith('\uFFFD\uFFFD') && content.slice(0, BINARY_SNIFF_CHARS).includes('\u0000');
}

/** Exclusion decided from the file name alone. */
function excludedByName(filePath: string): string | undefined {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  if (/\.d\.(ts|mts|cts)$/i.test(name)) return 'type declaration file';
  if (/\.min\.(js|mjs|cjs)$/i.test(name)) return 'minified bundle';
  return undefined;
}

export interface DuplicateBlock {
  lines: number;
  occurrences: number;
  locations: Array<{ file: string; startLine: number; endLine: number }>;
}

// ============================================================================
// Code Metrics Analyzer
// ============================================================================

export class CodeMetricsAnalyzer {
  private readonly parser: TypeScriptParser;
  private readonly fileReader: FileReader;

  constructor() {
    this.parser = new TypeScriptParser();
    // #1021: reads inside the AQE project root (AQE_PROJECT_ROOT, else the
    // detected root — not merely the process cwd) are contained by realpath,
    // so in-root names like `[...slug].tsx`, dot-dirs and deep paths are
    // readable; anything outside keeps the legacy path validation.
    this.fileReader = new FileReader({ projectRoot: findProjectRoot() });
  }

  /**
   * Analyze a single file for all metrics
   */
  async analyzeFile(filePath: string): Promise<FileMetrics | null> {
    return (await this.analyzeWithDiagnostics(filePath)).metrics;
  }

  /**
   * #1011 / #1021: analyse a file and say whether its metrics are evidence.
   * Binary, generated, minified and declaration files — and files the reader
   * refuses by policy — are `excluded`; unreadable or unparseable source is
   * `failed`. Callers must not treat either as a measurement.
   */
  async analyzeFileDetailed(filePath: string): Promise<FileAnalysisOutcome> {
    const byName = excludedByName(filePath);
    if (byName) return { status: 'excluded', metrics: null, reason: `${filePath}: ${byName}` };

    const { metrics, content, readError, parseFailure, parsedAsSource } = await this.analyzeWithDiagnostics(filePath);
    if (readError) {
      return readError instanceof PathTraversalError
        ? { status: 'excluded', metrics: null, reason: `${filePath} was refused by the file reader (${readError.message})` }
        : { status: 'failed', metrics: null, reason: `${filePath} could not be read (${readError.message})` };
    }
    if (content !== undefined && isUtf16Source(content)) {
      return { status: 'failed', metrics: null, reason: `${filePath} is UTF-16 encoded; only UTF-8 source can be analysed` };
    }
    // git-style sniff, except that TS/JS which parses cleanly is source even
    // with a raw NUL inside a string literal (seen in real repos).
    const sourceDespiteNul = parsedAsSource && !parseFailure;
    if (content !== undefined && !sourceDespiteNul && content.slice(0, BINARY_SNIFF_CHARS).includes('\u0000')) {
      return { status: 'excluded', metrics: null, reason: `${filePath} has binary content` };
    }
    if (content !== undefined && isGeneratedSource(content)) {
      return { status: 'excluded', metrics: null, reason: `${filePath} is a generated file` };
    }
    if (parseFailure) return { status: 'failed', metrics, reason: `${filePath} could not be parsed (${parseFailure})` };
    // #1020: without a parse, complexity is a regex estimate — the same
    // estimate a TS parse failure falls back to — so it is not a measurement.
    if (!parsedAsSource) {
      return { status: 'failed', metrics, reason: `${filePath} was not parsed (no parser for this file type); its complexity would only be a regex estimate` };
    }
    return { status: 'measured', metrics };
  }

  /** Compute metrics, reporting read errors and parse failures separately. */
  private async analyzeWithDiagnostics(filePath: string): Promise<{
    metrics: FileMetrics | null; content?: string; readError?: Error; parseFailure?: string;
    /** true when the file was parsed as TypeScript/JavaScript (not estimated by heuristics). */
    parsedAsSource?: boolean;
  }> {
    const contentResult = await this.fileReader.readFile(filePath);
    if (!contentResult.success) {
      return { metrics: null, readError: contentResult.error };
    }

    const content = contentResult.value;
    let parseFailure: string | undefined;
    const lines = content.split('\n');

    // Count different types of lines
    const { codeLines, commentLines, blankLines } = this.countLines(lines);

    // Parse the file for AST analysis
    const fileName = filePath.split('/').pop() || filePath;
    const ext = fileName.split('.').pop() || '';

    let cyclomaticComplexity = 1;
    let cognitiveComplexity = 0;
    let maxNestingDepth = 0;
    let functionCount = 0;
    let classCount = 0;

    // Only parse TypeScript/JavaScript files
    const parsedAsSource = PARSED_EXTENSIONS.includes(ext);
    if (parsedAsSource) {
      try {
        const ast = this.parser.parseFile(fileName, content);
        const syntaxErrors = this.parser.countSyntaxErrors(ast);
        if (syntaxErrors > 0) {
          parseFailure = `${syntaxErrors} syntax error${syntaxErrors === 1 ? '' : 's'}`;
        }

        // Extract functions and calculate complexity
        const functions = this.parser.extractFunctions(ast);
        functionCount = functions.length;

        for (const func of functions) {
          const funcMetrics = this.analyzeFunctionComplexity(content, func);
          cyclomaticComplexity += funcMetrics.cyclomaticComplexity - 1; // -1 to avoid double counting base
          cognitiveComplexity += funcMetrics.cognitiveComplexity;
          maxNestingDepth = Math.max(maxNestingDepth, this.calculateNestingDepth(content, func));
        }

        // Extract classes
        const classes = this.parser.extractClasses(ast);
        classCount = classes.length;

        // Add method complexity from classes
        for (const cls of classes) {
          for (const method of cls.methods) {
            const funcMetrics = this.analyzeFunctionComplexity(content, method);
            cyclomaticComplexity += funcMetrics.cyclomaticComplexity - 1;
            cognitiveComplexity += funcMetrics.cognitiveComplexity;
          }
        }
      } catch (error) {
        // If parsing fails, use heuristic analysis — an estimate, not a measurement (#1011)
        parseFailure ??= error instanceof Error ? error.message : String(error);
        cyclomaticComplexity = this.estimateCyclomaticComplexity(content);
        cognitiveComplexity = this.estimateCognitiveComplexity(content);
      }
    } else {
      // For non-TS/JS files, use heuristic analysis for complexity
      cyclomaticComplexity = this.estimateCyclomaticComplexity(content);
      cognitiveComplexity = this.estimateCognitiveComplexity(content);

      // Try tree-sitter registry for accurate function/class counts
      const detectedLang = getLanguageFromExtension(ext);
      if (detectedLang && detectedLang !== 'typescript' && detectedLang !== 'javascript' && treeSitterRegistry.supportsLanguage(detectedLang)) {
        try {
          const parsed = await treeSitterRegistry.parseFile(content, filePath, detectedLang);
          if (parsed) {
            functionCount = parsed.functions.length;
            classCount = parsed.classes.length;
          }
        } catch {
          // Fall back to regex heuristics for counts
          functionCount = (content.match(/function\s|def\s|func\s|fn\s/g) || []).length;
          classCount = (content.match(/class\s|struct\s|interface\s/g) || []).length;
        }
      } else {
        // Regex fallback for unsupported languages
        functionCount = (content.match(/function\s|def\s|func\s|fn\s/g) || []).length;
        classCount = (content.match(/class\s|struct\s|interface\s/g) || []).length;
      }
    }

    // Calculate Halstead metrics
    const halsteadMetrics = this.calculateHalsteadMetrics(content);

    // Calculate maintainability index
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      halsteadMetrics.volume,
      cyclomaticComplexity,
      codeLines
    );

    const metrics: FileMetrics = {
      path: filePath,
      linesOfCode: codeLines,
      linesOfComments: commentLines,
      blankLines,
      cyclomaticComplexity,
      cognitiveComplexity,
      maintainabilityIndex,
      halsteadMetrics,
      functionCount,
      classCount,
      maxNestingDepth,
    };
    return { metrics, content, parseFailure, parsedAsSource };
  }

  /**
   * Analyze function-level metrics
   */
  analyzeFunctionComplexity(
    content: string,
    func: FunctionInfo | MethodInfo
  ): FunctionMetrics {
    const lines = content.split('\n');
    const startLine = func.startLine;
    const endLine = func.endLine;
    const functionCode = lines.slice(startLine - 1, endLine).join('\n');

    return {
      name: func.name,
      startLine,
      endLine,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(functionCode),
      cognitiveComplexity: this.calculateCognitiveComplexity(functionCode),
      parameterCount: 'parameters' in func ? func.parameters.length : 0,
      linesOfCode: endLine - startLine + 1,
    };
  }

  /**
   * Detect code duplication across files
   */
  async detectDuplication(
    files: string[],
    minLines: number = 5
  ): Promise<DuplicationResult> {
    const fileContents: Map<string, string[]> = new Map();
    let totalLines = 0;
    let duplicatedLines = 0;

    // Read all files
    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (result.success) {
        const lines = result.value.split('\n').map((l) => l.trim());
        fileContents.set(file, lines);
        totalLines += lines.length;
      }
    }

    // Build line hash map for quick lookup
    const lineHashes: Map<string, Array<{ file: string; line: number }>> = new Map();
    const duplicates: DuplicateBlock[] = [];

    for (const [file, lines] of fileContents.entries()) {
      for (let i = 0; i < lines.length - minLines + 1; i++) {
        // Create a hash of minLines consecutive lines
        const block = lines.slice(i, i + minLines).join('\n');
        if (block.length < 20) continue; // Skip very short blocks

        const hash = this.hashString(block);
        const existing = lineHashes.get(hash) || [];
        existing.push({ file, line: i + 1 });
        lineHashes.set(hash, existing);
      }
    }

    // Find actual duplicates (blocks that appear more than once)
    for (const [, locations] of lineHashes.entries()) {
      if (locations.length > 1) {
        duplicatedLines += minLines * (locations.length - 1);
        duplicates.push({
          lines: minLines,
          occurrences: locations.length,
          locations: locations.map((l) => ({
            file: l.file,
            startLine: l.line,
            endLine: l.line + minLines - 1,
          })),
        });
      }
    }

    // Limit duplicates to top 20 by occurrences
    const sortedDuplicates = duplicates
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 20);

    return {
      percentage: totalLines > 0 ? Math.round((duplicatedLines / totalLines) * 100 * 10) / 10 : 0,
      duplicates: sortedDuplicates,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private countLines(lines: string[]): {
    codeLines: number;
    commentLines: number;
    blankLines: number;
  } {
    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blankLines++;
        continue;
      }

      if (inBlockComment) {
        commentLines++;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('//')) {
        commentLines++;
      } else if (trimmed.startsWith('/*')) {
        commentLines++;
        if (!trimmed.includes('*/')) {
          inBlockComment = true;
        }
      } else {
        codeLines++;
        // Also count inline comments
        if (trimmed.includes('//') || trimmed.includes('/*')) {
          commentLines++;
        }
      }
    }

    return { codeLines, commentLines, blankLines };
  }

  private calculateCyclomaticComplexity(code: string): number {
    // Count decision points
    const decisionPatterns = [
      /\bif\s*\(/g,
      // The if pattern already counts else-if decisions.
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\s*[^:]/g, // Ternary operator
      /&&/g,
      /\|\|/g,
      /\?\?/g, // Nullish coalescing
    ];

    let complexity = 1; // Base complexity

    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /** SonarSource cognitive complexity heuristic; see ./cognitive-complexity.ts (#907). */
  private calculateCognitiveComplexity(code: string): number {
    return calculateCognitiveComplexity(code);
  }

  private estimateCyclomaticComplexity(code: string): number {
    // Fallback heuristic for non-parseable code
    return this.calculateCyclomaticComplexity(code);
  }

  private estimateCognitiveComplexity(code: string): number {
    // Fallback heuristic for non-parseable code
    return this.calculateCognitiveComplexity(code);
  }

  private calculateNestingDepth(content: string, func: FunctionInfo | MethodInfo): number {
    const lines = content.split('\n');
    const functionCode = lines.slice(func.startLine - 1, func.endLine).join('\n');

    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of functionCode) {
      if (char === '{') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === '}') {
        currentDepth = Math.max(0, currentDepth - 1);
      }
    }

    return maxDepth;
  }

  private calculateHalsteadMetrics(code: string): HalsteadMetrics {
    // Extract operators and operands
    const operators = new Set<string>();
    const operands = new Set<string>();
    let totalOperators = 0;
    let totalOperands = 0;

    // Common operators
    const operatorPatterns = [
      /[+\-*/%]=?/g,
      /[<>]=?/g,
      /[!=]=?=?/g,
      /&&|\|\|/g,
      /\+\+|--/g,
      /\./g,
      /,/g,
      /:/g,
      /\?/g,
      /=>/g,
    ];

    for (const pattern of operatorPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        for (const match of matches) {
          operators.add(match);
          totalOperators++;
        }
      }
    }

    // Extract identifiers as operands
    const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'return', 'function', 'class', 'const', 'let', 'var',
      'new', 'this', 'true', 'false', 'null', 'undefined', 'typeof',
      'import', 'export', 'default', 'from', 'async', 'await', 'try',
      'catch', 'finally', 'throw', 'interface', 'type', 'extends',
    ]);

    const identifiers = code.match(identifierPattern);
    if (identifiers) {
      for (const id of identifiers) {
        if (!keywords.has(id)) {
          operands.add(id);
          totalOperands++;
        }
      }
    }

    const n1 = operators.size; // Distinct operators
    const n2 = operands.size;  // Distinct operands
    const N1 = totalOperators; // Total operators
    const N2 = totalOperands;  // Total operands

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const volume = length > 0 && vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
    const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
    const effort = volume * difficulty;

    return {
      vocabulary,
      length,
      volume: Math.round(volume * 100) / 100,
      difficulty: Math.round(difficulty * 100) / 100,
      effort: Math.round(effort * 100) / 100,
    };
  }

  private calculateMaintainabilityIndex(
    halsteadVolume: number,
    cyclomaticComplexity: number,
    linesOfCode: number
  ): number {
    // Standard Maintainability Index formula (Microsoft variant)
    // MI = 171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)
    // Normalized to 0-100 scale

    if (linesOfCode <= 0 || halsteadVolume <= 0) {
      return 100; // Perfect score for empty/trivial code
    }

    const lnVolume = Math.log(halsteadVolume);
    const lnLOC = Math.log(linesOfCode);

    const rawMI = 171 - 5.2 * lnVolume - 0.23 * cyclomaticComplexity - 16.2 * lnLOC;

    // Normalize to 0-100
    const normalizedMI = Math.max(0, Math.min(100, rawMI * 100 / 171));

    return Math.round(normalizedMI * 100) / 100;
  }

  private hashString(str: string): string {
    // Simple hash for duplication detection
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultAnalyzer: CodeMetricsAnalyzer | null = null;

export function getCodeMetricsAnalyzer(): CodeMetricsAnalyzer {
  if (!defaultAnalyzer) {
    defaultAnalyzer = new CodeMetricsAnalyzer();
  }
  return defaultAnalyzer;
}
