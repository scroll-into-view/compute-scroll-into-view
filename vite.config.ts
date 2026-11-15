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
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ['src/index.ts'],
    // Emit dist/index.js (ESM) and dist/index.cjs (CJS) to match package.json exports.
    // package.json points both conditions at dist/index.d.ts, so skip an unused index.d.cts.
    format: { esm: {}, cjs: { dts: false } },
    platform: 'neutral',
    // Pinned to ES2019-level targets so the published bundles keep compiling away
    // optional chaining and nullish coalescing for Webpack 4 and other older toolchains
    // (scroll-into-view/scroll-into-view-if-needed#1235). `pnpm build` runs es-check to enforce it.
    target: [
      'chrome79',
      'edge79',
      'firefox72',
      'ios13',
      'node12',
      'opera66',
      'safari13',
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
