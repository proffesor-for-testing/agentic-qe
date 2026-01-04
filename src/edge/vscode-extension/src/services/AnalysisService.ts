/**
 * AnalysisService - Code Analysis Service for VS Code Extension
 *
 * Provides code analysis capabilities including:
 * - Function extraction and analysis
 * - Test coverage estimation
 * - Test suggestion generation
 * - Pattern matching for similar code
 *
 * Uses EdgeAgentService for vector operations.
 *
 * @module vscode-extension/services/AnalysisService
 * @version 0.1.0
 */

import * as vscode from 'vscode';
import type { EdgeAgentService, PatternMatch, StoredPattern, PatternType, PatternDomain } from './EdgeAgentService';

/**
 * File analysis result
 */
export interface FileAnalysis {
  /**
   * File path
   */
  filePath: string;

  /**
   * Language ID
   */
  language: string;

  /**
   * Extracted functions
   */
  functions: FunctionInfo[];

  /**
   * Test suggestions
   */
  suggestions: TestSuggestion[];

  /**
   * Analysis duration in ms
   */
  duration: number;

  /**
   * Overall coverage estimate
   */
  estimatedCoverage?: number;
}

/**
 * Function information extracted from code
 */
export interface FunctionInfo {
  /**
   * Function name
   */
  name: string;

  /**
   * Function type (function, arrow, method, class)
   */
  type: 'function' | 'arrow-function' | 'method' | 'class';

  /**
   * Start line (0-indexed)
   */
  startLine: number;

  /**
   * End line (0-indexed)
   */
  endLine: number;

  /**
   * Function code
   */
  code: string;

  /**
   * Whether function has associated tests
   */
  hasTests: boolean;

  /**
   * Estimated coverage percentage
   */
  coverage?: number;

  /**
   * Branch coverage percentage
   */
  branchCoverage?: number;

  /**
   * Parameters
   */
  parameters: string[];

  /**
   * Return type (if available)
   */
  returnType?: string;

  /**
   * Is async function
   */
  isAsync: boolean;

  /**
   * Is exported
   */
  isExported: boolean;

  /**
   * JSDoc comment
   */
  jsdoc?: string;
}

/**
 * Test suggestion
 */
export interface TestSuggestion {
  /**
   * Suggestion title
   */
  title: string;

  /**
   * Description of the suggestion
   */
  description: string;

  /**
   * Generated test code
   */
  code: string;

  /**
   * Target function name
   */
  targetFunction?: string;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Similar pattern ID (if matched)
   */
  patternId?: string;

  /**
   * Pattern type
   */
  patternType?: PatternType;
}

/**
 * AnalysisService
 *
 * Provides code analysis and test suggestion capabilities.
 */
export class AnalysisService {
  /**
   * Cache of file analyses
   */
  private analysisCache: Map<string, CachedAnalysis> = new Map();

  /**
   * Cache expiry time in ms
   */
  private readonly cacheExpiryMs = 60000; // 1 minute

  constructor(private readonly edgeAgentService: EdgeAgentService) {}

  /**
   * Analyze a file
   */
  async analyzeFile(document: vscode.TextDocument): Promise<FileAnalysis> {
    const startTime = performance.now();
    const filePath = document.fileName;

    // Check cache
    const cached = this.analysisCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiryMs) {
      return cached.analysis;
    }

    const code = document.getText();
    const language = document.languageId;

    // Extract functions
    const functions = this.extractFunctions(code, language);

    // Check for existing tests
    await this.detectExistingTests(document, functions);

    // Generate suggestions
    const suggestions = await this.generateSuggestions(functions, filePath);

    // Calculate estimated coverage
    const estimatedCoverage = this.calculateEstimatedCoverage(functions);

    const duration = performance.now() - startTime;

    const analysis: FileAnalysis = {
      filePath,
      language,
      functions,
      suggestions,
      duration,
      estimatedCoverage,
    };

    // Cache result
    this.analysisCache.set(filePath, {
      analysis,
      timestamp: Date.now(),
    });

    return analysis;
  }

  /**
   * Suggest tests for code
   */
  async suggestTests(code: string, fileName: string): Promise<TestSuggestion[]> {
    const suggestions: TestSuggestion[] = [];

    try {
      // Search for similar patterns
      const matches = await this.edgeAgentService.suggestTests(code, fileName, {
        k: 5,
        threshold: 0.3,
        type: 'unit-test',
      });

      // Convert matches to suggestions
      for (const match of matches) {
        const suggestion = this.createSuggestionFromMatch(match, code);
        suggestions.push(suggestion);
      }

      // If no matches, generate basic suggestions
      if (suggestions.length === 0) {
        const basicSuggestions = this.generateBasicSuggestions(code, fileName);
        suggestions.push(...basicSuggestions);
      }
    } catch (error) {
      // Fall back to basic suggestions on error
      const basicSuggestions = this.generateBasicSuggestions(code, fileName);
      suggestions.push(...basicSuggestions);
    }

    return suggestions;
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Extract functions from code
   */
  private extractFunctions(code: string, language: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = code.split('\n');

    // Regular function declarations
    this.extractRegularFunctions(code, lines, functions);

    // Arrow functions
    this.extractArrowFunctions(code, lines, functions);

    // Class declarations and methods
    this.extractClasses(code, lines, functions);

    return functions;
  }

  /**
   * Extract regular function declarations
   */
  private extractRegularFunctions(
    code: string,
    lines: string[],
    functions: FunctionInfo[]
  ): void {
    const functionRegex = /(?:(export)\s+)?(?:(async)\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;

    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;
      const functionBody = this.extractBody(code, match.index);
      const endLine = startLine + functionBody.split('\n').length - 1;

      const parameters = match[4]
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const jsdoc = this.extractJSDoc(lines, startLine);

      functions.push({
        name: match[3],
        type: 'function',
        startLine,
        endLine,
        code: functionBody,
        hasTests: false, // Will be updated later
        coverage: undefined,
        parameters,
        returnType: match[5]?.trim(),
        isAsync: match[2] === 'async',
        isExported: match[1] === 'export',
        jsdoc,
      });
    }
  }

  /**
   * Extract arrow functions
   */
  private extractArrowFunctions(
    code: string,
    lines: string[],
    functions: FunctionInfo[]
  ): void {
    const arrowRegex = /(?:(export)\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:(async)\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/g;

    let match;
    while ((match = arrowRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;

      // Check if it's a block or expression body
      const arrowIndex = code.indexOf('=>', match.index);
      let bodyStart = arrowIndex + 2;
      while (bodyStart < code.length && /\s/.test(code[bodyStart])) {
        bodyStart++;
      }

      let functionBody: string;
      let endLine: number;

      if (code[bodyStart] === '{') {
        functionBody = this.extractBody(code, match.index);
        endLine = startLine + functionBody.split('\n').length - 1;
      } else {
        // Expression body
        functionBody = this.extractExpressionBody(code, match.index);
        endLine = startLine + functionBody.split('\n').length - 1;
      }

      const parameters = match[4]
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const jsdoc = this.extractJSDoc(lines, startLine);

      functions.push({
        name: match[2],
        type: 'arrow-function',
        startLine,
        endLine,
        code: functionBody,
        hasTests: false,
        coverage: undefined,
        parameters,
        returnType: match[5]?.trim(),
        isAsync: match[3] === 'async',
        isExported: match[1] === 'export',
        jsdoc,
      });
    }
  }

  /**
   * Extract classes and methods
   */
  private extractClasses(
    code: string,
    lines: string[],
    functions: FunctionInfo[]
  ): void {
    const classRegex = /(?:(export)\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g;

    let match;
    while ((match = classRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;
      const classBody = this.extractBody(code, match.index);
      const endLine = startLine + classBody.split('\n').length - 1;

      const jsdoc = this.extractJSDoc(lines, startLine);

      functions.push({
        name: match[2],
        type: 'class',
        startLine,
        endLine,
        code: classBody,
        hasTests: false,
        coverage: undefined,
        parameters: [],
        isAsync: false,
        isExported: match[1] === 'export',
        jsdoc,
      });

      // Extract methods within the class
      this.extractMethods(classBody, startLine, match[2], functions);
    }
  }

  /**
   * Extract methods from class body
   */
  private extractMethods(
    classBody: string,
    classStartLine: number,
    className: string,
    functions: FunctionInfo[]
  ): void {
    const methodRegex = /(?:(async)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/g;

    let match;
    while ((match = methodRegex.exec(classBody)) !== null) {
      const methodName = match[2];

      // Skip constructor
      if (methodName === 'constructor') continue;

      const relativeStartLine = classBody.substring(0, match.index).split('\n').length - 1;
      const startLine = classStartLine + relativeStartLine;
      const methodBody = this.extractBody(classBody, match.index);
      const endLine = startLine + methodBody.split('\n').length - 1;

      const parameters = match[3]
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      functions.push({
        name: `${className}.${methodName}`,
        type: 'method',
        startLine,
        endLine,
        code: methodBody,
        hasTests: false,
        coverage: undefined,
        parameters,
        returnType: match[4]?.trim(),
        isAsync: match[1] === 'async',
        isExported: false, // Methods inherit export from class
      });
    }
  }

  /**
   * Extract body (brace-matched)
   */
  private extractBody(code: string, startIndex: number): string {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < code.length; i++) {
      const char = code[i];
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    return code.substring(startIndex, endIndex);
  }

  /**
   * Extract expression body for arrow functions
   */
  private extractExpressionBody(code: string, startIndex: number): string {
    const arrowIndex = code.indexOf('=>', startIndex);
    if (arrowIndex === -1) return '';

    let bodyStart = arrowIndex + 2;
    while (bodyStart < code.length && /\s/.test(code[bodyStart])) {
      bodyStart++;
    }

    let endIndex = bodyStart;
    let parenCount = 0;
    let bracketCount = 0;

    for (let i = bodyStart; i < code.length; i++) {
      const char = code[i];
      if (char === '(' || char === '{') parenCount++;
      else if (char === ')' || char === '}') parenCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
      else if (parenCount === 0 && bracketCount === 0 && (char === ';' || char === '\n')) {
        endIndex = i;
        break;
      }
      endIndex = i;
    }

    return code.substring(startIndex, endIndex + 1);
  }

  /**
   * Extract JSDoc comment before a function
   */
  private extractJSDoc(lines: string[], functionLine: number): string | undefined {
    if (functionLine === 0) return undefined;

    // Look for JSDoc ending on the line before
    let jsdocEnd = functionLine - 1;
    while (jsdocEnd >= 0 && lines[jsdocEnd].trim() === '') {
      jsdocEnd--;
    }

    if (jsdocEnd < 0 || !lines[jsdocEnd].trim().endsWith('*/')) {
      return undefined;
    }

    // Find JSDoc start
    let jsdocStart = jsdocEnd;
    while (jsdocStart >= 0 && !lines[jsdocStart].trim().startsWith('/**')) {
      jsdocStart--;
    }

    if (jsdocStart < 0) return undefined;

    return lines.slice(jsdocStart, jsdocEnd + 1).join('\n');
  }

  /**
   * Detect existing tests for functions
   */
  private async detectExistingTests(
    document: vscode.TextDocument,
    functions: FunctionInfo[]
  ): Promise<void> {
    const sourcePath = document.fileName;
    const testPath = this.getTestFilePath(sourcePath);

    try {
      // Try to find test file
      const testUri = vscode.Uri.file(testPath);
      const testDoc = await vscode.workspace.openTextDocument(testUri);
      const testCode = testDoc.getText().toLowerCase();

      // Check each function
      for (const func of functions) {
        const funcNameLower = func.name.toLowerCase();
        // Simple heuristic: function has tests if test file mentions it
        func.hasTests = testCode.includes(funcNameLower);
        if (func.hasTests) {
          // Estimate coverage based on test mentions
          const mentions = (testCode.match(new RegExp(funcNameLower, 'g')) || []).length;
          func.coverage = Math.min(100, mentions * 25);
        } else {
          func.coverage = 0;
        }
      }
    } catch {
      // No test file found - all functions have no tests
      for (const func of functions) {
        func.hasTests = false;
        func.coverage = 0;
      }
    }
  }

  /**
   * Generate test suggestions for functions
   */
  private async generateSuggestions(
    functions: FunctionInfo[],
    filePath: string
  ): Promise<TestSuggestion[]> {
    const suggestions: TestSuggestion[] = [];

    for (const func of functions) {
      if (!func.hasTests) {
        // Generate suggestion for untested function
        const suggestion = this.generateSuggestionForFunction(func, filePath);
        suggestions.push(suggestion);
      } else if (func.coverage !== undefined && func.coverage < 80) {
        // Generate suggestion for low coverage
        const suggestion = this.generateCoverageSuggestion(func, filePath);
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Generate suggestion for a function
   */
  private generateSuggestionForFunction(func: FunctionInfo, filePath: string): TestSuggestion {
    const moduleName = this.getModuleName(filePath);
    const testCode = this.generateTestCode(func, moduleName);

    return {
      title: `Add tests for ${func.name}`,
      description: `Generate ${func.isAsync ? 'async ' : ''}${func.type} tests`,
      code: testCode,
      targetFunction: func.name,
      confidence: 0.8,
      patternType: 'unit-test',
    };
  }

  /**
   * Generate coverage improvement suggestion
   */
  private generateCoverageSuggestion(func: FunctionInfo, filePath: string): TestSuggestion {
    const moduleName = this.getModuleName(filePath);

    return {
      title: `Improve coverage for ${func.name}`,
      description: `Current coverage: ${func.coverage}%. Add edge case tests.`,
      code: this.generateEdgeCaseTests(func, moduleName),
      targetFunction: func.name,
      confidence: 0.6,
      patternType: 'unit-test',
    };
  }

  /**
   * Generate test code for a function
   */
  private generateTestCode(func: FunctionInfo, moduleName: string): string {
    const params = func.parameters.join(', ');
    const isAsync = func.isAsync;

    if (func.type === 'class') {
      return `describe('${func.name}', () => {
  let instance: ${func.name};

  beforeEach(() => {
    instance = new ${func.name}();
  });

  it('should create an instance', () => {
    expect(instance).toBeDefined();
  });

  // @template: Add method tests here
});`;
    }

    return `describe('${func.name}', () => {
  it('should handle normal input', ${isAsync ? 'async ' : ''}() => {
    ${isAsync ? 'const result = await ' : 'const result = '}${func.name}(${this.generateMockParams(func.parameters)});
    expect(result).toBeDefined();
  });

  it('should handle edge cases', ${isAsync ? 'async ' : ''}() => {
    // @template: Add edge case tests here
  });

  it('should handle errors', ${isAsync ? 'async ' : ''}() => {
    ${isAsync ? 'await expect(' : 'expect(() => '}${func.name}(${this.generateInvalidParams(func.parameters)})${isAsync ? ')' : ')'}.toThrow();
  });
});`;
  }

  /**
   * Generate edge case tests
   */
  private generateEdgeCaseTests(func: FunctionInfo, moduleName: string): string {
    return `describe('${func.name} edge cases', () => {
  it('should handle null input', ${func.isAsync ? 'async ' : ''}() => {
    // @template: Test null handling
  });

  it('should handle empty input', ${func.isAsync ? 'async ' : ''}() => {
    // @template: Test empty input
  });

  it('should handle boundary values', ${func.isAsync ? 'async ' : ''}() => {
    // @template: Test boundary conditions
  });
});`;
  }

  /**
   * Generate mock parameters
   */
  private generateMockParams(parameters: string[]): string {
    return parameters
      .map((p) => {
        const name = p.split(':')[0].trim().replace('?', '');
        const type = p.split(':')[1]?.trim() || 'any';

        if (type.includes('string')) return `'test${name}'`;
        if (type.includes('number')) return '1';
        if (type.includes('boolean')) return 'true';
        if (type.includes('[]')) return '[]';
        if (type.includes('object') || type === 'any') return '{}';
        return 'undefined';
      })
      .join(', ');
  }

  /**
   * Generate invalid parameters for error testing
   */
  private generateInvalidParams(parameters: string[]): string {
    return parameters.map(() => 'null').join(', ');
  }

  /**
   * Create suggestion from pattern match
   */
  private createSuggestionFromMatch(match: PatternMatch, targetCode: string): TestSuggestion {
    return {
      title: `Use pattern: ${match.pattern.type}`,
      description: `${Math.round(match.score * 100)}% similar pattern from ${match.pattern.domain}`,
      code: this.adaptPatternToTarget(match.pattern, targetCode),
      confidence: match.score,
      patternId: match.pattern.id,
      patternType: match.pattern.type,
    };
  }

  /**
   * Adapt a pattern to target code
   */
  private adaptPatternToTarget(pattern: StoredPattern, targetCode: string): string {
    // Simple adaptation - in production would be more sophisticated
    return pattern.content;
  }

  /**
   * Generate basic suggestions when no patterns match
   */
  private generateBasicSuggestions(code: string, fileName: string): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    // Extract function name from code
    const funcMatch = code.match(/(?:function|const|let|var)\s+(\w+)/);
    const funcName = funcMatch?.[1] || 'myFunction';

    suggestions.push({
      title: `Generate unit test for ${funcName}`,
      description: 'Basic unit test template',
      code: `describe('${funcName}', () => {
  it('should work correctly', () => {
    // @template: Implement test assertions
  });
});`,
      targetFunction: funcName,
      confidence: 0.5,
      patternType: 'unit-test',
    });

    return suggestions;
  }

  /**
   * Calculate estimated coverage
   */
  private calculateEstimatedCoverage(functions: FunctionInfo[]): number {
    if (functions.length === 0) return 0;

    const totalCoverage = functions.reduce((sum, f) => sum + (f.coverage ?? 0), 0);
    return Math.round(totalCoverage / functions.length);
  }

  /**
   * Get test file path from source path
   */
  private getTestFilePath(sourcePath: string): string {
    const ext = sourcePath.match(/\.(tsx?|jsx?)$/)?.[0] || '.ts';
    const basePath = sourcePath.replace(/\.(tsx?|jsx?)$/, '');
    return `${basePath}.test${ext}`;
  }

  /**
   * Get module name from file path
   */
  private getModuleName(filePath: string): string {
    const fileName = filePath.split('/').pop() || '';
    return fileName.replace(/\.(tsx?|jsx?)$/, '');
  }
}

/**
 * Cached analysis
 */
interface CachedAnalysis {
  analysis: FileAnalysis;
  timestamp: number;
}
