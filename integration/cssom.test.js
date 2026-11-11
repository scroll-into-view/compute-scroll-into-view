beforeEach(async () => {
  await page.goto('http://localhost:3000/integration/overflow_auto')
})

const positions = ['start', 'center', 'end', 'nearest']
for (const padding of [
  '4px 8px 12px 16px',
  '10% 15% 20% 5%',
  'calc(10% + 4px) 8px 12px 16px',
  'min(20%, 30px) max(5%, 12px) clamp(5px, 10%, 40px) 16px',
]) {
  test(`margins and padding together: ${padding}`, async () => {
    const differences = await page.evaluate((padding) => {
      document.body.innerHTML = `<div id="scroller" style="overflow:scroll;width:200px;height:200px;border:7px solid;scroll-padding:${padding}">
        <div style="width:800px;height:800px"><div id="target" style="position:relative;top:300px;left:300px;width:80px;height:60px;scroll-margin:4px 8px 12px 16px"></div></div></div>`
      const scroller = document.querySelector('#scroller')
      const target = document.querySelector('#target')
      const differences = []
      for (const block of ['start', 'center', 'end', 'nearest']) {
        for (const inline of ['start', 'center', 'end', 'nearest']) {
          const options = { block, inline, container: 'nearest' }
          scroller.scrollTo(0, 0)
          target.scrollIntoView(options)
          const expected = {
            top: scroller.scrollTop,
            left: scroller.scrollLeft,
          }
          scroller.scrollTo(0, 0)
          const [actual] = window.computeScrollIntoView(target, options)
          if (
            Math.abs(expected.top - actual.top) > 0.6 ||
            Math.abs(expected.left - actual.left) > 0.6
          ) {
            differences.push({
              block,
              inline,
              expected,
              actual: { top: actual.top, left: actual.left },
            })
          }
        }
      }
      return differences
    }, padding)
    expect(differences).toEqual([])
  })
}

for (const writingMode of [
  'horizontal-tb',
  'vertical-rl',
  'vertical-lr',
  'sideways-rl',
  'sideways-lr',
]) {
  for (const direction of ['ltr', 'rtl']) {
    test(`nested scaled scrolling: ${writingMode} ${direction}`, async () => {
      const differences = await page.evaluate(
        ({ writingMode, direction, positions }) => {
          document.body.innerHTML = `<div id="outer" style="width:250px;height:250px;overflow:scroll;scroll-padding:10px;border:3px solid;transform:scale(0.75);transform-origin:top left">
          <div style="width:1500px;height:1500px;padding:300px;box-sizing:border-box">
          <div id="inner" style="width:200px;height:200px;overflow:scroll;writing-mode:${writingMode};direction:${direction};scroll-padding:4px 8px 12px 16px;border:7px solid">
          <div style="width:1000px;height:1000px;padding:300px;box-sizing:border-box"><div id="target" style="width:80px;height:60px;scroll-margin:4px 8px 12px 16px"></div></div></div></div></div>`
          const frames = ['inner', 'outer'].map((id) =>
            document.getElementById(id)
          )
          const target = document.getElementById('target')
          const differences = []
          for (const block of positions)
            for (const inline of positions) {
              const options = { block, inline, boundary: frames[1] }
              frames.forEach((el) => el.scrollTo(0, 0))
              // The whole subtree is uniformly scaled. CSS scroll offsets must
              // match the unscaled native geometry; this also avoids using old
              // engines' transformed scroll-margin bugs as the expected result.
              frames[1].style.transform = 'none'
              target.scrollIntoView({ block, inline })
              const expected = frames.map((el) => ({
                top: el.scrollTop,
                left: el.scrollLeft,
              }))
              frames.forEach((el) => el.scrollTo(0, 0))
              frames[1].style.transform = 'scale(0.75)'
              const actions = window.computeScrollIntoView(target, options)
              for (const { el, top, left } of actions)
                el.scroll({ top, left, behavior: 'instant' })
              const actual = frames.map((el) => ({
                top: el.scrollTop,
                left: el.scrollLeft,
              }))
              if (
                actual.some(
                  (value, i) =>
                    Math.abs(value.top - expected[i].top) > 1 ||
                    Math.abs(value.left - expected[i].left) > 1
                )
              )
                differences.push({ block, inline, expected, actual })
            }
          return differences
        },
        { writingMode, direction, positions }
      )
      expect(differences).toEqual([])
    })
  }
}

test('if-needed respects padding and checks each ancestor after inner scrolling', async () => {
  const result = await page.evaluate(() => {
    document.body.innerHTML = `<div id="outer" style="height:150px;width:200px;overflow:auto">
      <div style="height:250px"></div><div id="inner" style="height:100px;overflow:auto;scroll-padding-top:20px">
      <div id="target" style="height:20px;scroll-margin-top:5px"></div><div style="height:300px"></div></div><div style="height:300px"></div></div>`
    const target = document.getElementById('target')
    const inner = document.getElementById('inner')
    const outer = document.getElementById('outer')
    const actions = window.computeScrollIntoView(target, {
      scrollMode: 'if-needed',
      block: 'start',
      boundary: outer,
    })
    for (const { el, top, left } of actions) el.scroll({ top, left })
    return {
      inner: inner.scrollTop,
      outer: outer.scrollTop,
      ids: actions.map(({ el }) => el.id),
    }
  })
  expect(result).toEqual({ inner: 0, outer: 245, ids: ['inner', 'outer'] })
})

test('nearest stops at an unoverflowing scroll container', async () => {
  const result = await page.evaluate(() => {
    document.body.innerHTML = `<div style="height:100px;overflow:auto"><div style="height:300px"></div><div id="inner" style="overflow:auto"><div id="target">Target</div></div></div>`
    return window
      .computeScrollIntoView(document.getElementById('target'), {
        container: 'nearest',
      })
      .map(({ el }) => el.id)
  })
  expect(result).toEqual(['inner'])
})
