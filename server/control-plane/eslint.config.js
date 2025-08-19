import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // General JavaScript rules
      'no-console': 'off', // Allow console logs for server logging
      'no-unused-vars': 'off', // Use TypeScript version instead
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': 'error',
      'curly': 'error',
      
      // Code style rules
      'indent': ['error', 2, { 'SwitchCase': 1 }],
      'quotes': ['error', 'single', { allowTemplateLiterals: true }],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      
      // Best practices
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      // Disable TypeScript-specific rules for pure JavaScript files
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      '*.config.js',
      'test/',
      'coverage/',
      '*.min.js',
    ],
  },
];