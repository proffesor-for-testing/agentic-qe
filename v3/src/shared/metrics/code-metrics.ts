/**
 * Agentic QE v3 - Code Metrics Analyzer
 * Real code analysis for complexity, maintainability, and quality metrics
 */

import { TypeScriptParser, ParsedClass, ParsedFunction } from '../parsers';
import { FileReader } from '../io';

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
    this.fileReader = new FileReader();
  }

  /**
   * Analyze a single file for all metrics
   */
  async analyzeFile(filePath: string): Promise<FileMetrics | null> {
    const contentResult = await this.fileReader.readFile(filePath);
    if (!contentResult.success) {
      return null;
    }

    const content = contentResult.value;
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
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      try {
        const ast = this.parser.parseFile(fileName, content);

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
      } catch {
        // If parsing fails, use heuristic analysis
        cyclomaticComplexity = this.estimateCyclomaticComplexity(content);
        cognitiveComplexity = this.estimateCognitiveComplexity(content);
      }
    } else {
      // For non-TS/JS files, use heuristic analysis
      cyclomaticComplexity = this.estimateCyclomaticComplexity(content);
      cognitiveComplexity = this.estimateCognitiveComplexity(content);
    }

    // Calculate Halstead metrics
    const halsteadMetrics = this.calculateHalsteadMetrics(content);

    // Calculate maintainability index
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      halsteadMetrics.volume,
      cyclomaticComplexity,
      codeLines
    );

    return {
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
  }

  /**
   * Analyze function-level metrics
   */
  analyzeFunctionComplexity(
    content: string,
    func: ParsedFunction | ParsedClass['methods'][0]
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
      /\belse\s+if\s*\(/g,
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

  private calculateCognitiveComplexity(code: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Increase nesting
      if (/\bif\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      if (/\belse\s+if\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      }
      if (/\belse\s*{/.test(trimmed)) {
        complexity += 1;
      }
      if (/\bfor\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      if (/\bwhile\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      if (/\bswitch\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      if (/\bcatch\s*\(/.test(trimmed)) {
        complexity += 1 + nestingLevel;
        nestingLevel++;
      }
      if (/\?\s*[^:]/.test(trimmed)) {
        complexity += 1 + nestingLevel; // Ternary
      }
      if (/&&|\|\|/.test(trimmed)) {
        complexity += 1; // Boolean operators
      }

      // Track nesting via braces (simplified)
      const openBraces = (trimmed.match(/{/g) || []).length;
      const closeBraces = (trimmed.match(/}/g) || []).length;
      nestingLevel = Math.max(0, nestingLevel + openBraces - closeBraces);
    }

    return complexity;
  }

  private estimateCyclomaticComplexity(code: string): number {
    // Fallback heuristic for non-parseable code
    return this.calculateCyclomaticComplexity(code);
  }

  private estimateCognitiveComplexity(code: string): number {
    // Fallback heuristic for non-parseable code
    return this.calculateCognitiveComplexity(code);
  }

  private calculateNestingDepth(content: string, func: ParsedFunction | ParsedClass['methods'][0]): number {
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
