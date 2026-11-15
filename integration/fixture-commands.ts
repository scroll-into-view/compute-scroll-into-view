// Browser commands that run in the Vitest process. Every test file opens its
// fixture in a separate top-level page with the 800x600 viewport the tests were
// written for. The tests can't use the iframe that Vitest runs them in, because
// `compute` treats elements inside a frame differently from a top-level page.
/// <reference types="vite-plus/test/browser-playwright" />
import type { Page } from 'playwright'
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

export async function gotoFixture(
  context: BrowserCommandContext,
  path: string
): Promise<void> {
  await close(context)
  const page = await context.context.newPage()
  const fixture: Fixture = { page, errors: [] }
  page.on('pageerror', (error) => fixture.errors.push(error))
  fixtures.set(key(context), fixture)

  await page.setViewportSize({ width: 800, height: 600 })
  const response = await page.goto(new URL(path, context.page.url()).href)
  if (!response?.ok()) {
    throw new Error(`Failed to load ${path}: HTTP ${response?.status()}`)
  }
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
    __VITEST_COVERAGE__?: CoverageMap
  }
}
