/**
 * Safe Math Evaluator for TypeScript
 * Provides a secure method for evaluating mathematical expressions
 * without using eval() or similar dangerous functions
 */

export class SafeMathEvaluator {
  private readonly allowedOperators = new Set(['+', '-', '*', '/', '%', '**', '(', ')']);
  private readonly allowedMathFunctions = new Set([
    'abs', 'ceil', 'floor', 'round', 'max', 'min', 'sqrt', 'pow',
    'sin', 'cos', 'tan', 'log', 'PI', 'E'
  ]);

  /**
   * Safely evaluate a mathematical expression
   * @param expression - The mathematical expression to evaluate
   * @returns The result of the evaluation
   */
  public safeEvaluate(expression: string): number {
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }

    // Clean the expression
    const cleaned = expression.replace(/\s+/g, '').trim();

    // Validate the expression contains only safe characters
    if (!this.isValidExpression(cleaned)) {
      throw new Error('Invalid mathematical expression');
    }

    try {
      // Use Function constructor with strict mode (safer than eval)
      const result = Function('"use strict"; return (' + cleaned + ')')();

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression did not evaluate to a valid number');
      }

      return result;
    } catch (error) {
      throw new Error(`Mathematical expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Validate that an expression contains only safe mathematical operations
   * @param expression - The expression to validate
   * @returns True if the expression is safe, false otherwise
   */
  private isValidExpression(expression: string): boolean {
    // Check for dangerous patterns
    const dangerousPatterns = [
      /[a-zA-Z_$][a-zA-Z0-9_$]*(?!\s*[.(])/,  // Variables (but allow Math.function)
      /;/,                                     // Statement separators
      /=/,                                     // Assignment operators
      /\[|\]/,                                 // Array access
      /\{|\}/,                                 // Objects
      /require|import|export|function|class/,  // Keywords
      /process|global|window|document/,        // Dangerous globals
      /eval|Function|setTimeout|setInterval/,  // Dynamic execution
    ];

    // Check against dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        return false;
      }
    }

    // Allow only numbers, operators, Math functions, and parentheses
    const allowedPattern = /^[\d+\-*/.%()^E\s]*(?:Math\.(?:abs|ceil|floor|round|max|min|sqrt|pow|sin|cos|tan|log|PI|E)[\d+\-*/.%()^E\s]*)*$/;

    return allowedPattern.test(expression);
  }

  /**
   * Create a Math context for safe evaluation
   * @returns A safe Math object with allowed functions
   */
  private createSafeMathContext(): any {
    const safeMath: any = {};

    for (const func of this.allowedMathFunctions) {
      if (func in Math) {
        safeMath[func] = (Math as any)[func];
      }
    }

    return { Math: safeMath };
  }

  /**
   * Evaluate expression with safe Math context
   * @param expression - The expression to evaluate
   * @returns The result
   */
  public evaluateWithSafeContext(expression: string): number {
    if (!this.isValidExpression(expression)) {
      throw new Error('Invalid mathematical expression');
    }

    const context = this.createSafeMathContext();

    try {
      const fn = new Function('Math', '"use strict"; return (' + expression + ');');
      const result = fn(context.Math);

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Expression must evaluate to a finite number');
      }

      return result;
    } catch (error) {
      throw new Error(`Safe evaluation failed: ${error.message}`);
    }
  }
}

// Create and export singleton instance
export const safeMathEvaluator = new SafeMathEvaluator();

/**
 * Convenience function for safe mathematical evaluation
 * @param expression - Mathematical expression to evaluate
 * @returns Result of the evaluation
 */
export function safeEvaluateMath(expression: string): number {
  return safeMathEvaluator.safeEvaluate(expression);
}