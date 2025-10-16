/**
 * CodeSignatureGenerator - Generate code fingerprints for pattern matching
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 *
 * Generates unique signatures for code blocks based on:
 * - Function signatures and parameter types
 * - Return types
 * - Cyclomatic complexity
 * - AST node patterns
 * - Dependencies
 */

import { parse } from '@babel/parser';
import * as crypto from 'crypto';
import { CodeSignature, PatternMatch, PatternType, ASTAnalysisOptions } from '../types/pattern.types';
import { Logger } from '../utils/Logger';

export class CodeSignatureGenerator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Generate code signature from source code
   */
  async generate(sourceCode: string, options?: ASTAnalysisOptions): Promise<CodeSignature> {
    try {
      const ast = this.parseAST(sourceCode, options);

      const functionSignature = this.extractFunctionSignature(ast);
      const parameterTypes = this.extractParameterTypes(ast);
      const returnType = this.extractReturnType(ast);
      const complexity = this.calculateComplexity(ast);
      const patterns = this.identifyPatterns(ast);
      const sourceHash = this.generateSourceHash(sourceCode);
      const nodeTypes = this.extractNodeTypes(ast);
      const dependencies = this.extractDependencies(ast);

      return {
        id: this.generateSignatureId(sourceCode),
        functionSignature,
        parameterTypes,
        returnType,
        complexity,
        patterns,
        sourceHash,
        nodeTypes,
        dependencies,
        createdAt: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to generate code signature:', error);
      throw error;
    }
  }

  /**
   * Parse source code to AST
   */
  private parseAST(code: string, options?: ASTAnalysisOptions): any {
    const defaultOptions: ASTAnalysisOptions = {
      typescript: true,
      jsx: true,
      includeComments: false,
      maxDepth: 50
    };

    const opts = { ...defaultOptions, ...options };

    return parse(code, {
      sourceType: 'module',
      plugins: opts.typescript ? ['typescript'] : []
    });
  }

  /**
   * Extract function signature
   */
  private extractFunctionSignature(ast: any): string {
    let signature = 'unknown';

    this.traverseAST(ast, (node: any) => {
      if (node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression') {
        const name = node.id?.name || 'anonymous';
        const params = node.params.map((p: any) => this.getParamName(p)).join(', ');
        signature = `${name}(${params})`;
      }
      if (node.type === 'ClassMethod') {
        const name = node.key.name || 'method';
        const params = node.params.map((p: any) => this.getParamName(p)).join(', ');
        signature = `${name}(${params})`;
      }
    });

    return signature;
  }

  /**
   * Extract parameter types
   */
  private extractParameterTypes(ast: any): Array<{ name: string; type: string; optional?: boolean }> {
    const parameters: Array<{ name: string; type: string; optional?: boolean }> = [];

    this.traverseAST(ast, (node: any) => {
      if (node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression' ||
          node.type === 'ClassMethod') {
        node.params.forEach((param: any) => {
          parameters.push({
            name: this.getParamName(param),
            type: this.getParamType(param),
            optional: param.optional || false
          });
        });
      }
    });

    return parameters;
  }

  /**
   * Extract return type
   */
  private extractReturnType(ast: any): string {
    let returnType = 'void';

    this.traverseAST(ast, (node: any) => {
      if (node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression' ||
          node.type === 'ClassMethod') {
        if (node.returnType) {
          returnType = this.getTypeAnnotation(node.returnType);
        } else {
          // Infer from return statements
          returnType = this.inferReturnType(node);
        }
      }
    });

    return returnType;
  }

  /**
   * Calculate cyclomatic complexity
   * Uses standard complexity metrics with proper else-if counting
   */
  private calculateComplexity(ast: any): number {
    let complexity = 1; // Base complexity

    this.traverseAST(ast, (node: any) => {
      // Increase complexity for decision points
      if (node.type === 'IfStatement') {
        complexity++;
        // Count else-if as additional complexity
        if (node.alternate && node.alternate.type === 'IfStatement') {
          complexity++;
        }
      }
      if (node.type === 'SwitchCase' && node.test !== null) complexity++;
      if (node.type === 'ForStatement') complexity++;
      if (node.type === 'ForInStatement') complexity++;
      if (node.type === 'ForOfStatement') complexity++;
      if (node.type === 'WhileStatement') complexity++;
      if (node.type === 'DoWhileStatement') complexity++;
      if (node.type === 'ConditionalExpression') complexity++;
      if (node.type === 'LogicalExpression' && node.operator === '&&') complexity++;
      if (node.type === 'LogicalExpression' && node.operator === '||') complexity++;
      if (node.type === 'CatchClause') complexity++;
    });

    return complexity;
  }

  /**
   * Identify patterns in AST
   */
  private identifyPatterns(ast: any): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // Identify async patterns
    if (this.hasAsyncPattern(ast)) {
      patterns.push({
        type: PatternType.ASYNC_PATTERN,
        confidence: 0.95,
        description: 'Asynchronous execution pattern detected',
        location: { startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 },
        data: { hasAsync: true }
      });
    }

    // Identify error handling patterns
    if (this.hasErrorHandling(ast)) {
      patterns.push({
        type: PatternType.ERROR_HANDLING,
        confidence: 0.9,
        description: 'Error handling pattern detected',
        location: { startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 },
        data: { hasTryCatch: true }
      });
    }

    // Identify boundary conditions
    if (this.hasBoundaryChecks(ast)) {
      patterns.push({
        type: PatternType.BOUNDARY_CONDITION,
        confidence: 0.85,
        description: 'Boundary condition checks detected',
        location: { startLine: 0, endLine: 0, startColumn: 0, endColumn: 0 },
        data: { hasBoundaryChecks: true }
      });
    }

    return patterns;
  }

  /**
   * Generate source hash for change detection
   */
  private generateSourceHash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Extract all node types in AST
   */
  private extractNodeTypes(ast: any): string[] {
    const types = new Set<string>();
    this.traverseAST(ast, (node: any) => {
      if (node.type) types.add(node.type);
    });
    return Array.from(types);
  }

  /**
   * Extract dependencies and imports
   */
  private extractDependencies(ast: any): string[] {
    const dependencies: string[] = [];

    this.traverseAST(ast, (node: any) => {
      if (node.type === 'ImportDeclaration') {
        dependencies.push(node.source.value);
      }
      if (node.type === 'CallExpression' && node.callee.name === 'require') {
        if (node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
          dependencies.push(node.arguments[0].value);
        }
      }
    });

    return Array.from(new Set(dependencies));
  }

  /**
   * Generate unique signature ID
   */
  private generateSignatureId(code: string): string {
    const hash = crypto.createHash('md5').update(code).digest('hex').substring(0, 12);
    return `sig-${hash}`;
  }

  /**
   * Get parameter name
   */
  private getParamName(param: any): string {
    if (param.type === 'Identifier') return param.name;
    if (param.type === 'AssignmentPattern') return this.getParamName(param.left);
    if (param.type === 'RestElement') return `...${this.getParamName(param.argument)}`;
    if (param.type === 'ObjectPattern') return '{...}';
    if (param.type === 'ArrayPattern') return '[...]';
    return 'unknown';
  }

  /**
   * Get parameter type
   */
  private getParamType(param: any): string {
    if (param.typeAnnotation) {
      return this.getTypeAnnotation(param.typeAnnotation);
    }
    return 'any';
  }

  /**
   * Get type annotation
   */
  private getTypeAnnotation(typeNode: any): string {
    if (!typeNode) return 'any';
    if (typeNode.typeAnnotation) return this.getTypeAnnotation(typeNode.typeAnnotation);
    if (typeNode.type === 'TSStringKeyword') return 'string';
    if (typeNode.type === 'TSNumberKeyword') return 'number';
    if (typeNode.type === 'TSBooleanKeyword') return 'boolean';
    if (typeNode.type === 'TSVoidKeyword') return 'void';
    if (typeNode.type === 'TSAnyKeyword') return 'any';
    if (typeNode.type === 'TSArrayType') return `${this.getTypeAnnotation(typeNode.elementType)}[]`;
    if (typeNode.type === 'TSPromiseType') return `Promise<${this.getTypeAnnotation(typeNode.typeParameter)}>`;
    return 'unknown';
  }

  /**
   * Infer return type from return statements
   */
  private inferReturnType(node: any): string {
    let hasReturn = false;
    let returnType = 'void';

    this.traverseAST(node, (n: any) => {
      if (n.type === 'ReturnStatement' && n.argument) {
        hasReturn = true;
        returnType = this.inferTypeFromExpression(n.argument);
      }
    });

    return hasReturn ? returnType : 'void';
  }

  /**
   * Infer type from expression
   */
  private inferTypeFromExpression(expr: any): string {
    if (!expr) return 'void';
    if (expr.type === 'StringLiteral') return 'string';
    if (expr.type === 'NumericLiteral') return 'number';
    if (expr.type === 'BooleanLiteral') return 'boolean';
    if (expr.type === 'ArrayExpression') return 'array';
    if (expr.type === 'ObjectExpression') return 'object';
    if (expr.type === 'AwaitExpression') return 'Promise<any>';
    return 'any';
  }

  /**
   * Check for async patterns
   */
  private hasAsyncPattern(ast: any): boolean {
    let hasAsync = false;
    this.traverseAST(ast, (node: any) => {
      if (node.async || node.type === 'AwaitExpression') {
        hasAsync = true;
      }
    });
    return hasAsync;
  }

  /**
   * Check for error handling
   */
  private hasErrorHandling(ast: any): boolean {
    let hasErrorHandling = false;
    this.traverseAST(ast, (node: any) => {
      if (node.type === 'TryStatement' || node.type === 'CatchClause') {
        hasErrorHandling = true;
      }
    });
    return hasErrorHandling;
  }

  /**
   * Check for boundary checks
   */
  private hasBoundaryChecks(ast: any): boolean {
    let hasBoundary = false;
    this.traverseAST(ast, (node: any) => {
      if (node.type === 'BinaryExpression') {
        if (['>', '<', '>=', '<=', '===', '!=='].includes(node.operator)) {
          hasBoundary = true;
        }
      }
    });
    return hasBoundary;
  }

  /**
   * Traverse AST
   */
  private traverseAST(ast: any, visitor: (node: any) => void): void {
    const traverse = (node: any, depth: number = 0) => {
      if (!node || depth > 100) return;
      visitor(node);

      for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) {
            node[key].forEach((child: any) => traverse(child, depth + 1));
          } else {
            traverse(node[key], depth + 1);
          }
        }
      }
    };

    traverse(ast);
  }
}
