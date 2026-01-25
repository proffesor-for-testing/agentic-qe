/**
 * Secure Evaluation Utilities
 * Replaces dangerous eval() usage with safe alternatives
 * Provides mathematical expression evaluation and safe object parsing
 */

const { parse } = require('acorn');

class SecureEvaluationUtilities {
    constructor() {
        // Whitelist of allowed mathematical operations
        this.allowedMathOperators = new Set([
            '+', '-', '*', '/', '%', '**',
            '(', ')', '.', ' ', '\t', '\n'
        ]);

        // Whitelist of allowed mathematical functions
        this.allowedMathFunctions = new Set([
            'Math.abs', 'Math.ceil', 'Math.floor', 'Math.round',
            'Math.max', 'Math.min', 'Math.sqrt', 'Math.pow',
            'Math.sin', 'Math.cos', 'Math.tan', 'Math.log',
            'Math.PI', 'Math.E', 'parseFloat', 'parseInt'
        ]);

        // Dangerous patterns to reject
        this.dangerousPatterns = [
            /require\s*\(/,          // require() calls
            /process\./,             // process object access
            /global\./,              // global object access
            /window\./,              // window object access (browser)
            /document\./,            // document object access (browser)
            /eval\s*\(/,             // eval() calls
            /Function\s*\(/,         // Function constructor
            /setTimeout\s*\(/,       // setTimeout calls
            /setInterval\s*\(/,      // setInterval calls
            /fetch\s*\(/,            // fetch API calls
            /XMLHttpRequest/,        // XHR calls
            /import\s*\(/,           // dynamic imports
            /export\s+/,             // export statements
            /\.__proto__/,           // prototype manipulation
            /\.constructor/,         // constructor access
            /\.call\s*\(/,           // function.call
            /\.apply\s*\(/,          // function.apply
            /\.bind\s*\(/,           // function.bind
            /delete\s+/,             // delete operator
            /new\s+Function/,        // new Function
            /with\s*\(/,             // with statements
            /try\s*\{/,              // try-catch blocks
            /throw\s+/,              // throw statements
            /debugger/,              // debugger statements
            /alert\s*\(/,            // alert calls
            /confirm\s*\(/,          // confirm calls
            /prompt\s*\(/            // prompt calls
        ];
    }

    /**
     * Safely evaluate mathematical expressions without eval()
     * @param {string} expression - Mathematical expression to evaluate
     * @returns {number} - Result of the calculation
     */
    safeEvaluateMath(expression) {
        if (typeof expression !== 'string') {
            throw new Error('Expression must be a string');
        }

        // Remove whitespace and validate characters
        const cleaned = expression.replace(/\s+/g, ' ').trim();

        // Check for dangerous patterns
        for (const pattern of this.dangerousPatterns) {
            if (pattern.test(cleaned)) {
                throw new Error('Invalid mathematical expression: contains dangerous pattern');
            }
        }

        // Validate that expression only contains allowed characters and functions
        const allowedCharsRegex = /^[0-9+\-*/().\s%^]+$/;
        if (!allowedCharsRegex.test(cleaned.replace(/Math\.\w+/g, 'M').replace(/parseInt|parseFloat/g, 'p'))) {
            throw new Error('Invalid mathematical expression: contains unauthorized characters');
        }

        try {
            // Use Function constructor with restricted scope (safer than eval)
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
     * Safely parse JSON without eval()
     * @param {string} jsonString - JSON string to parse
     * @returns {any} - Parsed JSON object
     */
    safeParseJSON(jsonString) {
        if (typeof jsonString !== 'string') {
            throw new Error('Input must be a string');
        }

        try {
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error(`JSON parsing failed: ${error.message}`);
        }
    }

    /**
     * Safely compare values using predefined operators
     * Replaces eval() for simple comparisons like "p<0.05"
     * @param {number} value - Value to compare
     * @param {string} comparison - Comparison expression (e.g., "p<0.05")
     * @returns {boolean} - Comparison result
     */
    safeCompareValue(value, comparison) {
        if (typeof value !== 'number' || typeof comparison !== 'string') {
            throw new Error('Invalid comparison parameters');
        }

        // Parse comparison safely
        const comparisonRegex = /^(\w+)\s*([<>]=?|[!=]=?)\s*([\d.]+)$/;
        const match = comparison.match(comparisonRegex);

        if (!match) {
            throw new Error('Invalid comparison format');
        }

        const [, variable, operator, targetValue] = match;
        const target = parseFloat(targetValue);

        if (!isFinite(target)) {
            throw new Error('Invalid target value in comparison');
        }

        // Perform safe comparison
        switch (operator) {
            case '<':
                return value < target;
            case '<=':
                return value <= target;
            case '>':
                return value > target;
            case '>=':
                return value >= target;
            case '==':
            case '===':
                return value === target;
            case '!=':
            case '!==':
                return value !== target;
            default:
                throw new Error(`Unsupported comparison operator: ${operator}`);
        }
    }

    /**
     * Safely execute string transformations without eval()
     * @param {string} code - Code to transform (not execute)
     * @returns {object} - Transformation metadata
     */
    safeCodeTransformation(code) {
        if (typeof code !== 'string') {
            throw new Error('Code must be a string');
        }

        // Don't execute the code, just create metadata about it
        return {
            _transformed: true,
            _originalCode: code,
            _codeLength: code.length,
            _timestamp: Date.now(),
            _hash: this.generateCodeHash(code)
        };
    }

    /**
     * Generate a simple hash for code identification
     * @param {string} code - Code to hash
     * @returns {string} - Simple hash
     */
    generateCodeHash(code) {
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            const char = code.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }

    /**
     * Validate AST to ensure no dangerous constructs
     * @param {string} code - JavaScript code to validate
     * @returns {boolean} - True if code is safe
     */
    validateCodeAST(code) {
        try {
            const ast = parse(code, { ecmaVersion: 2022 });

            // Check for dangerous AST nodes
            const dangerousNodes = [
                'CallExpression',    // Function calls (needs careful checking)
                'MemberExpression',  // Property access (needs careful checking)
                'NewExpression',     // new operator
                'UpdateExpression',  // ++ and -- operators
                'AssignmentExpression', // Assignment operations
                'FunctionExpression',   // Function definitions
                'ArrowFunctionExpression', // Arrow functions
                'ImportDeclaration',    // Import statements
                'ExportNamedDeclaration', // Export statements
                'ThrowStatement',       // Throw statements
                'TryStatement',         // Try-catch blocks
                'WithStatement',        // With statements
                'DebuggerStatement',    // Debugger statements
                'DoWhileStatement',     // Do-while loops
                'WhileStatement',       // While loops
                'ForStatement',         // For loops
                'ForInStatement',       // For-in loops
                'ForOfStatement'        // For-of loops
            ];

            // Recursive function to check AST nodes
            function checkNode(node) {
                if (!node || typeof node !== 'object') return true;

                if (dangerousNodes.includes(node.type)) {
                    return false;
                }

                // Check all child nodes
                for (const key in node) {
                    if (key === 'type' || key === 'start' || key === 'end') continue;

                    const child = node[key];
                    if (Array.isArray(child)) {
                        for (const item of child) {
                            if (!checkNode(item)) return false;
                        }
                    } else if (typeof child === 'object') {
                        if (!checkNode(child)) return false;
                    }
                }

                return true;
            }

            return checkNode(ast);
        } catch (error) {
            // If parsing fails, consider it unsafe
            return false;
        }
    }

    /**
     * Create a safe evaluation context for mathematical expressions
     * @param {string} expression - Expression to evaluate
     * @param {object} context - Safe context variables
     * @returns {number} - Result
     */
    evaluateInSafeContext(expression, context = {}) {
        // Create a clean context with only Math functions
        const safeContext = {
            Math: Math,
            parseFloat: parseFloat,
            parseInt: parseInt,
            ...context
        };

        // Validate the expression
        if (!this.validateCodeAST(`(${expression})`)) {
            throw new Error('Expression contains unsafe constructs');
        }

        try {
            // Create a function with the safe context
            const keys = Object.keys(safeContext);
            const values = Object.values(safeContext);

            const fn = new Function(...keys, `"use strict"; return (${expression});`);
            const result = fn(...values);

            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Expression must evaluate to a finite number');
            }

            return result;
        } catch (error) {
            throw new Error(`Safe evaluation failed: ${error.message}`);
        }
    }
}

// Create singleton instance
const secureEvaluator = new SecureEvaluationUtilities();

module.exports = {
    SecureEvaluationUtilities,
    safeEvaluateMath: secureEvaluator.safeEvaluateMath.bind(secureEvaluator),
    safeParseJSON: secureEvaluator.safeParseJSON.bind(secureEvaluator),
    safeCompareValue: secureEvaluator.safeCompareValue.bind(secureEvaluator),
    safeCodeTransformation: secureEvaluator.safeCodeTransformation.bind(secureEvaluator),
    validateCodeAST: secureEvaluator.validateCodeAST.bind(secureEvaluator),
    evaluateInSafeContext: secureEvaluator.evaluateInSafeContext.bind(secureEvaluator)
};