import browserslist from 'browserslist'
import { defineConfig } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

import {
  closeFixture,
  evaluateInFixture,
  gotoFixture,
} from './integration/fixture-commands.js'
import {
  closeWebPlatformBrowser,
  runWebPlatformTest,
} from './integration/wpt-commands.js'

// Vendored, unmodified web-platform-tests. scripts/sync-wpt.ts replaces them
const vendoredWpt = 'integration/wpt/upstream/**'

// tsdown doesn't read the `browserslist` field in package.json, so it gets the oldest version of each browser
// that the field resolves to, in the esbuild-style target format
const esbuildNames: Record<string, string> = {
  and_chr: 'chrome',
  and_ff: 'firefox',
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  ios_saf: 'ios',
  opera: 'opera',
  safari: 'safari',
}
const oldest = new Map<string, number>()
for (const entry of browserslist()) {
  const [name, version] = entry.split(' ')
  const esbuildName = esbuildNames[name]
  if (!esbuildName) {
    throw new Error(`Map the browserslist name "${name}" to a tsdown target`)
  }
  // Ranges like "13.0-13.1" start with their oldest version
  const number = parseFloat(version)
  if (number < (oldest.get(esbuildName) ?? Infinity)) {
    oldest.set(esbuildName, number)
  }
}
const target = [...oldest].map(([name, version]) => `${name}${version}`)

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    ignorePatterns: [vendoredWpt],
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
    entry: ['src/index.ts', 'src/middleware.ts'],
    format: 'esm',
    platform: 'neutral',
    // The browserslist baseline in package.json (Baseline 2019) keeps the published bundles compiling away
    // optional chaining and nullish coalescing for Webpack 4 and other older toolchains
    // (scroll-into-view/scroll-into-view-if-needed#1235). Its oldest browser, Edge 18, supports ES2017 syntax but not
    // object rest/spread or optional catch binding, so `pnpm build` runs `es-check es2017` to enforce it.
    // es-check's checkBrowser mode can't be used instead, as it treats Edge 18 as ES5
    target,
    // Declarations come from Oxc, which tsconfig.json's isolatedDeclarations keeps possible. They have no maps,
    // as src/ isn't published for them to point at
    dts: { generator: 'oxc' },
    // Embeds src/index.ts in its sourcesContent
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
      // Chromium turns smooth scrolling off when the OS has animations off, like on GitHub's Windows runners, which
      // makes the web-platform-tests for `behavior: 'smooth'` fail there. The experimental web platform features match
      // the Chrome of wpt.fyi's experimental results
      provider: playwright({
        launchOptions: {
          args: [
            '--enable-smooth-scrolling',
            '--enable-experimental-web-platform-features',
          ],
        },
      }),
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: {
        closeFixture,
        evaluateInFixture,
        gotoFixture,
        closeWebPlatformBrowser,
        runWebPlatformTest,
      },
    },
  },
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 80,
    sortPackageJson: false,
    ignorePatterns: [vendoredWpt],
  },
})
