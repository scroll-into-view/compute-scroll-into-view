// Exposes the `page` global that the tests use. It forwards to the commands in
// ./fixture-commands.ts, which drive the fixture in a separate top-level page.
import { afterAll } from 'vite-plus/test'
import { commands } from 'vite-plus/test/browser'

globalThis.page = {
  goto: (path) => commands.gotoFixture(path),
  evaluate: (fn, ...args) => commands.evaluateInFixture(fn.toString(), args),
}

afterAll(async () => {
  // With `vp test --coverage`, merge the fixture page's coverage into this test file's, which Vitest collects
  for (const coverage of await commands.closeFixture()) {
    mergeCoverage(coverage)
  }
})

// Adds istanbul coverage counters to `globalThis.__VITEST_COVERAGE__`
function mergeCoverage(incoming) {
  globalThis.__VITEST_COVERAGE__ ??= {}
  const target = globalThis.__VITEST_COVERAGE__
  for (const [file, data] of Object.entries(incoming)) {
    const existing = target[file]
    if (!existing) {
      target[file] = data
      continue
    }
    for (const id in data.s) existing.s[id] += data.s[id]
    for (const id in data.f) existing.f[id] += data.f[id]
    for (const id in data.b) {
      existing.b[id] = existing.b[id].map((count, i) => count + data.b[id][i])
    }
  }
}
