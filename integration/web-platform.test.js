import { expect, test } from 'vite-plus/test'
import { commands } from 'vite-plus/test/browser'

import manifest from './web-platform/manifest.json'

const slotReftest = 'scrollIntoView-should-treat-slot-as-scroll-container.html'

test.each(manifest.files.filter((file) => file !== slotReftest))(
  '%s',
  async (file) => {
    await commands.gotoWebPlatformFixture(`/integration/web-platform/${file}`)
    const results = await commands.webPlatformResults()
    expect(results.status).toBe(0)
    expect(results.tests.length).toBeGreaterThan(0)
    expect(results.tests.filter(({ status }) => status !== 0)).toEqual([])
  }
)

test('slotted targets scroll their slot container (upstream reftest)', async () => {
  await commands.gotoWebPlatformFixture(
    `/integration/web-platform/${slotReftest}`
  )
  expect(
    await page.evaluate(
      () =>
        document.querySelector('#host').shadowRoot.querySelector('slot')
          .scrollTop
    )
  ).toBe(200)
})
