// Browser commands that run in the Vitest process. Every test file opens its
// fixture in a separate top-level page with the 800x600 viewport the tests were
// written for. The tests can't use the iframe that Vitest runs them in, because
// `compute` treats elements inside a frame differently from a top-level page.
/// <reference types="vite-plus/test/browser-playwright" />
import type { Page } from 'playwright'
import { build } from 'vite-plus'
import type { BrowserCommandContext } from 'vite-plus/test/node'

interface Fixture {
  page: Page
  errors: Error[]
}

const fixtures = new Map<string, Fixture>()

// Every test file has its own fixture page
const key = (context: BrowserCommandContext): string =>
  context.testPath ?? context.sessionId

function getFixture(context: BrowserCommandContext): Fixture {
  const fixture = fixtures.get(key(context))
  if (!fixture) {
    throw new Error('Load a fixture with `page.goto()` first')
  }
  if (fixture.errors.length > 0) {
    throw fixture.errors[0]
  }
  return fixture
}

// Istanbul coverage counters of fixture pages that were closed, by test file
const closedCoverage = new Map<string, CoverageMap[]>()

async function close(context: BrowserCommandContext): Promise<void> {
  const fixture = fixtures.get(key(context))
  if (!fixture) return
  fixtures.delete(key(context))
  // With `vp test --coverage`, src/index.ts runs instrumented in the fixture page, which Vitest doesn't collect
  // from. Keep its counters so the test file can merge them into its own
  const coverage = await fixture.page.evaluate(() => window.__VITEST_COVERAGE__)
  if (coverage) {
    closedCoverage.set(key(context), [
      ...(closedCoverage.get(key(context)) ?? []),
      coverage,
    ])
  }
  await fixture.page.close()
}

export async function closeFixture(
  context: BrowserCommandContext
): Promise<CoverageMap[]> {
  await close(context)
  const coverage = closedCoverage.get(key(context)) ?? []
  closedCoverage.delete(key(context))
  return coverage
}

async function open(context: BrowserCommandContext): Promise<Page> {
  await close(context)
  const page = await context.context.newPage()
  const fixture: Fixture = { page, errors: [] }
  page.on('pageerror', (error) => fixture.errors.push(error))
  fixtures.set(key(context), fixture)
  await page.setViewportSize({ width: 800, height: 600 })
  return page
}

async function load(
  context: BrowserCommandContext,
  page: Page,
  path: string
): Promise<void> {
  const response = await page.goto(new URL(path, context.page.url()).href)
  if (!response?.ok()) {
    throw new Error(`Failed to load ${path}: HTTP ${response?.status()}`)
  }
}

export async function gotoFixture(
  context: BrowserCommandContext,
  path: string
): Promise<void> {
  const page = await open(context)
  await load(context, page, path)
  const ready = await page.evaluate(
    () => typeof window.computeScrollIntoView === 'function'
  )
  if (!ready) {
    throw new Error(`${path} did not load integration/utils.js`)
  }
  getFixture(context)
}

export async function evaluateInFixture(
  context: BrowserCommandContext,
  source: string,
  args: unknown[]
): Promise<unknown> {
  const { page } = getFixture(context)
  // Call the test's function with its arguments, and JSON-serialize the result
  // like Puppeteer's `page.evaluate` did, which is what the snapshots recorded
  // (DOM nodes become `{}`)
  const result = await page.evaluate(`(async () => {
    const value = await (${source})(...${JSON.stringify(args)})
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  })()`)
  getFixture(context)
  return result
}

// Istanbul's per-file coverage data, keyed by file path
type CoverageMap = Record<string, unknown>

declare global {
  interface Window {
    computeScrollIntoView?: unknown
    wptResults?: WebPlatformResults
    __VITEST_COVERAGE__?: CoverageMap
  }
}

// The engine as a classic script that defines `computeScrollIntoViewEngine`, built once per test run
let engine: Promise<string> | undefined

function bundleEngine(root: string): Promise<string> {
  engine ??= build({
    configFile: false,
    logLevel: 'silent',
    root,
    build: {
      write: false,
      minify: false,
      lib: {
        entry: `${root}/src/index.ts`,
        formats: ['iife'],
        name: 'computeScrollIntoViewEngine',
      },
    },
  }).then((result) => {
    const [output] = Array.isArray(result) ? result : [result]
    if (!output || !('output' in output)) {
      throw new Error('Expected the engine build to return its output')
    }
    return output.output[0].code
  })
  return engine
}

// Makes testharness.js report its results to `window.wptResults`
const reportResults = `
add_completion_callback((tests, status) => {
  window.wptResults = {
    status: status.status,
    tests: tests.map((test) => ({ name: test.name, status: test.status, message: test.message })),
  }
})`

/**
 * Loads a vendored web-platform-tests page with `Element.prototype.scrollIntoView` replaced by the engine, in the
 * page and its same-origin frames, before any upstream script runs. The upstream test sources stay unchanged
 */
export async function gotoWebPlatformFixture(
  context: BrowserCommandContext,
  path: string
): Promise<void> {
  const page = await open(context)
  await page.addInitScript(`(() => {
    ${await bundleEngine(context.project.config.root)}
    Element.prototype.scrollIntoView = function (options) {
      const normalized = options === false ? { block: 'end' } : typeof options === 'object' ? options : {}
      const actions = computeScrollIntoViewEngine.compute(this, { block: 'start', inline: 'nearest', ...normalized })
      for (const { el, top, left } of actions) el.scroll({ top, left, behavior: 'instant' })
    }
  })()`)
  // The upstream pages load the harness from the root of the WPT server, so serve it from the vendored copy
  await page.route(
    (url) => url.pathname.startsWith('/resources/'),
    async (route) => {
      const url = new URL(route.request().url())
      url.pathname = `/integration/web-platform${url.pathname}`
      const response = await route.fetch({ url: url.href })
      const body = response.ok() ? await response.text() : ''
      await route.fulfill({
        contentType: 'application/javascript',
        body: url.pathname.endsWith('/testharness.js')
          ? body + reportResults
          : body,
      })
    }
  )
  await load(context, page, path)
  getFixture(context)
}

interface WebPlatformResults {
  status: number
  tests: { name: string; status: number; message: string | null }[]
}

/** Waits for the loaded web-platform-tests page to finish, and returns its results */
export async function webPlatformResults(
  context: BrowserCommandContext
): Promise<WebPlatformResults> {
  const { page } = getFixture(context)
  await page.waitForFunction(() => window.wptResults !== undefined)
  const results = await page.evaluate(() => window.wptResults)
  if (!results) {
    throw new Error('Expected testharness.js to report results')
  }
  return results
}
