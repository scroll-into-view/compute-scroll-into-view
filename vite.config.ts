import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import {
  closeFixture,
  evaluateInFixture,
  gotoFixture,
} from './integration/fixture-commands.js'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    // Listing plugins replaces Oxlint's defaults (eslint, typescript, unicorn, oxc), so they're repeated here
    plugins: [
      'eslint',
      'typescript',
      'unicorn',
      'oxc',
      'import',
      'promise',
      'vitest',
      'jsdoc',
    ],
    // Whole categories, so rules that new Vite+/Oxlint releases add to them apply automatically
    categories: { correctness: 'error', suspicious: 'error', perf: 'error' },
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'typescript/switch-exhaustiveness-check': 'error',
      // The global that Vitest's istanbul coverage provider stores its counters in
      'eslint/no-underscore-dangle': [
        'error',
        { allow: ['__VITEST_COVERAGE__'] },
      ],
    },
    overrides: [
      {
        // These tests snapshot the 'nearest' cases a second time from another scroll position. Snapshot hints or
        // separate tests would rename the existing snapshot keys
        files: [
          'integration/overflow_auto.test.js',
          'integration/viewport.test.js',
        ],
        rules: {
          'vitest/no-conditional-expect': 'off',
          'vitest/prefer-snapshot-hint': 'off',
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'neutral',
    // The targets that @sanity/pkg-utils resolved from the former package.json `browserslist`
    // query ("> 0.2% and supports es6-module and supports es6-module-dynamic-import and not dead",
    // "maintained node versions")
    target: [
      'chrome109',
      'edge154',
      'firefox157',
      'ios16',
      'node22',
      'opera136',
      'safari17',
    ],
    // Declarations come from Oxc, which tsconfig.json's isolatedDeclarations keeps possible.
    // Their maps point at the published src/index.ts
    dts: { generator: 'oxc', sourcemap: true },
    sourcemap: true,
    minify: true,
    // tsdown writes `exports`, plus `main`, `module` and `types` for tools that predate `exports`
    exports: { legacy: true },
    // Fail the build on package.json/exports and type-resolution problems
    publint: true,
    attw: { profile: 'esm-only' },
  },
  test: {
    include: ['integration/**/*.test.js'],
    setupFiles: ['integration/setup.js'],
    coverage: {
      // src/index.ts runs in the fixture pages, not in the test frame that the v8 provider measures. With istanbul,
      // integration/setup.js merges the fixture pages' counters into the report
      provider: 'istanbul',
      include: ['src/**'],
      // The current coverage, rounded down, so it can't drop unnoticed
      thresholds: { statements: 95, branches: 82, functions: 100, lines: 95 },
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: { closeFixture, evaluateInFixture, gotoFixture },
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [],
  },
})
