// Type tests: `vp check` fails when an expected error stops happening, or an accepted call starts to error
import { compute } from '../src/index.js'
import type { Middleware } from '../src/index.js'
import { onlyIfNeeded, selection } from '../src/middleware.js'

declare const element: Element
declare const range: Range
declare const selected: Selection
declare const custom: Middleware
declare const list: Middleware[]
declare const selectionList: ReturnType<typeof selection>[]

// An element target is fine with or without selection()
compute(element)
compute(element, {})
compute(element, { block: 'nearest', middleware: [] })
compute(element, { middleware: [onlyIfNeeded()] })
compute(element, { middleware: [selection()] })
compute(element, { middleware: [selection(range, { align: 'bounds' })] })
compute(element, { middleware: list })
compute(element, { middleware: [custom, selection(), onlyIfNeeded()] })
compute(element, { middleware: [] as const })

// A Range or Selection needs selection() in the middleware, in any position
compute(range, { middleware: [selection()] })
compute(selected, { middleware: [selection()] })
compute(range, { middleware: [selection(), onlyIfNeeded()] })
compute(range, { middleware: [onlyIfNeeded(), selection()] })
compute(selected, {
  middleware: [custom, selection(undefined, { align: 'bounds' })],
})
compute(range, {
  block: 'nearest',
  inline: 'nearest',
  middleware: [selection()],
})
compute(range, { middleware: [...list, selection()] })
compute(range, { middleware: selectionList })

// @ts-expect-error a Range needs the options
compute(range)
// @ts-expect-error without middleware
compute(range, {})
// @ts-expect-error without middleware
compute(range, { block: 'nearest' })
// @ts-expect-error an empty list has no selection()
compute(range, { middleware: [] })
// @ts-expect-error without selection()
compute(range, { middleware: [onlyIfNeeded()] })
// @ts-expect-error without selection()
compute(range, { middleware: [custom] })
// @ts-expect-error a list of middleware might not have selection() in it
compute(range, { middleware: list })
// @ts-expect-error a Selection needs the options
compute(selected)
// @ts-expect-error without middleware
compute(selected, { block: 'nearest' })
// @ts-expect-error without selection()
compute(selected, { middleware: [onlyIfNeeded()] })

// @ts-expect-error a Node is not a target
compute(document.createTextNode('text'))
// @ts-expect-error a Node is not a target
compute(document.createTextNode('text'), { middleware: [selection()] })
