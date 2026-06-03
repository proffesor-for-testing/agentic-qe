module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
    es6: true
  },
  ignorePatterns: [
    '.eslintrc.cjs',
    'dist',
    'node_modules',
    'tests',
    'benchmarks',
    'examples',
    'security',
    // Excluded from tsconfig too — linting it only yields parser errors.
    'src/_archived',
    '**/*.js',
    '**/*.test.ts',
    '**/*.spec.ts'
  ],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // unused-imports auto-removes dead imports (autofixable); the TS rule is
    // disabled to avoid double-reporting. Unused *variables* are still reported
    // (no autofix) so dead locals remain visible without being mass-deleted.
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': ['error', {
      'vars': 'all',
      'varsIgnorePattern': '^_',
      'args': 'after-used',
      'argsIgnorePattern': '^_'
    }],
    '@typescript-eslint/no-inferrable-types': 'off',
    'prefer-const': 'error',
    'no-var': 'error'
  },
};