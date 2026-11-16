// Browser commands that run the vendored web-platform-tests in integration/wpt against `compute`. See
// integration/wpt/README.md
/// <reference types="vite-plus/test/browser-playwright" />
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Rolldown } from 'vite-plus/pack'
import type { BrowserCommandContext } from 'vite-plus/test/node'

import type { Options, ScrollAction } from '../src/index.js'
import { openFixturePage } from './fixture-commands.js'

const wptDir = join(import.meta.dirname, 'wpt')
const upstreamDir = join(wptDir, 'upstream')
const expectationsPath = join(wptDir, 'expectations.json')

// The hosts the upstream tests are written for. Nothing resolves them, every request is answered from upstreamDir
const origin = 'http://web-platform.test'
const isWptHost = (url: URL) =>
  url.protocol === 'http:' && /(^|\.)web-platform\.test$/.test(url.hostname)

const contentTypes: Record<string, string> = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xht': 'application/xhtml+xml',
  '.xhtml': 'application/xhtml+xml',
}

// testharness.js statuses, by their numeric value
const harnessStatuses = ['OK', 'ERROR', 'TIMEOUT', 'PRECONDITION_FAILED']
const subtestStatuses = [
  'PASS',
  'FAIL',
  'TIMEOUT',
  'NOTRUN',
  'PRECONDITION_FAILED',
]

/** What a test file is expected to report, as stored in expectations.json */
interface Expectation {
  status: string
  subtests: Record<string, string>
}

export interface WebPlatformTestResult extends Expectation {
  /** Failure messages, by subtest name, and the harness message under `''` */
  messages: Record<string, string>
  /** Whether WPT_UPDATE_EXPECTATIONS is set, and expectations.json now records this result */
  updated: boolean
}

interface HarnessReport {
  status: number
  message: string | null
  tests: { name: string; status: number; message: string | null }[]
}

declare global {
  interface Window {
    wptReport?: HarnessReport
  }
}

// testharnessreport.js is the upstream hook for vendors to collect results. The vendored copy stays unmodified, this
// is appended as it's served. Subtest names can repeat, the later ones get a numbered suffix
const reportResults = `
add_completion_callback((tests, status) => {
  window.wptReport = {
    status: status.status,
    message: status.message,
    tests: tests.map((test) => ({ name: test.name, status: test.status, message: test.message })),
  }
})`

/**
 * The parts of `Element.scrollIntoView()` that are outside of "scroll a target into view", which is what `compute`
 * implements. Per https://drafts.csswg.org/cssom-view/#dom-element-scrollintoview it normalizes the arguments, does
 * nothing for elements without a box, and applies the computed scroll positions with the requested behavior.
 * Serialized into every frame of the test page, so it can't use anything from its scope
 */
function installScrollIntoView(
  compute: (target: Element, options: Options) => ScrollAction[]
) {
  type Arg = boolean | (ScrollIntoViewOptions & Pick<Options, 'container'>)
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- serialized on its own, it can't use outer scope
  const results = (promises: unknown[]) =>
    Promise.all(promises).then((values) => ({
      interrupted: values.some(
        (value) =>
          typeof value === 'object' &&
          value !== null &&
          (value as { interrupted?: boolean }).interrupted === true
      ),
    }))
  Element.prototype.scrollIntoView = function scrollIntoView(
    this: Element,
    arg: Arg = {}
  ) {
    let options: ScrollIntoViewOptions & Pick<Options, 'container'> = {}
    if (arg === false) options = { block: 'end' }
    else if (typeof arg === 'object' && arg !== null) options = arg
    const {
      behavior = 'auto',
      block = 'start',
      inline = 'nearest',
      ...rest
    } = options
    if (this.getClientRects().length === 0) return results([])
    const actions = compute(this, {
      ...rest,
      block,
      inline,
      scrollMode: 'always',
    })
    return results(
      actions.map(({ el, top, left }) => el.scroll({ top, left, behavior }))
    )
  }
}

// `compute` as a classic script, built once per run from the module the Vite server serves. With
// `vp test --coverage` that module is instrumented, so the web-platform-tests count towards coverage
let engine: Promise<string> | undefined
function bundleEngine(context: BrowserCommandContext): Promise<string> {
  engine ??= (async () => {
    const url = new URL('/src/index.ts', context.page.url())
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: HTTP ${response.status}`)
    }
    const source = await response.text()
    const { output } = await Rolldown.build({
      input: 'engine',
      write: false,
      platform: 'browser',
      plugins: [
        {
          name: 'engine',
          resolveId: (id) => (id === 'engine' ? id : null),
          load: (id) =>
            id === 'engine' ? { code: source, moduleType: 'js' } : null,
        },
      ],
      output: { format: 'iife', name: 'computeScrollIntoViewEngine' },
    })
    return `${output[0].code}
      ;(${installScrollIntoView.toString()})(computeScrollIntoViewEngine.compute)`
  })()
  return engine
}

const uniqueNames = (tests: HarnessReport['tests']) => {
  const seen = new Map<string, number>()
  return tests.map(({ name }) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} (${count})`
  })
}

async function recordExpectation(path: string, expectation: Expectation) {
  const expectations: Record<string, Expectation> = JSON.parse(
    await readFile(expectationsPath, 'utf8').catch(() => '{}')
  )
  expectations[path] = expectation
  const sorted = Object.fromEntries(
    Object.entries(expectations).toSorted(([a], [b]) => (a < b ? -1 : 1))
  )
  await writeFile(expectationsPath, JSON.stringify(sorted, null, 2) + '\n')
}

/** Runs a vendored web-platform-test, given its path in the WPT repository, with `compute` behind scrollIntoView */
export async function runWebPlatformTest(
  context: BrowserCommandContext,
  path: string,
  timeout: number
): Promise<WebPlatformTestResult> {
  // Uncaught errors are part of what testharness.js reports
  const page = await openFixturePage(context, { trackErrors: false })
  await page.route(isWptHost, async (route) => {
    const { pathname } = new URL(route.request().url())
    const file = join(upstreamDir, decodeURIComponent(pathname))
    const body = await readFile(file).catch(() => null)
    if (!file.startsWith(upstreamDir) || body === null) {
      await route.fulfill({ status: 404, body: `Not vendored: ${pathname}` })
      return
    }
    await route.fulfill({
      contentType: contentTypes[extname(file)] ?? 'application/octet-stream',
      body:
        pathname === '/resources/testharnessreport.js'
          ? body.toString() + reportResults
          : body,
    })
  })
  await page.addInitScript(await bundleEngine(context))
  await page.goto(`${origin}/${path}`)

  const report: HarnessReport = await page
    .waitForFunction(() => window.wptReport, undefined, { timeout })
    .then(async (handle) => {
      const value = await handle.jsonValue()
      if (!value) throw new Error('Expected a report')
      return value
    })
    .catch(() => ({
      status: harnessStatuses.indexOf('TIMEOUT'),
      message: `No results from testharness.js within ${timeout}ms`,
      tests: [],
    }))

  const names = uniqueNames(report.tests)
  const expectation: Expectation = {
    status: harnessStatuses[report.status] ?? String(report.status),
    subtests: Object.fromEntries(
      report.tests.map(({ status }, index) => [
        names[index],
        subtestStatuses[status] ?? String(status),
      ])
    ),
  }
  const messages: Record<string, string> = {}
  if (report.message) messages[''] = report.message
  report.tests.forEach(({ message }, index) => {
    if (message) messages[names[index]] = message
  })

  const updated = Boolean(process.env.WPT_UPDATE_EXPECTATIONS)
  if (updated) await recordExpectation(path, expectation)
  return { ...expectation, messages, updated }
}
