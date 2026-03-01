/**
 * Safe Expression Evaluator
 *
 * Evaluates simple boolean expressions without using eval() or new Function().
 * Security: Prevents code injection by only allowing predefined operators and
 * variable references from a provided context.
 *
 * Supported operations:
 * - Comparisons: ===, !==, ==, !=, >, <, >=, <=
 * - Logical: &&, ||, !
 * - Arithmetic: +, -, *, /, %
 * - Grouping: ()
 * - Literals: numbers, strings (quoted), booleans, null, undefined
 * - Variable access: simple names and dot notation (a.b.c)
 *
 * NOT supported (for security):
 * - Function calls
 * - Array access with computed keys [expr]
 * - Assignment operators
 * - Increment/decrement
 * - Template literals
 * - Regular expressions
 *
 * @module shared/utils/safe-expression-evaluator
 */

// Token types
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'DOT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null | undefined;
  raw: string;
}

// Operator precedence (higher = binds tighter)
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '===': 3,
  '!==': 3,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const BINARY_OPERATORS = new Set(Object.keys(PRECEDENCE));
const UNARY_OPERATORS = new Set(['!', '-', '+']);

/**
 * Tokenize an expression string
 */
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Numbers
    if (/\d/.test(char) || (char === '.' && /\d/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i++];
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num), raw: num });
      continue;
    }

    // Strings (single or double quoted)
    if (char === '"' || char === "'") {
      const quote = char;
      let str = '';
      i++; // Skip opening quote
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          i++; // Skip backslash
          const escaped = expr[i];
          switch (escaped) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case 'r': str += '\r'; break;
            default: str += escaped;
          }
        } else {
          str += expr[i];
        }
        i++;
      }
      i++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str, raw: `${quote}${str}${quote}` });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(char)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) {
        ident += expr[i++];
      }
      if (ident === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, raw: ident });
      } else if (ident === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, raw: ident });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: null, raw: ident });
      } else if (ident === 'undefined') {
        tokens.push({ type: 'UNDEFINED', value: undefined, raw: ident });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: ident, raw: ident });
      }
      continue;
    }

    // Multi-character operators
    const twoChar = expr.slice(i, i + 2);
    const threeChar = expr.slice(i, i + 3);

    if (threeChar === '===' || threeChar === '!==') {
      tokens.push({ type: 'OPERATOR', value: threeChar, raw: threeChar });
      i += 3;
      continue;
    }

    if (twoChar === '==' || twoChar === '!=' || twoChar === '<=' ||
        twoChar === '>=' || twoChar === '&&' || twoChar === '||') {
      tokens.push({ type: 'OPERATOR', value: twoChar, raw: twoChar });
      i += 2;
      continue;
    }

    // Single-character operators and punctuation
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', raw: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', raw: ')' });
      i++;
      continue;
    }
    if (char === '.') {
      tokens.push({ type: 'DOT', value: '.', raw: '.' });
      i++;
      continue;
    }
    if ('+-*/%<>!'.includes(char)) {
      tokens.push({ type: 'OPERATOR', value: char, raw: char });
      i++;
      continue;
    }

    throw new Error(`Unexpected character at position ${i}: ${char}`);
  }

  tokens.push({ type: 'EOF', value: '', raw: '' });
  return tokens;
}

/**
 * Parser for expressions
 */
class Parser {
  private tokens: Token[];
  private pos = 0;
  private context: Record<string, unknown>;

  constructor(tokens: Token[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.context = context;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(`Expected ${type}, got ${token.type}`);
    }
    return this.advance();
  }

  parse(): unknown {
    const result = this.parseExpression(0);
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().raw}`);
    }
    return result;
  }

  private parseExpression(minPrecedence: number): unknown {
    let left = this.parseUnary();

    while (true) {
      const token = this.current();
      if (token.type !== 'OPERATOR' || !BINARY_OPERATORS.has(token.value as string)) {
        break;
      }

      const precedence = PRECEDENCE[token.value as string];
      if (precedence < minPrecedence) {
        break;
      }

      const operator = this.advance().value as string;
      const right = this.parseExpression(precedence + 1);
      left = this.applyBinaryOperator(operator, left, right);
    }

    return left;
  }

  private parseUnary(): unknown {
    const token = this.current();

    if (token.type === 'OPERATOR' && UNARY_OPERATORS.has(token.value as string)) {
      const operator = this.advance().value as string;
      const operand = this.parseUnary();
      return this.applyUnaryOperator(operator, operand);
    }

    return this.parsePrimary();
  }

  private parsePrimary(): unknown {
    const token = this.current();

    switch (token.type) {
      case 'NUMBER':
      case 'STRING':
      case 'BOOLEAN':
      case 'NULL':
      case 'UNDEFINED':
        this.advance();
        return token.value;

      case 'IDENTIFIER':
        return this.parseIdentifier();

      case 'LPAREN':
        this.advance();
        const result = this.parseExpression(0);
        this.expect('RPAREN');
        return result;

      default:
        throw new Error(`Unexpected token: ${token.raw}`);
    }
  }

  private parseIdentifier(): unknown {
    let value: unknown = this.context;
    let name = this.advance().value as string;

    // Get initial value from context
    if (typeof value === 'object' && value !== null && name in value) {
      value = (value as Record<string, unknown>)[name];
    } else {
      value = undefined;
    }

    // Handle dot notation
    while (this.current().type === 'DOT') {
      this.advance(); // consume dot
      const prop = this.expect('IDENTIFIER').value as string;

      if (value !== null && value !== undefined && typeof value === 'object') {
        value = (value as Record<string, unknown>)[prop];
      } else {
        value = undefined;
      }
    }

    return value;
  }

  private applyBinaryOperator(op: string, left: unknown, right: unknown): unknown {
    switch (op) {
      case '===': return left === right;
      case '!==': return left !== right;
      case '==': return left == right;
      case '!=': return left != right;
      case '<': return (left as number) < (right as number);
      case '>': return (left as number) > (right as number);
      case '<=': return (left as number) <= (right as number);
      case '>=': return (left as number) >= (right as number);
      case '&&': return left && right;
      case '||': return left || right;
      case '+': return (left as number) + (right as number);
      case '-': return (left as number) - (right as number);
      case '*': return (left as number) * (right as number);
      case '/': return (left as number) / (right as number);
      case '%': return (left as number) % (right as number);
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }

  private applyUnaryOperator(op: string, operand: unknown): unknown {
    switch (op) {
      case '!': return !operand;
      case '-': return -(operand as number);
      case '+': return +(operand as number);
      default:
        throw new Error(`Unknown unary operator: ${op}`);
    }
  }
}

/**
 * Safely evaluate a boolean expression
 *
 * @param expression - The expression to evaluate
 * @param context - Variables available in the expression
 * @returns The result of the expression
 * @throws Error if the expression is invalid
 *
 * @example
 * ```typescript
 * // Simple comparisons
 * safeEvaluate('status === 200', { status: 200 }); // true
 * safeEvaluate('count > 0', { count: 5 }); // true
 *
 * // Logical operators
 * safeEvaluate('a && b', { a: true, b: false }); // false
 * safeEvaluate('x > 0 || y > 0', { x: -1, y: 5 }); // true
 *
 * // Dot notation
 * safeEvaluate('result.success === true', { result: { success: true } }); // true
 *
 * // Arithmetic
 * safeEvaluate('a + b > 10', { a: 5, b: 7 }); // true
 * ```
 */
export function safeEvaluate(expression: string, context: Record<string, unknown> = {}): unknown {
  if (!expression || typeof expression !== 'string') {
    throw new Error('Expression must be a non-empty string');
  }

  // Security: Reject potentially dangerous patterns
  const dangerousPatterns = [
    /\beval\b/i,
    /\bFunction\b/,
    /\bconstructor\b/,
    /\b__proto__\b/,
    /\bprototype\b/,
    /\bimport\b/,
    /\brequire\b/,
    /\bprocess\b/,
    /\bglobal\b/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\[\s*['"`]/, // Computed property access with string
    /\[.*\]/, // Any computed property access
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(expression)) {
      throw new Error(`Expression contains potentially dangerous pattern: ${expression}`);
    }
  }

  const tokens = tokenize(expression.trim());
  const parser = new Parser(tokens, context);
  return parser.parse();
}

/**
 * Safely evaluate a boolean expression, returning false on error
 *
 * @param expression - The expression to evaluate
 * @param context - Variables available in the expression
 * @param defaultValue - Value to return on error (default: false)
 * @returns The boolean result or default value
 */
export function safeEvaluateBoolean(
  expression: string,
  context: Record<string, unknown> = {},
  defaultValue: boolean = false
): boolean {
  try {
    return Boolean(safeEvaluate(expression, context));
  } catch (error) {
    console.warn(`[SafeEvaluator] Failed to evaluate expression: ${expression}`, error);
    return defaultValue;
  }
}
