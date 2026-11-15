// Runs the vendored web-platform-tests with `compute` behind Element.scrollIntoView, and checks that every test file
// reports what integration/wpt/expectations.json expects, failures included. See integration/wpt/README.md
import { expect, test } from 'vite-plus/test'
import { commands } from 'vite-plus/test/browser'

import expectations from './wpt/expectations.json'
import manifest from './wpt/manifest.json'

// testharness.js times out "long" tests after 60s
const harnessTimeout = 65_000

test.each(manifest.tests)(
  '%s',
  async (path) => {
    const { status, subtests, messages, updated } =
      await commands.runWebPlatformTest(path, harnessTimeout)
    if (updated) return
    // Without an entry, every subtest is expected to pass
    const expected = expectations[path] ?? {
      status: 'OK',
      subtests: Object.fromEntries(
        Object.keys(subtests).map((name) => [name, 'PASS'])
      ),
    }
    expect(
      { status, subtests },
      `Messages: ${JSON.stringify(messages, null, 2)}\n\nIf the change is expected, update the expectations with WPT_UPDATE_EXPECTATIONS=1 vp test integration/wpt.test.js`
    ).toEqual(expected)
  },
  harnessTimeout + 10_000
)
