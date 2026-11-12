import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import * as fixtureCommands from './integration/fixture-commands.js'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ['src/index.ts'],
    // Emit dist/index.js (ESM) and dist/index.cjs (CJS) to match package.json exports.
    // package.json points both conditions at dist/index.d.ts, so skip an unused index.d.cts.
    format: { esm: {}, cjs: { dts: false } },
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
    // Keep the "use strict" directive that the previous CommonJS output had
    outputOptions: { strict: true },
  },
  test: {
    include: ['integration/**/*.test.js'],
    setupFiles: ['integration/setup.js'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: fixtureCommands,
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
