beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/slot')
})

describe('target slotted into scrollable container in shadow DOM', () => {
  test('block: "nearest"', async () => {
    expect.assertions(3)
    const actual = await page.evaluate(() => {
    return window
      .computeScrollIntoView(document.querySelector('.target'), {
        block: 'nearest',
      })
      .map(window.mapActions)
    })
    expect(actual).toHaveLength(2)
    expect(actual[0]).toMatchObject({ el: 'div.inner-container', left: 0, top: 100 })
    expect(actual).toMatchSnapshot()
  })

  test('block: "start"', async () => {
    expect.assertions(3)
    const windowHeight = await page.evaluate(() => window.innerHeight);
    const actual = await page.evaluate(() => {
      return window
      .computeScrollIntoView(document.querySelector('.target'), {
        block: 'start',
      })
      .map(window.mapActions)
    })
    expect(actual).toHaveLength(2)
    expect(actual[0]).toMatchObject({ el: 'div.inner-container', left: 0, top: windowHeight })
    expect(actual).toMatchSnapshot()
  })
})