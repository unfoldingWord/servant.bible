import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import globals from 'globals';

/**
 * ESLint configuration for servant.bible, copied from bt-servant-worker.
 *
 * Fitness functions (code quality caps), applied to src/, tests/, and scripts/
 * alike so the pre-commit hook and CI agree:
 * - max-lines-per-function: 50 (skip blanks/comments)
 * - max-statements: 25 per function
 * - complexity: 10 (cyclomatic)
 * - max-depth: 4 (nested blocks)
 * - max-nested-callbacks: 3
 * - max-params: 5
 */

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  security.configs.recommended,

  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
    rules: {
      'max-lines-per-function': [
        'error',
        {
          max: 50,
          skipBlankLines: true,
          skipComments: true,
          IIFEs: true,
        },
      ],
      'max-statements': ['error', 25],
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 5],

      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      'no-console': ['warn', { allow: ['warn', 'error'] }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Build-time scripts print their progress; stdout is their output.
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },

  // The router's one structured line per forwarded request (#8) is written
  // with console.log, which Workers Logs captures. Only this file may do so.
  {
    files: ['src/log.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.js', '*.config.ts', '.wrangler/'],
  },
];
