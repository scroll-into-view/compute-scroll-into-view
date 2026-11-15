---
'compute-scroll-into-view': major
---

`compute(target, options)` is spec-only. The `scrollMode`, `boundary` and `skipOverflowHiddenElements` options are removed, and are middleware instead, with the same behavior. Middleware can also change how scroll containers are found and measured, like `scroll-margin` and `scroll-padding`. `options` is now optional.

```js
import {
  compute,
  boundary,
  onlyIfNeeded,
  skipOverflowHiddenElements,
} from 'compute-scroll-into-view'

// Before: compute(node, { scrollMode: 'if-needed', boundary: list, skipOverflowHiddenElements: true })
compute(node, {
  middleware: [boundary(list), skipOverflowHiddenElements(), onlyIfNeeded()],
})
```

- Put `onlyIfNeeded()` after the other middleware, which is how the options combined.
- The `ScrollMode` type is removed.
