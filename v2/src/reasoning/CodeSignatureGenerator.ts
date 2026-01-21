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

import { parse, type ParseResult } from '@babel/parser';
import type * as t from '@babel/types';
import * as crypto from 'crypto';
import { CodeSignature, PatternMatch, PatternType, ASTAnalysisOptions } from '../types/pattern.types';
import { Logger } from '../utils/Logger';

/**
 * Babel AST Node base interface for traversal
 * Represents the common structure of all Babel AST nodes
 */
interface BabelNode {
  type: string;
  loc?: t.SourceLocation | null;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

/**
 * Function-like AST node (FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)
 */
interface FunctionLikeNode extends BabelNode {
  type: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression' | 'ClassMethod';
  id?: { name: string } | null;
  params: ParameterNode[];
  async?: boolean;
  returnType?: TypeAnnotationNode | null;
  body?: BabelNode;
  key?: { name?: string };
}

/**
 * Parameter node in function declarations
 */
interface ParameterNode extends BabelNode {
  type: 'Identifier' | 'AssignmentPattern' | 'RestElement' | 'ObjectPattern' | 'ArrayPattern';
  name?: string;
  optional?: boolean;
  typeAnnotation?: TypeAnnotationNode | null;
  left?: ParameterNode;
  argument?: ParameterNode;
}

/**
 * Type annotation node for TypeScript
 */
interface TypeAnnotationNode extends BabelNode {
  type: string;
  typeAnnotation?: TypeAnnotationNode;
  elementType?: TypeAnnotationNode;
  typeParameter?: TypeAnnotationNode;
}

/**
 * If statement node
 */
interface IfStatementNode extends BabelNode {
  type: 'IfStatement';
  alternate?: BabelNode | null;
}

/**
 * Switch case node
 */
interface SwitchCaseNode extends BabelNode {
  type: 'SwitchCase';
  test: BabelNode | null;
}

/**
 * Logical expression node
 */
interface LogicalExpressionNode extends BabelNode {
  type: 'LogicalExpression';
  operator: '||' | '&&' | '??';
}

/**
 * Binary expression node
 */
interface BinaryExpressionNode extends BabelNode {
  type: 'BinaryExpression';
  operator: string;
}

/**
 * Return statement node
 */
interface ReturnStatementNode extends BabelNode {
  type: 'ReturnStatement';
  argument?: ExpressionNode | null;
}

/**
 * Expression node types for return type inference
 */
interface ExpressionNode extends BabelNode {
  type: string;
}

/**
 * Import declaration node
 */
interface ImportDeclarationNode extends BabelNode {
  type: 'ImportDeclaration';
  source: { value: string };
}

/**
 * Call expression node for require() detection
 */
interface CallExpressionNode extends BabelNode {
  type: 'CallExpression';
  callee: { name?: string };
  arguments: Array<{ type: string; value?: string }>;
}

/**
 * AST visitor callback type
 */
type ASTVisitor = (node: BabelNode) => void;

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
  private parseAST(code: string, options?: ASTAnalysisOptions): ParseResult<t.File> {
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
  private extractFunctionSignature(ast: ParseResult<t.File>): string {
    let signature = 'unknown';

    this.traverseAST(ast, (node: BabelNode) => {
      if (this.isFunctionLikeNode(node)) {
        if (node.type === 'ClassMethod') {
          const name = node.key?.name || 'method';
          const params = node.params.map((p: ParameterNode) => this.getParamName(p)).join(', ');
          signature = `${name}(${params})`;
        } else {
          const name = node.id?.name || 'anonymous';
          const params = node.params.map((p: ParameterNode) => this.getParamName(p)).join(', ');
          signature = `${name}(${params})`;
        }
      }
    });

    return signature;
  }

  /**
   * Type guard to check if a node is a function-like node
   */
  private isFunctionLikeNode(node: BabelNode): node is FunctionLikeNode {
    return (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'ClassMethod'
    );
  }

  /**
   * Extract parameter types
   */
  private extractParameterTypes(ast: ParseResult<t.File>): Array<{ name: string; type: string; optional?: boolean }> {
    const parameters: Array<{ name: string; type: string; optional?: boolean }> = [];

    this.traverseAST(ast, (node: BabelNode) => {
      if (this.isFunctionLikeNode(node)) {
        node.params.forEach((param: ParameterNode) => {
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
  private extractReturnType(ast: ParseResult<t.File>): string {
    let returnType = 'void';

    this.traverseAST(ast, (node: BabelNode) => {
      if (this.isFunctionLikeNode(node)) {
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
  private calculateComplexity(ast: ParseResult<t.File>): number {
    let complexity = 1; // Base complexity

    this.traverseAST(ast, (node: BabelNode) => {
      // Increase complexity for decision points
      if (this.isIfStatementNode(node)) {
        complexity++;
        // Count else-if as additional complexity
        if (node.alternate && node.alternate.type === 'IfStatement') {
          complexity++;
        }
      }
      if (this.isSwitchCaseNode(node) && node.test !== null) complexity++;
      if (node.type === 'ForStatement') complexity++;
      if (node.type === 'ForInStatement') complexity++;
      if (node.type === 'ForOfStatement') complexity++;
      if (node.type === 'WhileStatement') complexity++;
      if (node.type === 'DoWhileStatement') complexity++;
      if (node.type === 'ConditionalExpression') complexity++;
      if (this.isLogicalExpressionNode(node) && node.operator === '&&') complexity++;
      if (this.isLogicalExpressionNode(node) && node.operator === '||') complexity++;
      if (node.type === 'CatchClause') complexity++;
    });

    return complexity;
  }

  /**
   * Type guard for IfStatement node
   */
  private isIfStatementNode(node: BabelNode): node is IfStatementNode {
    return node.type === 'IfStatement';
  }

  /**
   * Type guard for SwitchCase node
   */
  private isSwitchCaseNode(node: BabelNode): node is SwitchCaseNode {
    return node.type === 'SwitchCase';
  }

  /**
   * Type guard for LogicalExpression node
   */
  private isLogicalExpressionNode(node: BabelNode): node is LogicalExpressionNode {
    return node.type === 'LogicalExpression';
  }

  /**
   * Type guard for BinaryExpression node
   */
  private isBinaryExpressionNode(node: BabelNode): node is BinaryExpressionNode {
    return node.type === 'BinaryExpression';
  }

  /**
   * Type guard for ReturnStatement node
   */
  private isReturnStatementNode(node: BabelNode): node is ReturnStatementNode {
    return node.type === 'ReturnStatement';
  }

  /**
   * Type guard for ImportDeclaration node
   */
  private isImportDeclarationNode(node: BabelNode): node is ImportDeclarationNode {
    return node.type === 'ImportDeclaration';
  }

  /**
   * Type guard for CallExpression node
   */
  private isCallExpressionNode(node: BabelNode): node is CallExpressionNode {
    return node.type === 'CallExpression';
  }

  /**
   * Identify patterns in AST
   */
  private identifyPatterns(ast: ParseResult<t.File>): PatternMatch[] {
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
  private extractNodeTypes(ast: ParseResult<t.File>): string[] {
    const types = new Set<string>();
    this.traverseAST(ast, (node: BabelNode) => {
      if (node.type) types.add(node.type);
    });
    return Array.from(types);
  }

  /**
   * Extract dependencies and imports
   */
  private extractDependencies(ast: ParseResult<t.File>): string[] {
    const dependencies: string[] = [];

    this.traverseAST(ast, (node: BabelNode) => {
      if (this.isImportDeclarationNode(node)) {
        dependencies.push(node.source.value);
      }
      if (this.isCallExpressionNode(node) && node.callee.name === 'require') {
        if (node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
          dependencies.push(node.arguments[0].value as string);
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
  private getParamName(param: ParameterNode): string {
    if (param.type === 'Identifier') return param.name || 'unknown';
    if (param.type === 'AssignmentPattern' && param.left) return this.getParamName(param.left);
    if (param.type === 'RestElement' && param.argument) return `...${this.getParamName(param.argument)}`;
    if (param.type === 'ObjectPattern') return '{...}';
    if (param.type === 'ArrayPattern') return '[...]';
    return 'unknown';
  }

  /**
   * Get parameter type
   */
  private getParamType(param: ParameterNode): string {
    if (param.typeAnnotation) {
      return this.getTypeAnnotation(param.typeAnnotation);
    }
    return 'any';
  }

  /**
   * Get type annotation
   */
  private getTypeAnnotation(typeNode: TypeAnnotationNode | null | undefined): string {
    if (!typeNode) return 'any';
    if (typeNode.typeAnnotation) return this.getTypeAnnotation(typeNode.typeAnnotation);
    if (typeNode.type === 'TSStringKeyword') return 'string';
    if (typeNode.type === 'TSNumberKeyword') return 'number';
    if (typeNode.type === 'TSBooleanKeyword') return 'boolean';
    if (typeNode.type === 'TSVoidKeyword') return 'void';
    if (typeNode.type === 'TSAnyKeyword') return 'any';
    if (typeNode.type === 'TSArrayType' && typeNode.elementType) {
      return `${this.getTypeAnnotation(typeNode.elementType)}[]`;
    }
    if (typeNode.type === 'TSPromiseType' && typeNode.typeParameter) {
      return `Promise<${this.getTypeAnnotation(typeNode.typeParameter)}>`;
    }
    return 'unknown';
  }

  /**
   * Infer return type from return statements
   */
  private inferReturnType(node: FunctionLikeNode): string {
    let hasReturn = false;
    let returnType = 'void';

    // Traverse the function body to find return statements
    if (node.body) {
      this.traverseASTNode(node.body, (n: BabelNode) => {
        if (this.isReturnStatementNode(n) && n.argument) {
          hasReturn = true;
          returnType = this.inferTypeFromExpression(n.argument);
        }
      });
    }

    return hasReturn ? returnType : 'void';
  }

  /**
   * Infer type from expression
   */
  private inferTypeFromExpression(expr: ExpressionNode | null | undefined): string {
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
  private hasAsyncPattern(ast: ParseResult<t.File>): boolean {
    let hasAsync = false;
    this.traverseAST(ast, (node: BabelNode) => {
      // Check for async functions or await expressions
      const nodeAsFunction = node as FunctionLikeNode;
      if (nodeAsFunction.async || node.type === 'AwaitExpression') {
        hasAsync = true;
      }
    });
    return hasAsync;
  }

  /**
   * Check for error handling
   */
  private hasErrorHandling(ast: ParseResult<t.File>): boolean {
    let hasErrorHandling = false;
    this.traverseAST(ast, (node: BabelNode) => {
      if (node.type === 'TryStatement' || node.type === 'CatchClause') {
        hasErrorHandling = true;
      }
    });
    return hasErrorHandling;
  }

  /**
   * Check for boundary checks
   */
  private hasBoundaryChecks(ast: ParseResult<t.File>): boolean {
    let hasBoundary = false;
    this.traverseAST(ast, (node: BabelNode) => {
      if (this.isBinaryExpressionNode(node)) {
        if (['>', '<', '>=', '<=', '===', '!=='].includes(node.operator)) {
          hasBoundary = true;
        }
      }
    });
    return hasBoundary;
  }

  /**
   * Traverse AST starting from a ParseResult
   */
  private traverseAST(ast: ParseResult<t.File>, visitor: ASTVisitor): void {
    this.traverseASTNode(ast as unknown as BabelNode, visitor);
  }

  /**
   * Traverse AST starting from any node
   */
  private traverseASTNode(node: BabelNode, visitor: ASTVisitor, depth: number = 0): void {
    if (!node || depth > 100) return;
    visitor(node);

    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          value.forEach((child) => {
            if (child && typeof child === 'object' && 'type' in child) {
              this.traverseASTNode(child as BabelNode, visitor, depth + 1);
            }
          });
        } else if ('type' in value) {
          this.traverseASTNode(value as BabelNode, visitor, depth + 1);
        }
      }
    }
  }
}
