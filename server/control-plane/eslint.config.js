import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import requireInternalAuth from './eslint-rules/require-internal-auth.js';

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
      custom: {
        rules: {
          'require-internal-auth': requireInternalAuth,
        },
      },
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',

      // General JavaScript rules
      'no-console': 'off', // Disabled - using no-restricted-syntax instead
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.object.name="console"][callee.property.name=/^(log|info|warn|error|debug)$/]',
          message:
            'Direct console usage is not allowed. Use SystemLogger from "./loggers/SystemLogger.js" instead. For development debugging, use logger.consoleLogDevOnly(). For production logging, use logger.info(), logger.warn(), logger.error(), etc.',
        },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: 'error',
      curly: 'error',

      // Best practices
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Disable style rules that conflict with Prettier
      ...prettierConfig.rules,
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
    files: ['loggers/**/*', 'scripts/**/*'],
    rules: {
      // Allow console usage in the loggers directory and build scripts
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['internal-services/**/*'],
    rules: {
      // Require authentication preHandler for all routes in internal services
      'custom/require-internal-auth': 'error',
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
