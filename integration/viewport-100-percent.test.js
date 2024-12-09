beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/viewport-100-percent')
})

describe('scrollMode: if-needed (outside the scrollingElement bounding box)', () => {
  describe('vertical', () => {
    test('completely below the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, 0)
        return window
          .computeScrollIntoView(document.querySelector('.vertical-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('partially below the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, 50)
        return window
          .computeScrollIntoView(document.querySelector('.vertical-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('completely in view', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, window.innerHeight / 2);
        return window
          .computeScrollIntoView(document.querySelector('.vertical-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(0)
      expect(actual).toMatchSnapshot()
    })

    test('partially above the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, window.innerHeight + 50)
        return window
          .computeScrollIntoView(document.querySelector('.vertical-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('completely above the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, window.innerHeight + 100)
        return window
          .computeScrollIntoView(document.querySelector('.vertical-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })
  })

  describe('horizontal', () => {
    test('completely overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(0, 0)
        return window
          .computeScrollIntoView(document.querySelector('.horizontal-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('partially overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(50, 0)
        return window
          .computeScrollIntoView(document.querySelector('.horizontal-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('completely in view', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth / 2, 0);
        return window
          .computeScrollIntoView(document.querySelector('.horizontal-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(0)
      expect(actual).toMatchSnapshot()
    })

    test('partially negative overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth + 50, 0)
        return window
          .computeScrollIntoView(document.querySelector('.horizontal-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('fully negative overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth + 100, 0)
        return window
          .computeScrollIntoView(document.querySelector('.horizontal-scroll .target'), {
            scrollMode: 'if-needed',
          })
          .map(window.mapActions)
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })
  })
})
