import js from '@eslint/js';
import css from '@eslint/css';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath, URL } from 'node:url';
import tseslint from 'typescript-eslint';

import svelteConfig from './svelte.config.js';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig([
  {
    name: 'pokeamor/ignores',
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  {
    name: 'pokeamor/js-recommended',
    ...js.configs.recommended,
    // `js.configs.recommended` ships without a `files` restriction, so it would
    // also run JS-only rules (e.g. `no-irregular-whitespace`) against `.css`
    // files and crash on the CSS AST. Scope it to JS/TS/Svelte files only.
    files: ['**/*.{js,mjs,cjs,ts,tsx,svelte}'],
  },

  // Type-aware linting only for source files. Plain config/script files are
  // covered by the JavaScript recommended rules above.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx,svelte}'],
  })),

  // The svelte recommended config ships one entry without a `files` restriction
  // (the full `svelte/*` rule set). That entry must not match `.css` files,
  // where the Svelte parser never runs and the rules crash on `parserServices`.
  ...svelte.configs['flat/recommended'].map((config) => {
    if (config.files) return config;
    return {
      ...config,
      files: ['**/*.{svelte,svelte.js,svelte.ts}'],
    };
  }),

  {
    name: 'pokeamor/language-options',
    files: ['**/*.{ts,tsx,svelte}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        // `allowDefaultProject` keeps standalone config files and tests
        // lintable while they are not part of a tsconfig include list.
        // Files that are already covered by a project must NOT be listed here.
        // Tests live in their own tsconfig (tsconfig.test.json), so no
        // allowDefaultProject fallback is needed and the 8-file cap is avoided.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      // TypeScript already reports undefined identifiers, including runes in
      // Svelte components, so `no-undef` only produces false positives here.
      'no-undef': 'off',
    },
  },

  {
    name: 'pokeamor/svelte-typescript',
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
    rules: {
      // Svelte 5 destructures reactive props with `let { ... } = $props()`,
      // which `prefer-const` would wrongly flag as never-reassigned.
      'prefer-const': 'off',
    },
  },

  {
    name: 'pokeamor/imports',
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/extensions': ['.js', '.ts', '.svelte'],
      // Svelte components are opaque to import-x (it reuses the importing
      // file's parser), so cycles are checked across .ts/.js modules instead.
      'import-x/ignore': ['\\.svelte$'],
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
        espree: ['.js', '.mjs', '.cjs'],
      },
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.js', '.ts', '.svelte'],
          alias: {
            '@': [srcDir],
          },
        }),
      ],
    },
    rules: {
      'import-x/no-cycle': 'error',
    },
  },

  {
    name: 'pokeamor/layering',
    // Domain, engines and infrastructure must not depend on Svelte or on
    // Svelte UI components (plan §12 and §14).
    files: [
      'src/domain/**/*.{ts,tsx,js,svelte}',
      'src/engines/**/*.{ts,tsx,js,svelte}',
      'src/infrastructure/**/*.{ts,tsx,js,svelte}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'svelte',
              message: 'Domain, engines and infrastructure must not depend on Svelte.',
            },
            {
              name: 'svelte/store',
              message: 'Domain, engines and infrastructure must not depend on Svelte.',
            },
            {
              name: 'svelte/reactivity',
              message: 'Domain, engines and infrastructure must not depend on Svelte.',
            },
          ],
          patterns: [
            {
              group: ['*.svelte', '**/*.svelte'],
              message: 'Domain, engines and infrastructure must not import Svelte components.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'pokeamor/css',
    files: ['**/*.css'],
    language: 'css/css',
    plugins: { css },
    extends: ['css/recommended'],
    rules: {
      'css/use-baseline': ['error', { available: 'widely' }],
      // Custom properties are defined in `tokens.css` and consumed across
      // files; the linter cannot resolve them cross-file, so allow unknown vars.
      'css/no-invalid-properties': ['error', { allowUnknownVariables: true }],
    },
  },

  ...svelte.configs['flat/prettier'],

  // Must stay last: disables formatting rules that conflict with Prettier.
  prettier,
]);
