beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/viewport')
})

const ScrollLogicalPosition = ['start', 'center', 'end', 'nearest']

describe('scrollMode: always', () => {
  ScrollLogicalPosition.forEach(block => {
    ScrollLogicalPosition.forEach(inline => {
      test(`block: ${block}, inline: ${inline}`, async () => {
        const expected = await page.evaluate(
          options => {
            window.scrollTo(0, 0)
            document.querySelector('.target').scrollIntoView(options)
            const { scrollLeft, scrollTop } = document.scrollingElement
            return { left: scrollLeft, top: scrollTop }
          },
          { block, inline }
        )
        const actual = await page.evaluate(
          options => {
            window.scrollTo(0, 0)
            const [{ left, top }] = window.computeScrollIntoView(
              document.querySelector('.target'),
              options
            )
            return { left, top }
          },
          { block, inline }
        )
        expect(expected).toEqual(actual)
        expect(actual).toMatchSnapshot()

        // The 'nearest' cases can have diff behavior depending on the current scroll position
        if (block === 'nearest' || inline === 'nearest') {
          const expected = await page.evaluate(
            options => {
              window.scrollTo(window.innerWidth * 3, window.innerHeight * 3)
              document.querySelector('.target').scrollIntoView(options)
              const { scrollLeft, scrollTop } = document.scrollingElement
              return { left: scrollLeft, top: scrollTop }
            },
            { block, inline }
          )
          const actual = await page.evaluate(
            options => {
              window.scrollTo(window.innerWidth * 3, window.innerHeight * 3)
              const [{ left, top }] = window.computeScrollIntoView(
                document.querySelector('.target'),
                options
              )
              return { left, top }
            },
            { block, inline }
          )
          expect(expected).toEqual(actual)
          expect(actual).toMatchSnapshot()
        }
      })
    })
  })
})

describe('scrollMode: if-needed', () => {
  describe('vertical', () => {
    test('completely below the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth * 1.5, window.innerHeight)
        return window.computeScrollIntoView(document.querySelector('.target'), {
          scrollMode: 'if-needed',
        })
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('partially below the fold', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth * 1.5, window.innerHeight + 50)
        return window.computeScrollIntoView(document.querySelector('.target'), {
          scrollMode: 'if-needed',
        })
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })
  })

  describe('horizontal', () => {
    test('completely overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth, window.innerHeight * 1.5)
        return window.computeScrollIntoView(document.querySelector('.target'), {
          scrollMode: 'if-needed',
        })
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })

    test('partially overflowing', async () => {
      const actual = await page.evaluate(() => {
        window.scrollTo(window.innerWidth + 50, window.innerHeight * 1.5)
        return window.computeScrollIntoView(document.querySelector('.target'), {
          scrollMode: 'if-needed',
        })
      })
      expect(actual).toHaveLength(1)
      expect(actual).toMatchSnapshot()
    })
  })
})
