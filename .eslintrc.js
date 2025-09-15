module.exports = {
  env: {
    es2021: true,
    node: true,
    jest: true
  },

  // TypeScript parser and plugin for .ts files only
  plugins: ['@typescript-eslint'],

  extends: [
    'eslint:recommended'
  ],

  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },

  // Override settings for different file types
  overrides: [
    {
      // JavaScript files - basic ESLint only
      files: ['*.js'],
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
      },
      rules: {
        // Relaxed rules for JS config files
        'no-unused-vars': 'off'
      }
    },
    {
      // TypeScript files - enhanced rules but relaxed for existing codebase
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: null // Disable project-level type checking for now
      },
      extends: [
        'eslint:recommended'
      ],
      rules: {
        // TypeScript-specific rules (relaxed for existing codebase)
        '@typescript-eslint/no-unused-vars': ['warn', {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
          'ignoreRestSiblings': true
        }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-inferrable-types': 'off', // Allow explicit types
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/consistent-type-imports': 'off', // Allow mixed imports for now
        '@typescript-eslint/prefer-nullish-coalescing': 'off', // Allow || operator
        '@typescript-eslint/prefer-optional-chain': 'off', // Allow traditional syntax

        // Disable base rules that are covered by TypeScript
        'no-unused-vars': 'off',
        'no-undef': 'off',
        'no-redeclare': 'off'
      }
    },
    {
      // Test files - more relaxed rules
      files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
      env: {
        jest: true
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unused-vars': 'off'
      }
    }
  ],

  rules: {
    // JavaScript/General rules (relaxed for existing codebase)
    'indent': ['error', 2, {
      'SwitchCase': 1,
      'ignoredNodes': ['PropertyDefinition']
    }],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
    'semi': ['error', 'always'],
    'no-console': 'off',
    'prefer-const': 'warn', // Changed from error to warn
    'arrow-spacing': 'error',
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'comma-dangle': 'off', // Allow trailing commas for now
    'no-unused-vars': 'warn', // Changed from error to warn
    'no-useless-escape': 'warn' // Changed from error to warn
  },

  // Ignore patterns
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '*.d.ts'
  ]
};