beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/scroll_margin')
})

const ScrollLogicalPosition = ['start', 'center', 'end', 'nearest']

describe('scrollMode: always', () => {
  ScrollLogicalPosition.forEach((block) => {
    ScrollLogicalPosition.forEach((inline) => {
      test(`block: ${block}, inline: ${inline}`, async () => {
        const expected = await page.evaluate(
          (options) => {
            const container = document.querySelector('.container')
            container.scrollTo(0, 0)
            document.querySelector('.target').scrollIntoView(options)
            const { scrollLeft, scrollTop } = container
            return { left: scrollLeft, top: scrollTop }
          },
          { block, inline }
        )
        const actual = await page.evaluate(
          (options) => {
            const container = document.querySelector('.container')
            container.scrollTo(0, 0)
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
            (options) => {
              const container = document.querySelector('.container')
              container.scrollTo(
                container.clientWidth * 3,
                container.clientHeight * 3
              )
              document.querySelector('.target').scrollIntoView(options)
              const { scrollLeft, scrollTop } = container
              return { left: scrollLeft, top: scrollTop }
            },
            { block, inline }
          )
          const actual = await page.evaluate(
            (options) => {
              const container = document.querySelector('.container')
              container.scrollTo(
                container.clientWidth * 3,
                container.clientHeight * 3
              )
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
