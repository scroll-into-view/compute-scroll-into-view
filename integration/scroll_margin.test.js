import { beforeAll, describe, expect, test } from 'vite-plus/test'

// The target has `scroll-margin: 20px 30px 40px 50px`, compute() should end up
// in the same place as the native scrollIntoView()
beforeAll(async () => {
  await page.goto('/integration/scroll_margin.html')
})

const ScrollLogicalPosition = ['start', 'center', 'end', 'nearest']

/** Native and computed scroll position, starting from the given position */
const compare = (scrollOptions, startAt) =>
  page.evaluate(
    ({ options, from }) => {
      const container = document.querySelector('.container')
      const target = document.querySelector('.target')
      const start = from === 'end' ? 3 : 0
      const reset = () =>
        container.scrollTo(
          container.clientWidth * start,
          container.clientHeight * start
        )

      reset()
      target.scrollIntoView(options)
      const expected = { left: container.scrollLeft, top: container.scrollTop }

      reset()
      const [{ left, top }] = window.computeScrollIntoView(target, options)
      return { expected, actual: { left, top } }
    },
    { options: scrollOptions, from: startAt }
  )

describe('scroll-margin', () => {
  ScrollLogicalPosition.forEach((block) => {
    ScrollLogicalPosition.forEach((inline) => {
      test(`block: ${block}, inline: ${inline}`, async () => {
        const { expected, actual } = await compare({ block, inline }, 'start')
        expect(actual).toEqual(expected)
      })
    })
  })

  // 'nearest' aligns to a different edge depending on the current scroll position
  ScrollLogicalPosition.forEach((block) => {
    ScrollLogicalPosition.forEach((inline) => {
      if (block !== 'nearest' && inline !== 'nearest') return
      test(`block: ${block}, inline: ${inline}, scrolled past the target`, async () => {
        const { expected, actual } = await compare({ block, inline }, 'end')
        expect(actual).toEqual(expected)
      })
    })
  })
})
