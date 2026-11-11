const fs = require('fs')
const path = require('path')
const manifest = require('./web-platform/manifest.json')
const root = path.join(__dirname, 'web-platform')
const bundle = fs.readFileSync(
  path.join(__dirname, '../dist/index.cjs'),
  'utf8'
)

beforeAll(async () => {
  // Inject the built engine before any upstream test scripts run, including in
  // same-origin child frames. The upstream test sources remain unchanged.
  await page.evaluateOnNewDocument(`(() => {
    const exports = {};
    ${bundle}
    Element.prototype.scrollIntoView = function(options) {
      const normalized = options === false ? {block: 'end'} :
        typeof options === 'object' ? options : {};
      const actions = exports.compute(this, {block: 'start', inline: 'nearest', ...normalized});
      for (const {el, top, left} of actions) el.scroll({top, left, behavior: 'instant'});
    };
  })()`)
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/resources/')) {
      const file = path.join(root, url.pathname)
      const body = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      request.respond({
        contentType: 'application/javascript',
        body:
          body +
          (url.pathname.endsWith('testharness.js')
            ? `
          add_completion_callback((tests, status) => {
            window.wptResults = {status: status.status, tests: tests.map(t => ({
              name: t.name, status: t.status, message: t.message
            }))};
          });`
            : ''),
      })
    } else {
      request.continue()
    }
  })
})

for (const file of manifest.files) {
  if (file === 'scrollIntoView-should-treat-slot-as-scroll-container.html')
    continue
  test(file, async () => {
    await page.goto(`http://localhost:3000/integration/web-platform/${file}`)
    await page.waitForFunction('window.wptResults !== undefined')
    const results = await page.evaluate(() => window.wptResults)
    expect(results.status).toBe(0)
    expect(results.tests.length).toBeGreaterThan(0)
    expect(results.tests.filter((test) => test.status !== 0)).toEqual([])
  })
}

test('slotted targets scroll their slot container (upstream reftest)', async () => {
  await page.goto(
    'http://localhost:3000/integration/web-platform/scrollIntoView-should-treat-slot-as-scroll-container.html'
  )
  expect(
    await page.evaluate(
      () =>
        document.querySelector('#host').shadowRoot.querySelector('slot')
          .scrollTop
    )
  ).toBe(200)
})
