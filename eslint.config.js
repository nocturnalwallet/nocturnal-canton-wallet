// ESLint 9 flat config. Run via `yarn lint`. The setup covers:
//   - typescript-eslint recommended (no-unused-vars, no-explicit-any, etc.)
//   - react-hooks/recommended (exhaustive-deps, rules-of-hooks)
//   - react-refresh (HMR safety under WXT/Vite)
//   - jsx-a11y/recommended (a11y violations in JSX)
//
// Generated files (build/, .output/, node_modules/, dist/) and the WXT
// type-generation directory (.wxt/) are excluded.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'build/**',
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'public/**',
      // Compiled JS output of the signing-relay tool. The source lives at
      // tools/signing-relay/src/; the dist/ tree is generated from it and
      // shouldn't be linted.
      'tools/**/dist/**',
    ],
  },

  // Base recommended JavaScript rules.
  js.configs.recommended,

  // typescript-eslint recommended for .ts / .tsx files.
  ...tseslint.configs.recommended,

  // React + a11y + tailwind, scoped to JSX/TSX.
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // React 19 uses the automatic JSX runtime; no need to import React.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // We use TypeScript for prop validation, not PropTypes.
      'react/prop-types': 'off',

      // React Hooks: catches missing deps + rule-of-hooks violations.
      ...reactHooks.configs.recommended.rules,

      // React-refresh: only export components from .tsx files (HMR-safe).
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // a11y: project-wide accessibility checks on JSX.
      ...jsxA11y.configs.recommended.rules,
    },
  },

  // Files-specific tweaks: tests can use `any` and unused-vars more freely.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Background entry-point + content scripts run in extension contexts that
  // need the chrome.* / webextensions globals but not browser DOM globals
  // everywhere — keep this as-is for now; the browser+webextensions globals
  // above already cover both.

  // Allow underscore-prefixed unused vars (common convention for
  // intentionally-ignored params).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
